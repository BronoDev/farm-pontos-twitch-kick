# Widget PokeIdle e lives Twitch automáticas

A versão 0.7 lê a lista de canais apresentada pelo próprio PokeIdle em `https://pokeidle.io/app`. Essa integração usa a interface carregada no seu navegador. Ela não consulta uma API de saldo, não acessa sua senha e não confirma XP concedido no servidor.

## Usar

1. Atualize a extensão na mesma pasta e clique em Recarregar. Autorize o acesso a `pokeidle.io` quando solicitado. No Firefox, os arquivos novos exigem uma assinatura nova para distribuição permanente.
2. Entre no PokeIdle e mantenha a aba `/app` aberta, com o widget de canais carregado. Entre também na Twitch nesse mesmo perfil do navegador.
3. Abra o painel da extensão e confira as informações importadas do widget. O texto de regra exibido pelo jogo é preservado, incluindo os valores `+15%` e `+2,5%`. Esses números não são apresentados como XP creditado pela extensão.
4. Mantenha marcada **Automatizar Twitch do PokeIdle**. Uma nova sessão exige os três sinais juntos: canal ao vivo, com bônus e faltante para você.
5. Confira a fila e a reprodução das lives abertas. O limite global começa em três sessões simultâneas por padrão e pode ser ajustado no painel, de 1 a 12. As demais sessões elegíveis aguardam na fila. Para abrir oito canais elegíveis juntos, reserve ao menos oito vagas sem outras sessões ocupando-as; abrir mais vídeos aumenta o consumo de rede, CPU/GPU e memória. Autoplay pode exigir abrir a aba e tocar em reproduzir uma vez.
6. **Fechar todos** encerra as sessões gerenciadas e pausa a automação, impedindo a reabertura automática até você retomar.

As lives Twitch iniciadas por esse modo usam a página oficial do canal com vídeo silencioso e tentativa de menor qualidade nos controles do player. A Twitch adicionada/iniciada manualmente permanece no chat. Kick mantém seu controle de vídeo próprio.

## Informações lidas

O script observa os elementos `.tw-canais` e os links `.tw-canal`. Ele extrai o nome do canal a partir de links HTTPS da Twitch e estes sinais de interface:

| Classe no widget | Uso na extensão |
| --- | --- |
| `ao-vivo` | O widget está mostrando o canal ao vivo. |
| `com-bonus` | O widget está mostrando uma oportunidade de bônus. |
| `tw-falta-eu` | O widget está indicando que o canal ainda falta para você. |

A origem das informações é exibida como o widget PokeIdle. As regras de bônus importadas conservam a fonte e o texto disponível; não geram automaticamente uma leitura de saldo ou uma confirmação de requisitos cumpridos.

Uma classe de interface não é recibo de XP. O jogo pode atualizar os sinais por motivos que não estão expostos à extensão. Confira o saldo e as regras reais no serviço.

## Quando manter ou fechar

- Uma nova live precisa estar ao vivo, com bônus e faltante para entrar na automação.
- Se apenas a marca de faltante desaparecer, uma sessão já aberta **continua aberta**. Essa permanência não registra XP nem marca o bônus como recebido.
- Um sinal novo de offline ou de bônus removido retira a sessão dessa automação. O fechamento só ocorre quando ela pertence exclusivamente a esse modo.
- Abas iniciadas manualmente, sessões compartilhadas com outra origem e abas reutilizadas para outra página não são fechadas como se fossem exclusivamente do PokeIdle.
- Desativar o modo retira sua propriedade automática; sessões que ainda têm uso manual são preservadas.
- **Fechar todos** é uma pausa explícita da automação. Ela não deve desfazer essa escolha reabrindo canais por conta própria.

Remover um canal importado o deixa excluído das próximas importações automáticas. Para reabilitá-lo, adicione manualmente o mesmo canal pelo formulário.

## Atualização e validade dos sinais

A aba PokeIdle precisa permanecer aberta e com o widget carregado. A extensão agrupa alterações da interface para evitar trabalho a cada pequena mudança, e mantém amostras periódicas enquanto a aba está ativa para o navegador. Se a última amostra tiver mais de três minutos ou a aba de origem fechar, ela deixa de iniciar novos canais por essa origem até receber dados recentes.

Um widget ausente, vazio, incompleto ou sem amostra nova não é tratado como evidência de que todos os canais ficaram offline. Isso também não comprova que continuam ao vivo. O painel deve ser usado para conferir a idade das informações.

O navegador pode atrasar coleta, alarmes e reprodução em segundo plano. No Android, trocar de app, bloquear a tela ou economizar bateria pode suspender a aba PokeIdle e os vídeos. Não há serviço nativo ou bloqueio de suspensão para garantir execução contínua.

## O que ainda precisa ser validado

As classes e o texto do widget podem mudar. A reprodução e o ajuste de qualidade dependem dos controles reais da Twitch. Sinais importados, uma aba aberta e vídeo ativo não comprovam que o serviço concedeu XP. Compare os saldos antes e depois do intervalo de bônus, com sua sessão real conectada.

Veja [VALIDACAO.md](VALIDACAO.md) para os testes efetivamente executados e seus limites. As leituras manuais de saldo e o checklist continuam disponíveis como conferência independente do widget.
