const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../src/geminiClient');
const { geminiOk, httpError } = require('../testkit/helpers');

const base = { apiKey: 'FAKE_KEY_FOR_TESTS_0123456789', model: 'gemini-3.8-flash', userText: 'hola', systemPrompt: 'sys', timeoutMs: 500 };

test('endpoint y petición: v1beta, clave solo en cabecera, systemInstruction, sin credenciales', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return geminiOk({ status: 'confirmed', answer_text: 'ok' });
  };
  const r = await g.generate({ ...base, fetchImpl, responseSchema: { type: 'OBJECT' } });
  assert.equal(seen.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.ok(!seen.url.includes(base.apiKey));
  assert.equal(seen.init.headers['x-goog-api-key'], base.apiKey);
  assert.equal(seen.init.credentials, 'omit');
  const body = JSON.parse(seen.init.body);
  assert.equal(body.systemInstruction.parts[0].text, 'sys');
  assert.equal(body.contents[0].parts[0].text, 'hola');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.ok(r.text.includes('confirmed'));
});
test('nombre de modelo inválido (inyección de ruta) se rechaza', () => {
  assert.throws(() => g.buildEndpoint('../x?key=1'), { code: 'INVALID_INPUT' });
  assert.equal(g.buildEndpoint('models/gemini-3.5-flash-lite').endsWith('/models/gemini-3.5-flash-lite:generateContent'), true);
});
test('sin clave o sin texto', async () => {
  await assert.rejects(g.generate({ ...base, apiKey: '', fetchImpl: async () => {} }), { code: 'NO_API_KEY' });
  await assert.rejects(g.generate({ ...base, userText: '  ', fetchImpl: async () => {} }), { code: 'EMPTY_TEXT' });
});
test('error de red', async () => {
  await assert.rejects(g.generate({ ...base, fetchImpl: async () => { throw new TypeError('fetch failed'); } }), { code: 'NETWORK' });
});
for (const [status, msg, apiStatus, code] of [
  [429, 'Quota exceeded', 'RESOURCE_EXHAUSTED', 'QUOTA'],
  [403, 'denied', 'PERMISSION_DENIED', 'AUTH'],
  [400, 'API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT', 'AUTH'],
  [400, 'bad field', 'INVALID_ARGUMENT', 'BAD_REQUEST'],
  [404, 'model not found', 'NOT_FOUND', 'MODEL_NOT_FOUND'],
  [503, 'overloaded', 'UNAVAILABLE', 'SERVER'],
]) {
  test(`HTTP ${status} (${code})`, async () => {
    await assert.rejects(g.generate({ ...base, fetchImpl: async () => httpError(status, msg, apiStatus) }), { code });
  });
}
test('mensajes de error no filtran la clave', async () => {
  try {
    await g.generate({ ...base, fetchImpl: async () => httpError(400, 'bad ?key=AIzaSyA1234567890abcdefghijklmnopqrstuv', 'X') });
    assert.fail();
  } catch (e) {
    assert.ok(!e.detail.includes('AIzaSyA1234'));
  }
});
test('respuesta vacía, sin candidatos, bloqueada y truncada', async () => {
  const mk = (json) => async () => ({ ok: true, status: 200, json: async () => json });
  await assert.rejects(g.generate({ ...base, fetchImpl: mk({}) }), { code: 'EMPTY_RESPONSE' });
  await assert.rejects(g.generate({ ...base, fetchImpl: mk({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '' }] } }] }) }), { code: 'EMPTY_RESPONSE' });
  await assert.rejects(g.generate({ ...base, fetchImpl: mk({ promptFeedback: { blockReason: 'SAFETY' } }) }), { code: 'BLOCKED' });
  await assert.rejects(g.generate({ ...base, fetchImpl: mk({ candidates: [{ finishReason: 'SAFETY' }] }) }), { code: 'BLOCKED' });
  await assert.rejects(g.generate({ ...base, fetchImpl: mk({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] }) }), { code: 'TRUNCATED' });
});
test('cuerpo no JSON en respuesta 200', async () => {
  await assert.rejects(g.generate({ ...base, fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }) }), { code: 'INVALID_RESPONSE' });
});
test('se ignoran las partes de razonamiento (thought)', async () => {
  const r = await g.generate({ ...base, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'pensando', thought: true }, { text: 'respuesta' }] } }] }) }) });
  assert.equal(r.text, 'respuesta');
});
test('timeout', async () => {
  const fetchImpl = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))));
  await assert.rejects(g.generate({ ...base, timeoutMs: 30, fetchImpl }), { code: 'TIMEOUT' });
});
test('cancelación con AbortSignal', async () => {
  const fetchImpl = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))));
  const ac = new AbortController();
  const p = g.generate({ ...base, timeoutMs: 5000, fetchImpl, signal: ac.signal });
  setTimeout(() => ac.abort(), 10);
  await assert.rejects(p, { code: 'CANCELLED' });
});
test('si la API rechaza el esquema, reintenta una vez sin esquema', async () => {
  const bodies = [];
  const fetchImpl = async (u, init) => {
    bodies.push(JSON.parse(init.body));
    return bodies.length === 1 ? httpError(400, 'Invalid JSON payload: response_schema unknown', 'INVALID_ARGUMENT') : geminiOk('{"status":"confirmed","answer_text":"x"}');
  };
  const r = await g.generate({ ...base, fetchImpl, responseSchema: { type: 'OBJECT' } });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].generationConfig.responseSchema, undefined);
  assert.ok(r.text);
});
