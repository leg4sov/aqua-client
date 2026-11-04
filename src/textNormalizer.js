/* Aqua · normalización, redacción de datos sensibles y validación de longitud. */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});

  const DEFAULT_MAX_CHARS = 6000;
  const ABSOLUTE_MAX_CHARS = 12000;

  const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
  // eslint-disable-next-line no-control-regex
  const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

  function normalizeText(input) {
    if (typeof input !== 'string') return '';
    return input
      .normalize('NFC')
      .replace(/\r\n?/g, '\n')
      .replace(ZERO_WIDTH, '')
      .replace(CONTROL, '')
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Patrones deliberadamente conservadores: en contenidos técnicos hay IPs, MACs y hashes legítimos
  // que NO deben destruirse. Solo se redactan datos con forma inequívoca de secreto/dato personal.
  const REDACTIONS = [
    { type: 'clave_api', re: /AIza[0-9A-Za-z_\-]{30,}/g, to: '[CLAVE]' },
    { type: 'jwt', re: /\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b/g, to: '[TOKEN]' },
    { type: 'bearer', re: /\bBearer\s+[A-Za-z0-9._\-]{16,}/gi, to: 'Bearer [TOKEN]' },
    {
      type: 'secreto_etiquetado',
      re: /\b(contraseña|contrasena|password|passwd|pwd|token|sesskey|api[ _-]?key|secret[oa]?|cookie)\b(\s*[:=]\s*)(?!\[)(\S+)/gi,
      to: (m, k, sep) => `${k}${sep}[REDACTADO]`,
    },
    { type: 'email', re: /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, to: '[EMAIL]' },
    { type: 'dni_nie', re: /\b(?:\d{8}|[XYZxyz]\d{7})[- ]?[A-Za-z]\b/g, to: '[ID]' },
    { type: 'iban', re: /\bES\d{2}(?:[ ]?\d{4}){5}\b/g, to: '[IBAN]' },
    { type: 'telefono', re: /(?<![\d.])(?:\+34[ -]?)?[6-9]\d{2}[ -]?\d{3}[ -]?\d{3}(?![\d.])/g, to: '[TELÉFONO]' },
  ];

  function redactSensitive(text) {
    let out = text;
    const redactions = [];
    for (const r of REDACTIONS) {
      let count = 0;
      out = out.replace(r.re, (...args) => {
        count++;
        return typeof r.to === 'function' ? r.to(...args) : r.to;
      });
      if (count) redactions.push({ type: r.type, count });
    }
    return { text: out, redactions };
  }

  function clampMaxChars(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return DEFAULT_MAX_CHARS;
    return Math.min(ABSOLUTE_MAX_CHARS, Math.max(200, Math.floor(v)));
  }

  /**
   * Normaliza + redacta + valida longitud. No trunca en silencio: si excede el límite, rechaza.
   * @returns {{ok:true,text:string,redactions:Array,length:number}|{ok:false,code:string,length?:number,maxChars?:number}}
   */
  function prepareForSending(input, opts) {
    const maxChars = clampMaxChars(opts && opts.maxChars);
    const normalized = normalizeText(input);
    if (!normalized || !/[\p{L}\p{N}]/u.test(normalized)) return { ok: false, code: 'EMPTY_TEXT' };
    const { text, redactions } = redactSensitive(normalized);
    if (text.length > maxChars) return { ok: false, code: 'TOO_LONG', length: text.length, maxChars };
    return { ok: true, text, redactions, length: text.length };
  }

  function countRedactions(redactions) {
    return (redactions || []).reduce((n, r) => n + r.count, 0);
  }

  const api = {
    DEFAULT_MAX_CHARS,
    ABSOLUTE_MAX_CHARS,
    normalizeText,
    redactSensitive,
    prepareForSending,
    clampMaxChars,
    countRedactions,
  };
  A.textNormalizer = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
