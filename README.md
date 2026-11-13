# NORTRIUM — versão PWA

Finanças, agenda, saúde, estudos e trabalho num só lugar. Roda no navegador e pode ser instalado no celular como um app. **Seus dados ficam só no seu aparelho** (não há servidor nem conta).

## Publicar no GitHub Pages
1. Crie um repositório no GitHub (pode ser privado só se o seu plano permitir Pages; público funciona sempre).
2. Envie **todos os arquivos desta pasta** para a raiz do repositório (incluindo `.nojekyll` e as pastas `css`, `js`, `fonts`, `icons`, `img`, `video`).
3. Em **Settings → Pages**, em *Build and deployment*, escolha **Deploy from a branch**, branch `main` e pasta `/ (root)`. Salve.
4. Em 1 a 2 minutos o app estará em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## Instalar no celular
- **Android (Chrome):** abra o link, vá em **Ajustes → Aplicativo → Instalar o app** (ou menu ⋮ → *Instalar app*).
- **iPhone (Safari):** botão Compartilhar → **Adicionar à Tela de Início**.

## Levar os dados do app Android
No app Android: **Ajustes → Dados → Salvar backup**. No PWA: **Ajustes → Dados → Restaurar / importar** e escolha o arquivo. Backups do Fluxo de Caixa também são aceitos.

## O que foi removido (não funciona no navegador)
- Notificações e lembretes: *Notificações*, *Meus avisos*, *Diagnóstico*, o campo **Avisos** dos compromissos e das aulas, o cartão **Avisos** do Hoje e o lembrete de água.
- **Widgets** da tela inicial.
- **Relógio** (Health Connect) e o cartão dele no Hoje.
- Cópia automática em *Documentos/MEU APP/Backups*. No lugar, o app lembra de salvar um backup quando faz tempo (o backup manual baixa um arquivo).

Continuam funcionando: Finanças (inclusive cartões, metas, investimentos e exportação em CSV), Agenda, Saúde (Resumo, Treino, Dieta e Água), Estudos, Curso, Trabalho, temas e personalização, PIN, backup manual e backup no Google Drive (com o script que o próprio app mostra em Ajustes, se você usa).

## Cuidados
- Os dados ficam no armazenamento do navegador. Se você limpar os dados do site ou desinstalar o navegador, eles somem: **salve backups com frequência** e guarde o arquivo fora do aparelho.
- No iPhone, o Safari pode apagar dados de sites usados pouco quando o app **não** está instalado na tela inicial. Instale o app.
- O app abre sem internet depois da primeira visita. O vídeo de abertura só toca com internet (sem ele, a abertura é pulada).
- Cada endereço (usuário.github.io/repo) tem seus próprios dados. Mudar de endereço exige backup e restauração.

## Atualizar o app
Substitua os arquivos no repositório e faça o commit. Quem já tem o app instalado recebe a versão nova na abertura seguinte e vê um aviso. Se mudar muitos arquivos de uma vez, mude também o número em `CACHE` no começo do `sw.js` (por exemplo `nortrium-2`).

## Estrutura
`index.html` · `manifest.webmanifest` · `sw.js` (offline) · `js/` · `css/` · `fonts/` · `icons/` · `img/` · `video/intro.mp4` · `privacypolicy.html`
