"""Modos Kick por canal, filtros e configuração progressiva com core real.

Usa Chromium e APIs simuladas; não valida o player remoto, pontos ou Android nativo.
Requer Playwright para Python e /usr/bin/chromium.
"""
import http.server
import runpy
import threading
from functools import partial
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
helpers = runpy.run_path(str(ROOT / 'scripts/test-desktop-ui.py'))
BOOTSTRAP = helpers['BOOTSTRAP']
QuietHandler = helpers['QuietHandler']
idle = helpers['idle']
open_details = helpers['open_details']
show_feature = helpers['show_feature']
no_overflow = helpers['no_overflow']


def add(page, platform, name, mode='default'):
    page.locator('#platform').select_option(platform)
    assert page.locator('#add-kick-options').is_visible() == (platform == 'kick')
    if platform == 'kick':
        page.locator('#add-kick-mode').select_option(mode)
    page.locator('#channel').fill(name)
    page.locator('#add-form button[type=submit]').click()
    page.wait_for_function("document.querySelector('#channel').value === ''")
    idle(page)


def row(page, name):
    return page.locator('#channels .row').filter(has_text=name)


def mode(page, name, value):
    channel = row(page, name)
    options = channel.locator('details.channel-options')
    if not options.evaluate('element=>element.open'):
        options.locator(':scope > summary').click()
    channel.locator('select[data-kick-mode]').select_option(value)
    page.wait_for_function("([name,value])=>__state().channels.find(channel=>channel.id==='kick:'+name).kickMode===value", arg=[name, value])
    idle(page)


def sessions(page):
    return page.evaluate('__state().sessions')


def no_control_overlap(page):
    overlaps = page.evaluate('''() => {
      const groups = [[...document.querySelector('#add-form').children],
        ...[...document.querySelectorAll('#channels .row')].map(row=>[...row.children])];
      const problems=[];
      for(const group of groups){
        const visible=group.filter(element=>element.getClientRects().length);
        for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
          const a=visible[i].getBoundingClientRect(), b=visible[j].getBoundingClientRect();
          if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1
            && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)
            problems.push([visible[i].id||visible[i].className,visible[j].id||visible[j].className]);
        }
      }
      return problems;
    }''')
    assert not overlaps, overlaps


def run_size(browser, origin, width, height):
    context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=width <= 600)
    page = context.new_page()
    page.set_default_timeout(12000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(BOOTSTRAP)
    page.goto(origin + '/src/popup.html')
    idle(page)
    assert page.locator('#pokeidle-panel').is_hidden()
    assert page.locator('#channel-toolbar').is_hidden()

    add(page, 'kick', 'kick_chat', 'chat')
    add(page, 'kick', 'kick_live', 'live')
    add(page, 'twitch', 'twitch_chat')
    add(page, 'kick', 'kick_wait', 'live')
    open_details(page, '#settings-panel')
    page.locator('#max-concurrent').fill('4')
    page.locator('#max-kick-lives').fill('1')
    page.get_by_role('button', name='Salvar limites', exact=True).click()
    idle(page)
    page.locator('#start-all').click()
    idle(page)
    active = sessions(page)
    assert set(active) == {'kick:kick_chat', 'kick:kick_live', 'twitch:twitch_chat'}, active
    assert active['kick:kick_chat']['media'] == 'chat'
    assert active['kick:kick_live']['media'] == 'live'
    assert active['twitch:twitch_chat']['media'] == 'chat'
    assert page.evaluate("__created().find(tab=>tab.id===__state().sessions['twitch:twitch_chat'].tabId).url") == 'https://www.twitch.tv/popout/twitch_chat/chat?popout='
    assert page.evaluate("__created().find(tab=>tab.id===__state().sessions['kick:kick_live'].tabId).url") == 'https://kick.com/kick_live'
    assert page.evaluate("__created().find(tab=>tab.id===__state().sessions['kick:kick_chat'].tabId).url") == 'https://kick.com/popout/kick_chat/chat'
    assert page.evaluate('__state().queue') == ['kick:kick_wait']
    initial_chat_tab = active['kick:kick_chat']['tabId']
    twitch_tab = active['twitch:twitch_chat']['tabId']

    # Converter só a live ativa para chat libera uma vaga Kick para a fila.
    mode(page, 'kick_live', 'chat')
    active = sessions(page)
    assert active['kick:kick_live']['media'] == 'chat'
    assert active['kick:kick_wait']['media'] == 'live'
    assert active['kick:kick_chat']['tabId'] == initial_chat_tab
    assert active['twitch:twitch_chat']['tabId'] == twitch_tab
    converted_chat_tab = active['kick:kick_live']['tabId']
    waiting_live_tab = active['kick:kick_wait']['tabId']

    # A escolha individual é salva, mas aguarda o limite em vez de excedê-lo.
    mode(page, 'kick_chat', 'live')
    active = sessions(page)
    assert 'kick:kick_chat' not in active
    assert page.evaluate('__state().queue') == ['kick:kick_chat']
    assert active['kick:kick_wait']['tabId'] == waiting_live_tab
    assert active['kick:kick_live']['tabId'] == converted_chat_tab
    assert active['twitch:twitch_chat']['tabId'] == twitch_tab
    row(page, 'kick_wait').get_by_role('button', name='Fechar', exact=True).click()
    idle(page)
    active = sessions(page)
    assert active['kick:kick_chat']['media'] == 'live'
    explicit_live_tab = active['kick:kick_chat']['tabId']
    assert 'kick:kick_wait' not in active

    # Alterar o padrão só afeta quem escolheu Padrão da Kick.
    add(page, 'kick', 'kick_default')
    row(page, 'kick_default').get_by_role('button', name='Iniciar', exact=True).click()
    idle(page)
    assert 'kick:kick_default' in page.evaluate('__state().queue')
    open_details(page, '#settings-panel')
    open_details(page, '#kick-options')
    page.locator('#kick-live').uncheck()
    idle(page)
    active = sessions(page)
    assert active['kick:kick_default']['media'] == 'chat'
    assert active['kick:kick_chat']['tabId'] == explicit_live_tab
    assert active['kick:kick_live']['tabId'] == converted_chat_tab
    assert active['twitch:twitch_chat']['tabId'] == twitch_tab
    no_overflow(page)
    no_control_overlap(page)

    page.locator('#stop-all').click()
    idle(page)
    count = page.evaluate('__created().length')
    mode(page, 'kick_wait', 'chat')
    assert sessions(page) == {}
    assert page.evaluate('__state().automationPaused')
    assert page.evaluate('__created().length') == count, 'Trocar modo de um canal parado não deve reabrir abas'

    add(page, 'twitch', 'outro_twitch')
    assert page.locator('#channel-toolbar').is_visible()
    before = page.evaluate('JSON.stringify({channels:__state().channels,sessions:__state().sessions,queue:__state().queue})')
    page.locator('#channel-search').fill('kick_live')
    assert page.locator('#channels .row').count() == 1
    assert row(page, 'kick_live').is_visible()
    page.locator('#channel-search').fill('sem_canal_correspondente')
    assert page.locator('#channels .row').count() == 0
    assert page.get_by_text('Nenhum canal corresponde à busca ou ao filtro.', exact=True).is_visible()
    assert page.locator('#channels .welcome').count() == 0, 'Busca vazia não é uma instalação sem canais'
    page.get_by_role('button', name='Limpar filtros', exact=True).click()
    assert page.locator('#channel-search').input_value() == ''
    for value, expected in [('kick', 4), ('twitch', 2), ('active', 0), ('queued', 0), ('all', 6)]:
        page.locator('#channel-filter').select_option(value)
        assert page.locator('#channels .row').count() == expected, (value, expected)
    assert page.evaluate('JSON.stringify({channels:__state().channels,sessions:__state().sessions,queue:__state().queue})') == before

    # Mostrar/ocultar a integração não altera seu funcionamento nem os canais.
    show_feature(page, 'pokeidle')
    assert page.locator('#pokeidle-setup').is_visible()
    show_feature(page, 'pokeidle', False)
    assert page.locator('#pokeidle-panel').is_hidden()
    assert page.evaluate('__ingestFixture()') == {'accepted': True}
    helpers['refresh'](page)
    assert page.locator('#pokeidle-panel').is_hidden()
    assert page.evaluate('__state().pokeidle.enabled')
    assert sessions(page) == {}
    page.reload()
    idle(page)
    assert page.locator('#pokeidle-panel').is_hidden()
    assert page.evaluate("__state().channels.find(channel=>channel.id==='kick:kick_chat').kickMode") == 'live'
    assert page.evaluate("__state().channels.find(channel=>channel.id==='kick:kick_live').kickMode") == 'chat'
    assert page.evaluate("__state().channels.find(channel=>channel.id==='kick:kick_wait').kickMode") == 'chat'
    assert page.evaluate('__state().kickLive') is False
    assert page.evaluate('__state().automationPaused')
    assert sessions(page) == {}
    no_overflow(page)
    no_control_overlap(page)
    assert not errors, errors
    assert page.locator('#error').is_hidden(), page.locator('#error').text_content()
    context.close()
    print(f'PASS: Kick {width}x{height} — chat/live por canal, limite de vídeo, migração isolada, padrão global, pausas, filtros sem efeitos e preferências persistidas. Core real; APIs simuladas; sem player remoto/XP.')


def run():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
            origin = f'http://127.0.0.1:{server.server_port}'
            for width, height in ((320, 740), (360, 740), (600, 600), (1280, 800), (1440, 900)):
                run_size(browser, origin, width, height)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    run()
