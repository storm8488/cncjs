'use strict';
// Bug hunt C-3 (not registered in verify-project.cjs; needs Edge or Chrome, set CNC_BROWSER).
// Wide workstation, Préparer, program loaded at rest: the 3D view of the origin card
// (origin-preview.js) must be drawn at the size of its frame. origin-preview.js mounts .op-view
// hidden (:206), opens CNCPreviewGL in it while hidden (:148, resize() at preview-gl.js:1100 measures
// a 0 x 0 stage and fixes canvas.style to 1 x 1 px), then unhides the frame (:164): the canvas stays
// 1 x 1 px until a window resize, which never comes on a kiosk. The view looks empty.
// Page: preview-server.cjs --replay, its stream rewritten to an idle controller with the program
// loaded; WebGL by SwiftShader with a hardware renderer name, so the page's own GPU gate opens
// perf-gpu and perf-wide by itself; the fixture's sidecar given a fingerprint (3D views need one).
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn } = require('child_process');
const EXE = process.env.CNC_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (u) => new Promise((res, rej) => http.get(u, (r) => { let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => res(JSON.parse(b))); }).on('error', rej));
const SPOOF = '(function(){var gc=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,o){if(o&&o.failIfMajorPerformanceCaveat){o=Object.assign({},o,{failIfMajorPerformanceCaveat:false});}return gc.call(this,t,o);};' +
  '[window.WebGLRenderingContext,window.WebGL2RenderingContext].forEach(function(C){if(!C)return;var gp=C.prototype.getParameter;C.prototype.getParameter=function(p){if(p===0x9246)return "ANGLE (Intel, Intel(R) HD Graphics 4400, bughunt-spoof)";if(p===0x1F01)return "WebKit WebGL";return gp.call(this,p);};});})();';
const WRAP = '(function(){var FP=true,IDLE=true,cur=window.XMLHttpRequest,seen=false;' +
    'function fix(s){return typeof s==="string"?s.replace(/"workflow":"running"/g,"\\"workflow\\":\\"idle\\"").replace(/"activeState":"Run"/g,"\\"activeState\\":\\"Idle\\""):s;}' +
    'function hook(self,k,map){var h=self[k]||null;Object.defineProperty(self,k,{configurable:true,get:function(){return h?function(){var t=self.responseText;try{Object.defineProperty(self,"responseText",{configurable:true,writable:true,value:map(t)});}catch(e){}return h.apply(self,arguments);}:h;},set:function(f){h=f;}});}' +
    'function fp(t){try{var r=JSON.parse(t),d=JSON.parse(r.data);d.fingerprint="sha256:' + 'ab'.repeat(32) + '";r.data=JSON.stringify(d);return JSON.stringify(r);}catch(e){return t;}}' +
    'Object.defineProperty(window,"XMLHttpRequest",{configurable:true,get:function(){return cur;},set:function(F){if(seen){cur=F;return;}seen=true;cur=function(){var x=new F(),send=x.send;x.send=function(b){var self=this,u=self.url||"";' +
  'if(FP&&u==="/api/watch/file")hook(self,"onload",fp);if(IDLE&&/touch-events|touch-job/.test(u)){hook(self,"onprogress",fix);hook(self,"onload",fix);}return send.call(self,b);};return x;};}});})();';
(async () => {
  const fx = spawn(process.execPath, [path.join(__dirname, 'preview-server.cjs'), '--replay'], { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  const base = await new Promise((res) => { let o = ''; fx.stdout.on('data', (d) => { o += d; const m = o.match(/http:\/\/127\.0\.0\.1:(\d+)\//); if (m) res(m[0]); }); });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cnc-bughunt-c-'));
  const br = spawn(EXE, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let ws, result = null;
  try {
    const pf = path.join(profile, 'DevToolsActivePort');
    while (!fs.existsSync(pf) || !fs.readFileSync(pf, 'utf8').trim()) await sleep(100);
    const port = Number(fs.readFileSync(pf, 'utf8').split(/\r?\n/)[0]);
    let page; while (!(page = (await getJson('http://127.0.0.1:' + port + '/json/list')).find((t) => t.type === 'page'))) await sleep(100);
    ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
    let seq = 0; const pending = new Map(), loads = [];
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || {}); pending.delete(m.id); } if (m.method === 'Page.loadEventFired') loads.splice(0).forEach((f) => f()); });
    const send = (method, params) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params: params || {} })); });
    const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
    const nav = async (url) => { const l = new Promise((r) => loads.push(r)); await send('Page.navigate', { url }); await l; };
    const until = async (expr, ms) => { const end = Date.now() + ms; while (!(await ev(expr))) { if (Date.now() > end) throw new Error('timeout ' + expr); await sleep(150); } };
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: SPOOF });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: WRAP });
    await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 911, deviceScaleFactor: 1.58, mobile: false });
    await nav(base + 'README.md');
    await ev('localStorage.clear();localStorage.setItem("cncjs-touch-performance-v1",JSON.stringify({version:1,profile:"performance"}));true');
    await nav(base + 'index.html');
    await until('!!(window.cncShell&&document.body.classList.contains("perf-wide"))', 30000);
    await until('(function(){var m=window.cncState.get().machine;return !!(m&&m.name&&m.workflow==="idle");})()', 30000);
    await ev('window.cncShell.go("jog");true');
    await until('!!document.querySelector("#op-card .op-view:not([hidden]) canvas")', 20000);
    await sleep(2000);
    result = await ev('(function(){var c=document.querySelector("#op-card canvas"),v=document.querySelector("#op-card .op-view");return {canvas:[c.clientWidth,c.clientHeight],frame:[v.clientWidth,v.clientHeight]};})()');
    console.log('origin card: frame ' + result.frame.join(' x ') + ' px, canvas ' + result.canvas.join(' x ') + ' px');
  } finally {
    try { ws && ws.close(); } catch (_) {}
    br.kill(); fx.kill(); await sleep(800);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  }
  assert(Math.abs(result.canvas[0] - result.frame[0]) <= 2 && Math.abs(result.canvas[1] - result.frame[1]) <= 2, 'origin card canvas ' + result.canvas.join(' x ') + ' px in a ' + result.frame.join(' x ') + ' px frame');
  console.log('PASS test-bughunt-c-3');
})().catch((e) => { console.error(e.message); process.exit(1); });