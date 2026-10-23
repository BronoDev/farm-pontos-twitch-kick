import test from 'node:test';
import assert from 'node:assert/strict';
import { qualityOptions, playerButton } from '../src/kick-quality.js';

function element(textContent = '', attributes = {}, { visible = true, hiddenAncestor = false } = {}) {
  return {
    textContent, disabled: false, hidden: false,
    getAttribute: name => attributes[name] ?? null,
    getClientRects: () => visible ? [{}] : [],
    closest: () => hiddenAncestor ? {} : null
  };
}

test('Twitch usa o label do radio mesmo quando aria-label não contém a resolução', () => {
  const low = element('', { 'aria-label': 'Selecione a qualidade' }, { visible: false });
  Object.assign(low, { tagName: 'INPUT', labels: [element('160p')] });
  const source = element('', {});
  Object.assign(source, { tagName: 'INPUT', labels: [element('1080p60 (Source)')] });
  const auto = element('', {});
  Object.assign(auto, { tagName: 'INPUT', labels: [element('Auto')] });
  const options = qualityOptions({ querySelectorAll: () => [source, auto, low] });
  assert.deepEqual(options.map(option => option.height), [160, 1080]);
  assert.equal(options[0].element, low);
});

test('Twitch aceita resolução acessível por aria-labelledby e ignora radio desabilitado', () => {
  const radio = element('', { 'aria-labelledby': 'quality-360' });
  Object.assign(radio, { tagName: 'INPUT', labels: [], ownerDocument: { getElementById: id => id === 'quality-360' ? { textContent: '360p' } : null } });
  const disabled = element('160p'); disabled.disabled = true;
  assert.deepEqual(qualityOptions({ querySelectorAll: () => [disabled, radio] }).map(option => option.height), [360]);
});

test('um radio e seu wrapper não duplicam a opção, e menus ocultos são ignorados', () => {
  const radio = element(''); Object.assign(radio, { tagName: 'INPUT', labels: [element('160p')] });
  const wrapper = element('160p'); wrapper.querySelector = () => radio;
  const hidden = element('72p', {}, { hiddenAncestor: true });
  const result = qualityOptions({ querySelectorAll: () => [wrapper, radio, hidden] });
  assert.equal(result.length, 1);
  assert.equal(result[0].element, radio);
  assert.equal(result[0].height, 160);
});

test('botões data-a-target da Twitch funcionam sem depender do idioma do rótulo', () => {
  const settings = element('Réglages');
  const quality = element('Qualität');
  const root = { querySelectorAll: selector => {
    if (selector === '[data-a-target="player-settings-button"]') return [settings];
    if (selector === '[data-a-target="player-settings-menu-item-quality"]') return [quality];
    return [];
  } };
  assert.equal(playerButton(root, 'settings'), settings);
  assert.equal(playerButton(root, 'quality'), quality);
});
