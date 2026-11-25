// Service worker : garde l'application en cache pour jouer hors ligne.
// Pensez à changer VERSION à chaque mise à jour publiée.
const VERSION = 'notequest-v5';
const FICHIERS = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/app.js', 'js/export-pdf.js', 'js/vendor/jspdf.umd.min.js', 'fonts/IMFellEnglish-Regular.ttf', 'fonts/IMFellEnglish-Italic.ttf', 'images/parchemin.jpg', 'js/ui.js', 'js/des.js', 'js/tables.js', 'js/etat.js', 'js/carte.js', 'js/rough.esm.js',
  'tables-modele.json', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Réseau d'abord (pour recevoir les mises à jour), cache si hors ligne.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copie = r.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copie));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
