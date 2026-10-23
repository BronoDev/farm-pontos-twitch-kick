function channel(platform, input) {
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

function chatUrl(item) {
  const valid = channel(item.platform, item.name);
  return valid.platform === 'kick'
    ? `https://kick.com/popout/${valid.name}/chat`
    : `https://www.twitch.tv/popout/${valid.name}/chat?popout=`;
}

function matchesChat(url, item) {
  try { return new URL(url).href === new URL(chatUrl(item)).href; }
  catch { return false; }
}

function createController(api) {
  async function read() {
    const { channels = [], sessions = {} } = await api.storage.local.get(['channels', 'sessions']);
    return { channels, sessions };
  }
  async function alive(session, item) {
    if (!session) return false;
    try {
      const tab = await api.tabs.get(session.tabId);
      return matchesChat(tab.pendingUrl || tab.url, item);
    } catch { return false; }
  }
  return async function execute(message) {
    const state = await read();
    const warnings = [];
    async function save() { await api.storage.local.set(state); }
    for (const [id, session] of Object.entries(state.sessions)) {
      const item = state.channels.find(c => c.id === id);
      if (!item || !await alive(session, item)) delete state.sessions[id];
    }
    async function stop(item) {
      const session = state.sessions[item.id];
      // A sessão pode pertencer a uma janela antiga ou a uma aba em segundo plano.
      // Nunca fecha uma aba reutilizada para outra página.
      if (session && await alive(session, item)) await api.tabs.remove(session.tabId);
      delete state.sessions[item.id];
      await save();
    }
    async function start(item) {
      const existing = state.sessions[item.id];
      if (existing?.mode === 'background') return;
      // Migra os pop-ups das versões anteriores quando o usuário inicia o canal.
      if (existing) await stop(item);
      const tab = await api.tabs.create({ url: chatUrl(item), active: false });
      if (!Number.isInteger(tab?.id)) throw new Error('O navegador não retornou a aba do chat.');
      // Salva imediatamente: mesmo uma falha posterior pode ser encerrada pelo painel.
      state.sessions[item.id] = { tabId: tab.id, openedAt: Date.now(), mode: 'background' };
      await save();
      try { await api.tabs.update(tab.id, { muted: true }); }
      catch { warnings.push(`${item.name}: não foi possível silenciar a aba. Verifique o áudio no navegador.`); }
    }
    async function apply(item, operation) {
      try { await operation(item); }
      catch (error) { warnings.push(`${item.platform}/${item.name}: ${error.message}`); }
    }
    if (message.type === 'add') {
      const item = channel(message.platform, message.input);
      if (!state.channels.some(c => c.id === item.id)) state.channels.push(item);
    } else if (['start', 'stop', 'remove'].includes(message.type)) {
      const item = state.channels.find(c => c.id === message.id);
      if (!item) throw new Error('Canal não encontrado.');
      if (message.type === 'start') await start(item);
      else await stop(item);
      if (message.type === 'remove') state.channels = state.channels.filter(c => c.id !== item.id);
    } else if (message.type === 'startAll' || message.type === 'stopAll') {
      // Cada resultado é salvo antes do próximo canal; uma falha não interrompe os demais.
      for (const item of state.channels) await apply(item, message.type === 'startAll' ? start : stop);
    } else if (message.type !== 'status') throw new Error('Comando desconhecido.');
    await save();
    return { ...state, warnings };
  };
}
