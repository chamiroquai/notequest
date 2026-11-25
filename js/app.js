// NoteQuest – carnet de donjon. L'application tient le carnet, dessine la carte et lit vos tables ;
// c'est toujours vous qui décidez et qui lancez (ou faites lancer) les dés.
import { h, choisir, informer, demanderTexte, ouvrirFenetre } from './ui.js';
import { jet, lireFormule } from './des.js';
import * as T from './tables.js';
import * as E from './etat.js';
import { DIR, emplacementsLibres, dessiner, activerNavigation, placer, positionsPortes, positionPorteSecrete, specParDefaut } from './carte.js';

const $ = (s) => document.querySelector(s);
const P = () => E.partie;
const vue = { tx: 0, ty: 0, s: 1 };
let nav;
let onglet = 'perso';
const MAX_TORCHES = 10;
const MAX_SAC = 10;

// ---------------------------------------------------------------- Démarrage

function demarrer() {
  T.chargerTablesLocales();
  E.charger();
  nav = activerNavigation($('#carte-zone'), $('#carte'), { surTap, vue });
  $('#btn-recentrer').onclick = () => nav.recentrer(P().donjon);
  $('#btn-zoom-plus').onclick = () => nav.zoomer(1.25);
  $('#btn-zoom-moins').onclick = () => nav.zoomer(0.8);
  document.querySelectorAll('#barre button').forEach((b) => (b.onclick = () => changerOnglet(b.dataset.onglet)));
  $('#fichier-tables').onchange = importerTables;
  $('#fichier-partie').onchange = importerPartie;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  changerOnglet(T.tablesPresentes() ? (P().perso ? (estLarge() ? 'segment' : 'carte') : 'perso') : 'plus');
  rendreTout();
  requestAnimationFrame(() => nav.recentrer(P().donjon));
  window.addEventListener('resize', () => rendreCarte());
}

const estLarge = () => window.matchMedia('(min-width: 900px)').matches;

function changerOnglet(nom) {
  if (nom === 'carte' && estLarge()) nom = 'segment';
  onglet = nom;
  document.body.classList.toggle('voir-carte', nom === 'carte');
  for (const id of ['perso', 'segment', 'journal', 'regles', 'plus']) $('#onglet-' + id).hidden = id !== nom;
  document.querySelectorAll('#barre button').forEach((b) => b.classList.toggle('actif', b.dataset.onglet === nom));
  if (nom === 'carte') requestAnimationFrame(() => nav.appliquer());
  rendrePanneau();
}

function rendreTout() { rendreEntete(); rendreCarte(); rendrePanneau(); }
function apresChangement() { E.sauver(); rendreTout(); }

// ---------------------------------------------------------------- Règles en contexte

// Encadré repliable avec les règles utiles au moment présent (vide si le mémo n'en a pas).
function regleEnLigne(contexte, ouvert = false) {
  const sections = T.reglesPour(contexte);
  if (!sections.length) return null;
  return h('div', {}, sections.map((s) => h('details', { class: 'memo regle', open: ouvert || undefined },
    h('summary', {}, '📖 ' + (s.titre || 'Règle')), h('ul', {}, (s.points || []).filter(Boolean).map((p) => h('li', {}, p))))));
}

function avecRegle(texte, contexte) {
  return h('div', {}, texte ? h('div', { class: 'carte-texte' }, texte) : null, regleEnLigne(contexte));
}

// Toute la table, pour la consulter sans ouvrir le livret.
function tableComplete(id, colonne, ouvert = false) {
  const entrees = T.entreesDe(id, colonne);
  if (!entrees || !entrees.length) return null;
  return h('details', { class: 'memo regle', open: ouvert || undefined }, h('summary', {}, '📋 Voir toute la table'),
    h('table', { class: 'table-jeu' }, entrees.map((e) => h('tr', {}, h('td', { class: 'jet' }, String(e.jet)), h('td', {}, T.texteEntree(e) || '—')))));
}

// ---------------------------------------------------------------- Jets sur les tables

function apercuEntree(id, colonne) {
  return (somme) => {
    const e = T.chercher(id, somme, colonne);
    if (!e) return h('div', { class: 'carte-texte petit' }, 'Aucune entrée pour ce résultat dans votre fichier de tables.');
    return h('div', { class: 'carte-texte' }, T.texteEntree(e) || '(entrée sans texte)');
  };
}

// Lance une table : le joueur saisit ou fait tirer. Renvoie { entree, somme, total } ou null.
async function jetTable(id, colonne, { explication } = {}) {
  const t = T.table(id);
  if (!t) { await informer('Table absente', `Votre fichier de tables ne contient pas la table « ${id} ». Ajoutez-la puis importez le fichier à nouveau (onglet Plus).`); return null; }
  if (t.colonnes && !t.colonnes[colonne]) { await informer('Colonne absente', `La table « ${id} » n'a pas de colonne « ${colonne} ».`); return null; }
  const titre = T.titreTable(id, colonne);
  const r = await jet({ titre, formule: t.de, apercu: apercuEntree(id, colonne), explication, annexe: tableComplete(id, colonne) });
  if (!r) return null;
  const entree = T.chercher(id, r.somme, colonne);
  E.noter('jet', `${titre} : ${r.des.join('+')}${r.des.length > 1 ? ' = ' + r.somme : ''} (${r.mode}) → ${entree ? T.texteEntree(entree) : 'aucune entrée'}`);
  return { ...r, entree };
}

async function jetLibre(titre, formule) {
  const r = await jet({ titre, formule });
  if (r) E.noter('jet', `${titre} (${formule}) : ${r.des.join('+')} → ${r.total} (${r.mode})`);
  return r;
}

// ---------------------------------------------------------------- Aventurier

async function creerAventurier() {
  if (!T.tablesPresentes()) return informer('Tables manquantes', 'Importez d\'abord votre fichier de tables (onglet Plus).');
  const race = await jetTable('races', null, { explication: 'Lancez pour la race de votre aventurier.' });
  if (!race) return;
  const classe = await jetTable('classes', null, { explication: 'Lancez maintenant pour la classe.' });
  if (!classe) return;
  const nom = (await demanderTexte({ titre: 'Nom de l\'aventurier', libelle: 'Facultatif', valeur: '' })) || 'Aventurier';
  const re = race.entree || {}, ce = classe.entree || {};
  const pvMax = (Number(re.pv) || 0) + (Number(ce.pv) || 0);
  const ancien = P().perso;
  if (ancien) P().anciens.push(ancien);
  P().perso = {
    nom, race: re.nom || '?', raceTexte: re.texte || '', classe: ce.nom || '?', classeTexte: ce.texte || '',
    pvMax, pv: pvMax, torches: MAX_TORCHES, pieces: 0, cles: 0, arme: ce.arme || '', sorts: [], sac: [], armures: [],
  };
  E.noter('evenement', `Nouvel aventurier : ${nom}, ${re.nom || '?'} ${ce.nom || '?'} — ${pvMax} PV, ${MAX_TORCHES} torches.`);
  apresChangement();
  await informer('Aventurier créé', h('div', {},
    h('div', { class: 'carte-texte' }, `${re.nom || '?'} : ${re.texte || '—'}`),
    h('div', { class: 'carte-texte' }, `${ce.nom || '?'} : ${ce.texte || '—'}`),
    h('p', { class: 'petit' }, 'Si votre race ou votre classe donne des sorts, des trésors ou des objets, lancez les tables correspondantes depuis l\'onglet Plus → Lancer une table, puis ajoutez le résultat à votre fiche.')));
}

function modifierPerso(champ, delta) {
  const p = P().perso; if (!p) return;
  p[champ] = Math.max(0, (Number(p[champ]) || 0) + delta);
  if (champ === 'torches' && p.torches > MAX_TORCHES) informer('Limite de charge', `Vous ne pouvez transporter que ${MAX_TORCHES} torches.`);
  apresChangement();
}

function depenserTorche(raison) {
  const p = P().perso; if (!p) return;
  p.torches = Math.max(0, p.torches - 1);
  E.noter('evenement', `−1 torche (${raison}). Reste ${p.torches}.`);
}

async function ajouterObjet(liste, nomInitial = '') {
  const p = P().perso; if (!p) return;
  const nom = await demanderTexte({ titre: liste === 'sorts' ? 'Ajouter un sort' : liste === 'armures' ? 'Ajouter une pièce d\'armure' : 'Ajouter un objet', libelle: 'Nom', valeur: nomInitial });
  if (!nom) return;
  if (liste === 'sorts') p.sorts.push({ nom, utilise: false });
  else if (liste === 'armures') {
    const pv = parseInt(await demanderTexte({ titre: 'PV de l\'armure', libelle: 'Nombre de PV', valeur: '' }), 10) || 0;
    p.armures.push({ nom, pv, pvMax: pv });
  } else {
    if (p.sac.length >= MAX_SAC) await informer('Sac plein', `Votre sac contient déjà ${MAX_SAC} objets. L'objet est ajouté, à vous de choisir quoi laisser.`);
    p.sac.push({ nom });
  }
  E.noter('evenement', `Ajouté (${liste}) : ${nom}`);
  apresChangement();
}

async function actionVille(quoi) {
  const p = P().perso; if (!p) return;
  if (p.pieces < 1) return informer('Pas assez de pièces', 'Il vous faut 1 pièce.');
  if (quoi === 'marchand') {
    if (p.torches >= MAX_TORCHES) return informer('Limite de charge', `Vous avez déjà ${MAX_TORCHES} torches.`);
    p.pieces--; p.torches++; E.noter('evenement', 'Ville – Marchand : 1 pièce → 1 torche.');
  } else if (quoi === 'pretre') {
    p.pieces--; p.pv = p.pvMax; p.sorts.forEach((s) => (s.utilise = false)); E.noter('evenement', 'Ville – Prêtre : PV et sorts récupérés.');
  } else if (quoi === 'forgeron') {
    if (!p.armures.length) return informer('Aucune armure', 'Vous n\'avez pas d\'armure à réparer.');
    const i = await choisir({ titre: 'Forgeron', texte: 'Quelle armure réparer ?', options: p.armures.map((a, i) => ({ label: `${a.nom} (${a.pv}/${a.pvMax})`, valeur: String(i) })) });
    if (i === null) return;
    p.pieces--; p.armures[+i].pv = p.armures[+i].pvMax; E.noter('evenement', `Ville – Forgeron : ${p.armures[+i].nom} réparée.`);
  }
  apresChangement();
}

async function mortAventurier() {
  const p = P().perso; if (!p) return;
  const ok = await choisir({ titre: 'Mort de l\'aventurier', texte: 'Votre aventurier est-il mort ? Son sac restera dans le segment où se trouve son pion, pour un prochain aventurier.', options: [{ label: 'Oui, il est mort', valeur: true, classe: 'danger' }] });
  if (!ok) return;
  const d = P().donjon;
  const seg = d && d.segments.find((s) => s.id === d.actuel);
  if (seg) { seg.depouille = { nom: p.nom, sac: p.sac.map((o) => o.nom), armures: p.armures.map((a) => a.nom), arme: p.arme, pieces: p.pieces }; }
  p.mort = true;
  E.noter('evenement', `${p.nom} est mort${seg ? ` dans le segment ${seg.num}` : ''}.`);
  apresChangement();
}

// ---------------------------------------------------------------- Donjon

function creerSegment(d, spec, rect, extra = {}) {
  d.compteur.seg++;
  const s = {
    id: E.nouvelId('s'), num: d.compteur.seg, genre: spec.genre, x: rect.x, y: rect.y, w: rect.w, h: rect.h,
    dir: extra.dir, niveau: extra.niveau || 1, secret: !!spec.secret, piege: !!spec.piege, piliers: !!spec.piliers,
    texte: extra.texte || '', contenu: [], monstres: [], notes: '', chevauche: !!extra.chevauche,
  };
  d.segments.push(s);
  return s;
}

function creerPorte(d, a, pos, extra = {}) {
  d.compteur.porte++;
  const p = { id: E.nouvelId('p'), num: d.compteur.porte, a, b: null, cx: pos.x ?? pos.cx, cy: pos.y ?? pos.cy, cote: pos.cote, etat: 'inconnue', ...extra };
  d.portes.push(p);
  return p;
}

// Ajoute un segment derrière une porte et crée ses portes.
function ajouterDerriere(d, porte, specBrute, { texte, niveau } = {}) {
  const spec = specParDefaut(specBrute);
  const obstacles = d.segments.concat(d.reserve || []);
  for (const sg of d.segments) for (const q of sg.passage || []) obstacles.push({ x: q.x, y: q.y, w: 1, h: 1 });
  // Évite de boucher les portes pas encore ouvertes.
  const souples = d.portes.filter((q) => !q.b && q !== porte).map((q) => ({ x: q.cx + DIR[q.cote].dx, y: q.cy + DIR[q.cote].dy, w: 1, h: 1 }));
  let pl = placer(obstacles, porte, spec, souples);
  // Pas de place derrière cette porte : on la déplace ailleurs sur le mur de son segment
  // (elle n'était pas encore ouverte, sa position exacte ne change rien au jeu).
  const proprio = segment(porte.a);
  if (pl.chevauche && proprio) {
    const origine = { cx: porte.cx, cy: porte.cy, cote: porte.cote };
    for (const pos of emplacementsLibres(proprio, porte, d.portes, obstacles)) {
      Object.assign(porte, pos);
      const essai = placer(obstacles, porte, spec, souples);
      if (!essai.chevauche) { pl = essai; break; }
    }
    if (pl.chevauche) Object.assign(porte, origine);
  }
  const s = creerSegment(d, spec, pl.rect, { dir: pl.dir, niveau, texte, chevauche: pl.chevauche });
  s.passage = pl.passage;
  porte.b = s.id;
  for (const pos of positionsPortes(pl.rect, pl.dir, pl.longueur, pl.largeur, spec.portes, spec.fond)) creerPorte(d, s.id, pos);
  if (spec.suite) {
    const fond = d.portes.filter((p) => p.a === s.id).find((p) => p.cote === pl.dir) || creerPorte(d, s.id, { ...positionsPortes(pl.rect, pl.dir, pl.longueur, pl.largeur, 1, true)[0] });
    fond.etat = 'ouverte';
    const n2 = specParDefaut(spec.suite).genre === 'escalier' ? niveau + 1 : niveau;
    ajouterDerriere(d, fond, spec.suite, { texte: '', niveau: n2 });
  }
  return { seg: s, chevauche: pl.chevauche };
}

async function nouveauDonjon() {
  if (!T.tablesPresentes()) return informer('Tables manquantes', 'Importez d\'abord votre fichier de tables (onglet Plus).');
  if (P().donjon) {
    const ok = await choisir({ titre: 'Nouveau donjon', texte: 'La carte actuelle sera remplacée (pensez à exporter votre partie si vous voulez la garder).', options: [{ label: 'Commencer un nouveau donjon', valeur: true, classe: 'danger' }] });
    if (!ok) return;
  }
  const type = await jetTable('types_donjon', null, { explication: 'Lancez pour le type de donjon.' });
  if (!type) return;
  const te = type.entree || {};
  let groupe = te.groupe;
  const colonnesBoss = T.table('boss')?.colonnes ? Object.keys(T.table('boss').colonnes) : [];
  if (!groupe && colonnesBoss.length) {
    groupe = await choisir({ titre: 'Groupe du donjon', texte: 'Votre table ne précise pas le groupe de ce type de donjon. Quelle colonne utiliser pour le boss, le contenu et les monstres ?', options: colonnesBoss.map((k) => ({ label: T.table('boss').colonnes[k].titre || k, valeur: k })), annuler: null });
  }
  const boss = await jetTable('boss', groupe, { explication: 'Lancez pour le boss du donjon.' });
  const nom = (await demanderTexte({ titre: 'Nom du donjon', libelle: 'Facultatif', valeur: te.nom || '' })) || te.nom || 'Donjon';
  const d = { nom, type: te.nom || '', typeTexte: te.texte || '', groupe, boss: boss ? boss.entree : null, segments: [], portes: [], actuel: null, compteur: { seg: 0, porte: 0 }, salleFinale: false,
    reserve: [{ x: -2, y: -3, w: 5, h: 3 }] }; // place gardée pour la flèche « Entrée »
  // Segment de départ, juste sous l'entrée.
  const spec = specParDefaut(te.depart || { genre: 'escalier', portes: 1 });
  const entreeVirtuelle = { cx: 0, cy: -1, cote: 'S' };
  const r = ajouterDerriere(d, entreeVirtuelle, spec, { texte: te.texte || '', niveau: 1 });
  d.actuel = r.seg.id;
  P().donjon = d;
  P().selection = r.seg.id;
  E.noter('evenement', `Nouveau donjon : ${nom}${boss && boss.entree ? ` — boss : ${T.texteEntree(boss.entree)}` : ''}.`);
  apresChangement();
  nav.recentrer(d);
  if (P().perso) {
    const t = await choisir({ titre: 'Entrer dans le donjon', texte: 'En entrant dans un donjon, on consomme une torche.', options: [{ label: 'Entrer (−1 torche)', valeur: true, classe: 'principal' }], annuler: 'Je gère moi-même' });
    if (t) { depenserTorche('entrée dans le donjon'); P().donjon.dansDonjon = true; apresChangement(); }
  }
}

function segment(id) { return P().donjon?.segments.find((s) => s.id === id); }
function colonneSegment(seg) { return seg.genre === 'escalier' ? 'escalier' : seg.genre === 'couloir' ? 'couloir' : 'piece'; }
function nomGenre(seg) {
  return { couloir: 'Couloir', piece: 'Pièce', escalier: 'Escalier', salle_finale: 'Salle finale' }[seg.genre] || seg.genre;
}

async function surTap(cible) {
  const d = P().donjon; if (!d) return;
  if (cible.porte) return menuPorte(d.portes.find((p) => p.id === cible.porte));
  if (cible.seg) { P().selection = cible.seg; E.sauver(); changerOnglet('segment'); rendreCarte(); }
}

async function menuPorte(p) {
  const d = P().donjon;
  const a = segment(p.a), b = p.b && segment(p.b);
  if (b) {
    const options = [];
    for (const s of [a, b]) if (s && s.id !== d.actuel) options.push({ label: `Aller au segment ${s.num} (${nomGenre(s)})`, valeur: s.id, classe: 'principal' });
    options.push({ label: p.etat === 'verrouillee' ? 'Marquer ouverte' : 'Marquer verrouillée', valeur: 'basculer' });
    const v = await choisir({ titre: `Porte ${p.num}`, texte: `Entre le segment ${a ? a.num : 'entrée'} et le segment ${b.num}. État : ${p.etat}.`, options });
    if (!v) return;
    if (v === 'basculer') p.etat = p.etat === 'verrouillee' ? 'ouverte' : 'verrouillee';
    else { d.actuel = v; P().selection = v; E.noter('evenement', `Déplacement vers le segment ${segment(v).num}.`); }
    return apresChangement();
  }
  const ici = a && a.id === d.actuel;
  const v = await choisir({
    titre: `Porte ${p.num}${p.secrete ? ' (passage secret)' : ''}`,
    texte: ici ? 'Porte encore inconnue.' : `Porte encore inconnue. Votre pion n'est pas dans le segment ${a ? a.num : ''} : vous pouvez tout de même l'ouvrir.`,
    options: [{ label: p.etat === 'verrouillee' ? 'Retenter d\'ouvrir cette porte' : 'Ouvrir cette porte', valeur: 'ouvrir', classe: 'principal' }],
  });
  if (v === 'ouvrir') ouvrirPorte(p);
}

async function ouvrirPorte(p) {
  const d = P().donjon;
  const depuis = segment(p.a);
  let bruit = false;
  // 1. La porte
  if (!p.secrete && p.etat !== 'debloquee') {
    const r = await jetTable('porte', null, { explication: 'La porte est-elle ouverte ?' });
    if (!r) return;
    const e = r.entree || {};
    if (e.fermee) {
      const v = await choisir({ titre: 'Porte fermée', texte: avecRegle(T.texteEntree(e), 'porte'), options: [
        { label: 'Utiliser une clé', valeur: 'cle', detail: P().perso ? `${P().perso.cles || 0} clé(s) notée(s)` : '' },
        { label: 'Crocheter la serrure (−1 torche)', valeur: 'crocheter' },
        { label: 'Casser la porte', valeur: 'casser', detail: 'alerte les monstres du segment' },
        { label: 'Utiliser un sort ou une capacité', valeur: 'sort' },
        { label: 'La laisser fermée', valeur: 'laisser' },
      ], annuler: null });
      if (v === 'laisser') { p.etat = 'verrouillee'; E.noter('evenement', `Porte ${p.num} laissée fermée.`); return apresChangement(); }
      if (v === 'crocheter') depenserTorche('crochetage');
      if (v === 'casser') { bruit = true; p.etat = 'cassee'; E.noter('evenement', `Porte ${p.num} cassée : les monstres sont alertés.`); }
      if (v === 'cle') E.noter('evenement', `Porte ${p.num} ouverte avec une clé.`);
      if (v === 'sort') E.noter('evenement', `Porte ${p.num} ouverte par un sort ou une capacité.`);
    }
    if (e.piege) {
      const v = await choisir({ titre: 'Piège possible', texte: avecRegle(T.texteEntree(e), 'piege'), options: [
        { label: 'Désamorcer (−1 torche)', valeur: 'desamorcer' },
        { label: 'Lancer le dé de piège', valeur: 'lancer', classe: 'principal' },
      ], annuler: 'Je gère moi-même' });
      if (v === 'desamorcer') { depenserTorche('désamorçage'); E.noter('evenement', 'Piège désamorcé.'); }
      if (v === 'lancer') { const t = await jetTable('piege'); if (t) await informer('Piège', h('div', {}, h('div', { class: 'carte-texte' }, T.texteEntree(t.entree) || '—'), h('p', { class: 'petit' }, 'Appliquez vous-même les effets sur votre fiche (PV, torches…).'))); }
    }
  }
  // 2. Ce qu'il y a derrière
  let spec = null, texte = '', niveau = depuis ? depuis.niveau : 1;
  if (depuis && depuis.genre === 'escalier' && depuis.niveau >= 3 && !d.salleFinale) {
    const v = await choisir({ titre: `Niveau ${depuis.niveau}`, texte: avecRegle('Vous entrez dans le troisième niveau : selon les règles, c\'est la salle finale du boss.', 'salle_finale'), options: [
      { label: 'Placer la salle finale', valeur: 'finale', classe: 'principal' },
      { label: 'Lancer la table des segments quand même', valeur: 'table' },
    ], annuler: null });
    if (v === 'finale') { spec = { genre: 'salle_finale', largeur: 7, longueur: 9, portes: 0 }; texte = 'Salle finale : grande salle sans portes, le boss au centre.'; }
  }
  if (!spec) {
    const col = depuis ? colonneSegment(depuis) : 'escalier';
    const r = await jetTable('segments', col, { explication: 'Qu\'y a-t-il derrière la porte ?' });
    if (!r) return;
    const e = r.entree || {};
    texte = T.texteEntree(e);
    spec = e.segment && e.segment.genre ? { ...e.segment } : null;
    if (!spec) {
      const g = await choisir({ titre: 'Type de segment', texte: 'Votre table ne précise pas la forme du segment. Que faut-il dessiner ?', options: [
        { label: 'Couloir', valeur: 'couloir' }, { label: 'Pièce', valeur: 'piece' }, { label: 'Escalier', valeur: 'escalier' },
      ], annuler: null });
      spec = { genre: g };
    }
  }
  if (spec.genre === 'escalier') niveau += 1;
  if (p.etat !== 'cassee') p.etat = 'ouverte';
  const { seg, chevauche } = ajouterDerriere(d, p, spec, { texte, niveau });
  if (spec.genre === 'salle_finale') {
    d.salleFinale = true;
    if (d.boss) ajouterMonstreDepuisDescr(seg, { nom: d.boss.nom || 'Boss', pv: d.boss.pv, degats: d.boss.degats, capacites: d.boss.capacites || d.boss.texte || '' });
    seg.contenu.push({ texte: 'Derrière le boss : 1d6 coffres (lancez le nombre, puis « Ouvrir un coffre »).' });
  }
  E.noter('evenement', `Porte ${p.num} → segment ${seg.num} (${nomGenre(seg)}${seg.genre === 'escalier' ? `, niveau ${seg.niveau}` : ''}) : ${texte}`);
  P().selection = seg.id;
  apresChangement();
  const opts = [{ label: 'Entrer (déplacer mon pion)', valeur: 'entrer', classe: 'principal' }];
  const estPiece = seg.genre === 'piece' || seg.genre === 'salle_finale';
  if (estPiece) opts.push({ label: 'Entrer et lancer Contenu puis Monstres', valeur: 'tout' });
  const v = await choisir({ titre: `Segment ${seg.num}`, texte: h('div', {},
    h('div', { class: 'carte-texte' }, texte || nomGenre(seg)),
    chevauche ? h('p', { class: 'petit' }, 'Pas de place libre : le segment est dessiné en pointillés par-dessus un autre.') : null,
    bruit ? h('p', { class: 'petit' }, 'La porte a été cassée : les monstres présents attaquent en premier.') : null), options: opts, annuler: 'Rester ici' });
  if (v === 'entrer' || v === 'tout') { d.actuel = seg.id; apresChangement(); }
  if (v === 'tout') { await lancerContenu(seg); if (seg.genre !== 'salle_finale') await lancerMonstres(seg); }
  changerOnglet(estLarge() ? 'segment' : onglet);
}

async function lancerContenu(seg) {
  const r = await jetTable('contenu', P().donjon.groupe);
  if (!r) return;
  seg.contenu.push({ texte: T.texteEntree(r.entree) || `Résultat ${r.somme}` });
  apresChangement();
}

async function ajouterMonstreDepuisDescr(seg, m) {
  let nombre = 1;
  if (typeof m.nombre === 'string' && lireFormule(m.nombre)) {
    const r = await jetLibre(`Nombre : ${m.nom}`, m.nombre);
    nombre = r ? r.total : 1;
  } else if (Number(m.nombre) > 0) nombre = Number(m.nombre);
  for (let i = 0; i < nombre; i++) {
    seg.monstres.push({ id: E.nouvelId('m'), nom: nombre > 1 ? `${m.nom} ${i + 1}` : m.nom, pv: Number(m.pv) || 0, pvMax: Number(m.pv) || 0, degats: m.degats ?? '', capacites: m.capacites || '' });
  }
}

async function lancerMonstres(seg) {
  const r = await jetTable('monstres', P().donjon.groupe);
  if (!r) return;
  const e = r.entree || {};
  if (Array.isArray(e.monstres) && e.monstres.length) {
    for (const m of e.monstres) await ajouterMonstreDepuisDescr(seg, m);
  } else if (e.texte && !e.aucun) {
    seg.contenu.push({ texte: 'Monstres : ' + T.texteEntree(e) });
  }
  apresChangement();
}

async function ajouterMonstreManuel(seg) {
  const nom = await demanderTexte({ titre: 'Ajouter un monstre', libelle: 'Nom' });
  if (!nom) return;
  const pv = parseInt(await demanderTexte({ titre: nom, libelle: 'Points de vie' }), 10) || 0;
  const degats = await demanderTexte({ titre: nom, libelle: 'Dégâts' });
  seg.monstres.push({ id: E.nouvelId('m'), nom, pv, pvMax: pv, degats: degats || '', capacites: '' });
  apresChangement();
}

async function chercherPassage(seg) {
  const ok = await choisir({ titre: 'Passage secret', texte: avecRegle('Chercher un passage secret coûte 1 torche.', 'passage_secret'), options: [{ label: 'Chercher (−1 torche)', valeur: true, classe: 'principal' }] });
  if (!ok) return;
  depenserTorche('recherche de passage secret');
  const r = await jetTable('passage_secret');
  seg.fouille = true;
  if (!r) return apresChangement();
  const e = r.entree || {};
  if (e.piege) await lancerEtProposer('piege');
  if (e.segment && e.segment.genre) {
    const d = P().donjon;
    const pos = positionPorteSecrete(seg, d.portes, d.segments);
    const p = creerPorte(d, seg.id, pos, { secrete: true, etat: 'ouverte' });
    const spec = { ...e.segment };
    const niveau = seg.niveau + (specParDefaut(spec).genre === 'escalier' ? 1 : 0);
    const res = ajouterDerriere(d, p, spec, { texte: T.texteEntree(e), niveau });
    E.noter('evenement', `Passage secret dans le segment ${seg.num} → segment ${res.seg.num}.`);
  } else if (e.texte) {
    seg.contenu.push({ texte: 'Passage secret : ' + T.texteEntree(e) });
  }
  apresChangement();
}

async function lancerEtProposer(id, colonne) {
  const r = await jetTable(id, colonne);
  if (!r) return;
  const texte = T.texteEntree(r.entree) || `Résultat ${r.somme}`;
  const seg = segment(P().selection);
  const v = await choisir({ titre: T.titreTable(id, colonne), texte, options: [
    P().perso && { label: 'Ajouter au sac', valeur: 'sac' },
    P().perso && { label: 'Ajouter aux sorts', valeur: 'sorts' },
    P().perso && { label: 'Ajouter comme armure', valeur: 'armures' },
    seg && { label: `Noter dans le segment ${seg.num}`, valeur: 'segment' },
  ], annuler: 'C\'est noté au journal' });
  const nom = r.entree ? (r.entree.nom || r.entree.texte || '') : '';
  if (v === 'segment') { seg.contenu.push({ texte }); apresChangement(); }
  else if (v) ajouterObjet(v, nom);
  else rendreTout();
}

// ---------------------------------------------------------------- Tables et sauvegardes

async function importerTables(ev) {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  let donnees;
  try { donnees = JSON.parse(await f.text()); } catch { return informer('Fichier illisible', 'Ce fichier n\'est pas un JSON valide. Vérifiez les virgules et les guillemets.'); }
  const v = T.verifier(donnees);
  const details = h('div', {},
    v.erreurs.length ? h('div', { class: 'carte-texte' }, h('b', {}, 'Erreurs'), h('ul', {}, v.erreurs.map((e) => h('li', {}, e)))) : null,
    v.avertissements.length ? h('div', { class: 'carte-texte petit' }, h('b', {}, 'À vérifier'), h('ul', {}, v.avertissements.slice(0, 12).map((e) => h('li', {}, e)))) : null);
  if (!v.ok) return informer('Fichier refusé', details);
  T.enregistrerTables(donnees);
  E.noter('evenement', `Tables importées : ${f.name}`);
  rendreTout();
  informer('Tables importées', v.avertissements.length ? details : 'Toutes les tables sont présentes.');
}

async function importerPartie(ev) {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  try {
    const p = E.lireSauvegarde(await f.text());
    const ok = await choisir({ titre: 'Importer une partie', texte: 'La partie en cours sur cet appareil sera remplacée.', options: [{ label: 'Remplacer', valeur: true, classe: 'danger' }] });
    if (!ok) return;
    E.remplacer(p);
    rendreTout();
    nav.recentrer(P().donjon);
  } catch (e) { informer('Import impossible', e.message); }
}

// ---------------------------------------------------------------- Affichage

function rendreEntete() {
  const p = P().perso, d = P().donjon;
  const r = $('#resume'); r.innerHTML = '';
  if (p) r.append(h('span', {}, '❤️ ', h('b', {}, `${p.pv}/${p.pvMax}`)), h('span', {}, '🔥 ', h('b', {}, p.torches)), h('span', {}, '🪙 ', h('b', {}, p.pieces)));
  if (d) { const s = segment(d.actuel); r.append(h('span', {}, '🏰 ', h('b', {}, d.nom), s ? ` · niv. ${s.niveau}` : '')); }
  $('#alerte-tenebres').hidden = !(p && d && d.dansDonjon && p.torches === 0 && !p.mort);
}

function rendreCarte() {
  const d = P().donjon;
  dessiner($('#carte'), d);
  $('#carte-vide').textContent = d ? '' : (T.tablesPresentes() ? 'Aucun donjon pour l\'instant. Ouvrez l\'onglet « Ici » et lancez un nouveau donjon.' : 'Commencez par importer votre fichier de tables (onglet Plus).');
  // Surligne la sélection
  if (d && P().selection) {
    const r = $('#carte').querySelector(`[data-seg="${P().selection}"]`);
    if (r) { r.setAttribute('fill', 'rgba(138,59,44,0.08)'); }
  }
  nav.appliquer();
}

function rendrePanneau() {
  if (onglet === 'perso') rendrePerso();
  if (onglet === 'segment') rendreSegment();
  if (onglet === 'journal') rendreJournal();
  if (onglet === 'regles') rendreRegles();
  if (onglet === 'plus') rendrePlus();
}

function compteur(libelle, valeur, champ, extra) {
  return h('div', { class: 'compteur' }, h('span', {}, libelle), h('button', { onclick: () => modifierPerso(champ, -1) }, '−'), h('span', { class: 'val' }, valeur), h('button', { onclick: () => modifierPerso(champ, +1) }, '+'), extra);
}

function rendrePerso() {
  const o = $('#onglet-perso'); o.innerHTML = '';
  const p = P().perso;
  if (!p || p.mort) {
    o.append(h('h2', {}, p && p.mort ? `${p.nom} n'est plus…` : 'Aucun aventurier'),
      h('p', {}, 'Lancez (ou saisissez) les dés pour la race et la classe.'),
      h('button', { class: 'bouton principal plein', onclick: creerAventurier }, '🎲 Créer un aventurier'));
    return;
  }
  o.append(h('h2', {}, p.nom), h('p', { class: 'petit' }, `${p.race} · ${p.classe}`));
  o.append(
    compteur('Points de vie', p.pv, 'pv'),
    compteur('PV maximum', p.pvMax, 'pvMax'),
    compteur('Torches', p.torches, 'torches'),
    compteur('Pièces', p.pieces, 'pieces'),
    compteur('Clés', p.cles || 0, 'cles'));
  const arme = h('input', { type: 'text', value: p.arme });
  arme.onchange = () => { p.arme = arme.value; apresChangement(); };
  o.append(h('label', { class: 'champ' }, h('span', {}, 'Arme'), arme));
  const f = lireFormule((p.arme.match(/\d*d6\s*[+-]?\s*\d*/i) || [''])[0]);
  if (f) o.append(h('button', { class: 'bouton', onclick: () => jetLibre('Dégâts de l\'arme', (p.arme.match(/\d*d6\s*[+-]?\s*\d*/i) || [''])[0].replace(/\s+/g, '')).then(rendreTout) }, '🎲 Dégâts de l\'arme'));

  o.append(h('h3', {}, 'Capacités'), h('div', { class: 'carte-texte petit' }, `${p.race} : ${p.raceTexte || '—'}`), h('div', { class: 'carte-texte petit' }, `${p.classe} : ${p.classeTexte || '—'}`));

  o.append(h('h3', {}, 'Sorts'), h('ul', { class: 'liste' }, p.sorts.map((s, i) => h('li', { class: s.utilise ? 'utilise' : '' },
    h('span', { class: 'nom' }, s.nom),
    h('button', { class: 'mini', onclick: () => { s.utilise = !s.utilise; E.noter('evenement', `Sort ${s.utilise ? 'utilisé' : 'récupéré'} : ${s.nom}`); apresChangement(); } }, s.utilise ? 'Récupérer' : 'Utiliser'),
    h('button', { class: 'mini', onclick: () => { p.sorts.splice(i, 1); apresChangement(); } }, '✕')))),
  h('button', { class: 'bouton', onclick: () => ajouterObjet('sorts') }, '+ Sort'));

  o.append(h('h3', {}, `Sac (${p.sac.length}/${MAX_SAC})`), h('ul', { class: 'liste' }, p.sac.map((s, i) => h('li', {},
    h('span', { class: 'nom' }, s.nom),
    h('button', { class: 'mini', onclick: () => { p.sac.splice(i, 1); E.noter('evenement', `Retiré du sac : ${s.nom}`); apresChangement(); } }, '✕')))),
  h('button', { class: 'bouton', onclick: () => ajouterObjet('sac') }, '+ Objet'));

  o.append(h('h3', {}, 'Armure'), h('ul', { class: 'liste' }, p.armures.map((a, i) => h('li', {},
    h('span', { class: 'nom' }, `${a.nom}`),
    h('button', { class: 'mini', onclick: () => { a.pv = Math.max(0, a.pv - 1); apresChangement(); } }, '−'),
    h('span', {}, `${a.pv}/${a.pvMax}`),
    h('button', { class: 'mini', onclick: () => { a.pv = a.pv + 1; apresChangement(); } }, '+'),
    h('button', { class: 'mini', onclick: () => { p.armures.splice(i, 1); apresChangement(); } }, '✕')))),
  h('button', { class: 'bouton', onclick: () => ajouterObjet('armures') }, '+ Armure'));

  o.append(h('h3', {}, 'En ville'), h('p', { class: 'petit' }, 'Chaque service coûte 1 pièce.'), regleEnLigne('ville'),
    h('button', { class: 'bouton', onclick: () => actionVille('marchand') }, 'Marchand : +1 torche'),
    h('button', { class: 'bouton', onclick: () => actionVille('pretre') }, 'Prêtre : PV et sorts'),
    h('button', { class: 'bouton', onclick: () => actionVille('forgeron') }, 'Forgeron : armure'));
  o.append(h('h3', {}, 'Fin'), h('button', { class: 'bouton danger', onclick: mortAventurier }, '☠ Mon aventurier est mort'));
}

function rendreSegment() {
  const o = $('#onglet-segment'); o.innerHTML = '';
  const d = P().donjon;
  if (!d) {
    o.append(h('h2', {}, 'Pas encore de donjon'), h('p', {}, 'Le donjon se construit porte après porte. Commencez par son type et son boss.'),
      h('button', { class: 'bouton principal plein', onclick: nouveauDonjon }, '🎲 Nouveau donjon'));
    if (!P().perso) o.append(h('p', { class: 'petit' }, 'Astuce : créez d\'abord votre aventurier (onglet Aventurier).'));
    return;
  }
  const seg = segment(P().selection) || segment(d.actuel);
  o.append(h('h2', {}, d.nom), h('p', { class: 'petit' }, [d.type !== d.nom && d.type, d.boss ? `Boss : ${T.texteEntree(d.boss)}` : ''].filter(Boolean).join(' · ')));
  if (!seg) return;
  const ici = seg.id === d.actuel;
  o.append(h('h3', {}, `Segment ${seg.num} · ${nomGenre(seg)} ${seg.w}×${seg.h} · niveau ${seg.niveau}`));
  if (seg.texte) o.append(h('div', { class: 'carte-texte' }, seg.texte));
  const tags = [];
  if (ici) tags.push('votre pion est ici');
  if (seg.secret) tags.push(seg.fouille ? 'passage secret cherché' : 'peut avoir un passage secret');
  if (seg.piege) tags.push('peut contenir un piège');
  o.append(h('div', {}, tags.map((t) => h('span', { class: 'etiquette' }, t))));
  if (!ici) o.append(h('button', { class: 'bouton principal', onclick: () => { d.actuel = seg.id; E.noter('evenement', `Déplacement vers le segment ${seg.num}.`); apresChangement(); } }, 'Placer mon pion ici'));

  if (seg.depouille) o.append(h('div', { class: 'carte-texte' }, `Ici gît ${seg.depouille.nom} : ${[seg.depouille.arme, ...seg.depouille.armures, ...seg.depouille.sac].filter(Boolean).join(', ') || 'rien'}${seg.depouille.pieces ? `, ${seg.depouille.pieces} pièces` : ''}.`));

  const estPiece = seg.genre === 'piece' || seg.genre === 'salle_finale';
  o.append(h('h3', {}, 'Contenu'));
  if (seg.contenu.length) o.append(h('ul', { class: 'liste' }, seg.contenu.map((c, i) => h('li', {}, h('span', { class: 'nom' }, c.texte), h('button', { class: 'mini', onclick: () => { seg.contenu.splice(i, 1); apresChangement(); } }, '✕')))));
  else o.append(h('p', { class: 'petit' }, 'Rien de noté.'));
  const actions = h('div', { class: 'ligne' });
  if (estPiece) actions.append(h('button', { class: 'bouton', onclick: () => lancerContenu(seg) }, '🎲 Contenu'));
  if (seg.genre !== 'salle_finale') actions.append(h('button', { class: 'bouton', onclick: () => lancerMonstres(seg) }, '🎲 Monstres'));
  if (seg.piege) actions.append(h('button', { class: 'bouton', onclick: () => lancerEtProposer('piege') }, '🎲 Piège'));
  if (seg.secret) actions.append(h('button', { class: 'bouton', onclick: () => chercherPassage(seg) }, '🔍 Passage secret (−1 torche)'));
  actions.append(h('button', { class: 'bouton', onclick: () => lancerEtProposer('coffre') }, '🎲 Ouvrir un coffre'));
  actions.append(h('button', { class: 'bouton', onclick: () => lancerEtProposer('tresor') }, '🎲 Trésor'));
  o.append(actions);

  o.append(h('h3', {}, 'Monstres et combat'), regleEnLigne('combat'));
  if (!seg.monstres.length) o.append(h('p', { class: 'petit' }, 'Aucun monstre noté.'));
  for (const m of seg.monstres) {
    o.append(h('div', { class: 'monstre' + (m.pv <= 0 ? ' mort' : '') },
      h('div', { class: 'ligne' }, h('b', { style: 'flex:1' }, m.nom), h('span', { class: 'petit' }, `Dégâts ${m.degats}`)),
      m.capacites ? (() => {
        const ex = T.expliquerCapacites(m.capacites);
        return ex.length ? h('ul', { class: 'capacites' }, ex.map((x) => h('li', {}, x))) : h('div', { class: 'petit' }, m.capacites);
      })() : null,
      h('div', { class: 'ligne' },
        h('button', { class: 'mini', onclick: () => { m.pv = Math.max(0, m.pv - 1); apresChangement(); } }, '−1'),
        h('button', { class: 'mini', onclick: async () => { const v = parseInt(await demanderTexte({ titre: `Dégâts infligés à ${m.nom}`, libelle: 'Nombre' }), 10); if (v) { m.pv = Math.max(0, m.pv - v); E.noter('evenement', `${m.nom} subit ${v} dégâts (${m.pv} PV).`); apresChangement(); } } }, '−…'),
        h('span', { class: 'val', style: 'font-family:var(--main);font-size:20px' }, `${m.pv}/${m.pvMax} PV`),
        h('button', { class: 'mini', onclick: () => { m.pv++; apresChangement(); } }, '+1'),
        h('button', { class: 'mini', onclick: () => { seg.monstres = seg.monstres.filter((x) => x !== m); apresChangement(); } }, '✕'))));
  }
  o.append(h('div', { class: 'ligne' },
    h('button', { class: 'bouton', onclick: () => ajouterMonstreManuel(seg) }, '+ Monstre'),
    seg.monstres.length ? h('button', { class: 'bouton', onclick: async () => { const ok = await choisir({ titre: 'Fin du combat', texte: 'À la fin d\'un combat, une torche est consommée.', options: [{ label: 'Fin du combat (−1 torche)', valeur: true, classe: 'principal' }] }); if (ok) { depenserTorche('fin du combat'); E.noter('evenement', `Combat terminé dans le segment ${seg.num}.`); apresChangement(); } } }, 'Fin du combat (−1 torche)') : null,
    seg.monstres.some((m) => m.pv <= 0) ? h('button', { class: 'bouton', onclick: () => lancerEtProposer('tresor') }, '🎲 Butin / trésor') : null));

  o.append(h('h3', {}, 'Portes'), regleEnLigne('porte'));
  const portes = d.portes.filter((p) => p.a === seg.id || p.b === seg.id);
  o.append(h('ul', { class: 'liste' }, portes.map((p) => {
    const autre = p.a === seg.id ? segment(p.b) : segment(p.a);
    const lib = p.b ? `vers le segment ${autre ? autre.num : '?'} · ${p.etat}` : (p.etat === 'verrouillee' ? 'fermée' : 'à ouvrir');
    return h('li', {}, h('span', { class: 'nom' }, `Porte ${p.num} ${p.secrete ? '(secrète) ' : ''}— ${lib}`),
      h('button', { class: 'mini', onclick: () => (p.b || p.a !== seg.id ? menuPorte(p) : ouvrirPorte(p)) }, p.b ? 'Aller' : 'Ouvrir'));
  })));

  const notes = h('textarea', { placeholder: 'Vos notes ou votre récit pour ce segment (facultatif)' });
  notes.value = seg.notes || '';
  notes.onchange = () => { seg.notes = notes.value; E.sauver(); };
  o.append(h('h3', {}, 'Notes'), notes);
  o.append(h('h3', {}, 'Donjon'), h('button', { class: 'bouton', onclick: nouveauDonjon }, 'Nouveau donjon'));
}

function rendreJournal() {
  const o = $('#onglet-journal'); o.innerHTML = '';
  o.append(h('h2', {}, 'Journal'));
  const zone = h('textarea', { placeholder: 'Écrire une note ou un passage de récit (facultatif)…' });
  o.append(zone, h('div', { class: 'ligne' },
    h('button', { class: 'bouton principal', onclick: () => { if (zone.value.trim()) { E.noter('note', zone.value.trim()); rendreJournal(); } } }, 'Ajouter au journal'),
    h('label', { class: 'ligne petit' }, (() => { const c = h('input', { type: 'checkbox' }); c.checked = !!P().masquerJets; c.onchange = () => { P().masquerJets = c.checked; E.sauver(); rendreJournal(); }; return c; })(), 'Récit seulement')));
  const entrees = [...P().journal].reverse().filter((j) => !(P().masquerJets && j.genre !== 'note'));
  for (const j of entrees) {
    o.append(h('div', { class: 'journal-entree ' + j.genre },
      h('div', { class: 'quand' }, new Date(j.quand).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })),
      h('div', { class: 'texte' }, j.texte)));
  }
  if (!entrees.length) o.append(h('p', { class: 'petit' }, 'Le journal se remplit tout seul avec vos jets et vos découvertes.'));
}

const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function rendreRegles() {
  const o = $('#onglet-regles'); o.innerHTML = '';
  const m = T.memo();
  o.append(h('h2', {}, (m && m.titre) || 'Mémo des règles'));
  const sections = m ? m.sections.filter((s) => s.titre || (s.points || []).some(Boolean)) : [];
  if (!sections.length) {
    o.append(h('p', {}, 'Aucun mémo dans votre fichier de tables.'),
      h('p', { class: 'petit' }, 'Ajoutez une rubrique « memo » à votre fichier (voir le format des tables), puis importez-le à nouveau depuis l\'onglet Plus.'));
  }
  const champ = h('input', { type: 'search', placeholder: 'Chercher dans le mémo et les tables (ex. torche, poison)…' });
  const zone = h('div');
  const zoneTables = h('div');
  const afficher = () => {
    const q = champ.value.trim().toLowerCase();
    zone.innerHTML = '';
    for (const s of sections) {
      const points = (s.points || []).filter((p) => p && (!q || sansAccents(p).includes(sansAccents(q)) || sansAccents(s.titre).includes(sansAccents(q))));
      if (q && !points.length) continue;
      const d = h('details', { class: 'memo', open: !!q }, h('summary', {}, s.titre || 'Sans titre'), h('ul', {}, points.map((p) => h('li', {}, p))));
      zone.append(d);
    }
    zoneTables.innerHTML = '';
    for (const [id, t] of Object.entries(T.toutesLesTables())) {
      for (const col of t.colonnes ? Object.keys(t.colonnes) : [null]) {
        const titre = T.titreTable(id, col);
        const entrees = (T.entreesDe(id, col) || []).filter((e) => !q || sansAccents(T.texteEntree(e)).includes(sansAccents(q)) || sansAccents(titre).includes(sansAccents(q)));
        if (!entrees.length) continue;
        zoneTables.append(h('details', { class: 'memo', open: !!q || undefined }, h('summary', {}, `${titre} (${t.de})`),
          h('table', { class: 'table-jeu' }, entrees.map((e) => h('tr', {}, h('td', { class: 'jet' }, String(e.jet)), h('td', {}, T.texteEntree(e) || '—'))))));
      }
    }
    if (!zone.children.length && !zoneTables.children.length) zone.append(h('p', { class: 'petit' }, 'Rien trouvé.'));
  };
  champ.oninput = afficher;
  o.append(h('label', { class: 'champ' }, champ), zone, h('h3', {}, 'Tables'), zoneTables);
  afficher();
}

function rendrePlus() {
  const o = $('#onglet-plus'); o.innerHTML = '';
  o.append(h('h2', {}, 'Tables du jeu'));
  if (T.tablesPresentes()) {
    const toutes = T.toutesLesTables();
    o.append(h('p', {}, `Fichier chargé : ${T.nomFichierTables()}`), h('p', { class: 'petit' }, `${Object.keys(toutes).length} tables présentes.`));
  } else {
    o.append(h('p', {}, 'Les tables du livret ne sont pas incluses dans l\'application. Choisissez votre fichier de tables (par exemple dans iCloud Drive).'));
  }
  o.append(h('button', { class: 'bouton principal', onclick: () => $('#fichier-tables').click() }, '📂 Importer mon fichier de tables'),
    h('a', { class: 'bouton', href: 'tables-modele.json', download: 'tables-modele.json' }, 'Télécharger le modèle vide'));

  if (T.tablesPresentes()) {
    o.append(h('h3', {}, 'Lancer une table'));
    const zone = h('div', { class: 'ligne' });
    for (const [id, t] of Object.entries(T.toutesLesTables())) {
      if (t.colonnes) for (const k of Object.keys(t.colonnes)) zone.append(h('button', { class: 'bouton', onclick: () => lancerEtProposer(id, k) }, T.titreTable(id, k)));
      else zone.append(h('button', { class: 'bouton', onclick: () => lancerEtProposer(id) }, T.titreTable(id)));
    }
    o.append(zone);
  }
  o.append(h('h3', {}, 'Jet libre'), h('div', { class: 'ligne' }, ['1d6', '2d6', '3d6', '1d6-1', '1d6+1'].map((f) => h('button', { class: 'bouton', onclick: () => jetLibre('Jet libre', f).then(rendreTout) }, f))));

  o.append(h('h3', {}, 'Sauvegarde'),
    h('p', { class: 'petit' }, 'La partie est enregistrée automatiquement sur cet appareil. Exportez-la de temps en temps dans iCloud Drive pour la garder en sécurité ou la passer de l\'iPad à l\'iPhone.'),
    h('button', { class: 'bouton', onclick: () => E.exporter() }, '⬆️ Exporter la partie'),
    h('button', { class: 'bouton', onclick: () => $('#fichier-partie').click() }, '⬇️ Importer une partie'),
    h('button', { class: 'bouton danger', onclick: async () => { const ok = await choisir({ titre: 'Tout effacer ?', texte: 'Aventurier, donjon et journal seront effacés de cet appareil. Les tables restent.', options: [{ label: 'Effacer la partie', valeur: true, classe: 'danger' }] }); if (ok) { E.reinitialiser(); rendreTout(); } } }, 'Nouvelle partie'));
  o.append(h('h3', {}, 'À propos'), h('p', { class: 'petit' }, 'Carnet non officiel pour jouer à NoteQuest, jeu de Tiago Junges. Les règles et les tables restent celles de votre livret. Dessin à la main grâce à Rough.js.'));
}

demarrer();
