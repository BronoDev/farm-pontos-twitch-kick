import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB_EXT_VERSION = '10.8.0';
export const CREDENTIAL_NAMES = ['WEB_EXT_API_KEY', 'WEB_EXT_API_SECRET'];
const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function parseArgs(args) {
  const options = { check: false, help: false, target: 'universal' };
  for (const arg of args) {
    if (arg === '--check' || arg === '--dry-run') options.check = true;
    else if (arg === '--help') options.help = true;
    else if (arg.startsWith('--target=')) {
      options.target = arg.slice('--target='.length);
      if (!['universal', 'desktop', 'android'].includes(options.target)) throw new Error('Alvo inválido. Use universal, desktop ou android.');
    } else throw new Error('Argumento desconhecido. Use --help para ver as opções.');
  }
  return options;
}

export function credentialStatus(env) {
  return Object.fromEntries(CREDENTIAL_NAMES.map(name => [name, typeof env[name] === 'string' && env[name].trim().length > 0]));
}

export function makePlan(manifest, root = projectRoot) {
  const id = manifest.browser_specific_settings?.gecko?.id;
  if (typeof id !== 'string' || !id.trim()) throw new Error('O manifesto precisa declarar o identificador Gecko já registrado no AMO.');
  if (!manifest.browser_specific_settings?.gecko_android?.strict_min_version) throw new Error('O pacote universal precisa declarar compatibilidade gecko_android.');
  if (typeof manifest.version !== 'string' || !/^\d+(?:\.\d+){0,3}$/.test(manifest.version)) throw new Error('Versão inválida no manifesto.');
  const directory = path.join(root, 'signed', manifest.version);
  return {
    id,
    version: manifest.version,
    channel: 'unlisted',
    source: path.join(root, 'instalar', 'firefox-android'),
    stagedSource: path.join(directory, 'source'),
    artifacts: path.join(directory, 'artifacts'),
    channelDirectory: directory
  };
}

export function webExtArgs(plan) {
  return ['exec', '--yes', `--package=web-ext@${WEB_EXT_VERSION}`, '--', 'web-ext', 'sign',
    '--source-dir', plan.stagedSource, '--artifacts-dir', plan.artifacts,
    '--channel', 'unlisted', '--amo-base-url', 'https://addons.mozilla.org/api/v5/',
    '--timeout', '300000', '--approval-timeout', '300000', '--no-config-discovery', '--no-input', '--no-verbose'];
}

export function childEnvironment(env) {
  const next = { ...env };
  // As opções e os destinos vêm do plano; outras variáveis WEB_EXT_* não podem alterá-los.
  for (const name of Object.keys(next)) if (name.startsWith('WEB_EXT_') && !CREDENTIAL_NAMES.includes(name)) delete next[name];
  next.npm_config_cache ||= path.join(os.tmpdir(), 'chat-leve-sign-npm-cache');
  next.XDG_CONFIG_HOME ||= path.join(os.tmpdir(), 'chat-leve-sign-config');
  return next;
}

export function assertVerification(env) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || String(env.npm_config_strict_ssl).toLowerCase() === 'false') {
    throw new Error('A verificação TLS precisa estar habilitada para obter a ferramenta e assinar o pacote. Remova configurações que a desativem e use a configuração de confiança suportada.');
  }
}

export function redactOutput(output, env) {
  let safe = String(output);
  for (const name of CREDENTIAL_NAMES) {
    const value = env[name];
    if (!value) continue;
    for (const form of [value, encodeURIComponent(value), JSON.stringify(value).slice(1, -1)]) safe = safe.split(form).join('[oculto]');
  }
  return safe.replace(/Bearer\s+\S+/gi, 'Bearer [oculto]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT oculto]')
    .slice(-10000);
}

async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Links simbólicos não são aceitos na fonte da assinatura.');
    if (entry.isDirectory()) files.push(...await listFiles(directory, relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error('Arquivo especial não aceito na fonte da assinatura.');
  }
  return files.sort();
}

async function stageSource(plan) {
  await mkdir(plan.channelDirectory, { recursive: true });
  if (await realpath(plan.channelDirectory) !== plan.channelDirectory) throw new Error('O diretório de assinatura não pode atravessar links simbólicos.');
  let staged = false;
  try {
    const info = await lstat(plan.stagedSource);
    if (info.isSymbolicLink()) throw new Error('A fonte de assinatura não pode ser um link simbólico.');
    staged = info.isDirectory();
  }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!staged) await cp(plan.source, plan.stagedSource, { recursive: true, force: false, errorOnExist: true });
  const expected = await listFiles(plan.source);
  const actual = (await listFiles(plan.stagedSource)).filter(file => !['.amo-upload-uuid', '.web-extension-id'].includes(file));
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('A fonte da tentativa anterior difere do pacote atual. Aumente a versão; não sobrescreva a assinatura anterior.');
  for (const file of expected) {
    if (!(await readFile(path.join(plan.source, file))).equals(await readFile(path.join(plan.stagedSource, file)))) {
      throw new Error('A fonte desta versão mudou desde a tentativa anterior. Aumente a versão antes de assinar novamente.');
    }
  }
  await mkdir(plan.artifacts, { recursive: true });
  if ((await readdir(plan.artifacts)).some(file => file.endsWith('.xpi'))) throw new Error('Já existe um XPI nesta versão. Preserve-o e aumente a versão para uma nova assinatura.');
}

function runTool(args, env) {
  return new Promise((resolve, reject) => {
    const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(executable, args, { env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const collect = chunk => { output = (output + chunk.toString()).slice(-1048576); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', () => reject(new Error('Não foi possível iniciar npm/web-ext. Confira a instalação do Node.js e npm.')));
    child.once('close', code => resolve({ code, output }));
  });
}

export async function verifyArtifact(file, plan) {
  const python = String.raw`
import json, pathlib, sys, zipfile
artifact, source = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
with zipfile.ZipFile(artifact) as archive:
    names = archive.namelist()
    if len(names) != len(set(names)):
        raise SystemExit('Entradas ZIP duplicadas.')
    if archive.testzip() is not None:
        raise SystemExit('ZIP corrompido.')
    files = {p.relative_to(source).as_posix():p for p in source.rglob('*') if p.is_file() and p.relative_to(source).as_posix() not in ('.amo-upload-uuid', '.web-extension-id')}
    for name, expected in files.items():
        if name not in names or archive.read(name) != expected.read_bytes():
            raise SystemExit('O XPI não corresponde à fonte enviada.')
    if any(name not in files and not name.upper().startswith('META-INF/') and not name.endswith('/') for name in names):
        raise SystemExit('O XPI contém arquivos adicionais inesperados.')
    if not any(name.upper().startswith('META-INF/') and name.lower().endswith(('.rsa', '.sig')) for name in names):
        raise SystemExit('Metadados de assinatura não encontrados no XPI.')
    manifest = json.loads(archive.read('manifest.json'))
    print(json.dumps({'id':manifest['browser_specific_settings']['gecko']['id'],'version':manifest['version']}))
`;
  const cleanEnv = { ...process.env };
  for (const name of CREDENTIAL_NAMES) delete cleanEnv[name];
  const result = spawnSync('python3', ['-c', python, file, plan.stagedSource], { encoding: 'utf8', env: cleanEnv });
  if (result.error || result.status !== 0) throw new Error('O arquivo recebido não passou na conferência de ZIP/fonte/metadados. Preserve os arquivos em signed/ para diagnóstico.');
  const metadata = JSON.parse(result.stdout);
  if (metadata.id !== plan.id || metadata.version !== plan.version) throw new Error('ID ou versão do XPI não corresponde ao pacote enviado.');
  const sha256 = createHash('sha256').update(await readFile(file)).digest('hex');
  return { ...metadata, sha256 };
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const options = parseArgs(args);
  if (options.help) {
    console.log('Uso: node scripts/mozilla-sign.mjs [--check|--dry-run] [--target=universal|desktop|android]');
    console.log('Assina uma única distribuição não listada, compatível com Firefox desktop e Android. Credenciais somente por WEB_EXT_API_KEY e WEB_EXT_API_SECRET.');
    return 0;
  }
  const manifest = JSON.parse(await readFile(path.join(projectRoot, 'instalar', 'firefox-android', 'manifest.json'), 'utf8'));
  const plan = makePlan(manifest);
  const status = credentialStatus(env);
  console.log(`Plano: ${plan.id}, versão ${plan.version}, Firefox desktop + Android, canal não listado.`);
  console.log(`Fonte universal: ${path.relative(projectRoot, plan.source)}. Saída preservada em signed/${plan.version}/.`);
  for (const [name, present] of Object.entries(status)) console.log(`${name}: ${present ? 'definida' : 'ausente'}`);
  if (options.check) {
    console.log('Conferência local concluída. Nenhum envio, assinatura, publicação ou teste de credenciais foi executado.');
    return 0;
  }
  if (Object.values(status).some(present => !present)) throw new Error('Configure WEB_EXT_API_KEY e WEB_EXT_API_SECRET nas variáveis seguras do ambiente. Não envie os valores no chat ou no repositório.');
  assertVerification(env);
  await stageSource(plan);
  console.log('Enviando uma versão não listada para assinatura Mozilla. Isso não cria publicação listada na loja.');
  const result = await runTool(webExtArgs(plan), childEnvironment(env));
  if (result.code !== 0) {
    const safe = redactOutput(result.output, env);
    if (safe.trim()) console.error(safe);
    throw new Error('A assinatura não foi confirmada. Confira acesso ao AMO, propriedade do ID, versão e situação da revisão; os arquivos desta tentativa foram preservados em signed/.');
  }
  const artifacts = (await readdir(plan.artifacts)).filter(file => file.endsWith('.xpi'));
  if (artifacts.length !== 1) throw new Error('O web-ext terminou sem retornar exatamente um XPI. A assinatura pode estar pendente; consulte a versão no AMO antes de reenviar.');
  const artifact = path.join(plan.artifacts, artifacts[0]);
  const metadata = await verifyArtifact(artifact, plan);
  console.log(`XPI recebido e conferido: ${path.relative(projectRoot, artifact)}`);
  console.log(`SHA-256: ${metadata.sha256}`);
  console.log('A conferência local verifica conteúdo e presença de metadados. A validação criptográfica da assinatura é feita pelo Firefox na instalação. Teste também no Android.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(redactOutput(error.message, process.env)); process.exitCode = 1; }
}
