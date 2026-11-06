'use strict';
// Bug hunt C-2 (not registered in verify-project.cjs; needs Edge or Chrome, set CNC_BROWSER).
// Real page, a job running (preview-server.cjs --replay), 1366 x 768 (Surface RT) and 1366 x 911 at
// DPR 1.58 (Surface Pro 3, wide layout): the status strip must leave the loaded file's name readable.
// Today the vital « Fichier » (flex 1 1 auto, min-width 0) is squeezed to 0-57 px by « Machine » and
// « Pilote », so the name is cut to « P. » or not drawn at all, in FR, EN and ES.
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn } = require('child_process');
const EXE = process.env.CNC_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIN_FILE_PX = 120; // about 10 characters of the 20 px strip font
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (u) => new Promise((res, rej) => http.get(u, (r) => { let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => res(JSON.parse(b))); }).on('error', rej));
(async () => {
  const fx = spawn(process.execPath, [path.join(__dirname, 'preview-server.cjs'), '--replay'], { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  const base = await new Promise((res) => { let o = ''; fx.stdout.on('data', (d) => { o += d; const m = o.match(/http:\/\/127\.0\.0\.1:(\d+)\//); if (m) res(m[0]); }); });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cnc-bughunt-c-'));
  const br = spawn(EXE, ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  const failures = [];
  let ws;
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
    for (const [w, h, dpr, perf] of [[1366, 768, 1, 'eco'], [1366, 911, 1.58, 'performance']]) {
      for (const lang of ['fr', 'en', 'es']) {
        await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
        await nav(base + 'README.md');
        await ev('localStorage.clear();localStorage.setItem("cncjs-touch-language-v1","' + lang + '");localStorage.setItem("cncjs-touch-performance-v1",JSON.stringify({version:1,profile:"' + perf + '"}));true');
        await nav(base + 'index.html');
        await until('!!(window.cncState&&(window.cncState.get().machine||{}).workflow==="running")', 30000);
        await sleep(1500);
        // The width drawn inside the information zone (.t-vitals clips what overflows it).
        const r = await ev('(function(){var f=document.getElementById("t-file"),a=f.getBoundingClientRect(),v=f.closest(".t-vitals").getBoundingClientRect();return {text:f.textContent,w:Math.max(0,Math.round(Math.min(a.right,v.right)-Math.max(a.left,v.left))),need:f.scrollWidth};})()');
        const label = w + 'x' + h + '@' + dpr + ' ' + lang + ': « ' + r.text + ' » drawn on ' + r.w + ' px of ' + r.need;
        console.log(label);
        if (r.w < Math.min(MIN_FILE_PX, r.need)) failures.push(label);
      }
    }
  } finally {
    try { ws && ws.close(); } catch (_) {}
    br.kill(); fx.kill(); await sleep(800);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  }
  assert.deepStrictEqual(failures, [], 'file name unreadable in the strip during a job');
  console.log('PASS test-bughunt-c-2');
})().catch((e) => { console.error(e.message); process.exit(1); });
