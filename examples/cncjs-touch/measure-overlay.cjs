#!/usr/bin/env node
'use strict';
// Audit 31 rendered checks (U1, U3, U5, U6) in a headless Chrome, same fixture and
// DevTools client as browser-run.cjs (its client is not exported, so the few
// helpers are copied here):
//   overlay  the notice and the system-command line live in the strip's message cell:
//            showing them moves no control, changes no scale, covers no control of the
//            strip (state, Pause / Arrêter, lock) nor of the active screen (job running
//            and paused, five screens, both resolutions, longest Spanish texts, both
//            messages at once); the notice stays readable beside the system line; the
//            full text opened by a tap never covers Pause / Arrêter nor Suivi's
//            Démarrer / Pause / Arrêter (what it covers is listed: it closes on the next tap);
//   real     the real page: the true #notice appearing changes neither main's top,
//            --view-height, the screen scale nor the position of Arrêter;
//   sheet    the guided preparation sheet in Spanish (longest texts, warning and ready
//            states) fits the viewport, 48 px boxes and buttons, ticks forgotten on a new
//            zero / revision, context kept when closed;
//   pad      the shared numeric pad fits, keys >= 48 px, Valider 64 px, "0.5" written
//            with input + change;
//   compact  1024 x 600, French and Spanish: 12 px between Charger la sélection and
//            Démarrer, Préparer's coordinates heading not cut; Suivi with a job running and
//            -600.000 on every axis: coordinate values against their units, the preview
//            note over the image (>= 16 px, <= 3 lines), the strip's file vital.
// Usage: node measure-overlay.cjs [--out DIR] [--only overlay,real,sheet,pad,compact]
// Writes DIR/overlay.json and screenshots; exit 1 on a hard failure.
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn, execSync } = require('child_process');
const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const OUT = path.resolve(arg('--out', 'output/measure-overlay'));
const ONLY = arg('--only', 'overlay,real,sheet,pad,compact').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(new Date().toISOString().slice(11, 19) + ' ' + m);
const failures = [], notes = [];

function findBrowser() {
  const given = process.env.CNC_BROWSER;
  const candidates = given ? [given] : ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  for (const c of ['google-chrome', 'chromium', 'chromium-browser']) { try { const f = execSync((process.platform === 'win32' ? 'where ' : 'command -v ') + c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\r?\n/)[0].trim(); if (f) return f; } catch (_) { /* next */ } }
  throw new Error('No Chrome/Edge found: set CNC_BROWSER');
}
function getJson(url) { return new Promise((resolve, reject) => { http.get(url, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } }); }).on('error', reject); }); }
class CDP {
  constructor(url) { this.url = url; this.seq = 0; this.pending = new Map(); this.listeners = new Map(); }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url); this.ws = ws;
      ws.addEventListener('open', () => resolve()); ws.addEventListener('error', (e) => reject(new Error('WebSocket error ' + (e.message || ''))));
      ws.addEventListener('message', (e) => { const msg = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString()); if (msg.id && this.pending.has(msg.id)) { const p = this.pending.get(msg.id); this.pending.delete(msg.id); if (msg.error) p.reject(new Error(msg.error.message + ' (' + p.method + ')')); else p.resolve(msg.result || {}); } else if (msg.method) (this.listeners.get(msg.method) || []).forEach((fn) => fn(msg.params)); });
    });
  }
  send(method, params, timeoutMs) { return new Promise((resolve, reject) => { const id = ++this.seq; this.pending.set(id, { resolve, reject, method }); this.ws.send(JSON.stringify({ id, method, params: params || {} })); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, timeoutMs || 60000); }); }
  on(method, fn) { if (!this.listeners.has(method)) this.listeners.set(method, []); this.listeners.get(method).push(fn); }
  once(method, timeoutMs) { return new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('timeout waiting ' + method)), timeoutMs || 30000); this.on(method, (p) => { clearTimeout(t); resolve(p); }); }); }
  async evaluate(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page exception: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 400)); return r.result.value; }
  async waitFor(expression, ms, label) { const until = Date.now() + ms; for (;;) { let v = null; try { v = await this.evaluate(expression); } catch (_) { v = null; } if (v) return v; if (Date.now() > until) throw new Error('timeout: ' + (label || expression)); await sleep(150); } }
  close() { try { this.ws.close(); } catch (_) { /* ignore */ } }
}
async function launchBrowser() {
  const exe = findBrowser(), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cnc-measure-overlay-'));
  const flags = ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--window-size=1366,768', '--force-device-scale-factor=1', '--disable-extensions', '--disable-background-networking', '--disable-sync', '--lang=fr-FR', 'about:blank'];
  const child = spawn(exe, flags, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let stderr = ''; child.stderr.on('data', (d) => { stderr += d; });
  const portFile = path.join(profile, 'DevToolsActivePort'), until = Date.now() + 30000;
  while (!fs.existsSync(portFile) || !fs.readFileSync(portFile, 'utf8').trim()) { if (child.exitCode !== null) throw new Error('browser exited: ' + stderr.slice(-500)); if (Date.now() > until) throw new Error('no DevToolsActivePort'); await sleep(100); }
  const port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]);
  let targets = []; for (let i = 0; i < 50 && !targets.some((t) => t.type === 'page'); i++) { targets = await getJson('http://127.0.0.1:' + port + '/json/list'); if (!targets.some((t) => t.type === 'page')) await sleep(100); }
  const page = targets.find((t) => t.type === 'page'); const cdp = new CDP(page.webSocketDebuggerUrl); await cdp.connect();
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  const version = await getJson('http://127.0.0.1:' + port + '/json/version');
  return { child, profile, cdp, version: version.Browser };
}
function startFixture() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'preview-server.cjs')], { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = ''; child.stdout.on('data', (d) => { out += d; const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\//); if (m) resolve({ child, base: 'http://127.0.0.1:' + m[1] + '/' }); });
    child.stderr.on('data', (d) => { out += d; }); child.on('exit', (code) => reject(new Error('preview-server exited (' + code + '): ' + out.slice(-500))));
    setTimeout(() => reject(new Error('preview-server did not start: ' + out.slice(-500))), 20000);
  });
}
async function setViewport(cdp, width, height) { await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height }); }
async function navigate(cdp, url) { const loaded = cdp.once('Page.loadEventFired', 60000); await cdp.send('Page.navigate', { url }); await loaded; }
async function waitReady(cdp) { await cdp.waitFor('!!(window.cncShell&&document.body.classList.contains("ks-ui")&&!document.documentElement.classList.contains("cnc-loading"))', 40000, 'touch shell ready'); }
async function goScreen(cdp, name) {
  await cdp.evaluate('window.cncShell.go(' + JSON.stringify(name) + ');true');
  await cdp.waitFor('(function(){var s=document.getElementById("screen-' + name + '");return !!(s&&s.classList.contains("active")&&!s._fitHidden&&getComputedStyle(s).visibility!=="hidden");})()', 15000, 'screen ' + name);
  if (name === 'files') { try { await cdp.waitFor('document.querySelectorAll(".library-file").length>0', 15000, 'file list'); } catch (_) { /* fixture without files */ } }
  await sleep(600); await frames(cdp);
}
async function frames(cdp) { await cdp.evaluate('new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r);});})'); }
async function screenshot(cdp, name) { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }, 60000); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64')); }
// Simulation page: select and load the first file, optionally start the job (confirmed).
async function loadSimulationJob(cdp, simUrl, lang, w, start) {
  await navigate(cdp, simUrl); await cdp.evaluate('localStorage.setItem("cncjs-touch-language-v1",' + JSON.stringify(lang) + ');true');
  await navigate(cdp, simUrl + '?xv=' + lang + w); try { await waitReady(cdp); } catch (_) { await navigate(cdp, simUrl + '?xv=' + lang + w + 'b'); await waitReady(cdp); }
  await goScreen(cdp, 'files');
  await cdp.evaluate('document.querySelector(".library-file").click();true');
  await cdp.waitFor('(function(){var b=document.getElementById("job-load");return !!b&&!b.disabled;})()', 15000, 'load enabled');
  await cdp.evaluate('document.getElementById("job-load").click();true');
  await cdp.waitFor('(function(){var m=window.cncState.get().machine;return !!(m&&m.name);})()', 15000, 'loaded');
  await goScreen(cdp, 'home');
  if (!start) return;
  await cdp.evaluate('document.getElementById("home-job-start").click();true');
  await cdp.waitFor('!document.getElementById("job-dialog").hidden', 15000, 'dialog');
  await cdp.evaluate('(function(){var c=document.getElementById("job-check");c.checked=true;c.dispatchEvent(new Event("change",{bubbles:true}));document.getElementById("job-confirm").click();return true;})()');
  await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="running"', 15000, 'running');
  await sleep(1500); await frames(cdp);
}

// Longest Spanish texts the notice and the system line can carry (i18n-messages.js rows).
const NOTICE_ES = 'Seguimiento continuo interrumpido. Lectura de respaldo; espere el restablecimiento antes de cargar o confirmar. Flujo sin datos o retenido. Estado no disponible; consulta alternativa cada 10 s.';
const SYSTEM_ES = 'Comando del sistema en curso: Actualizar la interfaz táctil y reiniciar la tableta después de la descarga (ficticio)';

// In-page: geometry of the overlays against the commands and the active screen.
const GEOMETRY = String(function geometry(ids) {
  function rect(el) { var r = el.getBoundingClientRect(); return { x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; }
  function shown(el) { if (!el) return false; for (var n = el; n && n !== document.body; n = n.parentElement) { if (n.hidden) return false; var cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.contentVisibility === 'hidden') return false; } var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function intersects(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  var main = document.querySelector('main'), active = document.querySelector('main .screen.active');
  var out = { mainTop: main.style.top, viewHeight: document.documentElement.style.getPropertyValue('--view-height'), transform: active ? getComputedStyle(active).transform : null, screen: active ? active.id : null, controls: {}, overlays: {}, covered: [] };
  ['notice', 't-system-command', 'xv-system-line', 't-messages-more'].forEach(function (id) { var el = document.getElementById(id); if (shown(el)) out.overlays[id === 'xv-system-line' ? 't-system-command' : id] = rect(el); });
  // The strip's message cell against the strip's own parts (state, actions, right-hand group).
  var cell = document.getElementById('t-messages'), strip = {};
  if (shown(cell)) { out.cell = rect(cell); ['t-state', 't-lock'].forEach(function (id) { var el = document.getElementById(id); if (shown(el)) strip[id] = rect(el); }); ['.t-strip-actions', '.t-strip-right'].forEach(function (sel) { var el = document.querySelector(sel); if (el && shown(el)) strip[sel] = rect(el); }); out.stripHit = Object.keys(strip).filter(function (k) { return strip[k].w > 0 && intersects(out.cell, strip[k]); }); }
  out.fonts = {}; ['notice', 'xv-system-line', 't-system-command'].forEach(function (id) { var el = document.getElementById(id); if (shown(el)) out.fonts[id] = { px: parseFloat(getComputedStyle(el).fontSize), lines: Math.round(el.clientHeight / parseFloat(getComputedStyle(el).lineHeight)), clipped: el.scrollHeight > el.clientHeight + 1 }; });
  ids.forEach(function (id) {
    var el = document.getElementById(id); if (!shown(el)) { out.controls[id] = null; return; }
    var r = rect(el), hit = document.elementFromPoint(r.x + r.w / 2, r.y + r.h / 2);
    var reach = !!hit && (hit === el || el.contains(hit));
    var under = Object.keys(out.overlays).filter(function (k) { return intersects(r, out.overlays[k]); });
    out.controls[id] = { rect: r, reachable: reach, hit: hit ? (hit.id || hit.className || hit.tagName) : 'nothing', disabled: !!el.disabled, overlapped: under };
  });
  if (active) Array.prototype.forEach.call(active.querySelectorAll('button, a[href], input, select'), function (el) {
    if (!shown(el)) return; var r = rect(el);
    Object.keys(out.overlays).forEach(function (k) { if (intersects(r, out.overlays[k])) out.covered.push({ overlay: k, label: (el.textContent || el.getAttribute('aria-label') || el.id || '').replace(/\s+/g, ' ').trim().slice(0, 40), id: el.id || null, rect: r }); });
  });
  return out;
});
const SHOW_OVERLAYS = String(function show(notice, system) {
  var n = document.getElementById('notice'), cell = document.getElementById('t-messages');
  // simulation.html has no #notice: one is made and adopted by the strip like index.html's.
  if (!n) { n = document.createElement('div'); n.id = 'notice'; n.hidden = true; document.body.insertBefore(n, document.querySelector('main')); }
  n.textContent = notice; n.hidden = !notice;
  // job-controls.js rewrites #t-system-command every second from the snapshot (hidden without a
  // host command), so the line's geometry is measured on a twin carrying the same class, in the
  // same cell, after the notice.
  var s = document.getElementById('xv-system-line');
  if (!s) { s = document.createElement('p'); s.id = 'xv-system-line'; s.className = 't-system-command'; s.setAttribute('role', 'status'); s.hidden = true; (cell || document.body).appendChild(s); }
  s.textContent = system; s.hidden = !system;
  if (window.cncStatusStrip && window.cncStatusStrip.syncMessages) window.cncStatusStrip.syncMessages();
  return !!cell;
});
function same(a, b) { return a && b && Math.abs(a.x - b.x) < 0.6 && Math.abs(a.y - b.y) < 0.6 && Math.abs(a.w - b.w) < 0.6 && Math.abs(a.h - b.h) < 0.6; }

// Messages in the strip: nothing moves, nothing under them; the notice readable beside the system
// line; the opened full text never over the protected commands (what else it covers is noted).
function messageChecks(tag, ids, before, both, noticeOnly, opened) {
  for (const [name, g] of [['both', both], ['notice only', noticeOnly]]) {
    if (!g.cell) { failures.push(tag + ' ' + name + ': no message cell shown in the strip'); continue; }
    if (g.stripHit && g.stripHit.length) failures.push(tag + ' ' + name + ': the message cell overlaps ' + g.stripHit.join(', '));
    if (g.covered.length) failures.push(tag + ' ' + name + ': controls under the messages: ' + g.covered.map((c) => c.label + ' [' + c.overlay + ']').join(', '));
    Object.keys(g.fonts).forEach((id) => { const f = g.fonts[id]; if (f.px < 15.5) failures.push(tag + ' ' + name + ': ' + id + ' at ' + f.px + ' px'); if (f.lines < 1) failures.push(tag + ' ' + name + ': ' + id + ' shows no full line'); });
    if (g.cell && g.cell.y + g.cell.h > before.mainTop.replace('px', '') * 1 + 0.5) failures.push(tag + ' ' + name + ': the message cell leaves the strip ' + JSON.stringify(g.cell));
  }
  if (both.overlays.notice && both.overlays['t-system-command']) { const a = both.overlays.notice, b = both.overlays['t-system-command']; if (a.y < b.y + b.h && a.y + a.h > b.y) failures.push(tag + ': the system line lies over the notice'); }
  const panel = opened.overlays['t-messages-more'];
  if (!panel) failures.push(tag + ': a tap on the message cell opened no full text');
  else {
    ['t-pause', 't-stop', 'home-job-start', 'home-job-pause', 'home-job-stop', 'home-job-resume'].forEach((id) => { const c = opened.controls[id]; if (c && c.overlapped.indexOf('t-messages-more') >= 0) failures.push(tag + ': the opened full text covers ' + id); });
    const under = opened.covered.filter((c) => c.overlay === 't-messages-more');
    if (under.length) notes.push(tag + ': under the opened full text (until the next tap): ' + under.map((c) => c.label).join(', '));
  }
}
async function overlaysOnSimulation(cdp, simUrl, w, h, report) {
  const tag = 'sim ' + w + 'x' + h;
  await setViewport(cdp, w, h);
  await loadSimulationJob(cdp, simUrl, 'es', w, true);
  const ids = ['t-pause', 't-stop', 'home-job-start', 'home-job-pause', 'home-job-stop', 'home-job-resume', 'home-job-load'];
  const states = { running: {}, paused: {} };
  for (const state of ['running', 'paused']) {
    if (state === 'paused') { await cdp.evaluate('document.getElementById("t-pause").click();true'); await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="paused"', 15000, 'paused'); await sleep(1200); await frames(cdp); }
    for (const screen of ['home', 'jog', 'machine', 'files', 'history']) {
      await goScreen(cdp, screen);
      const before = await cdp.evaluate('(' + GEOMETRY + ')(' + JSON.stringify(ids) + ')');
      await cdp.evaluate('(' + SHOW_OVERLAYS + ')(' + JSON.stringify(NOTICE_ES) + ',' + JSON.stringify(SYSTEM_ES) + ')');
      await sleep(1300); await frames(cdp);
      const both = await cdp.evaluate('(' + GEOMETRY + ')(' + JSON.stringify(ids) + ')');
      if (screen === 'home') await screenshot(cdp, 'overlay-' + w + 'x' + h + '-' + state + '-home.png');
      // The full text, opened by a tap on the cell.
      await cdp.evaluate('window.cncStatusStrip.toggleMessages();true'); await frames(cdp);
      const opened = await cdp.evaluate('(' + GEOMETRY + ')(' + JSON.stringify(ids) + ')');
      if (screen === 'home') await screenshot(cdp, 'overlay-' + w + 'x' + h + '-' + state + '-home-open.png');
      await cdp.evaluate('window.cncStatusStrip.toggleMessages();true'); await frames(cdp);
      await cdp.evaluate('(' + SHOW_OVERLAYS + ')(' + JSON.stringify(NOTICE_ES) + ',"")'); await frames(cdp);
      const noticeOnly = await cdp.evaluate('(' + GEOMETRY + ')(' + JSON.stringify(ids) + ')');
      await cdp.evaluate('(' + SHOW_OVERLAYS + ')("","")'); await sleep(300); await frames(cdp);
      const after = await cdp.evaluate('(' + GEOMETRY + ')(' + JSON.stringify(ids) + ')');
      states[state][screen] = { before, both, opened, noticeOnly, after };
      messageChecks(tag + ' ' + state + ' ' + screen, ids, before, both, noticeOnly, opened);
      if (before.mainTop !== both.mainTop || before.viewHeight !== both.viewHeight || before.transform !== both.transform) failures.push(tag + ' ' + state + ' ' + screen + ': layout changed under the overlay (' + before.mainTop + '/' + both.mainTop + ', ' + before.viewHeight + '/' + both.viewHeight + ', ' + before.transform + '/' + both.transform + ')');
      ids.forEach((id) => { const a = before.controls[id], b = both.controls[id]; if (a && b && !same(a.rect, b.rect)) failures.push(tag + ' ' + state + ' ' + screen + ': ' + id + ' moved ' + JSON.stringify(a.rect) + ' -> ' + JSON.stringify(b.rect)); });
      ids.forEach((id) => { const b = both.controls[id] || noticeOnly.controls[id]; if (!b) return; if (b.overlapped.length) failures.push(tag + ' ' + state + ' ' + screen + ': ' + id + ' lies under ' + b.overlapped.join('+')); if (!b.reachable && !b.disabled) failures.push(tag + ' ' + state + ' ' + screen + ': ' + id + ' centre hits ' + b.hit); });
      ['t-pause', 't-stop', 'home-job-stop', 'home-job-start', 'home-job-pause', 'home-job-resume'].forEach((id) => { const c = before.controls[id]; if (c && c.rect.h < 63.5) failures.push(tag + ' ' + state + ' ' + screen + ': ' + id + ' is ' + c.rect.h + ' px high'); });
      log(tag + ' ' + state + ' ' + screen + ': cell ' + JSON.stringify(both.cell) + ', notice ' + (both.overlays.notice ? both.overlays.notice.h + ' px ' + JSON.stringify(both.fonts.notice) : '—') + ', system line ' + (both.overlays['t-system-command'] ? both.overlays['t-system-command'].h + ' px ' + JSON.stringify(both.fonts['xv-system-line']) : '—') + ', covered ' + both.covered.length + ', open panel ' + JSON.stringify(opened.overlays['t-messages-more'] || null) + ' covers ' + opened.covered.filter((c) => c.overlay === 't-messages-more').length + ', t-stop ' + (before.controls['t-stop'] ? before.controls['t-stop'].rect.h : '—') + ' px, t-pause ' + (before.controls['t-pause'] ? before.controls['t-pause'].rect.h : '—') + ' px');
    }
  }
  await cdp.evaluate('document.getElementById("home-job-stop").click();true'); await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="idle"', 15000, 'idle');
  report[tag] = states;
}

async function realNotice(cdp, realUrl, w, h, report) {
  const tag = 'real ' + w + 'x' + h;
  await setViewport(cdp, w, h);
  await navigate(cdp, realUrl); await waitReady(cdp); await sleep(2500);
  await goScreen(cdp, 'home');
  const ids = ['home-job-stop', 'home-job-start', 'home-job-pause', 't-stop', 't-pause', 't-unlock'];
  const before = await cdp.evaluate('(' + GEOMETRY + ')(' + JSON.stringify(ids) + ')');
  await cdp.evaluate('(function(){var n=document.getElementById("notice");n.textContent=' + JSON.stringify(NOTICE_ES) + ';n.hidden=false;return true;})()');
  await sleep(1500); await frames(cdp);
  // app.js rewrites the notice from the store (the fixture's own reason): the longest text again.
  await cdp.evaluate('(function(){var n=document.getElementById("notice");n.textContent=' + JSON.stringify(NOTICE_ES) + ';n.hidden=false;return true;})()'); await frames(cdp); await frames(cdp);
  const shown = await cdp.evaluate('(' + GEOMETRY + ')(' + JSON.stringify(ids) + ')');
  await screenshot(cdp, 'overlay-real-' + w + 'x' + h + '-notice.png');
  const perScreen = {};
  for (const screen of ['jog', 'machine', 'files', 'history', 'menu']) { await goScreen(cdp, screen); await cdp.evaluate('(function(){var n=document.getElementById("notice");n.textContent=' + JSON.stringify(NOTICE_ES) + ';n.hidden=false;return true;})()'); await frames(cdp); perScreen[screen] = await cdp.evaluate('(' + GEOMETRY + ')(' + JSON.stringify(ids) + ')'); if (perScreen[screen].covered.length) failures.push(tag + ' ' + screen + ': controls under the notice: ' + perScreen[screen].covered.map((c) => c.label).join(', ')); }
  await goScreen(cdp, 'home');
  await cdp.evaluate('(function(){var n=document.getElementById("notice");n.textContent="";n.hidden=true;return true;})()'); await sleep(1500); await frames(cdp);
  const after = await cdp.evaluate('(' + GEOMETRY + ')(' + JSON.stringify(ids) + ')');
  if (before.mainTop !== shown.mainTop || before.viewHeight !== shown.viewHeight || before.transform !== shown.transform) failures.push(tag + ': the real notice changed the layout (' + before.mainTop + '/' + shown.mainTop + ', ' + before.viewHeight + '/' + shown.viewHeight + ', ' + before.transform + '/' + shown.transform + ')');
  ids.forEach((id) => { const a = before.controls[id], b = shown.controls[id]; if (a && b && !same(a.rect, b.rect)) failures.push(tag + ': ' + id + ' moved when the notice appeared'); if (b && b.overlapped.length) failures.push(tag + ': ' + id + ' under the notice'); });
  if (shown.covered.length) failures.push(tag + ' home: controls under the notice: ' + shown.covered.map((c) => c.label).join(', '));
  if (!shown.cell || (shown.stripHit && shown.stripHit.length)) failures.push(tag + ': the notice is not in the strip cell or overlaps ' + (shown.stripHit || []).join(', '));
  log(tag + ': notice ' + (shown.overlays.notice ? shown.overlays.notice.h + ' px high' : 'not shown') + ', main top ' + before.mainTop + ' -> ' + shown.mainTop + ', scale ' + before.transform + ' -> ' + shown.transform + ', covered on Suivi: ' + shown.covered.length + ', cell ' + JSON.stringify(shown.cell) + ' ' + JSON.stringify(shown.fonts));
  report[tag] = { before, shown, after, perScreen };
}

// In-page: the preparation sheet's card against the viewport, its boxes and buttons.
const SHEET = String(function sheet() {
  var card = document.querySelector('#ks-preparation .ks-sheet-card'), vh = window.innerHeight, vw = window.innerWidth;
  if (!card) return { error: 'no sheet' };
  var r = card.getBoundingClientRect();
  function box(sel) { var el = document.querySelector(sel); if (!el) return null; var b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), hidden: el.hidden }; }
  var truncated = [], small = [];
  Array.prototype.forEach.call(card.querySelectorAll('*'), function (el) {
    var cs = getComputedStyle(el); if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible' && el.clientWidth > 2) truncated.push(((el.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 50));
    var own = Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 3 && n.data.trim(); }).length; if (own) { var size = parseFloat(cs.fontSize); if (size < 15.5) small.push(((el.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 40) + '@' + size); }
  });
  return { card: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, fits: r.top >= 0 && r.bottom <= vh + 0.5 && r.left >= 0 && r.right <= vw + 0.5, scrolls: card.scrollHeight > card.clientHeight + 1, contentHeight: card.scrollHeight, viewport: { w: vw, h: vh },
    checks: { tool: box('#ks-prep-tool'), load: box('#ks-prep-load'), close: box('#ks-preparation header button') }, labels: Array.prototype.map.call(card.querySelectorAll('.ks-prep-check'), function (l) { var b = l.getBoundingClientRect(); return { h: Math.round(b.height), w: Math.round(b.width) }; }),
    steps: Array.prototype.map.call(card.querySelectorAll('.ks-prep-step'), function (li) { return { id: li.getAttribute('data-step'), state: li.getAttribute('data-state'), text: (li.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160) }; }), footer: (document.getElementById('ks-prep-footer') || {}).textContent, truncated: truncated, small: small };
});
const MACHINE = { port: '/dev/fixture', type: 'Grbl', generation: 'g1', revision: 'r1', name: 'Pieza_de_prueba_con_un_nombre_de_archivo_muy_largo_para_la_hoja_de_preparacion.gcode', originalName: 'Pieza de prueba con un nombre de archivo muy largo para la hoja de preparación.gcode', fresh: true, statusAgeMs: 0, activeState: 'Idle', workflow: 'idle', canLoad: true, canStart: true, canResume: false, canPause: false, canStop: false, coordinates: { mpos: { x: -100.123, y: -50.5, z: -10 }, wpos: { x: 0, y: 0, z: 0 } }, operator: { wcs: 'G54', reportUnits: 'mm' }, settings: { $22: '0' }, zeroZ: { thickness: 10.5, wcs: 'G54', machineZ: -35 } };
function status(machine) { return 'window.dispatchEvent(new CustomEvent("cnc-job-status",{detail:{machine:' + JSON.stringify(machine) + ',simulation:false,transportConnected:true,observedAt:Date.now(),busy:false,feedback:""}}));'; }
async function preparationSheet(cdp, realUrl, w, h, report) {
  const tag = 'sheet es ' + w + 'x' + h;
  await setViewport(cdp, w, h);
  await navigate(cdp, realUrl); await cdp.evaluate('localStorage.setItem("cncjs-touch-language-v1","es");true');
  await navigate(cdp, realUrl + '?xv-sheet=' + w); await waitReady(cdp); await sleep(1500);
  const lang = await cdp.evaluate('window.cncI18n&&window.cncI18n.language'); if (lang !== 'es') failures.push(tag + ': page language ' + lang);
  await goScreen(cdp, 'files');
  // The fixture's own snapshots (alarm, no file) would overwrite the synthetic ones: stop job-controls first.
  // (The visual fixture's XMLHttpRequest stand-in has no abort(): dispose() throws after it has
  // already cleared its interval and marked itself disposed, which is all that is needed here.)
  await cdp.evaluate('(function(){try{window.cncJobControls.dispose();}catch(e){}return true;})()'); await sleep(300);
  // Synthetic snapshot and selection: the longest texts (warning on the file, homing off).
  await cdp.evaluate('(function(){window.dispatchEvent(new CustomEvent("cnc-library-select",{detail:{file:"Otra_pieza_seleccionada_pero_no_cargada_con_nombre_largo.gcode",name:"Otra pieza seleccionada pero no cargada con nombre largo.gcode"}}));' + status(MACHINE) + 'return true;})()');
  await cdp.evaluate('document.getElementById("ks-preparation-open").click();true');
  await cdp.waitFor('!document.getElementById("ks-preparation").hidden', 5000, 'sheet open'); await sleep(400); await frames(cdp);
  const warn = await cdp.evaluate('(' + SHEET + ')()');
  await screenshot(cdp, 'sheet-es-' + w + 'x' + h + '-warn.png');
  // Same program selected, both boxes ticked: the "ready" texts.
  await cdp.evaluate('(function(){window.dispatchEvent(new CustomEvent("cnc-library-select",{detail:{file:' + JSON.stringify(MACHINE.name) + ',name:' + JSON.stringify(MACHINE.originalName) + '}}));var t=document.getElementById("ks-prep-tool"),o=document.getElementById("ks-prep-origin");t.checked=true;t.dispatchEvent(new Event("change"));o.checked=true;o.dispatchEvent(new Event("change"));return true;})()');
  await sleep(300); await frames(cdp);
  const ready = await cdp.evaluate('(' + SHEET + ')()');
  await screenshot(cdp, 'sheet-es-' + w + 'x' + h + '-ready.png');
  await cdp.evaluate('document.documentElement.setAttribute("data-theme","light");true'); await frames(cdp);
  await screenshot(cdp, 'sheet-es-' + w + 'x' + h + '-ready-light.png');
  await cdp.evaluate('document.documentElement.removeAttribute("data-theme");true');
  // A new work zero (mpos moved, wpos unchanged) forgets the origin box; a new revision forgets both.
  const moved = JSON.parse(JSON.stringify(MACHINE)); moved.coordinates.mpos.z = -12;
  const ticks1 = await cdp.evaluate('(function(){' + status(moved) + 'return window.cncJobPreparation.ticks();})()');
  const revised = JSON.parse(JSON.stringify(moved)); revised.revision = 'r2';
  const ticks2 = await cdp.evaluate('(function(){' + status(revised) + 'return window.cncJobPreparation.ticks();})()');
  await cdp.evaluate('window.cncShell.closeSheet();true'); await frames(cdp);
  const back = await cdp.evaluate('(function(){return {screen:document.querySelector("main .screen.active").id,selection:window.cncLibrarySelection&&window.cncLibrarySelection.file,sheetHidden:document.getElementById("ks-preparation").hidden};})()');
  for (const [name, s] of [['warn', warn], ['ready', ready]]) {
    if (s.error) { failures.push(tag + ' ' + name + ': ' + s.error); continue; }
    if (!s.fits) failures.push(tag + ' ' + name + ': the sheet card leaves the viewport ' + JSON.stringify(s.card) + ' in ' + JSON.stringify(s.viewport));
    if (s.scrolls) notes.push(tag + ' ' + name + ': the sheet scrolls inside its card (content ' + s.contentHeight + ' px for a card of ' + s.card.h + ' px)');
    if (s.truncated.length) failures.push(tag + ' ' + name + ': truncated text ' + s.truncated.join(' | '));
    if (s.small.length) failures.push(tag + ' ' + name + ': text under 16 px ' + s.small.join(' | '));
    s.labels.forEach((l, i) => { if (l.h < 47.5) failures.push(tag + ' ' + name + ': check label ' + i + ' is ' + l.h + ' px'); });
    if (s.checks.tool && s.checks.tool.h < 47.5) failures.push(tag + ' ' + name + ': checkbox ' + s.checks.tool.h + ' px');
    if (s.checks.load && !s.checks.load.hidden && s.checks.load.h < 47.5) failures.push(tag + ' ' + name + ': load button ' + s.checks.load.h + ' px');
    if (s.checks.close && s.checks.close.h < 47.5) failures.push(tag + ' ' + name + ': close button ' + s.checks.close.h + ' px');
    log(tag + ' ' + name + ': card ' + s.card.w + 'x' + s.card.h + ' at y ' + s.card.y + ' in ' + s.viewport.h + ', fits ' + s.fits + ', content ' + s.contentHeight + ' px, truncated ' + s.truncated.length + ', small ' + s.small.length + ', boxes ' + JSON.stringify(s.labels) + ', states ' + s.steps.map((x) => x.id + ':' + x.state).join(' ') + ', footer "' + s.footer + '"');
  }
  if (ready.steps && !(ready.steps[4] && ready.steps[4].state === 'ok')) failures.push(tag + ': both boxes ticked on the loaded program should give a ready step: ' + ready.steps.map((x) => x.id + ':' + x.state).join(' '));
  if (!(ticks1.tool === true && ticks1.origin === false)) failures.push(tag + ': a new work zero should forget the origin box only: ' + JSON.stringify(ticks1));
  if (ticks2.tool || ticks2.origin) failures.push(tag + ': a new revision should forget both boxes: ' + JSON.stringify(ticks2));
  if (back.screen !== 'screen-files' || !back.sheetHidden || !back.selection) failures.push(tag + ': closing the sheet lost the context ' + JSON.stringify(back));
  log(tag + ': ticks after new zero ' + JSON.stringify(ticks1) + ', after new revision ' + JSON.stringify(ticks2) + ', back to ' + back.screen + ' with selection ' + back.selection);
  report[tag] = { warn, ready, ticks1, ticks2, back };
}

const PAD = String(function pad() {
  var modal = document.getElementById('t-numpad'), card = modal && modal.querySelector('.t-numpad-card'), vh = window.innerHeight;
  if (!card) return { error: 'no pad' };
  var r = card.getBoundingClientRect();
  var keys = Array.prototype.map.call(card.querySelectorAll('[data-numpad-key]'), function (b) { var k = b.getBoundingClientRect(); return { key: b.getAttribute('data-numpad-key'), w: Math.round(k.width), h: Math.round(k.height) }; });
  function btn(text) { var b = Array.prototype.find.call(card.querySelectorAll('button'), function (x) { return x.textContent.trim() === text; }); if (!b) return null; var k = b.getBoundingClientRect(); return { w: Math.round(k.width), h: Math.round(k.height) }; }
  return { card: { y: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) }, fits: r.top >= 0 && r.bottom <= vh + 0.5, scrolls: card.scrollHeight > card.clientHeight + 1, keys: keys, ok: btn(window.cncI18n.t('Valider')), cancel: btn(window.cncI18n.t('Annuler')), close: btn(window.cncI18n.t('Fermer ×')), title: document.getElementById('t-numpad-title').textContent, bounds: card.querySelector('.t-numpad-bounds').textContent, message: document.getElementById('t-numpad-error').textContent, display: document.getElementById('t-numpad-display').textContent, inert: document.querySelector('main').inert };
});
async function numericPad(cdp, w, h, report) {
  const tag = 'pad es ' + w + 'x' + h;
  // The fixture hides the plate block (#home-plate): focus cannot return to a hidden field, so the
  // focus check only applies when the field is rendered (test-numeric-pad.cjs covers it in a DOM).
  await setViewport(cdp, w, h); await sleep(500); await frames(cdp);
  const open = await cdp.evaluate('(function(){var i=document.getElementById("home-plate-thickness");if(!i)return "no field";i.value="";window.CNCNumeric.open(i,{label:window.cncI18n.t("Épaisseur de la plaque"),unit:"mm",min:0.01,max:50,negative:false});return window.CNCNumeric.opened();})()');
  if (open !== true) { failures.push(tag + ': pad did not open (' + open + ')'); return; }
  await frames(cdp);
  const empty = await cdp.evaluate('(function(){document.querySelector("#t-numpad .t-btn--primary").click();return (' + PAD + ')();})()');
  await screenshot(cdp, 'pad-es-' + w + 'x' + h + '.png');
  const typed = await cdp.evaluate('(function(){["0",".","5"].forEach(function(k){document.querySelector("#t-numpad [data-numpad-key=\\""+k+"\\"]").click();});var i=document.getElementById("home-plate-thickness"),events=[];i.addEventListener("input",function(){events.push("input");});i.addEventListener("change",function(){events.push("change");});document.querySelector("#t-numpad .t-btn--primary").click();return {value:i.value,events:events,opened:window.CNCNumeric.opened(),mainInert:document.querySelector("main").inert,active:document.activeElement&&document.activeElement.id,focusable:i.getClientRects().length>0};})()');
  if (empty.error) { failures.push(tag + ': ' + empty.error); return; }
  if (!empty.fits) failures.push(tag + ': the pad card leaves the viewport ' + JSON.stringify(empty.card) + ' in ' + h);
  empty.keys.forEach((k) => { if (k.h < 47.5) failures.push(tag + ': key ' + k.key + ' is ' + k.h + ' px'); });
  if (!empty.ok || empty.ok.h < 63.5) failures.push(tag + ': Valider is ' + JSON.stringify(empty.ok) + ' (primary 64 px expected)');
  if (!empty.cancel || empty.cancel.h < 47.5) failures.push(tag + ': Annuler is ' + JSON.stringify(empty.cancel));
  if (!empty.close || empty.close.h < 47.5) failures.push(tag + ': Fermer is ' + JSON.stringify(empty.close));
  if (!/./.test(empty.message) || empty.display.trim() !== '') failures.push(tag + ': Valider on an empty draft should explain and keep the pad open: message "' + empty.message + '"');
  if (!empty.inert) failures.push(tag + ': main is not inert under the pad');
  if (typed.value !== '0.5' || typed.events.join(',') !== 'input,change' || typed.opened || typed.mainInert || (typed.focusable && typed.active !== 'home-plate-thickness')) failures.push(tag + ': after Valider ' + JSON.stringify(typed));
  log(tag + ': card ' + empty.card.w + 'x' + empty.card.h + ' at y ' + empty.card.y + ', fits ' + empty.fits + ', keys ' + Math.min(...empty.keys.map((k) => k.h)) + '–' + Math.max(...empty.keys.map((k) => k.h)) + ' px, Valider ' + JSON.stringify(empty.ok) + ', Annuler ' + JSON.stringify(empty.cancel) + ', title "' + empty.title + '", bounds "' + empty.bounds + '", empty -> "' + empty.message + '", typed -> ' + JSON.stringify(typed));
  report[tag] = { empty, typed };
}

// In-page: compact Suivi, the coordinate rows (value vs unit), the preview status column, the strip's file vital.
const COMPACT = String(function compact() {
  function rect(el) { var r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }
  function overlap(a, b) { return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)); }
  var rows = [];
  Array.prototype.forEach.call(document.querySelectorAll('#screen-home .t-coords-card'), function (card) {
    if (card.hidden || getComputedStyle(card).display === 'none') return;
    var vals = card.querySelectorAll('.t-val'), units = card.querySelectorAll('.t-unit'), axes = card.querySelectorAll('.t-axis'), items = [];
    for (var i = 0; i < vals.length; i++) {
      var v = rect(vals[i]), u = units[i] ? rect(units[i]) : null, next = axes[i + 1] ? rect(axes[i + 1]) : null;
      items.push({ text: vals[i].textContent, value: v, overflow: vals[i].scrollWidth > vals[i].clientWidth + 1, unitOverlap: u ? overlap(v, u) : 0, nextAxisOverlap: next ? overlap(v, next) : 0, unitOverlapsNext: u && next ? overlap(u, next) : 0 });
    }
    rows.push({ card: card.id, title: (card.querySelector('h2') || {}).textContent, width: rect(card).w, items: items });
  });
  var status = document.getElementById('home-image-status'), img = document.getElementById('home-job-image'), art = document.querySelector('#screen-home .job-art'), st = null;
  if (status && !status.hidden) { var r = rect(status), fs = parseFloat(getComputedStyle(status).fontSize); st = { text: status.textContent.slice(0, 60), width: r.w, height: r.h, fontPx: fs, lines: Math.round(r.h / (fs * 1.35)), words: status.textContent.trim().split(/\s+/).length, img: img && !img.hidden ? rect(img) : null, art: art ? rect(art) : null }; }
  var file = document.querySelector('.t-vital--file'), strip = null;
  if (file) { var label = file.querySelector('span'), value = file.querySelector('b'); strip = { vital: rect(file), labelClipped: file.scrollWidth > file.clientWidth + 1 || (label && label.scrollWidth > file.clientWidth + 1), labelText: label && label.textContent, valueText: value && value.textContent, valueClipped: value && value.scrollWidth > value.clientWidth + 1, labelFontPx: label ? parseFloat(getComputedStyle(label).fontSize) : null }; }
  return { compact: document.body.classList.contains('t-compact'), rows: rows, status: st, strip: strip, viewport: { w: window.innerWidth, h: window.innerHeight } };
});
// Préparer's coordinates heading (units and frame) and the gap under Charger la sélection.
const LOADED = String(function loaded() {
  function rect(el) { var r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top * 10) / 10, w: Math.round(r.width), h: Math.round(r.height * 10) / 10 }; }
  var load = document.getElementById('home-job-load'), start = document.getElementById('home-job-start'), active = document.querySelector('main .screen.active'), out = { transform: active ? getComputedStyle(active).transform : null };
  if (load && !load.hidden && start && !start.hidden) { var l = rect(load), st = rect(start); out.gap = Math.round((st.y - (l.y + l.h)) * 10) / 10; out.load = l; out.start = st; out.loadText = load.textContent; }
  return out;
});
const HEADING = String(function heading() {
  var h = document.querySelector('#screen-jog .ks-motion-coordinates>h2'); if (!h) return null;
  var active = document.querySelector('main .screen.active');
  return { transform: active ? getComputedStyle(active).transform : null, text: h.textContent, clipped: h.scrollWidth > h.clientWidth + 1 || h.scrollHeight > h.clientHeight + 1, height: Math.round(h.getBoundingClientRect().height * 10) / 10, width: h.clientWidth, needed: h.scrollWidth, fontPx: parseFloat(getComputedStyle(h).fontSize) };
});
async function compactSuivi(cdp, simUrl, report) {
  const tag0 = 'compact 1024x600';
  await setViewport(cdp, 1024, 600);
  for (const lang of ['fr', 'es']) {
    const tag = tag0 + ' ' + lang;
    await loadSimulationJob(cdp, simUrl, lang, 1024, false);
    const loaded = await cdp.evaluate('(' + LOADED + ')()');
    if (!(loaded.gap >= 11.5)) failures.push(tag + ': ' + (loaded.gap === undefined ? 'Charger / Démarrer not both shown' : 'only ' + loaded.gap + ' px between "' + loaded.loadText + '" and Démarrer'));
    await screenshot(cdp, 'compact-1024x600-' + lang + '-loaded.png');
    await goScreen(cdp, 'jog');
    const head = await cdp.evaluate('(' + HEADING + ')()');
    if (!head || head.clipped || head.height < 15 || head.fontPx < 15.5) failures.push(tag + ': Préparer coordinates heading ' + JSON.stringify(head));
    await screenshot(cdp, 'compact-1024x600-' + lang + '-jog.png');
    log(tag + ': Charger -> Démarrer ' + JSON.stringify(loaded) + ', Préparer heading ' + JSON.stringify(head));
    await goScreen(cdp, 'home');
    await cdp.evaluate('document.getElementById("home-job-start").click();true');
    await cdp.waitFor('!document.getElementById("job-dialog").hidden', 15000, 'dialog');
    await cdp.evaluate('(function(){var c=document.getElementById("job-check");c.checked=true;c.dispatchEvent(new Event("change",{bubbles:true}));document.getElementById("job-confirm").click();return true;})()');
    await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="running"', 15000, 'running');
    await sleep(1500); await frames(cdp);
    const running = await cdp.evaluate('(' + COMPACT + ')()');
    await screenshot(cdp, 'compact-1024x600-' + lang + '-running.png');
    // Worst realistic values: -600.000 on every axis (the real fixture reports mpos -600 on X and Y),
    // and the longest preview note.
    await cdp.evaluate('(function(){document.querySelectorAll("#screen-home .t-coords-card .t-val").forEach(function(b){b.textContent="-600.000";});var s=document.getElementById("home-image-status");if(s&&!s.hidden)s.textContent=window.cncI18n.t("Aperçu non vérifié par le serveur : régénérez-le depuis le PC.");return true;})()'); await frames(cdp);
    const wide = await cdp.evaluate('(' + COMPACT + ')()');
    await screenshot(cdp, 'compact-1024x600-' + lang + '-wide-values.png');
    // Other sheets at 600 px high: the old touch-shell rule sets their paragraphs to 14 px.
    const sheetFont = await cdp.evaluate('(function(){var s=document.getElementById("ks-origin-help-sheet")||document.querySelector(".ks-sheet");if(!s)return null;s.hidden=false;var p=s.querySelector(".ks-sheet-content p")||s.querySelector("p"),size=p?parseFloat(getComputedStyle(p).fontSize):null;s.hidden=true;return {id:s.id,fontPx:size,text:p?p.textContent.slice(0,40):null};})()');
    if (!running.compact) failures.push(tag + ': body is not compact at 1024x600');
    for (const [name, d] of [['running', running], ['wide values', wide]]) {
      d.rows.forEach((row) => row.items.forEach((it) => { if (it.overflow || it.unitOverlap > 0 || it.nextAxisOverlap > 0 || it.unitOverlapsNext > 0) failures.push(tag + ' ' + name + ' ' + row.card + ': value "' + it.text + '" overflows its cell ' + it.overflow + ', overlaps its unit by ' + it.unitOverlap + ' px, the next axis by ' + it.nextAxisOverlap + ' px (unit/next axis ' + it.unitOverlapsNext + ' px)'); }));
      if (d.status && d.status.width < 120 && d.status.lines > d.status.words) failures.push(tag + ' ' + name + ': #home-image-status is ' + d.status.width + ' px wide, ' + d.status.lines + ' lines for ' + d.status.words + ' words ("' + d.status.text + '")');
      if (d.status && d.status.art && (d.status.fontPx < 15.5 || d.status.lines > 3 || d.status.width < 200)) failures.push(tag + ' ' + name + ': preview note ' + JSON.stringify(d.status));
      log(tag + ' ' + name + ': rows ' + JSON.stringify(d.rows.map((r) => ({ card: r.card, w: r.width, items: r.items.map((i) => i.text + ':' + (i.overflow ? 'OVERFLOW' : 'ok') + '/unit+' + i.unitOverlap + '/next+' + i.nextAxisOverlap) }))) + ', status ' + JSON.stringify(d.status) + ', strip file ' + JSON.stringify(d.strip));
    }
    if (running.strip && (running.strip.labelClipped || running.strip.valueClipped)) notes.push(tag + ': the strip file vital is clipped while the job runs (label "' + running.strip.labelText + '" ' + running.strip.labelFontPx + ' px, value "' + running.strip.valueText + '", box ' + running.strip.vital.w + ' px wide)');
    if (sheetFont && sheetFont.fontPx && sheetFont.fontPx < 15.5) notes.push(tag + ': paragraphs of the other sheets (' + sheetFont.id + ') render at ' + sheetFont.fontPx + ' px under 650 px of height (touch-shell.css @media rule, outside the compact block)');
    await cdp.evaluate('document.getElementById("home-job-stop").click();true'); await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="idle"', 15000, 'idle');
    // The real page's heading is the longest ("Coordonnées du contrôleur · mm · G54").
    const realUrl = simUrl.replace('simulation.html', 'index.html');
    await navigate(cdp, realUrl + '?xv-head=' + lang); await waitReady(cdp); await goScreen(cdp, 'jog');
    const realHead = await cdp.evaluate('(' + HEADING + ')()');
    if (!realHead || realHead.clipped || realHead.height < 15 || realHead.fontPx < 15.5) failures.push(tag + ': real Préparer coordinates heading ' + JSON.stringify(realHead));
    await screenshot(cdp, 'compact-1024x600-' + lang + '-real-jog.png');
    log(tag + ': real Préparer heading ' + JSON.stringify(realHead));
    report[tag] = { loaded, head, realHead, running, wide, sheetFont };
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const fixture = await startFixture(); log('fixture ' + fixture.base);
  const browser = await launchBrowser(); log('browser ' + browser.version);
  const cdp = browser.cdp, report = { date: new Date().toISOString(), browser: browser.version, only: ONLY };
  const realUrl = fixture.base + 'index.html', simUrl = fixture.base + 'simulation.html';
  try {
    if (ONLY.includes('overlay')) for (const [w, h] of [[1366, 768], [1024, 600]]) { try { await overlaysOnSimulation(cdp, simUrl, w, h, report); } catch (e) { failures.push('sim ' + w + 'x' + h + ': ' + e.message); log('FAIL sim ' + w + 'x' + h + ': ' + e.message); } }
    if (ONLY.includes('real')) for (const [w, h] of [[1366, 768], [1024, 600]]) { try { await realNotice(cdp, realUrl, w, h, report); } catch (e) { failures.push('real ' + w + 'x' + h + ': ' + e.message); log('FAIL real ' + w + 'x' + h + ': ' + e.message); } }
    for (const [w, h] of [[1024, 600], [1366, 768]]) { try { if (ONLY.includes('sheet')) await preparationSheet(cdp, realUrl, w, h, report); if (ONLY.includes('pad')) { if (!ONLY.includes('sheet')) { await setViewport(cdp, w, h); await navigate(cdp, realUrl); await waitReady(cdp); } await numericPad(cdp, w, h, report); } } catch (e) { failures.push('sheet/pad ' + w + 'x' + h + ': ' + e.message); log('FAIL sheet/pad ' + w + 'x' + h + ': ' + e.message); } }
    if (ONLY.includes('compact')) { try { await compactSuivi(cdp, simUrl, report); } catch (e) { failures.push('compact: ' + e.message); log('FAIL compact: ' + e.message); } }
    await cdp.evaluate('localStorage.removeItem("cncjs-touch-language-v1");true').catch(() => {});
  } catch (e) { failures.push('harness: ' + e.message); }
  report.failures = failures; report.notes = notes;
  fs.writeFileSync(path.join(OUT, 'overlay.json'), JSON.stringify(report, null, 1));
  cdp.close(); try { browser.child.kill(); } catch (_) { /* gone */ } fixture.child.kill(); await sleep(300);
  try { fs.rmSync(browser.profile, { recursive: true, force: true }); } catch (_) { /* busy */ }
  if (notes.length) console.log('NOTES:\n- ' + notes.join('\n- '));
  if (failures.length) { console.error('FAILED:\n- ' + failures.join('\n- ')); process.exit(1); }
  console.log('PASS measure-overlay: the strip messages move nothing and cover no control (the opened full text never covers Pause/Arrêter/Démarrer), the real notice changes no layout, the preparation sheet and the numeric pad fit at 1024x600 in Spanish, compact Suivi rows do not overlap.');
}
main().catch((e) => { console.error('measure-overlay: ' + (e.stack || e.message)); process.exit(1); });
