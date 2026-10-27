/* Aqua · popup rápido: clave, probar conexión, paleta, tamaño y abrir el panel. */
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
}

async function currentSettings() {
  const o = await api.storage.local.get(SETTINGS);
  return o[SETTINGS] || {};
}

async function saveUi(patch) {
  const cur = S.sanitizeSettings(await currentSettings());
  const s = S.sanitizeSettings({ ...cur, ui: { ...cur.ui, ...patch } });
  await api.storage.local.set({ [SETTINGS]: s });
  document.documentElement.dataset.palette = s.ui.palette;
  say('savedStatus', T('pop.saved'));
}

async function load() {
  const o = await api.storage.local.get([KEY, SETTINGS]);
  const s = S.sanitizeSettings(o[SETTINGS]);
  lang = s.lang;
  document.documentElement.dataset.palette = s.ui.palette;
  $('uiPalette').value = s.ui.palette;
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

$('uiPalette').addEventListener('change', () => saveUi({ palette: $('uiPalette').value }));
$('uiSize').addEventListener('change', () => saveUi({ size: $('uiSize').value }));
$('hoverOnly').addEventListener('change', () => saveUi({ hoverOnly: $('hoverOnly').checked }));

load();
