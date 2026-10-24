"""Fluxo do painel em 360px: DOM real + controlador/domínio reais, APIs de navegador simuladas.

Não acessa Twitch/Kick/PokeIdle, não concede XP e não valida Android nativo.
Requer Playwright para Python e Chromium em /usr/bin/chromium.
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
  let data = {}, nextId = 1;
  let clock = Math.floor(Date.now() / 60000) * 60000;
  Date.now = () => clock;
  const tabs = new Map(), closed = [], notifications = [];
  const api = {
    runtime: {
      getBrowserInfo: async () => ({name: 'Firefox'}),
      getPlatformInfo: async () => ({os: 'android'}),
      getURL: path => new URL(path, location.href).href
    },
    storage: {local: {
      get: async () => structuredClone(data),
      set: async value => Object.assign(data, structuredClone(value))
    }},
    tabs: {
      create: async options => {
        const tab = {id: nextId++, windowId: 1, ...options};
        tabs.set(tab.id, tab);
        return structuredClone(tab);
      },
      get: async id => {
        if (!tabs.has(id)) throw Error('Aba fechada');
        return structuredClone(tabs.get(id));
      },
      update: async (id, options) => {
        if (Object.hasOwn(options, 'muted')) throw Error('tabs.update muted indisponível no Android');
        if (!tabs.has(id)) throw Error('Aba fechada');
        Object.assign(tabs.get(id), options);
        return structuredClone(tabs.get(id));
      },
      remove: async id => {closed.push(id); tabs.delete(id);},
      reload: async id => {if (!tabs.has(id)) throw Error('Aba fechada');},
      sendMessage: async () => ({ok: true})
    },
    windows: {update: async () => {throw Error('Não deve focar janela desktop no Android');}},
    notifications: {create: async (id, message) => {notifications.push({id, ...message}); return id;}}
  };
  let controller;
  let queue = Promise.resolve();
  const execute = async (message, sender) => {
    controller ||= (await import('/core.js')).createController(api);
    return controller(message, sender);
  };
  window.__dispatch = (message, sender = {}) => {
    const result = queue.then(() => execute(message, sender));
    queue = result.catch(() => {});
    return result;
  };
  window.__state = () => structuredClone(data);
  window.__tabs = () => structuredClone([...tabs.values()]);
  window.__closed = () => [...closed];
  window.__advance = ms => {clock += ms; return clock;};
  window.__setClock = at => {if (at < clock) throw Error('O relógio do teste só avança'); clock = at;};
  window.__notifications = () => structuredClone(notifications);
  window.browser = {runtime: {sendMessage: async message => {
    try {return {ok: true, state: await __dispatch(message)};}
    catch (error) {return {ok: false, error: error.message};}
  }}};
})();
'''


def idle(page):
    page.wait_for_function("!document.querySelector('#channel').disabled")


def open_panel(page, name):
    panel = page.locator(name)
    if not panel.evaluate('node => node.open'):
        panel.locator(':scope > summary').tap()


def enable_panel(page, name):
    open_panel(page, '#personalization-panel')
    page.locator(f'#show-{name}').check()
    page.wait_for_function("name => __state().uiPreferences.panels[name] === true", arg=name)
    idle(page)


def refresh(page):
    page.get_by_role('button', name='Atualizar', exact=True).tap()
    idle(page)


def fill_time(page, selector, timestamp):
    value = page.evaluate('''at => {
      const date = new Date(at);
      return new Date(at - date.getTimezoneOffset()*60000).toISOString().slice(0,16);
    }''', timestamp)
    page.locator(selector).fill(value)


def record(page, xp=None, points=None, at=None):
    enable_panel(page, 'history')
    open_panel(page, '#history-panel')
    page.locator('#measurement-channel').select_option('kick:yetz')
    page.locator('#measurement-xp').fill('' if xp is None else str(xp))
    page.locator('#measurement-points').fill('' if points is None else str(points))
    fill_time(page, '#measurement-at', at if at is not None else page.evaluate('Date.now()'))
    before = page.evaluate('__state().measurements.length')
    page.get_by_role('button', name='Registrar saldo manual', exact=True).tap()
    page.wait_for_function('count => __state().measurements.length === count + 1', arg=before)
    idle(page)


def run():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT / 'src')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
            context = browser.new_context(viewport={'width': 360, 'height': 740}, is_mobile=True, has_touch=True,
                                          user_agent='Mozilla/5.0 (Android 14; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0')
            page = context.new_page()
            page.set_default_timeout(12000)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.add_init_script(BOOTSTRAP)
            page.goto(f'http://127.0.0.1:{server.server_port}/popup.html')
            idle(page)
            page.locator('#android-note').wait_for(state='visible')

            for platform, channel in [('kick', 'yetz'), ('twitch', 'outro')]:
                page.locator('#platform').select_option(platform)
                page.locator('#channel').fill(channel)
                page.get_by_role('button', name='Adicionar', exact=True).tap()
                page.wait_for_function("document.querySelector('#channel').value === ''")
                idle(page)
            open_panel(page, '#settings-panel')
            page.locator('#max-concurrent').fill('1')
            page.locator('#max-kick-lives').fill('1')
            page.get_by_role('button', name='Salvar limites', exact=True).tap()
            page.wait_for_function('__state().settings.maxConcurrent === 1')
            idle(page)
            page.get_by_role('button', name='Iniciar todos', exact=True).tap()
            page.get_by_text('1 de 2 canais abertos', exact=True).wait_for()
            assert page.evaluate('Object.keys(__state().sessions).length') == 1
            assert page.evaluate('__state().queue.length') == 1
            assert page.evaluate("__state().sessions['kick:yetz'].media") == 'live'
            assert page.evaluate('__tabs().every(tab => tab.active === false && tab.muted === true)')

            enable_panel(page, 'bonuses')
            open_panel(page, '#bonuses-panel')
            page.locator('#bonus-channel').select_option('kick:yetz')
            page.locator('#bonus-title').fill('Bônus XP de teste')
            page.locator('#bonus-requirements').fill('Regra conferida no serviço oficial; requisitos cumpridos pelo usuário.')
            page.locator('#bonus-source').fill('https://pokeidle.io/app')
            page.locator('#bonus-points').fill('100')
            page.locator('#bonus-cooldown').fill('60')
            page.locator('#bonus-verified').check()
            page.locator('#bonus-requirements-met').check()
            page.locator('#bonus-submit').tap()
            page.wait_for_function('__state().bonuses.length === 1')
            idle(page)
            bonus_id = page.evaluate('__state().bonuses[0].id')
            record(page, xp=1000, points=80)
            assert page.evaluate("async()=> (await __dispatch({type:'status'})).summary.bonusItems[0].status") == 'pending'
            page.evaluate('__advance(3600000)')
            record(page, xp=1120, points=120)
            page.get_by_text('Pronto para conferir o resgate', exact=True).wait_for()
            summary = page.evaluate("async()=> (await __dispatch({type:'status'})).summary")
            assert summary['totals']['xpDelta'] == 120
            assert next(item for item in summary['earnings'] if item['channelId'] == 'kick:yetz')['xpPerHour'] == 120

            open_panel(page, '#alerts-panel')
            page.get_by_role('button', name='Dispensar aviso', exact=True).first.tap()
            idle(page)
            refresh(page)
            assert page.evaluate('__state().alerts.every(alert => alert.read)')
            session_tab = page.evaluate("__state().sessions['kick:yetz'].tabId")
            page.get_by_role('button', name='Ver resgate / regra', exact=True).tap()
            idle(page)
            assert page.evaluate("__tabs().some(tab => tab.url === 'https://pokeidle.io/app' && tab.active)")
            assert page.evaluate('Object.keys(__state().sessions).length') == 1
            personal_tabs = page.evaluate('__tabs().filter(tab => tab.id !== ' + str(session_tab) + ').map(tab=>tab.id)')
            assert len(personal_tabs) == 1
            page.get_by_role('button', name='Marcar resgatado', exact=True).tap()
            idle(page)
            assert page.evaluate("async()=> (await __dispatch({type:'status'})).summary.bonusItems[0].status") == 'cooldown'
            page.evaluate('__advance(3660000)')
            refresh(page)
            page.get_by_role('button', name='Confirmar requisitos cumpridos', exact=True).tap()
            idle(page)
            summary = page.evaluate("async()=> (await __dispatch({type:'status'})).summary")
            assert summary['bonusItems'][0]['status'] == 'pending'
            assert summary['bonusItems'][0]['remainingPoints'] is None, 'saldo anterior ao resgate não pode ser reutilizado'
            record(page, points=10)
            summary = page.evaluate("async()=> (await __dispatch({type:'status'})).summary")
            assert summary['bonusItems'][0]['remainingPoints'] == 90
            page.evaluate('__advance(60000)')
            record(page, points=100)
            page.get_by_text('Pronto para conferir o resgate', exact=True).wait_for()
            assert page.evaluate('__state().bonuses[0].id') == bonus_id

            page.get_by_role('button', name='Fechar todos', exact=True).tap()
            page.get_by_text('0 de 2 canais abertos', exact=True).wait_for()
            assert page.evaluate('__state().automationPaused')
            assert page.evaluate('__state().queue.length') == 0
            assert page.evaluate('ids=>ids.every(id=>__tabs().some(tab=>tab.id===id))', personal_tabs), 'resgate é aba pessoal e deve permanecer'
            page.evaluate('__advance(120000)')
            page.evaluate("__dispatch({type:'tick'})")
            refresh(page)
            assert page.evaluate('__state().automationPaused')
            assert page.evaluate('Object.keys(__state().sessions).length') == 0
            assert page.evaluate('__state().queue.length') == 0
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'layout não pode rolar horizontalmente'
            assert not errors, errors
            assert page.locator('#error').is_hidden(), page.locator('#error').text_content()
            browser.close()
            print('PASS: painel360px + core/rewards/automation reais; limite/fila, bônus, histórico, resgate assistido pessoal, cooldown/novo saldo, fechar tudo e dispensar alertas. Sem overflow/erros JS. APIs de navegador simuladas, sem serviços externos.')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    run()
