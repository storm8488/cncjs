# Base de départ (phase 1, agent « base »), 2026-11-15

Dépôt `C:/Users/damou/Documents/claude/cncjs`, branche `feat/refonte-ui`, HEAD `c35c9587` (le rapport du harnais l'indique aussi). Le dépôt contenait en même temps les fichiers non suivis des autres agents ; les tests `bughunt-A<n>` sont exclus par `--testPathIgnorePatterns`.

## 1. Commandes et résultats exacts

| # | Commande (racine du dépôt) | Résultat exact |
|---|---|---|
| 1 | `node examples/cncjs-touch/verify-project.cjs` | `181/181 contrôles réussis. Aucun essai matériel.` |
| 2a | `npx jest src/server/services/touch src/server/services/cncengine grbl-simulator --coverage=false --testPathIgnorePatterns="bughunt-A[0-9]"` | `Test Suites: 38 passed, 38 total` ; `Tests: 1170 passed, 1170 total` ; `Time: 27.372 s` |
| 2b | `npx jest src/server/services/touch --coverage=false --testPathIgnorePatterns="bughunt-A[0-9]"` | `Test Suites: 35 passed, 35 total` ; `Tests: 1034 passed, 1034 total` ; `Time: 26.312 s` (conforme à la référence 35 / 1034) |
| 3 | `node examples/cncjs-touch/browser-run.cjs --strict --browser "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --out <scratchpad>/refonte/avant` | `strict layout check: 0 violation(s), 0 excepted` ; `browser-run: every step passed.` ; code de sortie 0 ; `Harness steps failed: 0` |

Détails de 2a : 38 suites = 35 (touch) + 3 (cncengine et grbl-simulator) ; 1170 tests = 1034 + 136.
Les journaux Jest contiennent des `console.log` de `job-service.test.js:4143`, sans effet sur le résultat.

Harnais : durée 41 min 05 s (journal : début 02:43:33, fin 03:24:38, heure UTC), exécuté en une seule fois, aucune étape en échec, donc aucune relance `--only`. Navigateur : Edg/157.0.4341.46 sans écran, Node v26.13.0.

Fichiers :
- Journal du harnais : `C:/Users/damou/AppData/Local/Temp/claude/69ebf499963b5699/46f050f4-71a8-4363-a194-280000d1f5f5/scratchpad/refonte/base/harnais.log` (681 lignes)
- Sorties Jest : `.../scratchpad/refonte/base/jest-all.log` et `jest-touch.log`
- Dossier de sortie « avant » : `C:/Users/damou/AppData/Local/Temp/claude/69ebf499963b5699/46f050f4-71a8-4363-a194-280000d1f5f5/scratchpad/refonte/avant` (désigné ci-dessous par `AVANT`), avec `summary.md`, `summary.json`.

Processus : après la fin, aucun `msedge.exe` dont la ligne de commande contient `cnc-browser-run` n'est resté ouvert (Get-CimInstance : 0). Rien n'a été arrêté.

## 2. Index des captures « avant »

`AVANT` contient 601 dossiers de captures et 1164 PNG au total. Un dossier `screens-<écran>-<variante>-<état>` contient un PNG et un JSON de mesures du même nom que l'écran.

### 2.1 Familles hors `screens-*`

| Dossiers | Contenu | PNG |
|---|---|---|
| `1366x768`, `1366x768-large`, `1366x768-font200`, `1366x768-zoom200`, `1024x600`, `1024x600-large` | les 7 écrans de la rail (Menu, Suivi, Fichiers, Préparer, Machine, Journal, Réglages) en cible tactile | 7 chacun (42) |
| `responsive-*` (25 dossiers : 1080x720 à 1920x1080, portraits, clavier virtuel, texte agrandi, zoom) | les 7 écrans par taille ; les `-op-card` : 1 PNG | 7 chacun, 1 pour 2 dossiers |
| `alarm-1-*`, `alarm-3-*` (16 dossiers : 1024x600 et 1366x768, fr et es, standard et large) | écrans d'alarme | 3 chacun (48) |
| `e2e-fr`, `e2e-es`, `e2e-en` | parcours bout en bout simulé | 9 chacun |
| `sim-1366x768-fr`, `-es`, `sim-1024x600-fr`, `-es` | page de simulation | 9 chacun |
| `settings-1366x768-*` (v1, 10 dossiers dont `real-fr-standard-dark`) et `settings-1366x911-real-es-standard-dark` | Réglages en v1 et en v2 ES | 4 à 19 chacun |
| `v2-settings-1366x911-<fr|es|en>-<standard|large>-<dark|light>` (7 dossiers) | Réglages v2 | 12 chacun |
| `v2-real-1366x911`, `v2-real-1728x1152` | page réelle v2, états idle / running / paused / alarm / lost / stale, aperçus, fenêtres | 18 chacun |
| `v2-real-1366x911-running`, `v2-real-1728x1152-running` | travail en cours | 1 chacun |
| `v2-sim-1366x911`, `v2-sim-1728x1152` | page de simulation v2 | 8 chacun |
| `v2-v1-baseline-real-1366x911`, `-1728x1152` | v1 de référence sur une page v2 | 12 chacun |

### 2.2 Familles `screens-*` (variantes de `screens.json`)

Écrans : `menu` = Menu, `home` = Suivi, `files` = Fichiers, `jog` = Préparer (déplacements, zéros), `probe`, `probe-profile`, `probe-contact`, `probe-report` = Préparer → Sonde et ses sous-écrans, `machine` = Machine, `history` = Journal, `guide` = Guide.
États : `repos`, `pilote-pris`, `homing`, `palpage`, `travail`, `pause`, `alarme`, `perime`, `hors-ligne` (neuf états pour chaque écran de la rail) ; en plus, selon l'écran : `reel-repos`, `reel-origine`, `reel-perime`, `reel-travail`, `reel-continu` (page réelle, `jog`), `bloc-pret`, `bloc-en-cours`, `bloc-termine`, `bloc-echec`, `bloc-arret`, `bloc-refus-contact` (palpage au bloc, `probe`), `alarme-arret` (`home`), `serveur`, `serveur-erreur` (`history`).

| Variante | Rendu | Langue / thème | Taille de texte | Type | Dossiers `screens-*` |
|---|---|---|---|---|---|
| `v1-768-fr-sombre-laser` | v1 1366×768 | FR sombre | standard | laser | 68 |
| `v1-768-fr-sombre-laser-agrandi` | v1 1366×768 | FR sombre | agrandi | laser | 13 |
| `v1-768-fr-clair-cnc` | v1 1366×768 | FR clair | standard | CNC (états idle, running, paused) | 39 |
| `v1-768-es-clair-laser` | v1 1366×768 | ES clair | standard | laser | 68 |
| `v1-768-es-clair-laser-agrandi` | v1 1366×768 | ES clair | agrandi | laser (idle, running, alarm) | 32 |
| `v1-768-en-sombre-laser` | v1 1366×768 | EN sombre | standard | laser | 38 |
| `v2-911-fr-sombre-cnc` | v2 1366×911 | FR sombre | standard | CNC | 75 |
| `v2-911-fr-clair-cnc-agrandi` | v2 1366×911 | FR clair | agrandi | CNC | 19 |
| `v2-911-es-clair-cnc` | v2 1366×911 | ES clair | standard | CNC | 74 |
| `v2-911-es-clair-cnc-agrandi` | v2 1366×911 | ES clair | agrandi | CNC | 1 |
| `v2-911-es-sombre-cnc-agrandi` | v2 1366×911 | ES sombre | agrandi | CNC | 38 |
| `v2-911-en-sombre-cnc` | v2 1366×911 | EN sombre | standard | CNC | 45 |

Les variantes `screens-guide-sim-{600,768}-{es,fr}-sombre[-2..4]` (12 dossiers) sont les captures du Guide sur la page de simulation.

Remarques :
- Il n'existe pas de variante « v1 FR sombre CNC » : le v1 en français sombre est capturé en laser (profil de la RT), le v1 CNC en français est en clair.
- `AVANT` a été produit par la run du jour sur le dépôt courant (commit `c35c9587`, cache `v2u`). Le dossier plus ancien `scratchpad/palpage/harnais-final` a les mêmes noms de variantes mais date d'avant ; utiliser `AVANT`.

## 3. Captures de référence par écran pour le rapport final

Chemins relatifs à `AVANT`. v1 = `screens-<écran>-v1-768-fr-sombre-laser-<état>/<écran>.png` (1366×768, FR sombre, laser) ; v2 = `screens-<écran>-v2-911-fr-sombre-cnc-<état>/<écran>.png` (1366×911, FR sombre, CNC). Les mesures (cibles, débordements) sont dans le JSON voisin.

| Écran de la page | v1 (1366×768) | v2 (1366×911) |
|---|---|---|
| Menu | `screens-menu-v1-768-fr-sombre-laser-repos/menu.png` | `screens-menu-v2-911-fr-sombre-cnc-repos/menu.png` |
| Suivi (`home`) | `screens-home-v1-768-fr-sombre-laser-repos/home.png` (aussi `-travail`, `-pause`, `-alarme`) | `screens-home-v2-911-fr-sombre-cnc-repos/home.png` (aussi `-travail`, `-pause`, `-alarme`, `-alarme-arret`) |
| Fichiers | `screens-files-v1-768-fr-sombre-laser-repos/files.png` | `screens-files-v2-911-fr-sombre-cnc-repos/files.png` |
| Préparer (`jog`) | `screens-jog-v1-768-fr-sombre-laser-repos/jog.png` | `screens-jog-v2-911-fr-sombre-cnc-repos/jog.png` ; page réelle : `…-reel-repos`, `…-reel-origine`, `…-reel-perime`, `…-reel-continu` |
| Préparer → Sonde (`probe`) | `screens-probe-v1-768-fr-sombre-laser-repos/probe.png` | `screens-probe-v2-911-fr-sombre-cnc-repos/probe.png` ; palpage au bloc : `…-bloc-pret`, `-bloc-en-cours`, `-bloc-termine`, `-bloc-echec`, `-bloc-arret`, `-bloc-refus-contact` |
| Sonde, profil (`probe-profile`) | `screens-probe-profile-v1-768-fr-sombre-laser-repos/probe-profile.png` | `screens-probe-profile-v2-911-fr-sombre-cnc-repos/probe-profile.png` |
| Sonde, test du contact (`probe-contact`) | `screens-probe-contact-v1-768-fr-sombre-laser-repos/probe-contact.png` | `screens-probe-contact-v2-911-fr-sombre-cnc-repos/probe-contact.png` |
| Sonde, résultat (`probe-report`) | aucune en v1 (écran du palpage au bloc, v2 seulement) | `screens-probe-report-v2-911-fr-sombre-cnc-bloc-termine/probe-report.png` |
| Machine | `screens-machine-v1-768-fr-sombre-laser-repos/machine.png` | `screens-machine-v2-911-fr-sombre-cnc-repos/machine.png` |
| Journal (`history`) | `screens-history-v1-768-fr-sombre-laser-repos/history.png` | `screens-history-v2-911-fr-sombre-cnc-repos/history.png` (aussi `-serveur`, `-serveur-erreur`) |
| Réglages | `settings-1366x768-sim-fr-standard-dark-laser/` (19 PNG : `display-0..2`, `language-*`, `machine-0..1`, `machine-diagnostic`, `system-0..2` …) ; page réelle : `settings-1366x768-real-fr-standard-dark/` | `v2-settings-1366x911-fr-standard-dark/` (12 PNG : mêmes sous-volets) ; clair : `v2-settings-1366x911-fr-standard-light/` |
| Guide | `screens-guide-v1-768-fr-sombre-laser/guide.png` (+ `-2` à `-4`) | `screens-guide-v2-911-fr-sombre-cnc/guide.png` (+ `-2` à `-4`) |

Autres états (alarme, homing, palpage en cours, pilote pris, périmé, hors ligne) : même motif de nom avec l'état voulu, pour chacun des écrans menu, home, files, jog, machine, history (v1 et v2).
Sombre/clair : le clair v2 est `v2-911-fr-clair-cnc-agrandi` (agrandi seulement) ou `v2-911-es-clair-cnc` (ES) ; il n'existe pas de v2 FR clair standard dans la grille actuelle.

## 4. Non vérifié

- Aucun accès à la vraie machine, à la Surface Pro ni à la RT : les mesures du harnais viennent d'un Edge récent sur PC, pas de Chromium 106 sans GPU.
- Le contenu visuel des PNG n'a pas été relu image par image ; seuls leur dénombrement et leurs noms sont rapportés. La correspondance écran → nom de dossier est déduite de `browser-run.cjs` (`screen-home` = Suivi) et des tableaux du harnais ; `jog` = Préparer et `files` = Fichiers sont déduits de l'ordre de la rail et du libellé « Déplacer / Origine », non confirmés sur image.
- Les lignes de l'intervalle d'exécution du harnais sont en UTC dans son journal ; la durée de 41 min 05 s en découle.
