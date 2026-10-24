import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createController } from '../src/core.js';
import { normalizeLiveWatch, watchEligible, kickLiveFromResponse, collectLiveWatch, publicTwitchChat } from '../src/live-watch.js';

function fixture({ configured = true } = {}) {
  const data = { twitchChatAuth: { token: 'private-never-return', login: 'tester' } };
  const tabs = new Map();
  const opened = [], removed = [], joined = [];
  let nextId = 1;
  const chat = {
    status: async () => ({ configured, connected: configured && joined.length > 0, login: configured ? 'tester' : '', token: 'private-never-return', channels: Object.fromEntries(joined.map(name => [name, { joined: true, requested: true }])) }),
    reconcile: async names => { joined.splice(0, joined.length, ...names); },
    liveStatuses: async names => Object.fromEntries(names.map(name => [name, true]))
  };
  const api = {
    runtime: { getURL: file => `moz-extension://test/${file}` },
    storage: { local: {
      get: async keys => Object.fromEntries(keys.filter(key => Object.hasOwn(data, key)).map(key => [key, structuredClone(data[key])])),
      set: async values => Object.assign(data, structuredClone(values))
    } },
    tabs: {
      create: async options => { const tab = { id: nextId++, ...options }; tabs.set(tab.id, tab); opened.push(tab); return tab; },
      get: async id => { if (!tabs.has(id)) throw Error('Aba fechada'); return tabs.get(id); },
      update: async (id, values) => Object.assign(tabs.get(id), values),
      remove: async id => { removed.push(id); tabs.delete(id); }
    }
  };
  const run = createController(api, { twitchChat: chat });
  const add = async (platform, name) => run({ type: 'add', platform, input: name });
  const enable = async (channelIds, twitchMode = 'irc') => run({ type: 'setLiveWatch', enabled: true, channelIds, twitchMode });
  const sample = async statuses => run({ type: 'liveWatchSnapshot', statuses });
  return { data, tabs, api, chat, run, add, enable, sample, opened, removed, joined };
}

test('normaliza referências/estados e trata consultas incompletas como desconhecidas', () => {
  const channels = [{ id: 'kick:yetz' }];
  assert.deepEqual(normalizeLiveWatch(null, channels), { enabled: false, channelIds: [], statuses: {}, lastCheckedAt: null, twitchMode: 'chat' });
  const state = normalizeLiveWatch({ enabled: true, channelIds: ['kick:yetz', 'outro', 'kick:yetz'], statuses: { 'kick:yetz': { live: 'true', checkedAt: 100 } } }, channels);
  assert.deepEqual(state.channelIds, ['kick:yetz']);
  assert.equal(state.statuses['kick:yetz'].live, null);
  assert.equal(watchEligible({ liveWatch: state }, 'kick:yetz', 100), false);
  for (const value of [null, {}, { livestream: {} }, { livestream: [] }, { livestream: 'live' }, { livestream: { id: -1 } }]) assert.equal(kickLiveFromResponse(value), null);
  assert.equal(kickLiveFromResponse({ livestream: null }), false);
  assert.equal(kickLiveFromResponse({ livestream: { id: 123 } }), true);
  assert.equal(kickLiveFromResponse({ livestream: { id: 123, is_live: false } }), false);
});

test('Kick abre em segundo plano quando online e fecha exclusivamente sua aba quando offline', async () => {
  const b = fixture();
  await b.add('kick', 'yetz'); await b.enable(['kick:yetz']);
  assert.equal(b.opened.length, 0);
  let state = await b.sample({ 'kick:yetz': true });
  assert.equal(b.opened[0].url, 'https://kick.com/yetz');
  assert.equal(b.opened[0].active, false);
  assert.equal(b.tabs.get(b.opened[0].id).muted, true);
  assert.deepEqual(state.sessions['kick:yetz'].ownerIds, ['live-watch']);
  await b.sample({ 'kick:yetz': true });
  assert.equal(b.opened.length, 1);
  state = await b.sample({ 'kick:yetz': false });
  assert.deepEqual(state.sessions, {});
  assert.deepEqual(b.removed, [1]);
});

test('erro/desconhecido preserva sessão existente e não abre um canal sem confirmação', async () => {
  const b = fixture();
  await b.add('kick', 'yetz'); await b.add('kick', 'outro'); await b.enable(['kick:yetz', 'kick:outro']);
  await b.sample({ 'kick:yetz': true, 'kick:outro': null });
  const state = await b.sample({ 'kick:yetz': null });
  assert.ok(state.sessions['kick:yetz']);
  assert.equal(state.sessions['kick:outro'], undefined);
  assert.equal(b.opened.length, 1); assert.deepEqual(b.removed, []);
});

test('Twitch entra no chat autenticado sem criar qualquer aba e sai quando offline', async () => {
  const b = fixture();
  await b.add('twitch', 'tftoddy'); await b.enable(['twitch:tftoddy']);
  let state = await b.sample({ 'twitch:tftoddy': true });
  assert.equal(state.sessions['twitch:tftoddy'].transport, 'irc');
  assert.equal(state.sessions['twitch:tftoddy'].tabId, undefined);
  assert.equal(b.opened.length, 0);
  assert.deepEqual(b.joined, ['tftoddy']);
  assert.equal(state.twitchChat.channels.tftoddy.joined, true);
  state = await b.sample({ 'twitch:tftoddy': false });
  assert.deepEqual(b.joined, []); assert.deepEqual(state.sessions, {});
  assert.equal(b.opened.length, 0);
});

test('sem autenticação Twitch permanece na fila sem fallback para uma aba', async () => {
  const b = fixture({ configured: false });
  await b.add('twitch', 'tftoddy'); await b.enable(['twitch:tftoddy']);
  const state = await b.sample({ 'twitch:tftoddy': true });
  assert.deepEqual(state.sessions, {});
  assert.deepEqual(state.queue, ['twitch:tftoddy']);
  assert.match(state.warnings.join(' '), /Conecte o chat Twitch/);
  assert.equal(b.opened.length, 0); assert.deepEqual(b.joined, []);
});

test('Fechar todos e pausa individual impedem ressurreição; retomar reativa apenas online', async () => {
  const b = fixture();
  await b.add('kick', 'yetz'); await b.add('twitch', 'tftoddy'); await b.enable(['kick:yetz', 'twitch:tftoddy']);
  await b.sample({ 'kick:yetz': true, 'twitch:tftoddy': true });
  await b.run({ type: 'stopAll' });
  let state = await b.sample({ 'kick:yetz': true, 'twitch:tftoddy': false });
  assert.deepEqual(state.sessions, {}); assert.deepEqual(b.joined, []);
  state = await b.run({ type: 'startAll' });
  assert.ok(state.sessions['kick:yetz']); assert.equal(state.sessions['twitch:tftoddy'], undefined);
  await b.run({ type: 'stop', id: 'kick:yetz' });
  state = await b.sample({ 'kick:yetz': true });
  assert.deepEqual(state.sessions, {});
  state = await b.run({ type: 'resumeAutomation' });
  assert.ok(state.sessions['kick:yetz']);
});

test('offline e desativar monitor preservam participação manual e abas pessoais', async () => {
  const b = fixture();
  await b.add('kick', 'yetz'); await b.run({ type: 'start', id: 'kick:yetz' });
  b.tabs.set(99, { id: 99, url: 'https://example.org' });
  await b.enable(['kick:yetz']); await b.sample({ 'kick:yetz': true });
  let state = await b.sample({ 'kick:yetz': false });
  assert.ok(state.sessions['kick:yetz']); assert.deepEqual(state.sessions['kick:yetz'].ownerIds, ['manual']);
  state = await b.run({ type: 'setLiveWatch', enabled: false, channelIds: [] });
  assert.ok(state.sessions['kick:yetz']); assert.ok(b.tabs.has(99)); assert.deepEqual(b.removed, []);
});

test('ativar monitor desativa agendas sem apagar dados nem desabilitar a leitura PokeIdle', async () => {
  const b = fixture();
  await b.add('kick', 'yetz');
  const now = Date.now();
  await b.run({ type: 'addSchedule', schedule: { channelIds: ['kick:yetz'], startsAt: now + 100000, endsAt: now + 200000 } });
  let state = await b.enable(['kick:yetz']);
  assert.equal(state.schedules.length, 1); assert.equal(state.schedules[0].enabled, false); assert.equal(state.pokeidle.enabled, true);
  state = await b.run({ type: 'setLiveWatch', enabled: false, channelIds: [] });
  assert.equal(state.schedules[0].enabled, false); assert.equal(state.pokeidle.enabled, true);
});

test('configuração inválida não altera estado e dados públicos nunca contêm credenciais', async () => {
  const b = fixture(); await b.add('twitch', 'tftoddy');
  const before = structuredClone(b.data);
  for (const value of [{ enabled: 'yes', channelIds: [] }, { enabled: true, channelIds: [] }, { enabled: true, channelIds: 'x' }, { enabled: true, channelIds: ['unknown'] }]) await assert.rejects(b.run({ type: 'setLiveWatch', ...value }), /inválida/);
  assert.deepEqual(b.data, before);
  const state = await b.run({ type: 'status' });
  assert.ok(!JSON.stringify(state).includes('private-never-return'));
  assert.equal(state.twitchChatAuth, undefined); assert.equal(state.twitchChat.token, undefined);
  assert.equal(publicTwitchChat({ error: 'private-never-return', token: 'secret' }).error.includes('private-never-return'), false);
});

test('provedores consultam somente selecionados e preservam null em erros HTTP ou dados incompletos', async () => {
  const channels = ['online', 'offline', 'broken', 'denied'].map(name => ({ id: `kick:${name}`, platform: 'kick', name }));
  channels.push({ id: 'twitch:streamer', platform: 'twitch', name: 'streamer' }, { id: 'kick:not_selected', platform: 'kick', name: 'not_selected' });
  const calls = [];
  const state = { channels, liveWatch: { enabled: true, twitchMode: 'irc', channelIds: channels.slice(0, 5).map(item => item.id) } };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const name = url.split('/').at(-1);
    return { ok: name !== 'denied', json: async () => name === 'online' ? { livestream: { id: 1 } } : name === 'offline' ? { livestream: null } : {} };
  };
  const result = await collectLiveWatch(state, { liveStatuses: async names => { assert.deepEqual(names, ['streamer']); return { streamer: true }; } }, { fetch });
  assert.deepEqual(result, { 'kick:online': true, 'kick:offline': false, 'kick:broken': null, 'kick:denied': null, 'twitch:streamer': true });
  assert.equal(calls.length, 4); assert.ok(calls.every(call => call.options.credentials === 'omit'));
});

test('chats IRC não consomem vagas de abas Kick e reduzir limite não os encerra', async () => {
  const b = fixture();
  await b.add('twitch', 'primeiro'); await b.add('twitch', 'segundo'); await b.add('kick', 'yetz');
  await b.run({ type: 'setSettings', settings: { maxConcurrent: 1 } });
  await b.enable(['twitch:primeiro', 'twitch:segundo', 'kick:yetz']);
  let state = await b.sample({ 'twitch:primeiro': true, 'twitch:segundo': true, 'kick:yetz': true });
  assert.equal(Object.keys(state.sessions).length, 3);
  assert.equal(state.sessions['twitch:primeiro'].transport, 'irc');
  assert.equal(state.sessions['twitch:segundo'].transport, 'irc');
  assert.equal(b.opened.length, 1); assert.equal(b.opened[0].url, 'https://kick.com/yetz');
  state = await b.run({ type: 'setSettings', settings: { maxConcurrent: 1 } });
  assert.equal(Object.keys(state.sessions).length, 3); assert.deepEqual(b.removed, []);
});

test('PokeIdle continua habilitável durante monitoramento sem criar vídeo Twitch', async () => {
  const b = fixture(); await b.add('twitch', 'tftoddy'); await b.enable(['twitch:tftoddy']);
  const state = await b.run({ type: 'setPokeIdle', enabled: true });
  assert.equal(state.pokeidle.enabled, true);
  assert.equal(b.opened.length, 0);
});

test('background consulta fora da fila, usa alarmes e recusa comandos da página de conteúdo', { timeout: 3000 }, async () => {
  const data = {};
  const tabs = new Map();
  const events = () => { const list = []; return { addListener: fn => list.push(fn), emit: (...args) => list.map(fn => fn(...args)) }; };
  let online = true;
  let requests = 0;
  let nextId = 1;
  const api = {
    runtime: { id: 'self', getURL: file => `moz-extension://self/${file}`, onMessage: events(), onInstalled: events(), onStartup: events() },
    storage: { local: { get: async keys => Object.fromEntries(keys.filter(key => Object.hasOwn(data, key)).map(key => [key, structuredClone(data[key])])), set: async values => Object.assign(data, structuredClone(values)) } },
    tabs: { onRemoved: events(),
      create: async values => { const tab = { id: nextId++, ...values }; tabs.set(tab.id, tab); return tab; },
      get: async id => { if (!tabs.has(id)) throw Error('Fechada'); return tabs.get(id); },
      remove: async id => { tabs.delete(id); api.tabs.onRemoved.emit(id); },
      update: async (id, values) => Object.assign(tabs.get(id), values)
    },
    alarms: { onAlarm: events(), get: async () => ({ name: 'chat-leve-tick' }), create: async () => {} }
  };
  const context = vm.createContext({ browser: api, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    fetch: async () => { requests++; return { ok: true, json: async () => ({ livestream: online ? { id: 123 } : null }) }; } });
  for (const name of ['rewards', 'pokeidle-state', 'ui-state', 'automation', 'live-watch', 'twitch-chat', 'core', 'background']) {
    const source = (await readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8')).replace(/^import .* from .*;\r?\n/gm, '').replace(/^export /gm, '');
    vm.runInContext(source, context, { filename: `${name}.js` });
  }
  const sender = { id: 'self', url: api.runtime.getURL('popup.html'), tab: { id: 999 } };
  const send = message => new Promise(resolve => assert.ok(api.runtime.onMessage.emit(message, sender, resolve).includes(true)));
  assert.equal((await send({ type: 'add', platform: 'kick', input: 'yetz' })).ok, true);
  let response = await send({ type: 'setLiveWatch', enabled: true, channelIds: ['kick:yetz'] });
  assert.equal(response.ok, true); assert.equal(response.state.liveWatch.statuses['kick:yetz'].live, true);
  assert.equal(tabs.size, 1);
  online = false;
  api.alarms.onAlarm.emit({ name: 'chat-leve-tick' });
  response = await send({ type: 'watchNow' });
  assert.equal(response.state.liveWatch.statuses['kick:yetz'].live, false); assert.equal(tabs.size, 0);
  assert.equal(api.runtime.onMessage.emit({ type: 'configureTwitchChat', token: 'not-sent-to-page' }, { id: 'self', url: 'https://kick.com/yetz', tab: { id: 1 } }, () => assert.fail())[0], false);
  await send({ type: 'stopAll' }); online = true;
  const stoppedRequests = requests;
  api.alarms.onAlarm.emit({ name: 'chat-leve-tick' });
  await new Promise(resolve => setImmediate(resolve));
  await send({ type: 'status' });
  assert.equal(requests, stoppedRequests, 'Fechar todos suspende consultas periódicas; consulta manual continua possível');
  response = await send({ type: 'watchNow' });
  assert.equal(response.state.automationPaused, true); assert.equal(tabs.size, 0);
});

test('primeira leitura migra horários antigos para inativos sem apagar registros nem abrir canais', async () => {
  const b = fixture();
  const now = Date.now();
  b.data.channels = [{ id: 'kick:yetz', platform: 'kick', name: 'yetz' }];
  b.data.schedules = [{ id: 'legacy', channelIds: ['kick:yetz'], enabled: true, startsAt: now - 60000, endsAt: now + 60000, startedAt: null, endedAt: null }];
  let state = await b.run({ type: 'tick' });
  assert.equal(state.automationsMigrated, true);
  assert.equal(state.schedules.length, 1); assert.equal(state.schedules[0].enabled, false);
  assert.equal(b.opened.length, 0);
  assert.equal(b.data.automationsMigrated, true);
  state = await b.run({ type: 'addSchedule', schedule: { channelIds: ['kick:yetz'], startsAt: now + 60000, endsAt: now + 120000 } });
  assert.equal(state.schedules.find(value => value.id !== 'legacy').enabled, true, 'a migração é feita uma vez e preserva compatibilidade da API');
});
