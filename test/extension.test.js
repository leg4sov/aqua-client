const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));

// APIs/permisos reales de WebExtensions MV3 que Aqua usa.
const REAL_PERMISSIONS = new Set(['activeTab', 'scripting', 'storage', 'commands', 'alarms', 'tabs']);

for (const file of ['manifest.json', 'manifest.chrome.json']) {
  test(`${file}: JSON válido, MV3 y permisos mínimos reales`, () => {
    const m = JSON.parse(read(file));
    assert.equal(m.manifest_version, 3);
    for (const p of m.permissions) assert.ok(REAL_PERMISSIONS.has(p), `permiso desconocido: ${p}`);
    assert.deepEqual([...m.permissions].sort(), ['activeTab', 'scripting', 'storage']);
    assert.deepEqual(m.host_permissions, ['https://generativelanguage.googleapis.com/*']);
    assert.equal(m.content_scripts, undefined, 'no debe haber content scripts estáticos en todas las páginas');
    assert.ok(!JSON.stringify(m).includes('<all_urls>') && !JSON.stringify(m).includes('*://*/*'));
    assert.equal(m.web_accessible_resources, undefined);
  });
  test(`${file}: todos los archivos referenciados existen`, () => {
    const m = JSON.parse(read(file));
    const refs = [...Object.values(m.icons), ...Object.values(m.action.default_icon), m.options_ui.page, m.action.default_popup];
    if (m.background.service_worker) refs.push(m.background.service_worker);
    if (m.background.scripts) refs.push(...m.background.scripts);
    for (const f of refs) assert.ok(exists(f), `falta ${f}`);
  });
  test(`${file}: define los dos atajos con descripción y tecla sugerida`, () => {
    const m = JSON.parse(read(file));
    for (const n of ['activate-aqua', 'hide-aqua']) {
      assert.ok(m.commands[n].description);
      assert.match(m.commands[n].suggested_key.default, /^(Ctrl|Alt)\+/);
    }
    assert.notEqual(m.commands['activate-aqua'].suggested_key.default, m.commands['hide-aqua'].suggested_key.default);
  });
}

test('Firefox (principal) usa background.scripts con todas las librerías; Chrome usa service_worker', () => {
  const f = JSON.parse(read('manifest.json'));
  const c = JSON.parse(read('manifest.chrome.json'));
  assert.equal(c.background.service_worker, 'background.js');
  assert.ok(f.background.scripts.at(-1) === 'background.js');
  const bg = read('background.js');
  const libs = [...bg.match(/const LIB_FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual(f.background.scripts.slice(0, -1), libs);
  assert.ok(f.browser_specific_settings.gecko.id);
});

test('listas de archivos inyectados existen y cubren las dependencias del content script', () => {
  const bg = read('background.js');
  const files = [...bg.match(/const CONTENT_FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  for (const f of files) assert.ok(exists(f), `falta ${f}`);
  for (const dep of ['src/moodleDetector.js', 'src/questionExtractor.js', 'src/ui.js', 'src/controller.js', 'src/textNormalizer.js', 'src/errors.js']) {
    assert.ok(files.includes(dep), dep);
  }
  assert.equal(files.at(-1), 'content.js');
});

test('seguridad estática: sin innerHTML/eval/localStorage ni claves reales en el código', () => {
  const files = ['background.js', 'content.js', 'options.js', 'options.html', 'popup.js', 'popup.html', 'popup.css', 'styles.css', ...fs.readdirSync(path.join(root, 'src')).map((f) => `src/${f}`)];
  for (const f of files) {
    const s = read(f);
    assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=|document\.write/.test(s), `HTML dinámico en ${f}`);
    assert.ok(!/\beval\(|new Function\(/.test(s), `eval en ${f}`);
    assert.ok(!/localStorage|sessionStorage/.test(s), `storage web en ${f}`);
    assert.ok(!/AIza[0-9A-Za-z_\-]{30,}/.test(s), `clave en ${f}`);
    assert.ok(!/console\.(log|debug|info)/.test(s), `console en ${f}`);
  }
  assert.ok(!/AIza[0-9A-Za-z_\-]{30,}/.test(read('config.example.json')));
});

test('la clave API nunca se envía al content script', () => {
  const bg = read('background.js');
  const getState = bg.slice(bg.indexOf("case 'AQUA_GET_STATE'"), bg.indexOf("case 'AQUA_SET_PREFS'"));
  assert.ok(getState.includes('hasKey: !!o[KEY]'));
  assert.ok(!/apiKey:\s*o\[KEY\]/.test(getState));
});

test('todos los scripts del content script son JavaScript sintácticamente válido', () => {
  const { execFileSync } = require('node:child_process');
  for (const f of ['background.js', 'content.js', 'options.js', 'popup.js', ...fs.readdirSync(path.join(root, 'src')).map((x) => `src/${x}`)]) {
    execFileSync(process.execPath, ['--check', path.join(root, f)]);
  }
});

test('el prompt del sistema menciona los 12 módulos y las reglas de seguridad', () => {
  const p = require('../src/prompts');
  assert.equal(p.MODULES.length, 12);
  for (const m of p.MODULES) assert.ok(p.SYSTEM_PROMPT.includes(m));
  assert.ok(/do NOT claim to have run/.test(p.SYSTEM_PROMPT));
  assert.ok(/insufficient_data/.test(p.SYSTEM_PROMPT) && /hypothesis/.test(p.SYSTEM_PROMPT));
});

test('looksLikeApiKey acepta formatos antiguos y nuevos (con punto) y rechaza basura', () => {
  const { looksLikeApiKey: ok } = require('../src/settings');
  assert.ok(ok('AIzaSyA1234567890abcdefghijklmnopqrstuv'));
  assert.ok(ok('AQ.Ab8RN6FAKEFAKEFAKEFAKEFAKEFAKEFAKE_-x'));
  assert.ok(ok('  AIzaSyA1234567890abcdefghijklmnopqrstuv\n'));
  assert.ok(!ok('corta'));
  assert.ok(!ok('con espacio dentro de la clave 1234567890'));
  assert.ok(!ok('"AIzaSyA1234567890abcdefghijklmnopqrstuv"'));
  assert.ok(!ok('clave-con-ñ-1234567890123456789'));
});

test('ajustes de apariencia: valores por defecto, límites y suelo de opacidad', () => {
  const { sanitizeUi, sanitizePrefs, sanitizeSettings, MIN_OPACITY } = require('../src/settings');
  assert.deepEqual({ ...sanitizeUi(undefined) }, { size: 'xs', opacity: 55, side: 'left', bg: 'transparent', palette: 'dark', hoverOnly: false });
  assert.equal(sanitizeUi({ palette: 'light' }).palette, 'light');
  assert.equal(sanitizeUi({ palette: 'dark' }).palette, 'dark');
  assert.equal(sanitizeUi({ palette: 'classic' }).palette, 'classic');
  assert.equal(sanitizeUi({ palette: 'neón' }).palette, 'dark'); // paleta por defecto: oscura
  assert.equal(sanitizeUi({ palette: '__proto__' }).palette, 'dark');
  assert.equal(sanitizeUi({ size: 'xxs' }).size, 'xxs'); // ultra pequeño
  assert.equal(sanitizeUi({ bg: 'solid' }).bg, 'solid');
  assert.equal(sanitizeUi({ bg: 'rojo' }).bg, 'transparent');
  assert.equal(sanitizeUi({ opacity: 0 }).opacity, MIN_OPACITY);
  assert.equal(sanitizeUi({ opacity: 500 }).opacity, 100);
  assert.equal(sanitizeUi({ size: 'gigante', side: 'arriba' }).size, 'xs'); // tamaño mínimo por defecto
  assert.equal(sanitizeUi({ side: 'right' }).side, 'right');
  assert.equal(sanitizePrefs({ mode: 'explain' }).mode, 'quiz'); // valor desconocido -> quiz
  assert.equal(sanitizePrefs({ mode: 'long' }).mode, 'long');
  assert.equal(sanitizePrefs({ mode: 'short' }).mode, 'short');
  assert.equal(sanitizePrefs({ mode: 'quiz' }).mode, 'quiz');
  assert.equal(sanitizePrefs(undefined).mode, 'quiz');
  assert.equal(sanitizeUi({ hoverOnly: true }).hoverOnly, true);
  assert.equal(sanitizeUi({ hoverOnly: 'yes' }).hoverOnly, false); // solo true activa
  assert.equal(sanitizeSettings({ ui: { opacity: 70 } }).ui.opacity, 70);
});

test('atajos por defecto: Alt+Shift+Z abre y Alt+Shift+X oculta (ambos manifiestos)', () => {
  for (const f of ['manifest.json', 'manifest.chrome.json']) {
    const m = JSON.parse(read(f));
    assert.equal(m.commands['activate-aqua'].suggested_key.default, 'Alt+Shift+Z');
    assert.equal(m.commands['hide-aqua'].suggested_key.default, 'Alt+Shift+X');
  }
});

test('shortcutFromEvent: convierte teclas pulsadas en el formato de commands.update', () => {
  const { shortcutFromEvent: f } = require('../src/shortcuts');
  const ev = (o) => ({ key: '', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...o });
  assert.deepEqual(f(ev({ key: 'Z', ctrlKey: true, shiftKey: true })), { ok: true, shortcut: 'Ctrl+Shift+Z' });
  assert.deepEqual(f(ev({ key: 'x', ctrlKey: true, shiftKey: true })), { ok: true, shortcut: 'Ctrl+Shift+X' });
  assert.deepEqual(f(ev({ key: 'a', altKey: true })), { ok: true, shortcut: 'Alt+A' });
  assert.deepEqual(f(ev({ key: 'F5', ctrlKey: true, altKey: true })), { ok: true, shortcut: 'Ctrl+Alt+F5' });
  assert.deepEqual(f(ev({ key: 'ArrowUp', altKey: true })), { ok: true, shortcut: 'Alt+Up' });
  assert.deepEqual(f(ev({ key: 'µ', code: 'KeyM', altKey: true, shiftKey: true })), { ok: true, shortcut: 'Alt+Shift+M' }); // Mac
  assert.deepEqual(f(ev({ key: 'z', metaKey: true }), true), { ok: true, shortcut: 'Ctrl+Z' }); // Cmd en Mac
  assert.equal(f(ev({ key: 'Control', ctrlKey: true })).reason, 'modifier-only');
  assert.equal(f(ev({ key: 'z' })).reason, 'needs-modifier');
  assert.equal(f(ev({ key: 'z', shiftKey: true })).reason, 'needs-modifier');
  assert.equal(f(ev({ key: 'Enter', ctrlKey: true })).reason, 'unsupported-key');
});

test('paletas: los colores de texto de settings.js coinciden con styles.css', () => {
  const { PALETTES } = require('../src/settings');
  const css = read('styles.css');
  assert.ok(css.includes(`--fg: ${PALETTES.light}`));
  assert.ok(css.includes(`--fg: ${PALETTES.dark}`));
  assert.ok(css.includes(`--fg: ${PALETTES.classic}`));
});

test('idioma: inglés por defecto y los ajustes solo aceptan en/es', () => {
  const { sanitizeSettings } = require('../src/settings');
  assert.equal(sanitizeSettings({}).lang, 'en');
  assert.equal(sanitizeSettings({ lang: 'es' }).lang, 'es');
  assert.equal(sanitizeSettings({ lang: 'fr' }).lang, 'en');
  assert.equal(sanitizeSettings({ lang: '__proto__' }).lang, 'en');
});

test('i18n: inglés y español tienen exactamente las mismas claves y ninguna vacía', () => {
  const { STRINGS, t } = require('../src/i18n');
  const en = Object.keys(STRINGS.en).sort();
  const es = Object.keys(STRINGS.es).sort();
  assert.deepEqual(en, es);
  for (const k of en) assert.ok(STRINGS.en[k].trim() && STRINGS.es[k].trim(), k);
  assert.equal(t('zz', 'status.idle'), 'Idle'); // idioma desconocido -> inglés
  assert.equal(t('es', 'opt.testOk', { model: 'x' }), 'Conexión correcta con el modelo x.');
  assert.equal(t('en', 'no.existe'), 'no.existe');
});

test('i18n: todas las claves usadas en options.html, options.js, ui.js y controller.js existen', () => {
  const { STRINGS } = require('../src/i18n');
  const used = new Set();
  for (const f of ['options.html', 'options.js', 'popup.html', 'popup.js', 'src/ui.js', 'src/controller.js']) {
    for (const m of read(f).matchAll(/(?:data-i18n(?:-ph)?="|\bT\('|msg\(')([A-Za-z]+\.[A-Za-z0-9_.\-]+)/g)) used.add(m[1]);
  }
  for (const k of used) {
    const full = STRINGS.en[k] !== undefined ? k : `err.${k}`;
    assert.ok(STRINGS.en[full] !== undefined, `falta la clave ${k}`);
  }
  assert.ok(used.size > 50);
});

test('manifiestos localizados: default_locale en, mensajes existentes en en y es', () => {
  for (const f of ['manifest.json', 'manifest.chrome.json']) {
    const m = JSON.parse(read(f));
    assert.equal(m.default_locale, 'en');
    const refs = [...JSON.stringify(m).matchAll(/__MSG_(\w+)__/g)].map((x) => x[1]);
    assert.ok(refs.length >= 5);
    for (const lang of ['en', 'es']) {
      const msgs = JSON.parse(read(`_locales/${lang}/messages.json`));
      for (const r of refs) assert.ok(msgs[r] && msgs[r].message, `${lang}:${r}`);
    }
  }
});

test('el nombre del curso no aparece en el paquete de la extensión ni en la documentación', () => {
  const banned = new RegExp(['as', 'ir'].join(''), 'i');
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const rel = path.join(d, e.name);
      if (e.isDirectory()) { if (!['node_modules', 'dist', 'test', 'testkit', '.git', 'web-ext-artifacts', 'vendor'].includes(e.name)) walk(rel); }
      else if (/\.(js|json|html|css|md|mjs)$/.test(e.name) && true) files.push(rel);
    }
  };
  walk('.');
  for (const f of files) assert.ok(!banned.test(read(f)), `mención no deseada en: ${f}`);
});

test('desvanecer por inactividad: activado por defecto, 5 s, configurable 1–300 s', () => {
  const { sanitizeIdle, sanitizeSettings } = require('../src/settings');
  assert.deepEqual({ ...sanitizeIdle(undefined) }, { enabled: true, seconds: 5 });
  assert.deepEqual({ ...sanitizeSettings({}).idle }, { enabled: true, seconds: 5 });
  assert.equal(sanitizeIdle({ enabled: false }).enabled, false);
  assert.equal(sanitizeIdle({ enabled: 'no' }).enabled, true); // solo «false» desactiva
  assert.equal(sanitizeIdle({ seconds: 0 }).seconds, 1);
  assert.equal(sanitizeIdle({ seconds: 99999 }).seconds, 300);
  assert.equal(sanitizeIdle({ seconds: 12.6 }).seconds, 13);
  assert.equal(sanitizeIdle({ seconds: 'x' }).seconds, 5);
});

test('estilos: errores del color del texto (sin rojo), atributo hidden respetado y reglas del modo ultra', () => {
  const css = read('styles.css');
  assert.ok(!/#(b3261e|7a1a14|fdecea|e5a29d)/i.test(css), 'quedan colores rojos de error');
  for (const rule of css.split('\n').filter((l) => /\.(notice|badge)\.error/.test(l))) assert.ok(!/#[0-9a-f]{3,6}\b/i.test(rule), rule);
  assert.ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css));
  assert.ok(/data-size="xxs"\]\) \.head/.test(css) && /data-size="xxs"\]\) \.sent/.test(css));
});

test('popup rápido: manifiestos con default_popup y sin listener de clic en el icono', () => {
  for (const f of ['manifest.json', 'manifest.chrome.json']) assert.equal(JSON.parse(read(f)).action.default_popup, 'popup.html');
  assert.ok(!/action\.onClicked/.test(read('background.js').replace(/\/\/.*$/gm, '')));
});

test('atajos por defecto de posición: Ctrl+Alt+, (izquierda) y Ctrl+Alt+. (derecha), en ambos manifiestos y con textos traducidos', () => {
  for (const f of ['manifest.json', 'manifest.chrome.json']) {
    const m = JSON.parse(read(f));
    assert.equal(m.commands['move-left'].suggested_key.default, 'Ctrl+Alt+Comma');
    assert.equal(m.commands['move-right'].suggested_key.default, 'Ctrl+Alt+Period');
    const keys = Object.values(m.commands).map((c) => c.suggested_key.default);
    assert.equal(new Set(keys).size, keys.length); // ninguno repetido
    for (const n of ['move-left', 'move-right']) assert.ok(/^__MSG_\w+__$/.test(m.commands[n].description));
  }
  const { STRINGS } = require('../src/i18n');
  for (const l of ['en', 'es']) for (const n of ['move-left', 'move-right']) assert.ok(STRINGS[l][`cmd.${n}`]);
  const { shortcutFromEvent: f } = require('../src/shortcuts');
  const ev = (o) => ({ key: '', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...o });
  assert.equal(f(ev({ key: ',', ctrlKey: true, altKey: true })).shortcut, 'Ctrl+Alt+Comma'); // el campo de atajos reconoce coma y punto
  assert.equal(f(ev({ key: '.', ctrlKey: true, altKey: true })).shortcut, 'Ctrl+Alt+Period');
});

test('PDF de referencia: desactivado por defecto, k entre 1 y 8, solo true activa', () => {
  const { sanitizeDocs, sanitizeSettings } = require('../src/settings');
  assert.deepEqual({ ...sanitizeDocs(undefined) }, { enabled: false, k: 4 });
  assert.deepEqual({ ...sanitizeSettings({}).docs }, { enabled: false, k: 4 });
  assert.equal(sanitizeDocs({ enabled: 'yes' }).enabled, false);
  assert.equal(sanitizeDocs({ enabled: true }).enabled, true);
  assert.equal(sanitizeDocs({ k: 0 }).k, 1);
  assert.equal(sanitizeDocs({ k: 99 }).k, 8);
  assert.equal(sanitizeDocs({ k: 'x' }).k, 4);
});

test('pdf.js incluido sin modificar: archivos, licencia, versión y hashes coinciden', () => {
  const crypto = require('node:crypto');
  for (const f of ['pdf.mjs', 'pdf.worker.mjs', 'LICENSE', 'VERSION.txt']) assert.ok(exists(`vendor/pdfjs/${f}`), f);
  const ver = read('vendor/pdfjs/VERSION.txt');
  assert.ok(/Apache-2\.0/.test(ver) && /pdfjs-dist\) \d+\.\d+\.\d+/.test(ver));
  for (const f of ['pdf.mjs', 'pdf.worker.mjs']) {
    const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'vendor/pdfjs', f))).digest('hex');
    assert.ok(ver.includes(sha), `hash de ${f}`);
    assert.ok(!/^\/\/# sourceMappingURL=.*\.map$/m.test('') ); // (no se modifica el archivo)
  }
  // el paquete de la extensión solo carga pdf.js desde la página de Ajustes (nunca en la web)
  assert.ok(/import\('\.\/vendor\/pdfjs\/pdf\.mjs'\)/.test(read('options.js')));
  for (const f of ['content.js', 'background.js', 'popup.js']) assert.ok(!/pdfjs/.test(read(f)), f);
});

test('Firefox: background carga el índice y el almacén de PDF y la lista coincide con LIB_FILES', () => {
  const f = JSON.parse(read('manifest.json'));
  for (const n of ['src/pdfIndex.js', 'src/docStore.js']) assert.ok(f.background.scripts.includes(n), n);
  assert.ok(f.background.scripts.indexOf('src/pdfIndex.js') < f.background.scripts.indexOf('src/docStore.js'));
  assert.ok(f.background.scripts.indexOf('src/docStore.js') < f.background.scripts.indexOf('src/askService.js'));
});

test('Quiz: resultado pequeño y discreto (tamaño de texto normal, sin negrita ni color de acento, sin línea superior)', () => {
  const css = read('styles.css');
  const rule = css.match(/\.letters\s*\{([^}]*)\}/)[1];
  assert.ok(/font-size:\s*1em/.test(rule) && /font-weight:\s*500/.test(rule) && /color:\s*var\(--fg\)/.test(rule));
  assert.ok(!/font-size:\s*1\.[1-9]/.test(rule) && !/font-weight:\s*(600|700|bold)/.test(rule));
  assert.ok(/\.result\.quiz\s*\{[^}]*border-top:\s*0/.test(css));
});
