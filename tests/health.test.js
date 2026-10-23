import test from 'node:test';
import assert from 'node:assert/strict';
import { readSiteHealth } from '../src/site-status.js';

function root(markers = {}, video = null) {
  return {
    querySelectorAll: selector => markers[selector] || [],
    querySelector: selector => selector === 'video' ? video : null
  };
}

function element({ hidden = false, ariaHidden = false, visible = true } = {}) {
  return { hidden, getAttribute: attribute => attribute === 'aria-hidden' && ariaHidden ? 'true' : null,
    getClientRects: () => visible ? [{}] : [] };
}

test('rede local disponível e página sem evidências permanecem desconhecidas', () => {
  assert.deepEqual(readSiteHealth(root(), true), {
    login: 'unknown', connection: 'unknown', live: 'unknown', playbackError: false
  });
});

test('não trata elemento de login oculto como sessão expirada', () => {
  assert.equal(readSiteHealth(root({ '[data-a-target="login-button"]': [element({ visible: false })] }), true).login, 'unknown');
  assert.equal(readSiteHealth(root({ '[data-a-target="login-button"]': [element({ hidden: true })] }), true).login, 'unknown');
  assert.equal(readSiteHealth(root({ '[data-a-target="login-button"]': [element({ ariaHidden: true })] }), true).login, 'unknown');
});

test('mostra login desconectado ou conectado apenas com evidência explícita e não contraditória', () => {
  assert.equal(readSiteHealth(root({ '[data-a-target="login-button"]': [element()] }), true).login, 'signed-out');
  assert.equal(readSiteHealth(root({ '[data-a-target="user-menu-toggle"]': [element()] }), true).login, 'signed-in');
  assert.equal(readSiteHealth(root({ '[data-a-target="user-menu-toggle"]': [element()], '[data-a-target="login-button"]': [element()] }), true).login, 'unknown');
});

test('offline do navegador vence marcador de conexão antigo da página', () => {
  const page = root({ '[data-a-target="chat-connected"]': [element()] });
  assert.equal(readSiteHealth(page, true).connection, 'online');
  assert.equal(readSiteHealth(page, false).connection, 'offline');
  assert.equal(readSiteHealth(root({ '[data-testid="chat-disconnected"]': [element()] }), true).connection, 'offline');
});

test('live precisa de indicador explícito e vídeos pausados ou tocando não comprovam live', () => {
  assert.equal(readSiteHealth(root({}, { paused: false, readyState: 4 }), true).live, 'unknown');
  assert.equal(readSiteHealth(root({}, { paused: true, readyState: 4 }), true).live, 'unknown');
  assert.equal(readSiteHealth(root({ '[data-testid="live-indicator"]': [element()] }), true).live, 'live');
  assert.equal(readSiteHealth(root({ '[data-testid="channel-offline"]': [element()] }), true).live, 'offline');
  assert.equal(readSiteHealth(root({ '[data-testid="channel-offline"]': [element()], '[data-testid="live-indicator"]': [element()] }), true).live, 'unknown');
});

test('erro nativo de mídia é separado de canal offline e autenticação', () => {
  const health = readSiteHealth(root({}, { error: { code: 3 } }), true);
  assert.equal(health.playbackError, true);
  assert.equal(health.live, 'unknown');
  assert.equal(health.login, 'unknown');
});
