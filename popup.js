/* Aqua · popup: vista inicial de brillo del navegador y, con la gotita, los ajustes rápidos (clave, conexión, paleta, tamaño, panel). */
'use strict';
const api = globalThis.browser || globalThis.chrome;
const { settings: S, i18n: I18N, errors: E } = globalThis.Aqua;
const KEY = 'aqua.apiKey';
const SETTINGS = 'aqua.settings';
const $ = (id) => document.getElementById(id);

let lang = I18N.DEFAULT_LANG;
const T = (k, p) => I18N.t(lang, k, p);

function say(id, text) {
  $(id).textContent = text;
}

function applyI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((n) => (n.textContent = T(n.dataset.i18n)));
  document.querySelectorAll('[data-i18n-ph]').forEach((n) => (n.placeholder = T(n.dataset.i18nPh)));
  document.querySelectorAll('[data-i18n-title]').forEach((n) => (n.title = T(n.dataset.i18nTitle)));
  document.querySelectorAll('[data-i18n-aria]').forEach((n) => n.setAttribute('aria-label', T(n.dataset.i18nAria)));
}

async function currentSettings() {
  const o = await api.storage.local.get(SETTINGS);
  return o[SETTINGS] || {};
}

async function saveUi(patch) {
  const cur = S.sanitizeSettings(await currentSettings());
  const s = S.sanitizeSettings({ ...cur, ui: { ...cur.ui, ...patch } });
  await api.storage.local.set({ [SETTINGS]: s });
  say('savedStatus', T('pop.saved'));
}

async function load() {
  const o = await api.storage.local.get([KEY, SETTINGS]);
  const s = S.sanitizeSettings(o[SETTINGS]);
  lang = s.lang;
  $('uiSize').value = s.ui.size;
  $('hoverOnly').checked = s.ui.hoverOnly;
  applyI18n();
  say('keyStatus', o[KEY] ? T('opt.keyHas') : T('opt.keyNone'));
}

$('saveKey').addEventListener('click', async () => {
  const key = $('apiKey').value.trim();
  if (!S.looksLikeApiKey(key)) return say('keyStatus', T('opt.keyInvalid'));
  await api.storage.local.set({ [KEY]: key });
  $('apiKey').value = '';
  say('keyStatus', T('opt.keySaved'));
});

$('testConn').addEventListener('click', async () => {
  say('testStatus', T('opt.testing'));
  const r = await api.runtime.sendMessage({ type: 'AQUA_TEST' });
  if (r && r.ok) say('testStatus', T('opt.testOk', { model: r.model }));
  else say('testStatus', r && r.error ? E.messageFor(r.error.code, lang) : T('opt.testUnknown'));
});

$('openPanel').addEventListener('click', async () => {
  const r = await api.runtime.sendMessage({ type: 'AQUA_OPEN_PANEL' });
  if (r && r.ok) window.close();
  else say('testStatus', T('pop.openFail'));
});

$('more').addEventListener('click', async (e) => {
  e.preventDefault();
  await api.runtime.openOptionsPage();
  window.close();
});

$('uiSize').addEventListener('change', () => saveUi({ size: $('uiSize').value }));
$('hoverOnly').addEventListener('change', () => saveUi({ hoverOnly: $('hoverOnly').checked }));

// ---- Brillo del navegador (vista inicial) ----
const BRIGHT_MIN = 30;
const BRIGHT_MAX = 150;

function clampBright(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 100;
  return Math.min(BRIGHT_MAX, Math.max(BRIGHT_MIN, Math.round(v)));
}

// Se ejecutan dentro de la página activa (y de sus iframes). Usan una hoja de estilo con
// !important para que ningún estilo de la web pise el filtro.
function pageSetBrightness(percent) {
  const id = 'aqua-brightness-style';
  let el = document.getElementById(id);
  if (percent === 100) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    (document.head || document.documentElement).appendChild(el);
  }
  el.dataset.level = String(percent);
  el.textContent = `html { filter: brightness(${percent}%) !important; }`;
}
function pageReadBrightness() {
  const el = document.getElementById('aqua-brightness-style');
  return el ? Number(el.dataset.level) : 100;
}

async function activeTabId() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab && tab.id != null ? tab.id : null;
}

async function setBrightness(percent) {
  $('brightValue').textContent = `${percent}%`;
  $('brightStatus').textContent = '';
  try {
    const id = await activeTabId();
    if (id == null) throw new Error('no tab');
    await api.scripting.executeScript({ target: { tabId: id, allFrames: true }, func: pageSetBrightness, args: [percent] });
  } catch (_) {
    $('brightStatus').textContent = T('pop.brightErr'); // páginas internas del navegador o sin permiso
  }
}

async function loadBrightness() {
  try {
    const id = await activeTabId();
    if (id == null) return;
    const [r] = await api.scripting.executeScript({ target: { tabId: id }, func: pageReadBrightness });
    const v = clampBright(r && r.result);
    $('brightLevel').value = v;
    $('brightValue').textContent = `${v}%`;
  } catch (_) {
    /* sin permiso en esta página: se queda en 100 % */
  }
}

function showView(settings) {
  $('viewBright').hidden = settings;
  $('viewSettings').hidden = !settings;
}

$('brightLevel').addEventListener('input', () => setBrightness(clampBright($('brightLevel').value)));
$('brightReset').addEventListener('click', () => {
  $('brightLevel').value = 100;
  setBrightness(100);
});
$('toSettings').addEventListener('click', () => showView(true));
$('toBright').addEventListener('click', () => showView(false));

load();
loadBrightness();
