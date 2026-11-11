'use strict';
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e)));
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});   // pede para o navegador não apagar os dados
