/* Aqua · almacén local de PDF indexados (IndexedDB). Los datos no salen del navegador salvo los fragmentos que se envían a Gemini. */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});
  const isNode = typeof module === 'object';
  const idx = isNode ? require('./pdfIndex') : A.pdfIndex;

  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

  function createDocStore({ indexedDB, name = 'aqua-docs' }) {
    let dbp = null;
    function open() {
      if (!dbp) {
        dbp = new Promise((resolve, reject) => {
          const r = indexedDB.open(name, 1);
          r.onupgradeneeded = () => {
            const db = r.result;
            db.createObjectStore('docs', { keyPath: 'id', autoIncrement: true });
            db.createObjectStore('chunks', { keyPath: 'id', autoIncrement: true }).createIndex('doc', 'doc');
            db.createObjectStore('meta', { keyPath: 'key' });
          };
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
      }
      return dbp;
    }
    const bump = async (tx) => {
      const m = tx.objectStore('meta');
      const cur = await req(m.get('version'));
      m.put({ key: 'version', value: (cur ? cur.value : 0) + 1 });
    };

    return {
      async getVersion() {
        const db = await open();
        const r = await req(db.transaction('meta').objectStore('meta').get('version'));
        return r ? r.value : 0;
      },
      /** doc: {name, bytes, pages}; chunks: salida de chunkPages. Devuelve el id del documento. */
      async addDoc(doc, chunks) {
        const db = await open();
        const tx = db.transaction(['docs', 'chunks', 'meta'], 'readwrite');
        const chars = chunks.reduce((n, c) => n + c.text.length, 0);
        const id = await req(tx.objectStore('docs').add({ name: doc.name, bytes: doc.bytes || 0, pages: doc.pages || 0, chunks: chunks.length, chars, addedAt: Date.now() }));
        const cs = tx.objectStore('chunks');
        for (const c of chunks) cs.add({ doc: id, name: doc.name, page: c.page, text: c.text, len: c.len, tf: c.tf });
        await bump(tx);
        await done(tx);
        return id;
      },
      async listDocs() {
        const db = await open();
        return req(db.transaction('docs').objectStore('docs').getAll());
      },
      async totalChars() {
        return (await this.listDocs()).reduce((n, d) => n + d.chars, 0);
      },
      async deleteDoc(id) {
        const db = await open();
        const tx = db.transaction(['docs', 'chunks', 'meta'], 'readwrite');
        tx.objectStore('docs').delete(id);
        const cs = tx.objectStore('chunks');
        const keys = await req(cs.index('doc').getAllKeys(id));
        for (const k of keys) cs.delete(k);
        await bump(tx);
        await done(tx);
      },
      async clear() {
        const db = await open();
        const tx = db.transaction(['docs', 'chunks', 'meta'], 'readwrite');
        tx.objectStore('docs').clear();
        tx.objectStore('chunks').clear();
        await bump(tx);
        await done(tx);
      },
      async getAllChunks() {
        const db = await open();
        return req(db.transaction('chunks').objectStore('chunks').getAll());
      },
      async getChunksByIds(ids) {
        const db = await open();
        const cs = db.transaction('chunks').objectStore('chunks');
        const out = [];
        for (const id of ids) {
          const c = await req(cs.get(id));
          if (c) out.push(c);
        }
        return out;
      },
    };
  }

  /** Servicio de búsqueda con caché en memoria, invalidada cuando cambia la versión del almacén. */
  function createDocService(store) {
    let cache = null;
    let cacheVersion = -1;
    async function chunks() {
      const v = await store.getVersion();
      if (!cache || v !== cacheVersion) {
        cache = await store.getAllChunks();
        cacheVersion = v;
      }
      return cache;
    }
    return {
      async search(query, opts) {
        return idx.search(query, await chunks(), opts);
      },
      async getByIds(ids) {
        const clean = [...new Set((Array.isArray(ids) ? ids : []).filter((n) => Number.isInteger(n) && n > 0))].slice(0, idx.MAX_K);
        return store.getChunksByIds(clean);
      },
    };
  }

  const api = { createDocStore, createDocService };
  A.docStore = api;
  if (isNode && module.exports) module.exports = api;
})();
