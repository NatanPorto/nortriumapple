'use strict';
/* =========================================================
   SAÚDE — Água e Dieta (vivem dentro da aba "Saúde", ao lado de Treino)
   Dados em DB.agua e DB.dieta. Os itens das refeições guardam uma cópia
   dos valores no momento do registro: editar um alimento depois não
   altera o histórico.
   ========================================================= */
const Saude = (() => {
  const S = { dia: hoje(), dsub: 'diario', per: 7 };
  const nk = n => String(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const r1 = v => Math.round((Number(v) || 0) * 10) / 10;
  const n1 = v => numStr(r1(v));
  const ag = () => DB.agua, dt = () => DB.dieta;

  /* =============================== ÁGUA =============================== */
  const mlDia = d => ag().reg.filter(r => r.data === d).reduce((t, r) => t + r.ml, 0);
  const fmtMl = ml => ml >= 1000 ? (ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' L' : Math.round(ml) + ' ml';

  function addAgua(ml, data) {
    const r = { id: uid('ag'), data: data || hoje(), hora: new Date().toTimeString().slice(0, 5), ml: Math.round(ml) };
    ag().reg.push(r); commit();
    toast('+' + fmtMl(ml) + ' de água', () => { ag().reg = ag().reg.filter(x => x !== r); commit(); });
  }

  function formAguaValor() {
    const s = sheet('Registrar água', `${F('Quantidade (ml)', inp('ml', '', 'inputmode="numeric" placeholder="Ex.: 350"'))}<div class="acts"><button class="btn" data-ok>Registrar</button></div>`);
    const ok = () => { const v = num(vals(s.el).ml); if (!(v > 0 && v <= 5000)) return toast('Informe um volume entre 1 e 5000 ml.'); s.fechar(); addAgua(v); };
    s.$('[data-ok]').onclick = ok; s.$('input').onkeydown = e => { if (e.key === 'Enter') ok(); };
    setTimeout(() => s.$('input').focus(), 80);
  }

  function formAguaReg(r) {
    const s = sheet('Editar registro de água', `${F('Quantidade (ml)', inp('ml', r.ml, 'inputmode="numeric"'))}
      <div class="acts"><button class="btn bad" data-del>Excluir</button><button class="btn" data-ok>Salvar</button></div>`);
    s.$('[data-del]').onclick = () => { ag().reg = ag().reg.filter(x => x !== r); s.fechar(); commit(); toast('Registro excluído', () => { ag().reg.push(r); commit(); }); };
    s.$('[data-ok]').onclick = () => { const v = num(vals(s.el).ml); if (!(v > 0 && v <= 5000)) return toast('Volume inválido.'); r.ml = Math.round(v); s.fechar(); commit(); };
  }

  function formAguaMeta() {
    const s = sheet('Meta de água', `${F('Meta diária (ml)', inp('meta', ag().meta || '', 'inputmode="numeric" placeholder="Ex.: 2000"'))}
      ${F('Botões rápidos (ml, separados por vírgula)', inp('rap', ag().rapidos.join(', ')))}
      <p class="hint">Cada pessoa tem uma necessidade diferente de água, que varia com clima, atividade e saúde. Defina uma meta que faça sentido para você e, se tiver dúvida, converse com um profissional de saúde. Deixe a meta em branco para só registrar o consumo.</p>
      <div class="acts"><button class="btn" data-ok>Salvar</button></div>`);
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), meta = v.meta.trim() ? num(v.meta) : 0;
      if (isNaN(meta) || meta < 0 || meta > 10000) return toast('Meta inválida.');
      const rap = v.rap.split(/[,;\s]+/).map(num).filter(x => x > 0 && x <= 5000).slice(0, 5);
      if (!rap.length) return toast('Informe ao menos um volume rápido.');
      ag().meta = Math.round(meta); ag().rapidos = rap.map(Math.round); s.fechar(); commit();
    };
  }

  function rAgua(el) {
    const hj = hoje(), a = ag(), tot = mlDia(hj), meta = a.meta || 0, per = S.per;
    const regs = a.reg.filter(r => r.data === hj).sort((x, y) => y.hora.localeCompare(x.hora));
    const dias = Array.from({ length: per }, (_, k) => addDias(hj, -(per - 1 - k))), vals_ = dias.map(mlDia), pico = Math.max(1, meta, ...vals_);
    const comReg = vals_.filter(v => v > 0), media = comReg.length ? comReg.reduce((x, y) => x + y, 0) / comReg.length : 0, naMeta = meta ? vals_.filter(v => v >= meta).length : 0;
    el.innerHTML = `<div class="card" style="--cor:var(--c-agua)"><div class="rcard">${meta ? Graf.anel(Math.min(100, Math.round(tot / meta * 100))) : ''}<div class="rtx"><small class="mu">Hoje</small><div class="big">${fmtMl(tot)}${meta ? `<span class="mu" style="font-size:16px;font-weight:400"> de ${fmtMl(meta)}</span>` : ''}</div>
        ${meta ? `<small class="mu">${tot >= meta ? 'Meta atingida 🎉' : 'faltam ' + fmtMl(meta - tot)}</small>` : '<small class="mu">Defina uma meta se quiser acompanhar o progresso.</small>'}</div></div>
        <div class="exb" style="margin-top:12px">${a.rapidos.map(v => `<button class="btn" data-ag="${v}">+ ${fmtMl(v)}</button>`).join('')}<button class="btn sec" id="ag-o">Outro valor</button></div></div>
      ${regs.length ? `<div class="dia">Registros de hoje</div><div class="card" style="padding:2px 14px">${regs.map(r => `<div class="row" data-r="${r.id}"><div class="t"><b>${fmtMl(r.ml)}</b><small>${esc(r.hora)}</small></div></div>`).join('')}</div>` : ''}
      <div class="dia">Histórico</div>
      <div class="seg sm">${[[7, '7 dias'], [30, '30 dias']].map(([v, l]) => `<button data-p="${v}" class="${per === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="card">${Graf.barras(vals_, dias.map((d, k) => per === 7 ? DIAS[pd(d).getDay()] : (k % 5 === 0 ? String(+d.slice(8)) : '')), { meta, tips: dias.map((d, k) => fmtDiaCurto(d) + ': ' + fmtMl(vals_[k])) })}
        <small class="mu" style="display:block;margin-top:8px">${comReg.length ? `Média nos dias com registro: ${fmtMl(media)}` : 'Nenhum registro neste período.'}${meta && comReg.length ? ` · meta atingida em ${naMeta} de ${per} dias` : ''}</small></div>
      <div class="acts" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn sec" id="ag-m">Meta e botões</button></div>`;
    Graf.ligar(el);
    $$('[data-ag]', el).forEach(b => b.onclick = () => addAgua(+b.dataset.ag));
    $$('[data-r]', el).forEach(r => r.onclick = () => formAguaReg(ag().reg.find(x => x.id === r.dataset.r)));
    $$('[data-p]', el).forEach(b => b.onclick = () => { S.per = +b.dataset.p; refresh(); });
    $('#ag-o', el).onclick = formAguaValor; $('#ag-m', el).onclick = formAguaMeta;
  }

  /* =============================== DIETA =============================== */
  const Z = () => ({ kcal: 0, prot: 0, carb: 0, gord: 0, fib: 0 });
  const somaItens = l => l.reduce((t, i) => { t.kcal += i.kcal || 0; t.prot += i.prot || 0; t.carb += i.carb || 0; t.gord += i.gord || 0; t.fib += i.fib || 0; return t; }, Z());
  const itemDe = (f, qtd) => {
    const k = qtd / 100;
    return { id: uid('it'), aid: f.id, nome: f.nome + (f.marca ? ' — ' + f.marca : ''), qtd: r1(qtd), un: f.base, kcal: r1(f.kcal * k), prot: r1(f.prot * k), carb: r1(f.carb * k), gord: r1(f.gord * k), fib: r1(f.fib * k) };
  };
  const escala = (it, k) => ({ ...it, id: uid('it'), qtd: r1(it.qtd * k), kcal: r1(it.kcal * k), prot: r1(it.prot * k), carb: r1(it.carb * k), gord: r1(it.gord * k), fib: r1(it.fib * k) });
  const unTxt = it => it.un === 'porção' ? (it.qtd === 1 ? '1 porção' : n1(it.qtd) + ' porções') : it.un === 'reg' ? 'registro rápido' : n1(it.qtd) + ' ' + it.un;
  const refDia = d => dt().refeicoes.filter(r => r.data === d);
  function refeicao(d, tipo, criar) {
    let r = dt().refeicoes.find(x => x.data === d && x.tipo === tipo);
    if (!r && criar) { r = { id: uid('rf'), data: d, tipo, itens: [] }; dt().refeicoes.push(r); }
    return r;
  }
  const limparVazias = () => { dt().refeicoes = dt().refeicoes.filter(r => r.itens.length); };
  const porPorcao = rc => { const t = somaItens(rc.itens), p = rc.porcoes || 1; return { kcal: t.kcal / p, prot: t.prot / p, carb: t.carb / p, gord: t.gord / p, fib: t.fib / p }; };

  /* ---------- sugestões e importação de alimentos ---------- */
  const COMUNS = [   // por 100 g (ou ml): kcal, prot, carb, gord, fibra — valores aproximados, conferir rótulo/TACO
    ['Arroz branco cozido', 'g', 128, 2.5, 28.1, 0.2, 1.6, 'colher de servir = 45'], ['Feijão carioca cozido', 'g', 76, 4.8, 13.6, 0.5, 8.5, 'concha = 100'],
    ['Peito de frango grelhado', 'g', 159, 32, 0, 2.5, 0, 'filé = 100'], ['Patinho bovino grelhado', 'g', 219, 35.9, 0, 7.3, 0, 'bife = 100'],
    ['Ovo de galinha cozido', 'g', 146, 13.3, 0.6, 9.5, 0, 'unidade = 50'], ['Pão francês', 'g', 300, 8, 58.6, 3.1, 2.3, 'unidade = 50'],
    ['Pão de forma integral', 'g', 253, 9.4, 49.9, 3.7, 6.9, 'fatia = 25'], ['Leite integral', 'ml', 61, 3.2, 4.7, 3.3, 0, 'copo = 200'],
    ['Iogurte natural', 'g', 51, 4.1, 1.9, 3, 0, 'pote = 170'], ['Queijo mussarela', 'g', 330, 22.6, 3, 25.2, 0, 'fatia = 15'],
    ['Banana prata', 'g', 98, 1.3, 26, 0.1, 2, 'unidade = 70'], ['Maçã', 'g', 56, 0.3, 15.2, 0, 1.3, 'unidade = 130'],
    ['Laranja', 'g', 37, 1, 8.9, 0.1, 0.8, 'unidade = 150'], ['Batata-doce cozida', 'g', 77, 0.6, 18.4, 0.1, 2.2, ''],
    ['Batata inglesa cozida', 'g', 52, 1.2, 11.9, 0, 1.3, ''], ['Macarrão cozido', 'g', 102, 3.4, 19.9, 0.5, 1.1, ''],
    ['Aveia em flocos', 'g', 394, 13.9, 66.6, 8.5, 9.1, 'colher de sopa = 15'], ['Azeite de oliva', 'g', 884, 0, 0, 100, 0, 'colher de sopa = 13'],
    ['Tomate', 'g', 15, 1.1, 3.1, 0.2, 1.2, 'unidade = 100'], ['Alface', 'g', 11, 1.3, 1.7, 0.2, 1.8, ''], ['Cenoura crua', 'g', 34, 1.3, 7.7, 0.2, 3.2, 'unidade = 80'],
    ['Brócolis cozido', 'g', 25, 2.1, 4.4, 0.5, 3.4, ''], ['Pasta de amendoim', 'g', 588, 25, 20, 50, 6, 'colher de sopa = 15'], ['Açúcar refinado', 'g', 387, 0.3, 99.5, 0, 0, 'colher de chá = 5']
  ];
  const medidasDe = txt => String(txt || '').split(/\n|;/).map(l => l.trim()).filter(Boolean).map(l => { const m = l.match(/^(.+?)\s*=\s*(\d+(?:[.,]\d+)?)\s*(?:g|ml)?$/i); return m ? { n: m[1].trim(), q: num(m[2]) } : null; }).filter(Boolean);
  const medidasTxt = ms => (ms || []).map(m => `${m.n} = ${numStr(m.q)}`).join('\n');
  function addComuns() {
    let n = 0;
    COMUNS.forEach(([nome, base, kcal, prot, carb, gord, fib, med]) => {
      if (dt().alimentos.some(f => nk(f.nome) === nk(nome) || (f.kcal === kcal && f.prot === prot && f.carb === carb && f.gord === gord))) return;   // já existe (inclusive vindo da TACO)
      dt().alimentos.push({ id: uid('al'), nome, marca: '', base, kcal, prot, carb, gord, fib, sod: 0, medidas: medidasDe(med), fav: false, fonte: 'Aproximado', usado: 0 }); n++;
    });
    return n;
  }
  /* TACO 2ª edição (js/taco.js): cadastra os alimentos que ainda não existem; os "Aproximados" com os mesmos valores são só marcados como TACO */
  function importarTaco() {
    if (typeof TACO === 'undefined') return { n: 0, at: 0, ign: 0 };
    const al = dt().alimentos, igual = (a, b) => Math.abs((Number(a) || 0) - b) < 0.06;
    let n = 0, at = 0, ign = 0;
    TACO.forEach(([id, nome, base, kcal, prot, carb, gord, fib, sod]) => {
      if (al.some(f => f.taco === id || nk(f.nome) === nk(nome))) { ign++; return; }
      const ap = al.find(f => f.fonte === 'Aproximado' && !f.taco && f.base === base && igual(f.kcal, kcal) && igual(f.prot, prot) && igual(f.carb, carb) && igual(f.gord, gord));
      if (ap) { ap.fonte = 'TACO'; ap.taco = id; if (!ap.sod) ap.sod = sod; at++; return; }
      al.push({ id: uid('al'), taco: id, nome, marca: '', base, kcal, prot, carb, gord, fib, sod, medidas: medidasDe(TACO_MEDIDAS[id]), fav: false, fonte: 'TACO', usado: 0 }); n++;
    });
    return { n, at, ign };
  }
  const msgTaco = x => x.n || x.at ? `TACO: ${x.n} alimento(s) cadastrado(s)${x.at ? ` · ${x.at} atualizado(s)` : ''}${x.ign ? ` · ${x.ign} já existia(m)` : ''}.` : 'Todos os alimentos da TACO já estão cadastrados.';
  function importarCsv(texto) {                       // nome;kcal;prot;carb;gord;fibra[;ml]  (valores por 100 g ou 100 ml)
    let n = 0, ign = 0;
    String(texto).replace(/^\ufeff/, '').split(/\r?\n/).forEach(l => {
      if (!l.trim()) return;
      const c = l.split(l.includes(';') ? ';' : '\t').map(x => x.trim());
      if (c.length < 6) { ign++; return; }
      const v = c.slice(1, 6).map(num);
      if (v.some(x => isNaN(x) || x < 0) || !c[0]) { ign++; return; }   // cabeçalho ou linha inválida
      if (dt().alimentos.some(f => nk(f.nome) === nk(c[0]))) { ign++; return; }
      dt().alimentos.push({ id: uid('al'), nome: c[0], marca: '', base: /^ml$/i.test(c[6] || '') ? 'ml' : 'g', kcal: v[0], prot: v[1], carb: v[2], gord: v[3], fib: v[4], sod: 0, medidas: [], fav: false, fonte: 'Importado', usado: 0 }); n++;
    });
    return { n, ign };
  }
  function escolherCsv() {
    const f = document.createElement('input'); f.type = 'file'; f.accept = '.csv,.txt,text/csv,text/plain';
    f.onchange = () => {
      const a = f.files[0]; if (!a) return;
      const r = new FileReader();
      r.onload = () => { const x = importarCsv(r.result); commit(); toast(`${x.n} alimento(s) importado(s)${x.ign ? ` · ${x.ign} linha(s) ignorada(s)` : ''}.`); };
      r.onerror = () => toast('Não foi possível ler o arquivo.');
      r.readAsText(a);
    };
    f.click();
  }

  /* ---------- formulário de alimento ---------- */
  function formAlimento(f, depois) {
    const novo = !f, ini = f || { nome: '', marca: '', base: 'g', kcal: '', prot: '', carb: '', gord: '', fib: '', sod: '', medidas: [], fonte: 'Manual' };
    const s = sheet(novo ? 'Novo alimento' : 'Editar alimento', `${F('Nome', inp('nome', ini.nome, 'placeholder="Ex.: Iogurte grego"'))}
      <div class="g2">${F('Marca (opcional)', inp('marca', ini.marca || ''))}${F('Valores por', sel('base', [['g', '100 g'], ['ml', '100 ml']], ini.base))}</div>
      <div class="g2">${F('Energia (kcal)', inp('kcal', numStr(ini.kcal), 'inputmode="decimal"'))}${F('Proteínas (g)', inp('prot', numStr(ini.prot), 'inputmode="decimal"'))}</div>
      <div class="g2">${F('Carboidratos (g)', inp('carb', numStr(ini.carb), 'inputmode="decimal"'))}${F('Gorduras (g)', inp('gord', numStr(ini.gord), 'inputmode="decimal"'))}</div>
      <div class="g2">${F('Fibras (g)', inp('fib', numStr(ini.fib), 'inputmode="decimal"'))}${F('Sódio (mg)', inp('sod', numStr(ini.sod), 'inputmode="decimal"'))}</div>
      ${F('Medidas caseiras (opcional)', `<textarea name="med" style="min-height:70px" placeholder="fatia = 30&#10;colher de sopa = 15">${esc(medidasTxt(ini.medidas))}</textarea>`)}
      <p class="hint">Uma por linha, com o peso (g) ou volume (ml) de cada medida. Deixe em branco o que não souber.</p>
      ${F('Fonte dos dados', inp('fonte', ini.fonte || 'Manual', 'placeholder="Rótulo, TACO, TBCA…"'))}
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    if (!novo) s.$('[data-del]').onclick = async () => {
      if (!(await confirmar('Excluir este alimento? As refeições já registradas não mudam.'))) return;
      const i = dt().alimentos.indexOf(f); dt().alimentos.splice(i, 1); s.fechar(); commit();
      toast('Alimento excluído', () => { dt().alimentos.splice(i, 0, f); commit(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), d = { nome: v.nome.trim(), marca: v.marca.trim(), base: v.base, medidas: medidasDe(v.med), fonte: v.fonte.trim() || 'Manual' };
      if (!d.nome) return toast('Informe o nome.');
      for (const [k, rot] of [['kcal', 'Energia'], ['prot', 'Proteínas'], ['carb', 'Carboidratos'], ['gord', 'Gorduras'], ['fib', 'Fibras'], ['sod', 'Sódio']]) {
        const x = v[k].trim() ? num(v[k]) : 0; if (isNaN(x) || x < 0) return toast('Valor inválido em ' + rot + '.'); d[k] = x;
      }
      if (novo) { const n = { id: uid('al'), fav: false, usado: 0, ...d }; dt().alimentos.push(n); s.fechar(); commit(); depois && depois(n); }
      else { Object.assign(f, d); s.fechar(); commit(); }
    };
  }

  /* ---------- quantidade de um alimento ---------- */
  function qtdSheet(f, aoOk) {
    const s = sheet(f.nome, `<p class="mu sm" style="margin-top:0">${Math.round(f.kcal)} kcal por 100 ${f.base}${f.marca ? ' · ' + esc(f.marca) : ''} · fonte: ${esc(f.fonte || 'Manual')}</p>
      ${F(`Quantidade (${f.base})`, inp('q', '', 'inputmode="decimal" placeholder="Ex.: 150"'))}
      ${f.medidas && f.medidas.length ? `<div class="exb" style="margin:-4px 0 12px">${f.medidas.map((m, i) => `<button class="btn sec" data-m="${i}">1 ${esc(m.n)} (${numStr(m.q)} ${f.base})</button>`).join('')}</div>` : ''}
      <div class="card" id="pv" style="margin-bottom:12px"><small class="mu">Digite a quantidade.</small></div>
      <div class="acts"><button class="btn" data-ok>Adicionar</button></div>`);
    const q = s.$('input[name=q]'), pv = s.$('#pv');
    const calc = () => { const v = num(q.value); if (!(v > 0)) { pv.innerHTML = '<small class="mu">Digite a quantidade.</small>'; return null; } const it = itemDe(f, v); pv.innerHTML = `<b>${Math.round(it.kcal)} kcal</b><br><small class="mu">P ${n1(it.prot)} g · C ${n1(it.carb)} g · G ${n1(it.gord)} g · Fibras ${n1(it.fib)} g</small>`; return it; };
    q.oninput = calc; s.$$('[data-m]').forEach(b => b.onclick = () => { q.value = numStr(f.medidas[b.dataset.m].q); calc(); });
    const ok = () => { const it = calc(); if (!it) return toast('Informe uma quantidade maior que zero.'); f.usado = Date.now(); s.fechar(); aoOk(it); };
    s.$('[data-ok]').onclick = ok; q.onkeydown = e => { if (e.key === 'Enter') ok(); };
    setTimeout(() => q.focus(), 80);
  }

  /* ---------- busca de alimentos (usada no diário e nas receitas) ---------- */
  function listaAlimentos(box, aoEscolher) {
    box.innerHTML = `<input type="search" name="busca" placeholder="Buscar por nome ou marca" autocomplete="off" aria-label="Buscar alimento" style="margin-bottom:6px"><div id="la"></div>`;
    const la = $('#la', box), busca = $('input', box);
    const linha = f => `<div class="row" data-f="${f.id}"><div class="t"><b>${esc(f.nome)}</b><small>${esc([f.marca, Math.round(f.kcal) + ' kcal/100 ' + f.base].filter(Boolean).join(' · '))}</small></div></div>`;
    function desenha() {
      const al = dt().alimentos, k = nk(busca.value);
      let html = '';
      if (!al.length) html = `<div class="empty">Você ainda não cadastrou alimentos.</div><div class="acts" style="flex-wrap:wrap"><button class="btn sec" data-novo>Cadastrar alimento</button><button class="btn sec" data-taco>Importar tabela TACO</button><button class="btn sec" data-comuns>Adicionar alimentos comuns</button></div><p class="hint">A tabela TACO traz cerca de 490 alimentos brasileiros com valores por 100 g. Os alimentos comuns são aproximados; confira com o rótulo.</p>`;
      else if (k) { const l = al.filter(f => nk(f.nome + ' ' + (f.marca || '')).includes(k)).slice(0, 40); html = l.length ? `<div class="card" style="padding:2px 14px">${l.map(linha).join('')}</div>` : '<div class="empty">Nada encontrado.</div><div class="acts"><button class="btn sec" data-novo>Cadastrar alimento</button></div>'; }
      else {
        const fav = al.filter(f => f.fav), rec = al.filter(f => !f.fav && f.usado).sort((a, b) => b.usado - a.usado).slice(0, 10);
        html = (fav.length ? `<div class="dia">Favoritos</div><div class="card" style="padding:2px 14px">${fav.map(linha).join('')}</div>` : '') + (rec.length ? `<div class="dia">Recentes</div><div class="card" style="padding:2px 14px">${rec.map(linha).join('')}</div>` : '') +
          (!fav.length && !rec.length ? `<div class="card" style="padding:2px 14px">${[...al].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, 30).map(linha).join('')}</div>` : '') +
          '<div class="acts" style="justify-content:flex-start"><button class="btn sec" data-novo>Cadastrar alimento</button></div>';
      }
      la.innerHTML = html;
      $$('[data-f]', la).forEach(r => r.onclick = () => qtdSheet(dt().alimentos.find(f => f.id === r.dataset.f), aoEscolher));
      const nv = $('[data-novo]', la); if (nv) nv.onclick = () => formAlimento(null, f => qtdSheet(f, aoEscolher));
      const tc = $('[data-taco]', la); if (tc) tc.onclick = () => { const x = importarTaco(); Store.salvar(); toast(msgTaco(x)); desenha(); };
      const cm = $('[data-comuns]', la); if (cm) cm.onclick = () => { const n = addComuns(); Store.salvar(); toast(n + ' alimentos adicionados (valores aproximados).'); desenha(); };
    }
    busca.oninput = desenha; desenha();
  }

  /* ---------- adicionar à refeição ---------- */
  function abrirAdicionar(d, tipo) {
    let aba = 'alim';
    const s = sheet(`${tipo} · ${fmtData(d)}`, `${segHtml([['alim', 'Alimentos'], ['rec', 'Receitas'], ['rap', 'Rápido']], aba)}<div id="ad-c"></div>`, { full: true });
    const grava = it => { refeicao(d, tipo, true).itens.push(it); Store.salvar(); refresh(); toast(`${it.nome}: ${Math.round(it.kcal)} kcal`, () => { const r = refeicao(d, tipo); if (r) { r.itens = r.itens.filter(x => x !== it); limparVazias(); } commit(); }); };
    function desenha() {
      $$('.seg button', s.el).forEach(b => b.classList.toggle('on', b.dataset.s === aba));
      const c = s.$('#ad-c');
      if (aba === 'alim') return listaAlimentos(c, it => grava(it));
      if (aba === 'rec') {
        const rs = dt().receitas;
        c.innerHTML = rs.length ? `<div class="card" style="padding:2px 14px">${rs.map(r => `<div class="row" data-r="${r.id}"><div class="t"><b>${esc(r.nome)}</b><small>${Math.round(porPorcao(r).kcal)} kcal por porção</small></div></div>`).join('')}</div>` : '<div class="empty">Nenhuma receita ainda. Crie na aba Receitas da Dieta.</div>';
        return $$('[data-r]', c).forEach(r => r.onclick = () => {
          const rc = dt().receitas.find(x => x.id === r.dataset.r), pp = porPorcao(rc);
          const q = sheet(rc.nome, `<p class="mu sm" style="margin-top:0">${Math.round(pp.kcal)} kcal por porção (receita de ${rc.porcoes} porção${rc.porcoes > 1 ? 'ões' : ''})</p>${F('Porções consumidas', inp('n', '1', 'inputmode="decimal"'))}<div class="acts"><button class="btn" data-ok>Adicionar</button></div>`);
          q.$('[data-ok]').onclick = () => { const n = num(vals(q.el).n); if (!(n > 0)) return toast('Informe as porções.'); q.fechar(); grava({ id: uid('it'), rid: rc.id, nome: rc.nome, qtd: r1(n), un: 'porção', kcal: r1(pp.kcal * n), prot: r1(pp.prot * n), carb: r1(pp.carb * n), gord: r1(pp.gord * n), fib: r1(pp.fib * n) }); };
        });
      }
      c.innerHTML = `<p class="hint" style="margin-top:0">Para quando você só sabe os totais (ex.: comida de restaurante). Fica marcado como estimativa.</p>${F('Descrição', inp('nome', '', 'placeholder="Ex.: Almoço no restaurante"'))}<div class="g2">${F('Energia (kcal)', inp('kcal', '', 'inputmode="decimal"'))}${F('Proteínas (g)', inp('prot', '', 'inputmode="decimal"'))}</div><div class="g2">${F('Carboidratos (g)', inp('carb', '', 'inputmode="decimal"'))}${F('Gorduras (g)', inp('gord', '', 'inputmode="decimal"'))}</div><div class="acts"><button class="btn" data-ok>Adicionar</button></div>`;
      $('[data-ok]', c).onclick = () => {
        const v = vals(c), x = k => v[k].trim() ? num(v[k]) : 0;
        const o = { kcal: x('kcal'), prot: x('prot'), carb: x('carb'), gord: x('gord') };
        if (Object.values(o).some(n => isNaN(n) || n < 0)) return toast('Há um valor inválido.');
        if (!o.kcal && !o.prot && !o.carb && !o.gord) return toast('Informe ao menos um valor.');
        grava({ id: uid('it'), nome: (v.nome.trim() || 'Registro rápido') + ' (estimativa)', qtd: 1, un: 'reg', ...o, fib: 0 });
        s.fechar();
      };
    }
    $$('.seg button', s.el).forEach(b => b.onclick = () => { aba = b.dataset.s; desenha(); });
    desenha();
  }

  function formItem(r, it) {
    const s = sheet(it.nome, `<p class="mu sm" style="margin-top:0">${Math.round(it.kcal)} kcal · P ${n1(it.prot)} g · C ${n1(it.carb)} g · G ${n1(it.gord)} g</p>
      ${it.un === 'reg' ? '' : F(`Quantidade (${it.un === 'porção' ? 'porções' : it.un})`, inp('q', numStr(it.qtd), 'inputmode="decimal"'))}
      <div class="acts"><button class="btn bad" data-del>Remover</button>${it.un === 'reg' ? '' : '<button class="btn" data-ok>Salvar</button>'}</div>`);
    s.$('[data-del]').onclick = () => { const i = r.itens.indexOf(it); r.itens.splice(i, 1); limparVazias(); s.fechar(); commit(); toast('Item removido', () => { const rr = refeicao(r.data, r.tipo, true); rr.itens.splice(i, 0, it); commit(); }); };
    const ok = s.$('[data-ok]'); if (ok) ok.onclick = () => {
      const q = num(vals(s.el).q); if (!(q > 0)) return toast('Informe uma quantidade maior que zero.');
      Object.assign(it, escala(it, q / it.qtd), { id: it.id }); s.fechar(); commit();
    };
  }

  /* ---------- copiar refeições, modelos ---------- */
  function copiar(de, para, tipo) {
    let n = 0;
    refDia(de).filter(r => !tipo || r.tipo === tipo).forEach(r => { const dst = refeicao(para, r.tipo, true); r.itens.forEach(i => { dst.itens.push({ ...i, id: uid('it') }); n++; }); });
    return n;
  }
  function formCopiar(para, tipo) {
    const s = sheet(tipo ? `Copiar ${tipo}` : 'Copiar o dia inteiro', `${F('Copiar de', inp('de', addDias(para, -1), 'type="date"'))}<div class="acts"><button class="btn" data-ok>Copiar</button></div>`);
    s.$('[data-ok]').onclick = () => {
      const de = vals(s.el).de; if (!dataOk(de)) return toast('Informe uma data válida.'); if (de === para) return toast('Escolha outro dia.');
      const n = copiar(de, para, tipo); if (!n) return toast('Não há registros nesse dia.');
      s.fechar(); commit(); toast(n + ' item(ns) copiado(s).');
    };
  }
  function menuRefeicao(d, tipo) {
    const r = refeicao(d, tipo), s = sheet(tipo, `<div class="acts" style="flex-direction:column;align-items:stretch">
      <button class="btn sec" data-a="cop">Copiar de outro dia</button><button class="btn sec" data-a="mod">Usar um modelo salvo</button>
      ${r && r.itens.length ? '<button class="btn sec" data-a="sal">Salvar como modelo</button><button class="btn bad" data-a="lim">Limpar esta refeição</button>' : ''}</div>`);
    s.$$('[data-a]').forEach(b => b.onclick = async () => {
      const a = b.dataset.a; s.fechar();
      if (a === 'cop') return formCopiar(d, tipo);
      if (a === 'mod') return usarModelo(d, tipo);
      if (a === 'sal') { const sh = sheet('Salvar como modelo', `${F('Nome do modelo', inp('nome', tipo, 'placeholder="Ex.: Café da manhã padrão"'))}<div class="acts"><button class="btn" data-ok>Salvar</button></div>`); sh.$('[data-ok]').onclick = () => { const n = vals(sh.el).nome.trim(); if (!n) return toast('Informe o nome.'); dt().modelos.push({ id: uid('md'), nome: n, itens: r.itens.map(i => ({ ...i })) }); sh.fechar(); commit(); toast('Modelo salvo.'); }; return; }
      if (a === 'lim' && await confirmar('Limpar esta refeição?', 'Limpar')) { const bak = r.itens; r.itens = []; limparVazias(); commit(); toast('Refeição limpa', () => { refeicao(d, tipo, true).itens = bak; commit(); }); }
    });
  }
  function usarModelo(d, tipo) {
    const s = sheet('Modelos de refeição', '<div id="mdl"></div>');
    function desenha() {
      const l = dt().modelos;
      s.$('#mdl').innerHTML = l.length ? `<div class="card" style="padding:2px 14px">${l.map(m => `<div class="row"><div class="t" data-u="${m.id}"><b>${esc(m.nome)}</b><small>${m.itens.length} itens · ${Math.round(somaItens(m.itens).kcal)} kcal</small></div><button class="btn sec" data-x="${m.id}" aria-label="Excluir modelo" style="padding:6px 12px">×</button></div>`).join('')}</div>` : '<div class="empty">Nenhum modelo salvo.<br>Abra o menu de uma refeição e toque em "Salvar como modelo".</div>';
      s.$$('[data-u]').forEach(e => e.onclick = () => { const m = dt().modelos.find(x => x.id === e.dataset.u); m.itens.forEach(i => refeicao(d, tipo, true).itens.push({ ...i, id: uid('it') })); s.fechar(); commit(); toast('Modelo adicionado.'); });
      s.$$('[data-x]').forEach(e => e.onclick = async () => { if (await confirmar('Excluir este modelo?')) { dt().modelos = dt().modelos.filter(x => x.id !== e.dataset.x); Store.salvar(); desenha(); } });
    }
    desenha();
  }

  function formMetas() {
    const m = dt().metas;
    const s = sheet('Metas diárias', `<div class="g2">${F('Energia (kcal)', inp('kcal', m.kcal || '', 'inputmode="numeric"'))}${F('Proteínas (g)', inp('prot', m.prot || '', 'inputmode="numeric"'))}</div>
      <div class="g2">${F('Carboidratos (g)', inp('carb', m.carb || '', 'inputmode="numeric"'))}${F('Gorduras (g)', inp('gord', m.gord || '', 'inputmode="numeric"'))}</div>${F('Fibras (g)', inp('fib', m.fib || '', 'inputmode="numeric"'))}
      <p class="hint">Metas são só uma referência pessoal e não substituem orientação de nutricionista. Deixe em branco o que não quiser acompanhar.</p>
      <div class="acts"><button class="btn" data-ok>Salvar</button></div>`);
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), o = {};
      for (const k of ['kcal', 'prot', 'carb', 'gord', 'fib']) { const x = v[k].trim() ? num(v[k]) : 0; if (isNaN(x) || x < 0 || x > 20000) return toast('Valor inválido.'); o[k] = Math.round(x); }
      Object.assign(dt().metas, o); s.fechar(); commit();
    };
  }

  const escolherRefeicao = d => {
    const tipos = [...dt().tipos];
    const s = sheet('Adicionar em qual refeição?', `<div class="acts" style="flex-direction:column;align-items:stretch">${tipos.map((t, i) => `<button class="btn sec" data-t="${i}">${esc(t)}</button>`).join('')}<button class="btn sec" data-o>Outra refeição…</button></div>`);
    s.$$('[data-t]').forEach(b => b.onclick = () => { s.fechar(); abrirAdicionar(d, tipos[b.dataset.t]); });
    s.$('[data-o]').onclick = () => { s.fechar(); const sh = sheet('Outra refeição', `${F('Nome', inp('nome', '', 'placeholder="Ex.: Pré-treino"'))}<div class="acts"><button class="btn" data-ok>Continuar</button></div>`); sh.$('[data-ok]').onclick = () => { const n = vals(sh.el).nome.trim(); if (!n) return toast('Informe o nome.'); sh.fechar(); abrirAdicionar(d, n); }; };
  };

  /* ---------- diário ---------- */
  function rDiario(el) {
    const d = S.dia, rs = refDia(d), t = somaItens(rs.flatMap(r => r.itens)), m = dt().metas;
    const tipos = [...dt().tipos, ...rs.map(r => r.tipo).filter(x => !dt().tipos.includes(x))];
    const lm = (rot, v, meta, un) => `<div style="margin:8px 0"><div style="display:flex;justify-content:space-between;gap:8px"><span>${rot}</span><span class="n">${n1(v)}${meta ? ' de ' + meta : ''} ${un}</span></div>${meta ? `<div class="bar"><i style="width:${Math.min(100, v / meta * 100)}%"></i></div>` : ''}</div>`;
    const estim = rs.some(r => r.itens.some(i => i.un === 'reg'));
    el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><button class="btn sec" data-dd="-1" aria-label="Dia anterior">‹</button><div style="flex:1;text-align:center;font-weight:600">${d === hoje() ? 'Hoje' : fmtDiaCurto(d)}</div><button class="btn sec" data-dd="1" aria-label="Próximo dia">›</button>${d === hoje() ? '' : '<button class="btn sec" data-hj>Hoje</button>'}</div>
      <div class="card"><small class="mu">Energia registrada</small><div class="big">${Math.round(t.kcal)}<span class="mu" style="font-size:16px;font-weight:400"> kcal${m.kcal ? ' de ' + m.kcal : ''}</span></div>${m.kcal ? `<div class="bar"><i style="width:${Math.min(100, t.kcal / m.kcal * 100)}%"></i></div>` : ''}
        ${lm('Proteínas', t.prot, m.prot, 'g')}${lm('Carboidratos', t.carb, m.carb, 'g')}${lm('Gorduras', t.gord, m.gord, 'g')}${lm('Fibras', t.fib, m.fib, 'g')}
        <small class="mu">Calculado a partir dos alimentos cadastrados; os valores podem variar do real${estim ? ' e há itens de estimativa rápida' : ''}.</small></div>
      <div class="acts" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn sec" id="dm">Metas</button><button class="btn sec" id="dc">Copiar dia inteiro</button></div>
      ${tipos.map(tp => {
        const r = rs.find(x => x.tipo === tp), its = r ? r.itens : [], k = somaItens(its).kcal;
        return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><b>${esc(tp)}</b><span class="mu sm">${its.length ? Math.round(k) + ' kcal' : ''}</span></div>
          ${its.map(i => `<div class="row" data-it="${i.id}" data-tp="${esc(tp)}"><div class="t"><b>${esc(i.nome)}</b><small>${unTxt(i)}</small></div><span class="n">${Math.round(i.kcal)}</span></div>`).join('')}
          <div class="exb"><button class="btn sec" data-add="${esc(tp)}">+ Adicionar</button><button class="btn sec" data-mn="${esc(tp)}" aria-label="Mais opções">⋯</button></div></div>`;
      }).join('')}`;
    $$('[data-dd]', el).forEach(b => b.onclick = () => { S.dia = addDias(S.dia, +b.dataset.dd); refresh(); });
    const hjb = $('[data-hj]', el); if (hjb) hjb.onclick = () => { S.dia = hoje(); refresh(); };
    $('#dm', el).onclick = formMetas; $('#dc', el).onclick = () => formCopiar(d, null);
    $$('[data-add]', el).forEach(b => b.onclick = () => abrirAdicionar(d, b.dataset.add));
    $$('[data-mn]', el).forEach(b => b.onclick = () => menuRefeicao(d, b.dataset.mn));
    $$('[data-it]', el).forEach(r => r.onclick = () => { const rf = refeicao(d, r.dataset.tp); if (rf) formItem(rf, rf.itens.find(i => i.id === r.dataset.it)); });
  }

  /* ---------- alimentos ---------- */
  function rAlimentos(el) {
    const al = [...dt().alimentos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), k = nk(S.busca || '');
    const l = k ? al.filter(f => nk(f.nome + ' ' + (f.marca || '')).includes(k)) : al;
    el.innerHTML = `<input type="search" id="al-b" placeholder="Buscar alimento" value="${esc(S.busca || '')}" aria-label="Buscar alimento" style="margin-bottom:10px">
      ${l.length ? `<div class="card" style="padding:2px 14px">${l.slice(0, 600).map(f => `<div class="row"><button class="btn sec" data-fv="${f.id}" aria-label="${f.fav ? 'Remover dos favoritos' : 'Favoritar'}" style="padding:4px 10px;${f.fav ? 'color:var(--cor);border-color:var(--cor)' : ''}">${f.fav ? '★' : '☆'}</button><div class="t" data-f="${f.id}"><b>${esc(f.nome)}</b><small>${esc([f.marca, Math.round(f.kcal) + ' kcal/100 ' + f.base, f.fonte].filter(Boolean).join(' · '))}</small></div></div>`).join('')}</div>` : `<div class="empty">${al.length ? 'Nada encontrado.' : 'Nenhum alimento cadastrado.<br>Toque em + ou adicione os alimentos comuns.'}</div>`}
      <div class="acts" style="justify-content:flex-start;flex-wrap:wrap;margin-top:12px"><button class="btn sec" id="al-t">Importar tabela TACO</button><button class="btn sec" id="al-c">Adicionar alimentos comuns</button><button class="btn sec" id="al-i">Importar CSV</button></div>
      <p class="hint">A TACO (2ª edição, NEPA/UNICAMP) traz ~490 alimentos brasileiros por 100 g. Os alimentos comuns têm valores aproximados; confira com o rótulo. Para importar uma tabela, use um CSV com colunas: nome;kcal;proteínas;carboidratos;gorduras;fibras (valores por 100 g).</p>`;
    const b = $('#al-b', el); b.oninput = () => { S.busca = b.value; const p = b.selectionStart; refresh(); const n = $('#al-b'); if (n) { n.focus(); n.setSelectionRange(p, p); } };
    $$('[data-f]', el).forEach(r => r.onclick = () => formAlimento(dt().alimentos.find(f => f.id === r.dataset.f)));
    $$('[data-fv]', el).forEach(r => r.onclick = () => { const f = dt().alimentos.find(x => x.id === r.dataset.fv); f.fav = !f.fav; commit(); });
    $('#al-t', el).onclick = () => { const x = importarTaco(); commit(); toast(msgTaco(x)); };
    $('#al-c', el).onclick = () => { const n = addComuns(); commit(); toast(n ? n + ' alimentos adicionados (valores aproximados).' : 'Os alimentos comuns já estão cadastrados.'); };
    $('#al-i', el).onclick = escolherCsv;
  }

  /* ---------- receitas ---------- */
  function formReceita(rc) {
    const novo = !rc, R = novo ? { nome: '', porcoes: 1, itens: [], obs: '' } : { ...rc, itens: rc.itens.map(i => ({ ...i })) };
    const s = sheet(novo ? 'Nova receita' : 'Editar receita', `${F('Nome', inp('nome', R.nome, 'placeholder="Ex.: Omelete de queijo"'))}
      ${F('Rende quantas porções?', inp('porcoes', R.porcoes, 'inputmode="decimal"'))}
      <div class="dia" style="margin-top:4px">Ingredientes</div><div id="ri"></div>
      <div class="acts" style="justify-content:flex-start"><button class="btn sec" id="ri-add">+ Ingrediente</button></div>
      <div class="card" id="rt" style="margin:12px 0"></div>
      ${F('Modo de preparo (opcional)', `<textarea name="obs" style="min-height:70px">${esc(R.obs || '')}</textarea>`)}
      <div class="acts">${novo ? '' : '<button class="btn bad" data-del>Excluir</button>'}<button class="btn" data-ok>Salvar</button></div>`);
    const porc = () => { const p = num(s.$('[name=porcoes]').value); return p > 0 ? p : 1; };
    function desenha() {
      s.$('#ri').innerHTML = R.itens.length ? `<div class="card" style="padding:2px 14px">${R.itens.map((i, k) => `<div class="row"><div class="t"><b>${esc(i.nome)}</b><small>${unTxt(i)} · ${Math.round(i.kcal)} kcal</small></div><button class="btn sec" data-x="${k}" aria-label="Remover ingrediente" style="padding:4px 12px">×</button></div>`).join('')}</div>` : '<small class="mu">Adicione os ingredientes com as quantidades usadas.</small>';
      s.$$('[data-x]').forEach(b => b.onclick = () => { R.itens.splice(+b.dataset.x, 1); desenha(); });
      const t = somaItens(R.itens), p = porc();
      s.$('#rt').innerHTML = `<small class="mu">Por porção (${n1(p)})</small><div><b>${Math.round(t.kcal / p)} kcal</b> · <small class="mu">P ${n1(t.prot / p)} g · C ${n1(t.carb / p)} g · G ${n1(t.gord / p)} g · Fibras ${n1(t.fib / p)} g</small></div>`;
    }
    desenha();
    s.$('[name=porcoes]').oninput = desenha;
    s.$('#ri-add').onclick = () => { const p = sheet('Adicionar ingrediente', '<div id="pk"></div>', { full: true }); listaAlimentos(p.$('#pk'), it => { R.itens.push(it); p.fechar(); desenha(); }); };
    if (!novo) s.$('[data-del]').onclick = async () => {
      if (!(await confirmar('Excluir esta receita? Refeições já registradas não mudam.'))) return;
      const i = dt().receitas.indexOf(rc); dt().receitas.splice(i, 1); s.fechar(); commit(); toast('Receita excluída', () => { dt().receitas.splice(i, 0, rc); commit(); });
    };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), p = num(v.porcoes);
      if (!v.nome.trim()) return toast('Informe o nome.'); if (!(p > 0)) return toast('Informe quantas porções a receita rende.'); if (!R.itens.length) return toast('Adicione ao menos um ingrediente.');
      const d = { nome: v.nome.trim(), porcoes: p, itens: R.itens, obs: v.obs.trim() };
      if (novo) dt().receitas.push({ id: uid('rc'), ...d }); else Object.assign(rc, d);
      s.fechar(); commit();
    };
  }
  function rReceitas(el) {
    const l = [...dt().receitas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    el.innerHTML = l.length ? `<div class="card" style="padding:2px 14px">${l.map(r => { const p = porPorcao(r); return `<div class="row" data-r="${r.id}"><div class="t"><b>${esc(r.nome)}</b><small>${r.itens.length} ingredientes · ${n1(r.porcoes)} porção(ões) · P ${n1(p.prot)} g · C ${n1(p.carb)} g · G ${n1(p.gord)} g</small></div><span class="n">${Math.round(p.kcal)} kcal</span></div>`; }).join('')}</div><p class="hint">Valores por porção.</p>` : '<div class="empty">Nenhuma receita ainda.<br>Toque em + para criar. Dá para registrar uma porção direto no diário e gerar a lista de compras.</div>';
    $$('[data-r]', el).forEach(r => r.onclick = () => formReceita(dt().receitas.find(x => x.id === r.dataset.r)));
  }

  /* ---------- lista de compras ---------- */
  const fmtQ = c => !c.qtd ? (c.txt || '') : c.un === 'g' ? (c.qtd >= 1000 ? n1(c.qtd / 1000) + ' kg' : n1(c.qtd) + ' g') : c.un === 'ml' ? (c.qtd >= 1000 ? n1(c.qtd / 1000) + ' L' : n1(c.qtd) + ' ml') : n1(c.qtd) + ' ' + (c.un === 'porção' ? 'un.' : c.un);
  function addCompra(nome, qtd, un, aid) {
    const ex = aid && dt().compras.find(c => c.aid === aid && c.un === un && !c.ok);
    if (ex) ex.qtd = r1(ex.qtd + qtd); else dt().compras.push({ id: uid('cp'), nome, aid: aid || null, qtd: r1(qtd), un: un || '', txt: '', ok: false });
  }
  function formCompraItem() {
    const s = sheet('Novo item', `${F('Item', inp('nome', '', 'placeholder="Ex.: Detergente"'))}${F('Quantidade (opcional)', inp('txt', '', 'placeholder="Ex.: 2 unidades"'))}<div class="acts"><button class="btn" data-ok>Adicionar</button></div>`);
    s.$('[data-ok]').onclick = () => { const v = vals(s.el); if (!v.nome.trim()) return toast('Informe o item.'); dt().compras.push({ id: uid('cp'), nome: v.nome.trim(), aid: null, qtd: 0, un: '', txt: v.txt.trim(), ok: false }); s.fechar(); commit(); };
  }
  function formCompraDe() {
    const rec = dt().receitas, mod = dt().modelos;
    if (!rec.length && !mod.length) return toast('Crie uma receita ou salve um modelo de refeição primeiro.');
    const s = sheet('Adicionar à lista de compras', `<div class="card" style="padding:2px 14px">${rec.map(r => `<label class="chk"><input type="radio" name="o" value="r:${r.id}"><span>Receita: ${esc(r.nome)}</span></label>`).join('')}${mod.map(m => `<label class="chk"><input type="radio" name="o" value="m:${m.id}"><span>Modelo: ${esc(m.nome)}</span></label>`).join('')}</div>
      <div style="margin-top:12px">${F('Quantas porções (receita) ou vezes (modelo)?', inp('n', '1', 'inputmode="decimal"'))}</div><div class="acts"><button class="btn" data-ok>Adicionar ingredientes</button></div>`);
    s.$('[data-ok]').onclick = () => {
      const o = (s.$$('input[name=o]').find(x => x.checked) || {}).value, n = num(vals(s.el).n);
      if (!o) return toast('Escolha uma receita ou modelo.'); if (!(n > 0)) return toast('Informe a quantidade.');
      const [tp, id] = o.split(':'), fonte = tp === 'r' ? dt().receitas.find(x => x.id === id) : dt().modelos.find(x => x.id === id), k = tp === 'r' ? n / (fonte.porcoes || 1) : n;
      let c = 0; fonte.itens.forEach(i => { if (i.un === 'reg') return; addCompra(i.nome, i.qtd * k, i.un, i.aid || i.rid); c++; });
      s.fechar(); commit(); toast(c + ' ingrediente(s) na lista.');
    };
  }
  function formGasto() {
    const s = sheet('Lançar gasto em Finanças', `${F('Valor (R$)', inp('valor', '', 'inputmode="decimal"'))}${F('Descrição', inp('desc', 'Compras do mercado'))}${F('Data', inp('data', hoje(), 'type="date"'))}<p class="hint">Cria uma despesa paga na categoria Mercado, na sua primeira conta.</p><div class="acts"><button class="btn" data-ok>Lançar</button></div>`);
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), valor = num(v.valor); if (!(valor > 0)) return toast('Informe um valor maior que zero.'); if (!dataOk(v.data)) return toast('Data inválida.');
      let cat = DB.fin.categorias.saida.find(c => nk(c) === 'mercado'); if (!cat) { cat = 'Mercado'; DB.fin.categorias.saida.push(cat); }
      DB.fin.tx.push({ id: uid('tx'), tipo: 'saida', categoria: cat, descricao: v.desc.trim() || 'Compras do mercado', valor: r2(valor), contaId: DB.fin.contas[0].id, data: v.data, status: 'pago', recorrente: false, seriesId: null, frequencia: null });
      s.fechar(); commit(); toast('Gasto lançado em Finanças.');
    };
  }
  function rCompras(el) {
    const l = dt().compras, pend = l.filter(c => !c.ok), feitos = l.filter(c => c.ok);
    const lin = c => `<div class="row${c.ok ? ' done' : ''}"><button class="ck${c.ok ? ' on' : ''}" data-ck="${c.id}" aria-label="Marcar como comprado"></button><div class="t" data-ed="${c.id}"><b>${esc(c.nome)}</b>${fmtQ(c) ? `<small>${esc(fmtQ(c))}</small>` : ''}</div></div>`;
    el.innerHTML = (l.length ? `<div class="card" style="padding:2px 14px">${pend.map(lin).join('')}${feitos.map(lin).join('')}</div>` : '<div class="empty">Lista vazia.<br>Adicione itens com + ou gere a partir de uma receita.</div>') +
      `<div class="acts" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn sec" id="cp-r">Adicionar de receita/modelo</button>${feitos.length ? '<button class="btn sec" id="cp-l">Limpar comprados</button>' : ''}${l.length ? '<button class="btn sec" id="cp-g">Lançar gasto</button>' : ''}</div>`;
    $$('[data-ck]', el).forEach(b => b.onclick = () => { const c = dt().compras.find(x => x.id === b.dataset.ck); c.ok = !c.ok; commit(); });
    $$('[data-ed]', el).forEach(b => b.onclick = async () => { const c = dt().compras.find(x => x.id === b.dataset.ed); if (await confirmar(`Remover "${c.nome}" da lista?`, 'Remover')) { dt().compras = dt().compras.filter(x => x !== c); commit(); } });
    $('#cp-r', el).onclick = formCompraDe;
    const lm = $('#cp-l', el); if (lm) lm.onclick = () => { const bak = dt().compras; dt().compras = bak.filter(c => !c.ok); commit(); toast('Comprados removidos', () => { dt().compras = bak; commit(); }); };
    const gs = $('#cp-g', el); if (gs) gs.onclick = formGasto;
  }


  /* =========================== IMC, GASTO E DÉFICIT ===========================
     TMB pela equação de Mifflin-St Jeor; gasto total = TMB × nível de atividade;
     1 kg de peso ≈ 7.700 kcal. São estimativas, não prescrição. */
  const NIVEIS = [[1.2, 'Sedentário (quase sem exercício)'], [1.375, 'Leve (1–3 treinos/semana)'], [1.55, 'Moderado (3–5 treinos/semana)'], [1.725, 'Intenso (6–7 treinos/semana)'], [1.9, 'Muito intenso (treino pesado/trabalho físico)']];
  const RITMOS = [[0, 'Manter'], [0.25, '0,25 kg/sem'], [0.5, '0,5 kg/sem'], [0.75, '0,75 kg/sem'], [1, '1 kg/sem']];
  const KCAL_KG = 7700;
  const idadeDe = nasc => { if (!dataOk(nasc)) return 0; const n = pd(nasc), h = pd(hoje()); let a = h.getFullYear() - n.getFullYear(); if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) a--; return a; };
  const pesoAtual = () => [...DB.treino.medidas].filter(m => m.peso).sort((a, b) => b.data.localeCompare(a.data))[0] || null;
  const classeImc = v => v < 18.5 ? 'Abaixo do peso' : v < 25 ? 'Peso normal' : v < 30 ? 'Sobrepeso' : v < 35 ? 'Obesidade grau I' : v < 40 ? 'Obesidade grau II' : 'Obesidade grau III';
  function imcInfo() {
    const pe = pesoAtual(), h = dt().perfil.altura; if (!pe || !(h > 0)) return null;
    const m = h / 100, v = pe.peso / (m * m);
    return { v, classe: classeImc(v), peso: pe.peso, data: pe.data, min: 18.5 * m * m, max: 24.9 * m * m };
  }
  const imcTxt = () => { const i = imcInfo(); return i ? `IMC ${n1(i.v)} · ${i.classe}` : ''; };
  function energia() {
    const p = dt().perfil, pe = pesoAtual(), idade = idadeDe(p.nasc);
    if (!pe || !(p.altura > 0) || !idade || !p.sexo) return null;
    const tmb = 10 * pe.peso + 6.25 * p.altura - 5 * idade + (p.sexo === 'M' ? 5 : -161);
    return { tmb, get: tmb * p.nivel, idade, peso: pe.peso };
  }
  function planoDeficit(e) {
    const p = dt().perfil, ritmo = Number(p.ritmo) || 0, def = ritmo * KCAL_KG / 7, piso = p.sexo === 'M' ? 1500 : 1200;
    const bruta = e.get - def, meta = Math.max(bruta, piso);
    return { ritmo, def, bruta, meta, piso, abaixoPiso: bruta < piso, defReal: e.get - meta };
  }
  function balanco7() {   // média dos últimos 7 dias com refeições registradas (dias incompletos subestimam o consumo)
    const e = energia(); if (!e) return null;
    const dias = Array.from({ length: 7 }, (_, k) => addDias(hoje(), -k)).map(d => ({ d, t: somaItens(refDia(d).flatMap(r => r.itens)) })).filter(x => x.t.kcal > 0);
    if (!dias.length) return null;
    const med = dias.reduce((t, x) => t + x.t.kcal, 0) / dias.length;
    return { dias: dias.length, med, def: e.get - med, kgSem: (e.get - med) * 7 / KCAL_KG };
  }

  function formPerfil() {
    const p = dt().perfil, pe = pesoAtual();
    const s = sheet('Meu perfil', `<div class="g2">${F('Sexo', sel('sexo', [['', 'Selecione'], ['F', 'Feminino'], ['M', 'Masculino']], p.sexo))}${F('Nascimento', inp('nasc', p.nasc, 'type="date"'))}</div>
      <div class="g2">${F('Altura (cm)', inp('altura', numStr(p.altura || ''), 'inputmode="decimal" placeholder="Ex.: 170"'))}${F('Peso desejado (kg)', inp('pesoMeta', numStr(p.pesoMeta || ''), 'inputmode="decimal" placeholder="opcional"'))}</div>
      ${F('Nível de atividade', sel('nivel', NIVEIS, p.nivel))}
      <p class="hint">${pe ? `Peso atual usado nos cálculos: ${numStr(pe.peso)} kg (último registro em Treino &gt; Corpo).` : 'O peso vem dos registros em Treino &gt; Corpo. Registre seu peso para calcular.'} A equação de Mifflin-St Jeor é uma estimativa para adultos; use como referência, não como prescrição.</p>
      <div class="acts"><button class="btn sec" data-peso>Registrar peso</button><button class="btn" data-ok>Salvar</button></div>`);
    s.$('[data-peso]').onclick = () => { s.fechar(); Treinos.formMedida(null); };
    s.$('[data-ok]').onclick = () => {
      const v = vals(s.el), alt = num(v.altura), pm = v.pesoMeta.trim() ? num(v.pesoMeta) : 0;
      if (v.sexo !== 'F' && v.sexo !== 'M') return toast('Selecione o sexo.');
      if (!dataOk(v.nasc) || idadeDe(v.nasc) < 1 || idadeDe(v.nasc) > 110) return toast('Informe uma data de nascimento válida.');
      if (!(alt >= 100 && alt <= 250)) return toast('Altura entre 100 e 250 cm.');
      if (isNaN(pm) || pm < 0 || (pm && (pm < 25 || pm > 400))) return toast('Peso desejado inválido.');
      Object.assign(p, { sexo: v.sexo, nasc: v.nasc, altura: r1(alt), pesoMeta: pm ? r1(pm) : 0, nivel: Number(v.nivel) || 1.375 });
      s.fechar(); commit();
    };
  }

  function rDeficit(el) {
    const p = dt().perfil, pe = pesoAtual(), im = imcInfo(), e = energia();
    const alerta = t => `<div class="alerta" role="alert">${t}</div>`, nota = t => `<p class="nota">${t}</p>`;
    const dl = (rot, v) => `<div class="dl"><span>${rot}</span><b>${v}</b></div>`;
    if (!e || !im) {
      const temPerfil = !!p.sexo && dataOk(p.nasc) && p.altura > 0;
      el.innerHTML = `<div class="card dfc"><b style="font-size:16px">IMC e déficit calórico</b>
        <p class="mu sm" style="margin:8px 0 0">Duas coisas para calcular seu IMC, seu gasto diário e uma meta de calorias:</p>
        <ul class="passos"><li class="${temPerfil ? 'ok' : ''}"><i>${temPerfil ? '✓' : '1'}</i>Perfil: sexo, nascimento, altura e atividade</li><li class="${pe ? 'ok' : ''}"><i>${pe ? '✓' : '2'}</i>Peso atual${pe ? ': ' + numStr(pe.peso) + ' kg' : ' (Treino > Corpo)'}</li></ul>
        <div class="acts" style="flex-direction:column-reverse;align-items:stretch">${pe ? '' : '<button class="btn sec" id="df-w">Registrar peso</button>'}<button class="btn" id="df-p">${temPerfil ? 'Editar perfil' : 'Preencher perfil'}</button></div></div>`;
      $('#df-p', el).onclick = formPerfil; const w = $('#df-w', el); if (w) w.onclick = () => Treinos.formMedida(null);
      return;
    }
    const menor = e.idade < 18, abaixo = im.v < 18.5, pl = planoDeficit(e), bal = balanco7(), metaAtual = Number(dt().metas.kcal) || 0, aplicada = metaAtual === Math.round(pl.meta);
    const pos = Math.max(0, Math.min(100, (im.v - 15) / 25 * 100));
    const faltam = p.pesoMeta > 0 && im.peso > p.pesoMeta ? im.peso - p.pesoMeta : 0, sem = pl.ritmo > 0 && faltam ? Math.ceil(faltam / pl.ritmo) : 0;
    const imcMeta = p.pesoMeta > 0 ? p.pesoMeta / Math.pow(p.altura / 100, 2) : 0;
    const semDeficit = menor || abaixo;
    el.innerHTML = `<div class="card dfc"><small class="mu">Índice de massa corporal</small>
        <div class="big">${n1(im.v)}<span class="mu" style="font-size:16px;font-weight:400"> · ${im.classe}</span></div>
        <div class="imc" role="img" aria-label="Escala de IMC: seu valor é ${n1(im.v)}, ${im.classe}"><i style="width:14%"></i><i class="ok" style="width:26%"></i><i style="width:20%"></i><i style="width:20%"></i><i style="width:20%"></i><b style="left:${pos}%"></b></div>
        <div class="imcl"><span>15</span><span>18,5</span><span>25</span><span>30</span><span>35</span><span>40</span></div>
        ${nota(`Peso normal para ${numStr(p.altura)} cm: ${n1(im.min)} a ${n1(im.max)} kg. Seu último peso: ${numStr(im.peso)} kg (${fmtData(im.data)}).`)}
        ${menor ? alerta('Abaixo de 18 anos o IMC é avaliado por curvas de idade e sexo. Procure um profissional.') : ''}
        ${nota('O IMC não separa massa magra de gordura; em quem treina muito pode exagerar o excesso de peso. Cintura e % de gordura completam o quadro.')}</div>
      <div class="card dfc"><small class="mu">Gasto diário estimado · ${e.idade} anos</small>
        <div class="big">${Math.round(e.get)}<span class="mu" style="font-size:16px;font-weight:400"> kcal/dia</span></div>
        ${nota(`Metabolismo basal ${Math.round(e.tmb)} kcal × fator de atividade ${numStr(p.nivel)}.`)}</div>
      <div class="card dfc"><b style="font-size:16px">Déficit calórico</b>
        <div class="ritmo" role="group" aria-label="Ritmo de perda de peso">${RITMOS.map(([v, l]) => `<button data-r="${v}" class="${pl.ritmo === v ? 'on' : ''}" aria-pressed="${pl.ritmo === v}">${l}</button>`).join('')}</div>
        ${semDeficit ? alerta(`${abaixo ? 'Seu IMC está abaixo de 18,5: déficit calórico não é indicado.' : 'Para menores de 18 anos, déficit calórico só com acompanhamento profissional.'} Procure um profissional de saúde.`) : `
        ${dl('Déficit diário', Math.round(pl.defReal) + ' kcal')}${dl('Meta de calorias', Math.round(pl.meta) + ' kcal')}
        ${pl.ritmo ? nota(`≈ ${n1(pl.defReal * 7 / KCAL_KG)} kg por semana (${n1(pl.defReal * 30 / KCAL_KG)} kg por mês), com 7.700 kcal por kg.`) : ''}
        ${pl.abaixoPiso ? alerta(`Esse ritmo levaria a ${Math.round(pl.bruta)} kcal. Por segurança a meta foi limitada a ${pl.piso} kcal, o mínimo usado sem acompanhamento. Escolha um ritmo menor ou procure um nutricionista.`) : ''}
        ${pl.ritmo * KCAL_KG / 7 > e.get * 0.25 ? alerta('Esse déficit passa de 25% do seu gasto: difícil de sustentar e pode custar massa magra.') : ''}
        ${faltam && sem ? nota(`Faltam ${n1(faltam)} kg para ${numStr(p.pesoMeta)} kg: cerca de ${sem} semana(s), até ${fmtData(addDias(hoje(), sem * 7))}. O gasto cai conforme o peso baixa, então o prazo real tende a ser maior.`) : ''}
        ${imcMeta && imcMeta < 18.5 ? alerta(`Um peso de ${numStr(p.pesoMeta)} kg daria IMC ${n1(imcMeta)}, abaixo da faixa normal. Reveja o peso desejado.`) : ''}
        <div class="acts" style="margin-top:16px"><button class="btn block" id="df-a"${aplicada ? ' disabled' : ''}>${aplicada ? '✓ Meta aplicada no Diário' : 'Usar como meta diária'}</button></div>`}</div>
      ${bal ? `<div class="card dfc"><small class="mu">Balanço real · média de ${bal.dias} dia(s) com registro (últimos 7)</small>
        <div class="big">${bal.def >= 0 ? '−' : '+'}${Math.abs(Math.round(bal.def))}<span class="mu" style="font-size:16px;font-weight:400"> kcal/dia</span></div>
        ${nota(`Registrado: ${Math.round(bal.med)} kcal em média, para um gasto de ${Math.round(e.get)}. ${bal.def > 0 ? `No ritmo atual, ≈ ${n1(bal.kgSem)} kg a menos por semana.` : bal.def < 0 ? `No ritmo atual, ≈ ${n1(Math.abs(bal.kgSem))} kg a mais por semana.` : 'Praticamente manutenção.'} Dias com refeições faltando fazem o déficit parecer maior.`)}</div>` : ''}
      <div class="acts dfc" style="flex-direction:column-reverse;align-items:stretch"><button class="btn sec" id="df-p">Editar perfil</button><button class="btn sec" id="df-w">Registrar peso</button></div>
      ${nota('Estimativas para adultos saudáveis; não substituem médico ou nutricionista. Gestantes, lactantes e quem tem doenças ou histórico de transtorno alimentar não devem fazer déficit por conta própria.')}`;
    $$('[data-r]', el).forEach(b => b.onclick = () => { p.ritmo = +b.dataset.r; commit(); });
    $('#df-p', el).onclick = formPerfil; $('#df-w', el).onclick = () => Treinos.formMedida(null);
    const a = $('#df-a', el); if (a) a.onclick = () => { dt().metas.kcal = Math.round(pl.meta); commit(); toast('Meta diária: ' + Math.round(pl.meta) + ' kcal'); };
  }

  /* ---------- resumo da aba Saúde (água, dieta, treino e peso num lugar só) ---------- */
  function pesoMedia(de, ate) {                       // média dos pesos registrados entre duas datas (inclusive)
    const l = DB.treino.medidas.filter(m => m.peso && m.data >= de && m.data <= ate);
    return l.length ? l.reduce((t, m) => t + m.peso, 0) / l.length : null;
  }
  function rResumo(el) {
    const hj = hoje(), a = ag(), totA = mlDia(hj), metaA = a.meta || 0;
    const t = somaItens(refDia(hj).flatMap(r => r.itens)), m = dt().metas;
    const fichas = Treinos.fichasDeHoje(), feitos = fichas.filter(f => Treinos.feitoHoje(f)).length, and = Treinos.andamento();
    const treinouHj = DB.treino.sessoes.some(x => x.data === hj);
    const tile = (area, cor, rot, pct, valor, sub) => `<button type="button" class="card rtile" data-sa="${area}" style="--cor:${cor}">${pct === null ? `<div class="rv">${valor}</div>` : Graf.anel(pct)}<b>${rot}</b><small class="mu">${sub}</small></button>`;
    const tAgua = tile('agua', 'var(--c-agua)', 'Água', metaA ? Math.min(100, totA / metaA * 100) : null, fmtMl(totA), metaA ? `${fmtMl(totA)} de ${fmtMl(metaA)}` : 'sem meta definida');
    const tDieta = tile('dieta', 'var(--c-dieta)', 'Dieta', m.kcal ? Math.min(100, t.kcal / m.kcal * 100) : null, Math.round(t.kcal) + ' kcal', m.kcal ? `${Math.round(t.kcal)} de ${m.kcal} kcal` : (t.kcal ? 'sem meta definida' : 'nada registrado'));
    const tTreino = tile('treino', 'var(--c-treino)', 'Treino', fichas.length ? feitos / fichas.length * 100 : (treinouHj ? 100 : null), treinouHj ? 'Feito' : 'Livre', fichas.length ? `${feitos} de ${fichas.length} de hoje` : (treinouHj ? 'treino registrado' : 'nenhum previsto'));

    const rapidos = a.rapidos.slice(0, 3).map(v => `<button type="button" class="btn" data-ag="${v}" style="padding:8px 14px;--cor:var(--c-agua)">+ ${fmtMl(v)}</button>`).join('');
    const blocoTreino = and ? Treinos.faixaAndamento()
      : fichas.length ? `<div class="card" style="padding:2px 14px">${fichas.map(f => { const ok = Treinos.feitoHoje(f); return `<div class="row"><div class="t"><b>${esc(f.nome)}</b><small>${ok ? 'Concluído hoje' : 'Previsto para hoje'}</small></div>${ok ? '<span class="n pos">✓</span>' : `<button type="button" class="btn sec" data-tr="${f.id}" style="padding:7px 14px">Iniciar</button>`}</div>`; }).join('')}</div>`
      : `<div class="card mu sm">${treinouHj ? 'Treino de hoje já registrado.' : 'Nenhum treino previsto para hoje nas suas fichas.'}</div>`;

    // peso: média de 7 dias x semana anterior (a média alisa a oscilação do dia a dia)
    const mAt = pesoMedia(addDias(hj, -6), hj), mAnt = pesoMedia(addDias(hj, -13), addDias(hj, -7)), pe = pesoAtual();
    const dif = mAt != null && mAnt != null ? mAt - mAnt : null;
    const blocoPeso = pe ? `<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><small class="mu">Peso</small><a href="#" data-peso>Ver evolução →</a></div>
        <div class="big">${numStr(pe.peso)}<span class="mu" style="font-size:16px;font-weight:400"> kg · ${fmtData(pe.data)}</span></div>
        ${dif != null ? `<small class="mu">Média de 7 dias ${numStr(r1(mAt))} kg, ${Math.abs(dif) < 0.05 ? 'igual à' : (dif > 0 ? '+' : '−') + numStr(r1(Math.abs(dif))) + ' kg em relação à'} semana anterior.</small>` : ''}
        ${imcTxt() ? `<small class="mu" style="display:block">${imcTxt()}</small>` : ''}</div>`
      : `<div class="card"><small class="mu">Peso</small><p class="mu sm" style="margin:6px 0 10px">Registre seu peso para acompanhar a evolução (a tendência usa a média da semana).</p><button type="button" class="btn sec" data-peso>Registrar peso</button></div>`;

    // 7 dias: quem bateu a meta / registrou / treinou
    const dias = Array.from({ length: 7 }, (_, k) => addDias(hj, -(6 - k)));
    const linha = (rot, cor, f) => `<span class="sl">${rot}</span>${dias.map(d => `<i class="pt${f(d) ? ' on' : ''}" style="--cor:${cor}"></i>`).join('')}`;
    const sem = `<div class="sem7"><span></span>${dias.map(d => `<small class="mu">${DIAS[pd(d).getDay()].slice(0, 1)}</small>`).join('')}
      ${linha('Água', 'var(--c-agua)', d => metaA ? mlDia(d) >= metaA : mlDia(d) > 0)}
      ${linha('Dieta', 'var(--c-dieta)', d => refDia(d).some(r => r.itens.length))}
      ${linha('Treino', 'var(--c-treino)', d => DB.treino.sessoes.some(x => x.data === d))}</div>
      <small class="mu" style="display:block;margin-top:10px">Água: ${metaA ? 'meta batida' : 'com registro'} · Dieta: com refeições registradas · Treino: com sessão feita.</small>`;

    el.innerHTML = `<div class="rtiles">${tAgua}${tDieta}${tTreino}</div>
      <div class="exb" style="margin-top:12px">${rapidos}<button type="button" class="btn sec" data-sa="dieta">Registrar refeição</button></div>
      <div class="dia">Treino de hoje</div>${blocoTreino}
      <div class="dia">Peso</div>${blocoPeso}
      <div class="dia">Últimos 7 dias</div><div class="card">${sem}</div>`;
    ligarCards(el);
    Treinos.ligarFaixa(el);
    $$('[data-tr]', el).forEach(b => b.onclick = () => Treinos.iniciar(DB.treino.fichas.find(f => f.id === b.dataset.tr)));
    $$('[data-peso]', el).forEach(b => b.onclick = e => { e.preventDefault(); if (pe) { Treinos.S.area = 'treino'; Treinos.S.seg = 'corpo'; go('treino'); } else Treinos.formMedida(null); });
  }

  /* ---------- roteamento da aba Saúde ---------- */
  function rDieta(el) {
    el.innerHTML = segHtml([['diario', 'Diário'], ['alim', 'Alimentos'], ['rec', 'Receitas'], ['comp', 'Compras'], ['def', 'Déficit']], S.dsub) + '<div id="di-c"></div>';
    $$('.seg button', el).forEach(b => b.onclick = () => { S.dsub = b.dataset.s; refresh(); });
    ({ diario: rDiario, alim: rAlimentos, rec: rReceitas, comp: rCompras, def: rDeficit })[S.dsub]($('#di-c', el));
  }
  const render = (el, area) => (area === 'resumo' ? rResumo : area === 'agua' ? rAgua : rDieta)(el);
  const fab = area => area === 'resumo' ? null : area === 'agua' ? formAguaValor : S.dsub === 'diario' ? () => escolherRefeicao(S.dia) : S.dsub === 'alim' ? () => formAlimento(null) : S.dsub === 'rec' ? () => formReceita(null) : S.dsub === 'def' ? formPerfil : formCompraItem;
  const fabLabel = area => area === 'resumo' ? '' : area === 'agua' ? 'Registrar água' : S.dsub === 'diario' ? 'Adicionar alimento' : S.dsub === 'alim' ? 'Novo alimento' : S.dsub === 'rec' ? 'Nova receita' : S.dsub === 'def' ? 'Editar perfil' : 'Novo item';

  /* ---------- cards da tela Hoje ---------- */
  const cardAgua = () => {
    const a = ag(), tot = mlDia(hoje()), meta = a.meta || 0;
    return `<div class="card" style="--mc:var(--c-agua)"><h3><span class="ci"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES.agua}</svg></span>Água<a href="#" data-sa="agua">Abrir</a></h3><div class="big">${fmtMl(tot)}${meta ? `<span class="mu" style="font-size:15px;font-weight:400"> de ${fmtMl(meta)}</span>` : ''}</div>${meta ? `<div class="bar"><i style="width:${Math.min(100, tot / meta * 100)}%"></i></div>` : ''}
      <div class="exb" style="margin-top:10px">${a.rapidos.slice(0, 3).map(v => `<button class="btn" data-ag="${v}" style="padding:7px 14px">+ ${fmtMl(v)}</button>`).join('')}</div></div>`;
  };
  const cardDieta = () => {
    const rs = refDia(hoje()), t = somaItens(rs.flatMap(r => r.itens)), m = dt().metas, n = rs.length;
    return `<div class="card" style="--mc:var(--c-dieta)"><h3><span class="ci"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES.dieta}</svg></span>Dieta<a href="#" data-sa="dieta">Abrir</a></h3>${n ? `<div class="big">${Math.round(t.kcal)}<span class="mu" style="font-size:15px;font-weight:400"> kcal${m.kcal ? ' de ' + m.kcal : ''}</span></div>${m.kcal ? `<div class="bar"><i style="width:${Math.min(100, t.kcal / m.kcal * 100)}%"></i></div>` : ''}<small class="mu">P ${n1(t.prot)} g · C ${n1(t.carb)} g · G ${n1(t.gord)} g · ${n} refeição(ões)</small>` : '<div class="mu sm">Nada registrado hoje.</div>'}
      <div class="acts" style="justify-content:flex-start;margin-top:8px"><button class="btn sec" data-sa="dieta" style="padding:7px 14px">Registrar refeição</button></div></div>`;
  };
  function ligarCards(el) {
    $$('[data-ag]', el).forEach(b => b.onclick = () => addAgua(+b.dataset.ag));
    $$('[data-sa]', el).forEach(a => a.onclick = e => { e.preventDefault(); Treinos.S.area = a.dataset.sa; if (a.dataset.sa === 'dieta') S.dsub = 'diario'; S.dia = hoje(); go('treino'); });
  }

  const resumoDia = d => { const rs = refDia(d), t = somaItens(rs.flatMap(r => r.itens)); return { ...t, refeicoes: rs.length, metas: dt().metas }; };
  function abrirArea(area) { Treinos.S.area = area; if (area === 'dieta') S.dsub = 'diario'; S.dia = hoje(); go('treino'); }
  return { S, render, fab, fabLabel, imcTxt, imcInfo, energia, importarTaco, cardAgua, cardDieta, ligarCards, addAgua, importarCsv, addComuns, mlDia, fmtMl, resumoDia, abrirArea };
})();
