// Export du journal en PDF, sur fond de parchemin.
// jsPDF et la police ne sont chargés qu'au moment de l'export (puis gardés en cache hors ligne).

let chargement = null;
function chargerJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  if (!chargement) {
    chargement = new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/jspdf.umd.min.js';
      s.onload = () => ok(window.jspdf);
      s.onerror = () => ko(new Error('Impossible de charger le module PDF.'));
      document.head.append(s);
    });
  }
  return chargement;
}

async function base64De(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fichier introuvable : ${url}`);
  const octets = new Uint8Array(await r.arrayBuffer());
  let bin = '';
  for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function imageDe(url) {
  const r = await fetch(url);
  const blob = await r.blob();
  return new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(blob); });
}

// Retire ce que la police ne sait pas dessiner (émojis, flèches…).
function nettoyer(t) {
  return String(t || '')
    .replace(/→/g, '–').replace(/↓/g, '').replace(/[✦☠]/g, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/[ \t]+/g, ' ').trim();
}

const dateFr = (iso) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

// partie : l'état complet ; options.recit : inclure les notes de récit.
export async function journalEnPDF(partie, { recit = true } = {}) {
  const { jsPDF } = await chargerJsPDF();
  const [regulier, italique, fond] = await Promise.all([
    base64De('fonts/IMFellEnglish-Regular.ttf'), base64De('fonts/IMFellEnglish-Italic.ttf'), imageDe('images/parchemin.jpg'),
  ]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS('Fell.ttf', regulier); doc.addFont('Fell.ttf', 'Fell', 'normal');
  doc.addFileToVFS('Fell-i.ttf', italique); doc.addFont('Fell-i.ttf', 'Fell', 'italic');

  const LP = 210, HP = 297, MG = 28, MH = 30, LARG = LP - 2 * MG;
  const ENCRE = [43, 30, 20], DOUX = [105, 80, 55], ROUGE = [120, 45, 30];
  let y = MH;
  let page = 1;
  const pageNeuve = () => { doc.addImage(fond, 'JPEG', 0, 0, LP, HP, 'fond', 'FAST'); y = MH; };
  const piedDePage = () => {
    doc.setFont('Fell', 'italic'); doc.setFontSize(10); doc.setTextColor(...DOUX);
    doc.text(`– ${page} –`, LP / 2, HP - 14, { align: 'center' });
  };
  const place = (h) => { if (y + h > HP - MH) { piedDePage(); doc.addPage(); page++; pageNeuve(); } };
  const ecrire = (texte, { taille = 12, style = 'normal', couleur = ENCRE, interligne = 1.35, retrait = 0, avant = 0, apres = 1.5, align = 'left' } = {}) => {
    texte = nettoyer(texte);
    if (!texte) return;
    doc.setFont('Fell', style); doc.setFontSize(taille); doc.setTextColor(...couleur);
    const lignes = doc.splitTextToSize(texte, LARG - retrait);
    const hl = taille * 0.3528 * interligne;
    y += avant;
    for (const l of lignes) {
      place(hl);
      doc.text(l, align === 'center' ? LP / 2 : MG + retrait, y, { align });
      y += hl;
    }
    y += apres;
  };
  const filet = () => {
    place(6);
    doc.setDrawColor(...DOUX); doc.setLineWidth(0.3);
    doc.line(MG + 30, y, LP - MG - 30, y);
    y += 11;
  };

  pageNeuve();
  const d = partie.donjon;
  ecrire('Chronique de NoteQuest', { taille: 13, style: 'italic', couleur: DOUX, align: 'center', apres: 9 });
  ecrire(d ? d.nom : 'Sans donjon', { taille: 30, align: 'center', interligne: 1.1, apres: 2 });
  if (d) {
    const sousTitre = [d.type && d.type !== d.nom ? d.type : '', d.boss ? `Boss : ${d.boss.nom ? `${d.boss.nom} (${d.boss.texte || ''})` : d.boss.texte}` : ''].filter(Boolean).join(' · ');
    ecrire(sousTitre, { taille: 12, style: 'italic', couleur: DOUX, align: 'center', apres: 1 });
    const salles = d.segments.length;
    ecrire(`${salles} segment${salles > 1 ? 's' : ''} explorés${d.salleFinale ? ', salle finale atteinte' : ''}.`, { taille: 11, style: 'italic', couleur: DOUX, align: 'center' });
  }
  y += 4; filet();

  // Aventuriers successifs
  const aventuriers = [...(partie.anciens || []), ...(partie.perso ? [partie.perso] : [])];
  ecrire(aventuriers.length > 1 ? 'Les aventuriers' : 'L\'aventurier', { taille: 18, apres: 2 });
  if (!aventuriers.length) ecrire('Aucun aventurier.', { style: 'italic', couleur: DOUX });
  aventuriers.forEach((a, i) => {
    const sort = a.mort ? `mort${a.mortDans ? ` dans le segment ${a.mortDans}` : ''}` : 'toujours en vie';
    ecrire(`${i + 1}. ${a.nom}, ${a.race} ${a.classe}`, { taille: 14, apres: 0.5 });
    ecrire(`${a.pvMax} PV · arme : ${a.arme || '—'} · ${sort}`, { taille: 11, style: 'italic', couleur: a.mort ? ROUGE : DOUX, retrait: 6, apres: 2.5 });
  });
  y += 2; filet();

  // Journal
  ecrire(recit ? 'Journal et récit' : 'Journal', { taille: 18, apres: 3 });
  const entrees = (partie.journal || []).filter((j) => recit || j.genre !== 'note');
  let jour = '';
  for (const j of entrees) {
    const date = new Date(j.quand).toLocaleDateString('fr-FR', { dateStyle: 'full' });
    if (date !== jour) { jour = date; ecrire(date.charAt(0).toUpperCase() + date.slice(1), { taille: 12, style: 'italic', couleur: ROUGE, avant: 2, apres: 1.5 }); }
    if (j.genre === 'note') ecrire(j.texte, { taille: 13, style: 'italic', retrait: 4, avant: 1, apres: 3 });
    else ecrire(j.texte, { taille: 11, couleur: j.genre === 'jet' ? DOUX : ENCRE, apres: 1.2 });
  }
  if (!entrees.length) ecrire('Le journal est vide.', { style: 'italic', couleur: DOUX });

  // Notes écrites dans les segments
  if (recit && d) {
    const notes = d.segments.filter((s) => s.notes && s.notes.trim());
    if (notes.length) {
      y += 2; filet();
      ecrire('Notes des lieux', { taille: 18, apres: 2 });
      for (const s of notes) {
        ecrire(`Segment ${s.num}`, { taille: 13, apres: 0.5 });
        ecrire(s.notes, { taille: 13, style: 'italic', retrait: 4, apres: 3 });
      }
    }
  }
  piedDePage();

  const nomFichier = `NoteQuest - ${nettoyer(d ? d.nom : 'journal').replace(/[\\/:*?"<>|]/g, '')}${recit ? '' : ' - sans recit'}.pdf`;
  return new File([doc.output('blob')], nomFichier, { type: 'application/pdf' });
}

export { dateFr };
