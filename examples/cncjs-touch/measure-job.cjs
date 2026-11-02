#!/usr/bin/env node
'use strict';
// Screen updates during a job, measured on a development PC (headless Chrome
// through the DevTools protocol, never the tablet). The fixture replays a
// deterministic job stream (preview-server.cjs --replay, 4.8 snapshots a
// second, the pace recorded on the tablet), the real page consumes it through
// its normal stream client, and for each screen the script counts, over
// windows of W seconds: layouts and style recalculations, script, style,
// layout and task time (Performance.getMetrics of the document), long tasks
// (PerformanceObserver), snapshot-to-frame latency (requestAnimationFrame
// after each cnc-job-status), heap after GC, and once per screen a sampled CPU
// profile (top functions by self time).
//
//   node examples/cncjs-touch/measure-job.cjs --out output/perf/job-before.json
//   options: --screens home,menu,files,machine  --window 30  --repeat 5  --throttle 1  --label TEXT  --root DIR  --out FILE
const fs = require('fs');
const path = require('path');
const os = require('os');
const { launchBrowser, startFixture, navigate, waitReady, goScreen, setViewport, sleep, median } = require('./browser-run.cjs');

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback; };
const SCREENS = option('--screens', 'home,menu,files,machine').split(',');
const WINDOW = Math.max(5, Number(option('--window', 30)) || 30);
const REPEAT = Math.max(1, Number(option('--repeat', 5)) || 5);
const THROTTLE = Math.max(1, Number(option('--throttle', 1)) || 1);
const LABEL = option('--label', 'source');
const ROOT = option('--root', '');
const OUT = option('--out', '');
const log = (m) => console.log(new Date().toISOString().slice(11, 19) + ' ' + m);
const r1 = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : v);

// In-page counters, installed before the page's own scripts run.
const INSTRUMENT = String(function instrument() {
  var P = window.__perfJob = { longTasks: [], latency: [], statusEvents: 0, mutations: 0 };
  try { new PerformanceObserver(function (list) { list.getEntries().forEach(function (e) { P.longTasks.push(Math.round(e.duration)); }); }).observe({ entryTypes: ['longtask'] }); } catch (_) { P.noLongTasks = true; }
  window.addEventListener('cnc-job-status', function () {
    P.statusEvents++;
    var t0 = performance.now();
    // performance.now() inside the callback: the frame timestamp passed to it is the
    // frame's start, which may precede the event (negative latencies).
    requestAnimationFrame(function () { P.latency.push(Math.round((performance.now() - t0) * 10) / 10); });
  });
  P.reset = function () { P.longTasks = []; P.latency = []; P.statusEvents = 0; P.mutations = 0; };
  P.watch = function () {
    try { new MutationObserver(function (records) { P.mutations += records.length; }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true }); } catch (_) { /* optional */ }
  };
});

function metricsMap(result) { const m = {}; (result.metrics || []).forEach((x) => { m[x.name] = x.value; }); return m; }
const percentile = (values, p) => { if (!values.length) return null; const s = values.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

// Self time per function from a sampled CPU profile.
function topFunctions(profile, limit) {
  const self = new Map(), byId = new Map();
  profile.nodes.forEach((n) => byId.set(n.id, n));
  const deltas = profile.timeDeltas || [];
  (profile.samples || []).forEach((id, i) => { self.set(id, (self.get(id) || 0) + (deltas[i] || 0) / 1000); });
  const agg = new Map();
  self.forEach((ms, id) => {
    const n = byId.get(id); if (!n) return;
    const f = n.callFrame, url = (f.url || '').replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
    const key = (f.functionName || '(anonymous)') + ' ' + (url ? url + ':' + (f.lineNumber + 1) : '(' + (f.functionName === '(garbage collector)' ? 'gc' : 'native') + ')');
    agg.set(key, (agg.get(key) || 0) + ms);
  });
  const total = Array.from(agg.values()).reduce((a, b) => a + b, 0);
  const byFile = new Map();
  agg.forEach((ms, key) => { const file = key.split(' ')[1].split(':')[0]; byFile.set(file, (byFile.get(file) || 0) + ms); });
  return { totalMs: r1(total), functions: Array.from(agg.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, ms]) => ({ where: k, selfMs: r1(ms) })), files: Array.from(byFile.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, ms]) => ({ file: k, selfMs: r1(ms) })) };
}

async function window_(cdp, seconds, profile) {
  await cdp.evaluate('window.__perfJob.reset();true');
  try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) { /* optional */ }
  const heap0 = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  const a = metricsMap(await cdp.send('Performance.getMetrics'));
  if (profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start'); }
  const t0 = Date.now();
  await sleep(seconds * 1000);
  const elapsed = (Date.now() - t0) / 1000;
  let prof = null;
  if (profile) { prof = topFunctions((await cdp.send('Profiler.stop')).profile, 25); await cdp.send('Profiler.disable'); }
  const b = metricsMap(await cdp.send('Performance.getMetrics'));
  const page = await cdp.evaluate('(function(){var P=window.__perfJob;return {longTasks:P.longTasks,latency:P.latency,statusEvents:P.statusEvents,mutations:P.mutations,noLongTasks:!!P.noLongTasks};})()');
  try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) { /* optional */ }
  const heap1 = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  const per = (k) => r1((b[k] - a[k]) / elapsed);
  return {
    seconds: r1(elapsed), eventsPerSecond: r1(page.statusEvents / elapsed), mutationsPerSecond: r1(page.mutations / elapsed),
    layoutsPerSecond: per('LayoutCount'), recalcsPerSecond: per('RecalcStyleCount'),
    scriptMsPerSecond: r1((b.ScriptDuration - a.ScriptDuration) * 1000 / elapsed), styleMsPerSecond: r1((b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000 / elapsed), layoutMsPerSecond: r1((b.LayoutDuration - a.LayoutDuration) * 1000 / elapsed), taskMsPerSecond: r1((b.TaskDuration - a.TaskDuration) * 1000 / elapsed),
    longTasks: page.longTasks.length, longTasksMs: page.longTasks.reduce((x, y) => x + y, 0), longTaskMaxMs: page.longTasks.length ? Math.max(...page.longTasks) : 0,
    latencyP50Ms: percentile(page.latency, 0.5), latencyP95Ms: percentile(page.latency, 0.95), latencyMaxMs: page.latency.length ? Math.max(...page.latency) : null,
    heapBeforeBytes: heap0, heapAfterBytes: heap1, domNodes: b.Nodes, listeners: b.JSEventListeners, profile: prof
  };
}

function summarize(list) {
  const keys = ['eventsPerSecond', 'mutationsPerSecond', 'layoutsPerSecond', 'recalcsPerSecond', 'scriptMsPerSecond', 'styleMsPerSecond', 'layoutMsPerSecond', 'taskMsPerSecond', 'longTasks', 'longTasksMs', 'longTaskMaxMs', 'latencyP50Ms', 'latencyP95Ms', 'latencyMaxMs', 'heapAfterBytes', 'domNodes'];
  const out = { windows: list.length };
  keys.forEach((k) => { out[k] = r1(median(list.map((w) => w[k]))); });
  out.heapGrowthBytes = r1(median(list.map((w) => w.heapAfterBytes - w.heapBeforeBytes)));
  return out;
}

async function main() {
  const fixture = await startFixture(['--replay'].concat(ROOT ? ['--root', path.resolve(ROOT)] : []));
  const url = fixture.base + 'index.html';
  const browser = await launchBrowser(1366, 768);
  const cdp = browser.cdp;
  log('browser ' + browser.version + ', fixture ' + url + ', label ' + LABEL + ', window ' + WINDOW + ' s × ' + REPEAT + ', throttle ' + THROTTLE);
  const result = { label: LABEL, date: new Date().toISOString(), browser: browser.version, node: process.version, platform: os.platform() + ' ' + os.release() + ' ' + os.cpus()[0].model, throttle: THROTTLE, windowSeconds: WINDOW, repeat: REPEAT, screens: {} };
  try {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + INSTRUMENT + ')();' });
    await setViewport(cdp, 1366, 768, 1);
    if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    await navigate(cdp, url);
    await waitReady(cdp);
    await cdp.waitFor('(function(){var m=window.cncState&&window.cncState.get().machine;return !!(m&&m.workflow==="running"&&m.fresh);})()', 30000, 'replayed job running');
    // Suivi loads its preview only while shown: checked once there, before the windows.
    await goScreen(cdp, 'home');
    await cdp.waitFor('!!(document.getElementById("home-job-image")&&!document.getElementById("home-job-image").hidden)', 30000, 'preview image on Suivi').then(() => { result.previewShown = true; }, () => { result.previewShown = false; log('note: preview image not shown on Suivi'); });
    await cdp.evaluate('window.__perfJob.watch();true');
    for (const screen of SCREENS) {
      await goScreen(cdp, screen);
      await sleep(3000);
      const windows = [];
      for (let i = 1; i <= REPEAT; i++) {
        const w = await window_(cdp, WINDOW, i === 1);
        windows.push(w);
        log(screen + ' ' + i + '/' + REPEAT + ': ' + w.eventsPerSecond + ' ev/s, layouts ' + w.layoutsPerSecond + '/s, recalcs ' + w.recalcsPerSecond + '/s, script ' + w.scriptMsPerSecond + ' ms/s, style ' + w.styleMsPerSecond + ', layout ' + w.layoutMsPerSecond + ', task ' + w.taskMsPerSecond + ' ms/s, long tasks ' + w.longTasks + ', latency p95 ' + w.latencyP95Ms + ' ms');
      }
      result.screens[screen] = { summary: summarize(windows), windows };
    }
  } finally {
    cdp.close();
    try { await cdp.send('Browser.close', {}, 3000); } catch (_) { /* closed */ }
    try { browser.child.kill(); } catch (_) { /* gone */ }
    fixture.child.kill();
    await sleep(300);
    try { fs.rmSync(browser.profile, { recursive: true, force: true }); } catch (_) { /* busy */ }
  }
  const L = ['# Job replay — ' + LABEL + ' (PC, ' + result.browser + ', CPU throttle ×' + THROTTLE + ', ' + REPEAT + ' windows of ' + WINDOW + ' s per screen, medians; NOT the Surface RT)', '',
    '| Screen | events/s | DOM mutations/s | layouts/s | recalcs/s | script ms/s | style ms/s | layout ms/s | task ms/s | long tasks (n / ms / max) | event→frame p50 / p95 / max ms | heap after GC | heap growth per window |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |'];
  Object.keys(result.screens).forEach((s) => { const m = result.screens[s].summary; L.push('| ' + s + ' | ' + m.eventsPerSecond + ' | ' + m.mutationsPerSecond + ' | ' + m.layoutsPerSecond + ' | ' + m.recalcsPerSecond + ' | ' + m.scriptMsPerSecond + ' | ' + m.styleMsPerSecond + ' | ' + m.layoutMsPerSecond + ' | ' + m.taskMsPerSecond + ' | ' + m.longTasks + ' / ' + m.longTasksMs + ' / ' + m.longTaskMaxMs + ' | ' + m.latencyP50Ms + ' / ' + m.latencyP95Ms + ' / ' + m.latencyMaxMs + ' | ' + Math.round(m.heapAfterBytes / 1024) + ' kB | ' + Math.round(m.heapGrowthBytes / 1024) + ' kB |'); });
  Object.keys(result.screens).forEach((s) => {
    const p = result.screens[s].windows[0].profile; if (!p) return;
    L.push('', '## ' + s + ': CPU profile of the first window (self time, ms over ' + WINDOW + ' s; sampled ' + p.totalMs + ' ms)', '', '| File | self ms |', '| --- | ---: |');
    p.files.forEach((f) => L.push('| ' + f.file + ' | ' + f.selfMs + ' |'));
    L.push('', '| Function | self ms |', '| --- | ---: |');
    p.functions.forEach((f) => L.push('| ' + f.where.replace(/\|/g, '\\|') + ' | ' + f.selfMs + ' |'));
  });
  result.markdown = L.join('\n');
  console.log('\n' + result.markdown + '\n');
  if (OUT) { fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(result, null, 1)); log('written ' + OUT); }
}
main().catch((e) => { console.error('measure-job: ' + (e.stack || e.message)); process.exit(1); });
