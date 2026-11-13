'use strict';
/* PWA: service worker (abre offline), botão "Instalar o app" e aviso de atualização */
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.pwaPrompt = e; });
window.addEventListener('appinstalled', () => { window.pwaPrompt = null; });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    const tinha = !!navigator.serviceWorker.controller;      // já havia uma versão instalada?
    navigator.serviceWorker.register('sw.js').catch(e => console.error('Service worker:', e));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (tinha && typeof toast === 'function') toast('Nova versão instalada. Feche e abra o app para usá-la.');
    });
  });
}
