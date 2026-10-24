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

Na Kick, escolha **Live na menor qualidade** para abrir uma aba silenciosa e tentar a menor resolução oferecida pelo player oficial, ou **Só chat** para abrir apenas o chat. **Padrão da Kick** segue a opção geral e preserva o comportamento das instalações anteriores. Na Twitch manual, abre o chat; a automação PokeIdle usa a live com vídeo. Ambas ficam em segundo plano, sem novas janelas de pop-up. **Fechar todos** encerra as abas gerenciadas e conserva sua lista para abrir novamente. As abas continuam visíveis na barra do navegador; este modo não cria chats completamente invisíveis.

Clique em **Atualizar** para ver a última amostra de reprodução/resolução da Kick. Se o vídeo não iniciar, abra sua aba e clique em reproduzir. Se não conseguir ajustar automaticamente a qualidade, selecione a menor opção no player. Confira pontos e XP nas plataformas. Detalhes em [README.md](README.md).

## Atualizar uma instalação existente

Baixe o novo pacote do seu navegador e extraia em uma pasta fixa. No Opera GX/Chrome/Edge, substitua os arquivos da pasta que você já carregou e clique em **Recarregar** no cartão da extensão. Isso mantém o caminho e permite preservar os canais. No Firefox, use **Recarregar** em `about:debugging` enquanto a instalação temporária existir; após encerrar o navegador, carregue o manifesto novamente.

Se ainda houver pop-ups da versão anterior, clique em **Fechar todos** e depois em **Iniciar todos**. Não remova a extensão antes de atualizar, para evitar apagar seus dados locais.

## Atualização 0.4: vídeo da Kick

Esta versão precisa de acesso às páginas `kick.com` para executar o controle local do player. Após recarregar, autorize esse acesso no navegador quando solicitado; depois clique em **Iniciar todos** para migrar os canais Kick existentes. **Fechar todos** continua encerrando também as lives. Você pode desmarcar a opção de vídeo para voltar ao modo de chat.

A qualidade automática depende dos controles oferecidos pela Kick e ainda requer validação no site real. O player não reproduz uma resolução menor do que as variantes transmitidas pelo canal. Vídeo em segundo plano pode exigir um primeiro clique manual para iniciar. Detalhes em [docs/KICK-VIDEO.md](docs/KICK-VIDEO.md).

## Versão 0.6: bônus, agenda e assinatura nova

O painel agora inclui checklist de bônus, histórico **manual** de XP/pontos, avisos, links de resgate, agenda e limites com fila. Cadastre as regras conferidas, registre os saldos no serviço e use o resumo para escolher os próximos passos. O aplicativo não resgata recompensas automaticamente nem consulta uma API de XP.

Ao atualizar, autorize as novas permissões de alarmes, notificações e acesso às páginas Twitch quando solicitado. **Fechar todos** também pausa a agenda; clique em **Retomar agenda** ou **Iniciar todos** para voltar à automação. Veja o [README](README.md) para usar os controles.

Mesmo que você tenha um XPI assinado da versão anterior, os arquivos novos precisam de outra assinatura. O fluxo preparado usa sua conta AMO e as variáveis seguras `WEB_EXT_API_KEY` e `WEB_EXT_API_SECRET`. Leia [ASSINATURA-MOZILLA.md](docs/ASSINATURA-MOZILLA.md). Os ZIPs deste repositório continuam sendo pacotes de desenvolvimento; só um XPI efetivamente retornado e validado pelo Firefox é uma instalação assinada.

## Versão 0.7: widget PokeIdle e lives Twitch automáticas

Após atualizar e recarregar a extensão, autorize o acesso a `pokeidle.io` quando solicitado. Entre em `https://pokeidle.io/app` e mantenha a aba aberta com o widget de canais carregado. No painel, confira a importação dos canais e das regras exibidas pelo jogo e ative a automação PokeIdle.

Uma nova live só entra na fila quando o widget a mostra ao vivo, com bônus e faltante para você. O limite global começa em três sessões simultâneas e pode ser alterado no painel, de 1 a 12; as demais aguardam na fila. Para oito canais elegíveis juntos, defina pelo menos oito vagas, sem outras sessões ocupando-as, considerando o maior consumo. Elas usam vídeo Twitch silencioso com tentativa de menor qualidade. A Twitch iniciada manualmente continua apenas no chat.

Quando a marca de faltante desaparecer, a live já aberta continua. O aplicativo não interpreta isso como XP confirmado. Se o canal sair do ar ou perder o bônus, ele encerra somente a sessão exclusivamente automática. Abas com uso manual são preservadas ao desativar o modo. **Fechar todos** pausa a automação; a aba PokeIdle fechada ou sem amostra recente por três minutos impede novos inícios por essa origem.

O texto original do bônus (incluindo `+15%` e `+2,5%`) é mostrado sem converter esses números em XP recebido. O saldo continua precisando de conferência no serviço. Saiba mais em [docs/POKEIDLE.md](docs/POKEIDLE.md).

A versão 0.7 precisa de **uma nova assinatura Firefox**. As chaves AMO continuavam ausentes na última conferência do ambiente, e nenhum XPI desta versão foi assinado aqui. O pacote assinado antigo não cobre esses arquivos novos; use o [fluxo de assinatura](docs/ASSINATURA-MOZILLA.md).

## Versão 0.8: painel adaptado ao computador

Atualize na mesma pasta e recarregue a extensão. O painel pode ser aberto em uma aba para usar o espaço da tela do PC; a visualização compacta continua disponível no menu da extensão.

Comece adicionando seus canais ou conectando o PokeIdle. As opções Kick aparecem ao cadastrar um canal Kick. A integração PokeIdle mostra os detalhes depois de receber uma leitura da lista do jogo.

Em **Personalizar painel**, habilite o checklist de bônus, o histórico manual e a agenda conforme precisar. Se você já tinha dados de uma versão anterior, a seção correspondente continua disponível. As preferências ficam salvas neste navegador. Ocultar um painel não apaga registros nem encerra uma agenda; use os controles da agenda ou **Fechar todos** para pausar a automação.

Para ver prioridade ou diagnóstico, abra os detalhes do canal. Mais informações em [docs/INTERFACE.md](docs/INTERFACE.md). Esta versão também requer assinatura Mozilla nova para instalação Firefox permanente; os ZIPs continuam sendo pacotes de desenvolvimento.

## Versão 0.9: Kick por canal e automação de lives

Depois de atualizar e recarregar, autorize o acesso aos serviços oficiais de autenticação e estado das lives Twitch quando o navegador solicitar. A autorização de conta é configurada separadamente no campo local de conexão.

Ao adicionar um canal Kick, escolha entre seguir o padrão, abrir a live na menor qualidade ou usar somente o chat. Depois, você pode alterar essa escolha em **Opções do canal**. Mudar o modo de uma sessão aberta afeta somente aquele canal; canais fechados e a pausa de **Fechar todos** são preservados.

O padrão geral da Kick continua disponível para canais sem escolha individual. O limite de vídeos Kick conta somente as lives Kick abertas. Se não houver vaga, a sessão aguarda na fila. A tentativa de qualidade usa as opções realmente oferecidas pelo canal; não cria uma resolução menor nem garante pontos. Confira a resolução recebida nos detalhes do canal. Saiba mais em [docs/KICK-VIDEO.md](docs/KICK-VIDEO.md).

O PokeIdle também pode ser mostrado em **Personalizar painel**. Em uma instalação nova ele fica oculto até sua escolha; uma integração já usada continua disponível na atualização. Ocultar seu painel não desativa a automação. Busca e filtros aparecem quando a lista passa de cinco canais e alteram somente a apresentação.

O cadastro de horários dá lugar à **Automação de lives**. Habilite seu painel, selecione os canais, ative o monitoramento e clique em **Salvar automação**. Ele inicia as sessões quando o serviço confirma uma live e encerra somente sua participação automática após offline explícito. Respostas bloqueadas ou desconhecidas não são tratadas como offline.

Para conectar a Twitch sem abrir uma aba, use seu próprio token OAuth com `chat:read`, inserido somente no campo de conexão da extensão. O chat não reproduz vídeo e não comprova ganho de pontos ou XP. Os horários legados são desativados na primeira leitura após a atualização, sem apagar os dados. Ativar o novo modo desativa a abertura automática pelo widget PokeIdle e impede reabilitá-la enquanto o monitor estiver ativo; desligá-lo não reativa esses modos anteriores. Leia [docs/AUTOMACAO.md](docs/AUTOMACAO.md) para autorizar sua conta e conferir os estados da conexão.
