#!/usr/bin/env node
'use strict';
// Library and upload measurements on a development PC (never the tablet): the
// real monitor service and watch API of src/server (loaded through
// @babel/register, as Jest does) over a generated watch directory of N
// programs with their preview sidecars, driven first from Node (list size and
// time, sidecar reads, a 20 MB upload as JSON body versus raw stream: wall
// time, server CPU and peak RSS), then from the touch page in headless Chrome
// (Fichiers with N files: list rendering, thumbnail requests and bytes per
// page, heap).
//
//   node examples/cncjs-touch/measure-library.cjs --files 100 --out output/perf/library-100.json
//   node examples/cncjs-touch/measure-library.cjs --files 1000 --no-browser
//   node examples/cncjs-touch/measure-library.cjs --files 100 --thumbnails   (sidecars carry a 192 × 108 thumbnail)
//   options: --root DIR (pages to serve, e.g. a copy with the former shared-library.js), --upload (send the 20 MB program from the page), --repeat N, --pages N, --dir DIR
//
// preview-server.cjs --watch DIR uses attach() below to serve api/watch/* from
// the same monitor, so the page talks to the real file service.
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const SUFFIX = '.cnctouch.json';
const log = (m) => console.log(new Date().toISOString().slice(11, 19) + ' ' + m);
const r1 = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : v);
const median = (a) => { const s = a.filter((v) => typeof v === 'number' && isFinite(v)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- The server pieces, compiled on the fly like Jest does.
let server = null;
function loadServer() {
  if (server) return server;
  require('@babel/register')({ only: [(f) => f.replace(/\\/g, '/').indexOf(ROOT.replace(/\\/g, '/') + '/src/server/') === 0], presets: [['@babel/preset-env', { targets: { node: 'current' } }]], configFile: false, babelrc: false, cache: false });
  const monitor = require(path.join(ROOT, 'src/server/services/monitor')).default; // eslint-disable-line global-require
  const watch = require(path.join(ROOT, 'src/server/api/api.watch')); // eslint-disable-line global-require
  const bodyParser = require('body-parser'); // eslint-disable-line global-require
  const settings = require(path.join(ROOT, 'src/server/config/settings')).default; // eslint-disable-line global-require
  server = { monitor, watch, json: bodyParser.json(settings.middleware['body-parser'].json), settings };
  return server;
}
function startMonitor(dir) {
  const { monitor } = loadServer();
  const t0 = Date.now();
  monitor.start({ watchDirectory: dir });
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 60000;
    const poll = () => { if (monitor.isConfigured()) resolve(Date.now() - t0); else if (Date.now() > deadline) reject(new Error('monitor did not start')); else setTimeout(poll, 20); };
    poll();
  });
}
// Express-like req/res over Node's http, enough for api.watch: body-parser for
// JSON, the raw request stream otherwise, req.is(), res.status().set().send().
function attach(req, res, url) {
  const { watch, json } = loadServer();
  const route = url.pathname.replace(/^.*\/api\/watch\//, '');
  const handlers = { status: watch.getStatus, files: watch.getFiles, file: null };
  if (!Object.prototype.hasOwnProperty.call(handlers, route)) return false;
  const type = String(req.headers['content-type'] || '').split(';')[0].trim();
  req.is = (t) => (type === t ? t : false);
  req.query = Object.fromEntries(url.searchParams.entries());
  req.body = {};
  const reply = { statusCode: 200, status(c) { res.statusCode = c; return reply; }, set(n, v) { res.setHeader(n, String(v)); return reply; }, send(payload) { const body = typeof payload === 'string' ? payload : JSON.stringify(payload); if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(body); return reply; } };
  const run = () => {
    if (route === 'file') {
      if (req.method === 'PUT' || req.method === 'POST' && (req.query.write === '1')) watch.writeFile(req, reply);
      else watch.readFile(req, reply);
    } else handlers[route](req, reply);
  };
  if (type === 'application/json') json(req, res, (err) => { if (err) { res.statusCode = err.status || 400; res.end(JSON.stringify({ msg: err.message })); return; } run(); });
  else run();
  return true;
}

// --- A watch directory: N programs (the first one 20 MB when --big) and a sidecar each.
function crc32(buf) { if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0; let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
function png(width, height, paint) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 3 + 1)] = 0; for (let x = 0; x < width; x++) { const [r, g, b] = paint(x, y); const o = y * (width * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; } }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
// A toolpath-like image: dark background, a seeded set of coloured strokes.
function previewImage(seed, width, height) {
  const pixels = new Map();
  let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 1500; i++) { let x = Math.floor(rnd() * width), y = Math.floor(rnd() * height); const dx = rnd() < 0.5 ? 1 : 0, dy = 1 - dx, len = 20 + Math.floor(rnd() * 200), c = [[60, 180, 230], [170, 120, 220], [230, 70, 70], [120, 120, 120]][Math.floor(rnd() * 4)]; for (let k = 0; k < len && x < width && y < height; k++) { pixels.set(y * width + x, c); x += dx; y += dy; } }
  return png(width, height, (x, y) => pixels.get(y * width + x) || [16, 25, 30]);
}
function program(lines, seed) {
  const out = ['G21 G90 G17', 'G0 Z5', 'G0 X10 Y10', 'G1 Z-1 F300'];
  let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  let x = 10, y = 10;
  for (let i = out.length; i < lines - 1; i++) {
    x = Math.max(0, Math.min(200, x + (rnd() - 0.5) * 6)); y = Math.max(0, Math.min(200, y + (rnd() - 0.5) * 6));
    out.push(i % 17 === 0 ? 'G2 X' + x.toFixed(3) + ' Y' + y.toFixed(3) + ' I1.5 J0 F600' : 'G1 X' + x.toFixed(3) + ' Y' + y.toFixed(3) + ' F600');
  }
  out.push('M30');
  return out.join('\n') + '\n';
}
function generate(dir, count, { big = true, thumbnails = false, imageWidth = 960, imageHeight = 540 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const { fingerprint } = require(path.join(ROOT, 'src/server/services/touch/program-identity')); // eslint-disable-line global-require
  const image = 'data:image/png;base64,' + previewImage(7, imageWidth, imageHeight).toString('base64');
  const thumb = 'data:image/png;base64,' + previewImage(7, 192, 108).toString('base64');
  const trail = []; for (let i = 0; i < 1000; i++) trail.push(i * 20, Math.round(Math.random() * 2000) / 10, Math.round(Math.random() * 2000) / 10);
  const path3d = crypto.randomBytes(110000).toString('base64');
  let bigBytes = 0;
  for (let i = 0; i < count; i++) {
    const name = 'piece-' + String(i + 1).padStart(4, '0') + '--touch-20261029120000-' + (i * 2654435761 >>> 0).toString(16).padStart(16, '0') + '.nc';
    const text = i === 0 && big ? program(700000, i) : program(400 + (i % 50) * 20, i);
    fs.writeFileSync(path.join(dir, name), text);
    if (i === 0) bigBytes = Buffer.byteLength(text);
    const meta = { version: 1, file: name, originalName: 'piece-' + (i + 1) + '.nc', bytes: Buffer.byteLength(text), createdAt: '2026-10-29T12:00:00.000Z', fingerprint: fingerprint(text), size: Buffer.byteLength(text),
      preview: { image, segments: 1000, bounds: [0, 0, 200, 200], zBounds: [-1, 5], projection: { version: 1, width: 960, height: 540, bounds: [0, 0, 200, 200], units: 'mm', wcs: 'G54', relativeStart: false }, trail, trailZ: trail.filter((_, k) => k % 3 === 0).map(() => -1), lines: 1000, path3d, note: 'synthetic' } };
    if (thumbnails) meta.preview.thumbnail = thumb;
    fs.writeFileSync(path.join(dir, name + SUFFIX), JSON.stringify(meta));
    fs.utimesSync(path.join(dir, name), new Date(2026, 9, 1 + (i % 28)), new Date(2026, 9, 1 + (i % 28)));
  }
  const sidecarBytes = fs.statSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith(SUFFIX)))).size;
  return { count, bigBytes, sidecarBytes, imageBytes: image.length, thumbnailBytes: thumbnails ? thumb.length : 0 };
}

// --- Node benchmark over an http server using attach().
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => { const url = new URL(req.url, 'http://127.0.0.1'); if (!attach(req, res, url)) { res.statusCode = 404; res.end(); } });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port }));
  });
}
function fetchJson(base, method, route, { body, type, query } = {}) {
  return new Promise((resolve, reject) => {
    const t0 = process.hrtime.bigint();
    const req = http.request(base + '/api/watch/' + route + (query ? '?' + new URLSearchParams(query) : ''), { method, headers: body ? { 'Content-Type': type || 'application/json' } : {} }, (res) => {
      let size = 0; const chunks = [];
      res.on('data', (d) => { size += d.length; chunks.push(d); });
      res.on('end', () => { const ms = Number(process.hrtime.bigint() - t0) / 1e6; let parsed = null; try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { /* not JSON */ } resolve({ status: res.statusCode, bytes: size, ms, json: parsed }); });
    });
    req.on('error', reject);
    if (body) { if (typeof body === 'string' || Buffer.isBuffer(body)) req.end(body); else { body.pipe(req); } } else req.end();
  });
}
async function measured(fn) {
  const cpu0 = process.cpuUsage(); let peak = process.memoryUsage().rss; const rss0 = peak;
  const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 10);
  const t0 = Date.now();
  const value = await fn();
  clearInterval(timer);
  const cpu = process.cpuUsage(cpu0);
  return { value, wallMs: Date.now() - t0, cpuMs: r1((cpu.user + cpu.system) / 1000), peakRssBytes: peak, rssBeforeBytes: rss0 };
}

async function nodeBench(dir, info, reps) {
  const { monitor } = loadServer();
  const startMs = await startMonitor(dir);
  const { srv, base } = await serve();
  const result = { monitorStartMs: startMs, list: null, sidecarFirst: null, sidecarCached: null, sidecarThumbnail: null, uploadJson: null, uploadRaw: null, sidecarUploadJson: null, sidecarUploadRaw: null };
  try {
    const lists = [];
    for (let i = 0; i < reps; i++) lists.push(await fetchJson(base, 'POST', 'files', { body: JSON.stringify({ path: '' }) }));
    result.list = { entries: lists[0].json.files.length, bytes: lists[0].bytes, ms: r1(median(lists.map((l) => l.ms))) };
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.nc')).sort();
    const bigName = files[0];
    // First read of the big program's sidecar: the server hashes the 20 MB program; the next reads hit the fingerprint cache.
    const first = await measured(() => fetchJson(base, 'POST', 'file', { body: JSON.stringify({ file: bigName + SUFFIX }) }));
    result.sidecarFirst = { bytes: first.value.bytes, ms: r1(first.value.ms), cpuMs: first.cpuMs, stale: first.value.json && first.value.json.preview && first.value.json.preview.stale };
    const cached = [];
    for (let i = 0; i < reps; i++) cached.push(await fetchJson(base, 'POST', 'file', { body: JSON.stringify({ file: files[1 + i % (files.length - 1)] + SUFFIX }) }));
    for (let i = 0; i < reps; i++) cached.push(await fetchJson(base, 'POST', 'file', { body: JSON.stringify({ file: bigName + SUFFIX }) }));
    result.sidecarCached = { bytes: Math.round(median(cached.map((c) => c.bytes))), ms: r1(median(cached.map((c) => c.ms))) };
    const thumbs = [];
    for (let i = 0; i < reps; i++) thumbs.push(await fetchJson(base, 'POST', 'file', { body: JSON.stringify({ file: files[1 + i % (files.length - 1)] + SUFFIX, part: 'thumbnail' }) }));
    result.sidecarThumbnail = { bytes: Math.round(median(thumbs.map((c) => c.bytes))), ms: r1(median(thumbs.map((c) => c.ms))), hasThumbnail: !!(thumbs[0].json && thumbs[0].json.data && /"thumbnail"/.test(thumbs[0].json.data)), keys: thumbs[0].json && thumbs[0].json.data ? Object.keys(JSON.parse(thumbs[0].json.data).preview || {}) : [] };
    // Uploads of the big program: JSON body (what the page sent) against the raw stream.
    const text = fs.readFileSync(path.join(dir, bigName), 'utf8');
    const jsonBody = JSON.stringify({ file: 'upload-json.nc', data: text });
    const up = async (kind) => {
      const m = await measured(() => kind === 'json' ? fetchJson(base, 'PUT', 'file', { body: jsonBody }) : fetchJson(base, 'PUT', 'file', { body: Buffer.from(text), type: 'application/octet-stream', query: { file: 'upload-raw.nc' } }));
      if (m.value.status !== 200) throw new Error('upload ' + kind + ' -> ' + m.value.status + ' ' + JSON.stringify(m.value.json));
      return m;
    };
    const summarize = (list) => ({ wallMs: r1(median(list.map((m) => m.wallMs))), cpuMs: r1(median(list.map((m) => m.cpuMs))), peakRssMb: r1(median(list.map((m) => m.peakRssBytes / 1048576))), rssGrowthMb: r1(median(list.map((m) => (m.peakRssBytes - m.rssBeforeBytes) / 1048576))) });
    const js = [], raws = [];
    for (let i = 0; i < reps; i++) { js.push(await up('json')); raws.push(await up('raw')); await sleep(200); }
    result.uploadJson = { bytes: Buffer.byteLength(jsonBody), ...summarize(js) }; result.uploadRaw = { bytes: Buffer.byteLength(text), ...summarize(raws) };
    // The sidecar (a 1 MB JSON with the base64 image) as JSON-in-JSON against raw.
    const sidecarText = fs.readFileSync(path.join(dir, bigName + SUFFIX), 'utf8');
    const sj = [], sr = [];
    for (let i = 0; i < reps; i++) {
      sj.push(await measured(() => fetchJson(base, 'PUT', 'file', { body: JSON.stringify({ file: 'upload-json.nc' + SUFFIX, data: sidecarText }) })));
      sr.push(await measured(() => fetchJson(base, 'PUT', 'file', { body: Buffer.from(sidecarText), type: 'application/octet-stream', query: { file: 'upload-raw.nc' + SUFFIX } })));
    }
    result.sidecarUploadJson = { bytes: Buffer.byteLength(JSON.stringify({ file: 'x', data: sidecarText })), ...summarize(sj) }; result.sidecarUploadRaw = { bytes: Buffer.byteLength(sidecarText), ...summarize(sr) };
    ['upload-json.nc', 'upload-raw.nc', 'upload-json.nc' + SUFFIX, 'upload-raw.nc' + SUFFIX].forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (_) { /* absent */ } });
  } finally { srv.close(); monitor.stop(); }
  return result;
}

// --- The touch page over the same monitor (preview-server.cjs --watch DIR).
async function browserBench(dir, info, pages, root, upload) {
  const { launchBrowser, startFixture, navigate, waitReady, goScreen, setViewport } = require('./browser-run.cjs'); // eslint-disable-line global-require
  const fixture = await startFixture(['--watch', dir].concat(root ? ['--root', path.resolve(root)] : []));
  const browser = await launchBrowser(1366, 768);
  const cdp = browser.cdp;
  const requests = [];
  const pending = new Map();
  cdp.on('Network.requestWillBeSent', (p) => { pending.set(p.requestId, { url: p.request.url, at: Date.now() }); });
  cdp.on('Network.loadingFinished', (p) => { const r = pending.get(p.requestId); if (r) { r.encoded = p.encodedDataLength; r.done = Date.now(); requests.push(r); } });
  const result = { files: info.count, listRenderMs: null, firstPage: null, nextPages: [], refreshMs: null, heapAfterGcBytes: null, filesScreen: null };
  try {
    await setViewport(cdp, 1366, 768, 1);
    await navigate(cdp, fixture.base + 'index.html');
    await waitReady(cdp);
    await new Promise((r) => setTimeout(r, 1500));
    requests.length = 0;
    const t0 = Date.now();
    await cdp.evaluate('window.cncShell.go("files");true');
    await cdp.waitFor('document.querySelectorAll(".library-file").length>0', 60000, 'file rows');
    result.listRenderMs = Date.now() - t0;
    const listReq = requests.filter((r) => /api\/watch\/files/.test(r.url));
    result.listRequest = listReq.length ? { bytes: listReq[0].encoded, ms: listReq[0].done - listReq[0].at } : null;
    // Thumbnails of the first page: wait until every row shows one (or 30 s).
    const waitThumbs = async () => { const t = Date.now(); try { await cdp.waitFor('(function(){var rows=document.querySelectorAll(".library-file");var n=0;rows.forEach(function(r){var i=r.querySelector("img");if(i&&!i.hidden&&i.getAttribute("src"))n++;});return rows.length>0&&n===rows.length;})()', 30000, 'thumbnails'); } catch (_) { return null; } return Date.now() - t; };
    const page = async () => {
      const before = requests.length;
      const ms = await waitThumbs();
      const thumbReqs = requests.slice(before).filter((r) => /api\/watch\/file\b/.test(r.url));
      return { ms, requests: thumbReqs.length, bytes: thumbReqs.reduce((a, r) => a + (r.encoded || 0), 0), rows: await cdp.evaluate('document.querySelectorAll(".library-file").length') };
    };
    result.firstPage = await page();
    for (let i = 0; i < pages; i++) {
      const more = await cdp.evaluate('(function(){var b=document.getElementById("library-more");if(!b||b.hidden)return false;b.click();return true;})()');
      if (!more) break;
      result.nextPages.push(await page());
    }
    // A manual refresh with the same list: list request plus re-render.
    const m0 = metricsMap(await cdp.send('Performance.getMetrics'));
    const t1 = Date.now();
    await cdp.evaluate('document.getElementById("library-refresh").click();true');
    await cdp.waitFor('/À jour/.test(document.getElementById("library-status").textContent)', 30000, 'refresh done');
    result.refreshMs = Date.now() - t1;
    const m1 = metricsMap(await cdp.send('Performance.getMetrics'));
    result.refreshScriptMs = r1((m1.ScriptDuration - m0.ScriptDuration) * 1000); result.refreshLayoutMs = r1((m1.LayoutDuration - m0.LayoutDuration) * 1000);
    try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) { /* optional */ }
    result.heapAfterGcBytes = (await cdp.send('Runtime.getHeapUsage')).usedSize;
    result.domNodes = m1.Nodes;
    // Upload of the big program through the page itself (file input, « Envoyer »): read,
    // preview in the worker, then the writes. Wall time, main-thread script/task time and
    // long tasks of the page, bytes sent.
    if (upload) {
      const big = fs.readdirSync(dir).filter((f) => f.endsWith('.nc')).sort()[0];
      const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cnc-touch-upload-')), copy = path.join(copyDir, 'gros-programme.nc');
      fs.copyFileSync(path.join(dir, big), copy);
      await cdp.evaluate('(function(){window.__up={long:[]};try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){window.__up.long.push(Math.round(e.duration));});}).observe({entryTypes:["longtask"]});}catch(_){}return true;})()');
      await cdp.send('DOM.enable');
      const doc = await cdp.send('DOM.getDocument', { depth: 0 });
      const input = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#library-input' });
      const sentBefore = requests.length;
      const u0 = metricsMap(await cdp.send('Performance.getMetrics')), t2 = Date.now();
      await cdp.send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [copy] });
      await cdp.evaluate('(function(){var b=document.getElementById("library-send");b.disabled=false;b.click();return true;})()');
      let outcome = '';
      try { await cdp.waitFor('/^\u2713|non confirm|non enregistr|refus|Annul/.test(document.getElementById("library-upload-status").textContent)', 300000, 'upload finished'); } catch (e) { outcome = 'timeout'; }
      const wall = Date.now() - t2, u1 = metricsMap(await cdp.send('Performance.getMetrics'));
      const up = await cdp.evaluate('({status:document.getElementById("library-upload-status").textContent,long:window.__up.long})');
      const puts = requests.slice(sentBefore).filter((r) => /api\/watch\/file/.test(r.url));
      result.upload = { programBytes: fs.statSync(copy).size, wallMs: wall, outcome: outcome || (/^\u2713/.test(up.status) ? 'ok' : 'failed'), status: up.status.slice(0, 160), scriptMs: r1((u1.ScriptDuration - u0.ScriptDuration) * 1000), taskMs: r1((u1.TaskDuration - u0.TaskDuration) * 1000), longTasks: up.long.length, longTasksMs: up.long.reduce((a, b) => a + b, 0), longTaskMaxMs: up.long.length ? Math.max(...up.long) : 0, requests: puts.length };
      try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) { /* optional */ }
      result.upload.heapAfterGcBytes = (await cdp.send('Runtime.getHeapUsage')).usedSize;
      fs.rmSync(copyDir, { recursive: true, force: true });
    }
  } finally {
    cdp.close();
    try { await cdp.send('Browser.close', {}, 3000); } catch (_) { /* closed */ }
    try { browser.child.kill(); } catch (_) { /* gone */ }
    fixture.child.kill();
    await sleep(300);
    try { fs.rmSync(browser.profile, { recursive: true, force: true }); } catch (_) { /* busy */ }
  }
  return result;
}
function metricsMap(result) { const m = {}; (result.metrics || []).forEach((x) => { m[x.name] = x.value; }); return m; }

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback; };
  const count = Math.max(2, Number(option('--files', 100)) || 100);
  const reps = Math.max(1, Number(option('--repeat', 5)) || 5);
  const pages = Math.max(0, Number(option('--pages', 2)) || 2);
  const thumbnails = args.includes('--thumbnails');
  const root = option('--root', ''), upload = args.includes('--upload');
  const label = option('--label', 'files-' + count + (thumbnails ? '-thumbnails' : ''));
  const out = option('--out', '');
  const dir = option('--dir', '') || fs.mkdtempSync(path.join(os.tmpdir(), 'cnc-touch-library-'));
  const keep = !!option('--dir', '');
  log('generating ' + count + ' programs in ' + dir + (thumbnails ? ' (sidecars with thumbnails)' : ''));
  const info = generate(dir, count, { thumbnails });
  log('generated: big program ' + Math.round(info.bigBytes / 1048576 * 10) / 10 + ' MB, sidecar ' + Math.round(info.sidecarBytes / 1024) + ' kB (image ' + Math.round(info.imageBytes / 1024) + ' kB)');
  const result = { label, date: new Date().toISOString(), node: process.version, platform: os.platform() + ' ' + os.release() + ' ' + os.cpus()[0].model, files: info, node_: null, browser: null };
  result.nodeBench = await nodeBench(dir, info, reps);
  log('node: list ' + result.nodeBench.list.entries + ' entries, ' + Math.round(result.nodeBench.list.bytes / 1024) + ' kB in ' + result.nodeBench.list.ms + ' ms; sidecar first ' + result.nodeBench.sidecarFirst.ms + ' ms, cached ' + result.nodeBench.sidecarCached.ms + ' ms (' + Math.round(result.nodeBench.sidecarCached.bytes / 1024) + ' kB), thumbnail part ' + Math.round(result.nodeBench.sidecarThumbnail.bytes / 1024) + ' kB; upload JSON ' + result.nodeBench.uploadJson.wallMs + ' ms / cpu ' + result.nodeBench.uploadJson.cpuMs + ' ms / +' + result.nodeBench.uploadJson.rssGrowthMb + ' MB, raw ' + result.nodeBench.uploadRaw.wallMs + ' ms / cpu ' + result.nodeBench.uploadRaw.cpuMs + ' ms / +' + result.nodeBench.uploadRaw.rssGrowthMb + ' MB');
  if (!args.includes('--no-browser')) {
    result.browser = await browserBench(dir, info, pages, root, upload);
    log('browser: rows in ' + result.browser.listRenderMs + ' ms (list ' + (result.browser.listRequest ? Math.round(result.browser.listRequest.bytes / 1024) + ' kB' : '?') + '), first page thumbnails ' + JSON.stringify(result.browser.firstPage) + ', refresh ' + result.browser.refreshMs + ' ms, heap ' + Math.round(result.browser.heapAfterGcBytes / 1024) + ' kB');
  }
  if (!keep) fs.rmSync(dir, { recursive: true, force: true });
  const n = result.nodeBench, b = result.browser;
  const L = ['# Library — ' + label + ' (PC, Node ' + process.version + ', NOT the Surface RT)', '', '| Measure | Value |', '| --- | --- |',
    '| Programs / sidecars | ' + info.count + ' / ' + info.count + ' (big program ' + r1(info.bigBytes / 1048576) + ' MB, sidecar ' + Math.round(info.sidecarBytes / 1024) + ' kB) |',
    '| Monitor start (directory walk) | ' + n.monitorStartMs + ' ms |', '| `files` list | ' + n.list.entries + ' entries, ' + Math.round(n.list.bytes / 1024) + ' kB, ' + n.list.ms + ' ms |',
    '| Sidecar read, first (program hashed) | ' + n.sidecarFirst.ms + ' ms, cpu ' + n.sidecarFirst.cpuMs + ' ms, ' + Math.round(n.sidecarFirst.bytes / 1024) + ' kB |', '| Sidecar read, cached fingerprint | ' + n.sidecarCached.ms + ' ms, ' + Math.round(n.sidecarCached.bytes / 1024) + ' kB |',
    '| Sidecar read, `part: thumbnail` | ' + n.sidecarThumbnail.ms + ' ms, ' + Math.round(n.sidecarThumbnail.bytes / 1024) + ' kB (thumbnail present: ' + n.sidecarThumbnail.hasThumbnail + ') |',
    '| Upload 20 MB as JSON body | ' + n.uploadJson.wallMs + ' ms wall, ' + n.uploadJson.cpuMs + ' ms cpu, peak RSS ' + n.uploadJson.peakRssMb + ' MB (+' + n.uploadJson.rssGrowthMb + ') |', '| Upload 20 MB as raw stream | ' + n.uploadRaw.wallMs + ' ms wall, ' + n.uploadRaw.cpuMs + ' ms cpu, peak RSS ' + n.uploadRaw.peakRssMb + ' MB (+' + n.uploadRaw.rssGrowthMb + ') |',
    '| Sidecar upload as JSON-in-JSON | ' + n.sidecarUploadJson.wallMs + ' ms wall, ' + n.sidecarUploadJson.cpuMs + ' ms cpu, +' + n.sidecarUploadJson.rssGrowthMb + ' MB |', '| Sidecar upload as raw stream | ' + n.sidecarUploadRaw.wallMs + ' ms wall, ' + n.sidecarUploadRaw.cpuMs + ' ms cpu, +' + n.sidecarUploadRaw.rssGrowthMb + ' MB |'];
  if (b) L.push('| Page: Fichiers rows shown | ' + b.listRenderMs + ' ms (list response ' + (b.listRequest ? Math.round(b.listRequest.bytes / 1024) + ' kB in ' + b.listRequest.ms + ' ms' : '?') + ') |', '| Page: first page thumbnails | ' + (b.firstPage.ms === null ? 'incomplete after 30 s' : b.firstPage.ms + ' ms') + ', ' + b.firstPage.requests + ' requests, ' + Math.round(b.firstPage.bytes / 1024) + ' kB for ' + b.firstPage.rows + ' rows |',
    ...b.nextPages.map((p, i) => '| Page: next page ' + (i + 1) + ' thumbnails | ' + (p.ms === null ? 'incomplete' : p.ms + ' ms') + ', ' + p.requests + ' requests, ' + Math.round(p.bytes / 1024) + ' kB |'),
    ...(b.upload ? ['| Page: upload of the ' + r1(b.upload.programBytes / 1048576) + ' MB program (read, preview, writes) | ' + b.upload.outcome + ', ' + b.upload.wallMs + ' ms wall, main thread script ' + b.upload.scriptMs + ' ms / task ' + b.upload.taskMs + ' ms, long tasks ' + b.upload.longTasks + ' (' + b.upload.longTasksMs + ' ms, max ' + b.upload.longTaskMaxMs + ') |'] : []),
    '| Page: manual refresh | ' + b.refreshMs + ' ms (script ' + b.refreshScriptMs + ' ms, layout ' + b.refreshLayoutMs + ' ms) |', '| Page: JS heap after GC / DOM nodes | ' + Math.round(b.heapAfterGcBytes / 1024) + ' kB / ' + b.domNodes + ' |');
  result.markdown = L.join('\n');
  console.log('\n' + result.markdown + '\n');
  if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(result, null, 1)); log('written ' + out); }
}

if (require.main === module) main().catch((e) => { console.error('measure-library: ' + (e.stack || e.message)); process.exit(1); });
module.exports = { attach, startMonitor, generate, loadServer };
