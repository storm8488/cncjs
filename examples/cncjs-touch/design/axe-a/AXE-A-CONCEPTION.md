# Axe rotatif A dans CNCjs Touch : conception

27 novembre 2026. Arbre `cncjs-wt/A`, branche `feat/axe-A` (partie de master `95b773b6`). **Conception seule : aucun code de production, rien d'envoyé à la tablette ni à la carte.** Les chemins sont relatifs à `src/server/services/touch/` (serveur) et à `examples/cncjs-touch/touch/` (page), sauf mention.

## 0. Lecture rapide

1. **La carte rapporte déjà quatre valeurs, sans 4e axe branché.** Relevé du 13 novembre (`surface-pro-sauvegardes/cnc-config-20261113.txt`, hors dépôt) : `<Alarm|MPos:0.000,0.000,0.000,0.000|FS:0,0>`, `[G54:0.000,0.000,0.000,0.000]`, `[PRB:0.000,0.000,0.000,0.000:0]`, `$103=800`, `$113=2000`, `$123=50`, `$133=400`. La question « que se passe-t-il si la carte se met à rapporter 4 valeurs » est donc déjà tranchée par l'usage : Touch reçoit 4 valeurs depuis toujours et jette la quatrième. **Conséquence : la présence d'une 4e valeur ne peut pas servir d'activation.**
2. **Aujourd'hui, un programme avec des mots A est accepté sans un mot** (essai fait cette nuit par les vraies fonctions, § 1.3) : verdict « validated », enveloppe X Y Z juste, A ignoré, durée absente, et la reprise à une ligne **reconstruit un préambule sans A**. C'est le seul défaut présent, il existe sans le 4e axe : lot L0.
3. Activation proposée : réglage serveur `touch.axisA.enabled` (dans `.cncrc`, comme `touch.motion.enabled`, `motion.js:136-142`) **et** 4e valeur présente dans le rapport. Réglage absent : aucun chemin nouveau n'est pris.
4. Cinq lots, chacun installable seul : L0 (dire qu'un programme contient A), L1 voir, L2 zéro, L3 déplacer, L4 programmes.
5. Trois inconnues de la carte commandent la suite, à lever par lecture puis par essai fraise en l'air (§ 2) : les limites logicielles s'appliquent-elles à A (`$133=400`) ; `$H` fait-il tourner A ; le moteur A est-il tenu au repos (`$1=25`).

## 1. Inventaire : où Touch suppose trois axes

### 1.1 Ce qui lit déjà A (rien à changer)

| Endroit | Fait |
|---|---|
| `controllers/Grbl/GrblLineParserResultStatus.js:28` | 1 à 6 nombres par champ ; `:58-63`, `:68-73`, `:78-83` nomment x, y, z, a, b, c pour MPos, WPos, WCO. |
| `controllers/Grbl/GrblLineParserResultParameters.js:18`, `:33` | `[G54:…]`…`[G92:…]` et `[PRB:…]` : x, y, z, a, b, c. |
| `controllers/Grbl/GrblRunner.js:79-92` | WPos (ou MPos) dérivé pour **chaque** axe rapporté, donc pour `a`. |
| Vérifié cette nuit | `<Idle\|MPos:1,2,3,45\|FS:0,0\|WCO:0,0,0,10>` donne `mpos.a="45.000"`, `wpos.a="35.000"`, `wco.a="10.000"` ; `[G54:1,2,3,10]` donne `G54.a="10.000"` ; `$103=800.000` est gardé dans les réglages. |

Piège de nom : le champ `A:` d'un rapport est l'état des accessoires (broche, arrosage, `GrblLineParserResultStatus.js:165`), pas l'axe. `report-proof.js:69` le lit ainsi ; ne rien y changer. Défaut ancien sans rapport, à ne pas toucher : `Lim:` v0.9 lit A sur le bit de Z (`GrblLineParserResultStatus.js:136`).

### 1.2 Serveur Touch : trois axes en dur

| Sujet | Endroit | Aujourd'hui avec 4 valeurs ou un mot A |
|---|---|---|
| Preuve de position C1 | `report-proof.js:21-22` accepte 3 à 6 nombres ; `:26-29` ne garde que x, y, z ; `:120-126` repos sur x, y, z ; `:167-176` `moved` sur x, y, z ; message `:15` « X, Y et Z » | Juste pour X Y Z. **A peut tourner sans que « la machine a bougé » le voie** ; `posOf(r, 'm', 'A')` rend `null` (`:154-158`). |
| Rapport « complet » | `job-service.js:130-133` (`explicitXyz`), `:397` (WCO explicite) | Inchangé par une 4e valeur. |
| Position envoyée à la page | `job-service.js:1675-1687` : x, y, z seulement | **Point unique** : la page ne reçoit jamais A. |
| Réglages envoyés à la page | `job-service.js:54` : `$110-112`, `$120-122`, `$130-132` | `$103/$113/$123/$133` jamais montrés. |
| Fin de prise d'origine | `job-service.js:383-389` : X, Y, Z | A non regardé. |
| Enveloppe, course | `motion.js:36` (`AXES`), `:235-250`, `:259-284` | Pas d'entrée A. |
| Pas et continu | `motion.js:37` (pas en mm), `:491-502` (`jogParams` refuse tout axe hors X Y Z : « Axe, sens ou pas invalide »), `:301-302` (`$110+i`), `:519-539` (course), `:773-776` et `:801-807` (le continu exige une course : sa longueur est la distance au bord) ; `motion-preflight.js:5`, `:132`, `:140` | A refusé par le serveur, proprement. |
| Zéro pièce | `motion.js:177`, `:1452-1463` (« choisissez X, Y et/ou Z »), `:1487-1493`, `:1508` ; `originLine` `:309` | A refusé. `originLine(1, ['A'])` écrirait déjà `G10 L20 P1 A0`. |
| Preuve du décalage D2 | `work-offset.js:30`, `:56`, `:275-276`, `:349`, `:410` | `G54.a`, `G92.a`, `WCO.a` jamais comparés : un zéro A ne serait pas prouvé. |
| Cadrage à vide | `motion.js:1163-1170`, `:1135` | X Y à Z sûr ; A ne bouge pas. |
| Palpages | `plate-probe.js:200`, `:228`, `:506-519` (Z seul, `G10 L20 P0 Z…`) ; `block-probe.js:26`, `:140-141` (lignes permises : mots X Y Z seulement), `:1039-1042` (G92 nul sur x, y, z) | Aucun mot A ne peut sortir. A n'est ni lu ni exigé à 0. |
| Contrôle du programme | `program-check.js:26`, `:86`, `:498` (`axes = AXES.filter(…)`), `:548` (ligne sans X Y Z : ignorée), `:1003` | **Mots A ignorés en silence** (§ 1.3). |
| Durée et analyse N1 | `program-check.js:345` (lettres permises `NGMXYZIJKRPFST`), `:346`, `:385` ; `program-time.js:4` | Un mot A met `timing.supported=false` : pas de durée, pas de faux nombre. |
| Reprise à une ligne | `resume.js:80-83`, `:257`, `:265`, `:318`, `:342`, `:484`, `:567` | **Préambule reconstruit sans A** (§ 1.3). |
| Chargement | `job-load.js:24` (`changesOffset`) | `G10 … A0` et `G92 A0` vus comme changement d'origine : correct. |
| Projets | `projects.js:107`, `:234` (décalage capturé x, y, z) | A non capturé. |

### 1.3 Ce que Touch fait AUJOURD'HUI d'un programme avec A (constaté)

Essai jetable du 27 novembre par `analyzeProgram`, `checkProgram`, `durationOf`, `buildResume` (machine de `program-check.test.js:7-16`, contexte de `program-time.test.js:5-14`) ; fichier d'essai supprimé, non commité.

| Programme | Verdict | Enveloppe | Durée | Signalé à l'opérateur |
|---|---|---|---|---|
| X Y Z seul (témoin) | validated | X 0→10, Z −1→5 | 6,425 s | — |
| même + `G0 X0 Y0 A0`, `G1 X10 A90 F300`, `G1 A360` | **validated** | identique au témoin | `null` | **rien** (`uninterpreted=[]`) |
| `G0 A90`, `G1 A720 F500` seuls | **validated**, `moves=0` | « Axe X/Y/Z non sollicité » | `null` | rien |
| `G93` + `G1 X10 A90 F2` | **validated** | X 10 | `null` | rien |
| `G10 L20 P1 A0` ou `G92 A0` dans le fichier | unknown | — | `null` | « Le programme modifie l'origine » (correct) |

Reprise à la ligne 6 du deuxième programme : préambule `G21 G90`, `G0 Z5`, `G0 X0 Y0`, `M3 S1000`, `G4 P3`, `G1 Z-1 F100`. **Le `A0` de la ligne 3 a disparu** ; la suite (`G1 X10 A90`) part de l'angle où A se trouve. Sur une machine à axe A, c'est une pièce usinée sur la mauvaise face. Position annoncée par la page : X, Y, Z (`job-resume.js:68`).

Donc : ni refus, ni avertissement ; l'enveloppe X Y Z reste juste (A ne la change pas) ; la durée est absente, pas fausse ; le programme part tel quel vers la carte. Sur cette carte (4 axes compilés, rien de branché sur A), les mots A seraient exécutés « dans le vide ». Sur un Grbl à 3 axes, le premier mot A arrêterait le travail en erreur au milieu de la passe.

### 1.4 Page

| Sujet | Endroit | Remarque |
|---|---|---|
| Position | `index.html:39`, `:43` (X Y Z, « mm » en dur) ; `app.js:178`, `:208` ; `job-dashboard.js:264`, `:683` ; `tool-position.js:135` | N'affiche que ce que le serveur donne. |
| Déplacement | `index.html:56-57` (croix X Y, rangée Z) ; `real-motion.js:22` (`FEEDS` en mm/min, `AXES`), `:224`, `:262`, `:508` (« mm », « mm/min ») ; `:83`, `:87` (traductions par motif `[XYZ]`) | Un refus nommant A ne serait pas traduit. |
| Zéro pièce | `index.html:49-52` (`data-axis="x\|y\|z\|xyz"`) ; `real-motion.js:307-328`, `:409` ; `coordinate-plan.js:17` ; `zero-piece.js:60-61` | « Zéro XYZ ici » ne doit jamais inclure A. |
| Contrôle | `check-screen.js:48`, `:102` ; `program-check-view.js:12` ; `job-controls.js:314` ; `seance.js:111` | Trois lignes X Y Z. |
| Estimation et tracé | `motion-estimate.js:31`, `:38`, `:40` (A = mot « autre »), `:106`, `:291`, `:348` : ligne marquée incertaine | Tracé X Y Z à plat ; aucune erreur. |
| Reprise | `job-resume.js:68` | X Y Z. |
| Réglages machine | `machine-limits.js:129` ; `seance.js:165`, `:233` | X Y Z. |
| Journal | `real-history.js:179` | X Y Z. |
| Mise en service | `commissioning.js:39`, `:255-260` (fins de course X Y Z) | A n'a pas de capteur : rien à ajouter. |
| Textes FR/EN/ES | clés françaises dans `i18n-messages*.js`, refus dans `i18n-messages-refus.js` ; messages serveur `report-proof.js:14-18`, `motion.js:494`, `:1460` | Tout texte nouveau : trois langues, et un code de refus (pas un motif). |

### 1.5 Simulateurs

- `grbl-simulator/grbl-simulator.js` : trois axes en dur (`:2039-2047` rapport, `:2117-2122` WCO). Ne sait pas A.
- `examples/cncjs-touch/grbl-sim/` : Grbl 1.1h officiel compilé, trois axes. Ne sait pas A, et ce n'est pas le firmware de la carte.

## 2. Avant de coder : ce qu'il faut lire, puis essayer

### 2.1 Lecture seule (machine au repos, moteur A branché, aucun mouvement)

À envoyer dans cet ordre, réponses à ranger dans `design/axe-a/` (texte brut).

| Commande | Ce qu'on lit | Ce que la réponse décide |
|---|---|---|
| `?` (10 fois, à 1 s) | Nombre de valeurs de `MPos:` ; présence de `FS:` ; un `WCO:` à 4 valeurs | 4 valeurs : L1 possible tel que conçu. 3 valeurs : la carte a changé depuis le 13 novembre, tout s'arrête ici. |
| `$$` | `$103`, `$113`, `$123`, `$133` ; `$20`, `$22`, `$23`, `$1`, `$13` | `$103` : pas par degré, à calculer par l'opérateur (question Q1) ; tant qu'il vaut 800, **les degrés affichés sont faux**. `$113` : plafond de vitesse du jog A. `$20=1` avec `$133=400` : A probablement borné à 400° d'un côté du zéro machine (essai M4). `$23` bit 3 : de quel côté. `$1=25` : moteurs relâchés 25 ms après l'arrêt, donc A libre au repos (essai M2). `$13=1` : refuser d'activer A (pouces). |
| `$I` | `[VER:…]`, `[OPT:…]` | Même binaire que le 13 novembre (`1.1f.20231030`, `PHSW`) ? Sinon reprendre `FIRMWARE.md`. |
| `$#` | 4 valeurs par ligne, valeur A de G54…G59, G92, G28, G30, PRB | Confirme que `G10 L20 … A0` aura où s'écrire ; un G92 A non nul est à annuler avant tout. |
| `$G` | `G21`, `G90`, `G94`, repère | `G93` actif au repos : anomalie, ne rien lancer. |
| `$+` (ou `$S`), cité dans `FIRMWARE.md` E-0, **jamais lancé** | Réglages étendus : cycles de prise d'origine, `Home/Mpos` de A, course de A | Si la liste nomme les axes de chaque cycle, on sait sans mouvement si `$H` touche A. Si la commande est refusée (`error:`), rien n'est perdu. |

### 2.2 Essais avec mouvement, par l'opérateur, fraise en l'air

Broche arrêtée, rien dans le mandrin du 4e axe pour M1 à M5, Z en haut, main sur l'arrêt d'urgence. Depuis la console CNCjs du PC (Touch refuse A). Une ligne à la fois, noter la réponse et dix rapports `?`.

| N° | Geste | On regarde | Décide |
|---|---|---|---|
| M1 | `$J=G91 G21 A10 F200` | `ok` ou `error:` ; la 4e valeur passe de 0 à 10 ; état `Jog` puis `Idle` ; l'axe tourne-t-il de 10° (repère au feutre) | `$J` avec A accepté ; échelle `$103`. |
| M2 | Au repos, essayer de tourner le mandrin à la main | Tenu ou libre | Libre : avertissement permanent en L3/L4 et question Q4 (`$1`). |
| M3 | `$J=G91 G21 A360 F2000`, puis `0x85` au milieu | Arrêt net, `Idle`, position rapportée = position réelle | L'annulation du continu vaut pour A. |
| M4 | Après `$H` et `$20=1` tel que réglé : `$J=G91 G21 A500 F2000`, puis `A-500` | `error:15` (limite) ou mouvement entier ; à quelle valeur | **Si A est borné : L3 et L4 changent** (une course pour A, ou une décision de l'opérateur sur `$133`, Q3). |
| M5 | `$H`, la main sur l'arrêt | A tourne-t-il ; `ALARM:9` ; durée ; valeur A de MPos après | Si `$H` fait tourner A sans capteur : **rien n'est installable** avant correction du réglage de la carte. Si A garde sa valeur : noter que MPos A survit à `$H`. |
| M6 | `G10 L20 P1 A0`, puis `?` ×10, `$#` | 4e valeur de `WCO:` = MPos A ; `G54` A dans `$#` ; MPos A inchangé | L2. |
| M7 | `G92 A0` puis `G92.1` | Effet sur WCO | Simple constat : Touch n'enverra pas G92. |
| M8 | `G1 A90 F360` puis `G1 X10 A180 F360`, chronométrés | 15 s pour le premier ? durée du second | Règle de vitesse de L4 (§ 3, L4). |
| M9 | `G38.2 Z-1 F50` avec A ≠ 0, pince en contact à la main | `[PRB:…]` porte la 4e valeur | Palpage avec A ≠ 0 non perturbé. |
| M10 | Mettre une pièce d'essai, `G0 A720` | Câbles, tuyaux, bridage | Rien ne s'enroule. |

## 3. Conception par lots

Règle commune : `axisA = config.get('touch.axisA.enabled') === true` **et** le dernier rapport positionnel porte au moins 4 nombres. Faux : aucun des chemins ci-dessous n'est pris. A n'entre **jamais** dans `AXES` (`motion.js:36`, `program-check.js:26`, `work-offset.js:30`) : ces listes commandent l'enveloppe, la course et les verdicts X Y Z ; A reçoit ses propres branches, courtes.

### L0. Dire qu'un programme contient A (sans axe A activé)

- **But.** Fermer le silence du § 1.3. Seul changement visible sur une machine à 3 axes, et seulement pour un fichier qui contient un mot A, B ou C.
- **Fichiers.** `program-check.js` (note `a.rotary = { line, letter }` à la première ligne dont un mot est A, B ou C hors commentaire ; raison codée `ETOUCH_CHECK_ROTARY` posée sur X, Y, Z comme les autres raisons « non interprété », `:403-405`) ; `resume.js` (refus de construire une reprise si une ligne du fichier porte A, B ou C) ; `i18n-messages-refus.js` (FR/EN/ES).
- **Sûreté.** Verdict « unknown » avec « Ligne n : mot A (axe rotatif) non pris en charge par cette machine. » ; reprise à une ligne refusée. Rien n'est envoyé de plus ni de moins à la carte.
- **Tests.** Jest : les cinq programmes du § 1.3, plus `(A12)` et `; A12` en commentaire (aucun signalement), plus corpus `gcode-corpus` inchangé au caractère près (`corpus.test.js`). Banc de page : l'écran Contrôle montre la raison.
- **Non vérifiable sans machine.** Rien.

### L1. Voir A

- **Activation.** Réglage **et** rapport, pas l'un sans l'autre. Pourquoi pas le rapport seul : la carte donne déjà une 4e valeur à 0 sans axe (§ 0.1), une colonne « A 0.000 » apparaîtrait chez tout le monde. Pourquoi pas le réglage seul : sans 4e valeur il n'y a rien à montrer, et une case vide ou un 0 inventé serait pire que rien. Pourquoi dans `.cncrc` et pas dans la page : c'est un fait de câblage, il ne doit pas dépendre d'un navigateur (même raison que `touch.machines`, `machine-profile.js:1-7`).
- **Fichiers.** `report-proof.js` : `readStatus` garde le 4e nombre s'il existe (`a`) pour la position et pour WCO, sans rien changer à x, y, z ni aux compteurs. `job-service.js:1675-1687` : `coordinates.wpos.a` et `mpos.a` ajoutés seulement si `axisA` ; drapeau `axisA: true` dans l'instantané. Page : `index.html:39`, `:43` et `app.js:178` (une case A, cachée par défaut), `job-dashboard.js`, i18n.
- **Affichage.** « A 12.345 ° » en repère pièce, en repère machine dans la ligne machine. Unité « ° » écrite parce que le réglage déclare un axe rotatif ; mention « échelle non vérifiée » tant que l'essai M1 n'est pas consigné (texte fixe du lot, retiré par un commit après l'essai : pas de mécanisme). Rapport sans 4e valeur alors que le réglage est posé : « A — ».
- **Sûreté.** Lecture seule. La valeur montrée vient du champ brut du rapport (règle C1), jamais de l'état fusionné de CNCjs.
- **Tests.** Jest : `readStatus` sur 3, 4, 5, 6 nombres, champ abîmé, WCO à 3 valeurs avec MPos à 4 (alors `w.a` inconnu, pas 0) ; instantané avec et sans réglage. Banc de page : case absente sans drapeau, présente avec. Simulateur : option « 4e valeur fixe à 0 » dans `grbl-simulator.js` (c'est ce que la carte fait aujourd'hui), pour prouver § 5.
- **Essai réel.** Tablette, réglage posé : la case suit M1.
- **Non vérifiable sans machine.** Que la 4e valeur est bien A et en degrés ; cadence de `WCO:` à 4 valeurs.

### L2. Mettre A à zéro

- **Commande.** `G10 L20 P<n> A0` par `originLine` (`motion.js:309`), repère actif, comme X Y Z. Jamais `G92`. Pas de « A à l'origine machine » (`at: 'machine'`) : A n'a pas d'origine machine.
- **Fichiers.** `motion.js:1452-1463` (accepter `['A']` **seul** quand `axisA` ; « Zéro XYZ ici » reste X Y Z), `:1487-1493`, `:1508` (position A liée à la confirmation, par `posOf(r, 'm', 'A')`) ; `report-proof.js` (`moved` et le repos comparent `a` quand les deux rapports le portent) ; `work-offset.js` (preuve D2 étendue à `a` quand `axisA` : `G54.a + G92.a` de `$#` égal au `WCO` 4e valeur) ; page : un bouton « Zéro A ici » (`index.html:49-52`, `real-motion.js:307-328`, `coordinate-plan.js:17`).
- **Sûreté.** Mêmes gardes que le zéro X Y Z : Idle, deux rapports au repos, confirmation liée à la position, repère inchangé. Refus si la 4e valeur manque (`ETOUCH_MOTION_POSITION_UNKNOWN`, axe A). Après l'`ok` : zéro annoncé seulement quand un rapport au repos donne WPos A à 0 ± 0,01 **et** que `$#` le confirme ; sinon « Zéro A non confirmé », décalage invalidé (chemin existant `motion.js:1522-1524`).
- **Tests.** Jest par le vrai parseur : séquence `G10` → `ok` → rapport avec `WCO:…,a` → `$#` ; rapport sans WCO ; WCO à 3 valeurs ; A qui bouge entre confirmation et envoi (refus). Banc de page : bouton absent sans drapeau. Simulateur : décalage A.
- **Essai réel.** M6 refait depuis la tablette, puis extinction et rallumage : WPos A.
- **Non vérifiable sans machine.** `G10 L20 … A0` accepté ; l'écart connu R6 (`FIRMWARE.md` : décalage exécuté nul après `$H` alors que `$#` le contient) vaut-il aussi pour A.

### L3. Déplacer A à la main

- **Pas.** 0,1 / 1 / 5 / 15 / 45 / 90 ° (liste propre à A, la liste en mm `motion.js:37` reste intacte). Ligne : `jogLine('A', ±pas, vitesse)` soit `$J=G91 G21 A… F…` (`motion.js:307`, inchangé).
- **Vitesse.** En °/min ; choix de la page 100 / 250 / 500 / 1000 / 2000 (`real-motion.js:22`) filtrés par `$113` ; `$113` inconnu : 500 (`FALLBACK_MAX_FEED`). `maxFeedOf` reçoit le numéro de réglage 113 pour A (`motion.js:301-302`).
- **Continu.** Une seule ligne bornée, comme aujourd'hui, mais la borne n'est pas la course : `min(360°, vitesse × 60 s)` (`MAX_JOG_MS`, `motion.js:296`). Même session, même entretien (250 ms), même annulation `0x85` au relâchement, à la perte du flux ou d'un rapport (`motion.js:740-768`). Un tour au plus par appui.
- **Preuves C1 pour A.** Position : les deux derniers rapports au repos portent 4 valeurs et s'accordent sur x, y, z **et a**. Broche : **prouvée arrêtée pour tout mouvement de A**, pas et continu (pas d'exception « petit pas broche en marche » : tourner une pièce contre une fraise qui tourne est un usinage). Pendant le mouvement : surveillance existante (`spindleWatch`, rapport périmé).
- **Gardes qui restent sans course.** Pas de règle « 1 mm tant que non référencé » pour A (elle protège une course, A n'en a pas) ; durée d'un pas ≤ 60 s ; plafond `$113` ; un tour par appui en continu ; refus `error:15` de la carte montré tel quel. **Si l'essai M4 montre que la carte borne A**, ce lot reçoit une course A lue sur `$133` et le sens de `$23`, par les fonctions existantes `limitsAt`/`usableOf` : à décider après M4, pas avant.
- **Ce que Touch ne peut pas garder.** La collision d'une pièce non ronde avec la fraise ou la broche. Texte permanent du panneau A : « Fraise relevée au-dessus de la pièce sur tout le tour. » Pas de confirmation à chaque pas.
- **Fichiers.** `motion.js` (branche A de `jogParams`, `step`, `continuousReason`, `start`), `motion-preflight.js:5`, `:132`, `:140`, `job-service.js:54` (exposer `$113`), page `index.html:56-57` (rangée A− / A+), `real-motion.js` (unités « ° », « °/min », codes de refus), i18n.
- **Tests.** Jest : chaque refus (pas hors liste, vitesse au-dessus de `$113`, 4e valeur absente, broche non prouvée, axe non activé) ; ligne exacte émise ; continu annulé au relâchement, à la perte d'un rapport ; X Y Z à l'identique. Bancs de page : rangée absente sans drapeau ; libellés. Simulateur : A libre, sans limite.
- **Essai réel.** M1 et M3 depuis la tablette ; relâchement à mi-tour ; arrêt d'urgence pendant un continu.
- **Non vérifiable sans machine.** `$J` avec A accepté ; arrêt réel sous `0x85` ; A borné ou non ; tenue au repos.

### L4. Programmes avec A

- **Enveloppe.** X Y Z : code inchangé. A : suivi à part (`aMin`, `aMax`, premier A absolu), **jamais comparé à une course**, sauf si M4 l'impose. Montré à l'écran Contrôle : « A de −90° à 720° (2 tours) » et la position A actuelle. Si le premier A absolu est à plus d'un tour de la position actuelle : « La machine déroulera n tours avant de commencer. »
- **Ce qu'on refuse (verdict « unknown », raison codée, ligne citée).**
  - `G93` (avance en temps inverse) : aujourd'hui accepté sans durée (`program-check.js:346`). Avec A, F n'est plus une vitesse ; refus tant qu'aucun essai ne l'a qualifié.
  - A en pouces : un mot A sous `G20`, ou `$13=1` (Grbl convertit tous les mots d'axe ; pour A ce serait des degrés × 25,4, **à confirmer par lecture du code amont**, non relu cette nuit).
  - `G2`/`G3` avec un mot A ; `G38.x`, `G28`, `G30`, `G53` avec un mot A ; `G10`/`G92` avec A (déjà « modifie l'origine »).
  - A en `G91` (relatif) : accepté, suivi comme X Y Z.
- **Mouvements combinés (X, Y ou Z avec A dans la même ligne `G1`).** Grbl applique F à la longueur du vecteur toutes composantes confondues, degrés comptés comme des mm (lecture amont à confirmer, essai M8). La vitesse réelle à la surface dépend du rayon, que Touch ne connaît pas. **Proposition : acceptés, annoncés** (« n lignes déplacent X/Y/Z et A ensemble : la vitesse à la surface de la pièce dépend de son rayon, Touch ne la contrôle pas »), parce que c'est le cas normal d'un programme 4 axes et que F y est choisi par le logiciel de FAO. Question Q2.
- **Durée.** A seul : `|ΔA| / F` en `G1`, `|ΔA| / $113` en `G0`, accélération `$123`. Combiné : longueur du vecteur à quatre composantes divisée par F, plafonnée par axe (`$110-113`). Affichée « estimée » ; reste absente (`null`) tant que M8 n'a pas confirmé la règle. `program-time.js:4` : vecteur à 4 composantes seulement quand `axisA`.
- **Départ.** Preuves de départ existantes, plus : 4e valeur présente dans les deux rapports au repos. Pas d'exigence « A = 0 » : c'est le programme qui place A.
- **Suivi.** Position A dans le tableau de suivi (L1). Tracé 3D : inchangé, à plat, avec la mention « Aperçu sans la rotation A ».
- **Reprise à une ligne.** **Refusée** pour un programme contenant A (déjà en L0). La rendre possible demande de replacer A avant la plongée et de prouver sa position : autre lot, pas maintenant.
- **Cadrage à vide.** Permis : contour X Y à Z sûr, A immobile. Mention : « Cadrage fait à A = x°. »
- **Palpages.** Permis quel que soit A (ils ne déplacent que X, Y, Z, `block-probe.js:140-141`, `plate-probe.js:506-519`). La carte de palpage affiche la position A quand elle n'est pas 0 : « Zéro mesuré à A = x° ». Pas de refus : pour une pièce ronde, palper Z à n'importe quel angle est légitime, et exiger A = 0 obligerait à un ordre d'opérations que rien n'impose.
- **Fichiers.** `program-check.js`, `program-time.js`, `job-service.js` (départ, instantané), page `check-screen.js`, `program-check-view.js`, `job-follow.js`, `motion-estimate.js` (A cesse d'être un mot « autre » quand `axisA`), i18n.
- **Tests.** Jest : chaque refus ; plage A en G90 et G91 ; G20 ; enveloppe X Y Z identique mot A ou non ; durée sur M8 une fois mesuré ; corpus existant inchangé. Bancs de page : Contrôle, Suivi. Simulateur : programme 4 axes de bout en bout, pause, arrêt.
- **Essai réel.** Protocole : programme de 10 lignes fraise en l'air (A seul, puis combiné), pause, reprise simple, arrêt ; puis une gravure sur un rond de bois.
- **Non vérifiable sans machine.** Règle de vitesse réelle ; comportement de la pause et de l'arrêt sur A ; limites sur A en cours de programme (`ALARM:2` critique sur cette carte, `FIRMWARE.md` § c).

### Ordre et dépendances

L0 d'abord (sans machine). L1 après la lecture § 2.1. L2 et L3 après M1 à M7 ; L3 a besoin de L1, L2 de L1. L4 en dernier, après M8, et a besoin de L1.

## 4. Hypothèses, questions, risques, à ne pas faire

### Hypothèses (chacune tombe ou tient par § 2)

- H1. La 4e valeur des rapports est l'axe A de la sortie « A » de la carte. *Observé à 0, jamais en mouvement.*
- H2. A est linéaire pour la carte : un degré vaut une unité, `$103` en pas par degré. *Règle Grbl ; `$103=800` est la valeur d'usine, donc faux tant que non réglé.*
- H3. `$J=G91 G21 A…` et `G10 L20 P1 A0` sont acceptés. *Non essayé.*
- H4. `$H` ne touche pas A. *Inconnu ; sur cette carte `$HX` fait trois axes (`FIRMWARE.md` E2).*
- H5. Les limites logicielles s'appliquent à A (code amont : tous les axes), donc A borné à 400° d'un côté tant que `$20=1` et `$133=400`. *Lecture amont de mémoire, non relue ; essai M4.*
- H6. F s'applique à la norme du vecteur, degrés et mm mêlés. *Idem ; essai M8.*

### Questions pour l'opérateur

- **Q1. Rapport du diviseur** (pour `$103` = pas moteur × micropas × rapport / 360) : (a) je connais les trois nombres ; (b) je ne sais pas, on mesure par M1 ; (c) le vendeur a donné une valeur de `$103`.
- **Q2. Lignes qui déplacent X/Y/Z et A ensemble :** (a) acceptées et annoncées *(proposé)* ; (b) refusées pour l'instant, seuls les programmes « A s'indexe, puis X Y Z usinent » passent.
- **Q3. Si la carte borne A à 400° :** (a) je garde la borne et je remets A à zéro machine en rallumant la carte ; (b) j'accepte qu'on change `$133` (grande valeur) après sauvegarde, par moi, depuis le PC ; (c) je coupe `$20` (déconseillé : X Y Z perdent leur garde).
- **Q4. Si A est libre au repos (`$1=25`) :** (a) je mets `$1=255` (moteurs toujours tenus, ils chauffent) ; (b) je laisse, Touch l'affiche.
- **Q5. Usage visé :** (a) indexer (tourner, puis usiner en X Y Z) ; (b) usinage continu enroulé ; (c) les deux. *(a) seul permettrait de réduire L4.*

### Risques

1. **`$H` qui fait tourner A sans capteur** (H4) : rotation longue, puis alarme. Premier `$H` moteur A branché : main sur l'arrêt (M5).
2. **Borne à 400° inattendue en plein programme** : `ALARM:2`, critique, la carte se réinitialise et perd sa position (`FIRMWARE.md` E3).
3. **Échelle fausse** (`$103=800`) : tout angle affiché ou programmé est faux d'un facteur ; ne rien usiner avant M1.
4. **A libre au repos** : la pièce tourne sous l'effort de coupe pendant un usinage X Y Z.
5. **Collision en rotation** d'une pièce non ronde : hors de portée de Touch.
6. **Reprise à une ligne** sans A (§ 1.3) : fermé par L0.

### À ne PAS faire maintenant

- Écrire `$103`, `$113`, `$123`, `$133`, `$1` ou `$20` depuis Touch.
- Ajouter A à `AXES` ou généraliser à « n axes » (B, C).
- Tracé 3D enroulé, vitesse de surface, saisie du rayon de la pièce.
- Reprise à une ligne avec A ; `G93` ; prise d'origine ou course pour A (sauf M4) ; `G92`.
- Modifier le parseur de CNCjs (`controllers/Grbl/`) : il sait déjà.
- Coder L1 à L4 avant la lecture § 2.1.

## 5. Ne rien changer à une machine à 3 axes : comment ce sera prouvé

1. **Réglage absent = code ancien.** Chaque branche nouvelle commence par `axisA` ; les listes `AXES` ne changent pas. Revue : aucun `diff` hors de ces branches, sauf L0.
2. **Suite existante inchangée.** Tous les tests Jest de `__tests__/` et tous les bancs `test-*.cjs` passent **sans modification de leurs attentes**. Un test existant qu'il faudrait retoucher est un échec du lot.
3. **Rejeu à l'identique.** Un test par lot rejoue les mêmes séquences (rapports à 3 valeurs, puis les mêmes à 4 valeurs avec A = 0 et réglage absent, ce que la LUNYEE émet aujourd'hui) par le vrai parseur et compare **octet pour octet** les lignes écrites vers la carte et l'instantané envoyé à la page. Séquences : pas, continu, zéro, cadrage, palpage plaque et bloc, départ, pause, arrêt (bancs C1 existants, `__tests__/support/c1-bench.js`).
4. **Corpus.** `corpus.test.js` : verdicts, enveloppes et durées de tous les fichiers de `gcode-corpus` identiques ; seuls les fichiers contenant A, B ou C peuvent changer (L0), et la liste en est écrite dans le rapport du lot.
5. **Page.** Capture du DOM des écrans Position, Déplacement, Zéro, Contrôle, Suivi sans drapeau : identique à master (bancs `dom-fixture.cjs`).
6. **Tablette.** L0 et L1 s'installent réglage absent ; l'essai X Y Z habituel du protocole est refait avant de poser le réglage.

## 6. Ce qui n'a pas pu être établi

- Tout ce qui dépend de la carte avec le moteur A branché (H1 à H6).
- Le code amont Grbl_Esp32 n'a pas été relu cette nuit pour A (limites, pouces, vitesse, cycles de prise d'origine) : H5, H6 et la règle des pouces sont des souvenirs à confirmer, pas des citations.
- L'effet exact d'un verdict « unknown » sur le départ (dérogation ou non) n'a pas été relu ligne à ligne pour L0 : à fixer à l'écriture du lot (`job-service.js:1110-1113`, `program-check.js:1043-1044`).
- `$20` vaut 0 dans le relevé du 13 novembre ; sa valeur actuelle n'a pas été lue.
