import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRewardsState, applyRewardsCommand, rewardSummary } from '../src/rewards.js';

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function state() {
  return {
    channels: [{ id: 'kick:yetz' }, { id: 'twitch:outro' }],
    sessions: {},
    ...normalizeRewardsState()
  };
}

function addBonus(s, fields = {}, now = NOW) {
  applyRewardsCommand(s, { type: 'addBonus', bonus: { channelId: 'kick:yetz', title: 'Troca de pontos', ...fields } }, now);
  return s.bonuses.at(-1);
}

function measure(s, fields = {}, now = NOW) {
  applyRewardsCommand(s, { type: 'addMeasurement', measurement: { channelId: 'kick:yetz', xp: null, points: null, ...fields } }, now);
  return s.measurements.at(-1);
}

test('normalização migra estado vazio com limites sem criar bônus, saldos ou XP', () => {
  const migrated = normalizeRewardsState({ settings: { maxConcurrent: '4', maxKickLives: 30, sessionMinutes: -1, notifications: false } });
  assert.deepEqual(migrated.bonuses, []);
  assert.deepEqual(migrated.measurements, []);
  assert.deepEqual(migrated.schedules, []);
  assert.deepEqual(migrated.settings, { maxConcurrent: 3, maxKickLives: 2, sessionMinutes: 0, notifications: false, autoReconnect: false });
  assert.equal(rewardSummary({ ...state(), ...migrated }, NOW).totals.xpDelta, null);
});

test('regras conferidas, requisitos cumpridos e tempo estimado são conceitos distintos', () => {
  const s = state();
  s.sessions['kick:yetz'] = { openedAt: NOW - HOUR };
  const bonus = addBonus(s, { verified: true, requiredMinutes: 30 });
  const result = rewardSummary(s, NOW).bonusItems[0];
  assert.equal(result.remainingMinutes, 0);
  assert.equal(result.estimated, true);
  assert.equal(result.status, 'pending', 'tempo em aba não confirma bônus');
  applyRewardsCommand(s, { type: 'updateBonus', id: bonus.id, patch: { requirementsMet: true } }, NOW);
  assert.equal(rewardSummary(s, NOW).bonusItems[0].status, 'ready');
  const unverified = addBonus(s, { requirementsMet: true });
  assert.equal(rewardSummary(s, NOW).bonusItems.find(item => item.id === unverified.id).status, 'unverified');
});

test('resgate requer saldo informado sem confundir ausência e zero', () => {
  const s = state();
  addBonus(s, { pointCost: 200, verified: true, requirementsMet: true });
  let summary = rewardSummary(s, NOW).bonusItems[0];
  assert.equal(summary.remainingPoints, null);
  assert.equal(summary.status, 'pending');
  measure(s, { points: 0 });
  summary = rewardSummary(s, NOW).bonusItems[0];
  assert.equal(summary.remainingPoints, 200);
  measure(s, { points: 240 }, NOW + MINUTE);
  summary = rewardSummary(s, NOW + MINUTE).bonusItems[0];
  assert.equal(summary.remainingPoints, 0);
  assert.equal(summary.status, 'ready');
});

test('marca resgate manual, evita duplicação e saldo anterior ao resgate não autoriza outro', () => {
  const s = state();
  const bonus = addBonus(s, { verified: true, requirementsMet: true, cooldownMinutes: 10, pointCost: 100 });
  measure(s, { points: 200 }, NOW);
  const reminderId = rewardSummary(s, NOW).reminders[0].id;
  assert.equal(rewardSummary(s, NOW + 1).reminders[0].id, reminderId, 'ID estável permite deduplicar notificações');
  applyRewardsCommand(s, { type: 'claimBonus', id: bonus.id }, NOW + 1);
  assert.equal(bonus.completed, false);
  assert.equal(bonus.requirementsMet, false);
  assert.equal(rewardSummary(s, NOW + MINUTE).bonusItems[0].status, 'cooldown');
  assert.throws(() => applyRewardsCommand(s, { type: 'claimBonus', id: bonus.id }, NOW + MINUTE), /intervalo/);
  applyRewardsCommand(s, { type: 'updateBonus', id: bonus.id, patch: { requirementsMet: true } }, NOW + 11 * MINUTE);
  assert.equal(rewardSummary(s, NOW + 11 * MINUTE).bonusItems[0].status, 'pending', 'saldo anterior pode ter sido gasto');
  measure(s, { points: 120 }, NOW + 11 * MINUTE);
  const summary = rewardSummary(s, NOW + 11 * MINUTE);
  assert.equal(summary.bonusItems[0].status, 'ready');
  assert.notEqual(summary.reminders[0].id, reminderId);
});

test('bônus único e prazo encerrado possuem estados separados', () => {
  const s = state();
  const once = addBonus(s, { verified: true, requirementsMet: true });
  applyRewardsCommand(s, { type: 'claimBonus', id: once.id }, NOW);
  assert.equal(rewardSummary(s, NOW).bonusItems[0].status, 'claimed');
  assert.throws(() => applyRewardsCommand(s, { type: 'claimBonus', id: once.id }, NOW), /já está/);
  addBonus(s, { expiresAt: NOW - 1, verified: true, requirementsMet: true });
  assert.equal(rewardSummary(s, NOW).bonusItems[1].status, 'expired');
  const unconfirmed = addBonus(s);
  assert.throws(() => applyRewardsCommand(s, { type: 'claimBonus', id: unconfirmed.id }, NOW), /Confirme/);
});

test('XP e taxa usam duas medições e datas, nunca tempo de aba ou pontos', () => {
  const s = state();
  s.sessions['kick:yetz'] = { openedAt: NOW - 20 * HOUR };
  measure(s, { xp: 100, points: 4 }, NOW - HOUR);
  measure(s, { points: 999 }, NOW - MINUTE);
  assert.equal(rewardSummary(s, NOW).earnings[0].xpDelta, null);
  measure(s, { xp: 160 }, NOW);
  const earning = rewardSummary(s, NOW).earnings.find(item => item.channelId === 'kick:yetz');
  assert.equal(earning.xpDelta, 60);
  assert.equal(earning.durationMinutes, 60);
  assert.equal(earning.xpPerHour, 60);
  assert.equal(earning.latestPoints, 999);
  assert.equal(earning.latestXp, 160);
});

test('saldo menor sinaliza reset e não inventa ganho; global não soma com os canais', () => {
  const s = state();
  measure(s, { xp: 100 }, NOW - HOUR);
  measure(s, { xp: 10 }, NOW);
  const reset = rewardSummary(s, NOW).earnings.find(item => item.channelId === 'kick:yetz');
  assert.equal(reset.resetDetected, true);
  assert.equal(reset.xpDelta, null);
  assert.equal(reset.xpPerHour, null);
  measure(s, { channelId: 'global', xp: 1000 }, NOW - HOUR);
  measure(s, { channelId: 'global', xp: 1100 }, NOW);
  measure(s, { channelId: 'twitch:outro', xp: 100 }, NOW - HOUR);
  measure(s, { channelId: 'twitch:outro', xp: 200 }, NOW);
  assert.deepEqual(rewardSummary(s, NOW).totals, { xpDelta: 100, source: 'global-manual' });
});

test('mesma data não produz taxa infinita e amostras futuras não entram no resumo', () => {
  const s = state();
  measure(s, { xp: 0 }, NOW);
  measure(s, { xp: 100 }, NOW);
  measure(s, { xp: 200 }, NOW + MINUTE);
  const summary = rewardSummary(s, NOW);
  const earning = summary.earnings.find(item => item.channelId === 'kick:yetz');
  assert.equal(earning.xpDelta, null);
  assert.equal(earning.xpPerHour, null);
  assert.equal(earning.latestXp, 100);
});

test('valida números estritamente, referências de canal e URLs HTTPS sem credenciais', () => {
  const s = state();
  for (const bad of ['', '0', '10', NaN, Infinity, -1]) assert.throws(() => measure(s, { xp: bad }));
  assert.throws(() => measure(s), /ao menos/);
  assert.throws(() => measure(s, { xp: 1, channelId: 'kick:ausente' }), /canal cadastrado/);
  for (const sourceUrl of ['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com']) assert.throws(() => addBonus(s, { sourceUrl }), /HTTPS/);
  assert.throws(() => addBonus(s, { title: ' ' }), /Nome do bônus/);
  assert.throws(() => addBonus(s, { verified: 'true' }), /sim ou não/);
  assert.throws(() => measure(s, { xp: 1, at: NOW + 2 * MINUTE }, NOW), /futuro/);
  assert.equal(s.bonuses.length, 0);
  assert.equal(s.measurements.length, 0);
  const zero = measure(s, { xp: 0 });
  assert.equal(zero.xp, 0);
  assert.equal(zero.points, null);
});

test('preferências e agenda rejeitam limites inválidos antes de alterar estado', () => {
  const s = state();
  for (const settings of [{ maxConcurrent: 0 }, { maxKickLives: 13 }, { sessionMinutes: 1441 }, { maxConcurrent: 1.5 }, { notifications: 'true' }, { arbitrary: true }]) assert.throws(() => applyRewardsCommand(s, { type: 'setSettings', settings }, NOW));
  assert.equal(s.settings.maxConcurrent, 3);
  applyRewardsCommand(s, { type: 'setSettings', settings: { maxConcurrent: 1, maxKickLives: 1, sessionMinutes: 45 } }, NOW);
  assert.equal(s.settings.sessionMinutes, 45);
  assert.throws(() => applyRewardsCommand(s, { type: 'addSchedule', schedule: { channelIds: ['kick:yetz'], startsAt: NOW + HOUR, endsAt: NOW } }, NOW), /depois/);
  assert.throws(() => applyRewardsCommand(s, { type: 'addSchedule', schedule: { channelIds: ['kick:ausente'], startsAt: NOW, endsAt: NOW + HOUR } }, NOW), /canal cadastrado/);
  applyRewardsCommand(s, { type: 'addSchedule', schedule: { channelIds: ['kick:yetz', 'kick:yetz'], startsAt: NOW, endsAt: NOW + HOUR } }, NOW);
  assert.deepEqual(s.schedules[0].channelIds, ['kick:yetz']);
  applyRewardsCommand(s, { type: 'toggleSchedule', id: s.schedules[0].id, enabled: false }, NOW);
  assert.equal(s.schedules[0].enabled, false);
  assert.throws(() => applyRewardsCommand(s, { type: 'toggleSchedule', id: s.schedules[0].id, enabled: true }, NOW + 2 * HOUR), /encerrada/);
});

test('normalização descarta dados corrompidos e IDs duplicados sem converter saldos ausentes em zero', () => {
  const good = { id: 'm1', channelId: 'global', at: NOW, xp: 0, points: null };
  const result = normalizeRewardsState({ measurements: [good, { ...good, xp: 100 }, { id: 'm2', channelId: 'global', at: NOW, xp: '' }, null], bonuses: [{ id: 'b1', title: 'Bônus sem canal' }] });
  assert.equal(result.measurements.length, 1);
  assert.equal(result.measurements[0].xp, 0);
  assert.equal(result.measurements[0].points, null);
  assert.deepEqual(result.bonuses, []);
  assert.equal(result.measurements[0].source, 'manual');
});

test('lembrete de prazo possui ID estável e resgates concluídos não notificam novamente', () => {
  const s = state();
  const bonus = addBonus(s, { verified: true, requirementsMet: true, expiresAt: NOW + 10 * MINUTE });
  const first = rewardSummary(s, NOW).reminders.map(item => item.id);
  const second = rewardSummary(s, NOW + MINUTE).reminders.map(item => item.id);
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
  applyRewardsCommand(s, { type: 'claimBonus', id: bonus.id }, NOW + MINUTE);
  assert.deepEqual(rewardSummary(s, NOW + 2 * MINUTE).reminders, []);
});

test('remoções e comando desconhecido não afetam outros registros', () => {
  const s = state();
  const first = addBonus(s);
  const second = addBonus(s, { title: 'Outro' });
  const measurement = measure(s, { points: 10 });
  applyRewardsCommand(s, { type: 'removeBonus', id: first.id }, NOW);
  assert.deepEqual(s.bonuses.map(item => item.id), [second.id]);
  applyRewardsCommand(s, { type: 'removeMeasurement', id: measurement.id }, NOW);
  assert.equal(s.measurements.length, 0);
  assert.equal(applyRewardsCommand(s, { type: 'unknown' }, NOW), false);
});

test('histórico limitado rejeita novo registro sem apagar medições existentes', () => {
  const s = state();
  s.measurements = Array.from({ length: 2000 }, (_, index) => ({ id: `m${index}`, channelId: 'global', xp: index, points: null, at: NOW - 2000 + index, source: 'manual', note: '' }));
  assert.throws(() => measure(s, { channelId: 'global', xp: 2001 }), /Limite de registros/);
  assert.equal(s.measurements.length, 2000);
  assert.equal(s.measurements[0].id, 'm0');
});
