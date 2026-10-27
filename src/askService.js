/* Aqua · lógica de solicitudes del background (testeable sin APIs de navegador). */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});
  const isNode = typeof module === 'object';
  const { AquaError, toPlain } = isNode ? require('./errors') : A.errors;
  const norm = isNode ? require('./textNormalizer') : A.textNormalizer;
  const prompts = isNode ? require('./prompts') : A.prompts;
  const validator = isNode ? require('./answerValidator') : A.answerValidator;

  const TYPES = ['single', 'multi', 'short', 'open', 'other', 'free'];
  const MAX_REF_CHARS = 9000;
  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

  function validateMessage(msg) {
    if (!msg || typeof msg !== 'object') throw new AquaError('INVALID_INPUT');
    if (!ID_RE.test(String(msg.requestId))) throw new AquaError('INVALID_INPUT');
    if (!['quiz', 'short', 'long'].includes(msg.mode)) throw new AquaError('INVALID_INPUT');
    if (typeof msg.text !== 'string') throw new AquaError('INVALID_INPUT');
    const meta = msg.meta || {};
    if (!TYPES.includes(meta.type)) throw new AquaError('INVALID_INPUT');
    const optionCount = Number(meta.optionCount);
    if (!Number.isInteger(optionCount) || optionCount < 0 || optionCount > 20) throw new AquaError('INVALID_INPUT');
    const refIds = Array.isArray(msg.refIds) ? [...new Set(msg.refIds.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 8) : [];
    return { requestId: msg.requestId, mode: msg.mode, text: msg.text, meta: { type: meta.type, optionCount }, refIds };
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

    async function handleAsk(msg, tabId) {
      let controller;
      try {
        const m = validateMessage(msg);
        const { apiKey, settings } = await deps.getConfig();
        if (!apiKey) throw new AquaError('NO_API_KEY');
        if (m.mode === 'quiz' && m.meta.optionCount === 0) throw new AquaError('MODE_MISMATCH');
        const prepared = norm.prepareForSending(m.text, { maxChars: settings.maxChars });
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
        const userText = prompts.buildUserMessage({
          reference,
          text: prepared.text,
          mode: m.mode,
          meta: m.meta,
          nonce: (deps.nonce || randomNonce)(),
        });
        const r = await deps.gemini.generate({
          apiKey,
          model: settings.model,
          timeoutMs: settings.timeoutMs,
          systemPrompt: prompts.SYSTEM_PROMPT,
          userText,
          responseSchema: prompts.RESPONSE_SCHEMA,
          signal: controller.signal,
          fetchImpl: deps.fetchImpl,
        });
        const raw = validator.parseModelJson(r.text);
        if (m.mode === 'quiz' && typeof raw === 'object') raw.answer_text = raw.answer_text || '-'; // evita EMPTY si solo hay estado
        let answer = validator.validateAnswer(raw, m.meta);
        if (m.mode === 'quiz') {
          // Modo quiz: SOLO letras. Se descarta cualquier texto extra aunque el modelo lo envíe.
          answer = { ...answer, answerText: '', explanation: '', commands: [], caveats: '', module: '' };
        } else if (!answer.answerText) {
          throw new AquaError('EMPTY_RESPONSE');
        }
        return { ok: true, requestId: m.requestId, result: answer, refs: reference.length, redactions: norm.countRedactions(prepared.redactions), model: settings.model };
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

    return { handleAsk, cancel, cancelTab, _active: active };
  }

  const api = { createAskService, validateMessage };
  A.askService = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
