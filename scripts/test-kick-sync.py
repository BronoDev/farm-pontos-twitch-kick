"""Sincronização Kick isolada: painel e background reais, APIs e origem simuladas.

Não acessa as plataformas nem confirma player, pontos ou XP reais.
"""
import http.server
import runpy
import threading
from functools import partial
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
helpers = runpy.run_path(str(ROOT / 'scripts/test-desktop-ui.py'))

BOOTSTRAP = r'''
(() => {
  let data={}, nextId=1, handler, ready, clock=1800000000000, state={};
  Date.now=()=>clock;
  const tabs=new Map([
    [900,{id:900,windowId:1,url:'https://pokeidle.io/app',active:false}],
    [901,{id:901,windowId:1,url:'https://pokeidle.io/app',active:true}]
  ]),created=[],requests=[];
  let reader='ready',kickNames=['yetz'],lastSourceKeys=[];
  const provider=new Map([['yetz',true],['gaules',true]]);
  const kickEntries=()=>kickNames.map(name=>({platform:'kick',name,displayName:name,source:'widget',live:true,bonus:true,missing:true}));
  const twitchEntry={platform:'twitch',name:'tw_keep',displayName:'TW Keep',source:'widget',live:true,bonus:true,missing:true};
  const invoke=(message,sender)=>new Promise((resolve,reject)=>{
    const accepted=handler(message,sender,reply=>{
      if(reply?.ok&&Object.hasOwn(reply.state||{},'sessions'))state=structuredClone(reply.state);
      if(!reply?.ok)reject(Error(reply?.error||'Sem resposta'));else resolve(reply);
    });
    if(accepted!==true)reject(Error('Mensagem rejeitada'));
  });
  const source=async(snapshot,platform)=>{
    const reply=await invoke({type:'pokeidleSnapshot',...(platform?{platform}:{}),snapshot},
      {id:api.runtime.id,tab:{id:platform==='kick'?901:900},url:'https://pokeidle.io/app',frameId:0});
    lastSourceKeys=Object.keys(reply.state||{});return reply.state;
  };
  const api={
    runtime:{id:'kick-sync-ui-test',getURL:file=>new URL('/src/'+file,location.href).href,
      onMessage:{addListener:listener=>{handler=listener;}},
      sendMessage:async message=>{
        await ready;
        const reply=await invoke(message,{id:api.runtime.id,tab:{id:999},url:api.runtime.getURL('popup.html')});
        window.__replyCount=(window.__replyCount||0)+1;return reply;
      }},
    storage:{local:{get:async()=>structuredClone(data),set:async values=>Object.assign(data,structuredClone(values))}},
    tabs:{
      create:async options=>{const tab={id:nextId++,windowId:1,...options};tabs.set(tab.id,tab);created.push(structuredClone(tab));return structuredClone(tab);},
      get:async id=>{if(!tabs.has(id))throw Error('Aba fechada');return structuredClone(tabs.get(id));},
      update:async(id,options)=>{Object.assign(tabs.get(id),options);return structuredClone(tabs.get(id));},
      remove:async id=>{tabs.delete(id);},reload:async()=>{},
      query:async query=>structuredClone([...tabs.values()].filter(tab=>!query?.url||tab.url.startsWith(query.url.replace(/\*.*$/,'')))),
      sendMessage:async(id,message)=>{
        if(message.type!=='requestPokeIdleSnapshot')return {ok:true};
        if(message.platform!=='kick')throw Error('A sincronização dedicada deve pedir apenas Kick');
        if(reader==='missing')return {accepted:false,reason:'not-ready'};
        if(reader==='empty')return {accepted:false,reason:'no-channels'};
        const result=await source({ready:true,channels:kickEntries(),ruleText:''},'kick');
        return {accepted:result.accepted===true};
      }
    },
    notifications:{create:async id=>id},windows:{update:async()=>{}}
  };
  window.fetch=async url=>{
    const target=new URL(url);
    if(target.origin!=='https://kick.com'||!target.pathname.startsWith('/api/v2/channels/'))throw Error('Rede externa não simulada');
    const name=decodeURIComponent(target.pathname.split('/').pop());
    const value=provider.get(name);
    requests.push({name,at:clock});
    const status=value==='forbidden'?403:value==='rate-limited'?429:value==='unknown'?503:200;
    return {ok:status===200,status,headers:{get:key=>key.toLowerCase()==='retry-after'?'120':null},
      json:async()=>({livestream:value===true?{id:12345}:null})};
  };
  window.browser=api;
  ready=import('/src/background.js');
  window.__state=()=>structuredClone(state);
  window.__created=()=>structuredClone(created);
  window.__tabs=()=>structuredClone([...tabs.values()]);
  window.__setReader=value=>{reader=value;};
  window.__setKickNames=values=>{kickNames=values;};
  window.__setProvider=(name,value)=>{provider.set(name,value);};
  window.__advance=ms=>{clock+=ms;};
  window.__requestCount=name=>requests.filter(item=>item.name===name).length;
  window.__sourceReplyKeys=()=>[...lastSourceKeys];
  window.__ingestTwitch=async()=>{await ready;return source({ready:true,channels:[twitchEntry],ruleText:'Regra Twitch preservada'});};
  window.__refreshOldWidget=async()=>{await ready;return source({ready:true,channels:[twitchEntry,...kickEntries()],ruleText:'Regra Twitch preservada'});};
})();
'''


def idle(page):
    page.wait_for_function("window.__replyCount>0 && !document.querySelector('#channel').disabled")


def refresh(page):
    page.locator('#refresh').click()
    idle(page)


def sync(page):
    page.locator('#refresh-pokeidle-kick').click()
    idle(page)
    assert page.locator('#kick-sync-panel').get_attribute('aria-busy') is None


def twitch_data(page):
    return page.evaluate('''() => JSON.stringify({
      channels:__state().pokeidle.channels.filter(item=>item.platform==='twitch'),
      observedAt:__state().pokeidle.observedAt,sourceTabId:__state().pokeidle.sourceTabId,
      connected:__state().pokeidle.connected,ruleText:__state().pokeidle.ruleText,
      session:__state().sessions['twitch:tw_keep']})''')


def run_size(browser,origin,width,height):
    context=browser.new_context(viewport={'width':width,'height':height},has_touch=width<=600)
    page=context.new_page()
    page.set_default_timeout(12000)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.add_init_script(BOOTSTRAP)
    page.goto(origin+'/src/popup.html')
    idle(page)
    assert page.evaluate('__ingestTwitch()')=={'accepted':True}
    refresh(page)
    assert page.evaluate('Object.keys(__state().sessions)')==['twitch:tw_keep']
    original_twitch=twitch_data(page)
    page.evaluate('__advance(10000)')
    sync(page)
    assert twitch_data(page)==original_twitch,'A leitura Kick isolada não pode sobrescrever os dados Twitch'
    assert page.evaluate('__sourceReplyKeys()')==['accepted']
    assert page.evaluate("__state().pokeidle.kickSync.sourceTabId")==901
    assert page.evaluate("__state().sessions['kick:yetz'].media")=='live'
    assert page.evaluate("__state().pokeidle.kickSync.status")=='ok'
    assert page.locator('#kick-sync-summary').inner_text().startswith('1 canais')
    assert page.evaluate("__state().pokeidle.kickSync.lastSuccessAt>0")

    page.locator('#pokeidle-kick-enabled').uncheck()
    idle(page)
    assert page.evaluate('__state().pokeidle.kickSync.enabled') is False
    assert page.evaluate('__state().pokeidle.enabled') is True
    assert page.evaluate('Object.keys(__state().sessions)')==['twitch:tw_keep']
    assert twitch_data(page)==original_twitch
    assert page.locator('#kick-sync-badge').inner_text()=='Desativada'
    page.evaluate("__setKickNames(['yetz','gaules'])")
    before=page.evaluate('__created().length')
    sync(page)
    assert page.evaluate('__created().length')==before,'Sincronizar com Kick desligada não pode reativar sessões'
    assert page.evaluate('__state().pokeidle.kickSync.enabled') is False
    assert page.evaluate("__state().pokeidle.channels.filter(item=>item.platform==='kick').length")==2
    assert twitch_data(page)==original_twitch
    assert page.locator('#kick-sync-warning').is_visible()

    page.locator('#pokeidle-kick-enabled').check()
    idle(page)
    assert page.evaluate("!!__state().sessions['kick:yetz']&&!!__state().sessions['kick:gaules']")
    # Adicionar de novo e iniciar também concede participação manual ao canal.
    helpers['add'](page,'kick','yetz')
    page.locator('#start-all').click()
    idle(page)
    manual_tab=page.evaluate("__state().sessions['kick:yetz'].tabId")
    assert page.evaluate("__state().sessions['kick:yetz'].ownerIds.includes('manual')")
    page.locator('#pokeidle-kick-enabled').uncheck()
    idle(page)
    assert page.evaluate("__state().sessions['kick:yetz'].tabId")==manual_tab
    assert page.evaluate("!__state().sessions['kick:gaules']")
    assert twitch_data(page)==original_twitch
    page.locator('#channels .row').filter(has_text='yetz').get_by_role('button',name='Fechar',exact=True).click()
    idle(page)

    page.evaluate("__setProvider('gaules',false);__advance(61000)")
    page.locator('#pokeidle-kick-enabled').check()
    idle(page)
    assert page.evaluate("!__state().sessions['kick:gaules']")
    assert page.evaluate("__state().pokeidle.kickStatuses['kick:gaules'].live") is False
    page.evaluate("__setProvider('gaules','forbidden');__advance(61000)")
    before=page.evaluate('__created().length')
    sync(page)
    assert page.evaluate("__state().pokeidle.kickStatuses['kick:gaules'].live") is None
    assert page.evaluate("__state().pokeidle.kickStatuses['kick:gaules'].errorCode")=='forbidden'
    assert page.evaluate("!__state().sessions['kick:gaules']")
    assert page.evaluate('__created().length')==before
    stamp=page.evaluate("__state().pokeidle.kickStatuses['kick:gaules'].checkedAt")
    requests=page.evaluate("__requestCount('gaules')")
    page.evaluate('__advance(1000)')
    sync(page)
    assert page.evaluate("__requestCount('gaules')")==requests,'Atualização manual deve respeitar a espera da Kick'
    assert page.evaluate("__state().pokeidle.kickStatuses['kick:gaules'].checkedAt")==stamp
    assert page.locator('#kick-sync-warning').is_visible()
    assert page.evaluate('__refreshOldWidget()')=={'accepted':True}
    refresh(page)
    assert page.evaluate("!__state().sessions['kick:gaules']"),'Um marcador DOM antigo não substitui a consulta desconhecida'
    assert page.evaluate("__state().pokeidle.kickStatuses['kick:gaules'].live") is None
    helpers['open_details'](page,'#pokeidle-list-panel')
    page.locator('#pokeidle-filter').select_option('kick')
    gaules=page.locator('#pokeidle-channels .card').filter(has_text='gaules')
    assert 'Status a verificar' in gaules.inner_text()
    assert 'Sinal de live' not in gaules.inner_text(),'A interface não pode ressuscitar o marcador de live antigo'
    yetz=page.locator('#pokeidle-channels .card').filter(has_text='yetz')
    assert 'Sinal de live' in yetz.inner_text()
    assert page.locator('#kick-sync-summary').inner_text().startswith('2 canais · 1 com sinal de live')

    previous=page.evaluate('JSON.stringify(__state().pokeidle.channels)')
    for mode,expected in [('missing','source-unavailable'),('empty','no-channels')]:
        page.evaluate('mode=>__setReader(mode)',mode)
        sync(page)
        assert page.evaluate('__state().pokeidle.kickSync.status')==expected
        assert page.evaluate('JSON.stringify(__state().pokeidle.channels)')==previous
        assert page.evaluate("!__state().sessions['kick:gaules']")
    helpers['no_overflow'](page)
    assert not errors,errors
    assert page.locator('#error').is_hidden(),page.locator('#error').text_content()
    context.close()
    print(f'PASS: Kick sync {width}x{height} — background/controller reais, origem isolada, Twitch preservada, opção Kick independente, atualização desligada, registros conservados e API desconhecida sem regressão ao DOM. Rede/APIs simuladas; sem pontos reais.')


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
