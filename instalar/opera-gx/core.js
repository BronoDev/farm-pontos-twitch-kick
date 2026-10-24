import { normalizeRewardsState, applyRewardsCommand, rewardSummary } from './rewards.js';
import { operationalState, kickUsesLive, availableSlot, enqueueChannel, removeQueued, scheduledOwnersAlive, dueSchedules, healthReminders } from './automation.js';
import { POKEIDLE_OWNER, POKEIDLE_URL, isPokeIdleUrl, pokeIdleChannels, normalizePokeIdle, pokeIdleEligible, pokeIdleExcluded, pokeIdleKickLive } from './pokeidle-state.js';
import { normalizeUiPreferences } from './ui-state.js';
import { LIVE_WATCH_OWNER, normalizeLiveWatch, watchEligible, publicTwitchChat } from './live-watch.js';

export function channel(platform, input) {
  if (!['kick', 'twitch'].includes(platform)) throw new Error('Escolha Twitch ou Kick.');
  let name = String(input).trim();
  if (/^https?:\/\//i.test(name)) {
    const url = new URL(name);
    const hosts = platform === 'kick' ? ['kick.com', 'www.kick.com'] : ['twitch.tv', 'www.twitch.tv'];
    if (!hosts.includes(url.hostname) || url.username || url.password) throw new Error('O link não pertence à plataforma escolhida.');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) throw new Error('Cole o link principal do canal ou apenas seu nome.');
    name = parts[0];
  }
  name = name.replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_][a-z0-9_-]{0,39}$/.test(name)) throw new Error('Use um nome de canal válido, com até 40 caracteres.');
  const reserved = ['directory', 'settings', 'login', 'signup', 'popout', 'videos', 'subscriptions', 'search'];
  if (reserved.includes(name)) throw new Error('Informe um canal, não uma página da plataforma.');
  return { id: `${platform}:${name}`, platform, name };
}

export function chatUrl(item) {
  const valid = channel(item.platform, item.name);
  return valid.platform === 'kick'
    ? `https://kick.com/popout/${valid.name}/chat`
    : `https://www.twitch.tv/popout/${valid.name}/chat?popout=`;
}

export function matchesChat(url, item) {
  try { return new URL(url).href === new URL(chatUrl(item)).href; }
  catch { return false; }
}

export function sessionUrl(item, session) {
  return item.platform === 'kick' && session.media === 'live'
    ? `https://kick.com/${channel(item.platform, item.name).name}`
    : chatUrl(item);
}

function matchesSession(url, item, session) {
  try { return new URL(url).href === new URL(sessionUrl(item, session)).href; }
  catch { return false; }
}

function matchesLegacyTwitchLive(value, item) {
  try {
    const url = new URL(value);
    return item.platform === 'twitch' && url.origin === 'https://www.twitch.tv' && !url.username && !url.password
      && !url.search && !url.hash && [ `/${item.name}`, `/${item.name}/` ].includes(url.pathname);
  } catch { return false; }
}

export function createController(api, { twitchChat } = {}) {
  let androidGecko;
  async function isAndroidGecko() {
    if (!androidGecko) androidGecko = (async () => {
      // Firefox Android aceita muted em tabs.create, mas não em tabs.update.
      if (!api.runtime?.getBrowserInfo || !api.runtime?.getPlatformInfo) return false;
      try { return (await api.runtime.getPlatformInfo()).os === 'android'; }
      catch { return false; }
    })();
    return androidGecko;
  }
  async function read() {
    const raw = await api.storage.local.get(['channels', 'sessions', 'kickLive', 'bonuses', 'measurements', 'schedules', 'settings', 'queue', 'queueSources', 'alerts', 'activeReminderIds', 'sessionHistory', 'automationPaused', 'pausedChannels', 'pokeidle', 'uiPreferences', 'liveWatch', 'twitchChatStatus', 'automationsMigrated', 'platformRoutingMigrated']);
    const channels = Array.isArray(raw.channels) ? raw.channels : [];
    const rewards = normalizeRewardsState(raw);
    // Os horários antigos deixam de rodar após a substituição da agenda na interface.
    if (raw.automationsMigrated !== true) for (const schedule of rewards.schedules) schedule.enabled = false;
    const pokeidle = normalizePokeIdle(raw.pokeidle);
    // A versão 0.9 desligava esta fonte ao ativar o monitor, impedindo a Kick.
    if (raw.platformRoutingMigrated !== true && raw.liveWatch?.enabled === true && raw.pokeidle?.enabled === false) pokeidle.enabled = true;
    return { channels, sessions: raw.sessions || {}, kickLive: raw.kickLive !== false, pokeidle, uiPreferences: normalizeUiPreferences(raw.uiPreferences), liveWatch: normalizeLiveWatch(raw.liveWatch, channels), twitchChat: publicTwitchChat(raw.twitchChatStatus), automationsMigrated: true, platformRoutingMigrated: true, ...rewards, ...operationalState(raw, channels) };
  }
  async function alive(session, item) {
    if (!session) return false;
    if (session.transport === 'irc') return item.platform === 'twitch';
    try {
      const tab = await api.tabs.get(session.tabId);
      const url = tab.pendingUrl || tab.url;
      return matchesSession(url, item, session) || (session.media === 'live' && matchesLegacyTwitchLive(url, item));
    } catch { return false; }
  }
  return async function execute(message, sender = {}) {
    const state = await read();
    const now = Date.now();
    const contentTypes = ['kickContext', 'kickTelemetry', 'playerContext', 'playerTelemetry', 'sessionContext', 'sessionHealth'];
    if (contentTypes.includes(message.type)) {
      const item = state.channels.find(c => state.sessions[c.id]?.tabId === sender.tab?.id);
      const session = item && state.sessions[item.id];
      if (!session || session.transport === 'irc' || !matchesSession(sender.url || sender.tab?.url, item, session)) return { managed: false };
      if (message.type.startsWith('kick') && (item.platform !== 'kick' || session.media !== 'live')) return { managed: false };
      if (message.type.startsWith('player') && (item.platform !== 'kick' || session.media !== 'live')) return { managed: false };
      if (['kickTelemetry', 'playerTelemetry'].includes(message.type)) {
        const sample = message.sample || {};
        const statuses = ['pending', 'requested', 'unavailable', 'autoplay-blocked'];
        const dimension = value => Number.isInteger(value) && value >= 0 && value <= 16384 ? value : 0;
        session.playback = { playing: sample.playing === true, error: sample.error === true, height: dimension(sample.height), targetHeight: dimension(sample.targetHeight), qualityStatus: statuses.includes(sample.qualityStatus) ? sample.qualityStatus : 'pending', checkedAt: now };
        if (session.playback.playing && !session.playback.error) { session.retryCount = 0; session.nextRetryAt = 0; }
      }
      if (message.type === 'sessionHealth') {
        const sample = message.sample || {};
        session.health = {
          login: ['signed-in', 'signed-out'].includes(sample.login) ? sample.login : 'unknown',
          connection: ['online', 'offline'].includes(sample.connection) ? sample.connection : 'unknown',
          live: ['live', 'offline'].includes(sample.live) ? sample.live : 'unknown',
          playbackError: sample.playbackError === true, checkedAt: now
        };
      }
      if (['kickTelemetry', 'playerTelemetry', 'sessionHealth'].includes(message.type)) await api.storage.local.set(state);
      return { managed: true };
    }
    let snapshot;
    if (message.type === 'pokeidleSnapshot') {
      if (!Number.isInteger(sender.tab?.id) || (sender.frameId !== undefined && sender.frameId !== 0) || !isPokeIdleUrl(sender.url || sender.tab?.url)) return { accepted: false };
      try { const source = await api.tabs.get(sender.tab.id); if (!isPokeIdleUrl(source.pendingUrl || source.url)) return { accepted: false }; }
      catch { return { accepted: false }; }
      if (message.snapshot?.ready !== true) return { accepted: false };
      const entries = Array.isArray(message.snapshot.channels) ? message.snapshot.channels : [];
      const channels = pokeIdleChannels(entries.slice(0, 200).filter(entry => entry
        && ['bonus', 'missing'].every(key => typeof entry[key] === 'boolean')
        && (typeof entry.live === 'boolean' || (entry.platform === 'kick' && entry.live === null))));
      if (!channels.length) return { accepted: false };
      snapshot = { channels, ruleText: typeof message.snapshot.ruleText === 'string' ? message.snapshot.ruleText.replace(/\s+/g, ' ').trim().slice(0, 500) : '' };
    }
    const warnings = [];
    const twitchMigrationsPending = new Set();
    async function save() { const stored = { ...state }; delete stored.twitchChat; await api.storage.local.set(stored); }
    function history(id, session, reason) {
      state.sessionHistory.push({ channelId: id, openedAt: session.openedAt, endedAt: now, media: session.media || 'chat', reason });
      state.sessionHistory = state.sessionHistory.slice(-300);
    }
    if (state.pokeidle.sourceTabId !== null) {
      try { const source = await api.tabs.get(state.pokeidle.sourceTabId); state.pokeidle.connected = isPokeIdleUrl(source.pendingUrl || source.url); }
      catch { state.pokeidle.connected = false; }
    }
    if (message.type === 'tabRemoved' && state.pokeidle.sourceTabId === message.tabId) state.pokeidle.connected = false;
    if (snapshot) {
      Object.assign(state.pokeidle, snapshot, { observedAt: now, sourceTabId: sender.tab.id, connected: true });
      for (const entry of snapshot.channels.filter(c => (c.platform === 'kick' || c.bonus) && !pokeIdleExcluded(state.pokeidle, `${c.platform}:${c.name}`))) {
        const item = channel(entry.platform, entry.name);
        const existing = state.channels.find(c => c.id === item.id);
        if (existing) {
          existing.pokeidleOfficial = entry.source !== 'link'; existing.pokeidleLinked = true;
          if (item.platform === 'kick' && existing.priority === undefined) existing.priority = 1;
          if (item.platform === 'kick' && !['chat', 'live'].includes(existing.kickMode)) existing.kickMode = 'live';
        } else state.channels.push({ ...item, ...(item.platform === 'kick' ? { kickMode: 'live', priority: 1 } : {}), pokeidleOfficial: entry.source !== 'link', pokeidleLinked: true, pokeidleAutoAdded: true });
      }
    }
    // Corrige abas de vídeo criadas pelas versões antigas sem abrir outra janela.
    for (const item of state.channels.filter(c => c.platform === 'twitch')) {
      const session = state.sessions[item.id];
      if (session?.media !== 'live' || !Number.isInteger(session.tabId)) continue;
      try {
        const tab = await api.tabs.get(session.tabId);
        const url = tab.pendingUrl || tab.url;
        if (matchesLegacyTwitchLive(url, item)) {
          const options = { url: chatUrl(item), active: false };
          if (!await isAndroidGecko()) options.muted = true;
          await api.tabs.update(session.tabId, options);
        } else if (!matchesChat(url, item)) continue;
        session.media = 'chat';
        delete session.playback;
        delete session.health;
      } catch {
        twitchMigrationsPending.add(item.id);
        warnings.push(`${item.name}: não foi possível trocar a aba antiga pelo chat Twitch. Tente atualizar novamente.`);
      }
    }
    if (message.type === 'tabRemoved') for (const [id, session] of Object.entries(state.sessions)) {
      if (session.tabId !== message.tabId) continue;
      history(id, session, 'closed-manually'); delete state.sessions[id]; removeQueued(state, id);
      if (!state.pausedChannels.includes(id)) state.pausedChannels.push(id);
    }
    for (const [id, session] of Object.entries(state.sessions)) {
      const item = state.channels.find(c => c.id === id);
      if (!item || !await alive(session, item)) {
        history(id, session, 'closed-or-navigated'); delete state.sessions[id]; removeQueued(state, id);
        if (item && !state.pausedChannels.includes(id)) state.pausedChannels.push(id);
      }
    }
    async function stop(item, reason = 'manual') {
      const session = state.sessions[item.id];
      if (session?.transport !== 'irc' && session && await alive(session, item)) await api.tabs.remove(session.tabId);
      if (session) history(item.id, session, reason);
      delete state.sessions[item.id];
      await save();
    }
    async function start(item, owners = ['manual']) {
      const existing = state.sessions[item.id];
      owners = [...new Set([...(existing?.ownerIds || (existing ? ['manual'] : [])), ...owners])];
      if (twitchMigrationsPending.has(item.id) && existing) { existing.ownerIds = owners; return; }
      const irc = item.platform === 'twitch' && state.liveWatch.twitchMode === 'irc' && (state.liveWatch.enabled || owners.includes(LIVE_WATCH_OWNER));
      if (irc) {
        if (!/^[a-z0-9_]{1,25}$/.test(item.name)) throw new Error('Use um nome de canal Twitch válido para conectar o chat.');
        const chat = publicTwitchChat(twitchChat ? await twitchChat.status() : null);
        state.twitchChat = chat;
        if (!chat.configured) {
          for (const owner of owners) enqueueChannel(state, item.id, owner);
          const warning = 'Conecte o chat Twitch na configuração da automação.';
          if (!warnings.includes(warning)) warnings.push(warning);
          return;
        }
        if (existing?.transport === 'irc') { existing.ownerIds = owners; removeQueued(state, item.id); return; }
        if (existing) await stop(item, 'chat-transport-change');
        if (!availableSlot(state, item)) { for (const owner of owners) enqueueChannel(state, item.id, owner); return; }
        state.sessions[item.id] = { transport: 'irc', media: 'chat', mode: 'background', openedAt: existing?.openedAt ?? now, ownerIds: owners };
        removeQueued(state, item.id);
        await save();
        return;
      }
      const media = kickUsesLive(state, item) ? 'live' : 'chat';
      if (existing?.transport !== 'irc' && existing?.mode === 'background' && (existing.media || 'chat') === media) {
        existing.ownerIds = [...new Set([...(existing.ownerIds || ['manual']), ...owners])];
        removeQueued(state, item.id);
        return;
      }
      if (existing) await stop(item, 'mode-change');
      if (!availableSlot(state, item)) { for (const owner of owners) enqueueChannel(state, item.id, owner); return; }
      const mutedOnCreate = await isAndroidGecko();
      const options = { url: sessionUrl(item, { media }), active: false };
      if (mutedOnCreate) options.muted = true;
      const tab = await api.tabs.create(options);
      if (!Number.isInteger(tab?.id)) throw new Error('O navegador não retornou a aba do canal.');
      state.sessions[item.id] = { tabId: tab.id, openedAt: existing?.openedAt ?? now, mode: 'background', media, ownerIds: owners };
      removeQueued(state, item.id);
      await save();
      if (!mutedOnCreate) {
        try { await api.tabs.update(tab.id, { muted: true }); }
        catch { warnings.push(`${item.name}: não foi possível silenciar a aba. Verifique o áudio no navegador.`); }
      }
    }
    async function apply(item, operation) {
      try { await operation(item); }
      catch (error) { warnings.push(`${item.platform}/${item.name}: ${error.message}`); }
    }
    async function drain() {
      if (state.automationPaused) return;
      const ordered = [...state.queue].sort((a, b) => (state.channels.find(c => c.id === b)?.priority || 0) - (state.channels.find(c => c.id === a)?.priority || 0));
      for (const id of ordered) {
        const item = state.channels.find(c => c.id === id);
        if (!item) { removeQueued(state, id); continue; }
        const owners = (state.queueSources[id] || ['manual']).filter(owner => owner === 'manual' || (owner === LIVE_WATCH_OWNER ? watchEligible(state, id, now) : owner === POKEIDLE_OWNER ? pokeIdleEligible(state, id, now) : state.schedules.some(s => s.id === owner && s.enabled && now < s.endsAt)));
        if (!owners.length) { removeQueued(state, id); continue; }
        if (state.pausedChannels.includes(id)) { removeQueued(state, id); continue; }
        if (twitchMigrationsPending.has(id)) continue;
        if (!state.sessions[id] && item.platform === 'kick' && owners.includes(POKEIDLE_OWNER) && !availableSlot(state, item)) {
          const tabCount = Object.values(state.sessions).filter(session => session.transport !== 'irc').length;
          const kickCount = Object.entries(state.sessions).filter(([key, session]) => session.media === 'live' && state.channels.some(c => c.id === key && c.platform === 'kick')).length;
          // Libera somente uma vaga ocupada pela própria automação PokeIdle,
          // sem desfazer sessões manuais ou a prioridade escolhida pelo usuário.
          if (tabCount >= state.settings.maxConcurrent && (!kickUsesLive(state, item) || kickCount < state.settings.maxKickLives)) {
            const victim = state.channels.filter(candidate => {
              const session = state.sessions[candidate.id];
              return candidate.platform === 'twitch' && session?.media === 'chat' && session.transport !== 'irc'
                && session.ownerIds?.length === 1 && session.ownerIds[0] === POKEIDLE_OWNER
                && (candidate.priority || 0) < (item.priority || 0);
            }).sort((a, b) => (a.priority || 0) - (b.priority || 0))[0];
            if (victim) await apply(victim, async current => {
              await stop(current, 'kick-priority');
              enqueueChannel(state, current.id, POKEIDLE_OWNER);
            });
          }
        }
        if (state.sessions[id] || availableSlot(state, item)) await apply(item, current => start(current, owners));
      }
    }
    function getItem(id) {
      const item = state.channels.find(c => c.id === id);
      if (!item) throw new Error('Canal não encontrado.');
      return item;
    }
    async function openUrl(url) {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Use um link HTTPS sem credenciais.');
      await api.tabs.create({ url: parsed.href, active: true });
    }
    if (message.type === 'setLiveWatch') {
      if (typeof message.enabled !== 'boolean' || !Array.isArray(message.channelIds) || (message.enabled && !message.channelIds.length) || message.channelIds.length > 100 || message.channelIds.some(id => typeof id !== 'string' || !state.channels.some(item => item.id === id))) throw new Error('Configuração de automação inválida.');
      if (message.twitchMode !== undefined && !['chat', 'irc'].includes(message.twitchMode)) throw new Error('Modo de chat Twitch inválido.');
      state.liveWatch.enabled = message.enabled;
      if (message.twitchMode !== undefined) state.liveWatch.twitchMode = message.twitchMode;
      state.liveWatch.channelIds = [...new Set(message.channelIds)];
      if (message.enabled) {
        state.automationPaused = false;
        state.pausedChannels = state.pausedChannels.filter(id => !state.liveWatch.channelIds.includes(id));
        for (const schedule of state.schedules) schedule.enabled = false;
      }
    } else if (message.type === 'liveWatchSnapshot') {
      for (const id of state.liveWatch.channelIds) state.liveWatch.statuses[id] = { live: typeof message.statuses?.[id] === 'boolean' ? message.statuses[id] : null, checkedAt: now };
      state.liveWatch.lastCheckedAt = now;
    } else if (message.type === 'pokeidleKickSnapshot') {
      for (const item of state.channels.filter(c => c.platform === 'kick' && (state.pokeidle.channels.some(entry => entry.platform === 'kick' && entry.name === c.name) || state.sessions[c.id]?.ownerIds?.includes(POKEIDLE_OWNER)))) {
        const id = item.id;
        if (pokeIdleExcluded(state.pokeidle, id)) continue;
        state.pokeidle.kickStatuses[id] = { live: typeof message.statuses?.[id] === 'boolean' ? message.statuses[id] : null, checkedAt: now };
      }
    } else if (message.type === 'add') {
      const item = channel(message.platform, message.input);
      if (message.kickMode !== undefined && (item.platform !== 'kick' || !['default', 'live', 'chat'].includes(message.kickMode))) throw new Error('Modo Kick inválido.');
      const existing = state.channels.find(c => c.id === item.id);
      if (!existing) {
        if (item.platform === 'kick' && message.kickMode !== undefined) item.kickMode = message.kickMode;
        state.channels.push(item);
      }
      else existing.pokeidleAutoAdded = false;
      if (item.platform === 'twitch') state.pokeidle.excludedNames = state.pokeidle.excludedNames.filter(name => name !== item.name);
      state.pokeidle.excludedIds = state.pokeidle.excludedIds.filter(id => id !== item.id);
    } else if (['start', 'stop', 'remove'].includes(message.type)) {
      const item = getItem(message.id);
      if (message.type === 'start') {
        state.pausedChannels = state.pausedChannels.filter(id => id !== item.id);
        await start(item, !state.automationPaused && pokeIdleEligible(state, item.id, now) ? ['manual', POKEIDLE_OWNER] : ['manual']);
      } else {
        removeQueued(state, item.id);
        if (!state.pausedChannels.includes(item.id)) state.pausedChannels.push(item.id);
        await stop(item);
        if (message.type === 'remove') {
          if (item.pokeidleOfficial || item.pokeidleLinked) {
            if (!state.pokeidle.excludedIds.includes(item.id)) state.pokeidle.excludedIds.push(item.id);
            if (item.platform === 'twitch' && !state.pokeidle.excludedNames.includes(item.name)) state.pokeidle.excludedNames.push(item.name);
          }
          state.channels = state.channels.filter(c => c.id !== item.id);
          state.pausedChannels = state.pausedChannels.filter(id => id !== item.id);
          state.schedules.forEach(s => { s.channelIds = s.channelIds.filter(id => id !== item.id); });
          state.liveWatch.channelIds = state.liveWatch.channelIds.filter(id => id !== item.id);
        }
      }
    } else if (message.type === 'setKickMode') {
      const item = getItem(message.id);
      if (item.platform !== 'kick' || !['default', 'live', 'chat'].includes(message.mode)) throw new Error('Modo Kick inválido.');
      item.kickMode = message.mode;
      await save();
      if (state.sessions[item.id]) await apply(item, current => start(current, state.sessions[current.id]?.ownerIds || ['manual']));
    } else if (message.type === 'setKickLive') {
      if (typeof message.enabled !== 'boolean') throw new Error('Opção de vídeo inválida.');
      state.kickLive = message.enabled;
      await save();
      for (const item of state.channels.filter(c => c.platform === 'kick' && !['live', 'chat'].includes(c.kickMode) && state.sessions[c.id])) await apply(item, current => start(current, state.sessions[current.id]?.ownerIds || ['manual']));
    } else if (message.type === 'startAll') {
      state.automationPaused = false;
      state.pausedChannels = [];
      for (const item of state.channels) {
        if (state.liveWatch.enabled) { if (watchEligible(state, item.id, now)) enqueueChannel(state, item.id, LIVE_WATCH_OWNER); }
        else if (!item.pokeidleAutoAdded) enqueueChannel(state, item.id);
      }
    } else if (message.type === 'stopAll') {
      state.queue = []; state.queueSources = {}; state.automationPaused = true;
      for (const item of state.channels) await apply(item, stop);
    } else if (message.type === 'setUiPanel') {
      if (!['bonuses', 'history', 'schedule', 'pokeidle'].includes(message.panel) || typeof message.visible !== 'boolean') throw new Error('Opção de painel inválida.');
      state.uiPreferences.panels[message.panel] = message.visible;
    } else if (message.type === 'openDashboard') {
      await api.tabs.create({ url: api.runtime.getURL('popup.html'), active: true });
    } else if (message.type === 'openPokeIdle') {
      let source;
      if (api.tabs.query) source = (await api.tabs.query({ url: 'https://pokeidle.io/*' })).find(tab => isPokeIdleUrl(tab.url));
      if (source) await api.tabs.update(source.id, { active: true });
      else await openUrl(POKEIDLE_URL);
    } else if (message.type === 'setPokeIdle') {
      if (typeof message.enabled !== 'boolean') throw new Error('Opção PokeIdle inválida.');
      state.pokeidle.enabled = message.enabled;
    } else if (message.type === 'refreshPokeIdle') {
      if (!state.pokeidle.connected) warnings.push('Abra o PokeIdle e aguarde a lista de canais oficiais carregar para sincronizar.');
    } else if (message.type === 'setPriority') {
      if (!Number.isInteger(message.priority) || message.priority < 0 || message.priority > 100) throw new Error('Prioridade deve ser de 0 a 100.');
      getItem(message.id).priority = message.priority;
    } else if (message.type === 'openSession') {
      const item = getItem(message.id);
      const session = state.sessions[item.id];
      if (session?.transport === 'irc') {
        warnings.push('Este chat Twitch funciona em segundo plano, sem aba.');
      } else if (session) {
        await api.tabs.update(session.tabId, { active: true });
        const tab = await api.tabs.get(session.tabId);
        if (!await isAndroidGecko() && api.windows?.update && Number.isInteger(tab.windowId)) await api.windows.update(tab.windowId, { focused: true });
      } else await openUrl(sessionUrl(item, { media: kickUsesLive(state, item) ? 'live' : 'chat' }));
    } else if (message.type === 'openRedemption') {
      const bonus = state.bonuses.find(b => b.id === message.id);
      if (!bonus) throw new Error('Bônus não encontrado.');
      const item = state.channels.find(c => c.id === bonus.channelId);
      await openUrl(bonus.sourceUrl || (item ? sessionUrl(item, { media: item.platform === 'kick' ? 'live' : 'chat' }) : 'https://pokeidle.io/app'));
    } else if (message.type === 'dismissAlert') {
      const alert = state.alerts.find(a => a.id === message.id);
      if (alert) alert.read = true;
    } else if (message.type === 'pauseAutomation') state.automationPaused = true;
    else if (message.type === 'resumeAutomation') {
      state.automationPaused = false; state.pausedChannels = [];
      for (const schedule of state.schedules) if (schedule.enabled && now >= schedule.startsAt && now < schedule.endsAt) schedule.startedAt = null;
    } else if (!['status', 'tick', 'tabRemoved', 'pokeidleSnapshot'].includes(message.type) && !applyRewardsCommand(state, message, now)) throw new Error('Comando desconhecido.');

    // A opção padrão do monitor também converte sessões IRC antigas em popout.
    if (state.liveWatch.twitchMode !== 'irc') for (const item of state.channels.filter(c => c.platform === 'twitch' && state.sessions[c.id]?.transport === 'irc')) {
      await apply(item, current => start(current, state.sessions[current.id].ownerIds || ['manual']));
    }

    // O monitor controla somente sua participação; sessões manuais são preservadas.
    for (const item of state.channels) {
      const sample = state.liveWatch.statuses[item.id];
      const continuousChat = item.platform === 'twitch' && state.liveWatch.twitchMode !== 'irc';
      const revoked = !state.liveWatch.enabled || !state.liveWatch.channelIds.includes(item.id) || (!continuousChat && sample?.live === false);
      if (revoked) {
        const queued = (state.queueSources[item.id] || []).filter(owner => owner !== LIVE_WATCH_OWNER);
        if (queued.length) state.queueSources[item.id] = queued;
        else if (state.queueSources[item.id]?.includes(LIVE_WATCH_OWNER)) removeQueued(state, item.id);
        const session = state.sessions[item.id];
        if (session?.ownerIds?.includes(LIVE_WATCH_OWNER)) {
          const owners = session.ownerIds.filter(owner => owner !== LIVE_WATCH_OWNER);
          if (owners.length) session.ownerIds = owners;
          else await apply(item, current => stop(current, 'live-offline'));
        }
      }
      if (!state.automationPaused && !state.pausedChannels.includes(item.id) && watchEligible(state, item.id, now)) enqueueChannel(state, item.id, LIVE_WATCH_OWNER);
    }

    // Ausência temporária do widget não significa offline. Só sinais explícitos
    // removem a participação PokeIdle de uma sessão; donos manuais são preservados.
    for (const item of state.channels) {
      const entry = state.pokeidle.channels.find(c => `${c.platform}:${c.name}` === item.id);
      const sourceOffline = item.platform === 'kick' ? pokeIdleKickLive(state.pokeidle, item.id, now) === false : snapshot && entry && (!entry.live || !entry.bonus);
      const revoked = (item.platform === 'twitch' && state.liveWatch.enabled) || !state.pokeidle.enabled || sourceOffline || pokeIdleExcluded(state.pokeidle, item.id);
      if (revoked) {
        const queuedOwners = (state.queueSources[item.id] || []).filter(owner => owner !== POKEIDLE_OWNER);
        if (queuedOwners.length) state.queueSources[item.id] = queuedOwners;
        else removeQueued(state, item.id);
        const session = state.sessions[item.id];
        if (session?.ownerIds?.includes(POKEIDLE_OWNER)) {
          const owners = session.ownerIds.filter(owner => owner !== POKEIDLE_OWNER);
          if (owners.length) session.ownerIds = owners;
          else await apply(item, current => stop(current, 'pokeidle-ineligible'));
        }
      }
      if (!state.automationPaused && !state.pausedChannels.includes(item.id) && pokeIdleEligible(state, item.id, now)) {
        enqueueChannel(state, item.id, POKEIDLE_OWNER);
      }
    }

    if (message.type === 'setSettings') {
      const ordered = state.channels.filter(c => state.sessions[c.id]).sort((a, b) => (a.priority || 0) - (b.priority || 0));
      for (const item of ordered) {
        const session = state.sessions[item.id];
        const overTotal = session.transport !== 'irc' && Object.values(state.sessions).filter(value => value.transport !== 'irc').length > state.settings.maxConcurrent;
        const overVideo = item.platform === 'kick' && session.media === 'live' && Object.entries(state.sessions).filter(([id, s]) => s.media === 'live' && state.channels.some(c => c.id === id && c.platform === 'kick')).length > state.settings.maxKickLives;
        if (!overTotal && !overVideo) continue;
        const owners = session.ownerIds || ['manual'];
        await stop(item, 'resource-limit');
        for (const owner of owners) enqueueChannel(state, item.id, owner);
      }
    }
    if (['tick', 'resumeAutomation', 'addSchedule', 'toggleSchedule', 'removeSchedule', 'setLiveWatch', 'liveWatchSnapshot', 'pokeidleKickSnapshot'].includes(message.type)) {
      for (const request of dueSchedules(state, now)) {
        if (state.sessions[request.id]) {
          const session = state.sessions[request.id];
          session.ownerIds = [...new Set([...(session.ownerIds || ['manual']), request.owner])];
        } else enqueueChannel(state, request.id, request.owner);
      }
      for (const item of state.channels.filter(c => state.sessions[c.id])) {
        const session = state.sessions[item.id];
        const expired = state.settings.sessionMinutes > 0 && now - session.openedAt >= state.settings.sessionMinutes * 60000;
        if (!scheduledOwnersAlive(state, session, now, [...(state.pokeidle.enabled ? [POKEIDLE_OWNER] : []), ...(state.liveWatch.enabled ? [LIVE_WATCH_OWNER] : [])]) || expired) {
          removeQueued(state, item.id);
          await apply(item, current => stop(current, expired ? 'duration-limit' : 'schedule-ended'));
          if (expired && !state.pausedChannels.includes(item.id)) state.pausedChannels.push(item.id);
          continue;
        }
        const failed = session.playback?.error || session.health?.playbackError || session.health?.connection === 'offline';
        if (session.transport !== 'irc' && !state.automationPaused && state.settings.autoReconnect && failed && !state.pausedChannels.includes(item.id) && (session.retryCount || 0) < 3 && now >= (session.nextRetryAt || 0) && api.tabs.reload) {
          session.retryCount = (session.retryCount || 0) + 1;
          session.nextRetryAt = now + 60000 * 2 ** session.retryCount;
          try { await api.tabs.reload(session.tabId); } catch { warnings.push(`${item.name}: falha na tentativa de reconexão.`); }
        }
      }
    }
    await drain();
    if (twitchChat) {
      await twitchChat.reconcile(state.channels.filter(item => state.sessions[item.id]?.transport === 'irc').map(item => item.name));
      state.twitchChat = publicTwitchChat(await twitchChat.status());
    }
    const summary = rewardSummary(state, now);
    const reminders = [...summary.reminders, ...healthReminders(state, now), ...warnings.map(message => ({ id: `operation:${message}`, title: 'Confira uma sessão', message }))];
    const active = new Set(state.activeReminderIds);
    const current = new Set(reminders.map(reminder => reminder.id));
    for (const alert of state.alerts) if (alert.key && active.has(alert.key) && !current.has(alert.key)) { alert.resolvedAt = now; alert.read = true; }
    for (const reminder of reminders) {
      if (active.has(reminder.id)) continue;
      const alert = { ...reminder, key: reminder.id, id: `${reminder.id}:${now}`, at: now, read: false };
      state.alerts.push(alert);
      if (state.settings.notifications && api.notifications?.create) {
        try { await api.notifications.create(alert.id, { type: 'basic', iconUrl: api.runtime.getURL('icon.png'), title: reminder.title, message: reminder.message }); }
        catch { /* O aviso permanece no painel caso notificações não estejam disponíveis. */ }
      }
    }
    state.activeReminderIds = [...current];
    state.alerts = state.alerts.slice(-100);
    if (message.type === 'status' || message.type === 'tick') for (const session of Object.values(state.sessions)) {
      if (api.tabs.sendMessage && Number.isInteger(session.tabId)) {
        void api.tabs.sendMessage(session.tabId, { type: 'requestSessionHealth' }).catch(() => {});
        if (session.media === 'live') void api.tabs.sendMessage(session.tabId, { type: 'requestPlayerTelemetry' }).catch(() => {});
      }
    }
    await save();
    return message.type === 'pokeidleSnapshot' ? { accepted: true } : { ...state, summary, warnings };
  };
}
