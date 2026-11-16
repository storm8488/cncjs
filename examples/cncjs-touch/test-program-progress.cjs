'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const { createDOM } = require('./dom-fixture.cjs');
function fixture(language = 'fr') {
  const dom = createDOM(['home']), listeners = {};
  dom.document.documentElement = { lang: language };
  const window = { addEventListener: (name, fn) => { listeners[name] = fn; } };
  let now = 10000;
  window.performance = { now: () => now };
  const context = vm.createContext({ window, document: dom.document, Date: { now: () => now },
    localStorage: { getItem: key => key === 'cncjs-touch-language-v1' ? language : null },
    XMLHttpRequest: function () { throw Error('No preview or external request is needed'); } });
  for (const file of ['i18n-messages.js', 'i18n.js', 'motion-estimate.js', 'job-dashboard.js']) {
    vm.runInContext(fs.readFileSync(__dirname + '/touch/' + file, 'utf8'), context);
  }
  let machine = { port: 'TEST', generation: 'g1', revision: 'r1', name: 'surface.nc', fingerprint: 'sha256:aa',
    fresh: true, total: 56, received: 52, workflow: 'running', activeState: 'Run' };
  const send = patch => { machine = { ...machine, ...patch }; listeners['cnc-job-status']({ detail: { machine, simulation: false } }); };
  return { ...dom, send, advance: ms => { now += ms; }, preview: data => { dom.node('home-job-image').cncPreview = data; },
    percent: () => dom.node('home-job-percent').textContent, eta: () => dom.node('home-job-eta').textContent };
}
const progress = (active, elapsed = active) => ({ durationSeconds: 420, activeSeconds: active, elapsedSeconds: elapsed,
  percent: active < 420 ? Math.min(99, active / 420 * 100) : null, remainingSeconds: active < 420 ? 420 - active : null });

for (const language of ['fr', 'en', 'es']) {
  const f = fixture(language);
  f.send({ jobProgress: progress(0) });
  assert.equal(f.percent(), '0 %', '52/56 acknowledged is not 92% machined');
  assert.equal(f.node('home-job-progress').hidden, false);
  for (const seconds of [30, 60, 120, 210, 300]) {
    f.advance(1000); f.send({ received: 56, jobProgress: progress(seconds) });
    assert.equal(f.percent(), Math.floor(seconds / 420 * 100) + ' %', 'all acknowledgements at the start must still allow advancing progress');
    assert.doesNotMatch(f.eta(), /acquitt|acknowledged|confirmadas/);
  }
  f.send({ workflow: 'paused', activeState: 'Hold', jobProgress: progress(300, 350) });
  f.advance(1000); f.send({ jobProgress: progress(300, 351) });
  assert.equal(f.percent(), '71 %');
  f.send({ workflow: 'running', activeState: 'Run', jobProgress: progress(301, 352) });
  assert.equal(f.percent(), '71 %', 'resume continues the server clock');
  const reloaded = fixture(language); reloaded.send({ received: 56, jobProgress: progress(301, 352) });
  assert.equal(reloaded.percent(), f.percent(), 'a page joining mid-run uses the same progress');
  f.send({ received: 56, jobProgress: progress(420) });
  assert.equal(f.percent(), '—', 'an exhausted estimate must not sit at 99%');
  assert.equal(f.node('home-job-progress').hidden, true);
  assert.match(f.eta(), language === 'fr' ? /Progression indisponible.*Temps écoulé : 7 min/ : language === 'en' ? /Progress unavailable.*Elapsed time: 7 min/ : /Progreso no disponible.*Tiempo transcurrido: 7 min/);
  f.send({ workflow: 'idle', activeState: 'Idle', received: 0, finished: true });
  assert.equal(f.percent(), '100 %');
  f.send({ workflow: 'running', activeState: 'Run', finished: false, jobProgress: progress(0) });
  assert.equal(f.percent(), '0 %', 'same revision started again resets the execution');
  f.send({ revision: 'r2', jobProgress: null });
  assert.equal(f.percent(), '—');
}

const unknown = fixture();
unknown.send({ received: 56 });
assert.equal(unknown.percent(), '—', 'an older server without a preview never falls back to acknowledgements');
unknown.send({ jobProgress: { ...progress(60), durationSeconds: null, percent: null, remainingSeconds: null } });
assert.match(unknown.eta(), /Progression indisponible.*Temps écoulé : 1 min/);
for (const bad of [NaN, Infinity, -1, 100, '40']) {
  unknown.send({ jobProgress: { ...progress(60), percent: bad } });
  assert.equal(unknown.percent(), '—');
}
unknown.send({ fresh: false, jobProgress: progress(60) });
assert.equal(unknown.percent(), '—');
assert.equal(unknown.node('home-job-progress').hidden, true);
unknown.send({ fresh: true, revision: 'r3', resume: { from: 20, preambleLength: 5 }, jobProgress: progress(60) });
assert.equal(unknown.percent(), '14 %', 'a rebuilt resume has its own server model');
unknown.preview({ file: 'surface.nc', fingerprint: 'sha256:old', estimate: { version: 1, feedSeconds: 1 } });
unknown.send({ jobProgress: progress(120) });
assert.equal(unknown.percent(), '28 %', 'a stale sidecar cannot override the loaded model');
console.log('PASS: program progress without a sidecar, all lines buffered, pause/resume/reload/restart, estimate exhausted, unavailable and FR/EN/ES.');
