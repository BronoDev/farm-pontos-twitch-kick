// O gerador remove os exports ao empacotar como content script clássico.
function resolution(label) {
  const match = String(label).trim().match(/^(\d{2,4})p(?:\d{2,3})?(?=$|\s|[([·-])/i);
  const height = Number(match?.[1]);
  return height >= 72 && height <= 4320 ? height : null;
}

function qualityOptions(root) {
  const seen = new Set();
  const options = [];
  const selector = 'button, [role="menuitemradio"], [role="radio"], [role="option"], [role="menuitem"], '
    + '[data-a-target="player-settings-submenu-quality-option"], input[name="player-settings-submenu-quality-option"], '
    + '[data-a-target="player-settings-submenu-quality"] input[type="radio"]';
  for (const element of root.querySelectorAll(selector)) {
    const control = element.tagName === 'INPUT' ? element : element.querySelector?.('input[type="radio"]') || element;
    if (seen.has(control) || control.disabled || element.getAttribute('aria-disabled') === 'true') continue;
    const labels = [...(control.labels || [])];
    const isVisible = node => !node.hidden && node.getAttribute('aria-hidden') !== 'true'
      && !node.closest?.('[hidden], [aria-hidden="true"], [inert]') && node.getClientRects().length;
    if (!isVisible(element) && !labels.some(isVisible)) continue;
    // Twitch apresenta as resoluções em radios, cujo texto pertence ao label.
    const described = (control.getAttribute('aria-labelledby') || '').split(/\s+/)
      .map(id => control.ownerDocument?.getElementById(id)?.textContent || '');
    const texts = [element.getAttribute('aria-label'), control.getAttribute('aria-label'), ...labels.map(label => label.textContent), ...described, element.textContent];
    const height = texts.map(resolution).find(value => value !== null);
    if (!height) continue;
    seen.add(control);
    options.push({ element: control, height });
  }
  return options.sort((a, b) => a.height - b.height);
}

function playerButton(root, kind) {
  const target = kind === 'quality' ? 'player-settings-menu-item-quality' : 'player-settings-button';
  const visible = element => !element.disabled && element.getAttribute('aria-disabled') !== 'true'
    && !element.closest?.('[hidden], [aria-hidden="true"], [inert]') && element.getClientRects().length;
  // Seletores DOM do player Twitch; não são uma API pública ou acesso ao estado React.
  const twitch = [...root.querySelectorAll(`[data-a-target="${target}"]`)].find(visible);
  if (twitch) return twitch;
  const pattern = kind === 'quality' ? /\b(quality|qualidade|resolu[cç][aã]o)\b/i : /\b(settings|configura[cç][oõ]es|ajustes)\b/i;
  return [...root.querySelectorAll('button, [role="button"], [role="menuitem"]')].find(element => {
    const label = element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '';
    return label.length < 100 && visible(element) && pattern.test(label);
  });
}
