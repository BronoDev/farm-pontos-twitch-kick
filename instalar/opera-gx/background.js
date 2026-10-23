import { createController } from './core.js';

const api = globalThis.browser ?? globalThis.chrome;
const execute = createController(api);
// Serializa mensagens para evitar abas duplicadas e perda de atualizações.
let queue = Promise.resolve();
function enqueue(message, sender = {}) {
  const result = queue.then(() => execute(message, sender));
  queue = result.catch(() => {});
  return result;
}
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== api.runtime.id) return false;
  // No celular, o painel/opções pode rodar em uma aba da própria extensão.
  const fromPanel = sender.url === api.runtime.getURL('popup.html');
  if (sender.tab && !fromPanel && !['kickContext', 'kickTelemetry', 'sessionContext', 'sessionHealth'].includes(message.type)) return false;
  enqueue(message, sender).then(state => sendResponse({ ok: true, state }), error => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function initialize() {
  if (api.alarms) {
    const existing = await api.alarms.get('chat-leve-tick');
    if (!existing) await api.alarms.create('chat-leve-tick', { delayInMinutes: 1, periodInMinutes: 1 });
  }
  await enqueue({ type: 'tick' });
}
api.alarms?.onAlarm.addListener(alarm => {
  if (alarm.name === 'chat-leve-tick') void enqueue({ type: 'tick' }).catch(() => {});
});
api.runtime.onInstalled?.addListener(() => { void initialize().catch(() => {}); });
api.runtime.onStartup?.addListener(() => { void initialize().catch(() => {}); });
api.tabs.onRemoved?.addListener(tabId => { void enqueue({ type: 'tabRemoved', tabId }).catch(() => {}); });
api.notifications?.onClicked?.addListener(() => {
  void api.tabs.create({ url: api.runtime.getURL('popup.html'), active: true }).catch(() => {});
});
if (api.alarms) void initialize().catch(() => {});
