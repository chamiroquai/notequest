// Dés : lecture d'une formule (« 2d6 », « 1d6+1 », « 2d6x10 »), tirage, et fenêtre de jet
// où le joueur saisit ses propres dés OU demande un tirage. Rien n'est lancé sans son accord.
import { h, ouvrirFenetre } from './ui.js';

export function lireFormule(formule) {
  const m = String(formule || '').trim().toLowerCase().replace(/\s+/g, '')
    .match(/^(\d*)d(\d+)([+-]\d+)?(?:[x×*](\d+))?$/);
  if (!m) return null;
  return { nombre: parseInt(m[1] || '1', 10), faces: parseInt(m[2], 10), modif: parseInt(m[3] || '0', 10), mult: parseInt(m[4] || '1', 10) };
}

export function tirer(faces) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return 1 + (a[0] % faces);
}

export function calculer(f, des) {
  const somme = des.reduce((s, d) => s + d, 0);
  return { somme, total: (somme + f.modif) * f.mult };
}

// Ouvre la fenêtre de jet.
//  options.titre       : titre affiché
//  options.formule     : « 2d6 », etc.
//  options.apercu(somme) : fonction facultative qui renvoie un nœud à afficher (résultat de table)
//  options.explication : texte facultatif
// Renvoie { des, somme, total, mode } ou null si annulé.
export function jet({ titre, formule, apercu, explication, annexe }) {
  const f = lireFormule(formule);
  if (!f) return Promise.resolve(null);
  return ouvrirFenetre((c, fermer) => {
    const des = new Array(f.nombre).fill(null);
    let mode = 'saisi';
    c.append(h('h2', {}, titre));
    if (explication) c.append(h('p', { class: 'petit' }, explication));
    c.append(h('p', {}, h('span', { class: 'etiquette' }, formule),
      ' Touchez la face de chaque dé que vous avez lancé, ou demandez un tirage.'));

    const zoneDes = h('div', { class: 'des' });
    const boutonsParDe = [];
    for (let i = 0; i < f.nombre; i++) {
      const faces = h('div', { class: 'faces' });
      const boutons = [];
      if (f.faces <= 12) {
        for (let v = 1; v <= f.faces; v++) {
          const b = h('button', { onclick: () => { des[i] = v; mode = 'saisi'; maj(); } }, v);
          boutons.push(b); faces.append(b);
        }
      } else {
        const champ = h('input', { type: 'number', min: 1, max: f.faces, inputmode: 'numeric', style: 'width:90px' });
        champ.oninput = () => { const v = parseInt(champ.value, 10); des[i] = v >= 1 && v <= f.faces ? v : null; mode = 'saisi'; maj(); };
        faces.append(champ);
      }
      boutonsParDe.push(boutons);
      zoneDes.append(h('div', { class: 'de-saisie' }, h('span', { class: 'petit' }, f.nombre > 1 ? `Dé ${i + 1}` : 'Dé'), faces));
    }
    c.append(zoneDes);

    const totalEl = h('div', { class: 'total' });
    const apercuEl = h('div');
    c.append(totalEl, apercuEl);

    const valider = h('button', { class: 'bouton principal', disabled: true, onclick: () => {
      const r = calculer(f, des);
      fermer({ des: [...des], somme: r.somme, total: r.total, mode });
    } }, 'Valider ce résultat');

    c.append(h('div', { class: 'ligne' },
      h('button', { class: 'bouton', onclick: () => {
        for (let i = 0; i < f.nombre; i++) des[i] = tirer(f.faces);
        mode = 'tiré';
        totalEl.classList.remove('de-anime'); void totalEl.offsetWidth; totalEl.classList.add('de-anime');
        maj();
      } }, '🎲 Lancer pour moi'),
      valider,
      h('button', { class: 'bouton', onclick: () => fermer(null) }, 'Annuler')));
    if (annexe) c.append(annexe);

    function maj() {
      boutonsParDe.forEach((bs, i) => bs.forEach((b, j) => b.classList.toggle('choisi', des[i] === j + 1)));
      const complet = des.every((d) => d !== null);
      valider.disabled = !complet;
      apercuEl.innerHTML = '';
      if (!complet) { totalEl.textContent = '…'; return; }
      const r = calculer(f, des);
      let txt = f.nombre > 1 ? des.join(' + ') + ' = ' + r.somme : String(r.somme);
      if (f.modif) txt += ` ${f.modif > 0 ? '+' : '−'} ${Math.abs(f.modif)}`;
      if (f.mult !== 1) txt += ` × ${f.mult}`;
      if (f.modif || f.mult !== 1) txt += ` → ${r.total}`;
      totalEl.textContent = txt;
      if (apercu) { const n = apercu(r.somme, r.total); if (n) apercuEl.append(n); }
    }
    maj();
  });
}
