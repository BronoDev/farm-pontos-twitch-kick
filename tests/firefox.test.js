import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

for (const target of ['firefox', 'firefox-android']) {
test(`pacote ${target} carrega scripts e aceita o painel em uma aba de extensão`, async () => {
  const base = new URL(`../instalar/${target}/`, import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
  assert.equal(manifest.background.service_worker, undefined);
  let handler;
  let data = {};
  let opens = 0;
  const tabs = new Map();
  const api = {
    runtime: { id: manifest.browser_specific_settings.gecko.id, getURL: path => `moz-extension://test/${path}`, getBrowserInfo: async () => ({ name: 'Firefox' }), getPlatformInfo: async () => ({ os: target === 'firefox-android' ? 'android' : 'linux' }), onMessage: { addListener(fn) { handler = fn; } } },
    storage: { local: {
      get: async () => structuredClone(data),
      set: async next => { data = structuredClone(next); }
    } },
    tabs: {
      create: async options => {
        const id = ++opens;
        const tab = { id, url: options.url, active: options.active, muted: options.muted };
        tabs.set(id, tab);
        return tab;
      },
      get: async id => tabs.get(id),
      remove: async id => tabs.delete(id),
      update: async (id, options) => {
        assert.notEqual(target, 'firefox-android', 'Android deve silenciar ao criar a aba');
        return Object.assign(tabs.get(id), options);
      }
    }

  };
  // Firefox a partir do manifesto: sem import/export e sem chrome.* disponível.
  const context = vm.createContext({ browser: api, URL });
  for (const script of manifest.background.scripts) {
    vm.runInContext(await readFile(new URL(script, base), 'utf8'), context, { filename: script });
  }
  const send = message => new Promise(resolve => {
    assert.equal(handler(message, { id: api.runtime.id, tab: { id: 99 }, url: api.runtime.getURL('popup.html') }, resolve), true);
  });
  assert.equal(handler({ type: 'status' }, { id: 'outra-extensao' }, () => assert.fail()), false);
  assert.equal(handler({ type: 'stopAll' }, { id: api.runtime.id, tab: { id: 99 }, url: 'https://kick.com/yetz' }, () => assert.fail()), false, 'página web não ganha comandos do painel');
  assert.equal(manifest.options_ui.open_in_tab, true);
  if (target === 'firefox-android') assert.equal(manifest.browser_specific_settings.gecko_android.strict_min_version, '142.0');
  assert.equal((await send({ type: 'add', platform: 'kick', input: 'yetz' })).ok, true);
  const [first, second] = await Promise.all([
    send({ type: 'start', id: 'kick:yetz' }),
    send({ type: 'start', id: 'kick:yetz' })
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(opens, 1, 'mensagens concorrentes não duplicam abas');
  assert.equal((await send({ type: 'add', platform: 'kick', input: '<script>' })).ok, false);
  assert.equal((await send({ type: 'status' })).ok, true, 'erro não bloqueia mensagens posteriores');
  assert.equal((await send({ type: 'stop', id: 'kick:yetz' })).ok, true);
  assert.equal(tabs.size, 0);
});
}
