import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUiPreferences, uiPanelVisible } from '../src/ui-state.js';
import { createController } from '../src/core.js';

function browser() {
  const data = {};
  const tabs = new Map();
  const opened = [];
  const removed = [];
  let nextId = 1;
  const api = {
    runtime: { getURL: file => `chrome-extension://ui-test/${file}` },
    storage: { local: {
      get: async () => structuredClone(data),
      set: async value => Object.assign(data, structuredClone(value))
    } },
    tabs: {
      create: async options => {
        const tab = { id: nextId++, ...options };
        tabs.set(tab.id, tab); opened.push(tab);
        return tab;
      },
      get: async id => { if (!tabs.has(id)) throw Error('Aba fechada'); return tabs.get(id); },
      update: async (id, values) => Object.assign(tabs.get(id), values),
      remove: async id => { removed.push(id); tabs.delete(id); }
    }
  };
  return { api, data, tabs, opened, removed, run: createController(api) };
}

test('interface nova começa sem painéis extras e normaliza somente escolhas booleanas conhecidas', () => {
  for (const raw of [undefined, null, false, 'invalid', [], { panels: [] }, { panels: null }]) {
    assert.deepEqual(normalizeUiPreferences(raw), { panels: {} });
  }
  assert.deepEqual(normalizeUiPreferences({ panels: { bonuses: true, history: false, schedule: 'yes', unknown: true }, arbitrary: true }),
    { panels: { bonuses: true, history: false } });
  assert.equal(uiPanelVisible({}, 'bonuses'), false);
  assert.equal(uiPanelVisible({}, 'history'), false);
  assert.equal(uiPanelVisible({}, 'schedule'), false);
  assert.equal(uiPanelVisible({}, 'pokeidle'), false);
  assert.equal(uiPanelVisible({ bonuses: [{}] }, 'toString'), false);
});

test('PokeIdle aparece após leitura válida, sem exigir conexão atual, e respeita escolha explícita', () => {
  assert.deepEqual(normalizeUiPreferences({ panels: { pokeidle: true } }), { panels: { pokeidle: true } });
  for (const observedAt of [null, undefined, 0, -1, Infinity, NaN, '1800000000000']) {
    assert.equal(uiPanelVisible({ pokeidle: { observedAt, connected: true } }, 'pokeidle'), false);
  }
  assert.equal(uiPanelVisible({ pokeidle: { observedAt: 1800000000000, connected: false } }, 'pokeidle'), true);
  assert.equal(uiPanelVisible({ pokeidle: { observedAt: 1800000000000 }, uiPreferences: { panels: { pokeidle: false } } }, 'pokeidle'), false);
  assert.equal(uiPanelVisible({ uiPreferences: { panels: { pokeidle: true } } }, 'pokeidle'), true);
});

test('ocultar PokeIdle persiste sem desativar automação nem retirar canais ou sessões automáticas', async t => {
  t.mock.method(Date, 'now', () => 1800000000000);
  const b = browser();
  b.tabs.set(90, { id: 90, url: 'https://pokeidle.io/app' });
  await b.run({ type: 'pokeidleSnapshot', snapshot: { ready: true, channels: [
    { name: 'tftoddy', live: true, bonus: true, missing: true }
  ] } }, { tab: { id: 90 }, url: 'https://pokeidle.io/app', frameId: 0 });
  const before = await b.run({ type: 'status' });
  assert.equal(uiPanelVisible(before, 'pokeidle'), true);
  await b.run({ type: 'setUiPanel', panel: 'pokeidle', visible: false });
  const hidden = await createController(b.api)({ type: 'status' });
  assert.equal(uiPanelVisible(hidden, 'pokeidle'), false);
  assert.equal(hidden.pokeidle.enabled, true);
  for (const key of ['channels', 'sessions', 'queue', 'automationPaused', 'pokeidle']) assert.deepEqual(hidden[key], before[key]);
  assert.deepEqual(hidden.uiPreferences.panels, { pokeidle: false });
  assert.equal(b.opened.length, 1);
  assert.deepEqual(b.removed, []);
  const shown = await b.run({ type: 'setUiPanel', panel: 'pokeidle', visible: true });
  assert.equal(uiPanelVisible(shown, 'pokeidle'), true);
  assert.deepEqual(shown.sessions, before.sessions);
});

test('migração revela os painéis com dados existentes e preserva preferências explícitas', () => {
  const legacy = { bonuses: [{ id: 'b' }], measurements: [{ id: 'm' }], schedules: [{ id: 's' }] };
  for (const panel of ['bonuses', 'history', 'schedule']) assert.equal(uiPanelVisible(legacy, panel), true);
  const hidden = { ...legacy, uiPreferences: { panels: { bonuses: false, history: false, schedule: false } } };
  for (const panel of ['bonuses', 'history', 'schedule']) assert.equal(uiPanelVisible(hidden, panel), false);
  assert.equal(uiPanelVisible({ uiPreferences: { panels: { bonuses: true } } }, 'bonuses'), true);
  assert.equal(uiPanelVisible({ measurements: 'invalid' }, 'history'), false);
});

test('preferências de painéis são persistidas e retornam após recriar o controlador', async () => {
  const b = browser();
  const initial = await b.run({ type: 'status' });
  assert.deepEqual(initial.uiPreferences, { panels: {} });
  await b.run({ type: 'setUiPanel', panel: 'history', visible: true });
  await b.run({ type: 'setUiPanel', panel: 'bonuses', visible: false });
  const state = await createController(b.api)({ type: 'status' });
  assert.deepEqual(state.uiPreferences, { panels: { bonuses: false, history: true } });
  assert.equal(uiPanelVisible(state, 'history'), true);
  assert.equal(uiPanelVisible(state, 'bonuses'), false);
});

test('ocultar recursos preserva bônus, leituras, agenda, sessões e estado da automação', async t => {
  const now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const b = browser();
  await b.run({ type: 'add', platform: 'kick', input: 'yetz' });
  await b.run({ type: 'start', id: 'kick:yetz' });
  await b.run({ type: 'addBonus', bonus: { channelId: 'kick:yetz', title: 'Bônus guardado' } });
  await b.run({ type: 'addMeasurement', measurement: { channelId: 'kick:yetz', xp: 120, points: 30, at: now } });
  const before = await b.run({ type: 'addSchedule', schedule: {
    channelIds: ['kick:yetz'], startsAt: now + 60000, endsAt: now + 180000
  } });
  for (const panel of ['bonuses', 'history', 'schedule']) await b.run({ type: 'setUiPanel', panel, visible: false });
  const hidden = await b.run({ type: 'status' });
  for (const key of ['bonuses', 'measurements', 'schedules', 'sessions', 'automationPaused']) assert.deepEqual(hidden[key], before[key]);
  assert.equal(b.opened.length, 1);
  assert.deepEqual(b.removed, []);
  assert.equal(hidden.schedules[0].enabled, true, 'esconder o painel não cancela horários configurados');
  for (const panel of ['bonuses', 'history', 'schedule']) assert.equal(uiPanelVisible(hidden, panel), false);
  const restored = await b.run({ type: 'setUiPanel', panel: 'schedule', visible: true });
  assert.equal(uiPanelVisible(restored, 'schedule'), true);
  assert.deepEqual(restored.schedules, before.schedules);
});

test('comandos de preferência recusam painéis e valores inválidos sem gravar escolhas', async () => {
  const b = browser();
  await b.run({ type: 'status' });
  const before = structuredClone(b.data);
  for (const message of [
    { panel: 'unknown', visible: true }, { panel: '__proto__', visible: true },
    { panel: 'bonuses', visible: 'true' }, { panel: 'schedule', visible: null },
    { visible: true }, { panel: 'history' }
  ]) await assert.rejects(b.run({ type: 'setUiPanel', ...message }), /painel inválida/);
  assert.deepEqual(b.data, before);
});

test('abrir painel completo cria somente a página própria e não a registra como sessão', async () => {
  const b = browser();
  const state = await b.run({ type: 'openDashboard', url: 'https://example.com/' });
  assert.equal(b.opened.length, 1);
  assert.equal(b.opened[0].url, 'chrome-extension://ui-test/popup.html');
  assert.equal(b.opened[0].active, true);
  assert.deepEqual(state.sessions, {});
  await b.run({ type: 'stopAll' });
  assert.ok(b.tabs.has(b.opened[0].id), 'o painel é preservado ao fechar sessões');
});
