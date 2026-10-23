import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const checking = process.argv.includes('--check');
const assets = ['core.js', 'background.js', 'popup.js', 'popup.html', 'popup.css', 'kick-quality.js', 'kick-player.js'];
const browsers = ['firefox', 'chromium', 'opera-gx'];

export async function expectedFiles(browser) {
  const files = new Map();
  const manifest = browser === 'opera-gx' ? 'chromium' : browser;
  files.set('manifest.json', await readFile(path.join(root, 'manifests', `${manifest}.json`), 'utf8'));
  for (const file of assets) {
    let source = await readFile(path.join(root, 'src', file), 'utf8');
    if (browser === 'firefox' && file === 'core.js') source = source.replace(/^export /gm, '');
    if (file === 'kick-quality.js') source = source.replace(/^export /gm, '');
    if (browser === 'firefox' && file === 'background.js') source = source.replace(/^import \{ createController \} from '\.\/core\.js';\n/, '');
    files.set(file, source);
  }
  return files;
}

export async function build(check = checking) {
  for (const browser of browsers) {
    const dir = path.join(root, 'instalar', browser);
    const files = await expectedFiles(browser);
    if (!check) await mkdir(dir, { recursive: true });
    for (const [file, content] of files) {
      const destination = path.join(dir, file);
      if (check) {
        if (await readFile(destination, 'utf8') !== content) throw new Error(`Arquivo desatualizado: instalar/${browser}/${file}. Execute npm run package.`);
      } else await writeFile(destination, content);
    }
    const unexpected = (await readdir(dir)).filter(file => !files.has(file));
    if (unexpected.length) throw new Error(`Arquivos inesperados em instalar/${browser}: ${unexpected.join(', ')}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build();
  console.log(checking ? 'Pastas de instalação atualizadas.' : `Geradas ${browsers.map(browser => `instalar/${browser}`).join(', ')}.`);
}
