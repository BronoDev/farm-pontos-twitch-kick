import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createController, sessionUrl } from '../src/core.js';
import { POKEIDLE_OWNER, POKEIDLE_URL } from '../src/pokeidle-state.js';

const SOURCE_TAB = 900;
const NOW = 1_800_000_000_000;
const twitch = name => ({ id: `twitch:${name}`, platform: 'twitch', name });
const chatUrl = name => `https://www.twitch.tv/popout/${name}/chat?popout=`;

function fixture(initial = {}, { authenticated = false } = {}) {
  const data = structuredClone(initial);
  const tabs = new Map([[SOURCE_TAB, { id: SOURCE_TAB, url: POKEIDLE_URL }]]);
  const created = [], removed = [], updates = [], ircNames = [];
  let nextId = 1;
  const chat = {
    status: async () => ({ configured: authenticated, connected: authenticated && ircNames.length > 0,
      login: authenticated ? 'tester' : '', channels: Object.fromEntries(ircNames.map(name => [name, { joined: true, requested: true }])) }),
    reconcile: async names => { ircNames.splice(0, ircNames.length, ...names); },
    liveStatuses: async names => Object.fromEntries(names.map(name => [name, true]))
  };
  const api = {
    runtime: { getURL: file => `chrome-extension://routing/${file}` },
    storage: { local: {
      get: async () => structuredClone(data),
      set: async value => Object.assign(data, structuredClone(value))
    } },
    tabs: {
      create: async options => { const tab = { id: nextId++, ...options }; tabs.set(tab.id, tab); created.push(structuredClone(options)); return tab; },
      get: async id => { if (!tabs.has(id)) throw Error('Aba fechada'); return tabs.get(id); },
      update: async (id, options) => { updates.push({ id, ...structuredClone(options) }); return Object.assign(tabs.get(id), options); },
      remove: async id => { removed.push(id); tabs.delete(id); },
      query: async () => [...tabs.values()]
    }
  };
  const run = createController(api, { twitchChat: chat });
  const snapshot = channels => run({ type: 'pokeidleSnapshot', snapshot: { ready: true, channels, ruleText: '+15%' } },
    { tab: { id: SOURCE_TAB }, url: POKEIDLE_URL, frameId: 0 });
  return { api, data, tabs, created, removed, updates, ircNames, run, snapshot };
}
const entry = (platform, name, live = true, extra = {}) => ({ platform, name, displayName: name,
  live, bonus: platform === 'twitch', missing: platform === 'twitch', source: 'widget', ...extra });

function clock(t) {
  let now = NOW;
  t.mock.method(Date, 'now', () => now);
  return { advance(ms) { now += ms; } };
}

test('Twitch nunca gera URL do player, inclusive diante de uma sessão antiga marcada live', () => {
  assert.equal(sessionUrl(twitch('yetz'), { media: 'live' }), chatUrl('yetz'));
  assert.equal(sessionUrl(twitch('yetz'), { media: 'chat' }), chatUrl('yetz'));
  assert.equal(sessionUrl({ platform: 'kick', name: 'yetz' }, { media: 'live' }), 'https://kick.com/yetz');
});

test('atualização converte a live Twitch gerenciada em chat na mesma aba, conservando donos e pausa', async t => {
  clock(t);
  const item = twitch('canal');
  const b = fixture({ channels: [item], automationPaused: true, pausedChannels: [item.id],
    sessions: { [item.id]: { tabId: 50, openedAt: NOW - 1000, mode: 'background', media: 'live',
      ownerIds: ['manual', POKEIDLE_OWNER], playback: { playing: true, height: 1080 } } } });
  b.tabs.set(50, { id: 50, url: 'https://www.twitch.tv/canal', active: true });
  const state = await b.run({ type: 'status' });
  assert.equal(b.created.length, 0);
  assert.deepEqual(b.removed, []);
  assert.equal(b.tabs.get(50).url, chatUrl('canal'));
  assert.equal(b.tabs.get(50).active, false);
  assert.equal(state.sessions[item.id].tabId, 50);
  assert.equal(state.sessions[item.id].openedAt, NOW - 1000);
  assert.equal(state.sessions[item.id].media, 'chat');
  assert.equal(state.sessions[item.id].playback, undefined);
  assert.deepEqual(state.sessions[item.id].ownerIds, ['manual', POKEIDLE_OWNER]);
  assert.equal(state.automationPaused, true);
  assert.deepEqual(state.pausedChannels, [item.id]);
  assert.ok(b.updates.some(update => update.id === 50 && update.url === chatUrl('canal')));
  await b.run({ type: 'tick' });
  assert.equal(b.updates.filter(update => update.url).length, 1, 'a migração não se repete no próximo tick');
});

test('migração não navega nem fecha uma aba reaproveitada para outro canal ou site', async t => {
  clock(t);
  for (const url of ['https://example.com/', 'https://www.twitch.tv/outro', 'https://www.twitch.tv.evil.test/canal']) {
    const item = twitch('canal');
    const b = fixture({ channels: [item], sessions: { [item.id]: { tabId: 50, openedAt: NOW, mode: 'background', media: 'live' } } });
    b.tabs.set(50, { id: 50, url });
    const state = await b.run({ type: 'status' });
    assert.equal(b.tabs.get(50).url, url);
    assert.deepEqual(b.removed, []);
    assert.deepEqual(b.updates, []);
    assert.equal(state.sessions[item.id], undefined);
  }
});

test('falha transitória ao migrar a live Twitch mantém a aba gerenciada até conseguir trocar por chat', async t => {
  clock(t);
  const item = twitch('canal');
  const b = fixture({ channels: [item], queue: [item.id], queueSources: { [item.id]: [POKEIDLE_OWNER] },
    pokeidle: { enabled: true, connected: true, observedAt: NOW, sourceTabId: SOURCE_TAB, channels: [entry('twitch', 'canal')] },
    sessions: { [item.id]: { tabId: 50, openedAt: NOW - 1000, mode: 'background', media: 'live', ownerIds: [POKEIDLE_OWNER] } } });
  b.tabs.set(50, { id: 50, url: 'https://www.twitch.tv/canal' });
  const update = b.api.tabs.update;
  let attempts = 0;
  b.api.tabs.update = async (...args) => { if (++attempts === 1) throw Error('Indisponível'); return update(...args); };
  let state = await b.run({ type: 'status' });
  assert.equal(state.sessions[item.id].tabId, 50);
  assert.equal(state.sessions[item.id].media, 'live');
  assert.equal(b.tabs.get(50).url, 'https://www.twitch.tv/canal');
  assert.equal(b.created.length, 0); assert.deepEqual(b.removed, []);
  state = await b.run({ type: 'status' });
  assert.equal(state.sessions[item.id].tabId, 50);
  assert.equal(state.sessions[item.id].media, 'chat');
  assert.equal(b.tabs.get(50).url, chatUrl('canal'));
  assert.equal(b.created.length, 0); assert.deepEqual(b.removed, []);
});

test('falha permanente na migração não impede Fechar todos de encerrar a live gerenciada', async t => {
  clock(t);
  const item = twitch('canal');
  const b = fixture({ channels: [item], sessions: { [item.id]: { tabId: 50, openedAt: NOW, mode: 'background', media: 'live', ownerIds: ['manual'] } } });
  b.tabs.set(50, { id: 50, url: 'https://www.twitch.tv/canal' });
  b.tabs.set(99, { id: 99, url: 'https://example.org/' });
  b.api.tabs.update = async () => { throw Error('Indisponível'); };
  const state = await b.run({ type: 'stopAll' });
  assert.deepEqual(state.sessions, {});
  assert.deepEqual(b.removed, [50]);
  assert.ok(b.tabs.has(99));
  assert.equal(b.created.length, 0);
});

test('fonte Kick troca o padrão antigo de chat por live e preserva somente a escolha de chat explícita', async t => {
  clock(t);
  for (const kickMode of [undefined, 'default', 'chat']) {
    const item = { id: 'kick:yetz', platform: 'kick', name: 'yetz', ...(kickMode ? { kickMode } : {}) };
    const b = fixture({ kickLive: false, channels: [item] });
    await b.snapshot([entry('kick', 'yetz')]);
    const expectedMode = kickMode === 'chat' ? 'chat' : 'live';
    assert.equal(b.data.channels[0].kickMode, expectedMode);
    assert.equal(b.data.sessions[item.id].media, expectedMode);
    assert.equal(b.created[0].url, expectedMode === 'live' ? 'https://kick.com/yetz' : 'https://kick.com/popout/yetz/chat');
  }
});

test('a Twitch recusa todo contexto e telemetria de player mesmo no estado legado', async t => {
  clock(t);
  const item = twitch('canal');
  const b = fixture({ channels: [item], sessions: { [item.id]: { tabId: 50, openedAt: NOW, mode: 'background', media: 'live' } } });
  b.tabs.set(50, { id: 50, url: 'https://www.twitch.tv/canal' });
  const sender = { tab: { id: 50 }, url: 'https://www.twitch.tv/canal' };
  for (const type of ['playerContext', 'playerTelemetry', 'kickContext', 'kickTelemetry']) {
    assert.deepEqual(await b.run({ type, sample: { playing: true, height: 1080 } }, sender), { managed: false });
  }
  const state = await b.run({ type: 'status' });
  assert.equal(state.sessions[item.id].playback, undefined);
  assert.deepEqual(await b.run({ type: 'playerContext' }, { ...sender, url: chatUrl('canal') }), { managed: false });
});

test('PokeIdle misto abre somente chat Twitch e espera confirmar o link Kick antes de abrir vídeo', async t => {
  clock(t);
  const b = fixture();
  assert.deepEqual(await b.snapshot([entry('twitch', 'canal'), entry('kick', 'yetz', null, { source: 'link' })]), { accepted: true });
  assert.equal(b.data.channels.length, 2);
  assert.equal(b.data.channels.find(item => item.id === 'kick:yetz').kickMode, 'live');
  assert.equal(b.created.length, 1);
  assert.equal(b.created[0].url, chatUrl('canal'));
  assert.equal(b.data.sessions['twitch:canal'].media, 'chat');
  assert.equal(b.data.sessions['kick:yetz'], undefined);
  let state = await b.run({ type: 'pokeidleKickSnapshot', statuses: { 'kick:yetz': true } });
  assert.equal(state.sessions['kick:yetz'].media, 'live');
  assert.equal(b.created.at(-1).url, 'https://kick.com/yetz');
  assert.equal(b.created.at(-1).active, false);
  assert.equal(b.tabs.get(state.sessions['kick:yetz'].tabId).muted, true);
  state = await b.run({ type: 'pokeidleKickSnapshot', statuses: { 'kick:yetz': false } });
  assert.equal(state.sessions['kick:yetz'], undefined);
  assert.ok(state.sessions['twitch:canal']);
  assert.equal(b.created.filter(options => options.url.startsWith('https://www.twitch.tv/')).every(options => options.url.includes('/popout/')), true);
});

test('Kick com o mesmo nome da Twitch não é deduplicada ou excluída junto com ela', async t => {
  clock(t);
  const b = fixture();
  const channels = [entry('twitch', 'shared'), entry('kick', 'shared')];
  await b.snapshot(channels);
  assert.deepEqual(b.data.channels.map(item => item.id), ['twitch:shared', 'kick:shared']);
  await b.run({ type: 'remove', id: 'kick:shared' });
  await b.snapshot(channels);
  assert.ok(b.data.channels.some(item => item.id === 'twitch:shared'));
  assert.equal(b.data.channels.some(item => item.id === 'kick:shared'), false);
  assert.ok(b.data.pokeidle.excludedIds.includes('kick:shared'));
  assert.equal(b.data.pokeidle.excludedNames.includes('shared'), false);
  assert.ok(b.data.sessions['twitch:shared']);
});

test('consulta Kick desconhecida não fecha a sessão e dados vencidos não iniciam outro canal', async t => {
  const time = clock(t);
  const b = fixture();
  await b.snapshot([entry('kick', 'first', null, { source: 'link' }), entry('kick', 'second', null, { source: 'link' })]);
  await b.run({ type: 'pokeidleKickSnapshot', statuses: { 'kick:first': true, 'kick:second': null } });
  time.advance(181000);
  let state = await b.run({ type: 'pokeidleKickSnapshot', statuses: { 'kick:first': null, 'kick:second': true } });
  assert.ok(state.sessions['kick:first']);
  assert.equal(state.sessions['kick:second'], undefined);
  state = await b.run({ type: 'pokeidleKickSnapshot', statuses: { 'kick:first': false } });
  assert.equal(state.sessions['kick:first'], undefined, 'offline explícito ainda encerra uma sessão existente quando a origem venceu');
});

test('Twitch padrão usa popout contínuo sem OAuth e pausa impede reabertura', async t => {
  clock(t);
  const b = fixture({ settings: { maxConcurrent: 2 } });
  await b.run({ type: 'add', platform: 'twitch', input: 'canal' });
  let state = await b.run({ type: 'setLiveWatch', enabled: true, channelIds: ['twitch:canal'] });
  assert.equal(state.liveWatch.twitchMode, 'chat');
  assert.equal(b.created.length, 1);
  assert.equal(b.created[0].url, chatUrl('canal'));
  assert.equal(state.sessions['twitch:canal'].media, 'chat');
  assert.equal(state.sessions['twitch:canal'].transport, undefined);
  assert.deepEqual(b.ircNames, []);
  state = await b.run({ type: 'liveWatchSnapshot', statuses: { 'twitch:canal': false } });
  assert.ok(state.sessions['twitch:canal'], 'o popout de chat continua sem depender de vídeo ou status de transmissão');
  await b.run({ type: 'stopAll' });
  state = await b.run({ type: 'liveWatchSnapshot', statuses: { 'twitch:canal': true } });
  assert.deepEqual(state.sessions, {});
  assert.equal(b.created.length, 1);
  state = await b.run({ type: 'resumeAutomation' });
  assert.ok(state.sessions['twitch:canal']);
  assert.equal(b.created.length, 2);
});

test('IRC só é usado quando escolhido explicitamente e sem autenticação não vira player', async t => {
  clock(t);
  const b = fixture();
  await b.run({ type: 'add', platform: 'twitch', input: 'canal' });
  let state = await b.run({ type: 'setLiveWatch', enabled: true, channelIds: ['twitch:canal'], twitchMode: 'irc' });
  state = await b.run({ type: 'liveWatchSnapshot', statuses: { 'twitch:canal': true } });
  assert.deepEqual(b.created, []);
  assert.equal(state.sessions['twitch:canal'], undefined);
  assert.ok(state.queue.includes('twitch:canal'));
  await assert.rejects(b.run({ type: 'setLiveWatch', enabled: true, channelIds: ['twitch:canal'], twitchMode: 'video' }), /inválid/);
});

test('popouts Twitch contam no limite físico de abas, ao contrário do IRC explícito', async t => {
  clock(t);
  const b = fixture({ settings: { maxConcurrent: 1 } });
  await b.run({ type: 'add', platform: 'twitch', input: 'first' });
  await b.run({ type: 'add', platform: 'twitch', input: 'second' });
  const state = await b.run({ type: 'setLiveWatch', enabled: true, channelIds: ['twitch:first', 'twitch:second'] });
  assert.equal(b.created.length, 1);
  assert.equal(Object.keys(state.sessions).length, 1);
  assert.equal(state.queue.length, 1);
});

test('a migração restaura a fonte PokeIdle desativada pela versão anterior uma única vez, conservando pausas', async t => {
  clock(t);
  const item = { id: 'kick:yetz', platform: 'kick', name: 'yetz' };
  const b = fixture({ channels: [item], automationPaused: true, pausedChannels: [item.id],
    liveWatch: { enabled: true, channelIds: [item.id] },
    pokeidle: { enabled: false, connected: true, observedAt: NOW, sourceTabId: SOURCE_TAB,
      channels: [entry('kick', 'yetz', null, { source: 'link' })] } });
  let state = await b.run({ type: 'status' });
  assert.equal(state.platformRoutingMigrated, true);
  assert.equal(b.data.platformRoutingMigrated, true);
  assert.equal(state.pokeidle.enabled, true);
  assert.equal(state.automationPaused, true);
  assert.deepEqual(state.pausedChannels, [item.id]);
  state = await b.run({ type: 'pokeidleKickSnapshot', statuses: { [item.id]: true } });
  assert.equal(b.created.length, 0, 'a restauração da fonte não desfaz Fechar todos nem a pausa do canal');
  assert.deepEqual(state.sessions, {});
  await b.run({ type: 'setPokeIdle', enabled: false });
  state = await b.run({ type: 'status' });
  assert.equal(state.pokeidle.enabled, false, 'uma escolha explícita posterior não é desfeita pela migração');
  assert.equal(state.platformRoutingMigrated, true);
  assert.equal(state.automationPaused, true);
  assert.deepEqual(state.pausedChannels, [item.id]);
});

test('Kick do PokeIdle obtém uma vaga dos chats automáticos de menor prioridade e a devolve ao ficar offline', async t => {
  clock(t);
  const b = fixture({ settings: { maxConcurrent: 3, maxKickLives: 1 } });
  const channels = ['first', 'second', 'third'].map(name => entry('twitch', name));
  channels.push(entry('kick', 'yetz', null, { source: 'link' }));
  await b.snapshot(channels);
  const before = structuredClone(b.data.sessions);
  assert.equal(Object.keys(before).length, 3);
  assert.ok(Object.keys(before).every(id => id.startsWith('twitch:')));
  assert.equal(b.data.channels.find(item => item.id === 'kick:yetz').priority, 1);
  let state = await b.run({ type: 'pokeidleKickSnapshot', statuses: { 'kick:yetz': true } });
  assert.equal(Object.keys(state.sessions).length, 3);
  assert.ok(state.sessions['kick:yetz']);
  assert.equal(state.sessions['kick:yetz'].media, 'live');
  assert.equal(Object.keys(state.sessions).filter(id => id.startsWith('twitch:')).length, 2);
  const displaced = Object.keys(before).find(id => !state.sessions[id]);
  assert.ok(displaced, 'um chat exclusivamente automático libera a vaga');
  assert.ok(state.queue.includes(displaced));
  assert.deepEqual(state.queueSources[displaced], [POKEIDLE_OWNER]);
  assert.equal(state.pausedChannels.includes(displaced), false);
  assert.ok(state.sessionHistory.some(item => item.channelId === displaced && item.reason === 'kick-priority'));
  assert.equal(b.created.at(-1).url, 'https://kick.com/yetz');
  state = await b.run({ type: 'pokeidleKickSnapshot', statuses: { 'kick:yetz': false } });
  assert.equal(state.sessions['kick:yetz'], undefined);
  assert.equal(Object.keys(state.sessions).length, 3);
  assert.ok(Object.keys(state.sessions).every(id => id.startsWith('twitch:')));
  assert.ok(state.sessions[displaced]);
  assert.deepEqual(state.queue, []);
  assert.equal(b.created.at(-1).url, chatUrl(displaced.slice('twitch:'.length)));
});

for (const protection of ['priority', 'manual', 'shared']) {
  test(`Kick não toma a vaga de chats protegidos por ${protection}`, async t => {
    clock(t);
    const names = ['first', 'second', 'third'];
    const b = fixture({ settings: { maxConcurrent: 3, maxKickLives: 1 } });
    for (const name of names) {
      await b.run({ type: 'add', platform: 'twitch', input: name });
      if (protection === 'priority') await b.run({ type: 'setPriority', id: `twitch:${name}`, priority: 2 });
      else await b.run({ type: 'start', id: `twitch:${name}` });
    }
    const sourceChannels = names.map(name => entry('twitch', name, true, { missing: protection !== 'manual' }));
    sourceChannels.push(entry('kick', 'yetz', null, { source: 'link' }));
    await b.snapshot(sourceChannels);
    const before = structuredClone(b.data.sessions);
    assert.equal(Object.keys(before).length, 3);
    for (const session of Object.values(before)) {
      if (protection === 'manual') assert.deepEqual(session.ownerIds, ['manual']);
      else if (protection === 'shared') assert.deepEqual(new Set(session.ownerIds), new Set(['manual', POKEIDLE_OWNER]));
      else assert.deepEqual(session.ownerIds, [POKEIDLE_OWNER]);
    }
    const state = await b.run({ type: 'pokeidleKickSnapshot', statuses: { 'kick:yetz': true } });
    assert.deepEqual(state.sessions, before);
    assert.equal(state.sessions['kick:yetz'], undefined);
    assert.ok(state.queue.includes('kick:yetz'));
    assert.equal(b.created.length, 3);
    assert.deepEqual(b.removed, []);
    assert.equal(state.sessionHistory.some(item => item.reason === 'kick-priority'), false);
  });
}

test('background importa Kick do PokeIdle e consulta seu estado mesmo sem o monitor manual habilitado', { timeout: 3000 }, async () => {
  const data = {};
  const tabs = new Map([[90, { id: 90, url: POKEIDLE_URL }]]);
  const created = [], removed = [], requests = [];
  const event = () => {
    const listeners = [];
    return { addListener: listener => listeners.push(listener), emit: (...args) => listeners.map(listener => listener(...args)) };
  };
  let online = true;
  let nextId = 1;
  const api = {
    runtime: { id: 'self', getURL: file => `moz-extension://self/${file}`,
      onMessage: event(), onInstalled: event(), onStartup: event() },
    storage: { local: {
      get: async keys => Object.fromEntries(keys.filter(key => Object.hasOwn(data, key)).map(key => [key, structuredClone(data[key])])),
      set: async values => Object.assign(data, structuredClone(values))
    } },
    tabs: {
      onRemoved: event(),
      create: async options => { const tab = { id: nextId++, ...options }; tabs.set(tab.id, tab); created.push(structuredClone(options)); return tab; },
      get: async id => { if (!tabs.has(id)) throw Error('Aba fechada'); return tabs.get(id); },
      update: async (id, values) => Object.assign(tabs.get(id), values),
      remove: async id => { removed.push(id); tabs.delete(id); api.tabs.onRemoved.emit(id); }
    },
    alarms: { onAlarm: event(), get: async () => ({ name: 'chat-leve-tick' }), create: async () => {} }
  };
  class ClockDate extends Date { static now() { return NOW; } }
  const context = vm.createContext({ browser: api, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Date: ClockDate,
    fetch: async (url, options) => {
      requests.push({ url, options });
      assert.equal(url, 'https://kick.com/api/v2/channels/yetz');
      return { ok: true, json: async () => ({ livestream: online ? { id: 123 } : null }) };
    }
  });
  for (const name of ['rewards', 'pokeidle-state', 'ui-state', 'automation', 'live-watch', 'twitch-chat', 'core', 'background']) {
    const source = (await readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8'))
      .replace(/^import .* from .*;\r?\n/gm, '').replace(/^export /gm, '');
    vm.runInContext(source, context, { filename: `${name}.js` });
  }
  const panel = { id: 'self', tab: { id: 999 }, url: api.runtime.getURL('popup.html') };
  const game = { id: 'self', tab: { id: 90 }, url: POKEIDLE_URL, frameId: 0 };
  const send = (message, sender = panel) => new Promise(resolve => {
    assert.ok(api.runtime.onMessage.emit(message, sender, resolve).includes(true));
  });
  await send({ type: 'status' });
  const accepted = await send({ type: 'pokeidleSnapshot', snapshot: { ready: true,
    channels: [entry('twitch', 'canal'), entry('kick', 'yetz', null, { source: 'link' })], ruleText: '+15%' } }, game);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.state.accepted, true);
  assert.deepEqual(Object.keys(accepted.state), ['accepted'], 'a página do jogo não recebe o estado do painel');
  let response = await send({ type: 'watchNow' });
  assert.equal(response.ok, true);
  assert.equal(response.state.liveWatch.enabled, false, 'importação PokeIdle funciona sem configurar o monitor separado');
  assert.equal(response.state.pokeidle.enabled, true);
  assert.equal(response.state.pokeidle.kickStatuses['kick:yetz'].live, true);
  assert.equal(response.state.pokeidle.kickStatuses['kick:yetz'].checkedAt, NOW);
  assert.ok(requests.length >= 1);
  assert.ok(requests.every(request => request.options.credentials === 'omit'));
  assert.equal(created.length, 2);
  assert.ok(created.some(options => options.url === 'https://kick.com/yetz'));
  assert.ok(created.some(options => options.url === chatUrl('canal')));
  assert.ok(created.every(options => options.active === false));
  const twitchTab = response.state.sessions['twitch:canal'].tabId;
  const kickTab = response.state.sessions['kick:yetz'].tabId;
  assert.equal(tabs.get(twitchTab).muted, true);
  assert.equal(tabs.get(kickTab).muted, true);
  online = false;
  response = await send({ type: 'watchNow' });
  assert.equal(response.state.sessions['kick:yetz'], undefined);
  assert.equal(response.state.sessions['twitch:canal'].tabId, twitchTab);
  assert.equal(tabs.has(twitchTab), true);
  assert.equal(removed.includes(kickTab), true);
  assert.equal(removed.includes(twitchTab), false);
  assert.equal(api.runtime.onMessage.emit({ type: 'watchNow' }, game, () => assert.fail('conteúdo não controla o monitor'))[0], false);
  await send({ type: 'stopAll' });
  online = true;
  const requestCount = requests.length;
  api.alarms.onAlarm.emit({ name: 'chat-leve-tick' });
  await new Promise(resolve => setImmediate(resolve));
  response = await send({ type: 'status' });
  assert.equal(requests.length, requestCount, 'a pausa interrompe consultas periódicas à Kick');
  assert.equal(response.state.automationPaused, true);
  assert.equal(Object.keys(response.state.sessions).length, 0);
  assert.equal(tabs.size, 1, 'somente o PokeIdle pessoal permanece aberto');
  response = await send({ type: 'watchNow' });
  assert.equal(response.state.automationPaused, true);
  assert.equal(Object.keys(response.state.sessions).length, 0, 'consulta manual também não desfaz Fechar todos');
  assert.equal(created.length, 2);
});
