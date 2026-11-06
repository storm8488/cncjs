'use strict';
// Suivi: the motion-based estimate next to the rhythm-based one (job-dashboard.js), clearly labelled,
// rapids from $110-$112 or said unknown, unknown durations listed with their line, corrected during the
// job from the acknowledged lines; the follow-up wording (acquittée / rapportée, never usinée / mesurée).
const fs = require('fs'), vm = require('vm'), assert = require('assert').strict;
const ME = require('./touch/motion-estimate.js');
let now = 10000; const listeners = {}, requests = [];
const { document, node: el } = require('./dom-fixture.cjs').createDOM(['home']);
const context = { document, window: { CNCMotionEstimate: ME, cncLibrarySelection: null, addEventListener: (n, f) => listeners[n] = f }, Date: { now: () => now },
  localStorage: { getItem: () => JSON.stringify({ state: { session: { token: 'fake' } } }) },
  XMLHttpRequest: function () { this.open = () => {}; this.setRequestHeader = () => {}; this.abort = () => {}; this.send = body => requests.push({ xhr: this, file: JSON.parse(body).file }); } };
context.window.performance = { now: () => now };
vm.runInNewContext(fs.readFileSync(__dirname + '/touch/job-dashboard.js', 'utf8'), context);
const status = machine => listeners['cnc-job-status']({ detail: { machine, simulation: false } });

const lines = ['G21 G90', 'G0 Z5', 'G0 X0 Y0'];
for (let i = 0; i < 100; i++) lines.push('G1 X' + (i % 2 ? 0 : 100) + ' Y' + i + ' F3000');
lines.splice(50, 0, 'M0');
lines.push('T2 M6', 'G1 X50 Y50', 'M30');
const est = JSON.parse(JSON.stringify(ME.estimate(lines.join('\n'))));
const c = { port: '/dev/ttyUSB0', name: 'a.nc', revision: 1, fresh: true, total: est.lines, received: 0, workflow: 'idle', canStart: true, canLoad: true, activeState: 'Idle' };
status(c);
const xhr = requests.find(r => r.file === 'a.nc.cnctouch.json').xhr;
xhr.status = 200; xhr.responseText = JSON.stringify({ preview: { stale: false }, data: JSON.stringify({ file: 'a.nc', fingerprint: 'sha256:1', preview: { version: 3, image: 'data:image/png;base64,AAAA', estimate: est } }) });
xhr.onload(); el('home-job-image').onload();
status(c);
let text = el('home-job-motion').textContent;
assert.equal(el('home-job-motion').hidden, false);
assert.match(text, /^Selon les mouvements \(sans accélérations\) : au moins /, 'rapids unknown: a lower bound');
assert.match(text, /rapides non comptés \(\$110–\$112 inconnus\)/);
assert.match(text, /durées inconnues : pause M0 \(l\. 51\), changement d’outil M6 \(l\. 105\)/);
assert.match(el('home-job-eta').textContent, /estimation après démarrage/, 'the rhythm-based estimate is kept, separately');
// With $110-$112 from the controller: bounded or exact.
status({ ...c, settings: { $110: '6000', $111: '6000', $112: '1000' } });
text = el('home-job-motion').textContent;
assert.match(text, /^Selon les mouvements \(sans accélérations\) : (≈|entre) /); assert(!/rapides non comptés/.test(text));
// During the job: from the acknowledged line, corrected once enough time was observed.
const run = { ...c, settings: { $110: '6000', $111: '6000', $112: '1000' }, workflow: 'running', canStart: false, activeState: 'Run' };
status({ ...run, received: 20 });
for (let r = 21; r <= 50; r++) { now += 1000; status({ ...run, received: r }); }
text = el('home-job-motion').textContent;
assert.match(text, /^Selon les mouvements : .* restantes, corrigé ×[\d,]+ d’après les lignes acquittées/, text);
assert.match(text, /durées inconnues à venir : pause M0 \(l\. 51\), changement d’outil M6/);
// The model says 2 s a line, 1 s per line was observed: factor about 0.5.
assert.match(text, /corrigé ×0,5/);
status({ ...run, received: 60 });
assert(!/pause M0/.test(el('home-job-motion').textContent), 'pause already passed: not ahead any more');
// An older preview without estimate: said so, nothing invented.
const old = { ...c, name: 'b.nc' };
status(old);
const x2 = requests.find(r => r.file === 'b.nc.cnctouch.json').xhr;
x2.status = 200; x2.responseText = JSON.stringify({ preview: { stale: false }, data: JSON.stringify({ file: 'b.nc', fingerprint: 'sha256:2', preview: { image: 'data:image/png;base64,AAAA' } }) });
x2.onload(); el('home-job-image').onload(); status(old);
assert.match(el('home-job-motion').textContent, /indisponible pour cet aperçu/);

// Wording of the follow-up (tool-position.js): planned path, acknowledged lines, reported position and its age.
const tp = fs.readFileSync(__dirname + '/touch/tool-position.js', 'utf8');
assert(/parcours prévu/.test(tp) && /lignes acquittées par Grbl/.test(tp) && /position de travail rapportée par Grbl il y a /.test(tp));
assert(/statusAgeMs/.test(tp), 'age of the report from the server');
for (const f of ['tool-position.js', 'job-dashboard.js', 'preview-gl.js', 'preview-inspect.js', 'laser-view.js']) {
  const src = fs.readFileSync(__dirname + '/touch/' + f, 'utf8');
  for (const m of src.matchAll(/t\('([^']*)'\)/g)) {
    assert(!/position (de travail )?mesurée/i.test(m[1]), f + ': a reported position is "rapportée": ' + m[1]);
    assert(!/lignes? (usinées?)(?! *\))/i.test(m[1]) || /pas forcément usinées/.test(m[1]), f + ': an acknowledged line is "acquittée": ' + m[1]);
  }
}
console.log('PASS job motion estimate: labelled next to the rhythm estimate, rapids bounded with $110–$112 or said unknown, unknown durations with lines, corrected from acknowledged lines, older previews said unavailable; follow-up wording acquittée / rapportée.');
