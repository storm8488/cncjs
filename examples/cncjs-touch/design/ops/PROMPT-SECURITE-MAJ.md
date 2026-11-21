# Prompt — sécurité réseau et mises à jour des tablettes CNCjs (points 8, 9, 10)

Rôle : administrateur prudent de deux kiosques Debian qui pilotent des machines réelles.
Surface Pro 3 = CNC, pi@192.168.1.29 (sudo sans mot de passe). Surface RT = laser,
pi@192.168.1.31 (sudo avec un mot de passe que seul l'utilisateur tape).

## Règles absolues
- Aucune commande machine, aucun redémarrage ni rechargement du kiosque pendant un travail.
- Ne jamais taper ni afficher un mot de passe ; ne pas se connecter à l'interface de la Livebox
  (l'utilisateur s'y connecte lui-même).
- Toute règle de pare-feu est posée avec un retour arrière automatique (minuterie systemd
  de 5 min) annulé seulement après une reconnexion SSH réussie depuis le LAN.
- Rien ne change sur la RT sans qu'elle soit allumée et joignable ; sudo de la RT = l'utilisateur.
- Sauvegarder chaque fichier système avant modification (~/backups/system-AAAAMMJJ-HHMMSS).

## 9 — Exposition IPv6 (Surface)
1. Constater : adresses IPv6 globales, ports en écoute (22, 8000), règles nftables actuelles.
2. Pare-feu hôte nftables, persistant (/etc/nftables.conf, service nftables activé) :
   entrées acceptées = established/related, loopback, ICMP/ICMPv6 (ND indispensable), DHCPv6
   client, et 22/8000 depuis 192.168.1.0/24, fe80::/10 et le ULA de la Livebox (fd00::/8).
   Tout le reste en entrée : rejeté. Sortie libre.
3. Vérifier : SSH et http://192.168.1.29:8000/touch/ depuis le PC ; le kiosque répond ;
   règle IPv6 globale refusée (nft list ruleset + compteur).
4. Livebox : la vérification du pare-feu IPv6 de la box reste à l'utilisateur (identifiants) ;
   le pare-feu hôte rend la Surface sûre quel que soit le réglage de la box.

## 10 — Règle de mises à jour de sécurité
- unattended-upgrades limité à l'origine Debian-Security (pas de mises à jour de version),
  aucun redémarrage automatique, journal conservé.
- Exécution la nuit (03:30, minuterie apt-daily-upgrade) et seulement si la CNC n'usine pas :
  ExecCondition qui interroge l'API locale CNCjs ; travail en cours ou état inconnu → report.
- Les redémarrages nécessaires sont signalés (/var/run/reboot-required) et faits à la main.
- Documenter la règle dans la mémoire de l'assistant et le compte rendu.

## 8 — Mises à jour système de la RT
- Si la RT est éteinte : préparer un script /home/pi/maj-securite.sh à lancer par
  l'utilisateur (sudo), qui sauvegarde, fait apt update + upgrade (sans full-upgrade de
  version), reconstruit rien d'autre, puis indique si un redémarrage est requis.
- Si elle est allumée : la même chose, l'utilisateur tapant le mot de passe sudo.
- Ensuite, déployer la version Touch actuelle et vérifier que la v1 Éco fonctionne
  (aucune ressource v2, pas de body.perf-v2).

## Fin
Résumé en français : ce qui est fait et vérifié, ce qui reste à l'utilisateur.
