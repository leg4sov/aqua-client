/* Aqua · controlador del content script: une detección, extracción, UI y mensajería. */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});
  const isNode = typeof module === 'object';
  const detector = isNode ? require('./moodleDetector') : A.moodleDetector;
  const extractor = isNode ? require('./questionExtractor') : A.questionExtractor;
  const norm = isNode ? require('./textNormalizer') : A.textNormalizer;
  const ui = isNode ? require('./ui') : A.ui;
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
    let state = { hasKey: false, maxChars: norm.DEFAULT_MAX_CHARS, ui: null, lang: i18n.DEFAULT_LANG, idle: { enabled: true, seconds: 5 }, docs: { enabled: false, k: 4 } };
    let panelLang = null;
    const T = (k, p) => i18n.t(state.lang, k, p);
    const msg = (code) => errors.messageFor(code, state.lang);
    let payload = null; // {text, meta, options}
    let questions = [];
    let currentRequest = null;
    let seq = 0;

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
      const ok = setPayload(extractor.formatQuestion(q), { type: q.type, optionCount: q.options.length }, q.options, `${T('ctl.qNote', { n: q.number })}:`, q.number, `${q.text}\n${q.options.join('\n')}`);
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
      return { kind: 'text', confidence: r.status, answerText: r.answerText, commands: r.commands, caveats: r.caveats, warnings: [] };
    }

    function shortWarnings(ws) {
      const text = {
        opciones_fuera_de_rango: T('ctl.warnRange'),
        varias_opciones_en_pregunta_unica: T('ctl.warnMulti'),
      };
      return ws.map((w) => text[w]).filter(Boolean);
    }

    async function ask() {
      if (currentRequest) return;
      if (!payload) return fail('EMPTY_TEXT');
      if (panel.getMode() === 'quiz' && payload.meta.optionCount === 0) return fail('MODE_MISMATCH');
      if (!state.hasKey) return fail('NO_API_KEY');
      const requestId = `r${Date.now().toString(36)}${++seq}`;
      const mode = panel.getMode();
      const cur = payload; // se fija ahora: si eliges otra pregunta mientras espera, no se mezclan
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
        res = await env.send({ type: 'AQUA_ASK', requestId, text: cur.text, meta: cur.meta, mode, refIds: (cur.refs || []).map((h) => h.id) });
      } catch (_) {
        res = { ok: false, error: { code: 'NETWORK' } };
      }
      if (currentRequest !== requestId) return; // cancelada u oculta mientras tanto
      currentRequest = null;
      panel.setBusy(false);
      if (res && res.ok) {
        try {
          panel.setResult(toView(res, mode, number));
          setState('done');
          env.send({ type: 'AQUA_SET_PREFS', prefs: { mode } }).catch(() => {});
        } catch (_) {
          fail('INVALID_RESPONSE');
        }
      } else if (res && res.error && res.error.code === 'CANCELLED') {
        setState('idle');
        panel.setNotice(msg('CANCELLED'), 'info');
      } else {
        const code = (res && res.error && res.error.code) || 'UNKNOWN';
        fail(code);
      }
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
      onModeChange: () => {},
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
          state = { hasKey: !!st.hasKey, maxChars: st.maxChars || state.maxChars, ui: st.ui || null, idle: st.idle || state.idle, docs: st.docs || state.docs, lang: i18n.LANGS.includes(st.lang) ? st.lang : i18n.DEFAULT_LANG };
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
      panel.applyAppearance(state.ui);
      panel.setVisibility({ hoverOnly: !!(state.ui && state.ui.hoverOnly), idle: state.idle });
      payload = null;
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
      if (!state.hasKey) panel.setNotice(msg('NO_API_KEY'), 'warn');
      return page;
    }

    // Cambia el lado (izquierda/derecha) sin volver a abrir el panel.
    function setSide(side) {
      state.ui = { ...(state.ui || {}), side: side === 'right' ? 'right' : 'left' };
      if (panel) panel.applyAppearance(state.ui);
    }

    return {
      show,
      setSide,
      hide,
      isVisible: () => !!panel && panel.isVisible(),
      destroy() {
        cancel();
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
