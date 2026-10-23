// Os marcadores são evidências locais de interface, não autenticação no servidor.
function healthVisible(element) {
  if (!element || element.hidden || element.getAttribute('aria-hidden') === 'true'
    || element.closest?.('[hidden], [aria-hidden="true"], [inert]')
    || !element.getClientRects().length) return false;
  const style = globalThis.getComputedStyle?.(element);
  return !style || (style.display !== 'none' && !['hidden', 'collapse'].includes(style.visibility) && style.opacity !== '0');
}

function healthMarker(root, selectors) {
  return selectors.some(selector => [...root.querySelectorAll(selector)].some(healthVisible));
}

function readSiteHealth(root, online) {
  const signedIn = healthMarker(root, [
    '[data-a-target="user-menu-toggle"]',
    '[data-testid="user-menu-toggle"]',
    '[data-testid="user-menu-button"]',
    '[data-testid="account-menu-button"]',
    'button[aria-label="User Menu"]',
    'button[aria-label="Menu do usuário"]'
  ]);
  const signedOut = healthMarker(root, [
    '[data-a-target="login-button"]',
    '[data-testid="login-button"]',
    'button[name="login"]',
    'a[href="/login"]'
  ]);
  const disconnected = healthMarker(root, [
    '[data-a-target="chat-disconnected"]',
    '[data-testid="chat-disconnected"]',
    '[data-testid="connection-error"]',
    '[data-testid="chat-connection-status"][data-state="disconnected"]'
  ]);
  const connected = healthMarker(root, [
    '[data-a-target="chat-connected"]',
    '[data-testid="chat-connection-status"][data-state="connected"]'
  ]);
  const offline = healthMarker(root, [
    '[data-a-target="offline-channel-main-content"]',
    '[data-testid="channel-offline"]',
    '[data-testid="offline-channel"]'
  ]);
  const live = healthMarker(root, [
    '[data-a-target="live-indicator"]',
    '[data-testid="live-indicator"]'
  ]);
  const video = root.querySelector('video');
  return {
    login: signedIn === signedOut ? 'unknown' : signedIn ? 'signed-in' : 'signed-out',
    // navigator.onLine=true só indica a rede local, não a conexão com Twitch/Kick.
    connection: online === false || disconnected ? 'offline' : connected ? 'online' : 'unknown',
    live: live === offline ? 'unknown' : offline ? 'offline' : 'live',
    playbackError: !!video?.error
  };
}

(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  if (!api?.runtime) return;
  const originalUrl = location.href;
  const timers = new Set();
  const listeners = [];
  let managed = false;
  let stopped = false;
  let debounce;
  const delay = milliseconds => new Promise(resolve => {
    const timer = setTimeout(() => { timers.delete(timer); resolve(); }, milliseconds);
    timers.add(timer);
  });
  function cleanup() {
    stopped = true;
    managed = false;
    clearTimeout(debounce);
    for (const timer of timers) clearTimeout(timer);
    for (const [element, type, listener] of listeners) element.removeEventListener(type, listener);
  }
  async function send(type, extra = {}) {
    try { return (await api.runtime.sendMessage({ type, ...extra }))?.state; }
    catch { cleanup(); return null; }
  }
  async function sampleNow() {
    if (stopped || !managed) return;
    if (location.href !== originalUrl) { cleanup(); return; }
    const sample = readSiteHealth(document, navigator.onLine);
    const result = await send('sessionHealth', { sample });
    if (result && !result.managed) cleanup();
  }
  function scheduleSample() {
    clearTimeout(debounce);
    debounce = setTimeout(() => { void sampleNow(); }, 250);
  }
  function listen(element, type, listener) {
    element.addEventListener(type, listener);
    listeners.push([element, type, listener]);
  }
  api.runtime.onMessage?.addListener((message, sender, sendResponse) => {
    if (message.type !== 'requestSessionHealth' || sender.id !== api.runtime.id || !managed || stopped) return false;
    sampleNow().then(() => sendResponse({ ok: !stopped }), () => sendResponse({ ok: false }));
    return true;
  });
  async function run() {
    for (let attempt = 0; attempt < 5 && !stopped; attempt++) {
      if ((await send('sessionContext'))?.managed) { managed = true; break; }
      await delay(500);
    }
    if (!managed || stopped) return;
    listen(window, 'online', scheduleSample);
    listen(window, 'offline', scheduleSample);
    listen(window, 'focus', scheduleSample);
    listen(document, 'visibilitychange', () => {
      if (document.visibilityState === 'visible') scheduleSample();
    });
    // Não observa mensagens de chat nem mantém um intervalo permanente de consulta.
    for (const interval of [0, 1000, 4000, 10000, 20000]) {
      await delay(interval);
      if (stopped) return;
      await sampleNow();
    }
  }
  window.addEventListener('pagehide', cleanup, { once: true });
  void run();
})();
