'use strict';
/* =========================================================
   APP — navegação, ajustes, backup/importação, bloqueio por PIN, boot
   ========================================================= */
const ICONES = {
  hoje: '<path d="M3 11l9-8 9 8"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
  fin: '<path d="M4 7a2 2 0 0 1 2-2h11v3"/><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M16 13.5h2"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  treino: '<path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12"/>',
  saude: '<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-7.6a5.5 5.5 0 0 0 0-7.8z"/>',
  estudo: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5"/>',
  trab: '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
  mais: '<rect x="4" y="4" width="6" height="6" rx="2"/><rect x="14" y="4" width="6" height="6" rx="2"/><rect x="4" y="14" width="6" height="6" rx="2"/><rect x="14" y="14" width="6" height="6" rx="2"/>',
  notif: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
  widget: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  trofeu: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4"/><path d="M12 13v4M8 21h8M10 17h4v4h-4z"/>',
  agua: '<path d="M12 3c3.5 4.2 6 7.2 6 10.5a6 6 0 0 1-12 0C6 10.2 8.5 7.2 12 3z"/>',
  relogio: '<circle cx="12" cy="12" r="5.5"/><path d="M9 6.5l.7-3h4.6l.7 3M9 17.5l.7 3h4.6l.7-3M12 9.5V12l1.8 1.2"/>',
  dieta: '<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M7 7h4M17 3c-2 2-2.5 5-2.5 8h2.5v10"/>',
  aviso: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
};
const ORDEM = ['hoje', 'agenda', 'fin', 'treino', 'estudo', 'trab'];
const COR_MOD = { hoje: 'var(--c-hoje)', fin: 'var(--c-fin)', agenda: 'var(--c-agenda)', treino: 'var(--c-treino)', estudo: 'var(--c-estudo)', trab: 'var(--c-trab)' };
const NOME_NAV = { hoje: 'Hoje', agenda: 'Agenda', fin: 'Finanças', treino: 'Saúde', estudo: 'Estudos', trab: 'Trabalho' };
const ICONE_NAV = { treino: 'saude' };

/* ---------- vídeo de abertura (lido por js/intro.js) ---------- */
const introModo = () => { try { return localStorage.getItem('nortrium.intro') || 'm'; } catch (e) { return 'm'; } };

/* ---------- aparência: modo (escuro/claro), paleta, estilo ----------
   As cores de cada paleta ficam em css/temas.css; a forma de cada estilo, em css/estilos.css e css/temas.css. */
const PALETAS = [
  ['nortrium', 'Verde-menta', 'Verde-menta, a identidade do app'],
  ['oceano', 'Azul-petróleo', 'Azul-petróleo com destaque ciano'],
  ['noturno', 'Azul-noite', 'Azul-noite com destaque índigo'],
  ['ametista', 'Roxo-ameixa', 'Ameixa com destaque lilás'],
  ['brasa', 'Laranja', 'Cinza quente com destaque laranja'],
  ['rose', 'Rosa', 'Vinho suave com destaque rosa'],
  ['grafite', 'Cinza', 'Cinza neutro, quase monocromático'],
  ['ultravioleta', 'Roxo vivo', 'Roxo e lavanda, no clima do Nubank'],
  ['streaming', 'Preto e verde', 'Preto e verde-vivo, no clima do Spotify'],
  ['servidor', 'Cinza e violeta', 'Cinza-azulado e violeta, no clima do Discord'],
  ['papel', 'Branco e azul', 'Branco quente e azul discreto, no clima do Notion'],
  ['codigo', 'Azul-grafite', 'Azul-grafite de editor, no clima do GitHub'],
  ['lima', 'Verde-lima', 'Verde-lima e cinza limpo, no clima do Duolingo'],
  ['nord', 'Gelo', 'Gelo e azul-ártico, a paleta Nord'],
  ['catppuccin', 'Pastel lilás', 'Pastéis sobre lilás, a paleta Catppuccin'],
  ['gruvbox', 'Retrô quente', 'Retrô quente, a paleta Gruvbox']
];
const ESTILOS = [
  ['editorial', 'Linhas finas', 'Linhas finas e números em fonte técnica. Denso e sóbrio.'],
  ['facetado', 'Canto cortado', 'Canto cortado como o logo, com uma dobra na cor do módulo.'],
  ['suave', 'Arredondado', 'Cantos arredondados, cards claros e barra de abas flutuante.'],
  ['vidro', 'Vidro', 'Superfícies translúcidas sobre um brilho da cor da paleta.'],
  ['bloco', 'Contorno grosso', 'Contornos grossos, sombras duras e cores chapadas. Botões afundam ao toque.'],
  ['tonal', 'Tingido', 'Cards tingidos pela paleta, botões em pílula e aba ativa em cápsula (estilo Material You).'],
  ['ludico', 'Divertido', 'Botões grossos "de tecla", contornos de 2px e barras gordas, como em apps de aprender.'],
  ['sistema', 'Nativo', 'Título grande, listas agrupadas, abas translúcidas e filtros segmentados, como nos apps nativos.']
];
/* temas prontos: um toque aplica modo + paleta + estilo + destaque único (inspirados em apps conhecidos) */
const PRESETS = [
  ['padrao', 'Padrão do app', 'O visual original do Nortrium', { tema: 'escuro', paleta: 'nortrium', estilo: 'editorial', mono: false }],
  ['fintech', 'Banco digital', 'No clima do Nubank', { tema: 'claro', paleta: 'ultravioleta', estilo: 'suave', mono: true }],
  ['streaming', 'Música', 'No clima do Spotify', { tema: 'escuro', paleta: 'streaming', estilo: 'tonal', mono: true }],
  ['comunidade', 'Chat', 'No clima do Discord', { tema: 'escuro', paleta: 'servidor', estilo: 'suave', mono: true }],
  ['caderno', 'Anotações', 'No clima do Notion', { tema: 'claro', paleta: 'papel', estilo: 'sistema', mono: true }],
  ['terminal', 'Programador', 'No clima do GitHub', { tema: 'escuro', paleta: 'codigo', estilo: 'editorial', mono: true }],
  ['aprender', 'Estudo', 'No clima do Duolingo', { tema: 'claro', paleta: 'lima', estilo: 'ludico', mono: true }],
  ['nordico', 'Gelo e vidro', 'Paleta Nord com vidro', { tema: 'escuro', paleta: 'nord', estilo: 'vidro', mono: true }],
  ['retro', 'Retrô', 'Gruvbox com blocos', { tema: 'escuro', paleta: 'gruvbox', estilo: 'bloco', mono: true }]
];
const nomeTema = () => { const pr = PRESETS.find(q => presetOn(q[3])); const p = PALETAS.find(x => x[0] === paletaAtual()), e = ESTILOS.find(x => x[0] === estiloAtual()); return pr ? pr[1] : `${p[1]} · ${e[1]}${DB.cfg.tema === 'claro' ? ' · claro' : DB.cfg.tema === 'auto' ? ' · automático' : ''}`; };
const presetOn = c => DB.cfg.tema === c.tema && paletaAtual() === c.paleta && estiloAtual() === c.estilo && !!DB.cfg.mono === !!c.mono && !DB.cfg.amoled;
const estiloAtual = () => (ESTILOS.some(e => e[0] === DB.cfg.estilo) ? DB.cfg.estilo : 'editorial');
const paletaAtual = () => (PALETAS.some(p => p[0] === DB.cfg.paleta) ? DB.cfg.paleta : 'nortrium');

/* ---------- tema ---------- */
let temaJaAplicado = false;
function aplicarTema() {
  const t = DB.cfg.tema, escuro = t === 'escuro' || (t === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  const h = document.documentElement, d = h.dataset;
  if (temaJaAplicado) { h.classList.add('tt'); clearTimeout(aplicarTema.t); aplicarTema.t = setTimeout(() => h.classList.remove('tt'), 400); }   // troca suave de cores
  temaJaAplicado = true;
  d.tema = escuro ? 'escuro' : 'claro';
  d.estilo = estiloAtual();
  d.paleta = paletaAtual();
  if (DB.cfg.amoled) d.amoled = ''; else delete d.amoled;
  if (DB.cfg.mono) d.mono = ''; else delete d.mono;
  const bg = getComputedStyle(h).getPropertyValue('--bg').trim(), mt = document.querySelector('meta[name="theme-color"]');
  if (mt && bg) mt.setAttribute('content', bg);                  // barra de status do celular acompanha o tema
}
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', aplicarTema);

/* ---------- bloqueio por PIN ---------- */
async function hashPin(pin, salt) {
  const d = new TextEncoder().encode(salt + ':' + pin), r = await crypto.subtle.digest('SHA-256', d);
  return [...new Uint8Array(r)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function bloquear() {
  if (!DB.cfg.pin || $('.lock')) return;
  overlays.slice().forEach(o => o.fechar());
  const el = h(`<div class="lock"><div><b style="font-size:22px">NORTRIUM</b><p class="mu">Digite seu PIN para entrar.</p><input id="pin" type="password" inputmode="numeric" autocomplete="off" aria-label="PIN"><button class="btn block" id="entrar">Entrar</button></div></div>`);
  document.body.appendChild(el);
  const tentar = async () => {
    const v = $('#pin', el).value;
    if (await hashPin(v, DB.cfg.salt) === DB.cfg.pin) el.remove(); else { $('#pin', el).value = ''; toast('PIN incorreto.'); }
  };
  $('#entrar', el).onclick = tentar; $('#pin', el).onkeydown = e => { if (e.key === 'Enter') tentar(); };
  setTimeout(() => $('#pin', el).focus(), 50);
}
let pausadoEm = 0;
const aoSair = () => { pausadoEm = Date.now(); Store.gravar(); };
const aoVoltar = () => { if (DB.cfg.pin && pausadoEm && Date.now() - pausadoEm > (DB.cfg.lockMin || 0) * 60000) bloquear(); pausadoEm = 0; refresh(); };
document.addEventListener('visibilitychange', () => document.hidden ? aoSair() : aoVoltar());
/* botão "voltar" do celular (no PWA vira popstate): fecha janela, volta de tela e só então sai (dois toques seguidos) */
let sairAte = 0;
const empilha = () => history.pushState({ nortrium: 1 }, '');
function voltarApp() {
  if ($('.lock')) return true;
  const o = overlays[overlays.length - 1]; if (o) { o.tentarFechar(); return true; }
  if (modAtual === 'estudo' && Estudos.S.mat) { Estudos.S.mat = null; refresh(); return true; }
  if (modAtual !== abasAtivas()[0]) { go(abasAtivas()[0]); return true; }
  return false;
}
history.replaceState({ nortrium: 0 }, ''); empilha();
window.addEventListener('popstate', () => {
  if (voltarApp()) return empilha();
  if (Date.now() < sairAte) return history.back();
  sairAte = Date.now() + 2000; toast('Toque em voltar de novo para sair.'); empilha();
});

/* ---------- backup ---------- */
const nomeBackup = () => `meuapp-backup-${hoje()}.json`;
const pacote = () => JSON.stringify({ app: 'meuapp', versao: 1, exportadoEm: new Date().toISOString(), dados: DB }, null, 2);

async function salvarBackup() {
  const r = await salvarArquivo('Backups', nomeBackup(), pacote(), 'application/json');
  DB.cfg.ultimoBackup = new Date().toISOString(); Store.salvar();
  toast(r.ok ? `Backup salvo em ${r.caminho}` : 'Não foi possível salvar o backup.');
}
function lembrarBackup() {                    // o navegador não salva arquivos sozinho: avisa quando faz tempo
  const u = DB.cfg.ultimoBackup, temDados = DB.fin.tx.length || DB.agenda.eventos.length || DB.treino.sessoes.length || DB.estudo.sessoes.length || DB.trabalho.tarefas.length;
  if (!temDados) return;
  const dias = u ? Math.floor((Date.now() - new Date(u).getTime()) / 864e5) : null;
  if (dias === null) toast('Seus dados ficam só neste aparelho. Salve um backup em Ajustes > Dados.');
  else if (dias >= 14) toast(`Faz ${dias} dias desde o último backup. Salve outro em Ajustes > Dados.`);
}
function lerArquivo() {
  return new Promise((ok, er) => {
    const f = $('#file'); f.value = '';
    f.onchange = () => {
      const a = f.files[0]; if (!a) return er(new Error('cancelado'));
      const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => er(r.error); r.readAsText(a);
    };
    f.click();
  });
}
async function aplicarPacote(obj) {            // usado pelo arquivo local e pelo Google Drive
  if (!(await confirmar(`Restaurar o backup de ${new Date(obj.exportadoEm).toLocaleDateString('pt-BR')}? Os dados atuais serão substituídos.`, 'Restaurar'))) return false;
  const cfg = DB.cfg; DB = merge(DEF(), obj.dados); DB.cfg = cfg; DB.timers = {};
  Store.salvar(); aplicarTema(); go(modAtual); toast('Backup restaurado.');
  return true;
}
async function restaurar() {
  let obj;
  try { obj = JSON.parse(await lerArquivo()); } catch (e) { if (e.message !== 'cancelado') toast('Arquivo inválido: não é um backup em JSON.'); return; }
  if (obj && obj.$backup === 1) return toast('Este backup está criptografado. Remova a senha no app antigo e exporte de novo.');
  if (obj && obj.app === 'meuapp' && obj.dados) return aplicarPacote(obj);
  if (obj && Array.isArray(obj.transactions)) return importarFluxo(obj);
  toast('Formato de backup não reconhecido.');
}
async function importarFluxo(o) {
  const tx = []; let ign = 0;
  o.transactions.forEach(t => {
    if (t && dataOk(t.data) && (t.tipo === 'entrada' || t.tipo === 'saida') && typeof t.valor === 'number' && t.valor > 0)
      tx.push({ ...t, id: t.id || uid('tx'), categoria: t.categoria || 'Outros', descricao: t.descricao || '', status: ['pendente', 'pago', 'recebido'].includes(t.status) ? t.status : (t.tipo === 'entrada' ? 'recebido' : 'pago') });
    else ign++;
  });
  const contas = (Array.isArray(o.contas) ? o.contas : []).filter(c => c && c.nome).map(c => ({ id: c.id || uid('c'), nome: c.nome, tipo: c.tipo || 'banco', saldoInicial: Number(c.saldoInicial) || 0, ativa: c.ativa !== false }));
  const msg = `Importar do Fluxo de Caixa: ${tx.length} lançamentos, ${contas.length || 1} conta(s)${ign ? `, ${ign} registros inválidos ignorados` : ''}. As finanças atuais serão substituídas.`;
  if (!(await confirmar(msg, 'Importar'))) return;
  const fin = DB.fin;
  fin.tx = tx; fin.series = []; fin.semData = [];
  fin.contas = contas.length ? contas : [{ id: 'c_principal', nome: 'Conta principal', tipo: 'banco', saldoInicial: Number(o.saldoInicial) || 0, ativa: true }];
  const ids = new Set(fin.contas.map(c => c.id));
  fin.transferencias = (Array.isArray(o.transferencias) ? o.transferencias : []).filter(t => t && dataOk(t.data) && ids.has(t.origemId) && ids.has(t.destinoId) && t.valor > 0);
  const c = o.categorias;
  fin.categorias = (c && Array.isArray(c.entrada) && Array.isArray(c.saida)) ? { entrada: c.entrada.filter(Boolean), saida: c.saida.filter(Boolean) } : DEF().fin.categorias;
  tx.forEach(t => { const l = fin.categorias[t.tipo]; if (!l.includes(t.categoria)) l.push(t.categoria); });
  fin.orcamentos = (o.orcamentos && typeof o.orcamentos === 'object' && !Array.isArray(o.orcamentos)) ? o.orcamentos : {};
  fin.extras = { investimentos: o.investimentos || (fin.extras && fin.extras.investimentos) || [], debts: o.debts || [], cartoes: o.cartoes || [], metas: o.metas || [], modelos: o.modelos || [], lixeira: o.lixeira || [], centrosCusto: o.centrosCusto || [] };
  Store.salvar(); Fin.S.seg = 'lanc'; go('fin'); toast('Finanças importadas.');
}

/* ---------- ajustes ---------- */
function ajustes() {
  const u = DB.cfg.ultimoBackup;
  const mrow = (id, titulo, sub) => `<button type="button" class="mrow" id="${id}"><span class="t"><b>${titulo}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="go">›</span></button>`;
  const s = sheet('Ajustes', `
    ${F('Seu nome (aparece no painel Hoje)', inp('nome', DB.cfg.nome, 'autocomplete="off"'))}
    <div class="dia">Aparência</div>
    <div class="mlist"><button type="button" class="mrow" id="tm"><span class="pv" data-p="${paletaAtual()}"><i></i></span><span class="t"><b>Tema e personalização</b><small>${nomeTema()}</small></span><span class="go">›</span></button></div>
    <div class="dia">Abas do app</div>
    <p class="mu sm" style="margin:0 0 6px">Escolha quais abas ficam ativas. As desligadas somem da barra e do painel Hoje; os dados delas continuam guardados.</p>
    <div id="abas">${ABAS.map(([id, nome]) => `<label class="sw"><span>${nome}</span><input type="checkbox" name="ab_${id}"${abaOn(id) ? ' checked' : ''}></label>`).join('')}</div>
    ${window.pwaPrompt ? `<div class="dia">Aplicativo</div><div class="mlist">${mrow('inst', 'Instalar o app', 'Adiciona à tela inicial e abre em tela cheia')}</div>` : ''}
    <div class="dia">Segurança</div>
    <div class="mlist">${mrow('pin1', DB.cfg.pin ? 'Alterar PIN' : 'Definir PIN', DB.cfg.pin ? 'Bloqueio por PIN ligado' : 'Bloqueia o app ao abrir')}${DB.cfg.pin ? mrow('pin0', 'Remover PIN', 'Desliga o bloqueio') : ''}</div>
    ${DB.cfg.pin ? F('Pedir o PIN depois de', sel('lockMin', [[0, 'Sempre ao reabrir'], [1, '1 minuto'], [5, '5 minutos'], [15, '15 minutos']], DB.cfg.lockMin)) : ''}
    <div class="dia">Dados</div>
    <div class="mlist">${mrow('bk', 'Salvar backup', u ? 'Último backup: ' + new Date(u).toLocaleString('pt-BR') : 'Você ainda não fez backup')}${mrow('rs', 'Restaurar / importar', 'Backups do Nortrium ou do Fluxo de Caixa')}</div>
    <p class="hint" style="margin-top:8px">Seus dados ficam só neste navegador, neste aparelho. Salve backups com frequência e guarde o arquivo fora do aparelho (por exemplo, no Drive). “Restaurar / importar” aceita backups do Nortrium, inclusive do app Android, e do Fluxo de Caixa.</p>
    ${Nuvem.bloco()}`);
  const grava = () => { const v = vals(s.el); DB.cfg.nome = (v.nome || '').trim(); if (v.lockMin !== undefined) DB.cfg.lockMin = +v.lockMin; Store.salvar(); };
  s.$$('input,select').forEach(e => e.onchange = grava);
  s.$('#tm').onclick = () => { s.fechar(); temaTela(ajustes); };
  s.$$('#abas input').forEach(c => c.onchange = () => {
    const id = c.name.slice(3);
    DB.cfg.abas = DB.cfg.abas || {};
    DB.cfg.abas[id] = c.checked;
    if (!abasAtivas().length) { DB.cfg.abas[id] = true; c.checked = true; return toast('Deixe pelo menos uma aba ligada.'); }
    Store.salvar(); montarNav();
    if (!abaOn(modAtual)) go(abasAtivas()[0]); else go(modAtual);
  });
  s.$('[name=nome]').oninput = () => { DB.cfg.nome = s.$('[name=nome]').value.trim(); Store.salvar(); };
  const bi = s.$('#inst');
  if (bi) bi.onclick = async () => { const ev = window.pwaPrompt; window.pwaPrompt = null; s.fechar(); if (ev) { ev.prompt(); try { await ev.userChoice; } catch (e) {} } };
  s.$('#bk').onclick = salvarBackup;
  s.$('#rs').onclick = async () => { s.fechar(); await restaurar(); };
  Nuvem.ligar(s);
  s.$('#pin1').onclick = async () => {
    if (!(window.crypto && crypto.subtle)) return toast('Este aparelho não suporta bloqueio por PIN.');
    const p = prompt('Novo PIN (4 a 8 números)') || ''; if (!p) return;
    if (!/^\d{4,8}$/.test(p)) return toast('O PIN deve ter de 4 a 8 números.');
    if ((prompt('Repita o PIN') || '') !== p) return toast('Os PINs não conferem.');
    DB.cfg.salt = uid('s'); DB.cfg.pin = await hashPin(p, DB.cfg.salt); Store.salvar(); s.fechar(); toast('PIN definido.');
  };
  const r0 = s.$('#pin0'); if (r0) r0.onclick = async () => { if (await confirmar('Remover o bloqueio por PIN?', 'Remover')) { DB.cfg.pin = null; DB.cfg.salt = null; Store.salvar(); s.fechar(); toast('PIN removido.'); } };
}


/* ---------- tela de tema e personalização ---------- */
function temaTela(voltar) {
  const s = sheet('Tema e personalização', `
    <div class="prev" aria-hidden="true">
      <div class="card"><b>Prévia do tema</b><div class="bar"><i style="width:64%"></i></div><small class="mu">3 de 5 tarefas feitas hoje</small>
        <div class="seg" style="margin:12px 0 4px"><button type="button" class="on">Hoje</button><button type="button">Semana</button><button type="button">Mês</button></div>
        <div class="acts" style="justify-content:flex-start;margin-top:10px"><button type="button" class="btn">Salvar</button><button type="button" class="btn sec">Cancelar</button></div></div>
    </div>
    <div class="dia">Temas prontos</div>
    <div class="paletas" id="presets">${PRESETS.map(([id, n, d, c]) => `<button type="button" data-t="${id}" class="${presetOn(c) ? 'on' : ''}"><span class="pv" data-p="${c.paleta}"><i></i></span><span><b>${n}</b><small>${d}</small></span></button>`).join('')}</div>
    <div class="dia">Modo</div>
    <div class="tg t3" id="modo">${[['escuro', 'Escuro'], ['claro', 'Claro'], ['auto', 'Automático']].map(([id, n]) => `<button type="button" data-m="${id}" class="${DB.cfg.tema === id ? 'on' : ''}">${n}</button>`).join('')}</div>
    <label class="sw"><span>Preto puro<br><small class="mu">Fundo totalmente preto no modo escuro; economiza bateria em telas AMOLED.</small></span><input type="checkbox" data-k="amoled"${DB.cfg.amoled ? ' checked' : ''}></label>
    <label class="sw"><span>Destaque único<br><small class="mu">Abas, botões e menu usam a cor da paleta em todos os módulos.</small></span><input type="checkbox" data-k="mono"${DB.cfg.mono ? ' checked' : ''}></label>
    <div class="dia">Paleta de cores</div>
    <div class="paletas" id="paletas">${PALETAS.map(([id, n, d]) => `<button type="button" data-p="${id}" class="${paletaAtual() === id ? 'on' : ''}"><span class="pv" data-p="${id}"><i></i></span><span><b>${n}</b><small>${d}</small></span></button>`).join('')}</div>
    <div class="dia">Estilo visual</div>
    <div class="estilos" id="estilos">${ESTILOS.map(([id, n, d]) => `<button type="button" data-e="${id}" class="${estiloAtual() === id ? 'on' : ''}"><span class="sv sv-${id}"><i></i><i></i></span><span><b>${n}</b><small>${d}</small></span></button>`).join('')}</div>
    <div class="dia">Abertura</div>
    ${F('Vídeo de abertura', sel('intro', [['m', 'Ligado'], ['0', 'Desligado']], introModo() === '0' ? '0' : 'm'))}`, { full: true, onClose: voltar });
  const marca = (q, attr, val) => s.$$(q).forEach(x => x.classList.toggle('on', x.dataset[attr] === val));
  const sync = () => {
    marca('#modo button', 'm', DB.cfg.tema); marca('#paletas button', 'p', paletaAtual()); marca('#estilos button', 'e', estiloAtual());
    s.$$('#presets button').forEach(x => x.classList.toggle('on', presetOn(PRESETS.find(q => q[0] === x.dataset.t)[3])));
    s.$$('input[data-k]').forEach(c => { c.checked = !!DB.cfg[c.dataset.k]; });
  };
  const muda = (k, v) => { DB.cfg[k] = v; Store.salvar(); aplicarTema(); sync(); };
  s.$$('#modo button').forEach(b => b.onclick = () => muda('tema', b.dataset.m));
  s.$$('#paletas button').forEach(b => b.onclick = () => muda('paleta', b.dataset.p));
  s.$$('#estilos button').forEach(b => b.onclick = () => muda('estilo', b.dataset.e));
  s.$$('input[data-k]').forEach(c => c.onchange = () => muda(c.dataset.k, c.checked));
  s.$$('#presets button').forEach(b => b.onclick = () => { const c = PRESETS.find(q => q[0] === b.dataset.t)[3]; Object.assign(DB.cfg, { tema: c.tema, paleta: c.paleta, estilo: c.estilo, mono: !!c.mono, amoled: false }); Store.salvar(); aplicarTema(); sync(); toast(b.dataset.t === 'padrao' ? 'Tema padrão restaurado.' : 'Tema aplicado.'); });
  s.$('[name=intro]').onchange = e => { try { localStorage.setItem('nortrium.intro', e.target.value); } catch (x) {} };
}

/* ---------- barra de baixo (só as abas ligadas) ---------- */
function montarNav() {
  $('#nav').innerHTML = ORDEM.filter(abaOn).map(id => `<button data-id="${id}" aria-label="${NOME_NAV[id]}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[ICONE_NAV[id] || id]}</svg>${NOME_NAV[id]}</button>`).join('');
  $$('#nav button').forEach(b => b.onclick = () => go(b.dataset.id));
}

/* ---------- boot ---------- */
async function boot() {
  const ok = await Store.carregar();
  if (!DB.cfg.v2) { DB.cfg.v2 = true; if (DB.cfg.tema === 'auto') DB.cfg.tema = 'escuro'; Store.salvar(); }   // novo visual: escuro por padrão
  aplicarTema();
  montarNav();
  $('#cfg').onclick = ajustes;
  go(abasAtivas()[0] || 'hoje');
  if (!ok) toast('Não foi possível ler os dados salvos. Nada será sobrescrito.');
  bloquear();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}   // pede para o navegador não apagar os dados
  setTimeout(lembrarBackup, 4000);
  setTimeout(Nuvem.auto, 8000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(Nuvem.auto, 4000); });
}
boot();
