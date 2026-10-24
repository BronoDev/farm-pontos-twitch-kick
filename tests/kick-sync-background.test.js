import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { expectedFiles } from '../scripts/build.mjs';

const NOW = 1_800_000_000_000;
function event() { const callbacks = []; return { addListener: callback => callbacks.push(callback), emit: (...args) => callbacks.map(callback => callback(...args)) }; }
const entry = (platform, name, extra = {}) => ({ platform, name, live: platform === 'kick' ? null : true, bonus: platform !== 'kick', missing: platform !== 'kick', ...(platform === 'kick' ? { source: 'link' } : {}), ...extra });
const kick = name => ({ id: `kick:${name}`, platform: 'kick', name, kickMode: 'live', pokeidleAutoAdded: true });
const tw = { id: 'twitch:original', platform: 'twitch', name: 'original', pokeidleAutoAdded: true };
function source(channels = [entry('twitch', 'original'), entry('kick', 'yetz')], extra = {}) {
  return { enabled: true, observedAt: NOW - 5000, sourceTabId: 90, connected: true, channels, ruleText: '+15%',
    kickSync: { enabled: true, observedAt: NOW - 4000, sourceTabId: 90, connected: true, status: 'idle' }, ...extra };
}
async function background(initial = {}, fetcher = async () => ({ ok: true, json: async () => ({ livestream: { id: 123 } }) })) {
  const files = await expectedFiles('firefox');
  const manifest = JSON.parse(files.get('manifest.json'));
  const data = structuredClone(initial);
  const tabs = new Map([[90, { id: 90, url: 'https://pokeidle.io/app', active: true }]]);
  const opened = [], probes = [], requests = [];
  const clock = { now: NOW };
  let next = 1;
  class ClockDate extends Date { static now() { return clock.now; } }
  const api = {
    runtime: { id: 'test', getURL: file => `moz-extension://test/${file}`, onMessage: event(), onInstalled: event(), onStartup: event() },
    storage: { local: { get: async () => structuredClone(data), set: async value => Object.assign(data, structuredClone(value)) } },
    tabs: { onRemoved: event(), query: async () => [...tabs.values()].filter(tab => tab.url?.startsWith('https://pokeidle.io/')),
      get: async id => { if (!tabs.has(id)) throw Error('closed'); return tabs.get(id); },
      create: async options => { const tab = { id: next++, ...options }; tabs.set(tab.id, tab); opened.push(tab); return tab; },
      update: async (id, values) => Object.assign(tabs.get(id), values), remove: async id => { tabs.delete(id); },
      sendMessage: async (id, message) => { probes.push({ id, message }); return { accepted: false, reason: 'no-channels' }; } }
  };
  const context = vm.createContext({ browser: api, URL, Date: ClockDate, setTimeout, clearTimeout, AbortController,
    fetch: async (...args) => { requests.push(args); return fetcher(...args); } });
  for (const name of manifest.background.scripts) vm.runInContext(files.get(name), context, { filename: name });
  const panel = { id: 'test', url: api.runtime.getURL('popup.html'), tab: { id: 999 } };
  const send = (message, sender = panel) => new Promise(resolve => {
    assert.ok(api.runtime.onMessage.emit(message, sender, resolve).some(result => result === true));
  });
  const read = channels => {
    api.tabs.sendMessage = async (id, message) => {
      probes.push({ id, message });
      if (id !== 90 || message.type !== 'requestPokeIdleSnapshot') return {};
      assert.equal(message.platform, 'kick');
      const reply = await send({ type: 'pokeidleSnapshot', platform: 'kick', snapshot: { ready: true, channels, ruleText: '' } }, { id: 'test', url: 'https://pokeidle.io/app', tab: { id: 90 }, frameId: 0 });
      return { accepted: reply.state.accepted };
    };
  };
  const settle = async () => { await new Promise(resolve => setImmediate(resolve)); return send({ type: 'status' }); };
  return { api, data, tabs, opened, probes, requests, clock, send, read, settle };
}

function response(live) { return { ok: true, json: async () => ({ livestream: live ? { id: 1 } : null }) }; }

test('sincronizar Kick aguarda ACK e API e devolve o status final sem renovar origem Twitch', async () => {
  let finish;
  const b = await background({ channels: [tw, kick('yetz')], pokeidle: source(), automationPaused: true }, () => new Promise(resolve => { finish = resolve; }));
  b.read([entry('kick', 'yetz')]);
  let returned = false;
  const operation = b.send({ type: 'syncPokeIdleKick' }).then(result => { returned = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(returned, false);
  assert.equal(b.requests.length, 1);
  assert.equal(b.data.pokeidle.observedAt, NOW - 5000);
  finish(response(true));
  const result = await operation;
  assert.equal(result.ok, true);
  assert.equal(result.state.pokeidle.kickStatuses['kick:yetz'].live, true);
  assert.equal(result.state.pokeidle.kickSync.status, 'ok');
  assert.equal(result.state.pokeidle.kickSync.lastSuccessAt, NOW);
  assert.equal(result.state.pokeidle.kickSync.lastAttemptAt, NOW);
  assert.equal(result.state.pokeidle.observedAt, NOW - 5000);
  assert.equal(result.state.pokeidle.ruleText, '+15%');
  assert.equal(result.state.automationPaused, true);
  assert.equal(b.opened.length, 0);
});

test('sincronização manual consulta Kick com master ou opção Kick desligados sem reativá-los', async () => {
  for (const disabled of ['master', 'kick']) {
    const pokeidle = source();
    if (disabled === 'master') pokeidle.enabled = false;
    else pokeidle.kickSync.enabled = false;
    const b = await background({ channels: [kick('yetz')], pokeidle, platformRoutingMigrated: true });
    b.read([entry('kick', 'yetz')]);
    const result = await b.send({ type: 'syncPokeIdleKick' });
    assert.equal(result.ok, true);
    assert.equal(b.requests.length, 1);
    assert.equal(b.opened.length, 0);
    assert.equal(result.state.pokeidle.enabled, disabled !== 'master');
    assert.equal(result.state.pokeidle.kickSync.enabled, disabled !== 'kick');
    assert.equal(result.state.pokeidle.kickStatuses['kick:yetz'].live, true);
  }
});

test('leitura vazia ou página ausente conserva canais e timestamp Kick com erro específico', async () => {
  for (const absent of [false, true]) {
    const b = await background({ channels: [kick('yetz')], pokeidle: source(), automationPaused: true });
    if (absent) b.tabs.delete(90);
    const result = await b.send({ type: 'syncPokeIdleKick' });
    assert.equal(result.state.pokeidle.kickSync.status, absent ? 'source-unavailable' : 'no-channels');
    assert.equal(result.state.pokeidle.kickSync.observedAt, NOW - 4000);
    assert.equal(result.state.pokeidle.channels.filter(item => item.platform === 'kick').length, 1);
    assert.equal(result.state.automationPaused, true);
    assert.equal(b.opened.length, 0);
  }
});

test('consultas manuais simultâneas são agrupadas e rate limit mantém hora e espera originais', async () => {
  const b = await background({ channels: [kick('yetz')], pokeidle: source(), automationPaused: true }, async () => ({ ok: false, status: 429, headers: { get: () => '300' } }));
  b.read([entry('kick', 'yetz')]);
  const [first, same] = await Promise.all([b.send({ type: 'syncPokeIdleKick' }), b.send({ type: 'syncPokeIdleKick' })]);
  assert.equal(b.requests.length, 1);
  assert.equal(b.probes.filter(probe => probe.message.type === 'requestPokeIdleSnapshot').length, 1);
  assert.equal(first.state.pokeidle.kickSync.status, 'rate-limited');
  assert.equal(same.state.pokeidle.kickSync.nextRetryAt, NOW + 300000);
  b.clock.now += 60000;
  const cached = await b.send({ type: 'syncPokeIdleKick' });
  assert.equal(b.requests.length, 1);
  assert.equal(cached.state.pokeidle.kickStatuses['kick:yetz'].checkedAt, NOW);
  assert.equal(cached.state.pokeidle.kickSync.nextRetryAt, NOW + 300000);
  b.clock.now += 300000;
  await b.send({ type: 'syncPokeIdleKick' });
  assert.equal(b.requests.length, 2);
});

test('poll periódico ignora Kick desligada e mantém monitor manual independente', async () => {
  for (const watch of [false, true]) {
    const pokeidle = source(); pokeidle.kickSync.enabled = false;
    const b = await background({ channels: [kick('yetz')], pokeidle, liveWatch: { enabled: watch, channelIds: ['kick:yetz'] } });
    b.api.runtime.onStartup.emit();
    await b.settle(); await b.settle();
    assert.equal(b.requests.length, watch ? 1 : 0);
    assert.equal(b.data.pokeidle.kickSync.enabled, false);
    assert.equal(b.opened.length, watch ? 1 : 0);
  }
});

test('sincronizar apenas Kick não consulta Helix nem altera amostras Twitch do monitor', async () => {
  const prior = { live: false, checkedAt: NOW - 30000 };
  const b = await background({ channels: [tw, kick('yetz')], pokeidle: source(), automationPaused: true,
    liveWatch: { enabled: true, twitchMode: 'irc', channelIds: [tw.id, 'kick:yetz'], statuses: { [tw.id]: prior }, lastCheckedAt: NOW - 30000 } });
  b.read([entry('kick', 'yetz')]);
  const result = await b.send({ type: 'syncPokeIdleKick' });
  assert.equal(b.requests.length, 1);
  assert.match(b.requests[0][0], /^https:\/\/kick\.com\//);
  assert.deepEqual(JSON.parse(JSON.stringify(result.state.liveWatch.statuses[tw.id])), prior);
  assert.equal(result.state.liveWatch.lastCheckedAt, NOW - 30000);
});

test('Kick offline seguida de erro não reaproveita marcador DOM online antigo', async () => {
  let calls = 0;
  const b = await background({ channels: [kick('yetz')], pokeidle: source([entry('kick', 'yetz', { source: 'widget', live: true })]) }, async () => ++calls === 1 ? response(false) : { ok: false, status: 503 });
  b.read([entry('kick', 'yetz', { source: 'widget', live: true })]);
  await b.send({ type: 'syncPokeIdleKick' });
  assert.equal(b.data.sessions['kick:yetz'], undefined);
  const initiallyOpened = b.opened.length;
  b.clock.now += 1000;
  const result = await b.send({ type: 'syncPokeIdleKick' });
  assert.equal(result.state.pokeidle.kickStatuses['kick:yetz'].live, null);
  assert.equal(result.state.sessions['kick:yetz'], undefined);
  assert.equal(b.opened.length, initiallyOpened);
});

test('sincronização Kick aguarda consulta anterior e inclui canais novos sem bloquear Fechar todos', async () => {
  let finishOld;
  const b = await background({ channels: [kick('first')], pokeidle: source([entry('kick', 'first')]) }, async url => {
    if (url.endsWith('/first') && !finishOld) return new Promise(resolve => { finishOld = resolve; });
    return response(true);
  });
  b.api.runtime.onStartup.emit();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.requests.length, 1);
  b.read([entry('kick', 'first'), entry('kick', 'new')]);
  let completed = false;
  const syncing = b.send({ type: 'syncPokeIdleKick' }).then(value => { completed = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false);
  const paused = await b.send({ type: 'stopAll' });
  assert.equal(paused.state.automationPaused, true, 'Fechar todos não aguarda a rede da Kick');
  finishOld(response(true));
  const result = await syncing;
  assert.equal(result.state.pokeidle.kickStatuses['kick:new'].live, true);
  assert.ok(b.requests.some(([url]) => url.endsWith('/new')));
  assert.equal(result.state.automationPaused, true);
  assert.equal(Object.keys(result.state.sessions).length, 0);
  assert.equal(b.opened.length, 0);
});

test('resposta offline atualiza monitor e PokeIdle juntos sem abrir uma aba intermediária', async () => {
  const positive = { live: true, checkedAt: NOW - 30000 };
  const b = await background({ channels: [kick('yetz')], pokeidle: source([entry('kick', 'yetz')], { kickStatuses: { 'kick:yetz': positive } }),
    liveWatch: { enabled: true, channelIds: ['kick:yetz'], statuses: { 'kick:yetz': positive } } }, async () => response(false));
  const result = await b.send({ type: 'watchNow' });
  assert.equal(result.state.liveWatch.statuses['kick:yetz'].live, false);
  assert.equal(result.state.pokeidle.kickStatuses['kick:yetz'].live, false);
  assert.equal(Object.keys(result.state.sessions).length, 0);
  assert.equal(b.opened.length, 0);
});
