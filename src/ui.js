/* Aqua · panel flotante compacto (Shadow DOM). Todo texto no confiable se inserta con textContent. */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});

  const SIZES = { xxs: { w: '148px', fs: '10px' }, xs: { w: '184px', fs: '10px' }, m: { w: '284px', fs: '12px' } };

  function createPanel(doc, css, h) {
    const T = (k, p) => h.t(k, p);
    const el = (tag, cls, text) => {
      const n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined) n.textContent = text;
      return n;
    };
    const btn = (label, cls, onClick) => {
      const b = el('button', cls, label);
      b.type = 'button';
      b.addEventListener('mousedown', (e) => e.preventDefault()); // conserva la selección de la página
      b.addEventListener('click', onClick);
      return b;
    };

    const host = doc.createElement('div');
    host.id = 'aqua-host';
    host.style.cssText = 'all:initial;position:fixed;left:10px;bottom:10px;z-index:2147483646;';
    const root = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = css || '';
    root.appendChild(style);

    const panel = el('section', 'panel');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Aqua');

    // Cabecera mínima: gota + estado + ajustes + ocultar
    const header = el('header', 'head');
    header.appendChild(el('span', 'brand', 'aqua.client'));
    const badge = el('span', 'badge idle', T('status.idle'));
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    header.append(badge, el('span', 'spacer'));
    const bSettings = btn('⚙', 'icon', () => h.onSettings());
    bSettings.title = T('ui.settings');
    bSettings.setAttribute('aria-label', T('ui.settings'));
    const bHide = btn('✕', 'icon', () => h.onHide());
    bHide.title = T('ui.hideTip');
    bHide.setAttribute('aria-label', T('ui.hide'));
    header.append(bSettings, bHide);
    panel.appendChild(header);

    const body = el('div', 'body');
    const notice = el('div', 'notice');
    notice.hidden = true;
    notice.setAttribute('role', 'alert');
    body.appendChild(notice);

    const controls = el('div', 'row controls');
    const bSel = btn(T('ui.selection'), 'sec', () => h.onUseSelection());
    const bDetect = btn(T('ui.questions'), 'sec', () => h.onDetect());
    controls.append(bSel, bDetect);
    body.appendChild(controls);

    const qlist = el('ol', 'qlist');
    qlist.hidden = true;
    body.appendChild(qlist);

    const sent = doc.createElement('details');
    sent.className = 'sent';
    sent.hidden = true;
    const sentSummary = el('summary', null, T('ui.sent'));
    const preview = el('pre', 'preview');
    sent.append(sentSummary, preview);
    body.appendChild(sent);

    const modes = el('div', 'row modes');
    const mkRadio = (name, value, label, checked, onChange) => {
      const l = el('label', 'seg');
      const r = doc.createElement('input');
      r.type = 'radio';
      r.name = name;
      r.value = value;
      r.checked = checked;
      r.addEventListener('change', onChange);
      l.append(r, el('span', null, label));
      return { l, r };
    };
    const onMode = () => {
      updateModeUi();
      h.onModeChange(api.getMode());
      if (api.getMode() === 'image') pasteBox.focus({ preventScroll: true });
    };
    const rq = mkRadio('aqua-mode', 'quiz', T('ui.quiz'), true, onMode);
    const rt = mkRadio('aqua-mode', 'text', T('ui.text'), false, onMode);
    const ri = mkRadio('aqua-mode', 'image', T('ui.image'), false, onMode);
    modes.append(rq.l, rt.l, ri.l);
    body.appendChild(modes);

    // Texto: corta o larga (solo se ve con «Texto» elegido, para ahorrar espacio)
    const sub = el('div', 'row modes sub');
    sub.hidden = true;
    const rs = mkRadio('aqua-len', 'short', T('ui.short'), true, () => h.onModeChange(api.getMode()));
    const rl = mkRadio('aqua-len', 'long', T('ui.long'), false, () => h.onModeChange(api.getMode()));
    sub.append(rs.l, rl.l);
    body.appendChild(sub);

    // Imagen: hueco para pegar con Ctrl+V. La imagen no se muestra; solo un aviso breve de que está cargada.
    const imgbox = el('div', 'imgbox');
    imgbox.hidden = true;
    const pasteBox = doc.createElement('textarea');
    pasteBox.className = 'paste';
    pasteBox.rows = 1;
    pasteBox.spellcheck = false;
    pasteBox.placeholder = T('ui.pasteHint');
    pasteBox.setAttribute('aria-label', T('ui.pasteHint'));
    pasteBox.addEventListener('input', () => (pasteBox.value = '')); // nunca guarda texto escrito
    pasteBox.addEventListener('paste', (e) => {
      e.preventDefault();
      const cd = e.clipboardData;
      const items = cd && cd.items ? [...cd.items] : [];
      const it = items.find((x) => x.kind === 'file' && /^image\//.test(x.type));
      const file = it ? it.getAsFile() : (cd && cd.files && [...cd.files].find((f) => /^image\//.test(f.type))) || null;
      h.onPasteImage(file || null);
    });
    const imgStatus = el('div', 'imgstatus');
    imgStatus.hidden = true;
    imgStatus.setAttribute('role', 'status');
    imgbox.append(pasteBox, imgStatus);
    body.appendChild(imgbox);

    const actions = el('div', 'row actions');
    const bAsk = btn(T('ui.ask'), 'primary', () => h.onAsk());
    const bCancel = btn(T('ui.cancel'), 'sec', () => h.onCancel());
    bCancel.disabled = true;
    actions.append(bAsk, bCancel);
    body.appendChild(actions);

    const result = el('div', 'result');
    result.hidden = true;
    body.appendChild(result);

    panel.appendChild(body);
    root.appendChild(panel);

    const fallbackArea = doc.createElement('textarea');
    fallbackArea.className = 'sr';
    fallbackArea.setAttribute('aria-hidden', 'true');
    fallbackArea.tabIndex = -1;
    root.appendChild(fallbackArea);

    // ---- Visibilidad: «invisible salvo con el ratón encima» y «desvanecer por inactividad» (combinables).
    // El panel nunca se cierra: solo cambia su opacidad. Invisible => no tapa clics de la página.
    const OTHER_ACTIVITY = ['mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'];
    let vis = { hoverOnly: false, idle: null };
    let idleTimer = null;
    let faded = false;
    let hovered = false;
    host.style.transition = 'opacity .25s ease';
    const isUltra = () => host.getAttribute('data-size') === 'xxs';
    function applyVisibility() {
      const invisible = faded || (vis.hoverOnly && !hovered);
      host.style.opacity = invisible ? '0' : '';
      host.style.pointerEvents = invisible ? 'none' : '';
    }
    function armIdle() {
      clearTimeout(idleTimer);
      if (!vis.idle || !vis.idle.enabled) return;
      idleTimer = setTimeout(() => {
        faded = true;
        applyVisibility();
      }, vis.idle.seconds * 1000);
      if (idleTimer && idleTimer.unref) idleTimer.unref();
    }
    function pointInHost(e) {
      const r = host.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    }
    function onMove(e) {
      hovered = pointInHost(e); // por coordenadas: funciona aunque el panel esté invisible y sin pointer-events
      faded = false;
      armIdle();
      applyVisibility();
    }
    function onOther() {
      faded = false;
      armIdle();
      applyVisibility();
    }
    function onLeaveWindow() {
      hovered = false;
      applyVisibility();
    }
    function stopVisibility() {
      clearTimeout(idleTimer);
      doc.removeEventListener('mousemove', onMove, true);
      OTHER_ACTIVITY.forEach((ev) => doc.removeEventListener(ev, onOther, true));
      doc.documentElement.removeEventListener('mouseleave', onLeaveWindow);
      faded = false;
      hovered = false;
      host.style.opacity = '';
      host.style.pointerEvents = '';
    }

    // Qué se ve según el modo: sub-selector (Texto), hueco de pegado (Imagen); en Imagen no hay selección/preguntas.
    let unsupported = false;
    let qCount = 0;
    function updateModeUi() {
      const m = rq.r.checked ? 'quiz' : rt.r.checked ? 'text' : 'image';
      modes.hidden = unsupported;
      sub.hidden = unsupported || m !== 'text';
      imgbox.hidden = unsupported || m !== 'image';
      controls.hidden = unsupported || m === 'image';
      qlist.hidden = unsupported || m === 'image' || !qCount;
    }

    const api = {
      host,
      root,
      attach() {
        if (!host.isConnected) doc.documentElement.appendChild(host);
      },
      show() {
        api.attach();
        host.style.display = 'block';
      },
      hide() {
        stopVisibility();
        host.style.display = 'none';
      },
      /** cfg: {hoverOnly:boolean, idle:{enabled:boolean, seconds:number}|null}; sin cfg se desactiva todo */
      setVisibility(cfg) {
        stopVisibility();
        vis = { hoverOnly: !!(cfg && cfg.hoverOnly), idle: (cfg && cfg.idle) || null };
        const idleOn = !!(vis.idle && vis.idle.enabled);
        if (vis.hoverOnly || idleOn) doc.addEventListener('mousemove', onMove, { capture: true, passive: true });
        if (idleOn) OTHER_ACTIVITY.forEach((ev) => doc.addEventListener(ev, onOther, { capture: true, passive: true }));
        if (vis.hoverOnly) doc.documentElement.addEventListener('mouseleave', onLeaveWindow);
        armIdle();
        applyVisibility();
      },
      isVisible: () => host.isConnected && host.style.display !== 'none',
      destroy() {
        stopVisibility();
        host.remove();
      },
      /** ui: {size:'xs'|'s'|'m', opacity:30..100, side:'left'|'right'} (ya saneado por settings) */
      applyAppearance(ui) {
        const sz = SIZES[ui && ui.size] || SIZES.xxs;
        host.style.setProperty('--aqua-w', sz.w);
        host.style.setProperty('--aqua-fs', sz.fs);
        host.style.setProperty('--aqua-op', String(Math.min(100, Math.max(30, Number(ui && ui.opacity) || 55)) / 100));
        host.setAttribute('data-bg', ui && ui.bg === 'solid' ? 'solid' : 'transparent');
        host.setAttribute('data-palette', ui && (ui.palette === 'light' || ui.palette === 'classic') ? ui.palette : 'dark');
        host.setAttribute('data-size', ui && SIZES[ui.size] ? ui.size : 'xxs');
        const right = ui && ui.side === 'right';
        host.style.left = right ? 'auto' : '10px';
        host.style.right = right ? '10px' : 'auto';
      },
      setStatus(state, text) {
        badge.className = `badge ${state}`;
        badge.textContent = text || T(`status.${state}`);
      },
      setNotice(text, kind) {
        notice.hidden = !text;
        notice.textContent = text || '';
        notice.className = `notice ${kind || 'info'}`;
      },
      setUnsupported(on) {
        unsupported = !!on;
        actions.hidden = on;
        if (on) sent.hidden = true;
        updateModeUi();
      },
      /** 'quiz' | 'short' | 'long' | 'image' (Texto = corta o larga según el sub-selector) */
      getMode: () => (rq.r.checked ? 'quiz' : ri.r.checked ? 'image' : rl.r.checked ? 'long' : 'short'),
      setMode(m) {
        if (m === 'quiz') rq.r.checked = true;
        else if (m === 'image') ri.r.checked = true;
        else {
          rt.r.checked = true;
          (m === 'long' ? rl.r : rs.r).checked = true;
        }
        updateModeUi();
      },
      /** state: 'none' | 'loading' | 'ready' */
      setImageState(state) {
        const txt = state === 'ready' ? T('ui.imgReady') : state === 'loading' ? T('ui.imgLoading') : '';
        imgStatus.textContent = txt;
        imgStatus.hidden = !txt;
      },
      setBusy(busy) {
        bAsk.disabled = busy;
        if (isUltra()) bAsk.textContent = busy ? '…' : T('ui.ask'); // sin barra de estado en modo ultra
        bSel.disabled = busy;
        bDetect.disabled = busy;
        bCancel.disabled = !busy;
      },
      setPreview(text, note) {
        sent.hidden = !text;
        preview.textContent = text || '';
        sentSummary.textContent = note || T('ui.sent');
        sent.open = false;
      },
      setQuestions(list) {
        qlist.replaceChildren();
        qCount = list.length;
        qlist.hidden = !list.length || ri.r.checked;
        list.forEach((q, i) => {
          const li = el('li');
          const full = q.text.replace(/\s+/g, ' ');
          // Modo ultra: solo el número. A Gemini siempre se envía la pregunta completa. Sin tooltips.
          const label = isUltra() ? String(q.number) : `${q.number}. ${full.slice(0, 38)}${full.length > 38 ? '…' : ''}`;
          const b = btn(label, 'qbtn', () => h.onPickQuestion(i));
          li.appendChild(b);
          qlist.appendChild(li);
        });
      },
      clearResult() {
        result.replaceChildren();
        result.hidden = true;
        result.classList.remove('quiz', 'text');
      },
      /**
       * view: {kind:"quiz", number, confidence, letters:[]} | {kind:"text", confidence, answerText, commands, caveats, warnings}
       */
      setResult(view) {
        result.replaceChildren();
        result.hidden = false;
        result.classList.toggle('quiz', view.kind === 'quiz'); // el resultado Quiz va sin línea ni relleno
        result.classList.toggle('text', view.kind !== 'quiz'); // respuestas de texto: líneas pequeñas, un clic copia la línea
        const tag = view.confidence === 'hypothesis' || view.confidence === 'insufficient_data' ? T(`conf.${view.confidence}`) : '';
        if (view.kind === 'quiz') {
          if (view.letters.length) {
            // «n) B»: número de la pregunta y letra(s); sin número (no debería ocurrir en Quiz) solo las letras
            const prefix = view.number ? `${view.number}) ` : '';
            result.appendChild(el('div', 'letters', prefix + view.letters.join(', ')));
          } else {
            result.appendChild(el('div', 'caveat', T('ui.noLetter')));
          }
          if (tag) result.appendChild(el('div', 'tag', tag));
        } else {
          if (tag) result.appendChild(el('div', 'tag', tag));
          // Cada línea es un botón: un clic la copia (sin seleccionar) y se atenúa un instante.
          const addLine = (txt, cls) => {
            const b = btn(txt, cls ? `line ${cls}` : 'line', async () => {
              const ok = await h.onCopy(txt, fallbackArea);
              b.classList.add(ok ? 'copied' : 'copyfail');
              setTimeout(() => b.classList.remove('copied', 'copyfail'), 1200);
            });
            result.appendChild(b);
          };
          String(view.answerText || '')
            .split(/\n+/)
            .map((x) => x.trim())
            .filter(Boolean)
            .forEach((x) => addLine(x));
          (view.commands || []).forEach((c) => addLine(c.command, 'cmd'));
          if (view.caveats) result.appendChild(el('div', 'caveat', view.caveats));
          if (view.commands && view.commands.length) result.appendChild(el('div', 'caveat', T('ui.cmdWarn')));
        }
        (view.warnings || []).forEach((w) => result.appendChild(el('div', 'caveat', w)));
      },
    };
    api.applyAppearance(null);
    updateModeUi();
    return api;
  }

  const api = { createPanel, SIZES };
  A.ui = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
