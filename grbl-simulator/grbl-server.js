#!/usr/bin/env node

/**
 * Grbl Simulator TCP Server
 * A TCP socket server that simulates a Grbl CNC controller
 * Usage: node grbl-server.js [port]
 */

const net = require('net');
const GrblSimulator = require('./grbl-simulator');

const defaultPort = 5000;

class GrblServer {
    constructor(port = defaultPort, options = {}) {
        this.port = port;
        // Listen address of the Grbl port (all interfaces unless given, as before).
        this.host = options.host;
        // Fault-injection control port (always 127.0.0.1), off unless given.
        this.controlPort = options.controlPort;
        this.controlServer = null;
        // Injected silent link: nothing is read from or written to the client.
        this.muted = false;
        this.server = null;
        this.clients = new Map();
        // IMPORTANT: Single shared simulator for all clients
        // This ensures position and state persist across connections
        this.simulator = new GrblSimulator();
    }

    start() {
        this.server = net.createServer((socket) => {
            this.handleConnection(socket);
        });

        this.server.listen(this.port, this.host, () => {
            this.port = this.server.address().port;
            console.log(`Listening on port ${this.port}`);
        });

        if (this.controlPort !== undefined) {
            this.startControl();
        }

        this.server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`Error: Port ${this.port} is already in use`);
                process.exit(1);
            } else {
                console.error('Server error:', err);
            }
        });

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\nShutting down server...');
            this.stop();
        });
    }

    handleConnection(socket) {
        const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
        console.log(`[${new Date().toISOString()}] Client connected: ${clientId}`);

        // Use the shared simulator instance (not a new one per client!)
        // This ensures position and state persist across connections
        const simulator = this.simulator;

        // Store client info
        this.clients.set(socket, {
            id: clientId,
            simulator: simulator,
            buffer: '',
            dataListener: null
        });

        // Listen for async data from simulator (e.g., PRB responses)
        const dataListener = (data) => {
            if (this.muted) return;
            socket.write(data);
            console.log(`[${clientId}] ASYNC: ${this.escapeString(data)}`);
        };
        simulator.on('data', dataListener);
        this.clients.get(socket).dataListener = dataListener;

        // Send startup message
        if (!this.muted) socket.write(simulator.getStartupMessage());

        // Handle incoming data
        socket.on('data', (data) => {
            this.handleData(socket, data);
        });

        // Handle client disconnect
        socket.on('close', () => {
            console.log(`[${new Date().toISOString()}] Client disconnected: ${clientId}`);
            const client = this.clients.get(socket);
            if (client && client.dataListener) {
                // Clean up event listener to prevent memory leaks
                const listeners = simulator._eventListeners?.data || [];
                const index = listeners.indexOf(client.dataListener);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            }
            this.clients.delete(socket);
        });

        // Handle errors
        socket.on('error', (err) => {
            console.error(`[${new Date().toISOString()}] Socket error for ${clientId}:`, err.message);
            this.clients.delete(socket);
        });
    }

    handleData(socket, data) {
        const client = this.clients.get(socket);
        if (!client || this.muted) return;

        const { simulator } = client;
        const input = data.toString();

        // Process character by character for real-time commands
        for (let i = 0; i < input.length; i++) {
            const char = input[i];
            const code = char.charCodeAt(0);

            // Check for real-time commands
            // Single character commands: ?, !, ~, Ctrl-X
            // Extended real-time commands: 0x80-0xFF (includes jog cancel, feed/rapid/spindle overrides)
            const isRealtimeCommand = char === '?' || char === '!' || char === '~' || char === '\x18' ||
                                      (code >= 0x80 && code <= 0xFF);

            if (isRealtimeCommand) {
                const response = simulator.processRealtimeCommand(char);
                if (response && !this.muted) {
                    socket.write(response);
                    console.log(`[${client.id}] RT: ${this.escapeChar(char)} -> ${this.escapeString(response)}`);
                }
                continue;
            }

            // Accumulate line-based commands
            if (char === '\n' || char === '\r') {
                if (client.buffer.length > 0) {
                    // Process complete line
                    const line = client.buffer.trim();
                    if (line) {
                        // Process line and wait for completion (simple send-response protocol)
                        simulator.processLineAsync(line, (response) => {
                            if (this.muted) return;
                            socket.write(response);
                            console.log(`[${client.id}] CMD: ${line} -> ${this.escapeString(response)}`);
                        });
                    }
                    client.buffer = '';
                }
            } else {
                client.buffer += char;
            }
        }
    }

    escapeChar(char) {
        const code = char.charCodeAt(0);
        if (code === 0x18) return 'Ctrl-X';
        if (code === 0x85) return 'JogCancel';
        // Feed override commands
        if (code === 0x90) return 'FeedReset';
        if (code === 0x91) return 'Feed+10%';
        if (code === 0x92) return 'Feed-10%';
        if (code === 0x93) return 'Feed+1%';
        if (code === 0x94) return 'Feed-1%';
        // Rapid override commands
        if (code === 0x95) return 'Rapid100%';
        if (code === 0x96) return 'Rapid50%';
        if (code === 0x97) return 'Rapid25%';
        // Spindle override commands
        if (code === 0x99) return 'SpindleReset';
        if (code === 0x9A) return 'Spindle+10%';
        if (code === 0x9B) return 'Spindle-10%';
        if (code === 0x9C) return 'Spindle+1%';
        if (code === 0x9D) return 'Spindle-1%';
        if (code === 0x9E) return 'SpindleStop';
        if (code < 32 || code >= 0x80) return `0x${code.toString(16).toUpperCase()}`;
        return char;
    }

    escapeString(str) {
        return str
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n')
            .trim()
            .substring(0, 100); // Limit length for logging
    }

    /**
     * Fault-injection control channel: one command per line on 127.0.0.1, one JSON line back.
     *   limit <x|y|z> <on|off>   limit switch (ALARM:1 when $21=1, see setLimitPin)
     *   probe <on|off>           probe contact pin (Pn:P; G38.2 then fails with ALARM:4)
     *   probe-mode <contact|miss> G38.x touches, or travels without contact (ALARM:5 for G38.2)
     *   mute <on|off>            silent link: nothing read nor written, connection kept
     *   drop                     link cut: every Grbl client connection is destroyed
     *   state                    current state, without change
     */
    startControl() {
        this.controlServer = net.createServer((socket) => {
            let buffer = '';
            socket.on('data', (data) => {
                buffer += data.toString();
                let i;
                while ((i = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, i).trim();
                    buffer = buffer.slice(i + 1);
                    if (line) socket.write(JSON.stringify(this.control(line)) + '\n');
                }
            });
            socket.on('error', () => {});
        });
        this.controlServer.listen(this.controlPort, '127.0.0.1', () => {
            this.controlPort = this.controlServer.address().port;
            console.log(`Control on 127.0.0.1:${this.controlPort}`);
        });
    }

    control(line) {
        const sim = this.simulator;
        const [cmd, arg, value] = line.toLowerCase().split(/\s+/);
        const onOff = (v) => {
            if (v !== 'on' && v !== 'off') throw new Error('expected on|off');
            return v === 'on';
        };
        try {
            let alarm = false;
            if (cmd === 'limit') {
                alarm = sim.setLimitPin(arg, onOff(value));
            } else if (cmd === 'probe') {
                sim.probeTriggered = onOff(arg);
            } else if (cmd === 'probe-mode') {
                if (arg !== 'contact' && arg !== 'miss') throw new Error('expected contact|miss');
                sim.probeMode = arg;
            } else if (cmd === 'mute') {
                this.muted = onOff(arg);
            } else if (cmd === 'drop') {
                for (const socket of this.clients.keys()) socket.destroy();
            } else if (cmd !== 'state') {
                throw new Error(`unknown command: ${cmd}`);
            }
            console.log(`[${new Date().toISOString()}] CONTROL: ${line}`);
            return {
                ok: true,
                alarm,
                state: sim.machineState,
                alarmCode: sim.alarmCode,
                pins: sim.getInputPinStateString(),
                probeMode: sim.probeMode,
                muted: this.muted,
                clients: this.clients.size,
                hardLimits: sim.settings[21],
                homing: sim.settings[22]
            };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    /**
     * Close the servers and the client connections without exiting the process (tests).
     */
    close(callback) {
        for (const socket of this.clients.keys()) socket.destroy();
        if (this.controlServer) this.controlServer.close();
        this.simulator.stopPlannerExecutor();
        this.server.close(callback);
    }

    stop() {
        if (this.server) {
            // Close all client connections
            for (const [socket, client] of this.clients.entries()) {
                console.log(`Closing connection to ${client.id}`);
                socket.end();
            }

            // Close server
            this.server.close(() => {
                console.log('Server stopped');
                process.exit(0);
            });

            // Force exit after 2 seconds
            setTimeout(() => {
                console.log('Forcing exit');
                process.exit(0);
            }, 2000);
        } else {
            process.exit(0);
        }
    }
}

// CLI entry point
if (require.main === module) {
    // node grbl-server.js [port] [--host 127.0.0.1] [--control 5001]
    const args = process.argv.slice(2);
    const option = (name) => {
        const i = args.indexOf(name);
        return i >= 0 ? args[i + 1] : undefined;
    };
    const port = parseInt(args[0]) || defaultPort;
    const control = option('--control');

    console.log('Grbl Simulator - TCP Server');

    const server = new GrblServer(port, {
        host: option('--host'),
        controlPort: control === undefined ? undefined : parseInt(control)
    });
    server.start();
}

module.exports = GrblServer;
