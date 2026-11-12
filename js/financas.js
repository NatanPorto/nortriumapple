'use strict';
/* =========================================================
   FINANÇAS — lançamentos, a pagar/receber, contas, orçamentos, resumo
   (modelo de dados compatível com o Fluxo de Caixa)
   ========================================================= */
const Fin = (() => {
  const S = { seg: 'lanc', mes: hoje().slice(0, 7), filtro: 'todos', busca: '' };
  const mesNome = m => { const [y, mo] = m.split('-'); return MESES[+mo - 1] + ' ' + y; };
  const addMes = (m, n) => addMeses(m + '-01', n).slice(0, 7);
  const contaDe = id => DB.fin.contas.find(c => c.id === id) || DB.fin.contas[0];
  const PAG = { credito: 'Crédito', debito: 'Débito', pix: 'Pix', dinheiro: 'Dinheiro' };
  const efData = t => t.pagoEm || t.data;                    // dia em que o dinheiro de fato saiu/entrou (pago antes do vencimento conta na hora)
  const subsDe = (tipo, cat) => ((DB.fin.subcats || {})[tipo] || {})[cat] || [];
  const nomeCat = t => t.categoria + (t.sub ? ' › ' + t.sub : '');
  const semDataL = () => (DB.fin.semData = DB.fin.semData || []);
  const serieL = () => (DB.fin.series = DB.fin.series || []);
  const serieDe = t => serieL().find(x => x.id === t.seriesId);
  const fmtV = t => `${t.tipo === 'entrada' ? '+' : '−'} ${dinheiro(t.valor)}`;

  /* ---------- cálculos ---------- */
  function saldos() {
    const hj = hoje(), ids = new Set(DB.fin.contas.map(c => c.id)), main = DB.fin.contas[0].id, real = {}, proj = {};
    DB.fin.contas.forEach(c => { real[c.id] = proj[c.id] = c.saldoInicial || 0; });
    DB.fin.tx.forEach(t => {
      const cid = ids.has(t.contaId) ? t.contaId : main, v = t.tipo === 'entrada' ? t.valor : -t.valor;
      proj[cid] += v; if (t.status !== 'pendente' && efData(t) <= hj) real[cid] += v;
    });
    DB.fin.transferencias.forEach(tr => {
      if (real[tr.origemId] === undefined || real[tr.destinoId] === undefined) return;
      proj[tr.origemId] -= tr.valor; proj[tr.destinoId] += tr.valor;
      if (tr.data <= hj) { real[tr.origemId] -= tr.valor; real[tr.destinoId] += tr.valor; }
    });
    return { real, proj };
  }
  const saldoTotal = () => r2(Object.values(saldos().real).reduce((a, b) => a + b, 0));
  const pendentes = () => DB.fin.tx.filter(t => t.status === 'pendente').sort((a, b) => a.data.localeCompare(b.data));
  const porCategoria = lista => {
    const m = {}; lista.forEach(t => { m[t.categoria] = (m[t.categoria] || 0) + t.valor; });
    return Object.entries(m).map(([c, v]) => [c, r2(v)]).sort((a, b) => b[1] - a[1]);
  };
  const porSub = (lista, tipo, cat) => {
    const m = {}; lista.filter(t => t.tipo === tipo && t.categoria === cat && t.sub).forEach(t => { m[t.sub] = (m[t.sub] || 0) + t.valor; });
    const e = Object.entries(m).sort((a, b) => b[1] - a[1]); if (!e.length) return '';
    return `<div style="margin:2px 0 4px 12px">${e.map(([n, v]) => `<div style="display:flex;justify-content:space-between"><small class="mu">${esc(n)}</small><small class="n">${dinheiro(r2(v))}</small></div>`).join('')}</div>`;
  };
  const doMes = (m = S.mes) => DB.fin.tx.filter(t => t.data.startsWith(m));
  const total = (l, tipo) => soma(l.filter(t => t.tipo === tipo).map(t => t.valor));

  /* ---------- tela ---------- */
  const EXT = {};   // telas extras (js/fin-extras.js): cartões, previsão, metas, dívidas
  const SEGS = [['lanc', 'Lançamentos'], ['pend', 'A pagar/receber'], ['contas', 'Contas'], ['cart', 'Cartões'], ['prev', 'Previsão'], ['orc', 'Orçamentos'], ['metas', 'Metas'], ['inv', 'Investimentos'], ['sim', 'Simulador'], ['div', 'Dívidas'], ['resumo', 'Resumo']];
  function render(el) {
    if (EXT.sincPlanos && EXT.sincPlanos()) Store.salvar();      // aportes planejados viram lançamentos pendentes
    if (!SEGS.some(s => s[0] === S.seg)) S.seg = 'lanc';
    if (sincSeries()) Store.salvar();                            // recorrências sem data final: cria os próximos meses
    el.innerHTML = segHtml(SEGS, S.seg) + '<div id="fin-c"></div>';
    const bar = $('.seg', el), on = $('.seg .on', el);
    $$('.seg button', el).forEach(b => b.onclick = () => { S.seg = b.dataset.s; refresh(); });
    if (bar && on) bar.scrollLeft += on.getBoundingClientRect().left - bar.getBoundingClientRect().left - (bar.clientWidth - on.offsetWidth) / 2;
    const fn = ({ lanc: rLanc, pend: rPend, contas: rContas, orc: rOrc, resumo: rResumo })[S.seg] || (EXT[S.seg] && EXT[S.seg].render) || rLanc;
    fn($('#fin-c', el));
  }
  const mesNavHtml = () => `<div class="mnav"><button data-m="-1" aria-label="Mês anterior">‹</button><b>${mesNome(S.mes)}</b><button data-m="1" aria-label="Próximo mês">›</button></div>`;
  const bindMes = el => $$('.mnav button', el).forEach(b => b.onclick = () => { S.mes = addMes(S.mes, +b.dataset.m); refresh(); });

  /* Compras no cartão viram UMA saída por fatura (cartão + vencimento), no mês do vencimento.
     Só muda a exibição: os lançamentos continuam separados e os totais não mudam. */
  function agruparFaturas(lista) {
    const out = [], por = {};
    lista.forEach(t => {
      if (t.cartaoId && t.tipo === 'saida' && EXT.cartaoPor && EXT.cartaoPor(t.cartaoId)) {
        const k = t.cartaoId + '|' + t.data;
        if (!por[k]) { por[k] = { fatura: true, id: 'f:' + k, chave: k, cartaoId: t.cartaoId, data: t.data, tipo: 'saida', categoria: 'Fatura do cartão', itens: [], valor: 0, status: 'pago' }; out.push(por[k]); }
        const f = por[k]; f.itens.push(t); f.valor = r2(f.valor + t.valor); if (t.status === 'pendente') f.status = 'pendente';
      } else out.push(t);
    });
    return out;
  }
  function linhaFatura(f) {
    const venc = f.status === 'pendente' && f.data < hoje();
    const sub = [`💳 ${f.itens.length} compra${f.itens.length > 1 ? 's' : ''}`, f.status === 'pendente' ? `<span class="${venc ? 'neg' : ''}">${venc ? 'vencida' : 'a pagar'}</span>` : 'paga'].join(' · ');
    return `<div class="row" data-fat="${esc(f.chave)}">${f.status === 'pendente' ? `<button class="ck" data-fq="${esc(f.chave)}" aria-label="Marcar fatura como paga"></button>` : ''}
      <div class="t"><b>Fatura ${esc(EXT.cartaoNome(f.cartaoId))}</b><small>${sub}</small></div><span class="n neg">− ${dinheiro(f.valor)}</span></div>`;
  }
  const linha = t => t.fatura ? linhaFatura(t) : linhaTx(t);

  function linhaTx(t) {
    const venc = t.status === 'pendente' && t.data < hoje();
    const sub = [nomeCat(t), DB.fin.contas.length > 1 ? contaDe(t.contaId).nome : '', t.cartaoId && EXT.cartaoNome ? '💳 ' + EXT.cartaoNome(t.cartaoId) : (PAG[t.pagamento] || ''), t.parcelas ? `${t.parcela}/${t.parcelas}` : '',
      t.status === 'pendente' ? `<span class="${venc ? 'neg' : ''}">${venc ? 'vencido' : 'pendente'}</span>` : ''].filter(Boolean).join(' · ');
    return `<div class="row" data-id="${t.id}">${t.status === 'pendente' ? `<button class="ck" data-q="${t.id}" aria-label="Marcar como ${t.tipo === 'entrada' ? 'recebido' : 'pago'}"></button>` : ''}
      <div class="t"><b>${esc(t.descricao || t.categoria)}</b><small>${sub}</small></div>
      <span class="n ${t.tipo === 'entrada' ? 'pos' : 'neg'}">${fmtV(t)}</span></div>`;
  }
  function ligarLinhas(el) {
    $$('.row[data-id]', el).forEach(r => r.onclick = e => { if (e.target.closest('[data-q]')) return; formTx(DB.fin.tx.find(t => t.id === r.dataset.id)); });
    $$('[data-q]', el).forEach(b => b.onclick = () => baixar(b.dataset.q));
    $$('.row[data-fat]', el).forEach(r => r.onclick = e => { if (e.target.closest('[data-fq]')) return; const [c, d] = r.dataset.fat.split('|'); EXT.detalheFatura(c, d); });
    $$('[data-fq]', el).forEach(b => b.onclick = () => { const [c, d] = b.dataset.fq.split('|'); EXT.pagarFatura(c, d); });
  }
  function baixar(id) {
    const t = DB.fin.tx.find(x => x.id === id); if (!t) return;
    t.status = t.tipo === 'entrada' ? 'recebido' : 'pago'; t.pagoEm = hoje(); if (EXT.statusMudou) EXT.statusMudou(t); commit();
    toast(t.tipo === 'entrada' ? 'Marcado como recebido' : 'Marcado como pago', () => { t.status = 'pendente'; delete t.pagoEm; if (EXT.statusMudou) EXT.statusMudou(t); commit(); });
  }


  /* ---------- gráficos ---------- */
  const variacao = (a, b) => b ? Math.round((a - b) / Math.abs(b) * 100) : null;
  function saldoAte(d) {
    const base = soma(DB.fin.contas.map(c => c.saldoInicial || 0));
    return r2(base + DB.fin.tx.reduce((a, t) => (t.status !== 'pendente' && efData(t) <= d) ? a + (t.tipo === 'entrada' ? t.valor : -t.valor) : a, 0));
  }
  function serieSaldo(per) {
    const hj = hoje(), vals = [], rot = [];
    if (per === '1M') for (let k = 29; k >= 0; k--) { const d = addDias(hj, -k); vals.push(saldoAte(d)); rot.push(k % 10 === 0 || k === 29 ? `${+d.slice(8)}/${+d.slice(5, 7)}` : ''); }
    else if (per === '3M') for (let k = 12; k >= 0; k--) { const d = addDias(hj, -k * 7); vals.push(saldoAte(d)); rot.push(k % 4 === 0 ? `${+d.slice(8)}/${+d.slice(5, 7)}` : ''); }
    else { const n = per === '1A' ? 12 : 6; for (let k = n - 1; k >= 0; k--) { const ini = addMeses(hoje().slice(0, 7) + '-01', -k), fim = k === 0 ? hj : addDias(addMeses(ini, 1), -1); vals.push(saldoAte(fim)); rot.push(MESES[+ini.slice(5, 7) - 1].slice(0, 3)); } }
    return { vals, rot };
  }
  function heroSaldo() {
    const per = S.per || '6M', atual = saldoTotal(), fimAnt = addDias(hoje().slice(0, 7) + '-01', -1), v = variacao(atual, saldoAte(fimAnt)), sr = serieSaldo(per);
    const fimMes = addDias(addMeses(S.mes + '-01', 1), -1), prevMes = saldoEm(fimMes), sdv = semDataTotal();
    return `<div class="hero"><small>Saldo atual</small><div class="big">${dinheiro(atual)}</div>
      <small class="mu" style="display:block;margin-top:2px">Previsto para ${mesNome(S.mes)}: <b class="n ${prevMes < 0 ? 'neg' : ''}">${dinheiro(prevMes)}</b></small>${sdv.saida > 0 ? `<small class="mu" style="display:block">${dinheiro(r2(prevMes - sdv.saida + sdv.entrada))} se os ${dinheiro(sdv.saida)} sem data marcada saírem</small>` : ''}
      ${v === null ? '' : `<small class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '↑ +' : '↓ −'}${Math.abs(v)}% <span class="mu">em relação ao mês passado</span></small>`}
      <div class="gfx">${Graf.linha(sr.vals, sr.rot)}</div>
      <div class="seg sm pills">${['1M', '3M', '6M', '1A'].map(p => `<button data-per="${p}" class="${per === p ? 'on' : ''}">${p}</button>`).join('')}</div></div>`;
  }
  function cardCategorias(mes) {
    const l = porCategoria(mes.filter(t => t.tipo === 'saida')); if (!l.length) return '';
    const tot = soma(l.map(x => x[1])), top = l.slice(0, 5), resto = soma(l.slice(5).map(x => x[1]));
    if (resto > 0) top.push(['Outras', resto]);
    const partes = top.map(([c, v], i) => ({ c, v, cor: Graf.PAL[i % Graf.PAL.length] }));
    return `<div class="card"><h3>Categorias</h3><div class="cats">${Graf.rosca(partes)}<div class="leg2">${partes.map(p => `<div><i style="background:${p.cor}"></i><span>${esc(p.c)}</span><b>${Math.round(p.v / tot * 100)}%</b></div>`).join('')}</div></div></div>`;
  }

  function rLanc(el) {
    const mes = doMes(), ent = total(mes, 'entrada'), sai = total(mes, 'saida');
    let lista = mes;
    if (S.filtro === 'entrada' || S.filtro === 'saida') lista = lista.filter(t => t.tipo === S.filtro);
    if (S.filtro === 'pend') lista = lista.filter(t => t.status === 'pendente');
    const q = S.busca.trim().toLowerCase();
    if (q) lista = lista.filter(t => (t.descricao + ' ' + t.categoria).toLowerCase().includes(q));
    lista = agruparFaturas(lista).sort((a, b) => b.data.localeCompare(a.data));
    const dias = {}; lista.forEach(t => (dias[t.data] = dias[t.data] || []).push(t));
    const ant = doMes(addMes(S.mes, -1)), vEnt = variacao(ent, total(ant, 'entrada')), vSai = variacao(sai, total(ant, 'saida'));
    const chip = (v, bomSobe) => v === null ? '' : `<small class="${(v >= 0) === bomSobe ? 'pos' : 'neg'}">${v >= 0 ? '↑ +' : '↓ −'}${Math.abs(v)}%</small>`;
    el.innerHTML = heroSaldo() + mesNavHtml() + `
      <div class="sum"><div><small>↑ Receitas</small><b class="n pos">${dinheiro(ent)}</b>${chip(vEnt, true)}</div><div><small>↓ Despesas</small><b class="n neg">${dinheiro(sai)}</b>${chip(vSai, false)}</div><div><small>Resultado</small><b class="n ${ent - sai < 0 ? 'neg' : 'pos'}">${dinheiro(r2(ent - sai))}</b></div></div>
      ${cardCategorias(mes)}
      <label class="f"><input id="busca" type="search" placeholder="Buscar descrição ou categoria" value="${esc(S.busca)}"></label>
      <div class="seg sm">${[['todos', 'Todos'], ['entrada', 'Entradas'], ['saida', 'Saídas'], ['pend', 'Pendentes']].map(([k, l]) => `<button data-f="${k}" class="${S.filtro === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${lista.length ? Object.keys(dias).map(d => `<div class="dia">${fmtDiaCurto(d)}</div><div class="card" style="padding:2px 14px">${dias[d].map(linha).join('')}</div>`).join('')
        : `<div class="empty">${mes.length ? 'Nada encontrado com esse filtro.' : 'Nenhum lançamento neste mês.<br>Toque em + para adicionar.'}</div>`}`;
    bindMes(el); ligarLinhas(el);
    $$('[data-per]', el).forEach(b => b.onclick = () => { S.per = b.dataset.per; refresh(); });
    $$('[data-f]', el).forEach(b => b.onclick = () => { S.filtro = b.dataset.f; refresh(); });
    const bu = $('#busca', el); bu.oninput = () => { S.busca = bu.value; clearTimeout(bu._t); bu._t = setTimeout(() => { refresh(); const n = $('#busca'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 350); };
  }

  function rPend(el) {
    const hj = hoje(), mesHoje = hj.slice(0, 7), tudo = S.pvis === 'tudo';
    if (!S.pm) S.pm = mesHoje;
    let p = pendentes();
    if (!tudo) p = p.filter(t => t.data.startsWith(S.pm) || (S.pm === mesHoje && t.data < S.pm + '-01'));   // no mês atual entram também os vencidos de meses anteriores
    const bloco = (titulo, l, cls) => {
      const venc = soma(l.filter(t => t.data < hj).map(t => t.valor));
      return `<div class="card"><h3>${titulo}<span class="n ${cls}">${dinheiro(soma(l.map(t => t.valor)))}</span></h3>${venc ? `<small class="neg">${dinheiro(venc)} vencido</small>` : ''}
        ${l.length ? l.slice(0, 120).map(t => t.fatura ? linhaFatura(t) : `<div class="row" data-id="${t.id}"><button class="ck" data-q="${t.id}" aria-label="Dar baixa"></button><div class="t"><b>${esc(t.descricao || t.categoria)}</b><small><span class="${t.data < hj ? 'neg' : ''}">${fmtData(t.data)} · ${quando(t.data)}</span> · ${esc(nomeCat(t))}${t.parcelas ? ` · ${t.parcela}/${t.parcelas}` : ''}</small></div><span class="n ${cls}">${dinheiro(t.valor)}</span></div>`).join('') : '<div class="empty" style="padding:14px 0">Nada pendente.</div>'}</div>`;
    };
    const sd = semDataL(), sdS = sd.filter(x => x.tipo === 'saida'), sdE = sd.filter(x => x.tipo === 'entrada');
    const fixas = serieL().filter(x => !x.fim || x.fim >= hj);
    el.innerHTML = `<div class="seg sm"><button data-pv="mes" class="${tudo ? '' : 'on'}">Por mês</button><button data-pv="tudo" class="${tudo ? 'on' : ''}">Tudo</button></div>`
      + (tudo ? '' : `<div class="mnav"><button data-pm="-1" aria-label="Mês anterior">‹</button><b>${mesNome(S.pm)}</b><button data-pm="1" aria-label="Próximo mês">›</button></div>`)
      + bloco('A pagar', agruparFaturas(p.filter(t => t.tipo === 'saida')), 'neg') + bloco('A receber', p.filter(t => t.tipo === 'entrada'), 'pos')
      + `<div class="card"><h3>Sem data marcada<span class="n ${sdS.length ? 'neg' : ''}">${sd.length ? dinheiro(soma(sdS.map(x => x.valor))) : ''}</span></h3>
        ${sd.length ? sd.map(x => `<div class="row" data-sd="${x.id}"><button class="ck" data-sdq="${x.id}" aria-label="Dar baixa"></button><div class="t"><b>${esc(x.descricao || x.categoria)}</b><small>${esc(nomeCat(x))} · ${x.tipo === 'entrada' ? 'a receber' : 'a pagar'}, sem data</small></div><span class="n ${x.tipo === 'entrada' ? 'pos' : 'neg'}">${dinheiro(x.valor)}</span></div>`).join('') : '<small class="mu">Valores que vão sair mas ainda não têm data. Ao lançar, escolha "Sem data marcada" na situação.</small>'}
        <div class="acts" style="justify-content:flex-start;margin-top:8px"><button class="btn sec" id="sd-n">Adicionar sem data</button></div></div>`
      + (fixas.length ? `<div class="card"><h3>Mensais e anuais<span class="mu" style="font-size:12px">sem data final</span></h3>${fixas.map(x => `<div class="row" data-sr="${x.id}"><div class="t"><b>${esc(x.descricao || x.categoria)}</b><small>${x.freq === 'anual' ? 'todo ano' : 'todo mês'}${x.fim ? ' · até ' + fmtData(x.fim) : ''} · ${esc(nomeCat(x))}</small></div><span class="n ${x.tipo === 'entrada' ? 'pos' : 'neg'}">${dinheiro(x.valor)}</span></div>`).join('')}</div>` : '');
    ligarLinhas(el);
    $$('[data-pv]', el).forEach(b => b.onclick = () => { S.pvis = b.dataset.pv; refresh(); });
    $$('[data-pm]', el).forEach(b => b.onclick = () => { S.pm = addMes(S.pm, +b.dataset.pm); refresh(); });
    $$('[data-sdq]', el).forEach(b => b.onclick = e => { e.stopPropagation(); baixarSemData(b.dataset.sdq); });
    $$('[data-sd]', el).forEach(r => r.onclick = e => { if (!e.target.closest('[data-sdq]')) formSemData(semDataL().find(x => x.id === r.dataset.sd)); });
    $$('[data-sr]', el).forEach(r => r.onclick = () => formSerie(serieL().find(x => x.id === r.dataset.sr)));
    $('#sd-n', el).onclick = () => formSemData(null);
  }

  function rContas(el) {
    const { real, proj } = saldos(), tr = [...DB.fin.transferencias].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5);
    el.innerHTML = `<div class="card"><small class="mu">Saldo hoje</small><div class="big">${dinheiro(saldoTotal())}</div><small class="mu">Previsto com pendentes: ${dinheiro(r2(Object.values(proj).reduce((a, b) => a + b, 0)))}</small></div>
      <div class="card" style="padding:2px 14px">${DB.fin.contas.map(c => `<div class="row" data-c="${c.id}"><div class="t"><b>${esc(c.nome)}${c.ativa === false ? ' (inativa)' : ''}</b><small>${esc(c.tipo)} · previsto ${dinheiro(r2(proj[c.id]))}</small></div><span class="n ${real[c.id] < 0 ? 'neg' : ''}">${dinheiro(r2(real[c.id]))}</span></div>`).join('')}</div>
      <div class="acts" style="justify-content:flex-start;margin-bottom:12px"><button class="btn sec" id="nc">Nova conta</button>${DB.fin.contas.length > 1 ? '<button class="btn sec" id="nt">Transferir</button>' : ''}</div>
      ${tr.length ? `<div class="dia">Transferências recentes</div><div class="card" style="padding:2px 14px">${tr.map(t => `<div class="row" data-tr="${t.id}"><div class="t"><b>${esc(contaDe(t.origemId).nome)} → ${esc(contaDe(t.destinoId).nome)}</b><small>${fmtData(t.data)}${t.descricao ? ' · ' + esc(t.descricao) : ''}</small></div><span class="n">${dinheiro(t.valor)}</span></div>`).join('')}</div>` : ''}`;
    $$('[data-c]', el).forEach(r => r.onclick = () => formConta(DB.fin.contas.find(c => c.id === r.dataset.c)));
    $$('[data-tr]', el).forEach(r => r.onclick = async () => {
      if (!(await confirmar('Excluir esta transferência?'))) return;
      DB.fin.transferencias = DB.fin.transferencias.filter(t => t.id !== r.dataset.tr); commit();
    });
    $('#nc', el).onclick = () => formConta(null);
    const nt = $('#nt', el); if (nt) nt.onclick = formTransf;
  }

  function rOrc(el) {
    const gastos = Object.fromEntries(porCategoria(doMes().filter(t => t.tipo === 'saida')));
    const cats = [...new Set([...DB.fin.categorias.saida, ...Object.keys(DB.fin.orcamentos), ...Object.keys(gastos)])];
    const com = cats.filter(c => DB.fin.orcamentos[c]), sem = cats.filter(c => !DB.fin.orcamentos[c]);
    const lim = soma(com.map(c => DB.fin.orcamentos[c])), gas = soma(com.map(c => gastos[c] || 0));
    el.innerHTML = mesNavHtml() + (com.length ? `<div class="card"><small class="mu">Gasto nas categorias com limite</small><div class="big">${dinheiro(gas)}</div><small class="mu">de ${dinheiro(lim)}</small></div>` : '') +
      (com.length ? `<div class="card">${com.map(c => { const g = gastos[c] || 0, l = DB.fin.orcamentos[c], p = Math.min(100, Math.round(g / l * 100)); return `<div data-o="${esc(c)}" style="padding:8px 0"><div style="display:flex;justify-content:space-between"><b>${esc(c)}</b><span class="n ${g > l ? 'neg' : ''}">${dinheiro(g)} / ${dinheiro(l)}</span></div><div class="bar ${g > l ? 'over' : ''}"><i style="width:${p}%"></i></div></div>`; }).join('')}</div>` : '<div class="empty">Nenhum limite definido. Toque numa categoria abaixo para definir.</div>') +
      (sem.length ? `<div class="dia">Sem limite</div><div class="card" style="padding:2px 14px">${sem.map(c => `<div class="row" data-o="${esc(c)}"><div class="t"><b>${esc(c)}</b></div><span class="n mu">${gastos[c] ? dinheiro(gastos[c]) : '—'}</span></div>`).join('')}</div>` : '');
    el.insertAdjacentHTML('beforeend', '<div class="acts" style="justify-content:flex-start;margin-top:12px"><button class="btn sec" id="gc">Gerenciar categorias</button></div>');
    $('#gc', el).onclick = () => formCategorias('saida');
    bindMes(el);
    $$('[data-o]', el).forEach(r => r.onclick = () => formLimite(r.dataset.o));
  }

  function rResumo(el) {
    const mes = doMes(), ant = doMes(addMes(S.mes, -1)), sai = total(mes, 'saida'), saiAnt = total(ant, 'saida');
    const bloco = (titulo, tipo, cls) => {
      const l = porCategoria(mes.filter(t => t.tipo === tipo)), tot = soma(l.map(x => x[1]));
      return `<div class="card"><h3>${titulo}<span class="n ${cls}">${dinheiro(tot)}</span></h3>${l.length ? l.map(([c, v]) => `<div style="padding:6px 0"><div style="display:flex;justify-content:space-between"><span>${esc(c)}</span><span class="n">${dinheiro(v)} <small class="mu">${Math.round(v / tot * 100)}%</small></span></div><div class="bar"><i style="width:${Math.round(v / tot * 100)}%"></i></div>${porSub(mes, tipo, c)}</div>`).join('') : '<div class="empty">Sem lançamentos.</div>'}</div>`;
    };
    el.innerHTML = mesNavHtml() + (saiAnt ? `<p class="mu sm" style="margin:-4px 2px 12px">Saídas ${sai >= saiAnt ? 'subiram' : 'caíram'} ${Math.abs(Math.round((sai - saiAnt) / saiAnt * 100))}% em relação a ${mesNome(addMes(S.mes, -1))}.</p>` : '') +
      cardCategorias(mes) + bloco('Saídas por categoria', 'saida', 'neg') + bloco('Entradas por categoria', 'entrada', 'pos') +
      `<div class="acts" style="justify-content:flex-start"><button class="btn sec" id="e1">Exportar mês (CSV)</button><button class="btn sec" id="e2">Exportar tudo (CSV)</button><button class="btn sec" id="gc">Categorias</button></div>`;
    $('#gc', el).onclick = () => formCategorias('saida');
    bindMes(el);
    $('#e1', el).onclick = () => exportar(mes, `lancamentos-${S.mes}.csv`);
    $('#e2', el).onclick = () => exportar(DB.fin.tx, 'lancamentos-todos.csv');
  }
  async function exportar(lista, nome) {
    const ord = [...lista].sort((a, b) => a.data.localeCompare(b.data));
    const linhas = [['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Situação', 'Conta', 'Pagamento'], ...ord.map(t => [t.data.split('-').reverse().join('/'), t.tipo === 'entrada' ? 'Entrada' : 'Saída', t.categoria, t.descricao || '', String(t.valor).replace('.', ','), t.status, contaDe(t.contaId).nome, PAG[t.pagamento] || (t.cartaoId ? 'Crédito' : '')])];
    const r = await salvarArquivo('Relatórios', nome, csv(linhas), 'text/csv');
    toast(r.ok ? `Salvo em ${r.caminho}` : 'Não foi possível exportar.');
  }

  /* ---------- formulários ---------- */
  function formTx(t) {
    const novo = !t;
    const ini = t || { tipo: 'saida', data: S.mes === hoje().slice(0, 7) ? hoje() : S.mes + '-01', status: 'pago', contaId: DB.fin.contas[0].id, categoria: '' };
    let tipo = ini.tipo;
    const cartoes = (EXT.cartoesAtivos ? EXT.cartoesAtivos() : []).slice();
    if (ini.cartaoId && EXT.cartaoPor && !cartoes.some(c => c.id === ini.cartaoId)) { const ca = EXT.cartaoPor(ini.cartaoId); if (ca) cartoes.push(ca); }
    const s = sheet(novo ? 'Novo lançamento' : 'Editar lançamento', `
      <div class="tg"><button data-t="saida">Saída</button><button data-t="entrada">Entrada</button></div>
      ${F('Valor (R$)', inp('valor', ini.valor ? numStr(ini.valor) : '', 'inputmode="decimal" placeholder="0,00"'))}
      ${F('Descrição', inp('descricao', ini.descricao || '', 'placeholder="Ex.: Mercado"'))}
      <div class="g2">${F('Categoria', '<select name="categoria"></select>')}${F('Data', inp('data', ini.data, 'type="date"'))}</div>
      ${F('Subcategoria', '<select name="sub"></select>')}
      <div class="g2">${F('Situação', '<select name="status"></select>')}${DB.fin.contas.length > 1 ? F('Conta', sel('contaId', DB.fin.contas.filter(c => c.ativa !== false || c.id === ini.contaId).map(c => [c.id, c.nome]), ini.contaId)) : ''}</div>
      <div id="pagw"${tipo === 'saida' ? '' : ' hidden'}>${F('Forma de pagamento', sel('pagamento', [...(!ini.pagamento && !ini.cartaoId && !novo ? [['', 'Não informado']] : []), ['credito', 'Crédito'], ['debito', 'Débito'], ['pix', 'Pix'], ['dinheiro', 'Dinheiro']], ini.pagamento || (ini.cartaoId ? 'credito' : (novo ? (S.pagUlt || 'pix') : ''))))}</div>
      <div id="cartw" hidden>${cartoes.length ? F('Cartão de crédito', sel('cartaoId', cartoes.map(c => [c.id, c.nome]), ini.cartaoId || cartoes[0].id)) : '<p class="hint">Nenhum cartão cadastrado. Cadastre em Finanças › Cartões.</p>'}</div>
      ${novo ? `<div class="g2">${F('Repetir', sel('rep', [['nao', 'Não repetir'], ['parc', 'Parcelado (mensal)'], ['mes', 'Todo mês'], ['ano', 'Todo ano'], ['mes0', 'Todo mês, sem data final'], ['ano0', 'Todo ano, sem data final']], 'nao'))}<div id="vz" hidden>${F('Quantas vezes', inp('vezes', '2', 'type="number" min="2" max="120" inputmode="numeric"'))}</div></div>
      <div id="pgw" hidden>${F('Parcelas já pagas', inp('pagas', '0', 'type="number" min="0" max="119" inputmode="numeric"'))}</div>` : ''}
      <p class="hint" id="pv"></p>
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    const selCat = s.$('[name=categoria]'), selSt = s.$('[name=status]'), selSub = s.$('[name=sub]');
    const pintarSub = sub => {
      const l = subsDe(tipo, selCat.value);
      selSub.innerHTML = '<option value="">Nenhuma</option>' + l.map(x => `<option${x === sub ? ' selected' : ''}>${esc(x)}</option>`).join('') + '<option value="__nova">+ Nova subcategoria…</option>';
    };
    selSub.onchange = () => {
      if (selSub.value !== '__nova') return;
      const n = (prompt('Nome da subcategoria') || '').trim(), c = selCat.value, m = DB.fin.subcats[tipo];
      if (n) { m[c] = m[c] || []; if (!m[c].includes(n)) m[c].push(n); Store.salvar(); }
      pintarSub(n);
    };
    const catAtual = () => selCat.value;
    const selPag = s.$('[name=pagamento]'), selCartao = s.$('[name=cartaoId]'), rep = s.$('[name=rep]'), vezesEl = s.$('[name=vezes]'), pagasEl = s.$('[name=pagas]'), valorEl = s.$('[name=valor]'), dataEl = s.$('[name=data]');
    const lblValor = valorEl.previousElementSibling, lblData = dataEl.previousElementSibling;
    const credito = () => tipo === 'saida' && selPag && selPag.value === 'credito';
    const cartaoSel = () => (credito() && selCartao && selCartao.value) ? EXT.cartaoPor(selCartao.value) : null;
    const limite = (x, a, b) => Math.max(a, Math.min(b, Math.round(num(x)) || 0));
    let stAnt = null;
    function atualizar() {                         // reage a cartão, repetição, parcelas e valores
      const pw0 = s.$('#pagw'); if (pw0) pw0.hidden = tipo !== 'saida';
      const cw = s.$('#cartw'); if (cw) cw.hidden = !credito();
      const c = cartaoSel(), r = rep ? rep.value : 'nao', parc = novo && r === 'parc';
      const n = parc ? limite(vezesEl.value, 2, 120) : 1, k = parc ? limite(pagasEl.value, 0, 119) : 0;
      const pw = s.$('#pgw'); if (pw) pw.hidden = !parc;
      lblValor.textContent = parc ? 'Valor de cada parcela (R$)' : 'Valor (R$)';
      lblData.textContent = c ? (novo ? 'Data da compra' : 'Vencimento da fatura') : parc ? 'Data da 1ª parcela' : 'Data';
      const trava = novo && (!!c || k > 0);        // compra no cartão e parcelas já pagas ficam pendentes (a pagar)
      if (trava) { if (!selSt.disabled) stAnt = selSt.value; selSt.value = 'pendente'; selSt.disabled = true; }
      else if (selSt.disabled) { selSt.disabled = false; if (stAnt) selSt.value = stAnt; stAnt = null; }
      const sdSel = selSt.value === '__sd'; dataEl.disabled = sdSel; if (rep) rep.disabled = sdSel;
      const pv = s.$('#pv'), valor = num(valorEl.value), data = dataEl.value;
      let txt = '';
      if (novo && valor > 0 && dataOk(data)) {
        if (parc && k >= n) txt = 'As parcelas já pagas devem ser menos que o total de parcelas.';
        else if (parc) {
          const ini1 = c ? EXT.vencFatura(c, data, k) : addMeses(data, k), fim = c ? EXT.vencFatura(c, data, n - 1) : addMeses(data, n - 1);
          txt = `${n}x de ${dinheiro(r2(valor))} = ${dinheiro(r2(valor * n))}` + (k ? ` · ${k} já ${k > 1 ? 'pagas' : 'paga'}, faltam ${n - k} (${dinheiro(r2(valor * (n - k)))})` : '') + ` · ${c ? 'faturas' : 'parcelas'} de ${fmtData(ini1)} a ${fmtData(fim)}.`;
        } else if (c) txt = r === 'nao' ? `Entra na fatura de ${fmtData(EXT.vencFatura(c, data, 0))} do cartão ${c.nome}.` : `Entra na fatura do cartão ${c.nome} ${r === 'mes' || r === 'mes0' ? 'todo mês' : 'todo ano'}, a partir de ${fmtData(EXT.vencFatura(c, data, 0))}.`;
      } else if (!novo && c) txt = 'Em compras no cartão, a data é o vencimento da fatura.';
      pv.textContent = txt;
    }
    function preencher(cat) {
      s.$$('.tg button').forEach(b => { const on = b.dataset.t === tipo; b.classList.toggle('on', on); b.classList.toggle('s', on && tipo === 'saida'); });
      const cats = [...DB.fin.categorias[tipo]]; if (cat && !cats.includes(cat)) cats.unshift(cat);
      selCat.innerHTML = cats.map(c => `<option${c === cat ? ' selected' : ''}>${esc(c)}</option>`).join('') + '<option value="__nova">+ Nova categoria…</option>';
      const feito = tipo === 'entrada' ? 'recebido' : 'pago', st = ini.status === 'pendente' ? 'pendente' : feito;
      selSt.innerHTML = `<option value="${feito}"${st === feito ? ' selected' : ''}>${tipo === 'entrada' ? 'Recebido' : 'Pago'}</option><option value="pendente"${st === 'pendente' ? ' selected' : ''}>${tipo === 'entrada' ? 'A receber' : 'A pagar'}</option>${novo ? '<option value="__sd">Sem data marcada</option>' : ''}`;
      pintarSub(ini.sub || '');
      atualizar();
    }
    preencher(ini.categoria);
    s.$$('.tg button').forEach(b => b.onclick = () => { ini.status = selSt.value; tipo = b.dataset.t; preencher(''); });
    selCat.onchange = () => {
      if (selCat.value !== '__nova') return;
      const n = (prompt('Nome da categoria') || '').trim();
      if (n && !DB.fin.categorias[tipo].includes(n)) { DB.fin.categorias[tipo].push(n); Store.salvar(); }
      preencher(n || DB.fin.categorias[tipo][0]);
    };
    selCat.addEventListener('change', () => { if (selCat.value !== '__nova') pintarSub(''); });
    if (rep) rep.onchange = () => { s.$('#vz').hidden = rep.value === 'nao' || rep.value.endsWith('0'); atualizar(); };
    [selSt, selPag, selCartao, vezesEl, pagasEl, valorEl, dataEl].forEach(e => { if (e) { e.oninput = atualizar; e.onchange = atualizar; } });
    atualizar();
    if (!novo) s.$('[data-del]').onclick = async () => {
      const seguintes = ini.seriesId ? DB.fin.tx.filter(x => x.seriesId === ini.seriesId && x.data > ini.data) : [];
      let modo = 1;
      if (seguintes.length) { const i = await dialog('Este lançamento faz parte de uma série.', ['Cancelar', 'Só este', 'Este e os próximos'], true); if (i < 1) return; modo = i; }
      else if (!(await confirmar('Excluir este lançamento?'))) return;
      const ids = new Set([ini.id, ...(modo === 2 ? seguintes.map(x => x.id) : [])]);
      const removidos = DB.fin.tx.filter(x => ids.has(x.id));
      const se = serieDe(ini), seAntes = se ? JSON.stringify(se) : null;
      if (se) { if (modo === 2) se.fim = addDias(ini.dataCompra || ini.data, -1); else if (ini.oc !== undefined) (se.pulos = se.pulos || []).push(ini.oc); }
      DB.fin.tx = DB.fin.tx.filter(x => !ids.has(x.id));
      const desfazExt = EXT.aposExcluir ? EXT.aposExcluir(removidos, modo, ini) : null;     // ajusta investimento/plano ligados
      s.fechar(); commit();
      toast(removidos.length > 1 ? `${removidos.length} lançamentos excluídos` : 'Lançamento excluído', () => { DB.fin.tx.push(...removidos); if (se) { Object.keys(se).forEach(k => delete se[k]); Object.assign(se, JSON.parse(seAntes)); } if (desfazExt) desfazExt(); commit(); });
    };
    s.$('[data-ok]').onclick = async () => {
      const v = vals(s.el), valor = num(v.valor);
      if (!(valor > 0)) return toast('Informe um valor maior que zero.');
      if (v.status === '__sd') {                                   // sem data marcada: fica na lista, não entra em nenhum dia
        if (!v.categoria || v.categoria === '__nova') return toast('Escolha uma categoria.');
        semDataL().push({ id: uid('sd'), tipo, categoria: catAtual(), sub: v.sub && v.sub !== '__nova' ? v.sub : '', descricao: v.descricao.trim(), valor: r2(valor), contaId: v.contaId || DB.fin.contas[0].id });
        s.fechar(); S.seg = 'pend'; commit(); return toast('Guardado em "Sem data marcada".');
      }
      if (!dataOk(v.data)) return toast('Informe uma data válida.');
      if (!v.categoria || v.categoria === '__nova') return toast('Escolha uma categoria.');
      const subV = v.sub && v.sub !== '__nova' ? v.sub : '';
      const base = { tipo, categoria: catAtual(), sub: subV, descricao: v.descricao.trim(), valor: r2(valor), contaId: v.contaId || ini.contaId || DB.fin.contas[0].id };
      const c = cartaoSel();
      if (credito() && !c) return toast('Escolha o cartão de crédito (ou cadastre um em Cartões).');
      base.pagamento = tipo === 'saida' ? (v.pagamento || '') : '';
      if (base.pagamento) S.pagUlt = base.pagamento;
      if (!base.pagamento) delete base.pagamento;
      if (!novo) {
        let futuros = [];                                          // mudou o valor numa série: só os que ainda não foram pagos acompanham
        if (t.seriesId && r2(valor) !== t.valor) {
          futuros = DB.fin.tx.filter(x => x.seriesId === t.seriesId && x.id !== t.id && x.data > t.data && x.status === 'pendente');
          if (futuros.length) { const i = await dialog(`Mudar o valor só deste ou também dos próximos ${futuros.length} ainda não pagos? Os já pagos continuam como estão.`, ['Cancelar', 'Só este', 'Este e os próximos'], true); if (i < 1) return; if (i === 1) futuros = []; }
        }
        const stAnt = t.status, dtAnt = t.data;
        Object.assign(t, base, { data: v.data, status: v.status }); if (!base.pagamento) delete t.pagamento; if (!subV) delete t.sub;
        if (v.status === 'pendente') delete t.pagoEm; else if (stAnt === 'pendente') t.pagoEm = hoje(); else if (dtAnt !== v.data) delete t.pagoEm;
        if (futuros.length) { futuros.forEach(x => { x.valor = r2(valor); }); const se = serieDe(t); if (se) { se.valor = r2(valor); (se.hist = se.hist || []).push({ desde: t.data, valor: r2(valor) }); } }
        if (c) t.cartaoId = c.id; else delete t.cartaoId;
        if (EXT.statusMudou) EXT.statusMudou(t);
      } else {
        if (v.rep === 'mes0' || v.rep === 'ano0') {                // recorrência sem data final: vira uma série que se estende sozinha
          const c0 = cartaoSel(), sid = uid('sr');
          serieL().push({ id: sid, tipo, categoria: catAtual(), sub: subV, descricao: v.descricao.trim(), valor: r2(valor), contaId: base.contaId, pagamento: base.pagamento || '', cartaoId: c0 ? c0.id : '', freq: v.rep === 'ano0' ? 'anual' : 'mensal', inicio: v.data, fim: null, pulos: [], hist: [{ desde: v.data, valor: r2(valor) }], criada: hoje(), stIni: (c0 || v.status === 'pendente') ? 'pendente' : v.status });
          sincSeries(); s.fechar(); S.seg = 'pend'; commit(); return toast('Recorrência criada. Se o valor mudar, altere em "Mensais e anuais".');
        }
        const r = v.rep || 'nao', n = r === 'nao' ? 1 : Math.max(2, Math.min(120, parseInt(v.vezes) || 2)), sid = n > 1 ? uid('sr') : null;
        const k = r === 'parc' ? limite(v.pagas, 0, 119) : 0;          // parcelas que você já pagou: não são lançadas (não mexem no saldo)
        if (k >= n && r === 'parc') return toast('As parcelas já pagas devem ser menos que o total de parcelas.');
        const stIni = (c || k > 0) ? 'pendente' : v.status;
        for (let i = k; i < n; i++) {
          const occ = addMeses(v.data, i * (r === 'ano' ? 12 : 1));
          DB.fin.tx.push({
            id: uid('tx'), ...base, data: c ? (r === 'parc' ? EXT.vencFatura(c, v.data, i) : EXT.vencFatura(c, occ, 0)) : occ, status: i === 0 ? stIni : 'pendente',
            recorrente: r === 'mes' || r === 'ano', seriesId: sid, frequencia: r === 'mes' ? 'mensal' : r === 'ano' ? 'anual' : null,
            ...(c ? { cartaoId: c.id, dataCompra: r === 'parc' ? v.data : occ } : {}),
            ...(r === 'parc' ? { parcela: i + 1, parcelas: n } : {})
          });
        }
        if (k) toast(`Lançadas as ${n - k} parcelas restantes (de ${n}).`);
      }
      s.fechar(); commit();
    };
  }

  /* ---------- recorrência sem data final ---------- */
  function sincSeries() {
    const L = serieL(); if (!L.length) return false;
    const hj = hoje(), lim = addMeses(hj, 24); let mudou = false;
    L.forEach(sr => {
      const passo = sr.freq === 'anual' ? 12 : 1, c = sr.cartaoId && EXT.cartaoPor ? EXT.cartaoPor(sr.cartaoId) : null;
      const tem = new Set(DB.fin.tx.filter(t => t.seriesId === sr.id).map(t => t.oc));
      for (let i = 0; i < 400; i++) {
        const occ = addMeses(sr.inicio, i * passo);
        if (occ > lim || (sr.fim && occ > sr.fim)) break;
        if (tem.has(i) || (sr.pulos || []).includes(i) || (i > 0 && occ < (sr.criada || hj))) continue;
        DB.fin.tx.push({ id: uid('tx'), tipo: sr.tipo, categoria: sr.categoria, sub: sr.sub || undefined, descricao: sr.descricao, valor: sr.valor, contaId: sr.contaId,
          ...(sr.pagamento ? { pagamento: sr.pagamento } : {}), data: c ? EXT.vencFatura(c, occ, 0) : occ, status: i === 0 ? (sr.stIni || 'pendente') : 'pendente',
          ...(i === 0 && sr.stIni && sr.stIni !== 'pendente' ? { pagoEm: hoje() } : {}),
          recorrente: true, seriesId: sr.id, oc: i, frequencia: sr.freq, ...(c ? { cartaoId: c.id, dataCompra: occ } : {}) });
        mudou = true;
      }
    });
    return mudou;
  }
  function formSerie(sr) {
    if (!sr) return;
    const s = sheet('Mensal/anual · ' + (sr.descricao || sr.categoria), `<p class="hint">Valor atual: ${dinheiro(sr.valor)} ${sr.freq === 'anual' ? 'por ano' : 'por mês'}. O que já foi pago nunca muda; só os próximos ainda não pagos.</p>
      ${F('Novo valor (R$)', inp('valor', numStr(sr.valor), 'inputmode="decimal"'))}
      ${F('Vale a partir de', inp('desde', hoje(), 'type="date"'))}
      ${F('Termina em (deixe vazio para não ter fim)', inp('fim', sr.fim || '', 'type="date"'))}
      <div class="acts"><button class="btn bad" data-enc>Encerrar hoje</button><button class="btn" data-ok>Salvar</button></div>`);
    const antes = () => ({ sr: JSON.stringify(sr), tx: DB.fin.tx.map(t => t.seriesId === sr.id ? { t, v: t.valor } : null).filter(Boolean) });
    s.$('[data-enc]').onclick = async () => {
      if (!(await confirmar('Encerrar esta recorrência? Os já pagos ficam; os próximos ainda não pagos são removidos.'))) return;
      const bak = antes(), rem = DB.fin.tx.filter(t => t.seriesId === sr.id && t.status === 'pendente' && t.data > hoje());
      DB.fin.tx = DB.fin.tx.filter(t => !rem.includes(t)); sr.fim = hoje(); s.fechar(); commit();
      toast('Recorrência encerrada', () => { Object.keys(sr).forEach(k => delete sr[k]); Object.assign(sr, JSON.parse(bak.sr)); DB.fin.tx.push(...rem); commit(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), valor = num(v.valor);
      if (!(valor > 0)) return toast('Informe um valor maior que zero.');
      if (!dataOk(v.desde)) return toast('Informe a data inicial da mudança.');
      if (v.fim && !dataOk(v.fim)) return toast('Data final inválida.');
      const bak = antes(); let n = 0;
      DB.fin.tx.filter(t => t.seriesId === sr.id && t.status === 'pendente' && t.data >= v.desde).forEach(t => { if (t.valor !== r2(valor)) { t.valor = r2(valor); n++; } });
      const rem = v.fim ? DB.fin.tx.filter(t => t.seriesId === sr.id && t.status === 'pendente' && (t.dataCompra || t.data) > v.fim) : [];
      if (rem.length) DB.fin.tx = DB.fin.tx.filter(t => !rem.includes(t));
      sr.valor = r2(valor); sr.fim = v.fim || null; (sr.hist = sr.hist || []).push({ desde: v.desde, valor: r2(valor) });
      s.fechar(); commit();
      toast(n ? `Valor alterado em ${n} lançamento${n > 1 ? 's' : ''} que ainda não foram pagos.` : 'Salvo.', () => { Object.keys(sr).forEach(k => delete sr[k]); Object.assign(sr, JSON.parse(bak.sr)); bak.tx.forEach(o => { o.t.valor = o.v; }); DB.fin.tx.push(...rem); commit(); });
    };
  }

  /* ---------- sem data marcada ---------- */
  function semDataTotal() { const l = semDataL(); return { saida: soma(l.filter(x => x.tipo === 'saida').map(x => x.valor)), entrada: soma(l.filter(x => x.tipo === 'entrada').map(x => x.valor)) }; }
  function baixarSemData(id) {
    const x = semDataL().find(y => y.id === id); if (!x) return;
    const t = { id: uid('tx'), tipo: x.tipo, categoria: x.categoria, sub: x.sub || undefined, descricao: x.descricao, valor: x.valor, contaId: x.contaId, data: hoje(), pagoEm: hoje(), status: x.tipo === 'entrada' ? 'recebido' : 'pago' };
    DB.fin.semData = semDataL().filter(y => y !== x); DB.fin.tx.push(t); commit();
    toast(x.tipo === 'entrada' ? 'Recebido hoje' : 'Pago hoje', () => { DB.fin.tx = DB.fin.tx.filter(y => y !== t); DB.fin.semData.push(x); commit(); });
  }
  function formSemData(x) {
    const novo = !x, ini = x || { tipo: 'saida', categoria: '', descricao: '', valor: '', contaId: DB.fin.contas[0].id };
    let tipo = ini.tipo;
    const s = sheet(novo ? 'Valor sem data marcada' : 'Editar valor sem data', `
      <div class="tg"><button data-t="saida">Saída</button><button data-t="entrada">Entrada</button></div>
      ${F('Valor (R$)', inp('valor', ini.valor ? numStr(ini.valor) : '', 'inputmode="decimal" placeholder="0,00"'))}
      ${F('Descrição', inp('descricao', ini.descricao, 'placeholder="Ex.: Conserto do carro"'))}
      ${F('Categoria', '<select name="categoria"></select>')}
      <p class="hint">Fica guardado fora do calendário. Quando acontecer, toque no círculo para dar baixa: vira um lançamento com a data de hoje.</p>
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button><button class="btn sec" data-bx>Dar baixa</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    const selC = s.$('[name=categoria]');
    const pintar = () => { s.$$('.tg button').forEach(b => { const on = b.dataset.t === tipo; b.classList.toggle('on', on); b.classList.toggle('s', on && tipo === 'saida'); }); const l = [...DB.fin.categorias[tipo]]; if (ini.categoria && !l.includes(ini.categoria)) l.unshift(ini.categoria); selC.innerHTML = l.map(c => `<option${c === ini.categoria ? ' selected' : ''}>${esc(c)}</option>`).join(''); };
    pintar(); s.$$('.tg button').forEach(b => b.onclick = () => { tipo = b.dataset.t; ini.categoria = ''; pintar(); });
    if (!novo) {
      s.$('[data-del]').onclick = async () => { if (!(await confirmar('Excluir este valor?'))) return; DB.fin.semData = semDataL().filter(y => y !== x); s.fechar(); commit(); toast('Excluído', () => { DB.fin.semData.push(x); commit(); }); };
      s.$('[data-bx]').onclick = () => { s.fechar(); baixarSemData(x.id); };
    }
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), valor = num(v.valor); if (!(valor > 0)) return toast('Informe um valor maior que zero.');
      const d = { tipo, categoria: v.categoria, descricao: v.descricao.trim(), valor: r2(valor) };
      if (novo) semDataL().push({ id: uid('sd'), contaId: DB.fin.contas[0].id, sub: '', ...d }); else { if (d.categoria !== x.categoria) x.sub = ''; Object.assign(x, d); }
      s.fechar(); commit();
    };
  }

  /* ---------- saldo em qualquer dia (passado = real; futuro = previsto com o que está pendente) ---------- */
  function saldoEm(d) {
    const hj = hoje(); if (d <= hj) return saldoAte(d);
    let v = saldoTotal();
    DB.fin.tx.forEach(t => {
      const x = t.tipo === 'entrada' ? t.valor : -t.valor;
      if (t.status === 'pendente') { if ((t.data > hj ? t.data : hj) <= d) v += x; }
      else if (efData(t) > hj && efData(t) <= d) v += x;
    });
    return r2(v);
  }
  function movDia(d) {                                           // o que entra/sai naquele dia (pago naquele dia, ou pendente com vencimento nele)
    const hj = hoje(); let ent = 0, sai = 0;
    DB.fin.tx.forEach(t => { const dia = t.status === 'pendente' ? (t.data > hj ? t.data : hj) : efData(t); if (dia === d) { if (t.tipo === 'entrada') ent += t.valor; else sai += t.valor; } });
    return { ent: r2(ent), sai: r2(sai) };
  }

  /* ---------- categorias e subcategorias ---------- */
  const catsTx = (tipo, c) => DB.fin.tx.filter(t => t.tipo === tipo && t.categoria === c).length + serieL().filter(x => x.tipo === tipo && x.categoria === c).length + semDataL().filter(x => x.tipo === tipo && x.categoria === c).length;
  function formCategorias(tipo = 'saida') {
    const s = sheet('Categorias', `<div class="tg"><button data-t="saida">Saída</button><button data-t="entrada">Entrada</button></div><div id="cl"></div>
      <div class="acts"><button class="btn" data-nova>Nova categoria</button></div>`);
    const pintar = () => {
      s.$$('.tg button').forEach(b => { const on = b.dataset.t === tipo; b.classList.toggle('on', on); b.classList.toggle('s', on && tipo === 'saida'); });
      s.$('#cl').innerHTML = `<div class="card" style="padding:2px 14px">${DB.fin.categorias[tipo].map(c => { const sb = subsDe(tipo, c), n = catsTx(tipo, c); return `<div class="row" data-c="${esc(c)}"><div class="t"><b>${esc(c)}</b><small>${n} lançamento${n === 1 ? '' : 's'}${sb.length ? ' · ' + sb.map(esc).join(', ') : ''}</small></div><span class="mu">›</span></div>`; }).join('')}</div>`;
      s.$$('[data-c]').forEach(r => r.onclick = () => { s.fechar(); formCategoria(tipo, r.dataset.c); });
    };
    s.$$('.tg button').forEach(b => b.onclick = () => { tipo = b.dataset.t; pintar(); });
    s.$('[data-nova]').onclick = () => {
      const n = (prompt('Nome da categoria') || '').trim(); if (!n) return;
      if (DB.fin.categorias[tipo].includes(n)) return toast('Essa categoria já existe.');
      DB.fin.categorias[tipo].push(n); Store.salvar(); pintar();
    };
    pintar();
  }
  function formCategoria(tipo, nome) {
    const m = DB.fin.subcats[tipo], subs = () => (m[nome] = m[nome] || []);
    const s = sheet('Categoria · ' + nome, `${F('Nome', inp('nome', nome))}
      <div class="dia">Subcategorias</div><div id="sl"></div>
      <div class="r2" style="display:flex;gap:8px"><input name="nsub" placeholder="Nova subcategoria" style="flex:1"><button class="btn sec" data-add>Adicionar</button></div>
      <div class="acts"><button class="btn bad" data-del>Excluir categoria</button><button class="btn" data-ok>Salvar</button></div>`);
    const pintar = () => { s.$('#sl').innerHTML = subs().length ? `<div class="card" style="padding:2px 14px">${subs().map((x, i) => `<div class="row"><div class="t"><b>${esc(x)}</b></div><button class="btn sec" data-rm="${i}" style="padding:6px 12px">Remover</button></div>`).join('')}</div>` : '<small class="mu">Nenhuma subcategoria.</small>'; s.$$('[data-rm]').forEach(b => b.onclick = () => { const x = subs()[+b.dataset.rm]; subs().splice(+b.dataset.rm, 1); DB.fin.tx.forEach(t => { if (t.tipo === tipo && t.categoria === nome && t.sub === x) delete t.sub; }); Store.salvar(); pintar(); }); };
    s.$('[data-add]').onclick = () => { const n = s.$('[name=nsub]').value.trim(); if (!n) return; if (!subs().includes(n)) subs().push(n); s.$('[name=nsub]').value = ''; Store.salvar(); pintar(); };
    s.$('[data-ok]').onclick = () => {
      const n = s.$('[name=nome]').value.trim(); if (!n) return toast('Informe o nome.');
      if (n !== nome) { if (DB.fin.categorias[tipo].includes(n)) return toast('Já existe uma categoria com esse nome.'); renomearCategoria(tipo, nome, n); }
      s.fechar(); commit(); formCategorias(tipo);
    };
    s.$('[data-del]').onclick = () => { s.fechar(); excluirCategoria(tipo, nome); };
    pintar();
  }
  function renomearCategoria(tipo, de, para) {
    const L = DB.fin.categorias[tipo]; L[L.indexOf(de)] = para;
    DB.fin.tx.forEach(t => { if (t.tipo === tipo && t.categoria === de) t.categoria = para; });
    serieL().concat(semDataL()).forEach(x => { if (x.tipo === tipo && x.categoria === de) x.categoria = para; });
    if (DB.fin.subcats[tipo][de]) { DB.fin.subcats[tipo][para] = DB.fin.subcats[tipo][de]; delete DB.fin.subcats[tipo][de]; }
    if (tipo === 'saida' && DB.fin.orcamentos[de] !== undefined) { DB.fin.orcamentos[para] = DB.fin.orcamentos[de]; delete DB.fin.orcamentos[de]; }
  }
  function excluirCategoria(tipo, nome) {
    const outras = DB.fin.categorias[tipo].filter(c => c !== nome);
    if (!outras.length) return toast('Mantenha pelo menos uma categoria.');
    const n = catsTx(tipo, nome);
    const aplicar = destino => {
      const bak = { cat: [...DB.fin.categorias[tipo]], subs: JSON.stringify(DB.fin.subcats[tipo][nome] || null), orc: DB.fin.orcamentos[nome], mov: [] };
      const mover = x => { bak.mov.push([x, x.categoria, x.sub]); x.categoria = destino; delete x.sub; };
      DB.fin.tx.filter(t => t.tipo === tipo && t.categoria === nome).forEach(mover);
      serieL().concat(semDataL()).filter(x => x.tipo === tipo && x.categoria === nome).forEach(mover);
      DB.fin.categorias[tipo] = outras; delete DB.fin.subcats[tipo][nome]; if (tipo === 'saida') delete DB.fin.orcamentos[nome];
      commit();
      toast(`Categoria “${nome}” excluída`, () => { DB.fin.categorias[tipo] = bak.cat; if (bak.subs !== 'null') DB.fin.subcats[tipo][nome] = JSON.parse(bak.subs); if (bak.orc !== undefined) DB.fin.orcamentos[nome] = bak.orc; bak.mov.forEach(([x, c, sb]) => { x.categoria = c; if (sb) x.sub = sb; }); commit(); });
      formCategorias(tipo);
    };
    if (!n) { confirmar(`Excluir a categoria “${nome}”?`).then(ok => ok && aplicar(null)); return; }
    const s = sheet('Excluir categoria', `<p>A categoria “${esc(nome)}” tem ${n} lançamento${n === 1 ? '' : 's'}. Para onde eles devem ir?</p>${F('Mover para', sel('dest', outras, outras[outras.length - 1]))}
      <div class="acts"><button class="btn bad" data-ok>Excluir e mover</button></div>`);
    s.$('[data-ok]').onclick = () => { const d = s.$('[name=dest]').value; s.fechar(); aplicar(d); };
  }

  function formConta(c) {
    const novo = !c, ini = c || { nome: '', tipo: 'banco', saldoInicial: 0, ativa: true };
    const s = sheet(novo ? 'Nova conta' : 'Editar conta', `
      ${F('Nome', inp('nome', ini.nome, 'placeholder="Ex.: Nubank"'))}
      <div class="g2">${F('Tipo', sel('tipo', ['banco', 'caixa', 'carteira', 'investimento', 'outro'], ini.tipo))}${F('Saldo inicial (R$)', inp('saldoInicial', numStr(ini.saldoInicial), 'inputmode="decimal"'))}</div>
      <label class="f"><span><input type="checkbox" name="ativa" ${ini.ativa !== false ? 'checked' : ''}> Conta ativa</span></label>
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    if (!novo) s.$('[data-del]').onclick = async () => {
      if (DB.fin.contas.length < 2) return toast('Mantenha ao menos uma conta.');
      if (DB.fin.tx.some(t => t.contaId === c.id) || DB.fin.transferencias.some(t => t.origemId === c.id || t.destinoId === c.id)) return toast('Esta conta tem lançamentos. Desative em vez de excluir.');
      if (!(await confirmar('Excluir esta conta?'))) return;
      DB.fin.contas = DB.fin.contas.filter(x => x.id !== c.id); s.fechar(); commit();
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), saldo = v.saldoInicial.trim() ? num(v.saldoInicial) : 0;
      if (!v.nome.trim()) return toast('Informe o nome da conta.');
      if (isNaN(saldo)) return toast('Saldo inicial inválido.');
      const dados = { nome: v.nome.trim(), tipo: v.tipo, saldoInicial: r2(saldo), ativa: v.ativa };
      if (novo) DB.fin.contas.push({ id: uid('c'), ...dados }); else Object.assign(c, dados);
      s.fechar(); commit();
    };
  }

  function formTransf() {
    const cs = DB.fin.contas.map(c => [c.id, c.nome]);
    const s = sheet('Transferir entre contas', `
      <div class="g2">${F('De', sel('origemId', cs, cs[0][0]))}${F('Para', sel('destinoId', cs, cs[1][0]))}</div>
      <div class="g2">${F('Valor (R$)', inp('valor', '', 'inputmode="decimal" placeholder="0,00"'))}${F('Data', inp('data', hoje(), 'type="date"'))}</div>
      ${F('Descrição (opcional)', inp('descricao', ''))}
      <div class="acts"><button class="btn" data-ok>Transferir</button></div>`);
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), valor = num(v.valor);
      if (v.origemId === v.destinoId) return toast('Escolha contas diferentes.');
      if (!(valor > 0)) return toast('Informe um valor maior que zero.');
      if (!dataOk(v.data)) return toast('Informe uma data válida.');
      DB.fin.transferencias.push({ id: uid('tr'), data: v.data, origemId: v.origemId, destinoId: v.destinoId, valor: r2(valor), descricao: v.descricao.trim() });
      s.fechar(); commit();
    };
  }

  function formLimite(cat) {
    const atual = DB.fin.orcamentos[cat];
    const s = sheet('Limite mensal · ' + cat, `${F('Valor máximo por mês (R$)', inp('lim', atual ? numStr(atual) : '', 'inputmode="decimal" placeholder="0,00"'))}
      <div class="acts">${atual ? '<button class="btn sec" data-rm>Remover limite</button>' : ''}<button class="btn" data-ok>Salvar</button></div>`);
    if (atual) s.$('[data-rm]').onclick = () => { delete DB.fin.orcamentos[cat]; s.fechar(); commit(); };
    s.$('[data-ok]').onclick = () => {
      const v = num(vals(s.el).lim); if (!(v > 0)) return toast('Informe um valor maior que zero.');
      DB.fin.orcamentos[cat] = r2(v); s.fechar(); commit();
    };
  }

  const fab = () => {
    const e = EXT[S.seg]; if (e) return e.fab ? e.fab() : null;
    return (S.seg === 'lanc' || S.seg === 'pend') ? () => formTx(null) : S.seg === 'contas' ? () => formConta(null) : null;
  };
  const fabLabel = () => { const e = EXT[S.seg]; return e && e.fabLabel ? e.fabLabel() : S.seg === 'contas' ? 'Nova conta' : 'Novo lançamento'; };
  registrar({ id: 'fin', nome: 'Finanças', render, fab, fabLabel });
  return { S, saldoTotal, saldos, pendentes, baixar, formTx, efData, saldoEm, movDia, semDataTotal, sincSeries, formSerie, formCategorias, ext: EXT };
})();
