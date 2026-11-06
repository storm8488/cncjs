#!/usr/bin/env node
'use strict';
// Tablet measurements of the live 3D view (PERFORMANCE-UI-SPEC.md 10: M1, M2, M5, M7), through the
// DevTools port of the second Chromium the measurer opened on the Surface (brief § 6: DISPLAY=:0,
// GPU profile, not headless, --remote-debugging-port >= 9230, a candidate published under /touch-next/).
// This script only attaches to that port: it launches nothing, kills nothing, never touches the kiosk
// Chromium, and sends nothing to the controller (it reads the page, and its only input is a touch
// gesture inside the 3D view's canvas, which never leaves the canvas).
//
//   node measure-preview-gl-tablet.cjs --port 9230 [--match /touch-next/] [--seconds 10] [--job-seconds 60] [--paint 100] [--out m.json]
//
// Before: open Suivi (or Fichiers) with a program whose preview has a 3D path, so that a 3D view is
// open in the measured page; for M7, start the job (simulator) and leave Suivi visible.
//   M1  rotation gesture of --seconds s in the canvas: frames drawn by the view (stats().gestureFrames),
//       compositor frame intervals (median, p95, > 50 ms), JS time per frame (lastPaintMs, maxPaintMs).
//   M2  steady drawing: --paint frames after the first, each paint() followed by gl.finish() (GPU time
//       included); skipped while a job runs (it blocks the page for that time).
//   M5  JS heap after a forced GC (performance.memory), the view's uploads.
//   M7  during a job, for --job-seconds s: frames per second, status reports per second, frames per
//       report (no frame is asked once the marker reached the last report: frames ≤ ~ reports × interval).
// Requires Node 22 or later (global WebSocket). Each figure is printed with its provenance (Chromium,
// window, DPR, renderer, geometry, segments): a figure without it is not a result.
const fs = require('node:fs'), http = require('node:http');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback; };
const PORT = Number(arg('--port', 0)), MATCH = arg('--match', '/touch-next/'), SECONDS = Number(arg('--seconds', 10)) || 10;
const JOB_SECONDS = Number(arg('--job-seconds', 0)) || 0, PAINT = Math.max(0, Number(arg('--paint', 100)) || 0), OUT = arg('--out', '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!(PORT >= 9230)) { console.error('Usage: node measure-preview-gl-tablet.cjs --port <9230 or more> [--match /touch-next/] [--seconds 10] [--job-seconds 60] [--paint 100] [--out file.json]'); process.exit(2); }
if (typeof WebSocket !== 'function') { console.error('Node 22 or later is needed (global WebSocket).'); process.exit(2); }

function getJson(url) { return new Promise((resolve, reject) => { http.get(url, res => { let b = ''; res.on('data', d => { b += d; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } }); }).on('error', reject); }); }
class CDP {
  constructor(url) { this.url = url; this.seq = 0; this.pending = new Map(); }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url); this.ws = ws;
      ws.addEventListener('open', () => resolve()); ws.addEventListener('error', e => reject(new Error('WebSocket error ' + (e.message || ''))));
      ws.addEventListener('message', e => { const msg = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString()); const p = msg.id && this.pending.get(msg.id); if (p) { this.pending.delete(msg.id); if (msg.error) p.reject(new Error(msg.error.message + ' (' + p.method + ')')); else p.resolve(msg.result || {}); } });
    });
  }
  send(method, params) { return new Promise((resolve, reject) => { const id = ++this.seq; this.pending.set(id, { resolve, reject, method }); this.ws.send(JSON.stringify({ id, method, params: params || {} })); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 120000); }); }
  async evaluate(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page exception: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 400)); return r.result.value; }
  close() { try { this.ws.close(); } catch (_) { /* ignore */ } }
}
const quantiles = list => { const s = list.slice().sort((a, b) => a - b); return s.length ? { n: s.length, median: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)], p99: s[Math.floor(s.length * 0.99)], max: s[s.length - 1] } : { n: 0 }; };
const r2 = v => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

(async () => {
  const version = await getJson('http://127.0.0.1:' + PORT + '/json/version');
  const targets = await getJson('http://127.0.0.1:' + PORT + '/json/list');
  const target = targets.find(t => t.type === 'page' && t.url.includes(MATCH));
  if (!target) throw new Error('no page whose address contains ' + MATCH + ' on port ' + PORT);
  const cdp = new CDP(target.webSocketDebuggerUrl); await cdp.connect();
  const VIEW = '(window.CNCPreviewGL&&typeof CNCPreviewGL.view==="function"?CNCPreviewGL.view():null)';
  const env = await cdp.evaluate('({url:location.href,ua:navigator.userAgent,window:[innerWidth,innerHeight],dpr:devicePixelRatio,profile:window.cncProfile&&cncProfile.performance(),' +
    'gpu:window.cncGpu?cncGpu.state():null,wide:document.body.classList.contains("perf-wide"),view:' + VIEW + '?(function(s){return {gpu:s.gpu,software:s.software,dpr:s.dpr,antialias:s.antialias,lineWidth:s.lineWidth,geometry:s.geometry,segments:s.segments,geometryReason:s.geometryReason,canvas:s.canvas,workflow:s.live&&s.live.workflow};})(' + VIEW + '.state()):null})');
  const result = { at: new Date().toISOString(), chromium: version.Browser, env };
  console.log('Chromium ' + version.Browser + ' · ' + env.url);
  console.log('Fenêtre ' + env.window.join(' × ') + ' px CSS, DPR ' + env.dpr + ', profil ' + env.profile + ', porte GPU ' + JSON.stringify(env.gpu && { hardware: env.gpu.hardware, lost: env.gpu.lost, reason: env.gpu.reason, renderer: env.gpu.renderer }));
  if (!env.view) throw new Error('no 3D view open in the page: open Suivi or Fichiers with a 3D preview, then run again');
  console.log('Vue : ' + JSON.stringify(env.view));

  // ---- M1: rotation gesture in the canvas ----
  // A point of the canvas that is not under one of its buttons (the gesture must start in the canvas).
  const rect = await cdp.evaluate('(function(c){var r=c.getBoundingClientRect();for(var gy=0.5;gy<0.95;gy+=0.1)for(var gx=0.5;gx<0.95;gx+=0.1){var x=r.left+r.width*gx,y=r.top+r.height*gy;' +
    'if(document.elementFromPoint(x,y)===c)return {x:x,y:y,w:Math.min(r.right-x,x-r.left)*2,h:Math.min(r.bottom-y,y-r.top)*2};}return null;})(' + VIEW + '.canvas)');
  if (!rect) throw new Error('the 3D view canvas is covered: no point to start the gesture');
  await cdp.evaluate('(function(c){window.__pglDown=0;c.addEventListener("pointerdown",window.__pglFn=function(){window.__pglDown++;},true);return true;})(' + VIEW + '.canvas)');
  const before = await cdp.evaluate(VIEW + '.stats()');
  await cdp.evaluate('(function(){var m=window.__pglMeasure={t:[],on:true};function f(ts){if(!m.on)return;m.t.push(ts);requestAnimationFrame(f);}requestAnimationFrame(f);return true;})()');
  // One move per animation frame, generated in the page: a CDP round trip per event (about 20/s here)
  // would measure the injection rate, not the drawing.
  const radius = Math.min(rect.w, rect.h) / 4, start = Date.now();
  await cdp.evaluate('(function(c,x,y,rad,ms){return new Promise(function(done){var t0=performance.now(),k=0;' +
    'function ev(type,px,py){var e=new PointerEvent(type,{pointerId:7,pointerType:"touch",isPrimary:true,clientX:px,clientY:py,bubbles:true,cancelable:true,buttons:type==="pointerup"?0:1});c.dispatchEvent(e);}' +
    'ev("pointerdown",x+rad,y);function step(){var a=(k++)*0.05;ev("pointermove",x+rad*Math.cos(a),y+rad*Math.sin(a));if(performance.now()-t0<ms)requestAnimationFrame(step);else{ev("pointerup",x+rad*Math.cos(a),y+rad*Math.sin(a));done(k);}}' +
    'requestAnimationFrame(step);});})(' + VIEW + '.canvas,' + rect.x + ',' + rect.y + ',' + radius + ',' + SECONDS * 1000 + ')');
  const elapsed = (Date.now() - start) / 1000;
  const intervals = await cdp.evaluate('(function(){var m=window.__pglMeasure;m.on=false;var d=[];for(var i=1;i<m.t.length;i++)d.push(m.t[i]-m.t[i-1]);delete window.__pglMeasure;return d;})()');
  const after = await cdp.evaluate(VIEW + '.stats()');
  const downs = await cdp.evaluate('(function(c){c.removeEventListener("pointerdown",window.__pglFn,true);var n=window.__pglDown;delete window.__pglDown;delete window.__pglFn;return n;})(' + VIEW + '.canvas)');
  if (!downs) console.log('M1 : le geste n’a pas atteint le canvas (aucun pointerdown) : relevé sans valeur.');
  const iq = quantiles(intervals);
  result.M1 = { seconds: elapsed, gestureFrames: after.gestureFrames - before.gestureFrames, framesPerSecond: (after.gestureFrames - before.gestureFrames) / elapsed,
    compositorIntervalsMs: { median: r2(iq.median), p95: r2(iq.p95), p99: r2(iq.p99), max: r2(iq.max), over50: intervals.filter(v => v > 50).length, n: iq.n }, lastPaintMs: r2(after.lastPaintMs), maxPaintMs: r2(after.maxPaintMs), canvas: after.canvas, dpr: after.dpr };
  console.log('M1 geste ' + r2(elapsed) + ' s : ' + result.M1.gestureFrames + ' images de la vue (' + r2(result.M1.framesPerSecond) + ' /s) ; intervalles compositeur médiane ' + r2(iq.median) + ' ms, p95 ' + r2(iq.p95) + ' ms, > 50 ms : ' + result.M1.compositorIntervalsMs.over50 + ' ; JS par image dernière ' + r2(after.lastPaintMs) + ' ms, max ' + r2(after.maxPaintMs) + ' ms ; canvas ' + after.canvas.width + ' × ' + after.canvas.height + ' (DPR ' + after.dpr + ')');

  // ---- M2: steady drawing, GPU time included (gl.finish), not during a job ----
  const workflow = await cdp.evaluate(VIEW + '.state().live.workflow');
  if (PAINT && workflow !== 'running' && workflow !== 'paused') {
    const times = await cdp.evaluate('(function(n){var h=' + VIEW + ',gl=h.canvas.getContext("webgl")||h.canvas.getContext("experimental-webgl"),t=[];for(var i=0;i<=n;i++){var s=performance.now();h.paint(performance.now());if(gl)gl.finish();t.push(performance.now()-s);}return t.slice(1);})(' + PAINT + ')');
    const q = quantiles(times);
    result.M2 = { frames: q.n, medianMs: r2(q.median), p95Ms: r2(q.p95), maxMs: r2(q.max), finish: true };
    console.log('M2 dessin établi (' + q.n + ' images après la première, gl.finish compris) : médiane ' + r2(q.median) + ' ms, p95 ' + r2(q.p95) + ' ms, max ' + r2(q.max) + ' ms');
  } else console.log('M2 non mesuré : ' + (PAINT ? 'travail en cours (la mesure bloque la page)' : '--paint 0'));

  // ---- M7: during a job, frames per report ----
  if (JOB_SECONDS > 0) {
    if (workflow !== 'running') console.log('M7 non mesuré : aucun travail en cours dans la page mesurée');
    else {
      await cdp.evaluate('(function(){var m=window.__pglJob={reports:0};m.fn=function(){m.reports++;};window.addEventListener("cnc-job-status",m.fn);return true;})()');
      const f0 = (await cdp.evaluate(VIEW + '.stats()')).frames, perSecond = [];
      let last = f0;
      for (let s = 0; s < JOB_SECONDS; s++) { await sleep(1000); const f = (await cdp.evaluate(VIEW + '.stats()')).frames; perSecond.push(f - last); last = f; }
      const reports = await cdp.evaluate('(function(){var m=window.__pglJob;window.removeEventListener("cnc-job-status",m.fn);delete window.__pglJob;return m.reports;})()');
      const q = quantiles(perSecond);
      result.M7 = { seconds: JOB_SECONDS, frames: last - f0, reports, framesPerReport: reports ? r2((last - f0) / reports) : null, framesPerSecond: { median: q.median, p95: q.p95, max: q.max } };
      console.log('M7 travail ' + JOB_SECONDS + ' s : ' + (last - f0) + ' images, ' + reports + ' rapports (' + result.M7.framesPerReport + ' images par rapport), images/s médiane ' + q.median + ', max ' + q.max);
    }
  }

  // ---- M5: memory after a forced GC ----
  await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.collectGarbage');
  const memory = await cdp.evaluate('({used:performance.memory?performance.memory.usedJSHeapSize:null,stats:' + VIEW + '.stats()})');
  result.M5 = { jsHeapMb: memory.used === null ? null : r2(memory.used / 1048576), uploads: memory.stats.uploads, uploadMb: r2(memory.stats.uploadBytes / 1048576) };
  console.log('M5 tas JS après GC : ' + result.M5.jsHeapMb + ' Mo ; envois GPU de la vue : ' + result.M5.uploads + ' (' + result.M5.uploadMb + ' Mo)');
  cdp.close();
  if (OUT) { fs.writeFileSync(OUT, JSON.stringify(result, null, 2)); console.log('Écrit : ' + OUT); }
})().catch(e => { console.error('measure-preview-gl-tablet: ' + e.message); process.exit(1); });
