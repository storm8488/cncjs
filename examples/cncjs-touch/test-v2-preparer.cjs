'use strict';
// Performance v2 · Préparer (L5, REFLEXION.md propositions 5–6, §5 « Préparer »): the presenter of
// job-preparation.js over L2's placement model. Comparison Les deux / Actuelle / Hypothèse through
// CNCOriginPreview.comparison (same scene), XY offsets only when computable, Z unchanged, travel
// verdict as qualified as L2 gives it, at most four dimensions with their source, « Déplacer
// l'outil… » opening the jog zone and back, « suspendu » in Run/Hold/Alarm/unknown with the card kept,
// DOM writes only in animation frames, and nothing commanded. Outside perf-v2 nothing changes.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm');
const { preparerPage, idle } = require('./test-v2-preparer-fixture.cjs');
const P = require('./touch/job-preparation.js');
const identity = { version: 1, role: 'loaded', file: 'a.nc', fingerprint: 'sha256:aa', controller: 'A', generation: 'g1', revision: 3,
  key: JSON.stringify(['a.nc', 'sha256:aa']), jobKey: JSON.stringify(['A', 'g1', 3, JSON.stringify(['a.nc', 'sha256:aa'])]) };
const placed = (travel, extra = {}) => Object.assign({ version: 1, available: true, identity, current: { wcs: 'G54', offsetMm: { x: -118, y: -62, z: -10 } },
  hypothesis: { axes: ['x', 'y'], deltaMm: { x: 18, y: 12 }, zUnchanged: true },
  travel: Object.assign({ verdict: 'unknown', source: 'CNCTravelCheck.place', marginsMm: null, zVerified: false, collisionsVerified: false }, travel), declarations: [] }, extra);
const meta = { file: 'a.nc', fingerprint: 'sha256:aa', projection: { units: 'mm', bounds: [0, 0, 228, 148] }, zBounds: [-18, 5] };
(async () => {
  // ---- Outside perf-v2: the v1 page is unchanged (no frame, no DOM, no catalogue, no attribute). ----
  {
    const p = preparerPage({ v2: false, contract: false }); p.status(idle()); await p.flush(); p.resolveLoads(); await p.flush();
    assert.equal(p.calls.mount.length, 1, 'v1 visual origin still mounts');
    p.status(idle()); p.emit('cnc-v2-data', { slot: 'placement' });
    assert.equal(p.frames.length, 0, 'no animation frame requested by the v2 presenter on a v1 page');
    assert.equal(p.content.children.length, 0); assert(p.content.hidden); assert.equal(p.calls.catalogues.length, 0);
    assert.equal(p.node('screen-jog').getAttribute('data-pv2'), null);
    // A v2-capable contract without the v2 layout (preference off, RT, Eco): same.
    const q = preparerPage({ v2: false }); q.status(idle()); await q.flush(); q.resolveLoads(); await q.flush();
    assert.equal(q.content.children.length, 0); assert.equal(q.calls.catalogues.length, 0); assert.equal(q.calls.reads, 0);
    // Simulation page: mounts.prepare.origin is null, nothing is built.
    const s = preparerPage({ simulation: true }); s.status(idle()); await s.flush(); s.resolveLoads(); await s.flush();
    assert.equal(s.content.children.length, 0, 'no visual origin presenter on the simulation page');
  }
  // ---- v2: built once in a frame, comparison without a command. ----
  const p = preparerPage({ preview: meta });
  p.window.CNCProjects = { declared: file => file === 'a.nc' ? { file, fingerprint: 'sha256:aa', version: 'current', material: 'MDF', tool: 'Fraise 6', stock: { x: 240, y: 160, z: 18 } } : null };
  p.status(idle()); await p.flush(); p.resolveLoads(); await p.tick?.(); await p.flush();
  assert.equal(p.calls.mount.length, 1); assert(!p.content.hidden, 'presenter shown in its mount');
  assert.deepEqual(p.calls.catalogues.map(c => c[0]), ['performance-v2-preparer'], 'own FR/EN/ES lines registered once, only in v2');
  assert.equal(p.node('screen-jog').getAttribute('data-pv2'), 'compare');
  const mode = m => p.find('pv2-mode-' + m);
  assert.equal(mode('both').getAttribute('aria-pressed'), 'true');
  mode('current').click(); assert.deepEqual(p.calls.comparison, ['current']);
  assert.equal(mode('current').getAttribute('aria-pressed'), 'false', 'no DOM write in the click handler');
  p.frame(); assert.equal(mode('current').getAttribute('aria-pressed'), 'true'); assert.equal(mode('both').getAttribute('aria-pressed'), 'false');
  mode('hypothesis').click(); p.frame(); assert.equal(mode('hypothesis').getAttribute('aria-pressed'), 'true');
  mode('both').click(); p.frame();
  // Unknown placement: dashes, never zeros; unknown travel stays a warning.
  assert.equal(p.find('pv2-offset-x').textContent, '—'); assert.equal(p.find('pv2-offset-y').textContent, '—');
  assert.equal(p.find('pv2-travel').getAttribute('data-tone'), 'warn'); assert.match(p.find('pv2-travel').children[0].textContent, /non vérifiée/);
  assert.equal(p.find('pv2-state').textContent, 'Inconnu');
  // Available, travel unknown ($23 missing): offsets shown, still no green.
  p.v2.placement = placed({}); p.emit('cnc-v2-data', { slot: 'placement' }); p.frame(); await p.flush();
  assert.equal(p.find('pv2-offset-x').textContent, '+18,000 mm'); assert.equal(p.find('pv2-offset-y').textContent, '+12,000 mm');
  assert.equal(p.find('pv2-state').textContent, 'À confirmer');
  assert.equal(p.find('pv2-travel').getAttribute('data-tone'), 'warn', 'an unknown verdict is never upgraded');
  // Declarations supplied once per loaded job: project stock bound to the fingerprint and program extents.
  assert.equal(p.calls.updates.length, 1, 'declarations supplied to L2 once');
  const sent = p.calls.updates[0];
  assert.equal(sent.preview, meta); assert.equal(sent.machine.name, 'a.nc');
  assert.deepEqual([...sent.declarations].map(d => d.kind + ':' + d.source + ':' + (d.value.axis || '') + ':' + (d.value.valueMm ?? d.value.x)), ['stock:project::240', 'dimension:program:x:228', 'dimension:program:y:148', 'dimension:program:z:23']);
  p.emit('cnc-v2-data', { slot: 'placement' }); await p.flush(); assert.equal(p.calls.updates.length, 1, 'no update loop on the next placement notification');
  // Inside: qualified (tablet estimate, Z and collisions not verified) with margins.
  p.v2.placement = placed({ verdict: 'inside', marginsMm: { x: { min: 50, max: 290 }, y: { min: 50, max: 180.25 } } }, { declarations: [
    { kind: 'stock', source: 'project', identity, value: { x: 240, y: 160, z: 18 }, units: 'mm', assumptions: [] },
    ...['x', 'y', 'z', 'x'].map((axis, i) => ({ kind: 'dimension', source: i === 3 ? 'operator' : 'program', identity, value: { axis, valueMm: 100 + i }, units: 'mm', assumptions: [] }))] });
  p.emit('cnc-v2-data', { slot: 'placement' }); await p.flush();
  const travel = p.find('pv2-travel');
  assert.equal(travel.getAttribute('data-tone'), 'ok'); assert.match(travel.children[1].textContent, /Estimation de la tablette.*Z et collisions non vérifiés/);
  assert.equal(travel.children[2].textContent, 'Marges · X 50,0 / 290,0 mm · Y 50,0 / 180,3 mm');
  const cotes = p.find('pv2-cotes').children;
  assert.equal(cotes.length, 4, 'at most four dimensions');
  assert.deepEqual(cotes.map(li => li.children.map(c => c.textContent).join(' | ')), ['Brut déclaré | 240,0 × 160,0 × 18,0 mm | fiche projet, pas une mesure',
    'Étendue X | 100,0 mm | programme, valeur nominale', 'Étendue Y | 101,0 mm | programme, valeur nominale', 'Profondeur Z | 102,0 mm | programme, valeur nominale']);
  p.find('pv2-cotes-toggle').click(); p.frame();
  assert.equal(p.find('pv2-cotes').getAttribute('data-visible'), 'false'); assert.equal(p.find('pv2-cotes-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(p.find('pv2-cotes').children.length, 4, 'hidden by style only: the scene keeps its rectangle');
  p.find('pv2-cotes-toggle').click(); p.frame();
  // Outside: danger, its margins, still qualified.
  p.v2.placement = placed({ verdict: 'outside', marginsMm: { x: { min: -12, max: 4 }, y: { min: 3, max: 9 } } });
  p.emit('cnc-v2-data', { slot: 'placement' }); await p.flush();
  assert.equal(p.find('pv2-travel').getAttribute('data-tone'), 'danger'); assert.match(p.find('pv2-travel').children[2].textContent, /X −12,0 \/ 4,0 mm/);
  // ---- Jog zone: opened and closed by the operator only, focus moved, never switched automatically. ----
  p.find('pv2-jog-open').click(); p.frame();
  assert.equal(p.node('screen-jog').getAttribute('data-pv2'), 'jog'); assert(p.find('pv2-summary').hidden); assert(!p.find('pv2-jog-head').hidden);
  assert.equal(p.document.activeElement, p.find('pv2-jog-close'));
  p.status(idle({ workflow: 'running', activeState: 'Run' })); p.v2.safeIdle = false; await p.flush();
  assert.equal(p.node('screen-jog').getAttribute('data-pv2'), 'jog', 'a job never switches the layout');
  p.find('pv2-jog-close').click(); p.frame();
  assert.equal(p.node('screen-jog').getAttribute('data-pv2'), 'compare'); assert.equal(p.document.activeElement, p.find('pv2-jog-open'));
  // ---- Run / Hold / Alarm / unknown: « suspendu », the card and the presenter keep their place. ----
  for (const [m, text] of [[idle({ workflow: 'running', activeState: 'Run' }), /travail en cours/], [idle({ workflow: 'paused', activeState: 'Hold:0' }), /en pause/],
    [idle({ activeState: 'Alarm' }), /alarme/], [idle({ fresh: false }), /indisponible/], [null, /indisponible/]]) {
    p.status(m); await p.flush();
    assert.equal(p.find('pv2-state').textContent, 'Suspendu'); assert.match(p.find('pv2-travel').children[1].textContent, text);
    assert.equal(p.find('pv2-offset-x').textContent, '—', 'no offset while suspended');
    assert(!p.content.hidden); assert.equal(p.calls.unmount, 0); assert.equal(p.card.parentNode, p.node('screen-jog'));
  }
  // Eco chosen during the job: the held v2 layout keeps the card (origin-preview stops drawing itself).
  p.window.cncProfile.performance = () => 'eco'; p.v2.gate = false; p.emit('cnc-profile-change'); p.emit('cnc-v2-change'); await p.flush();
  assert.equal(p.calls.unmount, 0, 'the card keeps its rectangle while the layout is held');
  // Back to a known Idle: the hold ends, the old layout returns and the card goes away.
  p.v2.safeIdle = true; p.status(idle()); p.emit('cnc-v2-change'); await p.flush();
  assert.equal(p.calls.unmount, 1); assert(p.content.hidden); assert.equal(p.node('screen-jog').getAttribute('data-pv2'), null);
  // The v2 layout ends at Idle while the v1 card stays (loss of eligibility): data-pv2 goes, so no v2 rule applies.
  {
    const q = preparerPage(); q.status(idle()); await q.flush(); q.resolveLoads(); await q.flush();
    assert.equal(q.node('screen-jog').getAttribute('data-pv2'), 'compare');
    q.v2.layout = false; q.v2.gate = false; q.emit('cnc-v2-change'); await q.flush();
    assert.equal(q.node('screen-jog').getAttribute('data-pv2'), null); assert(q.content.hidden);
  }
  // The v2 layout arrives (safe Idle bootstrap) while the card is already mounted: the presenter starts then.
  {
    const q = preparerPage({ v2: false }); q.status(idle()); await q.flush(); q.resolveLoads(); await q.flush();
    assert.equal(q.calls.mount.length, 1); assert(q.content.hidden);
    q.v2.layout = true; q.emit('cnc-v2-change'); await q.flush();
    assert(!q.content.hidden); assert.equal(q.node('screen-jog').getAttribute('data-pv2'), 'compare'); assert.equal(q.calls.mount.length, 1, 'not mounted twice');
  }
  // ---- No command, no gesture on the scene. ----
  assert.equal(Object.keys(p.card.handlers).length, 0, 'no listener put on the scene');
  const source = fs.readFileSync(__dirname + '/touch/job-preparation.js', 'utf8');
  assert(!/cncJobControls|XMLHttpRequest|fetch\(|\.click\(\)(?![^\n]*job-load)/.test(source.replace("if (b && !b.disabled) b.click();", '')), 'the presenter never commands nor clicks a control');
  // ---- Declarations: a preview of another version is never passed (L2 would reset the placement). ----
  {
    const q = preparerPage({ preview: { ...meta, fingerprint: 'sha256:other' } });
    q.status(idle()); await q.flush(); q.resolveLoads(); await q.flush();
    q.v2.placement = placed({}); q.emit('cnc-v2-data', { slot: 'placement' }); await q.flush();
    assert.equal(q.calls.updates.length, 0); assert.equal(q.calls.reads, 1, 'one cached read of the loaded preview, not repeated');
    q.emit('cnc-v2-data', { slot: 'placement' }); await q.flush(); assert.equal(q.calls.reads, 1);
  }
  // ---- Catalogue: registers with the real i18n over every static and v2 catalogue, in three languages. ----
  for (const language of ['fr', 'en', 'es']) {
    const context = { window: {}, document: { documentElement: {}, title: '', body: null }, localStorage: { getItem: k => k === 'cncjs-touch-language-v1' ? language : null, setItem() {} } };
    context.window.localStorage = context.localStorage; context.window.document = context.document;
    vm.createContext(context);
    for (const f of fs.readdirSync(__dirname + '/touch').filter(f => /^i18n-messages(-[a-z]+)?\.js$/.test(f) && f !== 'i18n-messages-v2.js')) vm.runInContext(fs.readFileSync(__dirname + '/touch/' + f, 'utf8'), context);
    vm.runInContext(fs.readFileSync(__dirname + '/touch/i18n.js', 'utf8'), context);
    const i = context.window.cncI18n;
    assert.equal(i.registerCatalog('performance-v2', JSON.parse(fs.readFileSync(__dirname + '/touch/i18n-messages-v2.js', 'utf8'))), true);
    assert.equal(i.registerCatalog('performance-v2-preparer', P.v2Messages), true, 'no conflicting row');
    assert.equal(i.t('Déplacer l’outil…'), { fr: 'Déplacer l’outil…', en: 'Move the tool…', es: 'Mover la herramienta…' }[language]);
  }
  // ---- Style: scoped under body.perf-v2 and body.perf-origin; 96 px jog targets; 24 px from the scene. ----
  {
    const css = fs.readFileSync(__dirname + '/touch/origin-preview.css', 'utf8'), at = css.indexOf('/* Performance v2'), v2css = css.slice(at);
    const rules = v2css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map(r => r.split('{')).filter(r => r[0].trim());
    assert(rules.length > 20);
    // L2's own test requires « body.perf-origin » first; the v2 scope is #screen-jog[data-pv2], set only by the v2 presenter.
    for (const [sel] of rules) for (const s of sel.split(',')) assert(/^body\.perf-origin #screen-jog(\.screen)?\[data-pv2(="(jog|compare)")?\]/.test(s.trim()), 'unscoped v2 rule: ' + s);
    assert(!/data-pv2|pv2-/.test(css.slice(0, at)), 'v1 rules untouched');
    const grid = rules.find(([s]) => /\[data-pv2\]\.active/.test(s))[1];
    assert.match(grid, /column-gap:24px/, 'scene and jog are separated by at least 24 px');
    assert.match(rules.find(([s]) => /\[data-pv2="jog"\] \.ks-motion-arrows \.jog/.test(s))[1], /min-width:var\(--tap-jog\);min-height:var\(--tap-jog\)/);
    assert.equal(fs.readFileSync(__dirname + '/touch/design-tokens.css', 'utf8').match(/--tap-jog:(\d+)px/)[1], '96');
    // Same scene cell in both modes: the jog zone never takes the scene's area.
    assert(rules.filter(([s]) => /grid-template-areas/.test(rules.find(r => r[0] === s)[1])).every(([, b]) => /"origin jog"|"origin side"/.test(b)));
  }
  console.log('PASS v2 préparer: comparison through the same scene, offsets only when computable, Z unchanged, qualified travel, four sourced dimensions, jog zone by the operator only, suspended states keep the card, frames only, no command; v1 and simulation unchanged.');
})().catch(e => { console.error(e); process.exitCode = 1; });
