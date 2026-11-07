'use strict';
/* =========================================================
   TRABALHO — tarefas, projetos e horas trabalhadas
   ========================================================= */
const Trabalho = (() => {
  const S = { seg: 'tarefas', filtro: 'abertas' };
  const PRI = { 1: 'Alta', 2: 'Média', 3: 'Baixa' };
  const projeto = id => DB.trabalho.projetos.find(p => p.id === id);
  const minPeriodo = (ini, pid) => DB.trabalho.horas.filter(x => x.data >= ini && (!pid || x.projetoId === pid)).reduce((t, x) => t + x.min, 0);
  const tarefasUrgentes = () => DB.trabalho.tarefas.filter(t => !t.feito && t.prazo && t.prazo <= hoje()).sort((a, b) => a.prazo.localeCompare(b.prazo));
  const minHoje = () => minPeriodo(hoje());

  function parar() {
    const t = Cron.fim('trabalho'); if (!t) return;
    const reg = { id: uid('hr'), projetoId: t.projetoId || '', data: ymd(new Date(t.inicio)), min: t.min, nota: '' };
    DB.trabalho.horas.push(reg); commit();
    toast('Registrado: ' + dur(t.min), () => { DB.trabalho.horas = DB.trabalho.horas.filter(x => x !== reg); commit(); });
  }
  function comecar(pid) { if (Cron.get('trabalho')) parar(); Cron.ini('trabalho', { projetoId: pid || '' }); commit(); }

  function render(el) {
    el.innerHTML = segHtml([['tarefas', 'Tarefas'], ['projetos', 'Projetos'], ['horas', 'Horas']], S.seg) + '<div id="tb-c"></div>';
    $$('.seg button', el).forEach(b => b.onclick = () => { S.seg = b.dataset.s; refresh(); });
    ({ tarefas: rTarefas, projetos: rProj, horas: rHoras })[S.seg]($('#tb-c', el));
  }

  function rTarefas(el) {
    const hj = hoje(), todas = DB.trabalho.tarefas;
    let l = S.filtro === 'feitas' ? todas.filter(t => t.feito) : S.filtro === 'hoje' ? todas.filter(t => !t.feito && t.prazo && t.prazo <= hj) : todas.filter(t => !t.feito);
    l = [...l].sort((a, b) => S.filtro === 'feitas' ? (b.feitoEm || '').localeCompare(a.feitoEm || '') : (a.prazo || '9999').localeCompare(b.prazo || '9999') || (a.prioridade || 2) - (b.prioridade || 2));
    el.innerHTML = `<div class="seg sm">${[['abertas', 'Abertas'], ['hoje', 'Para hoje'], ['feitas', 'Concluídas']].map(([k, n]) => `<button data-f="${k}" class="${S.filtro === k ? 'on' : ''}">${n}</button>`).join('')}</div>` +
      (l.length ? `<div class="card" style="padding:2px 14px">${l.slice(0, 100).map(t => { const p = projeto(t.projetoId), atras = !t.feito && t.prazo && t.prazo < hj; return `<div class="row${t.feito ? ' done' : ''}" data-t="${t.id}"><button class="ck${t.feito ? ' on' : ''}" data-ck aria-label="Concluir"></button><div class="t"><b>${t.prioridade === 1 && !t.feito ? '! ' : ''}${esc(t.titulo)}</b><small>${[p && esc(p.nome), t.prazo && `<span class="${atras ? 'neg' : ''}">${fmtData(t.prazo)} · ${quando(t.prazo)}</span>`].filter(Boolean).join(' · ') || PRI[t.prioridade || 2]}</small></div></div>`; }).join('')}</div>`
        : `<div class="empty">${S.filtro === 'feitas' ? 'Nenhuma tarefa concluída ainda.' : 'Nada pendente.<br>Toque em + para adicionar uma tarefa.'}</div>`);
    $$('[data-f]', el).forEach(b => b.onclick = () => { S.filtro = b.dataset.f; refresh(); });
    $$('[data-t]', el).forEach(r => r.onclick = e => {
      const t = DB.trabalho.tarefas.find(x => x.id === r.dataset.t);
      if (e.target.closest('[data-ck]')) { t.feito = !t.feito; t.feitoEm = t.feito ? hoje() : ''; commit(); } else formTarefa(t);
    });
  }

  function rProj(el) {
    const mes = hoje().slice(0, 7) + '-01';
    el.innerHTML = DB.trabalho.projetos.length ? DB.trabalho.projetos.map(p => {
      const abertas = DB.trabalho.tarefas.filter(t => t.projetoId === p.id && !t.feito).length, mm = minPeriodo(mes, p.id);
      return `<div class="card mod" data-p="${p.id}"><h3><span>${esc(p.nome)}</span>${p.valorHora ? `<span class="n">${dinheiro(r2(mm / 60 * p.valorHora))}</span>` : ''}</h3><small class="mu">${p.cliente ? esc(p.cliente) + ' · ' : ''}${abertas} tarefas abertas · ${dur(mm)} no mês</small></div>`;
    }).join('') : '<div class="empty">Crie projetos para organizar tarefas e horas.<br>Toque em + para começar.</div>';
    $$('[data-p]', el).forEach(c => c.onclick = () => formProjeto(projeto(c.dataset.p)));
  }

  function rHoras(el) {
    const run = Cron.get('trabalho'), rp = run && projeto(run.projetoId), hj = hoje(), ini = inicioSemana(hj);
    const l = [...DB.trabalho.horas].sort((a, b) => b.data.localeCompare(a.data));
    el.innerHTML = (run ? `<div class="run"><div><small>Trabalhando${rp ? ' em ' + esc(rp.nome) : ''}</small><div class="cron" data-cron="trabalho">${Cron.fmt(Date.now() - run.inicio)}</div></div><button id="stop">Parar</button></div>`
      : `<div class="card"><h3>Cronômetro</h3>${sel('pj', [['', 'Sem projeto'], ...DB.trabalho.projetos.map(p => [p.id, p.nome])], '')}<div class="acts"><button class="btn block" id="start">Iniciar</button></div></div>`) +
      `<div class="sum"><div><small>Hoje</small><b class="n">${dur(minPeriodo(hj))}</b></div><div><small>Semana</small><b class="n">${dur(minPeriodo(ini))}</b></div><div><small>Mês</small><b class="n">${dur(minPeriodo(hj.slice(0, 7) + '-01'))}</b></div></div>` +
      (l.length ? `<div class="card" style="padding:2px 14px">${l.slice(0, 60).map(x => { const p = projeto(x.projetoId); return `<div class="row" data-h="${x.id}"><div class="t"><b>${p ? esc(p.nome) : 'Sem projeto'}</b><small>${fmtDiaCurto(x.data)}${x.nota ? ' · ' + esc(x.nota) : ''}</small></div><span class="n">${dur(x.min)}</span></div>`; }).join('')}</div>` : '<div class="empty">Suas horas trabalhadas aparecem aqui.<br>Use o cronômetro ou toque em + para lançar manualmente.</div>');
    const st = $('#stop', el); if (st) st.onclick = parar;
    const sa = $('#start', el); if (sa) sa.onclick = () => comecar($('[name=pj]', el).value);
    $$('[data-h]', el).forEach(r => r.onclick = () => formHora(DB.trabalho.horas.find(x => x.id === r.dataset.h)));
  }

  function formTarefa(t) {
    const novo = !t, ini = t || { titulo: '', projetoId: '', prazo: '', prioridade: 2, nota: '' };
    const s = sheet(novo ? 'Nova tarefa' : 'Editar tarefa', `${F('Tarefa', inp('titulo', ini.titulo, 'placeholder="O que precisa ser feito?"'))}
      ${F('Projeto', sel('projetoId', [['', 'Sem projeto'], ...DB.trabalho.projetos.map(p => [p.id, p.nome])], ini.projetoId))}
      <div class="g2">${F('Prazo', inp('prazo', ini.prazo || '', 'type="date"'))}${F('Prioridade', sel('prioridade', Object.entries(PRI), ini.prioridade || 2))}</div>
      ${F('Anotações', `<textarea name="nota" style="min-height:70px">${esc(ini.nota || '')}</textarea>`)}
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    if (!novo) s.$('[data-del]').onclick = async () => {
      if (!(await confirmar('Excluir esta tarefa?'))) return;
      const i = DB.trabalho.tarefas.indexOf(t); DB.trabalho.tarefas.splice(i, 1); s.fechar(); commit();
      toast('Tarefa excluída', () => { DB.trabalho.tarefas.splice(i, 0, t); commit(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el); if (!v.titulo.trim()) return toast('Descreva a tarefa.'); if (v.prazo && !dataOk(v.prazo)) return toast('Prazo inválido.');
      const d = { titulo: v.titulo.trim(), projetoId: v.projetoId, prazo: v.prazo, prioridade: +v.prioridade, nota: v.nota.trim() };
      if (novo) DB.trabalho.tarefas.push({ id: uid('tf'), ...d, feito: false }); else Object.assign(t, d);
      s.fechar(); commit();
    };
  }

  function formProjeto(p) {
    const novo = !p, ini = p || { nome: '', cliente: '', valorHora: '' };
    const s = sheet(novo ? 'Novo projeto' : 'Editar projeto', `${F('Nome', inp('nome', ini.nome))}
      <div class="g2">${F('Cliente (opcional)', inp('cliente', ini.cliente || ''))}${F('Valor por hora (R$)', inp('valorHora', ini.valorHora ? numStr(ini.valorHora) : '', 'inputmode="decimal"'))}</div>
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    if (!novo) s.$('[data-del]').onclick = async () => {
      if (!(await confirmar('Excluir o projeto? Tarefas e horas ficam sem projeto.'))) return;
      DB.trabalho.tarefas.forEach(t => { if (t.projetoId === p.id) t.projetoId = ''; }); DB.trabalho.horas.forEach(x => { if (x.projetoId === p.id) x.projetoId = ''; });
      DB.trabalho.projetos = DB.trabalho.projetos.filter(x => x !== p); s.fechar(); commit();
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), vh = v.valorHora.trim() ? num(v.valorHora) : 0; if (!v.nome.trim()) return toast('Informe o nome.'); if (isNaN(vh) || vh < 0) return toast('Valor por hora inválido.');
      const d = { nome: v.nome.trim(), cliente: v.cliente.trim(), valorHora: vh };
      if (novo) DB.trabalho.projetos.push({ id: uid('pj'), ...d }); else Object.assign(p, d);
      s.fechar(); commit();
    };
  }

  function formHora(x) {
    const novo = !x, ini = x || { projetoId: '', data: hoje(), min: '', nota: '' };
    const s = sheet(novo ? 'Lançar horas' : 'Editar horas', `${F('Projeto', sel('projetoId', [['', 'Sem projeto'], ...DB.trabalho.projetos.map(p => [p.id, p.nome])], ini.projetoId))}
      <div class="g2">${F('Data', inp('data', ini.data, 'type="date"'))}${F('Minutos', inp('min', ini.min, 'type="number" inputmode="numeric" min="1"'))}</div>
      ${F('Anotação (opcional)', inp('nota', ini.nota || ''))}
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    if (!novo) s.$('[data-del]').onclick = async () => { if (await confirmar('Excluir este lançamento?')) { DB.trabalho.horas = DB.trabalho.horas.filter(y => y !== x); s.fechar(); commit(); } };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), min = parseInt(v.min); if (!(min > 0)) return toast('Informe os minutos.'); if (!dataOk(v.data)) return toast('Data inválida.');
      const d = { projetoId: v.projetoId, data: v.data, min, nota: v.nota.trim() };
      if (novo) DB.trabalho.horas.push({ id: uid('hr'), ...d }); else Object.assign(x, d);
      s.fechar(); commit();
    };
  }

  registrar({
    id: 'trab', nome: 'Trabalho', render,
    fab: () => S.seg === 'tarefas' ? () => formTarefa(null) : S.seg === 'projetos' ? () => formProjeto(null) : () => formHora(null),
    fabLabel: () => S.seg === 'tarefas' ? 'Nova tarefa' : S.seg === 'projetos' ? 'Novo projeto' : 'Lançar horas'
  });
  return { S, tarefasUrgentes, minHoje, comecar, parar };
})();
