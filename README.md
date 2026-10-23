# Chat Leve — Twitch, Kick e PokeIdle

Extensão local para organizar sessões, bônus e resgates. A Kick abre o player oficial em segundo plano e tenta a menor qualidade disponível. A Twitch cadastrada manualmente usa chat; o modo automático PokeIdle pode abrir a live Twitch com vídeo silencioso a partir dos sinais exibidos no próprio jogo. O painel reúne checklist de bônus, leituras manuais de XP/pontos, alertas, agenda e uma fila com limites de consumo. Não há servidor próprio ou dependências de aplicação para instalar.

Veja a [prévia do painel no computador](docs/imagens/painel-desktop.png), com dados de teste, e o guia de [configuração da interface](docs/INTERFACE.md).

## Instalação

Comece em **[LEIA-PRIMEIRO.md](LEIA-PRIMEIRO.md)**.

| Navegador | Pacote de desenvolvimento | Pasta no repositório |
| --- | --- | --- |
| Chrome/Edge | [chat-leve-chromium.zip](https://github.com/BronoDev/farm-pontos-twitch-kick/raw/refs/heads/main/downloads/chat-leve-chromium.zip) | `instalar/chromium/` |
| Opera GX desktop | [chat-leve-opera-gx.zip](https://github.com/BronoDev/farm-pontos-twitch-kick/raw/refs/heads/main/downloads/chat-leve-opera-gx.zip) | `instalar/opera-gx/` |
| Firefox desktop 142+ | [chat-leve-firefox.zip](https://github.com/BronoDev/farm-pontos-twitch-kick/raw/refs/heads/main/downloads/chat-leve-firefox.zip) | `instalar/firefox/` |
| Firefox Android 142+ (desenvolvimento) | [chat-leve-firefox-android.zip](https://github.com/BronoDev/farm-pontos-twitch-kick/raw/refs/heads/main/downloads/chat-leve-firefox-android.zip) | `instalar/firefox-android/` |

Chrome/Edge/Opera GX desktop: extraia o pacote, abra a página de extensões do navegador, ative **Modo do desenvolvedor** e **Carregar sem compactação**, selecionando a pasta com `manifest.json`. Firefox desktop: carregue o manifesto temporariamente por `about:debugging#/runtime/this-firefox`.

Os ZIPs são fontes de desenvolvimento sem assinatura. Para uma instalação Firefox permanente, use um **XPI da versão nova retornado pela Mozilla**. Um XPI antigo assinado não cobre código alterado. O fluxo de assinatura não listada usa uma distribuição universal para desktop e Android: [ASSINATURA-MOZILLA.md](docs/ASSINATURA-MOZILLA.md). Android requer navegador compatível e tem procedimento próprio: [ANDROID.md](docs/ANDROID.md). Opera GX/Chrome móveis não carregam esse pacote como as versões de PC.

## Painel no computador e opções configuradas

O painel tem uma visualização compacta no menu da extensão e pode ser aberto em uma aba para usar a largura disponível no computador. Em telas menores, as seções passam para uma coluna.

Os canais e seus controles ficam em destaque. As opções de vídeo Kick aparecem depois de adicionar um canal Kick. O PokeIdle começa com uma configuração curta; os detalhes de canais, regra e sincronização aparecem quando houver uma leitura da página.

Em **Personalizar painel**, escolha os recursos que quer mostrar: checklist de bônus, histórico manual de XP/pontos e agenda. A escolha fica salva neste navegador. Ao atualizar uma instalação que já tem registros, o painel correspondente continua disponível. Ocultar uma seção conserva seus dados e não desativa uma agenda existente.

Prioridade e diagnóstico de cada canal ficam nos detalhes do próprio canal. O resumo de recompensas aparece conforme os recursos escolhidos; avisos aparecem quando há pendências. Veja [INTERFACE.md](docs/INTERFACE.md) para configurar a apresentação.

## Bônus, saldos e resgates

1. Faça login na Twitch/Kick e no PokeIdle no navegador que usará a extensão.
2. Adicione seus canais e habilite o checklist em **Personalizar painel**. Cadastre bônus com requisitos, fonte, tempo, custo em pontos, intervalo de resgate e prazo. Você também pode importar as informações de bônus exibidas pelo widget PokeIdle; o projeto não preenche um catálogo inventado de regras.
3. Marque separadamente que **conferiu as regras** e que **cumpriu os requisitos no serviço**. Tempo com uma aba aberta aparece como estimativa e não libera um bônus sozinho.
4. No histórico, registre o saldo inicial de XP/pontos lido no serviço e uma leitura posterior. A extensão calcula variação e XP/h entre as leituras, avisa quando o saldo diminui e evita somar saldo global com saldos de canais.
5. Quando o checklist e os saldos indicarem disponibilidade, o painel pode notificar. **Conferir resgate** abre o link cadastrado; concluir a ação ocorre no site oficial. **Marcar resgatado** registra sua confirmação e inicia o cooldown. Não concede XP nem gasta pontos automaticamente. Após um resgate com custo, registre o novo saldo: o saldo anterior não é reutilizado para sugerir outro resgate.

O histórico de XP/pontos continua manual. A integração PokeIdle lê o widget de canais da página aberta no navegador; não consulta uma API de saldo nem registra XP automaticamente. Os sinais do widget, os registros locais e a reprodução não comprovam concessão de XP. Confira os saldos oficiais.

## Automação pelo widget PokeIdle

1. Entre no PokeIdle e mantenha aberta a página `https://pokeidle.io/app`, com o widget de canais carregado. A extensão lê somente a lista `.tw-canais` e seus canais `.tw-canal`, não credenciais ou mensagens.
2. Confira os canais e as informações de bônus importadas da interface do jogo. O texto da regra é preservado como exibido, incluindo os valores `+15%` e `+2,5%`; esses valores não são convertidos em um crédito de XP confirmado.
3. Mantenha marcada a opção **Automatizar Twitch do PokeIdle**. Para iniciar uma nova live, o canal precisa estar ao vivo (`ao-vivo`), com bônus (`com-bonus`) e marcado pelo widget como faltante para você (`tw-falta-eu`).
4. A extensão abre a página oficial Twitch com vídeo silencioso e tenta a menor qualidade disponível. O limite global vem em **três sessões simultâneas por padrão** e pode ser ajustado no painel, de 1 a 12. Os demais canais elegíveis aguardam na fila. Para abrir oito canais elegíveis de uma vez, configure o limite em pelo menos oito e não ocupe vagas com outras sessões; isso aumenta o consumo de rede, CPU/GPU e memória.
5. Se a marca de faltante desaparecer, uma live já aberta continua aberta. Isso evita interromper a sessão apenas porque o widget mudou, mas não comprova que o XP foi concedido. O sinal continua sendo o do jogo, não um recibo de saldo.

Um canal sair do ar ou perder o bônus pode encerrar a sessão que pertence exclusivamente a essa automação. Uma aba manual, uma sessão compartilhada com outro controle ou uma aba reutilizada para outra página é preservada. Desativar o modo retira somente a propriedade automática; não fecha uma sessão que ainda tem uso manual. **Fechar todos** pausa a automação para impedir que ela reabra as lives.

A aba PokeIdle precisa permanecer aberta e enviando amostras. Se ela fechar ou a última amostra ficar com mais de três minutos, a extensão deixa de iniciar novos canais por essa origem até obter dados novos. Um widget ausente/vazio não é tratado como prova de que todos ficaram offline. Alarmes e coleta podem atrasar durante suspensão do navegador, especialmente no Android.

Remover um canal importado impede sua reimportação automática. Para incluí-lo novamente, adicione o mesmo canal manualmente pelo formulário.

Veja [POKEIDLE.md](docs/POKEIDLE.md) para os sinais usados, limites e validação no seu navegador.

## Agenda, fila e limites

- **Iniciar todos** habilita a fila; abre somente o que couber nos limites, considerando a prioridade cadastrada.
- **Fechar todos** limpa a fila, fecha as abas gerenciadas e pausa a automação para impedir reabertura. Os canais continuam cadastrados. Retome com **Iniciar todos** ou **Retomar agenda**.
- **Iniciar** individual abre apenas aquele canal e preserva uma pausa global da agenda. **Fechar** individual cancela sua entrada na fila e pausa aquele canal até uma retomada explícita. Fechar uma aba manualmente também é respeitado.
- Em **Limites**, configure máximo de abas, máximo de vídeos Kick e duração por sessão. Reduzir limites devolve sessões excedentes de menor prioridade à fila. A fila avança quando uma sessão termina, respeitando os limites; um vídeo Kick à espera não bloqueia uma vaga possível para chat Twitch.
- Em **Agenda**, escolha canais e início/fim no seu horário local. A extensão abre a oportunidade no horário e fecha as sessões que pertencem a ela ao terminar. Uma aba iniciada manualmente antes da agenda é preservada. Horários sobrepostos compartilham uma sessão; enquanto existir um proprietário ativo, ela permanece.
- Os alarmes verificam a agenda aproximadamente a cada minuto, com o navegador em execução. Android/suspensão podem atrasar eventos. A agenda usa horários cadastrados. A descoberta de canais Twitch ao vivo no modo PokeIdle usa separadamente o widget aberto do jogo; não uma API externa de lives.

As abas ficam em segundo plano e continuam na barra do navegador. Fechar o painel não as encerra. As configurações e a fila persistem, mas processos e autenticação dependem do navegador; não se presume que sobrevivam a reinícios.

## Diagnóstico e recuperação

O painel mostra os últimos sinais locais de login, conexão, canal ao vivo, erro do vídeo e resolução, com horários. Ausência de evidência aparece como **não verificado**. `navigator.onLine=true` não é tratado como conexão ao servidor confirmada. Os marcadores de interface atuais ainda precisam ser conferidos nos sites reais.

Alertas vão para a central e, quando permitido, para notificações locais. Um problema contínuo não notifica em cada verificação. Após recuperação e nova ocorrência, pode avisar novamente. Dispense os avisos pelo painel. Saldo ou prazo próximos do fim geram lembretes conforme as informações cadastradas.

**Recuperação é opcional e vem desativada.** Quando ativada, tenta recarregar uma sessão com erro explícito de mídia/conexão até três vezes, com espera crescente. Uma pausa de vídeo sem erro não dispara recuperação. Não reabre uma aba fechada manualmente ou sessões após Fechar todos. Login e bloqueio de autoplay podem exigir ação sua.

## Vídeo Kick econômico

A opção de vídeo vale para canais Kick já cadastrados e vem ativada. Lives Twitch iniciadas pelo modo automático PokeIdle também usam o player oficial; os canais Twitch iniciados manualmente continuam em chat. Clique em Iniciar todos após atualizar para migrar sessões antigas. O script tenta áudio silenciado, reprodução inline e a menor resolução numérica nos controles oficiais durante uma janela limitada de inicialização. Depois relata eventos do vídeo, sem loop contínuo de cliques.

O painel distingue **qualidade solicitada** de **resolução recebida**. Não cria uma variante menor que a transmitida pelo canal; diminuir CSS não reduz o stream. Se os controles não forem reconhecidos, ajuste manualmente; autoplay pode exigir abrir a aba e tocar em play. Não há benchmark de CPU/memória ou garantia de pontos. Detalhes em [KICK-VIDEO.md](docs/KICK-VIDEO.md).

## Dados e permissões

- `storage`: canais, fila, checklist, leituras manuais, horários, avisos, amostras e preferências de apresentação ficam neste navegador.
- `tabs`: cria/fecha apenas abas gerenciadas e confere sua URL; preserva abas pessoais e abas reaproveitadas para outro site.
- `alarms`: agenda e verificação periódica de limites/avisos com o navegador aberto.
- `notifications`: lembretes locais; se indisponíveis, os avisos permanecem no painel.
- Acesso a Kick/Twitch: scripts locais de diagnóstico e player, restritos ao identificador e URL de uma aba gerenciada. Não lê cookies, credenciais ou mensagens de chat.
- Acesso a `pokeidle.io`: o script lê os links, estados e texto de regra do widget de canais em `/app`; não lê saldo, senha ou cookies. As informações ficam localmente na extensão.

Nenhum saldo ou histórico é enviado a um servidor próprio. As páginas oficiais continuam fazendo suas próprias conexões. Chaves AMO pertencem somente ao processo de assinatura, via variáveis seguras; não fazem parte da extensão.

## Desenvolvimento

```sh
npm run package
npm run check
npm test
npm run mozilla:check
```

Node.js 22+ e Python 3 bastam para os testes e pacotes; não há `npm install` de aplicação. Testes opcionais de interface usam Playwright/Chromium disponíveis no ambiente:

```sh
python3 scripts/test-player.py
python3 scripts/test-health.py
python3 scripts/test-mobile-ui.py
python3 scripts/test-dashboard.py
python3 scripts/test-desktop-ui.py
python3 scripts/test-pokeidle-reader.py
python3 scripts/test-pokeidle-dashboard.py
```

Edite `src/` e `manifests/`; regenere `instalar/` e `downloads/` com `npm run package`. O gerador confere distribuições e ZIPs determinísticos, com manifesto na raiz. A assinatura usa `npm run mozilla:sign`, com pré-requisitos no guia da Mozilla; os artefatos ficam em `signed/` ignorado pelo Git.

Na nuvem, use o checkout existente `/workspace/farm-pontos-twitch-kick`. Não crie Git worktree sem pedido explícito. Consulte [VALIDACAO.md](docs/VALIDACAO.md) para evidências e limites de testes, execução nativa e assinatura.
