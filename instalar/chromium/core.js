import { normalizeRewardsState, applyRewardsCommand, rewardSummary } from './rewards.js';
import { operationalState, availableSlot, enqueueChannel, removeQueued, scheduledOwnersAlive, dueSchedules, healthReminders } from './automation.js';

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

export function createController(api) {
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
    const raw = await api.storage.local.get(['channels', 'sessions', 'kickLive', 'bonuses', 'measurements', 'schedules', 'settings', 'queue', 'queueSources', 'alerts', 'activeReminderIds', 'sessionHistory', 'automationPaused', 'pausedChannels']);
    const channels = Array.isArray(raw.channels) ? raw.channels : [];
    return { channels, sessions: raw.sessions || {}, kickLive: raw.kickLive !== false, ...normalizeRewardsState(raw), ...operationalState(raw, channels) };
  }
  async function alive(session, item) {
    if (!session) return false;
    try {
      const tab = await api.tabs.get(session.tabId);
      return matchesSession(tab.pendingUrl || tab.url, item, session);
    } catch { return false; }
  }
  return async function execute(message, sender = {}) {
    const state = await read();
    const now = Date.now();
    const contentTypes = ['kickContext', 'kickTelemetry', 'sessionContext', 'sessionHealth'];
    if (contentTypes.includes(message.type)) {
      const item = state.channels.find(c => state.sessions[c.id]?.tabId === sender.tab?.id);
      const session = item && state.sessions[item.id];
      if (!session || !matchesSession(sender.url || sender.tab?.url, item, session)) return { managed: false };
      if (message.type.startsWith('kick') && (item.platform !== 'kick' || session.media !== 'live')) return { managed: false };
      if (message.type === 'kickTelemetry') {
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
      if (message.type === 'kickTelemetry' || message.type === 'sessionHealth') await api.storage.local.set(state);
      return { managed: true };
    }
    const warnings = [];
    async function save() { await api.storage.local.set(state); }
    function history(id, session, reason) {
      state.sessionHistory.push({ channelId: id, openedAt: session.openedAt, endedAt: now, media: session.media || 'chat', reason });
      state.sessionHistory = state.sessionHistory.slice(-300);
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
      if (session && await alive(session, item)) await api.tabs.remove(session.tabId);
      if (session) history(item.id, session, reason);
      delete state.sessions[item.id];
      await save();
    }
    async function start(item, owners = ['manual']) {
      const existing = state.sessions[item.id];
      const media = item.platform === 'kick' && state.kickLive ? 'live' : 'chat';
      if (existing?.mode === 'background' && (existing.media || 'chat') === media) {
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
      state.sessions[item.id] = { tabId: tab.id, openedAt: now, mode: 'background', media, ownerIds: owners };
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
        const owners = (state.queueSources[id] || ['manual']).filter(owner => owner === 'manual' || state.schedules.some(s => s.id === owner && s.enabled && now < s.endsAt));
        if (!owners.length) { removeQueued(state, id); continue; }
        if (state.pausedChannels.includes(id)) { removeQueued(state, id); continue; }
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
    if (message.type === 'add') {
      const item = channel(message.platform, message.input);
      if (!state.channels.some(c => c.id === item.id)) state.channels.push(item);
    } else if (['start', 'stop', 'remove'].includes(message.type)) {
      const item = getItem(message.id);
      if (message.type === 'start') {
        state.pausedChannels = state.pausedChannels.filter(id => id !== item.id);
        await start(item);
      } else {
        removeQueued(state, item.id);
        if (!state.pausedChannels.includes(item.id)) state.pausedChannels.push(item.id);
        await stop(item);
        if (message.type === 'remove') {
          state.channels = state.channels.filter(c => c.id !== item.id);
          state.pausedChannels = state.pausedChannels.filter(id => id !== item.id);
          state.schedules.forEach(s => { s.channelIds = s.channelIds.filter(id => id !== item.id); });
        }
      }
    } else if (message.type === 'setKickLive') {
      if (typeof message.enabled !== 'boolean') throw new Error('Opção de vídeo inválida.');
      state.kickLive = message.enabled;
      await save();
      for (const item of state.channels.filter(c => c.platform === 'kick' && state.sessions[c.id])) await apply(item, current => start(current, state.sessions[current.id]?.ownerIds || ['manual']));
    } else if (message.type === 'startAll') {
      state.automationPaused = false;
      state.pausedChannels = [];
      for (const item of state.channels) enqueueChannel(state, item.id);
    } else if (message.type === 'stopAll') {
      state.queue = []; state.queueSources = {}; state.automationPaused = true;
      for (const item of state.channels) await apply(item, stop);
    } else if (message.type === 'setPriority') {
      if (!Number.isInteger(message.priority) || message.priority < 0 || message.priority > 100) throw new Error('Prioridade deve ser de 0 a 100.');
      getItem(message.id).priority = message.priority;
    } else if (message.type === 'openSession') {
      const item = getItem(message.id);
      const session = state.sessions[item.id];
      if (session) {
        await api.tabs.update(session.tabId, { active: true });
        const tab = await api.tabs.get(session.tabId);
        if (!await isAndroidGecko() && api.windows?.update && Number.isInteger(tab.windowId)) await api.windows.update(tab.windowId, { focused: true });
      } else await openUrl(sessionUrl(item, { media: item.platform === 'kick' && state.kickLive ? 'live' : 'chat' }));
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
    } else if (!['status', 'tick', 'tabRemoved'].includes(message.type) && !applyRewardsCommand(state, message, now)) throw new Error('Comando desconhecido.');

    if (message.type === 'setSettings') {
      const ordered = state.channels.filter(c => state.sessions[c.id]).sort((a, b) => (a.priority || 0) - (b.priority || 0));
      for (const item of ordered) {
        const session = state.sessions[item.id];
        const overTotal = Object.keys(state.sessions).length > state.settings.maxConcurrent;
        const overVideo = session.media === 'live' && Object.values(state.sessions).filter(s => s.media === 'live').length > state.settings.maxKickLives;
        if (!overTotal && !overVideo) continue;
        const owners = session.ownerIds || ['manual'];
        await stop(item, 'resource-limit');
        for (const owner of owners) enqueueChannel(state, item.id, owner);
      }
    }
    if (['tick', 'resumeAutomation', 'addSchedule', 'toggleSchedule', 'removeSchedule'].includes(message.type)) {
      for (const request of dueSchedules(state, now)) {
        if (state.sessions[request.id]) {
          const session = state.sessions[request.id];
          session.ownerIds = [...new Set([...(session.ownerIds || ['manual']), request.owner])];
        } else enqueueChannel(state, request.id, request.owner);
      }
      for (const item of state.channels.filter(c => state.sessions[c.id])) {
        const session = state.sessions[item.id];
        const expired = state.settings.sessionMinutes > 0 && now - session.openedAt >= state.settings.sessionMinutes * 60000;
        if (!scheduledOwnersAlive(state, session, now) || expired) {
          removeQueued(state, item.id);
          await apply(item, current => stop(current, expired ? 'duration-limit' : 'schedule-ended'));
          continue;
        }
        const failed = session.playback?.error || session.health?.playbackError || session.health?.connection === 'offline';
        if (!state.automationPaused && state.settings.autoReconnect && failed && !state.pausedChannels.includes(item.id) && (session.retryCount || 0) < 3 && now >= (session.nextRetryAt || 0) && api.tabs.reload) {
          session.retryCount = (session.retryCount || 0) + 1;
          session.nextRetryAt = now + 60000 * 2 ** session.retryCount;
          try { await api.tabs.reload(session.tabId); } catch { warnings.push(`${item.name}: falha na tentativa de reconexão.`); }
        }
      }
    }
    await drain();
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
      if (api.tabs.sendMessage) void api.tabs.sendMessage(session.tabId, { type: 'requestSessionHealth' }).catch(() => {});
    }
    await save();
    return { ...state, summary, warnings };
  };
}
