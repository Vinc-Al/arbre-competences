/* ────────────────────────────────────────────────────────────────────────────
   spelltree-core.js — CŒUR du modèle "nœud = modificateurs".

   SOURCE DE VÉRITÉ : une liste PLATE de nœuds (une ligne par nœud dans le Sheet).
   Chaque nœud porte SA contribution ; on ne stocke JAMAIS le total (il se calcule).

   Convention de valeur (le SIGNE fait le travail) :
     "10"     → BASE      (valeur absolue, portée par la racine)
     "+2"     → INCRÉMENT (ajouté quand le nœud est possédé)
     "+2 m"   → incrément avec unité conservée
     ""       → rien (ligne masquée)

   Aucune dépendance UI. Transposable tel quel en Lua (addon WoW).
   ──────────────────────────────────────────────────────────────────────────── */

// ── 1. Parse une cellule de stat : base / incrément / texte ──────────────────
function parseStatCell(raw){
  const s = String(raw == null ? '' : raw).trim();
  if(!s) return null;
  const m = s.match(/^([+-]?)\s*([\d.,]+)\s*(.*)$/);
  if(!m) return { kind: 'text', raw: s };                 // ex. "Instantané", "1d6"
  const n = parseFloat(m[2].replace(',', '.'));
  if(Number.isNaN(n)) return { kind: 'text', raw: s };
  return { kind: m[1] ? 'incr' : 'base', n: m[1] === '-' ? -n : n, unit: m[3].trim() };
}

// ── 2. Un nœud est-il possédé ? (accepte TRUE/FALSE et unlocked/…) ────────────
function isOwned(node){
  if(!node) return false;
  const e = String(node.etat == null ? '' : node.etat).trim().toLowerCase();
  return e === 'true' || e === 'vrai' || e === '1' || e === 'oui' || e === 'unlocked';
}

// ── 3. Parents : "a,b" → ["a","b"] (les séparateurs d'héritage se branchent ici)
function parseParents(pid){
  return String(pid == null ? '' : pid).split(/[,;.]/).map(x => x.trim()).filter(Boolean);
}

// ── 4. Construit le modèle : index + relations ───────────────────────────────
function buildModel(nodes){
  const byId = {};
  nodes.forEach(n => { byId[n.id] = n; });
  const parentsOf = {}, childrenOf = {};
  nodes.forEach(n => {
    const ps = parseParents(n.parent_id != null ? n.parent_id : n.parent).filter(p => byId[p]);
    parentsOf[n.id] = ps;
    ps.forEach(p => (childrenOf[p] = childrenOf[p] || []).push(n.id));
  });
  return { nodes, byId, parentsOf, childrenOf };
}

// ── 5. Chaîne d'ascendance : le nœud + tous ses ancêtres jusqu'à la racine ────
function ancestorChain(id, model){
  const chain = [], seen = new Set();
  let frontier = [id];
  while(frontier.length){
    const next = [];
    for(const nid of frontier){
      if(seen.has(nid)) continue; seen.add(nid);
      const node = model.byId[nid]; if(!node) continue;
      chain.push(node);
      (model.parentsOf[nid] || []).forEach(p => next.push(p));
    }
    frontier = next;
  }
  return chain;
}

// ── 6. LE CALCUL — pur, testable, identique web/Lua ──────────────────────────
//   Joueur : base + Σ incréments des ancêtres POSSÉDÉS (+ le nœud cliqué).
//   MJ     : idem, mais liste aussi les incréments atteignables non pris (l'étendue).
function computeStat(id, stat, model, opts){
  const mj = !!(opts && opts.mjMode);
  const get = node => (node.stats ? node.stats[stat] : node[stat]);
  let base = 0, bonus = 0, unit = '';
  const possibles = [];
  for(const node of ancestorChain(id, model)){
    const cell = parseStatCell(get(node));
    if(!cell || cell.kind === 'text') continue;
    if(cell.unit) unit = cell.unit;
    if(cell.kind === 'base'){
      base = cell.n;                                   // la racine fixe la base
    } else {                                            // incrément
      const compte = node.id === id || isOwned(node);   // le nœud lui-même compte toujours
      if(compte) bonus += cell.n;
      else if(mj) possibles.push(cell.n);               // potentiel non débloqué
    }
  }
  return { base, bonus, total: base + bonus, unit, possibles };
}

// ── 7. Formatage d'affichage (branché sur le "BASE + BONUS" de la fiche) ──────
function formatStat(res){
  const sign = n => (n < 0 ? ' − ' : ' + ') + Math.abs(n);
  let out = `${res.base}`;
  if(res.bonus) out += `${sign(res.bonus)} = ${res.total}`;
  if(res.unit)  out += ' ' + res.unit;
  if(res.possibles && res.possibles.length){
    out += `  (potentiel : ${res.possibles.map(n => (n < 0 ? '−' : '+') + Math.abs(n)).join(', ')})`;
  }
  return out;
}

// Export universel (Node pour les tests, sinon global navigateur)
if(typeof module !== 'undefined' && module.exports){
  module.exports = { parseStatCell, isOwned, parseParents, buildModel, ancestorChain, computeStat, formatStat };
}
