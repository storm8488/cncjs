#!/bin/bash
# Surface Pro — garde-fou avant (et pendant) toute séance avec le Grbl simulé.
# Sortie 0 : aucun port série réel, CNCjs répond et n'a ouvert que /tmp/ttyGRBL (ou rien).
# Sortie 1 : STOP, ne rien ouvrir. Lancé par sim.sh start, port.cjs et surface.sh guard.
set -u
NODE=/home/pi/node22/bin/node

real=$(ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null)
if [ -n "$real" ]; then
  echo "STOP : port série réel présent : $real"; exit 1
fi

# /tmp/ttyGRBL, s'il existe, ne doit être qu'un lien vers un pseudo-terminal (le pont).
if [ -e /tmp/ttyGRBL ] || [ -L /tmp/ttyGRBL ]; then
  target=$(readlink /tmp/ttyGRBL || true)
  case "$target" in
    /dev/pts/*) ;;
    *) echo "STOP : /tmp/ttyGRBL n'est pas un pseudo-terminal du pont ($target)"; exit 1 ;;
  esac
fi

# Ce que voit le contrôle des mises à jour (information ; « occupé » sur le simulateur est permis).
/usr/local/sbin/cncjs-idle-check || true

# Aucun contrôleur ouvert sur un autre port que /tmp/ttyGRBL.
"$NODE" -e '
const get = (p, o = {}) => fetch("http://127.0.0.1:8000" + p, Object.assign({ signal: AbortSignal.timeout(5000) }, o));
(async () => {
  const s = await (await get("/api/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();
  const list = await (await get("/api/controllers", { headers: { Authorization: "Bearer " + s.token } })).json();
  if (!Array.isArray(list)) throw new Error("réponse inattendue");
  const ports = list.map((c) => c && c.port);
  const other = ports.filter((p) => p !== "/tmp/ttyGRBL");
  if (other.length) { console.log("STOP : contrôleur réel ouvert : " + other.join(", ")); process.exit(1); }
  console.log("garde-fou OK : aucun port série réel, contrôleurs ouverts : " + (ports.join(", ") || "aucun"));
})().catch((e) => { console.log("STOP : CNCjs ne répond pas (" + e.message + ")"); process.exit(1); });
'
