'use strict';
/* =========================================================
   WIDGETS — tela inicial do Android
   - "Agenda de hoje" (original): marcar itens como feitos direto no widget.
   - Um widget por área: Hoje, Finanças, Treino, Dieta, Água, Estudos e Trabalho, mais Cartões, Dívidas, Metas,
     Contas, Mês, Orçamento, Peso, Revisões, Provas, Curso, Faltas, Horas, Prazos, Semana e Avisos.
     O app envia um resumo (JSON) de cada área sempre que algo muda.
   - Tocar num widget abre o app na área dele; os botões do widget de Água
     registram o consumo na hora e o app aplica a fila ao abrir.
   ========================================================= */
const Widget = (() => {
  const P = () => (window.cordova && cordova.plugins && cordova.plugins.MeuWidget) || null;
  let timer = null, ultimo = '', ultimoAreas = '';

  /* ---------- agenda (widget original) ---------- */
  function resumo() {
    const hj = hoje();
    return {
      data: hj, dia: fmtDataL(hj),
      itens: Agenda.itensDoDia(hj).map(i => ({ ref: i.ref, titulo: i.titulo, sub: i.sub || '', feito: !!i.feito, marca: i.k === 'evento' || i.k === 'aula' }))
    };
  }

  /* ---------- resumos por área ---------- */
  const privado = () => DB.cfg.widgetValores === false;
  const R = v => privado() ? 'R$ ••••' : dinheiro(v);
  const topo = (titulo, sub, extra) => ({ titulo, sub, dia: true, data: hoje(), ...extra });
  const n1 = v => numStr(Math.round((v || 0) * 10) / 10);
  const plural = (n, a, b) => n === 1 ? a : b;

  function areaHoje() {
    const hj = hoje(), d = pd(hj), ag = Agenda.itensDoDia(hj).filter(i => i.k === 'evento' || i.k === 'aula'), pend = ag.filter(i => !i.feito);
    const fichas = Treinos.fichasDeHoje(), run = Treinos.andamento(), feitas = fichas.filter(f => Treinos.feitoHoje(f)).length;
    const ml = Saude.mlDia(hj), meta = DB.agua.meta, di = Saude.resumoDia(hj), fp = Fin.pendentes(), venc = fp.filter(t => t.data < hj), prox = fp.filter(t => t.data >= hj && diasEntre(hj, t.data) <= 7);
    const linhas = [
      { t: pend.length ? (pend[0].sub ? pend[0].sub + ' · ' : '') + pend[0].titulo : 'Agenda', v: pend.length ? (pend.length > 1 ? '+' + (pend.length - 1) : '') : (ag.length ? 'tudo feito' : 'livre') },
      { t: 'Treino', v: run ? 'em andamento' : fichas.length ? (feitas === fichas.length ? 'concluído' : fichas.map(f => f.nome).join(', ')) : 'descanso' },
      { t: 'Água', v: Saude.fmtMl(ml) + (meta ? ' de ' + Saude.fmtMl(meta) : '') },
      { t: 'Dieta', v: Math.round(di.kcal) + ' kcal' + (di.metas.kcal ? ' de ' + di.metas.kcal : '') },
      venc.length ? { t: venc.length + ' ' + plural(venc.length, 'conta vencida', 'contas vencidas'), v: '', neg: true } : { t: 'Contas', v: prox.length ? prox.length + ' a vencer em 7 dias' : 'em dia' }
    ];
    return topo('Hoje', fmtData(hj), { valor: DIAS_L[d.getDay()], valor2: d.getDate() + ' de ' + MESES[d.getMonth()].toLowerCase(), prog: -1, linhas });
  }

  function areaFin() {
    const hj = hoje(), mes = hj.slice(0, 7), pend = Fin.pendentes(), venc = pend.filter(t => t.data < hj), prox = pend.filter(t => t.data >= hj).slice(0, 4);
    const gastos = soma(DB.fin.tx.filter(t => t.tipo === 'saida' && t.status !== 'pendente' && t.data.startsWith(mes)).map(t => t.valor));
    const linhas = [{ t: 'Gastos no mês', v: R(gastos) }];
    if (venc.length) linhas.push({ t: venc.length + ' ' + plural(venc.length, 'vencida', 'vencidas') + ' · ' + (venc[0].descricao || venc[0].categoria), v: R(soma(venc.filter(t => t.tipo === 'saida').map(t => t.valor))), neg: true });
    prox.forEach(t => linhas.push({ t: `${quando(t.data)} · ${t.descricao || t.categoria}`, v: (t.tipo === 'entrada' ? '+' : '') + R(t.valor) }));
    return { titulo: 'Finanças', sub: MESES[pd(hj).getMonth()], dia: false, data: hj, valor: R(Fin.saldoTotal()), valor2: 'saldo nas contas', prog: -1, linhas: linhas.slice(0, 5) };
  }

  function areaTreino() {
    const hj = hoje(), fichas = Treinos.fichasDeHoje(), run = Treinos.andamento(), semana = Treinos.treinosNaSemana();
    const previstos = DB.treino.fichas.reduce((t, f) => t + (f.dias || []).length, 0), feitas = fichas.filter(f => Treinos.feitoHoje(f)).length;
    const ult = [...DB.treino.sessoes].sort((a, b) => b.data.localeCompare(a.data) || (b.inicio || '').localeCompare(a.inicio || ''))[0];
    const linhas = [];
    if (run) linhas.push({ t: 'Em andamento', v: run.exs.reduce((t, e) => t + e.sets.filter(x => x.ok).length, 0) + ' séries feitas' });
    fichas.forEach(f => { const s = Treinos.feitoHoje(f); linhas.push({ t: f.nome, v: s ? 'concluído · ' + dur(s.duracao) : f.exercicios.length + plural(f.exercicios.length, ' exercício', ' exercícios') }); });
    linhas.push({ t: 'Esta semana', v: previstos ? `${semana} de ${previstos}` : String(semana) });
    if (ult) linhas.push({ t: 'Último treino', v: `${ult.nome} · ${quando(ult.data)}` });
    return topo('Treino', DIAS[pd(hj).getDay()], {
      valor: run ? run.nome : fichas.length ? fichas.map(f => f.nome).join(' + ') : 'Descanso',
      valor2: run ? 'em andamento' : fichas.length ? (feitas === fichas.length ? 'concluído' : 'pendente') : 'sem treino previsto',
      prog: previstos ? Math.min(100, Math.round(semana / previstos * 100)) : -1, linhas: linhas.slice(0, 5)
    });
  }

  function areaDieta() {
    const hj = hoje(), d = Saude.resumoDia(hj), m = d.metas;
    const lin = (t, v, meta) => ({ t, v: n1(v) + (meta ? ' de ' + meta : '') + ' g' });
    return topo('Dieta', DIAS[pd(hj).getDay()], {
      valor: String(Math.round(d.kcal)), valor2: 'kcal' + (m.kcal ? ' de ' + m.kcal : ''),
      prog: m.kcal ? Math.min(100, Math.round(d.kcal / m.kcal * 100)) : -1,
      linhas: [lin('Proteínas', d.prot, m.prot), lin('Carboidratos', d.carb, m.carb), lin('Gorduras', d.gord, m.gord), lin('Fibras', d.fib, m.fib), { t: 'Refeições registradas', v: String(d.refeicoes) }]
    });
  }

  function areaAgua() {
    const hj = hoje(), a = DB.agua, ml = Saude.mlDia(hj), meta = a.meta || 0;
    const dias = Array.from({ length: 7 }, (_, k) => Saude.mlDia(addDias(hj, -k))), com = dias.filter(v => v > 0);
    const linhas = [];
    if (com.length) linhas.push({ t: 'Média (7 dias)', v: Saude.fmtMl(Math.round(com.reduce((x, y) => x + y, 0) / com.length)) });
    if (meta) linhas.push({ t: 'Meta atingida', v: dias.filter(v => v >= meta).length + ' de 7 dias' });
    return topo('Água', DIAS[pd(hj).getDay()], {
      valor: Saude.fmtMl(ml), valor2: meta ? 'de ' + Saude.fmtMl(meta) : 'hoje', num: ml, meta,
      prog: meta ? Math.min(100, Math.round(ml / meta * 100)) : -1, linhas,
      botoes: a.rapidos.slice(0, 3).map(v => ({ t: '+' + Saude.fmtMl(v), a: 'agua:' + v }))
    });
  }

  function areaEstudo() {
    const hj = hoje(), run = Cron.get('estudo'), pe = Estudos.pend(), linhas = [{ t: 'Esta semana', v: dur(Estudos.minSemana()) }];
    if (run) linhas.push({ t: 'Cronômetro ligado', v: dur((Date.now() - run.inicio) / 60000) });
    if (pe.atras) linhas.push({ t: pe.atras + ' ' + plural(pe.atras, 'item atrasado', 'itens atrasados'), v: '', neg: true });
    if (pe.rev) linhas.push({ t: pe.rev + ' ' + plural(pe.rev, 'revisão', 'revisões') + ' para fazer', v: '' });
    Estudos.proximos(14).slice(0, 3).forEach(i => linhas.push({ t: `${fmtData(i.data)} · ${i.titulo}`, v: quando(i.data) }));
    return topo('Estudos', DIAS[pd(hj).getDay()], { valor: dur(Estudos.minHoje()), valor2: 'estudados hoje', prog: -1, linhas: linhas.slice(0, 5) });
  }

  function areaTrab() {
    const hj = hoje(), pend = DB.trabalho.tarefas.filter(t => !t.feito).sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999'));
    return { titulo: 'Trabalho', sub: 'hoje ' + dur(Trabalho.minHoje()), dia: true, data: hj, valor: String(pend.length), valor2: plural(pend.length, 'tarefa pendente', 'tarefas pendentes'), prog: -1,
      linhas: pend.slice(0, 5).map(t => ({ t: t.titulo, v: t.prazo ? quando(t.prazo) : '', neg: !!t.prazo && t.prazo < hj })), vazio: 'Nenhuma tarefa pendente.' };
  }

  /* ---------- widgets extras (somente leitura: tocar abre a tela certa) ---------- */
  const pct = (a, b) => b > 0 ? Math.min(100, Math.round(a / b * 100)) : -1;
  const nomeMateria = id => { const m = DB.estudo.materias.find(x => x.id === id); return m ? m.nome : ''; };
  const semDados = (titulo, vazio, dia) => ({ titulo, sub: '', dia: !!dia, data: hoje(), valor: '', prog: -1, linhas: [], vazio });

  function areaCartao() {
    const hj = hoje(), cs = Fin.ext.resumo.cartoes();
    if (!cs.length) return semDados('Cartões', 'Nenhum cartão cadastrado.');
    const total = soma(cs.filter(c => c.fatura).map(c => c.fatura.total)), limite = soma(cs.map(c => c.limite)), usado = soma(cs.map(c => c.usado));
    const linhas = cs.slice(0, 5).map(c => ({ t: c.nome, v: c.fatura ? `${R(c.fatura.total)} · ${quando(c.fatura.data)}` : 'sem fatura', neg: !!c.fatura && c.fatura.data < hj }));
    return { titulo: 'Cartões', sub: limite > 0 ? 'limite usado ' + pct(usado, limite) + '%' : cs.length + plural(cs.length, ' cartão', ' cartões'), dia: false, data: hj,
      valor: R(total), valor2: 'em faturas abertas', prog: pct(usado, limite), linhas };
  }

  function areaDivida() {
    const hj = hoje(), ds = Fin.ext.resumo.dividas();
    if (!ds.length) return semDados('Dívidas', 'Nenhuma dívida ativa.');
    const saldo = soma(ds.map(d => d.saldo)), juros = soma(ds.map(d => d.saldo * d.taxa / 100)), parc = soma(ds.map(d => d.parcela));
    const linhas = [{ t: 'Juros por mês', v: R(juros) }, { t: 'Parcelas por mês', v: R(parc) }];
    [...ds].sort((a, b) => b.saldo - a.saldo).slice(0, 3).forEach(d => {
      const cresce = d.parcela > 0 ? d.parcela <= d.saldo * d.taxa / 100 : d.taxa > 0;     // parcela não cobre os juros
      linhas.push({ t: d.descricao || 'Dívida', v: (cresce ? '⚠ ' : '') + R(d.saldo), neg: cresce });
    });
    return { titulo: 'Dívidas', sub: ds.length + plural(ds.length, ' dívida', ' dívidas'), dia: false, data: hj, valor: R(saldo), valor2: 'saldo devedor', prog: -1, linhas };
  }

  function areaMeta() {
    const hj = hoje(), ms = Fin.ext.resumo.metas();
    if (!ms.length) return semDados('Metas', 'Nenhuma meta cadastrada.');
    const at = soma(ms.map(m => m.atual)), alvo = soma(ms.map(m => m.alvo)), ok = ms.filter(m => m.alvo > 0 && m.atual >= m.alvo).length;
    const p = m => m.alvo > 0 ? m.atual / m.alvo : 0;
    const linhas = [...ms].sort((a, b) => (p(a) >= 1) - (p(b) >= 1) || p(b) - p(a)).slice(0, 5).map(m => {
      const feita = p(m) >= 1;
      return { t: m.nome, v: feita ? 'atingida' : Math.round(p(m) * 100) + '%' + (m.prazo ? ' · ' + fmtData(m.prazo) : ''), neg: !feita && !!m.prazo && m.prazo < hj };
    });
    return { titulo: 'Metas', sub: ok + ' de ' + ms.length + plural(ms.length, ' atingida', ' atingidas'), dia: false, data: hj, valor: R(at), valor2: 'de ' + R(alvo), prog: pct(at, alvo), linhas };
  }

  function areaContas() {
    const hj = hoje(), pend = Fin.pendentes();
    if (!pend.length) return semDados('Contas', 'Nenhuma conta pendente.');
    const saidas = pend.filter(t => t.tipo === 'saida'), venc = saidas.filter(t => t.data < hj), sete = saidas.filter(t => t.data >= hj && diasEntre(hj, t.data) <= 7);
    const linhas = [];
    if (venc.length) linhas.push({ t: venc.length + ' ' + plural(venc.length, 'vencida', 'vencidas'), v: R(soma(venc.map(t => t.valor))), neg: true });
    pend.filter(t => t.data >= hj).slice(0, 5 - linhas.length).forEach(t => linhas.push({ t: `${quando(t.data)} · ${t.descricao || t.categoria}`, v: (t.tipo === 'entrada' ? '+' : '') + R(t.valor) }));
    return { titulo: 'Contas', sub: pend.length + plural(pend.length, ' pendente', ' pendentes'), dia: false, data: hj, valor: R(soma([...venc, ...sete].map(t => t.valor))),
      valor2: venc.length ? 'vencidas + próx. 7 dias' : 'a pagar em 7 dias', prog: -1, linhas };
  }

  function areaMes() {
    const hj = hoje(), mes = hj.slice(0, 7), tx = DB.fin.tx.filter(t => t.data.startsWith(mes));
    const so = (tipo, pend) => soma(tx.filter(t => t.tipo === tipo && (t.status === 'pendente') === pend).map(t => t.valor));
    const ent = so('entrada', false), sai = so('saida', false);
    return { titulo: 'Mês', sub: MESES[pd(hj).getMonth()], dia: false, data: hj, valor: R(r2(ent - sai)), valor2: 'saldo do mês', prog: ent > 0 ? pct(sai, ent) : -1,
      linhas: [{ t: 'Entradas', v: R(ent) }, { t: 'Saídas', v: R(sai) }, { t: 'A pagar no mês', v: R(so('saida', true)) }, { t: 'A receber no mês', v: R(so('entrada', true)) }] };
  }

  function areaOrc() {
    const hj = hoje(), mes = hj.slice(0, 7), orc = DB.fin.orcamentos || {}, cats = Object.keys(orc).filter(c => orc[c] > 0);
    if (!cats.length) return semDados('Orçamento', 'Defina orçamentos por categoria em Finanças.');
    const gastos = {};
    DB.fin.tx.filter(t => t.tipo === 'saida' && t.data.startsWith(mes)).forEach(t => { gastos[t.categoria] = r2((gastos[t.categoria] || 0) + t.valor); });
    const lim = soma(cats.map(c => orc[c])), gas = soma(cats.map(c => gastos[c] || 0)), p = c => (gastos[c] || 0) / orc[c];
    const linhas = [...cats].sort((a, b) => p(b) - p(a)).slice(0, 5).map(c => ({ t: c, v: Math.round(p(c) * 100) + '%', neg: p(c) > 1 }));
    return { titulo: 'Orçamento', sub: MESES[pd(hj).getMonth()], dia: false, data: hj, valor: R(r2(Math.abs(lim - gas))), valor2: gas > lim ? 'acima do orçamento' : 'restam do orçamento', prog: pct(gas, lim), linhas };
  }

  function areaPeso() {
    const hj = hoje(), l = [...DB.treino.medidas].sort((a, b) => b.data.localeCompare(a.data)), pesos = l.filter(m => m.peso);
    if (!l.length) return semDados('Peso', 'Registre peso e medidas no app.');
    const u = pesos[0], ant = pesos[1], velho = u && pesos.find(m => diasEntre(m.data, u.data) >= 30);
    const dif = (a, b) => { const d = r2(a - b); return (d > 0 ? '+' : d < 0 ? '−' : '') + numStr(Math.abs(d)) + ' kg'; };
    const ult = campo => l.find(m => m[campo]);
    const linhas = [];
    if (ant) linhas.push({ t: 'Desde ' + fmtData(ant.data), v: dif(u.peso, ant.peso) });
    if (velho && velho !== ant) linhas.push({ t: 'Desde ' + fmtData(velho.data), v: dif(u.peso, velho.peso) });
    if (ult('cintura')) linhas.push({ t: 'Cintura', v: numStr(ult('cintura').cintura) + ' cm' });
    if (ult('gordura')) linhas.push({ t: 'Gordura', v: numStr(ult('gordura').gordura) + ' %' });
    return { titulo: 'Peso', sub: u ? quando(u.data) : '', dia: false, data: hj, valor: u ? numStr(u.peso) + ' kg' : '', valor2: u ? 'em ' + fmtData(u.data) : '', prog: -1, linhas, vazio: 'Registre seu peso no app.' };
  }

  function areaRevisao() {
    const hj = hoje(), rev = Estudos.revDevidas(), pe = Estudos.pend(), linhas = [];
    if (pe.atras) linhas.push({ t: pe.atras + ' ' + plural(pe.atras, 'item atrasado', 'itens atrasados'), v: '', neg: true });
    rev.slice(0, 5 - linhas.length).forEach(t => linhas.push({ t: t.nome, v: nomeMateria(t.materiaId) }));
    if (!linhas.length) linhas.push({ t: 'Tudo em dia', v: '' });
    return topo('Revisões', DIAS[pd(hj).getDay()], { valor: String(rev.length), valor2: plural(rev.length, 'revisão para fazer', 'revisões para fazer'), prog: -1, linhas });
  }

  function areaProva() {
    const hj = hoje(), l = Estudos.proximos(60).filter(i => i.tipo !== 'revisao');
    if (!l.length) return semDados('Provas', 'Nenhuma prova ou entrega próxima.', true);
    const atr = l.filter(i => i.data < hj), fut = l.filter(i => i.data >= hj);
    const p = fut[0] || atr[0], d = diasEntre(hj, p.data), pr = Estudos.progresso(p);   // destaque: a próxima que ainda não passou
    const resto = [...atr.filter(i => i !== p), ...fut.filter(i => i !== p)].slice(0, 5);
    return topo('Provas', fmtData(p.data), {
      valor: d === 0 ? 'Hoje' : d < 0 ? 'Atrasada' : d + (d === 1 ? ' dia' : ' dias'), valor2: p.titulo + (pr.n ? ' · ' + pr.pct + '% estudado' : ''), prog: pr.n ? pr.pct : -1,
      linhas: resto.map(i => ({ t: `${fmtData(i.data)} · ${i.titulo}`, v: quando(i.data), neg: i.data < hj }))
    });
  }

  function areaCurso() {
    const cs = DB.estudo.cursos || [], c = cs.find(x => x.id === Curso.S.inst) || cs[0];
    if (!c) return semDados('Curso', 'Cadastre seu curso em Estudos > Curso.');
    const p = Curso.prog(c), un = c.unidade || 'créditos', f = v => numStr(Math.round(v * 100) / 100);
    const linhas = [{ t: un.charAt(0).toUpperCase() + un.slice(1), v: f(p.feito) + ' de ' + f(p.total) }, { t: 'Cursando', v: f(p.cur) + ' ' + un }];
    if (p.media !== null) linhas.push({ t: 'Média geral', v: f(p.media) });
    if (p.semRest !== null) linhas.push({ t: 'Faltam cerca de', v: p.semRest + plural(p.semRest, ' semestre', ' semestres') });
    if (p.refazer) linhas.push({ t: 'Disciplinas a refazer', v: String(p.refazer), neg: true });
    linhas.push({ t: 'Livres para cursar', v: String(p.livres) });
    return { titulo: 'Curso', sub: c.nome || '', dia: false, data: hoje(), valor: Math.round(p.pctFeito) + '%', valor2: 'concluído', prog: Math.round(p.pctFeito), linhas: linhas.slice(0, 5) };
  }

  function areaFaltas() {
    const cs = DB.estudo.cursos || [], ds = (DB.estudo.disciplinas || []).filter(d => d.status === 'cursando' && d.aulasTotal > 0);
    const calc = ds.map(d => ({ d, e: Curso.calc(d, cs.find(c => c.id === d.cursoId)) })).filter(x => x.e.podeFaltar !== null).sort((a, b) => a.e.podeFaltar - b.e.podeFaltar);
    if (!calc.length) return semDados('Faltas', 'Informe as aulas previstas das disciplinas que está cursando.');
    const m = calc[0], n = x => x.e.podeFaltar;
    return { titulo: 'Faltas', sub: calc.length + plural(calc.length, ' disciplina', ' disciplinas'), dia: false, data: hoje(), valor: String(Math.max(0, n(m))), valor2: plural(n(m), 'falta restante · ', 'faltas restantes · ') + m.d.nome, prog: -1,
      linhas: calc.slice(0, 5).map(x => ({ t: x.d.nome, v: n(x) < 0 ? 'reprovado por falta' : n(x) + plural(n(x), ' falta', ' faltas'), neg: n(x) <= 1 })) };
  }

  function areaHoras() {
    const hj = hoje(), H = DB.trabalho.horas, ini = inicioSemana(hj), mes = hj.slice(0, 7) + '-01', run = Cron.get('trabalho');
    const min = (de, pid) => H.filter(x => x.data >= de && (!pid || x.projetoId === pid)).reduce((t, x) => t + x.min, 0);
    const linhas = [{ t: 'Esta semana', v: dur(min(ini)) }, { t: 'Este mês', v: dur(min(mes)) }];
    if (run) linhas.push({ t: 'Cronômetro ligado', v: dur((Date.now() - run.inicio) / 60000) });
    DB.trabalho.projetos.map(p => ({ p, m: min(ini, p.id) })).filter(x => x.m > 0).sort((a, b) => b.m - a.m).slice(0, 5 - linhas.length).forEach(x => linhas.push({ t: x.p.nome, v: dur(x.m) }));
    return topo('Horas', DIAS[pd(hj).getDay()], { valor: dur(min(hj)), valor2: 'trabalhadas hoje', prog: -1, linhas });
  }

  function areaPrazos() {
    const hj = hoje(), urg = Trabalho.tarefasUrgentes();
    const prox = DB.trabalho.tarefas.filter(t => !t.feito && t.prazo && t.prazo > hj && diasEntre(hj, t.prazo) <= 7).sort((a, b) => a.prazo.localeCompare(b.prazo));
    const linhas = [...urg, ...prox].slice(0, 5).map(t => ({ t: t.titulo, v: quando(t.prazo), neg: t.prazo < hj }));
    if (!linhas.length) linhas.push({ t: 'Nenhum prazo nesta semana', v: '' });
    return topo('Prazos', DIAS[pd(hj).getDay()], { valor: String(urg.length), valor2: plural(urg.length, 'vencida ou para hoje', 'vencidas ou para hoje'), prog: -1, linhas });
  }

  function areaSemana() {
    const hj = hoje(), it = [];
    for (let k = 0; k < 7; k++) {
      const d = addDias(hj, k);
      Agenda.itensDoDia(d).filter(i => ['evento', 'aula', 'prova', 'tarefa'].includes(i.k) && !i.rev && !i.feito).forEach(i => it.push({ d, k, i }));
    }
    it.sort((a, b) => a.d.localeCompare(b.d) || (a.i.hora || '').localeCompare(b.i.hora || ''));
    if (!it.length) return semDados('Semana', 'Agenda livre nos próximos 7 dias.', true);
    return topo('Semana', fmtData(hj) + ' – ' + fmtData(addDias(hj, 6)), {
      valor: String(it.length), valor2: plural(it.length, 'compromisso em 7 dias', 'compromissos em 7 dias'), prog: -1,
      linhas: it.slice(0, 5).map(x => ({ t: x.i.titulo, v: (x.k === 0 ? 'hoje' : DIAS[pd(x.d).getDay()]) + (x.i.hora ? ' ' + x.i.hora : '') }))
    });
  }

  function areaAvisos() {
    const hj = hoje(), av = Notif.avisosDeHoje();
    if (!av.length) return semDados('Avisos', 'Nenhum aviso para hoje.', true);
    return topo('Avisos', DIAS[pd(hj).getDay()], {
      valor: String(av.length), valor2: plural(av.length, 'aviso hoje', 'avisos hoje'), prog: -1,
      linhas: av.slice(0, 5).map(a => ({ t: a.titulo, v: a.horas.length > 1 ? `${a.horas[0]}–${a.horas[a.horas.length - 1]} (${a.horas.length}x)` : (a.horas[0] || '') }))
    });
  }

  const AREAS = { hoje: areaHoje, fin: areaFin, treino: areaTreino, dieta: areaDieta, agua: areaAgua, estudo: areaEstudo, trab: areaTrab,
    cartao: areaCartao, divida: areaDivida, meta: areaMeta, contas: areaContas, mes: areaMes, orcamento: areaOrc, peso: areaPeso, revisao: areaRevisao,
    prova: areaProva, curso: areaCurso, faltas: areaFaltas, horas: areaHoras, prazos: areaPrazos, semana: areaSemana, avisos: areaAvisos };
  function resumoAreas() {
    const o = {};
    for (const k in AREAS) { try { o[k] = AREAS[k](); } catch (e) { console.error('Widget', k, e); } }   // uma área com erro não derruba as outras
    return o;
  }

  /* ---------- envio ---------- */
  function enviar() {
    const p = P(); if (!p) return;
    const json = JSON.stringify(resumo());
    if (json !== ultimo) { ultimo = json; p.atualizar(json, null, e => { ultimo = ''; console.error('Widget', e); }); }
    if (p.atualizarAreas) {
      const a = JSON.stringify(resumoAreas());
      if (a !== ultimoAreas) { ultimoAreas = a; p.atualizarAreas(a, null, e => { ultimoAreas = ''; console.error('Widget', e); }); }
    }
  }
  function agendar(imediato) { clearTimeout(timer); timer = setTimeout(enviar, imediato ? 0 : 1000); }

  /* ---------- o que foi feito nos widgets com o app fechado ---------- */
  function aplicarFila() {                                  // agenda: cada marcação inverte feito/não feito
    const p = P(); if (!p) return;
    p.pendentes(txt => {
      let fila = []; try { fila = JSON.parse(txt || '[]'); } catch (e) { fila = []; }
      let mudou = false;
      fila.forEach(x => {
        const ev = Agenda.achar(x.ref);
        if (!ev || !dataOk(x.data)) return;
        ev.feitos = ev.feitos || {};
        if (ev.feitos[x.data]) delete ev.feitos[x.data]; else ev.feitos[x.data] = true;
        mudou = true;
      });
      ultimo = ''; ultimoAreas = '';
      if (mudou) commit(); else agendar(true);              // commit também reenvia os resumos
    }, e => { console.error('Widget', e); agendar(true); });
  }

  function aplicarAcoes() {                                 // botões dos widgets de área (hoje: água)
    const p = P(); if (!p || !p.acoes) return;
    p.acoes(txt => {
      let fila = []; try { fila = JSON.parse(txt || '[]'); } catch (e) { fila = []; }
      let n = 0;
      fila.forEach(x => {
        const m = /^agua:(\d+)$/.exec(String(x.a || '')), ml = m ? +m[1] : 0;
        if (!(ml > 0 && ml <= 5000) || !dataOk(x.data)) return;
        DB.agua.reg.push({ id: uid('ag'), data: x.data, hora: /^\d{2}:\d{2}$/.test(x.hora) ? x.hora : '12:00', ml }); n++;
      });
      if (n) { ultimoAreas = ''; commit(); toast(n + ' registro(s) de água feito(s) pelo widget.'); }
    }, e => console.error('Widget', e));
  }

  const ROTAS = {
    hoje: () => go('hoje'), fin: () => go('fin'), agenda: () => go('agenda'), estudo: () => go('estudo'), trab: () => go('trab'),
    treino: () => { Treinos.S.area = 'treino'; go('treino'); }, dieta: () => Saude.abrirArea('dieta'), agua: () => Saude.abrirArea('agua'),
    cartao: () => { Fin.S.seg = 'cart'; go('fin'); }, divida: () => { Fin.S.seg = 'div'; go('fin'); }, meta: () => { Fin.S.seg = 'metas'; go('fin'); },
    contas: () => { Fin.S.seg = 'pend'; go('fin'); }, mes: () => { Fin.S.seg = 'resumo'; go('fin'); }, orcamento: () => { Fin.S.seg = 'orc'; go('fin'); },
    peso: () => { Treinos.S.area = 'treino'; Treinos.S.seg = 'corpo'; go('treino'); },
    revisao: () => { Estudos.S.seg = 'pend'; Estudos.S.mat = null; go('estudo'); }, prova: () => { Estudos.S.seg = 'itens'; Estudos.S.mat = null; go('estudo'); },
    curso: () => { Estudos.S.seg = 'curso'; Estudos.S.mat = null; Curso.S.sub = 'resumo'; go('estudo'); }, faltas: () => { Estudos.S.seg = 'curso'; Estudos.S.mat = null; Curso.S.sub = 'bol'; go('estudo'); },
    horas: () => { Trabalho.S.seg = 'horas'; go('trab'); }, prazos: () => { Trabalho.S.seg = 'tarefas'; Trabalho.S.filtro = 'hoje'; go('trab'); },
    semana: () => go('agenda'), avisos: () => { go('hoje'); Notif.avisosTela(); }
  };
  function aplicarAbertura() {                              // widget tocado: abre na área dele
    const p = P(); if (!p || !p.abertura) return;
    p.abertura(txt => { const f = ROTAS[String(txt || '').trim()]; if (f) f(); }, e => console.error('Widget', e));
  }

  function aoVoltar() { aplicarFila(); aplicarAcoes(); aplicarAbertura(); }

  /* ---------- tela de ajustes dos widgets ---------- */
  function tela() {
    const lista = [['Agenda de hoje', 'itens do dia com caixinha para marcar como feito'], ['Hoje', 'resumo do dia: agenda, treino, água, dieta e contas'], ['Finanças', 'saldo, gastos do mês e próximas contas'],
      ['Treino', 'ficha de hoje, andamento e frequência da semana'], ['Dieta', 'calorias e macros do dia'], ['Água', 'consumo do dia com botões para registrar na hora'], ['Estudos', 'tempo estudado, revisões e provas'], ['Trabalho', 'tarefas pendentes e prazos'],
      ['Cartões', 'fatura atual de cada cartão e limite usado'],
      ['Dívidas', 'saldo devedor, juros e parcelas (avisa se o saldo cresce)'],
      ['Metas', 'metas de economia: guardado, alvo e prazo'],
      ['Contas', 'contas vencidas e a pagar nos próximos 7 dias'],
      ['Mês', 'entradas, saídas e saldo do mês'],
      ['Orçamento', 'quanto já gastou do orçamento por categoria'],
      ['Peso', 'peso atual, variação e medidas'],
      ['Revisões', 'tópicos para revisar hoje e itens atrasados'],
      ['Provas', 'próxima prova ou entrega com contagem regressiva'],
      ['Curso', 'progresso para se formar, média e créditos'],
      ['Faltas', 'quantas faltas ainda pode ter em cada disciplina'],
      ['Horas', 'horas trabalhadas hoje, na semana e no mês'],
      ['Prazos', 'tarefas vencidas ou com prazo nos próximos dias'],
      ['Semana', 'compromissos dos próximos 7 dias'],
      ['Avisos', 'seus lembretes de hoje com os horários']];
    const s = sheet('Widgets', `<p class="mu sm" style="margin:0 0 10px">Na tela inicial do celular, segure em um espaço vazio, toque em Widgets, procure “NORTRIUM” e escolha o da área que quiser. Dá para adicionar vários, e redimensionar cada um (quanto mais alto, mais linhas aparecem). Tocar no widget abre o app direto naquela área.</p>
      <div class="card" style="padding:2px 14px">${lista.map(([n, d]) => `<div class="row"><div class="t"><b>${n}</b><small>${d}</small></div></div>`).join('')}</div>
      <label class="sw" style="margin-top:12px"><span>Mostrar valores financeiros nos widgets</span><input type="checkbox" name="wv" ${privado() ? '' : 'checked'}></label>
      <p class="hint">Desligue se não quiser que saldo e contas fiquem visíveis na tela inicial (o PIN do app não protege os widgets).</p>
      <div class="acts" style="justify-content:flex-start"><button class="btn sec" id="wa">Atualizar widgets agora</button></div>
      <p class="hint">Os widgets se atualizam sempre que você mexe no app. Se algum aparecer “desatualizado”, abra o app uma vez.</p>`);
    s.$('[name=wv]').onchange = e => { DB.cfg.widgetValores = e.target.checked; ultimoAreas = ''; Store.salvar(); };
    s.$('#wa').onclick = () => { if (!P()) return toast('Só funciona no app instalado no celular.'); ultimo = ''; ultimoAreas = ''; enviar(); toast('Widgets atualizados.'); };
  }

  function init() {
    const salvarOrig = Store.salvar;
    Store.salvar = function () { salvarOrig.apply(Store, arguments); agendar(); };
    if (!P()) return;                                       // no navegador não há widget
    document.addEventListener('resume', aoVoltar);
    aoVoltar();
  }
  return { init, resumo, resumoAreas, enviar, aplicarFila, aplicarAcoes, aplicarAbertura, tela };
})();
