const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../src/moodleDetector');
const ex = require('../src/questionExtractor');
const { makeDom, MOODLE_QUIZ_HTML, PLAIN_HTML } = require('../testkit/helpers');

test('página no Moodle no se detecta', () => {
  const dom = makeDom(PLAIN_HTML, 'https://example.com/index.html');
  const r = d.detectMoodle(d.collectSignals(dom.window.document, dom.window.location));
  assert.equal(r.isMoodle, false);
});
test('página Moodle de intento de cuestionario se detecta y se marca en curso', () => {
  const dom = makeDom(MOODLE_QUIZ_HTML);
  const r = d.detectMoodle(d.collectSignals(dom.window.document, dom.window.location));
  assert.equal(r.isMoodle, true);
  assert.equal(r.pageType, 'quiz-attempt');
  assert.equal(r.attemptInProgress, true);
});
test('clasifica páginas de revisión y materiales', () => {
  assert.equal(d.classifyPage('page-mod-quiz-review', ''), 'quiz-review');
  assert.equal(d.classifyPage('page-mod-page-view', ''), 'material');
});
test('extrae preguntas sin leer respuestas marcadas ni valores de campos', () => {
  const dom = makeDom(MOODLE_QUIZ_HTML);
  const qs = ex.extractQuestions(dom.window.document);
  assert.equal(qs.length, 3);
  assert.equal(qs[0].type, 'single');
  assert.deepEqual(qs[0].options, ['80', '443', '22']);
  assert.equal(qs[1].type, 'multi');
  assert.deepEqual(qs[1].options, ['Apache', 'nginx']);
  assert.equal(qs[2].type, 'short');
  const all = JSON.stringify(qs);
  assert.ok(!all.includes('secreto del alumno'));
  assert.ok(!all.includes('checked'));
});
