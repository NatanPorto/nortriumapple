'use strict';
/* =========================================================
   ESTUDOS — matérias com cronômetro e meta semanal, tópicos com domínio e revisão espaçada,
   aulas (com presença), provas/entregas com nota, peso e tópicos cobrados, pendências, histórico
   ========================================================= */
const Estudos = (() => {
  const S = { seg: 'materias', mat: null, per: 7 };
  const CORES = ['#6A4DB5', '#2D5FA6', '#1E7A5A', '#CF4B24', '#B0398A', '#8F6A0C'];
  const TIPOS = { prova: 'Prova', entrega: 'Entrega', revisao: 'Revisão' };
  const INT = [1, 3, 7, 14, 30];                       // dias até a próxima revisão, por nível
  const materia = id => DB.estudo.materias.find(m => m.id === id);
  const aulasL = () => (DB.estudo.aulas = DB.estudo.aulas || []);
  const topL = () => (DB.estudo.topicos = DB.estudo.topicos || []);
  const topico = id => topL().find(t => t.id === id);
  const topsDe = mid => topL().filter(t => t.materiaId === mid);
  const minSemana = id => DB.estudo.sessoes.filter(s => s.data >= inicioSemana(hoje()) && (!id || s.materiaId === id)).reduce((t, s) => t + s.min, 0);
  const minHoje = () => DB.estudo.sessoes.filter(s => s.data === hoje()).reduce((t, s) => t + s.min, 0);
  const minTopico = id => DB.estudo.sessoes.filter(s => s.topicoId === id).reduce((t, s) => t + s.min, 0);
  const proximos = (dias = 14) => DB.estudo.itens.filter(i => !i.feito && diasEntre(hoje(), i.data) <= dias).sort((a, b) => a.data.localeCompare(b.data));

  /* ---------- tópicos e revisão espaçada ---------- */
  const devida = t => t.status === 'estudando' && !!t.proxRev && t.proxRev <= hoje();
  const stLabel = t => t.status === 'novo' ? 'Não estudado' : t.status === 'dominado' ? 'Dominado' : devida(t) ? 'Revisar' : 'Estudando';
  const revDevidas = () => topL().filter(devida).sort((a, b) => a.proxRev.localeCompare(b.proxRev));
  const atrasados = () => DB.estudo.itens.filter(i => !i.feito && i.data < hoje()).sort((a, b) => a.data.localeCompare(b.data));
  const pend = () => ({ rev: revDevidas().length, atras: atrasados().length, nota: semNota().length });
  function primeiroEstudo(t) { t.status = 'estudando'; t.nivel = 0; t.ultima = hoje(); t.proxRev = addDias(hoje(), INT[0]); }
  function revisar(t, q) {                              // q: 0 difícil, 1 bom, 2 fácil
    t.ultima = hoje();
    t.nivel = Math.max(0, (t.nivel || 0) + (q === 0 ? -1 : q === 2 ? 2 : 1));
    if (t.nivel >= INT.length) { t.status = 'dominado'; t.proxRev = ''; } else { t.status = 'estudando'; t.proxRev = addDias(hoje(), INT[t.nivel]); }
  }
  function progresso(i) {
    const l = (i.cobre || []).map(topico).filter(Boolean), est = l.filter(t => t.status !== 'novo').length, dom = l.filter(t => t.status === 'dominado').length;
    return { n: l.length, est, dom, pct: l.length ? Math.round(est / l.length * 100) : 0, faltam: l.filter(t => t.status === 'novo') };
  }
  function infoMedia(m) {
    const max = m.notaMax || 10, alvo = m.mediaAlvo || 0;
    const av = DB.estudo.itens.filter(i => i.materiaId === m.id && i.tipo !== 'revisao' && i.peso > 0);
    const com = av.filter(i => typeof i.nota === 'number'), pd_ = av.filter(i => typeof i.nota !== 'number');
    const C = com.reduce((t, i) => t + i.nota * i.peso, 0), Pc = com.reduce((t, i) => t + i.peso, 0), Pp = pd_.reduce((t, i) => t + i.peso, 0);
    return { max, alvo, av, com, pend: pd_, Pc, Pp, atual: Pc ? C / Pc : null, need: (alvo && Pp) ? (alvo * (Pc + Pp) - C) / Pp : null };
  }
  const n1 = n => numStr(Math.round(n * 100) / 100);

  /* situação da matéria: usa as regras da instituição (Curso) se a matéria veio de uma disciplina; senão, as regras da própria matéria */
  const discDe = m => (DB.estudo.disciplinas || []).find(d => d.materiaId === m.id);
  function situacao(m) {
    const d = discDe(m), c = d ? (DB.estudo.cursos || []).find(x => x.id === d.cursoId) : null;
    const c2 = c || { regras: { max: m.notaMax || 10, mediaAprov: m.mediaAlvo || 0, exame: !!m.exameMin, exameMin: m.exameMin || 0, exameMedia: m.exameMedia || 5, exameVale: 50, freqMin: 0, casas: 1 } };
    const R = Curso.reg(c2); if (!(R.mediaAprov > 0)) return null;
    const av = DB.estudo.itens.filter(i => i.materiaId === m.id && i.tipo !== 'revisao' && i.peso > 0).map(i => ({ peso: i.peso, nota: typeof i.nota === 'number' ? i.nota : null }));
    const e = Curso.calc({ aval: av, aulasTotal: d ? d.aulasTotal : 0, faltas: d ? d.faltas : 0, exame: d ? d.exame : null }, c2);
    return { e, R, d, c };
  }
  function textoSit(m) {                                   // { cls, txt } ou null
    const S_ = situacao(m); if (!S_ || S_.e.sit === 'vazio') return null;
    const { e, R } = S_, q = e.pend.length, rest = q === 1 ? 'na avaliação que falta' : `na média das ${q} avaliações que faltam`;
    if (e.label === 'Reprovado por falta') return { cls: 'neg', txt: 'Reprovado por falta: passou do limite de faltas.' };
    if (e.sit === 'aprov') return { cls: 'pos', txt: e.media !== null ? `Aprovado${typeof (S_.d || {}).exame === 'number' ? ' na prova final' : ''}: média ${n1(e.mediaFinal || e.media)} (mínimo ${n1(R.mediaAprov)}${e.mediaFinal ? '; na final ' + n1(R.exameMedia) : ''}).` : 'Aprovação garantida: o que falta não muda o resultado.' };
    if (e.sit === 'andamento') return { cls: '', txt: `Em andamento: para passar direto precisa de ${n1(e.needAprov)} ${rest}.` + (R.exame && e.needExame !== null && e.needExame <= R.max ? ` Se não chegar lá, vai para a prova final com ${n1(Math.max(0, e.needExame))} ${rest}.` : '') };
    if (e.sit === 'exame') return e.media === null
      ? { cls: 'neg', txt: `Passar direto já não é possível. Vai para a prova final se tirar ${n1(Math.max(0, e.needExame))} ${rest}.` }
      : { cls: 'neg', txt: `Média ${n1(e.media)}: você vai fazer a prova final e precisa de ${e.exameNeed > R.max ? 'mais que a nota máxima (não dá para passar)' : n1(Math.max(0, e.exameNeed)) + ' nela'} (média final mínima ${n1(R.exameMedia)}).` };
    if (e.sit === 'rep') return { cls: 'neg', txt: e.media === null ? `Reprovação certa: mesmo com ${n1(R.max)} ${rest}, a média não chega ao mínimo${R.exame ? ' nem à prova final' : ''}.` : `Reprovado: média ${n1(e.media)}, abaixo de ${n1(R.exame ? R.exameMin : R.mediaAprov)}${R.exame ? ' (mínimo para a prova final)' : ''}.` };
    return null;
  }
  const semNota = () => DB.estudo.itens.filter(i => i.tipo === 'prova' && i.data <= hoje() && typeof i.nota !== 'number').sort((a, b) => a.data.localeCompare(b.data));

  function parar() {
    const t = Cron.fim('estudo'); if (!t) return;
    const m = materia(t.materiaId), tp = t.topicoId && topico(t.topicoId), antes = tp ? { ...tp } : null;
    const sessao = { id: uid('es'), materiaId: t.materiaId, topicoId: tp ? tp.id : '', data: ymd(new Date(t.inicio)), min: t.min, nota: '' };
    DB.estudo.sessoes.push(sessao);
    if (tp && tp.status === 'novo') primeiroEstudo(tp);
    commit();
    toast(`Registrado: ${dur(t.min)}${m ? ' de ' + m.nome : ''}${tp ? ' · ' + tp.nome : ''}`, () => { DB.estudo.sessoes = DB.estudo.sessoes.filter(x => x !== sessao); if (antes) Object.assign(tp, antes); commit(); });
  }
  function comecar(id, tid) { if (Cron.get('estudo')) parar(); Cron.ini('estudo', { materiaId: id, topicoId: tid || '' }); commit(); }

  function estudei(t) {
    if (!t) return; const antes = { ...t }; primeiroEstudo(t); commit();
    toast(`Revisão marcada para ${quando(t.proxRev)}`, () => { Object.assign(t, antes); commit(); });
  }
  async function revisarDlg(t) {
    if (!t) return;
    const r = await dialog(`Como foi revisar "${t.nome}"?`, ['Difícil', 'Bom', 'Fácil']); if (r < 0) return;
    const antes = { ...t }; revisar(t, r); commit();
    toast(t.status === 'dominado' ? 'Tópico dominado!' : `Próxima revisão ${quando(t.proxRev)}`, () => { Object.assign(t, antes); commit(); });
  }

  /* ---------- listas reaproveitadas ---------- */
  function linhaItem(i, extra = '') {
    const m = materia(i.materiaId), atras = !i.feito && i.data < hoje(), p = progresso(i), temNota = typeof i.nota === 'number';
    return `<div class="row${i.feito ? ' done' : ''}" data-i="${i.id}"><button class="ck${i.feito ? ' on' : ''}" data-ck="${i.id}" aria-label="Concluir"></button><div class="t"><b>${esc(i.titulo)}</b><small>${TIPOS[i.tipo] || ''}${m ? ' · ' + esc(m.nome) : ''} · <span class="${atras ? 'neg' : ''}">${fmtData(i.data)}${i.feito ? '' : ' · ' + quando(i.data)}</span></small>${p.n && !i.feito ? `<small>${p.est} de ${p.n} tópicos estudados</small>${extra}<div class="bar"><i style="width:${p.pct}%"></i></div>` : ''}</div>${temNota ? `<span class="n">${numStr(i.nota)}</span>` : (i.tipo === 'prova' && i.data <= hoje()) ? `<button class="btn" data-nota="${i.id}" style="padding:6px 12px">Lançar nota</button>` : ''}</div>`;
  }
  function linhaTop(t) {
    const dev = devida(t), min = minTopico(t.id);
    const sub = [stLabel(t), t.status === 'estudando' && t.proxRev ? (dev ? 'venceu ' : 'revisão ') + quando(t.proxRev) : '', min ? dur(min) : ''].filter(Boolean).join(' · ');
    const btn = t.status === 'novo' ? `<button class="btn sec" data-est="${t.id}" style="padding:6px 12px">Estudei</button>` : dev ? `<button class="btn" data-rev="${t.id}" style="padding:6px 12px">Revisei</button>` : '';
    return `<div class="row" data-t="${t.id}" data-m="${t.materiaId}"><span class="dot" style="background:${t.status === 'dominado' ? 'var(--ok)' : t.status === 'novo' ? 'var(--ln)' : dev ? 'var(--bad)' : 'var(--cor)'}"></span><div class="t"><b>${esc(t.nome)}</b><small class="${dev ? 'neg' : ''}">${esc(sub)}</small></div>${btn}<button class="btn sec" data-play="${t.id}" aria-label="Estudar este tópico" style="padding:6px 10px">▶</button></div>`;
  }
  function linhaRev(t) {
    const m = materia(t.materiaId), dev = devida(t);
    return `<div class="row" data-t="${t.id}" data-m="${t.materiaId}"><span class="dot" style="background:${esc(m ? m.cor : '#999')}"></span><div class="t"><b>${esc(t.nome)}</b><small class="${dev ? 'neg' : ''}">${esc(m ? m.nome : '')} · ${dev ? 'venceu ' : 'revisão '}${quando(t.proxRev)}</small></div>${dev ? `<button class="btn" data-rev="${t.id}" style="padding:6px 12px">Revisei</button>` : ''}</div>`;
  }
  function ligar(el) {
    $$('[data-est]', el).forEach(b => b.onclick = e => { e.stopPropagation(); estudei(topico(b.dataset.est)); });
    $$('[data-rev]', el).forEach(b => b.onclick = e => { e.stopPropagation(); revisarDlg(topico(b.dataset.rev)); });
    $$('[data-play]', el).forEach(b => b.onclick = e => { e.stopPropagation(); const t = topico(b.dataset.play); if (t) comecar(t.materiaId, t.id); });
    $$('[data-t]', el).forEach(r => r.onclick = () => { const t = topico(r.dataset.t); if (t) formTopico(t, t.materiaId); });
    $$('[data-nota]', el).forEach(b => b.onclick = e => { e.stopPropagation(); formNota(DB.estudo.itens.find(x => x.id === b.dataset.nota)); });
    $$('[data-i]', el).forEach(r => r.onclick = e => {
      const i = DB.estudo.itens.find(x => x.id === r.dataset.i); if (!i) return;
      if (e.target.closest('[data-nota]')) return;
      if (e.target.closest('[data-ck]')) { i.feito = !i.feito; commit(); } else formItem(i);
    });
  }
  const runHtml = () => {
    const run = Cron.get('estudo'); if (!run) return '';
    const rm = materia(run.materiaId), rt = run.topicoId && topico(run.topicoId);
    return `<div class="run"><div><small>Estudando ${esc(rm ? rm.nome : '')}${rt ? ' · ' + esc(rt.nome) : ''}</small><div class="cron" data-cron="estudo">${Cron.fmt(Date.now() - run.inicio)}</div></div><button id="stop">Parar</button></div>`;
  };

  /* ---------- telas ---------- */
  function render(el) {
    if (S.mat && materia(S.mat)) return rDet(el);
    S.mat = null;
    const n = pend().rev + pend().atras;
    el.innerHTML = segHtml([['materias', 'Matérias'], ['curso', 'Curso'], ['pend', 'Pendências' + (n ? ` (${n})` : '')], ['stats', 'Estatísticas'], ['aulas', 'Aulas'], ['itens', 'Provas e entregas'], ['hist', 'Histórico']], S.seg) + '<div id="es-c"></div>';
    $$('.seg button', el).forEach(b => b.onclick = () => { S.seg = b.dataset.s; refresh(); });
    ({ materias: rMat, curso: el => Curso.render(el), pend: rPend, stats: rStats, aulas: rAulas, itens: rItens, hist: rHist })[S.seg]($('#es-c', el));
  }

  function rMat(el) {
    el.innerHTML = runHtml() +
      `<div class="card"><small class="mu">Esta semana</small><div class="big">${dur(minSemana())}</div><small class="mu">Hoje: ${dur(minHoje())}</small></div>` +
      (DB.estudo.materias.length ? DB.estudo.materias.map(m => {
        const run = Cron.get('estudo'), w = minSemana(m.id), meta = (m.metaHoras || 0) * 60, p = meta ? Math.min(100, Math.round(w / meta * 100)) : 0, ativa = run && run.materiaId === m.id;
        const ts = topsDe(m.id), dom = ts.filter(t => t.status === 'dominado').length, rv = ts.filter(devida).length;
        return `<div class="card" data-open="${m.id}" style="border-left:4px solid ${esc(m.cor)}"><h3><span>${esc(m.nome)}</span>${ativa ? '' : `<button class="btn" data-go="${m.id}" style="padding:6px 14px">Estudar</button>`}</h3>
          <small class="mu">${dur(w)}${meta ? ` de ${dur(meta)} na semana` : ' na semana'}</small>${meta ? `<div class="bar"><i style="width:${p}%;background:${esc(m.cor)}"></i></div>` : ''}
          ${(() => { const x = textoSit(m); return x ? `<small class="${x.cls}" style="display:block;margin-top:6px">${esc(x.txt)}</small>` : ''; })()}${ts.length ? `<small class="mu" style="display:block;margin-top:6px">${ts.length} tópico${ts.length > 1 ? 's' : ''} · ${dom} dominado${dom === 1 ? '' : 's'}${rv ? ` · <b class="neg">${rv} para revisar</b>` : ''}</small>` : ''}</div>`;
      }).join('') : '<div class="empty">Cadastre suas matérias ou cursos.<br>Toque em + para começar.</div>');
    const st = $('#stop', el); if (st) st.onclick = parar;
    $$('[data-go]', el).forEach(b => b.onclick = e => { e.stopPropagation(); comecar(b.dataset.go); });
    $$('[data-open]', el).forEach(c => c.onclick = () => { S.mat = c.dataset.open; refresh(); });
  }

  function rDet(el) {
    const m = materia(S.mat), run = Cron.get('estudo'), ativa = run && run.materiaId === m.id;
    const tops = topsDe(m.id), dom = tops.filter(t => t.status === 'dominado').length, rv = tops.filter(devida).length, w = minSemana(m.id), meta = (m.metaHoras || 0) * 60;
    const gr = {}; tops.forEach(t => { (gr[t.unidade || ''] = gr[t.unidade || ''] || []).push(t); });
    const chaves = Object.keys(gr).sort((a, b) => a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'pt-BR', { numeric: true }));
    const unico = chaves.length === 1 && chaves[0] === '';
    const mi = infoMedia(m);
    let media = '';
    if (mi.av.length || mi.alvo) {
      const l = [], ts_ = textoSit(m); if (ts_) l.push(`<b class="${ts_.cls}">${esc(ts_.txt)}</b>`);
      if (mi.atual !== null) l.push(`Média atual: <b>${n1(mi.atual)}</b> de ${numStr(mi.max)}${mi.alvo ? ` · meta ${n1(mi.alvo)}` : ''}`);
      if (mi.need !== null) {
        if (mi.need <= 0) l.push('<span class="pos">Meta garantida: o que falta não muda o resultado.</span>');
        else if (mi.need > mi.max) l.push(`<span class="neg">Mesmo com ${numStr(mi.max)} em tudo, a média não chega a ${n1(mi.alvo)}.</span>`);
        else l.push(mi.pend.length === 1 ? `Para chegar a ${n1(mi.alvo)}, precisa de <b>${n1(mi.need)}</b> em “${esc(mi.pend[0].titulo)}”.` : `Para chegar a ${n1(mi.alvo)}, precisa de média <b>${n1(mi.need)}</b> nas ${mi.pend.length} avaliações restantes (peso ${n1(mi.Pp)}).`);
      } else if (!mi.av.length) l.push('<span class="mu">Cadastre provas com peso para calcular a média.</span>');
      else if (mi.alvo && mi.atual !== null) l.push(mi.atual >= mi.alvo ? '<span class="pos">Todas as avaliações lançadas: dentro da meta.</span>' : '<span class="neg">Todas as avaliações lançadas: abaixo da meta.</span>');
      media = `<div class="dia">Notas</div><div class="card">${l.map(x => `<div style="margin:2px 0">${x}</div>`).join('')}</div>`;
    }
    const its = DB.estudo.itens.filter(i => i.materiaId === m.id).sort((a, b) => a.data.localeCompare(b.data));
    el.innerHTML = `<div class="mnav"><button data-back aria-label="Voltar">‹</button><b style="color:${esc(m.cor)}">${esc(m.nome)}</b><button data-edm style="width:auto;padding:0 12px;font-size:14px">Editar</button></div>
      ${runHtml()}
      <div class="sum"><div><small>Semana</small><b>${dur(w)}${meta ? ' / ' + dur(meta) : ''}</b></div><div><small>Dominados</small><b>${dom} de ${tops.length}</b></div><div><small>Revisar</small><b class="${rv ? 'neg' : ''}">${rv}</b></div></div>
      ${ativa ? '' : '<button class="btn block" data-go style="margin-bottom:6px">Estudar esta matéria</button>'}
      ${media}
      ${tops.length ? chaves.map(k => `<div class="dia">${unico ? 'Tópicos' : esc(k || 'Sem unidade')}</div><div class="card" style="padding:2px 14px">${gr[k].map(linhaTop).join('')}</div>`).join('') : '<div class="dia">Tópicos</div><div class="empty">Liste os assuntos desta matéria.<br>Toque em + para adicionar.</div>'}
      ${its.length ? `<div class="dia">Provas e entregas</div><div class="card" style="padding:2px 14px">${its.map(i => linhaItem(i)).join('')}</div>` : ''}`;
    $('[data-back]', el).onclick = () => { S.mat = null; refresh(); };
    $('[data-edm]', el).onclick = () => formMateria(m);
    const g = $('[data-go]', el); if (g) g.onclick = () => comecar(m.id);
    const st = $('#stop', el); if (st) st.onclick = parar;
    ligar(el);
  }

  function rPend(el) {
    const hj = hoje(), dev = revDevidas(), atr = atrasados();
    const provas = DB.estudo.itens.filter(i => !i.feito && i.tipo === 'prova' && i.data >= hj && diasEntre(hj, i.data) <= 21).sort((a, b) => a.data.localeCompare(b.data));
    const prox = topL().filter(t => t.status === 'estudando' && t.proxRev > hj && diasEntre(hj, t.proxRev) <= 7).sort((a, b) => a.proxRev.localeCompare(b.proxRev));
    const sec = (tit, l, fn) => l.length ? `<div class="dia">${tit}</div><div class="card" style="padding:2px 14px">${l.map(fn).join('')}</div>` : '';
    const html = sec('Aguardando a nota', semNota(), i => linhaItem(i)) + sec('Revisões para fazer', dev, linhaRev) + sec('Atrasados', atr, i => linhaItem(i)) + sec('Provas nas próximas 3 semanas', provas, i => {
      const p = progresso(i), falta = p.faltam.slice(0, 3).map(t => t.nome).join(', ');
      return linhaItem(i, falta ? `<small>Faltam: ${esc(falta)}${p.faltam.length > 3 ? '…' : ''}</small>` : '');
    }) + sec('Revisões nos próximos 7 dias', prox, linhaRev);
    el.innerHTML = html || '<div class="empty">Tudo em dia.<br>Revisões, provas e entregas pendentes aparecem aqui.</div>';
    ligar(el);
  }

  /* ---------- estatísticas ---------- */
  function rStats(el) {
    const hj = hoje(), per = S.per, ses = DB.estudo.sessoes, mats = DB.estudo.materias;
    const semana0 = inicioSemana(hj), min = (l) => l.reduce((t, s_) => t + s_.min, 0);
    const porDia = {}; ses.forEach(s_ => { porDia[s_.data] = (porDia[s_.data] || 0) + s_.min; });
    const ini = per === 90 ? addDias(semana0, -77) : addDias(hj, -(per - 1));
    const noPer = ses.filter(s_ => s_.data >= ini && s_.data <= hj), total = min(noPer);
    const dias = new Set(noPer.map(s_ => s_.data)).size, nDias = per === 90 ? diasEntre(ini, hj) + 1 : per;
    let seq = 0, x = porDia[hj] ? hj : addDias(hj, -1); while (porDia[x] && seq < 3650) { seq++; x = addDias(x, -1); }

    // horas por dia (ou por semana, no período de 12 semanas)
    const barras = [];
    if (per === 90) for (let w = 0; w < 12; w++) { const a = addDias(ini, w * 7); let m_ = 0; for (let k = 0; k < 7; k++) m_ += porDia[addDias(a, k)] || 0; barras.push({ m: m_, rot: w % 3 === 0 ? `${+a.slice(8)}/${+a.slice(5, 7)}` : '', v: '' }); }
    else for (let k = 0; k < per; k++) { const d = addDias(ini, k), m_ = porDia[d] || 0; barras.push({ m: m_, rot: per === 7 ? DIAS[pd(d).getDay()] : (k % 5 === 0 ? String(+d.slice(8)) : ''), v: per === 7 && m_ ? dur(m_) : '' }); }
    const pico = Math.max(1, ...barras.map(b => b.m));
    const grafico = `<div class="gr">${barras.map(b => `<div><i style="height:${Math.round(b.m / pico * 100)}%"></i></div>`).join('')}</div>
      ${per === 7 ? `<div class="gl">${barras.map(b => `<span>${b.v}</span>`).join('')}</div>` : ''}<div class="gl">${barras.map(b => `<span>${b.rot}</span>`).join('')}</div>`;

    // tempo por matéria
    const pm = mats.map(m => ({ m, t: min(noPer.filter(s_ => s_.materiaId === m.id)) })).filter(r => r.t > 0).sort((a, b) => b.t - a.t);
    const porMat = pm.length ? pm.map(r => `<div style="margin:9px 0"><div style="display:flex;justify-content:space-between;gap:8px"><span><span style="display:inline-block;width:8px;height:8px;background:${esc(r.m.cor)};margin-right:6px"></span>${esc(r.m.nome)}</span><span class="n">${dur(r.t)} · ${Math.round(r.t / total * 100)}%</span></div><div class="bar"><i style="width:${Math.round(r.t / total * 100)}%;background:${esc(r.m.cor)}"></i></div></div>`).join('') : '<small class="mu">Nenhuma sessão neste período.</small>';

    // planejado x realizado (metas semanais), últimas 6 semanas
    const comMeta = mats.filter(m => m.metaHoras > 0), metaTot = comMeta.reduce((t, m) => t + m.metaHoras * 60, 0), ids = new Set(comMeta.map(m => m.id));
    let semanas = '';
    if (metaTot) for (let w = 5; w >= 0; w--) {
      const a = addDias(semana0, -7 * w), b = addDias(a, 6), real = min(ses.filter(s_ => s_.data >= a && s_.data <= b && ids.has(s_.materiaId))), pc = Math.round(real / metaTot * 100);
      semanas += `<div style="margin:9px 0"><div style="display:flex;justify-content:space-between;gap:8px"><span>${w === 0 ? 'Esta semana' : 'Semana de ' + fmtData(a)}</span><span class="n ${pc >= 100 ? 'pos' : ''}">${dur(real)} de ${dur(metaTot)} · ${pc}%</span></div><div class="bar"><i style="width:${Math.min(100, pc)}%"></i></div></div>`;
    }
    else semanas = '<small class="mu">Defina a meta de horas por semana nas matérias para comparar planejado e realizado.</small>';

    // domínio dos tópicos por matéria
    const dm = mats.map(m => { const t = topsDe(m.id); return { m, n: t.length, dom: t.filter(y => y.status === 'dominado').length, est: t.filter(y => y.status === 'estudando').length }; }).filter(r => r.n);
    const topicos = dm.length ? dm.map(r => `<div style="margin:9px 0"><div style="display:flex;justify-content:space-between;gap:8px"><span>${esc(r.m.nome)}</span><span class="n">${r.dom} de ${r.n} dominados</span></div><div class="bar" style="height:8px;display:flex"><i style="width:${r.dom / r.n * 100}%;background:var(--ok)"></i><i style="width:${r.est / r.n * 100}%"></i></div><small class="mu">${r.dom} dominados · ${r.est} estudando · ${r.n - r.dom - r.est} não estudados</small></div>`).join('') : '<small class="mu">Cadastre tópicos nas matérias para acompanhar o domínio.</small>';

    // notas
    const notas = DB.estudo.itens.filter(i => typeof i.nota === 'number' && i.tipo !== 'revisao').sort((a, b) => b.data.localeCompare(a.data)).slice(0, 8).map(i => {
      const m = materia(i.materiaId), max = (m && m.notaMax) || 10, alvo = m && m.mediaAlvo, cor = alvo ? (i.nota >= alvo ? 'var(--ok)' : 'var(--bad)') : 'var(--cor)';
      return `<div style="margin:9px 0"><div style="display:flex;justify-content:space-between;gap:8px"><span>${esc(i.titulo)}${m ? ' · ' + esc(m.nome) : ''}</span><span class="n">${numStr(i.nota)} / ${numStr(max)}</span></div><div class="bar"><i style="width:${Math.min(100, i.nota / max * 100)}%;background:${cor}"></i></div></div>`;
    }).join('');

    // calendário de atividade (5 semanas)
    const i0 = addDias(semana0, -28), nivel = m_ => m_ >= 120 ? 1 : m_ >= 60 ? .7 : m_ >= 30 ? .45 : m_ > 0 ? .25 : 0;
    const calend = `<div class="heat">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => `<b>${d}</b>`).join('')}${Array.from({ length: 35 }, (_, k) => {
      const d = addDias(i0, k), m_ = porDia[d] || 0, fut = d > hj;
      return `<i title="${fmtData(d)} · ${dur(m_)}" style="${fut ? 'background:none;border:1px dashed var(--ln)' : m_ ? `background:var(--cor);opacity:${nivel(m_)}` : ''}${d === hj ? ';outline:2px solid var(--ink)' : ''}"></i>`;
    }).join('')}</div>`;

    // atenção
    const av = [], rv = revDevidas().length, idxSem = diasEntre(semana0, hj);
    if (rv) av.push(`${rv} revisã${rv > 1 ? 'ões vencidas' : 'o vencida'}`);
    mats.forEach(m => {
      const ult = ses.filter(s_ => s_.materiaId === m.id).map(s_ => s_.data).sort().pop(), sem = ult ? diasEntre(ult, hj) : null;
      const pr = DB.estudo.itens.filter(i => i.materiaId === m.id && !i.feito && i.tipo === 'prova' && i.data >= hj && diasEntre(hj, i.data) <= 21).sort((a, b) => a.data.localeCompare(b.data))[0];
      if (pr && (sem === null || sem >= 5)) av.push(`${m.nome}: ${pr.titulo} ${quando(pr.data)} e ${sem === null ? 'nenhuma sessão registrada' : 'sem estudar há ' + sem + ' dias'}`);
      const meta = (m.metaHoras || 0) * 60, real = minSemana(m.id);
      if (meta && idxSem >= 2 && real < meta * (idxSem + 1) / 7 * .5) av.push(`${m.nome}: ${dur(real)} de ${dur(meta)} na semana (ritmo abaixo do esperado)`);
    });
    DB.estudo.itens.filter(i => !i.feito && i.tipo === 'prova' && i.data >= hj && diasEntre(hj, i.data) <= 14).forEach(i => { const p = progresso(i); if (p.n && p.pct < 50) av.push(`${i.titulo}: só ${p.pct}% dos tópicos cobrados foram estudados`); });

    const metaSem = mats.reduce((a, m) => a + (m.metaHoras || 0) * 60, 0), realSem = minSemana();
    const cardMeta = metaSem ? `<div class="card"><div class="rcard">${Graf.anel(Math.min(100, Math.round(realSem / metaSem * 100)))}<div class="rtx"><small class="mu">Meta da semana</small><div class="big">${dur(realSem)}</div><small class="mu">de ${dur(metaSem)} planejados</small></div></div></div>` : '';
    el.innerHTML = `<div class="seg sm">${[[7, '7 dias'], [30, '30 dias'], [90, '12 semanas']].map(([v, l]) => `<button data-p="${v}" class="${per === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${cardMeta}
      <div class="sum"><div><small>Total</small><b>${dur(total)}</b></div><div><small>Dias ativos</small><b>${dias} de ${nDias}</b></div><div><small>Sequência</small><b>${seq} dia${seq === 1 ? '' : 's'}</b></div></div>
      ${av.length ? `<div class="card mod" style="--cor:var(--bad)"><h3>Atenção</h3>${av.slice(0, 5).map(t => `<div class="row"><div class="t"><b style="white-space:normal">${esc(t)}</b></div></div>`).join('')}</div>` : ''}
      <div class="dia">${per === 90 ? 'Horas por semana' : 'Horas por dia'}</div><div class="card">${total ? grafico : '<small class="mu">Nenhuma sessão neste período.</small>'}${total ? `<small class="mu" style="display:block;margin-top:8px">${per === 90 ? 'Maior semana' : 'Maior dia'}: ${dur(pico)}${dias ? ` · média de ${dur(total / dias)} por dia ativo` : ''}</small>` : ''}</div>
      <div class="dia">Tempo por matéria</div><div class="card">${porMat}</div>
      <div class="dia">Metas semanais: planejado × realizado</div><div class="card">${semanas}</div>
      <div class="dia">Domínio dos tópicos</div><div class="card">${topicos}</div>
      ${notas ? `<div class="dia">Notas recentes</div><div class="card">${notas}</div>` : ''}
      <div class="dia">Dias de estudo (5 semanas)</div><div class="card">${calend}<small class="mu" style="display:block;margin-top:8px">Quanto mais escuro, mais tempo estudado no dia.</small></div>`;
    $$('[data-p]', el).forEach(b => b.onclick = () => { S.per = +b.dataset.p; refresh(); });
  }

  function rItens(el) {
    const abertos = DB.estudo.itens.filter(i => !i.feito).sort((a, b) => a.data.localeCompare(b.data));
    const feitos = DB.estudo.itens.filter(i => i.feito).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 8);
    el.innerHTML = (abertos.length ? `<div class="card" style="padding:2px 14px">${abertos.map(i => linhaItem(i)).join('')}</div>` : '<div class="empty">Nenhuma prova ou entrega pendente.<br>Toque em + para adicionar.</div>') +
      (feitos.length ? `<div class="dia">Concluídos</div><div class="card" style="padding:2px 14px">${feitos.map(i => linhaItem(i)).join('')}</div>` : '');
    ligar(el);
  }

  function rHist(el) {
    const l = [...DB.estudo.sessoes].sort((a, b) => b.data.localeCompare(a.data));
    el.innerHTML = l.length ? `<div class="card" style="padding:2px 14px">${l.slice(0, 80).map(s => { const m = materia(s.materiaId), tp = s.topicoId && topico(s.topicoId); return `<div class="row" data-s="${s.id}"><span class="dot" style="background:${esc(m ? m.cor : '#999')}"></span><div class="t"><b>${esc(m ? m.nome : 'Matéria removida')}${tp ? ' · ' + esc(tp.nome) : ''}</b><small>${fmtDiaCurto(s.data)}${s.nota ? ' · ' + esc(s.nota) : ''}</small></div><span class="n">${dur(s.min)}</span></div>`; }).join('')}</div>` : '<div class="empty">As sessões de estudo aparecem aqui.<br>Toque em + para registrar uma manualmente.</div>';
    $$('[data-s]', el).forEach(r => r.onclick = () => formSessao(DB.estudo.sessoes.find(s => s.id === r.dataset.s)));
  }

  /* ---------- formulários ---------- */
  function formMateria(m) {
    const novo = !m, ini = m || { nome: '', cor: CORES[DB.estudo.materias.length % CORES.length], metaHoras: '', mediaAlvo: 7, notaMax: 10 };
    const cursosL = DB.estudo.cursos || [], discL = (DB.estudo.disciplinas || []).filter(d => !d.materiaId || !materia(d.materiaId));
    const grupos = cursosL.map(c => ({ c, l: discL.filter(d => d.cursoId === c.id).sort((a, b) => (a.periodo || 99) - (b.periodo || 99) || a.nome.localeCompare(b.nome, 'pt-BR')) })).filter(g => g.l.length);
    const puxar = !novo ? '' : (grupos.length ? F('Puxar do seu curso', `<select name="puxar"><option value="">Escolher uma disciplina…</option>${grupos.map(g => `<optgroup label="${esc((g.c.curso || 'Curso') + ' · ' + g.c.nome)}">${g.l.map(d => `<option value="${d.id}">${esc(d.nome)}${d.periodo ? ' (' + d.periodo + 'º período)' : ''}</option>`).join('')}</optgroup>`).join('')}</select>`) + '<p class="hint" id="pxh">Lista as disciplinas cadastradas em Curso, com o curso e a instituição de cada uma. Ao escolher, a matéria já vem com as regras de nota da instituição.</p>'
      : '<p class="hint">Para puxar disciplinas, cadastre sua instituição, o curso e as disciplinas na aba Curso. <a href="#" id="pxc" style="color:var(--cor)">Abrir Curso</a></p>');
    const s = sheet(novo ? 'Nova matéria' : 'Editar matéria', `${puxar}${F('Nome', inp('nome', ini.nome, 'placeholder="Ex.: Cálculo II"'))}
      <div class="g2">${F('Meta (horas por semana)', inp('metaHoras', ini.metaHoras ? numStr(ini.metaHoras) : '', 'inputmode="decimal"'))}${F('Cor', `<input type="color" name="cor" value="${esc(ini.cor)}" style="padding:2px;height:44px">`)}</div>
      <div class="g2">${F('Média para passar', inp('mediaAlvo', ini.mediaAlvo ? numStr(ini.mediaAlvo) : '', 'inputmode="decimal"'))}${F('Nota máxima', inp('notaMax', numStr(ini.notaMax || 10), 'inputmode="decimal"'))}</div>
      <div class="g2">${F('Média mínima para a prova final', inp('exameMin', ini.exameMin ? numStr(ini.exameMin) : '', 'inputmode="decimal" placeholder="sem prova final"'))}${F('Média final após a prova final', inp('exameMedia', ini.exameMedia ? numStr(ini.exameMedia) : '', 'inputmode="decimal" placeholder="5"'))}</div>
      <p class="hint">A média e o simulador usam estes valores e o peso de cada prova. Se a matéria veio de uma disciplina do Curso, valem as regras da instituição.</p>
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    const pxs = s.$('[name=puxar]');
    if (pxs) pxs.onchange = () => {
      const dd = (DB.estudo.disciplinas || []).find(x => x.id === pxs.value), set = (n, v) => { s.$('[name=' + n + ']').value = v; };
      if (!dd) return; const c = cursosL.find(x => x.id === dd.cursoId), R = Curso.reg(c);
      set('nome', dd.nome); set('mediaAlvo', numStr(R.mediaAprov)); set('notaMax', numStr(R.max)); set('exameMin', R.exame ? numStr(R.exameMin) : ''); set('exameMedia', R.exame ? numStr(R.exameMedia) : '');
      s.$('#pxh').textContent = `Instituição: ${c ? c.nome : '—'} · Curso: ${c && c.curso ? c.curso : '—'}${dd.periodo ? ' · ' + dd.periodo + 'º período' : ''}${dd.creditos ? ' · ' + dd.creditos + ' créditos' : ''}.`;
    };
    const pxc = s.$('#pxc'); if (pxc) pxc.onclick = ev => { ev.preventDefault(); s.fechar(); S.seg = 'curso'; S.mat = null; refresh(); };
    if (!novo) s.$('[data-del]').onclick = async () => {
      if (!(await confirmar('Excluir esta matéria, seus tópicos, sessões, aulas e itens?'))) return;
      const bak = { m, ses: DB.estudo.sessoes.filter(x => x.materiaId === m.id), it: DB.estudo.itens.filter(x => x.materiaId === m.id), au: aulasL().filter(x => x.materiaId === m.id), tp: topsDe(m.id) };
      DB.estudo.materias = DB.estudo.materias.filter(x => x !== m); DB.estudo.sessoes = DB.estudo.sessoes.filter(x => x.materiaId !== m.id); DB.estudo.itens = DB.estudo.itens.filter(x => x.materiaId !== m.id); DB.estudo.aulas = aulasL().filter(x => x.materiaId !== m.id); DB.estudo.topicos = topL().filter(x => x.materiaId !== m.id);
      if (Cron.get('estudo') && Cron.get('estudo').materiaId === m.id) Cron.fim('estudo');
      if (S.mat === m.id) S.mat = null;
      s.fechar(); commit();
      toast('Matéria excluída', () => { DB.estudo.materias.push(bak.m); DB.estudo.sessoes.push(...bak.ses); DB.estudo.itens.push(...bak.it); aulasL().push(...bak.au); topL().push(...bak.tp); commit(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), meta = v.metaHoras.trim() ? num(v.metaHoras) : 0, alvo = v.mediaAlvo.trim() ? num(v.mediaAlvo) : 0, max = v.notaMax.trim() ? num(v.notaMax) : 10;
      if (!v.nome.trim()) return toast('Informe o nome.');
      if (isNaN(meta) || meta < 0) return toast('Meta inválida.');
      if (isNaN(alvo) || alvo < 0) return toast('Média para passar inválida.');
      if (isNaN(max) || max <= 0) return toast('Nota máxima inválida.');
      if (alvo > max) return toast('A média para passar não pode ser maior que a nota máxima.');
      const eMin = v.exameMin.trim() ? num(v.exameMin) : 0, eMed = v.exameMedia.trim() ? num(v.exameMedia) : 0;
      if (isNaN(eMin) || eMin < 0 || isNaN(eMed) || eMed < 0) return toast('Média da prova final inválida.');
      if (eMin && alvo && eMin >= alvo) return toast('A média para fazer a prova final deve ser menor que a média para passar.');
      const d = { nome: v.nome.trim(), cor: v.cor, metaHoras: meta, mediaAlvo: alvo, notaMax: max, exameMin: eMin, exameMedia: eMed };
      if (novo) { const nid = uid('ma'); DB.estudo.materias.push({ id: nid, ...d }); const dd = v.puxar && (DB.estudo.disciplinas || []).find(x => x.id === v.puxar); if (dd) dd.materiaId = nid; } else Object.assign(m, d);
      s.fechar(); commit();
    };
  }

  function formTopico(t, mid) {
    const novo = !t, ini = t || { nome: '', unidade: '', status: 'novo', proxRev: '' };
    const unidades = [...new Set(topsDe(mid).map(x => x.unidade).filter(Boolean))];
    const s = sheet(novo ? 'Novos tópicos' : 'Editar tópico', `
      ${novo ? F('Tópicos (um por linha)', '<textarea name="nome" placeholder="Integrais definidas&#10;Integração por partes"></textarea>') : F('Nome', inp('nome', ini.nome))}
      ${F('Unidade ou capítulo (opcional)', inp('unidade', ini.unidade || '', 'list="un-l" placeholder="Ex.: Integrais"') + `<datalist id="un-l">${unidades.map(u => `<option value="${esc(u)}">`).join('')}</datalist>`)}
      ${novo ? '' : `<div class="g2">${F('Situação', sel('status', [['novo', 'Não estudado'], ['estudando', 'Estudando'], ['dominado', 'Dominado']], ini.status))}${F('Próxima revisão', inp('proxRev', ini.proxRev || '', 'type="date"'))}</div><p class="hint">Mude a data para adiar ou antecipar a revisão. Tópicos “Estudando” voltam a cada 1, 3, 7, 14 e 30 dias conforme suas respostas; depois disso ficam dominados.</p>`}
      ${(!novo && ini.status === 'estudando') ? '<button class="btn sec block" data-rev style="margin-bottom:12px">Registrar revisão agora</button>' : ''}
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    if (!novo) {
      const rb = s.$('[data-rev]'); if (rb) rb.onclick = () => { s.fechar(); revisarDlg(t); };
      s.$('[data-del]').onclick = async () => {
        if (!(await confirmar('Excluir este tópico?'))) return;
        const idx = topL().indexOf(t); topL().splice(idx, 1); s.fechar(); commit();
        toast('Tópico excluído', () => { topL().splice(idx, 0, t); commit(); });
      };
    }
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), unidade = v.unidade.trim();
      if (novo) {
        const nomes = v.nome.split('\n').map(x => x.trim()).filter(Boolean);
        if (!nomes.length) return toast('Informe pelo menos um tópico.');
        nomes.forEach(n => topL().push({ id: uid('tp'), materiaId: mid, unidade, nome: n, status: 'novo', nivel: 0, proxRev: '', ultima: '' }));
        s.fechar(); return commit();
      }
      if (!v.nome.trim()) return toast('Informe o nome.');
      if (v.proxRev && !dataOk(v.proxRev)) return toast('Data de revisão inválida.');
      const st = v.status;
      if (st !== t.status) {
        if (st === 'novo') { t.nivel = 0; t.proxRev = ''; t.ultima = ''; }
        else if (st === 'dominado') t.proxRev = '';
        else primeiroEstudo(t);
        t.status = st;
      }
      if (st === 'estudando' && v.proxRev && v.proxRev !== (ini.proxRev || '')) t.proxRev = v.proxRev;
      if (st === 'estudando' && !t.proxRev) t.proxRev = addDias(hoje(), INT[Math.min(t.nivel || 0, INT.length - 1)]);
      t.nome = v.nome.trim(); t.unidade = unidade;
      s.fechar(); commit();
    };
  }

  function formNota(i) {
    if (!i) return;
    const m = materia(i.materiaId), max = (m && m.notaMax) || 10;
    const s = sheet('Nota · ' + i.titulo, `<p class="hint">${m ? esc(m.nome) + ' · ' : ''}prova de ${fmtData(i.data)}</p>
      ${F(`Nota obtida (0 a ${numStr(max)})`, inp('nota', '', 'inputmode="decimal" placeholder="0,0"'))}
      ${F('Peso desta prova na média', inp('peso', i.peso ? numStr(i.peso) : '1', 'inputmode="decimal"'))}
      <div class="acts"><button class="btn" data-ok>Salvar nota</button></div>`);
    s.$('[name=nota]').focus();
    s.$('[data-ok]').onclick = async () => {
      const v = vals(s.el), nota = num(v.nota), peso = v.peso.trim() ? num(v.peso) : 1;
      if (!v.nota.trim() || isNaN(nota) || nota < 0) return toast('Informe a nota.');
      if (nota > max) return toast(`A nota não pode passar de ${numStr(max)}.`);
      if (isNaN(peso) || peso <= 0) return toast('O peso deve ser maior que zero para entrar na média.');
      i.nota = nota; i.peso = peso; i.feito = true; s.fechar(); commit();
      const t = m && textoSit(m), mi = m && infoMedia(m);
      await dialog(`Nota ${numStr(nota)} lançada.` + (mi && mi.atual !== null ? ` Média até agora: ${n1(mi.atual)}.` : '') + (t ? ` ${t.txt}` : ''), ['OK']);
    };
  }
  function formItem(i) {
    if (!DB.estudo.materias.length) return toast('Cadastre uma matéria primeiro.');
    const novo = !i, ini = i || { titulo: '', tipo: 'prova', data: hoje(), materiaId: S.mat || DB.estudo.materias[0].id, peso: 1, nota: null, cobre: [] };
    const marcados = new Set(ini.cobre || []);
    const s = sheet(novo ? 'Nova prova ou entrega' : 'Editar item', `${F('Título', inp('titulo', ini.titulo, 'placeholder="Ex.: Prova 1"'))}
      <div class="g2">${F('Tipo', sel('tipo', Object.entries(TIPOS), ini.tipo))}${F('Data', inp('data', ini.data, 'type="date"'))}</div>
      ${F('Matéria', sel('materiaId', DB.estudo.materias.map(m => [m.id, m.nome]), ini.materiaId))}
      <div id="av"><div class="g2">${F('Peso', inp('peso', ini.peso ? numStr(ini.peso) : '', 'inputmode="decimal"'))}${F('Nota obtida', inp('nota', typeof ini.nota === 'number' ? numStr(ini.nota) : '', 'inputmode="decimal"'))}</div>
      <p class="hint">Peso vazio = não entra na média. Deixe a nota em branco até sair o resultado.</p></div>
      <div class="f"><span>Tópicos cobrados</span><div id="cobre"></div></div>
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    const box = s.$('#cobre'), pintar = () => {
      const l = topsDe(s.$('[name=materiaId]').value);
      box.innerHTML = l.length ? l.map(t => `<label class="chk"><input type="checkbox" data-c="${t.id}" ${marcados.has(t.id) ? 'checked' : ''}><span>${esc(t.nome)}</span></label>`).join('') : '<small class="mu">Esta matéria ainda não tem tópicos. Cadastre-os na página da matéria.</small>';
      $$('[data-c]', box).forEach(c => c.onchange = () => { if (c.checked) marcados.add(c.dataset.c); else marcados.delete(c.dataset.c); });
    }, tipoMudou = () => { s.$('#av').hidden = s.$('[name=tipo]').value === 'revisao'; };
    s.$('[name=materiaId]').onchange = pintar; s.$('[name=tipo]').onchange = tipoMudou; pintar(); tipoMudou();
    if (!novo) s.$('[data-del]').onclick = async () => { if (await confirmar('Excluir este item?')) { DB.estudo.itens = DB.estudo.itens.filter(x => x !== i); s.fechar(); commit(); } };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el); if (!v.titulo.trim()) return toast('Informe o título.'); if (!dataOk(v.data)) return toast('Data inválida.');
      const rev = v.tipo === 'revisao', m = materia(v.materiaId), max = (m && m.notaMax) || 10;
      const peso = !rev && v.peso.trim() ? num(v.peso) : 0, nota = !rev && v.nota.trim() ? num(v.nota) : null;
      if (isNaN(peso) || peso < 0) return toast('Peso inválido.');
      if (nota !== null && (isNaN(nota) || nota < 0)) return toast('Nota inválida.');
      if (nota !== null && nota > max) return toast(`A nota não pode passar de ${numStr(max)}.`);
      const ids = new Set(topsDe(v.materiaId).map(t => t.id));
      const d = { titulo: v.titulo.trim(), tipo: v.tipo, data: v.data, materiaId: v.materiaId, peso, nota, cobre: [...marcados].filter(x => ids.has(x)) };
      if (novo) DB.estudo.itens.push({ id: uid('it'), ...d, feito: false }); else Object.assign(i, d);
      s.fechar(); commit();
    };
  }

  function formSessao(x) {
    if (!DB.estudo.materias.length) return toast('Cadastre uma matéria primeiro.');
    const novo = !x, ini = x || { materiaId: S.mat || DB.estudo.materias[0].id, topicoId: '', data: hoje(), min: '', nota: '' };
    const opts = (mid, val) => [['', 'Nenhum']].concat(topsDe(mid).map(t => [t.id, t.nome])).map(([v, l]) => `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(l)}</option>`).join('');
    const s = sheet(novo ? 'Registrar sessão' : 'Editar sessão', `${F('Matéria', sel('materiaId', DB.estudo.materias.map(m => [m.id, m.nome]), ini.materiaId))}
      ${F('Tópico (opcional)', `<select name="topicoId">${opts(ini.materiaId, ini.topicoId || '')}</select>`)}
      <div class="g2">${F('Data', inp('data', ini.data, 'type="date"'))}${F('Minutos', inp('min', ini.min, 'type="number" inputmode="numeric" min="1"'))}</div>
      ${F('Anotação (opcional)', inp('nota', ini.nota || ''))}
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    s.$('[name=materiaId]').onchange = () => { s.$('[name=topicoId]').innerHTML = opts(s.$('[name=materiaId]').value, ''); };
    if (!novo) s.$('[data-del]').onclick = async () => { if (await confirmar('Excluir esta sessão?')) { DB.estudo.sessoes = DB.estudo.sessoes.filter(y => y !== x); s.fechar(); commit(); } };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), min = parseInt(v.min); if (!(min > 0)) return toast('Informe os minutos.'); if (!dataOk(v.data)) return toast('Data inválida.');
      const tp = v.topicoId && topico(v.topicoId), d = { materiaId: v.materiaId, topicoId: tp && tp.materiaId === v.materiaId ? tp.id : '', data: v.data, min, nota: v.nota.trim() };
      if (novo) DB.estudo.sessoes.push({ id: uid('es'), ...d }); else Object.assign(x, d);
      if (novo && d.topicoId && topico(d.topicoId).status === 'novo') primeiroEstudo(topico(d.topicoId));
      s.fechar(); commit();
    };
  }

  /* ---------- aulas ---------- */
  function rAulas(el) {
    const hj = hoje(), L = aulasL(), porHora = (x, y) => (x.hora || '').localeCompare(y.hora || '');
    const vigentes = L.filter(a => !a.ate || a.ate >= hj);
    const sub = a => [a.hora && (a.hora + (a.horaFim ? '–' + a.horaFim : '')), a.local].filter(Boolean).join(' · ');
    const hojeL = L.filter(a => Agenda.ocorre(a, hj)).sort(porHora);
    const linhaHoje = a => { const m = materia(a.materiaId), f = !!(a.feitos && a.feitos[hj]), n = Object.keys(a.feitos || {}).length;
      return `<div class="row${f ? ' done' : ''}" data-a="${a.id}"><button class="ck${f ? ' on' : ''}" data-ck="${a.id}" aria-label="Marcar presença"></button><div class="t"><b>${esc(m ? m.nome : 'Sem matéria')}</b><small>${esc([sub(a), n ? n + ' presença' + (n > 1 ? 's' : '') : ''].filter(Boolean).join(' · '))}</small></div></div>`; };
    const linha = a => { const m = materia(a.materiaId);
      return `<div class="row" data-a="${a.id}"><span class="dot" style="background:${esc(m ? m.cor : '#999')}"></span><div class="t"><b>${esc(m ? m.nome : 'Sem matéria')}</b><small>${esc(sub(a) || 'Sem horário')}</small></div></div>`; };
    let h = '';
    if (hojeL.length) h += `<div class="dia">Hoje</div><div class="card" style="padding:2px 14px">${hojeL.map(linhaHoje).join('')}</div>`;
    const sem = [1, 2, 3, 4, 5, 6, 0].map(d => {
      const l = vigentes.filter(a => (a.dias || []).includes(d)).sort(porHora);
      return l.length ? `<div class="dia">${DIAS_L[d]}</div><div class="card" style="padding:2px 14px">${l.map(linha).join('')}</div>` : '';
    }).join('');
    el.innerHTML = h + (sem ? (hojeL.length ? '<div class="dia" style="margin-top:22px">Horário semanal</div>' : '') + sem
      : '<div class="empty">Cadastre suas aulas.<br>Toque em + para começar.</div>');
    $$('[data-a]', el).forEach(r => r.onclick = e => {
      const a = L.find(x => x.id === r.dataset.a); if (!a) return;
      if (e.target.closest('[data-ck]')) { a.feitos = a.feitos || {}; if (a.feitos[hj]) delete a.feitos[hj]; else a.feitos[hj] = true; commit(); }
      else formAula(a);
    });
  }

  function formAula(a) {
    if (!DB.estudo.materias.length) return toast('Cadastre uma matéria primeiro.');
    const novo = !a, ini = a || { materiaId: DB.estudo.materias[0].id, dias: [], hora: '', horaFim: '', local: '', data: hoje(), ate: '', avisos: null };
    const s = sheet(novo ? 'Nova aula' : 'Editar aula', `${F('Matéria', sel('materiaId', DB.estudo.materias.map(m => [m.id, m.nome]), ini.materiaId))}
      <div class="f"><span>Dias da semana</span><div class="dias">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label><input type="checkbox" data-d="${d}" ${(ini.dias || []).includes(d) ? 'checked' : ''}><span>${DIAS[d]}</span></label>`).join('')}</div></div>
      <div class="g2">${F('Início', inp('hora', ini.hora, 'type="time"'))}${F('Fim', inp('horaFim', ini.horaFim, 'type="time"'))}</div>
      ${F('Local / sala (opcional)', inp('local', ini.local || ''))}
      <div class="g2">${F('Aulas começam em', inp('data', ini.data, 'type="date"'))}${F('Terminam em (opcional)', inp('ate', ini.ate || '', 'type="date"'))}</div>
      <p class="hint">Toque na caixinha da aula, em “Hoje”, para marcar presença.</p>
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    if (!novo) s.$('[data-del]').onclick = async () => {
      if (!(await confirmar('Excluir esta aula e as presenças marcadas?'))) return;
      const idx = aulasL().indexOf(a); aulasL().splice(idx, 1); s.fechar(); commit();
      toast('Aula excluída', () => { aulasL().splice(idx, 0, a); commit(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), dias = s.$$('[data-d]').filter(c => c.checked).map(c => +c.dataset.d);
      if (!dias.length) return toast('Marque pelo menos um dia da semana.');
      if (!dataOk(v.data)) return toast('Informe a data de início.');
      if (v.ate && (!dataOk(v.ate) || v.ate < v.data)) return toast('Data final inválida.');
      const d = { materiaId: v.materiaId, dias, hora: v.hora, horaFim: v.horaFim, local: v.local.trim(), data: v.data, ate: v.ate, repete: 'semanal', cada: 1 };
      if (novo) aulasL().push({ id: uid('au'), ...d, feitos: {} }); else Object.assign(a, d);
      s.fechar(); commit();
    };
  }

  registrar({
    id: 'estudo', nome: 'Estudos', render,
    fab: () => S.mat ? () => formTopico(null, S.mat) : S.seg === 'curso' ? Curso.fab() : S.seg === 'materias' ? () => formMateria(null) : S.seg === 'aulas' ? () => formAula(null) : S.seg === 'itens' ? () => formItem(null) : S.seg === 'hist' ? () => formSessao(null) : null,
    fabLabel: () => S.mat ? 'Novos tópicos' : S.seg === 'curso' ? 'Nova disciplina' : S.seg === 'materias' ? 'Nova matéria' : S.seg === 'aulas' ? 'Nova aula' : S.seg === 'itens' ? 'Nova prova ou entrega' : 'Registrar sessão'
  });
  return { S, formNota, textoSit, minSemana, minHoje, proximos, comecar, parar, pend, progresso, revDevidas };
})();
