"""Automação por estado de live + chat Twitch real, com rede e navegador simulados.

Usa core/live-watch/twitch-chat e painel reais. Não acessa contas, lives ou XP reais.
O token usado abaixo é uma credencial sintética de teste, sem validade externa.
"""
import http.server
import runpy
import threading
from functools import partial
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
helpers = runpy.run_path(str(ROOT / 'scripts/test-desktop-ui.py'))
VALID_TEST_TOKEN = 'test_token_only_1234567890'
INVALID_TEST_TOKEN = 'invalid_token_only_1234567890'

BOOTSTRAP = r'''
(() => {
  let data={}, nextId=1, chat, controller, collector, replyCount=0;
  const tabs=new Map(), created=[], removed=[], replies=[];
  const live={kick:false,twitch:false};
  const expectedToken='test_token_only_1234567890';
  let socketCount=0, joinCount=0;
  const api={
    runtime:{id:'live-ui-test',getURL:file=>new URL('/src/'+file,location.href).href},
    storage:{local:{get:async()=>structuredClone(data),set:async value=>Object.assign(data,structuredClone(value))}},
    tabs:{
      create:async options=>{const tab={id:nextId++,windowId:1,...options};tabs.set(tab.id,tab);created.push(structuredClone(tab));return structuredClone(tab);},
      get:async id=>{if(!tabs.has(id))throw Error('Aba fechada');return structuredClone(tabs.get(id));},
      update:async(id,options)=>{Object.assign(tabs.get(id),options);return structuredClone(tabs.get(id));},
      remove:async id=>{removed.push(id);tabs.delete(id);},
      query:async()=>structuredClone([...tabs.values()]),reload:async()=>{},sendMessage:async()=>({ok:true})
    },
    notifications:{create:async id=>id},windows:{update:async()=>{}}
  };
  const response=(status,value)=>({ok:status>=200&&status<300,status,json:async()=>structuredClone(value)});
  const fetcher=async(url,options={})=>{
    const target=new URL(url);
    if(target.origin==='https://id.twitch.tv'&&target.pathname==='/oauth2/validate'){
      if(options.headers?.Authorization!=='OAuth '+expectedToken)return response(401,{});
      return response(200,{login:'testuser',client_id:'testclient123',expires_in:3600,scopes:['chat:read']});
    }
    if(target.origin==='https://api.twitch.tv'&&target.pathname==='/helix/streams'){
      if(options.headers?.Authorization!=='Bearer '+expectedToken)return response(401,{});
      return response(200,{data:live.twitch===true?[{user_login:'twitch_watch',type:'live'}]:[]});
    }
    if(target.origin==='https://kick.com'&&target.pathname==='/api/v2/channels/kick_watch'){
      if(live.kick===null)return response(503,{});
      return response(200,{livestream:live.kick?{id:12345}:null});
    }
    throw Error('Destino de rede não simulado');
  };
  class FakeSocket {
    constructor(url){
      if(url!=='wss://irc-ws.chat.twitch.tv:443')throw Error('Destino IRC inesperado');
      this.handlers=new Map();this.readyState=0;socketCount++;
      setTimeout(()=>{if(this.readyState!==3){this.readyState=1;this.emit('open',{});}},0);
    }
    addEventListener(type,handler){const list=this.handlers.get(type)||[];list.push(handler);this.handlers.set(type,list);}
    emit(type,event){for(const handler of this.handlers.get(type)||[])handler(event);}
    send(line){
      if(line.startsWith('NICK '))setTimeout(()=>this.emit('message',{data:':tmi.twitch.tv 001 testuser :Welcome\r\n'}),0);
      if(line.startsWith('JOIN #')){
        const name=line.slice(6).trim();
        setTimeout(()=>{joinCount++;this.emit('message',{data:':testuser!testuser@testuser.tmi.twitch.tv JOIN #'+name+'\r\n'});},0);
      }
    }
    close(){this.readyState=3;}
  }
  async function initialize(){
    if(controller)return;
    const [{createController},{createTwitchChat},{collectLiveWatch}]=await Promise.all([
      import('/src/core.js'),import('/src/twitch-chat.js'),import('/src/live-watch.js')]);
    chat=createTwitchChat(api,{fetch:fetcher,WebSocket:FakeSocket,random:()=>0});
    controller=createController(api,{twitchChat:chat});collector=collectLiveWatch;
  }
  let queue=Promise.resolve(), publicState={};
  window.__dispatch=(message,sender={})=>{
    const pending=queue.then(async()=>{
      await initialize();
      let state;
      if(message.type==='configureTwitchChat'){
        await chat.configure({token:message.token});state=await controller({type:'status'});
      }else if(message.type==='disconnectTwitchChat'){
        await chat.disconnect({forget:message.forget===true});state=await controller({type:'status'});
      }else if(message.type==='watchNow'){
        const before=await controller({type:'status'});
        const statuses=await collector(before,chat,{fetch:fetcher});
        state=await controller({type:'liveWatchSnapshot',statuses});
      }else{
        state=await controller(message,sender);
        if(message.type==='setLiveWatch'&&state.liveWatch.enabled){
          const statuses=await collector(state,chat,{fetch:fetcher});
          state=await controller({type:'liveWatchSnapshot',statuses});
        }
      }
      publicState=structuredClone(state);return state;
    });
    queue=pending.catch(()=>{});return pending;
  };
  window.__state=()=>structuredClone(publicState);
  window.__tabs=()=>structuredClone([...tabs.values()]);
  window.__created=()=>structuredClone(created);
  window.__publicReplies=()=>structuredClone(replies);
  window.__chatPublic=()=>chat.status();
  window.__hasSavedAccess=()=>!!data.twitchChatAuth;
  window.__setLive=(kick,twitch)=>{live.kick=kick;live.twitch=twitch;};
  window.__transportCounts=()=>({socketCount,joinCount});
  window.browser={runtime:{sendMessage:async message=>{
    try{const state=await __dispatch(message);replyCount++;window.__replyCount=replyCount;const reply={ok:true,state};replies.push(structuredClone(reply));return reply;}
    catch(error){const reply={ok:false,error:error.message};replies.push(structuredClone(reply));return reply;}
  }}};
})();
'''


def idle(page):
    page.wait_for_function("window.__replyCount>0 && !document.querySelector('#channel').disabled")


def click(page, selector):
    page.locator(selector).click()
    idle(page)


def verify_private_boundary(page):
    assert page.locator('#twitch-token').input_value() == '', 'O campo OAuth deve ser apagado após o envio'
    assert page.evaluate("!Object.hasOwn(__state(),'twitchChatAuth')")
    assert page.evaluate("token=>!JSON.stringify(__publicReplies()).includes(token)", VALID_TEST_TOKEN)
    assert page.evaluate("token=>!document.body.innerText.includes(token)", VALID_TEST_TOKEN)
    assert page.evaluate("token=>!JSON.stringify(__publicReplies()).includes(token)", INVALID_TEST_TOKEN)


def run_size(browser, origin, width, height):
    context=browser.new_context(viewport={'width':width,'height':height},has_touch=width<=600)
    page=context.new_page()
    page.set_default_timeout(12000)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.add_init_script(BOOTSTRAP)
    page.goto(origin+'/src/popup.html')
    idle(page)
    helpers['add'](page,'kick','kick_watch')
    helpers['add'](page,'twitch','twitch_watch')
    helpers['show_feature'](page,'schedule')
    assert page.locator('#schedule-start').count()==0
    assert page.locator('#schedule-end').count()==0
    for checkbox in page.locator('#watch-channels input').all():
        checkbox.check()
    helpers['open_details'](page,'#twitch-chat-settings')
    page.locator('#twitch-token').fill(INVALID_TEST_TOKEN)
    click(page,'#connect-twitch-chat')
    assert page.locator('#error').is_visible()
    verify_private_boundary(page)
    page.locator('#twitch-token').fill(VALID_TEST_TOKEN)
    click(page,'#connect-twitch-chat')
    assert page.evaluate('__state().twitchChat.configured')
    assert page.evaluate('__hasSavedAccess()')
    verify_private_boundary(page)
    page.locator('#watch-enabled').check()
    page.locator('#watch-form button[type=submit]').click()
    idle(page)
    assert page.evaluate('__state().liveWatch.enabled')
    assert page.evaluate('Object.keys(__state().sessions).length')==0

    page.evaluate('__setLive(true,true)')
    click(page,'#watch-now')
    page.wait_for_function("async()=> (await __chatPublic()).channels.twitch_watch?.joined===true")
    click(page,'#refresh')
    active=page.evaluate('__state().sessions')
    assert set(active)=={'kick:kick_watch','twitch:twitch_watch'},active
    assert active['kick:kick_watch']['media']=='live'
    assert active['twitch:twitch_watch']['transport']=='irc'
    assert 'tabId' not in active['twitch:twitch_watch']
    assert page.evaluate('__state().twitchChat.channels.twitch_watch.joined')
    assert page.evaluate('__tabs().length')==1
    assert page.evaluate('__tabs()[0].url')=='https://kick.com/kick_watch'
    assert page.locator('#channels .row').filter(has_text='twitch_watch').get_by_role('button',name='Ver aba',exact=True).count()==0
    assert 'conectado' in page.locator('#channels .row').filter(has_text='twitch_watch').inner_text().lower()
    if width==1280:
        page.screenshot(path='/tmp/chat-leve-live-automation.png',full_page=True)
    first_kick=active['kick:kick_watch']['tabId']

    page.evaluate('__setLive(null,true)')
    click(page,'#watch-now')
    assert page.evaluate("__state().sessions['kick:kick_watch'].tabId")==first_kick,'Consulta indisponível não comprova offline'
    page.evaluate('__setLive(false,true)')
    click(page,'#watch-now')
    assert page.evaluate('Object.keys(__state().sessions)')==['twitch:twitch_watch']
    assert page.evaluate('__tabs().length')==0
    page.evaluate('__setLive(false,false)')
    click(page,'#watch-now')
    assert page.evaluate('Object.keys(__state().sessions).length')==0

    page.evaluate('__setLive(true,true)')
    click(page,'#watch-now')
    assert page.evaluate('Object.keys(__state().sessions).length')==2
    click(page,'#stop-all')
    assert page.evaluate('__state().automationPaused')
    before=page.evaluate('__created().length')
    click(page,'#watch-now')
    assert page.evaluate('Object.keys(__state().sessions).length')==0
    assert page.evaluate('__created().length')==before
    click(page,'#toggle-automation')
    assert page.evaluate('Object.keys(__state().sessions).length')==2
    page.locator('#channels .row').filter(has_text='kick_watch').get_by_role('button',name='Fechar',exact=True).click()
    idle(page)
    click(page,'#watch-now')
    assert page.evaluate('Object.keys(__state().sessions)')==['twitch:twitch_watch']
    assert page.evaluate('__tabs().length')==0

    helpers['open_details'](page,'#twitch-chat-settings')
    click(page,'#disconnect-twitch-chat')
    assert not page.evaluate('__hasSavedAccess()')
    assert page.evaluate('__state().twitchChat.configured') is False
    verify_private_boundary(page)
    page.locator('#watch-enabled').uncheck()
    page.locator('#watch-form button[type=submit]').click()
    idle(page)
    assert page.evaluate('__state().liveWatch.enabled') is False
    assert page.evaluate('Object.keys(__state().sessions).length')==0
    helpers['no_overflow'](page)
    assert not errors,errors
    assert page.evaluate('__created().every(tab=>tab.url.startsWith("https://kick.com/"))')
    context.close()
    print(f'PASS: automação {width}x{height} — online/offline/desconhecido, Twitch IRC sem abas, JOIN confirmado, pausas globais/individuais e campo/token sem exposição. Core/chat/monitor reais; redes/APIs simuladas; sem pontos reais.')


def run():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),partial(helpers['QuietHandler'],directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
            origin=f'http://127.0.0.1:{server.server_port}'
            for width,height in ((320,740),(600,600),(1280,800)):
                run_size(browser,origin,width,height)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__=='__main__':
    run()
