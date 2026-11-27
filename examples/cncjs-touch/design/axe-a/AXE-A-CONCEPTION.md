# Axe rotatif A dans CNCjs Touch : conception (révision 3)

27 novembre 2026. Arbre `cncjs-wt/A`, branche `feat/axe-A` (partie de master `95b773b6`). **Conception seule : aucun code de production, rien d'envoyé à la tablette ni à la carte.** Révision 3 après les contre-avis d'Astra n° 1 et n° 2 (`AXE-A-AVIS-ASTRA-1.md`, `AXE-A-AVIS-ASTRA-2.md`) et la fiche du kit donnée par l'opérateur. Depuis la révision 3, L0 est réalisé dans cet arbre (`L0-RAPPORT.md`) ; L1 à L4 restent de la conception. Les chemins sont relatifs à `src/server/services/touch/` (serveur) et à `examples/cncjs-touch/touch/` (page), sauf mention.

## Réponses au contre-avis n° 2

Cadre accepté, serveur de L0 accepté. Cinq corrections, toutes vérifiées et adoptées.

| Point d'Astra | Vérifié | Ce qui change | § |
|---|---|---|---|
| 1. L0 : l'avertissement resterait dans les détails | Oui : `check-screen.js:103` est dans `paintDetails` (volet créé `:9`) ; la vue principale ne lit de `info` que la broche (`:113`) ; la confirmation dit « Tient dans la machine » sans lire `info` (`job-controls.js:654`). | Avertissement dans la vue principale, détails fermés, et dans la confirmation de départ. Serveur inchangé. | 3, L0 |
| 2. T3 commandait 371° pour contrôler un tour | Oui (1 + 10 + 90 + 3 × 90). | T3a (petits essais) et T3b (nouveau départ relevé, 4 × 90°, positions attendues). | 2.2 |
| 3. T8 ne restaurait le décalage que s'il était nul | Oui. | Placement explicite, G54 A relevé avant, restauré à cette valeur, `$#` et WCO vérifiés. | 2.2 |
| 4. L4 : `G28`/`G30` sans mot d'axe dans un fichier sans A | Oui : la liste ne s'appliquait qu'aux fichiers avec A. | Avec A configuré, refusés quel que soit le fichier. | 3, L4 |
| 5. L2 : référence A recapturée entre deux lignes | Oui (`plate-probe.js:513-519`, `block-probe.js:788`). | Référence A notée au début et gardée dans la session. | 3, L2 |

## Réponses au contre-avis n° 1

Chaque affirmation d'Astra a été relue dans le code. **Aucune n'est fausse** ; une nuance au point 7.

| Point d'Astra | Vérifié dans le code | Ce qui change | § |
|---|---|---|---|
| 1. L0 efface un hors course X Y Z | Oui : un axe « inconnu » perd son enveloppe (`program-check.js:688-692`), donc plus de `blocking`, et `travelReady` laisse partir (`job-service.js:1149-1151`). | L0 n'écrit plus rien dans les raisons d'axe. Avertissement rotatif **à part** (`rotary` + une entrée codée dans `info`). Test exigé : `G0 X500 A90` reste `outside`. | 3, L0 |
| 2. `unknown` n'est pas un refus | Oui : « `unknown` is a warning, never a green light » (`job-service.js:2443-2446`), `SURETE.md:39`. | L4 a ses propres interdictions serveur, hors verdict de course, non dérogeables, contrôlées à la préparation et juste avant `gcode:start`. Le sens des `unknown` existants ne change pas. | 3, L4 |
| 3. « A configuré » confondu avec « A rapporté » | Oui : `posYoung` (`report-proof.js:160`) et les veilles du jog (`motion.js:580`, `:728`) se satisfont de X Y Z. | Trois états (absent / configuré inconnu / disponible) ; compteur de repos propre à A ; une session A exige la preuve A jusqu'au bout. Séquence 4→3→4 traitée. | 3, règle commune |
| 4. Des nombres cohérents ne prouvent ni l'angle ni la tenue | Hors code. | Repérage angulaire de session exigé avant un programme ; moteur libre au repos = observation à vide, aucun programme. | 3, L4 ; 4 |
| 5. Protocole trop risqué trop tôt | Oui (M1 de 10 unités à échelle inconnue, `$H` dans M4 avant M5, `A720` avec pièce, `G92.1` qui efface aussi X Y Z). | Protocole refait T0 à T11, du papier vers le mouvement ; M7 supprimé ; M10 remplacé. | 2 |
| 6. L2 prêtait aux zéros X Y Z des gardes qu'ils n'ont pas | Oui : `originReady` (`motion.js:1439-1449`) ne demande pas deux rapports au repos ; lectures par l'état fusionné (`:1488`, `:1508`, `:1552`, `:1560`) ; succès annoncé après la seule invalidation de D2 (`:1570-1581`) ; C1 a laissé les zéros hors de son périmètre (`C1-CONCEPTION.md:169`). **Ma phrase « mêmes gardes » était fausse.** | Contrat de preuve du zéro A écrit en entier ; G92 A non nul ou inconnu refusé ; message d'échec honnête. | 3, L2 |
| 7. Échelle, unités, bornes | Oui pour le repli à 500 et l'ambiguïté de la borne. **Nuance** : « `$103=800` non vérifié, pas faux en soi » ne tient plus avec la fiche du kit (0,3° par pas entier : 800 pas/° demanderait 240 micropas). Il est non qualifié **et très probablement inadapté**. | Échelle qualifiée et liée à la valeur de `$103` ; plafond inconnu : jog A refusé ; borne du continu écrite ; bornes logicielles éprouvées dans les deux sens ; pouces refusés aussi quand hérités ou inconnus. | 2 ; 3, L1, L3 |
| 8. Risque mécanique annoncé trop étroitement | Hors code. | Texte « volume balayé non vérifié » ; plusieurs appuis = plusieurs tours ; `0x85` peut ne pas arriver. | 3, L3 ; 4 |
| 9. Refus L4 incomplets | Oui : `G94` n'est gardé que pour la reprise (`job-service.js:1022-1031`) ; `modalsBeforeFirstMove` ignore A (`resume.js:306-320`). | Premier sous-ensemble réduit à l'**indexage** ; liste des refus complétée ; L4 dépend de L2 (preuve du décalage A). | 3, L4 |
| 10. Durée et avance affichée | Oui : `program-time.js:9-47` n'a aucun modèle d'accélération (**ma mention de `$123` était fausse**) ; « Avance réelle … mm/min » (`job-dashboard.js:239-242`). | Durée `null` pour tout programme avec A ; libellé de l'avance adapté. | 3, L4 |
| 11. § 5 insuffisant | — | Rejeux ajoutés, référence git figée, comparaison du visible. | 5 |
| 12. Preuves partagées | Oui : `near`/`moved` (`report-proof.js:125`, `:174`), `plate-probe.js:448`, `block-probe.js:822`. | A configuré : valeur absente jamais égale ; A connu et inchangé pendant palpage et cadrage. | 3, L2 ; 5 |
| 13. Formulation du constat | — | « Aucun avertissement spécifique aux mots A » ; les gardes ordinaires restent. | 1.3 |

## 0. Lecture rapide

1. **La carte rapporte déjà quatre valeurs, sans 4e axe branché** (relevé du 13 novembre, `surface-pro-sauvegardes/cnc-config-20261113.txt`, hors dépôt) : `<Alarm|MPos:0.000,0.000,0.000,0.000|FS:0,0>`, `[G54:0.000,0.000,0.000,0.000]`, `$103=800`, `$113=2000`, `$123=50`, `$133=400`. La présence d'une 4e valeur ne peut donc pas servir d'activation.
2. **Aujourd'hui, un programme avec des mots A ne reçoit aucun avertissement spécifique** (§ 1.3) ; les gardes ordinaires (hors course X Y Z, preuves de départ) s'appliquent. La reprise à une ligne reconstruit un préambule sans A.
3. **Fiche du kit** : mandrin 4 mors K12-100, réduction 6:1 par courroie, Nema 23 3 A, 0,3° par pas entier en sortie, centre à 65 mm, hauteur totale 115 mm, 10,8 kg. `$103` attendu = 3,3333 × micropas (26,667 en 1/8, 53,333 en 1/16). Avec `$103=800`, **un ordre de 1° ferait tourner de 30° en 1/8, de 15° en 1/16**.
4. **Découpe.**

| Lot | Quand |
|---|---|
| **L0** signaler A/B/C, refuser leur reprise à une ligne | **Maintenant, sans machine.** Détail prêt à coder au § 3. |
| **L1** voir A | Après la lecture de la carte (§ 2.1). |
| **L2** zéro A, **L3** déplacer A | Après lecture et essais ciblés (T1 à T8). |
| **L4** programmes, indexage seul | En dernier, après L2, T9 à T11, tenue vérifiée. |

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

Donc : **aucun avertissement spécifique aux mots A** ; les gardes ordinaires (hors course X Y Z, preuves de départ) restent appliquées ; l'enveloppe X Y Z reste juste (A ne la change pas) ; la durée est absente, pas fausse ; le programme part tel quel vers la carte. Sur cette carte (4 axes compilés, rien de branché sur A), les mots A seraient exécutés « dans le vide ». Sur un Grbl à 3 axes, le premier mot A arrêterait le travail en erreur au milieu de la passe.

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

## 2. Avant de coder : lire, puis essayer

### 2.1 Lecture seule (machine au repos, aucun mouvement)

Réponses à ranger en texte brut dans `design/axe-a/`.

| Commande | Ce qu'on lit | Ce que la réponse décide |
|---|---|---|
| `?` (10 fois, à 1 s) | Nombre de valeurs de `MPos:` ; `FS:` ; un `WCO:` à 4 valeurs | 4 valeurs : L1 tel que conçu. 3 valeurs : la carte a changé, tout s'arrête. |
| `$$` | `$103`, `$113`, `$123`, `$133`, `$20`, `$22`, `$23`, `$1`, `$13`, `$3` | `$103` : échelle (T1 à T3). `$113` : plafond du jog A ; absent : jog A refusé. `$20`, `$133`, bit 3 de `$23` : borne probable de A (T7). `$1` : tenue au repos (T5). `$13=1` : A non activable. |
| `$I` | `[VER:…]`, `[OPT:…]` | Même binaire que le 13 novembre (`1.1f.20231030`, `PHSW`) ? Sinon reprendre `FIRMWARE.md`. |
| `$#` | 4 valeurs par ligne ; A de G54…G59, G92, G28, G30 | Où `G10 L20 … A0` s'écrira ; un G92 A non nul bloque L2 ; G28/G30 A mémorisés (raison du refus L4). |
| `$G` | `G21`, `G90`, `G94`, repère | Autre chose au repos : ne rien lancer. |
| `$+` (ou `$S`), cité dans `FIRMWARE.md` E-0, jamais lancé | Cycles de prise d'origine ; `Home/Mpos` et course de A | Dit, sans mouvement, si un cycle nomme A, et l'origine numérique de la borne de A. Réserve : binaire du fabricant, la liste peut mentir (`FIRMWARE.md` E2). Refus `error:` : rien de perdu. |

### 2.2 Essais, du moins risqué au plus risqué

Par l'opérateur, depuis la console CNCjs du PC (Touch refuse A). Conditions de T1 à T10 : **mandrin vide, clé retirée, mors serrés à vide**, broche arrêtée, Z en haut, X Y loin du mandrin, main sur l'arrêt d'urgence. Avant chaque essai : état `Idle`, `$G` = `G21 G90 G94`, MPos A notée. Après : dix `?` notés. **Aucun `G92`. Aucun `A720`.** Chaque essai ne se fait que si le précédent a donné le résultat attendu.

| N° | Départ | Geste | Contrôle final | Décide |
|---|---|---|---|---|
| T0 | Machine éteinte | Lire les micro-interrupteurs du pilote A (micropas, courant 3 A) ; regarder ce que le mandrin, les mors et la courroie balaient ; passage des câbles | — | `$103` attendu = 3,3333 × micropas. |
| T1 | MPos A = 0 | `$J=G91 G21 A0.01 F1`, puis `$J=G91 G21 A0.1 F5` | `ok` ; 4e valeur +0,010 puis +0,100 ; angle réel au repère (trait sur le mandrin : à Ø 100, 1° = 0,87 mm). Avec `$103=800` : 3° attendus en 1/8, 1,5° en 1/16 | `$J` avec A accepté ; la 4e valeur est bien A ; sens ; micropas réel. |
| T2 | Idle | **L'opérateur** écrit `$103=<valeur que nous donnons d'après T0 et T1>`, après une sauvegarde des réglages ; relit `$$` | `$103` relu | Échelle posée. Touch n'écrit pas ce réglage. |
| T3a | MPos A notée, repère tracé | Petits essais, un à la fois : `$J=G91 G21 A1 F60`, puis `A10 F180` | 4e valeur +1 puis +10 (11 au total) ; angles réels cohérents à l'œil | Ordre de grandeur de l'échelle avant un grand angle. **Ne sert pas à la mesure du tour.** |
| T3b | **Nouveau départ** : trait refait sur le mandrin et son vis-à-vis fixe, MPos A relevée (valeur `a0`) | Quatre fois `$J=G91 G21 A90 F360`, arrêt complet entre chaque | 4e valeur attendue après chaque : `a0+90`, `a0+180`, `a0+270`, `a0+360` ; trait au quart, à la moitié, aux trois quarts, puis **revenu sur son vis-à-vis** (± 0,5°) | **Échelle qualifiée** pour cette valeur de `$103` (réglage `qualified103`, § 3). Écart : on recalcule `$103` depuis l'angle mesuré, on refait T2 puis T3b ; on n'ajuste jamais `$103` pour faire passer un contrôle mal posé. |
| T4 | Idle | `$J=G91 G21 A90 F180` (30 s), `0x85` à mi-course | Arrêt net, `Idle`, angle rapporté = angle au repère | Annulation du continu. |
| T5 | Idle depuis 10 s | Tourner le mandrin à la main, sans forcer | Tenu ou libre | Libre : pas de programme (§ 3, L4), question Q3. |
| T6 | Cycles lus par `$+` | `$H`, mandrin vide, main sur l'arrêt | A tourne-t-il ; alarme ; durée ; MPos A avant et après | `$H` fait tourner A : **rien n'est installable** avant correction côté carte. Sinon : MPos A survit-elle à `$H`. |
| T7 | Après T6, `$20` tel que réglé, MPos A = 0 | `$J=G91 G21 A90 F1000` répété jusqu'à 450°, retour, puis `A-90` jusqu'à −450° | À quelle valeur `error:15`, dans chaque sens ; aucune alarme | A borné ou non, et où. Décide la politique de bornes de L3 et L4 (Q2). |
| T8 | Placement préalable explicite : depuis l'arrêt, `$J=G91 G21 A30 F360`, puis Idle ; MPos A relevée (`m`) ; `$#` relevé : **G54 A d'avant (`g`)**, G92 nul sur les 4 axes, repère G54 actif (`$G`) | `G10 L20 P1 A0` | MPos A toujours `m` ; un `WCO:` reçu après, 4e valeur `m` ; `$#` : G54 A = `m`, X Y Z de G54 inchangés. **Restauration : `G10 L2 P1 A<g>`** (la valeur relevée, pas 0), puis `$#` : G54 A = `g`, et un `WCO:` reçu après, 4e valeur `g` | Contrat de L2. |
| T9 | WPos A = 0, G90 G94 G21 | `G1 A90 F360`, chronométré ; `FS:` relevé pendant | 15 s ; valeur d'avance rapportée | Convention de F et de l'avance rapportée pour A seul. |
| T10 | Pince de palpage tenue à la main, A = 30 | Palpage Z du protocole existant | `[PRB:…]` à 4 valeurs, A inchangé | Palpage avec A ≠ 0. |
| T11 | Pièce d'essai serrée, **volume balayé inspecté à l'arrêt** (pièce, mors, bridage, câbles, pince) | `$J=G91 G21 A15 F180`, puis `A45`, puis `A90`, en regardant | Rien ne touche, rien ne s'enroule | Seulement cette pièce, ce montage. |

Les lignes combinées (X/Y/Z avec A) ne sont pas essayées : hors du premier sous-ensemble.

## 3. Conception par lots

### Règle commune : trois états, jamais deux

Réglage `.cncrc` (comme `touch.motion.enabled`, `motion.js:136-142`) : `touch.axisA = { enabled, qualified103, holds }`.

| État | Condition | Effet |
|---|---|---|
| **Absent** | `enabled` n'est pas `true` | Comportement historique. Aucune branche nouvelle n'est prise, quelle que soit la 4e valeur. |
| **Configuré, A inconnu** | `enabled`, mais le dernier rapport positionnel n'a pas de 4e nombre entier, ou il est abîmé, ou périmé (2,5 s) | Case « A — ». Toute commande A indisponible, confirmations A en cours invalidées, compteur de repos A remis à 0. Les arrêts restent accessibles. |
| **Disponible** | `enabled` et le dernier rapport porte A | Valeur montrée ; les gardes de chaque lot décident du reste. |

- **Repos de A** : compteur à part (`stillA`), +1 seulement si ce rapport et le précédent portent A, disent Idle et s'accordent ; remis à 0 par tout rapport sans A. 4→3→4 donne donc 1, pas 2.
- **Égalité** : A configuré, une valeur absente n'est jamais égale à rien (`near`, `moved`, `report-proof.js:125`, `:174`). A absent du réglage : ces fonctions ne regardent pas la 4e valeur.
- **Session A** (pas, continu, zéro en cours) : sa veille exige une position **avec A** fraîche ; A disparu : annulation à l'échéance existante (`motion.js:580`, `:728`), jamais de retour aux seules gardes X Y Z.
- A n'entre pas dans `AXES` (`motion.js:36`, `program-check.js:26`, `work-offset.js:30`).

### L0. Signaler A, B, C et refuser leur reprise (réalisé)

> **Réalisé le 27 novembre 2026** (`L0-RAPPORT.md`). Écarts avec le texte ci-dessous, voulus : le code d'avertissement s'appelle `ETOUCH_ROTARY_UNCHECKED` (un test existant fige la liste des codes `ETOUCH_CHECK_*`) ; ses paramètres sont `{ axis, line, count }` ; la détection est placée avant le tri des lignes à espaces ambigus, pour lire la ligne comme la carte ; les phrases montrées à l'opérateur sont celles, plus courtes, du rapport.

**Règle exacte.**

1. `program-check.js`, dans la boucle, juste après `const w = words(code);` (`:334`) : si un mot de `w` a pour lettre A, B ou C, compter la ligne dans `a.rotary = { letters, line, count }` (`letters` : lettres vues, dans l'ordre A B C ; `line` : première ligne ; `count` : nombre de lignes). **Rien d'autre** : pas d'appel à `unknown`, pas de `listed`, pas de `continue`. Les lignes `$…` ou à espaces ambigus sont déjà écartées avant (`:325-333`) ; les commentaires sont déjà retirés (`codeOf`, `:80`).
2. `checkProgram` : si `analysis.rotary`, `info.push(reason('ETOUCH_CHECK_ROTARY', { letters, line, count }, <texte FR>))` (même forme que `:831`) et `rotary` recopié dans le résultat. `verdict`, `axes`, `blocking`, `overridable` : inchangés.
3. `resume.js`, `buildResume`, après `checkSyntax(lines)` (`:581`) : si une ligne du fichier, **avant ou après** la ligne de reprise, porte un mot A, B ou C (par `words(grbl(line))`), `throw refuse('ETOUCH_RESUME_ROTARY', <texte FR>, { letter, line })`.
4. Page, **vue principale de Contrôle, détails fermés** : un paragraphe `#check-rotary` dans la carte « Verdict » (à côté de `#check-spindle`, `check-screen.js:8`, `:113-114`), rempli dès que `programCheck.rotary` existe ; et, quand le verdict est « validated », la phrase de la barre (« Tout est prêt : le fichier tient dans la machine », `check-screen.js:50`) devient l'avertissement, ton « warn ». Le mot du rail, les verdicts X Y Z et le bouton de départ ne changent pas. L'entrée reste aussi dans les détails (`:103`).
5. Page, **confirmation de départ** : `#job-start-status` (`job-controls.js:654`) ajoute l'avertissement après « Tient dans la machine. » ou « Course non vérifiée. » quand `ticket.programCheck.rotary` existe.
6. Catalogues : `i18n-messages-machine.js` (codes), famille dans `i18n-messages-refus.js`. Décisions serveur inchangées.

**Textes.**

| Code | FR | EN | ES |
|---|---|---|---|
| `ETOUCH_CHECK_ROTARY` | Ce programme commande un axe rotatif ({letters}, {count} lignes, la première ligne {line}). CNCjs Touch ne vérifie pas ces mouvements : le contrôle ci-dessus ne porte que sur X, Y et Z. | This program drives a rotary axis ({letters}, {count} lines, first at line {line}). CNCjs Touch does not check these moves: the check above covers X, Y and Z only. | Este programa mueve un eje rotativo ({letters}, {count} líneas, la primera en la línea {line}). CNCjs Touch no comprueba estos movimientos: el control anterior solo cubre X, Y y Z. |
| `ETOUCH_RESUME_ROTARY` | Reprise à une ligne impossible : le programme commande un axe rotatif ({letter}, ligne {line}) que la reprise ne sait pas replacer. | Cannot resume from a line: the program drives a rotary axis ({letter}, line {line}) that a resume cannot put back in place. | No se puede reanudar desde una línea: el programa mueve un eje rotativo ({letter}, línea {line}) que la reanudación no sabe recolocar. |

**Tests exigés (Jest, vraies fonctions).**

- `G21 G90 G54` + `G0 X500 A90`, machine de `program-check.test.js:7-16` : **`outside`**, mêmes `blocking` que sans `A90`, avec `$20=0` et `$20=1`, plus l'entrée `ETOUCH_CHECK_ROTARY`.
- Pour chaque fichier X Y Z valide, inconnu et hors course du jeu existant : la version avec ` A1` ajouté à une ligne donne **le même** `verdict`, `axes`, `blocking`, `reasons` ; seul `info`/`rotary` diffère.
- `(A12)`, `; A12`, `M3 S1000`, `T1 M6` : aucun signalement. `B`, `C`, `A` puis `B` : lettres et compte justes.
- Les cinq programmes du § 1.3.
- Reprise : refus si A est avant la ligne, après la ligne, ou sur la ligne ; aucun refus nouveau pour un fichier sans A/B/C (`resume.test.js` inchangé).
- `corpus.test.js` inchangé ; liste des fichiers du corpus contenant A/B/C écrite dans le rapport du lot.
- Bancs de page, en FR, EN et ES : l'avertissement est lisible dans la vue principale de Contrôle **sans ouvrir les détails**, et dans la confirmation de départ ; absent pour un fichier sans A/B/C ; le départ reste possible ou refusé exactement comme sans A.

**Non vérifiable sans machine.** Rien.

### L1. Voir A

- **Activation** : réglage et rapport (justification inchangée : la carte donne déjà un 4e zéro sans axe ; un fait de câblage ne dépend pas d'un navigateur).
- **Fichiers.** `report-proof.js` : `readStatus` rend le 4e nombre à part (`a`, `wcoA`) sans toucher à `xyz` ; état A et `stillA` tenus seulement si configuré. `job-service.js:1675-1687` : `coordinates.*.a` et `axisA: { state, scale }` dans l'instantané, seulement si configuré ; `:54` : `$103`, `$113` exposés. Page : `index.html:39`, `:43`, `app.js:178`, `job-dashboard.js`, i18n.
- **Affichage.** « A 12.345 ° » (pièce et machine). **Échelle** : « échelle qualifiée » seulement si `$103` lu sur la carte égale `qualified103` du réglage ; sinon « échelle non qualifiée : les degrés affichés peuvent être faux » (réglage absent, `$103` différent ou non lu). `$13=1` ou inconnu : A reste « — ». WCO à 3 valeurs avec MPos à 4 : A pièce inconnu, pas 0.
- **Sûreté.** Lecture seule, valeur prise dans le champ brut du rapport.
- **Tests.** Jest : 3, 4, 5, 6 nombres ; champ abîmé ; 4→3→4 ; WCO 4→3 ; péremption ; bannière ; `$103` égal, différent, absent. Banc de page : les trois états. Simulateur : option « 4e valeur » dans `grbl-simulator.js` (`:2039-2047`, `:2117-2122`).
- **Essai réel.** La case suit T1 et T3.
- **Non vérifiable sans machine.** Que la 4e valeur est A ; cadence du `WCO:` à 4 valeurs.

### L2. Mettre A à zéro

Les zéros X Y Z **ne sont pas modifiés** (ils restent hors C1, `C1-CONCEPTION.md:169`). Le zéro A est une séquence nouvelle, avec son contrat :

1. **Préparation (ticket).** A disponible ; `stillA ≥ 2` ; repère actif connu par un `$G` récent (`motion.js:1446-1448`) ; preuve du décalage du repère actif acquise, **A compris** (`$#` relu : `G54…G59` du repère actif) ; **G92 A lu et nul** (inconnu ou non nul : refus `ETOUCH_ORIGIN_A_G92`, car la somme G54+G92 juste aujourd'hui ne garantit rien une fois G92 retiré). MPos A notée depuis le champ brut.
2. **Juste avant l'écriture.** Mêmes conditions relues ; MPos A = valeur du ticket ± 0,01 ; repère inchangé.
3. **Écriture.** `G10 L20 P<n> A0` (`originLine`, `motion.js:309`), A seul. Jamais `G92`, jamais `at: 'machine'`.
4. **Après l'`ok`**, dans un délai borné, il faut **tout** : un rapport au repos, reçu après l'`ok`, portant `WCO:` à 4 valeurs ; MPos A inchangée ; WPos A = 0 ± 0,01 calculé depuis ce rapport ; un `$#` demandé après l'`ok` dont le repère actif donne A = MPos A ± 0,01 et X Y Z inchangés.
5. **Issue.** Tout tenu : « Zéro A réglé », et le **repérage angulaire de session** est acquis (L4). Sinon : **« Zéro A non confirmé : le décalage a peut-être été écrit. Vérifiez la position A avant de continuer. »**, preuve du décalage invalidée, aucun retour en arrière tenté.

- **Fichiers.** `motion.js` (opération `set-origin-a` distincte de `originRun`), `work-offset.js` (preuve étendue à `a` quand configuré), `report-proof.js`, page (`index.html:49-52` : bouton « Zéro A ici » ; « Zéro XYZ ici » reste X Y Z), i18n.
- **Palpage et cadrage, A configuré** : la valeur de A est notée **une fois, au début de la séquence**, et gardée dans sa session. Chaque contrôle entre deux lignes compare A à cette référence, pas à la position recapturée (`plate-probe.js:513-519` et `block-probe.js:788` recapturent la position entre mouvements : étendre `near`/`moved` ne suffit pas). Une rotation de A pendant une ligne, même stabilisée ensuite, **arrête la séquence** (chemin existant « la machine a bougé », `plate-probe.js:448`, `block-probe.js:822`) et ne devient jamais la nouvelle référence. Test exigé : ce cas précis, plaque et bloc.
- **Tests.** Jest par le vrai parseur : chaque condition manquante une à une (pas de WCO après, WCO à 3 valeurs, `$#` qui dit autre chose, MPos A qui bouge, G92 A = 5, G92 illisible, repère changé, A disparu entre ticket et envoi, bannière pendant l'attente) ; succès ; zéros X Y Z octet pour octet. Simulateur : décalage A, et une variante qui n'applique pas le décalage (écart R6 de `FIRMWARE.md`).
- **Essai réel.** T8, puis depuis la tablette ; extinction, rallumage, relecture.
- **Non vérifiable sans machine.** `G10 L20 … A0` accepté ; écart R6 pour A.

### L3. Déplacer A à la main

**Conditions de tout mouvement A** : A disponible ; **échelle qualifiée** (`$103` lu = `qualified103`) ; `$113` lu et positif, **sinon refus** (plus de repli à 500) ; `$13=0` lu ; `stillA ≥ 2` ; **broche prouvée arrêtée**, pour tout pas et pour le continu (`FS:0` et M5 sont des preuves logicielles, pas une mesure d'arrêt, `FIRMWARE.md:126`).

- **Pas.** 0,1 / 1 / 5 / 15 / 45 / 90 °. Ligne `$J=G91 G21 A… F…` (`jogLine`, `motion.js:307`).
- **Vitesse.** °/min, choix de la page filtrés par `$113`.
- **Continu.** Une ligne bornée à `min(360, F × MAX_JOG_MS / 60000)` degrés (`MAX_JOG_MS` = 60 000, `motion.js:296`). Entretien 250 ms et annulation `0x85` existants. **Plusieurs appuis font plusieurs tours** : la borne limite un appui, pas l'enroulement. Si l'USB ou le serveur tombe, le `0x85` peut ne pas arriver : la carte finit la ligne reçue ; un tour au plus, ce qui ne garantit pas l'absence de collision.
- **Bornes logicielles.** « Sans capteur » ne veut pas dire « sans borne » : la politique dépend de T7. A borné par la carte : course A depuis `$133` et l'origine lue par `$+`, par `limitsAt`/`usableOf`, sans rien déduire de la prise d'origine X Y Z, et sans présenter un redémarrage de la carte comme une remise à zéro. A libre : aucune course. **L3 n'est pas codé avant T7.**
- **Texte permanent du panneau A** (FR) : « Courses X, Y, Z vérifiées ; volume balayé par la pièce, le mandrin et le bridage non vérifié. »
- **Fichiers.** `motion.js` (branche A de `jogParams`, `step`, `continuousReason`, `start`, veilles), `motion-preflight.js:5`, `:132`, `:140`, page `index.html:56-57`, `real-motion.js` (unités, codes de refus au lieu de motifs `[XYZ]`), i18n.
- **Tests.** Jest : chaque refus (échelle non qualifiée, `$113` absent, A inconnu, 4→3→4, broche non prouvée, pas hors liste, vitesse trop haute) ; ligne émise exacte ; perte de A pendant un pas et pendant un continu : annulation, chronologie notée ; X Y Z identiques. Bancs de page. Simulateur : A libre, puis A borné.
- **Essai réel.** T3, T4 depuis la tablette ; relâchement ; arrêt d'urgence ; câble USB retiré pendant un continu (mandrin vide).
- **Non vérifiable sans machine.** Tout ce que T1 à T7 décident.

### L4. Programmes avec A : indexage seul

**Premier sous-ensemble pris en charge.** Un mot A n'est admis que **seul sur sa ligne** avec, au plus, `N`, `G0` ou `G1`, `F` ; en `G0` ou `G1` nommé dans le fichier avant lui, `G94`, `G90`, `G21` tous **fixés par le fichier** avant le premier mot A. Entre deux lignes A, le programme usine en X Y Z comme aujourd'hui.

**Interdictions serveur** (`rotaryRefusals`, liste propre, calculée à l'analyse ; refus `ETOUCH_START_ROTARY`, ligne et motif cités ; **hors verdict de course, non dérogeable** ; contrôlée à la préparation du ticket et dans `readyFor('start')`, dernier contrôle avant `gcode:start`). Dès qu'un programme contient un mot A, sont refusés :

| Motif | Pourquoi |
|---|---|
| Mot A avec X, Y, Z, I, J, K ou R sur la ligne | Combiné : vitesse de surface inconnue. Plus tard, après qualification. |
| Mot A alors que le mode courant est `G2`/`G3`/`G38.x`/`G80` ou non nommé dans le fichier | Mode hérité. |
| `G93` dans le fichier ; ou `G94` non fixé par le fichier avant le premier A | `G93` hérité de la carte. |
| `G20` dans le fichier ; `G21` non fixé avant le premier A ; `$13` différent de 0 ou non lu | La carte convertit tous les axes en pouces (lecture amont citée par Astra, binaire non confirmé). |
| `G91` actif sur une ligne A ; `G90` non fixé avant le premier A | Plage non annonçable sans position initiale prouvée. |
| `G28`, `G30`, `G28.1`, `G30.1`, **avec ou sans mot d'axe** | Rappellent toutes les coordonnées mémorisées, A compris. |
| `G53` ou `G38.x` avec A ; `G10`, `G92`, `G92.1`, changement de repère | Origine A non suivie. |
| Mot B ou C, n'importe où | Un premier A ne masque pas un B. |
| Ligne `$…`, expression (`[`, `#`), ligne à espaces ambigus (`program-check.js:325-333`) | Opaque. |

**Hors de cette liste, une seule règle vaut aussi pour un fichier sans mot A** : avec A configuré, `G28`, `G30` (et `.1`) **sans mot d'axe** sont refusés aux deux contrôles serveur, car ils rappellent la coordonnée A mémorisée. Tests : X Y Z + `G28` et + `G30`, avec et sans configuration A ; sans configuration A, comportement historique. Les autres programmes sans mot A ne passent pas par la liste. Les `unknown` existants gardent leur sens. L0 n'est pas élargi.

**Conditions de départ ajoutées** (mêmes deux moments) : A disponible et `stillA ≥ 2` ; échelle qualifiée ; **preuve du décalage A** (L2) ; **repérage angulaire de session** acquis : un « Zéro A ici » réussi depuis la dernière bannière de la carte, alarme, perte de liaison ou redémarrage du serveur (il n'est pas exigé que A soit encore à 0) ; **tenue déclarée** `holds: true` (posé à l'installation après T5 ; `$1=255` ne prouve pas le couple : c'est l'essai qui compte) ; modal `G94` prouvé par un `$G` récent. Sans `holds` : voir, zéro et déplacement à vide restent possibles, **aucun programme A ne part**.

- **Enveloppe.** X Y Z : code inchangé. A : `aMin`, `aMax` annoncés ; comparés à une course seulement si T7 l'impose. Premier A à plus d'un tour de la position actuelle : « La machine déroulera n tours avant de commencer. »
- **Texte de l'écran Contrôle** : le même que L3 (« volume balayé … non vérifié »), et « Un cadrage fait à A = x° ne vaut que pour cet angle. »
- **Durée.** `null` pour tout programme avec A : `program-time.js:9-47` n'a pas de modèle d'accélération, et une indexation est surtout faite d'accélérations. Progression par lignes. Pas de durée « estimée ».
- **Suivi.** Position A (L1). Pour un programme avec A, « Avance réelle … mm/min » (`job-dashboard.js:239-242`) devient « Avance rapportée … » sans unité tant que T9 ne l'a pas qualifiée ; elle n'est jamais présentée comme une vitesse de surface. Tracé : « Aperçu sans la rotation A ».
- **Reprise à une ligne.** Refusée (L0).
- **Cadrage, palpages.** Permis à tout angle ; A connu et inchangé pendant la séquence (L2) ; l'angle est affiché et consigné avec le zéro.
- **Fichiers.** `program-check.js` (analyse modale de A, `rotaryRefusals`), `job-service.js` (préparation, `readyFor`), `program-time.js` (rien : la durée reste `null`), page `check-screen.js`, `program-check-view.js`, `job-dashboard.js`, `motion-estimate.js`, i18n.
- **Tests.** Jest : chaque ligne du tableau, une à une, refusée à la préparation **et** au départ, avec et sans dérogation de course ; un programme d'indexage valide part ; chaque condition de départ manquante ; hors course X Y Z dans un programme A : toujours `outside` ; programmes sans A : identiques. Simulateur : indexage de bout en bout, pause, reprise simple, arrêt, perte de A en cours.
- **Essai réel.** T9 à T11, puis un indexage de 4 faces fraise en l'air, puis sur bois tendre.
- **Non vérifiable sans machine.** Pause et arrêt sur une ligne A ; borne de la carte en cours de programme (`ALARM:2` critique, `FIRMWARE.md` § c) ; tenue sous effort de coupe.

### Dépendances

L0 seul. L1 après § 2.1. L2 après L1 et T8. L3 après L1 et T1 à T7. L4 après L1, **L2** et L3, T9 à T11.

## 4. Hypothèses, questions, risques, à ne pas faire

### Hypothèses

- H1. La 4e valeur est l'axe de la sortie « A ». *Observée à 0, jamais en mouvement (T1).*
- H2. `$103` en pas par degré, attendu 3,3333 × micropas d'après la fiche. *`$103=800` : non qualifié et très probablement inadapté (T0 à T3).*
- H3. `$J=… A…` et `G10 L20 P1 A0` acceptés. *T1, T8.*
- H4. `$H` ne touche pas A. *Inconnu (`$+`, T6).*
- H5. La carte borne A par `$133` quand `$20=1`. *Amont ; binaire non confirmé (T7).*
- H6. `G20` convertit les mots de tous les axes, `$13=1` leurs rapports. *Amont, liens d'Astra ; binaire non confirmé ; refusés dans tous les cas.*

### Questions pour l'opérateur

- **Q1. Micropas du pilote A** (micro-interrupteurs, T0) : (a) 1/8 ; (b) 1/16 ; (c) autre ; (d) illisible, on déduit de T1.
- **Q2. Si la carte borne A** (T7) : (a) je garde la borne ; (b) j'agrandis `$133` moi-même depuis le PC, après sauvegarde ; (c) je coupe `$20` (déconseillé : X Y Z perdent leur garde).
- **Q3. Si le mandrin est libre au repos** (T5) : (a) je règle la carte ou le pilote pour qu'il soit tenu, et on refait T5 ; (b) je n'usine pas avec A pour l'instant.
- **Q4. Hauteur libre** entre la table et le nez de broche, Z en haut, et la table est-elle mobile en Y ? *(Centre à 65 mm, dessus du mandrin à 115 mm, course Z de 130 mm : la place pour l'outil et la pièce au-dessus du centre est comptée.)*
- **Q5. Usage** : (a) indexer ; (b) usinage enroulé ; (c) les deux. *L4 ne couvre que (a).*

### Risques

1. **Échelle** : avec `$103=800`, tout ordre tourne 15 à 30 fois trop, et `$113=2000` vaudrait 80 à 170 tr/min au mandrin : décrochage ou projection. Pas de mouvement de plus de 0,1 unité avant T2.
2. **`$H` qui entraîne A** sans capteur : mandrin vide pour T6.
3. **Borne à 400°** rencontrée en programme : `ALARM:2`, la carte se réinitialise et perd sa position (`FIRMWARE.md` E3).
4. **Mandrin libre au repos** (`$1=25`) : la pièce tourne sous l'effort pendant l'usinage X Y Z.
5. **Volume balayé** : centre à 65 mm de la table, donc rayon libre sous l'axe inférieur à 65 mm ; mors ouverts au-delà de Ø 100 ; dessus du mandrin à 115 mm pour 130 mm de course Z : la broche peut heurter le mandrin en traversant X ou Y. Pièce longue, bridage, câbles, pince de palpage qui s'enroule. Touch ne voit rien de cela.
6. **Angle physique faux avec des nombres cohérents** : redémarrage, mandrin tourné à la main, pas perdus, mors desserrés. Le repérage de session le borne, ne l'exclut pas.
7. **Masse** : 10,8 kg sur la table ; si elle est mobile, l'accélération Y réglée pour une table vide est à revoir par l'opérateur.

### À ne PAS faire maintenant

- Écrire `$103`, `$113`, `$133`, `$1`, `$20` depuis Touch (l'opérateur, console, valeur donnée par nous).
- Ajouter A à `AXES`, généraliser à B, C.
- Lignes combinées, `G93`, usinage enroulé, vitesse de surface, rayon de pièce, tracé 3D enroulé.
- Durée des programmes A ; reprise à une ligne avec A ; `G92`.
- Modifier les zéros X Y Z existants ou le parseur de CNCjs.
- Coder L1 avant § 2.1, L2 et L3 avant T1 à T8, L4 avant le reste.

## 5. Ne rien changer à une machine à 3 axes : preuve

L'identité visée est **logicielle, à configuration comparable**. Brancher le moteur A ou changer `$1`, `$20`, `$133` peut changer le comportement réel de X Y Z : cela relève de l'essai, pas de ces tests.

1. **Référence figée** : master `95b773b6`. Chaque lot compare à ce commit.
2. **Réglage absent = code ancien** : toute branche nouvelle commence par l'état « configuré » ; `AXES` intact ; aucune différence hors de ces branches, sauf L0.
3. **Suite existante** : Jest et bancs `test-*.cjs` passent sans retouche de leurs attentes.
4. **Rejeux par le vrai parseur**, comparant les lignes écrites vers la carte, l'instantané envoyé à la page, **les décisions de départ, les refus et la chronologie des arrêts** :
   - réglage absent ou `false` : 3 valeurs ; 4 valeurs avec A = 0 ; 4 valeurs avec A **variable** ; résultat identique dans les trois cas ;
   - réglage vrai : 3 valeurs, 4→3→4, WCO 4→3, champ abîmé, péremption, bannière ;
   - perte de la preuve A pendant une confirmation, un jog, un palpage, un cadrage ;
   - séquences : pas, continu, zéro, cadrage, palpage plaque et bloc, départ, pause, arrêt (`__tests__/support/c1-bench.js`).
5. **Programmes** : fichiers X Y Z valides, inconnus et hors course, puis les mêmes avec A, B, C : verdict de course identique (L0) ; `corpus.test.js` inchangé.
6. **Page** : comparer le rendu et le comportement **visibles** des écrans Position, Déplacement, Zéro, Contrôle, Suivi, réglage absent (texte lu, éléments visibles, boutons actifs), pas le DOM brut : des éléments cachés s'ajoutent.
7. **Tablette** : L0 et L1 installés réglage absent ; essai X Y Z habituel refait avant de poser le réglage, puis après avoir branché le moteur A.

## 6. Ce qui n'a pas pu être établi

- Tout ce qui dépend de la carte moteur A branché (H1 à H6).
- Le micropas du pilote A, la hauteur libre sous la broche, le type de table.
- Le code amont n'a pas été relu par moi : les deux règles sur les pouces et celle de G28/G30 viennent des liens d'Astra ; aucune n'est confirmée pour le binaire du fabricant.
- `$20` vaut 0 dans le relevé du 13 novembre ; sa valeur actuelle n'a pas été lue.
- La place exacte du contrôle L4 dans `readyFor` (`job-service.js:1110-1113`) et la forme du ticket seront fixées à l'écriture du lot.
