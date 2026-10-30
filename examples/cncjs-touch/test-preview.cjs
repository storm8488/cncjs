const assert = require('node:assert/strict');
const {scan, render} = require('./touch/library-preview.js');
(async () => {
  // Grbl executes lines after M2/M30 and the CNCjs sender sends them: refused, never hidden.
  await assert.rejects(scan('G21 G90\nG1 X10 Y10 F100\nM30\nG0 X300 Y300'), /après M2\/M30/);
  // CNCjs '%' directives: the server refuses any '%' line with more than spaces after it.
  for (const line of ['% (fin)', '%;fin', '%wait', ' %X=1']) await assert.rejects(scan('G21 G90\nG1 X1 F100\n' + line + '\nM30'), /directive/, line);
  await scan('G21 G90\nG1 X1 F100\nM30\n%\n % \n\n');
  // A tool change (CNCjs comments M6 out and pauses) does not move: the preview accepts it.
  assert.equal((await scan('G21 G90\nT1 M6\nM3 S9000\nG0 X0 Y0\nG1 X10 F300\nT2 M6\nG1 Y10\nM30')).lines, 8);
  // A '(' inside a comment: CNCjs counts nesting and would send nothing of this line,
  // while the preview would draw the move after the first ')'. Refused instead.
  await assert.rejects(scan('G21 G91\n(a (b) G0 X50\nG1 X10 F100\nM2'), /commentaire imbriqué/);
  // Relative moves before any absolute X/Y start from the tool's place: flagged for the travel check.
  assert.equal((await scan('G21 G91\nG1 X100 F500\nG1 Y50\nG1 X-100\nM2')).relativeStart, true);
  assert.equal((await scan('G21 G90\nG0 X0 Y0\nG91\nG1 X10 F300\nM2')).relativeStart, false);
  let result = await scan('G21 G90\nG0 X10 Y10\nG1 X30 Y20 F200\nG91\nX-5 Y5\nM2\n%\n\n');
  assert.equal(result.count, 3);
  assert.deepEqual(result.bounds, [0,0,30,25]);
  // Progress trail: [sentLines, x, y, ...] samples, sent lines counted like the CNCjs sender (non-empty).
  assert.equal(result.lines, 7, 'every non-empty line is counted, as the sender sends them (the % after M2 too)');
  assert.equal(result.trail.length % 3, 0); assert(result.trail.length >= 6);
  assert.deepEqual(result.trail.slice(-3), [7, 25, 25], 'last sample: final sent line and position');
  for (let i = 3; i < result.trail.length; i += 3) assert(result.trail[i] >= result.trail[i - 3], 'line counts are monotonic');
  const sparse = await scan('\n\n  \nG1 X1\n\n;comment only\n(paren)\nG1 X2\n');
  assert.equal(sparse.lines, 4, 'comment-only lines count as sent lines, blank lines do not');
  result = await scan('G20 G90\r\nG1 X1 Y2\r\n');
  assert.deepEqual(result.bounds, [0,0,25.4,50.8]);
  await assert.rejects(scan('G1 X1\nG2 X2 I1'), /centre/);
  await assert.rejects(scan('G1 X1 X2'), /axe répété/);
  await assert.rejects(scan('G1 X1 (oops'), /commentaire/);
  // An unclosed comment must not hide the following lines (Grbl ends it at the line end).
  await assert.rejects(scan('G1 X10 Y10 F100 (oops\nG0 X200 Y200 (end)\nG1 X20 Y10'), /Ligne 1 : commentaire/);
  await assert.rejects(scan('G90.1\nG2 X10 Y0 I5 J0'), /G90.1/);
  await assert.rejects(scan('G1 X10 F100\nG2 I-5'), /arc sans X ni Y/);
  await assert.rejects(scan('G1 X10 F100\nG2 Z-1 I-5'), /arc sans X ni Y/);
  await assert.rejects(scan('G1 X1 F100\rG1 X2'), /CR seule/);
  // An arc ending a hair short of its start is a full circle for Grbl.
  result = await scan('G21 G90\nG0 X10 Y0\nG2 X10 Y0.0000000001 I-10 J0 F100');
  assert(result.bounds[0] < -9.9 && result.bounds[2] > 9.9, 'full circle drawn: ' + result.bounds);
  await assert.rejects(scan('G90 G91 G1 X1'), /contradictoires/);
  await assert.rejects(scan('X2'), /mode G0/);
  await assert.rejects(scan('G1 X1',null,()=>true), /Annulé/);
  // G4 dwell (spindle spin-up after M3) is accepted without motion; P alone or G4 with axes is not.
  result = await scan('G21 G90\nM3 S12000\nG4 P2\nG1 X10 Y0 F600\nG4P0.5\nM5');
  assert.equal(result.count, 1); assert.deepEqual(result.bounds, [0,0,10,0]); assert.equal(result.lines, 6);
  await assert.rejects(scan('G1 X1 P2'), /P hors G4/);
  await assert.rejects(scan('G4 X1 P1'), /G4 attend seulement P/);
  await assert.rejects(scan('G4'), /G4 attend seulement P/);
  await assert.rejects(scan('G4 P1 P2'), /P répété/);
  // Common posts (audit 31): G28/G30 cut the drawing until X, Y and Z are absolute again.
  {
    const moves = [];
    const fusion = 'G90 G94\nG17\nG21\nG54\nG0 X10 Y10\nZ5\nG1 Z-1 F100\nX20\nG0 Z15\nG28 G91 Z0.\nG90\nG0 X30 Y30\nG0 X40 Y40\nZ5\nG1 Z-2\nX50\nG0 Z15\nG28 G91 X0. Y0.\nG90\nM30';
    const r = await scan(fusion, null, null, null, null, (ax, ay, az, bx, by, bz, mode) => moves.push([ax, ay, az, bx, by, bz, mode]));
    assert.equal(r.wcs, 'G54'); assert.equal(r.returns, true);
    // Drawn: G0 to 10,10; G1 to 20; then nothing while Z is unknown; G1 X50 after Z5/Z-2 (absolute): 3 XY segments.
    assert.deepEqual(r.bounds, [0, 0, 50, 40]); assert.deepEqual(r.zBounds, [-2, 15]); assert.equal(r.count, 3);
    // The 3D path rejoins from the last known point with a rapid, never through a made-up position.
    assert(moves.some(m => m[0] === 20 && m[1] === 10 && m[2] === 15 && m[3] === 40 && m[4] === 40 && m[5] === 5 && m[6] === 0), JSON.stringify(moves));
    assert(!moves.some(m => m[3] === 30 && m[4] === 30), 'no move from an unknown position');
    assert.match(r.notes.join(' '), /Retour G28 \(ligne 10\)/);
    // A relative move from an unknown position is refused; a relative zero (the return itself) is not.
    await assert.rejects(scan('G21 G90\nG0 Z5\nG28 G91 Z0\nG1 Z-1 F100'), /Ligne 4 : déplacement relatif depuis une position inconnue/);
    await assert.rejects(scan('G21 G90\nG0 X1 Y1 Z5\nG28\nG90 G0 X1 Y1\nG2 X3 Y1 I1 J0'), /Ligne 5 : arc depuis une position inconnue/);
    // G28 with an absolute intermediate point: the rapid to it is drawn, then the axes are lost.
    const mid = await scan('G21 G90\nG0 X0 Y0 Z5\nG28 X10\nG0 X0 Y0\nG1 X5 F100');
    assert.equal(mid.count, 2); assert.deepEqual(mid.bounds, [0, 0, 10, 0]);
    // G30 without axis words: every axis lost; nothing drawn afterwards until all are absolute.
    const g30 = await scan('G21 G90\nG0 X1 Y1 Z1\nG30\nG0 X9 Y9\nG1 X20 F100\nG0 Z1\nG1 X30');
    assert.equal(g30.count, 2); assert.deepEqual(g30.bounds, [0, 0, 30, 9]);
    await assert.rejects(scan('G28 G4 P1'), /contradictoires/);
    await assert.rejects(scan('G1 X1 F100\nG28 I1'), /arc/);
  }
  // Program number O and G80 (motion cancel, no canned cycle in Grbl): no motion.
  {
    const r = await scan('%\nO1000\nN10 G17 G21 G40 G49 G80 G90\nN50 G0 X5. Y5.\nN70 G1 Z-1. F150.\nN80 X25.\nM30\n%');
    assert.equal(r.count, 2); assert.deepEqual(r.bounds, [0, 0, 25, 5]);
    assert.match(r.notes.join(' '), /Mot O \(ligne 2\) ignoré.*erreur 20/);
    await assert.rejects(scan('G21 G90\nG1 X1 F100\nG80\nX2'), /Ligne 4 : mode G0\/G1 non défini/);
    await assert.rejects(scan('G1 G80 X1'), /contradictoires/);
  }
  // G55-G59 chosen before moving: drawn in that work offset; a change after moving is refused.
  {
    const r = await scan('G21 G90 G57\nG0 X10 Y10\nG1 X20 F100');
    assert.equal(r.wcs, 'G57'); assert.deepEqual(r.bounds, [0, 0, 20, 10]);
    assert.equal((await scan('G21 G90\nG1 X1 F100')).wcs, null);
    assert.equal((await scan('G55\nG55 G1 X1 F100')).wcs, 'G55');
    await assert.rejects(scan('G21 G90 G54\nG1 X10 F100\nG56\nG0 X5'), /Ligne 3 : changement de repère \(G56\) après des déplacements/);
    await assert.rejects(scan('G21 G90\nG1 X10 F100\nG54'), /changement de repère/);
    await assert.rejects(scan('G54 G55 G1 X1'), /contradictoires/);
    await assert.rejects(scan('G59.1 G1 X1'), /G59.1 non pris en charge/);
    // Stored projection: the drawing's offset (G54 kept when the program selects none) and the notes.
    const c2 = {getContext: () => ({fillRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}}), toDataURL: () => 'data:image/png;base64,AAAA'};
    const g57 = await render('G21 G90 G57\nG0 X10 Y10\nG1 X20 F100\nG28 G91 Z0\nG90', c2, () => false, () => {});
    assert.equal(g57.projection.wcs, 'G57'); assert.equal(g57.projection.programWcs, 'G57'); assert.equal(g57.projection.returns, true);
    assert.equal(g57.path3d, undefined); assert.match(g57.note, /Tracé en coordonnées de travail G57.*Retour G28 \(ligne 4\)/);
    const plain = await render('G21 G90\nG1 X10 Y10 F100', c2, () => false, () => {});
    assert.equal(plain.projection.wcs, 'G54'); assert.equal(plain.projection.programWcs, null); assert.equal(plain.projection.returns, false);
    assert.doesNotMatch(plain.note, /Retour|Mot O|Tracé en/);
  }
  let count=0;
  const big = 'G90 G21\nG1 X1\n' + Array.from({length:120001},(_,i)=>'X'+(i%2 ? 1 : 2)).join('\n');
  result = await scan(big,()=>count++);
  assert.equal(result.count,120002); assert.equal(count,120002);
  assert(result.trail.length/3 <= 1005 && result.trail.length/3 >= 900, 'about a thousand samples: ' + result.trail.length/3);
  assert.deepEqual(result.trail.slice(0, 3), [0, 0, 0], 'the trail starts at the program origin');
  assert.equal(result.trail.at(-3), 120003); assert.equal(result.lines, 120003);
  const { trailCount } = require('./touch/tool-position.js');
  assert.equal(trailCount(result.trail, 0), 1); assert.equal(trailCount(result.trail, 120003), result.trail.length/3);
  assert(trailCount(result.trail, 60000) > 400 && trailCount(result.trail, 60000) < 600);
  let strokes=0;
  const ctx={fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){strokes++;}};
  const canvas={getContext:()=>ctx,toDataURL:()=> 'data:image/png;base64,AAAA'};
  result = await render(big,canvas,()=>false,()=>{});
  assert.equal(strokes,120002); assert.equal(result.segments,120002);
  assert.equal(result.lines, 120003); assert(Array.isArray(result.trail) && result.trail.length >= 3000, 'render carries the trail');
  console.log('Preview tests: 10 checks passed, including 120002 segments with no omissions.');
})().catch(e=>{console.error(e);process.exitCode=1;});
