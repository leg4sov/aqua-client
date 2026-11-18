// Contraseña de acceso: una vez por sesión; bloquea Ajustes, el popup (ajustes) y el panel; desbloquear en uno desbloquea todo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createController } = require('../src/controller');
const { makeDom, MOODLE_QUIZ_HTML, geminiOk, settle } = require('../testkit/helpers');
const root = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const CSS = src('styles.css');
const PASS = 'azul-4731'; // la contraseña inicial; el hash está en src/lock.js

function memStore() {
  const m = {};
  return { m, get: async (k) => Object.fromEntries([].concat(k).filter((x) => x in m).map((x) => [x, m[x]])), set: async (o) => Object.assign(m, o) };
}

test('lock.js: bloqueado hasta acertar; contraseña mala no desbloquea; sin storage.session no hay bloqueo', async () => {
  const { createLock } = require('../src/lock');
  const s = memStore();
  const l = createLock(s);
  assert.equal(await l.isLocked(), true);
  assert.equal(await l.unlock('mala'), false);
  assert.equal(await l.unlock(undefined), false);
  assert.equal(await l.isLocked(), true);
  assert.equal(await l.unlock(PASS), true);
  assert.equal(await l.isLocked(), false);
  assert.equal(await createLock(undefined).isLocked(), false);
  assert.equal(await createLock(memStore(), '').isLocked(), false); // hash vacío = sin contraseña
});

function loadBackground() {
  const l = (() => { const a = []; return { addListener: (f) => a.push(f), a }; })();
  const sent = [];
  const session = memStore();
  const store = { 'aqua.apiKey': 'FAKE_KEY_FOR_TESTS_0123456789' };
  const api = {
    runtime: { id: 'aqua-test', getURL: (p) => `chrome-extension://aqua-test/${p}`, onMessage: l, openOptionsPage: async () => {} },
    commands: { onCommand: { addListener() {} } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    tabs: { onRemoved: { addListener() {} }, query: async () => [{ id: 7 }], sendMessage: async (id, m) => { sent.push([id, m]); return { ok: true }; } },
    scripting: { executeScript: async () => {} },
    storage: { local: { get: async (k) => Object.fromEntries([].concat(k).filter((x) => x in store).map((x) => [x, store[x]])), set: async (o) => Object.assign(store, o), setAccessLevel: async () => {} }, session },
  };
  const { IDBFactory } = require('fake-indexeddb');
  const context = { indexedDB: new IDBFactory(), chrome: api, fetch: async () => geminiOk({}), console, setTimeout, clearTimeout, AbortController, crypto: globalThis.crypto, TextEncoder, URL };
  context.importScripts = (...files) => files.forEach((f) => vm.runInContext(src(f), context, { filename: f }));
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(src('background.js'), context, { filename: 'background.js' });
  const send = (msg, sender = {}) => new Promise((res) => l.a.forEach((f) => f(msg, { id: 'aqua-test', ...sender }, res)));
  return { send, sent, session };
}

test('background: sin contraseña no atiende ASK/TEST/DOCS_SEARCH; GET_STATE avisa locked; con la buena todo vuelve y se avisa a los paneles', async () => {
  const b = loadBackground();
  const ext = { url: 'chrome-extension://aqua-test/options.html', tab: { id: 1 } };
  assert.equal((await b.send({ type: 'AQUA_GET_STATE' }, { tab: { id: 1 } })).locked, true);
  assert.equal((await b.send({ type: 'AQUA_LOCK_STATUS' })).locked, true);
  for (const type of ['AQUA_ASK', 'AQUA_TEST', 'AQUA_DOCS_SEARCH', 'AQUA_IMG_READ']) {
    assert.equal((await b.send({ type, mode: 'short', text: 'hola', meta: { type: 'free', optionCount: 0 } }, ext)).error.code, 'FORBIDDEN_SENDER', type);
  }
  assert.equal((await b.send({ type: 'AQUA_UNLOCK', password: 'mala' })).unlocked, false);
  assert.equal((await b.send({ type: 'AQUA_LOCK_STATUS' })).locked, true);
  assert.equal(b.sent.length, 0);
  assert.equal((await b.send({ type: 'AQUA_UNLOCK', password: PASS })).unlocked, true);
  await settle();
  assert.equal((await b.send({ type: 'AQUA_LOCK_STATUS' })).locked, false);
  assert.equal((await b.send({ type: 'AQUA_GET_STATE' }, { tab: { id: 1 } })).locked, false);
  assert.ok(b.sent.some(([id, m]) => id === 7 && m.type === 'AQUA_UNLOCKED'));
  assert.notEqual((await b.send({ type: 'AQUA_TEST' }, ext)).error && (await b.send({ type: 'AQUA_TEST' }, ext)).error.code, 'FORBIDDEN_SENDER');
});

test('panel: con la contraseña sin poner solo se ve la cajita; la mala avisa, la buena abre el panel; el aviso del background también', async () => {
  const dom = makeDom(MOODLE_QUIZ_HTML);
  const calls = [];
  const send = async (msg) => {
    calls.push(msg);
    if (msg.type === 'AQUA_GET_STATE') return { ok: true, lang: 'es', hasKey: true, maxChars: 6000, locked: true };
    if (msg.type === 'AQUA_UNLOCK') return { ok: true, unlocked: msg.password === PASS };
    return { ok: true };
  };
  const c = createController({ window: dom.window, document: dom.window.document, send, openSettings: () => {} });
  await c.show(CSS);
  const r = dom.window.document.getElementById('aqua-host').shadowRoot;
  const body = r.querySelector('.body');
  const box = r.querySelector('.lockbox');
  const submit = (pw) => {
    box.querySelector('input').value = pw;
    box.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  };
  assert.equal(body.hidden, true);
  assert.equal(box.hidden, false);
  submit('mala');
  await settle();
  assert.equal(body.hidden, true);
  assert.ok(box.querySelector('.caveat').textContent.includes('incorrecta'));
  submit(PASS);
  await settle();
  assert.equal(body.hidden, false);
  assert.equal(box.hidden, true);
  // otra activación con el bloqueo puesto, desbloqueada desde fuera (AQUA_UNLOCKED)
  await c.show(CSS);
  assert.equal(body.hidden, true);
  c.setLocked(false);
  assert.equal(body.hidden, false);
});

function openPage(file, url, scripts, main, { locked, store = {} }) {
  const dom = makeDom(src(file), url, { runScripts: 'outside-only' });
  const w = dom.window;
  const sent = [];
  w.close = () => {};
  w.indexedDB = new (require('fake-indexeddb').IDBFactory)();
  const change = [];
  w.chrome = {
    storage: { local: { get: async (k) => Object.fromEntries([].concat(k).filter((x) => x in store).map((x) => [x, store[x]])), set: async (o) => Object.assign(store, o), remove: async () => {} }, onChanged: { addListener: (f) => change.push(f), removeListener: () => {} } },
    runtime: { sendMessage: async (m) => { sent.push(m); if (m.type === 'AQUA_LOCK_STATUS') return { ok: true, locked }; if (m.type === 'AQUA_UNLOCK') { if (m.password === PASS) { locked = false; return { ok: true, unlocked: true }; } return { ok: true, unlocked: false }; } return { ok: true }; }, openOptionsPage: async () => {} },
    commands: { getAll: async () => [] },
    permissions: { contains: async () => true, request: async () => true },
    tabs: { query: async () => [] },
  };
  w.globalThis = w;
  for (const f of [...scripts, main]) w.eval(src(f));
  return { w, $: (id) => w.document.getElementById(id), sent, change };
}

const OPT = ['src/i18n.js', 'src/errors.js', 'src/textNormalizer.js', 'src/settings.js', 'src/shortcuts.js', 'src/pdfIndex.js', 'src/docStore.js', 'src/pdfText.js', 'src/docManager.js', 'src/lockGate.js'];
const POP = ['src/i18n.js', 'src/errors.js', 'src/textNormalizer.js', 'src/settings.js', 'src/lockGate.js'];

test('Ajustes: con contraseña pendiente no carga nada hasta acertar; contraseña mala avisa', async () => {
  const p = openPage('options.html', 'moz-extension://aqua-test/options.html', OPT, 'options.js', { locked: true, store: { 'aqua.settings': { lang: 'es' } } });
  await settle();
  const form = p.w.document.querySelector('form');
  assert.ok(form, 'cuadro de contraseña');
  assert.ok(p.w.document.documentElement.classList.contains('locking')); // la página sigue oculta tras el cuadro
  assert.equal(p.$('saveKey').textContent, ''); // load() aún no ha corrido
  const input = form.querySelector('input');
  assert.equal(input.placeholder, 'Contraseña');
  input.value = 'mala';
  form.dispatchEvent(new p.w.Event('submit', { cancelable: true }));
  await settle();
  assert.ok(p.w.document.querySelector('form'));
  assert.ok(form.textContent.includes('incorrecta'));
  p.w.document.querySelector('form input').value = PASS;
  p.w.document.querySelector('form').dispatchEvent(new p.w.Event('submit', { cancelable: true }));
  await settle();
  assert.equal(p.w.document.querySelector('form'), null);
  assert.equal(p.$('saveKey').textContent, 'Guardar clave');
});

test('Ajustes: sin bloqueo se abren directamente', async () => {
  const p = openPage('options.html', 'moz-extension://aqua-test/options.html', OPT, 'options.js', { locked: false });
  await settle();
  assert.equal(p.w.document.querySelector('form'), null);
  assert.equal(p.$('saveKey').textContent, 'Save key');
});

test('popup: el brillo no pide contraseña; al abrir los ajustes sí, y Esc vuelve sin desbloquear', async () => {
  const p = openPage('popup.html', 'moz-extension://aqua-test/popup.html', POP, 'popup.js', { locked: true });
  await settle();
  assert.equal(p.$('viewBright').hidden, false);
  assert.equal(p.w.document.querySelector('form'), null);
  p.$('toSettings').click();
  await settle();
  assert.ok(p.w.document.querySelector('form'));
  assert.equal(p.$('viewSettings').hidden, true);
  p.w.document.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'Escape' }));
  await settle();
  assert.equal(p.w.document.querySelector('form'), null);
  assert.equal(p.$('viewSettings').hidden, true);
  p.$('toSettings').click();
  await settle();
  p.w.document.querySelector('form input').value = PASS;
  p.w.document.querySelector('form').dispatchEvent(new p.w.Event('submit', { cancelable: true }));
  await settle();
  assert.equal(p.$('viewSettings').hidden, false);
  assert.equal(p.w.document.querySelector('form'), null);
});

test('el cuadro se desbloquea también si otro sitio pone la contraseña (storage.session cambia)', async () => {
  const p = openPage('options.html', 'moz-extension://aqua-test/options.html', OPT, 'options.js', { locked: true });
  await settle();
  assert.ok(p.w.document.querySelector('form'));
  p.change.forEach((f) => f({ 'aqua.unlocked': { newValue: true } }, 'session'));
  await settle();
  assert.equal(p.w.document.querySelector('form'), null);
});
