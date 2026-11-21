#!/bin/bash
# Surface RT (laser) — system updates, run by the user on the RT: bash ~/maj-securite-rt.sh
# sudo asks for the password; nothing is typed for you. Never during a job.
set -e
echo "== Vérification : aucun travail en cours sur CNCjs"
T=$(curl -s -m 5 -X POST http://127.0.0.1:8000/api/signin -H 'Content-Type: application/json' -d '{}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
C=$(curl -s -m 5 -H "Authorization: Bearer $T" http://127.0.0.1:8000/api/controllers || echo ERR)
if [ "$C" = ERR ] || echo "$C" | grep -qE '"state":"(running|paused)"|"activeState":"(Run|Hold|Jog|Home)'; then
  echo "Travail en cours ou état inconnu : mise à jour annulée."; exit 1; fi
B=$HOME/backups/system-$(date +%Y%m%d-%H%M%S); mkdir -p "$B"
dpkg --get-selections > "$B/paquets-avant.txt"; cp -a /etc/apt "$B/apt" 2>/dev/null || true
echo "== Mise à jour (sans changement de version Debian)"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get -y --with-new-pkgs upgrade
sudo apt-get -y autoclean
dpkg --get-selections > "$B/paquets-apres.txt"
if [ -f /var/run/reboot-required ]; then echo "== Redémarrage nécessaire : à faire hors travail (sudo reboot)."; else echo "== Aucun redémarrage nécessaire."; fi
echo "Sauvegarde : $B"
