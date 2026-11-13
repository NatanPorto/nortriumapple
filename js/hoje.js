'use strict';
/* =========================================================
   HOJE — painel que junta o dia de todos os módulos
   ========================================================= */
const Hoje = (() => {
  const saudacao = () => { const h_ = new Date().getHours(); return h_ < 12 ? 'Bom dia' : h_ < 18 ? 'Boa tarde' : 'Boa noite'; };
  const svg = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[n] || ''}</svg>`;
  const card = (mod, cor, titulo, corpo, ic) => `<div class="card" style="--mc:${cor}"><h3><span class="ci">${svg(ic || mod)}</span>${titulo}<a href="#" data-ir="${mod}">Abrir</a></h3>${corpo}</div>`;
  const ICONE_K = { evento: 'agenda', aula: 'estudo', treino: 'treino', tarefa: 'trab', prova: 'estudo', conta: 'fin' };

  /* quanto do dia já foi feito: eventos, aulas, treinos e tarefas de trabalho */
  function progressoDoDia(hj) {
    const itens = Agenda.itensDoDia(hj).filter(i => ['evento', 'aula', 'treino'].includes(i.k));
    let total = itens.length, feitos = itens.filter(i => i.feito).length;
    const tarefas = abaOn('trab') ? DB.trabalho.tarefas : [];
    const pend = tarefas.filter(t => !t.feito && t.prazo && t.prazo <= hj).length;
    const fechadas = tarefas.filter(t => t.feito && t.feitoEm === hj).length;
    total += pend + fechadas; feitos += fechadas;
    const comp = itens.filter(i => i.k === 'evento' || i.k === 'aula').length;
    return { total, feitos, pct: total ? Math.round(feitos / total * 100) : 0, comp };
  }
  const anel = pct => { const R = 40, C = 2 * Math.PI * R; return `<div class="ring"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="${R}"/><circle class="fg" cx="50" cy="50" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}"/></svg><b>${pct}%</b></div>`; };

  /* =========================================================
     DASHBOARD — visão geral de todas as áreas na tela inicial
     ========================================================= */
  const fmtAgua = ml => ml >= 1000 ? (ml / 1000).toFixed(1).replace('.', ',') + ' L' : Math.round(ml) + ' ml';
  const rot7 = d => DIAS[pd(d).getDay()].slice(0, 1);

  /* barras simples (uma série) com linha de meta opcional */
  function barras(vals, rots, cor, meta, fmt, nome) {
    const W = 300, H = 86, base = 66, n = vals.length, bw = W / n, mx = Math.max(...vals, meta || 0, 1);
    const alt = v => v / mx * (base - 14);
    const ml = meta ? `<line x1="0" x2="${W}" y1="${(base - alt(meta)).toFixed(1)}" y2="${(base - alt(meta)).toFixed(1)}" stroke="var(--mu)" stroke-width="1" stroke-dasharray="4 4" opacity=".7"/>` : '';
    const bs = vals.map((v, i) => {
      const hh = alt(v), x = i * bw + bw * .2, w = bw * .6, ult = i === n - 1;
      return `<rect x="${x.toFixed(1)}" y="${(base - hh).toFixed(1)}" width="${w.toFixed(1)}" height="${(v ? Math.max(hh, 2) : 0).toFixed(1)}" rx="3" fill="${cor}" opacity="${ult ? 1 : .55}"/>` +
        (v && (ult || n <= 7) ? `<text x="${(x + w / 2).toFixed(1)}" y="${(base - hh - 3).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="${ult ? cor : 'var(--mu)'}" font-weight="${ult ? 700 : 400}">${fmt(v)}</text>` : '') +
        `<text x="${(x + w / 2).toFixed(1)}" y="80" text-anchor="middle" font-size="10" fill="var(--mu)">${rots[i]}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(nome)}">${ml}${bs}</svg>`;
  }
  /* barras agrupadas (duas séries): entradas x saídas */
  function barras2(a, b, rots, ca, cb, nome) {
    const W = 300, H = 86, base = 66, n = a.length, bw = W / n, mx = Math.max(...a, ...b, 1);
    const alt = v => v / mx * (base - 8);
    const bs = a.map((_, i) => {
      const x = i * bw + bw * .12, w = bw * .38;
      return `<rect x="${x.toFixed(1)}" y="${(base - alt(a[i])).toFixed(1)}" width="${w.toFixed(1)}" height="${(a[i] ? Math.max(alt(a[i]), 2) : 0).toFixed(1)}" rx="3" fill="${ca}"/>` +
        `<rect x="${(x + w + 2).toFixed(1)}" y="${(base - alt(b[i])).toFixed(1)}" width="${w.toFixed(1)}" height="${(b[i] ? Math.max(alt(b[i]), 2) : 0).toFixed(1)}" rx="3" fill="${cb}"/>` +
        `<text x="${(i * bw + bw / 2).toFixed(1)}" y="80" text-anchor="middle" font-size="10" fill="var(--mu)">${rots[i]}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(nome)}">${bs}</svg>`;
  }
  const kpi = (ir, cor, rotulo, valor, sub, pct, ar) => `<button class="kpi" ${ar ? `data-ar="${ar}"` : `data-ir="${ir}"`} style="--mc:${cor}"><small>${rotulo}</small><b>${valor}</b><small>${sub}</small>${pct == null ? '' : `<div class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`}</button>`;
  const gcard = (cor, titulo, corpo, ir) => `<div class="card" style="--mc:${cor}"><h3>${titulo}${ir ? `<a href="#" data-ir="${ir}">Abrir</a>` : ''}</h3>${corpo}</div>`;

  function dashboard() {
    const hj = hoje(), mes = hj.slice(0, 7), dias7 = Array.from({ length: 7 }, (_, i) => addDias(hj, i - 6)), rots = dias7.map(rot7);
    const ini7 = dias7[0], iniSem = inicioSemana(hj), tx = DB.fin.tx;
    const porDia = (lista, f) => dias7.map(d => lista.filter(x => x.data === d).reduce((t, x) => t + f(x), 0));

    /* ---- finanças ---- */
    const mesTx = tx.filter(t => t.data.startsWith(mes));
    const ent = soma(mesTx.filter(t => t.tipo === 'entrada').map(t => t.valor)), sai = soma(mesTx.filter(t => t.tipo === 'saida').map(t => t.valor));
    const gastoCat = {}; mesTx.filter(t => t.tipo === 'saida').forEach(t => { gastoCat[t.categoria] = r2((gastoCat[t.categoria] || 0) + t.valor); });
    const orc = DB.fin.orcamentos || {}, catsOrc = Object.keys(orc).filter(c => Number(orc[c]) > 0);
    const limTot = soma(catsOrc.map(c => Number(orc[c]))), gasOrc = soma(catsOrc.map(c => gastoCat[c] || 0));
    const pend = Fin.pendentes().filter(t => t.tipo === 'saida'), venc = pend.filter(t => t.data < hj), prox = pend.filter(t => t.data >= hj && diasEntre(hj, t.data) <= 7);
    const vencV = soma(venc.map(t => t.valor)), aPagar = soma([...venc, ...prox].map(t => t.valor));
    const diasRest = new Date(pd(hj).getFullYear(), pd(hj).getMonth() + 1, 0).getDate() - pd(hj).getDate();

    /* ---- saúde ---- */
    const nTre = Treinos.treinosNaSemana(), prevTre = DB.treino.fichas.reduce((a, f) => a + (f.dias || []).length, 0);
    const ml = Saude.mlDia(hj), metaMl = Number(DB.agua.meta) || 0;
    const rd = Saude.resumoDia(hj), kcal = Math.round(rd.kcal || 0), metaKcal = Number(DB.dieta.metas.kcal) || 0;
    const pesos = [...DB.treino.medidas].filter(m => m.peso).sort((a, b) => a.data.localeCompare(b.data));
    const pesoU = pesos[pesos.length - 1], pesoP = pesos.length > 1 ? pesos[pesos.length - 2] : null;

    /* ---- estudos e trabalho ---- */
    const minEs = Estudos.minHoje(), minEsSem = Estudos.minSemana(), pe = Estudos.pend(), prova = Estudos.proximos(30)[0];
    const hrs = DB.trabalho.horas, minTrHoje = Trabalho.minHoje(), minTrSem = hrs.filter(x => x.data >= iniSem).reduce((t, x) => t + x.min, 0);
    const abertas = DB.trabalho.tarefas.filter(t => !t.feito), atras = Trabalho.tarefasUrgentes();

    /* ---- consistência (últimos 5 semanas) ---- */
    const setD = l => new Set(l.map(x => x.data));
    const nada = new Set(), sTre = abaOn('treino') ? setD(DB.treino.sessoes) : nada, sEst = abaOn('estudo') ? setD(DB.estudo.sessoes) : nada, sTra = abaOn('trab') ? setD(hrs) : nada, sFin = abaOn('fin') ? setD(tx.filter(t => t.status !== 'pendente')) : nada;
    const score = d => (sTre.has(d) ? 1 : 0) + (sEst.has(d) ? 1 : 0) + (sTra.has(d) ? 1 : 0) + (sFin.has(d) ? 1 : 0) + (abaOn('treino') && metaMl && Saude.mlDia(d) >= metaMl ? 1 : 0) + (abaOn('treino') && Saude.resumoDia(d).refeicoes ? 1 : 0);
    const ini35 = addDias(iniSem, -28), cel = Array.from({ length: 35 }, (_, i) => addDias(ini35, i));
    const sc = {}; cel.forEach(d => { if (d <= hj) sc[d] = score(d); });
    let seq = 0, d0 = (sc[hj] || 0) > 0 ? hj : addDias(hj, -1);
    for (let i = 0; i < 60; i++, d0 = addDias(d0, -1)) { const v = d0 in sc ? sc[d0] : score(d0); if (v > 0) seq++; else break; }
    const ativos = cel.filter(d => d <= hj && sc[d] > 0).length, tot = cel.filter(d => d <= hj).length;

    /* ---- tiles ---- */
    const tiles = [
      abaOn('fin') && kpi('fin', 'var(--c-fin)', 'Saldo nas contas', dinheiro(Fin.saldoTotal()), `Mês: ${dinheiro(r2(ent - sai))}`),
      abaOn('fin') && (limTot ? kpi('fin', 'var(--c-fin)', 'Orçamento do mês', dinheiro(gasOrc), `de ${dinheiro(limTot)} · ${Math.round(gasOrc / limTot * 100)}%`, gasOrc / limTot * 100)
             : kpi('fin', 'var(--c-fin)', 'Gastos do mês', dinheiro(sai), `Entradas ${dinheiro(ent)}`)),
      abaOn('fin') && kpi('fin', venc.length ? 'var(--c-treino)' : 'var(--c-fin)', 'A pagar (7 dias)', dinheiro(aPagar), venc.length ? `${venc.length} vencida${venc.length > 1 ? 's' : ''} · ${dinheiro(vencV)}` : `${prox.length} conta${prox.length === 1 ? '' : 's'}`),
      abaOn('treino') && kpi('treino', 'var(--c-treino)', 'Treinos na semana', prevTre ? `${nTre}/${prevTre}` : String(nTre), prevTre ? (nTre >= prevTre ? 'meta batida' : `faltam ${prevTre - nTre}`) : 'sem meta nas fichas', prevTre ? nTre / prevTre * 100 : null),
      abaOn('treino') && kpi('treino', 'var(--c-agua)', 'Água hoje', fmtAgua(ml), metaMl ? `meta ${fmtAgua(metaMl)}` : 'sem meta definida', metaMl ? ml / metaMl * 100 : null, 'agua'),
      abaOn('treino') && kpi('treino', 'var(--c-dieta)', 'Calorias hoje', `${kcal} kcal`, metaKcal ? `meta ${metaKcal}` : `${rd.refeicoes || 0} refeição(ões)`, metaKcal ? kcal / metaKcal * 100 : null, 'dieta'),
      abaOn('estudo') && kpi('estudo', 'var(--c-estudo)', 'Estudos', dur(minEs), `semana ${dur(minEsSem)}${pe.rev ? ` · ${pe.rev} revisão(ões)` : ''}`),
      abaOn('trab') && kpi('trab', 'var(--c-trab)', 'Trabalho', dur(minTrHoje), `semana ${dur(minTrSem)} · ${abertas.length} aberta${abertas.length === 1 ? '' : 's'}`),
      abaOn('treino') && pesoU ? kpi('treino', 'var(--c-treino)', 'Peso', `${numStr(pesoU.peso)} kg`, pesoP ? `${pesoU.peso - pesoP.peso > 0 ? '+' : pesoU.peso - pesoP.peso < 0 ? '−' : ''}${numStr(Math.abs(Math.round((pesoU.peso - pesoP.peso) * 10) / 10))} kg desde ${fmtData(pesoP.data)}` : fmtData(pesoU.data)) : '',
      abaOn('estudo') && prova ? kpi('estudo', 'var(--c-agenda)', 'Próxima prova/entrega', esc(quando(prova.data)), esc(prova.titulo)) : ''
    ].filter(Boolean).join('');

    /* ---- destaques ---- */
    const dest = [];
    if (abaOn('fin') && venc.length) dest.push(['var(--c-treino)', `${venc.length} conta${venc.length > 1 ? 's' : ''} vencida${venc.length > 1 ? 's' : ''} somando ${dinheiro(vencV)}.`]);
    if (abaOn('fin') && limTot) { const p = Math.round(gasOrc / limTot * 100); dest.push([p > 100 ? 'var(--c-treino)' : 'var(--c-fin)', p > 100 ? `Você estourou o orçamento do mês em ${dinheiro(r2(gasOrc - limTot))}.` : `Você usou ${p}% do orçamento, com ${diasRest} dia${diasRest === 1 ? '' : 's'} até o fim do mês.`]); }
    if (abaOn('treino') && prevTre) dest.push(['var(--c-treino)', nTre >= prevTre ? 'Você fechou os treinos planejados da semana.' : `Faltam ${prevTre - nTre} treino${prevTre - nTre > 1 ? 's' : ''} para fechar a semana.`]);
    if (abaOn('treino') && metaMl) { const m7 = Math.round(dias7.reduce((t, d) => t + Saude.mlDia(d), 0) / 7); dest.push(['var(--c-agua)', ml >= metaMl ? 'Meta de água de hoje batida.' : `Faltam ${fmtAgua(metaMl - ml)} para a meta de água (média dos 7 dias: ${fmtAgua(m7)}).`]); }
    if (abaOn('estudo') && (pe.atras || pe.rev || pe.nota)) dest.push(['var(--c-estudo)', [pe.rev && `${pe.rev} revisã${pe.rev > 1 ? 'ões' : 'o'} para fazer`, pe.atras && `${pe.atras} item(ns) de estudo atrasado(s)`, pe.nota && `${pe.nota} prova${pe.nota > 1 ? 's' : ''} esperando a nota`].filter(Boolean).join(' e ') + '.']);
    if (abaOn('trab') && atras.length) dest.push(['var(--c-trab)', `${atras.length} tarefa${atras.length > 1 ? 's' : ''} de trabalho com prazo hoje ou atrasada${atras.length > 1 ? 's' : ''}.`]);
    if (seq >= 2) dest.push(['var(--c-hoje)', `Sequência de ${seq} dias com algum registro no app.`]);

    /* ---- gráficos ---- */
    const meses6 = Array.from({ length: 6 }, (_, i) => addMeses(mes + '-01', i - 5).slice(0, 7));
    const mEnt = meses6.map(m => soma(tx.filter(t => t.tipo === 'entrada' && t.data.startsWith(m)).map(t => t.valor)));
    const mSai = meses6.map(m => soma(tx.filter(t => t.tipo === 'saida' && t.data.startsWith(m)).map(t => t.valor)));
    const semanas = Array.from({ length: 6 }, (_, i) => addDias(iniSem, (i - 5) * 7));
    const treSem = semanas.map(s => DB.treino.sessoes.filter(x => x.data >= s && x.data < addDias(s, 7)).length);
    const rotSem = semanas.map(s => `${p2(pd(s).getDate())}/${p2(pd(s).getMonth() + 1)}`);
    const k = v => v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : String(Math.round(v));
    const minFmt = v => v >= 60 ? (v / 60).toFixed(1).replace('.', ',') + 'h' : Math.round(v) + 'm';

    const cats = Object.entries(gastoCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const catHtml = cats.map(([c, g]) => { const l = Number(orc[c]) || 0, p = l ? Math.round(g / l * 100) : null, w = l ? Math.min(100, p) : (sai ? Math.round(g / sai * 100) : 0);
      return `<div class="crow"><div><b>${esc(c)}</b><small>${dinheiro(g)}${l ? ` de ${dinheiro(l)} · ${p}%` : sai ? ` · ${Math.round(g / sai * 100)}% dos gastos` : ''}</small></div><div class="bar${p > 100 ? ' red' : ''}"><i style="width:${w}%"></i></div></div>`; }).join('');

    const pesoSvg = (() => {
      const l = pesos.slice(-12); if (l.length < 2) return '';
      const v = l.map(m => m.peso), mn = Math.min(...v), mx = Math.max(...v), W = 300, H = 60, sp = (mx - mn) || 1;
      const pts = l.map((m, i) => `${(i / (l.length - 1) * (W - 8) + 4).toFixed(1)},${(H - 8 - (m.peso - mn) / sp * (H - 16)).toFixed(1)}`).join(' ');
      return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="60" role="img" aria-label="Evolução do peso"><polyline points="${pts}" fill="none" stroke="var(--c-treino)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="mu sm" style="display:flex;justify-content:space-between"><span>${fmtData(l[0].data)} · ${numStr(l[0].peso)} kg</span><span>${fmtData(l[l.length - 1].data)} · ${numStr(l[l.length - 1].peso)} kg</span></div>`;
    })();

    const heat = `<div class="heat">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map(x => `<i class="hd">${x}</i>`).join('')}${cel.map(d => {
      const f = d > hj, v = sc[d] || 0, cor = v ? `color-mix(in srgb,var(--c-hoje) ${Math.min(100, 22 + v * 15)}%,transparent)` : 'var(--ln)';
      return `<i class="hc${d === hj ? ' hj' : ''}" style="background:${cor};${f ? 'opacity:.3' : ''}" title="${fmtDiaCurto(d)}: ${v} área${v === 1 ? '' : 's'}"></i>`; }).join('')}</div>
      <div class="mu sm" style="display:flex;justify-content:space-between;margin-top:8px"><span>${ativos} de ${tot} dias com registro</span><span>Sequência: ${seq} dia${seq === 1 ? '' : 's'}</span></div>`;

    return `<div class="dash">
      <div class="sech"><b>Visão geral</b></div>
      <div class="kpis">${tiles}</div>
      ${dest.length ? gcard('var(--c-hoje)', 'Destaques', dest.map(([c, t]) => `<div class="dst"><i style="background:${c}"></i><span>${esc(t)}</span></div>`).join('')) : ''}
      ${!abaOn('fin') ? '' : gcard('var(--c-fin)', 'Finanças · 6 meses', `<div class="lg"><span><i style="background:var(--c-hoje)"></i>Entradas</span><span><i style="background:var(--c-treino)"></i>Saídas</span></div>${barras2(mEnt, mSai, meses6.map(m => MESES[+m.slice(5) - 1].slice(0, 3)), 'var(--c-hoje)', 'var(--c-treino)', 'Entradas e saídas por mês')}`, 'fin')}
      ${abaOn('fin') && cats.length ? gcard('var(--c-fin)', `Gastos por categoria · ${MESES[+mes.slice(5) - 1].toLowerCase()}`, catHtml, 'fin') : ''}
      ${!(abaOn('estudo') || abaOn('trab') || abaOn('treino')) ? '' : gcard('var(--c-estudo)', 'Últimos 7 dias', `
        ${!abaOn('estudo') ? '' : `<div class="mh">Estudos <small class="mu">${dur(DB.estudo.sessoes.filter(s => s.data >= ini7 && s.data <= hj).reduce((t, s) => t + s.min, 0))} no total</small></div>${barras(porDia(DB.estudo.sessoes, s => s.min), rots, 'var(--c-estudo)', 0, minFmt, 'Estudos por dia')}`}
        ${!abaOn('trab') ? '' : `<div class="mh">Trabalho <small class="mu">${dur(hrs.filter(x => x.data >= ini7).reduce((t, x) => t + x.min, 0))} no total</small></div>${barras(porDia(hrs, s => s.min), rots, 'var(--c-trab)', 0, minFmt, 'Trabalho por dia')}`}
        ${!abaOn('treino') ? '' : `<div class="mh">Água <small class="mu">${metaMl ? 'linha tracejada = meta' : 'defina uma meta em Saúde'}</small></div>${barras(dias7.map(d => Saude.mlDia(d)), rots, 'var(--c-agua)', metaMl, v => v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') : v, 'Água por dia')}`}`)}
      ${!abaOn('treino') ? '' : gcard('var(--c-treino)', 'Treinos por semana', barras(treSem, rotSem, 'var(--c-treino)', prevTre, v => v, 'Treinos por semana'), 'treino')}
      ${abaOn('treino') && pesoSvg ? gcard('var(--c-treino)', 'Evolução do peso', pesoSvg, 'treino') : ''}
      ${gcard('var(--c-hoje)', 'Consistência · 5 semanas', heat)}
    </div>`;
  }

  /* linha do dia: régua das 06h às 24h com os compromissos, o que já passou apagado e um traço em "agora" */
  function linhaDoDia(hj) {
    const re = /^\d{2}:\d{2}$/, mm = t => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
    const its = Agenda.itensDoDia(hj).filter(i => ['evento', 'aula', 'treino'].includes(i.k) && re.test(i.hora || ''));
    if (!its.length) return '';
    const bl = its.map(i => { const a = mm(i.hora); let b = re.test(i.horaFim || '') ? mm(i.horaFim) : a + (i.k === 'treino' ? 60 : 45); if (b <= a) b = a + 30; return { i, a, b: Math.min(b, 1440) }; });
    const ini = Math.min(360, Math.floor(Math.min(...bl.map(x => x.a)) / 60) * 60), fim = 1440, T = fim - ini, p = m => Math.max(0, Math.min(100, (m - ini) / T * 100));
    const ag = new Date(), am = ag.getHours() * 60 + ag.getMinutes(), pa = p(am);
    const marcas = []; for (let m = Math.ceil(ini / 360) * 360; m <= fim; m += 360) marcas.push(`<span>${p2(Math.floor(m / 60) % 24 || (m === fim ? 24 : 0))}h</span>`);
    return `<div class="tl" role="img" aria-label="Linha do dia"><div class="trk">${bl.map(x => `<i class="${x.i.feito ? 'f' : ''}" style="left:${p(x.a).toFixed(1)}%;width:${(p(x.b) - p(x.a)).toFixed(1)}%;--mc:${x.i.cor}" title="${esc(x.i.hora + ' ' + x.i.titulo)}"></i>`).join('')}<span class="now" style="left:${pa.toFixed(1)}%"></span><span class="nl" style="left:${Math.min(pa + 1, 84).toFixed(1)}%">${p2(ag.getHours())}:${p2(ag.getMinutes())}</span></div><div class="hs">${marcas.join('')}</div></div>`;
  }
  function manchete(hj, pg) {
    const faltam = pg.total - pg.feitos;
    const its = Agenda.itensDoDia(hj).filter(i => ['evento', 'aula', 'treino'].includes(i.k) && !i.feito && i.hora);
    const ag = new Date(), agora = p2(ag.getHours()) + ':' + p2(ag.getMinutes());
    const prox = its.find(i => i.hora >= agora) || its[0];
    const t = !pg.total ? 'Dia livre.' : faltam <= 0 ? 'Tudo feito por hoje.' : faltam === 1 ? 'Falta uma coisa hoje.' : `Faltam ${faltam} coisas hoje.`;
    const s = prox ? `Próximo: ${prox.titulo.replace(/^(Aula|Treino): /, '')} às ${prox.hora}.` : '';
    return [t, s];
  }

  function render(el) {
    const hj = hoje(), nomeRaw = (DB.cfg.nome || '').trim(), nome = nomeRaw ? ', ' + esc(nomeRaw) : '';
    const agenda = Agenda.itensDoDia(hj).filter(i => i.k === 'evento' || i.k === 'aula');
    const pend = Fin.pendentes(), venc = pend.filter(t => t.data < hj), prox = pend.filter(t => t.data >= hj && diasEntre(hj, t.data) <= 7);
    const fichas = Treinos.fichasDeHoje(), urg = Trabalho.tarefasUrgentes(), run = Cron.get('estudo'), prova = Estudos.proximos(14).slice(0, 3), pe = Estudos.pend();
    const vazio = !DB.agenda.eventos.length && !DB.fin.tx.length && !DB.treino.fichas.length && !DB.estudo.materias.length && !DB.trabalho.tarefas.length;
    const pg = progressoDoDia(hj);
    const msg = !pg.total ? ['Dia livre!', 'Que tal planejar algo na Agenda?'] : pg.pct >= 100 ? ['Missão cumprida!', 'Você concluiu tudo de hoje.'] : pg.pct >= 50 ? ['Você está indo muito bem!', 'Continue focado nos seus objetivos.'] : ['Vamos nessa!', 'Cada tarefa concluída conta.'];

    el.innerHTML = `<div class="brand"><span class="logo"><i class="lg" role="img" aria-label="NORTRIUM"></i><b class="wm">NORTRIUM</b></span><button class="ib" id="av-cfg" aria-label="Ajustes"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button></div><div class="hi"><div class="tx"><div class="nome">${manchete(hj, pg)[0]}</div>${manchete(hj, pg)[1] ? `<div class="mu">${manchete(hj, pg)[1]}</div>` : ''}<div class="mu sm">${fmtDataL(hj)} · ${saudacao().toLowerCase()}${nome}</div></div></div>
      <button class="prog" data-ir="agenda">${anel(pg.pct)}<div class="tx"><div class="tt">Seu progresso do dia</div>
        <div class="li"><i>✓</i>${pg.feitos} de ${pg.total} tarefa${pg.total === 1 ? '' : 's'}</div>
        <div class="li"><i>✓</i>${pg.comp} compromisso${pg.comp === 1 ? '' : 's'}</div></div><span class="go">›</span></button>
      ${linhaDoDia(hj)}
      ${vazio ? '' : dashboard()}
      ${vazio ? '<div class="card"><b>Comece por onde quiser.</b><p class="mu sm" style="margin:6px 0 0">Use a barra de baixo para abrir cada área. Se você usava o Fluxo de Caixa, importe o backup em Ajustes (ícone no canto, ou em Mais).</p></div>' : ''}
      <div class="sech"><b>Próximas atividades</b>${abaOn('agenda') ? '<a href="#" data-ir="agenda">Ver todas →</a>' : ''}</div>
      ${agenda.length ? agenda.slice(0, 6).map(i => `<div class="ativ${i.feito ? ' done' : ''}" style="--mc:${i.cor}"><span class="hr">${i.hora || '—'}</span><span class="ic">${svg(ICONE_K[i.k])}</span><div class="t"><b>${esc(i.titulo)}</b>${i.sub ? `<small>${esc(i.sub.replace(/^\d{2}:\d{2}(\u2013\d{2}:\d{2})?( · )?/, '') || (i.k === 'aula' ? 'Estudos' : 'Agenda'))}</small>` : ''}</div><button class="ck${i.feito ? ' on' : ''}" data-ev="${i.ref}" aria-label="Concluir"></button></div>`).join('') : '<div class="card mu sm">Nada na agenda hoje.</div>'}
      <div class="banner">${svg('trofeu')}<div><b>${msg[0]}</b><small>${msg[1]}</small></div></div>
      ${!abaOn('fin') ? '' : card('fin', 'var(--c-fin)', 'Finanças', `<div class="big">${dinheiro(Fin.saldoTotal())}</div><small class="mu">saldo nas contas</small>
        ${venc.length ? `<div class="row"><div class="t"><b class="neg">${venc.length} vencido${venc.length > 1 ? 's' : ''}</b><small>${esc(venc[0].descricao || venc[0].categoria)}${venc.length > 1 ? ' e mais ' + (venc.length - 1) : ''}</small></div><span class="n neg">${dinheiro(soma(venc.map(t => t.tipo === 'saida' ? t.valor : 0)))}</span></div>` : ''}
        ${prox.slice(0, 3).map(t => `<div class="row" data-id="${t.id}"><button class="ck" data-q="${t.id}" aria-label="Dar baixa"></button><div class="t"><b>${esc(t.descricao || t.categoria)}</b><small>${t.tipo === 'entrada' ? 'Receber' : 'Pagar'} · ${quando(t.data)}</small></div><span class="n">${dinheiro(t.valor)}</span></div>`).join('')}`)}
      ${!abaOn('treino') ? '' : card('treino', 'var(--c-treino)', 'Treino', Treinos.faixaAndamento() + (fichas.length ? fichas.map(f => { const s = Treinos.feitoHoje(f); return `<div class="row"><div class="t"><b>${esc(f.nome)}</b><small>${s ? 'Concluído · ' + dur(s.duracao) : f.exercicios.length + ' exercícios'}</small></div>${s ? '<span class="n pos">✓</span>' : `<button class="btn" data-tr="${f.id}" style="padding:7px 16px">Iniciar</button>`}</div>`; }).join('') : '<div class="mu sm">Sem treino marcado para hoje.</div>') + `<small class="mu">${Treinos.treinosNaSemana()} treino(s) nesta semana</small>`)}
      ${abaOn('treino') ? Saude.cardDieta() : ''}
      ${abaOn('treino') ? Saude.cardAgua() : ''}
      ${!abaOn('estudo') ? '' : card('estudo', 'var(--c-estudo)', 'Estudos', `${run ? `<div class="row"><div class="t"><b>Cronômetro ligado</b><small data-cron="estudo">${Cron.fmt(Date.now() - run.inicio)}</small></div></div>` : ''}<small class="mu">Hoje ${dur(Estudos.minHoje())} · semana ${dur(Estudos.minSemana())}</small>
        ${pe.rev || pe.atras || pe.nota ? `<div class="row" data-es-pend><div class="t"><b>${[pe.rev && pe.rev + ' revisã' + (pe.rev > 1 ? 'ões' : 'o'), pe.atras && pe.atras + ' atrasado' + (pe.atras > 1 ? 's' : ''), pe.nota && pe.nota + ' sem nota'].filter(Boolean).join(' · ')}</b><small>toque para ver as pendências</small></div></div>` : ''}
        ${prova.map(i => { const p = Estudos.progresso(i); return `<div class="row"><div class="t"><b>${esc(i.titulo)}</b><small>${fmtData(i.data)} · ${quando(i.data)}${p.n ? ' · ' + p.pct + '% estudado' : ''}</small></div></div>`; }).join('')}`)}
      ${!abaOn('trab') ? '' : card('trab', 'var(--c-trab)', 'Trabalho', (urg.length ? urg.slice(0, 4).map(t => `<div class="row"><button class="ck" data-tf="${t.id}" aria-label="Concluir"></button><div class="t"><b>${esc(t.titulo)}</b><small class="${t.prazo < hj ? 'neg' : ''}">${t.prazo < hj ? 'atrasada · ' : ''}${quando(t.prazo)}</small></div></div>`).join('') : '<div class="mu sm">Nenhuma tarefa com prazo para hoje.</div>') + `<small class="mu">Horas hoje: ${dur(Trabalho.minHoje())}</small>`)}`;

    $('#av-cfg', el).onclick = ajustes;
    $$('[data-ir]', el).forEach(a => a.onclick = e => { e.preventDefault(); if (a.dataset.ir === 'treino') Treinos.S.area = 'treino'; go(a.dataset.ir); });
    $$('[data-ar]', el).forEach(b => b.onclick = () => Saude.abrirArea(b.dataset.ar));
    Saude.ligarCards(el);
    $$('[data-es-pend]', el).forEach(r => r.onclick = () => { Estudos.S.seg = 'pend'; Estudos.S.mat = null; go('estudo'); });
    $$('[data-ev]', el).forEach(b => b.onclick = e => { e.stopPropagation(); Agenda.alternar(b.dataset.ev, hj); });
    $$('[data-q]', el).forEach(b => b.onclick = () => Fin.baixar(b.dataset.q));
    Treinos.ligarFaixa(el);
    $$('[data-tr]', el).forEach(b => b.onclick = () => Treinos.iniciar(DB.treino.fichas.find(f => f.id === b.dataset.tr)));
    $$('[data-tf]', el).forEach(b => b.onclick = () => { const t = DB.trabalho.tarefas.find(x => x.id === b.dataset.tf); t.feito = true; t.feitoEm = hoje(); commit(); });
  }
  registrar({ id: 'hoje', nome: 'Hoje', render, fab: () => null });
  return {};
})();
