# NORTRIUM – versão PWA (iPhone)

## Publicar no GitHub Pages (grátis, pelo Windows)
1. Crie uma conta em github.com e um repositório **público** (ex.: `meuapp`). O repositório só guarda o código do app; seus dados ficam apenas no celular.
2. No repositório: **Add file > Upload files**, arraste TODO o conteúdo desta pasta (index.html, sw.js, manifest.webmanifest, css, js, img, icons) e faça o commit.
   Dica: o arquivo `.nojekyll` pode estar oculto no Windows; se não subir, crie um arquivo vazio com esse nome (Add file > Create new file).
3. **Settings > Pages > Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, pasta `/ (root)`. Salve.
4. Em 1 a 2 minutos o endereço aparece: `https://SEU-USUARIO.github.io/meuapp/`

## Instalar no iPhone
1. Abra o endereço no **Safari** (precisa ser o Safari).
2. Compartilhar > **Adicionar à Tela de Início**.
3. Abra pelo ícone novo. Os dados do app instalado são separados dos do Safari.

## Levar os dados do Android
No app Android: Ajustes > fazer backup (arquivo .json). Envie o arquivo para o iPhone (Arquivos/iCloud/WhatsApp) e, no app da tela inicial, use Ajustes (ou Mais) > importar backup.

## Atualizar o app
Altere os arquivos no GitHub e troque `VERSAO` em `sw.js` (ex.: meuapp-v2). O app se atualiza ao abrir com internet.

## Diferenças na versão iPhone
- Sem widgets de tela inicial e sem lembretes agendados com o app fechado.
- Backup: usa a folha de compartilhamento (Salvar em Arquivos). Não há backup automático; o app avisa quando passar de 7 dias.
- Faça backup de vez em quando: o iOS pode apagar os dados de um app web se faltar espaço.
