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

## LUNYEE profile

`new GrblSimulator({ profile: 'lunyee' })`, or `node grbl-server.js 5000 --profile lunyee`: the
operator's LUNYEE 4040 (Grbl_Esp32 binary `1.1f.20231030`), with the facts seen on the real board
(`examples/cncjs-touch/design/refonte/PLAN-CORRECTIONS.md` § 2.1, `FIRMWARE.md`). Without it,
nothing changes.

| | Behaviour |
|---|---|
| L1 | `$6=1`, `$10=1`, `$13=0`, `$20=1`, `$21=1`, `$22=1`, `$23=3`, `$27=2`, `$30=1000`, `$110-112` 4000 / 4000 / 800, `$130-132` 408 / 396 / 130; `[VER:1.1f.20231030:]`, `[OPT:PHSW]` |
| L2 | Start and every restart: Alarm (`$22=1`), MPos 0,0,0, not homed |
| L3 | `$H`: state `Home` while it runs (`homeReports: false`: no status report meanwhile), `ok` at its end, MPos 0,0,0 |
| L4 | `$HX`, `$HY`, `$HZ` run the whole cycle |
| L5 | After a homing, `WCO:0,0,0` reported while `$#` keeps the stored offset; the moves use a zero offset too (`executedAfterHoming: 'stored'`: the stored one). Loaded again by another coordinate system, `G10 L2/L20` on the active one, a reset, `M2`/`M30`; `G54` again does nothing |
| L6 | Soft limits checked when the line is read, on the machine target of `G0`, `G1`, `G38.x` and points of an arc: X and Y in `[0, travel]`, Z in `[-travel, 0]` (`$23` bit), the far end refused 0.2 mm early (`softLimitInset`). `$J=` beyond: `error:15`, no alarm |
| L7 | Beyond: `ALARM:2`, no move, then the board restarts (banner, L2), the stored offset loaded |
| L8 | Limit switch (`$21=1`): `ALARM:1`, then the same restart |
| L9 | Reset in motion (a held motion included): `ALARM:3`, restart, MPos 0. At rest: position kept (`resetAtRest: 'restart'`: restart) |
| L10 | `probeStuck`: `Pn:P` always, `G38.2`/`G38.3` raise `ALARM:4`. A probe touches only when its move crosses the simulated surface (machine Z about -3) going down: otherwise `G38.3` gives `[PRB:<end>:0]`, `G38.2` `ALARM:5` |
| L11 | MPos, no `Bf:`; `WCO:` one report in ten in every state, and at the report after a change |
| L12 | `FS:` spindle speed capped at `$30` (`$G` keeps the programmed `S`) |
| L13 | `$#`, `$I`, `$N` answer in Idle and Alarm, `error:8` in Run, Hold, Jog; `$$` refused in Run and Hold |
| L14 | The TCP server sends no banner on a connection: the version is known from `$I` |
| L15 | The homing cycle lasts `homingMs` (1500 ms by default) |

Also in this profile only: `G53` (machine coordinates for the line), `G10 L20` and `P0`. Not
modelled: four axes in the reports, the board's Wi-Fi.

## References

- [Grbl GitHub Repository](https://github.com/gnea/grbl)
- [Grbl v1.1 Wiki](https://github.com/gnea/grbl/wiki)

## License

MIT
