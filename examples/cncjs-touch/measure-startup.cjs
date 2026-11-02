#!/usr/bin/env node
'use strict';
// Start-up measurement of the touch page on a development PC (headless Chrome
// through the DevTools protocol, never the tablet): cold and warm loads against
// the local fixture served with the validation headers CNCjs sends
// (ETag/Last-Modified, max-age=0: a warm start revalidates every file), the
// number of requests and 304s, bytes, time to the shell, per-load script,
// style and layout time (Performance.getMetrics deltas), heap after GC, and
// optionally a trace attributing compile and evaluation time to each script.
//
//   node examples/cncjs-touch/measure-startup.cjs --out output/perf/startup-before.json
//   node examples/cncjs-touch/measure-startup.cjs --root output/touch-bundle --label bundle --gzip --throttle 4 --trace 3
//
// Options: --root DIR (pages to serve, default touch/), --page index.html,
// --repeat N (default 7), --throttle K (CPU throttling rate, default 1),
// --gzip, --trace N (traced cold loads, default 0), --label TEXT, --out FILE.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { CDP, launchBrowser, startFixture, navigate, waitReady, setViewport, sleep, median } = require('./browser-run.cjs');

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback; };
const ROOT = option('--root', '');
const PAGE = option('--page', 'index.html');
const REPEAT = Math.max(1, Number(option('--repeat', 7)) || 7);
const THROTTLE = Math.max(1, Number(option('--throttle', 1)) || 1);
const GZIP = args.includes('--gzip');
const TRACE = Math.max(0, Number(option('--trace', 0)) || 0);
const LABEL = option('--label', ROOT ? path.basename(ROOT) : 'source');
const OUT = option('--out', '');
const log = (m) => console.log(new Date().toISOString().slice(11, 19) + ' ' + m);
const r1 = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : v);

const COLLECT = String(function collect() {
  var nav = performance.getEntriesByType('navigation')[0] || {}, entries = performance.getEntriesByType('resource');
  var bytes = 0, decoded = 0, byType = {};
  entries.forEach(function (e) {
    var ext = (e.name.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i) || [])[1] || '';
    var type = /^(js|cjs)$/.test(ext) ? 'script' : ext === 'css' ? 'style' : e.initiatorType === 'xmlhttprequest' || e.initiatorType === 'fetch' ? 'xhr' : 'other';
    byType[type] = (byType[type] || 0) + 1; bytes += e.transferSize || 0; decoded += e.decodedBodySize || 0;
  });
  return { readyAt: window.__cncReadyAt || null, domContentLoaded: nav.domContentLoadedEventEnd, loadEventEnd: nav.loadEventEnd, responseEnd: nav.responseEnd,
    resources: entries.length, byType: byType, transferBytes: bytes, decodedBytes: decoded, domNodes: document.getElementsByTagName('*').length };
});

function metricsMap(result) { const m = {}; (result.metrics || []).forEach((x) => { m[x.name] = x.value; }); return m; }
// Performance.getMetrics describes the current document (the navigation resets it).
function perDocument(m) {
  return { scriptMs: r1(m.ScriptDuration * 1000), styleMs: r1(m.RecalcStyleDuration * 1000), layoutMs: r1(m.LayoutDuration * 1000), taskMs: r1(m.TaskDuration * 1000), layouts: m.LayoutCount, recalcs: m.RecalcStyleCount };
}

async function load(cdp, url, cold, index, requests) {
  if (cold) await cdp.send('Network.clearBrowserCache');
  requests.length = 0;
  await navigate(cdp, url + '?run=' + (cold ? 'cold' : 'warm') + index);
  await waitReady(cdp);
  await sleep(1500);
  const after = metricsMap(await cdp.send('Performance.getMetrics'));
  const page = await cdp.evaluate('(' + COLLECT + ')()');
  try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) { /* optional */ }
  const heap = await cdp.send('Runtime.getHeapUsage');
  const statuses = { 200: 0, 304: 0, cache: 0, other: 0 };
  let encoded = 0;
  requests.forEach((r) => { if (r.fromCache) statuses.cache++; else if (r.status === 200) statuses[200]++; else if (r.status === 304) statuses[304]++; else statuses.other++; encoded += r.encoded || 0; });
  return { ...page, ...perDocument(after), heapAfterGc: heap.usedSize, requests: requests.length, statuses, encodedBytes: encoded };
}

// A trace of one cold load: compile and evaluation per script, style sheet
// parsing, style/layout/parse HTML totals on the main thread.
async function traced(cdp, url, index) {
  const events = [];
  cdp.on('Tracing.dataCollected', (p) => { events.push(...(p.value || [])); });
  const done = cdp.once('Tracing.tracingComplete', 120000);
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'v8', 'v8.execute', 'disabled-by-default-v8.compile', 'toplevel'], excludedCategories: ['*'] }, transferMode: 'ReportEvents' });
  await navigate(cdp, url + '?trace=' + index);
  await waitReady(cdp);
  await sleep(1500);
  await cdp.send('Tracing.end');
  await done;
  const perUrl = {}, totals = {}, threads = {};
  const name = (u) => String(u || '').replace(/^https?:\/\/[^/]+\//, '').split('?')[0] || '(inline)';
  const add = (key, k, ms) => { const e = perUrl[key] || (perUrl[key] = { compileMs: 0, evaluateMs: 0, styleMs: 0 }); e[k] += ms; };
  events.forEach((e) => {
    if (e.ph !== 'X' || typeof e.dur !== 'number') return;
    const ms = e.dur / 1000, d = (e.args && e.args.data) || {};
    totals[e.name] = (totals[e.name] || 0) + ms;
    if (e.name === 'ThreadControllerImpl::RunTask' || e.name === 'RunTask') threads[e.tid] = (threads[e.tid] || 0) + ms;
    if ((e.name === 'v8.compile' || e.name === 'v8.parseOnBackground' || e.name === 'V8.CompileScript' || e.name === 'v8.deserializeOnBackground') && d.url) add(name(d.url), 'compileMs', ms);
    else if (e.name === 'EvaluateScript' && d.url) add(name(d.url), 'evaluateMs', ms);
    else if (e.name === 'ParseAuthorStyleSheet' && d.styleSheetUrl) add(name(d.styleSheetUrl), 'styleMs', ms);
  });
  const scripts = Object.keys(perUrl).map((k) => ({ file: k, compileMs: r1(perUrl[k].compileMs), evaluateMs: r1(perUrl[k].evaluateMs), styleMs: r1(perUrl[k].styleMs) })).sort((a, b) => (b.compileMs + b.evaluateMs + b.styleMs) - (a.compileMs + a.evaluateMs + a.styleMs));
  const pick = (n) => r1(totals[n] || 0);
  // The renderer main thread is the busiest one running tasks until the page is ready.
  const mainThreadMs = r1(Math.max.apply(null, Object.keys(threads).map((t) => threads[t]).concat([0])));
  return { scripts, totals: { mainThreadMs, compileMs: r1(pick('v8.compile') + pick('v8.parseOnBackground') + pick('V8.CompileScript')), evaluateMs: pick('EvaluateScript'), functionCallMs: pick('FunctionCall'), parseHtmlMs: pick('ParseHTML'), styleSheetMs: pick('ParseAuthorStyleSheet'), recalcStyleMs: pick('UpdateLayoutTree'), layoutMs: pick('Layout'), paintMs: pick('Paint'), events: events.length } };
}

function stats(list) {
  const pick = (fn) => median(list.map(fn));
  return { runs: list.length, readyAtMs: r1(pick((x) => x.readyAt)), domContentLoadedMs: r1(pick((x) => x.domContentLoaded)), loadEventEndMs: r1(pick((x) => x.loadEventEnd)),
    requests: pick((x) => x.requests), status200: pick((x) => x.statuses[200]), status304: pick((x) => x.statuses[304]), fromCache: pick((x) => x.statuses.cache), resources: pick((x) => x.resources), scripts: pick((x) => x.byType.script || 0), styles: pick((x) => x.byType.style || 0),
    transferBytes: pick((x) => x.transferBytes), encodedBytes: pick((x) => x.encodedBytes), decodedBytes: pick((x) => x.decodedBytes), heapAfterGcBytes: pick((x) => x.heapAfterGc), domNodes: pick((x) => x.domNodes),
    scriptMs: r1(pick((x) => x.scriptMs)), styleMs: r1(pick((x) => x.styleMs)), layoutMs: r1(pick((x) => x.layoutMs)), taskMs: r1(pick((x) => x.taskMs)), layouts: pick((x) => x.layouts), recalcs: pick((x) => x.recalcs) };
}

async function main() {
  const fixtureArgs = [].concat(ROOT ? ['--root', path.resolve(ROOT)] : [], GZIP ? ['--gzip'] : []);
  const fixture = await startFixture(fixtureArgs);
  const url = fixture.base + PAGE;
  const browser = await launchBrowser(1366, 768);
  const cdp = browser.cdp;
  log('browser ' + browser.version + ', fixture ' + url + ', label ' + LABEL + ', throttle ' + THROTTLE + (GZIP ? ', gzip' : ''));
  const requests = [];
  const pending = new Map();
  cdp.on('Network.requestWillBeSent', (p) => { pending.set(p.requestId, { url: p.request.url }); });
  cdp.on('Network.responseReceived', (p) => { const r = pending.get(p.requestId) || {}; r.status = p.response.status; r.fromCache = !!(p.response.fromDiskCache || p.response.fromPrefetchCache); r.encoded = p.response.encodedDataLength; if (!r.fromCache && p.response.status === 200 && p.response.protocol === 'blob') r.fromCache = true; requests.push(r); });
  cdp.on('Network.loadingFinished', (p) => { const r = pending.get(p.requestId); if (r) r.encoded = p.encodedDataLength; });
  const result = { label: LABEL, root: ROOT || 'touch', page: PAGE, date: new Date().toISOString(), browser: browser.version, node: process.version, platform: os.platform() + ' ' + os.release() + ' ' + os.cpus()[0].model, throttle: THROTTLE, gzip: GZIP, repeat: REPEAT, cold: null, warm: null, runs: { cold: [], warm: [] }, traces: [] };
  try {
    await setViewport(cdp, 1366, 768, 1);
    if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    // One untimed load first: the browser's own caches (fonts, shaders) are warm for every run.
    await load(cdp, url, true, 0, requests);
    for (let i = 1; i <= REPEAT; i++) {
      const cold = await load(cdp, url, true, i, requests);
      const warm = await load(cdp, url, false, i, requests);
      result.runs.cold.push(cold); result.runs.warm.push(warm);
      log('run ' + i + '/' + REPEAT + ': cold ready ' + r1(cold.readyAt) + ' ms (' + cold.requests + ' req, ' + cold.statuses[200] + '×200), warm ready ' + r1(warm.readyAt) + ' ms (' + warm.requests + ' req, ' + warm.statuses[304] + '×304, ' + warm.statuses.cache + ' cache), script ' + cold.scriptMs + ' / ' + warm.scriptMs + ' ms');
    }
    result.cold = stats(result.runs.cold); result.warm = stats(result.runs.warm);
    for (let i = 1; i <= TRACE; i++) {
      const t = await traced(cdp, url, i);
      result.traces.push(t);
      log('trace ' + i + '/' + TRACE + ': main thread ' + t.totals.mainThreadMs + ' ms, compile ' + t.totals.compileMs + ' ms, evaluate ' + t.totals.evaluateMs + ' ms, style sheets ' + t.totals.styleSheetMs + ' ms, recalc ' + t.totals.recalcStyleMs + ' ms, layout ' + t.totals.layoutMs + ' ms');
    }
    if (result.traces.length) {
      // Median per file across the traces, sorted by total.
      const files = {};
      result.traces.forEach((t) => t.scripts.forEach((s) => { (files[s.file] = files[s.file] || []).push(s); }));
      result.traceMedian = Object.keys(files).map((f) => ({ file: f, compileMs: r1(median(files[f].map((s) => s.compileMs))), evaluateMs: r1(median(files[f].map((s) => s.evaluateMs))), styleMs: r1(median(files[f].map((s) => s.styleMs))) })).sort((a, b) => (b.compileMs + b.evaluateMs + b.styleMs) - (a.compileMs + a.evaluateMs + a.styleMs));
      const tot = {}; Object.keys(result.traces[0].totals).forEach((k) => { tot[k] = r1(median(result.traces.map((t) => t.totals[k]))); }); result.traceTotals = tot;
    }
  } finally {
    cdp.close();
    try { await cdp.send('Browser.close', {}, 3000); } catch (_) { /* closed */ }
    try { browser.child.kill(); } catch (_) { /* gone */ }
    fixture.child.kill();
    await sleep(300);
    try { fs.rmSync(browser.profile, { recursive: true, force: true }); } catch (_) { /* busy */ }
  }
  const fmt = (b) => (typeof b === 'number' ? Math.round(b / 1024) + ' kB' : '—');
  const rows = [['Shell ready, ms', 'readyAtMs'], ['DOMContentLoaded, ms', 'domContentLoadedMs'], ['load, ms', 'loadEventEndMs'], ['Requests', 'requests'], ['200 / 304 / memory cache', (s) => s.status200 + ' / ' + s.status304 + ' / ' + s.fromCache],
    ['Scripts / styles', (s) => s.scripts + ' / ' + s.styles], ['Transferred (encoded) / decoded', (s) => fmt(s.encodedBytes) + ' / ' + fmt(s.decodedBytes)], ['Script / style / layout / task, ms', (s) => s.scriptMs + ' / ' + s.styleMs + ' / ' + s.layoutMs + ' / ' + s.taskMs],
    ['Layouts / style recalcs', (s) => s.layouts + ' / ' + s.recalcs], ['JS heap after GC', (s) => fmt(s.heapAfterGcBytes)], ['DOM nodes', 'domNodes']];
  const L = ['# Start-up — ' + LABEL + ' (PC, ' + result.browser + ', CPU throttle ×' + THROTTLE + (GZIP ? ', gzip' : '') + ', ' + REPEAT + ' runs, medians; NOT the Surface RT)', '', '| | Cold | Warm |', '| --- | ---: | ---: |'];
  rows.forEach(([label, k]) => { const f = typeof k === 'function' ? k : (s) => s[k]; L.push('| ' + label + ' | ' + f(result.cold) + ' | ' + f(result.warm) + ' |'); });
  if (result.traceMedian) {
    L.push('', '## Trace of a cold load (medians of ' + result.traces.length + '): totals, ms', '', '| main thread tasks | compile (incl. background) | evaluate | function calls | parse HTML | style sheets | style recalc | layout | paint |', '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    const t = result.traceTotals; L.push('| ' + [t.mainThreadMs, t.compileMs, t.evaluateMs, t.functionCallMs, t.parseHtmlMs, t.styleSheetMs, t.recalcStyleMs, t.layoutMs, t.paintMs].join(' | ') + ' |');
    L.push('', '| File | compile ms | evaluate ms | style sheet ms |', '| --- | ---: | ---: | ---: |');
    result.traceMedian.slice(0, 25).forEach((s) => L.push('| ' + s.file + ' | ' + s.compileMs + ' | ' + s.evaluateMs + ' | ' + s.styleMs + ' |'));
  }
  result.markdown = L.join('\n');
  console.log('\n' + result.markdown + '\n');
  if (OUT) { fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(result, null, 1)); log('written ' + OUT); }
}
main().catch((e) => { console.error('measure-startup: ' + (e.stack || e.message)); process.exit(1); });
