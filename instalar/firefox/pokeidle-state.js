const POKEIDLE_OWNER = 'pokeidle:twitch';
const POKEIDLE_URL = 'https://pokeidle.io/app';
const POKEIDLE_FRESH_MS = 180000;

function isPokeIdleUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://pokeidle.io' && !url.username && !url.password && /^\/app(?:\/|$)/.test(url.pathname);
  } catch { return false; }
}

const reservedPokeIdleNames = new Set(['directory', 'videos', 'settings', 'login', 'signup', 'popout', 'search', 'subscriptions', 'downloads', 'inventory', 'wallet', 'turbo', 'prime', 'jobs', 'products', 'friends', 'drops', 'activate']);
function pokeIdleChannels(values) {
  const channels = [];
  const seen = new Set();
  for (const entry of Array.isArray(values) ? values.slice(0, 200) : []) {
    if (!entry || typeof entry.name !== 'string') continue;
    const name = entry.name.toLowerCase();
    if (!/^[a-z0-9_]{1,25}$/.test(name) || reservedPokeIdleNames.has(name) || seen.has(name)) continue;
    seen.add(name);
    channels.push({ name, displayName: typeof entry.displayName === 'string' ? entry.displayName.replace(/\s+/g, ' ').trim().slice(0, 80) || name : name,
      live: entry.live === true, bonus: entry.bonus === true, missing: entry.missing === true });
    if (channels.length === 100) break;
  }
  return channels;
}

function normalizePokeIdle(raw = {}) {
  if (!raw || typeof raw !== 'object') raw = {};
  return { enabled: raw.enabled !== false, channels: pokeIdleChannels(raw.channels),
    ruleText: typeof raw.ruleText === 'string' ? raw.ruleText.replace(/\s+/g, ' ').trim().slice(0, 500) : '',
    observedAt: Number.isFinite(raw.observedAt) && raw.observedAt > 0 ? raw.observedAt : null,
    sourceTabId: Number.isInteger(raw.sourceTabId) ? raw.sourceTabId : null,
    sourceUrl: POKEIDLE_URL, connected: raw.connected === true,
    excludedNames: Array.isArray(raw.excludedNames) ? raw.excludedNames.filter(name => typeof name === 'string' && /^[a-z0-9_]{1,25}$/.test(name)).slice(0, 100) : [] };
}

function pokeIdleFresh(source, now) {
  return source.enabled && source.connected && source.observedAt !== null && now >= source.observedAt && now - source.observedAt <= POKEIDLE_FRESH_MS;
}

function pokeIdleEligible(state, id, now) {
  if (!pokeIdleFresh(state.pokeidle, now)) return false;
  const entry = state.pokeidle.channels.find(item => `twitch:${item.name}` === id);
  return !!entry && entry.live && entry.bonus && entry.missing && !state.pokeidle.excludedNames.includes(entry.name);
}
