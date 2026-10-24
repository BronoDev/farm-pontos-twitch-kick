"""Layout desktop/popup/móvel e configuração progressiva com controlador real.

Usa Chromium e APIs de extensão simuladas. Não valida instalação nativa ou XP.
Requer Playwright para Python e /usr/bin/chromium.
"""
import http.server
import threading
from functools import partial
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


BOOTSTRAP = r'''
(() => {
  const key='chat-leve-layout-test';
  const saved=JSON.parse(localStorage.getItem(key)||'{}');
  let data=saved.data||{}, nextId=saved.nextId||1;
  const tabs=new Map(saved.tabs||[]), created=[];
  const persist=()=>localStorage.setItem(key,JSON.stringify({data,nextId,tabs:[...tabs]}));
  const api={
    runtime:{id:'layout-test',getURL:path=>new URL('/src/'+path,location.href).href},
    storage:{local:{
      get:async()=>structuredClone(data),
      set:async value=>{Object.assign(data,structuredClone(value));persist();}
    }},
    tabs:{
      create:async options=>{
        const tab={id:nextId++,windowId:1,...options};
        tabs.set(tab.id,tab);created.push(structuredClone(tab));persist();
        return structuredClone(tab);
      },
      get:async id=>{if(!tabs.has(id))throw Error('Aba fechada');return structuredClone(tabs.get(id));},
      update:async(id,options)=>{Object.assign(tabs.get(id),options);persist();return structuredClone(tabs.get(id));},
      query:async()=>structuredClone([...tabs.values()]),
      remove:async id=>{tabs.delete(id);persist();},
      reload:async()=>{},
      sendMessage:async()=>({ok:true})
    },
    windows:{update:async()=>{}},
    notifications:{create:async id=>id}
  };
  let controller,queue=Promise.resolve();
  window.__dispatch=(message,sender={})=>{
    const result=queue.then(async()=>{
      controller||=(await import('/src/core.js')).createController(api);
      return controller(message,sender);
    });
    queue=result.catch(()=>{});return result;
  };
  window.__state=()=>structuredClone(data);
  window.__created=()=>structuredClone(created);
  window.__legacyPreferences=()=>{delete data.uiPreferences;delete data.automationsMigrated;persist();};
  window.__ingestFixture=async()=>{
    const {readPokeIdleTwitch}=await import('/src/pokeidle.js');
    const html=await(await fetch('/tests/fixtures/pokeidle-twitch.html')).text();
    const snapshot=readPokeIdleTwitch(new DOMParser().parseFromString(html,'text/html'));
    tabs.set(900,{id:900,windowId:1,url:'https://pokeidle.io/app'});
    return __dispatch({type:'pokeidleSnapshot',snapshot},{id:api.runtime.id,tab:{id:900},url:'https://pokeidle.io/app',frameId:0});
  };
  window.browser={runtime:{sendMessage:async message=>{
    try{const state=await __dispatch(message);window.__replyCount=(window.__replyCount||0)+1;return {ok:true,state};}
    catch(error){return {ok:false,error:error.message};}
  }}};
})();
'''


def idle(page):
    page.wait_for_function("window.__replyCount > 0 && typeof __state === 'function' && !!__state().settings && !document.querySelector('#channel').disabled")


def open_details(page, selector):
    details = page.locator(selector)
    if not details.evaluate('element=>element.open'):
        details.locator(':scope > summary').click()


def refresh(page):
    page.locator('#refresh').click()
    idle(page)


def add(page, platform, name):
    page.locator('#platform').select_option(platform)
    page.locator('#channel').fill(name)
    page.locator('#add-form button[type=submit]').click()
    page.wait_for_function("document.querySelector('#channel').value === ''")
    idle(page)


def show_feature(page, feature, visible=True):
    open_details(page, '#personalization-panel')
    page.locator(f'#show-{feature}').set_checked(visible)
    page.wait_for_function("([feature,visible])=>__state().uiPreferences.panels[feature]===visible", arg=[feature, visible])
    idle(page)


def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'O documento não pode rolar horizontalmente'
    outside = page.evaluate('''() => [...document.querySelectorAll('button,input,select,textarea,summary')]
      .filter(element=>element.getClientRects().length)
      .filter(element=>{const r=element.getBoundingClientRect();return r.left < -1 || r.right > innerWidth+1;})
      .map(element=>element.id||element.textContent.trim().slice(0,60))''')
    assert not outside, outside


def run_size(browser, origin, width, height):
    context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=width <= 600)
    page = context.new_page()
    page.set_default_timeout(10000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(BOOTSTRAP)
    page.goto(origin + '/src/popup.html')
    idle(page)

    # Primeiro uso: somente configuração útil, sem contadores ou formulários vazios.
    for selector in ('#bonuses-panel', '#history-panel', '#schedule-panel', '#overview', '#alerts-panel', '#kick-options', '#pokeidle-panel', '#session-controls', '#channel-toolbar'):
        assert page.locator(selector).is_hidden(), selector
    assert page.locator('#add-kick-options').is_visible()
    page.locator('#platform').select_option('twitch')
    assert page.locator('#add-kick-options').is_hidden()
    show_feature(page, 'pokeidle')
    assert page.locator('#pokeidle-setup').is_visible()
    assert page.locator('#open-pokeidle').is_visible()
    assert page.locator('#add-form').is_visible()
    no_overflow(page)
    if width >= 1000:
        body = page.locator('body').bounding_box()
        assert body['width'] >= 1000, body
        form = page.locator('#add-form').bounding_box()
        pokeidle = page.locator('#pokeidle-panel').bounding_box()
        assert pokeidle['x'] > form['x'] + form['width'] / 2, (form, pokeidle)
    else:
        assert page.locator('body').bounding_box()['width'] <= width

    add(page, 'twitch', 'canal_twitch')
    assert page.locator('#kick-options').is_hidden()
    assert page.locator('#session-controls').is_visible()
    page.evaluate('scrollTo(0,0)')
    start = page.locator('#start-all').bounding_box()
    assert start['y'] + start['height'] <= height, f'Iniciar todos fora da primeira tela em {width}px: {start}'
    add(page, 'kick', 'um_canal_com_nome_comprido_123456789')
    open_details(page, '#settings-panel')
    open_details(page, '#kick-options')
    assert page.locator('#kick-live').is_visible()
    page.locator('#settings-panel > summary').click()
    page.locator('#start-all').click()
    idle(page)
    assert len(page.evaluate('Object.keys(__state().sessions)')) == 2

    row = page.locator('#channels .row').filter(has_text='canal_twitch')
    assert row.locator('details.channel-options').is_visible()
    priority = row.locator('select[aria-label^="Prioridade de "]')
    assert priority.is_hidden()
    row.locator('details.channel-options > summary').click()
    assert priority.is_visible()
    priority.select_option('1')
    idle(page)
    assert page.evaluate("__state().channels.find(channel=>channel.id==='twitch:canal_twitch').priority") == 1

    for feature in ('bonuses', 'history', 'schedule'):
        show_feature(page, feature)
        assert page.locator('#' + ('history' if feature == 'history' else feature) + '-panel').is_visible()
        open_details(page, '#' + feature + '-panel')
        no_overflow(page)
    assert page.locator('#overview').is_visible()
    page.reload()
    idle(page)
    for feature in ('bonuses', 'history', 'schedule'):
        assert page.evaluate('feature=>__state().uiPreferences.panels[feature]', feature) is True
        show_feature(page, feature, False)
    assert page.locator('#overview').is_hidden()
    page.reload()
    idle(page)
    for feature in ('bonuses', 'history', 'schedule'):
        assert page.locator('#' + feature + '-panel').is_hidden()
    assert len(page.evaluate('Object.keys(__state().sessions)')) == 2, 'Ocultar recursos não encerra as sessões'

    assert page.evaluate('__ingestFixture()') == {'accepted': True}
    refresh(page)
    assert page.locator('#pokeidle-setup').is_hidden()
    assert page.locator('#pokeidle-configured').is_visible()
    assert page.locator('#pokeidle-official-count').inner_text() == '16'
    assert len(page.evaluate('__state().channels')) == 18
    assert page.evaluate("__created().filter(tab=>new URL(tab.url).hostname==='www.twitch.tv').every(tab=>new URL(tab.url).pathname.startsWith('/popout/'))"), 'A lista PokeIdle não deve gerar players Twitch'
    assert page.locator('#channel-toolbar').is_visible()
    no_overflow(page)
    if width <= 480:
        assert page.locator('#stop-all').bounding_box()['height'] >= 44
    if width < 960:
        page.locator('#open-dashboard').click()
        idle(page)
        assert page.evaluate('__created().at(-1).active') is True
        assert page.evaluate('__created().at(-1).url') == origin + '/src/popup.html'
    else:
        assert page.locator('#open-dashboard').is_hidden(), 'O painel completo não precisa abrir outra cópia'
    assert not errors, errors
    assert page.locator('#error').is_hidden(), page.locator('#error').text_content()
    if width == 1440:
        page.screenshot(path='/tmp/chat-leve-desktop-after.png', full_page=True)
    print(f'PASS: layout {width}x{height} — configuração progressiva, ações acessíveis, Kick/PokeIdle condicionais, opções por canal, preferências persistidas e sem overflow. APIs simuladas.')
    context.close()


def legacy_data(browser, origin):
    context = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = context.new_page()
    page.add_init_script(BOOTSTRAP)
    page.goto(origin + '/src/popup.html')
    idle(page)
    add(page, 'kick', 'yetz')
    page.evaluate('''async()=>{
      await __dispatch({type:'addBonus',bonus:{channelId:'kick:yetz',title:'Bônus existente'}});
      await __dispatch({type:'addMeasurement',measurement:{channelId:'global',xp:100,at:Date.now()}});
      await __dispatch({type:'addSchedule',schedule:{channelIds:['kick:yetz'],startsAt:Date.now()+60000,endsAt:Date.now()+300000}});
      await __ingestFixture();
      __legacyPreferences();
    }''')
    page.reload()
    idle(page)
    for feature in ('bonuses', 'history', 'schedule'):
        assert page.locator('#' + feature + '-panel').is_visible(), feature
    assert page.locator('#pokeidle-panel').is_visible(), 'uma origem PokeIdle configurada permanece visível após a atualização'
    counts = page.evaluate('[__state().bonuses.length,__state().measurements.length,__state().schedules.length]')
    assert counts == [1, 1, 1], counts
    assert page.evaluate('__state().schedules[0].enabled') is False, 'Horários antigos devem migrar desativados, preservando os registros'
    show_feature(page, 'schedule', False)
    page.reload()
    idle(page)
    assert page.locator('#schedule-panel').is_hidden()
    assert page.evaluate('__state().schedules[0].enabled') is False, 'Ocultar a automação não deve reativar horários antigos'
    assert page.evaluate('[__state().bonuses.length,__state().measurements.length,__state().schedules.length]') == counts
    context.close()
    print('PASS: dados antigos tornam os recursos visíveis; migração desativa horários antigos sem apagá-los e ocultação persiste sem reativá-los.')


def packaged_panels(browser, origin):
    # O popup importa ESM; o background Firefox usa uma cópia clássica distinta.
    for target in ('firefox', 'firefox-android'):
        context = browser.new_context(viewport={'width': 600, 'height': 600})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script(BOOTSTRAP)
        page.goto(origin + '/instalar/' + target + '/popup.html')
        idle(page)
        assert page.locator('#history-panel').is_hidden()
        show_feature(page, 'history')
        assert page.locator('#history-panel').is_visible()
        no_overflow(page)
        assert not errors, errors
        context.close()
        print(f'PASS: painel gerado {target} carrega seu módulo ESM e configura a interface. Chromium com APIs simuladas.')


def run():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
            origin = f'http://127.0.0.1:{server.server_port}'
            for width, height in ((600, 600), (1280, 800), (1440, 900), (320, 740), (360, 740)):
                run_size(browser, origin, width, height)
            legacy_data(browser, origin)
            packaged_panels(browser, origin)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    run()
