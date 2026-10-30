#!/usr/bin/env node
'use strict';
// Pause and Arrêter of the status strip over every overlay (U5 rule, strip-guard.js), in a
// real browser: the simulation page with a job running and the real page fed by the replay
// fixture (preview-server.cjs --replay, canPause / canStop true). For each sheet, dialog,
// pad and viewer, at 1366 x 768 and 1024 x 600, FR / EN / ES, standard and large text:
//   - Pause / Arrêter shown and enabled, their centre not covered (elementFromPoint), no
//     inert ancestor, and a real mouse click at the centre relays to #job-pause / #job-stop
//     (the relay is intercepted on its target: nothing is sent, the job keeps running);
//   - the overlay starts below the strip and its card fits in the window (own scroll);
//   - Tab from the overlay reaches Pause and Arrêter and never leaves overlay + strip stops;
// then, on the real page: a module failing at load leaves « Chargement incomplet » shown
// below a usable strip (D-B1), and the browser's offline flag keeps Pause / Arrêter shown
// and sent (R-S2). Used by browser-run.cjs (step « strip »), or on its own:
//   node examples/cncjs-touch/browser-strip.cjs [--out DIR] [--quick]
const fs = require('fs');
const path = require('path');

const RELAY = `(function(){
  if(window.__strip)return true;
  window.__strip={relay:[],posts:[],block:true};
  ['job-pause','job-stop'].forEach(function(id){var b=document.getElementById(id);if(!b)return;
    b.addEventListener('click',function(e){if(!window.__strip.block)return;window.__strip.relay.push({id:id,t:performance.now()});e.stopImmediatePropagation();},true);});
  var F=window.XMLHttpRequest;window.XMLHttpRequest=function(){var x=new F();var o=x.open,s=x.send;x.open=function(m,u){x.__m=m;x.__u=u;return o.apply(x,arguments);};x.send=function(b){if(x.__m==='POST'&&/touch-job/.test(x.__u||''))window.__strip.posts.push(b);return s.apply(x,arguments);};return x;};
  return true;})()`;

// What is open, where it starts, and the strip's two commands.
const PROBE = `(function(){
  function d(n){return n?(n.id?'#'+n.id:n.tagName.toLowerCase()+(typeof n.className==='string'&&n.className?'.'+n.className.split(' ')[0]:'')):null;}
  var sim=document.body.getAttribute('data-simulation')==='true',banner=document.getElementById(sim?'simulation-banner':'real-banner');
  var bottom=banner.getBoundingClientRect().bottom,vh=window.innerHeight;
  var open=Array.prototype.filter.call(document.querySelectorAll('[role="dialog"],#preview-viewer'),function(n){return !n.hidden&&n.getClientRects().length;});
  var overlays=open.map(function(n){var r=n.getBoundingClientRect(),card=n.firstElementChild,c=card?card.getBoundingClientRect():r;
    return {id:d(n),top:Math.round(r.top),cardTop:Math.round(c.top),cardBottom:Math.round(c.bottom),below:r.top>=bottom-1,fits:c.top>=bottom-1&&c.bottom<=vh+1,scrolls:!!card&&card.scrollHeight>card.clientHeight+1};});
  return {stripBottom:Math.round(bottom),overlays:overlays,buttons:['t-pause','t-stop'].map(function(id){var b=document.getElementById(id);if(!b)return {id:id,missing:true};
    var r=b.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,hit=r.width?document.elementFromPoint(cx,cy):null;
    return {id:id,shown:!b.hidden&&r.width>0,disabled:b.disabled,cx:cx,cy:cy,hit:d(hit),hitOk:!!hit&&(hit===b||b.contains(hit)),inert:d(b.closest('[inert]'))};})};})()`;

const OVERLAYS = [
  ['sheet: origin help', 'jog', 'document.getElementById("ks-origin-info")'],
  ['sheet: macros', 'jog', 'document.querySelector(".ks-macros-open")'],
  ['sheet: preview details', 'files', 'Array.prototype.filter.call(document.querySelectorAll(".ks-file-tools button"),function(b){return b.textContent===window.cncI18n.t("Détails de l’aperçu");})[0]'],
  ['sheet: dimensions', 'files', 'Array.prototype.filter.call(document.querySelectorAll(".ks-file-tools button"),function(b){return b.textContent===window.cncI18n.t("Dimensions XY");})[0]'],
  ['project sheet', 'files', 'document.getElementById("project-open")'],
  ['coordinate editor', 'jog', 'document.getElementById("coordinate-open")'],
  ['numeric pad', 'home', '(function(){var i=document.getElementById("strip-run-input");if(!i){i=document.createElement("input");i.id="strip-run-input";document.getElementById("screen-home").appendChild(i);}return {disabled:false,click:function(){window.CNCNumeric.open(i,{label:"Test",unit:"mm",min:0,max:50});}};})()'],
  ['preview viewer', 'home', 'document.querySelector("#screen-home .preview-open")'],
];
const REAL_ONLY = [['sheet: job preparation', 'files', 'document.getElementById("ks-preparation-open")'], ['pilot dialog', 'home', 'document.getElementById("t-pilot")'],
  // The real move panel keeps the whole strip active (real-motion.js) and has no Tab trap of its own.
  ['real move panel', 'jog', 'document.getElementById("real-motion-open")', { tab: false }]];
// Real move capabilities injected into the replayed reports (the panel opens; nothing moves).
const CAPABILITIES = `(function(){var o=window.dispatchEvent.bind(window);window.dispatchEvent=function(e){if(e&&e.type==="cnc-job-status"&&e.detail&&e.detail.machine&&!e.detail.machine.capabilities){var m={};Object.keys(e.detail.machine).forEach(function(k){m[k]=e.detail.machine[k];});
  var c={supported:true,enabled:true,experimental:true,reason:""};m.capabilities={jog:Object.assign({steps:[0.01,0.1,1,10]},c),jogContinuous:c,jogCancel:c,setOrigin:c};
  m.motion={canJog:false,jogReason:"Travail en cours.",continuousReason:{X:"",Y:"",Z:""},canSetOrigin:false,setOriginReason:"Travail en cours.",maxFeed:{},jog:null,cancelling:false,cancelUnconfirmed:false,lastJog:null,lastOrigin:null};
  var d={};Object.keys(e.detail).forEach(function(k){d[k]=e.detail[k];});d.machine=m;e=new CustomEvent("cnc-job-status",{detail:d});}return o(e);};return true;})()`;

async function key(cdp, k, shift) {
  const code = { Escape: 27, Tab: 9 }[k] || 0, modifiers = shift ? 8 : 0;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code, modifiers });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code, modifiers });
}
async function click(cdp, x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function closeAll(cdp, H) {
  await key(cdp, 'Escape'); await H.sleep(120);
  await cdp.evaluate(`(function(){try{window.cncShell.closeSheet();}catch(e){}try{window.CNCNumeric.close();}catch(e){}
    [['real-motion-close','real-motion'],['coordinate-close','coordinate-editor'],['preview-viewer-close','preview-viewer'],['project-dialog-close','project-dialog'],['pilot-dismiss','pilot-dialog']].forEach(function(p){var b=document.getElementById(p[0]),o=document.getElementById(p[1]);if(b&&o&&!o.hidden)b.click();});return true;})()`);
  await H.sleep(150);
}

// One overlay open: measures, real clicks on Pause and Arrêter, Tab cycle.
async function probe(cdp, H, ctx, label, fail, rows, opts) {
  await cdp.evaluate('new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r);});})');
  const m = await cdp.evaluate(PROBE);
  const row = { variant: ctx, overlay: label, overlays: m.overlays, buttons: {} };
  if (!m.overlays.length) fail(ctx + ' · ' + label + ': overlay not open');
  for (const o of m.overlays) {
    if (!o.below) fail(ctx + ' · ' + label + ': ' + o.id + ' starts at ' + o.top + ' px, above the strip bottom ' + m.stripBottom);
    if (!o.fits) fail(ctx + ' · ' + label + ': ' + o.id + ' card ' + o.cardTop + '–' + o.cardBottom + ' px outside the window below the strip');
  }
  for (const b of m.buttons) {
    const r = { shown: b.shown, disabled: b.disabled, hit: b.hit, inert: b.inert };
    row.buttons[b.id] = r;
    if (b.missing || !b.shown || b.disabled) { if (b.id === 't-stop') fail(ctx + ' · ' + label + ': Arrêter not offered (' + JSON.stringify(b) + ')'); continue; }
    if (!b.hitOk) fail(ctx + ' · ' + label + ': ' + b.id + ' centre covered by ' + b.hit);
    if (b.inert) fail(ctx + ' · ' + label + ': ' + b.id + ' inert under ' + b.inert);
    await cdp.evaluate('window.__strip.relay=[];window.__strip.t0=performance.now();true');
    await click(cdp, b.cx, b.cy); await H.sleep(200);
    const got = await cdp.evaluate('({relay:window.__strip.relay.slice(),t0:window.__strip.t0})');
    const relay = got.relay.find((x) => x.id === (b.id === 't-stop' ? 'job-stop' : 'job-pause'));
    r.ms = relay ? Math.round(relay.t - got.t0) : null;
    if (!relay) fail(ctx + ' · ' + label + ': a click on ' + b.id + ' did not reach ' + (b.id === 't-stop' ? '#job-stop' : '#job-pause'));
    if (b.id === 't-pause') await H.sleep(650); // the strip's 600 ms guard of Pause
  }
  // Tab: the strip's commands are in the cycle, focus never escapes overlay + strip.
  if (m.overlays.length && !(opts && opts.tab === false)) {
    const ids = await cdp.evaluate('(function(){var o=document.querySelector(' + JSON.stringify(m.overlays[m.overlays.length - 1].id) + ');var f=o.querySelector("button,input,select");if(f)f.focus();return true;})()');
    void ids;
    const seen = new Set(); let escaped = null;
    for (let i = 0; i < 40; i++) {
      await key(cdp, 'Tab');
      const at = await cdp.evaluate(`(function(){var a=document.activeElement,o=document.querySelector(${JSON.stringify(m.overlays[m.overlays.length - 1].id)});return {id:a&&a.id||'',inside:!!(o&&o.contains(a)),stop:!!(a&&/^t-(pause|stop)$/.test(a.id))};})()`);
      if (at.stop) seen.add(at.id); else if (!at.inside && !escaped) escaped = at.id || 'body';
    }
    row.tab = { reached: Array.from(seen), escaped };
    const offered = m.buttons.filter((b) => b.shown && !b.disabled).map((b) => b.id);
    offered.forEach((id) => { if (!seen.has(id)) fail(ctx + ' · ' + label + ': Tab never reaches ' + id); });
    if (escaped) fail(ctx + ' · ' + label + ': Tab left the overlay for ' + escaped);
  }
  rows.push(row);
  const s = (id) => { const r = row.buttons[id]; return !r || !r.shown ? 'absent' : r.disabled ? 'disabled' : r.ms !== null && r.ms !== undefined ? r.ms + ' ms' : 'BLOCKED'; };
  return label + ': Pause ' + s('t-pause') + ', Arrêter ' + s('t-stop') + (row.tab ? ', Tab ' + row.tab.reached.join('+') : '') + (m.overlays[0] ? ', top ' + m.overlays[0].top + '/' + m.stripBottom + ' card ≤ ' + m.overlays[0].cardBottom + (m.overlays[0].scrolls ? ' (scrolls)' : '') : '');
}

async function startJob(cdp, H, page) {
  if (page === 'simulation') {
    await H.goScreen(cdp, 'files');
    await cdp.evaluate('document.querySelector(".library-file").click();true');
    await cdp.waitFor('(function(){var b=document.getElementById("job-load");return !!b&&!b.disabled;})()', 15000, 'load enabled');
    await cdp.evaluate('document.getElementById("job-load").click();true');
    await cdp.waitFor('(function(){var m=window.cncState.get().machine;return !!(m&&m.name);})()', 15000, 'loaded');
    await H.goScreen(cdp, 'home');
    await cdp.evaluate('document.getElementById("home-job-start").click();true');
    await cdp.waitFor('!document.getElementById("job-dialog").hidden', 15000, 'dialog');
    await cdp.evaluate('(function(){var c=document.getElementById("job-check");c.checked=true;c.dispatchEvent(new Event("change",{bubbles:true}));document.getElementById("job-confirm").click();return true;})()');
    await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="running"', 15000, 'running');
  } else {
    if (page === 'index') await cdp.evaluate(CAPABILITIES);
    await cdp.waitFor('(function(){var m=window.cncState.get().machine;return !!(m&&m.workflow==="running"&&!document.getElementById("t-stop").hidden);})()', 20000, 'replay running');
  }
  // A file selected on the real page, for the project sheet (the fixture answers its read).
  if (page === 'index') {
    await H.goScreen(cdp, 'files');
    await cdp.evaluate('(function(){var f=document.querySelector(".library-file");if(f)f.click();return true;})()');
    await cdp.waitFor('(function(){var b=document.getElementById("project-open");return !!b&&!b.disabled;})()', 10000, 'project sheet available').catch(() => {});
  }
}

async function variant(cdp, H, base, page, w, h, lang, large, fail, rows, log) {
  const ctx = page + ' ' + w + 'x' + h + ' ' + lang + (large ? ' large' : '');
  await H.setViewport(cdp, w, h, 1);
  await H.navigate(cdp, base + 'README.md');
  await cdp.evaluate('localStorage.setItem("cncjs-touch-language-v1",' + JSON.stringify(lang) + ');localStorage.setItem("cncjs-touch-display-v1",' + JSON.stringify(JSON.stringify({ size: large ? 'large' : 'standard' })) + ');true').catch(() => {});
  await H.navigate(cdp, base + page + '.html?strip=' + Date.now()); await H.waitReady(cdp);
  await startJob(cdp, H, page);
  await H.sleep(800);
  await cdp.evaluate(RELAY);
  for (const [label, screen, opener, opts] of OVERLAYS.concat(page === 'index' ? REAL_ONLY : [])) {
    try {
      await H.goScreen(cdp, screen);
      const r = await cdp.evaluate('(function(){var b=' + opener + ';if(!b)return "absent";if(b.disabled)return "disabled";b.click();return "ok";})()');
      if (r !== 'ok') {
        // No macro on the replay page (Macros disabled): the sheet code is the same, measured on the simulation.
        if (!(page === 'index' && label === 'sheet: macros')) fail(ctx + ' · ' + label + ': not opened (' + r + ')');
        continue;
      }
      await H.sleep(450);
      log(ctx + ' · ' + await probe(cdp, H, ctx, label, fail, rows, opts));
    } catch (e) { fail(ctx + ' · ' + label + ': ' + e.message); }
    await closeAll(cdp, H);
  }
}

// A module that throws while the page loads: the boot message stays, below a usable strip.
async function degraded(cdp, H, base, w, h, fail, log) {
  await H.setViewport(cdp, w, h, 1);
  await H.navigate(cdp, base + 'README.md');
  await cdp.evaluate('localStorage.removeItem("cncjs-touch-language-v1");localStorage.removeItem("cncjs-touch-display-v1");true').catch(() => {});
  const handler = (p) => {
    cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
      body: Buffer.from('(function(){throw new Error("strip-run: injected module failure");})();').toString('base64') }).catch(() => {});
  };
  cdp.on('Fetch.requestPaused', handler);
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*job-dashboard.js*', requestStage: 'Request' }] });
  try {
    await H.navigate(cdp, base + 'index.html?degraded=' + Date.now());
    await cdp.waitFor('document.documentElement.classList.contains("cnc-degraded")', 20000, 'degraded start-up');
    await cdp.waitFor('(function(){var b=document.getElementById("t-stop");return !!b&&!b.hidden&&!b.disabled;})()', 20000, 'Arrêter offered after the failure');
    await H.sleep(500);
    await cdp.evaluate(RELAY);
    const m = await cdp.evaluate(`(function(){var boot=document.getElementById('cnc-boot'),msg=document.getElementById('cnc-boot-message');var r=boot.getBoundingClientRect();
      var res=${PROBE};return {boot:!boot.hidden&&r.height>0,bootTop:Math.round(r.top),message:msg.textContent,probe:res};})()`);
    if (!m.boot || !/Chargement incomplet/.test(m.message)) fail('degraded ' + w + 'x' + h + ': the failure message is not shown (' + m.message + ')');
    if (m.bootTop < m.probe.stripBottom - 1) fail('degraded ' + w + 'x' + h + ': the boot screen covers the strip (top ' + m.bootTop + ')');
    let line = 'degraded start-up ' + w + 'x' + h + ': message « ' + m.message + ' » from ' + m.bootTop + ' px';
    for (const b of m.probe.buttons) {
      if (!b.shown || b.disabled) { if (b.id === 't-stop') fail('degraded ' + w + 'x' + h + ': Arrêter not offered'); continue; }
      if (!b.hitOk) fail('degraded ' + w + 'x' + h + ': ' + b.id + ' covered by ' + b.hit);
      await cdp.evaluate('window.__strip.relay=[];window.__strip.t0=performance.now();true');
      await click(cdp, b.cx, b.cy); await H.sleep(200);
      const got = await cdp.evaluate('({relay:window.__strip.relay.slice(),t0:window.__strip.t0})');
      const relay = got.relay.find((x) => x.id === (b.id === 't-stop' ? 'job-stop' : 'job-pause'));
      if (!relay) fail('degraded ' + w + 'x' + h + ': a click on ' + b.id + ' did not reach its command');
      line += ', ' + b.id + ' ' + (relay ? Math.round(relay.t - got.t0) + ' ms' : 'BLOCKED');
      await H.sleep(650);
    }
    log(line);
  } finally { await cdp.send('Fetch.disable').catch(() => {}); }
}

// The browser's offline flag during a job: Pause / Arrêter stay shown and are still sent.
async function offline(cdp, H, base, w, h, fail, log) {
  await H.setViewport(cdp, w, h, 1);
  await H.navigate(cdp, base + 'index.html?offline=' + Date.now()); await H.waitReady(cdp);
  await startJob(cdp, H, 'replay');
  await H.goScreen(cdp, 'home');
  await cdp.evaluate(RELAY); await cdp.evaluate('window.__strip.block=false;window.__strip.samples=[];window.__strip.timer=setInterval(function(){var b=document.getElementById("t-stop");window.__strip.samples.push(!!b&&!b.hidden&&!b.disabled&&b.getClientRects().length>0);},50);true');
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  try {
    await cdp.waitFor('navigator.onLine===false', 5000, 'offline flag');
    await H.sleep(1500);
    const m = await cdp.evaluate(PROBE), stop = m.buttons.find((b) => b.id === 't-stop');
    const samples = await cdp.evaluate('window.__strip.samples.slice()');
    const gaps = samples.filter((v) => !v).length;
    if (gaps) fail('offline ' + w + 'x' + h + ': Arrêter missing or disabled in ' + gaps + ' samples of 50 ms');
    if (!stop.shown || stop.disabled) { fail('offline ' + w + 'x' + h + ': Arrêter not offered'); return; }
    const before = (await cdp.evaluate('window.__strip.posts.length'));
    await click(cdp, stop.cx, stop.cy); await H.sleep(300);
    const posts = await cdp.evaluate('window.__strip.posts.slice(' + before + ')');
    if (!posts.some((p) => /"action":"stop"/.test(p))) fail('offline ' + w + 'x' + h + ': Arrêter not attempted (' + JSON.stringify(posts) + ')');
    log('offline flag ' + w + 'x' + h + ': Arrêter shown in ' + (samples.length - gaps) + '/' + samples.length + ' samples, tap → ' + posts.length + ' POST ' + posts.map((p) => JSON.parse(p).action).join(','));
  } finally {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => {});
    await cdp.evaluate('clearInterval(window.__strip&&window.__strip.timer);true').catch(() => {});
  }
}

const VARIANTS = [[1366, 768, 'fr', false], [1024, 600, 'fr', false], [1024, 600, 'es', true], [1024, 600, 'en', false]];

// cdp: an open DevTools client; H: browser-run.cjs exports; simBase: fixture base URL.
async function run(cdp, H, options) {
  const failures = [], rows = [], log = options.log || ((m) => console.log(m));
  const fail = (m) => { failures.push('strip: ' + m); log('FAIL ' + m); };
  const replay = await H.startFixture(['--replay']);
  try {
    for (const [w, h, lang, large] of options.quick ? VARIANTS.slice(1, 2) : VARIANTS) {
      for (const [page, base] of [['simulation', options.simBase], ['index', replay.base]]) {
        try { await variant(cdp, H, base, page, w, h, lang, large, fail, rows, log); } catch (e) { fail(page + ' ' + w + 'x' + h + ' ' + lang + ': ' + e.message); }
      }
    }
    for (const [w, h] of [[1366, 768], [1024, 600]]) {
      try { await degraded(cdp, H, replay.base, w, h, fail, log); } catch (e) { fail('degraded ' + w + 'x' + h + ': ' + e.message); }
      try { await offline(cdp, H, replay.base, w, h, fail, log); } catch (e) { fail('offline ' + w + 'x' + h + ': ' + e.message); }
    }
    await cdp.evaluate('localStorage.removeItem("cncjs-touch-language-v1");localStorage.removeItem("cncjs-touch-display-v1");true').catch(() => {});
  } finally { replay.child.kill(); }
  if (options.out) { fs.mkdirSync(options.out, { recursive: true }); fs.writeFileSync(path.join(options.out, 'strip.json'), JSON.stringify({ rows, failures }, null, 1)); }
  return failures;
}
module.exports = { run };

if (require.main === module) {
  (async () => {
    const H = require('./browser-run.cjs');
    const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
    const out = path.resolve(arg('--out', 'output/browser-strip'));
    const sim = await H.startFixture([]), browser = await H.launchBrowser(1366, 768);
    let failures = [];
    try { failures = await run(browser.cdp, H, { simBase: sim.base, out, quick: process.argv.includes('--quick') }); }
    finally { browser.cdp.close(); try { browser.child.kill(); } catch (_) { /* gone */ } sim.child.kill(); await H.sleep(300); try { fs.rmSync(browser.profile, { recursive: true, force: true }); } catch (_) { /* busy */ } }
    if (failures.length) { console.error('FAILED:\n- ' + failures.join('\n- ')); process.exit(1); }
    console.log('browser-strip: PASS');
  })().catch((e) => { console.error(e); process.exit(2); });
}
