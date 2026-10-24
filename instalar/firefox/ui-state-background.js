const UI_PANEL_COLLECTIONS = { bonuses: 'bonuses', history: 'measurements', schedule: 'schedules', pokeidle: null };

// Uma preferência ausente permite recuperar os painéis que já tinham dados.
// Ocultar um painel é apenas uma escolha de interface; não desativa sua função.
function normalizeUiPreferences(raw) {
  const panels = {};
  const input = raw && typeof raw === 'object' && !Array.isArray(raw)
    && raw.panels && typeof raw.panels === 'object' && !Array.isArray(raw.panels) ? raw.panels : {};
  for (const panel of Object.keys(UI_PANEL_COLLECTIONS)) {
    if (Object.hasOwn(input, panel) && typeof input[panel] === 'boolean') panels[panel] = input[panel];
  }
  return { panels };
}

function uiPanelVisible(state, panel) {
  if (!Object.hasOwn(UI_PANEL_COLLECTIONS, panel)) return false;
  const preference = normalizeUiPreferences(state?.uiPreferences).panels[panel];
  if (typeof preference === 'boolean') return preference;
  if (panel === 'pokeidle') return [state?.pokeidle?.observedAt, state?.pokeidle?.kickSync?.observedAt].some(value => Number.isFinite(value) && value > 0);
  if (panel === 'schedule' && Array.isArray(state?.liveWatch?.channelIds) && state.liveWatch.channelIds.length) return true;
  const records = state?.[UI_PANEL_COLLECTIONS[panel]];
  return Array.isArray(records) && records.length > 0;
}
