/* Aqua · capa independiente de acceso a la API de Gemini (generateContent, REST v1beta).
 * Docs: https://ai.google.dev/api/generate-content · https://ai.google.dev/gemini-api/docs/models
 * No registra la clave ni el contenido. La clave solo viaja en la cabecera x-goog-api-key. */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});
  const { AquaError } = typeof module === 'object' ? require('./errors') : A.errors;
  const settings = typeof module === 'object' ? require('./settings') : A.settings;

  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const BLOCKING_FINISH = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY']);

  function buildEndpoint(model) {
    const m = settings.normalizeModelName(model);
    if (!m) throw new AquaError('INVALID_INPUT', 'Nombre de modelo no válido');
    return `${API_BASE}/models/${m}:generateContent`;
  }

  function buildRequestBody({ systemPrompt, userText, responseSchema, maxOutputTokens }) {
    const generationConfig = { temperature: 0.2, maxOutputTokens: maxOutputTokens || 4096 };
    if (responseSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = responseSchema;
    }
    const body = { contents: [{ role: 'user', parts: [{ text: userText }] }], generationConfig };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
    return body;
  }

  function mapHttpError(status, errBody) {
    const msg = String((errBody && errBody.error && errBody.error.message) || '');
    const apiStatus = String((errBody && errBody.error && errBody.error.status) || '');
    if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED') return new AquaError('QUOTA', msg, status);
    if (status === 401 || status === 403 || /API key (not valid|expired)|API_KEY_INVALID/i.test(msg)) return new AquaError('AUTH', msg, status);
    if (status === 404) return new AquaError('MODEL_NOT_FOUND', msg, status);
    if (status === 400) return new AquaError('BAD_REQUEST', msg, status);
    if (status >= 500) return new AquaError('SERVER', msg, status);
    return new AquaError('UNKNOWN', msg, status);
  }

  function extractText(json) {
    if (!json || typeof json !== 'object') throw new AquaError('INVALID_RESPONSE', 'Cuerpo no es un objeto');
    const block = json.promptFeedback && json.promptFeedback.blockReason;
    const cand = Array.isArray(json.candidates) ? json.candidates[0] : null;
    if (block && !cand) throw new AquaError('BLOCKED', `blockReason=${block}`);
    if (!cand) throw new AquaError('EMPTY_RESPONSE');
    const finish = cand.finishReason;
    if (BLOCKING_FINISH.has(finish)) throw new AquaError('BLOCKED', `finishReason=${finish}`);
    const parts = (cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : []).filter((p) => p && typeof p.text === 'string' && p.thought !== true);
    const text = parts.map((p) => p.text).join('').trim();
    if (!text) throw new AquaError(finish === 'MAX_TOKENS' ? 'TRUNCATED' : 'EMPTY_RESPONSE');
    return { text, finishReason: finish || '', usage: json.usageMetadata || null };
  }

  const SCHEMA_ERR = /schema|response_?mime|responseMimeType/i;

  /**
   * @param {{apiKey:string, model:string, systemPrompt?:string, userText:string, responseSchema?:object,
   *          signal?:AbortSignal, timeoutMs?:number, fetchImpl?:Function, maxOutputTokens?:number}} o
   */
  async function generate(o) {
    if (!o || typeof o.apiKey !== 'string' || !o.apiKey) throw new AquaError('NO_API_KEY');
    if (typeof o.userText !== 'string' || !o.userText.trim()) throw new AquaError('EMPTY_TEXT');
    const url = buildEndpoint(o.model);
    const doFetch = o.fetchImpl || globalThis.fetch;

    const controller = new AbortController();
    let timedOut = false;
    let cancelled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, o.timeoutMs || 30000);
    const onAbort = () => {
      cancelled = true;
      controller.abort();
    };
    if (o.signal) {
      if (o.signal.aborted) onAbort();
      else o.signal.addEventListener('abort', onAbort, { once: true });
    }

    async function post(withSchema) {
      const body = buildRequestBody({ ...o, responseSchema: withSchema ? o.responseSchema : null });
      return doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': o.apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
    }

    try {
      let res = await post(true);
      let errBody = null;
      if (!res.ok) {
        errBody = await res.json().catch(() => null);
        // Si la API rechaza el esquema, reintenta una vez sin él (el validador sigue protegiendo).
        if (res.status === 400 && o.responseSchema && SCHEMA_ERR.test(String(errBody && errBody.error && errBody.error.message))) {
          res = await post(false);
          errBody = res.ok ? null : await res.json().catch(() => null);
        }
        if (!res.ok) throw mapHttpError(res.status, errBody);
      }
      let json;
      try {
        json = await res.json();
      } catch (_) {
        throw new AquaError('INVALID_RESPONSE', 'JSON ilegible');
      }
      return { ...extractText(json), model: o.model };
    } catch (e) {
      if (e instanceof AquaError) throw e;
      if (timedOut) throw new AquaError('TIMEOUT');
      if (cancelled || (e && e.name === 'AbortError')) throw new AquaError('CANCELLED');
      throw new AquaError('NETWORK');
    } finally {
      clearTimeout(timer);
      if (o.signal) o.signal.removeEventListener('abort', onAbort);
    }
  }

  const api = { API_BASE, buildEndpoint, buildRequestBody, mapHttpError, extractText, generate };
  A.geminiClient = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
