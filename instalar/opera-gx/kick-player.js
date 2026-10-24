/* global qualityOptions, playerButton */
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  if (!api?.runtime) return;
  const originalUrl = location.href;
  const PLAYER_ROOT = '[data-a-target="video-player"], [data-test-selector="video-player__video-container"], [data-player], .video-js, [data-testid*="player"], [class*="player-container"]';
  const TWITCH_MENUS = '[data-a-target="player-settings-menu"], [data-a-target="player-settings-submenu-quality"]';
  const MAX_REPLACEMENTS = 3;
  const delays = new Map();
  const videoListeners = [];
  const trustedPortals = new Set();
  let stopped = false;
  let managed = false;
  let video;
  let playerRoot;
  let playerObserver;
  let refreshTimer;
  let reportTimer;
  let generation = 0;
  let replacements = 0;
  let attachedBefore = false;
  let pauseObserved = false;
  let targetHeight = 0;
  let qualityStatus = 'pending';
  let qualityBusy = false;
  const samePage = () => !stopped && location.href === originalUrl;
  const delay = ms => new Promise(resolve => {
    const timer = setTimeout(() => { delays.delete(timer); resolve(); }, ms);
    delays.set(timer, resolve);
  });
  const visible = node => node?.isConnected && !node.hidden && !node.closest('[hidden], [aria-hidden="true"], [inert]') && node.getClientRects().length > 0;
  function clearVideoListeners() {
    for (const [element, event, handler] of videoListeners.splice(0)) element.removeEventListener(event, handler);
  }
  function cleanup() {
    stopped = true;
    managed = false;
    generation++;
    clearTimeout(reportTimer);
    clearTimeout(refreshTimer);
    for (const [timer, resolve] of delays) { clearTimeout(timer); resolve(); }
    delays.clear();
    playerObserver?.disconnect();
    clearVideoListeners();
    trustedPortals.clear();
    api.runtime.onMessage?.removeListener?.(onMessage);
    window.removeEventListener('popstate', routeChanged);
    window.removeEventListener('hashchange', routeChanged);
    window.removeEventListener('pagehide', cleanup);
  }
  async function send(type, extra = {}) {
    try { return (await api.runtime.sendMessage({ type, ...extra }))?.state; }
    catch { cleanup(); return null; }
  }
  function report() {
    if (!samePage()) { cleanup(); return; }
    clearTimeout(reportTimer);
    reportTimer = setTimeout(async () => {
      if (!samePage()) { cleanup(); return; }
      const attached = video?.isConnected === true;
      const result = await send('playerTelemetry', { sample: {
        playing: attached && !video.paused && !video.ended && video.readyState >= 3,
        error: attached && !!video.error,
        height: attached ? video.videoHeight || 0 : 0,
        targetHeight,
        qualityStatus
      } });
      if (result && !result.managed) cleanup();
    }, 300);
  }
  function routeChanged() { if (!samePage()) cleanup(); }
  function rootFor(candidate) {
    const root = candidate.closest(PLAYER_ROOT) || candidate.parentElement;
    return root && root !== document.body && root !== document.documentElement ? root : null;
  }
  function candidateVideo() {
    return document.querySelector('[data-a-target="video-player"] video')
      || document.querySelector('[data-test-selector="video-player__video-container"] video')
      || document.querySelector('[data-player] video') || document.querySelector('video');
  }
  function observeRoot(root) {
    if (playerRoot === root && playerObserver) return;
    playerObserver?.disconnect();
    playerRoot = root;
    if (!root || replacements >= MAX_REPLACEMENTS) return;
    playerObserver = new MutationObserver(mutations => {
      if (!samePage()) { cleanup(); return; }
      const changed = mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes].some(node =>
        node.nodeType === 1 && (node.matches('video') || node.querySelector('video'))));
      if (!changed) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (!samePage()) { cleanup(); return; }
        if (video && !video.isConnected) { clearVideoListeners(); video = undefined; generation++; targetHeight = 0; report(); }
        attachVideo();
      }, 150);
    });
    // Somente o container do player: não observa mensagens ou a página inteira.
    playerObserver.observe(root, { childList: true, subtree: true });
  }
  function attachVideo() {
    if (!samePage()) { cleanup(); return false; }
    const candidate = candidateVideo();
    if (!candidate || candidate === video) return false;
    if (attachedBefore && replacements >= MAX_REPLACEMENTS) return false;
    if (attachedBefore) replacements++;
    attachedBefore = true;
    clearVideoListeners();
    video = candidate;
    const token = ++generation;
    trustedPortals.clear();
    targetHeight = 0;
    qualityStatus = 'pending';
    observeRoot(rootFor(video));
    if (replacements >= MAX_REPLACEMENTS) playerObserver?.disconnect();
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    for (const event of ['playing', 'pause', 'waiting', 'ended', 'error', 'loadedmetadata', 'resize']) {
      const handler = () => {
        if (event === 'pause' && !candidate.ended) pauseObserved = true;
        if (event === 'playing') {
          pauseObserved = false;
          if (qualityStatus === 'autoplay-blocked') qualityStatus = targetHeight ? 'requested' : 'pending';
        }
        report();
      };
      video.addEventListener(event, handler);
      videoListeners.push([video, event, handler]);
    }
    // Uma pausa observada é preservada mesmo se o site trocar o elemento de vídeo.
    if (!pauseObserved) void video.play().then(() => {
      if (token === generation) report();
    }).catch(() => {
      if (token === generation && samePage()) { qualityStatus = 'autoplay-blocked'; report(); }
    });
    report();
    void initializeQuality(token);
    return true;
  }
  function scopes(root, controls) {
    const result = new Set(root ? [root] : []);
    for (const control of controls) {
      for (const id of (control?.getAttribute('aria-controls') || '').split(/\s+/).slice(0, 8)) {
        const menu = id && document.getElementById(id);
        if (menu && menu !== document.body && menu !== document.documentElement && visible(menu)) result.add(menu);
      }
    }
    for (const menu of trustedPortals) if (visible(menu)) result.add(menu);
    return [...result];
  }
  const optionsIn = roots => roots.flatMap(root => qualityOptions(root)).sort((a, b) => a.height - b.height);
  const buttonIn = (roots, kind) => roots.map(root => playerButton(root, kind)).find(Boolean);
  async function lowerQuality(token) {
    if (!samePage()) { cleanup(); return; }
    if (qualityBusy || token !== generation || targetHeight || !video?.isConnected || !playerRoot) return;
    qualityBusy = true;
    const root = playerRoot;
    const controls = [...root.querySelectorAll('[aria-controls]')];
    const opened = [];
    const visibleBefore = new Set([...document.querySelectorAll(TWITCH_MENUS)].filter(visible));
    const valid = () => samePage() && token === generation && video?.isConnected && root === playerRoot;
    async function open(control) {
      if (!control || !valid()) return;
      controls.push(control);
      // Não fecha um menu que o usuário já tinha aberto.
      if (control.getAttribute('aria-expanded') !== 'true') {
        const wasClosed = control.getAttribute('aria-expanded') === 'false';
        control.click();
        if (wasClosed) opened.push(control);
      }
      await delay(200);
      if (!valid()) return;
      for (const menu of document.querySelectorAll(TWITCH_MENUS)) {
        if (!visibleBefore.has(menu) && visible(menu)) trustedPortals.add(menu);
      }
    }
    try {
      let roots = scopes(root, controls);
      let options = optionsIn(roots);
      if (!options.length) {
        const quality = buttonIn(roots, 'quality');
        await open(quality || playerButton(root, 'settings'));
        if (!valid()) return;
        roots = scopes(root, controls);
        options = optionsIn(roots);
        if (!options.length) {
          await open(buttonIn(roots, 'quality'));
          if (!valid()) return;
          options = optionsIn(scopes(root, controls));
        }
      }
      if (options.length) {
        // Seleciona só uma variante oferecida no player, nunca um botão da página.
        options[0].element.click();
        targetHeight = options[0].height;
        if (qualityStatus !== 'autoplay-blocked') qualityStatus = 'requested';
      } else {
        if (qualityStatus !== 'autoplay-blocked') qualityStatus = 'unavailable';
        // Só desfaz menus com estado ARIA conhecido que este script abriu.
        for (const control of opened.reverse()) if (valid() && control.isConnected && control.getAttribute('aria-expanded') === 'true') control.click();
      }
      report();
    } catch {
      if (valid()) { qualityStatus = 'unavailable'; report(); }
    } finally { qualityBusy = false; }
  }
  async function initializeQuality(token) {
    for (const interval of [0, 1000, 3000, 6000, 10000, 15000]) {
      await delay(interval);
      if (!samePage() || token !== generation) return;
      await lowerQuality(token);
      if (targetHeight) break;
    }
    if (token === generation && samePage()) {
      if (!targetHeight && qualityStatus !== 'autoplay-blocked') qualityStatus = 'unavailable';
      report();
    }
  }
  async function run() {
    for (let attempt = 0; attempt < 5 && samePage(); attempt++) {
      if ((await send('playerContext'))?.managed) { managed = true; break; }
      await delay(500);
    }
    if (!managed || !samePage()) return;
    // Descoberta inicial limitada. As trocas posteriores são eventos do container.
    for (const interval of [0, 1000, 3000, 6000, 10000, 15000]) {
      await delay(interval);
      if (!samePage()) return;
      if (video || attachVideo()) return;
    }
    qualityStatus = 'unavailable'; report();
  }
  function onMessage(message, sender, sendResponse) {
    if (message?.type !== 'requestPlayerTelemetry' || sender?.id !== api.runtime.id || stopped || !managed) return false;
    if (!samePage()) { cleanup(); return false; }
    report(); sendResponse({ ok: true }); return false;
  }
  api.runtime.onMessage?.addListener(onMessage);
  window.addEventListener('pagehide', cleanup, { once: true });
  window.addEventListener('popstate', routeChanged);
  window.addEventListener('hashchange', routeChanged);
  void run();
})();
