const POKEIDLE_TWITCH_RESERVED = new Set(['directory', 'videos', 'settings', 'login', 'signup', 'popout', 'search', 'subscriptions', 'downloads', 'inventory', 'wallet', 'turbo', 'prime', 'jobs', 'products', 'friends', 'drops', 'activate']);
const POKEIDLE_KICK_RESERVED = new Set(['directory', 'browse', 'search', 'categories', 'category', 'following', 'featured', 'videos', 'clips', 'settings', 'login', 'signup', 'register', 'popout', 'subscriptions', 'downloads', 'wallet', 'jobs', 'activate', 'dashboard', 'profile', 'account', 'auth', 'transactions', 'about', 'support', 'help', 'contact', 'security', 'ads', 'advertise', 'gift', 'rewards', 'livestreams', 'terms-of-service', 'privacy-policy', 'community-guidelines', 'dmca-policy']);
const POKEIDLE_WIDGET_SELECTOR = '.tw-canais, .kick-canais, .kc-canais, .k-canais';

function pokeidleChannelLink(value) {
  try {
    // Valide o texto antes de URL(): a normalização não pode esconder traversal,
    // credenciais, caracteres de controle ou uma origem que pareça ser a plataforma.
    if (typeof value !== 'string' || /[\u0000-\u0020\\]/.test(value)) return null;
    const twitch = /^https:\/\/(?:www\.)?twitch\.tv\/[a-z0-9_]{1,25}\/?$/i.test(value);
    const kick = /^https:\/\/(?:www\.)?kick\.com\/[a-z0-9_][a-z0-9_-]{0,39}\/?$/i.test(value);
    if (!twitch && !kick) return null;
    const url = new URL(value);
    if (url.username || url.password || url.port || url.search || url.hash) return null;
    const platform = twitch ? 'twitch' : 'kick';
    const name = url.pathname.replace(/^\/|\/$/g, '').toLowerCase();
    const reserved = twitch ? POKEIDLE_TWITCH_RESERVED : POKEIDLE_KICK_RESERVED;
    return name && !reserved.has(name) ? { platform, name } : null;
  } catch { return null; }
}

// As classes comprovadas no HTML fornecido pertencem ao widget .tw-canais.
// Um link Kick em outra parte da página informa o canal, não seu status ou bônus.
export function readPokeIdleChannels(root) {
  const containers = root.matches?.('.tw-canais') ? [root] : [...root.querySelectorAll('.tw-canais')];
  const channels = [];
  const seen = new Set();
  let ruleText = '';
  function append(anchor, knownWidget) {
    const target = pokeidleChannelLink(anchor.getAttribute('href'));
    if (!target || (!knownWidget && target.platform !== 'kick')) return;
    const id = `${target.platform}:${target.name}`;
    if (seen.has(id) || channels.length >= 100) return;
    seen.add(id);
    const label = knownWidget ? anchor.querySelector('.tw-canal-nome')?.textContent : target.name;
    const displayName = (label || target.name).replace(/\s+/g, ' ').trim().slice(0, 80) || target.name;
    channels.push({ ...target, displayName,
      live: knownWidget ? anchor.classList.contains('ao-vivo') : null,
      bonus: knownWidget && anchor.classList.contains('com-bonus'),
      missing: knownWidget && anchor.classList.contains('tw-falta-eu'), source: knownWidget ? 'widget' : 'link' });
    if (!ruleText && knownWidget && target.platform === 'twitch') {
      const title = anchor.querySelector('.tw-canal-bonus[title]')?.getAttribute('title');
      if (title) ruleText = title.replace(/\s+/g, ' ').trim().slice(0, 500);
    }
  }
  for (const container of containers) for (const anchor of container.querySelectorAll('a.tw-canal')) append(anchor, true);
  // A página real pode usar um widget Kick diferente. Sem HTML desse widget,
  // importamos somente links canônicos e deixamos a consulta de live ao monitor.
  for (const anchor of root.querySelectorAll('a[href]')) append(anchor, false);
  return { ready: channels.length > 0, channels, ruleText };
}

// Compatibilidade com os consumidores existentes; a lista agora inclui plataforma.
export function readPokeIdleTwitch(root) { return readPokeIdleChannels(root); }

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
    // Também note href/classe removidos: validar apenas o valor novo perderia
    // um link Kick que acabou de virar inválido. A observação já é do widget.
    if (mutation.type === 'attributes') return element?.matches('a, .tw-canais, .tw-canal-bonus');
    if (mutation.type === 'characterData') return !!element?.closest('.tw-canal-nome');
    if (element?.closest('.tw-canal-nome')) return true;
    return [...mutation.addedNodes, ...mutation.removedNodes].some(containsChannelNodes);
  }
  function containsChannelNodes(node) {
    if (node.nodeType !== 1) return false;
    if (node.matches(POKEIDLE_WIDGET_SELECTOR + ', a.tw-canal, .tw-canal-nome, .tw-canal-bonus') || node.querySelector(POKEIDLE_WIDGET_SELECTOR + ', a.tw-canal, .tw-canal-nome, .tw-canal-bonus')) return true;
    const anchors = node.matches('a[href]') ? [node] : [...node.querySelectorAll('a[href]')];
    return anchors.some(anchor => pokeidleChannelLink(anchor.getAttribute('href'))?.platform === 'kick');
  }
  function connectWidgets() {
    // Nomes de containers apenas restringem a observação; não conferem status.
    const widgets = [...document.querySelectorAll(POKEIDLE_WIDGET_SELECTOR)];
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
    const snapshot = readPokeIdleChannels(document);
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
      if (mutations.some(mutation => [...mutation.addedNodes].some(containsChannelNodes))) {
        connectWidgets(); schedule(false, 700);
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
