/* Service worker do NORTRIUM.
   Estratégia: rede primeiro (sempre pega a versão nova quando há internet) e cache como reserva (funciona offline).
   Ao publicar uma versão nova, troque o número em VERSAO para limpar o cache antigo. */
const VERSAO = 'nortrium-v4';
const ARQUIVOS = [
  "./",
  "css/app.css",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "img/logo.png",
  "index.html",
  "js/agenda.js",
  "js/app.js",
  "js/core.js",
  "js/curso.js",
  "js/estudos.js",
  "js/fin-extras.js",
  "js/financas.js",
  "js/hoje.js",
  "js/notificacoes.js",
  "js/pwa.js",
  "js/saude.js",
  "js/trabalho.js",
  "js/treinos.js",
  "js/widget.js",
  "manifest.webmanifest"
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) { const cp = res.clone(); caches.open(VERSAO).then(c => c.put(req, cp)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('./') : undefined)))
  );
});
