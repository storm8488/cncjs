# N4 — Position de changement de fraise : conception

Lot N4 de `design/PROMPT-NUIT-2026-11-26.md`, phase A, nuit du 26 novembre 2026. Arbre `cncjs-wt/N4`, branche `feat/N4`, base `0acd1c3b`. Les numéros de ligne valent pour ce commit. **Conception seule : aucun code écrit, aucun test lancé sur la fonction, rien essayé sur la tablette, la RT ni la CNC.** À relire par Astra (phase A') avant tout code.

**Révision 2 (après relecture, phase C).** Quatre constats importants, tous confirmés dans le code, tous corrigés ici : (1) un plan de type `park` ne passait pas par le superviseur de F1, contrairement à ce qui était écrit (§ 4.4, § 7.2, § 8.1 tests 18) ; (2) le plan ne disait pas ce dont ce superviseur dépend : décalage, position pièce, programme chargé, codes (§ 4.4, § 5.2, § 7.1, tests 19 à 21) ; (3) l'écran d'arrivée invitait à toucher la pince sans dire de couper la broche (§ 1, § 7.3, § 12, D-N4-7) ; (4) l'essai réel ne coupait jamais le flux de la tablette (§ 9, N4-C5). En préparant ce dernier point, une limite de plus est apparue, héritée de F1 : une tablette perdue **sans fermeture de connexion** n'est pas vue à coup sûr par le serveur avant la fin de la séquence (§ 9, D-N4-8).

## 0. Lecture rapide

**Faisable : oui, sans aucune forme de commande que la carte n'ait déjà reçue de la tablette.**

1. L'opérateur enregistre une fois la position où il change sa fraise : il y amène la broche avec les flèches, puis « Enregistrer cette position… ». Le serveur lit lui-même la position machine X / Y ; la page n'envoie aucun nombre. Z n'est pas enregistré.
2. « Aller à la position de changement… » : `M5`, puis **Z monte seul** à 5 mm sous le haut de la course (la ligne du cadrage à vide, sans signe, qui ne peut pas descendre), puis **X seul**, puis **Y seul**. Z ne redescend jamais.
3. Les trois déplacements sont des déplacements manuels bornés `$J=G91 G21 <axe><distance> F<vitesse>` : **le format exact des flèches**, un axe par ligne. La distance est calculée par le serveur en position machine (cible − position), et chaque arrivée est comparée à la position machine attendue.
4. La séquence est **le cadrage à vide** (lot F1) avec un autre plan : même session `r.motion.frame`, même superviseur, mêmes arrêts (`0x85` seul), mêmes exclusions. Rien n'est construit à côté. Cela n'est **pas** acquis d'office : dans le code actuel, seul un plan `kind: 'cnc'` reçoit ce superviseur (six endroits de `motion.js`). Le plan de N4 reste donc `kind: 'cnc'` en interne, avec une variante `variant: 'park'` ; sept retouches bornées sont listées au § 4.4, chacune avec son test.
5. Le zéro pièce n'est ni lu pour le mouvement, ni écrit. Aucun garde de départ n'est ajouté.

**Écarts assumés avec le prompt** (§ 2, N4 : « Z monte seul d'abord (`G53`) … puis X / Y (`G53 G0`) »), tous dans le sens prudent, à juger par Astra :

| # | Le prompt dit | La conception fait | Pourquoi |
|---|---|---|---|
| E1 | Z par `G53` | `$J=G91 G21 Z<montée> F…`, relatif, sans signe | `$J=G53` n'est pas prouvé sur ce binaire (`PROTOCOLE-ESSAI.md:95`, F1 C6, F2 P14) : si `G53` était ignoré, une cible absolue deviendrait une position pièce, donc peut-être une descente. La ligne relative sans signe est celle de F1, relue quatre fois. |
| E2 | X / Y par `G53 G0` | deux `$J=G91 G21`, X puis Y, distance = cible machine − position machine | Un `G0` hors course lève `ALARM:2` et **redémarre la carte** (fait prouvé) ; il ne s'arrête que par retenue puis reset, et un reset en mouvement perd la position (F1 C2, C4) ; il part à 4000 mm/min (44 mm de freinage) et laisse `G0` dans l'état modal. Un `$J=` hors course est refusé `error:15` sans mouvement, s'annule par `0x85` en gardant la position, porte sa vitesse, ne laisse rien. |
| E3 | broche « constatée arrêtée » | constatée arrêtée **et** `M5` écrit en premier | Comme F1 ; `M5` au repos ne déplace rien. |
| E4 | (non demandé) | zéro pièce prouvé (D2) et `$20=1` exigés | Voir G6 et G9 (§ 5.1). Coût : attendre la vérification du zéro après une prise d'origine. |

Le résultat demandé est tenu : position enregistrée en position machine, Z en haut d'abord, jamais de descente.

## 1. Ce que l'opérateur obtient

Sur **3 · Zéro pièce**, colonne « Position pièce », sous [Position machine] : un bouton **[Changer la fraise…]**. Il ouvre le volet « Changer la fraise » :

- la position enregistrée (« Position enregistrée le 26 nov. » ; les nombres sont dans Détails), ou « Aucune position enregistrée. Amenez la broche où vous changez la fraise, puis enregistrez. » ;
- **[Aller à la position de changement…]** (64 px) : confirmation à case, trois touchers ; la fraise monte, puis la broche va à la position. « Arrêter » l'interrompt à tout instant ;
- **[Enregistrer cette position…]** (48 px) : confirmation à deux touchers, aucun axe ne bouge ;
- à l'arrivée : **« Attendez l'arrêt complet de la broche et coupez son alimentation avant de toucher la pince. Changez la fraise, puis refaites le zéro Z. »** et [Fermer] : le volet se ferme sur 3 · Zéro pièce, où sont « Zéro Z ici » et « Zéro Z à la plaque… ».

Ce que la fonction ne fait pas : elle ne marche pas pendant un usinage ni pendant une pause (`M6` compris) ; elle ne redescend pas ; elle ne refait pas le zéro Z et **n'empêche pas de démarrer sans l'avoir refait** ; **elle ne coupe pas l'alimentation de la broche et, une fois arrivée, elle ne surveille plus rien** : la broche n'est qu'à `M5`, et un autre client (CNCjs classique, Wi-Fi de la carte) peut encore écrire `M3`. C'est pourquoi l'écran demande de couper l'alimentation (§ 7.3, § 12, D-N4-7).

## 2. Faits et code dont la fonction part

| # | Fait | Source | Degré |
|---|---|---|---|
| C1 | Enveloppe LUNYEE : X `[0 ; 408]`, Y `[0 ; 396]`, Z `[−130 ; 0]`, MPos 0,0,0 après `$H` ; `$10=1` (la carte rapporte la position machine). Course utilisable : X `[0 ; 407,5]`, Y `[0 ; 395,5]`, Z `[−129,5 ; 0]`. | `PROMPT-REFONTE-UI.md` § 2 ; `motion.js:285-288` | Observé |
| C2 | `$J=G91 G21 <axe><distance> F<vitesse>`, un axe, par le chemin serveur de la tablette : pas exacts (12 / 12) ; le maintien continu envoie le même format avec une grande distance bornée par la course. | F1 C5 ; `motion.js:303`, `:753-805` | Noté sur la carte (note de séance hors dépôt) |
| C3 | `$J=` hors course : `error:15`, ni mouvement ni alarme, avec `$20=1`. | F1 C3 | Amont + noté sur la carte |
| C4 | `0x85` en `Jog` : décélération, repos, position gardée ; utilisé par le maintien continu sur la carte. Distance d'arrêt non mesurée. | F1 C8 | Amont ; partiel sur la carte |
| C5 | `G0` / `G1` hors course : `ALARM:2`, redémarrage, position perdue. Reset en mouvement : position perdue. | `PROMPT-REFONTE-UI.md` § 2 ; F1 C2, C4 | Observé |
| C6 | `$J=G53 G90 …` : contradictoire, **non prouvé**. | F1 C6 ; `PROTOCOLE-ESSAI.md:95` | Non prouvé |
| C7 | `$20` : 1 d'après le prompt de mission, vu à 0 le 16 novembre. | F1 C11 | Incertain |
| C8 | L'essai réel du cadrage à vide (F1) n'a aucun relevé dans le dépôt : `$J=G90` en position pièce et la distance d'arrêt restent non prouvés. **N4 n'utilise pas `$J=G90`.** | `SURETE.md` § F1, limites | — |

Code repris (tel quel, sauf les sept retouches du § 4.4) :

| Sujet | Où |
|---|---|
| Plan du cadrage à vide (gardes, hauteur sûre, ligne Z, arrivées attendues) | `job-service.js:1975-2133` (`cncFramePlan`) |
| Ticket en deux temps (`frame-prepare` / `frame`), plan refait identique | `job-service.js:2176-2241` |
| Séquence, une ligne à la fois, `settle` | `motion.js:1122-1308`, `:361-392` |
| Surveillance (`cncStop`), contrôle avant chaque ligne (`holdReason`), arrivée (`arrivalOff`) | `motion.js:959-1013`, `:1053-1082`, `:1086-1104` |
| Exclusions : tout mouvement, zéro ou cadrage refusé tant qu'une séquence existe | `motion.js:416-453` (`atRest`) |
| Bannière : fin dans le pas, plus un octet | `motion.js:1024-1036` |
| Arrêts d'un socket CNCjs, refus des commandes non sûres, upload | `job-service.js:2944`, `:2972`, `:3000`, `:3016` ; `index.js` (`socketEffect`) |
| Course : `envelopeOf`, `limitsAt`, `usableOf` | `motion.js:201-288` |
| Stockage par signature de machine dans `.cncrc` | `machine-profile.js:19-22`, `:114-122`, `:234-289` |

`motion-preflight.js` (aperçu d'un pas, lecture seule) n'est pas touché : il ne décrit qu'un pas de flèche et n'autorise rien.

## 3. Les erreurs de I-27 et de F1 à ne pas refaire

I-27 (`P4-CONCEPTION.md`, trois avis « à revoir ») et les trois tours de F1 (`F1-CORRECTIONS.md`) donnent sept leçons. Pour chacune, ce que N4 fait.

| Leçon | Ce qui avait été reproché | Dans N4 |
|---|---|---|
| L1 | I-27 v1 : un retour au-dessus du zéro pièce avec « Z déjà haut » supposé, des bornes non contrôlées, une position de départ inconnue, un ticket non lié à la position (`P4-CONCEPTION.md` D0). | Z est **constaté** à la hauteur sûre avant chaque ligne X ou Y, jamais supposé ; la cible et le départ sont dans la course utilisable calculée à l'instant ; les lignes du ticket portent les distances, donc la position : le plan refait à l'exécution doit être identique. |
| L2 | I-27 v2 : un état gardé (`same` / `redone`, preuve ancienne) devenait une permission après un incident ou une reconnexion. | La position enregistrée **n'est jamais une permission** : c'est une cible, recontrôlée à chaque usage contre la course du moment. Toute perte de référence (bannière, alarme, reconnexion, CNCjs redémarré) rend `homed` faux : refus jusqu'à la prise d'origine. Rien n'est hérité d'une session précédente, sauf la cible. |
| L3 | I-27 v3 : coût opérateur inacceptable (zéro à refaire à chaque reconnexion), garde de départ nouvelle. | **Aucun garde de départ, aucun état de zéro, aucune obligation nouvelle.** « Refaites le zéro Z » est une phrase, pas un verrou (§ 10, D-N4-2). |
| L4 | I-27 : un écart avec le prompt fait sans le dire (retour retiré). | Les quatre écarts sont en tête (§ 0). |
| L5 | I-27 et F1 : tests témoins comptés comme preuves ; scénario de simulateur faux (carte en `Alarm` après redémarrage, `error:8`). | Chaque test dit l'assertion qui échoue sans le code ; les témoins sont marqués (§ 8). |
| L6 | F1, tours 1 et 2 : fenêtres entre deux lignes (un pas Z− passait), hauteur sûre non revérifiée, arrivée ancienne réutilisée, arrêts de socket oubliés, octets après bannière. | Pas de séquence parallèle : N4 est un **plan de plus dans la séquence de F1**, dont la table d'états (106 cases) est déjà tenue. Les points de passage (`atRest`, `holdReason`, `socketEffect`, `restarted`, `supervise`, `transportClosed`, `holds`) ne s'appliquent que si la session est `kind: 'cnc'` : c'est ce que le § 4.4 impose, et ce que les tests 18 prouvent endroit par endroit ; la table est rejouée pour la variante (§ 8.1, test 12). |
| L7 | F1, tour 3 : une correction large a retiré un arrêt automatique aux déplacements manuels. | N4 ne modifie ni `cancel`, ni `forget`, ni les superviseurs des pas et du continu. `manual-jog-banner.test.js` (96 scénarios) doit rester vert sans retouche. |

## 4. La séquence

### 4.1 Constantes

| Nom | Valeur | Raison |
|---|---|---|
| Hauteur sûre | haut de la course utilisable en Z − 5 mm (LUNYEE : Z machine −5) | Celle de F1 (`CNC_FRAME_CLEARANCE_MM`), 7 mm sous le capteur haut. |
| Vitesse Z | min(300, `$112`) mm/min | Celle de F1. |
| Vitesse X et Y | min(600, `$110` / `$111`) mm/min, fixe | Celle de F1 : 1 mm de freinage à 50 mm/s² ; la plus longue course (407,5 mm) dure 41 s, sous les 60 s d'un `$J=` (`MAX_JOG_MS`). La page n'envoie pas de vitesse. |
| Seuil d'une ligne | 0,01 mm | En dessous, l'axe est déjà arrivé : pas de ligne. |
| Tolérance d'arrivée | 0,05 mm (`FRAME_ARRIVAL_MM`) | Celle de F1. |
| Délai d'une ligne | durée prévue + 10 s (`M5` : 10 s) | Celui de F1. |
| Grâce du flux, rapports, cadence | 3 s, 2,5 s, 50 ms | Ceux de F1. |

Durée au pire sur la LUNYEE : 25 s (Z) + 41 s (X) + 40 s (Y).

### 4.2 Les lignes, dans l'ordre

Notations : `(mx, my, mz)` position machine au repos ; `zs` hauteur sûre ; `(tx, ty)` position enregistrée ; valeurs écrites par `fmt3`.

| N° | Ligne écrite | Phase | Existe si | Attendu avant la suivante |
|---|---|---|---|---|
| 0 | `M5` | `spindle` | toujours | `ok`, deux rapports postérieurs, `Idle`, position machine inchangée (X, Y, Z à 0,05). |
| 1 | `$J=G91 G21 Z<zs − mz> F<fz>` | `raise` | `zs − mz ≥ 0,01` ; sinon Z reste où il est (au-dessus) | `ok`, deux rapports sans `Jog`, `Idle`, Z machine = `zs`, X et Y inchangés. |
| 2 | `$J=G91 G21 X<tx − mx> F<f>` | `x` | `|tx − mx| ≥ 0,01` | idem ; X machine = `tx`, Y = `my`, Z pas plus bas que la hauteur constatée avant cette ligne. |
| 3 | `$J=G91 G21 Y<ty − my> F<f>` | `y` | `|ty − my| ≥ 0,01` | idem ; X = `tx`, Y = `ty` ; puis fin (`ended`). |

Si aucune ligne 1 à 3 n'existe (la broche y est déjà, en haut) : refus sans rien écrire, `ETOUCH_PARK_ALREADY` (« La broche est déjà à la position de changement. »).

Exemple (position enregistrée X 20, Y 380 ; départ machine X 204, Y 180, Z −60) :

```
M5
$J=G91 G21 Z55 F300        Z machine −60 → −5       11 s
$J=G91 G21 X-184 F600      X machine 204 → 20       18 s
$J=G91 G21 Y200 F600       Y machine 180 → 380      20 s
```

### 4.3 Forme des lignes : l'extension de liste blanche

Seule extension du lot, dans `motion.js`, à côté de `cncFrameLinesValid` (`:310-313`) :

- ligne 0 : exactement `M5` ;
- au plus une ligne Z, **en position 1 seulement**, `^\$J=G91 G21 Z\d+(\.\d+)? F\d+(\.\d+)?$` (l'expression `CNC_Z_LINE` existante, **sans signe**) ;
- puis au plus une ligne X, puis au plus une ligne Y, dans cet ordre : `^\$J=G91 G21 X-?\d+(\.\d+)? F\d+(\.\d+)?$` et la même en Y ; **aucun mot Z, un seul axe par ligne** ;
- au moins une ligne de déplacement.

Ce qui est nouveau pour la carte : rien dans la forme (c'est `jogLine`, `motion.js:303`). Ce qui est nouveau pour le serveur : une distance X ou Y qui n'est pas l'un des sept pas, dans une séquence. Jamais écrit : `G0`, `G1`, `G53`, `G90`, `G10`, `G92`, `M3`, `M4`, `S`, `$H`, `$X`, `!`, `~`, `0x18` ; `0x85` seulement à l'annulation ; rien après un arrêt ; après une bannière, rien du tout.

Pourquoi un axe par ligne plutôt qu'une diagonale `X… Y…` : c'est le format exactement noté sur la carte (C2). Le trajet en L reste dans le rectangle entre le départ et la cible, tous deux dans la course. Coût : quelques secondes.

Pourquoi le relatif est sûr ici (contre-épreuve de E1 / E2) : si la position lue au plan n'est plus la vraie (un autre client a bougé la machine dans l'intervalle), la ligne mène ailleurs ; alors soit la carte la refuse (`error:15`, rien ne bouge), soit l'arrivée comparée en position machine **absolue** arrête la séquence. La ligne Z, sans signe, ne descend dans aucun cas.

### 4.4 Le plan remis à `motion.frame`, et ce qu'il faut retoucher pour qu'il soit supervisé

**Constat de relecture, vérifié ligne par ligne.** `motion.js` ne donne le superviseur de F1 qu'à une session `kind === 'cnc'`. Un plan `kind: 'park'` aurait eu : la validation laser `FRAME_LINE` et pas de `cncStep` (`:1124-1128`, `:1273`) ; aucun arrêt dans le pas au changement de main (`supervise`, `:1110`) ; la règle laser à la fermeture du flux, sans lien à l'appareil ni grâce de rotation (`transportClosed`, `:1560`) ; une rotation du flux non retenue (`holds`, `:1574`) ; ni `kind` ni `code` publiés à la fin (`endFrame`, `:901`, `:909`) ; pas de phase publiée (`frameProgress`, `:1490`). Sur la page, 4 · Contrôle aurait écrit « Cadrage en cours. » (`check-screen.js:143`, `:151`).

**Choix (la voie la plus sûre du relecteur) : la session reste `kind: 'cnc'` en interne et porte `variant: 'park'`.** Les six endroits ci-dessus ne sont pas modifiés ; ils valent pour N4 parce que la session est une session CNC. `'park'` n'apparaît que dans ce qui sort : l'instantané, `lastFrame`, le journal. Limite assumée : dans le code, « cnc » voudra dire « séquence supervisée », cadrage ou déplacement vers la position ; un commentaire le dit à la création de la session.

Le plan, construit par `job-service.js` (calqué sur `cncFramePlan`, `:2023-2132`) :

| Champ | Valeur | Pourquoi il est obligatoire |
|---|---|---|
| `kind` | `'cnc'` | Superviseur de F1 (six endroits). |
| `variant` | `'park'` | Choisit le validateur de lignes du § 4.3 et les sorties. |
| `lines`, `limits` | § 4.2 ; durée prévue + 10 s (`M5` : 10 s) | `frame()` refuse des listes de longueurs différentes (`:1125-1126`). |
| `phases` | `spindle`, `raise`, `x`, `y`, une par ligne | Exigé (`:1127`) ; publié par `frameProgress`. |
| `expect` | position machine attendue après chaque ligne : `M5` → `{x: mx, y: my, z: mz}` ; Z → `{x: mx, y: my, z: zs}` ; X → `{x: tx, y: my}` ; Y → `{x: tx, y: ty}` | Exigé (`:1127`) ; lu par `arrivalOff` (`:1086-1104`). Sans `z` après la montée : c'est le plancher Z qui tient Z. |
| `safeZ` | `{ machine: zs, rise }` | Lu avant toute ligne latérale (`holdReason`, `:1076`). |
| `offset` | `{ x: mx − wx, y: my − wy }` : décalage position machine − position pièce, lu au plan | Exigé fini (`:1127-1128`) ; comparé à chaque pas (`offsetOff`, `:1016-1020`, appelé `:1001`). |
| `revision` | révision du programme chargé au plan, ou `null` s'il n'y en a pas | Voir la cause `program`, § 5.2. |
| `bounds`, `sides`, `job` | `null`, `0`, absent | Journal seulement (`:924`) ; `sides` ne sert qu'à la phase `side`. |
| `feed`, `zFeed`, `target`, `seconds`, `savedAt` | pour le journal, le ticket et l'écran | — |

Conséquence dite : puisque le plan porte `offset`, **la position pièce X / Y doit être connue** au plan (G10 complété) et le rester pendant la séquence : `offsetOff` arrête dès que WPos X ou Y manque ou que le décalage bouge de plus de 0,05 mm. Le mouvement n'utilise pas ce décalage ; il sert de témoin qu'aucun `G10` / `G92` venu d'ailleurs n'a changé le repère pendant que la broche bouge. Prudent, comme G6.

**Les sept retouches du code existant de `motion.js`** (s'y ajoutent seulement deux choses nouvelles : le validateur du § 4.3 et la table `PARK_CODES` du § 7.1) :

| # | Où | Retouche | Test (§ 8.1) |
|---|---|---|---|
| R1 | `frame()`, `:1124-1129` | Validateur de lignes choisi par `plan.variant` (`park` : § 4.3 ; sinon `cncFrameLinesValid`, inchangé) ; `variant` et `revision` copiés dans la session. Un `variant` inconnu, ou `variant: 'park'` sans `kind: 'cnc'`, est refusé. | 2, 18f |
| R2 | `holdReason`, `:1074` ; `cncStep`, `:1251` | « Ligne latérale » = `CNC_XY_LINE` **ou** une ligne X seule / Y seule du § 4.3. Sans cela ni la hauteur sûre ni le plancher Z ne seraient contrôlés pour N4. | 7 |
| R3 | `cncStop`, `:988` | Cause `program` pour la variante : voir § 5.2. | 19 |
| R4 | `endFrame`, `:901-926` | Sorties de la variante : `lastFrame.kind = 'park'`, code traduit par la table du § 7.1, phrase propre, `revision: null`, journal `kind: 'park'`. Le test interne `session.kind === 'cnc'` reste. | 18d, 21 |
| R5 | `frameProgress`, `:1490-1495` | Publie `kind: 'park'` et la phase ; ni `side` ni `sides`. | 18e |
| R6 | `frame()`, `:1129`, `:1305` | Phrases de refus et de départ propres (« Déplacement invalide. », « Déplacement vers la position de changement lancé : M5, montée de Z, puis X, puis Y. Arrêt : bouton Arrêter. »). | 21 |
| R7 | `atRest`, `:423` ; `job-service.js:197` | Phrase d'exclusion selon la séquence en cours (§ 7.1). Le refus lui-même ne change pas. | 11, 21 |

**Non retouchés, et prouvés par un test chacun** : `supervise` (`:1108-1118`), `transportClosed` (`:1553-1569`), `holds` (`:1572-1574`), la branche `cncStep` de `check` (`:1273`), `abortFrame`, `frameRestarted`, `cancel`, `forget`, `arrivalOff`, `offsetOff`.

## 5. Les gardes

### 5.1 Avant le mouvement : à la préparation, puis de nouveau à l'exécution

« F1 » = garde de `cncFramePlan`, repris tel quel.

| # | Garde | Refus | État |
|---|---|---|---|
| G1 | Opération connue, contrôleur inchangé, flux ouvert appartenant à l'appareil (`moves.bound`) | codes `ETOUCH_MACHINE_*` existants | F1 |
| G2 | La main : port libre ou à cet appareil (`control.authorize`) | famille « main ailleurs » | F1 |
| G3 | Machine CNC : pas un laser déclaré, pas `$32=1` non déclaré, déplacements réels activés, Grbl ≥ 1.1 | capacité `toolPosition` (nouvelle, mêmes règles que `cncFrame`, `machine-profile.js:165-172`) ; `ETOUCH_PARK_LASER` | Nouveau, calqué |
| G4 | Repos complet (`moves.jogReady`) : pas d'usinage ni de pause, pas d'alarme, pas de prise d'origine, de palpage, de chargement, de déplacement ou de cadrage en cours, `Idle`, rapport ≤ 2,5 s, file vide, pas d'automatismes, `$13=0` | ceux de `motion.js:404-462` | F1 |
| G5 | Prise d'origine faite : `r.homed === true`, quel que soit `$22` (donc refus après bannière, alarme, reconnexion : « position perdue ») | `ETOUCH_PARK_NOT_HOMED`, famille `origine-a-prendre` | Calqué sur F1 |
| G6 | Zéro pièce prouvé (D2, `offsetReady`) | `ETOUCH_OFFSET_*` existants | F1. Le mouvement n'utilise pas le zéro ; D2 est gardé parce que c'est la seule preuve que position machine et position pièce sont cohérentes à cet instant, et parce que le superviseur de F1 s'y appuie (`cncStop`). Prudent ; allègement possible plus tard (D-N4-4). |
| G7 | Broche à l'arrêt (`spindleStill`), et refus si la vitesse n'est pas rapportée et que `$G` est ancien | messages existants | F1 |
| G8 | Une position enregistrée **pour cette machine** : même signature (`signatureOf` : pas, vitesses, accélérations, courses, `$22`, `$23`), même `$27`, nombres finis ; sinon elle est traitée comme absente | `ETOUCH_PARK_NONE` (aucune) ; `ETOUCH_PARK_STALE` (réglages changés : « à enregistrer de nouveau ») | Nouveau |
| G9 | `$20=1` lu | `ETOUCH_PARK_SOFT_LIMITS`, famille `cadrage-limites` | Calqué sur F1 |
| G10 | Position machine X, Y, Z connue **et position pièce X, Y connue** (le plan porte le décalage MPos − WPos, § 4.4) | `ETOUCH_LASER_FRAME_POSITION` | F1 (`job-service.js:2030-2037`) |
| G11 | Hauteur sûre calculable : course Z connue, une seule convention | `ETOUCH_CNC_FRAME_Z` | F1 |
| G12 | Départ **et cible** X / Y dans la course utilisable du moment (convention non ambiguë, marge de 0,5 mm côté opposé à la prise d'origine) | `ETOUCH_PARK_OUTSIDE` (`axis`, `value`, `low`, `high`) | Nouveau, calcul de F1 G15 |
| G13 | Aucune ligne de plus de 60 s | `ETOUCH_LASER_FRAME_SLOW` | F1 |
| G14 | À l'exécution : ticket présent, bon numéro, ≤ 15 s, même flux ; plan refait **identique** (mêmes lignes : machine immobile, même cible) ; même enregistrement (date) | `ETOUCH_LASER_FRAME_EXPIRED`, `_CHANGED` | F1 |

Pas de fichier exigé, pas de contrôle des courses d'un programme, pas d'attente de relecture de fichier : entre le second contrôle complet et la première écriture il n'y a **aucune attente asynchrone** (pas de réservation `frameStarting`).

### 5.2 Pendant : avant chaque écriture et toutes les 50 ms

Celles du cadrage à vide, par le même code (`cncStop`, `holdReason`, `cncStep`), parce que la session est `kind: 'cnc'` (§ 4.4). Deux différences, et deux seulement :

- **Ligne latérale** (R2) : la hauteur sûre et le plancher Z valent aussi pour une ligne X seule ou Y seule.
- **Cause `program`** (R3). Aujourd'hui (`:988`) le cadrage s'arrête dès qu'**aucun** programme n'est chargé, ou qu'il n'est plus celui du plan : N4, qui n'exige pas de fichier, s'arrêterait à la première ligne. Pour la variante, la condition devient : « la révision du programme chargé (`r.job.revision`, ou `null` sans programme) n'est plus celle relevée au plan ». Donc aucun fichier n'est exigé, mais **un programme chargé, remplacé ou retiré pendant la séquence l'arrête encore**, comme en F1. Le chemin `r.file` (`job-service.js:594-602`), qui arrête toute séquence quand CNCjs charge un fichier, n'est pas touché. En amont, le chargement reste refusé pendant la séquence (CNCjs classique : `job-service.js:3019` ; tablette : séquence comptée comme un déplacement, `motion.js:827-829`).

Donc : fonction désactivée ; flux de l'appareil perdu (3 s de grâce à la rotation, aucune ligne sans flux) ; main changée (même pas) ; rapport > 2,5 s ; alarme ; référence perdue ; preuve D2, repère ou décalage changés ; usinage démarré d'ailleurs ; file occupée ; automatismes ; réglages changés ; broche vue en marche ou non constatable ; état ni `Idle` ni `Jog` ; `error:N` (15 : D2 invalidé) ; délai ; ligne étrangère à la place de la nôtre ; arrivée inattendue (D2 invalidé). Chaque cas : fin dans le pas, puis `0x85` seul, répété tant que `Jog` est rapporté. Bannière : fin sans un octet.

Avant toute ligne X ou Y : Z machine ≥ hauteur sûre − 0,05 mm, **même si aucune montée n'était prévue** (correction D2 de F1) ; le plancher Z est pris à l'envoi de la première ligne X ou Y et Z ne passe plus dessous.

### 5.3 Enregistrer la position (aucun mouvement, aucune commande)

Opérations `park-save-prepare` / `park-save`, ticket à deux touchers (classe « change un réglage, sans mouvement », comme un zéro).

- Gardes : G1 à G5, G6, G9 à G12 (pour la position actuelle), pas G7. La machine doit donc être référencée, au repos, la main ici.
- **Le serveur lit la position machine** au moment de la préparation ; la requête de la page ne contient ni X ni Y (un champ en trop est refusé). À l'exécution : même position à 0,01 mm (`ORIGIN_MOVED_MM`), sinon `_CHANGED`.
- Écrit dans `.cncrc`, clé `touch.toolPositions` (liste, par signature de machine, 8 au plus, la plus ancienne remplacée) : `{ signature, x, y, pullOff ($27), savedAt, by }`, X et Y à 3 décimales. Par le magasin de configuration, comme `touch.machines`. Journal : événement `tool-position`, avec l'ancienne valeur.
- Aucune ligne écrite sur le port. Test : zéro écriture.
- Pas d'« oublier » dans ce lot : enregistrer de nouveau remplace.

Z n'est jamais enregistré : la hauteur est toujours recalculée de la course du moment.

## 6. Événements et réactions

La table d'états de F1 (`F1-CORRECTIONS.md`, troisième tour) vaut ligne pour ligne, « cadrage » lu « déplacement vers la position ». Rappels et cas propres à N4 :

| Événement | Réaction | État laissé |
|---|---|---|
| Arrêter, Pause, `jog-stop`, Arrêter la broche (sans `M5` écrit en `Jog`) | Fin dans le pas, `0x85` seul. Ni retenue ni reset. | Broche où elle est, Z gardé ; référence et zéro gardés. Relancer repart de là (nouveau plan). |
| Arrêt ou annulation venus de CNCjs classique | `socketEffect` termine la séquence avant de laisser passer. | Selon la commande. |
| Commande non sûre de CNCjs classique | Refusée pendant la séquence. | Inchangé. |
| Flux fermé (page fermée ou rechargée), main prise ou rendue | Arrêt (grâce de 3 s pour une rotation). | Arrêtée. |
| Flux perdu **sans fermeture** (Wi-Fi coupé, veille) | Arrêt seulement quand le serveur s'en aperçoit : délai non garanti, 83 s au pire. La séquence peut aller au bout. | Limite de F1, § 9 ; D-N4-8. |
| Alarme | Arrêt ; aucun déverrouillage ni prise d'origine automatique. | Position perdue : remise en route existante. |
| Bannière | Fin, **aucun octet**. | Position perdue. |
| `error:15` sur une ligne | Arrêt, `ETOUCH_PARK_REFUSED`, D2 invalidé. La carte et le serveur ne voient pas la même course. | Rien n'a bougé pour cette ligne. |
| Arrivée inattendue | Arrêt, `ETOUCH_PARK_POSITION`, D2 invalidé. | Arrêtée, en haut. |
| Réglages relus différents entre l'enregistrement et l'usage | G8 : refus avant tout mouvement. | — |
| `.cncrc` modifié à la main (valeurs absurdes) | G8 (invalide = absente) puis G12 (hors course = refus). | — |
| Deux appareils : l'un enregistre pendant que l'autre confirme | G14 : plan différent, `_CHANGED`. | — |
| Enregistrer ou partir pendant un déplacement vers la position | `atRest` : refusé. | — |
| Aucun programme chargé | Rien : la séquence va au bout (§ 5.2, test 19). | Arrivée. |
| Programme chargé, remplacé ou retiré pendant la séquence | Refusé en amont ; s'il passe quand même : arrêt (`r.file`, cause `program`). | Arrêtée. |
| `G10` / `G92` venu d'ailleurs, repère changé, position pièce X / Y absente d'un rapport | Arrêt `ETOUCH_PARK_STATE` (cause `offset`). | Arrêtée ; zéro à vérifier par la voie existante. |
| **Après l'arrivée** : `M3` écrit par un autre client | **Rien : la séquence est finie, plus rien ne surveille.** Seule l'alimentation coupée protège la main (§ 7.3, § 12). | — |
| CNCjs redémarré, port rouvert | `homed` faux : refus jusqu'à la prise d'origine. La cible, elle, est relue du disque. | — |
| Serveur ou liaison morts pendant une ligne | Personne ne peut annuler : la carte finit **cette** ligne (un axe, ≤ 41 s, dans la course, en haut). Arrêt physique seulement. | Limite de F1, inchangée. |
| Client par le Wi-Fi de la carte | Non empêchable ; détecté par état, alarme, bannière, `error`, arrivée. | Arrêtée. |

## 7. Codes, instantané, écran

### 7.1 Codes nouveaux (FR serveur ; EN / ES au catalogue, en fin de table)

Refus avant : `ETOUCH_PARK_LASER`, `_NOT_HOMED`, `_NONE`, `_STALE`, `_SOFT_LIMITS`, `_OUTSIDE`, `_ALREADY`. Arrêts pendant, un pour un avec ceux du cadrage et les mêmes paramètres : `ETOUCH_PARK_STREAM`, `_CONTROL`, `_STALE_REPORT`, `_TIMEOUT`, `_STATE`, `_REFUSED`, `_ALARM`, `_RESTART`, `_POSITION`. Des codes propres plutôt que les `ETOUCH_FRAME_*` : leurs phrases disent « Cadrage arrêté », fausses ici. Phrase d'exclusion propre (« Déplacement vers la position de changement en cours. ») au lieu de « Cadrage en cours. ».

**Comment, sans retoucher vingt littéraux.** Les codes `ETOUCH_FRAME_*` sont écrits en dur à une vingtaine d'endroits du superviseur (`cncStop` `:961-1012`, `frameRestarted` `:1028`, `holdReason` `:1056-1078`, `cncStep` `:1192-1226`, `transportClosed` `:1562`). **Aucun n'est modifié.** La session garde son code `ETOUCH_FRAME_*` ; une table unique `PARK_CODES`, à côté de `FRAME_MESSAGES` (`:107-117`), est appliquée **à la sortie seulement**, dans `endFrame` (R4), par où passent `abortFrame` et `frameRestarted` :

| Code interne | Code publié pour la variante |
|---|---|
| `ETOUCH_FRAME_STREAM` | `ETOUCH_PARK_STREAM` |
| `ETOUCH_FRAME_CONTROL` | `ETOUCH_PARK_CONTROL` |
| `ETOUCH_FRAME_STALE` | `ETOUCH_PARK_STALE_REPORT` |
| `ETOUCH_FRAME_TIMEOUT` | `ETOUCH_PARK_TIMEOUT` |
| `ETOUCH_FRAME_STATE` | `ETOUCH_PARK_STATE` |
| `ETOUCH_FRAME_REFUSED` | `ETOUCH_PARK_REFUSED` |
| `ETOUCH_FRAME_ALARM` | `ETOUCH_PARK_ALARM` |
| `ETOUCH_FRAME_RESTART` | `ETOUCH_PARK_RESTART` |
| `ETOUCH_FRAME_POSITION` | `ETOUCH_PARK_POSITION` |

Mêmes paramètres. La table doit être **totale** : un test échoue si une clé de `FRAME_MESSAGES` n'y est pas (un code de cadrage ajouté plus tard ne peut pas sortir en « Cadrage arrêté » d'un déplacement). Un arrêt sans code (Arrêter, Pause, arrêt de socket, `program` par `r.file`, `dispose`) sort `code: null` ; sa phrase de journal vient de `STOP_REASONS` (`:82-100`), dont deux entrées disent « pendant le cadrage » (`state`, `program`) : la variante a ses deux phrases (« pendant le déplacement »). La page range un `lastFrame` `park` arrêté sans code dans la famille `changement-arrete`. Les phrases « cadrage terminé, fraise restée en haut » (`:906`), « Cadrage invalide. » (`:1129`), « Cadrage à vide lancé… » (`:1305`), « Cadrage en cours. » (`:103`, `:423`) et celle de `job-service.js:197` ont chacune leur pendant (R4, R6, R7). Test 21 : aucun texte sorti d'une séquence `park` ne contient « adrage ».

Familles de la page : `changement-arrete` (« Déplacement arrêté avant la position de changement. Regardez où est la fraise. » [Recommencer]) ; `changement-position` (« La broche n'est pas arrivée où elle était attendue. Refaites la prise d'origine. » [Prise d'origine machine…]) ; `changement-a-enregistrer` (`_NONE`, `_STALE` : « Enregistrez la position de changement de fraise. ») ; les familles existantes `origine-a-prendre`, `alarme`, `cadrage-limites`, `type-machine`. Avec `referenceLost`, la phrase « position perdue » du P4 allégé s'applique d'elle-même à `_NOT_HOMED`.

### 7.2 Instantané

`toolPosition: { saved: { x, y, savedAt } | null, canGo, goReason, canSave, saveReason }`, `refusals.park`, `refusals.parkSave` ; `motion.frame.kind === 'park'` avec `phase` (`spindle`, `raise`, `x`, `y`) ; `motion.lastFrame.kind === 'park'` avec `code`, `params`. `canPause` vrai pendant la séquence (`job-service.js:1747`, par `moves.framing`, sans retouche). Réponse de la préparation : `park: { lines, target, safeZ, seconds }`. Opérations : `park-prepare` / `park` (aller), `park-save-prepare` / `park-save` (enregistrer).

`'park'` est une valeur **publiée**, pas la valeur interne (§ 4.4) : `motion.frame.kind` vient de `frameProgress` (R5), `motion.lastFrame.kind` et `.code` de `endFrame` (R4), avec `revision: null`. La signature de changement (`:1544-1548`) et `holds` (`:1572-1574`) n'ont rien à apprendre : la session est `kind: 'cnc'`. Ce qui lit `kind` côté page doit être relu, parce qu'une troisième valeur apparaît :

| Où | Aujourd'hui | Avec `kind: 'park'` | À faire |
|---|---|---|---|
| `check-screen.js:139` (`mine`) | résultat du dernier cadrage si `lastFrame.kind === 'cnc'` | faux : 4 · Contrôle ne montre pas le résultat d'un déplacement comme celui d'un cadrage | rien ; test 18g |
| `check-screen.js:143`, `:151` | « Cadrage en cours. » pour tout ce qui n'est pas `cnc` | **phrase fausse** | phrase d'exclusion du § 7.1 quand `kind === 'park'` |
| `job-controls.js:229` (deux fois) | « Un cadrage est en cours : prendre / rendre la main l'arrête. » dès que `motion.frame` existe | **phrase fausse** | « Un déplacement vers la position de changement est en cours : … » |
| `job-controls.js:309`, `:582`, `:611` (`frameKind`) | ticket de l'opération `frame` | non concerné : N4 a ses opérations | rien |
| `tablet-actions.js:196`, `zero-piece.js:14` | occupé dès que `motion.frame` existe | vrai aussi pour N4 : flèches et zéros grisés | rien ; test de page |

Non vérifié : qu'aucun contrat d'instantané ni aucun test existant n'énumère les valeurs de `kind` (`'laser'`, `'cnc'`) ; à chercher en phase B avant d'en publier une troisième.

### 7.3 Écran

- **3 · Zéro pièce**, colonne « Position pièce » : [Changer la fraise…] (`#tool-change-open`, 48 px) sous [Position machine]. La colonne a 80 px libres à 768 (`SPEC-REFONTE.md` § 4.3 : 436 contre 516) : **à mesurer au harnais**, non vérifié. Jamais masqué en CNC ; absent en laser.
- **Volet « Changer la fraise »** (`ks-tool-change`, modèle `ks-zero-more`) : ligne d'état de la position ; [Aller à la position de changement…] rayé avec la phrase de la famille et son remède ; [Enregistrer cette position…] de même ; ligne d'avancement (« La fraise monte. », « Vers la position de changement. ») ; résultat. Le volet est sous le bandeau : Pause et Arrêter restent visibles et actifs (règle § 5.1 de la spec, à prouver au harnais).
- **Dialogue « Aller à la position de changement »** (classe « met la machine en mouvement », trois touchers, armement 600 ms, ticket 15 s) : « La fraise monte tout en haut, puis la broche va à la position enregistrée. Elle ne redescend pas. À l'arrivée, coupez l'alimentation de la broche avant de toucher la pince. » ; ligne « environ N s » ; case : « Je suis devant la machine, la broche est arrêtée et rien de haut ne gêne son trajet. » ; bouton « Aller à la position ». Détails : les lignes, la hauteur sûre, la cible en position machine.
- **Dialogue « Enregistrer cette position »** (deux touchers) : « La broche sera ramenée ici pour changer la fraise. Aucun axe ne bouge. » ; Détails : ancienne et nouvelle position machine ; bouton « Enregistrer cette position ».
- **Résultat à l'arrivée**, deux lignes, la première en couleur d'avertissement (`--warn`) avec son pictogramme : « **Attendez l'arrêt complet de la broche et coupez son alimentation avant de toucher la pince.** » puis « Changez la fraise, puis refaites le zéro Z. » + [Fermer] (retour à 3 · Zéro pièce). Pourquoi : la broche n'est qu'à `M5` ; la case cochée avant le départ atteste l'arrêt **avant** le mouvement, pas au moment où la main approche ; et après l'arrivée la séquence est finie, donc rien n'arrête ni ne signale un `M3` écrit par un autre client. Le serveur ne voit que la consigne, jamais la rotation ni l'alimentation : seule la phrase protège. La même consigne figure dans le dialogue de départ (« À l'arrivée, coupez l'alimentation de la broche avant de toucher la pince. »), pour qu'elle soit lue avant que la main ne bouge. Place des deux lignes dans le volet à 1366 × 768, texte agrandi : à mesurer au harnais.
- Tout vient de l'état reçu ; la page ne calcule aucune autorisation et n'envoie ni position ni ligne. FR / EN / ES, jetons de couleur, cibles ≥ 48 px, ES2017, rien de propre à Chromium récent. Les flèches sont grisées pendant la séquence (règle existante dès que `motion.frame` existe).

## 8. Tests exigés

Chaque test échoue sans le code, sauf les **témoins**, marqués, qui ne prouvent pas le code. `T/` = `src/server/services/touch/__tests__/`.

### 8.1 Serveur, faux contrôleur (`T/tool-position.test.js`)

1. Plan nominal : exactement `M5`, la ligne Z sans signe, la ligne X, la ligne Y ; vitesses 300 et 600 ; distances = cible − position à 0,001.
2. **Propriété, jamais de descente** : pour 200 positions de départ et cibles tirées dans la course, aucune ligne Z signée, aucun mot Z hors de la position 1, un seul axe par ligne ; `motion.frame` refuse un plan forgé : Z signé, Z en position 2 ou 3, `X… Y…` sur une ligne, Y avant X, deux lignes X, `G53`, `G0`, `G90`, `M3`, sans `M5`.
3. Z déjà au-dessus de la hauteur sûre : pas de ligne Z, Z ne change pas ; déjà en X (ou en Y) : pas de ligne pour cet axe ; déjà partout : `_ALREADY`, rien d'écrit.
4. Un refus par garde G1 à G13, avec son code, **rien d'écrit** : laser, `$32=1` non déclaré, déplacements désactivés, non référencée (aussi à `$22=0`), après bannière, après alarme, D2 non prouvé (trois codes), broche en marche, broche inconnue, aucune position, signature différente (`$130` changé), `$27` différent, enregistrement invalide (texte, `NaN`, champ manquant), `$20=0` et inconnu, cible hors course de 0,1 mm (chaque borne), cible dans la bande de 0,5 mm, départ hors course, convention ambiguë, usinage en cours, pause `M6`, palpage, prise d'origine, cadrage en cours, main ailleurs, flux d'un autre appareil.
5. Ticket : usage unique, expiré, autre flux, machine déplacée de 0,02 mm entre les deux temps, position réenregistrée entre les deux temps → `_CHANGED` / `_EXPIRED`, rien d'écrit.
6. Séquence : la ligne suivante ne part ni avant l'`ok`, ni avec un seul rapport, ni en `Jog`.
7. Hauteur sûre : arrivée Z 0,06 mm trop bas → `_POSITION`, aucune ligne X ; sans montée prévue, Z descendu pendant `M5` → aucune ligne X ; Z descendu entre X et Y → aucune ligne Y (ce dernier cas échoue sans R2 : le plancher Z ne serait jamais pris).
8. Arrivée X ou Y décalée de 0,06 mm → arrêt `_POSITION`, D2 invalidé ; 0,04 mm → continue.
9. Fin normale : `lastFrame` `ended`, `kind: 'park'`, journal ; **aucune** ligne `G10`, `G92`, `G5x` écrite de toute la séquence ; preuve D2 inchangée.
10. Arrêts × moments (pendant `M5`, la montée, X, entre X et Y, Y) : Arrêter, Pause, `jog-stop`, Arrêter la broche, appareil sans la main → `0x85`, plus aucune ligne après 61 s au repos, ni `!`, ni `0x18`, ni `M5` de plus.
11. Fenêtre entre deux lignes (D1 de F1) : après `ok` et deux rapports, avant le pas du superviseur : pas Z−, continu, zéro, cadrage, second départ, enregistrement → refusés, rien d'écrit.
12. **Table d'états de F1 rejouée pour la variante `park`** : mêmes événements × mêmes états, même réponse par case (matrice lue dans `SAFE_COMMANDS` / `SAFE_WRITES` par la vraie façade ; bannière : aucun octet ; rotation du flux ; main ; périmé ; alarme ; `dispose`).
13. `error:15` → `_REFUSED`, D2 invalidé ; `error:9` → `_REFUSED`, D2 gardé ; délai ; ligne relâchée sans `ok`.
14. Réglages, repère, décalage, automatismes changés pendant la séquence → arrêt `_STATE`.
15. Enregistrer : la position écrite est celle du serveur (une requête portant `x` / `y` est refusée) ; refus par garde ; ticket ; machine déplacée entre les deux temps ; **zéro écriture sur le port** ; remplacement, borne de 8, journal ; relu après un nouveau service (redémarrage de CNCjs simulé).
16. Catalogue : chaque code nouveau a sa ligne FR identique et ses lignes EN, ES.
17. *Témoins* : `T/cnc-frame.test.js`, `T/cnc-frame-lunyee.test.js`, `T/manual-jog-banner.test.js`, suite laser de `T/machine-profile.test.js` **verts sans modification** (sauf la liste des capacités, à dire).
18. **Un test par endroit de `motion.js` qui ne sert qu'une session `kind: 'cnc'`** (§ 4.4). Modèles : tests 16, 16b et 17 de `cnc-frame.test.js` (`:628`, `:649`, `:685`). Chacun échoue si la session de N4 cesse d'être `cnc` ; contre-épreuve à faire une fois en phase B et à noter dans `N4-RAPPORT.md` : avec `session.kind` forcé à `'park'` dans une copie de travail, 18a à 18f doivent tous échouer.
    - 18a. `supervise` (`:1110`) : la main prise par un autre appareil pendant X → `0x85` écrit **dans l'appel même** de la prise de main, avant tout pas d'horloge ; `lastFrame.code === 'ETOUCH_PARK_CONTROL'`.
    - 18b. `transportClosed` (`:1560`) : le dernier flux de l'appareil se ferme pour de bon pendant X → `0x85` immédiat, `ETOUCH_PARK_STREAM`, sans attendre 3 s ; un second flux du même appareil resté ouvert → la séquence continue ; le flux d'un autre appareil qui se ferme → rien.
    - 18c. `holds` (`:1574`) : pendant la séquence, le flux qui l'a confirmée n'est pas tourné (`ticketPending` vrai, `job-service.js:2867-2892`) ; fermeture avec `rotated` → grâce : aucune ligne ne part sans flux, la ligne suivante part au retour d'un flux, arrêt `ETOUCH_PARK_STREAM` à 3 s sinon.
    - 18d. `endFrame` (`:901-916`) : `lastFrame` a `kind: 'park'`, `code` traduit, `params`, `revision: null` ; le journal a `kind: 'park'`, `code`, `safeZ`.
    - 18e. `frameProgress` (`:1490`) : `motion.frame.kind === 'park'` et `phase` vaut `spindle`, `raise`, `x`, `y` à chaque ligne ; ni `side` ni `sides`.
    - 18f. `frame()` (`:1124`, `:1273`) : la séquence est menée par `cncStep` : une alarme rapportée entre l'arrivée de X et l'envoi de Y arrête avec `ETOUCH_PARK_ALARM` et Y ne part pas ; un plan `variant: 'park'` sans `kind: 'cnc'` (ou `kind: 'laser'`) est refusé ; un plan `kind: 'cnc'` sans variante portant une ligne X seule est refusé (validateur de F1) ; un plan `park` portant une ligne `$J=G90 … X… Y…` de cadrage est refusé.
    - 18g. Page (`test-tool-position.cjs`) : état injecté `motion.frame.kind === 'park'` → 4 · Contrôle n'écrit nulle part « Cadrage », [Cadrer à vide…] est désactivé avec la phrase d'exclusion du § 7.1 ; `motion.lastFrame.kind === 'park'` → aucun résultat de cadrage sur 4 · Contrôle ; dialogue de prise de main : phrase du déplacement, pas « Un cadrage est en cours ».
19. **Séquence complète sans aucun programme chargé** (`r.job` nul, `sender.context` vide, depuis la connexion) : préparation acceptée, quatre lignes, `ended`. Échoue sans R3 (arrêt `program` à la première ligne). Puis : même séquence avec un programme chargé → `ended` ; `sender` chargé, remplacé puis vidé pendant X (événements `load` / `unload` injectés) → arrêt, `0x85`, Y ne part pas. *Témoin* : le cadrage de F1 dont le programme est remplacé s'arrête toujours avec `ETOUCH_FRAME_STATE` / `program` (`cnc-frame.test.js:1194`, inchangé).
20. **Décalage et position pièce.** `frame()` refuse un plan `park` sans `offset`, ou avec `offset.x` / `.y` non finis ; position pièce X ou Y absente à la préparation → `ETOUCH_LASER_FRAME_POSITION`, rien d'écrit ; `offset` du plan = MPos − WPos à 0,001 ; pendant X, décalage changé de 0,06 mm (`G10 L20` d'un autre client) → arrêt `ETOUCH_PARK_STATE` (`offset`) ; changé de 0,04 mm → continue ; position pièce absente d'un rapport → arrêt.
21. **Codes et phrases.** `PARK_CODES` couvre toutes les clés de `FRAME_MESSAGES` (égalité des ensembles) ; chacun des neuf arrêts, provoqué sur une séquence `park`, publie son code `ETOUCH_PARK_*` avec les paramètres du code de cadrage ; sur un cadrage de F1 le même arrêt publie toujours `ETOUCH_FRAME_*` ; aucun texte sorti d'une séquence `park` (message de départ, `lastFrame.message`, refus d'exclusion côté tablette et côté socket, journal, arrêt sans code) ne contient « adrage ».

### 8.2 Simulateur, profil LUNYEE (`T/tool-position-lunyee.test.js`)

- P1. Vrai `$H`, vraie preuve D2, zéro pièce non nul (`G10 L2 P1 X50 Y100 Z-105`), dans les deux hypothèses `executedAfterHoming` : aller à X 20, Y 380, enregistrer, aller à X 300, Y 50, Z −60, lancer ; à la fin la position machine du simulateur vaut (20 ; 380 ; −5) ; **Z relevé à chaque rapport ne baisse jamais** ; X ne bouge pas pendant la montée, Y pas pendant X. Le résultat est le même dans les deux hypothèses (le mouvement ne dépend pas du zéro).
- P2. `$#`, `$G` et le zéro pièce relus avant et après : identiques.
- P3. Cible à la borne utilisable exacte (X 407,5 ; Y 395,5 ; X 0 ; Y 0) : atteinte sans `error:15` ; enregistrement tenté à X 407,6 : refusé.
- P4. Z à 0 après la prise d'origine : aucune ligne Z, Z du simulateur immobile.
- P5. Arrêter pendant X : repos entre deux points, pas de bannière, `homed` et D2 gardés ; relance : nouveau plan depuis là, arrive.
- P6. Reset (`0x18`) injecté pendant X : `ALARM:3`, bannière, aucun octet ensuite, départ refusé `_NOT_HOMED`.
- P7. `$20=0` dans le simulateur : refus, rien d'écrit.
- P8. Position machine du simulateur déplacée par le banc entre le plan et l'exécution (client tiers) : `_CHANGED` ; déplacée entre deux lignes : `_POSITION` ou `error:15`, jamais de descente.
- P9. Aucun fichier chargé depuis l'ouverture du port : P1 arrive quand même (pendant du test 19 sur le vrai contrôleur).
- P10. Flux de la tablette fermé pendant X (dernier flux de l'appareil) : `0x85`, le simulateur revient au repos entre deux points, Y ne part pas, `homed` et D2 gardés ; écriture refusée sur le flux (`res.write` rend `false`, tablette qui ne lit plus) : même arrêt immédiat ; flux tourné puis non rouvert : arrêt à 3 s. Pendant du pas N4-C5 de l'essai réel, **pour les pertes que le serveur voit** ; la perte qu'il ne voit pas (§ 9) n'a pas de test : c'est une limite, pas un comportement à figer.
- P11. Alarme en cours de ligne (capteur de fin de course simulé pendant X) : arrêt, aucune ligne ensuite, ni `$X` ni `$H` écrits. **C'est la seule preuve de ce cas** : il n'est pas provoqué sur la machine (§ 9).

### 8.3 Page (`examples/cncjs-touch/test-tool-position.cjs`, dans `verify-project.cjs`)

Bouton présent en CNC, absent en laser ; volet : états « aucune position », « enregistrée », rayé avec phrase et remède pour chaque famille ; dialogues : textes, case, armement 600 ms, un seul envoi, ticket jamais rejoué ; la requête d'enregistrement ne contient aucun nombre ; avancement par phase et résultat depuis un état injecté ; à l'arrivée, **les deux lignes** (la consigne « coupez son alimentation avant de toucher la pince » d'abord, visible sans défilement à 1366 × 768, texte normal et agrandi) et retour à 3 · Zéro pièce ; la même consigne dans le dialogue de départ ; test 18g ; Arrêter et Pause actifs volet ouvert ; `test-refus-table.cjs`, `test-i18n.cjs`, `test-textes-regles.cjs`, `test-confirmation-classes.cjs` (*témoins* complétés). Harnais : `browser-run.cjs --strict --only screens` à 1366 × 768 et 1366 × 911, texte normal et agrandi ; défauts tolérés : `HARNAIS-CONNU.md` seulement.

### 8.4 À chaque commit

`node examples/cncjs-touch/verify-project.cjs` ; `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false` ; ESLint sur les fichiers touchés.

## 9. Essai réel, pas à pas (pour `PROTOCOLE-ESSAI.md`)

Après les suites vertes et l'installation décidée par l'opérateur. **Broche débranchée de son alimentation pour A à C.** CNCjs classique ouvert sur le PC en observateur. Main sur l'arrêt physique à chaque mouvement. Relire d'abord les réglages : noter `$20`, `$27`, `$110-$112`, `$130-$132` ; si `$20` ne vaut pas 1, tout sera refusé : c'est voulu.

| Étape | Manipulation | Attendu / à relever |
|---|---|---|
| N4-A1 | Connectée, sans prise d'origine. 3 · Zéro pièce → [Changer la fraise…]. | Les deux boutons rayés, « Origine machine pas prise » et son remède. |
| N4-A2 | Prise d'origine ; pendant la vérification du zéro pièce. | Rayés, puis [Enregistrer…] plein ; [Aller…] rayé « Enregistrez la position… ». |
| N4-A3 | **Table vide, pince sans fraise.** Avec les flèches, amener la broche à l'endroit voulu (par exemple devant à gauche). [Enregistrer cette position…], lire, engager. | Aucun mouvement. Détails : position machine notée ; la comparer à celle du PC. |
| N4-A4 | [Aller…] tout de suite. | Refus « déjà à la position » si Z est en haut ; sinon seule la montée. |
| N4-B1 | Flèches : aller vers le milieu de la table, Z machine vers −60. [Aller à la position de changement…], lire (durée, Détails), cocher, engager. | Dans l'ordre : `M5` ; Z monte **seul** jusqu'à −5,000 ; X **seul** ; Y **seul** ; arrêt. Position machine finale = position enregistrée (0,05 mm), Z −5. Z n'a jamais baissé. Chronométrer X : 100 mm ≈ 10 s. |
| N4-B2 | Après. | Repos, ni alarme ni bannière ; position pièce cohérente (zéro pièce inchangé au PC : `$#` identique) ; les deux lignes : « Attendez l'arrêt complet de la broche et coupez son alimentation avant de toucher la pince. » puis « Changez la fraise, puis refaites le zéro Z. ». Dire si la consigne se lit d'un coup d'œil, debout. |
| N4-B3 | Refaire depuis un autre endroit, Z déjà en haut. | Pas de montée. |
| N4-C1 | Relancer de loin ; **Arrêter pendant la montée**. | Arrêt net ; X / Y immobiles ; référence gardée. Relancer : repart de là. |
| N4-C2 | Relancer ; **Arrêter pendant X**. Mesurer temps et distance d'arrêt. | Quelques millimètres ; plus aucun mouvement pendant une minute ; Y n'est pas parti. |
| N4-C3 | Pendant X : une flèche sur la tablette ; puis « feed hold » dans CNCjs classique. | Flèche refusée ; au feed hold la broche s'arrête et **ne repart pas**. |
| N4-C4 | Prendre la main depuis le PC pendant Y. | Arrêt. |
| N4-C5 | **Perte de la tablette pendant X** (la panne la plus probable en atelier ; X peut durer 41 s). Relancer de loin, en X surtout (au moins 200 mm, soit 20 s). Trois fois, en repartant de loin à chaque fois : (a) fermer l'onglet de la page ; (b) couper le Wi-Fi de la tablette ; (c) mettre la tablette en veille (bouton). Chronométrer du geste à l'arrêt de la broche ; regarder au PC. | (a) arrêt presque immédiat (la connexion se ferme, le serveur le voit). (b) et (c) : **le temps n'est pas garanti par le code, c'est le chiffre que cet essai doit donner** (voir « Flux perdu sans fermeture » ci-dessous). Souhaité : 3 s environ (à 600 mm/min, 30 mm). Dans les trois cas, relever : le temps, si **Y est parti**, l'absence d'alarme, la référence gardée ; page rouverte : [Aller…] plein, repart de là. Si en (b) ou (c) la broche finit X puis fait Y : c'est la limite annoncée, à porter à la décision D-N4-8 ; la fonction ne s'installe pas sans cette décision. |
| N4-D1 | Pièce bridée, fraise montée, zéro pièce fait, broche **toujours débranchée**. Regarder que rien sur la table (bride, tuyau) n'est plus haut que la fraise relevée. [Aller…]. | La broche arrive à la position ; lire la consigne d'alimentation (ici déjà coupée) ; changer la fraise ; refaire le zéro Z (plaque ou « Zéro Z ici ») ; X et Y du zéro pièce inchangés (cadrage à vide ou repère au crayon). |
| N4-D2 | Usinage en cours, puis en pause : ouvrir le volet. | [Aller…] et [Enregistrer…] rayés. |

Ne pas essayer : enregistrer « pour voir » au ras d'un capteur, `$20=0`, un reset en mouvement, débrancher l'USB pendant une ligne, **provoquer une alarme en cours de ligne** (toucher un capteur à la main pendant X : la carte perd sa position et la main est près du portique).

**Ce que l'essai réel ne prouve pas.** L'arrêt sur une alarme en cours de ligne, sur une bannière et sur un `error:15` n'est prouvé qu'au banc (tests 10, 13, 18f, P6, P11), pas sur la machine. La perte du serveur lui-même (CNCjs tué, câble USB) n'est pas essayée : la carte finit alors la ligne en cours (§ 6). Les arrêts essayés sur la machine sont : Arrêter (C1, C2), le feed hold d'un autre client (C3), la prise de main (C4), la perte de la tablette (C5).

**Flux perdu sans fermeture (limite héritée de F1, trouvée en préparant N4-C5).** Le serveur n'arrête la séquence que lorsqu'il **sait** que le flux de l'appareil est perdu. Il le sait : à la fermeture de la connexion (`touch-stream.js:164`, `:180-181` : onglet fermé, page rechargée, navigateur tué) ; quand une écriture est refusée parce que la mémoire tampon est pleine (`:68-70`) ; à la rotation du flux, retenue pendant une séquence jusqu'à 80 s de vie du flux (`:14`, `:18`, `:61-64`), puis 3 s de grâce. **Aucun signal de présence ne monte de la page pendant une séquence** (le maintien de 250 ms n'existe que pour le déplacement continu, `motion.js:41`, `:806-822`). Un Wi-Fi coupé net ou une veille ne ferment pas la connexion : tant que les tampons absorbent les états envoyés chaque seconde, le serveur croit la tablette présente, et `cncStep` envoie la ligne suivante. Borne lue dans le code : au pire 83 s, soit plus que la séquence entière ; **dans ce cas la broche peut finir X et faire Y sans que personne ne regarde un écran**. Elle reste en haut, dans la course, à 600 mm/min ; l'arrêt physique reste le seul moyen. Le délai réel dépend de la taille des états et des tampons du système : non mesuré. D'où N4-C5 et la décision D-N4-8.

Relevé : fait / non fait, lignes écrites vues au PC, positions, temps, toute surprise.

## 10. Décisions laissées à l'orchestrateur ou à l'opérateur

| # | Question | Choix de la conception (le plus prudent) | Autre voie |
|---|---|---|---|
| D-N4-1 | Formes `G53` et `G53 G0` du prompt, ou relatif `$J=G91` ? | Relatif (E1, E2). | Après l'essai E-A du protocole (preuve de `$J=G53 G90` sur la carte), une cible absolue en `$J=G53` serait plus directe ; `G0` reste écarté (alarme, reset). |
| D-N4-2 | Rappeler ou imposer « zéro Z à refaire » avant le prochain départ ? | **Phrase seule, aucun garde** : le serveur ne sait pas si la fraise a été changée, et un garde de départ est ce que I-27 s'est vu refuser. Risque dit : démarrer avec l'ancien zéro Z après un changement de fraise fait plonger trop bas ou usiner en l'air ; c'est le risque d'aujourd'hui, inchangé. | Un rappel d'affichage sur 4 · Contrôle jusqu'au prochain zéro Z posé par la tablette (sans blocage). À décider par l'opérateur. |
| D-N4-3 | Vitesse X / Y. | 600 mm/min, fixe. | 1500 (borne déjà admise par F1) après mesure de la distance d'arrêt. |
| D-N4-4 | Exiger D2 (G6) ? | Oui. | Le retirer : le mouvement ne dépend pas du zéro ; demande d'adapter le superviseur. |
| D-N4-5 | Un axe par ligne, ou diagonale ? | Un axe par ligne (format noté sur la carte). | Diagonale `X… Y…` : plus court, format non noté. |
| D-N4-6 | Pendant une pause `M6` ? | Refusé (hors lot : I-26, changement de fraise guidé). | — |
| D-N4-7 | **Pour l'opérateur.** À l'arrivée, la broche n'est qu'à `M5` et rien ne surveille plus : un autre client (CNCjs classique sur le PC, Wi-Fi de la carte) peut la relancer pendant que la main est sur la pince. | **Consigne écrite** au départ et à l'arrivée : attendre l'arrêt complet, couper l'alimentation de la broche avant de toucher la pince. Le logiciel ne peut ni couper ni constater l'alimentation. | Un interrupteur ou une prise commandée à portée de main, que l'opérateur coupe par habitude ; fermer CNCjs classique sur le PC pendant un changement. Aucune des deux n'est du logiciel de ce lot. |
| D-N4-8 | **Pour Astra, puis l'opérateur.** Tablette perdue sans fermeture de connexion (Wi-Fi, veille) : le serveur peut ne pas le voir avant la fin de la séquence (§ 9). Même limite que le cadrage à vide installé. | **Ne rien construire dans ce lot** (leçons L6, L7 : pas de mécanisme nouveau dans le code partagé), dire la limite, et **mesurer en N4-C5 avant toute installation**. | Un signal de présence de la page pendant toute séquence supervisée (par exemple une requête par seconde ; 3 s sans signal → arrêt), comme le maintien du déplacement continu. Il toucherait aussi le cadrage de F1 : lot à part, avec sa relecture. C'est la voie à prendre si N4-C5 (b) ou (c) dépasse quelques secondes. |

## 11. Fichiers que la phase B toucherait

Serveur : `motion.js`, **les sept retouches R1 à R7 du § 4.4 et rien d'autre** (validateur de lignes et variante dans `frame` ; ligne latérale dans `holdReason` et `cncStep` ; cause `program` dans `cncStop` ; sorties dans `endFrame` et `frameProgress` ; table `PARK_CODES` et phrases ; phrase d'exclusion dans `atRest`), les endroits `:1110`, `:1560`, `:1574` restant intacts ; `job-service.js` (plan avec `offset`, `expect`, `phases`, `safeZ`, `revision` ; opérations ; instantané ; phrase `SOCKET_FRAME_BUSY` `:197` ; en fin de section) ; `machine-profile.js` (capacité, messages, stockage `touch.toolPositions` ou un petit module voisin) ; catalogue des codes ; tests du § 8. Page : `index.html` (bouton, volet), un module `touch/tool-position.js`, `job-controls.js` (deux dialogues ; phrase de prise de main `:229`), `check-screen.js` (`:143`, `:151` : phrase quand `kind === 'park'`), `refus.js` et tables i18n (fin de table), `verify-project.cjs`. Documents : `SURETE.md` § N4, `PROTOCOLE-ESSAI.md` § N4, `IDEES.md`, `N4-RAPPORT.md`.

## 12. Ce qui n'est pas vérifié

- **Rien sur la machine.** Les faits C2 à C4 viennent de notes de séance hors dépôt citées par F1 ; je ne les ai pas relus à la source.
- Aucun relevé de l'essai réel F1 dans le dépôt : la distance d'arrêt sur `0x85` n'est pas mesurée ; le simulateur annule sans rampe.
- La valeur actuelle de `$20` sur la carte (C7).
- Qu'une distance quelconque à trois décimales (`X-184.237`) est acceptée comme un pas rond par ce binaire : syntaxe standard, non notée telle quelle.
- Que le simulateur accepte ces lignes au profil LUNYEE : lu dans le code (`grbl-simulator.js:1461-1525`), non exécuté.
- La place du bouton dans la colonne de 3 · Zéro pièce à 1366 × 768 et le volet sous le bandeau : aucun navigateur lancé.
- Que `cncStop`, `holdReason` et `arrivalOff` se prêtent à la variante `park` sans autre retouche que les sept du § 4.4 : relu ligne par ligne pour cette révision (`motion.js:895-1308`, `:1487-1574`), **non essayé**. La première version de ce document disait « par construction » : c'était faux, et rien ne garantit qu'une huitième dépendance ne m'a pas échappé ; les tests 18 à 21 et la contre-épreuve du test 18 sont là pour cela.
- **Broche relançable pendant le changement.** Après l'arrivée, aucune surveillance. `M3` par CNCjs classique ou par le Wi-Fi de la carte : possible, non empêché, non signalé. Je n'ai pas vérifié si la main gardée par la tablette refuse un `M3` de CNCjs classique après la séquence ; le Wi-Fi de la carte ne passe de toute façon pas par le serveur. Seule la consigne d'alimentation coupée couvre ce risque (D-N4-7).
- **Délai d'arrêt quand la tablette disparaît sans fermer sa connexion** : non garanti par le code, non mesuré (§ 9, D-N4-8). Vaut aussi pour le cadrage à vide déjà installé.
- L'arrêt sur alarme en cours de ligne : banc seulement, jamais sur la machine.
- Qu'aucun contrat ni test existant n'énumère les valeurs de `motion.frame.kind` (§ 7.2).
- Les trois avis d'Astra sur I-27 (`astra-P4.md`, `astra2-P4.md`, `astra3-P4.md`) ne sont pas dans le dépôt : § 3 s'appuie sur leur résumé dans `P4-CONCEPTION.md` § 0, § 12, § 13 et `IDEES.md`.
- La broche en roue libre : le serveur voit la consigne, pas la rotation ; seules la case (avant le départ) et la consigne d'arrivée en parlent.
- Textes EN / ES non écrits ici (phase B), non relus par un locuteur.
- Le harnais (`browser-run.cjs`) n'a pas été lancé : ce commit n'ajoute qu'un document. Les suites du § 8.4 ont été relancées sur l'arbre pour la révision 2 ; leur résultat est dans le compte rendu de l'auteur, elles ne prouvent rien sur N4 (aucun code).
