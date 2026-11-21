# Réglages : bugs visuels et lenteur au défilement, sur la Surface branchée à la vraie CNC (multi-agent)

Tu écris en français. Dépôt `C:\Users\damou\Documents\claude\cncjs`, branche `feat/ecrans-ergonomie`, HEAD `ddd69280` (poussé, déployé sur la Surface Pro CNC : interface finale v2q, sans mode Simulation). La **vraie CNC est branchée** (LUNYEE 4040, `/dev/ttyUSB0`, Grbl 1.1f sur ESP32, 4 axes rapportés) et l'opérateur s'en sert. Le kiosque tourne en Performance v2, 1366 × 911 CSS, échelle 1,58, Chromium 156, X11.

## Objectif
1. L'opérateur signale des **bugs visuels** et une **grosse lenteur au défilement dans Réglages** (les 3 onglets et leurs sous-écrans). Les mesurer sur la vraie tablette, trouver la cause, corriger, prouver le gain.
2. Corriger l'affichage de l'**Alarme 1 périmée** : `touch/job-controls.js`, `recall()`, garde le code d'alarme d'avant un Reset quand l'état passe d'Alarme à Alarme. `alarmMemory` n'est pas lié à `m.startups` (fourni par le serveur, `job-service.js:1195`). Après le Reset au PC, la tablette affiche encore « Alarme 1 … Carte sans réponse : Reset dans CNCjs au PC ». `test-strip-continuity.cjs:242` affirme aujourd'hui que le code reste après la bannière : décider avec preuve (un code critique 1/2 ne doit plus dire « Reset au PC » une fois le Reset fait ; l'inférence ALARM:3/6 après un reset pendant un mouvement reste).

## Équipe
| Phase | Rôle | Modèle |
|---|---|---|
| 1a | Mesure sur la Surface (fenêtre de test en lecture seule) | Opus, effort moyen |
| 1b | Lecture du code de Réglages : coûts de rendu, défauts visuels probables | Fable, effort élevé |
| 2 | Diagnostic croisé à partir des mesures et de la lecture | Astra ultra + Fable élevé |
| 3 | Corrections, tests, mesure locale avant/après avec CPU ralenti | Opus, effort moyen |
| 4 | Contre-revue | Fable élevé + Astra ultra |
| 5 | Corrections des revues, vérifications complètes, commit local | Opus, effort moyen |

Un seul agent touche la Surface à la fois, un seul écrit dans le dépôt à la fois. Le déploiement est fait ensuite par l'orchestrateur, machine au repos.

## Garde-fous (machine réelle branchée)
- **Aucune commande vers la machine.** Ne jamais ouvrir, fermer ni rouvrir un port ; ne jamais utiliser `surface.sh sim|port|clean|endurance` (simulateur seulement). Pas de `pm2 restart` (il fermerait le port de la vraie machine).
- Fenêtre de test séparée (profil `/tmp/cnc-measure-rg`, débogage 9231, tunnel local 19231), avec les **mêmes options que le kiosque** (lire `~/.xinitrc`, `--force-device-scale-factor=1.58`, taille 1366 × 911 CSS ; GPU comme le kiosque). Ne jamais toucher le port de débogage du kiosque ni fermer un onglet du kiosque.
- **La fenêtre de test est en lecture seule** : avant de charger la page, activer `Fetch.enable` sur CDP et faire échouer toute requête dont la méthode n'est pas GET/HEAD, et tout message Socket.IO sortant autre que la poignée de main et la lecture (si on ne peut pas le garantir, bloquer `/socket.io/` en écriture via `Fetch` sur les POST). Vérifier qu'aucune prise de pilotage (`control claim`) n'apparaît dans `~/cncjs-touch-history.jsonl` pendant la séance.
- Vérifier avant et après la séance avec `/usr/local/sbin/cncjs-idle-check` que l'état de la machine n'a pas été changé par la séance. Si la machine est en mouvement (Run, Jog, Home), attendre ou arrêter la séance.
- Fin de séance : fenêtre fermée, profil supprimé, tunnel fermé, aucun fichier laissé dans `/tmp`.

## Mesures attendues (phase 1a)
Pour chaque onglet de Réglages et chaque sous-écran qui défile : défilement tactile émulé (`Input.dispatchTouchEvent`, gestes réalistes) et défilement programmé ; trace CDP (`Tracing`, catégories devtools.timeline, blink, cc, gpu) ; images par seconde, tâches longues, temps de style/mise en page/peinture/composition, couches et leurs tailles (`LayerTree`), mémoire GPU si disponible. Captures aux positions de défilement (début, milieu, fin) et à chaque défaut visuel vu (texte rogné, chevauchement, scintillement, fond qui manque, élément qui saute). Comparer avec le Menu ou Fichiers comme référence.

## Règles
- Sécurité machine d'abord : aucune modification de ce qu'un bouton envoie, de ses gardes ou de son état. Pas de changement serveur (`src/server`) : il imposerait un redémarrage de CNCjs avec la machine branchée. Si une cause est côté serveur, la décrire et s'arrêter là.
- Chromium 106 (RT v1 Éco) : pas de `:has()`, `color-mix`, `dvh`. Aucune régression v1 Éco.
- Cache : `v2q` → `v2r`, seulement les `?v=`, `ADVANCED_VERSION` et leurs tests ; jamais les classes `v2m-`/`v2n-` ni la regex `V2_NODE`.
- Chaque correction a un test qui échoue sans elle (ou, pour la performance, une mesure avant/après reproductible).
- Interdits : push, déploiement, `git reset/stash/checkout` de fichiers d'autrui, contournement des hooks, `COMPTE-RENDU-*.md`, PNG commités, fichiers listés dans `tablet-exclude.txt` réintroduits dans la page réelle.
- Vérifications : `node examples/cncjs-touch/verify-project.cjs`, `npx jest src/server/services/touch grbl-simulator`, harnais strict complet (0 violation, 0 excepted, every step passed, aucun msedge `cnc-browser-run` restant).

## Compte rendu final
Défauts vus (capture, cause, correction) ; lenteur : mesures avant/après (Surface pour l'avant, PC ralenti pour l'après), cause principale ; Alarme 1 périmée ; fichiers modifiés, tests, commit local ; ce qu'il faudra re-mesurer sur la Surface après déploiement.
