#!/usr/bin/env node
'use strict';
// Tablet measurements of Performance v2 (design/v2/REFLEXION.md § 8; lot L7), on the Surface Pro 3, through the
// DevTools port of a SECOND Chromium the measurer opened on the candidate published under /touch-next/ (never the
// kiosk Chromium). This script attaches to that port and reads the page. It launches nothing, kills nothing,
// clicks nothing and sends nothing to the controller; its only page action is an optional reload (--reload),
// refused unless v2 reports a safe rest (cncV2.state().safeIdle).
//
//   1. On the Surface (DISPLAY=:0, not headless, GPU as the kiosk):
//        chromium --user-data-dir=/tmp/cnc-measure-v2 --remote-debugging-port=9230 --window-size=1366,911 \
//          --force-device-scale-factor=1.58 http://127.0.0.1:8000/touch-next/
//      In that window: Réglages > Interface Performance v2 > Activée, then reload at rest (the change applies to
//      the next session). Open Suivi with the measured program loaded.
//   2. node measure-performance-v2.cjs --port 9230 [--match /touch-next/] [--reload] [--seconds 30]
//        [--cpu-seconds 30] [--geometry 600] [--endurance 30] [--out mesure.json]
//   3. Repeat on the v1 page (preference off, next session) with the same program and gestures: the reference.
//   4. For the 500 000 segments cost: node measure-performance-v2.cjs --write-program 500k.nc --segments 500000
//      writes a G-code of exactly that many G1 segments (local file, no connection); put it in the watched
//      folder, start the script with --geometry 600, then select and LOAD it at rest in the page (loading never
//      starts a job). The script times the geometry until it is available, with the long tasks and the heap.
//
// Measured, each with its provenance (Chromium, window, DPR, renderer, profile, v2 state, segments):
//   first image  (--reload) navigation → shell ready → body.perf-v2 → first frame with the v2 Suivi band filled;
//   frames       --seconds s of requestAnimationFrame intervals: p50 / p95 / p99 / max, count > 50 ms (the
//                sampler itself asks a frame each time: it measures the cadence the page can keep, not the CPU);
//   long tasks   PerformanceObserver longtask: count > 50 ms, total, longest, over the same window;
//   report age   4 times a second, the v2 observation's report age (Grbl age + time since arrival), and the
//                share of stale samples (> 2.5 s);
//   CPU          --cpu-seconds s WITHOUT the frame sampler: main-thread task time / wall time (Performance
//                metrics), plus per-process CPU time when the browser endpoint gives it (SystemInfo);
//   memory       JS heap after a forced GC, DOM nodes, listeners; process memory is NOT the JS heap: read
//                RSS / PSS of Chromium and of CNCjs with ps / smem beside this script;
//   500 000      --geometry s: waits for the loaded program's v2 geometry, then segments, full / simplified,
//                bytes of its buffers, preparation time, long tasks and heap growth during it;
//   endurance    --endurance min: once a minute, heap, frames drawn, long tasks, stale reports, GPU lost.
// Node 22 or later (global WebSocket).
const fs = require('node:fs'), http = require('node:http');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : v);

// ---- --write-program: a G-code of N G1 segments (a raster of 1 mm moves, three depths), nothing else. ----
if (arg('--write-program', '')) {
  const file = arg('--write-program', ''), n = Math.max(1, Math.floor(Number(arg('--segments', 500000)) || 500000));
  const out = fs.openSync(file, 'w'), row = 200, lines = ['(CNCjs Touch v2 measurement: ' + n + ' G1 segments, not a part to machine)', 'G21 G90 G17', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-0.5 F300'];
  let written = 0, y = 0, x = 0, dir = 1;
  fs.writeSync(out, lines.join('\n') + '\n');
  let buffer = [];
  while (written < n) {
    x += dir; if (x > row || x < 0) { x -= dir; dir = -dir; y += 0.5; buffer.push('G1 Y' + y.toFixed(1) + ' F800'); } else buffer.push('G1 X' + x + ' F800');
    written++;
    if (buffer.length >= 5000) { fs.writeSync(out, buffer.join('\n') + '\n'); buffer = []; }
  }
  fs.writeSync(out, buffer.concat(['G0 Z5', 'M2']).join('\n') + '\n'); fs.closeSync(out);
  console.log(file + ': ' + n + ' G1 segments (the G0 moves and the first plunge excluded). Load it at rest; never start it on a machine.');
  process.exit(0);
}

const PORT = Number(arg('--port', 0)), MATCH = arg('--match', '/touch-next/'), SECONDS = Number(arg('--seconds', 30)) || 0;
const CPU_SECONDS = Number(arg('--cpu-seconds', 30)) || 0, GEOMETRY = Number(arg('--geometry', 0)) || 0, ENDURANCE = Number(arg('--endurance', 0)) || 0;
const RELOAD = process.argv.includes('--reload'), OUT = arg('--out', '');
if (!(PORT >= 9222)) { console.error('Usage: node measure-performance-v2.cjs --port <DevTools port of the second Chromium> [--match /touch-next/] [--reload] [--seconds 30] [--cpu-seconds 30] [--geometry 600] [--endurance 30] [--out file.json]\n       node measure-performance-v2.cjs --write-program file.nc [--segments 500000]'); process.exit(2); }
if (typeof WebSocket !== 'function') { console.error('Node 22 or later is needed (global WebSocket).'); process.exit(2); }

function getJson(url) { return new Promise((resolve, reject) => { http.get(url, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } }); }).on('error', reject); }); }
class CDP {
  constructor(url) { this.url = url; this.seq = 0; this.pending = new Map(); this.listeners = new Map(); }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url); this.ws = ws;
      ws.addEventListener('open', () => resolve()); ws.addEventListener('error', (e) => reject(new Error('WebSocket error ' + (e.message || ''))));
      ws.addEventListener('message', (e) => {
        const msg = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString()), p = msg.id && this.pending.get(msg.id);
        if (p) { this.pending.delete(msg.id); if (msg.error) p.reject(new Error(msg.error.message + ' (' + p.method + ')')); else p.resolve(msg.result || {}); }
        else if (msg.method) (this.listeners.get(msg.method) || []).forEach((fn) => fn(msg.params));
      });
    });
  }
  send(method, params, ms) { return new Promise((resolve, reject) => { const id = ++this.seq; this.pending.set(id, { resolve, reject, method }); this.ws.send(JSON.stringify({ id, method, params: params || {} })); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, ms || 60000); }); }
  once(method, ms) { return new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('timeout ' + method)), ms || 60000); const list = this.listeners.get(method) || []; list.push(function h(p) { clearTimeout(t); list.splice(list.indexOf(h), 1); resolve(p); }); this.listeners.set(method, list); }); }
  async evaluate(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, 3600000); if (r.exceptionDetails) throw new Error('page exception: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text)); return r.result.value; }
  close() { try { this.ws.close(); } catch (_) { /* ignore */ } }
}
const quantiles = (list) => { const s = list.filter((v) => typeof v === 'number' && isFinite(v)).sort((a, b) => a - b), at = (q) => (s.length ? r2(s[Math.min(s.length - 1, Math.floor(s.length * q))]) : null);
  return { n: s.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s.length ? r2(s[s.length - 1]) : null, over50: s.filter((v) => v > 50).length }; };

const ENV = '(function(){var v=window.cncV2,s=v&&v.state?v.state():null,g=window.cncGpu?cncGpu.state():null,geo=null,obs=null;' +
  'try{var x=v&&v.use?v.use("geometry").snapshot():null;geo=x&&{available:x.available,quality:x.quality,segments:x.segmentCount,toleranceMm:x.toleranceMm};}catch(e){}' +
  'try{var o=v&&v.use?v.use("observation").snapshot():null;obs=o&&{available:o.available,freshness:o.report&&o.report.freshness};}catch(e){}' +
  'var q=null;try{q=v&&v.use?v.use("inspect").snapshot().quality:null;}catch(e){}' +
  'return {url:location.href,ua:navigator.userAgent,window:[innerWidth,innerHeight],dpr:devicePixelRatio,profile:window.cncProfile&&cncProfile.performance(),' +
  'gpu:g&&{hardware:g.hardware,lost:g.lost,renderer:g.renderer,reason:g.reason},v2:s,perfV2:document.body.classList.contains("perf-v2"),screen:(document.querySelector("main .screen.active")||{}).id||null,' +
  'geometry:geo,observation:obs,quality:q,workflow:((window.cncState&&cncState.get().machine)||{}).workflow||null,hidden:document.hidden};})()';
// Frames, long tasks and report age over a window, installed in the page and removed at its end.
const SAMPLER = String(function sample(seconds, frames) {
  return new Promise(function (resolve) {
    var gaps = [], ages = [], stale = 0, longs = [], last = null, raf = 0, end = performance.now() + seconds * 1000, observer = null, timer = 0;
    try { observer = new PerformanceObserver(function (list) { list.getEntries().forEach(function (e) { longs.push(e.duration); }); }); observer.observe({ entryTypes: ['longtask'] }); } catch (_) { observer = null; }
    function age() {
      try { var o = window.cncV2.use('observation').snapshot(), r = o && o.report, t = o && o.time, extra = t && window.cncV2.time ? window.cncV2.time.age(t) : null;
        if (r && typeof r.ageMs === 'number') { var a = r.ageMs + (typeof extra === 'number' ? extra : 0); ages.push(a); if (a > 2500) stale++; } } catch (_) {}
    }
    function frame(t) { if (last !== null) gaps.push(t - last); last = t; if (t < end) raf = requestAnimationFrame(frame); }
    if (frames) raf = requestAnimationFrame(frame);
    timer = setInterval(age, 250);
    setTimeout(function () { cancelAnimationFrame(raf); clearInterval(timer); if (observer) observer.disconnect(); resolve({ gaps: gaps, ages: ages, stale: stale, longs: longs, longObserver: !!observer, hidden: document.hidden }); }, seconds * 1000 + 50);
  });
});
const FIRST_IMAGE = '(function(){var t={};window.__cncV2First=t;function now(){return performance.now();}' +
  'new MutationObserver(function(){var b=document.body;if(!b)return;if(!t.shell&&b.classList.contains("ks-ui")&&!document.documentElement.classList.contains("cnc-loading"))t.shell=now();' +
  'if(!t.perfV2&&b.classList.contains("perf-v2")){t.perfV2=now();(function f(){var n=document.getElementById("home-v2-age");if(n&&n.textContent){requestAnimationFrame(function(){t.firstV2Frame=now();});return;}if(now()-t.perfV2<20000)requestAnimationFrame(f);})();}' +
  '}).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:["class"],childList:true});})();';

(async () => {
  const version = await getJson('http://127.0.0.1:' + PORT + '/json/version');
  const target = (await getJson('http://127.0.0.1:' + PORT + '/json/list')).find((t) => t.type === 'page' && t.url.includes(MATCH));
  if (!target) throw new Error('no page whose address contains ' + MATCH + ' on port ' + PORT);
  const cdp = new CDP(target.webSocketDebuggerUrl); await cdp.connect();
  await cdp.send('Performance.enable'); await cdp.send('Page.enable');
  const result = { at: new Date().toISOString(), chromium: version.Browser, port: PORT, env: await cdp.evaluate(ENV), note: 'Surface Pro 3 figures only if run on the tablet; a PC run is not a tablet result.' };
  const e = result.env;
  console.log('Chromium ' + version.Browser + ' · ' + e.url);
  console.log('Fenêtre ' + e.window.join(' × ') + ' px CSS, DPR ' + e.dpr + ', profil ' + e.profile + ', GPU ' + JSON.stringify(e.gpu) + ', v2 ' + (e.perfV2 ? 'active' : 'inactive') + ' (porte ' + (e.v2 && e.v2.open) + ', raison ' + (e.v2 && e.v2.reason) + '), écran ' + e.screen + ', géométrie ' + JSON.stringify(e.geometry));
  if (!e.perfV2) console.log('ATTENTION : la page mesurée n’est pas en v2 (référence v1, ou v2 non ouverte).');

  if (RELOAD) {
    if (!(e.v2 && e.v2.safeIdle) && e.perfV2) throw new Error('reload refused: the page is not at a safe rest (cncV2.state().safeIdle false)');
    if (e.workflow && e.workflow !== 'idle') throw new Error('reload refused: workflow ' + e.workflow);
    const added = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: FIRST_IMAGE });
    const loaded = cdp.once('Page.loadEventFired', 60000);
    await cdp.send('Page.reload', { ignoreCache: false }); await loaded; await sleep(8000);
    result.firstImage = await cdp.evaluate('(function(){var t=window.__cncV2First||{},p={};performance.getEntriesByType("paint").forEach(function(e){p[e.name]=Math.round(e.startTime);});var n=performance.getEntriesByType("navigation")[0]||{};' +
      'return {shellReadyMs:t.shell&&Math.round(t.shell),perfV2Ms:t.perfV2&&Math.round(t.perfV2),firstV2FrameMs:t.firstV2Frame&&Math.round(t.firstV2Frame),paint:p,domContentLoadedMs:Math.round(n.domContentLoadedEventEnd||0),loadMs:Math.round(n.loadEventEnd||0)};})()');
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: added.identifier });
    console.log('Première image : ' + JSON.stringify(result.firstImage) + ' (ms depuis la navigation)');
    result.envAfterReload = await cdp.evaluate(ENV);
  }

  if (SECONDS) {
    console.log('Cadence : ' + SECONDS + ' s (faites les gestes prévus, ou laissez le rejeu tourner)…');
    const m0 = await cdp.send('Performance.getMetrics');
    const s = await cdp.evaluate('(' + SAMPLER + ')(' + SECONDS + ',true)');
    const m1 = await cdp.send('Performance.getMetrics');
    const metric = (m, k) => ((m.metrics || []).find((x) => x.name === k) || {}).value || 0;
    result.frames = { seconds: SECONDS, intervalsMs: quantiles(s.gaps), longTasks: { observed: s.longObserver, count: s.longs.length, totalMs: r2(s.longs.reduce((a, b) => a + b, 0)), maxMs: r2(Math.max(0, ...s.longs)) },
      reportAgeMs: quantiles(s.ages), staleShare: s.ages.length ? r2(s.stale / s.ages.length) : null, hidden: s.hidden, taskMsPerSecond: r2((metric(m1, 'TaskDuration') - metric(m0, 'TaskDuration')) * 1000 / SECONDS) };
    console.log('Intervalles : ' + JSON.stringify(result.frames.intervalsMs) + ' · tâches > 50 ms : ' + JSON.stringify(result.frames.longTasks) + ' · âge des rapports : ' + JSON.stringify(result.frames.reportAgeMs) + ', périmés ' + result.frames.staleShare);
  }

  if (CPU_SECONDS) {
    // No frame sampler here: only the page's own work. Main thread of the page, not the whole machine.
    let browserCpu = null;
    const cpuOf = async () => { try { const b = new CDP(version.webSocketDebuggerUrl); await b.connect(); const r = await b.send('SystemInfo.getProcessInfo', {}, 5000); b.close(); return r.processInfo; } catch (_) { return null; } };
    const p0 = await cpuOf(), m0 = await cdp.send('Performance.getMetrics'); await sleep(CPU_SECONDS * 1000);
    const p1 = await cpuOf(), m1 = await cdp.send('Performance.getMetrics');
    const metric = (m, k) => ((m.metrics || []).find((x) => x.name === k) || {}).value || 0;
    if (p0 && p1) browserCpu = p1.map((p) => { const q = p0.find((x) => x.id === p.id); return { type: p.type, id: p.id, cpuShare: q ? r2((p.cpuTime - q.cpuTime) / CPU_SECONDS) : null }; });
    result.cpu = { seconds: CPU_SECONDS, pageMainThreadShare: r2((metric(m1, 'TaskDuration') - metric(m0, 'TaskDuration')) / CPU_SECONDS), scriptShare: r2((metric(m1, 'ScriptDuration') - metric(m0, 'ScriptDuration')) / CPU_SECONDS), processes: browserCpu,
      note: 'Share of one core. Read CNCjs (node) CPU with top/pidstat beside this script.' };
    console.log('CPU (sans échantillonneur) : fil principal ' + result.cpu.pageMainThreadShare + ' cœur, script ' + result.cpu.scriptShare + (browserCpu ? ' · processus ' + JSON.stringify(browserCpu) : ' · SystemInfo indisponible'));
  }

  const memory = async () => { try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) { /* optional */ } const h = await cdp.send('Runtime.getHeapUsage'); const m = await cdp.send('Performance.getMetrics'); const g = (k) => ((m.metrics || []).find((x) => x.name === k) || {}).value;
    return { heapUsedBytes: h.usedSize, heapTotalBytes: h.totalSize, domNodes: g('Nodes'), listeners: g('JSEventListeners') }; };
  result.memory = await memory();
  console.log('Mémoire JS après GC : ' + (result.memory.heapUsedBytes / 1048576).toFixed(1) + ' Mo, ' + result.memory.domNodes + ' nœuds, ' + result.memory.listeners + ' écouteurs (pas la RSS du navigateur).');

  if (GEOMETRY) {
    console.log('Géométrie : chargez maintenant le programme mesuré, au repos (' + GEOMETRY + ' s au plus)…');
    const before = await cdp.evaluate(ENV), heap0 = result.memory.heapUsedBytes;
    const watch = await cdp.evaluate('new Promise(function(resolve){var v=window.cncV2,start=performance.now(),key=null,changed=null,longs=[],obs=null;try{obs=new PerformanceObserver(function(l){l.getEntries().forEach(function(e){longs.push(e.duration);});});obs.observe({entryTypes:["longtask"]});}catch(_){}' +
      'try{key=JSON.stringify(v.use("geometry").snapshot().geometryKey);}catch(_){}' +
      'var t=setInterval(function(){var s=null;try{s=v.use("geometry").snapshot();}catch(_){}var k=s?JSON.stringify(s.geometryKey):null;if(changed===null&&k!==key)changed=performance.now();' +
      'if(s&&s.available&&k!==key&&(s.quality==="full"||performance.now()-changed>30000)){clearInterval(t);if(obs)obs.disconnect();var b=s.buffers,bytes=b?(b.positions.byteLength+b.sourceLines.byteLength+b.passIds.byteLength):null;' +
      'resolve({segments:s.segmentCount,quality:s.quality,toleranceMm:s.toleranceMm,bufferBytes:bytes,passes:s.passes.length,sinceChangeMs:Math.round(performance.now()-changed),longTasks:{count:longs.length,totalMs:Math.round(longs.reduce(function(a,b){return a+b;},0)),maxMs:Math.round(Math.max.apply(null,[0].concat(longs)))}});}' +
      'if(performance.now()-start>' + GEOMETRY * 1000 + '){clearInterval(t);if(obs)obs.disconnect();resolve({timeout:true,last:s&&{available:s.available,quality:s.quality,segments:s.segmentCount}});}},100);})');
    const after = await memory();
    result.geometry = Object.assign({ before: before.geometry, heapGrowthBytes: after.heapUsedBytes - heap0 }, watch);
    console.log('Géométrie : ' + JSON.stringify(result.geometry));
  }

  if (ENDURANCE) {
    result.endurance = [];
    console.log('Endurance : ' + ENDURANCE + ' min (alternez les vues, laissez le rejeu tourner)…');
    for (let i = 1; i <= ENDURANCE; i++) {
      const s = await cdp.evaluate('(' + SAMPLER + ')(60,false)');
      const env = await cdp.evaluate(ENV), mem = await memory();
      const row = { minute: i, heapUsedBytes: mem.heapUsedBytes, domNodes: mem.domNodes, longTasks: s.longs.length, longestMs: r2(Math.max(0, ...s.longs)), staleShare: s.ages.length ? r2(s.stale / s.ages.length) : null, gpuLost: env.gpu && env.gpu.lost, v2Open: env.v2 && env.v2.open, quality: env.quality };
      result.endurance.push(row);
      console.log('min ' + i + ' : ' + JSON.stringify(row));
    }
    const first = result.endurance[0], last = result.endurance[result.endurance.length - 1];
    result.enduranceDriftBytes = last.heapUsedBytes - first.heapUsedBytes;
    console.log('Dérive du tas JS : ' + (result.enduranceDriftBytes / 1048576).toFixed(2) + ' Mo sur ' + ENDURANCE + ' min. Relevez aussi température et fréquence (sensors, /sys/class/thermal).');
  }

  result.envAtEnd = await cdp.evaluate(ENV);
  cdp.close();
  if (OUT) { fs.writeFileSync(OUT, JSON.stringify(result, null, 1) + '\n'); console.log('Rapport : ' + OUT); }
  console.log('Fin de mesure. Aucune commande envoyée.');
  // The request timeouts above are still armed: end now that everything is written.
  process.exit(0);
})().catch((e) => { console.error('measure-performance-v2: ' + (e.stack || e.message)); process.exit(1); });
