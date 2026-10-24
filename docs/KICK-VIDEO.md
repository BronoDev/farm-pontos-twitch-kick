# Escolher chat ou live na Kick

## Como usar

1. Atualize a extensão na mesma pasta já instalada e clique em Recarregar. Autorize o acesso à Kick quando o navegador solicitar.
2. Entre na sua conta da Kick no mesmo navegador.
3. Ao adicionar um canal Kick, escolha **Live na menor qualidade**. Para um canal já cadastrado, escolha o modo em **Opções do canal**. Clique em **Iniciar** no canal ou **Iniciar todos** para iniciar as sessões, respeitando seus limites.
4. Abra uma aba Kick uma vez e confira se está reproduzindo; pode ser necessário clicar em play para liberar autoplay. Abra as configurações do player e confira a qualidade.
5. Volte ao painel e clique em **Atualizar**. Compare a resolução recebida com a menor opção solicitada nos detalhes do canal, incluindo o horário da amostra. Esses valores não são uma medição de consumo ou um recibo de pontos.
6. **Fechar todos** encerra também as abas de vídeo e mantém a lista. Escolha **Só chat** no canal para usar apenas o chat. Alterar o modo migra somente sua sessão aberta e não inicia um canal fechado.

## Padrão geral e escolhas individuais

Cada canal Kick pode usar um destes modos:

| Escolha | Uso |
| --- | --- |
| Padrão da Kick | Segue a opção geral de reprodução. Canais de versões anteriores continuam com seu comportamento anterior. |
| Live na menor qualidade | Usa a página oficial do canal com vídeo silencioso e tentativa da menor resolução oferecida. |
| Só chat | Usa apenas o chat, sem automação de vídeo. |

A opção geral de reprodução fica em **Limites de consumo e recuperação → Reprodução na Kick** e só altera os canais em **Padrão da Kick**. Canais com uma escolha individual de live ou chat são preservados. Se a mudança de um canal aberto precisar de uma vaga de vídeo indisponível, a sessão entra na fila. O máximo de vídeos Kick conta apenas lives Kick; chats Kick e lives Twitch continuam sujeitos ao limite global de abas.

A escolha do modo não desfaz uma pausa ou inicia um canal fechado. O controle **Fechar todos** mantém sua função de fechar sessões gerenciadas e pausar a automação. O modo chat não comprova recebimento de pontos cujo requisito seja assistir à live.

## O que o script tenta fazer

O script roda nas páginas Kick e Twitch, mas só atua quando o controlador confirma uma sessão gerenciada em modo de vídeo, o identificador da aba e sua URL exata. A Twitch manual em modo de chat não recebe essa automação de player. Ele silencia o elemento de vídeo, tenta iniciar reprodução inline e procura a menor resolução numérica nos controles oficiais, como 160p quando essa variante existe. Não seleciona modo de áudio apenas. As tentativas são limitadas, sem um loop contínuo de cliques ou reprodução forçada após uma pausa do usuário.

O painel recebe eventos de reprodução, pausa, metadados, mudança de resolução e erro, com agrupamento de mensagens. A busca de controles fica no contêiner do player e nos menus associados; opções de qualidade que pertencem a outra parte da página são ignoradas.

Após identificar o player, o script acompanha trocas do elemento de vídeo dentro desse contêiner, com limite de três reinicializações adicionais por documento. Não observa o site inteiro nem acompanha uma substituição do contêiner completo. Uma pausa detectada é preservada entre trocas de vídeo. Mudanças na estrutura do site ainda podem impedir o ajuste de qualidade.

O script de player não consulta se uma live começou; essa descoberta pertence à [automação de lives](AUTOMACAO.md). O controle do player para ao sair da URL gerenciada.

O código não altera playlists, limites da plataforma, anúncios, DRM, API privada, visibilidade da página ou contagem de audiência. Ele também não deixa de carregar quadros para simular vídeo ativo. A transmissão continua sendo a oficial.

## O que não dá para garantir

- **Resolução abaixo da oferecida:** se o canal só oferece 360p, o script não consegue criar uma variante de 144p ou 1p. Diminuir o tamanho visual do vídeo não reduz o download nem a decodificação.
- **Qualidade selecionada:** o script reconhece um conjunto de controles por rótulos e funções de acessibilidade. Uma mudança no site pode impedir o ajuste. Nesse caso, escolha a menor opção manualmente.
- **Reprodução em segundo plano:** autoplay, visibilidade, suspensão de abas e políticas da Kick podem interromper ou adiar a reprodução. Abra a aba e confira o vídeo, sem assumir que uma aba existente significa reprodução.
- **Pontos:** player ativo e baixa qualidade não comprovam acúmulo de pontos. Compare seu saldo oficial antes e depois do intervalo de concessão.
- **Consumo mínimo medido:** não foi feito benchmark. Cada vídeo exige rede, CPU/GPU e memória; abrir vários canais aumenta o consumo.

A automação de qualidade passou em testes de DOM com player simulado. A Kick real está bloqueada pelo proxy da nuvem, então a seleção automática no site atual, a reprodução autenticada e os pontos precisam ser validados localmente.

## Twitch pelo PokeIdle (0.7)

As lives Twitch do modo automático PokeIdle usam o player oficial, áudio silenciado, tentativa de reprodução inline e ajuste para a menor resolução numérica reconhecida nos controles. A exigência de iniciar é dada pelo widget PokeIdle: ao vivo, com bônus e faltante. A extensão não falsifica presença, não usa modo de áudio como se fosse vídeo e não garante crédito de XP.

Os limites de autoplay, suspensão, opções de qualidade e mudança de interface descritos acima também valem para Twitch. A seleção no site real continua exigindo validação local. Consulte [POKEIDLE.md](POKEIDLE.md) para a propriedade das sessões e quando elas permanecem abertas ou encerram.
