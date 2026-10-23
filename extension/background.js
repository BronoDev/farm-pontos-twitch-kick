import { createController } from './core.js';

const execute = createController(chrome);
// Serializa mensagens para evitar pop-ups duplicados e perda de atualizações.
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  queue = queue.then(() => execute(message));
  queue.then(state => sendResponse({ ok: true, state }), error => sendResponse({ ok: false, error: error.message }));
  queue = queue.catch(() => {});
  return true;
});
