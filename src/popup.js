import { uiPanelVisible } from './ui-state.js';

const $ = selector => document.querySelector(selector);
const api = globalThis.browser ?? globalThis.chrome;
const errorBox = $('#error');
$('#android-note').hidden = !/Android/i.test(navigator.userAgent);
let busy = false;
let lastState;
let editingBonus = null;
const openChannelOptions = new Set();
let watchDraft = null;
const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const formatNumber = value => Number.isFinite(value) ? numberFormat.format(value) : 'não informado';
const formatTime = value => Number.isFinite(value) ? new Date(value).toLocaleString('pt-BR') : 'sem data';
const localInput = value => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const statuses = { pending: 'Pendente', ready: 'Pronto para conferir o resgate', cooldown: 'Em intervalo', claimed: 'Resgatado por você', expired: 'Prazo encerrado', unverified: 'Conferir regras' };

function element(tag, text = '', className = '') {
  const node = document.createElement(tag);
  if (text !== '') node.textContent = text;
  if (className) node.className = className;
  return node;
}
function action(label, message, className = 'secondary') {
  const node = element('button', label, className);
  node.type = 'button';
  node.addEventListener('click', () => typeof message === 'function' ? message() : command(message));
  return node;
}
function empty(container, text) { container.append(element('p', text, 'empty')); }
function channelLabel(id) {
  if (id === 'global') return 'PokeIdle · saldo global';
  const item = lastState?.channels.find(channel => channel.id === id);
  return item ? `${item.platform === 'kick' ? 'Kick' : 'Twitch'} / ${item.name}` : 'Canal removido';
}
function card(title, badge) {
  const node = element('article', '', 'card');
  const head = element('div', '', 'card-head');
  head.append(element('span', title, 'card-title'));
  if (badge) head.append(element('span', statuses[badge] || badge, `tag ${badge}`));
  node.append(head);
  return node;
}
function populateSelect(select, channels, global = false) {
  const previous = select.value;
  select.replaceChildren();
  if (global) select.append(new Option('PokeIdle · saldo global', 'global'));
  for (const item of channels) select.append(new Option(`${item.platform === 'kick' ? 'Kick' : 'Twitch'} / ${item.name}`, item.id));
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
  if (!select.options.length) {
    const placeholder = new Option('Adicione um canal primeiro', '');
    placeholder.disabled = true;
    select.append(placeholder);
  }
}
function fillChannelFields(state) {
  populateSelect($('#bonus-channel'), state.channels);
  populateSelect($('#measurement-channel'), state.channels, true);
  const ids = watchDraft?.channelIds || state.liveWatch?.channelIds || [];
  const selected = new Set(ids);
  const selectAllInitially = !watchDraft && !ids.length;
  const list = $('#watch-channels');
  list.replaceChildren();
  if (!state.channels.length) empty(list, 'Adicione canais para configurar a automação.');
  for (const item of state.channels) {
    const label = element('label', '', 'check-option');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = item.id;
    checkbox.checked = selectAllInitially || selected.has(item.id);
    checkbox.addEventListener('change', updateWatchDraft);
    label.append(checkbox, element('span', channelLabel(item.id)));
    list.append(label);
  }
}
function kickModeOptions(select, state) {
  select.append(new Option(`Padrão (${state.kickLive !== false ? 'live mínima' : 'só chat'})`, 'default'), new Option('Live na menor qualidade', 'live'), new Option('Só chat', 'chat'));
}
function kickWantsLive(item, state) {
  return item.kickMode === 'live' || (item.kickMode !== 'chat' && state.kickLive !== false);
}
function renderChannels(state) {
  const list = $('#channels');
  const scrollTop = list.scrollTop;
  list.replaceChildren();
  const query = $('#channel-search').value.trim().toLowerCase();
  const filter = $('#channel-filter').value;
  const filtered = query !== '' || filter !== 'all';
  const channels = state.channels.filter(item => {
    if (query && !`${item.platform} ${item.name} ${item.id}`.includes(query)) return false;
    return filter === 'all' || (filter === 'active' && !!state.sessions[item.id]) || (filter === 'queued' && state.queue.includes(item.id)) || item.platform === filter;
  });
  $('#channel-toolbar').hidden = state.channels.length <= 5 && !filtered;
  $('#channel-matches').hidden = !filtered;
  $('#channel-matches').textContent = `${channels.length} de ${state.channels.length} canais neste filtro`;
  if (!state.channels.length) {
    const welcome = element('div', '', 'welcome');
    const symbol = element('span', '▷', 'welcome-symbol');
    symbol.setAttribute('aria-hidden', 'true');
    welcome.append(symbol, element('h3', 'Pronto para começar?'), element('p', 'Adicione um canal acima. Outras ferramentas ficam em Personalizar painel.'));
    list.append(welcome);
  } else if (!channels.length) {
    const noMatch = element('div', '', 'no-matches');
    noMatch.append(element('p', 'Nenhum canal corresponde à busca ou ao filtro.'), action('Limpar filtros', resetChannelFilters));
    list.append(noMatch);
  }
  for (const item of channels) {
    const session = state.sessions[item.id];
    const row = element('div', '', 'row');
    const info = element('div', '', 'info');
    const name = element('div', '', 'name');
    name.append(element('span', item.platform, `badge ${item.platform}`), document.createTextNode(item.name));
    const parts = [];
    if (!session) parts.push(state.queue.includes(item.id) ? `Na fila · posição ${state.queue.indexOf(item.id) + 1}` : 'Sessão fechada');
    else {
      parts.push(session.transport === 'irc' ? 'Chat Twitch sem aba' : session.media === 'live' ? `${item.platform === 'kick' ? 'Kick' : 'Twitch'} com vídeo` : 'Chat');
      parts.push(`aberta às ${new Date(session.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
      const playback = session.playback;
      if (session.media === 'live') {
        if (!playback) parts.push('aguardando resposta do player');
        else {
          parts.push(playback.playing ? 'player reportou reprodução' : 'reprodução não confirmada');
          if (playback.height) parts.push(`${playback.height}p recebidos`);
          if (playback.targetHeight) parts.push(`menor opção solicitada: ${playback.targetHeight}p`);
          if (playback.qualityStatus === 'autoplay-blocked') parts.push('abra a aba e clique em reproduzir');
          if (playback.qualityStatus === 'unavailable') parts.push('ajuste a qualidade no player');
          parts.push(`amostra às ${new Date(playback.checkedAt).toLocaleTimeString('pt-BR')}`);
        }
      }
      const health = session.health;
      if (health) {
        parts.push(health.login === 'signed-out' ? 'sinal de sessão desconectada' : health.login === 'signed-in' ? 'sinal de login detectado' : 'login não verificado');
        if (health.connection === 'offline') parts.push('sinal de conexão indisponível');
        if (health.live === 'offline') parts.push('canal reportado fora do ar');
        if (health.checkedAt) parts.push(`diagnóstico às ${new Date(health.checkedAt).toLocaleTimeString('pt-BR')}`);
      } else if (session.transport !== 'irc') parts.push('conexão e login não verificados');
    }
    let shortStatus = session ? session.media === 'live' ? session.playback?.playing ? `Live${session.playback.height ? ` · ${session.playback.height}p recebidos` : ' em reprodução'}` : 'Live · reprodução não confirmada' : 'Chat em segundo plano' : state.queue.includes(item.id) ? `Na fila · posição ${state.queue.indexOf(item.id) + 1}` : item.platform === 'kick' ? `${kickWantsLive(item, state) ? 'Live na menor qualidade' : 'Só chat'} · pronto para iniciar` : 'Pronto para iniciar';
    if (session?.playback?.qualityStatus === 'autoplay-blocked') shortStatus = 'Abra a aba para iniciar o vídeo';
    else if (session?.playback?.error) shortStatus = 'Confira o player na aba';
    else if (session?.health?.login === 'signed-out') shortStatus = 'Faça login na plataforma';
    if (session?.transport === 'irc') shortStatus = state.twitchChat?.channels?.[item.name]?.joined ? 'Chat conectado · sem aba' : 'Chat · aguardando conexão';
    info.append(name, element('div', shortStatus, 'status'));
    row.append(info);
    const controls = element('div', '', 'actions');
    controls.append(action(session || state.queue.includes(item.id) ? 'Fechar' : 'Iniciar', { type: session || state.queue.includes(item.id) ? 'stop' : 'start', id: item.id }));
    if (session && session.transport !== 'irc') controls.append(action('Ver aba', { type: 'openSession', id: item.id }));
    row.append(controls);
    const options = element('details', '', 'channel-options');
    options.open = openChannelOptions.has(item.id);
    options.append(element('summary', 'Opções do canal'));
    const optionBody = element('div', '', 'panel-body');
    if (item.platform === 'kick') {
      const modeLabel = element('label', 'Assistir na Kick', 'channel-setting');
      const mode = document.createElement('select');
      mode.setAttribute('data-kick-mode', item.id);
      mode.setAttribute('aria-label', `Modo Kick de ${item.name}`);
      kickModeOptions(mode, state);
      mode.value = ['live', 'chat'].includes(item.kickMode) ? item.kickMode : 'default';
      mode.addEventListener('change', () => command({ type: 'setKickMode', id: item.id, mode: mode.value }));
      modeLabel.append(mode);
      optionBody.append(modeLabel);
      optionBody.append(element('p', 'Mudar o modo reinicia só esta sessão, se estiver aberta.', 'hint'));
    }
    const label = element('label', 'Prioridade na fila', 'priority-label');
    const priority = document.createElement('select');
    priority.setAttribute('aria-label', `Prioridade de ${item.name}`);
    for (const [value, text] of [[0, 'Normal'], [1, 'Alta'], [2, 'Máxima']]) priority.append(new Option(text, String(value)));
    priority.value = String(item.priority || 0);
    priority.addEventListener('change', () => command({ type: 'setPriority', id: item.id, priority: Number(priority.value) }));
    label.append(priority);
    optionBody.append(label, element('p', parts.join(' · '), 'hint'));
    const remove = element('div', '', 'actions');
    remove.append(action('Remover', { type: 'remove', id: item.id }, 'danger'));
    optionBody.append(remove);
    options.append(optionBody);
    options.addEventListener('toggle', () => options.open ? openChannelOptions.add(item.id) : openChannelOptions.delete(item.id));
    row.append(options);
    list.append(row);
  }
  list.scrollTop = scrollTop;
}
function resetChannelFilters() {
  $('#channel-search').value = '';
  $('#channel-filter').value = 'all';
  $('#channels').scrollTop = 0;
  if (lastState) renderChannels(lastState);
}
const POKEIDLE_OWNER = 'pokeidle:twitch';
function sourceLive(item, state) {
  const sample = state.pokeidle?.kickStatuses?.[`kick:${item.name}`];
  if (item.platform === 'kick' && sample) return Number.isFinite(sample.checkedAt) && Date.now() >= sample.checkedAt && Date.now() - sample.checkedAt <= 180000 && typeof sample.live === 'boolean' ? sample.live : null;
  return typeof item.live === 'boolean' ? item.live : null;
}
function renderKickSync(state) {
  const source = state.pokeidle || {};
  const sync = source.kickSync || {};
  const channels = (source.channels || []).filter(item => item.platform === 'kick');
  const observed = Number.isFinite(sync.observedAt) && sync.observedAt > 0;
  const fresh = observed && sync.connected === true && Date.now() >= sync.observedAt && Date.now() - sync.observedAt <= 180000;
  const enabled = sync.enabled !== false && source.enabled !== false;
  const active = Object.entries(state.sessions).filter(([id, session]) => id.startsWith('kick:') && session.ownerIds?.includes(POKEIDLE_OWNER));
  const queued = state.queue.filter(id => id.startsWith('kick:') && state.queueSources?.[id]?.includes(POKEIDLE_OWNER));
  const online = channels.filter(item => sourceLive(item, state) === true).length;
  const badge = $('#kick-sync-badge');
  badge.textContent = !enabled ? 'Desativada' : state.automationPaused ? 'Pausada' : !fresh ? 'Aguardando leitura' : sync.status === 'rate-limited' ? 'Em espera' : sync.status === 'partial' ? 'Conferir conexão' : 'Lista recebida';
  badge.classList.toggle('connected', enabled && fresh && sync.status === 'ok');
  $('#pokeidle-kick-enabled').checked = sync.enabled !== false;
  $('#kick-sync-summary').textContent = `${channels.length} canais · ${online} com sinal de live · ${active.length} sessões automáticas · ${queued.length} na fila`;
  const messages = {
    idle: 'Sincronize para ler os canais Kick do jogo e consultar quais estão ao vivo.',
    ok: 'Consulta da Kick concluída. Confira as sessões e os limites no painel.',
    partial: 'Alguns canais estão com status desconhecido. Novas sessões aguardam confirmação.',
    'no-channels': 'Nenhum canal Kick foi encontrado nesta leitura. Abra a lista no PokeIdle; a lista anterior foi preservada.',
    'source-unavailable': 'Não foi possível ler a página. Abra o PokeIdle, carregue a lista e tente novamente.',
    'rate-limited': 'A Kick limitou as consultas. A extensão aguardará antes de tentar novamente.'
  };
  $('#kick-sync-status').textContent = messages[sync.status] || messages.idle;
  const times = [`Lista Kick: ${observed ? formatTime(sync.observedAt) : 'ainda não recebida'}`];
  if (sync.lastAttemptAt) times.push(`última sincronização solicitada: ${formatTime(sync.lastAttemptAt)}`);
  if (sync.lastSuccessAt) times.push(`última resposta válida da Kick: ${formatTime(sync.lastSuccessAt)}`);
  if (sync.nextRetryAt > Date.now()) times.push(`nova consulta permitida após: ${formatTime(sync.nextRetryAt)}`);
  $('#kick-sync-timing').textContent = times.join(' · ');
  let warning = '';
  if (source.enabled === false) warning = 'Ative a automação geral do PokeIdle para permitir aberturas automáticas. Sincronizar Kick apenas atualiza os dados.';
  else if (sync.enabled === false) warning = 'A automação Kick está desligada. Sincronizar atualiza a lista e o status sem reativá-la; a Twitch continua com sua configuração atual.';
  else if (state.automationPaused) warning = 'A automação está pausada. Sincronizar não retoma nem abre sessões.';
  else if (sync.errorCode === 'forbidden') warning = 'A Kick recusou a consulta. O status fica desconhecido e haverá uma espera antes da próxima tentativa.';
  else if (sync.nextRetryAt > Date.now()) warning = `Aguardando até ${formatTime(sync.nextRetryAt)} para consultar novamente. Sincronizar respeita essa espera.`;
  else if (observed && !fresh) warning = 'A lista Kick está desatualizada ou a página foi fechada. Sincronize antes de iniciar novas sessões automáticas.';
  $('#kick-sync-warning').hidden = !warning;
  $('#kick-sync-warning').textContent = warning;
}
function renderPokeIdleChannels(state) {
  const list = $('#pokeidle-channels');
  const filter = $('#pokeidle-filter').value;
  const channels = (state.pokeidle?.channels || []).filter(item => filter === 'all' || (['kick', 'twitch'].includes(filter) && (item.platform || 'twitch') === filter) || (filter === 'eligible' && sourceLive(item, state) === true && (item.platform === 'kick' || (item.bonus && item.missing))) || (filter === 'live-bonus' && sourceLive(item, state) === true && item.bonus) || (filter === 'missing' && item.missing));
  list.replaceChildren();
  if (!channels.length) empty(list, 'Nenhum canal nesse filtro na última leitura.');
  for (const item of channels) {
    const node = card(`${item.platform === 'kick' ? 'Kick' : 'Twitch'} / ${item.displayName || item.name}`);
    const live = sourceLive(item, state);
    const labels = [live === true ? 'Sinal de live' : live === false ? 'Sinal de offline' : 'Status a verificar'];
    if (item.source === 'link') labels.push('Link encontrado na página; bônus não confirmado');
    else labels.push(item.bonus ? 'Com bônus na origem' : 'Sem indicação de bônus', item.missing ? 'Marcado como faltante' : 'Sem indicação de falta');
    const id = `${item.platform || 'twitch'}:${item.name}`;
    if (state.sessions[id]?.ownerIds?.includes(POKEIDLE_OWNER)) labels.push('Aba automática aberta');
    else if (state.queue.includes(id) && state.queueSources?.[id]?.includes(POKEIDLE_OWNER)) labels.push('Na fila automática');
    node.append(element('p', labels.join(' · ')));
    list.append(node);
  }
}
function renderPokeIdle(state) {
  const source = state.pokeidle || {};
  const channels = Array.isArray(source.channels) ? source.channels : [];
  const twitch = channels.filter(item => item.platform !== 'kick');
  const eligible = channels.filter(item => sourceLive(item, state) === true && (item.platform === 'kick' ? source.kickSync?.enabled !== false : !state.liveWatch?.enabled && item.bonus && item.missing));
  const active = Object.entries(state.sessions).filter(([, session]) => session.ownerIds?.includes(POKEIDLE_OWNER));
  const queued = state.queue.filter(id => state.queueSources?.[id]?.includes(POKEIDLE_OWNER));
  const observed = Number.isFinite(source.observedAt) && source.observedAt > 0;
  const stale = observed && Date.now() - source.observedAt > 180000;
  const kickObserved = Number.isFinite(source.kickSync?.observedAt) && source.kickSync.observedAt > 0;
  const configured = observed || kickObserved;
  $('#pokeidle-setup').hidden = configured;
  $('#pokeidle-configured').hidden = !configured;
  const connected = (observed && source.connected === true && !stale) || (kickObserved && source.kickSync.connected === true && Date.now() - source.kickSync.observedAt <= 180000);
  $('#pokeidle-connection').textContent = connected ? 'Conectado' : configured ? 'Aguardando leitura' : 'Não conectado';
  $('#pokeidle-connection').classList.toggle('connected', connected);
  $('#pokeidle-enabled').checked = source.enabled !== false;
  $('#pokeidle-enabled').closest('label').hidden = false;
  $('#pokeidle-twitch-count').textContent = String(twitch.length);
  $('#pokeidle-kick-count').textContent = String(channels.length - twitch.length);
  $('#pokeidle-official-count').textContent = String(channels.length);
  $('#pokeidle-live-bonus-count').textContent = String(twitch.filter(item => item.live === true && item.bonus).length);
  $('#pokeidle-missing-count').textContent = String(twitch.filter(item => item.missing).length);
  $('#pokeidle-sessions').textContent = `${active.filter(([id]) => id.startsWith('twitch:')).length} chats Twitch · ${active.filter(([id]) => id.startsWith('kick:')).length} sessões Kick · ${queued.length} na fila do PokeIdle.`;
  const sourceUrl = source.sourceUrl || 'https://pokeidle.io/app';
  const parts = [`Origem: ${sourceUrl}`];
  if (observed) parts.push(`última leitura: ${formatTime(source.observedAt)}`);
  else parts.push('nenhuma leitura recebida; abra a lista de canais no PokeIdle');
  if (source.connected !== true) parts.push('página de origem não conectada à extensão');
  if (stale) parts.push('leitura desatualizada há mais de 3 minutos; sincronize novamente');
  else if (observed && source.connected === true) parts.push('leitura recente');
  $('#pokeidle-status').textContent = parts.join(' · ');
  $('#pokeidle-error').hidden = !source.lastError;
  $('#pokeidle-error').textContent = source.lastError ? `Sincronização: ${source.lastError}` : '';
  $('#pokeidle-rule-text').textContent = source.ruleText || 'Ainda sem regra recebida.';
  let waiting = '';
  if (source.enabled === false) waiting = 'Automação do PokeIdle desativada. Sessões iniciadas manualmente são preservadas.';
  else if (state.automationPaused) waiting = 'Automação pausada. Use Iniciar todos ou Retomar automação para permitir novas aberturas.';
  else if (queued.length) waiting = `${queued.length} canais aguardam na fila automática. Limite atual: ${state.settings.maxConcurrent ?? 3} abas gerenciadas. Ajuste o limite em Limites de consumo se desejar; ele não aumenta automaticamente.`;
  else if (observed && source.connected === true && !stale && eligible.some(item => !state.sessions[`${item.platform || 'twitch'}:${item.name}`])) waiting = 'Há canais elegíveis sem sessão automática. Sincronize novamente e confira os limites.';
  $('#pokeidle-waiting').hidden = !waiting;
  $('#pokeidle-waiting').textContent = waiting;
  renderKickSync(state);
  renderPokeIdleChannels(state);
}
function renderBonuses(state) {
  const list = $('#bonuses');
  list.replaceChildren();
  const items = state.summary.bonusItems || state.bonuses;
  if (!items.length) empty(list, 'Nenhum bônus cadastrado. Confira as regras no canal ou no PokeIdle e registre abaixo.');
  for (const bonus of items) {
    const node = card(bonus.title, bonus.status || 'unverified');
    node.append(element('p', channelLabel(bonus.channelId)));
    if (bonus.requirements) node.append(element('p', bonus.requirements));
    const requirements = [`Regras ${bonus.verified ? 'conferidas' : 'não conferidas'}`, `Requisitos ${bonus.requirementsMet ? 'confirmados por você' : 'a confirmar'}`];
    if (bonus.requiredMinutes) requirements.push(`${formatNumber(bonus.requiredMinutes)} min exigidos`);
    if (bonus.remainingMinutes > 0) requirements.push(`estimativa de tempo restante: ${formatNumber(bonus.remainingMinutes)} min`);
    if (bonus.pointCost) requirements.push(`custo: ${formatNumber(bonus.pointCost)} pontos`);
    if (bonus.remainingPoints === null && bonus.pointCost) requirements.push('registre o saldo de pontos para comparar');
    else if (bonus.remainingPoints > 0) requirements.push(`faltam ${formatNumber(bonus.remainingPoints)} pontos registrados`);
    if (bonus.cooldownMinutes) requirements.push(`intervalo: ${formatNumber(bonus.cooldownMinutes)} min`);
    if (bonus.status === 'cooldown' && bonus.nextClaimAt) requirements.push(`conferir novamente após ${formatTime(bonus.nextClaimAt)}`);
    if (bonus.expiresAt) requirements.push(`prazo: ${formatTime(bonus.expiresAt)}`);
    if (bonus.lastClaimedAt) requirements.push(`último resgate marcado: ${formatTime(bonus.lastClaimedAt)}`);
    node.append(element('p', requirements.join(' · '), 'hint'));
    const controls = element('div', '', 'actions');
    controls.append(action('Ver resgate / regra', { type: 'openRedemption', id: bonus.id }));
    controls.append(action(bonus.requirementsMet ? 'Desmarcar requisitos' : 'Confirmar requisitos cumpridos', { type: 'updateBonus', id: bonus.id, patch: { requirementsMet: !bonus.requirementsMet } }));
    controls.append(action('Marcar resgatado', { type: 'claimBonus', id: bonus.id }));
    controls.append(action('Editar', () => editBonus(bonus)));
    controls.append(action('Excluir bônus', { type: 'removeBonus', id: bonus.id }, 'danger'));
    node.append(controls);
    list.append(node);
  }
}
function renderHistory(state) {
  const list = $('#measurements');
  list.replaceChildren();
  if (!state.measurements.length) empty(list, 'Registre uma leitura inicial e outra posterior para comparar os saldos.');
  for (const reading of [...state.measurements].sort((a, b) => b.at - a.at)) {
    const node = card(channelLabel(reading.channelId), 'Registro manual');
    const balances = [];
    if (Number.isFinite(reading.xp)) balances.push(`${formatNumber(reading.xp)} XP`);
    if (Number.isFinite(reading.points)) balances.push(`${formatNumber(reading.points)} pontos`);
    node.append(element('p', `${balances.join(' · ')} · ${formatTime(reading.at)}`));
    if (reading.note) node.append(element('p', reading.note));
    const controls = element('div', '', 'actions');
    controls.append(action('Excluir leitura', { type: 'removeMeasurement', id: reading.id }, 'danger'));
    node.append(controls);
    list.append(node);
  }
  const earnings = $('#earnings');
  earnings.replaceChildren();
  if (!state.summary.earnings?.length) empty(earnings, 'Ainda não há saldos comparáveis.');
  for (const entry of state.summary.earnings || []) {
    const node = card(channelLabel(entry.channelId));
    const labels = [];
    if (entry.resetDetected) labels.push('o saldo de XP diminuiu; confira reset, troca de conta ou correção');
    else if (Number.isFinite(entry.xpDelta)) labels.push(`variação registrada: ${formatNumber(entry.xpDelta)} XP`);
    else labels.push('sem base suficiente para calcular a variação');
    if (Number.isFinite(entry.xpPerHour)) labels.push(`${formatNumber(entry.xpPerHour)} XP/h entre as leituras`);
    if (Number.isFinite(entry.latestPoints)) labels.push(`último saldo: ${formatNumber(entry.latestPoints)} pontos`);
    if (entry.lastMeasuredAt) labels.push(`leitura: ${formatTime(entry.lastMeasuredAt)}`);
    node.append(element('p', labels.join(' · ')));
    earnings.append(node);
  }
}
function renderSchedules(state) {
  const list = $('#watch-live-status');
  list.replaceChildren();
  $('#automation-state').textContent = state.automationPaused ? 'Automação pausada.' : 'Automação habilitada.';
  $('#toggle-automation').textContent = state.automationPaused ? 'Retomar automação' : 'Pausar automação';
  if (!uiPanelVisible(state, 'schedule')) return;
  const watch = state.liveWatch || {};
  $('#watch-enabled').checked = watchDraft?.enabled ?? watch.enabled === true;
  $('#watch-twitch-mode').value = watchDraft?.twitchMode || watch.twitchMode || 'chat';
  $('#watch-now').hidden = watch.enabled !== true;
  $('#watch-status').textContent = watch.enabled ? `Verifica as lives Kick aproximadamente a cada minuto. O popout Twitch mantém só o chat.${watch.lastCheckedAt ? ` Última consulta: ${formatTime(watch.lastCheckedAt)}.` : ''}` : 'Escolha os canais para abrir lives Kick e manter chats Twitch em segundo plano.';
  const legacyCount = state.schedules.filter(item => item.enabled).length;
  $('#legacy-schedules-note').hidden = !legacyCount;
  $('#legacy-schedules-note').textContent = `${legacyCount} agendamento(s) antigo(s) serão desativados ao ligar esta automação. Os registros serão preservados.`;
  const chat = state.twitchChat || {};
  const joined = Object.values(chat.channels || {}).filter(channel => channel.joined).length;
  $('#twitch-chat-status').textContent = chat.configured ? `${chat.login || 'Conta Twitch'} · ${chat.connected ? 'conectada' : 'aguardando conexão'} · ${joined} chat(s) confirmado(s).${chat.error ? ` ${chat.error}` : ''}` : 'Conecte sua conta para usar o chat em segundo plano, sem abrir abas.';
  $('#disconnect-twitch-chat').hidden = !chat.configured;
  updateTwitchSettingsVisibility(state);
  for (const id of watch.channelIds || []) {
    const sample = watch.statuses?.[id];
    const chatOnly = id.startsWith('twitch:') && watch.twitchMode !== 'irc';
    const node = card(channelLabel(id), chatOnly ? 'Só chat' : sample?.live === true ? 'Ao vivo' : sample?.live === false ? 'Offline' : 'Status desconhecido');
    node.append(element('p', chatOnly ? 'Popout de chat em aba inativa, sem player ou janela de popup.' : sample?.checkedAt ? `Consulta: ${formatTime(sample.checkedAt)}` : 'Aguardando consulta.'));
    list.append(node);
  }
}
function updateTwitchSettingsVisibility(state = lastState) {
  const selected = new Set(watchDraft?.channelIds || [...$('#watch-channels').querySelectorAll('input:checked')].map(input => input.value));
  const hasTwitch = state?.channels.some(item => item.platform === 'twitch' && selected.has(item.id));
  const mode = watchDraft?.twitchMode || state?.liveWatch?.twitchMode || 'chat';
  $('#watch-twitch-mode-option').hidden = !hasTwitch;
  $('#watch-twitch-note').hidden = !hasTwitch;
  $('#watch-twitch-note').textContent = mode === 'irc' ? 'Conexão sem abas exige configurar o acesso ao chat abaixo.' : 'Usa o popout oficial e o login deste navegador. Não abre o vídeo da Twitch; a aba de chat continua visível na barra.';
  $('#twitch-chat-settings').hidden = mode !== 'irc' || (!state?.twitchChat?.configured && !hasTwitch);
}
function updateWatchDraft() {
  watchDraft = { enabled: $('#watch-enabled').checked, twitchMode: $('#watch-twitch-mode').value, channelIds: [...$('#watch-channels').querySelectorAll('input:checked')].map(input => input.value) };
  updateTwitchSettingsVisibility();
}
function renderAlerts(state) {
  const list = $('#alerts');
  list.replaceChildren();
  const alerts = state.alerts.filter(alert => !alert.read);
  $('#alert-count').textContent = String(alerts.length);
  $('#alerts-panel').hidden = alerts.length === 0;
  if (!alerts.length) empty(list, 'Nenhum aviso pendente.');
  for (const alert of alerts) {
    const node = element('article', '', 'notice');
    node.append(element('strong', alert.title || 'Aviso'), element('p', alert.message || ''));
    if (alert.at) node.append(element('p', formatTime(alert.at), 'hint'));
    const controls = element('div', '', 'actions');
    if (alert.channelId && state.sessions[alert.channelId] && state.sessions[alert.channelId].transport !== 'irc') controls.append(action('Ver aba', { type: 'openSession', id: alert.channelId }));
    controls.append(action('Dispensar aviso', { type: 'dismissAlert', id: alert.id }));
    node.append(controls);
    list.append(node);
  }
}
function renderVisibility(state) {
  const hasKick = state.channels.some(item => item.platform === 'kick');
  $('#session-controls').hidden = state.channels.length === 0;
  $('#kick-options').hidden = !hasKick;
  $('#kick-limit-option').hidden = !hasKick;
  for (const panel of ['bonuses', 'history', 'schedule', 'pokeidle']) {
    const visible = panel === 'pokeidle' ? true : panel === 'schedule' ? false : uiPanelVisible(state, panel);
    $(`#${panel}-panel`).hidden = !visible;
    $(`#show-${panel}`).checked = visible;
  }
  const history = uiPanelVisible(state, 'history');
  const bonuses = uiPanelVisible(state, 'bonuses');
  $('#overview').hidden = !history && !bonuses;
  $('#xp-overview').hidden = !history;
  $('#bonus-overview').hidden = !bonuses;
  $('#bonus-form').hidden = state.channels.length === 0;
  $('#watch-form').hidden = state.channels.length === 0;
  $('#optional-panels').hidden = !bonuses && !history && !uiPanelVisible(state, 'schedule') && !state.alerts.some(alert => !alert.read);
}
function render(state) {
  lastState = { channels: [], sessions: {}, bonuses: [], measurements: [], schedules: [], settings: {}, queue: [], alerts: [], ...state };
  lastState.summary ||= {};
  state = lastState;
  $('#kick-live').checked = state.kickLive;
  const addMode = $('#add-kick-mode');
  const selectedMode = addMode.value;
  addMode.replaceChildren();
  kickModeOptions(addMode, state);
  addMode.value = selectedMode || 'default';
  $('#add-kick-options').hidden = $('#platform').value !== 'kick';
  $('#summary').textContent = `${Object.keys(state.sessions).length} de ${state.channels.length} canais abertos`;
  $('#queue-summary').textContent = `${state.queue.length} na fila · limite de ${state.settings.maxConcurrent ?? 3} abas`;
  $('#queue-summary').hidden = state.queue.length === 0;
  $('#xp-total').textContent = Number.isFinite(state.summary.totals?.xpDelta) ? `${formatNumber(state.summary.totals.xpDelta)} XP` : 'Sem comparação';
  $('#bonus-total').textContent = String((state.summary.bonusItems || []).filter(bonus => bonus.status === 'ready').length);
  $('#channels').replaceChildren();
  $('#channel-toolbar').hidden = true;
  $('#channel-matches').hidden = true;
  renderPokeIdle(state);
  fillChannelFields(state);
  if (uiPanelVisible(state, 'bonuses')) renderBonuses(state);
  else $('#bonuses').replaceChildren();
  if (uiPanelVisible(state, 'history')) renderHistory(state);
  else { $('#measurements').replaceChildren(); $('#earnings').replaceChildren(); }
  renderSchedules(state);
  renderAlerts(state);
  renderVisibility(state);
  const settings = { maxConcurrent: 3, maxKickLives: 2, sessionMinutes: 0, notifications: true, autoReconnect: false, ...state.settings };
  $('#max-concurrent').value = settings.maxConcurrent;
  $('#max-kick-lives').value = settings.maxKickLives;
  $('#session-minutes').value = settings.sessionMinutes;
  $('#notifications-enabled').checked = settings.notifications;
  $('#auto-reconnect').checked = settings.autoReconnect;
}
function error(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  errorBox.scrollIntoView({ block: 'nearest' });
}
async function command(message) {
  if (busy) return false;
  busy = true;
  errorBox.hidden = true;
  if (message.type === 'syncPokeIdleKick') {
    $('#kick-sync-panel').setAttribute('aria-busy', 'true');
    $('#refresh-pokeidle-kick').textContent = 'Sincronizando Kick…';
    $('#kick-sync-status').textContent = 'Lendo a lista do PokeIdle e consultando a Kick…';
  }
  document.querySelectorAll('button, select, input, textarea').forEach(control => { control.disabled = true; });
  try {
    const result = await api.runtime.sendMessage(message);
    if (!result?.ok) throw new Error(result?.error || 'O navegador não respondeu. Tente novamente.');
    render(result.state);
    if (result.state.warnings?.length) error(result.state.warnings.join(' · '));
    if (message.type === 'add') $('#channel').value = '';
    return true;
  } catch (cause) {
    error(cause.message);
    return false;
  } finally {
    busy = false;
    $('#kick-sync-panel').removeAttribute('aria-busy');
    $('#refresh-pokeidle-kick').textContent = 'Sincronizar Kick';
    document.querySelectorAll('button, select, input, textarea').forEach(control => { control.disabled = false; });
  }
}
function numeric(selector, optional = false) {
  const value = $(selector).value.trim();
  if (optional && value === '') return null;
  if (value === '' || !Number.isFinite(Number(value))) throw new Error('Preencha os campos numéricos com valores válidos.');
  return Number(value);
}
function timestamp(selector, optional = false) {
  const value = $(selector).value;
  if (!value && optional) return null;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) throw new Error('Preencha uma data e um horário válidos.');
  return parsed;
}
function form(selector, submit) {
  $(selector).addEventListener('submit', async event => {
    event.preventDefault();
    try { await submit(); }
    catch (cause) { error(cause.message); }
  });
}
function editBonus(bonus) {
  editingBonus = bonus.id;
  $('#bonus-channel').value = bonus.channelId;
  $('#bonus-title').value = bonus.title;
  $('#bonus-requirements').value = bonus.requirements || '';
  $('#bonus-source').value = bonus.sourceUrl || '';
  $('#bonus-minutes').value = bonus.requiredMinutes || 0;
  $('#bonus-points').value = bonus.pointCost || 0;
  $('#bonus-cooldown').value = bonus.cooldownMinutes || 0;
  $('#bonus-expiry').value = bonus.expiresAt ? localInput(bonus.expiresAt) : '';
  $('#bonus-verified').checked = !!bonus.verified;
  $('#bonus-requirements-met').checked = !!bonus.requirementsMet;
  $('#bonus-form-title').textContent = 'Editar bônus';
  $('#bonus-submit').textContent = 'Salvar alterações';
  $('#bonus-cancel').hidden = false;
  $('#bonus-title').focus();
}
function resetBonus() {
  editingBonus = null;
  $('#bonus-form').reset();
  $('#bonus-form-title').textContent = 'Cadastrar bônus';
  $('#bonus-submit').textContent = 'Cadastrar bônus';
  $('#bonus-cancel').hidden = true;
}

form('#add-form', () => command({ type: 'add', platform: $('#platform').value, input: $('#channel').value, ...($('#platform').value === 'kick' ? { kickMode: $('#add-kick-mode').value } : {}) }));
form('#bonus-form', async () => {
  const bonus = { channelId: $('#bonus-channel').value, title: $('#bonus-title').value.trim(), requirements: $('#bonus-requirements').value.trim(), sourceUrl: $('#bonus-source').value.trim(), verified: $('#bonus-verified').checked, requirementsMet: $('#bonus-requirements-met').checked, requiredMinutes: numeric('#bonus-minutes'), pointCost: numeric('#bonus-points'), cooldownMinutes: numeric('#bonus-cooldown'), expiresAt: timestamp('#bonus-expiry', true) };
  const message = editingBonus ? { type: 'updateBonus', id: editingBonus, patch: bonus } : { type: 'addBonus', bonus };
  if (await command(message)) resetBonus();
});
form('#measurement-form', async () => {
  const measurement = { channelId: $('#measurement-channel').value, xp: numeric('#measurement-xp', true), points: numeric('#measurement-points', true), at: timestamp('#measurement-at'), note: $('#measurement-note').value.trim() };
  if (measurement.xp === null && measurement.points === null) throw new Error('Informe pelo menos um saldo: XP ou pontos.');
  if (await command({ type: 'addMeasurement', measurement })) {
    $('#measurement-xp').value = '';
    $('#measurement-points').value = '';
    $('#measurement-note').value = '';
    $('#measurement-at').value = localInput(Date.now());
  }
});
form('#watch-form', async () => {
  updateWatchDraft();
  if (watchDraft.enabled && !watchDraft.channelIds.length) throw new Error('Selecione ao menos um canal para acompanhar.');
  if (await command({ type: 'setLiveWatch', ...watchDraft })) watchDraft = null;
});
form('#settings-form', () => command({ type: 'setSettings', settings: { maxConcurrent: numeric('#max-concurrent'), maxKickLives: numeric('#max-kick-lives'), sessionMinutes: numeric('#session-minutes'), notifications: $('#notifications-enabled').checked, autoReconnect: $('#auto-reconnect').checked } }));
$('#refresh').addEventListener('click', () => command({ type: 'status' }));
$('#open-dashboard').addEventListener('click', () => command({ type: 'openDashboard' }));
for (const panel of ['bonuses', 'history', 'schedule', 'pokeidle']) {
  $(`#show-${panel}`).addEventListener('change', async event => {
    const visible = event.target.checked;
    if (await command({ type: 'setUiPanel', panel, visible })) {
      const target = $(`#${panel}-panel`);
      if (target.tagName === 'DETAILS') target.open = visible;
      if (visible) target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}
$('#platform').addEventListener('change', event => {
  $('#channel').placeholder = event.target.value === 'kick' ? 'yetz ou https://kick.com/yetz' : 'Canal ou https://www.twitch.tv/canal';
  $('#add-kick-options').hidden = event.target.value !== 'kick';
});
for (const selector of ['#channel-search', '#channel-filter']) {
  $(selector).addEventListener(selector.endsWith('search') ? 'input' : 'change', () => {
    $('#channels').scrollTop = 0;
    if (lastState) renderChannels(lastState);
  });
}
$('#open-pokeidle').addEventListener('click', () => command({ type: 'openPokeIdle' }));
$('#refresh-pokeidle').addEventListener('click', () => command({ type: 'refreshPokeIdle' }));
$('#refresh-pokeidle-kick').addEventListener('click', () => command({ type: 'syncPokeIdleKick' }));
$('#pokeidle-kick-enabled').addEventListener('change', event => command({ type: 'setPokeIdleKick', enabled: event.target.checked }));
$('#pokeidle-enabled').addEventListener('change', event => command({ type: 'setPokeIdle', enabled: event.target.checked }));
$('#pokeidle-filter').addEventListener('change', () => { if (lastState) renderPokeIdleChannels(lastState); });
$('#kick-live').addEventListener('change', event => command({ type: 'setKickLive', enabled: event.target.checked }));
$('#start-all').addEventListener('click', () => command({ type: 'resumeAutomation' }));
$('#stop-all').addEventListener('click', () => command({ type: 'stopAll' }));
$('#bonus-cancel').addEventListener('click', resetBonus);
$('#watch-enabled').addEventListener('change', updateWatchDraft);
$('#watch-twitch-mode').addEventListener('change', updateWatchDraft);
$('#watch-now').addEventListener('click', () => command({ type: 'watchNow' }));
$('#connect-twitch-chat').addEventListener('click', async () => {
  const token = $('#twitch-token').value.trim();
  $('#twitch-token').value = '';
  if (!token) { error('Informe a credencial de chat neste navegador.'); return; }
  await command({ type: 'configureTwitchChat', token });
});
$('#disconnect-twitch-chat').addEventListener('click', () => command({ type: 'disconnectTwitchChat', forget: true }));
$('#toggle-automation').addEventListener('click', () => command({ type: lastState?.automationPaused ? 'resumeAutomation' : 'pauseAutomation' }));
$('#measurement-at').value = localInput(Date.now());
command({ type: 'status' });
