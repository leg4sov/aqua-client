/* Aqua · extracción de preguntas Moodle (solo lectura). No lee respuestas marcadas ni valores de campos. */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});
  const norm = typeof module === 'object' ? require('./textNormalizer') : A.textNormalizer;

  const BLOCK = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'PRE', 'TABLE', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'SECTION', 'ARTICLE']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']);
  const LIMITED_TYPES = ['match', 'multianswer', 'ddwtos', 'gapselect', 'ddimageortext', 'ddmarker', 'calculated'];

  function elementText(node) {
    const ctx = { parts: [], pre: false, images: 0, gaps: 0, fields: 0 };
    (function walk(n) {
      if (n.nodeType === 3) {
        ctx.parts.push(ctx.pre ? n.nodeValue : n.nodeValue.replace(/\s+/g, ' '));
        return;
      }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toUpperCase();
      if (tag === 'SELECT') {
        // Desplegable dentro del enunciado (huecos): se deja una marca numerada, en el mismo orden que selectGaps().
        if (!n.disabled) ctx.parts.push(` [HUECO ${++ctx.gaps}] `);
        return;
      }
      if (tag === 'INPUT' && isTextInput(n)) {
        if (!n.disabled && !n.readOnly) ctx.parts.push(` [CAMPO ${++ctx.fields}] `); // hueco de texto: misma numeración que textInputs()
        return;
      }
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

  function isTextInput(i) {
    const t = (i.getAttribute('type') || 'text').toLowerCase();
    return t === 'text' || t === 'number' || t === 'search';
  }

  /** Cajas de texto editables de una pregunta (respuesta corta, numérica, huecos de texto), en el orden del enunciado y luego de la zona de respuesta. */
  function textInputs(que) {
    const seen = new Set();
    const out = [];
    que.querySelectorAll('.qtext input, .answer input').forEach((i) => {
      if (seen.has(i) || !isTextInput(i) || i.disabled || i.readOnly) return;
      seen.add(i);
      out.push(i);
    });
    return out;
  }

  function detectType(que) {
    const cl = que.classList;
    if (que.querySelector('.answer input[type="checkbox"]')) return 'multi';
    if (que.querySelector('.answer input[type="radio"]')) return 'single';
    if (cl.contains('shortanswer') || cl.contains('numerical')) return 'short';
    if (cl.contains('essay')) return 'open';
    if (textInputs(que).length && !selectGaps(que).length) return textInputs(que).length === 1 && (cl.contains('shortanswer') || cl.contains('numerical')) ? 'short' : 'fill';
    if ((cl.contains('ordering') || que.querySelector('.sortablelist')) && orderItems(que).length >= 2) return 'order';
    return 'other';
  }

  const MAX_TEXT_FIELDS = 12;
  const MAX_ORDER_ITEMS = 20;

  /** Elementos de una pregunta de ordenar (lista arrastrable): <li> en el orden actual de la página. */
  function orderItems(que) {
    const list = que.querySelector('.sortablelist') || Array.from(que.querySelectorAll('.ablock ul, .answer ul, .ablock ol, .answer ol')).find((l) => !l.closest('.qtext, .feedback, .specificfeedback, .outcome'));
    if (!list) return [];
    const items = Array.from(list.children).filter((li) => li.tagName === 'LI').map((el) => ({ el, text: elementText(el).text })).filter((i) => i.text);
    return items.length <= MAX_ORDER_ITEMS ? items : [];
  }

  /** Campo de texto de una pregunta abierta: textarea y/o editor enriquecido (contenteditable). */
  function essayField(que) {
    const ta = que.querySelector('.answer textarea');
    let ed = que.querySelector('.answer [contenteditable="true"]');
    if (!ed) {
      // TinyMCE: el editor vive en un iframe del mismo origen
      for (const f of que.querySelectorAll('.answer iframe')) {
        try {
          const b = f.contentDocument && f.contentDocument.body;
          if (b && (b.isContentEditable || b.getAttribute('contenteditable') === 'true')) { ed = b; break; }
        } catch (_) { /* iframe de otro origen: no se toca */ }
      }
    }
    return ta || ed ? { ta, ed } : null;
  }

  /** Pregunta abierta con campo editable y vacío. */
  function isEssayEmpty(que) {
    const f = essayField(que);
    if (!f || (f.ta && (f.ta.disabled || f.ta.readOnly))) return false;
    return (!f.ta || f.ta.value.trim() === '') && (!f.ed || f.ed.textContent.trim() === '');
  }

  // Opciones con su <input>, en el mismo orden y con el mismo filtro que se envía a Gemini (el índice i = opción i+1).
  function optionEntries(que) {
    const out = [];
    que.querySelectorAll('.answer input[type="radio"], .answer input[type="checkbox"]').forEach((input) => {
      if (input.value === '-1') return; // "Borrar mi elección"
      const container = input.closest('div.r0, div.r1, .answer > div, li') || input.parentElement;
      if (!container) return;
      const clone = container.cloneNode(true);
      clone.querySelectorAll('.answernumber, input, .feedback, .specificfeedback').forEach((x) => x.remove());
      const { text } = elementText(clone);
      if (text) out.push({ input, text });
    });
    return out;
  }

  function extractOptions(que) {
    return optionEntries(que).map((e) => e.text);
  }

  /** ¿Tiene ya una opción marcada? (la opción oculta «Borrar mi elección», value -1, no cuenta). */
  function isAnswered(que) {
    const marked = Array.from(que.querySelectorAll('.answer input[type="radio"], .answer input[type="checkbox"]')).some((i) => i.checked && i.value !== '-1');
    return marked || Array.from(que.querySelectorAll('.qtext select, .answer select')).some((s) => !s.disabled && !selectEmpty(s));
  }

  const MAX_GAP_OPTIONS = 20;

  // «Elegir...»: value "" (huecos) o "0" como primera opción (emparejar de Moodle).
  const isPlaceholder = (select, o) => o.value === '' || (o.value === '0' && o === select.options[0]);
  const selectEmpty = (select) => !select.value || select.value === '' || (select.value === '0' && select.options[0] && select.options[0].value === '0');

  /** Desplegables de una pregunta (emparejar, huecos con lista…): select + etiqueta + opciones reales (sin «Elegir...»). */
  function selectGaps(que) {
    const gaps = [];
    que.querySelectorAll('.qtext select, .answer select').forEach((select) => {
      if (select.disabled) return;
      const options = Array.from(select.options).filter((o) => !isPlaceholder(select, o) && !o.disabled);
      if (options.length < 2) return;
      let label = '';
      if (!select.closest('.qtext')) {
        const row = select.closest('tr, li, .r0, .r1');
        if (row) {
          const clone = row.cloneNode(true);
          clone.querySelectorAll('select').forEach((x) => x.remove());
          label = elementText(clone).text.replace(/\s+/g, ' ').slice(0, 120);
        }
      }
      gaps.push({ select, label, options: options.map((o) => ({ value: o.value, text: norm.normalizeText(o.textContent) })) });
    });
    return gaps;
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
      let type = detectType(que);
      const gaps = type === 'other' ? selectGaps(que) : [];
      if (gaps.length && gaps.length <= 30 && gaps.every((g) => g.options.length <= MAX_GAP_OPTIONS)) type = 'select';
      const qno = que.querySelector('.qno');
      out.push({
        id: que.id || '',
        number: qno ? norm.normalizeText(qno.textContent) : String(out.length + 1),
        type,
        text,
        ...(type === 'short' || type === 'fill' ? { fields: textInputs(que).length, numeric: que.classList.contains('numerical') } : {}),
        ...(type === 'order' ? { items: orderItems(que).map((i) => i.text) } : {}),
        options: type === 'single' || type === 'multi' ? extractOptions(que) : [],
        imageCount: images,
        // Con desplegables Aqua sí sabe responder; sigue siendo «limitado» si además hay campos de texto o arrastrar y soltar.
        limited: LIMITED_TYPES.some((t) => que.classList.contains(t)) && !(type === 'select' && !que.querySelector('.qtext input[type="text"], .answer input[type="text"]')),
        ...(type === 'select' ? { gaps: gaps.map((g) => ({ label: g.label, options: g.options.map((o) => o.text) })) } : {}),
      });
    }
    return out;
  }

  const TYPE_LABEL = {
    single: 'Opción única (una sola respuesta correcta)',
    multi: 'Opción múltiple (puede haber una o varias respuestas correctas)',
    short: 'Respuesta corta',
    open: 'Respuesta abierta',
    fill: 'Huecos de texto (hay que escribir el texto exacto de cada hueco)',
    order: 'Ordenar (hay que colocar los elementos en el orden correcto, de arriba abajo, o en el que indique el enunciado)',
    select: 'Desplegables (cada hueco tiene su propia lista de opciones numeradas; hay que elegir UNA opción por hueco)',
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
    if (q.fields) lines.push(`Campos de texto: ${q.fields} (${q.numeric ? 'numérico: escribe solo el número; ' : ''}en el enunciado aparecen como [CAMPO n]; si no aparecen, es una sola caja de respuesta)`);
    if (q.items && q.items.length) {
      lines.push('Elementos a ordenar (numerados, en el orden actual de la página):');
      q.items.forEach((o, i) => lines.push(`${i + 1}) ${o}`));
    }
    if (q.gaps && q.gaps.length) {
      lines.push('Huecos:');
      q.gaps.forEach((g, i) => lines.push(`HUECO ${i + 1}${g.label ? ` (${g.label})` : ''}: ${g.options.map((o, j) => `${j + 1}) ${o}`).join('  ')}`));
    }
    return lines.join('\n');
  }

  const api = { elementText, extractQuestions, formatQuestion, letter, TYPE_LABEL, optionEntries, isAnswered, selectGaps, selectEmpty, orderItems, essayField, isEssayEmpty, textInputs, MAX_TEXT_FIELDS, MAX_GAP_OPTIONS };
  A.questionExtractor = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
