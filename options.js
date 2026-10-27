/* Aqua · página de opciones (con selector de idioma). */
'use strict';
const api = globalThis.browser || globalThis.chrome;
const { settings: S, shortcuts: SC, i18n: I18N, errors: E, docStore: DS, pdfText: PT, docManager: DM } = globalThis.Aqua;
const KEY = 'aqua.apiKey';
const SETTINGS = 'aqua.settings';
const ORIGINS = ['https://generativelanguage.googleapis.com/*'];
const $ = (id) => document.getElementById(id);

const docs = DS.createDocStore({ indexedDB: globalThis.indexedDB });

let lang = I18N.DEFAULT_LANG;
let keyShown = false;
const T = (k, p) => I18N.t(lang, k, p);

function say(id, text, kind) {
  const n = $(id);
  n.textContent = text;
  n.className = `status ${kind || ''}`;
}

function applyI18n() {
  document.documentElement.lang = lang;
  document.title = `Aqua · ${T('opt.title')}`;
  document.querySelectorAll('[data-i18n]').forEach((n) => (n.textContent = T(n.dataset.i18n)));
  document.querySelectorAll('[data-i18n-ph]').forEach((n) => (n.placeholder = T(n.dataset.i18nPh)));
  $('toggleKey').textContent = keyShown ? T('opt.hideKey') : T('opt.show');
}

function paintSwatches() {
  const color = S.PALETTES[$('uiPalette').value] || S.PALETTES.classic;
  $('swA').style.color = color;
  $('swB').style.color = color;
}

async function renderKeyStatus() {
  const o = await api.storage.local.get(KEY);
  say('keyStatus', o[KEY] ? T('opt.keyHas') : T('opt.keyNone'), o[KEY] ? 'ok' : '');
}

async function renderAccess() {
  let ok = true;
  try {
    ok = await api.permissions.contains({ origins: ORIGINS });
  } catch (_) {
    /* sin API de permisos: se asume concedido */
  }
  $('grantAccess').hidden = ok;
  say('accessStatus', ok ? T('opt.accessOk') : T('opt.accessMissing'), ok ? 'ok' : 'err');
}

// Campo que "graba" la combinación al pulsarla (no hay que escribirla). Solo Firefox (commands.update).
function shortcutEditor(c) {
  const cell = document.createElement('td');
  const input = document.createElement('input');
  input.readOnly = true;
  input.value = c.shortcut || '';
  input.placeholder = T('opt.scPlaceholder');
  input.setAttribute('aria-label', `${T(`cmd.${c.name}`)}: ${T('opt.scPlaceholder')}`);
  const mac = /Mac/i.test(navigator.platform || '');
  const reasons = { 'modifier-only': 'opt.reasonModifier', 'needs-modifier': 'opt.reasonNeedsMod', 'unsupported-key': 'opt.reasonUnsupported' };
  input.addEventListener('focus', () => say('shortcutStatus', T('opt.scPrompt')));
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Tab') return; // permite salir del campo con el teclado
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      input.value = c.shortcut || '';
      input.blur();
      return say('shortcutStatus', '');
    }
    const r = SC.shortcutFromEvent(e, mac);
    if (!r.ok) return r.reason === 'modifier-only' ? undefined : say('shortcutStatus', T(reasons[r.reason]), 'err');
    try {
      await api.commands.update({ name: c.name, shortcut: r.shortcut });
      say('shortcutStatus', T('opt.scRegistered', { s: r.shortcut }), 'ok');
    } catch (_) {
      say('shortcutStatus', T('opt.scUnsupported', { s: r.shortcut }), 'err');
    }
    input.blur();
    renderShortcuts(true);
  });
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = T('opt.scReset');
  reset.addEventListener('click', async () => {
    try {
      await api.commands.reset(c.name);
      say('shortcutStatus', T('opt.scResetOk'), 'ok');
    } catch (_) {
      say('shortcutStatus', T('opt.scResetFail'), 'err');
    }
    renderShortcuts(true);
  });
  cell.append(input, reset);
  return cell;
}

async function renderShortcuts(keepStatus) {
  const tbody = document.querySelector('#shortcuts tbody');
  tbody.replaceChildren();
  let missing = false;
  try {
    const cmds = await api.commands.getAll();
    for (const c of cmds.filter((x) => !x.name.startsWith('_'))) {
      const tr = document.createElement('tr');
      const a = document.createElement('td');
      const b = document.createElement('td');
      a.textContent = T(`cmd.${c.name}`);
      b.textContent = c.shortcut || T('opt.scNone');
      if (!c.shortcut) missing = true;
      tr.append(a, b);
      if (typeof api.commands.update === 'function') {
        $('changeCol').hidden = false;
        tr.appendChild(shortcutEditor(c));
      }
      tbody.appendChild(tr);
    }
  } catch (_) {
    missing = true;
  }
  const isFirefox = /Firefox\//.test(navigator.userAgent || '');
  $('shortcutHelp').textContent = (missing ? T('opt.scMissing') : '') + T(isFirefox ? 'opt.scHowFirefox' : 'opt.scHowChrome') + T('opt.scTail');
  if (!keepStatus) say('shortcutStatus', '');
}

// ---- PDF de referencia (opción B): se leen aquí, en el navegador; el índice se guarda en IndexedDB.
async function loadPdfjs() {
  if (globalThis.__aquaLoadPdfjs) return globalThis.__aquaLoadPdfjs(); // gancho solo para pruebas
  const m = await import('./vendor/pdfjs/pdf.mjs');
  m.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.mjs', location.href).href;
  return m;
}

async function renderDocs() {
  const list = await docs.listDocs();
  const ul = $('docsList');
  ul.replaceChildren();
  for (const d of list) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = d.name;
    name.title = d.name;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = T('opt.docsMeta', { pages: d.pages, chunks: d.chunks });
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = T('opt.docsDelete');
    del.addEventListener('click', async () => {
      await docs.deleteDoc(d.id);
      say('docsStatus', T('opt.docsDeleted'), 'ok');
      renderDocs();
    });
    li.append(name, meta, del);
    ul.appendChild(li);
  }
  $('docsNone').hidden = list.length > 0;
  $('docsDeleteAll').hidden = list.length === 0;
  const chars = list.reduce((n, d) => n + d.chars, 0);
  $('docsUsage').textContent = list.length ? T('opt.docsUsage', { used: list.length, max: DM.LIMITS.maxDocs, chars: chars.toLocaleString(lang) }) : '';
}

async function saveDocsSettings() {
  const s = S.sanitizeSettings({ ...(await currentSettings()), docs: { enabled: $('docsEnabled').checked, k: $('docsK').value } });
  await api.storage.local.set({ [SETTINGS]: s });
  $('docsK').value = s.docs.k;
  $('docsWarn').hidden = !s.docs.enabled; // al activarlo se muestra el aviso de coste y privacidad
  say('docsStatus', T('opt.docsSaved'), 'ok');
}

async function addPdfs(files) {
  const results = $('docsResults');
  results.replaceChildren();
  let pdfjs;
  try {
    pdfjs = await loadPdfjs();
  } catch (_) {
    say('docsStatus', E.messageFor('UNKNOWN', lang), 'err');
    return;
  }
  const out = await DM.addPdfFiles({
    files,
    store: docs,
    extract: (bytes, onP) => PT.extractPdf(pdfjs, bytes, { onProgress: onP }),
    onProgress: (name, i, n) => say('docsStatus', T('opt.docsReading', { name, i, n })),
  });
  for (const r of out) {
    const li = document.createElement('li');
    li.textContent = r.ok ? T('opt.docsAdded', { name: r.name, pages: r.pages, chunks: r.chunks }) : T('opt.docsFailed', { name: r.name, reason: E.messageFor(r.code, lang) });
    results.appendChild(li);
  }
  say('docsStatus', '');
  await renderDocs();
}

async function load() {
  const o = await api.storage.local.get([KEY, SETTINGS]);
  const s = S.sanitizeSettings(o[SETTINGS]);
  lang = s.lang;
  $('lang').value = lang;
  $('model').value = s.model;
  $('timeoutMs').value = s.timeoutMs;
  $('maxChars').value = s.maxChars;
  $('uiPalette').value = s.ui.palette;
  $('uiSize').value = s.ui.size;
  $('uiOpacity').value = s.ui.opacity;
  $('uiOpacityVal').textContent = s.ui.opacity;
  $('uiBg').value = s.ui.bg;
  $('uiSide').value = s.ui.side;
  $('hoverOnly').checked = s.ui.hoverOnly;
  $('docsEnabled').checked = s.docs.enabled;
  $('docsK').value = s.docs.k;
  $('docsWarn').hidden = !s.docs.enabled;
  $('idleEnabled').checked = s.idle.enabled;
  $('idleSeconds').value = s.idle.seconds;
  $('defaultModel').textContent = S.DEFAULT_MODEL;
  $('models').replaceChildren(...S.SUGGESTED_MODELS.map((m) => Object.assign(document.createElement('option'), { value: m })));
  applyI18n();
  paintSwatches();
  await renderKeyStatus();
  await renderAccess();
  await renderShortcuts();
  await renderDocs();
}

async function currentSettings() {
  const o = await api.storage.local.get(SETTINGS);
  return o[SETTINGS] || {};
}

$('lang').addEventListener('change', async () => {
  const s = S.sanitizeSettings({ ...(await currentSettings()), lang: $('lang').value });
  await api.storage.local.set({ [SETTINGS]: s });
  lang = s.lang;
  applyI18n();
  await renderKeyStatus();
  await renderAccess();
  await renderShortcuts();
  await renderDocs();
  say('settingsStatus', '');
  say('uiStatus', '');
  say('langStatus', T('opt.langSaved'), 'ok');
});

$('toggleKey').addEventListener('click', () => {
  keyShown = $('apiKey').type === 'password';
  $('apiKey').type = keyShown ? 'text' : 'password';
  $('toggleKey').textContent = keyShown ? T('opt.hideKey') : T('opt.show');
});

$('saveKey').addEventListener('click', async () => {
  const key = $('apiKey').value.trim();
  if (!S.looksLikeApiKey(key)) return say('keyStatus', T('opt.keyInvalid'), 'err');
  await api.storage.local.set({ [KEY]: key });
  $('apiKey').value = '';
  say('keyStatus', T('opt.keySaved'), 'ok');
});

$('deleteKey').addEventListener('click', async () => {
  await api.storage.local.remove(KEY);
  $('apiKey').value = '';
  say('keyStatus', T('opt.keyDeleted'), 'ok');
});

$('uiPalette').addEventListener('change', paintSwatches);
$('uiOpacity').addEventListener('input', () => ($('uiOpacityVal').textContent = $('uiOpacity').value));

// Guarda la apariencia conservando el resto de ajustes ya guardados.
$('saveUi').addEventListener('click', async () => {
  const s = S.sanitizeSettings({ ...(await currentSettings()), ui: { size: $('uiSize').value, opacity: $('uiOpacity').value, side: $('uiSide').value, bg: $('uiBg').value, palette: $('uiPalette').value, hoverOnly: $('hoverOnly').checked }, idle: { enabled: $('idleEnabled').checked, seconds: $('idleSeconds').value } });
  await api.storage.local.set({ [SETTINGS]: s });
  $('uiOpacity').value = s.ui.opacity;
  $('uiOpacityVal').textContent = s.ui.opacity;
  $('idleSeconds').value = s.idle.seconds;
  say('uiStatus', T('opt.uiSaved'), 'ok');
});

$('saveSettings').addEventListener('click', async () => {
  const model = S.normalizeModelName($('model').value);
  if (!model) return say('settingsStatus', T('opt.modelInvalid'), 'err');
  const s = S.sanitizeSettings({ ...(await currentSettings()), model, timeoutMs: $('timeoutMs').value, maxChars: $('maxChars').value });
  await api.storage.local.set({ [SETTINGS]: s });
  $('timeoutMs').value = s.timeoutMs;
  $('maxChars').value = s.maxChars;
  say('settingsStatus', T('opt.settingsSaved'), 'ok');
});

$('testConn').addEventListener('click', async () => {
  say('settingsStatus', T('opt.testing'));
  const r = await api.runtime.sendMessage({ type: 'AQUA_TEST' });
  if (r && r.ok) say('settingsStatus', T('opt.testOk', { model: r.model }), 'ok');
  else say('settingsStatus', r && r.error ? E.messageFor(r.error.code, lang) : T('opt.testUnknown'), 'err');
});

$('grantAccess').addEventListener('click', async () => {
  try {
    await api.permissions.request({ origins: ORIGINS });
  } catch (_) {
    say('accessStatus', T('opt.accessFail'), 'err');
    return;
  }
  await renderAccess();
});

$('docsEnabled').addEventListener('change', saveDocsSettings);
$('docsK').addEventListener('change', saveDocsSettings);
$('docsAdd').addEventListener('click', () => $('docsFiles').click());
$('docsFiles').addEventListener('change', async () => {
  const files = [...$('docsFiles').files];
  $('docsFiles').value = ''; // permite volver a elegir el mismo archivo
  if (files.length) await addPdfs(files);
});
$('docsDeleteAll').addEventListener('click', async () => {
  await docs.clear();
  $('docsResults').replaceChildren();
  say('docsStatus', T('opt.docsDeleted'), 'ok');
  renderDocs();
});

load();
