// Carte du donjon : placement des segments sur une grille et dessin « fait main » (Rough.js).
import rough from './rough.esm.js';

export const C = 24; // taille d'une case en pixels (à l'échelle 1)
const ENCRE = '#2b2a33';
const ACCENT = '#8a3b2c';
const PAPIER = '#fffdf6';

export const DIR = {
  N: { dx: 0, dy: -1, oppose: 'S' },
  S: { dx: 0, dy: 1, oppose: 'N' },
  E: { dx: 1, dy: 0, oppose: 'W' },
  W: { dx: -1, dy: 0, oppose: 'E' },
};

// Dimensions par défaut quand la table ne les précise pas.
export function specParDefaut(spec = {}) {
  const s = { ...spec };
  s.genre = s.genre || 'piece';
  if (s.genre === 'escalier') { s.largeur ||= 1; s.longueur ||= 3; s.portes ??= 1; }
  else if (s.genre === 'couloir') { s.largeur ||= (s.grand ? 2 : 1); s.longueur ||= (s.grand ? 8 : 6); s.portes ??= 1; }
  else { s.largeur ||= 4; s.longueur ||= 4; s.portes ??= 0; }
  s.portes = Number(s.portes) || 0;
  s.fond ??= true;
  return s;
}

function chevauche(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function rectDepuis(o, d, L, W, k) {
  if (d === 'N') return { x: o.x - k, y: o.y - L + 1, w: W, h: L };
  if (d === 'S') return { x: o.x - k, y: o.y, w: W, h: L };
  if (d === 'E') return { x: o.x, y: o.y - k, w: L, h: W };
  return { x: o.x - L + 1, y: o.y - k, w: L, h: W };
}

// Cherche une position libre pour un nouveau segment derrière une porte.
// Renvoie { rect, longueur, largeur, chevauche }.
export function placer(segments, porte, spec) {
  const d = porte.cote;
  const o = { x: porte.cx + DIR[d].dx, y: porte.cy + DIR[d].dy };
  const essais = [[spec.longueur, spec.largeur]];
  if (spec.genre === 'piece' && spec.longueur !== spec.largeur) essais.push([spec.largeur, spec.longueur]);
  if (spec.genre === 'couloir') for (let L = spec.longueur - 1; L >= 2; L--) essais.push([L, spec.largeur]);
  for (const [L, W] of essais) {
    const centre = Math.floor((W - 1) / 2);
    const ks = [centre];
    for (let i = 1; i < W; i++) { ks.push(centre - i, centre + i); }
    for (const k of ks.filter((k) => k >= 0 && k < W)) {
      const r = rectDepuis(o, d, L, W, k);
      if (!segments.some((s) => chevauche(r, s))) return { rect: r, longueur: L, largeur: W, chevauche: false };
    }
  }
  const [L, W] = essais[0];
  return { rect: rectDepuis(o, d, L, W, Math.floor((W - 1) / 2)), longueur: L, largeur: W, chevauche: true };
}

// Case (t = profondeur depuis l'entrée, u = position en travers) → case de la grille.
function caseTU(r, d, t, u) {
  if (d === 'S') return { x: r.x + u, y: r.y + t };
  if (d === 'N') return { x: r.x + u, y: r.y + r.h - 1 - t };
  if (d === 'E') return { x: r.x + t, y: r.y + u };
  return { x: r.x + r.w - 1 - t, y: r.y + u };
}
const COTE_GAUCHE = { S: 'W', N: 'W', E: 'N', W: 'N' };
const COTE_DROIT = { S: 'E', N: 'E', E: 'S', W: 'S' };

// Positions des portes supplémentaires d'un segment (hors porte d'entrée).
export function positionsPortes(r, d, L, W, nb, fond) {
  const res = [];
  if (nb <= 0) return res;
  let reste = nb;
  if (fond) { res.push({ ...caseTU(r, d, L - 1, Math.floor((W - 1) / 2)), cote: d }); reste--; }
  const g = Math.ceil(reste / 2);
  const dr = Math.floor(reste / 2);
  const placerCote = (n, u, cote) => {
    for (let i = 0; i < n; i++) {
      const t = Math.min(L - 1, Math.max(0, Math.round((i + 1) * L / (n + 1)) - (L > 2 ? 0 : 0)));
      res.push({ ...caseTU(r, d, t, u), cote });
    }
  };
  placerCote(g, 0, COTE_GAUCHE[d]);
  placerCote(dr, W - 1, COTE_DROIT[d]);
  // Évite deux portes sur la même case et le même côté.
  const vus = new Set();
  return res.filter((p) => { const k = `${p.x},${p.y},${p.cote}`; if (vus.has(k)) return false; vus.add(k); return true; });
}

// Case extérieure d'un côté libre, pour un passage secret.
export function positionPorteSecrete(seg, portes, segments) {
  const prises = new Set(portes.filter((p) => p.a === seg.id || p.b === seg.id).map((p) => `${p.cx},${p.cy},${p.cote}`));
  const candidats = [];
  for (let x = seg.x; x < seg.x + seg.w; x++) { candidats.push({ cx: x, cy: seg.y, cote: 'N' }, { cx: x, cy: seg.y + seg.h - 1, cote: 'S' }); }
  for (let y = seg.y; y < seg.y + seg.h; y++) { candidats.push({ cx: seg.x, cy: y, cote: 'W' }, { cx: seg.x + seg.w - 1, cy: y, cote: 'E' }); }
  const libres = candidats.filter((c) => {
    if (prises.has(`${c.cx},${c.cy},${c.cote}`)) return false;
    const o = { x: c.cx + DIR[c.cote].dx, y: c.cy + DIR[c.cote].dy, w: 1, h: 1 };
    return !segments.some((s) => chevauche(o, s));
  });
  return libres[Math.floor(libres.length / 2)] || candidats[0];
}

// ---------- Dessin ----------

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
}

export function dessiner(svg, donjon) {
  svg.innerHTML = '';
  const rc = rough.svg(svg);
  const monde = el('g', { id: 'monde' }, svg);
  if (!donjon || !donjon.segments.length) return monde;
  const calqueSeg = el('g', {}, monde);
  const calquePortes = el('g', {}, monde);
  const calqueTextes = el('g', {}, monde);
  const calqueClic = el('g', {}, monde);

  for (const s of donjon.segments) {
    const seed = s.num * 97 + 13;
    const X = s.x * C, Y = s.y * C, Wp = s.w * C, Hp = s.h * C;
    const base = { stroke: ENCRE, strokeWidth: 2, roughness: 1.3, bowing: 1.2, seed };
    const g = el('g', {}, calqueSeg);
    if (s.chevauche) base.strokeLineDash = [6, 5];
    if (s.genre === 'couloir') {
      g.append(rc.rectangle(X, Y, Wp, Hp, { ...base, fill: '#efe6cf', fillStyle: 'solid' }));
    } else if (s.genre === 'escalier') {
      g.append(rc.rectangle(X, Y, Wp, Hp, { ...base, fill: '#e7dfc8', fillStyle: 'solid' }));
      const vertical = s.dir === 'N' || s.dir === 'S';
      const n = vertical ? s.h * 2 : s.w * 2;
      for (let i = 1; i < n; i++) {
        if (vertical) { const yy = Y + i * (Hp / n); g.append(rc.line(X + 2, yy, X + Wp - 2, yy, { ...base, strokeWidth: 1.2, seed: seed + i })); }
        else { const xx = X + i * (Wp / n); g.append(rc.line(xx, Y + 2, xx, Y + Hp - 2, { ...base, strokeWidth: 1.2, seed: seed + i })); }
      }
    } else {
      const finale = s.genre === 'salle_finale';
      g.append(rc.rectangle(X, Y, Wp, Hp, { ...base, strokeWidth: finale ? 3 : 2, fill: PAPIER, fillStyle: 'solid' }));
      if (s.piliers) {
        for (const [px, py] of [[1.5, 1.5], [s.w - 1.5, 1.5], [1.5, s.h - 1.5], [s.w - 1.5, s.h - 1.5]]) {
          g.append(rc.circle(X + px * C, Y + py * C, C * 0.7, { ...base, fill: ENCRE, fillStyle: 'hachure', hachureGap: 3, strokeWidth: 1.5 }));
        }
      }
    }
    // Numéro et indications
    const cx = X + Wp / 2, cy = Y + Hp / 2;
    let etiquette = String(s.num);
    if (s.genre === 'escalier') etiquette = `${s.num}`;
    if (s.genre === 'salle_finale') etiquette = `${s.num} ☠ Boss`;
    const t = el('text', { x: cx, y: s.genre === 'piece' || s.genre === 'salle_finale' ? Y + 18 : cy + 5, 'text-anchor': 'middle', 'font-size': s.w * s.h > 3 ? 16 : 12, fill: ENCRE }, calqueTextes);
    t.textContent = etiquette;
    if (s.genre === 'escalier') {
      // Niveau indiqué à côté de l'escalier, pour rester lisible.
      t.setAttribute('font-size', 12);
      const vertical = s.dir === 'N' || s.dir === 'S';
      const n = el('text', vertical ? { x: X + Wp + 4, y: cy + 4, 'font-size': 12, fill: ACCENT } : { x: cx, y: Y - 4, 'text-anchor': 'middle', 'font-size': 12, fill: ACCENT }, calqueTextes);
      n.textContent = `↓ niv. ${s.niveau}`;
      t.setAttribute('x', vertical ? X - 4 : cx); t.setAttribute('text-anchor', vertical ? 'end' : 'middle'); if (!vertical) t.setAttribute('y', Y + Hp + 13);
    }
    if (s.secret && !s.fouille) {
      const q = el('text', { x: X + Wp - 6, y: Y + Hp - 5, 'text-anchor': 'end', 'font-size': 11, fill: ACCENT }, calqueTextes);
      q.textContent = 'S?';
    }
    if (s.genre === 'piece' || s.genre === 'salle_finale') {
      const vivants = (s.monstres || []).filter((m) => m.pv > 0).length;
      const marques = [];
      if (vivants) marques.push('👹' + vivants);
      if ((s.contenu || []).length) marques.push('✦');
      if (marques.length) { const m = el('text', { x: X + 6, y: Y + Hp - 6, 'font-size': 12, fill: ENCRE }, calqueTextes); m.textContent = marques.join(' '); }
    }
    if (s.id === donjon.actuel) {
      calqueTextes.append(rc.circle(cx, s.genre === 'piece' || s.genre === 'salle_finale' ? cy + 4 : cy, C * 0.8, { stroke: ACCENT, strokeWidth: 2, fill: ACCENT, fillStyle: 'cross-hatch', hachureGap: 3, seed: seed + 5 }));
    }
    el('rect', { x: X, y: Y, width: Wp, height: Hp, fill: 'transparent', 'data-seg': s.id }, calqueClic);
  }

  // Entrée du donjon
  const premier = donjon.segments[0];
  if (premier) {
    const ex = (premier.x + premier.w / 2) * C, ey = premier.y * C;
    calqueTextes.append(rc.line(ex, ey - 34, ex, ey - 4, { stroke: ENCRE, strokeWidth: 2, seed: 3 }));
    calqueTextes.append(rc.linearPath([[ex - 6, ey - 12], [ex, ey - 4], [ex + 6, ey - 12]], { stroke: ENCRE, strokeWidth: 2, seed: 4 }));
    const t = el('text', { x: ex, y: ey - 40, 'text-anchor': 'middle', 'font-size': 14, fill: ENCRE }, calqueTextes);
    t.textContent = 'Entrée';
  }

  for (const p of donjon.portes) {
    const seed = p.num * 31 + 7;
    const { px, py, horiz } = positionPorte(p);
    const lw = horiz ? C - 8 : 8, lh = horiz ? 8 : C - 8;
    const x0 = px - lw / 2, y0 = py - lh / 2;
    const base = { stroke: ENCRE, strokeWidth: 2, roughness: 1, seed };
    if (p.etat === 'ouverte' || p.etat === 'cassee') {
      // Passage dégagé : on « efface » le mur et on marque les montants.
      calquePortes.append(rc.rectangle(x0, y0, lw, lh, { stroke: 'none', fill: PAPIER, fillStyle: 'solid', seed }));
      if (horiz) { calquePortes.append(rc.line(x0, py - 5, x0, py + 5, base)); calquePortes.append(rc.line(x0 + lw, py - 5, x0 + lw, py + 5, base)); }
      else { calquePortes.append(rc.line(px - 5, y0, px + 5, y0, base)); calquePortes.append(rc.line(px - 5, y0 + lh, px + 5, y0 + lh, base)); }
      if (p.etat === 'cassee') calquePortes.append(rc.linearPath(horiz ? [[x0 + 2, py - 4], [px, py + 4], [x0 + lw - 2, py - 4]] : [[px - 4, y0 + 2], [px + 4, py], [px - 4, y0 + lh - 2]], { ...base, stroke: ACCENT, strokeWidth: 1.5 }));
    } else if (p.etat === 'verrouillee') {
      calquePortes.append(rc.rectangle(x0, y0, lw, lh, { ...base, fill: ENCRE, fillStyle: 'solid' }));
    } else {
      // Porte encore inconnue : bien visible, à ouvrir.
      calquePortes.append(rc.rectangle(x0, y0, lw, lh, { ...base, stroke: ACCENT, fill: '#e9b8a6', fillStyle: 'solid', strokeWidth: 2.5 }));
    }
    if (p.secrete) { const t = el('text', { x: px + (horiz ? 0 : 10), y: py + (horiz ? -7 : 4), 'font-size': 10, fill: ACCENT, 'text-anchor': 'middle' }, calqueTextes); t.textContent = 'S'; }
    el('rect', { x: px - C * 0.6, y: py - C * 0.6, width: C * 1.2, height: C * 1.2, fill: 'transparent', 'data-porte': p.id }, calqueClic);
  }
  return monde;
}

export function positionPorte(p) {
  const X = p.cx * C, Y = p.cy * C;
  if (p.cote === 'N') return { px: X + C / 2, py: Y, horiz: true };
  if (p.cote === 'S') return { px: X + C / 2, py: Y + C, horiz: true };
  if (p.cote === 'W') return { px: X, py: Y + C / 2, horiz: false };
  return { px: X + C, py: Y + C / 2, horiz: false };
}

// ---------- Déplacement et zoom ----------

export function activerNavigation(zone, svg, { surTap, vue }) {
  const pointeurs = new Map();
  let depart = null;
  let pinch = null;

  const appliquer = () => {
    const monde = svg.querySelector('#monde');
    if (monde) monde.setAttribute('transform', `translate(${vue.tx},${vue.ty}) scale(${vue.s})`);
    zone.style.backgroundSize = `${C * vue.s}px ${C * vue.s}px`;
    zone.style.backgroundPosition = `${vue.tx}px ${vue.ty}px`;
  };

  zone.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.carte-outils')) return;
    zone.setPointerCapture(e.pointerId);
    pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointeurs.size === 1) depart = { x: e.clientX, y: e.clientY, tx: vue.tx, ty: vue.ty, t: Date.now(), bouge: false };
    if (pointeurs.size === 2) {
      const [a, b] = [...pointeurs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: vue.s, tx: vue.tx, ty: vue.ty, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (depart) depart.bouge = true;
    }
  });
  zone.addEventListener('pointermove', (e) => {
    if (!pointeurs.has(e.pointerId)) return;
    pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = zone.getBoundingClientRect();
    if (pointeurs.size === 2 && pinch) {
      const [a, b] = [...pointeurs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const s = Math.min(4, Math.max(0.25, pinch.s * d / pinch.d));
      const mx = (a.x + b.x) / 2 - rect.left, my = (a.y + b.y) / 2 - rect.top;
      const pmx = pinch.mx - rect.left, pmy = pinch.my - rect.top;
      const wx = (pmx - pinch.tx) / pinch.s, wy = (pmy - pinch.ty) / pinch.s;
      vue.s = s; vue.tx = mx - wx * s; vue.ty = my - wy * s;
      appliquer();
    } else if (pointeurs.size === 1 && depart) {
      const dx = e.clientX - depart.x, dy = e.clientY - depart.y;
      if (Math.hypot(dx, dy) > 8) depart.bouge = true;
      if (depart.bouge) { vue.tx = depart.tx + dx; vue.ty = depart.ty + dy; appliquer(); }
    }
  });
  const fin = (e) => {
    if (!pointeurs.has(e.pointerId)) return;
    pointeurs.delete(e.pointerId);
    if (pointeurs.size < 2) pinch = null;
    if (pointeurs.size === 0 && depart) {
      if (!depart.bouge && e.type === 'pointerup') {
        zone.releasePointerCapture?.(e.pointerId);
        const cible = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.dataset && (n.dataset.porte || n.dataset.seg));
        if (cible) surTap(cible.dataset.porte ? { porte: cible.dataset.porte } : { seg: cible.dataset.seg });
      }
      depart = null;
    } else if (pointeurs.size === 1) {
      const [p] = [...pointeurs.values()];
      depart = { x: p.x, y: p.y, tx: vue.tx, ty: vue.ty, t: Date.now(), bouge: true };
    }
  };
  zone.addEventListener('pointerup', fin);
  zone.addEventListener('pointercancel', fin);
  zone.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = zone.getBoundingClientRect();
    zoomer(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  function zoomer(f, mx, my) {
    const rect = zone.getBoundingClientRect();
    if (mx === undefined) { mx = rect.width / 2; my = rect.height / 2; }
    const s = Math.min(4, Math.max(0.25, vue.s * f));
    const wx = (mx - vue.tx) / vue.s, wy = (my - vue.ty) / vue.s;
    vue.s = s; vue.tx = mx - wx * s; vue.ty = my - wy * s;
    appliquer();
  }

  function recentrer(donjon) {
    const rect = zone.getBoundingClientRect();
    if (!donjon || !donjon.segments.length || !rect.width) { vue.s = 1; vue.tx = rect.width / 2; vue.ty = 80; appliquer(); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of donjon.segments) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x + s.w); y1 = Math.max(y1, s.y + s.h); }
    y0 -= 2.5; // place pour « Entrée »
    const lw = (x1 - x0 + 2) * C, lh = (y1 - y0 + 2) * C;
    const s = Math.min(1.6, Math.max(0.3, Math.min(rect.width / lw, rect.height / lh)));
    vue.s = s;
    vue.tx = rect.width / 2 - ((x0 + x1) / 2) * C * s;
    vue.ty = rect.height / 2 - ((y0 + y1) / 2) * C * s;
    appliquer();
  }

  return { appliquer, zoomer, recentrer };
}
