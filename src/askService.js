/* Aqua · lógica de solicitudes del background (testeable sin APIs de navegador). */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});
  const isNode = typeof module === 'object';
  const { AquaError, toPlain } = isNode ? require('./errors') : A.errors;
  const norm = isNode ? require('./textNormalizer') : A.textNormalizer;
  const prompts = isNode ? require('./prompts') : A.prompts;
  const validator = isNode ? require('./answerValidator') : A.answerValidator;

  const TYPES = ['single', 'multi', 'short', 'open', 'other', 'free', 'select', 'order', 'fill'];
  const MAX_REF_CHARS = 9000;
  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_IMAGE_B64 = 6000000; // ~4,5 MB reales; la imagen ya llega reducida desde el panel

  function validateImage(img) {
    if (!img || typeof img !== 'object' || !IMAGE_MIMES.includes(img.mime)) throw new AquaError('INVALID_INPUT');
    if (typeof img.data !== 'string' || !img.data.length || img.data.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(img.data)) throw new AquaError('INVALID_INPUT');
    return { mime: img.mime, data: img.data };
  }

  function validateMessage(msg) {
    if (!msg || typeof msg !== 'object') throw new AquaError('INVALID_INPUT');
    if (!ID_RE.test(String(msg.requestId))) throw new AquaError('INVALID_INPUT');
    if (!['quiz', 'short', 'long', 'image', 'select', 'order', 'fill'].includes(msg.mode)) throw new AquaError('INVALID_INPUT');
    const image = msg.mode === 'image' ? validateImage(msg.image) : null;
    if (msg.mode === 'image' && msg.text === undefined) msg = { ...msg, text: '' };
    if (typeof msg.text !== 'string') throw new AquaError('INVALID_INPUT');
    const meta = msg.meta || {};
    if (!TYPES.includes(meta.type)) throw new AquaError('INVALID_INPUT');
    const optionCount = Number(meta.optionCount);
    if (!Number.isInteger(optionCount) || optionCount < 0 || optionCount > 20) throw new AquaError('INVALID_INPUT');
    const refIds = Array.isArray(msg.refIds) ? [...new Set(msg.refIds.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 8) : [];
    return { requestId: msg.requestId, mode: msg.mode, text: msg.text, meta: { type: meta.type, optionCount }, refIds, image };
  }

  function randomNonce() {
    const b = new Uint8Array(8);
    globalThis.crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }

  /**
   * @param {{getConfig:()=>Promise<{apiKey:string,settings:object}>, gemini:{generate:Function}, fetchImpl?:Function, nonce?:()=>string}} deps
   */
  function createAskService(deps) {
    const active = new Map(); // clave "tab:requestId" -> AbortController
    const byTab = new Map(); // tabId -> clave activa

    function keyOf(tabId, requestId) {
      return `${tabId}:${requestId}`;
    }

    // Clave de reserva: si la principal agota su límite (QUOTA) o es rechazada (AUTH) se prueba la otra; si la reserva funciona,
    // se usa primero durante unos minutos para no gastar una petición fallida por pregunta.
    const BACKUP_PREFER_MS = 10 * 60 * 1000;
    let backupUntil = 0;
    const nowMs = () => (deps.now ? deps.now() : Date.now());
    async function withKeys(apiKey, apiKey2, run) {
      const keys = [...new Set([apiKey, apiKey2].filter((k) => typeof k === 'string' && k))];
      if (!keys.length) throw new AquaError('NO_API_KEY');
      const primary = keys[0];
      const order = keys.length === 2 && nowMs() < backupUntil ? [keys[1], keys[0]] : keys;
      for (let i = 0; i < order.length; i++) {
        try {
          const r = await run(order[i]);
          return { r, usedBackup: keys.length === 2 && order[i] === keys[1] };
        } catch (e) {
          const retryable = e instanceof AquaError && (e.code === 'QUOTA' || e.code === 'AUTH');
          if (!retryable || i === order.length - 1) throw e;
          if (order[i] === primary) backupUntil = nowMs() + BACKUP_PREFER_MS;
        }
      }
    }

    async function handleAsk(msg, tabId) {
      let controller;
      let webOn = false; // para que el error sepa si había enlaces (consejo sobre tokens)
      try {
        const m = validateMessage(msg);
        const { apiKey, apiKey2, settings } = await deps.getConfig();
        const local = settings.provider === 'local';
        if (!local && !apiKey && !apiKey2) throw new AquaError('NO_API_KEY');
        if (local && m.mode === 'image') throw new AquaError('INVALID_INPUT'); // el modo imagen se oculta en local (modelo solo de texto)
        if (m.mode === 'quiz' && m.meta.optionCount === 0) throw new AquaError('MODE_MISMATCH');
        // En modo imagen no hay texto que preparar: la pregunta va en la imagen.
        const prepared = m.mode === 'image' ? { ok: true, text: '', redactions: [] } : norm.prepareForSending(m.text, { maxChars: settings.maxChars });
        if (!prepared.ok) throw new AquaError(prepared.code);

        const prev = byTab.get(tabId);
        if (prev && active.has(prev)) active.get(prev).abort(); // una solicitud por pestaña
        controller = new AbortController();
        const key = keyOf(tabId, m.requestId);
        active.set(key, controller);
        byTab.set(tabId, key);

        // Fragmentos de los PDF del usuario (opción B): solo si está activado, por id y ya redactados. No se envían nombres de archivo.
        const reference = [];
        if (settings.docs && settings.docs.enabled && deps.docs && m.refIds.length) {
          let used = 0;
          for (const c of await deps.docs.getByIds(m.refIds.slice(0, settings.docs.k))) {
            const text = norm.redactSensitive(norm.normalizeText(c.text)).text;
            if (used + text.length > MAX_REF_CHARS) break;
            used += text.length;
            reference.push({ label: `page ${c.page}`, text });
          }
        }
        // Referencias web (enlaces del usuario, opcionalmente búsqueda): las lee Gemini con sus herramientas.
        const w = settings.web;
        const web = !local && w && w.enabled && w.urls.length ? { urls: w.urls, search: w.search } : null; // en local no hay herramientas web
        webOn = !!web;
        const nonce = (deps.nonce || randomNonce)();
        // Una vuelta completa: pedir, leer el JSON y validarlo. Con webOn=false no se envían ni enlaces ni herramientas.
        const attempt = async (withWeb) => {
          const userText = prompts.buildUserMessage({ web: withWeb ? web : null, reference, text: prepared.text, mode: m.mode, meta: m.meta, nonce });
          const common = { systemPrompt: prompts.SYSTEM_PROMPT, userText, responseSchema: prompts.RESPONSE_SCHEMA, signal: controller.signal, fetchImpl: deps.fetchImpl };
          let r;
          let usedBackup = false;
          if (local) {
            r = await deps.local.generate({ ...common, url: settings.local.url, model: settings.local.model, timeoutMs: settings.local.timeoutMs, temperature: ['quiz', 'select', 'order', 'fill'].includes(m.mode) ? 0.1 : 0.6 });
          } else {
            const tools = withWeb ? [{ url_context: {} }, ...(web.search ? [{ google_search: {} }] : [])] : undefined;
            const x = await withKeys(apiKey, apiKey2, (key) => deps.gemini.generate({ ...common, apiKey: key, model: settings.model, timeoutMs: settings.timeoutMs, image: m.image, tools }));
            r = x.r;
            usedBackup = x.usedBackup;
          }
          const raw = validator.parseModelJson(r.text);
          if (m.mode === 'quiz' && typeof raw === 'object') raw.answer_text = raw.answer_text || '-'; // evita EMPTY si solo hay estado
          let answer = validator.validateAnswer(raw, m.meta);
          if (m.mode === 'quiz') {
            // Modo quiz: SOLO letras. Se descarta cualquier texto extra aunque el modelo lo envíe.
            answer = { ...answer, answerText: '', explanation: '', commands: [], caveats: '', module: '' };
          } else if (m.mode === 'image') {
            // Imagen: solo el texto de la respuesta, lo más breve posible
            answer = { ...answer, explanation: '', commands: [], caveats: '' };
            if (!answer.answerText) throw new AquaError('EMPTY_RESPONSE');
          } else if (!answer.answerText) {
            throw new AquaError('EMPTY_RESPONSE');
          } else if (m.mode === 'select' || m.mode === 'order' || m.mode === 'fill') {
            answer = { ...answer, explanation: '', commands: [], caveats: '' }; // solo las líneas «hueco=opción» o la lista de orden
          }
          return { r, usedBackup, answer };
        };
        let out;
        let webDropped = false;
        try {
          out = await attempt(!!web);
        } catch (e) {
          // Con herramientas web algunos modelos devuelven texto ilegible o vacío: se repite UNA vez sin enlaces en vez de dar error.
          if (!web || !(e instanceof AquaError) || !['INVALID_RESPONSE', 'EMPTY_RESPONSE', 'TRUNCATED'].includes(e.code)) throw e;
          webDropped = true;
          out = await attempt(false);
        }
        const { r, usedBackup, answer } = out;
        const webInfo = !web ? null : webDropped ? { downgraded: 'web', linksRead: 0, linksFailed: 0, searches: 0, links: web.urls.length, tokens: (r.usage && r.usage.totalTokenCount) || 0 } : { ...(r.web || {}), links: web.urls.length, tokens: (r.web && r.web.totalTokens) || (r.usage && r.usage.totalTokenCount) || 0 };
        return { ok: true, requestId: m.requestId, result: answer, refs: reference.length, redactions: norm.countRedactions(prepared.redactions), model: local ? settings.local.model : settings.model, provider: settings.provider, usedBackup, web: webInfo };
      } catch (e) {
        return { ok: false, requestId: msg && msg.requestId, error: { ...toPlain(e), web: webOn } };
      } finally {
        if (msg && controller) {
          const key = keyOf(tabId, msg.requestId);
          active.delete(key);
          if (byTab.get(tabId) === key) byTab.delete(tabId);
        }
      }
    }

    // Primer paso opcional con imagen (solo si el usuario activó «PDF + imagen»): Gemini transcribe la pregunta y se busca en local en los PDF.
    async function handleImageRead(msg, tabId) {
      let controller;
      try {
        if (!msg || typeof msg !== 'object' || !ID_RE.test(String(msg.requestId))) throw new AquaError('INVALID_INPUT');
        const image = validateImage(msg.image);
        const { apiKey, apiKey2, settings } = await deps.getConfig();
        if (settings.provider === 'local') return { ok: true, requestId: msg.requestId, text: '', hits: [] }; // leer la imagen requiere Gemini
        if (!apiKey && !apiKey2) throw new AquaError('NO_API_KEY');
        if (!(settings.docs && settings.docs.enabled && settings.docs.imageSearch && deps.docs)) return { ok: true, requestId: msg.requestId, text: '', hits: [] };
        const prev = byTab.get(tabId);
        if (prev && active.has(prev)) active.get(prev).abort();
        controller = new AbortController();
        const key = keyOf(tabId, msg.requestId);
        active.set(key, controller);
        byTab.set(tabId, key);
        const { r } = await withKeys(apiKey, apiKey2, (key) =>
          deps.gemini.generate({
            apiKey: key,
            model: settings.model,
            timeoutMs: settings.timeoutMs,
            systemPrompt: prompts.SYSTEM_PROMPT,
            userText: prompts.READ_PROMPT,
            signal: controller.signal,
            fetchImpl: deps.fetchImpl,
            image,
            maxOutputTokens: 1024,
          }),
        );
        const text = norm.normalizeText(r.text).slice(0, 1500);
        const hits = text ? await deps.docs.search(text.slice(0, 4000), { k: settings.docs.k }) : [];
        return { ok: true, requestId: msg.requestId, text, hits: hits.map((h) => ({ id: h.id, page: h.page, text: norm.redactSensitive(norm.normalizeText(h.text)).text })) };
      } catch (e) {
        return { ok: false, requestId: msg && msg.requestId, error: toPlain(e) };
      } finally {
        if (msg && controller) {
          const key = keyOf(tabId, msg.requestId);
          active.delete(key);
          if (byTab.get(tabId) === key) byTab.delete(tabId);
        }
      }
    }

    function cancel(tabId, requestId) {
      const c = active.get(keyOf(tabId, requestId));
      if (c) c.abort();
      return !!c;
    }

    function cancelTab(tabId) {
      const k = byTab.get(tabId);
      if (k && active.has(k)) active.get(k).abort();
    }

    return { handleAsk, handleImageRead, cancel, cancelTab, _active: active };
  }

  const api = { createAskService, validateMessage };
  A.askService = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
