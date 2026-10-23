import test from 'node:test';
import assert from 'node:assert/strict';
import { channel, chatUrl, createController } from '../src/core.js';

function browser(kickLive = false) {
  const data = { kickLive };
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
      remove: async id => { removed.push(id); tabs.delete(id); },
      create: async options => {
        opened.push(options);
        const id = nextId++;
        const tab = { id, url: options.url, active: options.active };
        tabs.set(id, tab);
        return tab;
      },
      update: async (id, options) => { Object.assign(tabs.get(id), options); return tabs.get(id); }
    },
    windows: { create: async () => { throw new Error('Não deve abrir janelas'); } }

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

test('persiste canais sem duplicar e abre somente uma aba em segundo plano por canal', async () => {
  const b = browser();
  await b.run({ type: 'add', platform: 'kick', input: 'Yetz' });
  const state = await b.run({ type: 'add', platform: 'kick', input: 'yetz' });
  assert.equal(state.channels.length, 1);
  await b.run({ type: 'start', id: 'kick:yetz' });
  const started = await b.run({ type: 'start', id: 'kick:yetz' });
  assert.equal(b.opened.length, 1);
  assert.equal(b.opened[0].active, false);
  assert.equal(b.tabs.get(1).muted, true);
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
  const create = b.api.tabs.create;
  b.api.tabs.create = async () => { throw new Error('Bloqueado'); };
  await assert.rejects(b.run({ type: 'start', id: 'kick:yetz' }), /Bloqueado/);
  assert.deepEqual((await b.run({ type: 'status' })).sessions, {});
  b.api.tabs.create = create;
  assert.ok((await b.run({ type: 'start', id: 'kick:yetz' })).sessions['kick:yetz']);
});

test('inicia e fecha todos sem duplicar e preserva lista e abas pessoais', async () => {
  const b = browser();
  await b.run({ type: 'add', platform: 'kick', input: 'yetz' });
  await b.run({ type: 'add', platform: 'twitch', input: 'outro' });
  b.tabs.set(99, { id: 99, url: 'https://example.com' });
  await b.run({ type: 'startAll' });
  await b.run({ type: 'startAll' });
  assert.equal(b.opened.length, 2);
  assert.ok(b.opened.every(options => options.active === false));
  assert.ok([b.tabs.get(1), b.tabs.get(2)].every(tab => tab.muted));
  const stopped = await b.run({ type: 'stopAll' });
  assert.equal(stopped.channels.length, 2);
  assert.deepEqual(stopped.sessions, {});
  assert.ok(b.tabs.has(99));
  await b.run({ type: 'startAll' });
  assert.equal(b.opened.length, 4);
});

test('falha parcial ao iniciar todos não impede os demais nem perde sessões', async () => {
  const b = browser();
  for (const name of ['primeiro', 'falha', 'terceiro']) await b.run({ type: 'add', platform: 'kick', input: name });
  const create = b.api.tabs.create;
  b.api.tabs.create = async options => {
    if (options.url.includes('/falha/')) throw new Error('Não foi possível abrir');
    return create(options);
  };
  const result = await b.run({ type: 'startAll' });
  assert.deepEqual(Object.keys(result.sessions), ['kick:primeiro', 'kick:terceiro']);
  assert.equal(result.warnings.length, 1);
  const restarted = createController(b.api);
  assert.equal(Object.keys((await restarted({ type: 'status' })).sessions).length, 2);
  await restarted({ type: 'stopAll' });
  assert.equal(b.tabs.size, 0);
});

test('falha parcial ao fechar mantém a sessão para tentar de novo e continua as demais', async () => {
  const b = browser();
  for (const name of ['primeiro', 'segundo']) await b.run({ type: 'add', platform: 'kick', input: name });
  await b.run({ type: 'startAll' });
  const remove = b.api.tabs.remove;
  b.api.tabs.remove = async id => { if (id === 1) throw new Error('Falha ao fechar'); await remove(id); };
  const result = await b.run({ type: 'stopAll' });
  assert.deepEqual(Object.keys(result.sessions), ['kick:primeiro']);
  assert.equal(result.warnings.length, 1);
  b.api.tabs.remove = remove;
  assert.deepEqual((await b.run({ type: 'stopAll' })).sessions, {});
});

test('fechar todos preserva uma aba de chat que foi usada para outro site', async () => {
  const b = browser();
  await b.run({ type: 'add', platform: 'kick', input: 'yetz' });
  await b.run({ type: 'startAll' });
  b.tabs.set(1, { id: 1, url: 'https://example.com' });
  assert.deepEqual((await b.run({ type: 'stopAll' })).sessions, {});
  assert.ok(b.tabs.has(1));
  assert.deepEqual(b.removed, []);
});

test('falha ao silenciar mantém aba registrada para ser fechada e mostra aviso', async () => {
  const b = browser();
  await b.run({ type: 'add', platform: 'kick', input: 'yetz' });
  b.api.tabs.update = async () => { throw new Error('Falha de áudio'); };
  const state = await b.run({ type: 'start', id: 'kick:yetz' });
  assert.ok(state.sessions['kick:yetz']);
  assert.equal(state.warnings.length, 1);
  await b.run({ type: 'stopAll' });
  assert.equal(b.tabs.size, 0);
});

test('migra sessão antiga de pop-up para aba em segundo plano', async () => {
  const b = browser();
  await b.run({ type: 'add', platform: 'kick', input: 'yetz' });
  b.tabs.set(50, { id: 50, url: 'https://kick.com/popout/yetz/chat' });
  await b.api.storage.local.set({ sessions: { 'kick:yetz': { tabId: 50, openedAt: 1 } } });
  const result = await b.run({ type: 'startAll' });
  assert.deepEqual(b.removed, [50]);
  assert.equal(result.sessions['kick:yetz'].mode, 'background');
  assert.equal(b.opened[0].active, false);
});

test('Kick com vídeo abre canal completo e Twitch continua somente no chat', async () => {
  const b = browser(true);
  await b.run({ type: 'add', platform: 'kick', input: 'yetz' });
  await b.run({ type: 'add', platform: 'twitch', input: 'outro' });
  const state = await b.run({ type: 'startAll' });
  assert.equal(b.opened[0].url, 'https://kick.com/yetz');
  assert.equal(b.opened[1].url, 'https://www.twitch.tv/popout/outro/chat?popout=');
  assert.equal(state.sessions['kick:yetz'].media, 'live');
  assert.equal(state.sessions['twitch:outro'].media, 'chat');
  assert.equal(b.tabs.get(1).muted, true);
  await b.run({ type: 'startAll' });
  assert.equal(b.opened.length, 2);
  await b.run({ type: 'stopAll' });
  assert.equal(b.tabs.size, 0);
});

test('alterar opção Kick migra sessões existentes sem abrir canais fechados ou reiniciar Twitch', async () => {
  const b = browser();
  for (const name of ['yetz', 'fechado']) await b.run({ type: 'add', platform: 'kick', input: name });
  await b.run({ type: 'add', platform: 'twitch', input: 'outro' });
  await b.run({ type: 'start', id: 'kick:yetz' });
  await b.run({ type: 'start', id: 'twitch:outro' });
  const state = await b.run({ type: 'setKickLive', enabled: true });
  assert.deepEqual(b.removed, [1]);
  assert.equal(b.opened.at(-1).url, 'https://kick.com/yetz');
  assert.equal(state.sessions['twitch:outro'].tabId, 2);
  assert.equal(state.sessions['kick:fechado'], undefined);
  const reverted = await b.run({ type: 'setKickLive', enabled: false });
  assert.equal(b.opened.at(-1).url, 'https://kick.com/popout/yetz/chat');
  assert.equal(reverted.kickLive, false);
});

test('após atualização, iniciar todos migra chat Kick antigo para vídeo', async () => {
  const b = browser(true);
  await b.run({ type: 'add', platform: 'kick', input: 'yetz' });
  b.tabs.set(50, { id: 50, url: 'https://kick.com/popout/yetz/chat' });
  await b.api.storage.local.set({ sessions: { 'kick:yetz': { tabId: 50, mode: 'background', openedAt: 1 } } });
  const state = await b.run({ type: 'startAll' });
  assert.deepEqual(b.removed, [50]);
  assert.equal(state.sessions['kick:yetz'].media, 'live');
  assert.equal(b.opened[0].url, 'https://kick.com/yetz');
});

test('status de player aceita apenas amostras da aba gerenciada e URL correta', async () => {
  const b = browser(true);
  await b.run({ type: 'add', platform: 'kick', input: 'yetz' });
  await b.run({ type: 'startAll' });
  const sender = { tab: { id: 1 }, url: 'https://kick.com/yetz' };
  assert.deepEqual(await b.run({ type: 'kickContext' }, sender), { managed: true });
  assert.deepEqual(await b.run({ type: 'kickContext' }, { tab: { id: 99 }, url: sender.url }), { managed: false });
  assert.deepEqual(await b.run({ type: 'kickContext' }, { ...sender, url: 'https://kick.com/other' }), { managed: false });
  assert.deepEqual(await b.run({ type: 'kickContext' }), { managed: false });
  await b.run({ type: 'kickTelemetry', sample: { playing: true, height: 160, targetHeight: 160, qualityStatus: 'requested' } }, sender);
  const state = await b.run({ type: 'status' });
  assert.equal(state.sessions['kick:yetz'].playback.height, 160);
  assert.equal(state.sessions['kick:yetz'].playback.playing, true);
  await b.run({ type: 'stopAll' });
  assert.deepEqual(await b.run({ type: 'kickTelemetry', sample: { playing: true } }, sender), { managed: false });
});

test('dados inválidos do player não viram resolução ou sucesso falsos', async () => {
  const b = browser(true);
  await b.run({ type: 'add', platform: 'kick', input: 'yetz' });
  await b.run({ type: 'startAll' });
  await b.run({ type: 'kickTelemetry', sample: { playing: 'yes', height: -1, targetHeight: Infinity, qualityStatus: 'points-confirmed' } }, { tab: { id: 1 }, url: 'https://kick.com/yetz' });
  const playback = (await b.run({ type: 'status' })).sessions['kick:yetz'].playback;
  assert.equal(playback.playing, false);
  assert.equal(playback.height, 0);
  assert.equal(playback.targetHeight, 0);
  assert.equal(playback.qualityStatus, 'pending');
});

test('Firefox Android cria abas silenciadas sem usar tabs.update muted não suportado', async () => {
  const b = browser(true);
  b.api.runtime = {
    getBrowserInfo: async () => ({ name: 'Firefox' }),
    getPlatformInfo: async () => ({ os: 'android' })
  };
  b.api.tabs.update = async () => assert.fail('tabs.update não deve ser usado para silenciar no Android');
  await b.run({ type: 'add', platform: 'kick', input: 'yetz' });
  await b.run({ type: 'add', platform: 'twitch', input: 'outro' });
  const state = await b.run({ type: 'startAll' });
  assert.equal(state.warnings.length, 0);
  assert.equal(b.opened.length, 2);
  assert.ok(b.opened.every(options => options.muted === true && options.active === false));
  assert.equal(b.opened[0].url, 'https://kick.com/yetz');
  await b.run({ type: 'stopAll' });
  assert.equal(b.tabs.size, 0);
});
