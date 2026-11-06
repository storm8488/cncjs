'use strict';
// D2 (L7, round 2): at 1366 × 911 the v2 Préparer right column was crushed by the v1 coordinates card
// (« Déplacer l'outil… » behind a scroll, jog cross clipped). Composition of the mockup
// performance-v2-preparer.html: steps 1–3 and « Déplacer l'outil… » in the right column, « Poser X Y
// ici… » relayed to the existing « Déplacement réel » entry (X = 0 / Y = 0 keep their own ticket and
// confirmation), « Contrôle final… » opening the guided preparation sheet. Then a budget computed from
// the CSS (rows, tokens, documented content heights at normal text) at 1366 × 911 and 1728 × 1152; the
// browser harness measures the real rectangles.
const assert = require('assert').strict, fs = require('fs');
const { preparerPage, idle } = require('./test-v2-preparer-fixture.cjs');
const identity = { version: 1, role: 'loaded', file: 'a.nc', fingerprint: 'sha256:aa', controller: 'A', generation: 'g1', revision: 3, key: 'k', jobKey: 'j' };
const placed = { version: 1, available: true, identity, current: { wcs: 'G54', offsetMm: { x: 0, y: 0, z: 0 } }, hypothesis: { axes: ['x', 'y'], deltaMm: { x: 18, y: 12 }, zUnchanged: true },
  travel: { verdict: 'unknown', source: 'CNCTravelCheck.place', marginsMm: null, zVerified: false, collisionsVerified: false }, declarations: [] };
(async () => {
  // ---- Composition and relays. ----
  const q = preparerPage(); q.status(idle()); await q.flush(); q.resolveLoads(); await q.flush();
  const ids = ['pv2-summary', 'pv2-state', 'pv2-offset-x', 'pv2-offset-y', 'pv2-set-xy', 'pv2-travel', 'pv2-final-open', 'pv2-jog-open', 'pv2-tool-speed', 'pv2-tool-coordinates'];
  ids.forEach(id => assert(q.find(id), 'missing ' + id));
  const summary = q.find('pv2-summary'), order = summary.querySelectorAll('*').filter(e => e.id && ids.includes(e.id)).map(e => e.id);
  assert.deepEqual(order, ['pv2-state', 'pv2-offset-x', 'pv2-offset-y', 'pv2-set-xy', 'pv2-travel', 'pv2-final-open', 'pv2-jog-open', 'pv2-tool-speed', 'pv2-tool-coordinates'], 'mockup order: step 2, travel, step 3, Déplacer l’outil…');
  assert(summary.querySelectorAll('*').some(e => e.textContent === '3 · Origine Z et contrôle final'));
  // « Poser X Y ici… »: disabled while « Déplacement réel » is not shown, or without an XY hypothesis.
  const entry = q.node('real-motion-open'); entry.hidden = true; let entries = 0; entry.addEventListener('click', () => entries++);
  q.v2.placement = placed; q.emit('cnc-v2-data', { slot: 'placement' }); await q.flush();
  const set = q.find('pv2-set-xy');
  assert(set.disabled); assert.match(set.getAttribute('title'), /indisponible/);
  set.handlers.click(); assert.equal(entries, 0);
  entry.hidden = false; q.emit('cnc-v2-data', { slot: 'placement' }); await q.flush();
  assert(!set.disabled); assert.match(set.getAttribute('title'), /X = 0 puis Y = 0, chacun avec sa confirmation/);
  set.click(); assert.equal(entries, 1, 'relayed to the existing entry once');
  assert.equal(q.calls.updates.length, 0, 'no placement or command from the relay');
  q.status(idle({ workflow: 'running', activeState: 'Run' })); q.v2.safeIdle = false; await q.flush();
  assert(set.disabled, 'not during a job'); set.handlers.click(); assert.equal(entries, 1);
  q.v2.safeIdle = true; q.status(idle()); await q.flush();
  q.v2.placement = null; q.emit('cnc-v2-data', { slot: 'placement' }); await q.flush(); assert(set.disabled, 'no hypothesis, no relay');
  // Tools: relayed to the coordinates card's existing buttons.
  let speed = 0, coords = 0; q.node('ks-jog-settings').addEventListener('click', () => speed++); q.node('coordinate-open').addEventListener('click', () => coords++);
  q.find('pv2-tool-speed').click(); q.find('pv2-tool-coordinates').click(); assert.deepEqual([speed, coords], [1, 1]);
  q.node('coordinate-open').disabled = true; q.emit('cnc-v2-data', { slot: 'placement' }); await q.flush();
  assert(q.find('pv2-tool-coordinates').disabled);
  // Step 3 opens the guided preparation sheet (nothing sent).
  q.find('pv2-final-open').click(); assert.deepEqual(q.calls.sheets, ['ks-preparation']); assert.equal(q.calls.updates.length, 0);

  // ---- Budget from the CSS. ----
  const css = fs.readFileSync(__dirname + '/touch/origin-preview.css', 'utf8'), tokens = fs.readFileSync(__dirname + '/touch/design-tokens.css', 'utf8');
  const token = n => Number(tokens.match(new RegExp('--' + n + ':(\\d+)px'))[1]);
  const T = { statusbar: token('statusbar-h'), tap: token('tap'), primary: token('tap-primary'), jog: token('tap-jog'), gap: token('tap-gap'), sp1: token('sp-1'), sp2: token('sp-2'), sp3: token('sp-3'), sp4: token('sp-4'), sp6: token('sp-6'),
    fs16: token('fs-16'), fs18: token('fs-18'), fs20: token('fs-20'), fs24: token('fs-24') };
  const grid = css.match(/#screen-jog\.screen\[data-pv2\]\.active,[^{]*\{([^}]*)\}/)[1];
  assert.match(grid, /grid-template-rows:auto 48px minmax\(0,1fr\) auto 104px/);
  assert.match(grid, /column-gap:24px/); assert.match(grid, /row-gap:var\(--sp-3\)/);
  assert.match(grid, /"intro intro" "bar side" "origin side" "origin side" "cotes side"/, 'compare: the summary has the whole right column');
  const jogAreas = css.match(/\[data-pv2="jog"\]\.active,[^{]*\{([^}]*)\}/)[1];
  assert.match(jogAreas, /"intro intro" "bar jhead" "origin jog" "origin coords" "cotes coords"/);
  // Same rows in both modes and the scene in rows 3–4 of both: the scene keeps its rectangle.
  assert(!/grid-template-rows/.test(jogAreas));
  assert.match(css, /\[data-pv2="compare"\] \.ks-motion-arrows,[^{]*\[data-pv2="compare"\] \.ks-motion-coordinates\{display:none\}/, 'no coordinates card beside the comparison');
  const line = (fs, lh = 1.3) => Math.ceil(fs * lh);
  // Content heights at normal text (estimates from the CSS; the harness measures them).
  const card = { pad: 2 * T.sp3, border: 2 };
  const program = 2 * T.sp2 + card.border + line(T.fs16, 1) + T.sp1 + line(T.fs20, 1.2);
  const origin = 2 * T.sp3 + card.border + line(T.fs20, 1.2) + line(T.fs16, 1.35) + (2 * T.sp2 + line(T.fs16) + 2 + line(T.fs24, 1.1)) + line(T.fs16, 1.35) + T.sp1 + T.primary + 5 * T.sp1;
  const travel = 2 * T.sp2 + line(T.fs18, 1.2) + 2 * line(T.fs16) + line(T.fs16) + 3 * 2;
  const final = 2 * T.sp2 + card.border + Math.max(T.tap, line(T.fs18, 1.2) + 2 + line(T.fs16, 1.35));
  const summary2 = program + origin + travel + final + T.primary + T.tap + 5 * T.sp2;
  const arrows = 3 * T.jog + 2 * T.gap + 2 * T.sp2 + 2;
  const coordinates = card.pad + 22 + 3 * 48 + T.sp2 + T.tap + T.sp2 + 2 * line(T.fs16) + card.border;
  for (const [width, height] of [[1366, 911], [1728, 1152]]) {
    const screen = height - T.statusbar - 32, intro = T.tap + T.sp3 + 1, content = screen - intro - T.sp3;
    const column = Math.min(520, Math.max(440, Math.floor(width * 0.34)));
    assert(summary2 <= content, `${width} × ${height}: steps, offsets, travel and « Déplacer l’outil… » fit without scrolling (${summary2} ≤ ${content})`);
    // Jog: rows r2 = 48, r5 = 104, coordinates over r4 + r5, the cross in the 1fr row r3.
    const r4 = Math.max(0, coordinates - 104 - T.sp3), r3 = content - 48 - r4 - 104 - 3 * T.sp3;
    assert(r3 >= arrows, `${width} × ${height}: the whole cross and Z (${arrows} px) in the jog row (${r3} px)`);
    assert(3 * T.jog + 2 * T.gap + T.sp6 + T.jog + 2 * T.sp3 + 2 <= column, `${width}: cross + Z fit the column width`);
    const scene = content - 48 - 104 - 3 * T.sp3;
    assert(scene >= 400, `${width} × ${height}: scene keeps ${scene} px in both modes`);
  }
  assert(24 + T.sp3 >= 24, 'camera to the nearest jog target: 24 px gap + the card padding');
  assert.match(css, /\[data-pv2="jog"\] \.ks-motion-arrows \.jog\{min-width:var\(--tap-jog\);min-height:var\(--tap-jog\)\}/);
  console.log('PASS v2 préparer layout: mockup steps 1–3 with « Poser X Y ici… » relayed to « Déplacement réel » at Idle only, « Contrôle final… », tools relayed; CSS budget at 1366 × 911 and 1728 × 1152 keeps the summary and the whole jog cross visible, scene constant.');
})().catch(e => { console.error(e); process.exitCode = 1; });
