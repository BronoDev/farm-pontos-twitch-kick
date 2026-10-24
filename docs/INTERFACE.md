# Configurar a apresentação do painel

O menu da extensão oferece uma visualização compacta. Use **Abrir painel** para trabalhar em uma aba com mais espaço no computador. Em telas pequenas, o conteúdo se organiza em uma coluna.

## Começar com o necessário

Adicione um canal ou habilite PokeIdle em **Personalizar painel** e carregue a lista do jogo. As opções acompanham essa configuração:

- Os controles de vídeo aparecem somente para canais Kick.
- A Twitch usa somente chat. O padrão é o popout oficial numa aba inativa e silenciosa, sem configurar uma credencial na extensão.
- O painel PokeIdle mostra a plataforma dos canais encontrados. A lista, as métricas e a regra aparecem após receber uma leitura da página.
- O bloco Kick tem **Sincronizar Kick**, controle **Automatizar Kick do PokeIdle** e informações próprias de atualização. Sincronizar somente a Kick preserva os dados e a idade da leitura Twitch.
- O resumo de XP e bônus aparece conforme os recursos escolhidos; avisos aparecem quando há pendências.
- Modo da Kick, prioridade e diagnóstico ficam nos detalhes de cada canal.

## Escolher o modo Kick

No cadastro ou em **Opções do canal**, escolha **Live na menor qualidade**, **Só chat** ou **Padrão da Kick**. A escolha individual prevalece sobre o padrão geral, disponível em **Limites de consumo e recuperação → Padrão da Kick**.

Mudar o modo migra somente a sessão daquele canal, se ela estiver aberta. Canais parados não são iniciados pela alteração. O painel distingue a qualidade solicitada da resolução recebida; a extensão não mede uma economia real de CPU ou memória.

## Escolher painéis adicionais

Em **Personalizar painel**, mostre apenas o que pretende configurar:

| Recurso | Uso |
| --- | --- |
| PokeIdle | Ler canais Twitch/Kick e regras da página do jogo. |
| Bônus e resgates | Registrar requisitos e sua confirmação manual de resgates. |
| Histórico de XP e pontos | Comparar saldos lidos no serviço. |
| Automação de lives | Selecionar canais e acompanhar sua automação. |

As escolhas ficam salvas neste navegador. Dados antigos podem tornar um painel disponível quando ainda não existe uma preferência explícita. Ocultar uma seção preserva os dados e não interrompe uma automação já configurada. **Fechar todos** fecha as sessões gerenciadas e pausa novas aberturas.

Com mais de cinco canais, use a busca e os filtros. Eles mudam somente a lista mostrada no painel, sem interromper sessões ou alterar a fila.

Na integração PokeIdle, confira também o resultado da última sincronização Kick e eventual espera para tentar novamente. A ação aguarda a consulta terminar; uma informação antiga não é apresentada como atual apenas por ter sido recuperada do cache. Com a automação Kick ou a geral do PokeIdle desligada, o botão atualiza os dados sem reativá-las nem abrir sessões por essa origem.

## Twitch e a opção avançada

Na automação, mantenha o popout de chat para usar a sessão da Twitch deste navegador. A aba fica em segundo plano e continua na barra do navegador; isso não é uma página completamente invisível.

Se escolher o modo avançado IRC sem nenhuma aba, a conexão de conta aparece para configuração local. Ela precisa de autorização própria, descrita em [AUTOMACAO.md](AUTOMACAO.md). Esse modo é opcional e não habilita um player Twitch.

## Conferir o comportamento

Confira o painel no menu e em uma aba, abra os detalhes de um canal e revise a idade dos sinais. No Android, o navegador pode suspender abas, alarmes e conexões ao trocar de aplicativo ou bloquear a tela.

Chat conectado, vídeo ativo e registro local não comprovam crédito de XP. Leia [VALIDACAO.md](VALIDACAO.md) para os testes e seus limites.
