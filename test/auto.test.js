const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createController } = require('../src/controller');
const S = require('../src/settings');
const { makeDom, settle } = require('../testkit/helpers');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const radio = (q, n, label, extra = '') => `<div class="r${n % 2}"><input type="radio" name="q${q}" value="${n}" id="q${q}o${n}" ${extra}><div class="flex-fill">${label}</div></div>`;
const que = (n, text, body) => `<div id="question-${n}" class="que multichoice"><div class="info"><span class="qno">${n}</span></div><div class="content"><div class="qtext">${text}</div><div class="answer">${body}</div></div></div>`;
// El radio oculto «Borrar mi elección» (value -1) viene marcado en Moodle cuando no hay respuesta.
const clear = (q) => `<input type="radio" name="q${q}" value="-1" id="q${q}c" checked>`;
const quiz = (qs) => `<!doctype html><html><body id="page-mod-quiz-attempt" class="path-mod path-mod-quiz"><form id="responseform">${qs.join('')}<input type="submit" id="finish" value="Terminar"></form></body></html>`;
const Q = {
  1: () => que(1, 'Primera pregunta', clear(1) + radio(1, 0, 'a1') + radio(1, 1, 'b1') + radio(1, 2, 'c1')),
  2: (checked) => que(2, 'Segunda pregunta', radio(2, 0, 'a2') + radio(2, 1, 'b2', checked ? 'checked' : '')),
  3: () => que(3, 'Tercera pregunta', clear(3) + radio(3, 0, 'a3') + radio(3, 1, 'b3') + radio(3, 2, 'c3')),
  4: () => que(4, 'Cuarta pregunta', clear(4) + radio(4, 0, 'a4') + radio(4, 1, 'b4')),
};
const answer = (selected, status = 'confirmed') => ({ ok: true, requestId: 'x', result: { status, module: '', selected, answerText: '', explanation: '', commands: [], caveats: '', warnings: [] }, redactions: 0 });

function setup(qs, { auto = true, selected = [2], status, handler, trigger, scroll } = {}) {
  const dom = makeDom(quiz(qs));
  const doc = dom.window.document;
  const calls = [];
  const send = async (msg) => {
    calls.push(msg);
    if (msg.type === 'AQUA_GET_STATE') return { ok: true, lang: 'es', hasKey: true, maxChars: 6000, prefs: { mode: 'quiz' }, auto: { enabled: auto, ...(trigger ? { trigger } : {}), ...(scroll === false ? { scroll: false } : {}) } };
    if (msg.type === 'AQUA_SET_DOCS') return { ok: true, enabled: msg.enabled };
    if (msg.type === 'AQUA_DOCS_SEARCH') return { ok: true, hits: [] };
    if (msg.type === 'AQUA_ASK') return handler ? handler(msg, doc) : answer(selected, status);
    return { ok: true };
  };
  const c = createController({ window: dom.window, document: doc, send, openSettings() {} });
  let submitted = 0;
  doc.getElementById('responseform').addEventListener('submit', (e) => {
    submitted++;
    e.preventDefault();
  });
  const press = async (init = {}) => {
    const ev = new dom.window.KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true, composed: true, ...init });
    (init.target || doc.body).dispatchEvent(ev);
    await settle(12);
    return ev;
  };
  const click = async (init = {}) => {
    const tgt = init.target || doc.body;
    const down = new dom.window.MouseEvent('mousedown', { button: 1, bubbles: true, cancelable: true, composed: true, ...init });
    tgt.dispatchEvent(down);
    const up = new dom.window.MouseEvent('mouseup', { button: 1, bubbles: true, cancelable: true, composed: true });
    tgt.dispatchEvent(up);
    await settle(12);
    return { down, up };
  };
  const asks = () => calls.filter((m) => m.type === 'AQUA_ASK');
  const checked = (q) => Array.from(doc.querySelectorAll(`input[name="q${q}"]`)).filter((i) => i.checked && i.value !== '-1').map((i) => i.value);
  const notice = () => doc.getElementById('aqua-host').shadowRoot.querySelector('.notice').textContent;
  return { c, doc, dom, calls, press, click, asks, checked, notice, submitted: () => submitted };
}

test('Auto apagado (por defecto): la tecla + no hace nada', async () => {
  const t = setup([Q[1](), Q[2]()], { auto: false });
  await t.c.show(CSS);
  const ev = await t.press();
  assert.equal(t.asks().length, 0);
  assert.equal(ev.defaultPrevented, false);
  assert.deepEqual(t.checked(1), []);
});

test('Auto: cada pulsación consulta UNA pregunta, marca la sugerida y pasa a la siguiente; nunca envía el cuestionario', async () => {
  const t = setup([Q[1](), Q[2](), Q[3]()], { selected: [2] });
  await t.c.show(CSS);
  await t.press();
  assert.equal(t.asks().length, 1);
  assert.ok(t.asks()[0].text.includes('Primera pregunta'));
  assert.deepEqual(t.checked(1), ['1']); // opción 2 = value 1 (el radio oculto -1 no cuenta)
  assert.ok(t.notice().includes('Siguiente: 2'));
  await t.press();
  assert.equal(t.asks().length, 2);
  assert.ok(t.asks()[1].text.includes('Segunda pregunta'));
  assert.deepEqual(t.checked(2), ['1']);
  await t.press();
  assert.deepEqual(t.checked(3), ['1']);
  assert.ok(t.notice().includes('No quedan'));
  await t.press(); // nada más que hacer: no consulta
  assert.equal(t.asks().length, 3);
  assert.equal(t.submitted(), 0);
});

test('Auto: va siempre por orden de la página, saltando las ya respondidas', async () => {
  const t = setup([Q[1](), Q[2](true), Q[3](), Q[4]()], { selected: [1] });
  await t.c.show(CSS);
  for (let i = 0; i < 4; i++) await t.press();
  const order = t.asks().map((m) => m.text.match(/(Primera|Segunda|Tercera|Cuarta) pregunta/)[1]);
  assert.deepEqual(order, ['Primera', 'Tercera', 'Cuarta']); // la 2.ª ya estaba respondida; la 4.ª pulsación no tiene nada pendiente
});

test('Auto: no responde a teclas con modificadores, repetidas ni escritas en un campo de texto', async () => {
  const t = setup([Q[1]()]);
  await t.c.show(CSS);
  await t.press({ ctrlKey: true });
  await t.press({ altKey: true });
  await t.press({ repeat: true });
  const input = t.doc.createElement('input');
  t.doc.body.appendChild(input);
  await t.press({ target: input });
  assert.equal(t.asks().length, 0);
  await t.press({ key: '-' });
  assert.equal(t.asks().length, 0);
  await t.press({ key: 'Add', code: 'NumpadAdd' });
  assert.equal(t.asks().length, 1);
});

test('Auto: pregunta de una sola respuesta con varias sugeridas, o sin sugerencia: no marca nada y avisa', async () => {
  const a = setup([Q[1]()], { selected: [1, 2] });
  await a.c.show(CSS);
  await a.press();
  assert.deepEqual(a.checked(1), []);
  assert.ok(a.notice().includes('admite una sola respuesta'));
  const b = setup([Q[1]()], { selected: [9] });
  await b.c.show(CSS);
  await b.press();
  assert.deepEqual(b.checked(1), []);
  assert.ok(b.notice().includes('ninguna opción'));
});

test('Auto: si el modelo no está seguro marca igual pero avisa; sin permiso de respuesta no cambia nada ya contestado', async () => {
  const t = setup([Q[1]()], { selected: [3], status: 'hypothesis' });
  await t.c.show(CSS);
  await t.press();
  assert.deepEqual(t.checked(1), ['2']);
  assert.ok(t.notice().includes('no estaba seguro'));
});

test('Auto: si respondes tú mientras espera, no se pisa tu respuesta', async () => {
  const t = setup([Q[1]()], { handler: (msg, doc) => { doc.getElementById('q1o0').checked = true; return answer([3]); } });
  await t.c.show(CSS);
  await t.press();
  assert.deepEqual(t.checked(1), ['0']);
  assert.ok(t.notice().includes('se respondió mientras tanto'));
});

test('Auto: no toca preguntas con entradas desactivadas (revisión) ni sin panel visible', async () => {
  const review = que(1, 'Primera pregunta', radio(1, 0, 'a', 'disabled') + radio(1, 1, 'b', 'disabled'));
  const t = setup([review]);
  await t.c.show(CSS);
  await t.press();
  assert.equal(t.asks().length, 0);
  assert.ok(t.notice().includes('No quedan'));
  const u = setup([Q[1]()]);
  await u.c.show(CSS);
  u.c.hide();
  await u.press();
  assert.equal(u.asks().length, 0);
});

test('ajustes: auto apagado por defecto y saneado estricto', () => {
  assert.deepEqual(S.sanitizeSettings({}).auto, { enabled: false, trigger: 'key:+', scroll: true });
  assert.deepEqual(S.sanitizeSettings({ auto: { enabled: 'true' } }).auto, { enabled: false, trigger: 'key:+', scroll: true });
  assert.deepEqual(S.sanitizeSettings({ auto: { enabled: true } }).auto, { enabled: true, trigger: 'key:+', scroll: true });
});

// ---- Desplegables (emparejar, huecos con lista)
const sel = (name, opts, extra = '') => `<select name="${name}" ${extra}><option value="">Elegir...</option>${opts.map((o, i) => `<option value="${i + 1}">${o}</option>`).join('')}</select>`;
const match = (n) => `<div id="question-${n}" class="que match notyetanswered"><div class="info"><span class="qno">${n}</span></div><div class="content"><div class="qtext">Relaciona cada protocolo con su puerto.</div><table class="answer"><tbody>` +
  [['HTTP', 'a'], ['SSH', 'b'], ['SMTP', 'c']].map(([t, k]) => `<tr><td class="text">${t}</td><td class="control">${sel(`q${n}:sub${k}`, ['80', '22', '25'])}</td></tr>`).join('') + '</tbody></table></div></div>';
const gapsel = (n) => `<div id="question-${n}" class="que gapselect notyetanswered"><div class="info"><span class="qno">${n}</span></div><div class="content"><div class="qtext">La máscara de clase C es ${sel(`q${n}:p1`, ['255.0.0.0', '255.255.0.0', '255.255.255.0'])} y la puerta de enlace suele ser ${sel(`q${n}:p2`, ['.1', '.255'])}.</div></div></div>`;
const selectAnswer = (lines, status = 'confirmed') => ({ ok: true, requestId: 'x', result: { status, module: '', selected: [], answerText: lines, explanation: '', commands: [], caveats: '', warnings: [] }, redactions: 0 });
const values = (t, n) => Array.from(t.doc.querySelectorAll(`#question-${n} select`)).map((s) => s.value);

test('Auto con desplegables (emparejar): el modelo recibe los huecos numerados y se rellenan solo con opciones válidas', async () => {
  const t = setup([match(1)], { handler: () => selectAnswer('1=1\n2=2\n3=3') });
  await t.c.show(CSS);
  await t.press();
  const sent = t.asks()[0];
  assert.equal(sent.mode, 'select');
  assert.equal(sent.meta.type, 'select');
  assert.ok(sent.text.includes('HUECO 1 (HTTP): 1) 80 2) 22 3) 25') && sent.text.includes('HUECO 3 (SMTP)'));
  assert.deepEqual(values(t, 1), ['1', '2', '3']);
  assert.ok(t.notice().includes('Pregunta 1 marcada (3'));
  assert.equal(t.submitted(), 0);
});

test('Auto con huecos dentro del enunciado: marca [HUECO n] y respeta lo ya elegido y las líneas inválidas', async () => {
  const t = setup([gapsel(1)], { handler: () => selectAnswer('1=3\nhueco 2 = 9\nbasura\n2=1') });
  await t.c.show(CSS);
  await t.press();
  assert.ok(t.asks()[0].text.includes('máscara de clase C es [HUECO 1]') && t.asks()[0].text.includes('suele ser [HUECO 2]'));
  assert.deepEqual(values(t, 1), ['3', '1']); // «2=9» no existe y se ignora; la válida «2=1» sí cuenta
  const u = setup([gapsel(1)], { handler: (m, doc) => { doc.querySelector('#question-1 select').value = '1'; return selectAnswer('1=3\n2=2'); } });
  await u.c.show(CSS);
  await u.press();
  assert.deepEqual(values(u, 1), ['1', '2']); // el hueco que elegiste mientras tanto no se pisa
});

test('Auto con desplegables: respuesta sin líneas válidas no marca nada; y el modo guardado del panel no cambia', async () => {
  const t = setup([match(1)], { handler: () => selectAnswer('no sé') });
  await t.c.show(CSS);
  await t.press();
  assert.deepEqual(values(t, 1), ['', '', '']);
  assert.ok(t.notice().includes('ninguna opción'));
  assert.equal(t.calls.filter((m) => m.type === 'AQUA_SET_PREFS' && m.prefs.mode === 'select').length, 0);
});

test('Auto mezcla test y desplegables en orden y salta los ya completos', async () => {
  const t = setup([Q[1](), match(2), gapsel(3)], { handler: (m) => (m.mode === 'select' ? selectAnswer(m.text.includes('máscara') ? '1=3\n2=1' : '1=1\n2=2\n3=3') : answer([2])) });
  await t.c.show(CSS);
  for (let i = 0; i < 4; i++) await t.press();
  assert.equal(t.asks().length, 3); // la 4.ª pulsación no tiene nada pendiente
  assert.deepEqual(t.checked(1), ['1']);
  assert.deepEqual(values(t, 2), ['1', '2', '3']);
  assert.deepEqual(values(t, 3), ['3', '1']);
});

test('Auto: una pregunta sin respuesta válida del modelo se omite y la siguiente pulsación pasa a otra', async () => {
  const t = setup([match(2), Q[1]()], { handler: (m) => (m.mode === 'select' ? selectAnswer('no sé') : answer([2])) });
  await t.c.show(CSS);
  await t.press();
  assert.deepEqual(values(t, 2), ['', '', '']);
  await t.press();
  assert.deepEqual(t.checked(1), ['1']); // pasó a la otra pregunta en vez de repetir la que falló
  assert.equal(t.asks().length, 2);
});

test('Auto: si se usó la clave de reserva, el panel lo avisa', async () => {
  const t = setup([Q[1]()], { handler: () => ({ ...answer([2]), usedBackup: true }) });
  await t.c.show(CSS);
  await t.press();
  assert.ok(t.notice().includes('clave de reserva'));
  assert.deepEqual(t.checked(1), ['1']);
});

const essay = (n, body = '<textarea name="q' + n + '_answer"></textarea>') => `<div id="question-${n}" class="que essay"><div class="info"><span class="qno">${n}</span></div><div class="content"><div class="qtext">Explica qué es DNS</div><div class="answer">${body}</div></div></div>`;
const ordering = (n) => `<div id="question-${n}" class="que ordering"><div class="info"><span class="qno">${n}</span></div><div class="content"><div class="qtext">Ordena los pasos de DHCP</div><div class="answer"><ul class="sortablelist"><li id="i10">Request</li><li id="i11">Discover</li><li id="i12">Ack</li><li id="i13">Offer</li></ul><input type="hidden" name="q${n}_response" value="10,11,12,13"></div></div></div>`;
const textAnswer = (text) => ({ ok: true, requestId: 'x', result: { status: 'confirmed', module: '', selected: [], answerText: text, explanation: '', commands: [], caveats: '', warnings: [] }, redactions: 0 });

test('Auto rellena preguntas de desarrollo (modo corto) solo si el campo está vacío', async () => {
  const t = setup([essay(1), essay(2, '<textarea name="q2_answer">ya escrito</textarea>')], { handler: () => textAnswer('Traduce nombres a IP.') });
  await t.c.show(CSS);
  await t.press();
  assert.equal(t.asks()[0].mode, 'short');
  assert.equal(t.doc.querySelector('textarea[name="q1_answer"]').value, 'Traduce nombres a IP.');
  assert.equal(t.doc.querySelector('textarea[name="q2_answer"]').value, 'ya escrito');
  await t.press();
  assert.equal(t.asks().length, 1); // la 2.ª ya tenía texto: nada que hacer
  assert.equal(t.submitted(), 0);
});

test('Auto ordena listas de «ordenar»: reordena la lista y su campo oculto; respuesta inválida no toca nada', async () => {
  const t = setup([ordering(1)], { handler: () => textAnswer('2,4,1,3') });
  await t.c.show(CSS);
  await t.press();
  assert.equal(t.asks()[0].mode, 'order');
  assert.deepEqual(Array.from(t.doc.querySelectorAll('.sortablelist li')).map((l) => l.textContent), ['Discover', 'Offer', 'Request', 'Ack']);
  assert.equal(t.doc.querySelector('input[type="hidden"]').value, '11,13,10,12');
  await t.press();
  assert.equal(t.asks().length, 1); // una sola vez por pregunta

  const bad = setup([ordering(1)], { handler: () => textAnswer('1,1,2') });
  await bad.c.show(CSS);
  await bad.press();
  assert.deepEqual(Array.from(bad.doc.querySelectorAll('.sortablelist li')).map((l) => l.textContent), ['Request', 'Discover', 'Ack', 'Offer']);
  assert.equal(bad.doc.querySelector('input[type="hidden"]').value, '10,11,12,13');
});

const shortq = (n, cls, extra = '') => `<div id="question-${n}" class="que ${cls}"><div class="info"><span class="qno">${n}</span></div><div class="content"><div class="qtext">¿Puerto de HTTPS?</div><div class="answer"><input type="text" name="q${n}_answer" ${extra}></div></div></div>`;
const cloze = (n) => `<div id="question-${n}" class="que multianswer"><div class="info"><span class="qno">${n}</span></div><div class="content"><div class="qtext">El comando <input type="text" name="q${n}_a"> muestra la ruta y <input type="text" name="q${n}_b"> lista el contenido.</div><div class="answer"></div></div></div>`;

test('Auto rellena respuesta corta y numérica (modo fill), sin pisar lo escrito', async () => {
  const t = setup([shortq(1, 'shortanswer'), shortq(2, 'numerical'), shortq(3, 'shortanswer', 'value="mío"')], { handler: (m) => textAnswer(m.text.includes('numérico') ? '2=puerto 443 TCP' : '1=443') });
  await t.c.show(CSS);
  await t.press();
  assert.equal(t.asks()[0].mode, 'fill');
  assert.equal(t.doc.querySelector('input[name="q1_answer"]').value, '443');
  await t.press();
  assert.equal(t.doc.querySelector('input[name="q2_answer"]').value, '443'); // «2=» no existe en una sola caja: se usa el texto y, al ser numérica, solo el número
  await t.press();
  assert.equal(t.doc.querySelector('input[name="q3_answer"]').value, 'mío');
  assert.equal(t.asks().length, 2);
});

test('Auto rellena huecos de texto (cloze) por número de campo', async () => {
  const t = setup([cloze(1)], { handler: () => textAnswer('1=pwd\n2=ls') });
  await t.c.show(CSS);
  await t.press();
  assert.ok(t.asks()[0].text.includes('[CAMPO 1]') && t.asks()[0].text.includes('[CAMPO 2]'));
  assert.equal(t.doc.querySelector('input[name="q1_a"]').value, 'pwd');
  assert.equal(t.doc.querySelector('input[name="q1_b"]').value, 'ls');
  assert.equal(t.submitted(), 0);
});

// Emparejar de Moodle real: «Elegir...» tiene value "0" (no vacío).
const moodleMatch = (n) => `<div id="question-${n}" class="que match"><div class="info"><span class="qno">${n}</span></div><div class="content"><div class="qtext">Relaciona los registros DNS con su función</div><div class="ablock"><table class="answer"><tbody>${['Traducir nombre a IP', 'Traducir IP a nombre'].map((t, i) => `<tr class="r${i}"><td class="text">${t}</td><td class="control"><select name="q${n}_sub${i}"><option value="0">Elegir...</option><option value="1">A</option><option value="2">PTR</option></select></td></tr>`).join('')}</tbody></table></div></div></div>`;
// Ordenar con la lista fuera de .answer, iconos dentro de los elementos y campo oculto junto a la lista.
const moodleOrder = (n) => `<div id="question-${n}" class="que ordering"><div class="info"><span class="qno">${n}</span></div><div class="content"><div class="qtext">Orden correcto de mensajes DHCP</div><div class="ablock"><ul class="sortablelist"><li class="sortableitem" id="a1"><i class="icon fa fa-bars"></i>DHCP-ACK/NACK</li><li class="sortableitem" id="a2">DHCP-REQUEST</li><li class="sortableitem" id="a3">DHCP-OFFER</li><li class="sortableitem" id="a4">DHCP-DISCOVER</li></ul><input type="hidden" name="q${n}:1_response" value="a1,a2,a3,a4"></div></div></div>`;

test('Auto: emparejar con «Elegir...» de value 0 (Moodle real) se rellena', async () => {
  const t = setup([moodleMatch(1)], { handler: () => textAnswer('1=1\n2=2') });
  await t.c.show(CSS);
  await t.press();
  assert.deepEqual(Array.from(t.doc.querySelectorAll('#question-1 select')).map((s) => s.value), ['1', '2']);
  assert.ok(t.asks()[0].text.includes('Traducir'));
});

test('Auto: ordenar con la estructura de lista fuera de .answer', async () => {
  const t = setup([moodleOrder(1)], { handler: () => textAnswer('4,3,2,1') });
  await t.c.show(CSS);
  await t.press();
  assert.deepEqual(Array.from(t.doc.querySelectorAll('.sortablelist li')).map((l) => l.id), ['a4', 'a3', 'a2', 'a1']);
  assert.equal(t.doc.querySelector('input[type="hidden"]').value, 'a4,a3,a2,a1');
});

test('disparador configurable: otra tecla sustituye al + (que deja de funcionar)', async () => {
  const t = setup([Q[1]()], { trigger: 'key:q' });
  await t.c.show(CSS);
  await t.press();
  assert.equal(t.asks().length, 0);
  await t.press({ key: 'Q' });
  assert.equal(t.asks().length, 1);
  assert.deepEqual(t.checked(1), ['1']);
});

test('disparador clic de rueda: actúa en zonas vacías, bloquea el clic central y respeta enlaces/campos/otros botones', async () => {
  const t = setup([Q[1]()], { trigger: 'mouse:middle' });
  await t.c.show(CSS);
  await t.press(); // la tecla + ya no es el disparador
  assert.equal(t.asks().length, 0);
  t.doc.body.insertAdjacentHTML('beforeend', '<a id="lnk" href="#x">enlace</a><textarea id="ta"></textarea>');
  await t.click({ target: t.doc.getElementById('lnk') });
  await t.click({ target: t.doc.getElementById('ta') });
  await t.click({ button: 0 });
  await t.click({ button: 2 });
  assert.equal(t.asks().length, 0);
  const { down, up } = await t.click();
  assert.equal(t.asks().length, 1);
  assert.equal(down.defaultPrevented && up.defaultPrevented, true);
  assert.deepEqual(t.checked(1), ['1']);
});

test('ajustes: el disparador se sanea (teclas válidas, rueda, resto vuelve a +)', () => {
  const tr = (t) => S.sanitizeSettings({ auto: { enabled: true, trigger: t } }).auto.trigger;
  assert.equal(tr('mouse:middle'), 'mouse:middle');
  assert.equal(tr('key:F8'), 'key:F8');
  assert.equal(tr('key:Q'), 'key:q');
  for (const bad of ['key:', 'key: ', 'key:Enter', 'key:Tab', 'mouse:left', 5, null, 'key:ab']) assert.equal(tr(bad), 'key:+');
});

test('botón «pdf» del panel: activa y desactiva los PDF sin pasar por Ajustes', async () => {
  const t = setup([Q[1]()]);
  await t.c.show(CSS);
  const b = t.doc.getElementById('aqua-host').shadowRoot.querySelector('button.docs');
  assert.equal(b.getAttribute('aria-pressed'), 'false');
  b.click();
  await settle(12);
  assert.deepEqual(t.calls.filter((m) => m.type === 'AQUA_SET_DOCS').map((m) => m.enabled), [true]);
  assert.equal(b.getAttribute('aria-pressed'), 'true');
  await t.press(); // con los PDF activados, la búsqueda local se hace antes de preguntar
  assert.ok(t.calls.some((m) => m.type === 'AQUA_DOCS_SEARCH'));
  b.click();
  await settle(12);
  assert.deepEqual(t.calls.filter((m) => m.type === 'AQUA_SET_DOCS').map((m) => m.enabled), [true, false]);
  assert.equal(b.getAttribute('aria-pressed'), 'false');
});

test('background: AQUA_SET_DOCS solo viene de pestañas, está tras la contraseña y solo cambia docs.enabled', () => {
  const bg = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'background.js'), 'utf8');
  assert.match(bg, /const GATED = \[[^\]]*'AQUA_SET_DOCS'/);
  const h = bg.slice(bg.indexOf("case 'AQUA_SET_DOCS'"), bg.indexOf("case 'AQUA_SET_PREFS'"));
  assert.ok(h.includes('tabId === undefined') && h.includes('msg.enabled === true') && h.includes('...cur.docs'));
});

test('Auto: con «desplazar» apagado la pantalla no se mueve; encendido (por defecto) sí', async () => {
  for (const [scroll, expected] of [[false, 0], [undefined, 1]]) {
    const t = setup([Q[1](), Q[2]()], scroll === false ? { scroll: false } : {});
    await t.c.show(CSS);
    let n = 0;
    t.doc.getElementById('question-2').scrollIntoView = () => { n++; };
    await t.press();
    assert.equal(n, expected);
  }
});

test('Auto: activarlo/desactivarlo desde el popup con el panel abierto se aplica al momento (setAuto)', async () => {
  const t = setup([Q[1]()], { auto: false });
  await t.c.show(CSS);
  await t.press();
  assert.equal(t.asks().length, 0);
  t.c.setAuto({ enabled: true, trigger: 'key:+', scroll: true });
  await t.press();
  assert.equal(t.asks().length, 1);
  t.c.setAuto({ enabled: false });
  await t.press();
  assert.equal(t.asks().length, 1);
});
