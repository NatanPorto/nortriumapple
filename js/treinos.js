'use strict';
/* =========================================================
   TREINOS — fichas, execução do treino, histórico e medidas
   ========================================================= */
const Treinos = (() => {
  const S = { area: 'treino', seg: 'fichas', per: 30, ex: '', met: 'carga' };
  const RE = /^(.*?)\s+(\d+)\s*[x×]\s*(\d+)(?:\s+(\d+(?:[.,]\d+)?)\s*(?:kg)?)?(?:\s+(\d+)\s*(?:s|seg))?\s*$/i;
  const parseEx = txt => txt.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(RE); return m ? { nome: m[1].trim(), series: +m[2], reps: +m[3], carga: m[4] ? num(m[4]) : 0, descanso: m[5] ? +m[5] : 0 } : { nome: l, series: 3, reps: 10, carga: 0, descanso: 0 };
  });
  const exTxt = ex => ex.map(e => `${e.nome} ${e.series}x${e.reps}${e.carga ? ' ' + numStr(e.carga) + 'kg' : ''}${e.descanso ? ' ' + e.descanso + 's' : ''}`).join('\n');
  const nk = n => String(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const sessoesOrd = () => [...DB.treino.sessoes].sort((a, b) => b.data.localeCompare(a.data) || (b.inicio || '').localeCompare(a.inicio || ''));
  const setsTrab = e => e.sets.filter(x => x.ok && !x.aq);                 // séries de aquecimento não entram no volume nem nos recordes
  const volEx = e => setsTrab(e).reduce((u, x) => u + (x.reps || 0) * (x.carga || 0), 0);
  const volume = s => Math.round(s.exercicios.reduce((t, e) => t + volEx(e), 0));
  const e1rm = (c, r) => c > 0 && r >= 1 && r <= 12 ? c * (1 + r / 30) : 0;   // Epley — apenas uma estimativa
  function ultimaSerie(nome) {
    const k = nk(nome);
    for (const s of sessoesOrd()) {
      const ex = s.exercicios.find(e => nk(e.nome) === k);
      const ok = ex && setsTrab(ex); if (ok && ok.length) return ok[ok.length - 1];
    }
    return null;
  }
  function nomesEx() {                                                     // nomes conhecidos (fichas + histórico), sem repetir
    const m = new Map(), add = n => { const k = nk(n); if (k && !m.has(k)) m.set(k, n); };
    sessoesOrd().forEach(s => s.exercicios.forEach(e => add(e.nome)));
    DB.treino.fichas.forEach(f => f.exercicios.forEach(e => add(e.nome)));
    return [...m.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  function recordes(sessoes) {                                             // melhor série de trabalho por exercício
    const m = new Map();
    [...sessoes].sort((a, b) => a.data.localeCompare(b.data) || (a.inicio || '').localeCompare(b.inicio || '')).forEach(s => s.exercicios.forEach(e => {
      const k = nk(e.nome); let r = m.get(k);
      setsTrab(e).forEach(x => {
        if (!r) r = { nome: e.nome, carga: -1, reps: 0, data: '', e1: 0, n: 0 };
        if (x.carga > r.carga || (x.carga === r.carga && x.reps > r.reps)) { r.carga = x.carga; r.reps = x.reps; r.data = s.data; }
        r.e1 = Math.max(r.e1, e1rm(x.carga, x.reps));
      });
      if (r) { r.n++; m.set(k, r); }
    }));
    return m;
  }
  const fichasDeHoje = () => DB.treino.fichas.filter(f => (f.dias || []).includes(new Date().getDay()));
  const feitoHoje = f => DB.treino.sessoes.find(s => s.data === hoje() && s.fichaId === f.id);
  const treinosNaSemana = () => DB.treino.sessoes.filter(s => s.data >= inicioSemana(hoje())).length;
  const andamento = () => DB.treino.andamento || null;
  const fmtVol = v => v >= 10000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' t' : Math.round(v).toLocaleString('pt-BR') + ' kg';
  const compacto = v => v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : String(Math.round(v));

  const AREAS = [['treino', 'Treino'], ['dieta', 'Dieta'], ['agua', 'Água']];
  const topo = () => `<div class="seg sm" id="areas">${AREAS.map(([k, l]) => `<button data-a="${k}" class="${S.area === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  function render(el) {
    document.body.dataset.area = S.area;
    const ligarTopo = () => $$('#areas button', el).forEach(b => b.onclick = () => { S.area = b.dataset.a; refresh(); });
    if (S.area !== 'treino') { el.innerHTML = topo() + '<div id="sa-c"></div>'; ligarTopo(); return Saude.render($('#sa-c', el), S.area); }
    el.innerHTML = topo() + segHtml([['fichas', 'Fichas'], ['hist', 'Histórico'], ['stats', 'Estatísticas'], ['corpo', 'Corpo']], S.seg) + '<div id="tr-c"></div>';
    ligarTopo();
    $$('.seg:not(#areas) button', el).forEach(b => b.onclick = () => { S.seg = b.dataset.s; refresh(); });
    ({ fichas: rFichas, hist: rHist, stats: rStats, corpo: rCorpo })[S.seg]($('#tr-c', el));
  }

  /* ---------- aviso de treino em andamento (Treinos e Hoje) ---------- */
  const seriesFeitas = a => a.exs.reduce((t, e) => t + e.sets.filter(x => x.ok).length, 0);
  const faixaAndamento = () => { const a = andamento(); return a ? `<div class="run"><div><small>Treino em andamento${a.data !== hoje() ? ' · iniciado ' + fmtData(a.data) : ''}</small><div style="font-weight:700">${esc(a.nome)}</div><small>desde ${esc(a.hora)} · ${seriesFeitas(a)} série(s) feita(s)</small></div><button data-retomar>Continuar</button></div>` : ''; };
  const ligarFaixa = el => $$('[data-retomar]', el).forEach(b => b.onclick = () => retomar());

  function rFichas(el) {
    const hj = new Date().getDay();
    el.innerHTML = faixaAndamento() + (DB.treino.fichas.length ? DB.treino.fichas.map(f => {
      const feito = feitoHoje(f), hojeSim = (f.dias || []).includes(hj);
      return `<div class="card mod" data-f="${f.id}"><h3><span>${esc(f.nome)}</span><span class="mu sm">${(f.dias || []).map(d => DIAS[d]).join(' · ') || 'sem dias fixos'}</span></h3>
        <small class="mu">${f.exercicios.length} exercícios${f.hora ? ' · ' + f.hora : ''}${hojeSim ? ' · <b>hoje</b>' : ''}${feito ? ' · concluído hoje' : ''}</small>
        <div class="acts" style="justify-content:flex-start;margin-top:10px"><button class="btn" data-go="${f.id}">Iniciar treino</button><button class="btn sec" data-ed="${f.id}">Editar</button></div></div>`;
    }).join('') : '<div class="empty">Nenhuma ficha ainda.<br>Toque em + para montar seu primeiro treino.</div>');
    el.innerHTML += '<div class="acts" style="justify-content:flex-start"><button class="btn sec" id="livre">Treino livre</button></div>';
    ligarFaixa(el);
    $$('[data-go]', el).forEach(b => b.onclick = () => iniciar(DB.treino.fichas.find(f => f.id === b.dataset.go)));
    $$('[data-ed]', el).forEach(b => b.onclick = () => formFicha(DB.treino.fichas.find(f => f.id === b.dataset.ed)));
    $('#livre', el).onclick = () => iniciar(null);
  }

  function cardSemana() {
    const n = treinosNaSemana(), prev = DB.treino.fichas.reduce((a, f) => a + (f.dias || []).length, 0), pct = prev ? Math.min(100, Math.round(n / prev * 100)) : (n ? 100 : 0);
    const ini = inicioSemana(hoje()), sem = Array.from({ length: 8 }, (_, k) => addDias(ini, -7 * (7 - k)));
    const qs = sem.map(a => DB.treino.sessoes.filter(s => s.data >= a && s.data < addDias(a, 7)).length), pico = Math.max(1, ...qs);
    return `<div class="card"><div class="rcard">${Graf.anel(pct)}<div class="rtx"><small class="mu">Seu progresso na semana</small><div class="big">${n} treino${n === 1 ? '' : 's'}</div><small class="mu">${prev ? 'de ' + prev + ' previstos nas fichas' : 'concluído' + (n === 1 ? '' : 's') + ' nesta semana'}</small></div></div>
      <div class="gr mini" style="margin-top:12px">${qs.map(q => `<div><i style="height:${Math.round(q / pico * 100)}%"></i></div>`).join('')}</div><div class="gl"><span>8 semanas atrás</span><span style="text-align:right">esta</span></div></div>`;
  }
  function rHist(el) {
    const l = sessoesOrd();
    el.innerHTML = faixaAndamento() + `${cardSemana()}` +
      (l.length ? `<div class="card" style="padding:2px 14px">${l.slice(0, 60).map(s => `<div class="row" data-s="${s.id}"><div class="t"><b>${esc(s.nome)}</b><small>${fmtDiaCurto(s.data)} · ${dur(s.duracao)} · ${s.exercicios.length} exercícios${s.recs ? ' · ' + s.recs + ' recorde' + (s.recs > 1 ? 's' : '') : ''}</small></div><span class="n">${volume(s).toLocaleString('pt-BR')} kg</span></div>`).join('')}</div>` : '<div class="empty">Seus treinos concluídos aparecem aqui.</div>');
    $$('[data-s]', el).forEach(r => r.onclick = () => detalhe(DB.treino.sessoes.find(s => s.id === r.dataset.s)));
    ligarFaixa(el);
  }
  function detalhe(s) {
    const x = sheet(s.nome + ' · ' + fmtData(s.data), `<p class="mu sm">${dur(s.duracao)} · volume ${volume(s).toLocaleString('pt-BR')} kg${s.rpe ? ' · esforço ' + s.rpe + '/10' : ''}</p>` + (s.obs ? `<p class="sm" style="white-space:pre-wrap">${esc(s.obs)}</p>` : '') +
      s.exercicios.map(e => { let n = 0; return `<div class="ex"><h4>${esc(e.nome)}</h4>${e.sets.filter(t => t.ok).map(t => `<div class="mu">${t.aq ? 'Aquecimento' : ++n + 'ª série'} — ${t.reps} × ${numStr(t.carga)} kg</div>`).join('') || '<div class="mu">Sem séries concluídas</div>'}</div>`; }).join('') +
      '<div class="acts"><button class="btn bad" data-del>Excluir treino</button></div>');
    x.$('[data-del]').onclick = async () => {
      if (!(await confirmar('Excluir este treino do histórico?'))) return;
      const i = DB.treino.sessoes.indexOf(s); DB.treino.sessoes.splice(i, 1); x.fechar(); commit();
      toast('Treino excluído', () => { DB.treino.sessoes.splice(i, 0, s); commit(); });
    };
  }

  function rCorpo(el) {
    const l = [...DB.treino.medidas].sort((a, b) => b.data.localeCompare(a.data));
    const pesos = [...l].reverse().filter(m => m.peso);
    let spark = '';
    if (pesos.length > 1) {
      const v = pesos.map(m => m.peso), mn = Math.min(...v), mx = Math.max(...v), W = 300, H = 60;
      const pts = v.map((y, i) => `${(i / (v.length - 1) * W).toFixed(1)},${(H - 6 - (mx === mn ? .5 : (y - mn) / (mx - mn)) * (H - 12)).toFixed(1)}`).join(' ');
      spark = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="60" role="img" aria-label="Evolução do peso"><polyline points="${pts}" fill="none" stroke="var(--cor)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
    }
    el.innerHTML = (pesos.length ? `<div class="card"><small class="mu">Peso atual</small><div class="big">${numStr(pesos[pesos.length - 1].peso)} kg</div>${spark}</div>` : '') +
      (l.length ? `<div class="card" style="padding:2px 14px">${l.map((m, i) => {
        const ant = l.slice(i + 1).find(x => x.peso && m.peso), d = ant ? r2(m.peso - ant.peso) : null;
        return `<div class="row" data-m="${m.id}"><div class="t"><b>${m.peso ? numStr(m.peso) + ' kg' : 'Medidas'}</b><small>${fmtData(m.data)}${m.cintura ? ' · cintura ' + numStr(m.cintura) + ' cm' : ''}${m.gordura ? ' · ' + numStr(m.gordura) + '% gordura' : ''}</small></div>${d !== null && d !== 0 ? `<span class="n ${d > 0 ? 'neg' : 'pos'}">${d > 0 ? '+' : ''}${numStr(d)}</span>` : ''}</div>`;
      }).join('')}</div>` : '<div class="empty">Registre peso e medidas para acompanhar sua evolução.</div>') +
      '<div class="acts" style="justify-content:flex-start"><button class="btn sec" id="nm">Registrar medidas</button></div>';
    $$('[data-m]', el).forEach(r => r.onclick = () => formMedida(DB.treino.medidas.find(m => m.id === r.dataset.m)));
    $('#nm', el).onclick = () => formMedida(null);
  }
  function formMedida(m) {
    const novo = !m, ini = m || { data: hoje() };
    const s = sheet(novo ? 'Registrar medidas' : 'Editar medidas', `${F('Data', inp('data', ini.data, 'type="date"'))}
      <div class="g2">${F('Peso (kg)', inp('peso', numStr(ini.peso), 'inputmode="decimal"'))}${F('Cintura (cm)', inp('cintura', numStr(ini.cintura), 'inputmode="decimal"'))}</div>
      ${F('Gordura corporal (%)', inp('gordura', numStr(ini.gordura), 'inputmode="decimal"'))}
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    if (!novo) s.$('[data-del]').onclick = async () => { if (await confirmar('Excluir este registro?')) { DB.treino.medidas = DB.treino.medidas.filter(x => x !== m); s.fechar(); commit(); } };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), o = { data: v.data };
      for (const k of ['peso', 'cintura', 'gordura']) { const n = num(v[k]); if (v[k].trim() && !(n > 0)) return toast('Valor inválido em ' + k + '.'); o[k] = v[k].trim() ? r2(n) : null; }
      if (!dataOk(o.data)) return toast('Informe uma data válida.');
      if (!o.peso && !o.cintura && !o.gordura) return toast('Preencha ao menos uma medida.');
      if (novo) DB.treino.medidas.push({ id: uid('md'), ...o }); else Object.assign(m, o);
      s.fechar(); commit();
    };
  }

  function formFicha(f) {
    const novo = !f, ini = f || { nome: '', dias: [], hora: '', exercicios: [] };
    const s = sheet(novo ? 'Nova ficha de treino' : 'Editar ficha', `${F('Nome', inp('nome', ini.nome, 'placeholder="Ex.: Treino A — Peito e tríceps"'))}
      <div class="f"><span>Dias da semana</span><div class="dias">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label><input type="checkbox" data-d="${d}" ${(ini.dias || []).includes(d) ? 'checked' : ''}><span>${DIAS[d]}</span></label>`).join('')}</div></div>
      ${F('Horário (opcional)', inp('hora', ini.hora || '', 'type="time"'))}
      ${F('Exercícios', `<textarea name="ex" placeholder="Supino reto 4x10 40kg&#10;Crucifixo 3x12 14kg&#10;Tríceps corda 3x12 25kg">${esc(exTxt(ini.exercicios))}</textarea>`)}
      <p class="hint">Um por linha: nome, séries x repetições, carga e descanso (os dois últimos são opcionais). Ex.: Supino reto 4x10 40kg 90s</p>
      <div class="acts">${novo ? '' : '<button class="btn sec" data-dup>Duplicar</button><button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    if (!novo) s.$('[data-dup]').onclick = () => {
      DB.treino.fichas.push({ id: uid('fi'), nome: f.nome + ' (cópia)', dias: [], hora: '', exercicios: f.exercicios.map(e => ({ ...e })) });
      s.fechar(); commit(); toast('Ficha duplicada (sem dias fixos).');
    };
    if (!novo) s.$('[data-del]').onclick = async () => {
      if (!(await confirmar('Excluir esta ficha? O histórico de treinos é mantido.'))) return;
      const i = DB.treino.fichas.indexOf(f); DB.treino.fichas.splice(i, 1); s.fechar(); commit();
      toast('Ficha excluída', () => { DB.treino.fichas.splice(i, 0, f); commit(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), ex = parseEx(v.ex);
      if (!v.nome.trim()) return toast('Informe o nome da ficha.');
      if (!ex.length) return toast('Adicione ao menos um exercício.');
      const dados = { nome: v.nome.trim(), dias: s.$$('[data-d]').filter(c => c.checked).map(c => +c.dataset.d), hora: v.hora, exercicios: ex };
      if (novo) DB.treino.fichas.push({ id: uid('fi'), ...dados }); else Object.assign(f, dados);
      s.fechar(); commit();
    };
  }

  /* =========================================================
     TREINO AO VIVO — o estado fica em DB.treino.andamento e é
     gravado a cada toque; fechar a tela ou o app não perde nada.
     ========================================================= */
  function pedirNome(titulo, inicial, aoOk) {
    const s = sheet(titulo, `<datalist id="exlist">${nomesEx().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      ${F('Exercício', inp('nome', inicial, 'list="exlist" autocomplete="off" placeholder="Ex.: Supino reto"'))}
      <div class="acts"><button class="btn" data-ok>OK</button></div>`);
    const ok = () => { const n = vals(s.el).nome.trim(); if (!n) return toast('Informe o nome do exercício.'); s.fechar(); aoOk(n); };
    s.$('[data-ok]').onclick = ok;
    s.$('input[name=nome]').onkeydown = e => { if (e.key === 'Enter') ok(); };
    setTimeout(() => s.$('input[name=nome]').focus(), 80);
  }

  function exDe(nome, series, reps, carga, descanso) {
    const u = ultimaSerie(nome);
    return { nome, descanso: descanso || 0, sets: Array.from({ length: series }, () => ({ reps: u ? u.reps : reps, carga: u ? u.carga : carga, ok: false, aq: false })) };
  }
  function novoAndamento(ficha) {
    const agora = Date.now();
    return { inicio: agora, ult: agora, data: hoje(), hora: new Date().toTimeString().slice(0, 5), fichaId: ficha ? ficha.id : null, nome: ficha ? ficha.nome : 'Treino livre',
      exs: (ficha ? ficha.exercicios : []).map(e => exDe(e.nome, e.series, e.reps, e.carga, e.descanso)), descansoAte: 0, descansoTot: 0, rpe: '', obs: '' };
  }

  let live = null;                                   // tela do treino aberta (se houver)
  async function iniciar(ficha) {
    if (andamento()) {
      const r = await dialog(`Já existe um treino em andamento (${andamento().nome}). O que fazer?`, ['Cancelar', 'Descartar e começar outro', 'Continuar o atual']);
      if (r === 2) return retomar();
      if (r !== 1) return;
      DB.treino.andamento = null;
    }
    DB.treino.andamento = novoAndamento(ficha);
    Store.salvar();
    retomar();
  }

  function bip() {
    try { if (navigator.vibrate) navigator.vibrate([250, 100, 250]); } catch (e) { }
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const c = new C(), o = c.createOscillator(), g = c.createGain();
      o.frequency.value = 880; g.gain.value = .15; o.connect(g); g.connect(c.destination); o.start();
      setTimeout(() => { try { o.stop(); c.close(); } catch (e) { } }, 350);
    } catch (e) { }
  }

  function retomar() {
    const A = andamento(); if (!A || live) return;
    const marca = () => { A.ult = Date.now(); Store.salvar(); };
    const mmss = s_ => p2(Math.floor(s_ / 60)) + ':' + p2(s_ % 60);
    let timer;
    const s = live = sheet(A.nome, `
      <p class="cron" style="margin:0 0 10px;font-size:20px" id="wk-t">00:00:00</p>
      <div class="rest" id="wk-r" hidden><span class="cron" id="wk-rt">00:00</span><button data-rm="-15">−15s</button><button data-rm="15">+15s</button><button data-rm="0">Pular</button></div>
      <div class="f" style="margin-bottom:12px"><span>Descanso padrão entre séries</span><select id="wk-pad">${[45, 60, 90, 120, 150, 180, 240].map(v => `<option value="${v}"${v === (DB.cfg.descanso || 90) ? ' selected' : ''}>${v < 120 ? v + ' s' : (v / 60).toString().replace('.', ',') + ' min'}</option>`).join('')}</select></div>
      <div id="wk"></div>
      <div class="acts" style="justify-content:flex-start"><button class="btn sec" id="wk-add">+ Exercício</button></div>
      <p class="hint" style="margin-top:12px">Toque no número da série para marcá-la como aquecimento (não entra no volume nem nos recordes).</p>
      <div class="g2">${F('Esforço do treino (1–10)', sel('rpe', [['', '—'], ...Array.from({ length: 10 }, (_, i) => String(i + 1))], A.rpe))}</div>
      ${F('Observações', `<textarea name="obs" style="min-height:70px" placeholder="Como foi o treino? Desconfortos, ajustes…">${esc(A.obs)}</textarea>`)}
      <div class="acts"><button class="btn sec" data-desc>Descartar</button><button class="btn" data-fim>Finalizar treino</button></div>`, {
      full: true,
      onClose: () => { clearInterval(timer); live = null; refresh(); },
      beforeClose: async () => { toast('Treino continua em andamento. Retome pela aba Treinos ou pela tela Hoje.'); return true; }
    });

    /* --- relógio geral e descanso --- */
    function tick() {
      const t = s.$('#wk-t'); if (t) t.textContent = Cron.fmt(Date.now() - A.inicio);
      const r = s.$('#wk-r'); if (!r) return;
      if (A.descansoAte) {
        const rem = Math.ceil((A.descansoAte - Date.now()) / 1000);
        if (rem <= 0) {
          const atrasado = -rem > 5;                                   // o app estava em segundo plano: a notificação já avisou
          A.descansoAte = 0; Store.salvar();
          if (!atrasado) { bip(); toast('Descanso terminado — próxima série.'); }
        } else { r.hidden = false; s.$('#wk-rt').textContent = mmss(rem); return; }
      }
      r.hidden = true;
    }
    timer = setInterval(tick, 500); tick();
    s.$$('[data-rm]').forEach(b => b.onclick = () => {
      const d = +b.dataset.rm;
      A.descansoAte = d === 0 ? 0 : Math.max(Date.now() + 1000, A.descansoAte + d * 1000);
      Store.salvar(); tick();
    });
    s.$('#wk-pad').onchange = e => { DB.cfg.descanso = +e.target.value; Store.salvar(); };

    /* --- exercícios e séries --- */
    function desenhar() {
      s.$('#wk').innerHTML = A.exs.length ? A.exs.map((e, i) => {
        const u = ultimaSerie(e.nome); let n = 0;
        return `<div class="ex"><h4>${esc(e.nome)}</h4><small class="mu">${[u ? `Último: ${u.reps} × ${numStr(u.carga)} kg` : 'Sem histórico', e.descanso ? 'descanso ' + e.descanso + ' s' : ''].filter(Boolean).join(' · ')}</small>
        <div class="set hd"><span></span><span>Reps</span><span>kg</span><span></span></div>
        ${e.sets.map((x, j) => `<div class="set"><button class="aq${x.aq ? ' on' : ''}" data-aq="${i}.${j}" aria-label="${x.aq ? 'Série de aquecimento' : 'Série de trabalho'}; toque para alternar">${x.aq ? 'A' : ++n}</button><input inputmode="numeric" data-e="${i}" data-j="${j}" data-k="reps" value="${x.reps || ''}" aria-label="Repetições"><input inputmode="decimal" data-e="${i}" data-j="${j}" data-k="carga" value="${numStr(x.carga)}" aria-label="Carga em kg"><button class="ck${x.ok ? ' on' : ''}" data-ck="${i}.${j}" aria-label="Série concluída"></button></div>`).join('')}
        <div class="exb"><button class="btn sec" data-ad="${i}">+ série</button><button class="btn sec" data-tr="${i}">Trocar</button><button class="btn sec" data-rmx="${i}">Remover</button><button class="btn sec" data-mv="${i}.-1" aria-label="Subir">↑</button><button class="btn sec" data-mv="${i}.1" aria-label="Descer">↓</button></div></div>`;
      }).join('') : '<div class="empty">Adicione um exercício para começar.</div>';

      s.$$('input[data-k]').forEach(el => el.oninput = () => { const x = A.exs[el.dataset.e].sets[el.dataset.j], v = num(el.value); x[el.dataset.k] = isNaN(v) ? 0 : v; marca(); });
      s.$$('[data-aq]').forEach(b => b.onclick = () => { const [i, j] = b.dataset.aq.split('.'); const x = A.exs[i].sets[j]; x.aq = !x.aq; marca(); desenhar(); });
      s.$$('[data-ck]').forEach(b => b.onclick = () => {
        const [i, j] = b.dataset.ck.split('.'), e = A.exs[i], x = e.sets[j];
        x.ok = !x.ok; b.classList.toggle('on', x.ok);
        if (x.ok && !A.exs.every(y => y.sets.every(z => z.ok))) {
          const d = e.descanso || DB.cfg.descanso || 90, dd = x.aq ? Math.min(d, 45) : d;     // aquecimento: descanso curto
          A.descansoAte = Date.now() + dd * 1000; A.descansoTot = dd;
        } else if (!x.ok) A.descansoAte = 0;
        marca(); tick();
      });
      s.$$('[data-ad]').forEach(b => b.onclick = () => { const st = A.exs[b.dataset.ad].sets, u = st[st.length - 1] || { reps: 10, carga: 0 }; st.push({ reps: u.reps, carga: u.carga, ok: false, aq: false }); marca(); desenhar(); });
      s.$$('[data-tr]').forEach(b => b.onclick = () => { const e = A.exs[b.dataset.tr]; pedirNome('Trocar exercício', e.nome, n => {
        const u = ultimaSerie(n); e.nome = n; if (u) e.sets.forEach(x => { if (!x.ok) { x.reps = u.reps; x.carga = u.carga; } }); marca(); desenhar(); }); });
      s.$$('[data-rmx]').forEach(b => b.onclick = async () => {
        const e = A.exs[b.dataset.rmx];
        if (e.sets.some(x => x.ok) && !(await confirmar('Remover este exercício? As séries marcadas serão perdidas.', 'Remover'))) return;
        A.exs.splice(b.dataset.rmx, 1); marca(); desenhar();
      });
      s.$$('[data-mv]').forEach(b => b.onclick = () => { const [i, d] = b.dataset.mv.split('.').map(Number), k = i + d; if (k < 0 || k >= A.exs.length) return; [A.exs[i], A.exs[k]] = [A.exs[k], A.exs[i]]; marca(); desenhar(); });
    }
    desenhar();
    s.$('#wk-add').onclick = () => pedirNome('Adicionar exercício', '', n => { A.exs.push(exDe(n, 3, 10, 0, 0)); marca(); desenhar(); });
    s.$('select[name=rpe]').onchange = e => { A.rpe = e.target.value; marca(); };
    s.$('textarea[name=obs]').oninput = e => { A.obs = e.target.value; marca(); };

    s.$('[data-desc]').onclick = async () => {
      if (!(await confirmar('Descartar este treino em andamento? Nada será salvo no histórico.', 'Descartar'))) return;
      DB.treino.andamento = null; s.fechar(); commit(); toast('Treino descartado.');
    };
    s.$('[data-fim]').onclick = async () => {
      const feitos = A.exs.map(e => ({ nome: e.nome, sets: e.sets.filter(x => x.ok).map(x => x.aq ? { reps: x.reps, carga: x.carga, ok: true, aq: true } : { reps: x.reps, carga: x.carga, ok: true }) })).filter(e => e.sets.length);
      if (!feitos.length) { if (await confirmar('Nenhuma série foi marcada. Descartar este treino?', 'Descartar')) { DB.treino.andamento = null; s.fechar(); commit(); } return; }
      const antes = recordes(DB.treino.sessoes), novos = [];
      feitos.forEach(e => {                                               // recorde = carga maior que a anterior (só quando já havia histórico)
        const r = antes.get(nk(e.nome)), t = setsTrab(e); if (!r || !t.length) return;
        const m = t.reduce((a, x) => (x.carga > a.carga || (x.carga === a.carga && x.reps > a.reps)) ? x : a, t[0]);
        if (m.carga > r.carga || (m.carga === r.carga && m.reps > r.reps)) novos.push(`${e.nome} ${m.reps} × ${numStr(m.carga)} kg`);
      });
      const fim = Date.now() - A.ult > 2 * 36e5 ? A.ult : Date.now();      // se ficou parado horas, a duração vai até o último toque
      const ses = { id: uid('ss'), data: A.data, inicio: A.hora, fichaId: A.fichaId, nome: A.nome, duracao: Math.max(1, Math.round((fim - A.inicio) / 60000)), exercicios: feitos };
      if (A.rpe) ses.rpe = +A.rpe; if (A.obs.trim()) ses.obs = A.obs.trim(); if (novos.length) ses.recs = novos.length;
      DB.treino.sessoes.push(ses); DB.treino.andamento = null;
      s.fechar(); commit();
      toast(novos.length ? `Treino salvo. Novo recorde: ${novos.slice(0, 2).join('; ')}${novos.length > 2 ? ' e mais ' + (novos.length - 2) : ''}` : 'Treino salvo. Bom trabalho!');
    };
  }

  /* =========================================================
     ESTATÍSTICAS
     ========================================================= */
  function linha(pts, fmt) {
    if (pts.length < 2) return '<small class="mu">Registre ao menos dois treinos deste exercício para ver o gráfico.</small>';
    const W = 300, H = 110, pl = 8, pr = 8, pt = 10, pb = 8, ys = pts.map(p => p.y), mn = Math.min(...ys), mx = Math.max(...ys);
    const X = i => pl + i / (pts.length - 1) * (W - pl - pr), Y = y => mx === mn ? H / 2 : H - pb - (y - mn) / (mx - mn) * (H - pt - pb);
    const poly = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Evolução ao longo dos treinos"><polyline points="${poly}" fill="none" stroke="var(--cor)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${pts.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3" fill="var(--cor)"/>`).join('')}</svg>
      <div style="display:flex;justify-content:space-between" class="mu"><small>${fmtData(pts[0].x)}</small><small>mín ${fmt(mn)} · máx ${fmt(mx)}</small><small>${fmtData(pts[pts.length - 1].x)}</small></div>`;
  }

  function rStats(el) {
    const hj = hoje(), per = S.per, ses = DB.treino.sessoes, semana0 = inicioSemana(hj);
    const ini = per === 90 ? addDias(semana0, -77) : addDias(hj, -(per - 1));
    const noPer = ses.filter(s_ => s_.data >= ini && s_.data <= hj), vTot = noPer.reduce((t, s_) => t + volume(s_), 0), tTot = noPer.reduce((t, s_) => t + (s_.duracao || 0), 0);
    const porDia = {}; ses.forEach(s_ => { porDia[s_.data] = (porDia[s_.data] || 0) + volume(s_); });
    const nDias = per === 90 ? diasEntre(ini, hj) + 1 : per, dias = new Set(noPer.map(s_ => s_.data)).size;

    // volume por dia (ou por semana)
    const barras = [];
    if (per === 90) for (let w = 0; w < 12; w++) { const a = addDias(ini, w * 7); let m_ = 0; for (let k = 0; k < 7; k++) m_ += porDia[addDias(a, k)] || 0; barras.push({ m: m_, rot: w % 3 === 0 ? `${+a.slice(8)}/${+a.slice(5, 7)}` : '', v: '' }); }
    else for (let k = 0; k < per; k++) { const d = addDias(ini, k), m_ = porDia[d] || 0; barras.push({ m: m_, rot: per === 7 ? DIAS[pd(d).getDay()] : (k % 5 === 0 ? String(+d.slice(8)) : ''), v: per === 7 && m_ ? compacto(m_) : '' }); }
    const pico = Math.max(1, ...barras.map(b => b.m));
    const grafico = `<div class="gr">${barras.map(b => `<div><i style="height:${Math.round(b.m / pico * 100)}%"></i></div>`).join('')}</div>${per === 7 ? `<div class="gl">${barras.map(b => `<span>${b.v}</span>`).join('')}</div>` : ''}<div class="gl">${barras.map(b => `<span>${b.rot}</span>`).join('')}</div>`;

    // frequência: treinos feitos × dias previstos nas fichas (8 semanas)
    const prev = DB.treino.fichas.reduce((t, f) => t + (f.dias || []).length, 0);
    let freq = '';
    for (let w = 7; w >= 0; w--) {
      const a = addDias(semana0, -7 * w), b = addDias(a, 6), n = ses.filter(s_ => s_.data >= a && s_.data <= b).length, pc = prev ? Math.round(n / prev * 100) : (n ? 100 : 0);
      freq += `<div style="margin:9px 0"><div style="display:flex;justify-content:space-between;gap:8px"><span>${w === 0 ? 'Esta semana' : 'Semana de ' + fmtData(a)}</span><span class="n ${prev && n >= prev ? 'pos' : ''}">${prev ? `${n} de ${prev}` : n + (n === 1 ? ' treino' : ' treinos')}</span></div><div class="bar"><i style="width:${Math.min(100, pc)}%"></i></div></div>`;
    }
    if (!prev) freq += '<small class="mu">Defina os dias da semana nas fichas para comparar treinos previstos e realizados.</small>';

    // recordes (série de trabalho com maior carga; 1RM é só uma estimativa)
    const rec = [...recordes(ses).values()].filter(r => r.data).sort((a, b) => b.data.localeCompare(a.data) || a.nome.localeCompare(b.nome, 'pt-BR'));
    const recHtml = rec.length ? rec.slice(0, 8).map(r => `<div class="row"><div class="t"><b>${esc(r.nome)}</b><small>${fmtData(r.data)}${r.e1 ? ` · 1RM estimado ${numStr(Math.round(r.e1 * 10) / 10)} kg` : ''}</small></div>${diasEntre(r.data, hj) <= 7 ? '<span class="n pos">novo</span>' : ''}<span class="n">${r.carga > 0 ? `${numStr(r.carga)} kg × ${r.reps}` : r.reps + ' reps'}</span></div>`).join('') : '<small class="mu">Os recordes aparecem depois do primeiro treino.</small>';

    // evolução por exercício
    const nomes = nomesEx().filter(n => ses.some(s_ => s_.exercicios.some(e => nk(e.nome) === nk(n) && setsTrab(e).length)));
    const cont = n => ses.filter(s_ => s_.exercicios.some(e => nk(e.nome) === nk(n))).length;
    nomes.sort((a, b) => cont(b) - cont(a));
    if (!nomes.some(n => nk(n) === nk(S.ex))) S.ex = nomes[0] || '';
    let evo = '<small class="mu">Registre treinos para acompanhar cada exercício.</small>';
    if (S.ex) {
      const hist = [...ses].sort((a, b) => a.data.localeCompare(b.data) || (a.inicio || '').localeCompare(b.inicio || '')).map(s_ => {
        const e = s_.exercicios.find(x => nk(x.nome) === nk(S.ex)), t = e ? setsTrab(e) : [];
        return t.length ? { x: s_.data, carga: Math.max(...t.map(y => y.carga)), vol: Math.round(volEx(e)), reps: Math.max(...t.map(y => y.reps)) } : null;
      }).filter(Boolean).slice(-30);
      const usaCarga = hist.some(p => p.carga > 0), met = usaCarga ? S.met : 'reps';
      const f = met === 'vol' ? v => Math.round(v).toLocaleString('pt-BR') + ' kg' : met === 'reps' ? v => v + ' reps' : v => numStr(v) + ' kg';
      evo = `<div class="f" style="margin-bottom:10px"><select id="ex-sel" aria-label="Exercício">${nomes.map(n => `<option value="${esc(n)}"${nk(n) === nk(S.ex) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
        ${usaCarga ? `<div class="seg sm">${[['carga', 'Carga máxima'], ['vol', 'Volume']].map(([v, l]) => `<button data-met="${v}" class="${met === v ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
        ${linha(hist.map(p => ({ x: p.x, y: met === 'vol' ? p.vol : met === 'reps' ? p.reps : p.carga })), f)}
        <div style="margin-top:8px">${hist.slice(-5).reverse().map(p => `<div class="row"><div class="t"><b>${fmtDiaCurto(p.x)}</b></div><span class="n">${usaCarga ? numStr(p.carga) + ' kg · ' : ''}${p.vol ? p.vol.toLocaleString('pt-BR') + ' kg vol.' : p.reps + ' reps'}</span></div>`).join('')}</div>`;
    }

    // atenção (fatos dos registros, sem recomendar treinar mais)
    const av = [];
    const ult = ses.map(s_ => s_.data).sort().pop();
    if (ult && diasEntre(ult, hj) >= 7) av.push(`Último treino registrado: ${quando(ult)}`);
    let esperados = 0; for (let d = semana0; d < hj; d = addDias(d, 1)) esperados += DB.treino.fichas.filter(f => (f.dias || []).includes(pd(d).getDay())).length;
    const feitosSem = ses.filter(s_ => s_.data >= semana0).length;
    if (esperados && feitosSem < esperados) av.push(`Esta semana: ${feitosSem} treino(s) feito(s) para ${esperados} previsto(s) até ontem`);
    nomes.filter(n => cont(n) >= 3).forEach(n => {
      const u = ses.filter(s_ => s_.exercicios.some(e => nk(e.nome) === nk(n))).map(s_ => s_.data).sort().pop();
      if (u && diasEntre(u, hj) >= 14 && av.length < 5) av.push(`${n}: último treino há ${diasEntre(u, hj)} dias`);
    });
    nomes.forEach(n => {
      const l = [...ses].sort((a, b) => a.data.localeCompare(b.data)).map(s_ => { const e = s_.exercicios.find(x => nk(x.nome) === nk(n)); const t = e ? setsTrab(e) : []; return t.length ? Math.max(...t.map(y => y.carga)) : null; }).filter(v => v !== null).slice(-4);
      if (l.length === 4 && l[0] > 0 && l.every(v => v === l[0]) && av.length < 5) av.push(`${n}: mesma carga máxima (${numStr(l[0])} kg) nas últimas 4 sessões`);
    });

    // calendário (5 semanas)
    const i0 = addDias(semana0, -28), conta = {}; ses.forEach(s_ => { conta[s_.data] = (conta[s_.data] || 0) + 1; });
    const calend = `<div class="heat">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => `<b>${d}</b>`).join('')}${Array.from({ length: 35 }, (_, k) => {
      const d = addDias(i0, k), n = conta[d] || 0, fut = d > hj;
      return `<i title="${fmtData(d)} · ${n} treino(s)" style="${fut ? 'background:none;border:1px dashed var(--ln)' : n ? `background:var(--cor);opacity:${n > 1 ? 1 : .7}` : ''}${d === hj ? ';outline:2px solid var(--ink)' : ''}"></i>`;
    }).join('')}</div>`;

    el.innerHTML = faixaAndamento() + `<div class="seg sm">${[[7, '7 dias'], [30, '30 dias'], [90, '12 semanas']].map(([v, l]) => `<button data-p="${v}" class="${per === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="sum"><div><small>Treinos</small><b>${noPer.length}</b></div><div><small>Volume</small><b>${fmtVol(vTot)}</b></div><div><small>Tempo médio</small><b>${noPer.length ? dur(tTot / noPer.length) : '—'}</b></div></div>
      ${av.length ? `<div class="card mod" style="--cor:var(--bad)"><h3>Atenção</h3>${av.slice(0, 5).map(t => `<div class="row"><div class="t"><b style="white-space:normal">${esc(t)}</b></div></div>`).join('')}</div>` : ''}
      <div class="dia">${per === 90 ? 'Volume por semana' : 'Volume por dia'}</div><div class="card">${vTot ? grafico : '<small class="mu">Nenhum treino neste período.</small>'}${vTot ? `<small class="mu" style="display:block;margin-top:8px">${per === 90 ? 'Maior semana' : 'Maior dia'}: ${fmtVol(pico)}${dias ? ` · ${dias} de ${nDias} dias com treino` : ''}</small>` : ''}</div>
      <div class="dia">Frequência: feitos × previstos nas fichas</div><div class="card">${freq}</div>
      <div class="dia">Recordes pessoais</div><div class="card" style="padding:2px 14px">${recHtml}</div>
      <div class="dia">Evolução por exercício</div><div class="card">${evo}</div>
      <div class="dia">Dias de treino (5 semanas)</div><div class="card">${calend}<small class="mu" style="display:block;margin-top:8px">Dia mais escuro = mais de um treino.</small></div>
      <p class="hint">Volume = repetições × carga das séries de trabalho concluídas (aquecimento fica de fora). O 1RM é uma estimativa pela fórmula de Epley e serve só como referência.</p>`;
    ligarFaixa(el);
    $$('[data-p]', el).forEach(b => b.onclick = () => { S.per = +b.dataset.p; refresh(); });
    $$('[data-met]', el).forEach(b => b.onclick = () => { S.met = b.dataset.met; refresh(); });
    const sx = $('#ex-sel', el); if (sx) sx.onchange = () => { S.ex = sx.value; refresh(); };
  }

  registrar({
    id: 'treino', nome: 'Saúde', render,
    fab: () => S.area !== 'treino' ? Saude.fab(S.area) : S.seg === 'fichas' ? () => formFicha(null) : S.seg === 'corpo' ? () => formMedida(null) : null,
    fabLabel: () => S.area !== 'treino' ? Saude.fabLabel(S.area) : S.seg === 'corpo' ? 'Registrar medidas' : 'Nova ficha'
  });
  return { S, fichasDeHoje, feitoHoje, treinosNaSemana, iniciar, retomar, andamento, faixaAndamento, ligarFaixa };
})();
