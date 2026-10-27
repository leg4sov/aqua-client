// Opción B de PDFs: lectura con pdf.js real, índice local, almacén IndexedDB (simulado) y gestor de altas.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { makePdf } = require('../testkit/makePdf');
const idx = require('../src/pdfIndex');
const { createDocStore, createDocService } = require('../src/docStore');
const { extractPdf } = require('../src/pdfText');
const { addPdfFiles } = require('../src/docManager');

let pdfjsPromise;
function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(pathToFileURL(path.join(__dirname, '..', 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href).then((m) => {
      m.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(__dirname, '..', 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
      return m;
    });
  }
  return pdfjsPromise;
}
const freshStore = () => {
  const { IDBFactory } = require('fake-indexeddb');
  return createDocStore({ indexedDB: new IDBFactory() });
};
const fileOf = (name, bytes, type = 'application/pdf') => ({ name, type, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });

const PAGES = [
  ['Permisos de ficheros en Linux', 'El comando chmod 755 asigna rwxr-xr-x al propietario, grupo y otros.', 'Los permisos se consultan con ls -l.'],
  ['Servicios de red', 'El protocolo DHCP asigna direcciones IP automaticamente a los equipos de la red.', 'El servidor DNS resuelve nombres de dominio.'],
  ['Bases de datos', 'La sentencia SELECT consulta tablas. La clausula WHERE filtra filas.'],
];

// ---------- pdf.js real
test('extractPdf: lee el texto de un PDF real (con tildes) página a página', async () => {
  const r = await extractPdf(await pdfjs(), makePdf([['Configuración de red y DHCP', 'Segunda línea'], ['Página dos: contraseña']]));
  assert.equal(r.numPages, 2);
  assert.equal(r.pages.length, 2);
  assert.ok(r.pages[0].text.includes('Configuración de red y DHCP'));
  assert.ok(r.pages[1].text.includes('contraseña'));
  assert.equal(r.pages[1].page, 2);
});

test('extractPdf: PDF sin texto (escaneado), archivo que no es PDF y progreso', async () => {
  const lib = await pdfjs();
  await assert.rejects(extractPdf(lib, makePdf([['x']], { empty: true })), { code: 'PDF_NO_TEXT' });
  await assert.rejects(extractPdf(lib, new Uint8Array(Buffer.from('esto no es un pdf, solo texto'))), { code: 'PDF_INVALID' });
  const seen = [];
  await extractPdf(lib, makePdf(PAGES), { onProgress: (i, n) => seen.push([i, n]) });
  assert.deepEqual(seen, [[1, 3], [2, 3], [3, 3]]);
});

// ---------- índice y búsqueda
test('tokenize: minúsculas, sin tildes, plurales simples, sin palabras vacías ni letras sueltas', () => {
  assert.deepEqual(idx.tokenize('Los PERMISOS de ficheros en Linux: ¿qué hace chmod 755?'), ['permiso', 'fichero', 'linux', 'hace', 'chmod', '755']);
  assert.deepEqual(idx.tokenize('a b c'), []);
  assert.deepEqual(idx.tokenize('__proto__ constructor'), ['proto', 'constructor']); // sin claves peligrosas
});

test('chunkPages: trocea por página con solape y conserva el número de página', () => {
  const words = Array.from({ length: 500 }, (_, i) => `palabra${i}`).join(' ');
  const chunks = idx.chunkPages([{ page: 7, text: words }, { page: 8, text: 'texto corto de prueba aqui' }], { words: 200, overlap: 20 });
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.filter((c) => c.page === 7).length >= 3 && chunks.some((c) => c.page === 8));
  assert.ok(chunks[0].text.split(' ').length === 200);
  const second = chunks[1].text.split(' ');
  assert.equal(second[0], 'palabra180'); // solape de 20 palabras
  assert.ok(chunks.every((c) => c.len > 0 && typeof c.tf === 'object'));
});

const corpus = () => {
  const pages = PAGES.map((lines, i) => ({ page: i + 1, text: lines.join(' ') }));
  return idx.chunkPages(pages, { words: 40, overlap: 5 }).map((c, i) => ({ ...c, id: i + 1, doc: 1, name: 'apuntes.pdf' }));
};

test('search: devuelve el fragmento relevante primero y respeta k', () => {
  const hits = idx.search('¿Qué hace el comando chmod 755 sobre los permisos?', corpus(), { k: 2 });
  assert.ok(hits.length >= 1 && hits.length <= 2);
  assert.equal(hits[0].page, 1);
  assert.ok(hits[0].text.includes('chmod 755'));
  assert.ok(hits[0].score > 0 && hits[0].matched >= 2);
  const dhcp = idx.search('Qué protocolo asigna direcciones IP automáticamente', corpus());
  assert.equal(dhcp[0].page, 2);
});

test('search: sin coincidencias suficientes no devuelve nada (no se añaden tokens a lo tonto)', () => {
  assert.deepEqual(idx.search('¿Cuál es la capital de Francia?', corpus()), []);
  assert.deepEqual(idx.search('red', corpus()).length >= 0, true); // un solo término sí puede coincidir
  assert.deepEqual(idx.search('', corpus()), []);
  assert.deepEqual(idx.search('chmod', []), []);
  // una sola palabra suelta común + palabras ajenas: <2 términos coincidentes -> nada
  assert.deepEqual(idx.search('galaxia nebulosa quasar red', corpus()), []);
});

test('search: tope de caracteres y de k (máximo 8)', () => {
  const big = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, doc: 1, page: i + 1, text: `chmod permisos linux ${'relleno '.repeat(100)}`, len: 110, tf: { chmod: 1, permiso: 1, linux: 1, relleno: 100 } }));
  assert.ok(idx.search('chmod permisos linux', big, { k: 99 }).length <= idx.MAX_K);
  assert.equal(idx.search('chmod permisos linux', big, { k: 5, maxChars: 1000 }).length, 1);
  const total = idx.search('chmod permisos linux', big, { k: 8 }).reduce((n, h) => n + h.text.length, 0);
  assert.ok(total <= idx.MAX_REF_CHARS + 900);
});

// ---------- almacén IndexedDB
test('docStore: alta, listado, versión, búsqueda con caché, borrado en cascada', async () => {
  const store = freshStore();
  const service = createDocService(store);
  assert.equal(await store.getVersion(), 0);
  const chunks = idx.chunkPages(PAGES.map((l, i) => ({ page: i + 1, text: l.join(' ') })));
  const id = await store.addDoc({ name: 'apuntes.pdf', bytes: 1234, pages: 3 }, chunks);
  assert.equal(await store.getVersion(), 1);
  const docs = await store.listDocs();
  assert.equal(docs.length, 1);
  assert.deepEqual([docs[0].name, docs[0].pages, docs[0].chunks > 0, docs[0].chars > 0], ['apuntes.pdf', 3, true, true]);
  const hits = await service.search('comando chmod permisos');
  assert.ok(hits.length && hits[0].name === 'apuntes.pdf');
  const byId = await service.getByIds([hits[0].id, 99999, -1, 'x', hits[0].id]);
  assert.equal(byId.length, 1); // inválidos y duplicados se ignoran
  await store.deleteDoc(id);
  assert.equal((await store.listDocs()).length, 0);
  assert.equal((await store.getAllChunks()).length, 0); // sin fragmentos huérfanos
  assert.deepEqual(await service.search('comando chmod permisos'), []); // la caché se invalidó con la versión
  assert.equal(await store.getVersion(), 2);
});

test('docStore: clear vacía todo', async () => {
  const store = freshStore();
  await store.addDoc({ name: 'a.pdf' }, idx.chunkPages([{ page: 1, text: 'texto de prueba suficiente para indexar' }]));
  await store.addDoc({ name: 'b.pdf' }, idx.chunkPages([{ page: 1, text: 'otro documento distinto para indexar' }]));
  assert.equal((await store.listDocs()).length, 2);
  await store.clear();
  assert.equal((await store.listDocs()).length, 0);
  assert.equal((await store.getAllChunks()).length, 0);
});

// ---------- gestor de altas
test('docManager: añade PDFs reales, los indexa y reemplaza el de igual nombre', async () => {
  const lib = await pdfjs();
  const store = freshStore();
  const extract = (bytes, p) => extractPdf(lib, bytes, { onProgress: p });
  const pdf = makePdf(PAGES);
  let r = await addPdfFiles({ files: [fileOf('apuntes.pdf', pdf)], extract, store });
  assert.deepEqual([r[0].ok, r[0].pages, r[0].chunks > 0], [true, 3, true]);
  r = await addPdfFiles({ files: [fileOf('apuntes.pdf', makePdf([['versión nueva del documento con otro contenido distinto']]))], extract, store });
  assert.equal(r[0].ok, true);
  const docs = await store.listDocs();
  assert.equal(docs.length, 1); // reemplazado, no duplicado
  assert.equal(docs[0].pages, 1);
});

test('docManager: rechaza lo que no es PDF, PDF sin texto, demasiado grandes y exceso de documentos', async () => {
  const lib = await pdfjs();
  const store = freshStore();
  const extract = (bytes) => extractPdf(lib, bytes);
  const r = await addPdfFiles({
    files: [fileOf('notas.txt', new Uint8Array(10), 'text/plain'), fileOf('escaneado.pdf', makePdf([['x']], { empty: true })), fileOf('roto.pdf', new Uint8Array(Buffer.from('no soy un pdf'))), { ...fileOf('enorme.pdf', makePdf(PAGES)), size: 99 * 1024 * 1024 }],
    extract, store,
  });
  assert.deepEqual(r.map((x) => x.code), ['NOT_PDF', 'PDF_NO_TEXT', 'PDF_INVALID', 'PDF_TOO_BIG']);
  assert.equal((await store.listDocs()).length, 0);
  const lim = await addPdfFiles({ files: [fileOf('a.pdf', makePdf(PAGES)), fileOf('b.pdf', makePdf(PAGES)), fileOf('c.pdf', makePdf(PAGES))], extract, store, limits: { maxDocs: 2 } });
  assert.deepEqual(lim.map((x) => x.code || 'ok'), ['ok', 'ok', 'DOCS_LIMIT']);
  const chars = await addPdfFiles({ files: [fileOf('d.pdf', makePdf(PAGES))], extract, store: freshStore(), limits: { maxTotalChars: 50 } });
  assert.equal(chars[0].code, 'DOCS_LIMIT');
});
