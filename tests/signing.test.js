import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { credentialStatus, parseArgs, makePlan, webExtArgs, childEnvironment, assertVerification, redactOutput, verifyArtifact } from '../scripts/mozilla-sign.mjs';

const manifest = {
  manifest_version: 2,
  version: '0.6.0',
  browser_specific_settings: { gecko: { id: 'chat-leve@bronodev.github.io' }, gecko_android: { strict_min_version: '142.0' } }
};

test('assinatura usa um único pacote universal e canal não listado sem credenciais nos argumentos', () => {
  const plan = makePlan(manifest, '/project');
  assert.equal(plan.source, path.join('/project', 'instalar', 'firefox-android'));
  assert.equal(plan.channel, 'unlisted');
  const args = webExtArgs(plan);
  assert.ok(args.includes('unlisted'));
  assert.ok(args.includes('https://addons.mozilla.org/api/v5/'));
  assert.ok(args.includes('--no-config-discovery'));
  assert.ok(!args.includes('--api-key'));
  assert.ok(!args.includes('--api-secret'));
  assert.equal(parseArgs(['--target=android', '--check']).check, true);
  assert.equal(parseArgs(['--dry-run']).check, true);
  assert.throws(() => parseArgs(['--target=listed']));
  assert.throws(() => parseArgs(['--api-secret=never']));
  assert.throws(() => makePlan({ ...manifest, version: '../../escape' }));
});

test('variáveis só são relatadas por presença e opções de destino não vêm do ambiente', () => {
  const env = { WEB_EXT_API_KEY: 'issuer-example', WEB_EXT_API_SECRET: 'secret-example', WEB_EXT_AMO_BASE_URL: 'https://other.test', WEB_EXT_CHANNEL: 'listed', PATH: '/bin' };
  assert.deepEqual(credentialStatus(env), { WEB_EXT_API_KEY: true, WEB_EXT_API_SECRET: true });
  assert.deepEqual(credentialStatus({ WEB_EXT_API_KEY: ' ' }), { WEB_EXT_API_KEY: false, WEB_EXT_API_SECRET: false });
  const child = childEnvironment(env);
  assert.equal(child.WEB_EXT_API_KEY, env.WEB_EXT_API_KEY);
  assert.equal(child.WEB_EXT_API_SECRET, env.WEB_EXT_API_SECRET);
  assert.equal(child.WEB_EXT_AMO_BASE_URL, undefined);
  assert.equal(child.WEB_EXT_CHANNEL, undefined);
  const safe = redactOutput('issuer-example secret-example Bearer tokenvalue eyJabc.def.ghi', env);
  assert.ok(!safe.includes('issuer-example'));
  assert.ok(!safe.includes('secret-example'));
  assert.ok(!safe.includes('tokenvalue'));
  assert.ok(!safe.includes('eyJabc.def.ghi'));
  assert.throws(() => assertVerification({ NODE_TLS_REJECT_UNAUTHORIZED: '0' }), /TLS/);
  assert.throws(() => assertVerification({ npm_config_strict_ssl: 'false' }), /TLS/);
  assert.doesNotThrow(() => assertVerification({}));
});

test('execução sem chaves falha antes de chamar serviço externo e não imprime valores', () => {
  const env = { ...process.env };
  delete env.WEB_EXT_API_KEY;
  delete env.WEB_EXT_API_SECRET;
  const result = spawnSync(process.execPath, ['scripts/mozilla-sign.mjs'], { cwd: new URL('../', import.meta.url), env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Configure WEB_EXT_API_KEY e WEB_EXT_API_SECRET/);
  assert.doesNotMatch(result.stdout, /Enviando uma versão/);
});

test('confere conteúdo do XPI sem alegar validação criptográfica e rejeita fonte alterada', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'chat-leve-sign-test-'));
  try {
    const source = path.join(directory, 'source');
    await mkdir(source);
    await writeFile(path.join(source, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(path.join(source, 'example.js'), 'const value=1;');
    const artifact = path.join(directory, 'example.xpi');
    const result = spawnSync('python3', ['-c', "import pathlib,sys,zipfile\np=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],'w') as z:\n for f in p.iterdir():z.write(f,f.name)\n z.writestr('META-INF/mozilla.rsa','fake metadata only; not a real signature')", source, artifact], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const plan = { ...makePlan(manifest, directory), stagedSource: source };
    const checked = await verifyArtifact(artifact, plan);
    assert.equal(checked.version, manifest.version);
    assert.match(checked.sha256, /^[a-f0-9]{64}$/);
    await writeFile(path.join(source, 'example.js'), 'changed');
    await assert.rejects(verifyArtifact(artifact, plan), /não passou na conferência/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
