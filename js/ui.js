// Petits outils d'interface : création d'éléments, fenêtre modale, choix.

export function h(tag, attrs = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const e of enfants.flat(Infinity)) {
    if (e === undefined || e === null || e === false) continue;
    el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
  return el;
}

const fenetre = () => document.getElementById('fenetre');
const contenu = () => document.getElementById('fenetre-contenu');
let fermetureCourante = null;

export function ouvrirFenetre(construire, { fermableFond = true } = {}) {
  return new Promise((resolve) => {
    const f = fenetre();
    const c = contenu();
    c.innerHTML = '';
    const fermer = (valeur) => {
      f.hidden = true;
      c.innerHTML = '';
      fermetureCourante = null;
      resolve(valeur);
    };
    fermetureCourante = fermer;
    f.querySelector('.fenetre-fond').onclick = fermableFond ? () => fermer(null) : null;
    construire(c, fermer);
    f.hidden = false;
    f.querySelector('.fenetre-boite').scrollTop = 0;
  });
}

export function fermerFenetre() { if (fermetureCourante) fermetureCourante(null); }

// Demande au joueur de choisir parmi des options. Renvoie la valeur choisie, ou null.
export function choisir({ titre, texte, options, annuler = 'Annuler' }) {
  return ouvrirFenetre((c, fermer) => {
    c.append(h('h2', {}, titre));
    if (texte) c.append(texte instanceof Node ? texte : h('div', { class: 'carte-texte' }, texte));
    const zone = h('div', { class: 'choix' });
    for (const o of options) {
      if (!o) continue;
      zone.append(h('button', {
        class: 'bouton ' + (o.classe || ''),
        disabled: o.desactive,
        onclick: () => fermer(o.valeur),
      }, o.label, o.detail ? h('span', { class: 'petit' }, ' – ' + o.detail) : null));
    }
    if (annuler) zone.append(h('button', { class: 'bouton', onclick: () => fermer(null) }, annuler));
    c.append(zone);
  });
}

export function informer(titre, texte) {
  return choisir({ titre, texte, options: [{ label: 'OK', valeur: true, classe: 'principal' }], annuler: null });
}

export function demanderTexte({ titre, libelle, valeur = '', multiligne = false }) {
  return ouvrirFenetre((c, fermer) => {
    c.append(h('h2', {}, titre));
    const champ = multiligne ? h('textarea', {}) : h('input', { type: 'text' });
    champ.value = valeur;
    c.append(h('label', { class: 'champ' }, h('span', {}, libelle || ''), champ));
    c.append(h('div', { class: 'ligne' },
      h('button', { class: 'bouton principal', onclick: () => fermer(champ.value.trim()) }, 'Valider'),
      h('button', { class: 'bouton', onclick: () => fermer(null) }, 'Annuler')));
    setTimeout(() => champ.focus(), 50);
  });
}
