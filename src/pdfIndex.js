/* Aqua · buscador local sobre los PDF del usuario (BM25 sencillo). Funciones puras: sin red ni almacenamiento. */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});

  const CHUNK_WORDS = 220;
  const CHUNK_OVERLAP = 30;
  const DEFAULT_K = 4;
  const MAX_K = 8;
  const MAX_REF_CHARS = 9000; // tope de texto de referencia por consulta (≈ 2.500 tokens)

  const STOP = new Set(
    ('de la que el en y a los del se las por un para con no una su al lo como mas pero sus le ya o este si porque esta entre cuando muy sin sobre tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto antes algunos que unos yo otro otras otra tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo es son ser fue cuales como ' +
      'the of and to in is that for it as was with be by on not he this are or his from at which but have an had they you were their one all we can her has there been if more when will would who so no what how ' +
      'tipo enunciado opciones numeradas opcion unica multiple correcta correctas respuesta respuestas pregunta preguntas texto libre seleccionado usuario').split(/\s+/),
  );

  function tokenize(text) {
    const out = [];
    const words = String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .split(/[^\p{L}\p{N}]+/u);
    for (let w of words) {
      if (w.length < 2) continue;
      if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1); // plural sencillo, igual para índice y consulta
      if (STOP.has(w)) continue;
      out.push(w);
    }
    return out;
  }

  function buildTf(tokens) {
    const tf = {};
    for (const t of tokens) tf[t] = Object.prototype.hasOwnProperty.call(tf, t) ? tf[t] + 1 : 1;
    return tf;
  }

  /** pages: [{page:number, text:string}] -> [{page, text, len, tf}] */
  function chunkPages(pages, opts) {
    const words = (opts && opts.words) || CHUNK_WORDS;
    const overlap = (opts && opts.overlap) === undefined ? CHUNK_OVERLAP : opts.overlap;
    const out = [];
    for (const p of pages) {
      const w = String(p.text || '').split(/\s+/).filter(Boolean);
      if (!w.length) continue;
      for (let start = 0; ; start += Math.max(1, words - overlap)) {
        const text = w.slice(start, start + words).join(' ');
        const tokens = tokenize(text);
        if (tokens.length) out.push({ page: p.page, text, len: tokens.length, tf: buildTf(tokens) });
        if (start + words >= w.length) break;
      }
    }
    return out;
  }

  /**
   * BM25 sobre los fragmentos. Solo devuelve fragmentos con al menos 2 términos distintos de la consulta
   * (1 si la consulta solo tiene uno), para no inyectar texto por una coincidencia casual.
   * chunks: [{id, doc, name, page, text, len, tf}]
   */
  function search(query, chunks, opts) {
    const k = Math.min(MAX_K, Math.max(1, Math.floor((opts && opts.k) || DEFAULT_K)));
    const maxChars = (opts && opts.maxChars) || MAX_REF_CHARS;
    const terms = [...new Set(tokenize(query))].slice(0, 80);
    if (!terms.length || !chunks.length) return [];
    const minMatched = terms.length === 1 ? 1 : 2;
    const has = (o, t) => Object.prototype.hasOwnProperty.call(o, t);

    const N = chunks.length;
    let total = 0;
    for (const c of chunks) total += c.len || 1;
    const avg = total / N || 1;
    const idf = {};
    for (const t of terms) {
      let df = 0;
      for (const c of chunks) if (has(c.tf, t)) df++;
      idf[t] = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    }
    const k1 = 1.5;
    const b = 0.75;
    const scored = [];
    for (const c of chunks) {
      let score = 0;
      let matched = 0;
      for (const t of terms) {
        if (!has(c.tf, t)) continue;
        matched++;
        const f = c.tf[t];
        score += idf[t] * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * (c.len || 1)) / avg)));
      }
      if (matched >= minMatched) scored.push({ chunk: c, score, matched });
    }
    scored.sort((x, y) => y.score - x.score);
    if (!scored.length) return [];
    const cutoff = scored[0].score * 0.4; // descarta lo muy por debajo del mejor
    const hits = [];
    let chars = 0;
    for (const s of scored) {
      if (hits.length >= k || s.score < cutoff) break;
      if (chars + s.chunk.text.length > maxChars && hits.length) break;
      chars += s.chunk.text.length;
      hits.push({ id: s.chunk.id, doc: s.chunk.doc, name: s.chunk.name || '', page: s.chunk.page, text: s.chunk.text, score: s.score, matched: s.matched });
    }
    return hits;
  }

  const api = { CHUNK_WORDS, CHUNK_OVERLAP, DEFAULT_K, MAX_K, MAX_REF_CHARS, tokenize, buildTf, chunkPages, search };
  A.pdfIndex = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
