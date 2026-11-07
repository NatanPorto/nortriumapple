/* Registro do service worker (só na versão PWA, fora do Cordova). */
if ('serviceWorker' in navigator && !window.cordova && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const n = reg.installing;
        if (n) n.addEventListener('statechange', () => {
          if (n.state === 'installed' && navigator.serviceWorker.controller && typeof toast === 'function') toast('Nova versão instalada. Feche e abra o app para atualizar.');
        });
      });
    }).catch(e => console.error('Service worker falhou', e));
  });
}
