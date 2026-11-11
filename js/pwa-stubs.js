'use strict';
/* PWA: recursos que dependem do Android (notificações agendadas, widgets, Health Connect) foram removidos.
   Este stub só mantém funcionando os pontos do código que ainda chamam o antigo módulo Notif. */
const Notif = {
  init() {}, avisosDeHoje: () => [], avisosTela() {}, tela() {}, diagnostico() {},
  padraoPara: () => null, resumo: () => '',
  editor: (el, inicial) => ({ setComHora() {}, get: () => inicial || [] }),
  campoAvisos: ini => ({ html: '', ligar() {}, atualizar() {}, get: () => (ini === undefined ? null : ini) })
};
