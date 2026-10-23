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
    for (const [id, session] of Object.entries(state.sessions)) {
      const item = state.channels.find(c => c.id === id);
      if (!item || !await alive(session, item)) delete state.sessions[id];
    }
    if (message.type === 'add') {
      const item = channel(message.platform, message.input);
      if (!state.channels.some(c => c.id === item.id)) state.channels.push(item);
    } else if (['start', 'stop', 'remove'].includes(message.type)) {
      const item = state.channels.find(c => c.id === message.id);
      if (!item) throw new Error('Canal não encontrado.');
      const session = state.sessions[item.id];
      if (message.type === 'start' && !session) {
        const win = await api.windows.create({ url: chatUrl(item), type: 'popup', width: 420, height: 640, focused: false });
        const tabId = win.tabs?.[0]?.id;
        if (!Number.isInteger(tabId)) throw new Error('O navegador não retornou a aba do chat.');
        state.sessions[item.id] = { tabId, openedAt: Date.now() };
      }
      if (message.type !== 'start') {
        // Só fecha a aba registrada se ela ainda estiver no chat esperado.
        if (session && await alive(session, item)) await api.tabs.remove(session.tabId);
        delete state.sessions[item.id];
        if (message.type === 'remove') state.channels = state.channels.filter(c => c.id !== item.id);
      }
    } else if (message.type !== 'status') throw new Error('Comando desconhecido.');
    await api.storage.local.set(state);
    return state;
  };
}
