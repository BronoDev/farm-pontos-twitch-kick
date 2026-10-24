// Valor histórico preservado para migrar os donos das sessões já salvas.
const POKEIDLE_OWNER = 'pokeidle:twitch';
const POKEIDLE_URL = 'https://pokeidle.io/app';
const POKEIDLE_FRESH_MS = 180000;

function isPokeIdleUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://pokeidle.io' && !url.username && !url.password && /^\/app(?:\/|$)/.test(url.pathname);
  } catch { return false; }
}

const reservedPokeIdleNames = new Set(['directory', 'videos', 'settings', 'login', 'signup', 'popout', 'search', 'subscriptions', 'downloads', 'inventory', 'wallet', 'turbo', 'prime', 'jobs', 'products', 'friends', 'drops', 'activate', 'categories', 'clips']);
function pokeIdleChannels(values) {
  const channels = [];
  const seen = new Set();
  for (const entry of Array.isArray(values) ? values.slice(0, 200) : []) {
    if (!entry || typeof entry.name !== 'string') continue;
    const platform = entry.platform === undefined ? 'twitch' : entry.platform;
    if (!['kick', 'twitch'].includes(platform)) continue;
    const name = entry.name.toLowerCase();
    const valid = platform === 'kick' ? /^[a-z0-9_][a-z0-9_-]{0,39}$/.test(name) : /^[a-z0-9_]{1,25}$/.test(name);
    const id = `${platform}:${name}`;
    if (!valid || reservedPokeIdleNames.has(name) || seen.has(id)) continue;
    seen.add(id);
    const source = entry.source === 'link' && platform === 'kick' ? 'link' : 'widget';
    channels.push({ platform, name, displayName: typeof entry.displayName === 'string' ? entry.displayName.replace(/\s+/g, ' ').trim().slice(0, 80) || name : name,
      source, live: source === 'link' ? null : typeof entry.live === 'boolean' ? entry.live : platform === 'kick' ? null : false,
      bonus: source !== 'link' && entry.bonus === true, missing: source !== 'link' && entry.missing === true });
    if (channels.length === 100) break;
  }
  return channels;
}

function normalizePokeIdle(raw = {}) {
  if (!raw || typeof raw !== 'object') raw = {};
  const channels = pokeIdleChannels(raw.channels);
  const excludedNames = Array.isArray(raw.excludedNames) ? raw.excludedNames.filter(name => typeof name === 'string' && /^[a-z0-9_]{1,25}$/.test(name)).slice(0, 100) : [];
  const excludedIds = [...new Set([...(Array.isArray(raw.excludedIds) ? raw.excludedIds.filter(id => typeof id === 'string' && /^(?:twitch:[a-z0-9_]{1,25}|kick:[a-z0-9_][a-z0-9_-]{0,39})$/.test(id)) : []), ...excludedNames.map(name => `twitch:${name}`)])].slice(0, 200);
  const kickStatuses = {};
  for (const [id, value] of Object.entries(raw.kickStatuses || {}).slice(0, 100)) {
    if (!/^kick:[a-z0-9_][a-z0-9_-]{0,39}$/.test(id)) continue;
    if (Number.isFinite(value?.checkedAt) && value.checkedAt > 0) kickStatuses[id] = { live: typeof value.live === 'boolean' ? value.live : null, checkedAt: value.checkedAt };
  }
  return { enabled: raw.enabled !== false, channels,
    ruleText: typeof raw.ruleText === 'string' ? raw.ruleText.replace(/\s+/g, ' ').trim().slice(0, 500) : '',
    observedAt: Number.isFinite(raw.observedAt) && raw.observedAt > 0 ? raw.observedAt : null,
    sourceTabId: Number.isInteger(raw.sourceTabId) ? raw.sourceTabId : null,
    sourceUrl: POKEIDLE_URL, connected: raw.connected === true,
    excludedNames, excludedIds, kickStatuses };
}

function pokeIdleFresh(source, now) {
  return source.enabled && source.connected && source.observedAt !== null && now >= source.observedAt && now - source.observedAt <= POKEIDLE_FRESH_MS;
}

function pokeIdleExcluded(source, id) {
  return source.excludedIds.includes(id) || (id.startsWith('twitch:') && source.excludedNames.includes(id.slice(7)));
}

function pokeIdleKickLive(source, id, now) {
  const sample = source.kickStatuses[id];
  if (sample && typeof sample.live === 'boolean' && now >= sample.checkedAt && now - sample.checkedAt <= POKEIDLE_FRESH_MS) return sample.live;
  const entry = source.channels.find(item => item.platform === 'kick' && `kick:${item.name}` === id);
  return pokeIdleFresh(source, now) && typeof entry?.live === 'boolean' ? entry.live : null;
}

function pokeIdleEligible(state, id, now) {
  if (!pokeIdleFresh(state.pokeidle, now) || pokeIdleExcluded(state.pokeidle, id)) return false;
  const entry = state.pokeidle.channels.find(item => `${item.platform}:${item.name}` === id);
  if (!entry) return false;
  if (entry.platform === 'kick') return pokeIdleKickLive(state.pokeidle, id, now) === true;
  return !state.liveWatch?.enabled && entry.live === true && entry.bonus && entry.missing;
}
