export function operationalState(raw, channels) {
  const valid = new Set(channels.map(c => c.id));
  return {
    queue: Array.isArray(raw.queue) ? [...new Set(raw.queue.filter(id => valid.has(id)))] : [],
    queueSources: raw.queueSources && typeof raw.queueSources === 'object' ? raw.queueSources : {},
    alerts: Array.isArray(raw.alerts) ? raw.alerts.slice(-100) : [],
    activeReminderIds: Array.isArray(raw.activeReminderIds) ? raw.activeReminderIds.filter(id => typeof id === 'string').slice(-1000) : [],
    sessionHistory: Array.isArray(raw.sessionHistory) ? raw.sessionHistory.slice(-300) : [],
    automationPaused: raw.automationPaused === true,
    pausedChannels: Array.isArray(raw.pausedChannels) ? raw.pausedChannels.filter(id => valid.has(id)) : []
  };
}

export function availableSlot(state, item) {
  if (Object.keys(state.sessions).length >= state.settings.maxConcurrent) return false;
  if (item.platform !== 'kick' || !state.kickLive) return true;
  return Object.entries(state.sessions).filter(([id, session]) => session.media === 'live' && state.channels.some(c => c.id === id && c.platform === 'kick')).length < state.settings.maxKickLives;
}

export function enqueueChannel(state, id, owner = 'manual') {
  if (!state.queue.includes(id)) state.queue.push(id);
  state.queueSources[id] = [...new Set([...(state.queueSources[id] || []), owner])];
}

export function removeQueued(state, id) {
  state.queue = state.queue.filter(value => value !== id);
  delete state.queueSources[id];
}

export function scheduledOwnersAlive(state, session, now, extraOwners = []) {
  const owners = session.ownerIds || ['manual'];
  return owners.some(owner => owner === 'manual' || extraOwners.includes(owner) || state.schedules.some(s => s.id === owner && s.enabled && now >= s.startsAt && now < s.endsAt));
}

export function dueSchedules(state, now) {
  const requests = [];
  for (const schedule of state.schedules) {
    if (now >= schedule.endsAt && schedule.startedAt && !schedule.endedAt) schedule.endedAt = now;
    if (state.automationPaused || !schedule.enabled || schedule.startedAt || now < schedule.startsAt || now >= schedule.endsAt) continue;
    schedule.startedAt = now;
    for (const id of schedule.channelIds) {
      if (!state.pausedChannels.includes(id)) requests.push({ id, owner: schedule.id });
    }
  }
  return requests;
}

export function healthReminders(state, now) {
  const reminders = [];
  for (const item of state.channels) {
    const session = state.sessions[item.id];
    if (!session) continue;
    const health = session.health;
    const playback = session.playback;
    const add = (kind, message) => reminders.push({ id: `${kind}:${item.id}`, title: item.name, message, channelId: item.id });
    if (health?.login === 'signed-out') add('login', 'O site exibiu um pedido de login. Confira sua conta.');
    if (health?.connection === 'offline') add('offline', 'A página reportou conexão indisponível.');
    if (session.media === 'live' && playback) {
      if (playback.error) add('player-error', 'O player reportou erro. Abra a aba para conferir.');
      else if (!playback.playing) add('player-stopped', 'A última amostra não confirmou reprodução. Uma pausa voluntária é preservada.');
      if (playback.height > 0 && playback.targetHeight > 0 && playback.height > playback.targetHeight) add('quality', `Amostra ${playback.height}p acima da opção solicitada (${playback.targetHeight}p).`);
    }
    if (health?.live === 'offline') add('stream-offline', 'A página indicou canal fora do ar.');
  }
  return reminders;
}
