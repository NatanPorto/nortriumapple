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
    const tarefas = DB.trabalho.tarefas;
    const pend = tarefas.filter(t => !t.feito && t.prazo && t.prazo <= hj).length;
    const fechadas = tarefas.filter(t => t.feito && t.feitoEm === hj).length;
    total += pend + fechadas; feitos += fechadas;
    const comp = itens.filter(i => i.k === 'evento' || i.k === 'aula').length;
    return { total, feitos, pct: total ? Math.round(feitos / total * 100) : 0, comp };
  }
  const anel = pct => { const R = 40, C = 2 * Math.PI * R; return `<div class="ring"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="${R}"/><circle class="fg" cx="50" cy="50" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}"/></svg><b>${pct}%</b></div>`; };

  function render(el) {
    const hj = hoje(), nomeRaw = (DB.cfg.nome || '').trim(), nome = nomeRaw ? ', ' + esc(nomeRaw) : '';
    const agenda = Agenda.itensDoDia(hj).filter(i => i.k === 'evento' || i.k === 'aula');
    const pend = Fin.pendentes(), venc = pend.filter(t => t.data < hj), prox = pend.filter(t => t.data >= hj && diasEntre(hj, t.data) <= 7);
    const fichas = Treinos.fichasDeHoje(), urg = Trabalho.tarefasUrgentes(), run = Cron.get('estudo'), prova = Estudos.proximos(14).slice(0, 3), pe = Estudos.pend();
    const vazio = !DB.agenda.eventos.length && !DB.fin.tx.length && !DB.treino.fichas.length && !DB.estudo.materias.length && !DB.trabalho.tarefas.length;
    const pg = progressoDoDia(hj);
    const msg = !pg.total ? ['Dia livre!', 'Que tal planejar algo na Agenda?'] : pg.pct >= 100 ? ['Missão cumprida!', 'Você concluiu tudo de hoje.'] : pg.pct >= 50 ? ['Você está indo muito bem!', 'Continue focado nos seus objetivos.'] : ['Vamos nessa!', 'Cada tarefa concluída conta.'];

    el.innerHTML = `<div class="brand"><span class="logo"><i class="lg" role="img" aria-label="NORTRIUM"></i><b class="wm">NORTRIUM</b></span><button class="ib" id="av-cfg" aria-label="Ajustes"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button></div><div class="hi"><div class="tx"><div class="nome">Olá${nome}!</div><div class="mu">${fmtDataL(hj)} · ${saudacao().toLowerCase()}</div></div></div>
      <button class="prog" data-ir="agenda">${anel(pg.pct)}<div class="tx"><div class="tt">Seu progresso do dia</div>
        <div class="li"><i>✓</i>${pg.feitos} de ${pg.total} tarefa${pg.total === 1 ? '' : 's'}</div>
        <div class="li"><i>✓</i>${pg.comp} compromisso${pg.comp === 1 ? '' : 's'}</div></div><span class="go">›</span></button>
      ${vazio ? '<div class="card"><b>Comece por onde quiser.</b><p class="mu sm" style="margin:6px 0 0">Use a barra de baixo para abrir cada área. Se você usava o Fluxo de Caixa, importe o backup em Ajustes (ícone no canto, ou em Mais).</p></div>' : ''}
      <div class="sech"><b>Próximas atividades</b><a href="#" data-ir="agenda">Ver todas →</a></div>
      ${agenda.length ? agenda.slice(0, 6).map(i => `<div class="ativ${i.feito ? ' done' : ''}" style="--mc:${i.cor}"><span class="hr">${i.hora || '—'}</span><span class="ic">${svg(ICONE_K[i.k])}</span><div class="t"><b>${esc(i.titulo)}</b>${i.sub ? `<small>${esc(i.sub.replace(/^\d{2}:\d{2}(\u2013\d{2}:\d{2})?( · )?/, '') || (i.k === 'aula' ? 'Estudos' : 'Agenda'))}</small>` : ''}</div><button class="ck${i.feito ? ' on' : ''}" data-ev="${i.ref}" aria-label="Concluir"></button></div>`).join('') : '<div class="card mu sm">Nada na agenda hoje.</div>'}
      <div class="qa">
        <button data-qa="fin" style="--mc:var(--c-fin)">${svg('fin')}Finanças</button>
        <button data-qa="treino" style="--mc:var(--c-treino)">${svg('treino')}Treinos</button>
        <button data-qa="dieta" style="--mc:var(--c-dieta)">${svg('saude')}Saúde</button>
        <button data-qa="estudo" style="--mc:var(--c-estudo)">${svg('estudo')}Estudos</button>
        <button data-qa="trab" style="--mc:var(--c-trab)">${svg('trab')}Trabalho</button>
        <button data-qa="mais" style="--mc:var(--mu)">${svg('mais')}Mais</button>
      </div>
      <div class="banner">${svg('trofeu')}<div><b>${msg[0]}</b><small>${msg[1]}</small></div></div>
      ${card('fin', 'var(--c-fin)', 'Finanças', `<div class="big">${dinheiro(Fin.saldoTotal())}</div><small class="mu">saldo nas contas</small>
        ${venc.length ? `<div class="row"><div class="t"><b class="neg">${venc.length} vencido${venc.length > 1 ? 's' : ''}</b><small>${esc(venc[0].descricao || venc[0].categoria)}${venc.length > 1 ? ' e mais ' + (venc.length - 1) : ''}</small></div><span class="n neg">${dinheiro(soma(venc.map(t => t.tipo === 'saida' ? t.valor : 0)))}</span></div>` : ''}
        ${prox.slice(0, 3).map(t => `<div class="row" data-id="${t.id}"><button class="ck" data-q="${t.id}" aria-label="Dar baixa"></button><div class="t"><b>${esc(t.descricao || t.categoria)}</b><small>${t.tipo === 'entrada' ? 'Receber' : 'Pagar'} · ${quando(t.data)}</small></div><span class="n">${dinheiro(t.valor)}</span></div>`).join('')}`)}
      ${card('treino', 'var(--c-treino)', 'Treino', Treinos.faixaAndamento() + (fichas.length ? fichas.map(f => { const s = Treinos.feitoHoje(f); return `<div class="row"><div class="t"><b>${esc(f.nome)}</b><small>${s ? 'Concluído · ' + dur(s.duracao) : f.exercicios.length + ' exercícios'}</small></div>${s ? '<span class="n pos">✓</span>' : `<button class="btn" data-tr="${f.id}" style="padding:7px 16px">Iniciar</button>`}</div>`; }).join('') : '<div class="mu sm">Sem treino marcado para hoje.</div>') + `<small class="mu">${Treinos.treinosNaSemana()} treino(s) nesta semana</small>`)}
      ${Saude.cardDieta()}
      ${Saude.cardAgua()}
      ${card('estudo', 'var(--c-estudo)', 'Estudos', `${run ? `<div class="row"><div class="t"><b>Cronômetro ligado</b><small data-cron="estudo">${Cron.fmt(Date.now() - run.inicio)}</small></div></div>` : ''}<small class="mu">Hoje ${dur(Estudos.minHoje())} · semana ${dur(Estudos.minSemana())}</small>
        ${pe.rev || pe.atras ? `<div class="row" data-es-pend><div class="t"><b>${[pe.rev && pe.rev + ' revisã' + (pe.rev > 1 ? 'ões' : 'o'), pe.atras && pe.atras + ' atrasado' + (pe.atras > 1 ? 's' : '')].filter(Boolean).join(' · ')}</b><small>toque para ver as pendências</small></div></div>` : ''}
        ${prova.map(i => { const p = Estudos.progresso(i); return `<div class="row"><div class="t"><b>${esc(i.titulo)}</b><small>${fmtData(i.data)} · ${quando(i.data)}${p.n ? ' · ' + p.pct + '% estudado' : ''}</small></div></div>`; }).join('')}`)}
      ${card('trab', 'var(--c-trab)', 'Trabalho', (urg.length ? urg.slice(0, 4).map(t => `<div class="row"><button class="ck" data-tf="${t.id}" aria-label="Concluir"></button><div class="t"><b>${esc(t.titulo)}</b><small class="${t.prazo < hj ? 'neg' : ''}">${t.prazo < hj ? 'atrasada · ' : ''}${quando(t.prazo)}</small></div></div>`).join('') : '<div class="mu sm">Nenhuma tarefa com prazo para hoje.</div>') + `<small class="mu">Horas hoje: ${dur(Trabalho.minHoje())}</small>`)}`;

    const avs = Notif.avisosDeHoje();
    el.insertAdjacentHTML('beforeend', `<div class="card" style="--mc:var(--c-agenda)"><h3><span class="ci">${svg('aviso')}</span>Avisos<a href="#" data-av>Gerenciar</a></h3>${avs.length
      ? avs.slice(0, 4).map(a => `<div class="row"><div class="t"><b>${esc(a.titulo)}</b><small>${a.horas.slice(0, 5).join(' · ')}${a.horas.length > 5 ? ' …' : ''}</small></div></div>`).join('') + (avs.length > 4 ? `<small class="mu">e mais ${avs.length - 4}</small>` : '')
      : '<small class="mu">Crie lembretes que se repetem todo dia ou toda semana e só enviam notificação.</small>'}</div>`);
    $('#av-cfg', el).onclick = ajustes;
    $$('[data-av]', el).forEach(a => a.onclick = e => { e.preventDefault(); Notif.avisosTela(); });
    $$('[data-ir]', el).forEach(a => a.onclick = e => { e.preventDefault(); if (a.dataset.ir === 'treino') Treinos.S.area = 'treino'; go(a.dataset.ir); });
    $$('[data-qa]', el).forEach(b => b.onclick = () => {
      const k = b.dataset.qa;
      if (k === 'mais') return maisTela();
      if (k === 'treino') { Treinos.S.area = 'treino'; return go('treino'); }
      if (k === 'dieta') return Saude.abrirArea('dieta');
      go(k);
    });
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
