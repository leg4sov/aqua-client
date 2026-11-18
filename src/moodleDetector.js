/* Aqua · detección limitada de Moodle. Solo lee señales superficiales del DOM; no recopila contenido. */
(function () {
  'use strict';
  const A = (globalThis.Aqua = globalThis.Aqua || {});

  const MOODLE_ASSET_MARKERS = [
    '/lib/javascript.php',
    '/lib/requirejs.php',
    '/theme/styles.php',
    '/theme/yui_combo.php',
    '/theme/javascript.php',
    '/lib/ajax/service.php',
  ];

  /**
   * @param {{bodyId?:string, bodyClasses?:string[], assetUrls?:string[], pathname?:string}} s
   * @returns {{isMoodle:boolean, score:number, pageType:string, attemptInProgress:boolean}}
   */
  function detectMoodle(s) {
    const sig = s || {};
    const bodyId = String(sig.bodyId || '');
    const classes = Array.isArray(sig.bodyClasses) ? sig.bodyClasses : [];
    const assets = Array.isArray(sig.assetUrls) ? sig.assetUrls : [];
    const pathname = String(sig.pathname || '');

    let score = 0;
    if (/^page-/.test(bodyId)) score += 1;
    if (classes.some((c) => /^path-/.test(c))) score += 1;
    if (classes.some((c) => /^pagelayout-/.test(c))) score += 1;
    if (classes.some((c) => /^(moodle|format-[a-z]+)$/.test(c))) score += 1;
    const markers = new Set();
    for (const url of assets) for (const m of MOODLE_ASSET_MARKERS) if (String(url).includes(m)) markers.add(m);
    score += Math.min(3, markers.size * 2);
    if (/\/(mod|course|my|login|user|grade|question)\/[\w-]*/.test(pathname) && /\.php$|\/$/.test(pathname)) score += 1;

    const isMoodle = score >= 3;
    const pageType = isMoodle ? classifyPage(bodyId, pathname) : 'other';
    return { isMoodle, score, pageType, attemptInProgress: pageType === 'quiz-attempt' };
  }

  function classifyPage(bodyId, pathname) {
    const id = String(bodyId);
    if (/^page-mod-quiz-(attempt|summary)$/.test(id) || /\/mod\/quiz\/(attempt|summary)\.php$/.test(pathname)) return 'quiz-attempt';
    if (/^page-mod-quiz-review$/.test(id) || /\/mod\/quiz\/review\.php$/.test(pathname)) return 'quiz-review';
    if (/^page-mod-quiz-/.test(id) || /\/mod\/quiz\//.test(pathname)) return 'quiz-other';
    if (/^page-mod-(page|book|resource|url|folder|lesson|forum|label|wiki|glossary)-/.test(id)) return 'material';
    if (/^page-course-/.test(id)) return 'course';
    return 'other';
  }

  // Envoltorio de DOM: lee únicamente id/clases de <body>, URLs de scripts/estilos y el pathname.
  function collectSignals(doc, loc) {
    const body = doc && doc.body;
    const assets = [];
    if (doc) {
      doc.querySelectorAll('script[src], link[rel="stylesheet"][href]').forEach((n) => {
        assets.push(n.getAttribute('src') || n.getAttribute('href') || '');
      });
    }
    return {
      bodyId: body ? body.id : '',
      bodyClasses: body ? Array.from(body.classList) : [],
      assetUrls: assets,
      pathname: loc ? loc.pathname : '',
    };
  }

  const api = { detectMoodle, classifyPage, collectSignals };
  A.moodleDetector = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
