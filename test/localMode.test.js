const test = require('node:test');
const assert = require('node:assert/strict');
const local = require('../src/localClient');
const S = require('../src/settings');
const { createAskService } = require('../src/askService');
const gemini = require('../src/geminiClient');

const ok = (content, finish = 'stop') => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: finish, message: { content } }] }) });
const err = (status) => ({ ok: false, status, json: async () => ({ error: { message: 'x' } }) });
const base = { url: 'http://localhost:23517', model: 'qwen3.5:4b', userText: 'hola', timeoutMs: 2000 };

test('localClient: endpoint OpenAI, sin modo pensar, esquema en JSON Schema estándar', async () => {
  let url, body;
  const r = await local.generate({ ...base, systemPrompt: 'sys', responseSchema: { type: 'OBJECT', properties: { a: { type: 'ARRAY', items: { type: 'INTEGER' } } } }, fetchImpl: async (u, i) => { url = u; body = JSON.parse(i.body); return ok('<think>bla</think>{"a":[1]}'); } });
  assert.equal(url, 'http://localhost:23517/v1/chat/completions');
  assert.deepEqual(body.messages.map((m) => m.role), ['system', 'user']);
  assert.equal(body.think, false);
  assert.equal(body.chat_template_kwargs.enable_thinking, false);
  assert.equal(body.response_format.json_schema.schema.type, 'object');
  assert.equal(body.response_format.json_schema.schema.properties.a.items.type, 'integer');
  assert.equal(r.text, '{"a":[1]}'); // se quita el razonamiento
});

test('localClient: servidor apagado, prohibido, sin esquema, truncado y tiempo agotado', async () => {
  const code = (p) => p.then(() => 'ok', (e) => e.code);
  assert.equal(await code(local.generate({ ...base, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } })), 'LOCAL_OFFLINE');
  assert.equal(await code(local.generate({ ...base, fetchImpl: async () => err(403) })), 'LOCAL_FORBIDDEN');
  assert.equal(await code(local.generate({ ...base, fetchImpl: async () => ok('', 'length') })), 'TRUNCATED');
  const calls = [];
  const r = await local.generate({ ...base, responseSchema: { type: 'OBJECT' }, fetchImpl: async (u, i) => { calls.push(JSON.parse(i.body)); return calls.length === 1 ? err(400) : ok('{}'); } });
  assert.equal(r.text, '{}');
  assert.ok(calls[0].response_format && !calls[1].response_format); // reintenta sin esquema
  const slow = (u, i) => new Promise((_, rej) => i.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))));
  assert.equal(await code(local.generate({ ...base, timeoutMs: 20, fetchImpl: slow })), 'TIMEOUT');
});

test('settings: proveedor gemini por defecto; la IA local solo acepta direcciones de este equipo', () => {
  const s = S.sanitizeSettings({});
  assert.equal(s.provider, 'gemini');
  assert.deepEqual(s.local, { url: 'http://localhost:23517', model: 'qwen3.5:4b', timeoutMs: 90000 });
  assert.equal(S.cleanLocalUrl('http://127.0.0.1:8080/v1/'), 'http://127.0.0.1:8080');
  for (const bad of ['http://192.168.1.5:8080', 'https://evil.example', 'file:///etc', 'http://user:pw@localhost:1']) assert.equal(S.cleanLocalUrl(bad), null, bad);
  assert.equal(S.sanitizeSettings({ provider: 'otro' }).provider, 'gemini');
  assert.equal(S.sanitizeLocal({ timeoutMs: 999999999 }).timeoutMs, 300000);
});

test('askService en local: sin clave, usa el servidor local, sin herramientas web y sin modo imagen', async () => {
  let url, body;
  const settings = S.sanitizeSettings({ provider: 'local', web: { enabled: true, urls: ['https://x.example/a'] } });
  const svc = createAskService({ getConfig: async () => ({ apiKey: '', settings }), gemini, local, nonce: () => 'n1', fetchImpl: async (u, i) => { url = u; body = JSON.parse(i.body); return ok(JSON.stringify({ status: 'confirmed', selected_options: [2], answer_text: '' })); } });
  const r = await svc.handleAsk({ requestId: 'r1', mode: 'quiz', text: '¿HTTPS?\n1) 80\n2) 443', meta: { type: 'single', optionCount: 2 } }, 1);
  assert.equal(r.ok, true);
  assert.deepEqual(r.result.selected, [2]);
  assert.equal(r.provider, 'local');
  assert.equal(r.refs, 0); // el panel avisará de que no hay PDF
  assert.ok(url.startsWith('http://localhost:23517/'));
  assert.equal(body.temperature, 0.1);
  assert.ok(!body.messages[1].content.includes('WEB REFERENCES'));
  const img = await svc.handleAsk({ requestId: 'r2', mode: 'image', image: { mime: 'image/png', data: 'AAAA' }, meta: { type: 'other', optionCount: 0 } }, 1);
  assert.equal(img.error.code, 'INVALID_INPUT');
});
