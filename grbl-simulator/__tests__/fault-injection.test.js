/**
 * Fault injection for the rehearsals: limit switch, probe contact, probe miss,
 * silent and cut link (simulator and TCP control channel).
 */

const net = require('net');
const GrblSimulator = require('../grbl-simulator');
const GrblServer = require('../grbl-server');

const collect = (sim) => {
    const out = [];
    sim.on('data', (d) => out.push(d));
    return out;
};

describe('Fault injection - limit switch (fake timers)', () => {
    let sim;
    beforeEach(() => {
        jest.useFakeTimers();
        sim = new GrblSimulator();
    });
    afterEach(() => {
        sim.stopPlannerExecutor();
        jest.useRealTimers();
    });

    it('only shows Pn:X when hard limits are off ($21=0)', () => {
        const out = collect(sim);
        expect(sim.setLimitPin('x', true)).toBe(false);
        expect(sim.machineState).toBe('Idle');
        expect(sim.processRealtimeCommand('?')).toMatch(/\|Pn:X>/);
        expect(out).toEqual([]);
    });

    it('raises ALARM:1 mid-move, then hears only Ctrl-X, and restarts in Alarm', () => {
        sim.settings[21] = 1;
        const out = collect(sim);
        sim.processLine('G1 X10 F600');
        jest.advanceTimersByTime(100);
        expect(sim.machineState).toBe('Run');

        expect(sim.setLimitPin('X', true)).toBe(true);
        expect(out.join('')).toBe('ALARM:1\r\n[MSG:Reset to continue]\r\n');
        expect(sim.machineState).toBe('Alarm');
        expect(sim.alarmCode).toBe(1);
        expect(sim.motionState.active).toBe(false);
        // Stopped where it was (10 mm at 600 mm/min = 1 s; 100 ms in), kept through the reset below.
        const stopped = sim.machinePosition.x;
        expect(stopped).toBeGreaterThan(0.5);
        expect(stopped).toBeLessThan(1.5);

        // Critical event: no status report, no answer to a line.
        expect(sim.processRealtimeCommand('?')).toBe('');
        const answers = [];
        sim.processLineAsync('$X', (r) => answers.push(r));
        jest.advanceTimersByTime(100);
        expect(answers).toEqual([]);

        // Reset: startup banner then the unlock request, still in Alarm with the pin shown.
        expect(sim.processRealtimeCommand('\x18')).toBe("\r\nGrbl 1.1h ['$' for help]\r\n[MSG:'$H'|'$X' to unlock]\r\n");
        expect(sim.machineState).toBe('Alarm');
        expect(sim.machinePosition.x).toBe(stopped);
        expect(sim.processRealtimeCommand('?')).toMatch(/^<Alarm\|.*\|Pn:X>/);
        expect(sim.processLine('G0 X1')).toBe('error:8\r\n');

        // $X unlocks; releasing the switch afterwards is a pin change too: ALARM:1 again.
        expect(sim.processLine('$X')).toBe('[MSG:Caution: Unlocked]\r\nok\r\n');
        expect(sim.machineState).toBe('Idle');
        expect(sim.setLimitPin('x', false)).toBe(true);
        expect(sim.machineState).toBe('Alarm');
    });

    it('a dwell answered after a critical alarm or a reset is dropped (phase 7)', () => {
        sim.settings[21] = 1;
        const answers = [];
        sim.processLineAsync('G4 P0.04', (r) => answers.push(r));
        jest.advanceTimersByTime(10);
        expect(sim.setLimitPin('x', true)).toBe(true);
        jest.advanceTimersByTime(200);
        expect(answers).toEqual([]);
        sim.processRealtimeCommand('\x18');
        sim.processLine('$X');
        // Reset during a dwell: no late 'ok' either.
        sim.processLineAsync('G4 P0.04', (r) => answers.push(r));
        jest.advanceTimersByTime(10);
        sim.processRealtimeCommand('\x18');
        jest.advanceTimersByTime(200);
        expect(answers).toEqual([]);
        // A dwell left alone is still answered.
        sim.processLine('$X');
        sim.processLineAsync('G4 P0.04', (r) => answers.push(r));
        jest.advanceTimersByTime(200);
        expect(answers).toEqual(['ok\r\n']);
    });

    it('ignores a pin change in Alarm or during the homing cycle', () => {
        sim.settings[21] = 1;
        sim.settings[22] = 1;
        sim.triggerAlarm(3);
        expect(sim.setLimitPin('y', true)).toBe(false);
        expect(sim.criticalAlarm).toBe(false);
        sim.processLine('$X');
        sim.setLimitPin('y', false);
        expect(sim.machineState).toBe('Alarm');
        sim.processRealtimeCommand('\x18');
        sim.processLine('$X');
        sim.processLine('$H');
        jest.advanceTimersByTime(20);
        expect(sim.machineState).toBe('Home');
        expect(sim.setLimitPin('z', true)).toBe(false);
        expect(sim.machineState).toBe('Home');
    });

    it('rejects an unknown pin', () => {
        expect(() => sim.setLimitPin('a', true)).toThrow('unknown limit pin');
    });
});

describe('Fault injection - probe (fake timers)', () => {
    let sim;
    beforeEach(() => {
        jest.useFakeTimers();
        sim = new GrblSimulator();
    });
    afterEach(() => {
        sim.stopPlannerExecutor();
        jest.useRealTimers();
    });

    it('contact already made: Pn:P, G38.2 gives ALARM:4 then ok, no move', () => {
        sim.probeTriggered = true;
        expect(sim.processRealtimeCommand('?')).toMatch(/\|Pn:P>/);
        expect(sim.processLine('G38.2 Z-10 F100')).toBe('ALARM:4\r\nok\r\n');
        expect(sim.machineState).toBe('Alarm');
        expect(sim.alarmCode).toBe(4);
        expect(sim.plannerBuffer.queue.length).toBe(0);
    });

    it('contact mode (default) still succeeds with [PRB:...:1]', () => {
        const out = collect(sim);
        expect(sim.processLine('G38.2 Z-10 F600')).toBe('ok\r\n');
        jest.advanceTimersByTime(2000);
        expect(out.join('')).toMatch(/^\[PRB:0\.000,0\.000,-[\d.]+:1\]\r\n$/);
        expect(sim.machineState).toBe('Idle');
    });

    it('miss mode: G38.2 travels the whole move then ALARM:5 and [PRB:...:0]', () => {
        sim.probeMode = 'miss';
        const out = collect(sim);
        sim.processLine('G38.2 Z-5 F600');
        jest.advanceTimersByTime(300);
        expect(sim.machineState).toBe('Run');
        jest.advanceTimersByTime(600);
        expect(out.join('')).toBe('ALARM:5\r\n[PRB:0.000,0.000,0.000:0]\r\n');
        expect(sim.machineState).toBe('Alarm');
        expect(sim.alarmCode).toBe(5);
        expect(sim.machinePosition.z).toBeCloseTo(-5, 6);
        expect(sim.probeSuccess).toBe(false);
    });

    it('contact already made behind queued moves: the moves end first, then ALARM:4 (phase 7)', () => {
        const out = collect(sim);
        sim.processLine('G1 X10 F600');
        sim.probeTriggered = true;
        sim.processLine('G38.2 Z-5 F100');
        jest.advanceTimersByTime(500);
        expect(sim.machineState).toBe('Run');
        expect(out).toEqual([]);
        jest.advanceTimersByTime(700);
        expect(out.join('')).toBe('ALARM:4\r\n');
        expect(sim.machineState).toBe('Alarm');
        expect(sim.alarmCode).toBe(4);
        expect(sim.machinePosition.x).toBeCloseTo(10, 6);
        expect(sim.machinePosition.z).toBeCloseTo(0, 6);
        expect(sim.plannerBuffer.queue.length).toBe(0);
    });

    it('free probe behind queued moves: the probe runs after them (phase 7)', () => {
        const out = collect(sim);
        sim.processLine('G1 X10 F600');
        sim.processLine('G38.2 Z-10 F600');
        jest.advanceTimersByTime(4000);
        expect(out.join('')).toMatch(/^\[PRB:10\.000,0\.000,-[\d.]+:1\]\r\n$/);
        expect(sim.machineState).toBe('Idle');
    });

    it('[PRB] is in machine coordinates, with work offsets (phase 7)', () => {
        const out = collect(sim);
        sim.processLine('G10 L2 P1 Z10');
        sim.probeMode = 'miss';
        sim.processLine('G38.3 Z-5 F600');
        jest.advanceTimersByTime(1000);
        // Work Z-5 with G54 Z10 is machine Z5.
        expect(sim.machinePosition.z).toBeCloseTo(5, 6);
        expect(out.join('')).toBe('[PRB:0.000,0.000,5.000:0]\r\n');
        out.length = 0;
        sim.probeMode = 'contact';
        sim.processLine('G38.2 Z-20 F600');
        jest.advanceTimersByTime(3000);
        const z = Number(/^\[PRB:[-\d.]+,[-\d.]+,([-\d.]+):1\]/.exec(out.join(''))[1]);
        expect(z).toBeCloseTo(sim.machinePosition.z, 3);
        expect(z).toBeGreaterThan(-4);
    });

    it('miss mode: G38.3 ends without alarm, [PRB:<end>:0]', () => {
        sim.probeMode = 'miss';
        const out = collect(sim);
        sim.processLine('G38.3 Z-2 F600');
        jest.advanceTimersByTime(400);
        expect(out.join('')).toBe('[PRB:0.000,0.000,-2.000:0]\r\n');
        expect(sim.machineState).toBe('Idle');
    });
});

describe('Fault injection - TCP control channel', () => {
    let server;
    const started = () => new Promise((resolve) => {
        const wait = () => (server.server.listening && server.controlServer.listening ? resolve() : setTimeout(wait, 5));
        wait();
    });
    const connect = (port) => new Promise((resolve) => {
        const s = net.connect(port, '127.0.0.1', () => resolve(s));
        s.received = '';
        s.on('data', (d) => {
            s.received += d.toString();
        });
    });
    const control = async (line) => {
        const s = await connect(server.controlPort);
        const answer = await new Promise((resolve) => {
            let buf = '';
            s.on('data', (d) => {
                buf += d.toString();
                if (buf.includes('\n')) resolve(JSON.parse(buf));
            });
            s.write(line + '\n');
        });
        s.destroy();
        return answer;
    };
    const until = (check) => new Promise((resolve, reject) => {
        const end = Date.now() + 2000;
        const poll = () => {
            if (check()) resolve();
            else if (Date.now() > end) reject(new Error('timeout'));
            else setTimeout(poll, 10);
        };
        poll();
    });

    beforeEach(async () => {
        server = new GrblServer(0, { host: '127.0.0.1', controlPort: 0 });
        jest.spyOn(console, 'log').mockImplementation(() => {});
        server.start();
        await started();
    });
    afterEach(async () => {
        await new Promise((resolve) => server.close(resolve));
        console.log.mockRestore();
    });

    it('listens on 127.0.0.1 only when asked', () => {
        expect(server.server.address().address).toBe('127.0.0.1');
        expect(server.controlServer.address().address).toBe('127.0.0.1');
    });

    it('injects a limit switch: the Grbl client receives ALARM:1', async () => {
        const grbl = await connect(server.port);
        await until(() => grbl.received.includes('Grbl 1.1h'));
        grbl.write('$21=1\n');
        await until(() => grbl.received.includes('ok'));
        const answer = await control('limit x on');
        expect(answer).toEqual(expect.objectContaining({ ok: true, alarm: true, state: 'Alarm', alarmCode: 1, pins: 'X', clients: 1, hardLimits: 1 }));
        await until(() => grbl.received.includes('ALARM:1\r\n[MSG:Reset to continue]'));
        grbl.destroy();
    });

    it('sets the probe pin and the probe mode, refuses bad commands', async () => {
        expect(await control('probe on')).toEqual(expect.objectContaining({ ok: true, pins: 'P' }));
        expect(await control('probe-mode miss')).toEqual(expect.objectContaining({ ok: true, probeMode: 'miss' }));
        expect(await control('probe maybe')).toEqual({ ok: false, error: 'expected on|off' });
        expect(await control('reboot')).toEqual({ ok: false, error: 'unknown command: reboot' });
    });

    it('mute keeps the connection but answers nothing; drop closes it', async () => {
        const grbl = await connect(server.port);
        await until(() => grbl.received.includes('Grbl 1.1h'));
        expect(await control('mute on')).toEqual(expect.objectContaining({ ok: true, muted: true }));
        grbl.received = '';
        grbl.write('?');
        grbl.write('$$\n');
        await new Promise((r) => setTimeout(r, 150));
        expect(grbl.received).toBe('');
        await control('mute off');
        grbl.write('?');
        await until(() => grbl.received.includes('<Idle'));

        const closed = new Promise((resolve) => grbl.on('close', resolve));
        expect(await control('drop')).toEqual(expect.objectContaining({ ok: true }));
        await closed;
        await until(() => server.clients.size === 0);
    });
});
