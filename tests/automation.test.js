import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../src/core.js';

function browser() {
  const data = {};
  const tabs = new Map();
  const notifications = [];
  const reloads = [];
  let id = 0;
  const api = {
    runtime: { getURL: file => `chrome-extension://test/${file}` },
    storage: { local: {
      get: async () => structuredClone(data),
      set: async value => Object.assign(data, structuredClone(value))
    } },
    tabs: {
      create: async options => { const tab = { id: ++id, ...options }; tabs.set(tab.id, tab); return tab; },
      get: async key => { if (!tabs.has(key)) throw Error('Fechada'); return tabs.get(key); },
      update: async (key, values) => Object.assign(tabs.get(key), values),
      remove: async key => { tabs.delete(key); },
      reload: async key => { reloads.push(key); }
    },
    notifications: { create: async (...args) => { notifications.push(args); } }
  };
  return { api, data, tabs, notifications, reloads, run: createController(api) };
}
async function add(b, name, platform = 'kick') { await b.run({ type: 'add', platform, input: name }); }

test('fila respeita limites, não bloqueia Twitch atrás de Kick e avança ao fechar', async () => {
  const b = browser();
  await add(b, 'primeiro'); await add(b, 'segundo'); await add(b, 'terceiro', 'twitch');
  await b.run({ type: 'setSettings', settings: { maxConcurrent: 2, maxKickLives: 1 } });
  const started = await b.run({ type: 'startAll' });
  assert.deepEqual(Object.keys(started.sessions), ['kick:primeiro', 'twitch:terceiro']);
  assert.deepEqual(started.queue, ['kick:segundo']);
  const next = await b.run({ type: 'stop', id: 'kick:primeiro' });
  assert.ok(next.sessions['kick:segundo']);
  assert.ok(!next.sessions['kick:primeiro']);
  assert.deepEqual(next.queue, []);
});

test('prioridades são respeitadas e reduzir limite devolve excedentes à fila', async () => {
  const b = browser();
  await add(b, 'baixo'); await add(b, 'alto');
  await b.run({ type: 'setPriority', id: 'kick:alto', priority: 2 });
  await b.run({ type: 'startAll' });
  const state = await b.run({ type: 'setSettings', settings: { maxConcurrent: 1 } });
  assert.deepEqual(Object.keys(state.sessions), ['kick:alto']);
  assert.deepEqual(state.queue, ['kick:baixo']);
  assert.equal(b.tabs.size, 1);
});

test('agenda inicia e encerra sessões próprias e preserva sessão manual', async t => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const b = browser();
  await add(b, 'manual'); await add(b, 'agenda');
  await b.run({ type: 'start', id: 'kick:manual' });
  await b.run({ type: 'addSchedule', schedule: { channelIds: ['kick:agenda', 'kick:manual'], startsAt: now + 60_000, endsAt: now + 180_000 } });
  assert.equal(b.tabs.size, 1);
  now += 60_000;
  let state = await b.run({ type: 'tick' });
  assert.equal(b.tabs.size, 2);
  assert.ok(state.schedules[0].startedAt);
  now += 120_000;
  state = await b.run({ type: 'tick' });
  assert.deepEqual(Object.keys(state.sessions), ['kick:manual']);
  assert.ok(state.schedules[0].endedAt);
});

test('fechar todos pausa automação; iniciar individual não reabre outras agendas', async t => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const b = browser();
  await add(b, 'um'); await add(b, 'dois');
  await b.run({ type: 'addSchedule', schedule: { channelIds: ['kick:um', 'kick:dois'], startsAt: now + 60_000, endsAt: now + 600_000 } });
  await b.run({ type: 'stopAll' });
  now += 120_000;
  assert.equal(Object.keys((await b.run({ type: 'tick' })).sessions).length, 0);
  await b.run({ type: 'start', id: 'kick:um' });
  const stillPaused = await b.run({ type: 'tick' });
  assert.equal(stillPaused.automationPaused, true);
  assert.deepEqual(Object.keys(stillPaused.sessions), ['kick:um']);
  const resumed = await b.run({ type: 'resumeAutomation' });
  assert.ok(resumed.sessions['kick:dois']);
});

test('desativar e reativar agenda durante sua janela volta a iniciá-la', async t => {
  const now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const b = browser(); await add(b, 'yetz');
  const created = await b.run({ type: 'addSchedule', schedule: { channelIds: ['kick:yetz'], startsAt: now, endsAt: now + 600_000 } });
  const id = created.schedules[0].id;
  assert.equal(b.tabs.size, 1);
  await b.run({ type: 'toggleSchedule', id, enabled: false });
  assert.equal(b.tabs.size, 0);
  await b.run({ type: 'toggleSchedule', id, enabled: true });
  assert.equal(b.tabs.size, 1);
});

test('fechamento manual é preservado contra a agenda e permite avançar a fila', async t => {
  const now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const b = browser(); await add(b, 'um'); await add(b, 'dois');
  await b.run({ type: 'setSettings', settings: { maxConcurrent: 1 } });
  const state = await b.run({ type: 'startAll' });
  const tabId = state.sessions['kick:um'].tabId;
  b.tabs.delete(tabId);
  const next = await b.run({ type: 'tabRemoved', tabId });
  assert.ok(next.pausedChannels.includes('kick:um'));
  assert.ok(next.sessions['kick:dois']);
  await b.run({ type: 'addSchedule', schedule: { channelIds: ['kick:um'], startsAt: now, endsAt: now + 60_000 } });
  assert.ok(!(await b.run({ type: 'tick' })).sessions['kick:um']);
});

test('limite de duração encerra sessão e inicia o próximo canal da fila', async t => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const b = browser(); await add(b, 'um'); await add(b, 'dois');
  await b.run({ type: 'setSettings', settings: { maxConcurrent: 1, sessionMinutes: 1 } });
  await b.run({ type: 'startAll' });
  now += 60_000;
  const state = await b.run({ type: 'tick' });
  assert.ok(!state.sessions['kick:um']);
  assert.ok(state.sessions['kick:dois']);
  assert.equal(state.sessionHistory[0].reason, 'duration-limit');
});

test('avisos deduplicam a falha ativa mas notificam uma nova ocorrência após recuperação', async t => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const b = browser(); await add(b, 'yetz');
  const state = await b.run({ type: 'startAll' });
  const sender = { tab: { id: state.sessions['kick:yetz'].tabId }, url: 'https://kick.com/yetz' };
  await b.run({ type: 'sessionHealth', sample: { login: 'signed-out' } }, sender);
  const first = await b.run({ type: 'status' });
  assert.equal(b.notifications.length, 1);
  await b.run({ type: 'dismissAlert', id: first.alerts[0].id });
  await b.run({ type: 'tick' });
  assert.equal(b.notifications.length, 1);
  await b.run({ type: 'sessionHealth', sample: { login: 'signed-in' } }, sender);
  await b.run({ type: 'tick' });
  now += 60_000;
  await b.run({ type: 'sessionHealth', sample: { login: 'signed-out' } }, sender);
  await b.run({ type: 'tick' });
  assert.equal(b.notifications.length, 2);
});

test('reconexão é opt-in, limitada e não confunde vídeo pausado com erro', async t => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const b = browser(); await add(b, 'yetz');
  await b.run({ type: 'startAll' });
  const sender = { tab: { id: 1 }, url: 'https://kick.com/yetz' };
  await b.run({ type: 'kickTelemetry', sample: { playing: false, error: true } }, sender);
  await b.run({ type: 'tick' }); assert.equal(b.reloads.length, 0);
  await b.run({ type: 'setSettings', settings: { autoReconnect: true } });
  for (let i = 0; i < 5; i++) { await b.run({ type: 'tick' }); now += 600_000; }
  assert.equal(b.reloads.length, 3);
  await b.run({ type: 'kickTelemetry', sample: { playing: true } }, sender);
  await b.run({ type: 'kickTelemetry', sample: { playing: false } }, sender);
  await b.run({ type: 'tick' }); assert.equal(b.reloads.length, 3);
});

test('resgate assistido abre página sem conceder XP nem marcar bônus como resgatado', async () => {
  const b = browser(); await add(b, 'yetz');
  const state = await b.run({ type: 'addBonus', bonus: { channelId: 'kick:yetz', title: 'Bônus', sourceUrl: 'https://pokeidle.io/app' } });
  const id = state.bonuses[0].id;
  const opened = await b.run({ type: 'openRedemption', id });
  assert.equal(opened.bonuses[0].completed, false);
  assert.equal(opened.measurements.length, 0);
  assert.equal(Object.keys(opened.sessions).length, 0);
  assert.equal([...b.tabs.values()][0].url, 'https://pokeidle.io/app');
});

test('horários sobrepostos compartilham uma sessão até o último fim', async t => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const b = browser(); await add(b, 'yetz');
  await b.run({ type: 'addSchedule', schedule: { channelIds: ['kick:yetz'], startsAt: now, endsAt: now + 120_000 } });
  const firstTab = [...b.tabs.keys()][0];
  await b.run({ type: 'addSchedule', schedule: { channelIds: ['kick:yetz'], startsAt: now + 60_000, endsAt: now + 180_000 } });
  now += 60_000; await b.run({ type: 'tick' });
  now += 60_000; await b.run({ type: 'tick' });
  assert.deepEqual([...b.tabs.keys()], [firstTab]);
  now += 60_000; await b.run({ type: 'tick' });
  assert.equal(b.tabs.size, 0);
});

test('fim do cooldown avisa sem afirmar bônus disponível ou reutilizar saldo antigo', async t => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const b = browser(); await add(b, 'yetz');
  const created = await b.run({ type: 'addBonus', bonus: { channelId: 'kick:yetz', title: 'Troca por XP', pointCost: 100, cooldownMinutes: 1, verified: true, requirementsMet: true } });
  await b.run({ type: 'claimBonus', id: created.bonuses[0].id });
  now += 60_000;
  const state = await b.run({ type: 'tick' });
  assert.equal(state.summary.bonusItems[0].status, 'pending');
  assert.ok(state.alerts.some(a => a.key.startsWith('bonus-cooldown-ended:')));
  const count = b.notifications.length;
  await b.run({ type: 'tick' });
  assert.equal(b.notifications.length, count);
});
