// État de la partie, sauvegarde locale, export et import.

const CLE = 'notequest.partie';
export const VERSION_PARTIE = 1;

export function partieVide() {
  return { version: VERSION_PARTIE, perso: null, anciens: [], donjon: null, journal: [], selection: null };
}

export let partie = partieVide();

export function charger() {
  try {
    const p = JSON.parse(localStorage.getItem(CLE) || 'null');
    if (p && p.version) partie = Object.assign(partieVide(), p);
  } catch { /* partie neuve */ }
  return partie;
}

export function sauver() {
  try { localStorage.setItem(CLE, JSON.stringify(partie)); } catch (e) { console.warn('Sauvegarde impossible', e); }
}

export function remplacer(p) { partie = Object.assign(partieVide(), p); sauver(); }
export function reinitialiser() { partie = partieVide(); sauver(); }

let compteurId = Date.now() % 100000;
export const nouvelId = (prefixe) => `${prefixe}${(compteurId++).toString(36)}`;

export function noter(genre, texte) {
  partie.journal.push({ id: nouvelId('j'), quand: new Date().toISOString(), genre, texte });
  sauver();
}

export async function exporter() {
  const donnees = { format: 'notequest-partie', version: VERSION_PARTIE, date: new Date().toISOString(), partie };
  const texte = JSON.stringify(donnees, null, 2);
  const nom = `notequest-partie-${new Date().toISOString().slice(0, 10)}.json`;
  return partager(new File([texte], nom, { type: 'application/json' }));
}

// Propose le fichier via la feuille de partage d'iOS (Enregistrer dans Fichiers…), sinon le télécharge.
export async function partager(fichier) {
  const nom = fichier.name;
  if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], title: nom }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(fichier);
  const a = document.createElement('a');
  a.href = url; a.download = nom; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

export function lireSauvegarde(texte) {
  const d = JSON.parse(texte);
  if (d.format !== 'notequest-partie' || !d.partie) throw new Error('Ce fichier n\'est pas une sauvegarde NoteQuest.');
  return d.partie;
}
