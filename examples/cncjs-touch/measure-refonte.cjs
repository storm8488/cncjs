#!/usr/bin/env node
'use strict';
// Baseline (and, rerun unchanged, « after ») measurements of the UI overhaul lot
// (design/PROMPT-REFONTE-UI.md § 6, chantier C), on a development PC only: headless
// Edge/Chrome through the DevTools protocol, a local fixture, never the tablet,
// never a controller. Counters first (requests, bytes, layouts, tasks, packets);
// every duration is given as a median with its range, because other processes may
// load the CPU.
//
//   node examples/cncjs-touch/measure-refonte.cjs --out DIR [--steps startup,job,hidden,stream,dead,cache]
//        [--variants v1,v2] [--repeat 5] [--window 20] [--census 10] [--browser PATH]
//
// Variants (same page, touch/index.html):
//   v1  « v1 Éco » 1366 × 768, profile absent (= eco), v2 preference off, machine declared laser (the Surface RT);
//   v2  « v2 Performance » 1366 × 911, profile performance, v2 preference on, machine declared CNC; the GPU probe
//       answered « hardware » from outside the page and software WebGL flags, exactly as browser-run.cjs does.
// The controller is a fixture: a proxy in front of preview-server.cjs --replay --gzip (gzip like CNCjs's
// compression middleware) answers /api/touch-job and /api/touch-events with a controller at rest (program
// loaded) or running (the deterministic replay, 4.8 snapshots a second). Every non-GET /api/ request is refused.
// Steps:
//   startup  REPEAT cold + warm loads: requests (200 / 304), bytes transferred and decoded per type, shell ready,
//            v2 open, script / style / layout / task time, layout and style-recalc counts, heap, DOM nodes.
//   job      job replayed, REPEAT windows of WINDOW s on Suivi then on Menu (Suivi hidden): task, script, layout,
//            style ms per second, layouts and recalcs per second, long tasks, DOM nodes, heap after GC, stream
//            bytes and chunks per second; one extra profiled window on Suivi (self time per file).
//   hidden   timers, rAF, XHR / fetch and CSS animations counted per call site (file:line of the creator) for
//            CENSUS s on each of the 7 screens at rest, on Menu during the job and during the screen saver.
//   stream   the real touch-stream.js + job-service.js (src/server) over a mock Grbl controller in Node: packets,
//            bytes per packet, CPU of the process, at rest and with a changing report, 1 and 2 clients.
//   dead     static: scripts and style sheets the real page never loads, exported members never referenced,
//            CSS rules whose class / id is referenced nowhere, i18n phrases found in no source.
//   cache    the ?v= suffixes per value and per file, the commit of each suffix against the file's last commit,
//            and the headers a browser receives from the real serve-static + compression stack after a deploy.
// Writes DIR/refonte-<step>.json and DIR/refonte.md. Closes every browser it opened.
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execFileSync } = require('child_process');
const { launchBrowser, startFixture, navigate, waitReady, goScreen, setViewport, sleep, median } = require('./browser-run.cjs');

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback; };
const OUT = path.resolve(option('--out', 'output/refonte'));
const STEPS = option('--steps', 'startup,job,hidden,stream,dead,cache').split(',');
const VARIANTS = option('--variants', 'v1,v2').split(',');
const REPEAT = Math.max(1, Number(option('--repeat', 5)) || 5);
const WINDOW = Math.max(5, Number(option('--window', 20)) || 20);
const CENSUS = Math.max(3, Number(option('--census', 10)) || 10);
const TOUCH = path.join(__dirname, 'touch');
const REPO = path.resolve(__dirname, '..', '..');
const log = (m) => console.log(new Date().toISOString().slice(11, 19) + ' ' + m);
const r1 = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : v);
const range = (list) => { const v = list.filter((x) => typeof x === 'number' && isFinite(x)); return v.length ? { median: r1(median(v)), min: r1(Math.min(...v)), max: r1(Math.max(...v)) } : null; };
const fmtR = (s) => (s ? s.median + ' (' + s.min + '–' + s.max + ')' : '—');
const kB = (b) => (typeof b === 'number' ? (b / 1024).toFixed(1) + ' kB' : '—');
const kBR = (s) => (s ? kB(s.median) + ' (' + kB(s.min) + '–' + kB(s.max) + ')' : '—');

// ---------------------------------------------------------------- fixture (copied from browser-run.cjs startV2Fixture, reduced)
const V2_FLAGS = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'];
const V2_GPU_TRAP = '(function(){var v;try{Object.defineProperty(window,"CNCPreviewGL",{configurable:true,get:function(){return v;},set:function(x){' +
  'if(x&&typeof x.probeGpu==="function"&&!x.__browserRun){var probe=x.probeGpu;x=Object.assign({},x,{__browserRun:true,probeGpu:function(){var r=probe.apply(this,arguments)||{};' +
  'window.__browserRunProbe=r;return Object.assign({},r,{hardware:true,reason:""});}});}v=x;}});}catch(e){}})();';
const KEYS = { profile: 'cncjs-touch-performance-v1', v2: 'cncjs-touch-performance-ui-v2', lang: 'cncjs-touch-language-v1', display: 'cncjs-touch-display-v1' };
const PROFILE = { version: 1, id: 'refonte-cnc', label: 'CNC (mesure refonte)', kind: 'cnc', match: 'exact', signature: 'refonte', portHint: '/dev/replay', laser: { mode: null, sMax: null, sMin: null }, coherent: true, issues: [], canChange: false, changeReason: '', capabilities: {} };
const LASER = Object.assign({}, PROFILE, { id: 'refonte-laser', label: 'Laser (mesure refonte)', kind: 'laser', laser: { mode: true, sMax: 1000, sMin: 0 } });
const FILE = 'Parcours_de_test_1.gcode';

function startControllerFixture() {
  return startFixture(['--replay', '--gzip']).then((upstream) => new Promise((resolve, reject) => {
    const up = new URL(upstream.base);
    const replay = require('./measure-replay-fixture.cjs').create({ file: FILE });
    const fx = { phase: 'idle', profile: PROFILE, refused: [], streamBytes: 0, streamPackets: 0, sequence: 0, epoch: 'refonte-' + Date.now().toString(36), sockets: new Set() };
    fx.controller = () => {
      const c = replay.packet().controllers[0];
      Object.assign(c, { machineProfile: fx.profile, fingerprint: 'sha256:' + 'b7'.repeat(32), overrides: { feed: 100, rapid: 100, spindle: 100 } });
      if (fx.phase === 'idle') {
        Object.assign(c, { activeState: 'Idle', workflow: 'idle', feedrate: 0, spindleSpeed: 0, sent: 0, received: 0, canPause: false, canStop: false, canResume: false, canStart: true, startReason: '', canLoad: true, loadReason: '',
          canPreviewMotion: true, motionReason: '', canOverride: false, canRapidOverride: false, canUnlock: false, canHome: true, homeReason: '', canMacro: false, unlockReason: 'Le déverrouillage ($X) ne sert qu’en alarme.',
          // At rest the report does not move (the real stream then only sends its 1 s heartbeat, see stream()).
          coordinates: { wpos: { x: 10, y: 10, z: 5 }, mpos: { x: -590, y: -590, z: 0 } } });
        if (fx.profile.kind === 'cnc') Object.assign(c, { canZeroZ: true, zeroZReason: '' });
      }
      Object.assign(c, { canBlockProbe: false, blockProbe: null, blockProbeReason: 'Test du contact à faire.' });
      return c;
    };
    fx.packet = () => ({ version: 1, epoch: fx.epoch, sequence: ++fx.sequence, sentAt: Date.now(), controllers: [fx.controller()] });
    function stream(req, res) {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform' });
      const transportId = 'rf-' + Math.random().toString(36).slice(2, 10), opened = Date.now();
      let timer = null, closed = false;
      const stop = () => { closed = true; clearTimeout(timer); fx.sockets.delete(res.socket); };
      fx.sockets.add(res.socket);
      const tick = () => {
        if (closed) return;
        if (Date.now() - opened >= 60000) { res.write(JSON.stringify({ rotate: true }) + '\n'); res.end(); stop(); return; }
        const line = JSON.stringify(Object.assign(fx.packet(), { transportId })) + '\n';
        fx.streamBytes += Buffer.byteLength(line); fx.streamPackets++;
        res.write(line);
        // touch-stream.js drops a snapshot identical to the last one until its 1 s heartbeat: at rest, one a second.
        timer = setTimeout(tick, fx.phase === 'idle' ? 1000 : replay.PERIOD_MS);
      };
      req.on('close', stop); res.on('close', stop); tick();
    }
    function pass(req, res) {
      const headers = Object.assign({}, req.headers, { host: up.host });
      const p = http.request({ host: up.hostname, port: up.port, path: req.url, method: req.method, headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
      p.on('error', (e) => { res.statusCode = 502; res.end(String(e.message)); });
      req.pipe(p);
    }
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname.indexOf('/api/') === 0 && req.method !== 'GET') {
        fx.refused.push(req.method + ' ' + url.pathname); req.resume();
        res.statusCode = 403; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ message: 'Refusé par measure-refonte (aucune commande machine).' }));
      }
      if (url.pathname === '/api/custom/health') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ loaded: true, version: '3.0.0', protocol: 1, transport: 'ndjson' })); }
      if (url.pathname === '/api/touch-job') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(fx.packet())); }
      if (url.pathname === '/api/touch-events') return stream(req, res);
      if (url.pathname === '/visual-fixture.js') {
        // As browser-run.cjs: the deferred v2 catalogue (an XHR of tablet-profile.js) must reach the server.
        return http.get({ host: up.hostname, port: up.port, path: req.url }, (r) => {
          let text = ''; r.setEncoding('utf8'); r.on('data', (d) => { text += d; });
          r.on('end', () => { res.setHeader('Content-Type', 'text/javascript'); res.end(text.replace("if(xhr.url==='/api/touch-motion/preview'", "if(/^i18n-messages-v2\\.js/.test(xhr.url)||xhr.url==='/api/touch-motion/preview'")); });
        }).on('error', (e) => { res.statusCode = 502; res.end(String(e.message)); });
      }
      return pass(req, res);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      fx.base = 'http://127.0.0.1:' + server.address().port + '/';
      fx.close = () => { try { fx.sockets.forEach((s) => s && s.destroy()); server.close(); } catch (_) { /* closed */ } try { upstream.child.kill(); } catch (_) { /* gone */ } };
      resolve(fx);
    });
  }));
}

const VARIANT = {
  v1: { id: 'v1', label: 'v1 Éco 1366 × 768 (laser)', w: 1366, h: 768, v2: false, profile: null, kind: LASER, flags: [] },
  v2: { id: 'v2', label: 'v2 Performance 1366 × 911 (CNC)', w: 1366, h: 911, v2: true, profile: 'performance', kind: PROFILE, flags: V2_FLAGS }
};
// Shell ready (cnc-loading removed) and, for v2, the moment body.perf-v2 and cncV2.state().open are both true.
const READY_PROBE = '(function(){function tick(){var h=document.documentElement,b=document.body;if(!window.__mrShell&&h&&b&&b.classList.contains("ks-ui")&&!h.classList.contains("cnc-loading"))window.__mrShell=performance.now();' +
  'var s=window.cncV2&&window.cncV2.state&&window.cncV2.state();if(!window.__mrV2&&b&&b.classList.contains("perf-v2")&&s&&s.open)window.__mrV2=performance.now();' +
  // v1: stop at the shell (no frame asked afterwards); v2: until v2 is open, 30 s at most.
  'if(!window.__mrShell||(window.__mrWantV2&&!window.__mrV2&&performance.now()<30000))requestAnimationFrame(tick);}tick();})();';
const LONGTASKS = '(function(){var P=window.__mrPerf={long:[],events:0};try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){P.long.push(Math.round(e.duration));});}).observe({entryTypes:["longtask"]});}catch(_){P.noLong=true;}' +
  'window.addEventListener("cnc-job-status",function(){P.events++;});P.reset=function(){P.long=[];P.events=0;};})();';

async function openBrowser(v) {
  const browser = await launchBrowser(v.w, v.h, v.flags);
  const cdp = browser.cdp;
  await setViewport(cdp, v.w, v.h, 1);
  if (v.v2) await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: V2_GPU_TRAP });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: (v.v2 ? 'window.__mrWantV2=true;' : '') + READY_PROBE });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: LONGTASKS });
  return browser;
}
async function closeBrowser(browser) {
  try { await browser.cdp.send('Browser.close', {}, 3000); } catch (_) { /* closed */ }
  browser.cdp.close();
  try { browser.child.kill(); } catch (_) { /* gone */ }
  await sleep(300);
  try { fs.rmSync(browser.profile, { recursive: true, force: true }); } catch (_) { /* busy */ }
}
async function storage(cdp, fx, v) {
  await navigate(cdp, fx.base + 'README.md');
  const set = (k, val) => (val === null ? 'localStorage.removeItem(' + JSON.stringify(k) + ');' : 'localStorage.setItem(' + JSON.stringify(k) + ',' + JSON.stringify(JSON.stringify(val)) + ');');
  await cdp.evaluate(set(KEYS.profile, v.profile ? { version: 1, profile: v.profile } : null) + set(KEYS.v2, { version: 1, enabled: v.v2 }) + set(KEYS.lang, null) + set(KEYS.display, { size: 'standard' }) + 'true');
}
async function openPage(cdp, fx, v, query) {
  await navigate(cdp, fx.base + 'index.html?' + query);
  await waitReady(cdp);
  if (v.v2) await cdp.waitFor('!!window.__mrV2', 30000, 'v2 open');
  else { await sleep(1500); const on = await cdp.evaluate('document.body.classList.contains("perf-v2")'); if (on) throw new Error('v1 variant shows perf-v2'); }
}
function metricsMap(result) { const m = {}; (result.metrics || []).forEach((x) => { m[x.name] = x.value; }); return m; }
const TYPE_OF = String(function typeOf(name, initiator) {
  var ext = (name.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i) || [])[1] || '';
  return /^(js|cjs|mjs)$/.test(ext) ? 'js' : ext === 'css' ? 'css' : /^(png|jpg|svg|ico|webp|woff2?|ttf)$/.test(ext) ? 'other' : initiator === 'xmlhttprequest' || initiator === 'fetch' ? 'xhr' : 'other';
});

// ---------------------------------------------------------------- startup
async function stepStartup(fx, v) {
  const browser = await openBrowser(v), cdp = browser.cdp;
  const requests = new Map();
  cdp.on('Network.requestWillBeSent', (p) => { requests.set(p.requestId, { url: p.request.url, type: p.type }); });
  cdp.on('Network.responseReceived', (p) => { const r = requests.get(p.requestId); if (r) { r.status = p.response.status; r.cache = !!(p.response.fromDiskCache || p.response.fromPrefetchCache || p.response.fromServiceWorker); } });
  cdp.on('Network.loadingFinished', (p) => { const r = requests.get(p.requestId); if (r) r.encoded = p.encodedDataLength; });
  const runs = { cold: [], warm: [] };
  try {
    fx.phase = 'idle'; fx.profile = v.kind;
    await storage(cdp, fx, v);
    await openPage(cdp, fx, v, 'warmup');
    for (let i = 1; i <= REPEAT; i++) {
      for (const cold of [true, false]) {
        if (cold) await cdp.send('Network.clearBrowserCache');
        requests.clear();
        await openPage(cdp, fx, v, 'run=' + (cold ? 'cold' : 'warm') + i);
        await sleep(1500);
        const m = metricsMap(await cdp.send('Performance.getMetrics'));
        const page = await cdp.evaluate('(function(){var typeOf=' + TYPE_OF + ',by={};performance.getEntriesByType("resource").forEach(function(e){var t=typeOf(e.name,e.initiatorType),b=by[t]||(by[t]={n:0,transfer:0,decoded:0});b.n++;b.transfer+=e.transferSize||0;b.decoded+=e.decodedBodySize||0;});' +
          'var nav=performance.getEntriesByType("navigation")[0]||{};return {shell:window.__mrShell||null,v2:window.__mrV2||null,dcl:nav.domContentLoadedEventEnd,load:nav.loadEventEnd,html:{transfer:nav.transferSize,decoded:nav.decodedBodySize},byType:by,domNodes:document.getElementsByTagName("*").length};})()');
        try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) { /* optional */ }
        const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize;
        const list = Array.from(requests.values()).filter((r) => r.url.indexOf('http') === 0 && !/\/api\/touch-events/.test(r.url));
        const st = { 200: 0, 304: 0, cache: 0, other: 0 };
        list.forEach((r) => { if (r.cache) st.cache++; else if (r.status === 200) st[200]++; else if (r.status === 304) st[304]++; else st.other++; });
        const wire = list.reduce((n, r) => n + (r.encoded || 0), 0);
        const run = { cold, shellMs: page.shell, v2OpenMs: page.v2, dclMs: page.dcl, loadMs: page.load, requests: list.length, status: st, wireBytes: wire, byType: page.byType, html: page.html, domNodes: page.domNodes, nodesMetric: m.Nodes, heapAfterGc: heap,
          scriptMs: r1(m.ScriptDuration * 1000), styleMs: r1(m.RecalcStyleDuration * 1000), layoutMs: r1(m.LayoutDuration * 1000), taskMs: r1(m.TaskDuration * 1000), layouts: m.LayoutCount, recalcs: m.RecalcStyleCount, listeners: m.JSEventListeners };
        runs[cold ? 'cold' : 'warm'].push(run);
        log('startup ' + v.id + ' ' + (cold ? 'cold' : 'warm') + ' ' + i + '/' + REPEAT + ': shell ' + r1(page.shell) + ' ms' + (v.v2 ? ', v2 ' + r1(page.v2) + ' ms' : '') + ', ' + list.length + ' req (' + st[200] + '×200, ' + st[304] + '×304), ' + kB(wire) + ' on the wire, layouts ' + m.LayoutCount + ', task ' + run.taskMs + ' ms');
      }
    }
  } finally { await closeBrowser(browser); }
  const sum = (list) => {
    const t = (k, f) => range(list.map((r) => (r.byType[k] ? r.byType[k][f] : 0)));
    return { runs: list.length, shellMs: range(list.map((r) => r.shellMs)), v2OpenMs: range(list.map((r) => r.v2OpenMs)), dclMs: range(list.map((r) => r.dclMs)), loadMs: range(list.map((r) => r.loadMs)),
      requests: range(list.map((r) => r.requests)), s200: range(list.map((r) => r.status[200])), s304: range(list.map((r) => r.status[304])), wireBytes: range(list.map((r) => r.wireBytes)),
      js: { n: t('js', 'n'), transfer: t('js', 'transfer'), decoded: t('js', 'decoded') }, css: { n: t('css', 'n'), transfer: t('css', 'transfer'), decoded: t('css', 'decoded') },
      xhr: { n: t('xhr', 'n'), transfer: t('xhr', 'transfer'), decoded: t('xhr', 'decoded') }, other: { n: t('other', 'n'), transfer: t('other', 'transfer'), decoded: t('other', 'decoded') },
      htmlDecoded: range(list.map((r) => r.html.decoded)), domNodes: range(list.map((r) => r.domNodes)), heapAfterGc: range(list.map((r) => r.heapAfterGc)), listeners: range(list.map((r) => r.listeners)),
      scriptMs: range(list.map((r) => r.scriptMs)), styleMs: range(list.map((r) => r.styleMs)), layoutMs: range(list.map((r) => r.layoutMs)), taskMs: range(list.map((r) => r.taskMs)), layouts: range(list.map((r) => r.layouts)), recalcs: range(list.map((r) => r.recalcs)) };
  };
  return { variant: v.label, browser: browser.version, cold: sum(runs.cold), warm: sum(runs.warm), runs };
}

// ---------------------------------------------------------------- job
function topFiles(profile) {
  const self = new Map(), byId = new Map();
  profile.nodes.forEach((n) => byId.set(n.id, n));
  (profile.samples || []).forEach((id, i) => { self.set(id, (self.get(id) || 0) + ((profile.timeDeltas || [])[i] || 0) / 1000); });
  const files = new Map(), fns = new Map();
  self.forEach((ms, id) => {
    const n = byId.get(id); if (!n) return;
    const f = n.callFrame, url = (f.url || '').replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
    const file = url || '(' + (f.functionName || 'native') + ')';
    files.set(file, (files.get(file) || 0) + ms);
    if (url) { const k = (f.functionName || '(anonymous)') + ' ' + url + ':' + (f.lineNumber + 1); fns.set(k, (fns.get(k) || 0) + ms); }
  });
  const sort = (m, n) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, ms]) => ({ where: k, selfMs: r1(ms) }));
  return { files: sort(files, 15), functions: sort(fns, 15) };
}
async function jobWindow(cdp, fx, seconds, profile, streamCounter) {
  await cdp.evaluate('window.__mrPerf.reset();true');
  try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) { /* optional */ }
  const a = metricsMap(await cdp.send('Performance.getMetrics'));
  const s0 = { bytes: streamCounter.bytes, chunks: streamCounter.chunks, fxBytes: fx.streamBytes, fxPackets: fx.streamPackets };
  if (profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start'); }
  const t0 = Date.now();
  await sleep(seconds * 1000);
  const el = (Date.now() - t0) / 1000;
  let prof = null;
  if (profile) { prof = topFiles((await cdp.send('Profiler.stop')).profile); await cdp.send('Profiler.disable'); }
  const b = metricsMap(await cdp.send('Performance.getMetrics'));
  const page = await cdp.evaluate('({long:window.__mrPerf.long,events:window.__mrPerf.events,elements:document.getElementsByTagName("*").length})');
  try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) { /* optional */ }
  const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  const per = (k) => r1((b[k] - a[k]) / el), ms = (k) => r1((b[k] - a[k]) * 1000 / el);
  return { seconds: r1(el), events: r1(page.events / el), taskMs: ms('TaskDuration'), scriptMs: ms('ScriptDuration'), layoutMs: ms('LayoutDuration'), styleMs: ms('RecalcStyleDuration'), layouts: per('LayoutCount'), recalcs: per('RecalcStyleCount'),
    longTasks: page.long.length, longTaskMax: page.long.length ? Math.max(...page.long) : 0, elements: page.elements, domNodes: b.Nodes, listeners: b.JSEventListeners, heapAfterGc: heap,
    streamBytesPerS: r1((streamCounter.bytes - s0.bytes) / el), streamChunksPerS: r1((streamCounter.chunks - s0.chunks) / el), fixtureBytesPerS: r1((fx.streamBytes - s0.fxBytes) / el), fixturePacketsPerS: r1((fx.streamPackets - s0.fxPackets) / el), profile: prof };
}
async function stepJob(fx, v) {
  const browser = await openBrowser(v), cdp = browser.cdp;
  const streams = new Set(), counter = { bytes: 0, chunks: 0 };
  cdp.on('Network.requestWillBeSent', (p) => { if (/\/api\/touch-events/.test(p.request.url)) streams.add(p.requestId); });
  cdp.on('Network.dataReceived', (p) => { if (streams.has(p.requestId)) { counter.bytes += p.dataLength; counter.chunks++; } });
  const out = { variant: v.label, browser: browser.version, windowSeconds: WINDOW, repeat: REPEAT, screens: {} };
  try {
    fx.phase = 'idle'; fx.profile = v.kind;
    await storage(cdp, fx, v);
    await openPage(cdp, fx, v, 'job');
    await goScreen(cdp, 'home');
    fx.phase = 'running';
    await cdp.waitFor('(function(){var m=window.cncState&&window.cncState.get().machine;return !!(m&&m.workflow==="running"&&m.fresh);})()', 30000, 'replayed job running');
    out.perfV2DuringJob = await cdp.evaluate('document.body.classList.contains("perf-v2")');
    for (const screen of ['home', 'menu']) {
      await goScreen(cdp, screen);
      await sleep(3000);
      const windows = [];
      for (let i = 1; i <= REPEAT; i++) {
        const w = await jobWindow(cdp, fx, WINDOW, false, counter);
        windows.push(w);
        log('job ' + v.id + ' ' + screen + ' ' + i + '/' + REPEAT + ': task ' + w.taskMs + ' ms/s, script ' + w.scriptMs + ', layouts ' + w.layouts + '/s, recalcs ' + w.recalcs + '/s, long ' + w.longTasks + ', nodes ' + w.domNodes + ', heap ' + kB(w.heapAfterGc) + ', stream ' + w.streamBytesPerS + ' B/s');
      }
      const keys = ['events', 'taskMs', 'scriptMs', 'layoutMs', 'styleMs', 'layouts', 'recalcs', 'longTasks', 'longTaskMax', 'elements', 'domNodes', 'listeners', 'heapAfterGc', 'streamBytesPerS', 'streamChunksPerS', 'fixtureBytesPerS', 'fixturePacketsPerS'];
      const summary = {}; keys.forEach((k) => { summary[k] = range(windows.map((w) => w[k])); });
      out.screens[screen] = { summary, windows };
    }
    out.profiles = {};
    for (const screen of ['home', 'menu']) { await goScreen(cdp, screen); await sleep(2000); out.profiles[screen] = (await jobWindow(cdp, fx, WINDOW, true, counter)).profile; }
    out.refused = fx.refused.slice();
  } finally { await closeBrowser(browser); fx.phase = 'idle'; }
  return out;
}

// ---------------------------------------------------------------- hidden (census of timers, polls and animations)
const CENSUS_SCRIPT = String(function census() {
  var C = window.__census = { on: false, sites: {} };
  var nativeST = window.setTimeout, nativeSI = window.setInterval, nativeRAF = window.requestAnimationFrame, NativeXHR = window.XMLHttpRequest, nativeFetch = window.fetch;
  function site() {
    var s = String(new Error().stack || '').split('\n');
    for (var i = 1; i < s.length; i++) {
      if (s[i].indexOf('census-instrument') >= 0 || /^Error/.test(s[i])) continue;
      var m = s[i].match(/(https?:\/\/[^)\s]+?):(\d+):(\d+)/);
      if (m && m[1].indexOf('/visual-fixture.js') < 0) return m[1].replace(location.origin + '/', '').split('?')[0] + ':' + m[2];
      if (m) continue;
    }
    return '(inconnu)';
  }
  function hit(kind, where, extra) {
    if (!C.on) return;
    var k = kind + ' ' + where + (extra ? ' ' + extra : ''), r = C.sites[k] || (C.sites[k] = { kind: kind, site: where, extra: extra || '', fired: 0, delays: {} });
    r.fired++;
    return r;
  }
  window.setTimeout = function (fn, d) {
    var where = site(), args = Array.prototype.slice.call(arguments);
    if (typeof fn === 'function') args[0] = function () { var r = hit('timeout', where); if (r) r.delays[Math.round(+d || 0)] = 1; return fn.apply(this, arguments); };
    return nativeST.apply(window, args);
  };
  window.setInterval = function (fn, d) {
    var where = site(), args = Array.prototype.slice.call(arguments);
    if (typeof fn === 'function') args[0] = function () { var r = hit('interval', where); if (r) r.delays[Math.round(+d || 0)] = 1; return fn.apply(this, arguments); };
    return nativeSI.apply(window, args);
  };
  window.requestAnimationFrame = function (fn) { var where = site(); return nativeRAF.call(window, function (t) { hit('raf', where); return fn(t); }); };
  if (NativeXHR) {
    var open = NativeXHR.prototype.open, send = NativeXHR.prototype.send;
    NativeXHR.prototype.open = function (m, u) { this.__censusUrl = m + ' ' + String(u).replace(location.origin, '').split('?')[0]; return open.apply(this, arguments); };
    NativeXHR.prototype.send = function () { hit('xhr', site(), this.__censusUrl); return send.apply(this, arguments); };
  }
  if (nativeFetch) window.fetch = function (u) { hit('fetch', site(), String(u && u.url || u).replace(location.origin, '').split('?')[0]); return nativeFetch.apply(window, arguments); };
  // DOM mutations per screen: work done for a screen that is not shown.
  C.mut = {};
  try {
    new MutationObserver(function (records) {
      if (!C.on) return;
      var active = document.querySelector('main .screen.active');
      records.forEach(function (r) {
        var n = r.target.nodeType === 1 ? r.target : r.target.parentElement, scr = n && n.closest ? n.closest('main .screen') : null;
        var where = !scr ? 'hors écran' : scr === active ? 'écran actif' : 'caché ' + scr.id;
        var m = C.mut[where] || (C.mut[where] = { n: 0, targets: {} }); m.n++;
        if (scr && scr !== active) { var id = (n.id ? '#' + n.id : (n.closest('[id]') ? '#' + n.closest('[id]').id + ' ' : '') + n.tagName.toLowerCase()) + (r.type === 'attributes' ? '@' + r.attributeName : r.type === 'characterData' ? '#text' : '+child'); m.targets[id] = (m.targets[id] || 0) + 1; }
      });
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  } catch (_) { C.noMutations = true; }
  C.animations = function () {
    var active = document.querySelector('main .screen.active');
    return (document.getAnimations ? document.getAnimations() : []).filter(function (a) { return a.playState === 'running'; }).map(function (a) {
      var t = a.effect && a.effect.target, scr = t && t.closest ? t.closest('main .screen') : null, timing = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : {};
      return { name: a.animationName || a.transitionProperty || a.constructor.name, target: t ? (t.id ? '#' + t.id : t.tagName.toLowerCase() + (typeof t.className === 'string' && t.className ? '.' + t.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) : null,
        rendered: !!(t && t.getClientRects && t.getClientRects().length), inHiddenScreen: !!(scr && scr !== active), infinite: timing.iterations === Infinity, duration: timing.duration };
    });
  };
});
async function censusWindow(cdp, seconds) {
  await cdp.evaluate('window.__census.sites={};window.__census.mut={};window.__census.on=true;true');
  await sleep(seconds * 1000);
  return cdp.evaluate('(function(){var C=window.__census;C.on=false;return {sites:Object.keys(C.sites).map(function(k){var s=C.sites[k];return {kind:s.kind,site:s.site,extra:s.extra,fired:s.fired,delays:Object.keys(s.delays).map(Number)};}),animations:C.animations(),mutations:Object.keys(C.mut).map(function(k){var m=C.mut[k];return {where:k,n:m.n,targets:Object.keys(m.targets).map(function(t){return [t,m.targets[t]];}).sort(function(a,b){return b[1]-a[1];}).slice(0,8)};})};})()');
}
async function stepHidden(fx, v) {
  const browser = await openBrowser(v), cdp = browser.cdp;
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + CENSUS_SCRIPT + ')();\n//# sourceURL=census-instrument.js' });
  const out = { variant: v.label, seconds: CENSUS, states: {} };
  try {
    fx.phase = 'idle'; fx.profile = v.kind;
    await storage(cdp, fx, v);
    await openPage(cdp, fx, v, 'census');
    for (const screen of ['menu', 'home', 'files', 'jog', 'machine', 'history', 'settings']) {
      await goScreen(cdp, screen); await sleep(2000);
      out.states['repos/' + screen] = await censusWindow(cdp, CENSUS);
      log('hidden ' + v.id + ' repos/' + screen + ': ' + out.states['repos/' + screen].sites.reduce((n, s) => n + s.fired, 0) + ' callbacks, ' + out.states['repos/' + screen].animations.length + ' animations');
    }
    // Screen saver over Menu at rest.
    await goScreen(cdp, 'menu'); await sleep(1000);
    out.saver = await cdp.evaluate('(function(){try{return window.cncScreenSaver?{asked:window.cncScreenSaver.preview(),status:window.cncScreenSaver.status()}:null;}catch(e){return {error:e.message};}})()');
    await sleep(1500);
    out.states['veille/menu'] = await censusWindow(cdp, CENSUS);
    log('hidden ' + v.id + ' veille: ' + JSON.stringify(out.saver && out.saver.asked) + ', ' + out.states['veille/menu'].sites.reduce((n, s) => n + s.fired, 0) + ' callbacks');
    // Wake it: a click on the page (pointer only, nothing reaches the controller: the proxy refuses any command).
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: v.h - 5, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: v.h - 5, button: 'left', clickCount: 1 });
    await sleep(1500);
    // Job running: on Suivi, then on Menu (Suivi hidden).
    fx.phase = 'running';
    await goScreen(cdp, 'home');
    await cdp.waitFor('(function(){var m=window.cncState&&window.cncState.get().machine;return !!(m&&m.workflow==="running"&&m.fresh);})()', 30000, 'job running');
    await sleep(2000);
    out.states['travail/home'] = await censusWindow(cdp, CENSUS);
    await goScreen(cdp, 'menu'); await sleep(2000);
    out.states['travail/menu'] = await censusWindow(cdp, CENSUS);
    log('hidden ' + v.id + ' travail: home ' + out.states['travail/home'].sites.reduce((n, s) => n + s.fired, 0) + ', menu ' + out.states['travail/menu'].sites.reduce((n, s) => n + s.fired, 0) + ' callbacks');
    out.refused = fx.refused.slice();
  } finally { await closeBrowser(browser); fx.phase = 'idle'; }
  return out;
}

// ---------------------------------------------------------------- stream (server side, real modules)
function stepStream() {
  const { EventEmitter } = require('node:events');
  const { createService } = require('../../src/server/services/touch/job-service.js');
  const { createStream } = require('../../src/server/services/touch/touch-stream.js');
  const results = [];
  const scenario = (label, running, clients, seconds) => new Promise((resolve) => {
    const mock = { type: 'Grbl', options: { port: '/dev/mock' }, ready: true, isClose: () => false, runner: new EventEmitter(), sender: new EventEmitter(), workflow: { state: running ? 'running' : 'idle' },
      state: { status: { activeState: 'Idle', mpos: { x: '0.000', y: '0.000', z: '0.000' }, wpos: { x: '0.000', y: '0.000', z: '0.000' }, ov: [100, 100, 100], feedrate: 0, spindle: 0, buf: { planner: 15, rx: 128 } } },
      feeder: { toJSON: () => ({ queue: 0, pending: false }) }, settings: { settings: { $10: '1', $20: '1', $21: '1', $22: '1', $23: '3', $110: '4000', $111: '4000', $112: '800', $130: '408', $131: '396', $132: '130' }, version: '1.1f' },
      command: () => { throw Error('Physical command forbidden'); } };
    mock.runner.state = mock.state;
    mock.sender.state = running ? { name: FILE, context: {}, total: 20000, sent: 0, received: 0 } : { name: '', context: {}, total: 0 };
    mock.sender.toJSON = () => ({ ...mock.sender.state });
    mock.writeln = () => {};
    const provenOffset = () => ({ state: () => 'proven', proven: () => true, proof: () => 0, checking: () => false,
  restoring: () => false, tick() {}, modal() {}, invalidate() {}, cancel() {}, verify() {}, retry() {},
  refusal: () => null, snapshot: () => ({ state: 'proven', code: null, canVerify: true }), signature: () => 'proven' });
    const service = createService({ get: () => ({ '/dev/mock': mock }) }, { get: () => [] }, undefined, { workOffset: provenOffset });
    const stream = createStream(service);
    const sinks = [];
    for (let i = 0; i < clients; i++) {
      const req = new EventEmitter(), res = new EventEmitter();
      const sink = { lines: [], bytes: 0 };
      res.setHeader = () => {}; res.flushHeaders = () => {}; res.end = () => { sink.ended = true; }; res.destroyed = false;
      res.write = (line) => { sink.lines.push(Buffer.byteLength(line)); sink.bytes += Buffer.byteLength(line); return true; };
      stream.open(req, res, { kind: 'touch', id: 'client-' + i, label: 'mesure' });
      sinks.push(sink);
    }
    let n = 0, handlerNs = 0, reports = 0;
    // CNCjs asks Grbl for a status report every 250 ms; during a job the position moves every report.
    const report = setInterval(() => {
      n++;
      const x = running ? (10 + (n % 400) * 0.2).toFixed(3) : '0.000';
      mock.state.status = Object.assign({}, mock.state.status, { activeState: running ? 'Run' : 'Idle', mpos: { x, y: '0.000', z: running ? '-1.000' : '0.000' }, wpos: { x, y: '0.000', z: running ? '-1.000' : '0.000' }, feedrate: running ? 800 : 0, spindle: running ? 12000 : 0 });
      const h0 = process.hrtime.bigint();
      if (running) { mock.sender.state.sent = Math.min(20000, n * 4 + 16); mock.sender.state.received = Math.min(20000, n * 4); mock.sender.emit('change'); }
      mock.runner.emit('status', { raw: '<' + (running ? 'Run' : 'Idle') + '|MPos:' + x + ',0.000,' + (running ? '-1.000' : '0.000') + '|FS:' + (running ? '800,12000' : '0,0') + '>', ...mock.state.status });
      handlerNs += Number(process.hrtime.bigint() - h0); reports++;
    }, 250);
    // Let the first packet and the registration settle, then measure.
    setTimeout(() => {
      sinks.forEach((s) => { s.lines.length = 0; s.bytes = 0; }); handlerNs = 0; reports = 0;
      const cpu0 = process.cpuUsage(), t0 = process.hrtime.bigint();
      setTimeout(() => {
        const cpu = process.cpuUsage(cpu0), wall = Number(process.hrtime.bigint() - t0) / 1e6;
        clearInterval(report);
        const lines = sinks[0].lines;
        // Cost of one snapshot as touch-stream builds it (list() + signature + the line), measured apart.
        const t1 = process.hrtime.bigint(), N = 200;
        for (let i = 0; i < N; i++) { const p = stream.snapshot(); JSON.stringify([p.controllers, p.systemCommand]); JSON.stringify({ ...p, transportId: 'x' }); }
        const perSnapshotUs = Number(process.hrtime.bigint() - t1) / 1e3 / N;
        const sample = JSON.stringify({ ...stream.snapshot(), transportId: 'x'.repeat(32) });
        stream.dispose();
        resolve({ label, running, clients, seconds: r1(wall / 1000), packets: lines.length, packetsPerS: r1(lines.length / (wall / 1000)), bytesPerPacket: range(lines), bytesPerS: r1(sinks[0].bytes / (wall / 1000)),
          cpuMsPerS: r1((cpu.user + cpu.system) / 1000 / (wall / 1000)), perSnapshotUs: r1(perSnapshotUs), reportsPerS: r1(reports / (wall / 1000)), handlerUsPerReport: r1(handlerNs / 1e3 / Math.max(1, reports)),
          estimateMsPerS: r1((handlerNs / 1e6 + lines.length * perSnapshotUs / 1e3) / (wall / 1000)), sampleBytes: Buffer.byteLength(sample), topKeys: Object.entries(JSON.parse(sample).controllers[0] || {}).map(([k, val]) => [k, JSON.stringify(val === undefined ? null : val).length]).sort((a, b) => b[1] - a[1]).slice(0, 12) });
      }, seconds * 1000);
    }, 1500);
  });
  const replay = require('./measure-replay-fixture.cjs').create({ file: FILE });
  const fixturePacket = Buffer.byteLength(JSON.stringify({ ...replay.packet(), transportId: 'x'.repeat(16) }) + '\n');
  return (async () => {
    // Baseline CPU of the process with the same reports and no stream client (the heartbeat still observes).
    for (const [label, running, clients] of [['repos, 1 client', false, 1], ['repos, 2 clients', false, 2], ['travail (rapport changeant), 1 client', true, 1], ['travail (rapport changeant), 2 clients', true, 2]]) {
      const runs = [];
      for (let i = 0; i < Math.min(REPEAT, 3); i++) runs.push(await scenario(label, running, clients, 15));
      const k = (f) => range(runs.map(f));
      results.push({ label, running, clients, runs: runs.length, packetsPerS: k((r) => r.packetsPerS), bytesPerPacket: k((r) => r.bytesPerPacket && r.bytesPerPacket.median), bytesPerPacketMax: k((r) => r.bytesPerPacket && r.bytesPerPacket.max),
        bytesPerS: k((r) => r.bytesPerS), cpuMsPerS: k((r) => r.cpuMsPerS), reportsPerS: k((r) => r.reportsPerS), handlerUsPerReport: k((r) => r.handlerUsPerReport), estimateMsPerS: k((r) => r.estimateMsPerS), perSnapshotUs: k((r) => r.perSnapshotUs), sampleBytes: runs[0].sampleBytes, topKeys: runs[0].topKeys });
      log('stream ' + label + ': ' + fmtR(results[results.length - 1].packetsPerS) + ' packets/s, ' + fmtR(results[results.length - 1].bytesPerPacket) + ' B/packet, CPU ' + fmtR(results[results.length - 1].cpuMsPerS) + ' ms/s, snapshot ' + fmtR(results[results.length - 1].perSnapshotUs) + ' µs');
    }
    return { scenarios: results, fixturePacketBytes: fixturePacket, node: process.version };
  })();
}

// ---------------------------------------------------------------- dead code (static)
const read = (f) => fs.readFileSync(f, 'utf8');
const touchFiles = () => fs.readdirSync(TOUCH).filter((f) => /\.(js|css|html)$/.test(f));
function reachable() {
  // From index.html: its tags, then any 'name.js' / 'name.css' literal inside a reached script (loadAdvanced lists, workers, importScripts).
  const html = read(path.join(TOUCH, 'index.html'));
  const all = new Set(touchFiles());
  const seen = new Set(), queue = [];
  const add = (f) => { if (all.has(f) && !seen.has(f)) { seen.add(f); queue.push(f); } };
  (html.match(/(?:src|href)="([^"?#]+)/g) || []).forEach((m) => add(m.replace(/^(src|href)="/, '')));
  while (queue.length) {
    const f = queue.shift();
    if (!/\.js$/.test(f)) continue;
    const text = read(path.join(TOUCH, f));
    (text.match(/['"]([A-Za-z0-9_.-]+\.(?:js|css))(?:\?[^'"]*)?['"]/g) || []).forEach((m) => add(m.replace(/^['"]/, '').replace(/['"]$/, '').split('?')[0]));
  }
  return { reached: seen, notReached: Array.from(all).filter((f) => !seen.has(f) && f !== 'index.html').sort() };
}
function stripComments(text) { return text.replace(/\/\*[\s\S]*?\*\//g, ' '); }
function cssRules(text) {
  // Flat rules, @media blocks unwrapped; @keyframes and @font-face kept whole (never dead by this test).
  const rules = []; let i = 0; text = stripComments(text);
  const walk = (start, end) => {
    let j = start;
    while (j < end) {
      const open = text.indexOf('{', j); if (open < 0 || open >= end) break;
      const head = text.slice(j, open).trim();
      let depth = 1, k = open + 1;
      while (k < end && depth) { if (text[k] === '{') depth++; else if (text[k] === '}') depth--; k++; }
      if (/^@(media|supports)/.test(head)) walk(open + 1, k - 1);
      else if (!/^@/.test(head)) rules.push({ selector: head, bytes: k - j });
      j = k;
    }
  };
  walk(i, text.length);
  return rules;
}
function stepDead() {
  const { reached, notReached } = reachable();
  const js = Array.from(reached).filter((f) => /\.js$/.test(f) && !/^i18n-messages/.test(f));
  const sources = {};
  js.concat(['index.html']).forEach((f) => { sources[f] = read(path.join(TOUCH, f)); });
  const allText = Object.values(sources).join('\n');
  // The simulation bench (simulation.html and the scripts only it loads): not deployed, kept apart.
  const simText = notReached.map((f) => read(path.join(TOUCH, f))).join('\n');
  const wordIn = (text, word) => new RegExp('(^|[^A-Za-z0-9_-])' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^A-Za-z0-9_-])').test(text);
  // CSS: a selector needs all its classes and ids; one referenced nowhere (HTML and the page's scripts) cannot match.
  const css = [];
  Array.from(reached).filter((f) => /\.css$/.test(f)).forEach((f) => {
    const rules = cssRules(read(path.join(TOUCH, f)));
    let deadBytes = 0; const dead = [], dynamic = [];
    rules.forEach((r) => {
      const selectors = r.selector.split(',');
      const verdicts = selectors.map((s) => {
        const tokens = (s.replace(/\[[^\]]*\]/g, '').replace(/:not\(([^)]*)\)/g, ' ').match(/[.#][A-Za-z_][A-Za-z0-9_-]*/g) || []);
        const missing = tokens.map((t) => t.slice(1)).filter((t) => !wordIn(allText, t));
        if (!missing.length) return 'live';
        // A class built from a prefix ('v2m-' + name) may still be produced at run time.
        const dyn = missing.some((t) => { const p = t.replace(/[A-Za-z0-9_]+$/, ''); return p.length > 2 && p !== t && (allText.indexOf("'" + p + "'") >= 0 || allText.indexOf('"' + p + '"') >= 0 || new RegExp("['\"]" + p.replace(/[-]/g, '\\-') + "['\"]\\s*\\+").test(allText) || allText.indexOf(p + "'+") >= 0 || allText.indexOf(p + "' +") >= 0); });
        return dyn ? 'dynamic' : 'dead:' + missing.join(' ');
      });
      if (verdicts.every((x) => x.indexOf('dead') === 0)) {
        const missing = verdicts.map((x) => x.slice(5)).join(' ').split(/\s+/).filter(Boolean);
        dead.push({ selector: r.selector.replace(/\s+/g, ' ').slice(0, 160), missing: verdicts.map((x) => x.slice(5)).join(' | '), bytes: r.bytes, simulationOnly: missing.every((t) => wordIn(simText, t)) }); deadBytes += r.bytes;
      }
      else if (verdicts.every((x) => x !== 'live')) dynamic.push(r.selector.replace(/\s+/g, ' ').slice(0, 120));
    });
    css.push({ file: f, bytes: fs.statSync(path.join(TOUCH, f)).size, rules: rules.length, deadRules: dead.length, deadBytes, deadSimulationOnly: dead.filter((x) => x.simulationOnly).length, dynamicRules: dynamic.length, dead, dynamic: dynamic.slice(0, 20) });
  });
  // Exported members: window.NAME = { key: … } in the page's scripts; a key referenced nowhere else.
  const exportsOut = [];
  js.forEach((f) => {
    const text = sources[f];
    const re = /window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*\{/g; let m;
    while ((m = re.exec(text))) {
      let depth = 1, k = m.index + m[0].length, keys = [], start = k;
      for (; k < text.length && depth; k++) {
        const ch = text[k];
        if (ch === '{' || ch === '(' || ch === '[') depth++; else if (ch === '}' || ch === ')' || ch === ']') depth--;
        else if (depth === 1 && (ch === ',' || k === start)) { /* boundary */ }
      }
      const body = text.slice(start, k - 1);
      // Top-level keys only: scan with depth again.
      let d = 0, cur = '';
      for (let q = 0; q < body.length; q++) {
        const ch = body[q];
        if (ch === '{' || ch === '(' || ch === '[') d++; else if (ch === '}' || ch === ')' || ch === ']') d--;
        if (d === 0 && ch === ',') { keys.push(cur); cur = ''; } else if (d === 0) cur += ch; else cur += d === 1 && (ch === '{' || ch === '(' || ch === '[') ? ch : '';
      }
      keys.push(cur);
      const names = keys.map((s) => (s.trim().match(/^['"]?([A-Za-z_$][A-Za-z0-9_$]*)['"]?\s*(:|\(|$)/) || [])[1]).filter(Boolean);
      const global = m[1];
      const others = Object.keys(sources).filter((x) => x !== f).map((x) => sources[x]).join('\n');
      const globalUsed = wordIn(others, global);
      names.forEach((name) => {
        const elsewhere = new RegExp('\\.' + name.replace(/\$/g, '\\$') + '\\b').test(others) || new RegExp('[\'"]' + name + '[\'"]').test(others);
        const own = (text.match(new RegExp('\\b' + name.replace(/\$/g, '\\$') + '\\b', 'g')) || []).length;
        if (!elsewhere) exportsOut.push({ file: f, global, member: name, globalUsedElsewhere: globalUsed, occurrencesInOwnFile: own });
      });
    }
  });
  // Tests that still call a candidate (examples/cncjs-touch/test-*.cjs): kept apart.
  const tests = fs.readdirSync(__dirname).filter((f) => /^test-.*\.cjs$/.test(f)).map((f) => read(path.join(__dirname, f))).join('\n');
  exportsOut.forEach((e) => { e.usedByTests = new RegExp('\\.' + e.member.replace(/\$/g, '\\$') + '\\b').test(tests); });
  // i18n: source phrases (first column) found in no page script, no HTML and no server source.
  const vm = require('vm');
  const server = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory() && e.name !== '__tests__') walk(p); else if (/\.js$/.test(e.name)) server.push(read(p)); });
  walk(path.join(REPO, 'src', 'server'));
  const htmlDecoded = sources['index.html'].replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
  const haystack = Object.keys(sources).filter((x) => x !== 'index.html').map((x) => sources[x]).join('\n') + '\n' + htmlDecoded + '\n' + server.join('\n');
  const i18n = [];
  fs.readdirSync(TOUCH).filter((f) => /^i18n-messages.*\.js$/.test(f)).forEach((f) => {
    const text = read(path.join(TOUCH, f));
    let rows = null;
    const sandbox = { window: {}, cncI18n: null }; sandbox.window.cncI18n = { registerCatalog: (n, r) => { rows = r; } };
    try { vm.runInNewContext(text.trim().startsWith('[') ? 'window.__rows=' + text : text, sandbox); rows = rows || sandbox.window.__rows || Object.values(sandbox.window).find((x) => Array.isArray(x)); } catch (e) { i18n.push({ file: f, error: e.message }); return; }
    const unused = [], simOnly = [];
    (rows || []).forEach((row) => {
      const s = row && row[0]; if (typeof s !== 'string') return;
      const variants = [s, s.replace(/'/g, "\\'"), s.replace(/"/g, '\\"'), s.replace(/’/g, '\\u2019'), s.replace(/\n/g, '\\n')];
      if (!variants.some((x) => haystack.indexOf(x) >= 0)) (variants.some((x) => simText.indexOf(x) >= 0) ? simOnly : unused).push(s);
    });
    i18n.push({ file: f, bytes: fs.statSync(path.join(TOUCH, f)).size, phrases: (rows || []).length, unused: unused.length, simulationOnly: simOnly.length, sample: unused.slice(0, 400), simulationSample: simOnly.slice(0, 400) });
  });
  return { notReached, notReachedBytes: notReached.reduce((n, f) => n + fs.statSync(path.join(TOUCH, f)).size, 0), css, exports: exportsOut, i18n };
}

// ---------------------------------------------------------------- cache (?v= suffixes, headers)
function git(...a) { try { return execFileSync('git', a, { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (_) { return ''; } }
async function stepCache() {
  const html = read(path.join(TOUCH, 'index.html'));
  const refs = [];
  (html.match(/(?:src|href)="([A-Za-z0-9_./-]+)\?v=([A-Za-z0-9_.-]+)"/g) || []).forEach((m) => { const x = m.match(/"([^"?]+)\?v=([^"]+)"/); refs.push({ where: 'index.html', file: x[1], v: x[2] }); });
  touchFiles().filter((f) => /\.js$/.test(f)).forEach((f) => {
    const text = read(path.join(TOUCH, f));
    (text.match(/['"]([A-Za-z0-9_.-]+\.(?:js|css))\?v=([A-Za-z0-9_.-]+)['"]/g) || []).forEach((m) => { const x = m.match(/['"]([^'"?]+)\?v=([^'"]+)['"]/); refs.push({ where: f, file: x[1], v: x[2] }); });
  });
  const adv = (read(path.join(TOUCH, 'tablet-profile.js')).match(/ADVANCED_VERSION='([^']+)'/) || [])[1];
  const byValue = {};
  refs.forEach((r) => { (byValue[r.v] = byValue[r.v] || []).push(r.file + (r.where !== 'index.html' ? ' (' + r.where + ')' : '')); });
  // The commit that wrote each suffix of index.html against the last commit of the file itself.
  const rel = 'examples/cncjs-touch/touch/';
  const stale = [];
  refs.filter((r) => r.where === 'index.html').forEach((r) => {
    const suffix = git('log', '-1', '--format=%h|%cs', '-S' + r.file + '?v=' + r.v, '--', rel + 'index.html');
    const fileCommit = git('log', '-1', '--format=%h|%cs', '--', rel + r.file);
    const behind = suffix && fileCommit ? Number(git('rev-list', '--count', suffix.split('|')[0] + '..' + fileCommit.split('|')[0], '--', rel + r.file) || 0) : null;
    stale.push({ file: r.file, v: r.v, suffixCommit: suffix, fileCommit, fileCommitsAfterSuffix: behind });
  });
  // Headers from the real stack (compression + serve-static, maxAge 0 as settings.base.js), on a temporary copy.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cnc-refonte-cache-'));
  ['index.html', 'touch-shell.js', 'ui-2027.css'].forEach((f) => fs.copyFileSync(path.join(TOUCH, f), path.join(tmp, f)));
  const serveStatic = require(path.join(REPO, 'node_modules', 'serve-static'));
  const compression = require(path.join(REPO, 'node_modules', 'compression'));
  const serve = serveStatic(tmp, { maxAge: 0 }), compress = compression({ threshold: 512 });
  const server = http.createServer((req, res) => compress(req, res, () => serve(req, res, () => { res.statusCode = 404; res.end(); })));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const get = (p, headers) => new Promise((resolve, reject) => { http.get({ host: '127.0.0.1', port, path: p, headers: Object.assign({ 'accept-encoding': 'gzip' }, headers || {}) }, (res) => { let n = 0; res.on('data', (d) => { n += d.length; }); res.on('end', () => resolve({ status: res.statusCode, bytes: n, headers: { 'cache-control': res.headers['cache-control'], etag: res.headers.etag, 'last-modified': res.headers['last-modified'], 'content-encoding': res.headers['content-encoding'] || null } })); }).on('error', reject); });
  const seq = [];
  for (const f of ['index.html', 'touch-shell.js?v=v2u']) {
    const first = await get('/' + f);
    const again = await get('/' + f, { 'if-none-match': first.headers.etag, 'if-modified-since': first.headers['last-modified'] });
    const file = path.join(tmp, f.split('?')[0]);
    // A deploy: new content, same ?v=, mtime moved forward.
    fs.appendFileSync(file, '\n<!-- deploy -->\n'); const t = new Date(Date.now() + 5000); fs.utimesSync(file, t, t);
    const after = await get('/' + f, { 'if-none-match': first.headers.etag, 'if-modified-since': first.headers['last-modified'] });
    seq.push({ path: '/' + f, first, revalidate: again, afterDeploySameSuffix: after });
  }
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  return { refs: refs.length, values: Object.keys(byValue).length, byValue, advancedVersion: adv, stale, headers: seq };
}

// ---------------------------------------------------------------- report
function report(res) {
  const L = ['# Mesures refonte — ' + new Date().toISOString() + ' (commit ' + git('rev-parse', '--short', 'HEAD') + ', Node ' + process.version + ', ' + os.cpus()[0].model + ')', '', 'PC de développement, Edge sans tête, banc local. Durées : médiane (min–max) de ' + REPEAT + ' passes. Pas la Surface, pas la RT.', ''];
  if (res.startup) {
    L.push('## Démarrage', '', '| Indicateur | ' + res.startup.map((s) => s.variant + ' froid | ' + s.variant + ' chaud').join(' | ') + ' |', '| --- |' + res.startup.map(() => ' ---: | ---: |').join(''));
    const row = (label, f) => L.push('| ' + label + ' | ' + res.startup.map((s) => f(s.cold) + ' | ' + f(s.warm)).join(' | ') + ' |');
    row('Requêtes (hors flux)', (x) => fmtR(x.requests)); row('200 / 304', (x) => fmtR(x.s200) + ' / ' + fmtR(x.s304)); row('Octets sur le fil (gzip)', (x) => kBR(x.wireBytes));
    row('JS : fichiers', (x) => fmtR(x.js.n)); row('JS : transférés / décodés', (x) => kB(x.js.transfer && x.js.transfer.median) + ' / ' + kB(x.js.decoded && x.js.decoded.median));
    row('CSS : fichiers', (x) => fmtR(x.css.n)); row('CSS : transférés / décodés', (x) => kB(x.css.transfer && x.css.transfer.median) + ' / ' + kB(x.css.decoded && x.css.decoded.median));
    row('XHR / autres : fichiers', (x) => fmtR(x.xhr.n) + ' / ' + fmtR(x.other.n)); row('HTML décodé', (x) => kBR(x.htmlDecoded));
    row('Coquille prête, ms', (x) => fmtR(x.shellMs)); row('v2 ouverte, ms', (x) => fmtR(x.v2OpenMs)); row('Script / style / layout / tâches, ms', (x) => fmtR(x.scriptMs) + ' / ' + fmtR(x.styleMs) + ' / ' + fmtR(x.layoutMs) + ' / ' + fmtR(x.taskMs));
    row('Mises en page / recalculs de style', (x) => fmtR(x.layouts) + ' / ' + fmtR(x.recalcs)); row('Nœuds DOM', (x) => fmtR(x.domNodes)); row('Écouteurs', (x) => fmtR(x.listeners)); row('Tas JS après GC', (x) => kBR(x.heapAfterGc));
    L.push('');
  }
  if (res.job) {
    L.push('## Travail relu (--replay), par seconde', '', '| Variante · écran | évén./s | tâches ms/s | script ms/s | layout ms/s | style ms/s | mises en page/s | recalculs/s | tâches > 50 ms (par fenêtre) | éléments | nœuds DOM (métrique) | tas après GC | flux o/s |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    res.job.forEach((j) => Object.keys(j.screens).forEach((s) => { const m = j.screens[s].summary; L.push('| ' + j.variant + ' · ' + s + ' | ' + fmtR(m.events) + ' | ' + fmtR(m.taskMs) + ' | ' + fmtR(m.scriptMs) + ' | ' + fmtR(m.layoutMs) + ' | ' + fmtR(m.styleMs) + ' | ' + fmtR(m.layouts) + ' | ' + fmtR(m.recalcs) + ' | ' + fmtR(m.longTasks) + ' | ' + fmtR(m.elements) + ' | ' + fmtR(m.domNodes) + ' | ' + kBR(m.heapAfterGc) + ' | ' + fmtR(m.streamBytesPerS) + ' |'); }));
    res.job.forEach((j) => Object.keys(j.profiles || {}).forEach((scr) => { const p = j.profiles[scr]; L.push('', '### ' + j.variant + ' · ' + scr + ' : temps propre (fenêtre profilée de ' + WINDOW + ' s)', '', '| Fichier | ms |', '| --- | ---: |'); p.files.forEach((f) => L.push('| ' + f.where + ' | ' + f.selfMs + ' |')); L.push('', '| Fonction | ms |', '| --- | ---: |'); p.functions.forEach((f) => L.push('| ' + f.where + ' | ' + f.selfMs + ' |')); }));
    L.push('');
  }
  if (res.hidden) {
    res.hidden.forEach((h) => {
      L.push('## Rappels par site — ' + h.variant + ' (' + h.seconds + ' s par état)', '');
      const states = Object.keys(h.states), keys = new Set();
      states.forEach((s) => h.states[s].sites.forEach((x) => keys.add(x.kind + ' ' + x.site + (x.extra ? ' ' + x.extra : ''))));
      L.push('| Site | ' + states.join(' | ') + ' | délais ms |', '| --- |' + states.map(() => ' ---: |').join('') + ' --- |');
      Array.from(keys).sort().forEach((k) => {
        let delays = new Set();
        const cells = states.map((s) => { const x = h.states[s].sites.find((y) => (y.kind + ' ' + y.site + (y.extra ? ' ' + y.extra : '')) === k); if (x) x.delays.forEach((d) => delays.add(d)); return x ? x.fired : 0; });
        L.push('| ' + k.replace(/\|/g, '\\|') + ' | ' + cells.join(' | ') + ' | ' + Array.from(delays).slice(0, 6).join(', ') + ' |');
      });
      L.push('', 'Animations en cours :', '');
      states.forEach((s) => { const a = h.states[s].animations; L.push('- ' + s + ' : ' + (a.length ? a.map((x) => x.name + ' sur ' + x.target + (x.inHiddenScreen ? ' (écran caché)' : '') + (x.rendered ? '' : ' (non rendu)') + (x.infinite ? ' ∞' : '')).join(' ; ') : 'aucune')); });
      L.push('', 'Mutations du DOM par zone :', '');
      states.forEach((s) => { const m = h.states[s].mutations || []; L.push('- ' + s + ' : ' + (m.length ? m.map((x) => x.where + ' ' + x.n + (x.targets.length ? ' [' + x.targets.map((t) => t[0] + ' ' + t[1]).join(', ') + ']' : '')).join(' ; ') : 'aucune')); });
      L.push('', 'Veille : ' + JSON.stringify(h.saver), '');
    });
  }
  if (res.stream) {
    L.push('## Flux touch-events côté serveur (touch-stream.js réel, Grbl simulé dans Node)', '', '| Scénario | rapports Grbl/s | paquets/s | octets/paquet (méd.) | octets/paquet (max) | o/s par client | traitement d’un rapport µs | coût d’un paquet µs | estimation ms/s | CPU du processus ms/s (pas de 15,6 ms sous Windows) |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    res.stream.scenarios.forEach((s) => L.push('| ' + s.label + ' | ' + fmtR(s.reportsPerS) + ' | ' + fmtR(s.packetsPerS) + ' | ' + fmtR(s.bytesPerPacket) + ' | ' + fmtR(s.bytesPerPacketMax) + ' | ' + fmtR(s.bytesPerS) + ' | ' + fmtR(s.handlerUsPerReport) + ' | ' + fmtR(s.perSnapshotUs) + ' | ' + fmtR(s.estimateMsPerS) + ' | ' + fmtR(s.cpuMsPerS) + ' |'));
    L.push('', 'Paquet du banc de relecture (ce que la page reçoit pendant les mesures) : ' + res.stream.fixturePacketBytes + ' octets.', 'Plus grosses clés d’un contrôleur (octets JSON) : ' + res.stream.scenarios[2].topKeys.map((k) => k[0] + ' ' + k[1]).join(', '), '');
  }
  if (res.dead) {
    const d = res.dead;
    L.push('## Code mort (candidats)', '', 'Fichiers de touch/ jamais chargés par index.html (ni par un script qu’elle charge) : ' + d.notReached.join(', ') + ' — ' + kB(d.notReachedBytes), '');
    L.push('| Feuille | octets | règles | règles sans référence | dont simulation seule | octets | règles à classe dynamique |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    d.css.forEach((c) => L.push('| ' + c.file + ' | ' + c.bytes + ' | ' + c.rules + ' | ' + c.deadRules + ' | ' + c.deadSimulationOnly + ' | ' + c.deadBytes + ' | ' + c.dynamicRules + ' |'));
    L.push('', 'Membres exportés sans référence hors de leur fichier : ' + d.exports.length + ' (' + d.exports.filter((e) => e.usedByTests).length + ' appelés par un test).', '');
    d.exports.forEach((e) => L.push('- ' + e.file + ' : window.' + e.global + '.' + e.member + (e.usedByTests ? ' (test)' : '')));
    L.push('', '| Catalogue i18n | octets | phrases | sans référence nulle part | utilisées par la simulation seule |', '| --- | ---: | ---: | ---: | ---: |');
    d.i18n.forEach((c) => L.push('| ' + c.file + ' | ' + c.bytes + ' | ' + c.phrases + ' | ' + c.unused + ' | ' + c.simulationOnly + ' |'));
    L.push('');
  }
  if (res.cache) {
    const c = res.cache;
    L.push('## Cache', '', c.refs + ' suffixes ?v=, ' + c.values + ' valeurs ; ADVANCED_VERSION = ' + c.advancedVersion, '', '| Valeur | n | fichiers |', '| --- | ---: | --- |');
    Object.keys(c.byValue).sort((a, b) => c.byValue[b].length - c.byValue[a].length).forEach((v) => L.push('| ' + v + ' | ' + c.byValue[v].length + ' | ' + c.byValue[v].join(', ') + ' |'));
    L.push('', 'Suffixes en retard (fichier modifié après le commit qui a écrit son suffixe) : ' + c.stale.filter((s) => s.fileCommitsAfterSuffix > 0).length + ' / ' + c.stale.length, '');
    c.stale.filter((s) => s.fileCommitsAfterSuffix > 0).forEach((s) => L.push('- ' + s.file + '?v=' + s.v + ' : suffixe ' + s.suffixCommit + ', fichier ' + s.fileCommit + ' (' + s.fileCommitsAfterSuffix + ' commits après)'));
    L.push('', '| Requête | 1re | revalidation | après déploiement, même ?v= |', '| --- | --- | --- | --- |');
    c.headers.forEach((h) => L.push('| ' + h.path + ' | ' + h.first.status + ' ' + h.first.headers['cache-control'] + ', ' + (h.first.headers['content-encoding'] || 'identity') + ', ' + h.first.bytes + ' o | ' + h.revalidate.status + ' | ' + h.afterDeploySameSuffix.status + ' (' + h.afterDeploySameSuffix.bytes + ' o) |'));
    L.push('');
  }
  return L.join('\n');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const res = {};
  const needBrowser = STEPS.some((s) => ['startup', 'job', 'hidden'].includes(s));
  const fx = needBrowser ? await startControllerFixture() : null;
  try {
    for (const step of ['startup', 'job', 'hidden']) {
      if (!STEPS.includes(step)) continue;
      res[step] = [];
      for (const id of VARIANTS) {
        const v = VARIANT[id];
        const r = step === 'startup' ? await stepStartup(fx, v) : step === 'job' ? await stepJob(fx, v) : await stepHidden(fx, v);
        res[step].push(r);
        fs.writeFileSync(path.join(OUT, 'refonte-' + step + '.json'), JSON.stringify(res[step], null, 1));
      }
    }
  } finally { if (fx) fx.close(); }
  if (STEPS.includes('stream')) { res.stream = await stepStream(); fs.writeFileSync(path.join(OUT, 'refonte-stream.json'), JSON.stringify(res.stream, null, 1)); }
  if (STEPS.includes('dead')) { res.dead = stepDead(); fs.writeFileSync(path.join(OUT, 'refonte-dead.json'), JSON.stringify(res.dead, null, 1)); }
  if (STEPS.includes('cache')) { res.cache = await stepCache(); fs.writeFileSync(path.join(OUT, 'refonte-cache.json'), JSON.stringify(res.cache, null, 1)); }
  const md = report(res);
  fs.writeFileSync(path.join(OUT, 'refonte-' + STEPS.join('-') + '.md'), md);
  console.log('\n' + md);
  log('written ' + OUT);
  process.exit(0);
}
main().catch((e) => { console.error('measure-refonte: ' + (e.stack || e.message)); process.exit(1); });
