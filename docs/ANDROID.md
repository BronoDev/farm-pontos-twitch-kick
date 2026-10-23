# Android: Firefox 142+ — pacote para desenvolvimento

O projeto tem um pacote específico para **Firefox no Android**, em `instalar/firefox-android/`, com ZIP em [downloads/chat-leve-firefox-android.zip](https://github.com/BronoDev/farm-pontos-twitch-kick/raw/refs/heads/main/downloads/chat-leve-firefox-android.zip). O painel se adapta a telas pequenas e toque. A extensão continua dependendo do navegador; não é um APK.

**O pacote não tem assinatura Mozilla e ainda não foi testado em um aparelho Android real.** Não há link de instalação pelo Mozilla Add-ons. Baixar o ZIP no celular não o instala no Firefox comum. A opção `about:debugging → Carregar extensão temporária` usada no Firefox do PC não é o procedimento no celular.

Opera GX e Chrome para Android não oferecem o carregamento desta extensão pelo modo de desenvolvedor do desktop. Não tente usar `opera://extensions` ou `chrome://extensions` desses navegadores móveis como se fossem as versões de PC. O alvo preparado por este projeto é Firefox Android; outros navegadores móveis não foram verificados.

## Instalação para uso comum

Ainda falta enviar o pacote ao Mozilla Add-ons, usando a conta do mantenedor, para revisão/assinatura e distribuição compatível com Android. O identificador Gecko e o arquivo ZIP não substituem uma assinatura. Não há XPI assinado neste repositório e não é necessário desativar a verificação de assinatura.

## Teste temporário por USB (requer computador)

O fluxo abaixo segue o [guia da Mozilla para desenvolver no Firefox Android](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/). Os comandos são instruções para executar no computador; não foram executados contra um dispositivo neste ambiente.

1. Instale Firefox Nightly 142+ no Android (pacote `org.mozilla.fenix`) e abra ao menos uma aba.
2. No computador, tenha Node.js 22+, os [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools) com `adb` no PATH e este projeto extraído. Não precisa instalar o Android Studio inteiro.
3. Ative a depuração USB nas opções de desenvolvedor do Android e a depuração remota por USB nas configurações do Firefox. Conecte o celular por USB e autorize o computador quando solicitado.
4. No computador, rode `adb devices`. Anote o identificador do aparelho autorizado.
5. Na raiz do projeto, execute, substituindo `ID_DO_APARELHO` pelo identificador:

```sh
npm run android:run -- --android-device=ID_DO_APARELHO
```

O comando usa `web-ext` 10.8.0 para instalar temporariamente a pasta `instalar/firefox-android`. O primeiro uso pode baixar a ferramenta pelo npm. O pacote já vem gerado: não é necessário executar build para esse teste. O Firefox Nightly é o alvo desse atalho; para outra edição, use diretamente `web-ext run` com o identificador correto do APK conforme a documentação da Mozilla.

6. No Firefox do Android, abra Chat Leve pelo menu de extensões. Se preferir, abra a página de opções da extensão para usar o painel em uma aba inteira.
7. Faça login na Kick/Twitch **nesse Firefox**, adicione um canal e teste **Iniciar todos**, **Atualizar** e **Fechar todos**. Confira reprodução real e qualidade na aba Kick, e confira pontos nas plataformas. Dados de outros navegadores/dispositivos não são compartilhados automaticamente.

Esse é um carregamento de desenvolvimento, não uma instalação permanente. A extensão e seus dados temporários podem deixar de estar disponíveis após encerramento/reinício do navegador.

## Adaptações realizadas

- Painel responsivo, campos maiores, controles por toque e quebra de linhas para nomes compridos.
- Página de opções que pode ser aberta como aba; o controlador aceita mensagens dessa página sem liberar os comandos para sites externos.
- No Firefox Android, usa `tabs.create({active: false, muted: true})`. Não tenta silenciar usando `tabs.update({muted: true})`, que consta como não suportado no Android nos dados de compatibilidade da MDN.
- Vídeo Kick com `playsinline` e áudio silenciado, evitando solicitar reprodução em tela cheia. O Android e o player ainda podem impor suas próprias regras.
- Manifesto Android separado (Manifest V2, scripts de segundo plano não persistentes), sem service worker, com acesso à Kick declarado nas permissões de instalação. Os pacotes desktop mantêm seus manifestos próprios.

## Limites de execução no celular

Não há serviço nativo Android, bloqueio de suspensão, execução garantida com tela apagada ou prevenção do encerramento do navegador. Trocar de app, bloquear a tela, economizar bateria ou usar muitas abas pode pausar as lives ou encerrar processos. Autoplay pode exigir abrir a aba e tocar no player. O menu de qualidade da Kick no celular pode ser diferente e exigir seleção manual. Nada disso comprova concessão de pontos; confira o saldo real.

Os testes locais cobrem APIs simuladas e layouts móveis em Chromium, não o Firefox Android real. Veja [VALIDACAO.md](VALIDACAO.md).

Referências usadas: [compatibilidade MDN de tabs](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/tabs.json), [metadados Gecko Android](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings) e o guia da Mozilla acima.
