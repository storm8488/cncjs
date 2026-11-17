# F2 — Remonter la fraise à la pause : conception (phase A)

Rédigé le 17 novembre 2026 pour le lot F2 de `PROMPT-FONCTIONS-6.md`. Base lue : arbre `cncjs-wt/F2`, branche `feat/F2`, commit `db584555`. **Aucun code n'est écrit par ce document.** Rien n'a été lancé sur la tablette, la RT ni la CNC ; aucune suite n'a été relancée (document seul).

Conventions : `s/x.js` = `src/server/services/touch/x.js` ; `GC.js` = `src/server/controllers/Grbl/GrblController.js` ; `touch/x.js` = `examples/cncjs-touch/touch/x.js` ; `sim` = `grbl-simulator/grbl-simulator.js`. Les numéros de ligne sont ceux de `db584555`. « R13 » = `bdring/Grbl_Esp32`, commit `1f2c8a37574386ed3cc5a79627a0d1a1bb96f9c5` (le même que `refonte/FIRMWARE.md`), fichiers relus pour ce document dans `Grbl_Esp32/src/`. Comme dans `FIRMWARE.md` : **R13 est le code amont, pas le binaire du fabricant** ; sept écarts du binaire sont déjà connus.

## 0. Verdict

**Faisable : oui, par la voie (a) « pause propre », avec des déplacements `$J=` relatifs en Z.** Aucune forme de commande nouvelle n'est demandée à la carte : la suite n'emploie que des lignes que le serveur écrit déjà aujourd'hui (`$J=G91 G21 …` des flèches, `M5`, `M3 S…`, `G4 P…`, `~`).

En cinq lignes :
1. « Pause et dégager… » cesse d'envoyer des lignes, **sans** retenue (`!`) : la machine finit les mouvements déjà envoyés et s'arrête d'elle-même au repos.
2. Repos prouvé : le serveur mémorise position, état de la machine et zéro pièce, monte Z en un déplacement relatif jusqu'à 5 mm sous le haut de course, puis arrête la broche.
3. « Reprendre… » : tout est revérifié, la broche repart, 3 s, la fraise redescend (vite jusqu'à 5 mm au-dessus, puis à 100 mm/min), tout est revérifié, puis l'envoi reprend à la ligne suivante.
4. X et Y ne bougent jamais ; l'état de la machine (unités, G90/G91, vitesse, repère) n'est jamais réécrit : il est **comparé**, et toute différence annule la reprise sur place.
5. Pause (immédiate) et Arrêter ne changent pas ; tout doute renvoie à « Arrêter l'usinage » puis « Reprendre à une ligne ».

Ce que la voie retenue ne fait pas : elle n'arrête pas la machine tout de suite. Entre le toucher et l'arrêt, la machine finit jusqu'à environ 120 octets de lignes reçues plus 15 ou 16 mouvements déjà planifiés (§ 1, P4). Sur de longues lignes droites cela peut durer des dizaines de secondes. L'écran le dit, et Pause reste à un toucher.

## 1. Les faits, avec leurs preuves

| # | Fait | Preuve |
|---|---|---|
| P1 | La pause actuelle = CNCjs retient son envoi **et** écrit `!`. | `GC.js:1451-1456` (`workflow.pause()` puis `this.write('!')`) ; `s/job-service.js:2372-2378`. |
| P2 | CNCjs sait déjà mettre un usinage en pause **sans** `!` : c'est la pause du fichier (M0, M1, M6). L'envoi s'arrête et la carte finit ce qu'elle a reçu ; pour M6, que CNCjs neutralise dans la ligne, elle passe au repos (`Idle`). | `GC.js:416-472` (`workflow.pause({data:'M6'…})`, aucun `!`) ; `GC.js:516-525` (`sender.hold`) ; `src/server/lib/Sender.js:165` (`while (!this.state.hold && …)` : rien ne part tant que l'envoi est retenu). |
| P3 | En pause, tant que des lignes du fichier attendent leur réponse, chaque `ok` est compté pour elles ; quand toutes ont répondu (`received === sent`), les `ok` vont aux lignes envoyées à part (feeder). En cours (`running`), **tous** les `ok` sont comptés pour le fichier. | `GC.js:595-633`. Conséquence déjà écrite dans `s/job-service.js:1823-1828` : une ligne à part envoyée trop tôt décale le compte du fichier. |
| P4 | Ce que la machine peut encore exécuter après l'arrêt de l'envoi : les lignes reçues et pas encore lues (CNCjs en garde 120 octets au plus en vol) et les mouvements planifiés (15 ou 16). | `GC.js:366-368` (`bufferSize: 128 − 8`) ; R13 `Planner.h:28-34` ; R13 `Serial.h:25-27` (256 octets côté carte). |
| P5 | Pendant une pause du fichier au repos, le serveur envoie déjà des lignes à part puis reprend : zéro Z à la plaque, relance de la broche (`M3 S…`, `G4 P3`, puis `gcode:resume`). | `s/plate-probe.js:98-152, 363-423` ; `s/job-service.js:1830-1863`. |
| P6 | Un `$J=` n'est exécuté qu'au repos (ou pendant un autre `$J=`) : sinon `error:8`. | R13 `ProcessSettings.cpp:94-98` et `:432` (`idleOrJog`), `Error.h:36`. |
| P7 | En `Hold`, la carte **ne lit plus aucune ligne** : sa boucle principale reste dans la suspension jusqu'à `~` ou une réinitialisation. Une ligne envoyée pendant la retenue reste sans réponse ; elle ne serait lue qu'après `~`, donc **derrière** les mouvements du fichier déjà planifiés. | R13 `Protocol.cpp:241-246` (`protocol_execute_realtime` → `protocol_exec_rt_suspend`), `:286-287` (commentaire amont), `:566-570` (boucle `while (sys.suspend.value)`), `:393-408` (seul `~` en sort), `MotionControl.cpp:52-93` (`mc_line` met en file). |
| P8 | Un `$J=` ne change aucun état de l'interpréteur (mode de mouvement, vitesse F, G90/G91, unités, repère, broche) ; seule la position suivie est mise à jour. Il impose G94 pour lui seul. | R13 `GCode.cpp:1276-1297`, `GCode.cpp:752-756`. Le simulateur fait de même : `sim:1486-1519`. |
| P9 | Un `$J=` hors course est refusé par `error:15`, **sans alarme** ; une ligne G0/G1 hors course lève `ALARM:2`, critique, et sur cette carte la référence est perdue. | R13 `Jog.cpp:35-39` ; `FIRMWARE.md` R3, E3 ; `sim:1521-1523`. |
| P10 | La broche et l'arrosage gardent leur état pendant un `$J=` ; la vitesse d'un `$J=` ne suit pas la correction de vitesse. | R13 `Jog.cpp:29-31`, `GCode.cpp:1289-1292`. Le simulateur, lui, applique la correction au jog (`sim:1538`) : écart, § 11.4. |
| P11 | Un `!` pendant un `$J=` l'annule (retour au repos, position resynchronisée) ; `0x85` aussi. | R13 `Protocol.cpp:292-301, 432-446`, `Serial.cpp:266-270` ; `sim:793-803, 830-834`. |
| P11 bis | Un `!` reçu au repos met la carte en `Hold` (suspension) : il faut `~` pour en sortir. | R13 `Protocol.cpp:305-308, 321-326, 393-408`. C'est pourquoi la reprise exige l'état `Idle` (§ 5.1, garde 3). |
| P12 | Le stationnement du firmware n'existe que dans l'état « porte » (`0x84` ou entrée câblée), jamais sur `!`. Il monte à **Z machine −5** sans contrôle de course, coupe la broche, et à la reprise relance la broche **sans délai garanti** puis replonge de 5 mm à 250 mm/min. | R13 `Config.h:555-572`, `Serial.cpp:263-265`, `Protocol.cpp:331-362, 531-745` (replongée `:682-695` ; délai de broche retiré `:668-670`), `MotionControl.cpp:459-482` (pas de `limits_soft_check`), `Defaults.h:194-203` (délais de broche 0 s par défaut), `Spindles/PWMSpindle.cpp:164-178`. |
| P13 | `[OPT:PHSW]` : la lettre `P` dit seulement que le code amont a été compilé avec le stationnement. | R13 `Report.cpp:538-540` ; `FIRMWARE.md` § 1.2. Rien d'observé sur la carte. |
| P14 | La forme `$J=G53 …` (coordonnées machine) n'est pas prouvée sur ce binaire. La forme `$J=G91 G21 <axe><distance> F<vitesse>` est celle des flèches de la tablette. | `refonte/PROTOCOLE-ESSAI.md` § 5, E-A (« à vérifier sur ce binaire, pas à supposer ») ; `s/motion.js:278`. |
| P15 | Arrêter depuis un repos, envoi vidé, broche arrêtée : aucun octet n'est écrit, la carte n'est pas réinitialisée. | `s/halt.js:33-52` (`haltPlan` rend `''`), `s/job-service.js:2455-2468`, `GC.js:1424-1446` (`gcode:stop` sans `force`). |
| P16 | Une reprise demandée ailleurs (`gcode:resume`, `cyclestart`, `~`) n'est pas une commande libre : elle passe par `socketRefusal` puis par la main. | `s/control.js:43-49`, `s/index.js:132-164`, `s/job-service.js:2715-2734`. |
| P17 | Le serveur refuse déjà, pendant une pause : flèches, zéros, prise d'origine, macros, chargement, relecture des réglages, vérification D2 avec écriture. | `s/motion.js:392-394` ; `s/job-service.js:858-868, 930-947, 1171-1184`. |

## 2. La voie retenue et les voies écartées

### 2.1 Retenue : (a) pause propre, puis `$J=` relatifs en Z

Pourquoi elle est sûre dans les deux cas (binaire conforme au code amont, ou non) :

- **Arrêt de l'envoi** : c'est le chemin de la pause du fichier, déjà en production (P2). Aucun octet nouveau.
- **Le repos est prouvé deux fois** : par le serveur (§ 4.1, conditions C1 à C5) et par la carte elle-même, qui refuse un `$J=` hors de l'état de repos (P6) et ne lit rien en retenue (P7). Si la preuve du serveur était fausse, le premier mouvement serait refusé ou laissé sans réponse (délai de ligne, § 6.2), pas exécuté de travers.
- **Le mouvement ajouté est un `$J=` relatif**, forme déjà employée par les flèches (P14). S'il sort de la course : `error:15`, pas d'alarme (P9) ; et de toute façon la cible est calculée à l'intérieur de la course utilisable.
- **L'état de la machine n'est pas reconstruit** : un `$J=` ne le change pas (P8). Le serveur le relit après chaque phase et le compare à ce qu'il a mémorisé. Si le binaire se comportait autrement que R13, la comparaison échouerait et la reprise sur place serait refusée : sûr dans les deux cas.
- **X et Y ne bougent pas.** La seule trajectoire ajoutée est la verticale au-dessus du point d'arrêt, que la fraise vient de parcourir vers le haut.
- **Arrêter depuis la position dégagée ne réinitialise pas la carte** (P15) : la référence est gardée, « Reprendre à une ligne » reste possible sans nouvelle prise d'origine. C'est un gain par rapport à l'Arrêter en plein usinage.

Ses limites, assumées et affichées : l'arrêt n'est pas immédiat (P4) ; pendant la détection du repos (environ 1 s) la fraise tourne sur place dans la matière.

### 2.2 Écartées

| Voie | Pourquoi |
|---|---|
| **(b) Stationnement du firmware** (`0x84`, puis `~`) | Rien n'est prouvé sur la carte (P13) et le binaire s'écarte déjà sept fois du code amont. Dans le code amont lui-même : la montée va à Z machine −5 **sans contrôle de course** ; la replongée se fait broche tout juste relancée, délai nul par défaut et réglage étendu inconnu sur cette carte (P12) ; la sortie de l'état « porte » dépend d'une entrée dont on ignore le câblage et l'inversion sur ce binaire (R13 `System.cpp:154-160, 190-240`) : si la carte croit la porte ouverte, la seule sortie est une réinitialisation, donc référence perdue. CNCjs ne connaît pas cet état : son envoi continue derrière. À qualifier un jour par un essai à part, fraise en l'air (§ 14.6) ; pas dans ce lot. |
| **Retenue `!` puis mouvement** | Impossible : en `Hold` la carte ne lit plus rien (P7) ; un `$J=` ou un G0 envoyé alors ne serait traité qu'après `~`, c'est-à-dire usinage relancé : le `$J=` refusé (P6), le G0 exécuté derrière les mouvements du fichier. |
| **Retenue `!` puis réinitialisation, puis mouvement** | C'est Arrêter : sur cette carte, redémarrage, position et référence perdues (`FIRMWARE.md` E3). |
| **Pause propre puis `G53 G0 Z…` ou `G53 G1 Z… F…`** | Change le mode de mouvement et la vitesse mémorisés du fichier (à reconstruire à la main : source d'incertitude) ; une cible fausse lève `ALARM:2` critique au lieu d'`error:15` (P9). |
| **Pause propre puis `$J=G53 G90 Z…`** | Meilleure cible (absolue), mais forme non prouvée sur ce binaire (P14). La forme relative donne la même cible à partir d'une position au repos lue deux fois. |
| **Un réglage « Pause dégage toujours »** | Deux comportements pour le même bouton rouge du bandeau, dont un qui n'arrête pas tout de suite : remplacement silencieux, interdit par le prompt. Pause reste la retenue immédiate. |
| **Ne monter que de quelques millimètres** | La hauteur utile dépend de la pièce et des brides, que le serveur ne connaît pas. Le haut de course est la seule hauteur sûre sans hypothèse, et elle est en coordonnées machine. |
| **Finir la montée quand le suivi est perdu** | Physiquement défendable (mouvement vers le haut), mais contraire à la règle des séquences surveillées (palpages, cadrage) : sans suivi, plus de mouvement. Retenu : annuler le déplacement, puis arrêter la broche (§ 7). |
| **(c) Ne rien faire** | Inutile : (a) n'ajoute que des formes de commande déjà en service et échoue sans mouvement quand un point n'est pas prouvé. |

## 3. Vocabulaire et états

Mot nouveau du glossaire : **dégager la fraise** (EN *retract the bit*, ES *retirar la fresa*). Bouton : « Pause et dégager… » / “Pause and retract…” / «Pausa y retirar…». Jamais hors de « Détails » : stationnement, parking, remontée, jog, tampon.

État du serveur : `r.retract` (nul hors de la fonction), publié dans l'instantané sous `pauseRetract` (§ 9). Phases :

| Phase | Ce qui est vrai |
|---|---|
| `draining` | L'envoi est retenu, la machine finit ce qu'elle a reçu. F2 n'a rien écrit. Drapeau `lift` : vrai tant que la montée est encore voulue et surveillée. |
| `lifting` | Repos prouvé, état mémorisé ; la montée puis l'arrêt de la broche sont en cours. |
| `parked` | Fraise en haut, broche arrêtée, tout vérifié. Seule phase d'où part la reprise avec redescente. |
| `held` | Repos prouvé, état mémorisé, **F2 n'a écrit aucune ligne** (montée annulée avant le premier octet, ou `$J=` de montée refusé par la carte). La fraise est dans la pièce, la broche tourne : c'est une pause au repos. Reprise simple possible. |
| `returning` | Reprise en cours : broche, attente, redescente, vérifications. |
| `failed` | La reprise sur place n'est plus permise. Seule sortie : Arrêter l'usinage. Porte `failure {code, params, message}`. |

`r.retract` redevient nul : à la reprise réussie, à tout arrêt du travail (`workflow` `stop`, `s/job-service.js:690-701`), au chargement d'un fichier, et quand une retenue `!` transforme la phase `draining` en pause ordinaire (§ 7).

## 4. « Pause et dégager » : ce qui est écrit sur le port, dans l'ordre

Nouvelle action gardée `retract`, en deux temps comme toute commande qui met la machine en mouvement : `prepare {operation: 'retract', revision}` rend un numéro à usage unique (15 s, lié au flux, `s/job-service.js:2154-2226`), puis `retract {nonce}`. La réponse au second temps est immédiate (« Dégagement demandé. ») ; la suite se lit dans l'instantané.

### 4.1 Étape 0 — retenir l'envoi (aucun octet)

Après les gardes du § 6.1, refaites au second temps :
1. journal : `{event: 'retract', stage: 'requested', line, …}` (la ligne du fichier atteinte, `stopLine`, `s/job-service.js:240-247`) — écrit **avant** de retenir l'envoi, pour qu'un redémarrage de CNCjs laisse la ligne dans le Journal ;
2. `c.workflow.pause()` **sans argument** (donc `holdReason` vide, comme une pause de l'opérateur : `pauseKind` rend `null`, `s/job-service.js:887-896`). Aucun `!`. `r.retract = {phase: 'draining', lift: true, …}`.

On attend ensuite le **repos prouvé**, toutes conditions vraies ensemble :
- C1. `c.workflow.state === 'paused'` et `c.sender.state.hold === true` ;
- C2. `c.sender.state.received === c.sender.state.sent` (toute ligne envoyée a sa réponse ; un `G4` du fichier ne répond qu'à sa fin) ;
- C3. feeder vide (`queue` 0, `pending` faux) ;
- C4. deux rapports d'état reçus **après** l'instant où C2 est devenu vrai, tous deux `Idle`, le dernier vieux de moins de 2,5 s (même règle que `quiet`, `s/plate-probe.js:252-288`) ;
- C5. X, Y, Z machine identiques dans ces deux rapports (écart ≤ 0,001 mm).

Pas de durée maximale pour cette attente (elle dépend du fichier), mais elle est surveillée (§ 6.2), et abandonnée si la machine est au repos avec des lignes sans réponse depuis 30 s (`STALL_MS`, `s/job-service.js:56`) : `ETOUCH_RETRACT_STALLED`, phase `failed` (repos non prouvable).

### 4.2 Étape 1 — mémoriser (aucun octet propre à F2)

CNCjs écrit de lui-même `$G` toutes les 500 ms et `?` toutes les 250 ms (`GC.js:873-942`). On attend un `[GC:…]` reçu **après** le repos prouvé (3 s au plus, sinon `ETOUCH_RETRACT_MODAL`, phase `failed`). On mémorise alors `mem` :
- `mpos {x, y, z}` (du dernier des deux rapports), `restReport` (compteur `r.reports` à cet instant), `startups`, propriétaire de la main, révision du fichier, `sent` ;
- `modal` : `motion`, `wcs`, `plane`, `units`, `distance`, `feedrate` (G93/G94), `program`, `spindle` (M3/M4/M5), `coolant`, plus `tool`, `F`, `S` (`src/server/controllers/Grbl/GrblLineParserResultParserState.js:60-99`) ;
- `wco` : le premier `WCO:` explicite reçu après `restReport` (il arrive un rapport sur dix ; on ne l'attend pas pour monter, on l'exige à la reprise, § 5.1).

Puis les gardes du § 6.3 (course). Si la montée n'est plus voulue (`lift` faux) ou qu'un garde échoue : phase `held`, rien n'est écrit.

### 4.3 Étape 2 — monter

Calcul : `zSafe = haut de la course utilisable en Z − 5 mm` (`usableOf(limitsAt(…).limits).high − 5`, `s/motion.js:230-263` ; la même hauteur que le cadrage à vide de F1 ; sur la LUNYEE apprise : **Z machine −5,000**, soit 7 mm sous le capteur d’après les notes citées par F1) ; `d = arrondi au millième (zSafe − mem.mpos.z)` ; vitesse `f = min(600, $112)` mm/min (`maxFeedOf`, `s/motion.js:272-276`).

| # | Octets écrits | Ce qu'on attend avant la suite | Délai de la ligne |
|---|---|---|---|
| L1 | `$J=G91 G21 Z<d> F<f>\n` — sautée si `d < 0,01` (fraise déjà en haut) | `ok` de cette ligne ; puis deux rapports après l'`ok`, `Idle` ; Z machine = `zSafe` ± 0,01 ; X et Y = `mem` ± 0,01 | `60000·d/f × k + 15 s`, `k = max(1, 100 / correction de vitesse)` si elle est connue, sinon 10 (P10) |
| L2 | `M5\n` — sautée si `mem.modal.spindle === 'M5'` | `ok` ; deux rapports `Idle` après l'`ok` ; vitesse de broche rapportée 0 (`FS:`), ou à défaut `M5` dans un `[GC:…]` reçu après l'`ok` | 15 s |

Exemple LUNYEE, arrêt à Z machine −118,400 : `$J=G91 G21 Z113.4 F600` (11,3 s), puis `M5`.

Après L2 : `{event: 'retract', stage: 'parked', line, from: mem.mpos.z, to: zSafe}` au journal ; phase `parked`.

Une ligne à la fois, par le feeder de CNCjs (`c.command('gcode', line)`), comme les palpages. Avant chaque écriture, la fonction revérifie à l'instant même (« ensure », modèle `s/block-probe.js:682-692`) toute la surveillance du § 6.2 **et** : état `Idle`, C1 à C3 toujours vrais, même révision du fichier. Seules les lignes de la forme suivante peuvent partir, sinon la séquence s'arrête : `^(M5|M[34] S\d+(\.\d+)?|G4 P3|\$J=G91 G21 Z-?\d+(\.\d+)? F\d+(\.\d+)?)$`.

## 5. « Reprendre… » : ce qui est écrit sur le port, dans l'ordre

La reprise garde son action et son dialogue : `prepare {operation: 'resume'}` puis `resume {nonce}` (`s/job-service.js:2292-2312`). Dans `readyFor(c, 'resume')` (`s/job-service.js:1033-1076`), une branche F2 remplace, **seulement** quand `r.retract` est en phase `parked` ou `held` et que la machine est au repos, le refus final « La reprise exige une pause simple confirmée par la machine. » ; les refus placés avant (travail lancé ailleurs, pause sur erreur, carte redémarrée, palpage échoué) restent premiers.

### 5.1 Gardes de la reprise

Tous sont vérifiés au premier temps et refaits au second, avant le premier octet. Les gardes 1 à 3 et 7 sont refaits avant chaque ligne ; après le premier octet, les positions attendues sont celles du tableau du § 5.2.

1. `available(c)` (connexion, rapport de moins de 2,5 s, pas de commande système, pas de transaction D2) ; la main ; un flux ouvert de l'appareil ; pas d'automatismes.
2. Phase `parked` ou `held` ; `startups` inchangé ; aucune alarme depuis `mem` ; même révision du fichier ; `sender.sent` inchangé ; C1 à C3.
3. État `Idle` sur un rapport récent. Autre état (par exemple `Hold` après un `!` venu du Wi-Fi de la carte) : `ETOUCH_RETRACT_STATE`, la phase ne change pas.
4. Position : X et Y machine = `mem` ± 0,01 ; Z = la hauteur atteinte à la fin du dégagement ± 0,01 (`parked` : `zSafe`, ou `mem.mpos.z` si la montée a été sautée ; `held` : `mem.mpos.z`). Sinon `ETOUCH_RETRACT_MOVED`, phase `failed`.
5. Zéro pièce : un `WCO:` explicite existe après `mem.restReport` (attente de 5 s au plus au début de la séquence, sinon `ETOUCH_RETRACT_ZERO_CHANGED`) et le dernier `WCO:` reçu est égal à `mem.wco` à 0,0025 mm près (tolérance de D2, `s/work-offset.js:29`). Sinon `ETOUCH_RETRACT_ZERO_CHANGED`, phase `failed`.
6. État de la machine : un `[GC:…]` de moins de 2,5 s égal à `mem.modal` champ par champ, sauf `spindle` qui doit valoir `M5` en `parked` (ou `mem.modal.spindle` en `held`). Sinon `ETOUCH_RETRACT_STATE_CHANGED`, phase `failed`.
7. Type de machine CNC et `$32=0` toujours vrais ; `$13=0`.

### 5.2 Depuis `parked`

`a = 5 mm` (approche lente), `d` = la montée faite au § 4.3.

| # | Octets écrits | Ce qu'on attend avant la suite | Délai |
|---|---|---|---|
| R1 | `<M3 ou M4> S<mem.modal.S>\n` — sautée si la broche était arrêtée avant la pause | `ok` | 15 s |
| R2 | `G4 P3\n` — sautée avec R1 | `ok` (à la fin des 3 s) ; deux rapports `Idle` après l'`ok` ; vitesse de broche rapportée > 0 (`FS:`), ou à défaut M3/M4 dans un `[GC:…]` reçu après l'`ok`. Sinon `ETOUCH_RETRACT_SPINDLE` : on ne descend pas. | 3 s + 15 s |
| R3 | `$J=G91 G21 Z-<d − a> F<f>\n` — sautée si `d ≤ a` | `ok` ; deux rapports `Idle` ; Z = `mem.mpos.z + a` ± 0,01 ; X, Y = `mem` ± 0,01 | comme L1 |
| R4 | `$J=G91 G21 Z-<min(d, a)> F100\n` — sautée si `d < 0,01` | `ok` ; deux rapports `Idle` ; X, Y, Z = `mem.mpos` ± 0,01 | comme L1 |
| R5 | aucun | un `[GC:…]` reçu **après** l'`ok` de R4 (3 s au plus), égal à `mem.modal` **en entier**, broche comprise ; dernier `WCO:` = `mem.wco` ; C1 à C3 ; `Idle` | 3 s |
| R6 | `~` puis les lignes du fichier, par CNCjs : `c.command('gcode:resume')` (`GC.js:1461-1466, 526-535`) | — | — |

Exemple LUNYEE (suite du § 4.3) : `M3 S18000`, `G4 P3`, `$J=G91 G21 Z-108.4 F600`, `$J=G91 G21 Z-5 F100`, puis `~`.

Notes :
- Les deux descentes font exactement `d` : `(d − a) + a`, en millièmes. L'interpréteur de la carte retrouve sa position d'avant la pause à l'erreur d'arrondi près (de l'ordre de 0,00002 mm), très en dessous de la tolérance des arcs.
- La broche repart **avant** toute descente ; entre son départ et le retour dans la matière il s'écoule les 3 s de `G4`, la descente rapide (plusieurs secondes sur cette machine) et les 3 s de la descente lente. La valeur 3 s est celle des deux reprises existantes (`s/job-service.js:59`, `s/resume.js:16`) ; `FS:` n'est pas un compte-tours : le temps réel de mise en vitesse se mesure à l'essai (§ 14.4).
- Après R6 : `{event: 'retract', stage: 'resumed'}` et l'événement `resume` habituel ; `r.retract = null`.

### 5.3 Depuis `held`

Aucun octet de F2 : gardes du § 5.1, puis R6 seul. C'est la reprise d'une pause au repos, comme pour M0.

## 6. Les gardes

### 6.1 Avant (bouton rayé tant qu'un garde échoue ; refaits aux deux temps)

| Garde | Refus |
|---|---|
| Connexion, rapport récent, pas de commande système ni de transaction D2 (`available`), identité du contrôleur, flux ouvert, la main (`control.authorize`), pas d'automatismes CNCjs | refus existants |
| Déplacements réels activés et Grbl ≥ 1.1 (`capabilitiesOf(...).jog.enabled`, `s/motion.js:129-150`) | `ETOUCH_MOTION_DISABLED` (existant) |
| Machine déclarée CNC et `$32=0` | `ETOUCH_RETRACT_LASER` |
| Travail lancé **par la tablette** (`j.started && !j.external`), `workflow` `running`, état `Run` ou `Idle` sur un rapport récent, fichier chargé inchangé (`validJob`), aucune ligne refusée (`j.errors`), carte non redémarrée | `ETOUCH_RETRACT_NOT_RUNNING` |
| Il reste des lignes à envoyer : `sender.hold` faux et `sent < total` | `ETOUCH_RETRACT_ENDING` |
| Course Z vérifiable : `$13=0`, machine référencée vue par le serveur (`r.homed`), `limitsAt` rend des bornes pour Z et la position n'est pas hors course | `ETOUCH_RETRACT_TRAVEL_UNKNOWN` |
| Pas de palpage, de prise d'origine, de chargement en cours (impossible pendant un usinage, vérifié quand même) | refus existants |

D2 n'est pas exigé : rien ne se fait en coordonnées de travail. Le zéro pièce est seulement comparé à lui-même (§ 5.1).

### 6.2 Pendant (toutes les 100 ms et avant chaque écriture ; même ordre que `s/block-probe.js:638-661`)

1. carte redémarrée (`r.startups` changé) → `ETOUCH_RETRACT_RESTART` ;
2. alarme (`ALARM:n` ou état `Alarm`) → `ETOUCH_RETRACT_ALARM` ;
3. flux de l'appareil qui a confirmé : fermé pour de bon → tout de suite ; absent (rotation) depuis 3 s → `ETOUCH_RETRACT_STREAM` ;
4. la main n'est plus à cet appareil (reprise, libération, expiration) → `ETOUCH_RETRACT_CONTROL` ; vérifié aussi dans le pas synchrone de `control release/takeover` (`s/job-service.js:2059-2077`) ;
5. dernier rapport vieux de plus de 2,5 s → `ETOUCH_RETRACT_STALE` ;
6. délai de la ligne dépassé → `ETOUCH_RETRACT_TIMEOUT` ;
7. ligne refusée par la carte (`error:n`) → `ETOUCH_RETRACT_ERROR` ;
8. position inattendue après un mouvement → `ETOUCH_RETRACT_POSITION`.

En phase `parked`, une veille à 1 s garde les points 1, 2 et 4 (et rien d'autre : un flux absent ou un rapport ancien n'invalide pas une fraise à l'arrêt en haut).

### 6.3 Course de chaque mouvement ajouté

Au repos prouvé, avant L1, avec `envelopeOf` / `limitsAt` / `usableOf` (`s/motion.js:176-263`) :
- `mem.mpos.z` dans la course utilisable de Z (LUNYEE : de −129,5 à 0). Sinon `ETOUCH_RETRACT_TRAVEL` : on ne monte pas (phase `held`), car on ne pourrait pas garantir le retour ;
- cible de L1 = `zSafe`, à 5 mm sous la borne haute, donc dans la course ;
- cibles de R3 et R4 : entre `mem.mpos.z` et `zSafe`, donc dans la course vérifiée ci-dessus ;
- aucun mouvement en X ni en Y.

`$20=1` n'est **pas** exigé : les cibles sont calculées par le serveur dans la course qu'il a apprise, et les trois mouvements restent sur la verticale que la fraise occupait déjà ou vers la hauteur où la prise d'origine la laisse. Mais sans `$20=1`, le refus `error:15` de la carte (P9) n'existe pas : il ne reste que le calcul du serveur et les fins de course matérielles. La conception F1 signale que `$20` a peut-être été lu à 0 le 16 novembre (sa note C11, hors dépôt) : à relire sur la carte avant l'essai (§ 14.1).

## 7. Chaque événement et la réaction

« annuler le déplacement » = `0x85`, répété tant qu'un rapport plus récent dit encore `Jog` (modèle `s/motion.js:556-626`). « arrêt broche » = après une annulation, si deux rapports récents disent `Idle`, même session, sans alarme : une ligne `M5` ; sinon rien de plus.

| Événement | `draining` | `lifting` / `returning` | `parked` | `held` / `failed` |
|---|---|---|---|---|
| **Arrêter** (tablette, tout appareil) | `r.retract` effacé, puis l'Arrêter actuel, inchangé (`!`, puis réinitialisation au repos, `s/halt.js`). | Séquence annulée ; plan d'arrêt forcé à « retenue » si une ligne de F2 est en vol (comme `s/plate-probe.js:497-507`) : `!` (qui annule le déplacement, P11), `feeder:stop`, `gcode:stop`, réinitialisation une fois au repos. Jamais de réinitialisation en mouvement. | Chemin actuel, inchangé : **aucun octet écrit**, travail arrêté, ligne retenue pour « Reprendre à une ligne » (P15). | Chemin actuel, inchangé (broche en marche au repos : réinitialisation, comme aujourd'hui dans une pause du fichier). |
| **Pause** (retenue immédiate) | `r.retract` effacé ; `!` (`c.command('feedhold')`) ; réponse « Pause demandée. Attendre l'état Hold. ». On est alors dans la pause ordinaire, reprise ordinaire par `~`. | Annuler le déplacement, arrêt broche, `failed` (`ETOUCH_RETRACT_PAUSED`). | Refus actuel « Aucun travail en cours. » (`canPause` faux). | Refus actuel. |
| **Arrêt broche**, **arrêt de flèche** (`spindleStop`, `jog-stop`) | Refus actuels. | Comme Pause. | Refus actuels. | Refus actuels. |
| **Flux perdu** | `lift` devient faux (`ETOUCH_RETRACT_STREAM`) ; au repos prouvé : `held`. Rien n'est écrit. | Annuler le déplacement, arrêt broche, `failed`. | Rien. La reprise exigera un flux. Si l'absence dépasse 60 s, la main expire (`s/control.js:18`) : ligne suivante. | Rien. |
| **Main perdue** | `lift` faux (`ETOUCH_RETRACT_CONTROL`) ; `held` au repos. | Annuler le déplacement, arrêt broche, `failed`. | `failed` (`ETOUCH_RETRACT_CONTROL`) : la reprise sur place est annulée. | `held` reste `held` (aucun mouvement de F2 n'en dépend) ; la reprise exigera la main. |
| **Alarme** | `failed` (`ETOUCH_RETRACT_ALARM`). Rien n'est écrit (le feeder de CNCjs jette tout en alarme, `GC.js:343-347`). La suite est la remise en route actuelle. | idem | idem | idem |
| **Redémarrage de la carte** (bannière) | `failed` (`ETOUCH_RETRACT_RESTART`), dans l'événement même ; aucune ligne dans la nouvelle session, aucun ancien `ok` ne compte (comme D-06). `job.boardRestarted` refuse déjà la reprise (`s/job-service.js:540-546, 1049-1051`). | idem | idem | idem |
| **Redémarrage de CNCjs** (ou port fermé, câble) | Tout est oublié. La carte finit ce qu'elle a reçu puis s'arrête dans la matière, broche en marche — comme aujourd'hui quand CNCjs tombe en plein usinage. | Le `$J=` en cours va à son terme (il est borné) ; broche dans l'état où elle était. | Fraise en haut, broche arrêtée : état sûr. | — |
| | Au retour de CNCjs : aucun travail, référence inconnue. L'écran actuel demande la prise d'origine et, si la broche tourne, « Arrêter la broche ». La ligne atteinte est dans le Journal (`retract`, `requested`). Reprise par « Reprendre à une ligne ». | | | |
| **Client tiers, commande qui agit** (`gcode:resume`, `cyclestart`, `~`, G-code, flèches, macro… par Socket.IO) | Refusée par `socketRefusal` tant que `r.retract` existe, quelle que soit la phase et quel que soit le détenteur de la main : « Fraise dégagée par la tablette : commande refusée jusqu'à la reprise (Arrêter reste possible). » | idem | idem | idem |
| **Client tiers, arrêt** (`!`, `feedhold`, `gcode:pause`, `gcode:stop`, `reset`, `0x18`, `feeder:stop`) | `socketStop` : `r.retract` effacé, puis la commande suit son chemin (un `!` donne la pause ordinaire). | `socketStop` : séquence annulée, `0x85`, `failed` (`ETOUCH_RETRACT_FOREIGN`) si le travail n'est pas arrêté par la commande. | `failed` (`ETOUCH_RETRACT_FOREIGN`) si le travail continue d'exister. | inchangé |
| **Client direct sur le Wi-Fi de la carte** (hors CNCjs, `FIRMWARE.md` R12) | Invisible pour le serveur. Ce qu'il change est rattrapé par les comparaisons du § 5.1 (position, zéro pièce, état) et par R5 ; un mouvement fait puis défait exactement ne se voit pas. Limite écrite au § 13. | | | |
| **Rapport périmé** | `lift` faux (`ETOUCH_RETRACT_STALE`) ; `held` quand les rapports reviennent et prouvent le repos. | Annuler le déplacement (à l'aveugle), puis arrêt broche seulement si des rapports récents reviennent sous 5 s ; `failed`. | Rien ; la reprise exige un rapport récent. | Rien. |
| **État inattendu** (`Hold`, `Door`) | `Hold` ou `Door` vu : `r.retract` effacé (pause ordinaire ; règles actuelles). | `failed` (`ETOUCH_RETRACT_POSITION` ou `_TIMEOUT` selon le cas). | Reprise refusée `ETOUCH_RETRACT_STATE`. | — |
| **`$J=` de montée refusé** (`error:n`) | — | Rien n'a bougé : `held` (`ETOUCH_RETRACT_ERROR`). | — | — |
| **Autre ligne de F2 refusée** | — | Arrêt broche si possible ; `failed` (`ETOUCH_RETRACT_ERROR`). | — | — |
| **Ligne du fichier refusée pendant l'attente** | CNCjs ne compte pas cette réponse en pause (`GC.js:635-685`) : `received` reste sous `sent`, le repos n'est jamais prouvé ; `failed` (`ETOUCH_RETRACT_STALLED`) après 30 s. | — | — | — |
| **Service arrêté, contrôleur retiré** | Rien. | Un `0x85`, sans minuterie (comme `s/motion.js:1192-1211`). | Rien. | Rien. |

## 8. Codes de refus

Tous dans `s/pause-retract.js` (`RETRACT_MESSAGES`), publiés avec `code` et `params`. Chaque code a sa ligne dans `window.CNCTouchCodes` (phrase du serveur, visible dans « Détails ») et sa famille dans `window.CNCTouchRefus`.

### 8.1 Phrases du serveur (FR = texte exact du serveur ; EN, ES = lignes du catalogue)

| Code (`ETOUCH_RETRACT_…`) | FR | EN | ES |
|---|---|---|---|
| `NOT_RUNNING` | Dégagement refusé : aucun usinage en cours lancé depuis cette tablette. | Retract refused: no machining in progress started from this tablet. | Retirada rechazada: ningún mecanizado en curso iniciado desde esta tableta. |
| `ENDING` | Dégagement refusé : toutes les lignes sont déjà envoyées, l’usinage se termine. | Retract refused: every line has been sent, machining is ending. | Retirada rechazada: todas las líneas están enviadas, el mecanizado termina. |
| `LASER` | Dégagement refusé : fonction réservée à une machine CNC, hors mode laser. | Retract refused: only for a CNC machine, laser mode off. | Retirada rechazada: solo para una máquina CNC, sin modo láser. |
| `TRAVEL_UNKNOWN` | Dégagement refusé : la course en Z n’est pas vérifiable (prise d’origine non constatée, réglages non lus ou rapports en pouces). | Retract refused: the Z travel cannot be checked (homing not seen, settings not read or reports in inches). | Retirada rechazada: el recorrido en Z no se puede comprobar (origen no visto, ajustes no leídos o informes en pulgadas). |
| `TRAVEL` | Dégagement annulé : Z machine {z} hors de la course utilisable ({low} à {high}). | Retract cancelled: machine Z {z} outside the usable travel ({low} to {high}). | Retirada cancelada: Z máquina {z} fuera del recorrido útil ({low} a {high}). |
| `STREAM` | Dégagement arrêté : la tablette qui l’a demandé ne suit plus la machine. | Retract stopped: the tablet that asked for it no longer follows the machine. | Retirada detenida: la tableta que la pidió ya no sigue la máquina. |
| `CONTROL` | Dégagement arrêté : le pilotage a changé de main. | Retract stopped: control changed hands. | Retirada detenida: el control cambió de manos. |
| `STALE` | Dégagement arrêté : rapports de la machine interrompus plus de 2,5 s. | Retract stopped: machine reports interrupted for more than 2.5 s. | Retirada detenida: informes de la máquina interrumpidos más de 2,5 s. |
| `STALLED` | Dégagement arrêté : la machine est au repos mais des lignes restent sans réponse. | Retract stopped: the machine is at rest but some lines were never answered. | Retirada detenida: la máquina está en reposo pero quedan líneas sin respuesta. |
| `MODAL` | Dégagement arrêté : état de la machine ($G) non reçu après l’arrêt. | Retract stopped: machine state ($G) not received after the stop. | Retirada detenida: estado de la máquina ($G) no recibido tras la parada. |
| `FOREIGN` | Dégagement arrêté : un arrêt est venu d’une autre interface. | Retract stopped: a stop came from another interface. | Retirada detenida: llegó una parada desde otra interfaz. |
| `ERROR` | Grbl a refusé une ligne du dégagement (error:{error}). | Grbl refused a line of the retract (error:{error}). | Grbl rechazó una línea de la retirada (error:{error}). |
| `TIMEOUT` | Dégagement arrêté : une ligne n’a pas fini à temps. | Retract stopped: a line did not finish in time. | Retirada detenida: una línea no terminó a tiempo. |
| `POSITION` | Dégagement arrêté : position {axis} inattendue après un mouvement. | Retract stopped: unexpected {axis} position after a move. | Retirada detenida: posición {axis} inesperada tras un movimiento. |
| `SPINDLE` | Reprise arrêtée : la broche n’a pas redémarré, la fraise n’est pas redescendue. | Resume stopped: the spindle did not restart, the bit was not lowered. | Reanudación detenida: el husillo no arrancó, la fresa no bajó. |
| `PAUSED` | Dégagement interrompu par Pause. | Retract interrupted by Pause. | Retirada interrumpida por Pausa. |
| `STATE` | Reprise refusée : la machine n’est pas au repos (état {state}). | Resume refused: the machine is not at rest (state {state}). | Reanudación rechazada: la máquina no está en reposo (estado {state}). |
| `MOVED` | Reprise sur place annulée : la machine a bougé pendant la pause ({axis}). | In-place resume cancelled: the machine moved during the pause ({axis}). | Reanudación en el sitio cancelada: la máquina se movió durante la pausa ({axis}). |
| `ZERO_CHANGED` | Reprise sur place annulée : l’origine de la pièce a changé ou n’est plus confirmée ({axis}). | In-place resume cancelled: the work origin changed or is no longer confirmed ({axis}). | Reanudación en el sitio cancelada: el origen de la pieza cambió o ya no está confirmado ({axis}). |
| `STATE_CHANGED` | Reprise sur place annulée : l’état de la machine a changé pendant la pause ({field}). | In-place resume cancelled: the machine state changed during the pause ({field}). | Reanudación en el sitio cancelada: el estado de la máquina cambió durante la pausa ({field}). |
| `ALARM` | Alarme[ {alarm}] pendant le dégagement. | Alarm[ {alarm}] during the retract. | Alarma[ {alarm}] durante la retirada. |
| `RESTART` | La carte a redémarré pendant le dégagement. | The board restarted during the retract. | La placa se reinició durante la retirada. |

Phrase de `socketRefusal` (affichée par l'interface CNCjs du PC, sans code, comme `SOCKET_PROBE_BUSY`) : « Fraise dégagée par la tablette : commande refusée jusqu’à la reprise (Arrêter reste possible). »

### 8.2 Familles, phrases de l'opérateur et remèdes (`touch/i18n-messages-refus.js`, ajoutées en fin de table)

| Famille | Codes | FR | EN | ES | Remède |
|---|---|---|---|---|---|
| `degagement-impossible` | `NOT_RUNNING`, `ENDING`, `TRAVEL_UNKNOWN`, `TRAVEL` | Le dégagement n’est pas possible maintenant. | Retract is not possible right now. | La retirada no es posible ahora. | `details` |
| `type-machine` (existante) | `LASER` | (phrase de la famille) | | | Type de machine… |
| `degagement-suivi` | `STREAM`, `STALE` | La tablette a perdu la machine un instant pendant le dégagement. | The tablet lost the machine for a moment during the retract. | La tableta perdió la máquina un instante durante la retirada. | `details` |
| `degagement-main` | `CONTROL` | La main a changé d’appareil pendant le dégagement. | Control moved to another device during the retract. | El control pasó a otro dispositivo durante la retirada. | `details` |
| `degagement-machine` | `STALLED`, `MODAL`, `ERROR`, `TIMEOUT`, `POSITION` | La machine n’a pas fait ce qui était demandé pendant le dégagement. | The machine did not do what was asked during the retract. | La máquina no hizo lo pedido durante la retirada. | `details` |
| `degagement-broche` | `SPINDLE` | La broche n’a pas redémarré : la fraise est restée en haut. | The spindle did not restart: the bit stayed up. | El husillo no arrancó: la fresa se quedó arriba. | `details` |
| `degagement-change` | `STATE`, `MOVED`, `ZERO_CHANGED`, `STATE_CHANGED`, `FOREIGN` | Quelque chose a changé pendant la pause : reprendre sur place n’est plus sûr. | Something changed during the pause: resuming in place is no longer safe. | Algo cambió durante la pausa: reanudar en el sitio ya no es seguro. | `details` |
| `degagement-pause` | `PAUSED` | Dégagement interrompu par Pause. | Retract interrupted by Pause. | Retirada interrumpida por Pausa. | `details` |
| `alarme` (existante) | `ALARM`, `RESTART` | (phrase de la famille) | | | Remise en route |

Le remède réel est l'action principale de l'écran, fixée par la phase (§ 10) : « Reprendre… » en `held`, « Arrêter l'usinage » en `failed`. Aucun remède nouveau dans la liste fermée de `SPEC-REFONTE.md` § 6.1.

## 9. Champs de l'instantané

Ajouts à `snapshot(c)` (`s/job-service.js:1590-1772`), tous présents à chaque paquet :

| Champ | Valeur |
|---|---|
| `canRetract`, `retractReason` | comme `canZeroZ` / `zeroZReason` ; le refus codé est dans `refusals.retract`. |
| `pauseRetract` | `null`, ou `{phase, step, since, line, pending, lift, spindle, failure, owner}`. |
| `pauseRetract.phase` | `draining`, `lifting`, `parked`, `returning`, `held`, `failed`. |
| `pauseRetract.step` | `drain`, `state`, `lift`, `spindle-stop`, `spindle-start`, `dwell`, `approach`, `plunge`, `verify` ; `null` hors séquence. |
| `pauseRetract.since` | heure (`Date.now()`) de la demande. |
| `pauseRetract.line` | ligne du fichier atteinte par l'envoi à la demande (`stopLine`). |
| `pauseRetract.pending` | `sent − received` : lignes encore sans réponse (0 au repos). Affichage seulement. |
| `pauseRetract.lift` | `null` avant le repos ; puis `{from, to, distance}` en mm machine, chaînes à trois décimales (« Détails » seulement). |
| `pauseRetract.spindle` | `null` ou `{mode, speed}` : ce qui sera relancé. |
| `pauseRetract.failure` | `null` ou `{code, params, message}` : cause du passage en `held` ou `failed`. |
| `pauseRetract.owner` | `{kind, id, label}` de l'appareil qui a demandé. |
| `canPause` | vrai aussi en `draining`, `lifting`, `returning` (aujourd'hui : `s/job-service.js:1726`). |
| `canResume`, `resumeReason`, `refusals.resume` | portent les gardes du § 5.1 quand `pauseRetract` est `parked` ou `held`. |
| `canStop` | inchangé (vrai : `workflow` n'est pas `idle`). |

`fingerprint()` (`s/job-service.js:2590-2617`) reçoit `phase`, `step`, `failure` et `pending`, pour que le flux publie chaque changement. `ticketPending` / `holds` : le flux de l'appareil n'est pas renouvelé pendant `draining` (avec `lift`), `lifting`, `returning`. Journal (`history`) : `{event: 'retract', stage: 'requested' | 'held' | 'parked' | 'resume' | 'resumed' | 'failed', line, from, to, code, actor}`.

## 10. L'écran

Écran ⑤ Usinage (`screen-home`), sans changer le bandeau ni l'action principale existante. Pause (bandeau et action principale) reste la retenue immédiate, à un toucher.

### 10.1 Où

- Nouveau bouton **« Pause et dégager… »** (`#home-retract`, 48 px, secondaire) dans la rangée de boutons de l'encart `#home-notice-actions` (`touch/job-resume.js:108-113`), montré dans les états « En cours » et « En cours, la machine attend ». Rayé avec sa raison quand `canRetract` est faux ou qu'un autre appareil a la main (règle du § 6.8 de la spec).
- Le dialogue est le dialogue de confirmation existant (`#job-dialog`, `touch/job-controls.js`, opération `retract` ajoutée à côté de `frame` et `zeroZ`) : trois touchers (le bouton, la case, le bouton d'effet armé après 600 ms), 15 s, sous le bandeau : Pause et Arrêter restent actifs par-dessus.
- « Reprendre… » : action principale et bandeau existants ; seuls les textes du dialogue changent quand `pauseRetract.phase === 'parked'`.

### 10.2 Libellés exacts

| Où | FR | EN | ES |
|---|---|---|---|
| Bouton de l'encart | Pause et dégager… | Pause and retract… | Pausa y retirar… |
| Dialogue, titre | Pause et dégager | Pause and retract | Pausa y retirar |
| Dialogue, phrase | La fraise finit les mouvements déjà envoyés, puis elle monte tout en haut et la broche s’arrête. | The bit finishes the moves already sent, then rises to the top and the spindle stops. | La fresa termina los movimientos ya enviados, luego sube del todo y el husillo se detiene. |
| Dialogue, case | Je suis devant la machine et rien ne gêne la montée de la fraise. | I am at the machine and nothing blocks the bit on its way up. | Estoy delante de la máquina y nada estorba la subida de la fresa. |
| Dialogue, bouton d'effet | Dégager la fraise | Retract the bit | Retirar la fresa |
| Reprise depuis `parked`, phrase | La broche redémarre, la fraise redescend à sa place, puis l’usinage continue. | The spindle restarts, the bit goes back down to its place, then machining continues. | El husillo arranca, la fresa baja a su sitio y el mecanizado continúa. |
| Reprise depuis `parked`, case | Je suis devant la machine, la pièce n’a pas bougé et rien n’est sous la fraise. | I am at the machine, the workpiece has not moved and nothing is under the bit. | Estoy delante de la máquina, la pieza no se ha movido y no hay nada bajo la fresa. |
| Reprise depuis `parked`, bouton d'effet | Redescendre et reprendre | Lower and resume | Bajar y reanudar |

### 10.3 États de l'écran (en-tête, encart, action principale), à ajouter au tableau du § 4.5 de la spec

| `pauseRetract.phase` | En-tête | Encart (`#home-notice-text`) | Action principale (`#step-home-main`) |
|---|---|---|---|
| (nul, en cours) | « En cours · 42 % » | « Usinage en cours. » [Pause et dégager…] | [Pause] |
| `draining` | « Pause demandée » (ambre) | « La fraise finit les mouvements déjà envoyés, puis elle montera. » | [Pause] (retenue immédiate) |
| `lifting` | « Pause » (ambre) | « La fraise monte. » | [Pause] (arrête la montée) |
| `parked` | « Pause · fraise dégagée » | « Fraise en haut, broche arrêtée. » | [Reprendre…] |
| `returning` | « Reprise » (ambre) | « La broche redémarre, puis la fraise redescend à sa place. » | [Pause] (arrête la descente) |
| `held` | « Pause » (ambre) | « La fraise est restée dans la pièce. La broche tourne toujours. » + la phrase de la cause (§ 8.2) | [Reprendre…] |
| `failed` | « Pause » (rouge) | « Reprendre sur place n’est plus possible. Arrêtez l’usinage, puis reprenez à une ligne. » + la phrase de la cause | [Arrêter l'usinage] (rouge) |

Traductions des phrases d'état :

| FR | EN | ES |
|---|---|---|
| Pause demandée | Pause requested | Pausa pedida |
| La fraise finit les mouvements déjà envoyés, puis elle montera. | The bit is finishing the moves already sent, then it will rise. | La fresa termina los movimientos ya enviados y luego subirá. |
| La fraise monte. | The bit is rising. | La fresa sube. |
| Pause · fraise dégagée | Paused · bit retracted | Pausa · fresa retirada |
| Fraise en haut, broche arrêtée. | Bit at the top, spindle stopped. | Fresa arriba, husillo parado. |
| Reprise | Resuming | Reanudando |
| La broche redémarre, puis la fraise redescend à sa place. | The spindle restarts, then the bit goes back down to its place. | El husillo arranca y la fresa baja a su sitio. |
| La fraise est restée dans la pièce. La broche tourne toujours. | The bit stayed in the workpiece. The spindle is still turning. | La fresa se quedó en la pieza. El husillo sigue girando. |
| Reprendre sur place n’est plus possible. Arrêtez l’usinage, puis reprenez à une ligne. | Resuming in place is no longer possible. Stop machining, then resume from a line. | Ya no es posible reanudar en el sitio. Detenga el mecanizado y reanude desde una línea. |

« Détails » de l'encart ajoute : ligne atteinte, Z machine de départ et d'arrivée, broche à relancer, code et phrase du serveur. Aucun mot G-code ni nom de réglage hors de « Détails » (`test-textes-regles.cjs`).

La page ne décide rien : elle raye d'après `canRetract`, `canPause`, `canResume`, et affiche d'après `pauseRetract.phase`. Sans flux, elle n'appelle ni `retract` ni `resume` (garde FIGE existante) ; Pause et Arrêter gardent leurs voies.

## 11. Réalisation : où toucher

### 11.1 Serveur

- **Nouveau** `s/pause-retract.js` : `createRetract(deps)` sur le modèle de `createPlateProbe` (mêmes dépendances : `clock`, `conflict`, `controllers`, `record`, `later`, `changed`, `log`, `controllerInfo`, `allSettings`, `answers`, `control`, `transports`, `transportActors`, `haltPlan`, `halt`). Il possède les constantes, `RETRACT_MESSAGES`, la séquence, la surveillance, `snapshot`, `signature`, `holds`, `transportClosed`, `supervise`, `stop`, `forget`.
- `s/job-service.js`, ajouts groupés : `retract: null` dans le record ; `'retract'` dans `GUARDED_ACTIONS` (`:204`) ; opération `retract` dans `prepare` et action `retract` ; branche F2 de `readyFor(…'resume')` et de l'exécution de `resume` ; branches de `pause` (`:2355`), `stop` (`:2381`), `spindleStop`, `jog-stop` ; `socketRefusal` (`:2715`), `socketStop` (`:2740`) ; pas synchrone de `control` (`:2059-2077`) ; `closeTransport` (`:2667`), `ticketPending` (`:2638`) ; `r.alarmed`, `r.reset`, `r.stopped`, `r.file`, `remove` ; `snapshot`, `fingerprint`.
- Rien dans `GrblController.js`, `Sender.js`, `Workflow.js`, `s/halt.js`, `s/motion.js`, `s/index.js` : `c.workflow.pause()` est appelé tel quel (c'est l'appel que fait CNCjs pour M0).

### 11.2 Constantes

`RETRACT_TOP_MARGIN_MM = 5` (comme F1), `RETRACT_FEED = 600`, `RETRACT_APPROACH_MM = 5`, `RETRACT_PLUNGE_FEED = 100`, `RETRACT_SPINUP_S = 3`, `POS_TOL = 0.01`, `REST_TOL = 0.001`, `OFFSET_TOL = 0.0025`, `STREAM_GRACE_MS = 3000`, `STALE_MS = 2500`, `SUPERVISE_MS = 100`, `PARK_WATCH_MS = 1000`, `MODAL_WAIT_MS = 3000`, `WCO_WAIT_MS = 5000`, `LINE_MARGIN_MS = 15000`, `DRAIN_STALL_MS = 30000`. Aucune n'est réglable par l'opérateur dans ce lot.

### 11.3 Page

`touch/job-controls.js` (opération `retract`, textes du dialogue, `retract()` exporté dans `cncJobControls`), `touch/job-resume.js` (bouton et états de l'encart), `touch/job-dashboard.js` (en-tête et action principale selon la phase), tables `i18n-messages*.js` et `i18n-messages-refus.js` (lignes ajoutées en fin de table), `verify-project.cjs` (un test ajouté en fin de liste). Pas de CSS nouvelle : classes existantes `t-btn`, `t-notice`.

### 11.4 Simulateur (`grbl-simulator/`)

Deux écarts du profil LUNYEE avec le code amont touchent F2 ; à corriger avec leur test dans `grbl-simulator/__tests__/lunyee-profile.test.js` :
- `sim:1538` applique la correction de vitesse à un `$J=` ; R13 `Jog.cpp:31` ne le fait pas ;
- `sim:1468-1470` répond `error:16` à un `$J=` hors repos ; R13 répond `error:8` (`ProcessSettings.cpp:94-98`).
La surveillance de F2 ne dépend d'aucun des deux (délai calculé avec le facteur `k`, tout `error:n` traité de même). Troisième écart, noté sans correction demandée : en `Hold` le simulateur accepte encore des lignes (`sim:486`), la carte n'en lit plus (P7) ; F2 n'écrit jamais hors de l'état `Idle`.

## 12. Tests exigés

Chaque test échoue sans le code de F2. « réel » = vrai `GrblController` (vrais `Sender`, `Workflow` et traitement des `ok`), ligne série enregistrée, modèle `s/__tests__/repetition-n7.test.js`. « LUNYEE » = vrai `GrblController` branché sur `new GrblSimulator({profile: 'lunyee'})` par un nouveau support `s/__tests__/support/sim-controller.js` (le pont actuel `sim-bridge.js` n'envoie pas les lignes du fichier : `:9-11`). Les tests LUNYEE placent la fraise près du haut (montée de quelques millimètres) pour tenir dans le délai de Jest.

### 12.1 Serveur, `s/__tests__/pause-retract.test.js` (réel)

1. **Pas de `!`** : après `retract`, aucun octet `!` ni `0x18` n'est écrit ; `workflow` est `paused` ; plus aucune ligne du fichier ne part alors que des `ok` arrivent.
2. **Rien avant le repos** : tant que `received < sent`, ou avec un seul rapport `Idle`, ou avec deux rapports `Idle` de positions différentes, aucune ligne de F2 n'est écrite. Cas du `G4` du fichier : `Idle` rapporté, `ok` pas encore reçu, rien n'est écrit.
3. **Octets exacts de la montée** : repos à Z −118,4, `$132=130` appris : exactement `$J=G91 G21 Z113.4 F600\n` puis, après son `ok` et deux rapports `Idle` à Z −5, `M5\n` ; phase `parked` seulement après `FS:…,0`.
4. **Le compte du fichier ne bouge pas** : `sender.received` et `sender.sent` sont identiques avant L1 et après L2.
5. **Octets exacts de la reprise** : `M3 S18000\n`, `G4 P3\n`, `$J=G91 G21 Z-108.4 F600\n`, `$J=G91 G21 Z-5 F100\n`, puis `~` et la ligne du fichier d'indice `sent`, dans cet ordre, chacune après l'attente du § 5.2. Variante `d ≤ 5` (une seule descente) et variante broche arrêtée avant la pause (ni R1 ni R2).
6. **Pas de descente sans broche** : `FS:…,0` après `G4` → `ETOUCH_RETRACT_SPINDLE`, aucun `$J=` de descente, `failed`.
7. **État changé** : pour chacun de `G91`, `G20`, `G55`, `G1→G0`, `F` différent, `G93`, `M9→M8`, dans le `[GC:…]` d'avant la reprise ou d'après R4 → `ETOUCH_RETRACT_STATE_CHANGED`, aucun `~`.
8. **Zéro changé** : `WCO:` différent, ou aucun `WCO:` après le repos en 5 s → `ETOUCH_RETRACT_ZERO_CHANGED`, aucune ligne écrite.
9. **Machine déplacée** en X, en Y, en Z pendant `parked` → `ETOUCH_RETRACT_MOVED`, aucune ligne écrite.
10. **Arrêter** dans chaque phase : `draining` (retenue puis réinitialisation, comme aujourd'hui) ; `lifting` avec `$J=` en vol alors que le rapport dit encore `Idle` (un `!`, jamais de `0x18` avant un rapport au repos) ; `parked` (**aucun octet**, `jobStopped`, `stoppedAtLine` = ligne mémorisée, `homed` inchangé) ; `returning`.
11. **Pause** dans chaque phase : `draining` → un `!`, `pauseRetract` nul, puis la reprise ordinaire en `Hold` écrit `~` sans aucune ligne de F2 ; `lifting` et `returning` → `0x85`, puis `M5` une fois au repos, `ETOUCH_RETRACT_PAUSED`.
12. **Flux** : fermé pour de bon pendant `draining` → jamais de `$J=`, `held`, puis la reprise simple n'écrit que `~` ; fermé pendant `lifting` → `0x85` puis `M5`, `failed` ; renouvelé (rotation) et rouvert en moins de 3 s → la séquence continue, et aucune ligne ne part pendant l'absence ; flux d'un autre appareil seul → ne compte pas.
13. **Main** : prise par un autre appareil pendant `draining`, `lifting`, `parked` (réaction dans l'appel même de `takeover`, sans attendre la minuterie) ; expirée après 60 s d'absence en `parked` → `failed`.
14. **Rapports périmés** pendant `draining` et `lifting`.
15. **Alarme** et **bannière** dans chaque phase : plus aucune ligne, y compris quand la bannière est suivie d'un `Idle` et d'un vieil `ok` (ordre réel et ordre du simulateur, comme N7) ; reprise refusée.
16. **`error:n`** : sur L1 → `held`, rien d'autre écrit ; sur L2, R1 à R4 → `failed`.
17. **Délai de ligne** : `$J=` sans `ok`, ou `Jog` qui dure → `0x85`, `ETOUCH_RETRACT_TIMEOUT` ; le délai tient compte de la correction de vitesse connue.
18. **Course** : repos à Z −129,7 → `ETOUCH_RETRACT_TRAVEL`, `held`, aucun `$J=` ; repos à Z −3 → pas de L1, `M5`, `parked`, reprise sans descente ; machine non référencée ou `$13=1` → bouton refusé `ETOUCH_RETRACT_TRAVEL_UNKNOWN`.
19. **Refus avant** : travail lancé hors tablette, pause déjà en cours, `Hold` venu d'ailleurs, toutes les lignes envoyées (`%wait`), profil laser, `$32=1`, déplacements réels désactivés, autre appareil à la main, numéro expiré, rejoué, ou d'un autre flux.
20. **Client tiers** : `socketRefusal` refuse `gcode:resume`, `cyclestart`, `~`, `gcode`, une flèche dans chaque phase, y compris pour le détenteur de la main ; `socketStop` dans chaque phase ; `?` et `0x85` passent.
21. **Rien d'autre n'écrit pendant la pause** : pas de transaction D2, pas de relecture `$I`/`$$`, zéro, flèche, macro, plaque et chargement refusés en `parked`.
22. **Instantané et journal** : `pauseRetract` à chaque phase, `canPause` / `canResume` / `canRetract`, `refusals.retract` et `refusals.resume` codés ; événements `retract` ; chaque code du § 8.1 a sa ligne FR/EN/ES (`expectCatalogMatch`).
23. **Service arrêté, contrôleur retiré** en `lifting` : un `0x85`, aucune minuterie restante.
24. **Témoins inchangés** : Pause ordinaire (`!`), reprise ordinaire (`~`), pause M6 avec relance de broche, Arrêter : mêmes octets qu'avant (suites existantes intactes).

### 12.2 Profil LUNYEE, `s/__tests__/pause-retract-lunyee.test.js`

25. **Parcours complet** : prise d'origine du profil, zéro pièce posé, fichier de 40 lignes lancé, « Pause et dégager » au milieu ; le simulateur s'arrête à la fin de la dernière ligne envoyée ; montée ; `M5` ; reprise ; le fichier va à son terme ; la position machine finale et **toutes les positions de passage après la reprise** sont celles d'une exécution témoin sans pause.
26. **Position de l'interpréteur** : après la reprise, la première ligne du fichier est un arc `G2` : accepté (pas d'`error:33`), même point d'arrivée que le témoin.
27. **Limite du profil** (`softLimitInset` 0,2) : la cible de montée (Z −5) passe ; un essai forcé au-delà rend `error:15`, sans alarme ni redémarrage, et F2 finit en `held`.
28. **Alarme du profil** : `ALARM:1` (contact de fin de course simulé) pendant la montée → redémarrage simulé, MPos 0, aucune ligne de F2 dans la nouvelle session, reprise refusée, remise en route proposée.
29. **`WCO` un rapport sur dix** (L11) : la reprise demandée moins de 2,5 s après le repos attend le `WCO:` suivant, puis part.
30. **Les deux hypothèses de E-B** (`executedAfterHoming` `zero` et `stored`) : le parcours 25 réussit dans les deux, puisque rien ne se fait en coordonnées de travail.
31. **Réinitialisation au repos** (`resetAtRest` `keep` et `restart`) : Arrêter en `parked` n'écrit pas `0x18` dans les deux cas.
32. **Correction de vitesse à 10 %** pendant la montée : pas de faux `ETOUCH_RETRACT_TIMEOUT` (avant comme après la correction du simulateur du § 11.4).

### 12.3 Simulateur, `grbl-simulator/__tests__/lunyee-profile.test.js`

33. Un `$J=` ne suit pas la correction de vitesse ; un `$J=` reçu pendant un mouvement du fichier (`Run`) rend `error:8`.

### 12.4 Page, `examples/cncjs-touch/test-pause-retract.cjs` (inscrit dans `verify-project.cjs`)

34. Bouton présent en cours, rayé avec sa raison (`canRetract` faux, autre appareil à la main, sans flux) ; absent des autres états.
35. Trois touchers : le bouton ne POSTe que `prepare` ; la case puis le bouton d'effet POSTent `retract` avec le numéro ; avant 600 ms le bouton d'effet n'envoie rien ; Pause et Arrêter du bandeau ferment le dialogue et partent tout de suite.
36. Sept états du § 10.3 : en-tête, phrase, action principale, en FR, EN et ES ; en `failed`, l'action principale est « Arrêter l'usinage » et n'envoie que `stop`.
37. Pause du bandeau pendant `draining` envoie `pause` sans délai (pas de gel de 600 ms).
38. Textes du dialogue de reprise en `parked` ; inchangés pour une pause ordinaire et pour M6.
39. `test-refus-table.cjs`, `test-textes-regles.cjs`, `test-commandes-migration.cjs` restent verts avec les codes et le bouton nouveaux ; harnais : `browser-run.cjs --strict --only` l'étape de l'écran Usinage, aux deux fenêtres (1366 × 911 et 1366 × 768), sans déplacement d'un pixel des éléments existants hors de l'encart.

## 13. Entrée pour `refonte/SURETE.md`

> ## F2 — Pause et dégager (2026-11-17)
>
> | Commande / garde | Avant → après réel | Preuve durable |
> |---|---|---|
> | Pause (bandeau, action principale, API `pause`) | Retenue `!` immédiate → **inchangée** hors de la fonction. Pendant l'attente du dégagement, elle redevient la retenue ordinaire ; pendant une montée ou une descente de F2, elle annule le déplacement (`0x85`) puis arrête la broche. | `T/pause-retract.test.js`, cas 11 et 24. |
> | Arrêter | Inchangé. Pendant un déplacement de F2 : retenue d'abord (elle annule le déplacement), réinitialisation seulement au repos. Fraise dégagée, broche arrêtée : aucun octet, la carte n'est pas réinitialisée. | cas 10, 31. |
> | « Pause et dégager », nouvelle | Aucun mouvement → numéro à usage unique (15 s, flux, case), puis envoi retenu **sans `!`** ; repos prouvé (toutes les lignes ont répondu, deux rapports au repos de même position) ; `$J=G91 G21 Z… F600` jusqu'à 5 mm sous le haut de course ; `M5`. Une ligne à la fois, chacune revérifiée à l'instant de l'écriture. Gardes : travail lancé par la tablette, CNC hors mode laser, déplacements réels activés, la main, flux, course Z vérifiable, position de départ dans la course utilisable. Aucun mouvement en X ni en Y. | cas 1 à 4, 18, 19, 25, 27. |
> | Reprise après dégagement, nouvelle | La reprise d'une pause n'écrivait que `~` → position (0,01 mm), zéro pièce (`WCO:` postérieur au repos, 0,0025 mm) et état de la machine (`$G` champ par champ) comparés à ce qui a été mémorisé au repos ; `M3/M4 S…`, `G4 P3`, vitesse de broche rapportée non nulle exigée, deux `$J=` relatifs (le dernier de 5 mm à 100 mm/min), nouvelle comparaison complète, puis `~`. Toute différence : reprise sur place annulée, « Arrêter l'usinage » puis « Reprendre à une ligne ». | cas 5 à 9, 26, 29, 30. |
> | Surveillance | Aucune → flux de l'appareil (grâce de 3 s pour une rotation), la main, rapports de moins de 2,5 s, session de la carte, alarme, délai par ligne ; contrôlés toutes les 100 ms et avant chaque écriture. Une bannière ou une alarme arrête tout dans l'événement même. | cas 12 à 17, 28. |
> | Socket.IO pendant la fonction | Reprise possible depuis le PC pendant une pause → toute commande qui agit est refusée tant que la fraise est dégagée, quel que soit le détenteur de la main ; les arrêts restent libres et annulent la séquence. | cas 20. |
> | Autres écritures pendant la pause | Inchangé : D2, relecture des réglages, zéros, flèches, macros, plaque et chargement restent refusés. | cas 21. |
>
> **Limites.** L'arrêt n'est pas immédiat : la machine finit les lignes reçues (jusqu'à 120 octets) et les mouvements planifiés (15 ou 16) ; sur de longues lignes cela peut durer. Pause et Arrêter restent à un toucher. La fraise tourne sur place environ une seconde avant de monter. `FS:` n'est pas un compte-tours : « broche relancée » veut dire commandée, puis 3 s d'attente et la durée de la descente. La position est celle que la carte compte : un axe Z qui glisserait moteurs relâchés, ou une pièce déplacée pendant la pause, ne se voit pas ; la case de la reprise le fait attester. Un client branché sur le Wi-Fi de la carte échappe à la main de CNCjs : ses effets sont rattrapés par les comparaisons, sauf un mouvement fait puis défait exactement. Si CNCjs s'arrête pendant l'attente ou une descente, la carte finit ce qu'elle a reçu et la broche reste en marche : arrêt physique. Le refus d'un `$J=` hors repos, son refus hors course sans alarme, et l'absence d'effet d'un `$J=` sur l'état de la machine viennent du code amont (`Jog.cpp`, `GCode.cpp`, `ProcessSettings.cpp`) et de l'usage des flèches ; sur le binaire du fabricant ils sont à constater par l'essai F2 du protocole. Le stationnement du firmware (`0x84`) n'est pas employé. Preuves par vrai contrôleur CNCjs et simulateur : elles montrent les octets et les décisions, pas l'effet physique.

## 14. Essai réel, pas à pas (à ajouter à `refonte/PROTOCOLE-ESSAI.md`)

À conduire par l'opérateur, devant la machine, arrêt physique à portée de main, après les phases 4 et 6 du protocole existant (prise d'origine, D2, petit fichier connu). Enregistrer les lignes série avec leurs heures. À chaque étape : noter MPos avant et après, la phrase affichée, le Journal. Au premier écart : arrêt, on ne passe pas à l'étape suivante.

### 14.1 Sans mouvement

1. Relire les réglages et noter `$20`, `$21`, `$22`, `$1`, `$112`, `$122`. Machine au repos, fichier chargé : « Pause et dégager… » n'apparaît pas hors usinage ; « Détails » ne montre aucune erreur.
2. Depuis le PC ou le téléphone (sans la main), pendant l'essai 14.2 : le bouton est rayé, avec la phrase de la main.

### 14.2 Fraise en l'air, broche débranchée, sans fraise

Zéro Z posé **40 mm au-dessus** de la pièce ou de la table (le fichier tourne dans le vide). Petit fichier connu, à lignes courtes.

3. Lancer. Toucher « Pause et dégager… », lire le dialogue, cocher, « Dégager la fraise ». Attendu : la machine finit quelques lignes, s'arrête, monte seule jusqu'à Z machine −5,000, l'écran dit « Fraise en haut, broche arrêtée. ». Relever : nombre de lignes exécutées après le toucher, temps avant l'arrêt, temps de montée, X et Y inchangés au millième. Dans le relevé série : aucun `!`, un seul `$J=G91 G21 Z… F600`, puis `M5`, et `[GC:…]` identique avant et après le `$J=` (hormis M5).
4. Attendre 5 minutes. Relever Z machine et mesurer à la jauge ou au réglet la hauteur du nez de broche sur un repère fixe : elle ne doit pas avoir changé (glissement de Z moteurs relâchés ; noter `$1`).
5. « Reprendre… », case, « Redescendre et reprendre ». Attendu, dans l'ordre : `M3 S…`, 3 s, descente rapide, 5 derniers millimètres lents, puis le fichier continue. Relever dans la série : les deux `$J=`, MPos au millième avant `~` égal à celui relevé à l'arrêt de l'étape 3 (avant la montée), `[GC:…]` identique à celui d'avant la pause. Laisser finir le fichier : position finale égale à celle d'une exécution sans pause.
6. Refaire 3, puis **Arrêter** fraise en haut. Attendu : aucun `0x18` dans la série, MPos conservée, la machine reste référencée à l'écran, « Reprendre à la ligne N… » proposé avec la bonne ligne. Charger cette reprise et la laisser passer, toujours en l'air.
7. Refaire 3 et toucher **Pause** pendant que la machine finit ses lignes. Attendu : arrêt immédiat (retenue ordinaire), pas de montée ; « Reprendre… » reprend comme une pause ordinaire.
8. Refaire 3 et toucher **Pause** pendant la montée. Attendu : la montée s'arrête, la broche est commandée à l'arrêt, « Reprendre sur place n'est plus possible… », action principale « Arrêter l'usinage ».
9. Refaire 3 et toucher **Arrêter** pendant la montée. Attendu : arrêt du mouvement puis réinitialisation ; **considérer la référence perdue**, refaire prise d'origine et D2 (B1/B2) avant la suite.
10. Refaire 3 ; fraise en haut, depuis le PC : tenter Reprendre dans l'interface CNCjs. Attendu : refusé, avec la phrase « Fraise dégagée par la tablette… » ; rien ne bouge. Puis prendre la main depuis le PC avec un motif : la tablette affiche que reprendre sur place n'est plus possible.
11. Refaire 3 ; pendant que la machine finit ses lignes, fermer la page de l'appareil qui a demandé (ou couper son Wi-Fi si c'est un téléphone). Attendu : pas de montée ; à la réouverture, « La fraise est restée dans la pièce… » et « Reprendre… » reprend simplement.
12. Fichier à longues lignes (allers-retours de 300 mm à vitesse lente) : mesurer le temps entre le toucher et l'arrêt. C'est le pire cas à connaître avant d'usiner.

### 14.3 Les formes de commande sur ce binaire (si une étape de 14.2 a montré un écart)

13. À l'arrêt, hors usinage, par les flèches de la tablette : un pas de 1 mm en Z+, lire `$G` avant et après (identiques ?). Ne pas chercher à dépasser la course pour « voir » `error:15` : la frontière reste l'affaire de l'essai E-A.

### 14.4 Broche branchée, sans fraise

14. Refaire 3 puis 5 en écoutant : la broche s'arrête-t-elle en haut ? À la reprise, est-elle à pleine vitesse avant la fin des 3 s ? Sinon, noter le temps réel : la constante `RETRACT_SPINUP_S` sera relevée avant tout essai dans la matière.

### 14.5 Dans une chute, passe de 1 mm

15. Fraise montée, pièce bridée, passe de 1 mm de profondeur dans une chute de MDF. « Pause et dégager » au milieu d'une ligne droite, attendre l'arrêt et la montée, enlever les copeaux, « Reprendre… ». Après l'usinage : chercher la marque au point d'arrêt (profondeur et décalage latéral ≤ 0,05 mm ; une légère trace de chauffe est attendue).
16. Seulement ensuite : même essai dans un arc, puis à la profondeur de travail habituelle.

### 14.6 Hors lot, à part : le stationnement du firmware

Non requis par F2. Si l'opérateur veut un jour la pause immédiate avec montée, il faudra d'abord qualifier `0x84` sur ce binaire, **au repos, fraise en l'air, broche débranchée**, série exclusive : la carte passe-t-elle en « porte », monte-t-elle, où, `~` la fait-il redescendre, que dit `$S` pour `Spindle/Delay/SpinUp` ? Tant que ce n'est pas fait, la voie (b) reste écartée.

## 15. Ce qui n'est pas vérifié

- **Rien n'a été exécuté** : ni test, ni simulateur, ni harnais, ni machine. Les numéros de ligne du dépôt ont été relevés par lecture de `db584555` ; ceux de R13 dans les fichiers du commit cité, téléchargés pour lecture.
- **Le binaire du fabricant** : que `$J=` soit refusé hors repos (`error:8`), refusé hors course sans alarme (`error:15`), sans effet sur l'état de la machine, et insensible à la correction de vitesse, vient du code amont et de l'usage quotidien des flèches, pas d'un relevé série sur cette carte. La conception échoue sans mouvement dangereux si l'un de ces points est faux (comparaisons du § 5, cibles dans la course, délai avec facteur `k`), mais la fonction ne marcherait pas : c'est l'objet des essais 3 et 5.
- **Le comportement de la carte quand l'envoi s'arrête en plein usinage** (pause du fichier sans `!`) est celui de M0/M6 ; je n'ai pas de relevé de terrain d'un changement de fraise sur cette machine.
- **`[GC:…]` pendant un usinage** : CNCjs redemande `$G` quand la réponse précédente est arrivée ; le délai de 3 s après le repos est une estimation, pas une mesure.
- **Le temps de mise en vitesse de la broche** et le **maintien de Z moteurs relâchés** (`$1` non relevé) : à mesurer (essais 4 et 14).
- **Les durées d'attente réelles** avant l'arrêt selon le fichier (essai 12) : la borne « 120 octets + 16 mouvements » est exacte pour CNCjs et le code amont, pas mesurée sur ce binaire.
- **La page** : les emplacements et les libellés sont spécifiés d'après `SPEC-REFONTE.md` § 4.5 et la lecture de `job-resume.js`, `job-controls.js`, `job-dashboard.js` ; aucune maquette n'a été rendue, la place dans l'encart de 100 px aux deux fenêtres est à prouver par le harnais (lot F16 en parallèle sur les mêmes écrans).
- **Les traductions EN et ES** sont proposées avec le glossaire ; l'espagnol du dépôt emploie « Detener » et « Parar » pour Arrêter selon les fichiers : j'ai suivi le glossaire (« Detener »).
- **Accord avec F1** (`F1-CONCEPTION.md`, lue une fois ce document écrit) : même forme de montée (`$J=G91 G21 Z<d>` relatif positif), même hauteur (5 mm sous le haut de course, alignée ici sur F1). Écarts voulus, à confirmer par l'orchestrateur : vitesse en Z (F1 : 300 mm/min pour laisser le temps d'arrêter ; F2 : 600 pour la montée et la descente rapide, 100 pour les 5 derniers millimètres) ; tolérance de position (F1 : 0,05 mm ; F2 : 0,01 mm, parce que la fraise revient dans la matière). F1 cite des notes de séance hors dépôt (pas `$J=` exacts sur la carte, `error:15` sans mouvement hors course, capteur Z à 2 mm au-dessus de zéro) : je ne les ai pas lues et ne m'appuie pas dessus.
- **Fichiers partagés avec F1** : les deux lots ajoutent chacun une ligne dans `socketStop`, `socketRefusal`, `ticketPending`, `closeTransport`, `snapshot` et `fingerprint` de `s/job-service.js`. F1 a constaté par exécution que le cadrage laser n'est arrêté ni par `socketStop` ni par une bannière (ses défauts P1 et P3) : F2 ne reprend pas ce modèle (`s/motion.js` `frame`) mais celui des palpages, et ses tests 15 et 20 couvrent ces deux cas.

## 16. Points laissés à la décision de l'opérateur (défaut retenu entre parenthèses)

1. Confirmation de « Pause et dégager… » : trois touchers avec la case (retenu, règle des commandes qui mettent la machine en mouvement), ou un seul toucher.
2. Hauteur : 5 mm sous le haut de course (retenu, comme F1), ou une hauteur plus basse pour raccourcir la redescente.
3. Broche arrêtée en haut (retenu, demandé par le prompt), ou laissée en marche.
4. Quand le suivi est perdu pendant la montée : s'arrêter là (retenu), ou finir de monter.

## 17. Écarts et corrections après relecture (2026-11-17)

La relecture de sûreté du lot réalisé (Astra, verdict « à ne pas installer en l'état ») a relevé huit dangers et deux défauts de preuve. Tous ont été vérifiés dans le code, reproduits par un test qui jouait leur fenêtre exacte et échouait, puis corrigés dans `feat/F2` (commits `ccafd641`, `f4a52524`, `a562b009`, `d86d1a44`). Détail constat par constat : `F2-CORRECTIONS.md`. Ce qui change dans la présente conception :

1. **§ 7, Arrêter après un échec.** Un `$J=` de F2 reste « peut-être en mouvement » jusqu'à ce que deux rapports au repos (portant leurs coordonnées) en prouvent la fin, quelle que soit la phase, `failed` comprise ; un rapport `Jog` suffit aussi. Arrêter fait alors retenue d'abord, puis `0x85` répété tant qu'un rapport plus récent dit `Jog`, la réinitialisation seulement au repos (ou au délai de 5 s de l'arrêt existant, `s/halt.js`). Une fois la fin prouvée, broche arrêtée : aucun octet (P15 conservé).
2. **§ 4.3 et § 5.2, juste avant chaque ligne.** En plus du « ensure » : la machine est, d'après le dernier rapport (avec coordonnées, récent), au point d'où la ligne a été calculée (`ETOUCH_RETRACT_MOVED`, phase `failed`, jamais `held`) ; pour un `$J=`, la cible = ce point + la distance écrite, et elle est dans la course Z utilisable relue à cet instant (`ETOUCH_RETRACT_TRAVEL`, `_TRAVEL_UNKNOWN`).
3. **§ 5.2, R3 et R4.** Avant chaque descente et pendant qu'elle dure : la broche tourne (vitesse du dernier rapport `FS:` > 0, ou à défaut un `$G` reçu après l'`ok` de R1 qui dit M3/M4 ; aucun `$G` reçu depuis ne dit autre chose). Sinon `ETOUCH_RETRACT_SPINDLE` : la descente n'est pas écrite, ou elle est annulée (`0x85`).
4. **§ 4.2 et § 5.1 garde 5, zéro pièce.** `mem.wco` n'est plus « le premier `WCO:` après le repos » : c'est le dernier `WCO:` explicite reçu **jusqu'au** repos (celui en vigueur à l'arrêt, lignes vidées comprises). Chaque `WCO:` reçu après le repos doit lui être égal (0,0025 mm) ; une différence annule la reprise sur place (`ETOUCH_RETRACT_ZERO_CHANGED`) sans interrompre une montée (elle finit, puis `failed`) ; une descente, elle, s'arrête. Sans `WCO:` avant le repos : pas de reprise sur place. Un programme qui change lui-même son repère entre le dernier `WCO:` et le repos est refusé de même (refus sûr).
5. **§ 6.2, alarme.** Un seul rapport `Alarm`, même suivi d'`Idle` avant la veille suivante, arrête F2 dans l'événement même ; la reprise et chaque ligne exigent en plus `homed` et aucune référence perdue.
6. **§ 7, client tiers.** Une annulation de déplacement venue d'un client (`jogCancel`, `0x85`) passe par `socketJogCancel` avant d'aller à la carte : montée ou descente arrêtée (`ETOUCH_RETRACT_FOREIGN`, puis `M5` au repos), aucune ligne de F2 ensuite ; pendant l'attente du repos, la montée est abandonnée (`held`). Fichiers touchés en plus de ceux du § 11.1 : `s/index.js` (une fonction et un appel), `s/halt.js` (une condition).
7. **§ 5.2 R6 et § 5.3.** `~` n'est écrit qu'avec un flux ouvert de l'appareil, grâce ou non ; après cette attente, tous les contrôles sont refaits ; depuis `held` comme depuis `parked`.
8. **§ 4.1 C4-C5 et partout.** Le repos, les séries `Idle` et les positions ne comptent que les rapports qui portent leurs propres coordonnées (CNCjs garde celles d'un rapport plus ancien) ; la vitesse de broche, que celle du dernier rapport.
9. **§ 12, tests.** 12c refait avec l'appareil B seul (`D9`) ; le client tiers traverse l'entrée Socket.IO réelle (`T/pause-retract-socket.test.js`) ; la page perd vraiment son flux (`test-pause-retract.cjs`).
10. **§ 12.2, parcours LUNYEE.** Le simulateur peut tenir une position d'interpréteur distincte de la position machine (option `interpreterPosition`, comme `gc_state.position` en amont) et noter chaque bloc planifié (`recordBlocks`). Le test 25-26 vérifie le point de reprise (machine et interpréteur au point d'arrêt quand `~` part, broche M3) et compare **tous** les blocs du fichier (début, fin, centre) au témoin sans pause ; trois témoins prouvent que la comparaison voit une désynchronisation. Le commentaire qui annonçait une vérification avant le premier arc sans la faire est remplacé par cette vérification.

**Limite ajoutée.** Une erreur inférieure à la tolérance de position (0,01 mm), par exemple une descente plus courte de 0,005 mm sur un binaire qui s'écarterait du code amont, n'arrête pas F2 : seul le témoin du simulateur la voit. D'où l'essai 20 du protocole (premier bloc après `~` relevé au millième).
