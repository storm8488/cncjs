/* eslint-env jest */
/**
 * Profile 'lunyee': the facts seen on the operator's LUNYEE 4040 board
 * (examples/cncjs-touch/design/refonte/PLAN-CORRECTIONS.md § 2.1, lines L1-L15).
 */

const net = require('net');
const GrblSimulator = require('../grbl-simulator');
const GrblServer = require('../grbl-server');

const BANNER = '\r\nGrbl 1.1f [\'$\' for help]\r\n';
const LOCKED = BANNER + '[MSG:\'$H\'|\'$X\' to unlock]\r\n';

const collect = (sim) => {
    const out = [];
    sim.on('data', (d) => out.push(d));
    return out;
};
// Answers of one line, through the asynchronous path the TCP server uses.
const send = (sim, line) => {
    const answers = [];
    sim.processLineAsync(line, (r) => answers.push(r));
    return answers;
};
const report = (sim) => sim.processRealtimeCommand('?');
const mposOf = (text) => /MPos:([-\d.]+),([-\d.]+),([-\d.]+)/.exec(text).slice(1).map(Number);
// The next report that carries WCO:, within ten.
const nextWco = (sim) => {
    for (let i = 0; i < 10; i++) {
        const m = /\|WCO:([-\d.]+),([-\d.]+),([-\d.]+)/.exec(report(sim));
        if (m) {
            return m.slice(1).map(Number);
        }
    }
    return null;
};

describe('LUNYEE profile of the simulator (fake timers)', () => {
    let sim;
    const make = (options = {}) => {
        if (sim) {
            sim.stopPlannerExecutor();
        }
        sim = new GrblSimulator({ profile: 'lunyee', ...options });
        return sim;
    };
    // G54 stored on the board ($X, G10 L2), then a homing cycle ($H) seen to its end.
    const homedWithG54 = (options) => {
        make(options);
        send(sim, '$X');
        send(sim, 'G10 L2 P1 X150 Y120 Z-100');
        const answers = send(sim, '$H');
        jest.advanceTimersByTime(1600);
        expect(answers).toEqual(['ok\r\n']);
        return sim;
    };

    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        if (sim) {
            sim.stopPlannerExecutor();
            sim = null;
        }
        jest.useRealTimers();
    });

    it('refuses an unknown profile or option', () => {
        expect(() => new GrblSimulator({ profile: 'other' })).toThrow('unknown profile: other');
        expect(() => new GrblSimulator({ profile: 'lunyee', executedAfterHoming: 'maybe' })).toThrow(/executedAfterHoming/);
        expect(() => new GrblSimulator({ profile: 'lunyee', resetAtRest: 'never' })).toThrow(/resetAtRest/);
    });

    it('L1 settings, version and options of the board', () => {
        make();
        const settings = sim.listSettings();
        ['$6=1', '$10=1', '$13=0', '$20=1', '$21=1', '$22=1', '$23=3', '$27=2', '$30=1000',
            '$110=4000', '$111=4000', '$112=800', '$130=408', '$131=396', '$132=130'].forEach((line) => {
            expect(settings).toContain(`${line}\r\n`);
        });
        expect(sim.processLine('$I')).toBe('[VER:1.1f.20231030:]\r\n[OPT:PHSW]\r\nok\r\n');
        expect(sim.getStartupMessage()).toBe(BANNER);
    });

    it('L2 starts locked in Alarm, MPos 0,0,0, not homed; G-code refused until $X', () => {
        make();
        expect(sim.machineState).toBe('Alarm');
        expect(sim.homed).toBe(false);
        expect(report(sim)).toMatch(/^<Alarm\|MPos:0\.000,0\.000,0\.000\|/);
        expect(sim.processLine('G0 X1')).toBe('error:8\r\n');
        expect(sim.processLine('$X')).toBe('[MSG:Caution: Unlocked]\r\nok\r\n');
        expect(sim.machineState).toBe('Idle');
    });

    it('L3 $H: Home reported during the cycle, ok at its end, MPos 0,0,0 wherever it started', () => {
        make();
        send(sim, '$X');
        send(sim, '$J=G53 G90 X100 Y80 Z-50 F4000');
        jest.advanceTimersByTime(3000);
        expect(mposOf(report(sim))).toEqual([100, 80, -50]);
        const answers = send(sim, '$H');
        jest.advanceTimersByTime(500);
        expect(report(sim)).toMatch(/^<Home\|/);
        expect(answers).toEqual([]);
        jest.advanceTimersByTime(1100);
        expect(answers).toEqual(['ok\r\n']);
        expect(sim.machineState).toBe('Idle');
        expect(sim.homed).toBe(true);
        expect(mposOf(report(sim))).toEqual([0, 0, 0]);
    });

    it('L3 homeReports false: no status report while the cycle runs', () => {
        make({ homeReports: false });
        send(sim, '$H');
        jest.advanceTimersByTime(500);
        expect(sim.machineState).toBe('Home');
        expect(report(sim)).toBe('');
        jest.advanceTimersByTime(1100);
        expect(report(sim)).toMatch(/^<Idle\|/);
    });

    it('L4 $HX, $HY and $HZ run the whole cycle (the standard simulator refuses them)', () => {
        const standard = new GrblSimulator();
        expect(standard.processLine('$HX')).toBe('error:3\r\n');
        standard.stopPlannerExecutor();
        ['$HX', '$HY', '$HZ'].forEach((line) => {
            make();
            send(sim, '$X');
            send(sim, '$J=G53 G90 X10 Y10 Z-10 F4000');
            jest.advanceTimersByTime(1000);
            const answers = send(sim, line);
            jest.advanceTimersByTime(200);
            expect(sim.machineState).toBe('Home');
            jest.advanceTimersByTime(1400);
            expect(answers).toEqual(['ok\r\n']);
            expect(mposOf(report(sim))).toEqual([0, 0, 0]);
            expect(sim.homed).toBe(true);
            sim.stopPlannerExecutor();
        });
    });

    it('L5 after the homing: WCO:0,0,0 reported, $# unchanged, the moves use a zero offset; G54 again changes nothing', () => {
        homedWithG54();
        expect(nextWco(sim)).toEqual([0, 0, 0]);
        expect(sim.processLine('$#')).toContain('[G54:150.000,120.000,-100.000]\r\n');
        send(sim, 'G54');
        expect(nextWco(sim)).toEqual([0, 0, 0]);
        send(sim, 'G0 X10 Y10 Z-10');
        jest.advanceTimersByTime(1000);
        expect(mposOf(report(sim))).toEqual([10, 10, -10]);
    });

    it('L5 executedAfterHoming stored: WCO:0,0,0 reported while the moves use G54', () => {
        homedWithG54({ executedAfterHoming: 'stored' });
        expect(nextWco(sim)).toEqual([0, 0, 0]);
        send(sim, 'G0 X10 Y10 Z-10');
        jest.advanceTimersByTime(5000);
        expect(mposOf(report(sim))).toEqual([160, 130, -110]);
    });

    it('L5 the stored offset is loaded again by another system, G10 on the active one, a reset, M2 / M30', () => {
        const reloads = {
            'G55 then G54': () => {
                send(sim, 'G55');
                send(sim, 'G54');
            },
            'G10 L2 on the active system': () => send(sim, 'G10 L2 P0 X150'),
            'G10 L20 on the active system': () => send(sim, 'G10 L20 P1 X-150'),
            reset: () => sim.processRealtimeCommand('\x18'),
            M2: () => send(sim, 'M2'),
            M30: () => send(sim, 'M30')
        };
        Object.entries(reloads).forEach(([name, reload]) => {
            homedWithG54();
            expect(nextWco(sim)).toEqual([0, 0, 0]);
            reload();
            // The WCO comes at the next report after the change.
            expect([name, /\|WCO:([-\d.,]+)/.exec(report(sim))[1]]).toEqual([name, '150.000,120.000,-100.000']);
            sim.stopPlannerExecutor();
        });
        // G10 on another system writes it, the active offset stays void.
        homedWithG54();
        send(sim, 'G10 L2 P2 X1 Y2 Z-3');
        expect(nextWco(sim)).toEqual([0, 0, 0]);
        expect(sim.processLine('$#')).toContain('[G55:1.000,2.000,-3.000]\r\n');
    });

    it('L6 soft limits at parse: Z -129.735 passes, -129.945 raises ALARM:2; X and Y from 0 to + (0.2 mm early), Z 0 allowed', () => {
        homedWithG54();
        expect(send(sim, 'G53 G1 Z-129.735 F800')).toEqual(['ok\r\n']);
        jest.advanceTimersByTime(10000);
        expect(mposOf(report(sim))[2]).toBeCloseTo(-129.735, 3);
        expect(send(sim, 'G53 G0 Z0')).toEqual(['ok\r\n']);
        expect(send(sim, 'G53 G0 X407.8 Y395.8')).toEqual(['ok\r\n']);
        jest.advanceTimersByTime(12000);
        expect(mposOf(report(sim))).toEqual([407.8, 395.8, 0]);
        ['G53 G1 Z-129.945 F800', 'G53 G0 Z0.001', 'G53 G0 X407.9', 'G53 G0 Y-0.001', 'G38.2 Z-131 F100'].forEach((line) => {
            homedWithG54();
            expect([line, send(sim, line).join('')]).toEqual([line, `ALARM:2\r\n${LOCKED}`]);
            sim.stopPlannerExecutor();
        });
        homedWithG54();
        send(sim, 'G53 G0 X5 Y100');
        jest.advanceTimersByTime(2000);
        // An arc whose end is inside but whose path leaves the travel: from (5, 100), centre
        // (5, 110), clockwise, the half circle goes through X -5; counter-clockwise, X 15.
        expect(send(sim, 'G2 X5 Y120 I0 J10 F600').join('')).toBe(`ALARM:2\r\n${LOCKED}`);
        homedWithG54();
        send(sim, 'G53 G0 X5 Y100');
        jest.advanceTimersByTime(2000);
        expect(send(sim, 'G3 X5 Y120 I0 J10 F600')).toEqual(['ok\r\n']);
    });

    it('L6 a jog beyond the soft limits answers error:15, without alarm or move', () => {
        homedWithG54();
        expect(sim.processLine('$J=G53 G90 Z-129.9 F800')).toBe('error:15\r\n');
        expect(sim.processLine('$J=G91 G21 X-1 F1000')).toBe('error:15\r\n');
        expect(sim.machineState).toBe('Idle');
        expect(sim.homed).toBe(true);
        expect(mposOf(report(sim))).toEqual([0, 0, 0]);
    });

    it('L7 beyond the limits: ALARM:2, nothing moves, the board restarts (MPos 0, not homed, offset from $#)', () => {
        homedWithG54();
        send(sim, 'G0 X50 Y50 Z-50');
        jest.advanceTimersByTime(2000);
        send(sim, 'G1 X60 F100');
        jest.advanceTimersByTime(100);
        expect(sim.machineState).toBe('Run');
        const answers = send(sim, 'G1 Z-140');
        expect(answers.join('')).toBe(`ALARM:2\r\n${LOCKED}`);
        expect(sim.motionState.active).toBe(false);
        expect(sim.plannerBuffer.queue).toEqual([]);
        expect(sim.machineState).toBe('Alarm');
        expect(sim.homed).toBe(false);
        expect(mposOf(report(sim))).toEqual([0, 0, 0]);
        expect(nextWco(sim)).toEqual([150, 120, -100]);
        expect(sim.processLine('G0 X1')).toBe('error:8\r\n');
    });

    it('L8 a limit switch ($21=1): ALARM:1, then the same restart', () => {
        homedWithG54();
        const out = collect(sim);
        send(sim, 'G0 X100');
        jest.advanceTimersByTime(500);
        expect(sim.setLimitPin('x', true)).toBe(true);
        expect(out.join('')).toBe(`ALARM:1\r\n${LOCKED}`);
        expect(sim.machineState).toBe('Alarm');
        expect(sim.homed).toBe(false);
        expect(mposOf(report(sim))).toEqual([0, 0, 0]);
    });

    it('L9 reset in motion: the board restarts (MPos 0, not homed); at rest the position stays, unless resetAtRest restart', () => {
        homedWithG54();
        send(sim, 'G0 X100');
        jest.advanceTimersByTime(500);
        expect(sim.machineState).toBe('Run');
        expect(sim.processRealtimeCommand('\x18')).toBe(`ALARM:3\r\n${LOCKED}`);
        expect(sim.homed).toBe(false);
        expect(mposOf(report(sim))).toEqual([0, 0, 0]);

        // A held motion is still a motion (Arrêter = feed hold, then reset).
        homedWithG54();
        send(sim, 'G0 X100');
        jest.advanceTimersByTime(500);
        sim.processRealtimeCommand('!');
        expect(sim.processRealtimeCommand('\x18')).toBe(`ALARM:3\r\n${LOCKED}`);
        expect(mposOf(report(sim))).toEqual([0, 0, 0]);

        homedWithG54();
        send(sim, 'G0 X100');
        jest.advanceTimersByTime(3000);
        expect(sim.processRealtimeCommand('\x18')).toBe(BANNER);
        expect(sim.machineState).toBe('Idle');
        expect(sim.homed).toBe(true);
        expect(mposOf(report(sim))).toEqual([100, 0, 0]);

        homedWithG54({ resetAtRest: 'restart' });
        expect(sim.processRealtimeCommand('\x18')).toBe(LOCKED);
        expect(sim.homed).toBe(false);
    });

    it('L10 probe stuck: Pn:P always, G38.2 and G38.3 raise ALARM:4 before moving', () => {
        homedWithG54({ probeStuck: true });
        sim.probeTriggered = false;
        expect(report(sim)).toMatch(/\|Pn:P/);
        expect(sim.processLine('G38.3 Z-10 F100')).toBe('ALARM:4\r\nok\r\n');
        send(sim, '$X');
        expect(sim.processLine('G38.2 Z-10 F100')).toBe('ALARM:4\r\nok\r\n');
        expect(mposOf(report(sim))).toEqual([0, 0, 0]);
    });

    it('L10 no contact: G38.3 ends with [PRB:<end>:0] and no alarm, G38.2 with ALARM:5; a contact on the way down', () => {
        homedWithG54();
        // The simulated surface is near machine Z -2.85 here: Z -1 never reaches it.
        const out = collect(sim);
        send(sim, 'G38.3 Z-1 F600');
        jest.advanceTimersByTime(500);
        expect(out.join('')).toBe('[PRB:0.000,0.000,-1.000:0]\r\n');
        expect(sim.machineState).toBe('Idle');
        out.length = 0;
        send(sim, 'G53 G0 Z0');
        send(sim, 'G38.2 Z-1 F600');
        jest.advanceTimersByTime(500);
        expect(out.join('')).toMatch(/^ALARM:5\r\n\[PRB:[-\d.,]+:0\]\r\n$/);
        send(sim, '$X');
        out.length = 0;
        send(sim, 'G53 G0 Z0');
        send(sim, 'G38.2 Z-10 F600');
        jest.advanceTimersByTime(2000);
        expect(out.join('')).toBe('[PRB:0.000,0.000,-2.850:1]\r\n');
    });

    it('L11 MPos without Bf:, WCO: one report in ten while running too, and at the report after a change', () => {
        homedWithG54();
        nextWco(sim);
        send(sim, 'G1 X100 F600');
        jest.advanceTimersByTime(100);
        expect(sim.machineState).toBe('Run');
        const reports = Array.from({ length: 20 }, () => report(sim));
        expect(reports.every((r) => r.startsWith('<Run|MPos:') && !r.includes('|Bf:'))).toBe(true);
        expect(reports.filter((r) => r.includes('|WCO:')).length).toBe(2);
        send(sim, 'G55');
        expect(report(sim)).toMatch(/\|WCO:/);
    });

    it('L12 FS gives the spindle speed capped at $30 ($G keeps the programmed S)', () => {
        homedWithG54();
        send(sim, 'M3 S18000');
        expect(report(sim)).toMatch(/\|FS:[\d.]+,1000[|>]/);
        sim.processRealtimeCommand('\x9B');
        expect(report(sim)).toMatch(/\|FS:[\d.]+,1000[|>]/);
        expect(sim.processLine('$G')).toMatch(/ S18000\]/);
        send(sim, 'M5');
        expect(report(sim)).toMatch(/\|FS:[\d.]+,0[|>]/);
    });

    it('L13 $# and $I in Idle and Alarm, error:8 while moving; $$ refused in Run and Hold', () => {
        make();
        expect(sim.processLine('$#')).toMatch(/\[G54:.*ok\r\n$/s);
        expect(sim.processLine('$I')).toMatch(/^\[VER:/);
        send(sim, '$X');
        send(sim, 'G1 X100 F600');
        jest.advanceTimersByTime(100);
        expect(sim.machineState).toBe('Run');
        expect(sim.processLine('$#')).toBe('error:8\r\n');
        expect(sim.processLine('$I')).toBe('error:8\r\n');
        expect(sim.processLine('$$')).toBe('error:8\r\n');
        sim.processRealtimeCommand('!');
        expect(sim.processLine('$$')).toBe('error:8\r\n');
        expect(sim.processLine('$#')).toBe('error:8\r\n');
    });

    it('L15 the simulated homing ends within 2 s by default (homingMs)', () => {
        make();
        const answers = send(sim, '$H');
        jest.advanceTimersByTime(1990);
        expect(answers).toEqual(['ok\r\n']);
        make({ homingMs: 100 });
        const quick = send(sim, '$H');
        jest.advanceTimersByTime(150);
        expect(quick).toEqual(['ok\r\n']);
    });
});

const pause = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

describe('LUNYEE profile of the TCP server', () => {
    let server;
    beforeEach(async () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        server = new GrblServer(0, { host: '127.0.0.1', profile: 'lunyee' });
        server.start();
        while (!server.server.listening) {
            // eslint-disable-next-line no-await-in-loop
            await pause(5);
        }
    });
    afterEach(async () => {
        await new Promise((resolve) => {
            server.close(resolve);
        });
        console.log.mockRestore();
    });

    it('L14 a connection gets no banner: the version is known only from $I', async () => {
        const grbl = await new Promise((resolve) => {
            const s = net.connect(server.port, '127.0.0.1', () => resolve(s));
        });
        let received = '';
        grbl.on('data', (d) => {
            received += d.toString();
        });
        await pause(150);
        expect(received).toBe('');
        grbl.write('$I\n');
        const end = Date.now() + 2000;
        while (!received.includes('ok') && Date.now() < end) {
            // eslint-disable-next-line no-await-in-loop
            await pause(10);
        }
        expect(received).toBe('[VER:1.1f.20231030:]\r\n[OPT:PHSW]\r\nok\r\n');
        grbl.destroy();
        // The server logs the disconnection: wait for it before the log spy is restored.
        while (server.clients.size > 0) {
            // eslint-disable-next-line no-await-in-loop
            await pause(10);
        }
    });
});
