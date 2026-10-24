"""Regressão de roteamento Twitch/Kick com painel, parser e core reais.

Os links Kick abaixo são uma fixture SINTÉTICA de estrutura conhecida/links canônicos;
não foram capturados do PokeIdle real e não comprovam seus seletores atuais.
Somente DOM e APIs de navegador simuladas: não valida XP ou reprodução remota.
"""
import http.server
import runpy
import threading
from functools import partial
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
helpers = runpy.run_path(str(ROOT / 'scripts/test-pokeidle-dashboard.py'))
layout = runpy.run_path(str(ROOT / 'scripts/test-desktop-ui.py'))

# Fixture propositalmente pequena: mesmo widget conhecido, mais um link sem status.
SYNTHETIC_MIXED_HTML = '''
<div class="tw-canais">
  <a class="tw-canal ao-vivo com-bonus tw-falta-eu" href="https://www.twitch.tv/twitch_fixture">
    <span class="tw-canal-nome">Twitch Fixture</span>
    <span class="tw-canal-bonus" title="Regra sintética de teste">Bônus</span>
  </a>
  <a class="tw-canal ao-vivo com-bonus tw-falta-eu" href="https://kick.com/kick_widget">
    <span class="tw-canal-nome">Kick Widget</span>
  </a>
</div>
<a href="https://kick.com/kick_link">Kick sem estado na página</a>
'''


def assert_twitch_chat_only(page):
    assert page.evaluate(r'''() => __created().filter(tab => new URL(tab.url).hostname === 'www.twitch.tv')
      .every(tab => /^\/popout\/[a-z0-9_]+\/chat$/.test(new URL(tab.url).pathname)
        && new URL(tab.url).search === '?popout=' && tab.active === false && tab.muted === true)'''), 'Toda aba Twitch deve ser somente popout de chat inativo e silencioso'


def mixed_source(browser, origin, width, height):
    context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=width < 600,
                                  has_touch=True, user_agent='Mozilla/5.0 (Android 14; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0')
    page = context.new_page()
    page.set_default_timeout(12000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script('''(() => {const originalNow=Date.now.bind(Date);let offset=0;
      Date.now=()=>originalNow()+offset;window.__advanceClock=ms=>{offset+=ms;};})();''')
    page.add_init_script(helpers['BOOTSTRAP'])
    page.goto(origin + '/src/popup.html')
    helpers['idle'](page)
    page.evaluate("__dispatch({type:'setSettings',settings:{maxConcurrent:6,maxKickLives:3}})")
    page.evaluate("__dispatch({type:'setKickLive',enabled:false})")
    helpers['add_channel'](page, 'kick', 'kick_widget')
    snapshot = page.evaluate('''async html => {
      const {readPokeIdleChannels} = await import('/src/pokeidle.js');
      return readPokeIdleChannels(new DOMParser().parseFromString(html, 'text/html'));
    }''', SYNTHETIC_MIXED_HTML)
    assert snapshot['ready'] and len(snapshot['channels']) == 3, snapshot
    entries = {(item['platform'], item['name']): item for item in snapshot['channels']}
    assert entries[('twitch', 'twitch_fixture')]['live'] is True
    assert entries[('kick', 'kick_widget')]['live'] is True
    unknown = entries[('kick', 'kick_link')]
    assert unknown['live'] is None and unknown['bonus'] is False and unknown['missing'] is False, 'Um link Kick não comprova live, bônus ou elegibilidade'
    helpers['ingest'](page, snapshot)
    state = page.evaluate('__state()')
    assert set(state['sessions']) == {'twitch:twitch_fixture', 'kick:kick_widget'}, state['sessions']
    assert state['sessions']['twitch:twitch_fixture']['media'] == 'chat'
    assert state['sessions']['kick:kick_widget']['media'] == 'live'
    assert page.evaluate("__tabs().find(tab=>tab.id===__state().sessions['kick:kick_widget'].tabId).url") == 'https://kick.com/kick_widget'
    assert page.locator('#pokeidle-twitch-count').inner_text() == '1'
    assert page.locator('#pokeidle-kick-count').inner_text() == '2'
    assert_twitch_chat_only(page)
    initial = page.evaluate('__created().length')
    helpers['ingest'](page, snapshot)
    assert page.evaluate('__created().length') == initial

    # O link sem flag de estado só pode abrir após uma amostra explícita da API.
    page.evaluate("__dispatch({type:'pokeidleKickSnapshot',statuses:{'kick:kick_link':null}})")
    assert page.evaluate("!__state().sessions['kick:kick_link']")
    page.evaluate("__dispatch({type:'pokeidleKickSnapshot',statuses:{'kick:kick_link':true}})")
    helpers['refresh'](page)
    assert page.evaluate("__state().sessions['kick:kick_link'].media") == 'live'
    link_tab = page.evaluate("__state().sessions['kick:kick_link'].tabId")
    assert page.evaluate('id=>__tabs().find(tab=>tab.id===id).url', link_tab) == 'https://kick.com/kick_link'
    if width == 1280:
        page.screenshot(path='/tmp/chat-leve-platform-routing.png', full_page=True)
    page.evaluate("__dispatch({type:'pokeidleKickSnapshot',statuses:{'kick:kick_link':null}})")
    assert page.evaluate("__state().sessions['kick:kick_link'].tabId") == link_tab, 'Erro da API não deve fechar a sessão existente'
    page.evaluate("__dispatch({type:'pokeidleKickSnapshot',statuses:{'kick:kick_link':false}})")
    helpers['refresh'](page)
    assert page.evaluate("!__state().sessions['kick:kick_link']")
    assert link_tab in page.evaluate('__removed()')
    assert page.evaluate("__state().sessions['twitch:twitch_fixture'].media") == 'chat'
    assert_twitch_chat_only(page)

    helpers['open_panel'](page, '#pokeidle-list-panel')
    for value, expected in [('kick', 2), ('twitch', 1), ('all', 3)]:
        page.locator('#pokeidle-filter').select_option(value)
        assert page.locator('#pokeidle-channels .card').count() == expected, (value, expected)
    page.locator('#stop-all').click()
    helpers['idle'](page)
    created = page.evaluate('__created().length')
    helpers['ingest'](page, snapshot)
    page.evaluate("__dispatch({type:'pokeidleKickSnapshot',statuses:{'kick:kick_link':true}})")
    assert page.evaluate('Object.keys(__state().sessions).length') == 0
    assert page.evaluate('__created().length') == created
    assert page.evaluate('__state().automationPaused')
    page.evaluate('__advanceClock(181000)')
    page.evaluate("__dispatch({type:'resumeAutomation'})")
    page.evaluate("__dispatch({type:'pokeidleKickSnapshot',statuses:{'kick:kick_widget':true,'kick:kick_link':true}})")
    helpers['refresh'](page)
    assert page.evaluate('Object.keys(__state().sessions).length') == 0, 'Uma origem PokeIdle vencida não deve iniciar novas sessões'
    assert page.evaluate('__created().length') == created
    assert_twitch_chat_only(page)
    layout['no_overflow'](page)
    assert not errors, errors
    assert page.locator('#error').is_hidden(), page.locator('#error').text_content()
    context.close()
    print(f'PASS: fonte mista {width}x{height} — Twitch só popoutchat; Kick widget/API abre vídeo; link desconhecido não presume live; offline/pausa/duplicação/filtros e origem vencida. Fixture Kick sintética, sem XP remoto.')


def continuous_chat(browser, origin, width, height):
    context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=True)
    page = context.new_page()
    page.set_default_timeout(12000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    # Mesmo bootstrap Android para conferir mute on-create no caminho de chat.
    page.add_init_script(helpers['BOOTSTRAP'])
    page.goto(origin + '/src/popup.html')
    helpers['idle'](page)
    helpers['add_channel'](page, 'twitch', 'twitch_continuo')
    helpers['open_panel'](page, '#personalization-panel')
    page.locator('#show-schedule').check()
    page.wait_for_function("__state().uiPreferences.panels.schedule===true")
    helpers['idle'](page)
    assert page.locator('#watch-twitch-mode').input_value() == 'chat'
    assert page.locator('#twitch-chat-settings').is_hidden(), 'Popout de chat não deve exigir credencial IRC'
    page.locator('#watch-enabled').check()
    page.locator('#watch-form button[type=submit]').click()
    helpers['idle'](page)
    active = page.evaluate('__state().sessions')
    assert set(active) == {'twitch:twitch_continuo'}
    assert active['twitch:twitch_continuo']['media'] == 'chat'
    assert active['twitch:twitch_continuo'].get('transport') != 'irc'
    assert page.evaluate('__state().liveWatch.twitchMode') == 'chat'
    assert_twitch_chat_only(page)
    tab_id = active['twitch:twitch_continuo']['tabId']
    page.evaluate("__dispatch({type:'liveWatchSnapshot',statuses:{'twitch:twitch_continuo':false}})")
    helpers['refresh'](page)
    assert page.evaluate("__state().sessions['twitch:twitch_continuo'].tabId") == tab_id, 'O chat contínuo não precisa abrir player nem fechar com o vídeo offline'
    page.locator('#stop-all').click()
    helpers['idle'](page)
    before = page.evaluate('__created().length')
    page.evaluate("__dispatch({type:'liveWatchSnapshot',statuses:{'twitch:twitch_continuo':true}})")
    helpers['refresh'](page)
    assert page.evaluate('Object.keys(__state().sessions).length') == 0
    assert page.evaluate('__created().length') == before
    assert_twitch_chat_only(page)
    layout['no_overflow'](page)
    assert not errors, errors
    assert page.locator('#error').is_hidden(), page.locator('#error').text_content()
    context.close()
    print(f'PASS: chat contínuo {width}x{height} — popout Twitch sem OAuth/player, offline preserva chat, Fechar todos impede reabertura. Core real, APIs simuladas.')


def kick_priority(browser, origin):
    context = browser.new_context(viewport={'width': 1280, 'height': 800}, has_touch=True)
    page = context.new_page()
    page.set_default_timeout(12000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(helpers['BOOTSTRAP'])
    page.goto(origin + '/src/popup.html')
    helpers['idle'](page)
    original = page.evaluate('__readFixture()')
    helpers['ingest'](page, original)
    assert page.evaluate('Object.keys(__state().sessions).length') == 3
    assert_twitch_chat_only(page)
    mixed = page.evaluate('''async()=>{
      const {readPokeIdleChannels}=await import('/src/pokeidle.js');
      const original=await (await fetch('/tests/fixtures/pokeidle-twitch.html')).text();
      // Link Kick SINTÉTICO, sem sinal de live. Não representa HTML capturado do jogo.
      return readPokeIdleChannels(new DOMParser().parseFromString(original+'<a href="https://kick.com/kick_priority">Kick de teste</a>','text/html'));
    }''')
    helpers['ingest'](page, mixed)
    assert page.evaluate("!__state().sessions['kick:kick_priority']")
    page.evaluate("__dispatch({type:'pokeidleKickSnapshot',statuses:{'kick:kick_priority':true}})")
    helpers['refresh'](page)
    active = page.evaluate('__state().sessions')
    assert len(active) == 3 and active['kick:kick_priority']['media'] == 'live', active
    assert len([name for name in active if name.startswith('twitch:')]) == 2
    assert len(page.evaluate('__removed()')) == 1, 'Somente um chat automático deve liberar a vaga para a Kick'
    assert_twitch_chat_only(page)
    page.evaluate("__dispatch({type:'pokeidleKickSnapshot',statuses:{'kick:kick_priority':false}})")
    helpers['refresh'](page)
    assert page.evaluate("Object.keys(__state().sessions).every(id=>id.startsWith('twitch:'))")
    assert page.evaluate('Object.keys(__state().sessions).length') == 3
    assert_twitch_chat_only(page)
    layout['no_overflow'](page)
    assert not errors, errors
    assert page.locator('#error').is_hidden(), page.locator('#error').text_content()
    context.close()
    print('PASS: cap padrão3 — Kick listada no PokeIdle libera uma vaga de chat automático e abre vídeo; offline fecha Kick e restaura a fila Twitch sóchat. API/DOM simulados.')


def run():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), partial(helpers['QuietHandler'], directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
            origin = f'http://127.0.0.1:{server.server_port}'
            for width, height in ((320, 740), (600, 600), (1280, 800)):
                mixed_source(browser, origin, width, height)
                continuous_chat(browser, origin, width, height)
            kick_priority(browser, origin)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    run()
