'use strict';
// Server refusals in the interface language (audit 31): cncI18n.format(code, params, fallback)
// fills the FR/EN/ES template of a stable code (ETOUCH_*) with the refusal's values; an unknown
// code or a missing value falls back on the server's French message (never an empty text);
// values are HTML-escaped and never read again as a template. The French templates are checked
// against the real server messages (resume.js, loaded natively), every ETOUCH_* code the server
// emits has a row, and the job controls show a coded 409 refusal translated.
const assert = require('assert').strict, fs = require('fs'), path = require('path'), vm = require('vm');
const { load } = require('./job-controls-fixture.cjs');
const touch = (name) => fs.readFileSync(path.join(__dirname, 'touch', name), 'utf8');
function i18n(language, extra = []) {
  const window = {}, saved = new Map([['cncjs-touch-language-v1', language]]);
  const context = { window, document: { documentElement: {}, title: '' }, localStorage: { getItem: (k) => saved.get(k) || null, setItem() {} } };
  // i18n-messages-machine.js: machine type and laser codes (ETOUCH_MACHINE_*, ETOUCH_LASER_*, ETOUCH_LASER_CHECK_*).
  ['i18n-messages.js', 'i18n-messages-machine.js', 'i18n.js'].concat(extra).forEach((name) => vm.runInNewContext(touch(name), context));
  return window;
}
const P = (...lines) => lines.join('\n');
const refusal = (fn) => { try { fn(); } catch (err) { return err; } throw new Error('not refused'); };
(async () => {
  const { buildResume } = await import('../../src/server/services/touch/resume.js');
  // The reachable resume refusals (as in resume.test.js) and their values.
  const cases = [
    () => buildResume(P('G21 G90', 'G0 Z5'), 9),
    () => buildResume(P('G21 G90', 'G92 X0', 'G0 Z5'), 3),
    () => buildResume(P('G21 G90', 'G93', 'G0 Z5'), 3),
    () => buildResume(P('G21 G90', 'G41 D1', 'G0 Z5'), 3),
    () => buildResume(P('G21 G90', 'G43 H1', 'G0 Z5'), 3),
    () => buildResume(P('G0 Z5', 'G21', 'G0 X1'), 3),
    () => buildResume(P('G21 G91', 'G0 Z5', 'G0 X1'), 3),
    () => buildResume(P('G21 G90', 'G43.1 Z2', 'G0 Z5 X0 Y0', 'G1 Z-1 F100', 'G1 X1'), 5),
    () => buildResume(P('G21 G90', 'G0 Z5', 'G1 X1 F100'), 3),
    () => buildResume(P('G21 G90 G54', 'G0 Z5 X0 Y0', 'G55', 'G0 X1', 'G1 X2 F100'), 5),
    () => buildResume(P('G21 G90', 'G0 X0 Y0', 'G1 Z5 F100', 'G1 Z-1', 'G1 X1'), 5),
    () => buildResume(P('G21 G90 G54', 'G0 X0 Y0 Z5', 'G55', 'G0 X0 Y0', 'G1 Z5 F100', 'G1 Z-1', 'G1 X1'), 7),
    () => buildResume(P('G21 G90', 'G0 Z5 X0 Y0', 'G0 Z1', 'G1 X1'), 4),
    () => buildResume(P('G21 G90', 'M3', 'G0 Z5 X0 Y0', 'G1 Z-1 F100', 'G1 X1'), 5)
  ].map(refusal);
  const fr = i18n('fr').cncI18n, en = i18n('en').cncI18n, es = i18n('es').cncI18n;
  const seen = new Set();
  for (const err of cases) {
    assert.match(err.code, /^ETOUCH_RESUME_/); seen.add(err.code);
    // The French template is the server's message, value for value (no drift).
    assert.equal(fr.format(err.code, err.params, ''), err.message, err.code + ' French template');
    assert.equal(fr.format(err.code, err.params, err.message), err.message);
    for (const [language, i] of [['en', en], ['es', es]]) {
      const text = i.format(err.code, err.params, err.message);
      assert.notEqual(text, err.message, err.code + ' ' + language + ' translated');
      assert.doesNotMatch(text, /[{}[\]]/, err.code + ' ' + language + ' filled');
      Object.values(err.params).filter((v) => v !== null).forEach((v) => assert(text.includes(String(v)), err.code + ' ' + language + ' shows ' + v + ': ' + text));
    }
  }
  assert.equal(seen.size, 13, 'every reachable resume refusal (CLEARANCE is defensive)');
  // Machine type and laser (lot A): the laser resume refusals, every coded refusal of
  // machine-profile.js and the laser reasons of the program check, value for value.
  const { machineRefusal } = await import('../../src/server/services/touch/machine-profile.js');
  const { programCheck } = await import('../../src/server/services/touch/program-check.js');
  const laser = (gcode, from) => refusal(() => buildResume(gcode, from, { mode: 'laser' }));
  const machineCases = [
    laser(P('G21 G90', 'G0 X0 Y0', 'M3 S500', 'G1 X10 F1000', 'G1 Y10'), 5),
    laser(P('G21 G90', 'M3 S500', 'G0 X0 Y0', 'G0 X5 Y5', 'G1 X10 F1000'), 4),
    laser(P('G21 G90', 'G1 Z0 F100', 'M5', 'G0 Y5', 'G0 X1 Y1'), 4),
    laser(P('G21 G90', 'G0 Z1 X0 Y0', 'G0 Z2', 'M5', 'G0 X1 Y1'), 5),
    laser(P('G21 G90', 'G0 X0 Y0', 'M3', 'G1 X10 F1000', 'G0 X20 Y0'), 5)
  ].concat(['ETOUCH_MACHINE_LASER_MODE_ON', 'ETOUCH_MACHINE_LASER_MODE_OFF', 'ETOUCH_MACHINE_SETTINGS_UNKNOWN', 'ETOUCH_MACHINE_CONNECTION',
    'ETOUCH_MACHINE_STALE', 'ETOUCH_MACHINE_BUSY', 'ETOUCH_MACHINE_CONTROLLER_CHANGED', 'ETOUCH_MACHINE_TRANSPORT', 'ETOUCH_MACHINE_KIND_INVALID',
    'ETOUCH_MACHINE_NOT_ASSOCIATED', 'ETOUCH_MACHINE_STORE', 'ETOUCH_MACHINE_OPERATION', 'ETOUCH_LASER_NOT_LASER', 'ETOUCH_LASER_NO_SPINDLE_TEST',
    'ETOUCH_LASER_NO_PLATE_PROBE', 'ETOUCH_LASER_NO_TOOL_CHANGE', 'ETOUCH_LASER_NO_CNC_RESUME', 'ETOUCH_LASER_FRAME_DISABLED',
    'ETOUCH_LASER_FRAME_NO_PROGRAM', 'ETOUCH_LASER_FRAME_CHECK', 'ETOUCH_LASER_FRAME_BOUNDS', 'ETOUCH_LASER_FRAME_POSITION',
    'ETOUCH_LASER_FRAME_CHANGED', 'ETOUCH_LASER_FRAME_EXPIRED'].map((code) => machineRefusal(code)))
    .concat([machineRefusal('ETOUCH_MACHINE_RESUME_MODE_CHANGED', { loaded: 'CNC', now: 'laser' }), machineRefusal('ETOUCH_MACHINE_AMBIGUOUS', { count: 2 }), machineRefusal('ETOUCH_MACHINE_NOT_IDLE', { state: 'Alarm' }),
      machineRefusal('ETOUCH_LASER_FRAME_WCS', { wcs: 'G55', active: 'G54' }), machineRefusal('ETOUCH_LASER_FRAME_FEED', { min: 1, max: '3000' }),
      machineRefusal('ETOUCH_LASER_FRAME_SLOW', { seconds: 75, max: 60 })]);
  const laserCheck = programCheck(P('G21 G90', 'M3 S1200', 'G1 X10 F1000', 'M4 S100', 'G1 Y5', 'M5'), { settings: { $30: 1000 }, laser: { sMax: 1000 } }).laser;
  const quiet = programCheck(P('G21 G90', 'G0 X10 S20'), { settings: {}, laser: { sMax: null } }).laser;
  laserCheck.codedReasons.concat(quiet.codedReasons).forEach((r) => machineCases.push(r));
  const machineSeen = new Set();
  for (const err of machineCases) {
    assert.match(err.code, /^ETOUCH_(MACHINE|LASER)_/); machineSeen.add(err.code);
    assert.equal(fr.format(err.code, err.params, ''), err.message, err.code + ' French template');
    for (const [language, i] of [['en', en], ['es', es]]) {
      const text = i.format(err.code, err.params, err.message);
      assert.notEqual(text, err.message, err.code + ' ' + language + ' translated');
      assert.doesNotMatch(text, /[{}[\]]|power|puissance|potencia/i, err.code + ' ' + language + ' filled, no power wording');
    }
  }
  assert.equal(machineSeen.size, 40, 'every machine/laser code checked against its French template');
  // [ optional part ] dropped when its value is null, kept with its value otherwise.
  const noWcs = cases.find((e) => e.code === 'ETOUCH_RESUME_NO_RAPID_Z' && e.params.wcs === null), g55 = cases.find((e) => e.code === 'ETOUCH_RESUME_NO_RAPID_Z' && e.params.wcs);
  assert(noWcs && g55, 'both forms of NO_RAPID_Z');
  assert.equal(en.format(noWcs.code, noWcs.params, noWcs.message), 'Clearance height unknown before line 5 (no G0 rapid move in Z): choose a line after a rapid retract.');
  assert.match(es.format(g55.code, g55.params, g55.message), /en Z en G55\)/);
  assert.equal(en.format('ETOUCH_RESUME_FEED', { from: 12 }, 'Avance inconnue avant la ligne 12 : choisissez une ligne plus loin.'), 'Feed rate unknown before line 12: choose a later line.');
  assert.equal(es.format('ETOUCH_RESUME_FEED', { from: 12 }, 'x'), 'Avance desconocido antes de la línea 12: elija una línea posterior.');

  // Unknown code, no code, missing or malformed value: the server's French message.
  const french = 'Le serveur a refusé : message propre au serveur.';
  assert.equal(en.format('ETOUCH_NOT_A_CODE', { from: 3 }, french), french);
  assert.equal(es.format(undefined, undefined, french), french);
  assert.equal(en.format('ETOUCH_RESUME_FEED', {}, french), french, 'missing value');
  assert.equal(en.format('ETOUCH_RESUME_FEED', { from: { x: 1 } }, french), french, 'object value');
  assert.equal(en.format('ETOUCH_RESUME_FEED', { from: NaN }, french), french, 'non-finite value');
  assert.equal(en.format('ETOUCH_RESUME_FEED', null, french), french);
  assert.equal(en.format('toString', {}, french), french, 'no prototype lookup');
  // A fallback that is a catalog phrase is still translated; nothing at all is never empty.
  assert.equal(en.format('ETOUCH_NOT_A_CODE', null, 'Réponse de suivi invalide.'), 'Invalid monitoring response.');
  assert.equal(en.format(null, null, ''), 'Refused by the server, no details.');
  assert.equal(fr.format(null, null, '   '), 'Refus du serveur sans détail.');
  // The output is plain text (written with textContent, never as markup): a value is shown as
  // written (no « &amp; » entity on screen, audit 31 D-T1) and is never read again as a template.
  const html = en.format('ETOUCH_RESUME_UNITS_LATE', { units: '<img src=x onerror="alert(1)">', line: 3 }, french);
  assert.equal(html, 'The program sets its units (<img src=x onerror="alert(1)">) at line 3 after moves made in the machine’s units: cannot resume.');
  assert.equal(en.format('ETOUCH_RESUME_UNITS_LATE', { units: "A&B{line}'\u0007", line: 3 }, french),
    'The program sets its units (A&B{line}\') at line 3 after moves made in the machine’s units: cannot resume.');
  // Contract of that plain text: no caller writes it as HTML.
  const touchDir = path.join(__dirname, 'touch');
  for (const file of fs.readdirSync(touchDir).filter((f) => f.endsWith('.js') && f !== 'i18n.js')) {
    fs.readFileSync(path.join(touchDir, file), 'utf8').split('\n').forEach((line, i) => {
      if (/\.format\(/.test(line) && /innerHTML|insertAdjacentHTML|outerHTML|\.html\(/.test(line)) assert.fail(file + ':' + (i + 1) + ' writes cncI18n.format() as HTML');
    });
  }
  assert.equal(en.format('ETOUCH_RESUME_UNITS_LATE', { units: 'G' + 'x'.repeat(200), line: 3 }, french).match(/\(G(x+)\)/)[1].length, 63, 'values capped');

  // Catalog: four non-empty texts per row, the same values in every language, no duplicate.
  const rows = i18n('en').CNCTouchCodes, codes = new Set();
  rows.forEach((row) => {
    assert.equal(row.length, 4, row[0]); row.forEach((v) => assert(typeof v === 'string' && v.length > 0, row[0]));
    assert.match(row[0], /^ETOUCH_[A-Z0-9_]+$/); assert(!codes.has(row[0]), 'duplicate ' + row[0]); codes.add(row[0]);
    const names = (s) => (s.match(/\{[A-Za-z]+\}|\[|\]/g) || []).sort().join(',');
    assert.equal(names(row[2]), names(row[1]), row[0] + ' EN values'); assert.equal(names(row[3]), names(row[1]), row[0] + ' ES values');
  });
  // Every ETOUCH_* code the committed server emits has its row (a missing row stays French).
  const emitted = new Set();
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== '__tests__') walk(file); } else if (entry.name.endsWith('.js')) {
        for (const m of fs.readFileSync(file, 'utf8').matchAll(/'(ETOUCH_[A-Z0-9_]+)'/g)) emitted.add(m[1]);
      }
    }
  })(path.join(__dirname, '../../src/server'));
  assert(emitted.size >= 14, 'resume codes found in src/server');
  emitted.forEach((code) => assert(codes.has(code), 'no template for ' + code));

  // F2 reasons with codes (codedReasons) are shown translated; without them, the French reasons.
  const w = i18n('en', ['program-check-view.js']), view = w.CNCProgramCheckView;
  const axis = (v) => ({ verdict: v });
  const check = { verdict: 'outside', axes: { X: axis('outside'), Y: axis('validated'), Z: axis('validated') },
    reasons: ['Hors course X : -360 → 10 mm machine (course -400 → 0).'],
    codedReasons: [{ code: 'ETOUCH_CHECK_OUTSIDE', params: { axis: 'X', min: -360, max: 10, low: -400, high: 0 }, message: 'Hors course X : -360 → 10 mm machine (course -400 → 0).' },
      { code: 'ETOUCH_CHECK_SOMETHING_NEW', params: {}, message: 'Raison nouvelle du serveur.' }, 'not an object', { code: 'ETOUCH_CHECK_AXIS_IDLE' }] };
  assert.deepEqual(Array.from(view.describe(check).reasons), ['Outside travel X: -360 → 10 mm machine (travel -400 → 0).', 'Raison nouvelle du serveur.']);
  delete check.codedReasons;
  assert.deepEqual(Array.from(view.describe(check).reasons), ['Hors course X : -360 → 10 mm machine (course -400 → 0).'], 'older servers: unchanged');

  // The job controls show a coded refusal (HTTP 409) in English, an uncoded one as sent.
  const f = load({ language: 'en' }); await f.connect();
  f.window.dispatchEvent({ type: 'cnc-library-select', detail: { file: 'part.nc', name: 'part.nc' } });
  f.el('job-load').click();
  f.answer(f.posts().at(-1), { message: 'Avance inconnue avant la ligne 40 : choisissez une ligne plus loin.', code: 'ETOUCH_RESUME_FEED', params: { from: 40 } }, 409); await f.flush();
  assert.equal(f.el('job-feedback').textContent, 'Feed rate unknown before line 40: choose a later line.');
  assert.equal(f.el('job-feedback').getAttribute('data-state'), 'failed');
  f.el('job-load').click(); f.answer(f.posts().at(-1), { message: 'Machine occupée, cas propre au serveur.' }, 409); await f.flush();
  assert.equal(f.el('job-feedback').textContent, 'Machine occupée, cas propre au serveur.');
  f.el('job-load').click(); f.answer(f.posts().at(-1), {}, 500); await f.flush();
  assert.equal(f.el('job-feedback').textContent, 'Controls unavailable (HTTP 500).');
  // The error keeps its code and values for callers (resume dialog, real moves).
  const c = f.controls();
  const plan = c.resumePlan('part.nc', 40); f.answer(f.posts().at(-1), { message: 'Vitesse de broche inconnue avant la ligne 40 : reprise impossible.', code: 'ETOUCH_RESUME_SPINDLE_SPEED', params: { from: 40 } }, 409);
  const e = await plan.then(() => null, (x) => x);
  assert.equal(e.message, 'Spindle speed unknown before line 40: cannot resume.'); assert.equal(e.code, 'ETOUCH_RESUME_SPINDLE_SPEED'); assert.equal(e.params.from, 40);
  c.dispose();
  console.log('PASS server messages: ' + rows.length + ' coded templates FR/EN/ES, French templates equal to the server, French fallback, plain-text values, every server code covered, F2 coded reasons, job controls.');
})().catch((error) => { console.error(error); process.exit(1); });
