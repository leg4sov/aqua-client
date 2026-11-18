/* Aqua · imagen pegada: se reduce y se recomprime en el navegador antes de enviarla (menos tokens y menos peso).
 * Solo se usa en la pestaña activa, tras pegar una imagen el usuario. La imagen no se guarda en ningún sitio. */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});
  const { AquaError } = typeof module === 'object' ? require('./errors') : A.errors;

  const MAX_SIDE = 1568; // lado mayor máximo, en píxeles
  const MAX_BYTES = 3 * 1024 * 1024; // tope tras recomprimir
  const INPUT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];

  /** Escala (sin ampliar nunca) para que el lado mayor no pase de max. */
  function fitSize(w, h, max) {
    const m = max || MAX_SIDE;
    if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 };
    const k = Math.min(1, m / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }

  function toBase64(win, blob) {
    return new Promise((resolve, reject) => {
      const r = new win.FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(new AquaError('IMAGE_INVALID'));
      r.readAsDataURL(blob);
    });
  }

  /** @returns {Promise<{mime:string, data:string}>} JPEG en base64 */
  async function prepare(blob, win) {
    if (!blob || !INPUT_TYPES.includes(blob.type)) throw new AquaError('IMAGE_INVALID');
    let bmp;
    try {
      bmp = await win.createImageBitmap(blob);
    } catch (_) {
      throw new AquaError('IMAGE_INVALID');
    }
    const { w, h } = fitSize(bmp.width, bmp.height, MAX_SIDE);
    if (!w) throw new AquaError('IMAGE_INVALID');
    const canvas = win.document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // las capturas con transparencia se aplanan sobre blanco
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    for (const q of [0.9, 0.75, 0.6]) {
      const out = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', q));
      if (out && out.size > 0 && out.size <= MAX_BYTES) return { mime: 'image/jpeg', data: await toBase64(win, out) };
    }
    throw new AquaError('IMAGE_INVALID');
  }

  const api = { MAX_SIDE, MAX_BYTES, INPUT_TYPES, fitSize, prepare };
  A.imageUtil = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
