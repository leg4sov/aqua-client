// Carga background.js y content.js REALES en un contexto aislado con una API de extensión simulada.
// No sustituye a una prueba en navegador real: comprueba el cableado entre archivos y el flujo de mensajes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeDom, MOODLE_QUIZ_HTML, geminiOk, settle } = require('../testkit/helpers');
const root = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function listeners() {
  const l = [];
  return { addListener: (f) => l.push(f), l };
}

function loadBackground({ store = {}, fetchImpl }) {
  const ev = { onMessage: listeners(), onCommand: listeners(), onClicked: listeners(), onRemoved: listeners() };
  let panelOpened = 0;
  const sent = [];
  const api = {
    runtime: { id: 'aqua-test', getURL: (p) => `chrome-extension://aqua-test/${p}`, onMessage: ev.onMessage, openOptionsPage: async () => {} },
    commands: { onCommand: ev.onCommand },
    action: { onClicked: ev.onClicked, setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    tabs: { onRemoved: ev.onRemoved, query: async () => [{ id: 1 }], sendMessage: async (id, m) => { sent.push([id, m]); if (m.type === 'AQUA_PING') throw new Error('no receiver'); return { ok: true }; } },
    scripting: { executeScript: async (o) => { sent.push(['inject', o.files]); } },
    storage: { local: { get: async (keys) => Object.fromEntries([].concat(keys).filter((k) => k in store).map((k) => [k, store[k]])), set: async (o) => Object.assign(store, o), remove: async (k) => delete store[k], setAccessLevel: async () => {} } },
  };
  const { IDBFactory } = require('fake-indexeddb');
  const context = { indexedDB: new IDBFactory(), chrome: api, fetch: async (u) => (String(u).endsWith('styles.css') ? { text: async () => 'css' } : fetchImpl(...arguments)), console, setTimeout, clearTimeout, AbortController, crypto: globalThis.crypto, URL };
  context.fetch = async (u, init) => (String(u).endsWith('styles.css') ? { text: async () => 'body{}' } : fetchImpl(u, init));
  context.importScripts = (...files) => files.forEach((f) => vm.runInContext(src(f), context, { filename: f }));
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(src('background.js'), context, { filename: 'background.js' });
  const send = (msg, sender) => new Promise((res) => ev.onMessage.l.forEach((f) => f(msg, { id: 'aqua-test', ...sender }, res)));
  return { ev, sent, send, store, indexedDB: context.indexedDB };
}

test('background: el atajo de activar inyecta los archivos y muestra el panel; el de ocultar lo oculta', async () => {
  const b = loadBackground({ fetchImpl: async () => geminiOk({}) });
  await b.ev.onCommand.l[0]('activate-aqua', { id: 1 });
  const inject = b.sent.find((s) => s[0] === 'inject');
  assert.ok(inject && inject[1].includes('content.js'));
  assert.ok(b.sent.some(([, m]) => m && m.type === 'AQUA_SHOW' && m.css === 'body{}'));
  await b.ev.onCommand.l[0]('hide-aqua', { id: 1 });
  assert.ok(b.sent.some(([, m]) => m && m.type === 'AQUA_HIDE'));
});

test('background: rechaza mensajes de otras extensiones y AQUA_ASK sin pestaña; GET_STATE no expone la clave', async () => {
  const b = loadBackground({ store: { 'aqua.apiKey': 'FAKE_KEY_FOR_TESTS_0123456789' }, fetchImpl: async () => geminiOk({}) });
  const ignored = b.ev.onMessage.l[0]({ type: 'AQUA_GET_STATE' }, { id: 'otra' }, () => assert.fail());
  assert.equal(ignored, false);
  const r = await b.send({ type: 'AQUA_ASK', requestId: 'r1', mode: 'short', text: 'hola', meta: { type: 'free', optionCount: 0 } }, {});
  assert.equal(r.error.code, 'FORBIDDEN_SENDER');
  const st = await b.send({ type: 'AQUA_GET_STATE' }, { tab: { id: 1 } });
  assert.equal(st.hasKey, true);
  assert.ok(!JSON.stringify(st).includes('FAKE_KEY'));
  const test = await b.send({ type: 'AQUA_TEST' }, { tab: { id: 1 } });
  assert.equal(test.error.code, 'FORBIDDEN_SENDER'); // AQUA_TEST solo desde la página de opciones
});

test('integración: content.js real + background real con Gemini simulado', async () => {
  const fetchLog = [];
  const b = loadBackground({
    store: { 'aqua.apiKey': 'FAKE_KEY_FOR_TESTS_0123456789', 'aqua.settings': { lang: 'es' } },
    fetchImpl: async (u, init) => { fetchLog.push([u, init]); return geminiOk({ status: 'confirmed', module: 'Servicios de Red e Internet', selected_options: [2], answer_text: '443', explanation: 'TCP/443' }); },
  });
  const dom = makeDom(MOODLE_QUIZ_HTML.replace('page-mod-quiz-attempt', 'page-mod-quiz-review'), 'https://campus.example/mod/quiz/review.php', { runScripts: 'outside-only' });
  const w = dom.window;
  const contentListeners = listeners();
  w.chrome = { runtime: { id: 'aqua-test', onMessage: contentListeners, sendMessage: (m) => b.send(m, { tab: { id: 1 } }) } };
  w.globalThis = w;
  for (const f of ['src/i18n.js', 'src/errors.js', 'src/textNormalizer.js', 'src/moodleDetector.js', 'src/questionExtractor.js', 'src/ui.js', 'src/controller.js', 'content.js']) {
    w.eval(src(f));
  }
  const fire = (m) => new Promise((res) => contentListeners.l[0](m, { id: 'aqua-test' }, res));
  assert.equal((await fire({ type: 'AQUA_PING' })).ok, true);
  await fire({ type: 'AQUA_SHOW', css: '' });
  const rootEl = w.document.getElementById('aqua-host').shadowRoot;
  const click = (t) => [...rootEl.querySelectorAll('button')].find((x) => x.textContent === t).click();
  click('Preguntas');
  rootEl.querySelector('.qbtn').click();
  click('Consultar');
  await settle(12);
  assert.equal(rootEl.querySelector('.badge').textContent, 'Completado');
  assert.equal(rootEl.querySelector('.letters').textContent, '1) B');
  assert.equal(fetchLog.length, 1);
  assert.ok(fetchLog[0][0].startsWith('https://generativelanguage.googleapis.com/v1beta/models/'));
  assert.ok(!fetchLog[0][1].body.includes('FAKE_KEY'));
  // preferencia recordada: solo el modo
  assert.equal(JSON.stringify(b.store['aqua.prefs']), '{"mode":"quiz"}');
  assert.ok(!Object.keys(b.store).some((k) => /question|answer|result/i.test(k))); // no se guarda contenido
  await fire({ type: 'AQUA_HIDE' });
  assert.equal(w.document.getElementById('aqua-host').style.display, 'none');
});

test('background: AQUA_TEST se acepta desde la página de Ajustes (aunque esté en una pestaña) y no desde una web', async () => {
  let called = 0;
  const b = loadBackground({
    store: { 'aqua.apiKey': 'FAKE_KEY_FOR_TESTS_0123456789' },
    fetchImpl: async () => { called++; return geminiOk('OK'); },
  });
  const web = await b.send({ type: 'AQUA_TEST' }, { tab: { id: 1 }, url: 'https://campus.example/mod/quiz/attempt.php' });
  assert.equal(web.error.code, 'FORBIDDEN_SENDER');
  assert.equal(called, 0);
  const opts = await b.send({ type: 'AQUA_TEST' }, { tab: { id: 5 }, url: 'chrome-extension://aqua-test/options.html' });
  assert.equal(opts.ok, true);
  assert.equal(called, 1);
});

test('background: AQUA_OPEN_PANEL solo desde el popup de la extensión; GET_STATE incluye idle y no registra clic en el icono', async () => {
  const b = loadBackground({ store: { 'aqua.apiKey': 'FAKE_KEY_FOR_TESTS_0123456789' }, fetchImpl: async () => geminiOk({}) });
  assert.equal(b.ev.onClicked.l.length, 0); // el icono abre el popup, no activa el panel
  const web = await b.send({ type: 'AQUA_OPEN_PANEL' }, { tab: { id: 1 }, url: 'https://campus.example/x' });
  assert.equal(web.error.code, 'FORBIDDEN_SENDER');
  assert.ok(!b.sent.some((s) => s[0] === 'inject'));
  const ok = await b.send({ type: 'AQUA_OPEN_PANEL' }, { url: 'chrome-extension://aqua-test/popup.html' });
  assert.equal(ok.ok, true);
  assert.ok(b.sent.some((s) => s[0] === 'inject')); // inyectó y mostró el panel en la pestaña activa
  assert.ok(b.sent.some(([, m]) => m && m.type === 'AQUA_SHOW'));
  const st = await b.send({ type: 'AQUA_GET_STATE' }, { tab: { id: 1 } });
  assert.equal(st.idle.enabled, true);
  assert.equal(st.idle.seconds, 5);
  assert.equal(st.ui.palette, 'dark');
  assert.equal(st.ui.size, 'xs');
});

test('background: los atajos de posición guardan el lado y avisan a la pestaña activa', async () => {
  const b = loadBackground({ store: { 'aqua.settings': { lang: 'es', ui: { palette: 'light', opacity: 70 } } }, fetchImpl: async () => geminiOk({}) });
  await b.ev.onCommand.l[0]('move-right', { id: 1 });
  assert.ok(b.sent.some(([id, m]) => id === 1 && m && m.type === 'AQUA_SIDE' && m.side === 'right'));
  assert.equal(b.store['aqua.settings'].ui.side, 'right');
  assert.equal(b.store['aqua.settings'].ui.palette, 'light'); // no se pierde lo demás
  assert.equal(b.store['aqua.settings'].ui.opacity, 70);
  assert.equal(b.store['aqua.settings'].lang, 'es');
  await b.ev.onCommand.l[0]('move-left', { id: 1 });
  assert.equal(b.store['aqua.settings'].ui.side, 'left');
  assert.ok(!b.sent.some((s) => s[0] === 'inject')); // mover no inyecta nada
});

test('background: AQUA_DOCS_SEARCH usa el índice local, redacta y no expone nombres; respeta el ajuste', async () => {
  const { IDBFactory } = require('fake-indexeddb');
  const idx = require('../src/pdfIndex');
  const { createDocStore } = require('../src/docStore');
  const store = { 'aqua.apiKey': 'FAKE_KEY_FOR_TESTS_0123456789', 'aqua.settings': { docs: { enabled: true, k: 3 } } };
  const b = loadBackground({ store, fetchImpl: async () => geminiOk({}) });
  // el background usa su propio IndexedDB; se rellena con el mismo almacén que la página de Ajustes
  const ctxIdb = b.indexedDB;
  const ds = createDocStore({ indexedDB: ctxIdb });
  await ds.addDoc({ name: 'Secreto_Perez.pdf', pages: 1 }, idx.chunkPages([{ page: 5, text: 'El comando chmod cambia permisos de ficheros. Escribe a profe@centro.es para dudas sobre chmod y permisos.' }]));
  const r = await b.send({ type: 'AQUA_DOCS_SEARCH', query: '¿Qué hace chmod con los permisos de ficheros?' }, { tab: { id: 1 } });
  assert.equal(r.ok, true);
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].page, 5);
  assert.ok(r.hits[0].text.includes('chmod') && !r.hits[0].text.includes('profe@centro.es') && r.hits[0].text.includes('[EMAIL]'));
  assert.ok(!JSON.stringify(r).includes('Secreto_Perez')); // sin nombres de archivo
  assert.equal((await b.send({ type: 'AQUA_DOCS_SEARCH', query: 'capital de Francia' }, { tab: { id: 1 } })).hits.length, 0);
  assert.equal((await b.send({ type: 'AQUA_DOCS_SEARCH', query: 'chmod permisos' }, {})).error.code, 'FORBIDDEN_SENDER'); // solo desde una pestaña
  store['aqua.settings'] = { docs: { enabled: false } };
  assert.equal((await b.send({ type: 'AQUA_DOCS_SEARCH', query: 'chmod permisos ficheros' }, { tab: { id: 1 } })).hits.length, 0); // desactivado
  assert.equal((await b.send({ type: 'AQUA_GET_STATE' }, { tab: { id: 1 } })).docs.enabled, false);
});
