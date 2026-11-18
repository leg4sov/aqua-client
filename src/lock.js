/* Aqua · contraseña de acceso, una vez por sesión del navegador (storage.session se borra al cerrarlo).
   Es una barrera sencilla contra curiosos, no seguridad real: el hash va dentro del código. */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});
  // sha256 de la contraseña. Vacío ('') = sin contraseña. Para cambiarla: printf %s 'NUEVA' | sha256sum
  const PASS_HASH = '6ae4caf142922ee5d403f40c341216ba771781b105443b41abcedaef610ac4be';
  const FLAG = 'aqua.unlocked';

  async function sha256Hex(s) {
    const d = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** store = api.storage.session. Sin él (navegador antiguo o pruebas) no hay bloqueo. */
  function createLock(store, hash = PASS_HASH) {
    return {
      async isLocked() {
        return !!store && !!hash && !(await store.get(FLAG))[FLAG];
      },
      async unlock(password) {
        if (!store || !hash) return true;
        if (typeof password !== 'string' || (await sha256Hex(password)) !== hash) return false;
        await store.set({ [FLAG]: true });
        return true;
      },
    };
  }

  const api = { createLock, FLAG, PASS_HASH };
  A.lock = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
