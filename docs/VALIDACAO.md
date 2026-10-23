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
- O teste de distribuição Firefox executa os scripts listados no manifesto, em ordem, com `browser.*` simulado e sem `chrome.*`. Também verifica mensagens simultâneas e recuperação após erro. Não substitui um teste no Firefox real.

## Verificação manual necessária

1. Carregue `instalar/firefox/manifest.json` em `about:debugging#/runtime/this-firefox` usando **Carregar extensão temporária…** (Firefox 142+).
2. Abra o painel, adicione Kick/yetz e um canal Twitch. Confira se só os chats abrem.
3. Feche e abra o painel; confirme que os canais continuam listados.
4. Feche um chat manualmente e clique em Atualizar; reabra pelo painel.
5. Confira login, conexão do chat e eventual aumento de pontos/XP nas plataformas, em uma live ativa.

O ambiente da criação não possui Firefox executável. No Chromium 154 disponível, a tentativa de carregar a extensão por linha de comando não ativou o service worker; o método CDP `Extensions.loadUnpacked` retornou `Method not available`. A interface da versão inicial foi exercitada no Chromium com API de extensão simulada. A execução nativa nos navegadores e a concessão de pontos não estão confirmadas.

O proxy da nuvem negou acesso a Twitch, Kick, PokeIdle e à página MDN consultada. Não houve validação das rotas remotas ou da autenticação pessoal neste ambiente. A instalação no navegador local usa a rede e a sessão do usuário.

## Assinatura Firefox

Os ZIPs gerados são pacotes de desenvolvimento sem assinatura. O identificador Gecko declara a identidade da extensão; ele não é uma assinatura. Não há XPI assinado nem publicação no Mozilla Add-ons. A instalação temporária é independente de assinatura e termina ao encerrar o Firefox. Para instalação permanente no Firefox comum é necessário enviar o pacote ao Mozilla Add-ons e obter a assinatura, com a conta do mantenedor.
