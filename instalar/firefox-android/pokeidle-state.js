// Valor histórico preservado para migrar os donos das sessões já salvas.
const POKEIDLE_OWNER = 'pokeidle:twitch';
const POKEIDLE_URL = 'https://pokeidle.io/app';
const POKEIDLE_FRESH_MS = 180000;

const KICK_ERRORS = new Set(['forbidden', 'rate-limited', 'unavailable', 'invalid-response', 'source-unavailable', 'no-channels', 'not-ready']);
const KICK_SYNC_STATUSES = new Set(['idle', 'ok', 'partial', 'no-channels', 'source-unavailable', 'rate-limited']);
const positiveTime = value => Number.isFinite(value) && value > 0 ? value : null;

function normalizeKickStatus(value, fallbackAt = null) {
  const checkedAt = positiveTime(value?.checkedAt) || positiveTime(fallbackAt);
  if (!checkedAt) return null;
  return { live: typeof value?.live === 'boolean' ? value.live : null, checkedAt,
    ...(KICK_ERRORS.has(value?.errorCode) ? { errorCode: value.errorCode } : {}),
    ...(positiveTime(value?.nextRetryAt) ? { nextRetryAt: value.nextRetryAt } : {}),
    ...(Number.isInteger(value?.attempts) && value.attempts > 0 && value.attempts <= 1000 ? { attempts: value.attempts } : {}) };
}

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
    const sample = normalizeKickStatus(value);
    if (sample) kickStatuses[id] = sample;
  }
  const hasKick = channels.some(item => item.platform === 'kick');
  const hasSync = raw.kickSync && typeof raw.kickSync === 'object' && !Array.isArray(raw.kickSync);
  const sync = hasSync ? raw.kickSync : {};
  const kickSync = { enabled: sync.enabled !== false,
    observedAt: positiveTime(sync.observedAt) || (!hasSync && hasKick ? positiveTime(raw.observedAt) : null),
    sourceTabId: Number.isInteger(sync.sourceTabId) ? sync.sourceTabId : !hasSync && hasKick && Number.isInteger(raw.sourceTabId) ? raw.sourceTabId : null,
    connected: typeof sync.connected === 'boolean' ? sync.connected : !hasSync && hasKick && raw.connected === true,
    lastAttemptAt: positiveTime(sync.lastAttemptAt), lastSuccessAt: positiveTime(sync.lastSuccessAt),
    status: KICK_SYNC_STATUSES.has(sync.status) ? sync.status : 'idle',
    errorCode: KICK_ERRORS.has(sync.errorCode) ? sync.errorCode : null, nextRetryAt: positiveTime(sync.nextRetryAt) };
  return { enabled: raw.enabled !== false, channels,
    ruleText: typeof raw.ruleText === 'string' ? raw.ruleText.replace(/\s+/g, ' ').trim().slice(0, 500) : '',
    observedAt: Number.isFinite(raw.observedAt) && raw.observedAt > 0 ? raw.observedAt : null,
    sourceTabId: Number.isInteger(raw.sourceTabId) ? raw.sourceTabId : null,
    sourceUrl: POKEIDLE_URL, connected: raw.connected === true,
    excludedNames, excludedIds, kickStatuses, kickSync };
}

function pokeIdleFresh(source, now) {
  return source.enabled && source.connected && source.observedAt !== null && now >= source.observedAt && now - source.observedAt <= POKEIDLE_FRESH_MS;
}

function pokeIdleKickFresh(source, now) {
  const sync = source.kickSync;
  return source.enabled && sync.enabled && sync.connected && sync.observedAt !== null && now >= sync.observedAt && now - sync.observedAt <= POKEIDLE_FRESH_MS;
}

function pokeIdleExcluded(source, id) {
  return source.excludedIds.includes(id) || (id.startsWith('twitch:') && source.excludedNames.includes(id.slice(7)));
}

function pokeIdleKickLive(source, id, now) {
  const sample = source.kickStatuses[id];
  // Depois de consultar a Kick, não ressuscite uma live pelo mesmo marcador
  // antigo do jogo se a API estiver indisponível ou a amostra tiver vencido.
  if (sample) return now >= sample.checkedAt && now - sample.checkedAt <= POKEIDLE_FRESH_MS && typeof sample.live === 'boolean' ? sample.live : null;
  const entry = source.channels.find(item => item.platform === 'kick' && `kick:${item.name}` === id);
  return pokeIdleKickFresh(source, now) && typeof entry?.live === 'boolean' ? entry.live : null;
}

function pokeIdleEligible(state, id, now) {
  if (pokeIdleExcluded(state.pokeidle, id)) return false;
  const entry = state.pokeidle.channels.find(item => `${item.platform}:${item.name}` === id);
  if (!entry) return false;
  if (entry.platform === 'kick') return pokeIdleKickFresh(state.pokeidle, now) && pokeIdleKickLive(state.pokeidle, id, now) === true;
  return pokeIdleFresh(state.pokeidle, now) && !state.liveWatch?.enabled && entry.live === true && entry.bonus && entry.missing;
}
