/* Aqua · extracción de texto de PDF con pdf.js (solo texto; las imágenes se ignoran). pdfjs se inyecta para poder probarlo. */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});
  const isNode = typeof module === 'object';
  const { AquaError } = isNode ? require('./errors') : A.errors;
  const norm = isNode ? require('./textNormalizer') : A.textNormalizer;

  const MAX_PAGES = 1000;

  function pageText(items) {
    let s = '';
    for (const it of items) {
      if (typeof it.str !== 'string') continue;
      s += it.str + (it.hasEOL ? '\n' : ' ');
    }
    // une palabras partidas por guion al final de línea y normaliza espacios
    return norm.normalizeText(s.replace(/-\n(?=\p{Ll})/gu, ''));
  }

  /**
   * @param {object} pdfjs módulo pdfjs-dist
   * @param {Uint8Array} data bytes del PDF
   * @returns {Promise<{numPages:number, pages:{page:number,text:string}[]}>}
   */
  async function extractPdf(pdfjs, data, opts) {
    const onProgress = (opts && opts.onProgress) || (() => {});
    let pdf;
    const task = pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false, verbosity: 0 });
    try {
      pdf = await task.promise;
    } catch (e) {
      await task.destroy().catch(() => {});
      const n = e && e.name;
      if (n === 'PasswordException') throw new AquaError('PDF_ENCRYPTED');
      throw new AquaError('PDF_INVALID', n);
    }
    try {
      if (pdf.numPages > MAX_PAGES) throw new AquaError('PDF_TOO_BIG', `${pdf.numPages} pages`);
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = pageText(content.items);
        if (text) pages.push({ page: i, text });
        page.cleanup();
        onProgress(i, pdf.numPages);
      }
      if (!pages.length) throw new AquaError('PDF_NO_TEXT'); // p. ej. PDF escaneado (solo imágenes)
      return { numPages: pdf.numPages, pages };
    } finally {
      await task.destroy(); // libera el documento y el worker
    }
  }

  const api = { extractPdf, pageText, MAX_PAGES };
  A.pdfText = api;
  if (isNode && module.exports) module.exports = api;
})();
