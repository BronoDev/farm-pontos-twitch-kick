import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../src/core.js';
import { POKEIDLE_OWNER, POKEIDLE_URL, POKEIDLE_FRESH_MS, normalizePokeIdle, pokeIdleEligible, pokeIdleKickLive } from '../src/pokeidle-state.js';

const NOW = 1_800_000_000_000;
const entry = (platform, name, extra = {}) => ({ platform, name, displayName: name, source: 'widget', live: true, bonus: true, missing: true, ...extra });
const item = (platform, name) => ({ id: `${platform}:${name}`, platform, name, ...(platform === 'kick' ? { kickMode: 'live', priority: 1 } : {}) });
const sender = id => ({ tab: { id, url: POKEIDLE_URL }, url: POKEIDLE_URL, frameId: 0 });
function source(channels = [entry('twitch', 'tftoddy'), entry('kick', 'yetz')], extra = {}) {
  return { enabled: true, channels, ruleText: 'Regra Twitch original', observedAt: NOW - 10000, sourceTabId: 90, connected: true,
    kickSync: { enabled: true, observedAt: NOW - 20000, sourceTabId: 90, connected: true, status: 'idle' }, ...extra };
}
function fixture(t, initial = {}) {
  let now = NOW;
  t.mock.method(Date, 'now', () => now);
  const data = structuredClone(initial);
  const tabs = new Map([[90, { id: 90, url: POKEIDLE_URL }], [91, { id: 91, url: POKEIDLE_URL }]]);
  const opened = [], removed = [];
  let nextId = 100;
  const api = {
    runtime: { getURL: path => `chrome-extension://kick-sync/${path}` },
    storage: { local: { get: async () => structuredClone(data), set: async value => Object.assign(data, structuredClone(value)) } },
    tabs: {
      get: async id => { if (!tabs.has(id)) throw Error('Aba fechada'); return tabs.get(id); },
      create: async options => { const tab = { id: ++nextId, ...options }; tabs.set(tab.id, tab); opened.push(tab); return tab; },
      update: async (id, values) => Object.assign(tabs.get(id), values),
      remove: async id => { removed.push(id); tabs.delete(id); },
      reload: async () => {}
    }
  };
  return { data, tabs, opened, removed, run: createController(api), advance: ms => { now += ms; } };
}
const snapshot = (channels, platform) => ({ type: 'pokeidleSnapshot', ...(platform ? { platform } : {}), snapshot: { ready: true, channels, ruleText: 'Não substituir a regra Twitch' } });

test('sincronização Kick isolada preserva lista, origem, regra e hora Twitch', async t => {
  const b = fixture(t, { automationPaused: true, pokeidle: source() });
  await b.run({ type: 'status' });
  const before = structuredClone(b.data.pokeidle);
  assert.deepEqual(await b.run(snapshot([entry('kick', 'novo', { source: 'link', live: null, bonus: false, missing: false })], 'kick'), sender(91)), { accepted: true });
  const after = b.data.pokeidle;
  for (const key of ['enabled', 'ruleText', 'observedAt', 'sourceTabId', 'connected']) assert.deepEqual(after[key], before[key], key);
  assert.deepEqual(after.channels.filter(value => value.platform === 'twitch'), before.channels.filter(value => value.platform === 'twitch'));
  assert.deepEqual(after.channels.filter(value => value.platform === 'kick').map(value => value.name), ['novo']);
  assert.equal(after.kickSync.observedAt, NOW);
  assert.equal(after.kickSync.sourceTabId, 91);
  assert.equal(after.kickSync.connected, true);
  assert.equal(b.data.channels.find(value => value.id === 'kick:novo').kickMode, 'live');
  assert.equal(b.opened.length, 0);
});

test('snapshot global sem Kick não apaga nem renova a última lista Kick', async t => {
  const previous = source(undefined, { kickStatuses: { 'kick:yetz': { live: false, checkedAt: NOW - 3000 } } });
  const b = fixture(t, { automationPaused: true, pokeidle: previous });
  await b.run({ type: 'status' });
  const before = structuredClone(b.data.pokeidle);
  await b.run(snapshot([entry('twitch', 'outro')]), sender(91));
  assert.deepEqual(b.data.pokeidle.channels.filter(value => value.platform === 'kick'), before.channels.filter(value => value.platform === 'kick'));
  assert.deepEqual(b.data.pokeidle.kickSync, before.kickSync);
  assert.deepEqual(b.data.pokeidle.kickStatuses, before.kickStatuses);
  assert.equal(b.data.pokeidle.observedAt, NOW);
  assert.equal(b.data.pokeidle.sourceTabId, 91);
});

test('snapshot global com Kick válido atualiza também a origem Kick', async t => {
  const b = fixture(t, { automationPaused: true, pokeidle: source() });
  await b.run(snapshot([entry('twitch', 'outro'), entry('kick', 'novo')]), sender(91));
  assert.equal(b.data.pokeidle.observedAt, NOW);
  assert.equal(b.data.pokeidle.kickSync.observedAt, NOW);
  assert.equal(b.data.pokeidle.kickSync.sourceTabId, 91);
  assert.deepEqual(b.data.pokeidle.channels.map(value => `${value.platform}:${value.name}`), ['twitch:outro', 'kick:novo']);
});

test('leitura Kick rejeita escopo misturado, vazio, inválido e remetente incorreto sem alterar dados', async t => {
  const b = fixture(t, { automationPaused: true, pokeidle: source() });
  await b.run({ type: 'status' });
  const before = structuredClone(b.data);
  const invalid = [
    snapshot([entry('kick', 'yetz'), entry('twitch', 'tftoddy')], 'kick'),
    snapshot([], 'kick'),
    snapshot([entry('kick', '../bad')], 'kick'),
    snapshot([entry('kick', 'yetz', { bonus: 'yes' })], 'kick'),
    snapshot([entry('kick', 'yetz'), entry('kick', 'outro', { live: 'yes' })], 'kick'),
    snapshot([entry('kick', 'yetz')], 'twitch')
  ];
  for (const message of invalid) {
    assert.deepEqual(await b.run(message, sender(91)), { accepted: false });
    assert.deepEqual(b.data, before);
  }
  for (const wrong of [{ ...sender(91), frameId: 1 }, { ...sender(91), url: 'https://pokeidle.io/application' }, { ...sender(99) }]) {
    assert.deepEqual(await b.run(snapshot([entry('kick', 'yetz')], 'kick'), wrong), { accepted: false });
    assert.deepEqual(b.data, before);
  }
});

test('desligar Kick retira apenas sua participação PokeIdle e preserva Twitch, manual, pausa e aba pessoal', async t => {
  const channels = [item('twitch', 'tftoddy'), item('kick', 'yetz'), item('kick', 'compartilhado'), item('kick', 'fila')];
  const sessions = Object.fromEntries(channels.slice(0, 3).map((value, index) => [value.id, { tabId: index + 10, openedAt: NOW - 1000, media: value.platform === 'kick' ? 'live' : 'chat', ownerIds: index === 2 ? [POKEIDLE_OWNER, 'manual'] : [POKEIDLE_OWNER] }]));
  const b = fixture(t, { channels, sessions, automationPaused: true, pausedChannels: ['kick:fila'],
    queue: ['kick:fila'], queueSources: { 'kick:fila': [POKEIDLE_OWNER] },
    pokeidle: source(channels.map(value => entry(value.platform, value.name))) });
  for (const value of channels.slice(0, 3)) b.tabs.set(sessions[value.id].tabId, { id: sessions[value.id].tabId, url: value.platform === 'kick' ? `https://kick.com/${value.name}` : `https://www.twitch.tv/popout/${value.name}/chat?popout=` });
  b.tabs.set(80, { id: 80, url: 'https://kick.com/pessoal' });
  const state = await b.run({ type: 'setPokeIdleKick', enabled: false });
  assert.equal(state.pokeidle.kickSync.enabled, false);
  assert.equal(state.pokeidle.enabled, true);
  assert.deepEqual(state.sessions['twitch:tftoddy'], sessions['twitch:tftoddy']);
  assert.equal(state.sessions['kick:yetz'], undefined);
  assert.deepEqual(state.sessions['kick:compartilhado'].ownerIds, ['manual']);
  assert.deepEqual(state.queue, []);
  assert.equal(state.automationPaused, true);
  assert.deepEqual(state.pausedChannels, ['kick:fila']);
  assert.deepEqual(b.removed, [11]);
  assert.ok(b.tabs.has(80));
  assert.equal(b.opened.length, 0);
});

test('desligar Kick do PokeIdle preserva a automação manual de lives do mesmo canal', async t => {
  const value = item('kick', 'yetz');
  const b = fixture(t, { channels: [value], automationPaused: true,
    sessions: { [value.id]: { tabId: 10, openedAt: NOW, media: 'live', ownerIds: [POKEIDLE_OWNER, 'live-watch'] } },
    liveWatch: { enabled: true, channelIds: [value.id], statuses: { [value.id]: { live: true, checkedAt: NOW } } },
    pokeidle: source([entry('kick', 'yetz')]) });
  b.tabs.set(10, { id: 10, url: 'https://kick.com/yetz' });
  const state = await b.run({ type: 'setPokeIdleKick', enabled: false });
  assert.deepEqual(state.sessions[value.id].ownerIds, ['live-watch']);
  assert.equal(state.liveWatch.enabled, true);
  assert.deepEqual(b.removed, []);
});

test('leitura manual de Kick não reativa fonte desativada nem desfaz Fechar todos', async t => {
  for (const flags of [{ enabled: false }, { kickSync: { enabled: false, connected: true, observedAt: NOW, sourceTabId: 90 } }, { automationPaused: true }]) {
    const initial = { pokeidle: source(undefined, flags), automationPaused: flags.automationPaused === true, pausedChannels: ['kick:pausado'], channels: [item('kick', 'yetz'), item('kick', 'pausado')] };
    const b = fixture(t, initial);
    await b.run(snapshot([entry('kick', 'yetz')], 'kick'), sender(91));
    await b.run({ type: 'pokeidleKickSnapshot', samples: { 'kick:yetz': { live: true, checkedAt: NOW } } });
    assert.equal(b.data.pokeidle.enabled, initial.pokeidle.enabled);
    assert.equal(b.data.pokeidle.kickSync.enabled, flags.kickSync?.enabled ?? true);
    assert.equal(b.data.automationPaused, initial.automationPaused);
    assert.deepEqual(b.data.pausedChannels, ['kick:pausado']);
    assert.equal(b.opened.length, 0);
  }
});

test('fontes Twitch e Kick usam relógios de leitura independentes', () => {
  const value = normalizePokeIdle(source(undefined, { observedAt: NOW - POKEIDLE_FRESH_MS - 1,
    kickSync: { enabled: true, observedAt: NOW, sourceTabId: 91, connected: true } }));
  const state = { pokeidle: value, liveWatch: { enabled: false } };
  assert.equal(pokeIdleEligible(state, 'twitch:tftoddy', NOW), false);
  assert.equal(pokeIdleEligible(state, 'kick:yetz', NOW), true);
  state.pokeidle.observedAt = NOW;
  state.pokeidle.kickSync.observedAt = NOW - POKEIDLE_FRESH_MS - 1;
  assert.equal(pokeIdleEligible(state, 'twitch:tftoddy', NOW), true);
  assert.equal(pokeIdleEligible(state, 'kick:yetz', NOW), false);
});

test('migração Kick herda leitura antiga uma vez; sidecar existente não herda relógio Twitch', () => {
  const legacy = source(); delete legacy.kickSync;
  assert.equal(normalizePokeIdle(legacy).kickSync.observedAt, legacy.observedAt);
  const noKick = { ...legacy, channels: [entry('twitch', 'tftoddy')] };
  assert.equal(normalizePokeIdle(noKick).kickSync.observedAt, null);
  assert.equal(normalizePokeIdle({ ...legacy, kickSync: { enabled: true, observedAt: null, sourceTabId: null, connected: false } }).kickSync.observedAt, null);
});

test('API offline seguida de desconhecido não reabre live com marcador DOM antigo', async t => {
  const b = fixture(t, { channels: [item('kick', 'yetz')], pokeidle: source([entry('kick', 'yetz')]) });
  await b.run({ type: 'status' });
  assert.equal(b.opened.length, 1);
  await b.run({ type: 'pokeidleKickSnapshot', samples: { 'kick:yetz': { live: false, checkedAt: NOW } } });
  assert.equal(b.data.sessions['kick:yetz'], undefined);
  await b.run({ type: 'pokeidleKickSnapshot', samples: { 'kick:yetz': { live: null, checkedAt: NOW, errorCode: 'unavailable', nextRetryAt: NOW + 60000 } } });
  assert.equal(b.data.sessions['kick:yetz'], undefined);
  assert.equal(b.opened.length, 1);
  assert.equal(pokeIdleKickLive(normalizePokeIdle(b.data.pokeidle), 'kick:yetz', NOW), null);
  b.advance(POKEIDLE_FRESH_MS + 1);
  await b.run(snapshot([entry('kick', 'yetz')], 'kick'), sender(91));
  assert.equal(b.opened.length, 1, 'Amostra API expirada também não volta ao marcador DOM');
});

test('amostra desconhecida preserva sessão existente; metadados do cache mantêm a hora real', async t => {
  const b = fixture(t, { channels: [item('kick', 'yetz')], pokeidle: source([entry('kick', 'yetz')]) });
  await b.run({ type: 'status' });
  const original = structuredClone(b.data.sessions['kick:yetz']);
  const sample = { live: null, checkedAt: NOW - 1000, errorCode: 'rate-limited', nextRetryAt: NOW + 300000, attempts: 2 };
  await b.run({ type: 'pokeidleKickSnapshot', samples: { 'kick:yetz': sample } });
  assert.deepEqual(b.data.sessions['kick:yetz'], original);
  assert.deepEqual(b.data.pokeidle.kickStatuses['kick:yetz'], sample);
  b.advance(10000);
  await b.run({ type: 'pokeidleKickSnapshot', samples: { 'kick:yetz': sample } });
  assert.equal(b.data.pokeidle.kickStatuses['kick:yetz'].checkedAt, NOW - 1000);
  assert.equal(b.data.pokeidle.kickSync.status, 'rate-limited');
  assert.equal(b.data.pokeidle.kickSync.nextRetryAt, NOW + 300000);
  assert.deepEqual(b.removed, []);
});

test('normalização de status Kick publica apenas metadados conhecidos', () => {
  const value = normalizePokeIdle(source(undefined, { kickStatuses: { 'kick:yetz': { live: true, checkedAt: NOW, errorCode: 'raw secret body', responseBody: 'secret', nextRetryAt: NOW + 60000 } } }));
  assert.deepEqual(value.kickStatuses['kick:yetz'], { live: true, checkedAt: NOW, nextRetryAt: NOW + 60000 });
});

test('consulta isolada Kick atualiza o monitor sem renovar status e relógio Twitch', async t => {
  const channels = [item('twitch', 'tftoddy'), item('kick', 'yetz'), item('kick', 'naoselecionado')];
  const twitchSample = { live: false, checkedAt: NOW - 120000 };
  const lastCheckedAt = NOW - 100000;
  const b = fixture(t, { channels, automationPaused: true, pokeidle: source(),
    liveWatch: { enabled: true, channelIds: ['twitch:tftoddy', 'kick:yetz'],
      statuses: { 'twitch:tftoddy': twitchSample, 'kick:yetz': { live: false, checkedAt: NOW - 10000 } }, lastCheckedAt } });
  await b.run({ type: 'status' });
  const previousSource = structuredClone(b.data.pokeidle);
  const sample = { live: true, checkedAt: NOW - 1000 };
  const state = await b.run({ type: 'liveWatchSnapshot', platform: 'kick', samples: {
    'kick:yetz': sample, 'kick:naoselecionado': sample, 'twitch:tftoddy': { live: true, checkedAt: NOW }
  } });
  assert.deepEqual(state.liveWatch.statuses['kick:yetz'], sample);
  assert.deepEqual(state.liveWatch.statuses['twitch:tftoddy'], twitchSample);
  assert.equal(state.liveWatch.statuses['kick:naoselecionado'], undefined);
  assert.equal(state.liveWatch.lastCheckedAt, lastCheckedAt);
  for (const key of ['observedAt', 'sourceTabId', 'connected', 'ruleText']) assert.deepEqual(state.pokeidle[key], previousSource[key], key);
  assert.equal(b.opened.length, 0);
});
