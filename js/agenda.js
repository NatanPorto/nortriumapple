'use strict';
/* =========================================================
   AGENDA — calendário mensal + lista do dia
   Junta compromissos, contas a pagar/receber, treinos, provas e tarefas.
   ========================================================= */
const Agenda = (() => {
  const S = { mes: hoje().slice(0, 7), sel: hoje() };
  const ultimoDia = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

  const REP_COM_CADA = ['diario', 'semanal', 'mensal'];

  function ocorre(ev, d) {
    if (d < ev.data || (ev.ate && d > ev.ate)) return false;
    const a = pd(ev.data), b = pd(d), cada = Math.max(1, +ev.cada || 1);
    switch (ev.repete) {
      case 'diario': return diasEntre(ev.data, d) % cada === 0;
      case 'uteis': return b.getDay() >= 1 && b.getDay() <= 5;
      case 'semanal': {
        const dias = ev.dias && ev.dias.length ? ev.dias : [a.getDay()];
        if (!dias.includes(b.getDay())) return false;
        return Math.round(diasEntre(inicioSemana(ev.data), inicioSemana(d)) / 7) % cada === 0;
      }
      case 'mensal': {
        const m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
        return m % cada === 0 && b.getDate() === Math.min(a.getDate(), ultimoDia(b));
      }
      case 'anual': return a.getMonth() === b.getMonth() && b.getDate() === Math.min(a.getDate(), ultimoDia(b));
      default: return d === ev.data;
    }
  }

  // hábitos: quantas ocorrências seguidas foram marcadas (até hoje ou até ontem, se hoje ainda não foi feito)
  function sequencia(ev, d) {
    const f = ev.feitos || {};
    let x = f[d] ? d : addDias(d, -1), n = 0;
    for (let g = 0; g < 400 && x >= ev.data; g++, x = addDias(x, -1)) {
      if (!ocorre(ev, x)) continue;
      if (f[x]) n++; else break;
    }
    return n;
  }

  const achar = ref => DB.agenda.eventos.find(x => x.id === ref) || (DB.estudo.aulas || []).find(x => x.id === ref);

  function alternar(ref, d) {
    const ev = achar(ref); if (!ev) return;
    ev.feitos = ev.feitos || {};
    if (ev.feitos[d]) delete ev.feitos[d]; else ev.feitos[d] = true;
    commit();
  }

  function itensDoDia(d) {
    const out = [], hj = hoje();
    DB.agenda.eventos.forEach(ev => {
      if (!ocorre(ev, d)) return;
      const habito = ev.tipo === 'habito', seq = habito && d <= hj ? sequencia(ev, d) : 0;
      out.push({ k: 'evento', cor: 'var(--c-agenda)', hora: ev.hora || '', horaFim: ev.horaFim || '', titulo: ev.titulo, ref: ev.id,
        avisos: ev.avisos, rep: !!ev.repete && ev.repete !== 'nao', habito,
        sub: [ev.hora && (ev.hora + (ev.horaFim ? '\u2013' + ev.horaFim : '')), ev.local, seq > 0 && `Sequência: ${seq} ${seq > 1 ? 'dias' : 'dia'}`].filter(Boolean).join(' · '),
        feito: !!(ev.feitos && ev.feitos[d]) });
    });
    (DB.estudo.aulas || []).forEach(a => {
      if (!ocorre(a, d)) return;
      const m = DB.estudo.materias.find(x => x.id === a.materiaId);
      out.push({ k: 'aula', cor: 'var(--c-estudo)', hora: a.hora || '', horaFim: a.horaFim || '', titulo: 'Aula: ' + (m ? m.nome : 'sem matéria'), ref: a.id, avisos: a.avisos, rep: true,
        sub: [a.hora && (a.hora + (a.horaFim ? '\u2013' + a.horaFim : '')), a.local].filter(Boolean).join(' · '),
        feito: !!(a.feitos && a.feitos[d]) });
    });
    DB.fin.tx.forEach(t => {
      if (t.status === 'pendente' && t.data === d)
        out.push({ k: 'conta', cor: 'var(--c-fin)', hora: '', titulo: (t.tipo === 'entrada' ? 'Receber: ' : 'Pagar: ') + (t.descricao || t.categoria), sub: dinheiro(t.valor), ref: t.id });
    });
    DB.treino.fichas.forEach(f => {
      if (!(f.dias || []).includes(pd(d).getDay())) return;
      const feito = DB.treino.sessoes.some(s => s.data === d && s.fichaId === f.id);
      if (d >= hj || feito) out.push({ k: 'treino', cor: 'var(--c-treino)', hora: f.hora || '', titulo: 'Treino: ' + f.nome, sub: feito ? 'Concluído' : (f.hora || ''), feito, rep: true, ref: f.id });
    });
    DB.estudo.itens.forEach(i => {
      if (i.data === d) {
        const m = DB.estudo.materias.find(x => x.id === i.materiaId);
        out.push({ k: 'prova', cor: 'var(--c-estudo)', hora: '', titulo: ({ prova: 'Prova', entrega: 'Entrega', revisao: 'Revisão' }[i.tipo] || 'Item') + ': ' + i.titulo, sub: m ? m.nome : '', feito: !!i.feito, ref: i.id });
      }
    });
    (DB.estudo.topicos || []).forEach(t => {
      if (t.status !== 'estudando' || !t.proxRev || !(t.proxRev === d || (d === hj && t.proxRev < hj))) return;
      const m = DB.estudo.materias.find(x => x.id === t.materiaId);
      out.push({ k: 'prova', rev: true, cor: 'var(--c-estudo)', hora: '', titulo: 'Revisar: ' + t.nome, sub: m ? m.nome : '', feito: false, ref: t.id });
    });
    DB.trabalho.tarefas.forEach(t => {
      if (t.prazo === d) out.push({ k: 'tarefa', cor: 'var(--c-trab)', hora: '', titulo: 'Prazo: ' + t.titulo, sub: '', feito: !!t.feito, ref: t.id });
    });
    const aba = { evento: 'agenda', aula: 'estudo', conta: 'fin', treino: 'treino', prova: 'estudo', tarefa: 'trab' };
    return out.filter(i => abaOn(aba[i.k])).sort((a, b) => (a.hora || '99:99').localeCompare(b.hora || '99:99'));
  }

  function saldoDia(d) {                    // saldo da conta nesse dia: real se já passou, previsto se for futuro
    const hj = hoje(), v = Fin.saldoEm(d), m = Fin.movDia(d), fut = d > hj, sd = Fin.semDataTotal();
    const rot = d === hj ? 'Saldo hoje' : fut ? 'Saldo previsto neste dia' : 'Saldo no fim deste dia';
    return `<div class="card" data-saldo style="margin-bottom:8px;cursor:pointer"><div style="display:flex;justify-content:space-between;align-items:baseline"><small class="mu">${rot}</small><b class="n ${v < 0 ? 'neg' : ''}">${dinheiro(v)}</b></div>
      ${m.ent || m.sai ? `<small class="mu">${m.ent ? `<span class="pos">+ ${dinheiro(m.ent)}</span>` : ''}${m.ent && m.sai ? ' · ' : ''}${m.sai ? `<span class="neg">− ${dinheiro(m.sai)}</span>` : ''} neste dia</small>` : ''}
      ${fut ? '<small class="mu" style="display:block">Considera o que está a pagar e a receber até esta data' + (sd.saida > 0 ? '; não inclui os ' + dinheiro(sd.saida) + ' sem data marcada' : '') + '.</small>' : ''}</div>`;
  }
  function render(el) {
    const [y, mo] = S.mes.split('-').map(Number), primeiro = S.mes + '-01', ini = inicioSemana(primeiro), hj = hoje();
    const dias = []; for (let i = 0; i < 42; i++) dias.push(addDias(ini, i));
    const celulas = dias.map(d => {
      const cores = [...new Set(itensDoDia(d).map(i => i.cor))].slice(0, 4);
      const fora = !d.startsWith(S.mes);
      return `<button class="d${fora ? ' out' : ''}${d === hj ? ' hoje' : ''}${d === S.sel ? ' sel' : ''}" data-d="${d}" aria-label="${fmtDataL(d)}"><span>${+d.slice(8)}</span><span class="dots">${cores.map(c => `<i style="background:${d === S.sel ? 'var(--on)' : c}"></i>`).join('')}</span></button>`;
    });
    const itens = itensDoDia(S.sel);
    el.innerHTML = `<div class="mnav"><button data-m="-1" aria-label="Mês anterior">‹</button><b>${MESES[mo - 1]} ${y}</b><button data-m="1" aria-label="Próximo mês">›</button></div>
      <div class="cal">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(x => `<div class="wd">${x}</div>`).join('')}${celulas.join('')}</div>
      <div class="dia" style="display:flex;justify-content:space-between"><span>${fmtDataL(S.sel)}${S.sel === hj ? ' · hoje' : ''}</span>${S.sel !== hj ? '<a href="#" id="vh" style="color:var(--cor)">Ir para hoje</a>' : ''}</div>
      ${abaOn('fin') ? saldoDia(S.sel) : ''}
      <div class="card" style="padding:2px 14px">${itens.length ? itens.map(linha).join('') : '<div class="empty">Nada neste dia.<br>Toque em + para criar um compromisso ou hábito.</div>'}</div>`;
    const sdc = $('[data-saldo]', el); if (sdc) sdc.onclick = () => { Fin.S.seg = 'lanc'; go('fin'); };
    $$('[data-m]', el).forEach(b => b.onclick = () => { S.mes = addMeses(S.mes + '-01', +b.dataset.m).slice(0, 7); S.sel = S.mes === hj.slice(0, 7) ? hj : S.mes + '-01'; refresh(); });
    $$('[data-d]', el).forEach(b => b.onclick = () => { S.sel = b.dataset.d; S.mes = S.sel.slice(0, 7); refresh(); });
    const vh = $('#vh', el); if (vh) vh.onclick = e => { e.preventDefault(); S.sel = hj; S.mes = hj.slice(0, 7); refresh(); };
    $$('[data-i]', el).forEach(r => r.onclick = e => abrir(itens[+r.dataset.i], e));
  }
  const linha = (it, i) => `<div class="row${it.feito ? ' done' : ''}" data-i="${i}">
    ${it.k === 'evento' || it.k === 'aula' ? `<button class="ck${it.feito ? ' on' : ''}" data-ck aria-label="Concluir"></button>` : `<span class="dot" style="background:${it.cor}"></span>`}
    <div class="t"><b>${esc(it.titulo)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div></div>`;

  function abrir(it, e) {
    if (it.k === 'evento') {
      const ev = DB.agenda.eventos.find(x => x.id === it.ref);
      if (e.target.closest('[data-ck]')) return alternar(ev.id, S.sel);
      return form(ev);
    }
    if (it.k === 'aula') {
      if (e.target.closest('[data-ck]')) return alternar(it.ref, S.sel);
      Estudos.S.seg = 'aulas'; return go('estudo');
    }
    if (it.k === 'conta') { Fin.S.seg = 'pend'; go('fin'); }
    else if (it.k === 'treino') { Treinos.S.area = 'treino'; Treinos.S.seg = 'fichas'; go('treino'); }
    else if (it.k === 'prova') { Estudos.S.seg = it.rev ? 'pend' : 'itens'; Estudos.S.mat = null; go('estudo'); }
    else if (it.k === 'tarefa') { go('trab'); }
  }

  function form(ev) {
    const novo = !ev, ini = ev || { titulo: '', data: S.sel, hora: '', horaFim: '', local: '', repete: 'nao', cada: 1, dias: [], ate: '', nota: '', tipo: 'compromisso', avisos: null };
    const modo0 = ini.avisos == null ? 'padrao' : (ini.avisos.length ? 'custom' : 'nenhum');
    const hab = ini.tipo === 'habito';
    const s = sheet(novo ? 'Novo na agenda' : 'Editar item', `
      <div class="tg" id="tipo"><button type="button" data-t="compromisso" class="${hab ? '' : 'on'}">Compromisso</button><button type="button" data-t="habito" class="${hab ? 'on' : ''}">Hábito</button></div>
      ${F('Título', inp('titulo', ini.titulo, 'placeholder="Ex.: Aula de inglês, reunião, beber água"'))}
      ${F('Data', inp('data', ini.data, 'type="date"'))}
      <div class="g2">${F('Início', inp('hora', ini.hora, 'type="time"'))}${F('Fim', inp('horaFim', ini.horaFim, 'type="time"'))}</div>
      ${F('Local', inp('local', ini.local))}
      <div class="g2">${F('Repetir', sel('repete', [['nao', 'Não repete'], ['diario', 'Todo dia'], ['uteis', 'Dias úteis (seg a sex)'], ['semanal', 'Toda semana'], ['mensal', 'Todo mês'], ['anual', 'Todo ano']], ini.repete))}<div id="cadaw">${F('A cada (dias)', inp('cada', ini.cada || 1, 'type="number" inputmode="numeric" min="1" max="99"'))}</div></div>
      <div class="f" id="semw"><span>Dias da semana</span><div class="dias">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label><input type="checkbox" data-d="${d}" ${(ini.dias || []).includes(d) ? 'checked' : ''}><span>${DIAS[d]}</span></label>`).join('')}</div></div>
      <div id="ate">${F('Repetir até (opcional)', inp('ate', ini.ate || '', 'type="date"'))}</div>
      ${F('Avisos', sel('avmodo', [['padrao', 'Padrão do app'], ['custom', 'Personalizado'], ['nenhum', 'Sem avisos']], modo0))}
      <p class="hint" id="avdef"></p>
      <div id="avs"></div>
      ${F('Anotações', `<textarea name="nota" style="min-height:70px">${esc(ini.nota || '')}</textarea>`)}
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);

    const rep = s.$('[name=repete]'), dt = s.$('[name=data]'), hr = s.$('[name=hora]');
    const comHora = () => !!hr.value;
    const inicial = Array.isArray(ini.avisos) && ini.avisos.length ? ini.avisos : Notif.padraoPara(!!ini.hora, ini.repete !== 'nao');
    const ed = Notif.editor(s.$('#avs'), inicial, { comHora: !!ini.hora });
    const mostraAv = () => {
      const m = s.$('[name=avmodo]').value, d = s.$('#avdef');
      s.$('#avs').hidden = m !== 'custom'; d.hidden = m !== 'padrao';
      if (m === 'padrao') d.textContent = 'Padrão: ' + Notif.resumo(Notif.padraoPara(comHora(), rep.value !== 'nao')) + '.';
    };
    const mostra = () => {
      const r = rep.value;
      s.$('#ate').hidden = r === 'nao';
      s.$('#cadaw').hidden = !REP_COM_CADA.includes(r);
      s.$('#semw').hidden = r !== 'semanal';
      s.$('#cadaw>.f>span').textContent = 'A cada (' + ({ diario: 'dias', semanal: 'semanas', mensal: 'meses' }[r] || 'dias') + ')';
      if (r === 'semanal' && !s.$$('[data-d]').some(c => c.checked) && dataOk(dt.value)) { const c = s.$(`[data-d="${pd(dt.value).getDay()}"]`); if (c) c.checked = true; }
      mostraAv();
    };
    rep.onchange = mostra; s.$('[name=avmodo]').onchange = mostraAv;
    hr.oninput = () => { ed.setComHora(comHora()); mostraAv(); };
    s.$$('#tipo button').forEach(b => b.onclick = () => {
      s.$$('#tipo button').forEach(x => x.classList.toggle('on', x === b));
      if (b.dataset.t === 'habito' && novo && rep.value === 'nao') { rep.value = 'diario'; mostra(); }
    });
    mostra();

    if (!novo) s.$('[data-del]').onclick = async () => {
      if (!(await confirmar(ini.repete !== 'nao' ? 'Excluir este item e todas as repetições?' : 'Excluir este item?'))) return;
      const idx = DB.agenda.eventos.indexOf(ev); DB.agenda.eventos.splice(idx, 1); s.fechar(); commit();
      toast('Item excluído', () => { DB.agenda.eventos.splice(idx, 0, ev); commit(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el);
      if (!v.titulo.trim()) return toast('Informe o título.');
      if (!dataOk(v.data)) return toast('Informe uma data válida.');
      if (v.ate && !dataOk(v.ate)) return toast('Data final inválida.');
      const rp = v.repete, dias = rp === 'semanal' ? s.$$('[data-d]').filter(c => c.checked).map(c => +c.dataset.d) : [];
      if (rp === 'semanal' && !dias.length) dias.push(pd(v.data).getDay());
      const avisos = v.avmodo === 'padrao' ? null : v.avmodo === 'nenhum' ? [] : ed.get();
      const dados = {
        tipo: s.$('#tipo .on').dataset.t, titulo: v.titulo.trim(), data: v.data, hora: v.hora, horaFim: v.horaFim, local: v.local.trim(),
        repete: rp, cada: REP_COM_CADA.includes(rp) ? Math.max(1, Math.min(99, parseInt(v.cada, 10) || 1)) : 1, dias,
        ate: rp === 'nao' ? '' : v.ate, nota: v.nota.trim(), avisos
      };
      if (novo) DB.agenda.eventos.push({ id: uid('ev'), ...dados, feitos: {} }); else Object.assign(ev, dados);
      S.sel = v.data; S.mes = v.data.slice(0, 7); s.fechar(); commit();
    };
  }

  registrar({ id: 'agenda', nome: 'Agenda', render, fab: () => () => form(null), fabLabel: () => 'Novo item' });
  return { S, itensDoDia, form, alternar, ocorre, achar };
})();
