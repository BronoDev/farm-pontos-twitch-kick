"""Leitura do HTML público do PokeIdle e ciclo de vida em Chromium local, sem contas reais."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent
source = (root / 'src' / 'pokeidle.js').read_text().replace('export ', '')
html = (root / 'tests' / 'fixtures' / 'pokeidle-twitch.html').read_text()
mixed_html = (root / 'tests' / 'fixtures' / 'pokeidle-mixed-synthetic.html').read_text()
live_names = {'tftoddy', 'axtlol', 'clovaobengala', 'patopapao', 'matta', 'rodil', 'faturetosl', 'guaxilol1'}
offline_names = {'faasii', 'biscoitao', 'cogu', 'luccatv', 'techzz', 'dersin2k', 'denissnidertv', 'mecmeno'}


def fixture(context, body=html, url='https://pokeidle.io/app'):
    page = context.new_page()
    page.route('**/*', lambda route: route.fulfill(content_type='text/html', body=f'<!doctype html><html><body>{body}</body></html>'))
    page.goto(url)
    page.evaluate('''() => {
      window.snapshots=[];
      window.sentAt=[];
      window.messages=[];
      window.intervals=[];
      window.activeIntervals=new Set();
      const interval=window.setInterval.bind(window);
      const clear=window.clearInterval.bind(window);
      window.setInterval=(callback, delay)=>{
        const id=interval(callback,delay);
        intervals.push({callback,delay,id});activeIntervals.add(id);return id;
      };
      window.clearInterval=id=>{activeIntervals.delete(id);clear(id)};
      window.browser={runtime:{id:'local-test',onMessage:{addListener(fn){window.refreshListener=fn}},sendMessage:async message=>{
        messages.push(message);snapshots.push(message.snapshot);sentAt.push(performance.now());
        return {ok:true,state:{accepted:window.acceptSnapshots!==false}};
      }}};
    }''')
    page.add_script_tag(content=source)
    return page


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context()
    errors = []
    context.on('page', lambda page: page.on('pageerror', lambda error: errors.append(str(error))))
    page = fixture(context)
    page.wait_for_function('snapshots.length===1')
    snapshot = page.evaluate('snapshots[0]')
    assert snapshot['ready'] is True
    assert len(snapshot['channels']) == 16
    assert {item['name'] for item in snapshot['channels'] if item['live']} == live_names
    assert {item['name'] for item in snapshot['channels'] if not item['live']} == offline_names
    assert all(item['bonus'] for item in snapshot['channels'])
    assert all(item['platform'] == 'twitch' and item['source'] == 'widget' for item in snapshot['channels'])
    assert {item['name'] for item in snapshot['channels'] if item['missing']} == live_names
    assert '+15%' in snapshot['ruleText'] and '+2,5%' in snapshot['ruleText']
    assert '/mod ' not in snapshot['ruleText']
    assert page.evaluate('Object.keys(messages[0]).sort().join(",")') == 'snapshot,type'
    assert page.evaluate('intervals.map(x=>x.delay)') == [60000]

    # Um pedido de outra extensão/página não recebe resposta nem força envio.
    assert page.evaluate('''() => {
      let replied=false;
      const result=refreshListener({type:'requestPokeIdleSnapshot'},{id:'another-extension'},()=>{replied=true});
      return result===false&&!replied;
    }''')
    # Mutações de contagem de espectadores não atualizam o estado dos canais.
    page.evaluate('''() => {
      const viewers=document.querySelector('.tw-canal-espect');
      viewers.textContent='999999';viewers.title='espectadores';
    }''')
    page.wait_for_timeout(850)
    assert page.evaluate('snapshots.length') == 1

    # Debounce/throttle captura o resultado final de uma rajada de mutações.
    page.evaluate('''() => {
      const channel=document.querySelector('a.tw-canal');
      for(let i=0;i<30;i++){channel.classList.toggle('ao-vivo');}
      channel.classList.remove('ao-vivo','tw-falta-eu');
    }''')
    page.wait_for_function('snapshots.length===2')
    assert page.evaluate('snapshots.at(-1).channels[0].live') is False
    assert page.evaluate('sentAt[1]-sentAt[0]') >= 1990

    # Refresh reconhece apenas após o backend aceitar o snapshot atualizado.
    page.evaluate('''() => {
      window.refreshReply=null;
      window.refreshReturned=refreshListener({type:'requestPokeIdleSnapshot'},{id:'local-test'},reply=>{
        window.refreshReply=reply;window.refreshReplyCount=snapshots.length;
      });
    }''')
    assert page.evaluate('refreshReturned') is True
    assert page.evaluate('refreshReply') is None
    page.wait_for_function('refreshReply?.accepted===true')
    assert page.evaluate('refreshReplyCount') == 3
    assert page.evaluate('sentAt[2]-sentAt[1]') >= 1990

    # Heartbeat envia a mesma assinatura para manter a origem aberta confirmada.
    page.evaluate('intervals[0].callback()')
    page.wait_for_function('snapshots.length===4')
    assert page.evaluate('JSON.stringify(snapshots[2])===JSON.stringify(snapshots[3])')
    assert page.evaluate('sentAt[3]-sentAt[2]') >= 1990

    # Sair da rota encerra observadores/timers e impede novos snapshots.
    page.evaluate('''() => {
      history.pushState({},'', '/fora-do-app');window.dispatchEvent(new Event('popstate'));
      document.querySelector('a.tw-canal').classList.add('ao-vivo');intervals[0].callback();
    }''')
    assert page.evaluate('activeIntervals.size') == 0
    page.wait_for_timeout(900)
    assert page.evaluate('snapshots.length') == 4
    page.close()

    # Fixture mista sintética: plataforma explícita e links Kick sem status inventado.
    page = fixture(context, body=mixed_html)
    page.wait_for_function('snapshots.length===1')
    snapshot = page.evaluate('snapshots[0]')
    channels = {item['platform'] + ':' + item['name']: item for item in snapshot['channels']}
    assert set(channels) == {'twitch:tftoddy', 'kick:yetz', 'kick:outro_canal-123'}
    assert channels['kick:yetz']['source'] == 'widget' and channels['kick:yetz']['live'] is True
    assert channels['kick:outro_canal-123'] == {
        'platform': 'kick', 'name': 'outro_canal-123', 'displayName': 'outro_canal-123',
        'live': None, 'bonus': False, 'missing': False, 'source': 'link'
    }
    assert snapshot['ruleText'] == '+15% na primeira live e +2,5% nas demais'
    assert page.evaluate('JSON.stringify(readPokeIdleChannels(document))===JSON.stringify(readPokeIdleTwitch(document))')
    # O observer é local ao container Kick e nota uma mudança real do link.
    page.evaluate('document.querySelector(".kick-canais a").href="https://kick.com/novo_canal"')
    page.wait_for_function('snapshots.length===2')
    assert page.evaluate('snapshots.at(-1).channels.some(item=>item.platform==="kick" && item.name==="novo_canal" && item.live===null)')
    page.evaluate('''() => {
      const link=document.createElement('a');link.href='https://kick.com/mais_um';
      document.querySelector('.kick-canais').append(link);
    }''')
    page.wait_for_function('snapshots.length===3')
    assert page.evaluate('snapshots.at(-1).channels.some(item=>item.name==="mais_um" && item.live===null)')
    page.evaluate('document.querySelector(".kick-canais a").href="https://evil.test/novo_canal"')
    page.wait_for_function('snapshots.length===4')
    assert not page.evaluate('snapshots.at(-1).channels.some(item=>item.name==="novo_canal")')
    page.close()

    # Link Kick em SPA sem widget conhecido também é encontrado na descoberta inicial.
    page = fixture(context, body='<main id="game"></main>')
    page.evaluate('''() => {
      const link=document.createElement('a');link.href='https://kick.com/yetz';
      link.className='ao-vivo com-bonus';document.querySelector('#game').append(link);
    }''')
    page.wait_for_function('snapshots.length===1')
    assert page.evaluate('snapshots[0].channels[0].live') is None
    assert page.evaluate('snapshots[0].channels[0].bonus') is False
    page.close()

    # Após encontrar o widget, não observamos o jogo inteiro permanentemente.
    # Links externos ao widget são redescobertos pelo heartbeat/foco.
    page = fixture(context)
    page.wait_for_function('snapshots.length===1')
    page.evaluate('''() => {
      const link=document.createElement('a');link.href='https://kick.com/yetz';document.body.append(link);
      intervals[0].callback();
    }''')
    page.wait_for_function('snapshots.length===2')
    assert page.evaluate('snapshots.at(-1).channels.some(item=>item.platform==="kick" && item.name==="yetz" && item.source==="link" && item.live===null)')
    page.close()

    # Widget renderizado depois do script numa SPA é encontrado sem recarregar.
    page = fixture(context, body='<main id="game"></main>')
    page.wait_for_timeout(50)
    page.evaluate('html=>{document.querySelector("#game").innerHTML=html}', html)
    page.wait_for_function('snapshots.length===1')
    assert len(page.evaluate('snapshots[0].channels')) == 16
    # Renderização vazia não é enviada como todos offline; refresh informa falha.
    page.evaluate('''() => {
      document.querySelector('.tw-canais').replaceChildren();window.emptyReply=null;
      refreshListener({type:'requestPokeIdleSnapshot'},{id:'local-test'},reply=>{emptyReply=reply});
    }''')
    page.wait_for_function('emptyReply?.accepted===false')
    assert page.evaluate('snapshots.length') == 1
    page.evaluate('window.dispatchEvent(new Event("pagehide"))')
    assert page.evaluate('activeIntervals.size') == 0
    page.close()

    # Rejeição do backend encerra a coleta da origem.
    page = fixture(context)
    page.wait_for_function('snapshots.length===1')
    page.evaluate('''() => {
      window.acceptSnapshots=false;window.rejectedReply=null;
      refreshListener({type:'requestPokeIdleSnapshot'},{id:'local-test'},reply=>{rejectedReply=reply});
    }''')
    page.wait_for_function('rejectedReply?.accepted===false')
    assert page.evaluate('activeIntervals.size') == 0
    page.close()

    # A permissão do content script não estende a leitura a outras rotas/origens.
    for url in ['https://pokeidle.io/login', 'https://pokeidle.io/application', 'https://evil.test/app']:
        page = fixture(context, url=url)
        page.wait_for_timeout(50)
        assert page.evaluate('snapshots.length') == 0
        assert page.evaluate('activeIntervals.size') == 0
        page.close()
    assert not errors, errors
    browser.close()
    print('PASS: fixture real Twitch16/8 e fixture mista sintética; Kick por URL sem inventar live/bônus, observers locais/SPA/heartbeat, debounce/throttle, refresh, loading e cleanup. Chromium local; sem contas ou cliques.')
