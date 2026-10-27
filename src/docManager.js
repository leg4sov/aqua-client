/* Aqua · alta de PDF: valida límites, extrae texto, trocea, indexa y guarda. Sin DOM (lo usa la página de Ajustes). */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});
  const isNode = typeof module === 'object';
  const { AquaError } = isNode ? require('./errors') : A.errors;
  const idx = isNode ? require('./pdfIndex') : A.pdfIndex;

  const LIMITS = Object.freeze({ maxDocs: 10, maxFileBytes: 20 * 1024 * 1024, maxTotalChars: 3000000 });

  function looksLikePdf(file) {
    return /\.pdf$/i.test(file.name || '') || file.type === 'application/pdf';
  }

  /**
   * @param {{files:{name:string,size:number,type?:string,arrayBuffer:()=>Promise<ArrayBuffer>}[], extract:(bytes:Uint8Array)=>Promise<{numPages:number,pages:object[]}>,
   *          store:object, onProgress?:Function, limits?:object}} o
   * @returns {Promise<{name:string, ok:boolean, code?:string, pages?:number, chunks?:number}[]>}
   */
  async function addPdfFiles(o) {
    const limits = { ...LIMITS, ...(o.limits || {}) };
    const results = [];
    for (const file of o.files) {
      const r = { name: file.name, ok: false };
      try {
        if (!looksLikePdf(file)) throw new AquaError('NOT_PDF');
        if (file.size > limits.maxFileBytes) throw new AquaError('PDF_TOO_BIG', `${file.size} bytes`);
        const existing = (await o.store.listDocs()).find((d) => d.name === file.name);
        const others = (await o.store.listDocs()).filter((d) => !existing || d.id !== existing.id);
        if (others.length >= limits.maxDocs) throw new AquaError('DOCS_LIMIT');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { numPages, pages } = await o.extract(bytes, (i, n) => o.onProgress && o.onProgress(file.name, i, n));
        const chunks = idx.chunkPages(pages);
        if (!chunks.length) throw new AquaError('PDF_NO_TEXT');
        const chars = chunks.reduce((n, c) => n + c.text.length, 0);
        const used = others.reduce((n, d) => n + d.chars, 0);
        if (used + chars > limits.maxTotalChars) throw new AquaError('DOCS_LIMIT');
        if (existing) await o.store.deleteDoc(existing.id); // mismo nombre: se reemplaza
        await o.store.addDoc({ name: file.name, bytes: file.size, pages: numPages }, chunks);
        Object.assign(r, { ok: true, pages: numPages, chunks: chunks.length });
      } catch (e) {
        r.code = e && e.code ? e.code : 'UNKNOWN';
      }
      results.push(r);
    }
    return results;
  }

  const api = { LIMITS, addPdfFiles, looksLikePdf };
  A.docManager = api;
  if (isNode && module.exports) module.exports = api;
})();
