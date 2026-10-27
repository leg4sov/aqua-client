const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createController } = require('../src/controller');
const { makeDom, MOODLE_QUIZ_HTML, PLAIN_HTML, settle, button } = require('../testkit/helpers');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const OK_STATE = { ok: true, lang: 'es', hasKey: true, maxChars: 6000, prefs: { mode: 'quiz' }, ui: { size: 'xs', opacity: 40, side: 'right' } };
const answer = (over) => ({ ok: true, requestId: 'x', result: { status: 'confirmed', module: 'Servicios de Red e Internet', selected: [2], answerText: '443', explanation: 'HTTPS usa TCP/443.', commands: [], caveats: '', warnings: [], ...over }, redactions: 0 });

function setup({ html = MOODLE_QUIZ_HTML, url, handler, state } = {}) {
  const dom = makeDom(html, url);
  const calls = [];
  const send = async (msg) => {
    calls.push(msg);
    if (msg.type === 'AQUA_GET_STATE') return { ...OK_STATE, ...(state || {}) };
    if (handler) return handler(msg);
    return { ok: true };
  };
  const c = createController({ window: dom.window, document: dom.window.document, send, openSettings: () => calls.push({ type: 'settings' }) });
  const root = () => dom.window.document.getElementById('aqua-host').shadowRoot;
  const text = (sel) => (root().querySelector(sel) || {}).textContent;
  return { dom, c, calls, root, text, doc: dom.window.document };
}

// Modo «Largas» con texto seleccionado en la página (3.ª pregunta, de respuesta corta/redactar).
function selectAndSetLong(t) {
  const range = t.doc.createRange();
  range.selectNodeContents(t.doc.querySelectorAll('.qtext')[2]);
  t.dom.window.getSelection().removeAllRanges();
  t.dom.window.getSelection().addRange(range);
  button(t.root(), 'Selección').click();
  t.root().querySelector('input[value="long"]').click();
}

function ask_mode(t) {
  return (t.calls.find((m) => m.type === 'AQUA_ASK') || {}).mode;
}

async function pickFirstQuestion(t) {
  button(t.root(), 'Preguntas').click();
  t.root().querySelector('.qbtn').click();
}

test('página no Moodle: el panel avisa y no ofrece acciones de análisis', async () => {
  const t = setup({ html: PLAIN_HTML, url: 'https://example.com/' });
  await t.c.show(CSS);
  assert.ok(t.text('.notice').includes('no parece ser Moodle'));
  assert.equal(t.root().querySelector('.controls').hidden, true);
  assert.equal(t.root().querySelector('.actions').hidden, true);
  assert.equal(t.calls.filter((m) => m.type === 'AQUA_ASK').length, 0); // no envía nada a Gemini
});

test('no hay panel hasta la activación explícita', () => {
  const t = setup();
  assert.equal(t.doc.getElementById('aqua-host'), null);
});

test('página Moodle: activar, ocultar y reactivar', async () => {
  const t = setup();
  await t.c.show(CSS);
  assert.equal(t.c.isVisible(), true);
  t.c.hide();
  assert.equal(t.c.isVisible(), false);
  await t.c.show(CSS);
  assert.equal(t.c.isVisible(), true);
  button(t.root(), '✕').click();
  assert.equal(t.c.isVisible(), false);
});

test('el panel usa textContent: el contenido de la IA no se interpreta como HTML', async () => {
  const evil = '<img src=x onerror="window.pwned=1"><b>hola</b>';
  const t = setup({ handler: (m) => (m.type === 'AQUA_ASK' ? answer({ answerText: evil, explanation: evil }) : { ok: true }) });
  await t.c.show(CSS);
  selectAndSetLong(t);
  button(t.root(), 'Consultar').click();
  await settle();
  assert.equal(t.root().querySelectorAll('.result img, .result b').length, 0);
  assert.ok(t.text('.atext').includes('<img'));
  assert.equal(t.dom.window.pwned, undefined);
});

test('texto vacío (sin selección): error claro y no se envía nada', async () => {
  const t = setup({ handler: () => assert.fail('no debe enviar') });
  await t.c.show(CSS);
  // intento de consulta sin payload
  button(t.root(), 'Consultar').click();
  await settle();
  assert.equal(t.text('.badge'), 'Error');
  assert.ok(t.text('.notice').includes('No hay texto'));
  // "Usar selección" sin selección
  button(t.root(), 'Selección').click();
  assert.ok(t.text('.notice').includes('No hay texto'));
  assert.equal(t.calls.filter((m) => m.type === 'AQUA_ASK').length, 0);
});

test('modo Largas: envía la selección, muestra la respuesta y el estado completado', async () => {
  const t = setup({ handler: (m) => (m.type === 'AQUA_ASK' ? answer({ selected: [], answerText: 'ip a muestra las direcciones.' }) : { ok: true }) });
  await t.c.show(CSS);
  selectAndSetLong(t);
  assert.ok(t.text('.preview').includes('Comando para ver la IP'));
  button(t.root(), 'Consultar').click();
  await settle();
  assert.equal(t.text('.badge'), 'Completado');
  assert.equal(t.text('.atext'), 'ip a muestra las direcciones.');
  const ask = t.calls.find((m) => m.type === 'AQUA_ASK');
  assert.equal(ask.mode, 'long');
});

test('modo Quiz con texto libre (sin opciones) avisa y no envía nada', async () => {
  const t = setup({ handler: (m) => (m.type === 'AQUA_ASK' ? assert.fail('no debe enviar') : { ok: true }) });
  await t.c.show(CSS);
  const range = t.doc.createRange();
  range.selectNodeContents(t.doc.querySelectorAll('.qtext')[2]);
  t.dom.window.getSelection().removeAllRanges();
  t.dom.window.getSelection().addRange(range);
  button(t.root(), 'Selección').click();
  assert.equal(t.root().querySelector('input[value="quiz"]').checked, true);
  button(t.root(), 'Consultar').click();
  await settle();
  assert.ok(t.text('.notice').includes('Larga') && t.text('.notice').includes('Quiz'));
  assert.equal(t.calls.filter((m) => m.type === 'AQUA_ASK').length, 0);
});

test('modo Quiz: pregunta de opción múltiple muestra SOLO la letra (y el modo se elige solo)', async () => {
  const t = setup({ handler: (m) => (m.type === 'AQUA_ASK' ? answer({ selected: [2], answerText: '' }) : { ok: true }) });
  await t.c.show(CSS);
  t.dom.window.document.querySelector('#page-mod-quiz-attempt'); // body id
  button(t.root(), 'Preguntas').click();
  t.root().querySelector('.qbtn').click();
  button(t.root(), 'Consultar').click();
  await settle();
  assert.equal(t.text('.letters'), '1) B'); // número de la pregunta y letra
  assert.equal(t.root().querySelector('.result .atext, .result details'), null);
  assert.equal(ask_mode(t), 'quiz');
  const ask = t.calls.find((m) => m.type === 'AQUA_ASK');
  assert.deepEqual(ask.meta, { type: 'single', optionCount: 3 });
  assert.ok(!ask.text.includes('checked'));
});

test('interfaz mínima: marca aqua.client, sin gota, sin checkbox y sin pie de texto', async () => {
  const t = setup();
  await t.c.show(CSS);
  assert.equal(t.text('.brand'), 'aqua.client');
  assert.ok(!t.root().textContent.includes('💧'));
  assert.equal(t.root().querySelector('input[type="checkbox"]'), null);
  assert.equal(t.root().querySelector('.foot'), null);
  assert.ok(!t.root().textContent.includes('Generado por IA'));
  // en un intento de cuestionario ya no hay avisos ni confirmaciones extra
  assert.equal(t.root().querySelector('.notice').hidden, true);
});

for (const [code, expected] of [
  ['NETWORK', 'No se pudo conectar'],
  ['QUOTA', 'cuota'],
  ['INVALID_RESPONSE', 'formato esperado'],
  ['BLOCKED', 'bloque'],
  ['TIMEOUT', 'tardó demasiado'],
]) {
  test(`error ${code} se muestra sin congelar el panel`, async () => {
    const t = setup({ handler: (m) => (m.type === 'AQUA_ASK' ? { ok: false, error: { code } } : { ok: true }) });
    await t.c.show(CSS);
    await pickFirstQuestion(t);
    button(t.root(), 'Consultar').click();
    await settle();
    assert.equal(t.text('.badge'), 'Error');
    assert.ok(t.text('.notice').includes(expected), t.text('.notice'));
    assert.equal(button(t.root(), 'Consultar').disabled, false); // vuelve a estar usable
  });
}

test('error de comunicación con el background (excepción) no congela', async () => {
  const t = setup({ handler: (m) => { if (m.type === 'AQUA_ASK') throw new Error('x'); return { ok: true }; } });
  await t.c.show(CSS);
  await pickFirstQuestion(t);
  button(t.root(), 'Consultar').click();
  await settle();
  assert.equal(t.text('.badge'), 'Error');
});

test('cancelación: avisa al background, ignora la respuesta tardía y vuelve a inactivo', async () => {
  let release;
  const t = setup({ handler: (m) => (m.type === 'AQUA_ASK' ? new Promise((r) => (release = r)) : { ok: true }) });
  await t.c.show(CSS);
  await pickFirstQuestion(t);
  button(t.root(), 'Consultar').click();
  await settle();
  assert.equal(t.text('.badge'), 'Procesando');
  assert.equal(button(t.root(), 'Cancelar').disabled, false);
  button(t.root(), 'Cancelar').click();
  assert.equal(t.text('.badge'), 'Inactivo');
  assert.ok(t.calls.some((m) => m.type === 'AQUA_CANCEL'));
  release(answer());
  await settle();
  assert.equal(t.text('.badge'), 'Inactivo'); // la respuesta tardía no pisa el estado
  assert.equal(t.root().querySelector('.result').hidden, true);
});

test('ocultar el panel cancela la solicitud en curso', async () => {
  const t = setup({ handler: (m) => (m.type === 'AQUA_ASK' ? new Promise(() => {}) : { ok: true }) });
  await t.c.show(CSS);
  await pickFirstQuestion(t);
  button(t.root(), 'Consultar').click();
  await settle();
  t.c.hide();
  assert.ok(t.calls.some((m) => m.type === 'AQUA_CANCEL'));
});

const copyBtn = (root) => root.querySelector('button.copy');

test('copia al portapapeles con un botón-símbolo pequeño (API moderna) y copia de reserva', async () => {
  const t = setup({ handler: (m) => (m.type === 'AQUA_ASK' ? answer({ selected: [], answerText: 'ip a' }) : { ok: true }) });
  let copied;
  Object.defineProperty(t.dom.window.navigator, 'clipboard', { value: { writeText: async (s) => { copied = s; } }, configurable: true });
  await t.c.show(CSS);
  selectAndSetLong(t);
  button(t.root(), 'Consultar').click();
  await settle();
  const b = copyBtn(t.root());
  assert.equal(b.textContent, '⧉'); // solo un símbolo
  assert.equal(b.getAttribute('aria-label'), 'Copiar'); // accesible
  assert.equal(b.title, 'Copiar');
  b.click();
  await settle();
  assert.equal(copied, 'ip a');
  assert.equal(copyBtn(t.root()).textContent, '✓');

  // reserva: writeText falla -> execCommand('copy')
  Object.defineProperty(t.dom.window.navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denegado'); } }, configurable: true });
  let used = false;
  t.doc.execCommand = (cmd) => { used = cmd === 'copy'; return true; };
  copyBtn(t.root()).click();
  await settle();
  assert.equal(used, true);
});

test('modos Corta y Larga: respuesta de texto con botón de copiar; Quiz no lo tiene', async () => {
  for (const mode of ['short', 'long']) {
    const t = setup({ handler: (m) => (m.type === 'AQUA_ASK' ? answer({ selected: [], answerText: 'respuesta escrita' }) : { ok: true }) });
    await t.c.show(CSS);
    selectAndSetLong(t);
    t.root().querySelector(`input[value="${mode}"]`).click();
    button(t.root(), 'Consultar').click();
    await settle();
    assert.equal(t.calls.find((m) => m.type === 'AQUA_ASK').mode, mode);
    assert.equal(t.text('.atext'), 'respuesta escrita');
    assert.ok(copyBtn(t.root()));
  }
  const q = setup({ handler: (m) => (m.type === 'AQUA_ASK' ? answer() : { ok: true }) });
  await q.c.show(CSS);
  await pickFirstQuestion(q);
  button(q.root(), 'Consultar').click();
  await settle();
  assert.equal(copyBtn(q.root()), null);
});

test('hay tres modos (Quiz, Corta, Larga) y las preguntas abiertas sugieren Corta o Larga según el tipo', async () => {
  const t = setup();
  await t.c.show(CSS);
  assert.deepEqual([...t.root().querySelectorAll('.seg input')].map((i) => i.value), ['quiz', 'short', 'long']);
  assert.deepEqual([...t.root().querySelectorAll('.seg span')].map((i) => i.textContent), ['Quiz', 'Corta', 'Larga']);
  button(t.root(), 'Preguntas').click();
  const btns = t.root().querySelectorAll('.qbtn');
  btns[0].click();
  assert.equal(t.root().querySelector('input[value="quiz"]').checked, true); // opción única
  btns[2].click();
  assert.equal(t.root().querySelector('input[value="short"]').checked, true); // respuesta corta
});

test('sin clave API: avisa y no envía', async () => {
  const dom = makeDom(MOODLE_QUIZ_HTML.replace('page-mod-quiz-attempt', 'page-mod-quiz-review'), 'https://campus.example/mod/quiz/review.php');
  const calls = [];
  const c = createController({ window: dom.window, document: dom.window.document, openSettings() {}, send: async (m) => { calls.push(m); return m.type === 'AQUA_GET_STATE' ? { ok: true, lang: 'es', hasKey: false, maxChars: 6000, prefs: {} } : { ok: true }; } });
  await c.show(CSS);
  const root = dom.window.document.getElementById('aqua-host').shadowRoot;
  assert.ok(root.querySelector('.notice').textContent.includes('Falta la clave'));
  root.querySelector('.qlist') && button(root, 'Preguntas').click();
  root.querySelector('.qbtn').click();
  button(root, 'Consultar').click();
  await settle();
  assert.equal(calls.filter((m) => m.type === 'AQUA_ASK').length, 0);
});

test('Aqua nunca modifica ni envía el formulario de Moodle', async () => {
  const t = setup({ handler: (m) => (m.type === 'AQUA_ASK' ? answer() : { ok: true }) });
  let submitted = false;
  t.doc.getElementById('responseform').addEventListener('submit', () => (submitted = true));
  const before = t.doc.querySelector('form').outerHTML;
  await t.c.show(CSS);
  await pickFirstQuestion(t);
  button(t.root(), 'Consultar').click();
  await settle();
  assert.equal(submitted, false);
  assert.equal(t.doc.querySelector('form').outerHTML, before);
  assert.equal(t.doc.querySelectorAll('.que input:checked').length, 1); // solo la que ya estaba marcada
});

test('apariencia: el panel aplica tamaño, opacidad (con suelo) y lado de los ajustes', async () => {
  const t = setup();
  await t.c.show(CSS);
  const host = t.doc.getElementById('aqua-host');
  assert.equal(host.style.getPropertyValue('--aqua-w'), '184px');
  assert.equal(host.style.getPropertyValue('--aqua-op'), '0.4');
  assert.equal(host.style.right, '10px');
  assert.equal(host.getAttribute('data-bg'), 'transparent'); // por defecto, sin color de fondo
  assert.equal(host.getAttribute('data-palette'), 'dark'); // paleta por defecto: oscura
  assert.equal(host.getAttribute('data-size'), 'xs');
  t.c._panel().applyAppearance({ palette: 'classic' });
  assert.equal(host.getAttribute('data-palette'), 'classic');
  t.c._panel().applyAppearance({ palette: 'light' });
  assert.equal(host.getAttribute('data-palette'), 'light');
  t.c._panel().applyAppearance({ palette: 'dark' });
  assert.equal(host.getAttribute('data-palette'), 'dark');
  t.c._panel().applyAppearance({ palette: 'otra' });
  assert.equal(host.getAttribute('data-palette'), 'dark');
  t.c._panel().applyAppearance({ bg: 'solid' });
  assert.equal(host.getAttribute('data-bg'), 'solid');
  t.c._panel().applyAppearance({ size: 'm', opacity: 1, side: 'left' });
  assert.equal(host.style.getPropertyValue('--aqua-op'), '0.3'); // nunca por debajo del 30 %
  assert.equal(host.style.left, '10px');
});

test('idioma por defecto: inglés; cambia a español según los ajustes y recrea el panel', async () => {
  const dom = makeDom(MOODLE_QUIZ_HTML.replace('page-mod-quiz-attempt', 'page-mod-quiz-review'), 'https://campus.example/mod/quiz/review.php');
  let lang;
  const c = createController({ window: dom.window, document: dom.window.document, openSettings() {}, send: async (m) => (m.type === 'AQUA_GET_STATE' ? { ok: true, lang, hasKey: false, maxChars: 6000, prefs: {} } : { ok: true }) });
  const root = () => dom.window.document.getElementById('aqua-host').shadowRoot;
  const labels = () => [...root().querySelectorAll('button')].map((b) => b.textContent);
  await c.show(CSS); // sin idioma guardado
  assert.ok(labels().includes('Ask') && labels().includes('Questions') && labels().includes('Selection'));
  assert.equal(root().querySelector('.badge').textContent, 'Idle');
  assert.ok(root().querySelector('.notice').textContent.includes('Missing Gemini API key'));
  lang = 'es';
  await c.show(CSS);
  assert.ok(labels().includes('Consultar') && labels().includes('Preguntas'));
  assert.equal(dom.window.document.querySelectorAll('#aqua-host').length, 1); // sin paneles duplicados
  assert.ok(root().querySelector('.notice').textContent.includes('Falta la clave'));
});

test('idioma desconocido en los ajustes cae a inglés', async () => {
  const dom = makeDom(PLAIN_HTML, 'https://example.com/');
  const c = createController({ window: dom.window, document: dom.window.document, openSettings() {}, send: async () => ({ ok: true, lang: 'fr', hasKey: true, maxChars: 6000, prefs: {} }) });
  await c.show(CSS);
  assert.ok(dom.window.document.getElementById('aqua-host').shadowRoot.querySelector('.notice').textContent.includes("doesn't look like Moodle"));
});

test('modo ultra pequeño: preguntas solo con su número (el texto completo va en el tooltip) y a Gemini se envía la pregunta entera', async () => {
  const t = setup({ state: { ui: { size: 'xxs' } }, handler: (m) => (m.type === 'AQUA_ASK' ? answer() : { ok: true }) });
  await t.c.show(CSS);
  assert.equal(t.dom.window.document.getElementById('aqua-host').getAttribute('data-size'), 'xxs');
  button(t.root(), 'Preguntas').click();
  const labels = [...t.root().querySelectorAll('.qbtn')].map((b) => b.textContent);
  assert.deepEqual(labels, ['1', '2', '3']);
  assert.ok(t.root().querySelector('.qbtn').title.includes('puerto'));
  t.root().querySelector('.qbtn').click();
  button(t.root(), 'Consultar').click();
  await settle();
  const ask = t.calls.find((m) => m.type === 'AQUA_ASK');
  assert.ok(ask.text.includes('¿Qué puerto usa HTTPS por defecto?') && ask.text.includes('443')); // pregunta completa al modelo
  assert.equal(t.text('.letters'), '1) B');
});

test('modo ultra: el botón muestra «…» mientras procesa y vuelve a su texto', async () => {
  let release;
  const t = setup({ state: { ui: { size: 'xxs' } }, handler: (m) => (m.type === 'AQUA_ASK' ? new Promise((r) => (release = r)) : { ok: true }) });
  await t.c.show(CSS);
  await pickFirstQuestion(t);
  button(t.root(), 'Consultar').click();
  await settle();
  assert.equal(t.root().querySelector('.primary').textContent, '…');
  release(answer());
  await settle();
  assert.equal(t.root().querySelector('.primary').textContent, 'Consultar');
});

test('en tamaño normal las preguntas conservan el título abreviado', async () => {
  const t = setup({ state: { ui: { size: 'm' } } });
  await t.c.show(CSS);
  button(t.root(), 'Preguntas').click();
  assert.ok(t.root().querySelector('.qbtn').textContent.startsWith('1. ¿Qué puerto'));
});

test('desvanecer por inactividad: invisible tras N s sin actividad (sin cerrarse) y vuelve con cualquier actividad', async (tc) => {
  tc.mock.timers.enable({ apis: ['setTimeout'] });
  const t = setup({ state: { idle: { enabled: true, seconds: 5 } } });
  await t.c.show(CSS);
  const host = t.dom.window.document.getElementById('aqua-host');
  assert.equal(host.style.opacity, '');
  tc.mock.timers.tick(4900);
  assert.equal(host.style.opacity, ''); // aún no
  tc.mock.timers.tick(200);
  assert.equal(host.style.opacity, '0'); // invisible…
  assert.equal(host.style.pointerEvents, 'none'); // …sin tapar clics de la página
  assert.equal(t.c.isVisible(), true); // no está cerrado
  t.dom.window.document.dispatchEvent(new t.dom.window.Event('mousemove'));
  assert.equal(host.style.opacity, ''); // vuelve al nivel anterior
  assert.equal(host.style.pointerEvents, '');
  tc.mock.timers.tick(5100);
  assert.equal(host.style.opacity, '0'); // y se vuelve a desvanecer
  t.dom.window.document.dispatchEvent(new t.dom.window.Event('keydown'));
  assert.equal(host.style.opacity, '');
  t.c.destroy();
});

test('desvanecer: el tiempo es configurable, se puede desactivar y ocultar el panel cancela el temporizador', async (tc) => {
  tc.mock.timers.enable({ apis: ['setTimeout'] });
  let t = setup({ state: { idle: { enabled: true, seconds: 2 } } });
  await t.c.show(CSS);
  let host = t.dom.window.document.getElementById('aqua-host');
  tc.mock.timers.tick(2100);
  assert.equal(host.style.opacity, '0');
  t.c.destroy();

  t = setup({ state: { idle: { enabled: false, seconds: 1 } } });
  await t.c.show(CSS);
  host = t.dom.window.document.getElementById('aqua-host');
  tc.mock.timers.tick(10000);
  assert.equal(host.style.opacity, ''); // desactivado: nunca se desvanece
  t.c.destroy();

  t = setup({ state: { idle: { enabled: true, seconds: 3 } } });
  await t.c.show(CSS);
  host = t.dom.window.document.getElementById('aqua-host');
  t.c.hide();
  tc.mock.timers.tick(10000);
  assert.equal(host.style.opacity, ''); // oculto: sin temporizador pendiente
  t.c.destroy();
});

test('el círculo del selector es literalmente del color del texto (borde y relleno), en todas las paletas', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  const rule = css.match(/\.seg input\s*\{([^}]*)\}/)[1];
  assert.ok(/appearance:\s*none/.test(rule));
  assert.ok(/border:\s*1px solid var\(--fg\)/.test(rule));
  assert.ok(/\.seg input:checked\s*\{\s*background:\s*var\(--fg\)/.test(css));
  assert.ok(!/accent-color/.test(css)); // sin el azul por defecto del navegador
});

// ---- Visibilidad: «invisible salvo con el ratón encima» + desvanecer por inactividad (combinables)
function stubRect(t) {
  const host = t.dom.window.document.getElementById('aqua-host');
  host.getBoundingClientRect = () => ({ left: 10, right: 110, top: 400, bottom: 480 });
  return host;
}
const move = (t, x, y) => t.dom.window.document.dispatchEvent(Object.assign(new t.dom.window.Event('mousemove'), { clientX: x, clientY: y }));

test('modo invisible salvo con el ratón encima: se ve solo mientras el ratón está sobre el panel', async () => {
  const t = setup({ state: { ui: { hoverOnly: true }, idle: { enabled: false, seconds: 5 } } });
  await t.c.show(CSS);
  const host = stubRect(t);
  assert.equal(host.style.opacity, '0'); // invisible al abrirlo
  assert.equal(host.style.pointerEvents, 'none'); // y sin tapar clics de la página
  assert.equal(t.c.isVisible(), true); // no está cerrado
  move(t, 500, 100); // ratón lejos
  assert.equal(host.style.opacity, '0');
  move(t, 50, 430); // ratón encima
  assert.equal(host.style.opacity, '');
  assert.equal(host.style.pointerEvents, '');
  move(t, 500, 100); // se va
  assert.equal(host.style.opacity, '0');
  move(t, 50, 430);
  t.dom.window.document.documentElement.dispatchEvent(new t.dom.window.Event('mouseleave')); // sale de la ventana
  assert.equal(host.style.opacity, '0');
  t.c.destroy();
});

test('sin el modo, el panel se ve aunque el ratón esté lejos', async () => {
  const t = setup({ state: { ui: { hoverOnly: false }, idle: { enabled: false, seconds: 5 } } });
  await t.c.show(CSS);
  const host = stubRect(t);
  move(t, 500, 100);
  assert.equal(host.style.opacity, '');
  t.c.destroy();
});

test('combinado con inactividad: visible con el ratón encima, se desvanece si no hay actividad y vuelve al moverlo', async (tc) => {
  tc.mock.timers.enable({ apis: ['setTimeout'] });
  const t = setup({ state: { ui: { hoverOnly: true }, idle: { enabled: true, seconds: 5 } } });
  await t.c.show(CSS);
  const host = stubRect(t);
  move(t, 50, 430);
  assert.equal(host.style.opacity, ''); // encima: visible
  tc.mock.timers.tick(5100);
  assert.equal(host.style.opacity, '0'); // quieto 5 s: se desvanece aunque el ratón siga encima
  assert.equal(host.style.pointerEvents, 'none');
  move(t, 55, 432); // cualquier movimiento sobre el panel
  assert.equal(host.style.opacity, ''); // vuelve a verse
  move(t, 500, 100); // se aparta: invisible
  assert.equal(host.style.opacity, '0');
  t.c.destroy();
});

test('ocultar o destruir el panel limpia los oyentes y temporizadores del modo hover', async () => {
  const t = setup({ state: { ui: { hoverOnly: true } } });
  await t.c.show(CSS);
  const host = stubRect(t);
  t.c.hide();
  assert.equal(host.style.opacity, ''); // restaurado
  move(t, 50, 430);
  move(t, 500, 100);
  assert.equal(host.style.opacity, ''); // ya no reacciona
});

test('lado del panel: el mensaje AQUA_SIDE lo mueve sin reabrir', async () => {
  const t = setup({ state: { ui: { side: 'left' } } });
  await t.c.show(CSS);
  const host = t.dom.window.document.getElementById('aqua-host');
  assert.equal(host.style.left, '10px');
  t.c.setSide('right');
  assert.equal(host.style.right, '10px');
  assert.equal(host.style.left, 'auto');
  t.c.setSide('left');
  assert.equal(host.style.left, '10px');
  t.c.setSide('cualquiera'); // valor raro -> izquierda
  assert.equal(host.style.left, '10px');
});

test('Quiz: la respuesta se muestra como «n) letra» con el número de la pregunta (también varias letras)', async () => {
  const t = setup({ handler: (m) => (m.type === 'AQUA_ASK' ? answer({ selected: [1, 2] }) : { ok: true }) });
  await t.c.show(CSS);
  button(t.root(), 'Preguntas').click();
  t.root().querySelectorAll('.qbtn')[1].click(); // pregunta 2 (opción múltiple)
  button(t.root(), 'Consultar').click();
  await settle();
  assert.equal(t.text('.letters'), '2) A, B');
});

test('Quiz: si eliges otra pregunta mientras espera, el número mostrado es el de la pregunta enviada', async () => {
  let release;
  const t = setup({ handler: (m) => (m.type === 'AQUA_ASK' ? new Promise((r) => (release = r)) : { ok: true }) });
  await t.c.show(CSS);
  button(t.root(), 'Preguntas').click();
  const btns = t.root().querySelectorAll('.qbtn');
  btns[0].click();
  button(t.root(), 'Consultar').click();
  await settle();
  btns[1].click(); // cambia de pregunta con la petición en curso
  release(answer({ selected: [2] }));
  await settle();
  assert.equal(t.text('.letters'), '1) B');
});

test('sin tooltips al pasar el ratón por Quiz / Short / Long (ni en los radios ni en sus etiquetas)', async () => {
  const t = setup();
  await t.c.show(CSS);
  const nodes = [...t.root().querySelectorAll('.modes, .modes *')];
  assert.ok(nodes.length >= 7);
  for (const n of nodes) assert.equal(n.hasAttribute('title'), false, n.outerHTML);
});

// ---- PDF de referencia en el panel
const HITS = [{ id: 11, page: 12, text: 'El puerto 443 es el de HTTPS.' }, { id: 12, page: 40, text: 'TLS cifra la conexión.' }];
const docsState = { docs: { enabled: true, k: 4 } };

test('PDF: al elegir una pregunta se buscan fragmentos, se muestran en «Texto enviado» y se envían sus ids', async () => {
  const t = setup({ state: docsState, handler: (m) => (m.type === 'AQUA_DOCS_SEARCH' ? { ok: true, hits: HITS } : m.type === 'AQUA_ASK' ? answer() : { ok: true }) });
  await t.c.show(CSS);
  await pickFirstQuestion(t);
  await settle();
  const search = t.calls.find((m) => m.type === 'AQUA_DOCS_SEARCH');
  assert.ok(search.query.includes('¿Qué puerto usa HTTPS por defecto?') && search.query.includes('443')); // pregunta + opciones, sin andamiaje
  assert.ok(t.text('.preview').includes('Fragmentos de PDF (2)'));
  assert.ok(t.text('.preview').includes('[1] p.12: El puerto 443 es el de HTTPS.'));
  button(t.root(), 'Consultar').click();
  await settle();
  const ask = t.calls.find((m) => m.type === 'AQUA_ASK');
  assert.deepEqual(ask.refIds, [11, 12]);
  assert.ok(!ask.text.includes('Fragmentos')); // el texto de la pregunta va aparte de la referencia
  assert.equal(t.text('.letters'), '1) B');
});

test('PDF: sin coincidencias no se añade nada; desactivado no se busca; selección también busca', async () => {
  let t = setup({ state: docsState, handler: (m) => (m.type === 'AQUA_DOCS_SEARCH' ? { ok: true, hits: [] } : m.type === 'AQUA_ASK' ? answer() : { ok: true }) });
  await t.c.show(CSS);
  await pickFirstQuestion(t);
  await settle();
  assert.ok(!t.text('.preview').includes('PDF'));
  button(t.root(), 'Consultar').click();
  await settle();
  assert.deepEqual(t.calls.find((m) => m.type === 'AQUA_ASK').refIds, []);

  t = setup({ handler: (m) => (m.type === 'AQUA_ASK' ? answer() : { ok: true }) }); // docs desactivado (por defecto)
  await t.c.show(CSS);
  await pickFirstQuestion(t);
  await settle();
  assert.equal(t.calls.filter((m) => m.type === 'AQUA_DOCS_SEARCH').length, 0);

  t = setup({ state: docsState, handler: (m) => (m.type === 'AQUA_DOCS_SEARCH' ? { ok: true, hits: HITS } : { ok: true }) });
  await t.c.show(CSS);
  selectAndSetLong(t);
  await settle();
  assert.ok(t.calls.find((m) => m.type === 'AQUA_DOCS_SEARCH').query.includes('Comando para ver la IP'));
});

test('PDF: un fallo en la búsqueda local no impide consultar; una búsqueda antigua no pisa la pregunta nueva', async () => {
  let t = setup({ state: docsState, handler: (m) => { if (m.type === 'AQUA_DOCS_SEARCH') throw new Error('x'); return m.type === 'AQUA_ASK' ? answer() : { ok: true }; } });
  await t.c.show(CSS);
  await pickFirstQuestion(t);
  button(t.root(), 'Consultar').click();
  await settle();
  assert.equal(t.text('.letters'), '1) B');
  assert.deepEqual(t.calls.find((m) => m.type === 'AQUA_ASK').refIds, []);

  const releases = [];
  t = setup({ state: docsState, handler: (m) => (m.type === 'AQUA_DOCS_SEARCH' ? new Promise((r) => releases.push(r)) : { ok: true }) });
  await t.c.show(CSS);
  button(t.root(), 'Preguntas').click();
  const btns = t.root().querySelectorAll('.qbtn');
  btns[0].click(); // búsqueda 1 pendiente
  btns[1].click(); // otra pregunta: búsqueda 2
  releases[0]({ ok: true, hits: HITS }); // llega tarde la de la pregunta anterior
  await settle();
  assert.ok(!t.text('.preview').includes('Fragmentos')); // se descarta
  releases[1]({ ok: true, hits: [HITS[0]] }); // la de la pregunta actual sí se muestra
  await settle();
  assert.ok(t.text('.preview').includes('Fragmentos de PDF (1)'));
});

test('resultado Quiz sin línea ni relleno; Corta/Larga conservan el separador', async () => {
  let t = setup({ handler: (m) => (m.type === 'AQUA_ASK' ? answer() : { ok: true }) });
  await t.c.show(CSS);
  await pickFirstQuestion(t);
  button(t.root(), 'Consultar').click();
  await settle();
  assert.equal(t.root().querySelector('.result').classList.contains('quiz'), true);
  t = setup({ handler: (m) => (m.type === 'AQUA_ASK' ? answer({ selected: [], answerText: 'texto' }) : { ok: true }) });
  await t.c.show(CSS);
  selectAndSetLong(t);
  button(t.root(), 'Consultar').click();
  await settle();
  assert.equal(t.root().querySelector('.result').classList.contains('quiz'), false);
});
