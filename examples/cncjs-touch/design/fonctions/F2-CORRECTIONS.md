# F2 — Pause et dégager : corrections après la relecture de sûreté

Rédigé le 17 novembre 2026. Relecture traitée : Astra, diff `db584555..5414f726`, verdict « à ne pas installer en l'état » (huit dangers, deux points « à corriger »). Arbre `cncjs-wt/F2`, branche `feat/F2`. Aucun accès à la tablette, à la RT ni à la CNC ; rien n'est poussé.

Méthode, pour chaque constat : vérifié dans le code ; test écrit d'abord, qui joue la fenêtre exacte et **échoue** sur le code relu ; correction ; test vert ; suites complètes vertes. Règle appliquée en cas de doute : le comportement qui refuse ou qui arrête.

Commits (dans l'ordre) :

| Commit | Contenu |
|---|---|
| `ccafd641` | Serveur : constats 1 à 8 ; tests D1 à D9 de `pause-retract.test.js` ; nouveau `pause-retract-socket.test.js`. |
| `f4a52524` | Simulateur (options `interpreterPosition`, `recordBlocks`) et parcours LUNYEE refait (constat 10). |
| `a562b009` | Test de page refait (constat 9) ; `SURETE.md` ; `PROTOCOLE-ESSAI.md` (F2.6). |
| `d86d1a44` | Complément du constat 1 : la veille d'annulation dure jusqu'à la fin prouvée du déplacement (test D1b). |

Après chaque commit : `node examples/cncjs-touch/verify-project.cjs` → 225/225 ; `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false` → 55 suites, 1616 tests verts au dernier commit (1596 avant les corrections) ; ESLint propre sur les fichiers serveur et tests touchés.

« T/ » = `src/server/services/touch/__tests__/`.

## 1. Danger — Arrêter après un échec réinitialise un jog encore en mouvement, ou abandonne son arrêt

**Verdict : tient.** `toFailed()` effaçait `s.out` ; `halt()` ne reconnaissait un jog qu'avec `s.out` ou en phase `lifting`/`returning`. En phase `failed`, broche en marche : `haltPlan` rendait `reset` → `0x18` immédiat pendant `Jog`. Broche arrêtée : plan vide, aucun octet, et `r.retract = null` coupait aussi les répétitions de `0x85` de `secure()`.

**Test (échouait) :** `T/pause-retract.test.js` « D1 » (broche en marche et arrêtée) : Pause pendant la montée, rapport `Jog` qui dure, puis Arrêter. Avant : `0x18` en premier octet (broche en marche), aucun octet (broche arrêtée). Après : `!` d'abord, `0x85` répété tant que `Jog`, `0x18` seulement après un rapport `Idle`.

**Correction :** indicateur `jogLive` posé à l'écriture d'un `$J=`, levé seulement par deux rapports au repos après son `ok` (ou après l'annulation), jamais par `toFailed`/`toHeld` ; `halt()` rend `jog` dans toute phase si `jogLive`, une ligne `$J=` en vol ou un rapport `Jog` ; `s/halt.js` répète l'annulation (`jogCancel`) toutes les 400 ms tant qu'un rapport plus récent dit `Jog`, la réinitialisation restant au repos (ou au délai existant de 5 s). Complément (`d86d1a44`, test « D1b », échouait) : sans broche à arrêter, la veille de `secure()` dure jusqu'à la fin prouvée du jog, sinon un Arrêter ultérieur faisait retenue et réinitialisation pour rien ; une fois la fin prouvée, Arrêter n'écrit rien et la machine garde sa référence.

## 2. Danger — un déplacement relatif part d'une position qui a changé depuis son calcul

**Verdict : tient.** Après l'attente du flux, `ensure()` vérifiait `Idle` mais ni le point de départ ni la cible.

**Test (échouait) :** « D2 » : rotation du flux pendant `G4 P3`, la machine rapportée à Z −30 pendant l'absence, flux revenu. Avant : `$J=G91 G21 Z-108.4 F600` écrit (cible −138,4). Après : aucun `$J=`, `failed` `ETOUCH_RETRACT_MOVED` (Z).

**Correction :** `before()` dans `send()`, à l'instant de l'écriture : position du dernier rapport (avec coordonnées, récent) = point d'où la ligne a été calculée, à 0,01 mm ; pour un `$J=`, cible = départ + distance écrite (au millième) et dans la course Z utilisable relue à cet instant (`travelOf`). `ETOUCH_RETRACT_MOVED` mène toujours à `failed` (jamais `held`).

## 3. Danger — les derniers millimètres partent avec une broche rapportée arrêtée

**Verdict : tient.** La broche n'était contrôlée qu'après `G4`, puis dans la comparaison finale.

**Tests (échouaient) :** « D3 » : après la descente rapide, `FS:…,0` puis `$G … M5`. Avant : `$J=G91 G21 Z-5 F100` écrit. Après : non écrit, `failed` `ETOUCH_RETRACT_SPINDLE`. « D3b » : `FS:…,0` pendant la descente rapide. Après : `0x85` aussitôt, pas de descente lente.

**Correction :** `spindleRunning()` (vitesse du **dernier** rapport > 0, ou à défaut un `$G` reçu après l'`ok` du `M3/M4` qui dit M3/M4 ; aucun `$G` reçu depuis ne dit autre chose), exigé avant d'écrire chaque descente et à chaque contrôle pendant qu'elle dure.

## 4. Danger — un zéro pièce modifié devient la référence « inchangée »

**Verdict : tient** (et présent dans la conception). `mem.wco` adoptait sans comparaison le premier `WCO:` reçu après le repos.

**Test (échouait) :** « D4 » : G54 changé en Z (−115 → −105) entre le repos et le premier rapport portant `WCO:`. Avant : reprise acceptée, `M3` écrit. Après : `failed` `ETOUCH_RETRACT_ZERO_CHANGED`, reprise refusée, rien d'écrit.

**Correction :** la référence est le dernier `WCO:` explicite reçu **jusqu'au** repos (celui en vigueur à l'arrêt, lignes vidées comprises) ; chaque `WCO:` reçu après le repos lui est comparé (0,0025 mm) ; une différence annule la reprise sur place (`invalid`) sans couper une montée (elle finit, puis `failed`), et arrête une descente. Sans référence : pas de reprise sur place. Un programme qui change lui-même son repère juste avant le repos est refusé de même (refus sûr, noté dans la conception § 17).

## 5. Danger — une alarme vue dans un rapport d'état est oubliée avant la reprise

**Verdict : tient.** Un rapport `<Alarm|…>` invalidait `homed` mais F2 ne le voyait qu'à sa veille (1 s fraise en haut).

**Test (échouait) :** « D5 » : fraise en haut, un rapport `Alarm` puis `Idle`, sans `ALARM:n`, puis « Reprendre… ». Avant : reprise acceptée. Après : `failed` `ETOUCH_RETRACT_ALARM`, refus, rien d'écrit.

**Correction :** `report()` arrête F2 dans l'événement même dès un état `Alarm` ; la reprise (`resumeChecks`) et chaque ligne (`ensure`) exigent `homed` et aucune référence perdue.

## 6. Danger — une annulation de jog Socket.IO peut être suivie d'une nouvelle descente

**Verdict : tient.** `jogCancel` et `0x85` passaient comme commandes sûres sans prévenir F2.

**Tests (échouaient) :** `T/pause-retract-socket.test.js` « D6 », par la vraie façade `index.js` (`refuseSocket`, comme `CNCEngine`), puis le vrai `GrblController` : `jogCancel` (commande) et `0x85` (écriture) pendant `G4 P3` de la reprise → avant : la descente partait ; après : `failed` `ETOUCH_RETRACT_FOREIGN`, aucun `$J=`, seul `M5` au repos. Même chose pendant la montée. Preuve que ces trois tests échouent sans la correction : relancés avec `index.js` du commit relu → 3 échecs.

**Correction :** `socketJogCancelling()` dans `index.js` appelle `service.socketJogCancel(port)` → `retract.socketJogCancel()` avant que la commande passe : montée ou descente arrêtée ; pendant l'attente du repos, montée abandonnée (`held`).

## 7. Danger — la reprise finale relance le programme sans flux actif

**Verdict : tient.** L'envoi final de `gcode:resume` contournait l'attente du flux ; la grâce de 3 s laissait partir `~`.

**Tests (échouaient) :** « D7 » (depuis `parked`) : rotation du flux juste avant la comparaison finale → avant : `~` écrit ; après : rien tant que le flux est absent, `~` une fois revenu. « D7b » (depuis `held`) : rotation pendant l'attente du `WCO:` → même résultat.

**Correction :** attente d'un flux ouvert de l'appareil avant R6, puis contrôle synchrone du flux, `ensure()` et comparaison complète refaits à cet instant.

## 8. Danger — des rapports sans coordonnées « rafraîchissent » une ancienne position

**Verdict : tient.** Le parseur garde les anciens XYZ ; F2 les datait du nouveau rapport.

**Tests (échouaient) :** « D8 » : lignes finies, trois `<Idle|FS:0,1000>` puis `$G` → avant : montée calculée depuis l'ancienne position ; après : rien, puis, avec deux rapports explicites à Z −110, `$J=G91 G21 Z105 F600` (calculée depuis la vraie position). « D8b » : après la montée, rapports sans coordonnées → aucun `M5` tant que deux rapports explicites n'ont pas prouvé la position.

**Correction :** `job-service` transmet à `retract.report()` ce que porte ce rapport (`explicitXyz`, vitesse `FS:`) ; preuve du repos, séries `Idle` et `atPosition()` n'utilisent que des rapports avec coordonnées, le dernier devant en porter et être récent ; vitesse de broche du dernier rapport seulement.

## 9. À corriger — tests non probants

**Verdict : tient.**
- 12c rouvrait un flux avec A. Refait : « D9 » — pendant la grâce, seuls des flux de B sont ouverts (son `tB` et un second) : aucune ligne, puis `held` `ETOUCH_RETRACT_STREAM`. Il passait déjà sur le code relu (la propriété tenait, le test ne la prouvait pas) ; preuve qu'il est discriminant : avec `streamOpen` modifié pour accepter n'importe quel appareil, il échoue. Commentaire trompeur de 12c corrigé.
- Socket.IO : `T/pause-retract-socket.test.js` traverse l'entrée réelle (refus de `gcode:resume`, `cyclestart`, `~`, `gcode`, `writeln` dans chaque phase, `?` libre, `!` qui arrête la montée) en plus des tests D6.
- Page : `test-pause-retract.cjs` perd vraiment son flux (`stream.onerror()`) sous une confirmation ouverte : dialogue annulé, bouton d'effet et bouton de l'encart sans aucun POST (`prepare` ou `retract`), Pause et Arrêter partent. Remarque honnête : la propriété repose sur trois gardes indépendantes de la page (annulation de la confirmation au renouvellement du flux, `refuseLostFlow` dans `prepare`, liste de `run()`) ; deux mutants qui retiraient une ou deux d'entre elles laissaient le test vert, les autres suffisant. Le test prouve le comportement observable, pas l'utilité de chaque garde isolée.

## 10. À corriger — le parcours LUNYEE ne démontre pas la trajectoire de reprise

**Verdict : tient.** Le simulateur repartait de la position machine quand son tampon était vide ; le test ne comparait que les lignes et la position finale ; son commentaire annonçait une vérification avant le premier arc non faite.

**Correction et tests (`f4a52524`) :** options du simulateur, désactivées par défaut (suites existantes inchangées) : `interpreterPosition` (position de l'interpréteur distincte, comme `gc_state.position` en amont : lignes et `$J=` planifiés depuis elle et la fixant ; synchronisée par annulation de jog, réinitialisation, alarme, palpage, prise d'origine) et `recordBlocks` (chaque bloc planifié : type, début, fin, centre). `T/pause-retract-lunyee.test.js` 25-26 vérifie maintenant le point de reprise (machine **et** interpréteur au point d'arrêt quand `~` part, broche M3 S1000), le début du premier bloc après `~`, et **tous** les blocs du fichier contre le témoin sans pause. Trois témoins de désynchronisation : interpréteur décalé de 1 mm fraise en haut → F2 s'arrête (`ETOUCH_RETRACT_POSITION`), pas de `~` ; descente plus courte de 0,005 mm (sous la tolérance de F2) → visible au point de reprise et dans le bloc suivant ; interpréteur décalé au départ de `~` → bloc suivant différent du témoin. La qualification du binaire réel reste un essai séparé : `PROTOCOLE-ESSAI.md` F2.6, étape 20.

## Remarque d'Astra — portée des preuves

Retenue. Les preuves restent celles d'un vrai contrôleur CNCjs et du simulateur : octets et décisions, pas l'effet physique. Vitesse réelle de broche (`FS:` n'est pas un compte-tours), maintien mécanique de Z moteurs relâchés, comportement du binaire du fabricant (`$J=` et position d'interpréteur) : non vérifiés, à l'essai (`PROTOCOLE-ESSAI.md` F2.2 à F2.6).

## Documents mis à jour

- `design/fonctions/F2-CONCEPTION.md` § 17 « Écarts et corrections après relecture » (fichier non suivi du dépôt principal, modifié sur place).
- `design/refonte/SURETE.md` (arbre `F2`) : lignes F2 rectifiées, paragraphe des corrections, limite de la tolérance de 0,01 mm.
- `design/refonte/PROTOCOLE-ESSAI.md` (arbre `F2`) : F2.6, étapes 17 à 20.

## Ce qui n'est pas vérifié

- Aucun essai matériel ; rien sur la tablette, la RT ni la CNC.
- Le harnais navigateur (`browser-run.cjs --strict`) n'a pas été relancé : le code de la page n'a pas changé dans ces corrections (seul son test).
- Une désynchronisation inférieure à 0,01 mm n'est pas vue par F2 sur la carte (seulement par le témoin du simulateur) : essai 20.
- Un client branché sur le Wi-Fi de la carte est joué par le test (rapports et `$G`), pas par un vrai client.
- `grbl-simulator/grbl-simulator.js` a des erreurs ESLint antérieures (lignes non touchées, hors du périmètre `yarn eslint`) ; les ajouts n'en introduisent pas.
- Le délai de 5 s de l'arrêt existant (`HALT_MS`) reste la limite après laquelle la réinitialisation part même si la carte dit encore `Jog` : choix conservé (arrêter), non mesuré sur la carte.

## Conclusion

Les huit dangers sont levés, chacun prouvé par un test qui échouait sur le code relu et passe maintenant ; les deux points « à corriger » sont refaits. Le lot reste à relire (Astra, puis Fable) avant les essais matériels encadrés du protocole.

---

# Second tour (seconde relecture d'Astra, `d86d1a44`)

Rédigé le 17 novembre 2026. Relecture traitée : Astra, seconde relecture à `d86d1a44`, verdict « à ne pas installer ». Dangers restants : la surveillance de jog abandonnée par l'arrêt PC, la réinitialisation possible pendant `Jog`, la descente avec une broche arrêtée ou de sens incompatible, un zéro pièce modifié accepté comme référence. « À corriger » : D1b, l'alarme avant la première écriture, le refus définitif sur un rapport sans XYZ, l'intitulé « every phase ». Arbre `cncjs-wt/F2`, branche `feat/F2`. Aucun accès à la tablette, à la RT ni à la CNC ; rien n'est poussé.

Méthode : les fenêtres ne sont plus fermées une par une. Pour chaque famille, j'ai dressé la liste complète des entrées **depuis le code**, puis fermé la famille par un point de passage unique. Pour chaque fenêtre, le test a été écrit d'abord et a échoué sur le code relu (vérifié en rejouant les tests sur le code précédent), puis la correction est venue. En cas de doute : refuser ou arrêter.

| Commit | Contenu |
|---|---|
| `1bed05a7` | Famille A : toute voie d'arrêt ou d'annulation (un point dans `index.js`, `drop()` dans `pause-retract.js`, suite du dégagement). |
| `4888afc7` | Famille B : toute écriture (`write()`), alarme et redémarrage définitifs. |
| `53013bb6` | Famille E : la broche relancée, une règle unique de preuve et de perte. |
| `bdedb5de` | Familles C et D : la référence du zéro pièce, les contrôles refaits frais, le rapport sans XYZ. |
| `2b8053aa` | `SURETE.md`, `PROTOCOLE-ESSAI.md` (F2.7, étapes 21 à 23), intitulé du test D9. |
| `cce717ce` | Famille E resserrée : une fois la broche vue tournante, tout `$G` d'un autre sens la perd (2-D3e). |

Après chaque commit : `node examples/cncjs-touch/verify-project.cjs` → 225/225. `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false` → 55 suites vertes, avec successivement 1640, 1643, 1647, 1651, 1651 puis **1652 tests** au dernier commit (1616 avant ce tour). ESLint propre sur `src/server/services/touch/`, tests compris.

Tests ajoutés (préfixe « 2- ») :
- `T/pause-retract.test.js` : 2-D1b, 2-D1c, 2-D1d, 2-D2, 2-D3a à 2-D3e, 2-D4 (deux variantes), 2-D4b, 2-D5 (deux variantes), 2-D8.
- `T/pause-retract-socket.test.js` : 2-D1 (une ligne par entrée de `SAFE_COMMANDS`/`SAFE_WRITES`, plus les trois demandes d'état, `gcode:stop` et `gcode:load` pendant la montée, arrêt pendant la temporisation) et 2-D9.

Le test Socket.IO prend désormais l'horloge des minuteries factices (`Date.now`) : sans elle, la répétition de l'annulation n'était pas observable.

## Famille A — toute voie d'arrêt ou d'annulation, de n'importe quel client

**Entrées relevées dans le code.**
- `index.js` `refuseSocket` laisse passer, quel que soit le dégagement, tout ce que `control.js` déclare sûr. `SAFE_COMMANDS` = `pause`, `gcode:pause`, `stop`, `gcode:stop`, `feedhold`, `reset`, `feeder:stop`, `jogCancel`, `statusreport`, `autolevel:stop`, `autolevel:getProbeState`. `SAFE_WRITES` = `?`, `!`, `0x18`, `0x84`, `0x85` et leurs mélanges. Avant ce tour, seuls `socketStopping` (sept commandes, `!`, `0x18`) et `jogCancel`/`0x85` prévenaient F2 : **`autolevel:stop` (réinitialisation) et `0x84` (porte) passaient sans rien arrêter** (tests 2-D1 qui échouaient).
- Événements de CNCjs vus par `job-service.js` :
  - `workflow 'stop'` (`r.stopped`) : `gcode:stop`, `gcode:load`, `gcode:unload`, `reset`, ouverture du port ;
  - `workflow 'start'` (`r.run`) ;
  - `sender 'load'/'unload'` (`r.file`), y compris le chargement par l'API HTTP `api.gcode.js`, **qui ne passe par aucun refus**.

  Tous menaient à `forgetJob()`, qui effaçait le dégagement **et sa surveillance** (constat 1 d'Astra).
- Dans `pause-retract.js`, huit endroits remettaient `r.retract` à `null` : `supervise` (vidange, workflow sorti de la pause), `drain` (`Hold`/`Door`), `pause` (vidange), `halt`, `socketStop` (vidange), la reprise réussie, `forgetJob`, `forget`.
- Tablette : Pause, Arrêter, Arrêt broche, arrêt de flèche, prise de main, fermeture du flux.
- Carte : rapport `Alarm`, `ALARM:n`, bannière.

**Points de passage uniques.**
- **`index.js`.** Tout ce qui passe, sauf une simple demande d'état (`?`, `statusreport`, `autolevel:getProbeState`), appelle `service.socketStop(port, how)`. `how` vaut `'cancel'` pour une annulation de déplacement seule et `'stop'` pour tout le reste, y compris une commande sûre qu'on ajouterait plus tard. `socketJogCancel` disparaît. Les palpages et la transaction D2 ne s'arrêtent que sur `'stop'`, comme avant pour `jogCancel` ; `0x84` et `autolevel:stop` les arrêtent désormais aussi (sens qui arrête).
- **`pause-retract.js` `drop()`.** C'est le seul endroit où un dégagement est oublié ; Arrêter et la disparition du contrôleur font exception et annulent explicitement. Si un déplacement de F2 peut encore bouger, ou si l'arrêt de broche d'un mouvement interrompu est dû, le dégagement survit comme **suite** (`r.retractTail`). `secure()` répète alors `0x85` tant qu'un rapport plus récent dit `Jog`. Il écrit ensuite `M5` au repos, quel que soit l'état du workflow : il faut deux rapports `Idle` avec coordonnées, rien en attente dans CNCjs et aucun programme en marche.
  - Pendant la suite, les commandes du PC qui agissent sont refusées, et « Pause et dégager » aussi.
  - Arrêter reprend la suite : retenue, annulation répétée, réinitialisation par `halt.js`.
  - Quand seul l'arrêt de broche est dû, Arrêter n'est plus refusé (« Aucun travail à arrêter ») : la carte est réinitialisée si la broche tourne.
- **`report()`.** Il suit la fin d'un déplacement annulé **sans limite de temps**. Il faut que la ligne `$J=` ait reçu sa réponse (son suivi des réponses est gardé jusque-là), puis deux rapports au repos avec coordonnées, reçus après son `ok` et après l'annulation. C'est le constat « D1b » : plus de retenue ni de réinitialisation inutiles après 5 s.

**Délai de 5 s de `halt.js` (Arrêter).** La réinitialisation part au repos, ou au délai de 5 s même si la carte dit encore `Jog`. **C'est un choix assumé, que je n'ai pas modifié.** Après 5 s de `Jog` malgré la retenue et l'annulation répétée, la réinitialisation est l'arrêt le plus fort dont dispose le logiciel : arrêter prime sur garder la référence (prise d'origine à refaire). Le test 2-D1c le fixe : aucune réinitialisation avant 5 s, la réinitialisation entre 5,0 et 5,5 s, `0x85` répété. Ce choix est écrit dans `SURETE.md` et à l'étape 17 du protocole.

**Tests qui échouaient avant la correction :**
- 2-D1 `autolevel:stop` et `0x84` ;
- 2-D1 `gcode:stop` du PC pendant la montée : une seule annulation, aucune répétition sur 30 rapports `Jog`, pas de `M5` ;
- 2-D1 `gcode:load` pendant la montée ;
- 2-D1 arrêt du PC pendant la temporisation : pas de `M5` ;
- 2-D1b : `Jog` pendant 6,5 s puis repos, Arrêter écrivait `!` puis `0x18` ;
- 2-D1d : Arrêter après un arrêt PC pendant la temporisation répondait « Aucun travail à arrêter » et laissait la broche en marche.

2-D9 passait déjà ; il comble une lacune de couverture (refus en `parked`, `returning`, `held`, `failed`).

## Famille B — toute écriture, et l'alarme ou la bannière définitives

**Entrées relevées :** les sept `c.command` de `pause-retract.js`. Ce sont l'annulation (deux fois) et le `M5` de `secure`, la ligne de `send`, `gcode:resume`, le `feedhold` de Pause et l'annulation de `forget`.

**Point unique :** `write()`/`unwritable()`.
- Rien dans une autre session de la carte ni sur un port fermé.
- Aucune ligne ni reprise après une alarme (état `Alarm`, prise d'origine perdue, référence perdue).
- Les annulations et retenues partent toujours.
- `send` et `~` vérifient `unwritable` avant de toucher à l'état.

**Constat 5.** `fail()` rendait `held` une alarme ou un redémarrage arrivés pendant `lifting`, avant la première écriture (attente du flux). La phase devient désormais `failed`, définitivement.

**Tests :**
- 2-D5 (échouait) : `Alarm` ou bannière pendant que la montée attend le flux, puis nouvelle prise d'origine aux mêmes valeurs. « Reprendre… » était accepté avant ; il est refusé maintenant.
- 2-D2 (bannière pendant la suite d'une montée arrêtée : aucune écriture dans la nouvelle session) passait déjà avec la famille A.

## Famille E — l'état de la broche à chaque descente

**Entrées :** l'écriture de l'approche et de la plongée, chaque contrôle pendant l'une et l'autre, la fin de la temporisation, la vérification finale, `~`.

**Règle unique** (`spindleLost`/`spindleRunning`) :
- **Preuve.** Après l'`ok` de notre `M3/M4`, la broche est prouvée tournante quand un rapport a donné une vitesse > 0 et qu'un `$G` a donné le sens attendu. Le dernier `$G` frais doit le dire encore.
- **Perte définitive.** Une fois une vitesse > 0 vue, un rapport à 0 ou un `$G` d'un autre sens perd la broche définitivement, dans l'événement même (`report()`, `modal()`). Une descente en cours est annulée aussitôt. Ni un rapport sans `FS:`, ni une broche qui retourne ensuite ne la rendent.
- **Avant toute vitesse > 0**, un 0 veut seulement dire « pas encore prouvée ». Un `ok` pris trop tôt pour le nôtre ne doit pas faire échouer une reprise saine (cas vu avec le simulateur). Si la vitesse est encore à 0 à la fin de la temporisation, la reprise échoue.
- **Où la règle s'applique :** `ensure()` avant chaque écriture, avant et pendant chaque descente, et avant `~`. Depuis `held`, une broche du programme rapportée à 0 refuse `~`.

**Tests qui échouaient avant la correction :**
- 2-D3a : `FS:0`, puis des rapports avec XYZ sans `FS` ;
- 2-D3b : `M4` au lieu de `M3`, vitesse > 0 ;
- 2-D3c : `FS:0` une fois pendant la temporisation, puis 1000 ;
- 2-D3d : `FS:0` après la plongée, `$G` inchangé, et `~` partait ;
- 2-D3e : `$G M4` puis `M3` de nouveau.

Effet sur les tests existants : la descente exige maintenant un `$G` reçu après l'`ok` du `M3`. Les tests 5, 7b, 10d, D2, D3, D3b et D7 jouent ce `$G` ; CNCjs l'interroge en effet toutes les 500 ms environ, en pause aussi. Le parcours LUNYEE (simulateur, vraie interrogation de CNCjs) passe sans modification.

## Famille D — toute référence mémorisée qui peut avoir changé

**Inventaire :** la position au repos, l'état modal (T, F, S compris), le sens et la vitesse de broche, le zéro pièce, la course Z et la hauteur de dégagement, la main et l'appareil, la révision et le nombre de lignes envoyées, la session de la carte, la référence machine. Toutes étaient comparées à l'instant ou relues, sauf le **zéro pièce** : sa référence était prise **après** l'arrêt, au deuxième rapport `Idle` (constat 4).

**Correction.** La référence est le dernier `WCO:` explicite reçu **avant** la demande. Chaque `WCO:` reçu depuis lui est comparé, à 0,0025 mm : pendant la vidange, entre les deux rapports du repos, fraise en haut, pendant la descente. Une différence interdit la reprise sur place ; la montée en cours finit, puis la phase passe à `failed`. Un programme qui change lui-même son repère dans les lignes vidées est donc refusé (refus sûr).

**Test (échouait) :** 2-D4, G54 changé entre les deux `Idle`, puis pendant que la machine finit ses lignes en `Run`.

## Famille C — tout contrôle fait une fois puis réutilisé

**Inventaire :**
- la préparation puis le lancement (déjà refaits) ;
- la course (relue avant chaque `$J=`) ;
- la position (avant chaque écriture et à `~`) ;
- le flux, la main, l'alarme, l'état vidé (à chaque `ensure`) ;
- l'état modal (un `$G` après la dernière ligne) ;
- la broche (famille E) ;
- **le zéro pièce : à `~`, le `WCO:` pouvait dater d'avant la descente.**

**Correction.** `~` exige un `WCO:` reçu après l'`ok` de la dernière ligne de F2 (depuis `held` : après la demande), attendu 5 s au plus, ainsi que le `$G` reçu après la dernière ligne. Un changement déjà visible arrête aussitôt.

**Test (échouait) :** 2-D4b, G54 changé pendant la descente et pas encore rapporté : `~` partait sur le `$G`.

**Faux refus (constat 8).** Un rapport sans coordonnées juste avant une écriture donnait `ETOUCH_RETRACT_MOVED (XYZ)`, et ce refus était définitif. Désormais, un rapport sans XYZ ne compte plus comme un déplacement. Chaque écriture et chaque contrôle qui a besoin d'une position attend (`settled`) un rapport qui en porte, 2,5 s au plus après que le reste est prêt. Au-delà, le code est `ETOUCH_RETRACT_STALE`, temporaire à la préparation.

**Test (échouait) :** 2-D8, rapport sans XYZ au retour du flux après la temporisation : la descente part au rapport suivant.

## Ce qui n'est pas vérifié, et les nouvelles attentes

- **Pas d'essai matériel :** rien n'a été fait sur la tablette, la RT ni la CNC. Le harnais navigateur n'a pas été relancé, car le code de la page n'a pas changé.
- **Conception non mise à jour :** `F2-CONCEPTION.md` est hors du périmètre d'écriture de ce tour, et son § 17 ne décrit pas ce second tour. `SURETE.md` et ce compte rendu font foi.
- **Nouvelles attentes, dans le sens qui refuse :**
  - la reprise depuis `held` attend un `WCO:` reçu après la demande (jusqu'à ~2,5 s de plus au repos sur un Grbl amont, refus après 5 s) ;
  - `~` attend un `WCO:` reçu après la dernière ligne ;
  - la descente attend un `$G` reçu après le `M3`.

  La fréquence réelle des `WCO:` du binaire LUNYEE au repos n'est pas connue (étape 23 du protocole).
- **Limite d'observation, que le logiciel ne peut pas fermer.** Un zéro pièce changé par un client branché sur la carte n'est vu qu'au premier rapport qui porte `WCO:`. Si ce client consomme le signal de changement de la carte (compteur commun, à vérifier sur le binaire, étape 21), la fenêtre va jusqu'au rafraîchissement suivant. Exiger à `~` un `WCO:` reçu après la dernière ligne réduit cette fenêtre sans la supprimer.
- **Ligne `$J=` sans réponse :** une telle ligne de F2 reste tenue pour un déplacement possible. La suite (annulation répétée, PC en attente) dure alors jusqu'à Arrêter.
- **Fraise en haut (`parked`) :** une annulation venue du PC ne change rien, puisque rien de F2 ne bouge. Un arrêt y met fin à la reprise sur place, comme au premier tour.

## Conclusion

Les quatre dangers restants sont fermés par famille. Pour chacun, des tests qui échouaient sur `d86d1a44` passent maintenant. Les trois « à corriger » et l'intitulé du test sont traités. Le délai de 5 s d'Arrêter est explicitement présenté comme un choix d'arrêt. Le lot reste à relire (Astra, puis Fable) avant les essais matériels encadrés (F2.1 à F2.7).

---

# Troisième tour (troisième relecture d'Astra, `cce717ce`)

Rédigé le 17 novembre 2026. Relecture traitée : Astra, troisième relecture à `cce717ce`, verdict « à ne pas installer ». Quatre dangers restants :
1. l'arrêt tablette contourne la procédure F2 après un arrêt PC ;
2. un nouveau jog tablette est autorisé pendant la surveillance résiduelle ;
3. la reprise depuis `held` part malgré un arrêt de broche observé ;
4. la plongée est autorisée avec une consigne de broche incompatible.

« À corriger » : la variante de 2-D4b (`WCO:` reçu au début du dernier `Jog`), l'intitulé de D1.

Arbre `cncjs-wt/F2`, branche `feat/F2`. Aucun accès à la tablette, à la RT ni à la CNC ; rien n'est poussé.

## Méthode

Cette fois, **la table d'abord** : j'ai écrit pour le lot entier la table des états de la séquence et des événements possibles, avec une seule réaction par case. Le code a ensuite été confronté case par case à cette table, par un test par case (`T/pause-retract.test.js`, bloc « the state table (third review) », 182 cases).

Pour les quatre dangers, un test qui joue la fenêtre exacte d'Astra a été écrit d'abord ; il échouait sur `cce717ce`, puis la correction est venue. La table elle-même a été rejouée sur le code de `cce717ce` : **30 cases échouent**. Elles couvrent les quatre dangers : la ligne `T0` en entier, `T × stop`, et les colonnes `spindle`, `setpoint` et `ov` des états `P`, `H`, `Rv`, `RS`, `RJ` et `RF`.

En cas de doute, j'ai choisi de refuser. Trois cas sont **simplifiés en refus** plutôt que gérés (voir « Simplifications »).

| Commit | Contenu |
|---|---|
| `102930fc` | Dangers 1 et 2 : Arrêter confie F2 à sa procédure avant tout raccourci ; rien ne bouge pendant la suite (`available()`, D2, commandes système). Tests 3-D1, 3-D2 (`T/pause-retract-socket.test.js`). |
| `fe95489c` | Dangers 3 et 4 : la broche tant qu'elle n'est pas celle de F2, la consigne (`S`, correction `Ov:`), les corrections de la tablette refusées, le `WCO:` après la dernière descente. Tests 3-D3 à 3-D4e (`T/pause-retract.test.js`). |
| `3837799c` | La table d'états (182 cases) ; intitulé de D1. |
| `f393aa5b` | `SURETE.md` (troisième tour), `PROTOCOLE-ESSAI.md` (F2.8, étapes 24 à 26). |

Après chaque commit :
- `node examples/cncjs-touch/verify-project.cjs` → 225/225 ;
- `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false` → 55 suites vertes, avec successivement 1654, 1665, puis **1848 tests** (1652 avant ce tour) ;
- ESLint propre sur `src/server/services/touch/`, tests compris.

## La table d'états

### États

| État | Ce qui est vrai |
|---|---|
| `D` | `draining` : l'envoi est retenu, la machine finit ses lignes ; la montée est voulue. |
| `L0` | `lifting` : repos prouvé, état mémorisé, **rien de F2 écrit** (la montée attend le flux ou une position). |
| `LJ` | `lifting` : le `$J=` de montée est écrit et acquitté, la carte dit `Jog`. |
| `LM` | `lifting` : montée finie, `M5` écrit, sans réponse. |
| `P` | `parked` : fraise en haut, broche arrêtée et prouvée arrêtée. |
| `H` | `held` : repos prouvé, rien de F2 n'a bougé, fraise dans la pièce, broche du programme. |
| `Rv` | `returning` depuis `held` : « Reprendre… » accepté, attente du `WCO:`, rien d'écrit. |
| `RS` | `returning` depuis `parked` : `M3 S…` acquitté, broche prouvée, `G4 P3` en cours. |
| `RJ` | `returning` : descente rapide écrite, acquittée, la carte dit `Jog`. |
| `RF` | `returning` : descentes finies, attente du `$G` et du `WCO:` de la vérification finale avant `~`. |
| `F` | `failed`, son `$J=` encore en mouvement (annulation perdue ou décélération). |
| `T0`, `T` | Suite (`r.retractTail`) : dégagement abandonné par un arrêt du PC pendant la montée. `T0` : la carte n'a pas encore rapporté le `Jog`. `T` : elle dit `Jog`. |

### Événements

| Événement | Ce qui est joué |
|---|---|
| `stop` | Arrêter sur la tablette. |
| `pcStop` | `gcode:stop` du PC, par `socketStop` puis le vrai contrôleur. |
| `cancel` | Annulation de déplacement du PC (`0x85`). |
| `pause` | Pause sur la tablette. |
| `banner` | La carte redémarre. |
| `alarm` | Un rapport `Alarm`. |
| `stream` | Le flux de l'appareil est fermé pour de bon ; pour `L0`, la grâce s'écoule. |
| `lease` | La main est reprise par l'appareil B. |
| `spindle` | Un `FS:` contraire à ce que doit être la broche. |
| `setpoint` | Un `$G … S1` : un autre client a réglé `S`. |
| `ov` | `Ov:100,100,50` : la correction de broche est changée. |
| `zero` | Un `WCO:` différent. |
| `stale` | Plus aucun rapport pendant 3 s. |
| `act` | Un pas de flèche de la tablette. |

Le délai d'une ligne (`TIMEOUT`) et la vidange bloquée (`STALLED`) ont leurs tests propres, 17 et 2.

### Phase juste après l'événement

Lettres : `n` = plus de dégagement publié (oublié ou passé en suite) ; `d` = `draining` ; `l` = `lifting` ; `p` = `parked` ; `h` = `held` ; `r` = `returning` ; `f` = `failed`.

| | stop | pcStop | cancel | pause | banner | alarm | stream | lease | spindle | setpoint | ov | zero | stale | act |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `D` | n | n | d¹ | n | f | f | d¹ | d¹ | d | d | d | d² | d¹ | d |
| `L0` | n | n | h | h | f | f | h | h | l³ | l³ | l³ | l² | h | l |
| `LJ` | n | n | f | f | f | f | f | f | l³ | l³ | l³ | l² | f | l |
| `LM` | n | n | f | f | f | f | f | f | l³ | l³ | l³ | l² | f | l |
| `P` | n | n | p | p | f | f | p | f | f | f | f | f | p | p |
| `H` | n | n | h | h | f | f | h | h | f | f | f | f | h | h |
| `Rv` | n | n | f | f | f | f | f | f | f | f | f | f | f | r |
| `RS` | n | n | f | f | f | f | f | f | f | f | f | f | f | r |
| `RJ` | n | n | f | f | f | f | f | f | f | f | f | f | f | r |
| `RF` | n | n | f | f | f | f | f | f | f | f | f | f | f | r |
| `F` | n | n | f | f | f | f | f | f | f | f | f | f | f | f |
| `T0` | n | n | n | n | n | n | n | n | n | n | n | n | n | n |
| `T` | n | n | n | n | n | n | n | n | n | n | n | n | n | n |

Notes de la table :
1. La montée est abandonnée ; au repos, la phase devient `held`.
2. La reprise sur place est invalidée : la montée finit, puis la phase devient `failed`.
3. La montée continue (la broche est arrêtée de toute façon). Ce qui a été vu compte si la séquence finit en `held` (`toHeld`) ou en `parked` (`S` ou `Ov:` d'un autre client).

### Ce qui est écrit, pour toute case

Ces règles sont uniques et valent pour toute la table ; le test les vérifie dans chaque case, la carte répondant 4 s après l'événement.
- **I1.** Après tout événement, rien de F2 ne descend ni ne redémarre (aucun `$J=…Z-`, `M3/M4`, `G4`, `~`) et aucune ligne du fichier ne part. Seule exception : une reprise que l'événement laisse continuer (`returning × act`).
- **I2.** Jamais de réinitialisation pendant que la carte dit `Jog`. Le délai de 5 s d'Arrêter reste le choix assumé du second tour (test 2-D1c).
- **I3.** Tant qu'un déplacement de F2 peut bouger (`LJ`, `RJ`, `F`, `T0`, `T`) :
  - aucun déplacement de la tablette n'est accepté ;
  - Arrêter retient d'abord (`!`), puis répète `0x85` tant que la carte dit `Jog`, et réinitialise au repos.
- **I4.** Un pas de flèche de la tablette est refusé dans tous les états.

Les réactions qui n'apparaissent pas dans la phase, écrites une seule fois :
- **Arrêter** : `retract.halt()` d'abord, quel que soit l'état. Il rend `jog` (retenue, annulations, réinitialisation au repos), `line` (retenue si rien d'autre), `spindle` (réinitialisation si la broche tourne) ou rien. S'il ne rend rien, c'est l'Arrêter existant.
- **Fin d'un mouvement de F2 interrompu** (`f` depuis `LJ`, `LM`, `RS`, `RJ`, `RF`) : `0x85` répété tant que la carte dit `Jog`, puis `M5` au repos.
- **Suite** : les commandes du PC qui agissent et tout ce qui bouge sur la tablette sont refusés jusqu'à la fin prouvée. Arrêter, Pause et l'arrêt broche restent libres.

### Ce que la confrontation a trouvé

- **`T × stop`** (danger 1) : le raccourci « travail au repos + `Jog` → annulation seule » de `stop` passait avant `retract.halt()`.
- **Ligne `T0`** (danger 2) : la carte disait encore `Idle`, et `available()`, `motion.atRest()` et `notJogging()` ignoraient la suite. La flèche, le lancement du fichier, l'origine, la plaque, les corrections et D2 étaient acceptés.
- **Colonnes `spindle`, `setpoint`, `ov` en `P`, `H` et `Rv`** (danger 3) : rien n'était mémorisé hors de la broche relancée par F2.
- **Colonnes `setpoint` et `ov` en `RS`, `RJ` et `RF`** (danger 4) : la consigne `S` et la correction de broche n'étaient pas comparées avant la plongée.

Les 152 autres cases donnaient déjà la réponse de la table.

## Les quatre dangers

### 1. Arrêter sur la tablette contourne F2 après un arrêt du PC

**Verdict : tient.**

**Test (échouait) :** `T/pause-retract-socket.test.js` « 3-D1 ». Le scénario passe par la vraie façade, le vrai contrôleur et son écouteur d'arrêt : montée écrite et acquittée, `Jog`, `gcode:stop` du PC, puis Arrêter sur la tablette.
- Avant : « Déplacement annulé. », sans `!` ni réinitialisation.
- Après : « Arrêt demandé… », `!` en premier octet, `0x85` répété pendant 2 s de `Jog`, aucune réinitialisation, puis `0x18` une fois la carte au repos.

**Correction :** dans `stop`, `retract.halt()` est appelé avant les raccourcis « jog du service » et « `Jog` au repos ». Ces deux raccourcis ne s'appliquent plus quand F2 a rendu un plan.

### 2. Un jog de la tablette accepté pendant la suite

**Verdict : tient.** Au-delà de la flèche, le lancement du fichier arrêté était accepté aussi.

**Test (échouait) :** « 3-D2 » (même entrée). Il joue trois moments : avant le premier `Jog`, pendant le `Jog`, puis après un seul rapport `Idle`. À chacun :
- `canJog` est faux, avec la raison de la suite ;
- la flèche, `prepare` de `start`, `set-origin`, `zeroZ`, `home`, `unlock` et `spindle`, la correction de broche et `verifyOffset` sont refusés ;
- rien n'est écrit, hormis `0x85`.

Après le second `Idle` (fin prouvée, `M5`), la flèche est de nouveau permise : la garde est bien la suite, pas autre chose.

**Correction :**
- `available()` refuse tant que `r.retractTail` existe (`RETRACT_TAIL_BUSY`). C'est la garde commune de tout ce qui bouge ou écrit : flèches, cadrage, origine, plaque, palpage, macros, mise en service, lancement, chargement, corrections, D2, relecture des réglages. Arrêter, Pause et l'arrêt broche n'y passent pas.
- La transaction D2 ne démarre pas d'elle-même (`offsetMode`) tant qu'un dégagement ou sa suite existe.
- Une commande système ne réserve pas la machine pendant la suite.

### 3. Reprise depuis `held` malgré un arrêt de broche observé

**Verdict : tient.**

**Tests (échouaient) :**
- « 3-D3 » : `held`, « Reprendre… », `FS:0`, puis un rapport XYZ + `WCO:` sans `FS:`, puis la broche de nouveau à 1000. Avant : `~` partait. Après : `failed`, `ETOUCH_RETRACT_STATE_CHANGED` (`spindle`), pas de `~`.
- « 3-D3b », en `held` avant la demande, trois variantes : `FS:0` puis 1000 ; `$G M5` puis `M3` ; `$G S1` puis `S1000`. La reprise est refusée et la phase est `failed`.
- « 3-D3c » : `FS:0` dans un des deux rapports du repos lui-même, `$G` `M3 S1000`, montée impossible (course) : `failed`, pas `held`.

**Correction : une règle unique pour la broche tant qu'elle n'est pas celle de F2** (`spindleWant`, `setpointLost`).
- **Ce qu'elle doit être.** Jusqu'à notre `M5` (cas `held`, reprise depuis `held`, montée pas commencée) : celle mémorisée au repos, à compter du premier rapport du repos. Une fois `parked` : arrêtée, à compter du rapport qui suit la preuve.
- **Comparaison.** Chaque `FS:` explicite (`lastZero` et `lastTurn`, numéros de rapport) et chaque `$G` (sens, `S`) lui sont comparés **dès leur arrivée**.
- **Effet d'une différence.** Elle est gardée pour de bon : en `held`, `parked` ou pendant la reprise avant notre `M3`, la reprise sur place est annulée dans l'événement même. Pendant la montée, elle compte si la séquence finit en `held` ou en `parked`.
- **Dernier contrôle.** `resumeChecks` vérifie la même règle avant `~`. Elle remplace l'ancien contrôle, qui ne lisait que le dernier rapport.

### 4. Plongée avec une consigne de broche incompatible

**Verdict : tient.** La correction de broche (`Ov:`) relève de la même famille.

**Tests (échouaient) :**
- « 3-D4 » : `S1` réglé par un client pendant que la plongée attend le flux (`$G M3 S1`, `FS:0,1`). Avant : `$J=G91 G21 Z-5 F100` partait. Après : aucune plongée, `failed`, `ETOUCH_RETRACT_SPINDLE`.
- « 3-D4b » : `$G S1` pendant la descente rapide. `0x85` part dans l'événement même.
- « 3-D4c » : `Ov:100,100,50` pendant la descente rapide (`0x85` aussitôt), puis pendant l'attente de la plongée. Aucune plongée.
- « 3-D4e » : une correction depuis la tablette (broche, avance, rapides) est refusée en `draining`, `parked` et pendant la reprise. Ce test échouait sans la garde.

**Correction :**
- **Consigne `S`.** La broche relancée par F2 est prouvée et perdue sur sa consigne `S` aussi, pas seulement sur son sens. `spindleRunning` l'exige avant chaque descente et à chaque contrôle pendant qu'elle dure. Après la preuve, un `$G` d'une autre `S` la perd **définitivement** (`modal()`), dans l'événement même.
- **Correction de broche.** Elle est mémorisée au repos (`mem.ov` ; 100 si aucune n'était connue, la valeur de Grbl au démarrage). Chaque `Ov:` reçu depuis doit lui être égal, sinon la reprise sur place est perdue définitivement : descente annulée, ou reprise invalidée.
- **Corrections de la tablette.** Elles sont refusées tant qu'un dégagement existe (`RETRACT_OVERRIDE_BUSY`). Celles du PC l'étaient déjà (`socketRefusal`).

## « À corriger »

- **2-D4b.** Variante ajoutée : « 3-D4d », un `WCO:` dans le rapport `Jog` de la plongée seulement. Avant : `~` partait sur ce `WCO:`. Désormais, la borne est le dernier rapport avant la série `Idle` qui a prouvé la fin de la ligne : `~` attend un `WCO:` reçu dans cette série ou après.
- **Intitulé de D1.** Il dit maintenant « la réinitialisation au repos (ou au délai de 5 s de `halt.js`, 2-D1c) ».

## Simplifications (des refus plutôt que des cas gérés)

1. Pendant la suite, **tout** ce qui bouge ou écrit est refusé depuis la tablette, au lieu de distinguer les actions. Seuls Arrêter, Pause et l'arrêt broche restent libres.
2. Les corrections (avance, rapides, broche) sont refusées pendant **tout** dégagement, y compris pendant la vidange. Qui veut ralentir pendant la vidange touche Pause.
3. Une broche du programme vue arrêtée ou changée (sens, `S`, correction) une seule fois depuis le repos rend la reprise sur place impossible, **même si elle est relancée ensuite**. Il en va de même fraise en haut si un autre client la démarre. La seule sortie est alors Arrêter, puis « Reprendre à une ligne ».

## Ce qui n'est pas vérifié

- **Aucun essai matériel.** Les preuves sont celles du vrai contrôleur CNCjs et d'une carte jouée par le test (et du simulateur pour le parcours LUNYEE) : des octets et des décisions, pas l'effet physique.
- **`Ov:` sur le binaire LUNYEE.** Je ne sais pas si la carte l'envoie ni à quelle fréquence (étape 25 du protocole). Si aucune correction n'était connue au repos, la règle suppose 100 %. Une carte réglée autrement avant la pause, qui l'annoncerait pendant, est refusée : refus sûr, mais possible faux refus.
- **Le champ `A:`** (sens de broche rapporté par la carte) n'est pas employé : son existence sur ce binaire n'est pas connue, et un `A:` absent serait lu comme « broche arrêtée ».
- **Limite d'observation.** Une broche arrêtée par un client branché sur la carte entre le dernier rapport (250 ms) et `~` n'est pas vue : la règle porte sur ce qui a été rapporté.
- **Pause sur la tablette pendant la suite.** Elle reste refusée (« Aucun travail en cours. »), puisque la suite annule déjà le déplacement ; le bouton Arrêter est offert.
- **Le délai de 5 s d'Arrêter** (réinitialisation même si la carte dit encore `Jog`) reste le choix assumé du second tour.
- **Harnais navigateur.** Il n'est pas relancé : le code de la page n'a pas changé. `verify-project.cjs` est vert.
- **Conception.** `F2-CONCEPTION.md` n'est pas mise à jour : elle est hors de mon périmètre d'écriture. La table ci-dessus et `SURETE.md` (arbre `F2`) font foi.

## Conclusion

Les quatre dangers sont levés. Pour chacun, un test qui jouait la fenêtre exacte d'Astra échouait sur `cce717ce` et passe maintenant. Au-delà de ces quatre fenêtres, la table d'états ferme les familles : une réponse et un test par case pour les 182 cases, et 30 cases qui échouaient sur `cce717ce`. Le lot reste à relire (Astra, puis Fable) avant les essais matériels encadrés (F2.1 à F2.8).

# Quatrième tour (quatrième relecture d'Astra, `f393aa5b`)

Rédigé le 17 novembre 2026. Relecture traitée : Astra, quatrième relecture à `f393aa5b`, verdict « à ne pas installer ». Deux dangers restants :
1. Arrêter libère la garde F2 avant la fin de l'arrêt : un nouveau jog est accepté pendant l'arrêt ;
2. un sens de broche contraire, rapporté explicitement dans `A:C`, n'empêche pas la plongée.

Un reproche de méthode : les 182 cases de la table jouent chacune **un** événement isolé ; elles ne prouvent pas les enchaînements (A puis B). Un « à corriger » : `SURETE.md` annonçait plus que la table ne prouvait.

Arbre `cncjs-wt/F2`, branche `feat/F2`. Aucun accès à la tablette, à la RT ni à la CNC ; rien n'est poussé.

## Méthode

Pour chaque danger, le test qui joue la fenêtre exacte d'Astra est écrit d'abord et échoue sur `f393aa5b` ; la correction passe ensuite par le point de passage commun. La table est ensuite étendue aux **paires** d'événements, puis rejouée sur le code de `f393aa5b` pour mesurer ce qu'elle aurait vu.

| Commit | Contenu |
|---|---|
| `fbbdeb71` | Danger 1 : réservation de l'arrêt (`halt.js`, `r.halting`) ; gardes `available()`, `socketRefusal`, commandes système, D2 ; `canStop`. Tests 4-D1, 4-D1b, 4-D1c (`T/pause-retract-socket.test.js`). |
| `91d77dea` | Danger 2 : le champ `A:` du rapport transmis à F2 et comparé dès son arrivée. Tests 4-D2 à 4-D2e (`T/pause-retract.test.js`). |
| `6994b752` | La table : colonne `dir`, lignes A0, AJ, A1 (arrêt en cours), pas de flèche de 0,1 mm ; les 1 950 paires. La réservation vaut pour un dégagement dans toute phase. |
| `4382260c` | `SURETE.md` (portée réelle des tables), `PROTOCOLE-ESSAI.md` (F2.9, étapes 27 et 28). |

Après chaque commit :
- `node examples/cncjs-touch/verify-project.cjs` → 225/225 ;
- `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false` → 55 suites vertes, avec successivement 1851, 1858, puis **3867 tests** (1848 avant ce tour) ;
- ESLint propre sur les fichiers touchés (`halt.js`, `job-service.js`, `pause-retract.js` et les deux fichiers de tests).

## Les deux dangers

### 1. Arrêter libère la garde F2 avant la fin de l'arrêt

**Verdict : tient.**

**Tests (échouaient) :** `T/pause-retract-socket.test.js`, bloc « the stop in progress after Arrêter (fourth review) », vraie façade et vrai contrôleur.
- « 4-D1 » : montée écrite et acquittée, dernier rapport `Idle` (`T0`), arrêt du PC, puis Arrêter sur la tablette, puis aussitôt une flèche X+ de 0,1 mm. Sur `f393aa5b`, la flèche était acceptée et `$J=G91 G21 X0.1 F100` partait, sans nouveau rapport (constaté avant la correction) ; `canStop` était faux. Le test vérifie ensuite trois moments : juste après `!`, pendant le `Jog`, puis une fois la réinitialisation écrite et sa bannière pas encore reçue (la variante « après un premier `Idle` »). À chacun : `canStop` vrai, flèche et lancement refusés (« Arrêt en cours… »), `G0 X1` et `gcode` du PC refusés, rien d'écrit. Un second Arrêter répond « Arrêt en cours » sans nouvel octet. Après la bannière, plus de réservation.
- « 4-D1b » : la même chose sans arrêt du PC (Arrêter pendant la montée, rapport encore `Idle`).
- « 4-D1c » : la réinitialisation écrite, sa bannière jamais reçue. Des rapports `Hold:0` pendant 2 s laissent la réservation ; deux rapports `Idle` reçus plus de 0,5 s après la réinitialisation la lèvent.

**Correction, au point de passage commun.** L'arrêt d'Arrêter (`halt.js`) est le seul endroit où l'arrêt se poursuit après la fin de F2. Quand Arrêter reprend un dégagement ou sa suite, dans **toute phase**, `halt()` pose `r.halting` dès son premier octet. La réservation reste jusqu'à la fin constatée de l'arrêt :
- la bannière, celle de la réinitialisation ou une autre ;
- un rapport `Alarm` ;
- le port perdu ;
- ou, la réinitialisation écrite et sa bannière absente, deux rapports `Idle` reçus plus de 0,5 s après elle.

Les gardes qui la lisent :
- `available()` : la garde commune de tout ce qui bouge ou écrit depuis la tablette (`HALT_BUSY`) ;
- `socketRefusal` : les commandes du PC qui agissent (`SOCKET_HALT_BUSY`) ;
- les commandes système (`moving`) et le démarrage de D2 (`offsetMode`).

`canStop` reste vrai. Un second Arrêter laisse la procédure en cours. Il ne renvoie la réinitialisation qu'une fois celle-ci écrite depuis 0,5 s sans effet constaté, et jamais si la carte dit `Run` ou `Jog`.

**Limité aux arrêts qui reprennent un dégagement.** Appliquée à tous les arrêts, la réservation faisait échouer cinq tests d'autres lots (palpage du bloc, arrêt d'une macro, minuteries de l'arrêt). Les arrêts sans dégagement gardent donc leur comportement antérieur. Voir « Ce qui n'est pas vérifié ».

### 2. Plongée malgré un sens de broche contraire rapporté dans `A:`

**Verdict : tient.**

**Tests (échouaient) :** `T/pause-retract.test.js`, bloc « the spindle direction reported in A: (fourth review) ». Rapports `FS:0,1000|Ov:100,100,100|A:…`, sans nouveau `$G`.
- « 4-D2 » : l'approche finie, ses deux rapports au repos disent `A:C`. Sur `f393aa5b`, `$J=G91 G21 Z-5 F100` partait. Désormais : aucune plongée, `failed`, `ETOUCH_RETRACT_SPINDLE`. La perte est définitive : `A:S` et le bon `$G` ensuite ne rendent rien, pas de `~`.
- « 4-D2b » : `A:C` dans un rapport `Jog` de l'approche : `0x85` dans l'événement même, aucune plongée.
- « 4-D2c » : `A:C` pendant la temporisation, juste après l'`ok` de notre `M3` : aucune descente.
- « 4-D2d » : `held` avec `A:C`, `parked` avec `A:S` ou `A:C` : `failed`, `ETOUCH_RETRACT_STATE_CHANGED` (`spindle`).
- « 4-D2e », témoin du faux refus : `A:S` partout pendant la reprise ; `~` part. Il passe avant et après la correction.

**Correction, au point de passage commun.** Le rapport (`job-service.js`, `r.status`) transmet à `retract.report()` le champ `A:` de **ce** rapport (`accessoryState` du parseur). `S` donne `M3`, `C` donne `M4`, et rien d'autre n'est lu. Dès son arrivée, ce sens est comparé comme un `$G` :
- **broche relancée par F2.** Après l'`ok` de notre `M3/M4`, un autre sens la perd définitivement (`spindleGone`) : une descente en cours est annulée, aucune autre ne part ;
- **broche qui n'est pas celle de F2.** Un autre sens que celui qu'elle doit avoir (`spindleWant` : celui du repos, ou arrêtée une fois en haut) met fin à la reprise sur place (`foreignSpindle`), comme un `$G` contraire.

Un rapport sans `A:`, ou un `A:` sans `S` ni `C`, ne dit rien de la broche. Ce n'est **pas** lu comme une broche arrêtée.

## La table, étendue aux paires

### Ce qui change dans la table à un événement

- **Colonne `dir`** : le rapport du sens contraire (`A:C` ; `A:S` si la broche doit être en `M4`). Phases : `d` en `D`, `l` en `L0`, `LJ`, `LM`, `f` de `P` à `F`, `n` en `T0` et `T`.
- **Lignes « arrêt en cours »** :
  - `A0` : `T0`, puis Arrêter (`!` écrit, rapport encore `Idle`) ;
  - `AJ` : Arrêter pendant la montée, `Jog` rapporté ;
  - `A1` : `A0`, puis la fin du jog (réinitialisation écrite, bannière pas encore reçue).

  Toutes donnent `n`. Avant l'événement, I3 y est vérifié : `canJog` faux, `canStop` vrai.
- **La flèche de la table** passe de 1 mm à **0,1 mm, 100 mm/min**, le pas qu'autorise la tablette broche en marche. À 1 mm, broche en marche, la flèche était refusée pour sa seule taille. La table ne pouvait donc pas voir le danger 1 : `T0 × stop` puis 1 mm était refusé, alors que 0,1 mm partait.

La table compte maintenant 16 états × 15 événements = 240 cases.

### Les paires

Chaque cas part de l'un des 13 états de base, puis joue :
1. l'un des 15 événements ;
2. aussitôt, ou après un rapport de la carte, l'une des cinq suites :
   - `act` : une flèche de la tablette ;
   - `pcAct` : une commande du PC qui agit, par `socketRefusal` ;
   - `stop` : Arrêter ;
   - `pcStop` : l'arrêt du PC ;
   - `resume` : « Reprendre… », après un rapport avec `WCO:` et un `$G`.

Cela fait 13 × 15 × 5 × 2 = **1 950 cas**. La vérité est celle de la carte jouée : un jog qui court encore, et un arrêt d'Arrêter dont la carte n'a pas encore reçu la réinitialisation. Après la seconde suite, la carte répond 4 s, puis :
- **P1** : rien de F2 ne descend ni ne redémarre, et aucune ligne du fichier ne part. Seule exception, une reprise qui tourne : laissée en cours par le premier événement (`returning × act`), ou demandée par la seconde suite depuis `parked` ou `held` ;
- **P2** : jamais de réinitialisation pendant que la carte dit `Jog` ;
- **P3** : la flèche et les commandes du PC qui agissent sont refusées dans trois cas : un jog court sur la carte, un arrêt d'Arrêter n'est pas fini, ou un dégagement existe ;
- **P4** : Arrêter pendant un jog, sans arrêt d'Arrêter avant lui : `!` en premier.

Les paires nommées par Astra en font partie :
- arrêt puis jog : `X × stop` puis `act` ;
- arrêt PC puis arrêt tablette : `X × pcStop` puis `stop` ;
- changement de broche puis reprise : `P/H × spindle|setpoint|ov|dir|zero` puis `resume`.

### Rejouée sur `f393aa5b`

Sur le code relu, la table et les paires montrent **61 échecs** :
- 6 cases de `dir` (`P`, `H`, `Rv`, `RS`, `RJ`, `RF`) ;
- les 30 cases de `A0` et `A1` ;
- 25 paires `X × stop` suivies de `act` ou de `pcAct`, dont `T0 × stop` puis `act`, le danger 1.

S'y ajoutent les 9 tests de fenêtre ci-dessus. Les lignes `AJ` passent sur `f393aa5b` : la carte y disait `Jog`, et ce rapport suffisait à refuser la flèche.

## Ce qui n'est pas vérifié

- **Aucun essai matériel.** Les preuves viennent du vrai contrôleur CNCjs et d'une carte jouée par le test : des octets et des décisions, pas l'effet physique.
- **Suites de trois événements ou plus.** Elles ne sont pas jouées. Les autres actions de l'opérateur (macros, plaque, chargement, mise en service…) passent par la même garde `available()`, déjà testée en 3-D2 ; elles n'ont pas de case dans les paires.
- **`A:` sur le binaire LUNYEE.** On ne sait pas s'il est envoyé, ni à quelle fréquence (étape 28). Sans lui, la protection du danger 2 n'agit pas ; celles du `$G` et de `FS:` restent.
- **Arrêt sans dégagement.** Il n'est pas réservé, comme avant ce tour. Si la carte a encore des lignes et que le dernier rapport dit `Idle` (une temporisation), une flèche acceptée entre `!` et le rapport suivant arriverait sur une carte en `Hold`. Selon le code amont, Grbl refuse un `$J=` hors `Idle`/`Jog`, mais ce n'est pas vérifié sur ce binaire. Cela sort de F2 : à signaler pour le lot qui porte l'arrêt.
- **Levée de la réservation sans bannière.** Deux rapports `Idle` 0,5 s après la réinitialisation suffisent. Si une carte restait en `Idle` sans recevoir la réinitialisation, l'arrêt serait tenu pour fini alors que la machine est au repos, sans lignes de F2 ni du fichier. Choix assumé : ne pas bloquer la tablette pour toujours.
- **Le délai de 5 s d'Arrêter** (réinitialisation même si la carte dit encore `Jog`) reste le choix assumé du second tour (2-D1c).
- **Harnais navigateur.** Il n'est pas relancé : le code de la page n'a pas changé. `verify-project.cjs`, qui joue `test-pause-retract.cjs`, est vert.
- **Conception.** `F2-CONCEPTION.md` n'est pas mise à jour : elle est hors de mon périmètre d'écriture. Ce compte rendu et `SURETE.md` (arbre `F2`) font foi.

## Conclusion

Les deux dangers sont levés. Pour chacun, le test qui joue la fenêtre exacte d'Astra échouait sur `f393aa5b` et passe maintenant. Chaque correction tient en un point de passage commun : la réservation de `halt.js`, lue par les gardes de la tablette, du PC et du système ; le champ `A:` comparé dans `report()`.

La table ne joue plus seulement des événements isolés. Elle compte 240 cases et 1 950 paires, et sur `f393aa5b` elle aurait vu les deux dangers : 61 cas échouaient. `SURETE.md` dit désormais ce qui est prouvé, et ce qui ne l'est pas (triplets, `A:` sur le binaire, arrêt sans dégagement).

Le lot reste à relire (Astra, puis Fable) avant les essais matériels encadrés (F2.1 à F2.9).
