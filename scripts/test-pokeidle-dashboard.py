"""PokeIdle: fixture DOM real + painel/core/domínio reais; APIs de navegador simuladas.

Não acessa os serviços externos nem valida XP no servidor, player de live ou Android real.
Requer Playwright para Python e Chromium em /usr/bin/chromium.
"""
import http.server
import threading
from functools import partial
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OWNER = 'pokeidle:twitch'


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


BOOTSTRAP = r'''
(() => {
  let data = {}, nextId = 1;
  const source = {id: 900, windowId: 1, url: 'https://pokeidle.io/app', active: false};
  const tabs = new Map([[source.id, source]]), created = [], removed = [], requests = [];
  const api = {
    runtime: {
      id: 'chat-leve-test',
      getBrowserInfo: async () => ({name:'Firefox'}),
      getPlatformInfo: async () => ({os:'android'}),
      getURL: path => new URL(path, location.href).href
    },
    storage: {local: {
      get: async () => structuredClone(data),
      set: async value => Object.assign(data, structuredClone(value))
    }},
    tabs: {
      create: async options => {
        const tab = {id:nextId++, windowId:1, ...options};
        tabs.set(tab.id, tab); created.push(structuredClone(tab));
        return structuredClone(tab);
      },
      get: async id => {if(!tabs.has(id))throw Error('Aba fechada');return structuredClone(tabs.get(id));},
      query: async query => {
        const patterns = Array.isArray(query?.url) ? query.url : query?.url ? [query.url] : [];
        return structuredClone([...tabs.values()].filter(tab => !patterns.length || patterns.some(pattern => tab.url.startsWith(pattern.replace(/\*.*$/, '')))));
      },
      update: async (id, options) => {
        if(Object.hasOwn(options,'muted'))throw Error('tabs.update muted não suportado no Android');
        if(!tabs.has(id))throw Error('Aba fechada');
        Object.assign(tabs.get(id),options);return structuredClone(tabs.get(id));
      },
      remove: async id => {removed.push(id);tabs.delete(id);},
      sendMessage: async (id,message) => {requests.push({id,message});return {accepted:true};},
      reload: async id => {if(!tabs.has(id))throw Error('Aba fechada');}
    },
    notifications: {create:async id=>id},
    windows: {update:async()=>{throw Error('Não deve focar janela desktop no Android');}}
  };
  let controller, queue=Promise.resolve();
  window.__dispatch = (message,sender={}) => {
    const result=queue.then(async()=>{
      controller ||= (await import('/src/core.js')).createController(api);
      return controller(message,sender);
    });
    queue=result.catch(()=>{});return result;
  };
  window.__readFixture = async () => {
    const {readPokeIdleTwitch}=await import('/src/pokeidle.js');
    const html=await (await fetch('/tests/fixtures/pokeidle-twitch.html')).text();
    const document=new DOMParser().parseFromString(html,'text/html');
    return readPokeIdleTwitch(document);
  };
  window.__ingest = snapshot => __dispatch({type:'pokeidleSnapshot',snapshot}, {
    id:api.runtime.id,tab:{id:900,url:source.url},url:source.url,frameId:0
  });
  window.__state = () => structuredClone(data);
  window.__tabs = () => structuredClone([...tabs.values()]);
  window.__created = () => structuredClone(created);
  window.__removed = () => [...removed];
  window.__requests = () => structuredClone(requests);
  window.browser = {runtime:{sendMessage:async message=>{
    try{return {ok:true,state:await __dispatch(message)};}
    catch(error){return {ok:false,error:error.message};}
  }}};
})();
'''


def idle(page):
    page.wait_for_function("!document.querySelector('#start-all').disabled")


def refresh(page):
    page.get_by_role('button', name='Atualizar', exact=True).tap()
    idle(page)


def open_panel(page, selector):
    panel = page.locator(selector)
    if not panel.evaluate('node=>node.open'):
        panel.locator(':scope > summary').tap()


def add_channel(page, platform, name):
    page.locator('#platform').select_option(platform)
    page.locator('#channel').fill(name)
    page.get_by_role('button', name='Adicionar', exact=True).tap()
    page.wait_for_function("document.querySelector('#channel').value === ''")
    idle(page)


def ingest(page, snapshot):
    result = page.evaluate('snapshot=>__ingest(snapshot)', snapshot)
    assert result == {'accepted': True}, result
    refresh(page)


def auto_sessions(page):
    return page.evaluate("Object.entries(__state().sessions).filter(([,session])=>session.ownerIds.includes('pokeidle:twitch')).map(([id,session])=>({id,...session}))")


def run_width(browser, server, width):
    context = browser.new_context(viewport={'width': width, 'height': 740}, is_mobile=True, has_touch=True,
                                  user_agent='Mozilla/5.0 (Android 14; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0')
    page = context.new_page()
    page.set_default_timeout(12000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(BOOTSTRAP)
    page.goto(f'http://127.0.0.1:{server.server_port}/src/popup.html')
    idle(page)
    snapshot = page.evaluate('__readFixture()')
    assert snapshot['ready']
    assert len(snapshot['channels']) == 16
    assert sum(channel['live'] and channel['bonus'] for channel in snapshot['channels']) == 8
    assert sum(channel['missing'] for channel in snapshot['channels']) == 8
    assert '+15%' in snapshot['ruleText'] and '+2,5%' in snapshot['ruleText']
    assert len(page.evaluate('__tabs()')) == 1, 'parser não deve executar ações ou abrir links do fixture'

    ingest(page, snapshot)
    page.wait_for_function("document.querySelector('#pokeidle-official-count').textContent === '16'")
    assert page.locator('#pokeidle-live-bonus-count').inner_text() == '8'
    assert page.locator('#pokeidle-missing-count').inner_text() == '8'
    assert page.locator('#pokeidle-rule-text').inner_text() == snapshot['ruleText']
    assert len(auto_sessions(page)) == 3
    assert page.evaluate('__state().settings.maxConcurrent') == 3
    assert page.evaluate('__state().queue.length') == 5
    assert '5 canais aguardam' in page.locator('#pokeidle-waiting').inner_text()
    assert 'Limite atual: 3' in page.locator('#pokeidle-waiting').inner_text()
    assert page.locator('#xp-total').inner_text() == 'Sem comparação'
    assert all(session['media'] == 'live' for session in auto_sessions(page))
    assert page.evaluate("Object.entries(__state().sessions).every(([id,session])=>{const tab=__tabs().find(t=>t.id===session.tabId);return tab.muted===true && tab.active===false && tab.url==='https://www.twitch.tv/'+id.slice(7)})")
    assert 'Twitch com vídeo' in page.locator('#channels').inner_text()

    before = page.evaluate('__created().length')
    original = auto_sessions(page)
    ingest(page, snapshot)
    page.get_by_role('button', name='Sincronizar agora', exact=True).tap()
    idle(page)
    assert page.evaluate('__created().length') == before
    assert [session['tabId'] for session in auto_sessions(page)] == [session['tabId'] for session in original]
    page.get_by_role('button', name='Abrir PokeIdle', exact=True).tap()
    idle(page)
    assert page.evaluate('__created().length') == before
    assert page.evaluate('__tabs().find(tab=>tab.id===900).active')

    first = original[0]
    no_missing = {**snapshot, 'channels': [dict(channel, missing=False) if 'twitch:' + channel['name'] == first['id'] else dict(channel) for channel in snapshot['channels']]}
    ingest(page, no_missing)
    assert page.evaluate('id=>__state().sessions[id].tabId', first['id']) == first['tabId'], 'a ausência de missing não comprova XP e não deve fechar a live ativa'
    assert first['tabId'] not in page.evaluate('__removed()')
    offline = {**no_missing, 'channels': [dict(channel, live=False) if 'twitch:' + channel['name'] == first['id'] else dict(channel) for channel in no_missing['channels']]}
    ingest(page, offline)
    assert page.evaluate('id=>!__state().sessions[id]', first['id'])
    assert first['tabId'] in page.evaluate('__removed()')
    assert len(auto_sessions(page)) == 3, 'canal offline deve liberar vaga para a fila'
    assert page.evaluate('__state().queue.length') == 4

    page.get_by_role('button', name='Fechar todos', exact=True).tap()
    idle(page)
    assert page.evaluate('__state().automationPaused')
    assert page.evaluate('Object.keys(__state().sessions).length') == 0
    closed_count = page.evaluate('__created().length')
    ingest(page, snapshot)
    assert page.evaluate('__created().length') == closed_count
    assert page.evaluate('__state().queue.length') == 0
    assert page.evaluate('Object.keys(__state().sessions).length') == 0
    assert 'Automação pausada' in page.locator('#pokeidle-waiting').inner_text()
    open_panel(page, '#schedule-panel')
    page.get_by_role('button', name='Retomar agenda', exact=True).tap()
    idle(page)
    assert len(auto_sessions(page)) == 3
    assert page.evaluate('__state().queue.length') == 5

    # Promove um canal automático também a sessão manual por ações normais do painel.
    shared = auto_sessions(page)[0]
    add_channel(page, 'twitch', shared['id'].split(':', 1)[1])
    page.get_by_role('button', name='Iniciar todos', exact=True).tap()
    idle(page)
    assert page.evaluate('id=>__state().sessions[id].ownerIds.includes("manual")', shared['id'])
    shared_tab = page.evaluate('id=>__state().sessions[id].tabId', shared['id'])
    add_channel(page, 'kick', 'yetz')
    kick_row = page.locator('#channels .row').filter(has_text='yetz')
    kick_row.locator('select').select_option('2')
    page.wait_for_function("__state().channels.find(channel=>channel.id==='kick:yetz').priority===2")
    idle(page)
    kick_row.get_by_role('button', name='Iniciar', exact=True).tap()
    idle(page)
    assert page.evaluate("__state().queue.includes('kick:yetz')")
    candidate = next(session for session in auto_sessions(page) if session['id'] != shared['id'])
    page.locator('#channels .row').filter(has_text=candidate['id'].split(':', 1)[1]).get_by_role('button', name='Fechar', exact=True).tap()
    page.wait_for_function("!!__state().sessions['kick:yetz']")
    idle(page)
    kick_tab = page.evaluate("__state().sessions['kick:yetz'].tabId")
    assert page.evaluate("__state().sessions['kick:yetz'].ownerIds.includes('manual')")
    page.locator('#pokeidle-enabled').uncheck()
    idle(page)
    assert page.evaluate('__state().pokeidle.enabled') is False
    assert len(auto_sessions(page)) == 0
    assert page.evaluate('id=>__state().sessions[id].tabId', shared['id']) == shared_tab
    assert page.evaluate("__state().sessions['kick:yetz'].tabId") == kick_tab
    assert shared_tab not in page.evaluate('__removed()') and kick_tab not in page.evaluate('__removed()')
    assert page.evaluate('__state().queue.length') == 0
    assert page.evaluate('__tabs().some(tab=>tab.id===900)'), 'a página PokeIdle deve ser preservada'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'overflow em {width}px'
    assert not errors, errors
    assert page.locator('#error').is_hidden(), page.locator('#error').text_content()
    context.close()
    print(f'PASS: PokeIdle {width}px — fixture16/8/8, limite3/fila5, Twitch live muted, sync idempotente, missing=false preservado, offline avança fila, StopAll pausa, retoma e disable preserva sessões manuais. Core/domínio reais; APIs simuladas; sem XP servidor.')


def run():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
            for width in (320, 360):
                run_width(browser, server, width)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    run()
