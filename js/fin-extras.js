'use strict';
/* =========================================================
   FINANÇAS (extras) — portado do Fluxo de Caixa:
   previsão de fluxo, metas, cartões de crédito (faturas) e dívidas.
   Dados em DB.fin.extras { cartoes, debts, metas } — mesmo formato do Fluxo,
   então o que foi importado do Fluxo de Caixa já aparece aqui.
   ========================================================= */
(() => {
  const E = Fin.ext;
  const X = () => {
    const e = DB.fin.extras || (DB.fin.extras = {});
    ['cartoes', 'debts', 'metas'].forEach(k => { if (!Array.isArray(e[k])) e[k] = []; });
    return e;
  };
  const N = v => Number(v) || 0;
  const barra = (p, over) => `<div class="bar${over ? ' over' : ''}"><i style="width:${Math.min(100, Math.max(0, p))}%"></i></div>`;
  const principal = () => DB.fin.contas[0].id;

  /* =========================================================
     CARTÕES DE CRÉDITO
     ========================================================= */
  const cartaoPor = id => X().cartoes.find(c => c.id === id);
  const txCartao = c => DB.fin.tx.filter(t => t.cartaoId === c.id);
  const comprometido = c => soma(txCartao(c).filter(t => t.status === 'pendente').map(t => t.valor));
  const diasDoMes = (y, m) => new Date(y, m, 0).getDate();
  function ymdParts(y, m, d) {                      // aceita mês fora de 1..12 e limita o dia ao fim do mês
    y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
    return y + '-' + p2(m) + '-' + p2(Math.min(d, diasDoMes(y, m)));
  }
  // Compra até o dia de fechamento entra na fatura que fecha no mês; se o vencimento é
  // menor ou igual ao fechamento, a fatura vence no mês seguinte. i = índice da parcela.
  function vencFatura(c, compra, i) {
    const y = +compra.slice(0, 4), m = +compra.slice(5, 7), d = +compra.slice(8, 10);
    let dm = m + (d <= N(c.fechamento) ? 0 : 1);
    if (N(c.vencimento) <= N(c.fechamento)) dm += 1;
    return ymdParts(y, dm + i, N(c.vencimento) || 1);
  }
  function faturas(c) {
    const por = {};
    txCartao(c).forEach(t => (por[t.data] = por[t.data] || []).push(t));
    return Object.keys(por).sort().map(data => ({ data, itens: por[data], total: soma(por[data].map(t => t.valor)), paga: por[data].every(t => t.status !== 'pendente') }));
  }
  function faturaAtual(c) {                         // fatura vencida em aberto tem prioridade
    const hj = hoje(), ab = faturas(c).filter(i => !i.paga);
    return ab.find(i => i.data < hj) || ab.find(i => i.data >= hj) || ab[0] || null;
  }
  E.cartaoNome = id => (cartaoPor(id) || {}).nome || '';

  function pagarFatura(c, data) {
    const itens = txCartao(c).filter(t => t.data === data && t.status === 'pendente'); if (!itens.length) return;
    itens.forEach(t => { t.status = 'pago'; }); commit();
    toast('Fatura marcada como paga', () => { itens.forEach(t => { t.status = 'pendente'; }); commit(); });
  }

  function rCart(el) {
    const cs = X().cartoes, hj = hoje();
    const rows = [];
    cs.filter(c => c.ativo !== false).forEach(c => faturas(c).filter(i => !i.paga || i.data >= addDias(hj, -60)).forEach(i => rows.push({ c, ...i })));
    rows.sort((a, b) => a.data.localeCompare(b.data));
    el.innerHTML = (cs.length ? cs.map(c => {
      const usado = comprometido(c), disp = r2(N(c.limite) - usado), pct = c.limite > 0 ? usado / c.limite * 100 : 0, inv = faturaAtual(c);
      return `<div class="card" data-c="${esc(c.id)}"${c.ativo === false ? ' style="opacity:.6"' : ''}>
        <h3><span>${esc(c.nome)}${c.ativo === false ? ' <small class="mu">(inativo)</small>' : ''}</span><a data-ed role="button">Editar</a></h3>
        <small class="mu">Fecha dia ${esc(c.fechamento)} · vence dia ${esc(c.vencimento)}</small>${barra(pct, pct >= 100)}
        <div class="sum" style="margin:10px 0 6px"><div><small>Limite</small><b class="n">${dinheiro(N(c.limite))}</b></div><div><small>Disponível</small><b class="n ${disp < 0 ? 'neg' : ''}">${dinheiro(disp)}</b></div><div><small>Fatura atual</small><b class="n">${dinheiro(inv ? inv.total : 0)}</b></div></div>
        <small class="mu">${inv ? `Vence ${fmtData(inv.data)}${inv.data < hj ? ' — <span class="neg">vencida</span>' : ''}` : 'Sem fatura em aberto.'}</small></div>`;
    }).join('') : '<div class="empty">Nenhum cartão cadastrado.</div>') +
      `<div class="acts" style="justify-content:flex-start;margin-bottom:12px"><button class="btn sec" id="nk">Novo cartão</button>${cs.some(c => c.ativo !== false) ? '<button class="btn" id="nb">Nova compra</button>' : ''}</div>` +
      (rows.length ? `<div class="dia">Faturas</div><div class="card" style="padding:2px 14px">${rows.slice(0, 24).map(r => `<div class="row${r.paga ? ' done' : ''}" data-f="${esc(r.c.id)}|${r.data}">${r.paga ? '' : `<button class="ck" data-pay aria-label="Marcar fatura como paga"></button>`}
        <div class="t"><b>${esc(r.c.nome)}</b><small>${r.itens.length} compra(s) · vence ${fmtData(r.data)}${r.paga ? ' · paga' : r.data < hj ? ' · <span class="neg">vencida</span>' : ''}</small></div><span class="n ${r.paga ? 'mu' : 'neg'}">${dinheiro(r.total)}</span></div>`).join('')}</div>` : '');
    $$('[data-c]', el).forEach(b => { $('[data-ed]', b).onclick = () => formCartao(cartaoPor(b.dataset.c)); });
    $('#nk', el).onclick = () => formCartao(null);
    const nb = $('#nb', el); if (nb) nb.onclick = () => formCompra();
    $$('[data-f]', el).forEach(r => r.onclick = e => {
      const [cid, data] = r.dataset.f.split('|'), c = cartaoPor(cid);
      if (e.target.closest('[data-pay]')) return pagarFatura(c, data);
      detalheFatura(c, data);
    });
  }

  function detalheFatura(c, data) {
    const inv = faturas(c).find(i => i.data === data); if (!inv) return;
    const s = sheet(`${c.nome} · vence ${fmtData(data)}`, `<div class="card" style="padding:2px 14px">${inv.itens.map(t => `<div class="row"><div class="t"><b>${esc(t.descricao || t.categoria)}</b><small>${esc(t.categoria)}${t.dataCompra ? ' · compra ' + fmtData(t.dataCompra) : ''}${t.parcelas > 1 ? ` · ${t.parcela}/${t.parcelas}` : ''}</small></div><span class="n">${dinheiro(t.valor)}</span></div>`).join('')}</div>
      <p class="mu sm" style="margin:0 2px 8px">Total: <b class="n">${dinheiro(inv.total)}</b></p>
      ${inv.paga ? '' : '<div class="acts"><button class="btn" data-pg>Marcar como paga</button></div>'}`);
    const pg = s.$('[data-pg]'); if (pg) pg.onclick = () => { s.fechar(); pagarFatura(c, data); };
  }

  function formCartao(c) {
    const novo = !c, ini = c || { nome: '', limite: '', fechamento: '', vencimento: '', ativo: true };
    const s = sheet(novo ? 'Novo cartão' : 'Editar cartão', `
      ${F('Nome', inp('nome', ini.nome, 'placeholder="Ex.: Nubank"'))}
      ${F('Limite total (R$)', inp('limite', numStr(ini.limite), 'inputmode="decimal" placeholder="0,00"'))}
      <div class="g2">${F('Dia de fechamento', inp('fechamento', ini.fechamento, 'type="number" min="1" max="31" inputmode="numeric"'))}${F('Dia de vencimento', inp('vencimento', ini.vencimento, 'type="number" min="1" max="31" inputmode="numeric"'))}</div>
      <label class="f"><span><input type="checkbox" name="ativo" ${ini.ativo !== false ? 'checked' : ''}> Cartão ativo</span></label>
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    if (!novo) s.$('[data-del]').onclick = async () => {
      if (DB.fin.tx.some(t => t.cartaoId === c.id)) return toast('Este cartão tem compras lançadas. Desative em vez de excluir.');
      if (!(await confirmar(`Excluir o cartão "${c.nome}"?`))) return;
      const e = X(), pos = e.cartoes.indexOf(c);
      e.cartoes = e.cartoes.filter(x => x !== c); s.fechar(); commit();
      toast('Cartão excluído', () => { X().cartoes.splice(Math.min(pos, X().cartoes.length), 0, c); commit(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), lim = num(v.limite), fe = Math.round(num(v.fechamento)), ve = Math.round(num(v.vencimento));
      if (!v.nome.trim()) return toast('Informe o nome do cartão.');
      if (isNaN(lim) || lim < 0) return toast('Informe um limite válido.');
      if (!(fe >= 1 && fe <= 31) || !(ve >= 1 && ve <= 31)) return toast('Dias de fechamento e vencimento: de 1 a 31.');
      const dados = { nome: v.nome.trim(), limite: r2(lim), fechamento: fe, vencimento: ve, ativo: v.ativo };
      if (novo) X().cartoes.push({ id: uid('cc'), ...dados }); else Object.assign(c, dados);
      s.fechar(); commit();
    };
  }

  function formCompra() {
    const ativos = X().cartoes.filter(c => c.ativo !== false);
    if (!ativos.length) { toast('Cadastre um cartão primeiro.'); return formCartao(null); }
    const cats = DB.fin.categorias.saida;
    const s = sheet('Compra no cartão', `
      ${F('Cartão', sel('cartaoId', ativos.map(c => [c.id, c.nome]), ativos[0].id))}
      ${F('Valor total (R$)', inp('valor', '', 'inputmode="decimal" placeholder="0,00"'))}
      ${F('Descrição', inp('descricao', '', 'placeholder="Ex.: Tênis"'))}
      <div class="g2">${F('Categoria', sel('categoria', cats, cats[0]))}${F('Data da compra', inp('data', hoje(), 'type="date"'))}</div>
      ${F('Parcelas', inp('parcelas', '1', 'type="number" min="1" max="60" inputmode="numeric"'))}
      <p class="hint" id="pv"></p>
      <div class="acts"><button class="btn" data-ok>Lançar compra</button></div>`);
    const ler = () => {
      const v = vals(s.el), c = cartaoPor(v.cartaoId), valor = num(v.valor), n = Math.max(1, Math.min(60, Math.round(num(v.parcelas)) || 1));
      return { v, c, valor, n };
    };
    const prev = () => {
      const { v, c, valor, n } = ler(), p = s.$('#pv');
      if (!c || !(valor > 0) || !dataOk(v.data)) { p.textContent = ''; return; }
      p.textContent = n > 1 ? `${n}x de ${dinheiro(r2(valor / n))} — 1ª fatura em ${fmtData(vencFatura(c, v.data, 0))}, última em ${fmtData(vencFatura(c, v.data, n - 1))}.` : `Fatura de ${dinheiro(valor)} em ${fmtData(vencFatura(c, v.data, 0))}.`;
    };
    s.$$('input,select').forEach(e => { e.oninput = prev; e.onchange = prev; });
    s.$('[data-ok]').onclick = () => {
      const { v, c, valor, n } = ler();
      if (!c) return toast('Escolha um cartão.');
      if (!(valor > 0)) return toast('Informe um valor maior que zero.');
      if (!dataOk(v.data)) return toast('Informe uma data válida.');
      const sid = n > 1 ? uid('parc') : null, cada = r2(valor / n); let acum = 0;
      for (let i = 0; i < n; i++) {
        const val = i === n - 1 ? r2(valor - acum) : cada; acum = r2(acum + val);
        DB.fin.tx.push({ id: uid('tx'), data: vencFatura(c, v.data, i), tipo: 'saida', categoria: v.categoria, descricao: v.descricao.trim(), valor: val, status: 'pendente',
          contaId: principal(), cartaoId: c.id, dataCompra: v.data, parcela: i + 1, parcelas: n, seriesId: sid });
      }
      s.fechar(); commit(); toast(n > 1 ? `Compra lançada em ${n}x.` : 'Compra lançada.');
    };
  }

  /* =========================================================
     DÍVIDAS
     ========================================================= */
  const dividasAtivas = () => X().debts.filter(d => d.ativo !== false);
  // a cada mês: juros sobre o saldo, depois desconta a parcela (se não cobrir os juros, o saldo cresce)
  function simular(d, meses) {
    let saldo = Math.max(0, N(d.valorPrincipal)), juros = 0, pago = 0; const taxa = N(d.taxaJuros) / 100, parc = Math.max(0, N(d.parcela));
    for (let i = 0; i < meses && saldo > 0; i++) {
      const j = saldo * taxa; juros += j; saldo += j;
      const p = Math.min(parc, saldo); saldo -= p; pago += p;
    }
    return { saldoFinal: Math.max(0, saldo), juros, pago };
  }
  function mesesParaQuitar(d) {
    const parc = N(d.parcela), taxa = N(d.taxaJuros) / 100; let s = N(d.valorPrincipal);
    if (!(s > 0)) return 0; if (!(parc > 0)) return null;
    for (let i = 1; i <= 600; i++) { s += s * taxa; s -= Math.min(parc, s); if (s <= 0.005) return i; }
    return null;
  }
  function miniGrafico(d) {
    let s = Math.max(0, N(d.valorPrincipal)); const taxa = N(d.taxaJuros) / 100, parc = Math.max(0, N(d.parcela)), v = [s];
    for (let i = 0; i < 6; i++) { if (s > 0) s = Math.max(0, s + s * taxa - parc); v.push(s); }
    const mx = Math.max(1, ...v);
    return `<div style="display:flex;align-items:flex-end;gap:3px;height:34px;margin-top:10px">${v.map(x => `<i title="${dinheiro(r2(x))}" style="flex:1;background:var(--cor);opacity:.75;height:${Math.max(2, Math.round(x / mx * 32))}px"></i>`).join('')}</div>
      <small class="mu">Saldo devedor projetado — próximos 6 meses</small>`;
  }

  function rDiv(el) {
    const ds = X().debts, at = dividasAtivas();
    const saldo = soma(at.map(d => N(d.valorPrincipal))), juros = soma(at.map(d => N(d.valorPrincipal) * N(d.taxaJuros) / 100)), parc = soma(at.map(d => N(d.parcela)));
    el.innerHTML = `<div class="sum"><div><small>Saldo devedor</small><b class="n neg">${dinheiro(saldo)}</b></div><div><small>Juros/mês</small><b class="n">${dinheiro(juros)}</b></div><div><small>Parcelas/mês</small><b class="n">${dinheiro(parc)}</b></div></div>` +
      (ds.length ? ds.map(d => {
        const taxa = N(d.taxaJuros), parc = N(d.parcela), j = N(d.valorPrincipal) * taxa / 100, off = d.ativo === false, q = off ? 0 : mesesParaQuitar(d);
        const aviso = off ? '' : (parc > 0 && parc <= j) ? 'A parcela não cobre os juros do mês — o saldo devedor está crescendo.' : (parc <= 0 && taxa > 0) ? 'Sem parcela definida — os juros vão se acumular sobre o saldo mês a mês.' : '';
        const prazo = off ? '' : q === null ? '' : q > 0 ? `Quita em ~${q} ${q === 1 ? 'mês' : 'meses'} (${MESES[pd(addMeses(hoje(), q)).getMonth()].slice(0, 3).toLowerCase()}/${pd(addMeses(hoje(), q)).getFullYear()}) mantendo a parcela.` : '';
        return `<div class="card" data-d="${esc(d.id)}"${off ? ' style="opacity:.6"' : ''}>
          <h3><span>${esc(d.descricao || 'Dívida')}</span><a data-ed role="button">Editar</a></h3>
          <small class="mu">${off ? 'Inativa/quitada' : 'Ativa'}${d.dataInicio && dataOk(d.dataInicio) ? ' · desde ' + fmtData(d.dataInicio) : ''}</small>
          <div class="sum" style="margin:10px 0 6px"><div><small>Saldo</small><b class="n">${dinheiro(N(d.valorPrincipal))}</b></div><div><small>Juros ao mês</small><b class="n ${aviso ? 'neg' : ''}">${String(taxa).replace('.', ',')}%</b></div><div><small>Parcela</small><b class="n">${dinheiro(parc)}</b></div></div>
          ${off ? '' : miniGrafico(d)}
          ${prazo ? `<p class="mu sm" style="margin:8px 0 0">${prazo}</p>` : ''}
          ${aviso ? `<p class="neg sm" style="margin:8px 0 0">⚠ ${aviso}</p>` : ''}
          ${!off && q === null && !aviso ? '<p class="neg sm" style="margin:8px 0 0">⚠ Com a parcela atual a dívida não quita.</p>' : ''}</div>`;
      }).join('') : '<div class="empty">Nenhuma dívida cadastrada.<br>Toque em + para registrar empréstimos, financiamentos ou saldos em aberto.</div>');
    $$('[data-d]', el).forEach(b => { $('[data-ed]', b).onclick = () => formDivida(X().debts.find(d => d.id === b.dataset.d)); });
  }

  function formDivida(d) {
    const novo = !d, ini = d || { descricao: '', valorPrincipal: '', taxaJuros: '', parcela: '', dataInicio: hoje(), ativo: true };
    const s = sheet(novo ? 'Nova dívida' : 'Editar dívida', `
      ${F('Descrição', inp('descricao', ini.descricao, 'placeholder="Ex.: Financiamento do carro"'))}
      <div class="g2">${F('Saldo devedor (R$)', inp('valor', numStr(ini.valorPrincipal), 'inputmode="decimal" placeholder="0,00"'))}${F('Juros ao mês (%)', inp('juros', numStr(ini.taxaJuros), 'inputmode="decimal" placeholder="0"'))}</div>
      <div class="g2">${F('Parcela mensal (R$)', inp('parcela', numStr(ini.parcela), 'inputmode="decimal" placeholder="0,00"'))}${F('Data de início', inp('data', ini.dataInicio || hoje(), 'type="date"'))}</div>
      <label class="f"><span><input type="checkbox" name="ativo" ${ini.ativo !== false ? 'checked' : ''}> Dívida ativa (desmarque ao quitar)</span></label>
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    if (!novo) s.$('[data-del]').onclick = async () => {
      if (!(await confirmar(`Excluir a dívida "${d.descricao || 'Dívida'}"?`))) return;
      const pos = X().debts.indexOf(d);
      X().debts = X().debts.filter(x => x !== d); s.fechar(); commit();
      toast('Dívida excluída', () => { X().debts.splice(Math.min(pos, X().debts.length), 0, d); commit(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), valor = num(v.valor), juros = v.juros.trim() ? num(v.juros) : 0, parc = v.parcela.trim() ? num(v.parcela) : 0;
      if (!v.descricao.trim()) return toast('Informe a descrição.');
      if (!(valor > 0)) return toast('Informe um saldo devedor maior que zero.');
      if (isNaN(juros) || juros < 0) return toast('Juros inválidos.');
      if (isNaN(parc) || parc < 0) return toast('Parcela inválida.');
      if (!dataOk(v.data)) return toast('Informe uma data válida.');
      const dados = { descricao: v.descricao.trim(), valorPrincipal: r2(valor), taxaJuros: juros, parcela: r2(parc), dataInicio: v.data, ativo: v.ativo };
      if (novo) X().debts.push({ id: uid('dv'), ...dados }); else Object.assign(d, dados);
      s.fechar(); commit();
    };
  }

  /* =========================================================
     METAS DE ECONOMIA
     ========================================================= */
  const metaAtual = m => r2(N(m.valorInicial) + (m.aportes || []).reduce((a, x) => a + N(x.valor), 0));

  function rMetas(el) {
    const ms = X().metas, hj = hoje();
    el.innerHTML = ms.length ? ms.map(m => {
      const at = metaAtual(m), alvo = N(m.valorAlvo), falta = Math.max(0, r2(alvo - at)), pct = alvo > 0 ? Math.min(100, at / alvo * 100) : 0;
      let prazo = 'Sem prazo definido';
      if (falta === 0) prazo = 'Meta atingida';
      else if (m.prazo && dataOk(m.prazo)) {
        const dias = diasEntre(hj, m.prazo);
        prazo = dias < 0 ? `Prazo vencido em ${fmtData(m.prazo)}` : `${fmtData(m.prazo)} · guardar ${dinheiro(r2(falta / Math.max(1, Math.ceil(dias / 30))))} por mês`;
      }
      const hist = [...(m.aportes || [])].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 6);
      return `<div class="card" data-m="${esc(m.id)}">
        <h3><span>${esc(m.nome)}</span><span class="n">${Math.round(pct)}%</span></h3>
        <small class="${falta === 0 ? 'pos' : 'mu'}">${prazo}</small>${barra(pct)}
        <div class="sum" style="margin:10px 0 6px"><div><small>Guardado</small><b class="n pos">${dinheiro(at)}</b></div><div><small>Alvo</small><b class="n">${dinheiro(alvo)}</b></div><div><small>Falta</small><b class="n">${dinheiro(falta)}</b></div></div>
        ${hist.length ? `<details style="margin:6px 0"><summary class="mu sm">Histórico de aportes</summary>${hist.map(a => `<div class="mu sm" style="padding:3px 0">${fmtData(a.data)}: <span class="n ${N(a.valor) < 0 ? 'neg' : ''}">${dinheiro(N(a.valor))}</span>${a.obs ? ' — ' + esc(a.obs) : ''}</div>`).join('')}</details>` : ''}
        <div class="acts" style="justify-content:flex-start"><button class="btn" data-a="ap">Adicionar aporte</button><button class="btn sec" data-a="ed">Editar</button></div></div>`;
    }).join('') : '<div class="empty">Nenhuma meta ainda.<br>Toque em + para acompanhar o quanto já guardou.</div>';
    $$('[data-m]', el).forEach(b => {
      const m = ms.find(x => x.id === b.dataset.m);
      $('[data-a=ap]', b).onclick = () => formAporte(m);
      $('[data-a=ed]', b).onclick = () => formMeta(m);
    });
  }

  function formMeta(m) {
    const novo = !m, ini = m || { nome: '', valorAlvo: '', valorInicial: '', prazo: '' };
    const s = sheet(novo ? 'Nova meta' : 'Editar meta', `
      ${F('Nome', inp('nome', ini.nome, 'placeholder="Ex.: Reserva de emergência"'))}
      <div class="g2">${F('Valor alvo (R$)', inp('alvo', numStr(ini.valorAlvo), 'inputmode="decimal" placeholder="0,00"'))}${F('Já guardado (R$)', inp('inicial', numStr(ini.valorInicial), 'inputmode="decimal" placeholder="0,00"'))}</div>
      ${F('Prazo (opcional)', inp('prazo', ini.prazo || '', 'type="date"'))}
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    if (!novo) s.$('[data-del]').onclick = async () => {
      if (!(await confirmar(`Excluir a meta "${m.nome}"?`))) return;
      const pos = X().metas.indexOf(m);
      X().metas = X().metas.filter(x => x !== m); s.fechar(); commit();
      toast('Meta excluída', () => { X().metas.splice(Math.min(pos, X().metas.length), 0, m); commit(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), alvo = num(v.alvo), ini2 = v.inicial.trim() ? num(v.inicial) : 0;
      if (!v.nome.trim()) return toast('Informe o nome da meta.');
      if (!(alvo > 0)) return toast('Informe um valor alvo maior que zero.');
      if (isNaN(ini2)) return toast('Valor guardado inválido.');
      if (v.prazo && !dataOk(v.prazo)) return toast('Prazo inválido.');
      const dados = { nome: v.nome.trim(), valorAlvo: r2(alvo), valorInicial: r2(ini2), prazo: v.prazo || '' };
      if (novo) X().metas.push({ id: uid('m'), ...dados, aportes: [] }); else Object.assign(m, dados);
      s.fechar(); commit();
    };
  }

  function formAporte(m) {
    const s = sheet('Aporte · ' + m.nome, `
      <p class="hint" style="margin-top:0">Use valor negativo para registrar uma retirada.</p>
      <div class="g2">${F('Valor (R$)', inp('valor', '', 'inputmode="decimal" placeholder="0,00"'))}${F('Data', inp('data', hoje(), 'type="date"'))}</div>
      ${F('Observação (opcional)', inp('obs', ''))}
      <div class="acts"><button class="btn" data-ok>Salvar aporte</button></div>`);
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), valor = num(v.valor);
      if (isNaN(valor) || valor === 0) return toast('Informe um valor diferente de zero.');
      if (!dataOk(v.data)) return toast('Informe uma data válida.');
      (m.aportes = m.aportes || []).push({ data: v.data, valor: r2(valor), obs: v.obs.trim() });
      s.fechar(); commit();
    };
  }

  /* =========================================================
     PREVISÃO DE FLUXO (30/60/90 dias)
     ========================================================= */
  let prevDias = 30;
  // Parte do saldo REALIZADO de hoje; pendentes vencidos entram em "hoje"; lançamentos futuros
  // entram na data; parcelas das dívidas ativas saem a cada 30 dias.
  function projetar(dias) {
    const hj = hoje(), fim = addDias(hj, dias), start = Fin.saldoTotal(), porDia = {}; let ent = 0, sai = 0;
    const add = (d, v) => { porDia[d] = (porDia[d] || 0) + v; if (d <= fim) { if (v >= 0) ent += v; else sai += -v; } };
    DB.fin.tx.forEach(t => { const v = t.tipo === 'entrada' ? t.valor : -t.valor; if (t.data > hj) add(t.data, v); else if (t.status === 'pendente') add(hj, v); });
    const meses = Math.max(1, Math.ceil(dias / 30)), pagas = new Array(meses).fill(0);
    dividasAtivas().forEach(d => { let ant = 0; for (let m = 1; m <= meses; m++) { const p = simular(d, m).pago; pagas[m - 1] += p - ant; ant = p; } });
    const serie = []; let run = start, dividas = 0, min = null, neg = null;
    for (let i = 0; i <= dias; i++) {
      const dia = addDias(hj, i); run += porDia[dia] || 0;
      if (i > 0 && i % 30 === 0) { const p = pagas[i / 30 - 1] || 0; run -= p; dividas += p; }
      const pt = { data: dia, saldo: r2(run) }; serie.push(pt);
      if (!min || pt.saldo < min.saldo) min = pt;
      if (!neg && pt.saldo < 0) neg = pt;
    }
    return { start: r2(start), serie, ent: r2(ent), sai: r2(sai), dividas: r2(dividas), min, neg, fim: serie[serie.length - 1].saldo, meses };
  }
  function grafico(serie) {
    const vs = serie.map(p => p.saldo), pas = Math.max(1, Math.floor((serie.length - 1) / 3));
    const rot = serie.map((p, i) => (i === 0 || i === serie.length - 1 || i % pas === 0 && serie.length - 1 - i >= pas / 2) ? `${+p.data.slice(8)}/${+p.data.slice(5, 7)}` : '');
    return Graf.linha(vs, rot, 150);
  }

  function rPrev(el) {
    const p = projetar(prevDias), hj = hoje(), fim = addDias(hj, prevDias), dv = dividasAtivas();
    const lista = [...DB.fin.tx.filter(t => t.status === 'pendente' && t.data <= hj).sort((a, b) => a.data.localeCompare(b.data)),
      ...DB.fin.tx.filter(t => t.data > hj && t.data <= fim).sort((a, b) => a.data.localeCompare(b.data))];
    let dp = 0, dj = 0, ds = 0; dv.forEach(d => { const r = simular(d, p.meses); dp += r.pago; dj += r.juros; ds += r.saldoFinal; });
    el.innerHTML = `<div class="seg sm">${[30, 60, 90].map(n => `<button data-d="${n}" class="${prevDias === n ? 'on' : ''}">${n} dias</button>`).join('')}</div>
      <div class="sum"><div><small>Entradas</small><b class="n pos">${dinheiro(p.ent)}</b></div><div><small>Saídas</small><b class="n neg">${dinheiro(p.sai)}</b></div><div><small>Saldo final</small><b class="n ${p.fim < 0 ? 'neg' : 'pos'}">${dinheiro(p.fim)}</b></div></div>
      <div class="card"><h3>Saldo projetado<span class="mu sm" style="font-weight:400">próximos ${prevDias} dias</span></h3>${grafico(p.serie)}
        <div style="display:flex;justify-content:space-between;margin-top:4px"><small class="mu">Hoje ${dinheiro(p.start)}</small><small class="mu">${fmtData(fim)}</small></div>
        <p class="sm" style="margin:8px 0 0">${p.neg ? `<span class="neg">⚠ O saldo fica negativo em ${fmtDataL(p.neg.data)}.</span> ` : ''}Menor saldo: <b class="n ${p.min.saldo < 0 ? 'neg' : ''}">${dinheiro(p.min.saldo)}</b> em ${fmtData(p.min.data)}.</p></div>
      ${dv.length ? `<div class="card"><h3>Dívidas no período</h3><div class="sum" style="margin:6px 0"><div><small>Parcelas</small><b class="n">${dinheiro(r2(dp))}</b></div><div><small>Juros</small><b class="n neg">${dinheiro(r2(dj))}</b></div><div><small>Saldo final</small><b class="n">${dinheiro(r2(ds))}</b></div></div>
        <small class="mu">O saldo projetado já desconta as parcelas das dívidas ativas (a cada 30 dias). Os juros mostram quanto do pagamento é consumido pelo custo da dívida.</small></div>` : ''}
      <div class="dia">Lançamentos previstos</div>
      ${lista.length ? `<div class="card" style="padding:2px 14px">${lista.slice(0, 60).map(t => {
        const venc = t.status === 'pendente' && t.data <= hj;
        return `<div class="row" data-id="${esc(t.id)}">${t.status === 'pendente' ? `<button class="ck" data-q="${esc(t.id)}" aria-label="Dar baixa"></button>` : ''}<div class="t"><b>${esc(t.descricao || t.categoria)}</b><small>${esc(t.categoria)} · ${fmtData(t.data)}${venc ? ' · <span class="neg">vencido — conta hoje</span>' : t.status === 'pendente' ? ' · pendente' : ''}</small></div><span class="n ${t.tipo === 'entrada' ? 'pos' : 'neg'}">${t.tipo === 'entrada' ? '+' : '−'} ${dinheiro(t.valor)}</span></div>`;
      }).join('')}</div>${lista.length > 60 ? `<p class="hint">Mostrando 60 de ${lista.length} lançamentos.</p>` : ''}` : '<div class="empty">Nenhum lançamento futuro neste período.</div>'}`;
    $$('[data-d]', el).forEach(b => b.onclick = () => { prevDias = +b.dataset.d; refresh(); });
    $$('.row[data-id]', el).forEach(r => r.onclick = e => { if (e.target.closest('[data-q]')) return; const t = DB.fin.tx.find(x => x.id === r.dataset.id); if (t) Fin.formTx(t); });
    $$('[data-q]', el).forEach(b => b.onclick = () => Fin.baixar(b.dataset.q));
  }

  /* ---------- resumos lidos pelos widgets (somente leitura) ---------- */
  E.resumo = {
    cartoes: () => X().cartoes.filter(c => c.ativo !== false).map(c => ({ nome: c.nome || 'Cartão', limite: N(c.limite), usado: comprometido(c), fatura: faturaAtual(c) })),
    dividas: () => dividasAtivas().map(d => ({ descricao: d.descricao, saldo: N(d.valorPrincipal), taxa: N(d.taxaJuros), parcela: N(d.parcela) })),
    metas: () => X().metas.map(m => ({ nome: m.nome, atual: metaAtual(m), alvo: N(m.valorAlvo), prazo: m.prazo && dataOk(m.prazo) ? m.prazo : '' }))
  };

  /* ---------- registro das telas ---------- */
  E.cart = { render: rCart, fab: () => () => formCompra(), fabLabel: () => 'Nova compra no cartão' };
  E.prev = { render: rPrev };
  E.metas = { render: rMetas, fab: () => () => formMeta(null), fabLabel: () => 'Nova meta' };
  E.div = { render: rDiv, fab: () => () => formDivida(null), fabLabel: () => 'Nova dívida' };
})();
