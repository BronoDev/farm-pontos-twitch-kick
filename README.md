# Chat Leve — Twitch e Kick

Extensão local para Chrome e Edge que organiza canais e abre os **pop-ups oficiais de chat**, sem abrir o player. Feita em JavaScript, sem frameworks, pacotes externos ou servidor próprio. O navegador continua necessário: cada chat tem seu próprio consumo de memória e rede.

## Instalar no seu computador

1. Baixe este projeto e extraia os arquivos, se estiverem em ZIP.
2. No Chrome, abra `chrome://extensions`; no Edge, `edge://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione a pasta **extension** deste projeto (a que contém `manifest.json`).
5. Entre normalmente na Twitch e na Kick nesse mesmo perfil do navegador. A extensão não pede senha, token nem cookies.
6. Abra a extensão, escolha Kick e adicione `yetz` ou `https://kick.com/yetz`. Clique em **Abrir chat**. Repita para outros canais e para Twitch.

Os chats ficam em janelas separadas e continuam abertos ao fechar o painel da extensão. Use **Fechar chat** para encerrar uma sessão. **Remover** também fecha o chat correspondente, se ainda estiver naquela página. **Atualizar** identifica chats fechados manualmente. Não há abertura automática ao iniciar o navegador: reabra pelo painel.

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

## Desenvolvimento na nuvem

Requer Node.js 22 ou superior para os testes; a extensão em si roda no navegador. Nenhuma instalação de dependências é necessária.

```sh
cd /workspace/farm-pontos-twitch-kick
npm run check
npm test
```

Os testes exercitam o controlador com uma API de navegador simulada: persistência, URLs, prevenção de duplicação, fechamento seguro, reabertura e recuperação de falhas. Eles não validam o carregamento dos sites nem a concessão de pontos. A validação final exige carregar a extensão em um navegador com suas sessões pessoais.

Na criação do projeto, passaram os 7 testes do controlador e as verificações de sintaxe. A interface também foi exercitada no Chromium com a API de extensão simulada (adicionar, abrir, fechar, remover e exibir erro). O teste nativo da extensão ficou bloqueado no Chromium 154 desta máquina: o carregamento por linha de comando não ativou o service worker, e o método CDP `Extensions.loadUnpacked` retornou `Method not available`. Isso não confirma o funcionamento nativo no navegador do usuário; a instalação manual acima e a conferência dos pontos continuam pendentes. O proxy deste ambiente também negou acesso aos sites Twitch, Kick e PokeIdle.

Não é necessário servidor, build ou Git worktree. Use o checkout existente. Não coloque credenciais no repositório.
