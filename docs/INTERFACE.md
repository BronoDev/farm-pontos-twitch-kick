# Configurar a apresentação do painel

O Chat Leve mantém os controles de sessões próximos da lista de canais. O menu da extensão oferece a versão compacta; use o botão de abrir em uma aba para trabalhar com mais espaço no computador. Em telas pequenas, o conteúdo se organiza em uma coluna.

## Começar com os recursos necessários

Adicione um canal manualmente ou habilite PokeIdle em **Personalizar painel** e aguarde uma leitura da lista oficial. A apresentação acompanha essa configuração:

- As opções de vídeo Kick aparecem quando há pelo menos um canal Kick cadastrado.
- O painel PokeIdle aparece quando você o habilita ou quando uma instalação anterior já tinha uma leitura da integração. Antes da primeira leitura, mostra apenas a configuração inicial. A lista, as métricas e a regra aparecem depois de receber dados do widget.
- O resumo de XP e bônus aparece conforme os painéis escolhidos.
- A central de avisos aparece quando existe uma pendência.
- Modo da Kick, prioridade e diagnóstico ficam nos detalhes de cada canal, sem ocupar a lista inteira.

## Escolher como abrir um canal Kick

Ao selecionar Kick no formulário de cadastro, escolha o modo do canal. **Live na menor qualidade** abre o player oficial e tenta a menor resolução numérica disponível. **Só chat** abre apenas o chat. **Padrão da Kick** segue a opção geral de reprodução.

Para mudar um canal cadastrado, abra **Opções do canal**. A mudança migra somente sua sessão, se ela estiver aberta. Um canal fechado não é iniciado por isso. O padrão geral afeta apenas os canais que seguem esse padrão, preservando escolhas individuais.

O padrão geral fica em **Limites de consumo e recuperação → Reprodução na Kick**. O resumo do canal distingue uma qualidade solicitada da resolução recebida em uma amostra do player. A menor qualidade disponível varia conforme a live; o aplicativo não mede uma economia de CPU ou memória nem confirma pontos concedidos.

## Encontrar canais

Com mais de cinco canais, use a busca e os filtros da lista. Eles alteram apenas os canais mostrados no painel: sessões e fila continuam seguindo seus controles e limites. Limpar a busca ou voltar ao filtro geral mostra a lista completa novamente.

## Escolher painéis adicionais

Abra **Personalizar painel** e escolha o que pretende usar:

| Recurso | Quando habilitar |
| --- | --- |
| PokeIdle | Para conectar a lista de canais oficiais e configurar a automação Twitch. |
| Checklist de bônus | Para cadastrar regras e acompanhar a confirmação manual de resgates. |
| Histórico de XP e pontos | Para registrar saldos lidos no serviço e comparar leituras. |
| Automação de lives | Para selecionar canais, acompanhar quando ficam ao vivo e configurar a conexão Twitch sem aba. |

Essas escolhas ficam salvas no próprio navegador e são mantidas ao reabrir o painel. Na atualização, um recurso que já tem dados aparece automaticamente quando ainda não existe uma preferência explícita de apresentação.

Ocultar uma seção altera somente sua apresentação. Os registros ficam salvos, e uma automação configurada continua com o comportamento anterior. Para interrompê-la, use seus controles; **Fechar todos** pausa a automação e fecha as sessões gerenciadas.

A configuração de horários foi substituída pela **Automação de lives**. Horários legados são desativados na primeira leitura após atualizar para a versão 0.9, sem apagar seus registros. Ativar o monitoramento desativa o modo automático do widget PokeIdle e impede reabilitá-lo enquanto estiver ativo. Desligar o monitoramento não reativa os modos anteriores. Saiba como autorizar a Twitch e escolher os canais em [AUTOMACAO.md](AUTOMACAO.md).

## Conferir a visualização

Em um computador, confira o painel tanto no menu da extensão quanto em uma aba. Abra os detalhes de um canal e as seções configuradas para conferir o conteúdo completo. No celular, o navegador pode suspender as páginas em segundo plano; a adaptação do painel não muda essa limitação.

A apresentação não muda como as plataformas atribuem recompensas. Leitura do widget, vídeo ativo e registro local continuam sem comprovar crédito de XP no servidor. Consulte [VALIDACAO.md](VALIDACAO.md) para os testes executados e seus limites.
