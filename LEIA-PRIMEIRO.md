# Comece por aqui

## Android — Firefox 142+ (desenvolvimento)

O pacote móvel fica em **instalar/firefox-android**. O painel foi adaptado para toque e telas pequenas. **Ainda não há versão assinada para instalar normalmente no celular**; o teste temporário requer um computador e conexão USB com Firefox Android/Nightly. Veja [o guia Android](docs/ANDROID.md) antes de baixar.

Opera GX/Chrome para Android não carregam este pacote como as versões de PC. As instruções de `opera://extensions`, `chrome://extensions` e `about:debugging` abaixo são para **desktop**.

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

O Opera GX usa Chromium; seu pacote usa a mesma base do Chrome/Edge. Mantenha o navegador atualizado (o manifesto exige Chromium 116+). A instalação e o consumo de recursos no Opera GX ainda precisam ser conferidos no seu computador.

Entre na Twitch/Kick **no próprio Opera GX**: o login de outro navegador não é compartilhado. Se algum chat não conectar ou parar de atualizar, confira bloqueios de conteúdo e limites de recursos do GX para aquela página.

## Depois de instalar

Entre na Twitch/Kick no mesmo navegador. Abra **Chat Leve** pelo menu de extensões, adicione um canal (por exemplo `https://kick.com/yetz`) e clique em **Iniciar** ou **Iniciar todos**. Não é necessário instalar Node, Python ou executar comandos para usar.

Na Kick, escolha **Live na menor qualidade** para abrir uma aba silenciosa e tentar a menor resolução oferecida pelo player oficial, ou **Só chat** para abrir apenas o chat. **Padrão da Kick** segue a opção geral e preserva o comportamento das instalações anteriores. Na Twitch, todos os modos de popout abrem somente o chat, inclusive os canais vindos do PokeIdle. O padrão usa a sessão deste navegador, sem configurar OAuth. Ambas ficam em segundo plano, sem novas janelas de pop-up. **Fechar todos** encerra as abas gerenciadas e conserva sua lista para abrir novamente. As abas continuam visíveis na barra do navegador; este modo não cria chats completamente invisíveis.

Clique em **Atualizar** para ver a última amostra de reprodução/resolução da Kick. Se o vídeo não iniciar, abra sua aba e clique em reproduzir. Se não conseguir ajustar automaticamente a qualidade, selecione a menor opção no player. Confira pontos e XP nas plataformas. Detalhes em [README.md](README.md).

## Atualizar uma instalação existente

Baixe o novo pacote do seu navegador e extraia em uma pasta fixa. No Opera GX/Chrome/Edge, substitua os arquivos da pasta que você já carregou e clique em **Recarregar** no cartão da extensão. Isso mantém o caminho e permite preservar os canais. No Firefox, use **Recarregar** em `about:debugging` enquanto a instalação temporária existir; após encerrar o navegador, carregue o manifesto novamente.

Se ainda houver pop-ups da versão anterior, clique em **Fechar todos** e depois em **Iniciar todos**. Não remova a extensão antes de atualizar, para evitar apagar seus dados locais.

## Versão 0.11: sincronização própria da Kick

Depois de atualizar a extensão, recarregue também a página PokeIdle. Em **Personalizar painel**, habilite **PokeIdle**, carregue os canais do jogo e confira as plataformas identificadas.

- A Twitch abre o popout de chat numa aba inativa e silenciosa, sem player ou janela de pop-up. A aba continua visível na barra do navegador.
- Os canais Kick encontrados podem abrir a live quando houver um sinal confirmado de online, com tentativa de menor qualidade disponível. Um link isolado não confirma bônus nem estado de live.
- Sessões Twitch antigas que a extensão ainda gerenciava como live são convertidas para o popout do mesmo canal. Uma aba pessoal reutilizada para outro endereço é preservada.

No bloco Kick do PokeIdle, clique em **Sincronizar Kick**. O painel aguarda a leitura dos canais e a consulta de estado antes de apresentar o resultado. A sincronização Twitch conserva seu funcionamento e seus dados. Confira a última tentativa, o estado retornado e o horário permitido para uma nova consulta caso a Kick tenha limitado o acesso.

Use **Automatizar Kick do PokeIdle** para habilitar ou desabilitar somente a participação automática Kick dessa origem. A automação geral do PokeIdle também precisa estar habilitada. Com qualquer um desses controles desligado, **Sincronizar Kick** atualiza os dados sem reativar a automação nem abrir sessões por essa origem. Sessões manuais e de outras origens são preservadas. Uma página sem canais Kick ou uma consulta indisponível não apaga a lista válida anterior.

Para monitorar canais escolhidos, habilite **Automação de lives**, selecione os canais e clique em **Salvar automação**. O padrão Twitch é popout de chat; não é necessário configurar um token. A opção avançada IRC continua disponível para quem quer chat sem nenhuma aba e tem sua própria autorização Twitch.

**Fechar todos** encerra as sessões gerenciadas e pausa novas aberturas. **Iniciar todos** ou o controle de retomada permite reiniciar. Confira [AUTOMACAO.md](docs/AUTOMACAO.md), [POKEIDLE.md](docs/POKEIDLE.md) e [INTERFACE.md](docs/INTERFACE.md).

Esta versão precisa de uma nova assinatura Mozilla para instalação Firefox permanente. O XPI antigo não cobre os arquivos novos. Use o [fluxo de assinatura](docs/ASSINATURA-MOZILLA.md); os ZIPs disponíveis continuam sendo pacotes de desenvolvimento.

## Histórico das versões anteriores

As versões 0.4 e 0.5 introduziram o player Kick e a preparação Android. A 0.6 acrescentou registros manuais, fila e horários; a 0.7 usava vídeo Twitch no modo PokeIdle. A 0.8 reorganizou o painel e a 0.9 acrescentou modos Kick por canal e IRC. A 0.10 manteve Twitch somente em chat e acrescentou os canais Kick do PokeIdle; a 0.11 dá à Kick sincronização e controle próprios. Esses comportamentos históricos não são instruções para abrir vídeo Twitch na versão atual. Os resultados de cada versão estão em [VALIDACAO.md](docs/VALIDACAO.md).
