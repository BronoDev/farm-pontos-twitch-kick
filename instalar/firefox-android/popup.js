const $ = selector => document.querySelector(selector);
const api = globalThis.browser ?? globalThis.chrome;
const errorBox = $('#error');
$('#android-note').hidden = !/Android/i.test(navigator.userAgent);
let busy = false;
let lastState;
let editingBonus = null;
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
  const selected = new Set([...$('#schedule-channels').querySelectorAll('input:checked')].map(input => input.value));
  const list = $('#schedule-channels');
  list.replaceChildren();
  if (!state.channels.length) empty(list, 'Adicione canais para criar uma agenda.');
  for (const item of state.channels) {
    const label = element('label', '', 'check-option');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = item.id;
    checkbox.checked = selected.has(item.id);
    label.append(checkbox, element('span', channelLabel(item.id)));
    list.append(label);
  }
}
function renderChannels(state) {
  const list = $('#channels');
  list.replaceChildren();
  if (!state.channels.length) empty(list, 'Adicione um canal para iniciar em segundo plano.');
  for (const item of state.channels) {
    const session = state.sessions[item.id];
    const row = element('div', '', 'row');
    const info = element('div', '', 'info');
    const name = element('div', '', 'name');
    name.append(element('span', item.platform, 'badge'), document.createTextNode(item.name));
    const parts = [];
    if (!session) parts.push(state.queue.includes(item.id) ? `Na fila · posição ${state.queue.indexOf(item.id) + 1}` : 'Sessão fechada');
    else {
      parts.push(session.media === 'live' ? `${item.platform === 'kick' ? 'Kick' : 'Twitch'} com vídeo` : 'Chat');
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
      } else parts.push('conexão e login não verificados');
    }
    info.append(name, element('div', parts.join(' · '), 'status'));
    row.append(info);
    const controls = element('div', '', 'actions');
    controls.append(action(session || state.queue.includes(item.id) ? 'Fechar' : 'Iniciar', { type: session || state.queue.includes(item.id) ? 'stop' : 'start', id: item.id }));
    if (session) controls.append(action('Ver aba', { type: 'openSession', id: item.id }));
    controls.append(action('Remover', { type: 'remove', id: item.id }, 'danger'));
    row.append(controls);
    const label = element('label', 'Prioridade na fila', 'priority-label');
    const priority = document.createElement('select');
    priority.setAttribute('aria-label', `Prioridade de ${item.name}`);
    for (const [value, text] of [[0, 'Normal'], [1, 'Alta'], [2, 'Máxima']]) priority.append(new Option(text, String(value)));
    priority.value = String(item.priority || 0);
    priority.addEventListener('change', () => command({ type: 'setPriority', id: item.id, priority: Number(priority.value) }));
    label.append(priority);
    row.append(label);
    list.append(row);
  }
}
const POKEIDLE_OWNER = 'pokeidle:twitch';
function renderPokeIdleChannels(state) {
  const list = $('#pokeidle-channels');
  const filter = $('#pokeidle-filter').value;
  const channels = (state.pokeidle?.channels || []).filter(item => filter === 'all' || (filter === 'eligible' && item.live && item.bonus && item.missing) || (filter === 'live-bonus' && item.live && item.bonus) || (filter === 'missing' && item.missing));
  list.replaceChildren();
  if (!channels.length) empty(list, 'Nenhum canal nesse filtro na última leitura.');
  for (const item of channels) {
    const node = card(item.displayName || item.name);
    const labels = [item.live ? 'Ao vivo na origem' : 'Sem sinal de live', item.bonus ? 'Com bônus na origem' : 'Sem indicação de bônus', item.missing ? 'Marcado como faltante' : 'Sem indicação de falta'];
    const id = `twitch:${item.name}`;
    if (state.sessions[id]?.ownerIds?.includes(POKEIDLE_OWNER)) labels.push('Aba automática aberta');
    else if (state.queue.includes(id) && state.queueSources?.[id]?.includes(POKEIDLE_OWNER)) labels.push('Na fila automática');
    node.append(element('p', labels.join(' · ')));
    list.append(node);
  }
}
function renderPokeIdle(state) {
  const source = state.pokeidle || {};
  const channels = Array.isArray(source.channels) ? source.channels : [];
  const eligible = channels.filter(item => item.live && item.bonus && item.missing);
  const active = Object.entries(state.sessions).filter(([id, session]) => id.startsWith('twitch:') && session.ownerIds?.includes(POKEIDLE_OWNER));
  const queued = state.queue.filter(id => state.queueSources?.[id]?.includes(POKEIDLE_OWNER));
  const observed = Number.isFinite(source.observedAt) && source.observedAt > 0;
  const stale = observed && Date.now() - source.observedAt > 180000;
  $('#pokeidle-enabled').checked = source.enabled !== false;
  $('#pokeidle-official-count').textContent = String(channels.length);
  $('#pokeidle-live-bonus-count').textContent = String(channels.filter(item => item.live && item.bonus).length);
  $('#pokeidle-missing-count').textContent = String(channels.filter(item => item.missing).length);
  $('#pokeidle-sessions').textContent = `${active.length} sessões Twitch do PokeIdle abertas · ${queued.length} na fila automática.`;
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
  if (source.enabled === false) waiting = 'Automação do PokeIdle desativada. Sessões manuais e canais Kick são preservados.';
  else if (state.automationPaused) waiting = 'Automação pausada. Use Iniciar todos ou Retomar agenda para permitir novas aberturas.';
  else if (queued.length) waiting = `${queued.length} canais aguardam na fila automática. Limite atual: ${state.settings.maxConcurrent ?? 3} abas gerenciadas. Ajuste o limite em Limites de consumo se desejar; ele não aumenta automaticamente.`;
  else if (observed && source.connected === true && !stale && eligible.some(item => !state.sessions[`twitch:${item.name}`]?.ownerIds?.includes(POKEIDLE_OWNER))) waiting = 'Há canais ao vivo, com bônus e marcados faltantes sem sessão automática. Sincronize novamente e confira os limites.';
  $('#pokeidle-waiting').hidden = !waiting;
  $('#pokeidle-waiting').textContent = waiting;
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
  const list = $('#schedules');
  list.replaceChildren();
  if (!state.schedules.length) empty(list, 'Sem horários cadastrados. A agenda inicia apenas as oportunidades que você configurar.');
  for (const schedule of state.schedules) {
    const phase = schedule.endedAt ? 'Encerrada' : !schedule.enabled ? 'Desativada' : schedule.startedAt ? 'Iniciada' : 'Agendada';
    const node = card(schedule.channelIds.map(channelLabel).join(', '), phase);
    node.append(element('p', `${formatTime(schedule.startsAt)} → ${formatTime(schedule.endsAt)}`));
    const controls = element('div', '', 'actions');
    if (!schedule.endedAt) controls.append(action(schedule.enabled ? 'Desativar' : 'Ativar', { type: 'toggleSchedule', id: schedule.id, enabled: !schedule.enabled }));
    controls.append(action('Excluir horário', { type: 'removeSchedule', id: schedule.id }, 'danger'));
    node.append(controls);
    list.append(node);
  }
  $('#automation-state').textContent = state.automationPaused ? 'Agenda e automação pausadas.' : 'Agenda e automação habilitadas conforme suas configurações.';
  $('#toggle-automation').textContent = state.automationPaused ? 'Retomar agenda' : 'Pausar agenda';
}
function renderAlerts(state) {
  const list = $('#alerts');
  list.replaceChildren();
  const alerts = state.alerts.filter(alert => !alert.read);
  $('#alert-count').textContent = String(alerts.length);
  if (!alerts.length) empty(list, 'Nenhum aviso pendente.');
  for (const alert of alerts) {
    const node = element('article', '', 'notice');
    node.append(element('strong', alert.title || 'Aviso'), element('p', alert.message || ''));
    if (alert.at) node.append(element('p', formatTime(alert.at), 'hint'));
    const controls = element('div', '', 'actions');
    if (alert.channelId && state.sessions[alert.channelId]) controls.append(action('Ver aba', { type: 'openSession', id: alert.channelId }));
    controls.append(action('Dispensar aviso', { type: 'dismissAlert', id: alert.id }));
    node.append(controls);
    list.append(node);
  }
}
function render(state) {
  lastState = { channels: [], sessions: {}, bonuses: [], measurements: [], schedules: [], settings: {}, queue: [], alerts: [], ...state };
  lastState.summary ||= {};
  state = lastState;
  $('#kick-live').checked = state.kickLive;
  $('#summary').textContent = `${Object.keys(state.sessions).length} de ${state.channels.length} canais abertos`;
  $('#queue-summary').textContent = state.queue.length ? `${state.queue.length} na fila: ${state.queue.map(channelLabel).join(', ')}` : 'Sem canais na fila.';
  $('#xp-total').textContent = Number.isFinite(state.summary.totals?.xpDelta) ? `${formatNumber(state.summary.totals.xpDelta)} XP` : 'Sem comparação';
  $('#bonus-total').textContent = String((state.summary.bonusItems || []).filter(bonus => bonus.status === 'ready').length);
  renderChannels(state);
  renderPokeIdle(state);
  fillChannelFields(state);
  renderBonuses(state);
  renderHistory(state);
  renderSchedules(state);
  renderAlerts(state);
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

form('#add-form', () => command({ type: 'add', platform: $('#platform').value, input: $('#channel').value }));
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
form('#schedule-form', async () => {
  const channelIds = [...$('#schedule-channels').querySelectorAll('input:checked')].map(input => input.value);
  if (!channelIds.length) throw new Error('Selecione ao menos um canal para agendar.');
  const schedule = { channelIds, startsAt: timestamp('#schedule-start'), endsAt: timestamp('#schedule-end') };
  if (schedule.endsAt <= schedule.startsAt) throw new Error('O fim precisa ser depois do início.');
  if (await command({ type: 'addSchedule', schedule })) $('#schedule-form').reset();
});
form('#settings-form', () => command({ type: 'setSettings', settings: { maxConcurrent: numeric('#max-concurrent'), maxKickLives: numeric('#max-kick-lives'), sessionMinutes: numeric('#session-minutes'), notifications: $('#notifications-enabled').checked, autoReconnect: $('#auto-reconnect').checked } }));
$('#refresh').addEventListener('click', () => command({ type: 'status' }));
$('#open-pokeidle').addEventListener('click', () => command({ type: 'openPokeIdle' }));
$('#refresh-pokeidle').addEventListener('click', () => command({ type: 'refreshPokeIdle' }));
$('#pokeidle-enabled').addEventListener('change', event => command({ type: 'setPokeIdle', enabled: event.target.checked }));
$('#pokeidle-filter').addEventListener('change', () => { if (lastState) renderPokeIdleChannels(lastState); });
$('#kick-live').addEventListener('change', event => command({ type: 'setKickLive', enabled: event.target.checked }));
$('#start-all').addEventListener('click', () => command({ type: 'startAll' }));
$('#stop-all').addEventListener('click', () => command({ type: 'stopAll' }));
$('#bonus-cancel').addEventListener('click', resetBonus);
$('#toggle-automation').addEventListener('click', () => command({ type: lastState?.automationPaused ? 'resumeAutomation' : 'pauseAutomation' }));
$('#measurement-at').value = localInput(Date.now());
$('#schedule-timezone').textContent = `Horários no fuso deste navegador: ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'}.`;
command({ type: 'status' });
