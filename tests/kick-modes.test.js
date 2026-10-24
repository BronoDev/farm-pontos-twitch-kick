import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../src/core.js';
import { kickUsesLive } from '../src/automation.js';

const NOW = 1_800_000_000_000;
function browser(initial = {}) {
  const data = structuredClone(initial);
  const tabs = new Map();
  const opened = [];
  const removed = [];
  let nextId = 1;
  const api = {
    runtime: { getURL: file => `chrome-extension://kick-mode-test/${file}` },
    storage: { local: {
      get: async () => structuredClone(data),
      set: async value => Object.assign(data, structuredClone(value))
    } },
    tabs: {
      create: async options => {
        const tab = { id: nextId++, ...options };
        tabs.set(tab.id, tab); opened.push(structuredClone(tab));
        return tab;
      },
      get: async id => { if (!tabs.has(id)) throw Error('Aba fechada'); return tabs.get(id); },
      update: async (id, values) => Object.assign(tabs.get(id), values),
      remove: async id => { tabs.delete(id); removed.push(id); }
    }
  };
  return { api, data, tabs, opened, removed, run: createController(api) };
}
async function add(b, name, kickMode, platform = 'kick') {
  return b.run({ type: 'add', platform, input: name, ...(kickMode === undefined ? {} : { kickMode }) });
}
function urlFor(name, media) { return media === 'live' ? `https://kick.com/${name}` : `https://kick.com/popout/${name}/chat`; }

for (const global of [undefined, true, false]) {
  for (const mode of ['default', 'live', 'chat']) {
    test(`modo ${mode} com padrão global ${String(global)} abre a URL efetiva e persiste a escolha`, async () => {
      const b = browser(global === undefined ? {} : { kickLive: global });
      await add(b, 'yetz', mode);
      const state = await b.run({ type: 'start', id: 'kick:yetz' });
      const media = mode === 'live' || (mode === 'default' && global !== false) ? 'live' : 'chat';
      assert.equal(state.channels[0].kickMode, mode);
      assert.equal(state.sessions['kick:yetz'].media, media);
      assert.equal(b.opened[0].url, urlFor('yetz', media));
      assert.equal(b.tabs.get(state.sessions['kick:yetz'].tabId).muted, true);
      const restored = await createController(b.api)({ type: 'status' });
      assert.equal(restored.channels[0].kickMode, mode);
      assert.equal(b.opened.length, 1);
    });
  }
}

test('canais legados sem kickMode conservam a opção global e modos corrompidos têm fallback seguro', async () => {
  for (const global of [true, false]) {
    const b = browser({ kickLive: global, channels: [{ id: 'kick:legado', platform: 'kick', name: 'legado' }] });
    const state = await b.run({ type: 'startAll' });
    assert.equal(state.channels[0].kickMode, undefined);
    assert.equal(state.sessions['kick:legado'].media, global ? 'live' : 'chat');
  }
  assert.equal(kickUsesLive({ kickLive: true }, { platform: 'twitch', kickMode: 'live' }), false);
  assert.equal(kickUsesLive({ kickLive: false }, { platform: 'kick', kickMode: 'invalid' }), false);
  assert.equal(kickUsesLive({ kickLive: true }, { platform: 'kick', kickMode: 'invalid' }), true);
});

test('cadastro duplicado mantém modo existente e opções inválidas não alteram os dados', async () => {
  const b = browser();
  await add(b, 'yetz', 'chat');
  await add(b, 'yetz', 'live');
  assert.equal(b.data.channels.length, 1);
  assert.equal(b.data.channels[0].kickMode, 'chat');
  await add(b, 'outro', undefined, 'twitch');
  const before = structuredClone(b.data);
  for (const mode of [null, true, 'invalid', 'LIVE', 0, {}]) {
    await assert.rejects(add(b, 'invalido', mode), /Modo Kick inválido/);
    await assert.rejects(b.run({ type: 'setKickMode', id: 'kick:yetz', mode }), /Modo Kick inválido/);
  }
  await assert.rejects(b.run({ type: 'setKickMode', id: 'twitch:outro', mode: 'live' }), /Modo Kick inválido/);
  await assert.rejects(add(b, 'outro', 'live', 'twitch'), /Modo Kick inválido/);
  assert.deepEqual(b.data, before);
  assert.equal(b.opened.length, 0);
});

test('mudar modo migra somente o canal ativo escolhido, conserva donos e não duplica ao repetir', async t => {
  let now = NOW;
  t.mock.method(Date, 'now', () => now);
  const b = browser();
  await add(b, 'yetz', 'chat');
  await add(b, 'outro', 'live');
  await add(b, 'twitch_manual', undefined, 'twitch');
  await b.run({ type: 'startAll' });
  const first = structuredClone(b.data.sessions['kick:yetz']);
  const other = structuredClone(b.data.sessions['kick:outro']);
  const twitch = structuredClone(b.data.sessions['twitch:twitch_manual']);
  const agenda = await b.run({ type: 'addSchedule', schedule: { channelIds: ['kick:yetz'], startsAt: now, endsAt: now + 600000 } });
  const owner = agenda.schedules[0].id;
  now += 30000;
  const changed = await b.run({ type: 'setKickMode', id: 'kick:yetz', mode: 'live' });
  assert.equal(changed.sessions['kick:yetz'].media, 'live');
  assert.notEqual(changed.sessions['kick:yetz'].tabId, first.tabId);
  assert.equal(changed.sessions['kick:yetz'].openedAt, first.openedAt);
  assert.deepEqual(new Set(changed.sessions['kick:yetz'].ownerIds), new Set(['manual', owner]));
  assert.deepEqual(changed.sessions['kick:outro'], other);
  assert.deepEqual(changed.sessions['twitch:twitch_manual'], twitch);
  assert.deepEqual(b.removed, [first.tabId]);
  const count = b.opened.length;
  const unchanged = await b.run({ type: 'setKickMode', id: 'kick:yetz', mode: 'live' });
  assert.equal(b.opened.length, count);
  assert.equal(unchanged.sessions['kick:yetz'].tabId, changed.sessions['kick:yetz'].tabId);
});

test('alterar padrão global não migra os canais com escolha explícita', async () => {
  const b = browser();
  await add(b, 'legado');
  await add(b, 'padrao', 'default');
  await add(b, 'video', 'live');
  await add(b, 'chat', 'chat');
  await b.run({ type: 'setSettings', settings: { maxConcurrent: 5, maxKickLives: 5 } });
  await b.run({ type: 'startAll' });
  const videoTab = b.data.sessions['kick:video'].tabId;
  const chatTab = b.data.sessions['kick:chat'].tabId;
  const state = await b.run({ type: 'setKickLive', enabled: false });
  assert.equal(state.sessions['kick:legado'].media, 'chat');
  assert.equal(state.sessions['kick:padrao'].media, 'chat');
  assert.equal(state.sessions['kick:video'].tabId, videoTab);
  assert.equal(state.sessions['kick:video'].media, 'live');
  assert.equal(state.sessions['kick:chat'].tabId, chatTab);
  assert.equal(state.sessions['kick:chat'].media, 'chat');
  assert.equal(b.removed.length, 2);
});

test('mudar modo de canal parado ou pausado não o abre nem desfaz Fechar todos', async () => {
  const b = browser();
  await add(b, 'parado', 'chat');
  await b.run({ type: 'setKickMode', id: 'kick:parado', mode: 'live' });
  assert.equal(b.opened.length, 0);
  await b.run({ type: 'startAll' });
  await b.run({ type: 'stop', id: 'kick:parado' });
  const before = b.opened.length;
  const paused = await b.run({ type: 'setKickMode', id: 'kick:parado', mode: 'chat' });
  assert.ok(paused.pausedChannels.includes('kick:parado'));
  assert.deepEqual(paused.sessions, {});
  await b.run({ type: 'startAll' });
  await b.run({ type: 'stopAll' });
  const stopped = await b.run({ type: 'setKickMode', id: 'kick:parado', mode: 'live' });
  assert.equal(stopped.automationPaused, true);
  assert.deepEqual(stopped.sessions, {});
  assert.deepEqual(stopped.queue, []);
  assert.equal(b.opened.length, before + 1);
});

test('modo live explícito respeita cap Kick mesmo com padrão chat e troca ativa entra na fila', async () => {
  const b = browser({ kickLive: false });
  await b.run({ type: 'setSettings', settings: { maxConcurrent: 4, maxKickLives: 1 } });
  await add(b, 'video', 'live');
  await add(b, 'conversando', 'chat');
  await add(b, 'na_fila', 'live');
  await add(b, 'outro_chat', 'chat');
  await b.run({ type: 'startAll' });
  assert.equal(Object.keys(b.data.sessions).length, 3);
  assert.deepEqual(b.data.queue, ['kick:na_fila']);
  const chatTab = b.data.sessions['kick:conversando'].tabId;
  const changed = await b.run({ type: 'setKickMode', id: 'kick:conversando', mode: 'live' });
  assert.equal(changed.sessions['kick:conversando'], undefined);
  assert.ok(changed.queue.includes('kick:conversando'));
  assert.deepEqual(changed.queueSources['kick:conversando'], ['manual']);
  assert.ok(b.removed.includes(chatTab));
  assert.equal(changed.sessions['kick:outro_chat'].media, 'chat');
  const liveCount = Object.values(changed.sessions).filter(session => session.media === 'live').length;
  assert.equal(liveCount, 1);
  const released = await b.run({ type: 'stop', id: 'kick:video' });
  assert.equal(released.sessions['kick:na_fila'].media, 'live');
});

test('modo chat numa entrada da fila avança sem esperar uma vaga de vídeo Kick', async () => {
  const b = browser();
  await b.run({ type: 'setSettings', settings: { maxConcurrent: 3, maxKickLives: 1 } });
  await add(b, 'video', 'live');
  await add(b, 'espera', 'live');
  await b.run({ type: 'startAll' });
  assert.deepEqual(b.data.queue, ['kick:espera']);
  const count = b.opened.length;
  const changed = await b.run({ type: 'setKickMode', id: 'kick:espera', mode: 'chat' });
  assert.equal(changed.sessions['kick:espera'].media, 'chat');
  assert.deepEqual(changed.queue, []);
  assert.equal(b.opened.length, count + 1);
  assert.equal(b.opened.at(-1).url, urlFor('espera', 'chat'));
});

test('reduzir cap de vídeo preserva chats explícitos e avança a fila sem bloquear Twitch', async () => {
  const b = browser({ kickLive: false });
  await b.run({ type: 'setSettings', settings: { maxConcurrent: 4, maxKickLives: 3 } });
  await add(b, 'video1', 'live');
  await add(b, 'video2', 'live');
  await add(b, 'chat', 'chat');
  await add(b, 'outro', undefined, 'twitch');
  await b.run({ type: 'startAll' });
  const chat = structuredClone(b.data.sessions['kick:chat']);
  const twitch = structuredClone(b.data.sessions['twitch:outro']);
  const changed = await b.run({ type: 'setSettings', settings: { maxKickLives: 1 } });
  assert.deepEqual(changed.sessions['kick:chat'], chat);
  assert.deepEqual(changed.sessions['twitch:outro'], twitch);
  assert.equal(Object.values(changed.sessions).filter(session => session.media === 'live').length, 1);
  assert.equal(changed.queue.length, 1);
  const queued = changed.queue[0];
  const toChat = await b.run({ type: 'setKickMode', id: queued, mode: 'chat' });
  assert.equal(toChat.sessions[queued].media, 'chat');
  assert.deepEqual(toChat.queue, []);
});

test('mudar modo durante pausa global preserva a pausa e migra só a sessão individual ativa', async () => {
  const b = browser();
  await add(b, 'alvo', 'chat');
  await add(b, 'parado', 'live');
  await b.run({ type: 'stopAll' });
  await b.run({ type: 'start', id: 'kick:alvo' });
  const state = await b.run({ type: 'setKickMode', id: 'kick:alvo', mode: 'live' });
  assert.equal(state.automationPaused, true);
  assert.equal(state.sessions['kick:alvo'].media, 'live');
  assert.equal(state.sessions['kick:parado'], undefined);
  assert.deepEqual(state.queue, []);
});

test('mudança imediata de modo não reinicia limite de duração', async t => {
  let now = NOW;
  t.mock.method(Date, 'now', () => now);
  const b = browser();
  await add(b, 'yetz', 'chat');
  await b.run({ type: 'setSettings', settings: { sessionMinutes: 1 } });
  await b.run({ type: 'startAll' });
  now += 59000;
  await b.run({ type: 'setKickMode', id: 'kick:yetz', mode: 'live' });
  now += 1000;
  const expired = await b.run({ type: 'tick' });
  assert.equal(expired.sessions['kick:yetz'], undefined);
  assert.ok(expired.pausedChannels.includes('kick:yetz'));
  assert.equal(expired.sessionHistory.at(-1).reason, 'duration-limit');
});

test('abrir canal parado em aba pessoal usa seu modo efetivo sem criar sessão', async () => {
  const b = browser({ kickLive: false });
  await add(b, 'video', 'live');
  await add(b, 'chat', 'chat');
  await b.run({ type: 'openSession', id: 'kick:video' });
  const state = await b.run({ type: 'openSession', id: 'kick:chat' });
  assert.equal(b.opened[0].url, urlFor('video', 'live'));
  assert.equal(b.opened[1].url, urlFor('chat', 'chat'));
  assert.ok(b.opened.every(tab => tab.active === true));
  assert.deepEqual(state.sessions, {});
});
