import { createController } from './core.js';
import { isPokeIdleUrl, normalizePokeIdle, pokeIdleFresh, pokeIdleExcluded, POKEIDLE_OWNER } from './pokeidle-state.js';
import { normalizeLiveWatch, collectLiveWatch } from './live-watch.js';
import { createTwitchChat } from './twitch-chat.js';

const api = globalThis.browser ?? globalThis.chrome;
const twitchChat = createTwitchChat(api);
const execute = createController(api, { twitchChat });
// Serializa mensagens para evitar abas duplicadas e perda de atualizações.
let queue = Promise.resolve();
function enqueue(message, sender = {}) {
  const result = queue.then(() => execute(message, sender));
  queue = result.catch(() => {});
  return result;
}
function needsLivePolling(state) {
  return state.liveWatch.enabled || (state.pokeidle.enabled && (
    state.pokeidle.channels.some(item => item.platform === 'kick')
    || Object.entries(state.sessions).some(([id, session]) => id.startsWith('kick:') && session.ownerIds?.includes(POKEIDLE_OWNER))
  ));
}
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== api.runtime.id) return false;
  // No celular, o painel/opções pode rodar em uma aba da própria extensão.
  const fromPanel = sender.url === api.runtime.getURL('popup.html');
  if (sender.tab && !fromPanel && !['kickContext', 'kickTelemetry', 'playerContext', 'playerTelemetry', 'sessionContext', 'sessionHealth', 'pokeidleSnapshot'].includes(message.type)) return false;
  // A leitura envia uma segunda mensagem ao controller. Aguarde-a fora da fila
  // para que a resposta do content script não dependa da própria operação bloqueada.
  let action;
  if (message.type === 'refreshPokeIdle' && (fromPanel || !sender.tab)) action = refreshPokeIdle().then(() => enqueue(message, sender));
  else if (message.type === 'pokeidleSnapshot') action = enqueue(message, sender).then(state => {
    if (state.accepted) void pollLiveWatch().catch(() => {});
    return state;
  });
  else if (message.type === 'configureTwitchChat') action = twitchChat.configure({ token: message.token }).then(() => pollLiveWatch()).then(() => enqueue({ type: 'status' }));
  else if (message.type === 'disconnectTwitchChat') action = twitchChat.disconnect({ forget: message.forget === true }).then(() => enqueue({ type: 'status' }));
  else if (message.type === 'watchNow') action = pollLiveWatch({ force: true }).then(() => enqueue({ type: 'status' }));
  else if (message.type === 'setLiveWatch') action = enqueue(message, sender).then(() => pollLiveWatch()).then(() => enqueue({ type: 'status' }));
  else if (['startAll', 'resumeAutomation', 'setPokeIdle'].includes(message.type)) action = enqueue(message, sender).then(state => needsLivePolling(state) ? pollLiveWatch().then(() => enqueue({ type: 'status' })) : state);
  else action = enqueue(message, sender);
  action.then(state => sendResponse({ ok: true, state }), error => sendResponse({ ok: false, error: message.type === 'configureTwitchChat' ? 'Não foi possível autenticar o chat Twitch. Confira o token e suas permissões.' : error.message }));
  return true;
});

let polling;
async function pollLiveWatch({ force = false } = {}) {
  if (polling) return polling;
  polling = (async () => {
    const raw = await api.storage.local.get(['channels', 'liveWatch', 'automationPaused', 'pokeidle', 'sessions']);
    const channels = Array.isArray(raw.channels) ? raw.channels : [];
    if (raw.automationPaused === true && !force) return;
    const watch = normalizeLiveWatch(raw.liveWatch, channels);
    const source = normalizePokeIdle(raw.pokeidle);
    const sourceIds = source.enabled ? channels.filter(item => item.platform === 'kick' && !pokeIdleExcluded(source, item.id)
      && ((pokeIdleFresh(source, Date.now()) && source.channels.some(entry => entry.platform === 'kick' && entry.name === item.name)) || raw.sessions?.[item.id]?.ownerIds?.includes(POKEIDLE_OWNER))).map(item => item.id) : [];
    const ids = [...new Set([...(watch.enabled ? watch.channelIds : []), ...sourceIds])];
    if (!ids.length) return;
    const state = { channels, liveWatch: { ...watch, enabled: true, channelIds: ids } };
    const statuses = await collectLiveWatch(state, twitchChat);
    if (watch.enabled) await enqueue({ type: 'liveWatchSnapshot', statuses });
    if (sourceIds.length) await enqueue({ type: 'pokeidleKickSnapshot', statuses });
  })();
  try { return await polling; }
  finally { polling = undefined; }
}

async function cycle() {
  await pollLiveWatch();
  await enqueue({ type: 'tick' });
}

async function refreshPokeIdle() {
  if (!api.tabs.query || !api.tabs.sendMessage) return;
  const tabs = (await api.tabs.query({ url: 'https://pokeidle.io/*' })).filter(tab => isPokeIdleUrl(tab.url));
  // Uma única origem basta; favorece a aba ativa quando houver mais de uma.
  const source = tabs.find(tab => tab.active) || tabs[0];
  if (!source) return;
  let timeout;
  try {
    await Promise.race([
      api.tabs.sendMessage(source.id, { type: 'requestPokeIdleSnapshot' }),
      new Promise(resolve => { timeout = setTimeout(resolve, 8000); })
    ]);
  } catch { /* O painel mostrará a última leitura e sua idade. */ }
  finally { clearTimeout(timeout); }
}

async function initialize() {
  if (api.alarms) {
    const existing = await api.alarms.get('chat-leve-tick');
    if (!existing) await api.alarms.create('chat-leve-tick', { delayInMinutes: 1, periodInMinutes: 1 });
  }
  await cycle();
}
api.alarms?.onAlarm.addListener(alarm => {
  if (alarm.name === 'chat-leve-tick') void cycle().catch(() => {});
});
api.runtime.onInstalled?.addListener(() => { void initialize().catch(() => {}); });
api.runtime.onStartup?.addListener(() => { void initialize().catch(() => {}); });
api.tabs.onRemoved?.addListener(tabId => { void enqueue({ type: 'tabRemoved', tabId }).catch(() => {}); });
api.notifications?.onClicked?.addListener(() => {
  void api.tabs.create({ url: api.runtime.getURL('popup.html'), active: true }).catch(() => {});
});
if (api.alarms) void initialize().catch(() => {});
