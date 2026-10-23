import test from 'node:test';
import assert from 'node:assert/strict';
import { channel, chatUrl, createController } from '../extension/core.js';

function browser() {
  const data = {};
  const tabs = new Map();
  const opened = [];
  const removed = [];
  let nextId = 1;
  const api = {
    storage: { local: {
      get: async () => structuredClone(data),
      set: async value => Object.assign(data, structuredClone(value))
    } },
    tabs: {
      get: async id => { if (!tabs.has(id)) throw new Error('Aba fechada'); return tabs.get(id); },
      remove: async id => { removed.push(id); tabs.delete(id); }
    },
    windows: { create: async options => {
      opened.push(options);
      const id = nextId++;
      tabs.set(id, { id, url: options.url });
      return { tabs: [{ id }] };
    } }
  };
  return { api, tabs, opened, removed, run: createController(api) };
}

test('normaliza canais e links sem aceitar domínios parecidos, credenciais ou caminhos extras', () => {
  assert.deepEqual(channel('kick', 'https://kick.com/Yetz'), { id: 'kick:yetz', platform: 'kick', name: 'yetz' });
  assert.equal(channel('twitch', ' @Yetz ').name, 'yetz');
  for (const input of ['https://kick.com.evil.test/yetz', 'https://user:pass@kick.com/yetz', 'https://kick.com/yetz/chat', '<script>', 'https://twitch.tv/yetz']) {
    assert.throws(() => channel('kick', input));
  }
  assert.throws(() => channel('other', 'yetz'));
});

test('gera URLs de chat, sem URL do player', () => {
  assert.equal(chatUrl(channel('kick', 'yetz')), 'https://kick.com/popout/yetz/chat');
  assert.equal(chatUrl(channel('twitch', 'yetz')), 'https://www.twitch.tv/popout/yetz/chat?popout=');
});

test('persiste canais sem duplicar e abre somente um pop-up por canal', async () => {
  const b = browser();
  await b.run({ type: 'add', platform: 'kick', input: 'Yetz' });
  const state = await b.run({ type: 'add', platform: 'kick', input: 'yetz' });
  assert.equal(state.channels.length, 1);
  await b.run({ type: 'start', id: 'kick:yetz' });
  const started = await b.run({ type: 'start', id: 'kick:yetz' });
  assert.equal(b.opened.length, 1);
  assert.equal(b.opened[0].type, 'popup');
  assert.equal(started.sessions['kick:yetz'].tabId, 1);
  assert.ok(started.sessions['kick:yetz'].openedAt);
  const restartedWorker = createController(b.api);
  await restartedWorker({ type: 'start', id: 'kick:yetz' });
  assert.equal(b.opened.length, 1);
});

test('fechar chat remove somente a aba registrada; preserva canal para reabrir', async () => {
  const b = browser();
  await b.run({ type: 'add', platform: 'kick', input: 'yetz' });
  await b.run({ type: 'start', id: 'kick:yetz' });
  const state = await b.run({ type: 'stop', id: 'kick:yetz' });
  assert.deepEqual(b.removed, [1]);
  assert.deepEqual(state.sessions, {});
  assert.equal(state.channels.length, 1);
});

test('não fecha uma aba reutilizada para outro site', async () => {
  const b = browser();
  await b.run({ type: 'add', platform: 'kick', input: 'yetz' });
  await b.run({ type: 'start', id: 'kick:yetz' });
  b.tabs.set(1, { url: 'https://example.com/' });
  const state = await b.run({ type: 'remove', id: 'kick:yetz' });
  assert.equal(state.channels.length, 0);
  assert.deepEqual(b.removed, []);
  assert.ok(b.tabs.has(1));
});

test('detecta fechamento manual e permite reabrir', async () => {
  const b = browser();
  await b.run({ type: 'add', platform: 'twitch', input: 'yetz' });
  await b.run({ type: 'start', id: 'twitch:yetz' });
  b.tabs.clear();
  assert.deepEqual((await b.run({ type: 'status' })).sessions, {});
  await b.run({ type: 'start', id: 'twitch:yetz' });
  assert.equal(b.opened.length, 2);
});

test('falha na abertura não inventa uma sessão e pode ser recuperada', async () => {
  const b = browser();
  await b.run({ type: 'add', platform: 'kick', input: 'yetz' });
  const create = b.api.windows.create;
  b.api.windows.create = async () => { throw new Error('Bloqueado'); };
  await assert.rejects(b.run({ type: 'start', id: 'kick:yetz' }), /Bloqueado/);
  assert.deepEqual((await b.run({ type: 'status' })).sessions, {});
  b.api.windows.create = create;
  assert.ok((await b.run({ type: 'start', id: 'kick:yetz' })).sessions['kick:yetz']);
});
