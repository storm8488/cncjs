# F1 — Cadrer la pièce à vide sur la CNC : compte rendu de réalisation

Phase B du chantier « six fonctions » (`design/PROMPT-FONCTIONS-6.md`), 17 novembre 2026. Arbre `C:\Users\damou\Documents\claude\cncjs-wt\F1`, branche `feat/F1`, partie de `feat/refonte-ui` à `db584555`. Conception suivie : `F1-CONCEPTION.md`. Aucun accès à la tablette, à la RT ni à la CNC ; aucun push ; rien fusionné.

## 1. Verdict

**Livré : oui.** Le cadrage à vide est réalisé côté serveur et côté page, suivant la conception ; chaque comportement de sûreté a son test, qui échoue sans le code. Les écarts à la conception vont tous dans le sens « refuser ou arrêter » (§ 4). Il reste à le faire relire (phase C : Astra puis Fable) et à l'essayer sur la machine (`PROTOCOLE-ESSAI.md` § 8).

## 2. Commits (branche `feat/F1`)

| Commit | Contenu |
|---|---|
| `13744360` touch: F1 server, CNC framing in the air | Serveur : plan CNC (`cncFramePlan`, `planFor`), capacité `cncFrame`, séquence surveillée dans `motion.js` (`cncStop`, `cncStep`, arrivées comparées, liaison à l'appareil, bannière), points de branchement de `job-service.js`, codes FR/EN/ES, familles de refus ; tests `cnc-frame.test.js` (faux contrôleur) et `cnc-frame-lunyee.test.js` (simulateur LUNYEE). |
| `44e3cb3a` touch: F1 page, frame in the air on Control | Page : bouton « Cadrer à vide… » sur 4 · Contrôle, lignes d'état et de refus, dialogue de confirmation CNC, chaînes FR/EN/ES ; test `test-cnc-frame.cjs` enregistré dans `verify-project.cjs`. |
| `f009b7ef` touch: F1 safety entry and real trial | `design/refonte/SURETE.md` (section F1) et `design/refonte/PROTOCOLE-ESSAI.md` (§ 8, renvoi au § 4). |

Le premier commit vient d'une première exécution de ce lot, interrompue après lui ; la seconde exécution l'a relu en entier contre la conception, a relancé toutes les suites, puis a terminé la page et les documents. Après chacun des deux derniers commits : `verify-project` 225/225, Jest 1590 tests verts, ESLint propre.

## 3. Ce qui est fait

**Serveur** (`src/server/services/touch/`)
- `machine-profile.js` : capacité `cncFrame` (refusée sur un laser déclaré, sur `$32=1` non déclaré, déplacements réels désactivés) ; six messages `ETOUCH_CNC_FRAME_*`.
- `job-service.js` : `cncFramePlan` (gardes G3 à G16 de la conception, dans son ordre) ; `planFor` choisit le plan par le type de machine (la page n'envoie pas de type) ; `frame-prepare` rend `frame: { kind, lines, bounds, feed, zFeed, safeZ, start, seconds }` ; `frame` refait le plan et exige les mêmes lignes et le même type. Instantané : `canFrame`, `frameReason`, `refusals.frame` ; `canPause` vrai pendant un cadrage. Branchements : `socketStop` (arrête avant de laisser passer, P1), `socketRefusal` (refuse pendant un cadrage), `closeTransport` (transmet « rotation »), `release`/`takeover` (`moves.supervise` dans le même pas), Arrêter la broche (arrête sans écrire `M5` en `Jog`).
- `motion.js` : `cncFrameLinesValid` (forme des lignes : `M5`, une seule ligne Z en position 2, relative, **sans signe**, X/Y sans mot Z) ; séquence CNC : une ligne à la fois, chaque ligne suivante après `ok`, deux rapports sans `Jog`, `Idle`, arrivée conforme (0,05 mm) et toutes les conditions S1 à S11 fausses à l'instant même ; `0x85` à l'arrêt ; rien après une bannière ; `lastFrame` avec `kind`, `code`, `params`, `revision` ; `motion.frame` avec `kind`, `phase`, `side`, `sides` ; journal avec `kind`, `code`, `safeZ`.

**Page** (`examples/cncjs-touch/touch/`)
- `check-screen.js` : en CNC, `#check-frame-start` « Cadrer à vide… » montré (jamais masqué), rayé quand `canFrame` n'est pas vrai, hors état de confiance, la main ailleurs ou un cadrage en cours ; sans machine, les deux lignes sont vidées ; `#check-frame-state` : la phase en cours (« côté 2 sur 4 »…), « Cadrage terminé. La fraise est restée en haut. », « Cadrage arrêté. », ou la bande de refus du code d'arrêt avec son remède ([Recommencer] = nouvelle préparation) ; `#check-frame-reason` : la bande de `refusals.frame` (premier dépassement chiffré pour `_OUTSIDE`). Tout vient de l'état reçu. Laser : inchangé (« Cadrer… », même phrase de refus).
- `job-controls.js` : le ticket retient `frameKind` du serveur ; la capacité locale suit le type (laser : `laserFrame`, CNC : `cncFrame`) ; un ticket CNC n'est plus valable dès que `canFrame` n'est plus vrai ; dialogue CNC : titre « Cadrer à vide », texte, case, ligne de mesure « L × l mm · environ N min », Détails (lignes, vitesses, hauteur sûre machine et montée, rectangle, ce que le cadrage ne voit pas).
- `i18n-messages-profiles.js` : 18 chaînes FR/EN/ES, en fin de fichier.
- `files-touch.css` : `#check-frame-state:empty{display:none}` : la ligne d'état (nouvelle) ne prend aucune place quand elle est vide, ce qui garde l'écran Contrôle du laser identique (prouvé au harnais, § 5).

## 4. Écarts à la conception (tous dans le sens « refuser ou arrêter »)

1. **Broche à vitesse non rapportée** : si `FS` ne donne pas la vitesse et que `$G` est ancien, le cadrage est refusé (« La broche tourne peut-être… arrêtez-la d'abord (M5) »), sans code (la page montre le message dans une bande générique). La conception ne prévoyait que `spindleStill`.
2. **D-1 (surveillance renforcée du laser) appliquée en partie** : pour le laser aussi, une bannière termine la séquence sans écrire (P3), un arrêt de socket CNCjs l'annule (P1), Arrêter la broche l'annule. **Non repris pour le laser** : la liaison à l'appareil avec grâce de rotation (la rotation du flux annule encore un cadrage laser de plus d'une minute, P2 : conservateur), l'annulation sur `error`, les arrivées comparées. À trancher par l'orchestrateur.
3. **D-2** : la garde `$20=1` est gardée. Sur la vraie carte, vue à `$20=0` le 16 novembre, le cadrage sera refusé tant que `$20` n'est pas remis à 1.
4. **D-3** : pas de verrou du départ après une arrivée inattendue (D2 est invalidé, l'arrêt et le message y sont). **D-4** : pas de choix de vitesse sur la page (600 mm/min) ; le serveur accepte `feed` jusqu'à 1500 et les bornes de la carte.
5. **`ticketPending`** : réalisé par `moves.holds` (qui l'alimente) : la rotation du flux est retardée pendant un cadrage CNC (sursis existant de 20 s), puis la grâce de 3 s s'applique. Même effet que la conception.
6. **Tests existants modifiés** (la conception disait « sans modification » pour la suite laser) : `machine-profile.test.js` (clé `cncFrame` dans la liste des capacités ; dans `laser framing (§4)`, le cas « CNC » attendait `ETOUCH_LASER_NOT_LASER` et attend maintenant les gardes CNC, `_SOFT_LIMITS` puis `_NO_PROGRAM`) ; `job-service.test.js` (`refusals.frame` ajouté à deux attentes) ; `test-confirmation-classes.cjs` (le profil CNC du test reçoit `cncFrame:{supported:true}`, car le cadrage d'une CNC dépend désormais de cette capacité). Aucune assertion d'arrêt, de commande, de référence ou de D2 n'est retirée.
7. **`#check-frame-reason`** reste le `p` d'origine (géométrie laser inchangée) ; en CNC il reçoit la bande de refus (un `div` inséré par `cncRefus.montrer`, rendu normalement par le navigateur). `#check-frame-state` est un `div`, caché quand il est vide.

Aucun point de la conception ne s'est révélé faux à la lecture du code.

## 5. Tests

| Suite | Résultat |
|---|---|
| `node examples/cncjs-touch/verify-project.cjs` | **225/225** (base 224 ; + `test-cnc-frame.cjs`) |
| `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false` | **54 suites, 1590 tests verts** (base 1545 ; + 45) |
| ESLint sur tous les fichiers touchés (serveur, tests, page) | propre |
| `test-cnc-frame.cjs` sans le code de page (fichiers de `HEAD` remis le temps de l'essai) | échoue (« present for a CNC ») : le test prouve le code |
| `browser-run.cjs --strict --only screens` (Edge 157, `--out examples/cncjs-touch/output/F1`) | voir ci-dessous |

**Harnais.** L'étape `screens` s'arrête, **sur la base `db584555` comme sur F1**, dans sa mesure préalable de la Bibliothèque à 1920 × 1080 (« comparison squeezed into a side column », puis « timeout: library not followed ») : défaut du harnais ou de l'environnement, sans rapport avec F1, constaté à l'identique en remettant les fichiers de page de la base. Pour mesurer quand même les écrans, une **copie temporaire** de `browser-run.cjs` sans cette seule mesure préalable a été lancée (même arbre, même Edge), puis supprimée : `browser-run.cjs` lui-même n'est pas modifié. Résultat sur F1 : **toutes les étapes passent, strict : 0 violation, 0 exception**, dans toutes les variantes (v1 1366 × 768 laser, v1 CNC, v2 1366 × 911 CNC, FR/EN/ES, sombre/clair, texte normal/agrandi, tous les états). Comparaison des positions de toutes les cibles (`*.json`) avec deux passages de la base : **les 4 · Contrôle laser sont identiques** ; les 4 · Contrôle CNC changent (le bouton est nouveau) ; les autres écarts (Journal, Accueil « alarme après arrêt », Plus, panneau des flèches réelles en FR agrandi) varient aussi **entre deux passages de la base** ou entre deux passages de F1, et sont donc dus au harnais (heures, minutage). Le panneau des flèches réelles a été vérifié à part : le même fichier de la base donne tantôt l'une, tantôt l'autre position.

Deux corrections de page viennent de ces mesures : la ligne d'état vide ne prend plus de place (le laser bougeait de 10 à 26 px) ; sans machine, les lignes du cadrage sont vidées (le texte de la machine précédente restait affiché hors ligne). La seconde a son test dans `test-cnc-frame.cjs`, qui échoue sans le correctif.

Tests serveur nouveaux : `cnc-frame.test.js` (tests 1 à 27 de la conception § 10.1, plus la non-régression du laser) ; `cnc-frame-lunyee.test.js` (L1 à L10, simulateur au profil LUNYEE, vraie prise d'origine et vraie preuve D2, deux hypothèses du décalage exécuté).

## 6. Fichiers partagés touchés, et où

| Fichier | Où |
|---|---|
| `src/server/services/touch/job-service.js` | import ; deux constantes de message près de `SOCKET_SYSTEM_BUSY` ; `snapshot` (une ligne `frameReason`, `canPause`, `canFrame`/`frameReason`) ; bloc `cncFramePlan`/`planFor` après `framePlan` ; `machine` (`frame-prepare`, `again`) ; `release`/`takeover` ; `spindleStop` ; `closeTransport` ; `socketRefusal` ; `socketStop`. |
| `src/server/services/touch/motion.js` | `STOP_REASONS` ; constantes `FRAME_*` ; `cncFrameLinesValid` après `originLine` ; `endFrame` ; nouvelles fonctions après `frameStopReason` ; `frame` ; `frameProgress` ; `snapshot` ; `transportClosed` ; `holds` ; `framing` ; export. |
| `src/server/services/touch/machine-profile.js` | `MESSAGES` (fin) ; `capabilitiesFor` (fin). |
| `examples/cncjs-touch/touch/i18n-messages-machine.js`, `i18n-messages-refus.js`, `i18n-messages-profiles.js` | blocs ajoutés en fin de fichier. |
| `examples/cncjs-touch/touch/refus.js` | une ligne (`_CNC_FRAME_OUTSIDE` lu par sa première raison, comme `_START_OUTSIDE`). |
| `examples/cncjs-touch/touch/check-screen.js` | gabarit de la carte Verdict ; bloc de rendu du bouton ; fonctions F1 ajoutées après `render`. |
| `examples/cncjs-touch/touch/job-controls.js` | `laserFrame`, `ticketAllowed`, ticket (`frameKind`), dialogue (texte, Détails, ligne de mesure). F2 touche peut-être les mêmes zones (Pause) : conflit de fusion possible, pas de comportement. |
| `examples/cncjs-touch/touch/files-touch.css` | une règle après celle de `#check-frame-start`. |
| `examples/cncjs-touch/verify-project.cjs` | `'cnc-frame'` en fin de liste. |
| `examples/cncjs-touch/test-confirmation-classes.cjs` | une ligne (profil CNC du test). |
| `examples/cncjs-touch/design/refonte/SURETE.md` | section F1 en fin de fichier. |
| `examples/cncjs-touch/design/refonte/PROTOCOLE-ESSAI.md` | § 8 en fin de fichier ; § 4 : « Le cadrage reste réservé au laser. » devient un renvoi au § 8. |

## 7. Ce qui reste

- Relecture de sûreté (phase C : Astra ultra puis Fable) ; décision de l'orchestrateur sur D-1 (laser : P2, `error`, arrivées).
- L'essai réel `PROTOCOLE-ESSAI.md` § 8, table vide d'abord ; relire `$20` avant.
- Le harnais strict complet (phase E).

## 8. Ce qui n'est pas vérifié

- **Rien sur la machine.** `$J=G90 G21 X… Y…` en coordonnées pièce et `0x85` sur la LUNYEE n'ont pas de relevé ; la distance d'arrêt réelle n'est pas mesurée (le simulateur annule sans rampe).
- La valeur actuelle de `$20` et des accélérations de la carte.
- Que la correction de vitesse n'agit pas sur un `$J=` (code amont non relu).
- Le délai de détection d'un appareil distant disparu sans fermer sa connexion.
- La page sur la vraie tablette (Chromium du kiosque) et sur la RT (Chromium 106) ; le toucher réel.
- Les formulations anglaises et espagnoles : non relues par un locuteur.
- Le harnais complet n'a pas été lancé (consigne) : seule l'étape `screens`, et par une copie temporaire qui saute la mesure préalable de la Bibliothèque, en échec sur la base aussi (§ 5). L'étape `screens` du `browser-run.cjs` réel échoue donc dans cet environnement, avant comme après F1.
- La géométrie de la carte Verdict pendant un cadrage en cours ou avec une bande de refus : le harnais n'injecte pas ces états ; ils ne sont prouvés qu'en DOM simulé (`test-cnc-frame.cjs`).

## 9. Ce que l'essai réel devra prouver

1. `M5`, puis Z monte **seul** jusqu'à Z machine −5,000, et X/Y ne partent qu'ensuite ; Z ne baisse jamais (aucune ligne Z quand Z est déjà en haut).
2. Aux quatre coins, la position machine vaut coin + zéro pièce à 0,05 mm (ce qui prouve que la carte applique le zéro affiché, doute C9) ; un côté de 100 mm dure environ 10 s.
3. Arrêter et Pause pendant la montée et pendant un côté : arrêt en quelques millimètres, sans alarme ni bannière, référence et zéro gardés, aucun mouvement ensuite.
4. Fermer la page qui a lancé, ou prendre la main ailleurs, arrête le cadrage ; un « feed hold » de CNCjs classique l'arrête et il ne repart pas.
5. Avec la pièce, broche débranchée : le rectangle parcouru est celui de la pièce, et le programme part ensuite de la hauteur laissée par le cadrage.
