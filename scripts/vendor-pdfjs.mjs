// Copia pdf.js SIN MODIFICAR desde node_modules a vendor/pdfjs y anota versión y hashes (para revisión).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/pdfjs-dist');
const out = join(root, 'vendor/pdfjs');
mkdirSync(out, { recursive: true });
for (const [from, to] of [['build/pdf.mjs', 'pdf.mjs'], ['build/pdf.worker.mjs', 'pdf.worker.mjs'], ['LICENSE', 'LICENSE']]) copyFileSync(join(src, from), join(out, to));
const version = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8')).version;
const sha = (f) => createHash('sha256').update(readFileSync(join(out, f))).digest('hex');
writeFileSync(join(out, 'VERSION.txt'), `pdf.js (pdfjs-dist) ${version}\nSource: https://www.npmjs.com/package/pdfjs-dist  ·  https://github.com/mozilla/pdf.js\nLicense: Apache-2.0 (see LICENSE)\nFiles copied UNMODIFIED from node_modules/pdfjs-dist/build/ (readable, non-minified builds).\nUpdate with:  npm run vendor:pdfjs\nSHA-256 pdf.mjs:        ${sha('pdf.mjs')}\nSHA-256 pdf.worker.mjs: ${sha('pdf.worker.mjs')}\n`);
console.log(`pdf.js ${version} copiado a vendor/pdfjs`);
