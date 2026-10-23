// O gerador remove os exports ao empacotar como content script clássico.
function resolution(label) {
  const match = String(label).trim().match(/^(\d{2,4})p(?:\d{2,3})?(?=$|\s|[([·-])/i);
  const height = Number(match?.[1]);
  return height >= 72 && height <= 4320 ? height : null;
}

function qualityOptions(root) {
  return [...root.querySelectorAll('button, [role="menuitemradio"], [role="radio"], [role="option"], [role="menuitem"]')]
    .filter(element => !element.disabled && element.getAttribute('aria-disabled') !== 'true' && element.getClientRects().length)
    .map(element => ({ element, height: resolution(element.getAttribute('aria-label') || element.textContent) }))
    .filter(option => option.height)
    .sort((a, b) => a.height - b.height);
}

function playerButton(root, kind) {
  const pattern = kind === 'quality' ? /\b(quality|qualidade|resolu[cç][aã]o)\b/i : /\b(settings|configura[cç][oõ]es|ajustes)\b/i;
  return [...root.querySelectorAll('button, [role="button"], [role="menuitem"]')].find(element => {
    const label = element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '';
    return label.length < 100 && !element.disabled && element.getClientRects().length && pattern.test(label);
  });
}
