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
    ['cartoes', 'debts', 'metas', 'investimentos'].forEach(k => { if (!Array.isArray(e[k])) e[k] = []; });
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
  E.cartoesAtivos = () => X().cartoes.filter(c => c.ativo !== false);
  E.cartaoPor = cartaoPor;
  E.vencFatura = vencFatura;
  E.detalheFatura = (id, data) => { const c = cartaoPor(id); if (c) detalheFatura(c, data); };
  E.simularCompra = () => formSimCompra();
  E.pagarFatura = (id, data) => { const c = cartaoPor(id); if (c) pagarFatura(c, data); };

  function pagarFatura(c, data) {
    const itens = txCartao(c).filter(t => t.data === data && t.status === 'pendente'); if (!itens.length) return;
    itens.forEach(t => { t.status = 'pago'; t.pagoEm = hoje(); }); commit();
    toast('Fatura marcada como paga', () => { itens.forEach(t => { t.status = 'pendente'; delete t.pagoEm; }); commit(); });
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
      `<div class="acts" style="justify-content:flex-start;margin-bottom:12px"><button class="btn sec" id="nk">Novo cartão</button>${cs.some(c => c.ativo !== false) ? '<button class="btn" id="nb">Nova compra</button><button class="btn sec" id="ns">Simular compra</button>' : ''}</div>` +
      (rows.length ? `<div class="dia">Faturas</div><div class="card" style="padding:2px 14px">${rows.slice(0, 24).map(r => `<div class="row${r.paga ? ' done' : ''}" data-f="${esc(r.c.id)}|${r.data}">${r.paga ? '' : `<button class="ck" data-pay aria-label="Marcar fatura como paga"></button>`}
        <div class="t"><b>${esc(r.c.nome)}</b><small>${r.itens.length} compra(s) · vence ${fmtData(r.data)}${r.paga ? ' · paga' : r.data < hj ? ' · <span class="neg">vencida</span>' : ''}</small></div><span class="n ${r.paga ? 'mu' : 'neg'}">${dinheiro(r.total)}</span></div>`).join('')}</div>` : '');
    $$('[data-c]', el).forEach(b => { $('[data-ed]', b).onclick = () => formCartao(cartaoPor(b.dataset.c)); });
    $('#nk', el).onclick = () => formCartao(null);
    const nb = $('#nb', el); if (nb) nb.onclick = () => formCompra();
    const ns = $('#ns', el); if (ns) ns.onclick = () => formSimCompra();
    $$('[data-f]', el).forEach(r => r.onclick = e => {
      const [cid, data] = r.dataset.f.split('|'), c = cartaoPor(cid);
      if (e.target.closest('[data-pay]')) return pagarFatura(c, data);
      detalheFatura(c, data);
    });
  }

  /* exclui uma compra do cartão; se for parcelada/recorrente, pergunta o alcance */
  async function excluirCompra(t) {
    const serie = t.seriesId ? DB.fin.tx.filter(x => x.seriesId === t.seriesId) : [];
    const seguintes = serie.filter(x => x.data > t.data);
    let modo = 0;                                  // 0 = só esta, 1 = esta e as próximas, 2 = a série inteira
    if (serie.length > 1) {
      const i = await dialog(`Esta compra tem ${serie.length} parcelas/lançamentos no sistema. O que excluir?`,
        ['Cancelar', 'Só esta', ...(seguintes.length ? ['Esta e as próximas'] : []), 'Todas'], true);
      if (i < 1) return false;
      const rot = ['Cancelar', 'Só esta', ...(seguintes.length ? ['Esta e as próximas'] : []), 'Todas'][i];
      modo = rot === 'Só esta' ? 0 : rot === 'Todas' ? 2 : 1;
    } else if (!(await confirmar(`Excluir a compra "${t.descricao || t.categoria}"?`))) return false;
    const ids = new Set(modo === 2 ? serie.map(x => x.id) : modo === 1 ? [t.id, ...seguintes.map(x => x.id)] : [t.id]);
    const removidos = DB.fin.tx.filter(x => ids.has(x.id));
    DB.fin.tx = DB.fin.tx.filter(x => !ids.has(x.id)); commit();
    toast(removidos.length > 1 ? `${removidos.length} lançamentos excluídos` : 'Compra excluída', () => { DB.fin.tx.push(...removidos); commit(); });
    return true;
  }

  function detalheFatura(c, data) {
    const inv = faturas(c).find(i => i.data === data); if (!inv) return;
    const s = sheet(`${c.nome} · vence ${fmtData(data)}`, `<div class="card" style="padding:2px 14px">${inv.itens.map(t => `<div class="row" data-t="${esc(t.id)}"><div class="t"><b>${esc(t.descricao || t.categoria)}</b><small>${esc(t.categoria)}${t.dataCompra ? ' · compra ' + fmtData(t.dataCompra) : ''}${t.parcelas > 1 ? ` · ${t.parcela}/${t.parcelas}` : ''}</small></div><span class="n">${dinheiro(t.valor)}</span><button class="btn bad sm" data-x aria-label="Excluir compra" style="margin-left:8px;padding:4px 10px">Excluir</button></div>`).join('')}</div>
      <p class="mu sm" style="margin:0 2px 8px">Total: <b class="n">${dinheiro(inv.total)}</b> · toque numa compra para editar</p>
      ${inv.paga ? '' : '<div class="acts"><button class="btn" data-pg>Marcar como paga</button></div>'}`);
    const pg = s.$('[data-pg]'); if (pg) pg.onclick = () => { s.fechar(); pagarFatura(c, data); };
    s.$$('.row[data-t]').forEach(r => {
      const t = DB.fin.tx.find(x => x.id === r.dataset.t); if (!t) return;
      r.onclick = e => { if (e.target.closest('[data-x]')) return; s.fechar(); Fin.formTx(t); };
      $('[data-x]', r).onclick = async e => {
        e.stopPropagation();
        if (!(await excluirCompra(t))) return;
        s.fechar();
        if (faturas(c).some(i => i.data === data)) detalheFatura(c, data);   // reabre com a lista atualizada
      };
    });
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

  function formCompra(pre = {}) {
    const ativos = X().cartoes.filter(c => c.ativo !== false);
    if (!ativos.length) { toast('Cadastre um cartão primeiro.'); return formCartao(null); }
    const cats = DB.fin.categorias.saida;
    const s = sheet('Compra no cartão', `
      ${F('Cartão', sel('cartaoId', ativos.map(c => [c.id, c.nome]), pre.cartaoId || ativos[0].id))}
      ${F('Valor total (R$)', inp('valor', pre.valor ? numStr(pre.valor) : '', 'inputmode="decimal" placeholder="0,00"'))}
      ${F('Descrição', inp('descricao', pre.descricao || '', 'placeholder="Ex.: Tênis"'))}
      <div class="g2">${F('Categoria', sel('categoria', cats, cats[0]))}${F('Data da compra', inp('data', pre.data || hoje(), 'type="date"'))}</div>
      <div class="g2">${F('Parcelas', inp('parcelas', String(pre.parcelas || 1), 'type="number" min="1" max="60" inputmode="numeric"'))}${F('Já pagas', inp('pagas', '0', 'type="number" min="0" max="59" inputmode="numeric"'))}</div>
      <p class="hint" id="pv"></p>
      <div class="acts"><button class="btn" data-ok>Lançar compra</button></div>`);
    const ler = () => {
      const v = vals(s.el), c = cartaoPor(v.cartaoId), valor = num(v.valor), n = Math.max(1, Math.min(60, Math.round(num(v.parcelas)) || 1));
      const k = Math.max(0, Math.round(num(v.pagas)) || 0);
      return { v, c, valor, n, k };
    };
    const prev = () => {
      const { v, c, valor, n, k } = ler(), p = s.$('#pv');
      if (!c || !(valor > 0) || !dataOk(v.data)) { p.textContent = ''; return; }
      if (k >= n) { p.textContent = n > 1 ? 'As parcelas já pagas devem ser menos que o total.' : ''; return; }
      p.textContent = n > 1 ? `${n}x de ${dinheiro(r2(valor / n))}${k ? ` — ${k} já ${k > 1 ? 'pagas' : 'paga'}, faltam ${n - k} (${dinheiro(r2(valor / n * (n - k)))})` : ''} — 1ª fatura em ${fmtData(vencFatura(c, v.data, k))}, última em ${fmtData(vencFatura(c, v.data, n - 1))}.` : `Fatura de ${dinheiro(valor)} em ${fmtData(vencFatura(c, v.data, 0))}.`;
    };
    s.$$('input,select').forEach(e => { e.oninput = prev; e.onchange = prev; });
    s.$('[data-ok]').onclick = () => {
      const { v, c, valor, n, k } = ler();
      if (!c) return toast('Escolha um cartão.');
      if (!(valor > 0)) return toast('Informe um valor maior que zero.');
      if (!dataOk(v.data)) return toast('Informe uma data válida.');
      if (k >= n) return toast(n > 1 ? 'As parcelas já pagas devem ser menos que o total.' : 'Nada a lançar.');
      const sid = n > 1 ? uid('parc') : null, cada = r2(valor / n); let acum = 0;
      for (let i = 0; i < n; i++) {
        const val = i === n - 1 ? r2(valor - acum) : cada; acum = r2(acum + val);
        if (i < k) continue;                       // parcela já paga: não entra no saldo nem na fatura
        DB.fin.tx.push({ id: uid('tx'), data: vencFatura(c, v.data, i), tipo: 'saida', categoria: v.categoria, descricao: v.descricao.trim(), valor: val, status: 'pendente',
          contaId: principal(), pagamento: 'credito', cartaoId: c.id, dataCompra: v.data, parcela: i + 1, parcelas: n, seriesId: sid });
      }
      s.fechar(); commit(); toast(n > 1 ? (k ? `Lançadas as ${n - k} parcelas restantes (de ${n}).` : `Compra lançada em ${n}x.`) : 'Compra lançada.');
    };
  }

  /* simulação de compra: mostra o efeito nas faturas, no limite e no saldo previsto SEM lançar nada */
  function formSimCompra() {
    const ativos = X().cartoes.filter(c => c.ativo !== false);
    if (!ativos.length) { toast('Cadastre um cartão primeiro.'); return formCartao(null); }
    const s = sheet('Simular compra no cartão', `
      ${F('Cartão', sel('cartaoId', ativos.map(c => [c.id, c.nome]), ativos[0].id))}
      ${F('Valor da compra (R$)', inp('valor', '', 'inputmode="decimal" placeholder="0,00"'))}
      <div class="g2">${F('Parcelas', inp('parcelas', '1', 'type="number" min="1" max="60" inputmode="numeric"'))}${F('Data da compra', inp('data', hoje(), 'type="date"'))}</div>
      ${F('Juros ao mês (%), se houver', inp('juros', '', 'inputmode="decimal" placeholder="0"'))}
      <div id="res"></div>
      <div class="acts"><button class="btn" data-ok hidden>Lançar de verdade</button></div>`);
    const calc = () => {
      const v = vals(s.el), c = cartaoPor(v.cartaoId), valor = num(v.valor), n = Math.max(1, Math.min(60, Math.round(num(v.parcelas)) || 1)), j = Math.max(0, num(v.juros) || 0) / 100;
      const box = s.$('#res'), ok = s.$('[data-ok]');
      if (!c || !(valor > 0) || !dataOk(v.data)) { box.innerHTML = ''; ok.hidden = true; return; }
      const pm = j > 0 && n > 1 ? valor * j / (1 - Math.pow(1 + j, -n)) : valor / n, cada = r2(pm), total = r2(cada * n - (j > 0 ? 0 : r2(cada * n) - valor));
      const totalPago = j > 0 ? r2(pm * n) : r2(valor), disp = r2(N(c.limite) - comprometido(c)), apos = r2(disp - totalPago);
      const linhas = []; let acum = 0;
      for (let i = 0; i < n; i++) {
        const venc = vencFatura(c, v.data, i), val = i === n - 1 ? r2(totalPago - acum) : cada; acum = r2(acum + val);
        const atual = soma(txCartao(c).filter(t => t.data === venc && t.status === 'pendente').map(t => t.valor));
        const sBef = Fin.saldoEm(venc), sAft = r2(sBef - acum);
        linhas.push({ venc, val, atual, nova: r2(atual + val), sBef, sAft });
      }
      const min = Math.min(...linhas.map(l => l.sAft)), neg = linhas.find(l => l.sAft < 0);
      box.innerHTML = `<div class="card" style="margin:10px 0"><div class="sum"><div><small>${n}x de</small><b class="n">${dinheiro(cada)}</b></div><div><small>Total</small><b class="n">${dinheiro(totalPago)}</b></div><div><small>${j > 0 ? 'Juros' : 'Limite livre'}</small><b class="n ${j > 0 ? 'neg' : apos < 0 ? 'neg' : ''}">${j > 0 ? dinheiro(r2(totalPago - valor)) : dinheiro(apos)}</b></div></div>
        <small class="mu">Limite disponível: ${dinheiro(disp)} → ${dinheiro(apos)}${apos < 0 ? ' <span class="neg">(estoura o limite)</span>' : ''}</small></div>
        <div class="dia">Fatura por fatura</div><div class="card" style="padding:2px 14px">${linhas.slice(0, 24).map(l => `<div class="row"><div class="t"><b>${fmtData(l.venc)}</b><small style="display:block;white-space:normal">Fatura: ${dinheiro(l.atual)} → <b>${dinheiro(l.nova)}</b></small><small style="display:block;white-space:normal">Saldo previsto: ${dinheiro(l.sBef)} → <span class="${l.sAft < 0 ? 'neg' : ''}">${dinheiro(l.sAft)}</span></small></div><span class="n neg">− ${dinheiro(l.val)}</span></div>`).join('')}</div>
        <p class="hint">${neg ? `Atenção: o saldo previsto fica negativo em ${fmtData(neg.venc)} (${dinheiro(neg.sAft)}).` : `Em nenhuma fatura o saldo previsto fica negativo (o menor é ${dinheiro(min)}).`} Nada foi lançado.</p>`;
      ok.hidden = false;
    };
    s.$$('input,select').forEach(e => { e.oninput = calc; e.onchange = calc; });
    s.$('[data-ok]').onclick = () => { const v = vals(s.el); s.fechar(); formCompra({ cartaoId: v.cartaoId, valor: num(v.valor), parcelas: Math.round(num(v.parcelas)) || 1, data: v.data }); };
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
  let prevDias = 30, prevAp = true;                // prevAp: aportes planejados descontam do saldo projetado
  // Parte do saldo REALIZADO de hoje; pendentes vencidos entram em "hoje"; lançamentos futuros
  // entram na data; parcelas das dívidas ativas saem a cada 30 dias.
  function projetar(dias, comAp = prevAp) {
    const hj = hoje(), fim = addDias(hj, dias), start = Fin.saldoTotal(), porDia = {}; let ent = 0, sai = 0;
    const add = (d, v) => { porDia[d] = (porDia[d] || 0) + v; if (d <= fim) { if (v >= 0) ent += v; else sai += -v; } };
    DB.fin.tx.forEach(t => { if (!comAp && t.planoData && t.status === 'pendente') return; const v = t.tipo === 'entrada' ? t.valor : -t.valor; if (t.status === 'pendente') add(t.data > hj ? t.data : hj, v); else if (Fin.efData(t) > hj) add(Fin.efData(t), v); });
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

  // visão separada: patrimônio investido projetado (juros compostos + plano de aportes), fora do fluxo de caixa
  function cardInvPrev(dias, temApConta) {
    const at = invAtivos(); if (!at.length) return '';
    const hj = hoje(), fim = addDias(hj, dias);
    const L = at.map(i => { const ex = planejados(i, fim), a = invVal(i), f = invValorEm(i, fim, ex), ap = soma(ex.map(m => m.v)); return { i, n: ex.length, a, f, ap, rend: r2(f - a - ap) }; });
    const tA = soma(L.map(l => l.a)), tF = soma(L.map(l => l.f)), tAp = soma(L.map(l => l.ap)), tR = soma(L.map(l => l.rend));
    const ds = []; for (let d = 0; d < dias; d += Math.max(1, Math.round(dias / 30))) ds.push(d); ds.push(dias);
    const vals = ds.map(d => { const dia = addDias(hj, d); return soma(at.map(i => invValorEm(i, dia, planejados(i, dia)))); });
    const rot = ds.map((d, k) => (k === 0 || k === ds.length - 1 || k === Math.round((ds.length - 1) / 2)) ? `${+addDias(hj, d).slice(8)}/${+addDias(hj, d).slice(5, 7)}` : '');
    const semTaxa = at.some(i => i.modo !== 'taxa');
    return `<div class="card"><h3>Investimentos<span class="mu sm" style="font-weight:400">próximos ${dias} dias</span></h3>
      <div class="sum" style="margin:6px 0 10px"><div><small>Aportes</small><b class="n">${dinheiro(tAp)}</b></div><div><small>Rendimento</small><b class="n ${tR >= 0 ? 'pos' : 'neg'}">${tR >= 0 ? '+ ' : '− '}${dinheiro(Math.abs(tR))}</b></div><div><small>Patrimônio final</small><b class="n">${dinheiro(tF)}</b></div></div>
      ${Graf.linha(vals, rot, 150)}
      <div style="display:flex;justify-content:space-between;margin:4px 0 6px"><small class="mu">Hoje ${dinheiro(tA)}</small><small class="mu">${fmtData(fim)}</small></div>
      ${L.map(l => `<div class="row"><div class="t"><b>${esc(l.i.nome)}</b><small>${l.n ? `${l.n} aporte${l.n > 1 ? 's' : ''} de ${dinheiro(N(l.i.plano.valor))}` : 'sem aportes previstos'}${l.i.modo === 'taxa' && taxaVigente(l.i) ? ' · ' + taxaTxt(taxaVigente(l.i)) : ''}</small></div><span class="n">${dinheiro(l.f)}</span></div>`).join('')}
      <small class="mu">${temApConta ? (prevAp ? 'Os aportes com conta definida já estão descontados do saldo projetado acima.' : 'Os aportes não estão descontados do saldo projetado acima.') : 'Defina a conta no plano mensal para descontar os aportes do saldo projetado.'}${semTaxa ? ' Investimentos em modo manual não rendem na projeção; use o cálculo por taxa.' : ''}</small></div>`;
  }

  function rPrev(el) {
    const p = projetar(prevDias), hj = hoje(), fim = addDias(hj, prevDias), dv = dividasAtivas();
    const lista = [...DB.fin.tx.filter(t => t.status === 'pendente' && t.data <= hj).sort((a, b) => a.data.localeCompare(b.data)),
      ...DB.fin.tx.filter(t => t.data > hj && t.data <= fim).sort((a, b) => a.data.localeCompare(b.data))];
    let dp = 0, dj = 0, ds = 0; dv.forEach(d => { const r = simular(d, p.meses); dp += r.pago; dj += r.juros; ds += r.saldoFinal; });
    const temApConta = invAtivos().some(i => i.plano && DB.fin.contas.some(c => c.id === i.plano.contaId));
    el.innerHTML = `<div class="seg sm">${[30, 60, 90].map(n => `<button data-d="${n}" class="${prevDias === n ? 'on' : ''}">${n} dias</button>`).join('')}</div>
      ${temApConta ? `<div class="seg sm">${[[1, 'Com aportes no saldo'], [0, 'Sem aportes']].map(([k, l]) => `<button data-ap="${k}" class="${(prevAp ? 1 : 0) === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
      <div class="sum"><div><small>Entradas</small><b class="n pos">${dinheiro(p.ent)}</b></div><div><small>Saídas</small><b class="n neg">${dinheiro(p.sai)}</b></div><div><small>Saldo final</small><b class="n ${p.fim < 0 ? 'neg' : 'pos'}">${dinheiro(p.fim)}</b></div></div>
      <div class="card"><h3>Saldo projetado<span class="mu sm" style="font-weight:400">próximos ${prevDias} dias</span></h3>${grafico(p.serie)}
        <div style="display:flex;justify-content:space-between;margin-top:4px"><small class="mu">Hoje ${dinheiro(p.start)}</small><small class="mu">${fmtData(fim)}</small></div>
        <p class="sm" style="margin:8px 0 0">${p.neg ? `<span class="neg">⚠ O saldo fica negativo em ${fmtDataL(p.neg.data)}.</span> ` : ''}Menor saldo: <b class="n ${p.min.saldo < 0 ? 'neg' : ''}">${dinheiro(p.min.saldo)}</b> em ${fmtData(p.min.data)}.</p></div>
      ${dv.length ? `<div class="card"><h3>Dívidas no período</h3><div class="sum" style="margin:6px 0"><div><small>Parcelas</small><b class="n">${dinheiro(r2(dp))}</b></div><div><small>Juros</small><b class="n neg">${dinheiro(r2(dj))}</b></div><div><small>Saldo final</small><b class="n">${dinheiro(r2(ds))}</b></div></div>
        <small class="mu">O saldo projetado já desconta as parcelas das dívidas ativas (a cada 30 dias). Os juros mostram quanto do pagamento é consumido pelo custo da dívida.</small></div>` : ''}
      ${cardInvPrev(prevDias, temApConta)}
      <div class="dia">Lançamentos previstos</div>
      ${lista.length ? `<div class="card" style="padding:2px 14px">${lista.slice(0, 60).map(t => {
        const venc = t.status === 'pendente' && t.data <= hj;
        return `<div class="row" data-id="${esc(t.id)}">${t.status === 'pendente' ? `<button class="ck" data-q="${esc(t.id)}" aria-label="Dar baixa"></button>` : ''}<div class="t"><b>${esc(t.descricao || t.categoria)}</b><small>${esc(t.categoria)} · ${fmtData(t.data)}${venc ? ' · <span class="neg">vencido — conta hoje</span>' : t.status === 'pendente' ? ' · pendente' : ''}</small></div><span class="n ${t.tipo === 'entrada' ? 'pos' : 'neg'}">${t.tipo === 'entrada' ? '+' : '−'} ${dinheiro(t.valor)}</span></div>`;
      }).join('')}</div>${lista.length > 60 ? `<p class="hint">Mostrando 60 de ${lista.length} lançamentos.</p>` : ''}` : '<div class="empty">Nenhum lançamento futuro neste período.</div>'}`;
    $$('[data-d]', el).forEach(b => b.onclick = () => { prevDias = +b.dataset.d; refresh(); });
    $$('[data-ap]', el).forEach(b => b.onclick = () => { prevAp = b.dataset.ap === '1'; refresh(); });
    $$('.row[data-id]', el).forEach(r => r.onclick = e => { if (e.target.closest('[data-q]')) return; const t = DB.fin.tx.find(x => x.id === r.dataset.id); if (t) Fin.formTx(t); });
    $$('[data-q]', el).forEach(b => b.onclick = () => Fin.baixar(b.dataset.q));
  }

  /* =========================================================
     INVESTIMENTOS
     Cada posição guarda o valor inicial, os aportes/resgates e o valor atual (informado por você).
     Rendimento = valor atual − (valor inicial + aportes − resgates).
     ========================================================= */
  const TIPOS_INV = ['Renda fixa', 'Tesouro Direto', 'CDB / LCI / LCA', 'Poupança', 'Ações', 'FIIs', 'Fundos', 'Cripto', 'Previdência', 'Outro'];
  const LIQ = [['d0', 'Diária (D+0)'], ['d1', 'D+1'], ['d2', 'D+2'], ['d30', 'D+30'], ['venc', 'No vencimento']];
  const liqNome = k => (LIQ.find(x => x[0] === k) || [0, 'Não informada'])[1];
  const liqTxt = i => i.liquidez ? liqNome(i.liquidez) + (i.liquidez === 'venc' && dataOk(i.vencimento) ? ' · ' + fmtData(i.vencimento) + '/' + i.vencimento.slice(2, 4) : '') : '';
  const diasUteisApos = (d, n) => { let x = d, c = 0; while (c < n) { x = addDias(x, 1); const w = pd(x).getDay(); if (w !== 0 && w !== 6) c++; } return x; };
  // quando o dinheiro de um resgate cai na conta: D+1/D+2 em dias úteis (sem feriados), D+30 em dias corridos
  const dataCredito = (i, d) => i.liquidez === 'd1' ? diasUteisApos(d, 1) : i.liquidez === 'd2' ? diasUteisApos(d, 2) : i.liquidez === 'd30' ? addDias(d, 30) : d;
  const invAtivos = () => X().investimentos.filter(i => i.ativo !== false);
  const taxaTxt = t => String(N(t.taxa)).replace('.', ',') + '% ' + (t.periodo === 'mes' ? 'ao mês' : 'ao ano');
  // taxa diária equivalente (juros compostos, 365 dias corridos): ao mês vira ao ano elevando a 12
  const taxaDia = t => { const r = N(t.taxa) / 100, anual = t.periodo === 'mes' ? Math.pow(1 + r, 12) : 1 + r; return Math.pow(Math.max(0.0001, anual), 1 / 365) - 1; };
  const taxasDe = i => [...(i.taxas || [])].filter(t => dataOk(t.desde)).sort((a, b) => a.desde.localeCompare(b.desde));
  const taxaVigente = (i, d = hoje()) => { const ts = taxasDe(i); let t = ts[0] || null; ts.forEach(x => { if (x.desde <= d) t = x; }); return t; };
  // Valor na data `ate`. Modo "taxa": parte do valor investido na data de início, aplica a taxa vigente em cada dia
  // (cada mudança de taxa vale só dali para frente) e soma aportes/resgates no dia em que aconteceram.
  function invValorEm(i, ate = hoje(), extra = []) {      // extra: aportes previstos [{ d, v }] (plano mensal)
    const ex = extra.filter(m => m.d <= ate);
    if (i.modo !== 'taxa') return r2(N(i.valorAtual) + soma(ex.map(m => m.v)));
    const ini = dataOk(i.dataInicio) ? i.dataInicio : hoje(), ts = taxasDe(i);
    if (!ts.length) return N(i.valorInicial);
    const movs = [...(i.aportes || []).map(a => ({ d: a.data, v: N(a.valor) })), ...ex].map(m => ({ d: m.d < ini ? ini : m.d, v: m.v }));
    const rateAt = d => { let t = ts[0]; ts.forEach(x => { if (x.desde <= d) t = x; }); return taxaDia(t); };
    let bal = N(ini <= ate ? i.valorInicial : 0), cur = ini;
    if (ate < ini) return 0;
    movs.filter(m => m.d <= ini).forEach(m => { bal += m.v; });
    const marcos = [...new Set([...movs.map(m => m.d), ...ts.map(t => t.desde)])].filter(d => d > ini && d <= ate).sort();
    marcos.forEach(d => { bal *= Math.pow(1 + rateAt(cur), diasEntre(cur, d)); cur = d; movs.filter(m => m.d === d).forEach(m => { bal += m.v; }); });
    bal *= Math.pow(1 + rateAt(cur), diasEntre(cur, ate));
    return r2(bal);
  }
  const invVal = i => invValorEm(i, hoje());

  /* plano de aporte mensal: i.plano = { valor, inicio, fim, contaId, ativo, pulados: [] } */
  const planoAtivo = i => !!(i.plano && i.plano.ativo !== false && N(i.plano.valor) > 0 && dataOk(i.plano.inicio) && i.ativo !== false);
  function ocorrencias(i, ate) {                          // datas do plano até `ate`
    if (!planoAtivo(i)) return [];
    const out = [], fim = dataOk(i.plano.fim) ? i.plano.fim : null;
    for (let k = 0; k < 600; k++) { const d = addMeses(i.plano.inicio, k); if (d > ate || (fim && d > fim)) break; out.push(d); }
    return out;
  }
  const feitasPlano = i => new Set([...(i.aportes || []).map(a => a.planoData).filter(Boolean), ...((i.plano && i.plano.pulados) || [])]);
  const pendentesPlano = i => { const f = feitasPlano(i); return ocorrencias(i, hoje()).filter(d => !f.has(d)); };
  // aportes ainda não feitos até `ate`; os que já passaram da data e não foram confirmados contam como "hoje"
  const planejados = (i, ate) => { const f = feitasPlano(i), v = N(i.plano && i.plano.valor), hj = hoje(); return ocorrencias(i, ate).filter(d => !f.has(d)).map(d => ({ d: d < hj ? hj : d, v, data: d })); };
  const invAportes = i => (i.aportes || []).filter(a => !a.rend && (i.modo !== 'taxa' || a.data <= hoje())).map(a => N(a.valor));
  const invRecebido = i => r2(-soma((i.aportes || []).filter(a => a.rend && (i.modo !== 'taxa' || a.data <= hoje())).map(a => N(a.valor))));   // rendimento que já saiu para a conta
  const invLiquido = i => r2(N(i.valorInicial) + soma(invAportes(i)));                             // o que ainda está aplicado do seu bolso
  const invBruto = i => r2(N(i.valorInicial) + soma(invAportes(i).filter(v => v > 0)));            // tudo que já colocou
  const invDisponivel = i => r2(invVal(i) - invLiquido(i));                                          // rendimento que ainda está dentro do investimento
  const invLucro = i => r2(invDisponivel(i) + invRecebido(i));
  const invPct = i => invBruto(i) > 0 ? invLucro(i) / invBruto(i) * 100 : 0;
  const pctTxt = p => (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(1).replace('.', ',') + '%';
  const sinal = v => (v >= 0 ? '+ ' : '− ') + dinheiro(Math.abs(v));


  /* ---- plano mensal = lançamentos reais ("A pagar") ligados ao investimento ----
     Cada ocorrência vira uma saída pendente (invId + planoData). Confirmar = dar baixa;
     excluir uma só = "Só este"; cancelar o plano exclui as pendentes futuras. */
  const invPor = id => X().investimentos.find(x => x.id === id);
  const txPlano = i => DB.fin.tx.filter(t => t.invId === i.id && t.planoData);
  const contaPlano = pl => DB.fin.contas.some(c => c.id === pl.contaId) ? pl.contaId : principal();
  function sincPlanos() {                                  // idempotente: cria o que falta e tira o que sobrou
    const hj = hoje(), hor = addMeses(hj, 12); let mud = false;
    X().investimentos.forEach(i => {
      (i.aportes || []).forEach(a => { if (!a.id) { a.id = uid('mv'); mud = true; } });
      const lig = txPlano(i);
      if (!planoAtivo(i)) {
        const rm = lig.filter(t => t.status === 'pendente' && t.data >= hj);
        if (rm.length) { const ids = new Set(rm.map(t => t.id)); DB.fin.tx = DB.fin.tx.filter(t => !ids.has(t.id)); mud = true; }
        return;
      }
      const pl = i.plano, des = ocorrencias(i, hor), set = new Set(des), feitas = feitasPlano(i), tem = new Set(lig.map(t => t.planoData));
      const rm = lig.filter(t => t.status === 'pendente' && !set.has(t.planoData));
      if (rm.length) { const ids = new Set(rm.map(t => t.id)); DB.fin.tx = DB.fin.tx.filter(t => !ids.has(t.id)); mud = true; }
      const cats = DB.fin.categorias.saida; if (!cats.includes('Investimentos')) cats.push('Investimentos');
      des.forEach(d => {
        if (feitas.has(d) || tem.has(d)) return;
        DB.fin.tx.push({ id: uid('tx'), data: d, tipo: 'saida', categoria: 'Investimentos', descricao: 'Aporte · ' + i.nome, valor: r2(N(pl.valor)), status: 'pendente',
          contaId: contaPlano(pl), pagamento: 'pix', invId: i.id, planoData: d, seriesId: 'pl:' + i.id, recorrente: true, frequencia: 'mensal' });
        mud = true;
      });
    });
    return mud;
  }
  // mantém o aporte do investimento em sintonia com o lançamento (baixa, edição, desfazer)
  E.statusMudou = t => {
    if (!t || !t.invId) return;
    const i = invPor(t.invId); if (!i) return;
    const ap = i.aportes = i.aportes || [], m = ap.find(a => a.txId === t.id), sg = t.tipo === 'saida' ? 1 : -1;
    const ajusta = dv => { if (i.modo !== 'taxa') i.valorAtual = r2(N(i.valorAtual) + dv); };
    if (t.planoData) {
      const feito = t.status !== 'pendente';
      if (feito && !m) { const mv = { id: uid('mv'), data: t.data, valor: r2(t.valor), obs: '', txId: t.id, planoData: t.planoData }; ap.push(mv); ajusta(mv.valor); }
      else if (!feito && m) { i.aportes = ap.filter(a => a !== m); ajusta(-N(m.valor)); }
      else if (feito && m && (N(m.valor) !== r2(t.valor) || m.data !== t.data)) { ajusta(r2(t.valor) - N(m.valor)); m.valor = r2(t.valor); m.data = t.data; }
    } else if (m && N(m.valor) !== r2(sg * t.valor)) { ajusta(r2(sg * t.valor) - N(m.valor)); m.valor = r2(sg * t.valor); }
  };
  // chamado quando lançamentos ligados a investimentos são excluídos; devolve a função de desfazer
  E.aposExcluir = (rem, modo, ini) => {
    const desf = [];
    rem.forEach(t => {
      if (!t.invId) return; const i = invPor(t.invId); if (!i) return;
      const m = (i.aportes || []).find(a => a.txId === t.id);
      if (m) { i.aportes = i.aportes.filter(a => a !== m); if (i.modo !== 'taxa') i.valorAtual = r2(N(i.valorAtual) - N(m.valor)); desf.push(() => { i.aportes.push(m); if (i.modo !== 'taxa') i.valorAtual = r2(N(i.valorAtual) + N(m.valor)); }); }
      if (t.planoData && i.plano && !(modo === 2 && ini && ini.planoData && t.planoData >= ini.planoData)) {
        const pu = i.plano.pulados = i.plano.pulados || [];
        if (!pu.includes(t.planoData)) { pu.push(t.planoData); desf.push(() => { i.plano.pulados = (i.plano.pulados || []).filter(d => d !== t.planoData); }); }
      }
    });
    if (modo === 2 && ini && ini.planoData && ini.invId) {                  // "este e os próximos": o plano termina antes desta data
      const i = invPor(ini.invId);
      if (i && i.plano) { const antFim = i.plano.fim, antAt = i.plano.ativo, fim = addDias(ini.planoData, -1); i.plano.fim = fim; if (fim < i.plano.inicio) i.plano.ativo = false; desf.push(() => { i.plano.fim = antFim; i.plano.ativo = antAt; }); }
    }
    return () => desf.forEach(f => f());
  };
  E.sincPlanos = sincPlanos;
  function confirmarPlano(id) {
    const t = DB.fin.tx.find(x => x.id === id); if (!t) return;
    t.status = 'pago'; t.pagoEm = hoje(); E.statusMudou(t); commit();
    toast('Aporte confirmado', () => { t.status = 'pendente'; delete t.pagoEm; E.statusMudou(t); commit(); });
  }
  function pularPlano(id) {
    const t = DB.fin.tx.find(x => x.id === id); if (!t) return;
    DB.fin.tx = DB.fin.tx.filter(x => x.id !== id); const des = E.aposExcluir([t], 1, t); commit();
    toast('Aporte de ' + fmtData(t.planoData) + ' ignorado (os outros continuam).', () => { DB.fin.tx.push(t); des(); commit(); });
  }
  async function excluirMov(i, m) {
    const nome = m.rend ? 'rendimento' : N(m.valor) < 0 ? 'resgate' : 'aporte', tx = m.txId ? DB.fin.tx.find(t => t.id === m.txId) : null;
    if (!(await confirmar(`Excluir este ${nome} de ${fmtData(m.data)} (${dinheiro(Math.abs(N(m.valor)))})?${tx ? ' O lançamento ligado a ele também será excluído.' : ''}${m.planoData ? ' Só esta data do plano é ignorada; os outros aportes continuam.' : ''}`))) return;
    i.aportes = (i.aportes || []).filter(a => a !== m);
    if (tx) DB.fin.tx = DB.fin.tx.filter(t => t !== tx);
    if (i.modo !== 'taxa') i.valorAtual = r2(N(i.valorAtual) - N(m.valor));
    let pul = false;
    if (m.planoData && i.plano) { const pu = i.plano.pulados = i.plano.pulados || []; if (!pu.includes(m.planoData)) { pu.push(m.planoData); pul = true; } }
    commit();
    toast(nome[0].toUpperCase() + nome.slice(1) + ' excluído', () => {
      i.aportes.push(m); if (tx) DB.fin.tx.push(tx); if (i.modo !== 'taxa') i.valorAtual = r2(N(i.valorAtual) + N(m.valor));
      if (pul) i.plano.pulados = i.plano.pulados.filter(d => d !== m.planoData); commit();
    });
  }

  function infoTaxa(i) {
    const t = taxaVigente(i), ts = taxasDe(i), fut = ts.filter(x => x.desde > hoje()), hj = hoje();
    const f1 = addMeses(hj, 1), f12 = addMeses(hj, 12), p12 = invValorEm(i, f12, planejados(i, f12)), p1 = invValorEm(i, f1, planejados(i, f1));
    return `<p class="sm" style="margin:6px 0 2px">Taxa atual: <b>${t ? taxaTxt(t) : '—'}</b>${t && t.desde > i.dataInicio ? ` <span class="mu">desde ${fmtData(t.desde)}</span>` : ''}${fut.length ? ` <span class="mu">· ${fut.length} mudança${fut.length > 1 ? 's' : ''} agendada${fut.length > 1 ? 's' : ''}</span>` : ''}</p>
      <p class="mu sm" style="margin:0 0 6px">Projeção ${planoAtivo(i) ? 'com o plano mensal' : 'sem novos aportes'}: ${dinheiro(p1)} em 1 mês · ${dinheiro(p12)} em 12 meses.</p>
      <details style="margin:6px 0"><summary class="mu sm">Histórico de taxas</summary>${[...ts].reverse().map((x, k, a) => `<div class="mu sm" style="padding:3px 0"${k < a.length - 1 ? ` data-rt="${esc(x.desde)}" role="button"` : ''}>${fmtData(x.desde)}${x.desde.slice(0, 4) !== hj.slice(0, 4) ? '/' + x.desde.slice(2, 4) : ''}: <span class="n">${taxaTxt(x)}</span>${x.desde > hj ? ' (agendada)' : ''}${k < a.length - 1 ? ' <span class="mu">· toque para remover</span>' : ''}</div>`).join('')}</details>`;
  }

  function planoHtml(i) {
    const pl = i.plano; if (!pl) return '';
    if (!planoAtivo(i)) return `<p class="mu sm" style="margin:6px 0">Plano mensal pausado ou encerrado.</p>`;
    const hj = hoje(), lig = txPlano(i).filter(t => t.status === 'pendente').sort((a, b) => a.data.localeCompare(b.data));
    const venc = lig.filter(t => t.data <= hj), fut = lig.filter(t => t.data > hj), mostrar = [...venc.slice(-3), ...fut.slice(0, 2)];
    return `<p class="sm" style="margin:6px 0 2px">Plano: <b>${dinheiro(N(pl.valor))}</b> todo mês, dia ${+pl.inicio.slice(8)}${dataOk(pl.fim) ? ` <span class="mu">até ${fmtData(pl.fim)}/${pl.fim.slice(2, 4)}</span>` : ''}</p>
      ${mostrar.map(t => `<div class="sm" style="display:flex;align-items:center;gap:8px;padding:5px 0"><span style="flex:1">${t.data <= hj ? `<span class="neg">Aporte de ${fmtData(t.data)}</span> ainda não confirmado` : `Próximo aporte · ${fmtData(t.data)}`}</span><button class="btn" style="padding:6px 12px;font-size:13px" data-pc="${esc(t.id)}">Confirmar</button><button class="btn sec" style="padding:6px 12px;font-size:13px" data-pp="${esc(t.id)}">Pular</button></div>`).join('')}
      ${venc.length > 3 ? `<small class="mu">+ ${venc.length - 3} anterior${venc.length - 3 > 1 ? 'es' : ''} pendente${venc.length - 3 > 1 ? 's' : ''} em A pagar</small>` : ''}`;
  }

  function rInv(el) {
    const todos = X().investimentos, at = invAtivos();
    const atual = soma(at.map(invVal)), liq = soma(at.map(invLiquido)), bruto = soma(at.map(invBruto)), lucro = r2(atual - liq + soma(at.map(invRecebido))), pct = bruto > 0 ? lucro / bruto * 100 : 0;
    const por = {}; at.forEach(i => { por[i.tipo || 'Outro'] = (por[i.tipo || 'Outro'] || 0) + Math.max(0, invVal(i)); });
    const partes = Object.entries(por).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]).map(([c, v], k) => ({ c, v, cor: Graf.PAL[k % Graf.PAL.length] }));
    const tot = soma(partes.map(p => p.v));
    const aloc = partes.length ? `<div class="card"><h3>Distribuição</h3><div class="cats">${Graf.rosca(partes)}<div class="leg2">${partes.map(p => `<div><i style="background:${p.cor}"></i><span>${esc(p.c)}</span><b>${Math.round(p.v / tot * 100)}%</b></div>`).join('')}</div></div></div>` : '';
    const porL = {}; at.forEach(i => { const k = i.liquidez || '_'; porL[k] = (porL[k] || 0) + Math.max(0, invVal(i)); });
    const ordL = [...LIQ.map(x => x[0]), '_'].filter(k => porL[k] > 0);
    const liq2 = ordL.length > 1 || (ordL.length === 1 && ordL[0] !== '_') ? `<div class="card"><h3>Liquidez</h3>${ordL.map(k => { const p = Math.round(porL[k] / (atual || 1) * 100); return `<div style="padding:6px 0"><div style="display:flex;justify-content:space-between"><span>${esc(liqNome(k === '_' ? '' : k))}</span><span class="n">${dinheiro(r2(porL[k]))} <small class="mu">${p}%</small></span></div><div class="bar"><i style="width:${p}%"></i></div></div>`; }).join('')}<small class="mu">${porL.d0 ? `Disponível no mesmo dia: ${dinheiro(r2(porL.d0))}.` : 'Nada com liquidez diária.'}</small></div>` : '';
    el.innerHTML = (todos.length ? `<div class="card"><small class="mu">Patrimônio investido</small><div class="big">${dinheiro(atual)}</div>
        <small class="${lucro >= 0 ? 'pos' : 'neg'}">${sinal(lucro)} · ${pctTxt(pct)} <span class="mu">sobre o que você colocou</span></small></div>
      <div class="sum"><div><small>Aplicado</small><b class="n">${dinheiro(liq)}</b></div><div><small>Rendimento</small><b class="n ${lucro >= 0 ? 'pos' : 'neg'}">${sinal(lucro)}</b></div><div><small>Rentab.</small><b class="n ${pct >= 0 ? 'pos' : 'neg'}">${pctTxt(pct)}</b></div></div>` + aloc + liq2 : '') +
      (todos.length ? todos.map(i => {
        const off = i.ativo === false, lu = invLucro(i), pc = invPct(i), ap = [...(i.aportes || [])].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 8);
        return `<div class="card" data-v="${esc(i.id)}"${off ? ' style="opacity:.6"' : ''}>
          <h3><span>${esc(i.nome)}${off ? ' <small class="mu">(encerrado)</small>' : ''}</span><a data-ed role="button">Editar</a></h3>
          <small class="mu">${esc(i.tipo || 'Outro')}${i.instituicao ? ' · ' + esc(i.instituicao) : ''}${i.liquidez ? ' · liquidez ' + liqTxt(i) : ''}${i.modo === 'taxa' ? ' · calculado por taxa' : i.dataAtualizacao && dataOk(i.dataAtualizacao) ? ' · valor de ' + fmtData(i.dataAtualizacao) : ''}</small>
          <div class="sum" style="margin:10px 0 6px"><div><small>Valor atual</small><b class="n">${dinheiro(invVal(i))}</b></div><div><small>Aplicado</small><b class="n">${dinheiro(invLiquido(i))}</b></div><div><small>Rendimento</small><b class="n ${lu >= 0 ? 'pos' : 'neg'}">${sinal(lu)}</b><small class="${pc >= 0 ? 'pos' : 'neg'}">${pctTxt(pc)}</small></div></div>
          ${i.modo === 'taxa' && !off ? infoTaxa(i) : ''}
          ${off ? '' : planoHtml(i)}
          ${ap.length ? `<details style="margin:6px 0"><summary class="mu sm">Aportes, resgates e rendimentos</summary>${ap.map(a => `<div class="mu sm" style="padding:3px 0;display:flex;align-items:center;gap:8px"><span style="flex:1">${fmtData(a.data)}: <span class="n ${N(a.valor) < 0 ? 'neg' : ''}">${a.rend ? 'rendimento ' : N(a.valor) < 0 ? 'resgate ' : 'aporte '}${dinheiro(Math.abs(N(a.valor)))}</span>${a.planoData ? ' · plano' : ''}${a.obs ? ' — ' + esc(a.obs) : ''}</span>${off ? '' : `<button class="btn bad sm" data-xa="${esc(a.id || '')}" aria-label="Excluir" style="padding:3px 10px">Excluir</button>`}</div>`).join('')}</details>` : ''}
          ${off ? '' : '<div class="acts" style="justify-content:flex-start"><button class="btn" data-a="mov">Aporte / resgate / rendimento</button><button class="btn sec" data-a="pl">Plano mensal</button>' + (i.modo === 'taxa' ? '<button class="btn sec" data-a="tx">Alterar taxa</button>' : '<button class="btn sec" data-a="val">Atualizar valor</button>') + '</div>'}</div>`;
      }).join('') : '<div class="empty">Nenhum investimento ainda.<br>Toque em + para registrar o que você já tem aplicado e acompanhar o rendimento.</div>');
    $$('[data-v]', el).forEach(b => {
      const i = todos.find(x => x.id === b.dataset.v);
      $('[data-ed]', b).onclick = () => formInv(i);
      const m = $('[data-a=mov]', b), v = $('[data-a=val]', b), tx = $('[data-a=tx]', b);
      if (m) m.onclick = () => formMov(i);
      if (v) v.onclick = () => formValorInv(i);
      if (tx) tx.onclick = () => formTaxa(i);
      const pl = $('[data-a=pl]', b); if (pl) pl.onclick = () => formPlano(i);
      $$('[data-pc]', b).forEach(r => r.onclick = () => confirmarPlano(r.dataset.pc));
      $$('[data-pp]', b).forEach(r => r.onclick = () => pularPlano(r.dataset.pp));
      $$('[data-xa]', b).forEach(r => r.onclick = e => { e.stopPropagation(); const m = (i.aportes || []).find(a => a.id === r.dataset.xa); if (m) excluirMov(i, m); });
      $$('[data-rt]', b).forEach(r => r.onclick = async () => {
        if (!(await confirmar('Remover esta taxa do histórico? O período volta a usar a taxa anterior.', 'Remover'))) return;
        i.taxas = (i.taxas || []).filter(t => t.desde !== r.dataset.rt); commit();
      });
    });
  }

  function formInv(i) {
    const novo = !i, ini = i || { nome: '', tipo: 'Renda fixa', instituicao: '', valorInicial: '', valorAtual: '', dataInicio: hoje(), ativo: true, modo: 'manual', liquidez: 'd0', vencimento: '' };
    const eraTaxa = ini.modo === 'taxa', t0 = eraTaxa ? taxaVigente(ini) : null;
    const s = sheet(novo ? 'Novo investimento' : 'Editar investimento', `
      ${F('Nome', inp('nome', ini.nome, 'placeholder="Ex.: Tesouro Selic 2029"'))}
      <div class="g2">${F('Tipo', sel('tipo', TIPOS_INV, ini.tipo))}${F('Onde está (opcional)', inp('instituicao', ini.instituicao || '', 'placeholder="Ex.: Nubank"'))}</div>
      <div class="g2">${F('Liquidez', sel('liquidez', [['', 'Não informada'], ...LIQ], ini.liquidez || ''))}<div id="lvw" hidden>${F('Vencimento', inp('vencimento', ini.vencimento || '', 'type="date"'))}</div></div>
      <p class="hint">Liquidez é em quanto tempo o dinheiro volta para a conta depois de um resgate.</p>
      ${F('Como acompanhar o valor', sel('modo', [['manual', 'Eu informo o valor atual'], ['taxa', 'Calcular por taxa de juros']], ini.modo || 'manual'))}
      <div class="g2">${F('Valor investido (R$)', inp('inicial', numStr(ini.valorInicial), 'inputmode="decimal" placeholder="0,00"'))}<div id="mmw">${F('Valor atual (R$)', inp('atual', numStr(eraTaxa ? invVal(ini) : ini.valorAtual), 'inputmode="decimal" placeholder="igual ao investido"'))}</div></div>
      <div id="mtw" hidden><div class="g2">${F('Taxa (%)', inp('taxa', '', 'inputmode="decimal" placeholder="Ex.: 12"'))}${F('Período', sel('periodo', [['ano', 'ao ano'], ['mes', 'ao mês']], 'ano'))}</div></div>
      <p class="hint" id="mth"></p>
      <p class="hint">${novo ? 'Informe o que você já aplicou até hoje. Novos aportes você registra depois, no próprio card.' : 'Os aportes e resgates já registrados continuam somando a estes valores.'}</p>
      ${F('Data de início', inp('data', ini.dataInicio || hoje(), 'type="date"'))}
      <label class="f"><span><input type="checkbox" name="ativo" ${ini.ativo !== false ? 'checked' : ''}> Investimento ativo (desmarque ao encerrar)</span></label>
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    const modoEl = s.$('[name=modo]');
    const aj = () => {
      const tx = modoEl.value === 'taxa';
      s.$('#mmw').hidden = tx; s.$('#mtw').hidden = !(tx && !eraTaxa);
      s.$('#mth').textContent = tx ? (eraTaxa ? `Taxa atual: ${taxaTxt(t0)}. Para mudar a taxa daqui para frente, use "Alterar taxa" no card.` : 'O valor atual passa a ser calculado com juros compostos desde a data de início (sem IR/IOF, 365 dias corridos). Depois você pode mudar a taxa ao longo do tempo.') : (eraTaxa ? 'Ao voltar para manual, o valor atual calculado hoje vira o valor informado.' : '');
    };
    modoEl.onchange = aj; aj();
    const liqEl = s.$('[name=liquidez]'), ajL = () => { s.$('#lvw').hidden = liqEl.value !== 'venc'; };
    liqEl.onchange = ajL; ajL();
    if (!novo) s.$('[data-del]').onclick = async () => {
      if (!(await confirmar(`Excluir o investimento "${i.nome}"?`))) return;
      const pos = X().investimentos.indexOf(i);
      X().investimentos = X().investimentos.filter(x => x !== i); s.fechar(); commit();
      toast('Investimento excluído', () => { X().investimentos.splice(Math.min(pos, X().investimentos.length), 0, i); commit(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), ini2 = v.inicial.trim() ? num(v.inicial) : 0, atu = v.atual.trim() ? num(v.atual) : NaN;
      if (!v.nome.trim()) return toast('Informe o nome do investimento.');
      if (isNaN(ini2) || ini2 < 0) return toast('Valor investido inválido.');
      if (v.atual.trim() && (isNaN(atu) || atu < 0)) return toast('Valor atual inválido.');
      if (!dataOk(v.data)) return toast('Informe uma data válida.');
      if (v.liquidez === 'venc' && !dataOk(v.vencimento)) return toast('Informe a data de vencimento.');
      const taxaOn = v.modo === 'taxa', tx = num(v.taxa);
      if (taxaOn && !eraTaxa && (isNaN(tx) || tx <= -100)) return toast('Informe a taxa de juros (%).');
      const dados = { nome: v.nome.trim(), tipo: v.tipo, instituicao: v.instituicao.trim(), valorInicial: r2(ini2), dataInicio: v.data, ativo: v.ativo, modo: taxaOn ? 'taxa' : 'manual', liquidez: v.liquidez, vencimento: v.liquidez === 'venc' ? v.vencimento : '' };
      const novaTaxa = taxaOn && !eraTaxa ? [{ desde: v.data, taxa: tx, periodo: v.periodo }] : null;
      if (novo) X().investimentos.push({ id: uid('inv'), ...dados, valorAtual: r2(isNaN(atu) ? ini2 : atu), dataAtualizacao: hoje(), aportes: [], taxas: novaTaxa || [] });
      else {
        const calc = invVal(i);                                     // valor atual antes de mexer (para quem sai do modo taxa)
        Object.assign(i, dados);
        if (novaTaxa) i.taxas = novaTaxa;
        if (!taxaOn) {
          if (eraTaxa) { i.valorAtual = isNaN(atu) ? calc : r2(atu); i.dataAtualizacao = hoje(); }
          else if (!isNaN(atu) && r2(atu) !== N(i.valorAtual)) { i.valorAtual = r2(atu); i.dataAtualizacao = hoje(); }
        }
      }
      s.fechar(); commit();
    };
  }

  function formMov(i, pre = {}) {
    let tipo = 'aporte';
    const contas = DB.fin.contas.filter(c => c.ativa !== false);
    const s = sheet('Movimentar · ' + i.nome, `
      <div class="tg" style="grid-template-columns:repeat(3,1fr)"><button data-t="aporte">Aporte</button><button data-t="resgate">Resgate</button><button data-t="rendimento">Rendimento</button></div>
      <div class="g2">${F('Valor (R$)', inp('valor', pre.valor ? numStr(pre.valor) : '', 'inputmode="decimal" placeholder="0,00"'))}${F('Data', inp('data', pre.data || hoje(), 'type="date"'))}</div>
      ${F('Lançar nas contas (opcional)', sel('contaId', [['', 'Não lançar'], ...contas.map(c => [c.id, c.nome])], pre.contaId || ''))}
      <label class="f" id="rdw" hidden><span><input type="checkbox" name="reduz" checked> Saiu do valor do investimento</span></label>
      <p class="hint" id="mh"></p>
      ${F('Observação (opcional)', inp('obs', ''))}
      <div class="acts"><button class="btn" data-ok>Salvar</button></div>`);
    const dica = () => {
      const v = vals(s.el); let t = tipo === 'aporte' ? 'Escolhendo uma conta, o aporte também sai do saldo dela (categoria Investimentos).' : tipo === 'rendimento' ? 'O rendimento entra na conta como Entrada (categoria Rendimentos). Desmarque a caixa se ele foi pago à parte (ex.: dividendos) e o valor do investimento não diminui.' : 'Escolhendo uma conta, o resgate também entra no saldo dela (categoria Investimentos).'; s.$('#rdw').hidden = tipo !== 'rendimento';
      if ((tipo === 'resgate' || (tipo === 'rendimento' && v.reduz)) && v.contaId && dataOk(v.data)) { const dc = dataCredito(i, v.data); if (dc > v.data) t = `Pela liquidez (${liqNome(i.liquidez)}), o dinheiro cai na conta em ${fmtData(dc)}${dc > hoje() ? ' e fica em "A receber" até lá' : ''}.`; }
      s.$('#mh').textContent = t;
    };
    const pintar = () => { s.$$('.tg button').forEach(b => { const on = b.dataset.t === tipo; b.classList.toggle('on', on); b.classList.toggle('s', on && tipo !== 'aporte'); }); dica(); };
    s.$$('.tg button').forEach(b => b.onclick = () => { tipo = b.dataset.t; pintar(); });
    s.$('[name=data]').onchange = dica; s.$('[name=contaId]').onchange = dica; s.$('[name=reduz]').onchange = dica;
    pintar();
    s.$('[data-ok]').onclick = async () => {
      const v = vals(s.el), valor = num(v.valor);
      if (!(valor > 0)) return toast('Informe um valor maior que zero.');
      if (!dataOk(v.data)) return toast('Informe uma data válida.');
      if (tipo === 'resgate' && i.liquidez === 'venc' && dataOk(i.vencimento) && v.data < i.vencimento && !(await dialog(`Este investimento só tem liquidez no vencimento (${fmtData(i.vencimento)}/${i.vencimento.slice(2, 4)}). Registrar o resgate mesmo assim?`, ['Cancelar', 'Registrar']) === 1)) return;
      if (tipo === 'resgate' && valor > invVal(i) + 0.005) return toast('O resgate é maior que o valor atual do investimento.');
      if (tipo === 'rendimento') {
        if (!v.contaId) return toast('Escolha a conta que recebeu o rendimento.');
        if (v.reduz && valor > invDisponivel(i) + 0.005) return toast(`O rendimento disponível dentro do investimento é ${dinheiro(Math.max(0, invDisponivel(i)))}.`);
      }
      const sg = tipo === 'aporte' ? 1 : -1, mov = { id: uid('mv'), data: v.data, valor: r2(sg * valor), obs: v.obs.trim() }, semMov = tipo === 'rendimento' && !v.reduz, catTx = tipo === 'rendimento' ? 'Rendimentos' : 'Investimentos';
      if (tipo === 'rendimento') mov.rend = true;
      if (pre.planoData && tipo === 'aporte') mov.planoData = pre.planoData;      // marca a data do plano como feita
      if (v.contaId) {
        const tp = tipo === 'aporte' ? 'saida' : 'entrada', cats = DB.fin.categorias[tp];
        if (!cats.includes(catTx)) cats.push(catTx);
        const dc = tp === 'entrada' && !semMov ? dataCredito(i, v.data) : v.data;      // resgate: o dinheiro só cai na conta depois da liquidez
        const tx = { id: uid('tx'), data: dc, tipo: tp, categoria: catTx, descricao: (tipo === 'aporte' ? 'Aporte · ' : tipo === 'rendimento' ? 'Rendimento · ' : 'Resgate · ') + i.nome, valor: r2(valor), status: tp === 'saida' ? 'pago' : (dc > hoje() ? 'pendente' : 'recebido'), contaId: v.contaId, invId: i.id };
        DB.fin.tx.push(tx); if (!semMov) mov.txId = tx.id;
      }
      if (!semMov) (i.aportes = i.aportes || []).push(mov);
      if (!semMov && i.modo !== 'taxa') i.valorAtual = r2(N(i.valorAtual) + mov.valor);   // manual: o dinheiro que entrou/saiu muda o valor atual na mesma medida; por taxa, o cálculo já considera
      s.fechar(); commit(); toast(tipo === 'aporte' ? 'Aporte registrado.' : tipo === 'rendimento' ? 'Rendimento registrado em Entradas.' : 'Resgate registrado.');
    };
  }

  function formPlano(i) {
    const pl = i.plano || { valor: '', inicio: hoje(), fim: '', contaId: '', ativo: true }, contas = DB.fin.contas.filter(c => c.ativa !== false || c.id === pl.contaId);
    const s = sheet('Plano mensal · ' + i.nome, `
      <p class="hint" style="margin-top:0">Cada mês vira um lançamento em A pagar (categoria Investimentos). Confirme com um toque; para ignorar só um mês use Pular ou exclua o lançamento com “Só este”.</p>
      <div class="g2">${F('Valor por mês (R$)', inp('valor', numStr(pl.valor), 'inputmode="decimal" placeholder="0,00"'))}${F('Primeiro aporte em', inp('inicio', pl.inicio, 'type="date"'))}</div>
      ${F('Até (opcional)', inp('fim', pl.fim || '', 'type="date"'))}
      ${F('Sai de qual conta', sel('contaId', contas.map(c => [c.id, c.nome]), pl.contaId || principal()))}
      <p class="hint">Os aportes aparecem como saídas pendentes em Lançamentos e A pagar e entram na Previsão. Os meses seguintes repetem o dia do primeiro aporte (12 meses ficam lançados à frente).</p>
      <label class="f"><span><input type="checkbox" name="ativo" ${pl.ativo !== false ? 'checked' : ''}> Plano ativo</span></label>
      <div class="acts">${i.plano ? '<button class="btn bad" data-del>Remover plano</button>' : ''}<button class="btn" data-ok>Salvar</button></div>`);
    if (i.plano) s.$('[data-del]').onclick = async () => {
      if (!(await confirmar('Remover o plano mensal? Os próximos aportes pendentes serão excluídos. Os já confirmados continuam.', 'Remover'))) return;
      const ant = i.plano, fut = txPlano(i).filter(t => t.status === 'pendente' && t.data >= hoje()), ids = new Set(fut.map(t => t.id));
      DB.fin.tx = DB.fin.tx.filter(t => !ids.has(t.id)); delete i.plano; s.fechar(); commit();
      toast(fut.length ? `Plano removido · ${fut.length} aporte${fut.length > 1 ? 's' : ''} futuro${fut.length > 1 ? 's' : ''} excluído${fut.length > 1 ? 's' : ''}` : 'Plano removido', () => { i.plano = ant; DB.fin.tx.push(...fut); commit(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), valor = num(v.valor);
      if (!(valor > 0)) return toast('Informe o valor mensal.');
      if (!dataOk(v.inicio)) return toast('Informe a data do primeiro aporte.');
      if (v.fim && (!dataOk(v.fim) || v.fim < v.inicio)) return toast('A data final deve ser depois do primeiro aporte.');
      i.plano = { valor: r2(valor), inicio: v.inicio, fim: v.fim || '', contaId: v.contaId || principal(), ativo: v.ativo, pulados: (i.plano && i.plano.pulados) || [] };
      txPlano(i).filter(t => t.status === 'pendente' && t.data >= hoje()).forEach(t => { t.valor = r2(valor); t.contaId = i.plano.contaId; });   // próximos já lançados seguem o novo valor/conta
      sincPlanos(); s.fechar(); commit();
    };
  }

  function formTaxa(i) {
    const t = taxaVigente(i);
    const s = sheet('Alterar taxa · ' + i.nome, `
      <p class="hint" style="margin-top:0">Taxa atual: <b>${t ? taxaTxt(t) : '—'}</b>. A nova taxa vale <b>só a partir da data escolhida</b>; o que já rendeu até lá continua calculado com a taxa antiga.</p>
      <div class="g2">${F('Nova taxa (%)', inp('taxa', '', 'inputmode="decimal" placeholder="Ex.: 10,5"'))}${F('Período', sel('periodo', [['ano', 'ao ano'], ['mes', 'ao mês']], t ? t.periodo : 'ano'))}</div>
      ${F('Vale a partir de', inp('data', hoje(), 'type="date"'))}
      <p class="hint" id="th"></p>
      <div class="acts"><button class="btn" data-ok>Salvar taxa</button></div>`);
    const dica = () => { const v = vals(s.el); s.$('#th').textContent = dataOk(v.data) && v.data > hoje() ? 'Data futura: a mudança fica agendada e entra na projeção.' : ''; };
    s.$('[name=data]').onchange = dica;
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), tx = num(v.taxa);
      if (isNaN(tx) || tx <= -100) return toast('Informe a taxa (%).');
      if (!dataOk(v.data)) return toast('Informe uma data válida.');
      if (v.data < i.dataInicio) return toast('A data não pode ser anterior ao início do investimento.');
      i.taxas = (i.taxas || []).filter(x => x.desde !== v.data); i.taxas.push({ desde: v.data, taxa: tx, periodo: v.periodo });
      s.fechar(); commit(); toast('Taxa alterada a partir de ' + fmtData(v.data) + '.');
    };
  }

  function formValorInv(i) {
    const s = sheet('Atualizar valor · ' + i.nome, `
      <p class="hint" style="margin-top:0">Informe quanto o investimento vale hoje (veja no app do banco ou da corretora). O rendimento é recalculado.</p>
      <div class="g2">${F('Valor atual (R$)', inp('valor', numStr(i.valorAtual), 'inputmode="decimal" placeholder="0,00"'))}${F('Data', inp('data', hoje(), 'type="date"'))}</div>
      <div class="acts"><button class="btn" data-ok>Atualizar</button></div>`);
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), valor = num(v.valor);
      if (isNaN(valor) || valor < 0) return toast('Informe um valor válido.');
      if (!dataOk(v.data)) return toast('Informe uma data válida.');
      i.valorAtual = r2(valor); i.dataAtualizacao = v.data;
      s.fechar(); commit();
    };
  }

  /* =========================================================
     SIMULADOR DE INVESTIMENTO
     Juros compostos mensais; aporte feito no fim de cada mês.
     ========================================================= */
  const SIM = { base: '', inicial: '', mensal: '', taxa: '10', per: 'ano', prazo: '10', un: 'anos', reaj: '', infl: '', ir: '', meta: '' };
  const durTxt = m => { const a = Math.floor(m / 12), r = m % 12; return [a ? `${a} ${a === 1 ? 'ano' : 'anos'}` : '', r ? `${r} ${r === 1 ? 'mês' : 'meses'}` : ''].filter(Boolean).join(' e ') || '0 meses'; };
  function simCalc(p, meses) {                               // devolve a série mês a mês
    let saldo = p.ini, inv = p.ini, ap = p.mensal; const S = [{ saldo, inv }];
    for (let m = 1; m <= meses; m++) {
      saldo *= 1 + p.rm;
      if (m > 1 && (m - 1) % 12 === 0) ap *= 1 + p.reaj;
      saldo += ap; inv += ap; S.push({ saldo, inv });
    }
    return S;
  }
  function graf2(S) {
    const W = 320, H = 150, L = 8, R = 8, T = 10, B = 22, passo = Math.max(1, Math.ceil((S.length - 1) / 60)), P = S.filter((x, i) => i % passo === 0 || i === S.length - 1);
    const n = P.length, mx = Math.max(1, ...P.map(x => x.saldo)), X = i => L + i * (W - L - R) / Math.max(1, n - 1), Y = v => T + (1 - v / mx) * (H - T - B), base = H - B;
    const linha = k => P.map((x, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(x[k]).toFixed(1)).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block" role="img" aria-label="Evolução do investimento">
      <path d="${linha('saldo')} L${X(n - 1).toFixed(1)},${base} L${L},${base} Z" fill="var(--cor)" fill-opacity=".12"/>
      <path d="${linha('saldo')}" fill="none" stroke="var(--cor)" stroke-width="2"/>
      <path d="${linha('inv')}" fill="none" stroke="var(--mu)" stroke-width="1.5" stroke-dasharray="4 3"/>
      <text x="${L}" y="${H - 6}" font-size="10" fill="var(--mu)">Hoje</text><text x="${W - R}" y="${H - 6}" font-size="10" fill="var(--mu)" text-anchor="end">${durTxt(S.length - 1)}</text></svg>`;
  }
  function rSim(el) {
    const S0 = SIM, avancado = !!(S0.reaj || S0.infl || S0.ir || S0.meta);
    el.innerHTML = `<div class="card"><h3>Simulador de investimento</h3>
      ${invAtivos().length ? F('Partir de', sel('base', [['', 'Do zero'], ...invAtivos().map(i => [i.id, i.nome])], S0.base)) : ''}
      <div class="g2">${F('Valor inicial (R$)', inp('inicial', S0.inicial, 'inputmode="decimal" placeholder="0,00"'))}${F('Aporte mensal (R$)', inp('mensal', S0.mensal, 'inputmode="decimal" placeholder="0,00"'))}</div>
      <div class="g2">${F('Taxa (%)', inp('taxa', S0.taxa, 'inputmode="decimal" placeholder="Ex.: 10"'))}${F('Período da taxa', sel('per', [['ano', 'ao ano'], ['mes', 'ao mês']], S0.per))}</div>
      <div class="g2">${F('Prazo', inp('prazo', S0.prazo, 'type="number" min="1" inputmode="numeric"'))}${F('Unidade', sel('un', [['anos', 'anos'], ['meses', 'meses']], S0.un))}</div>
      <details${avancado ? ' open' : ''}><summary class="mu sm" style="margin-bottom:8px">Opções avançadas</summary>
        <div class="g2">${F('Reajuste anual do aporte (%)', inp('reaj', S0.reaj, 'inputmode="decimal" placeholder="0"'))}${F('Inflação anual (%)', inp('infl', S0.infl, 'inputmode="decimal" placeholder="0"'))}</div>
        <div class="g2">${F('IR sobre o rendimento (%)', inp('ir', S0.ir, 'inputmode="decimal" placeholder="Ex.: 15"'))}${F('Meta (R$)', inp('meta', S0.meta, 'inputmode="decimal" placeholder="Ex.: 100000"'))}</div></details>
    </div><div id="sim-r"></div>`;
    const calc = () => {
      const v = vals(el); Object.keys(SIM).forEach(k => { if (v[k] !== undefined) SIM[k] = v[k]; });
      const out = $('#sim-r', el), N0 = x => { const n = String(x).trim() ? num(x) : 0; return isNaN(n) ? NaN : n; };
      const ini = N0(v.inicial), mensal = N0(v.mensal), taxa = N0(v.taxa), reaj = N0(v.reaj) / 100, infl = N0(v.infl) / 100, ir = N0(v.ir) / 100, alvo = N0(v.meta);
      let meses = Math.round(num(v.prazo)) * (v.un === 'anos' ? 12 : 1);
      if ([ini, mensal, taxa, reaj, infl, ir, alvo].some(isNaN) || ini < 0 || mensal < 0) { out.innerHTML = '<div class="empty">Confira os valores digitados.</div>'; return; }
      if (!(meses >= 1)) { out.innerHTML = '<div class="empty">Informe o prazo.</div>'; return; }
      meses = Math.min(1200, meses);
      if (!(ini > 0 || mensal > 0)) { out.innerHTML = '<div class="empty">Informe um valor inicial ou um aporte mensal.</div>'; return; }
      const r = taxa / 100, rm = v.per === 'mes' ? r : Math.pow(1 + r, 1 / 12) - 1, par = { ini, mensal, rm, reaj };
      const S = simCalc(par, meses), f = S[meses], juros = r2(f.saldo - f.inv), irV = r2(Math.max(0, juros) * ir), liq = r2(f.saldo - irV);
      const real = infl > 0 ? r2(liq / Math.pow(1 + infl, meses / 12)) : null;
      let metaHtml = '';
      if (alvo > 0) {
        const L = simCalc(par, 1200), hit = L.findIndex(x => x.saldo >= alvo);
        const fim = ap => simCalc({ ...par, mensal: ap }, meses)[meses].saldo;
        let precisa = null;
        if (fim(0) >= alvo) precisa = 0; else { let lo = 0, hi = alvo; for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (fim(mid) >= alvo) hi = mid; else lo = mid; } precisa = Math.ceil(hi * 100) / 100; }
        metaHtml = `<div class="card"><h3>Meta de ${dinheiro(alvo)}<span class="n ${hit >= 0 && hit <= meses ? 'pos' : ''}">${hit >= 0 && hit <= meses ? 'atinge' : 'não atinge'}</span></h3>
          <p class="sm" style="margin:4px 0">${hit < 0 ? 'Com esses valores a meta não é atingida em 100 anos.' : hit <= meses ? `Com esses valores você chega lá em <b>${durTxt(hit)}</b> (valor bruto).` : `Com esses valores você chega lá em <b>${durTxt(hit)}</b>, depois do prazo simulado.`}</p>
          <p class="sm" style="margin:4px 0">${precisa === 0 ? 'Só o valor inicial já chega à meta no prazo.' : `Para chegar em ${durTxt(meses)} você precisa aportar cerca de <b>${dinheiro(precisa)}</b> por mês${mensal > 0 ? ` (simulado: ${dinheiro(mensal)})` : ''}.`}</p></div>`;
      }
      const anos = []; for (let y = 1; y <= Math.ceil(meses / 12); y++) { const x = S[Math.min(y * 12, meses)]; anos.push(`<div class="row"><div class="t"><b>${y * 12 > meses ? durTxt(meses) : y === 1 ? '1 ano' : y + ' anos'}</b><small>investido ${dinheiro(r2(x.inv))} · juros ${dinheiro(r2(x.saldo - x.inv))}</small></div><span class="n">${dinheiro(r2(x.saldo))}</span></div>`); }
      out.innerHTML = `<div class="card"><small class="mu">${ir > 0 ? 'Valor final líquido' : 'Valor final'} em ${durTxt(meses)}</small><div class="big">${dinheiro(liq)}</div>
          ${real !== null ? `<small class="mu">Em poder de compra de hoje: <b>${dinheiro(real)}</b></small>` : ''}</div>
        <div class="sum"><div><small>Investido</small><b class="n">${dinheiro(r2(f.inv))}</b></div><div><small>Juros</small><b class="n pos">${dinheiro(juros)}</b></div><div><small>${ir > 0 ? 'IR estimado' : 'Total'}</small><b class="n ${ir > 0 ? 'neg' : ''}">${dinheiro(ir > 0 ? irV : r2(f.saldo))}</b></div></div>
        <div class="card"><div class="lg" style="display:flex;gap:14px;margin-bottom:6px"><small class="mu"><i style="display:inline-block;width:10px;height:3px;background:var(--cor);margin-right:5px;vertical-align:middle"></i>Total</small><small class="mu"><i style="display:inline-block;width:10px;height:0;border-top:2px dashed var(--mu);margin-right:5px;vertical-align:middle"></i>Investido</small></div>${graf2(S)}
          <p class="mu sm" style="margin:8px 0 0">Juros compostos mensais, com o aporte no fim de cada mês${taxa && v.per === 'ano' ? ` (taxa equivalente de ${(rm * 100).toFixed(3).replace('.', ',')}% ao mês)` : ''}. É uma estimativa: taxas reais variam.</p></div>
        ${metaHtml}
        <details class="card"><summary class="sm"><b>Evolução ano a ano</b></summary><div style="padding:2px 0">${anos.join('')}</div></details>`;
    };
    $$('input,select', el).forEach(e => {
      e.oninput = calc;
      e.onchange = () => {
        if (e.name === 'base') {
          const i = invAtivos().find(x => x.id === e.value), t = i && i.modo === 'taxa' ? taxaVigente(i) : null;
          if (i) { SIM.inicial = numStr(r2(invVal(i))); if (planoAtivo(i)) SIM.mensal = numStr(N(i.plano.valor)); if (t) { SIM.taxa = numStr(N(t.taxa)); SIM.per = t.periodo === 'mes' ? 'mes' : 'ano'; } }
          ['inicial', 'mensal', 'taxa', 'per'].forEach(k => { const c = $(`[name=${k}]`, el); if (c) c.value = SIM[k]; });
        }
        calc();
      };
    });
    calc();
  }

  /* ---------- resumos lidos pelos widgets (somente leitura) ---------- */
  E.resumo = {
    cartoes: () => X().cartoes.filter(c => c.ativo !== false).map(c => ({ nome: c.nome || 'Cartão', limite: N(c.limite), usado: comprometido(c), fatura: faturaAtual(c) })),
    dividas: () => dividasAtivas().map(d => ({ descricao: d.descricao, saldo: N(d.valorPrincipal), taxa: N(d.taxaJuros), parcela: N(d.parcela) })),
    investimentos: () => invAtivos().map(i => ({ nome: i.nome, tipo: i.tipo, atual: invVal(i), aplicado: invLiquido(i), lucro: invLucro(i) })),
    metas: () => X().metas.map(m => ({ nome: m.nome, atual: metaAtual(m), alvo: N(m.valorAlvo), prazo: m.prazo && dataOk(m.prazo) ? m.prazo : '' }))
  };

  /* ---------- registro das telas ---------- */
  E.cart = { render: rCart, fab: () => () => formCompra(), fabLabel: () => 'Nova compra no cartão' };
  E.prev = { render: rPrev };
  E.metas = { render: rMetas, fab: () => () => formMeta(null), fabLabel: () => 'Nova meta' };
  E.sim = { render: rSim };
  E.inv = { render: rInv, fab: () => () => formInv(null), fabLabel: () => 'Novo investimento' };
  E.div = { render: rDiv, fab: () => () => formDivida(null), fabLabel: () => 'Nova dívida' };
})();
