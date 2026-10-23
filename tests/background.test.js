import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const tickName = 'chat-leve-tick';
function event() {
  const listeners = [];
  return {
    addListener(listener) { listeners.push(listener); },
    emit(...args) { return listeners.map(listener => listener(...args)); }
  };
}

async function background({ initial = {}, initialAlarms = [] } = {}) {
  const base = new URL('../instalar/firefox/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
  const data = structuredClone(initial);
  const tabs = new Map();
  const alarms = new Map(initialAlarms.map(alarm => [alarm.name, structuredClone(alarm)]));
  const registrations = [];
  const opened = [];
  const notifications = [];
  const probes = [];
  const clock = { now: 1_800_000_000_000 };
  const faults = { createOnce: false };
  let nextTab = 1;
  class ClockDate extends Date { static now() { return clock.now; } }
  const api = {
    runtime: {
      id: manifest.browser_specific_settings.gecko.id,
      getURL: name => `moz-extension://background-test/${name}`,
      getBrowserInfo: async () => ({ name: 'Firefox' }),
      getPlatformInfo: async () => ({ os: 'linux' }),
      onMessage: event(), onInstalled: event(), onStartup: event()
    },
    storage: { local: {
      get: async () => structuredClone(data),
      set: async value => Object.assign(data, structuredClone(value))
    } },
    tabs: {
      onRemoved: event(),
      create: async options => {
        if (faults.createOnce) { faults.createOnce = false; throw Error('Falha temporária de abertura'); }
        const tab = { id: nextTab++, windowId: 1, ...structuredClone(options) };
        tabs.set(tab.id, tab); opened.push(tab);
        return tab;
      },
      get: async id => { if (!tabs.has(id)) throw Error('Aba não encontrada'); return tabs.get(id); },
      update: async (id, values) => Object.assign(tabs.get(id), values),
      remove: async id => { tabs.delete(id); api.tabs.onRemoved.emit(id, { windowId: 1 }); },
      reload: async () => {},
      sendMessage: async (id, message) => { probes.push({ id, message }); return { ok: true }; }
    },
    alarms: {
      onAlarm: event(),
      get: async name => alarms.get(name),
      create: async (name, options) => {
        const alarm = { name, ...structuredClone(options) };
        alarms.set(name, alarm); registrations.push(alarm);
      }
    },
    notifications: {
      onClicked: event(),
      create: async (id, options) => { notifications.push({ id, ...structuredClone(options) }); return id; }
    }
  };
  const context = vm.createContext({ browser: api, URL, Date: ClockDate,
    setInterval: () => assert.fail('A agenda deve usar alarms em vez de um intervalo permanente') });
  for (const script of manifest.background.scripts) {
    vm.runInContext(await readFile(new URL(script, base), 'utf8'), context, { filename: script });
  }
  const panel = { id: api.runtime.id, tab: { id: 999 }, url: api.runtime.getURL('popup.html') };
  const send = (message, sender = panel) => new Promise(resolve => {
    const results = api.runtime.onMessage.emit(message, sender, resolve);
    assert.ok(results.some(result => result === true), 'O background deve aceitar a mensagem e responder');
  });
  // Eventos de startup retornam void; uma volta do event loop completa sua inicialização
  // antes de inserir uma mensagem-barreira na fila real do background.
  const settle = async () => { await new Promise(resolve => setImmediate(resolve)); return send({ type: 'status' }); };
  await settle();
  return { api, data, tabs, alarms, registrations, opened, notifications, probes, clock, faults, panel, send, settle };
}

async function add(b, name, platform = 'kick') {
  const response = await b.send({ type: 'add', platform, input: name });
  assert.equal(response.ok, true);
}

test('background cria alarme recorrente, preserva existente e recria em startup/installed', async () => {
  const b = await background();
  assert.equal(b.registrations.length, 1);
  assert.equal(b.alarms.get(tickName).periodInMinutes, 1);
  assert.equal(b.alarms.get(tickName).delayInMinutes, 1);
  b.api.runtime.onStartup.emit();
  await b.settle();
  assert.equal(b.registrations.length, 1, 'Startup não deve reprogramar um alarme que já existe');
  b.alarms.delete(tickName);
  b.api.runtime.onStartup.emit();
  await b.settle();
  assert.equal(b.registrations.length, 2, 'Startup deve recuperar alarme removido pelo navegador');
  b.alarms.delete(tickName);
  b.api.runtime.onInstalled.emit({ reason: 'update' });
  await b.settle();
  assert.equal(b.registrations.length, 3, 'Atualização também deve restaurar a agenda');
  const restored = await background({ initialAlarms: [{ name: tickName, periodInMinutes: 1 }] });
  assert.equal(restored.registrations.length, 0, 'Novo processo deve reutilizar alarme persistido');
});

test('evento de alarme inicia e encerra a agenda real e Fechar todos impede reabertura', async () => {
  const b = await background();
  await add(b, 'yetz'); await add(b, 'outro', 'twitch');
  const startsAt = b.clock.now + 120_000;
  const scheduled = await b.send({ type: 'addSchedule', schedule: {
    channelIds: ['kick:yetz', 'twitch:outro'], startsAt, endsAt: startsAt + 120_000
  } });
  assert.equal(scheduled.ok, true);
  assert.equal(b.opened.length, 0);
  b.clock.now = startsAt;
  b.api.alarms.onAlarm.emit({ name: 'outro-alarme' });
  await b.settle();
  assert.equal(b.opened.length, 0, 'Um alarme externo não pode acionar esta agenda');
  b.api.alarms.onAlarm.emit({ name: tickName });
  const started = await b.settle();
  assert.equal(started.state.schedules[0].startedAt, startsAt);
  assert.equal(b.tabs.size, 2);
  assert.equal(b.opened[0].url, 'https://kick.com/yetz');
  assert.equal(b.opened[1].url, 'https://www.twitch.tv/popout/outro/chat?popout=');
  b.clock.now += 120_000;
  b.api.alarms.onAlarm.emit({ name: tickName });
  await b.settle();
  assert.equal(b.tabs.size, 0, 'Fim da janela deve encerrar as sessões da agenda');
  await b.send({ type: 'addSchedule', schedule: {
    channelIds: ['kick:yetz'], startsAt: b.clock.now + 60_000, endsAt: b.clock.now + 600_000
  } });
  await b.send({ type: 'stopAll' });
  b.clock.now += 120_000;
  b.api.alarms.onAlarm.emit({ name: tickName });
  const paused = await b.settle();
  assert.equal(paused.state.automationPaused, true);
  assert.equal(b.tabs.size, 0);
  assert.equal(b.opened.length, 2, 'Agenda futura não pode desfazer Fechar todos');
});

test('fila de mensagens se recupera de erro e alarme continua uma abertura que falhou', async () => {
  const b = await background();
  const invalid = await b.send({ type: 'add', platform: 'kick', input: '<script>' });
  assert.equal(invalid.ok, false);
  await add(b, 'yetz');
  b.faults.createOnce = true;
  const failed = await b.send({ type: 'startAll' });
  assert.equal(failed.ok, true);
  assert.equal(failed.state.warnings.length, 1);
  assert.equal(b.tabs.size, 0);
  assert.equal(failed.state.queue[0], 'kick:yetz');
  b.api.alarms.onAlarm.emit({ name: tickName });
  const recovered = await b.settle();
  assert.equal(recovered.ok, true);
  assert.equal(b.tabs.size, 1);
  assert.ok(recovered.state.sessions['kick:yetz']);
  assert.equal(recovered.state.queue.length, 0);
});

test('painel em aba controla sessões; site não recebe comandos e saúde exige aba/URL corretas', async () => {
  const b = await background();
  await add(b, 'yetz');
  const opened = await b.send({ type: 'startAll' });
  const tabId = opened.state.sessions['kick:yetz'].tabId;
  const content = { id: b.api.runtime.id, tab: { id: tabId }, url: 'https://kick.com/yetz' };
  let answered = false;
  assert.equal(b.api.runtime.onMessage.emit({ type: 'stopAll' }, content, () => { answered = true; })[0], false);
  assert.equal(answered, false);
  assert.equal(b.tabs.size, 1, 'Uma página de conteúdo não pode fechar a sessão');
  assert.equal(b.api.runtime.onMessage.emit({ type: 'status' }, { ...b.panel, id: 'outra-extensao' }, () => assert.fail())[0], false);
  const context = await b.send({ type: 'sessionContext' }, content);
  assert.equal(context.state.managed, true);
  const sampled = await b.send({ type: 'sessionHealth', sample: { login: 'signed-out', connection: 'offline', live: 'unknown' } }, content);
  assert.equal(sampled.state.managed, true);
  const status = await b.send({ type: 'status' });
  assert.equal(status.state.sessions['kick:yetz'].health.login, 'signed-out');
  assert.equal(status.state.sessions['kick:yetz'].health.connection, 'offline');
  assert.equal(b.notifications.length, 2);
  assert.equal(b.notifications[0].iconUrl, b.api.runtime.getURL('icon.png'));
  const forged = await b.send({ type: 'sessionHealth', sample: { login: 'signed-in' } }, { ...content, url: 'https://kick.com/outro' });
  assert.equal(forged.state.managed, false);
  assert.equal(b.data.sessions['kick:yetz'].health.login, 'signed-out');
  assert.ok(b.probes.some(probe => probe.id === tabId && probe.message.type === 'requestSessionHealth'));
});

test('listener onRemoved preserva fechamento manual e avança a fila sem reabrir o canal fechado', async () => {
  const b = await background();
  await add(b, 'primeiro'); await add(b, 'segundo');
  await b.send({ type: 'setSettings', settings: { maxConcurrent: 1 } });
  const started = await b.send({ type: 'startAll' });
  const closedId = started.state.sessions['kick:primeiro'].tabId;
  b.tabs.delete(closedId);
  b.api.tabs.onRemoved.emit(closedId, { windowId: 1 });
  const advanced = await b.settle();
  assert.ok(advanced.state.pausedChannels.includes('kick:primeiro'));
  assert.equal(advanced.state.sessions['kick:primeiro'], undefined);
  assert.ok(advanced.state.sessions['kick:segundo']);
  assert.equal(b.tabs.size, 1);
  assert.equal(advanced.state.sessionHistory[0].reason, 'closed-manually');
  b.api.alarms.onAlarm.emit({ name: tickName });
  await b.settle();
  assert.equal(b.opened.length, 2, 'Alarme não deve recriar a aba fechada manualmente');
});

test('clique em notificação abre somente o painel da extensão', async () => {
  const b = await background();
  b.api.notifications.onClicked.emit('um-aviso');
  await b.settle();
  assert.equal(b.opened.length, 1);
  assert.equal(b.opened[0].url, b.api.runtime.getURL('popup.html'));
  assert.equal(b.opened[0].active, true);
  assert.equal(Object.keys(b.data.sessions).length, 0);
});
