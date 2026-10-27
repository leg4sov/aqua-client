/* Aqua · errores y mensajes de usuario. Script clásico (namespace globalThis.Aqua) + CommonJS para tests. */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});

  const isNode = typeof module === 'object';
  const i18n = isNode ? require('./i18n') : A.i18n;
  const CODES = ['NO_API_KEY', 'EMPTY_TEXT', 'TOO_LONG', 'INVALID_INPUT', 'NETWORK', 'TIMEOUT', 'CANCELLED', 'AUTH', 'QUOTA', 'MODEL_NOT_FOUND', 'SERVER', 'BAD_REQUEST', 'BLOCKED', 'EMPTY_RESPONSE', 'TRUNCATED', 'INVALID_RESPONSE', 'MODE_MISMATCH', 'NOT_PDF', 'PDF_INVALID', 'PDF_ENCRYPTED', 'PDF_NO_TEXT', 'PDF_TOO_BIG', 'DOCS_LIMIT', 'NOT_MOODLE', 'FORBIDDEN_SENDER', 'UNKNOWN'];
  // Mensaje de usuario en el idioma pedido (inglés por defecto).
  function messageFor(code, lang) {
    return i18n.t(lang, `err.${CODES.includes(code) ? code : 'UNKNOWN'}`);
  }

  class AquaError extends Error {
    constructor(code, detail, status) {
      super(messageFor(code));
      this.name = 'AquaError';
      this.code = CODES.includes(code) ? code : 'UNKNOWN';
      this.detail = detail ? scrubSecrets(String(detail)).slice(0, 200) : '';
      this.status = status || 0;
    }
  }

  // Elimina patrones de claves/tokens por si la API los repite en un mensaje de error.
  function scrubSecrets(s) {
    return String(s)
      .replace(/AIza[0-9A-Za-z_\-]{20,}/g, '[CLAVE]')
      .replace(/([?&]key=)[^&\s"']+/gi, '$1[CLAVE]')
      .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [TOKEN]');
  }

  // Convierte cualquier error en un objeto simple y seguro de enviar al content script.
  function toPlain(err) {
    if (err instanceof AquaError) {
      return { code: err.code, message: err.message, detail: err.detail, status: err.status };
    }
    return { code: 'UNKNOWN', message: messageFor('UNKNOWN'), detail: '', status: 0 };
  }

  const api = { AquaError, CODES, scrubSecrets, toPlain, messageFor };
  A.errors = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
