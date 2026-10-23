# Chat Leve — Twitch, Kick e PokeIdle

Extensão local para organizar sessões, bônus e resgates. A Kick abre o player oficial em segundo plano e tenta a menor qualidade disponível; a Twitch usa chat. O painel reúne checklist de bônus, leituras manuais de XP/pontos, alertas, agenda e uma fila com limites de consumo. Não há servidor próprio ou dependências de aplicação para instalar.

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

## Bônus, saldos e resgates

1. Faça login na Twitch/Kick e no PokeIdle no navegador que usará a extensão.
2. Adicione seus canais e cadastre cada bônus com requisitos, fonte, tempo, custo em pontos, intervalo de resgate e prazo. O catálogo começa vazio: as regras reais não são inventadas.
3. Marque separadamente que **conferiu as regras** e que **cumpriu os requisitos no serviço**. Tempo com uma aba aberta aparece como estimativa e não libera um bônus sozinho.
4. No histórico, registre o saldo inicial de XP/pontos lido no serviço e uma leitura posterior. A extensão calcula variação e XP/h entre as leituras, avisa quando o saldo diminui e evita somar saldo global com saldos de canais.
5. Quando o checklist e os saldos indicarem disponibilidade, o painel pode notificar. **Conferir resgate** abre o link cadastrado; concluir a ação ocorre no site oficial. **Marcar resgatado** registra sua confirmação e inicia o cooldown. Não concede XP nem gasta pontos automaticamente. Após um resgate com custo, registre o novo saldo: o saldo anterior não é reutilizado para sugerir outro resgate.

Não existe integração verificada com uma API do PokeIdle neste projeto. O histórico é manual, não uma consulta automática de saldo. Registros locais e reprodução não comprovam concessão de XP. Confira as regras e os saldos oficiais.

## Agenda, fila e limites

- **Iniciar todos** habilita a fila; abre somente o que couber nos limites, considerando a prioridade cadastrada.
- **Fechar todos** limpa a fila, fecha as abas gerenciadas e pausa a automação para impedir reabertura. Os canais continuam cadastrados. Retome com **Iniciar todos** ou **Retomar agenda**.
- **Iniciar** individual abre apenas aquele canal e preserva uma pausa global da agenda. **Fechar** individual cancela sua entrada na fila e pausa aquele canal até uma retomada explícita. Fechar uma aba manualmente também é respeitado.
- Em **Limites**, configure máximo de abas, máximo de vídeos Kick e duração por sessão. Reduzir limites devolve sessões excedentes de menor prioridade à fila. A fila avança quando uma sessão termina, respeitando os limites; um vídeo Kick à espera não bloqueia uma vaga possível para chat Twitch.
- Em **Agenda**, escolha canais e início/fim no seu horário local. A extensão abre a oportunidade no horário e fecha as sessões que pertencem a ela ao terminar. Uma aba iniciada manualmente antes da agenda é preservada. Horários sobrepostos compartilham uma sessão; enquanto existir um proprietário ativo, ela permanece.
- Os alarmes verificam a agenda aproximadamente a cada minuto, com o navegador em execução. Android/suspensão podem atrasar eventos. A agenda usa horários cadastrados e não é uma consulta automática de canais ao vivo.

As abas ficam em segundo plano e continuam na barra do navegador. Fechar o painel não as encerra. As configurações e a fila persistem, mas processos e autenticação dependem do navegador; não se presume que sobrevivam a reinícios.

## Diagnóstico e recuperação

O painel mostra os últimos sinais locais de login, conexão, canal ao vivo, erro do vídeo e resolução, com horários. Ausência de evidência aparece como **não verificado**. `navigator.onLine=true` não é tratado como conexão ao servidor confirmada. Os marcadores de interface atuais ainda precisam ser conferidos nos sites reais.

Alertas vão para a central e, quando permitido, para notificações locais. Um problema contínuo não notifica em cada verificação. Após recuperação e nova ocorrência, pode avisar novamente. Dispense os avisos pelo painel. Saldo ou prazo próximos do fim geram lembretes conforme as informações cadastradas.

**Recuperação é opcional e vem desativada.** Quando ativada, tenta recarregar uma sessão com erro explícito de mídia/conexão até três vezes, com espera crescente. Uma pausa de vídeo sem erro não dispara recuperação. Não reabre uma aba fechada manualmente ou sessões após Fechar todos. Login e bloqueio de autoplay podem exigir ação sua.

## Vídeo Kick econômico

A opção de vídeo vale para canais Kick já cadastrados e vem ativada. Clique em Iniciar todos após atualizar para migrar sessões antigas. O script tenta áudio silenciado, reprodução inline e a menor resolução numérica nos controles oficiais durante uma janela limitada de inicialização. Depois relata eventos do vídeo, sem loop contínuo de cliques.

O painel distingue **qualidade solicitada** de **resolução recebida**. Não cria uma variante menor que a transmitida pelo canal; diminuir CSS não reduz o stream. Se os controles não forem reconhecidos, ajuste manualmente; autoplay pode exigir abrir a aba e tocar em play. Não há benchmark de CPU/memória ou garantia de pontos. Detalhes em [KICK-VIDEO.md](docs/KICK-VIDEO.md).

## Dados e permissões

- `storage`: canais, fila, checklist, leituras manuais, horários, avisos e amostras ficam neste navegador.
- `tabs`: cria/fecha apenas abas gerenciadas e confere sua URL; preserva abas pessoais e abas reaproveitadas para outro site.
- `alarms`: agenda e verificação periódica de limites/avisos com o navegador aberto.
- `notifications`: lembretes locais; se indisponíveis, os avisos permanecem no painel.
- Acesso a Kick/Twitch: scripts locais de diagnóstico e player, restritos ao identificador e URL de uma aba gerenciada. Não lê cookies, credenciais ou mensagens de chat.

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
```

Edite `src/` e `manifests/`; regenere `instalar/` e `downloads/` com `npm run package`. O gerador confere distribuições e ZIPs determinísticos, com manifesto na raiz. A assinatura usa `npm run mozilla:sign`, com pré-requisitos no guia da Mozilla; os artefatos ficam em `signed/` ignorado pelo Git.

Na nuvem, use o checkout existente `/workspace/farm-pontos-twitch-kick`. Não crie Git worktree sem pedido explícito. Consulte [VALIDACAO.md](docs/VALIDACAO.md) para evidências e limites de testes, execução nativa e assinatura.
