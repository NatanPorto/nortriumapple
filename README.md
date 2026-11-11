# NORTRIUM — PWA

Versão web instalável do NORTRIUM (finanças, agenda, saúde, estudos e trabalho). Funciona offline depois da primeira visita e guarda os dados no próprio aparelho (IndexedDB).

## Publicar no GitHub Pages
1. Crie um repositório no GitHub (por exemplo `nortrium`).
2. Envie **o conteúdo desta pasta** para a raiz do repositório. O `index.html` deve ficar na raiz, ao lado de `sw.js` e `manifest.webmanifest`.
3. No repositório, abra **Settings › Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`, e salve.
4. Em alguns minutos o app abre em `https://SEU-USUARIO.github.io/nortrium/`.

## Instalar
- **Android (Chrome):** menu ⋮ › Instalar app.
- **iPhone (Safari):** Compartilhar › Adicionar à Tela de Início. Instalado, o iOS não apaga os dados por inatividade.

## Atualizar depois
Troque o número em `VERSAO`, no começo do `sw.js`, a cada publicação. Sem isso, quem já visitou continua vendo a versão antiga em cache.

## O que mudou em relação ao app Android
Removido, por depender do Android: notificações agendadas, widgets da tela inicial, relógio (Health Connect) e backup automático em Documentos.
Continuam: todas as abas, estilos visuais, modo foco, backup e restauração por arquivo, PIN, backup no Google Drive.

## Seus dados
O PWA e o app Android guardam dados separados. Para levar os dados do app: **Ajustes › Salvar backup** no app e **Restaurar / importar** no PWA.
Fontes: Inter e IBM Plex Mono (licença OFL, em `fonts/`).
