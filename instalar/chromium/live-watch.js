export const LIVE_WATCH_OWNER = 'live-watch';
export const LIVE_WATCH_FRESH_MS = 180000;
const KICK_QUERY_ERROR_CODES = new Set(['forbidden', 'rate-limited', 'unavailable', 'invalid-response']);

export function normalizeLiveWatch(raw, channels) {
  const valid = new Set(channels.map(item => item.id));
  raw = raw && typeof raw === 'object' ? raw : {};
  const channelIds = Array.isArray(raw.channelIds) ? [...new Set(raw.channelIds.filter(id => valid.has(id)))].slice(0, 100) : [];
  const statuses = {};
  for (const id of channelIds) {
    const entry = raw.statuses?.[id];
    if (!entry || !Number.isFinite(entry.checkedAt) || entry.checkedAt <= 0) continue;
    statuses[id] = { live: typeof entry.live === 'boolean' ? entry.live : null, checkedAt: entry.checkedAt };
    if (id.startsWith('kick:')) {
      if (KICK_QUERY_ERROR_CODES.has(entry.errorCode)) statuses[id].errorCode = entry.errorCode;
      if (Number.isFinite(entry.nextRetryAt) && entry.nextRetryAt >= entry.checkedAt) statuses[id].nextRetryAt = Math.min(entry.nextRetryAt, entry.checkedAt + 600000);
      if (Number.isInteger(entry.attempts) && entry.attempts > 0) statuses[id].attempts = Math.min(entry.attempts, 1000);
    }
  }
  return { enabled: raw.enabled === true, twitchMode: raw.twitchMode === 'irc' ? 'irc' : 'chat', channelIds, statuses, lastCheckedAt: Number.isFinite(raw.lastCheckedAt) && raw.lastCheckedAt > 0 ? raw.lastCheckedAt : null };
}

export function watchEligible(state, id, now) {
  const watch = state.liveWatch;
  if (watch.enabled && watch.twitchMode !== 'irc' && id.startsWith('twitch:') && watch.channelIds.includes(id)) return true;
  const sample = watch.statuses[id];
  return watch.enabled && watch.channelIds.includes(id) && sample?.live === true && now >= sample.checkedAt && now - sample.checkedAt <= LIVE_WATCH_FRESH_MS;
}

export function publicTwitchChat(raw) {
  const channels = {};
  for (const [name, value] of Object.entries(raw?.channels || {}).slice(0, 100)) {
    if (!/^[a-z0-9_]{1,25}$/.test(name)) continue;
    channels[name] = { joined: value?.joined === true, requested: value?.requested === true };
  }
  return { configured: raw?.configured === true, login: typeof raw?.login === 'string' && /^[a-z0-9_]{1,25}$/.test(raw.login) ? raw.login : '',
    connected: raw?.connected === true, channels, error: raw?.error ? 'Confira a autenticação e a conexão do chat Twitch.' : '' };
}

export function kickLiveFromResponse(value) {
  if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'livestream')) return null;
  if (value.livestream === null) return false;
  const live = value.livestream;
  return live && !Array.isArray(live) && Number.isInteger(live.id) && live.id > 0 ? live.is_live !== false : null;
}

// Uma fábrica compartilhada evita consultas duplicadas entre o monitor e o PokeIdle.
// O resultado mantém a hora da consulta real, inclusive ao sair do cache.
export function createKickQueries(options = {}) {
  const fetcher = options.fetch ?? globalThis.fetch?.bind(globalThis);
  const clock = options.now ?? (() => Date.now());
  const later = options.setTimeout ?? globalThis.setTimeout;
  const cancel = options.clearTimeout ?? globalThis.clearTimeout;
  const Abort = options.AbortController ?? globalThis.AbortController;
  const cache = new Map();
  const pending = new Map();
  const queue = [];
  let active = 0;

  function normalizeSample(value) {
    if (!value || !Number.isFinite(value.checkedAt) || value.checkedAt <= 0) return null;
    const sample = { live: typeof value.live === 'boolean' ? value.live : null, checkedAt: value.checkedAt };
    if (KICK_QUERY_ERROR_CODES.has(value.errorCode)) sample.errorCode = value.errorCode;
    if (Number.isFinite(value.nextRetryAt) && value.nextRetryAt >= value.checkedAt) sample.nextRetryAt = Math.min(value.nextRetryAt, value.checkedAt + 600000);
    if (Number.isInteger(value.attempts) && value.attempts > 0) sample.attempts = Math.min(value.attempts, 1000);
    return sample;
  }
  function validItem(item) {
    if (!item || item.platform !== 'kick' || typeof item.name !== 'string') return null;
    const name = item.name.toLowerCase();
    return /^[a-z0-9_][a-z0-9_-]{0,39}$/.test(name) && item.id === `kick:${name}` ? { id: item.id, name } : null;
  }
  function save(id, sample) {
    cache.delete(id);
    cache.set(id, sample);
    while (cache.size > 200) cache.delete(cache.keys().next().value);
    return sample;
  }
  function seed(samples) {
    for (const [id, value] of Object.entries(samples && typeof samples === 'object' ? samples : {}).slice(0, 200)) {
      if (!/^kick:[a-z0-9_][a-z0-9_-]{0,39}$/.test(id)) continue;
      const sample = normalizeSample(value);
      if (!sample || sample.checkedAt > clock() || (cache.get(id)?.checkedAt ?? 0) >= sample.checkedAt) continue;
      save(id, sample);
    }
  }
  function retryDelay(response, stamp) {
    let value;
    try { value = response.headers?.get?.('retry-after'); } catch { /* Cabeçalho indisponível. */ }
    const raw = typeof value === 'string' ? value.trim() : '';
    const seconds = /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) * 1000 : NaN;
    const delay = Number.isFinite(seconds) ? seconds : raw ? Date.parse(raw) - stamp : NaN;
    return Math.max(60000, Math.min(600000, Number.isFinite(delay) ? delay : 60000));
  }
  async function request(item) {
    let timeout;
    const abort = Abort ? new Abort() : null;
    let result;
    try {
      result = await Promise.race([
        (async () => {
          if (!fetcher) throw new Error('network-unavailable');
          const response = await fetcher(`https://kick.com/api/v2/channels/${encodeURIComponent(item.name)}`, {
            method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', ...(abort ? { signal: abort.signal } : {})
          });
          if (!response.ok) return { response, code: response.status === 403 ? 'forbidden' : response.status === 429 ? 'rate-limited' : 'unavailable' };
          const live = kickLiveFromResponse(await response.json());
          return live === null ? { code: 'invalid-response' } : { live };
        })(),
        new Promise((_, reject) => { timeout = later(() => { abort?.abort(); reject(new Error('timeout')); }, 8000); })
      ]);
    } catch { result = { code: 'unavailable' }; }
    finally { if (timeout !== undefined) cancel(timeout); }
    const checkedAt = clock();
    if (typeof result.live === 'boolean') return save(item.id, { live: result.live, checkedAt });
    const attempts = (cache.get(item.id)?.attempts || 0) + 1;
    const delay = result.code === 'forbidden' ? 300000 : result.code === 'rate-limited' ? retryDelay(result.response, checkedAt) : 60000;
    return save(item.id, { live: null, checkedAt, errorCode: result.code, nextRetryAt: checkedAt + delay, attempts: Math.min(attempts, 1000) });
  }
  function pump() {
    while (active < 3 && queue.length) {
      const job = queue.shift();
      active++;
      void request(job.item).then(job.resolve, () => job.resolve(save(job.item.id, { live: null, checkedAt: clock(), errorCode: 'unavailable', nextRetryAt: clock() + 60000 }))).finally(() => {
        active--;
        pending.delete(job.item.id);
        pump();
      });
    }
  }
  function query(item, force) {
    if (pending.has(item.id)) return pending.get(item.id);
    const sample = cache.get(item.id);
    const stamp = clock();
    if (sample && stamp >= sample.checkedAt && ((sample.nextRetryAt && stamp < sample.nextRetryAt) || (!force && !sample.errorCode && stamp - sample.checkedAt < 60000))) return Promise.resolve(sample);
    const promise = new Promise(resolve => { queue.push({ item, resolve }); });
    pending.set(item.id, promise);
    pump();
    return promise;
  }
  seed(options.initialSamples);
  return {
    seed,
    snapshot: () => Object.fromEntries([...cache].map(([id, value]) => [id, { ...value }])),
    collect: async (items, settings = {}) => {
      const unique = new Map();
      for (const value of Array.isArray(items) ? items.slice(0, 200) : []) {
        const item = validItem(value);
        if (item) unique.set(item.id, item);
        if (unique.size === 100) break;
      }
      return Object.fromEntries(await Promise.all([...unique.values()].map(async item => [item.id, { ...await query(item, settings.force === true) }])));
    }
  };
}

export async function collectLiveWatch(state, twitchChat, options = {}) {
  if (!state.liveWatch?.enabled) return {};
  const selected = state.channels.filter(item => state.liveWatch.channelIds.includes(item.id));
  const statuses = {};
  const kick = selected.filter(item => item.platform === 'kick');
  const queries = options.kickQueries || createKickQueries(options);
  const samples = await queries.collect(kick, { force: options.force === true });
  for (const item of kick) {
    const sample = samples[item.id];
    statuses[item.id] = typeof sample?.live === 'boolean' ? sample.live : null;
    if (sample && typeof options.onKickResult === 'function') options.onKickResult(item.id, { ...sample });
  }
  const twitch = selected.filter(item => item.platform === 'twitch');
  let live = {};
  try { if (twitch.length && state.liveWatch.twitchMode === 'irc' && twitchChat) live = await twitchChat.liveStatuses(twitch.map(item => item.name)); }
  catch { /* Falhas de consulta não são sinais de offline. */ }
  for (const item of twitch) statuses[item.id] = typeof live?.[item.name] === 'boolean' ? live[item.name] : null;
  return statuses;
}
