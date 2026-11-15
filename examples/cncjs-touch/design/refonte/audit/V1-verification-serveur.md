# V1 — Contre-vérification des constats « serveur » (phase 2)

Agent « contre-vérification : serveur », 2026-11-15, branche `feat/refonte-ui`, HEAD `20aeac36`. Aucun fichier existant modifié, rien commité, rien poussé. Aucun accès à la tablette, à la RT ni à la CNC.

Ce fichier remplace la version de 05:41 laissée par un premier passage du même rôle : je l'ai prise comme brouillon, puis j'ai tout revérifié. Les verdicts ci-dessous sont les miens, appuyés sur ce que j'ai relu et relancé dans ce passage.

**Méthode.** Pour chaque constat : relecture du code cité sur tout le chemin d'exécution ; test de preuve relancé seul (`npx jest <fichier> --coverage=false`) puis lu ; recherche d'une garde ailleurs, d'une décision documentée (`TESTING.md`, `PROFILES.md`, `PERFORMANCE-UI-SPEC.md`, commentaires du code) et des faits de la carte (§ 2 du prompt de mission, `FIRMWARE.md`). Après mes verdicts, j'ai lu le second avis d'Astra (`scratchpad/refonte/V4/astra-surete.md`). Je signale les désaccords avec lui. Ses dangers nouveaux côté serveur sont relus au § 4.

**Lancé dans ce passage.**
- Les dix `bughunt-A1-*.test.js`, un par un : 19 échecs et 3 témoins verts, exactement comme annoncé par A1.
- A4-12 : un mutant de `plate-probe.js` (`+2` remplacé par `+1`), branché par une configuration Jest jetable (`moduleNameMapper` sur `./plate-probe.js`). D'abord un mutant bloquant (`+1000`), pour vérifier que la substitution marche : S38 échoue. Ensuite le mutant `+1` : S38 passe, `block-probe.test.js` passe (45/45), `job-service.test.js` aussi (205/205).
- Trois tests nouveaux, non commités, ESLint propre, chacun lancé seul :
  - `src/server/services/touch/__tests__/bughunt-V1-1.test.js` (V1-1) : 2 échecs ;
  - `src/server/services/touch/__tests__/bughunt-V1-2.test.js` (V1-2) : 1 échec, 1 témoin vert ;
  - `src/server/services/touch/__tests__/bughunt-V1-3.test.js` (preuve de A4-3 étendue à la plaque, ce n'est pas un constat V1) : 1 échec, 1 témoin vert.

## 1. Tableau

| Id | Verdict | Gravité | En une phrase |
|---|---|---|---|
| A1-1 | confirmé | sécurité machine | `readyFor('start')` ne lit jamais `programCheck` : un programme prouvé hors course part. |
| A1-2 | confirmé avec réserve | sécurité machine | Le `WCO` rapporté n'est jamais recoupé avec `$#`. La machine exécute autre chose que ce que l'écran a vérifié, mais la nature du danger dépend de l'essai E-B. |
| A1-3 | confirmé avec réserve | sécurité machine | X et Y ne sont jamais vérifiés, même quand `homeMpos` a appris la convention. C'est une lacune de D1, pas un faux feu vert. |
| A1-4 | confirmé avec réserve | sécurité machine | Après un redémarrage de la carte, `$X` suffit pour démarrer avec une origine machine fausse. Le refus est une décision nouvelle, à prendre au-delà de D1. |
| A1-5 | confirmé avec réserve | sécurité machine (programme) ; à corriger (pas) | Aucune marge avant la limite logicielle. La marge ne doit porter que sur le côté opposé à la prise d'origine. |
| A1-6 | confirmé avec réserve | sécurité machine (course) ; à corriger (surveillance) | Le zéro Z à la plaque ne contrôle pas la course : réaliste avec une plaque mince sur ce montage. La surveillance manquante ne laisse qu'une descente bornée. |
| A1-7 | confirmé avec réserve | sécurité machine | Le palpage au bloc ne recoupe pas le repère actif de `$#`. Danger conditionnel à E-B, mais le serveur ne sait pas lequel des deux cas il a devant lui. |
| A1-8 | confirmé avec réserve | bloquant | Personne n'envoie `$I` ; `readSettings` est refusé en alarme et le feeder jetterait la ligne. Une sortie existe, cachée côté page (A2-7). |
| A1-9 | confirmé avec réserve | mineur | Chemin exact, sans effet sur la LUNYEE (`$HX` y fait les trois axes). |
| A1-10 | confirmé | bloquant | `postBacklight` ne regarde que la session. Partie serveur de A3-1. |
| A1-11 | confirmé | à corriger | Enveloppe XYZ symétrique trop large ; les chiffres exacts de T7 sont retrouvés. |
| A1-12 | confirmé | à corriger | `r.reset` efface `r.alarm` : le code de l'alarme est perdu dès la bannière. |
| A1-13 | confirmé | mineur | Seul `laserCheck` compare S à `$30`. |
| A1-14 | confirmé | mineur | M5 en alarme : la ligne est jetée par le feeder alors que le message dit « envoyé ». |
| A4-1 | doublon de A1-7 | sécurité machine | Même chemin : `block-probe.js:911-925 → 778-785 → 841/868/886`. |
| A4-2 | confirmé avec réserve | à corriger | Libérer le pilotage ouvre le port à Socket.IO jusqu'au superviseur suivant (100 ms au plus). Astra le classe en sécurité machine. |
| A4-3 | confirmé | sécurité machine | Un `gcode:stop` Socket.IO au repos, entre deux lignes, ne touche pas la séquence. Vrai aussi pour la plaque (prouvé par test). |
| A4-4 | confirmé avec réserve | mineur | La minuterie de `halt.js` n'est pas liée au démarrage, mais l'entrelacement nuisible demande un automate qui réagit en 50 ms. Astra le classe en sécurité machine. |
| A4-5 | doublon de A1-5 | à corriger | Partie « pas » de A1-5. |
| A4-12 | confirmé | à corriger | Prouvé par mutant : avec `+1`, S38 et 250 tests passent. |
| A4-13 | confirmé | à corriger | Le faux Grbl du bloc utilise un seul décalage pour le rapport, les cibles et `$#` ; ni limite, ni MPos 0 au reset. |
| A4-14 | confirmé | mineur | S27 n'appelle que deux `prepare` et n'asserte pas la commande système. |
| FW-R2 | confirmé | mineur | `TOLERANCE_MM = 0.001` élargit la course au lieu de la réduire. Fait partie de A1-5. |
| SIM | confirmé | à corriger | Les écarts entre les simulateurs et la carte relevés par A1 et A5 sont exacts. J'en ajoute deux. |
| V1-1 | nouveau, confirmé (test) | à corriger | Un zéro (plaque ou « zéro ici ») posé avant la prise d'origine, après un redémarrage de la carte, est accepté puis faux après `$H`, sans rien qui le dise. |
| V1-2 | nouveau, confirmé (test) | sécurité machine | Arrêter juste après le départ du zéro Z à la plaque : aucun feed hold, la descente continue. Relevé d'abord par Astra (N1). |

### Défauts qui n'en font qu'un

- **Contrôle des courses au départ (D1)** : A1-1, A2-1 (page) et A1-3. A1-1 et A2-1 sont la même règle absente, côté serveur puis côté page. A1-3 est distinct mais lié : sans lui, D1 ne peut rien refuser en X et en Y sur cette machine.
- **Décalage de travail (D2)** : A1-2 = A2-2 (page, cause serveur). A1-7 = A4-1 en sont le cas du palpage au bloc. La plaque (A1-6) y est exposée aussi. **A1-4 et V1-1 ne sont pas ce défaut** : là, `$#` et le rapport sont d'accord, c'est l'origine machine elle-même qui a bougé. D2 ne les attrape pas.
- **Marge** : A1-5 = A4-5 (partie « pas ») = FW-R2 (partie « contrôle du programme »). Une seule constante, une seule correction.
- **Arrêt d'une séquence du serveur par une autre voie** : A4-2 (libération du bail), A4-3 (arrêt Socket.IO), V1-2 (Arrêter de la tablette sans ligne « en vol » pour la plaque) et la partie « surveillance » de A1-6. Ce sont quatre trous distincts, mais une même correction les couvre : une séquence du serveur (bloc ou plaque) s'arrête de façon synchrone, avec feed hold si une ligne est en vol, avant que la main soit rendue.
- **Relecture** : A1-8 côté serveur, A2-7 côté page.
- **Rétroéclairage** : A1-10 est la partie serveur de A3-1.
- **Simulateurs** : A4-13 est le cas particulier, pour le faux Grbl du bloc, de la section SIM.

### Ordre recommandé des corrections

1. Profil « LUNYEE » des simulateurs (SIM, A4-13) : sans lui, aucun test de D1 ou de D2 n'est probant.
2. D2 (A1-2, A1-7) **avant** D1 : sans D2, le refus de D1 tomberait juste après chaque `$H`, sur des verdicts calculés avec `WCO:0`.
3. A1-3, puis A1-1 (D1), avec la marge de A1-5 dans le même contrôle.
4. L'arrêt synchrone des séquences (A4-3, V1-2, A4-2, surveillance de A1-6).
5. A1-4 et V1-1 (référence perdue), sur décision de l'orchestrateur.
6. Le reste.

---

## 2. Fiches

### A1-1 — Départ d'un programme prouvé hors course (D1, T2)

**Relu.** `job-service.js:753-846` (`readyFor`) : pour `start`, il vérifie le repos, la broche, le chargement, le mode laser et les unités ; il ne lit aucun verdict. `:1708-1737` (`prepare start`) : le contrôle est seulement joint au ticket (`ticketOf(checkProgram(...))`). `:1801-1832` (`start`) : `readyFor` est refait après `sameFileAsLoaded`, puis `gcode:start`. `:1275` : `programCheck` est calculé à chaque instantané, sans rien bloquer. `program-check.js:582-602` produit bien `outside`.

**Lancé.** `bughunt-A1-1.test.js` : 1 échec, reçu `["gcode:load", "gcode:start"]`. L'entrée est réaliste : la découpe de T2 (Z −20,76 sur un G54 Z −115), avec les réglages de la LUNYEE et une prise d'origine vue.

**Réfutation cherchée.** Je n'ai trouvé aucune garde ailleurs ; la page active Confirmer sur la seule case cochée (A2-1). La décision contraire est écrite (`TESTING.md:429` « It warns, it does not block », `job-service.test.js:2290` « the start is not blocked »), mais D1 la remplace.

**Verdict.** Confirmé, sécurité machine.

**Correction recommandée.**
- Le refus vit dans `readyFor('start')`, donc au `prepare` **et** au `start`, avec un contrôle recalculé à chaque appel : un zéro posé pendant les 15 s du ticket change le décalage.
- Le refus ne tombe que sur un dépassement prouvé : axe `outside`, machine référencée et, une fois D2 fait, décalage prouvé.
- Code propre, par exemple `ETOUCH_START_OUTSIDE`, avec `axis`, `min`, `max`, `low`, `high` et l'écart en millimètres (phrase de P7).
- Dérogation par une confirmation distincte, liée à l'empreinte du fichier, aux dépassements présentés et à la session de la carte, puis journalisée. La dérogation ne lève jamais D2 ni A1-4.
- Le préambule d'une reprise (`job-load.js:253`) passe par le même refus.
- Tests à réécrire : `job-service.test.js:2283-2326`. La partie `unknown` reste vraie ; l'étape `$132: 40` → `outside` doit maintenant refuser le départ.
- Fichiers : `job-service.js`, `program-check.js` ; `SURETE.md` ; `TESTING.md:429` à mettre à jour.

### A1-2 — `WCO` rapporté jamais recoupé avec `$#` (D2, T3)

**Relu.**
- `GrblRunner.js:76-84` : `wpos = mpos − wco`, avec le `WCO` du dernier rapport qui en portait un ; sur la carte, il est nul après `$H`.
- `program-check.js:496-526` : `offset = mpos − wpos` pour le repère actif ; `parameters` n'est lu que si le programme choisit un **autre** repère (`:503-514`).
- `job-service.js:1353-1375` transmet `parameters` sans les comparer.
- Personne n'envoie `$#` hors du palpage au bloc (`block-probe.js:914` est la seule écriture de `$#` du service).
- Aucune garde de décalage dans `readyFor`, `zeroZReady` ni `blockReady`.

**Lancé.** `bughunt-A1-2.test.js` : 4 échecs. Le premier appelle `checkProgram` avec `parameters` ; les trois autres passent par le service avec un rapport `WCO:0`, qui est le fait de terrain.

**Réfutation cherchée, et réserve.** Selon `FIRMWARE.md` § 3.b, le `WCO` rapporté et le décalage exécuté sont la même variable dans le code amont. Si la carte fait de même (probable ; essai E-B), le contrôle a raison après `$H` : le « Z hors course » de T3 serait vrai, et le programme s'exécute en coordonnées machine (X0 Y0 au coin d'origine, Z0 en haut), à côté de la pièce ou dans les brides. Si au contraire la carte exécute le G54 de `$#` en rapportant 0, le contrôle se trompe dans les deux sens, comme le dit A1. **Dans les deux cas, la machine fait autre chose que ce que l'écran a vérifié.** Le constat tient ; les mots « faux hors course » et « faux feu vert » ne valent que dans la seconde hypothèse.

**Précision sur la plaque.** `plate-probe.js:237` et `:244` envoient des cibles en coordonnées de travail tirées du rapport. Dans la seconde hypothèse, avec un écart de 115 mm, la cible du premier `G38.2` sort presque toujours de la course de cette machine : `ALARM:2`, levée avant tout mouvement selon le code amont (R5), puis redémarrage. Le dégagement `G0` qui viserait 115 mm sous le contact n'est atteint que si cette cible reste dans la course. Le garde `cz <= z0 − recherche` (`:239-241`) arrête aussi la séquence quand le contact est plus loin que la recherche. Le risque principal sur la LUNYEE est donc la perte de la référence, pas un rapide dans la pièce.

**Verdict.** Confirmé avec réserve (la nature du danger dépend de E-B). Sécurité machine.

**Correction recommandée (D2).** Celle de A1 est juste, avec ces précisions :
- comparer `$#[repère actif] + G92 + TLO (Z)` au `WCO` d'un rapport qui porte **réellement** le champ `WCO:` et qui est **postérieur** à la réponse à `$#` (`r.wcoAt`, `job-service.js:298-301`, le distingue déjà). La carte n'envoie ce champ qu'un rapport sur dix (R9) : l'attente doit être bornée et ne pas refuser au premier rapport qui n'a pas le champ ;
- en cas d'écart, recharger au repos par `G55` puis `G54` (ou par G54 puis le repère actif), une ligne acquittée à la fois, puis relire `$G` (aucun mot d'axe, état modal inchangé). Ne pas recharger par `G10` automatique : il réécrit l'origine ;
- la transaction reconnaît ses propres changements de repère, sinon elle invalide sa preuve en boucle ;
- tant que ce n'est pas prouvé, `programCheck` rend `unknown` avec un code propre, jamais `outside` ni `validated` ; départ, reprise, plaque, bloc et cadrage laser sont refusés avec un code ;
- `$#` en alarme : la carte l'accepte (R10), mais le feeder de CNCjs le jette (`GrblController.js:343-347`). Il faut passer par `writeln`, comme `$H` et `$X` ;
- remarque utile : tout `G10 L20` sur le repère actif (zéro d'axe, fin du bloc, plaque) recharge déjà le décalage (fait de terrain). Le cas dangereux est « `$H` puis départ sur l'ancien G54 », sans aucun zéro posé ;
- coût en tests : les faux contrôleurs de `job-service.test.js` ne répondent pas à `$#`. Il leur faut deux profils, « LUNYEE » et « Grbl standard » ;
- fichiers : `job-service.js`, `program-check.js`, `plate-probe.js`, `block-probe.js`, `motion.js` (cadrage) ; `SURETE.md`.

### A1-3 — Axes à bit `$23` jamais vérifiés

**Relu.**
- `program-check.js:563-577` : bit posé → `ETOUCH_CHECK_HOMING_DIRECTION`, `low` reste nul, aucune comparaison.
- `job-service.js:1353-1375` ne transmet ni `homeMpos`, ni `wcoSeen`, ni `wposReported`.
- `job-service.js:288-293`, `:313-327` : `homeMpos` n'est appris que pour notre propre `$H` vu en `Home` (`r.sawHome`).
- `motion.js:169-218` (`envelopeOf`) : avec `homeAt` à 0 sous le même `$23`, l'axe ne garde que `[0, course]`. Le serveur s'en sert déjà pour les déplacements.

**Lancé.** `bughunt-A1-3.test.js` : 2 échecs (`unknown` au lieu de `validated` ou `outside`). Les préconditions passent : le déplacement continu est autorisé en X et en Y, donc la convention est apprise.

**Réfutation cherchée.** La décision est documentée (`PROFILES.md:60` : « the tablet cannot tell which »). Elle vaut tant que la convention est inconnue. Elle ne vaut plus quand le serveur l'a apprise et l'applique aux déplacements : il est alors incohérent avec lui-même. `FIRMWARE.md` R1 confirme `[0, +course]` pour un axe à bit posé dans la famille Grbl_ESP32.

**Verdict.** Confirmé avec réserve.
- Quand `homeMpos` est nul (cycle lancé du PC, ou pas de rapport `Home` vu : soupçon A1-9), `unknown` reste juste.
- Comme le note Astra, c'est une lacune de couverture de D1, pas une fausse validation.
- Gravité gardée en sécurité machine : sans ce constat, un dépassement X ou Y (T2 en X ou Y) ne peut jamais être refusé.

**Correction recommandée.** Juste et minimale.
- `machineForCheck` transmet `homeAt: r.homeMpos`, `wcoSeen` et `wposReported`.
- `checkProgram` prend ses bornes par `envelopeOf` : une seule candidate → bornes ; deux candidates → `unknown` comme aujourd'hui.
- Importer `envelopeOf` de `motion.js` avec l'extension `.js` (chargement ESM natif de `preview-server.cjs`).
- Tests : `program-check.test.js:366` reste vert (pas de `homeAt`).
- Fichiers : `job-service.js`, `program-check.js`.

### A1-4 — Redémarrage de la carte, puis `$X`, puis départ

**Relu.** `job-service.js:386-423` (`r.reset` : `homed = false` ; un programme non démarré reste chargé) ; `:1105-1112` (`$X`) ; `readyFor` n'a aucune garde de référence ; `program-check.js:470-472` donne `ETOUCH_CHECK_NOT_HOMED`, donc `unknown`, simple avertissement. Faits de terrain : MPos 0 sur place, G54 inchangé en mémoire.

**Lancé.** `bughunt-A1-4.test.js` : 2 échecs. Le premier rejoue la panne après le chargement ; le second fait `$X` puis le chargement puis le départ, ce qui couvre aussi le travail interrompu, puisque `readyFor` exige alors un rechargement (`:765-766`).

**Réfutation cherchée.** Il n'y a aucune garde, et D2 ne l'attrape pas : après le redémarrage, la carte recharge G54 depuis sa mémoire, donc le rapport et `$#` sont d'accord. Sur un Grbl standard, un reset garde la position (`FIRMWARE.md` § c) ; sur cette carte, non. D1 dit « `unknown` reste un avertissement » : le refus est une décision nouvelle, plus étroite.

**Verdict.** Confirmé avec réserve (décision à prendre). Sécurité machine : le premier `G0 Z5` vise une cible jusqu'à 110 mm sous l'outil, en rapide, dans la course logicielle.

**Correction recommandée.** Avec `$22=1` et `homed` faux depuis une bannière : refus codé du départ, de la reprise à une ligne et des zéros (voir V1-1), avec le remède « Prise d'origine ». Je recommande le refus sec, sans dérogation. Tests cassés : `job-service.test.js:2290-2292` (ticket de départ délivré machine non référencée) est à réécrire. Fichiers : `job-service.js` ; `SURETE.md`.

### A1-5 — Aucune marge avant la limite logicielle (avec A4-5 et FW-R2)

**Relu.** `program-check.js:16`, `:585` (tolérance de +0,001 vers l'extérieur) ; `motion.js:445-447` (pas : `target < low − 1e-6`) ; `motion.js:48` et `block-probe.js:322` (marge de 1 mm pour le continu et le bloc). `$27` n'apparaît nulle part dans `src/server/services/touch/`.

**Lancé.** `bughunt-A1-5.test.js` : 2 échecs. Une cible à −129,945 est `validated` ; un pas de 10 mm depuis −120 est envoyé (`$J=G91 G21 Z-10 F500`). L'entrée est réaliste.

**Réfutation cherchée, et réserves.**
1. La seule preuve d'une frontière à l'intérieur de la course est le fait de terrain. A5 (Hb1, Hb3) note qu'il pourrait venir d'un décalage mal connu. La marge reste justifiée par prudence, mais sa valeur est provisoire (essai E-A).
2. Pour le pas (`$J=`), le code amont répond `error:15` sans alarme (R3). Le risque est alors un refus invisible (A4-7), pas un redémarrage. La partie « pas » n'est grave qu'après E-A : je la ramène à « à corriger », comme Astra.
3. **Une marge des deux côtés serait fausse.** Après `$H`, la carte est à MPos 0 : la borne côté origine est atteinte par construction. `program-check.test.js:354-363` exige que les retraits `G53 G0 Z0` des posts Fusion restent `validated`.

**Verdict.** Confirmé avec réserve. Sécurité machine pour le contrôle des programmes (T2) ; à corriger pour les pas. A4-5 en est un doublon ; FW-R2 en est une partie.

**Correction recommandée.**
- Une constante unique, par exemple `SOFT_LIMIT_MARGIN_MM = 0.5`, dans un module partagé par `program-check.js` et `motion.js`.
- Elle s'applique **au seul côté opposé à la prise d'origine** : pour un axe dont le bit `$23` est posé, la borne haute ; sinon, la borne basse. Sur la LUNYEE : X haut, Y haut, Z bas. La règle vaut pour les deux conventions de `envelopeOf`.
- Elle s'applique au contrôle des programmes et aux pas. La tolérance d'arrondi de 0,001 va **vers l'intérieur**, ce qui règle FW-R2.
- Dans la bande de marge : `outside` avec un code propre (« à moins de 0,5 mm de la fin de course »), compté comme dépassement prouvé pour D1.
- Garder 1 mm pour le continu et les palpages. Revoir les six bornes après E-A.
- Tests : aucun cassé n'est connu tant que la borne côté origine reste exacte ; les pas « jusqu'à la fin de course » de `motion.test.js` sont à revoir un par un.
- Fichiers : `program-check.js`, `motion.js` ; `SURETE.md`.

### A1-6 — Zéro Z à la plaque : ni course, ni surveillance

**Relu.** `plate-probe.js:58-124` (`zeroZReady` : ni `r.homed`, ni course) ; `:126-136` (recherche de 1 à 100 mm, sans tenir compte de la position) ; `:216-281` (seuls une alarme, une erreur, `cancelled` ou le délai l'arrêtent) ; `:207-209 → :271-280` (délai dépassé : échec déclaré, aucun ordre d'arrêt). `job-service.js:2107-2124` (`closeTransport` ne prévient que `moves` et `blockProbe`). Côté page, la recherche par défaut est de 10 mm (`job-resume.js:112-113`).

**Lancé.** `bughunt-A1-6.test.js` : 3 échecs (cible −160 envoyée ; rien après la fermeture du flux ; rien après la prise de pilotage).

**Réfutation cherchée.**
- **Course : réaliste.** La broche est au plus bas dans son support : le dessus d'une pièce posée sur la table est vers Z −125. Avec une plaque d'épaisseur e, l'outil à h au-dessus et la recherche par défaut, la cible vaut −135 + e + h. Elle sort de la course dès que e + h < 5 mm (plaque de 3 mm, outil à 2 mm). Selon R5, la carte contrôle la cible d'un `G38` : `ALARM:2`, redémarrage, référence perdue, ce qui ouvre ensuite A1-4.
- **Surveillance.** `G38.2` s'arrête au contact ou au bout de la recherche (100 mm au plus, à 100 mm/min, puis `ALARM:5`). L'Arrêter de la tablette passe toujours (`job-service.js:1908-1917`, sauf V1-2). Perdre le flux laisse une descente bornée, sans personne pour la voir.

**Verdict.** Confirmé avec réserve : sécurité machine pour la course, à corriger pour la surveillance. La plaque est aussi exposée à D2 (voir A1-2).

**Correction recommandée.**
- Course : machine référencée et course Z connue → refus si `Z machine − recherche` passe sous le bas + 1 mm, en disant de combien réduire. Machine non référencée : garder l'accès (c'est l'usage du changement d'outil en pause M6, machine référencée) et le dire.
- Surveillance comme le bloc : flux de l'appareil avec la grâce de rotation, bail, rapport périmé, délai. Arrêt par `haltPlan`/`halt`, avec un feed hold si une ligne est en vol (V1-2). Un `G0` de nettoyage après un échec sans reset (soupçon 4 de A1).
- Tests existants : les plaques de `job-service.test.js` ne font pas de prise d'origine, donc la garde de course ne s'y applique pas.
- Fichiers : `plate-probe.js`, `job-service.js` ; `SURETE.md`.

### A1-7 — Palpage au bloc : repère actif de `$#` non recoupé (A4-1 en doublon)

**Relu.** `block-probe.js:911-925` (CHECK : `$#` est lu, seuls G92 et TLO sont examinés) ; `:778-785` (`workTarget = WPos + (cible machine − MPos)`) ; `:841`, `:868`, `:886` (les `G38.3` en coordonnées de travail) ; `:821-829` (`move` en `G53 G1`, insensible au décalage) ; `:973-978` (le `G10 L20` final, calculé depuis MPos : juste dans tous les cas, et il recharge le décalage).

**Lancé.** `bughunt-A1-7.test.js` : 1 échec, reçu `["G38.3 Z-120 F100"]` avec `WCO:0` et `$#` G54 Z −115.

**Réfutation cherchée.** Si la carte exécute le décalage qu'elle rapporte (hypothèse probable d'A5), `workTarget` vise juste et le cycle est correct. Le danger (cible réelle à −235, ou liaison XY décalée de 100 mm) n'existe que si elle exécute le G54 de `$#` en rapportant 0. Le serveur ne sait pas lequel des deux : il ne doit pas palper.

**Verdict.** Confirmé avec réserve (danger conditionnel à E-B). Sécurité machine. A4-1 est le même défaut.

**Correction recommandée.**
- À l'étape CHECK, `$#` est déjà lu : comparer `parameters[repère actif]` à `MPos − WPos` d'un rapport postérieur qui porte `WCO:`.
- Écart de plus de 0,001 → échec codé (`ETOUCH_PROBE_OFFSET`) avant tout mouvement, origine inchangée.
- Cette garde fait doublon avec D2 dans `blockReady`, et c'est voulu.
- Tests : le faux Grbl du bloc répond à `$#` avec le même décalage, donc rien ne casse ; ajouter le cas « WCO nul, `$#` G54 » (A4-13).
- Fichier : `block-probe.js`.

### A1-8 — Version Grbl jamais relue seule ; relecture refusée en alarme

**Relu.** `motion.js:127-130` (la version est exigée pour tout déplacement réel). `GrblController.js:1013-1019` (`initController` n'écrit que `$$`). `job-service.js:425-438` (`[VER:]` capté par `r.raw`). `job-service.js:1671-1676` (`idle(c)` exige Idle ; `$I` part par le feeder). `GrblController.js:343-347` (le feeder vide tout en alarme).

**Lancé.** `bughunt-A1-8.test.js` : 2 échecs (rien n'est écrit en 10 s au repos ; refus en alarme).

**Réfutation cherchée.** Astra objecte que `$$` est relu automatiquement et qu'une sortie existe. C'est exact pour les réglages, pas pour la version : sans elle, `capabilities.jog` reste fermé. La sortie existe (Relire au repos ; en alarme, `$X` puis Relire), mais elle est cachée côté page (A2-7).

**Verdict.** Confirmé avec réserve. Bloquant pour l'opérateur (T10) ; c'est la fonction D4.

**Correction recommandée.**
- Écrire `$I` par `writeln` (pas par le feeder), une fois par contrôleur et par démarrage, quand la version est inconnue. Conditions : carte en Idle ou en Alarm, aucun travail, aucune séquence du serveur, aucune ligne en vol, pour que son `ok` ne soit compté par aucun `answers()`.
- Reprise bornée : par exemple 3 essais espacés de 5 s.
- `readSettings` accepté en alarme, écrit par `writeln`.
- Tests cassés : `job-service.test.js:812-813` attend `['gcode', ['$I', '$$']]` par `c.command` ; `:819` reste vrai.
- Fichier : `job-service.js`.

### A1-9 — Prise d'origine partielle vue de l'extérieur

**Relu.** `index.js:113-119` (`fullHoming` faux pour `$HX`), `job-service.js:2126-2143` (`foreignHome = null`), `:334-356` (`homed = true` sur Home → Idle ; `homeMpos` nul sans cycle prouvé).

**Verdict.** Confirmé avec réserve. Sans effet sur la LUNYEE (`$HX` fait les trois axes, `FIRMWARE.md` E2, R7). L'effet y est inverse : X et Y restent ambigus jusqu'à un `$H` de la tablette. Mineur. Aucune correction pour ce lot.

### A1-10 — Toute session peut éteindre l'écran du kiosque

**Relu.** `api.touch.js:146-164` (seule la session compte), `index.js:183`, `backlight.js:107-119` (`dim(0)` écrit `0` ; `dim(p > 0)` baisse aussi).

**Lancé.** `bughunt-A1-10.test.js` : 1 échec, 2 témoins verts.

**Verdict.** Confirmé, bloquant (T1, D3). C'est la partie serveur de A3-1.

**Correction recommandée.**
- `temporary` (toute valeur, pas seulement 0) n'est accepté que si `req.socket.remoteAddress` vaut `127.0.0.1`, `::1` ou `::ffff:127.0.0.1`. Ne lire ni `req.ip` ni `X-Forwarded-For`.
- `wake` reste accepté de partout. Une page distante reçoit un 403 codé, que la page ignore sans bruit.
- Tests cassés : `api/__tests__/api.touch.test.js:224-229` (le faux `req` n'a pas d'adresse) est à compléter avec une adresse locale.
- Non vérifié : que le kiosque ouvre bien la page par la boucle locale.

### A1-11 — Enveloppe du palpage XYZ plus large que le trajet

**Relu et recalculé.** `block-probe.js:299-307` : `rY = max(latéral, s + 1 + |face|)`, appliqué des deux côtés. Trajet réel (`:937-958`, `:856-898`, `originOf` `:157-159`), en posant u = d·(Y − S) (u > 0 vers le bloc) :
- traversée à u = −L ;
- touches jusqu'à u = −L + s + 1 ;
- contact accepté par `inWindow` pour u ∈ [−r − fenêtre, −r) ;
- retour à l'origine, u ∈ [−fenêtre − d·face, −d·face).

Avec le profil du 14 novembre (r = 3, s = 10, fenêtre 8, L = 12, face −9,9, d = +1, S = 15), le trajet va de Y 3 à Y 24,9. L'enveloppe déclarée va de −5,9 à 35,9 : ce sont les chiffres de T7. Chaque cible passe déjà par `inside()` (`:771-776`).

**Lancé.** `bughunt-A1-11.test.js` : 1 échec, 1 témoin vert (un départ à Y 12,5 reste refusé).

**Verdict.** Confirmé, à corriger (T7, T8). C'est un garde trop strict, sans danger.

**Correction recommandée.**
- Par axe, en u : bas = min(−L, −fenêtre − d·face) ; haut = max(0, −L + s + 1, −d·face). Remettre ces bornes en coordonnées machine selon d.
- `inside()` ne change pas ; il continue de borner chaque cible, retour compris.
- Changement d'un garde : à inscrire dans `SURETE.md`.
- Tests : `block-probe.test.js:557-560` (enveloppe de `3049a0e4`) est à mettre à jour.
- Fichier : `block-probe.js`.

### A1-12 — Code de l'alarme effacé par la bannière

**Relu.** `job-service.js:370-372` (`r.alarm` posé) ; `:386-391` (`r.reset` : `r.alarm = null`) ; `:1301` (`alarmCode`). Le journal n'est écrit (`:381-383`) que pendant un travail démarré. Même effacement après un Arrêter qui fait un reset.

**Verdict.** Confirmé, à corriger (P8 : « ce qui s'est passé »).

**Correction recommandée.** Garder `lastAlarm { code, at, startups }` jusqu'à la prochaine prise d'origine réussie, publié à part de `alarmCode`, et l'inscrire au journal dans tous les cas. Fichier : `job-service.js`.

### A1-13 — S au-dessus de `$30` jamais signalé (profil CNC)

**Relu.** `program-check.js:647-649`, `job-service.js:1373`. `FIRMWARE.md` R11 confirme l'écrêtage après la correction de broche.

**Verdict.** Confirmé, mineur.

**Correction recommandée.** Une information codée, pas une raison qui ferait `unknown`, en réutilisant `sMax`. Fichiers : `program-check.js`, `job-service.js`.

### A1-14 — « Arrêt broche (M5) envoyé » en alarme

**Relu.** `job-service.js:924-934` (aucune condition sur l'état de la carte), `:1775-1777`, `GrblController.js:343-347`.

**Verdict.** Confirmé, mineur : une alarme de limite arrête déjà la broche.

**Correction recommandée.** En alarme, répondre « La broche est arrêtée par l'alarme » sans rien écrire.

### A4-2 — Libérer le pilotage pendant un palpage

**Relu.** `job-service.js:1613-1614` → `control.js:199-212` (`release` supprime le bail, rien d'autre ; l'événement ne va qu'à l'historique, `index.js:33-46`). `control.js:235-243` (`authorize` sans bail : tout passe). `index.js:121-140`. `block-probe.js:621-637` (le superviseur voit l'absence de pilote au plus 100 ms après).

**Réfutation cherchée.** Il faut qu'une personne libère le pilotage pendant le palpage et qu'une autre envoie une ligne du PC dans ces 100 ms. Une ligne passée par le feeder est en plus vidée par `feeder:stop` à l'arrêt. Ensuite, l'arrêt (`!` puis reset) coupe aussi la broche. Le risque est réel, mais étroit. Pas de test écrit : le chemin a été lu.

**Verdict.** Confirmé avec réserve. Je ramène la gravité à « à corriger » ; Astra la garde en sécurité machine.

**Correction recommandée.** `release` et `takeover` arrêtent d'abord, de façon synchrone, la séquence du serveur en cours (bloc, plaque), puis rendent le bail. Fichiers : `job-service.js` (branche `control`), `block-probe.js`, `plate-probe.js`.

### A4-3 — Arrêt Socket.IO sans effet sur la séquence

**Relu.**
- `control.js:43-44` : `gcode:stop`, `stop`, `feeder:stop`, `reset` et `feedhold` sont des commandes sûres.
- `index.js:121-133` : la commande est autorisée et `socketCommand` n'est appelé que pour une commande non sûre, donc le service n'apprend rien.
- `GrblController.js:1424-1445` : `gcode:stop` fait un hold seulement en Run et un reset seulement en Hold après 500 ms, et rien sans `force`.
- `Workflow.js:30-35` : `stop()` n'émet rien quand le workflow est déjà idle, donc l'observateur de `job-service.js:535-548` ne voit rien pendant un palpage.
- `block-probe.js:615-637` : le superviseur ne connaît pas cet ordre.
- `plate-probe.js:195-198` ne regarde que `cancelled`.

**Lancé.** `bughunt-V1-3.test.js`, pour la plaque : un `gcode:stop` au repos après le premier contact, et `G0 Z11` part quand même. Le témoin passe : l'Arrêter de la tablette au même instant arrête bien la séquence. Pour le bloc, j'ai lu le chemin, je ne l'ai pas testé. Un `reset` Socket.IO arrête bien le bloc (bannière, puis `onStartup`).

**Verdict.** Confirmé, sécurité machine : un Stop qui ne stoppe pas, pour le bloc comme pour la plaque. C'est le reste ouvert du § 3.

**Correction recommandée.**
- Dans `refuseSocket`, pour une commande ou une écriture d'arrêt (`gcode:stop`, `stop`, `feeder:stop`, `feedhold`, `reset`, `!`, `\x18`), appeler d'abord un `service.socketStop(port)`.
- `socketStop` annule de façon synchrone la séquence du serveur (bloc : `stop` ; plaque : `cancelled`, plus `halt` avec feed hold si une ligne est en vol). L'accès reste libre, sans bail.
- Fichiers : `index.js`, `job-service.js`, `block-probe.js`, `plate-probe.js` ; un test dans `__tests__/index.test.js`.

### A4-4 — Arrêt différé et bannière externe

**Relu.** `halt.js:59-99` : la boucle n'est pas liée à `startups` ; elle s'arrête sur Alarm et envoie le reset sur Idle, Hold:0 ou à l'échéance. `block-probe.js:996-1008`, `:1016-1019` : le verrou est libéré dès la bannière. `job-service.js:386-388` : `r.seen = null` à la bannière.

**Réfutation cherchée.** Après la bannière, toute opération exige un rapport frais (`available()`) et une nouvelle confirmation, puisque le ticket est révoqué. La boucle lit ce même premier rapport dans les 50 ms :
- Alarm → elle s'arrête ;
- Idle → elle envoie un reset au repos, sans dommage, avant qu'un humain ait pu confirmer quoi que ce soit.

Sur la LUNYEE (`$22=1`), la carte revient en Alarm. Le reset nuisible exige un client automatique qui agit dans ces 50 ms, sur une carte qui revient en Idle.

**Verdict.** Confirmé avec réserve. Je ramène la gravité à « mineur » ; Astra la garde en sécurité machine, en invoquant un script.

**Correction recommandée.** Bon marché et sûre : `halt` mémorise `r.startups` au départ et abandonne si une bannière est venue depuis. Fichier : `halt.js`.

### A4-12 — S38 ne distingue pas un rapport de deux

**Lancé.** Voir l'en-tête : le mutant `+1` survit à `block-probe.test.js` (45/45) et à `job-service.test.js` (205/205). Le mutant bloquant prouve que la substitution marche.

**Verdict.** Confirmé, à corriger. C'est une faiblesse des tests, pas du code.

**Correction recommandée.** Celle d'Astra : injecter séparément `ok`, le premier Idle et le second Idle, et affirmer qu'aucune ligne n'est partie après le premier. À faire dans `block-probe.test.js`, et pour la plaque dans `job-service.test.js`.

### A4-13 — Faux Grbl du bloc sans les anomalies de la carte

**Relu.** `block-probe.test.js:111-124` (`g.offset()` sert au rapport, aux cibles et à `$#`) ; `:133-143` (`reset` garde `g.m`) ; `:300-306` (prise d'origine à 0,0,0, décalage intact) ; aucune borne `$130-$132`.

**Verdict.** Confirmé, à corriger.

**Correction recommandée.**
- Séparer le décalage mémorisé (`$#`), le décalage exécuté et le décalage rapporté.
- Options « LUNYEE » : `WCO` nul après `$H` jusqu'à un `G10` ou un changement de repère ; `ALARM:2` sur une cible hors course **à l'analyse**, puis bannière et MPos 0 ; reset en mouvement → MPos 0.
- Fichiers : `block-probe.test.js`, ou un faux Grbl partagé dans `__tests__/`.

### A4-14 — S27 annonce plus qu'il ne prouve

**Relu.** `block-probe.test.js:1090-1105`. Les gardes réelles existent dans le code.

**Verdict.** Confirmé, mineur.

**Correction recommandée.** Appeler `load`, `macro`, `motion jog` et `reserveSystemCommand`, puis vérifier le rejet et l'absence d'écriture.

### FW-R2 — Tolérance de 0,001 « dans le mauvais sens »

**Relu.** `program-check.js:16`, `:585` : `min < low − 0,001`, donc une cible à −130,0009 passe. Le code amont compare strictement (`FIRMWARE.md` § a).

**Verdict.** Confirmé, mineur : 1 µm, sans effet devant la frontière observée (0,055 à 0,265 mm à l'intérieur). Fait partie de A1-5 : la marge vers l'intérieur la remplace.

La tolérance de position de `motion.js:61` (0,001 pour dire si la position **actuelle** est dans une enveloppe) est d'une autre nature et doit rester.

### SIM — Écarts entre les simulateurs et la carte

**Relus et exacts dans `grbl-simulator/grbl-simulator.js`.**
- `:49-50` : `WCO` tous les 30 rapports en travail, contre 10 sur la carte (R9).
- `:73` : version 1.1h.
- `:174-179` : `$20`, `$21`, `$22` et `$23` à 0.
- `:394-410` : limite contrôlée pendant le mouvement, sans ligne `ALARM:2`, position gardée.
- `:2213-2232` : `|pos| > course`, symétrique (Z +130 accepté).
- `:2093-2135` : `$H` amène à 0,0,0, décalage intact.
- `:837-838` et `:902` : `$HX` → `error:3`.
- `:1311` et suivantes : `$J=` sans contrôle de course.
- `:2141-2192` : reset en mouvement → `ALARM:3` et bannière, position gardée.

Les faux contrôleurs de `job-service.test.js` et `motion.test.js` ne répondent pas à `$#` et n'envoient pas de `WCO`.

**Verdict.** Confirmé, à corriger (§ 4.5).

**À ajouter au profil LUNYEE.**
- La limite s'applique aussi aux cibles `G38` (R5).
- Après `ALARM:2`, la carte ne répond plus jusqu'à un reset (code amont, R3). Le profil LUNYEE choisit « redémarrage » (observé) ; le profil standard garde l'autre comportement.

---

### V1-1 (nouveau) — Zéro posé sur une machine non référencée, faux après la prise d'origine

**Chemin.**
1. Après `ALARM:2` ou un Arrêter en mouvement, la carte revient à MPos 0 sur place (fait de terrain).
2. L'opérateur fait `$X`, puis pose un zéro :
   - `motion.js:926-933` (`originReady` : fonction, repos, repère connu, **aucune exigence de référence**) → `G10 L20 P1 …` ;
   - ou `plate-probe.js:58-124`, qui n'a pas d'exigence de référence non plus.
3. Le G54 est écrit relativement à la fausse origine.
4. La prise d'origine qui suit (`job-service.js:313-327`) remet `homed` à vrai ; rien ne marque le zéro posé avant comme périmé. `programCheck` perd sa raison `NOT_HOMED` et redevient `validated`. D2 ne voit rien : `$#` et le rapport sont d'accord.

Le palpage au bloc exige déjà la référence (`block-probe.js:419`).

**Lancé.** `bughunt-V1-1.test.js` : 2 échecs. Après la bannière et `$X` (préconditions vérifiées : `unlock` écrit, `homed` faux), le serveur délivre les tickets `zeroZ` et `set-origin`.

**Portée sur la LUNYEE.** L'origine de travail se décale de toute la position machine réelle du point d'arrêt.
- En Z, ce décalage va toujours vers le haut, puisque Z ≤ 0 : usinage dans le vide, ou `ALARM:2` en haut.
- En X et Y, le décalage va vers le coin d'origine : programme au mauvais endroit, brides comprises. Mais il faut avoir posé un zéro X ou Y sur une machine non référencée, où les pas sont limités à 1 mm.

Le cas réaliste est donc « je refais Z à la plaque, puis `$H` » : un travail perdu plutôt qu'une casse.

**Gravité.** À corriger. P8 exige de dire si l'origine de la pièce est encore valable. La fonction D4 « zéro d'un axe à l'origine machine » doit exiger `homed` dès sa création.

**Correction recommandée.**
- Avec `$22=1` et `homed` faux : refus codé de `set-origin` et de `zeroZ`, avec le remède « Prise d'origine ».
- Exception : le changement d'outil en pause M6, où la machine est référencée et n'est donc pas gênée.
- Variante plus douce, à décider : mémoriser `originSetAt { startups, homed }` et publier « origine posée avant la prise d'origine : à refaire », avec refus du départ comme pour A1-4.
- Fichiers : `motion.js`, `plate-probe.js`, `job-service.js` ; `SURETE.md`.

### V1-2 (nouveau) — Arrêter juste après le départ du zéro Z à la plaque : aucun feed hold

Signalé d'abord par Astra (V4, « N1 ») ; relu et prouvé ici.

**Chemin.**
- `Feeder.js:113-115` : le feeder remet `pending` à faux dès qu'il envoie sa dernière ligne.
- Pendant au plus une période de sondage (250 ms), le dernier rapport dit encore Idle.
- `job-service.js:1908-1917` (branche `r.probing` de `stop`) : `haltPlan(c)` rend `''` (`halt.js:33-58` : Idle, file vide, broche arrêtée). `feeder:stop` et `gcode:stop` partent sans `force`, donc rien n'est écrit en Idle, et `halt(c, '')` ne fait rien.
- La réponse dit « Palpage interrompu » et le verrou est libéré, alors que le `G38.2` déjà écrit descend jusqu'au contact ou au bout de la recherche.
- Le bloc a la garde qui manque ici (`block-probe.js:575-577` : `probing.outstanding` → `'hold'`).

**Lancé.** `bughunt-V1-2.test.js` : 1 échec, aucun `feedhold` ni `reset`. Le témoin passe : le même Arrêter, une fois Run rapporté, envoie le feed hold.

**Gravité.** Sécurité machine. La fenêtre est étroite (250 ms après chaque ligne), mais c'est précisément le moment où l'opérateur voit que la pince n'est pas en place, et l'outil descend alors dans la pièce, jusqu'à la recherche (10 mm par défaut), à 100 mm/min.

**Correction recommandée.**
- Suivre la ligne en vol de la plaque (`r.probing.outstanding`, posé à l'envoi et levé à `quiet`) et en déduire `'hold'` comme le bloc.
- Garder `r.probing` jusqu'à un rapport postérieur au repos, ou jusqu'à la bannière.
- Fichiers : `plate-probe.js`, `job-service.js` ; `SURETE.md`.

---

## 3. Soupçons

### Soupçons d'A1

| # | Statut | Ce que j'en sais |
|---|---|---|
| 1 Décalage exécuté quand `WCO:0` | reste un soupçon | Dans le code amont, c'est la même variable, donc il est probablement nul aussi ; le binaire est modifié. À trancher par l'essai E-B, avec une petite commande lente dont les deux trajectoires possibles restent dégagées. |
| 2 `$27=2` et la course utile du côté opposé | reste un soupçon | Le code amont pose `Home/Mpos ± $27`, la carte pose 0. Si `$130` a été mesuré d'interrupteur à interrupteur, l'interrupteur opposé est à course − 2 mm et le continu (course − 1 mm) le toucherait. À trancher par E-A, en approche lente par `$J=G53`. |
| 3 `$J=` hors limite | reste un soupçon | Code amont : `error:15` sans alarme. E-A tranche, et fixe la gravité de la partie « pas » de A1-5. |
| 4 `G38.2` modal après un échec de la plaque | tranché par la lecture : chemin réel, effet faible | `plate-probe.js:271-280` n'envoie aucun `G0` ; les programmes Vectric fixent `G0`/`G1` en tête. Mineur ; à corriger avec A1-6. |
| 5 `homed` vrai sans cycle | chemin réel, entrée improbable | `job-service.js:313-317` : un Idle reçu 1 s après notre `$H`, sans Home vu ni `ok`, suffit. Il faut un `$H` perdu sur la ligne. Exiger l'`ok` du `$H` durcirait sans dépendre du soupçon 9. |
| 6 Arrêter refusé sur un rapport périmé | tranché : chemin réel, mineur | `job-service.js:1918-1921`. Recommandation : avec un rapport de plus de 2,5 s, ne pas dire « Aucun travail » ; envoyer un feed hold et le dire. |
| 7 Paquet du flux plus gros que le tampon | reste un soupçon | Angle A3 et mesures. |
| 8 Reset au repos sur la LUNYEE | reste un soupçon | Essai E-1. |
| 9 Rapports pendant la prise d'origine | reste un soupçon | `homeMpos` exige un Home vu (`job-service.js:326`). Le code amont répond à `?` pendant le cycle ; le commentaire de `job-service.js:1872-1873` (« Grbl reports nothing during the cycle ») le contredit. Essai E-D. A1-3 en dépend. |
| 10 Test broche sans surveillance | tranché : chemin réel, mineur | Rien n'arrête `M3` à la perte du flux. À décider : `M5` sur perte du flux de l'appareil qui l'a lancé. |
| 11 Identité du pilote | tranché : chemin réel, par conception | Le `clientId` est pris du corps et publié. Le bail protège des maladresses, pas d'un client qui triche. Mineur. |

### Soupçons d'A4

| Soupçon | Statut | Ce que j'en sais |
|---|---|---|
| Pas pendant une prise d'origine annoncée | tranché : chemin réel, à corriger | `job-service.js:1117-1120` pose `r.homing`, puis `motion.js:362-393` (`atRest`) ne regarde jamais `r.homing` (aucune occurrence dans `motion.js`). Avec un dernier rapport encore Idle (250 ms, ou jusqu'à 2,5 s si la carte ne rapporte rien pendant le cycle), un pas part, d'un autre appareil par exemple. La carte le garde en tampon et l'exécute après le cycle, depuis l'origine, d'une distance validée sur l'ancienne position. Correction d'une ligne : `atRest` (et `zeroZReady`) refusent quand `homingActive(r)`. |
| Nettoyage `G0` non confirmé | reste un soupçon | `block-probe.js:1051-1057` : `G0` sans attendre son `ok`. Il n'a d'effet que si ce `G0` est refusé ou perdu. |
| Contrat « deux rapports Idle » | réfuté | `plate-probe.js:203` exige deux rapports après l'`ok` et Idle au dernier. Le second est postérieur d'au moins une période de sondage, donc le mouvement a commencé. Seul le commentaire `:175-177` est imprécis. |

## 4. Dangers nouveaux d'Astra (V4), relus côté serveur

Ces dangers sont hors de ma liste. Je les ai relus parce qu'ils touchent `src/server/**` ; seul N1 a été prouvé par un test.

| Astra | Mon verdict | Gravité | Note |
|---|---|---|---|
| N1 Arrêter HTTP de la plaque sans hold | confirmé (test) | sécurité machine | Devient V1-2 ci-dessus. |
| N2 Départ après la perte du flux ou du pilotage | confirmé par lecture | à corriger | `job-service.js:1801-1832` : le ticket est consommé avant `sameFileAsLoaded` ; au retour, seul `readyFor` est refait (ni bail, ni transport) ; un Arrêter dans cette fenêtre répond « Aucun travail à arrêter » et le départ part. La fenêtre est la durée de la relecture du fichier (quelques millisecondes à quelques centaines). Correction : revérifier le bail, le transport et un drapeau « départ annulé » posé par Arrêter, juste avant `gcode:start`. |
| N3 Espaces dans les nombres (`Z-1 40`) | confirmé par lecture | mineur | `program-check.js:58-66` lit Z−1 ; Grbl ôte les espaces et lit Z−140. Entrée irréaliste pour des programmes Vectric ; refuser (`unknown`) une ligne où un nombre est suivi d'espaces puis de chiffres. |
| N4 `G49` avec un TLO hérité | confirmé par lecture | mineur | `G49` n'est pas traité comme un changement de décalage (`program-check.js:228-249`). Les posts Vectric en mettent un en tête, sans effet tant que TLO = 0, ce qui est le cas sur ce montage. Avec D2 (TLO lu) : Z `unknown` si TLO ≠ 0 et que le programme contient `G49`. |
| N5 Reprise qui hérite de `G93` | décision documentée, contestable | mineur | `resume.js:384-389` : `checkFeedMode` est vide exprès (commentaire). La carte est en G94 après la mise sous tension, un reset ou M30. |
| N6 Socket.IO pendant une réservation système | confirmé par lecture | mineur | `refuseSocket` ne consulte que le bail. Effet physique non établi : le Wi-Fi ne coupe pas la liaison série. |
| N7 Lignes `$x=` dans un fichier | confirmé par lecture | mineur | Une ligne `$20=0` ne produit aucun mot et passe sans raison. Entrée irréaliste ; à lister comme non interprétée, donc `unknown`. |
| N8 `0x9E` libre pour tous | confirmé par lecture | mineur | `control.js:49`. C'est une bascule, en Hold seulement ; un premier appui arrête la broche. |

---

## 5. Ce que je n'ai pas vérifié

- Rien sur la vraie carte, la Surface ni la RT. Les réserves de A1-2, A1-5, A1-7 et A1-3 (soupçon 9) dépendent des essais E-A, E-B et E-D.
- Je n'ai lancé ni la suite Jest entière ni le harnais. Lancés seuls : les dix `bughunt-A1-*`, mes trois `bughunt-V1-*`, puis S38, `block-probe.test.js` et `job-service.test.js` **avec le mutant**. Je ne les ai pas relancés sans mutant : la base saine est celle de `BASE.md`.
- A4-2, A4-4, A1-9, A1-12, A1-13, A1-14, N2 à N8 et la partie « bloc » de A4-3 sont prouvés par le chemin, sans test.
- Les tests existants que chaque correction casserait sont relevés par une recherche ciblée, pas en appliquant les corrections. D'autres peuvent casser, surtout pour D2 (faux contrôleurs sans `$#`) et côté page.
- Non relus : `resume.js` hors du préambule et de `checkFeedMode`, `history.js`, `projects.js`, `wifi.js`, `touch-stream.js`, `job-load.js` hors des lignes citées, `GrblController.js` hors du feeder, de `gcode:stop` et de `initController`.
- Non vérifié : que le kiosque ouvre la page par `127.0.0.1` (A1-10).
- Les tests `bughunt-V1-*` reprennent le faux contrôleur minimal de `bughunt-A1-6.test.js` : ils rejouent des rapports, ils ne simulent pas la carte.
