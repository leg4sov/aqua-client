// Sección «Documentos de referencia (PDF)» de la página de Ajustes, con pdf.js real y un IndexedDB simulado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { makePdf } = require('../testkit/makePdf');
const { makeDom } = require('../testkit/helpers');
const root = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(root, f), 'utf8');

async function realPdfjs() {
  const m = await import(pathToFileURL(path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
  m.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  // los bytes vienen del «realm» de jsdom: se copian a un Uint8Array de Node antes de dárselos a pdf.js
  return { ...m, getDocument: (o) => m.getDocument({ ...o, data: Uint8Array.from(o.data) }) };
}

async function waitFor(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 15));
  }
  return false;
}

async function openOptions(store = {}) {
  const { IDBFactory } = require('fake-indexeddb');
  const dom = makeDom(src('options.html'), 'moz-extension://aqua-test/options.html', { runScripts: 'outside-only' });
  const w = dom.window;
  const pdfjs = await realPdfjs();
  w.indexedDB = new IDBFactory();
  w.__aquaLoadPdfjs = async () => pdfjs;
  w.chrome = {
    storage: { local: { get: async (k) => Object.fromEntries([].concat(k).filter((x) => x in store).map((x) => [x, store[x]])), set: async (o) => Object.assign(store, o), remove: async (k) => delete store[k] } },
    runtime: { sendMessage: async () => ({ ok: true }) },
    commands: { getAll: async () => [] },
    permissions: { contains: async () => true, request: async () => true },
  };
  w.globalThis = w;
  for (const f of ['src/i18n.js', 'src/errors.js', 'src/textNormalizer.js', 'src/settings.js', 'src/shortcuts.js', 'src/pdfIndex.js', 'src/docStore.js', 'src/pdfText.js', 'src/docManager.js', 'options.js']) w.eval(src(f));
  const $ = (id) => w.document.getElementById(id);
  await waitFor(() => $('docsNone').textContent !== '');
  const fileOf = (name, bytes, type = 'application/pdf') => ({ name, type, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  const upload = async (files) => {
    Object.defineProperty($('docsFiles'), 'files', { value: files, configurable: true });
    $('docsFiles').dispatchEvent(new w.Event('change'));
    await waitFor(() => $('docsResults').children.length >= files.length);
    await new Promise((r) => setTimeout(r, 30));
  };
  return { w, $, store, upload, fileOf };
}

const NOTES = [['Permisos en Linux', 'El comando chmod 755 asigna rwxr-xr-x.'], ['Redes', 'DHCP asigna direcciones IP.']];

test('PDF en Ajustes: sin documentos, desactivado y sin aviso; al activarlo aparece el aviso de coste y privacidad', async () => {
  const o = await openOptions();
  assert.equal(o.$('docsEnabled').checked, false);
  assert.equal(o.$('docsWarn').hidden, true);
  assert.equal(o.$('docsNone').hidden, false);
  assert.equal(o.$('docsDeleteAll').hidden, true);
  assert.ok(o.$('docsNone').textContent.includes('No documents yet'));
  o.$('docsEnabled').checked = true;
  o.$('docsEnabled').dispatchEvent(new o.w.Event('change'));
  await waitFor(() => o.store['aqua.settings']);
  assert.equal(o.store['aqua.settings'].docs.enabled, true);
  assert.equal(o.$('docsWarn').hidden, false);
  assert.ok(o.$('docsWarn').textContent.includes('1,500–3,000') && o.$('docsWarn').textContent.includes('sent to Google'));
  o.$('docsK').value = '99';
  o.$('docsK').dispatchEvent(new o.w.Event('change'));
  await waitFor(() => o.store['aqua.settings'].docs.k === 8);
  assert.equal(o.store['aqua.settings'].docs.k, 8); // 1–8
  assert.equal(o.$('docsK').value, '8');
});

test('PDF en Ajustes: sube un PDF real y otro escaneado, lista el válido y explica el fallo', async () => {
  const o = await openOptions();
  await o.upload([o.fileOf('apuntes.pdf', makePdf(NOTES)), o.fileOf('escaneado.pdf', makePdf([['x']], { empty: true })), o.fileOf('notas.txt', new Uint8Array(5), 'text/plain')]);
  const res = [...o.$('docsResults').children].map((li) => li.textContent);
  assert.ok(res[0].startsWith('apuntes.pdf: added (2 pages,'), res[0]);
  assert.ok(res[1].includes('No text found'), res[1]);
  assert.ok(res[2].includes('Not a PDF file'), res[2]);
  const items = [...o.$('docsList').children];
  assert.equal(items.length, 1);
  assert.equal(items[0].querySelector('.name').textContent, 'apuntes.pdf');
  assert.ok(items[0].querySelector('.meta').textContent.startsWith('2 pages'));
  assert.ok(o.$('docsUsage').textContent.startsWith('1 of 10 documents'));
  assert.equal(o.$('docsNone').hidden, true);
  assert.equal(o.$('docsDeleteAll').hidden, false);
});

test('PDF en Ajustes: borrar uno, borrar todo, y el índice local queda vacío', async () => {
  const o = await openOptions();
  await o.upload([o.fileOf('a.pdf', makePdf(NOTES)), o.fileOf('b.pdf', makePdf([['otro documento distinto con texto suficiente para indexar bien']]))]);
  assert.equal(o.$('docsList').children.length, 2);
  o.$('docsList').children[0].querySelector('button').click();
  await waitFor(() => o.$('docsList').children.length === 1);
  assert.equal(o.$('docsList').children.length, 1);
  o.$('docsDeleteAll').click();
  await waitFor(() => o.$('docsList').children.length === 0);
  assert.equal(o.$('docsList').children.length, 0);
  assert.equal(o.$('docsNone').hidden, false);
});

test('PDF en Ajustes: cambiar de idioma traduce la sección y la lista', async () => {
  const o = await openOptions();
  await o.upload([o.fileOf('apuntes.pdf', makePdf(NOTES))]);
  o.$('lang').value = 'es';
  o.$('lang').dispatchEvent(new o.w.Event('change'));
  await waitFor(() => o.w.document.querySelector('[data-i18n="opt.docsHeading"]').textContent.startsWith('Documentos'));
  assert.equal(o.w.document.querySelector('[data-i18n="opt.docsHeading"]').textContent, 'Documentos de referencia (PDF)');
  await waitFor(() => o.$('docsUsage').textContent.startsWith('1 de 10'));
  assert.ok(o.$('docsUsage').textContent.startsWith('1 de 10 documentos'));
  assert.ok(o.$('docsList').children[0].querySelector('.meta').textContent.includes('páginas'));
  assert.equal(o.$('docsList').children[0].querySelector('button').textContent, 'Borrar');
});

test('PDF en Ajustes: si pdf.js no se puede cargar muestra un error y no rompe la página', async () => {
  const o = await openOptions();
  o.w.__aquaLoadPdfjs = async () => { throw new Error('no carga'); };
  Object.defineProperty(o.$('docsFiles'), 'files', { value: [o.fileOf('a.pdf', makePdf(NOTES))], configurable: true });
  o.$('docsFiles').dispatchEvent(new o.w.Event('change'));
  await waitFor(() => o.$('docsStatus').textContent !== '');
  assert.ok(o.$('docsStatus').textContent.includes('Unexpected error'));
  assert.equal(o.$('docsList').children.length, 0);
});
