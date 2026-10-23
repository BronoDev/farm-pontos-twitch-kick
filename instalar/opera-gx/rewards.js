export const DEFAULT_REWARDS_SETTINGS = Object.freeze({
  maxConcurrent: 3,
  maxKickLives: 2,
  sessionMinutes: 0,
  notifications: true,
  autoReconnect: false
});

const LIMITS = { bonuses: 300, measurements: 2000, schedules: 200 };
const MINUTE = 60_000;
let sequence = 0;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} inválido.`);
  return value;
}

function text(value, label, max, required = false) {
  if (typeof value !== 'string') throw new Error(`${label} deve ser texto.`);
  const result = value.trim();
  if ((required && !result) || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) throw new Error(`${label} inválido.`);
  return result;
}

function identifier(value, label = 'Identificador') {
  const result = text(value, label, 120, true);
  if (!/^[a-zA-Z0-9:_-]+$/.test(result)) throw new Error(`${label} inválido.`);
  return result;
}

function number(value, label, min = 0, max = Number.MAX_SAFE_INTEGER, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`${label} deve ser um número válido entre ${min} e ${max}.`);
  return value;
}

function bool(value, label) {
  if (typeof value !== 'boolean') throw new Error(`${label} deve ser sim ou não.`);
  return value;
}

function timestamp(value, label, nullable = false) {
  if (value === null && nullable) return null;
  return number(value, label, 0, 8_640_000_000_000_000, true);
}

function https(value) {
  const result = text(value, 'Link da fonte', 2048);
  if (!result) return '';
  let url;
  try { url = new URL(result); } catch { throw new Error('O link da fonte deve ser HTTPS válido.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('O link da fonte deve ser HTTPS e não pode incluir credenciais.');
  return url.href;
}

function channelReference(state, value) {
  const id = identifier(value, 'Canal');
  if (id !== 'global' && !state.channels?.some(channel => channel.id === id)) throw new Error('Selecione um canal cadastrado ou o acompanhamento global.');
  return id;
}

function idFor(state, prefix, now) {
  const ids = new Set([...state.bonuses, ...state.measurements, ...state.schedules].map(item => item.id));
  let id;
  do {
    id = globalThis.crypto?.randomUUID?.() || `${prefix}-${now.toString(36)}-${++sequence}`;
  } while (ids.has(id));
  return id;
}

function bonusRecord(value) {
  const item = object(value, 'Bônus');
  return {
    id: identifier(item.id),
    channelId: identifier(item.channelId, 'Canal'),
    title: text(item.title, 'Nome do bônus', 120, true),
    requirements: text(item.requirements ?? '', 'Requisitos', 2000),
    sourceUrl: https(item.sourceUrl ?? ''),
    verified: bool(item.verified ?? false, 'Regras conferidas'),
    requirementsMet: bool(item.requirementsMet ?? false, 'Requisitos cumpridos'),
    requiredMinutes: number(item.requiredMinutes ?? 0, 'Minutos necessários', 0, 43_200),
    pointCost: number(item.pointCost ?? 0, 'Custo em pontos'),
    cooldownMinutes: number(item.cooldownMinutes ?? 0, 'Intervalo de resgate', 0, 525_600),
    expiresAt: timestamp(item.expiresAt ?? null, 'Prazo', true),
    lastClaimedAt: timestamp(item.lastClaimedAt ?? null, 'Último resgate', true),
    completed: bool(item.completed ?? false, 'Resgatado')
  };
}

function measurementRecord(value) {
  const item = object(value, 'Medição');
  const xp = item.xp === undefined || item.xp === null ? null : number(item.xp, 'XP');
  const points = item.points === undefined || item.points === null ? null : number(item.points, 'Pontos');
  if (xp === null && points === null) throw new Error('Informe ao menos um saldo de XP ou pontos.');
  return {
    id: identifier(item.id),
    channelId: identifier(item.channelId, 'Canal'),
    xp,
    points,
    at: timestamp(item.at, 'Data da medição'),
    source: 'manual',
    note: text(item.note ?? '', 'Observação', 500)
  };
}

function scheduleRecord(value) {
  const item = object(value, 'Agenda');
  if (!Array.isArray(item.channelIds) || !item.channelIds.length || item.channelIds.length > 100) throw new Error('Escolha de 1 a 100 canais para a agenda.');
  const channelIds = [...new Set(item.channelIds.map(id => identifier(id, 'Canal da agenda')))];
  if (channelIds.includes('global')) throw new Error('A agenda precisa de canais de transmissão.');
  const startsAt = timestamp(item.startsAt, 'Início da agenda');
  const endsAt = timestamp(item.endsAt, 'Fim da agenda');
  if (endsAt <= startsAt) throw new Error('O fim da agenda deve ser depois do início.');
  return {
    id: identifier(item.id),
    channelIds,
    startsAt,
    endsAt,
    enabled: bool(item.enabled ?? true, 'Agenda ativa'),
    startedAt: timestamp(item.startedAt ?? null, 'Início registrado', true),
    endedAt: timestamp(item.endedAt ?? null, 'Fim registrado', true)
  };
}

function settingsRecord(value, strict = false) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (strict) {
    object(value, 'Preferências');
    if (Object.keys(input).some(key => !Object.hasOwn(DEFAULT_REWARDS_SETTINGS, key))) throw new Error('Preferência desconhecida.');
  }
  const result = { ...DEFAULT_REWARDS_SETTINGS };
  for (const key of Object.keys(result)) {
    if (input[key] === undefined) continue;
    try {
      if (typeof result[key] === 'boolean') result[key] = bool(input[key], 'Preferência');
      else result[key] = number(input[key], key === 'sessionMinutes' ? 'Duração máxima' : 'Limite de sessões', key === 'sessionMinutes' ? 0 : 1, key === 'sessionMinutes' ? 1440 : 12, true);
    } catch (error) { if (strict) throw error; }
  }
  return result;
}

function validRecords(input, parse, limit) {
  if (!Array.isArray(input)) return [];
  const ids = new Set();
  const result = [];
  for (const item of input) {
    try {
      const record = parse(item);
      if (!ids.has(record.id)) { ids.add(record.id); result.push(record); }
    } catch { /* Registros corrompidos não viram saldos ou bônus inventados. */ }
  }
  return result.slice(-limit);
}

export function normalizeRewardsState(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  return {
    bonuses: validRecords(input.bonuses, bonusRecord, LIMITS.bonuses),
    measurements: validRecords(input.measurements, measurementRecord, LIMITS.measurements),
    schedules: validRecords(input.schedules, scheduleRecord, LIMITS.schedules),
    settings: settingsRecord(input.settings)
  };
}

function find(items, id, label) {
  identifier(id);
  const item = items.find(record => record.id === id);
  if (!item) throw new Error(`${label} não encontrado.`);
  return item;
}

function capacity(state, collection) {
  if (state[collection].length >= LIMITS[collection]) throw new Error('Limite de registros atingido. Remova registros antigos antes de adicionar novos.');
}

export function applyRewardsCommand(state, message, now = Date.now()) {
  timestamp(now, 'Data atual');
  object(message, 'Comando');
  switch (message.type) {
    case 'addBonus': {
      capacity(state, 'bonuses');
      const input = object(message.bonus, 'Bônus');
      channelReference(state, input.channelId);
      const item = bonusRecord({ ...input, id: idFor(state, 'bonus', now), lastClaimedAt: null, completed: false });
      state.bonuses.push(item);
      return true;
    }
    case 'updateBonus': {
      const item = find(state.bonuses, message.id, 'Bônus');
      const patch = object(message.patch, 'Alteração do bônus');
      const allowed = ['channelId', 'title', 'requirements', 'sourceUrl', 'verified', 'requirementsMet', 'requiredMinutes', 'pointCost', 'cooldownMinutes', 'expiresAt', 'completed'];
      if (Object.keys(patch).some(key => !allowed.includes(key))) throw new Error('Campo de bônus desconhecido.');
      const updated = bonusRecord({ ...item, ...patch });
      channelReference(state, updated.channelId);
      Object.assign(item, updated);
      return true;
    }
    case 'removeBonus':
      find(state.bonuses, message.id, 'Bônus');
      state.bonuses = state.bonuses.filter(item => item.id !== message.id);
      return true;
    case 'claimBonus': {
      const item = find(state.bonuses, message.id, 'Bônus');
      if (item.completed) throw new Error('Esse bônus já está marcado como resgatado.');
      if (item.lastClaimedAt !== null && now < item.lastClaimedAt + item.cooldownMinutes * MINUTE) throw new Error('O intervalo de resgate ainda não terminou.');
      if (!item.verified || !item.requirementsMet) throw new Error('Confirme as regras e os requisitos cumpridos antes de marcar o resgate.');
      // Marca manualmente um resgate já feito no serviço; não gasta pontos nem concede XP.
      item.lastClaimedAt = now;
      item.completed = item.cooldownMinutes === 0;
      item.requirementsMet = false;
      return true;
    }
    case 'addMeasurement': {
      capacity(state, 'measurements');
      const input = object(message.measurement, 'Medição');
      channelReference(state, input.channelId);
      const item = measurementRecord({ ...input, id: idFor(state, 'measurement', now), at: input.at ?? now });
      if (item.at > now + MINUTE) throw new Error('A medição não pode estar no futuro.');
      state.measurements.push(item);
      return true;
    }
    case 'removeMeasurement':
      find(state.measurements, message.id, 'Medição');
      state.measurements = state.measurements.filter(item => item.id !== message.id);
      return true;
    case 'addSchedule': {
      capacity(state, 'schedules');
      const input = object(message.schedule, 'Agenda');
      const item = scheduleRecord({ ...input, id: idFor(state, 'schedule', now), startedAt: null, endedAt: null });
      for (const id of item.channelIds) channelReference(state, id);
      if (item.endsAt <= now) throw new Error('A agenda precisa terminar no futuro.');
      state.schedules.push(item);
      return true;
    }
    case 'removeSchedule':
      find(state.schedules, message.id, 'Agenda');
      state.schedules = state.schedules.filter(item => item.id !== message.id);
      return true;
    case 'toggleSchedule': {
      const item = find(state.schedules, message.id, 'Agenda');
      const enabled = bool(message.enabled, 'Agenda ativa');
      if (enabled && item.endsAt <= now) throw new Error('Não é possível ativar uma agenda encerrada.');
      if (enabled && !item.enabled) { item.startedAt = null; item.endedAt = null; }
      item.enabled = enabled;
      return true;
    }
    case 'setSettings': {
      const input = object(message.settings, 'Preferências');
      state.settings = settingsRecord({ ...state.settings, ...input }, true);
      return true;
    }
    default:
      return false;
  }
}

export function rewardSummary(state, now = Date.now()) {
  const records = (state.measurements || []).filter(item => item.at <= now).slice().sort((a, b) => a.at - b.at);
  const ids = new Set([...(state.channels || []).map(item => item.id), ...records.map(item => item.channelId)]);
  const earnings = [...ids].map(channelId => {
    const samples = records.filter(item => item.channelId === channelId);
    const xpSamples = samples.filter(item => item.xp !== null);
    const pointSamples = samples.filter(item => item.points !== null);
    const first = xpSamples[0];
    const last = xpSamples.at(-1);
    const resetDetected = xpSamples.some((item, index) => index > 0 && item.xp < xpSamples[index - 1].xp);
    const hasInterval = xpSamples.length > 1 && last.at > first.at;
    const xpDelta = hasInterval && !resetDetected ? last.xp - first.xp : null;
    const durationMinutes = hasInterval ? (last.at - first.at) / MINUTE : null;
    return {
      channelId,
      xpDelta,
      durationMinutes,
      xpPerHour: xpDelta !== null ? xpDelta / (durationMinutes / 60) : null,
      latestXp: last?.xp ?? null,
      latestPoints: pointSamples.at(-1)?.points ?? null,
      latestPointsAt: pointSamples.at(-1)?.at ?? null,
      lastMeasuredAt: samples.at(-1)?.at ?? null,
      resetDetected,
      source: 'manual'
    };
  });
  const bonusItems = (state.bonuses || []).map(item => {
    const earning = earnings.find(entry => entry.channelId === item.channelId);
    // Um saldo anterior a um resgate pode já ter sido gasto; não o reutiliza.
    const points = item.lastClaimedAt === null || earning?.latestPointsAt > item.lastClaimedAt ? earning?.latestPoints ?? null : null;
    const session = state.sessions?.[item.channelId];
    const since = session ? Math.max(session.openedAt, item.lastClaimedAt ?? 0) : now;
    const observedMinutes = Number.isFinite(since) ? Math.max(0, (now - since) / MINUTE) : 0;
    const remainingMinutes = Math.max(0, item.requiredMinutes - observedMinutes);
    const remainingPoints = item.pointCost > 0 ? points === null ? null : Math.max(0, item.pointCost - points) : 0;
    const nextClaimAt = item.lastClaimedAt === null ? null : item.lastClaimedAt + item.cooldownMinutes * MINUTE;
    let status = 'pending';
    if (item.completed) status = 'claimed';
    else if (item.expiresAt !== null && item.expiresAt <= now) status = 'expired';
    else if (!item.verified) status = 'unverified';
    else if (nextClaimAt !== null && nextClaimAt > now) status = 'cooldown';
    else if (item.requirementsMet && remainingPoints === 0) status = 'ready';
    return { ...item, status, remainingMinutes, remainingPoints, observedMinutes, estimated: true, nextClaimAt };
  });
  const reminders = [];
  for (const item of bonusItems) {
    if (item.lastClaimedAt !== null && item.cooldownMinutes > 0 && item.nextClaimAt <= now && !['claimed', 'expired'].includes(item.status)) reminders.push({
      id: `bonus-cooldown-ended:${item.id}:${item.lastClaimedAt}`,
      channelId: item.channelId,
      title: `Intervalo terminado: ${item.title}`,
      message: 'O intervalo cadastrado terminou. Confira novamente requisitos e saldo no serviço antes de resgatar.'
    });
    if (item.status === 'ready') reminders.push({
      id: `bonus-ready:${item.id}:${item.lastClaimedAt ?? 'first'}`,
      channelId: item.channelId,
      title: `Confira o resgate: ${item.title}`,
      message: 'Seu checklist e os saldos informados indicam que vale conferir o resgate no serviço oficial. XP ainda não confirmado.'
    });
    if (item.expiresAt !== null && item.expiresAt > now && item.expiresAt - now <= 30 * MINUTE && !['claimed', 'expired'].includes(item.status)) reminders.push({
      id: `bonus-deadline:${item.id}:${item.expiresAt}`,
      channelId: item.channelId,
      title: `Prazo próximo: ${item.title}`,
      message: 'O prazo cadastrado termina em até 30 minutos. Confira os requisitos e o resgate no serviço oficial.'
    });
  }
  const global = earnings.find(item => item.channelId === 'global');
  const usable = earnings.filter(item => item.channelId !== 'global' && item.xpDelta !== null);
  const useGlobal = records.some(item => item.channelId === 'global' && item.xp !== null);
  const totals = useGlobal
    ? { xpDelta: global?.xpDelta ?? null, source: 'global-manual' }
    : { xpDelta: usable.length ? usable.reduce((sum, item) => sum + item.xpDelta, 0) : null, source: usable.length ? 'channel-manual' : 'none' };
  return { bonusItems, earnings, totals, reminders };
}
