'use strict';
// Preview analysis (touch/preview-inspect.js): filters, segment inspection labels (simplified vs exact,
// never "measured"), the source index, stock and clamps (indicative), and the resume preview
// mapping (preamble then the file from the resume line, bound to the fingerprint).
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const T3 = require('./touch/toolpath-3d.js');
const { scan } = require('./touch/library-preview.js');
const PI = require('./touch/preview-inspect.js');

async function pathOf(code) {
  const first = await scan(code), z = first.zBounds, b = first.bounds;
  const builder = T3.createBuilder({ bounds: [b[0], b[1], z[0], b[2], b[3], z[1]] });
  await scan(code, null, null, null, null, builder.move);
  const encoded = builder.finish(first.lines);
  return { encoded, path: T3.decode(encoded) };
}
function storage() { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), map: m }; }

(async () => {
  // L2 v2: independent segments never join two known islands across G53.
  const islands = PI.buildV2Geometry('G90 G21\nG1 X10 Y0 Z0 F100\nG53 G0 X-100\nG0 X20 Y0 Z0\nG1 X30');
  assert.equal(islands.segmentCount, 2);
  assert.deepEqual(Array.from(islands.buffers.positions), [0,0,0,10,0,0,20,0,0,30,0,0]);
  assert(islands.buffers.sourceLines instanceof Uint32Array);
  assert.deepEqual(Array.from(islands.buffers.sourceLines), [2,5]);
  assert.equal(islands.passes.length, 2, 'unknown motion breaks a pass');
  assert.equal(islands.passes[1].firstSegment, 1);
  const g = PI.buildV2Geometry('G21 G54\nG0 X1\nG1 X2 F100\nG1 Y3\nG0 Z5\nG1 X4');
  assert.equal(g.wcs, 'G54'); assert.equal(g.segmentCount, 5);
  assert.deepEqual(Array.from(g.buffers.passIds), [0,1,1,0,2]);
  assert.deepEqual(g.passes, [{id:1,firstSegment:1,endSegment:3,firstLine:3,lastLine:4},{id:2,firstSegment:4,endSegment:5,firstLine:6,lastLine:6}]);
  assert.equal(PI.buildV2Geometry('G1 X1 F100\nG1 X2\nG1 X3', {cap:2}).buffers, null);
  assert.equal(PI.buildV2Geometry('G20 G1 X1 F10').buffers.positions[3], Math.fround(25.4));
  assert.equal(PI.buildV2Geometry('G54 G1 X1 F100\nG55 G1 X2').wcs, null);
  const lastMove=PI.buildV2Geometry('G21 G54\nG1 X10 F100 M30\nG1 X20');
  assert.equal(lastMove.segmentCount,1,'M30 ends after the motion on its own block');
  assert.equal(lastMove.buffers.positions[3],10);
  assert.equal(PI.buildV2Geometry('G21 G54\nG1 X10 F100\nM98 P100\nG1 X20').quality,'unknown','unsupported subprogram cannot be a complete geometry');
  assert.equal(PI.buildV2Geometry('G21 G54 G91\nG1 X10 F100').quality,'unknown','initial relative motion has no known WCS start');
  assert.equal(PI.buildV2Geometry('G21 G54\nG1 X10 F100 M30\nM98 P1').quality,'full','commands after M30 are not executed');
  assert.equal(PI.buildV2Geometry('G21 G54\nG1 X9999999999999999999999999999999999999999 F100').quality,'unknown','Float32 overflow cannot reach a renderer');
  // Explicit declaration identities; no stock from the merely selected file.
  const identity = {role:'loaded',file:'part.nc',fingerprint:'opaque',key:JSON.stringify(['part.nc','opaque']),jobKey:'job'};
  const declared = PI.declarations(identity, {
    project:{identity,stock:{x:40,y:20,z:5},dimensions:[{axis:'x',valueMm:40}]},
    operator:{identity,clamps:[{x:1,y:2,w:3,d:4,h:5}],dimensions:[{axis:'y',valueMm:20},{axis:'z',valueMm:5}]},
    program:{identity,bounds:[0,0,-1,30,10,0]}
  });
  assert.deepEqual(declared.map(d=>d.source), ['project','project','operator','operator','operator','program']);
  assert.equal(declared.filter(d=>d.kind==='dimension').length,4);
  assert(declared.every(d=>d.units==='mm' && d.identity.key===identity.key && Object.isFrozen(d)));
  assert(declared.find(d=>d.kind==='stock').assumptions.includes('top-z0'));
  assert.equal(PI.declarations(identity,{project:{identity:{...identity,fingerprint:'old',key:'old'},stock:{x:40,y:20,z:5}}}).length,0);
  assert.equal(PI.declarations({...identity,key:null},{operator:{identity,stock:{x:40,y:20}}}).length,0);
  assert.equal(PI.declarations(identity,{operator:{identity,clamps:[null,{x:0,y:0,w:1,d:1,h:Infinity}],dimensions:[{axis:'x',valueMm:NaN}]}}).length,0);
  assert.equal(PI.declarations(identity,{program:{identity,bounds:[10,0,0,0,5,3]}}).length,0,'invalid bounds do not yield partial dimensions');
  const code = ['G21 G90', '(operation: Ebauche)', 'T1 M6', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G1 X40 F600', 'G1 Y20', 'G0 Z5',
    '(operation: Finition)', 'T2 M6', 'G0 X0 Y0', 'G1 Z-3 F100', 'G1 X40 F400 S12000', 'G0 Z5', 'M30'].join('\n');
  const { encoded, path: p } = await pathOf(code);
  const ME = require('./touch/motion-estimate.js'), est = ME.estimate(code), index = { tools: est.tools, operations: est.operations };

  // Filters.
  const all = PI.filterMask(p, {}, index);
  assert.equal(all.shown, all.total, 'no filter: everything');
  const noRapid = PI.filterMask(p, { rapids: false }, index);
  for (let i = 1; i < p.count; i++) if (p.rapid[i]) assert.equal(noRapid.mask[i], 0);
  assert(noRapid.shown < all.shown && noRapid.shown > 0);
  const deep = PI.filterMask(p, { zMin: -5, zMax: -2 }, index);
  for (let i = 1; i < p.count; i++) if (deep.mask[i]) assert(Math.min(p.positions[i * 3 - 1], p.positions[i * 3 + 2]) <= -2, 'depth range');
  assert(deep.shown > 0 && deep.shown < all.shown);
  const lines = PI.filterMask(p, { lineFrom: 6, lineTo: 8 }, index);
  for (let i = 1; i < p.count; i++) assert.equal(lines.mask[i], p.lines[i] >= 6 && p.lines[i] <= 8 ? 1 : 0);
  const tool2 = PI.filterMask(p, { tool: 2 }, index);
  for (let i = 1; i < p.count; i++) if (tool2.mask[i]) assert(p.lines[i] >= 11, 'tool 2 from its T word');
  assert(tool2.shown > 0);
  const op = PI.filterMask(p, { operation: 'Ebauche' }, index);
  for (let i = 1; i < p.count; i++) if (op.mask[i]) assert(p.lines[i] >= 2 && p.lines[i] < 10);
  // Offered only when the program names them.
  assert.deepEqual(PI.offers(index), { tools: [1, 2], operations: ['Ebauche', 'Finition'] });
  assert.deepEqual(PI.offers({ tools: [{ tool: 1, line: 3 }], operations: [] }), { tools: [], operations: [] }, 'one tool: nothing to filter');
  assert.deepEqual(PI.offers(null), { tools: [], operations: [] });

  // Nearest segment on screen.
  const screen = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { screen[i * 2] = p.positions[i * 3] * 10; screen[i * 2 + 1] = p.positions[i * 3 + 1] * 10; }
  const hit = PI.nearestSegment(screen, p.count, null, 200, 3, 24);
  assert(hit && p.positions[hit.index * 3 + 1] === 0 && p.positions[hit.index * 3] === 40, 'the X0→X40 stroke');
  assert.equal(PI.nearestSegment(screen, p.count, null, 2000, 2000, 24), null);
  assert.equal(PI.nearestSegment(screen, p.count, new Uint8Array(p.count), 200, 3, 24), null, 'hidden segments are not picked');

  // Inspection labels: simplified point vs exact values from the source line.
  const simple = PI.describe(p, hit.index, null, encoded);
  assert.equal(simple.find(r => r.label === 'Point du tracé').kind, 'simplified');
  assert.match(simple.find(r => r.label === 'Point du tracé').note, /géométrie simplifiée/);
  assert.equal(simple.find(r => r.label === 'Valeurs exactes').kind, 'unknown');
  const sourceIndex = PI.createSourceIndex(code);
  const state = PI.stateAt(sourceIndex, p.lines[hit.index]);
  assert.equal(state.raw, 'G1 X40 F600'); assert.equal(state.after.x, 40); assert.equal(state.after.feed, 600);
  const exact = PI.describe(p, hit.index, state, encoded);
  assert.equal(exact.find(r => r.label === 'Fin de ligne programmée').kind, 'exact');
  assert.match(exact.find(r => r.label === 'Fin de ligne programmée').note, /valeur exacte de la ligne source/);
  assert.equal(exact.find(r => r.label === 'Texte de la ligne').value, 'G1 X40 F600');
  assert.equal(exact.find(r => r.label === 'Consigne S').kind, 'unknown', 'no S yet at that line');
  const sLine = PI.describe(p, hit.index, PI.stateAt(sourceIndex, 14), encoded);
  assert.match(sLine.find(r => r.label === 'Consigne S').value, /12\s?000/);
  for (const r of exact.concat(simple, sLine)) assert(!/mesur/i.test(r.label + r.value + (r.note || '')), 'never "measured": ' + r.label);
  // After G28 the end of a line is unknown, said so.
  const lost = PI.stateAt(PI.createSourceIndex('G21\nG28\nG91 G1 X5 F100'), 3);
  assert.equal(PI.describe(p, 1, lost, encoded).find(r => r.label === 'Fin de ligne programmée').kind, 'unknown');
  // Checkpoints: a line far in a long file gives the same state as a full pass.
  const long = ['G21 G90 G1 F500'];
  for (let i = 1; i <= 9000; i++) long.push(i % 1000 === 0 ? '' : 'G1 X' + (i % 97) + ' Y' + (i % 31) + (i === 5001 ? ' F777' : ''));
  const li = PI.createSourceIndex(long.join('\n'));
  assert(li.checkpoints.length >= 4);
  const far = PI.stateAt(li, 8000);
  const full = ME.createInterpreter(null, null); full.text(long.slice(0, 8008).join('\n'));
  assert.equal(far.after.line, 8000); assert.equal(far.after.x, full.state().x); assert.equal(far.after.y, full.state().y); assert.equal(far.after.feed, 777);
  assert.equal(PI.stateAt(li, 999999), null);

  // Stock and clamps: indicative, the assumption written out.
  const st = storage();
  assert.equal(PI.saveClamps('sha256:ABC', [{ x: '10', y: '5', w: '20', d: '10', h: '15' }, { x: 1, y: 1, w: -1, d: 1, h: 1 }], st), true);
  assert.deepEqual(PI.loadClamps('abc', st), [{ x: 10, y: 5, w: 20, d: 10, h: 15 }], 'invalid clamp dropped, fingerprint normalised');
  assert.deepEqual(PI.loadClamps('other', st), []);
  st.map.set('cncjs-touch-clamps-v1', '{bad'); assert.deepEqual(PI.loadClamps('abc', st), []);
  const boxes = PI.overlayBoxes({ x: 30, y: 20, z: 5 }, [{ x: 10, y: 5, w: 20, d: 10, h: 15 }], p.bounds);
  assert.equal(boxes.boxes.length, 2); assert.deepEqual(boxes.boxes[0].min, [0, 0, -5]);
  assert(boxes.notes.some(n => /aucune garantie anticollision/.test(n)));
  assert(boxes.notes.some(n => /position supposée/.test(n)));
  assert(boxes.notes.some(n => /sort du brut supposé/.test(n)), 'X40 is outside a 30 mm stock');
  assert.deepEqual(PI.overlayBoxes(null, [], p.bounds), { boxes: [], notes: [] });

  // Resume preview: preamble, then the file from fromLine; fingerprint bound.
  const fp = 'sha256:0123abcd';
  const preview = { version: 1, fingerprint: fp, fromLine: 13, preamble: ['G21', 'G90', 'G0 Z10', 'G0 X0 Y0', 'M3 S12000', 'G4 P3', 'G1 Z5 F100'], kind: 'cnc' };
  let plan = PI.resumePlan(preview, { fingerprint: '0123ABCD', path: encoded });
  assert.equal(plan.available, true);
  assert.equal(plan.preamble.length, 1, 'from the unknown tool position, moves start being drawn once X, Y and Z are known: only the plunge');
  assert.deepEqual(plan.firstKnown, [0, 0, 10]); assert.deepEqual(plan.preambleEnd, [0, 0, 5], 'the position before line 13');
  for (let i = plan.start; i < p.count; i++) assert(p.lines[i] >= 13);
  assert(p.lines[plan.start - 1] < 13 || plan.start === 1);
  assert.deepEqual(plan.discontinuities, [], 'preamble ends where the file resumes');
  // Mismatched fingerprint, missing preview, old sidecar without path: unavailable, with a reason.
  assert.deepEqual(PI.resumePlan(preview, { fingerprint: 'sha256:ffff', path: encoded }), { available: false, reason: 'fingerprint' });
  assert.equal(PI.resumePlan(null, { fingerprint: fp, path: encoded }).reason, 'no-preview');
  assert.equal(PI.resumePlan({ version: 1, fingerprint: fp, fromLine: 3 }, { fingerprint: fp, path: encoded }).reason, 'no-preview', 'no preamble array');
  assert.equal(PI.resumePlan(preview, { fingerprint: fp, path: null }).reason, 'no-path');
  assert.equal(PI.resumePlan(Object.assign({}, preview, { fromLine: 99 }), { fingerprint: fp, path: encoded }).reason, 'line');
  assert.match(PI.reasonText('fingerprint'), /empreinte différente/);
  // A preamble ending elsewhere: discontinuity; one ending on an unknown axis: said so.
  plan = PI.resumePlan(Object.assign({}, preview, { preamble: ['G90', 'G0 X30 Y15 Z5', 'G1 Z-3 F100'] }), { fingerprint: fp, path: encoded });
  assert.equal(plan.discontinuities[0].kind, 'junction'); assert(plan.discontinuities[0].distance > 30);
  plan = PI.resumePlan(Object.assign({}, preview, { preamble: ['G90', 'G0 X0 Y0'] }), { fingerprint: fp, path: encoded });
  assert.deepEqual(plan.discontinuities, [{ kind: 'unknown-end' }]); assert.equal(plan.preamble.length, 0);
  plan = PI.resumePlan(Object.assign({}, preview, { preamble: ['G28', 'G0 X0 Y0 Z5'] }), { fingerprint: fp, path: encoded });
  assert.equal(plan.notes[0].kind, 'home');
  // The preview never changes what is sent: the preamble array is untouched.
  assert.deepEqual(preview.preamble, ['G21', 'G90', 'G0 Z10', 'G0 X0 Y0', 'M3 S12000', 'G4 P3', 'G1 Z5 F100']);

  // show(): in a page, unavailable or drawn with its legend.
  function element(tag) {
    let text = '';
    const node = { tagName: tag, children: [], attributes: {}, className: '', parentNode: null,
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; }, removeChild(c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; },
      setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return this.attributes[k]; },
      querySelector(sel) { const cls = sel.slice(1); const find = n => n.children.find(c => c.className === cls) || n.children.map(find).find(Boolean); return find(this) || null; },
      getContext: tag === 'canvas' ? () => new Proxy({}, { get: (o, k) => k in o ? o[k] : () => {}, set: (o, k, v) => { o[k] = v; return true; } }) : undefined };
    // As in a page: writing textContent replaces the children.
    Object.defineProperty(node, 'textContent', { get: () => text, set: v => { text = String(v); node.children.forEach(c => { c.parentNode = null; }); node.children = []; } });
    return node;
  }
  const img = element('img'); img.cncPreview = { file: 'a.nc', fingerprint: fp, path3d: encoded };
  const window = { document: { createElement: element, getElementById: id => id === 'home-job-image' ? img : null }, localStorage: storage(),
    cncI18n: { t: s => s, locale: 'fr-FR' }, CNCToolpath3D: T3, CNCMotionEstimate: ME };
  window.self = window; vm.createContext(window);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'touch', 'preview-inspect.js'), 'utf8'), window);
  assert.equal(typeof window.cncResumePreview.show, 'function', 'hook for the resume panel');
  const box = element('div');
  let shown = window.cncResumePreview.show(box, preview);
  assert.equal(shown.available, true); assert.equal(box.children[0].attributes['data-state'], 'ready');
  assert.match(box.children[0].children[1].textContent, /préambule envoyé par le serveur \(7 lignes\)/);
  assert.match(box.children[0].children[1].textContent, /Géométrie simplifiée, indicative/);
  shown = window.cncResumePreview.show(box, Object.assign({}, preview, { fingerprint: 'sha256:9999' }));
  assert.equal(shown.available, false); assert.equal(box.children.length, 1, 'one box, reused');
  assert.equal(box.children[0].attributes['data-state'], 'unavailable'); assert.match(box.children[0].children[0].textContent, /le fichier a changé/);
  shown = window.cncResumePreview.show(box, undefined);
  assert.match(box.children[0].children[0].textContent, /pas fourni de préambule/);
  window.cncResumePreview.hide(box); assert.equal(box.children.length, 0);
  console.log('PASS preview inspect: filters (rapids, depth, lines, tools/operations only when named), picking, simplified vs exact labels, source index checkpoints, clamps and stock (indicative), resume preview mapping with fingerprint check, discontinuities, unknown preamble start and page hook.');
})().catch(e => { console.error(e); process.exit(1); });
