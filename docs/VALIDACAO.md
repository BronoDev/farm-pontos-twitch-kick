# Validação e limites

## Comandos reproduzíveis

Na raiz do projeto:

```sh
npm run package
npm run check
npm test
```

O pacote Firefox também foi validado com `web-ext` 10.8.0, ferramenta da Mozilla: **0 erros, 0 avisos e 0 observações**. Para repetir essa checagem opcional (requer acesso ao npm):

```sh
npx --yes web-ext@10.8.0 lint --source-dir instalar/firefox --warnings-as-errors
```

A validação do pacote não produz assinatura nem comprova execução no Firefox real.

- O gerador monta as pastas de instalação a partir do código compartilhado e dos manifestos específicos.
- A checagem compara todos os arquivos gerados com as fontes e valida o conteúdo dos ZIPs. Cada ZIP contém `manifest.json` na raiz, não dentro de outra pasta.
- Os testes do controlador verificam URLs, cadastro, persistência, prevenção de duplicação, fechamento seguro e recuperação de falhas.
- Os testes de lote verificam início/fim de todos, preservação de abas pessoais, avisos e persistência após falhas parciais, áudio silenciado e migração de pop-ups antigos.
- O teste de distribuição Firefox executa os scripts listados no manifesto, em ordem, com `browser.*` simulado e sem `chrome.*`. Também verifica mensagens simultâneas e recuperação após erro. Não substitui um teste no Firefox real.

## Verificação manual necessária

Para Opera GX, carregue a pasta `instalar/opera-gx` em `opera://extensions`, com **Modo do desenvolvedor → Carregar sem compactação**, e repita os passos de uso abaixo a partir do item 2. O pacote é gerado com a mesma base Chromium da versão Chrome/Edge. O ambiente não possui Opera GX; a instalação nativa, o consumo de recursos e os pontos nesse navegador permanecem sem validação.

1. Carregue `instalar/firefox/manifest.json` em `about:debugging#/runtime/this-firefox` usando **Carregar extensão temporária…** (Firefox 142+).
2. Abra o painel, adicione Kick/yetz e um canal Twitch. Clique em Iniciar todos e confira se a Kick abre a página da live com vídeo e a Twitch somente o chat, em abas inativas e silenciosas. Abra a aba Kick para conferir reprodução e a menor qualidade no menu. Compare com a amostra exibida em Atualizar.
3. Feche e abra o painel; confirme que os canais continuam listados. Clique em Fechar todos e confirme que apenas as abas gerenciadas fecharam; clique em Iniciar todos para reabrir sem duplicar.
4. Feche um chat manualmente e clique em Atualizar; reabra pelo painel.
5. Confira login, conexão do chat e eventual aumento de pontos/XP nas plataformas, em uma live ativa.

O ambiente da criação não possui Firefox executável. No Chromium 154 disponível, a tentativa de carregar a extensão por linha de comando não ativou o service worker; o método CDP `Extensions.loadUnpacked` retornou `Method not available`. A interface da versão inicial foi exercitada no Chromium com API de extensão simulada. A execução nativa nos navegadores e a concessão de pontos não estão confirmadas.

O proxy da nuvem negou acesso a Twitch, Kick, PokeIdle e à página MDN consultada. Não houve validação das rotas remotas ou da autenticação pessoal neste ambiente. A instalação no navegador local usa a rede e a sessão do usuário.

## Assinatura Firefox

Os ZIPs gerados são pacotes de desenvolvimento sem assinatura. O identificador Gecko declara a identidade da extensão; ele não é uma assinatura. Não há XPI assinado nem publicação no Mozilla Add-ons. A instalação temporária é independente de assinatura e termina ao encerrar o Firefox. Para instalação permanente no Firefox comum é necessário enviar o pacote ao Mozilla Add-ons e obter a assinatura, com a conta do mantenedor.

## Uso de recursos

A interface da versão 0.3 foi exercitada no Chromium com APIs de extensão simuladas: cadastro de dois canais, início em lote com abas inativas e silenciosas, prevenção de duplicação, fechamento e reabertura em lote. Nenhum erro JavaScript foi observado. Essa checagem não valida o navegador Opera GX nem as páginas remotas.

A versão 0.3 usa `tabs.create({active: false})` e silencia a aba com `tabs.update`. Não cria janelas ou players e não impede o navegador de suspender abas. A extensão não consulta o status por temporizadores: isso ocorre ao abrir/atualizar o painel ou enviar um comando. As páginas oficiais ainda executam seus próprios scripts e conexões; abas suspensas podem deixar de acumular bônus. Não foi medido consumo real de CPU/memória, nem validado ganho de pontos em abas de segundo plano.

## Validação do modo Kick com vídeo (0.4)

- Os 21 testes de Node passaram, incluindo migração de chat para vídeo, retorno ao modo chat, preservação da Twitch, validação da origem das amostras e seleção de resoluções válidas.
- O script `python3 scripts/test-player.py` passou neste ambiente com Playwright e Chromium instalados. É uma verificação opcional de DOM com vídeo e API de extensão simulados: selecionou 160p entre opções de 720p/160p/Auto, silenciou o elemento de vídeo, relatou autoplay bloqueado e controles ausentes, e não atuou em aba não gerenciada.
- O pacote Firefox 0.4 passou pelo `web-ext` 10.8.0 com zero erros/avisos/observações.
- O painel foi exercitado no Chromium com APIs de extensão simuladas: abriu vídeo Kick por padrão, exibiu a amostra de 160p, alternou a sessão aberta para chat e encerrou tudo sem erros JavaScript.
- A página Kick/yetz e a consulta pública de canal retornaram bloqueio 403 do proxy. O menu real da Kick, autoplay autenticado, variantes de live, consumo de recursos e pontos **não foram validados**.

Os scripts de conteúdo usam somente controles DOM e propriedades do elemento de vídeo em abas gerenciadas. Não há redução de resolução por CSS, download direto de playlists ou alteração de APIs privadas. Selecionar 160p em uma fixture não prova que esse controle existe ou funciona no site atual da Kick. Confira `docs/KICK-VIDEO.md` para a validação manual.

## Preparação Android (0.5)

- 23 testes de Node passaram. Incluem o manifesto Android com seus scripts clássicos, comandos do painel em uma aba da extensão, rejeição dos mesmos comandos vindos de uma página web e criação de abas já silenciadas sem chamar o `tabs.update` incompatível com Android.
- O pacote `instalar/firefox-android` passou no `web-ext` 10.8.0 com zero erros, avisos ou observações.
- `python3 scripts/test-mobile-ui.py` passou em viewports de 320, 360, 412 e 560 pixels, com toque/identificação Android e APIs simuladas no Chromium. Verificou cadastro, iniciar/fechar/reabrir todos, ausência de rolagem horizontal, controles com pelo menos 44 pixels de altura nas telas pequenas e ausência de erros JavaScript. Isso não é emulação do motor ou do sistema Android.
- `python3 scripts/test-player.py` passou novamente, incluindo o atributo `playsinline` no vídeo simulado.
- Foram consultados os dados oficiais MDN de `tabs.create`, `tabs.update` e `browser_specific_settings`, o guia da Mozilla e a ajuda `web-ext run --help` para as diferenças de API e o fluxo de teste por USB.
- **Não executado:** instalação em Firefox Android, conexão ADB, navegador nativo móvel, execução com tela bloqueada, qualidade no player móvel real, assinatura Mozilla e concessão de pontos. O ambiente não tem `adb`, emulador ou dispositivo Android conectado. O comando de desenvolvimento está documentado em [ANDROID.md](ANDROID.md), mas não foi validado contra um aparelho.

Não considere o pacote pronto para instalação comum no Android enquanto faltar assinatura/distribuição Mozilla e validação nativa. Os testes existentes não substituem esses passos.

## Versão 0.6: checklist, histórico, agenda, fila e assinatura

- `npm run package` e `npm run check` concluíram: quatro distribuições e seus ZIPs coerentes com as fontes, ícone binário preservado e manifestos na raiz dos pacotes.
- **65 testes de Node passaram**, sem falhas ou skips. Cobrem medições manuais, ausência vs zero, resets, XP/h, cooldown e saldo posterior ao resgate; fila/prioridades/limites; agendas sobrepostas, desativação/retomada, propriedade das sessões e fechamento manual; recuperação opt-in com espera/cap; alertas por ocorrência; scripts reais do pacote Firefox em VM com eventos de alarme/startup/remoção/notificações; isolamento das mensagens; plano e proteção das credenciais de assinatura.
- `scripts/test-dashboard.py` passou em Chromium com controlador/domínio/automação reais e APIs de navegador simuladas. Cobriu o fluxo em 360px: limitar uma sessão, enfileirar outra, criar bônus, registrar XP1000→1120, comparar XP/h, saldo suficiente, aviso sem duplicação, abrir resgate em aba pessoal, marcar confirmação/cooldown, exigir novo saldo, iniciar/encerrar agenda via tick e impedir reabertura após Fechar todos. Sem erros JavaScript ou rolagem horizontal.
- `scripts/test-mobile-ui.py` passou em 320/360/412/560px; os testes opcionais de player e diagnóstico também passaram com fixtures de DOM e APIs simuladas.
- `web-ext`10.8.0 validou Firefox desktop e o pacote universal Firefox Android com zero erros/avisos/observações. A ajuda oficial confirma os argumentos de assinatura unlisted e seus timeouts.
- `npm run mozilla:check` passou e relatou as variáveis `WEB_EXT_API_KEY`/`WEB_EXT_API_SECRET` **ausentes**. Essa conferência local não autentica nem envia o pacote. Nenhum XPI novo foi recebido e nenhuma publicação no AMO ocorreu.
- Após cadastrar os destinos AMO na configuração, a consulta pública `https://addons.mozilla.org/api/v5/addons/search/?page_size=1` retornou200. Isso confirma conectividade pública, não autorização de assinatura. PokeIdle e a consulta Kick ainda retornaram bloqueio403 do proxy nas verificações desta sessão.

Regras dos bônus, confirmação de requisitos, leituras de saldo e registro de resgate são manuais. Não há integração verificada com uma API PokeIdle nem confirmação de XP obtido pelo serviço. A agenda usa horários cadastrados; não é descoberta automática do início de uma live. Os sinais de login/conexão são evidências da interface local, não verificação de autenticação no servidor.

Alarmes rodam aproximadamente a cada minuto com o navegador disponível; encerramento/suspensão do sistema, principalmente no Android, podem atrasá-los. O código não é um serviço Android e não mantém o aparelho acordado. Não foram testados reprodução/login reais, pontos ou assinatura/instalação nativa na versão nova. As variáveis e os domínios necessários foram salvos em rascunho do ambiente para configuração segura; salvar rascunho não assina nem publica uma extensão.

## Versão 0.7: leitura do PokeIdle e lives Twitch

- `npm run package` e `npm run check` passaram para as quatro distribuições 0.7.0 e seus ZIPs. Incluem os novos scripts, a permissão de acesso ao PokeIdle e os scripts de player também na Twitch. A ordem dos scripts clássicos Firefox foi exercitada pelos testes do pacote.
- **93 testes Node passaram**, sem falhas ou skips. A integração usa a fixture do HTML fornecido: 16 canais, oito elegíveis, três sessões e cinco na fila por padrão. Cobre sincronização sem duplicação, vídeo Twitch, menor qualidade por radios/labels, limite Kick separado, propriedade manual/automática, pausa individual/global, fonte vencida/fechada, exclusões, migração e limite de duração. Flags ausentes/inválidas não viram offline. Atualizar a origem aguarda sua resposta fora da fila do controlador, com teste contra bloqueio mútuo.
- `python3 scripts/test-pokeidle-reader.py` passou no Chromium: fixture real, SPA, classes públicas, debounce/throttle, heartbeat, atualização autenticada após aceite e limpeza ao sair da página.
- `python3 scripts/test-pokeidle-dashboard.py` passou em 320 e 360px com parser, painel e controlador reais, usando APIs de navegador simuladas. Verificou a lista 16/8/8, fila e limite, abas silenciosas, sincronização idempotente, manutenção quando a marca faltante desaparece, avanço após offline, pausa/retomada e preservação de sessões manuais ao desativar. Sem erros JavaScript ou rolagem horizontal.
- As verificações `test-dashboard.py`, `test-mobile-ui.py` (320/360/412/560px), `test-player.py` e `test-health.py` também passaram. O player usa fixtures DOM Kick/Twitch; a menor resolução selecionada nessas fixtures não comprova funcionamento no site real.
- `web-ext` 10.8.0 validou Firefox desktop e Android com zero erros, avisos ou observações. `npm run mozilla:check` conferiu o plano 0.7.0 e relatou ambas as chaves AMO ausentes; não houve envio ou assinatura.

A leitura de `.tw-canais` vem da interface PokeIdle aberta no navegador. Os sinais ao vivo/com bônus/faltante e a regra literal (`+15%`/`+2,5%`) não validam XP creditado. A lista colada serve como fixture, sem congelar seus canais ou status no produto.

A página Twitch retornou HTML200 numa consulta com TLS verificado; seus assets foram bloqueados pelo proxy. O Chromium apresentou erro de confiança TLS ao acessar o site real, sem contorno dessa verificação. Reprodução, login, qualidade real, consumo e XP no servidor continuam sem validação. Android e Opera GX nativos também não foram testados.

A versão 0.7 altera arquivos e permissões e precisa de assinatura Firefox nova para instalação permanente. A assinatura anterior não cobre esta versão. Consulte [POKEIDLE.md](POKEIDLE.md) para atualizar permissões, manter a origem aberta e ajustar o limite de sessões.

## Versão 0.8: painel responsivo e opções configuradas

- `npm run package` e `npm run check` passaram para as quatro distribuições 0.8.0 e seus ZIPs. O gerador mantém `ui-state.js` como módulo para o painel e cria `ui-state-background.js` clássico para o background Firefox, carregado antes de `core.js`.
- **99 testes Node passaram**, sem falhas ou skips. Os novos testes cobrem normalização das escolhas de apresentação, migração de instalações com dados existentes, persistência após recriar o controlador, rejeição de preferências inválidas e abertura da página própria da extensão. Ocultar um painel preserva bônus, leituras, agenda, sessões e estado da automação.
- `python3 scripts/test-desktop-ui.py` passou em 600×600, 1280×800, 1440×900, 320×740 e 360×740. Exercitou configuração inicial, apresentação condicional, preferências após recarregar, formulários abertos e lista com 18 canais. Também verificou a migração de dados existentes. A lista usa rolagem local no desktop para manter os controles acessíveis. Sem sobreposições ou rolagem horizontal nos cenários testados.
- O mesmo script carregou os painéis distribuídos em `instalar/firefox` e `instalar/firefox-android`, confirmou o import do módulo de apresentação e ativou o histórico pela interface, com DOM/controlador reais e APIs simuladas.
- `test-mobile-ui.py` passou em 320/360/412/560px; `test-pokeidle-reader.py`, `test-dashboard.py` e `test-pokeidle-dashboard.py` também passaram com os fluxos adaptados à configuração dos painéis. O painel PokeIdle foi exercitado em 320 e 360px.
- `web-ext` 10.8.0 validou Firefox desktop e Android com zero erros, avisos ou observações. O aviso da ferramenta sobre não conseguir gravar sua configuração de atualização não afetou o resultado da validação.

As verificações de interface usam Chromium e APIs de navegador simuladas, com o controlador real. Não equivalem à execução nativa em Firefox/Opera GX ou em Android, nem validam player real, pontos ou consumo. A versão alterada também precisa de assinatura Mozilla nova para instalação Firefox permanente. Consulte [INTERFACE.md](INTERFACE.md) para escolher os recursos visíveis sem apagar dados ou desativar uma agenda por engano.

## Versão 0.9: modos Kick e automação de lives

- `npm run package`, `npm run check` e **153 testes Node** passaram, sem falhas ou skips. As quatro distribuições 0.9.0 e seus ZIPs correspondem às fontes. Os testes incluem modos Kick por canal, precedência sobre o padrão geral, migração das sessões, fila e limites; preferências de apresentação; autenticação e protocolo de chat Twitch simulados; monitoramento de lives e migração de horários legados sem apagar registros.
- O teste de player passou no Chromium com 18 cenários de DOM simulado, incluindo opções externas intocadas, troca de vídeo, pausa preservada, limite de reinicializações e limpeza. Isso verifica o comportamento nas fixtures, não a estrutura atual dos sites.
- O fluxo de automação passou em 320, 600 e 1280px com controlador real e IRC simulado. Verificou abertura Kick, Twitch sem aba, estados do chat, pausa/retomada, consultas e proteção da credencial no estado público. Os demais fluxos de interface adaptados também passaram.
- Os painéis gerados para Firefox desktop e Android carregaram seu módulo ESM e permitiram ativar o histórico. `web-ext` 10.8.0 validou ambos com zero erros, avisos ou observações. O aviso de atualização da própria ferramenta, sem permissão para gravar sua configuração, não afetou a validação.
- `npm run mozilla:check` conferiu o plano 0.9.0 e relatou `WEB_EXT_API_KEY` e `WEB_EXT_API_SECRET` ausentes. Não houve envio ou assinatura de um XPI desta versão.

Os serviços de estado/autorização, o WebSocket e as respostas do servidor foram simulados nos testes. Não houve validação de login pessoal, entrada real no chat, reprodução/qualidade remota, consumo ou crédito de pontos/XP. Firefox, Opera GX e Android nativos também continuam sem validação nesta versão. A instalação Firefox permanente precisa de nova assinatura Mozilla; a assinatura anterior não cobre os arquivos alterados.

Consulte [AUTOMACAO.md](AUTOMACAO.md) para configurar o OAuth oficial e os canais, e [KICK-VIDEO.md](KICK-VIDEO.md) para escolher chat ou live e conferir a qualidade recebida.

## Versão 0.10: Twitch só chat e Kick do PokeIdle

- `npm run package`, `npm run check` e **176 testes Node** passaram. As quatro distribuições 0.10.0 e seus ZIPs correspondem às fontes; os scripts de player estão restritos à Kick. Os dois pacotes Firefox passaram no `web-ext` 10.8.0 sem erros/avisos/observações e no teste de carregamento do painel distribuído com APIs simuladas.
- As regressões cobrem popout Twitch sem player, migração das antigas abas gerenciadas, Kick importada, estados desconhecidos/offline, pausas e preferência Kick na fila sem exceder o limite. O fluxo misto passou no Chromium em 320/600/1280px; desktop, modos Kick, integração PokeIdle e IRC explícito também passaram nos cenários informados.
- Os nove testes do leitor e sua verificação Chromium passaram. O HTML original fornecido contém somente Twitch; a marcação Kick adicional é **sintética**. Esses resultados não comprovam o DOM atual do PokeIdle nem respostas reais dos serviços.
- Não houve validação de login pessoal, reprodução/qualidade remota, consumo ou crédito de pontos/XP, nem execução nativa Firefox/Opera GX/Android. Os ZIPs continuam sem assinatura; uma instalação Firefox permanente exige nova assinatura Mozilla.

## Versão 0.11: sincronização Kick independente

- `npm run package`, `npm run check` e **215 testes Node** passaram, sem falhas ou skips. As quatro distribuições 0.11.0 e seus ZIPs correspondem às fontes. Os scripts de player continuam restritos à Kick e o diagnóstico Twitch foi preservado.
- Os testes cobrem sincronização Kick separada da leitura Twitch, preservação de dados ausentes, controles e pausas respeitados na leitura manual, consultas compartilhadas, cache com horário original e espera após erros. A regressão de API offline seguida de estado desconhecido verifica que um marcador antigo da página não reabre a live.
- Os nove testes Node do leitor e sua verificação Chromium passaram. Os fluxos Chromium também passaram para desktop em cinco tamanhos, PokeIdle em 320/360px, roteamento Twitch/Kick em 320/600/1280px com limite de três sessões, IRC em três tamanhos e modos Kick em cinco tamanhos.
- O fluxo dedicado de sincronização Kick passou em 320/600/1280px. Uma resposta API 403 foi exibida como status a verificar, apesar de um marcador antigo de live na página; somente o canal com confirmação atual entrou na contagem de lives.
- `web-ext` 10.8.0 validou Firefox desktop 142/MV3 e Android 142/MV2 com zero erros, avisos ou observações. O aviso sobre a configuração de atualização da própria ferramenta não afetou a validação. Os dois painéis distribuídos carregaram seu módulo ESM e permitiram ativar o histórico com APIs simuladas.
- `npm run mozilla:check` conferiu o plano 0.11.0 e relatou `WEB_EXT_API_KEY` e `WEB_EXT_API_SECRET` ausentes. Não houve envio ou assinatura desta versão; a instalação Firefox permanente exige nova assinatura Mozilla.

As APIs de navegador e as respostas dos serviços foram simuladas. O HTML original fornecido contém somente Twitch; a marcação Kick adicional dos testes é **sintética**. Não houve validação do DOM atual do PokeIdle, login pessoal, reprodução/qualidade remota, consumo, crédito de pontos/XP ou execução nativa Firefox/Opera GX/Android.
