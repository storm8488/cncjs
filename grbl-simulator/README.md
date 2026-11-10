# Grbl Simulator

A Grbl v1.1 CNC controller simulator with TCP socket server for testing CNC software without physical hardware.

## Quick Start

```bash
# Start server (default port: 3000)
node grbl-server.js

# Or specify a port
node grbl-server.js 8080

# Connect with telnet
telnet localhost 3000
```

## Usage with CNCjs

```bash
# Automatically finds an available port and creates virtual serial port
./start-with-cncjs.sh

# Connect cncjs to virtual serial port
cncjs -p /tmp/ttyGRBL
```

Or add to `~/.cncrc`:
```json
{
  "ports": [{ "path": "/tmp/ttyGRBL", "manufacturer": "Grbl Simulator" }]
}
```

## Features

- **Grbl v1.1 Protocol** - Real-time commands (`?`, `!`, `~`, `Ctrl-X`), system commands (`$$`, `$#`, `$G`, `$H`, `$X`, `$J`)
- **G-code Support** - G0/G1 linear, G2/G3 arcs, G10/G92 offsets, G20/G21 units, G90/G91 modes
- **Position Tracking** - Real-time interpolation during motion
- **State Machine** - Idle, Run, Hold, Jog, Alarm, Door, Check, Home, Sleep
- **Coordinate Systems** - MPos, WPos, G54-G59 offsets
- **40+ Settings** - Configurable via `$x=value`

## Commands

| Command | Description |
|---------|-------------|
| `?` | Status report |
| `!` | Feed hold |
| `~` | Cycle resume |
| `Ctrl-X` | Soft reset |
| `$$` | View settings |
| `$#` | View parameters |
| `$G` | Parser state |
| `$H` | Homing cycle |
| `$X` | Kill alarm |
| `$J=X10 F500` | Jog command |

## Fault injection

`node grbl-server.js 5000 --host 127.0.0.1 --control 5001` opens a control channel on
127.0.0.1:5001: one command per line, one JSON line back (state, pins, alarm).

| Command | Effect (as Grbl 1.1) |
|---------|----------------------|
| `limit x on` / `limit x off` | Limit pin (`Pn:X`). With `$21=1`, outside Alarm and homing, any change raises `ALARM:1` + `[MSG:Reset to continue]`; then only Ctrl-X is heard (no status report, no `ok`), and the reset restarts in Alarm with `[MSG:'$H'\|'$X' to unlock]`. Releasing the switch after `$X` raises `ALARM:1` again (pin-change interrupt, no debounce): release it before `$X`. |
| `probe on` / `probe off` | Probe contact (`Pn:P`); G38.2 then gives `ALARM:4` then `ok`, no move. |
| `probe-mode miss` / `probe-mode contact` | G38.x travels the whole move without contact: G38.2 ends in `ALARM:5` + `[PRB:...:0]`, G38.3 in `[PRB:<end>:0]`. Default `contact`. |
| `mute on` / `mute off` | Silent link: nothing read or written, connection kept. |
| `drop` | Link cut: every client connection is closed. |
| `state` | State only. |

Known differences: `ok` for `$H` and G38.x comes when queued (real Grbl: at the end); G-code in Alarm answers `error:8` (real Grbl 1.1: `error:9`); reconnecting does not reboot the simulator (an Arduino reboots on DTR).

## References

- [Grbl GitHub Repository](https://github.com/gnea/grbl)
- [Grbl v1.1 Wiki](https://github.com/gnea/grbl/wiki)

## License

MIT
