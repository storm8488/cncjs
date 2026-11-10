#!/bin/bash
# Surface Pro — simulateur Grbl (127.0.0.1:5000, contrôle 127.0.0.1:5001) et pont /tmp/ttyGRBL.
# Usage (sur la Surface, depuis /tmp/sim-surface) :
#   bash sim.sh start | stop | status
#   bash sim.sh ctl <commande>     injection : limit x on|off, probe on|off, probe-mode contact|miss,
#                                  mute on|off, drop, state
#   bash sim.sh unplug | replug    pont tué (câble débranché) | pont relancé (simulateur intact)
set -u
D=/tmp/sim-surface
NODE=/home/pi/node22/bin/node
cd "$D" || exit 1

ctl() {
  python3 -I -c '
import socket, sys
s = socket.create_connection(("127.0.0.1", 5001), timeout=5)
s.sendall((" ".join(sys.argv[1:]) + "\n").encode())
buf = b""
while not buf.endswith(b"\n"):
    d = s.recv(4096)
    if not d: break
    buf += d
print(buf.decode().strip())
' "$@"
}

bridge_start() {
  pgrep -f "[b]ridge.py 5000" >/dev/null && { echo "pont déjà lancé"; return 0; }
  nohup python3 -I "$D/bridge.py" 5000 >>"$D/bridge.log" 2>&1 &
  for _ in $(seq 1 30); do [ -L /tmp/ttyGRBL ] && { echo "pont : /tmp/ttyGRBL -> $(readlink /tmp/ttyGRBL)"; return 0; }; sleep 0.2; done
  echo "pont : échec (voir $D/bridge.log)"; return 1
}

bridge_stop() {
  pkill -TERM -f "[b]ridge.py 5000" && sleep 0.5
  pkill -KILL -f "[b]ridge.py 5000" 2>/dev/null
  [ -L /tmp/ttyGRBL ] && rm -f /tmp/ttyGRBL
  return 0
}

case "${1:-}" in
  start)
    bash "$D/guard.sh" || exit 1
    if pgrep -f "[g]rbl-server.js 5000" >/dev/null; then
      echo "simulateur déjà lancé"
    else
      nohup "$NODE" "$D/grbl-simulator/grbl-server.js" 5000 --host 127.0.0.1 --control 5001 >"$D/grbl.log" 2>&1 &
      for _ in $(seq 1 30); do ctl state >/dev/null 2>&1 && break; sleep 0.2; done
      ctl state >/dev/null 2>&1 || { echo "simulateur : échec (voir $D/grbl.log)"; exit 1; }
      echo "simulateur : 127.0.0.1:5000, contrôle 127.0.0.1:5001"
    fi
    bridge_start
    ;;
  stop)
    bridge_stop
    pkill -INT -f "[g]rbl-server.js 5000" && sleep 1
    pkill -KILL -f "[g]rbl-server.js 5000" 2>/dev/null
    echo "simulateur et pont arrêtés"
    ;;
  ctl) shift; ctl "$@" ;;
  unplug) bridge_stop; echo "pont arrêté : /tmp/ttyGRBL débranché" ;;
  replug) bridge_start ;;
  status)
    pgrep -af "[g]rbl-server.js 5000|[b]ridge.py 5000" || echo "aucun processus du simulateur"
    ls -l /tmp/ttyGRBL 2>/dev/null || echo "/tmp/ttyGRBL absent"
    ctl state 2>/dev/null || true
    ;;
  *) echo "usage : sim.sh start|stop|status|ctl <commande>|unplug|replug"; exit 2 ;;
esac
