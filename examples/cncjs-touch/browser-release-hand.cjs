'use strict';
// F4 "Rendre la main" in a real browser, on the real job service and the Grbl simulator (parcours-server.cjs):
//   - at rest, this device holding the hand: "La main" shows « Rendre la main » (64 px, inside the window, no
//     horizontal scroll), one tap gives the hand back (nobody has it afterwards), and another device then takes it
//     with no reason;
//   - during a job (running): the button is rayé with the server's phrase and « Voir l'usinage »; a tap sends nothing
//     and the hand stays with this device.
// At 1366 x 911, 1366 x 768 and 1024 x 600, FR / EN / ES, standard and large text. Screenshots go to --out.
// Not part of verify-project.cjs (it needs a browser); parcours-server.cjs is the fixture of browser-run.cjs --only parcours.
//   node browser-release-hand.cjs [--browser PATH] [--out DIR]
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const option = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
if (option('--browser')) process.env.CNC_BROWSER = option('--browser');
const OUT = path.resolve(option('--out', path.join(__dirname, 'output', 'F4')));
const H = require('./browser-run.cjs');

const IDLE = [[1366, 911, 'fr', false], [1366, 768, 'fr', false], [1366, 768, 'es', true], [1024, 600, 'es', true], [1024, 600, 'en', true]];
const JOB = [[1366, 768, 'fr', true], [1024, 600, 'es', true]];

const failures = [];
const check = (ok, message) => { if (!ok) { failures.push(message); console.log('FAIL ' + message); } };

// Opens the page in the given format and language; connects the machine when the fixture is not connected yet.
async function open(cdp, base, [w, h, lang, large]) {
  await H.setViewport(cdp, w, h, 1);
  await H.navigate(cdp, base + 'README.md');
  await cdp.evaluate('localStorage.setItem("cncjs-touch-language-v1",' + JSON.stringify(lang) + ');localStorage.setItem("cncjs-touch-display-v1",' + JSON.stringify(JSON.stringify({ size: large ? 'large' : 'standard' })) + ');true');
  await H.navigate(cdp, base + 'index.html');
  await H.waitReady(cdp);
  await H.sleep(2000);
  if (!(await cdp.evaluate('!!(window.cncState.get().machine&&window.cncState.get().machine.fresh)'))) {
    await cdp.evaluate('document.getElementById("step-machine-main").click();true');
    await cdp.waitFor('!!document.querySelector("#ks-connect .ks-connect-go")', 10000, 'connection question');
    await cdp.evaluate('document.querySelector("#ks-connect .ks-connect-go").click();true');
  }
  await cdp.waitFor('window.cncState.get().machine&&window.cncState.get().machine.fresh', 30000, 'machine');
}

// Setup, not an operator path: this device takes the hand by its own client id.
const claim = (cdp) => cdp.evaluate('fetch("/api/touch-job",{method:"POST",body:JSON.stringify({action:"control",operation:"claim",port:"SIM",clientId:window.cncJobControls.clientId(),clientLabel:"Tablette A"})}).then(function(r){if(!r.ok)throw Error("claim failed")});true');

const DIALOG = '(function(){function box(id){var n=document.getElementById(id);if(!n||n.hidden)return null;var b=n.getBoundingClientRect();return {h:Math.round(b.height),w:Math.round(b.width)};}' +
  'var c=document.querySelector("#pilot-dialog .job-dialog-card"),r=document.getElementById("pilot-release");' +
  'return {release:box("pilot-release"),see:box("pilot-release-see"),reason:document.getElementById("pilot-release-reason").hidden?"":document.getElementById("pilot-release-reason").textContent,' +
  'disabled:r.disabled,fits:c.scrollHeight<=c.clientHeight+1&&c.getBoundingClientRect().bottom<=innerHeight&&c.getBoundingClientRect().top>=0,hscroll:document.documentElement.scrollWidth>innerWidth,' +
  'state:window.cncJobControls.pilot().state,controls:performance.getEntriesByType("resource").length}})()';

async function shot(cdp, name) {
  const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(image.data, 'base64'));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const fixture = await H.startFixture([], 'parcours-server.cjs');
  const browser = await H.launchBrowser(1366, 768);
  const cdp = browser.cdp;
  try {
    for (const variant of IDLE) {
      const name = variant[0] + 'x' + variant[1] + '-' + variant[2] + (variant[3] ? '-large' : '') + '-repos';
      await open(cdp, fixture.base, variant);
      await claim(cdp);
      await cdp.waitFor('window.cncJobControls.pilot().state==="mine"', 20000, 'this device has the hand');
      await cdp.evaluate('document.getElementById("t-pilot").click();true');
      await cdp.waitFor('!document.getElementById("pilot-dialog").hidden', 5000, 'dialog');
      await H.sleep(300);
      const d = await cdp.evaluate(DIALOG);
      check(d.release && !d.disabled, name + ': the release button is shown and usable ' + JSON.stringify(d));
      check(d.release && d.release.h >= 64, name + ': the release button is 64 px high at least (' + (d.release && d.release.h) + ')');
      check(d.fits && !d.hscroll, name + ': the dialog fits the window without horizontal scroll ' + JSON.stringify(d));
      check(!d.see && !d.reason, name + ': nothing is refused at rest');
      await shot(cdp, name);
      await cdp.evaluate('document.getElementById("pilot-release").click();true');
      await cdp.waitFor('window.cncJobControls.pilot().state==="free"&&document.getElementById("pilot-dialog").hidden', 15000, 'the hand is given back');
      const owner = await cdp.evaluate('JSON.stringify(window.cncState.get().machine.control.owner)');
      check(owner === 'null', name + ': nobody has the hand after the release (' + owner + ')');
      // Another device takes it without any reason (the classic claim of a free port).
      const other = await cdp.evaluate('fetch("/api/touch-job",{method:"POST",body:JSON.stringify({action:"control",operation:"claim",port:"SIM",clientId:"t-other-device",clientLabel:"PC atelier"})}).then(function(r){return r.status})');
      check(other === 200, name + ': another device takes the free hand without a reason (HTTP ' + other + ')');
      await cdp.waitFor('window.cncJobControls.pilot().state==="other"', 15000, 'another device has it');
      // Back to the fixture's free state for the next variant.
      await cdp.evaluate('fetch("/api/touch-job",{method:"POST",body:JSON.stringify({action:"control",operation:"release",port:"SIM",clientId:"t-other-device",clientLabel:"PC atelier"})}).then(function(r){return r.status})');
      console.log('ok ' + name + ' ' + JSON.stringify({ release: d.release, fits: d.fits }));
    }

    for (const variant of JOB) {
      const name = variant[0] + 'x' + variant[1] + '-' + variant[2] + (variant[3] ? '-large' : '') + '-usinage';
      await open(cdp, fixture.base, variant);
      if (!(await cdp.evaluate('!!(window.cncState.get().machine&&window.cncState.get().machine.homed)'))) {
        await cdp.waitFor('window.cncSeance.state().barres.machine.action.id==="prise-origine"', 15000, 'homing is the next action');
        await H.sleep(700);
        await cdp.evaluate('document.getElementById("step-machine-main").click();true');
        await cdp.waitFor('!document.getElementById("job-dialog").hidden', 5000, 'homing dialog');
        await cdp.evaluate('document.getElementById("job-check").click();true');
        await H.sleep(700);
        await cdp.evaluate('document.getElementById("job-confirm").click();true');
        await cdp.waitFor('(function(){var m=window.cncState.get().machine;return m&&m.homed&&m.workOffset.state==="proven";})()', 30000, 'homed with a proven zero');
      }
      if (!(await cdp.evaluate('window.cncState.get().machine.workflow==="running"'))) {
        await cdp.evaluate('fetch("/parcours/sim",{method:"POST",body:JSON.stringify({input:"job",clientId:window.cncJobControls.clientId()})}).then(function(r){if(!r.ok)throw Error("job failed")});true');
      }
      await cdp.waitFor('window.cncState.get().machine.workflow==="running"&&window.cncJobControls.pilot().state==="mine"', 30000, 'a job runs and this device has the hand');
      await cdp.evaluate('document.getElementById("t-pilot").click();true');
      await cdp.waitFor('!document.getElementById("pilot-dialog").hidden', 5000, 'dialog');
      await H.sleep(300);
      const d = await cdp.evaluate(DIALOG);
      check(d.disabled, name + ': the release button is rayé during the job ' + JSON.stringify(d));
      check(/usinage|machining|mecanizado/i.test(d.reason), name + ': the phrase says why (' + d.reason + ')');
      check(d.see && d.see.h >= 64, name + ': the remedy « Voir l’usinage » is shown');
      check(d.fits && !d.hscroll, name + ': the dialog fits the window without horizontal scroll ' + JSON.stringify(d));
      await shot(cdp, name);
      await cdp.evaluate('document.getElementById("pilot-release").click();true');
      await H.sleep(500);
      const after = await cdp.evaluate('JSON.stringify({state:window.cncJobControls.pilot().state,owner:!!window.cncState.get().machine.control.owner,workflow:window.cncState.get().machine.workflow})');
      check(after === '{"state":"mine","owner":true,"workflow":"running"}', name + ': a tap on the refused button changes nothing (' + after + ')');
      // Stop the job so the next variant starts from rest (Arrêter, as the operator would).
      await cdp.evaluate('document.getElementById("pilot-dismiss").click();document.getElementById("t-stop").click();true');
      await cdp.waitFor('window.cncState.get().machine.workflow==="idle"', 15000, 'job stopped');
      console.log('ok ' + name + ' ' + JSON.stringify({ reason: d.reason, see: d.see, fits: d.fits }));
    }
  } finally {
    try { await cdp.send('Browser.close'); } catch (e) { /* closed */ }
    fixture.child.kill();
  }
  if (failures.length) { console.log(failures.length + ' failure(s)'); process.exit(1); }
  console.log('PASS give back the hand in the browser: at rest and during a job, 5 + 2 formats, FR/EN/ES.');
}
main().catch((e) => { console.error(e); process.exit(1); });
