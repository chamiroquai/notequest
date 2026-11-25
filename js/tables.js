// Tables de jeu : elles ne sont PAS dans le code. Le joueur importe son propre fichier JSON
// (voir docs/FORMAT-TABLES.md). On garde une copie dans le stockage local de l'appareil.

const CLE = 'notequest.tables';

// Liste des tables attendues par l'application (identifiant → rôle).
export const TABLES_ATTENDUES = {
  races: 'Races (création de l\'aventurier)',
  classes: 'Classes (création de l\'aventurier)',
  sorts: 'Sorts de base',
  types_donjon: 'Type de donjon',
  boss: 'Boss du donjon (une colonne par groupe de donjon)',
  segments: 'Segments (colonnes : escalier, couloir, piece)',
  contenu: 'Contenu des salles (une colonne par groupe de donjon)',
  monstres: 'Monstres (une colonne par groupe de donjon)',
  porte: 'Porte',
  piege: 'Piège',
  coffre: 'Coffre',
  passage_secret: 'Passage secret',
  tresor: 'Trésor',
  objet_magique: 'Objet magique',
  autres_objets: 'Autres objets (colonnes : arme, armure, objet_merveilleux)',
};

let tables = null;

export function chargerTablesLocales() {
  try { tables = JSON.parse(localStorage.getItem(CLE) || 'null'); } catch { tables = null; }
  return tables;
}

export function tablesPresentes() { return !!tables; }
export function toutesLesTables() { return tables ? tables.tables : {}; }
export function table(id) { return tables && tables.tables ? tables.tables[id] : null; }
export function nomFichierTables() { return tables ? (tables.description || tables.titre || 'fichier importé') : ''; }

export function memo() { return tables && tables.memo && Array.isArray(tables.memo.sections) ? tables.memo : null; }

const sansAccent = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Sections du mémo liées à un moment du jeu (porte, combat, ville…).
export function reglesPour(contexte) {
  const m = memo();
  return m ? m.sections.filter((s) => Array.isArray(s.contexte) && s.contexte.includes(contexte)) : [];
}

// Explications des capacités de monstres : points « Nom : explication » des sections « monstres ».
export function expliquerCapacites(texte) {
  const gloss = [];
  for (const s of reglesPour('monstres')) for (const p of s.points || []) {
    const i = p.indexOf(':');
    if (i > 0) gloss.push({ cle: sansAccent(p.slice(0, i)), texte: p });
  }
  const res = [];
  for (const brut of String(texte || '').split(/[;,]/)) {
    const t = sansAccent(brut).replace(/\.$/, '').replace(/s$/, '');
    if (!t) continue;
    const g = gloss.find((x) => x.cle === t) || gloss.find((x) => x.cle.startsWith(t) || t.startsWith(x.cle));
    if (g && !res.includes(g.texte)) res.push(g.texte);
  }
  return res;
}

export function oublierTables() { localStorage.removeItem(CLE); tables = null; }

// Vérifie un fichier et renvoie { ok, erreurs[], avertissements[] }.
export function verifier(donnees) {
  const erreurs = [];
  const avert = [];
  if (!donnees || typeof donnees !== 'object') return { ok: false, erreurs: ['Le fichier ne contient pas de JSON valide.'], avertissements: [] };
  if (donnees.format !== 'notequest-tables') erreurs.push('Champ « format » absent ou différent de « notequest-tables ».');
  if (!donnees.tables || typeof donnees.tables !== 'object') {
    erreurs.push('Champ « tables » absent.');
    return { ok: false, erreurs, avertissements: avert };
  }
  for (const id of Object.keys(TABLES_ATTENDUES)) {
    const t = donnees.tables[id];
    if (!t) { avert.push(`Table « ${id} » absente : les jets correspondants ne seront pas proposés.`); continue; }
    if (!t.de) erreurs.push(`Table « ${id} » : champ « de » manquant (ex. « 1d6 »).`);
    const listes = t.colonnes ? Object.entries(t.colonnes).map(([k, c]) => [`${id}/${k}`, c.entrees]) : [[id, t.entrees]];
    for (const [nom, entrees] of listes) {
      if (!Array.isArray(entrees)) { erreurs.push(`Table « ${nom} » : liste « entrees » manquante.`); continue; }
      const vides = entrees.filter((e) => !e.texte && !e.nom).length;
      if (vides) avert.push(`Table « ${nom} » : ${vides} entrée(s) sans texte.`);
    }
  }
  return { ok: erreurs.length === 0, erreurs, avertissements: avert };
}

export function enregistrerTables(donnees) {
  localStorage.setItem(CLE, JSON.stringify(donnees));
  tables = donnees;
}

function correspond(entree, valeur) {
  const j = entree.jet;
  if (typeof j === 'number') return j === valeur;
  if (typeof j === 'string') {
    const m = j.match(/^\s*(\d+)\s*[-–]\s*(\d+)\s*$/);
    if (m) return valeur >= +m[1] && valeur <= +m[2];
    return parseInt(j, 10) === valeur;
  }
  if (Array.isArray(j)) return j.includes(valeur);
  return false;
}

// Les entrées d'une table (ou d'une de ses colonnes).
export function entreesDe(id, colonne) {
  const t = table(id);
  if (!t) return null;
  if (t.colonnes) {
    const c = t.colonnes[colonne];
    return c ? c.entrees : null;
  }
  return t.entrees;
}

export function chercher(id, valeur, colonne) {
  const entrees = entreesDe(id, colonne);
  if (!entrees) return null;
  return entrees.find((e) => correspond(e, valeur)) || null;
}

export function titreTable(id, colonne) {
  const t = table(id);
  if (!t) return TABLES_ATTENDUES[id] || id;
  let titre = t.titre || TABLES_ATTENDUES[id] || id;
  if (colonne && t.colonnes && t.colonnes[colonne]) titre += ' — ' + (t.colonnes[colonne].titre || colonne);
  return titre;
}

export function texteEntree(e) {
  if (!e) return '';
  const parts = [];
  if (e.nom) parts.push(e.nom);
  if (e.texte && e.texte !== e.nom) parts.push(e.texte);
  return parts.join(' — ');
}
