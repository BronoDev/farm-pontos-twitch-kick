# Chat Leve — Twitch e Kick

Extensão local para Firefox, Chrome e Edge que organiza canais e abre os **pop-ups oficiais de chat**, sem abrir o player. Feita em JavaScript, sem frameworks, pacotes externos ou servidor próprio. O navegador continua necessário: cada chat tem seu próprio consumo de memória e rede.

## Instalar no seu computador

**[Abra o guia LEIA-PRIMEIRO.md](LEIA-PRIMEIRO.md)** para instalar sem ferramentas de desenvolvimento.

| Navegador | Download pronto | Caminho no repositório completo |
| --- | --- | --- |
| Firefox 142+ (temporário, sem assinatura) | [chat-leve-firefox.zip](https://github.com/BronoDev/farm-pontos-twitch-kick/raw/refs/heads/main/downloads/chat-leve-firefox.zip) | `instalar/firefox/manifest.json` |
| Chrome/Edge | [chat-leve-chromium.zip](https://github.com/BronoDev/farm-pontos-twitch-kick/raw/refs/heads/main/downloads/chat-leve-chromium.zip) | `instalar/chromium/` |

**Firefox:** extraia o pacote, abra `about:debugging#/runtime/this-firefox`, escolha **Carregar extensão temporária…** e selecione `manifest.json`. Não instale o ZIP como extensão permanente: o pacote não tem assinatura da Mozilla. O Firefox pode mostrar “danificado” ao tentar essa instalação. A versão original também usava um service worker específico de Chromium; agora há um pacote separado com scripts de segundo plano compatíveis com Firefox. Uma mensagem genérica de erro não permite determinar qual dessas causas ocorreu no seu computador.

O carregamento temporário termina quando o Firefox é encerrado e não garante retenção dos dados locais entre carregamentos. Para instalar permanentemente, ainda será necessária a assinatura pela Mozilla (AMO, listado ou não listado). Isso exige a conta do mantenedor; não há `.xpi` assinado disponível. Não desative a verificação de assinatura.

**Chrome/Edge:** extraia o pacote, abra `chrome://extensions` ou `edge://extensions`, ative **Modo do desenvolvedor** e escolha a pasta extraída em **Carregar sem compactação**.

Entre na Twitch e na Kick no mesmo perfil do navegador. Abra a extensão, escolha a plataforma, adicione `yetz` ou `https://kick.com/yetz` e clique em **Abrir chat**. A extensão não pede senha, token nem cookies.

Os chats ficam em janelas separadas e continuam abertos ao fechar o painel. Use **Fechar chat** para encerrar uma sessão. **Remover** também fecha o chat correspondente, se ainda estiver naquela página. **Atualizar** identifica chats fechados manualmente. Reabra os chats pelo painel depois de reiniciar o navegador.

## Organização dos arquivos

```text
LEIA-PRIMEIRO.md         → passos de instalação
instalar/
  firefox/              → extensão pronta para Firefox
    manifest.json       → selecione este arquivo no carregamento temporário
  chromium/             → pasta pronta para Chrome/Edge
    manifest.json
downloads/              → ZIPs de cada navegador, com manifest.json na raiz
src/                    → código compartilhado; edite aqui
manifests/              → configurações específicas de cada navegador
scripts/                → geração e empacotamento sem dependências externas
tests/                  → testes automatizados
docs/                   → detalhes de validação e limitações
```

As pastas `instalar/` e os arquivos `downloads/` já vêm prontos. Não selecione `src/` nem `manifests/` no navegador. Para alterações no código, regenere as distribuições com `npm run package`.

## Pontos de canal e PokeIdle

Esta versão gerencia os chats; **não implementa uma integração com a API do PokeIdle, não consulta saldo, não clica em bônus e não confirma presença no servidor**. “Chat aberto” indica somente que a aba existe na URL esperada, não que o usuário está autenticado ou conectado ao chat.

O usuário relatou que o pop-up de chat da Kick acumula pontos no canal `yetz`. Isso não foi confirmado independentemente neste ambiente. A rota usada é `https://kick.com/popout/yetz/chat`. Na Twitch é `https://www.twitch.tv/popout/yetz/chat?popout=`. Se uma plataforma mudar sua rota, pode ser necessário atualizar a extensão.

Para verificar no seu computador:

1. Anote o saldo de pontos e XP e confirme que o canal está ao vivo.
2. Feche o player e mantenha apenas o chat aberto, com sua conta conectada.
3. Aguarde o intervalo normal de concessão do canal e confira novamente o saldo no site oficial/PokeIdle.
4. Se não aumentar, confira o login, erros do chat e as regras atuais do bônus. Não interprete o tempo com a janela aberta como pontos recebidos.

Minimizar, suspender abas, economizadores de memória e o computador em suspensão podem afetar o funcionamento. A extensão não impede suspensão, não mantém vídeo oculto e não simula eventos de audiência. Os critérios de pontos e XP pertencem às plataformas e ao bot. Não há garantia de acúmulo só com chat em ambas as plataformas.

## Privacidade e permissões

- `storage`: guarda localmente nomes de canais e identificadores de abas. Não sincroniza com outros dispositivos.
- `tabs`: verifica se a aba registrada ainda está no chat correto antes de reutilizá-la ou fechá-la. Essa permissão permite acesso aos endereços das abas; o código consulta apenas os identificadores que criou.

Sem telemetria, scripts injetados, leitura de mensagens, coleta de cookies ou envio de credenciais. A extensão abre as páginas oficiais, que fazem suas próprias conexões de rede. Os arquivos da extensão não carregam bibliotecas remotas.

## Desenvolvimento

Requer Node.js 22+ para testes/geração e Python 3 para os ZIPs. Não há dependências para instalar. Para usar a extensão, basta o navegador.

```sh
npm run package   # gera instalar/ e downloads/ a partir de src/ e manifests/
npm run check     # verifica sintaxe e consistência dos arquivos gerados
npm test
```

A geração é determinística e não altera o código-fonte. Não edite manualmente os arquivos de `instalar/`. No Firefox, o gerador converte o núcleo compartilhado em script clássico e o manifesto carrega esse script antes de `background.js`. No Chromium, o mesmo núcleo é importado pelo service worker como módulo.

Os testes usam APIs de navegador simuladas; não validam pontos, login ou conexões aos serviços. Consulte [as verificações e limitações](docs/VALIDACAO.md).

Na nuvem, use o checkout existente em `/workspace/farm-pontos-twitch-kick`. Não é necessário servidor ou Git worktree. Não coloque credenciais no repositório.
