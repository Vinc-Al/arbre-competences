/* =========================================================
   APPLICATION — Arbre de Compétences JDR
   =========================================================
   Logique applicative : parsing CSV, chargement de données,
   rendu de l'arbre, vue maîtrise élémentaire, panneau de
   détail, système de points et déblocage MJ.
   ========================================================= */

// Liste des écoles reconnues pour la colonne "groupe" de la maîtrise élémentaire
const MASTERY_ECOLES = ['evocation','abjuration','invocation','transmutation','divination','illusion','enchantement','necromancie'];

// Récupère une icône depuis MASTER_ICONS pour une clé donnée (école, sous-élément, doctrine)
// Retourne null si aucune icône n'est définie.
// Comparaison insensible à la casse et aux accents.
function getMasterIcon(key){
  if(!key || typeof MASTER_ICONS === 'undefined') return null;
  const norm = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return MASTER_ICONS[norm] || MASTER_ICONS[key.toLowerCase()] || null;
}

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

  const parsed = rows.slice(1).filter(r => r.some(c => c.trim() !== '')).map(r => {
    const obj = {};
    headers.forEach((h, idx) => {
      const key = COLUMN_ALIASES[h] || h;
      const val = (r[idx] ?? '').trim();
      if(!obj[key]) obj[key] = val;
      // Préserver la valeur brute de "tier" avant qu'elle soit aliasée en "niveau" et convertie en int
      if(h === 'tier') obj._raw_tier = val;
    });
    return obj;
  });

  // Propager les noms de branche : les lignes avec branche remplie mais
  // sans id sont des en-têtes de section (ex: "TRAIT ÉNERGÉTIQUE").
  // Toutes les lignes suivantes héritent de cette branche jusqu'au
  // prochain en-tête.
  let currentBranche = '';
  const results = [];
  for(const obj of parsed){
    const rawBranche = (obj.branche || '').trim();
    const rawElement = (obj.element || '').trim();
    const hasId = !!(obj.id || '').trim();

    // En-tête de section "branche" (pour le CSV compétences) : "TRAIT ÉNERGÉTIQUE"
    // → propager comme currentBranche, ne PAS inclure dans les résultats
    if(rawBranche && !hasId && !rawElement){
      let clean = rawBranche
        .replace(/\s*\(.*\)\s*/, '')
        .trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/['']/g, '_').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      currentBranche = clean;
      continue;
    }

    // En-tête de section "element" (pour le CSV éléments) : "FEU — Chaleur"
    // → INCLURE dans les résultats pour que parseElementsCSV puisse les traiter
    if(rawElement && !hasId){
      results.push(obj);
      continue;
    }

    if(!hasId) {
      const hasAnyContent = Object.values(obj).some(v => typeof v === 'string' && v.trim());
      if(!hasAnyContent) continue;
    }

    // Assigner la branche propagée si la colonne branche est vide
    if(!obj.branche) obj.branche = currentBranche;

    obj.niveau = parseInt(obj.niveau, 10) || 0;
    obj.cout   = parseInt(obj.cout, 10) || 0;

    // Déduire l'école depuis le préfixe de l'ID si absent
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

    results.push(obj);
  }

  return results;
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
  // Parse le CSV "Elements" du Sheet DATA.
  // Format réel :
  //   Colonne 1 (element) : vide sur les lignes de données, utilisée pour
  //     les en-têtes de section ("FEU — Chaleur", "FROID — Gel", "COMBOS ÉLÉMENTAIRES")
  //     et les sous-en-têtes de combo ("combo_feu_acide").
  //   Colonnes restantes : tier, effet_id, effet_nom, accessible, cout_points,
  //     branches, description, notes, icone
  //
  // Le parseur détecte les en-têtes de section et propage la clé d'élément
  // aux lignes suivantes, exactement comme parseCSV le fait pour les branches.

  // Map de couleurs par défaut par élément (fallback si le Sheet ne spécifie pas)
  const DEFAULT_COLORS = {
    feu:'#e0593f', froid:'#6fa8ff', foudre:'#e0d65f', ombre:'#a99bd1',
    lumiere:'#f3e6a8', necrotique:'#7ea85a', nature:'#5fd685',
    acide:'#8fd14f', arcane_force:'#cdb6f5',
  };

  const themes = {};
  const cards = {};
  const mastery = {};
  const combos = {};

  let currentElementKey = '';
  let currentCardTitle = '';
  let inCombos = false;
  let currentComboKey = '';

  rows.forEach(r => {
    const col0 = (r.element || '').trim();
    const hasEffetId = !!(r.effet_id || '').trim();

    // ── Détection d'en-tête de section ──────────────────────────────────
    if(col0 && !hasEffetId){
      // Sous-en-tête de combo : "combo_feu_acide" (DOIT être testé AVANT le test COMBO général)
      if(inCombos && col0.startsWith('combo_')){
        currentComboKey = col0.trim();
        const parts = currentComboKey.replace('combo_','').split('_');
        if(parts.length >= 2){
          const a = parts[0], b = parts[1];
          const ck = [a,b].sort().join('+');
          if(!combos[ck]){
            combos[ck] = {
              label: (themes[a]?.label||a) + ' + ' + (themes[b]?.label||b),
              color: DEFAULT_COLORS[a] || '#d4af6a',
              titre: currentComboKey,
              intro: '',
              tiers: [[],[],[],[]],
            };
          }
        }
        return;
      }

      // "COMBOS ÉLÉMENTAIRES" ou "COMBOS ÉLÉMENTAIRES - EXEMPLE"
      if(col0.toUpperCase().includes('COMBO')){
        inCombos = true;
        currentComboKey = '';
        return;
      }

      // En-tête d'élément : "FEU — Chaleur" ou "FROID — Gel" ou "ARCANE / FORCE"
      inCombos = false;
      currentComboKey = '';

      // Extraire clé et titre
      let key, title;
      if(col0.includes('—')){
        const parts = col0.split('—').map(s => s.trim());
        key = parts[0]; title = parts[1] || '';
      } else if(col0.includes('-')){
        const parts = col0.split('-').map(s => s.trim());
        key = parts[0]; title = parts[1] || '';
      } else {
        key = col0; title = '';
      }

      // Normaliser la clé (FEU → feu, ARCANE / FORCE → arcane_force)
      currentElementKey = key
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s*\/\s*/g, '_')
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
      currentCardTitle = title || key;

      if(!themes[currentElementKey]){
        // Label avec la première lettre en majuscule
        const label = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
        themes[currentElementKey] = {
          label: label,
          color: DEFAULT_COLORS[currentElementKey] || '#9aa4b8',
        };
      }
      if(!cards[currentElementKey]){
        cards[currentElementKey] = {
          titre: currentCardTitle,
          intro: '',
          tiers_noms: [],
          regle: '',
        };
      }
      if(!mastery[currentElementKey]) mastery[currentElementKey] = [[],[],[],[]];
      return;
    }

    // ── Ligne de données (effet) ────────────────────────────────────────
    if(!hasEffetId) return; // ligne vide

    // Déduire le tier TOUJOURS depuis l'ID (feu_t2_afflux → T2)
    // La colonne "tier" est maintenant utilisée pour le NOM du tier (Étincelle, Brasier...)
    let tier = -1;
    const tierMatch = r.effet_id.match(/_t(\d+)/);
    if(tierMatch) tier = parseInt(tierMatch[1], 10);
    // Fallback : si l'ID n'a pas de _tX_, essayer la colonne tier comme numérique
    if(tier < 0){
      tier = parseInt(r.tier || r.niveau, 10);
    }
    if(isNaN(tier) || tier < 0 || tier > 3) return;

    // Lire le nom du tier depuis la colonne brute "tier" (Étincelle, Brasier, etc.)
    // _raw_tier contient la valeur originale avant conversion en nombre par parseCSV
    const rawTier = (r._raw_tier || '').trim();
    const tierNomFromCol = (rawTier && isNaN(parseInt(rawTier, 10))) ? rawTier : '';
    
    // Déduire l'élément depuis l'ID si pas de section en cours
    let effectElementKey = currentElementKey;
    if(!effectElementKey && !inCombos){
      const idPrefix = r.effet_id.match(/^([a-z]+)_t\d+/);
      if(idPrefix) effectElementKey = idPrefix[1];
    }

    // Stocker le nom du tier (premier rencontré par tier par élément)
    if(tierNomFromCol && effectElementKey && cards[effectElementKey]){
      if(!cards[effectElementKey].tiers_noms) cards[effectElementKey].tiers_noms = [];
      if(!cards[effectElementKey].tiers_noms[tier]){
        cards[effectElementKey].tiers_noms[tier] = tierNomFromCol;
      }
    }

    const effect = {
      id: r.effet_id.trim(),
      nom: (r.effet_nom || r.effet_id || '').trim(),
      branches: (r.branches || '*').trim(),
      description: (r.description || '').trim(),
      icone: (r.icone || '').trim(),
      groupe: (r.groupe || '').trim(),  // groupe pour les cercles multiples par tier
    };

    if(inCombos && currentComboKey){
      // Effet d'une combo
      const parts = currentComboKey.replace('combo_','').split('_');
      if(parts.length >= 2){
        const ck = [parts[0],parts[1]].sort().join('+');
        if(combos[ck]) combos[ck].tiers[tier].push(effect);
      }
    } else if(effectElementKey){
      // Effet d'un élément simple
      if(!mastery[effectElementKey]) mastery[effectElementKey] = [[],[],[],[]];
      mastery[effectElementKey][tier].push(effect);
    }
  });

  return { themes, cards, mastery, combos };
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
    const tier = parseInt(r.tier || r.niveau, 10);
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

  // ─── 2. SHEET JOUEUR : profil + états ──────────────────────────────────────
  // Deux formats supportés :
  //
  // FORMAT VERTICAL (ancien) :
  //   type,id,valeur
  //   profil,classe,Mage
  //   sort,evo_te_0,unlocked
  //
  // FORMAT HORIZONTAL (nouveau) — colonnes par école :
  //   id,valeur,EVOCATION,STATUT EVOCATION,COÛT EVOCATION,INVOCATION,STATUT INVOCATION,...,ELEMENTS,STATUT ELEMENTS
  //   classe,Mage,evo_te_0,unlocked,0,,,,...
  //   niveau,5,evo_te_1,locked,1,,,,...
  //
  // Dans le format horizontal :
  //  - Colonnes A/B : id (nom du champ profil) / valeur (valeur du champ profil)
  //  - Groupes de 3 colonnes par école : ID | STATUT | COÛT
  //  - Une colonne "ELEMENTS" + "STATUT ELEMENTS" à la fin pour les effets élémentaires
  const playerCsvUrl = PLAYER_SHEETS[playerName];
  if(playerCsvUrl){
    try{
      const rows = await fetchCSV(playerCsvUrl);
      const etatMap = {};       // id → état (unlocked/available/locked)
      const coutMap = {};       // id → coût (numérique, override le coût du DATA)
      const masteryChoicesFromSheet = {}; // pour les effets élémentaires

      // Détection du format : si on trouve les colonnes STATUT xxx, c'est horizontal
      const firstRow = rows[0] || {};
      const isHorizontal = Object.keys(firstRow).some(k => /^statut[_ ]/i.test(k) || /^statut$/i.test(k));

      if(isHorizontal){
        // ── Format horizontal ────────────────────────────────────────────
        // Récupérer toutes les colonnes du CSV depuis la première ligne
        const allCols = Object.keys(firstRow);
        // Normaliser les noms de colonnes en minuscules pour la recherche
        function normCol(c){ return c.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

        // Trouver les triplets (idcol, statutcol, coutcol) par école
        const schoolCols = [];
        allCols.forEach(col => {
          const nc = normCol(col);
          // Chercher les colonnes "STATUT xxx" ou "STATUT xxx "
          const m = nc.match(/^statut\s+(.+)$/);
          if(m){
            const school = m[1].trim();
            // La colonne id de cette école est celle qui a le nom "xxx" (sans STATUT/COÛT)
            const idCol = allCols.find(c => normCol(c) === school);
            const coutCol = allCols.find(c => normCol(c) === 'cout ' + school || normCol(c) === 'cout ' + school + ' ' || normCol(c).replace('cout ','cout_') === 'cout_' + school);
            if(idCol) schoolCols.push({ school, idCol, statutCol: col, coutCol });
          }
        });

        // Parcourir toutes les lignes
        rows.forEach(r => {
          // Colonne A/B : profil
          const profilId  = (r.id || '').trim().toLowerCase();
          const profilVal = (r.valeur || '').trim();
          if(profilId && profilVal){
            if(profilId === 'classe')                                     playerProfile.classe       = profilVal;
            else if(profilId === 'niveau')                                playerProfile.niveau       = parseInt(profilVal,10)||1;
            else if(profilId === 'sort_points_total' || profilId === 'points_total')  playerProfile.points_total = parseInt(profilVal,10)||0;
            else if(profilId === 'sort_points_max'   || profilId === 'points_max')    playerProfile.points_max   = parseInt(profilVal,10)||999;
            else if(profilId === 'tier_max')                              playerProfile.tier_max     = parseInt(profilVal,10)||999;
            else if(profilId === 'elements_total')                        playerProfile.elements_total = parseInt(profilVal,10)||0;
            else if(profilId === 'elements_max')                          playerProfile.elements_max   = parseInt(profilVal,10)||10;
          }

          // Colonnes école : parcourir chaque triplet
          schoolCols.forEach(({ school, idCol, statutCol, coutCol }) => {
            const sortId = (r[idCol] || '').trim();
            const statut = (r[statutCol] || '').trim().toLowerCase();
            if(!sortId) return;
            // Effets élémentaires : colonne "ELEMENTS"
            if(/^element/i.test(school)){
              if(statut === 'unlocked') masteryChoicesFromSheet[sortId] = sortId;
              // Rien à faire pour locked (état par défaut)
              return;
            }
            // Sorts d'école
            if(statut) etatMap[sortId] = statut;
            if(coutCol){
              const c = parseInt((r[coutCol] || '').trim(), 10);
              if(!isNaN(c)) coutMap[sortId] = c;
            }
          });
        });

        // Appliquer aux mastery choices élémentaires
        // Format attendu : masteryChoices[element_tX] = effect_id
        Object.keys(masteryChoicesFromSheet).forEach(sortId => {
          // Extraire element et tier depuis l'ID (feu_t0_pur → key = feu_t0)
          const m = sortId.match(/^([a-z]+)_t(\d+)/);
          if(m){
            const key = `${m[1]}_t${m[2]}`;
            masteryChoices[key] = sortId;
          }
        });

      } else {
        // ── Format vertical (ancien) ─────────────────────────────────────
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
            if(val) etatMap[id] = val;
          }
        });
      }

      // Appliquer les états et coûts aux sorts
      if(Object.keys(etatMap).length > 0 || Object.keys(coutMap).length > 0){
        allSkills = allSkills.map(s => {
          const e = etatMap[s.id];
          const c = coutMap[s.id];
          const updated = { ...s };
          if(e) updated.etat = e;
          if(c !== undefined) updated.cout = c;
          return updated;
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
      // Remplacer les données codées en dur par celles du Sheet
      Object.keys(parsed.themes).forEach(k => ELEMENT_THEMES[k] = parsed.themes[k]);
      Object.keys(parsed.cards).forEach(k => ELEMENT_CARDS[k] = parsed.cards[k]);
      Object.keys(parsed.mastery).forEach(k => ELEMENT_MASTERY[k] = parsed.mastery[k]);
      // Les combos sont maintenant dans le même CSV
      if(parsed.combos) Object.keys(parsed.combos).forEach(k => ELEMENT_COMBOS[k] = parsed.combos[k]);
      elementsLoaded = true;
    } catch(err){ console.warn('Éléments inaccessibles :', err); }
  }

  // ─── 4. COMBOS depuis DATA_SHEETS (optionnel, si onglet séparé) ────────────
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

  // ─── 6. MOT DE PASSE MJ + ICÔNES depuis DATA_SHEETS.master ─────────────────
  if(DATA_SHEETS.master){
    try{
      const rows = await fetchCSV(DATA_SHEETS.master);
      console.log('[Master] Rows loaded:', rows.length);
      rows.forEach(r => {
        const id = (r.id || r.parametre || '').trim().toLowerCase();
        const val = (r.valeur || r.value || '').trim();
        if(!id || !val) return;
        if(id === 'mj_password' || id === 'password'){
          mjPassword = val;
          console.log('[Master] MJ password loaded from row:', id);
        } else if(id.startsWith('icon_')){
          const key = id.slice(5);
          MASTER_ICONS[key] = val;
          console.log('[Master] Icon loaded:', key, '=', val.slice(0, 40));
        }
      });
      console.log('[Master] Final: password =', mjPassword ? '(set)' : '(EMPTY!)', '| icons =', Object.keys(MASTER_ICONS).length);
    } catch(err){ console.warn('Master inaccessible :', err); }
  }

  // Activer le mode MJ si le paramètre URL correspond au mot de passe
  const mjParam = getMjFromURL();
  if(mjParam && mjParam === mjPassword){
    isMjMode = true;
  }
  // AVEC joueur → mode joueur (locked masqués, pas de mot de passe)
  // SANS joueur → mode MJ requis (mot de passe demandé à l'entrée)
  if(playerName){
    isMjMode = false; // mode joueur par défaut
  } else {
    // Sans joueur : afficher le prompt MJ au chargement
    if(!isMjMode){
      promptMjPassword();
    }
  }

  updateMjUI();

  statusEl.textContent = skillsLoaded
    ? `Données chargées${playerName ? ' pour ' + playerName : ''} ✓`
    : statusEl.textContent;
}

// Met à jour l'UI du mode MJ/Joueur
function updateMjUI(){
  const badge = document.getElementById('mode-badge');
  const btn = document.getElementById('mj-login-btn');
  if(badge){
    badge.textContent = isMjMode ? 'Mode MJ' : 'Joueur';
    badge.className = 'mode-badge' + (isMjMode ? ' mj' : '');
  }
  if(btn){
    btn.textContent = isMjMode ? '🔓 MJ actif' : '🔐 MJ';
    btn.className = 'mj-login-btn' + (isMjMode ? ' active' : '');
  }
}

// Overlay de mot de passe MJ affiché au chargement (mode sans joueur)
function promptMjPassword(){
  // Créer l'overlay
  const overlay = document.createElement('div');
  overlay.id = 'mj-overlay';
  overlay.innerHTML = `
    <div class="mj-overlay-box">
      <h2>🔐 Accès Maître du Jeu</h2>
      <p>Entrez le mot de passe pour accéder à l'arbre complet.</p>
      <input type="password" id="mj-pw-input" placeholder="Mot de passe MJ" autocomplete="off">
      <div class="mj-overlay-btns">
        <button id="mj-pw-submit">Entrer</button>
      </div>
      <div id="mj-pw-error" class="mj-pw-error"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById('mj-pw-input');
  const submit = document.getElementById('mj-pw-submit');
  const error = document.getElementById('mj-pw-error');

  function tryLogin(){
    const pw = input.value.trim();
    if(!pw) return;
    if(pw === mjPassword){
      isMjMode = true;
      updateMjUI();
      overlay.remove();
      renderTree();
      showToast('Mode MJ activé', 'success');
    } else {
      error.textContent = 'Mot de passe incorrect';
      input.value = '';
      input.focus();
    }
  }

  submit.addEventListener('click', tryLogin);
  input.addEventListener('keydown', e => { if(e.key === 'Enter') tryLogin(); });
  setTimeout(() => input.focus(), 100);
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
    // Vérifier si au moins un choix a été fait dans n'importe quel groupe de ce tier
    const tierEffects = tiers[ti];
    const tierGroups = {};
    tierEffects.forEach(ef => { const gk = ef.groupe || '_default'; if(!tierGroups[gk]) tierGroups[gk]=[]; tierGroups[gk].push(ef); });
    const hasChoice = Object.keys(tierGroups).some(gk => {
      const gi2 = parseGroupe(gk, ti);
      return !!masteryChoices[gi2.ckey] && tierGroups[gk].some(ef=>ef.id===masteryChoices[gi2.ckey]);
    });
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

  // Tous les effets du tier actif
  const activeEffects = tiers[_masteryActiveTier];

  // Étiquette de branche pour un effet restreint
  function brancheLabel(ef){
    if(!ef.branches || ef.branches === '*') return '';
    return ef.branches.split(',').map(b => b.trim().replace(/_/g,' ')).join(', ');
  }

  // Helpers icônes
  const EFFECT_EMOJI_FALLBACK = {
    feu_t0_primal:'🔥', feu_t0_eclats:'🎇', feu_t0_magmatique:'🪨', feu_t0_lame:'⚔️', feu_t0_pyroplastique:'💥',
    feu_t1_incineration:'☄️', feu_t1_brulure:'🔥',
    feu_t2_afflux:'✨', feu_t2_attiser:'🌋',
    feu_t3_conflagration:'🎲', feu_t3_assecher:'🌵', feu_t3_scorie:'⛓️',
  };
  function effectIcon(ef){
    const raw = ef.icone || EFFECT_EMOJI_FALLBACK[ef.id] || '❓';
    return fixDriveUrl(raw);
  }
  function iconIsImage(ic){
    if(!ic) return false;
    if(ic.startsWith('http://') || ic.startsWith('https://')) return true;
    return /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(ic);
  }
  function getAngle(i,total){
    if(total===1) return -Math.PI/2;
    const span = total<=4 ? Math.PI*1.1 : 2*Math.PI*(total-1)/total;
    const start = -Math.PI/2 - span/2;
    return start + (span/(total-1||1))*i;
  }

  // ── Grouper les effets par "groupe" ────────────────────────────────────
  // Format du groupe (3 niveaux hiérarchiques) :
  //   "ecole_souselem_doctrine"  → Ex: evocation_acide_predation (école + sous-élément + doctrine)
  //   "ecole_souselem"            → Ex: evocation_acide          (école + sous-élément, doctrine = principal)
  //   "ecole_doctrine"            → Ex: evocation_predation      (école + doctrine directe, sans sous-élément)
  //   "souselem"                  → Ex: acide                    (pas de restriction d'école)
  //   vide                        → tous dans un seul cercle par défaut
  
  function parseGroupe(gk, tierIdx){
    const t = tierIdx !== undefined ? tierIdx : _masteryActiveTier;
    if(!gk || gk === '_default') return { school: '', souselem: '', doctrine: '', label: '', ckey: `${groupKey}_t${t}` };
    const parts = gk.split('_');
    let school = '', souselem = '', doctrine = '';

    if(parts.length >= 3 && MASTERY_ECOLES.includes(parts[0])){
      // ecole_souselem_doctrine
      school = parts[0];
      souselem = parts[1];
      doctrine = parts.slice(2).join(' ');
    } else if(parts.length === 2 && MASTERY_ECOLES.includes(parts[0])){
      // ecole_souselem (pas de doctrine)
      school = parts[0];
      souselem = parts[1];
    } else if(parts.length === 1){
      // juste un sous-élément
      souselem = parts[0];
    } else {
      // fallback : tout comme label
      souselem = parts.join(' ');
    }

    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    const label = cap(doctrine) || cap(souselem);
    return {
      school: cap(school),
      souselem: cap(souselem),
      doctrine: cap(doctrine),
      label,
      ckey: `${groupKey}_t${t}_${gk}`,
    };
  }

  const groupMap = {};
  activeEffects.forEach(ef => {
    const gk = ef.groupe || '_default';
    if(!groupMap[gk]) groupMap[gk] = [];
    groupMap[gk].push(ef);
  });
  const groupKeys = Object.keys(groupMap);

  // ── Diagramme POLAIRE : école au centre → sous-éléments en orbite → doctrines → talents ──
  if(!activeEffects.length){
    html += `<div class="mst-no-effects">Aucun effet disponible à T${_masteryActiveTier}.</div>`;
  } else {
    // Construire la hiérarchie : école → sous-éléments → doctrines → effets
    const hierarchy = {}; // { souselem: { doctrines: { doctrine: { effects: [{ef, gk, ckey}] } }, effectsSansDoctrine: [...] } }
    let commonSchool = '';
    groupKeys.forEach(gk => {
      const gi = parseGroupe(gk);
      if(gi.school && !commonSchool) commonSchool = gi.school;
      const seKey = gi.souselem || 'default';
      if(!hierarchy[seKey]){
        hierarchy[seKey] = { label: gi.souselem || card.titre, doctrines: {}, effectsSansDoctrine: [] };
      }
      groupMap[gk].forEach(ef => {
        const entry = { ef, gk, gi, ckey: gi.ckey };
        if(gi.doctrine){
          if(!hierarchy[seKey].doctrines[gi.doctrine]){
            hierarchy[seKey].doctrines[gi.doctrine] = { label: gi.doctrine, effects: [] };
          }
          hierarchy[seKey].doctrines[gi.doctrine].effects.push(entry);
        } else {
          hierarchy[seKey].effectsSansDoctrine.push(entry);
        }
      });
    });

    const souselemKeys = Object.keys(hierarchy);
    const nSouselem = souselemKeys.length;

    // Dimensions du SVG polaire
    const SVG_SIZE = 1000;
    const CX = SVG_SIZE / 2;
    const CY = SVG_SIZE / 2;

    // Rayons orbitaux (ajustés pour éviter les collisions)
    const R_ROOT = 60;       // école centrale
    const R_SUB_ORBIT = 210; // distance école → sous-éléments
    const R_SUB = 48;        // taille des nœuds sous-éléments
    const R_DOC_ORBIT = 150; // distance sous-élément → doctrines
    const R_DOC = 34;        // taille des nœuds doctrines
    const R_EFFECT_ORBIT = 100; // distance doctrine → effets
    const R_EFFECT = 25;     // taille des nœuds effets

    const filtId = `glow-polar-${groupKey.replace(/[^a-z0-9]/gi,'')}`;

    html += `<div class="mst-polar-wrap">`;
    html += `<svg class="mst-polar-svg" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="${filtId}" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="${filtId}-strong" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="8" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <radialGradient id="root-halo-${filtId}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
          <stop offset="45%" stop-color="${color}" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="node-halo-${filtId}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
          <stop offset="60%" stop-color="${color}" stop-opacity="0.05"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="root-fill-${filtId}" cx="45%" cy="40%" r="65%">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.9"/>
          <stop offset="55%" stop-color="${color}" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#0a0e14" stop-opacity="0.95"/>
        </radialGradient>
        <linearGradient id="line-fade-${filtId}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.15"/>
        </linearGradient>
      </defs>`;

    // Halo radial de fond derrière l'école
    html += `<circle cx="${CX}" cy="${CY}" r="${R_SUB_ORBIT + 140}" fill="url(#root-halo-${filtId})"/>`;

    // Orbites de gravitation subtiles (sous-éléments et doctrines)
    // Ces cercles très légers rappellent le système solaire du concept art
    html += `<circle cx="${CX}" cy="${CY}" r="${R_ROOT + 55}" fill="none" stroke="${color}" stroke-width="0.5" opacity="0.08"/>`;
    html += `<circle cx="${CX}" cy="${CY}" r="${R_ROOT + 90}" fill="none" stroke="${color}" stroke-width="0.5" opacity="0.05"/>`;

    // Grande orbite pointillée avec petits diamants scintillants (orbite principale des sous-éléments)
    const N_ORBIT_DOTS = 32;
    html += `<circle cx="${CX}" cy="${CY}" r="${R_SUB_ORBIT}" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="1 8" opacity="0.35"/>`;
    // Points scintillants sur l'orbite
    for(let i = 0; i < N_ORBIT_DOTS; i++){
      const a = (2 * Math.PI * i) / N_ORBIT_DOTS;
      const ox = CX + R_SUB_ORBIT * Math.cos(a);
      const oy = CY + R_SUB_ORBIT * Math.sin(a);
      const r = i % 8 === 0 ? 2.5 : 1.2;
      const opacity = i % 8 === 0 ? 0.75 : 0.35;
      html += `<circle cx="${ox}" cy="${oy}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
    }
    // Petit diamant en haut de l'orbite (comme dans le concept art)
    html += `<g transform="translate(${CX} ${CY - R_SUB_ORBIT}) rotate(45)">
      <rect x="-4" y="-4" width="8" height="8" fill="${color}" opacity="0.75"/>
    </g>`;

    // Positionner les sous-éléments en cercle autour de l'école
    souselemKeys.forEach((seKey, seIdx) => {
      const seData = hierarchy[seKey];
      const seAngle = (nSouselem === 1)
        ? 0
        : -Math.PI/2 + (2 * Math.PI * seIdx / nSouselem);
      const seX = CX + R_SUB_ORBIT * Math.cos(seAngle);
      const seY = CY + R_SUB_ORBIT * Math.sin(seAngle);

      // Ligne école → sous-élément avec petits points scintillants
      const lineStart = { x: CX + R_ROOT * Math.cos(seAngle), y: CY + R_ROOT * Math.sin(seAngle) };
      const lineEnd = { x: seX - R_SUB * Math.cos(seAngle), y: seY - R_SUB * Math.sin(seAngle) };
      html += `<line x1="${lineStart.x}" y1="${lineStart.y}" x2="${lineEnd.x}" y2="${lineEnd.y}"
        stroke="${color}" stroke-width="1.2" opacity="0.55"/>`;
      // Points scintillants le long de la ligne
      const N_LINE_DOTS = 4;
      for(let i = 1; i < N_LINE_DOTS; i++){
        const t = i / N_LINE_DOTS;
        const px = lineStart.x + (lineEnd.x - lineStart.x) * t;
        const py = lineStart.y + (lineEnd.y - lineStart.y) * t;
        html += `<circle cx="${px}" cy="${py}" r="1.5" fill="${color}" opacity="0.6"/>`;
      }

      // Positionner les doctrines autour du sous-élément
      const doctrineKeys = Object.keys(seData.doctrines);
      const nDoctrines = doctrineKeys.length;

      // Angle disponible pour les doctrines : arc de 180° (côté opposé à l'école)
      // Pour que les doctrines ne se superposent pas avec l'école centrale
      const docSpanStart = seAngle - Math.PI / 2.2;
      const docSpanEnd = seAngle + Math.PI / 2.2;
      const docTotalSpan = docSpanEnd - docSpanStart;

      doctrineKeys.forEach((docKey, docIdx) => {
        const docData = seData.doctrines[docKey];
        const docAngle = nDoctrines === 1
          ? seAngle
          : docSpanStart + (docTotalSpan * docIdx / (nDoctrines - 1));
        const docX = seX + R_DOC_ORBIT * Math.cos(docAngle);
        const docY = seY + R_DOC_ORBIT * Math.sin(docAngle);

        // Ligne sous-élément → doctrine avec points scintillants
        const dLineStart = { x: seX + R_SUB * Math.cos(docAngle), y: seY + R_SUB * Math.sin(docAngle) };
        const dLineEnd = { x: docX - R_DOC * Math.cos(docAngle), y: docY - R_DOC * Math.sin(docAngle) };
        html += `<line x1="${dLineStart.x}" y1="${dLineStart.y}" x2="${dLineEnd.x}" y2="${dLineEnd.y}"
          stroke="${color}" stroke-width="1" opacity="0.4"/>`;
        const N_DOC_DOTS = 3;
        for(let i = 1; i < N_DOC_DOTS; i++){
          const t = i / N_DOC_DOTS;
          const px = dLineStart.x + (dLineEnd.x - dLineStart.x) * t;
          const py = dLineStart.y + (dLineEnd.y - dLineStart.y) * t;
          html += `<circle cx="${px}" cy="${py}" r="1.2" fill="${color}" opacity="0.5"/>`;
        }

        // Positionner les effets autour de la doctrine
        const nEff = docData.effects.length;
        const effSpanStart = docAngle - Math.PI / 2.5;
        const effSpanEnd = docAngle + Math.PI / 2.5;
        const effTotalSpan = effSpanEnd - effSpanStart;

        docData.effects.forEach((entry, effIdx) => {
          const { ef, ckey } = entry;
          const effAngle = nEff === 1
            ? docAngle
            : effSpanStart + (effTotalSpan * effIdx / (nEff - 1));
          const effX = docX + R_EFFECT_ORBIT * Math.cos(effAngle);
          const effY = docY + R_EFFECT_ORBIT * Math.sin(effAngle);

          const chosen = masteryChoices[ckey];
          const isChosen = chosen === ef.id;

          // Ligne doctrine → effet
          html += `<line x1="${docX + R_DOC * Math.cos(effAngle)}" y1="${docY + R_DOC * Math.sin(effAngle)}"
            x2="${effX - R_EFFECT * Math.cos(effAngle)}" y2="${effY - R_EFFECT * Math.sin(effAngle)}"
            stroke="${isChosen ? color : '#3a4253'}" stroke-width="${isChosen?2:1}"
            opacity="${isChosen?0.85:0.35}" ${isChosen?'':'stroke-dasharray="3 3"'}/>`;

          // Nœud effet
          const ic = effectIcon(ef);
          const fc = isChosen ? color+'2e' : '#1b2230';
          const sc = isChosen ? color : '#3a4253';
          const iconMarkup = iconIsImage(ic)
            ? `<image href="${ic.replace(/"/g,'&quot;')}" x="${effX-14}" y="${effY-14}" width="28" height="28" preserveAspectRatio="xMidYMid meet"/>`
            : `<text x="${effX}" y="${effY+5}" text-anchor="middle" font-size="16">${ic}</text>`;
          // Label positionné vers l'extérieur
          const labelDist = R_EFFECT + 14;
          const lx = effX + labelDist * Math.cos(effAngle);
          const ly = effY + labelDist * Math.sin(effAngle);
          const anchor = Math.abs(Math.cos(effAngle)) < 0.3 ? 'middle' : (Math.cos(effAngle) > 0 ? 'start' : 'end');
          const tc = isChosen ? color : '#c4ccd8';
          html += `<g class="mst-node-svg" data-eid="${ef.id}" data-ckey="${ckey}">
            <circle cx="${effX}" cy="${effY}" r="${R_EFFECT}" fill="${fc}" stroke="${sc}" stroke-width="${isChosen?2.5:1.5}" ${isChosen?`filter="url(#${filtId})"`:''}/>
            ${iconMarkup}
            <text class="mst-node-label" x="${lx}" y="${ly+3}" text-anchor="${anchor}" fill="${tc}" font-family="Inter,sans-serif" font-size="9.5" font-weight="${isChosen?'700':'500'}">${ef.nom}</text>
          </g>`;
        });

        // Orbite subtile autour de la doctrine (montre les talents qui gravitent)
        if(docData.effects.length > 0){
          html += `<circle cx="${docX}" cy="${docY}" r="${R_EFFECT_ORBIT}" fill="none" stroke="${color}" stroke-width="0.5" opacity="0.08" stroke-dasharray="1 5"/>`;
        }

        // Halo autour de la doctrine
        html += `<circle cx="${docX}" cy="${docY}" r="${R_DOC * 1.5}" fill="url(#node-halo-${filtId})"/>`;

        // Anneau extérieur + nœud doctrine
        html += `<circle cx="${docX}" cy="${docY}" r="${R_DOC + 5}" fill="none" stroke="${color}" stroke-width="0.5" opacity="0.3"/>`;
        html += `<circle cx="${docX}" cy="${docY}" r="${R_DOC}" fill="#0f1520" stroke="${color}" stroke-width="1.8" filter="url(#${filtId})"/>`;

        // Icône Master pour la doctrine
        const docIcon = getMasterIcon(docData.label);
        if(docIcon){
          const fixedDocIcon = fixDriveUrl(docIcon);
          const docClipId = `doc-clip-${filtId}-${seIdx}-${docIdx}`;
          if(iconIsImage(fixedDocIcon)){
            html += `<clipPath id="${docClipId}"><circle cx="${docX}" cy="${docY}" r="${R_DOC - 2}"/></clipPath>
              <image href="${fixedDocIcon.replace(/"/g,'&quot;')}" x="${docX - R_DOC + 2}" y="${docY - R_DOC + 2}" width="${R_DOC*2 - 4}" height="${R_DOC*2 - 4}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${docClipId})"/>`;
          } else {
            html += `<text x="${docX}" y="${docY + 5}" text-anchor="middle" font-size="${R_DOC * 0.9}">${fixedDocIcon}</text>`;
          }
        }

        // Label doctrine : positionné à l'extérieur du sous-élément
        // Distance ajustée pour éviter les collisions avec les effets qui viennent après
        const docLabelDist = R_DOC + 18 + (nDoctrines > 3 ? 6 : 0);
        const docLabelX = docX + docLabelDist * Math.cos(docAngle);
        const docLabelY = docY + docLabelDist * Math.sin(docAngle);
        const docLabelAnchor = Math.abs(Math.cos(docAngle)) < 0.3 ? 'middle' : (Math.cos(docAngle) > 0 ? 'start' : 'end');
        html += `<text x="${docLabelX}" y="${docLabelY - 4}" text-anchor="${docLabelAnchor}" fill="${color}" font-family="Cinzel,serif" font-size="10" font-weight="bold" letter-spacing="1.5">${(docData.label || '').toUpperCase()}</text>
          <text x="${docLabelX}" y="${docLabelY + 7}" text-anchor="${docLabelAnchor}" fill="${color}77" font-family="Inter,sans-serif" font-size="7.5" letter-spacing="0.3">Doctrine</text>`;
      });

      // Effets sans doctrine : les placer directement autour du sous-élément
      const noDocEffects = seData.effectsSansDoctrine;
      if(noDocEffects.length){
        const nEff = noDocEffects.length;
        const effSpanStart = seAngle - Math.PI / 2.5;
        const effSpanEnd = seAngle + Math.PI / 2.5;
        const effTotalSpan = effSpanEnd - effSpanStart;
        noDocEffects.forEach((entry, effIdx) => {
          const { ef, ckey } = entry;
          const effAngle = nEff === 1
            ? seAngle
            : effSpanStart + (effTotalSpan * effIdx / (nEff - 1));
          const effX = seX + (R_DOC_ORBIT * 0.7) * Math.cos(effAngle);
          const effY = seY + (R_DOC_ORBIT * 0.7) * Math.sin(effAngle);
          const chosen = masteryChoices[ckey];
          const isChosen = chosen === ef.id;
          html += `<line x1="${seX + R_SUB * Math.cos(effAngle)}" y1="${seY + R_SUB * Math.sin(effAngle)}"
            x2="${effX - R_EFFECT * Math.cos(effAngle)}" y2="${effY - R_EFFECT * Math.sin(effAngle)}"
            stroke="${isChosen ? color : '#3a4253'}" stroke-width="${isChosen?2:1}"
            opacity="${isChosen?0.85:0.35}" ${isChosen?'':'stroke-dasharray="3 3"'}/>`;
          const ic = effectIcon(ef);
          const fc = isChosen ? color+'2e' : '#1b2230';
          const sc = isChosen ? color : '#3a4253';
          const iconMarkup = iconIsImage(ic)
            ? `<image href="${ic.replace(/"/g,'&quot;')}" x="${effX-14}" y="${effY-14}" width="28" height="28" preserveAspectRatio="xMidYMid meet"/>`
            : `<text x="${effX}" y="${effY+5}" text-anchor="middle" font-size="16">${ic}</text>`;
          const labelDist = R_EFFECT + 14;
          const lx = effX + labelDist * Math.cos(effAngle);
          const ly = effY + labelDist * Math.sin(effAngle);
          const anchor = Math.abs(Math.cos(effAngle)) < 0.3 ? 'middle' : (Math.cos(effAngle) > 0 ? 'start' : 'end');
          const tc = isChosen ? color : '#c4ccd8';
          html += `<g class="mst-node-svg" data-eid="${ef.id}" data-ckey="${ckey}">
            <circle cx="${effX}" cy="${effY}" r="${R_EFFECT}" fill="${fc}" stroke="${sc}" stroke-width="${isChosen?2.5:1.5}" ${isChosen?`filter="url(#${filtId})"`:''}/>
            ${iconMarkup}
            <text class="mst-node-label" x="${lx}" y="${ly+3}" text-anchor="${anchor}" fill="${tc}" font-family="Inter,sans-serif" font-size="9.5" font-weight="${isChosen?'700':'500'}">${ef.nom}</text>
          </g>`;
        });
      }

      // Orbite subtile autour du sous-élément (montre les doctrines qui gravitent)
      if(Object.keys(seData.doctrines).length > 0){
        html += `<circle cx="${seX}" cy="${seY}" r="${R_DOC_ORBIT}" fill="none" stroke="${color}" stroke-width="0.5" opacity="0.1" stroke-dasharray="1 6"/>`;
      }

      // Halo autour du sous-élément
      html += `<circle cx="${seX}" cy="${seY}" r="${R_SUB * 1.6}" fill="url(#node-halo-${filtId})"/>`;

      // Nœud sous-élément avec petit anneau extérieur
      html += `<circle cx="${seX}" cy="${seY}" r="${R_SUB + 8}" fill="none" stroke="${color}" stroke-width="0.5" opacity="0.35"/>`;
      html += `<circle cx="${seX}" cy="${seY}" r="${R_SUB}" fill="#0f1520" stroke="${color}" stroke-width="2" filter="url(#${filtId})"/>`;

      // Icône Master pour le sous-élément
      const seIcon = getMasterIcon(seData.label);
      if(seIcon){
        const fixedSeIcon = fixDriveUrl(seIcon);
        const seClipId = `se-clip-${filtId}-${seIdx}`;
        if(iconIsImage(fixedSeIcon)){
          html += `<clipPath id="${seClipId}"><circle cx="${seX}" cy="${seY}" r="${R_SUB - 3}"/></clipPath>
            <image href="${fixedSeIcon.replace(/"/g,'&quot;')}" x="${seX - R_SUB + 3}" y="${seY - R_SUB + 3}" width="${R_SUB*2 - 6}" height="${R_SUB*2 - 6}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${seClipId})"/>`;
        } else {
          html += `<text x="${seX}" y="${seY + 7}" text-anchor="middle" font-size="${R_SUB * 0.95}">${fixedSeIcon}</text>`;
        }
      }

      // Label sous-élément : positionné à l'extérieur, opposé au centre
      // Distance ajustée pour éviter les collisions quand il y a beaucoup de sous-éléments
      const seLabelDist = R_SUB + 22 + (nSouselem > 4 ? 8 : 0);
      const seLabelX = seX + seLabelDist * Math.cos(seAngle);
      const seLabelY = seY + seLabelDist * Math.sin(seAngle);
      const seLabelAnchor = Math.abs(Math.cos(seAngle)) < 0.3 ? 'middle' : (Math.cos(seAngle) > 0 ? 'start' : 'end');
      html += `<text x="${seLabelX}" y="${seLabelY - 6}" text-anchor="${seLabelAnchor}" fill="${color}" font-family="Cinzel,serif" font-size="13" font-weight="bold" letter-spacing="2">${(seData.label || '').toUpperCase()}</text>
        <text x="${seLabelX}" y="${seLabelY + 8}" text-anchor="${seLabelAnchor}" fill="${color}88" font-family="Inter,sans-serif" font-size="9" letter-spacing="0.5">Sous-élément</text>`;
    });

    // Halo étendu autour de l'école racine
    html += `<circle cx="${CX}" cy="${CY}" r="${R_ROOT * 2.2}" fill="url(#node-halo-${filtId})"/>`;

    // Petits cercles concentriques autour de l'école (comme sur le concept art)
    html += `<circle cx="${CX}" cy="${CY}" r="${R_ROOT + 20}" fill="none" stroke="${color}" stroke-width="0.5" opacity="0.3"/>`;
    html += `<circle cx="${CX}" cy="${CY}" r="${R_ROOT + 38}" fill="none" stroke="${color}" stroke-width="0.5" opacity="0.18"/>`;

    // Nœud école racine avec gradient radial
    const rootLabel = commonSchool || card.titre || 'Élément';
    html += `<circle cx="${CX}" cy="${CY}" r="${R_ROOT}" fill="url(#root-fill-${filtId})" stroke="${color}" stroke-width="2" filter="url(#${filtId}-strong)"/>`;

    // Icône de l'école depuis MASTER_ICONS (si définie)
    const rootIcon = getMasterIcon(commonSchool) || getMasterIcon(rootLabel);
    if(rootIcon){
      const fixedRootIcon = fixDriveUrl(rootIcon);
      const iconSize = R_ROOT * 1.2;
      if(iconIsImage(fixedRootIcon)){
        html += `<clipPath id="root-clip-${filtId}"><circle cx="${CX}" cy="${CY}" r="${R_ROOT - 3}"/></clipPath>
          <image href="${fixedRootIcon.replace(/"/g,'&quot;')}" x="${CX - R_ROOT + 3}" y="${CY - R_ROOT + 3}" width="${R_ROOT*2 - 6}" height="${R_ROOT*2 - 6}" preserveAspectRatio="xMidYMid slice" clip-path="url(#root-clip-${filtId})"/>`;
      } else {
        html += `<text x="${CX}" y="${CY + 10}" text-anchor="middle" font-size="${iconSize}">${fixedRootIcon}</text>`;
      }
    }

    // Label école : au-DESSUS du cœur (comme "FEU / Manifestation" dans le concept)
    html += `<text x="${CX}" y="${CY - R_ROOT - 30}" text-anchor="middle" fill="${color}" font-family="Cinzel,serif" font-size="18" font-weight="bold" letter-spacing="3">${rootLabel.toUpperCase()}</text>
      <text x="${CX}" y="${CY - R_ROOT - 12}" text-anchor="middle" fill="${color}88" font-family="Inter,sans-serif" font-size="10" letter-spacing="1">${tierNoms[_masteryActiveTier] || `T${_masteryActiveTier}`}</text>`;

    html += `</svg></div>`;
  }

  if(card.regle){
    html += `<div class="mst-regle"><strong>Règle de progression</strong> : ${card.regle}</div>`;
  }

  container.innerHTML = html;

  container.querySelectorAll('.mst-tier-nav-item').forEach(el=>{
    el.addEventListener('click', ()=>{ _masteryActiveTier=parseInt(el.getAttribute('data-tier')); renderMasteryView(); });
  });

  // Handler du clic sur nœud d'effet : ouvre le panneau latéral (lecture seule)
  // La sélection est faite dans le Google Sheet joueur, pas dans l'UI.
  container.querySelectorAll('.mst-node-svg').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const eid = el.getAttribute('data-eid');
      const ckey = el.getAttribute('data-ckey');
      if(!eid) return;

      // Chercher l'effet dans tous les groupes du tier actif
      let effect = null, gInfo = null;
      for(const gk of Object.keys(groupMap)){
        const found = groupMap[gk].find(e => e.id === eid);
        if(found){
          effect = found;
          gInfo = parseGroupe(gk);
          break;
        }
      }
      if(effect) openElementalEffectPanel(effect, gInfo, ckey);
    });
  });
}

// Ouvre le panneau latéral droit avec les détails d'un effet élémentaire
// (utilise le même #panel que pour les sorts, avec le style Impact ciblé)
function openElementalEffectPanel(effect, groupInfo, ckey){
  const group = getActiveGroup();
  if(!group) return;
  const { theme, card } = group;
  const color = theme.color;
  const tierNoms = card.tiers_noms || [];
  const tierNom = tierNoms[_masteryActiveTier] || `Tier ${_masteryActiveTier}`;
  const isChosen = masteryChoices[ckey] === effect.id;

  // Header du panneau
  document.getElementById('panel-tier').textContent = `${card.titre} · ${tierNom}`;
  document.getElementById('panel-rank').textContent = `T${_masteryActiveTier}`;
  document.getElementById('panel-rank').style.color = color;
  document.getElementById('panel-title').textContent = effect.nom;

  // Icône
  const iconEl = document.getElementById('panel-icon');
  const ic = effect.icone || '❓';
  const fixedIc = fixDriveUrl(ic);
  if(iconIsImage(fixedIc)){
    iconEl.innerHTML = `<img src="${fixedIc.replace(/"/g,'&quot;')}" alt="">`;
  } else {
    iconEl.innerHTML = fixedIc;
  }
  iconEl.style.borderColor = color;
  iconEl.style.boxShadow = `0 0 16px ${color}44`;

  // Corps
  const blabel = brancheLabelHelper(effect);
  const tags = [];
  if(groupInfo && groupInfo.school){
    tags.push(`<span class="mst-effect-school">🏫 ${groupInfo.school}</span>`);
  }
  if(groupInfo && groupInfo.souselem){
    tags.push(`<span class="mst-effect-souselem" style="border-color:${color}66;color:${color};background:color-mix(in srgb, ${color} 10%, transparent)">✦ ${groupInfo.souselem}</span>`);
  }
  if(groupInfo && groupInfo.doctrine){
    tags.push(`<span class="mst-effect-doctrine" style="border-color:${color}aa;color:${color}">◆ ${groupInfo.doctrine}</span>`);
  }
  if(blabel){
    tags.push(`<span class="mst-effect-branche">🔗 ${blabel}</span>`);
  }

  const body = document.getElementById('panel-body');
  body.innerHTML = `
    ${tags.length ? `<div class="panel-tags">${tags.join('')}</div>` : ''}
    <p class="rank-description">${parseRichText(effect.description) || 'Aucune description fournie.'}</p>
  `;

  // Footer : indicateur de statut en lecture seule (le choix se fait dans le Sheet joueur)
  const footer = document.getElementById('panel-footer');
  if(isChosen){
    footer.innerHTML = `
      <div class="panel-status-badge selected" style="border-color:${color};color:${color};background:color-mix(in srgb, ${color} 12%, transparent)">
        ✓ Effet sélectionné pour ce joueur
      </div>
    `;
  } else {
    footer.innerHTML = `
      <div class="panel-status-badge">
        Non sélectionné
      </div>
    `;
  }

  // Ouvrir le panneau
  document.getElementById('panel').classList.add('open');
}

// Helper pour l'étiquette de branche d'un effet (utilisé par openElementalEffectPanel)
function brancheLabelHelper(ef){
  if(!ef.branches || ef.branches === '*') return '';
  return ef.branches.split(',').map(b => b.trim().replace(/_/g,' ')).join(', ');
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
  let skills = allSkills.filter(s => s.ecole === currentSchool);
  // Mode joueur : masquer les sorts verrouillés (seuls unlocked et available sont visibles)
  if(!isMjMode){
    skills = skills.filter(s => s.etat === 'unlocked' || s.etat === 'available');
  }
  return skills;
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

  const positions = {};
  const brancheCol = {};
  let nextCol = 0;

  function assignCols(brancheKey){
    brancheCol[brancheKey] = nextCol++;
    (childrenOf[brancheKey] || []).forEach(child => assignCols(child));
  }
  rootBranches.forEach(k => assignCols(k));

  // Tier absolu = suffixe numérique de l'ID
  function tierFromId(id){
    const match = (id || '').match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  }

  // Pour les branches fork : calculer un offset automatique basé sur le parent_id.
  // Si Canalisation (evo_can_1, tier_id=1) fork depuis evo_nova_2 (tier_id=2),
  // alors offset = 2 - 1 + 1 = 2, et evo_can_1 se place au tier 1+2 = 3.
  // Pour les branches racines, offset = 0.
  const brancheOffset = {};
  function computeOffset(brancheKey){
    if(brancheOffset[brancheKey] !== undefined) return brancheOffset[brancheKey];
    const info = brancheParent[brancheKey];
    if(!info){ brancheOffset[brancheKey] = 0; return 0; }

    // Tier du nœud parent (dans sa propre branche, avec son propre offset)
    const parentOffset = computeOffset(info.parentBranche);
    const parentTier = tierFromId(info.parentSkillId) + parentOffset;

    // Tier minimum des nœuds de CETTE branche fork (le premier nœud)
    const list = byBranche[brancheKey] || [];
    const minTier = Math.min(...list.map(s => tierFromId(s.id)));

    // L'offset fait démarrer le premier nœud au tier du parent + 1
    // (sauf si les IDs encodent déjà le bon tier absolu)
    const offset = Math.max(0, parentTier + 1 - minTier);
    brancheOffset[brancheKey] = offset;
    return offset;
  }
  Object.keys(byBranche).forEach(k => computeOffset(k));

  // Placer les nœuds : X = colonne (branche), Y = tier (ID suffix + offset)
  Object.keys(byBranche).forEach(brancheKey => {
    const col = brancheCol[brancheKey];
    const offset = brancheOffset[brancheKey];
    byBranche[brancheKey].forEach(s => {
      const tier = tierFromId(s.id) + offset;
      positions[s.id] = {
        x: LEFT_PADDING + col * COL_GAP,
        y: TOP_PADDING  + tier * ROW_GAP,
        brancheKey, col, tier,
      };
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
  // Nœud école racine : en HAUT, centré horizontalement sur toutes les branches
  const rootXs = rootBranches.map(k => {
    const first = byBranche[k][0];
    return first && positions[first.id] ? positions[first.id].x : null;
  }).filter(x => x !== null);
  const rootX = rootXs.length ? (Math.min(...rootXs) + Math.max(...rootXs)) / 2 : LEFT_PADDING;
  const rootY = TOP_PADDING - 60;

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
  if(icone.startsWith('http://') || icone.startsWith('https://')) return true;
  if(/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(icone)) return true;
  return false;
}

// Convertit les URLs Google Drive en URL d'image directe
// drive.google.com/file/d/XXXX/view → lh3.googleusercontent.com/d/XXXX
function fixDriveUrl(url){
  if(!url) return url;
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if(driveMatch){
    return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
  }
  return url;
}

function renderIcon(icone){
  if(!icone) return '★';
  if(isImageRef(icone)){
    const fixed = fixDriveUrl(icone);
    const safe = fixed.replace(/"/g, '&quot;');
    return `<img class="node-icon-img" src="${safe}" alt="" draggable="false">`;
  }
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
  // [texte](couleur) → mark coloré
  safe = safe.replace(/\[([^\]]+)\]\(([a-zA-Z0-9_-]+)\)/g, (m, txt, color) => {
    return `<mark class="color-${color}">${txt}</mark>`;
  });
  // [Nom du sort I+] sans (couleur) → référence de sort stylée
  // Doit être traité APRÈS [texte](couleur) pour ne pas interférer
  safe = safe.replace(/\[([^\]]+)\]/g, (m, txt) => {
    return `<span class="spell-ref">${txt}</span>`;
  });
  // **gras**
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // sauts de ligne
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

  // Icône du sort dans le panneau
  const iconEl = document.getElementById('panel-icon');
  if(skill.icone && isImageRef(skill.icone)){
    const url = fixDriveUrl(skill.icone).replace(/"/g, '&quot;');
    iconEl.innerHTML = `<img src="${url}" alt="">`;
  } else if(skill.icone){
    iconEl.innerHTML = skill.icone; // emoji
  } else {
    iconEl.innerHTML = '★';
  }

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

  // Collecter tous les texte_special (supporte les deux conventions :
  // texte_special, texte_special1/texte_special_1, texte_special2/texte_special_2, etc.)
  const specialBlocks = [];
  if(skill.texte_special && skill.texte_special.trim()) specialBlocks.push(skill.texte_special);
  for(let i = 1; i <= 10; i++){
    const val = (skill[`texte_special${i}`] || skill[`texte_special_${i}`] || '').trim();
    if(val) specialBlocks.push(val);
  }
  const specialHtml = specialBlocks
    .map(txt => `<div class="rank-special">${parseRichText(txt)}</div>`)
    .join('');

  const elementalSection = buildElementalEffectsSection(skill);

  const body = document.getElementById('panel-body');
  body.innerHTML = `
    <p class="rank-description">${parseRichText(skill.description) || 'Aucune description fournie.'}</p>
    ${statLines ? `<div class="rank-stats">${statLines}</div>` : ''}
    ${specialHtml}
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

// Bouton MJ : prompt pour le mot de passe
document.getElementById('mj-login-btn').addEventListener('click', () => {
  if(isMjMode){
    // Déjà en mode MJ → désactiver
    isMjMode = false;
    updateMjUI();
    renderTree();
    showToast('Mode joueur activé — sorts verrouillés masqués', 'warn');
    return;
  }
  const input = prompt('Mot de passe MJ :');
  if(!input) return;
  if(input === mjPassword){
    isMjMode = true;
    updateMjUI();
    renderTree();
    showToast('Mode MJ activé — tous les sorts visibles', 'success');
  } else {
    showToast('Mot de passe incorrect', 'error');
  }
});
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