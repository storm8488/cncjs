#!/bin/bash
# PC (Git Bash) — séance d'essai sur la Surface Pro avec le Grbl SIMULÉ. Point d'entrée unique.
#   bash surface.sh push                 copie simulateur + scripts dans /tmp/sim-surface (Surface)
#   bash surface.sh guard                garde-fou : aucun port série réel, aucun contrôleur réel
#   bash surface.sh sim start|stop|status|unplug|replug
#   bash surface.sh ctl <commande>       injection : limit x on|off, probe on|off, probe-mode contact|miss,
#                                        mute on|off, drop, state
#   bash surface.sh port <commande> ...  open, prepare, send '<ligne>', cmd <nom>, state, watch <s>,
#                                        machine-cnc, machine-forget, close, clean
#   bash surface.sh chrome start [url]|stop|status   fenêtre de test (profil /tmp/cnc-measure-v2, 9230)
#   bash surface.sh tunnel open|close    tunnel PC 127.0.0.1:19230 -> Surface 127.0.0.1:9230 (cdp.mjs)
#   bash surface.sh endurance start [h]|status|stop   endurance détachée (24 h max), CSV dans
#                                        /home/pi/endurance/<date>/samples.csv (lien « latest »)
#   bash surface.sh clean                fin de séance complète, puis vérification
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../../../.." && pwd)
H=pi@192.168.1.29
SSHOPT=(-i "$HOME/.ssh/id_ed25519_surface_pro" -o IdentitiesOnly=yes -o UserKnownHostsFile="$HOME/.ssh/known_hosts_surface_cnc" -o BatchMode=yes -o ConnectTimeout=10)
D=/tmp/sim-surface
NODE=/home/pi/node22/bin/node
PIDFILE="${TMP:-/tmp}/sim-surface-tunnel.pid"

remote() { ssh "${SSHOPT[@]}" "$H" "$(printf '%q ' "$@")"; }

tunnel() {
  case "$1" in
    open)
      if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then echo "tunnel déjà ouvert"; return 0; fi
      ssh "${SSHOPT[@]}" -o ExitOnForwardFailure=yes -N -L 127.0.0.1:19230:127.0.0.1:9230 "$H" &
      echo $! >"$PIDFILE"
      for _ in $(seq 1 20); do curl -s -o /dev/null http://127.0.0.1:19230/json && { echo "tunnel 19230 ouvert"; return 0; }; sleep 0.5; done
      echo "tunnel ouvert (fenêtre de test pas encore joignable)"
      ;;
    close)
      if [ -f "$PIDFILE" ]; then kill "$(cat "$PIDFILE")" 2>/dev/null; rm -f "$PIDFILE"; fi
      echo "tunnel fermé"
      ;;
  esac
}

case "${1:-}" in
  push)
    remote mkdir -p "$D/grbl-simulator"
    scp "${SSHOPT[@]}" -q "$REPO/grbl-simulator/grbl-server.js" "$REPO/grbl-simulator/grbl-simulator.js" "$REPO/grbl-simulator/package.json" "$H:$D/grbl-simulator/"
    scp "${SSHOPT[@]}" -q "$HERE/guard.sh" "$HERE/sim.sh" "$HERE/bridge.py" "$HERE/port.cjs" "$HERE/chrome.sh" "$HERE/endurance.cjs" "$H:$D/"
    echo "copié dans $H:$D"
    ;;
  guard) remote bash "$D/guard.sh" ;;
  sim) shift; remote bash "$D/sim.sh" "$@" ;;
  ctl) shift; remote bash "$D/sim.sh" ctl "$@" ;;
  port) shift; remote "$NODE" "$D/port.cjs" "$@" ;;
  chrome) shift; remote bash "$D/chrome.sh" "$@" ;;
  tunnel) tunnel "${2:-}" ;;
  endurance)
    case "${2:-}" in
      start)
        # Simulator running, /tmp/ttyGRBL open and prepared ($X done), machine profile declared.
        remote bash "$D/guard.sh" || exit 1
        remote bash -c '
          pgrep -f "^[^ ]*node [^ ]*endurance[.]cjs" >/dev/null && { echo "endurance déjà lancée"; exit 1; }
          dir=/home/pi/endurance/$(date +%Y%m%d-%H%M); mkdir -p "$dir"; ln -sfn "$dir" /home/pi/endurance/latest
          setsid nohup '"$NODE"' '"$D"'/endurance.cjs "$dir" '"${3:-24}"' </dev/null >>"$dir/run.log" 2>&1 &
          sleep 3; pgrep -af "^[^ ]*node [^ ]*endurance[.]cjs"; echo "dossier : $dir"; cat "$dir/events.log" "$dir/run.log" 2>/dev/null'
        ;;
      status)
        remote bash -c 'pgrep -af "^[^ ]*node [^ ]*endurance[.]cjs" || echo "endurance arrêtée"; d=/home/pi/endurance/latest; readlink -f $d;
          tail -n 3 $d/samples.csv; echo "--- événements"; tail -n 5 $d/events.log'
        ;;
      stop) remote bash -c 'touch /home/pi/endurance/latest/STOP; echo "arrêt demandé (sous 5 s)"' ;;
      *) echo "usage : surface.sh endurance start [heures]|status|stop"; exit 2 ;;
    esac
    ;;
  clean)
    failed=0
    remote "$NODE" "$D/port.cjs" clean || failed=1
    remote bash "$D/chrome.sh" stop
    remote bash "$D/sim.sh" stop
    tunnel close
    # Vérification : rien ne reste (processus, lien, profil, fiche, port dans .cncrc).
    # Sortie 1 tant qu'il reste une trace : « nettoyage vérifié » seulement sans reste.
    remote bash -c '
      rest=0
      left=$(pgrep -af "[g]rbl-server.js 5000|[b]ridge.py 5000|[u]ser-data-dir=/tmp/cnc-measure-v2")
      [ -n "$left" ] && { echo "RESTE : $left"; rest=1; }
      if [ -e /tmp/ttyGRBL ] || [ -L /tmp/ttyGRBL ]; then echo "RESTE : /tmp/ttyGRBL"; rest=1; fi
      [ -d /tmp/cnc-measure-v2 ] && { echo "RESTE : profil /tmp/cnc-measure-v2"; rest=1; }
      n=$(grep -c -e "ttyGRBL" -e "Simulateur Grbl" "$HOME/.cncrc")
      [ "$n" != 0 ] && { echo "RESTE : $n trace(s) du simulateur dans .cncrc"; rest=1; }
      rm -rf /tmp/sim-surface
      bash -c "ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null" ; /usr/local/sbin/cncjs-idle-check
      exit $rest' || failed=1
    if [ "$failed" = 0 ]; then echo "nettoyage vérifié"; else echo "NETTOYAGE INCOMPLET : voir les lignes ci-dessus"; exit 1; fi
    ;;
  *) sed -n 2,15p "$0"; exit 2 ;;
esac
