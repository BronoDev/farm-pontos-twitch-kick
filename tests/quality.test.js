import test from 'node:test';
import assert from 'node:assert/strict';
import { resolution, qualityOptions } from '../src/kick-quality.js';

test('interpreta apenas rótulos de resolução, não Auto, áudio ou texto arbitrário', () => {
  assert.equal(resolution('160p'), 160);
  assert.equal(resolution('1080p60 (Source)'), 1080);
  assert.equal(resolution('360p · 500 Kbps'), 360);
  for (const label of ['Auto', 'Source', 'audio only', '1p', 'Qualidade 160p', '160people', '99999p']) assert.equal(resolution(label), null);
});

test('escolhe a menor qualidade real, ignora controles ocultos e desabilitados', () => {
  const element = (label, visible = true, disabled = false) => ({
    textContent: label,
    disabled,
    getAttribute: () => null,
    getClientRects: () => visible ? [{}] : []
  });
  const root = { querySelectorAll: () => [element('Auto'), element('720p'), element('160p'), element('144p', false), element('120p', true, true), element('360p')] };
  assert.deepEqual(qualityOptions(root).map(option => option.height), [160, 360, 720]);
});
