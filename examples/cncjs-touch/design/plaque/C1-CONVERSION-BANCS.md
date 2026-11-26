# C1 — conversion des bancs existants : relevé changement par changement

Annexe de `C1-RAPPORT.md` (§ 5). Les quatre parties ci-dessous sont les notes de travail des quatre passes de conversion (groupes A à D), telles qu'elles ont été relevées fichier par fichier, suivies du relevé du banc `cnc-frame.test.js` et des 42 entrées de table de `manual-jog-banner.test.js`. « Ancien code » = copie du commit `d6851c6e` hors de l'arbre.

**Deux corrections apportées après ces notes** (elles l'emportent sur le texte des notes) :

1. Groupe A, `job-service.test.js`, test « a resume whose preamble omits G94… » : l'attente modifiée (`ETOUCH_START_FEED_MODE` → `ETOUCH_MOTION_SPINDLE_UNKNOWN`) a été **remise à sa valeur d'origine**. La preuve de broche de C1 a été déplacée à la fin des gardes du départ (`readyFor`), pour que les refus existants gardent leur place. Ce test est vert sur les deux codes.
2. Groupe C, `block-probe.test.js`, S17 : l'attente modifiée a été **remise à sa valeur d'origine** (« La broche est commandée (M3 ou M4)… »). Les preuves C1 du palpage au bloc passent après ses propres gardes. Les trois tests rouges signalés (S3, S13, S42) sont verts : dérivation arrondie, flux relu avant l'écriture, phrases ajoutées au catalogue ; S13 attend en plus que la ligne de dégagement soit écrite avant de fermer le flux (changement de temporisation).

Restent donc **quatre** tests dont une attente change (liste et justification : `C1-RAPPORT.md` § 5).

---

# Notes du fork A — conversion des bancs (job-service, api.touch-e2e, index, touch-stream)

Numéros de ligne : ceux des fichiers après conversion. Aucune source hors tests modifiée, `line-bench.js` non modifié, aucune commande git d'écriture.

## (e) Résultats exacts

| Fichier | Nouveau code | Ancien code (`old.sh`, d6851c6e) |
|---|---|---|
| `job-service.test.js` | 225 / 225 | 224 / 225 (1 rouge voulu, voir (d)) |
| `api.touch-e2e.test.js` | 7 / 7 | 7 / 7 |
| `index.test.js` | 14 / 14 | 14 / 14 |
| `touch-stream.test.js` | 16 / 16 | 16 / 16 |
| Les quatre ensemble | 4 suites, 262 / 262 | 3 suites vertes, 1 rouge ; 261 / 262 |

ESLint sur les quatre fichiers : propre. Avant conversion, sur le nouveau code : 116, 4, 7 et 1 tests rouges.

## 1. `src/server/services/touch/__tests__/job-service.test.js`

### (a) Entrées du banc (fonctions d'aide, setups)

1. **`c1Bench(c)`** (l. 17-50), nouvelle fonction du fichier, appelée dans les **huit** faux contrôleurs du fichier, juste après `c.runner.state = c.state` (l. 71, 3199, 3516, 3766, 3969, 4131, 4353, 4731) :
   - `lineBench(c)` : toute émission `status` / `parserstate` devient une ligne lue par le vrai `GrblRunner` ;
   - `c.gc()` : l'échange `$G` de CNCjs, rapport modal **puis `ok`**. Il redit l'état modal que le test a donné en dernier (émis, ou écrit dans `c.state.parserstate`), avec `spindle: 'M5'` **sauf si le test nomme un mode de broche** ;
   - un `c.gc()` est fait **de lui-même avant un rapport d'état** dans trois cas : avant le premier rapport du contrôleur ; quand le dernier échange a 500 ms à l'horloge du banc (`c.clock`) ; avant le premier rapport qui suit une bannière (`startup`). `c.gcOff = true` les coupe.
   - Ce que cela ajoute par rapport à avant : des événements `parserstate` + `ok` que les bancs n'émettaient pas. Vérifié sur l'ancien code : seuls les tests listés en (b) en dépendaient.
2. **`c.clock = () => ctx.now`** posé dans chaque setup qui a `ctx.controllers = { TEST: ctx.c }` (13 endroits) : c'est ce qui donne l'échéance de 500 ms ci-dessus. Les contrôleurs créés sans setup n'ont pas d'horloge : un seul échange, avant leur premier rapport.
3. **État par défaut des faux contrôleurs** : `status: { activeState: 'Idle', spindle: 0 }` au lieu de `{ activeState: 'Idle' }` (l. 64, 3193, 3510, 3760, 3963), pour que leurs rapports portent `FS:0,0`. Les trois contrôleurs des bancs de jog (l. 4131, 4353, 4731) avaient déjà `spindle: 0`.
4. **Bancs de jog** (xvf l. 4156, xvg, xvh) : un **second rapport au repos** à la fin de leurs trois `setup` (l. 4195, 4418, 4801). Le setup xvf reçoit l'option `mposOnly` (l. 4156, 4185) : supprime `wpos` de l'état avant le premier rapport, pour qu'aucun rapport ne dise de `WCO:` (tests R1).
5. **Banc de la plaque** (`probeController`, l. 1757-1830) :
   - sa ligne brute de rapport porte désormais `|FS:0,0|WCO:<mpos − wpos de l'état>` (avant : `<État|WPos:0,0,z[|Pn:P]>`). Sans `WCO:`, Touch ne connaît pas le Z machine (il ne le reprend plus de l'état fusionné) ;
   - après l'`ok` de chaque ligne et ses trois rapports, **un échange `$G` (M5 + ok) puis un rapport**, à `3 × delay` (l. 1816-1822), sauf en alarme. C'est une temporisation et un rapport ajoutés par ligne ;
   - `plate()` et ses deux copies en ligne (l. 1835, 1970, 1996) : un second rapport au repos après la prise d'origine.
6. **`machineReady`** (describe F2, l. 2625) : son `$G` dit `spindle: 'M5'` (avant : `{ wcs, units, distance }` sans mode de broche).

### (b) Tests dont l'entrée change, un par un

| Test (ligne) | Changement | Raison |
|---|---|---|
| « P5: fromLine times the rebuilt resume… » (172) | `spindle: 0` dans l'état remplacé | Le test remplaçait tout l'état sans vitesse : départ refusé sans `FS:` complet. |
| « N1: the check of a library file… » (202) | idem | Même littéral (cohérence ; ne démarre pas). |
| « N1: a feed move before the plunge is timed only while the machine is known in G94 » (223) | idem | Même littéral (cohérence ; ne démarre pas). |
| « P5: a large loaded program exposes time progress at %i%% feed… » (deux cas, 244) | idem | Départ refusé sans `FS:`. |
| « the snapshot follows this run… » (273) | idem | Départ refusé sans `FS:`. |
| « a program that sets neither units nor distance mode… » (500-508) | `c.gcOff = true` jusqu'à la première attente (qui porte sur l'absence de `$G`), puis `false` ; `modal()` dit `spindle: 'M5'` | Sans cela l'échange automatique donnait un `$G` frais ; ensuite le départ exige M5. |
| « the work offset seen at start holds… » (618-624) | `$G` du test avec `spindle: 'M5'` ; `c.gcOff = true` avant `ctx.now += 10000` | Le test émet son `$G` après le premier rapport ; il veut ensuite un `$G` qui vieillit. |
| « a program that selects or changes an offset… » (637-643) | idem | Idem. |
| « reports the real feed rate and spindle speed… » (816) | `delete ctx.c.state.status.spindle` avant le premier rapport | Le contrôleur du banc rapporte maintenant une vitesse par défaut ; ce test part sans vitesse (`spindleSpeed: null` attendu). |
| « macros are listed by name only… » (958-961) | `mpos` 0,0,0 dans l'état, deux rapports au lieu d'un | Une macro part d'un repos prouvé (position portée par deux rapports Idle). |
| « without FS in the reports, a spindle commanded on in a fresh $G still blocks » (1192) | `c.gcOff = true` | Le test donne chaque `$G` lui-même et en laisse vieillir un. |
| « a macro sent (feeder busy)… » (2221-2224) | `mpos` + second rapport | Repos prouvé pour la macro. |
| « a program that leaves its units to the machine, a stale $G… » (2729) | `c.gcOff = true` avant `ctx.now += 3000` | `$G` qui doit vieillir. |
| R1 « $10=1 en cache mais rapports WPos… » (4286-4293) | `setup({ mposOnly: true })` ; un rapport ajouté après le rapport qui apporte le `WCO:` | Scénario « aucun WCO reçu » : sinon `lineBench` dit le `WCO:` déduit de l'état. Le premier rapport qui donne la position travail remet le compte de repos à 1. |
| R1 « une ligne Grbl 0.9… » (4299) | `setup({ mposOnly: true })` | Même scénario sans WCO. |
| R1 « redémarrage de carte… » (4310-4316) | `setup({ mposOnly: true })` ; second rapport après la bannière | Pour que le refus attendu reste celui de la course / du référencement, pas celui du repos. |
| xvh « plusieurs redémarrages avant ok, puis Alarm… » (4879) | `ctx.tick(100)` au lieu de `ctx.tick(50)` après le retour à Idle | Deux rapports au repos avant le nouveau pas. |
| « a coded refusal is published with its code and values… » (5232-5234) | `mpos` + un rapport de plus avant `ctx.loaded()` | `canMacro: true` attendu : repos prouvé. |
| « a resume whose preamble omits G94… » (5331-5334) | `c.gcOff = true` ; `modal()` dit `spindle: 'M5'` | Le test donne chaque `$G` et en laisse vieillir un. |
| « a rebuilt preamble that sets G94 may start with an inherited G93… » (5360) | `$G` du test avec `spindle: 'M5'` | Émis après le premier rapport, sans rapport ensuite : il doit dire M5 lui-même. |
| Tous les tests de « Z zero with a touch plate » | par le banc (a.5) | — |
| Tous les tests des bancs de jog xvf / xvg / xvh | par le setup (a.4) | — |

### (c) `expect` modifiés

Un seul.

- **« S4 … › a resume whose preamble omits G94 requires a recent G94 at prepare and at start »**, l. 5343-5345 :
  avant `rejects.toMatchObject({ code: 'ETOUCH_START_FEED_MODE' })` → après `rejects.toMatchObject({ code: 'ETOUCH_MOTION_SPINDLE_UNKNOWN' })`.
  Justification : à cet endroit le `$G` a 3 s. Dans `readyFor('start')`, `spindleProven` (C1) passe avant le contrôle du mode d'avance ; un `$G` de plus de 2,5 s ne prouve plus la broche arrêtée, donc le refus est celui de la broche. Le départ reste refusé jusqu'à un `$G` récent, ce que le test voulait prouver ; seul le code du refus change. Les quatre autres `ETOUCH_START_FEED_MODE` du même test (avec un `$G` frais) sont inchangés.

### (d) Rouge sur l'ancien code après conversion

- Ce même test, et lui seul : l'ancien code rend `ETOUCH_START_FEED_MODE` là où l'attente dit maintenant `ETOUCH_MOTION_SPINDLE_UNKNOWN`. Rouge voulu, pour la raison du (c).

## 2. `src/server/api/__tests__/api.touch-e2e.test.js`

- (a) `lineBench(c)` dans `fakeController` (import par `'../../services/touch/__tests__/support/line-bench'`). L'état du banc avait déjà `spindle: 0`, `mpos`, `wpos` et un `parserstate` avec M5 : rien d'autre au niveau du banc.
- (b) « jog activé : B arrête le jog de A… » : un `report()` de plus après le retour à Idle (deux rapports au repos avant le pas).
- (c) Aucun `expect` modifié. (d) Rien de rouge sur l'ancien code.

## 3. `src/server/services/touch/__tests__/index.test.js`

- (a) `lineBench(c)` dans `fakeController`.
- (b) Fonction `plateRunning` (sept tests C-09 / C-12 / SURETE C-02) : la ligne brute devient `<État|MPos:150.000,120.000,-100.000|FS:0,0|WCO:100.000,100.000,-115.000>` (le `WCO:` est MPos − WPos de l'état que le test écrit déjà) ; un second `report('Idle')` avant le `$G`. Raison : sans `WCO:` la position travail Z est inconnue de Touch ; repos prouvé pour le départ du palpage.
- (c) Aucun `expect` modifié (`G38.2 Z-5 F100` inchangé). (d) Rien de rouge sur l'ancien code.

## 4. `src/server/services/touch/__tests__/touch-stream.test.js`

- (a) `lineBench(c)` dans `fakeController` (`return lineBench(c)`).
- (b) « closing a stream revokes its confirmations… » : avant le rapport, un `$G` `{ wcs: 'G54', spindle: 'M5' }` ; la ligne brute passe de `<Idle|MPos:4,5,6>` à `<Idle|MPos:4,5,6|FS:0,0>`. Raison : le ticket de départ exige la broche prouvée arrêtée.
- (c) Aucun `expect` modifié. (d) Rien de rouge sur l'ancien code.

## (f) Soupçons et remarques sur le code (rien corrigé)

1. **Ordre des gardes de `readyFor('start')`** : `spindleProven` passe avant les contrôles modaux (G94, G21 / G90). Avec un `$G` ancien, l'opérateur lit donc « État de la broche non confirmé » au lieu de « attendre un état modal ($G) récent » ou du refus G94. Pas un défaut de sûreté (le départ est refusé dans les deux cas), mais la phrase est moins précise ; c'est la cause du seul `expect` changé.
2. **Le premier rapport qui apporte un `WCO:`** remet `r.still` à 1 (la position travail passe de inconnue à connue, `near(null, objet)` est faux). Carte en `WPos:` sans WCO reçu : le premier mouvement après l'arrivée du premier `WCO:` attend un rapport de plus. Sans effet sur la LUNYEE en `MPos:` dès le premier rapport après bannière (qui porte `WCO:`), sauf si ce premier rapport ne le porte pas. À dire comme limite, pas à corriger.
3. **Après une bannière**, `proof.init` vide `r.gc` : tout mouvement gardé par la broche est refusé (`…SPINDLE_UNKNOWN`) jusqu'au `$G` suivant. Attendu par la conception (§ 3.5) ; relevé parce qu'un banc s'y est heurté (xvh « plusieurs redémarrages »), résolu dans le banc par l'échange `$G` refait après bannière.
4. **`lineBench` et le `WCO:` déduit** : dès que l'état d'un banc a `mpos` et `wpos`, le premier rapport dit un `WCO:`, donc `r.wcoSeen` devient vrai sur l'ancien code aussi. Deux tests (R1) reposaient sur l'absence de WCO ; traités dans le banc par `mposOnly`. D'autres forks peuvent rencontrer le même cas.
5. Rien vu qui ressemble à un défaut du nouveau code dans ces quatre fichiers.


---

# Notes du fork B — conversion des bancs (C1, étape 3)

Fichiers : `motion.test.js`, `motion-release.test.js`, `manual-jog-banner.test.js`, `release-hand.test.js`, `motion-simulator.test.js`, `cnc-frame-lunyee.test.js` (dossier `src/server/services/touch/__tests__/`). Aucun autre fichier modifié, aucune source, pas `line-bench.js`, pas `sim-bridge.js`, aucune commande git d'écriture. Deux copies temporaires de tests (`zz-banner-tmp.test.js`, `zz-lunyee-tmp.test.js`) ont servi à relever des différences puis ont été supprimées.

## (e) Résultats exacts

| Fichier | Nouveau code | Ancien code (copie d6851c6e, `old.sh`) |
|---|---|---|
| `motion.test.js` | 217 / 217 | 216 / 217 (1 rouge voulu, voir d) |
| `motion-release.test.js` | 7 / 7 | 7 / 7 |
| `manual-jog-banner.test.js` | 2 / 2 | 1 / 2 (1 rouge voulu, voir d) |
| `release-hand.test.js` | 8 / 8 | 8 / 8 |
| `motion-simulator.test.js` | 4 / 4 (lancé 4 fois) | 4 / 4 |
| `cnc-frame-lunyee.test.js` | 11 / 11 (lancé 2 fois) | 11 / 11 |
| Ensemble des six | 6 suites, 249 / 249, 86,3 s | 247 / 249, 81,0 s |

ESLint propre sur les six fichiers.

## motion.test.js

### (a) Entrées du banc (setup et fonctions d'aide)

1. `fakeController()` (banc principal) et le second `fakeController()` de « cross-check 7 » : `return lineBench(c)`.
2. `ctx.report()` du banc principal n'émet plus `status` sans contenu : il émet la ligne brute de l'état écrit par le test, construite dans le banc (`ctx.line()`) : `<État|MPos:x,y,z|FS:avance,vitesse>` ; `MPos:` seulement si X, Y, Z sont des nombres ; `FS:` seulement si l'état a une vitesse ; **jamais de `WCO:`**. Raison : la dérivation automatique `WCO = MPos − WPos` de `line-bench.js` rendait `wcoSeen` vrai dans tous les tests et cassait, sur l'ancien code, les scénarios « aucun WCO reçu » (8 tests rouges sur l'ancien code avant ce choix). Les jogs ne lisent que la position machine : aucun test de ce fichier n'a besoin d'un WCO que le test ne donne pas lui-même.
3. Même chose pour `ctx.report(payload)` du banc « cross-check 7 » : ligne `MPos` + `FS:0,<vitesse>`, et un champ `WCO:` seulement quand le test en donne un, avec les valeurs mêmes qu'il donne (entières ou non : `WCO:-1,0`, `WCO:,0,0`, `WCO:NaN,0,0`).
4. `ctx.gc()` ajouté (deux bancs) : l'échange `$G` de CNCjs, rapport modal `G0 G17 G21 G90 G94 M5 M9` **puis `ok`**. Dans le banc principal il ne nomme un repère (`G54`…) qu'une fois que le test en a donné un par `ctx.modal(wcs)` (le même) : sinon les tests « repère de travail inconnu » changeaient sur l'ancien code. `ctx.modal` retient le repère donné (`ctx.wcs`).
5. Fin de `setup()` (deux bancs) : un rapport Idle de plus, puis `ctx.gc()`.
6. `ctx.tick()` (deux bancs) : un `ctx.gc()` toutes les 500 ms de temps de banc, quand le tick fait des rapports. Option nouvelle `{ gc: false }` dans le banc principal.
7. `ctx.motion()` (deux bancs) : pour `jog` et `jog-start` seulement, **deux rapports de l'état écrit par le test avant la demande**. Raison : les tests écrivent la position dans l'état puis demandent le mouvement sans rapport ; l'ancien code lisait l'état, le nouveau lit les rapports. `jog-keepalive`, `jog-stop` et `ctx.req` ne font aucun rapport.
8. `homeOurs()` : un second rapport Idle après la fin du cycle.
9. `homePc()` : le rapport final passe par une ligne brute : `<Idle|MPos:x,y,z|FS:0,0>`, `<Idle|WPos:x,y,z|FS:0,0>` pour `wpos: true`, `<Idle|FS:0,0>` pour `end: null` (avant : charge fabriquée `{ activeState, mpos[, wpos] }` ou `{ activeState }`).
10. Les deux `runnerSetup()` (vrai GrblRunner, lignes du test) : `motion()` rejoue d'abord deux fois la dernière ligne d'état reçue, puis `[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]` et `ok` (`rest()`, exposé aussi au test).

### (b) Tests dont l'entrée change, un par un

- Six émissions `emit('status', { activeState: 'Idle', mpos: { ...ZERO } })` (tests « origine du PC… », lignes ~1257 à ~1405) : remplacées par la ligne brute `<Idle|MPos:0.000,0.000,0.000|FS:0,0>` (même contenu).
- « $13=1 or unknown, a stale report… » et « rapport périmé (> 2,5 s) : pas et continu refusés » : la demande passe par `ctx.req('motion', …)` au lieu de `ctx.motion` (sans les deux rapports, sinon le rapport n'est plus périmé).
- « repère inconnu (modal périmé), pause M6, travail, alarme : refus » : `ctx.tick(2600, { gc: false })` (l'état modal doit vieillir).
- « après une origine du PC, une ALARM:1 puis une bannière… » : `ctx.gc()` après la bannière (la bannière oublie le `$G` d'avant ; sinon le refus de broche précède « non constaté »).
- « $23=3, origine complète demandée par CNCjs du PC… » : un `ctx.report()` de plus après `homePc` (second rapport au repos, avant la lecture de `continuousReason`).
- « un redémarrage de la carte oublie le WCO reçu » (vrai GrblRunner) : `t.rest()` avant chacune des deux lectures de `continuousReason`.

### (c) Attentes modifiées

Un seul test : « référencé, position machine inconnue : 10 mm refusé, 1 mm permis, continu refusé » (ligne 1005), renommé « … : 10 mm, 1 mm et continu refusés (position non confirmée) ».
- Avant : pas de 10 mm et continu refusés par `/position machine X inconnue/`, pas de 1 mm **accepté**, `written = ['$J=G91 G21 X1 F500\n']`.
- Après : les trois refusés avec le code `ETOUCH_MOTION_NO_POSITION`, `written = []`.
- Justification : R-1 et § 2.2 de la conception (« vaut pour tout pas, 0,01 mm compris ») : des rapports sans position refusent tout mouvement.

### (d) Rouge sur l'ancien code

Ce seul test (l'ancien code écrit le pas de 1 mm) : voulu.

## manual-jog-banner.test.js

- (a) `fakeController()` : `lineBench(c)`. Dans `scenario()` : après les trois rapports de mise en place, un rapport Idle de plus puis l'échange `$G` (modal avec `M5`, puis `ok`).
- (c) **42 entrées** des tables `EXPECTED` / `WITH_F4_RELEASE` (test « the manual moves, a banner included… », assertion ligne 864) : seul le tableau `snaps` change, et seulement l'instant où `canJog` (K) revient après un mouvement : **un rapport (50 ms) plus tard** (par exemple `8650:K -` → `8700:K -` ; ou `8650:K cancelled/transport/U` → `8650: cancelled/transport/U`, `8700:K cancelled/transport/U`). `lines`, `cancels` et `refused` sont identiques dans les 42 entrées (vérifié : 0 différence d'octets). Justification : repos prouvé = deux rapports Idle positionnels concordants (R-2), là où un rapport suffisait. La liste complète avant → après est dans la liste en fin de ce document (42 lignes ; 21 clés `step / …`, 21 `continuous / …`). Un commentaire d'en-tête du fichier le dit.
- (d) Ce test est rouge sur l'ancien code (les 42 instants) : voulu. L'autre test du fichier est vert des deux côtés.

## motion-release.test.js

- (a) `fakeController()` : `lineBench(c)`. Fin de `setup()` : `ctx.gc` défini (modal avec `M5` puis `ok`), un rapport Idle de plus, `ctx.gc()`.
- (b) « erreur pendant un Jog étranger sans fin… » : `ctx.gc()` avant `tryAll` (le `$G` de la mise en place a 80 s ; la macro de `tryAll` exige désormais la broche prouvée arrêtée, et c'est son ticket qui libère la relecture des réglages).
- (c) Aucune attente modifiée. (d) Aucun rouge sur l'ancien code.

## release-hand.test.js

- (a) `fakeController()` : `lineBench(c)`. Fin de `setup()` : `ctx.gc` défini, un rapport Idle de plus, `ctx.gc()`.
- (b), (c), (d) : rien.

## motion-simulator.test.js (simulateur, vraies lignes)

- (a) `beforeEach` : après `homed === true`, attendre aussi `motion.canJog === true` et `motion.continuousReason.X === ''` (temporisation). Raisons : le second rapport Idle arrive 25 ms après celui qui finit la prise d'origine ; et le premier `[GC:]` du pont est analysé avant que le service n'écoute, le suivant vient à 500 ms.
- (c) Aucune attente modifiée ; mêmes octets, même ordre. (d) Vert sur l'ancien code.
- (g) Durée : 4,7 s avant (ancien code, banc d'origine), 5,5 à 5,7 s après (environ + 0,25 s par test, l'attente du `$G`).

## cnc-frame-lunyee.test.js (simulateur, profil LUNYEE, vraie D2)

- (a) Test L7/L10 seul : l'attente « Idle et D2 plus en vérification » demande aussi que le refus `ETOUCH_MOTION_NO_POSITION` ait disparu de `refusals.jog` (sinon, pendant les 25 ms entre le premier rapport Idle et le second, il précède `ETOUCH_CNC_FRAME_NOT_HOMED`).
- (c) Aucune attente modifiée ; les assertions d'octets (lignes du cadrage, `0x85`, rien après la bannière) sont inchangées et vertes des deux côtés. (d) Vert sur l'ancien code.
- (g) Durée : 85,2 s avant (ligne de base), 85,4 à 85,7 s après. Attentes par ligne, lues dans le journal `frame` (champ `waits`, ms entre la fin constatée d'une ligne et l'envoi de la suivante ; pont : rapports toutes les 25 ms, `$G` toutes les 500 ms) : de 0 à 375 ms, par exemple `[61,0,61,0,63,0,187]`, `[64,0,63,61,64,61,252]`, `[313,63,63,61,50,250]`, `[249,125,375,126]`. Compteurs du journal : `noXyz` 0 et `noFs` 0 dans les douze cadrages relevés.

## (f) Soupçons sur le code

- Aucun défaut constaté. À savoir : `sim-bridge.js` injecte `[GC:]` sans son `ok` ; un `[GC:]` qui tomberait entre l'écriture d'une ligne et son `ok` ferait avaler cet `ok` par le suivi (`parserReply`). Non observé dans les 6 lancements (le simulateur acquitte tout de suite), et c'est le comportement d'avant C1, mais C1 allonge le temps passé entre deux lignes.
- Faux refus bref constaté au banc (attendu par la conception § 3.5) : juste après une prise d'origine ou un déverrouillage, un mouvement demandé dans les 25 ms (250 ms sur la machine) est refusé `ETOUCH_MOTION_NO_POSITION`, et dans la demi-seconde qui suit une connexion `ETOUCH_MOTION_SPINDLE_UNKNOWN`, le temps du premier `$G`. Dans le plan du cadrage, `ETOUCH_MOTION_NO_POSITION` passe avant `ETOUCH_CNC_FRAME_NOT_HOMED` (ordre de `moveReady`).
- `canJog` revient un rapport plus tard après chaque mouvement (42 instants du tableau de `manual-jog-banner`).


---

# Conversion des bancs, groupe C (plate-probe, block-probe, work-offset, reference-guard, start-travel)

Aucun source hors tests modifié, ni `line-bench.js`, ni `sim-bridge.js`. Aucune commande git d'écriture. ESLint propre sur les cinq fichiers.

## (f) Soupçons de défaut du NOUVEAU code (à traiter par l'auteur : ils laissent 3 tests rouges dans block-probe.test.js)

1. **block-probe.js, `send` : une ligne part pendant que le flux de l'appareil est absent.** Ordre actuel : `ensure()` → attente du flux (`if (!streamOpen()) …`) → `if (session.last) { await waitFor(() => !missing(), …); ensure(); … }` → écriture. Si le flux se ferme (rotation) PENDANT l'attente des preuves, rien ne revérifie `streamOpen()` avant `c.command`. Test S13 (`block-probe.test.js:1044`) : rotation au pas `Z_CLEAR` ; la ligne `Z_CLEAR` n'était pas encore écrite (elle attendait son `[GC:]`), elle part 1 tick plus tard sans flux : `sent.length` 5 au lieu de 4. Ancien code : vert. Correction suggérée : faire l'attente des preuves AVANT l'attente du flux, puis la revérification synchrone (`ensure`, `missing`, `moved`) juste avant l'écriture ; ou reboucler sur le flux après l'attente des preuves. Même question à se poser pour la plaque (elle n'a pas d'attente de flux : sans objet) et pour le cadrage CNC (`lostSince` est bien relu dans le pas de l'écriture : correct).
2. **report-proof.js, repère dérivé non arrondi.** `other = rep.xyz ± wcoKept` donne des flottants bruts (`-14.900000000000006`), là où CNCjs arrondissait au nombre de décimales du rapport (`toFixed`). Test S3 (`block-probe.test.js:885`) : `ok.blockProbe.work.x` attendu `-14.9`, reçu `-14.900000000000006`. Les lignes G-code écrites sont identiques (arrondies par `fmt`), mais la valeur publiée et les comparaisons à tolérance fine (`POS_TOL`, 0,01) lisent ce flottant. Correction suggérée : arrondir la dérivation (ex. 1e-6, ou aux décimales du champ brut).
3. **Catalogue de la page** : `ETOUCH_PROBE_SPINDLE` (nouveau dans `MESSAGES` de block-probe.js) absent de `touch/i18n-messages-machine.js` → S42 (`block-probe.test.js:1687`) rouge. Idem à prévoir pour `ETOUCH_PLATE_SPINDLE`, `ETOUCH_PLATE_POSITION`, `ETOUCH_MOTION_NO_POSITION`, `ETOUCH_MOTION_SPINDLE_*` (étape 4 du lot).
4. Remarque (pas un défaut sûr) : `plateReady` = `zeroZReady` (preuves C1 à la fin) PUIS `referenceReady`. Avec un seul rapport Idle après une alarme ou un redémarrage, l'opérateur lit « Position non confirmée » le temps d'un rapport avant « Machine non référencée ». Deux tests de reference-guard reçoivent pour cela un second rapport (voir plus bas).

## plate-probe.test.js — nouveau 34/34, ancien 34/34

(a) Entrées du banc :
- `fakeController` : `return lineBench(c)`.
- `ctx.report` : la ligne brute porte en plus `|WCO:<décalage du banc>` (le même décalage que celui avec lequel le banc écrit `wpos` dans l'état) ; avant : `<État|MPos:…|FS:0,0>`.
- Nouveau `ctx.gc()` : `ctx.modal()` (rapport modal M5, déjà dans le banc) puis `ok`.
- `ctx.tick` : un échange `ctx.gc()` toutes les 500 ms de temps de banc.
- `setup` : un `ctx.report()` de plus (second rapport au repos à la position de l'outil) avant `ctx.modal()`.

(b) Tests dont l'entrée change :
- « S4 two Idle reports after the ok… » : `ctx.gc()` juste après l'`ok` donné à la main (le `[GC: M5]` postérieur à l'`ok`) ; les deux rapports restent ce qui libère la ligne.
- « SURETE C-01: a full two-touch cycle… » : le crochet de `c.command` émet `ctx.gc()` après l'`ok` de chaque ligne.
- « C-07 checked again at the run… » : un second `ctx.report()` après la descente de l'outil (repos prouvé à la nouvelle position, sinon le refus est `ETOUCH_MOTION_NO_POSITION` avant `ETOUCH_PLATE_TRAVEL`).
- Simulateur, « C-07 a search below the LUNYEE travel… » : l'attente `until` exige en plus `state().canZeroZ` (deux rapports au repos après le `G53 G0`) : temporisation.

(c) `expect` modifiés : aucun.
(d) Rouges sur l'ancien code : aucun.

## block-probe.test.js — nouveau 58/61 (3 rouges = défauts 1, 2, 3 ci-dessus), ancien 60/61

(a) Entrées du banc : `lineBench(c)` dans `fakeGrbl` (le faux Grbl émettait déjà des lignes brutes avec `FS:`, `WCO:` un rapport sur dix, et un échange `parserstate` + `ok` toutes les 500 ms). Rien d'autre.

(b) Test dont l'entrée change :
- « S38 a retract answered ok once planned… » : après l'`ok` donné à la main, un échange `$G` à la main (`parserstate` avec le modal du banc, puis `ok`) ; le banc avait coupé l'interrogation automatique pour cette séquence. Les deux rapports restent ce qui libère la ligne.

(c) `expect` modifié :
- « S17 machine guards… », l. ~1132 : `blockProbeReason` attendu `'La broche est commandée (M3 ou M4) : arrêtez-la d’abord (M5).'` → `'La broche est commandée (M3) : arrêtez-la d’abord (Arrêter la broche).'`, plus un `expect` ajouté : `refusals.blockProbe` = `{ code: 'ETOUCH_MOTION_SPINDLE_COMMANDED', params: { mode: 'M3' } }`. Justification : `M3` au `$G` avec `FS:0,0` est désormais refusé par la preuve de broche de `zeroZReady`, appelée avant le contrôle propre au bloc (`TEXT.spindle`), qui n'est donc plus atteint dans ce cas. Le `rejects.toThrow(/broche est commandée/)` qui suit est inchangé.

(d) Rouge sur l'ancien code : S17 seulement, pour cette attente (l'ancien code répond la phrase du bloc).

Rouges sur le nouveau code, attentes NON modifiées : S3 (défaut 2), S13 (défaut 1), S42 (défaut 3).

## work-offset.test.js — nouveau 36/36, ancien 36/36

(a) `lineBench(c)` dans le faux Grbl (lignes brutes déjà complètes). (b), (c), (d) : rien.

## reference-guard.test.js — nouveau 7/7, ancien 7/7

(a) Entrées du banc :
- `fakeController` : `return lineBench(c)`.
- `ctx.report` : la ligne brute porte en plus `|WCO:100.000,100.000,-115.000` (le G54 du banc).
- `ctx.homed()` : un `ctx.report()` de plus (second rapport au repos).
- `restartThenUnlock` : un second `ctx.report('Idle')` après le déverrouillage.

(b) Test dont l'entrée change : « C-18: a plate ticket issued before an alarm… » : un second `ctx.report('Idle')` après l'alarme (sinon le refus lu est `ETOUCH_MOTION_NO_POSITION` avant `ETOUCH_ORIGIN_NOT_HOMED`, voir remarque 4).

(c) `expect` modifiés : aucun. (d) aucun.

## start-travel.test.js — nouveau 18/18, ancien 18/18

(a) `fakeController` : `return lineBench(c)` ; `ctx.report` : la ligne brute porte en plus `|WCO:<ctx.wco>`. (b), (c), (d) : rien.

## Non vérifié

- Comparaison « octet par octet » avant / après : elle repose sur les assertions d'octets des tests eux-mêmes, inchangées et vertes sur les deux codes ; pas d'instrumentation séparée.
- Les tests du simulateur de ces fichiers (pont `sim-bridge`, `[GC:]` sans `ok`) passent tels quels, sauf l'attente ajoutée dans plate-probe.


---

# Conversion des bancs — groupe D (C1)

Six fichiers de `src/server/services/touch/__tests__/`. Aucun `expect` modifié. Aucune source hors tests touchée, `line-bench.js` non touché, aucune commande git d'écriture.

Dans les six : `import { lineBench } from './support/line-bench';` et le faux contrôleur rendu par `lineBench(c)` : toute émission `status` / `parserstate` passe par le vrai GrblRunner.

« Échange $G » ci-dessous = `parserstate` avec `{ motion G0, wcs G54, plane G17, units G21, distance G90, feedrate G94, spindle M5, coolant M9 }` PUIS `ok`.

## machine-profile.test.js

(a) Entrées du banc (setup) :
- `ctx.gc()` ajouté (échange $G complet).
- `ctx.ok()` : l'`ok` de la ligne est suivi d'un échange $G (donc `ctx.settle()` aussi).
- `ctx.tick(ms)` : un échange $G toutes les 500 ms de temps de banc (compteur `ctx.sinceGc`), avant le rapport de ce pas.
- fin de `setup` : un second rapport au repos (`ctx.report()`) puis un échange $G, dans tous les cas (machine référencée ou non).

(b) Test dont l'entrée change :
- « laser framing (§4) › refusals: CNC profile, real moves disabled, no program, check not validated, other WCS, feed, too slow, pilot, ticket » : après la sortie d'alarme rejouée (Alarm → Home → Idle), un second `ctx.report()` au repos. Raison : le cadrage repart d'un repos prouvé (deux Idle positionnels concordants) ; un seul Idle après Home donnait `ETOUCH_MOTION_NO_POSITION` au `frame-prepare` suivant (celui du ticket).

(c) `expect` modifiés : aucun.
(d) Rouges sur l'ancien code : aucun.
(e) Nouveau code : 37 / 37. Ancien code : 37 / 37.

## scenario-profiles.test.js

(a) Entrées du banc (setup) :
- `ctx.gc()` ajouté.
- `ctx.tick(ms)` : un échange $G toutes les 500 ms de temps de banc.
- `ctx.settle()` : l'`ok` de la ligne est suivi d'un échange $G (avant le passage à Idle et les 150 ms de rapports).
- fin de `setup` : un second rapport au repos puis un échange $G.

(b) Aucun test modifié individuellement. (c) Aucun `expect` modifié. (d) Aucun rouge sur l'ancien code.
(e) Nouveau code : 13 / 13. Ancien code : 13 / 13.

## repetition-findings.test.js

(a) Entrées du banc :
- état initial du faux contrôleur : `spindle: 0` ajouté (`{ activeState: 'Idle', spindle: 0 }`), pour que les rapports portent `FS:0,0` (avant : aucune vitesse dans l'état). Sur l'ancien code, la vitesse passe de « absente » à 0 : `spindleStill` ne refusait dans aucun des deux cas.
- `ctx.gc()` ajouté.
- `ctx.started()` : un échange $G après son premier rapport, avant `load` / `prepare` / `start`. Raison : le départ d'un programme exige un `$G` récent disant `M5` seul.

(b) Aucun test modifié individuellement (tous passent par `ctx.started()`). (c) Aucun `expect` modifié. (d) Aucun rouge sur l'ancien code.
(e) Nouveau code : 12 / 12. Ancien code : 12 / 12.

## repetition-findings-2.test.js

(a) Entrées du banc (plaque, `probeController`) :
- la ligne brute des rapports devient `<État|WPos:0,0,z|FS:0,0|WCO:x,y,z[|Pn:P]>` (avant : `<État|WPos:0,0,z[|Pn:P]>`). `FS:0,0` : l'état du banc avait déjà `spindle: 0`. `WCO:` = MPos − WPos de l'état du banc, recalculé à chaque rapport (il change donc après le `G10 L20` simulé, comme sur une carte) : un rapport `WPos:` a besoin du décalage pour donner la position machine.
- après l'`ok` de chaque ligne du palpage et le premier rapport qui le suit : un échange $G (`parserstate` de l'état du banc, qui dit `M5`, puis `ok`). Raison : `spindleHeld` exige un `[GC:]` `M5` postérieur à l'`ok` de la ligne précédente.
- `homed(c)` : un second rapport Idle après Home → Idle (repos prouvé avant le départ).

(b) Les deux tests de la plaque passent par ces fonctions ; les deux tests E2 / N6 (prise d'origine) ne changent que par `lineBench`.
(c) Aucun `expect` modifié (`G0 Z12.85`, `G0 Z15`, messages : identiques). (d) Aucun rouge sur l'ancien code.
(e) Nouveau code : 4 / 4. Ancien code : 4 / 4.

## bughunt-e-1.test.js

(a) Entrées du banc (`laserReady`) : après Home → Idle, un second rapport au repos puis un échange $G. Raison : `continuousReason` (attendu `''`) passe par `moveReady` et `spindleRefusal` ; `frame-prepare` par `moveReady`.
(b) Les deux tests de « E-1 (suite) » passent par `laserReady`. (c) Aucun `expect` modifié. (d) Aucun rouge sur l'ancien code.
(e) Nouveau code : 3 / 3. Ancien code : 3 / 3.

## bughunt-e-5.test.js

(a) Entrées :
- état initial du faux contrôleur : `spindle: 0` ajouté (rapports avec `FS:0,0`).
- dans le test unique, après le rapport initial : un échange $G avant `load` / `prepare(start)`. Raison : sans cela le `prepare` est refusé par `ETOUCH_MOTION_SPINDLE_UNKNOWN` avant d'atteindre le cas visé (flux fermé pendant la relecture du fichier).
(c) Aucun `expect` modifié. (d) Aucun rouge sur l'ancien code.
(e) Nouveau code : 1 / 1. Ancien code : 1 / 1.

## Ensemble

- Nouveau code : 6 suites, 70 tests, 70 verts. Ancien code (copie de d6851c6e) : 6 suites, 70 tests, 70 verts.
- ESLint propre sur les six fichiers.
- Comparaison des octets : non instrumentée ; elle repose sur les assertions d'octets des tests eux-mêmes, inchangées et vertes sur les deux codes.

(f) Soupçon de défaut du nouveau code : aucun trouvé. Le cadrage laser modifié (`motion.js`) passe les bancs laser de `machine-profile` et `scenario-profiles` dès que le `M5` et chaque `$J=` sont suivis d'un `[GC:]` `M5` postérieur à leur `ok`. Remarque, pas un défaut : aucun de ces six bancs n'exerce les attentes nouvelles du laser (preuve manquante → `cancel('stale' | 'spindleProof')`) ; elles restent à couvrir par les tests propres à C1.


---

# `cnc-frame.test.js` (converti par l'auteur) — nouveau code 185 / 185, ancien code 184 / 185

## (a) Entrées du banc

1. `fakeController()` : `return lineBench(c)`.
2. `ctx.gc()` ajouté : l'échange `$G` de CNCjs, rapport modal (`G0 G54 G17 G21 G90 G94 M5 M9`, complété par l'état modal qu'un test a écrit dans le banc) **puis `ok`**.
3. `ctx.ok()` : l'`ok` de la ligne, suivi d'un échange `$G`.
4. `ctx.tick()` : un échange `$G` toutes les 500 ms de temps de banc.
5. Fin de `setup()` : un second rapport au repos, puis un échange `$G`.
6. Boucle d'attente de la table d'états (« state table of the third review ») : un échange `$G` toutes les 500 ms quand la cellule fait des rapports.

## (b) Tests dont l'entrée change

| Test | Changement | Raison |
|---|---|---|
| 5b « …the spindle… » (cas « no recent $G ») | `ctx.now += 3000` avant le rapport sans vitesse | Le banc a maintenant un `$G` au repos : « pas de `$G` récent » demande trois secondes sans échange. |
| 5b (cas « another work offset ») | le `$G` écrit par le test dit aussi `M5` | Un `$G` sans mot de broche ne prouve plus une broche arrêtée. |
| 7 « ticket… » | un échange `$G` après le saut de 16 s ; deux rapports au repos (au lieu d'un) à chaque nouvelle position | `$G` de plus de 2,5 s ; un seul rapport n'est pas un repos prouvé. |
| « a declared laser: the same lines byte for byte… » | un second rapport au repos après le déplacement du banc | Idem. |

## (c) Attente modifiée

Test C2 (« windows of the safety review ») : avant, un cadrage lancé **sans aucune vitesse rapportée**, sur le `$G` seul, puis arrêté par un `$G` `M3` / `M4` ou trop ancien. Après : sans vitesse rapportée le cadrage est **refusé au départ** (`ETOUCH_MOTION_SPINDLE_UNKNOWN`, rien d'écrit) ; avec la vitesse rapportée, un `$G` `M3` ou `M4` pendant le cadrage l'arrête toujours (`spindle`, `0x85`) ; un `$G` qui vieillit pendant une ligne ne l'arrête plus. C'est le cas annoncé par la conception (§ 4.1 point 2, règle R-3 : aucun repli « carte sans `FS:` » ; § 2.6 : aucun `$G` frais exigé pendant une ligne). Seul test rouge sur l'ancien code.

---

# `manual-jog-banner.test.js` : les 42 entrées de table changées (avant → après)

Dans chacune, la seule différence est l'instant où `canJog` redevient vrai après un mouvement : un rapport (50 ms de banc) plus tard, le temps du second rapport au repos. Lignes écrites, annulations et refus identiques.

- `step / banner / keepalive-lost` : snaps ["0: -", "8650:K -", "11600:disposed"] → ["0: -", "8700:K -", "11600:disposed"]
- `step / banner / stream-closed` : snaps ["0: -", "650:C cancelled/transport/", "5700:CU cancelled/transport/U", "8650:K cancelled/transport/U", "11600:disposed"] → ["0: -", "650:C cancelled/transport/", "5700:CU cancelled/transport/U", "8650: cancelled/transport/U", "8700:K cancelled/transport/U", "11600:disposed"]
- `step / banner / stream-rotated` : snaps ["0: -", "650:C cancelled/transport/", "5700:CU cancelled/transport/U", "8650:K cancelled/transport/U", "11600:disposed"] → ["0: -", "650:C cancelled/transport/", "5700:CU cancelled/transport/U", "8650: cancelled/transport/U", "8700:K cancelled/transport/U", "11600:disposed"]
- `step / banner / lease-taken` : snaps ["0: -", "650:C cancelled/control/", "5700:CU cancelled/control/U", "8650:K cancelled/control/U", "11600:disposed"] → ["0: -", "650:C cancelled/control/", "5700:CU cancelled/control/U", "8650: cancelled/control/U", "8700:K cancelled/control/U", "11600:disposed"]
- `step / banner / lease-released` : snaps ["0: -", "600:C cancelled/released/", "5650:CU cancelled/released/U", "8650:K cancelled/released/U", "11600:disposed"] → ["0: -", "600:C cancelled/released/", "5650:CU cancelled/released/U", "8650: cancelled/released/U", "8700:K cancelled/released/U", "11600:disposed"]
- `step / banner / stale` : snaps ["0: -", "3150:C cancelled/stale/", "8200:CU cancelled/stale/U", "11650:K cancelled/stale/U", "14600:disposed"] → ["0: -", "3150:C cancelled/stale/", "8200:CU cancelled/stale/U", "11650: cancelled/stale/U", "11700:K cancelled/stale/U", "14600:disposed"]
- `step / banner / jog-stop` : snaps ["0: -", "600:C cancelled/operator/", "5650:CU cancelled/operator/U", "8650:K cancelled/operator/U", "11600:disposed"] → ["0: -", "600:C cancelled/operator/", "5650:CU cancelled/operator/U", "8650: cancelled/operator/U", "8700:K cancelled/operator/U", "11600:disposed"]
- `step / banner / stop-button` : snaps ["0: -", "600:C cancelled/stop/", "5650:CU cancelled/stop/U", "8650:K cancelled/stop/U", "11600:disposed"] → ["0: -", "600:C cancelled/stop/", "5650:CU cancelled/stop/U", "8650: cancelled/stop/U", "8700:K cancelled/stop/U", "11600:disposed"]
- `step / banner / socket-stop` : snaps ["0: -", "8650:K -", "11600:disposed"] → ["0: -", "8700:K -", "11600:disposed"]
- `step / banner / alarm` : snaps ["0: -", "8650:K -", "11600:disposed"] → ["0: -", "8700:K -", "11600:disposed"]
- `step / banner-idle / alarm` : snaps ["0: -", "400:K -", "600: -", "8650:K -", "11600:disposed"] → ["0: -", "400:K -", "600: -", "8700:K -", "11600:disposed"]
- `step / cancel-then-banner / keepalive-lost` : snaps ["0: -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650:K cancelled/operator/U", "11600:disposed"] → ["0: -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650: cancelled/operator/U", "8700:K cancelled/operator/U", "11600:disposed"]
- `step / cancel-then-banner / stream-closed` : snaps ["0: -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650:K cancelled/operator/U", "11600:disposed"] → ["0: -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650: cancelled/operator/U", "8700:K cancelled/operator/U", "11600:disposed"]
- `step / cancel-then-banner / stream-rotated` : snaps ["0: -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650:K cancelled/operator/U", "11600:disposed"] → ["0: -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650: cancelled/operator/U", "8700:K cancelled/operator/U", "11600:disposed"]
- `step / cancel-then-banner / lease-taken` : snaps ["0: -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650:K cancelled/operator/U", "11600:disposed"] → ["0: -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650: cancelled/operator/U", "8700:K cancelled/operator/U", "11600:disposed"]
- `step / cancel-then-banner / lease-released` : snaps ["0: -", "300:C cancelled/operator/", "600:C cancelled/released/", "5650:CU cancelled/released/U", "8650:K cancelled/released/U", "11600:disposed"] → ["0: -", "300:C cancelled/operator/", "600:C cancelled/released/", "5650:CU cancelled/released/U", "8650: cancelled/released/U", "8700:K cancelled/released/U", "11600:disposed"]
- `step / cancel-then-banner / stale` : snaps ["0: -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "11650:K cancelled/operator/U", "14600:disposed"] → ["0: -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "11650: cancelled/operator/U", "11700:K cancelled/operator/U", "14600:disposed"]
- `step / cancel-then-banner / jog-stop` : snaps ["0: -", "300:C cancelled/operator/", "5650:CU cancelled/operator/U", "8650:K cancelled/operator/U", "11600:disposed"] → ["0: -", "300:C cancelled/operator/", "5650:CU cancelled/operator/U", "8650: cancelled/operator/U", "8700:K cancelled/operator/U", "11600:disposed"]
- `step / cancel-then-banner / stop-button` : snaps ["0: -", "300:C cancelled/operator/", "600:C cancelled/stop/", "5650:CU cancelled/stop/U", "8650:K cancelled/stop/U", "11600:disposed"] → ["0: -", "300:C cancelled/operator/", "600:C cancelled/stop/", "5650:CU cancelled/stop/U", "8650: cancelled/stop/U", "8700:K cancelled/stop/U", "11600:disposed"]
- `step / cancel-then-banner / socket-stop` : snaps ["0: -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650:K cancelled/operator/U", "11600:disposed"] → ["0: -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650: cancelled/operator/U", "8700:K cancelled/operator/U", "11600:disposed"]
- `step / cancel-then-banner / alarm` : snaps ["0: -", "300:C cancelled/operator/", "700: cancelled/operator/", "8650:K cancelled/operator/", "11600:disposed"] → ["0: -", "300:C cancelled/operator/", "700: cancelled/operator/", "8700:K cancelled/operator/", "11600:disposed"]
- `continuous / banner / keepalive-lost` : snaps ["0:J -", "900:C cancelled/keepalive/", "5950:CU cancelled/keepalive/U", "8650:K cancelled/keepalive/U", "11600:disposed"] → ["0:J -", "900:C cancelled/keepalive/", "5950:CU cancelled/keepalive/U", "8650: cancelled/keepalive/U", "8700:K cancelled/keepalive/U", "11600:disposed"]
- `continuous / banner / stream-closed` : snaps ["0:J -", "600:C cancelled/transport/", "5650:CU cancelled/transport/U", "8650:K cancelled/transport/U", "11600:disposed"] → ["0:J -", "600:C cancelled/transport/", "5650:CU cancelled/transport/U", "8650: cancelled/transport/U", "8700:K cancelled/transport/U", "11600:disposed"]
- `continuous / banner / stream-rotated` : snaps ["0:J -", "600:C cancelled/transport/", "5650:CU cancelled/transport/U", "8650:K cancelled/transport/U", "11600:disposed"] → ["0:J -", "600:C cancelled/transport/", "5650:CU cancelled/transport/U", "8650: cancelled/transport/U", "8700:K cancelled/transport/U", "11600:disposed"]
- `continuous / banner / lease-taken` : snaps ["0:J -", "650:C cancelled/control/", "5700:CU cancelled/control/U", "8650:K cancelled/control/U", "11600:disposed"] → ["0:J -", "650:C cancelled/control/", "5700:CU cancelled/control/U", "8650: cancelled/control/U", "8700:K cancelled/control/U", "11600:disposed"]
- `continuous / banner / lease-released` : snaps ["0:J -", "600:C cancelled/released/", "5650:CU cancelled/released/U", "8650:K cancelled/released/U", "11600:disposed"] → ["0:J -", "600:C cancelled/released/", "5650:CU cancelled/released/U", "8650: cancelled/released/U", "8700:K cancelled/released/U", "11600:disposed"]
- `continuous / banner / stale` : snaps ["0:J -", "900:C cancelled/keepalive/", "5950:CU cancelled/keepalive/U", "11650:K cancelled/keepalive/U", "14600:disposed"] → ["0:J -", "900:C cancelled/keepalive/", "5950:CU cancelled/keepalive/U", "11650: cancelled/keepalive/U", "11700:K cancelled/keepalive/U", "14600:disposed"]
- `continuous / banner / jog-stop` : snaps ["0:J -", "600:C cancelled/operator/", "5650:CU cancelled/operator/U", "8650:K cancelled/operator/U", "11600:disposed"] → ["0:J -", "600:C cancelled/operator/", "5650:CU cancelled/operator/U", "8650: cancelled/operator/U", "8700:K cancelled/operator/U", "11600:disposed"]
- `continuous / banner / stop-button` : snaps ["0:J -", "600:C cancelled/stop/", "5650:CU cancelled/stop/U", "8650:K cancelled/stop/U", "11600:disposed"] → ["0:J -", "600:C cancelled/stop/", "5650:CU cancelled/stop/U", "8650: cancelled/stop/U", "8700:K cancelled/stop/U", "11600:disposed"]
- `continuous / banner / socket-stop` : snaps ["0:J -", "900:C cancelled/keepalive/", "5950:CU cancelled/keepalive/U", "8650:K cancelled/keepalive/U", "11600:disposed"] → ["0:J -", "900:C cancelled/keepalive/", "5950:CU cancelled/keepalive/U", "8650: cancelled/keepalive/U", "8700:K cancelled/keepalive/U", "11600:disposed"]
- `continuous / banner / alarm` : snaps ["0:J -", "650:C cancelled/alarm/", "700: cancelled/alarm/", "8650:K cancelled/alarm/", "11600:disposed"] → ["0:J -", "650:C cancelled/alarm/", "700: cancelled/alarm/", "8700:K cancelled/alarm/", "11600:disposed"]
- `continuous / banner-idle / alarm` : snaps ["0:J -", "400:K ended/bound/", "600: ended/bound/", "8650:K ended/bound/", "11600:disposed"] → ["0:J -", "400:K ended/bound/", "600: ended/bound/", "8700:K ended/bound/", "11600:disposed"]
- `continuous / cancel-then-banner / keepalive-lost` : snaps ["0:J -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650:K cancelled/operator/U", "11600:disposed"] → ["0:J -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650: cancelled/operator/U", "8700:K cancelled/operator/U", "11600:disposed"]
- `continuous / cancel-then-banner / stream-closed` : snaps ["0:J -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650:K cancelled/operator/U", "11600:disposed"] → ["0:J -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650: cancelled/operator/U", "8700:K cancelled/operator/U", "11600:disposed"]
- `continuous / cancel-then-banner / stream-rotated` : snaps ["0:J -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650:K cancelled/operator/U", "11600:disposed"] → ["0:J -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650: cancelled/operator/U", "8700:K cancelled/operator/U", "11600:disposed"]
- `continuous / cancel-then-banner / lease-taken` : snaps ["0:J -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650:K cancelled/operator/U", "11600:disposed"] → ["0:J -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650: cancelled/operator/U", "8700:K cancelled/operator/U", "11600:disposed"]
- `continuous / cancel-then-banner / lease-released` : snaps ["0:J -", "300:C cancelled/operator/", "600:C cancelled/released/", "5650:CU cancelled/released/U", "8650:K cancelled/released/U", "11600:disposed"] → ["0:J -", "300:C cancelled/operator/", "600:C cancelled/released/", "5650:CU cancelled/released/U", "8650: cancelled/released/U", "8700:K cancelled/released/U", "11600:disposed"]
- `continuous / cancel-then-banner / stale` : snaps ["0:J -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "11650:K cancelled/operator/U", "14600:disposed"] → ["0:J -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "11650: cancelled/operator/U", "11700:K cancelled/operator/U", "14600:disposed"]
- `continuous / cancel-then-banner / jog-stop` : snaps ["0:J -", "300:C cancelled/operator/", "5650:CU cancelled/operator/U", "8650:K cancelled/operator/U", "11600:disposed"] → ["0:J -", "300:C cancelled/operator/", "5650:CU cancelled/operator/U", "8650: cancelled/operator/U", "8700:K cancelled/operator/U", "11600:disposed"]
- `continuous / cancel-then-banner / stop-button` : snaps ["0:J -", "300:C cancelled/operator/", "600:C cancelled/stop/", "5650:CU cancelled/stop/U", "8650:K cancelled/stop/U", "11600:disposed"] → ["0:J -", "300:C cancelled/operator/", "600:C cancelled/stop/", "5650:CU cancelled/stop/U", "8650: cancelled/stop/U", "8700:K cancelled/stop/U", "11600:disposed"]
- `continuous / cancel-then-banner / socket-stop` : snaps ["0:J -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650:K cancelled/operator/U", "11600:disposed"] → ["0:J -", "300:C cancelled/operator/", "5350:CU cancelled/operator/U", "8650: cancelled/operator/U", "8700:K cancelled/operator/U", "11600:disposed"]
- `continuous / cancel-then-banner / alarm` : snaps ["0:J -", "300:C cancelled/operator/", "700: cancelled/operator/", "8650:K cancelled/operator/", "11600:disposed"] → ["0:J -", "300:C cancelled/operator/", "700: cancelled/operator/", "8700:K cancelled/operator/", "11600:disposed"]
