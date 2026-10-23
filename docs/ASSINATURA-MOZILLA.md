# Assinar a nova versão no Mozilla Add-ons

Um XPI já assinado continua válido para os arquivos daquela versão. Qualquer mudança no código exige uma nova versão assinada pela Mozilla. O certificado de um XPI antigo não pode ser copiado para os arquivos novos.

## Credenciais e destinos

Na sua conta AMO, use as [chaves de API da Mozilla](https://addons.mozilla.org/developers/addon/api/key/) e configure estas variáveis nos campos seguros do ambiente ou no gerenciador de segredos do seu computador:

- `WEB_EXT_API_KEY`: emissor JWT da API AMO.
- `WEB_EXT_API_SECRET`: segredo JWT da API AMO.

Não envie valores no chat, em comandos compartilhados, arquivos do projeto ou commits. O script usa as variáveis de ambiente oficialmente suportadas pelo `web-ext`; não passa os valores como argumentos. O segredo precisa estar disponível para o processo calcular o JWT: um placeholder destinado apenas à substituição por proxy não é suficiente.

Destinos necessários: `addons.mozilla.org` para a API e `addons.cdn.mozilla.net` para downloads/redirecionamentos dos arquivos. O npm precisa acessar seu registro para obter `web-ext` 10.8.0. TLS e verificações de integridade permanecem habilitados.

## Uma assinatura para desktop e Android

O script usa **uma única distribuição universal**, a pasta `instalar/firefox-android`. Seu manifesto declara Firefox desktop e Android, tem o mesmo identificador Gecko e usa scripts de segundo plano compatíveis com os dois. Isso evita tentar cadastrar dois pacotes diferentes com a mesma versão e o mesmo ID no AMO.

Os atalhos `--target=desktop` e `--target=android` selecionam esse mesmo pacote universal; não fazem envios separados. O pacote continua precisando de teste real em cada plataforma. Os ZIPs em `downloads/` são artefatos de desenvolvimento sem assinatura.

O ID `browser_specific_settings.gecko.id` precisa pertencer à sua conta AMO e ser o mesmo do complemento que você já registrou. Confirme-o no painel AMO antes de assinar. Se o complemento existente tiver outro ID, alinhe os manifestos do projeto numa alteração de código antes de gerar a distribuição. Não altere o ID apenas para contornar uma recusa do serviço.

## Conferir e enviar

Na raiz do projeto, com Node.js 22+, npm e Python 3:

```sh
npm run package
node scripts/mozilla-sign.mjs --check
```

`--check` também pode ser escrito `--dry-run`. Ele lê o manifesto e informa **apenas a presença** das variáveis. Não autentica, assina, envia ou publica nada. Pode concluir mesmo com credenciais ausentes; isso não comprova acesso à API.

Depois de configurar as credenciais e conferir o ID e a versão:

```sh
node scripts/mozilla-sign.mjs
```

Esse comando envia o pacote à Mozilla pelo canal **unlisted** (não listado) e aguarda a assinatura/revisão por até cinco minutos. Não cria uma publicação listada na loja. A Mozilla pode exigir revisão ou dados adicionais; um timeout não significa que o envio não ocorreu. Confira a versão no painel AMO antes de tentar um novo envio.

O script copia a distribuição para `signed/<versão>/source` e usa `signed/<versão>/artifacts` para os resultados. Assim, os arquivos de acompanhamento criados pelo `web-ext` não poluem as pastas geradas de instalação. Esse diretório deve estar ignorado pelo Git e preservado em caso de revisão pendente.

Ele recusa sobrescrever um XPI já recebido ou assinar fontes diferentes com a mesma versão. Para código novo, aumente a versão dos manifestos e `package.json`, gere os pacotes e faça uma nova assinatura. Se o AMO já tiver usado aquela versão, a própria Mozilla também poderá recusar o envio; não altere certificados ou verificações para contornar isso.

## Conferência e instalação

Após sucesso do serviço, o script exige exatamente um XPI e confere ZIP, manifestos, ID, versão, arquivos correspondentes à fonte e presença de metadados de assinatura. Também mostra o SHA-256 do arquivo recebido. **Isso não é uma validação criptográfica local da assinatura**: o Firefox faz essa validação na instalação.

O XPI confirmado pode ser distribuído pelo mecanismo de instalação de complementos suportado pelo Firefox. No Firefox Android, a opção de instalar por arquivo depende da edição/versão e das opções de desenvolvedor disponíveis; outra via é uma distribuição Android aprovada pelo AMO. Consulte o [guia da Mozilla para Android](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/) e confirme a instalação no aparelho real antes de chamar a versão de pronta para uso comum. O script não instala no celular nem comprova reprodução em segundo plano ou ganho de XP.

## Evidências deste projeto

O fluxo tem testes locais de plano, argumentos, ocultação de credenciais, falta de variáveis e conferência de artefato. A ajuda e o código do `web-ext` 10.8.0 confirmam o prefixo de variáveis `WEB_EXT`, o canal `unlisted` e a API AMO. Um teste sem credenciais não prova assinatura ou distribuição; esses resultados devem ser relatados separadamente quando houver um XPI efetivamente retornado e conferido.
