# Automação dos canais

Na versão 0.10, a Twitch usa somente chat. O padrão abre o popout oficial do chat numa aba inativa e silenciosa, usando a sessão da Twitch deste navegador. A Kick pode abrir a live com tentativa de menor qualidade disponível. A extensão não cria janelas de pop-up para essas sessões.

## Configurar

1. Adicione seus canais ou carregue a lista do PokeIdle. A integração pode identificar canais das duas plataformas.
2. Em **Personalizar painel**, mostre **Automação de lives**.
3. Escolha os canais, ative o monitoramento e clique em **Salvar automação**.
4. Na Twitch, mantenha o modo de popout de chat para usar a sessão do navegador. Na Kick, escolha o modo da live para os canais que precisam de vídeo.
5. Confira a última consulta e as sessões abertas. As verificações periódicas dependem do navegador em execução.

No modo padrão, o chat Twitch continua aberto enquanto o canal estiver selecionado e a automação estiver habilitada. Ele não precisa de um player nem de uma consulta autenticada ao estado da live. Uma transmissão offline pode continuar tendo chat disponível.

A Kick inicia quando há um sinal confirmado de live e encerra somente a participação automática após offline explícito. Uma sessão que também foi iniciada manualmente é preservada. Erros de API, bloqueios, limites de requisições e respostas inválidas deixam o estado desconhecido; não abrem novos canais e não fecham os existentes por presumir offline.

## Abas em segundo plano

O popout de chat é um endereço oficial, aberto numa aba sem receber foco. A aba continua visível na barra do navegador; isso não equivale a uma janela ou página completamente invisível. Fechar o painel da extensão não encerra suas sessões.

Os chats em abas usam o limite global de abas. Vídeos Kick também respeitam o limite específico de vídeos. **Fechar todos** encerra as sessões gerenciadas e pausa as consultas periódicas. **Verificar agora** pode consultar manualmente sem desfazer a pausa. Fechar um canal individualmente impede sua reabertura automática até uma retomada explícita.

## Twitch sem nenhuma aba: opção avançada

O modo IRC é opcional. Escolha-o somente se quiser conectar o chat sem sequer manter uma aba de popout. Ele usa uma conexão oficial WebSocket da própria conta e precisa de um token de usuário com a permissão `chat:read`.

1. Use o fluxo OAuth oficial de um aplicativo Twitch registrado por você. Consulte a [documentação de autenticação da Twitch](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/).
2. Insira o token somente no campo de conexão da extensão. Não é a senha da sua conta. Não envie a credencial no chat, em arquivos do projeto ou em comentários do GitHub.
3. A validação oficial identifica a conta, o aplicativo emissor e as permissões; não é necessário digitar o identificador do cliente separadamente.
4. Confira autenticação, conexão e entrada no canal. A entrada só é apresentada como confirmada após a resposta do servidor.

O token fica no armazenamento local da extensão, separado do estado público do painel. Não há servidor próprio para sincronizar a credencial. Remova a conexão no painel ou revogue a autorização na Twitch quando quiser. O cliente não envia mensagens de chat para fingir atividade. Expiração ou revogação exige uma credencial válida para reconectar.

O IRC não ocupa uma aba nem consome o limite de abas. O popout padrão não precisa dessa configuração OAuth.

## Canais encontrados no PokeIdle

Abra o jogo e carregue seus canais. Os links Twitch elegíveis usam somente o chat. Os links Kick são identificados pela plataforma e podem iniciar lives após um sinal confirmado de online. Um link isolado informa o canal, não seu estado atual ou um bônus concedido.

Novos inícios pela integração exigem uma leitura recente da página PokeIdle. As consultas Kick podem confirmar se os canais encontrados estão ao vivo. Se a origem estiver fechada ou desatualizada, não há novos inícios por ela; uma sessão existente não é considerada offline apenas por falta de leitura. Veja [POKEIDLE.md](POKEIDLE.md).

## Atualização e limites

Sessões Twitch antigas que a extensão ainda gerenciava como live são convertidas para o popout do mesmo canal. Abas pessoais ou já reutilizadas para outro site são preservadas. Os scripts de player são injetados apenas na Kick.

Os horários legados foram substituídos pelo monitoramento e são desativados na migração, conservando os registros. Desligar uma automação não apaga seus dados nem reativa horários antigos. Ocultar um painel também não interrompe uma automação configurada.

Se a versão 0.9 desativou a origem PokeIdle ao habilitar o monitoramento, a atualização pode restaurá-la uma vez. Pausas globais e individuais continuam valendo; uma nova escolha de desativar a origem também é preservada.

Fechar ou suspender o navegador pode interromper abas, alarmes e IRC. No Android, trocar de aplicativo ou bloquear a tela também pode suspender essas sessões. O pacote Chromium exige base 116 ou mais recente para a opção avançada de WebSocket; a extensão não mantém o aparelho acordado.

Chat conectado, vídeo ativo e sinal de live não comprovam pontos ou XP concedidos. Confira as regras e os saldos no serviço correspondente. Os testes e seus limites estão em [VALIDACAO.md](VALIDACAO.md).
