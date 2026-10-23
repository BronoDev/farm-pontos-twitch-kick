import test from 'node:test';
import assert from 'node:assert/strict';
import { readPokeIdleTwitch } from '../src/pokeidle.js';

function anchor(href, { displayName = '', classes = [], rule = '' } = {}) {
  return {
    getAttribute: attribute => attribute === 'href' ? href : null,
    classList: { contains: value => classes.includes(value) },
    querySelector: selector => selector === '.tw-canal-nome'
      ? { textContent: displayName }
      : selector === '.tw-canal-bonus[title]' && rule
        ? { getAttribute: attribute => attribute === 'title' ? rule : null } : null
  };
}

function widget(anchors) {
  return { matches: selector => selector === '.tw-canais', querySelectorAll: selector => selector === 'a.tw-canal' ? anchors : [] };
}

function root(...widgets) {
  return { querySelectorAll: selector => selector === '.tw-canais' ? widgets : [] };
}

test('lista ausente, vazia ou em carregamento não representa canais offline', () => {
  for (const document of [root(), root(widget([])), root(widget([anchor('/tftoddy')]))]) {
    assert.deepEqual(readPokeIdleTwitch(document), { ready: false, channels: [], ruleText: '' });
  }
});

test('canais e bônus vêm apenas das classes e títulos públicos do widget', () => {
  const document = root(widget([
    anchor('https://www.twitch.tv/TfToDdY', { displayName: '  TFToddy\n oficial  ', classes: ['ao-vivo', 'com-bonus', 'tw-falta-eu'], rule: ' +15% na primeira\n live e +2,5% por live adicional ' }),
    anchor('https://twitch.tv/axtlol/', { displayName: 'AO VIVO + XP', classes: [] })
  ]));
  assert.deepEqual(readPokeIdleTwitch(document), {
    ready: true,
    channels: [
      { name: 'tftoddy', displayName: 'TFToddy oficial', live: true, bonus: true, missing: true },
      { name: 'axtlol', displayName: 'AO VIVO + XP', live: false, bonus: false, missing: false }
    ],
    ruleText: '+15% na primeira live e +2,5% por live adicional'
  });
});

test('recusa URLs externas, rotas internas, credenciais e links que não são canais', () => {
  const invalid = [
    'http://twitch.tv/test', 'https://twitch.tv.evil.test/test', 'https://evil.test/twitch.tv/test',
    'https://user@twitch.tv/test', 'https://user:password@twitch.tv/test', 'https://twitch.tv:444/test',
    'https://twitch.tv/test/videos', 'https://twitch.tv/test?live=1', 'https://twitch.tv/test#watch',
    'https://twitch.tv/directory', 'https://twitch.tv/popout/test', 'https://twitch.tv/a-b',
    'https://twitch.tv/a%5Fb', `https://twitch.tv/${'a'.repeat(26)}`, 'https://twitch.tv/',
    'https://twitch.tv/other/../test', 'https://twitch.tv/test\n', 'https:\\twitch.tv\\test',
    '//twitch.tv/test', '/test', 'javascript:alert(1)', '', null
  ];
  const document = root(widget(invalid.map(href => anchor(href, { classes: ['ao-vivo', 'com-bonus'] }))));
  assert.deepEqual(readPokeIdleTwitch(document), { ready: false, channels: [], ruleText: '' });
});

test('normaliza o login, elimina duplicados entre widgets e limita o lote', () => {
  const repeated = readPokeIdleTwitch(root(
    widget([anchor('https://twitch.tv/Foo_123', { classes: ['ao-vivo'] })]),
    widget([anchor('https://www.twitch.tv/foo_123'), anchor('https://twitch.tv/bar')])
  ));
  assert.deepEqual(repeated.channels.map(channel => channel.name), ['foo_123', 'bar']);
  assert.equal(repeated.channels[0].live, true);
  const capped = readPokeIdleTwitch(widget(Array.from({ length: 120 }, (_, index) => anchor(`https://twitch.tv/channel_${index}`))));
  assert.equal(capped.channels.length, 100);
});

test('limita texto público e ignora conteúdo de fora dos canais oficiais', () => {
  const document = root(widget([anchor('https://twitch.tv/channel', { displayName: 'x'.repeat(100), rule: 'r'.repeat(600) })]));
  document.querySelector = () => { throw new Error('Não deve ler comandos de moderação, saldo ou chat.'); };
  const result = readPokeIdleTwitch(document);
  assert.equal(result.channels[0].displayName.length, 80);
  assert.equal(result.ruleText.length, 500);
  assert.deepEqual(Object.keys(result.channels[0]), ['name', 'displayName', 'live', 'bonus', 'missing']);
});
