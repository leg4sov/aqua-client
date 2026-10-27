/* Aqua · panel flotante compacto (Shadow DOM). Todo texto no confiable se inserta con textContent. */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});

  const SIZES = { xxs: { w: '148px', fs: '10px' }, xs: { w: '184px', fs: '10px' }, s: { w: '224px', fs: '11px' }, m: { w: '284px', fs: '12px' } };

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
    const mkRadio = (value, label, checked) => {
      const l = el('label', 'seg');
      const r = doc.createElement('input');
      r.type = 'radio';
      r.name = 'aqua-mode';
      r.value = value;
      r.checked = checked;
      r.addEventListener('change', () => h.onModeChange(value));
      l.append(r, el('span', null, label));
      return { l, r };
    };
    const rq = mkRadio('quiz', T('ui.quiz'), true);
    const rs = mkRadio('short', T('ui.short'), false);
    const rl = mkRadio('long', T('ui.long'), false);
    modes.append(rq.l, rs.l, rl.l);
    body.appendChild(modes);

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

    // Botón de copiar: solo un símbolo pequeño (⧉), que pasa a ✓ al copiar.
    function copyButton(getText) {
      const b = btn('⧉', 'copy', async () => {
        const ok = await h.onCopy(getText(), fallbackArea);
        b.textContent = ok ? '✓' : '✕';
        b.title = ok ? T('ui.copied') : T('ui.copyFail');
        setTimeout(() => {
          b.textContent = '⧉';
          b.title = T('ui.copy');
        }, 1800);
      });
      b.title = T('ui.copy');
      b.setAttribute('aria-label', T('ui.copy'));
      return b;
    }

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
        const sz = SIZES[ui && ui.size] || SIZES.xs;
        host.style.setProperty('--aqua-w', sz.w);
        host.style.setProperty('--aqua-fs', sz.fs);
        host.style.setProperty('--aqua-op', String(Math.min(100, Math.max(30, Number(ui && ui.opacity) || 55)) / 100));
        host.setAttribute('data-bg', ui && ui.bg === 'solid' ? 'solid' : 'transparent');
        host.setAttribute('data-palette', ui && (ui.palette === 'light' || ui.palette === 'classic') ? ui.palette : 'dark');
        host.setAttribute('data-size', ui && SIZES[ui.size] ? ui.size : 'xs');
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
        controls.hidden = on;
        modes.hidden = on;
        actions.hidden = on;
        if (on) sent.hidden = true;
      },
      getMode: () => (rl.r.checked ? 'long' : rs.r.checked ? 'short' : 'quiz'),
      setMode(m) {
        (m === 'long' ? rl.r : m === 'short' ? rs.r : rq.r).checked = true;
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
        qlist.hidden = !list.length;
        list.forEach((q, i) => {
          const li = el('li');
          const full = q.text.replace(/\s+/g, ' ');
          // Modo ultra: solo el número (el enunciado completo queda en el tooltip). A Gemini siempre se envía la pregunta completa.
          const label = isUltra() ? String(q.number) : `${q.number}. ${full.slice(0, 38)}${full.length > 38 ? '…' : ''}`;
          const b = btn(label, 'qbtn', () => h.onPickQuestion(i));
          b.title = full.slice(0, 200);
          li.appendChild(b);
          qlist.appendChild(li);
        });
      },
      clearResult() {
        result.replaceChildren();
        result.hidden = true;
        result.classList.remove('quiz');
      },
      /**
       * view: {kind:'short', confidence, letters:[]} | {kind:'long', confidence, answerText, commands, caveats, warnings}
       */
      setResult(view) {
        result.replaceChildren();
        result.hidden = false;
        result.classList.toggle('quiz', view.kind === 'quiz'); // el resultado Quiz va sin línea ni relleno
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
          if (view.answerText) {
            const box = el('div', 'answer');
            box.append(el('div', 'atext', view.answerText), copyButton(() => view.answerText));
            result.appendChild(box);
          }
          (view.commands || []).forEach((c) => {
            const box = el('div', 'cmd');
            box.append(el('pre', 'code', c.command), copyButton(() => c.command));
            result.appendChild(box);
          });
          if (view.caveats) result.appendChild(el('div', 'caveat', view.caveats));
          if (view.commands && view.commands.length) result.appendChild(el('div', 'caveat', T('ui.cmdWarn')));
        }
        (view.warnings || []).forEach((w) => result.appendChild(el('div', 'caveat', w)));
      },
    };
    api.applyAppearance(null);
    return api;
  }

  const api = { createPanel, SIZES };
  A.ui = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
