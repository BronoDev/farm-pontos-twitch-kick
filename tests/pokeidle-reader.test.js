import test from 'node:test';
import assert from 'node:assert/strict';
import { readPokeIdleTwitch, readPokeIdleChannels } from '../src/pokeidle.js';

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
  return { anchors, matches: selector => selector === '.tw-canais', querySelectorAll: selector => ['a.tw-canal', 'a[href]'].includes(selector) ? anchors : [] };
}

function root(...widgets) {
  return { querySelectorAll: selector => selector === '.tw-canais' ? widgets : selector === 'a[href]' ? widgets.flatMap(widget => widget.anchors) : [] };
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
      { platform: 'twitch', name: 'tftoddy', displayName: 'TFToddy oficial', live: true, bonus: true, missing: true, source: 'widget' },
      { platform: 'twitch', name: 'axtlol', displayName: 'AO VIVO + XP', live: false, bonus: false, missing: false, source: 'widget' }
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
  assert.deepEqual(Object.keys(result.channels[0]), ['platform', 'name', 'displayName', 'live', 'bonus', 'missing', 'source']);
});

test('identifica Kick no markup conhecido sem misturar plataformas de mesmo nome', () => {
  const document = root(widget([
    anchor('https://twitch.tv/yetz', { classes: ['ao-vivo', 'com-bonus'], rule: 'Regra Twitch' }),
    anchor('https://www.kick.com/YeTz', { displayName: '  yeTz  ', classes: ['ao-vivo', 'com-bonus', 'tw-falta-eu'], rule: 'Não confundir com regra Twitch' })
  ]));
  const result = readPokeIdleChannels(document);
  assert.deepEqual(result.channels.map(({ platform, name }) => `${platform}:${name}`), ['twitch:yetz', 'kick:yetz']);
  assert.deepEqual(result.channels[1], { platform: 'kick', name: 'yetz', displayName: 'yeTz', live: true, bonus: true, missing: true, source: 'widget' });
  assert.equal(result.ruleText, 'Regra Twitch');
  assert.deepEqual(readPokeIdleTwitch(document), result, 'o nome antigo continua sendo um alias compatível');
});

test('links Kick fora do widget importam somente o canal, com status desconhecido', () => {
  const links = [
    anchor('https://kick.com/Yetz', { displayName: 'AO VIVO + 100% XP', classes: ['ao-vivo', 'com-bonus', 'tw-falta-eu'], rule: 'Não é regra Twitch' }),
    anchor('https://www.kick.com/outro_canal-123/'),
    anchor('https://twitch.tv/nao_oficial', { classes: ['ao-vivo'] })
  ];
  const document = { querySelectorAll: selector => selector === 'a[href]' ? links : [] };
  assert.deepEqual(readPokeIdleChannels(document), { ready: true, channels: [
    { platform: 'kick', name: 'yetz', displayName: 'yetz', live: null, bonus: false, missing: false, source: 'link' },
    { platform: 'kick', name: 'outro_canal-123', displayName: 'outro_canal-123', live: null, bonus: false, missing: false, source: 'link' }
  ], ruleText: '' });
});

test('recusa links Kick de rotas, credenciais, origem parecida, traversal ou caracteres inválidos', () => {
  const invalid = ['http://kick.com/yetz', 'https://kick.com.evil.test/yetz', 'https://user@kick.com/yetz',
    'https://user:pass@kick.com/yetz', 'https://kick.com:443/yetz', 'https://kick.com/yetz?live=1',
    'https://kick.com/yetz#live', 'https://kick.com/yetz/videos', 'https://kick.com/yetz/../outro',
    'https://kick.com/yetz%2Foutro', 'https://kick.com/yetz\n', 'https:\\kick.com\\yetz',
    'https://kick.com/-yetz', `https://kick.com/${'a'.repeat(41)}`, '/yetz', 'https://kick.com/',
    ...['browse', 'categories', 'dashboard', 'popout', 'settings', 'login', 'terms-of-service', 'privacy-policy', 'community-guidelines'].map(name => `https://kick.com/${name}`)];
  const document = { querySelectorAll: selector => selector === 'a[href]' ? invalid.map(href => anchor(href)) : [] };
  assert.deepEqual(readPokeIdleChannels(document), { ready: false, channels: [], ruleText: '' });
});

test('deduplica Kick canônico e conserva metadados do widget sobre um link genérico', () => {
  const known = anchor('https://www.kick.com/yetz', { classes: ['ao-vivo', 'com-bonus'] });
  const knownWidget = widget([known]);
  const document = { querySelectorAll: selector => selector === '.tw-canais' ? [knownWidget]
    : selector === 'a[href]' ? [anchor('https://kick.com/YETZ/'), known, anchor('https://kick.com/segundo')] : [] };
  const result = readPokeIdleChannels(document);
  assert.equal(result.channels.length, 2);
  assert.equal(result.channels[0].live, true);
  assert.equal(result.channels[0].bonus, true);
  assert.equal(result.channels[1].live, null);
  const maximumName = 'a'.repeat(40);
  const capped = readPokeIdleChannels({ querySelectorAll: selector => selector === 'a[href]'
    ? [anchor(`https://kick.com/${maximumName}`), ...Array.from({ length: 130 }, (_, index) => anchor(`https://kick.com/canal_${index}`))] : [] });
  assert.equal(capped.channels.length, 100);
  assert.equal(capped.channels[0].name, maximumName);
});
