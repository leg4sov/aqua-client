/* Aqua · pantalla de contraseña para Ajustes y el popup. La comprobación la hace el background (src/lock.js). */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});
  const FLAG = 'aqua.unlocked'; // misma clave que src/lock.js

  async function isLocked(send) {
    try {
      const r = await send({ type: 'AQUA_LOCK_STATUS' });
      return !!(r && r.locked);
    } catch (_) {
      return false;
    }
  }

  /** Tapa la página con un cuadro de contraseña. true = desbloqueado; false = cancelado (solo si cancellable, con Esc). */
  function ask(doc, { send, t, cancellable }) {
    const api = globalThis.browser || globalThis.chrome;
    return new Promise((resolve) => {
      const wrap = doc.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;visibility:visible;background:Canvas;color:CanvasText;font:14px system-ui,sans-serif;';
      const form = doc.createElement('form');
      form.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:min(260px,80%);';
      const input = doc.createElement('input');
      input.type = 'password';
      input.autocomplete = 'off';
      input.placeholder = t('lock.ph');
      input.setAttribute('aria-label', t('lock.ph'));
      const go = doc.createElement('button');
      go.type = 'submit';
      go.textContent = t('lock.go');
      const msg = doc.createElement('div');
      msg.setAttribute('role', 'alert');
      msg.style.cssText = 'min-height:1.3em;font-size:12px;opacity:.8;';
      form.append(input, go, msg);
      wrap.appendChild(form);

      const onChange = (ch, area) => {
        if (area === 'session' && ch[FLAG] && ch[FLAG].newValue) finish(true); // desbloqueado desde otro sitio (panel, otra pestaña)
      };
      const onKey = (e) => {
        if (e.key === 'Escape' && cancellable) finish(false);
      };
      function finish(ok) {
        if (api.storage && api.storage.onChanged) api.storage.onChanged.removeListener(onChange);
        doc.removeEventListener('keydown', onKey);
        wrap.remove();
        resolve(ok);
      }
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        let r = null;
        try {
          r = await send({ type: 'AQUA_UNLOCK', password: input.value });
        } catch (_) {
          /* sin respuesta del background: cuenta como contraseña no válida */
        }
        if (r && r.unlocked) return finish(true);
        msg.textContent = t('lock.bad');
        input.value = '';
        input.focus();
      });
      if (api.storage && api.storage.onChanged) api.storage.onChanged.addListener(onChange);
      doc.addEventListener('keydown', onKey);
      doc.body.appendChild(wrap);
      input.focus();
    });
  }

  const out = { isLocked, ask };
  A.lockGate = out;
  if (typeof module === 'object' && module.exports) module.exports = out;
})();
