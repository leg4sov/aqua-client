/* Aqua · extracción de preguntas Moodle (solo lectura). No lee respuestas marcadas ni valores de campos. */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});
  const norm = typeof module === 'object' ? require('./textNormalizer') : A.textNormalizer;

  const BLOCK = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'PRE', 'TABLE', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'SECTION', 'ARTICLE']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']);
  const LIMITED_TYPES = ['match', 'multianswer', 'ddwtos', 'gapselect', 'ddimageortext', 'ddmarker', 'calculated'];

  function elementText(node) {
    const ctx = { parts: [], pre: false, images: 0 };
    (function walk(n) {
      if (n.nodeType === 3) {
        ctx.parts.push(ctx.pre ? n.nodeValue : n.nodeValue.replace(/\s+/g, ' '));
        return;
      }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toUpperCase();
      if (SKIP.has(tag)) return;
      if (tag === 'IMG') {
        const alt = (n.getAttribute('alt') || '').trim();
        ctx.parts.push(alt ? ` [imagen: ${alt}] ` : ' [imagen] ');
        ctx.images++;
        return;
      }
      if (tag === 'BR') {
        ctx.parts.push('\n');
        return;
      }
      const block = BLOCK.has(tag);
      if (block) ctx.parts.push('\n');
      const was = ctx.pre;
      if (tag === 'PRE') ctx.pre = true;
      for (const c of n.childNodes) walk(c);
      ctx.pre = was;
      if (block) ctx.parts.push('\n');
    })(node);
    return { text: norm.normalizeText(ctx.parts.join('')), images: ctx.images };
  }

  function detectType(que) {
    const cl = que.classList;
    if (que.querySelector('.answer input[type="checkbox"]')) return 'multi';
    if (que.querySelector('.answer input[type="radio"]')) return 'single';
    if (cl.contains('shortanswer') || cl.contains('numerical')) return 'short';
    if (cl.contains('essay')) return 'open';
    return 'other';
  }

  function extractOptions(que) {
    const opts = [];
    que.querySelectorAll('.answer input[type="radio"], .answer input[type="checkbox"]').forEach((input) => {
      if (input.value === '-1') return; // "Borrar mi elección"
      const container = input.closest('div.r0, div.r1, .answer > div, li') || input.parentElement;
      if (!container) return;
      const clone = container.cloneNode(true);
      clone.querySelectorAll('.answernumber, input, .feedback, .specificfeedback').forEach((x) => x.remove());
      const { text } = elementText(clone);
      if (text) opts.push(text);
    });
    return opts;
  }

  function extractQuestions(root, opts) {
    const max = (opts && opts.maxQuestions) || 100;
    const out = [];
    const nodes = root.querySelectorAll('.que');
    for (const que of Array.from(nodes).slice(0, max)) {
      const qtext = que.querySelector('.qtext');
      if (!qtext) continue;
      const { text, images } = elementText(qtext);
      if (!text) continue;
      const type = detectType(que);
      const qno = que.querySelector('.qno');
      out.push({
        id: que.id || '',
        number: qno ? norm.normalizeText(qno.textContent) : String(out.length + 1),
        type,
        text,
        options: type === 'single' || type === 'multi' ? extractOptions(que) : [],
        imageCount: images,
        limited: LIMITED_TYPES.some((t) => que.classList.contains(t)),
      });
    }
    return out;
  }

  const TYPE_LABEL = {
    single: 'Opción única (una sola respuesta correcta)',
    multi: 'Opción múltiple (puede haber una o varias respuestas correctas)',
    short: 'Respuesta corta',
    open: 'Respuesta abierta',
    other: 'Otro tipo de pregunta',
    free: 'Texto libre seleccionado por el usuario',
  };

  function letter(i) {
    return String.fromCharCode(65 + i);
  }

  function formatQuestion(q) {
    const lines = [`Tipo: ${TYPE_LABEL[q.type] || TYPE_LABEL.other}`, 'Enunciado:', q.text];
    if (q.options && q.options.length) {
      lines.push('Opciones (numeradas):');
      q.options.forEach((o, i) => lines.push(`${i + 1}) ${o}`));
    }
    return lines.join('\n');
  }

  const api = { elementText, extractQuestions, formatQuestion, letter, TYPE_LABEL };
  A.questionExtractor = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
