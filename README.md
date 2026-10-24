# Chat Leve — Twitch, Kick e PokeIdle

Extensão local para organizar chats Twitch, lives Kick e canais encontrados no PokeIdle. A Twitch abre somente o popout oficial de chat em uma aba inativa e silenciosa; a Kick pode abrir a live com tentativa de menor qualidade disponível. O painel reúne fila, limites, checklist de bônus e leituras manuais de XP/pontos. Não há servidor próprio ou dependências de aplicação para instalar.
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

Os canais e seus controles ficam em destaque. As opções de vídeo Kick aparecem ao selecionar Kick no cadastro e nos detalhes de cada canal. Com mais de cinco canais, busca e filtros ajudam a reduzir a lista sem interromper as sessões.

Em **Personalizar painel**, escolha os recursos que quer mostrar: PokeIdle, checklist de bônus, histórico manual de XP/pontos e automação de lives. A escolha fica salva neste navegador. Ao atualizar uma instalação que já tem registros ou uma leitura PokeIdle, o painel correspondente continua disponível. Ocultar uma seção conserva seus dados e não desativa uma automação existente.

Modo da Kick, prioridade e diagnóstico de cada canal ficam nos detalhes do próprio canal. O resumo de recompensas aparece conforme os recursos escolhidos; avisos aparecem quando há pendências. Veja [INTERFACE.md](docs/INTERFACE.md) para configurar a apresentação.

## Bônus, saldos e resgates

1. Faça login na Twitch/Kick e no PokeIdle no navegador que usará a extensão.
2. Adicione seus canais e habilite o checklist em **Personalizar painel**. Cadastre bônus com requisitos, fonte, tempo, custo em pontos, intervalo de resgate e prazo. Use também o texto de regra lido no PokeIdle como fonte para o cadastro; ele não é convertido automaticamente em bônus ou saldo.
3. Marque separadamente que **conferiu as regras** e que **cumpriu os requisitos no serviço**. Tempo com uma aba aberta aparece como estimativa e não libera um bônus sozinho.
4. No histórico, registre o saldo inicial de XP/pontos lido no serviço e uma leitura posterior. A extensão calcula variação e XP/h entre as leituras, avisa quando o saldo diminui e evita somar saldo global com saldos de canais.
5. Quando o checklist e os saldos indicarem disponibilidade, o painel pode notificar. **Conferir resgate** abre o link cadastrado; concluir a ação ocorre no site oficial. **Marcar resgatado** registra sua confirmação e inicia o cooldown. Não concede XP nem gasta pontos automaticamente. Após um resgate com custo, registre o novo saldo: o saldo anterior não é reutilizado para sugerir outro resgate.

O histórico de XP/pontos continua manual. A integração PokeIdle lê o widget de canais da página aberta no navegador; não consulta uma API de saldo nem registra XP automaticamente. Os sinais do widget, os registros locais e a reprodução não comprovam concessão de XP. Confira os saldos oficiais.

## Automação de canais

Habilite **Automação de lives** em **Personalizar painel**, escolha os canais, ative o monitoramento e clique em **Salvar automação**.

- **Twitch:** o padrão mantém somente o popout de chat em uma aba inativa e silenciosa, sem player. Usa a sessão da Twitch deste navegador e não exige token OAuth. O chat pode continuar disponível mesmo quando a transmissão está offline.
- **Kick:** um sinal confirmado de live inicia o modo escolhido para aquele canal. Offline explícito encerra somente sua participação automática. Erros e respostas desconhecidas não viram offline.
- **IRC sem nenhuma aba:** é uma opção avançada da Twitch, configurada separadamente com autorização local. O popout padrão não depende dela.

A aba de popout continua visível na barra do navegador; segundo plano não equivale a uma página completamente invisível. Nenhum caminho da automação abre o player da Twitch. Sessões Twitch antigas ainda gerenciadas como live são convertidas para o chat do mesmo canal, preservando abas pessoais já reutilizadas para outro endereço.

Pausar interrompe as consultas periódicas. **Verificar agora** atualiza os sinais manualmente sem desfazer a pausa nem reabrir sessões. Horários legados foram desativados na migração, sem apagar registros. Veja [AUTOMACAO.md](docs/AUTOMACAO.md) para detalhes e para a opção IRC.

## Canais encontrados no PokeIdle

Habilite **PokeIdle** em **Personalizar painel**, recarregue `https://pokeidle.io/app` e carregue a lista de canais. Confira a plataforma de cada entrada e habilite a automação dos canais do jogo.

A Twitch elegível usa apenas chat. Canais Kick são identificados por seus links canônicos e podem abrir a live após confirmação de online. Um link isolado identifica o canal, mas não confirma estado ou bônus. Links Kick fora de um widget com marcadores reconhecidos permanecem com estado desconhecido até uma consulta válida.

Canais Kick desta origem usam live no modo padrão; escolhas individuais explícitas de chat ou live são preservadas. A integração exige uma leitura recente do PokeIdle para novos inícios; origem fechada ou desatualizada não é tratada como offline para sessões já abertas.

O texto original das regras é preservado como informação da página, sem converter números como `+15%` e `+2,5%` em XP creditado. Remover um canal impede sua reimportação automática; adicioná-lo manualmente permite incluí-lo novamente. Consulte [POKEIDLE.md](docs/POKEIDLE.md).

## Fila, pausas e limites

- **Iniciar todos** habilita a fila; abre somente o que couber nos limites, considerando a prioridade cadastrada.
- **Fechar todos** limpa a fila, fecha as sessões gerenciadas e pausa a automação para impedir reabertura. Os canais continuam cadastrados. Retome com **Iniciar todos** ou pelo controle de retomada da automação.
- **Iniciar** individual abre apenas aquele canal e preserva uma pausa global da automação. **Fechar** individual cancela sua entrada na fila e pausa aquele canal até uma retomada explícita. Fechar uma aba manualmente também é respeitado.
- Em **Limites**, configure máximo de abas, máximo de vídeos Kick e duração por sessão. Reduzir limites devolve sessões excedentes de menor prioridade à fila. A fila avança quando uma sessão termina, respeitando os limites; um vídeo Kick à espera não bloqueia uma vaga possível para chat Twitch.
- Chats Twitch conectados por IRC não usam abas e não consomem o limite global de abas nem o limite de vídeos Kick.
- Lives Kick do PokeIdle têm preferência sobre chats Twitch exclusivos dessa origem com prioridade menor. Quando necessário, um desses chats volta à fila para liberar uma vaga; sessões manuais e prioridades superiores são preservadas. O limite de abas não é aumentado.
- Em **Automação de lives**, escolha os canais para monitorar em vez de cadastrar horários. Uma sessão manual é preservada quando a participação automática termina.
- Os alarmes consultam o estado da Kick aproximadamente a cada minuto, com o navegador em execução. Android e suspensão podem atrasar eventos. O popout Twitch mantém o chat; a opção avançada IRC pode usar os serviços oficiais de autenticação e estado da Twitch.

As abas Kick e os popouts de chat Twitch ficam em segundo plano e continuam na barra do navegador. Somente a opção avançada IRC funciona sem aba. Fechar o painel não encerra as sessões. As configurações e a fila persistem, mas processos e autenticação dependem do navegador; não se presume que sobrevivam a reinícios.

## Diagnóstico e recuperação

O painel mostra os últimos sinais locais de login, conexão, canal ao vivo, erro do vídeo e resolução, com horários. Ausência de evidência aparece como **não verificado**. `navigator.onLine=true` não é tratado como conexão ao servidor confirmada. Os marcadores de interface atuais ainda precisam ser conferidos nos sites reais.

Alertas vão para a central e, quando permitido, para notificações locais. Um problema contínuo não notifica em cada verificação. Após recuperação e nova ocorrência, pode avisar novamente. Dispense os avisos pelo painel. Saldo ou prazo próximos do fim geram lembretes conforme as informações cadastradas.

**Recuperação é opcional e vem desativada.** Quando ativada, tenta recarregar uma sessão com erro explícito de mídia/conexão até três vezes, com espera crescente. Uma pausa de vídeo sem erro não dispara recuperação. Não reabre uma aba fechada manualmente ou sessões após Fechar todos. Login e bloqueio de autoplay podem exigir ação sua.

## Chat ou live na Kick

Ao adicionar um canal Kick, escolha seu modo. Para um canal já cadastrado, abra **Opções do canal**:

| Modo | Comportamento |
| --- | --- |
| Padrão da Kick | Segue a opção geral de reprodução na Kick. Mantém a escolha das instalações anteriores. |
| Live na menor qualidade | Abre a página oficial do canal, silencia o vídeo e tenta selecionar a menor resolução numérica oferecida. |
| Só chat | Abre apenas o chat. Esse modo não comprova concessão de pontos que dependam de assistir ao vídeo. |

Alterar o modo de um canal aberto migra somente sua sessão. Um canal fechado não é iniciado por essa mudança, e **Fechar todos** continua impedindo reabertura automática. A opção geral, em **Limites de consumo e recuperação → Padrão da Kick**, vale para os canais em **Padrão da Kick**; escolhas individuais de live ou chat são mantidas. O limite de vídeos Kick conta apenas lives Kick abertas, junto do limite global de abas.

Somente a Kick recebe a automação do player. Ela tenta áudio silenciado, reprodução inline e a menor resolução numérica nos controles oficiais, com tentativas limitadas e sem um loop contínuo de cliques. A Twitch permanece em chat, inclusive quando o canal veio do PokeIdle.

O painel distingue **qualidade solicitada** de **resolução recebida**. Não cria uma variante menor que a transmitida pelo canal; diminuir CSS não reduz o stream. Se os controles não forem reconhecidos, ajuste manualmente; autoplay pode exigir abrir a aba e tocar em play. Não há benchmark de CPU/memória ou garantia de pontos. Detalhes em [KICK-VIDEO.md](docs/KICK-VIDEO.md).

## Dados e permissões

- `storage`: canais, fila, checklist, leituras manuais, registros legados, avisos, amostras, preferências e a autorização Twitch fornecida por você ficam neste navegador. O token não é retornado no estado público do painel.
- `tabs`: cria/fecha apenas abas gerenciadas e confere sua URL; preserva abas pessoais e abas reaproveitadas para outro site.
- `alarms`: monitoramento de lives e verificação periódica de limites/avisos com o navegador aberto.
- `notifications`: lembretes locais; se indisponíveis, os avisos permanecem no painel.
- Acesso a Kick/Twitch: diagnóstico restrito a abas gerenciadas; o script de player roda somente na Kick. A consulta de estado Kick identifica lives. Os scripts de página não coletam cookies, credenciais ou histórico de mensagens.
- Acesso a `id.twitch.tv` e `api.twitch.tv`: usado pela opção avançada IRC para validar a autorização e consultar lives. O popout padrão não precisa dessa credencial. O cliente IRC não envia mensagens para simular atividade.
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
python3 scripts/test-kick-modes.py
python3 scripts/test-live-automation.py
```

Edite `src/` e `manifests/`; regenere `instalar/` e `downloads/` com `npm run package`. O gerador confere distribuições e ZIPs determinísticos, com manifesto na raiz. A assinatura usa `npm run mozilla:sign`, com pré-requisitos no guia da Mozilla; os artefatos ficam em `signed/` ignorado pelo Git.

Na nuvem, use o checkout existente `/workspace/farm-pontos-twitch-kick`. Não crie Git worktree sem pedido explícito. Consulte [VALIDACAO.md](docs/VALIDACAO.md) para evidências e limites de testes, execução nativa e assinatura.
