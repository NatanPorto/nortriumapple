'use strict';
/* NORTRIUM — service worker: guarda o app no aparelho para abrir offline.
   A versão muda sozinha quando algum arquivo muda (dfaa5b7a63). O vídeo de abertura não é guardado (se faltar, o app pula a abertura). */
const CACHE = 'nortrium-dfaa5b7a63';
const ARQUIVOS = [
 "./",
 "css/app.css",
 "css/estilos.css",
 "css/temas.css",
 "fonts/OFL-IBMPlexMono.txt",
 "fonts/OFL-Inter.txt",
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
 "js/pwa.js",
 "js/saude.js",
 "js/taco.js",
 "js/trabalho.js",
 "js/treinos.js",
 "manifest.webmanifest",
 "privacypolicy.html"
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('nortrium-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// abre na hora com o que está guardado e atualiza em segundo plano (a versão nova aparece na próxima abertura)
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('.mp4')) return;     // Drive e vídeo passam direto
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(r, { ignoreSearch: true });
    const rede = fetch(r.url, { cache: 'no-cache' }).then(res => { if (res.ok) c.put(r.url, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(rede); return hit; }
    return (await rede) || (r.mode === 'navigate' ? await c.match('./') : Response.error());
  }));
});
