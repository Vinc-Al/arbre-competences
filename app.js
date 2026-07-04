/* =========================================================
   APPLICATION — Arbre de Compétences JDR
   =========================================================
   Logique applicative : parsing CSV, chargement de données,
   rendu de l'arbre, vue maîtrise élémentaire, panneau de
   détail, système de points et déblocage MJ.
   ========================================================= */

function parseCSV(text){
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i=0;i<text.length;i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if(c === '"') inQuotes = true;
      else if(c === ','){ row.push(field); field=''; }
      else if(c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else if(c === '\r'){ /* skip */ }
      else field += c;
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  if(!rows.length) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());

  // Alias de colonnes : le Sheet DATA Système utilise des noms différents
  // du format interne attendu par le code.
  const COLUMN_ALIASES = {
    'tier':          'niveau',     // Sheet: tier → interne: niveau
    'cout_points':   'cout',       // Sheet: cout_points → interne: cout
    'etat_defaut':   'etat',       // Sheet: etat_defaut → interne: etat
    'accessible':    '_accessible', // pas utilisé directement, mais préservé
    'fork':          'parent_id',  // Sheet: fork → interne: parent_id
  };

  return rows.slice(1).filter(r => r.some(c => c.trim() !== '')).map(r => {
    const obj = {};
    headers.forEach((h, idx) => {
      const key = COLUMN_ALIASES[h] || h;
      // Ne pas écraser une valeur déjà remplie (ex: si "niveau" ET "tier" existent tous les deux)
      if(!obj[key]) obj[key] = (r[idx] ?? '').trim();
    });
    obj.niveau = parseInt(obj.niveau, 10) || 0;
    obj.cout   = parseInt(obj.cout, 10) || 0;
    // Si la colonne "ecole" n'existe pas dans le Sheet, la déduire du préfixe de l'ID
    // (evo_ → evocation, abj_ → abjuration, inv_ → invocation, etc.)
    if(!obj.ecole || obj.ecole === 'default'){
      const ID_TO_ECOLE = {
        'evo_': 'evocation',    'abj_': 'abjuration',
        'inv_': 'invocation',   'tra_': 'transmutation',
        'div_': 'divination',   'ill_': 'illusion',
        'ench_':'enchantement', 'nec_': 'necromancie',
      };
      const prefix = Object.keys(ID_TO_ECOLE).find(p => (obj.id||'').startsWith(p));
      obj.ecole = prefix ? ID_TO_ECOLE[prefix] : 'default';
    }
    // Filtrer les lignes qui sont des sections vides (première colonne = texte en majuscules type "TRAIT ÉNERGÉTIQUE")
    if(!obj.id && obj.branche && obj.branche === obj.branche.toUpperCase()) return null;
    return obj;
  }).filter(obj => obj !== null);
}

async function fetchCSV(url){
  const res = await fetch(url, { cache: 'no-store' });
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  const rows = parseCSV(text);
  if(!rows.length) throw new Error('CSV vide');
  return rows;
}

function parseElementsCSV(rows){
  // Builds ELEMENT_THEMES, ELEMENT_CARDS, ELEMENT_MASTERY from the
  // "elements" sheet. Each row is one mastery effect.
  // Colonnes : element_key | element_label | element_color | carte_titre |
  //            carte_intro | tier | tier_nom | effet_id | effet_nom |
  //            branches | description | icone
  //
  // La colonne "icone" accepte : un emoji (🔥), une URL complète
  // (https://.../feu.png) ou un chemin relatif dans le repo (icones/feu.png).
  const themes = {};
  const cards = {};
  const mastery = {};

  rows.forEach(r => {
    const key = r.element_key;
    if(!key) return;
    if(!themes[key]){
      themes[key] = { label: r.element_label || key, color: r.element_color || '#9aa4b8' };
    }
    if(!cards[key]){
      cards[key] = {
        titre: r.carte_titre || key,
        intro: r.carte_intro || '',
        tiers_noms: [],
        regle: r.carte_regle || '',
      };
    }
    if(!mastery[key]) mastery[key] = [[],[],[],[]];
    const tier = parseInt(r.tier, 10);
    if(isNaN(tier) || tier < 0 || tier > 3) return;
    // Nom du tier (Étincelle, Brasier...) — pris sur la 1re ligne de chaque tier
    if(r.tier_nom && !cards[key].tiers_noms[tier]){
      cards[key].tiers_noms[tier] = r.tier_nom;
    }
    if(!r.effet_id) return; // ligne d'en-tête ou vide
    mastery[key][tier].push({
      id: r.effet_id,
      nom: r.effet_nom || r.effet_id,
      branches: r.branches || '*',
      description: r.description || '',
      icone: r.icone || '',   // emoji, URL ou chemin relatif
    });
  });

  return { themes, cards, mastery };
}

function parseCombosCSV(rows){
  // Columns: element_a | element_b | label | color | titre | intro
  const combos = {};
  rows.forEach(r => {
    if(!r.element_a || !r.element_b) return;
    const key = comboKey(r.element_a, r.element_b);
    combos[key] = {
      label: r.label || `${r.element_a} + ${r.element_b}`,
      color: r.color || '#d4af6a',
      titre: r.titre || key,
      intro: r.intro || '',
      tiers: [[],[],[],[]], // combo effects loaded separately from elements sheet (combo_avec column)
    };
  });
  return combos;
}

function parsePlayerSavesCSV(rows){
  // Columns: element_key | tier | effet_id
  // Returns masteryChoices object: `${groupKey}_t${tier}` -> effet_id
  const choices = {};
  rows.forEach(r => {
    if(!r.element_key || r.tier === undefined || r.tier === '') return;
    const tier = parseInt(r.tier, 10);
    if(isNaN(tier)) return;
    choices[`${r.element_key}_t${tier}`] = r.effet_id || null;
  });
  return choices;
}

async function loadData(){
  const statusEl = document.getElementById('source-status');
  const playerName = getPlayerFromURL();
  document.getElementById('player-name').textContent = playerName || '(aucun — démo)';

  let skillsLoaded = false;
  let elementsLoaded = false;

  // ─── 1. COMPÉTENCES depuis DATA_SHEETS (toujours la source de référence) ───
  if(DATA_SHEETS.competences){
    try{
      const rows = await fetchCSV(DATA_SHEETS.competences);
      if(rows.length){ allSkills = rows; skillsLoaded = true; }
    } catch(err){ console.warn('Compétences DATA inaccessibles :', err); }
  }
  if(!skillsLoaded){
    allSkills = DEMO_DATA;
    statusEl.textContent = 'Mode démonstration — Sheet DATA non configuré';
  }

  // ─── 2. SHEET JOUEUR : profil + états (jamais les compétences) ─────────────
  // Format 3 colonnes : type | id | valeur
  //   type=profil : classe / niveau / points_total / points_max / tier_max
  //   type=sort   : id du sort → unlocked/available/locked
  const playerCsvUrl = PLAYER_SHEETS[playerName];
  if(playerCsvUrl){
    try{
      const rows = await fetchCSV(playerCsvUrl);
      const etatMap = {};
      rows.forEach(r => {
        const type = (r.type   || '').trim().toLowerCase();
        const id   = (r.id     || '').trim();
        const val  = (r.valeur || r.etat || r.value || '').trim();
        if(!id) return;
        if(type === 'profil'){
          if(id === 'classe')            playerProfile.classe       = val;
          else if(id === 'niveau')       playerProfile.niveau       = parseInt(val,10)||1;
          else if(id === 'points_total') playerProfile.points_total = parseInt(val,10)||0;
          else if(id === 'points_max')   playerProfile.points_max   = parseInt(val,10)||999;
          else if(id === 'tier_max')     playerProfile.tier_max     = parseInt(val,10)||999;
        } else {
          // type=sort (ou ancien format 2 colonnes sans type)
          if(val) etatMap[id] = val;
        }
      });
      if(Object.keys(etatMap).length > 0){
        allSkills = allSkills.map(s => {
          const e = etatMap[s.id];
          return e ? { ...s, etat: e } : s;
        });
      }
      const badge = document.getElementById('player-class-badge');
      if(badge && playerProfile.classe) badge.textContent = playerProfile.classe;
    } catch(err){ console.warn('Sheet joueur inaccessible :', err); }
  }

  // ─── 3. ÉLÉMENTS depuis DATA_SHEETS ────────────────────────────────────────
  if(DATA_SHEETS.elements){
    try{
      const rows = await fetchCSV(DATA_SHEETS.elements);
      const parsed = parseElementsCSV(rows);
      Object.assign(ELEMENT_THEMES, parsed.themes);
      Object.assign(ELEMENT_CARDS,  parsed.cards);
      Object.assign(ELEMENT_MASTERY, parsed.mastery);
      elementsLoaded = true;
    } catch(err){ console.warn('Éléments inaccessibles :', err); }
  }

  // ─── 4. COMBOS depuis DATA_SHEETS ──────────────────────────────────────────
  if(DATA_SHEETS.combos){
    try{
      const rows = await fetchCSV(DATA_SHEETS.combos);
      Object.assign(ELEMENT_COMBOS, parseCombosCSV(rows));
    } catch(err){ console.warn('Combos inaccessibles :', err); }
  }

  // ─── 5. SAUVEGARDES maîtrise élémentaire ───────────────────────────────────
  const saveUrl = typeof PLAYER_SAVE_SHEETS !== 'undefined' && PLAYER_SAVE_SHEETS[playerName];
  if(saveUrl){
    try{
      const rows = await fetchCSV(saveUrl);
      Object.assign(masteryChoices, parsePlayerSavesCSV(rows));
    } catch(err){ console.warn('Sauvegardes inaccessibles :', err); }
  }

  statusEl.textContent = skillsLoaded
    ? `Données chargées${playerName ? ' pour ' + playerName : ''} ✓`
    : statusEl.textContent;
}

function schoolTheme(key){
  return SCHOOL_THEMES[key] || { ...SCHOOL_THEMES.default, label: key.charAt(0).toUpperCase() + key.slice(1) };
}

function buildSchoolTabs(){
  const seen = new Set();
  schoolsOrder = [];
  allSkills.forEach(s => {
    if(!seen.has(s.ecole)){ seen.add(s.ecole); schoolsOrder.push(s.ecole); }
  });
  if(!currentSchool || !schoolsOrder.includes(currentSchool)){
    currentSchool = schoolsOrder[0] || null;
  }

  const tabsEl = document.getElementById('school-tabs');
  tabsEl.innerHTML = '';
  schoolsOrder.forEach(key => {
    const theme = schoolTheme(key);
    const tab = document.createElement('div');
    tab.className = 'school-tab' + (key === currentSchool ? ' active' : '');
    tab.style.borderBottomColor = key === currentSchool ? theme.color : 'transparent';
    tab.style.color = key === currentSchool ? theme.color : '';
    tab.innerHTML = `<span class="dot" style="background:${theme.color}"></span>${theme.label}`;
    tab.addEventListener('click', () => {
      currentSchool = key;
      masteryBranchFilter = null; // reset: branches differ per school
      buildSchoolTabs();
      applySchoolTheme();
      renderTree();
      if(masteryViewOpen) renderMasteryView();
    });
    tabsEl.appendChild(tab);
  });
}

function applySchoolTheme(){
  const theme = schoolTheme(currentSchool);
  document.getElementById('header-title').textContent = theme.label;
  document.getElementById('header-title').style.color = theme.color;
  document.getElementById('header-title').style.textShadow = `0 0 18px ${theme.glow}`;
}

/* =========================================================
   MENU GLOBAL DE SÉLECTION D'ÉLÉMENTS
   =========================================================
   Règles : au maximum 2 éléments cochés en même temps. Si 1 seul
   est coché, on travaille avec cet élément simple. Si on essaie
   d'en cocher un 2e, la paire doit exister dans ELEMENT_COMBOS
   (clé = comboKey(a,b)) — sinon la sélection est refusée et un
   message s'affiche brièvement.
   ========================================================= */
function elementTheme(key){
  return ELEMENT_THEMES[key] || { label: key, color: '#9aa4b8' };
}

// Returns the "active group" derived from selectedElements:
// either a single element, or a defined 2-element combo.
function getActiveGroup(){
  const keys = Array.from(selectedElements);
  if(keys.length === 0) return null;
  if(keys.length === 1){
    return { type:'single', key: keys[0], theme: elementTheme(keys[0]), card: ELEMENT_CARDS[keys[0]], tiers: ELEMENT_MASTERY[keys[0]] || [[],[],[],[]] };
  }
  // length === 2 (enforced at selection time)
  const key = comboKey(keys[0], keys[1]);
  const combo = ELEMENT_COMBOS[key];
  if(!combo) return null; // shouldn't happen since we block invalid pairs at click time
  return { type:'combo', key, theme: { label: combo.label, color: combo.color }, card: { titre: combo.titre, intro: combo.intro }, tiers: combo.tiers };
}

function showElementMenuWarning(message){
  let warn = document.getElementById('element-menu-warning');
  if(!warn){
    warn = document.createElement('div');
    warn.id = 'element-menu-warning';
    document.getElementById('element-dropdown').appendChild(warn);
  }
  warn.textContent = message;
  warn.classList.add('show');
  clearTimeout(showElementMenuWarning._t);
  showElementMenuWarning._t = setTimeout(() => warn.classList.remove('show'), 2600);
}

function renderElementDropdown(){
  const dropdown = document.getElementById('element-dropdown');
  dropdown.innerHTML = '';
  Object.keys(ELEMENT_THEMES).forEach(key => {
    const theme = elementTheme(key);
    const isSelected = selectedElements.has(key);
    const opt = document.createElement('div');
    opt.className = 'element-option' + (isSelected ? ' selected' : '');
    opt.innerHTML = `
      <span class="dot" style="background:${theme.color}"></span>
      <span>${theme.label}</span>
      <span class="check">✓</span>
    `;
    opt.addEventListener('click', () => {
      if(isSelected){
        selectedElements.delete(key);
      } else {
        if(selectedElements.size === 0){
          selectedElements.add(key);
        } else if(selectedElements.size === 1){
          const other = Array.from(selectedElements)[0];
          const ck = comboKey(other, key);
          if(ELEMENT_COMBOS[ck]){
            selectedElements.add(key);
          } else {
            showElementMenuWarning(`Aucune fusion définie entre ${elementTheme(other).label} et ${theme.label}.`);
            return;
          }
        } else {
          showElementMenuWarning('Maximum 2 éléments à la fois — désélectionne-en un d\'abord.');
          return;
        }
      }
      renderElementDropdown();
      updateElementSelectLabel();
      if(masteryViewOpen) renderMasteryView();
    });
    dropdown.appendChild(opt);
  });
}

function updateElementSelectLabel(){
  const label = document.getElementById('element-select-label');
  const group = getActiveGroup();
  if(!group){
    label.textContent = 'Éléments : aucun';
  } else if(group.type === 'combo'){
    label.textContent = 'Élément : ' + group.theme.label + ' (fusion)';
  } else {
    label.textContent = 'Élément : ' + group.theme.label;
  }
}

document.getElementById('element-select-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('element-dropdown').classList.toggle('open');
});
document.addEventListener('click', (e) => {
  const wrap = document.getElementById('element-select-wrap');
  if(!wrap.contains(e.target)){
    document.getElementById('element-dropdown').classList.remove('open');
  }
});

/* =========================================================
   VUE "MAÎTRISE ÉLÉMENTAIRE"
   =========================================================
   Affiche, pour chaque élément sélectionné dans le menu global,
   une carte avec son intro et ses 4 tiers de maîtrise. Les
   effets proposés à chaque tier sont filtrés selon la branche
   actuellement choisie dans le sélecteur de la vue (qui liste
   les branches de l'école active).
   ========================================================= */
function getBranchesForCurrentSchool(){
  const skills = currentSkills();
  const seen = new Set();
  const list = [];
  skills.forEach(s => {
    const key = s.branche || s.id;
    if(!seen.has(key)){ seen.add(key); list.push(key); }
  });
  return list;
}

function effectAppliesToBranch(effect, brancheKey){
  if(!effect.branches || effect.branches === '*') return true;
  const list = effect.branches.split(',').map(s => s.trim());
  return list.includes(brancheKey);
}

function toggleMasteryView(forceOpen){
  masteryViewOpen = forceOpen !== undefined ? forceOpen : !masteryViewOpen;
  document.getElementById('mastery-view').classList.toggle('open', masteryViewOpen);
  document.getElementById('canvas-wrap').classList.toggle('hidden', masteryViewOpen);
  document.getElementById('mastery-toggle-btn').classList.toggle('active', masteryViewOpen);
  if(masteryViewOpen) renderMasteryView();
}
document.getElementById('mastery-toggle-btn').addEventListener('click', () => toggleMasteryView());

/* État local : tier actuellement affiché dans le diagramme éclaté */
let _masteryActiveTier = 0;

function renderMasteryView(){
  const container = document.getElementById('mastery-view');
  const branches = getBranchesForCurrentSchool();
  if(!masteryBranchFilter || !branches.includes(masteryBranchFilter)){
    masteryBranchFilter = branches[0] || null;
  }

  const group = getActiveGroup();
  if(!group){
    container.innerHTML = `<div class="mastery-empty">Sélectionne un élément dans le menu ci-dessus pour voir sa progression de maîtrise.</div>`;
    return;
  }

  const { key: groupKey, theme, card, tiers } = group;
  const tierNoms = card.tiers_noms || tiers.map((_,i)=>`Tier ${i}`);
  const color = theme.color;
  if(_masteryActiveTier >= tiers.length) _masteryActiveTier = 0;

  let html = '';

  // Navigation des tiers T0→T1→T2→T3
  html += `<div class="mst-tier-nav">`;
  tiers.forEach((_,ti)=>{
    const active = ti === _masteryActiveTier;
    const ckey = `${groupKey}_t${ti}`;
    const hasChoice = !!masteryChoices[ckey] && tiers[ti].some(ef=>ef.id===masteryChoices[ckey]);
    html += `<div class="mst-tier-nav-item ${active?'active':''}" data-tier="${ti}"
      style="${active?`border-color:${color};box-shadow:0 0 12px ${color}55`:hasChoice?`border-color:${color}88`:''}">
      <span class="mst-tier-nav-label" style="${active?`color:${color}`:hasChoice?`color:${color}99`:''}">T${ti}</span>
      <span class="mst-tier-nav-name">${tierNoms[ti]}</span>
      ${hasChoice?`<span class="mst-tier-chosen-dot" style="background:${color}"></span>`:''}
    </div>`;
    if(ti < tiers.length-1){
      html += `<div class="mst-tier-connector" style="background:${hasChoice?color+'66':'#2a3344'}"></div>`;
    }
  });
  html += `</div>`;

  // Titre du tier actif
  html += `<div class="mst-tier-header">
    <span class="mst-tier-title" style="color:${color}">${card.titre} — T${_masteryActiveTier} · ${tierNoms[_masteryActiveTier]}</span>
    <span class="mst-tier-intro">${parseRichText(card.intro)}</span>
  </div>`;

  // Tous les effets du tier sont affichés (plus de filtrage par branche).
  const activeEffects = tiers[_masteryActiveTier];
  const activeCkey = `${groupKey}_t${_masteryActiveTier}`;
  const activeChosen = masteryChoices[activeCkey];

  // Étiquette de branche pour un effet restreint (vide si "*")
  function brancheLabel(ef){
    if(!ef.branches || ef.branches === '*') return '';
    return ef.branches.split(',').map(b => b.trim().replace(/_/g,' ')).join(', ');
  }

  // Diagramme éclaté style D4
  const SVG_W=620, SVG_H=340, CX=SVG_W/2, CY=SVG_H/2;
  const RADIUS=120, NODE_R=26, CENTER_R=42;
  const n = activeEffects.length;

  function getAngle(i,total){
    if(total===1) return -Math.PI/2;
    const span = total<=4 ? Math.PI*1.1 : 2*Math.PI*(total-1)/total;
    const start = -Math.PI/2 - span/2;
    return start + (span/(total-1||1))*i;
  }

  // Fallback emoji si le Sheet ne fournit pas d'icône (colonne "icone" vide)
  const EFFECT_EMOJI_FALLBACK = {
    feu_t0_primal:'🔥', feu_t0_eclats:'🎇', feu_t0_magmatique:'🪨', feu_t0_lame:'⚔️', feu_t0_pyroplastique:'💥',
    feu_t1_incineration:'☄️', feu_t1_brulure:'🔥',
    feu_t2_afflux:'✨', feu_t2_attiser:'🌋',
    feu_t3_conflagration:'🎲', feu_t3_assecher:'🌵', feu_t3_scorie:'⛓️',
  };
  // Retourne l'icône à utiliser pour un effet : priorité au Sheet (ef.icone),
  // sinon fallback emoji, sinon "❓".
  function effectIcon(ef){
    return ef.icone || EFFECT_EMOJI_FALLBACK[ef.id] || '❓';
  }
  // Une icône est une image si c'est une URL ou un chemin avec extension image.
  function iconIsImage(ic){
    if(!ic) return false;
    if(ic.startsWith('http://') || ic.startsWith('https://')) return true;
    return /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(ic);
  }

  const nodes = activeEffects.map((ef,i)=>{
    const a=getAngle(i,n);
    return { ef, nx:CX+RADIUS*Math.cos(a), ny:CY+RADIUS*Math.sin(a), a, isChosen:activeChosen===ef.id };
  });

  html += `<div class="mst-diagram-wrap"><svg class="mst-diagram-svg" viewBox="0 0 ${SVG_W} ${SVG_H}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="glow-${groupKey}"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;

  // Lignes centre→effets
  nodes.forEach(({nx,ny,isChosen})=>{
    html += `<line x1="${CX}" y1="${CY}" x2="${nx}" y2="${ny}"
      stroke="${isChosen?color:'#2a3344'}" stroke-width="${isChosen?2.5:1.5}"
      opacity="${isChosen?0.9:0.4}" ${isChosen?'':'stroke-dasharray="5 4"'}/>`;
  });

  // Nœud central
  html += `<circle cx="${CX}" cy="${CY}" r="${CENTER_R}" fill="#0f1520" stroke="${color}" stroke-width="2.5" filter="url(#glow-${groupKey})"/>
    <text x="${CX}" y="${CY-6}" text-anchor="middle" fill="${color}" font-family="Cinzel,serif" font-size="15" font-weight="bold">T${_masteryActiveTier}</text>
    <text x="${CX}" y="${CY+11}" text-anchor="middle" fill="${color}aa" font-family="Inter,sans-serif" font-size="8.5">${tierNoms[_masteryActiveTier]}</text>`;

  // Nœuds d'effets : cercle avec icône (image ou emoji) au centre, NOM en dehors
  nodes.forEach(({ef,nx,ny,a,isChosen})=>{
    const ic = effectIcon(ef);
    const fc = isChosen ? color+'2e' : '#1b2230';
    const sc = isChosen ? color : '#3a4253';
    const labelDist = NODE_R + 16;
    const lx = nx + Math.cos(a)*labelDist;
    const ly = ny + Math.sin(a)*labelDist;
    const anchor = Math.abs(Math.cos(a)) < 0.35 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end');
    const tc = isChosen ? color : '#c4ccd8';
    // Contenu central : image SVG ou texte emoji
    const iconMarkup = iconIsImage(ic)
      ? `<image href="${ic.replace(/"/g,'&quot;')}" x="${nx-16}" y="${ny-16}" width="32" height="32" preserveAspectRatio="xMidYMid meet"/>`
      : `<text x="${nx}" y="${ny+6}" text-anchor="middle" font-size="18">${ic}</text>`;
    html += `<g class="mst-node-svg" data-eid="${ef.id}" data-ckey="${activeCkey}">
      <circle cx="${nx}" cy="${ny}" r="${NODE_R}" fill="${fc}" stroke="${sc}" stroke-width="${isChosen?2.5:1.5}" ${isChosen?`filter="url(#glow-${groupKey})"`:''}/>
      ${iconMarkup}
      <text x="${lx}" y="${ly+3}" text-anchor="${anchor}" fill="${tc}" font-family="Inter,sans-serif" font-size="10" font-weight="${isChosen?'700':'500'}">${ef.nom}</text>
    </g>`;
  });

  html += `</svg></div>`;

  // Fiches détail
  if(!activeEffects.length){
    html += `<div class="mst-no-effects">Aucun effet disponible pour cette branche à T${_masteryActiveTier}.</div>`;
  } else {
    html += `<div class="mst-effects-row">`;
    activeEffects.forEach(ef=>{
      const isChosen = activeChosen===ef.id;
      const ic = effectIcon(ef);
      const iconMarkup = iconIsImage(ic)
        ? `<img class="mst-effect-icon-img" src="${ic.replace(/"/g,'&quot;')}" alt="">`
        : `<span class="mst-effect-emoji">${ic}</span>`;
      const blabel = brancheLabel(ef);
      html += `<div class="mst-effect-card ${isChosen?'chosen':''}" data-eid="${ef.id}" data-ckey="${activeCkey}"
        style="${isChosen?`border-color:${color};background:color-mix(in srgb,${color} 8%,transparent)`:''}">
        <div class="mst-effect-name" style="${isChosen?`color:${color}`:''}">
          ${iconMarkup}${ef.nom}
          ${isChosen?`<span class="mst-chosen-badge" style="background:${color}">✓</span>`:''}
        </div>
        ${blabel?`<div class="mst-effect-branche">🔗 ${blabel}</div>`:''}
        <div class="mst-effect-desc">${parseRichText(ef.description)}</div>
      </div>`;
    });
    html += `</div>`;
  }

  if(card.regle){
    html += `<div class="mst-regle"><strong>Règle de progression</strong> : ${card.regle}</div>`;
  }

  container.innerHTML = html;

  container.querySelectorAll('.mst-tier-nav-item').forEach(el=>{
    el.addEventListener('click', ()=>{ _masteryActiveTier=parseInt(el.getAttribute('data-tier')); renderMasteryView(); });
  });

  container.querySelectorAll('[data-eid][data-ckey]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const eid=el.getAttribute('data-eid'), ckey=el.getAttribute('data-ckey');
      masteryChoices[ckey] = (masteryChoices[ckey]===eid) ? null : eid;
      renderMasteryView();
      if(typeof savePlayerChoices==='function') savePlayerChoices();
    });
  });
}

/* =========================================================
   SAUVEGARDE AUTOMATIQUE VIA GOOGLE APPS SCRIPT
   =========================================================
   Appelée à chaque changement de choix de maîtrise élémentaire.
   Ne fait rien si APPS_SCRIPT_URL n'est pas configuré.
   ========================================================= */
let _saveDebounceTimer = null;

function savePlayerChoices(){
	
  if(!APPS_SCRIPT_URL) return;
  const playerName = getPlayerFromURL();
  if(!playerName) return;

  // Debounce : attendre 800ms d'inactivité avant d'envoyer,
  // pour éviter de spammer l'API à chaque clic rapide.
  clearTimeout(_saveDebounceTimer);
  _saveDebounceTimer = setTimeout(async () => {
    const statusEl = document.getElementById('source-status');
    statusEl.textContent = 'Sauvegarde en cours…';

    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
		  joueur: playerName,
		  section: 'elementaire',
		  data: masteryChoices,
		  secret: "860970b4b2f5b71b0d47f9f438a2e84cfa195e27dad9643c812e1fa8fbe31d92", // même valeur
		  }),
        redirect: 'follow', // Apps Script redirects on POST
      });
      const json = await res.json();
      if(json.ok){
        statusEl.textContent = 'Sauvegardé ✓';
      } else {
        statusEl.textContent = `Erreur sauvegarde : ${json.error}`;
      }
    } catch(err){
      console.warn('Sauvegarde échouée :', err);
      statusEl.textContent = 'Sauvegarde échouée (hors ligne ?)';
    }
  }, 800);
}

function currentSkills(){
  return allSkills.filter(s => s.ecole === currentSchool);
}

/* =========================================================
   LAYOUT ALGORITHM — horizontal branch rows with branching offshoots
   =========================================================
   Each skill belongs to a "branche" (a named horizontal lineage,
   e.g. "trait_energetique"). Within a branche, skills are ordered
   by "niveau" (0,1,2,3...) and placed left-to-right on the same
   row. A branche can "fork" off an existing node in another
   branche by setting parent_id to that node's id on its OWN
   niveau-0 skill — this draws a dashed connector down to a new
   row that starts just to the right of the parent, and the new
   row is placed directly under (or near) the parent's row so the
   whole thing reads like the reference skill-tree image.

   To get a clean vertical ordering that mimics the reference
   image (root branch on top, its forks right under it, in the
   order they appear, recursively), we do a DFS over the "branche
   graph": branches with no parent_id are roots (one row each,
   evenly stacked top-to-bottom in the order encountered), and a
   branche that forks from another is placed as a child row
   immediately following its parent branche's row (and any of the
   parent's earlier children), pushed down by however many rows
   its own descendant forks need.
*/

function buildBrancheGraph(skills){
  // group skills by branche name
  const byBranche = {};
  skills.forEach(s => {
    const key = s.branche || s.id;
    byBranche[key] = byBranche[key] || [];
    byBranche[key].push(s);
  });
  Object.values(byBranche).forEach(list => list.sort((a,b) => a.niveau - b.niveau));

  // determine, for each branche, its "fork parent": the branche and
  // skill from which it forks (based on the niveau-0 skill's parent_id)
  const brancheParent = {}; // brancheKey -> { brancheKey: parentBrancheKey, parentSkillId }
  const idToBranche = {};
  skills.forEach(s => { idToBranche[s.id] = s.branche || s.id; });

  Object.keys(byBranche).forEach(key => {
    const first = byBranche[key][0];
    if(first && first.parent_id && idToBranche[first.parent_id] && idToBranche[first.parent_id] !== key){
      brancheParent[key] = { parentBranche: idToBranche[first.parent_id], parentSkillId: first.parent_id };
    } else {
      brancheParent[key] = null; // root branche
    }
  });

  // children map: parentBrancheKey -> [childBrancheKey, ...] in first-seen order
  const childrenOf = {};
  const rootBranches = [];
  Object.keys(byBranche).forEach(key => {
    const p = brancheParent[key];
    if(p){
      childrenOf[p.parentBranche] = childrenOf[p.parentBranche] || [];
      childrenOf[p.parentBranche].push(key);
    } else {
      rootBranches.push(key);
    }
  });

  return { byBranche, brancheParent, childrenOf, rootBranches };
}

function buildLayout(skills){
  const { byBranche, brancheParent, childrenOf, rootBranches } = buildBrancheGraph(skills);

  const positions = {};       // id -> {x,y}
  const brancheCol = {};      // brancheKey -> column index (X slot, left to right)
  let nextCol = 0;

  // DFS assigning column indices: root branches left-to-right, fork branches
  // placed to the right of their parent (depth-first), so the tree fans out
  // horizontally while tiers/niveaux progress vertically (top to bottom).
  function assignCols(brancheKey){
    brancheCol[brancheKey] = nextCol++;
    const kids = childrenOf[brancheKey] || [];
    kids.forEach(childKey => assignCols(childKey));
  }
  rootBranches.forEach(rootKey => assignCols(rootKey));

  // y-offset (in tiers) at which a fork branch starts.
  // A branch forking from niveau N of its parent starts at tier N+1.
  const brancheStartTier = {};

  function computeStartTier(brancheKey){
    if(brancheStartTier[brancheKey] !== undefined) return brancheStartTier[brancheKey];
    const parentInfo = brancheParent[brancheKey];
    if(!parentInfo){
      brancheStartTier[brancheKey] = 0;
      return 0;
    }
    const parentBrancheSkills = byBranche[parentInfo.parentBranche] || [];
    const parentSkill = parentBrancheSkills.find(s => s.id === parentInfo.parentSkillId);
    const tier = (parentSkill ? parentSkill.niveau : 0) + 1;
    brancheStartTier[brancheKey] = tier;
    return tier;
  }
  Object.keys(byBranche).forEach(key => computeStartTier(key));

  // Extraire le tier absolu depuis le suffixe numérique de l'ID.
  // Ex: evo_te_0 → 0, evo_lp_1 → 1, evo_lp_2 → 2, evo_tc_5 → 5
  // Cela découple le tier affiché de la colonne "niveau/tier" du Sheet.
  function tierFromId(id){
    const match = (id || '').match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  }

  // place nodes: X = column (branch index), Y = tier extrait de l'ID
  Object.keys(byBranche).forEach(brancheKey => {
    const col = brancheCol[brancheKey];
    const list = byBranche[brancheKey];
    list.forEach(s => {
      const tier = tierFromId(s.id);
      const x = LEFT_PADDING + col * BRANCH_GAP;
      const y = TOP_PADDING + tier * TIER_GAP;
      positions[s.id] = { x, y, brancheKey, col, tier };
    });
  });

  return positions;
}

function renderTree(){
  const skills = currentSkills();
  if(!skills.length){
    document.getElementById('tree-canvas').innerHTML = '<svg id="links"></svg>';
    updatePointsDisplay(skills);
    return;
  }
  const positions = buildLayout(skills);
  const { byBranche, brancheParent, rootBranches } = buildBrancheGraph(skills);
  const canvas = document.getElementById('tree-canvas');

  canvas.innerHTML = '<svg id="links"></svg>';
  const svg = document.getElementById('links');

  let maxX = 0, maxY = 0;
  Object.values(positions).forEach(p => {
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });

  // Root "school" node sits above all root branches, horizontally centred.
  const rootCols = rootBranches.map(k => positions[byBranche[k][0].id].x).filter(x => x !== undefined);
  const rootX = rootCols.length ? (Math.min(...rootCols) + Math.max(...rootCols)) / 2 : LEFT_PADDING;
  const rootY = TOP_PADDING - ROOT_GAP_EXTRA;

  const canvasW = maxX + 180;
  const canvasH = maxY + 180;
  canvas.style.width = canvasW + 'px';
  canvas.style.height = canvasH + 'px';
  svg.setAttribute('width', canvasW);
  svg.setAttribute('height', canvasH);

  const theme = schoolTheme(currentSchool);

  function drawLink(from, to, dashed){
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    let d;
    if(dashed){
      // Fork : coude en L élégant.
      // Si le nœud enfant est sur la même rangée Y (même tier) : ligne horizontale droite.
      // Sinon : sortir horizontalement du parent, puis descendre/monter verticalement vers l'enfant.
      if(Math.abs(from.y - to.y) < 5){
        // Même tier → ligne horizontale
        d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
      } else {
        // Coude : horizontal depuis le parent jusqu'à la colonne du child, puis vertical
        const cornerX = to.x;
        const cornerY = from.y;
        const r = 12; // rayon de l'arrondi
        const dirX = to.x > from.x ? 1 : -1;
        const dirY = to.y > from.y ? 1 : -1;
        // Ligne horizontale → arrondi → ligne verticale
        d = `M ${from.x} ${from.y} L ${cornerX - dirX*r} ${cornerY} Q ${cornerX} ${cornerY} ${cornerX} ${cornerY + dirY*r} L ${to.x} ${to.y}`;
      }
    } else {
      // Intra-branche : ligne droite verticale
      d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', dashed ? '#5a6a8a' : '#3a4a6a');
    path.setAttribute('stroke-width', dashed ? '1.5' : '2');
    path.setAttribute('opacity', dashed ? '0.55' : '0.7');
    if(dashed) path.setAttribute('stroke-dasharray', '5 4');
    svg.appendChild(path);
  }

  // Links within each branche: consecutive tier nodes connected vertically
  Object.keys(byBranche).forEach(brancheKey => {
    const list = byBranche[brancheKey];
    for(let i=0; i<list.length-1; i++){
      const from = positions[list[i].id];
      const to = positions[list[i+1].id];
      if(from && to) drawLink(from, to, false);
    }
  });

  // Fork links (dashed bezier) from parent skill to child branch's first node
  Object.keys(brancheParent).forEach(brancheKey => {
    const info = brancheParent[brancheKey];
    if(!info) return;
    const from = positions[info.parentSkillId];
    const firstChildSkill = byBranche[brancheKey][0];
    const to = firstChildSkill && positions[firstChildSkill.id];
    if(from && to) drawLink(from, to, true);
  });

  // Root school node + connectors down to each root branch's first (tier-0) node
  const rootDiv = document.createElement('div');
  rootDiv.className = 'node root school-root';
  rootDiv.style.left = rootX + 'px';
  rootDiv.style.top = rootY + 'px';
  rootDiv.style.transform = 'translate(-50%, -50%)';
  rootDiv.style.borderColor = theme.color;
  rootDiv.style.boxShadow = `0 0 26px ${theme.glow}`;
  rootDiv.innerHTML = `<span class="icon" style="filter:none;">✦</span>`;
  canvas.appendChild(rootDiv);

  rootBranches.forEach(brancheKey => {
    const firstSkill = byBranche[brancheKey][0];
    const to = positions[firstSkill.id];
    if(to) drawLink({x: rootX, y: rootY}, to, false);
  });

  // draw nodes
  skills.forEach(s => {
    const pos = positions[s.id];
    if(!pos) return;
    const div = document.createElement('div');
    const budgetLocked = isBudgetLocked(s);
    const tierMax = playerProfile.tier_max !== undefined ? playerProfile.tier_max : 999;
    const tierBlocked = s.etat === 'available' && s.niveau > tierMax;
    div.className = 'node ' + (s.etat || 'locked') + ((budgetLocked||tierBlocked) ? ' budget-locked' : '');
    div.style.left = pos.x + 'px';
    div.style.top = pos.y + 'px';
    div.style.transform = 'translate(-50%, -50%)';
    div.style.setProperty('--branche-color', theme.color);
    div.innerHTML = `
      <span class="icon">${renderIcon(s.icone)}</span>
      <span class="node-label">${(s.nom||s.id)}</span>
    `;
    div.addEventListener('click', (e) => { e.stopPropagation(); openPanel(s); });
    div.addEventListener('dblclick', (e) => { e.stopPropagation(); mjUnlock(s); });
    canvas.appendChild(div);
  });

  updatePointsDisplay(skills);
}

/* =========================================================
   RENDU DES ICÔNES
   =========================================================
   La colonne "icone" du Sheet peut contenir :
   - Un emoji direct : 🔥 ⚡ ✨ etc.
   - Une URL complète : https://i.imgur.com/abc.png
   - Un chemin relatif vers une image dans le repo :
     icones/feu.png  (fichier uploadé dans GitHub à côté du HTML)
   La fonction détecte automatiquement lequel utiliser.
   ========================================================= */
function isImageRef(icone){
  if(!icone) return false;
  // URL absolue
  if(icone.startsWith('http://') || icone.startsWith('https://')) return true;
  // Chemin relatif avec extension image connue
  if(/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(icone)) return true;
  return false;
}

function renderIcon(icone){
  if(!icone) return '★';
  if(isImageRef(icone)){
    // Échapper les guillemets pour éviter les injections dans l'attribut src
    const safe = icone.replace(/"/g, '&quot;');
    return `<img class="node-icon-img" src="${safe}" alt="" draggable="false">`;
  }
  // Emoji ou texte simple
  return icone;
}

function getPointsDepenses(skills){
  return (skills || currentSkills())
    .filter(s => s.etat === 'unlocked' && (s.cout || 0) > 0)
    .reduce((sum, s) => sum + (s.cout || 0), 0);
}
function getPointsRestants(){
  return playerProfile.points_total - getPointsDepenses(currentSkills());
}
function isBudgetLocked(skill){
  if(skill.etat !== 'available') return false;
  if(playerProfile.points_total === 0 && playerProfile.points_max === 999) return false;
  return getPointsRestants() < (skill.cout || 0);
}

function updatePointsDisplay(skills){
  const depenses = getPointsDepenses(skills);
  const total = playerProfile.points_total;
  const max = playerProfile.points_max;
  const restants = total - depenses;
  const pct = total > 0 ? Math.min(100, Math.round(depenses / total * 100)) : 0;
  const display = document.getElementById('points-display');
  const bar = document.getElementById('points-bar-fill');

  if(total === 0 && max === 999){
    const unlocked = skills.filter(s => s.etat === 'unlocked').length;
    display.textContent = `${unlocked} / ${skills.length} compétences débloquées`;
    display.className = 'points';
    if(bar) bar.style.width = '0%';
    return;
  }
  display.textContent = `${depenses} / ${total} pts · reste ${restants} (max ${max})`;
  display.className = 'points' + (restants <= 0 ? ' budget-full' : restants <= 2 ? ' budget-warning' : '');
  if(bar){
    bar.style.width = pct + '%';
    bar.className = 'points-bar-fill' + (pct >= 100 ? ' full' : pct >= 80 ? ' almost-full' : '');
  }
}

/* ── Déblocage MJ (double-clic sur un nœud available) ── */
function mjUnlock(skill){
  if(skill.etat !== 'available'){
    showToast(skill.etat === 'unlocked' ? 'Déjà débloqué.' : 'Pas encore accessible.', 'warn');
    return;
  }
  const tierMax = playerProfile.tier_max !== undefined ? playerProfile.tier_max : 999;
  if(skill.niveau > tierMax){
    showToast(`Tier ${skill.niveau} dépasse le maximum (T${tierMax}) pour cette classe.`, 'error');
    return;
  }
  const cout = skill.cout || 0;
  if(cout > 0 && getPointsRestants() < cout){
    showToast(`Points insuffisants : ${getPointsRestants()} restants, ${cout} nécessaires.`, 'error');
    return;
  }
  allSkills = allSkills.map(s => s.id === skill.id ? { ...s, etat: 'unlocked' } : s);
  allSkills = allSkills.map(s => {
    if(s.etat !== 'locked') return s;
    if(s.branche === skill.branche && s.niveau === skill.niveau + 1) return { ...s, etat: 'available' };
    if(s.parent_id === skill.id) return { ...s, etat: 'available' };
    return s;
  });
  renderTree();
  showToast(`✓ ${skill.nom} débloqué (${cout} pt${cout!==1?'s':''})`, 'success');
  saveMjChanges();
}

function showToast(msg, type){
  let t = document.getElementById('mj-toast');
  if(!t){ t = document.createElement('div'); t.id = 'mj-toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'mj-toast show ' + (type || '');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

async function saveMjChanges(){
  const playerName = getPlayerFromURL();
  if(!playerName || typeof APPS_SCRIPT_URL === 'undefined' || !APPS_SCRIPT_URL) return;
  const statusEl = document.getElementById('source-status');
  statusEl.textContent = 'Sauvegarde MJ…';
  try{
    const sortsData = {};
    allSkills.forEach(s => { sortsData[s.id] = s.etat; });
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        joueur: playerName, section: 'sort', data: sortsData,
        secret: typeof SECRET_KEY !== 'undefined' ? SECRET_KEY : '',
      }),
      redirect: 'follow',
    });
    const json = await res.json();
    statusEl.textContent = json.ok ? 'Sauvegardé ✓' : 'Erreur : ' + json.error;
  } catch(err){ statusEl.textContent = 'Sauvegarde échouée'; console.warn(err); }
}

function statusLabel(etat){
  if(etat === 'unlocked') return 'Débloquée';
  if(etat === 'available') return 'Disponible';
  return 'Verrouillée';
}

function formatEffects(effetsRaw){
  if(!effetsRaw || !effetsRaw.trim()) return [];
  return effetsRaw.split(/\n|;/).map(e => e.trim()).filter(Boolean);
}

/* =========================================================
   MINI-LANGAGE DE BALISAGE pour les colonnes "description"
   et "texte_special" du Sheet.

   Dans une cellule, tu peux écrire :
     **texte**             -> texte en gras
     [texte](couleur)       -> texte coloré/italique selon une palette

   Couleurs disponibles : element, feu, glace, soin, poison,
   special, danger (modifiable dans le CSS, classes .color-*)

   Exemple de cellule "description" :
   Vous ciblez une créature que vous pouvez voir, vous lancez une
   **attaque de sort à distance** [élémentaire](element) sur une
   **cible unique**.
   ========================================================= */
function parseRichText(raw){
  if(!raw) return '';
  let safe = raw.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // [texte](couleur)
  safe = safe.replace(/\[([^\]]+)\]\(([a-zA-Z0-9_-]+)\)/g, (m, txt, color) => {
    return `<mark class="color-${color}">${txt}</mark>`;
  });
  // **gras**
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // sauts de ligne : \n -> <br> (fait après l'échappement pour ne pas être neutralisé)
  safe = safe.replace(/\n/g, '<br>');
  return safe;
}

function buildElementalEffectsSection(skill){
  const group = getActiveGroup();
  if(!group) return '';
  const brancheKey = skill.branche || skill.id;
  const { key: groupKey, theme, tiers } = group;

  // Every tier the player has explicitly chosen in the Mastery view shows
  // up on a spell's card — including Tier 0 (forme de dégât) — as long as
  // that choice is relevant to the spell's branche. Nothing is excluded
  // based on the spell's niveau anymore.
  const lines = [];
  tiers.forEach((effects, tierIndex) => {
    const choiceKey = `${groupKey}_t${tierIndex}`;
    const chosenId = masteryChoices[choiceKey];
    if(!chosenId) return; // nothing selected at this tier -> show nothing
    const chosenEffect = effects.find(ef => ef.id === chosenId);
    if(!chosenEffect) return;
    if(!effectAppliesToBranch(chosenEffect, brancheKey)) return; // selected effect isn't relevant to this branch
    lines.push({ tierIndex, effect: chosenEffect });
  });

  if(!lines.length) return '';

  let html = `<div class="elemental-effects-block" style="--ec-color:${theme.color}">
    <div class="elemental-effects-title" style="color:${theme.color}">Effet ${theme.label}</div>`;
  lines.forEach(({ tierIndex, effect }) => {
    html += `<div class="elemental-effect-line">
      <span class="ee-tier">T${tierIndex}</span>
      <span class="ee-name">${effect.nom}</span> : ${parseRichText(effect.description)}
    </div>`;
  });
  html += `</div>`;
  return html;
}

function openPanel(skill){
  document.getElementById('panel-tier').textContent = `${(skill.branche||'').replace(/_/g,' ')} · Coût ${skill.cout} pt${skill.cout===1?'':'s'}`;
  document.getElementById('panel-rank').textContent = `RANK – ${skill.niveau}`;
  document.getElementById('panel-title').textContent = skill.nom || skill.id;

  const forkLabel = skill.parent_id ? skill.parent_id : null;

  // Stat lines with arrow prefix, only shown if the corresponding column is filled
  const statDefs = [
    { key: 'degats', label: 'Dégâts génériques' },
    { key: 'portee', label: 'Portée' },
    { key: 'duree', label: 'Durée' },
    { key: 'action', label: 'Ressource d\'Action' },
  ];
  const statLines = statDefs
    .filter(d => skill[d.key] && skill[d.key].trim().length > 0)
    .map(d => `<div class="rank-stat-line"><span class="arrow">→</span><span class="stat-label">${d.label} :</span> ${parseRichText(skill[d.key])}</div>`)
    .join('');

  const elementalSection = buildElementalEffectsSection(skill);

  const body = document.getElementById('panel-body');
  body.innerHTML = `
    <p class="rank-description">${parseRichText(skill.description) || 'Aucune description fournie.'}</p>
    ${statLines ? `<div class="rank-stats">${statLines}</div>` : ''}
    ${skill.texte_special ? `<div class="rank-special">${parseRichText(skill.texte_special)}</div>` : ''}
    ${elementalSection}
    ${forkLabel ? `<div class="stat-row"><span class="label">S'embranche depuis</span><span>${forkLabel}</span></div>` : ''}
    <span class="status-chip ${skill.etat || 'locked'}">${statusLabel(skill.etat)}</span>
  `;

  const footer = document.getElementById('panel-footer');
  footer.innerHTML = '';

  if(skill.lien_slide && skill.lien_slide.trim().length > 0){
    const a = document.createElement('a');
    a.href = skill.lien_slide;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'slide-link';
    a.innerHTML = '↗ Voir le détail (Google Slide)';
    footer.appendChild(a);
  }

  document.getElementById('panel').classList.add('open');
  document.getElementById('overlay').classList.add('open');
}

function closePanel(){
  document.getElementById('panel').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
}

document.getElementById('panel-close').addEventListener('click', closePanel);
document.getElementById('overlay').addEventListener('click', closePanel);

/* Zoom controls */
function applyZoom(){
  document.getElementById('tree-canvas').style.transform = `scale(${zoomLevel})`;
}
document.getElementById('zoom-in').addEventListener('click', () => {
  zoomLevel = Math.min(2, zoomLevel + 0.15);
  applyZoom();
});
document.getElementById('zoom-out').addEventListener('click', () => {
  zoomLevel = Math.max(0.5, zoomLevel - 0.15);
  applyZoom();
});
document.getElementById('zoom-reset').addEventListener('click', () => {
  zoomLevel = 1;
  applyZoom();
});

/* Drag to pan */
(function enablePan(){
  const wrap = document.getElementById('canvas-wrap');
  let isDown = false, startX, startY, scrollLeft, scrollTop;
  wrap.addEventListener('mousedown', e => {
    isDown = true;
    wrap.classList.add('dragging');
    startX = e.pageX; startY = e.pageY;
    scrollLeft = wrap.scrollLeft; scrollTop = wrap.scrollTop;
  });
  window.addEventListener('mouseup', () => { isDown = false; wrap.classList.remove('dragging'); });
  window.addEventListener('mousemove', e => {
    if(!isDown) return;
    e.preventDefault();
    wrap.scrollLeft = scrollLeft - (e.pageX - startX);
    wrap.scrollTop = scrollTop - (e.pageY - startY);
  });
})();

async function init(){
  await loadData();
  buildSchoolTabs();
  applySchoolTheme();
  renderTree();
  renderElementDropdown();
  updateElementSelectLabel();
}
init();

/* Re-fetch periodically to reflect live edits to the Sheet (every 60s) */
setInterval(async () => {
  const playerName = getPlayerFromURL();
  const hasSource = PLAYER_SHEETS[playerName] || DATA_SHEETS.competences || DATA_SHEETS.elements;
  if(hasSource){
    await loadData();
    buildSchoolTabs();
    applySchoolTheme();
    renderTree();
    if(masteryViewOpen) renderMasteryView();
  }
}, 60000);