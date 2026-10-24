# Canais Twitch e Kick do PokeIdle

A versão 0.11 identifica as plataformas pelos links carregados em `https://pokeidle.io/app`. A Twitch mantém sua sincronização e usa somente o popout de chat em segundo plano. A Kick tem sincronização própria e pode abrir a live oficial com áudio silenciado e tentativa de menor qualidade disponível.

## Usar

1. Atualize os arquivos da extensão e clique em **Recarregar**. Depois, recarregue também a página PokeIdle para iniciar o leitor novo.
2. Faça login na Twitch e na Kick neste mesmo perfil do navegador. O popout padrão da Twitch usa essa sessão e não exige configurar um token OAuth na extensão.
3. Em **Personalizar painel**, mostre **PokeIdle**. Abra o jogo e aguarde a lista de canais carregar.
4. Confira a plataforma e a origem de cada canal importado e habilite a automação dos canais do jogo.
5. Confira as abas e a fila. O padrão global é de três abas, ajustável no painel. Mais abas e vídeos usam mais recursos.

A aba de chat Twitch fica inativa e silenciosa, sem player. Ela continua visível na barra do navegador; não é uma página completamente invisível. O modo IRC sem nenhuma aba é uma opção avançada separada, descrita em [AUTOMACAO.md](AUTOMACAO.md).

## Sincronizar somente a Kick

Use **Sincronizar Kick** no bloco da plataforma. A ação aguarda a leitura dos canais Kick na página e a consulta do estado das lives antes de devolver o resultado ao painel. A lista, os sinais e a idade da leitura Twitch são preservados.

O bloco mostra a última tentativa e o resultado da sincronização, incluindo ausência de canais, origem indisponível ou espera após uma consulta limitada. Uma página incompleta não apaga uma lista Kick válida nem torna seus dados antigos recentes. Mantenha o jogo aberto e sua lista carregada para novos inícios por essa origem.

**Automatizar Kick do PokeIdle** controla apenas a participação Kick da integração. A opção geral **Automatizar canais do PokeIdle** continua valendo. Desabilitar a Kick conserva os chats Twitch, as sessões manuais e as participações de outras automações.

A sincronização manual funciona com esses controles desligados: atualiza a lista e o estado das lives sem reativar a automação nem abrir sessões por essa origem. Também respeita **Fechar todos** e as pausas de cada canal.

## O que vem da página

O leitor mantém a leitura do widget `.tw-canais` e dos links `.tw-canal` da Twitch:

| Sinal explícito | Interpretação |
| --- | --- |
| `ao-vivo` | O widget mostra o canal ao vivo. |
| `com-bonus` | O widget indica um bônus para esse canal. |
| `tw-falta-eu` | O widget marca o canal como faltante para você. |

O nome é obtido de um link HTTPS canônico da plataforma. A lista e os estados não são fixados no código. O HTML fornecido para os testes originais contém somente canais Twitch; ele não comprova como a página real apresenta todos os canais Kick.

Links canônicos da Kick presentes na página também podem identificar canais. Quando só há um link, o estado da live fica desconhecido e não se presume um bônus ou uma classificação oficial. O monitor da Kick precisa confirmar online antes de iniciar a live. Marcadores reconhecidos dentro do widget podem fornecer sinais explícitos; ausência de informação fora dele não é tratada como offline.

Canais com o mesmo nome em plataformas diferentes são tratados separadamente. Links de páginas internas, domínios parecidos, credenciais na URL e caminhos que não representam um canal são recusados.

## Quando iniciar ou encerrar

- Uma nova sessão Twitch pela origem do jogo exige os sinais do widget: ao vivo, com bônus e faltante. A sessão usa apenas chat.
- Se a marca de faltante desaparecer, um chat Twitch já aberto pode continuar. Essa mudança não registra XP nem marca um bônus como recebido.
- Um canal Kick identificado apenas pelo link aguarda uma consulta de estado confirmada. Respostas bloqueadas ou inválidas deixam o estado desconhecido.
- Um sinal explícito de offline pode encerrar a sessão exclusivamente automática. Participações manuais e abas pessoais são preservadas.
- Desativar a integração retira somente sua participação nas sessões. **Fechar todos** fecha as sessões gerenciadas e pausa novas aberturas.

Canais Kick desta origem usam live quando estão no modo padrão, inclusive se o padrão geral da Kick estiver em chat. Escolhas individuais explícitas de **Só chat** ou **Live na menor qualidade** são preservadas; confira **Opções do canal** para alterá-las. Remover um canal o exclui das próximas importações automáticas. Adicioná-lo manualmente permite incluí-lo novamente.

## Fila e atualização de instalações anteriores

A fila dá preferência às novas lives Kick sobre chats Twitch automáticos do PokeIdle com prioridade menor. Se todas as vagas estiverem ocupadas, ela pode devolver um desses chats à fila para abrir a live Kick, sem exceder o limite de abas. Sessões manuais, IRC, outras automações e chats com prioridade superior são preservados. Quando a live Kick termina, a fila pode retomar os chats Twitch.

A atualização também corrige uma configuração da versão 0.9 que desativava a origem PokeIdle ao ligar o monitoramento. Nessa situação, ela pode restaurar a integração uma vez, preservando as pausas globais e individuais. Se você desativar a integração depois, essa escolha continua sendo respeitada.

## Atualização dos sinais

Mantenha a página PokeIdle aberta, com a lista carregada. Alterações são agrupadas para reduzir trabalho, e uma leitura periódica redescobre links carregados mais tarde. Uma leitura com mais de três minutos ou uma origem fechada impede novos inícios por essa integração até receber dados recentes.

Um widget vazio, ausente ou incompleto não informa que todos os canais ficaram offline. As sessões já abertas não são fechadas apenas por falta de atualização. O navegador pode atrasar a leitura e os alarmes em segundo plano, principalmente no Android.

O monitoramento Kick reutiliza resultados de até um minuto, e consultas simultâneas compartilham o mesmo pedido, sem alterar o horário original da amostra. Uma recusa de acesso impõe cinco minutos de espera; limites de consultas respeitam o prazo informado pela Kick entre um e dez minutos; outras falhas aguardam um minuto. **Sincronizar Kick** também respeita essas esperas. O painel informa o motivo e a próxima tentativa quando disponíveis.

Uma resposta recente desconhecida prevalece sobre um marcador anterior de live: não reabre uma sessão usando aquele sinal antigo como confirmação nova.

O texto da regra do jogo é preservado como informação da origem, incluindo `+15%` e `+2,5%` quando presentes. Esses sinais não são recibos de XP. A extensão não consulta uma API de saldo do PokeIdle e não executa botões ou comandos de moderação da página. Confira o saldo e as regras reais no serviço.

Veja [KICK-VIDEO.md](KICK-VIDEO.md) para conferir reprodução e qualidade, e [VALIDACAO.md](VALIDACAO.md) para os testes efetivamente executados.
