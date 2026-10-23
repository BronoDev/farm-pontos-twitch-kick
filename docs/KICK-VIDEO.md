# Live Kick com vídeo econômico

## Como usar

1. Atualize a extensão na mesma pasta já instalada e clique em Recarregar. Autorize o acesso à Kick quando o navegador solicitar.
2. Entre na sua conta da Kick no mesmo navegador.
3. Mantenha marcada **Kick: reproduzir live e tentar a menor qualidade disponível** e clique em **Iniciar todos**. Canais Kick já cadastrados também usam esse modo; a Twitch continua com chat.
4. Abra uma aba Kick uma vez e confira se está reproduzindo; pode ser necessário clicar em play para liberar autoplay. Abra as configurações do player e confira a qualidade.
5. Volte ao painel e clique em **Atualizar**. Compare o estado de reprodução, a menor opção solicitada e a resolução recebida, com o horário da amostra. O painel não atualiza esses valores continuamente.
6. **Fechar todos** encerra também as abas de vídeo e mantém a lista. Desmarcar o modo de vídeo reinicia as sessões Kick abertas como chat apenas.

## O que o script tenta fazer

O script roda nas páginas Kick, mas só atua quando o controlador confirma o identificador de uma aba gerenciada e sua URL exata. Ele silencia o elemento de vídeo e tenta `play()` uma vez por elemento encontrado. Durante a inicialização, faz um número limitado de tentativas de reconhecer controles de Settings/Quality ou Configurações/Qualidade e selecionar a menor resolução numérica disponível, como 160p. Não seleciona modo de áudio apenas. Não mantém um loop de cliques nem força reprodução após uma pausa do usuário.

As tentativas terminam após encontrar uma opção ou após cerca de 36 segundos. Depois disso, o script apenas relata eventos do vídeo (reprodução, pausa, metadados, mudança de resolução, erro), com agrupamento de mensagens. Ele não acompanha substituições tardias do player, não recupera automaticamente um canal que entra ao vivo horas depois e para de atuar se você navegar para outra URL.

O código não altera playlists, limites da plataforma, anúncios, DRM, API privada, visibilidade da página ou contagem de audiência. Ele também não deixa de carregar quadros para simular vídeo ativo. A transmissão continua sendo a oficial.

## O que não dá para garantir

- **Resolução abaixo da oferecida:** se o canal só oferece 360p, o script não consegue criar uma variante de 144p ou 1p. Diminuir o tamanho visual do vídeo não reduz o download nem a decodificação.
- **Qualidade selecionada:** o script reconhece um conjunto de controles por rótulos e funções de acessibilidade. Uma mudança no site pode impedir o ajuste. Nesse caso, escolha a menor opção manualmente.
- **Reprodução em segundo plano:** autoplay, visibilidade, suspensão de abas e políticas da Kick podem interromper ou adiar a reprodução. Abra a aba e confira o vídeo, sem assumir que uma aba existente significa reprodução.
- **Pontos:** player ativo e baixa qualidade não comprovam acúmulo de pontos. Compare seu saldo oficial antes e depois do intervalo de concessão.
- **Consumo mínimo medido:** não foi feito benchmark. Cada vídeo exige rede, CPU/GPU e memória; abrir vários canais aumenta o consumo.

A automação de qualidade passou em testes de DOM com player simulado. A Kick real está bloqueada pelo proxy da nuvem, então a seleção automática no site atual, a reprodução autenticada e os pontos precisam ser validados localmente.
