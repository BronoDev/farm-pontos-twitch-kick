# Chat Leve — Twitch e Kick

Extensão local para Firefox, Chrome, Edge e Opera GX. Abre a **live oficial da Kick com vídeo**, tentando selecionar a menor qualidade disponível, e mantém a Twitch em **chat apenas**. As abas são silenciosas e abrem em segundo plano, sem novas janelas. Feita em JavaScript, sem frameworks, pacotes externos ou servidor próprio. Cada página continua consumindo memória e rede.

## Instalar no seu computador

**[Abra o guia LEIA-PRIMEIRO.md](LEIA-PRIMEIRO.md)** para instalar sem ferramentas de desenvolvimento.

| Navegador | Download pronto | Caminho no repositório completo |
| --- | --- | --- |
| Firefox 142+ (temporário, sem assinatura) | [chat-leve-firefox.zip](https://github.com/BronoDev/farm-pontos-twitch-kick/raw/refs/heads/main/downloads/chat-leve-firefox.zip) | `instalar/firefox/manifest.json` |
| Chrome/Edge | [chat-leve-chromium.zip](https://github.com/BronoDev/farm-pontos-twitch-kick/raw/refs/heads/main/downloads/chat-leve-chromium.zip) | `instalar/chromium/` |
| Opera GX | [chat-leve-opera-gx.zip](https://github.com/BronoDev/farm-pontos-twitch-kick/raw/refs/heads/main/downloads/chat-leve-opera-gx.zip) | `instalar/opera-gx/` |

**Firefox:** extraia o pacote, abra `about:debugging#/runtime/this-firefox`, escolha **Carregar extensão temporária…** e selecione `manifest.json`. Não instale o ZIP como extensão permanente: o pacote não tem assinatura da Mozilla. O Firefox pode mostrar “danificado” ao tentar essa instalação. A versão original também usava um service worker específico de Chromium; agora há um pacote separado com scripts de segundo plano compatíveis com Firefox. Uma mensagem genérica de erro não permite determinar qual dessas causas ocorreu no seu computador.

O carregamento temporário termina quando o Firefox é encerrado e não garante retenção dos dados locais entre carregamentos. Para instalar permanentemente, ainda será necessária a assinatura pela Mozilla (AMO, listado ou não listado). Isso exige a conta do mantenedor; não há `.xpi` assinado disponível. Não desative a verificação de assinatura.

**Chrome/Edge:** extraia o pacote, abra `chrome://extensions` ou `edge://extensions`, ative **Modo do desenvolvedor** e escolha a pasta extraída em **Carregar sem compactação**.

**Opera GX:** extraia o pacote Opera GX, abra `opera://extensions`, ative **Modo do desenvolvedor** e clique em **Carregar sem compactação** (ou **Load unpacked**). Selecione a pasta extraída com `manifest.json`. No repositório completo, a pasta é `instalar/opera-gx/`. O pacote compartilha a base Chromium e exige navegador atualizado com Chromium 109+. Faça login nas plataformas dentro do próprio Opera GX.

Entre na Twitch e na Kick no mesmo perfil do navegador. Abra a extensão, escolha a plataforma, adicione `yetz` ou `https://kick.com/yetz` e clique em **Iniciar** ou **Iniciar todos**. A extensão não pede senha, token nem cookies.

### Iniciar e fechar tudo

- **Iniciar todos:** abre uma aba inativa por canal cadastrado (Kick com vídeo, Twitch com chat), sem trocar a aba atual, e silencia o áudio. Canais já abertos pela extensão não são duplicados.
- **Fechar todos:** fecha as abas gerenciadas, mantém a lista para iniciar novamente e preserva outras abas do navegador. Se você navegou para outro site em uma aba gerenciada, ela também é preservada.
- **Iniciar / Fechar:** controle individual por canal.
- **Atualizar:** verifica quais abas ainda existem e mostra a última amostra enviada pelo player da Kick, quando disponível. Não verifica autenticação, conexão com o servidor ou pontos.

As abas continuam funcionando quando você fecha o painel da extensão. Elas ficam na barra de abas, em segundo plano: **não são processos invisíveis nem uma conexão direta de chat sem navegador**. Não há janelas de pop-up nem bloqueio da suspensão de abas. O modo Kick com vídeo usa o player oficial e faz tentativas limitadas de ajustar a qualidade durante a inicialização; depois, relata eventos do vídeo, sem consulta contínua por temporizador. O consumo depende das páginas e do vídeo, de quantos canais você abre e do navegador; não há redução de memória medida ou garantida. Fechar todos encerra as abas gerenciadas; a liberação de memória segue o gerenciamento do navegador.

Se algum canal falhar ao iniciar ou fechar, os demais continuam sendo processados e o painel mostra um aviso. As sessões abertas são salvas a cada canal, permitindo fechar os resultados parciais. Ao iniciar uma sessão de uma versão antiga, seu pop-up é substituído pela aba em segundo plano. Depois de reiniciar o navegador, reabra pelo painel se necessário; não há inicialização automática.

## Organização dos arquivos

```text
LEIA-PRIMEIRO.md         → passos de instalação
instalar/
  firefox/              → extensão pronta para Firefox
    manifest.json       → selecione este arquivo no carregamento temporário
  chromium/             → pasta pronta para Chrome/Edge
    manifest.json
  opera-gx/             → pasta pronta para Opera GX
    manifest.json
downloads/              → ZIPs de cada navegador, com manifest.json na raiz
src/                    → código compartilhado; edite aqui
manifests/              → configurações específicas de cada navegador
scripts/                → geração e empacotamento sem dependências externas
tests/                  → testes automatizados
docs/                   → detalhes de validação e limitações
```

As pastas `instalar/` e os arquivos `downloads/` já vêm prontos. Não selecione `src/` nem `manifests/` no navegador. Para alterações no código, regenere as distribuições com `npm run package`.

## Kick com vídeo na menor qualidade

A opção **Kick: reproduzir live e tentar a menor qualidade disponível** vem ativada e também vale para canais Kick já cadastrados. Clique em **Iniciar todos** após atualizar para migrar os chats antigos. A Twitch continua no modo de chat. Desativar a opção retorna a Kick ao chat apenas; alterar a opção reinicia somente as sessões Kick abertas.

O script local tenta silenciar e iniciar o elemento de vídeo e escolher a menor resolução numérica visível no menu oficial de qualidade. Ele não usa APIs privadas nem inventa parâmetros de resolução. Se a live só oferecer 360p, não há como transformá-la em 144p apenas encolhendo o player. Controles diferentes dos reconhecidos exigem ajuste manual.

O painel separa **menor qualidade solicitada** de **resolução recebida** (`videoHeight`) e mostra o horário da última amostra. Uma opção solicitada não comprova que o player mudou a resolução. Amostras antigas não são monitoramento em tempo real.

Se aparecer **reprodução não confirmada**, abra a aba da Kick, confira seu login e clique em reproduzir. O navegador pode bloquear ou adiar autoplay em abas inativas. Se a qualidade automática ficar indisponível, escolha a menor opção no próprio player. O script faz tentativas limitadas durante cerca de 36 segundos de inicialização, sem insistir indefinidamente e sem forçar reprodução depois de você pausar. Não garante recuperação de canais offline, substituições posteriores do player, anúncios ou mudanças de rota.

**A automação foi testada em um player simulado; os controles atuais da Kick real não puderam ser verificados por bloqueio de rede da nuvem.** Confira a resolução e a reprodução no seu navegador. Veja [o guia de vídeo Kick](docs/KICK-VIDEO.md).

## Pontos de canal e PokeIdle

Esta versão não integra a API do PokeIdle, não consulta saldo, não clica em bônus e não confirma presença no servidor. Uma aba aberta ou um player que reporta reprodução não comprovam concessão de pontos.

1. Anote o saldo e confirme que o canal está ao vivo.
2. Na Kick, mantenha a opção de vídeo ativada e confira que a live realmente reproduz. Na Twitch, o modo disponível continua sendo chat apenas.
3. Aguarde o intervalo normal de concessão e confira o saldo no serviço oficial/PokeIdle.
4. Se não aumentar, confira login, player e regras atuais do bônus. Não interprete o tempo com a aba aberta como pontos recebidos.

Economizadores de memória, suspensão de abas, restrições de reprodução em segundo plano e o computador em suspensão podem interromper o vídeo e os bônus. A extensão não simula audiência ou falsifica visibilidade. O uso de CPU/memória/rede não foi medido e aumenta com o número de vídeos abertos; reproduzir lives tem custo mesmo na menor resolução.

## Privacidade e permissões

- `storage`: guarda localmente nomes de canais e identificadores de abas. Não sincroniza com outros dispositivos.
- `tabs`: verifica se a aba registrada ainda está no chat correto antes de reutilizá-la ou fechá-la. Essa permissão permite acesso aos endereços das abas; o código consulta apenas os identificadores que criou.

O acesso a `kick.com` e `www.kick.com` permite executar os scripts locais de controle do player. Eles só atuam em abas de live Kick gerenciadas pela extensão, conferindo identificador da aba e URL; não operam em suas abas pessoais da Kick. As amostras de reprodução e resolução ficam em `storage.local`, neste navegador, e não são enviadas a um servidor próprio. Não há leitura de mensagens, coleta de cookies, senhas ou envio de credenciais. A extensão abre as páginas oficiais, que fazem suas próprias conexões de rede. Os arquivos da extensão não carregam bibliotecas remotas.

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
