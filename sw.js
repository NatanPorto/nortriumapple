/* NORTRIUM PWA — funciona offline depois da primeira visita. Ao publicar uma versão nova, troque o número em VERSAO. */
const VERSAO = 'nortrium-1.13.0';
const ARQUIVOS = [
 "./",
 "css/app.css",
 "css/estilos.css",
 "css/pwa.css",
 "fonts/inter-Bold.woff",
 "fonts/inter-ExtraBold.woff",
 "fonts/inter-Medium.woff",
 "fonts/inter-Regular.woff",
 "fonts/inter-SemiBold.woff",
 "fonts/plexmono-Bold.woff",
 "fonts/plexmono-Regular.woff",
 "icons/apple-touch-icon.png",
 "icons/favicon-32.png",
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
 "js/intro.js",
 "js/nuvem.js",
 "js/pwa-init.js",
 "js/pwa-stubs.js",
 "js/saude.js",
 "js/trabalho.js",
 "js/treinos.js",
 "manifest.webmanifest",
 "privacypolicy.html",
 "video/intro.mp4"
];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).catch(() => e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
