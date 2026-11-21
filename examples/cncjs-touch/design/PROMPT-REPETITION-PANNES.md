# Avant vendredi : répétition générale, chasse aux pannes, endurance (multi-agent)

Tu es l'orchestrateur. Dépôt `C:\Users\damou\Documents\claude\cncjs`, branche `feat/ecrans-ergonomie` (HEAD `5175c326`, poussée, déployée sur la Surface Pro en cache `v2o`). La vraie CNC arrive vendredi 2026-11-13 ; d'ici là, tout passe par le Grbl simulé (`grbl-simulator/`). Tu écris en français.

## Objectif
Trouver, avant vendredi, les bugs que la vraie machine déclencherait et que le banc d'essai ne reproduit pas : le chemin exact du protocole de vendredi, les pannes (liaison, serveur, réseau, pilote) et la tenue dans la durée. Corriger ce qui est prouvé, avec un test. Corriger aussi le protocole quand il se trompe.

## Équipe et modèles

| Phase | Rôle | Modèle | Pourquoi |
|---|---|---|---|
| 0 | Outillage : simulateur avec injection de pannes (fin de course, contact sonde, perte de liaison), scripts réutilisables Surface (pont pty, ouverture du port, pilote CDP de la fenêtre de test), garde-fous | **Opus, effort moyen** | code et outils, travail bien borné |
| 1 | Scénarios de pannes et comportement attendu, déduits du code serveur et du contrat (sans rien exécuter) | **Fable, effort élevé** | jugement, sécurité, indépendant de l'exécutant |
| 2 | Répétition générale : dérouler les 19 étapes de `design/PROTOCOLE-ESSAI-CNC-V2.md` sur la Surface comme l'opérateur, captures à chaque étape | **Opus, effort moyen** | exécution méthodique |
| 3 | Exécution des scénarios de pannes de la phase 1 sur la Surface et en local | **Opus, effort moyen** | exécution |
| 4 | Tri : chaque constat est-il un vrai bug ? reproduit par un test qui échoue ? gravité ? | **Fable, effort élevé** | défauts subtils, anti faux positifs |
| 4b | Second regard indépendant sur les constats et les captures | **Astra ultra** (`codex exec -s read-only`) | angle différent |
| 5 | Corrections (code et protocole), tests | **Opus, effort moyen** | écriture sous contrat |
| 6 | Contre-revue des corrections : sécurité machine, régressions, RT v1 | **Fable, effort élevé** | |
| 6b | Contre-revue lisibilité, i18n, tests | **Astra ultra** | |
| 7 | Corrections des revues, vérifications complètes, commit local, lancement de l'endurance 24 h | **Opus, effort moyen** | |

Un seul agent touche la Surface à la fois, et un seul écrit dans le dépôt à la fois.

## Garde-fous Surface Pro (accès SSH par clé ; adresse, compte et noms de fichiers de clé retirés de la version publiée)
- **Avant chaque séance** : `ls /dev/ttyUSB* /dev/ttyACM*` doit être vide et `/usr/local/sbin/cncjs-idle-check` ne doit voir aucun contrôleur réel. Sinon : arrêter tout, ne rien ouvrir.
- On n'ouvre que `/tmp/ttyGRBL` (simulateur sur 127.0.0.1, pont pty en Python, pas de socat). Jamais un autre port.
- La fenêtre de test est un Chromium séparé (profil `/tmp/cnc-measure-v2`, débogage 9230, tunnel 19230). Ne jamais toucher le port de débogage du kiosque, ne jamais fermer un onglet du kiosque.
- Ne jamais couper le Wi-Fi réel de la tablette (on perdrait SSH) : la perte réseau se simule dans la fenêtre de test (CDP `Network.emulateNetworkConditions`) ou en coupant le pont.
- Un redémarrage `pm2 restart cncjs-v2` est permis pendant un scénario, seulement avec le simulateur.
- La fiche machine « Simulateur Grbl (test) » se déclare CNC pour activer la v2, et s'oublie à la fin (après `$X`).
- Fin de séance : port fermé, simulateur et pont arrêtés, fenêtre de test fermée et profil supprimé, tunnel fermé, fiche oubliée, `.cncrc` sans trace. Seule l'endurance (phase 7) laisse le simulateur tourner, avec arrêt automatique.
- Les bouts de code d'essai réutilisables vont dans `examples/cncjs-touch/design/ops/sim-surface/` (commités) ; ce qui est jetable reste dans le dossier de travail.

## Phase 1 : scénarios de pannes à couvrir au moins
Liaison série coupée en plein travail, en pause, pendant `$H`, pendant un palpage ; CNCjs redémarré en plein travail ; réseau de la tablette coupé 5 s puis 60 s pendant un travail ; deux appareils et le pilote (prise, refus, Pause/Arrêter acceptés de tous) ; fin de course pendant un travail ; contact sonde déjà établi avant un palpage ; rapport périmé ; reprise depuis une ligne après un arrêt. Pour chacun : préconditions, actions, ce que la tablette doit afficher, ce que le serveur doit refuser ou accepter (avec fichier:ligne), et le critère d'échec.

## Endurance (lancée en phase 7)
Script détaché sur la Surface, 24 h max, qui charge un fichier simulé, Démarrer, attend la fin, recommence ; échantillonne chaque minute dans un CSV la mémoire réelle (PSS) du kiosque Chromium et des processus Node, le CPU, les erreurs. Il s'arrête seul au bout de 24 h, ou immédiatement si un port série réel apparaît, et nettoie le simulateur et le port. La fiche machine est oubliée ensuite par l'orchestrateur.

## Règles
- Sécurité machine d'abord. Un correctif ne change ce qu'un bouton envoie, ses gardes ou son état que si le tri (phase 4) prouve un défaut de sécurité, avec un test, et la contre-revue (phase 6) l'accepte.
- `src/server/services/touch/` peut être corrigé, avec test Jest qui échoue sans le correctif. Pas le protocole Socket.IO ni l'API publique.
- Aucune régression v1 Éco (RT, Chromium 106 : pas de `:has()`, `color-mix`, `dvh`). La RT n'est pas touchée.
- Interdits : push, merge, déploiement des corrections, commande vers une vraie machine, `git reset/stash/checkout` de fichiers d'autrui, contournement des hooks, `COMPTE-RENDU-*.md`, PNG commités.
- Vérifications : `node examples/cncjs-touch/verify-project.cjs`, `npx jest src/server/services/touch grbl-simulator`, harnais strict complet (0 violation, 0 excepted, every step passed, aucun msedge `cnc-browser-run` restant).

## Compte rendu final (en français)
Répétition étape par étape (OK / bug / erreur de protocole) ; pannes une par une (attendu, observé, verdict) ; bugs corrigés (test, commit) et laissés (pourquoi) ; corrections du protocole ; endurance : où lire le CSV, quand elle s'arrête ; ce qui reste à voir vendredi ; commits locaux non poussés.
