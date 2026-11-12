'use strict';
/* =========================================================
   CORE — utilitários, banco de dados, componentes de interface
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const uid = p => (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- datas ---------- */
const p2 = n => String(n).padStart(2, '0');
const ymd = (d = new Date()) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const hoje = () => ymd();
const pd = s => new Date(s + 'T00:00:00');
const dataOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && ymd(pd(s)) === s;
const addDias = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ymd(d); };
const addMeses = (s, n) => {
  const d = pd(s), dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return ymd(d);
};
const diasEntre = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
const inicioSemana = s => addDias(s, -((pd(s).getDay() + 6) % 7));   // semana começa na segunda
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_L = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const fmtData = s => { const d = pd(s); return `${p2(d.getDate())} ${MESES[d.getMonth()].slice(0, 3).toLowerCase()}`; };
const fmtDataL = s => { const d = pd(s); return `${DIAS_L[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}`; };
const fmtDiaCurto = s => { const d = pd(s); return `${DIAS[d.getDay()]}, ${fmtData(s)}`; };
const quando = s => {                       // "hoje", "amanhã", "em 3 dias", "há 2 dias"
  const n = diasEntre(hoje(), s);
  return n === 0 ? 'hoje' : n === 1 ? 'amanhã' : n === -1 ? 'ontem' : n > 0 ? `em ${n} dias` : `há ${-n} dias`;
};

/* ---------- números ---------- */
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const soma = a => r2(a.reduce((x, y) => x + y, 0));
const dinheiro = n => (n < 0 ? '−' : '') + 'R$ ' + Math.abs(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dur = min => { min = Math.round(min || 0); const hh = Math.floor(min / 60), m = min % 60; return hh ? `${hh}h${m ? p2(m) : ''}` : `${m}min`; };
const num = v => {                          // aceita "1.234,56", "12,5", "12.5"
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/\s/g, ''); if (!s) return NaN;
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
};
const numStr = n => (n || n === 0) ? String(n).replace('.', ',') : '';

/* =========================================================
   BANCO DE DADOS — um objeto só, gravado em IndexedDB
   ========================================================= */
const DEF = () => ({
  v: 1,
  cfg: { tema: 'escuro', estilo: 'editorial', foco: true, v2: false, notif: { ativo: true, antecedencia: 15, hora: '08:00', horaFim: '20:00', dias: 14, tipos: { evento: true, conta: true, treino: true, prova: true, tarefa: true } }, abas: { hoje: true, agenda: true, fin: true, treino: true, estudo: true, trab: true }, pin: null, salt: null, lockMin: 1, nome: '', ultimoBackup: null, slot: 0, descanso: 90 },
  fin: {
    tx: [],
    contas: [{ id: 'c_principal', nome: 'Conta principal', tipo: 'banco', saldoInicial: 0, ativa: true }],
    transferencias: [],
    categorias: { entrada: ['Salário', 'Vendas', 'Outros'], saida: ['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Lazer', 'Contas', 'Outros'] },
    orcamentos: {},
    subcats: { entrada: {}, saida: {} },        // subcategorias: { saida: { 'Mercado': ['Feira', …] } }
    series: [],                                 // gastos/ganhos que se repetem sem data final (ver Fin.sincSeries)
    semData: [],                                // valores que vão sair/entrar, mas sem data certa
    extras: {}                                   // cartões, dívidas, metas, investimentos… (ver js/fin-extras.js)
  },
  agenda: { eventos: [] },
  agua: { meta: 0, rapidos: [200, 300, 500], reg: [] },        // reg: { id, data, hora, ml }
  dieta: {
    metas: { kcal: 0, prot: 0, carb: 0, gord: 0, fib: 0 },   // 0 = sem meta
    tipos: ['Café da manhã', 'Lanche da manhã', 'Almoço', 'Lanche da tarde', 'Jantar', 'Ceia'],
    alimentos: [], refeicoes: [], modelos: [], receitas: [], compras: []
  },
  relogio: { conectado: false, ultima: null, dias: {} },        // dados do smartwatch via Health Connect (js/relogio.js)
  treino: { fichas: [], sessoes: [], medidas: [], andamento: null },   // andamento = treino em curso (salvo a cada toque)
  estudo: { materias: [], sessoes: [], itens: [], aulas: [], topicos: [], cursos: [], disciplinas: [] },
  avisos: [],                                  // lembretes avulsos (só notificam, não vão para a agenda)
  trabalho: { projetos: [], tarefas: [], horas: [] },
  timers: {}
});
let DB = DEF();

/* ---------- abas ativas (Ajustes > Abas do app) ---------- */
const ABAS = [['hoje', 'Hoje'], ['agenda', 'Agenda'], ['fin', 'Finanças'], ['treino', 'Saúde'], ['estudo', 'Estudos'], ['trab', 'Trabalho']];
const abaOn = id => { const a = DB.cfg && DB.cfg.abas; return !a || a[id] !== false; };
const abasAtivas = () => ABAS.map(a => a[0]).filter(abaOn);

function merge(base, src) {
  if (!src || typeof src !== 'object' || Array.isArray(src)) return base;
  for (const k of Object.keys(src)) {
    const b = base[k], s = src[k];
    base[k] = (b && typeof b === 'object' && !Array.isArray(b) && s && typeof s === 'object' && !Array.isArray(s)) ? merge(b, s) : s;
  }
  return base;
}

const Store = (() => {
  let db = null, timer = null, lastRaw = '', lastPrevAt = 0, travado = false;
  const abrir = () => new Promise((ok, er) => {
    if (db) return ok(db);
    const r = indexedDB.open('meuapp', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => { db = r.result; ok(db); };
    r.onerror = () => er(r.error);
  });
  const get = async k => { const d = await abrir(); return new Promise((ok, er) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => er(q.error); }); };
  const put = async (k, v) => { const d = await abrir(); return new Promise((ok, er) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = ok; t.onerror = () => er(t.error); }); };

  async function carregar() {
    let erros = 0;
    for (const k of ['db', 'db_prev']) {
      try {
        const raw = await get(k);
        if (raw) { DB = merge(DEF(), JSON.parse(raw)); lastRaw = raw; return k === 'db'; }
      } catch (e) { erros++; console.error(e); }
    }
    if (erros) travado = true;                 // não sobrescrever dados que não conseguimos ler
    return !erros;
  }
  function salvar() { clearTimeout(timer); timer = setTimeout(gravar, 300); }
  async function gravar() {
    clearTimeout(timer);
    if (travado) return;
    try {
      const raw = JSON.stringify(DB);
      if (raw === lastRaw) return;
      if (lastRaw && Date.now() - lastPrevAt > 36e5) { await put('db_prev', lastRaw); lastPrevAt = Date.now(); }
      await put('db', raw); lastRaw = raw;
    } catch (e) { console.error(e); toast('Não foi possível salvar os dados.'); }
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
  return { carregar, salvar, gravar };
})();

/* =========================================================
   INTERFACE
   ========================================================= */
const overlays = [];                            // pilha para o botão "voltar" do Android

function sheet(titulo, html, opts = {}) {
  const ov = h(`<div class="ov"><div class="sheet${opts.full ? ' full' : ''}" role="dialog" aria-modal="true"><div class="sheet-h"><b>${esc(titulo)}</b><button class="x" aria-label="Fechar">×</button></div><div class="sheet-b">${html}</div></div></div>`);
  document.body.appendChild(ov);
  const api = {
    el: ov, $: s => $(s, ov), $$: s => $$(s, ov),
    fechar() { const i = overlays.indexOf(api); if (i >= 0) overlays.splice(i, 1); ov.remove(); if (opts.onClose) opts.onClose(); },
    async tentarFechar() { if (opts.beforeClose && !(await opts.beforeClose())) return; api.fechar(); }
  };
  overlays.push(api);
  $('.x', ov).onclick = () => api.tentarFechar();
  ov.addEventListener('click', e => { if (e.target === ov && !opts.full) api.tentarFechar(); });
  return api;
}

function dialog(msg, botoes = ['Cancelar', 'OK'], perigo = false) {
  return new Promise(res => {
    const ov = h(`<div class="ov mid"><div class="dlg" role="alertdialog"><p>${esc(msg)}</p><div class="dbtn">${botoes.map((b, i) => `<button class="btn ${i === botoes.length - 1 ? (perigo ? 'bad' : '') : 'sec'}" data-i="${i}">${esc(b)}</button>`).join('')}</div></div></div>`);
    document.body.appendChild(ov);
    const api = { fechar() { const i = overlays.indexOf(api); if (i >= 0) overlays.splice(i, 1); ov.remove(); }, tentarFechar() { api.fechar(); res(-1); } };
    overlays.push(api);
    $$('button', ov).forEach(b => b.onclick = () => { api.fechar(); res(+b.dataset.i); });
  });
}
const confirmar = (msg, ok = 'Excluir') => dialog(msg, ['Cancelar', ok], true).then(i => i === 1);

let toastTimer = null;
function toast(msg, desfazer) {
  $$('.toast').forEach(t => t.remove()); clearTimeout(toastTimer);
  const t = h(`<div class="toast" role="status"><span>${esc(msg)}</span>${desfazer ? '<button>Desfazer</button>' : ''}</div>`);
  document.body.appendChild(t);
  if (desfazer) $('button', t).onclick = () => { t.remove(); desfazer(); };
  toastTimer = setTimeout(() => t.remove(), desfazer ? 6000 : 3500);
}

/* ---------- formulários ---------- */
const F = (label, inner, cls = '') => `<label class="f ${cls}"><span>${label}</span>${inner}</label>`;
const inp = (name, val = '', attrs = '') => `<input name="${name}" value="${esc(val)}" ${attrs}>`;
const sel = (name, opts, val) => `<select name="${name}">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
const vals = r => { const o = {}; $$('[name]', r).forEach(e => { o[e.name] = e.type === 'checkbox' ? e.checked : e.value; }); return o; };
const segHtml = (itens, atual) => `<div class="seg">${itens.map(([k, l]) => `<button data-s="${k}" class="${atual === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;


/* ---------- gráficos em SVG (sem bibliotecas) ---------- */
let _gid = 0;
const Graf = {
  PAL: ['#22E58F', '#6EA8FF', '#FFA23A', '#A07BFF', '#FF7AB6', '#4CC9F0', '#F5B83D'],
  anel(pct, cls = '') {
    const R = 40, C = 2 * Math.PI * R, p = Math.max(0, Math.min(100, pct));
    return `<div class="ring ${cls}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="bg" cx="50" cy="50" r="${R}"/><circle class="fg" cx="50" cy="50" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - p / 100)).toFixed(1)}"/></svg><b>${Math.round(p)}%</b></div>`;
  },
  rosca(partes, tam = 124) {                      // partes: [{ v, cor }]
    const R = 38, C = 2 * Math.PI * R, tot = partes.reduce((a, x) => a + x.v, 0) || 1; let acc = 0;
    const arcos = partes.map(x => {
      const len = x.v / tot * C, gap = partes.length > 1 ? 2.5 : 0, seg = Math.max(0.1, len - gap);
      const s = `<circle cx="50" cy="50" r="${R}" fill="none" stroke="${x.cor}" stroke-width="13" stroke-dasharray="${seg.toFixed(2)} ${(C - seg).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"/>`;
      acc += len; return s;
    }).join('');
    return `<svg viewBox="0 0 100 100" width="${tam}" height="${tam}" style="transform:rotate(-90deg);flex:none" aria-hidden="true"><circle cx="50" cy="50" r="${R}" fill="none" stroke="var(--ln)" stroke-width="13"/>${arcos}</svg>`;
  },
  linha(vals, rot, h = 130) {                     // linha reta (segmentos), área chapada, sem brilho
    const W = 320, L = 10, Rr = 10, T = 12, B = 24, n = vals.length;
    if (n < 2) return '';
    const mn = Math.min(...vals), mx = Math.max(...vals), rg = (mx - mn) || 1;
    const X = i => L + i * (W - L - Rr) / (n - 1), Y = v => T + (1 - (v - mn) / rg) * (h - T - B);
    const P = vals.map((v, i) => [X(i), Y(v)]);
    const d = P.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
    const ult = P[n - 1], base = h - B;
    const grade = [0.25, 0.5, 0.75].map(f => `<line x1="${L}" x2="${W - Rr}" y1="${(T + f * (base - T)).toFixed(1)}" y2="${(T + f * (base - T)).toFixed(1)}" stroke="var(--ln)" stroke-width="1" stroke-dasharray="3 4"/>`).join('');
    const labels = rot.map((t, i) => t ? `<text x="${X(i).toFixed(1)}" y="${h - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}" font-size="10" fill="var(--mu)">${t}</text>` : '').join('');
    const q2 = (q, r, extra) => `<rect x="${(q[0] - r).toFixed(1)}" y="${(q[1] - r).toFixed(1)}" width="${2 * r}" height="${2 * r}" ${extra}/>`;
    return `<svg viewBox="0 0 ${W} ${h}" style="width:100%;display:block" role="img" aria-label="Evolução do saldo">${grade}
      <path d="${d} L${ult[0].toFixed(1)},${base} L${P[0][0].toFixed(1)},${base} Z" fill="var(--cor)" fill-opacity=".1" stroke="none"/>
      <path d="${d}" fill="none" stroke="var(--cor)" stroke-width="2" stroke-linejoin="miter"/>
      ${P.length <= 14 ? P.slice(0, -1).map(q => q2(q, 2.5, 'fill="var(--sf)" stroke="var(--cor)" stroke-width="1.5"')).join('') : ''}
      ${q2(ult, 4, 'fill="var(--cor)"')}${labels}</svg>`;
  }
};

/* ---------- cronômetros (sobrevivem ao fechar o app) ---------- */
const Cron = {
  get: k => DB.timers[k] || null,
  ini(k, dados) { DB.timers[k] = { ...dados, inicio: Date.now() }; Store.salvar(); },
  fim(k) {
    const t = DB.timers[k]; if (!t) return null;
    delete DB.timers[k]; Store.salvar();
    return { ...t, min: Math.max(1, Math.round((Date.now() - t.inicio) / 60000)) };
  },
  fmt(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return p2(Math.floor(s / 3600)) + ':' + p2(Math.floor(s / 60) % 60) + ':' + p2(s % 60); }
};
setInterval(() => $$('[data-cron]').forEach(e => { const t = DB.timers[e.dataset.cron]; if (t) e.textContent = Cron.fmt(Date.now() - t.inicio); }), 1000);

/* ---------- arquivos ---------- */
const ROOT = 'MEU APP';
const b64 = str => btoa(unescape(encodeURIComponent(str)));
async function salvarArquivo(sub, nome, texto, mime = 'text/plain') {
  const sd = window.cordova && cordova.plugins && cordova.plugins.SaveDocuments;
  if (sd) {
    try {
      const caminho = await new Promise((ok, er) => sd.save(ROOT, sub, nome, mime, b64(texto), ok, er));
      return { ok: true, caminho };
    } catch (e) { console.error('SaveDocuments falhou, usando download:', e); }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: mime })); a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return { ok: true, caminho: nome };
}
const csvCel = v => { v = String(v ?? ''); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const csv = linhas => '\ufeff' + linhas.map(l => l.map(csvCel).join(';')).join('\r\n');

/* ---------- registro de módulos e navegação ---------- */
const MODS = {};
let modAtual = 'hoje';
const registrar = m => { MODS[m.id] = m; };
function refresh() {
  const m = MODS[modAtual], main = $('#main'), y = main.scrollTop;
  m.render(main);
  main.scrollTop = y;
  const fab = $('#fab'), a = m.fab && m.fab();
  fab.hidden = !a; fab.onclick = a || null;
  fab.setAttribute('aria-label', (m.fabLabel && m.fabLabel()) || 'Adicionar');
}
function commit() { Store.salvar(); refresh(); }
function go(id) {
  if (!abaOn(id)) id = abasAtivas()[0] || 'hoje';     // aba desligada: abre a primeira que estiver ligada
  modAtual = id; document.body.dataset.mod = id;
  $('#titulo').textContent = MODS[id].nome;
  const ic = $('#ticon'); if (ic && typeof ICONES !== 'undefined') ic.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[id] || ''}</svg>`;
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.id === id));
  const on = $('#nav button.on'), nv = $('#nav');
  if (on && nv) { const x = on.offsetLeft - (nv.clientWidth - on.offsetWidth) / 2; if (nv.scrollTo) nv.scrollTo({ left: x, behavior: 'smooth' }); else nv.scrollLeft = x; }
  $('#main').scrollTop = 0;
  refresh();
}
