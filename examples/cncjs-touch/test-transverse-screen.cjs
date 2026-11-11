'use strict';
// Lot Transverses (design/PROMPT-ECRANS-MULTIAGENT.md): status strip, lock, page switch link, guide, design tokens.
// One check per bug fixed; appearance and words only: the strip buttons keep their hidden / disabled state and the
// job buttons their guards (checked below on the same fixtures).
const assert = require('assert').strict, fs = require('fs'), path = require('path'), vm = require('vm');
const touch = (name) => fs.readFileSync(path.join(__dirname, 'touch', name), 'utf8');
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const ui = strip(touch('ui-2027.css')), shell = strip(touch('touch-shell.css')), tokens = strip(touch('design-tokens.css'));
// The last rule naming the selector (the one that wins among equal specificities).
function rule(css, selector) {
  let found = null;
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) if (m[1].split(',').map((s) => s.trim()).includes(selector)) found = m[2];
  if (found === null) throw new Error('no rule for ' + selector);
  return found;
}
// Catalogue: source phrase → [en, es], as the page loads it.
const catalogue = (() => { const window = {}; for (const f of fs.readdirSync(path.join(__dirname, 'touch')).filter((n) => /^i18n-messages.*\.js$/.test(n))) vm.runInNewContext(touch(f), { window }); const map = new Map(); (window.CNCTouchMessages || []).forEach((r) => map.set(r[0], r)); return map; })();
const es = (s) => { const r = catalogue.get(s); return r ? r[2] : s; };

// ---- 1. Strip state word and icon (status-strip.js). ----
function stripFixture(t) {
  const { document, node, element } = require('./dom-fixture.cjs').createDOM(['home']);
  document.body.getAttribute = () => null;
  const banner = node('real-banner'), listeners = {};
  const window = { cncI18n: { t: t || ((s) => s), html: (s) => s, locale: 'fr-FR' }, addEventListener(n, f) { listeners[n] = f; }, removeEventListener(n) { delete listeners[n]; } };
  document.createElement = (tag) => { const e = element(tag); Object.defineProperty(e, 'innerHTML', { set() { e._path = { attributes: {}, setAttribute(k, v) { this.attributes[k] = v; } }; }, get() { return ''; } }); e.querySelector = () => e._path; return e; };
  vm.runInNewContext(touch('status-strip.js'), { document, window, Date });
  const byId = (id) => banner.querySelectorAll('*').find((e) => e.id === id);
  const send = (detail) => listeners['cnc-job-status']({ detail: Object.assign({ simulation: false }, detail) });
  const shape = () => byId('t-state')._path.attributes.d;
  const buttons = () => ['t-pause', 't-stop', 't-resume', 't-unlock'].map((id) => id + (byId(id).hidden ? ' hidden' : ' shown') + (byId(id).disabled ? ' disabled' : ' enabled')).join(', ');
  return { window, byId, send, shape, buttons, banner };
}
const m = (patch) => Object.assign({ port: 'A', activeState: 'Idle', workflow: 'idle', fresh: true, statusAgeMs: 300, feedrate: 0, spindleSpeed: 0, name: 'a.nc', canPause: false, canStop: false }, patch);
{
  const f = stripFixture();
  // M3: a probe cycle reports Run; the word was « En cours » while no job ran.
  f.send({ machine: m({ activeState: 'Run', probing: true, canStop: true }), transportConnected: true });
  assert.equal(f.byId('t-state-text').textContent, 'Palpage', 'probing: its own word, not « En cours »');
  assert.equal(f.byId('t-state').getAttribute('data-tone'), 'run');
  // The buttons the strip shows during a probe cycle: Stop only, enabled (as before the lot: describe() is not read there).
  assert.equal(f.buttons(), 't-pause hidden disabled, t-stop shown enabled, t-resume hidden disabled, t-unlock hidden disabled');
  assert.equal(f.window.cncStatusStrip.describe(m({ activeState: 'Run', probing: true }), true).word, 'Palpage');
  assert.equal(f.window.cncStatusStrip.describe(m({ activeState: 'Run' }), true).word, 'En cours', 'a job still reads « En cours »');
  // M4: « Rapport ancien » (running job, old report) drew the pause bars; it now has its own shape, Pause keeps the bars.
  f.send({ machine: m({ activeState: 'Hold:0', workflow: 'paused', canStop: true, canResume: true }), transportConnected: true });
  const hold = f.shape();
  assert.equal(f.byId('t-state').getAttribute('data-tone'), 'warn');
  f.send({ machine: m({ activeState: 'Run', workflow: 'running', fresh: false, statusAgeMs: 9000, canPause: true, canStop: true }), transportConnected: true });
  assert.equal(f.byId('t-state-text').textContent, 'Rapport ancien');
  assert.equal(f.byId('t-state').getAttribute('data-tone'), 'warn', 'same amber tone');
  assert.notEqual(f.shape(), hold, 'an old report is not drawn as a pause');
  assert.equal(f.buttons(), 't-pause shown enabled, t-stop shown enabled, t-resume hidden disabled, t-unlock hidden disabled', 'Pause and Stop still offered on an old report');
  const stale = f.shape();
  f.send({ machine: m({ activeState: 'Door:0', workflow: 'paused' }), transportConnected: true });
  assert.equal(f.byId('t-state-text').textContent, 'Porte ouverte'); assert.equal(f.shape(), hold, 'a door hold keeps the bars');
  // State lost (stream down during a job): the clock as well, never the pause bars.
  f.send({ machine: null, transportConnected: false, halt: { canPause: true, canStop: true, workflow: 'running' } });
  assert.equal(f.byId('t-state-text').textContent, 'État perdu'); assert.equal(f.shape(), stale);
  assert.equal(f.buttons(), 't-pause shown enabled, t-stop shown enabled, t-resume hidden disabled, t-unlock hidden disabled');
  // Spanish: the word of the catalogue.
  const g = stripFixture(es);
  g.send({ machine: m({ activeState: 'Run', probing: true, canStop: true }), transportConnected: true });
  assert.equal(g.byId('t-state-text').textContent, 'Sondeo');
  // M1: the four cells carry a class each (the stylesheet orders them by importance).
  const cells = g.banner.children.find((c) => c.className === 't-vitals').children.map((c) => c.className);
  assert.deepEqual(cells, ['t-vital t-vital--spindle', 't-vital t-vital--feed', 't-vital t-vital--machine', 't-vital t-vital--file']);
}

// ---- 2. Server reasons in the interface language (job-controls.js, M5). ----
(async () => {
  const { load } = require('./job-controls-fixture.cjs');
  for (const [language, word] of [['es', 'Palpando.'], ['en', 'Probing in progress.'], ['fr', 'Palpage en cours.']]) {
    const f = load(language === 'fr' ? {} : { language });
    await f.connect(f.machine({ activeState: 'Run', probing: true, canStart: false, startReason: 'Palpage en cours.', canLoad: false, loadReason: 'Palpage en cours.', canStop: true }));
    f.controls().render && f.controls().render();
    assert.equal(f.el('job-reason').textContent, word, language + ': job-reason in the interface language');
    assert(f.el('file').textContent.endsWith(word), language + ': #file (Suivi) ends with the same reason: ' + f.el('file').textContent);
    // Guards unchanged: no start nor load during a probe cycle, Stop allowed.
    assert.equal(f.el('job-start').disabled, true); assert.equal(f.el('job-load').disabled, true); assert.equal(f.el('job-stop').disabled, false);
  }
  // A paused job whose resume is refused: the server reason is translated too.
  {
    const f = load({ language: 'es' });
    await f.connect(f.machine({ activeState: 'Hold:0', workflow: 'paused', canStart: false, canResume: false, resumeReason: 'La reprise exige une pause simple confirmée par la machine.', canPause: false, canStop: true }));
    assert.equal(f.el('job-reason').textContent, es('La reprise exige une pause simple confirmée par la machine.'));
    assert.notEqual(f.el('job-reason').textContent, 'La reprise exige une pause simple confirmée par la machine.');
    assert.equal(f.el('job-resume').disabled, true);
  }
  // A feed hold given from the PC: CNCjs still runs, the machine holds; the server's reason is shown (N1, phase 7).
  {
    const n1 = 'Pause donnée hors de cet écran : touchez Pause, puis Reprendre.';
    const f = load({ language: 'es' });
    await f.connect(f.machine({ activeState: 'Hold:0', workflow: 'running', canStart: false, canResume: false, resumeReason: n1, canPause: true, canStop: true }));
    assert.equal(f.el('job-reason').textContent, es(n1), 'N1 reason shown while running in Hold');
    assert.equal(f.el('job-resume').disabled, true); assert.equal(f.el('job-pause').disabled, false); assert.equal(f.el('job-stop').disabled, false);
    // Running and moving: the plain « Travail en cours. » stays.
    const g = load({ language: 'es' });
    await g.connect(g.machine({ activeState: 'Run', workflow: 'running', canStart: false, canResume: false, resumeReason: 'La reprise exige une pause simple confirmée par la machine.', canPause: true, canStop: true }));
    assert.equal(g.el('job-reason').textContent, es('Travail en cours.'));
  }
  // Spanish messages of the rehearsal name the buttons with their Spanish labels (phase 7, Astra).
  for (const [message, button] of [['Fichier modifié depuis « Vérifier » : vérifiez à nouveau la reprise.', 'Vérifier'],
    ['Aucun contrôleur suivi : ouvrez le port dans CNCjs au PC ou choisissez le contrôleur dans Fichiers. Port fermé, Arrêter n’atteint pas la machine.', 'Arrêter'],
    ['Pause donnée hors de cet écran : touchez Pause, puis Reprendre.', 'Pause']]) {
    assert(es(message).includes(es(button)), 'ES « ' + es(message) + ' » names the button « ' + es(button) + ' »');
  }
  // Every literal refusal of the job service has its catalogue row (read only; the server is not changed).
  const service = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'server', 'services', 'touch', 'job-service.js'), 'utf8');
  const literals = [...service.matchAll(/conflict\('([^']*)'\)/g)].map((x) => x[1]);
  assert(literals.length > 40, 'literal refusals found: ' + literals.length);
  for (const s of new Set(literals)) assert(catalogue.has(s), 'catalogue row for the server reason « ' + s + ' »');
  // The start reason of the harness's homing phase (browser-run.cjs) as well.
  assert.equal(es('Prise d’origine en cours.'), 'Búsqueda de origen en curso.');

  // ---- 3. Guide (interface-guide.js, touch-shell.css, M7). ----
  {
    const main = { children: [], appendChild(c) { this.children.push(c); return c; } };
    const el = () => ({ children: [], attributes: {}, textContent: '', appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { return this.attributes[k]; }, addEventListener() {}, querySelectorAll: () => [] });
    const byId = {};
    const document = { body: { getAttribute: (k) => (k === 'data-simulation' ? 'true' : null) }, createElement: () => { const e = el(); Object.defineProperty(e, 'innerHTML', { set(v) { e.html = v; } }); return e; },
      getElementById: (id) => byId[id] || (byId[id] = el()), querySelector: (s) => (s === 'main' ? main : el()) };
    // Simulation page with the Spanish catalogue: « Modo actual: simulación », not the French literal « simulation ».
    vm.runInNewContext(touch('interface-guide.js'), { window: { cncI18n: { t: es, html: es }, dispatchEvent() {} }, document, CustomEvent: function () {} });
    // (The fake html() leaves the markup as is; the mode word is the part written by uiLocale.t.)
    assert.match(main.children[0].html, /<p>Mode actuel : simulación<\/p>/, 'simulation mode named in Spanish: ' + main.children[0].html.slice(0, 160));
  }
  // The guide names the dot the preview draws (blue), in the three languages.
  const dot = [...catalogue.values()].find((r) => /indique la position G54 connue/.test(r[0]));
  assert.match(dot[0], /point bleu/); assert.match(dot[1], /blue dot/); assert.match(dot[2], /punto azul/);
  assert.match(touch('interface-guide.js'), /Le point bleu indique/);
  // Intro and compact paragraphs at 16 px, tabs at 48 px in the compact layout, the open topic marked.
  assert.match(rule(shell, '.ks-ui #screen-guide .ks-panel-intro p'), /font-size:16px/);
  const compact = /@media\(max-height:650px\)\{([\s\S]*?\})\}/.exec(shell.slice(shell.indexOf('.ks-ui #screen-guide.active')))[1];
  assert.match(compact, /\.ks-ui #screen-guide \.card p\{font-size:16px;padding:6px 0;line-height:1\.35\}/);
  assert.match(compact, /\.ks-guide-tabs button\{min-height:48px;/);
  assert.match(rule(shell, '.ks-guide-tabs [aria-pressed=true]'), /box-shadow:inset 0 -4px 0 var\(--accent\)/, 'the open topic is marked (it looked like the others)');

  // ---- 4. Strip, lock and page link stylesheet (ui-2027.css, M1, M2, M8). ----
  const B = (s) => '.ks-ui #real-banner>.t-vitals' + s;
  assert.match(rule(ui, B('')), /height:100%;align-self:stretch;flex-wrap:wrap;flex-direction:row-reverse/, 'cells wrap under the strip rather than being clipped');
  assert.match(rule(ui, B('>.t-vital')), /height:100%/, 'a wrapped cell lies wholly under the strip');
  assert.match(rule(ui, B('>.t-vital--file')), /order:1;flex:2 1 120px/, 'the file asks 120 px first (a basis: a narrower zone, 1024 x 600 with Pilote, Débloquer and Pause, gives it less) and comes first');
  assert.match(rule(ui, B('>.t-vital--machine')), /order:2;flex:1 1 96px;max-width:max-content/);
  assert.match(rule(ui, B('>.t-vital--feed')), /order:3/); assert.match(rule(ui, B('>.t-vital--spindle')), /order:4/);
  for (const sel of [B(''), B('>.t-vital'), B('>.t-vital--file')]) rule(ui, sel.replace('#real-banner', '#simulation-banner'));
  assert.equal(rule(ui, '.ks-ui .t-vitals'), 'overflow:hidden', 'the zone still clips');
  assert.match(rule(ui, '.ks-ui.t-compact .t-pilot'), /max-width:160px/, '« Este dispositivo » fits at 1024 x 600');
  assert.match(rule(ui, '.t-btn--ghost'), /border-color:var\(--faint\)/, 'lock and override buttons: outline ≥ 3:1');
  assert.match(rule(ui, '.ks-ui .ks-exit'), /border:1px solid var\(--faint\)/);
  assert.match(rule(ui, '.t-btn:disabled'), /border-color:var\(--line\)/, 'the disabled style is unchanged');
  // No rule of the lot hides or greys a strip machine button.
  for (const mm of ui.matchAll(/([^{}]+)\{([^}]*)\}/g)) if (/#t-(pause|stop|resume|unlock|lock)\b/.test(mm[1])) assert.doesNotMatch(mm[2], /display:none|visibility:hidden|pointer-events:none/, mm[1]);

  // ---- 5. Tokens: outlines of secondary controls (--line-strong) and ghost (--faint) at 3:1. ----
  function theme(selector) { const b = tokens.slice(tokens.indexOf(selector)), body = b.slice(b.indexOf('{') + 1, b.indexOf('}')), out = {}; for (const x of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) out[x[1]] = x[2]; return out; }
  const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const dark = theme(':root{'), light = Object.assign({}, dark, theme(':root[data-theme="light"]'));
  for (const [name, t] of [['dark', dark], ['light', light]]) {
    for (const bg of ['bg', 'surface']) assert(ratio(t['line-strong'], t[bg]) >= 3, name + ' --line-strong on --' + bg + ' ' + ratio(t['line-strong'], t[bg]).toFixed(2));
    for (const bg of ['bg', 'surface', 'surface-2']) assert(ratio(t.faint, t[bg]) >= 3, name + ' --faint on --' + bg);
  }
  // The old values were the defect (dark 2.63 / 2.33, light 2.94 on --bg).
  assert(ratio('#4a5b66', dark.bg) < 3 && ratio('#7f8f9a', light.bg) < 3);

  // ---- 5b. Harness checks (browser-run.cjs, review). ----
  const H = require('./browser-run.cjs');
  // The file column counts only where it is drawn: a file wrapped wholly under the zone, or hidden, is drawn on 0 px.
  const column = (fr, shown) => { const zone = { left: 0, right: 200, top: 0, bottom: 72 }, f = { textContent: 'job.nc', scrollWidth: 150, getBoundingClientRect: () => fr, getClientRects: () => (shown === false ? [] : [fr]), closest: () => ({ getBoundingClientRect: () => zone }) };
    return vm.runInNewContext(H.FILE_COLUMN, { document: { getElementById: () => f }, getComputedStyle: () => ({ visibility: 'visible' }), Math }); };
  assert.equal(column({ left: 0, right: 150, top: 72, bottom: 110 }).w, 0, 'a file under the zone is not drawn (it counted 150 px)');
  assert.equal(column({ left: 0, right: 150, top: 10, bottom: 60 }, false).w, 0, 'a hidden file is not drawn');
  assert.equal(column({ left: 120, right: 270, top: 10, bottom: 60 }).w, 80, 'a file inside the zone: its visible width');
  // The guide's mode word: the catalogue's word of each language (the English « simulation » is the French word), never empty.
  const g = (mode) => ({ tabs: [48, 48, 48, 48], open: '0', active: 'rgb(0, 0, 0) 0px -4px 0px 0px inset', mode });
  for (const [lang, sim, row] of [['fr', true, 'simulation'], ['en', true, 'simulation'], ['es', true, 'simulation'], ['fr', false, 'interface réelle'], ['en', false, 'interface réelle'], ['es', false, 'interface réelle']]) {
    const r = catalogue.get(row), word = lang === 'fr' ? r[0] : lang === 'en' ? r[1] : r[2];
    assert.equal(H.GUIDE_MODE[sim ? 'sim' : 'real'][lang], word, 'harness word = catalogue word, ' + lang);
    assert.deepEqual(H.guideChecks(g('Mode : ' + word), lang, sim, 0), [], lang + (sim ? ' simulation' : ' real') + ': the right word passes');
  }
  assert.equal(H.guideChecks(g(''), 'es', true, 0).length, 1, 'an empty mode fails');
  assert.equal(H.guideChecks(g('Modo actual: simulation'), 'es', true, 0).length, 1, 'the French word on a Spanish page fails');
  assert.equal(H.guideChecks(g('Modo actual: simulación'), 'es', false, 0).length, 1, 'the simulation word on the real page fails');
  assert.equal(H.guideChecks(g('Mode : simulation'), 'fr', true, 2).length, 1, 'the topic asked must be the one open');

  // ---- 6. Cache: every file of the lot is asked with the current suffix. ----
  for (const page of ['index.html', 'simulation.html']) {
    const html = touch(page);
    for (const f of ['status-strip.js', 'job-controls.js', 'interface-guide.js', 'i18n-messages.js', 'ui-2027.css', 'touch-shell.css', 'design-tokens.css']) assert(html.includes(f + '?v=v2q'), page + ': ' + f + '?v=v2q');
  }
  console.log('PASS transverse screen: probing word, pause / old-report icons, strip buttons unchanged, server reasons translated, guide in Spanish and 16 / 48 px, strip cells whole, outlines at 3:1, cache v2q.');
})().catch((e) => { console.error(e); process.exit(1); });
