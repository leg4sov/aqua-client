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
  const MODES = ['quiz', 'short', 'long', 'image']; // quiz = solo letras; short/long = texto corto o largo; image = pregunta en una imagen pegada
  const DEFAULT_PREFS = Object.freeze({ mode: 'quiz' });
  const DEFAULT_UI = Object.freeze({ size: 'xxs', opacity: 55, side: 'left', bg: 'transparent', palette: 'dark', hoverOnly: false });
  // Color de texto de cada paleta (debe coincidir con styles.css; hay un test que lo comprueba).
  const PALETTES = Object.freeze({ classic: '#0b2530', light: '#4b5058', dark: '#b4bac2' });
  const SIZES = ['xxs', 'xs', 'm']; // xxs = ultra pequeño (por defecto), xs = mínimo, m = normal
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
  const DEFAULT_DOCS = Object.freeze({ enabled: false, k: 4, imageSearch: false });
  function sanitizeDocs(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const k = Number(r.k);
    // imageSearch: con una imagen, Gemini la lee primero (1 petición extra) para buscar en los PDF; solo tiene efecto si enabled
    return { enabled: r.enabled === true, k: Number.isFinite(k) ? Math.min(8, Math.max(1, Math.round(k))) : DEFAULT_DOCS.k, imageSearch: r.imageSearch === true };
  }

  // Referencias web: enlaces que Gemini lee por su cuenta (herramienta de contexto de URL). Apagado por defecto: cada página
  // cuenta como tokens de entrada, así que el máximo es bajo. La búsqueda en internet es un interruptor aparte.
  const MAX_WEB_LINKS = 5;
  const MAX_URL_LEN = 2000;
  const DEFAULT_WEB = Object.freeze({ enabled: false, search: false, urls: [] });
  const PRIVATE_HOST = /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.)/;
  const INTERNAL_TLD = /\.(local|localhost|internal|lan|home|corp|intranet|test|invalid|example)$/i;
  // La URL se envía a Google: no se aceptan enlaces que lleven una clave, sesión o contraseña en sus parámetros.
  const SECRET_PARAM = /^(.*[_-])?(token|key|apikey|api_key|sesskey|session|sessionid|sid|password|passwd|pass|pwd|secret|auth|authorization|signature|sig|otp|jwt|bearer)([_-].*)?$/i;

  /** Enlace válido para Gemini: http(s), sin usuario/contraseña, con dominio público. Devuelve la URL normalizada o null. */
  function cleanWebUrl(s) {
    if (typeof s !== 'string' || !s.trim() || s.length > MAX_URL_LEN) return null;
    let u;
    try {
      u = new URL(s.trim());
    } catch (_) {
      return null;
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null; // nunca credenciales dentro del enlace
    if (!u.hostname.includes('.') || PRIVATE_HOST.test(u.hostname) || INTERNAL_TLD.test(u.hostname)) return null; // los visita Google: localhost y redes privadas no sirven
    for (const name of new URLSearchParams(u.search).keys()) if (SECRET_PARAM.test(name)) return null;
    if (/[?&#](access_token|id_token|token|key|sesskey|password)=/i.test(u.hash)) return null;
    return u.href;
  }

  /** Acepta un texto (un enlace por línea o separados por espacios) o una lista. dropped = descartados (no válidos, repetidos o por encima del máximo). */
  function parseWebUrls(input) {
    const items = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[\s,]+/) : [];
    const urls = [];
    let dropped = 0;
    for (const it of items) {
      if (typeof it === 'string' && !it.trim()) continue;
      const u = cleanWebUrl(it);
      if (!u || urls.includes(u) || urls.length >= MAX_WEB_LINKS) dropped++;
      else urls.push(u);
    }
    return { urls, dropped };
  }

  function sanitizeWeb(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return { enabled: r.enabled === true, search: r.search === true, urls: parseWebUrls(r.urls).urls };
  }

  // IA local (llama.cpp, Ollama, llamafile, LM Studio: API compatible con OpenAI). Solo direcciones de este mismo equipo.
  const PROVIDERS = ['gemini', 'local'];
  const DEFAULT_LOCAL = Object.freeze({ url: 'http://localhost:23517', model: 'qwen3.5:4b', timeoutMs: 90000 });
  const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
  const LOCAL_MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:\-/]{0,127}$/;

  /** Devuelve el origen (p. ej. http://localhost:23517) si es una dirección local válida; si no, null. */
  function cleanLocalUrl(s) {
    if (typeof s !== 'string' || !s.trim()) return null;
    let u;
    try {
      u = new URL(s.trim());
    } catch (_) {
      return null;
    }
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password || !LOCAL_HOSTS.includes(u.hostname)) return null;
    return u.origin;
  }

  function sanitizeLocal(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const t = Number(r.timeoutMs);
    const model = typeof r.model === 'string' ? r.model.trim() : '';
    return {
      url: cleanLocalUrl(r.url) || DEFAULT_LOCAL.url,
      model: LOCAL_MODEL_RE.test(model) ? model : DEFAULT_LOCAL.model,
      timeoutMs: Number.isFinite(t) ? Math.min(300000, Math.max(5000, Math.floor(t))) : DEFAULT_LOCAL.timeoutMs, // en CPU puede tardar
    };
  }

  // Modo Auto: apagado por defecto. Con él, la tecla + marca en la página la opción sugerida de UNA pregunta por pulsación.
  // Disparador de Auto: 'key:<tecla>' (un carácter imprimible, F1–F12 o Insert; sin Ctrl/Alt/Meta) o 'mouse:middle' (botón de la rueda).
  const DEFAULT_TRIGGER = 'key:+';
  function cleanTrigger(t) {
    if (t === 'mouse:middle') return t;
    const m = /^key:(.{1,6})$/u.exec(typeof t === 'string' ? t : '');
    if (!m) return DEFAULT_TRIGGER;
    const k = m[1];
    if (/^(F([1-9]|1[0-2])|Insert)$/.test(k)) return `key:${k}`;
    return [...k].length === 1 && /^[\p{L}\p{N}\p{P}\p{S}]$/u.test(k) ? `key:${k.toLowerCase()}` : DEFAULT_TRIGGER;
  }
  const DEFAULT_AUTO = Object.freeze({ enabled: false, trigger: DEFAULT_TRIGGER, scroll: true });
  function sanitizeAuto(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return { enabled: r.enabled === true, trigger: cleanTrigger(r.trigger), scroll: r.scroll !== false };
  }

  function sanitizeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const timeout = Number(r.timeoutMs);
    return {
      provider: PROVIDERS.includes(r.provider) ? r.provider : 'gemini',
      local: sanitizeLocal(r.local),
      model: normalizeModelName(r.model) || DEFAULTS.model,
      timeoutMs: Number.isFinite(timeout) ? Math.min(120000, Math.max(5000, Math.floor(timeout))) : DEFAULTS.timeoutMs,
      maxChars: norm.clampMaxChars(r.maxChars === undefined ? DEFAULTS.maxChars : r.maxChars),
      ui: sanitizeUi(r.ui),
      idle: sanitizeIdle(r.idle),
      docs: sanitizeDocs(r.docs),
      web: sanitizeWeb(r.web),
      auto: sanitizeAuto(r.auto),
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

  const api = { PROVIDERS, DEFAULT_LOCAL, cleanLocalUrl, sanitizeLocal, DEFAULT_MODEL, SUGGESTED_MODELS, DEFAULTS, DEFAULT_PREFS, MODES, DEFAULT_UI, DEFAULT_IDLE, sanitizeIdle, DEFAULT_AUTO, DEFAULT_TRIGGER, cleanTrigger, sanitizeAuto, DEFAULT_DOCS, sanitizeDocs, MAX_WEB_LINKS, DEFAULT_WEB, cleanWebUrl, parseWebUrls, sanitizeWeb, SIZES, LANGS, DEFAULT_LANG, PALETTES, MIN_OPACITY, sanitizeUi, normalizeModelName, sanitizeSettings, sanitizePrefs, looksLikeApiKey };
  A.settings = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
