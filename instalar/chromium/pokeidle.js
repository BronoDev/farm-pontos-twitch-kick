const POKEIDLE_TWITCH_RESERVED = new Set(['directory', 'videos', 'settings', 'login', 'signup', 'popout', 'search', 'subscriptions', 'downloads', 'inventory', 'wallet', 'turbo', 'prime', 'jobs', 'products', 'friends', 'drops', 'activate']);

function pokeidleChannelLink(value) {
  try {
    if (typeof value !== 'string' || !/^https:\/\/(?:www\.)?twitch\.tv\/[a-z0-9_]{1,25}\/?$/i.test(value)) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['twitch.tv', 'www.twitch.tv'].includes(url.hostname)
      || url.username || url.password || url.port || url.search || url.hash) return null;
    const match = url.pathname.match(/^\/([a-zA-Z0-9_]{1,25})\/?$/);
    const name = match?.[1].toLowerCase();
    return name && !POKEIDLE_TWITCH_RESERVED.has(name) ? name : null;
  } catch { return null; }
}

// Lê somente a lista pública de canais do widget, sem executar o HTML nem seus botões.
function readPokeIdleTwitch(root) {
  const containers = root.matches?.('.tw-canais') ? [root] : [...root.querySelectorAll('.tw-canais')];
  const channels = [];
  const seen = new Set();
  let ruleText = '';
  for (const container of containers) {
    for (const anchor of container.querySelectorAll('a.tw-canal')) {
      const name = pokeidleChannelLink(anchor.getAttribute('href'));
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const label = anchor.querySelector('.tw-canal-nome')?.textContent || name;
      const displayName = label.replace(/\s+/g, ' ').trim().slice(0, 80) || name;
      channels.push({ name, displayName, live: anchor.classList.contains('ao-vivo'), bonus: anchor.classList.contains('com-bonus'), missing: anchor.classList.contains('tw-falta-eu') });
      if (!ruleText) {
        const title = anchor.querySelector('.tw-canal-bonus[title]')?.getAttribute('title');
        if (title) ruleText = title.replace(/\s+/g, ' ').trim().slice(0, 500);
      }
      if (channels.length === 100) return { ready: true, channels, ruleText };
    }
  }
  // Uma renderização vazia/ausente não é evidência de que todos os canais saíram do ar.
  return { ready: channels.length > 0, channels, ruleText };
}

(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  if (!api?.runtime || typeof document === 'undefined') return;
  const allowed = () => {
    try {
      const url = new URL(location.href);
      return url.origin === 'https://pokeidle.io' && /^\/app(?:\/|$)/.test(url.pathname);
    } catch { return false; }
  };
  if (!allowed()) return;
  const MIN_INTERVAL = 2000;
  const HEARTBEAT = 60000;
  const widgetObservers = new Map();
  const listeners = [];
  const pendingReplies = [];
  let rootObserver;
  let rootObserverTimeout;
  let snapshotTimer;
  let heartbeatTimer;
  let lastAttemptAt = 0;
  let lastSignature = '';
  let forcePending = false;
  let inFlight = false;
  let stopped = false;

  function reply(accepted, callbacks = pendingReplies.splice(0)) {
    for (const sendResponse of callbacks) {
      try { sendResponse({ accepted }); } catch { /* A aba solicitante pode ter sido fechada. */ }
    }
  }
  function cleanup() {
    stopped = true;
    rootObserver?.disconnect();
    for (const observer of widgetObservers.values()) observer.disconnect();
    widgetObservers.clear();
    clearTimeout(rootObserverTimeout);
    clearTimeout(snapshotTimer);
    clearInterval(heartbeatTimer);
    for (const [target, event, handler] of listeners) target.removeEventListener(event, handler);
    api.runtime.onMessage?.removeListener?.(onRuntimeMessage);
    reply(false);
  }
  function liveRoute() {
    if (!allowed()) { cleanup(); return false; }
    return !stopped;
  }
  function relevantMutation(mutation) {
    const element = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
    if (mutation.type === 'attributes') return element?.matches('a.tw-canal, .tw-canais, .tw-canal-bonus');
    if (mutation.type === 'characterData') return !!element?.closest('.tw-canal-nome');
    if (element?.closest('.tw-canal-nome')) return true;
    return [...mutation.addedNodes, ...mutation.removedNodes].some(node => node.nodeType === 1
      && (node.matches('a.tw-canal, .tw-canal-nome, .tw-canal-bonus, .tw-canais') || node.querySelector('a.tw-canal, .tw-canal-nome, .tw-canal-bonus, .tw-canais')));
  }
  function connectWidgets() {
    const widgets = [...document.querySelectorAll('.tw-canais')];
    for (const [widget, observer] of widgetObservers) if (!widget.isConnected) {
      observer.disconnect(); widgetObservers.delete(widget);
    }
    for (const widget of widgets) if (!widgetObservers.has(widget)) {
      const observer = new MutationObserver(mutations => {
        if (mutations.some(relevantMutation)) schedule(false, 700);
      });
      observer.observe(widget, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'href', 'title'] });
      widgetObservers.set(widget, observer);
    }
    if (widgets.length) {
      rootObserver?.disconnect();
      clearTimeout(rootObserverTimeout);
    }
    return widgets.length;
  }
  async function flush() {
    snapshotTimer = undefined;
    if (!liveRoute()) return;
    if (inFlight) { schedule(forcePending, MIN_INTERVAL); return; }
    connectWidgets();
    const snapshot = readPokeIdleTwitch(document);
    if (!snapshot.ready) { reply(false); return; }
    const signature = JSON.stringify(snapshot);
    const force = forcePending;
    forcePending = false;
    if (!force && signature === lastSignature) return;
    lastAttemptAt = Date.now();
    inFlight = true;
    const snapshotReplies = pendingReplies.splice(0);
    let accepted = false;
    try {
      const result = await api.runtime.sendMessage({ type: 'pokeidleSnapshot', snapshot });
      if (stopped) return;
      if (!result?.ok || result.state?.accepted !== true) { cleanup(); return; }
      lastSignature = signature;
      accepted = true;
    } catch { cleanup(); }
    finally { inFlight = false; reply(accepted, snapshotReplies); }
  }
  function schedule(force = false, debounce = 700) {
    if (!liveRoute()) return;
    forcePending ||= force;
    if (snapshotTimer !== undefined) return;
    const wait = Math.max(debounce, MIN_INTERVAL - (Date.now() - lastAttemptAt));
    snapshotTimer = setTimeout(() => { void flush(); }, wait);
  }
  function listen(target, event, handler) {
    target.addEventListener(event, handler);
    listeners.push([target, event, handler]);
  }
  if (!connectWidgets() && document.documentElement) {
    // Escuta a renderização SPA apenas no início; depois consulta a raiz no heartbeat.
    rootObserver = new MutationObserver(mutations => {
      if (mutations.some(mutation => [...mutation.addedNodes].some(node => node.nodeType === 1
        && (node.matches('.tw-canais') || node.querySelector('.tw-canais'))))) {
        if (connectWidgets()) schedule(false, 700);
      }
    });
    rootObserver.observe(document.documentElement, { childList: true, subtree: true });
    rootObserverTimeout = setTimeout(() => rootObserver.disconnect(), 30000);
  }
  heartbeatTimer = setInterval(() => { if (liveRoute()) { connectWidgets(); schedule(true, 0); } }, HEARTBEAT);
  listen(window, 'pagehide', cleanup);
  listen(window, 'popstate', () => { if (liveRoute()) { connectWidgets(); schedule(true, 700); } });
  listen(window, 'focus', () => { if (liveRoute()) { connectWidgets(); schedule(true, 700); } });
  listen(document, 'visibilitychange', () => { if (liveRoute() && !document.hidden) { connectWidgets(); schedule(true, 700); } });
  function onRuntimeMessage(message, sender, sendResponse) {
    if (message?.type !== 'requestPokeIdleSnapshot' || sender?.id !== api.runtime.id || !liveRoute()) return false;
    pendingReplies.push(sendResponse);
    connectWidgets(); schedule(true, 0);
    return true;
  }
  api.runtime.onMessage?.addListener(onRuntimeMessage);
  schedule(true, 0);
})();
