const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const S = require('../src/settings');
const V = require('../src/answerValidator');
const g = require('../src/geminiClient');
const { createAskService } = require('../src/askService');
const { geminiOk, httpError } = require('../testkit/helpers');

test('enlaces: se rechazan redes internas, TLD internos y URLs con secretos', () => {
  const bad = ['http://100.64.1.1/a', 'https://wiki.corp/x', 'https://a.local/x', 'https://ok.es/p?access_token=abc', 'https://ok.es/p?sesskey=1', 'https://ok.es/#id_token=zz'];
  assert.deepEqual(S.sanitizeWeb({ enabled: true, urls: [...bad, 'https://ok.es/bien'] }).urls, ['https://ok.es/bien']);
});

test('parseModelJson tolera texto alrededor del JSON', () => {
  assert.equal(V.parseModelJson('{"a":1}').a, 1);
  assert.equal(V.parseModelJson('Claro:\n```json\n{"a":2}\n```').a, 2);
});

const web = { enabled: true, search: false, urls: ['https://ok.es/a'] };
const mk = (fetchImpl) => createAskService({
  getConfig: async () => ({ apiKey: 'FAKE_KEY_FOR_TESTS_0123456789', settings: { model: 'gemini-3.8-flash', timeoutMs: 500, maxChars: 6000, web } }),
  gemini: g, fetchImpl, nonce: () => 'abc123',
});
const ask = { type: 'AQUA_ASK', requestId: 'r', mode: 'quiz', text: '¿Puerto de HTTPS?\n1) 80\n2) 443', meta: { type: 'single', optionCount: 2 } };

test('enlaces: si con web la respuesta es inválida, reintenta sin web y lo avisa', async () => {
  const bodies = [];
  let n = 0;
  const r = await mk(async (u, init) => {
    bodies.push(JSON.parse(init.body));
    return n++ === 0 ? geminiOk('esto no es JSON') : geminiOk({ status: 'confirmed', module: 'Servicios de Red e Internet', selected_options: [2], answer_text: '443', explanation: '' });
  }).handleAsk(ask, 1);
  assert.equal(r.ok, true);
  assert.ok(bodies[0].tools && !bodies[1].tools);
  assert.equal(r.web && r.web.downgraded, 'web');
});

test('enlaces: error de esquema/mime se reintenta sin quitar las herramientas', async () => {
  let n = 0;
  const seen = [];
  const r = await g.generate({ apiKey: 'FAKE_KEY_FOR_TESTS_0123456789', model: 'gemini-3.8-flash', userText: 'x', systemPrompt: 's', timeoutMs: 500, tools: [{ url_context: {} }], responseSchema: { type: 'OBJECT' },
    fetchImpl: async (u, init) => { seen.push(JSON.parse(init.body)); return n++ === 0 ? httpError(400, 'Unsupported response mime type with tools') : geminiOk({ status: 'confirmed', answer_text: 'ok' }); } });
  assert.ok(r);
  assert.equal(seen.length, 2);
  assert.ok(seen[1].tools);
});

test('UI: tag "auto: on" y orden de Ajustes', () => {
  const css = fs.readFileSync(__dirname + '/../styles.css', 'utf8');
  assert.match(css, /data-size="xxs"\]\) \.autotag/);
  const html = fs.readFileSync(__dirname + '/../options.html', 'utf8');
  const order = ['key', 'model', 'docs', 'sc', 'cust', 'lang', 'priv'];
  const pos = order.map((k) => html.indexOf(`data-tab="${k}"`));
  assert.ok(pos.every((p) => p >= 0), 'faltan pestañas: ' + pos);
  assert.deepEqual([...pos].sort((a, b) => a - b), pos);
});

test('Ajustes: modelo+IA local y documentos+web comparten pestaña; ya no hay pestañas sueltas', () => {
  const html = fs.readFileSync(__dirname + '/../options.html', 'utf8');
  for (const k of ['local', 'web']) assert.ok(!html.includes(`data-tab="${k}"`));
  const sec = (k) => html.slice(html.indexOf(`id="panel-${k}"`)).split('</section>')[0] + '';
  const panel = (k) => html.slice(html.indexOf(`id="panel-${k}"`), html.indexOf('id="panel-', html.indexOf(`id="panel-${k}"`) + 10));
  assert.ok(panel('model').includes('id="localGrant"') && panel('model').includes('id="model"'));
  assert.ok(panel('docs').includes('id="webSave"') && panel('docs').includes('id="docsList"'));
  assert.ok(sec('key'));
});

test('modo order: el servicio lo acepta y el prompt pide solo la lista de números', async () => {
  let body;
  const r = await mk(async (u, init) => { body = JSON.parse(init.body); return geminiOk({ status: 'confirmed', answer_text: '2,1,3' }); })
    .handleAsk({ ...ask, mode: 'order', text: 'Ordena\n1) a\n2) b\n3) c', meta: { type: 'order', optionCount: 3 } }, 1);
  assert.equal(r.ok, true);
  assert.equal(r.result.answerText, '2,1,3');
  assert.ok(JSON.stringify(body).includes('MODE: order'));
});
