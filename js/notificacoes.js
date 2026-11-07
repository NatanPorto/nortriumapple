'use strict';
/* =========================================================
   NOTIFICAÇÕES — lembretes locais (funcionam com o app fechado)
   Cada item da Agenda (compromissos, contas, treinos, provas e prazos)
   gera avisos conforme REGRAS:
     { k:'antes',  n, u:'min'|'h'|'d' }   → "n minutos/horas/dias antes"
     { k:'diario', dias, vezes }          → "todo dia, de 'dias' dias antes até o dia, 'vezes' vezes ao dia"
   Regras padrão: c.avHora (itens com horário) e c.avDia (sem horário).
   Compromissos podem ter regras próprias (ev.avisos).
   O agendamento é refeito sempre que os dados mudam.
   ========================================================= */
const Notif = (() => {
  const L = () => (window.cordova && cordova.plugins && cordova.plugins.notification && cordova.plugins.notification.local) || null;
  const TIPOS = [['evento', 'Agenda (compromissos e hábitos)'], ['aula', 'Aulas'], ['aviso', 'Meus avisos (lembretes avulsos)'], ['conta', 'Contas a pagar e receber'], ['treino', 'Treinos'], ['prova', 'Provas, entregas e revisões'], ['tarefa', 'Prazos de tarefas (Trabalho)']];
  const MOD = { evento: 'agenda', aula: 'estudo', aviso: 'hoje', conta: 'fin', treino: 'treino', prova: 'estudo', tarefa: 'trab' };
  const UNID = [['min', 'minutos'], ['h', 'horas'], ['d', 'dias']];
  const MAX = 400;                                  // o Android limita a ~500 alarmes por app
  let fila = Promise.resolve(), timer = null;

  /* ---------- configuração (com migração da versão anterior) ---------- */
  const cfg = () => {
    const c = DB.cfg.notif;
    if (!Array.isArray(c.avHora)) c.avHora = [{ k: 'antes', n: c.antecedencia || 0, u: 'min' }];
    if (!Array.isArray(c.avDia)) c.avDia = [{ k: 'antes', n: 0, u: 'd' }, { k: 'antes', n: 1, u: 'd' }];
    if (!c.horaFim) c.horaFim = '20:00';
    if (c.tipos.aula === undefined) c.tipos.aula = true;
    if (c.tipos.aviso === undefined) c.tipos.aviso = true;
    return c;
  };
  // Para itens que se repetem, o padrão só avisa no próprio dia/horário (senão avisaria "amanhã" todo dia).
  const padraoPara = (comHora, rep) => {
    const c = cfg(), r = comHora ? c.avHora : c.avDia;
    return rep ? r.filter(x => x.k === 'antes' && (x.u !== 'd' || x.n === 0)) : r;
  };
  const resumo = l => {
    if (!l || !l.length) return 'nenhum aviso';
    return l.map(r => r.k === 'diario'
      ? `todo dia, de ${r.dias} dia${r.dias > 1 ? 's' : ''} antes até o dia (${r.vezes}× ao dia)`
      : r.u === 'd' ? (r.n === 0 ? 'no próprio dia' : `${r.n} dia${r.n > 1 ? 's' : ''} antes`)
        : r.n === 0 ? 'na hora' : `${r.n} ${r.u === 'h' ? (r.n > 1 ? 'horas' : 'hora') : 'min'} antes`).join('; ');
  };

  /* ---------- cálculo dos avisos ---------- */
  const em = (d, hhmm, antes) => {                  // Date de "d às hhmm" menos 'antes' minutos
    const [hh, mm] = String(hhmm).split(':').map(Number), t = pd(d);
    t.setHours(hh || 0, (mm || 0) - antes, 0, 0); return t;
  };
  const horarios = (c, x) => {                      // 'x' horários espalhados entre c.hora e c.horaFim
    x = Math.max(1, Math.min(8, parseInt(x, 10) || 1));
    const [h1, m1] = c.hora.split(':').map(Number), [h2, m2] = c.horaFim.split(':').map(Number);
    const a = h1 * 60 + m1, b = Math.max(a, h2 * 60 + m2);
    return Array.from({ length: x }, (_, i) => { const t = x === 1 ? a : Math.round(a + (b - a) * i / (x - 1)); return p2(Math.floor(t / 60)) + ':' + p2(t % 60); });
  };
  const prefDia = n => n <= 0 ? 'Hoje' : n === 1 ? 'Amanhã' : `Em ${n} dias`;
  const prefMin = r => r.n === 0 ? 'Agora' : r.u === 'h' ? `Em ${r.n} h` : `Em ${r.n} min`;

  function regrasDe(it) {
    const comHora = !!it.hora && (it.k === 'evento' || it.k === 'treino' || it.k === 'aula');
    const regras = ((it.k === 'evento' || it.k === 'aula') && Array.isArray(it.avisos)) ? it.avisos : padraoPara(comHora, !!it.rep);
    return { comHora, regras };
  }

  /* ---------- avisos avulsos (não entram na agenda) ---------- */
  const avisosL = () => (DB.avisos = DB.avisos || []);
  const hm = t => p2(Math.floor(t / 60)) + ':' + p2(t % 60);
  const minutos = hh => { const [h, m] = String(hh || '08:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  function horasDoAviso(a) {                        // horários do dia: um só, ou de X em X horas até horaFim
    const ini = minutos(a.hora);
    if (!(a.intervalo > 0)) return [hm(ini)];
    const fim = Math.max(ini, minutos(a.horaFim || '20:00')), out = [];
    for (let t = ini; t <= fim && out.length < 24; t += a.intervalo * 60) out.push(hm(t));
    return out;
  }
  const avisosDeHoje = () => avisosL().filter(a => a.ativo && Agenda.ocorre(a, hoje())).map(a => ({ titulo: a.titulo, horas: horasDoAviso(a) }));

  function montar() {
    const c = cfg(), agora = Date.now(), hj = hoje(), lista = [], visto = new Set();
    const horizonte = c.dias || 14, limite = agora + horizonte * 864e5;
    let adiante = 0;                                // quantos dias à frente precisamos olhar (avisos "N dias antes")
    const olha = rs => (rs || []).forEach(r => { adiante = Math.max(adiante, r.k === 'diario' ? r.dias : (r.u === 'd' ? r.n : 0)); });
    olha(c.avHora); olha(c.avDia); DB.agenda.eventos.forEach(ev => olha(ev.avisos));
    adiante = Math.min(adiante, 90);

    for (let i = 0; i <= horizonte + adiante; i++) {
      const d = addDias(hj, i);
      Agenda.itensDoDia(d).forEach(it => {
        if (it.feito || !c.tipos[it.k]) return;
        const { comHora, regras } = regrasDe(it), ref = comHora ? em(d, it.hora, 0) : null;
        const add = (t, prefixo) => {
          const ms = t.getTime();
          if (ms < agora + 5000 || ms > limite || (ref && ms > ref.getTime())) return;
          const chave = it.k + '|' + it.ref + '|' + d + '|' + ms;
          if (visto.has(chave)) return; visto.add(chave);
          lista.push({ quando: t, title: it.titulo, text: [prefixo, it.sub].filter(Boolean).join(' · '), data: { mod: MOD[it.k] } });
        };
        regras.forEach(r => {
          if (r.k === 'antes') {
            if (r.u === 'd') add(em(addDias(d, -r.n), c.hora, 0), prefDia(r.n));
            else if (ref) add(new Date(ref.getTime() - r.n * (r.u === 'h' ? 36e5 : 6e4)), prefMin(r));
          } else if (r.k === 'diario') {
            horarios(c, r.vezes).forEach(hh => { for (let k = r.dias; k >= 0; k--) add(em(addDias(d, -k), hh, 0), prefDia(k)); });
          }
        });
      });
    }
    if (c.tipos.aviso) avisosL().forEach(av => {
      if (!av.ativo) return;
      for (let i = 0; i <= horizonte; i++) {
        const d = addDias(hj, i);
        if (!Agenda.ocorre(av, d)) continue;
        horasDoAviso(av).forEach(hh => {
          const t = em(d, hh, 0), ms = t.getTime();
          if (ms < agora + 5000 || ms > limite) return;
          lista.push({ quando: t, title: av.titulo, text: av.texto || '', data: { mod: 'hoje' } });
        });
      }
    });
    lista.sort((a, b) => a.quando - b.quando);
    const out = lista.slice(0, MAX).map((n, i) => ({ id: i + 1, title: n.title, text: n.text || 'Lembrete', trigger: { at: n.quando }, data: n.data, foreground: true }));
    const an = DB.treino.andamento;                 // fim do descanso entre séries (só aparece com o app em segundo plano)
    if (an && an.descansoAte > agora + 1500) out.push({ id: 90001, title: 'Descanso terminado', text: 'Hora da próxima série · ' + an.nome, trigger: { at: new Date(an.descansoAte) }, data: { mod: 'treino' }, foreground: false });
    return out;
  }

  const limite = (fn, ms = 6000) => new Promise(ok => { const t = setTimeout(ok, ms); try { fn(() => { clearTimeout(t); ok(); }); } catch (e) { console.error(e); clearTimeout(t); ok(); } });

  let ultimoHash = '', estado = null;                // estado: { agendadas, esperadas, em } da última conferência

  async function rodar(forcar) {
    const l = L(); if (!l) return;
    const itens = DB.cfg.notif.ativo ? montar() : [];
    const h = JSON.stringify(itens.map(i => [i.id, i.title, i.text, +i.trigger.at]));
    if (!forcar && h === ultimoHash) return;         // nada mudou: não mexe nos alarmes (evita recriar tudo a cada toque)
    ultimoHash = '';
    await limite(cb => l.cancelAll(cb));
    if (itens.length) await limite(cb => l.schedule(itens, cb));
    // confere se o Android realmente guardou os alarmes; se não, tenta de novo na próxima oportunidade
    const ids = await new Promise(ok => { const t = setTimeout(() => ok(null), 4000); try { if (!l.getScheduledIds) { clearTimeout(t); return ok(null); } l.getScheduledIds(x => { clearTimeout(t); ok(x); }); } catch (e) { clearTimeout(t); ok(null); } });
    estado = { agendadas: ids ? ids.length : null, esperadas: itens.length, em: Date.now() };
    if (ids && ids.length >= itens.length) ultimoHash = h;
  }

  function agendar(imediato, forcar) {
    clearTimeout(timer);
    timer = setTimeout(() => { fila = fila.then(() => rodar(forcar)).catch(e => console.error('Notificações', e)); }, imediato ? 0 : 1500);
  }

  function pedir() {
    const l = L(); if (!l) return;
    l.requestPermission(ok => { if (!ok) toast('Permissão negada. Ative as notificações do app nas configurações do Android.'); else agendar(true); });
  }

  /* ---------- editor de regras (usado na Agenda e nos ajustes) ---------- */
  const lim = (v, a, b, pad) => { const n = parseInt(v, 10); return isNaN(n) ? pad : Math.max(a, Math.min(b, n)); };

  function editor(host, inicial, opt = {}) {
    const lista = (inicial || []).map(r => ({ ...r }));
    let comHora = !!opt.comHora;
    const avisar = () => { if (opt.onChange) opt.onChange(lista.map(r => ({ ...r }))); };
    const nm = (cls, v, a, b) => `<input class="${cls}" type="number" inputmode="numeric" min="${a}" max="${b}" value="${v}">`;
    const linha = (r, i) => r.k === 'diario'
      ? `<div class="av" data-i="${i}"><span>Todo dia, de</span>${nm('q-dias', r.dias, 1, 30)}<span>dias antes até o dia,</span>${nm('q-vezes', r.vezes, 1, 8)}<span>vez(es) ao dia</span><button type="button" class="rm" aria-label="Remover aviso">×</button></div>`
      : `<div class="av" data-i="${i}">${nm('q-n', r.n, 0, 999)}<select class="q-u">${UNID.map(([v, l]) => `<option value="${v}"${r.u === v ? ' selected' : ''}>${l}</option>`).join('')}</select><span>antes</span><button type="button" class="rm" aria-label="Remover aviso">×</button></div>`;
    const ler = () => $$('.av', host).forEach(row => {
      const r = lista[+row.dataset.i]; if (!r) return;
      if (r.k === 'diario') { r.dias = lim($('.q-dias', row).value, 1, 30, 1); r.vezes = lim($('.q-vezes', row).value, 1, 8, 1); }
      else { r.n = lim($('.q-n', row).value, 0, 999, 0); r.u = $('.q-u', row).value; }
    });
    const desenhar = () => {
      host.innerHTML = `<div class="avs">${lista.length ? lista.map(linha).join('') : '<div class="mu sm" style="padding:6px 0">Nenhum aviso.</div>'}</div>
        <div class="acts" style="justify-content:flex-start;flex-wrap:wrap"><button type="button" class="btn sec" data-add="antes">+ Avisar antes</button><button type="button" class="btn sec" data-add="diario">+ Avisar todo dia</button></div>
        <p class="hint" style="margin-top:8px">0 = na hora (ou no próprio dia, se for em dias). Avisos em dias saem no horário padrão.${comHora ? '' : ' Sem horário definido, só valem avisos em dias.'}</p>`;
      $$('.av', host).forEach(row => {
        $$('input,select', row).forEach(e => e.onchange = () => { ler(); avisar(); });
        $('.rm', row).onclick = () => { ler(); lista.splice(+row.dataset.i, 1); desenhar(); avisar(); };
      });
      $$('[data-add]', host).forEach(b => b.onclick = () => {
        ler(); lista.push(b.dataset.add === 'diario' ? { k: 'diario', dias: 3, vezes: 2 } : { k: 'antes', n: 1, u: comHora ? 'h' : 'd' });
        desenhar(); avisar();
      });
    };
    desenhar();
    return {
      get() { ler(); return lista.map(r => ({ ...r })); },
      setComHora(b) { b = !!b; if (b !== comHora) { ler(); comHora = b; desenhar(); } }
    };
  }

  // campo "Avisos" (Padrão / Personalizado / Sem avisos) para formulários de itens com horário
  function campoAvisos(ini, o) {
    const modo0 = ini == null ? 'padrao' : (ini.length ? 'custom' : 'nenhum');
    const html = `${F('Avisos', sel('avmodo', [['padrao', 'Padrão do app'], ['custom', 'Personalizado'], ['nenhum', 'Sem avisos']], modo0))}<p class="hint" id="avdef"></p><div id="avs"></div>`;
    let ed = null, s = null;
    const mostrar = () => {
      const m = s.$('[name=avmodo]').value, d = s.$('#avdef');
      s.$('#avs').hidden = m !== 'custom'; d.hidden = m !== 'padrao';
      if (m === 'padrao') d.textContent = 'Padrão: ' + resumo(padraoPara(o.comHora(), o.rep())) + '.';
    };
    return {
      html,
      ligar(sh) {
        s = sh;
        ed = editor(s.$('#avs'), Array.isArray(ini) && ini.length ? ini : padraoPara(o.comHora(), o.rep()), { comHora: o.comHora() });
        s.$('[name=avmodo]').onchange = mostrar; mostrar();
      },
      atualizar() { ed.setComHora(o.comHora()); mostrar(); },
      get() { const m = s.$('[name=avmodo]').value; return m === 'padrao' ? null : m === 'nenhum' ? [] : ed.get(); }
    };
  }

  const REP_AV = { nao: 'Uma vez', diario: 'Todo dia', uteis: 'Dias úteis', semanal: 'Toda semana', mensal: 'Todo mês' };
  function descAviso(a) {
    const cada = Math.max(1, +a.cada || 1);
    let r = a.repete === 'nao' ? 'Em ' + fmtData(a.data) : (REP_AV[a.repete] || 'Todo dia');
    if (cada > 1 && ['diario', 'semanal', 'mensal'].includes(a.repete)) r = `A cada ${cada} ${{ diario: 'dias', semanal: 'semanas', mensal: 'meses' }[a.repete]}`;
    if (a.repete === 'semanal' && a.dias && a.dias.length) r += ' · ' + [1, 2, 3, 4, 5, 6, 0].filter(d => a.dias.includes(d)).map(d => DIAS[d]).join(', ');
    r += ' às ' + (a.hora || '08:00');
    if (a.intervalo > 0) r += `, a cada ${a.intervalo} h até ${a.horaFim || '20:00'}`;
    return r;
  }

  function avisosTela() {
    const s = sheet('Meus avisos', `<p class="mu sm" style="margin:0 0 10px">Lembretes que se repetem todo dia, toda semana ou todo mês. Eles só enviam notificação e não aparecem na agenda.</p>
      <div id="avl"></div><div class="acts"><button class="btn" id="avNovo">+ Novo aviso</button></div>`);
    const desenhar = () => {
      const L = avisosL(), c = cfg();
      s.$('#avl').innerHTML = (!c.ativo || !c.tipos.aviso ? '<p class="hint neg" style="margin:0 0 8px">As notificações de avisos estão desligadas em “Configurar notificações”.</p>' : '') +
        (L.length ? `<div class="card" style="padding:2px 14px">${L.map(a => `<div class="row" data-a="${a.id}"><div class="t"><b>${esc(a.titulo)}</b><small>${esc(descAviso(a))}</small></div><input type="checkbox" class="swi" data-on="${a.id}" ${a.ativo ? 'checked' : ''} aria-label="Ativo"></div>`).join('')}</div>` : '<div class="empty">Nenhum aviso ainda.<br>Toque em “Novo aviso”.</div>');
      s.$$('[data-a]').forEach(r => r.onclick = e => {
        const a = L.find(x => x.id === r.dataset.a); if (!a) return;
        if (e.target.closest('[data-on]')) { a.ativo = e.target.checked; Store.salvar(); } else formAviso(a, desenhar);
      });
    };
    s.$('#avNovo').onclick = () => formAviso(null, desenhar);
    desenhar();
  }

  function formAviso(av, depois) {
    const novo = !av, ini = av || { titulo: '', texto: '', data: hoje(), hora: '08:00', intervalo: 0, horaFim: '20:00', repete: 'diario', cada: 1, dias: [], ate: '', ativo: true };
    const s = sheet(novo ? 'Novo aviso' : 'Editar aviso', `
      ${F('Aviso', inp('titulo', ini.titulo, 'placeholder="Ex.: Beber água, tomar remédio"'))}
      ${F('Mensagem (opcional)', inp('texto', ini.texto || ''))}
      <div class="g2">${F('Repetir', sel('repete', [['nao', 'Uma vez'], ['diario', 'Todo dia'], ['uteis', 'Dias úteis (seg a sex)'], ['semanal', 'Toda semana'], ['mensal', 'Todo mês']], ini.repete))}<div id="cadaw">${F('A cada (dias)', inp('cada', ini.cada || 1, 'type="number" inputmode="numeric" min="1" max="99"'))}</div></div>
      <div class="f" id="semw"><span>Dias da semana</span><div class="dias">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label><input type="checkbox" data-d="${d}" ${(ini.dias || []).includes(d) ? 'checked' : ''}><span>${DIAS[d]}</span></label>`).join('')}</div></div>
      <div class="g2">${F('Data (ou início)', inp('data', ini.data, 'type="date"'))}${F('Horário', inp('hora', ini.hora, 'type="time"'))}</div>
      <div class="g2">${F('Repetir no dia', sel('intervalo', [[0, 'Não'], [1, 'A cada 1 hora'], [2, 'A cada 2 horas'], [3, 'A cada 3 horas'], [4, 'A cada 4 horas'], [6, 'A cada 6 horas']], ini.intervalo || 0))}<div id="hfw">${F('Até às', inp('horaFim', ini.horaFim || '20:00', 'type="time"'))}</div></div>
      <div id="ate">${F('Terminar em (opcional)', inp('ate', ini.ate || '', 'type="date"'))}</div>
      <label class="sw"><span>Ativo</span><input type="checkbox" name="ativo" ${ini.ativo ? 'checked' : ''}></label>
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    const rep = s.$('[name=repete]'), dt = s.$('[name=data]'), it = s.$('[name=intervalo]');
    const mostra = () => {
      const r = rep.value;
      s.$('#ate').hidden = r === 'nao';
      s.$('#cadaw').hidden = !['diario', 'semanal', 'mensal'].includes(r);
      s.$('#semw').hidden = r !== 'semanal';
      s.$('#hfw').hidden = !(+it.value > 0);
      s.$('#cadaw>.f>span').textContent = 'A cada (' + ({ diario: 'dias', semanal: 'semanas', mensal: 'meses' }[r] || 'dias') + ')';
      if (r === 'semanal' && !s.$$('[data-d]').some(c => c.checked) && dataOk(dt.value)) { const c = s.$(`[data-d="${pd(dt.value).getDay()}"]`); if (c) c.checked = true; }
    };
    rep.onchange = mostra; it.onchange = mostra; mostra();
    if (!novo) s.$('[data-del]').onclick = async () => {
      if (!(await confirmar('Excluir este aviso?'))) return;
      const idx = avisosL().indexOf(av); avisosL().splice(idx, 1); s.fechar(); Store.salvar(); depois && depois();
      toast('Aviso excluído', () => { avisosL().splice(idx, 0, av); Store.salvar(); depois && depois(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), rp = v.repete, inter = parseInt(v.intervalo, 10) || 0;
      if (!v.titulo.trim()) return toast('Informe o aviso.');
      if (!dataOk(v.data)) return toast('Informe uma data válida.');
      if (!/^\d{2}:\d{2}$/.test(v.hora)) return toast('Informe o horário.');
      if (inter > 0 && (!/^\d{2}:\d{2}$/.test(v.horaFim) || v.horaFim < v.hora)) return toast('O horário final precisa ser depois do inicial.');
      if (v.ate && (!dataOk(v.ate) || v.ate < v.data)) return toast('Data final inválida.');
      const dias = rp === 'semanal' ? s.$$('[data-d]').filter(c => c.checked).map(c => +c.dataset.d) : [];
      if (rp === 'semanal' && !dias.length) dias.push(pd(v.data).getDay());
      const d = { titulo: v.titulo.trim(), texto: v.texto.trim(), data: v.data, hora: v.hora, intervalo: inter, horaFim: v.horaFim || '20:00', repete: rp,
        cada: ['diario', 'semanal', 'mensal'].includes(rp) ? Math.max(1, Math.min(99, parseInt(v.cada, 10) || 1)) : 1, dias, ate: rp === 'nao' ? '' : v.ate, ativo: !!v.ativo };
      if (novo) avisosL().push({ id: uid('av'), ...d }); else Object.assign(av, d);
      s.fechar(); Store.salvar(); depois && depois();
      if (!cfg().ativo) toast('Atenção: as notificações estão desligadas em Configurar notificações.');
    };
  }

  /* ---------- tela de ajustes ---------- */
  function tela() {
    const c = cfg();
    const sw = (n, l, on) => `<label class="sw"><span>${l}</span><input type="checkbox" name="${n}"${on ? ' checked' : ''}></label>`;
    const s = sheet('Notificações', `
      ${sw('ativo', 'Receber notificações', c.ativo)}
      <div class="dia">Avisar sobre</div>
      ${TIPOS.map(([k, l]) => sw('t_' + k, l, c.tipos[k])).join('')}
      <div class="acts" style="justify-content:flex-start;margin-top:10px"><button class="btn sec" id="nAvisos">Meus avisos (lembretes avulsos)</button></div>
      <div class="dia">Avisos padrão: itens com horário</div>
      <p class="hint" style="margin-top:0">Compromissos e treinos que têm hora marcada.</p>
      <div id="edH"></div>
      <div class="dia">Avisos padrão: itens sem horário</div>
      <p class="hint" style="margin-top:0">Contas, provas, entregas, prazos e compromissos sem hora.</p>
      <div id="edD"></div>
      <div class="dia">Horários dos avisos</div>
      <div class="g2">${F('Avisos em dias saem às', inp('hora', c.hora, 'type="time"'))}${F('Avisos diários até', inp('horaFim', c.horaFim, 'type="time"'))}</div>
      <p class="hint">“Todo dia, X vezes” espalha os avisos entre esses dois horários. Itens que se repetem (hábitos, aulas, treinos) só avisam no próprio dia. Cada compromisso também pode ter avisos próprios ao ser editado. Os avisos são agendados para os próximos ${c.dias} dias e atualizados sempre que você muda algo ou abre o app.</p>
      <div class="acts" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn sec" id="nTeste">Enviar teste</button><button class="btn sec" id="nDiag">Diagnóstico</button><button class="btn sec" id="nExato">Alarmes exatos</button></div>
      <p class="hint" style="margin-top:10px">Se os avisos atrasarem, toque em “Alarmes exatos” e permita “Alarmes e lembretes” para o app. Em alguns aparelhos também é preciso tirar o app da economia de bateria.</p>`);
    const grava = () => {
      const v = vals(s.el), antes = c.ativo;
      c.ativo = !!v.ativo; TIPOS.forEach(([k]) => { c.tipos[k] = !!v['t_' + k]; });
      if (/^\d{2}:\d{2}$/.test(v.hora)) c.hora = v.hora;
      if (/^\d{2}:\d{2}$/.test(v.horaFim)) c.horaFim = v.horaFim;
      Store.salvar();                                   // também reagenda
      if (c.ativo && !antes) pedir();
    };
    s.$$('input[name],select[name]').forEach(e => e.onchange = grava);
    editor(s.$('#edH'), c.avHora, { comHora: true, onChange: l => { c.avHora = l; Store.salvar(); } });
    editor(s.$('#edD'), c.avDia, { comHora: false, onChange: l => { c.avDia = l; Store.salvar(); } });
    s.$('#nAvisos').onclick = () => { s.fechar(); avisosTela(); };
    s.$('#nTeste').onclick = () => {
      const l = L(); if (!l) return toast('Só funciona no app instalado no celular.');
      l.requestPermission(ok => {
        if (!ok) return toast('Permissão negada. Ative as notificações do app nas configurações do Android.');
        l.schedule({ id: 99999, title: 'NORTRIUM', text: 'Notificações funcionando ✓', trigger: { in: 3, unit: 'second' }, foreground: true, data: { mod: 'hoje' } });
        toast('Teste em 3 segundos.');
      });
    };
    s.$('#nDiag').onclick = () => { s.fechar(); diagnostico(); };
    s.$('#nExato').onclick = () => { const l = L(); if (l && l.openAlarmSettings) l.openAlarmSettings(); else toast('Disponível só no Android 12 ou mais novo.'); };
  }


  /* ---------- diagnóstico: por que as notificações não aparecem? ---------- */
  const W = () => (window.cordova && cordova.plugins && cordova.plugins.MeuWidget) || null;
  const chamar = (fn, ...a) => new Promise(ok => { try { fn(...a, ok, () => ok(null)); } catch (e) { ok(null); } });

  async function diagnostico() {
    const l = L(), w = W();
    const s = sheet('Diagnóstico das notificações', '<div id="dg"><p class="mu sm">Verificando…</p></div>');
    async function desenhar() {
      const st = w && w.status ? await chamar(w.status.bind(w)) : null;
      let sv = null; try { sv = st ? JSON.parse(st) : null; } catch (e) { sv = null; }
      const perm = l && l.hasPermission ? await new Promise(ok => { const t = setTimeout(() => ok(null), 3000); try { l.hasPermission(x => { clearTimeout(t); ok(x); }); } catch (e) { clearTimeout(t); ok(null); } }) : null;
      const ids = l && l.getScheduledIds ? await new Promise(ok => { const t = setTimeout(() => ok(null), 3000); try { l.getScheduledIds(x => { clearTimeout(t); ok(x); }); } catch (e) { clearTimeout(t); ok(null); } }) : null;
      const plan = DB.cfg.notif.ativo ? montar() : [], prox = plan.find(n => n.id !== 90001);
      const OK = '✓', X = '✕', Q = '?';
      const linha = (ok, titulo, detalhe, acao) => `<div class="row"><div class="t"><b style="white-space:normal">${ok === true ? OK : ok === false ? X : Q} ${titulo}</b><small style="white-space:normal">${detalhe}</small></div>${acao ? `<button class="btn sec" data-a="${acao[0]}" style="padding:6px 12px">${acao[1]}</button>` : ''}</div>`;
      const notifOk = sv ? sv.notif && perm !== false : perm;
      const html = [
        linha(!!l, 'Plugin de notificações', l ? 'Carregado.' : 'Não encontrado. As notificações só funcionam no app instalado no celular.'),
        linha(DB.cfg.notif.ativo, 'Notificações ligadas no app', DB.cfg.notif.ativo ? 'Ligadas em Configurar notificações.' : 'Estão desligadas em Configurar notificações.'),
        linha(notifOk, 'Permissão do Android para notificar', notifOk === true ? 'Permitido.' : notifOk === false ? 'Bloqueado. Ative as notificações do app nas configurações do Android.' : 'Não foi possível verificar.', notifOk === false ? ['notif', 'Abrir ajustes'] : null),
        linha(sv ? sv.exatos : null, 'Alarmes exatos', sv ? (sv.exatos ? 'Permitido.' : 'Bloqueado: os avisos podem atrasar muito ou nem disparar. Toque em Abrir e permita “Alarmes e lembretes”.') : 'Não foi possível verificar (reinstale o app com a versão nova).', sv && !sv.exatos ? ['exatos', 'Abrir ajustes'] : null),
        linha(sv ? sv.bateria : null, 'Sem restrição de bateria', sv ? (sv.bateria ? 'O app está livre da economia de bateria.' : 'O sistema pode adiar ou matar os alarmes para economizar bateria. Escolha o app e marque “Sem restrições”.') + (/xiaomi|redmi|poco|huawei|honor|oppo|realme|vivo|oneplus|samsung|motorola/i.test(sv.fabricante || '') ? ` No seu ${esc(sv.fabricante)}, também libere “Inicialização automática” ou “Executar em segundo plano” nas configurações do app.` : '') : 'Não foi possível verificar.', sv && !sv.bateria ? ['bateria', 'Abrir ajustes'] : null),
        linha(ids ? ids.length >= plan.length : null, 'Alarmes agendados', ids ? `${ids.length} no Android · ${plan.length} planejados pelo app.${plan.length && ids.length < plan.length ? ' Faltam alarmes: toque em “Reagendar agora”.' : ''}` : 'O plugin não informou a lista.'),
        linha(prox ? true : null, 'Próxima notificação', prox ? `${esc(prox.title)} — ${prox.trigger.at.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'Nenhuma planejada. Crie um aviso em Meus avisos ou um compromisso com horário.')
      ].join('');
      s.$('#dg').innerHTML = `<div class="card" style="padding:2px 14px">${html}</div>
        <div class="acts" style="justify-content:flex-start;flex-wrap:wrap;margin-top:12px"><button class="btn" id="dg-t1">Teste em 3 s</button><button class="btn sec" id="dg-t2">Teste em 1 min</button><button class="btn sec" id="dg-r">Reagendar agora</button></div>
        <p class="hint">“Teste em 1 min”: depois de tocar, bloqueie a tela e espere. Se chegar, os alarmes estão funcionando. Se o teste de 3 s chegar e o de 1 min não, o problema é alarme exato ou bateria.</p>`;
      $$('[data-a]', s.el).forEach(b => b.onclick = () => { if (w && w.abrirConfig) w.abrirConfig(b.dataset.a, null, () => toast('Não foi possível abrir as configurações.')); else toast('Abra as configurações do Android > Apps > NORTRIUM.'); });
      const teste = (seg, msg) => l.requestPermission(ok => {
        if (!ok) return toast('Permissão negada. Ative as notificações do app nas configurações do Android.');
        l.schedule({ id: seg > 5 ? 99998 : 99999, title: 'NORTRIUM', text: msg, trigger: seg > 5 ? { at: new Date(Date.now() + seg * 1000) } : { in: seg, unit: 'second' }, foreground: true, data: { mod: 'hoje' } });
        toast(seg > 5 ? 'Teste agendado para daqui a 1 minuto. Bloqueie a tela.' : 'Teste em 3 segundos.');
      });
      s.$('#dg-t1').onclick = () => l ? teste(3, 'Notificações funcionando ✓') : toast('Só funciona no app instalado no celular.');
      s.$('#dg-t2').onclick = () => l ? teste(60, 'Alarme agendado funcionando ✓') : toast('Só funciona no app instalado no celular.');
      s.$('#dg-r').onclick = async () => { if (!l) return toast('Só funciona no app instalado no celular.'); toast('Reagendando…'); ultimoHash = ''; await (fila = fila.then(() => rodar(true)).catch(e => console.error(e))); desenhar(); };
    }
    desenhar().catch(e => { console.error('Diagnóstico', e); s.$('#dg').innerHTML = '<p class="neg">Não foi possível montar o diagnóstico: ' + esc(String(e && e.message || e)) + '</p>'; });
  }

  function init() {
    const salvarOrig = Store.salvar;
    Store.salvar = function () { salvarOrig.apply(Store, arguments); agendar(); };
    const l = L(); if (!l) return;                      // no navegador não há notificações locais
    l.on('click', n => {
      let d = n && n.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
      if (d && d.mod && MODS[d.mod]) { if (d.mod === 'treino') Treinos.S.area = 'treino'; go(d.mod); }
    });
    document.addEventListener('resume', () => agendar(false, true));
    agendar(true, true);
    // primeira abertura: pede a permissão (Android 13+ exige) uma única vez
    const c = DB.cfg.notif;
    if (c.ativo && !c.pediu && l.hasPermission) l.hasPermission(ok => {
      if (ok) return;
      c.pediu = true; Store.salvar(); pedir();
    });
  }
  return { init, tela, diagnostico, agendar, montar, editor, resumo, padraoPara, campoAvisos, avisosTela, avisosDeHoje, horasDoAviso };
})();
