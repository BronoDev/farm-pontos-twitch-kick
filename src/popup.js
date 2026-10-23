const list = document.querySelector('#channels');
const errorBox = document.querySelector('#error');
const api = globalThis.browser ?? globalThis.chrome;
let busy = false;

function render(state) {
  document.querySelector('#summary').textContent = `${Object.keys(state.sessions).length} de ${state.channels.length} chats abertos`;
  list.replaceChildren();
  if (!state.channels.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Adicione um canal para abrir o chat sem o player.';
    list.append(empty);
  }
  for (const item of state.channels) {
    const session = state.sessions[item.id];
    const row = document.createElement('div');
    row.className = 'row';
    const info = document.createElement('div');
    info.className = 'info';
    const name = document.createElement('div');
    name.className = 'name';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = item.platform;
    name.append(badge, document.createTextNode(item.name));
    const status = document.createElement('div');
    status.className = 'status';
    status.textContent = session ? `Aba aberta desde ${new Date(session.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · conexão não verificada` : 'Chat fechado';
    info.append(name, status);
    row.append(info);
    for (const [label, type, className] of [[session ? 'Fechar chat' : 'Iniciar', session ? 'stop' : 'start', 'secondary'], ['Remover', 'remove', 'danger']]) {
      const button = document.createElement('button');
      button.className = className;
      button.textContent = label;
      button.addEventListener('click', () => command({ type, id: item.id }));
      row.append(button);
    }
    list.append(row);
  }
}

async function command(message) {
  if (busy) return;
  busy = true;
  errorBox.hidden = true;
  document.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try {
    const result = await api.runtime.sendMessage(message);
    if (!result?.ok) throw new Error(result?.error || 'O navegador não respondeu. Tente novamente.');
    render(result.state);
    if (result.state.warnings?.length) {
      errorBox.textContent = result.state.warnings.join(' · ');
      errorBox.hidden = false;
    }
    if (message.type === 'add') document.querySelector('#channel').value = '';
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    busy = false;
    document.querySelectorAll('button').forEach(b => { b.disabled = false; });
  }
}

document.querySelector('#add-form').addEventListener('submit', event => {
  event.preventDefault();
  command({ type: 'add', platform: document.querySelector('#platform').value, input: document.querySelector('#channel').value });
});
document.querySelector('#refresh').addEventListener('click', () => command({ type: 'status' }));
document.querySelector('#start-all').addEventListener('click', () => command({ type: 'startAll' }));
document.querySelector('#stop-all').addEventListener('click', () => command({ type: 'stopAll' }));
command({ type: 'status' });
