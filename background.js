/* Aqua · service worker (Chrome) / event page (Firefox). */
'use strict';
const LIB_FILES = [
  'src/i18n.js',
  'src/errors.js',
  'src/textNormalizer.js',
  'src/settings.js',
  'src/prompts.js',
  'src/answerValidator.js',
  'src/geminiClient.js',
  'src/pdfIndex.js',
  'src/docStore.js',
  'src/askService.js',
];
// En Chrome (service worker) se cargan con importScripts; en Firefox los carga el manifiesto (background.scripts).
if (typeof importScripts === 'function') importScripts(...LIB_FILES);

const api = globalThis.browser || globalThis.chrome;
const { settings: S, geminiClient, askService, errors: E, docStore, textNormalizer: NORM } = globalThis.Aqua;
const CONTENT_FILES = [
  'src/i18n.js',
  'src/errors.js',
  'src/textNormalizer.js',
  'src/moodleDetector.js',
  'src/questionExtractor.js',
  'src/ui.js',
  'src/controller.js',
  'content.js',
];
const KEY = 'aqua.apiKey';
const SETTINGS = 'aqua.settings';
const PREFS = 'aqua.prefs';

// La clave solo debe ser legible desde contextos de confianza (no desde content scripts). Chrome 102+.
try {
  api.storage.local.setAccessLevel && api.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
} catch (_) {
  /* no disponible en este navegador */
}

async function getConfig() {
  const o = await api.storage.local.get([KEY, SETTINGS]);
  return { apiKey: typeof o[KEY] === 'string' ? o[KEY] : '', settings: S.sanitizeSettings(o[SETTINGS]) };
}

// PDF de referencia del usuario: índice local en IndexedDB (se llena desde la página de Ajustes).
const docService = docStore.createDocService(docStore.createDocStore({ indexedDB }));
const service = askService.createAskService({ getConfig, gemini: geminiClient, docs: docService });

let cssCache = null;
async function getCss() {
  if (cssCache === null) {
    try {
      cssCache = await (await fetch(api.runtime.getURL('styles.css'))).text();
    } catch (_) {
      cssCache = '';
    }
  }
  return cssCache;
}

function flagError(tabId) {
  api.action.setBadgeText({ text: '!', tabId }).catch(() => {});
  api.action.setBadgeBackgroundColor({ color: '#b3261e', tabId }).catch(() => {});
  setTimeout(() => api.action.setBadgeText({ text: '', tabId }).catch(() => {}), 4000);
}

async function ensureInjected(tabId) {
  try {
    await api.tabs.sendMessage(tabId, { type: 'AQUA_PING' });
    return true;
  } catch (_) {
    /* aún no inyectado */
  }
  try {
    await api.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
    return true;
  } catch (_) {
    return false; // página restringida (about:, chrome://, tienda de extensiones...) o sin permiso
  }
}

async function activate(tab) {
  if (!tab || tab.id === undefined) return;
  if (!(await ensureInjected(tab.id))) return flagError(tab.id);
  try {
    await api.tabs.sendMessage(tab.id, { type: 'AQUA_SHOW', css: await getCss() });
  } catch (_) {
    flagError(tab.id);
  }
}

async function hide(tab) {
  if (!tab || tab.id === undefined) return;
  service.cancelTab(tab.id);
  try {
    await api.tabs.sendMessage(tab.id, { type: 'AQUA_HIDE' });
  } catch (_) {
    /* el panel nunca se abrió en esta pestaña: nada que ocultar */
  }
}

// Guarda el lado (para el resto de pestañas) y, si el panel está abierto en esta, lo mueve al instante.
async function moveSide(side, tab) {
  const o = await api.storage.local.get(SETTINGS);
  const cur = S.sanitizeSettings(o[SETTINGS]);
  await api.storage.local.set({ [SETTINGS]: S.sanitizeSettings({ ...cur, ui: { ...cur.ui, side } }) });
  if (tab && tab.id !== undefined) {
    try {
      await api.tabs.sendMessage(tab.id, { type: 'AQUA_SIDE', side });
    } catch (_) {
      /* el panel no está abierto en esta pestaña: el ajuste ya queda guardado */
    }
  }
}

async function activeTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Al pulsar el icono se abre el popup rápido (action.default_popup); desde él se puede abrir el panel (AQUA_OPEN_PANEL).
api.commands.onCommand.addListener(async (command, tab) => {
  const t = tab || (await activeTab());
  if (command === 'activate-aqua') await activate(t);
  else if (command === 'hide-aqua') await hide(t);
  else if (command === 'move-left') await moveSide('left', t);
  else if (command === 'move-right') await moveSide('right', t);
});

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || sender.id !== api.runtime.id) return false;
  const tabId = sender.tab && sender.tab.id;
  // La página de Ajustes puede abrirse en una pestaña (sender.tab existe), así que se comprueba el ORIGEN (URL de la extensión).
  // Un content script tiene como sender.url la de la web, nunca la de la extensión.
  const fromExtensionPage = typeof sender.url === 'string' && sender.url.startsWith(api.runtime.getURL(''));

  (async () => {
    switch (msg.type) {
      case 'AQUA_GET_STATE': {
        if (tabId === undefined) return { ok: false, error: E.toPlain(new E.AquaError('FORBIDDEN_SENDER')) };
        const o = await api.storage.local.get([KEY, SETTINGS, PREFS]);
        const settings = S.sanitizeSettings(o[SETTINGS]);
        return { ok: true, hasKey: !!o[KEY], maxChars: settings.maxChars, ui: settings.ui, idle: settings.idle, docs: settings.docs, lang: settings.lang, prefs: S.sanitizePrefs(o[PREFS]) };
      }
      case 'AQUA_SET_PREFS':
        if (tabId === undefined) return { ok: false };
        await api.storage.local.set({ [PREFS]: S.sanitizePrefs(msg.prefs) });
        return { ok: true };
      case 'AQUA_ASK':
        if (tabId === undefined) return { ok: false, error: E.toPlain(new E.AquaError('FORBIDDEN_SENDER')) };
        return service.handleAsk(msg, tabId);
      case 'AQUA_CANCEL':
        if (tabId !== undefined && typeof msg.requestId === 'string') service.cancel(tabId, msg.requestId);
        return { ok: true };
      case 'AQUA_OPEN_OPTIONS':
        await api.runtime.openOptionsPage();
        return { ok: true };
      case 'AQUA_DOCS_SEARCH': {
        // Búsqueda local en los PDF para la vista previa: devuelve fragmentos ya redactados, sin nombres de archivo.
        if (tabId === undefined) return { ok: false, error: E.toPlain(new E.AquaError('FORBIDDEN_SENDER')) };
        const { settings } = await getConfig();
        if (!settings.docs.enabled || typeof msg.query !== 'string' || !msg.query.trim()) return { ok: true, hits: [] };
        const hits = await docService.search(msg.query.slice(0, 4000), { k: settings.docs.k });
        return { ok: true, hits: hits.map((h) => ({ id: h.id, page: h.page, text: NORM.redactSensitive(NORM.normalizeText(h.text)).text })) };
      }
      case 'AQUA_OPEN_PANEL': {
        // Solo desde el popup de la extensión; la pulsación del icono concede activeTab a la pestaña activa.
        if (!fromExtensionPage) return { ok: false, error: E.toPlain(new E.AquaError('FORBIDDEN_SENDER')) };
        await activate(await activeTab());
        return { ok: true };
      }
      case 'AQUA_TEST': {
        // Solo desde la página de opciones: petición mínima para comprobar clave y modelo.
        if (!fromExtensionPage) return { ok: false, error: E.toPlain(new E.AquaError('FORBIDDEN_SENDER')) };
        try {
          const { apiKey, settings } = await getConfig();
          const r = await geminiClient.generate({ apiKey, model: settings.model, timeoutMs: settings.timeoutMs, userText: 'Responde únicamente con la palabra OK.' });
          return { ok: true, model: settings.model, sample: r.text.slice(0, 40) };
        } catch (e) {
          return { ok: false, error: E.toPlain(e) };
        }
      }
      default:
        return { ok: false, error: E.toPlain(new E.AquaError('INVALID_INPUT')) };
    }
  })().then(sendResponse, () => sendResponse({ ok: false, error: E.toPlain(new E.AquaError('UNKNOWN')) }));
  return true;
});

api.tabs.onRemoved.addListener((tabId) => service.cancelTab(tabId));
