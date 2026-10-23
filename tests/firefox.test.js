import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('pacote Firefox carrega seus scripts clássicos e atende mensagens com browser.*', async () => {
  const base = new URL('../instalar/firefox/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
  assert.equal(manifest.background.service_worker, undefined);
  let handler;
  let data = {};
  let opens = 0;
  const tabs = new Map();
  const api = {
    runtime: { id: manifest.browser_specific_settings.gecko.id, onMessage: { addListener(fn) { handler = fn; } } },
    storage: { local: {
      get: async () => structuredClone(data),
      set: async next => { data = structuredClone(next); }
    } },
    windows: { create: async options => {
      const id = ++opens;
      tabs.set(id, { url: options.url });
      return { tabs: [{ id }] };
    } },
    tabs: {
      get: async id => tabs.get(id),
      remove: async id => tabs.delete(id)
    }
  };
  // Firefox a partir do manifesto: sem import/export e sem chrome.* disponível.
  const context = vm.createContext({ browser: api, URL });
  for (const script of manifest.background.scripts) {
    vm.runInContext(await readFile(new URL(script, base), 'utf8'), context, { filename: script });
  }
  const send = message => new Promise(resolve => {
    assert.equal(handler(message, { id: api.runtime.id }, resolve), true);
  });
  assert.equal(handler({ type: 'status' }, { id: 'outra-extensao' }, () => assert.fail()), false);
  assert.equal((await send({ type: 'add', platform: 'kick', input: 'yetz' })).ok, true);
  const [first, second] = await Promise.all([
    send({ type: 'start', id: 'kick:yetz' }),
    send({ type: 'start', id: 'kick:yetz' })
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(opens, 1, 'mensagens concorrentes não duplicam janelas');
  assert.equal((await send({ type: 'add', platform: 'kick', input: '<script>' })).ok, false);
  assert.equal((await send({ type: 'status' })).ok, true, 'erro não bloqueia mensagens posteriores');
  assert.equal((await send({ type: 'stop', id: 'kick:yetz' })).ok, true);
  assert.equal(tabs.size, 0);
});
