# Interface réelle finale de la CNC : fin des modes « vérification seule » (multi-agent)

Tu écris en français. Dépôt `C:\Users\damou\Documents\claude\cncjs`, branche `feat/ecrans-ergonomie`, HEAD `a0f6ad18` (poussé, déployé sur la Surface Pro CNC, cache `v2r`). La **vraie CNC est branchée** (LUNYEE 4040, `/dev/ttyUSB0`, Grbl 1.1f sur ESP32, `$13=0`, `$20=0`, `$21=1`, `$22=1`, `$23=3`, `$130-132=400/400/130`). Depuis 2026-11-14 00:40, `.cncrc` de la Surface contient `"touch": {"motion": {"enabled": true}}` : les déplacements réels sont activés côté serveur (`src/server/services/touch/motion.js`, `motionEnabled`).

## Demande de l'opérateur
La mise en service est faite et tout y fonctionne. Il veut **la vraie interface finale** : plus de mode « vérification seule », plus de libellé « EXPÉRIMENTAL », plus de bouton « préparer sans mouvement ». Capture actuelle de Préparer (« Déplacer et définir l'origine ») :
- badge « VÉRIFICATION SEULE » ; sous-titre « Vérifier le déplacement · aucun mouvement envoyé · pas 1 mm · 800 mm/min » ;
- flèches X±/Y±/Z± qui ne bougent rien (`touch/dry-motion.js`) ;
- un bouton à part « Déplacement réel EXPÉRIMENTAL » (`touch/real-motion.js`) ;
- « Zéro X/Y/Z » et « Zéro XYZ » grisés ; « Vitesse du test… » ;
- « Aucun déplacement réel. Origines et palpage non activés. » ; « Coordonnées · préparer sans mouvement » ;
- « REPÈRE INCONNU ».

## Objectif
1. Dans Préparer, les flèches et les pas (0,1 / 1 / 10 mm, plus le continu s'il existe côté serveur) **déplacent réellement** la machine par le chemin réel existant (`real-motion.js` → serveur `motion.js`, jog `$J=` borné, annulation 0x85, pilotage), avec un réglage de vitesse de jog clair. Les boutons Zéro X/Y/Z/XYZ **définissent réellement** l'origine de travail (G10 L20 du serveur) quand le serveur l'autorise. Le palpage réel reste tel que le serveur l'autorise.
2. Retirer du **chemin réel** (`index.html` et scripts qu'il charge) tout mode « vérification seule / à blanc / expérimental / préparer sans mouvement » et leurs textes, dans tous les écrans (Préparer surtout ; chercher aussi ailleurs : Machine, Suivi, Fichiers, Réglages). `simulation.html` peut garder ses propres modes, mais n'est pas servi sur la tablette (`tablet-exclude.txt`).
3. Quand le serveur refuse (pas de pilotage, carte en Pause/Hold, Alarme, version Grbl inconnue, non référencé : pas maximal 1 mm, broche en marche, etc.), l'écran l'affiche en une phrase **actionnable** (« Machine en pause : appuyez sur Arrêter, puis Origine »), pas un écran de simulation.
4. Le texte d'origine refusée en Pause (`homeReason` côté serveur) : si un changement serveur est nécessaire pour le rendre actionnable, le limiter au strict minimum et le signaler (un changement serveur impose un redémarrage de CNCjs qui ferme le port de la CNC ; préférer une traduction côté page).

## Garde-fous
- **Ne pas affaiblir la sécurité du serveur** : bornes de course, pas maximal non référencé, refus broche en marche, pilotage, annulation à la perte du réseau, keepalive, limite 60 s. Le client ne contourne jamais un refus serveur. Arrêter/Pause restent toujours disponibles.
- Ne pas toucher à la machine : **aucun agent n'envoie de commande à la CNC ni n'ouvre/ferme son port** ; pas de `pm2 restart`, pas de déploiement, pas de push. Les essais physiques X/Y sont faits ensuite par l'orchestrateur.
- Chromium 106 (RT v1 Éco) : pas de `:has()`, `color-mix`, `dvh`. Aucune régression v1 Éco ni v2. Ne jamais renommer les classes `v2m-`/`v2n-` ni la regex `V2_NODE`.
- Cache `v2r` → `v2s` (seulement les `?v=`, `ADVANCED_VERSION` et leurs tests).
- Chaque changement de comportement a un test qui échoue sans lui ; tests existants adaptés seulement quand ils décrivent l'ancien mode à blanc, en le disant.
- Interdits : `git reset/stash/checkout` de fichiers d'autrui, contournement des hooks, `COMPTE-RENDU-*.md`, PNG commités, fichiers de `tablet-exclude.txt` réintroduits dans la page réelle.
- Vérifications : `node examples/cncjs-touch/verify-project.cjs`, `npx jest src/server/services/touch grbl-simulator`, harnais strict complet `node examples/cncjs-touch/browser-run.cjs --strict --out <dossier>` (0 violation, 0 excepted, every step passed, aucun msedge `cnc-browser-run` restant).

## Livrable pour l'orchestrateur
En plus du commit local : un script `examples/cncjs-touch/design/ops/essai-xy-reel.cjs` (à exécuter sur la Surface avec les modules de `~/cncjs-v2/node_modules`, secret lu dans `~/.cncrc` sans jamais l'afficher) qui, **par le même chemin serveur que la tablette** (mêmes routes/événements, pilotage pris proprement puis rendu) : affiche l'état ; sur option `--reset` envoie l'arrêt (reset) seulement si la carte est en Hold/Idle sans travail ; sur option `--go` fait des pas de jog X, Y puis Z (option `--axes=XY` pour exclure Z), 0,1 mm puis 1 mm, aller et retour (Z : d'abord vers le bas puis retour, jamais au-delà de la course connue), à vitesse basse (≤ 500 mm/min ; Z ≤ 300), en vérifiant MPos avant/après et en s'arrêtant au premier écart, refus ou alarme ; sur option `--home` fait la prise d'origine (`$H`) par le chemin serveur de la tablette, attend sa fin (Idle, `homed` vrai) et affiche MPos et les broches, puis s'arrête au premier refus ou alarme. Sans option, il ne fait que lire. Documenter son usage en tête du fichier.

**Mise à jour 2026-11-14 01:50 :** l'opérateur autorise explicitement les essais réels X, Y, Z et leurs fins de course (prise d'origine) : il a vérifié que tout peut tourner sans risque. Les essais restent faits par l'orchestrateur, pas par les agents.

**Essais réels faits par l'orchestrateur, 2026-11-14 ~02:10 (par le chemin serveur de la tablette) :**
- Sortie de Hold (la carte avait redémarré), relecture `$$`, puis prise d'origine `$H` réussie en 12 s. Après l'origine, MPos = 0,0,0 pour X, Y et Z : origine forcée à 0 (Grbl compilé avec l'équivalent de `HOMING_FORCE_SET_ORIGIN`). Le contact Z, actif avant, est relâché après l'origine (le Z était sur son contact).
- Convention de course constatée : **X et Y de 0 à +400**, **Z de −130 à 0**. Juste après l'origine, le serveur refuse un pas en X/Y (« convention de course ambiguë à cette position ») ; un pas de +1 mm par l'interface classique a levé l'ambiguïté, comme le prévoit HANDOFF.md étape 0.
- Pas réels de 0,1 et 1 mm, aller et retour, en X, Y (400 mm/min) et Z (200 mm/min) : 12 sur 12 exacts, aucune alarme.
- **Conséquence pour l'interface :** juste après chaque origine, X et Y sont bloqués par ce refus d'ambiguïté. L'écran doit l'expliquer et proposer une sortie utilisable par l'opérateur. Proposition à évaluer : un réglage machine (enregistré par port, comme la mise en service) qui fixe la convention constatée (0 → +$13x pour un axe à bit `$23`), lu par le serveur s'il le permet sans affaiblir la sûreté. Si cela demande un changement serveur, le faire minimal, testé, et le signaler (il faudra redémarrer CNCjs).
- Course complète G53 (orchestrateur) : X 1↔398 et Y 1↔398 à F2000 (13 s), Z 0↔−128 à F500 : positions exactes, aucune alarme. Fins de course opposées non touchées volontairement.

**Autres problèmes réels constatés, à régler dans ce lot (côté page d'abord) :**
1. Après un redémarrage de la carte, CNCjs oublie les réglages : la tablette refuse alors l'origine (« Réglage $22 inconnu : relisez les réglages de la carte ») et le jog (« $13 inconnu »). Il a fallu l'action serveur existante `readSettings` ($$). L'écran doit proposer cette relecture en un bouton là où le refus apparaît (Préparer / origine), ou la déclencher d'elle-même au repos si le serveur le permet sans risque.
2. Après l'arrêt d'un travail, la carte est restée des heures en `Hold:0` (workflow idle) : l'origine dit seulement « exige une machine au repos ou en alarme ». Phrase actionnable : « Machine en pause : appuyez sur Arrêter, puis Origine. »
3. Juste après l'origine, refus « convention de course ambiguë » en X/Y (voir plus haut) : à résoudre pour que l'opérateur puisse jogger X/Y sans passer par le PC.
- Fins de course (orchestrateur, ~02:40) : 6 contacts ; X et Y vus aux deux bouts, un seul des deux Z vu à la main. Contacts opposés trouvés en approche lente : X ≈ 410,2 mm, Y ≈ 398,2 mm (donc $131=400 dépasse le contact Y). Après une alarme de fin de course, cette carte ESP32 redémarre seule (bannière, MPos à 0, réglages oubliés par CNCjs).
- **Réglages carte changés avec l'accord de l'opérateur (~03:00) : `$130=408`, `$131=396`, `$20=1`** (limites logicielles actives, vérifiées : jog hors course refusé `error:15` sans mouvement). `$132=130` inchangé ; le contact Z du bas ne répond pas (rien jusqu'à −134 mm).
