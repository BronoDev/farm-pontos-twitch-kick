# Automação pelo estado das lives

A automação de lives substitui o cadastro de horários no painel da versão 0.9. Você escolhe os canais, e a extensão consulta seus estados enquanto o navegador estiver disponível. Não é necessário prever o horário de início ou manter a página PokeIdle aberta para esse modo.

## Configurar

1. Adicione os canais Twitch e Kick que quer acompanhar. Para cada canal Kick, escolha se deseja abrir a live com tentativa de menor qualidade ou apenas o chat.
2. Em **Personalizar painel**, mostre **Automação de lives**.
3. Selecione os canais, habilite a automação e clique em **Salvar automação**. O modo começa desativado em uma instalação nova.
4. Confira o último estado recebido e seu horário. Um estado desconhecido não é interpretado como offline.
5. Para a Twitch sem aba, conecte sua conta conforme a seção abaixo. Esse modo usa o chat oficial, sem player ou janela da Twitch.

Um canal confirmado ao vivo pode iniciar uma sessão conforme suas escolhas e limites. Um novo sinal explícito de offline encerra somente a participação dessa automação; uma sessão que também foi iniciada manualmente é preservada. Respostas de erro, bloqueio, limite de requisições ou conteúdo inválido deixam o estado desconhecido: não abrem novas sessões e não fecham as existentes por presumir offline.

**Fechar todos** fecha as sessões gerenciadas, encerra os chats gerenciados e pausa a automação. Uma nova consulta não desfaz essa pausa. Iniciar um canal individualmente não retoma todos os outros.

Enquanto a automação está pausada, as consultas periódicas de estado também param. Retomar permite consultar os canais novamente. **Verificar agora** solicita uma consulta manual mesmo durante a pausa, sem autorizar reabertura das sessões.

## Twitch sem aba

O modo de chat conecta sua própria conta ao IRC oficial da Twitch por WebSocket. Para isso, a extensão precisa de um token de acesso de usuário com a permissão `chat:read`.

1. Use o fluxo OAuth oficial de um aplicativo Twitch registrado por você. Consulte a [documentação de autenticação da Twitch](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/) e solicite somente o escopo `chat:read` para essa função.
2. Insira o token no campo de senha da conexão Twitch, dentro da extensão. Não envie o token no chat, em arquivos do projeto ou em comentários do GitHub. O aplicativo não precisa do segredo do cliente OAuth.
3. A extensão consulta o endpoint oficial de validação para obter a conta, o aplicativo emissor e as permissões. O identificador do cliente é lido dessa resposta; não é necessário digitá-lo separadamente.
4. Confira os estados de autenticação, conexão e entrada no canal. Uma conexão aberta não é apresentada como entrada confirmada antes da resposta do servidor.

O token fica no armazenamento local da extensão e não é devolvido como parte do estado público do painel. Ele é usado apenas com os serviços oficiais de autenticação, estado das transmissões e chat da Twitch. Não há sincronização da credencial com um servidor próprio. Você pode remover a conexão no painel e revogar a autorização na Twitch quando quiser.

O cliente usa autenticação e comandos de entrada/saída e manutenção da conexão. Não envia mensagens de chat para fingir atividade. Um token expirado, revogado ou sem a permissão necessária exige reconectar com uma credencial válida.

Entrar no chat não equivale a assistir ao vídeo. Não há confirmação de que a Twitch concederá pontos de canal, nem de que um bot externo concederá XP por essa conexão. Confira as regras e o saldo no serviço correspondente.

## Kick e qualidade do vídeo

O estado de um canal Kick é consultado no serviço da própria Kick. Quando o canal selecionado está ao vivo, a automação segue o modo escolhido para ele. **Live na menor qualidade** usa a página oficial com vídeo silencioso e tenta a menor variante numérica oferecida; **Só chat** usa apenas o chat. O padrão geral vale somente para os canais que o seguem.

As lives Kick continuam usando abas do navegador e recursos de vídeo. A extensão não cria uma resolução menor que a oferecida pelo canal. Login, autoplay e qualidade podem exigir abrir a aba uma vez. Consulte [KICK-VIDEO.md](KICK-VIDEO.md).

## Atualização de instalações anteriores

Na primeira leitura da versão 0.9, os horários legados são desativados sem apagar seus registros. Eles não continuam executando ocultos após a atualização, já que a configuração de horários foi substituída no painel.

Ao habilitar a automação de lives, a extensão também desativa a automação que abria vídeos pelo widget PokeIdle. Esse modo anterior não pode ser reativado enquanto o novo monitoramento estiver habilitado. Isso evita que as duas origens controlem a Twitch de formas concorrentes.

Desligar a automação de lives não reativa os horários nem o modo PokeIdle automaticamente. Os registros anteriores não são apagados. O PokeIdle ainda pode ser usado como fonte de canais e regras, mas sua aba e seu widget não são necessários para o novo monitoramento.

## Navegador e limites práticos

As consultas usam alarmes do navegador, aproximadamente a cada minuto quando ele está disponível. Não há serviço independente do navegador. Fechá-lo, suspender o computador ou aplicar economia de energia pode atrasar verificações e interromper o chat.

O limite global de abas e o limite de vídeos Kick contam sessões que usam abas. Os canais Twitch conectados por IRC não consomem essas vagas; eles usam a conexão de chat, seus limites de serviço e a seleção configurada.

O pacote Chromium exige versão 116 ou mais recente, incluindo a base usada pelo Opera GX. O WebSocket pode manter o service worker ativo em condições compatíveis, mas não impede suspensão do navegador ou do sistema. No Firefox Android, bloquear a tela ou trocar de aplicativo também pode suspender a conexão; a extensão não mantém o aparelho acordado.

Falhas de API, mudança da estrutura das respostas e limites de acesso podem deixar um canal sem estado conhecido. Novos inícios precisam de um sinal de live recente, com até três minutos. Os horários exibidos ajudam a conferir essa idade. Um player ativo, um sinal de live ou uma entrada no chat não comprova pontos ou XP recebidos. Leia [VALIDACAO.md](VALIDACAO.md) para os testes efetivamente executados e seus limites.
