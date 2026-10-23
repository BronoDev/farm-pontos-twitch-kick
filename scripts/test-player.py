"""Teste opcional de DOM com Playwright + Chromium; não acessa a Kick real."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent


def fixture(page, managed=True, blocked=False, controls=True):
    page.set_content('''
      <div data-player>
        <video id="player"></video>
        <button id="settings" aria-label="Settings">Settings</button>
        <div id="quality-menu" hidden><button id="quality">Quality</button></div>
        <div id="choices" hidden><button data-height="720">720p60</button><button data-height="160">160p</button><button>Auto</button></div>
      </div>
    ''')
    page.evaluate('''({managed,blocked,controls}) => {
      window.samples=[]; window.playCalls=0; window.chosen=0;
      window.chrome={runtime:{sendMessage:async message=>{
        if(message.type==='kickTelemetry') samples.push(message.sample);
        return {ok:true,state:{managed}};
      }}};
      const v=document.querySelector('video');
      let playing=false, height=720;
      Object.defineProperties(v,{
        paused:{get:()=>!playing}, ended:{get:()=>false},
        readyState:{get:()=>playing?3:0}, videoHeight:{get:()=>height}
      });
      v.play=async()=>{playCalls++;if(blocked)throw Error('Autoplay denied');playing=true;v.dispatchEvent(new Event('playing'))};
      document.querySelector('#settings').onclick=()=>document.querySelector('#quality-menu').hidden=false;
      document.querySelector('#quality').onclick=()=>document.querySelector('#choices').hidden=false;
      for(const b of document.querySelectorAll('[data-height]'))b.onclick=()=>{
        height=Number(b.dataset.height);chosen=height;document.querySelector('#choices').hidden=true;
        v.dispatchEvent(new Event('resize'));
      };
      if(!controls){document.querySelector('#settings').remove();document.querySelector('#quality-menu').remove();document.querySelector('#choices').remove()}
    }''', {'managed': managed, 'blocked': blocked, 'controls': controls})
    for name in ('kick-quality.js', 'kick-player.js'):
        page.add_script_tag(path=str(root / 'instalar' / 'chromium' / name))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    fixture(page)
    page.wait_for_function('samples.some(s=>s.targetHeight===160 && s.height===160 && s.playing)')
    assert page.evaluate('chosen') == 160
    assert page.evaluate('document.querySelector("video").muted')
    assert page.evaluate('document.querySelector("video").playsInline')
    assert page.evaluate('playCalls') == 1
    page.close()

    page = browser.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    fixture(page, blocked=True)
    page.wait_for_function('samples.some(s=>s.qualityStatus==="autoplay-blocked" && !s.playing)')
    page.close()

    page = browser.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    fixture(page, controls=False)
    page.wait_for_function('samples.some(s=>s.qualityStatus==="unavailable" && s.targetHeight===0)')
    page.close()

    page = browser.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    fixture(page, managed=False)
    page.wait_for_timeout(2800)
    assert page.evaluate('playCalls') == 0
    assert page.evaluate('chosen') == 0
    assert not errors, errors
    browser.close()
    print('PASS: DOM simulado — menor qualidade, áudio silenciado, autoplay bloqueado, controles ausentes e aba pessoal intocada. Sem erros JS. Não valida Kick real ou pontos.')
