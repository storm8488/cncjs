/* eslint-env jest */
// Chasse aux bugs, angle E, défaut E-1 : le contrôle de course serveur
// (program-check.js:564) donne à un axe dont le bit $23 est à 1 l'espace
// [0, $13x], alors que Grbl 1.1 standard garde [−$13x, 0] quel que soit $23
// (limits.c : position après $H = max_travel + pulloff, max_travel négatif ;
// même règle dans motion.js:145-192 et, depuis cbde7cee, dans
// touch/travel-check.js:25,31). Conséquences prouvées ici :
//   1. un programme réellement dans la course est déclaré « hors course » ;
//   2. le cadrage laser (job-service.js:1265-1268) est refusé
//      (ETOUCH_LASER_FRAME_CHECK) sur une machine laser dont X et Y font
//      leur prise d'origine vers le négatif ($23=3).
// Ces tests ÉCHOUENT sur cbde7cee : c'est la preuve.
// Correction retenue (FINDINGS.md, D-1 / E-1) : un axe dont le bit $23 est posé
// n'est pas vérifié (unknown, ETOUCH_CHECK_HOMING_DIRECTION) — le serveur ne
// peut pas distinguer Grbl standard ([−$13x, 0]) d'une compilation
// HOMING_FORCE_SET_ORIGIN ([0, $13x]), et motion.js garde les deux candidats.
// Le cadrage laser, qui exige X et Y validés, reste donc refusé sur une telle
// machine : le troisième test ci-dessous prouve que ce refus vient désormais de
// l'incertitude $23 et non d'un faux « hors course ».
import { EventEmitter } from 'events';
import { programCheck } from '../program-check';
import { createService } from '../job-service';
import { createControl } from '../control';
import { fingerprint as sha256 } from '../program-identity';
import { signatureOf } from '../machine-profile';

describe('E-1 : $23 et le contrôle de course serveur', () => {
  test('Grbl 1.1 standard, bit X de $23 à 1, MPos X=-350 après $H : un programme X 0→60 (machine -350→-290) n’est pas hors course', () => {
    // Après $H vers X-, Grbl 1.1 met MPos X à -($130 - pulloff) : l'opérateur
    // ne peut être qu'à X machine négatif ; ici G54 X0 = X machine -350.
    const machine = {
      settings: { $20: '1', $22: '1', $23: '1', $130: '400', $131: '300', $132: '80' },
      mpos: { x: -350, y: -150, z: -40 },
      wpos: { x: 0, y: 0, z: 0 },
      modal: { units: 'G21', distance: 'G90', wcs: 'G54' },
      parameters: null,
      homed: true,
      reportUnits: 'mm'
    };
    const r = programCheck(['G21 G90 G54', 'G0 X0 Y0', 'G1 X60 F500', 'G1 Y30', 'M30'].join('\n'), machine);
    // motion.js, pour la même machine, tient [-400, 0] pour toujours plausible :
    // la tablette (cbde7cee) dit « non vérifiée » ; le serveur ne doit pas dire « hors course ».
    expect(r.axes.X.verdict).not.toBe('outside');
    expect(r.axes.X.reasons.join(' ')).not.toMatch(/Hors course X/);
    expect(r.axes.X.verdict).toBe('unknown');
    expect(r.axes.X.codedReasons.map((c) => c.code)).toEqual(['ETOUCH_CHECK_HOMING_DIRECTION']);
  });
});

// Service réel (job-service + control + motion) avec un faux contrôleur, comme
// scenario-profiles.test.js : machine laser, $32=1, déplacements activés,
// référencée (Home puis Idle), programme chargé, puis frame-prepare.
const SETTINGS = {
  $10: '1', $13: '0', $22: '1', $23: '3', $30: '1000', $31: '0', $32: '1',
  $100: '80', $101: '80', $102: '400', $110: '3000', $111: '3000', $112: '500',
  $120: '200', $121: '200', $122: '50', $130: '400', $131: '400', $132: '80'
};
const signature = signatureOf(SETTINGS, '1.1h', '1.1h');
const LASER = { id: 'm-0123456789ab', label: 'Laser', kind: 'laser', signature, createdAt: 'x', updatedAt: 'x' };
const A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A', user: 'op' };
// Contour X 0→45, Y 0→40 en G54 ; G54 X0 Y0 = machine -105, -105 : le contour
// occupe X machine -105→-60 et Y machine -105→-65, dans [-400, 0].
const PROGRAM = ['G21 G90', 'G0 X0 Y0 Z2', 'M4 S800', 'G1 X10 F1200', 'G1 Y10', 'G0 X20 Y0', 'G1 X30', 'G0 X40 Y40', 'G1 X45', 'M5', 'M30'].join('\n');

const fakeController = () => {
  const c = {
    type: 'Grbl',
    options: { port: 'TEST' },
    ready: true,
    isClose: () => false,
    runner: new EventEmitter(),
    sender: new EventEmitter(),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }),
    state: { status: { activeState: 'Idle', spindle: 0, mpos: { x: '-100.000', y: '-100.000', z: '-10.000' }, wpos: { x: '5.000', y: '5.000', z: '2.000' } } },
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    settings: { version: '1.1h', settings: { ...SETTINGS } },
    commands: []
  };
  c.runner.state = c.state;
  c.sender.state = { name: '', context: {}, total: 0 };
  c.sender.toJSON = () => ({ ...c.sender.state });
  c.command = (name, ...args) => {
    c.commands.push([name, ...args]);
    if (name === 'gcode:load') {
      c.sender.state = { name: args[0], context: args[2], total: 11 };
      c.sender.emit('load');
      args[3](null);
    }
  };
  return c;
};

const services = [];
afterEach(() => {
  services.splice(0).forEach((s) => s.dispose());
});

describe('E-1 (suite) : cadrage laser refusé à tort sur une machine $23=3 (Grbl 1.1 standard)', () => {
  const laserReady = async () => {
    const ctx = { now: 10000, c: fakeController(), machines: [LASER] };
    const config = {
      get: (key) => (key === 'touch.machines' ? ctx.machines : { 'touch.motion.enabled': true, events: [], macros: [] }[key]),
      set: () => {}
    };
    const files = {
      readProgram: () => Promise.resolve({ text: PROGRAM, fingerprint: sha256(Buffer.from(PROGRAM)), size: PROGRAM.length, mtimeMs: 1 }),
      fingerprintOf: () => Promise.resolve({ fingerprint: sha256(Buffer.from(PROGRAM)), size: 1, mtimeMs: 1 })
    };
    const control = createControl({ now: () => ctx.now, elapsed: () => ctx.now });
    const service = createService({ get: () => ({ TEST: ctx.c }) }, config, () => ctx.now, { control, history: { record: () => {} }, files });
    services.push(service);
    const generation = service.list()[0].generation;
    service.openTransport('tA', A);
    const report = () => ctx.c.runner.emit('status');
    report();
    // Référencée : Home puis Idle.
    ctx.c.state.status.activeState = 'Home';
    report();
    ctx.c.state.status.activeState = 'Idle';
    report();
    const req = (action, extra = {}) => service.action({ port: 'TEST', generation, transportId: 'tA', action, ...extra }, A);
    await req('load', { file: 'passes.nc' });
    const state = service.list()[0];
    expect(state.homed).toBe(true);
    return { state, req };
  };

  test('le même service accepte un jog continu X+ depuis X machine -100 (motion.js : [-400, 0] plausible), mais le contrôle de course dit « hors course »', async () => {
    const { state } = await laserReady();
    // motion.js : à X=-100, seule la convention [-400, 0] contient la position ; le jog est permis.
    expect(state.motion.continuousReason.X).toBe('');
    expect(state.motion.continuousReason.Y).toBe('');
    // program-check.js:564 : course X supposée [0, 400] → contour X machine -105→-60 « hors course ».
    expect(state.programCheck.axes.X.verdict).not.toBe('outside');
    expect(state.programCheck.axes.Y.verdict).not.toBe('outside');
  });

  // Avant la correction, ce test demandait que frame-prepare réussisse (course
  // [-400, 0] supposée). Correction retenue : X et Y à bit $23 posé ne sont pas
  // vérifiés, donc le cadrage est refusé — mais pour cette raison-là (axes non
  // vérifiés, ETOUCH_CHECK_HOMING_DIRECTION), jamais pour un faux « hors course ».
  test('frame-prepare refusé (ETOUCH_LASER_FRAME_CHECK) parce que X et Y ne sont pas vérifiés ($23=3), et non pour un faux « hors course »', async () => {
    const { state, req } = await laserReady();
    const check = state.programCheck;
    expect([check.axes.X.verdict, check.axes.Y.verdict]).toEqual(['unknown', 'unknown']);
    expect(check.codedReasons.map((c) => c.code)).toEqual(['ETOUCH_CHECK_HOMING_DIRECTION', 'ETOUCH_CHECK_HOMING_DIRECTION']);
    expect(check.reasons.join(' ')).not.toMatch(/Hors course/);
    let refusal = null;
    try {
      await req('machine', { operation: 'frame-prepare' });
    } catch (err) {
      refusal = err;
    }
    expect(refusal && refusal.code).toBe('ETOUCH_LASER_FRAME_CHECK');
  });
});
