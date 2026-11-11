'use strict';
/* =========================================================
   INTRO — vídeo de abertura (www/video/intro.mp4)
   Toca uma vez ao abrir o app e some sozinho. Toque na tela para pular.
   Se o arquivo não existir ou não tocar, o app segue normalmente.
   Sempre sem som. Ajustes > "Vídeo de abertura": ligado (padrão) ou desligado ('0').
   ========================================================= */
(function () {
  const el = document.getElementById('intro'), v = document.getElementById('introv');
  if (!el || !v) return;
  let modo = 'm'; try { modo = localStorage.getItem('nortrium.intro') || 'm'; } catch (e) {}
  v.muted = true; v.volume = 0;
  if (modo === '0') { el.remove(); return; }

  let feito = false, limite = null;
  const fim = () => {
    if (feito) return; feito = true; clearTimeout(limite);
    el.classList.add('sai');
    setTimeout(() => { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} el.remove(); }, 380);
  };
  const falha = setTimeout(fim, 3500);                       // não começou a tocar: segue para o app
  v.addEventListener('loadedmetadata', () => { v.style.objectFit = v.videoHeight > v.videoWidth ? 'cover' : 'contain'; });
  v.addEventListener('playing', () => { clearTimeout(falha); limite = setTimeout(fim, ((v.duration || 8) + 1.5) * 1000); }, { once: true });
  v.addEventListener('ended', fim);
  v.addEventListener('error', fim);
  el.addEventListener('click', fim);
  document.addEventListener('visibilitychange', () => { if (document.hidden) fim(); });

  const p = v.play();
  if (p && p.catch) p.catch(fim);
})();
