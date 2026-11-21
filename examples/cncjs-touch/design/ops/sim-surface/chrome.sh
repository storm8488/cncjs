#!/bin/bash
# Surface Pro — fenêtre de test Chromium séparée (jamais le kiosque) : profil /tmp/cnc-measure-v2,
# débogage 127.0.0.1:9230. Usage : bash chrome.sh start [url] | stop | status
# url par défaut : http://127.0.0.1:8000/ (donne le jeton de session) ; aller ensuite sur /touch/ par cdp.mjs nav.
set -u
P=/tmp/cnc-measure-v2
case "${1:-}" in
  start)
    pgrep -f "[u]ser-data-dir=$P" >/dev/null && { echo "fenêtre de test déjà lancée"; exit 0; }
    DISPLAY=:0 nohup chromium --app="${2:-http://127.0.0.1:8000/}" --user-data-dir="$P" \
      --remote-debugging-address=127.0.0.1 --remote-debugging-port=9230 \
      --force-device-scale-factor=1.58 --window-position=0,0 --window-size=1366,912 \
      --no-first-run --enable-gpu-rasterization --disable-features=Translate >/tmp/cnc-measure.log 2>&1 &
    for _ in $(seq 1 30); do curl -sf http://127.0.0.1:9230/json >/dev/null && { echo "fenêtre de test prête (9230)"; exit 0; }; sleep 1; done
    echo "fenêtre de test : échec (voir /tmp/cnc-measure.log)"; exit 1
    ;;
  stop)
    # Seulement les processus de ce profil (le motif [u] ne se trouve pas lui-même).
    pkill -TERM -f "[u]ser-data-dir=$P" && sleep 2
    pkill -KILL -f "[u]ser-data-dir=$P" 2>/dev/null
    rm -rf "$P" /tmp/cnc-measure.log
    echo "fenêtre de test fermée, profil supprimé"
    ;;
  status)
    if pgrep -f "[u]ser-data-dir=$P" >/dev/null; then echo "fenêtre de test ouverte"; else echo "fenêtre de test fermée"; fi
    [ -d "$P" ] && echo "profil présent : $P"
    ;;
  *) echo "usage : chrome.sh start [url]|stop|status"; exit 2 ;;
esac
