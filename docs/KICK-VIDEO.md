# Chat ou live na Kick

A Twitch usa somente chat. Os controles de player da extensão são executados apenas em sessões Kick gerenciadas.

## Escolher o modo

Ao adicionar um canal Kick, escolha seu modo. Para um canal já cadastrado, abra **Opções do canal**:

| Modo | Comportamento |
| --- | --- |
| Padrão da Kick | Segue a opção geral do painel. |
| Live na menor qualidade | Abre o canal oficial com vídeo silencioso e tenta a menor resolução numérica oferecida. |
| Só chat | Abre o popout de chat, sem vídeo. |

O padrão geral fica em **Limites de consumo e recuperação → Padrão da Kick**. Escolhas individuais de live ou chat prevalecem. Canais Kick identificados no PokeIdle usam live no modo padrão, inclusive quando o padrão geral está em chat. Escolhas individuais explícitas de chat ou live são conservadas.

Mudar o modo de uma sessão aberta migra somente aquele canal, preservando a participação das outras origens. Uma sessão parada não é iniciada por essa alteração. Os limites globais de abas e de vídeos Kick continuam valendo; sem vaga, o canal aguarda na fila.

## Conferir a reprodução

1. Abra uma live Kick pelo painel ou aguarde um canal confirmado online pela automação.
2. Abra os detalhes do canal e compare a **qualidade solicitada** com a **resolução recebida**.
3. Se houver bloqueio de autoplay, abra a aba e toque em reproduzir uma vez.
4. Se os controles não forem reconhecidos, escolha manualmente a menor opção no menu do player.

A seleção usa somente os controles do player e menus associados a ele. Não varre botões de resolução de outras partes da página. A inicialização tem tentativas limitadas e acompanha até três substituições internas de vídeo; uma pausa do usuário é preservada.

A extensão silencia o vídeo e tenta reprodução inline. Ela não cria uma variante menor que a transmitida pelo canal e não reduz consumo apenas por diminuir o tamanho visual do player. O menu real, autoplay e variantes disponíveis podem mudar.

## Monitoramento e recursos

A automação pode abrir o modo escolhido quando o canal fica online e encerrar sua sessão automática após offline explícito. Erros e respostas desconhecidas não viram offline. A consulta ao estado da live é separada da tentativa de qualidade do player.

As abas ficam em segundo plano e continuam visíveis na barra do navegador. CPU, GPU, rede e memória dependem da página e do vídeo. Não há benchmark real de consumo ou garantia de pontos. Só chat não comprova concessão de recompensas que dependam de assistir ao vídeo.

Consulte [AUTOMACAO.md](AUTOMACAO.md) e [VALIDACAO.md](VALIDACAO.md) para configuração e evidências dos testes.
