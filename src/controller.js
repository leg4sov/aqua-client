/* Aqua · controlador del content script: une detección, extracción, UI y mensajería. */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});
  const isNode = typeof module === 'object';
  const detector = isNode ? require('./moodleDetector') : A.moodleDetector;
  const extractor = isNode ? require('./questionExtractor') : A.questionExtractor;
  const norm = isNode ? require('./textNormalizer') : A.textNormalizer;
  const ui = isNode ? require('./ui') : A.ui;
  const imageUtil = isNode ? require('./imageUtil') : A.imageUtil;
  const errors = isNode ? require('./errors') : A.errors;
  const i18n = isNode ? require('./i18n') : A.i18n;

  /**
   * @param {{window:Window, document:Document, send:(msg:object)=>Promise<any>, openSettings:()=>void}} env
   */
  function createController(env) {
    const doc = env.document;
    const win = env.window;
    let panel = null;
    let page = null;
    let state = { provider: 'gemini', hasKey: false, maxChars: norm.DEFAULT_MAX_CHARS, ui: null, lang: i18n.DEFAULT_LANG, idle: { enabled: true, seconds: 5 }, docs: { enabled: false, k: 4, imageSearch: false }, auto: { enabled: false } };
    let panelLang = null;
    const T = (k, p) => i18n.t(state.lang, k, p);
    const msg = (code) => errors.messageFor(code, state.lang);
    let payload = null; // {text, meta, options}
    let image = null; // imagen pegada (modo Imagen): {mime, data} ya reducida; solo en memoria
    let questions = [];
    let currentRequest = null;
    let seq = 0;
    let usedBackup = false; // la última respuesta salió con la clave de reserva

    function setState(s, text) {
      panel.setStatus(s, text);
    }

    function fail(code, extra) {
      setState('error');
      panel.setNotice(msg(code) + (extra || ''), 'error');
      panel.setBusy(false);
    }

    async function copy(text, fallbackArea) {
      try {
        if (win.navigator.clipboard && win.navigator.clipboard.writeText) {
          await win.navigator.clipboard.writeText(text);
          return true;
        }
      } catch (_) {
        /* usa el método de reserva */
      }
      try {
        fallbackArea.value = text;
        fallbackArea.select();
        return !!doc.execCommand && doc.execCommand('copy');
      } catch (_) {
        return false;
      }
    }

    // Vista previa = lo que se enviará: la pregunta y, si hay, los fragmentos de PDF (ya redactados).
    function previewOf(p) {
      if (!p.refs || !p.refs.length) return p.text;
      return `${p.text}\n\n— ${T('ctl.pdfHeader', { n: p.refs.length })} —\n${p.refs.map((h, i) => `[${i + 1}] p.${h.page}: ${h.text}`).join('\n')}`;
    }

    function setPayload(text, meta, options, note, number, queryText) {
      const prepared = norm.prepareForSending(text, { maxChars: state.maxChars });
      payload = null;
      panel.clearResult();
      if (!prepared.ok) {
        panel.setPreview('');
        fail(prepared.code, prepared.code === 'TOO_LONG' ? T('ctl.tooLong', { length: prepared.length, max: prepared.maxChars }) : '');
        return false;
      }
      payload = { text: prepared.text, meta, options, number: number === undefined ? '' : String(number).slice(0, 8) };
      const red = norm.countRedactions(prepared.redactions);
      panel.setNotice(red ? T('ctl.redacted', { n: red }) : '', 'info');
      panel.setPreview(prepared.text, note);
      if (state.docs && state.docs.enabled && queryText) {
        // Búsqueda local en los PDF del usuario (sin red); si hay coincidencias se muestran en «Texto enviado».
        const cur = payload;
        cur.refs = [];
        cur.refsReady = env
          .send({ type: 'AQUA_DOCS_SEARCH', query: queryText })
          .then((res) => {
            if (payload !== cur || !res || !res.ok || !Array.isArray(res.hits)) return;
            cur.refs = res.hits.slice(0, 8);
            if (cur.refs.length) panel.setPreview(previewOf(cur), note);
          })
          .catch(() => {});
      }
      setState('idle');
      return true;
    }

    // Modo Imagen: la imagen se reduce aquí, se queda solo en memoria y no se muestra.
    async function pasteImage(file) {
      image = null;
      panel.setImageState('none');
      panel.clearResult();
      if (!file) return panel.setNotice(T('ctl.noImage'), 'info');
      panel.setNotice('', 'info');
      panel.setImageState('loading');
      try {
        image = await (env.prepareImage || ((f) => imageUtil.prepare(f, win)))(file);
        panel.setImageState('ready');
      } catch (e) {
        panel.setImageState('none');
        fail(e && e.code ? e.code : 'IMAGE_INVALID');
      }
    }

    function useSelection() {
      const sel = win.getSelection ? win.getSelection().toString() : '';
      setPayload(sel, { type: 'free', optionCount: 0 }, [], `${T('ctl.selNote')}:`, undefined, sel);
    }

    function detectQuestions() {
      questions = extractor.extractQuestions(doc);
      panel.setQuestions(questions);
      panel.clearResult();
      if (!questions.length) {
        panel.setNotice(T('ctl.noQuestions'), 'info');
      } else {
        panel.setNotice(T('ctl.detected', { n: questions.length }), 'info');
      }
    }

    function pickQuestion(i) {
      const q = questions[i];
      if (!q) return;
      const gapOpts = q.gaps ? q.gaps.flatMap((g) => g.options) : [];
      const items = q.items || [];
      const optionCount = q.gaps ? Math.max(0, ...q.gaps.map((g) => g.options.length)) : q.items ? q.items.length : q.options.length;
      const ok = setPayload(extractor.formatQuestion(q), { type: q.type, optionCount }, q.options, `${T('ctl.qNote', { n: q.number })}:`, q.number, `${q.text}\n${q.options.concat(gapOpts, items).join('\n')}`);
      if (ok) {
        panel.setMode(q.options.length ? 'quiz' : q.type === 'short' ? 'short' : 'long'); // sugerencia automática; se puede cambiar
        const warn = [];
        if (q.imageCount) warn.push(T('ctl.imgWarn'));
        if (q.limited) warn.push(T('ctl.limitedWarn'));
        if (warn.length) panel.setNotice(warn.join(' '), 'warn');
      }
    }

    function toView(res, mode, number) {
      const r = res.result;
      if (mode === 'quiz') {
        return { kind: 'quiz', number, confidence: r.status, letters: r.selected.map((n) => extractor.letter(n - 1)), warnings: shortWarnings(r.warnings) };
      }
      return { kind: 'text', confidence: r.status, answerText: r.answerText, commands: r.commands, caveats: r.caveats, warnings: [] }; // texto corto, largo o de imagen
    }

    function shortWarnings(ws) {
      const text = {
        opciones_fuera_de_rango: T('ctl.warnRange'),
        varias_opciones_en_pregunta_unica: T('ctl.warnMulti'),
      };
      return ws.map((w) => text[w]).filter(Boolean);
    }

    async function ask(opts) {
      if (currentRequest) return;
      const mode = (opts && opts.mode) || panel.getMode(); // 'select', 'order' y 'short' (desarrollo) los pide el modo Auto
      if (mode === 'image') {
        if (!image) return panel.setNotice(T('ctl.noImageYet'), 'warn');
      } else {
        if (!payload) return fail('EMPTY_TEXT');
        if (mode === 'quiz' && payload.meta.optionCount === 0) return fail('MODE_MISMATCH');
      }
      if (!state.hasKey && state.provider !== 'local') return fail('NO_API_KEY'); // la IA local no usa clave
      const requestId = `r${Date.now().toString(36)}${++seq}`;
      const cur = mode === 'image' ? { text: '', meta: { type: 'other', optionCount: 0 }, refs: [], image } : payload; // se fija ahora: si eliges otra pregunta mientras espera, no se mezclan
      const number = cur.number;
      currentRequest = requestId;
      panel.clearResult();
      panel.setNotice('', 'info');
      panel.setBusy(true);
      setState('processing');
      let res;
      try {
        if (cur.refsReady) await cur.refsReady; // la búsqueda local en PDF es casi instantánea
        if (currentRequest !== requestId) return;
        if (mode === 'image' && state.docs && state.docs.enabled && state.docs.imageSearch) {
          // Opcional: Gemini lee la pregunta de la imagen y se buscan fragmentos en los PDF del usuario. Si falla, se sigue sin PDF.
          const rd = await env.send({ type: 'AQUA_IMG_READ', requestId, image: cur.image }).catch(() => null);
          if (currentRequest !== requestId) return;
          if (rd && !rd.ok && rd.error && rd.error.code === 'CANCELLED') res = rd;
          else if (rd && rd.ok && Array.isArray(rd.hits) && rd.hits.length) {
            cur.refs = rd.hits.slice(0, 8);
            panel.setPreview(previewOf({ text: rd.text || '', refs: cur.refs }), T('ctl.imgNote'));
          }
        }
        if (!res) res = await env.send({ type: 'AQUA_ASK', requestId, text: cur.text, meta: cur.meta, mode, image: mode === 'image' ? cur.image : undefined, refIds: (cur.refs || []).map((h) => h.id) });
      } catch (_) {
        res = { ok: false, error: { code: 'NETWORK' } };
      }
      if (currentRequest !== requestId) return; // cancelada u oculta mientras tanto
      currentRequest = null;
      panel.setBusy(false);
      if (res && res.ok) {
        try {
          panel.setResult(toView(res, mode, number));
          if (mode === 'image') {
            image = null; // para no reenviar por error una imagen antigua
            panel.setImageState('none');
          }
          setState('done');
          usedBackup = !!res.usedBackup;
          const backupNote = usedBackup ? T('ctl.backupUsed') : '';
          if (backupNote) panel.setNotice(backupNote, 'warn');
          if (state.provider === 'local' && mode !== 'image' && !res.refs) panel.setNotice(T('ctl.localNoPdf'), 'info'); // responde igual, pero avisa
          if (res.web) {
            const w = res.web;
            const note = T('ctl.webInfo', { read: w.linksRead || 0, n: w.links, tokens: (w.tokens || 0).toLocaleString(state.lang) }) +
              (w.linksFailed ? T('ctl.webFailed', { f: w.linksFailed }) : '') +
              (w.searches ? T('ctl.webSearched') : '') +
              (w.downgraded === 'search' ? T('ctl.webNoSearch') : w.downgraded === 'web' ? T('ctl.webOff') : '');
            panel.setNotice(backupNote ? `${note} ${backupNote}` : note, w.linksFailed || w.downgraded || backupNote ? 'warn' : 'info');
          }
          if (!(opts && opts.mode)) env.send({ type: 'AQUA_SET_PREFS', prefs: { mode } }).catch(() => {}); // los modos que pide Auto no son del panel: no se guardan
          return res.result; // lo usa el modo Auto
        } catch (_) {
          fail('INVALID_RESPONSE');
        }
      } else if (res && res.error && res.error.code === 'CANCELLED') {
        setState('idle');
        panel.setNotice(msg('CANCELLED'), 'info');
      } else {
        const code = (res && res.error && res.error.code) || 'UNKNOWN';
        // Con enlaces web cada página cuenta como tokens y tarda más: se avisa de la causa más probable.
        fail(code, res && res.error && res.error.web && ['QUOTA', 'TIMEOUT'].includes(code) ? ` ${T('ctl.webHint')}` : '');
      }
    }

    // ---- Modo Auto (opcional, apagado por defecto): la tecla + marca la opción sugerida de UNA pregunta por pulsación.
    // Nunca envía el cuestionario, no cambia de página y no marca nada que ya tenga respuesta.
    let autoRunning = false;
    const autoSkipped = new Set(); // preguntas a las que el modelo no supo dar una respuesta válida: la siguiente pulsación pasa a otra
    const isAutoQ = (q) => ((q.type === 'single' || q.type === 'multi') && q.options.length > 0) || (q.type === 'select' && !!q.gaps && q.gaps.length > 0) || q.type === 'open' || ((q.type === 'short' || q.type === 'fill') && q.fields > 0 && q.fields <= extractor.MAX_TEXT_FIELDS) || (q.type === 'order' && !!q.items && q.items.length > 1);

    function autoTargets() {
      const byOrder = Array.from(doc.querySelectorAll('.que')).filter((n) => n.querySelector('.qtext'));
      const els = questions.map((q, i) => (q.id && doc.getElementById(q.id)) || byOrder[i] || null);
      const open = (i) => {
        const el = els[i];
        if (!el || !isAutoQ(questions[i]) || autoSkipped.has(questions[i].id || `#${i}`)) return false;
        if (questions[i].type === 'open') return extractor.isEssayEmpty(el);
        if (questions[i].type === 'short' || questions[i].type === 'fill') return extractor.textInputs(el).some((f) => f.value.trim() === '');
        if (questions[i].type === 'order') return extractor.orderItems(el).length === questions[i].items.length; // se ordena una sola vez (autoSkipped)
        if (questions[i].type === 'select') return extractor.selectGaps(el).some((g) => extractor.selectEmpty(g.select)); // queda algún hueco sin elegir
        return !extractor.isAnswered(el) && extractor.optionEntries(el).some((e) => !e.input.disabled);
      };
      const order = questions.map((_, i) => i); // siempre por orden de la página: la primera pendiente desde arriba
      return { els, open, order };
    }

    function reveal(el) {
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    // Avisa de lo marcado y se desplaza a la siguiente pregunta pendiente.
    function finishAuto(q, marked, r, idx, els, open, order, doneText) {
      const nextIdx = order.slice(order.indexOf(idx) + 1).find(open);
      const next = nextIdx === undefined ? null : questions[nextIdx];
      if (next) reveal(els[nextIdx]);
      const tail = next ? T('ctl.autoNext', { next: next.number }) : T('ctl.autoLast');
      panel.setNotice(`${doneText || T('ctl.autoMarked', { n: q.number, m: marked })}${r.status === 'confirmed' ? '' : ` ${T('ctl.autoUnconfirmed')}`} ${tail}${usedBackup ? ` ${T('ctl.backupUsed')}` : ''}`, r.status === 'confirmed' && !usedBackup ? 'info' : 'warn');
    }

    // Desplegables: la respuesta son líneas «hueco=opción». Solo se rellenan los huecos vacíos y solo con una opción válida de ese hueco.
    function fillGaps(q, el, idx, r, els, open, order) {
      const gaps = extractor.selectGaps(el);
      const chosen = new Map();
      for (const line of String(r.answerText || '').split('\n')) {
        const m = /^\s*(?:hueco\s*)?(\d{1,2})\s*[=:]\s*(\d{1,2})\s*$/i.exec(line);
        if (!m) continue;
        const g = Number(m[1]);
        const o = Number(m[2]);
        if (g >= 1 && g <= gaps.length && o >= 1 && o <= gaps[g - 1].options.length && !chosen.has(g)) chosen.set(g, o);
      }
      if (!chosen.size) return autoSkipped.add(q.id || `#${idx}`), panel.setNotice(T('ctl.autoNoAnswer', { n: q.number }), 'warn');
      let marked = 0;
      for (const [g, o] of chosen) {
        const { select, options } = gaps[g - 1];
        if (select.disabled || !extractor.selectEmpty(select)) continue; // lo que ya elegiste tú no se toca
        select.value = options[o - 1].value;
        if (select.value !== options[o - 1].value) continue;
        select.dispatchEvent(new win.Event('input', { bubbles: true }));
        select.dispatchEvent(new win.Event('change', { bubbles: true })); // Moodle y la página se enteran como si lo hubieras elegido tú
        marked++;
      }
      if (!marked) return panel.setNotice(T('ctl.autoTaken', { n: q.number }), 'warn');
      finishAuto(q, marked, r, idx, els, open, order);
    }

    // Desarrollo: escribe la respuesta corta en el campo vacío (textarea y/o editor). No toca nada que ya hayas escrito.
    function writeEssay(q, el, idx, r, els, open, order) {
      const text = String(r.answerText || '').trim().slice(0, 2000);
      if (!text) return autoSkipped.add(q.id || `#${idx}`), panel.setNotice(T('ctl.autoNoAnswer', { n: q.number }), 'warn');
      if (!extractor.isEssayEmpty(el)) return panel.setNotice(T('ctl.autoTaken', { n: q.number }), 'warn');
      const { ta, ed } = extractor.essayField(el);
      for (const f of [ta, ed]) {
        if (!f) continue;
        if (f === ta) f.value = text;
        else f.textContent = text;
        f.dispatchEvent(new win.Event('input', { bubbles: true }));
        f.dispatchEvent(new win.Event('change', { bubbles: true }));
        f.dispatchEvent(new win.Event('keyup', { bubbles: true })); // los editores enriquecidos (Atto) sincronizan al soltar una tecla
      }
      autoSkipped.add(q.id || `#${idx}`);
      finishAuto(q, 1, r, idx, els, open, order, T('ctl.autoWrote', { n: q.number }));
    }

    // Huecos de texto / respuesta corta: la respuesta son líneas «n=texto». Solo se rellenan las cajas vacías, con texto de una línea.
    function fillTexts(q, el, idx, r, els, open, order) {
      const inputs = extractor.textInputs(el);
      const chosen = new Map();
      for (const line of String(r.answerText || '').split('\n')) {
        const m = /^\s*(?:campo\s*)?(\d{1,2})\s*[=:]\s*(.+?)\s*$/i.exec(line);
        if (!m) continue;
        const n = Number(m[1]);
        const v = m[2].replace(/^["'«“`]+|["'»”`]+$/g, '').slice(0, 200);
        if (n >= 1 && n <= inputs.length && v && !chosen.has(n)) chosen.set(n, v);
      }
      if (!chosen.size && inputs.length === 1) {
        const raw = String(r.answerText || '').split('\n')[0].replace(/^\s*(?:campo\s*)?\d{1,2}\s*[=:]\s*/i, '').trim().replace(/^["'«“`]+|["'»”`]+$/g, '').slice(0, 200); // sin «1=»
        if (raw) chosen.set(1, raw);
      }
      let written = 0;
      for (const [n, v] of chosen) {
        const input = inputs[n - 1];
        if (input.value.trim() !== '') continue; // lo que escribiste tú no se toca
        input.value = q.numeric ? (/-?\d+(?:[.,]\d+)?/.exec(v) || [v])[0] : v;
        input.dispatchEvent(new win.Event('input', { bubbles: true }));
        input.dispatchEvent(new win.Event('change', { bubbles: true }));
        written++;
      }
      autoSkipped.add(q.id || `#${idx}`); // una sola vez por pregunta
      if (!written) return panel.setNotice(T(chosen.size ? 'ctl.autoTaken' : 'ctl.autoNoAnswer', { n: q.number }), 'warn');
      finishAuto(q, written, r, idx, els, open, order, T('ctl.autoWrote', { n: q.number }));
    }

    // Ordenar: la respuesta es una lista «3,1,2». Solo se aplica si usa cada elemento una vez; se reordena la lista y su campo oculto.
    function applyOrder(q, el, idx, r, els, open, order) {
      const items = extractor.orderItems(el);
      const n = items.length;
      const perm = String(r.answerText || '').split(/[^0-9]+/).filter(Boolean).map(Number);
      autoSkipped.add(q.id || `#${idx}`); // una sola vez por pregunta: el orden actual ya no se puede distinguir del tuyo
      const valid = n >= 2 && perm.length === n && new Set(perm).size === n && perm.every((k) => k >= 1 && k <= n);
      const parent = n ? items[0].el.parentNode : null;
      if (!valid || !items.every((i) => i.el.parentNode === parent)) return panel.setNotice(T('ctl.autoNoAnswer', { n: q.number }), 'warn');
      perm.forEach((k) => parent.appendChild(items[k - 1].el));
      // Campo oculto con el orden (lista separada por comas): se permuta igual que los elementos.
      const hidden = Array.from(el.querySelectorAll('input[type="hidden"]')).find((h) => !h.disabled && h.value.split(',').length === n && h.value.split(',').every(Boolean) && !/sequencecheck|flagged|:sequence/i.test(h.name));
      if (hidden) {
        const old = hidden.value.split(',');
        hidden.value = perm.map((k) => old[k - 1]).join(',');
        hidden.dispatchEvent(new win.Event('input', { bubbles: true }));
        hidden.dispatchEvent(new win.Event('change', { bubbles: true }));
      }
      finishAuto(q, n, r, idx, els, open, order, T('ctl.autoOrdered', { n: q.number }));
    }

    async function autoStep() {
      if (autoRunning || currentRequest || !panel || !panel.isVisible()) return;
      autoRunning = true;
      try {
        questions = extractor.extractQuestions(doc); // se relee la página: puede haber cambiado desde la última detección
        panel.setQuestions(questions);
        const { els, open, order } = autoTargets();
        const idx = order.find(open);
        if (idx === undefined) return panel.setNotice(T('ctl.autoNone'), 'info');
        const q = questions[idx];
        const el = els[idx];
        reveal(el);
        pickQuestion(idx);
        if (!payload) return;
        const r = await ask(q.type === 'select' ? { mode: 'select' } : q.type === 'order' ? { mode: 'order' } : q.type === 'open' ? { mode: 'short' } : q.type === 'short' || q.type === 'fill' ? { mode: 'fill' } : undefined);
        if (!r) return;
        if (q.type === 'select') return fillGaps(q, el, idx, r, els, open, order);
        if (q.type === 'order') return applyOrder(q, el, idx, r, els, open, order);
        if (q.type === 'short' || q.type === 'fill') return fillTexts(q, el, idx, r, els, open, order);
        if (q.type === 'open') return writeEssay(q, el, idx, r, els, open, order);
        if (!Array.isArray(r.selected)) return;
        const skip = () => autoSkipped.add(q.id || `#${idx}`);
        if (extractor.isAnswered(el)) return panel.setNotice(T('ctl.autoTaken', { n: q.number }), 'warn'); // la respondiste mientras tanto
        const entries = extractor.optionEntries(el);
        const picks = [...new Set(r.selected)].filter((n) => Number.isInteger(n) && n >= 1 && n <= entries.length);
        if (!picks.length) return skip(), panel.setNotice(T('ctl.autoNoAnswer', { n: q.number }), 'warn');
        if (q.type === 'single' && picks.length !== 1) return skip(), panel.setNotice(T('ctl.autoUnsure', { n: q.number }), 'warn');
        let marked = 0;
        for (const n of picks) {
          const input = entries[n - 1].input;
          if (input.disabled) continue;
          if (!input.checked) input.click(); // clic real: Moodle se entera como si lo hicieras tú
          if (input.checked) marked++;
        }
        finishAuto(q, marked, r, idx, els, open, order);
      } finally {
        autoRunning = false;
      }
    }

    const trigger = () => (state.auto && state.auto.trigger) || 'key:+';
    const autoReady = () => state.auto && state.auto.enabled && !state.locked && panel && panel.isVisible();
    const editableTarget = (e) => {
      const t = (e.composedPath && e.composedPath()[0]) || e.target;
      return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));
    };

    function onKey(e) {
      const tr = trigger();
      if (!tr.startsWith('key:') || !autoReady()) return;
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return; // una pulsación = una pregunta; mantenerla no repite
      const want = tr.slice(4);
      const hit = want.length === 1 ? e.key.toLowerCase() === want || (want === '+' && e.code === 'NumpadAdd') : e.key === want;
      if (!hit || editableTarget(e)) return; // no interfiere al escribir
      e.preventDefault();
      e.stopPropagation();
      autoStep();
    }

    // Botón de la rueda: solo sobre zonas «vacías» (no enlaces, botones, campos ni el propio panel), para no romper abrir pestañas ni pegar.
    let swallow = false;
    function onMouse(e) {
      if (e.type !== 'mousedown') {
        if (swallow) { e.preventDefault(); e.stopPropagation(); } // mouseup/auxclick del mismo clic
        return;
      }
      if (e.button !== 1 || trigger() !== 'mouse:middle' || !autoReady() || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      const path = (e.composedPath && e.composedPath()) || [];
      const t = path[0] || e.target;
      if (path.some((n) => n && n.id === 'aqua-host') || editableTarget(e)) return;
      if (t && t.closest && t.closest('a[href],button,summary,label,[role="button"],[role="link"]')) return;
      swallow = true;
      setTimeout(() => { swallow = false; }, 600);
      e.preventDefault(); // también evita el autoscroll del clic central
      e.stopPropagation();
      autoStep();
    }
    let keyBound = false;
    function bindKey() {
      if (keyBound) return;
      doc.addEventListener('keydown', onKey, true);
      for (const t of ['mousedown', 'mouseup', 'auxclick']) doc.addEventListener(t, onMouse, true);
      keyBound = true;
    }
    function unbindKey() {
      if (!keyBound) return;
      doc.removeEventListener('keydown', onKey, true);
      for (const t of ['mousedown', 'mouseup', 'auxclick']) doc.removeEventListener(t, onMouse, true);
      keyBound = false;
    }

    function cancel() {
      if (!currentRequest) return;
      const id = currentRequest;
      currentRequest = null;
      env.send({ type: 'AQUA_CANCEL', requestId: id }).catch(() => {});
      panel.setBusy(false);
      setState('idle');
      panel.setNotice(msg('CANCELLED'), 'info');
    }

    function hide() {
      cancel();
      if (panel) panel.hide();
    }

    const handlers = {
      onUseSelection: () => useSelection(),
      onDetect: () => detectQuestions(),
      onPickQuestion: (i) => pickQuestion(i),
      onAsk: () => ask(),
      onCancel: () => cancel(),
      onHide: () => hide(),
      onSettings: () => env.openSettings(),
      onUnlock: async (password) => {
        const r = await env.send({ type: 'AQUA_UNLOCK', password }).catch(() => null);
        if (r && r.unlocked) setLocked(false);
        return !!(r && r.unlocked);
      },
      onModeChange: () => {},
      onPasteImage: (f) => pasteImage(f),
      t: (k, p) => T(k, p),
      onCopy: (t, area) => copy(t, area),
    };

    async function show(css) {
      page = detector.detectMoodle(detector.collectSignals(doc, win.location));
      // Se leen los ajustes primero para conocer el idioma antes de dibujar el panel (solo ajustes locales, sin contenido).
      let savedMode;
      try {
        const st = await env.send({ type: 'AQUA_GET_STATE' });
        if (st && st.ok) {
          state = { provider: st.provider === 'local' ? 'local' : 'gemini', hasKey: !!st.hasKey, maxChars: st.maxChars || state.maxChars, ui: st.ui || null, idle: st.idle || state.idle, docs: st.docs || state.docs, auto: { enabled: !!(st.auto && st.auto.enabled), trigger: (st.auto && st.auto.trigger) || 'key:+' }, lang: i18n.LANGS.includes(st.lang) ? st.lang : i18n.DEFAULT_LANG, locked: !!st.locked };
          savedMode = st.prefs && st.prefs.mode;
        }
      } catch (_) {
        /* el background no respondió: el panel sigue usable, la consulta fallará con mensaje */
      }
      if (panel && panelLang !== state.lang) {
        panel.destroy();
        panel = null;
      }
      if (!panel) {
        panel = ui.createPanel(doc, css, handlers);
        panelLang = state.lang;
      }
      panel.show();
      panel.setLocked(!!state.locked);
      panel.applyAppearance(state.ui);
      autoSkipped.clear();
      panel.setVisibility({ hoverOnly: !!(state.ui && state.ui.hoverOnly), idle: state.idle });
      payload = null;
      image = null;
      panel.setImageState('none');
      questions = [];
      panel.setQuestions([]);
      panel.setPreview('');
      panel.clearResult();
      panel.setBusy(false);
      setState('idle');
      if (!page.isMoodle) {
        panel.setUnsupported(true);
        panel.setNotice(msg('NOT_MOODLE'), 'warn');
        return page;
      }
      panel.setUnsupported(false);
      if (savedMode) panel.setMode(savedMode);
      panel.setImageAllowed(state.provider !== 'local'); // después de setMode: si se guardó «imagen», vuelve a Quiz
      bindKey();
      panel.setAutoTag(state.auto.enabled);
      if (state.auto.enabled && !panel.isUltra()) panel.setNotice(T('ctl.autoOn'), 'info'); // en ultra pequeño basta la etiqueta «auto: on»
      if (!state.hasKey && state.provider !== 'local') panel.setNotice(msg('NO_API_KEY'), 'warn');
      return page;
    }

    function setLocked(on) {
      state.locked = !!on;
      if (panel) panel.setLocked(on);
    }

    // Cambia el lado (izquierda/derecha) sin volver a abrir el panel.
    function setSide(side) {
      state.ui = { ...(state.ui || {}), side: side === 'right' ? 'right' : 'left' };
      if (panel) panel.applyAppearance(state.ui);
    }

    // Cambio de proveedor con el atajo mientras el panel está abierto.
    function setProvider(p) {
      state.provider = p === 'local' ? 'local' : 'gemini';
      if (state.provider === 'local') image = null;
      if (panel) panel.setImageAllowed(state.provider !== 'local');
    }

    return {
      show,
      setSide,
      setProvider,
      setLocked,
      hide,
      isVisible: () => !!panel && panel.isVisible(),
      destroy() {
        cancel();
        unbindKey();
        if (panel) panel.destroy();
        panel = null;
      },
      _panel: () => panel,
    };
  }

  const api = { createController };
  A.controller = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
