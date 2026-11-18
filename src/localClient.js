/* Aqua · cliente de IA local con la API compatible con OpenAI (POST /v1/chat/completions).
 * Sirve para llama.cpp (llama-server), Ollama, llamafile y LM Studio. Devuelve lo mismo que geminiClient.generate. */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});
  const { AquaError } = typeof module === 'object' ? require('./errors') : A.errors;

  /** Esquema estilo Gemini (type: 'OBJECT') -> JSON Schema estándar (type: 'object'). */
  function toJsonSchema(s) {
    if (Array.isArray(s)) return s.map(toJsonSchema);
    if (!s || typeof s !== 'object') return s;
    const out = {};
    for (const [k, v] of Object.entries(s)) out[k] = k === 'type' && typeof v === 'string' ? v.toLowerCase() : toJsonSchema(v);
    return out;
  }

  function buildRequestBody({ model, systemPrompt, userText, responseSchema, maxOutputTokens, temperature }) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userText });
    const body = {
      model,
      messages,
      temperature: typeof temperature === 'number' ? temperature : 0.2,
      max_tokens: maxOutputTokens || 2048,
      stream: false,
      // Sin modo «pensar»: en CPU multiplica el tiempo. llama.cpp lee chat_template_kwargs; Ollama lee think.
      chat_template_kwargs: { enable_thinking: false },
      think: false,
    };
    if (responseSchema) body.response_format = { type: 'json_schema', json_schema: { name: 'aqua_answer', schema: toJsonSchema(responseSchema) } };
    return body;
  }

  function mapHttpError(status, errBody) {
    const e = errBody && errBody.error;
    const msg = String((e && (e.message || e)) || '');
    if (status === 401 || status === 403) return new AquaError('LOCAL_FORBIDDEN', msg, status); // p. ej. Ollama sin OLLAMA_ORIGINS
    if (status === 404) return new AquaError('MODEL_NOT_FOUND', msg, status);
    if (status === 400) return new AquaError('BAD_REQUEST', msg, status);
    if (status >= 500) return new AquaError('SERVER', msg, status);
    return new AquaError('UNKNOWN', msg, status);
  }

  function extractText(json) {
    const ch = json && Array.isArray(json.choices) ? json.choices[0] : null;
    if (!ch) throw new AquaError('EMPTY_RESPONSE');
    const raw = String((ch.message && ch.message.content) || '');
    const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(); // por si el modelo razona igualmente
    if (!text) throw new AquaError(ch.finish_reason === 'length' ? 'TRUNCATED' : 'EMPTY_RESPONSE');
    return { text, finishReason: ch.finish_reason || '', usage: json.usage || null };
  }

  /**
   * @param {{url:string, model:string, systemPrompt?:string, userText:string, responseSchema?:object, signal?:AbortSignal,
   *          timeoutMs?:number, fetchImpl?:Function, maxOutputTokens?:number, temperature?:number}} o
   */
  async function generate(o) {
    if (!o || typeof o.userText !== 'string' || !o.userText.trim()) throw new AquaError('EMPTY_TEXT');
    if (typeof o.url !== 'string' || !o.url) throw new AquaError('INVALID_INPUT');
    const doFetch = o.fetchImpl || globalThis.fetch;
    const controller = new AbortController();
    let timedOut = false;
    let cancelled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, o.timeoutMs || 90000);
    const onAbort = () => {
      cancelled = true;
      controller.abort();
    };
    if (o.signal) {
      if (o.signal.aborted) onAbort();
      else o.signal.addEventListener('abort', onAbort, { once: true });
    }
    const post = (withSchema) =>
      doFetch(`${o.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequestBody({ ...o, responseSchema: withSchema ? o.responseSchema : null })),
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
    try {
      let res = await post(true);
      if (!res.ok && res.status === 400 && o.responseSchema) res = await post(false); // servidor sin soporte de esquema: el validador sigue protegiendo
      if (!res.ok) throw mapHttpError(res.status, await res.json().catch(() => null));
      let json;
      try {
        json = await res.json();
      } catch (_) {
        throw new AquaError('INVALID_RESPONSE', 'JSON ilegible');
      }
      return { ...extractText(json), model: o.model, web: null };
    } catch (e) {
      if (e instanceof AquaError) throw e;
      if (timedOut) throw new AquaError('TIMEOUT');
      if (cancelled || (e && e.name === 'AbortError')) throw new AquaError('CANCELLED');
      throw new AquaError('LOCAL_OFFLINE'); // no hay nada escuchando en esa dirección (script sin lanzar)
    } finally {
      clearTimeout(timer);
      if (o.signal) o.signal.removeEventListener('abort', onAbort);
    }
  }

  const api = { toJsonSchema, buildRequestBody, mapHttpError, extractText, generate };
  A.localClient = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
