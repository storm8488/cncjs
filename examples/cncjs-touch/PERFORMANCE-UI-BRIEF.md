# Brief : interface du mode Performance pour la Surface Pro 3

Brief commun aux agents Opus 5.5 du chantier « Performance UI ». Il complète [PROFILES-CONTRACT.md](PROFILES-CONTRACT.md) et [PROFILES.md](PROFILES.md), qui restent valables : ce brief ne redéfinit rien de ce qu'ils fixent, il s'y ajoute. Branche de base : `feat/touch-profiles` à `59129a0c`. Point de départ vérifié : `node verify-project.cjs` 112/112, `npx jest src/server/services/touch` 857/857, `browser-run.cjs --strict` 0 violation.

## 1. Pourquoi

Le mode Performance a été conçu avant d'avoir la tablette. Il est aujourd'hui utilisé sur une **Surface Pro 3** qui pilote la CNC, et il n'exploite qu'une petite partie de ce qu'elle offre :

| | Surface RT (laser) | Surface Pro 3 (CNC) |
| --- | --- | --- |
| Écran | 1366 × 768, DPR 1 | **2160 × 1440**, 3:2, 216 ppp (8,5 px/mm) ; kiosque à l'échelle 1,58 → **1366 × 911 px CSS** (1,25 → 1728 × 1152 est possible) |
| GPU | aucun WebGL, Chromium `--disable-gpu` | **Intel HD 4400**, Mesa, WebGL matériel attendu (à confirmer, § 6 étape 0) |
| CPU / RAM | Tegra 3, 2 Go | i5-4300U (2 cœurs, 4 fils), 4 Go |
| Navigateur | Chromium 106 | **Chromium 156** |
| Serveur | CNCjs sur la tablette | CNCjs sur la tablette (`localhost:8000`) |

Ce que Performance fait aujourd'hui (PROFILES.md, « Performances de cette tablette ») : la vue 3D libre remplace l'aperçu dans Fichiers et dans Suivi **au repos** ; dès qu'un travail tourne, Suivi revient à la vue fixe 2D avec son tracé de progression. Le GPU ne sert donc jamais pendant l'usinage, c'est-à-dire au moment où l'opérateur regarde l'écran. La mise en page est celle de la RT : la variante « large » de `responsive.css` ne s'active qu'à partir de 1500 px de large, donc jamais à 1366 × 911. Le rendu 3D est bridé pour la RT (30 images/s pendant un geste, DPR ≤ 1,5, géométrie décimée).

## 2. Objectif

Faire du mode Performance, **quand la tablette a un vrai GPU**, un poste d'usinage qui utilise toute la surface et toute la puissance disponibles, sans rien changer pour la RT ni pour le mode Éco.

Par ordre de valeur pour l'opérateur :

1. **Suivi en 3D pendant l'usinage.** Le parcours en 3D reste affiché pendant le travail : segments acquittés par Grbl dans une couleur, restants dans une autre, la passe en cours mise en évidence, un repère d'outil à la position rapportée par Grbl (interpolée entre deux rapports d'état, jamais extrapolée au-delà du dernier segment acquitté), « Suivre l'outil » (caméra qui accompagne) ou caméra libre. Les libellés existants restent vrais : « acquittées par Grbl », « position rapportée il y a N s ».
2. **Mise en page « poste large »** pour les écrans ≥ 1300 × 880 px CSS en Performance : Suivi sur trois zones (3D grande | coordonnées, progression, temps restant, ligne en cours | commandes et overrides), Fichiers avec la liste et un aperçu 3D grand, Préparer avec le jog et la 3D en direct. Les cibles restent 64 px (primaires) et 48 px (secondaires), le texte utile ≥ 16 px.
3. **Origine visuelle dans Préparer.** Avant de fixer l'origine, montrer en 3D où le programme chargé se placera si l'origine est posée à la position courante (contour et brut du programme déplacés avec le repère), et s'il reste dans la course (`$130-$132`, données déjà calculées par `travel-check.js`). Affichage seulement : rien n'est envoyé, aucune origine n'est posée par cet affichage.
4. **Rendu à la hauteur du GPU.** Quand le rendu WebGL est matériel : 60 images/s pendant un geste, DPR jusqu'à 2, anticrénelage, traits épais pour les coupes et fins pour les rapides, géométrie complète du parcours (pas la version décimée) quand elle tient en mémoire, éclairage ou fondu de profondeur pour lire le relief. Quand le rendu est logiciel (RT) : exactement le comportement actuel.
5. **Instruments pendant le travail.** Temps restant corrigé par les lignes acquittées (`motion-estimate.js` existe), avance réelle rapportée par Grbl, overrides d'avance et de broche visibles avec leur valeur, courbe de la dernière minute si elle ne coûte rien.

Ce qui n'est **pas** demandé : stylet, nouveau framework, three.js, changement du mode Éco, changement du serveur sauf nécessité documentée, simulation d'enlèvement de matière, tout ce qui envoie une commande à la machine.

## 3. Règles non négociables

Elles reprennent le contrat des profils et le README ; un agent qui en enfreint une rend un lot refusé.

- **Sécurité.** Rien dans ce chantier n'envoie quoi que ce soit au contrôleur. Pause et Arrêter restent joignables sous tout ce qui s'affiche, en alarme compris (`browser-run.cjs --strict` le vérifie). Un geste de caméra dans un canvas ne sort jamais du canvas (jamais vers un bouton de jog). La fraîcheur d'état, les keepalives et les commandes ne sont jamais ralentis : le rendu se fait dans `requestAnimationFrame`, jamais dans le gestionnaire d'un rapport d'état, et un rendu en retard est abandonné, pas mis en file.
- **Portes d'activation.** Les nouveautés s'activent sur deux conditions : profil `performance` **et** rendu WebGL matériel (`renderer.software === false` de `preview-gl.js`, ou l'équivalent exposé par le diagnostic). Profil Performance avec rendu logiciel (RT) = comportement actuel, à l'identique. Profil Éco = rien de nouveau n'est chargé ni demandé (`preview-gl.js` jamais requis : un test le vérifie déjà).
- **Chargement.** Tout module nouveau ou alourdi est « avancé » : chargé par `cncProfile.loadAdvanced`, jamais en `<script>` dans `index.html` (sauf un stub léger si le contrat l'exige, comme pour `preview-gl.js`). Les ressources (tampons GL, workers, écouteurs, caches) sont libérées à la fermeture, au changement d'écran, au passage en Éco et à la perte de contexte.
- **Code.** JavaScript vanilla en IIFE, qui parse comme script ES2017 (vérifié par `build-bundle.cjs` avec acorn) : les API modernes (WebGL2, OffscreenCanvas, ResizeObserver…) sont permises dans les modules avancés, derrière une détection, avec repli. Pas de dépendance npm nouvelle. Pas de TypeScript. Stylus côté application CNCjs, CSS plat côté `touch/`. Commentaires et documentation en anglais, textes d'interface en français avec lignes EN/ES dans le fichier de messages du lot.
- **Cache.** Tout fichier modifié servi par `index.html`/`simulation.html` change de suffixe `?v=` ; un module avancé modifié change `ADVANCED_VERSION` dans `tablet-profile.js`.
- **Tests.** Chaque lot livre ses tests hors ligne (`test-*.cjs`, enregistrés dans `verify-project.cjs` par l'intégrateur) et, pour le serveur, Jest. Le harnais de mise en page tourne avec Edge sur ce PC : `node browser-run.cjs --strict --browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --out <dossier propre>`. Les fenêtres 1366 × 911 et 1728 × 1152 s'ajoutent à sa liste, la RT (1366 × 768) y reste.
- **Mesures.** Un chiffre de performance vient de la tablette ou n'est pas un résultat (`?perf=1`, diagnostic exporté). Les mesures sur PC servent à détecter les régressions, pas à annoncer des gains.
- **Machine.** Aucune commande à une machine physique, aucun déploiement et aucun redémarrage de la Surface par un agent : seul l'intégrateur déploie, hors usinage, et publie les candidats sous `/touch-next/` (§ 6).
- **Dépôt.** Chaque lot travaille dans son propre worktree (branche `perf-ui/<lot>` depuis `feat/touch-profiles`), ne commite que ses fichiers, ne pousse pas, ne fusionne pas. Un besoin dans un fichier d'un autre lot s'écrit dans le rapport, il ne se fait pas.

## 4. Déroulement

| Phase | Qui | Produit | Point de contrôle |
| --- | --- | --- | --- |
| 0 Diagnostic | intégrateur | diagnostic exporté de la Surface (DPR, renderer WebGL, temps de dessin), profil de la RT | les deux chiffres figurent dans le brief des lots |
| 1 Architecture | 1 agent Opus (« Architecte ») | `PERFORMANCE-UI-SPEC.md` + maquettes `design/performance-*.html` à 1366 × 911 et 1728 × 1152 + contrat d'API entre lots + brief de chaque lot | **l'utilisateur regarde les maquettes sur la Surface** (servies sous `/touch-next/design/`) et tranche l'échelle 1,58 / 1,25 et les choix ouverts |
| 2 Réalisation | 3 agents Opus en parallèle, worktrees séparés | lots V, D, O (§ 5) avec tests et rapport | suite hors ligne verte dans chaque worktree |
| 3 Intégration | intégrateur | fusion des trois branches, `index.html`, `i18n-messages.js`, `verify-project.cjs`, docs, suite complète, harnais Edge | 112+ / 112+, Jest vert, 0 violation |
| 4 Relecture et mesure | 1 agent Opus (« Relecteur », n'a rien écrit) | relecture adversariale du diff fusionné, tests de scénario, mesures sur la Surface sous `/touch-next/` | défauts corrigés par l'intégrateur ou renvoyés au lot |
| 5 Validation | utilisateur | essai sur la Surface en Performance, puis sur la RT en Éco et Performance | PROFILES.md « Validation » complété avec les relevés |

L'architecte ne touche à aucun fichier de `touch/`. Les lots ne commencent qu'après le point de contrôle de la phase 1.

## 5. Lots et propriété des fichiers

| Lot | Mission | Fichiers (création ou modification) |
| --- | --- | --- |
| **V** Vue 3D en direct | objectifs 1 et 4 : parcours acquitté/restant, repère d'outil interpolé, « Suivre l'outil », rendu GPU (60 i/s, DPR 2, anticrénelage, épaisseurs, géométrie complète, profondeur), API d'incrustation pour le lot O (contour, brut, boîte de course, position) | `touch/preview-gl.js`, `touch/preview-3d.*`, `touch/preview-advanced.css`, `touch/toolpath-3d.js`, `touch/tool-position.js`, `touch/job-follow.js`, `touch/preview-inspect.js`, `touch/i18n-messages-viz.js`, `test-preview-gl.cjs`, `test-preview-3d*.cjs`, `test-job-follow.cjs`, nouveaux `measure-*.cjs` |
| **D** Poste large | objectifs 2 et 5 : mise en page ≥ 1300 × 880 en Performance, Suivi sur trois zones, Fichiers et Préparer larges, instruments (temps restant corrigé, avance réelle, overrides lisibles), fenêtres du harnais | `touch/responsive.css`, `touch/ui-2027.css`, `touch/app.css`, `touch/touch-shell.*`, `touch/job-dashboard.js`, `touch/job-controls.js` (affichage seulement : aucune logique de commande), `touch/status-strip.js`, `touch/motion-estimate.js`, `touch/i18n-messages-profiles.js`, `browser-run.cjs`, `layout-exceptions.json`, `test-responsive*.cjs`, `test-dashboard.cjs`, `test-job-display.cjs` |
| **O** Origine visuelle | objectif 3 : dans Préparer, placement du programme à la position courante via l'API d'incrustation du lot V, course `$130-$132` depuis `travel-check.js`, texte d'état « affichage seulement » | nouveau `touch/origin-preview.js` (avancé), nouveau `touch/origin-preview.css`, `touch/job-preparation.js` (branchement seulement), `touch/travel-check.js` (exposition de données, pas de changement de règle), nouveau `touch/i18n-messages-origin.js`, `test-origin-preview.cjs` |
| Intégrateur | `touch/index.html`, `touch/simulation.html`, `touch/i18n-messages.js`, `touch/tablet-profile.js` (`ADVANCED_VERSION`), `verify-project.cjs`, `README.md`, `TESTING.md`, `PROFILES.md`, ce brief | |
| Relecteur | lecture seule ; nouveaux `test-scenario-perf-*.cjs` et scénarios Jest seulement | |

Interdits à tous les lots : `touch/real-motion.js`, `touch/dry-motion.js`, `touch/coordinate-plan.js`, `touch/screen-lock.js`, `src/server/services/touch/motion.js`, `control.js`, `job-service.js` : tout ce qui décide d'un mouvement ou d'une commande. Un lot qui croit en avoir besoin s'arrête et l'écrit dans son rapport.

L'API d'incrustation (lot V, définie par l'architecte en phase 1 et livrée en premier par V, avec un stub que O peut utiliser dès le départ) : `CNCPreviewGL.open(meta, { overlays: [...] })` ou `view.setOverlays([...])`, chaque incrustation étant une liste de segments ou une boîte avec couleur et épaisseur, en coordonnées machine ou travail (à fixer dans la spécification), sans aucune sémantique de commande.

## 6. Accès, mesures et outils

- Surface (CNC) : `ssh -i ~/.ssh/id_ed25519_surface_pro -o IdentitiesOnly=yes pi@192.168.1.29`, Debian 13, CNCjs sous PM2 `cncjs-v2`, pages dans `/home/pi/cncjs-v2/node_modules/cncjs/dist/cncjs/touch`. **Les agents n'y écrivent rien et ne touchent jamais au Chromium du kiosque** (pas de port de débogage, pas de `pkill`). L'intégrateur publie les candidats dans `/home/pi/touch-next` servi sous `/touch-next/` (point de montage `.cncrc`, redémarrage de `cncjs-v2` hors usinage).
- Mesurer sur la tablette : un second Chromium lancé par l'agent sur `DISPLAY=:0`, en fenêtre réduite (`--window-size=960,640 --window-position=0,0 --user-data-dir=/tmp/perf-<lot>`, port de débogage ≥ 9230, profil GPU, donc sans `--headless` qui tombe sur SwiftShader), ouvert sur `http://localhost:8000/touch-next/?perf=1`, tué par son pid à la fin, dossier temporaire supprimé. L'utilisateur est prévenu que cette fenêtre apparaît. Un agent qui mesure sans que l'intégrateur ait publié un candidat n'a rien à mesurer et le dit.
- RT (laser, production) : `pi@192.168.1.31`, clé `~/.ssh/id_ecdsa_cnc_touch`. Lecture seule, et seulement si elle répond en 10 s.
- Étape 0 (intégrateur, avant la phase 1) : Réglages → Performances → « Diagnostic de cette tablette » sur la Surface, export JSON ; même chose sur la RT si elle est allumée. Les chiffres (DPR, renderer, temps Canvas 2D / WebGL pour 20 000 segments) sont ajoutés ici :

  > **Surface Pro 3** (relevé du 2026-11-05 22:03, `cncTabletDiagnostic.collect()` dans un second Chromium 156 avec GPU, fenêtre 960 × 553 à DPR 1 ; le kiosque lui-même est à 1366 × 911 px CSS, DPR 1,58) : écran 2160 × 1440 ; Worker, OffscreenCanvas et **WebGL2** disponibles ; WebGL **matériel** (`software: false`), renderer `ANGLE (Intel, Mesa Intel(R) HD Graphics 4400 (HSW GT2), OpenGL 4.6)`, anticrénelage accordé par le contexte, `ALIASED_LINE_WIDTH_RANGE` 1 à 7,4 px, textures jusqu'à 16 384 ; 20 000 segments : Canvas 2D 77,5 ms, WebGL 116 ms pour le premier dessin (compilation et envoi des tampons compris : à mesurer en régime établi par le lot V). Mémoire JS de la page au repos : 5 Mo.
  >
  > **Surface RT** : injoignable le 2026-11-05 (éteinte). Repères connus (PROFILES.md, mesurés sur la RT en Performance avec le rendu Canvas 2D) : 1366 × 768 à DPR 1, pas de WebGL, environ 28 images/s pendant un geste et 50 à 70 ms pour un parcours complet au repos sur un parcours de 15 000 segments.

- Commandes sur ce PC : `node examples/cncjs-touch/verify-project.cjs` ; `npx jest src/server/services/touch` ; `npx eslint` ; harnais Edge (§ 3) ; `yarn build-prod` via `$TEMP/yarnshim/yarn` puis `git checkout -- src/app/i18n src/server/i18n src/package.json` et `npm pack` (intégrateur).

## 7. Rapport de chaque agent

Court, factuel, en français : ce qui est fait et prouvé (commande et extrait), ce qui est fait mais non mesuré sur la tablette, ce qui n'est pas fait et pourquoi, les besoins dans les fichiers d'un autre lot, les chiffres mesurés avec leur provenance (PC ou tablette, fenêtre CSS, DPR, renderer), les tests ajoutés avec leur nom. Aucune affirmation de gain sans mesure sur la tablette.
