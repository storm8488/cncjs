'use strict';
// Defect (L5): job-preparation.js asked origin-preview.js with `.then(mount, mount)`. When the v2
// gate closed while that request was pending, or when Préparer was shown again after the gate had
// closed, the loader refused ('v2-gate-closed') and the refusal handler still mounted the already
// loaded origin card: a closed v2 session reopened the visual origin (in v1 mode, GPU view included).
const assert = require('assert').strict;
const { preparerPage, idle } = require('./test-v2-preparer-fixture.cjs');
(async () => {
  // 1. The gate closes while the request is pending: the refusal does not mount.
  let p = preparerPage(); p.status(idle()); await p.flush();
  assert.equal(p.calls.loads.length, 1, 'Préparer visible in the wide layout asks for the origin modules');
  p.v2.gate = false; p.rejectLoads('v2-gate-closed'); await p.flush();
  assert.equal(p.calls.mount.length, 0, 'a refused request after the v2 gate closed never mounts the origin card');
  // 2. Already loaded and unmounted; Préparer shown again after the gate closed: no new mount.
  p = preparerPage(); p.status(idle()); await p.flush(); p.resolveLoads(); await p.flush();
  assert.equal(p.calls.mount.length, 1, 'normal mount while the gate is open');
  p.show('home'); assert.equal(p.calls.unmount, 1);
  p.v2.gate = false; p.show('jog'); await p.flush(); p.rejectLoads('v2-gate-closed'); await p.flush();
  assert.equal(p.calls.mount.length, 1, 'the closed v2 session does not reopen an origin already loaded');
  // 3. Without the v2 layout (v1 page), a missing preview-gl.js still mounts the card (it says why).
  p = preparerPage({ v2: false, contract: false }); p.status(idle()); await p.flush();
  p.rejectLoads('Module avancé introuvable : preview-gl.js'); await p.flush();
  assert.equal(p.calls.mount.length, 1, 'v1 keeps mounting the card when a module is missing');
  console.log('PASS v2 préparer reopen: a refused origin request after the v2 gate closed never remounts the visual origin; v1 unchanged.');
})().catch(e => { console.error(e); process.exitCode = 1; });
