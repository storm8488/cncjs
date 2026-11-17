#!/usr/bin/env node
'use strict';
// Lot F16 « Petits écrans et portrait » (design/PROMPT-FONCTIONS-6.md § 2): the same real page, through the
// v2 fixture of browser-run.cjs (startV2Fixture: rest, job, pause, alarm, stale report, lost stream), on a
// phone held upright (412 x 915 and 360 x 800) and on a 1024 x 600 screen, FR / EN / ES, standard and large
// text, dark and light, CNC and laser. Used by browser-run.cjs (step « small »).
// Every screen of every state is measured like the step « screens » (sizes, text, words cut across lines,
// text out of its control, text over text, horizontal overflow, a screen taller than its box that does not
// scroll), plus the checks of this lot:
//   - the strip's Arrêter and its Pause (or Reprendre / Remise en route) on every screen and every state:
//     shown, wholly inside the window, at least 64 px on each side, centre and edges not covered;
//   - no horizontal scroll: the document, main and the active screen are no wider than the window;
//   - portrait: the rail runs along the bottom edge, its six entries on one row inside the window, at least
//     48 px on each side, whole words;
//   - the two tablets: no F16 media query matches their windows (tabletsUnchanged below).
// Nothing is sent to a machine: the fixture refuses (403) every request that is not a GET under /api/.
// CNC_SMALL_ONLY=<regexp> restricts the variants (by id) while working on the layout; the harness runs them all.
const fs = require('fs');
const path = require('path');

const PHONE_STATES = ['idle', 'running', 'paused', 'alarm', 'stale', 'lost'];
const SHORT_STATES = ['idle', 'running', 'paused', 'alarm'];
const VARIANTS = [
  { id: 'phone-412-fr-sombre-cnc', w: 412, h: 915, lang: 'fr', theme: 'dark', size: 'standard', kind: 'cnc', portrait: true, states: PHONE_STATES },
  { id: 'phone-412-en-clair-cnc', w: 412, h: 915, lang: 'en', theme: 'light', size: 'standard', kind: 'cnc', portrait: true, states: SHORT_STATES },
  { id: 'phone-412-es-sombre-cnc-agrandi', w: 412, h: 915, lang: 'es', theme: 'dark', size: 'large', kind: 'cnc', portrait: true, states: SHORT_STATES },
  { id: 'phone-412-fr-clair-laser-agrandi', w: 412, h: 915, lang: 'fr', theme: 'light', size: 'large', kind: 'laser', portrait: true, states: ['idle', 'running'] },
  { id: 'phone-360-es-clair-cnc', w: 360, h: 800, lang: 'es', theme: 'light', size: 'standard', kind: 'cnc', portrait: true, states: SHORT_STATES },
  { id: 'phone-360-fr-sombre-cnc-agrandi', w: 360, h: 800, lang: 'fr', theme: 'dark', size: 'large', kind: 'cnc', portrait: true, states: SHORT_STATES },
  { id: 'phone-360-en-sombre-laser-agrandi', w: 360, h: 800, lang: 'en', theme: 'dark', size: 'large', kind: 'laser', portrait: true, states: ['idle', 'running'] },
  { id: 'ecran-1024-fr-sombre-cnc', w: 1024, h: 600, lang: 'fr', theme: 'dark', size: 'standard', kind: 'cnc', states: PHONE_STATES },
  { id: 'ecran-1024-es-clair-cnc-agrandi', w: 1024, h: 600, lang: 'es', theme: 'light', size: 'large', kind: 'cnc', states: SHORT_STATES },
  { id: 'ecran-1024-en-sombre-laser-agrandi', w: 1024, h: 600, lang: 'en', theme: 'dark', size: 'large', kind: 'laser', states: ['idle', 'running'] }
];
// Priority of the lot: Usinage and Machine first (watched from afar), then the others.
const SCREENS = [['home', 'Usinage'], ['machine', 'Machine'], ['files', 'Fichier'], ['jog', 'Zéro pièce'], ['check', 'Contrôle'], ['more', 'Plus'], ['history', 'Journal']];

// The strip's commands: Arrêter is always shown, one of Pause / Reprendre / Remise en route beside it.
const STRIP = `(function(){
  function d(n){return n?(n.id?'#'+n.id:n.tagName.toLowerCase()+(typeof n.className==='string'&&n.className?'.'+n.className.split(' ')[0]:'')):'nothing';}
  var vw=window.innerWidth,vh=window.innerHeight,out=[];
  ['t-stop','t-pause','t-resume','t-recover'].forEach(function(id){var b=document.getElementById(id);if(!b||b.hidden||!b.getClientRects().length)return;
    var r=b.getBoundingClientRect(),disabled=!!b.disabled||getComputedStyle(b).pointerEvents==='none',bad=[];
    var pts=[[r.left+r.width/2,r.top+r.height/2,'centre'],[r.left+3,r.top+r.height/2,'left edge'],[r.right-3,r.top+r.height/2,'right edge'],[r.left+r.width/2,r.top+3,'top edge'],[r.left+r.width/2,r.bottom-3,'bottom edge']];
    pts.forEach(function(p){var h=document.elementFromPoint(p[0],p[1]);if(!(h&&(h===b||b.contains(h)||(disabled&&h.contains(b)))))bad.push(p[2]+': '+d(h));});
    out.push({id:id,disabled:disabled,inside:r.left>=-0.5&&r.top>=-0.5&&r.right<=vw+0.5&&r.bottom<=vh+0.5,w:Math.round(r.width*10)/10,h:Math.round(r.height*10)/10,bad:bad,inert:b.closest('[inert]')?d(b.closest('[inert]')):null});});
  var de=document.documentElement,main=document.querySelector('main'),active=document.querySelector('main .screen.active');
  var rail=document.getElementById('tabbar'),rr=rail?rail.getBoundingClientRect():null,entries=[];
  if(rail)Array.prototype.forEach.call(rail.querySelectorAll('button'),function(b){if(b.hidden||!b.getClientRects().length)return;var q=b.getBoundingClientRect(),h=document.elementFromPoint(q.left+q.width/2,q.top+q.height/2);
    entries.push({screen:b.getAttribute('data-ks-screen'),x:q.left,y:q.top,w:Math.round(q.width*10)/10,h:Math.round(q.height*10)/10,hit:!!h&&(h===b||b.contains(h))});});
  var cause=active&&active.querySelector('.ks-stepbar>p'),cs=cause&&getComputedStyle(cause);
  cause=cause&&cause.getClientRects().length?{text:cause.textContent.slice(0,80),scroll:cause.scrollHeight,client:cause.clientHeight,max:parseFloat(cs.maxHeight)||0}:null;
  var state=active&&active.querySelector('.ks-step-head>b');
  state=state&&state.getClientRects().length&&state.scrollWidth>state.clientWidth+1?state.textContent.slice(0,80):null;
  return {vw:vw,vh:vh,buttons:out,cause:cause,stateCut:state,
    wide:{document:de.scrollWidth>de.clientWidth+1?de.scrollWidth:0,main:main&&main.scrollWidth>main.clientWidth+1?main.scrollWidth:0,active:active&&active.scrollWidth>active.clientWidth+1?active.scrollWidth:0,clientWidth:de.clientWidth},
    rail:rr?{top:Math.round(rr.top),bottom:Math.round(rr.bottom),left:Math.round(rr.left),right:Math.round(rr.right),entries:entries}:null};})()`;

// The two tablets (1366 x 911 Surface Pro, v2 CNC; 1366 x 768 RT, v1 Éco laser) must not change by a pixel. In the
// browser itself, on the real page at each tablet window (and with a 320 px on-screen keyboard over it), no media
// query of the F16 rules of responsive.css matches: none of them can reach a tablet. The before / after comparison
// of the steps « screens » and « v2 » is in design/fonctions/F16-COMPTE-RENDU.md.
const TABLETS = [
  { id: 'tablette-v2-911-fr-sombre-cnc', w: 1366, h: 911, v2: true, lang: 'fr', theme: 'dark', size: 'standard', kind: 'cnc' },
  { id: 'tablette-v1-768-es-clair-laser-agrandi', w: 1366, h: 768, v2: false, lang: 'es', theme: 'light', size: 'large', kind: 'laser' }
];
const F16_MEDIA = `(function(){var s=Array.prototype.filter.call(document.styleSheets,function(x){return (x.href||'').indexOf('/responsive.css')>=0;})[0];
  if(!s)return {error:'responsive.css not loaded'};var r=s.cssRules,start=-1;
  for(var i=0;i<r.length;i++)if(r[i].type===4&&r[i].media.mediaText.replace(/ /g,'')==='(max-width:599px)'&&r[i].cssText.replace(/ /g,'').indexOf('--statusbar-h:176px')>=0){start=i;break;}
  if(start<0)return {error:'F16 rules not found in responsive.css'};
  var list=[];for(var j=start;j<r.length;j++)list.push({media:r[j].media?r[j].media.mediaText:null,matches:r[j].media?matchMedia(r[j].media.mediaText).matches:true});
  return {w:innerWidth,h:innerHeight,rules:list};})()`;

async function tabletsUnchanged(h, cdp, fx, report) {
  const { setViewport, v2Storage, settingsStorage, v2Open, log, failures } = h;
  for (const v of TABLETS) {
    fx.setPhase('idle'); fx.profile = v.kind === 'laser' ? h.V2_LASER_PROFILE : h.V2_PROFILE;
    const tag = 'small ' + v.id;
    try {
      await setViewport(cdp, v.w, v.h, 1);
      await v2Storage(cdp, fx.base, { profile: v.v2 ? 'performance' : 'eco', v2: { version: 1, enabled: v.v2 }, kind: null });
      await settingsStorage(cdp, { lang: v.lang, size: v.size, theme: v.theme });
      await v2Open(cdp, fx.base + 'index.html?small-tablet=' + v.id, v.v2);
      for (const height of [v.h, v.h - 320]) {
        if (height !== v.h) await setViewport(cdp, v.w, height, 1);
        const m = await cdp.evaluate(F16_MEDIA);
        const on = m.error ? [] : m.rules.filter((x) => x.matches);
        if (m.error || m.w !== v.w || m.h !== height || on.length) failures.push(tag + ' ' + v.w + ' x ' + height + ': ' + (m.error || (on.length ? 'F16 rule applies: ' + on.map((x) => '@media ' + x.media).join(' ; ') : 'window ' + m.w + ' x ' + m.h)));
        report.push({ variant: v.id, w: v.w, h: height, unchanged: !m.error && !on.length, rules: m.rules ? m.rules.length : 0 });
        log(tag + ' ' + v.w + ' x ' + height + ': ' + (m.rules ? m.rules.length : 0) + ' F16 rules, ' + on.length + ' matching');
      }
    } catch (e) { failures.push(tag + ': ' + e.message); log('FAIL ' + tag + ': ' + e.message); }
  }
}

function stripChecks(s, portrait) {
  const errors = [];
  const stop = s.buttons.find((b) => b.id === 't-stop'), pause = s.buttons.find((b) => b.id !== 't-stop');
  if (!stop) errors.push('Arrêter not shown');
  if (!pause) errors.push('Pause (or Reprendre / Remise en route) not shown');
  for (const b of s.buttons) {
    if (!b.inside) errors.push(b.id + ' not wholly inside the window');
    if (Math.min(b.w, b.h) < 63.5) errors.push(b.id + ' ' + b.w + ' x ' + b.h + ' px, goal 64');
    if (b.bad.length) errors.push(b.id + ' covered: ' + b.bad.join(', '));
    if (b.inert) errors.push(b.id + ' inert under ' + b.inert);
  }
  if (s.wide.document || s.wide.main || s.wide.active) errors.push('horizontal scroll (' + JSON.stringify(s.wide) + ')');
  if (s.stateCut) errors.push('step state cut in the step head: ' + s.stateCut);
  // The step bar's sentence scrolls only when it is longer than its three lines, never for a pixel of glyph.
  if (s.cause && s.cause.scroll > s.cause.client + 0.5 && s.cause.client < s.cause.max - 1) errors.push('step bar sentence scrolls with room left (' + s.cause.scroll + ' > ' + s.cause.client + ' of ' + s.cause.max + ' px): ' + s.cause.text);
  if (portrait) {
    const r = s.rail;
    if (!r) errors.push('rail missing');
    else {
      if (Math.abs(r.bottom - s.vh) > 1 || r.left > 1 || Math.abs(r.right - s.vw) > 1) errors.push('rail not along the bottom edge (' + JSON.stringify([r.left, r.top, r.right, r.bottom]) + ')');
      if (r.entries.length !== 6) errors.push('rail shows ' + r.entries.length + ' entries instead of 6');
      const rows = new Set(r.entries.map((e) => Math.round(e.y)));
      if (rows.size > 1) errors.push('rail entries on ' + rows.size + ' rows');
      for (const e of r.entries) {
        if (Math.min(e.w, e.h) < 47.5) errors.push('rail ' + e.screen + ' ' + e.w + ' x ' + e.h + ' px, goal 48');
        if (!e.hit) errors.push('rail ' + e.screen + ' covered');
      }
    }
  }
  return errors;
}

// Merge of the lots (feat/fonctions-5): the command added by F4 (« Rendre la main », refused during a job)
// on a small screen, this device holding the hand. The same measures as the other screens (whole words,
// text in its control, Pause and Arrêter in reach); the v2 bench refuses every POST, so only what the
// server's snapshot shows is measured. F1's « Cadrer à vide… » is on Contrôle, measured in every state.
const VISIBLE = `(function(id){var n=document.getElementById(id);if(!n||n.hidden||!n.getClientRects().length)return null;var r=n.getBoundingClientRect();
  return {w:r.width,h:r.height,left:r.left,right:r.right,vw:document.documentElement.clientWidth,disabled:!!n.disabled,text:(n.textContent||'').trim()};})`;
async function mergedCommands(h, cdp, fx, v, report, summary) {
  const { screensCapture, failures, log } = h;
  // A fresh page: the last state of the variant may have ended the stream (« lost »).
  fx.extra = null;
  fx.setPhase('idle');
  await h.v2Open(cdp, fx.base + 'index.html?small=' + v.id + '-merge', false);
  const id = await cdp.evaluate('localStorage.getItem("cnc-touch-client-id")');
  const mine = { owner: { kind: 'touch', id, label: 'Tablette', present: true, since: Date.now() }, lastChange: null };
  const steps = [
    ['job-held', 'running', { control: mine }, 'm.workflow==="running"']
  ];
  for (const [step, phase, extra, ready] of steps) {
    const tag = 'small ' + v.id + ' ' + step, results = [];
    fx.extra = extra;
    fx.setPhase(phase);
    try {
      await cdp.waitFor('(function(){var m=window.cncState&&window.cncState.get().machine;return !!(m&&m.control&&m.control.owner&&m.control.owner.id===' + JSON.stringify(id) + '&&' + ready + ');})()', 20000, 'state ' + step);
      await h.sleep(1500);
      const page = await cdp.evaluate('({lang:document.documentElement.lang,v2:document.body.classList.contains("perf-v2"),large:document.body.classList.contains("display-large")})');
      await screensCapture(cdp, 'small-merge-home-' + v.id + '-' + step, 'home', 'Usinage', tag, page, results);
      const s = await cdp.evaluate(STRIP);
      report.push({ variant: v.id, phase: step, screen: 'home', strip: s });
      for (const e of stripChecks(s, v.portrait)) failures.push(tag + ' Usinage: ' + e);
      // « La main »: Rendre la main shown for the holder, struck through during the job, with its reason and remedy.
      await h.goScreen(cdp, 'home');
      await cdp.evaluate('document.getElementById("t-pilot").click();true');
      await cdp.waitFor('!document.getElementById("pilot-dialog").hidden', 5000, 'dialog « La main »');
      const give = await cdp.evaluate(VISIBLE + '("pilot-release")'), why = await cdp.evaluate(VISIBLE + '("pilot-release-reason")'), see = await cdp.evaluate(VISIBLE + '("pilot-release-see")');
      if (!give || !give.disabled || !why || !why.text || !see) failures.push(tag + ': « Rendre la main » not refused with its reason and remedy (' + JSON.stringify({ give, why: !!why, see: !!see }) + ')');
      await screensCapture(cdp, 'small-merge-pilot-' + v.id + '-' + step, 'pilot', 'La main (dialogue)', tag, page, results, { stay: true });
      const d = await cdp.evaluate(STRIP);
      report.push({ variant: v.id, phase: step, screen: 'pilot', strip: d });
      for (const e of stripChecks(d, false)) failures.push(tag + ' La main (dialogue): ' + e);
      await cdp.evaluate('document.getElementById("pilot-dismiss").click();true');
      await cdp.waitFor('document.getElementById("pilot-dialog").hidden', 5000, 'dialog « La main » closed');
      log(tag + ': Usinage and « La main » checked');
    } catch (e) { failures.push(tag + ': ' + e.message); log('FAIL ' + tag + ': ' + e.message); }
    summary.measurements.push({ variant: tag, dir: 'small-merge-*-' + v.id + '-' + step, dpr: 1, results, strict: true, overlap: true });
  }
  fx.extra = null;
  fx.setPhase('idle');
}

async function run(h, summary) {
  const { startV2Fixture, launchBrowser, setViewport, v2Storage, settingsStorage, v2Open, screensCapture, sleep, log, failures } = h;
  const only = process.env.CNC_SMALL_ONLY ? new RegExp(process.env.CNC_SMALL_ONLY) : null;
  const fx = await startV2Fixture();
  const browser = await launchBrowser(412, 915, h.V2_FLAGS), cdp = browser.cdp;
  const report = [], tablets = [];
  try {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: h.V2_GPU_TRAP });
    for (const v of VARIANTS.filter((x) => !only || only.test(x.id))) {
      fx.setPhase('idle'); fx.overrides = { feed: 100, rapid: 100, spindle: 100 }; fx.profile = v.kind === 'laser' ? h.V2_LASER_PROFILE : h.V2_PROFILE;
      h.pageErrors.length = 0;
      try {
        await setViewport(cdp, v.w, v.h, 1);
        // The Performance profile is asked for: below the wide workstation the page must still open in v1.
        await v2Storage(cdp, fx.base, { profile: 'performance', v2: { version: 1, enabled: true }, kind: null });
        await settingsStorage(cdp, { lang: v.lang, size: v.size, theme: v.theme });
        await cdp.evaluate('localStorage.setItem("cnc-touch-probes-v1-real",' + JSON.stringify(JSON.stringify(h.PROBE_STORE)) + ');true');
        await v2Open(cdp, fx.base + 'index.html?small=' + v.id, false);
        for (const phase of v.states) {
          const tag = 'small ' + v.id + ' ' + phase, results = [];
          fx.setPhase(phase);
          try {
            if (h.SCREENS_READY[phase]) await cdp.waitFor('(function(){var m=window.cncState&&window.cncState.get().machine;return !!(' + h.SCREENS_READY[phase] + ');})()', 20000, 'state ' + phase);
            else await sleep(4000); // stale, lost: the report ages, the stream ends
            await sleep(phase === 'running' ? 1500 : 800);
            const page = await cdp.evaluate('({lang:document.documentElement.lang,v2:document.body.classList.contains("perf-v2"),large:document.body.classList.contains("display-large")})');
            if (page.lang !== v.lang || page.v2 || page.large !== (v.size === 'large')) failures.push(tag + ': page shown as ' + JSON.stringify(page));
            for (const [name, label] of SCREENS) {
              await screensCapture(cdp, 'small-' + name + '-' + v.id + '-' + phase, name, label, tag, page, results);
              const s = await cdp.evaluate(STRIP);
              report.push({ variant: v.id, phase, screen: name, strip: s });
              for (const e of stripChecks(s, v.portrait)) failures.push(tag + ' ' + label + ': ' + e);
            }
            // The dialog « La main » over Usinage: whole words in its commands, Pause and Arrêter still in reach.
            if (phase === v.states[0]) {
              await h.goScreen(cdp, 'home');
              await cdp.evaluate('document.getElementById("t-pilot").click();true');
              await cdp.waitFor('!document.getElementById("pilot-dialog").hidden', 5000, 'dialog « La main »');
              await screensCapture(cdp, 'small-pilot-' + v.id + '-' + phase, 'pilot', 'La main (dialogue)', tag, page, results, { stay: true });
              const s = await cdp.evaluate(STRIP);
              report.push({ variant: v.id, phase, screen: 'pilot', strip: s });
              // The rail lies under the modal layer, as on the tablets: only the strip's commands stay in reach.
              for (const e of stripChecks(s, false)) failures.push(tag + ' La main (dialogue): ' + e);
              await cdp.evaluate('document.getElementById("pilot-dismiss").click();true');
              await cdp.waitFor('document.getElementById("pilot-dialog").hidden', 5000, 'dialog « La main » closed');
            }
            log(tag + ': ' + results.length + ' screens, strip and rail checked');
          } catch (e) { failures.push(tag + ': ' + e.message); log('FAIL ' + tag + ': ' + e.message); }
          summary.measurements.push({ variant: tag, dir: 'small-*-' + v.id + '-' + phase, dpr: 1, results, strict: true, overlap: true });
        }
        if (v.kind === 'cnc') await mergedCommands(h, cdp, fx, v, report, summary);
        if (h.pageErrors.length) failures.push('small ' + v.id + ': page exceptions: ' + h.pageErrors.slice(0, 3).join(' | ').slice(0, 600));
      } catch (e) { failures.push('small ' + v.id + ': ' + e.message); log('FAIL small ' + v.id + ': ' + e.message); }
    }
    if (!only || only.test('tablette')) await tabletsUnchanged(h, cdp, fx, tablets);
  } finally {
    try { await cdp.send('Browser.close', {}, 3000); } catch (_) { /* closed */ }
    cdp.close();
    try { browser.child.kill(); } catch (_) { /* gone */ }
    fx.close();
    await sleep(300);
    try { fs.rmSync(browser.profile, { recursive: true, force: true }); } catch (_) { /* busy */ }
  }
  fs.mkdirSync(h.OUT, { recursive: true });
  fs.writeFileSync(path.join(h.OUT, 'small.json'), JSON.stringify({ variants: VARIANTS, report, tablets }, null, 1));
  summary.small = { variants: VARIANTS.map((v) => v.id), checks: report.length, tablets: tablets.length, tabletsUnchanged: tablets.filter((t) => t.unchanged).length };
}

module.exports = { run, VARIANTS, SCREENS, STRIP, stripChecks, TABLETS };
