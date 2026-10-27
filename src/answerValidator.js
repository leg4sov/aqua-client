/* Aqua · parseo y validación estricta de la respuesta del modelo (se trata como dato no confiable). */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});
  const { AquaError } = typeof module === 'object' ? require('./errors') : A.errors;

  const STATUSES = ['confirmed', 'hypothesis', 'insufficient_data'];
  // eslint-disable-next-line no-control-regex
  const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

  function clean(v, max) {
    return typeof v === 'string' ? v.replace(CTRL, '').trim().slice(0, max) : '';
  }

  function parseModelJson(text) {
    let s = String(text || '').trim();
    const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fence) s = fence[1];
    try {
      const v = JSON.parse(s);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch (_) {
      /* cae al error */
    }
    throw new AquaError('INVALID_RESPONSE', 'JSON no válido');
  }

  /**
   * @param {object} raw objeto JSON del modelo
   * @param {{type:string, optionCount:number}} meta
   */
  function validateAnswer(raw, meta) {
    const optionCount = Math.max(0, Math.min(20, Number(meta && meta.optionCount) || 0));
    const type = meta && meta.type;
    const warnings = [];

    const status = STATUSES.includes(raw.status) ? raw.status : 'insufficient_data';
    if (!STATUSES.includes(raw.status)) warnings.push('estado_desconocido');

    let selected = [];
    if (Array.isArray(raw.selected_options) && optionCount > 0) {
      selected = [...new Set(raw.selected_options.filter((n) => Number.isInteger(n) && n >= 1 && n <= optionCount))].sort((a, b) => a - b);
      if (selected.length !== raw.selected_options.length) warnings.push('opciones_fuera_de_rango');
    }
    if (type === 'single' && selected.length > 1) warnings.push('varias_opciones_en_pregunta_unica');

    const commands = (Array.isArray(raw.commands) ? raw.commands : [])
      .map((c) => ({ command: clean(c && c.command, 500), description: clean(c && c.description, 300) }))
      .filter((c) => c.command)
      .slice(0, 8);

    const out = {
      status,
      module: clean(raw.module, 100),
      selected,
      answerText: clean(raw.answer_text, 2000),
      explanation: clean(raw.explanation, 6000),
      commands,
      caveats: clean(raw.caveats, 1000),
      warnings,
    };
    if (!out.selected.length && !out.answerText && !out.explanation && !out.commands.length) {
      throw new AquaError('EMPTY_RESPONSE');
    }
    return out;
  }

  const api = { STATUSES, parseModelJson, validateAnswer };
  A.answerValidator = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
