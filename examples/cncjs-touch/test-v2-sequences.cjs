'use strict';
const assert = require('assert').strict;
const ME = require('./touch/motion-estimate.js');

assert.equal(typeof ME.createSequenceCollector, 'function', 'worker sequence collector exists');
const program = '(operation: Poche)\nT2\nM6\nG21 G90 G54\nG0 Z5\nG1 Z-1 F120\nG1 X10 F600\nG0 Z5\n\n(operation: Contour)\nG1 X20\nM0\nM1\nT3\nM6\nG1 X30\nM30';
const result = ME.sequences(program), items = result.items;
assert.equal(result.complete, true);
assert.deepEqual(result.ambiguous, []);
assert.deepEqual(items.map(i => i.kind), ['tool','rapid','group','rapid','group','pause','pause','tool','group']);
assert.equal(items[0].label, 'Changement d’outil T2');
assert.equal(items[0].firstLine, 3, 'T on preceding line is remembered for M6');
assert.equal(items[2].label, 'Poche'); assert.equal(items[2].provenance, 'declared');
assert.equal(items[2].firstLine, 6); assert.equal(items[2].lastLine, 7);
assert.equal(items[4].label, 'Contour'); assert.equal(items[4].firstLine, 10, 'blank source lines do not shift sender numbering');
assert.equal(items[5].label, 'Pause M0'); assert.equal(items[5].durationSeconds, null);
assert.equal(items[6].label, 'Pause optionnelle M1'); assert.equal(items[6].durationSeconds, null);
assert(items.every(i => i.estimated === true && i.durationSeconds === null));
assert.equal(ME.sequences('G1 X1 F100\nG1 X2\nG0 Z1\nG1 X3').items[0].label, 'Séquence 1');
assert.equal(ME.sequences('G1 X1 F100\nG1 X2\nG0 Z1\nG1 X3').items[2].label, 'Séquence 2');
assert.equal(ME.sequences('(Tool: T7)\nM6\nG1 X1 F100').items[0].label, 'Changement d’outil T7');
assert.equal(ME.sequences('T1\nM6\nT2\nG1 X1 F100').items.filter(i => i.kind === 'tool').length, 1, 'T alone is not a tool change');

for (const code of ['G53 G0 X0', 'G28', 'G38.2 Z-1', 'G92 X0', 'G55', 'G43.1 Z1', 'M98 P1', 'G1 X[#1]', 'G2 X4 Y2 R0']) {
  const r = ME.sequences('G54\nG1 X1 F100\n' + code + '\nG1 X2');
  assert(r.ambiguous.some(a => a.firstLine <= 3 && a.lastLine >= 4), code + ' never supplies a confident current sequence');
}
const afterEnd = ME.sequences('G1 X1 F100\nM30\nG1 X2');
assert.equal(afterEnd.items.length, 1, 'nothing after program end is promised');
assert.equal(ME.sequences('G21 G54\nG1 X10 F100 M30').items[0].firstLine, 2, 'motion in the end block still precedes program end');
const zeroRapid = ME.sequences('G21 G54\nG1 X10 F100\nG0 X10\nG1 Y10');
assert.equal(zeroRapid.items.filter(i => i.kind === 'group').length,2,'a zero-length rapid still separates visual groups');
const conflictingTool = ME.sequences('T2\n(Tool: T7)\nM6');
assert.equal(conflictingTool.items[0].label,'Changement d’outil T2','comment never overwrites an actual T selection');
assert(conflictingTool.ambiguous.length,'conflicting CAM tool declaration is explicit uncertainty');
assert(ME.sequences('G21 G54 G91\nG1 X10 F100').ambiguous.length,'relative start has no known position');
assert.equal(ME.sequences('G21 G54 G90\nG1 X10 F100\nG91\nG1 X2').ambiguous.length,0,'relative moves after absolute positioning remain usable');
const conflict = ME.sequences('(operation: A)(operation: B)\nG1 X1 F100');
assert(conflict.ambiguous.length, 'conflicting operation names on one line stay ambiguous');
const bounded = ME.sequences(Array.from({length: 25000}, (_, i) => (i % 2 ? 'G0' : 'G1') + ' X' + i + ' F100').join('\n'));
assert(bounded.items.length <= 10000); assert.equal(bounded.complete, false);
assert(bounded.ambiguous.some(a => a.lastLine === 25000));

// Additional events preserve the v1 estimator and let geometry reject unsupported frames.
const events = [], interp = ME.createInterpreter(null, (kind, line, value) => events.push([kind,line,value]));
interp.text('G54\nG55\nG43.1 Z1\nG49\nG1 X[#1]\nM98 P2');
for (const event of [['wcs',1,'G54'],['wcs',2,'G55'],['length-offset',3,'G43.1'],['length-offset',4,'G49'],['syntax',5,null],['mcode',6,'M98']]) {
  assert(events.some(e => JSON.stringify(e) === JSON.stringify(event)), JSON.stringify(event));
}
console.log('PASS v2 sequences: CAM provenance, G0 groups, original sender lines, M0/M1 and modal tools, ambiguity, bounded worker metadata.');
