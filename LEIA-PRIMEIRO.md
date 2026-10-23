# Comece por aqui

## Firefox 142 ou mais recente

1. Baixe e extraia [o pacote Firefox](https://github.com/BronoDev/farm-pontos-twitch-kick/raw/refs/heads/main/downloads/chat-leve-firefox.zip).
2. Abra `about:debugging#/runtime/this-firefox` no Firefox.
3. Clique em **Carregar extensão temporária…**.
4. Selecione o arquivo **manifest.json** da pasta extraída.

Se você baixou o repositório completo em **Code → Download ZIP**, o arquivo correto é **instalar/firefox/manifest.json**.

**Não arraste o ZIP para o Firefox e não use “Instalar extensão de um arquivo”.** Esta versão ainda não tem assinatura da Mozilla; a instalação comum pode mostrar “extensão danificada” ou uma mensagem de verificação. O modo temporário é o caminho de desenvolvimento suportado e remove a extensão ao encerrar o Firefox. Dados locais da extensão temporária podem ser perdidos; mantenha sua lista de canais anotada.

Para instalação permanente no Firefox comum, o pacote precisa ser submetido ao Mozilla Add-ons (inclusive como não listado) e assinado. Nenhum `.xpi` assinado está disponível neste projeto ainda. Não é preciso desativar a verificação de assinatura.

## Chrome ou Edge

1. Baixe e extraia [o pacote Chromium](https://github.com/BronoDev/farm-pontos-twitch-kick/raw/refs/heads/main/downloads/chat-leve-chromium.zip).
2. Abra `chrome://extensions` ou `edge://extensions`.
3. Ative **Modo do desenvolvedor**, clique em **Carregar sem compactação** e escolha a pasta extraída que contém `manifest.json`.

No ZIP do repositório completo, selecione a pasta **instalar/chromium**.

## Opera GX

1. Baixe e extraia [o pacote Opera GX](https://github.com/BronoDev/farm-pontos-twitch-kick/raw/refs/heads/main/downloads/chat-leve-opera-gx.zip).
2. Abra `opera://extensions` no Opera GX atualizado.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** (ou **Load unpacked**) e escolha a pasta extraída que contém `manifest.json`.

Se você baixou o repositório completo, selecione a pasta **instalar/opera-gx**. O Opera GX espera a pasta extraída.

O Opera GX usa Chromium; seu pacote usa a mesma base do Chrome/Edge. Mantenha o navegador atualizado (o manifesto exige Chromium 109+). A instalação e o consumo de recursos no Opera GX ainda precisam ser conferidos no seu computador.

Entre na Twitch/Kick **no próprio Opera GX**: o login de outro navegador não é compartilhado. Se algum chat não conectar ou parar de atualizar, confira bloqueios de conteúdo e limites de recursos do GX para aquela página.

## Depois de instalar

Entre na Twitch/Kick no mesmo navegador. Abra **Chat Leve** pelo menu de extensões, adicione um canal (por exemplo `https://kick.com/yetz`) e clique em **Abrir chat**. Não é necessário instalar Node, Python ou executar comandos para usar.

O status indica a janela aberta; confira pontos e XP nas plataformas. Detalhes em [README.md](README.md).
