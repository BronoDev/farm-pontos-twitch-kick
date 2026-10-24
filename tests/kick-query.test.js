import test from 'node:test';
import assert from 'node:assert/strict';
import { createKickQueries, collectLiveWatch, normalizeLiveWatch } from '../src/live-watch.js';

const BASE = 1_800_000_000_000;
const item = name => ({ platform: 'kick', name, id: `kick:${name}` });
const response = (live = true) => ({ ok: true, status: 200, json: async () => ({ livestream: live ? { id: 123 } : null }) });
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };

function clock() {
  let now = BASE;
  let nextTimer = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout: (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    advance: async ms => {
      const target = now + ms;
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
        await flush();
      }
      now = target;
      await flush();
    },
    timerCount: () => timers.size
  };
}

test('consultas Kick validam os canais e usam somente o endpoint fixo sem cookies ou redirects', async () => {
  const c = clock();
  const calls = [];
  const queries = createKickQueries({ ...c, fetch: async (url, options) => { calls.push({ url, options }); return response(); } });
  const values = await queries.collect([item('yetz'), item('yetz'), item('../private'), item('canal?token=secret'), { ...item('outro'), id: 'kick:diferente' }, { ...item('nao_kick'), platform: 'twitch' }]);
  assert.deepEqual(values, { 'kick:yetz': { live: true, checkedAt: BASE } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://kick.com/api/v2/channels/yetz');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(c.timerCount(), 0);
});

test('cache de um minuto conserva a hora da consulta real e expira sem ser estendido por leituras', async () => {
  const c = clock();
  let calls = 0;
  const queries = createKickQueries({ ...c, fetch: async () => { calls++; return response(calls === 1); } });
  const first = await queries.collect([item('yetz')]);
  await c.advance(59000);
  const cached = await queries.collect([item('yetz')]);
  assert.deepEqual(cached, first);
  assert.equal(calls, 1);
  await c.advance(1000);
  const second = await queries.collect([item('yetz')]);
  assert.deepEqual(second['kick:yetz'], { live: false, checkedAt: BASE + 60000 });
  assert.equal(calls, 2);
});

test('uma consulta manual pode atualizar um sucesso em cache sem duplicar uma consulta já em voo', async () => {
  const c = clock();
  let calls = 0;
  let resolveRequest;
  const queries = createKickQueries({ ...c, fetch: () => { calls++; return new Promise(resolve => { resolveRequest = resolve; }); } });
  const first = queries.collect([item('yetz')]);
  const concurrent = queries.collect([item('yetz')], { force: true });
  await flush();
  assert.equal(calls, 1);
  resolveRequest(response());
  assert.deepEqual(await first, await concurrent);
  await c.advance(1000);
  const refresh = queries.collect([item('yetz')], { force: true });
  await flush();
  assert.equal(calls, 2);
  resolveRequest(response(false));
  assert.deepEqual((await refresh)['kick:yetz'], { live: false, checkedAt: BASE + 1000 });
});

test('o limite de três requisições vale para vários lotes simultâneos da mesma fábrica', async () => {
  const c = clock();
  let active = 0;
  let peak = 0;
  let calls = 0;
  const releases = [];
  const queries = createKickQueries({ ...c, fetch: () => {
    calls++; active++; peak = Math.max(active, peak);
    return new Promise(resolve => releases.push(() => resolve({ ...response(), json: async () => { active--; return { livestream: { id: 1 } }; } })));
  } });
  const first = queries.collect(Array.from({ length: 6 }, (_, index) => item(`first_${index}`)));
  const second = queries.collect(Array.from({ length: 4 }, (_, index) => item(`second_${index}`)));
  await flush();
  assert.equal(calls, 3);
  for (let round = 0; round < 10; round++) {
    for (const release of releases.splice(0)) release();
    await flush();
  }
  await Promise.all([first, second]);
  assert.equal(calls, 10);
  assert.equal(peak, 3);
  assert.equal(active, 0);
});

test('HTTP403 impõe espera de cinco minutos inclusive para a atualização manual', async () => {
  const c = clock();
  let calls = 0;
  const queries = createKickQueries({ ...c, fetch: async () => { calls++; return { ok: false, status: 403, json: () => assert.fail('Não ler o corpo de um erro') }; } });
  const first = (await queries.collect([item('yetz')]))['kick:yetz'];
  assert.deepEqual(first, { live: null, checkedAt: BASE, errorCode: 'forbidden', nextRetryAt: BASE + 300000, attempts: 1 });
  await c.advance(299999);
  assert.deepEqual((await queries.collect([item('yetz')], { force: true }))['kick:yetz'], first);
  assert.equal(calls, 1);
  await c.advance(1);
  const retried = (await queries.collect([item('yetz')]))['kick:yetz'];
  assert.equal(calls, 2);
  assert.equal(retried.checkedAt, BASE + 300000);
  assert.equal(retried.attempts, 2);
});

for (const [header, delay] of [['120', 120000], ['3600', 600000], ['0', 60000], ['inválido', 60000], [new Date(BASE + 180000).toUTCString(), 180000]]) {
  test(`HTTP429 respeita Retry-After ${header} com espera limitada`, async () => {
    const c = clock();
    let calls = 0;
    const queries = createKickQueries({ ...c, fetch: async () => { calls++; return { ok: false, status: 429, headers: { get: name => name === 'retry-after' ? header : null } }; } });
    const value = (await queries.collect([item('yetz')]))['kick:yetz'];
    assert.equal(value.live, null);
    assert.equal(value.errorCode, 'rate-limited');
    assert.equal(value.nextRetryAt, BASE + delay);
    await c.advance(delay - 1);
    await queries.collect([item('yetz')], { force: true });
    assert.equal(calls, 1);
  });
}

test('erros de servidor, rede e formato usam apenas motivos públicos e não viram offline', async () => {
  const c = clock();
  const requests = [
    async () => ({ ok: false, status: 503, json: () => assert.fail('Não ler conteúdo privado de erro') }),
    async () => { throw new Error('conteúdo privado não deve aparecer'); },
    async () => ({ ok: true, json: async () => ({ arbitrary: true }) }),
    async () => ({ ok: true, json: async () => { throw Error('conteúdo privado não deve aparecer'); } })
  ];
  let count = 0;
  const queries = createKickQueries({ ...c, fetch: () => requests[count++]() });
  const results = await queries.collect(requests.map((_, index) => item(`case_${index}`)));
  assert.equal(Object.keys(results).length, 4);
  assert.ok(Object.values(results).every(value => value.live === null && value.nextRetryAt === BASE + 60000));
  assert.equal(results['kick:case_2'].errorCode, 'invalid-response');
  assert.ok(!JSON.stringify(results).includes('privado'));
});

for (const bodyHangs of [false, true]) {
  test(`deadline de oito segundos cancela a consulta com ${bodyHangs ? 'corpo' : 'resposta'} pendente`, async () => {
    const c = clock();
    let signal;
    const queries = createKickQueries({ ...c, fetch: async (_url, options) => {
      signal = options.signal;
      return bodyHangs ? { ok: true, json: () => new Promise(() => {}) } : new Promise(() => {});
    } });
    let finished = false;
    const pending = queries.collect([item('yetz')]).then(result => { finished = true; return result; });
    await flush();
    await c.advance(7999);
    assert.equal(finished, false);
    await c.advance(1);
    const value = (await pending)['kick:yetz'];
    assert.equal(signal.aborted, true);
    assert.equal(value.live, null);
    assert.equal(value.checkedAt, BASE + 8000);
    assert.equal(value.errorCode, 'unavailable');
    assert.equal(c.timerCount(), 0);
  });
}

test('metadados persistidos conservam a espera entre instâncias e cópias públicas não alteram o cache', async () => {
  const c = clock();
  const first = createKickQueries({ ...c, fetch: async () => ({ ok: false, status: 429, headers: { get: () => '300' } }) });
  await first.collect([item('yetz')]);
  const saved = first.snapshot();
  saved['kick:yetz'].privateField = 'não copiar';
  let calls = 0;
  const restored = createKickQueries({ ...c, initialSamples: saved, fetch: async () => { calls++; return response(); } });
  await c.advance(100000);
  const cached = (await restored.collect([item('yetz')], { force: true }))['kick:yetz'];
  assert.equal(calls, 0);
  assert.equal(cached.checkedAt, BASE);
  assert.equal(cached.nextRetryAt, BASE + 300000);
  assert.equal(cached.privateField, undefined);
  cached.live = true;
  assert.equal(restored.snapshot()['kick:yetz'].live, null);
  await c.advance(200000);
  assert.equal((await restored.collect([item('yetz')]))['kick:yetz'].live, true);
  assert.equal(calls, 1);
});

test('falha depois de uma confirmação online substitui o sucesso por desconhecido e preserva a espera', async () => {
  const c = clock();
  let calls = 0;
  const queries = createKickQueries({ ...c, fetch: async () => {
    calls++;
    return calls === 1 ? response() : { ok: false, status: 503 };
  } });
  assert.equal((await queries.collect([item('yetz')]))['kick:yetz'].live, true);
  await c.advance(1000);
  const failed = (await queries.collect([item('yetz')], { force: true }))['kick:yetz'];
  assert.deepEqual(failed, { live: null, checkedAt: BASE + 1000, errorCode: 'unavailable', nextRetryAt: BASE + 61000, attempts: 1 });
  assert.deepEqual(queries.snapshot()['kick:yetz'], failed);
  await c.advance(59000);
  assert.deepEqual((await queries.collect([item('yetz')], { force: true }))['kick:yetz'], failed);
  assert.equal(calls, 2);
  await c.advance(1000);
  const retried = (await queries.collect([item('yetz')]))['kick:yetz'];
  assert.equal(retried.live, null);
  assert.equal(retried.checkedAt, BASE + 61000);
  assert.equal(retried.attempts, 2);
  assert.equal(calls, 3);
});

test('reiniciar apenas o monitor conserva backoff Kick e normaliza somente metadados públicos', async () => {
  const c = clock();
  const channels = [item('yetz'), item('outro'), { platform: 'twitch', name: 'streamer', id: 'twitch:streamer' }];
  const state = normalizeLiveWatch({ enabled: true, channelIds: channels.map(value => value.id), statuses: {
    'kick:yetz': { live: null, checkedAt: BASE, errorCode: 'rate-limited', nextRetryAt: BASE + 300000, attempts: 2, privateBody: 'não copiar' },
    'kick:outro': { live: null, checkedAt: BASE, errorCode: 'corpo privado', nextRetryAt: BASE + 900000, attempts: 1001 },
    'twitch:streamer': { live: false, checkedAt: BASE, errorCode: 'rate-limited', nextRetryAt: BASE + 300000, attempts: 2 }
  } }, channels);
  assert.deepEqual(state.statuses['kick:yetz'], { live: null, checkedAt: BASE, errorCode: 'rate-limited', nextRetryAt: BASE + 300000, attempts: 2 });
  assert.deepEqual(state.statuses['kick:outro'], { live: null, checkedAt: BASE, nextRetryAt: BASE + 600000, attempts: 1000 });
  assert.deepEqual(state.statuses['twitch:streamer'], { live: false, checkedAt: BASE });
  let calls = 0;
  const restarted = createKickQueries({ ...c, fetch: async () => { calls++; return response(); } });
  restarted.seed(state.statuses);
  await c.advance(180000);
  const sample = (await restarted.collect([item('yetz')], { force: true }))['kick:yetz'];
  assert.equal(calls, 0);
  assert.equal(sample.checkedAt, BASE);
  assert.equal(sample.nextRetryAt, BASE + 300000);
  await c.advance(120000);
  assert.equal((await restarted.collect([item('yetz')]))['kick:yetz'].live, true);
  assert.equal(calls, 1);
});

test('monitor e fonte PokeIdle compartilham detalhes sem alterar o contrato boolean/null do monitor', async () => {
  const c = clock();
  let calls = 0;
  const queries = createKickQueries({ ...c, fetch: async () => { calls++; return response(); } });
  const state = { channels: [item('yetz'), { id: 'twitch:streamer', name: 'streamer', platform: 'twitch' }], liveWatch: { enabled: true, twitchMode: 'irc', channelIds: ['kick:yetz', 'twitch:streamer'] } };
  const details = {};
  const options = { kickQueries: queries, onKickResult: (id, value) => { details[id] = value; } };
  const chat = { liveStatuses: async names => { assert.deepEqual(names, ['streamer']); return { streamer: false }; } };
  assert.deepEqual(await collectLiveWatch(state, chat, options), { 'kick:yetz': true, 'twitch:streamer': false });
  assert.deepEqual(await collectLiveWatch(state, chat, options), { 'kick:yetz': true, 'twitch:streamer': false });
  assert.equal(calls, 1);
  assert.deepEqual(details, { 'kick:yetz': { live: true, checkedAt: BASE } });
});
