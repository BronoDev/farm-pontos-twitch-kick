"""Diagnósticos em DOM local de Chromium; não acessa sites ou contas reais."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent
source = (root / 'src' / 'site-status.js').read_text().replace('export ', '')


def fixture(context, managed=True):
    page = context.new_page()
    page.route('https://kick.com/**', lambda route: route.fulfill(content_type='text/html', body='''
      <!doctype html><html><body>
        <div id="chat">LIVE login offline disconnected (mensagem comum de chat)</div>
        <button data-a-target="login-button" hidden>Login</button>
        <div data-testid="live-indicator" style="visibility:hidden">Live</div>
        <video></video>
      </body></html>
    '''))
    page.goto('https://kick.com/yetz')
    page.evaluate('''managed => {
      window.healthSamples=[];
      window.browser={runtime:{id:'test-health',sendMessage:async message=>{
        if(message.type==='sessionHealth')healthSamples.push(message.sample);
        return {ok:true,state:{managed}};
      }}};
    }''', managed)
    page.add_script_tag(content=source)
    return page


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context()
    errors = []
    context.on('page', lambda page: page.on('pageerror', lambda error: errors.append(str(error))))
    page = fixture(context)
    page.wait_for_function('healthSamples.length>0')
    first = page.evaluate('healthSamples[0]')
    assert first['login'] == 'unknown'
    assert first['connection'] == 'unknown'
    assert first['live'] == 'unknown'
    page.evaluate('''() => {
      document.querySelector('[data-a-target="login-button"]').hidden=false;
      document.querySelector('[data-testid="live-indicator"]').style.visibility='visible';
      window.dispatchEvent(new Event('focus'));
    }''')
    page.wait_for_function('healthSamples.some(s=>s.login==="signed-out" && s.live==="live")')
    context.set_offline(True)
    page.wait_for_function('healthSamples.some(s=>s.connection==="offline")')
    context.set_offline(False)
    page.wait_for_function('healthSamples.at(-1).connection==="unknown"')
    page.evaluate('history.pushState({}, "", "/outro-canal");window.dispatchEvent(new Event("focus"))')
    count = page.evaluate('healthSamples.length')
    page.wait_for_timeout(1500)
    assert page.evaluate('healthSamples.length') == count, 'Não deve acompanhar outra URL'
    page.close()

    page = fixture(context, managed=False)
    page.wait_for_timeout(2800)
    assert page.evaluate('healthSamples.length') == 0, 'Aba pessoal não gerenciada não gera amostras'
    assert not errors, errors
    browser.close()
    print('PASS: sinais explícitos/unknown, controles ocultos, rede offline/online, parada em outra URL e aba pessoal intocada. DOM local; sem validação de Twitch/Kick real.')
