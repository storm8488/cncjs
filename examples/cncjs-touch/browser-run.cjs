#!/usr/bin/env node
'use strict';
// Browser harness for the touch interface: drives a headless Chrome or Edge
// through the DevTools protocol (no npm package), serves the local visual
// fixture (preview-server.cjs) or an existing server, and writes screenshots,
// rendered tap-target measurements, start-up figures and an end-to-end run on
// the simulation page. Runs on a development PC, never on the tablet.
//
//   node examples/cncjs-touch/browser-run.cjs --out output/browser-run --baseline
//
// Options:
//   --out DIR        output directory (default output/browser-run)
//   --baseline       label the report as the reference ("before") measurement
//   --url URL        touch base URL of a running server (default: preview-server.cjs)
//   --browser PATH   Chrome/Edge executable (default: CNC_BROWSER or well-known paths)
//   --repeat N       start-up repetitions (default 5)
//   --only LIST      comma list among measure,responsive,sim,startup,e2e,strip (default all;
//                    responsive = every screen at the CSS viewports of RESPONSIVE (landscape,
//                    portrait, intermediate sizes, large text, browser zoom 150 / 200 %, a
//                    virtual keyboard, the Surface Pro 3 kiosk at 1366 x 911 and the wide
//                    workstation body.perf-wide at 1366 x 911 and 1728 x 1152 with Préparer
//                    around an #op-card), then Pause / Arrêter and the primary commands hit-tested
//                    with a job running, paused, in alarm and under stacked overlays; sim = the
//                    simulation page with a job running, paused and in alarm, FR and ES,
//                    plus the real page with the controller at rest in alarm; strip =
//                    Pause / Arrêter over every overlay, browser-strip.cjs)
//   --keep-browser   do not kill the browser at the end (debugging)
//   --strict         also fail (exit 1) on a layout regression in the variants the
//                    interface is made for (1366 x 768 and 1024 x 600, standard and
//                    large text, simulation FR/ES): a command whose centre is covered
//                    by another element, a screen that does not scroll shrunk below
//                    scale 1, a primary target under 64 px, a secondary under 48 px, a
//                    jog arrow under 96 px, text under 16 px, a control's text drawn
//                    outside its box or a word cut across two lines, or a rail that
//                    scrolls horizontally, except the entries of
//                    layout-exceptions.json (each with its reason). The responsive variants
//                    (zoom 150 / 200 % included) are enforced too; the default-font variant
//                    stays reported only.
//   --exceptions F   another exceptions file (default layout-exceptions.json here)
// Exit code 1 when a harness step fails (and, with --strict, on a layout regression);
// without --strict the measurements under the project goals are only reported.
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn, execSync } = require('child_process');

const args = process.argv.slice(2);
function option(name, fallback) { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback; }
const OUT = path.resolve(option('--out', 'output/browser-run'));
const BASELINE = args.includes('--baseline');
const URL_BASE = option('--url', '');
// --root DIR: serve another copy of the pages through the fixture (a bundled build, output/touch-bundle).
const ROOT_DIR = option('--root', '');
const REPEAT = Math.max(1, Number(option('--repeat', 5)) || 5);
const ONLY = option('--only', 'measure,responsive,sim,startup,e2e,strip').split(',');
const KEEP = args.includes('--keep-browser');
const STRICT = args.includes('--strict');
const EXCEPTIONS_FILE = path.resolve(option('--exceptions', path.join(__dirname, 'layout-exceptions.json')));

// Project goals (design-tokens.css): not a WCAG requirement.
const GOALS = { primary: 64, secondary: 48, jog: 96, gap: 12, text: 16 };
const RESOLUTIONS = [[1366, 768], [1024, 600]];
// Responsive layouts (touch/responsive.css), in CSS px: [width, height, device scale factor, label, options].
// Browser zoom Z on a W x H screen is a (W / Z) x (H / Z) CSS viewport at device scale factor Z;
// a virtual keyboard leaves the top of the window (320 px taken at the bottom here).
const RESPONSIVE = [
  [1440, 960, 1, '1440x960'], [1080, 720, 1, '1080x720'], [1280, 800, 1, '1280x800'], [1920, 1080, 1, '1920x1080'],
  [720, 1080, 1, '720x1080 portrait'], [960, 1440, 1, '960x1440 portrait'],
  [1180, 820, 1, '1180x820'], [1600, 900, 1, '1600x900'], [800, 1280, 1, '800x1280 portrait'], [600, 960, 1, '600x960 portrait'],
  [1280, 800, 1, '1280x800 texte agrandi', { large: true }], [720, 1080, 1, '720x1080 portrait texte agrandi', { large: true }],
  [911, 512, 1.5, '1366x768 zoom 150 % (911x512 @1.5)'], [683, 384, 2, '1366x768 zoom 200 % (683x384 @2)'], [540, 960, 2, '1080x1920 portrait zoom 200 % (540x960 @2)'],
  [1366, 448, 1, '1366x768 clavier virtuel (1366x448)', { keyboard: true }], [720, 700, 1, '720x1080 portrait clavier virtuel (720x700)', { keyboard: true }],
  // Surface Pro 3 kiosk (PERFORMANCE-UI-SPEC.md 5.1, 5.5): 1366 x 911 (scale 1.58) in Éco, then the wide
  // workstation (body.perf-wide) at 1366 x 911 and 1728 x 1152: Performance profile by storage and
  // perf-gpu set by CDP, since this PC's headless browser renders WebGL in software (Q12).
  [1366, 911, 1, '1366x911'], [1366, 911, 1, '1366x911 poste large', { wide: true }], [1728, 1152, 1, '1728x1152 poste large', { wide: true }]
];
const SCREENS = [['menu', 'Menu'], ['home', 'Suivi'], ['files', 'Fichiers'], ['jog', 'Préparer'], ['machine', 'Machine'], ['history', 'Journal'], ['settings', 'Réglages']];
const STATE_WORDS = { fr: { idle: 'Repos', running: 'En cours', paused: 'Pause' }, en: { idle: 'Idle', running: 'Running', paused: 'Pause' }, es: { idle: 'Reposo', running: 'En curso', paused: 'Pausa' } };

const failures = [];
const log = (m) => console.log(new Date().toISOString().slice(11, 19) + ' ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => { const s = a.filter((v) => typeof v === 'number' && isFinite(v)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const r1 = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : v);

function findBrowser() {
  const given = option('--browser', process.env.CNC_BROWSER);
  const candidates = given ? [given] : process.platform === 'win32' ? [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ] : ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium', 'microsoft-edge', '/usr/bin/google-chrome'];
  for (const c of candidates) {
    if (c.includes(path.sep) || c.includes('/')) { if (fs.existsSync(c)) return c; continue; }
    try { const found = execSync((process.platform === 'win32' ? 'where ' : 'command -v ') + c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\r?\n/)[0].trim(); if (found) return found; } catch (_) { /* next */ }
  }
  throw new Error('No Chrome/Edge found: pass --browser PATH or set CNC_BROWSER');
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } }); }).on('error', reject);
  });
}

// --- DevTools protocol client over the WebSocket of Node 22+ (or the ws package).
function WebSocketImpl() {
  if (typeof WebSocket === 'function') return WebSocket;
  return require('ws'); // eslint-disable-line global-require
}
class CDP {
  constructor(url) { this.url = url; this.seq = 0; this.pending = new Map(); this.listeners = new Map(); }
  connect() {
    const WS = WebSocketImpl();
    return new Promise((resolve, reject) => {
      const ws = new WS(this.url);
      this.ws = ws;
      const onMessage = (data) => {
        const msg = JSON.parse(typeof data === 'string' ? data : data.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id); this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message + ' (' + p.method + ')')); else p.resolve(msg.result || {});
        } else if (msg.method) {
          (this.listeners.get(msg.method) || []).forEach((fn) => fn(msg.params));
        }
      };
      if (typeof ws.addEventListener === 'function') {
        ws.addEventListener('open', () => resolve());
        ws.addEventListener('error', (e) => reject(new Error('WebSocket error ' + (e.message || ''))));
        ws.addEventListener('message', (e) => onMessage(e.data));
      } else {
        ws.on('open', resolve); ws.on('error', reject); ws.on('message', onMessage);
      }
    });
  }
  send(method, params, timeoutMs) {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, timeoutMs || 60000);
    });
  }
  on(method, fn) { if (!this.listeners.has(method)) this.listeners.set(method, []); this.listeners.get(method).push(fn); }
  once(method, timeoutMs) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting ' + method)), timeoutMs || 30000);
      this.on(method, function handler(p) { clearTimeout(t); resolve(p); });
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page exception: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 400));
    return r.result.value;
  }
  async waitFor(expression, ms, label) {
    const until = Date.now() + ms;
    for (;;) {
      let v = null;
      try { v = await this.evaluate(expression); } catch (_) { v = null; }
      if (v) return v;
      if (Date.now() > until) throw new Error('timeout: ' + (label || expression));
      await sleep(150);
    }
  }
  close() { try { this.ws.close(); } catch (_) { /* ignore */ } }
}

// --- Browser and fixture server.
async function launchBrowser(width, height) {
  const exe = findBrowser();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cnc-browser-run-'));
  const flags = ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    '--window-size=' + width + ',' + height, '--force-device-scale-factor=1', '--disable-extensions', '--disable-background-networking', '--disable-sync',
    '--disable-features=Translate,OptimizationHints,MediaRouter', '--lang=fr-FR', 'about:blank'];
  if (process.env.CI || process.getuid && process.getuid() === 0) flags.unshift('--no-sandbox');
  const child = spawn(exe, flags, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; if (stderr.length > 20000) stderr = stderr.slice(-10000); });
  const portFile = path.join(profile, 'DevToolsActivePort');
  const until = Date.now() + 30000;
  while (!fs.existsSync(portFile) || !fs.readFileSync(portFile, 'utf8').trim()) {
    if (child.exitCode !== null) throw new Error('browser exited early: ' + stderr.slice(-800));
    if (Date.now() > until) throw new Error('DevToolsActivePort not written: ' + stderr.slice(-800));
    await sleep(100);
  }
  const port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]);
  const version = await getJson('http://127.0.0.1:' + port + '/json/version');
  let targets = [];
  for (let i = 0; i < 50 && !targets.some((t) => t.type === 'page'); i++) { targets = await getJson('http://127.0.0.1:' + port + '/json/list'); if (!targets.some((t) => t.type === 'page')) await sleep(100); }
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable'); await cdp.send('Performance.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: '(function(){function tick(){var h=document.documentElement,b=document.body;if(h&&b&&b.classList.contains("ks-ui")&&!h.classList.contains("cnc-loading")){window.__cncReadyAt=performance.now();return;}requestAnimationFrame(tick);}tick();})();' });
  cdp.on('Runtime.exceptionThrown', (p) => { const d = p.exceptionDetails; pageErrors.push((d.exception && d.exception.description) || d.text); });
  return { exe, child, profile, port, cdp, version: version.Browser, userAgent: version['User-Agent'] };
}
const pageErrors = [];

function startFixture(extraArgs) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, 'preview-server.cjs');
    const child = spawn(process.execPath, [script].concat(extraArgs || []), { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => { out += d; const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\//); if (m) resolve({ child, base: 'http://127.0.0.1:' + m[1] + '/' }); });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => reject(new Error('preview-server exited (' + code + '): ' + out.slice(-800))));
    setTimeout(() => reject(new Error('preview-server did not print its URL: ' + out.slice(-800))), 20000);
  });
}

// --- Page helpers.
async function setViewport(cdp, width, height, dpr) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr || 1, mobile: false, screenWidth: width, screenHeight: height });
}
async function navigate(cdp, url, timeoutMs) {
  const loaded = cdp.once('Page.loadEventFired', timeoutMs || 60000);
  await cdp.send('Page.navigate', { url });
  await loaded;
}
async function waitReady(cdp) {
  await cdp.waitFor('!!(window.cncShell&&document.body.classList.contains("ks-ui")&&!document.documentElement.classList.contains("cnc-loading"))', 40000, 'touch shell ready');
}
// The fixture's controller state settles a few seconds after load (stream
// fallback, first polls): measure the same state in every pass.
async function waitSettled(cdp) {
  await waitReady(cdp);
  let previous = null, stable = 0;
  for (let i = 0; i < 40 && stable < 3; i++) {
    await sleep(500);
    const now = await cdp.evaluate('(function(){var t=function(id){var e=document.getElementById(id);return e?e.textContent:"";};return t("t-state-text")+"|"+t("home-job-ready")+"|"+(document.getElementById("notice")||{}).hidden;})()');
    stable = now === previous ? stable + 1 : 0; previous = now;
  }
}
async function goScreen(cdp, name) {
  await cdp.evaluate('window.cncShell.go(' + JSON.stringify(name) + ');true');
  await cdp.waitFor('(function(){var s=document.getElementById("screen-' + name + '");return !!(s&&s.classList.contains("active")&&!s._fitHidden&&getComputedStyle(s).visibility!=="hidden");})()', 15000, 'screen ' + name + ' visible');
  if (name === 'files') { try { await cdp.waitFor('document.querySelectorAll(".library-file").length>0', 15000, 'file list'); } catch (e) { failures.push('files list: ' + e.message); } }
  await sleep(700);
  await cdp.evaluate('new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r);});})');
}
async function screenshot(cdp, file) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' }, 60000);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
}

// Measures what is really rendered: every visible button/link/field of the
// active screen plus the header and the rail. Sizes in CSS px of the page.
const MEASURE = String(function measure(goals) {
  var vw = window.innerWidth, vh = window.innerHeight, dpr = window.devicePixelRatio || 1;
  var active = document.querySelector('main .screen.active');
  function hiddenAncestor(el) { for (var n = el; n; n = n.parentElement) { if (n.hidden || n.getAttribute('aria-hidden') === 'true') return true; } return false; }
  function visible(el) {
    if (hiddenAncestor(el)) return false;
    for (var n = el; n && n !== document.body; n = n.parentElement) { var cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0 || cs.contentVisibility === 'hidden') return false; }
    var r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
  }
  function label(el) { var t = (el.textContent || '').replace(/\s+/g, ' ').trim(); return (t || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.value || ('#' + (el.id || el.className || el.tagName.toLowerCase()))).slice(0, 60); }
  function textFont(el) {
    var min = Infinity, walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (var node = walker.nextNode(); node; node = walker.nextNode()) { if (!node.data.trim()) continue; var p = node.parentElement; if (p && visible(p)) { var size = parseFloat(getComputedStyle(p).fontSize); if (size < min) min = size; } }
    return isFinite(min) ? min : parseFloat(getComputedStyle(el).fontSize);
  }
  function kind(el) {
    var c = el.classList;
    if (c.contains('jog')) return 'jog';
    // "Charger la sélection" (home-load) is a secondary action by design (UI 2027: Démarrer or
    // Reprendre is the one primary action of Suivi), so it is measured against 48 px.
    if (c.contains('t-btn--primary') || c.contains('t-btn--danger') || c.contains('t-btn--lg') || c.contains('job-start') || c.contains('job-stop') || c.contains('ks-tile') || /^(home-job-start|home-job-stop|home-job-pause|home-job-resume|job-confirm|job-dismiss|t-stop|t-pause|t-resume|t-unlock)$/.test(el.id)) return 'primary';
    return 'secondary';
  }
  // viewport-fit.js scales a screen that does not fit (transform: scale): boxes
  // from getBoundingClientRect are already rendered sizes, font sizes are not.
  var transform = active ? getComputedStyle(active).transform : 'none', m = /matrix\(([^,]+),/.exec(transform);
  var screenScale = m ? Math.round(parseFloat(m[1]) * 1000) / 1000 : 1;
  function renderedFont(el, size) { return active && active.contains(el) ? size * screenScale : size; }
  var de = document.documentElement, main = document.querySelector('main'), rail = document.getElementById('tabbar');
  var selector = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], label.t-check, summary';
  var nodes = Array.prototype.filter.call(document.querySelectorAll(selector), function (el) {
    var screen = el.closest('main .screen'); if (screen && screen !== active) return false;
    if (el.closest('#cnc-boot')) return false;
    if (el.tagName === 'INPUT' && el.closest('label.t-check')) return false; // measured with its label
    return visible(el);
  });
  var rects = nodes.map(function (el) { return el.getBoundingClientRect(); });
  // Text of a control drawn outside its box (px beyond the left/right edge), and a word cut
  // across two lines without a hyphenation point (a soft hyphen is a chosen break).
  function textFit(el, r) {
    var out = 0, broken = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (var node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.data.trim() || !node.parentElement || !visible(node.parentElement)) continue;
      // What is drawn: the text clipped by its ancestors up to the control (an ellipsis, a
      // screen-reader-only label in a 1 px clipped box is not text out of its control).
      var clip = { left: -Infinity, right: Infinity };
      for (var a = node.parentElement; a; a = a.parentElement) {
        var cs = getComputedStyle(a);
        if (cs.overflowX !== 'visible' || cs.clip !== 'auto' || cs.clipPath !== 'none') { var ar = a.getBoundingClientRect(); clip.left = Math.max(clip.left, ar.left); clip.right = Math.min(clip.right, ar.right); }
        if (a === el) break;
      }
      var range = document.createRange(); range.selectNodeContents(node);
      Array.prototype.forEach.call(range.getClientRects(), function (q) {
        var left = Math.max(q.left, clip.left), right = Math.min(q.right, clip.right);
        if (q.width && right > left) out = Math.max(out, r.left - left, right - r.right);
      });
      var re = /[^\s\u00ad]+/g, m;
      if (node.data.indexOf('\u00ad') < 0) while ((m = re.exec(node.data))) {
        var w = document.createRange(); w.setStart(node, m.index); w.setEnd(node, m.index + m[0].length);
        var tops = {}; Array.prototype.forEach.call(w.getClientRects(), function (q) { if (q.width) tops[Math.round(q.top)] = 1; });
        if (Object.keys(tops).length > 1) broken.push(m[0]);
      }
    }
    return { out: Math.round(out * 10) / 10, broken: broken };
  }
  var targets = nodes.map(function (el, i) {
    var r = rects[i], k = kind(el), goal = goals[k];
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2, hit = document.elementFromPoint(cx, cy);
    // A disabled control has pointer-events:none (ui-2027.css): the tap reaches
    // its container, which explains why the control is disabled. That is by design.
    var disabled = !!(el.disabled || el.getAttribute('aria-disabled') === 'true');
    var reachable = !!hit && (hit === el || el.contains(hit) || (hit.contains(el) && (hit.tagName === 'LABEL' || disabled)));
    // Centre outside the window or outside a clipping ancestor (a list scrolled, a screen that
    // scrolls): not hidden by another element, but not on screen either.
    var offscreen = cx < 0 || cy < 0 || cx > vw || cy > vh;
    for (var n = el.parentElement; n && !offscreen && n !== document.body; n = n.parentElement) {
      var ov = getComputedStyle(n); if (ov.overflowX === 'visible' && ov.overflowY === 'visible') continue;
      var cr = n.getBoundingClientRect(); if (cx < cr.left || cx > cr.right || cy < cr.top || cy > cr.bottom) offscreen = true;
    }
    var gap = Infinity, neighbour = null, overlaps = [];
    rects.forEach(function (o, j) {
      if (j === i || nodes[j].contains(el) || el.contains(nodes[j])) return;
      var dx = Math.max(o.left - r.right, r.left - o.right, 0), dy = Math.max(o.top - r.bottom, r.top - o.bottom, 0), d = Math.sqrt(dx * dx + dy * dy);
      if (dx === 0 && dy === 0) overlaps.push(label(nodes[j]));
      if (d < gap) { gap = d; neighbour = label(nodes[j]); }
    });
    var font = renderedFont(el, textFont(el)), fit = textFit(el, r);
    return { textOut: fit.out, brokenWords: fit.broken, label: label(el), id: el.id || null, tag: el.tagName.toLowerCase(), kind: k, goal: goal, x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
      minSide: Math.round(Math.min(r.width, r.height) * 10) / 10, belowGoal: Math.min(r.width, r.height) * dpr < goal - 0.5, fontPx: Math.round(font * 10) / 10, textBelowGoal: font * dpr < goals.text - 0.5,
      gap: isFinite(gap) ? Math.round(gap * 10) / 10 : null, neighbour: neighbour, gapBelowGoal: isFinite(gap) && gap * dpr < goals.gap - 0.5, overlaps: overlaps, disabled: disabled, reachable: reachable, offscreen: offscreen, hit: reachable ? null : (hit ? label(hit) : 'nothing') };
  });
  // Small text: visible text nodes under 16 px, anywhere on the active screen, header or rail.
  var small = [], truncated = [], seen = new Set();
  var all = document.querySelectorAll('body *');
  Array.prototype.forEach.call(all, function (el) {
    var screen = el.closest('main .screen'); if (screen && screen !== active) return;
    if (el.closest('#cnc-boot') || /^(SCRIPT|STYLE|LINK|SVG|PATH)$/.test(el.tagName)) return;
    var own = Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 3 && n.data.trim(); }).map(function (n) { return n.data.replace(/\s+/g, ' ').trim(); }).join(' ');
    if (!own || !visible(el)) return;
    var size = renderedFont(el, parseFloat(getComputedStyle(el).fontSize));
    if (size * dpr < goals.text - 0.5) { var key = own + '@' + size; if (!seen.has(key)) { seen.add(key); small.push({ text: own.slice(0, 60), fontPx: Math.round(size * 10) / 10, tag: el.tagName.toLowerCase(), id: el.id || null }); } }
    var cs = getComputedStyle(el);
    // Screen-reader-only text (.ks-sr-only: 1 px clipped box) is not truncation.
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible' && el.clientWidth > 2 && !el.classList.contains('ks-sr-only')) truncated.push({ text: own.slice(0, 60), tag: el.tagName.toLowerCase(), id: el.id || null, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, textOverflow: cs.textOverflow });
  });
  // A screen scrolls when it is marked so (Réglages) or when the responsive layout let it grow
  // past the window (data-fit-overflow, viewport-fit.js): main then scrolls under the strip.
  var mainScrolls = !!main && getComputedStyle(main).overflowY === 'auto' && main.scrollHeight > main.clientHeight + 1;
  return { viewport: { width: vw, height: vh, dpr: dpr }, activeScreen: active ? active.id : null, screenScale: screenScale, scrolls: !!active && (active.getAttribute('data-fit') === 'scroll' || (active.getAttribute('data-fit-overflow') === 'true' && mainScrolls)),
    railScroll: !!rail && rail.scrollWidth > rail.clientWidth + 1 ? rail.scrollWidth + ' > ' + rail.clientWidth : null,
    horizontalOverflow: { document: de.scrollWidth > de.clientWidth + 1, documentScrollWidth: de.scrollWidth, clientWidth: de.clientWidth, main: !!main && main.scrollWidth > main.clientWidth + 1, active: !!active && active.scrollWidth > active.clientWidth + 1 },
    verticalOverflow: { document: de.scrollHeight > de.clientHeight + 1, active: !!active && active.scrollHeight > active.clientHeight + 1 && active.getAttribute('data-fit') !== 'scroll' },
    targets: targets, smallText: small, truncated: truncated, bodyClass: document.body.className, theme: de.getAttribute('data-theme') || 'dark' };
});

// Controls whose text leaves their box (> 1 px) or breaks a word across lines.
function textFitOf(data) {
  return data.targets.filter((t) => t.textOut > 1 || (t.brokenWords && t.brokenWords.length)).map((t) => ({ label: t.label, id: t.id, out: t.textOut, broken: t.brokenWords }));
}
async function measureScreens(cdp, baseUrl, variant, dirName, dpr, summary, strict, screens) {
  const dir = path.join(OUT, dirName);
  fs.mkdirSync(dir, { recursive: true });
  const results = [];
  for (const [name, label] of screens || SCREENS) {
    try {
      await goScreen(cdp, name);
      const data = await cdp.evaluate('(' + MEASURE + ')(' + JSON.stringify(GOALS) + ')');
      data.screen = name; data.label = label; data.variant = variant;
      fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(data, null, 1));
      await screenshot(cdp, path.join(dir, name + '.png'));
      const below = data.targets.filter((t) => t.belowGoal), small = data.targets.filter((t) => t.textBelowGoal), gaps = data.targets.filter((t) => t.gapBelowGoal), unreachable = data.targets.filter((t) => !t.reachable);
      const fonts = data.targets.map((t) => t.fontPx), fontStats = { min: fonts.length ? Math.min(...fonts) : null, median: median(fonts), max: fonts.length ? Math.max(...fonts) : null };
      log(variant + ' ' + label + ': ' + data.targets.length + ' targets, ' + below.length + ' under size goal, ' + small.length + ' with text < 16 px, ' + gaps.length + ' gaps < 12 px, ' + unreachable.length + ' unreachable, scale ' + data.screenScale + ', target font ' + fontStats.min + '–' + fontStats.max + ' px' + (data.horizontalOverflow.document ? ', HORIZONTAL OVERFLOW' : ''));
      results.push({ screen: name, label, targets: data.targets.length, below, small: data.smallText, textTargets: small, gaps, unreachable, truncated: data.truncated, overflow: data.horizontalOverflow, vertical: data.verticalOverflow, scale: data.screenScale, scrolls: data.scrolls, fontStats, textFit: textFitOf(data), railScroll: data.railScroll });
    } catch (e) {
      failures.push(variant + ' ' + label + ': ' + e.message); log('FAIL ' + variant + ' ' + label + ': ' + e.message);
      results.push({ screen: name, label, error: e.message });
    }
  }
  summary.measurements.push({ variant, dir: dirName, dpr, results, strict: !!strict });
}

async function setDisplaySize(cdp, size) {
  await goScreen(cdp, 'settings');
  const ok = await cdp.evaluate('(function(){var b=document.querySelector("[data-display-size=\\"' + size + '\\"]");if(!b)return false;b.click();return document.body.classList.contains("display-large")===' + (size === 'large') + ';})()');
  if (!ok) throw new Error('display size ' + size + ' not applied');
  await sleep(400);
}

// --- Start-up: cold (cache cleared) then warm, REPEAT times, medians.
const STARTUP_COLLECT = String(function collect() {
  var nav = performance.getEntriesByType('navigation')[0], entries = performance.getEntriesByType('resource');
  var byType = {}, bytes = 0, encoded = 0, decoded = 0, fromCache = 0, list = [];
  entries.forEach(function (e) {
    var ext = (e.name.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i) || [])[1] || e.initiatorType;
    var type = /^(js|cjs|mjs)$/.test(ext) ? 'script' : ext === 'css' ? 'style' : /^(png|jpg|svg|ico|webp)$/.test(ext) ? 'image' : /^(woff2?|ttf)$/.test(ext) ? 'font' : e.initiatorType === 'xmlhttprequest' || e.initiatorType === 'fetch' ? 'xhr' : 'other';
    byType[type] = (byType[type] || 0) + 1; bytes += e.transferSize || 0; encoded += e.encodedBodySize || 0; decoded += e.decodedBodySize || 0; if (e.transferSize === 0 && e.decodedBodySize > 0) fromCache++;
    list.push({ name: e.name.replace(location.origin, ''), type: type, transferSize: e.transferSize, decodedBodySize: e.decodedBodySize, duration: Math.round(e.duration * 10) / 10 });
  });
  var t = nav || {};
  return { readyAt: window.__cncReadyAt || null, navigation: nav ? { type: nav.type, responseEnd: t.responseEnd, domInteractive: t.domInteractive, domContentLoaded: t.domContentLoadedEventEnd, loadEventEnd: t.loadEventEnd, transferSize: t.transferSize, decodedBodySize: t.decodedBodySize } : null,
    legacyTiming: performance.timing ? { domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart, load: performance.timing.loadEventEnd - performance.timing.navigationStart } : null,
    resources: { count: entries.length, byType: byType, transferBytes: bytes, encodedBytes: encoded, decodedBytes: decoded, servedFromCache: fromCache, list: list },
    memory: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize } : null };
});
async function startupRun(cdp, url, cold, index) {
  if (cold) { await cdp.send('Network.clearBrowserCache'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: false }); }
  pageErrors.length = 0;
  await navigate(cdp, url + (url.includes('?') ? '&' : '?') + 'run=' + (cold ? 'cold' : 'warm') + index);
  await waitReady(cdp);
  await sleep(1500);
  const data = await cdp.evaluate('(' + STARTUP_COLLECT + ')()');
  try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) { /* optional */ }
  const heap = await cdp.send('Runtime.getHeapUsage');
  const metrics = await cdp.send('Performance.getMetrics');
  const m = {}; (metrics.metrics || []).forEach((x) => { m[x.name] = x.value; });
  data.heapAfterGc = { usedSize: heap.usedSize, totalSize: heap.totalSize };
  data.metrics = { Nodes: m.Nodes, JSEventListeners: m.JSEventListeners, Documents: m.Documents, Frames: m.Frames, LayoutCount: m.LayoutCount, RecalcStyleCount: m.RecalcStyleCount, LayoutDurationMs: r1((m.LayoutDuration || 0) * 1000), RecalcStyleDurationMs: r1((m.RecalcStyleDuration || 0) * 1000), ScriptDurationMs: r1((m.ScriptDuration || 0) * 1000), TaskDurationMs: r1((m.TaskDuration || 0) * 1000), JSHeapUsedSize: m.JSHeapUsedSize, JSHeapTotalSize: m.JSHeapTotalSize };
  data.pageErrors = pageErrors.slice();
  return data;
}
async function measureStartup(cdp, url, summary) {
  const runs = { cold: [], warm: [] };
  for (let i = 1; i <= REPEAT; i++) {
    try {
      // Kept as a pair: a failed warm run must not shift the cold and warm lists.
      const cold = await startupRun(cdp, url, true, i);
      const warm = await startupRun(cdp, url, false, i);
      runs.cold.push(cold);
      runs.warm.push(warm);
      log('startup ' + i + '/' + REPEAT + ': cold ready ' + r1(cold.readyAt) + ' ms, warm ready ' + r1(warm.readyAt) + ' ms');
    } catch (e) { failures.push('startup run ' + i + ': ' + e.message); log('FAIL startup ' + i + ': ' + e.message); }
  }
  const pick = (list, fn) => median(list.map(fn));
  const stats = (list) => ({
    runs: list.length,
    readyAtMs: r1(pick(list, (x) => x.readyAt)), domContentLoadedMs: r1(pick(list, (x) => x.navigation && x.navigation.domContentLoaded)), loadEventEndMs: r1(pick(list, (x) => x.navigation && x.navigation.loadEventEnd)),
    resources: pick(list, (x) => x.resources.count), scripts: pick(list, (x) => x.resources.byType.script || 0), styles: pick(list, (x) => x.resources.byType.style || 0), xhr: pick(list, (x) => x.resources.byType.xhr || 0),
    transferBytes: pick(list, (x) => x.resources.transferBytes), decodedBytes: pick(list, (x) => x.resources.decodedBytes), servedFromCache: pick(list, (x) => x.resources.servedFromCache),
    heapUsedAfterGcBytes: pick(list, (x) => x.heapAfterGc.usedSize), domNodes: pick(list, (x) => x.metrics.Nodes), listeners: pick(list, (x) => x.metrics.JSEventListeners),
    scriptMs: r1(pick(list, (x) => x.metrics.ScriptDurationMs)), layoutMs: r1(pick(list, (x) => x.metrics.LayoutDurationMs)), styleMs: r1(pick(list, (x) => x.metrics.RecalcStyleDurationMs)), taskMs: r1(pick(list, (x) => x.metrics.TaskDurationMs)),
    pageErrors: list.reduce((n, x) => n + x.pageErrors.length, 0)
  });
  const result = { url, repeat: REPEAT, cold: stats(runs.cold), warm: stats(runs.warm), runs };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'startup.json'), JSON.stringify(result, null, 1));
  summary.startup = result;
}

// --- End-to-end run on the simulation page, one language at a time.
async function e2e(cdp, simUrl, lang, summary) {
  const dir = path.join(OUT, 'e2e-' + lang);
  fs.mkdirSync(dir, { recursive: true });
  const steps = [];
  const t0 = Date.now();
  const step = async (name, fn) => {
    const start = Date.now();
    try { const info = await fn(); steps.push({ step: name, ok: true, ms: Date.now() - start, ...(info || {}) }); log('e2e ' + lang + ' ' + name + ' ok' + (info && info.stateWord ? ' (' + info.stateWord + ')' : '')); }
    catch (e) { steps.push({ step: name, ok: false, ms: Date.now() - start, error: e.message }); failures.push('e2e ' + lang + ' ' + name + ': ' + e.message); log('FAIL e2e ' + lang + ' ' + name + ': ' + e.message); throw e; }
  };
  const state = () => cdp.evaluate('(function(){var m=window.cncState&&window.cncState.get().machine;var t=function(id){var e=document.getElementById(id);return e?e.textContent.trim():null;};return {workflow:m?m.workflow:null,activeState:m?m.activeState:null,stateWord:t("t-state-text"),ready:t("home-job-ready"),feedback:t("home-job-feedback"),percent:t("home-job-percent"),lang:window.cncI18n&&window.cncI18n.language,htmlLang:document.documentElement.lang};})()');
  const expectWord = async (key, where) => {
    const s = await state();
    const expected = STATE_WORDS[lang][key];
    const fromTable = await cdp.evaluate('window.cncI18n.t(' + JSON.stringify(STATE_WORDS.fr[key]) + ')');
    if (s.stateWord !== expected) throw new Error(where + ': state word "' + s.stateWord + '" instead of "' + expected + '" (i18n table says "' + fromTable + '")');
    if (fromTable !== expected) throw new Error(where + ': i18n table gives "' + fromTable + '" for ' + key + ', expected "' + expected + '"');
    return s;
  };
  const confirmDialog = async (shotName) => {
    await cdp.waitFor('!document.getElementById("job-dialog").hidden', 15000, 'confirmation dialog');
    await sleep(400);
    const dialog = await cdp.evaluate('(function(){var d=document.getElementById("job-dialog"),c=document.getElementById("job-check"),l=c.closest("label"),b=document.getElementById("job-countdown-bar"),r=c.getBoundingClientRect(),rl=l.getBoundingClientRect();return {title:document.getElementById("job-dialog-title").textContent,label:l.textContent.trim(),countdown:document.getElementById("job-countdown").textContent,barWidth:b.getBoundingClientRect().width,confirmDisabled:document.getElementById("job-confirm").disabled,checkbox:{w:Math.round(r.width),h:Math.round(r.height)},labelBox:{w:Math.round(rl.width),h:Math.round(rl.height)},prefix:window.cncI18n.t("Confirmation valable "),expectedLabel:window.cncI18n.t("Je souhaite lancer cette simulation.")};})()');
    await screenshot(cdp, path.join(dir, shotName + '.png'));
    if (!dialog.confirmDisabled) throw new Error('Confirm enabled before the box is ticked');
    if (dialog.label !== dialog.expectedLabel) throw new Error('dialog label "' + dialog.label + '" differs from "' + dialog.expectedLabel + '"');
    if (!dialog.countdown.startsWith(dialog.prefix) || !/\d+/.test(dialog.countdown)) throw new Error('countdown text "' + dialog.countdown + '" does not start with "' + dialog.prefix + '"');
    const ticked = await cdp.evaluate('(function(){var c=document.getElementById("job-check");c.checked=true;c.dispatchEvent(new Event("change",{bubbles:true}));return !document.getElementById("job-confirm").disabled;})()');
    if (!ticked) throw new Error('Confirm still disabled after ticking the box');
    // The countdown ticks once a second: waiting two ticks guarantees a visible change.
    const later = await cdp.evaluate('new Promise(function(r){setTimeout(function(){r(document.getElementById("job-countdown").textContent);},2200);})');
    if (later === dialog.countdown) throw new Error('countdown did not advance: "' + later + '"');
    await cdp.evaluate('document.getElementById("job-confirm").click();true');
    await cdp.waitFor('document.getElementById("job-dialog").hidden', 10000, 'dialog closed');
    return { title: dialog.title, label: dialog.label, countdown: dialog.countdown, countdownLater: later, checkboxBox: dialog.checkbox, labelBox: dialog.labelBox };
  };
  try {
    await step('open simulation page (' + lang + ')', async () => {
      await navigate(cdp, simUrl);
      await cdp.evaluate('localStorage.setItem("cncjs-touch-language-v1",' + JSON.stringify(lang) + ');true');
      await navigate(cdp, simUrl + '?lang-run=' + lang);
      await waitReady(cdp);
      const s = await state();
      if (s.lang !== lang) throw new Error('page language ' + s.lang + ' instead of ' + lang);
      await screenshot(cdp, path.join(dir, '01-loaded.png'));
      return { lang: s.lang, htmlLang: s.htmlLang };
    });
    await step('select and load a file', async () => {
      await goScreen(cdp, 'files');
      const file = await cdp.evaluate('(function(){var b=document.querySelector(".library-file");b.click();return b.getAttribute("data-file");})()');
      await cdp.waitFor('(function(){var b=document.getElementById("job-load");return !!b&&!b.disabled;})()', 15000, 'load button enabled');
      await screenshot(cdp, path.join(dir, '02-file-selected.png'));
      await cdp.evaluate('document.getElementById("job-load").click();true');
      await cdp.waitFor('(function(){var m=window.cncState.get().machine;return !!(m&&m.name);})()', 15000, 'file loaded in the simulated controller');
      await goScreen(cdp, 'home');
      await cdp.waitFor('(function(){var b=document.getElementById("home-job-start");return !!b&&!b.disabled;})()', 15000, 'Démarrer enabled');
      await screenshot(cdp, path.join(dir, '03-loaded-suivi.png'));
      const s = await expectWord('idle', 'after load');
      return { file, stateWord: s.stateWord, ready: s.ready };
    });
    await step('start with confirmation', async () => {
      await cdp.evaluate('document.getElementById("home-job-start").click();true');
      const dialog = await confirmDialog('04-start-dialog');
      await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="running"', 15000, 'running');
      await cdp.waitFor('(function(){var p=document.getElementById("home-job-percent").textContent;return p&&p!=="—"&&!/^0\\s*%/.test(p);})()', 20000, 'progress moving');
      await sleep(500);
      await screenshot(cdp, path.join(dir, '05-running.png'));
      const s = await expectWord('running', 'after start');
      return { dialog, stateWord: s.stateWord, percent: s.percent, feedback: s.feedback };
    });
    await step('pause', async () => {
      await cdp.evaluate('(function(){var b=document.getElementById("t-pause");if(b&&!b.hidden&&!b.disabled){b.click();return "strip";}document.getElementById("home-job-pause").click();return "suivi";})()');
      await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="paused"', 15000, 'paused');
      await sleep(1200);
      await screenshot(cdp, path.join(dir, '06-paused.png'));
      const s = await expectWord('paused', 'after pause');
      return { stateWord: s.stateWord, percent: s.percent, feedback: s.feedback };
    });
    await step('resume with confirmation', async () => {
      await cdp.waitFor('(function(){var b=document.getElementById("home-job-resume");return !!b&&!b.disabled&&!b.closest("[hidden]");})()', 10000, 'Reprendre enabled');
      await cdp.evaluate('document.getElementById("home-job-resume").click();true');
      const dialog = await confirmDialog('07-resume-dialog');
      await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="running"', 15000, 'running again');
      await sleep(1200);
      await screenshot(cdp, path.join(dir, '08-resumed.png'));
      const s = await expectWord('running', 'after resume');
      return { dialog: { title: dialog.title }, stateWord: s.stateWord, percent: s.percent };
    });
    await step('stop', async () => {
      await cdp.evaluate('document.getElementById("home-job-stop").click();true');
      await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="idle"', 15000, 'idle after stop');
      await sleep(1200);
      await screenshot(cdp, path.join(dir, '09-stopped.png'));
      const s = await expectWord('idle', 'after stop');
      const startDisabled = await cdp.evaluate('document.getElementById("home-job-start").disabled');
      return { stateWord: s.stateWord, percent: s.percent, feedback: s.feedback, startDisabledAfterStop: startDisabled };
    });
  } catch (_) { /* recorded in steps and failures */ }
  const result = { lang, ok: steps.every((s) => s.ok) && steps.length === 6, ms: Date.now() - t0, steps };
  fs.writeFileSync(path.join(dir, 'steps.json'), JSON.stringify(result, null, 1));
  summary.e2e.push(result);
}

// --- Measurements with active commands and alerts, on the simulation page: Suivi while a
// job runs (strip Pause/Stop, overrides) and in a pause, Machine and Suivi with the alarm
// card, in French and Spanish (the longest texts), at both resolutions. Same measurer.
async function simMeasure(cdp, simUrl, summary) {
  for (const [w, h] of RESOLUTIONS) {
    for (const lang of ['fr', 'es']) {
      const tag = 'sim ' + w + 'x' + h + ' ' + lang, dirName = 'sim-' + w + 'x' + h + '-' + lang;
      const dir = path.join(OUT, dirName);
      fs.mkdirSync(dir, { recursive: true });
      const results = [], reportOnly = [];
      const capture = async (name, label, variant) => {
        try {
          await goScreen(cdp, name);
          const data = await cdp.evaluate('(' + MEASURE + ')(' + JSON.stringify(GOALS) + ')');
          data.screen = name; data.label = label; data.variant = tag + ' ' + variant;
          fs.writeFileSync(path.join(dir, variant + '-' + name + '.json'), JSON.stringify(data, null, 1));
          await screenshot(cdp, path.join(dir, variant + '-' + name + '.png'));
          const below = data.targets.filter((t) => t.belowGoal), small = data.targets.filter((t) => t.textBelowGoal), gaps = data.targets.filter((t) => t.gapBelowGoal), unreachable = data.targets.filter((t) => !t.reachable);
          const fonts = data.targets.map((t) => t.fontPx), fontStats = { min: fonts.length ? Math.min(...fonts) : null, median: median(fonts), max: fonts.length ? Math.max(...fonts) : null };
          log(tag + ' ' + variant + ' ' + label + ': ' + data.targets.length + ' targets, ' + below.length + ' under size goal, ' + small.length + ' with text < 16 px, scale ' + data.screenScale + (data.verticalOverflow.active ? ', VERTICAL OVERFLOW' : ''));
          results.push({ screen: name, label: label + ' · ' + variant, targets: data.targets.length, below, small: data.smallText, textTargets: small, gaps, unreachable, truncated: data.truncated, overflow: data.horizontalOverflow, vertical: data.verticalOverflow, scale: data.screenScale, scrolls: data.scrolls, fontStats, textFit: textFitOf(data), railScroll: data.railScroll });
        } catch (e) { failures.push(tag + ' ' + variant + ' ' + label + ': ' + e.message); log('FAIL ' + tag + ' ' + variant + ': ' + e.message); results.push({ screen: name, label: label + ' · ' + variant, error: e.message }); }
      };
      try {
        await setViewport(cdp, w, h, 1);
        await navigate(cdp, simUrl);
        await cdp.evaluate('localStorage.setItem("cncjs-touch-language-v1",' + JSON.stringify(lang) + ');true');
        await navigate(cdp, simUrl + '?sim-measure=' + lang);
        // A load that stalls once (seen after a viewport change) is retried once before failing.
        try { await waitReady(cdp); } catch (_) { await navigate(cdp, simUrl + '?sim-measure=' + lang + '-retry'); await waitReady(cdp); }
        await goScreen(cdp, 'files');
        await cdp.evaluate('document.querySelector(".library-file").click();true');
        await cdp.waitFor('(function(){var b=document.getElementById("job-load");return !!b&&!b.disabled;})()', 15000, 'load enabled');
        await cdp.evaluate('document.getElementById("job-load").click();true');
        await cdp.waitFor('(function(){var m=window.cncState.get().machine;return !!(m&&m.name);})()', 15000, 'loaded');
        await goScreen(cdp, 'home');
        await capture('home', 'Suivi', 'loaded');
        await cdp.evaluate('document.getElementById("home-job-start").click();true');
        await cdp.waitFor('!document.getElementById("job-dialog").hidden', 15000, 'dialog');
        await sleep(300);
        const dialog = await cdp.evaluate('(' + MEASURE + ')(' + JSON.stringify(GOALS) + ')');
        const dialogTargets = dialog.targets.filter((t) => /^(job-check|job-confirm|job-dismiss)$/.test(t.id || '') || t.tag === 'label');
        results.push({ screen: 'dialog', label: 'Confirmation · dialog', targets: dialogTargets.length, below: dialogTargets.filter((t) => t.belowGoal), small: dialog.smallText, textTargets: dialogTargets.filter((t) => t.textBelowGoal), gaps: dialogTargets.filter((t) => t.gapBelowGoal), unreachable: dialogTargets.filter((t) => !t.reachable), truncated: dialog.truncated, overflow: dialog.horizontalOverflow, vertical: dialog.verticalOverflow, scale: 1, scrolls: false, fontStats: { min: null, median: null, max: null } });
        await screenshot(cdp, path.join(dir, 'dialog.png'));
        await cdp.evaluate('(function(){var c=document.getElementById("job-check");c.checked=true;c.dispatchEvent(new Event("change",{bubbles:true}));document.getElementById("job-confirm").click();return true;})()');
        await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="running"', 15000, 'running');
        await sleep(1500);
        await capture('home', 'Suivi', 'running');
        await capture('jog', 'Préparer', 'running');
        await cdp.evaluate('(function(){var b=document.getElementById("t-pause");if(b&&!b.hidden&&!b.disabled)b.click();else document.getElementById("home-job-pause").click();return true;})()');
        await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="paused"', 15000, 'paused');
        await sleep(1200);
        await capture('home', 'Suivi', 'paused');
        // Alarm from the virtual controller: the Machine card and the Suivi notice.
        await goScreen(cdp, 'machine');
        const alarmed = await cdp.evaluate('(function(){var b=document.getElementById("sim-trigger-alarm");if(!b||b.disabled)return false;b.click();return true;})()');
        if (alarmed) {
          await cdp.waitFor('/^alarm/i.test(((window.cncState.get().machine||{}).activeState)||"")', 10000, 'alarm');
          await sleep(1200);
          await capture('machine', 'Machine', 'alarm');
          await capture('home', 'Suivi', 'alarm');
          await cdp.evaluate('(function(){var b=document.getElementById("sim-clear-alarm");if(b&&!b.disabled)b.click();return true;})()');
        } else failures.push(tag + ': alarm button unavailable');
        await cdp.evaluate('document.getElementById("home-job-stop").click();true');
        await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="idle"', 15000, 'idle');
        // Alarm at rest (no job): the strip and Suivi as the operator finds them (validation D3).
        await goScreen(cdp, 'machine');
        if (await cdp.evaluate('(function(){var b=document.getElementById("sim-trigger-alarm");if(!b||b.disabled)return false;b.click();return true;})()')) {
          await cdp.waitFor('/^alarm/i.test(((window.cncState.get().machine||{}).activeState)||"")', 10000, 'alarm at rest');
          await sleep(1200);
          // The end-of-job summary still shown beside the alarm: reported only (Suivi is scaled
          // to fit, see the fix report); then acknowledged (OK), the state the check enforces.
          const strictResults = results.splice(0, results.length);
          await capture('home', 'Suivi', 'alarm-idle-summary');
          reportOnly.push(...results.splice(0, results.length)); results.push(...strictResults);
          await cdp.evaluate('(function(){var b=document.getElementById("home-job-summary-close");if(b&&!b.hidden)b.click();return true;})()');
          await sleep(600);
          await capture('home', 'Suivi', 'alarm-idle');
          await cdp.evaluate('(function(){var b=document.getElementById("sim-clear-alarm");if(b&&!b.disabled)b.click();return true;})()');
        } else failures.push(tag + ': alarm button unavailable at rest');
      } catch (e) { failures.push(tag + ': ' + e.message); log('FAIL ' + tag + ': ' + e.message); }
      summary.measurements.push({ variant: tag + ' (job running, paused, alarm, alarm at rest)', dir: dirName, dpr: 1, results, strict: true });
      if (reportOnly.length) summary.measurements.push({ variant: tag + ' (alarm at rest, end summary not acknowledged)', dir: dirName, dpr: 1, results: reportOnly, strict: false });
    }
  }
  await cdp.evaluate('localStorage.removeItem("cncjs-touch-language-v1");true').catch(() => {});
}

// Real page with the controller at rest in ALARM (preview-server.cjs --replay-alarm): the
// strip offers « Déverrouiller… » beside Pilote (validation D3), FR and ES, standard and large.
// Two alarms: ALARM:1 (short help) and a job stopped in motion whose ALARM:3 is deduced after
// the restart, with the end summary: the longest help Suivi holds (validation N1). The strip,
// the rail (Menu) and Suivi are enforced; Machine is reported.
const DEDUCED_SCAN = `(function(){var code=/(Alarme|Alarma|Alarm)\\s*3\\b/,mark=/déduit|deducid|deduced/i,out=[],seen={};
  var note=document.getElementById('t-state-note'),noted=!!(note&&!note.hidden&&mark.test(note.textContent));
  var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),n;
  while((n=w.nextNode())){if(!code.test(n.nodeValue))continue;var el=n.parentElement;if(!el||!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')continue;
    var block=el.closest('#t-state,.ks-tile,[id]')||el,text=(block.innerText||block.textContent).replace(/\\s+/g,' ').trim();
    if(mark.test(text)||(el.closest('#t-state')&&noted)||seen[block.id+text])continue;seen[block.id+text]=1;out.push({id:block.id||block.className,text:text.slice(0,120)});}
  return out;})()`;
async function alarmMeasure(cdp, summary) {
  for (const [arg, kind] of [['--replay-alarm', 'ALARM:1'], ['--replay-alarm-stopped', 'ALARM:3 deduced']]) await alarmVariant(cdp, summary, arg, kind);
}
async function alarmVariant(cdp, summary, arg, kind) {
  const fixture = await startFixture([arg]);
  try {
    for (const [w, h] of RESOLUTIONS) {
      for (const lang of ['fr', 'es']) {
        for (const size of ['standard', 'large']) {
          const tag = 'alarm at rest (' + kind + ') ' + w + 'x' + h + ' ' + lang + (size === 'large' ? ' texte agrandi' : ''), dirName = 'alarm-' + (arg === '--replay-alarm' ? '1' : '3') + '-' + w + 'x' + h + '-' + lang + '-' + size;
          const dir = path.join(OUT, dirName); fs.mkdirSync(dir, { recursive: true });
          const results = [], reportOnly = [];
          try {
            await setViewport(cdp, w, h, 1);
            await navigate(cdp, fixture.base + 'README.md');
            await cdp.evaluate('localStorage.setItem("cncjs-touch-language-v1",' + JSON.stringify(lang) + ');localStorage.setItem("cncjs-touch-display-v1",' + JSON.stringify(JSON.stringify({ size })) + ');true');
            await navigate(cdp, fixture.base + 'index.html?alarm=' + lang + size); await waitReady(cdp);
            await cdp.waitFor('(function(){var b=document.getElementById("t-unlock");return !!b&&!b.hidden;})()', 20000, 'Déverrouiller offered');
            if (arg !== '--replay-alarm') await cdp.waitFor('(function(){var m=window.cncState.get().machine,s=document.getElementById("home-job-summary");return !!(m&&m.alarmCodeInferred&&s&&!s.hidden);})()', 20000, 'ALARM:3 deduced and end summary');
            for (const [name, label] of [['home', 'Suivi'], ['menu', 'Menu'], ['machine', 'Machine']]) {
              await goScreen(cdp, name);
              const data = await cdp.evaluate('(' + MEASURE + ')(' + JSON.stringify(GOALS) + ')');
              fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(data, null, 1));
              await screenshot(cdp, path.join(dir, name + '.png'));
              const fit = textFitOf(data);
              // A deduced ALARM:3 is never shown as received (V6): every visible « Alarme 3 » block
              // says « déduite » (the strip by its note), on Suivi, Menu and Machine.
              if (arg !== '--replay-alarm') {
                const unmarked = await cdp.evaluate(DEDUCED_SCAN);
                unmarked.forEach((x) => failures.push(tag + ' ' + label + ': « Alarme 3 » not marked deduced in ' + x.id + ' — ' + x.text));
              }
              log(tag + ' ' + label + ': ' + data.targets.length + ' targets, ' + fit.length + ' text overflow / cut words' + (fit.length ? ' (' + fit.map((t) => t.label + (t.broken && t.broken.length ? ' cut ' + t.broken.join('/') : '') + (t.out > 1 ? ' +' + t.out + ' px' : '')).join('; ') + ')' : ''));
              (name === 'machine' ? reportOnly : results).push({ screen: name, label: label + ' · alarm at rest', targets: data.targets.length, below: data.targets.filter((t) => t.belowGoal), small: data.smallText, textTargets: data.targets.filter((t) => t.textBelowGoal), gaps: [], unreachable: data.targets.filter((t) => !t.reachable), truncated: data.truncated, overflow: data.horizontalOverflow, vertical: data.verticalOverflow, scale: data.screenScale, scrolls: data.scrolls, fontStats: {}, textFit: fit, railScroll: data.railScroll });
            }
          } catch (e) { failures.push(tag + ': ' + e.message); log('FAIL ' + tag + ': ' + e.message); }
          // Enforced on Suivi and the menu (strip, rail: D3, N1, N2); Machine is reported.
          summary.measurements.push({ variant: tag, dir: dirName, dpr: 1, results, strict: true });
          summary.measurements.push({ variant: tag + ' (report only)', dir: dirName, dpr: 1, results: reportOnly, strict: false });
        }
      }
    }
    await cdp.evaluate('localStorage.removeItem("cncjs-touch-language-v1");localStorage.removeItem("cncjs-touch-display-v1");true').catch(() => {});
  } finally { fixture.child.kill(); }
}

// --- Responsive layouts (touch/responsive.css). First every screen of the real page at each
// CSS viewport of RESPONSIVE, enforced like 1366 x 768 (no scale below 1 on a screen that does
// not scroll, sizes, text, covered commands). Then, on the simulation page with a job, the
// commands the operator must always reach, hit-tested at their centre (elementFromPoint) and not
// inert: Pause / Arrêter of the strip on every screen, under one sheet and under a sheet with the
// numeric pad stacked on it, in alarm; Reprendre in a pause and Démarrer once loaded (scrolled
// into view when the screen scrolls). Last, a rotation keeps the selection, the screen, the
// inspection mode and the page itself (no reload).
const HIT_TEST = `(function(ids,scroll){return ids.map(function(id){var b=document.getElementById(id);if(!b)return {id:id,missing:true};
  if(scroll&&b.scrollIntoView&&b.getClientRects().length)b.scrollIntoView({block:'nearest',inline:'nearest'});
  var r=b.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,shown=!b.hidden&&r.width>0&&r.height>0&&!b.closest('[hidden]');
  var inView=cx>=0&&cy>=0&&cx<=window.innerWidth&&cy<=window.innerHeight,hit=shown&&inView?document.elementFromPoint(cx,cy):null;
  function d(n){return n?(n.id?'#'+n.id:n.tagName.toLowerCase()+(typeof n.className==='string'&&n.className?'.'+n.className.split(' ')[0]:'')):'nothing';}
  return {id:id,shown:shown,disabled:!!b.disabled,inView:inView,hitOk:!!hit&&(hit===b||b.contains(hit)),hit:d(hit),inert:b.closest('[inert]')?d(b.closest('[inert]')):null,w:Math.round(r.width),h:Math.round(r.height)};});})`;
async function hitCheck(cdp, ctx, where, ids, opts, report) {
  const list = await cdp.evaluate(HIT_TEST + '(' + JSON.stringify(ids) + ',' + !!(opts && opts.scroll) + ')');
  for (const b of list) {
    const label = ctx + ' · ' + where + ' · ' + b.id;
    report.push(Object.assign({ variant: ctx, where }, b));
    if (b.missing || !b.shown) { if (opts && opts.required) failures.push('responsive ' + label + ': not shown'); continue; }
    if (b.disabled && !(opts && opts.allowDisabled)) { failures.push('responsive ' + label + ': disabled'); continue; }
    if (!b.inView) failures.push('responsive ' + label + ': centre outside the window');
    else if (!b.hitOk) failures.push('responsive ' + label + ': centre covered by ' + b.hit);
    if (b.inert) failures.push('responsive ' + label + ': inert under ' + b.inert);
    const goal = /^(t-pause|t-stop|t-resume|home-job-start|home-job-resume)$/.test(b.id) ? GOALS.primary : GOALS.secondary;
    if (Math.min(b.w, b.h) < goal - 0.5) failures.push('responsive ' + label + ': ' + b.w + ' x ' + b.h + ' px, goal ' + goal);
  }
  return list;
}
async function closeOverlays(cdp) {
  await cdp.evaluate('(function(){try{window.cncShell.closeSheet();}catch(e){}try{if(window.CNCPreviewGL&&window.CNCPreviewGL.close)window.CNCPreviewGL.close();}catch(e){}return true;})()').catch(() => {});
}
// The GPU gate of lot V (body.perf-gpu) forced from outside the page, after its own probe (Q12): the
// shipped code has no hook for it. touch-shell.js then decides perf-wide by its own rule.
// Suivi's structure (parent > children), compared before the wide layout and after leaving it.
const SUIVI_SHAPE = '(function(){var d=document.querySelector("#screen-home .job-dashboard");if(!d)return "";function k(n){return n.id||n.tagName+"."+(typeof n.className==="string"?n.className:"");}' +
  'return JSON.stringify([d,d.querySelector("#home-left"),d.querySelector(".job-metrics"),d.querySelector(".home-progress-head")].map(function(n){return n?k(n)+">"+Array.prototype.map.call(n.children,k).join(","):"";}))+"|"+d.hasAttribute("data-zones");})()';
const FORCE_GPU = '(async function(){window.__brShape=' + SUIVI_SHAPE + ';try{if(window.cncGpu&&typeof window.cncGpu.ready==="function")await window.cncGpu.ready();}catch(e){}' +
  'document.body.classList.add("perf-gpu");var s={checked:true,hardware:true,lost:false,renderer:"browser-run",reason:""};try{if(window.cncGpu)s=Object.assign(window.cncGpu.state(),{hardware:true,reason:""});}catch(e){}' +
  'window.dispatchEvent(new CustomEvent("cnc-gpu-change",{detail:s}));await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r);});});' +
  'return document.body.classList.contains("perf-wide")&&!!(window.cncLayout&&window.cncLayout.wide());})()';
async function responsiveVariant(cdp, url, w, h, dpr, opts) {
  await setViewport(cdp, w, h, dpr);
  await navigate(cdp, url.replace(/[^/]*$/, '') + 'README.md');
  const profile = opts && opts.wide ? 'localStorage.setItem("cncjs-touch-performance-v1",' + JSON.stringify(JSON.stringify({ version: 1, profile: 'performance' })) + ');' : 'localStorage.removeItem("cncjs-touch-performance-v1");';
  await cdp.evaluate('localStorage.removeItem("cncjs-touch-language-v1");' + profile + 'localStorage.setItem("cncjs-touch-display-v1",' + JSON.stringify(JSON.stringify({ size: opts && opts.large ? 'large' : 'standard' })) + ');true');
  await navigate(cdp, url + (url.includes('?') ? '&' : '?') + 'responsive=' + w + 'x' + h);
  if (opts && opts.wide) {
    await waitReady(cdp);
    if (!(await cdp.evaluate(FORCE_GPU))) throw new Error('perf-wide not applied at ' + w + 'x' + h);
  }
}
// Préparer with the origin preview of lot O (#op-card, body.perf-origin): measured with O's card when
// the page mounted it, else with a placeholder card of the same id, to check D's grid around it.
const ORIGIN_CARD = '(function(){var s=document.getElementById("screen-jog");if(!s)return false;var c=document.getElementById("op-card");' +
  'if(!c){c=document.createElement("section");c.id="op-card";c.className="card op-card";c.setAttribute("data-browser-run","placeholder");' +
  'var h=document.createElement("h2");h.textContent="Où le programme se placera";var v=document.createElement("div");v.style.cssText="flex:1 1 auto;min-height:260px;background:#101820;border-radius:10px";' +
  'c.appendChild(h);c.appendChild(v);s.appendChild(c);}document.body.classList.add("perf-origin");return true;})()';
async function responsiveMeasure(cdp, realUrl, simUrl, summary) {
  const report = [];
  for (const [w, h, dpr, label, opts] of RESPONSIVE) {
    const dirName = 'responsive-' + label.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+$/, '');
    try {
      await responsiveVariant(cdp, realUrl, w, h, dpr, opts); await waitSettled(cdp);
      await measureScreens(cdp, realUrl, label, dirName, dpr, summary, true);
      if (opts && opts.wide) {
        if (!(await cdp.evaluate(ORIGIN_CARD))) throw new Error('Préparer not found');
        await measureScreens(cdp, realUrl, label + ' + #op-card', dirName + '-op-card', dpr, summary, true, [['jog', 'Préparer']]);
        // The canvas of the origin card never lies within 24 px of a jog arrow (spec 5.4).
        const gap = await cdp.evaluate('(function(){var c=document.getElementById("op-card").getBoundingClientRect(),m=Infinity;Array.prototype.forEach.call(document.querySelectorAll("#screen-jog .jog"),function(b){var r=b.getBoundingClientRect();if(!r.width)return;var dx=Math.max(c.left-r.right,r.left-c.right,0),dy=Math.max(c.top-r.bottom,r.top-c.bottom,0);m=Math.min(m,Math.max(dx,dy));});return m;})()');
        if (!(gap >= 24)) failures.push('responsive ' + label + ': #op-card ' + gap + ' px from a jog arrow, goal 24');
        log(label + ' Préparer + #op-card: nearest jog arrow ' + gap + ' px from the card');
        // Leaving the wide layout (Éco chosen, for instance) puts Suivi back exactly as it was.
        const back = await cdp.evaluate('(async function(){var c=document.getElementById("op-card");if(c&&c.getAttribute("data-browser-run"))c.remove();document.body.classList.remove("perf-origin","perf-gpu");' +
          'window.dispatchEvent(new CustomEvent("cnc-gpu-change",{detail:{hardware:false}}));await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r);});});' +
          'return {wide:document.body.classList.contains("perf-wide"),same:window.__brShape===' + SUIVI_SHAPE + ',zones:!!document.getElementById("home-zone-gauges")&&document.contains(document.getElementById("home-zone-gauges"))};})()');
        if (back.wide || !back.same || back.zones) failures.push('responsive ' + label + ': Suivi not restored after leaving the wide layout (' + JSON.stringify(back) + ')');
        else log(label + ': Suivi restored as before after leaving the wide layout');
      }
    } catch (e) { failures.push('responsive ' + label + ': ' + e.message); log('FAIL responsive ' + label + ': ' + e.message); }
  }
  for (const [w, h, dpr, label, opts] of RESPONSIVE) {
    const ctx = 'sim ' + label;
    try {
      await responsiveVariant(cdp, simUrl, w, h, dpr, opts);
      try { await waitReady(cdp); } catch (_) { await responsiveVariant(cdp, simUrl, w, h, dpr, opts); await waitReady(cdp); }
      await goScreen(cdp, 'files');
      await cdp.evaluate('document.querySelector(".library-file").click();true');
      await cdp.waitFor('(function(){var b=document.getElementById("job-load");return !!b&&!b.disabled;})()', 15000, 'load enabled');
      await cdp.evaluate('document.getElementById("job-load").click();true');
      await cdp.waitFor('(function(){var m=window.cncState.get().machine;return !!(m&&m.name);})()', 15000, 'loaded');
      await goScreen(cdp, 'home');
      await cdp.waitFor('(function(){var b=document.getElementById("home-job-start");return !!b&&!b.disabled;})()', 15000, 'Démarrer enabled');
      await hitCheck(cdp, ctx, 'Suivi loaded', ['home-job-start'], { scroll: true, required: true }, report);
      await cdp.evaluate('document.getElementById("home-job-start").click();true');
      await cdp.waitFor('!document.getElementById("job-dialog").hidden', 15000, 'dialog');
      await sleep(300);
      // The confirmation's own commands, in its card (which scrolls instead of shrinking).
      await hitCheck(cdp, ctx, 'confirmation', ['job-check', 'job-dismiss'], { scroll: true, required: true }, report);
      await cdp.evaluate('(function(){var c=document.getElementById("job-check");c.checked=true;c.dispatchEvent(new Event("change",{bubbles:true}));return true;})()');
      await hitCheck(cdp, ctx, 'confirmation', ['job-confirm'], { scroll: true, required: true }, report);
      await cdp.evaluate('document.getElementById("job-confirm").click();true');
      await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="running"', 15000, 'running');
      await sleep(800);
      for (const [name] of SCREENS) { await goScreen(cdp, name); await hitCheck(cdp, ctx, 'running ' + name, ['t-pause', 't-stop'], { required: true }, report); }
      // Wide workstation: Pause and Arrêter of Suivi's Commandes zone too, Arrêter alone below Pause.
      if (opts && opts.wide) {
        await goScreen(cdp, 'home');
        await hitCheck(cdp, ctx, 'running Suivi (zones)', ['home-job-pause', 'home-job-stop'], { scroll: true, required: true }, report);
        const zones = await cdp.evaluate('(function(){var d=document.querySelector(".job-dashboard"),p=document.getElementById("home-job-pause").getBoundingClientRect(),s=document.getElementById("home-job-stop").getBoundingClientRect(),c=document.getElementById("home-zone-controls");' +
          'return {zones:d&&d.getAttribute("data-zones"),stopInControls:!!(c&&c.contains(document.getElementById("home-job-stop"))),stopBelow:s.top>=p.bottom,side:!(s.top>=p.bottom||p.top>=s.bottom)};})()');
        if (!zones.zones || !zones.stopInControls) failures.push('responsive ' + ctx + ': Suivi zones not built (' + JSON.stringify(zones) + ')');
        if (!zones.stopBelow || zones.side) failures.push('responsive ' + ctx + ': Arrêter not alone below Pause (' + JSON.stringify(zones) + ')');
      }
      // One sheet, then the numeric pad stacked on it.
      await goScreen(cdp, 'jog');
      await cdp.evaluate('document.getElementById("ks-origin-info").click();true'); await sleep(400);
      await hitCheck(cdp, ctx, 'sheet', ['t-pause', 't-stop'], { required: true }, report);
      await cdp.evaluate('(function(){var i=document.getElementById("responsive-run-input");if(!i){i=document.createElement("input");i.id="responsive-run-input";document.getElementById("screen-jog").appendChild(i);}window.CNCNumeric.open(i,{label:"Test",unit:"mm",min:0,max:50});return true;})()'); await sleep(400);
      if (!(await cdp.evaluate('!!document.getElementById("t-numpad")&&!document.getElementById("t-numpad").hidden'))) failures.push('responsive ' + ctx + ': numeric pad not opened over the sheet');
      await hitCheck(cdp, ctx, 'sheet + numeric pad', ['t-pause', 't-stop'], { required: true }, report);
      await cdp.evaluate('(function(){try{window.CNCNumeric.close();}catch(e){}try{window.cncShell.closeSheet();}catch(e){}return true;})()'); await sleep(300);
      // Pause: Reprendre in Suivi (scrolled into view when Suivi scrolls) and in the strip.
      await cdp.evaluate('document.getElementById("t-pause").click();true');
      await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="paused"', 15000, 'paused');
      await sleep(1200);
      await goScreen(cdp, 'home');
      await hitCheck(cdp, ctx, 'paused', ['t-stop', 't-resume'], { required: true }, report);
      await hitCheck(cdp, ctx, 'paused Suivi', ['home-job-resume'], { scroll: true, required: true }, report);
      // Alarm during the job: Arrêter stays reachable on every screen.
      await goScreen(cdp, 'machine');
      if (await cdp.evaluate('(function(){var b=document.getElementById("sim-trigger-alarm");if(!b||b.disabled)return false;b.click();return true;})()')) {
        await cdp.waitFor('/^alarm/i.test(((window.cncState.get().machine||{}).activeState)||"")', 10000, 'alarm');
        await sleep(1000);
        for (const name of ['home', 'machine', 'menu']) { await goScreen(cdp, name); await hitCheck(cdp, ctx, 'alarm ' + name, ['t-stop'], { required: true }, report); }
        await cdp.evaluate('(function(){var b=document.getElementById("sim-clear-alarm");if(b&&!b.disabled)b.click();return true;})()');
      } else failures.push('responsive ' + ctx + ': alarm button unavailable');
      await cdp.evaluate('document.getElementById("t-stop").click();true');
      await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="idle"', 15000, 'idle after stop');
      log('responsive ' + ctx + ': Pause / Arrêter / Reprendre / Démarrer hit-tested on every screen, under a sheet and a stacked pad, in alarm');
    } catch (e) { failures.push('responsive ' + ctx + ': ' + e.message); log('FAIL responsive ' + ctx + ': ' + e.message); }
  }
  // Rotation and resizing keep the operator's state: selection, screen, inspection mode, page.
  try {
    await responsiveVariant(cdp, simUrl, 1080, 720, 1); await waitReady(cdp);
    await goScreen(cdp, 'files');
    const file = await cdp.evaluate('(function(){var b=document.querySelectorAll(".library-file");b=b[1]||b[0];b.click();return b.getAttribute("data-file");})()');
    await goScreen(cdp, 'home');
    await cdp.evaluate('window.__noReload=1;(function(){var b=document.getElementById("t-inspect");if(b&&b.getAttribute("aria-pressed")!=="true")b.click();return true;})()');
    const before = await cdp.evaluate('({file:(window.cncLibrarySelection||{}).file||null,screen:(document.querySelector("main .screen.active")||{}).id,inspect:document.body.classList.contains("t-inspect")})');
    for (const [w, h] of [[720, 1080], [1366, 448], [960, 1440], [1080, 720]]) {
      await setViewport(cdp, w, h, 1); await sleep(700);
      const now = await cdp.evaluate('({file:(window.cncLibrarySelection||{}).file||null,screen:(document.querySelector("main .screen.active")||{}).id,inspect:document.body.classList.contains("t-inspect"),kept:window.__noReload===1})');
      if (!now.kept) failures.push('responsive rotation ' + w + 'x' + h + ': the page reloaded');
      if (now.file !== before.file || now.file !== file) failures.push('responsive rotation ' + w + 'x' + h + ': selection ' + now.file + ' instead of ' + file);
      if (now.screen !== before.screen) failures.push('responsive rotation ' + w + 'x' + h + ': screen ' + now.screen + ' instead of ' + before.screen);
      if (now.inspect !== before.inspect) failures.push('responsive rotation ' + w + 'x' + h + ': inspection mode lost');
      await hitCheck(cdp, 'rotation ' + w + 'x' + h, 'Suivi', ['t-inspect'], { scroll: true, required: true, allowDisabled: true }, report);
    }
    log('responsive rotation: selection ' + file + ', screen ' + before.screen + ', inspection ' + before.inspect + ' kept through 720x1080, 1366x448, 960x1440, 1080x720');
  } catch (e) { failures.push('responsive rotation: ' + e.message); log('FAIL responsive rotation: ' + e.message); }
  // Advanced views (PROFILES-CONTRACT.md §5): preview-gl.js is never requested in Éco (not at load,
  // not by loadAdvanced, not by the « 3D libre » button), and is loaded once, for real, in Performance.
  const GL_REQUESTS = '(performance.getEntriesByType("resource").filter(function(e){return /preview-gl\\.js/.test(e.name);}).length)';
  const FREE = '(function(){var b=Array.prototype.filter.call(document.querySelectorAll(".pv3d-free"),function(x){return !x.hidden&&!x.disabled&&x.getClientRects().length;})[0];if(!b)return false;b.click();return true;})()';
  const advanced = {};
  try {
    for (const perf of ['eco', 'performance']) {
      await setViewport(cdp, 1366, 768, 1);
      await navigate(cdp, realUrl.replace(/[^/]*$/, '') + 'README.md');
      await cdp.evaluate('localStorage.setItem("cncjs-touch-performance-v1",' + JSON.stringify(JSON.stringify({ version: 1, profile: perf })) + ');true');
      await navigate(cdp, realUrl + (realUrl.includes('?') ? '&' : '?') + 'advanced=' + perf); await waitReady(cdp);
      const state = await cdp.evaluate('({perf:window.cncProfile.performance(),cls:document.body.classList.contains("perf-"+window.cncProfile.performance()),requests:' + GL_REQUESTS + ',tags:document.querySelectorAll("script[src*=preview-gl]").length})');
      if (state.perf !== perf || !state.cls) failures.push('advanced ' + perf + ': profile read back as ' + state.perf);
      // Éco: never. Performance: at most once, by loadAdvanced for the GPU probe after load
      // (PERFORMANCE-UI-SPEC.md 2.1, Q3), never as a script of the page itself.
      if (perf === 'eco' ? state.requests || state.tags : state.requests > 1 || state.tags > 1) failures.push('advanced ' + perf + ': preview-gl.js requested at load (' + JSON.stringify(state) + ')');
      // The « 3D libre » button of a file's preview, when the fixture shows one.
      await goScreen(cdp, 'files');
      await cdp.evaluate('(function(){var f=document.querySelector(".library-file");if(f)f.click();return true;})()'); await sleep(1500);
      const clicked = await cdp.evaluate(FREE); await sleep(1500);
      const direct = await cdp.evaluate('window.cncProfile.loadAdvanced(["preview-gl.js"]).then(function(){return "loaded";},function(e){return "refused: "+e.message;})');
      await sleep(300);
      const after = await cdp.evaluate('({requests:' + GL_REQUESTS + ',tags:document.querySelectorAll("script[src*=preview-gl]").length,module:!!window.CNCPreviewGL})');
      if (perf === 'eco') {
        if (!/^refused/.test(direct)) failures.push('advanced eco: loadAdvanced was not refused (' + direct + ')');
        if (after.requests || after.tags || after.module) failures.push('advanced eco: preview-gl.js requested (' + JSON.stringify(after) + ')');
      } else {
        if (direct !== 'loaded') failures.push('advanced performance: preview-gl.js not loaded (' + direct + ')');
        if (after.requests !== 1 || after.tags !== 1 || !after.module) failures.push('advanced performance: preview-gl.js expected once, got ' + JSON.stringify(after));
      }
      advanced[perf] = { button: clicked, loadAdvanced: direct, after };
      log('advanced ' + perf + ': « 3D libre » ' + (clicked ? 'clicked' : 'not shown by the fixture') + ', loadAdvanced ' + direct + ', preview-gl.js requests ' + after.requests + ', module ' + after.module);
      await closeOverlays(cdp);
    }
  } catch (e) { failures.push('advanced: ' + e.message); log('FAIL advanced: ' + e.message); }
  await cdp.evaluate('localStorage.removeItem("cncjs-touch-display-v1");localStorage.removeItem("cncjs-touch-performance-v1");true').catch(() => {});
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'responsive-hits.json'), JSON.stringify({ hits: report, advanced }, null, 1));
  summary.responsive = { viewports: RESPONSIVE.map((v) => v[3]), hits: report.length };
}

// --- Strict layout check (--strict): the regressions the layout must never show, minus the
// documented exceptions (layout-exceptions.json: check, variant / screen / label patterns, reason).
function loadExceptions() {
  if (!fs.existsSync(EXCEPTIONS_FILE)) return [];
  const data = JSON.parse(fs.readFileSync(EXCEPTIONS_FILE, 'utf8'));
  const list = Array.isArray(data) ? data : data.exceptions || [];
  list.forEach((e, i) => { if (!e.check || !e.reason) throw new Error(EXCEPTIONS_FILE + ': exception ' + i + ' needs "check" and "reason"'); });
  return list;
}
function strictCheck(summary, exceptionList) {
  const exceptions = (exceptionList || loadExceptions()).map((e) => ({ e, used: 0, re: { variant: e.variant ? new RegExp(e.variant) : null, screen: e.screen ? new RegExp(e.screen) : null, label: e.label ? new RegExp(e.label) : null } }));
  const violations = [], excepted = [];
  const add = (v) => {
    const hit = exceptions.find((x) => x.e.check === v.check && (!x.re.variant || x.re.variant.test(v.variant)) && (!x.re.screen || x.re.screen.test(v.screen) || x.re.screen.test(v.screenLabel)) && (!x.re.label || x.re.label.test(v.label)));
    if (hit) { hit.used++; excepted.push(Object.assign({ reason: hit.e.reason }, v)); } else violations.push(v);
  };
  for (const m of summary.measurements) {
    if (!m.strict) continue;
    for (const r of m.results) {
      if (r.error) continue;
      const base = { variant: m.variant, screen: r.screen, screenLabel: r.label };
      if (!r.scrolls && typeof r.scale === 'number' && r.scale < 0.999) add(Object.assign({ check: 'scale', label: r.label, detail: 'scale ' + r.scale + ' on a screen that does not scroll' }, base));
      for (const t of r.unreachable || []) if (!(r.scrolls && t.offscreen)) add(Object.assign({ check: 'covered', label: t.label, detail: 'centre ' + (t.offscreen ? 'clipped' : 'covered') + ' by ' + t.hit }, base));
      for (const t of r.below || []) add(Object.assign({ check: 'size', label: t.label, detail: t.kind + ' ' + t.w + ' x ' + t.h + ' px, goal ' + t.goal }, base));
      for (const t of r.textFit || []) {
        if (t.out > 1) add(Object.assign({ check: 'text-overflow', label: t.label, detail: 'text ' + t.out + ' px outside its control' }, base));
        if (t.broken && t.broken.length) add(Object.assign({ check: 'word-break', label: t.label, detail: 'word cut across lines: ' + t.broken.join(', ') }, base));
      }
      if (r.railScroll) add(Object.assign({ check: 'rail-scroll', label: 'rail', detail: 'rail scrolls horizontally (' + r.railScroll + ')' }, base));
      const seen = new Set();
      for (const t of (r.textTargets || []).concat(r.small || [])) { const label = t.label || t.text; if (seen.has(label)) continue; seen.add(label); add(Object.assign({ check: 'text', label, detail: t.fontPx + ' px, goal ' + GOALS.text }, base)); }
    }
  }
  const stale = exceptions.filter((x) => !x.used).map((x) => x.e);
  summary.strict = { enabled: STRICT, exceptionsFile: EXCEPTIONS_FILE, violations, excepted, staleExceptions: stale };
  return summary.strict;
}

// --- Synthesis.
function fmtBytes(b) { return typeof b === 'number' ? (b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' kB' : b + ' B') : '—'; }
function writeSummary(summary) {
  const L = [];
  L.push('# Touch interface — browser harness report' + (BASELINE ? ' (baseline, « avant »)' : ''));
  L.push('');
  L.push('**Measured on a development PC with a recent headless ' + summary.browser + ' (' + os.platform() + ' ' + os.release() + ', Node ' + process.version + '), not on the Surface RT (Chromium 106, Tegra 3, --disable-gpu).** Pixel sizes are comparable; timings and memory are not.');
  L.push('');
  L.push('- Date: ' + summary.date + (summary.commit ? '  \n- Commit: ' + summary.commit : '') + '  \n- Pages: ' + summary.realUrl + ' and ' + summary.simUrl + '  \n- Goals (design tokens, not WCAG): primary 64 px, secondary 48 px, jog cross 96 px, gaps 12 px, text ≥ 16 px.');
  L.push('- Harness steps failed: ' + failures.length + (failures.length ? '\n' + failures.map((f) => '  - ' + f).join('\n') : ''));
  L.push('');
  for (const m of summary.measurements) {
    L.push('## Tap targets — ' + m.variant + ' (`' + m.dir + '/`)');
    L.push('');
    L.push('| Screen | Scale | Targets | Under size goal | Text < 16 px (targets / all) | Target font px, rendered (min–median–max) | Gaps < 12 px | Covered | Truncated | Horizontal overflow |');
    L.push('| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |');
    for (const r of m.results) {
      if (r.error) { L.push('| ' + r.label + ' | — | error: ' + r.error + ' | | | | | | | |'); continue; }
      L.push('| ' + r.label + ' | ' + r.scale + ' | ' + r.targets + ' | ' + r.below.length + ' | ' + r.textTargets.length + ' / ' + r.small.length + ' | ' + r.fontStats.min + '–' + r.fontStats.median + '–' + r.fontStats.max + ' | ' + r.gaps.length + ' | ' + r.unreachable.length + ' | ' + r.truncated.length + ' | ' + (r.overflow.document ? 'YES (' + r.overflow.documentScrollWidth + ' > ' + r.overflow.clientWidth + ')' : 'no') + ' |');
    }
    L.push('');
    const below = [];
    for (const r of m.results) if (!r.error) for (const t of r.below) below.push('| ' + r.label + ' | ' + t.label.replace(/\|/g, '\\|') + ' | ' + t.kind + ' | ' + t.w + ' × ' + t.h + (m.dpr !== 1 ? ' (× ' + m.dpr + ')' : '') + ' | ' + t.goal + ' | ' + (t.gap === null ? '—' : t.gap) + ' | ' + (t.disabled ? 'disabled' : '') + ' |');
    if (below.length) { L.push('Targets under the size goal (rendered CSS px, width × height):'); L.push(''); L.push('| Screen | Label | Kind | Rendered | Goal | Gap to neighbour | |'); L.push('| --- | --- | --- | --- | ---: | ---: | --- |'); L.push(...below); L.push(''); }
    const small = [];
    for (const r of m.results) if (!r.error) for (const t of r.small) small.push('| ' + r.label + ' | ' + t.text.replace(/\|/g, '\\|') + ' | ' + t.fontPx + ' |');
    if (small.length) { L.push('Visible text under 16 px (rendered size, screen scale applied):'); L.push(''); L.push('| Screen | Text | Font px |'); L.push('| --- | --- | ---: |'); L.push(...small); L.push(''); }
    const gaps = [];
    for (const r of m.results) if (!r.error) for (const t of r.gaps) gaps.push('| ' + r.label + ' | ' + t.label.replace(/\|/g, '\\|') + ' | ' + t.gap + ' | ' + String(t.neighbour).replace(/\|/g, '\\|') + ' |');
    if (gaps.length) { L.push('Gaps under 12 px (touching segmented buttons included):'); L.push(''); L.push('| Screen | Label | Gap px | Neighbour |'); L.push('| --- | --- | ---: | --- |'); L.push(...gaps); L.push(''); }
    const unreachable = [];
    for (const r of m.results) if (!r.error) for (const t of r.unreachable) unreachable.push('| ' + r.label + ' | ' + t.label.replace(/\|/g, '\\|') + ' | ' + String(t.hit).replace(/\|/g, '\\|') + ' |');
    if (unreachable.length) { L.push('Targets whose centre is covered by another element:'); L.push(''); L.push('| Screen | Label | Element hit at centre |'); L.push('| --- | --- | --- |'); L.push(...unreachable); L.push(''); }
    const trunc = [];
    for (const r of m.results) if (!r.error) for (const t of r.truncated) trunc.push('| ' + r.label + ' | ' + t.text.replace(/\|/g, '\\|') + ' | ' + t.scrollWidth + ' > ' + t.clientWidth + ' | ' + t.textOverflow + ' |');
    if (trunc.length) { L.push('Text wider than its box (scrollWidth > clientWidth, overflow not visible):'); L.push(''); L.push('| Screen | Text | Widths | text-overflow |'); L.push('| --- | --- | --- | --- |'); L.push(...trunc); L.push(''); }
  }
  if (summary.startup) {
    const s = summary.startup;
    L.push('## Start-up of the real page (' + s.repeat + ' repetitions, medians)');
    L.push('');
    L.push('| | Cold (cache cleared) | Warm (second load) |');
    L.push('| --- | ---: | ---: |');
    const row = (k, f) => L.push('| ' + k + ' | ' + f(s.cold) + ' | ' + f(s.warm) + ' |');
    row('Shell ready (`cnc-loading` removed), ms', (x) => x.readyAtMs);
    row('DOMContentLoaded, ms', (x) => x.domContentLoadedMs);
    row('load event, ms', (x) => x.loadEventEndMs);
    row('Resources (scripts / styles / xhr)', (x) => x.resources + ' (' + x.scripts + ' / ' + x.styles + ' / ' + x.xhr + ')');
    row('Transferred / decoded', (x) => fmtBytes(x.transferBytes) + ' / ' + fmtBytes(x.decodedBytes));
    row('Served from cache', (x) => x.servedFromCache);
    row('JS heap after GC', (x) => fmtBytes(x.heapUsedAfterGcBytes));
    row('DOM nodes / listeners', (x) => x.domNodes + ' / ' + x.listeners);
    row('Script / style / layout / task time, ms', (x) => x.scriptMs + ' / ' + x.styleMs + ' / ' + x.layoutMs + ' / ' + x.taskMs);
    row('Page exceptions', (x) => x.pageErrors);
    L.push('');
    L.push('Note: the local fixture server sends no caching headers, so the warm run may re-download everything; against a real CNCjs server the static files carry ETag/Last-Modified. Details per run in `startup.json`.');
    L.push('');
  }
  if (summary.e2e.length) {
    L.push('## Simulation run (load → start → pause → resume → stop)');
    L.push('');
    for (const e of summary.e2e) {
      L.push('### ' + e.lang + ' — ' + (e.ok ? 'OK' : 'FAILED') + ' (' + e.ms + ' ms, `e2e-' + e.lang + '/`)');
      L.push('');
      L.push('| Step | Result | State word | Details |');
      L.push('| --- | --- | --- | --- |');
      for (const st of e.steps) {
        const details = st.error ? st.error : [st.file && 'file ' + st.file, st.percent && 'progress ' + st.percent, st.dialog && st.dialog.countdown && 'dialog "' + st.dialog.title + '", box ' + st.dialog.checkboxBox.w + '×' + st.dialog.checkboxBox.h + ' px, countdown "' + st.dialog.countdown + '" → "' + st.dialog.countdownLater + '"', st.feedback && 'feedback "' + st.feedback + '"', st.startDisabledAfterStop !== undefined && 'Démarrer disabled after stop: ' + st.startDisabledAfterStop].filter(Boolean).join('; ');
        L.push('| ' + st.step + ' | ' + (st.ok ? 'ok' : 'FAIL') + ' | ' + (st.stateWord || '') + ' | ' + details.replace(/\|/g, '\\|') + ' |');
      }
      L.push('');
    }
  }
  if (summary.strict) {
    const st = summary.strict, row = (v) => '| ' + [v.check, v.variant, v.screenLabel, v.label, v.detail].map((x) => String(x).replace(/\|/g, '\\|')).join(' | ') + ' |';
    L.push('## Strict layout check' + (st.enabled ? '' : ' (report only: run with --strict to fail on it)'));
    L.push('');
    L.push('Variants: 1366x768 and 1024x600, standard and large text, simulation FR/ES' + (summary.responsive ? ', responsive: ' + summary.responsive.viewports.join(', ') + ' (' + summary.responsive.hits + ' hit tests, `responsive-hits.json`)' : '') + '. Exceptions: `' + path.basename(st.exceptionsFile) + '`. Violations: ' + st.violations.length + ', excepted: ' + st.excepted.length + (st.staleExceptions.length ? ', unused exceptions: ' + st.staleExceptions.length : '') + '.');
    L.push('');
    if (st.violations.length) { L.push('| Check | Variant | Screen | Target | Detail |'); L.push('| --- | --- | --- | --- | --- |'); st.violations.forEach((v) => L.push(row(v))); L.push(''); }
    if (st.excepted.length) { L.push('Excepted (reason in the exceptions file):'); L.push(''); L.push('| Check | Variant | Screen | Target | Detail |'); L.push('| --- | --- | --- | --- | --- |'); st.excepted.forEach((v) => L.push(row(v))); L.push(''); }
    if (st.staleExceptions.length) { L.push('Unused exceptions (no longer needed?): ' + st.staleExceptions.map((e) => '`' + [e.check, e.variant, e.screen, e.label].filter(Boolean).join(' / ') + '`').join(', ')); L.push(''); }
  }
  L.push('## Limits');
  L.push('');
  L.push('- Headless Chrome on a PC: no touch digitiser, no Tegra 3 timings, GPU disabled like the kiosk but a different compositor; the Surface RT resolves the font stack to Bitstream Vera Sans, wider than Segoe UI.');
  L.push('- "Zoom 200 %" is emulated as a 683 × 384 CSS viewport at device scale factor 2 (what Ctrl + does at 1366 × 768); "font 200 %" uses `Page.setFontSizes` (default font size 32 px), which only moves text sized relative to the default.');
  L.push('- Responsive: browser zoom is emulated by CSS viewport and device scale factor (no real Ctrl +); a virtual keyboard by a shorter window (layout viewport). A keyboard that only shrinks `visualViewport` is followed by viewport-fit.js but not emulated here.');
  L.push('- The simulation page has no Réglages screen, so the language is set through its storage key (`cncjs-touch-language-v1`) and a reload, which is what the Réglages control does on the real page.');
  fs.writeFileSync(path.join(OUT, 'summary.md'), L.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let commit = null; try { commit = execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (_) { /* not a checkout */ }
  const summary = { label: BASELINE ? 'baseline' : 'run', date: new Date().toISOString(), commit, node: process.version, measurements: [], e2e: [] };
  let fixture = null, base = URL_BASE;
  if (!base) { fixture = await startFixture(ROOT_DIR ? ['--root', path.resolve(ROOT_DIR)] : []); base = fixture.base; log('fixture ' + base + (ROOT_DIR ? ' (pages from ' + ROOT_DIR + ')' : '')); }
  if (!base.endsWith('/')) base += '/';
  const realUrl = URL_BASE ? base : base + 'index.html', simUrl = base + 'simulation.html';
  summary.realUrl = realUrl; summary.simUrl = simUrl;
  const browser = await launchBrowser(1366, 768);
  summary.browser = browser.version; summary.userAgent = browser.userAgent;
  log('browser ' + browser.version + ' (' + browser.exe + ')');
  const cdp = browser.cdp;
  try {
    if (ONLY.includes('measure')) {
      for (const [w, h] of RESOLUTIONS) {
        await setViewport(cdp, w, h, 1);
        await navigate(cdp, realUrl); await waitSettled(cdp);
        await measureScreens(cdp, realUrl, w + 'x' + h, w + 'x' + h, 1, summary, true);
        try { await setDisplaySize(cdp, 'large'); await measureScreens(cdp, realUrl, w + 'x' + h + ' texte agrandi', w + 'x' + h + '-large', 1, summary, true); await setDisplaySize(cdp, 'standard'); }
        catch (e) { failures.push('large text ' + w + 'x' + h + ': ' + e.message); log('FAIL large text: ' + e.message); }
      }
      await setViewport(cdp, 683, 384, 2);
      await navigate(cdp, realUrl); await waitSettled(cdp);
      await measureScreens(cdp, realUrl, '1366x768 zoom 200 % (683x384 @2)', '1366x768-zoom200', 2, summary, true);
      await setViewport(cdp, 1366, 768, 1);
      try {
        await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
        await navigate(cdp, realUrl); await waitSettled(cdp);
        await measureScreens(cdp, realUrl, '1366x768 default font 200 % (Page.setFontSizes 32)', '1366x768-font200', 1, summary);
        await cdp.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 13 } });
      } catch (e) { summary.fontSizesUnsupported = e.message; log('font 200 % not available: ' + e.message); }
    }
    if (ONLY.includes('responsive')) await responsiveMeasure(cdp, realUrl, simUrl, summary);
    if (ONLY.includes('sim')) { await simMeasure(cdp, simUrl, summary); if (!URL_BASE) await alarmMeasure(cdp, summary); }
    // Pause / Arrêter over every overlay, degraded start-up, offline flag (browser-strip.cjs).
    if (ONLY.includes('strip') && !URL_BASE) { await setViewport(cdp, 1366, 768, 1); const list = await require('./browser-strip.cjs').run(cdp, module.exports, { simBase: base, out: path.join(OUT, 'strip'), log }); list.forEach((f) => failures.push(f)); summary.strip = list; }
    if (ONLY.includes('startup')) { await setViewport(cdp, 1366, 768, 1); await measureStartup(cdp, realUrl, summary); }
    if (ONLY.includes('e2e')) { await setViewport(cdp, 1366, 768, 1); for (const lang of ['fr', 'en', 'es']) await e2e(cdp, simUrl, lang, summary); await cdp.evaluate('localStorage.removeItem("cncjs-touch-language-v1");true').catch(() => {}); }
  } catch (e) { failures.push('harness: ' + (e.stack || e.message)); log('FAIL harness: ' + e.message); }
  let strictResult = null;
  try { strictResult = strictCheck(summary); } catch (e) { failures.push('strict check: ' + e.message); }
  if (strictResult) {
    log('strict layout check: ' + strictResult.violations.length + ' violation(s), ' + strictResult.excepted.length + ' excepted' + (STRICT ? '' : ' (report only)'));
    if (STRICT) strictResult.violations.forEach((v) => failures.push('layout ' + v.check + ': ' + v.variant + ' · ' + v.screenLabel + ' · ' + v.label + ' — ' + v.detail));
  }
  writeSummary(summary);
  cdp.close();
  if (!KEEP) { try { await cdp.send('Browser.close', {}, 3000); } catch (_) { /* closed */ } try { browser.child.kill(); } catch (_) { /* gone */ } }
  if (fixture) fixture.child.kill();
  await sleep(300);
  if (!KEEP) { try { fs.rmSync(browser.profile, { recursive: true, force: true }); } catch (_) { /* profile busy */ } }
  log('report: ' + path.join(OUT, 'summary.md'));
  if (failures.length) { console.error('FAILED steps:\n- ' + failures.join('\n- ')); process.exit(1); }
  console.log('browser-run: every step passed.');
}
// The measurement scripts (measure-*.cjs) reuse the DevTools client, the browser
// launcher and the fixture starter; run the harness only as a program.
if (require.main === module) main().catch((e) => { console.error('browser-run: ' + (e.stack || e.message)); process.exit(1); });
module.exports = { strictCheck, loadExceptions, GOALS, RESPONSIVE, MEASURE, CDP, findBrowser, launchBrowser, startFixture, navigate, waitReady, waitSettled, goScreen, setViewport, sleep, median, pageErrors };
