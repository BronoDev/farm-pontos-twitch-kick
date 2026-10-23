/* global qualityOptions, playerButton */
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  if (!api?.runtime) return;
  let stopped = false;
  let video;
  let targetHeight = 0;
  let qualityStatus = 'pending';
  let reportTimer;
  const originalUrl = location.href;
  const timers = new Set();
  const listeners = [];
  const delay = ms => new Promise(resolve => {
    const timer = setTimeout(() => { timers.delete(timer); resolve(); }, ms);
    timers.add(timer);
  });
  async function send(type, extra = {}) {
    try { return (await api.runtime.sendMessage({ type, ...extra }))?.state; }
    catch { stopped = true; return null; }
  }
  function report() {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(async () => {
      if (stopped || location.href !== originalUrl) { cleanup(); return; }
      const result = await send('kickTelemetry', { sample: {
        playing: !!video && !video.paused && !video.ended && video.readyState >= 3,
        error: !!video?.error,
        height: video?.videoHeight || 0,
        targetHeight,
        qualityStatus
      } });
      if (result && !result.managed) cleanup();
    }, 300);
  }
  function attachVideo() {
    if (location.href !== originalUrl) { cleanup(); return; }
    const candidate = document.querySelector('video');
    if (!candidate || candidate === video || stopped) return;
    for (const [element, event, handler] of listeners.splice(0)) element.removeEventListener(event, handler);
    video = candidate;
    targetHeight = 0;
    qualityStatus = 'pending';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    for (const event of ['playing', 'pause', 'waiting', 'ended', 'error', 'loadedmetadata', 'resize']) {
      const handler = () => {
        if (event === 'playing' && qualityStatus === 'autoplay-blocked') qualityStatus = targetHeight ? 'requested' : 'pending';
        report();
      };
      video.addEventListener(event, handler);
      listeners.push([video, event, handler]);
    }
    // Não falsifica visibilidade, reprodução ou audiência. O navegador pode negar autoplay.
    void video.play().then(report).catch(() => { qualityStatus = 'autoplay-blocked'; report(); });
    report();
  }
  async function lowerQuality() {
    if (location.href !== originalUrl) { cleanup(); return; }
    if (stopped || targetHeight || !video) return;
    // Procura apenas controles do player e seus menus; não altera APIs privadas.
    const root = video.closest('[data-player], .video-js, [data-testid*="player"], [class*="player-container"]') || video.parentElement?.parentElement || document.body;
    let options = qualityOptions(document);
    if (!options.length) {
      const quality = playerButton(root, 'quality');
      const settings = playerButton(root, 'settings');
      (quality || settings)?.click();
      await delay(200);
      if (stopped || location.href !== originalUrl) { cleanup(); return; }
      options = qualityOptions(document);
      if (!options.length) {
        playerButton(document, 'quality')?.click();
        await delay(200);
        if (stopped || location.href !== originalUrl) { cleanup(); return; }
        options = qualityOptions(document);
      }
    }
    if (options.length) {
      // Seleciona a menor variante oferecida. Diminuir CSS não reduz o stream.
      const lowest = options[0];
      lowest.element.click();
      targetHeight = lowest.height;
      if (qualityStatus !== 'autoplay-blocked') qualityStatus = 'requested';
    } else if (qualityStatus !== 'autoplay-blocked') qualityStatus = 'unavailable';
    report();
  }
  function cleanup() {
    stopped = true;
    clearTimeout(reportTimer);
    for (const timer of timers) clearTimeout(timer);
    for (const [element, event, handler] of listeners) element.removeEventListener(event, handler);
  }
  async function run() {
    // A aba pode carregar antes de o controlador terminar de salvar sua identificação.
    let managed = false;
    for (let attempt = 0; attempt < 5 && !stopped; attempt++) {
      if ((await send('kickContext'))?.managed) { managed = true; break; }
      await delay(500);
    }
    if (!managed || stopped) return;
    attachVideo();
    // Janela de inicialização limitada; sem loop permanente de autoplay ou de cliques.
    for (const interval of [0, 1000, 3000, 6000, 10000, 15000]) {
      await delay(interval);
      if (stopped) return;
      attachVideo();
      await lowerQuality();
      if (targetHeight) break;
    }
    if (!targetHeight && qualityStatus !== 'autoplay-blocked') qualityStatus = 'unavailable';
    report();
  }
  window.addEventListener('pagehide', cleanup, { once: true });
  void run();
})();
