// Genera dist/chrome y dist/firefox con SOLO los archivos de la extensión (sin tests ni node_modules).
import { cpSync, mkdirSync, rmSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const SHARED = ['background.js', 'content.js', 'styles.css', 'options.html', 'options.css', 'options.js', 'popup.html', 'popup.css', 'popup.js', 'src', 'icons', 'LICENSE', '_locales', 'vendor'];

rmSync(dist, { recursive: true, force: true });
for (const [target, manifest] of [['firefox', 'manifest.json'], ['chrome', 'manifest.chrome.json']]) {
  const out = join(dist, target);
  mkdirSync(out, { recursive: true });
  for (const f of SHARED) cpSync(join(root, f), join(out, f), { recursive: true });
  JSON.parse(readFileSync(join(root, manifest), 'utf8')); // falla si no es JSON válido
  copyFileSync(join(root, manifest), join(out, 'manifest.json'));
}
writeFileSync(join(dist, 'README.txt'), 'Firefox (principal): cargar dist/firefox. Chrome/Chromium (secundario): cargar dist/chrome. Ver README.md del proyecto.\n');
console.log('Build OK -> dist/firefox (principal), dist/chrome');
