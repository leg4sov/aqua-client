/* Aqua · convierte un evento de teclado en una combinación válida para commands.update (formato WebExtensions). */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});

  const NAMED = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete', ',': 'Comma', '.': 'Period' };
  const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'OS']);

  function keyName(e) {
    const k = e.key;
    if (/^[a-z]$/i.test(k)) return k.toUpperCase();
    if (/^[0-9]$/.test(k)) return k;
    if (/^F([1-9]|1[0-2])$/.test(k)) return k;
    // Con Alt (p. ej. en Mac) e.key puede ser un símbolo: se usa la tecla física.
    if (/^Key[A-Z]$/.test(e.code || '')) return e.code.slice(3);
    if (/^Digit[0-9]$/.test(e.code || '')) return e.code.slice(5);
    return NAMED[k] || null;
  }

  /**
   * @param {{key:string, code?:string, ctrlKey:boolean, altKey:boolean, shiftKey:boolean, metaKey:boolean}} e
   * @param {boolean} [mac]
   * @returns {{ok:true, shortcut:string}|{ok:false, reason:'modifier-only'|'needs-modifier'|'unsupported-key'}}
   */
  function shortcutFromEvent(e, mac) {
    if (MODIFIER_KEYS.has(e.key)) return { ok: false, reason: 'modifier-only' };
    const key = keyName(e);
    if (!key) return { ok: false, reason: 'unsupported-key' };
    const mods = [];
    // En Mac, "Ctrl" del formato = tecla Command y "MacCtrl" = la tecla Control física.
    if (mac ? e.metaKey : e.ctrlKey) mods.push('Ctrl');
    if (mac && e.ctrlKey) mods.push('MacCtrl');
    if (e.altKey) mods.push('Alt');
    if (!mods.length) return { ok: false, reason: 'needs-modifier' }; // Chrome y Firefox exigen Ctrl o Alt
    if (e.shiftKey) mods.push('Shift');
    return { ok: true, shortcut: [...mods, key].join('+') };
  }

  const api = { shortcutFromEvent, keyName };
  A.shortcuts = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
