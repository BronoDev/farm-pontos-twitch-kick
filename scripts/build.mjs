import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const checking = process.argv.includes('--check');
const assets = ['rewards.js', 'pokeidle-state.js', 'automation.js', 'core.js', 'background.js', 'popup.js', 'popup.html', 'popup.css', 'kick-quality.js', 'kick-player.js', 'site-status.js', 'pokeidle.js', 'icon.png'];
const browsers = ['firefox', 'chromium', 'opera-gx', 'firefox-android'];
const firefoxModules = new Set(['rewards.js', 'pokeidle-state.js', 'automation.js', 'core.js', 'background.js']);
const contentScripts = new Set(['kick-quality.js', 'site-status.js', 'pokeidle.js']);

export async function expectedFiles(browser) {
  const files = new Map();
  const manifest = browser === 'opera-gx' ? 'chromium' : browser;
  files.set('manifest.json', await readFile(path.join(root, 'manifests', `${manifest}.json`), 'utf8'));
  for (const file of assets) {
    if (file.endsWith('.png')) { files.set(file, await readFile(path.join(root, 'src', file))); continue; }
    let source = await readFile(path.join(root, 'src', file), 'utf8');
    if ((browser.startsWith('firefox') && firefoxModules.has(file)) || contentScripts.has(file)) {
      source = source.replace(/^export /gm, '').replace(/^import .* from .*;\r?\n/gm, '');
    }
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
        const actual = await readFile(destination);
        if (!actual.equals(Buffer.isBuffer(content) ? content : Buffer.from(content))) throw new Error(`Arquivo desatualizado: instalar/${browser}/${file}. Execute npm run package.`);
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
