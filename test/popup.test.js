// Prueba del popup rápido (clave, probar conexión, paleta, tamaño, abrir panel) con una API de extensión simulada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDom, settle } = require('../testkit/helpers');
const root = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function openPopup({ store = {}, reply } = {}) {
  const dom = makeDom(src('popup.html'), 'moz-extension://aqua-test/popup.html', { runScripts: 'outside-only' });
  const w = dom.window;
  const sent = [];
  let closed = false;
  let optionsOpened = false;
  w.close = () => (closed = true);
  w.chrome = {
    storage: { local: { get: async (k) => Object.fromEntries([].concat(k).filter((x) => x in store).map((x) => [x, store[x]])), set: async (o) => Object.assign(store, o) } },
    runtime: { sendMessage: async (m) => { sent.push(m); return reply ? reply(m) : { ok: true }; }, openOptionsPage: async () => { optionsOpened = true; } },
  };
  w.globalThis = w;
  for (const f of ['src/i18n.js', 'src/errors.js', 'src/textNormalizer.js', 'src/settings.js', 'popup.js']) w.eval(src(f));
  const $ = (id) => w.document.getElementById(id);
  return { w, $, store, sent, state: () => ({ closed, optionsOpened }) };
}

test('popup: inglés por defecto, paleta oscura y tamaño mínimo preseleccionados', async () => {
  const p = openPopup();
  await settle();
  assert.equal(p.$('saveKey').textContent, 'Save key');
  assert.equal(p.$('uiPalette').value, 'dark');
  assert.equal(p.$('uiSize').value, 'xs');
  assert.equal(p.w.document.documentElement.dataset.palette, 'dark');
  assert.equal(p.$('keyStatus').textContent, 'No key set yet.');
});

test('popup: respeta el idioma guardado y ofrece los 4 tamaños y las 3 paletas', async () => {
  const p = openPopup({ store: { 'aqua.settings': { lang: 'es' } } });
  await settle();
  assert.equal(p.$('saveKey').textContent, 'Guardar clave');
  assert.deepEqual([...p.$('uiSize').options].map((o) => o.value), ['xxs', 'xs', 's', 'm']);
  assert.deepEqual([...p.$('uiPalette').options].map((o) => o.value), ['classic', 'light', 'dark']);
});

test('popup: guardar clave (válida e inválida) sin mostrarla', async () => {
  const p = openPopup();
  await settle();
  p.$('apiKey').value = 'corta';
  p.$('saveKey').click();
  await settle();
  assert.equal(p.store['aqua.apiKey'], undefined);
  assert.ok(p.$('keyStatus').textContent.includes('does not look valid'));
  p.$('apiKey').value = 'AQ.Ab8RN6FAKEFAKEFAKEFAKEFAKEFAKEFAKE_-x';
  p.$('saveKey').click();
  await settle();
  assert.equal(p.store['aqua.apiKey'], 'AQ.Ab8RN6FAKEFAKEFAKEFAKEFAKEFAKEFAKE_-x');
  assert.equal(p.$('apiKey').value, ''); // el campo se vacía
});

test('popup: probar conexión muestra éxito o el error traducido', async () => {
  let ok = true;
  const p = openPopup({ reply: (m) => (m.type === 'AQUA_TEST' ? (ok ? { ok: true, model: 'gemini-x' } : { ok: false, error: { code: 'QUOTA' } }) : { ok: true }) });
  await settle();
  p.$('testConn').click();
  await settle();
  assert.equal(p.$('testStatus').textContent, 'Connection OK with model gemini-x.');
  ok = false;
  p.$('testConn').click();
  await settle();
  assert.ok(p.$('testStatus').textContent.includes('quota'));
});

test('popup: cambiar paleta y tamaño guarda en ajustes conservando el resto y recolorea el popup', async () => {
  const p = openPopup({ store: { 'aqua.settings': { model: 'gemini-3.8-flash', lang: 'es', ui: { opacity: 70, side: 'right' } } } });
  await settle();
  p.$('uiPalette').value = 'light';
  p.$('uiPalette').dispatchEvent(new p.w.Event('change'));
  await settle();
  p.$('uiSize').value = 'xxs';
  p.$('uiSize').dispatchEvent(new p.w.Event('change'));
  await settle();
  const s = p.store['aqua.settings'];
  assert.equal(s.ui.palette, 'light');
  assert.equal(s.ui.size, 'xxs');
  assert.equal(s.ui.opacity, 70); // no se pierde lo demás
  assert.equal(s.ui.side, 'right');
  assert.equal(s.model, 'gemini-3.8-flash');
  assert.equal(s.lang, 'es');
  assert.equal(p.w.document.documentElement.dataset.palette, 'light');
});

test('popup: «Abrir panel» pide abrirlo y cierra el popup; si falla lo dice; «todos los ajustes» abre las opciones', async () => {
  let fail = false;
  const p = openPopup({ reply: (m) => (m.type === 'AQUA_OPEN_PANEL' && fail ? { ok: false } : { ok: true }) });
  await settle();
  p.$('openPanel').click();
  await settle();
  assert.ok(p.sent.some((m) => m.type === 'AQUA_OPEN_PANEL'));
  assert.equal(p.state().closed, true);
  fail = true;
  const q = openPopup({ reply: () => ({ ok: false }) });
  await settle();
  q.$('openPanel').click();
  await settle();
  assert.ok(q.$('testStatus').textContent.includes("Can't open the panel"));
  p.$('more').click();
  await settle();
  assert.equal(p.state().optionsOpened, true);
});

test('popup: el interruptor «invisible salvo con el ratón encima» se guarda en ajustes sin perder lo demás', async () => {
  const p = openPopup({ store: { 'aqua.settings': { lang: 'es', ui: { palette: 'light', size: 'xxs' } } } });
  await settle();
  assert.equal(p.$('hoverOnly').checked, false); // desactivado por defecto
  assert.equal(p.w.document.querySelector('label.check span').textContent, 'Oculto salvo con el ratón encima');
  p.$('hoverOnly').checked = true;
  p.$('hoverOnly').dispatchEvent(new p.w.Event('change'));
  await settle();
  const s = p.store['aqua.settings'];
  assert.equal(s.ui.hoverOnly, true);
  assert.equal(s.ui.palette, 'light');
  assert.equal(s.ui.size, 'xxs');
  p.$('hoverOnly').checked = false;
  p.$('hoverOnly').dispatchEvent(new p.w.Event('change'));
  await settle();
  assert.equal(p.store['aqua.settings'].ui.hoverOnly, false);
});
