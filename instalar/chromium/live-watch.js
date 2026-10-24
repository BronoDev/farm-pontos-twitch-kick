export const LIVE_WATCH_OWNER = 'live-watch';
export const LIVE_WATCH_FRESH_MS = 180000;

export function normalizeLiveWatch(raw, channels) {
  const valid = new Set(channels.map(item => item.id));
  raw = raw && typeof raw === 'object' ? raw : {};
  const channelIds = Array.isArray(raw.channelIds) ? [...new Set(raw.channelIds.filter(id => valid.has(id)))].slice(0, 100) : [];
  const statuses = {};
  for (const id of channelIds) {
    const entry = raw.statuses?.[id];
    if (!entry || !Number.isFinite(entry.checkedAt) || entry.checkedAt <= 0) continue;
    statuses[id] = { live: typeof entry.live === 'boolean' ? entry.live : null, checkedAt: entry.checkedAt };
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

export async function collectLiveWatch(state, twitchChat, options = {}) {
  if (!state.liveWatch?.enabled) return {};
  const fetcher = options.fetch || globalThis.fetch;
  const selected = state.channels.filter(item => state.liveWatch.channelIds.includes(item.id));
  const statuses = {};
  const kick = selected.filter(item => item.platform === 'kick');
  let index = 0;
  async function worker() {
    while (index < kick.length) {
      const item = kick[index++];
      let timeout;
      const abort = new AbortController();
      try {
        timeout = setTimeout(() => abort.abort(), 8000);
        const response = await fetcher(`https://kick.com/api/v2/channels/${encodeURIComponent(item.name)}`, { credentials: 'omit', signal: abort.signal });
        statuses[item.id] = response.ok ? kickLiveFromResponse(await response.json()) : null;
      } catch { statuses[item.id] = null; }
      finally { clearTimeout(timeout); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, kick.length) }, worker));
  const twitch = selected.filter(item => item.platform === 'twitch');
  let live = {};
  try { if (twitch.length && state.liveWatch.twitchMode === 'irc' && twitchChat) live = await twitchChat.liveStatuses(twitch.map(item => item.name)); }
  catch { /* Falhas de consulta não são sinais de offline. */ }
  for (const item of twitch) statuses[item.id] = typeof live?.[item.name] === 'boolean' ? live[item.name] : null;
  return statuses;
}
