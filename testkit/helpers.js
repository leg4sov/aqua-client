const { JSDOM } = require('jsdom');

const MOODLE_QUIZ_HTML = `<!doctype html><html><head>
<script src="https://campus.example/lib/javascript.php/1/lib/requirejs.php"></script>
<link rel="stylesheet" href="https://campus.example/theme/styles.php/boost/1/all">
</head><body id="page-mod-quiz-attempt" class="path-mod path-mod-quiz pagelayout-incourse format-topics">
<div class="que multichoice"><div class="info"><h3 class="no">Pregunta <span class="qno">1</span></h3></div>
<div class="content"><div class="formulation"><div class="qtext"><p>¿Qué puerto usa HTTPS por defecto?</p></div>
<div class="answer">
<div class="r0"><input type="radio" name="q1" value="0" id="a0"><div class="d-flex"><span class="answernumber">a. </span><div class="flex-fill ml-1">80</div></div></div>
<div class="r1"><input type="radio" name="q1" value="1" id="a1" checked><div class="d-flex"><span class="answernumber">b. </span><div class="flex-fill ml-1">443</div></div></div>
<div class="r0"><input type="radio" name="q1" value="2" id="a2"><div class="d-flex"><span class="answernumber">c. </span><div class="flex-fill ml-1">22</div></div></div>
</div></div></div></div>
<div class="que multichoice"><div class="info"><span class="qno">2</span></div><div class="content"><div class="qtext">Servicios web (elige varios)</div>
<div class="answer"><div class="r0"><input type="checkbox" id="c0"><div class="flex-fill">Apache</div></div><div class="r1"><input type="checkbox" id="c1"><div class="flex-fill">nginx</div></div></div></div></div>
<div class="que shortanswer"><div class="info"><span class="qno">3</span></div><div class="content"><div class="qtext">Comando para ver la IP en Linux</div><input type="text" name="q3" value="secreto del alumno"></div></div>
<form id="responseform"><button id="submit">Terminar</button></form>
</body></html>`;

const PLAIN_HTML = '<!doctype html><html><head></head><body><p>Hola</p></body></html>';

function makeDom(html, url, opts) {
  return new JSDOM(html, { url: url || 'https://campus.example/mod/quiz/attempt.php?attempt=1', ...(opts || {}) });
}

const tick = () => new Promise((r) => setImmediate(r));
async function settle(n = 6) {
  for (let i = 0; i < n; i++) await tick();
}

function button(root, text) {
  return [...root.querySelectorAll('button')].find((b) => b.textContent === text);
}

function geminiOk(obj) {
  return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] }) };
}
function httpError(status, message, apiStatus) {
  return { ok: false, status, json: async () => ({ error: { code: status, message, status: apiStatus } }) };
}

module.exports = { makeDom, MOODLE_QUIZ_HTML, PLAIN_HTML, tick, settle, button, geminiOk, httpError };
