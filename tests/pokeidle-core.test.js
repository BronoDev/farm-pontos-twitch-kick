import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createController } from '../src/core.js';
import { POKEIDLE_OWNER, POKEIDLE_URL, POKEIDLE_FRESH_MS } from '../src/pokeidle-state.js';

const NOW = 1_800_000_000_000;
const SOURCE_TAB = 90;
const fixture = await readFile(new URL('./fixtures/pokeidle-twitch.html', import.meta.url), 'utf8');
// O DOM tem testes próprios. Aqui a fixture fornece o lote observado ao controlador.
const fixtureEntries = [...fixture.matchAll(/<a\b([^>]*\bclass="[^"]*\btw-canal\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, html]) => {
  const classes = attrs.match(/\bclass="([^"]*)"/)[1].split(/\s+/);
  const href = attrs.match(/\bhref="([^"]*)"/)[1];
  return {
    name: new URL(href).pathname.slice(1).toLowerCase(),
    displayName: html.match(/class="tw-canal-nome">([^<]*)/)[1],
    live: classes.includes('ao-vivo'),
    bonus: classes.includes('com-bonus'),
    missing: classes.includes('tw-falta-eu')
  };
});
const ruleText = fixture.match(/class="tw-canal-bonus" title="([^"]*)"/)[1];
const liveEntries = fixtureEntries.filter(entry => entry.live);
const idFor = entry => `twitch:${entry.name}`;

function clock(t) {
  let now = NOW;
  t.mock.method(Date, 'now', () => now);
  return { get now() { return now; }, advance(ms) { now += ms; } };
}

function browser(initial = {}) {
  const data = structuredClone(initial);
  const tabs = new Map([[SOURCE_TAB, { id: SOURCE_TAB, url: POKEIDLE_URL }]]);
  const opened = [];
  const removed = [];
  const notifications = [];
  let nextId = 0;
  const api = {
    runtime: { getURL: file => `chrome-extension://test/${file}` },
    storage: { local: {
      get: async () => structuredClone(data),
      set: async value => Object.assign(data, structuredClone(value))
    } },
    tabs: {
      create: async options => {
        const tab = { id: ++nextId, ...options };
        opened.push(structuredClone(tab));
        tabs.set(tab.id, tab);
        return tab;
      },
      get: async id => { if (!tabs.has(id)) throw new Error('Aba fechada'); return tabs.get(id); },
      update: async (id, options) => Object.assign(tabs.get(id), options),
      remove: async id => { removed.push(id); tabs.delete(id); },
      query: async () => [...tabs.values()],
      reload: async () => {}
    },
    notifications: { create: async (...args) => { notifications.push(args); } }
  };
  return { api, data, tabs, opened, removed, notifications, run: createController(api) };
}

function source(overrides = {}) {
  return { tab: { id: SOURCE_TAB, url: POKEIDLE_URL }, url: POKEIDLE_URL, ...overrides };
}

function snapshot(b, channels = fixtureEntries, extra = {}, sender = source()) {
  return b.run({ type: 'pokeidleSnapshot', snapshot: { ready: true, channels, ruleText, ...extra } }, sender);
}

test('importa os 16 canais da fixture e abre somente 3 dos 8 elegíveis, com fila de 5 e somente chat Twitch', async t => {
  clock(t);
  assert.equal(fixtureEntries.length, 16);
  assert.equal(liveEntries.length, 8);
  const b = browser();
  assert.deepEqual(await snapshot(b), { accepted: true }, 'content script não recebe estado geral');
  assert.equal(b.data.channels.length, 16);
  assert.equal(b.data.pokeidle.channels.length, 16);
  assert.equal(Object.keys(b.data.sessions).length, 3);
  assert.equal(b.data.queue.length, 5);
  assert.ok(b.data.queue.every(id => liveEntries.some(entry => idFor(entry) === id)));
  for (const [id, session] of Object.entries(b.data.sessions)) {
    assert.equal(session.media, 'chat');
    assert.deepEqual(session.ownerIds, [POKEIDLE_OWNER]);
    assert.equal(b.tabs.get(session.tabId).url, `https://www.twitch.tv/popout/${id.slice('twitch:'.length)}/chat?popout=`);
    assert.equal(b.tabs.get(session.tabId).active, false);
    assert.equal(b.tabs.get(session.tabId).muted, true);
  }
  assert.ok(b.data.pokeidle.ruleText.includes('+15%'));
  assert.ok(b.data.pokeidle.ruleText.includes('+2,5%'));
});

test('retirada de tw-falta-eu não fecha sessões existentes e não inicia outros canais já reconhecidos', async t => {
  clock(t);
  const b = browser();
  await snapshot(b);
  const before = structuredClone(b.data.sessions);
  const count = b.opened.length;
  await snapshot(b, fixtureEntries.map(entry => ({ ...entry, missing: false })));
  assert.deepEqual(b.data.sessions, before);
  assert.equal(b.opened.length, count);
  assert.deepEqual(b.data.queue, []);
  assert.deepEqual(b.removed, []);
});

test('iniciar manualmente um canal automático na fila cria um único chat com os dois donos', async t => {
  clock(t);
  const b = browser();
  await snapshot(b);
  const queued = b.data.queue[0];
  // A pausa de outro canal libera uma vaga sem acionar o drain intermediário.
  const activeId = Object.keys(b.data.sessions)[0];
  await b.run({ type: 'pauseAutomation' });
  await b.run({ type: 'stop', id: activeId });
  b.data.automationPaused = false;
  const before = b.opened.length;
  const state = await b.run({ type: 'start', id: queued });
  assert.equal(b.opened.length, before + 1);
  assert.equal(b.opened.at(-1).url, `https://www.twitch.tv/popout/${queued.slice(7)}/chat?popout=`);
  assert.deepEqual(new Set(state.sessions[queued].ownerIds), new Set(['manual', POKEIDLE_OWNER]));
});

test('offline ou bônus removido revogam dono automático, preservando participação manual', async t => {
  clock(t);
  const b = browser();
  await snapshot(b);
  const first = idFor(liveEntries[0]);
  const second = idFor(liveEntries[1]);
  await b.run({ type: 'start', id: first });
  const firstTab = b.data.sessions[first].tabId;
  const secondTab = b.data.sessions[second].tabId;
  assert.deepEqual(new Set(b.data.sessions[first].ownerIds), new Set([POKEIDLE_OWNER, 'manual']));
  await snapshot(b, fixtureEntries.map(entry => ({ ...entry,
    live: entry.name === liveEntries[0].name ? false : entry.live,
    bonus: entry.name === liveEntries[1].name ? false : entry.bonus
  })));
  assert.equal(b.data.sessions[first].tabId, firstTab);
  assert.deepEqual(b.data.sessions[first].ownerIds, ['manual']);
  assert.ok(b.tabs.has(firstTab));
  assert.equal(b.data.sessions[second], undefined);
  assert.ok(b.removed.includes(secondTab));
  assert.ok(!b.data.queue.includes(second));
});

test('fechar todos continua pausado após snapshot e tick; retomar permite abrir novamente', async t => {
  clock(t);
  const b = browser();
  await snapshot(b);
  await b.run({ type: 'stopAll' });
  const count = b.opened.length;
  await snapshot(b);
  await b.run({ type: 'tick' });
  assert.equal(b.data.automationPaused, true);
  assert.equal(Object.keys(b.data.sessions).length, 0);
  assert.deepEqual(b.data.queue, []);
  assert.equal(b.opened.length, count);
  const resumed = await b.run({ type: 'resumeAutomation' });
  assert.equal(resumed.automationPaused, false);
  assert.equal(Object.keys(resumed.sessions).length, 3);
});

test('parar canal individual impede ressurreição automática em novos snapshots', async t => {
  clock(t);
  const b = browser();
  await snapshot(b);
  const id = idFor(liveEntries[0]);
  await b.run({ type: 'stop', id });
  assert.ok(b.data.pausedChannels.includes(id));
  await snapshot(b);
  await b.run({ type: 'tick' });
  assert.equal(b.data.sessions[id], undefined);
  assert.ok(!b.data.queue.includes(id));
  assert.ok(b.data.pausedChannels.includes(id));
});

test('snapshot vencido não permite abrir próximos canais da fila, sem assumir offline para os existentes', async t => {
  const time = clock(t);
  const b = browser({ settings: { maxConcurrent: 1 } });
  await snapshot(b);
  const [id] = Object.keys(b.data.sessions);
  const tabId = b.data.sessions[id].tabId;
  const count = b.opened.length;
  time.advance(POKEIDLE_FRESH_MS + 1);
  await b.run({ type: 'tick' });
  assert.equal(b.data.sessions[id].tabId, tabId, 'falta de atualização não é evidência de offline');
  assert.equal(b.opened.length, count);
  await b.run({ type: 'stop', id });
  assert.equal(Object.keys(b.data.sessions).length, 0);
  assert.deepEqual(b.data.queue, []);
  assert.equal(b.opened.length, count);
});

test('fechamento da aba fonte interrompe novas aberturas da fila', async t => {
  clock(t);
  const b = browser({ settings: { maxConcurrent: 1 } });
  await snapshot(b);
  const [id] = Object.keys(b.data.sessions);
  const count = b.opened.length;
  b.tabs.delete(SOURCE_TAB);
  await b.run({ type: 'tabRemoved', tabId: SOURCE_TAB });
  assert.equal(b.data.pokeidle.connected, false);
  await b.run({ type: 'stop', id });
  assert.equal(Object.keys(b.data.sessions).length, 0);
  assert.deepEqual(b.data.queue, []);
  assert.equal(b.opened.length, count);
});

test('snapshots repetidos e entradas duplicadas não criam abas ou canais em duplicidade', async t => {
  clock(t);
  const b = browser();
  await snapshot(b);
  const before = structuredClone(b.data.sessions);
  await snapshot(b, [...fixtureEntries, ...fixtureEntries.map(entry => ({ ...entry, name: entry.name.toUpperCase() }))]);
  await snapshot(b);
  assert.equal(b.data.channels.length, 16);
  assert.equal(b.data.pokeidle.channels.length, 16);
  assert.deepEqual(b.data.sessions, before);
  assert.equal(b.opened.length, 3);
  assert.equal(new Set(b.data.queue).size, 5);
});

test('iniciar todos não transforma canais oficiais offline em pedidos manuais', async t => {
  clock(t);
  const b = browser();
  await snapshot(b);
  await b.run({ type: 'stopAll' });
  const started = await b.run({ type: 'startAll' });
  const offline = new Set(fixtureEntries.filter(entry => !entry.live).map(idFor));
  assert.ok(Object.keys(started.sessions).every(id => !offline.has(id)));
  assert.ok(started.queue.every(id => !offline.has(id)));
  assert.ok(Object.values(started.sessions).every(session => session.ownerIds.length === 1 && session.ownerIds[0] === POKEIDLE_OWNER));
});

test('remover canal importado cria exclusão persistente e não o reimporta no próximo snapshot', async t => {
  clock(t);
  const b = browser();
  await snapshot(b);
  const entry = liveEntries[0];
  const id = idFor(entry);
  await b.run({ type: 'remove', id });
  await snapshot(b);
  assert.ok(b.data.pokeidle.excludedNames.includes(entry.name));
  assert.ok(!b.data.channels.some(channel => channel.id === id));
  assert.equal(b.data.sessions[id], undefined);
  assert.ok(!b.data.queue.includes(id));
});

test('remetentes, URLs e lotes inválidos são rejeitados sem retornar ou alterar estado geral', async t => {
  clock(t);
  const b = browser({ sentinel: 'preservado' });
  const original = structuredClone(b.data);
  const badSenders = [
    {}, source({ tab: { id: '90' } }), source({ tab: { id: 91 } }),
    source({ url: 'https://pokeidle.io.evil.test/app' }),
    source({ url: 'http://pokeidle.io/app' }),
    source({ url: 'https://user:pass@pokeidle.io/app' }),
    source({ url: 'https://pokeidle.io/application' }),
    source({ url: 'https://pokeidle.io/app2' }),
    source({ url: 'https://pokeidle.io/app/../admin' })
  ];
  for (const sender of badSenders) assert.deepEqual(await snapshot(b, fixtureEntries, {}, sender), { accepted: false });
  for (const payload of [null, {}, { ready: false, channels: fixtureEntries }, { ready: 'true', channels: fixtureEntries }, { ready: true, channels: {} }, { ready: true, channels: [] }, { ready: true, channels: [null, { name: 'directory' }, { name: '<script>' }, { name: 'user/password' }] }]) {
    assert.deepEqual(await b.run({ type: 'pokeidleSnapshot', snapshot: payload }, source()), { accepted: false });
  }
  b.tabs.get(SOURCE_TAB).url = 'https://evil.test/app';
  assert.deepEqual(await snapshot(b), { accepted: false }, 'confere URL atual da aba, não apenas sender.url');
  assert.deepEqual(b.data, original);
  assert.deepEqual(b.opened, []);
  assert.deepEqual(b.removed, []);
});

test('sinais ausentes, nulos ou de tipo inválido não são interpretados como offline nem revogam sessões', async t => {
  clock(t);
  const b = browser();
  await snapshot(b);
  const before = structuredClone(b.data);
  const [first, second, third] = liveEntries;
  const malformed = [
    { name: first.name, bonus: true, missing: true },
    { name: first.name, live: false, bonus: true, missing: null },
    { name: second.name, live: null, bonus: true, missing: true },
    { name: second.name, live: true, bonus: 'false', missing: true },
    { name: third.name, live: true, bonus: true, missing: 'true' }
  ];
  for (const channels of [null, {}, malformed, [malformed[1]]]) {
    assert.deepEqual(await snapshot(b, channels), { accepted: false });
    assert.deepEqual(b.data, before);
  }
  assert.equal(b.removed.length, 0);
  assert.equal(b.opened.length, 3);
  // Um lote parcialmente válido também não converte a ausência de um canal em offline.
  const accepted = await snapshot(b, [...malformed, { ...second, missing: false }]);
  assert.deepEqual(accepted, { accepted: true });
  assert.deepEqual(b.data.sessions, before.sessions);
  assert.equal(b.data.pokeidle.channels.length, 1);
  assert.equal(b.data.pokeidle.channels[0].name, second.name);
  assert.equal(b.removed.length, 0);
});

test('canal Twitch manual mantém o chat existente e compartilha o dono com o PokeIdle', async t => {
  clock(t);
  const b = browser();
  const entry = liveEntries[0];
  const id = idFor(entry);
  await b.run({ type: 'add', platform: 'twitch', input: entry.name });
  await b.run({ type: 'start', id });
  const chatTab = b.data.sessions[id].tabId;
  assert.equal(b.tabs.get(chatTab).url, `https://www.twitch.tv/popout/${entry.name}/chat?popout=`);
  await snapshot(b, [entry]);
  assert.ok(!b.removed.includes(chatTab));
  assert.equal(b.opened.length, 1);
  assert.equal(b.data.sessions[id].tabId, chatTab);
  assert.equal(b.data.sessions[id].media, 'chat');
  assert.deepEqual(new Set(b.data.sessions[id].ownerIds), new Set(['manual', POKEIDLE_OWNER]));
  assert.ok(!b.data.channels.find(channel => channel.id === id).pokeidleAutoAdded);
  const liveTab = b.data.sessions[id].tabId;
  await snapshot(b, [{ ...entry, live: false }]);
  assert.equal(b.data.sessions[id].tabId, liveTab);
  assert.deepEqual(b.data.sessions[id].ownerIds, ['manual']);
});

test('limite de vídeos Kick não conta chats Twitch e não bloqueia sua fila', async t => {
  clock(t);
  const b = browser({ settings: { maxConcurrent: 4, maxKickLives: 1 } });
  await b.run({ type: 'add', platform: 'kick', input: 'primeiro' });
  await b.run({ type: 'add', platform: 'kick', input: 'segundo' });
  await b.run({ type: 'start', id: 'kick:primeiro' });
  await b.run({ type: 'start', id: 'kick:segundo' });
  await snapshot(b);
  const sessions = Object.keys(b.data.sessions);
  assert.equal(sessions.length, 4);
  assert.equal(sessions.filter(id => id.startsWith('kick:')).length, 1);
  assert.equal(sessions.filter(id => id.startsWith('twitch:')).length, 3);
  assert.ok(b.data.queue.includes('kick:segundo'));
});

test('limite de duração avança fila e não reinicia a mesma sessão automática', async t => {
  const time = clock(t);
  const b = browser({ settings: { maxConcurrent: 1, sessionMinutes: 1 } });
  await snapshot(b);
  const [first] = Object.keys(b.data.sessions);
  const firstTab = b.data.sessions[first].tabId;
  time.advance(60_000);
  await b.run({ type: 'tick' });
  assert.ok(b.removed.includes(firstTab));
  assert.equal(b.data.sessions[first], undefined);
  assert.ok(b.data.pausedChannels.includes(first));
  assert.ok(b.data.sessionHistory.some(session => session.channelId === first && session.reason === 'duration-limit'));
  assert.equal(Object.keys(b.data.sessions).length, 1);
  await snapshot(b);
  assert.equal(b.data.sessions[first], undefined);
  assert.ok(!b.data.queue.includes(first));
});

test('tempo da observação e identidade da aba fonte vêm do controlador, sem confiar em campos extras do payload', async t => {
  const time = clock(t);
  const b = browser();
  const result = await snapshot(b, [liveEntries[0]], { observedAt: NOW + 99_999_999, sourceTabId: 666, sourceUrl: 'https://evil.test', connected: false, summary: { xp: 9999 } });
  assert.deepEqual(result, { accepted: true });
  assert.equal(b.data.pokeidle.observedAt, time.now);
  assert.equal(b.data.pokeidle.sourceTabId, SOURCE_TAB);
  assert.equal(b.data.pokeidle.sourceUrl, POKEIDLE_URL);
  assert.equal(b.data.pokeidle.connected, true);
  assert.equal(b.data.measurements.length, 0);
  assert.equal(b.data.pokeidle.summary, undefined);
});
