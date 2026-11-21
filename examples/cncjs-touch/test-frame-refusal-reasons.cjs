'use strict';
// Laser framing refused by the travel check (409 ETOUCH_LASER_FRAME_CHECK, server F1 round 2): the
// refusal carries the check's coded reasons ({code, params, message}, like a program check's
// codedReasons). The feedback shown to the operator ends with them (3 at most), each in the
// interface language when the catalog knows its code; without reasons the message is unchanged.
const assert = require('node:assert/strict');
const { load } = require('./job-controls-fixture.cjs');

const laser = { machineProfile: { kind: 'laser', label: 'Atelier', capabilities: { laserFrame: { supported: true } } } };
async function refusedFrame(data) {
  const f = load();
  await f.connect(f.machine(laser));
  assert.equal(f.controls().prepareFrame(), true);
  const post = f.posts().at(-1);
  assert.deepEqual([post.body.action, post.body.operation], ['machine', 'frame-prepare']);
  f.answer(post, data, 409); await f.flush();
  return f.el('job-feedback').textContent;
}

(async () => {
  const message = 'Cadrage refusé : course non vérifiable.';
  const reasons = [
    { code: 'ETOUCH_CHECK_HOMING_DIRECTION', params: { axis: 'X', setting: 130 }, message: 'X : origine machine côté positif ($23), course $130 non vérifiée.' },
    { code: 'ETOUCH_CHECK_HOMING_DIRECTION', params: { axis: 'Y', setting: 131 }, message: 'Y : origine machine côté positif ($23), course $131 non vérifiée.' },
    { code: 'ETOUCH_X', params: {}, message: 'Troisième raison.' },
    { code: 'ETOUCH_X', params: {}, message: 'Quatrième raison, non montrée.' },
    null, { code: 'ETOUCH_X' }
  ];
  let text = await refusedFrame({ code: 'ETOUCH_LASER_FRAME_CHECK', message, reasons });
  assert.ok(text.startsWith(message), text);
  assert.match(text, /X : origine machine côté positif \(\$23\), course \$130 non vérifiée\./);
  assert.match(text, /Y : origine machine côté positif \(\$23\), course \$131 non vérifiée\./);
  assert.match(text, /Troisième raison\./);
  assert.doesNotMatch(text, /Quatrième/, 'three reasons at most');
  // Without reasons: the message alone, unchanged.
  text = await refusedFrame({ code: 'ETOUCH_LASER_FRAME_CHECK', message });
  assert.equal(text, message);
  console.log('PASS');
})().catch((e) => { console.error(e); process.exit(1); });
