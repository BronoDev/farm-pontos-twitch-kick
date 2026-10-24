// Cliente de leitura do chat oficial. Estar no IRC não comprova audiência ou XP.
export function createTwitchChat(api, options = {}) {
  const request = options.fetch ?? globalThis.fetch?.bind(globalThis);
  const Socket = options.WebSocket ?? globalThis.WebSocket;
  const later = options.setTimeout ?? globalThis.setTimeout;
  const cancel = options.clearTimeout ?? globalThis.clearTimeout;
  const every = options.setInterval ?? globalThis.setInterval;
  const cancelEvery = options.clearInterval ?? globalThis.clearInterval;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const Abort = options.AbortController ?? globalThis.AbortController;
  const streamsError = 'Não foi possível consultar as lives Twitch agora. O estado anterior é preservado.';
  const channelName = value => typeof value === 'string' && /^[a-z0-9_]{1,25}$/i.test(value) ? value.toLowerCase() : null;
  const channelNames = values => [...new Set((Array.isArray(values) ? values.slice(0, 200) : []).map(channelName).filter(Boolean))].slice(0, 100);
  let auth = null;
  let loaded = false;
  let socket = null;
  let generation = 0;
  let authenticated = false;
  let authenticatedAt = 0;
  let lastHeardAt = 0;
  let desired = new Set();
  const joined = new Map();
  const requested = new Set();
  let retryCount = 0;
  let retryTimer;
  let heartbeat;
  let handshakeTimer;
  let joinTimer;
  let error = '';
  let terminal = false;
  let lastPublished = '';
  let queue = Promise.resolve();

  function serial(operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }
  function publicState() {
    return { configured: !!auth, login: auth?.login || '', connected: authenticated,
      channels: Object.fromEntries([...desired].map(name => [name, { joined: joined.has(name), requested: requested.has(name), ...(joined.has(name) ? { joinedAt: joined.get(name) } : {}) }])),
      error, retryCount };
  }
  async function publish() {
    const state = publicState();
    const signature = JSON.stringify(state);
    if (signature === lastPublished) return state;
    try { await api.storage.local.set({ twitchChatStatus: state }); }
    catch { /* A conexão continua; nenhuma exceção de armazenamento expõe credenciais. */ }
    lastPublished = signature;
    if (options.onStatus) {
      try { void Promise.resolve(options.onStatus(structuredClone(state))).catch(() => {}); } catch { /* Observador opcional. */ }
    }
    return state;
  }
  async function fetchJson(url, headers) {
    if (!request) throw new Error('network');
    const controller = Abort ? new Abort() : null;
    let timeout;
    try {
      const response = await Promise.race([
        request(url, { method: 'GET', headers, credentials: 'omit', cache: 'no-store', redirect: 'error', ...(controller ? { signal: controller.signal } : {}) }),
        new Promise((_, reject) => { timeout = later(() => { controller?.abort(); reject(new Error('timeout')); }, 8000); })
      ]);
      // Nunca lemos o corpo de uma resposta de erro para exibi-lo no painel.
      if (!response.ok) return { status: response.status, data: null };
      return { status: response.status, data: await response.json() };
    } finally { if (timeout !== undefined) cancel(timeout); }
  }
  function cleanToken(value) {
    if (typeof value !== 'string') return null;
    const token = value.trim().replace(/^oauth:/i, '');
    return /^[a-z0-9._~-]{10,500}$/i.test(token) ? token : null;
  }
  async function validate(token, expectedLogin) {
    const result = await fetchJson('https://id.twitch.tv/oauth2/validate', { Authorization: `OAuth ${token}` });
    if (result.status === 401) throw new Error('invalid-auth');
    const data = result.data;
    const login = channelName(data?.login);
    if (result.status !== 200 || !login || typeof data?.client_id !== 'string' || !/^[a-z0-9]{5,100}$/i.test(data.client_id)
      || !Number.isFinite(data.expires_in) || data.expires_in <= 0 || data.expires_in > 31536000) throw new Error('invalid-auth');
    if (!Array.isArray(data.scopes) || !data.scopes.includes('chat:read')) throw new Error('missing-scope');
    if (expectedLogin && login !== expectedLogin) throw new Error('login-mismatch');
    return { token, login, clientId: data.client_id, expiresAt: now() + data.expires_in * 1000 };
  }
  function clearTimers() {
    if (retryTimer !== undefined) cancel(retryTimer);
    if (handshakeTimer !== undefined) cancel(handshakeTimer);
    if (joinTimer !== undefined) cancel(joinTimer);
    if (heartbeat !== undefined) cancelEvery(heartbeat);
    retryTimer = handshakeTimer = joinTimer = heartbeat = undefined;
  }
  function closeSocket() {
    generation++;
    clearTimers();
    const previous = socket;
    socket = null;
    authenticated = false;
    requested.clear();
    joined.clear();
    try { previous?.close(); } catch { /* Não retornamos erros brutos de transporte. */ }
  }
  async function forgetAuth(message) {
    closeSocket();
    auth = null;
    loaded = true;
    terminal = true;
    error = message;
    try { await api.storage.local.set({ twitchChatAuth: null }); } catch { /* Nunca publicar o objeto privado. */ }
    await publish();
  }
  async function restore() {
    if (loaded) return auth;
    loaded = true;
    let stored;
    try { stored = (await api.storage.local.get(['twitchChatAuth'])).twitchChatAuth; } catch { /* Ausência de armazenamento. */ }
    const token = cleanToken(stored?.token);
    if (!token) { await publish(); return null; }
    try { auth = await validate(token); error = ''; }
    catch {
      auth = null;
      error = 'Não foi possível validar o acesso ao chat. Configure a conexão novamente.';
    }
    // Identidade e validade vêm da Twitch, sem confiar nos campos salvos.
    if (auth) {
      try { await api.storage.local.set({ twitchChatAuth: auth }); } catch { /* Credencial não faz parte do status público. */ }
    }
    await publish();
    return auth;
  }
  function send(line) {
    if (!socket || socket.readyState !== 1) return false;
    try { socket.send(line + '\r\n'); return true; }
    catch { return false; }
  }
  function scheduleJoins() {
    if (!authenticated || joinTimer !== undefined) return;
    const next = [...desired].find(name => !requested.has(name) && !joined.has(name));
    if (!next) return;
    if (send(`JOIN #${next}`)) requested.add(next);
    // Contas normais têm limites de JOIN. Uma única conexão serve vários canais.
    joinTimer = later(() => {
      joinTimer = undefined;
      void serial(async () => { scheduleJoins(); await publish(); });
    }, 750);
  }
  function retryConnection() {
    closeSocket();
    if (!auth || !desired.size || terminal) return;
    if (retryCount >= 3) {
      terminal = true;
      error = 'Chat desconectado após três tentativas. Pause e retome a automação para tentar novamente.';
      return;
    }
    retryCount++;
    error = 'Conexão com o chat interrompida. Aguardando nova tentativa.';
    const delay = 1000 * 2 ** (retryCount - 1) + Math.floor(Math.max(0, Math.min(1, random())) * 250);
    retryTimer = later(() => {
      retryTimer = undefined;
      void serial(async () => { await connect(); });
    }, delay);
  }
  async function onLine(line) {
    const match = line.match(/^(?:@[^ ]+ )?(?::([^ ]+) )?([A-Z0-9]+)(?: (.*))?$/);
    if (!match) return;
    const [, prefix = '', command, args = ''] = match;
    if (command === 'PING') { send(`PONG ${args.slice(0, 300)}`); return; }
    if (command === 'NOTICE' && /login authentication failed|login_authentication_failed|improperly formatted auth|login unsuccessful|invalid nick/i.test(args)
      || command === '464') {
      await forgetAuth('A autenticação do chat foi recusada. Configure a conexão novamente.');
      return;
    }
    if (command === '001' && args.split(' ')[0].toLowerCase() === auth?.login) {
      authenticated = true;
      authenticatedAt = now();
      error = '';
      if (handshakeTimer !== undefined) cancel(handshakeTimer);
      handshakeTimer = undefined;
      scheduleJoins();
    } else if ((command === 'JOIN' || command === 'PART') && prefix.split('!')[0].toLowerCase() === auth?.login) {
      const name = channelName(args.replace(/^:/, '').replace(/^#/, '').trim());
      if (name && desired.has(name)) {
        if (command === 'JOIN') joined.set(name, now());
        else { joined.delete(name); requested.delete(name); }
      }
    } else if (command === 'RECONNECT' || command === 'ERROR') retryConnection();
    else return; // Mensagens do chat e PONG não são persistidos ou publicados.
    await publish();
  }
  async function connect() {
    if (socket || !auth || !desired.size || terminal) return;
    if (auth.expiresAt <= now()) { await forgetAuth('O acesso ao chat expirou. Configure a conexão novamente.'); return; }
    if (!Socket) { terminal = true; error = 'Este navegador não disponibilizou a conexão de chat.'; await publish(); return; }
    const epoch = ++generation;
    let current;
    try { current = new Socket('wss://irc-ws.chat.twitch.tv:443'); socket = current; }
    catch { retryConnection(); await publish(); return; }
    const active = () => epoch === generation && socket === current;
    handshakeTimer = later(() => {
      if (active()) void serial(async () => { if (active()) { retryConnection(); await publish(); } });
    }, 10000);
    current.addEventListener('open', () => {
      if (!active()) return;
      lastHeardAt = now();
      send('CAP REQ :twitch.tv/membership');
      send(`PASS oauth:${auth.token}`);
      send(`NICK ${auth.login}`);
      heartbeat = every(() => {
        if (!active()) return;
        void serial(async () => {
          if (!active()) return;
          if (auth.expiresAt <= now()) { await forgetAuth('O acesso ao chat expirou. Configure a conexão novamente.'); return; }
          if (authenticated && now() - lastHeardAt > 70000) { retryConnection(); await publish(); return; }
          if (authenticated && now() - authenticatedAt >= 120000) retryCount = 0;
          if (!send('PING :chat-leve')) { retryConnection(); await publish(); }
        });
      }, 20000);
    });
    current.addEventListener('message', event => {
      if (!active() || typeof event.data !== 'string' || event.data.length > 65536) return;
      lastHeardAt = now();
      void serial(async () => {
        for (const line of event.data.split(/\r?\n/).slice(0, 200)) {
          if (!active()) break;
          if (line && line.length <= 4096) await onLine(line);
        }
      });
    });
    const failed = () => {
      if (active()) void serial(async () => { if (active()) { retryConnection(); await publish(); } });
    };
    current.addEventListener('close', failed);
    current.addEventListener('error', failed);
    await publish();
  }

  return {
    configure: values => serial(async () => {
      const token = cleanToken(values?.token);
      const expected = values?.login ? channelName(String(values.login).trim()) : null;
      if (!token || (values?.login && !expected)) throw new Error('Informe um token OAuth Twitch válido no campo de conexão.');
      let validated;
      try { validated = await validate(token, expected); }
      catch (cause) {
        const message = cause?.message === 'missing-scope' ? 'O acesso precisa da permissão chat:read.'
          : cause?.message === 'login-mismatch' ? 'O token pertence a outro login Twitch.' : 'Não foi possível validar o acesso Twitch. Confira o token e tente novamente.';
        error = message;
        await publish();
        throw new Error(message);
      }
      try { await api.storage.local.set({ twitchChatAuth: validated }); }
      catch { throw new Error('Não foi possível salvar o acesso Twitch neste navegador.'); }
      closeSocket();
      auth = validated; loaded = true; terminal = false; retryCount = 0; error = '';
      await connect();
      return publish();
    }),
    disconnect: (settings = {}) => serial(async () => {
      // PART não é uma mensagem ao chat; não publicamos texto nem executamos comandos de bots.
      if (authenticated) for (const name of joined.keys()) send(`PART #${name}`);
      desired.clear(); closeSocket(); terminal = false; retryCount = 0; error = '';
      if (settings.forget === true) { auth = null; loaded = true; try { await api.storage.local.set({ twitchChatAuth: null }); } catch { /* Sem dados privados no erro. */ } }
      return publish();
    }),
    reconcile: values => serial(async () => {
      const names = channelNames(values);
      const changed = JSON.stringify([...desired]) !== JSON.stringify(names);
      const wanted = new Set(names);
      if (authenticated) for (const name of desired) if (!wanted.has(name)) send(`PART #${name}`);
      for (const name of joined.keys()) if (!wanted.has(name)) joined.delete(name);
      for (const name of requested) if (!wanted.has(name)) requested.delete(name);
      desired = wanted;
      if (!desired.size) { closeSocket(); terminal = false; retryCount = 0; error = ''; return publish(); }
      await restore();
      if (auth?.expiresAt <= now()) await forgetAuth('O acesso ao chat expirou. Configure a conexão novamente.');
      if (changed) { terminal = false; retryCount = 0; }
      await connect();
      scheduleJoins();
      return publish();
    }),
    status: () => serial(async () => {
      await restore();
      if (auth?.expiresAt <= now()) await forgetAuth('O acesso ao chat expirou. Configure a conexão novamente.');
      return publish();
    }),
    liveStatuses: async values => {
      const names = channelNames(values);
      const unknown = Object.fromEntries(names.map(name => [name, null]));
      if (!names.length) return unknown;
      const capturedAuth = await serial(async () => {
        await restore();
        if (auth?.expiresAt <= now()) await forgetAuth('O acesso ao chat expirou. Configure a conexão novamente.');
        return auth;
      });
      if (!capturedAuth) return unknown;
      let result;
      try {
        const query = new URLSearchParams();
        for (const name of names) query.append('user_login', name);
        query.set('first', String(names.length));
        // Consultas de lives não bloqueiam PART/fechamento na fila do chat.
        result = await fetchJson('https://api.twitch.tv/helix/streams?' + query, { Authorization: `Bearer ${capturedAuth.token}`, 'Client-ID': capturedAuth.clientId });
      } catch { result = null; }
      return serial(async () => {
        // Uma resposta antiga não pode revogar nem sobrescrever acesso novo.
        if (auth !== capturedAuth) return unknown;
        if (auth.expiresAt <= now()) { await forgetAuth('O acesso ao chat expirou. Configure a conexão novamente.'); return unknown; }
        if (!result || result.status !== 200 && result.status !== 401) {
          error = streamsError;
          await publish();
          return unknown;
        }
        if (result.status === 401) { await forgetAuth('O acesso Twitch foi recusado. Configure a conexão novamente.'); return unknown; }
        if (!Array.isArray(result.data?.data)
          || !result.data.data.every(item => item && channelName(item.user_login) && item.type === 'live')) {
          error = streamsError;
          await publish();
          return unknown;
        }
        const live = new Set(result.data.data.map(item => item.user_login.toLowerCase()));
        if (error === streamsError) { error = ''; await publish(); }
        return Object.fromEntries(names.map(name => [name, live.has(name)]));
      });
    }
  };
}
