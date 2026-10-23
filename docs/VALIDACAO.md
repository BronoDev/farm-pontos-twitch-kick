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
