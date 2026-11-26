# Constat : rapports d'état sans position, vitesse de broche ancienne — ce qui est déjà installé est-il exposé ?

Nuit du 26 novembre 2026, à la suite du contre-avis d'Astra sur N4 (`N4-CONCEPTION.md` § 13). Arbre `cncjs-wt/N4`, base `0acd1c3b` ; `motion.js` et `src/server/controllers/Grbl/` y sont identiques à ceux de `feat/nuit-2026-11-26`. **Constat seul : aucun code écrit, rien d'essayé sur la tablette, la RT ni la CNC.** Je n'ai pas lu la version réellement installée sur la Surface.

Vocabulaire de ce document : **prouvé** = rejoué en mémoire cette nuit, avec le vrai parseur et le vrai service ; **lu** = constaté dans le code, non rejoué ; **théorique** = possible d'après le code, sans rapport de la carte qui le montre.

## 0. Lecture rapide

1. **Oui, le code installé a les deux défauts** : le cadrage à vide (F1), les flèches (pas et continu) et, à la lecture, les deux palpages. Prouvé pour le cadrage et les pas ; lu pour le reste.
2. **Non, rien ne montre que la carte LUNYEE les déclenche.** Le défaut de position demande des rapports d'état **sans** `MPos:`. Le code amont de la carte écrit `MPos:` (ou `WPos:`) dans chaque rapport, sans condition, et le seul rapport relevé sur la carte les porte. Les reproductions utilisent des lignes fabriquées (`<Idle|FS:0,0>`) que la carte n'est pas connue pour émettre.
3. Un rapport **abîmé** isolé (parasite sur la liaison) peut donner un rapport sans position, mais un seul : il mène au pire à un arrêt à tort, pas à un mouvement à tort.
4. Le défaut de broche a **une variante qui ne demande aucun rapport anormal** : `M3` envoyé avec `S0` (ou sans `S` après un redémarrage de la carte). La carte rapporte `FS:…,0`, le serveur conclut « broche arrêtée » et ne lit pas le `$G` qui dit `M3`. Prouvé. Ce que la broche fait physiquement dans cet état (variateur) n'est pas connu.
5. **Gravité réaliste.** Position : conséquence potentielle sérieuse (une ligne latérale du cadrage à une hauteur non constatée, 60 s au plus), probabilité très faible sur cette carte, non observée. Broche : conséquence moyenne, probabilité faible, atteignable par une commande d'un autre client.
6. **Proposition.** Ne rien désinstaller. (a) Lire `MPos:` et `FS:` dans les 60 rapports de l'étape A7 du protocole, déjà prévue, sans commande nouvelle : cela tranche le point 2. (b) Corriger dans un petit lot à part, du type « arrêter plus tôt » : position **portée par le rapport lui-même**, broche jugée sur des informations **datées**. Coût attendu nul sur une carte conforme. Rien n'est codé ici.

## 1. Les deux défauts

### 1.1 Position

CNCjs ne garde pas « le dernier rapport » : il **fusionne** chaque rapport dans l'état précédent.

- `GrblRunner.js:110-116` : `status: { ...this.state.status, ...payload }`. Un champ absent du rapport garde sa valeur d'avant. (`Pn:` et `A:` sont vidés exprès, `:99-108` ; les positions, non.)
- `GrblLineParserResultStatus.js:57-74` : `payload.mpos` / `payload.wpos` n'existent que si le rapport porte `MPos:` / `WPos:`.
- `job-service.js:394` : `r.seen = clock()` à **chaque** rapport ; `:406` : `r.reports += 1` à chaque rapport.
- `job-service.js:395-397` : `r.xyzAt` n'est daté que si le rapport porte une position (`explicitXyz`, `:128-131`). **`motion.js` ne lit jamais `r.xyzAt`** (aucune occurrence) ; il ne sert qu'à l'estimation de durée (`:691`).
- `motion.js:347` (`fresh`) : « rapport de moins de 2,5 s », pas « position de moins de 2,5 s ».
- `motion.js:348-351` (`positionOf`) : lit l'état fusionné.
- `motion.js:368` (`settle`) : deux rapports après l'`ok`, quels qu'ils soient.
- `motion.js:1016-1020` (`offsetOff`), `:1074-1079` (hauteur sûre), `:1086-1104` (`arrivalOff`), `:1252` (plancher Z) : tous par `positionOf`.

Donc : des rapports sans coordonnées **rafraîchissent la date** d'une position qui, elle, ne bouge plus.

### 1.2 Broche

- `GrblLineParserResultStatus.js:121-124` : `payload.spindle` n'existe que si le rapport porte `FS:`. Sinon `status.spindle` garde la dernière vitesse reçue.
- `job-service.js:920-932` (`spindleStill`) : vitesse > 0 → refus ; le `$G` (`M3` / `M4`) n'est regardé **que si la vitesse est absente** (`null`), jamais si elle vaut 0.
- `job-service.js:1474` (adaptateur donné à `motion.js`) : ajoute seulement « vitesse absente et `$G` ancien ».
- `motion.js:1005` (cadrage), `:491` (pas de plus de 0,1 mm), `:743` (continu) ; `plate-probe.js:132` ; départ d'un programme `job-service.js:1003` ; `offsetMode` `:959` ; arrêt et commandes système `:987`, `:993`.

Donc : une vitesse 0 reçue une fois vaut « broche arrêtée » tant qu'aucun `FS:` ne la remplace, quoi que dise le `$G`.

## 2. Ce que la carte LUNYEE émet vraiment

| Source | Ce qu'elle dit | Degré |
|---|---|---|
| `design/refonte/FIRMWARE.md` § f | Format `<État\|MPos:x,y,z,a\|FS:avance,broche[\|Pn:…][\|WCO:…][\|Ov:…][\|A:…]>` ; `FS:` « toujours présent » ; `WCO:` et `Ov:` un rapport sur dix. Tiré du code amont (Grbl_Esp32, commit `1f2c8a3`), **pas du binaire du fabricant**, dont les sources ne sont pas publiées. | Lecture du code amont |
| Code amont relu cette nuit (`Report.cpp` du même commit, fonction `report_realtime_status`) | La position est écrite par un `if / else` sans autre condition : `\|MPos:` ou `\|WPos:`, toujours l'un des deux. `\|FS:` est sous une option de compilation (`REPORT_FIELD_CURRENT_FEED_SPEED`) : présent dans tous les rapports ou dans aucun, jamais par intermittence. Le rapport est composé dans un tampon de 200 caractères et envoyé en **un seul** appel. | Lecture du code amont (par un résumé automatique de la page ; je n'ai pas relu le fichier ligne à ligne) |
| Relevé du 13 novembre (`cnc-config-20261113.txt`, hors dépôt, ligne 35) | Le **seul** rapport d'état de la carte que j'aie trouvé : `<Alarm\|MPos:0.000,0.000,0.000,0.000\|FS:0,0>`. Il porte `MPos:` (quatre axes) et `FS:`. Il est arrivé **collé au milieu d'une ligne de `$$`** : `$110=4000.000<Alarm\|MPos:…\|FS:0,0>`. | Observé sur la carte, une fois, en alarme |
| Journaux d'endurance du 10 novembre | Aucun rapport d'état. | — |
| Étape A7 du protocole (60 rapports au repos), E-E (60 en mouvement), E-G (broche) | Prévues, **aucun relevé dans le dépôt**. | Non fait |

Réponse à la question posée : **non, rien ne montre que la carte omet `MPos:` ou `FS:` dans certains rapports**, et le code amont dit qu'elle ne le fait pas. Ce n'est pas une preuve pour le binaire du fabricant, qui s'écarte du code amont sur sept points connus (`FIRMWARE.md` § 0.3).

**Ce que le relevé du 13 novembre montre quand même.** Les sorties de la carte peuvent se mêler sur la liaison : un rapport entier s'est glissé entre le texte d'un réglage et sa fin de ligne. Rejoué au parseur : cette ligne est lue comme le réglage `$110`, de valeur `4000.000<Alarm|MPos:…>` ; **le rapport est perdu**, pas déformé. Cela va avec l'envoi du rapport en un seul bloc : il se glisse entre deux écritures, il n'est pas coupé. Un rapport **coupé** par un autre texte reste donc théorique.

**Ce que le parseur fait d'un rapport abîmé** (prouvé, ligne par ligne) :

| Ligne reçue après un rapport complet | Lu comme | Position gardée par CNCjs |
|---|---|---|
| `<Idle\|FS:0,0>` | rapport d'état, sans position | l'ancienne |
| `<Idle>` ; `<Idle\|WCO:0.000,0.000,0.000>` | idem | l'ancienne |
| `<Idle\|MP>` ; `<Idle\|MPos:\|FS:0,0>` (champ `MPos` abîmé) | idem | l'ancienne |
| `<Idle\|MPos:1.000,2.000,\|FS:0,0>` ; `<Idle\|MPos:10.000,20.000\|FS:0,0>` (deux axes) | rapport avec une position incomplète | X et Y nouveaux, **Z vidé** (alors `positionOf` rend « inconnu » et tout s'arrête) |
| `<Idle\|MPos:1.000,2.000,3.000,0.000\|FS:0,0` (sans `>`) | pas un rapport | l'ancienne, et `r.seen` n'est pas rafraîchi |

Un rapport sans position peut donc venir d'un parasite, mais il faut que les chevrons survivent et que le champ `MPos` soit touché : un rapport de temps en temps, pas dix secondes de suite.

## 3. Ce qui est prouvé par reproduction

Banc (hors de l'arbre, dossier temporaire, non commité) : le vrai `GrblRunner`, toute ligne de la « carte » passée à `runner.parse` ; le vrai `createService` (`job-service.js`, `motion.js`) ; un faux côté série qui note ce qui est écrit ; le décalage pièce tenu pour prouvé (`__tests__/support/proven-offset.js`) ; les réglages du banc de F1 (`cnc-frame.test.js`, `$23=0`, course 400 × 400 × 80), **pas ceux de la LUNYEE** ; programme `box.nc` du même banc. Douze cas, tous passés.

| # | Lignes de la carte | Résultat |
|---|---|---|
| 1a | `<Idle\|MPos:-100.000,-100.000,-4.000\|FS:0,0\|WCO:-105.000,-105.000,-12.000>` puis `<Idle\|FS:0,0>` | Le second événement n'a pas de `mpos` ; l'état garde MPos (−100 ; −100 ; −4) et WPos (5 ; 5 ; 8). |
| 1b | Prise d'origine vue, position explicite à Z −4, puis **10 s** de `<Idle\|FS:0,0>` toutes les 50 ms et un `[GC:…]` toutes les 500 ms. Le banc tient la position « réelle » à Z −70. | `motion.canJog` reste **vrai** ; un pas X+ de 10 mm est accepté : `$J=G91 G21 X10 F600` écrit. |
| 1c | Même état, puis chargement de `box.nc`, « Cadrer à vide… », confirmation. | Plan **sans ligne Z** (`safeZ.rise` 0 : Z cru à −4, au-dessus de la hauteur sûre −5). `M5` écrit ; après son `ok` et six rapports sans coordonnées : **`$J=G90 G21 X10 Y20 F600` écrit**. Aucune position n'a été rapportée depuis plus de 10 s. |
| 1d | Départ à Z −60 sur des rapports complets ; après l'`ok` de `M5`, plus que des rapports sans coordonnées. | La ligne Z part (`$J=G91 G21 Z55 F300`). À son retour au repos : arrêt `ETOUCH_FRAME_POSITION` (Z attendu −5, « rapporté » −60), `0x85`. **Faux arrêt, sens prudent.** |
| 1e | Rapport à deux axes | `mpos` = `{x, y}`, Z vidé. |
| 1f | La ligne mêlée du relevé du 13 novembre | Lue comme un réglage ; aucun événement de rapport. |
| 1g | Sept rapports abîmés | Table du § 2. |
| 2a | `<Idle\|MPos:…\|FS:0,0>`, `<Idle\|MPos:…>`, `[GC:G0 G54 G17 G21 G90 G94 M3 M9 T0 F0 S1000]`, `<Idle\|MPos:…>` | `status.spindle` = 0 ; modal `M3`, `S` 1000. |
| 2b | Cadrage lancé sur des rapports **sans `FS:`** après un premier `FS:0,0` ; après l'`ok` de notre `M5`, `[GC:… M3 … S1000]` (un autre client relance la broche). | **La ligne Z part** ; la séquence continue (phase `raise`). |
| 2c | *Témoin.* Même suite, mais les rapports portent `FS:0,1000`. | Arrêt `ETOUCH_FRAME_STATE` (`spindle`), `0x85`, aucune ligne de déplacement. Le garde marche quand la vitesse est rapportée. |
| 2d | Rapports **complets** `FS:0,0` ; après l'`ok` de `M5`, `[GC:… M3 … S0]`. | **La ligne Z part.** Aucun champ manquant n'est nécessaire. |
| 2e | Au repos, rapports sans `FS:` après un `FS:0,0`, puis `[GC:… M3 … S1000]`. | « Cadrer à vide… » se prépare ; un pas de **100 mm** est accepté (`$J=G91 G21 X100 F600`), alors que la règle « broche en marche : 0,1 mm au plus » devrait le refuser. |

Ce que ces cas **ne prouvent pas** : qu'une carte réelle produise ces lignes (sauf 2d, dont les rapports sont ordinaires) ; l'effet physique ; le comportement avec les réglages de la LUNYEE (`$23=3`, enveloppe apprise) et avec la vraie preuve D2 (`work-offset.js`), qui lit elle-même les rapports et pourrait refuser plus tôt.

## 4. Fonction par fonction

| Fonction installée | Défaut de position | Défaut de broche | Degré |
|---|---|---|---|
| **Cadrer à vide (F1)** | **Exposé.** Au plan : Z ancien « haut » → pas de montée. Avant chaque ligne X/Y : hauteur sûre lue dans l'état fusionné (`motion.js:1074-1079`). Arrivée de `M5` validée sur la position gardée. Les cibles X/Y sont absolues en position pièce : elles ne dépendent pas de la position crue. **Borne** : après la première ligne X/Y, l'arrivée (gardée ≠ cible) arrête ; donc une ligne latérale au plus, 60 s au plus, à hauteur non constatée. | **Exposé** (`:1005`) : pendant et entre les lignes. | Prouvé (1c, 1d, 2b, 2d) |
| **Cadrage laser** | Lit la position au plan (`ETOUCH_LASER_FRAME_POSITION`) dans l'état fusionné ; n'a pas de comparaison d'arrivée du tout (limite connue, `SURETE.md`). Cibles absolues. | `spindleStill` au départ : même masque ; en laser, c'est l'émission qui est en jeu, les lignes de cadrage étant sans `S`. | Lu |
| **Flèches, un pas** (`motion.js:488-532`) | **Exposé** : la course restante est calculée de la position gardée (`:496-517`). Un pas de 100 mm au plus part d'une position fausse. Garde restant : les limites logicielles de la carte (`$20=1` → `error:15`, rien ne bouge). **`$20` a été relevé à 0 le 13 et le 16 novembre** : alors le garde restant est le fin de course (`$21=1` → `ALARM:1`). Un pas en Z− descend d'autant. | **Exposé** : la limite de 0,1 mm broche en marche (`:491`) tombe. | Prouvé (1b, 2e) |
| **Flèches, continu** (`:742-805`) | **Exposé** : la distance envoyée est « jusqu'au bord », calculée de la position gardée (`:762-766`) ; elle peut dépasser la course réelle. Mêmes gardes restants. Le relâchement et le maintien de 250 ms arrêtent toujours. | **Exposé** : le continu est refusé broche en marche (`:743`) ; le refus tombe. | Lu |
| **Zéro Z à la plaque** (`plate-probe.js`) | Course disponible calculée de Z machine gardé (`:197-208`) ; cible `G38.2 Z<z0 − recherche>` en position pièce, `z0` lu dans l'état fusionné (`:300`, `:397`). Z réel plus haut que cru : descente plus longue que « recherche » (arrêtée par le contact si la pince est en place). Z réel plus bas : la cible est au-dessus, la carte monte et finit en échec de palpage. | **Exposé** (`:132`) ; un `$G` frais est exigé (`:133`), mais il n'est lu que pour G90/G21, pas pour `M3` quand la vitesse vaut 0. | Lu, non rejoué |
| **Palpage au bloc** (`block-probe.js`) | Course et positions par l'état fusionné (`:403-406`, `:444`, `:484`, `:524`, `:800`, `:811`, `:1030`). | Par `spindleStill`. | Lu, non rejoué |
| **Zéro ici** (`G10 L20`) | Non exposé pour l'essentiel : la carte pose le zéro là où **elle** est, pas là où CNCjs le croit. | — | Lu |
| **Départ d'un programme** | Le contrôle de course ne dépend pas de la position courante pour les cibles absolues ; l'estimation de durée écarte déjà une position ancienne (`job-service.js:691`). | `spindleStill` au départ (`:1003`) : un programme démarre sa broche lui-même ; effet faible. | Lu |
| **Pause et dégagement (F2)** | **Corrigé** dans sa branche après le même constat (`F2-CORRECTIONS.md` § 8 et suivants) : preuves sur rapports positionnels, vitesse du dernier rapport seulement. Branche `feat/F2`, absente de cet arbre : non relu ici. | Corrigé de même. | D'après le document |

**Pourquoi les suites ne l'ont pas vu.** Les bancs de F1 n'emploient pas le parseur : `cnc-frame.test.js:168` fait `runner.emit('status')` sans contenu et écrit la position directement dans `state.status` (`c.at`, `:80-83`). Le simulateur écrit `MPos:` (ou `WPos:`) et `FS:` dans chaque rapport (`grbl-simulator.js:2047-2072`). Aucun test ne peut produire un rapport sans position.

## 5. Suites réelles plausibles, et gravité

| Suite | Peut-elle arriver sur la LUNYEE ? | Effet avec le code installé | Gravité réaliste |
|---|---|---|---|
| A. Rapports durablement sans `MPos:` (plusieurs secondes), machine déplacée entre-temps sans que le serveur le voie | **Rien ne l'indique.** Demande un firmware qui cesse d'écrire la position tout en répondant à `?`. Contraire au code amont et au seul rapport relevé. | Pas, continu, cadrage et palpages calculés d'une position fausse ; pour le cadrage, une ligne latérale à hauteur non constatée. | Conséquence sérieuse (bride, étau, pièce haute) ; probabilité très faible ; **théorique**. |
| B. Un rapport abîmé de temps en temps (champ `MPos` touché, chevrons intacts) | Possible sur une liaison USB parasitée (broche, variateur) ; non observé. | La position gardée a un rapport de retard (un quart de seconde environ). En fin de ligne, la position gardée peut être celle d'avant l'arrêt : **arrêt à tort** `ETOUCH_FRAME_POSITION`, et la preuve du zéro pièce invalidée à tort. Pas de mouvement à tort identifié. | Gêne ; pas un danger. |
| C. `M3` avec `S0`, ou `M3` seul après un redémarrage de la carte, par un autre client (CNCjs classique, macro, Wi-Fi de la carte) | **Oui**, avec des rapports ordinaires (`FS:…,0`). | Le serveur dit « broche arrêtée » : cadrage, grands pas, continu, plaque acceptés avec une broche **commandée**. Le cadrage envoie `M5` d'abord ; un `M3` reçu après n'est pas vu s'il est à `S0`. | Dépend de la machine : avec un variateur, une commande de marche à consigne nulle peut laisser l'arbre immobile ou le faire tourner à sa fréquence minimale. **Non connu ici.** Moyenne ; probabilité faible. Pour la plaque : une pince de sonde sur une fraise qui tournerait lentement. |
| D. `FS:` absent de certains rapports après un `FS:…,0` | **Rien ne l'indique** ; dans le code amont `FS:` est tout ou rien. | Tout `M3 S…` ultérieur est masqué. | Sérieuse si elle arrivait ; **théorique**. |
| E. `FS:` présent mais qui ne suit pas la broche réelle sur ce binaire (resterait à 0 broche en marche) | **Inconnu** : aucun relevé de `FS:` broche en marche dans le dépôt (essai E-G non fait ; `PROTOCOLE-ESSAI-CNC-V2.md:144` prévoit justement ce cas : « l'écran ne voit pas la vitesse »). | Tous les gardes de broche seraient aveugles en permanence. | Sérieuse si c'était le cas ; **à lever par un relevé**, pas par du code. |

**Ce qui borne déjà le pire.** Pour le cadrage : la carte doit être à `$20=1` (sinon refus), les cibles sont dans la course contrôlée, une seule ligne peut partir avant la comparaison d'arrivée, Arrêter et l'arrêt physique restent. Pour les flèches : le maintien, le relâchement, les limites de la carte. Aucun de ces gardes ne voit la hauteur réelle de la fraise.

**Conclusion.** Exposé en droit, non en fait connu. Je ne vois pas de raison d'interdire le cadrage à vide en attendant, à deux conditions qui ne coûtent rien : lire les rapports réels (§ 6, C-D) et garder la règle déjà écrite au protocole (opérateur devant la machine, table dégagée pour un premier cadrage).

## 6. Corrections proposées (non codées)

Même principe que les règles P1 à P4 et S1 à S4 de `N4-CONCEPTION.md` § 5.4, qui y sont limitées à la variante `park` (décision D-N4-9).

| # | Correction | Où | Effet attendu sur la LUNYEE | Risque |
|---|---|---|---|---|
| C-A | **Position portée par le rapport.** Le service note le numéro et l'heure du dernier rapport qui porte lui-même X, Y, Z (il date déjà `r.xyzAt`). Les gardes de mouvement demandent que le **dernier** rapport soit de ceux-là et ait moins de 2,5 s ; une arrivée n'est validée que sur deux rapports positionnels postérieurs à l'`ok`. | `job-service.js` (`r.status`, ajout) ; `motion.js` : `jogReady` ou `atRest` (flèches, cadrages), `settle` ou ses appelants, `cncStop`, `holdReason`, `arrivalOff` ; `plate-probe.js`, `block-probe.js` (leurs propres attentes de repos, `:277`). | Aucun si chaque rapport porte `MPos:` ; sinon refus et arrêts supplémentaires. | Touche `settle`, partagé : c'est l'endroit où une correction large a déjà coûté un arrêt automatique (F1, troisième tour). À faire fonction par fonction, cadrage d'abord, avec `manual-jog-banner.test.js` en témoin. |
| C-B | **Broche jugée sur des informations datées.** Refus si un `$G` récent dit `M3` / `M4`, **quelle que soit** la vitesse rapportée ; vitesse lue seulement dans un rapport qui porte `FS:` ; une vitesse > 0 ou un `M3` vus pendant une séquence la marquent. | `job-service.js:920-941` (`spindleStill`) ou une fonction voisine plus stricte employée par les mouvements ; `:1474`. | Refus nouveau dans l'état « `M3` commandé, vitesse 0 ». **À vérifier avant** : le mode laser (`M4` dynamique au repos rapporte une vitesse 0 : le cadrage laser et les zéros ne doivent pas être refusés à tort), la pause `M6` (broche arrêtée par l'opérateur, modal resté `M3` : zéro Z à la plaque en pause). | Faux refus dans ces deux cas si la règle est posée sans distinction : c'est pourquoi N4 ne modifie pas `spindleStill`. |
| C-C | **Bancs par le vrai parseur.** Un banc commun où les rapports sont des lignes de texte passées à `runner.parse`, avec les suites du § 3 comme tests. | `src/server/services/touch/__tests__/` | — | Aucun. |
| C-D | **Relevé, sans commande nouvelle.** À l'étape A7 (60 rapports au repos) et à E-E (60 en mouvement), compter aussi les rapports sans `MPos:` et sans `FS:`, et les lignes mêlées. À E-G, noter la valeur de `FS:` broche en marche, et ce que fait la broche sur `M3 S0`. | `PROTOCOLE-ESSAI.md` | Tranche A, D et E du § 5. | Aucun : lecture seule, sauf E-G qui est déjà un essai moteur prévu. |
| C-E | Option, plus tard : faire émettre au simulateur, sur demande d'un test, des rapports sans position ou sans `FS:`. | `grbl-simulator.js` | — | — |

Ordre proposé : C-D et C-C d'abord (aucun risque), puis C-A pour le cadrage à vide, puis C-B après l'examen des deux cas de faux refus, puis les flèches et les palpages.

## 7. Ce qui n'est pas vérifié

- **Rien sur la machine.** Aucun rapport de la carte n'a été lu cette nuit.
- La version installée sur la Surface : je raisonne sur `0acd1c3b`.
- Le code amont : lu par l'intermédiaire d'un résumé automatique de `Report.cpp`, pour le commit que cite `FIRMWARE.md` ; le binaire du fabricant n'est pas ce code.
- Les reproductions n'emploient ni les réglages de la LUNYEE ni la vraie preuve D2.
- Les palpages, le continu et le cadrage laser : lus, non rejoués.
- Le comportement physique de la broche sur `M3 S0` (câblage du variateur, `$31`).
- Que la carte refuse un `M3` reçu pendant un `Jog` (règle de Grbl 1.1 : `error:9`) : non relu dans le code amont, non essayé ; s'il est accepté, la fenêtre du défaut de broche couvre aussi la durée des lignes.
- La cadence réelle des rapports (CNCjs interroge la carte par `?` ; période non relue ici) : le « quart de seconde » de la suite B est un ordre de grandeur.
- La branche `feat/F2` : sa correction est citée d'après `F2-CORRECTIONS.md`, non relue.
