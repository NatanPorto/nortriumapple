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
  const fmtV = t => `${t.tipo === 'entrada' ? '+' : '−'} ${dinheiro(t.valor)}`;

  /* ---------- cálculos ---------- */
  function saldos() {
    const hj = hoje(), ids = new Set(DB.fin.contas.map(c => c.id)), main = DB.fin.contas[0].id, real = {}, proj = {};
    DB.fin.contas.forEach(c => { real[c.id] = proj[c.id] = c.saldoInicial || 0; });
    DB.fin.tx.forEach(t => {
      const cid = ids.has(t.contaId) ? t.contaId : main, v = t.tipo === 'entrada' ? t.valor : -t.valor;
      proj[cid] += v; if (t.status !== 'pendente' && t.data <= hj) real[cid] += v;
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
  const doMes = (m = S.mes) => DB.fin.tx.filter(t => t.data.startsWith(m));
  const total = (l, tipo) => soma(l.filter(t => t.tipo === tipo).map(t => t.valor));

  /* ---------- tela ---------- */
  const EXT = {};   // telas extras (js/fin-extras.js): cartões, previsão, metas, dívidas
  const SEGS = [['lanc', 'Lançamentos'], ['pend', 'A pagar/receber'], ['contas', 'Contas'], ['cart', 'Cartões'], ['prev', 'Previsão'], ['orc', 'Orçamentos'], ['metas', 'Metas'], ['div', 'Dívidas'], ['resumo', 'Resumo']];
  function render(el) {
    if (!SEGS.some(s => s[0] === S.seg)) S.seg = 'lanc';
    el.innerHTML = segHtml(SEGS, S.seg) + '<div id="fin-c"></div>';
    const bar = $('.seg', el), on = $('.seg .on', el);
    $$('.seg button', el).forEach(b => b.onclick = () => { S.seg = b.dataset.s; refresh(); });
    if (bar && on) bar.scrollLeft += on.getBoundingClientRect().left - bar.getBoundingClientRect().left - (bar.clientWidth - on.offsetWidth) / 2;
    const fn = ({ lanc: rLanc, pend: rPend, contas: rContas, orc: rOrc, resumo: rResumo })[S.seg] || (EXT[S.seg] && EXT[S.seg].render) || rLanc;
    fn($('#fin-c', el));
  }
  const mesNavHtml = () => `<div class="mnav"><button data-m="-1" aria-label="Mês anterior">‹</button><b>${mesNome(S.mes)}</b><button data-m="1" aria-label="Próximo mês">›</button></div>`;
  const bindMes = el => $$('.mnav button', el).forEach(b => b.onclick = () => { S.mes = addMes(S.mes, +b.dataset.m); refresh(); });

  function linhaTx(t) {
    const venc = t.status === 'pendente' && t.data < hoje();
    const sub = [t.categoria, DB.fin.contas.length > 1 ? contaDe(t.contaId).nome : '', t.cartaoId && EXT.cartaoNome ? '💳 ' + EXT.cartaoNome(t.cartaoId) : '', t.parcelas ? `${t.parcela}/${t.parcelas}` : '',
      t.status === 'pendente' ? `<span class="${venc ? 'neg' : ''}">${venc ? 'vencido' : 'pendente'}</span>` : ''].filter(Boolean).join(' · ');
    return `<div class="row" data-id="${t.id}">${t.status === 'pendente' ? `<button class="ck" data-q="${t.id}" aria-label="Marcar como ${t.tipo === 'entrada' ? 'recebido' : 'pago'}"></button>` : ''}
      <div class="t"><b>${esc(t.descricao || t.categoria)}</b><small>${sub}</small></div>
      <span class="n ${t.tipo === 'entrada' ? 'pos' : 'neg'}">${fmtV(t)}</span></div>`;
  }
  function ligarLinhas(el) {
    $$('.row[data-id]', el).forEach(r => r.onclick = e => { if (e.target.closest('[data-q]')) return; formTx(DB.fin.tx.find(t => t.id === r.dataset.id)); });
    $$('[data-q]', el).forEach(b => b.onclick = () => baixar(b.dataset.q));
  }
  function baixar(id) {
    const t = DB.fin.tx.find(x => x.id === id); if (!t) return;
    t.status = t.tipo === 'entrada' ? 'recebido' : 'pago'; commit();
    toast(t.tipo === 'entrada' ? 'Marcado como recebido' : 'Marcado como pago', () => { t.status = 'pendente'; commit(); });
  }


  /* ---------- gráficos ---------- */
  const variacao = (a, b) => b ? Math.round((a - b) / Math.abs(b) * 100) : null;
  function saldoAte(d) {
    const base = soma(DB.fin.contas.map(c => c.saldoInicial || 0));
    return r2(base + DB.fin.tx.reduce((a, t) => (t.status !== 'pendente' && t.data <= d) ? a + (t.tipo === 'entrada' ? t.valor : -t.valor) : a, 0));
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
    return `<div class="hero"><small>Saldo atual</small><div class="big">${dinheiro(atual)}</div>
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
    lista = [...lista].sort((a, b) => b.data.localeCompare(a.data));
    const dias = {}; lista.forEach(t => (dias[t.data] = dias[t.data] || []).push(t));
    const ant = doMes(addMes(S.mes, -1)), vEnt = variacao(ent, total(ant, 'entrada')), vSai = variacao(sai, total(ant, 'saida'));
    const chip = (v, bomSobe) => v === null ? '' : `<small class="${(v >= 0) === bomSobe ? 'pos' : 'neg'}">${v >= 0 ? '↑ +' : '↓ −'}${Math.abs(v)}%</small>`;
    el.innerHTML = heroSaldo() + mesNavHtml() + `
      <div class="sum"><div><small>↑ Receitas</small><b class="n pos">${dinheiro(ent)}</b>${chip(vEnt, true)}</div><div><small>↓ Despesas</small><b class="n neg">${dinheiro(sai)}</b>${chip(vSai, false)}</div><div><small>Resultado</small><b class="n ${ent - sai < 0 ? 'neg' : 'pos'}">${dinheiro(r2(ent - sai))}</b></div></div>
      ${cardCategorias(mes)}
      <label class="f"><input id="busca" type="search" placeholder="Buscar descrição ou categoria" value="${esc(S.busca)}"></label>
      <div class="seg sm">${[['todos', 'Todos'], ['entrada', 'Entradas'], ['saida', 'Saídas'], ['pend', 'Pendentes']].map(([k, l]) => `<button data-f="${k}" class="${S.filtro === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${lista.length ? Object.keys(dias).map(d => `<div class="dia">${fmtDiaCurto(d)}</div><div class="card" style="padding:2px 14px">${dias[d].map(linhaTx).join('')}</div>`).join('')
        : `<div class="empty">${mes.length ? 'Nada encontrado com esse filtro.' : 'Nenhum lançamento neste mês.<br>Toque em + para adicionar.'}</div>`}`;
    bindMes(el); ligarLinhas(el);
    $$('[data-per]', el).forEach(b => b.onclick = () => { S.per = b.dataset.per; refresh(); });
    $$('[data-f]', el).forEach(b => b.onclick = () => { S.filtro = b.dataset.f; refresh(); });
    const bu = $('#busca', el); bu.oninput = () => { S.busca = bu.value; clearTimeout(bu._t); bu._t = setTimeout(() => { refresh(); const n = $('#busca'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 350); };
  }

  function rPend(el) {
    const p = pendentes(), hj = hoje();
    const bloco = (titulo, l, cls) => {
      const venc = soma(l.filter(t => t.data < hj).map(t => t.valor));
      return `<div class="card"><h3>${titulo}<span class="n ${cls}">${dinheiro(soma(l.map(t => t.valor)))}</span></h3>${venc ? `<small class="neg">${dinheiro(venc)} vencido</small>` : ''}
        ${l.length ? l.slice(0, 80).map(t => `<div class="row" data-id="${t.id}"><button class="ck" data-q="${t.id}" aria-label="Dar baixa"></button><div class="t"><b>${esc(t.descricao || t.categoria)}</b><small><span class="${t.data < hj ? 'neg' : ''}">${fmtData(t.data)} · ${quando(t.data)}</span> · ${esc(t.categoria)}</small></div><span class="n">${dinheiro(t.valor)}</span></div>`).join('') : '<div class="empty">Tudo em dia.</div>'}</div>`;
    };
    el.innerHTML = bloco('A pagar', p.filter(t => t.tipo === 'saida'), 'neg') + bloco('A receber', p.filter(t => t.tipo === 'entrada'), 'pos');
    ligarLinhas(el);
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
    bindMes(el);
    $$('[data-o]', el).forEach(r => r.onclick = () => formLimite(r.dataset.o));
  }

  function rResumo(el) {
    const mes = doMes(), ant = doMes(addMes(S.mes, -1)), sai = total(mes, 'saida'), saiAnt = total(ant, 'saida');
    const bloco = (titulo, tipo, cls) => {
      const l = porCategoria(mes.filter(t => t.tipo === tipo)), tot = soma(l.map(x => x[1]));
      return `<div class="card"><h3>${titulo}<span class="n ${cls}">${dinheiro(tot)}</span></h3>${l.length ? l.map(([c, v]) => `<div style="padding:6px 0"><div style="display:flex;justify-content:space-between"><span>${esc(c)}</span><span class="n">${dinheiro(v)} <small class="mu">${Math.round(v / tot * 100)}%</small></span></div><div class="bar"><i style="width:${Math.round(v / tot * 100)}%"></i></div></div>`).join('') : '<div class="empty">Sem lançamentos.</div>'}</div>`;
    };
    el.innerHTML = mesNavHtml() + (saiAnt ? `<p class="mu sm" style="margin:-4px 2px 12px">Saídas ${sai >= saiAnt ? 'subiram' : 'caíram'} ${Math.abs(Math.round((sai - saiAnt) / saiAnt * 100))}% em relação a ${mesNome(addMes(S.mes, -1))}.</p>` : '') +
      cardCategorias(mes) + bloco('Saídas por categoria', 'saida', 'neg') + bloco('Entradas por categoria', 'entrada', 'pos') +
      `<div class="acts" style="justify-content:flex-start"><button class="btn sec" id="e1">Exportar mês (CSV)</button><button class="btn sec" id="e2">Exportar tudo (CSV)</button></div>`;
    bindMes(el);
    $('#e1', el).onclick = () => exportar(mes, `lancamentos-${S.mes}.csv`);
    $('#e2', el).onclick = () => exportar(DB.fin.tx, 'lancamentos-todos.csv');
  }
  async function exportar(lista, nome) {
    const ord = [...lista].sort((a, b) => a.data.localeCompare(b.data));
    const linhas = [['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Situação', 'Conta'], ...ord.map(t => [t.data.split('-').reverse().join('/'), t.tipo === 'entrada' ? 'Entrada' : 'Saída', t.categoria, t.descricao || '', String(t.valor).replace('.', ','), t.status, contaDe(t.contaId).nome])];
    const r = await salvarArquivo('Relatórios', nome, csv(linhas), 'text/csv');
    toast(r.ok ? `Salvo em ${r.caminho}` : 'Não foi possível exportar.');
  }

  /* ---------- formulários ---------- */
  function formTx(t) {
    const novo = !t;
    const ini = t || { tipo: 'saida', data: S.mes === hoje().slice(0, 7) ? hoje() : S.mes + '-01', status: 'pago', contaId: DB.fin.contas[0].id, categoria: '' };
    let tipo = ini.tipo;
    const s = sheet(novo ? 'Novo lançamento' : 'Editar lançamento', `
      <div class="tg"><button data-t="saida">Saída</button><button data-t="entrada">Entrada</button></div>
      ${F('Valor (R$)', inp('valor', ini.valor ? numStr(ini.valor) : '', 'inputmode="decimal" placeholder="0,00"'))}
      ${F('Descrição', inp('descricao', ini.descricao || '', 'placeholder="Ex.: Mercado"'))}
      <div class="g2">${F('Categoria', '<select name="categoria"></select>')}${F('Data', inp('data', ini.data, 'type="date"'))}</div>
      <div class="g2">${F('Situação', '<select name="status"></select>')}${DB.fin.contas.length > 1 ? F('Conta', sel('contaId', DB.fin.contas.filter(c => c.ativa !== false || c.id === ini.contaId).map(c => [c.id, c.nome]), ini.contaId)) : ''}</div>
      ${novo ? `<div class="g2">${F('Repetir', sel('rep', [['nao', 'Não repetir'], ['parc', 'Parcelado (mensal)'], ['mes', 'Todo mês'], ['ano', 'Todo ano']], 'nao'))}<div id="vz" hidden>${F('Quantas vezes', inp('vezes', '2', 'type="number" min="2" max="120" inputmode="numeric"'))}</div></div>` : ''}
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    const selCat = s.$('[name=categoria]'), selSt = s.$('[name=status]');
    const catAtual = () => selCat.value;
    function preencher(cat) {
      s.$$('.tg button').forEach(b => { const on = b.dataset.t === tipo; b.classList.toggle('on', on); b.classList.toggle('s', on && tipo === 'saida'); });
      const cats = [...DB.fin.categorias[tipo]]; if (cat && !cats.includes(cat)) cats.unshift(cat);
      selCat.innerHTML = cats.map(c => `<option${c === cat ? ' selected' : ''}>${esc(c)}</option>`).join('') + '<option value="__nova">+ Nova categoria…</option>';
      const feito = tipo === 'entrada' ? 'recebido' : 'pago', st = ini.status === 'pendente' ? 'pendente' : feito;
      selSt.innerHTML = `<option value="${feito}"${st === feito ? ' selected' : ''}>${tipo === 'entrada' ? 'Recebido' : 'Pago'}</option><option value="pendente"${st === 'pendente' ? ' selected' : ''}>${tipo === 'entrada' ? 'A receber' : 'A pagar'}</option>`;
    }
    preencher(ini.categoria);
    s.$$('.tg button').forEach(b => b.onclick = () => { ini.status = selSt.value; tipo = b.dataset.t; preencher(''); });
    selCat.onchange = () => {
      if (selCat.value !== '__nova') return;
      const n = (prompt('Nome da categoria') || '').trim();
      if (n && !DB.fin.categorias[tipo].includes(n)) { DB.fin.categorias[tipo].push(n); Store.salvar(); }
      preencher(n || DB.fin.categorias[tipo][0]);
    };
    const rep = s.$('[name=rep]'); if (rep) rep.onchange = () => { s.$('#vz').hidden = rep.value === 'nao'; };
    if (!novo) s.$('[data-del]').onclick = async () => {
      const seguintes = ini.seriesId ? DB.fin.tx.filter(x => x.seriesId === ini.seriesId && x.data > ini.data) : [];
      let modo = 1;
      if (seguintes.length) { const i = await dialog('Este lançamento faz parte de uma série.', ['Cancelar', 'Só este', 'Este e os próximos'], true); if (i < 1) return; modo = i; }
      else if (!(await confirmar('Excluir este lançamento?'))) return;
      const ids = new Set([ini.id, ...(modo === 2 ? seguintes.map(x => x.id) : [])]);
      const removidos = DB.fin.tx.filter(x => ids.has(x.id));
      DB.fin.tx = DB.fin.tx.filter(x => !ids.has(x.id)); s.fechar(); commit();
      toast(removidos.length > 1 ? `${removidos.length} lançamentos excluídos` : 'Lançamento excluído', () => { DB.fin.tx.push(...removidos); commit(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), valor = num(v.valor);
      if (!(valor > 0)) return toast('Informe um valor maior que zero.');
      if (!dataOk(v.data)) return toast('Informe uma data válida.');
      if (!v.categoria || v.categoria === '__nova') return toast('Escolha uma categoria.');
      const base = { tipo, categoria: catAtual(), descricao: v.descricao.trim(), valor: r2(valor), contaId: v.contaId || ini.contaId || DB.fin.contas[0].id };
      if (!novo) { Object.assign(t, base, { data: v.data, status: v.status }); }
      else {
        const r = v.rep || 'nao', n = r === 'nao' ? 1 : Math.max(2, Math.min(120, parseInt(v.vezes) || 2)), sid = n > 1 ? uid('sr') : null;
        for (let i = 0; i < n; i++) DB.fin.tx.push({
          id: uid('tx'), ...base, data: addMeses(v.data, i * (r === 'ano' ? 12 : 1)), status: i === 0 ? v.status : 'pendente',
          recorrente: r === 'mes' || r === 'ano', seriesId: sid, frequencia: r === 'mes' ? 'mensal' : r === 'ano' ? 'anual' : null,
          ...(r === 'parc' ? { parcela: i + 1, parcelas: n } : {})
        });
      }
      s.fechar(); commit();
    };
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
  return { S, saldoTotal, saldos, pendentes, baixar, formTx, ext: EXT };
})();
