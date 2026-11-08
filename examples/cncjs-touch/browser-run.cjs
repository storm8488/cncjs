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
//   --only LIST      comma list among measure,responsive,sim,settings,startup,e2e,strip,v2,screens (default all;
//                    responsive = every screen at the CSS viewports of RESPONSIVE (landscape,
//                    portrait, intermediate sizes, large text, browser zoom 150 / 200 %, a
//                    virtual keyboard, the Surface Pro 3 kiosk at 1366 x 911 and the wide
//                    workstation body.perf-wide at 1366 x 911 and 1728 x 1152 with Préparer
//                    around an #op-card), then Pause / Arrêter and the primary commands hit-tested
//                    with a job running, paused, in alarm and under stacked overlays; sim = the
//                    simulation page with a job running, paused and in alarm, FR and ES,
//                    plus the real page with the controller at rest in alarm and the real
//                    page with a job running (the strip's « Fichier » column); strip =
//                    Pause / Arrêter over every overlay, browser-strip.cjs; v2 = Performance v2 in
//                    its own browser: 1366 x 911 and 1728 x 1152, real page through a harness fixture
//                    (idle, running, paused, alarm, stale, lost), simulation page (job, pause, alarm),
//                    Préparer comparison and jog panel, Fichiers, Journal opened from the curve,
//                    Réglages, the way out of v2, and no v2 request in Éco / RT 1366 x 768 / laser /
//                    software GPU; see v2Measure); settings = the three Réglages tabs walked top to
//                    bottom (FR/ES, standard/large text, dark/light, 1366 x 768 Éco laser, real page,
//                    v2 CNC 1366 x 911 in the v2 browser), scroll needed per control, Wi-Fi keyboard,
//                    first tap of the Tablette commands and the update install, refusals during a
//                    job, no system request outside Système; see settingsMeasure
//                    screens = every screen but Réglages in every machine state (hors ligne, repos, pilote pris,
//                    homing, palpage, travail, pause, alarme, périmé), v1 Éco 1366 x 768 laser and v2 1366 x 911 CNC,
//                    FR/ES, dark/light, standard/large text, one folder per screen, variant and state; see screensMeasure
//   --keep-browser   do not kill the browser at the end (debugging)
//   --strict         also fail (exit 1) on a layout regression in the variants the
//                    interface is made for (1366 x 768 and 1024 x 600, standard and
//                    large text, simulation FR/ES): a command whose centre is covered
//                    by another element, a screen that does not scroll shrunk below
//                    scale 1, a primary target under 64 px, a secondary under 48 px, a
//                    jog arrow under 96 px, text under 16 px, a control's text drawn
//                    outside its box or a word cut across two lines, the loaded file's
//                    name drawn on less than 120 px in the strip during a job, or a rail that
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
const ONLY = option('--only', 'measure,responsive,sim,settings,startup,e2e,strip,v2,screens').split(',');
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
async function launchBrowser(width, height, extraFlags) {
  const exe = findBrowser();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cnc-browser-run-'));
  const flags = ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    '--window-size=' + width + ',' + height, '--force-device-scale-factor=1', '--disable-extensions', '--disable-background-networking', '--disable-sync',
    '--disable-features=Translate,OptimizationHints,MediaRouter', '--lang=fr-FR'].concat(extraFlags || [], ['about:blank']);
  if (process.env.CI || process.getuid && process.getuid() === 0) flags.unshift('--no-sandbox');
  const child = spawn(exe, flags, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; if (stderr.length > 20000) stderr = stderr.slice(-10000); });
  const portFile = path.join(profile, 'DevToolsActivePort');
  const until = Date.now() + 30000;
  while (!fs.existsSync(portFile) || !fs.readFileSync(portFile, 'utf8').trim()) {
    // Edge on Windows with an update pending hands the session to a new process and exits 0:
    // keep waiting for its DevToolsActivePort (Browser.close at the end closes that process).
    if (child.exitCode !== null && child.exitCode !== 0) throw new Error('browser exited early: ' + stderr.slice(-800));
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
async function selectSettingsTab(cdp, name) {
  await cdp.evaluate('window.cncSystemMonitor&&window.cncSystemMonitor.select(' + JSON.stringify(name) + ');true'); await sleep(200);
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
    var offscreen = cx < 0 || cy < 0 || cx > vw || cy > vh, scroller = false;
    for (var n = el.parentElement; n && !offscreen && n !== document.body; n = n.parentElement) {
      var ov = getComputedStyle(n); if (ov.overflowX === 'visible' && ov.overflowY === 'visible') continue;
      var cr = n.getBoundingClientRect(); if (cx < cr.left || cx > cr.right || cy < cr.top || cy > cr.bottom) {
        offscreen = true;
        // Clipped by the v2 Journal list, which scrolls by design (kept at its newest end): a row is reached by
        // scrolling that list, like a row of a scrolling screen. Limited to that list so no other finding is hidden.
        scroller = n.id === 'v2k-list' && (ov.overflowY === 'auto' || ov.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 1 && cx >= cr.left && cx <= cr.right;
      }
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
      gap: isFinite(gap) ? Math.round(gap * 10) / 10 : null, neighbour: neighbour, gapBelowGoal: isFinite(gap) && gap * dpr < goals.gap - 0.5, overlaps: overlaps, disabled: disabled, reachable: reachable, offscreen: offscreen, scroller: scroller, hit: reachable ? null : (hit ? label(hit) : 'nothing') };
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
  // Suivi: texts cut by the box that holds them rather than by their own width (the caption of Arrêter, the
  // confidence band of v2, « A continuación »): their bottom or right edge past the nearest clipping ancestor.
  Array.prototype.forEach.call(document.querySelectorAll('#screen-home .home-stop .t-help, #home-v2-program, #home-v2-legend, #screen-home .home-v2-seq--next .home-v2-eyebrow'), function (el) {
    if (!visible(el)) return;
    var r = el.getBoundingClientRect();
    for (var a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      var acs = getComputedStyle(a); if (acs.overflowX === 'visible' && acs.overflowY === 'visible') continue;
      var b = a.getBoundingClientRect();
      // Every clipping ancestor counts (a band inside a clipped card): the first one that cuts is reported, once.
      if (r.bottom > b.bottom + 0.5 || r.right > b.right + 0.5) { truncated.push({ text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60), tag: el.tagName.toLowerCase(), id: el.id || null, scrollWidth: Math.round(Math.max(r.bottom - b.bottom, r.right - b.right)), clientWidth: 0, textOverflow: 'clipped by ' + (a.id ? '#' + a.id : '.' + String(a.className).split(' ')[0]) }); break; }
    }
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

// Real page with a job running (preview-server.cjs --replay): Pause, Arrêter and Pilote in the strip
// leave the loaded file's name readable in the « Fichier » column (bug hunt C-2), FR, EN and ES, on the
// RT (1366 x 768, Éco) and the Surface Pro 3 kiosk (1366 x 911 at 1.58, Performance). Measured as drawn
// inside the information zone, which clips what overflows it; enforced by --strict (check file-column).
const FILE_COLUMN_MIN = 120; // about 10 characters of the 20 px strip font
const FILE_COLUMN = '(function(){var f=document.getElementById("t-file"),z=f&&f.closest(".t-vitals");if(!f||!z)return null;var a=f.getBoundingClientRect(),v=z.getBoundingClientRect();' +
  'return {text:f.textContent,w:Math.max(0,Math.round(Math.min(a.right,v.right)-Math.max(a.left,v.left))),need:f.scrollWidth};})()';
async function jobFileMeasure(cdp, summary) {
  const fixture = await startFixture(['--replay']);
  summary.jobFile = summary.jobFile || [];
  try {
    for (const [w, h, dpr, perf] of [[1366, 768, 1, 'eco'], [1366, 911, 1.58, 'performance']]) {
      for (const lang of ['fr', 'en', 'es']) {
        const tag = 'job running ' + w + 'x' + h + '@' + dpr + ' ' + lang;
        try {
          await setViewport(cdp, w, h, dpr);
          await navigate(cdp, fixture.base + 'README.md');
          await cdp.evaluate('localStorage.setItem("cncjs-touch-language-v1",' + JSON.stringify(lang) + ');localStorage.setItem("cncjs-touch-performance-v1",' + JSON.stringify(JSON.stringify({ version: 1, profile: perf })) + ');true');
          await navigate(cdp, fixture.base + 'index.html?job-file=' + lang); await waitReady(cdp);
          await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="running"', 30000, 'running');
          await sleep(1500);
          const r = await cdp.evaluate(FILE_COLUMN);
          if (!r) throw new Error('#t-file not found');
          log(tag + ': strip file column « ' + r.text + ' » drawn on ' + r.w + ' px of ' + r.need);
          summary.jobFile.push({ variant: tag, text: r.text, w: r.w, need: r.need });
        } catch (e) { failures.push(tag + ': ' + e.message); log('FAIL ' + tag + ': ' + e.message); }
      }
    }
    await cdp.evaluate('localStorage.removeItem("cncjs-touch-language-v1");localStorage.removeItem("cncjs-touch-performance-v1");true').catch(() => {});
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

// --- Performance v2 (design/v2/REFLEXION.md § 5, 6, 8; lot L7). v2 opens only with four conditions: the
// preference, the Performance profile, a hardware GPU and the wide workstation. On this PC the browser renders
// WebGL in software (SwiftShader), so the GPU probe is answered « hardware » FROM OUTSIDE the page: an init
// script wraps CNCPreviewGL.probeGpu when preview-gl.js defines it (the real probe still runs, its other
// fields are kept), and the preference / profile / simulated machine kind are written by CDP in storage.
// Nothing in the shipped code is hooked or changed. The controller is a harness fixture: a local proxy in
// front of preview-server.cjs --replay answers /api/custom/health, /api/touch-job and /api/touch-events with
// a CNC (machine kind declared) whose phase the harness sets: idle (program loaded), running, paused, alarm
// during the job, stale (server alive, report > 2.5 s old) and lost (no stream). Every other request is passed
// through; every request that is not a GET under /api/ is recorded and refused (403): the safety pass compares
// them with the v1 page doing the same steps. Only the v2 browser gets the software-WebGL flags.
const V2_SIZES = [[1366, 911], [1728, 1152]];
const V2_FLAGS = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'];
const V2_FILE = 'Parcours_de_test_1.gcode';
const V2_FINGERPRINT = 'sha256:' + 'b7'.repeat(32);
// v2 resources: the deferred catalogue, the contract and every performance-*.js / .css module.
const V2_REQUEST = /\/(performance-[a-z0-9-]+\.(js|css)|i18n-messages-v2\.js)(\?|$)/;
const V2_GPU_TRAP = '(function(){var v;try{Object.defineProperty(window,"CNCPreviewGL",{configurable:true,get:function(){return v;},set:function(x){' +
  'if(x&&typeof x.probeGpu==="function"&&!x.__browserRun){var probe=x.probeGpu;x=Object.assign({},x,{__browserRun:true,probeGpu:function(){var r=probe.apply(this,arguments)||{};' +
  'window.__browserRunProbe=r;return Object.assign({},r,{hardware:true,reason:""});}});}v=x;}});}catch(e){}})();';
const V2_KEYS = { profile: 'cncjs-touch-performance-v1', v2: 'cncjs-touch-performance-ui-v2', kind: 'cncjs-touch-sim-kind-v1', lang: 'cncjs-touch-language-v1', display: 'cncjs-touch-display-v1' };
const V2_PROFILE = { version: 1, id: 'browser-run-cnc', label: 'CNC (banc browser-run)', kind: 'cnc', match: 'exact', signature: 'browser-run', portHint: '/dev/replay', laser: { mode: null, sMax: null, sMin: null }, coherent: true, issues: [], canChange: false, changeReason: '', capabilities: {} };
// The Surface RT's machine (screensMeasure): a laser, $32=1, S 0-1000.
const V2_LASER_PROFILE = Object.assign({}, V2_PROFILE, { id: 'browser-run-laser', label: 'Laser (banc browser-run)', kind: 'laser', laser: { mode: true, sMax: 1000, sMin: 0 } });

function startV2Fixture() {
  return startFixture(['--replay']).then((upstream) => new Promise((resolve, reject) => {
    const up = new URL(upstream.base);
    const replay = require('./measure-replay-fixture.cjs').create({ file: V2_FILE });
    const fx = { phase: 'idle', overrides: { feed: 100, rapid: 100, spindle: 100 }, commands: [], streams: new Set(), sequence: 0, epoch: 'browser-run-v2-' + Date.now().toString(36), frozen: null, staleSince: 0 };
    fx.controller = function () {
      const now = Date.now(), c = replay.packet().controllers[0];
      Object.assign(c, { port: '/dev/replay', controllerId: '/dev/replay', machineProfile: fx.profile || V2_PROFILE, fingerprint: V2_FINGERPRINT, name: V2_FILE, originalName: V2_FILE, revision: 1, overrides: Object.assign({}, fx.overrides), control: { owner: null, lastChange: null } });
      // At rest with a program loaded; screensMeasure adds three states built on it: another device pilots
      // (control.owner), a homing cycle (Home) and a touch-plate probe (probing), both stoppable like the server says.
      if (fx.phase === 'idle' || fx.phase === 'pilot' || fx.phase === 'homing' || fx.phase === 'probing') {
        Object.assign(c, { activeState: 'Idle', workflow: 'idle', feedrate: 0, spindleSpeed: 0, sent: 0, received: 0, canPause: false, canStop: false, canResume: false, canStart: true, startReason: '', canLoad: true, loadReason: '',
          canPreviewMotion: true, motionReason: '', canOverride: false, canRapidOverride: false, canUnlock: false, canHome: true, homeReason: '', canMacro: false });
        // $X out of alarm: the server's reason (job-service.js unlockReady), not the replay's « Travail en cours. ».
        c.unlockReason = fx.phase === 'probing' ? 'Palpage en cours.' : 'Le déverrouillage ($X) ne sert qu’en alarme.';
        // Like the server (job-service.js plateReady): a CNC at rest can probe its Z zero with the plate (a laser: unchanged).
        if ((fx.profile || V2_PROFILE).kind === 'cnc') Object.assign(c, { canZeroZ: true, zeroZReason: '' });
        if (fx.phase === 'pilot') c.control = { owner: { kind: 'touch', id: 'browser-run-other', label: 'Tablette atelier', present: true }, lastChange: null };
        if (fx.phase === 'homing') Object.assign(c, { activeState: 'Home', homing: true, canStop: true, canStart: false, startReason: 'Prise d’origine en cours.', canLoad: false, loadReason: 'Prise d’origine en cours.', canPreviewMotion: false, motionReason: 'Prise d’origine en cours.', canHome: false, homeReason: 'La prise d’origine exige une machine au repos ou en alarme.', canZeroZ: false, zeroZReason: 'Prise d’origine en cours.' });
        if (fx.phase === 'probing') Object.assign(c, { activeState: 'Run', probing: true, canStop: true, canStart: false, startReason: 'Palpage en cours.', canLoad: false, loadReason: 'Palpage en cours.', canPreviewMotion: false, motionReason: 'Palpage en cours.', canHome: false, homeReason: 'Palpage en cours.', canZeroZ: false, zeroZReason: 'Palpage en cours.' });
        return c;
      }
      if (fx.phase !== 'stale') fx.frozen = { coordinates: c.coordinates, received: c.received, sent: c.sent };
      const f = fx.frozen || { coordinates: c.coordinates, received: c.received, sent: c.sent };
      if (fx.phase === 'paused') return Object.assign(c, { activeState: 'Hold:0', workflow: 'paused', feedrate: 0, canPause: false, canResume: true, resumeReason: '', canStop: true, received: f.received, sent: f.sent, coordinates: f.coordinates });
      if (fx.phase === 'alarm') return Object.assign(c, { activeState: 'Alarm', workflow: 'running', alarmCode: 1, feedrate: 0, spindleSpeed: 0, canPause: false, canResume: false, canStop: true, canOverride: false, canRapidOverride: false, received: f.received, sent: f.sent, coordinates: f.coordinates });
      if (fx.phase === 'stale') return Object.assign(c, { fresh: false, statusAgeMs: now - fx.staleSince + 40, statusObservedAt: fx.staleSince - 40, received: f.received, sent: f.sent, coordinates: f.coordinates });
      return c; // running
    };
    fx.packet = function () { return { version: 1, epoch: fx.epoch, sequence: ++fx.sequence, sentAt: Date.now(), controllers: [fx.controller()] }; };
    fx.setPhase = function (phase) {
      if (phase === 'stale' && fx.phase !== 'stale') fx.staleSince = Date.now();
      fx.phase = phase;
      if (phase === 'lost') fx.streams.forEach((s) => s.destroy());
    };
    function stream(req, res) {
      if (fx.phase === 'lost') { res.statusCode = 503; return res.end(); }
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform' });
      const transportId = 'br-' + Math.random().toString(36).slice(2, 10), opened = Date.now();
      let timer = null, closed = false;
      const stop = () => { closed = true; clearTimeout(timer); fx.streams.delete(res.socket); };
      fx.streams.add(res.socket);
      const tick = () => {
        if (closed) return;
        if (fx.phase === 'lost') { res.destroy(); stop(); return; }
        if (Date.now() - opened >= 60000) { res.write(JSON.stringify({ rotate: true }) + '\n'); res.end(); stop(); return; }
        res.write(JSON.stringify(Object.assign(fx.packet(), { transportId })) + '\n');
        timer = setTimeout(tick, replay.PERIOD_MS);
      };
      req.on('close', stop); res.on('close', stop); tick();
    }
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname.indexOf('/api/') === 0 && req.method !== 'GET') {
        let body = ''; req.on('data', (d) => { body += d; if (body.length > 20000) body = body.slice(0, 20000); });
        req.on('end', () => {
          fx.commands.push({ at: Date.now(), method: req.method, path: url.pathname, body: body.slice(0, 400), phase: fx.phase });
          // Read-only motion preview of the real service stays answered by the upstream fixture.
          if (url.pathname === '/api/touch-motion/preview') return pass(req, res, body);
          res.statusCode = 403; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ message: 'Refusé par le banc browser-run (aucune commande machine).' }));
        });
        return;
      }
      if (url.pathname === '/api/custom/health') {
        if (fx.phase === 'lost') { res.statusCode = 503; return res.end(); }
        res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ loaded: true, version: '3.0.0', protocol: 1, transport: 'ndjson' }));
      }
      if (url.pathname === '/api/touch-job') {
        if (fx.phase === 'lost') { res.statusCode = 503; return res.end(); }
        res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(fx.packet()));
      }
      if (url.pathname === '/api/touch-events') return stream(req, res);
      if (url.pathname === '/visual-fixture.js') {
        // The fixture replaces XMLHttpRequest and throws on any URL it does not know, so the deferred
        // v2 catalogue (an XHR, tablet-profile.js) would never settle. The harness lets it reach the server.
        return http.get({ host: up.hostname, port: up.port, path: req.url }, (r) => {
          let text = ''; r.setEncoding('utf8'); r.on('data', (d) => { text += d; });
          r.on('end', () => { res.setHeader('Content-Type', 'text/javascript'); res.end(text.replace("if(xhr.url==='/api/touch-motion/preview'", "if(/^i18n-messages-v2\\.js/.test(xhr.url)||xhr.url==='/api/touch-motion/preview'")); });
        }).on('error', (e) => { res.statusCode = 502; res.end(String(e.message)); });
      }
      return pass(req, res);
    });
    function pass(req, res, body) {
      const headers = Object.assign({}, req.headers, { host: up.host });
      const p = http.request({ host: up.hostname, port: up.port, path: req.url, method: req.method, headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
      p.on('error', (e) => { res.statusCode = 502; res.end(String(e.message)); });
      if (body !== undefined) p.end(body); else req.pipe(p);
    }
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      fx.base = 'http://127.0.0.1:' + server.address().port + '/';
      fx.close = () => { try { fx.streams.forEach((s) => s.destroy()); server.close(); } catch (_) { /* closed */ } try { upstream.child.kill(); } catch (_) { /* gone */ } };
      resolve(fx);
    });
  }));
}

// Text drawn over other text (two text nodes of unrelated elements whose drawn boxes intersect), on the
// active screen, the strip, the rail and any open sheet; clipped by their ancestors like textFit above.
const V2_OVERLAP = String(function overlap() {
  var vw = window.innerWidth, vh = window.innerHeight, active = document.querySelector('main .screen.active'), items = [];
  function visible(el) {
    for (var n = el; n && n !== document.body; n = n.parentElement) { if (n.hidden || n.getAttribute('aria-hidden') === 'true') return false; var cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false; }
    return true;
  }
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (var node = walker.nextNode(); node; node = walker.nextNode()) {
    var p = node.parentElement; if (!node.data.trim() || !p || /^(SCRIPT|STYLE)$/.test(p.tagName) || p.closest('#cnc-boot,.ks-sr-only')) continue;
    var screen = p.closest('main .screen'); if (screen && screen !== active) continue;
    if (!visible(p)) continue;
    var clip = { left: 0, top: 0, right: vw, bottom: vh };
    for (var a = p; a && a !== document.body; a = a.parentElement) { var cs = getComputedStyle(a); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { var ar = a.getBoundingClientRect(); clip.left = Math.max(clip.left, ar.left); clip.top = Math.max(clip.top, ar.top); clip.right = Math.min(clip.right, ar.right); clip.bottom = Math.min(clip.bottom, ar.bottom); } }
    var range = document.createRange(); range.selectNodeContents(node);
    Array.prototype.forEach.call(range.getClientRects(), function (q) {
      // The content box of a line includes the font's internal leading: tight line-heights make the boxes of
      // two rows overlap with no glyph touching. Keep the middle 60 % of its height (digits, capitals, x-height).
      var inset = (q.bottom - q.top) * 0.2;
      var r = { left: Math.max(q.left, clip.left), top: Math.max(q.top + inset, clip.top), right: Math.min(q.right, clip.right), bottom: Math.min(q.bottom - inset, clip.bottom) };
      if (r.right - r.left > 1 && r.bottom - r.top > 1) items.push({ el: p, r: r, text: node.data.replace(/\s+/g, ' ').trim().slice(0, 40) });
    });
  }
  var out = [], seen = {};
  for (var i = 0; i < items.length; i++) for (var j = i + 1; j < items.length; j++) {
    var A = items[i], B = items[j]; if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
    var w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left), h = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
    // More than a sliver.
    if (w > 2 && h > 2) { var key = A.text + '|' + B.text; if (!seen[key]) { seen[key] = 1; out.push({ a: A.text, b: B.text, w: Math.round(w), h: Math.round(h) }); } }
  }
  return out.slice(0, 40);
});
// Pause / Reprendre / Arrêter of the strip: shown, inside the window, not inert, and the element under the
// centre and under four points 3 px inside the middle of each edge is the button itself. A disabled button
// takes no pointer events by design (ui-2027.css; the strip also blocks them while the state is lost): its
// points must then land in the strip, not in an overlay. Such a button is reported « blocked », not reachable.
const V2_HIT = `(function(ids){return ids.map(function(id){var b=document.getElementById(id);if(!b)return {id:id,missing:true};
  var r=b.getBoundingClientRect(),shown=!b.hidden&&!b.closest('[hidden]')&&r.width>0&&r.height>0,disabled=!!b.disabled||b.getAttribute('aria-disabled')==='true'||getComputedStyle(b).pointerEvents==='none',strip=document.getElementById('status-bar');
  function d(n){return n?(n.id?'#'+n.id:n.tagName.toLowerCase()+(typeof n.className==='string'&&n.className?'.'+n.className.split(' ')[0]:'')):'nothing';}
  var pts=[[r.left+r.width/2,r.top+r.height/2,'centre'],[r.left+3,r.top+r.height/2,'bord gauche'],[r.right-3,r.top+r.height/2,'bord droit'],[r.left+r.width/2,r.top+3,'bord haut'],[r.left+r.width/2,r.bottom-3,'bord bas']],bad=[];
  if(shown)pts.forEach(function(p){if(p[0]<0||p[1]<0||p[0]>window.innerWidth||p[1]>window.innerHeight){bad.push(p[2]+': hors fenêtre');return;}var h=document.elementFromPoint(p[0],p[1]);
    var ok=!!h&&(h===b||b.contains(h)||(disabled&&(h.contains(b)||(!!strip&&strip.contains(h)))));if(!ok)bad.push(p[2]+': '+d(h));});
  return {id:id,shown:shown,disabled:disabled,blocked:disabled&&!b.disabled,inert:b.closest('[inert]')?d(b.closest('[inert]')):null,bad:bad,rect:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]};});})`;
const V2_STATE = '(function(){var v=window.cncV2,s=v&&v.state?v.state():null;return {state:s,body:document.body.className,perfV2:document.body.classList.contains("perf-v2"),' +
  'mounts:Array.prototype.map.call(document.querySelectorAll("[data-v2-mount]"),function(n){return n.id+(n.hidden?":hidden":":shown");}),' +
  'requests:performance.getEntriesByType("resource").map(function(e){return e.name.replace(location.origin,"");}).filter(function(n){return ' + V2_REQUEST + '.test(n);}),' +
  'scripts:Array.prototype.map.call(document.querySelectorAll("script[src],link[rel=stylesheet][href]"),function(n){return (n.getAttribute("src")||n.getAttribute("href"));}).filter(function(n){return ' + V2_REQUEST + '.test("/"+n);})};})()';

async function v2Storage(cdp, base, opts) {
  await navigate(cdp, base + 'README.md');
  const o = opts || {};
  const set = (k, v) => v === null ? 'localStorage.removeItem(' + JSON.stringify(k) + ');' : 'localStorage.setItem(' + JSON.stringify(k) + ',' + JSON.stringify(JSON.stringify(v)) + ');';
  await cdp.evaluate(set(V2_KEYS.profile, { version: 1, profile: o.profile || 'performance' }) + set(V2_KEYS.v2, o.v2 === undefined ? { version: 1, enabled: true } : o.v2) +
    set(V2_KEYS.kind, o.kind === null ? null : { version: 1, kind: o.kind || 'cnc' }) + set(V2_KEYS.lang, null) + set(V2_KEYS.display, { size: 'standard' }) + 'true');
}
async function v2Open(cdp, url, expectV2) {
  await navigate(cdp, url); await waitReady(cdp);
  if (!expectV2) { await sleep(2500); return cdp.evaluate(V2_STATE); }
  try { await cdp.waitFor('(function(){var s=window.cncV2&&window.cncV2.state();return !!(s&&s.layout&&s.ready&&s.open&&document.body.classList.contains("perf-v2"));})()', 30000, 'v2 layout open'); }
  catch (e) { const st = await cdp.evaluate(V2_STATE).catch(() => null); throw new Error(e.message + ' — ' + JSON.stringify(st && st.state)); }
  await sleep(800);
  return cdp.evaluate(V2_STATE);
}
// One measured view of a v2 page, enforced like the other strict variants, plus three checks of its own
// (v2 measurements only): no horizontal overflow, no vertical overflow of a screen that does not scroll,
// no text drawn over other text.
async function v2Capture(cdp, ctx, name, label, state, results) {
  const dir = path.join(OUT, 'v2-' + ctx.replace(/[^A-Za-z0-9]+/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  try {
    if (name) await goScreen(cdp, name);
    await cdp.evaluate('new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r);});})');
    const data = await cdp.evaluate('(' + MEASURE + ')(' + JSON.stringify(GOALS) + ')');
    const overlaps = await cdp.evaluate('(' + V2_OVERLAP + ')()');
    const file = state + '-' + (name || 'current');
    fs.writeFileSync(path.join(dir, file + '.json'), JSON.stringify(Object.assign(data, { overlapsText: overlaps }), null, 1));
    await screenshot(cdp, path.join(dir, file + '.png'));
    const below = data.targets.filter((t) => t.belowGoal), unreachable = data.targets.filter((t) => !t.reachable);
    log('v2 ' + ctx + ' ' + label + ' · ' + state + ': ' + data.targets.length + ' targets, ' + below.length + ' under size goal, ' + data.smallText.length + ' text < 16 px, ' + unreachable.length + ' covered, ' + overlaps.length + ' text overlaps' + (data.horizontalOverflow.document ? ', HORIZONTAL OVERFLOW' : '') + (data.verticalOverflow.active ? ', vertical overflow' : ''));
    results.push({ screen: name || 'current', label: label + ' · ' + state, targets: data.targets.length, below, small: data.smallText, textTargets: data.targets.filter((t) => t.textBelowGoal), gaps: [], unreachable, truncated: data.truncated, overflow: data.horizontalOverflow, vertical: data.verticalOverflow, scale: data.screenScale, scrolls: data.scrolls, fontStats: {}, textFit: textFitOf(data), railScroll: data.railScroll, overlapsText: overlaps });
    return data;
  } catch (e) { failures.push('v2 ' + ctx + ' ' + label + ' ' + state + ': ' + e.message); log('FAIL v2 ' + ctx + ' ' + label + ' ' + state + ': ' + e.message); results.push({ screen: name || 'current', label: label + ' · ' + state, error: e.message }); return null; }
}
// Pause / Arrêter hit-tests, and their rectangles recorded to prove they never move.
async function v2Hits(cdp, ctx, where, ids, report, opts) {
  const list = await cdp.evaluate(V2_HIT + '(' + JSON.stringify(ids) + ')');
  for (const b of list) {
    const label = 'v2 ' + ctx + ' · ' + where + ' · ' + b.id;
    report.push(Object.assign({ ctx, where }, b));
    if (b.missing || !b.shown) { if (!(opts && opts.optional)) failures.push(label + ': not shown'); continue; }
    if (b.inert) failures.push(label + ': inert under ' + b.inert);
    if (b.bad.length) failures.push(label + ': ' + b.bad.join(', '));
    if (Math.min(b.rect[2], b.rect[3]) < GOALS.primary - 0.5) failures.push(label + ': ' + b.rect[2] + ' x ' + b.rect[3] + ' px, goal ' + GOALS.primary);
  }
  return list;
}
function v2Rects(ctx, report) {
  const by = {};
  report.filter((h) => h.ctx === ctx && h.shown).forEach((h) => { (by[h.id] = by[h.id] || new Set()).add(h.rect.join(',')); });
  return Object.fromEntries(Object.keys(by).map((id) => [id, Array.from(by[id])]));
}
function v2SameRects(ctx, report) {
  // One rectangle per strip command over every state, screen and sheet of the context: never moved.
  const by = v2Rects(ctx, report);
  Object.keys(by).forEach((id) => { if (by[id].length > 1) failures.push('v2 ' + ctx + ': #' + id + ' moved between states or sheets (' + by[id].join(' | ') + ')'); });
  return by;
}
async function v2Sheets(cdp, ctx, where, ids, report) {
  // The v2 sheets of Suivi, the origin help sheet of Préparer and the numeric pad stacked on it.
  for (const [screen, button] of [['home', 'home-v2-more-overrides'], ['home', 'home-v2-time-detail'], ['jog', 'ks-origin-info']]) {
    await goScreen(cdp, screen);
    const opened = await cdp.evaluate('(function(){var b=document.getElementById(' + JSON.stringify(button) + ');if(!b||b.hidden||b.disabled||!b.getClientRects().length)return false;b.click();return true;})()');
    if (!opened) { failures.push('v2 ' + ctx + ' ' + where + ': ' + button + ' not available to open its sheet'); continue; }
    await sleep(400);
    await v2Hits(cdp, ctx, where + ' + sheet ' + button, ids, report);
    if (button === 'ks-origin-info') {
      await cdp.evaluate('(function(){var i=document.getElementById("v2-run-input");if(!i){i=document.createElement("input");i.id="v2-run-input";document.getElementById("screen-jog").appendChild(i);}window.CNCNumeric.open(i,{label:"Test",unit:"mm",min:0,max:50});return true;})()');
      await sleep(300);
      await v2Hits(cdp, ctx, where + ' + sheet + numeric pad', ids, report);
      await cdp.evaluate('(function(){try{window.CNCNumeric.close();}catch(e){}return true;})()');
    }
    await cdp.evaluate('(function(){try{window.cncShell.closeSheet();}catch(e){}return true;})()'); await sleep(250);
  }
}
// The 3D scene of Suivi under v2: drag, wheel, « Examiner » and a tap on the canvas, then Pause / Arrêter hit-tested
// over it. The fixture's previews carry no 3D path, so when Suivi has no 3D canvas the harness opens one with the
// page's own modules (CNCToolpath3D builds a 80-segment raster, CNCPreviewGL.open draws it under the v2 gate) in a
// fixed box over the scene column, below the strip. Visual only: the proxy records anything sent meanwhile.
const V2_SCENE = '(function(){if(!window.CNCPreviewGL||!window.CNCToolpath3D)return null;var host=document.getElementById("br-v2-scene");if(!host){host=document.createElement("div");host.id="br-v2-scene";' +
  'host.style.cssText="position:fixed;left:104px;top:96px;width:780px;height:560px;z-index:3;background:#0b1118";document.body.appendChild(host);}' +
  'var T=CNCToolpath3D,b=T.createBuilder({bounds:[0,0,-3,90,90,5]}),l=0;for(var k=0;k<40;k++){b.move(0,k*2,-1,90,k*2,-1,1,++l);b.move(90,k*2,-1,90,k*2+2,-1,1,++l);}' +
  'window.__brView=CNCPreviewGL.open({file:"browser-run.nc",fingerprint:"sha256:browser-run",path3d:b.finish(l),zBounds:[-3,5]},{container:host,live:{progress:true,tool:true}});return true;})()';
const V2_CANVAS = '(function(){var c=Array.prototype.filter.call(document.querySelectorAll("#screen-home canvas, #br-v2-scene canvas"),function(x){var r=x.getBoundingClientRect();return r.width>100&&r.height>100;})[0];if(!c)return null;var r=c.getBoundingClientRect();' +
  'var e=Array.prototype.filter.call(document.querySelectorAll(".pgl-examine"),function(b){return b.getClientRects().length&&!b.hidden;})[0];return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,examine:!!e};})()';
async function v2Gestures(cdp, ctx, report, ids) {
  await goScreen(cdp, 'home');
  let scene = await cdp.evaluate(V2_CANVAS), own = false;
  if (!scene) { own = !!(await cdp.evaluate(V2_SCENE)); await sleep(800); scene = await cdp.evaluate(V2_CANVAS); }
  if (!scene) { failures.push('v2 ' + ctx + ': no 3D canvas on Suivi and none could be opened (gestures not exercised)'); return; }
  const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await mouse('mousePressed', scene.x, scene.y); for (let i = 1; i <= 6; i++) await mouse('mouseMoved', scene.x + i * 15, scene.y + i * 6); await mouse('mouseReleased', scene.x + 90, scene.y + 36);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: scene.x, y: scene.y, deltaX: 0, deltaY: -240 });
  try { // two-finger pinch
    await touch('touchStart', [{ x: scene.x - 40, y: scene.y, id: 1 }, { x: scene.x + 40, y: scene.y, id: 2 }]);
    for (let i = 1; i <= 5; i++) await touch('touchMove', [{ x: scene.x - 40 - i * 10, y: scene.y, id: 1 }, { x: scene.x + 40 + i * 10, y: scene.y, id: 2 }]);
    await touch('touchEnd', []);
  } catch (_) { /* touch emulation unavailable */ }
  if (scene.examine) {
    await cdp.evaluate('(function(){var e=Array.prototype.filter.call(document.querySelectorAll(".pgl-examine"),function(b){return b.getClientRects().length&&!b.hidden;})[0];e.click();return true;})()');
    await sleep(300); await mouse('mousePressed', scene.x, scene.y); await mouse('mouseReleased', scene.x, scene.y); await sleep(500);
    const panel = await cdp.evaluate('(function(){var p=Array.prototype.filter.call(document.querySelectorAll(".pgl-v2-inspection"),function(n){return !n.hidden&&n.getClientRects().length;})[0];return p?p.textContent.replace(/\\s+/g," ").trim().slice(0,200):null;})()');
    report.push({ ctx, inspection: panel });
    // Reported only: the harness's own box covers Suivi's view bar, which the measurer would count as covered.
    const loupe = []; await v2Capture(cdp, ctx, null, 'Suivi', '3d-loupe', loupe);
    if (v2Gestures.summary) v2Gestures.summary.measurements.push({ variant: 'v2 ' + ctx + ' (3D view opened by the harness, report only)', dir: 'v2-' + ctx.replace(/[^A-Za-z0-9]+/g, '-'), dpr: 1, results: loupe, strict: false });
  } else failures.push('v2 ' + ctx + ': 3D view open without the « Examiner » control under v2');
  if (ids) await v2Hits(cdp, ctx, '3D view + loupe', ids, report);
  report.push({ ctx, gestures: 'drag, wheel, pinch' + (scene.examine ? ', Examiner + tap' : ''), canvas: [Math.round(scene.w), Math.round(scene.h)], openedByHarness: own });
  log('v2 ' + ctx + ': 3D gestures (drag, wheel, pinch' + (scene.examine ? ', Examiner + tap' : '') + ')' + (own ? ' on a view opened by the harness' : ''));
  if (own) await cdp.evaluate('(function(){try{if(window.__brView)window.__brView.close("browser-run");}catch(e){}var h=document.getElementById("br-v2-scene");if(h)h.remove();return true;})()');
}

// The real page (index.html through the v2 fixture): idle, running, paused, alarm, stale, lost, then Journal
// from the curve, Réglages, and the way out of v2. `v1` runs the same steps with the preference stored off (v2 is the default): the
// baseline of the requests and of the strip rectangles.
async function v2RealPass(cdp, fx, w, h, summary, report, v1) {
  const ctx = (v1 ? 'v1 baseline ' : '') + 'real ' + w + 'x' + h, results = [], info = { ctx };
  const allIds = ['t-pause', 't-stop'];
  fx.setPhase('idle'); fx.overrides = { feed: 100, rapid: 100, spindle: 100 }; fx.commands.length = 0;
  pageErrors.length = 0;
  try {
    await setViewport(cdp, w, h, 1);
    await v2Storage(cdp, fx.base, { v2: v1 ? { version: 1, enabled: false } : { version: 1, enabled: true } });
    const opened = await v2Open(cdp, fx.base + 'index.html?v2=' + w + 'x' + h + (v1 ? '-v1' : ''), !v1);
    info.opened = opened; info.requestsAtOpen = opened.requests;
    if (v1 && (opened.perfV2 || opened.requests.length)) failures.push('v2 ' + ctx + ': v2 resources without the preference (' + JSON.stringify(opened.requests) + ')');
    if (!v1) {
      const missing = ['performance-v2-contract.js', 'performance-inspect.js', 'performance-sequences.js', 'performance-observation.js', 'performance-journal-context.js', 'performance-v2.css', 'i18n-messages-v2.js'].filter((f) => !opened.requests.some((r) => r.indexOf(f) >= 0));
      if (missing.length) failures.push('v2 ' + ctx + ': bootstrap modules not requested: ' + missing.join(', '));
      const dup = opened.requests.filter((r, i, a) => a.findIndex((x) => x.split('?')[0] === r.split('?')[0]) !== i);
      if (dup.length) failures.push('v2 ' + ctx + ': v2 modules requested twice: ' + dup.join(', '));
    }
    // Idle with a program loaded: every screen.
    for (const [name, label] of SCREENS) await v2Capture(cdp, ctx, name, label, 'idle', results);
    if (!v1) {
      // Each presenter looked for on its own screen (Préparer mounts its card only while shown).
      const shown = {};
      for (const [screen, key, sel] of [['home', 'band', '#home-v2-confidence'], ['home', 'sequence', '#home-v2-sequence'], ['files', 'files', '.lv2'], ['jog', 'prepare', '#pv2-summary'], ['settings', 'settings', '#ks-v2-card'], ['settings', 'quality', '#ks-v2-quality'], ['machine', 'machine', '#v2m-condition'], ['history', 'history', '#perf-v2-history']]) {
        await goScreen(cdp, screen);
        // Réglages: the v2 cards live on the « Machine et performances » tab.
        if (screen === 'settings') await selectSettingsTab(cdp, 'machine');
        shown[key] = await cdp.evaluate('(function(){var n=document.querySelector(' + JSON.stringify(sel) + ');return !!(n&&n.getClientRects().length&&!n.closest("[hidden]"));})()');
      }
      info.presenters = shown;
      // Suivi, Préparer and Réglages carry their v2 presenter at rest; Fichiers, Machine, Journal are reported.
      ['band', 'sequence', 'prepare', 'settings', 'quality'].forEach((k) => { if (!shown[k]) failures.push('v2 ' + ctx + ': v2 presenter « ' + k + ' » not shown at rest'); });
      // Préparer: the three comparison modes and the jog zone (scene unchanged, jog 24 px away, 96 px arrows).
      await goScreen(cdp, 'jog');
      const before = await cdp.evaluate('(function(){var c=document.querySelector("#op-card canvas")||document.getElementById("op-card");return c?JSON.stringify(c.getBoundingClientRect()):null;})()');
      for (const mode of ['hypothesis', 'current', 'both']) {
        await cdp.evaluate('(function(){var b=document.getElementById("pv2-mode-' + mode + '");if(b)b.click();return true;})()'); await sleep(300);
        const pressed = await cdp.evaluate('(function(){var b=document.getElementById("pv2-mode-' + mode + '");return b?b.getAttribute("aria-pressed"):null;})()');
        if (pressed !== 'true') failures.push('v2 ' + ctx + ': Préparer mode ' + mode + ' not pressed after a tap (' + pressed + ')');
      }
      await v2Capture(cdp, ctx, null, 'Préparer', 'idle-comparison', results);
      const openJog = await cdp.evaluate('(function(){var b=document.getElementById("pv2-jog-open");if(!b||!b.getClientRects().length)return false;b.click();return true;})()');
      if (!openJog) failures.push('v2 ' + ctx + ': « Déplacer l’outil… » not shown');
      else {
        await sleep(500);
        await v2Capture(cdp, ctx, null, 'Préparer', 'idle-jog-panel', results);
        const jog = await cdp.evaluate('(function(){var c=(document.querySelector("#op-card canvas")||document.getElementById("op-card"));if(!c)return null;c=c.getBoundingClientRect();var m=Infinity,min=Infinity,n=0;' +
          'Array.prototype.forEach.call(document.querySelectorAll("#screen-jog .jog"),function(b){var r=b.getBoundingClientRect();if(!r.width||!b.getClientRects().length)return;n++;min=Math.min(min,r.width,r.height);var dx=Math.max(c.left-r.right,r.left-c.right,0),dy=Math.max(c.top-r.bottom,r.top-c.bottom,0);m=Math.min(m,Math.max(dx,dy));});return {gap:m,min:min,count:n};})()');
        info.jog = jog;
        if (!jog || !jog.count) failures.push('v2 ' + ctx + ': jog panel opened without jog arrows');
        else {
          if (!(jog.gap >= 24)) failures.push('v2 ' + ctx + ': jog arrow ' + jog.gap + ' px from the Préparer scene, goal 24');
          if (jog.min < GOALS.jog - 0.5) failures.push('v2 ' + ctx + ': jog arrow ' + jog.min + ' px, goal ' + GOALS.jog);
        }
        await cdp.evaluate('(function(){var b=document.getElementById("pv2-jog-close");if(b)b.click();return true;})()'); await sleep(500);
        const after = await cdp.evaluate('(function(){var c=document.querySelector("#op-card canvas")||document.getElementById("op-card");return c?JSON.stringify(c.getBoundingClientRect()):null;})()');
        if (before !== after) failures.push('v2 ' + ctx + ': Préparer scene not restored to the same frame after the jog panel (' + before + ' → ' + after + ')');
      }
      // Réglages: the diagnostic on request.
      await goScreen(cdp, 'settings'); await selectSettingsTab(cdp, 'machine');
      await cdp.evaluate('(function(){var b=document.getElementById("ks-v2-diagnostic-run");if(b)b.click();return true;})()'); await sleep(400);
      await v2Capture(cdp, ctx, null, 'Réglages', 'idle-diagnostic', results);
      v2Gestures.results = results; await v2Gestures(cdp, ctx, report);
    }
    // Running, paused, alarm, stale, lost: the layout holds; Pause / Arrêter on every screen and sheet.
    // The Suivi grid: the scene column and image, and the places of Suivi's own commands (feed override row,
    // Pause and Arrêter of the Commandes zone, the v2 sheet buttons). Measured after two frames.
    const LAYOUT = 'new Promise(function(done){requestAnimationFrame(function(){requestAnimationFrame(function(){var r=function(n){n=typeof n==="string"?document.getElementById(n)||document.querySelector(n):n;if(!n||!n.getClientRects().length)return null;var b=n.getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)].join(",");};' +
      'done({perfV2:document.body.classList.contains("perf-v2"),wide:document.body.classList.contains("perf-wide"),zones:(document.querySelector(".job-dashboard")||{getAttribute:function(){return null;}}).getAttribute("data-v2"),' +
      'left:r("home-left"),image:r("home-job-image"),commands:{feed:r(document.querySelector("#home-overrides .t-override")),more:r("home-v2-more-overrides"),time:r("home-v2-time-detail"),pause:r("home-job-pause"),stop:r("home-job-stop")},scroll:document.querySelector("main").scrollTop});});});})';
    const layoutAt = async () => cdp.evaluate(LAYOUT);
    await goScreen(cdp, 'home');
    const idleLayout = await layoutAt();
    info.layout = { idle: idleLayout };
    // M3 in the browser: what the page fetched while the machine was not at rest (the stream, the polling and
    // the system monitor excluded). A program read, a module, a preview would show here. Entries are kept by
    // their start time, not by their index: the list is sorted by startTime and a long request (the stream)
    // enters it only when it ends, which shifts the indices and would put an earlier request in this phase.
    info.duringJob = [];
    const fetchedSince = async (phase, since) => {
      const list = await cdp.evaluate('performance.getEntriesByType("resource").filter(function(e){return e.startTime>=' + since + ';}).map(function(e){return e.name.replace(location.origin,"");})');
      const other = list.filter((n) => !/^\/api\/(touch-events|touch-job|custom\/health|touch-system)(\?|$)/.test(n));
      if (other.length) { info.duringJob.push({ phase, other }); if (!v1) failures.push('v2 ' + ctx + ': fetched while ' + phase + ': ' + other.slice(0, 6).join(', ')); }
    };
    for (const phase of ['running', 'paused', 'alarm', 'stale', 'lost']) {
      const phaseStart = await cdp.evaluate('performance.now()');
      fx.setPhase(phase);
      const ids = phase === 'paused' ? ['t-resume', 't-stop'] : phase === 'alarm' ? ['t-stop'] : allIds;
      if (phase === 'running') await cdp.waitFor('(function(){var b=document.getElementById("t-pause");return !!b&&!b.hidden;})()', 15000, 'Pause shown');
      else if (phase === 'paused') await cdp.waitFor('(function(){var b=document.getElementById("t-resume");return !!b&&!b.hidden;})()', 15000, 'Reprendre shown');
      else await sleep(phase === 'alarm' ? 1500 : 4000);
      if (phase === 'running' && !v1) {
        // A feed correction reported by Grbl: a marker of the curve, then the Journal opened from it.
        await sleep(2500); fx.overrides = { feed: 110, rapid: 100, spindle: 100 }; await sleep(2500);
      }
      await goScreen(cdp, 'home');
      const lay = await layoutAt(); info.layout[phase] = lay;
      if (!v1 && (lay.perfV2 !== idleLayout.perfV2 || lay.zones !== idleLayout.zones)) failures.push('v2 ' + ctx + ': Suivi grid changed in ' + phase + ' (' + JSON.stringify(idleLayout) + ' → ' + JSON.stringify(lay) + ')');
      if (!v1) {
        // A command of Suivi shown in both states at another place, or the scene resized: moved under the finger.
        const moved = Object.keys(lay.commands).filter((k) => lay.commands[k] && idleLayout.commands[k] && lay.commands[k] !== idleLayout.commands[k]);
        if (moved.length) failures.push('v2 ' + ctx + ': Suivi commands moved between rest and ' + phase + ': ' + moved.map((k) => k + ' ' + idleLayout.commands[k] + ' → ' + lay.commands[k]).join('; '));
        if (lay.image !== idleLayout.image) failures.push('v2 ' + ctx + ': Suivi scene resized between rest and ' + phase + ' (' + idleLayout.image + ' → ' + lay.image + ')');
      }
      await v2Capture(cdp, ctx, 'home', 'Suivi', phase, results);
      if (!v1) {
        const band = await cdp.evaluate('(function(){var t=function(id){var n=document.getElementById(id);return n?n.textContent:null;};return {age:t("home-v2-age"),ageState:(document.getElementById("home-v2-age")||{getAttribute:function(){return null;}}).getAttribute("data-state"),position:t("home-v2-position"),program:t("home-v2-program"),frame:t("home-v2-frame"),geometry:t("home-v2-geometry"),now:t("home-v2-now"),next:t("home-v2-next"),curve:t("home-gauge-curve-title"),events:t("home-v2-curve-events")};})()');
        info['band-' + phase] = band;
        // A lost stream ends as « unknown » once the page drops the machine (no report at all): stale or unknown.
        const expect = { running: ['fresh'], paused: ['fresh'], alarm: ['fresh'], stale: ['stale'], lost: ['stale', 'unknown'] }[phase];
        if (expect.indexOf(band.ageState) < 0) failures.push('v2 ' + ctx + ': confidence band says « ' + band.age + ' » (' + band.ageState + ') in ' + phase + ', expected ' + expect);
        if ((phase === 'stale' && !/Figée/.test(band.position || '')) || (phase === 'lost' && !/Figée|Inconnue/.test(band.position || ''))) failures.push('v2 ' + ctx + ': reported position not frozen in ' + phase + ' (« ' + band.position + ' »)');
      }
      for (const [name] of SCREENS) { await goScreen(cdp, name); await v2Hits(cdp, ctx, phase + ' ' + name, ids, report); }
      await fetchedSince(phase, phaseStart);
      // Under a sheet, strip-guard.js keeps Pause and Arrêter usable and makes the rest inert, Reprendre
      // included (v1 design, U5): in a pause, Arrêter is required there and Reprendre is only reported.
      if (!v1 && (phase === 'running' || phase === 'paused' || phase === 'alarm')) await v2Sheets(cdp, ctx, phase, phase === 'paused' ? ['t-stop'] : ids, report);
      if (!v1 && phase === 'running') {
        // Journal from the curve: a real tap at the drawn marker, then « Retour à Suivi ».
        await goScreen(cdp, 'home');
        const mark = await cdp.evaluate('(function(){var p=document.getElementById("home-v2-curve-marks"),s=p&&p.ownerSVGElement;if(!p||!s)return null;var m=/M([0-9.]+) 0V70/.exec(p.getAttribute("d")||"");if(!m)return {d:p.getAttribute("d")};var r=s.getBoundingClientRect();return {x:r.left+Number(m[1])/300*r.width,y:r.top+r.height/2};})()');
        info.curveMark = mark;
        if (!mark || mark.x === undefined) failures.push('v2 ' + ctx + ': no marker drawn on the curve after a reported feed correction (' + JSON.stringify(mark) + ')');
        else {
          await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mark.x, y: mark.y, button: 'left', buttons: 1, clickCount: 1 });
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mark.x, y: mark.y, button: 'left', buttons: 0, clickCount: 1 });
          try {
            await cdp.waitFor('(function(){var s=document.getElementById("screen-history");return !!(s&&s.classList.contains("active"));})()', 5000, 'Journal opened from the curve');
            await sleep(600);
            info.journal = await cdp.evaluate('(function(){var c=document.getElementById("v2k-context");return {context:c?c.textContent:null,back:!!document.getElementById("v2k-back")};})()');
            await v2Capture(cdp, ctx, null, 'Journal', 'from-curve', results);
            await v2Hits(cdp, ctx, 'running Journal from the curve', ids, report);
            await cdp.evaluate('(function(){var b=document.getElementById("v2k-back");if(b)b.click();return true;})()');
            await cdp.waitFor('(function(){var s=document.getElementById("screen-home");return !!(s&&s.classList.contains("active"));})()', 5000, 'Suivi restored by « Retour à Suivi »');
          } catch (e) { failures.push('v2 ' + ctx + ': ' + e.message); }
        }
        v2Gestures.results = results; await v2Gestures(cdp, ctx + ' running', report, ids);
      }
    }
    v2SameRects(ctx, report);
    // Back to rest, then the way out of v2: preference off (no reload, layout kept, message), next page v1.
    fx.setPhase('idle'); await sleep(4000);
    if (!v1) {
      await goScreen(cdp, 'settings'); await selectSettingsTab(cdp, 'machine');
      const off = await cdp.evaluate('(async function(){var b=document.getElementById("ks-v2-toggle");if(!b)return null;window.__noReload=1;b.click();await new Promise(function(r){setTimeout(r,600);});var s=window.cncV2.state();' +
        'return {pressed:b.getAttribute("aria-pressed"),status:(document.getElementById("ks-v2-status")||{}).textContent,state:s,perfV2:document.body.classList.contains("perf-v2"),kept:window.__noReload===1,strip:(function(){var n=document.getElementById("t-v2-pending");return n?{text:n.textContent,hidden:!!n.hidden,shown:!!n.getClientRects().length}:null;})()};})()');
      info.exit = off;
      if (!off) failures.push('v2 ' + ctx + ': Réglages has no « Interface Performance v2 » toggle');
      else {
        if (!off.kept) failures.push('v2 ' + ctx + ': the page reloaded when v2 was turned off');
        if (off.state.open) failures.push('v2 ' + ctx + ': v2 resources still open after the preference was turned off');
        if (!off.perfV2) failures.push('v2 ' + ctx + ': layout changed at once when v2 was turned off (expected: kept until the next session)');
        if (!/prochaine session/.test(off.status || '')) failures.push('v2 ' + ctx + ': no « prochaine session » message after turning v2 off (« ' + off.status + ' »)');
      }
      await v2Capture(cdp, ctx, null, 'Réglages', 'v2-turned-off', results);
      const next = await v2Open(cdp, fx.base + 'index.html?v2-off=' + w + 'x' + h, false);
      info.nextSession = next;
      if (next.perfV2 || next.requests.length || next.scripts.length) failures.push('v2 ' + ctx + ': next session after turning v2 off still v2 (' + JSON.stringify({ perfV2: next.perfV2, requests: next.requests }) + ')');
    }
    info.commands = fx.commands.slice();
    info.pageErrors = pageErrors.slice();
    if (pageErrors.length) failures.push('v2 ' + ctx + ': page exceptions: ' + pageErrors.slice(0, 3).join(' | ').slice(0, 600));
  } catch (e) { failures.push('v2 ' + ctx + ': ' + e.message); log('FAIL v2 ' + ctx + ': ' + e.message); }
  summary.measurements.push({ variant: 'v2 ' + ctx, dir: 'v2-' + ctx.replace(/[^A-Za-z0-9]+/g, '-'), dpr: 1, results, strict: !v1, v2: !v1 });
  return info;
}

// Éco chosen during a job on a v2 page (REFLEXION § 6): the v2 resources stop at once (gate closed, no new v2
// request), the grid and Pause / Arrêter stay where they are while the job runs, the old layout returns at rest.
async function v2EcoPass(cdp, fx, w, h, report) {
  const ctx = 'eco during job ' + w + 'x' + h, info = { ctx };
  fx.setPhase('idle'); pageErrors.length = 0;
  try {
    await setViewport(cdp, w, h, 1);
    await v2Storage(cdp, fx.base, {});
    await v2Open(cdp, fx.base + 'index.html?v2-eco=' + w + 'x' + h, true);
    await goScreen(cdp, 'home');
    fx.setPhase('running');
    await cdp.waitFor('(function(){var b=document.getElementById("t-pause");return !!b&&!b.hidden;})()', 15000, 'Pause shown');
    await sleep(800);
    const before = await cdp.evaluate('(function(){var r=function(id){var n=document.getElementById(id);if(!n)return null;var b=n.getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)].join(",");};return {pause:r("t-pause"),stop:r("t-stop"),image:r("home-job-image"),feed:r("home-v2-more-overrides"),requests:performance.getEntriesByType("resource").length};})()');
    const eco = await cdp.evaluate('(async function(){window.cncProfile.setPerformance("eco");var gateAtOnce=window.cncV2.gate();await new Promise(function(r){setTimeout(r,1500);});var r=function(id){var n=document.getElementById(id);if(!n)return null;var b=n.getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)].join(",");};' +
      'return {gateAtOnce:gateAtOnce,state:window.cncV2.state(),perfV2:document.body.classList.contains("perf-v2"),pause:r("t-pause"),stop:r("t-stop"),image:r("home-job-image"),feed:r("home-v2-more-overrides"),' +
      'newV2:performance.getEntriesByType("resource").slice(' + before.requests + ').map(function(e){return e.name;}).filter(function(n){return ' + V2_REQUEST + '.test(n);})};})()');
    info.before = before; info.eco = eco;
    if (eco.gateAtOnce) failures.push('v2 ' + ctx + ': v2 gate still open right after Éco was chosen');
    if (!eco.perfV2 || !eco.state.holdLayout) failures.push('v2 ' + ctx + ': layout not held while the job runs after Éco (' + JSON.stringify({ perfV2: eco.perfV2, hold: eco.state.holdLayout }) + ')');
    ['pause', 'stop', 'image', 'feed'].forEach((k) => { if (before[k] !== eco[k]) failures.push('v2 ' + ctx + ': ' + k + ' moved when Éco was chosen during the job (' + before[k] + ' → ' + eco[k] + ')'); });
    if (eco.newV2.length) failures.push('v2 ' + ctx + ': v2 requests after Éco: ' + eco.newV2.join(', '));
    for (const [name] of SCREENS) { await goScreen(cdp, name); await v2Hits(cdp, ctx, 'Éco, job running, ' + name, ['t-pause', 't-stop'], report); }
    fx.setPhase('idle'); await sleep(3500);
    const rest = await cdp.evaluate('({perfV2:document.body.classList.contains("perf-v2"),state:window.cncV2.state(),wide:document.body.classList.contains("perf-wide")})');
    info.rest = rest;
    if (rest.perfV2) failures.push('v2 ' + ctx + ': v2 layout kept at rest after Éco (expected the old layout at a known rest)');
    if (pageErrors.length) failures.push('v2 ' + ctx + ': page exceptions: ' + pageErrors.slice(0, 3).join(' | ').slice(0, 600));
    log('v2 ' + ctx + ': gate ' + (eco.gateAtOnce ? 'OPEN' : 'closed') + ' at once, layout ' + (eco.perfV2 ? 'held' : 'CHANGED') + ' during the job, ' + (rest.perfV2 ? 'STILL v2' : 'v1') + ' at rest');
  } catch (e) { failures.push('v2 ' + ctx + ': ' + e.message); log('FAIL v2 ' + ctx + ': ' + e.message); }
  return info;
}

// The simulation page under v2: the virtual job (60 s), started with its confirmation, paused, in alarm.
async function v2SimPass(cdp, fx, w, h, summary, report) {
  const ctx = 'sim ' + w + 'x' + h, results = [], info = { ctx };
  pageErrors.length = 0;
  try {
    await setViewport(cdp, w, h, 1);
    await v2Storage(cdp, fx.base, {});
    info.opened = await v2Open(cdp, fx.base + 'simulation.html?v2=' + w + 'x' + h, true);
    await goScreen(cdp, 'files');
    await cdp.evaluate('document.querySelector(".library-file").click();true');
    await cdp.waitFor('(function(){var b=document.getElementById("job-load");return !!b&&!b.disabled;})()', 15000, 'load enabled');
    await v2Capture(cdp, ctx, null, 'Fichiers', 'selected', results);
    await cdp.evaluate('document.getElementById("job-load").click();true');
    await cdp.waitFor('(function(){var m=window.cncState.get().machine;return !!(m&&m.name);})()', 15000, 'loaded');
    await v2Capture(cdp, ctx, 'home', 'Suivi', 'loaded', results);
    await v2Capture(cdp, ctx, 'jog', 'Préparer', 'loaded', results);
    await goScreen(cdp, 'home');
    await cdp.evaluate('document.getElementById("home-job-start").click();true');
    await cdp.waitFor('!document.getElementById("job-dialog").hidden', 15000, 'dialog');
    await cdp.evaluate('(function(){var c=document.getElementById("job-check");c.checked=true;c.dispatchEvent(new Event("change",{bubbles:true}));document.getElementById("job-confirm").click();return true;})()');
    await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="running"', 15000, 'running');
    await sleep(1500);
    await v2Capture(cdp, ctx, 'home', 'Suivi', 'running', results);
    for (const [name] of SCREENS) { await goScreen(cdp, name); await v2Hits(cdp, ctx, 'running ' + name, ['t-pause', 't-stop'], report); }
    await v2Sheets(cdp, ctx, 'running', ['t-pause', 't-stop'], report);
    v2Gestures.results = results; await v2Gestures(cdp, ctx, report, ['t-pause', 't-stop']);
    await cdp.evaluate('document.getElementById("t-pause").click();true');
    await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="paused"', 15000, 'paused');
    await sleep(1200);
    await v2Capture(cdp, ctx, 'home', 'Suivi', 'paused', results);
    for (const [name] of SCREENS) { await goScreen(cdp, name); await v2Hits(cdp, ctx, 'paused ' + name, ['t-resume', 't-stop'], report); }
    await goScreen(cdp, 'machine');
    if (await cdp.evaluate('(function(){var b=document.getElementById("sim-trigger-alarm");if(!b||b.disabled)return false;b.click();return true;})()')) {
      await cdp.waitFor('/^alarm/i.test(((window.cncState.get().machine||{}).activeState)||"")', 10000, 'alarm');
      await sleep(1200);
      await v2Capture(cdp, ctx, 'home', 'Suivi', 'alarm', results);
      await v2Capture(cdp, ctx, 'machine', 'Machine', 'alarm', results);
      for (const [name] of SCREENS) { await goScreen(cdp, name); await v2Hits(cdp, ctx, 'alarm ' + name, ['t-stop'], report); }
      await v2Sheets(cdp, ctx, 'alarm', ['t-stop'], report);
      await cdp.evaluate('(function(){var b=document.getElementById("sim-clear-alarm");if(b&&!b.disabled)b.click();return true;})()');
    } else failures.push('v2 ' + ctx + ': alarm button unavailable');
    v2SameRects(ctx, report);
    const held = await cdp.evaluate('({perfV2:document.body.classList.contains("perf-v2"),state:window.cncV2.state()})');
    info.held = held;
    if (!held.perfV2) failures.push('v2 ' + ctx + ': perf-v2 lost during the job');
    await cdp.evaluate('document.getElementById("t-stop").click();true');
    await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="idle"', 15000, 'idle after stop');
    info.pageErrors = pageErrors.slice();
    if (pageErrors.length) failures.push('v2 ' + ctx + ': page exceptions: ' + pageErrors.slice(0, 3).join(' | ').slice(0, 600));
  } catch (e) { failures.push('v2 ' + ctx + ': ' + e.message); log('FAIL v2 ' + ctx + ': ' + e.message); }
  summary.measurements.push({ variant: 'v2 ' + ctx, dir: 'v2-' + ctx.replace(/[^A-Za-z0-9]+/g, '-'), dpr: 1, results, strict: true, v2: true });
  return info;
}

// No v2 request where v2 must not open, the preference being ON: Éco and the RT size 1366 x 768 (real and
// simulation pages), Performance at 1366 x 768 (not the wide workstation), the laser kind, the software GPU
// (no trap). Éco and RT 1366 x 768 are also compared with the same page without the preference: same body
// classes, same element ids, same requested files.
const V2_DOM = '(function(){return {body:document.body.className.split(/\\s+/).sort().join(" "),ids:Array.prototype.map.call(document.querySelectorAll("[id]"),function(n){return n.id;}).sort().join(","),' +
  'files:performance.getEntriesByType("resource").map(function(e){return e.name.replace(location.origin,"").split("?")[0];}).filter(function(n){return !/\\/api\\//.test(n);}).sort().filter(function(n,i,a){return a.indexOf(n)===i;}).join(",")};})()';
async function v2Closed(cdp, fx, summary) {
  const out = [];
  const cases = [
    ['Éco 1366x768 real', 1366, 768, 'index.html', { profile: 'eco' }, true], ['Éco 1366x768 sim', 1366, 768, 'simulation.html', { profile: 'eco' }, true],
    ['Éco 1366x911 real', 1366, 911, 'index.html', { profile: 'eco' }, true],
    ['Performance 1366x768 real (not wide)', 1366, 768, 'index.html', {}, false], ['Performance 1366x768 sim (not wide)', 1366, 768, 'simulation.html', {}, false],
    ['laser 1366x911 sim', 1366, 911, 'simulation.html', { kind: 'laser' }, false]
  ];
  for (const [label, w, h, page, opts, compare] of cases) {
    try {
      fx.setPhase('idle');
      await setViewport(cdp, w, h, 1);
      await v2Storage(cdp, fx.base, opts);
      const st = await v2Open(cdp, fx.base + page + '?v2-closed=' + encodeURIComponent(label), false);
      for (const [name] of SCREENS) await goScreen(cdp, name);
      const after = await cdp.evaluate(V2_STATE);
      const dom = compare ? await cdp.evaluate(V2_DOM) : null;
      let same = null;
      if (compare) {
        await v2Storage(cdp, fx.base, Object.assign({}, opts, { v2: { version: 1, enabled: false } }));
        await v2Open(cdp, fx.base + page + '?v2-closed-ref=' + encodeURIComponent(label), false);
        for (const [name] of SCREENS) await goScreen(cdp, name);
        const ref = await cdp.evaluate(V2_DOM);
        same = { body: dom.body === ref.body, ids: dom.ids === ref.ids, files: dom.files === ref.files };
        if (!same.body || !same.ids || !same.files) {
          const diff = (a, b) => a.split(',').filter((x) => b.split(',').indexOf(x) < 0);
          failures.push('v2 closed ' + label + ': page differs from the same page without the preference (' + JSON.stringify({ body: same.body ? null : [dom.body, ref.body], ids: same.ids ? null : { extra: diff(dom.ids, ref.ids), missing: diff(ref.ids, dom.ids) }, files: same.files ? null : { extra: diff(dom.files, ref.files), missing: diff(ref.files, dom.files) } }).slice(0, 700) + ')');
        }
      }
      const bad = after.perfV2 || after.requests.length || after.scripts.length || (after.state && after.state.open) || after.mounts.length;
      if (bad) failures.push('v2 closed ' + label + ': v2 requested or open (' + JSON.stringify({ perfV2: after.perfV2, requests: after.requests, mounts: after.mounts, open: after.state && after.state.open }) + ')');
      out.push({ label, requests: after.requests, perfV2: after.perfV2, mounts: after.mounts, reason: after.state && after.state.reason, eligible: after.state && after.state.eligible, sameAsWithoutPreference: same });
      log('v2 closed ' + label + ': ' + (bad ? 'V2 PRESENT' : 'no v2 request, no perf-v2') + (same ? ', same DOM/files as without the preference: ' + (same.body && same.ids && same.files) : ''));
    } catch (e) { failures.push('v2 closed ' + label + ': ' + e.message); log('FAIL v2 closed ' + label + ': ' + e.message); }
  }
  return out;
}

async function v2Measure(summary) {
  const fx = await startV2Fixture();
  const browser = await launchBrowser(1366, 911, V2_FLAGS), cdp = browser.cdp;
  v2Gestures.summary = summary;
  const report = [], v2 = { fixture: 'browser-run v2 proxy over preview-server.cjs --replay', flags: V2_FLAGS, passes: [], hits: report };
  try {
    const before = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: V2_GPU_TRAP });
    v2.trap = !!before.identifier;
    // The pages of the software GPU first (no trap): v2 must stay closed on a software renderer.
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: before.identifier });
    try {
      await setViewport(cdp, 1366, 911, 1); await v2Storage(cdp, fx.base, {});
      const soft = await v2Open(cdp, fx.base + 'simulation.html?v2-software', false);
      v2.software = { perfV2: soft.perfV2, requests: soft.requests, reason: soft.state && soft.state.reason, eligible: soft.state && soft.state.eligible };
      if (soft.perfV2 || soft.requests.length) failures.push('v2 software GPU 1366x911: v2 opened on a software renderer (' + JSON.stringify(v2.software) + ')');
      log('v2 software GPU 1366x911 sim: ' + (soft.perfV2 ? 'V2 OPEN' : 'closed') + ', eligible ' + v2.software.eligible);
    } catch (e) { failures.push('v2 software GPU: ' + e.message); }
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: V2_GPU_TRAP });
    v2.closed = await v2Closed(cdp, fx, summary);
    for (const [w, h] of V2_SIZES) {
      v2.passes.push(await v2RealPass(cdp, fx, w, h, summary, report, true));
      v2.passes.push(await v2RealPass(cdp, fx, w, h, summary, report, false));
      v2.passes.push(await v2SimPass(cdp, fx, w, h, summary, report));
      v2.passes.push(await v2EcoPass(cdp, fx, w, h, report));
      if (w === 1366 && ONLY.includes('settings')) v2.settings = await v2SettingsPass(cdp, fx, summary);
      // Requests the v2 page sent that the v1 page did not, the same steps being run (path + action).
      const key = (c) => c.method + ' ' + c.path + ' ' + ((/"action"\s*:\s*"([^"]+)"/.exec(c.body) || [])[1] || '');
      const base = v2.passes[v2.passes.length - 4], real = v2.passes[v2.passes.length - 3];
      // POST /api/signin is the session renewal of app.js (v1, refused by the fixture), not a machine request.
      const extra = (real.commands || []).filter((c) => c.path !== '/api/signin' && !(base.commands || []).some((b) => key(b) === key(c)));
      real.extraCommandsVersusV1 = extra;
      if (extra.length) failures.push('v2 real ' + w + 'x' + h + ': requests sent by the v2 page and not by the v1 page: ' + extra.map(key).join(', '));
      log('v2 real ' + w + 'x' + h + ': ' + (real.commands || []).length + ' non-GET API request(s), ' + extra.length + ' not sent by v1 (' + (real.commands || []).map(key).join(', ') + ')');
      // Strip commands at the same place with and without v2.
      const r1 = v2Rects('real ' + w + 'x' + h, report), r0 = v2Rects('v1 baseline real ' + w + 'x' + h, report);
      Object.keys(r1).forEach((id) => { if (r0[id] && r0[id].join() !== r1[id].join()) failures.push('v2 real ' + w + 'x' + h + ': #' + id + ' at ' + r1[id] + ' under v2, ' + r0[id] + ' under v1'); });
    }
  } catch (e) { failures.push('v2: ' + (e.stack || e.message)); log('FAIL v2: ' + e.message); }
  finally {
    cdp.close();
    try { await cdp.send('Browser.close', {}, 3000); } catch (_) { /* closed */ }
    try { browser.child.kill(); } catch (_) { /* gone */ }
    fx.close();
    await sleep(300);
    try { fs.rmSync(browser.profile, { recursive: true, force: true }); } catch (_) { /* busy */ }
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'v2.json'), JSON.stringify(v2, null, 1));
  summary.v2 = { passes: v2.passes.map((p) => ({ ctx: p.ctx, commands: (p.commands || []).length, pageErrors: (p.pageErrors || []).length })), closed: v2.closed, software: v2.software, hits: report.length };
}

// --- Every screen but Réglages in every machine state (design/PROMPT-ECRANS-MULTIAGENT.md, phase 0): the real page
// through the v2 fixture (startV2Fixture), whose controller the harness sets, on the Surface RT (v1 Éco 1366 x 768,
// laser) and the Surface Pro (v2 Performance 1366 x 911, CNC), FR and ES, dark and light, standard and large text.
// States: hors ligne (no stream, no API), repos (program loaded), pilote pris (control.owner: another device),
// homing (Home), palpage (touch-plate probe), travail, pause, alarme (during the job), périmé (report > 2.5 s old).
// One folder per screen, variant and state: screens-<screen>-<variant>-<state>/<screen>.png|.json. Enforced like
// the other strict variants, plus horizontal / vertical overflow and text over text. Visual only: every request
// that is not a GET under /api/ is refused (403) by the fixture.
const SCREENS_STATES = [['repos', 'idle'], ['pilote-pris', 'pilot'], ['homing', 'homing'], ['palpage', 'probing'], ['travail', 'running'], ['pause', 'paused'], ['alarme', 'alarm'], ['perime', 'stale'], ['hors-ligne', 'lost']];
const SCREENS_READY = {
  idle: 'm&&m.workflow==="idle"&&/^Idle/.test(m.activeState||"")&&!(m.control&&m.control.owner)&&!m.homing&&!m.probing',
  pilot: 'm&&m.control&&m.control.owner&&m.control.owner.id==="browser-run-other"',
  homing: 'm&&m.homing&&/^Home/.test(m.activeState||"")',
  probing: 'm&&m.probing',
  running: 'm&&m.workflow==="running"&&/^Run/.test(m.activeState||"")',
  paused: 'm&&m.workflow==="paused"',
  alarm: 'm&&/^Alarm/.test(m.activeState||"")'
};
const SCREENS_VARIANTS = [
  { id: 'v1-768-fr-sombre-laser', v2: false, w: 1366, h: 768, lang: 'fr', theme: 'dark', size: 'standard', kind: 'laser' },
  { id: 'v1-768-es-clair-laser', v2: false, w: 1366, h: 768, lang: 'es', theme: 'light', size: 'standard', kind: 'laser' },
  { id: 'v1-768-es-clair-laser-agrandi', v2: false, w: 1366, h: 768, lang: 'es', theme: 'light', size: 'large', kind: 'laser', states: ['idle', 'running', 'alarm'] },
  { id: 'v1-768-fr-clair-cnc', v2: false, w: 1366, h: 768, lang: 'fr', theme: 'light', size: 'standard', kind: 'cnc', states: ['idle', 'running', 'paused'] },
  { id: 'v2-911-fr-sombre-cnc', v2: true, w: 1366, h: 911, lang: 'fr', theme: 'dark', size: 'standard', kind: 'cnc' },
  { id: 'v2-911-es-clair-cnc', v2: true, w: 1366, h: 911, lang: 'es', theme: 'light', size: 'standard', kind: 'cnc' },
  { id: 'v2-911-es-sombre-cnc-agrandi', v2: true, w: 1366, h: 911, lang: 'es', theme: 'dark', size: 'large', kind: 'cnc', states: ['idle', 'running', 'alarm'] }
];
const SCREENS_OF_STATES = SCREENS.filter(([name]) => name !== 'settings');
const SCREENS_PAGE = '(function(){var m=window.cncState&&window.cncState.get().machine,t=function(id){var e=document.getElementById(id);return e?e.textContent.replace(/\\s+/g," ").trim():null;};' +
  'return {lang:document.documentElement.lang,theme:document.documentElement.getAttribute("data-theme")||"dark",large:document.body.classList.contains("display-large"),perfV2:document.body.classList.contains("perf-v2"),' +
  'kind:window.cncProfile&&window.cncProfile.kind?window.cncProfile.kind():null,profile:window.cncProfile&&window.cncProfile.performance?window.cncProfile.performance():null,stateWord:t("t-state-text"),' +
  'machine:m?{workflow:m.workflow,activeState:m.activeState,fresh:m.fresh,homing:!!m.homing,probing:!!m.probing,owner:m.control&&m.control.owner?m.control.owner.label:null}:null};})()';
// Journal rows (lot Journal): each visible row of the v1 list (#real-history-list) and of the v2 list (#v2k-list)
// starts at least one row height below the previous one (rows squeezed by a flex list overlapped by 18 px), and the
// v1 page fits its box (no inner scroll bar). Not « overlaps non empty »: adjacent segments touch at distance 0.
const SCREENS_JOURNAL = '(function(){function rows(id){var l=document.getElementById(id);if(!l||!l.getClientRects().length)return null;' +
  'var li=[].filter.call(l.children,function(x){return x.getClientRects().length;}).map(function(x){var r=x.getBoundingClientRect();return {top:r.top,h:r.height};}),bad=[];' +
  'for(var i=1;i<li.length;i++)if(li[i].top-li[i-1].top<li[i-1].h-0.5)bad.push({row:i,pitch:Math.round((li[i].top-li[i-1].top)*10)/10,height:Math.round(li[i-1].h*10)/10});' +
  'return {rows:li.length,scrollHeight:l.scrollHeight,clientHeight:l.clientHeight,bad:bad};}' +
  'var p=document.getElementById("real-history-page"),m=p&&/·\\s*(\\d+)/.exec(p.textContent);return {v1:rows("real-history-list"),v2:rows("v2k-list"),page:p?p.textContent:"",events:m?Number(m[1]):null};})()';
// Machine (lot Machine) on the real page: the alarm notice shown (v1 and v2), the note « consulter CNCjs » under the
// coordinates hidden once the notice explains the code, a reason line whenever $X or $H is greyed out (a title is not
// shown on touch), and no Grbl English word on the v2 State line.
const SCREENS_MACHINE = '(function(){var v=function(e){return !!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=="hidden");},$=function(id){return document.getElementById(id);};' +
  'var n=document.querySelector("#screen-machine .ks-machine-coordinates>.ks-help"),r=$("ks-machine-command-reason"),b=document.querySelectorAll("#screen-machine .ks-machine-commands button"),s=document.querySelector("#v2m-condition .v2m-state");' +
  'var nt=$("ks-machine-alarm-title"),na=$("ks-machine-alarm-action");' +
  'return {notice:v($("ks-machine-alarm")),noticeTitle:nt?nt.textContent.trim():"",noticeAction:na?na.textContent.trim():"",note:v(n),reason:v(r)?r.textContent:"",unlockDisabled:!!(b[0]&&b[0].disabled),homeDisabled:!!(b[1]&&b[1].disabled),v2state:s&&v(s)?s.textContent:null};})()';
async function screensCapture(cdp, dirName, name, label, tag, page, results) {
  const dir = path.join(OUT, dirName);
  fs.mkdirSync(dir, { recursive: true });
  try {
    await goScreen(cdp, name);
    const data = await cdp.evaluate('(' + MEASURE + ')(' + JSON.stringify(GOALS) + ')');
    const overlaps = await cdp.evaluate('(' + V2_OVERLAP + ')()');
    const journal = name === 'history' ? await cdp.evaluate(SCREENS_JOURNAL) : null;
    fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(Object.assign(data, { screen: name, label, variant: tag, page, overlapsText: overlaps, journal }), null, 1));
    await screenshot(cdp, path.join(dir, name + '.png'));
    const below = data.targets.filter((t) => t.belowGoal), unreachable = data.targets.filter((t) => !t.reachable), fonts = data.targets.map((t) => t.fontPx);
    results.push({ screen: name, label, targets: data.targets.length, below, small: data.smallText, textTargets: data.targets.filter((t) => t.textBelowGoal), gaps: data.targets.filter((t) => t.gapBelowGoal), unreachable, truncated: data.truncated,
      overflow: data.horizontalOverflow, vertical: data.verticalOverflow, scale: data.screenScale, scrolls: data.scrolls, fontStats: { min: fonts.length ? Math.min(...fonts) : null, median: median(fonts), max: fonts.length ? Math.max(...fonts) : null }, textFit: textFitOf(data), railScroll: data.railScroll, overlapsText: overlaps, journal });
  } catch (e) { failures.push(tag + ' ' + label + ': ' + e.message); log('FAIL ' + tag + ' ' + label + ': ' + e.message); results.push({ screen: name, label, error: e.message }); }
}
// Source Serveur of the Journal (lot Journal): the real button, with an in-page fake XMLHttpRequest installed only
// around the click (fetchServer builds its request synchronously), answered with a fixed page or a network error.
// Nothing leaves the page. The entries cover the labels of every event kind and a failed origin with its reason.
function screensServerEntries() {
  const now = Date.now(), at = (min) => new Date(now - min * 60000).toISOString();
  const port = { port: '/dev/replay' }, tab = { kind: 'touch', label: 'Tablette atelier' };
  return [
    { seq: 23, at: at(1), event: 'origin', result: 'failed', reason: 'Grbl a refusé la définition d’origine (error:9).', controller: port, actor: tab },
    { seq: 22, at: at(3), event: 'jog', result: 'cancelled', reason: 'operator', controller: port },
    { seq: 21, at: at(6), event: 'frame', result: 'ended', reason: '', controller: port },
    { seq: 20, at: at(9), event: 'control', change: 'claim', owner: tab, actor: tab, controller: port },
    { seq: 19, at: at(14), event: 'pause', program: V2_FILE, controller: port, actor: tab },
    { seq: 18, at: at(21), event: 'alarm', code: 1, controller: port },
    { seq: 17, at: at(23), event: 'start', program: V2_FILE, controller: port, actor: tab },
    { seq: 16, at: at(40), event: 'machine', operation: 'set-kind', controller: port }
  ];
}
function screensServerClick(id, fail) {
  return '(function(){var Prev=window.XMLHttpRequest,E=' + JSON.stringify(screensServerEntries()) + ',fail=' + !!fail + ';' +
    'window.XMLHttpRequest=function(){var x={status:0,responseText:"",timeout:0,open:function(m,u){x.method=m;x.url=u;},setRequestHeader:function(){},abort:function(){x.onload=x.onerror=null;},' +
    'send:function(){setTimeout(function(){if(fail){if(x.onerror)x.onerror();return;}var n=Number((/[?&]limit=([0-9]+)/.exec(x.url)||[])[1])||E.length;x.status=200;x.responseText=JSON.stringify({entries:E.slice(0,n),total:E.length,skipped:0,more:n<E.length});if(x.onload)x.onload();},60);}};return x;};' +
    'try{var b=document.getElementById(' + JSON.stringify(id) + ');if(!b)return false;b.click();}finally{window.XMLHttpRequest=Prev;}return true;})()';
}
async function screensServer(cdp, v, summary) {
  const p = v.v2 ? 'v2k-source-' : 'real-history-source-', session = '(function(){var b=document.getElementById("' + p + 'session");if(b)b.click();return !!b;})()';
  for (const [suffix, fail] of [['serveur', false], ['serveur-erreur', true]]) {
    const tag = 'screens ' + v.id + ' ' + suffix, results = [];
    try {
      await goScreen(cdp, 'history');
      await cdp.evaluate(session); await sleep(300);
      if (!await cdp.evaluate(screensServerClick(p + 'server', fail))) throw new Error('no ' + p + 'server button');
      await sleep(700);
      // v2: the failed origin selected, its reason in the detail on the right.
      if (!fail && v.v2) { await cdp.evaluate('(function(){var b=document.querySelector(\'#v2k-list li[data-id="server-23"] button\');if(b)b.click();return true;})()'); await sleep(300); }
      const page = await cdp.evaluate(SCREENS_PAGE);
      await screensCapture(cdp, 'screens-history-' + v.id + '-' + suffix, 'history', 'Journal', tag, page, results);
      log(tag + ': ' + (results[0] && results[0].journal ? JSON.stringify({ v1: results[0].journal.v1 && results[0].journal.v1.rows, v2: results[0].journal.v2 && results[0].journal.v2.rows }) : 'no journal'));
    } catch (e) { failures.push(tag + ': ' + e.message); log('FAIL ' + tag + ': ' + e.message); }
    summary.measurements.push({ variant: tag, dir: 'screens-history-' + v.id + '-' + suffix, dpr: 1, results, strict: true, overlap: true, v2: !!v.v2 });
  }
  try { await cdp.evaluate(session); } catch (_) { /* next variant reloads the page */ }
}
async function screensVariant(cdp, fx, v, summary, out) {
  const states = SCREENS_STATES.filter(([, phase]) => !v.states || v.states.indexOf(phase) >= 0);
  const info = { variant: v.id, states: {} };
  fx.setPhase('idle'); fx.overrides = { feed: 100, rapid: 100, spindle: 100 }; fx.profile = v.kind === 'laser' ? V2_LASER_PROFILE : V2_PROFILE;
  pageErrors.length = 0;
  try {
    await setViewport(cdp, v.w, v.h, 1);
    await v2Storage(cdp, fx.base, { profile: v.v2 ? 'performance' : 'eco', v2: { version: 1, enabled: !!v.v2 }, kind: null });
    await settingsStorage(cdp, { lang: v.lang, size: v.size, theme: v.theme });
    await v2Open(cdp, fx.base + 'index.html?screens=' + v.id, v.v2);
    for (const [stateId, phase] of states) {
      const tag = 'screens ' + v.id + ' ' + stateId, results = [];
      fx.setPhase(phase);
      try {
        if (SCREENS_READY[phase]) await cdp.waitFor('(function(){var m=window.cncState&&window.cncState.get().machine;return !!(' + SCREENS_READY[phase] + ');})()', 20000, 'state ' + phase);
        else await sleep(4000); // stale, lost: the report ages, the stream ends
        await sleep(phase === 'running' ? 1500 : 800);
        const page = await cdp.evaluate(SCREENS_PAGE);
        info.states[stateId] = page;
        if (page.lang !== v.lang || page.theme !== v.theme || page.large !== (v.size === 'large') || page.perfV2 !== v.v2 || page.kind !== v.kind) failures.push(tag + ': page shown as ' + JSON.stringify(page) + ', expected ' + JSON.stringify({ lang: v.lang, theme: v.theme, size: v.size, v2: v.v2, kind: v.kind }));
        for (const [name, label] of SCREENS_OF_STATES) await screensCapture(cdp, 'screens-' + name + '-' + v.id + '-' + stateId, name, label, tag, page, results);
        await goScreen(cdp, 'machine');
        const mc = await cdp.evaluate(SCREENS_MACHINE);
        (info.machine || (info.machine = {}))[stateId] = mc;
        if (phase === 'alarm' && !mc.notice) failures.push(tag + ': Machine, alarm notice not shown');
        // The cause and what to do are in that notice (v1 and v2, the v2 block no longer repeats them): never empty.
        if (phase === 'alarm' && (!mc.noticeTitle || !mc.noticeAction)) failures.push(tag + ': Machine, alarm notice without its title or explanation');
        // ES / EN: the reason line is translated (server reasons through the catalogue), no French left.
        if (v.lang !== 'fr' && /’| :|\b(arrêtez|attendez|broche|commande|réglages?)\b|en cours/i.test(mc.reason)) failures.push(tag + ': Machine, French reason on the ' + v.lang + ' page: ' + mc.reason);
        if (phase === 'alarm' && mc.note) failures.push(tag + ': Machine, « consulter CNCjs » shown under a known alarm code');
        if (phase !== 'lost' && (mc.unlockDisabled || mc.homeDisabled) && !mc.reason) failures.push(tag + ': Machine, $X / $H greyed out without a reason line');
        if (mc.v2state && /\b(Idle|Run|Hold|Jog|Alarm|Door|Check|Home|Sleep)\b/.test(mc.v2state)) failures.push(tag + ': Machine, Grbl word on the v2 State line: ' + mc.v2state);
        // Lot Journal: after every state, the journal holds more than two v1 pages (15 events or more).
        const journal = results.find((r) => r.screen === 'history' && r.journal);
        if (!v.states && phase === 'lost' && journal && !(journal.journal.events >= 15)) failures.push(tag + ': journal holds ' + journal.journal.events + ' events, fixture goal 15 (' + journal.journal.page + ')');
        log(tag + ': « ' + page.stateWord + ' », ' + results.length + ' screens' + (page.machine ? ' (' + page.machine.workflow + ' / ' + page.machine.activeState + ')' : ' (no machine)'));
      } catch (e) { failures.push(tag + ': ' + e.message); log('FAIL ' + tag + ': ' + e.message); }
      summary.measurements.push({ variant: tag, dir: 'screens-*-' + v.id + '-' + stateId, dpr: 1, results, strict: true, overlap: true, v2: !!v.v2 });
    }
    await screensServer(cdp, v, summary);
    info.commands = fx.commands.splice(0, fx.commands.length);
    info.pageErrors = pageErrors.slice();
    if (pageErrors.length) failures.push('screens ' + v.id + ': page exceptions: ' + pageErrors.slice(0, 3).join(' | ').slice(0, 600));
  } catch (e) { failures.push('screens ' + v.id + ': ' + e.message); log('FAIL screens ' + v.id + ': ' + e.message); }
  out.push(info);
}
async function screensMeasure(summary) {
  const fx = await startV2Fixture();
  const browser = await launchBrowser(1366, 911, V2_FLAGS), cdp = browser.cdp;
  const out = [];
  try {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: V2_GPU_TRAP });
    for (const v of SCREENS_VARIANTS) await screensVariant(cdp, fx, v, summary, out);
  } catch (e) { failures.push('screens: ' + (e.stack || e.message)); log('FAIL screens: ' + e.message); }
  finally {
    cdp.close();
    try { await cdp.send('Browser.close', {}, 3000); } catch (_) { /* closed */ }
    try { browser.child.kill(); } catch (_) { /* gone */ }
    fx.close();
    await sleep(300);
    try { fs.rmSync(browser.profile, { recursive: true, force: true }); } catch (_) { /* busy */ }
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'screens.json'), JSON.stringify({ states: SCREENS_STATES, variants: SCREENS_VARIANTS, passes: out }, null, 1));
  summary.screens = out.map((p) => ({ variant: p.variant, states: Object.keys(p.states), commands: (p.commands || []).length, pageErrors: (p.pageErrors || []).length }));
}

// --- Réglages (design/PROMPT-REGLAGES-MULTIAGENT.md, contract §7-§8). The three tabs walked from top to bottom, one
// capture per screenful, enforced like the other strict variants plus horizontal overflow and text over text: FR and
// ES, standard and large text, dark and light, at 1366 x 768 on the simulation page in Éco with a laser (the RT) and
// on the real page, then at 1366 x 911 in v2 CNC (v2SettingsPass). Also checked: the scroll needed to reach the
// frequent controls (§8.2, enforced at 1366 x 768 Éco laser, standard text), every direct child of the panel shown on
// exactly one tab, nothing between the strip and the sticky tabs once scrolled, the selected tab distinct and
// readable, « Appliquer » shown on every tab, the Wi-Fi form with its keyboard, the first tap (arming) of a Tablette
// command and of the update install (never the second), the refusals during a job, and no system request while
// Affichage or Machine is shown. Every API is answered by the fixture (preview-server.cjs), VERSION.json and
// api.github.com included: nothing leaves the loopback.
const SETTINGS_TABS = ['display', 'machine', 'system'];
const SETTINGS_REQUEST = /\/api\/touch-system|\/api\/touch-wifi|\/api\/touch-updates|\/api\/commands|VERSION\.json|api\.github\.com/;
// Controls whose scroll is measured on each tab (§8.2); `apply` only while another language is chosen.
const SETTINGS_CONTROLS = {
  display: { theme: '[data-display-theme]', size: '[data-display-size]', brightness: '#ks-backlight .ks-backlight-step', sleep: '#display-sleep-delay, #display-sleep-test', language: '#display-language', apply: '#language-apply' },
  machine: { diagnostic: '#profile-diagnostic-run', language: '#display-language', apply: '#language-apply', v2: '#ks-v2-card', quality: '#ks-v2-quality' },
  system: { wifi: '.ks-wifi-scan', language: '#display-language', apply: '#language-apply' }
};
const SETTINGS_LIMITS = { theme: 0, size: 0, brightness: 120, sleep: 350, language: 0, apply: 0, diagnostic: 0, wifi: 0 };
// Every XHR the page opens, with the Réglages tab at that moment and its body (installed before the fixture
// replaces XMLHttpRequest, which it then wraps too).
const SETTINGS_TRAP = '(function(){var log=window.__brRequests=[];function wrap(F){if(!F||F.__brWrapped)return F;var W=function(){var x=new F(),open=x.open,send=x.send,e=null;' +
  'x.open=function(m,u){var p=document.getElementById("screen-settings");e={method:m,url:String(u),tab:p?p.getAttribute("data-settings-tab"):null,active:!!(p&&p.classList.contains("active"))};log.push(e);return open.apply(x,arguments);};' +
  'x.send=function(b){if(e)e.body=b==null?"":String(b).slice(0,200);return send.apply(x,arguments);};return x;};W.__brWrapped=true;W.prototype=F.prototype;["UNSENT","OPENED","HEADERS_RECEIVED","LOADING","DONE"].forEach(function(k){W[k]=F[k];});return W;}' +
  'var current=wrap(window.XMLHttpRequest);try{Object.defineProperty(window,"XMLHttpRequest",{configurable:true,get:function(){return current;},set:function(F){current=wrap(F);}});}catch(_){}})();';
// The panel at the top of the current tab: children shown, tab buttons, scroll needed to see the bottom of each control.
const SETTINGS_SHAPE = String(function shape(controls) {
  var p = document.getElementById('screen-settings'), main = document.querySelector('main');
  main.scrollTop = 0;
  var mr = main.getBoundingClientRect();
  function shown(n) { return !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden'; }
  function key(n) { return n.id ? '#' + n.id : '.' + String(n.className).trim().split(/\s+/).join('.'); }
  var need = {};
  Object.keys(controls).forEach(function (k) {
    var list = Array.prototype.filter.call(document.querySelectorAll(controls[k]), function (n) { return p.contains(n) && shown(n); });
    need[k] = list.length ? Math.max.apply(null, list.map(function (n) { return Math.max(0, Math.ceil(n.getBoundingClientRect().bottom - mr.bottom)); })) : null;
  });
  return { tab: p.getAttribute('data-settings-tab'), compact: document.body.classList.contains('t-compact'), large: document.body.classList.contains('display-large'), theme: document.documentElement.getAttribute('data-theme') || 'dark',
    lang: document.documentElement.lang, perfV2: document.body.classList.contains('perf-v2'), scrollHeight: main.scrollHeight, clientHeight: main.clientHeight, need: need,
    children: Array.prototype.map.call(p.children, function (n) { return { key: key(n), hidden: !!n.hidden, shown: shown(n) }; }),
    tabs: Array.prototype.map.call(p.querySelectorAll('.ks-settings-tabs [data-tab]'), function (b) { return { tab: b.getAttribute('data-tab'), selected: b.getAttribute('aria-selected'), label: b.textContent.trim() }; }) };
});
// Scrolled 300 px: the sticky tabs start at the top of main and nothing else is drawn above or through them.
const SETTINGS_STICKY = String(function sticky() {
  var main = document.querySelector('main'), tabs = document.querySelector('#screen-settings .ks-settings-tabs');
  if (!tabs || main.scrollHeight - main.clientHeight < 300) return Promise.resolve(null);
  main.scrollTop = 300;
  return new Promise(function (done) { requestAnimationFrame(function () { requestAnimationFrame(function () {
    var mr = main.getBoundingClientRect(), tr = tabs.getBoundingClientRect(), bad = [];
    function d(n) { return n ? (n.id ? '#' + n.id : n.tagName.toLowerCase() + (typeof n.className === 'string' && n.className ? '.' + n.className.split(' ')[0] : '')) : 'nothing'; }
    for (var x = tr.left + 4; x < tr.right - 4; x += Math.max(20, (tr.width - 8) / 24)) [mr.top + 1, tr.top + 2, tr.top + tr.height / 2].forEach(function (y) { var h = document.elementFromPoint(x, y); if (!h || !tabs.contains(h)) bad.push(Math.round(x) + ',' + Math.round(y) + ' ' + d(h)); });
    var out = { gap: Math.round((tr.top - mr.top) * 10) / 10, bad: bad.slice(0, 6), background: getComputedStyle(tabs).backgroundColor };
    main.scrollTop = 0; done(out);
  }); }); });
});
// Each tab button: its drawn background (first opaque ancestor) and the contrast of its text on it.
const SETTINGS_TAB_STYLE = String(function tabStyle() {
  function rgb(s) { var m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; var v = m[1].split(',').map(parseFloat); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; }
  function bgOf(n) { for (; n; n = n.parentElement) { var c = rgb(getComputedStyle(n).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; }
  function lum(c) { return [c.r, c.g, c.b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  return Array.prototype.map.call(document.querySelectorAll('#screen-settings .ks-settings-tabs [data-tab]'), function (b) {
    var bg = bgOf(b), fg = rgb(getComputedStyle(b).color);
    return { tab: b.getAttribute('data-tab'), selected: b.getAttribute('aria-selected') === 'true', bg: [bg.r, bg.g, bg.b].join(','), contrast: Math.round(ratio(fg, bg) * 100) / 100 };
  });
});
async function settingsTab(cdp, tab) {
  const ok = await cdp.evaluate('(function(){var b=document.querySelector(\'#screen-settings .ks-settings-tabs [data-tab="' + tab + '"]\');if(!b)return false;b.click();return true;})()');
  if (!ok) throw new Error('no « ' + tab + ' » tab button');
  await sleep(tab === 'system' ? 1500 : 500);
}
// One capture per screenful of the current tab, from its top. A control scrolled under the sticky tabs is out of
// view (offscreen), not covered; text under them is not text over text.
async function settingsCaptures(cdp, dir, name, label, results) {
  const geo = await cdp.evaluate('(function(){var m=document.querySelector("main"),t=document.querySelector("#screen-settings .ks-settings-tabs");m.scrollTop=0;return {h:m.scrollHeight,c:m.clientHeight,tabs:t?Math.round(t.getBoundingClientRect().height):0,labels:t?Array.prototype.map.call(t.querySelectorAll("button"),function(b){return b.textContent.replace(/\\s+/g," ").trim();}):[]};})()');
  const step = Math.max(200, geo.c - geo.tabs - 40);
  for (let y = 0, i = 0; i < 12; i++) {
    const at = await cdp.evaluate('(function(){var m=document.querySelector("main");m.scrollTop=' + y + ';return new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(function(){r(m.scrollTop);});});});})()');
    const shot = name + '-' + i, where = label + ' · ' + i + (at ? ' (scrollTop ' + at + ')' : '');
    try {
      const data = await cdp.evaluate('(function(){var d=(' + MEASURE + ')(' + JSON.stringify(GOALS) + '),t=document.querySelector("#screen-settings .ks-settings-tabs");' +
        'if(t&&document.querySelector("main").scrollTop>0){var r=t.getBoundingClientRect(),labels=' + JSON.stringify(geo.labels.map((l) => l.slice(0, 60))) + ';d.targets.forEach(function(x){var cy=x.y+x.h/2;if(cy>=r.top&&cy<=r.bottom&&labels.indexOf(x.label)<0){x.offscreen=true;x.underTabs=true;}});}return d;})()');
      const overlaps = (await cdp.evaluate('(' + V2_OVERLAP + ')()')).filter((o) => !at || (geo.labels.indexOf(o.a) < 0 && geo.labels.indexOf(o.b) < 0));
      fs.writeFileSync(path.join(dir, shot + '.json'), JSON.stringify(Object.assign(data, { overlapsText: overlaps, scrollTop: at }), null, 1));
      await screenshot(cdp, path.join(dir, shot + '.png'));
      const below = data.targets.filter((t) => t.belowGoal), unreachable = data.targets.filter((t) => !t.reachable), fonts = data.targets.map((t) => t.fontPx);
      results.push({ screen: 'settings', label: 'Réglages · ' + where, targets: data.targets.length, below, small: data.smallText, textTargets: data.targets.filter((t) => t.textBelowGoal), gaps: data.targets.filter((t) => t.gapBelowGoal), unreachable, truncated: data.truncated,
        overflow: data.horizontalOverflow, vertical: data.verticalOverflow, scale: data.screenScale, scrolls: data.scrolls, fontStats: { min: fonts.length ? Math.min(...fonts) : null, median: median(fonts), max: fonts.length ? Math.max(...fonts) : null }, textFit: textFitOf(data), railScroll: data.railScroll, overlapsText: overlaps });
    } catch (e) { failures.push(dir + ' ' + where + ': ' + e.message); results.push({ screen: 'settings', label: 'Réglages · ' + where, error: e.message }); }
    if (at + geo.c >= geo.h - 1) break;
    y = Math.min(at + step, geo.h - geo.c);
  }
  await cdp.evaluate('document.querySelector("main").scrollTop=0;true');
}
// The tabs of one page: shape, captures, sticky tabs, tab styles, language confirmation, children on exactly one tab.
async function settingsWalk(cdp, tag, dir, results, info, opts) {
  for (const tab of SETTINGS_TABS) {
    await settingsTab(cdp, tab);
    if (tab === 'system') {
      try { await cdp.waitFor('(function(){var w=document.querySelector("#ks-system .ks-wifi-current"),u=document.querySelector("#ks-system .ks-updates-summary");return !!(w&&u&&w.textContent!=="—"&&u.textContent!=="—"&&document.querySelector("#ks-system .ks-tablet-action"));})()', 10000, 'Système data'); }
      catch (e) { failures.push(tag + ': ' + e.message); }
    }
    const shape = await cdp.evaluate('(' + SETTINGS_SHAPE + ')(' + JSON.stringify(SETTINGS_CONTROLS[tab]) + ')');
    info.tabs[tab] = shape;
    const tabLabels = { fr: ['Affichage', 'Machine et performances', 'Système'], es: ['Pantalla', 'Máquina y rendimiento', 'Sistema'] }[info.lang];
    if (tabLabels && JSON.stringify(shape.tabs.map((b) => b.label)) !== JSON.stringify(tabLabels)) failures.push(tag + ' ' + tab + ': tab labels ' + JSON.stringify(shape.tabs.map((b) => b.label)) + ', expected ' + JSON.stringify(tabLabels));
    if (shape.tab !== tab) failures.push(tag + ': data-settings-tab « ' + shape.tab + ' » after a tap on « ' + tab + ' »');
    shape.tabs.forEach((b) => { if (b.selected !== String(b.tab === tab)) failures.push(tag + ' ' + tab + ': aria-selected="' + b.selected + '" on the « ' + b.tab + ' » tab'); });
    if (shape.compact) failures.push(tag + ': body.t-compact at ' + JSON.stringify(info.viewport) + ' (measurements would not be those of the tablet)');
    await settingsCaptures(cdp, dir, tab, opts.labels[tab], results);
    const st = await cdp.evaluate('(' + SETTINGS_STICKY + ')()');
    info.sticky = info.sticky || {}; info.sticky[tab] = st;
    if (st && (Math.abs(st.gap) > 1 || st.bad.length)) failures.push(tag + ' ' + tab + ': something visible between the strip and the sticky tabs once scrolled (tabs ' + st.gap + ' px below the top of main; ' + st.bad.join(' | ') + ')');
    const style = await cdp.evaluate('(' + SETTINGS_TAB_STYLE + ')()');
    info.tabStyle = info.tabStyle || {}; info.tabStyle[tab] = style;
    const sel = style.find((s) => s.selected);
    if (!sel) failures.push(tag + ' ' + tab + ': no selected tab');
    else {
      style.filter((s) => !s.selected && s.bg === sel.bg).forEach((s) => failures.push(tag + ' ' + tab + ': the selected tab has the background of « ' + s.tab + ' » (' + s.bg + ')'));
      style.filter((s) => s.contrast < 4.5).forEach((s) => failures.push(tag + ' ' + tab + ': tab « ' + s.tab + ' » text contrast ' + s.contrast + ', goal 4.5'));
    }
  }
  // Another language chosen, not applied: « Appliquer et recharger » on every tab, then the choice put back.
  const other = info.lang === 'fr' ? 'es' : 'fr';
  await cdp.evaluate('(function(){var s=document.getElementById("display-language");s.value=' + JSON.stringify(other) + ';s.dispatchEvent(new Event("change",{bubbles:true}));return true;})()');
  info.apply = {};
  for (const tab of SETTINGS_TABS) {
    await settingsTab(cdp, tab);
    const shape = await cdp.evaluate('(' + SETTINGS_SHAPE + ')(' + JSON.stringify({ apply: '#language-apply', language: '#display-language' }) + ')');
    info.apply[tab] = shape.need;
    if (shape.need.apply === null) failures.push(tag + ' ' + tab + ': « Appliquer et recharger » not shown after choosing another language');
    await screenshot(cdp, path.join(dir, 'language-' + tab + '.png'));
  }
  await cdp.evaluate('(function(){var s=document.getElementById("display-language");s.value=' + JSON.stringify(info.lang) + ';s.dispatchEvent(new Event("change",{bubbles:true}));return true;})()');
  // Each direct child of the panel: intro and tabs on every tab, any other on exactly one (none if [hidden]).
  const base = info.tabs.display.children;
  base.forEach((c, i) => {
    const row = SETTINGS_TABS.map((t) => info.tabs[t].children[i]);
    if (row.some((r) => !r || r.key !== c.key)) { failures.push(tag + ': the panel children changed between tabs at ' + c.key); return; }
    const n = row.filter((r) => r.shown).length, all = /ks-panel-intro|ks-settings-tabs/.test(c.key);
    if (all ? n !== 3 : c.hidden ? n !== 0 : n !== 1) failures.push(tag + ': ' + c.key + ' shown on ' + n + ' tab(s), expected ' + (all ? 3 : c.hidden ? 0 : 1));
  });
  info.placement = {};
  base.forEach((c, i) => { info.placement[c.key] = SETTINGS_TABS.filter((t) => info.tabs[t].children[i].shown).join('+') || (c.hidden ? 'hidden' : 'none'); });
}
// Requests seen by the trap: system ones only while Système is shown, never a host command, install or Wi-Fi change.
async function settingsRequests(cdp, tag, info) {
  const list = (await cdp.evaluate('window.__brRequests||[]')) || [];
  info.requests = list.filter((r) => SETTINGS_REQUEST.test(r.url)).map((r) => ({ method: r.method, url: r.url, tab: r.tab, active: r.active, action: (/"action"\s*:\s*"([^"]+)"/.exec(r.body || '') || [])[1] || '' }));
  info.requests.filter((r) => !(r.active && r.tab === 'system')).forEach((r) => failures.push(tag + ': ' + r.method + ' ' + r.url + ' while ' + (r.active ? 'the « ' + r.tab + ' » tab' : 'another screen') + ' is shown'));
  info.requests.filter((r) => r.method !== 'GET' && !(/touch-wifi/.test(r.url) && r.action === 'scan')).forEach((r) => failures.push(tag + ': ' + r.method + ' ' + r.url + ' ' + r.action + ' sent (only a Wi-Fi scan is allowed here)'));
  if (list.some((r) => /^https?:/.test(r.url) && !/^https:\/\/api\.github\.com\/repos\/fixture\//.test(r.url))) failures.push(tag + ': request outside the fixture: ' + list.filter((r) => /^https?:/.test(r.url)).map((r) => r.url).join(', '));
}
const SETTINGS_LABELS = { display: 'Affichage', machine: 'Machine et performances', system: 'Système' };
async function settingsStorage(cdp, v) {
  await cdp.evaluate('localStorage.setItem("cncjs-touch-language-v1",' + JSON.stringify(v.lang) + ');localStorage.setItem("cncjs-touch-display-v1",' + JSON.stringify(JSON.stringify({ size: v.size, theme: v.theme })) + ');' +
    (v.kind ? 'localStorage.setItem("cncjs-touch-sim-kind-v1",' + JSON.stringify(JSON.stringify({ version: 1, kind: v.kind })) + ');' : '') + 'true');
}
async function settingsOpen(cdp, url, v, tag) {
  await setViewport(cdp, v.w, v.h, 1);
  await navigate(cdp, url);
  await cdp.evaluate('localStorage.removeItem("cncjs-touch-sim-kind-v1");localStorage.removeItem("cncjs-touch-performance-v1");true');
  await settingsStorage(cdp, v);
  try { await navigate(cdp, url + '?settings=' + encodeURIComponent(tag)); await waitReady(cdp); } catch (_) { await navigate(cdp, url + '?settings=' + encodeURIComponent(tag) + '-retry'); await waitReady(cdp); }
  await sleep(1500);
  await goScreen(cdp, 'settings');
}
async function settingsVariant(cdp, v, realUrl, simUrl, summary, out) {
  const tag = 'settings ' + v.w + 'x' + v.h + ' ' + v.page + ' ' + v.lang + ' ' + v.size + ' ' + v.theme + (v.kind ? ' ' + v.kind : '');
  const dirName = tag.replace(/[^A-Za-z0-9]+/g, '-'), dir = path.join(OUT, dirName), results = [], info = { tag, lang: v.lang, viewport: [v.w, v.h], tabs: {} };
  fs.mkdirSync(dir, { recursive: true });
  try {
    await settingsOpen(cdp, v.page === 'sim' ? simUrl : realUrl, v, tag);
    const page = await cdp.evaluate('({lang:document.documentElement.lang,large:document.body.classList.contains("display-large"),theme:document.documentElement.getAttribute("data-theme")||"dark",kind:window.cncProfile&&window.cncProfile.kind?window.cncProfile.kind():null,profile:window.cncProfile&&window.cncProfile.performance?window.cncProfile.performance():null})');
    info.page = page;
    if (page.lang !== v.lang || page.large !== (v.size === 'large') || page.theme !== v.theme) failures.push(tag + ': page opened as ' + JSON.stringify(page));
    if (v.kind && page.kind !== v.kind) failures.push(tag + ': machine kind ' + page.kind + ' instead of ' + v.kind);
    await settingsWalk(cdp, tag, dir, results, info, { labels: SETTINGS_LABELS });
    if (v.kind === 'laser' && info.placement['#ks-laser-z-card'] !== 'machine') failures.push(tag + ': Z laser card on « ' + info.placement['#ks-laser-z-card'] + ' », expected the Machine tab');
    // §8.2: the frequent controls without (or within a short) scroll, at the RT size in Éco laser, standard text.
    const enforce = v.page === 'sim' && v.w === 1366 && v.h === 768 && v.size === 'standard';
    info.limits = [];
    for (const tab of SETTINGS_TABS) for (const k of Object.keys(SETTINGS_LIMITS)) {
      const need = k === 'apply' ? info.apply[tab].apply : info.tabs[tab].need[k];
      if (need === undefined) continue;
      info.limits.push({ tab, control: k, need, limit: SETTINGS_LIMITS[k] });
      if (enforce && (need === null || need > SETTINGS_LIMITS[k])) failures.push(tag + ' ' + tab + ': « ' + k + ' » needs ' + (need === null ? 'a control that is not shown' : need + ' px of scroll') + ', goal ' + SETTINGS_LIMITS[k] + ' px');
    }
    if (v.flows) await settingsFlows(cdp, tag, dir, results, info);
    await settingsRequests(cdp, tag, info);
    log(tag + ': ' + results.length + ' captures, placement ' + Object.keys(info.placement).length + ' blocks, scroll ' + info.limits.filter((l) => l.tab === 'display').map((l) => l.control + ' ' + l.need).join(', '));
  } catch (e) { failures.push(tag + ': ' + e.message); log('FAIL ' + tag + ': ' + e.message); }
  summary.measurements.push({ variant: tag, dir: dirName, dpr: 1, results, strict: true, overlap: true });
  out.variants.push(info);
}
// Système at rest: the Wi-Fi form opened with its keyboard (then Annuler), the first tap of a Tablette command and of
// the update install (armed, orange), both disarmed by leaving the tab. Nothing is confirmed.
async function settingsFlows(cdp, tag, dir, results, info) {
  const flows = info.flows = {};
  try {
    await settingsTab(cdp, 'system');
    await cdp.evaluate('document.querySelector("#ks-system .ks-wifi-scan").click();true');
    await cdp.waitFor('document.querySelectorAll("#ks-system .ks-wifi-network").length>=2', 8000, 'Wi-Fi networks listed');
    flows.wifi = await cdp.evaluate('(function(){var b=Array.prototype.filter.call(document.querySelectorAll("#ks-system .ks-wifi-network"),function(n){return /Livebox-7A2C/.test(n.textContent);})[0];if(!b)return null;b.click();var s=window.cncWifiSettings.state(),k=document.querySelector("#ks-system .ks-wifi-keys");return {state:s,title:document.querySelector("#ks-system .ks-wifi-form-title").textContent,keys:k?k.querySelectorAll("button").length:0};})()');
    if (!flows.wifi || !flows.wifi.state.formOpen || !flows.wifi.state.keyboard || flows.wifi.keys < 30) failures.push(tag + ': Wi-Fi form or keyboard not opened (' + JSON.stringify(flows.wifi) + ')');
    await sleep(300);
    await settingsCaptures(cdp, dir, 'system-wifi-keyboard', 'Système · Wi-Fi clavier', results);
    await cdp.evaluate('(function(){var b=document.querySelector("#ks-system .ks-wifi-actions .ks-secondary:not(.ks-wifi-forget)");b.click();return true;})()');
    const closed = await cdp.evaluate('window.cncWifiSettings.state().formOpen');
    if (closed) failures.push(tag + ': the Wi-Fi form stayed open after « Annuler »');
    // First tap only: the Tablette command, then the install.
    const idle = await cdp.evaluate('(function(){var b=document.querySelector("#ks-system .ks-updates-install");return b?{bg:getComputedStyle(b).backgroundColor,disabled:b.disabled}:null;})()');
    flows.tablet = await cdp.evaluate('(function(){var b=document.querySelector("#ks-system .ks-tablet-action");if(!b||b.disabled)return null;b.scrollIntoView({block:"center"});b.click();var s=window.cncTabletActions.state();return {armed:s.armed,state:b.getAttribute("data-state"),label:b.textContent,prefix:window.cncI18n.t("Confirmer : ")};})()');
    if (!flows.tablet || !flows.tablet.armed || flows.tablet.state !== 'armed' || flows.tablet.label.indexOf(flows.tablet.prefix) !== 0) failures.push(tag + ': Tablette command not armed by a first tap (' + JSON.stringify(flows.tablet) + ')');
    flows.install = await cdp.evaluate('(function(){var b=document.querySelector("#ks-system .ks-updates-install");if(!b||b.disabled)return null;b.scrollIntoView({block:"center"});b.click();var s=window.cncSystemUpdates.state();return {armed:s.armed,state:b.getAttribute("data-state"),label:b.textContent,expected:window.cncI18n.t("Confirmer : installer les mises à jour"),bg:getComputedStyle(b).backgroundColor};})()');
    if (!idle || idle.disabled || !flows.install || !flows.install.armed || flows.install.state !== 'armed' || flows.install.label !== flows.install.expected) failures.push(tag + ': update install not armed by a first tap (' + JSON.stringify({ idle, install: flows.install }) + ')');
    else if (flows.install.bg === idle.bg) failures.push(tag + ': the armed install looks like the idle one (' + idle.bg + ')');
    await sleep(200);
    await cdp.evaluate('(function(){var t=document.querySelector("#ks-system .ks-tablet");if(t)t.scrollIntoView({block:"start"});document.querySelector("main").scrollTop-=90;return true;})()');
    await sleep(200);
    await screenshot(cdp, path.join(dir, 'system-armed.png'));
    await settingsTab(cdp, 'display');
    flows.left = await cdp.evaluate('({tablet:window.cncTabletActions.state().armed,install:window.cncSystemUpdates.state().armed})');
    if (flows.left.tablet || flows.left.install) failures.push(tag + ': still armed after leaving Système (' + JSON.stringify(flows.left) + ')');
  } catch (e) { failures.push(tag + ' flows: ' + e.message); log('FAIL ' + tag + ' flows: ' + e.message); }
}
// Simulation page with a job running: Système refuses Wi-Fi, updates and Tablette commands, with the reason shown.
async function settingsDuringJob(cdp, lang, simUrl, summary, out) {
  const v = { page: 'sim', w: 1366, h: 768, lang, size: 'standard', theme: 'dark', kind: 'laser' };
  const tag = 'settings 1366x768 sim ' + lang + ' job running', dirName = tag.replace(/[^A-Za-z0-9]+/g, '-'), dir = path.join(OUT, dirName), results = [], info = { tag, lang };
  fs.mkdirSync(dir, { recursive: true });
  try {
    await settingsOpen(cdp, simUrl, v, tag);
    await goScreen(cdp, 'files');
    await cdp.evaluate('document.querySelector(".library-file").click();true');
    await cdp.waitFor('(function(){var b=document.getElementById("job-load");return !!b&&!b.disabled;})()', 15000, 'load enabled');
    await cdp.evaluate('document.getElementById("job-load").click();true');
    await cdp.waitFor('(function(){var m=window.cncState.get().machine;return !!(m&&m.name);})()', 15000, 'loaded');
    await goScreen(cdp, 'home');
    await cdp.waitFor('(function(){var b=document.getElementById("home-job-start");return !!b&&!b.disabled;})()', 15000, 'Démarrer enabled');
    await cdp.evaluate('document.getElementById("home-job-start").click();true');
    await cdp.waitFor('!document.getElementById("job-dialog").hidden', 15000, 'dialog');
    await cdp.evaluate('(function(){var c=document.getElementById("job-check");c.checked=true;c.dispatchEvent(new Event("change",{bubbles:true}));document.getElementById("job-confirm").click();return true;})()');
    await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="running"', 15000, 'running');
    await goScreen(cdp, 'settings');
    await settingsTab(cdp, 'system');
    await sleep(1000);
    // Taps on the refused controls: nothing is sent, nothing is armed.
    await cdp.evaluate('(function(){["#ks-system .ks-wifi-scan","#ks-system .ks-updates-install","#ks-system .ks-tablet-action"].forEach(function(s){var b=document.querySelector(s);if(b)b.click();});return true;})()');
    const st = info.refusal = await cdp.evaluate('(function(){var t=function(s){var n=document.querySelector(s);return n?n.textContent:null;},d=function(s){return Array.prototype.every.call(document.querySelectorAll(s),function(b){return b.disabled;})&&document.querySelectorAll(s).length>0;};' +
      'return {wifi:t("#ks-system .ks-wifi [role=status]"),updates:t("#ks-system .ks-updates [role=status]"),tablet:t("#ks-system .ks-tablet [role=status]"),wifiDisabled:d("#ks-system .ks-wifi-scan, #ks-system .ks-wifi-hidden"),updatesDisabled:d("#ks-system .ks-updates-check, #ks-system .ks-updates-install"),tabletDisabled:d("#ks-system .ks-tablet-action"),' +
      'armed:{tablet:window.cncTabletActions.state().armed,install:window.cncSystemUpdates.state().armed},expected:{wifi:window.cncI18n.t("Travail en cours : réseau Wi-Fi non modifiable."),updates:window.cncI18n.t("Travail en cours : mise à jour impossible."),tablet:window.cncI18n.t("Indisponible pendant un travail en cours ou en pause.")}};})()');
    ['wifi', 'updates', 'tablet'].forEach((k) => {
      if (st[k] !== st.expected[k]) failures.push(tag + ': ' + k + ' reason « ' + st[k] + ' » instead of « ' + st.expected[k] + ' »');
      if (!st[k + 'Disabled']) failures.push(tag + ': ' + k + ' commands enabled during a job');
    });
    if (st.armed.tablet || st.armed.install) failures.push(tag + ': armed during a job (' + JSON.stringify(st.armed) + ')');
    await settingsCaptures(cdp, dir, 'system', 'Système · travail en cours', results);
    await settingsRequests(cdp, tag, info);
    await cdp.evaluate('document.getElementById("home-job-stop").click();true');
    await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="idle"', 15000, 'idle after stop');
    log(tag + ': Wi-Fi « ' + st.wifi + ' », updates « ' + st.updates + ' », Tablette « ' + st.tablet + ' »');
  } catch (e) { failures.push(tag + ': ' + e.message); log('FAIL ' + tag + ': ' + e.message); }
  summary.measurements.push({ variant: tag, dir: dirName, dpr: 1, results, strict: true, overlap: true });
  out.variants.push(info);
}
async function settingsMeasure(cdp, realUrl, simUrl, summary) {
  const out = { variants: [] }, errorsAt = pageErrors.length;
  const trap = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SETTINGS_TRAP });
  try {
    const variants = [];
    for (const lang of ['fr', 'es']) for (const size of ['standard', 'large']) for (const theme of ['dark', 'light']) variants.push({ page: 'sim', w: 1366, h: 768, lang, size, theme, kind: 'laser', flows: true });
    // The real page (Mise en service card), and the Pro 3 size in v1 Éco (v2 CNC: v2SettingsPass).
    variants.push({ page: 'real', w: 1366, h: 768, lang: 'fr', size: 'standard', theme: 'dark' }, { page: 'real', w: 1366, h: 911, lang: 'es', size: 'standard', theme: 'dark' });
    for (const v of variants) await settingsVariant(cdp, v, realUrl, simUrl, summary, out);
    for (const lang of ['fr', 'es']) await settingsDuringJob(cdp, lang, simUrl, summary, out);
  } catch (e) { failures.push('settings: ' + (e.stack || e.message)); log('FAIL settings: ' + e.message); }
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: trap.identifier }).catch(() => {});
  await cdp.evaluate('["cncjs-touch-language-v1","cncjs-touch-display-v1","cncjs-touch-sim-kind-v1"].forEach(function(k){localStorage.removeItem(k);});true').catch(() => {});
  // The stream probe of the real page (/api/custom/health) is refused by the default fixture by design (no
  // --replay): the page falls back to polling. Any other exception fails the phase.
  out.pageErrors = pageErrors.slice(errorsAt).filter((e) => !/Unexpected request in visual fixture: \/api\/custom\/health/.test(e));
  if (out.pageErrors.length) failures.push('settings: page exceptions: ' + out.pageErrors.slice(0, 3).join(' | ').slice(0, 600));
  fs.writeFileSync(path.join(OUT, 'settings.json'), JSON.stringify(out, null, 1));
  summary.settings = (summary.settings || []).concat(out.variants.map((v) => ({ tag: v.tag, placement: v.placement, limits: v.limits, apply: v.apply, sticky: v.sticky, flows: v.flows, refusal: v.refusal, requests: (v.requests || []).length })));
}
// The same walk on the v2 page at 1366 x 911 (CNC), FR and ES, standard and large text, dark and light: the v2 cards
// on the Machine tab at rest (§8.3), enforced as v2 measurements.
async function v2SettingsPass(cdp, fx, summary) {
  const out = [];
  const trap = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SETTINGS_TRAP });
  for (const lang of ['fr', 'es']) for (const [size, theme] of [['standard', 'dark'], ['large', 'dark'], ['standard', 'light']]) {
    const tag = 'v2 settings 1366x911 ' + lang + ' ' + size + ' ' + theme, dirName = tag.replace(/[^A-Za-z0-9]+/g, '-'), dir = path.join(OUT, dirName), results = [], info = { tag, lang, viewport: [1366, 911], tabs: {} };
    fs.mkdirSync(dir, { recursive: true });
    fx.setPhase('idle'); pageErrors.length = 0;
    try {
      await setViewport(cdp, 1366, 911, 1);
      await v2Storage(cdp, fx.base, {});
      await settingsStorage(cdp, { lang, size, theme });
      await v2Open(cdp, fx.base + 'index.html?v2-settings=' + encodeURIComponent(dirName), true);
      await goScreen(cdp, 'settings');
      await settingsWalk(cdp, tag, dir, results, info, { labels: SETTINGS_LABELS });
      const m = info.tabs.machine;
      if (!m.perfV2 || m.need.v2 === null || m.need.quality === null) failures.push(tag + ': v2 cards not shown on the Machine tab at rest (' + JSON.stringify(m.need) + ')');
      ['#ks-v2-card', '#perf-v2-settings'].forEach((k) => { if (info.placement[k] && info.placement[k] !== 'machine') failures.push(tag + ': ' + k + ' on « ' + info.placement[k] + ' », expected the Machine tab'); });
      await settingsRequests(cdp, tag, info);
      if (pageErrors.length) failures.push(tag + ': page exceptions: ' + pageErrors.slice(0, 3).join(' | ').slice(0, 600));
      log(tag + ': ' + results.length + ' captures, v2 card at ' + m.need.v2 + ' px of scroll on Machine');
    } catch (e) { failures.push(tag + ': ' + e.message); log('FAIL ' + tag + ': ' + e.message); }
    summary.measurements.push({ variant: tag, dir: dirName, dpr: 1, results, strict: true, v2: true });
    out.push(info);
  }
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: trap.identifier }).catch(() => {});
  fs.writeFileSync(path.join(OUT, 'settings-v2.json'), JSON.stringify(out, null, 1));
  summary.settings = (summary.settings || []).concat(out.map((v) => ({ tag: v.tag, placement: v.placement, limits: [].concat(...SETTINGS_TABS.map((t) => Object.keys((v.tabs[t] && v.tabs[t].need) || {}).map((k) => ({ tab: t, control: k, need: v.tabs[t].need[k] })))), sticky: v.sticky, requests: (v.requests || []).length })));
  return out.map((v) => v.tag);
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
      for (const t of r.unreachable || []) if (!((r.scrolls || t.scroller) && t.offscreen)) add(Object.assign({ check: 'covered', label: t.label, detail: 'centre ' + (t.offscreen ? 'clipped' : 'covered') + ' by ' + t.hit }, base));
      for (const t of r.below || []) add(Object.assign({ check: 'size', label: t.label, detail: t.kind + ' ' + t.w + ' x ' + t.h + ' px, goal ' + t.goal }, base));
      for (const t of r.textFit || []) {
        if (t.out > 1) add(Object.assign({ check: 'text-overflow', label: t.label, detail: 'text ' + t.out + ' px outside its control' }, base));
        if (t.broken && t.broken.length) add(Object.assign({ check: 'word-break', label: t.label, detail: 'word cut across lines: ' + t.broken.join(', ') }, base));
      }
      // Lot Machine (M15f): Machine fits its window in every screens-* variant and state, large text and alarm included.
      if (r.screen === 'machine' && /^screens /.test(m.variant) && r.scrolls) add(Object.assign({ check: 'machine-scroll', label: r.label, detail: 'Machine scrolls (data-fit-overflow)' }, base));
      if (r.railScroll) add(Object.assign({ check: 'rail-scroll', label: 'rail', detail: 'rail scrolls horizontally (' + r.railScroll + ')' }, base));
      // Journal rows (screensCapture): no row drawn over the next one; the v1 page fits its box.
      if (r.journal) {
        for (const [id, list] of [['#real-history-list', r.journal.v1], ['#v2k-list', r.journal.v2]]) {
          if (list && list.bad.length) add(Object.assign({ check: 'journal-pitch', label: id, detail: list.bad.length + ' row(s) closer than their height, first: row ' + list.bad[0].row + ' at ' + list.bad[0].pitch + ' px for ' + list.bad[0].height + ' px' }, base));
        }
        if (r.journal.v1 && r.journal.v1.scrollHeight > r.journal.v1.clientHeight + 1) add(Object.assign({ check: 'journal-scroll', label: '#real-history-list', detail: 'page of ' + r.journal.v1.rows + ' rows scrolls inside its box (' + r.journal.v1.scrollHeight + ' > ' + r.journal.v1.clientHeight + ')' }, base));
      }
      // Performance v2 views (lot L7): no overflow, no text drawn over other text.
      if (m.v2 || m.overlap) {
        if (r.overflow && (r.overflow.document || r.overflow.active)) add(Object.assign({ check: 'overflow-x', label: r.label, detail: 'horizontal overflow (' + r.overflow.documentScrollWidth + ' > ' + r.overflow.clientWidth + ')' }, base));
        if (r.vertical && r.vertical.active && !r.scrolls) add(Object.assign({ check: 'overflow-y', label: r.label, detail: 'screen taller than its box and not scrolling' }, base));
        for (const o of r.overlapsText || []) add(Object.assign({ check: 'overlap', label: o.a + ' / ' + o.b, detail: 'text over text, ' + o.w + ' x ' + o.h + ' px' }, base));
      }
      const seen = new Set();
      for (const t of (r.textTargets || []).concat(r.small || [])) { const label = t.label || t.text; if (seen.has(label)) continue; seen.add(label); add(Object.assign({ check: 'text', label, detail: t.fontPx + ' px, goal ' + GOALS.text }, base)); }
    }
  }
  for (const f of summary.jobFile || []) if (f.w < Math.min(FILE_COLUMN_MIN, f.need)) add({ check: 'file-column', variant: f.variant, screen: 'strip', screenLabel: 'Bandeau', label: '#t-file', detail: '« ' + f.text + ' » drawn on ' + f.w + ' px of ' + f.need + ', goal ' + FILE_COLUMN_MIN });
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
  if (summary.jobFile && summary.jobFile.length) {
    L.push('## Strip « Fichier » column, real page with a job running');
    L.push('');
    L.push('| Variant | File | Drawn px | Needed px |');
    L.push('| --- | --- | ---: | ---: |');
    summary.jobFile.forEach((f) => L.push('| ' + f.variant + ' | ' + String(f.text).replace(/\|/g, '\\|') + ' | ' + f.w + ' | ' + f.need + ' |'));
    L.push('');
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
  if (summary.settings && summary.settings.length) {
    L.push('## Réglages (`settings.json`, `settings-v2.json`, `settings-*/`, `v2-settings-*/`)');
    L.push('');
    L.push('Scroll in px needed to see the bottom of each control from the top of its tab (— not shown). Goals, enforced at 1366 x 768 Éco laser, standard text: ' + Object.keys(SETTINGS_LIMITS).map((k) => k + ' ≤ ' + SETTINGS_LIMITS[k]).join(', ') + '. System requests: all seen while Système was shown.');
    L.push('');
    L.push('| Variant | Affichage | Machine | Système | System requests |');
    L.push('| --- | --- | --- | --- | ---: |');
    const cell = (s, tab) => (s.limits || []).filter((l) => l.tab === tab).map((l) => l.control + ' ' + (l.need === null ? '—' : l.need)).join(', ');
    summary.settings.forEach((s) => L.push('| ' + s.tag + ' | ' + cell(s, 'display') + ' | ' + cell(s, 'machine') + ' | ' + cell(s, 'system') + ' | ' + s.requests + ' |'));
    L.push('');
  }
  if (summary.v2) {
    const v = summary.v2;
    L.push('## Performance v2 (`v2.json`, `v2-*/`)');
    L.push('');
    L.push('Opened from outside the page: preference, Performance profile and simulated machine kind written in storage, GPU probe answered « hardware » by an init script (SwiftShader underneath). Hit tests of the strip commands: ' + v.hits + '.');
    L.push('');
    L.push('| Pass | Non-GET API requests | Page exceptions |');
    L.push('| --- | ---: | ---: |');
    v.passes.forEach((p) => L.push('| ' + p.ctx + ' | ' + p.commands + ' | ' + p.pageErrors + ' |'));
    L.push('');
    if (v.closed) { L.push('| Where v2 must stay closed | v2 requests | perf-v2 | Same page as without the preference |'); L.push('| --- | ---: | --- | --- |'); v.closed.forEach((c) => L.push('| ' + c.label + ' | ' + c.requests.length + ' | ' + c.perfV2 + ' | ' + (c.sameAsWithoutPreference ? JSON.stringify(c.sameAsWithoutPreference) : '—') + ' |')); L.push(''); }
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
    if (ONLY.includes('sim')) { await simMeasure(cdp, simUrl, summary); if (!URL_BASE) { await alarmMeasure(cdp, summary); await jobFileMeasure(cdp, summary); } }
    // Réglages: the three tabs, their flows and refusals, on the fixture only (every API answered locally).
    if (ONLY.includes('settings') && !URL_BASE) await settingsMeasure(cdp, realUrl, simUrl, summary);
    // Pause / Arrêter over every overlay, degraded start-up, offline flag (browser-strip.cjs).
    if (ONLY.includes('strip') && !URL_BASE) { await setViewport(cdp, 1366, 768, 1); const list = await require('./browser-strip.cjs').run(cdp, module.exports, { simBase: base, out: path.join(OUT, 'strip'), log }); list.forEach((f) => failures.push(f)); summary.strip = list; }
    if (ONLY.includes('startup')) { await setViewport(cdp, 1366, 768, 1); await measureStartup(cdp, realUrl, summary); }
    if (ONLY.includes('e2e')) { await setViewport(cdp, 1366, 768, 1); for (const lang of ['fr', 'en', 'es']) await e2e(cdp, simUrl, lang, summary); await cdp.evaluate('localStorage.removeItem("cncjs-touch-language-v1");true').catch(() => {}); }
    // Performance v2 in its own browser (software WebGL flags, simulated hardware probe), on its fixture.
    if (ONLY.includes('v2') && !URL_BASE) await v2Measure(summary);
    // Every screen in every machine state, on the same fixture (design/PROMPT-ECRANS-MULTIAGENT.md, phase 0).
    if (ONLY.includes('screens') && !URL_BASE) await screensMeasure(summary);
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
