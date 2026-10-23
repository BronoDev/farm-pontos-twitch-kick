"""Teste opcional de DOM com Playwright + Chromium; não acessa Twitch/Kick reais."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent


def fixture(page, managed=True, blocked=False, controls=True, twitch=False):
    page.set_content('''
      <div data-player>
        <video id="player"></video>
        <button id="settings" aria-label="Settings">Settings</button>
        <div id="quality-menu" hidden><button id="quality">Quality</button></div>
        <div id="choices" hidden><button data-height="720">720p60</button><button data-height="160">160p</button><button>Auto</button></div>
      </div>
    ''')
    if twitch:
        page.set_content('''
          <video id="preview"></video>
          <div data-a-target="video-player">
            <video id="player"></video>
            <button id="settings" data-a-target="player-settings-button">Réglages</button>
            <div id="quality-menu" hidden><button id="quality" data-a-target="player-settings-menu-item-quality">Qualität</button></div>
            <div id="choices" data-a-target="player-settings-submenu-quality" hidden>
              <input id="quality-720" type="radio" name="player-settings-submenu-quality-option" data-height="720"><label for="quality-720">720p60 (Source)</label>
              <input id="quality-160" type="radio" name="player-settings-submenu-quality-option" data-height="160" style="display:none"><label for="quality-160">160p</label>
              <input id="quality-90" type="radio" name="player-settings-submenu-quality-option" data-height="90" disabled><label for="quality-90">90p</label>
              <input id="quality-auto" type="radio" name="player-settings-submenu-quality-option"><label for="quality-auto">Auto</label>
            </div>
          </div>
        ''')
    page.evaluate('''({managed,blocked,controls}) => {
      window.samples=[]; window.playCalls=0; window.chosen=0; window.messages=[];
      window.chrome={runtime:{id:'test-player',onMessage:{addListener:fn=>window.__playerMessage=fn},sendMessage:async message=>{
        messages.push(message.type);
        if(message.type==='playerTelemetry') samples.push(message.sample);
        else if(message.type!=='playerContext') throw Error('Unexpected message');
        return {ok:true,state:{managed}};
      }}};
      const v=document.querySelector('#player');
      let playing=false, height=720;
      Object.defineProperties(v,{
        paused:{get:()=>!playing}, ended:{get:()=>false},
        readyState:{get:()=>playing?3:0}, videoHeight:{get:()=>height}
      });
      window.pausePlayer=()=>{playing=false;v.dispatchEvent(new Event('pause'))};
      window.changePlayerHeight=value=>{height=value};
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
        source=(root / 'src' / name).read_text()
        if name=='kick-quality.js':source=source.replace('export ', '')
        page.add_script_tag(content=source)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    fixture(page)
    page.wait_for_function('samples.some(s=>s.targetHeight===160 && s.height===160 && s.playing)')
    assert page.evaluate('chosen') == 160
    assert page.evaluate('document.querySelector("#player").muted')
    assert page.evaluate('document.querySelector("#player").playsInline')
    assert page.evaluate('playCalls') == 1
    page.close()

    page = browser.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    fixture(page, twitch=True)
    page.wait_for_function('samples.some(s=>s.targetHeight===160 && s.height===160 && s.playing)')
    assert page.evaluate('chosen') == 160
    assert page.evaluate('document.querySelector("#preview").muted') is False
    assert page.evaluate('messages.includes("playerContext")')
    page.evaluate('changePlayerHeight(360);__playerMessage({type:"requestPlayerTelemetry"},{id:"test-player"},()=>{})')
    page.wait_for_function('samples.at(-1).height===360')
    page.evaluate('pausePlayer()')
    page.wait_for_function('samples.at(-1).playing===false')
    assert page.evaluate('playCalls') == 1, 'Pausa manual não deve ser revertida'
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
    print('PASS: DOM simulado Kick/Twitch — menor qualidade via botão/radio, vídeo principal, áudio/playsinline, consulta sob demanda, pausa preservada, autoplay bloqueado, controles ausentes e aba pessoal intocada. Sem erros JS. Não valida sites reais ou pontos.')
