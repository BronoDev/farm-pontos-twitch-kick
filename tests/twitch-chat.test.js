import test from 'node:test';
import assert from 'node:assert/strict';
import { createTwitchChat } from '../src/twitch-chat.js';

const TOKEN = 'testTokenValue1234567890';
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(initial = {}) {
  const data = structuredClone(initial);
  const writes = [];
  const calls = [];
  const sockets = [];
  const timers = new Map();
  let time = 1800000000000;
  let nextTimer = 0;
  const schedule = (callback, delay, interval = 0) => {
    const id = ++nextTimer;
    timers.set(id, { callback, at: time + delay, interval });
    return id;
  };
  const clock = {
    now: () => time,
    async advance(ms) {
      const end = time + ms;
      for (let count = 0; count < 1000; count++) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) { time = end; await flush(); return; }
        const [id, timer] = next;
        time = timer.at;
        if (timer.interval) timer.at += timer.interval;
        else timers.delete(id);
        timer.callback();
        await flush();
      }
      assert.fail('Temporizadores não devem girar sem limite');
    }
  };
  class Socket {
    constructor(url) { this.url = url; this.readyState = 0; this.listeners = {}; this.sent = []; sockets.push(this); }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    emit(name, event = {}) { for (const listener of this.listeners[name] || []) listener(event); }
    open() { this.readyState = 1; this.emit('open'); }
    message(data) { this.emit('message', { data }); }
    send(line) { assert.equal(this.readyState, 1); this.sent.push(line); }
    close() { this.readyState = 3; this.emit('close'); }
  }
  const responses = {
    validate: () => ({ status: 200, data: { client_id: 'client123456', login: 'usuario', scopes: ['chat:read'], expires_in: 3600 } }),
    streams: () => ({ status: 200, data: { data: [] } })
  };
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const result = await (url.includes('/oauth2/validate') ? responses.validate : responses.streams)(url, init);
    return { ok: result.status >= 200 && result.status < 300, status: result.status,
      json: async () => { if (result.status >= 400) assert.fail('Corpos de erros não devem ser lidos ou exibidos'); return result.data; } };
  };
  const api = { storage: { local: {
    get: async () => structuredClone(data),
    set: async value => { writes.push(structuredClone(value)); Object.assign(data, structuredClone(value)); }
  } } };
  const options = { fetch, WebSocket: Socket, setTimeout: (callback, delay) => schedule(callback, delay), clearTimeout: id => timers.delete(id),
    setInterval: (callback, delay) => schedule(callback, delay, delay), clearInterval: id => timers.delete(id), now: clock.now, random: () => 0 };
  const chat = createTwitchChat(api, options);
  const authenticate = async () => {
    const socket = sockets.at(-1);
    socket.open();
    socket.message(':tmi.twitch.tv 001 usuario :Welcome');
    await flush();
    return socket;
  };
  return { api, options, chat, data, writes, calls, sockets, responses, timers, clock, authenticate };
}

function noSecret(value) { assert.equal(JSON.stringify(value).includes(TOKEN), false, 'A interface pública não pode conter a credencial'); }

test('configura token local pela validação oficial sem retorná-lo ou copiá-lo para status', async () => {
  const b = harness();
  const state = await b.chat.configure({ token: `oauth:${TOKEN}`, login: 'USUARIO' });
  assert.equal(b.calls[0].url, 'https://id.twitch.tv/oauth2/validate');
  assert.equal(b.calls[0].init.headers.Authorization, `OAuth ${TOKEN}`);
  assert.equal(b.calls[0].init.credentials, 'omit');
  assert.equal(b.calls[0].init.redirect, 'error');
  assert.equal(state.configured, true);
  assert.equal(state.login, 'usuario');
  assert.equal(state.connected, false);
  assert.equal(b.data.twitchChatAuth.token, TOKEN);
  noSecret(state); noSecret(b.data.twitchChatStatus);
  assert.equal(b.sockets.length, 0, 'Configurar sem canais não abre transporte');
});

test('recusa credenciais inválidas, escopo ausente e login divergente com erros fixos', async () => {
  const b = harness();
  await assert.rejects(b.chat.configure({ token: `${TOKEN}\r\nJOIN #canal` }), /token OAuth/);
  assert.equal(b.calls.length, 0);
  b.responses.validate = () => ({ status: 401, data: { message: TOKEN } });
  await assert.rejects(b.chat.configure({ token: TOKEN }), error => { noSecret(error.message); return /validar/.test(error.message); });
  b.responses.validate = () => ({ status: 200, data: { client_id: 'client123456', login: 'usuario', scopes: [], expires_in: 3600 } });
  await assert.rejects(b.chat.configure({ token: TOKEN }), /chat:read/);
  b.responses.validate = () => ({ status: 200, data: { client_id: 'client123456', login: 'outro', scopes: ['chat:read'], expires_in: 3600 } });
  await assert.rejects(b.chat.configure({ token: TOKEN, login: 'usuario' }), /outro login/);
  noSecret(await b.chat.status());
  assert.equal(b.data.twitchChatAuth, undefined);
});

test('restauração revalida uma vez e não confia no login ou conexão pública persistidos', async () => {
  const b = harness({ twitchChatAuth: { token: TOKEN, login: 'forjado', clientId: 'forjado', expiresAt: 1 },
    twitchChatStatus: { configured: true, connected: true, login: 'forjado' } });
  const first = await b.chat.status();
  const second = await b.chat.status();
  assert.equal(b.calls.length, 1);
  assert.equal(first.login, 'usuario');
  assert.equal(first.connected, false);
  assert.deepEqual(second, first);
  assert.equal(b.data.twitchChatAuth.clientId, 'client123456');
  noSecret(b.data.twitchChatStatus);
});

test('uma conexão atende canais válidos; JOIN só depois de 001 e confirmação própria', async () => {
  const b = harness();
  await b.chat.configure({ token: TOKEN });
  await b.chat.reconcile(['TFToddy', 'tftoddy', 'bad\r\nname', 'matta']);
  assert.equal(b.sockets.length, 1);
  const socket = b.sockets[0];
  assert.equal(socket.url, 'wss://irc-ws.chat.twitch.tv:443');
  socket.open();
  assert.deepEqual(socket.sent, ['CAP REQ :twitch.tv/membership\r\n', `PASS oauth:${TOKEN}\r\n`, 'NICK usuario\r\n']);
  assert.equal(socket.sent.some(line => line.startsWith('JOIN ')), false);
  socket.message(':tmi.twitch.tv 001 usuario :Welcome');
  await flush();
  assert.equal(socket.sent.at(-1), 'JOIN #tftoddy\r\n');
  let state = await b.chat.status();
  assert.equal(state.connected, true);
  assert.equal(state.channels.tftoddy.joined, false);
  socket.message(':outro!outro@outro.tmi.twitch.tv JOIN #tftoddy\r\n:usuario!usuario@usuario.tmi.twitch.tv JOIN #tftoddy\r\n');
  await flush();
  state = await b.chat.status();
  assert.equal(state.channels.tftoddy.joined, true);
  assert.equal(state.channels.matta.joined, false);
  await b.clock.advance(750);
  assert.equal(socket.sent.at(-1), 'JOIN #matta\r\n');
  noSecret(state);
});

test('JOINs respeitam intervalo e repetição do mesmo conjunto não duplica adesões', async () => {
  const b = harness();
  await b.chat.configure({ token: TOKEN });
  await b.chat.reconcile(['canal1', 'canal2', 'canal3']);
  const socket = await b.authenticate();
  await b.chat.reconcile(['canal1', 'canal2', 'canal3']);
  assert.equal(socket.sent.filter(line => line.startsWith('JOIN')).length, 1);
  await b.clock.advance(1499);
  assert.equal(socket.sent.filter(line => line.startsWith('JOIN')).length, 2);
  await b.clock.advance(1);
  assert.equal(socket.sent.filter(line => line.startsWith('JOIN')).length, 3);
  await b.clock.advance(10000);
  assert.equal(socket.sent.filter(line => line.startsWith('JOIN')).length, 3);
});

test('mensagens de chat não são gravadas e PING recebe PONG sem emitir PRIVMSG', async () => {
  const b = harness();
  await b.chat.configure({ token: TOKEN });
  await b.chat.reconcile(['canal']);
  const socket = await b.authenticate();
  socket.message(':usuario!usuario@host JOIN #canal');
  await flush();
  const before = b.writes.length;
  socket.message(Array.from({ length: 50 }, () => ':alguem!alguem@host PRIVMSG #canal :texto privado nunca salvo').join('\r\n'));
  socket.message('PING :tmi.twitch.tv');
  await flush();
  assert.equal(b.writes.length, before);
  assert.equal(JSON.stringify(b.data).includes('texto privado'), false);
  assert.equal(socket.sent.at(-1), 'PONG :tmi.twitch.tv\r\n');
  await b.clock.advance(20000);
  assert.equal(socket.sent.at(-1), 'PING :chat-leve\r\n');
  assert.equal(socket.sent.some(line => line.startsWith('PRIVMSG')), false);
});

test('reconcile vazio encerra intencionalmente, preserva acesso e não reconecta', async () => {
  const b = harness();
  await b.chat.configure({ token: TOKEN });
  await b.chat.reconcile(['canal']);
  const socket = await b.authenticate();
  socket.message(':usuario!usuario@host JOIN #canal');
  await flush();
  const state = await b.chat.reconcile([]);
  assert.ok(socket.sent.includes('PART #canal\r\n'));
  assert.equal(socket.readyState, 3);
  assert.equal(state.connected, false);
  assert.equal(state.configured, true);
  assert.deepEqual(state.channels, {});
  assert.equal(b.timers.size, 0);
  await b.clock.advance(600000);
  assert.equal(b.sockets.length, 1);
  await b.chat.reconcile(['outro']);
  assert.equal(b.sockets.length, 2);
  await b.chat.disconnect({ forget: true });
  assert.equal(b.data.twitchChatAuth, null);
  assert.equal((await b.chat.status()).configured, false);
});

test('remoção de um canal emite PART e preserva os demais na mesma conexão', async () => {
  const b = harness();
  await b.chat.configure({ token: TOKEN });
  await b.chat.reconcile(['primeiro', 'segundo']);
  const socket = await b.authenticate();
  socket.message(':usuario!usuario@host JOIN #primeiro');
  await flush();
  await b.clock.advance(750);
  socket.message(':usuario!usuario@host JOIN #segundo');
  await flush();
  const state = await b.chat.reconcile(['segundo']);
  assert.equal(state.channels.segundo.joined, true);
  assert.equal(state.channels.primeiro, undefined);
  assert.ok(socket.sent.includes('PART #primeiro\r\n'));
  assert.equal(b.sockets.length, 1);
});

test('falhas de conexão têm somente três tentativas automáticas com espera crescente', async () => {
  const b = harness();
  await b.chat.configure({ token: TOKEN });
  await b.chat.reconcile(['canal']);
  for (const delay of [1000, 2000, 4000]) {
    b.sockets.at(-1).close();
    await flush();
    const before = b.sockets.length;
    await b.clock.advance(delay - 1);
    assert.equal(b.sockets.length, before);
    await b.clock.advance(1);
    assert.equal(b.sockets.length, before + 1);
  }
  b.sockets.at(-1).close();
  await flush();
  assert.equal((await b.chat.status()).retryCount, 3);
  assert.match((await b.chat.status()).error, /três tentativas/);
  await b.clock.advance(600000);
  await b.chat.reconcile(['canal']);
  assert.equal(b.sockets.length, 4, 'Alarmes idempotentes não contornam o limite de reconexões');
  await b.chat.reconcile([]);
  await b.chat.reconcile(['canal']);
  assert.equal(b.sockets.length, 5);
});

test('recusa da autenticação IRC remove acesso privado e impede reconexão', async () => {
  const b = harness();
  await b.chat.configure({ token: TOKEN });
  await b.chat.reconcile(['canal']);
  const socket = b.sockets[0];
  socket.open();
  socket.message(':tmi.twitch.tv NOTICE * :Login authentication failed');
  await flush();
  const state = await b.chat.status();
  assert.equal(state.configured, false);
  assert.equal(state.connected, false);
  assert.equal(b.data.twitchChatAuth, null);
  assert.equal(b.timers.size, 0);
  noSecret(state);
  await b.clock.advance(600000);
  assert.equal(b.sockets.length, 1);
});

test('validade expirada encerra o socket sem considerar chat conectado', async () => {
  const b = harness();
  b.responses.validate = () => ({ status: 200, data: { client_id: 'client123456', login: 'usuario', scopes: ['chat:read'], expires_in: 1 } });
  await b.chat.configure({ token: TOKEN });
  await b.chat.reconcile(['canal']);
  await b.authenticate();
  await b.clock.advance(20000);
  const state = await b.chat.status();
  assert.equal(state.configured, false);
  assert.equal(state.connected, false);
  assert.match(state.error, /expirou/);
  assert.equal(b.data.twitchChatAuth, null);
});

test('credencial expirada também é sinalizada quando nenhum canal está ativo', async () => {
  const b = harness();
  b.responses.validate = () => ({ status: 200, data: { client_id: 'client123456', login: 'usuario', scopes: ['chat:read'], expires_in: 1 } });
  await b.chat.configure({ token: TOKEN });
  await b.clock.advance(1001);
  const state = await b.chat.status();
  assert.equal(state.configured, false);
  assert.equal(b.data.twitchChatAuth, null);
  assert.match(state.error, /expirou/);
});

test('socket sem respostas não permanece exibido como conectado indefinidamente', async () => {
  const b = harness();
  await b.chat.configure({ token: TOKEN });
  await b.chat.reconcile(['canal']);
  await b.authenticate();
  assert.equal((await b.chat.status()).connected, true);
  await b.clock.advance(80000);
  const state = await b.chat.status();
  assert.equal(state.connected, false);
  assert.equal(state.retryCount, 1);
  assert.equal(b.sockets[0].readyState, 3);
});

test('Helix consulta os canais em lote e separa live, offline e erro desconhecido', async () => {
  const b = harness();
  await b.chat.configure({ token: TOKEN });
  b.responses.streams = () => ({ status: 200, data: { data: [{ user_login: 'CANAL1', type: 'live' }] } });
  assert.deepEqual(await b.chat.liveStatuses(['canal1', 'canal2', 'canal1']), { canal1: true, canal2: false });
  const call = b.calls.at(-1);
  const url = new URL(call.url);
  assert.equal(url.origin, 'https://api.twitch.tv');
  assert.deepEqual(url.searchParams.getAll('user_login'), ['canal1', 'canal2']);
  assert.equal(call.init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(call.init.headers['Client-ID'], 'client123456');
  assert.equal(call.url.includes(TOKEN), false);
  b.responses.streams = () => ({ status: 429, data: { message: TOKEN } });
  assert.deepEqual(await b.chat.liveStatuses(['canal1', 'canal2']), { canal1: null, canal2: null });
  b.responses.streams = () => ({ status: 200, data: { data: [null] } });
  assert.deepEqual(await b.chat.liveStatuses(['canal1']), { canal1: null });
  b.responses.streams = () => ({ status: 200, data: { data: [] } });
  assert.deepEqual(await b.chat.liveStatuses(['canal1']), { canal1: false });
  assert.equal((await b.chat.status()).error, '', 'Uma consulta recuperada não conserva o erro transitório anterior');
  noSecret(await b.chat.status());
});

test('401 de Helix revoga conexão em vez de informar todos offline', async () => {
  const b = harness();
  await b.chat.configure({ token: TOKEN });
  await b.chat.reconcile(['canal']);
  await b.authenticate();
  b.responses.streams = () => ({ status: 401, data: { message: TOKEN } });
  assert.deepEqual(await b.chat.liveStatuses(['canal']), { canal: null });
  assert.equal((await b.chat.status()).configured, false);
  assert.equal(b.sockets[0].readyState, 3);
});

test('consulta Helix pendente não bloqueia PART e fechamento imediato do chat', { timeout: 1000 }, async () => {
  const b = harness();
  await b.chat.configure({ token: TOKEN });
  await b.chat.reconcile(['canal']);
  const socket = await b.authenticate();
  socket.message(':usuario!usuario@host JOIN #canal');
  await flush();
  let complete;
  b.responses.streams = () => new Promise(resolve => { complete = resolve; });
  const pending = b.chat.liveStatuses(['canal']);
  await flush();
  const state = await b.chat.reconcile([]);
  assert.equal(state.connected, false);
  assert.equal(socket.readyState, 3);
  assert.ok(socket.sent.includes('PART #canal\r\n'));
  assert.equal(state.configured, true);
  complete({ status: 200, data: { data: [] } });
  assert.deepEqual(await pending, { canal: false });
});

test('401 de consulta antiga não revoga token novo configurado durante o fetch', { timeout: 1000 }, async () => {
  const b = harness();
  await b.chat.configure({ token: TOKEN });
  let complete;
  b.responses.streams = () => new Promise(resolve => { complete = resolve; });
  const pending = b.chat.liveStatuses(['canal']);
  await flush();
  const nextToken = 'nextTokenValue9876543210';
  const configured = await b.chat.configure({ token: nextToken });
  assert.equal(configured.configured, true);
  complete({ status: 401, data: null });
  assert.deepEqual(await pending, { canal: null });
  const state = await b.chat.status();
  assert.equal(state.configured, true);
  assert.equal(state.error, '');
  assert.equal(b.data.twitchChatAuth.token, nextToken);
  assert.equal(JSON.stringify(state).includes(nextToken), false);
});

test('tempo limite de rede termina com erro sanitizado e cancela a requisição', async () => {
  const b = harness();
  let signal;
  const chat = createTwitchChat(b.api, { ...b.options, fetch: async (_, init) => { signal = init.signal; return new Promise(() => {}); } });
  const configured = chat.configure({ token: TOKEN });
  const rejected = assert.rejects(configured, cause => { noSecret(cause.message); return /validar/.test(cause.message); });
  await flush();
  await b.clock.advance(8000);
  await rejected;
  assert.equal(signal.aborted, true);
  noSecret(await chat.status());
});
