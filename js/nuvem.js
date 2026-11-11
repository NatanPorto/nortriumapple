/* ==========================================================================
   NUVEM — backup numa pasta do Google Drive
   O app envia o backup para um mini-script (Google Apps Script) da própria conta do usuário,
   e o script grava na pasta cujo link foi informado. Sem login, sem Google Cloud.
   ========================================================================== */
const Nuvem = (() => {
  const INTERVALO = 12 * 36e5;                       // envio automático: no máximo a cada 12 h
  const MANTER = 15;                                 // quantos backups ficam na pasta
  const PREFIXO = 'nortrium-backup-';
  const cfg = () => (DB.cfg.drive = DB.cfg.drive || { link: '', pasta: '', script: '', envio: null });
  const pronto = () => { const c = cfg(); return !!(c.pasta && c.script); };
  const dt = x => new Date(x).toLocaleString('pt-BR');
  let ocupado = false;

  const SCRIPT = `// NORTRIUM — receptor de backup (cole tudo isto no Apps Script)
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var pasta = DriveApp.getFolderById(d.pasta);
    if (String(d.nome).indexOf('${PREFIXO}') !== 0) return saida({ erro: 'nome inválido' });
    var it = pasta.getFilesByName(d.nome), f;
    if (it.hasNext()) { f = it.next(); f.setContent(d.conteudo); }
    else f = pasta.createFile(d.nome, d.conteudo, MimeType.PLAIN_TEXT);
    var todos = lista(pasta);
    for (var i = (d.manter || ${MANTER}); i < todos.length; i++) todos[i].f.setTrashed(true);
    return saida({ ok: true, id: f.getId(), modificado: f.getLastUpdated().toISOString() });
  } catch (err) { return saida({ erro: String(err) }); }
}
function doGet(e) {
  try {
    var p = e.parameter, pasta = DriveApp.getFolderById(p.pasta);
    if (p.acao === 'listar') {
      return saida({ ok: true, arquivos: lista(pasta).map(function (x) {
        return { id: x.f.getId(), nome: x.f.getName(), modificado: x.t, tamanho: x.f.getSize() };
      }) });
    }
    if (p.acao === 'ler') {
      var f = DriveApp.getFileById(p.id), ok = false, pais = f.getParents();
      while (pais.hasNext()) if (pais.next().getId() === pasta.getId()) ok = true;
      if (!ok) return saida({ erro: 'arquivo fora da pasta' });
      return saida({ ok: true, conteudo: f.getBlob().getDataAsString() });
    }
    return saida({ erro: 'ação desconhecida' });
  } catch (err) { return saida({ erro: String(err) }); }
}
function lista(pasta) {
  var out = [], it = pasta.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf('${PREFIXO}') === 0 && !f.isTrashed()) out.push({ f: f, t: f.getLastUpdated().getTime() });
  }
  out.sort(function (a, b) { return b.t - a.t; });
  return out;
}
function saida(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }`;

  const idPasta = link => { const m = String(link).match(/\/folders\/([A-Za-z0-9_-]{10,})/) || String(link).match(/[?&]id=([A-Za-z0-9_-]{10,})/) || String(link).trim().match(/^([A-Za-z0-9_-]{20,})$/); return m ? m[1] : ''; };
  const urlScript = u => /^https:\/\/script\.google\.com\/macros\/s\/[^\s?#]+\/exec$/.test(String(u).trim());

  async function ler(r) {
    let j; try { j = await r.json(); } catch (e) { throw new Error('O script não respondeu como esperado. Confira se ele foi publicado com acesso “Qualquer pessoa”.'); }
    if (j.erro) throw new Error(j.erro);
    return j;
  }
  const post = async obj => ler(await fetch(cfg().script, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(obj) }));
  const get = async q => ler(await fetch(cfg().script + '?' + new URLSearchParams({ ...q, pasta: cfg().pasta })));

  async function enviar() {
    const c = cfg();
    const j = await post({ pasta: c.pasta, nome: `${PREFIXO}${hoje()}.json`, conteudo: pacote(), manter: MANTER });
    c.envio = new Date().toISOString(); DB.cfg.ultimoBackup = c.envio; Store.salvar();
    return j;
  }
  const erroTxt = e => {
    const m = String(e && e.message || e);
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sem internet, ou o link do script está errado.';
    if (/No item with the given ID|Unexpected error|not found/i.test(m)) return 'Não encontrei a pasta. Confira o link e se ela é da mesma conta do script.';
    return 'Falha no Drive: ' + m.slice(0, 160);
  };
  async function protegido(fn) {
    if (ocupado) return toast('Já há uma operação com o Drive em andamento.');
    ocupado = true;
    try { return await fn(); } catch (e) { console.error(e); toast(erroTxt(e)); } finally { ocupado = false; }
  }

  async function enviarAgora(s) {
    await protegido(async () => { toast('Enviando para o Drive…'); await enviar(); toast('Backup enviado para a pasta do Drive.'); if (s) { s.fechar(); ajustes(); } });
  }
  async function restaurarDrive(s) {
    await protegido(async () => {
      const j = await get({ acao: 'listar' });
      if (!j.arquivos.length) return toast('Não há backups nessa pasta ainda.');
      s.fechar();
      const m = sheet('Restaurar do Drive', j.arquivos.map((a, k) => `<div class="card"><b>${esc(a.nome)}</b><p class="mu sm" style="margin:4px 0 8px">${dt(a.modificado)} · ${Math.max(1, Math.round(a.tamanho / 1024))} KB</p><button class="btn sec" data-k="${k}">Restaurar este</button></div>`).join(''));
      m.$$('[data-k]').forEach(b => b.onclick = async () => {
        await protegido(async () => {
          const r = await get({ acao: 'ler', id: j.arquivos[+b.dataset.k].id });
          let obj; try { obj = JSON.parse(r.conteudo); } catch (e) { return toast('Esse arquivo não é um backup válido.'); }
          if (!(obj && obj.app === 'meuapp' && obj.dados)) return toast('Esse arquivo não é um backup do NORTRIUM.');
          m.fechar(); await aplicarPacote(obj);
        });
      });
    });
  }

  function configurar(s) {
    if (s) s.fechar();
    const c = cfg();
    const m = sheet('Backup no Google Drive', `
      <p class="mu sm" style="margin:0 0 8px">O app não consegue gravar numa pasta do Drive só com o link, então você cria uma vez um mini-script na sua conta (leva uns 3 minutos):</p>
      <ol class="mu sm" style="margin:0 0 10px;padding-left:18px;line-height:1.5">
        <li>Abra <b>script.google.com</b> > <b>Novo projeto</b>.</li>
        <li>Apague o que estiver lá, toque em <b>Copiar script</b> abaixo e cole.</li>
        <li><b>Implantar</b> > <b>Nova implantação</b> > tipo <b>App da Web</b>. Executar como: <b>Eu</b>. Quem tem acesso: <b>Qualquer pessoa</b>. Implantar e autorizar.</li>
        <li>Copie o <b>URL do app da Web</b> (termina em /exec) e cole abaixo.</li>
        <li>No Drive, abra a pasta dos backups, copie o link dela e cole abaixo.</li>
      </ol>
      <div class="acts" style="justify-content:flex-start;margin-bottom:10px"><button class="btn sec" id="dcopia">Copiar script</button></div>
      ${F('Link do script (URL do app da Web)', inp('script', c.script, 'autocomplete="off" inputmode="url" placeholder="https://script.google.com/macros/s/.../exec"'))}
      ${F('Link da pasta do Drive', inp('link', c.link, 'autocomplete="off" inputmode="url" placeholder="https://drive.google.com/drive/folders/..."'))}
      <div class="acts"><button class="btn" id="dsalva">Salvar e testar</button>${pronto() ? '<button class="btn sec" id="ddesl">Desligar</button>' : ''}</div>
      <p class="hint">Quem tiver o link do script consegue gravar backups nessa pasta, então não o compartilhe. Ficam os ${MANTER} mais recentes (um por dia); os mais antigos vão para a lixeira do Drive.</p>`);
    m.$('#dcopia').onclick = async () => {
      try { await navigator.clipboard.writeText(SCRIPT); toast('Script copiado.'); }
      catch (e) {
        const t = document.createElement('textarea'); t.value = SCRIPT; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch (x) {} t.remove(); toast(ok ? 'Script copiado.' : 'Não consegui copiar automaticamente.');
      }
    };
    m.$('#dsalva').onclick = async () => {
      const v = vals(m.el), link = (v.link || '').trim(), script = (v.script || '').trim(), pasta = idPasta(link);
      if (!urlScript(script)) return toast('O link do script deve começar com https://script.google.com/macros/s/ e terminar em /exec.');
      if (!pasta) return toast('Não consegui achar a pasta nesse link. Use o link “drive.google.com/drive/folders/…”.');
      const ant = { ...cfg() }; Object.assign(cfg(), { link, script, pasta });
      await protegido(async () => {
        try { await get({ acao: 'listar' }); await enviar(); }
        catch (e) { Object.assign(cfg(), ant); throw e; }
        Store.salvar(); m.fechar(); toast('Pronto! Backup enviado para a pasta do Drive.'); ajustes();
      });
    };
    const d = m.$('#ddesl'); if (d) d.onclick = async () => {
      if (!(await confirmar('Desligar o backup no Drive? Os arquivos que já estão na pasta continuam lá.', 'Desligar'))) return;
      DB.cfg.drive = { link: '', pasta: '', script: '', envio: null }; Store.salvar(); m.fechar(); ajustes();
    };
  }

  /* envio automático (silencioso): ao abrir o app e ao voltar para ele */
  async function auto() {
    const c = cfg();
    if (!pronto() || ocupado) return;
    const temDados = DB.fin.tx.length || DB.agenda.eventos.length || DB.treino.sessoes.length || DB.estudo.sessoes.length || DB.trabalho.tarefas.length;
    if (!temDados || (c.envio && Date.now() - new Date(c.envio).getTime() < INTERVALO)) return;
    ocupado = true;
    try { await enviar(); } catch (e) { console.error('Envio automático ao Drive falhou:', e); }
    finally { ocupado = false; }
  }

  function bloco() {
    const c = cfg();
    const st = pronto()
      ? `${c.envio ? 'Último envio: ' + dt(c.envio) + '. ' : ''}O app envia sozinho no máximo a cada 12 horas para a sua pasta do Drive.`
      : 'Envie o backup automaticamente para uma pasta do seu Google Drive.';
    return `<div class="dia">Google Drive</div><p class="mu sm" style="margin:0 0 8px">${st}</p>
      <div class="acts" style="justify-content:flex-start;flex-wrap:wrap">${pronto()
        ? '<button class="btn" id="dv1">Enviar agora</button><button class="btn sec" id="dv2">Restaurar do Drive</button><button class="btn sec" id="dv3">Configurar</button>'
        : '<button class="btn" id="dv3">Configurar Google Drive</button>'}</div>`;
  }
  function ligar(s) {
    const b = id => s.$(id);
    if (b('#dv1')) b('#dv1').onclick = () => enviarAgora(s);
    if (b('#dv2')) b('#dv2').onclick = () => restaurarDrive(s);
    if (b('#dv3')) b('#dv3').onclick = () => configurar(s);
  }
  return { bloco, ligar, auto };
})();
