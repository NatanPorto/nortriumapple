'use strict';
/* =========================================================
   CURSO — instituições (cada uma com suas regras), disciplinas com créditos e pré-requisitos,
   fluxograma por período, boletim com média / exame / frequência e progresso para formar
   ========================================================= */
const Curso = (() => {
  const S = { inst: null, sub: 'resumo', sel: null, sem: 'atual', fx: [0, 0] };
  const ST = { pendente: 'Pendente', cursando: 'Cursando', aprovada: 'Aprovada', reprovada: 'Reprovada', trancada: 'Trancada', dispensada: 'Dispensada' };
  const FEITA = d => d.status === 'aprovada' || d.status === 'dispensada';
  const cursos = () => (DB.estudo.cursos = DB.estudo.cursos || []);
  const discs = () => (DB.estudo.disciplinas = DB.estudo.disciplinas || []);
  const curso = id => cursos().find(c => c.id === id);
  const disc = id => discs().find(d => d.id === id);
  const discsDe = cid => discs().filter(d => d.cursoId === cid);
  const atual = () => { if (!curso(S.inst)) S.inst = cursos()[0] ? cursos()[0].id : null; return curso(S.inst) || null; };
  const materia = id => DB.estudo.materias.find(m => m.id === id);
  const semAtual = () => { const t = new Date(); return t.getFullYear() + '.' + (t.getMonth() < 6 ? 1 : 2); };
  const n1 = n => numStr(Math.round(n * 100) / 100);
  const un = c => c.unidade || 'créditos';
  const restaurar = (o, antes) => { Object.keys(o).forEach(k => delete o[k]); Object.assign(o, antes); };

  /* ---------- regras ---------- */
  const REG = () => ({ max: 10, mediaAprov: 7, freqMin: 75, casas: 1, exame: false, exameMin: 4, exameMedia: 5, exameVale: 50 });
  const reg = c => ({ ...REG(), ...((c && c.regras) || {}) });
  const arred = (n, casas) => { const f = Math.pow(10, casas); return Math.round(n * f + 1e-9) / f; };
  const resumoRegras = c => {
    const R = reg(c), l = [`Aprovação com média ≥ ${n1(R.mediaAprov)} (de ${n1(R.max)})`];
    if (R.exame) l.push(`exame se a média ficar entre ${n1(R.exameMin)} e ${n1(R.mediaAprov)}; passa com média final ≥ ${n1(R.exameMedia)} (exame vale ${n1(R.exameVale)}%)`);
    if (R.freqMin) l.push(`frequência mínima ${n1(R.freqMin)}%`);
    return l.join(' · ');
  };

  /* ---------- cálculo do boletim de uma disciplina ---------- */
  function calc(d, c) {
    const R = reg(c), e = { R };
    const av = (d.aval || []).filter(a => a.peso > 0), com = av.filter(a => typeof a.nota === 'number'), pend = av.filter(a => typeof a.nota !== 'number');
    const C = com.reduce((t, a) => t + a.nota * a.peso, 0), Pc = com.reduce((t, a) => t + a.peso, 0), Pp = pend.reduce((t, a) => t + a.peso, 0);
    Object.assign(e, { av, com, pend, Pp, Pc });
    e.parcial = Pc ? C / Pc : null;                                   // média do que já saiu
    e.media = (!Pp && Pc) ? arred(C / Pc, R.casas) : null;            // média final (tudo lançado)
    const need = alvo => Pp ? (alvo * (Pc + Pp) - C) / Pp : null;     // nota média necessária nas avaliações restantes
    e.needAprov = need(R.mediaAprov); e.needExame = R.exame ? need(R.exameMin) : null;
    const tot = d.aulasTotal || 0, f = d.faltas || 0;
    e.freq = tot ? (tot - f) / tot * 100 : null;
    e.limFaltas = (tot && R.freqMin) ? Math.floor(tot * (1 - R.freqMin / 100) + 1e-9) : null;
    e.podeFaltar = e.limFaltas === null ? null : e.limFaltas - f;
    const sit = (k, l) => { e.sit = k; e.label = l; return e; };
    if (e.podeFaltar !== null && e.podeFaltar < 0) return sit('rep', 'Reprovado por falta');
    if (!av.length) return sit('vazio', 'Sem avaliações');
    if (Pp) {
      if (e.needAprov <= 0) return sit('aprov', 'Aprovação garantida');
      if (e.needAprov <= R.max) return sit('andamento', 'Em andamento');
      if (R.exame && e.needExame <= R.max) return sit('exame', 'Só passa por exame');
      return sit('rep', 'Reprovação certa');
    }
    const m = e.media;
    if (m >= R.mediaAprov) return sit('aprov', 'Aprovado');
    if (R.exame && m >= R.exameMin) {
      const pe = R.exameVale / 100;
      e.exameNeed = (R.exameMedia - m * (1 - pe)) / pe;
      if (typeof d.exame === 'number') {
        e.mediaFinal = arred(m * (1 - pe) + d.exame * pe, R.casas);
        return e.mediaFinal >= R.exameMedia ? sit('aprov', 'Aprovado no exame') : sit('rep', 'Reprovado no exame');
      }
      return sit('exame', 'Em exame');
    }
    return sit('rep', 'Reprovado');
  }
  const COR_SIT = { aprov: 'var(--ok)', rep: 'var(--bad)', exame: 'var(--c-treino)', andamento: 'var(--cor)', vazio: 'var(--mu)' };
  const COR_ST = { aprovada: 'var(--ok)', dispensada: 'var(--ok)', reprovada: 'var(--bad)', cursando: 'var(--cor)', trancada: 'var(--mu)', pendente: 'var(--mu)' };
  const pill = (txt, cor) => `<span class="pill" style="background:${cor}">${esc(txt)}</span>`;

  /* ---------- pré-requisitos ---------- */
  const preOk = d => (d.prereq || []).every(id => { const p = disc(id); return !p || FEITA(p); });
  const nivel = d => d.status === 'pendente' ? (preOk(d) ? 'livre' : 'bloq') : d.status;
  const libera = d => discs().filter(x => (x.prereq || []).includes(d.id));
  const depende = (a, b, vis = new Set()) => { if (vis.has(a)) return false; vis.add(a); const d = disc(a); return !!d && (d.prereq || []).some(p => p === b || depende(p, b, vis)); };

  /* ---------- progresso do curso ---------- */
  function prog(c) {
    const L = discsDe(c.id), soma = f => L.filter(f).reduce((t, d) => t + (d.creditos || 0), 0);
    const cad = soma(() => true), feito = soma(FEITA), cur = soma(d => d.status === 'cursando');
    const total = c.creditosTotal > 0 ? c.creditosTotal : cad, falta = Math.max(0, total - feito);
    const pc = x => total ? Math.min(100, x / total * 100) : 0;
    const nt = L.filter(d => (d.status === 'aprovada' || d.status === 'reprovada') && typeof d.notaFinal === 'number' && d.creditos > 0), cn = nt.reduce((t, d) => t + d.creditos, 0);
    const porSem = {}; L.filter(d => d.status === 'aprovada' && d.semestre).forEach(d => { porSem[d.semestre] = (porSem[d.semestre] || 0) + (d.creditos || 0); });
    const sems = Object.values(porSem), ritmo = sems.length ? sems.reduce((a, b) => a + b, 0) / sems.length : 0;
    return {
      L, cad, feito, cur, total, falta, pctFeito: pc(feito), pctCur: Math.min(100 - pc(feito), pc(cur)), pctFalta: total ? 100 - pc(feito) : 0,
      pctProj: pc(feito + cur), media: cn ? nt.reduce((t, d) => t + d.notaFinal * d.creditos, 0) / cn : null, ritmo,
      semRest: ritmo ? Math.ceil(Math.max(0, falta - cur) / ritmo) : null,
      livres: L.filter(d => nivel(d) === 'livre').length, refazer: L.filter(d => d.status === 'reprovada').length
    };
  }

  /* ---------- telas ---------- */
  function render(el) {
    const cs = cursos();
    if (!cs.length) {
      el.innerHTML = '<div class="empty">Cadastre sua instituição e o curso.<br>Depois liste as disciplinas: o fluxograma, o boletim e o quanto falta para formar aparecem aqui.</div><button class="btn block" data-novo>Cadastrar instituição</button>';
      $('[data-novo]', el).onclick = () => formCurso(null); return;
    }
    const c = atual(), SUBS = [['resumo', 'Resumo'], ['fluxo', 'Fluxograma'], ['bol', 'Boletim'], ['lista', 'Disciplinas']];
    el.innerHTML = `<div class="seg sm">${cs.map(x => `<button data-c="${x.id}" class="${x.id === c.id ? 'on' : ''}">${esc(x.nome)} · ${Math.round(prog(x).pctFeito)}%</button>`).join('')}<button data-novo aria-label="Nova instituição">＋</button></div>
      <div class="seg">${SUBS.map(([k, l]) => `<button data-sub="${k}" class="${S.sub === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="cu-c"></div>`;
    $$('[data-c]', el).forEach(b => b.onclick = () => { S.inst = b.dataset.c; S.sel = null; S.sem = 'atual'; S.fx = [0, 0]; refresh(); });
    $('[data-novo]', el).onclick = () => formCurso(null);
    $$('[data-sub]', el).forEach(b => b.onclick = () => { S.sub = b.dataset.sub; refresh(); });
    ({ resumo: rResumo, fluxo: rFluxo, bol: rBoletim, lista: rLista })[S.sub]($('#cu-c', el), c);
  }

  function rResumo(el, c) {
    const p = prog(c), u = un(c), L = p.L;
    if (!L.length) {
      el.innerHTML = `<div class="empty">Nenhuma disciplina em ${esc(c.nome)}.<br>Toque em + para adicionar uma, ou cadastre várias de uma vez.</div><button class="btn block" data-lote>Adicionar várias de uma vez</button><button class="btn sec block" data-edc style="margin-top:8px">Editar instituição e regras</button>`;
      $('[data-lote]', el).onclick = () => formLote(c); $('[data-edc]', el).onclick = () => formCurso(c); return;
    }
    const f1 = x => (Math.round(x * 10) / 10).toString().replace('.', ',');
    const tipo = t => { const l = L.filter(d => (d.tipo || 'obrig') === t), cr = x => x.reduce((s, d) => s + (d.creditos || 0), 0); return [cr(l.filter(FEITA)), cr(l)]; };
    const [oF, oT] = tipo('obrig'), [pF, pT] = tipo('optativa');
    const pers = [...new Set(L.map(d => d.periodo > 0 ? d.periodo : 0))].sort((a, b) => (a || 1e9) - (b || 1e9));
    const porPer = pers.map(k => {
      const l = L.filter(d => (d.periodo > 0 ? d.periodo : 0) === k), t = l.reduce((s, d) => s + (d.creditos || 0), 0), f = l.filter(FEITA).reduce((s, d) => s + (d.creditos || 0), 0), cu = l.filter(d => d.status === 'cursando').reduce((s, d) => s + (d.creditos || 0), 0);
      return `<div style="margin:9px 0"><div style="display:flex;justify-content:space-between;gap:8px"><span>${k ? k + 'º período' : 'Sem período / optativas'}</span><span class="n">${f} de ${t}</span></div><div class="bar" style="display:flex"><i style="width:${t ? f / t * 100 : 0}%;background:var(--ok)"></i><i style="width:${t ? cu / t * 100 : 0}%"></i></div></div>`;
    }).join('');
    const avisos = [];
    if (p.refazer) avisos.push(`${p.refazer} disciplina${p.refazer > 1 ? 's' : ''} reprovada${p.refazer > 1 ? 's' : ''} para refazer`);
    if (p.livres) avisos.push(`${p.livres} disciplina${p.livres > 1 ? 's' : ''} pendente${p.livres > 1 ? 's' : ''} já liberada${p.livres > 1 ? 's' : ''} (pré-requisitos cumpridos)`);
    if (c.creditosTotal > 0 && p.cad < c.creditosTotal) avisos.push(`Cadastradas ${p.cad} de ${c.creditosTotal} ${u}: faltam disciplinas na lista`);
    el.innerHTML = `<div class="card mod"><h3><span>${esc(c.curso || c.nome)}</span><a data-edc>Editar</a></h3><small class="mu">${esc(c.nome)}</small>
      <div class="big" style="margin-top:6px">${f1(p.pctFeito)}% concluído</div>
      <div class="bar" style="height:10px;display:flex"><i style="width:${p.pctFeito}%;background:var(--ok)"></i><i style="width:${p.pctCur}%"></i></div>
      <small class="mu" style="display:block;margin-top:6px">Faltam <b>${f1(p.pctFalta)}%</b> (${n1(p.falta)} de ${n1(p.total)} ${u})</small>
      ${p.cur ? `<small class="mu" style="display:block">Aprovado no que está cursando: ${f1(p.pctProj)}% concluído</small>` : ''}</div>
      <div class="sum"><div><small>Concluídos</small><b>${n1(p.feito)}</b></div><div><small>Cursando</small><b>${n1(p.cur)}</b></div><div><small>Faltam</small><b>${n1(p.falta)}</b></div></div>
      <div class="card"><div class="row"><div class="t"><b>Média geral</b><small>ponderada por ${u}, inclui reprovações</small></div><span class="n">${p.media === null ? '—' : n1(p.media)}</span></div>
        <div class="row"><div class="t"><b>Obrigatórias</b></div><span class="n">${n1(oF)} de ${n1(oT)}</span></div>
        ${pT ? `<div class="row"><div class="t"><b>Optativas</b></div><span class="n">${n1(pF)} de ${n1(pT)}</span></div>` : ''}
        ${p.semRest !== null ? `<div class="row"><div class="t"><b>Ritmo</b><small>${f1(p.ritmo)} ${u} por semestre aprovado</small></div><span class="n">${p.semRest ? '~' + p.semRest + ' sem.' : 'no fim'}</span></div>` : ''}</div>
      ${avisos.length ? `<div class="card mod" style="--cor:var(--c-treino)"><h3>Atenção</h3>${avisos.map(a => `<div class="row"><div class="t"><b style="white-space:normal">${esc(a)}</b></div></div>`).join('')}</div>` : ''}
      <div class="dia">Por período</div><div class="card">${porPer}</div>
      <div class="dia">Regras desta instituição</div><div class="card"><small>${esc(resumoRegras(c))}</small></div>
      <button class="btn sec block" data-lote>Adicionar várias disciplinas</button>`;
    $('[data-edc]', el).onclick = () => formCurso(c); $('[data-lote]', el).onclick = () => formLote(c);
  }

  function rLista(el, c) {
    const L = discsDe(c.id);
    if (!L.length) { el.innerHTML = '<div class="empty">Nenhuma disciplina.<br>Toque em + para adicionar.</div><button class="btn block" data-lote>Adicionar várias de uma vez</button>'; $('[data-lote]', el).onclick = () => formLote(c); return; }
    const gr = {}; L.forEach(d => { const k = d.periodo > 0 ? d.periodo : 0; (gr[k] = gr[k] || []).push(d); });
    const ks = Object.keys(gr).map(Number).sort((a, b) => (a || 1e9) - (b || 1e9));
    el.innerHTML = ks.map(k => `<div class="dia">${k ? k + 'º período' : 'Sem período / optativas'}</div><div class="card" style="padding:2px 14px">${gr[k].map(d => {
      const k2 = nivel(d), txt = k2 === 'livre' ? 'Pendente · liberada' : k2 === 'bloq' ? 'Pendente · bloqueada' : ST[d.status];
      return `<div class="row" data-d="${d.id}"><span class="dot" style="background:${COR_ST[d.status]}"></span><div class="t"><b>${esc(d.nome)}</b><small>${esc([d.codigo, txt, d.semestre, typeof d.notaFinal === 'number' ? 'nota ' + numStr(d.notaFinal) : ''].filter(Boolean).join(' · '))}</small></div><span class="n">${n1(d.creditos || 0)} cr</span></div>`;
    }).join('')}</div>`).join('') + '<button class="btn sec block" data-lote style="margin-top:8px">Adicionar várias de uma vez</button>';
    $$('[data-d]', el).forEach(r => r.onclick = () => formDisc(disc(r.dataset.d), c.id));
    $('[data-lote]', el).onclick = () => formLote(c);
  }

  /* ---------- fluxograma ---------- */
  function rFluxo(el, c) {
    const L = discsDe(c.id);
    if (!L.length) { el.innerHTML = '<div class="empty">Cadastre as disciplinas (com período e pré-requisitos) para montar o fluxograma.</div>'; return; }
    const W = 124, H = 70, GX = 30, GY = 10, TOP = 30, PAD = 8, cols = {};
    L.forEach(d => { const k = d.periodo > 0 ? d.periodo : 0; (cols[k] = cols[k] || []).push(d); });
    const ks = Object.keys(cols).map(Number).sort((a, b) => (a || 1e9) - (b || 1e9)), pos = {};
    ks.forEach((k, ci) => cols[k].forEach((d, ri) => { pos[d.id] = { x: PAD + ci * (W + GX), y: TOP + ri * (H + GY) }; }));
    const wT = PAD * 2 + ks.length * (W + GX) - GX, hT = TOP + Math.max(...ks.map(k => cols[k].length)) * (H + GY) + PAD;
    const sel = S.sel && disc(S.sel) && disc(S.sel).cursoId === c.id ? disc(S.sel) : null;
    const pre = new Set(sel ? (sel.prereq || []) : []), pos2 = new Set(sel ? libera(sel).map(x => x.id) : []);
    const seta = (a, b, cls) => {
      const A = pos[a], B = pos[b]; if (!A || !B) return '';
      const x1 = A.x + W, y1 = A.y + H / 2, x2 = B.x, y2 = B.y + H / 2, dx = Math.max(26, Math.abs(x2 - x1) / 2);
      return `<path class="${cls}" d="M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}"/><path class="${cls} hd" d="M${x2} ${y2} l-8 -4.5 v9 z"/>`;
    };
    let svg = '';
    if (sel) { [...pre].forEach(p => { svg += seta(p, sel.id, 'lp'); }); [...pos2].forEach(x => { svg += seta(sel.id, x, 'lq'); }); }
    const heads = ks.map((k, ci) => `<div class="ph" style="left:${PAD + ci * (W + GX)}px;width:${W}px">${k ? k + 'º período' : 'Sem período'}</div>`).join('');
    const nodes = L.map(d => {
      const p = pos[d.id], rel = sel && (d.id === sel.id || pre.has(d.id) || pos2.has(d.id));
      return `<button class="nd ${nivel(d)}${sel && d.id === sel.id ? ' sel' : ''}${sel && !rel ? ' dim' : ''}" data-d="${d.id}" style="left:${p.x}px;top:${p.y}px;width:${W}px;height:${H}px"><b>${esc(d.nome)}</b><small>${n1(d.creditos || 0)} cr${d.codigo ? ' · ' + esc(d.codigo) : ''}${typeof d.notaFinal === 'number' && d.status !== 'pendente' ? ' · ' + numStr(d.notaFinal) : ''}</small></button>`;
    }).join('');
    let det = '<small class="mu" style="display:block;margin:2px 0 8px">Toque em uma disciplina para ver seus pré-requisitos e o que ela libera.</small>';
    if (sel) {
      const pl = (sel.prereq || []).map(disc).filter(Boolean), lb = libera(sel), k2 = nivel(sel);
      det = `<div class="card mod"><h3><span>${esc(sel.nome)}</span><a data-edit>Editar</a></h3>
        <small class="mu">${n1(sel.creditos || 0)} ${un(c)}${sel.codigo ? ' · ' + esc(sel.codigo) : ''} · ${k2 === 'livre' ? 'Pendente · liberada' : k2 === 'bloq' ? 'Pendente · bloqueada' : ST[sel.status]}${sel.periodo ? ' · ' + sel.periodo + 'º período' : ''}</small>
        <div style="margin-top:8px"><b>Pré-requisitos</b><br>${pl.length ? pl.map(p => `<span class="${FEITA(p) ? 'pos' : 'neg'}">${FEITA(p) ? '✓' : '✗'} ${esc(p.nome)}</span>`).join('<br>') : '<span class="mu">Nenhum</span>'}</div>
        <div style="margin-top:8px"><b>Libera</b><br>${lb.length ? lb.map(x => esc(x.nome)).join('<br>') : '<span class="mu">Nada depende desta disciplina</span>'}</div></div>`;
    }
    el.innerHTML = `<div class="fx"><div style="position:relative;width:${wT}px;height:${hT}px">${heads}<svg width="${wT}" height="${hT}" style="position:absolute;left:0;top:0;pointer-events:none">${svg}</svg>${nodes}</div></div>
      ${det}<div class="leg"><span><i class="nd aprovada"></i>Aprovada</span><span><i class="nd cursando"></i>Cursando</span><span><i class="nd livre"></i>Liberada</span><span><i class="nd bloq"></i>Bloqueada</span><span><i class="nd reprovada"></i>Reprovada</span></div>
      ${sel ? '<small class="mu" style="display:block;margin-top:6px">Linha cheia: pré-requisitos · tracejada: o que ela libera.</small>' : ''}`;
    const fx = $('.fx', el); fx.scrollLeft = S.fx[0]; fx.scrollTop = S.fx[1]; fx.onscroll = () => { S.fx = [fx.scrollLeft, fx.scrollTop]; };
    $$('.nd[data-d]', el).forEach(b => b.onclick = () => { S.sel = S.sel === b.dataset.d ? null : b.dataset.d; refresh(); });
    const ed = $('[data-edit]', el); if (ed) ed.onclick = () => formDisc(sel, c.id);
  }

  /* ---------- boletim ---------- */
  function rBoletim(el, c) {
    const L = discsDe(c.id), sems = [...new Set(L.map(d => d.semestre).filter(Boolean))].sort().reverse();
    if (S.sem !== 'atual' && !sems.includes(S.sem)) S.sem = 'atual';
    const alvo = S.sem === 'atual' ? L.filter(d => d.status === 'cursando') : L.filter(d => d.semestre === S.sem);
    const notas = alvo.map(d => { const e = calc(d, c), n = typeof d.notaFinal === 'number' && d.status !== 'cursando' ? d.notaFinal : (e.mediaFinal ?? e.media ?? e.parcial); return { d, n, e }; }).filter(x => typeof x.n === 'number' && x.d.creditos > 0);
    const cr = notas.reduce((t, x) => t + x.d.creditos, 0), mp = cr ? notas.reduce((t, x) => t + x.n * x.d.creditos, 0) / cr : null;
    el.innerHTML = `<div class="seg sm"><button data-sem="atual" class="${S.sem === 'atual' ? 'on' : ''}">Cursando agora</button>${sems.map(s => `<button data-sem="${esc(s)}" class="${S.sem === s ? 'on' : ''}">${esc(s)}</button>`).join('')}</div>
      <div class="card"><small class="mu">${esc(resumoRegras(c))}</small></div>
      ${alvo.length ? `<div class="sum"><div><small>Disciplinas</small><b>${alvo.length}</b></div><div><small>${un(c)[0].toUpperCase() + un(c).slice(1)}</small><b>${n1(alvo.reduce((t, d) => t + (d.creditos || 0), 0))}</b></div><div><small>Média</small><b>${mp === null ? '—' : n1(mp)}</b></div></div>` : ''}
      ${alvo.length ? alvo.map(d => cardBol(d, c)).join('') : `<div class="empty">${S.sem === 'atual' ? 'Nenhuma disciplina com situação “Cursando”.<br>Edite uma disciplina e mude a situação para começar o boletim.' : 'Nenhuma disciplina neste semestre.'}</div>`}`;
    $$('[data-sem]', el).forEach(b => b.onclick = () => { S.sem = b.dataset.sem; refresh(); });
    const A = (sel, fn) => $$(sel, el).forEach(b => b.onclick = e => { e.stopPropagation(); const d = disc(b.dataset.d); if (d) fn(d, b); });
    A('[data-av]', (d, b) => formAval(d, (d.aval || []).find(a => a.id === b.dataset.av)));
    A('[data-avnew]', d => formAval(d, null));
    A('[data-avlote]', d => formAvLote(d));
    A('[data-ex]', d => formExame(d, c));
    A('[data-edd]', d => formDisc(d, c.id));
    A('[data-fecha]', d => encerrar(d, c));
    A('[data-abrir]', d => { Estudos.S.seg = 'materias'; Estudos.S.mat = d.materiaId; refresh(); });
    A('[data-falta]', (d, b) => { const antes = d.faltas || 0, v = antes + (+b.dataset.falta); if (v < 0) return; d.faltas = v; commit(); });
  }

  function cardBol(d, c) {
    const e = calc(d, c), R = e.R, ativa = d.status === 'cursando', fim = d.status === 'aprovada' || d.status === 'reprovada';
    let chip;
    if (ativa) chip = pill(e.label, COR_SIT[e.sit] || 'var(--mu)'); else chip = pill(ST[d.status], COR_ST[d.status]);
    const nota = fim && typeof d.notaFinal === 'number' ? d.notaFinal : (e.mediaFinal ?? e.media ?? e.parcial);
    const rot = fim ? 'Nota final' : e.media !== null ? 'Média' : 'Média parcial';
    const lin = [];
    if (ativa) {
      if (e.Pp && e.needAprov !== null) {
        if (e.needAprov > 0 && e.needAprov <= R.max) lin.push(e.pend.length === 1 ? `Para passar, precisa de <b>${n1(e.needAprov)}</b> em “${esc(e.pend[0].nome)}”.` : `Para passar, precisa de média <b>${n1(e.needAprov)}</b> nas ${e.pend.length} avaliações restantes (peso ${n1(e.Pp)}).`);
        else if (e.sit === 'exame') lin.push(`Não chega a ${n1(R.mediaAprov)} direto. Para ir ao exame, precisa de média <b>${n1(e.needExame)}</b> nas restantes.`);
        else if (e.sit === 'aprov') lin.push('O que falta não muda o resultado.');
      }
      if (e.sit === 'exame' && e.media !== null) lin.push(typeof d.exame === 'number' ? '' : `Média ${n1(e.media)}: vai para o exame e precisa de <b>${n1(e.exameNeed)}</b>.`);
      if (typeof d.exame === 'number' && e.mediaFinal !== undefined) lin.push(`Exame ${numStr(d.exame)} · média final <b>${n1(e.mediaFinal)}</b>.`);
    }
    if (e.podeFaltar !== null) lin.push(`Faltas: ${d.faltas || 0} de ${e.limFaltas} permitidas · frequência ${n1(e.freq)}%${e.podeFaltar < 0 ? ' <span class="neg">(abaixo do mínimo)</span>' : e.podeFaltar === 0 ? ' <span class="neg">(no limite)</span>' : ''}`);
    else if (ativa) lin.push(`<span class="mu">Faltas: ${d.faltas || 0}. Informe as aulas previstas em Editar para controlar a frequência.</span>`);
    const avs = (d.aval || []).map(a => `<div class="row" data-d="${d.id}" data-av="${a.id}"><div class="t"><b>${esc(a.nome)}</b><small>peso ${n1(a.peso)}</small></div><span class="n ${typeof a.nota === 'number' ? (a.nota >= R.mediaAprov ? 'pos' : '') : 'mu'}">${typeof a.nota === 'number' ? numStr(a.nota) : '—'}</span></div>`).join('');
    const podeFechar = ativa && (e.sit === 'rep' || (e.sit === 'aprov' && !e.Pp));
    return `<div class="card" style="border-left:4px solid ${esc(c.cor)}"><h3><span>${esc(d.nome)}</span>${chip}</h3>
      <div style="display:flex;justify-content:space-between;align-items:baseline"><small class="mu">${n1(d.creditos || 0)} ${un(c)}${d.codigo ? ' · ' + esc(d.codigo) : ''}${d.semestre ? ' · ' + esc(d.semestre) : ''}</small><span><small class="mu">${rot}</small> <span class="big" style="font-size:22px">${typeof nota === 'number' ? n1(nota) : '—'}</span></span></div>
      ${avs ? `<div style="margin-top:4px">${avs}</div>` : ''}
      ${lin.filter(Boolean).map(t => `<div style="margin-top:6px;font-size:13.5px">${t}</div>`).join('')}
      <div class="exb"><button class="btn sec" data-d="${d.id}" data-avnew>+ Avaliação</button>${(d.aval || []).length ? '' : `<button class="btn sec" data-d="${d.id}" data-avlote>Definir várias</button>`}
        ${ativa ? `<button class="btn sec" data-d="${d.id}" data-falta="1">+1 falta</button>${d.faltas ? `<button class="btn sec" data-d="${d.id}" data-falta="-1">−1</button>` : ''}` : ''}
        ${ativa && e.exameNeed !== undefined ? `<button class="btn" data-d="${d.id}" data-ex>${typeof d.exame === 'number' ? 'Editar exame' : 'Nota do exame'}</button>` : ''}
        ${podeFechar ? `<button class="btn" data-d="${d.id}" data-fecha>Encerrar: ${e.sit === 'aprov' ? 'aprovado' : 'reprovado'}</button>` : ''}
        ${materia(d.materiaId) ? `<button class="btn sec" data-d="${d.id}" data-abrir>Estudar</button>` : ''}
        <button class="btn sec" data-d="${d.id}" data-edd>Editar</button></div></div>`;
  }

  function encerrar(d, c) {
    const e = calc(d, c); if (e.sit !== 'aprov' && e.sit !== 'rep') return toast('Ainda faltam notas para encerrar.');
    if (e.sit === 'aprov' && e.Pp) return toast('Lance as notas restantes antes de encerrar.');
    const antes = JSON.parse(JSON.stringify(d));
    d.status = e.sit === 'aprov' ? 'aprovada' : 'reprovada';
    const nf = e.mediaFinal ?? e.media; d.notaFinal = typeof nf === 'number' ? nf : null;
    d.semestre = d.semestre || semAtual();
    commit(); toast(`${d.nome}: ${ST[d.status].toLowerCase()}`, () => { restaurar(d, antes); commit(); });
  }

  /* ---------- formulários ---------- */
  function formCurso(c) {
    const novo = !c, ini = c || { nome: '', curso: '', cor: ['#6A4DB5', '#2D5FA6', '#1E7A5A', '#CF4B24', '#B0398A'][cursos().length % 5], creditosTotal: '', unidade: 'créditos', regras: REG() };
    const R = { ...REG(), ...(ini.regras || {}) }, nn = (k, v) => inp(k, numStr(v), 'inputmode="decimal"');
    const s = sheet(novo ? 'Nova instituição' : 'Editar instituição', `${F('Instituição', inp('nome', ini.nome, 'placeholder="Ex.: UFRJ"'))}${F('Curso', inp('curso', ini.curso || '', 'placeholder="Ex.: Engenharia Civil"'))}
      <div class="g2">${F('Total para formar (0 = somar as disciplinas)', inp('creditosTotal', ini.creditosTotal ? numStr(ini.creditosTotal) : '', 'inputmode="decimal"'))}${F('Cor', `<input type="color" name="cor" value="${esc(ini.cor)}" style="padding:2px;height:44px">`)}</div>
      ${F('Unidade (créditos, horas…)', inp('unidade', ini.unidade || 'créditos'))}
      <div class="dia">Regras de aprovação</div>
      <div class="g2">${F('Nota máxima', nn('max', R.max))}${F('Média para aprovar', nn('mediaAprov', R.mediaAprov))}</div>
      <div class="g2">${F('Frequência mínima % (0 = ignorar)', nn('freqMin', R.freqMin))}${F('Casas decimais da média', sel('casas', [[0, '0'], [1, '1'], [2, '2']], R.casas))}</div>
      ${F('Tem exame / recuperação?', sel('exame', [['nao', 'Não'], ['sim', 'Sim']], R.exame ? 'sim' : 'nao'))}
      <div id="ex"><div class="g2">${F('Média mínima para fazer exame', nn('exameMin', R.exameMin))}${F('Média final mínima após o exame', nn('exameMedia', R.exameMedia))}</div>${F('Peso do exame na média final (%)', nn('exameVale', R.exameVale))}
      <p class="hint">Média final = média × (100 − peso) + exame × peso. Com peso 50, é a média simples entre a média e o exame.</p></div>
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    const ex = () => { s.$('#ex').hidden = s.$('[name=exame]').value !== 'sim'; }; s.$('[name=exame]').onchange = ex; ex();
    if (!novo) s.$('[data-del]').onclick = async () => {
      if (!(await confirmar('Excluir esta instituição e todas as suas disciplinas?'))) return;
      const ds = discsDe(c.id), idx = cursos().indexOf(c), antes = ds.slice();
      DB.estudo.disciplinas = discs().filter(d => d.cursoId !== c.id); cursos().splice(idx, 1);
      s.fechar(); commit(); toast('Instituição excluída', () => { cursos().splice(idx, 0, c); discs().push(...antes); commit(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), g = k => v[k].trim() ? num(v[k]) : NaN, max = g('max'), ap = g('mediaAprov'), fr = v.freqMin.trim() ? num(v.freqMin) : 0, tot = v.creditosTotal.trim() ? num(v.creditosTotal) : 0;
      const sim = v.exame === 'sim', em = sim ? g('exameMin') : 0, emf = sim ? g('exameMedia') : 0, ev = sim ? g('exameVale') : 50;
      if (!v.nome.trim()) return toast('Informe o nome da instituição.');
      if (isNaN(max) || max <= 0) return toast('Nota máxima inválida.');
      if (isNaN(ap) || ap <= 0 || ap > max) return toast('A média para aprovar deve ficar entre 0 e a nota máxima.');
      if (isNaN(fr) || fr < 0 || fr > 100) return toast('Frequência mínima inválida (0 a 100).');
      if (isNaN(tot) || tot < 0) return toast('Total para formar inválido.');
      if (sim) {
        if (isNaN(em) || em < 0 || em >= ap) return toast('A média mínima para exame deve ser menor que a média para aprovar.');
        if (isNaN(emf) || emf <= 0 || emf > max) return toast('Média final do exame inválida.');
        if (isNaN(ev) || ev < 1 || ev > 100) return toast('O peso do exame deve ficar entre 1 e 100.');
      }
      const d = { nome: v.nome.trim(), curso: v.curso.trim(), cor: v.cor, creditosTotal: tot, unidade: v.unidade.trim() || 'créditos', regras: { max, mediaAprov: ap, freqMin: fr, casas: +v.casas, exame: sim, exameMin: em || 4, exameMedia: emf || 5, exameVale: ev } };
      if (novo) { const n = { id: uid('cu'), ...d }; cursos().push(n); S.inst = n.id; S.sub = 'resumo'; } else Object.assign(c, d);
      s.fechar(); commit();
    };
  }

  function formDisc(d, cid) {
    const c = curso(cid || (d && d.cursoId)); if (!c) return toast('Cadastre uma instituição primeiro.');
    const novo = !d, ini = d || { nome: '', codigo: '', creditos: '', periodo: '', tipo: 'obrig', prereq: [], status: 'pendente', semestre: '', notaFinal: null, aulasTotal: '', faltas: 0, materiaId: '' };
    const outras = discsDe(c.id).filter(x => !d || x.id !== d.id), marc = new Set(ini.prereq || []);
    const mats = DB.estudo.materias;
    const s = sheet(novo ? 'Nova disciplina' : 'Editar disciplina', `<p class="mu sm" style="margin:0 0 10px">${esc(c.nome)}</p>${F('Nome', inp('nome', ini.nome, 'placeholder="Ex.: Cálculo II"'))}
      <div class="g2">${F('Código (opcional)', inp('codigo', ini.codigo || ''))}${F(`Valor em ${un(c)}`, inp('creditos', ini.creditos === '' ? '' : numStr(ini.creditos), 'inputmode="decimal"'))}</div>
      <div class="g2">${F('Período no fluxograma', inp('periodo', ini.periodo || '', 'type="number" inputmode="numeric" min="0" placeholder="vazio = sem período"'))}${F('Tipo', sel('tipo', [['obrig', 'Obrigatória'], ['optativa', 'Optativa']], ini.tipo || 'obrig'))}</div>
      <div class="f"><span>Pré-requisitos</span>${outras.length ? `<input id="pf" placeholder="Filtrar…" style="margin-bottom:6px"><div id="pr" style="max-height:190px;overflow-y:auto;border:1px solid var(--ln);padding:0 10px">${outras.map(x => `<label class="chk" data-n="${esc((x.nome + ' ' + (x.codigo || '')).toLowerCase())}"><input type="checkbox" data-p="${x.id}" ${marc.has(x.id) ? 'checked' : ''}><span>${esc(x.nome)}${x.codigo ? ' · ' + esc(x.codigo) : ''}</span></label>`).join('')}</div>` : '<small class="mu">Cadastre outras disciplinas para escolher pré-requisitos.</small>'}</div>
      ${F('Situação', sel('status', Object.entries(ST), ini.status))}
      <div id="b-sem"><div class="g2">${F('Semestre (ex.: 2026.1)', inp('semestre', ini.semestre || '', `placeholder="${semAtual()}"`))}<div id="b-nota">${F('Nota final', inp('notaFinal', typeof ini.notaFinal === 'number' ? numStr(ini.notaFinal) : '', 'inputmode="decimal"'))}</div></div></div>
      <div id="b-freq"><div class="g2">${F('Aulas previstas no semestre', inp('aulasTotal', ini.aulasTotal || '', 'type="number" inputmode="numeric" min="0"'))}${F('Faltas', inp('faltas', ini.faltas || 0, 'type="number" inputmode="numeric" min="0"'))}</div><p class="hint">Com as aulas previstas e a frequência mínima da instituição, o boletim mostra quantas faltas você ainda pode ter.</p></div>
      ${F('Matéria de estudo (cronômetro e tópicos)', sel('materiaId', [['', 'Nenhuma'], ...mats.map(m => [m.id, m.nome]), ['__nova', '+ Criar matéria com este nome']], ini.materiaId && materia(ini.materiaId) ? ini.materiaId : ''))}
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    const vis = () => { const st = s.$('[name=status]').value; s.$('#b-sem').hidden = st === 'pendente'; s.$('#b-nota').hidden = !(st === 'aprovada' || st === 'reprovada'); s.$('#b-freq').hidden = !['cursando', 'aprovada', 'reprovada'].includes(st); };
    s.$('[name=status]').onchange = vis; vis();
    const pf = s.$('#pf'); if (pf) pf.oninput = () => { const q = pf.value.trim().toLowerCase(); s.$$('#pr .chk').forEach(l => { l.hidden = !!q && !l.dataset.n.includes(q); }); };
    s.$$('[data-p]').forEach(k => k.onchange = () => { if (k.checked) marc.add(k.dataset.p); else marc.delete(k.dataset.p); });
    if (!novo) s.$('[data-del]').onclick = async () => {
      if (!(await confirmar('Excluir esta disciplina?'))) return;
      const idx = discs().indexOf(d), refs = discs().filter(x => (x.prereq || []).includes(d.id));
      refs.forEach(x => { x.prereq = x.prereq.filter(i => i !== d.id); }); discs().splice(idx, 1); if (S.sel === d.id) S.sel = null;
      s.fechar(); commit(); toast('Disciplina excluída', () => { discs().splice(idx, 0, d); refs.forEach(x => x.prereq.push(d.id)); commit(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), R = reg(c), cr = v.creditos.trim() ? num(v.creditos) : 0, per = v.periodo ? parseInt(v.periodo) : 0, nf = v.notaFinal.trim() ? num(v.notaFinal) : null;
      const at = v.aulasTotal ? parseInt(v.aulasTotal) : 0, fa = v.faltas ? parseInt(v.faltas) : 0;
      if (!v.nome.trim()) return toast('Informe o nome.');
      if (isNaN(cr) || cr < 0) return toast('Valor inválido em ' + un(c) + '.');
      if (isNaN(per) || per < 0) return toast('Período inválido.');
      if (nf !== null && (isNaN(nf) || nf < 0 || nf > R.max)) return toast(`A nota final deve ficar entre 0 e ${n1(R.max)}.`);
      if (isNaN(at) || at < 0 || isNaN(fa) || fa < 0) return toast('Aulas e faltas devem ser números positivos.');
      if (d) { const ciclo = [...marc].find(p => p === d.id || depende(p, d.id)); if (ciclo) return toast(`“${disc(ciclo).nome}” já depende desta disciplina: o pré-requisito formaria um ciclo.`); }
      let mid = v.materiaId;
      if (mid === '__nova') { mid = uid('ma'); DB.estudo.materias.push({ id: mid, nome: v.nome.trim(), cor: c.cor, metaHoras: 0, mediaAlvo: R.mediaAprov, notaMax: R.max }); }
      const st = v.status, x = { nome: v.nome.trim(), codigo: v.codigo.trim(), creditos: cr, periodo: per, tipo: v.tipo, prereq: [...marc], status: st, semestre: st === 'pendente' ? '' : (v.semestre.trim() || semAtual()),
        notaFinal: (st === 'aprovada' || st === 'reprovada') ? nf : null, aulasTotal: at, faltas: fa, materiaId: mid };
      if (novo) discs().push({ id: uid('di'), cursoId: c.id, aval: [], exame: null, ...x }); else Object.assign(d, x);
      s.fechar(); commit();
    };
  }

  function formLote(c) {
    const s = sheet('Adicionar várias disciplinas', `<p class="mu sm" style="margin:0 0 8px">Uma por linha, separando com ponto e vírgula:<br><b>nome ; créditos ; período ; código ; pré-requisitos</b></p>
      <textarea name="txt" style="min-height:200px" placeholder="Cálculo I ; 6 ; 1 ; MAT101&#10;Cálculo II ; 6 ; 2 ; MAT102 ; MAT101&#10;Física II ; 4 ; 3 ; FIS201 ; Cálculo II, Física I&#10;Tópicos Especiais ; 2 ; optativa"></textarea>
      <p class="hint">Só o nome é obrigatório. No período, use um número ou “optativa”. Os pré-requisitos podem ser o código ou o nome de outra disciplina, separados por vírgula (inclusive de linhas da mesma lista). Todas entram como “Pendente”; depois ajuste o que já cursou.</p>
      <div class="acts"><button class="btn" data-ok>Adicionar</button></div>`);
    s.$('[data-ok]').onclick = () => {
      const linhas = s.$('[name=txt]').value.split('\n').map(l => l.trim()).filter(Boolean);
      if (!linhas.length) return toast('Escreva pelo menos uma disciplina.');
      const key = x => String(x || '').trim().toLowerCase(), existentes = discsDe(c.id), novos = [], pend = [];
      let dup = 0;
      linhas.forEach(l => {
        const f = l.split(/[;\t|]/).map(x => x.trim()), nome = f[0]; if (!nome) return;
        if ([...existentes, ...novos].some(d => key(d.nome) === key(nome) || (f[3] && key(d.codigo) === key(f[3])))) { dup++; return; }
        const cr = f[1] ? num(f[1]) : 0, opt = /^opt/i.test(f[2] || ''), per = opt ? 0 : parseInt(f[2]) || 0;
        const d = { id: uid('di'), cursoId: c.id, nome, codigo: f[3] || '', creditos: isNaN(cr) || cr < 0 ? 0 : cr, periodo: per, tipo: opt ? 'optativa' : 'obrig', prereq: [], status: 'pendente', semestre: '', notaFinal: null, aulasTotal: 0, faltas: 0, materiaId: '', aval: [], exame: null };
        novos.push(d); if (f[4]) pend.push([d, f[4]]);
      });
      if (!novos.length) return toast(dup ? 'Todas essas disciplinas já existem.' : 'Nada para adicionar.');
      const todas = [...existentes, ...novos], naoAchou = [];
      pend.forEach(([d, txt]) => txt.split(',').map(x => x.trim()).filter(Boolean).forEach(nm => {
        const alvo = todas.find(x => x !== d && (key(x.codigo) === key(nm) || key(x.nome) === key(nm)));
        if (!alvo) naoAchou.push(nm); else if (!d.prereq.includes(alvo.id) && !(alvo.prereq || []).includes(d.id)) d.prereq.push(alvo.id);
      }));
      discs().push(...novos); S.sub = 'fluxo'; s.fechar(); commit();
      toast(`${novos.length} disciplina${novos.length > 1 ? 's' : ''} adicionada${novos.length > 1 ? 's' : ''}${dup ? ` · ${dup} já existia${dup > 1 ? 'm' : ''}` : ''}${naoAchou.length ? ` · pré-requisito não encontrado: ${naoAchou.slice(0, 3).join(', ')}` : ''}`);
    };
  }

  function formAval(d, a) {
    const c = curso(d.cursoId), R = reg(c), novo = !a, ini = a || { nome: '', peso: 1, nota: null };
    const s = sheet(novo ? 'Nova avaliação' : 'Editar avaliação', `<p class="mu sm" style="margin:0 0 10px">${esc(d.nome)}</p>${F('Nome', inp('nome', ini.nome, 'placeholder="Ex.: P1, Trabalho, Seminário"'))}
      <div class="g2">${F('Peso', inp('peso', numStr(ini.peso), 'inputmode="decimal"'))}${F(`Nota (máx. ${n1(R.max)})`, inp('nota', typeof ini.nota === 'number' ? numStr(ini.nota) : '', 'inputmode="decimal"'))}</div>
      <p class="hint">Deixe a nota em branco até sair o resultado. O peso pode ser qualquer número (ex.: 3 e 3 e 4, ou 30, 30 e 40).</p>
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    if (!novo) s.$('[data-del]').onclick = () => { const idx = d.aval.indexOf(a); d.aval.splice(idx, 1); s.fechar(); commit(); toast('Avaliação excluída', () => { d.aval.splice(idx, 0, a); commit(); }); };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), peso = num(v.peso), nota = v.nota.trim() ? num(v.nota) : null;
      if (!v.nome.trim()) return toast('Informe o nome.');
      if (isNaN(peso) || peso < 0) return toast('Peso inválido.');
      if (nota !== null && (isNaN(nota) || nota < 0 || nota > R.max)) return toast(`A nota deve ficar entre 0 e ${n1(R.max)}.`);
      const x = { nome: v.nome.trim(), peso, nota };
      d.aval = d.aval || []; if (novo) d.aval.push({ id: uid('av'), ...x }); else Object.assign(a, x);
      s.fechar(); commit();
    };
  }

  function formAvLote(d) {
    const c = curso(d.cursoId), R = reg(c);
    const s = sheet('Definir avaliações', `<p class="mu sm" style="margin:0 0 8px">${esc(d.nome)}<br>Uma por linha: <b>nome ; peso ; nota (opcional)</b></p>
      <textarea name="txt" style="min-height:150px" placeholder="P1 ; 3 ; 7,5&#10;P2 ; 3&#10;Trabalho ; 4"></textarea>
      <p class="hint">As avaliações entram na média pelo peso. Notas ainda não divulgadas ficam em branco.</p><div class="acts"><button class="btn" data-ok>Adicionar</button></div>`);
    s.$('[data-ok]').onclick = () => {
      const novos = []; let erro = '';
      s.$('[name=txt]').value.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
        const f = l.split(/[;\t|]/).map(x => x.trim()), peso = f[1] ? num(f[1]) : 1, nota = f[2] ? num(f[2]) : null;
        if (!f[0] || isNaN(peso) || peso < 0 || (nota !== null && (isNaN(nota) || nota < 0 || nota > R.max))) erro = erro || `Linha inválida: ${l}`;
        else novos.push({ id: uid('av'), nome: f[0], peso, nota });
      });
      if (erro) return toast(erro); if (!novos.length) return toast('Escreva pelo menos uma avaliação.');
      d.aval = (d.aval || []).concat(novos); s.fechar(); commit();
    };
  }

  function formExame(d, c) {
    const e = calc(d, c), R = e.R;
    const s = sheet('Nota do exame', `<p class="mu sm" style="margin:0 0 10px">${esc(d.nome)} · média ${n1(e.media)}. Precisa de ${n1(e.exameNeed)} para chegar a ${n1(R.exameMedia)}.</p>
      ${F(`Nota do exame (máx. ${n1(R.max)})`, inp('exame', typeof d.exame === 'number' ? numStr(d.exame) : '', 'inputmode="decimal"'))}
      <div class="acts">${typeof d.exame === 'number' ? '<button class="btn bad" data-del>Remover</button>' : ''}<button class="btn" data-ok>Salvar</button></div>`);
    const del = s.$('[data-del]'); if (del) del.onclick = () => { d.exame = null; s.fechar(); commit(); };
    s.$('[data-ok]').onclick = () => {
      const t = s.$('[name=exame]').value.trim(), v = t ? num(t) : null;
      if (v !== null && (isNaN(v) || v < 0 || v > R.max)) return toast(`A nota deve ficar entre 0 e ${n1(R.max)}.`);
      d.exame = v; s.fechar(); commit();
    };
  }

  const fab = () => () => (atual() ? formDisc(null, atual().id) : formCurso(null));
  return { S, render, fab, calc, prog, reg, preOk };
})();
