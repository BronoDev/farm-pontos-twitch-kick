
const api = globalThis.browser ?? globalThis.chrome;
const execute = createController(api);
// Serializa mensagens para evitar pop-ups duplicados e perda de atualizações.
let queue = Promise.resolve();
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== api.runtime.id) return false;
  queue = queue.then(() => execute(message));
  queue.then(state => sendResponse({ ok: true, state }), error => sendResponse({ ok: false, error: error.message }));
  queue = queue.catch(() => {});
  return true;
});
