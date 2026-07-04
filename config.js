/* =========================================================
   CONFIGURATION — Arbre de Compétences JDR
   =========================================================
   Ce fichier contient toutes les données configurables :
   - URLs des Google Sheets (DATA + joueur)
   - Thèmes des écoles et éléments
   - Données de maîtrise élémentaire
   - Données de démonstration
   ========================================================= */

/* =========================================================
   CONFIG GÉNÉRALE
   =========================================================

   --- 1. JOUEURS ---
   Chaque joueur a son propre onglet dans Google Sheets, publié
   séparément en CSV. On accède à sa page via :
       tonsite.com/arbre.html?joueur=Alice

   Renseigne ci-dessous, pour chaque joueur, l'URL CSV de SON
   onglet (Fichier > Partager > Publier sur le web > choisir
   l'onglet "Alice" > format CSV).

   Si le joueur dans l'URL ne correspond à aucune entrée ici,
   ou si l'URL est vide/inaccessible, la démo utilise des
   données d'exemple (DEMO_DATA) pour que la page fonctionne
   quand même.

   --- 2. ÉCOLES ---
   Une "école" = un arbre complet séparé (onglet de navigation
   en haut). Dans le Sheet de CHAQUE joueur, ajoute une colonne
   "ecole" à chaque ligne de compétence, avec une des valeurs :
   evocation, abjuration, invocation, transmutation, divination,
   illusion, enchantement, necromancie. La page regroupe
   automatiquement les compétences par valeur de cette colonne
   et crée un onglet par école trouvée. Le nom affiché et la
   couleur de chaque école sont définis dans SCHOOL_THEMES
   ci-dessous (modifiable librement).

   --- 3. STRUCTURE EN BRANCHES (façon arbre horizontal) ---
   Chaque compétence appartient à une "branche" : une ligne
   horizontale qui représente une progression (Niveau 0, I, II,
   III...). Toutes les compétences d'une même branche partagent
   la même valeur dans la colonne "branche" (ex: "trait_energetique"),
   et leur position sur la ligne est donnée par la colonne "niveau"
   (0, 1, 2, 3...).

   Une branche peut "s'embrancher" depuis une compétence d'une
   AUTRE branche : pour cela, sur le niveau 0 de la nouvelle
   branche, mets dans "parent_id" l'id de la compétence d'où elle
   part. La page dessine alors un lien en pointillés depuis ce
   point d'origine, et place la nouvelle ligne juste en dessous.
   Si parent_id est vide sur le niveau 0, la branche est une
   branche principale qui part directement de l'école.

   --- 4. EFFETS ---
   Ajoute une colonne "effets" dans le Sheet : texte libre
   décrivant ce que la compétence apporte (ex: "+20% dégâts
   de feu\n+1 portée"). Un retour à la ligne = un effet listé
   séparément dans le panneau de détail.

   --- 5. FICHE DE SORT (façon "carte RANK") ---
   Le panneau de détail affiche chaque compétence comme une
   fiche de sort : "RANK – {niveau}" en titre, une description,
   une liste de statistiques avec flèche "→", et un bloc spécial
   mis en valeur en bas (pour un effet de mot-clé du type
   "Affinité élémentaire 0 : ...").

   Colonnes optionnelles pour ça :
   - degats, portee, duree, action : texte libre (ex: "1d8",
     "18 mètres", "Instantané", "Action"). Une ligne "→ Label : valeur"
     est générée automatiquement pour chaque colonne remplie ;
     si une colonne est vide, sa ligne n'apparaît pas du tout.
   - texte_special : texte libre affiché dans un encadré coloré
     en bas de la fiche (ex: un mot-clé de sous-système comme
     "Affinité élémentaire").

   --- 6. BALISAGE DE TEXTE (couleurs et gras) ---
   Dans les colonnes "description", "texte_special" et "effets",
   tu peux utiliser une syntaxe simple, interprétée automatiquement :
     **texte**            -> affiché en gras
     [texte](couleur)      -> affiché en italique coloré

   Couleurs disponibles (modifiables dans le CSS, classes .color-*) :
     element, feu, glace, soin, poison, special, danger

   Exemple de cellule "description" :
     Vous ciblez une créature que vous pouvez voir, vous lancez une
     **attaque de sort à distance** [élémentaire](element) sur une
     **cible unique**.

   Exemple de cellule "texte_special" :
     **Affinité élémentaire 0** : Les éléments changent le type de
     dégât du sort.

   Colonnes attendues dans chaque onglet joueur :
   id | nom | description | branche | niveau | parent_id | cout | etat | lien_slide | icone | ecole | effets | degats | portee | duree | action | texte_special

   - id        : identifiant unique de la compétence
   - nom       : nom affiché sous le nœud
   - branche   : nom de la ligne horizontale à laquelle elle appartient
   - niveau    : position dans la ligne (0, 1, 2, 3...) — sert aussi
                 de numéro de RANK affiché sur la fiche
   - parent_id : (seulement utile sur le niveau 0 d'une branche qui
                 s'embranche) id de la compétence d'origine du fork
   - etat      : "unlocked" / "available" / "locked"
   - cout      : coût en points pour débloquer (informatif)
   - lien_slide: URL optionnelle vers un Google Slide de détail
   - icone     : emoji affiché dans le nœud
   - ecole     : evocation / abjuration / invocation / transmutation /
                 divination / illusion / enchantement / necromancie
   - effets    : texte libre, un effet par ligne
   - degats / portee / duree / action : statistiques affichées avec
                 une flèche dans la fiche (laisser vide si non pertinent)
   - texte_special : bloc de texte mis en valeur en bas de la fiche

   --- 7. MAÎTRISE ÉLÉMENTAIRE ---
   Système séparé, configuré directement dans ce fichier (pas
   encore relié au Sheet) :

   - ELEMENT_THEMES : liste des éléments disponibles dans le menu
     global, avec leur couleur.
   - ELEMENT_CARDS : pour chaque élément simple, le titre de carte
     et le texte d'intro générique (peut utiliser le balisage
     **gras** et [texte](couleur) comme partout ailleurs).
   - ELEMENT_MASTERY : pour chaque élément simple, un tableau de
     4 tiers (0 à 3). Chaque tier contient une liste d'effets au
     choix. Chaque effet a un "branches" qui vaut soit "*"
     (proposé sur toutes les branches) soit une liste de noms de
     branches séparés par des virgules (ex: "trait_energetique,nova")
     — l'effet n'apparaît alors que pour ces branches précises.
   - ELEMENT_COMBOS : fusions de 2 éléments (jamais plus). Une
     fusion n'existe que si elle est déclarée ici, avec sa propre
     carte et ses propres 4 tiers — elle est alors traitée comme
     un élément à part entière, distinct des 2 éléments d'origine.
     Clé attendue : comboKey(a,b), qui trie les 2 noms d'éléments
     pour garantir une clé stable quel que soit l'ordre de
     sélection (ex: comboKey('feu','acide') === comboKey('acide','feu')).

   RÈGLES DE SÉLECTION (menu global, haut de page) :
   - Maximum 2 éléments cochés simultanément.
   - Si 1 seul élément est coché, c'est lui qui est actif.
   - Si on essaie d'en cocher un 2e, la paire doit exister dans
     ELEMENT_COMBOS ; sinon la sélection est refusée et un message
     s'affiche ("Aucune fusion définie entre X et Y").
   - Tenter d'en cocher un 3e est bloqué (il faut décocher avant).

   VUE "MAÎTRISE ÉLÉMENTAIRE" (bouton dédié) :
   - Affiche la carte de l'élément actif (simple ou fusion) avec
     ses 4 tiers. Le Tier 0 ("Modulation de forme") y reste
     visible et sélectionnable.
   - Un sélecteur filtre quels effets sont pertinents pour une
     branche donnée.
   - Cliquer sur un effet le sélectionne/désélectionne — c'est un
     simulateur libre, rien n'est jamais figé.

   FICHE DE SORT (panneau de détail d'une compétence) :
   - Tous les tiers de maîtrise (0, 1, 2, 3) que le joueur a
     EXPLICITEMENT sélectionnés dans la vue Maîtrise s'affichent
     sur la fiche d'un sort, quel que soit le niveau du sort
     consulté (0, I, II, III...) — y compris le Tier 0.
   - Si le joueur n'a rien choisi à un tier donné, ce tier
     n'apparaît pas du tout sur la fiche (pas de liste exhaustive
     des choix possibles).
   - Un effet choisi ne s'affiche que s'il est pertinent pour la
     branche du sort consulté (sinon rien ne s'affiche pour ce tier).
*/

/* =========================================================
   CONFIGURATION DES GOOGLE SHEETS
   =========================================================

   SHEET DATA SYSTÈME (lecture seule, géré par le MJ) :
   Contient 3 onglets, chacun publié séparément en CSV :

   1. Onglet "competences" : toutes les compétences de toutes
      les écoles et branches (structure inchangée).
      → Colle son URL dans DATA_SHEETS.competences

   2. Onglet "elements" : définit les éléments disponibles,
      leurs cartes d'intro, et tous leurs effets de maîtrise
      (4 tiers × N effets × M branches). Voir la structure
      de lignes ci-dessous.
      → Colle son URL dans DATA_SHEETS.elements

   3. Onglet "combos" : définit les fusions de 2 éléments.
      → Colle son URL dans DATA_SHEETS.combos

   SHEET JOUEUR (un onglet par joueur, lecture seule côté web
   pour l'instant — l'écriture automatique nécessite la config
   Google Apps Script séparée décrite plus bas) :
   Contient les choix de maîtrise élémentaire du joueur (les
   cases cochées dans la vue Maîtrise). Le statut des compétences
   (unlocked/available/locked) reste géré par le MJ dans le
   Sheet DATA côté compétences.
   → Renseigne un onglet par joueur dans PLAYER_SHEETS

   STRUCTURE DU CSV "elements" (1 ligne = 1 effet) :
   element_key | element_label | element_color | carte_titre |
   carte_intro | tier | effet_id | effet_nom | branches |
   description | combo_avec (vide si élément simple, ou la clé
   du 2e élément si c'est une fusion ex: "acide" pour feu+acide)

   STRUCTURE DU CSV "combos" (1 ligne = 1 combo) :
   element_a | element_b | label | color | titre | intro

   STRUCTURE DU CSV joueur (1 ligne = 1 choix de tier) :
   element_key | tier | effet_id
   ========================================================= */



const DATA_SHEETS = {
  competences: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQFnGDfdGQG1QU1vPTODv-L6YW52rQDIdlO7IMDpr5vty7Q28F44FDsmlmk9m2eY4RDtZs9RPEUcpoC/pub?gid=1587029985&single=true&output=csv", // URL CSV de l'onglet "competences" du Sheet DATA
  elements:    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQFnGDfdGQG1QU1vPTODv-L6YW52rQDIdlO7IMDpr5vty7Q28F44FDsmlmk9m2eY4RDtZs9RPEUcpoC/pub?gid=1138972133&single=true&output=csv", // URL CSV de l'onglet "elements" du Sheet DATA
  combos:      "", // URL CSV de l'onglet "combos" du Sheet DATA
};

const PLAYER_SHEETS = {
	"Cryzhou": "https://docs.google.com/spreadsheets/d/e/2PACX-1vQybr2T9tD7G9CamxTe3-t9JQPyZ3IijFjOgAsCITFCwXN7u6JWjidqisyRL-Da7_mmu7Yzu7RNMeJn/pub?gid=0&single=true&output=csv",
  // "Bob":   "https://docs.google.com/.../pub?gid=YYYY&single=true&output=csv",
};

// Onglet de sauvegarde des choix de maîtrise élémentaire (1 onglet par joueur).
// Colonnes : element_key | tier | effet_id
// L'écriture automatique nécessite la config Google Apps Script (voir README).
const PLAYER_SAVE_SHEETS = {
  // "Alice": "https://docs.google.com/.../pub?gid=SSSS&single=true&output=csv",
  // "Bob":   "https://docs.google.com/.../pub?gid=TTTT&single=true&output=csv",
};

// URL de déploiement du Google Apps Script (voir AppsScript_Joueurs.gs).
// Une fois déployé, colle l'URL ici : elle commence par
// https://script.google.com/macros/s/...
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyoI0fTradSvM-MD109rCxSFki_Vzsoe0lbmBi897g6JuejZ7nTY6t7G4WSWmffNOhW/exec";

const SCHOOL_THEMES = {
  evocation:    { label: "Évocation",    color: "#e0593f", glow: "rgba(224,89,63,0.4)" },
  abjuration:   { label: "Abjuration",   color: "#6fa8ff", glow: "rgba(111,168,255,0.4)" },
  invocation:   { label: "Invocation",   color: "#4fd17e", glow: "rgba(79,209,126,0.4)" },
  transmutation:{ label: "Transmutation",color: "#d4af6a", glow: "rgba(212,175,106,0.4)" },
  divination:   { label: "Divination",  color: "#5fd6d6", glow: "rgba(95,214,214,0.4)" },
  illusion:     { label: "Illusion",     color: "#a98ce0", glow: "rgba(169,140,224,0.4)" },
  enchantement: { label: "Enchantement", color: "#e08ac0", glow: "rgba(224,138,192,0.4)" },
  necromancie:  { label: "Nécromancie",  color: "#8a7ea8", glow: "rgba(138,126,168,0.4)" },
  default:      { label: "École",        color: "#d4af6a", glow: "rgba(212,175,106,0.4)" }
};

/* =========================================================
   SYSTÈME DE MAÎTRISE ÉLÉMENTAIRE
   =========================================================
   Le joueur sélectionne un ou plusieurs éléments dans le menu
   global (en haut de page). Pour chaque élément sélectionné :

   1. Une "carte" d'introduction s'affiche (titre, texte
      générique, jet de sauvegarde associé) — définie dans
      ELEMENT_CARDS, une entrée par élément.

   2. Une progression de maîtrise à 4 tiers (0 à 3) est
      disponible : à chaque tier, le joueur CHOISIT un effet
      parmi une liste proposée (ex: au Tier 0 du Feu, choisir
      entre "Dégâts de feu purs" ou un dégât composite comme
      "Détonation pyroplastique"). Ce choix est purement un
      outil de visualisation/simulation : le joueur peut le
      changer librement à tout moment, ce n'est pas définitif.

   3. Chaque effet proposé à un tier peut être limité à
      certaines branches (ex: "Explosion de chaleur" n'a de
      sens que sur la branche "lien_persistant") ou au
      contraire être disponible partout (branches: "*").
      Quand le joueur consulte une branche précise dans
      l'arbre, seuls les effets pertinents pour CETTE branche
      sont proposés/affichés.

   Pour ajouter un élément ou modifier ses effets, édite
   ELEMENT_CARDS et ELEMENT_MASTERY ci-dessous (ou, plus tard,
   relie-les à un onglet dédié de ton Google Sheet en suivant
   la même structure).
   ========================================================= */

const ELEMENT_THEMES = {
  froid:      { label: "Froid",         color: "#6fa8ff" },
  foudre:     { label: "Foudre",        color: "#e0d65f" },
  ombre:      { label: "Ombre",         color: "#8a7ea8" },
  lumiere:    { label: "Lumière",       color: "#f3e6a8" },
  necrotique: { label: "Nécrotique",    color: "#7ea85a" },
  nature:     { label: "Nature",        color: "#5fd685" },
  acide:      { label: "Acide",         color: "#8fd14f" },
  arcane_force:{ label: "Arcane / Force",color: "#cdb6f5" },
  feu:        { label: "Feu",           color: "#e0593f" },
};

const ELEMENT_CARDS = {
  feu: {
    titre: "Chaleur",
    intro: "Vous appliquez des dégâts de [feu](feu), les jets de sauvegarde sont de **Dextérité**.",
    tiers_noms: ["Étincelle", "Brasier", "Inferno", "Cataclysme"],
    regle: "Le mage choisit un effet au choix par tiers.",
  },
  froid: {
    titre: "Gel",
    intro: "Vous appliquez des dégâts de [froid](froid), les jets de sauvegarde sont de **Constitution**.",
  },
  foudre: {
    titre: "Tempête",
    intro: "Vous appliquez des dégâts de [foudre](foudre), les jets de sauvegarde sont de **Dextérité**.",
  },
  ombre: {
    titre: "Ténèbres",
    intro: "Vous appliquez des dégâts d'[ombre](ombre), les jets de sauvegarde sont de **Sagesse**.",
  },
  lumiere: {
    titre: "Lumière",
    intro: "Vous appliquez des dégâts de [lumière](lumiere), les jets de sauvegarde sont de **Sagesse**.",
  },
  necrotique: {
    titre: "Nécrose",
    intro: "Vous appliquez des dégâts [nécrotiques](necrotique), les jets de sauvegarde sont de **Constitution**.",
  },
  nature: {
    titre: "Croissance",
    intro: "Vous appliquez des dégâts de [nature](nature), les jets de sauvegarde sont de **Force**.",
  },
  acide: {
    titre: "Corrosion",
    intro: "Vous appliquez des dégâts d'[acide](acide), les jets de sauvegarde sont de **Constitution**.",
  },
  arcane_force: {
    titre: "Force Brute",
    intro: "Vous appliquez des dégâts d'[arcane ou de force](special), les jets de sauvegarde sont d'**Intelligence**.",
  },
};

// Effets de maîtrise par tier (0 à 3). "branches" = liste de clés de
// branche où l'effet est proposé, ou "*" pour toutes les branches.
const ELEMENT_MASTERY = {
  feu: [
    // ── T0 — Étincelle ────────────────────────────────────────────────────
    [
      { id:"feu_t0_primal",        nom:"Feu primal",             branches:"*",
        description:"**Maîtrise par défaut** : Vos dégâts infligent des dégâts de [feu](feu)." },
      { id:"feu_t0_eclats",        nom:"Éclats rougeoyants",     branches:"*",
        description:"Vos dégâts sont divisés en deux sources [feu](feu) et [perçant](physique)." },
      { id:"feu_t0_magmatique",    nom:"Bloc magmatique",        branches:"*",
        description:"Vos dégâts sont divisés en deux sources [feu](feu) et [contondant](physique)." },
      { id:"feu_t0_lame",          nom:"Lame pyroplastique",     branches:"*",
        description:"Vos dégâts sont divisés en deux sources [feu](feu) et [tranchant](physique)." },
      { id:"feu_t0_pyroplastique", nom:"Détonation pyroplastique", branches:"*",
        description:"Vos dégâts sont divisés en deux sources [feu](feu) et [force](special)." },
    ],
    // ── T1 — Brasier ──────────────────────────────────────────────────────
    [
      { id:"feu_t1_incineration",  nom:"Incinération",           branches:"lien_persistant,arc_elementaire",
        description:"Vos sorts **[Lien persistant I+]** et **[Arc élémentaire I+]** déclenchent des explosions **3 mètres** autour de la cible principale du sort. Toute créature se trouvant dans la zone d'effet doit faire un jet de sauvegarde ou subir la moitié des dégâts du sort concerné." },
      { id:"feu_t1_brulure",       nom:"Brûlure",                branches:"*",
        description:"Vous appliquez des dégâts supplémentaire au prochain sort de [feu](feu) que vous lancez sur la cible à **Xd6** (X = Rank du sort) marquée par la brûlure.\n\n**OU**\n\n**[Brûlure amplifiée] – [Trait corrosif I+]** : L'effet de brûlure change et vos charges de corrosions appliquent **2 dégâts** supplémentaires par tours." },
    ],
    // ── T2 — Inferno ──────────────────────────────────────────────────────
    [
      { id:"feu_t2_afflux",        nom:"Afflux de destruction",  branches:"eclats_energie",
        description:"**[Éclats d'énergie I+]** génère un projectile supplémentaire." },
      { id:"feu_t2_attiser",       nom:"Attiser la flamme",      branches:"*",
        description:"**[Châtiment I+]** inflige un brulure entretenue par votre **[Concentration]** qui inflige **1d8** dégâts de [feu](feu) par tours.\n\n**OU**\n\n**[Nova I+]** et **[Nova canalisée I+]** infligent **2 dégâts** supplémentaires à l'ennemi subissant le jet de dégâts par ennemis touchés ce tour." },
    ],
    // ── T3 — Cataclysme ───────────────────────────────────────────────────
    [
      { id:"feu_t3_conflagration", nom:"Conflagration",          branches:"*",
        description:"La borne maximale des dés de dégâts augmente de **4**.\n\n**Exemple** : 1d8 → 1d12." },
      { id:"feu_t3_assecher",      nom:"Assécher",               branches:"intrusion_magique",
        description:"**[Intrusion magique I+]** impose le désavantage systématique aux jets de sauvegarde de la **Cible**." },
      { id:"feu_t3_scorie",        nom:"Scorie",                 branches:"*",
        description:"Vos sorts **ignorent les résistances au [feu](feu)** de la Cible, les immunités sont traitées comme des résistances." },
    ],
  ],
  froid:       [[],[],[],[]],
  foudre:      [[],[],[],[]],
  ombre:       [[],[],[],[]],
  lumiere:     [[],[],[],[]],
  necrotique:  [[],[],[],[]],
  nature:      [[],[],[],[]],
  acide:       [[],[],[],[]],
  arcane_force:[[],[],[],[]],
};

/* =========================================================
   FUSIONS ÉLÉMENTAIRES (max 2 éléments)
   =========================================================
   Une fusion combine exactement 2 éléments de base et est
   traitée comme un élément à part entière : sa propre carte,
   ses propres 4 tiers de maîtrise, sa propre couleur. Une
   fusion n'existe que si elle est explicitement déclarée ici
   — cocher 2 éléments dont la paire n'est pas définie ci-dessous
   n'est pas autorisé (le menu refuse la 2e sélection).

   Clé de combo : les 2 clés d'éléments triées par ordre
   alphabétique et jointes par "+" (ex: "acide+feu").
   Utilise la fonction comboKey(a,b) si tu ajoutes des entrées
   pour être sûr du format exact.
   ========================================================= */
function comboKey(a, b){
  return [a, b].sort().join('+');
}

const ELEMENT_COMBOS = {
  [comboKey('feu','acide')]: {
    label: "Feu + Acide",
    color: "#e08a3f",
    titre: "Vitriol Ardent",
    intro: "Vos dégâts combinent [feu](feu) et [acide](acide) : la cible brûle puis se corrode, les jets de sauvegarde sont de **Dextérité**.",
    tiers: [
      [
        { id:"combo_fa_t0_fusion", nom:"Fusion vitriolique", branches:"*",
          description:"Vos dégâts sont répartis à parts égales entre [feu](feu) et [acide](acide)." },
      ],
      [
        { id:"combo_fa_t1_corrosion_brulante", nom:"Corrosion brûlante", branches:"*",
          description:"La cible touchée subit **1d4 dégâts** supplémentaires au début de son prochain tour." },
      ],
      [
        { id:"combo_fa_t2_vapeurs_toxiques", nom:"Vapeurs toxiques", branches:"*",
          description:"Une fois la cible touchée, une zone de **2 mètres** autour d'elle inflige la moitié des dégâts aux créatures qui y entrent." },
      ],
      [
        { id:"combo_fa_t3_dissolution", nom:"Dissolution totale", branches:"*",
          description:"Si la cible est déjà affaiblie par un effet de feu ou d'acide, vos dégâts contre elle sont **maximisés**." },
      ],
    ],
  },
};

function lvl(id, nom, branche, niveau, parent_id, etat, opts){
  opts = opts || {};
  return {
    id, nom, branche, niveau, parent_id: parent_id || "",
    cout: opts.cout !== undefined ? opts.cout : niveau,
    etat, lien_slide: opts.lien || "", icone: opts.icone || "",
    ecole: opts.ecole, effets: opts.effets || "", description: opts.description || "",
    degats: opts.degats || "", portee: opts.portee || "", duree: opts.duree || "", action: opts.action || "",
    texte_special: opts.special || ""
  };
}

const DEMO_DATA = [
  // ===================== ÉVOCATION (inspirée du modèle de référence) =====================
  // Branche principale : Trait énergétique (0..VI)
  lvl("evo_te_0","Trait énergétique 0","trait_energetique",0,"","unlocked",{
    ecole:"evocation", icone:"⚡",
    description:"Vous ciblez une créature que vous pouvez voir, vous lancez une **attaque de sort à distance** [élémentaire](element) sur une **cible unique**.",
    degats:"1d8", portee:"18 mètres", duree:"Instantané", action:"Action",
    special:"**Affinité élémentaire 0** : Les éléments changent le type de dégât du sort.",
    effets:"+5% dégâts directs"
  }),
  lvl("evo_te_1","Trait énergétique I","trait_energetique",1,"","unlocked",{
    ecole:"evocation", icone:"⚡",
    description:"Vous ciblez une créature que vous pouvez voir, vous lancez une **attaque de sort à distance** [élémentaire](element) sur une **cible unique**.",
    degats:"1d10", portee:"18 mètres", duree:"Instantané", action:"Action",
    special:"**Affinité élémentaire I** : Les éléments changent le type de dégât du sort.",
    effets:"+10% dégâts directs"
  }),
  lvl("evo_te_2","Trait énergétique II","trait_energetique",2,"","available",{ecole:"evocation",icone:"⚡",effets:"+15% dégâts directs"}),
  lvl("evo_te_3","Trait énergétique III","trait_energetique",3,"","locked",{ecole:"evocation",icone:"⚡",effets:"+20% dégâts directs"}),
  lvl("evo_te_4","Trait énergétique IV","trait_energetique",4,"","locked",{ecole:"evocation",icone:"⚡",effets:"+25% dégâts directs"}),
  lvl("evo_te_5","Trait énergétique V","trait_energetique",5,"","locked",{ecole:"evocation",icone:"⚡",effets:"+30% dégâts directs"}),

  // Fork depuis Trait énergétique I -> Lien persistant (I..VI)
  lvl("evo_lp_1","Lien persistant I","lien_persistant",1,"evo_te_1","locked",{ecole:"evocation",icone:"🔗",effets:"Le sort reste actif 1 tour de plus"}),
  lvl("evo_lp_2","Lien persistant II","lien_persistant",2,"","locked",{ecole:"evocation",icone:"🔗"}),
  lvl("evo_lp_3","Lien persistant III","lien_persistant",3,"","locked",{ecole:"evocation",icone:"🔗"}),

  // Fork depuis Trait énergétique II -> Trait corrosif (I..V)
  lvl("evo_tc_1","Trait corrosif I","trait_corrosif",1,"evo_te_2","locked",{ecole:"evocation",icone:"🧪",effets:"Ajoute des dégâts corrosifs sur la durée"}),
  lvl("evo_tc_2","Trait corrosif II","trait_corrosif",2,"","locked",{ecole:"evocation",icone:"🧪"}),

  // Fork depuis Trait énergétique III -> Arc élémentaire (I..III)
  lvl("evo_ae_1","Arc élémentaire I","arc_elementaire",1,"evo_te_3","locked",{ecole:"evocation",icone:"🌈",effets:"Le sort touche une cible additionnelle"}),
  lvl("evo_ae_2","Arc élémentaire II","arc_elementaire",2,"","locked",{ecole:"evocation",icone:"🌈"}),

  // Branche principale : Nova (0..VI)
  lvl("evo_nova_0","Nova 0","nova",0,"","unlocked",{ecole:"evocation",icone:"💫",description:"Explosion d'énergie en zone autour du lanceur.",effets:"+10% dégâts en zone"}),
  lvl("evo_nova_1","Nova I","nova",1,"","unlocked",{ecole:"evocation",icone:"💫"}),
  lvl("evo_nova_2","Nova II","nova",2,"","available",{ecole:"evocation",icone:"💫"}),
  lvl("evo_nova_3","Nova III","nova",3,"","locked",{ecole:"evocation",icone:"💫"}),

  // Fork depuis Nova II -> Canalisation (I..IV)
  lvl("evo_can_1","Canalisation I","canalisation",1,"evo_nova_2","locked",{ecole:"evocation",icone:"🌀",effets:"Réduit le coût en mana de Nova de 20%"}),
  lvl("evo_can_2","Canalisation II","canalisation",2,"","locked",{ecole:"evocation",icone:"🌀"}),

  // Branche principale : Impact ciblé (I..VI)
  lvl("evo_ic_1","Impact ciblé I","impact_cible",1,"","unlocked",{ecole:"evocation",icone:"🎯",description:"Frappe précise sur une cible unique.",effets:"+12% dégâts sur cible unique"}),
  lvl("evo_ic_2","Impact ciblé II","impact_cible",2,"","available",{ecole:"evocation",icone:"🎯"}),
  lvl("evo_ic_3","Impact ciblé III","impact_cible",3,"","locked",{ecole:"evocation",icone:"🎯"}),

  // Fork depuis Impact ciblé I -> Persistance (I..V)
  lvl("evo_pers_1","Persistance I","persistance",1,"evo_ic_1","locked",{ecole:"evocation",icone:"⏱️",effets:"Le sort infinige des dégâts sur la durée"}),
  lvl("evo_pers_2","Persistance II","persistance",2,"","locked",{ecole:"evocation",icone:"⏱️"}),
  lvl("evo_pers_3","Persistance III","persistance",3,"","locked",{ecole:"evocation",icone:"⏱️"}),

  // Fork depuis Persistance III -> Cataclysme (I..II)
  lvl("evo_cata_1","Cataclysme I","cataclysme",1,"evo_pers_3","locked",{ecole:"evocation",icone:"🌋",cout:5,effets:"Sort ultime : dégâts dévastateurs en zone"}),
  lvl("evo_cata_2","Cataclysme II","cataclysme",2,"","locked",{ecole:"evocation",icone:"🌋",cout:6}),

  // Branche : Propagation (I..VI), part directement de l'école (comme dans le modèle)
  lvl("evo_prop_1","Propagation I","propagation",1,"","locked",{ecole:"evocation",icone:"🔥",description:"Le sort se propage aux cibles environnantes.",effets:"Propage 30% des dégâts aux cibles proches"}),
  lvl("evo_prop_2","Propagation II","propagation",2,"","locked",{ecole:"evocation",icone:"🔥"}),

  // Branche : Éclats d'énergie (0..VI), avec fork vers Missile magique
  lvl("evo_ee_0","Éclats d'énergie 0","eclats_energie",0,"","unlocked",{ecole:"evocation",icone:"✨",description:"Multiples petits projectiles d'énergie.",effets:"3 projectiles, +5% dégâts chacun"}),
  lvl("evo_ee_1","Éclats d'énergie I","eclats_energie",1,"","unlocked",{ecole:"evocation",icone:"✨"}),

  lvl("evo_mm_1","Missile magique I","missile_magique",1,"evo_ee_0","available",{ecole:"evocation",icone:"🔥",lien:"https://docs.google.com/presentation/d/EXEMPLE",effets:"Projectile increvable, touche toujours sa cible"}),
  lvl("evo_mm_2","Missile magique II","missile_magique",2,"","locked",{ecole:"evocation",icone:"🔥"}),

  // Branche : Intrusion magique (0..VI)
  lvl("evo_im_0","Intrusion magique 0","intrusion_magique",0,"","unlocked",{ecole:"evocation",icone:"🌐",description:"Perce les protections magiques adverses.",effets:"Ignore 15% des résistances magiques"}),
  lvl("evo_im_1","Intrusion magique I","intrusion_magique",1,"","locked",{ecole:"evocation",icone:"🌐"}),

  // Branche : Chatiment (0..V)
  lvl("evo_chat_0","Chatiment 0","chatiment",0,"","unlocked",{ecole:"evocation",icone:"⚔️",description:"Sort punitif contre les cibles affaiblies.",effets:"+20% dégâts contre cible sous 30% PV"}),
  lvl("evo_chat_1","Chatiment I","chatiment",1,"","locked",{ecole:"evocation",icone:"⚔️"}),

  // ===================== AUTRES ÉCOLES (structure simplifiée à 3-4 branches) =====================
  // ABJURATION
  lvl("abj_bouc_0","Bouclier 0","bouclier",0,"","unlocked",{ecole:"abjuration",icone:"🛡️",description:"Absorbe une partie des dégâts entrants.",effets:"Absorbe 10 points de dégâts"}),
  lvl("abj_bouc_1","Bouclier I","bouclier",1,"","unlocked",{ecole:"abjuration",icone:"🛡️"}),
  lvl("abj_bouc_2","Bouclier II","bouclier",2,"","available",{ecole:"abjuration",icone:"🛡️"}),
  lvl("abj_mur_1","Mur de Force I","mur_de_force",1,"abj_bouc_1","locked",{ecole:"abjuration",icone:"🧱",effets:"Bloque les attaques physiques 1 tour"}),
  lvl("abj_mur_2","Mur de Force II","mur_de_force",2,"","locked",{ecole:"abjuration",icone:"🧱"}),
  lvl("abj_diss_1","Dissipation I","dissipation",1,"","locked",{ecole:"abjuration",icone:"✨",description:"Annule les effets magiques actifs sur la cible.",effets:"Retire 1 effet magique"}),
  lvl("abj_diss_2","Dissipation II","dissipation",2,"","locked",{ecole:"abjuration",icone:"✨"}),

  // INVOCATION
  lvl("inv_lame_0","Lame spectrale 0","lame_spectrale",0,"","unlocked",{ecole:"invocation",icone:"🗡️",description:"Fait apparaître une arme temporaire.",effets:"+10% dégâts de mêlée"}),
  lvl("inv_lame_1","Lame spectrale I","lame_spectrale",1,"","unlocked",{ecole:"invocation",icone:"🗡️"}),
  lvl("inv_lame_2","Lame spectrale II","lame_spectrale",2,"","available",{ecole:"invocation",icone:"🗡️"}),
  lvl("inv_fam_1","Familier I","familier",1,"inv_lame_1","locked",{ecole:"invocation",icone:"🐺",effets:"Invoque un allié (15 PV)"}),
  lvl("inv_fam_2","Familier II","familier",2,"","locked",{ecole:"invocation",icone:"🐺"}),
  lvl("inv_porte_1","Porte dimensionnelle I","porte_dimensionnelle",1,"","locked",{ecole:"invocation",icone:"🌀",cout:4,description:"Ouvre un passage instantané.",effets:"Téléportation courte distance"}),

  // TRANSMUTATION
  lvl("tra_renf_0","Renforcement 0","renforcement",0,"","unlocked",{ecole:"transmutation",icone:"💪",description:"Augmente temporairement la force physique.",effets:"+10% force"}),
  lvl("tra_renf_1","Renforcement I","renforcement",1,"","unlocked",{ecole:"transmutation",icone:"💪"}),
  lvl("tra_renf_2","Renforcement II","renforcement",2,"","available",{ecole:"transmutation",icone:"💪"}),
  lvl("tra_peau_1","Peau de pierre I","peau_de_pierre",1,"tra_renf_1","locked",{ecole:"transmutation",icone:"🗿",effets:"+15% armure, -5% vitesse"}),
  lvl("tra_peau_2","Peau de pierre II","peau_de_pierre",2,"","locked",{ecole:"transmutation",icone:"🗿"}),
  lvl("tra_meta_1","Métamorphose I","metamorphose",1,"","locked",{ecole:"transmutation",icone:"🐉",cout:4,description:"Transforme le lanceur en créature puissante.",effets:"Transformation partielle, +stats"}),

  // DIVINATION
  lvl("div_det_0","Détection 0","detection",0,"","unlocked",{ecole:"divination",icone:"👁️",description:"Révèle la magie environnante.",effets:"Détecte la magie (rayon 5m)"}),
  lvl("div_det_1","Détection I","detection",1,"","unlocked",{ecole:"divination",icone:"👁️"}),
  lvl("div_det_2","Détection II","detection",2,"","available",{ecole:"divination",icone:"👁️"}),
  lvl("div_vision_1","Vision future I","vision_future",1,"div_det_1","locked",{ecole:"divination",icone:"🔮",effets:"+10% chance d'esquive"}),
  lvl("div_vision_2","Vision future II","vision_future",2,"","locked",{ecole:"divination",icone:"🔮"}),
  lvl("div_oeil_1","Œil omniscient I","oeil_omniscient",1,"","locked",{ecole:"divination",icone:"🌐",cout:4,description:"Perçoit tout le champ de bataille.",effets:"Révèle la zone, détecte l'invisible"}),

  // ILLUSION
  lvl("ill_image_0","Image miroir 0","image_miroir",0,"","unlocked",{ecole:"illusion",icone:"🪞",description:"Crée des copies illusoires.",effets:"+10% chance d'esquive"}),
  lvl("ill_image_1","Image miroir I","image_miroir",1,"","unlocked",{ecole:"illusion",icone:"🪞"}),
  lvl("ill_image_2","Image miroir II","image_miroir",2,"","available",{ecole:"illusion",icone:"🪞"}),
  lvl("ill_invis_1","Invisibilité I","invisibilite",1,"ill_image_1","locked",{ecole:"illusion",icone:"👻",effets:"Invisibilité totale, rompue par attaque"}),
  lvl("ill_invis_2","Invisibilité II","invisibilite",2,"","locked",{ecole:"illusion",icone:"👻"}),
  lvl("ill_double_1","Double fantôme I","double_fantome",1,"","locked",{ecole:"illusion",icone:"🎭",cout:4,description:"Crée un clone autonome.",effets:"Clone actif 2 tours"}),

  // ENCHANTEMENT
  lvl("ench_sugg_0","Suggestion 0","suggestion",0,"","unlocked",{ecole:"enchantement",icone:"💭",description:"Influence légèrement une décision.",effets:"+10% chance de persuasion"}),
  lvl("ench_sugg_1","Suggestion I","suggestion",1,"","unlocked",{ecole:"enchantement",icone:"💭"}),
  lvl("ench_sugg_2","Suggestion II","suggestion",2,"","available",{ecole:"enchantement",icone:"💭"}),
  lvl("ench_charme_1","Charme I","charme",1,"ench_sugg_1","locked",{ecole:"enchantement",icone:"💞",effets:"Cible neutre 1 tour"}),
  lvl("ench_charme_2","Charme II","charme",2,"","locked",{ecole:"enchantement",icone:"💞"}),
  lvl("ench_dom_1","Domination I","domination",1,"","locked",{ecole:"enchantement",icone:"👑",cout:5,description:"Prend le contrôle total d'une cible.",effets:"Contrôle total 1 tour"}),

  // NÉCROMANCIE
  lvl("nec_drain_0","Drain de vie 0","drain_de_vie",0,"","unlocked",{ecole:"necromancie",icone:"🩸",description:"Aspire l'énergie vitale de la cible.",effets:"Vole 10 PV à la cible"}),
  lvl("nec_drain_1","Drain de vie I","drain_de_vie",1,"","unlocked",{ecole:"necromancie",icone:"🩸"}),
  lvl("nec_drain_2","Drain de vie II","drain_de_vie",2,"","available",{ecole:"necromancie",icone:"🩸"}),
  lvl("nec_rean_1","Réanimation I","reanimation",1,"nec_drain_1","locked",{ecole:"necromancie",icone:"💀",effets:"Invoque un mort-vivant (10 PV)"}),
  lvl("nec_rean_2","Réanimation II","reanimation",2,"","locked",{ecole:"necromancie",icone:"💀"}),
  lvl("nec_touch_1","Toucher de la mort I","toucher_de_la_mort",1,"","locked",{ecole:"necromancie",icone:"☠️",cout:5,description:"Dégâts nécrotiques massifs au contact.",effets:"Dégâts nécrotiques majeurs"}),
];

/* ========================================================= */

const NODE_SIZE      = 52;
const COL_GAP        = 120;  // horizontal distance between tiers (X axis — left to right)
const ROW_GAP        = 85;   // vertical distance between branch rows (Y axis — top to bottom)
const TOP_PADDING    = 90;   // marge haute (assez pour que le nœud école soit visible)
const LEFT_PADDING   = 160;  // espace pour le nœud école racine à gauche
const ROOT_X_OFFSET  = 60;   // position X du nœud école racine

let allSkills = [];          // all skills for the current player, all schools
let schoolsOrder = [];        // list of school keys in encounter order
let currentSchool = null;     // active school key
let zoomLevel = 1;

// Profil joueur chargé depuis le Sheet joueur (lignes type="profil")
let playerProfile = {
  classe:       '',
  niveau:       1,
  points_total: 0,
  points_max:   999,
  tier_max:     999,
};

let selectedElements = new Set();   // element keys currently checked in the global menu
let masteryChoices = {};            // `${element}_t${tier}` -> chosen effect id (per element per tier)
let masteryViewOpen = false;        // whether the "Maîtrise élémentaire" view is showing
let masteryBranchFilter = null;     // branche key used to filter which effects show in mastery view

function getPlayerFromURL(){
  const params = new URLSearchParams(window.location.search);
  return params.get('joueur') || params.get('player') || '';
}