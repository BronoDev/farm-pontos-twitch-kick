import { createController } from './core.js';
import { isPokeIdleUrl } from './pokeidle-state.js';

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
  if (sender.tab && !fromPanel && !['kickContext', 'kickTelemetry', 'playerContext', 'playerTelemetry', 'sessionContext', 'sessionHealth', 'pokeidleSnapshot'].includes(message.type)) return false;
  // A leitura envia uma segunda mensagem ao controller. Aguarde-a fora da fila
  // para que a resposta do content script não dependa da própria operação bloqueada.
  const action = message.type === 'refreshPokeIdle' && (fromPanel || !sender.tab)
    ? refreshPokeIdle().then(() => enqueue(message, sender)) : enqueue(message, sender);
  action.then(state => sendResponse({ ok: true, state }), error => sendResponse({ ok: false, error: error.message }));
  return true;
});

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
