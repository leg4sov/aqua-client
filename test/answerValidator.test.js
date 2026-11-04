const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../src/answerValidator');

test('parseModelJson acepta JSON y JSON con vallas de código', () => {
  assert.deepEqual(v.parseModelJson('{"a":1}'), { a: 1 });
  assert.deepEqual(v.parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
});
test('parseModelJson rechaza texto no JSON y arrays', () => {
  assert.throws(() => v.parseModelJson('hola'), { code: 'INVALID_RESPONSE' });
  assert.throws(() => v.parseModelJson('[1]'), { code: 'INVALID_RESPONSE' });
});
test('validateAnswer filtra opciones fuera de rango y duplicadas', () => {
  const r = v.validateAnswer({ status: 'confirmed', selected_options: [2, 2, 9, '1'], answer_text: 'x' }, { type: 'multi', optionCount: 3 });
  assert.deepEqual(r.selected, [2]);
  assert.ok(r.warnings.includes('opciones_fuera_de_rango'));
});
test('estado desconocido pasa a insufficient_data; varias opciones en única avisa', () => {
  const r = v.validateAnswer({ status: 'seguro', selected_options: [1, 2], answer_text: 'x' }, { type: 'single', optionCount: 3 });
  assert.equal(r.status, 'insufficient_data');
  assert.ok(r.warnings.includes('varias_opciones_en_pregunta_unica'));
});
test('respuesta sin contenido útil lanza EMPTY_RESPONSE', () => {
  assert.throws(() => v.validateAnswer({ status: 'confirmed' }, { type: 'free', optionCount: 0 }), { code: 'EMPTY_RESPONSE' });
});
test('limita longitud y número de comandos y no ejecuta nada', () => {
  const cmds = Array.from({ length: 20 }, (_, i) => ({ command: `echo ${i}` }));
  const r = v.validateAnswer({ status: 'hypothesis', answer_text: 'x'.repeat(5000), commands: cmds }, { type: 'free', optionCount: 0 });
  assert.equal(r.answerText.length, 2000);
  assert.equal(r.commands.length, 8);
});
