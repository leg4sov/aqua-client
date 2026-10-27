/* Aqua · valores por defecto y saneado de ajustes (sin acceso a storage: función pura). */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});
  const norm = typeof module === 'object' ? require('./textNormalizer') : A.textNormalizer;
  const LANGS = ['en', 'es'];
  const DEFAULT_LANG = 'en';

  // Modelo por defecto: estable y vigente según https://ai.google.dev/gemini-api/docs/models (comprobado 2026-10-22). Flash-Lite se elige por defecto por ser más ligero y tener, según informes de usuarios, más margen en el nivel gratuito.
  const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
  const SUGGESTED_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-4-argon'];

  const DEFAULTS = Object.freeze({
    model: DEFAULT_MODEL,
    timeoutMs: 30000,
    maxChars: norm.DEFAULT_MAX_CHARS,
  });
  const MODES = ['quiz', 'short', 'long']; // quiz = solo letras; short = respuesta corta; long = respuesta larga
  const DEFAULT_PREFS = Object.freeze({ mode: 'quiz' });
  const DEFAULT_UI = Object.freeze({ size: 'xs', opacity: 55, side: 'left', bg: 'transparent', palette: 'dark', hoverOnly: false });
  // Color de texto de cada paleta (debe coincidir con styles.css; hay un test que lo comprueba).
  const PALETTES = Object.freeze({ classic: '#0b2530', light: '#4b5058', dark: '#b4bac2' });
  const SIZES = ['xxs', 'xs', 's', 'm']; // xxs = ultra pequeño
  const DEFAULT_IDLE = Object.freeze({ enabled: true, seconds: 5 });
  const MIN_OPACITY = 30; // suelo: el panel nunca llega a ser invisible

  const MODEL_RE = /^[a-z0-9][a-z0-9.\-]{0,63}$/;

  function normalizeModelName(name) {
    if (typeof name !== 'string') return null;
    const n = name.trim().replace(/^models\//, '');
    return MODEL_RE.test(n) ? n : null;
  }

  function sanitizeUi(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const op = Number(r.opacity);
    return {
      size: SIZES.includes(r.size) ? r.size : DEFAULT_UI.size,
      opacity: Number.isFinite(op) ? Math.min(100, Math.max(MIN_OPACITY, Math.round(op))) : DEFAULT_UI.opacity,
      side: r.side === 'right' ? 'right' : 'left',
      bg: r.bg === 'solid' ? 'solid' : 'transparent',
      palette: Object.prototype.hasOwnProperty.call(PALETTES, r.palette) ? r.palette : DEFAULT_UI.palette,
      hoverOnly: r.hoverOnly === true, // invisible salvo con el ratón encima

    };
  }

  // Desvanecer por inactividad: activado por defecto, 5 s (configurable 1–300 s).
  function sanitizeIdle(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const sec = Number(r.seconds);
    return {
      enabled: r.enabled !== false,
      seconds: Number.isFinite(sec) ? Math.min(300, Math.max(1, Math.round(sec))) : DEFAULT_IDLE.seconds,
    };
  }

  // PDF de referencia: desactivado por defecto (envía fragmentos a Google y gasta más tokens).
  const DEFAULT_DOCS = Object.freeze({ enabled: false, k: 4 });
  function sanitizeDocs(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const k = Number(r.k);
    return { enabled: r.enabled === true, k: Number.isFinite(k) ? Math.min(8, Math.max(1, Math.round(k))) : DEFAULT_DOCS.k };
  }

  function sanitizeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const timeout = Number(r.timeoutMs);
    return {
      model: normalizeModelName(r.model) || DEFAULTS.model,
      timeoutMs: Number.isFinite(timeout) ? Math.min(120000, Math.max(5000, Math.floor(timeout))) : DEFAULTS.timeoutMs,
      maxChars: norm.clampMaxChars(r.maxChars === undefined ? DEFAULTS.maxChars : r.maxChars),
      ui: sanitizeUi(r.ui),
      idle: sanitizeIdle(r.idle),
      docs: sanitizeDocs(r.docs),
      lang: LANGS.includes(r.lang) ? r.lang : DEFAULT_LANG,
    };
  }

  function sanitizePrefs(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return { mode: MODES.includes(r.mode) ? r.mode : DEFAULT_PREFS.mode };
  }

  // Solo comprueba la FORMA de la clave; no demuestra que sea válida.
  // Permisiva a propósito: Google ha cambiado el formato de las claves (p. ej. con puntos), así que
  // solo se rechazan espacios, comillas, caracteres no ASCII y longitudes absurdas.
  function looksLikeApiKey(key) {
    return typeof key === 'string' && /^[\x21\x23-\x26\x28-\x7E]{20,256}$/.test(key.trim());
  }

  const api = { DEFAULT_MODEL, SUGGESTED_MODELS, DEFAULTS, DEFAULT_PREFS, MODES, DEFAULT_UI, DEFAULT_IDLE, sanitizeIdle, DEFAULT_DOCS, sanitizeDocs, SIZES, LANGS, DEFAULT_LANG, PALETTES, MIN_OPACITY, sanitizeUi, normalizeModelName, sanitizeSettings, sanitizePrefs, looksLikeApiKey };
  A.settings = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
