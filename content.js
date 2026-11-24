/* Aqua · content script. Se inyecta SOLO tras una acción explícita del usuario (atajo o botón de la barra). */
(function () {
  'use strict';
  const api = globalThis.browser || globalThis.chrome;
  if (globalThis.__aquaLoaded) return; // evita doble inyección
  globalThis.__aquaLoaded = true;

  const controller = globalThis.Aqua.controller.createController({
    window,
    document,
    send: (msg) => api.runtime.sendMessage(msg),
    openSettings: () => api.runtime.sendMessage({ type: 'AQUA_OPEN_OPTIONS' }).catch(() => {}),
  });

  // Auto activado/desactivado o ajustes de Auto cambiados (popup o Ajustes) con el panel ya abierto.
  if (api.storage && api.storage.onChanged) api.storage.onChanged.addListener((changes, area) => {
    const c = area === 'local' && changes['aqua.settings'];
    if (c && c.newValue && globalThis.Aqua.settings) controller.setAuto(globalThis.Aqua.settings.sanitizeSettings(c.newValue).auto);
  });

  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || sender.id !== api.runtime.id) return false;
    if (msg.type === 'AQUA_PING') {
      sendResponse({ ok: true });
    } else if (msg.type === 'AQUA_SHOW') {
      controller.show(typeof msg.css === 'string' ? msg.css : '').then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
      return true; // respuesta asíncrona
    } else if (msg.type === 'AQUA_SIDE') {
      controller.setSide(msg.side);
      sendResponse({ ok: true });
    } else if (msg.type === 'AQUA_PROVIDER') {
      controller.setProvider(msg.provider);
      sendResponse({ ok: true });
    } else if (msg.type === 'AQUA_UNLOCKED') {
      controller.setLocked(false);
      sendResponse({ ok: true });
    } else if (msg.type === 'AQUA_HIDE') {
      controller.hide();
      sendResponse({ ok: true });
    }
    return false;
  });
})();
