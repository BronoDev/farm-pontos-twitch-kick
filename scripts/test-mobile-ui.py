"""Viewport Android em Chromium + APIs simuladas; não é teste de aparelho real."""
import http.server
import threading
from functools import partial
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(root / 'src')))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        for width in (320, 360, 412, 560):
            context = browser.new_context(viewport={'width': width, 'height': 740}, is_mobile=True, has_touch=True,
                                          user_agent='Mozilla/5.0 (Android 14; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0')
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.add_init_script('''
              let data={}, nextId=1; const tabs=new Map(); window.__tabs=tabs;
              const api={runtime:{getBrowserInfo:async()=>({name:'Firefox'}),getPlatformInfo:async()=>({os:'android'})},
                storage:{local:{get:async()=>structuredClone(data),set:async x=>Object.assign(data,structuredClone(x))}},
                tabs:{create:async o=>{const t={id:nextId++,url:o.url,muted:o.muted,active:o.active};tabs.set(t.id,t);return t},
                  get:async id=>tabs.get(id),remove:async id=>tabs.delete(id),
                  update:async()=>{throw Error('Não deve chamar tabs.update muted no Android')}}};
              window.browser={runtime:{sendMessage:async message=>{
                try{const mod=await import('/core.js');return {ok:true,state:await mod.createController(api)(message)}}
                catch(error){return {ok:false,error:error.message}}
              }}};
            ''')
            page.goto(f'http://127.0.0.1:{server.server_port}/popup.html')
            page.locator('#android-note').wait_for(state='visible')
            page.locator('#channel').fill('um_canal_com_nome_comprido_123456789')
            page.get_by_role('button', name='Adicionar', exact=True).tap()
            page.wait_for_function("document.querySelector('#channel').value === ''")
            page.get_by_role('button', name='Iniciar todos', exact=True).tap()
            page.get_by_text('1 de 1 canais abertos', exact=True).wait_for()
            assert page.evaluate('[...__tabs.values()].every(t=>t.muted===true && t.active===false)')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Overflow em {width}px'
            if width <= 480:
                assert page.get_by_role('button', name='Fechar todos', exact=True).bounding_box()['height'] >= 44
            if width == 360:
                page.screenshot(path='/tmp/chat-leve-android-360.png', full_page=True)
            page.get_by_role('button', name='Fechar todos', exact=True).tap()
            page.get_by_text('0 de 1 canais abertos', exact=True).wait_for()
            page.get_by_role('button', name='Iniciar todos', exact=True).tap()
            page.get_by_text('1 de 1 canais abertos', exact=True).wait_for()
            assert not errors, errors
            print(f'PASS: {width}px, toque, início/fim/reabertura em lote, sem overflow ou erros JS (APIs simuladas).')
            context.close()
        browser.close()
finally:
    server.shutdown()
