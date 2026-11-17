# F1 — Cadrer la pièce à vide sur la CNC : conception

Phase A du chantier « six fonctions » (`design/PROMPT-FONCTIONS-6.md`), 17 novembre 2026. Base lue : arbre `cncjs-wt/F1`, branche `feat/F1` à `db584555`. Les numéros de ligne valent pour ce commit. Ce document ne contient pas le code de la fonction ; il fixe ce que le code doit faire et ce que ses tests doivent prouver. Rien n'a été essayé sur la tablette, la RT ni la CNC.

## 0. Lecture rapide

**Faisable : oui**, sous les gardes écrites ici.

1. Le cadrage CNC reprend la mécanique du cadrage laser (`framePlan`, `moves.frame`) : `M5`, puis des **déplacements manuels bornés `$J=`**, une ligne à la fois, chaque ligne attendue au repos avant la suivante. Aucune ligne `G0`/`G1`, aucun programme, aucun reset.
2. Avant tout X/Y, **Z monte seul** à 5 mm sous le haut de la course machine, par un déplacement **relatif positif** (`$J=G91 G21 Z<d> F300`) : le format des flèches, le seul prouvé sur cette carte, et dont l'écriture même interdit une descente. X/Y ne part que si Z est constaté arrivé.
3. Puis le tour du rectangle X/Y du fichier en **coordonnées pièce** (`$J=G90 G21 X… Y… F600`), comme le laser, et le retour au point de départ X/Y. Z ne redescend pas. Chaque arrivée est comparée à la position machine attendue.
4. **Arrêter** (et Pause) envoie l'annulation de déplacement `0x85`, rien d'autre : la machine ralentit et s'arrête, la prise d'origine et le zéro pièce sont gardés. La séquence est surveillée comme le palpage à la plaque (flux de l'appareil, main, rapports récents, session de la carte).
5. Trois défauts de la surveillance du cadrage laser actuel ont été **constatés en l'exécutant** (§ 2.3) : un arrêt venu de CNCjs classique n'arrête pas la séquence, la rotation du flux l'annule, un redémarrage de la carte entre deux lignes ne l'arrête pas. Le cadrage CNC ne doit pas en hériter.

Trois points demandent une décision de l'orchestrateur (§ 14) : appliquer aussi la surveillance renforcée au laser, garder l'exigence `$20=1` (la carte a été vue à `$20=0` le 16 novembre), et un éventuel verrou du départ après une arrivée inattendue.

## 1. Ce que l'opérateur obtient

Sur **4 · Contrôle**, sous « Rapides au départ », un bouton **« Cadrer à vide… »**. Il ouvre la confirmation habituelle (case, puis « Lancer le cadrage »). La fraise monte tout en haut, fait le tour du rectangle du fichier à 600 mm/min, broche arrêtée, revient au-dessus de son point de départ et reste en haut. « Arrêter » l'interrompt à tout instant. Si le rectangle dépasse la course, le bouton est rayé et la barre dit de combien et de quel côté.

Ce que le cadrage ne dit pas : il suit le **centre** de la fraise (la coupe déborde du rayon), il ne vérifie ni les brides ni la profondeur, et à cette hauteur (environ 12 cm au-dessus de la pièce sur cette machine) l'œil juge les bords à quelques millimètres près.

## 2. Faits et preuves

### 2.1 La carte

| # | Fait | Source | Degré |
|---|---|---|---|
| C1 | Enveloppe : X `[0 ; 408]`, Y `[0 ; 396]`, Z `[−130 ; 0]` ; MPos 0,0,0 après `$H`. | `PROMPT-REFONTE-UI.md` § 2 ; `FIRMWARE.md` § 3a, R1 | Observé |
| C2 | Une ligne `G0`/`G1`/`G38` hors course lève `ALARM:2`, **la carte redémarre**, position et référence perdues. | `PROMPT-REFONTE-UI.md` § 2 (T2) ; `FIRMWARE.md` R3 | Observé |
| C3 | Un déplacement manuel `$J=` hors course est refusé par `error:15`, **sans alarme ni mouvement**. | Code amont [R13 Jog.cpp:36-38] (`FIRMWARE.md` § 3a) ; note de séance du 14 novembre (mémoire de l'assistant, hors dépôt) : « X409/Y397/Z-131 refused with error:15 without motion » avec `$20=1` | Amont + noté sur la carte, pas dans un compte rendu du dépôt |
| C4 | Un reset (0x18) **en mouvement** : `ALARM:3`, position « probablement perdue » ; sur cette carte, MPos 0 et référence perdue après un Arrêter en plein usinage. | `FIRMWARE.md` § 3c, E3 ; `halt.js:27-33` | Observé |
| C5 | Les pas `$J=G91 G21 <axe><distance> F<vitesse>` de la tablette sont exacts sur cette carte (« 12/12 Touch jog steps exact »), par le même chemin serveur que la page. | Note de séance du 14 novembre (hors dépôt) ; format : `motion.js:278` | Noté sur la carte |
| C6 | `$J=G53 G90 …` : la note de séance du 14 novembre dit des allers-retours pleine course exacts ; `PROTOCOLE-ESSAI.md:95` dit au contraire « à vérifier sur ce binaire, pas à supposer ». | les deux | **Contradictoire : traité comme non prouvé** |
| C7 | `$J=G90 G21 X… Y…` en coordonnées pièce : aucune trace d'un essai sur la LUNYEE (le cadrage laser n'a tourné que sur banc). Syntaxe standard Grbl 1.1. | `PROFILES.md:102` ; aucune note | **Non prouvé sur la carte** |
| C8 | En état `Jog`, `0x85` et `!` annulent le déplacement avec décélération, retour à `Idle`, position gardée. | Grbl 1.1 (`protocol.c`, de mémoire, non relu dans R13) ; `grbl-simulator.js:796-799, 830-834` ; maintien continu utilisé sur la carte le 14 novembre | Amont ; distance d'arrêt non mesurée |
| C9 | Après `$H`, `WCO:0,0,0` alors que `$#` garde G54 ; D2 le recharge et le prouve par un rapport postérieur. On ne sait pas si le décalage **exécuté** était nul. | `FIRMWARE.md` § 3b, E4 ; `work-offset.js:1-16` | Observé ; le doute sur l'exécuté reste |
| C10 | Accélérations `$120-$122 = 50 mm/s²` ; vitesses maximales 4000 / 4000 / 800 mm/min. | Relevé `surface-pro-sauvegardes/reglages-grbl-_dev_ttyUSB0-2026-11-13.txt` (hors dépôt) | Relevé du 13 novembre, non relu depuis |
| C11 | **`$20`** : 1 d'après le prompt de mission ; **0** lu dans `$$` le 16 novembre à 09:22 d'après la note d'installation. | `PROMPT-REFONTE-UI.md` § 2 ; note de séance du 16 novembre (hors dépôt) | **Incertain : à relire sur la carte** |
| C12 | L'arrêt d'urgence coupe la liaison USB (le port se ferme). | Note de séance du 13 novembre (hors dépôt) | Noté sur la carte |
| C13 | Capteurs de fin de course : X ≈ 410,2, Y ≈ 398,2, Z bas ≈ −134,2 ; Z haut à 2 mm au-dessus de MPos 0 (`$27=2`). | Notes de séance du 14 novembre | Noté sur la carte |

Distance de freinage à 50 mm/s² (C10) : 600 mm/min → 1,0 mm ; 1000 mm/min → 2,8 mm ; 4000 mm/min (un `G0`) → 44 mm. Z à 300 mm/min → 0,25 mm.

### 2.2 Le code existant dont la fonction part

| Sujet | Où | Ce qu'il fait |
|---|---|---|
| Plan du cadrage laser | `job-service.js:1865-1937` (`framePlan`) | Gardes : capacité `laserFrame`, `moves.jogReady`, D2 (`offsetReady`), fichier chargé par le service, contrôle X et Y `validated`, unités fixées, repère du fichier = repère actif, vitesse bornée, position pièce connue. Lignes : `M5` puis cinq `$J=G90 G21 X… Y… F…` (approche + quatre côtés), chacune ≤ 60 s. |
| Ticket et attente annulable | `job-service.js:1978-2031` | `frame-prepare` rend un ticket (15 s, lié au flux, lignes figées) ; `frame` refait le plan, exige les mêmes lignes, réserve (`frameStarting`) pendant la relecture de l'empreinte, puis refait tout le garde et écrit sans attente intermédiaire. |
| Séquence | `motion.js:886-947` (`frame`) | Une ligne à la fois ; la suivante part quand `settle` est vrai (`ok` + deux rapports sans `Jog`, `motion.js:326-357`) et l'état `Idle`. N'accepte que `M5` et `$J=G90 G21 X… Y… F…` (`FRAME_LINE`, `motion.js:840`). |
| Surveillance | `motion.js:865-883` (`frameStopReason`) | Fonction désactivée, flux **exact** du lanceur fermé, main prise par un autre, rapport > 2,5 s, alarme → `cancel` (`0x85` répété tant que `Jog` est rapporté, `motion.js:556-626`). |
| Arrêter / Pause | `job-service.js:2393-2397`, `2367-2371` → `moves.stop` (`motion.js:784-790`) | Un déplacement du service en cours : `0x85` seulement, jamais de reset. |
| Modèle « palpage » | `plate-probe.js:305-350, 363-369, 487-538` | Lié à l'**appareil** (un autre flux du même appareil suffit, 3 s de grâce à la rotation), à la main telle qu'au départ (tout changement arrête), à la session de la carte (`startups`), rapports ≤ 2,5 s, délai par ligne ; vérifié avant chaque écriture et toutes les 100 ms ; `supervise` appelé dans le même pas que le changement de main (`job-service.js:2059-2076`). |
| Rotation du flux | `touch-stream.js:14-19, 60-69` | Chaque flux est fermé puis rouvert après 60 s (20 s de sursis si `ticketPending`). |
| Contrôle des courses | `program-check.js:740-760`, `motion.js:176-263` | Emprise du fichier + décalage (MPos − WPos) comparée à la course utilisable : X `[0 ; 407,5]`, Y `[0 ; 395,5]`, Z `[−129,5 ; 0]` sur la LUNYEE apprise ; dépassements chiffrés (`ETOUCH_TRAVEL_BEYOND`, `program-check.js:550-567`). |
| Simulateur LUNYEE | `grbl-simulator.js:54-73, 1466-1559, 2449-2493` | `$J=` en `G90`, `G91` et `G53` ; hors limites → `error:15` (borne lointaine refusée 0,2 mm plus tôt) ; décalage exécuté et rapporté séparés après `$H` (`offsetVoid`). L'annulation y est instantanée (pas de rampe). |

### 2.3 Trois défauts du cadrage laser, constatés par exécution

Banc : le harnais de `machine-profile.test.js` (faux contrôleur), dans un fichier de test temporaire lancé puis supprimé (l'arbre est resté propre). Cadrage laser lancé, première ligne `$J=` en cours.

| # | Manipulation | Résultat obtenu | Cause dans le code |
|---|---|---|---|
| P1 | `service.socketStop('TEST')` (ce qu'appelle un `!`, un `feedhold`, un `gcode:stop` de CNCjs classique, `index.js:139-141`), puis retour à `Idle` | La ligne suivante **part** : `$J=G90 G21 X60 Y20 F2000` écrit, cadrage toujours actif. `socketRefusal` vaut `null` pendant le cadrage. | `socketStop` n'annule que `frameStarting` (`job-service.js:2747-2749`), pas le cadrage en cours ; `socketRefusal` de même (`:2727`). |
| P2 | Rotation du flux : `closeTransport('tA', true)` | Cadrage **annulé** (`reason: 'transport'`). `ticketPending('tA')` valait `false` : la rotation n'est pas retardée. | `moves.transportClosed` ne distingue pas la rotation (`job-service.js:2682`, `motion.js:1178-1183`) ; `holds` ne couvre pas le cadrage (`motion.js:1186-1187`). |
| P3 | Bannière de démarrage, puis rapports `Idle` | La ligne suivante **part** dans la nouvelle session, alors que `homed` vaut `false`. | `settle` relâche la ligne après un redémarrage (`motion.js:340`), et `frame` ne compare pas `startups` ni ne refait `jogReady` entre deux lignes (`motion.js:913-943`). |

P2 rend un cadrage de plus d'une minute impossible avec la surveillance actuelle : le cadrage CNC dure environ deux minutes. P1 et P3 sont des trous de sûreté. Les trois sont couverts par les tests exigés (§ 10).

## 3. Voies étudiées

### 3.1 Retenue : déplacements manuels bornés, Z relatif, X/Y en coordonnées pièce

Raisons, dans l'ordre d'importance :

1. **L'arrêt ne coûte pas la référence.** Un `$J=` s'annule par `0x85` (C8) : décélération, retour au repos, position gardée. Un `G0`/`G1` ne s'arrête que par retenue puis reset, et un reset en mouvement perd la position sur cette carte (C4).
2. **Un dépassement envoyé par erreur ne fait pas d'alarme.** `error:15` sans mouvement (C3), contre `ALARM:2` et redémarrage pour un `G1` (C2).
3. **Rien ne reste dans l'état modal** : un `$J=` ne change ni `G0/G1`, ni `F`, ni `G90/G91` de l'interpréteur. Le programme démarre ensuite dans l'état qu'il aurait trouvé sans cadrage.
4. **Vitesse choisie** : un `$J=` porte sa vitesse ; un `G0` irait à 4000 mm/min (44 mm de freinage).
5. **Z par le format des flèches** (C5), en relatif positif : la ligne acceptée par le serveur ne peut pas contenir de signe moins (§ 4.2), donc aucune erreur de calcul, de décalage ou de longueur d'outil ne peut en faire une descente.
6. **X/Y en coordonnées pièce**, comme le laser : le cadrage passe par le même calcul de la carte que le programme (repère actif + décalage exécuté). Si le décalage exécuté n'était pas celui que la carte rapporte (doute C9), le cadrage le montrerait à vitesse lente, broche arrêtée, fraise en haut, et l'arrivée comparée (§ 5.3) l'arrêterait au premier segment, avant que le programme ne le montre dans la matière.

Ce qui est sûr **dans les deux cas** pour chaque point non prouvé :

| Point non prouvé | Si la carte fait comme le code amont | Si elle fait autrement | Ce qui tient dans les deux cas |
|---|---|---|---|
| Décalage exécuté = rapporté après D2 (C9) | Les coins machine sont ceux que le serveur a contrôlés. | La fraise va ailleurs, à hauteur sûre : hors course → `error:15` (C3) ; dans la course → arrivée inattendue. | Garde `$20=1` (§ 5.1) : la carte refuse elle-même toute cible hors course. Arrivée comparée : arrêt, D2 invalidé. Aucune descente. |
| `$J=G90` en coordonnées pièce (C7) | Idem. | Ligne refusée (`error:N`, rien ne bouge), ou mouvement mal interprété, borné par les limites de la carte, à hauteur sûre, détecté à l'arrivée. | Z est déjà en haut, par un format prouvé ; le premier essai réel se fait table vide (§ 12). |
| `0x85` arrête vite (C8) | Arrêt en 1 mm à 600 mm/min. | Le segment va au bout : au plus un côté, dans l'enveloppe contrôlée, en haut. | Chaque segment est borné et contrôlé ; `0x85` est répété tant que `Jog` est rapporté ; l'écran dit « annulation non confirmée ». |
| La correction de vitesse ne touche pas un `$J=` (amont, de mémoire) | 600 mm/min. | Au plus 200 % : 1200 mm/min, 4 mm de freinage. | Encore lent ; à mesurer à l'essai (durée d'un côté). |
| `$20` vaut 1 (C11) | Garde passée. | Garde refusée, rien ne bouge. | Le serveur contrôle de toute façon chaque cible avec 0,5 mm de marge. |

### 3.2 Écartées

| Voie | Pourquoi écartée | Preuve |
|---|---|---|
| Lignes `G0`/`G1` (ou `G53 G1` comme le palpage au bloc) par le feeder | Arrêt = retenue puis reset (référence perdue si le reset tombe en mouvement) ; dépassement = `ALARM:2` et redémarrage ; `G0` trop rapide, `G1 F…` laisse `G1` et `F` dans l'état modal du programme suivant. | C2, C4 ; `plate-probe.js:487-511` ; `halt.js:27-33` |
| Petit programme généré, lancé par le sender (comme un usinage) | Mêmes défauts, plus : états « usinage », Pause/Reprendre, reprise à une ligne, journal d'usinage ; Arrêter = reset. | `job-service.js:2447-2468` |
| Z par `$J=G53 G90 G21 Z-5` (absolu machine) | Le support de `G53` dans `$J=` sur ce binaire est contradictoire (C6). Si `G53` était ignoré, la ligne deviendrait « Z −5 en coordonnées pièce » : **une descente dans la pièce**. Le relatif positif ne peut pas descendre. | `PROTOCOLE-ESSAI.md:95` |
| X/Y par `$J=G53 G90` ou par relatifs `G91` calculés en coordonnées machine | Restent toujours dans l'enveloppe contrôlée, mais montrent où le **serveur** croit le fichier, pas où la **carte** l'exécutera : si les deux diffèrent (C9), le cadrage rassure à tort et le programme part ailleurs, broche en marche. De plus C6 pour `G53`. | § 3.1 point 6 |
| Tour à la hauteur actuelle (comme le laser) | Interdit par la mission ; brides et pièce sur le trajet. | `PROMPT-FONCTIONS-6.md` F1 |
| Z à 0 exactement | 2 mm sous le capteur haut (C13) ; 5 mm de moins ne coûtent rien et gardent 7 mm. Une alarme de fin de course redémarre la carte. | C13 |
| Descendre à la fin, ou proposer « descendre ici » | Interdit par la mission (« Z ne redescend pas »). | idem |
| Côtés découpés en petits déplacements | Arrêt à chaque morceau (une demi-seconde d'attente par ligne) ou file de `$J=` plus difficile à surveiller ; n'apporte que la réduction du trajet restant si le serveur meurt, limite déjà acceptée pour les flèches. | `motion.js:24-29` |
| Maintien par battements de la page (comme le déplacement continu) | Non demandé : la mission dit « surveillé comme le palpage ». Limite notée au § 6. | `PROMPT-FONCTIONS-6.md` F1 |

## 4. La séquence

### 4.1 Constantes

| Nom | Valeur | Raison |
|---|---|---|
| Vitesse X/Y par défaut | **600 mm/min** | 10 mm/s : 1 mm de freinage (C10), environ 13 mm parcourus entre « je vois » et l'arrêt (1 s de réaction, 0,2 s de transmission). C'est aussi la plus basse vitesse ronde pour laquelle tout segment possible sur cette machine (diagonale de la course utilisable : 568 mm) tient dans les 60 s d'un `$J=` (`MAX_JOG_MS`, `motion.js:267`). Planche 400 × 70 : environ 2 min 10 s. |
| Vitesse X/Y acceptée | de `MIN_FEED` à min(1500, `$110`, `$111`) | La page n'envoie pas de vitesse dans ce lot (§ 14, D-4). La borne haute garde le cadrage « lent » quoi qu'on envoie ; elle sert aussi à raccourcir les tests sur simulateur. |
| Vitesse Z | min(300, `$112`) mm/min | 5 mm/s vers le haut ; 125 mm en 25 s au plus sur cette machine. |
| Hauteur sûre | haut de la course utilisable en Z − **5 mm** (LUNYEE : Z machine **−5**) | « Proche du haut de course », 7 mm sous le capteur. `usableOf(limitsAt(…)).high − 5` (`motion.js:230-263`). |
| Tolérance d'arrivée | 0,05 mm | Rapports à 3 décimales, cibles arrondies à 0,001. |
| Délai d'une ligne | durée prévue + 10 s (`M5` : 10 s) | Comme le laser (`job-service.js:1925, 1933`). |
| Grâce du flux, rapports, cadence | 3 s, 2,5 s, 50 ms | Celles de la plaque et du cadrage (`plate-probe.js:45-47`, `motion.js:57`). |

### 4.2 Les lignes, dans l'ordre

Notations : `mz` = Z machine au repos ; `zs` = hauteur sûre ; `(x0, y0)` = position pièce de départ ; `xMin…yMax` = emprise X/Y du fichier (`analysis.extent`, arrondie à 0,001) ; `f` = vitesse X/Y ; `fz` = vitesse Z. Toutes les valeurs sont écrites par `fmt3` (au plus trois décimales, jamais d'exposant).

| N° | Ligne écrite sur le port | Phase | Condition d'existence | Attendu avant la ligne suivante |
|---|---|---|---|---|
| 0 | `M5` | `spindle` | toujours, en premier | `ok` ; deux rapports postérieurs ; état `Idle`. |
| 1 | `$J=G91 G21 Z<zs − mz> F<fz>` | `raise` | si `zs − mz ≥ 0,01` ; sinon aucune ligne Z (la fraise est déjà au-dessus : elle y reste) | `ok` ; deux rapports postérieurs sans `Jog` ; `Idle` ; **Z machine = `zs` à 0,05 près**, X et Y machine inchangés à 0,05 près. |
| 2 | `$J=G90 G21 X<xMin> Y<yMin> F<f>` | `approach` | si le point de départ en est à plus de 0,001 mm | `ok` ; deux rapports sans `Jog` ; `Idle` ; X/Y machine = cible + décalage à 0,05 près ; Z machine ≥ Z constaté après la ligne 1 − 0,05. |
| 3 | `$J=G90 G21 X<xMax> Y<yMin> F<f>` | `side` 1 | si longueur > 0,001 | idem |
| 4 | `$J=G90 G21 X<xMax> Y<yMax> F<f>` | `side` 2 | idem | idem |
| 5 | `$J=G90 G21 X<xMin> Y<yMax> F<f>` | `side` 3 | idem | idem |
| 6 | `$J=G90 G21 X<xMin> Y<yMin> F<f>` | `side` 4 | idem | idem |
| 7 | `$J=G90 G21 X<x0> Y<y0> F<f>` | `return` | si le dernier point en est à plus de 0,001 mm | idem ; puis fin (`ended`). |

Règles de forme, vérifiées par le module qui écrit (à la manière de `FRAME_LINE`) :
- ligne 0 : exactement `M5` ;
- au plus une ligne Z, en position 1, de la forme `^\$J=G91 G21 Z\d+(\.\d+)? F\d+(\.\d+)?$` : **pas de signe**, donc jamais une descente ;
- toutes les autres : `^\$J=G90 G21 X-?\d+(\.\d+)? Y-?\d+(\.\d+)? F\d+(\.\d+)?$` : **aucun mot Z** ;
- jamais `M3`, `M4`, `S`, `G0`, `G1`, `G10`, `G53`, `$H`, `$X`, ni octet autre que `0x85` (à l'annulation).

Un segment de longueur nulle n'est pas écrit (un fichier d'une seule ligne droite donne un rectangle plat : on n'envoie pas à la carte un déplacement vers l'endroit où elle est). Le décalage utilisé pour les arrivées est celui du contrôle : MPos − WPos au moment du plan (`program-check.js:652-657`).

Exemple (G54 X 4, Y 150 ; départ machine X 104, Y 180, Z −60 ; fichier X 0 → 400, Y 0 → 70) :

```
M5
$J=G91 G21 Z55 F300          Z machine −60 → −5        11 s
$J=G90 G21 X0 Y0 F600        vers le premier coin      10 s   machine (4 ; 150)
$J=G90 G21 X400 Y0 F600      côté 1                    40 s   machine (404 ; 150)
$J=G90 G21 X400 Y70 F600     côté 2                     7 s   machine (404 ; 220)
$J=G90 G21 X0 Y70 F600       côté 3                    40 s   machine (4 ; 220)
$J=G90 G21 X0 Y0 F600        côté 4                     7 s   machine (4 ; 150)
$J=G90 G21 X100 Y30 F600     retour au départ          10 s   machine (104 ; 180)
```

### 4.3 Ce qui n'est jamais écrit

Aucune ligne après un arrêt, une annulation ou une fin autre que les `0x85` de l'annulation. Aucun `M5` de « nettoyage », aucun retour automatique, aucun reset, aucune retenue (`!`), aucun `~`, aucun déverrouillage. Après une bannière de la carte, **rien**, pas même `0x85` (comme la plaque, D-06 de `SURETE.md`).

## 5. Les gardes

### 5.1 Avant : à la préparation du ticket, puis de nouveau à l'exécution

Dans cet ordre. « Existant » = garde déjà dans `framePlan` ou `moves.jogReady`, à reprendre tel quel.

| # | Garde | Refus | État |
|---|---|---|---|
| G1 | Opération connue, contrôleur inchangé (`generation`), flux ouvert et appartenant à l'appareil qui demande (`moves.bound`) | `ETOUCH_MACHINE_OPERATION`, `_CONTROLLER_CHANGED`, `_TRANSPORT`, message de `bound` | Existant (`job-service.js:1944-1977`) |
| G2 | La main : port libre ou à cet appareil | refus de `control.authorize` (famille « main ailleurs ») | Existant (`job-service.js:2083-2084`) |
| G3 | Type de machine : pas un laser déclaré ; pas de mode laser actif sans déclaration ; déplacements réels activés et Grbl ≥ 1.1 | `ETOUCH_CNC_FRAME_LASER` ; `ETOUCH_MACHINE_LASER_MODE_ON` ; `ETOUCH_LASER_FRAME_DISABLED` | **Nouveau** : capacité `cncFrame` dans `capabilitiesFor` (`machine-profile.js:148-173`), sur le modèle de `plateProbe` |
| G4 | Repos complet (`moves.jogReady`) : connexion, rapport ≤ 2,5 s, aucune commande système, aucune transaction D2 en cours ni restauration en attente, aucune lecture de réglages, pas de prise d'origine annoncée, pas de palpage, pas de chargement, usinage ni en cours ni en pause, pas d'alarme, aucun déplacement précédent non terminé, état `Idle`, feeder vide, pas d'automatismes CNCjs, `$13=0` | ceux de `motion.js:380-423` | Existant |
| G5 | **Prise d'origine faite** : `r.homed === true`, quel que soit `$22` | `ETOUCH_CNC_FRAME_NOT_HOMED` | **Nouveau** (le laser ne l'a qu'à travers G9) |
| G6 | **Zéro pièce prouvé par D2** (`offsetReady`) | `ETOUCH_OFFSET_CHECKING`, `_UNCONFIRMED`, `_MISMATCH`, `_SETTINGS` | Existant (`job-service.js:1874`) |
| G7 | **Broche à l'arrêt** (`spindleStill`) : vitesse rapportée nulle, ou à défaut `$G` récent sans `M3`/`M4` | message existant (famille « broche tourne », remède « Arrêter la broche ») | **Nouveau pour le cadrage** ; `M5` reste écrit en premier malgré tout |
| G8 | Fichier chargé par le service, celui du sender (`revision`, `touchJob`) | `ETOUCH_LASER_FRAME_NO_PROGRAM` | Existant |
| G9 | Contrôle des courses du fichier : X **et** Y `validated`. Un axe `outside` → refus chiffré ; un axe `unknown` → refus avec ses raisons | `ETOUCH_CNC_FRAME_OUTSIDE` (`reasons` = les `ETOUCH_TRAVEL_BEYOND` de X et Y : axe, côté, dépassement en mm, valeur, limite) ; `ETOUCH_LASER_FRAME_CHECK` (`reasons` = raisons codées de X et Y) | Existant pour `_CHECK` ; **nouveau** pour le cas chiffré |
| G10 | Emprise connue : unités fixées par le fichier, X et Y tous deux parcourus | `ETOUCH_LASER_FRAME_BOUNDS` | Existant |
| G11 | Repère du fichier = repère actif | `ETOUCH_LASER_FRAME_WCS` | Existant |
| G12 | **Limites de course de la carte actives** : `$20=1` lu | `ETOUCH_CNC_FRAME_SOFT_LIMITS` | **Nouveau** (§ 3.1, § 14 D-2) |
| G13 | Position pièce X/Y et position machine X/Y/Z connues | `ETOUCH_LASER_FRAME_POSITION` | Existant, étendu à Z machine |
| G14 | **Hauteur sûre calculable** : course Z connue, une seule convention, Z machine dans cette course | `ETOUCH_CNC_FRAME_Z` | **Nouveau** |
| G15 | **Toutes les cibles dans la course utilisable** : les quatre coins (déjà par G9) et le point de retour, c'est-à-dire la position actuelle X/Y (marge 0,5 mm côté opposé à la prise d'origine) | `ETOUCH_CNC_FRAME_START` (axe, valeur, bornes) | **Nouveau** |
| G16 | Vitesse dans les bornes ; aucun segment de plus de 60 s (Z compris) | `ETOUCH_LASER_FRAME_FEED`, `ETOUCH_LASER_FRAME_SLOW` | Existant, étendu à la ligne Z |
| G17 | À l'exécution : ticket présent, bon numéro, non expiré (15 s), même flux ; plan refait **identique** (mêmes lignes, donc machine immobile depuis la confirmation : la ligne Z et la ligne de retour portent la position) ; même fichier (révision, empreinte relue sur disque) | `ETOUCH_LASER_FRAME_EXPIRED`, `ETOUCH_LASER_FRAME_CHANGED` | Existant (`job-service.js:2000-2025`) |

Le verdict **Z** du fichier n'est pas exigé : le cadrage n'utilise pas le Z du fichier, et c'est justement quand le fichier descend trop bas qu'on déplace la pièce puis qu'on veut recadrer. Le dépassement en Z reste affiché et bloque le départ comme aujourd'hui.

Les gardes du départ qui ne concernent que l'exécution d'un programme (mode de la reprise, unités et mode non fixés, `G94`, dérogation) ne s'appliquent pas : chaque `$J=` porte ses propres `G21`, `G90`/`G91` et `F`.

### 5.2 Pendant : avant chaque écriture, et toutes les 50 ms

Le premier cas vrai arrête. « Annuler » = fin de la séquence dans le même pas (plus aucune ligne), puis `0x85`, répété comme aujourd'hui tant qu'un rapport plus récent dit `Jog`.

| # | Condition | Réaction | Code publié (`lastFrame.code`) |
|---|---|---|---|
| S1 | Contrôleur fermé ou remplacé | fin sans écriture (`lost`) | — (l'écran dit « non connectée ») |
| S2 | **Bannière** : `r.startups` ≠ celui du départ | fin **sans aucune écriture** | `ETOUCH_FRAME_RESTART` |
| S3 | Déplacements réels désactivés entre-temps | annuler | `ETOUCH_FRAME_STATE` |
| S4 | **Flux** : aucun flux ouvert de l'appareil qui a lancé. Fermeture réelle du dernier flux → annuler tout de suite ; rotation → 3 s de grâce pendant lesquelles **aucune ligne ne part** | annuler | `ETOUCH_FRAME_STREAM` |
| S5 | **La main** : le détenteur n'est plus celui du départ (prise par un autre, rendue, expirée). Vérifié aussi dans le même pas que `control/release` et `control/takeover` | annuler | `ETOUCH_FRAME_CONTROL` |
| S6 | **Rapport périmé** : > 2,5 s | annuler | `ETOUCH_FRAME_STALE` |
| S7 | **Alarme** : ligne `ALARM:n` ou état `Alarm` | annuler | `ETOUCH_FRAME_ALARM` |
| S8 | Référence perdue (`r.homed` faux), preuve D2 changée (`r.offset.proof()` ≠ celle du départ), usinage démarré d'ailleurs (`workflow` ≠ `idle`), feeder occupé par autrui au moment d'écrire, broche vue en marche, état ni `Idle` ni `Jog` (`Run`, `Hold`, `Home`, `Door`, `Check`, `Sleep`) | annuler | `ETOUCH_FRAME_STATE` (`state` = la cause) |
| S9 | Réponse `error:N` reçue pendant la séquence (quelle que soit la ligne visée) | **annuler** (le laser se contente aujourd'hui de finir, sans `0x85`) ; si N = 15, D2 est invalidé | `ETOUCH_FRAME_REFUSED` |
| S10 | Ligne sans fin dans son délai, ou relâchée sans `ok` | annuler | `ETOUCH_FRAME_TIMEOUT` |
| S11 | **Arrivée inattendue** (§ 5.3) | annuler ; D2 invalidé | `ETOUCH_FRAME_POSITION` |

Une ligne ne part que si : la précédente a reçu son `ok`, deux rapports postérieurs ne disent pas `Jog`, l'état est `Idle`, l'arrivée est conforme, et S1 à S10 sont faux **à cet instant**.

### 5.3 L'arrivée comparée

Après chaque `$J=` revenu au repos, la position machine rapportée est comparée à la position attendue (tolérance 0,05 mm) :
- après la ligne Z : Z = `zs` ; X, Y inchangés ;
- après chaque ligne X/Y : X, Y = cible pièce + décalage du plan ; Z pas plus bas que le Z constaté après la montée.

Elle prouve trois choses que rien d'autre ne prouve : que Z est **réellement** en haut avant le premier X/Y ; que la carte place les coordonnées pièce là où le contrôle des courses les a placées (doute C9) ; qu'un déplacement n'a pas été écourté par un autre client.

Elle ne voit pas des pas perdus (la position rapportée est le compte de la carte).

## 6. Événements et réactions

| Événement | Réaction du serveur | État laissé | Ce que voit l'opérateur |
|---|---|---|---|
| **Arrêter** (tablette, autre appareil, sans la main) | `perform` : annule la séquence dans le même pas, `0x85` (`moves.stop('stop')`). Ni retenue ni reset. | Fraise arrêtée où elle est, Z gardé (peut-être en cours de montée). Référence et zéro gardés. | « Cadrage arrêté. » |
| **Pause** | Identique (`moves.stop('pause')`) : un déplacement manuel ne se suspend pas, le cadrage ne reprend pas. `canPause` vaut vrai pendant un cadrage. | idem | idem |
| Relâchement / `jog-stop` | Identique (`'operator'`). | idem | idem |
| **Arrêter la broche** pendant le cadrage | Même arrêt que Arrêter, **sans écrire `M5`** : en état `Jog` la carte refuserait la ligne et son `error` brouillerait la séquence (cas déjà traité ainsi pour le palpage au bloc, `job-service.js:2257-2262`). | idem | idem |
| Arrêt venu de CNCjs classique (`!`, `feedhold`, `gcode:stop`, `reset`, 0x18…) | `socketStop` annule la séquence **avant** de laisser passer la commande (défaut P1). | Selon la commande ; après un reset : alarme, référence perdue. | « Cadrage arrêté… » puis l'état réel |
| Commande non sûre de CNCjs classique pendant le cadrage | Refusée par `socketRefusal`, même venant du détenteur de la main. | inchangé | — |
| **Flux perdu** (page fermée, tablette éteinte, réseau) | S4 : arrêt immédiat à la fermeture du dernier flux de l'appareil ; 3 s de grâce pour une rotation ; rien ne part sans flux. | arrêtée | « Suivi interrompu », puis au retour « Cadrage arrêté avant la fin… » |
| Page rechargée | Son flux se ferme ; si le même appareil en rouvre un en moins de 3 s, le cadrage continue et la page l'affiche depuis l'état reçu ; sinon S4. | — | l'avancement, ou l'arrêt |
| **Main perdue** (prise, rendue par F4, expirée) | S5, dans le même pas que le changement. La main n'expire pas d'elle-même pendant un cadrage (`busy`, `job-service.js:2555-2557`). | arrêtée | « C'est … qui a la main » + résultat |
| **Alarme** | S7. Aucun déverrouillage, aucune prise d'origine automatique. | Référence perdue (logique existante, `job-service.js:485-503`). | Remise en route |
| **Redémarrage de la carte** | S2 : rien n'est écrit dans la nouvelle session. | MPos 0, référence perdue (`job-service.js:504-557`). | « Origine machine pas prise » |
| **Redémarrage de CNCjs** | Le serveur n'existe plus : personne ne peut annuler. La carte finit le segment en cours (au plus un côté, dans l'enveloppe contrôlée, en haut), puis s'arrête seule. Au retour, CNCjs ne connaît ni la référence ni la version : tout est refusé jusqu'à la relecture et la prise d'origine. Aucune reprise du cadrage. | Fraise en haut, quelque part sur le rectangle. | « Suivi interrompu », puis Machine |
| Liaison USB coupée, port fermé | S1 : rien ne peut être écrit ; la carte finit le segment si elle est encore alimentée. L'arrêt d'urgence coupe l'USB et la puissance (C12). | — | « Non connectée » |
| **Client tiers** par CNCjs | Sans la main : refusé par le bail. Avec la main, ou arrêt : lignes ci-dessus. | — | — |
| **Client tiers par le Wi-Fi de la carte** (hors CNCjs, `FIRMWARE.md` R12) | Ne peut pas être empêché. Détecté par : état inattendu (S8), bannière (S2), alarme (S7), décalage ou repère changé (D2 s'invalide, S8), `error` (S9), arrivée inattendue (S11). | arrêtée | résultat codé |
| **Rapport périmé** | S6. Si la liaison est morte, `0x85` n'arrive pas : le segment borné finit. | — | « Information ancienne » |
| Annulation non confirmée après 5 s | Existant : journalisée, `0x85` répété tant que `Jog` est rapporté, au plus la durée prévue du segment (`motion.js:605-622`). | — | « ANNULATION NON CONFIRMÉE : utilisez l'arrêt physique… » (existant, `seance.js:198`) |
| Arrêt ou perte pendant l'attente de relecture du fichier (avant la première ligne) | Existant (FINAL 3) : annulé sans rien écrire. | inchangé | « Départ annulé. » |
| Ticket expiré, fichier ou position changés entre la confirmation et le lancement | G17. | inchangé | « La confirmation n'est plus valable. Recommencez. » |
| Service arrêté proprement (`dispose`) | Existant : un `0x85` (`motion.js:1192-1211`). | — | — |

**Limites assumées.** (1) Entre la mort du serveur ou de la liaison et la fin du segment, seul l'arrêt physique agit : au plus 60 s et un côté du rectangle. (2) Un appareil distant qui disparaît sans fermer sa connexion n'est vu perdu que lorsque l'écriture du flux échoue ; ce délai n'est pas mesuré. Le kiosque, en boucle locale, se ferme franchement. (3) Le cadrage ne prouve pas l'absence d'obstacle : la case le fait attester.

## 7. Codes de refus et d'arrêt

La phrase de l'opérateur est celle de la **famille** (`touch/i18n-messages-refus.js`, composant `touch/refus.js`) ; le message du serveur n'apparaît que dans « Détails ». Les codes existants gardent leur famille.

### 7.1 Familles nouvelles (phrase de l'opérateur)

| Famille | FR | EN | ES | Remède |
|---|---|---|---|---|
| `cadrage-arrete` | Cadrage arrêté avant la fin. Regardez où est la fraise avant de continuer. | Framing stopped before the end. Check where the bit is before going on. | Encuadre detenido antes del final. Mire dónde está la fresa antes de seguir. | [Recommencer] |
| `cadrage-position` | La fraise n'est pas arrivée là où le cadrage l'attendait. Refaites le zéro pièce. | The bit did not arrive where framing expected it. Set the work zero again. | La fresa no llegó adonde el encuadre la esperaba. Rehaga el cero de la pieza. | [Refaire le zéro pièce] [Recommencer] |
| `cadrage-limites` | Les limites de course de la machine sont coupées. Le cadrage est refusé. | The machine's travel limits are switched off. Framing is refused. | Los límites de recorrido de la máquina están desactivados. Encuadre rechazado. | [Détails] |

### 7.2 Codes nouveaux : refus avant le mouvement

| Code | Message du serveur (FR) | EN | ES | Famille → remède |
|---|---|---|---|---|
| `ETOUCH_CNC_FRAME_LASER` | Machine déclarée laser : le cadrage à vide est réservé à la CNC. | Machine declared as a laser: framing in the air is for a CNC only. | Máquina declarada láser: el encuadre en vacío es solo para una CNC. | `type-machine` → [Type de machine…] |
| `ETOUCH_CNC_FRAME_NOT_HOMED` | Cadrage refusé : machine non référencée. Faites la prise d'origine. | Framing refused: machine not homed. Home it first. | Encuadre rechazado: máquina sin referenciar. Busque primero el origen. | `origine-a-prendre` → [Prise d'origine machine…] |
| `ETOUCH_CNC_FRAME_SOFT_LIMITS` | Cadrage refusé : les limites logicielles de la carte ($20) ne sont pas actives ; rien n'arrêterait un dépassement. | Framing refused: the board's soft limits ($20) are not active; nothing would stop an overrun. | Encuadre rechazado: los límites por software de la placa ($20) no están activos; nada detendría un rebasamiento. | `cadrage-limites` → [Détails] |
| `ETOUCH_CNC_FRAME_OUTSIDE` (`count`, `reasons`) | Cadrage refusé : le rectangle du programme sort de la course de la machine (dépassements : {count}). | Framing refused: the program's rectangle leaves the machine travel (overruns: {count}). | Encuadre rechazado: el rectángulo del programa sale del recorrido de la máquina (rebasamientos: {count}). | Affiché par sa première raison, comme `ETOUCH_START_OUTSIDE` (`refus.js:18`) : `depasse` « Le fichier dépasse de {N} mm en {axe}. Déplacez la pièce, puis refaites le zéro pièce. » → [Refaire le zéro pièce] [Choisir un fichier] |
| `ETOUCH_CNC_FRAME_START` (`axis`, `value`, `low`, `high`) | Cadrage refusé : la position actuelle {axis} {value} mm machine est hors de la course utilisable ({low} → {high}). | Framing refused: the current position {axis} {value} mm (machine) is outside the usable travel ({low} → {high}). | Encuadre rechazado: la posición actual {axis} {value} mm máquina está fuera del recorrido utilizable ({low} → {high}). | `cadrage` (« Le cadrage n'est pas possible. ») → [Détails] |
| `ETOUCH_CNC_FRAME_Z` | Cadrage refusé : hauteur sûre incalculable (course ou position Z inconnue). | Framing refused: the safe height cannot be computed (Z travel or position unknown). | Encuadre rechazado: no se puede calcular la altura segura (recorrido o posición Z desconocidos). | `cadrage` → [Détails] |

### 7.3 Codes nouveaux : arrêts pendant le mouvement (`motion.lastFrame.code`)

| Code | Message du serveur (FR) | EN | ES | Famille → remède |
|---|---|---|---|---|
| `ETOUCH_FRAME_STREAM` | Cadrage arrêté : l'appareil qui l'a lancé ne suit plus la machine (connexion perdue). | Framing stopped: the device that started it no longer follows the machine (connection lost). | Encuadre detenido: el dispositivo que lo inició ya no sigue la máquina (conexión perdida). | `cadrage-arrete` → [Recommencer] |
| `ETOUCH_FRAME_CONTROL` | Cadrage arrêté : le pilotage a changé de main. | Framing stopped: control changed hands. | Encuadre detenido: el control ha cambiado de manos. | `cadrage-arrete` |
| `ETOUCH_FRAME_STALE` | Cadrage arrêté : la machine ne donne plus de nouvelles (rapports trop anciens). | Framing stopped: no news from the machine (reports too old). | Encuadre detenido: la máquina no da noticias (informes demasiado antiguos). | `cadrage-arrete` |
| `ETOUCH_FRAME_TIMEOUT` | Cadrage arrêté : un déplacement n'a pas fini à temps. Vérifiez la machine. | Framing stopped: a move did not finish in time. Check the machine. | Encuadre detenido: un desplazamiento no terminó a tiempo. Compruebe la máquina. | `cadrage-arrete` |
| `ETOUCH_FRAME_STATE` (`state`) | Cadrage arrêté : la machine a changé d'état pendant le cadrage ({state}). | Framing stopped: the machine changed state during framing ({state}). | Encuadre detenido: la máquina cambió de estado durante el encuadre ({state}). | `cadrage-arrete` |
| `ETOUCH_FRAME_REFUSED` (`n`) | Grbl a refusé le jog (error:{n}) | Grbl refused the jog (error:{n}) | Grbl rechazó el jog (error:{n}) | `cadrage-arrete` ; la phrase existante « La machine a refusé le déplacement (erreur {n}). » s'applique par la règle de `refus.js:29-30` → [Détails] |
| `ETOUCH_FRAME_ALARM` (`alarm`) | Cadrage arrêté : alarme machine[ (ALARM:{alarm})]. | Framing stopped: machine alarm[ (ALARM:{alarm})]. | Encuadre detenido: alarma de la máquina[ (ALARM:{alarm})]. | `alarme` → [Remise en route] |
| `ETOUCH_FRAME_RESTART` | Cadrage arrêté : la carte a redémarré. Sa position est perdue. | Framing stopped: the board restarted. Its position is lost. | Encuadre detenido: la placa se ha reiniciado. Ha perdido su posición. | `origine-a-prendre` → [Prise d'origine machine…] |
| `ETOUCH_FRAME_POSITION` (`axis`, `expected`, `reported`) | Cadrage arrêté : {axis} machine {reported} au lieu de {expected} attendu. La carte n'applique peut-être pas le zéro affiché. | Framing stopped: machine {axis} {reported} instead of {expected} expected. The board may not apply the zero shown. | Encuadre detenido: {axis} máquina {reported} en lugar de {expected} esperado. Puede que la placa no aplique el cero mostrado. | `cadrage-position` → [Refaire le zéro pièce] [Recommencer] |

Un arrêt demandé par l'opérateur (Arrêter, Pause, relâchement, Arrêter la broche) ne porte pas de code : ce n'est pas un refus.

### 7.4 Codes existants repris tels quels

`ETOUCH_LASER_FRAME_DISABLED`, `_NO_PROGRAM`, `_CHECK`, `_BOUNDS`, `_WCS`, `_POSITION`, `_FEED`, `_SLOW`, `_CHANGED`, `_EXPIRED` (leurs phrases ne parlent pas de laser : `i18n-messages-machine.js:67-76`) ; `ETOUCH_MACHINE_*` ; `ETOUCH_MOTION_DISABLED`, `_HOMING`, `_ALARM`, `_STATE` ; `ETOUCH_OFFSET_*`. Leur nom contient « LASER » pour certains : on ne les renomme pas (catalogue, familles et tests en dépendent).

## 8. L'instantané

Ajouts à l'état publié par contrôleur (`snapshot`, `job-service.js:1590-1772`). Rien n'est retiré ni renommé.

| Champ | Valeur | Usage |
|---|---|---|
| `machineProfile.capabilities.cncFrame` | `{supported, reason, code}` | La page sait si le cadrage à vide existe pour cette machine (G3). |
| `canFrame`, `frameReason`, `refusals.frame` | résultat du garde complet G3 à G16 **maintenant**, pour le type de la machine ; `refusals.frame` = `{code, params, reasons}` quand le refus est codé | Bouton plein ou rayé, avec sa phrase et son remède. Calculé comme `startReason` (`job-service.js:1606`). |
| `motion.frame.kind` | `'laser'` \| `'cnc'` | |
| `motion.frame.phase` | `'spindle'` \| `'raise'` \| `'approach'` \| `'side'` \| `'return'` (la ligne en cours) | Ligne d'avancement. |
| `motion.frame.side`, `motion.frame.sides` | n° du côté en cours (ou `null`), nombre de côtés du plan | « côté 2 sur 4 ». |
| `motion.frame` (existants) | `lines`, `index`, `since`, `owner` | inchangés |
| `motion.lastFrame.kind`, `.code`, `.params`, `.revision` | type, code d'arrêt du § 7.3 ou `null`, ses valeurs, révision du fichier cadré | Résultat affiché tant que ce fichier est chargé. |
| `motion.lastFrame` (existants) | `result` (`ended`, `cancelled`, `refused`, `lost`), `reason`, `message`, `sent`, `total`, `at` | inchangés ; `reason` gagne `restart`, `offset`, `reference`, `spindle`, `timeout`, `position` |
| `canPause` | vrai aussi pendant un cadrage | Pause arrête le cadrage. |

Réponse de `frame-prepare` (existante, complétée) : `frame: { kind, lines, bounds, feed, zFeed, safeZ: { machine, rise }, start: { x, y }, seconds }` (`seconds` = durée estimée, pour « environ 2 min »).

Journal (`history`) : l'événement `frame` existant, avec `kind`, `code`, la hauteur sûre et la montée.

`ticketPending` (rotation du flux) et la signature de changement (`moves.signature`) tiennent compte du cadrage en cours et de sa phase.

## 9. L'écran

### 9.1 Où

**4 · Contrôle**, carte « Verdict », dans cet ordre : les trois lignes du verdict, la ligne broche, « Rapides au départ », **[Cadrer à vide…]** (64 px de haut, toute la largeur de la carte), sa ligne d'état, [Détails du contrôle]. C'est le bouton existant `#check-frame-start` (laser : « Cadrer… », inchangé), désormais montré aussi pour la CNC ; « Rapides au départ » reste visible en CNC. Ligne d'état : `#check-frame-state` (`role="status"`), sous le bouton ; `#check-frame-reason` garde son rôle.

À vérifier au harnais : la carte tient sans défilement ni recouvrement en 1366 × 768 (v1) et 1366 × 911 (v2), texte normal et agrandi. Si elle ne tient pas en 768, le bouton passe à 56 px avant toute autre mesure ; ne rien masquer.

Aucune commande sur un autre écran. L'en-tête (état, La main, Pause, Arrêter) ne change pas.

### 9.2 Libellés exacts

| Élément | FR | EN | ES |
|---|---|---|---|
| Bouton `#check-frame-start` (CNC) | Cadrer à vide… | Frame in the air… | Encuadrar en vacío… |
| Titre du dialogue | Cadrer à vide | Frame in the air | Encuadrar en vacío |
| Texte du dialogue (`#job-warning`) | La fraise monte tout en haut, puis fait le tour du fichier, broche arrêtée. Elle ne redescend pas. | The bit rises to the top, then goes around the file, spindle stopped. It does not come back down. | La fresa sube hasta arriba y recorre el contorno del archivo, con el husillo parado. No vuelve a bajar. |
| Ligne de mesure du dialogue | {L} × {l} mm · environ {N} min | {L} × {l} mm · about {N} min | {L} × {l} mm · unos {N} min |
| Case (`#job-check-text`) | Je suis devant la machine et rien de haut ne gêne la broche. | I am at the machine and nothing tall is in the spindle's way. | Estoy delante de la máquina y nada alto estorba al husillo. |
| Bouton d'engagement (`#job-confirm`) | Lancer le cadrage (existant) | (existant) | (existant) |
| État : montée | Cadrage à vide : la fraise monte. | Framing: the bit is rising. | Encuadre: la fresa sube. |
| État : approche | Cadrage à vide : vers le premier coin. | Framing: going to the first corner. | Encuadre: hacia la primera esquina. |
| État : côté | Cadrage à vide : côté {n} sur {N}. | Framing: side {n} of {N}. | Encuadre: lado {n} de {N}. |
| État : retour | Cadrage à vide : retour au point de départ. | Framing: back to the starting point. | Encuadre: vuelta al punto de partida. |
| Résultat : fini | Cadrage terminé. La fraise est restée en haut. | Framing done. The bit stayed up. | Encuadre terminado. La fresa se ha quedado arriba. |
| Résultat : arrêté par l'opérateur | Cadrage arrêté. | Framing stopped. | Encuadre detenido. |
| Raison du bouton rayé pendant un cadrage | Cadrage en cours. | Framing in progress. | Encuadre en curso. |
| Dialogue « La main » (existant) | Un cadrage est en cours : prendre la main l'arrête. | (existant) | (existant) |

« Détails » du dialogue (seul endroit où paraissent des mots techniques) : les lignes du plan, la vitesse, la hauteur sûre en position machine, la montée, le rectangle, et « Le cadrage suit le centre de la fraise. Il ne vérifie ni les brides ni la profondeur. ».

Confirmation : classe « met la machine en mouvement » (`SPEC-REFONTE.md` § 6.3), trois touchers, case exigée, bouton d'engagement armé après 600 ms, ticket de 15 s. Rien de plus léger.

### 9.3 États

| État | Bouton | Sous le bouton |
|---|---|---|
| Machine laser | « Cadrer… » : comportement actuel, inchangé | inchangé |
| Disponible (`canFrame`) et page de confiance (état récent, la main ici ou libre, flux ouvert) | plein | dernier résultat pour ce fichier, s'il y en a un |
| Refusé (`canFrame` faux) | **rayé**, à sa place | la phrase de la famille et son remède (`cncRefus.montrer` avec `refusals.frame`) ; à défaut de code, `frameReason` |
| Main ailleurs | rayé | « La main est sur un autre appareil. » (existant) |
| Cadrage en cours | rayé | la ligne d'état de la phase ; [Démarrer l'usinage…] est rayé par le serveur (« déplacement en cours ») ; l'en-tête montre « Déplacement », Pause et Arrêter actifs |
| Terminé | plein | « Cadrage terminé. La fraise est restée en haut. » |
| Arrêté par l'opérateur | plein | « Cadrage arrêté. » |
| Arrêté par une cause | selon `canFrame` | bande de refus du code (§ 7.3) avec son remède |

L'avancement et le résultat viennent **uniquement** de l'état reçu (`motion.frame`, `motion.lastFrame`) : une page rechargée ou une seconde tablette montrent la même chose. La page ne calcule aucune autorisation et n'envoie jamais de ligne.

Appels : `cncJobControls.prepareFrame()` → `machine/frame-prepare` → dialogue → `machine/frame` avec le numéro du ticket (chemin existant, `job-controls.js:556, 660, 760`). La garde locale `laserFrame(state)` (`job-controls.js:284-288`) devient « capacité de cadrage du type de la machine ». Le type vient du ticket (`frame.kind`), pas d'un paramètre de la page.

## 10. Tests exigés

Chaque test échoue sans le code. Aucun test existant n'est modifié, sauf mention. Serveur : Jest, dans `src/server/services/touch/__tests__/`. Page : `examples/cncjs-touch/test-*.cjs`, enregistrés dans `verify-project.cjs`.

### 10.1 Serveur, faux contrôleur (`cnc-frame.test.js`)

Plan et gardes :
1. Profil CNC, tout prêt : le ticket porte exactement `M5`, une ligne Z relative positive, cinq lignes X/Y, la ligne de retour ; vitesses 600 et 300 par défaut ; `safeZ`, `seconds`.
2. Z déjà au-dessus de la hauteur sûre : aucune ligne Z ; Z à 0,005 sous la hauteur sûre : aucune ligne Z (seuil 0,01).
3. Propriété : pour toute position Z de départ dans la course, aucune ligne du plan ne contient de Z négatif ni de mot Z hors de la ligne 1 ; le module d'écriture refuse un plan qui en contiendrait (ligne Z signée, Z dans une ligne X/Y, ligne Z ailleurs qu'en position 1, `M3`, `G0`, `G53`).
4. Rectangle plat et point unique : les segments nuls ne sont pas écrits ; départ déjà sur le premier coin : pas de ligne d'approche ni de retour.
5. Un refus par garde, avec son code et **aucune écriture** : laser (`_LASER`), `$32=1` sans déclaration, déplacements désactivés, pas de prise d'origine (`_NOT_HOMED`, y compris avec `$22=0`), D2 non prouvé (les trois codes), broche en marche, pas de fichier, X `unknown` (`_CHECK` avec raisons), X `outside` (`_OUTSIDE` avec `axis`, `sign`, `over`, `value`, `limit` exacts), `$20=0` et `$20` inconnu (`_SOFT_LIMITS`), course Z inconnue (`_Z`), position de départ dans la bande de 0,5 mm (`_START`), autre repère, vitesse hors bornes, segment de plus de 60 s, main ailleurs, flux d'un autre appareil.
6. Verdict Z `outside` du fichier : le cadrage reste permis, le départ reste refusé.
7. Ticket : usage unique, expiration, autre flux, fichier changé sur disque, machine déplacée entre la confirmation et le lancement (`_CHANGED`).
8. Chaque message de serveur nouveau a sa ligne de catalogue FR identique, et ses lignes EN et ES (`expectCatalogMatch`).

Séquence :
9. Une ligne à la fois : la ligne n + 1 ne part pas avant l'`ok`, ni avec un seul rapport après l'`ok`, ni tant que l'état est `Jog`.
10. Les lignes X/Y ne partent pas si Z n'est pas constaté à la hauteur sûre : arrivée à 0,06 mm trop bas → `ETOUCH_FRAME_POSITION`, aucune ligne X/Y.
11. Arrivée X/Y décalée de 0,06 mm → arrêt `ETOUCH_FRAME_POSITION`, D2 invalidé, plus rien d'écrit ; décalée de 0,04 mm → continue.
12. Fin normale : `lastFrame.result === 'ended'`, `kind`, `revision`, événement de journal, `canFrame` de nouveau vrai.

Arrêts (à chaque fois : `0x85` écrit, **plus aucune ligne ensuite**, y compris après retour à `Idle` et 60 s de plus ; pas de `!`, pas de 0x18, pas de `M5` supplémentaire) :
13. Arrêter, Pause, `jog-stop`, Arrêter la broche (sans `M5` écrit) : pendant `M5`, pendant la montée, pendant un côté, entre deux lignes.
14. Arrêter par un appareil qui n'a pas la main.
15. `socketStop` pendant un côté et entre deux lignes (échoue aujourd'hui : P1) ; `socketRefusal` non nul pendant tout le cadrage.
16. Flux : rotation puis réouverture par le même appareil en moins de 3 s → continue, et aucune ligne n'est écrite pendant l'absence (échoue aujourd'hui : P2) ; pas de réouverture → arrêt à 3 s ; fermeture réelle du dernier flux → arrêt immédiat ; autre flux du même appareil resté ouvert → continue ; flux d'un autre appareil seul → arrêt. `ticketPending` vrai pendant le cadrage.
17. Main : prise par un autre, rendue (`control/release`), devenue libre → arrêt dans le même pas que l'action (avant tout tic d'horloge).
18. Rapport de plus de 2,5 s → arrêt.
19. Alarme (ligne `ALARM:n`, puis état `Alarm` sans ligne) → arrêt, code `_ALARM`.
20. Bannière puis rapports `Idle` (machine à `$22=0` et à `$22=1`) → fin `_RESTART`, **aucun octet écrit après la bannière** (échoue aujourd'hui : P3).
21. `error:15` pendant un côté → `0x85`, `_REFUSED`, D2 invalidé ; `error:9` → `0x85`, `_REFUSED`, D2 gardé.
22. Délai d'une ligne dépassé, et ligne relâchée sans `ok` → `_TIMEOUT`, pas de ligne suivante.
23. Pendant le cadrage : D2 invalidé de l'extérieur, `r.homed` devenu faux, `workflow` devenu `running`, état `Hold` → `_STATE`.
24. Déplacements réels désactivés pendant le cadrage → arrêt.
25. Contrôleur fermé → fin `lost` sans écriture.

Exclusions et instantané :
26. Pendant le cadrage : chargement, départ, prise d'origine, déverrouillage, pas, déplacement continu, zéro, palpages, macro, relecture des réglages, commande système et second cadrage sont refusés ; D2 ne lance pas de transaction ; `canStop` et `canPause` vrais ; la main n'expire pas.
27. `motion.frame.phase` et `side` à chaque ligne ; `canFrame`/`refusals.frame` pour chaque garde du test 5.

Non-régression du laser : toute la suite `laser framing (§4)` de `machine-profile.test.js` passe sans modification ; un test ajouté prouve que les lignes du cadrage laser sont inchangées octet pour octet et qu'il n'y a ni ligne Z ni garde `$20` pour le laser.

### 10.2 Serveur, simulateur au profil LUNYEE (`cnc-frame-lunyee.test.js`, pont `support/sim-bridge.js`)

Petits rectangles et vitesse 1500 pour tenir le temps réel du simulateur.

- L1. Après un vrai `$H` et la **vraie** preuve D2 (`createWorkOffset`), dans les deux hypothèses `executedAfterHoming: 'zero'` et `'stored'` : la séquence complète se déroule ; à chaque coin la position machine du simulateur vaut coin pièce + G54 ; à la fin X/Y = départ et Z = −5.
- L2. Juste après `$H`, avant la preuve D2 : préparation refusée (`ETOUCH_OFFSET_CHECKING`), rien d'écrit.
- L3. Rectangle dont le bord machine est à 407,5 : accepté et exécuté sans `error:15` (le simulateur refuse à 407,8) ; à 407,6 : refusé `_OUTSIDE`, dépassement 0,1 mm en X+ ; mêmes cas en Y (395,5 / 395,6) et côté origine (0 accepté, −0,1 refusé).
- L4. Z juste après la prise d'origine (0) : aucune ligne Z, le Z du simulateur ne change à aucun moment ; Z à −8 : monte à −5, jamais en dessous de −8 pendant toute la séquence (relevé à chaque rapport).
- L5. Arrêter pendant un côté : le simulateur revient à `Idle` entre deux coins, aucune bannière, `homed` et D2 gardés, plus rien d'écrit ; un nouveau cadrage part de là et se termine.
- L6. `!` écrit par un client CNCjs pendant un côté (par `refuseSocket`) : le simulateur annule le déplacement, la séquence est finie, aucune ligne ne repart.
- L7. Reset (0x18) pendant un côté : `ALARM:3` et redémarrage du simulateur ; rien d'écrit après la bannière ; `homed` faux ; cadrage et départ refusés.
- L8. Décalage exécuté différent du rapporté **après** la preuve (forcé dans le test : `sim.offsetVoid = { executed: true, reported: false }`) : (a) cible exécutée dans la course → arrêt `_POSITION` après le premier segment X/Y, D2 invalidé ; (b) cible exécutée hors course → `error:15` du simulateur, `_REFUSED`, D2 invalidé, aucun mouvement X/Y. Dans les deux cas Z est resté en haut.
- L9. `$20=0` dans le simulateur : refus `_SOFT_LIMITS`, rien d'écrit.
- L10. Après un redémarrage de la carte (non référencée) : refus `_NOT_HOMED`.

### 10.3 Page (`test-cnc-frame.cjs`, plus les bancs existants)

- Le bouton est présent en CNC avec « Cadrer à vide… », jamais masqué ; rayé avec sa phrase et son remède pour : pas de prise d'origine, zéro pièce en vérification, dépassement chiffré (« dépasse de 12,3 mm en X+ » à partir de `refusals.frame.reasons[0]`), main ailleurs, état périmé, flux absent (règle FIGE) ; « Rapides au départ » toujours visible en CNC.
- Laser : bouton, libellés, dialogue et appels inchangés (les tests laser existants passent tels quels).
- Dialogue CNC : titre, texte, ligne de mesure, case, bouton d'engagement désactivé sans la case et avant 600 ms ; « Détails » contient les lignes ; aucun mot interdit hors « Détails » (`test-textes-regles.cjs`).
- Un ticket n'est jamais rejoué ; changement de session, de flux ou de fichier : dialogue fermé.
- Avancement : chaque phase donne sa phrase à partir d'un état injecté ; résultat « terminé », « arrêté », et chaque code du § 7.3 avec sa famille et son remède ; [Recommencer] ouvre une **nouvelle** préparation.
- Arrêter et Pause de l'en-tête restent actifs et partent sans délai pendant un cadrage.
- `test-refus-table.cjs` : chaque code nouveau a sa famille ; `test-i18n` : chaque chaîne a ses trois langues.
- Géométrie : `browser-run.cjs --strict --only <étapes de Contrôle>` en 1366 × 768 v1 et 1366 × 911 v2, texte normal et agrandi : pas de débordement de la carte Verdict, bouton ≥ 56 px, cibles ≥ 48 px. Les autres écrans ne changent pas d'un pixel.

### 10.4 À chaque commit

`node examples/cncjs-touch/verify-project.cjs` ; `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false` ; ESLint sur les fichiers touchés ; l'étape de harnais ci-dessus.

## 11. Entrée pour `SURETE.md`

À ajouter par l'orchestrateur après la réalisation, en remplaçant les intitulés de tests par ceux réellement écrits.

> ## F1 — Cadrage à vide sur la CNC (2026-11)
>
> | Commande / garde | Avant → après réel | Preuve durable |
> |---|---|---|
> | Cadrage à vide, **mouvement nouveau** | Absent en CNC (cadrage réservé au laser) → `M5`, une montée Z seule en relatif positif jusqu'à 5 mm sous le haut de la course (`$J=G91 G21 Z… F300`), le tour du rectangle X/Y du fichier en coordonnées pièce (`$J=G90 G21 X… Y… F600`), retour au point de départ X/Y. Z ne redescend jamais : la seule forme de ligne Z acceptée n'a pas de signe. Aucun `G0`/`G1`, aucun reset, aucune retenue. | `T/cnc-frame.test.js` : plan, propriété « jamais de Z négatif », formes de lignes refusées ; `T/cnc-frame-lunyee.test.js` : L1, L4. |
> | Gardes avant | Celles du cadrage laser, plus : prise d'origine constatée (même si `$22=0`), broche à l'arrêt, `$20=1`, hauteur sûre calculable, toutes les cibles (retour compris) dans la course utilisable, dépassement X/Y refusé avec son chiffre. D2 exigé. Ticket à case, 15 s, lié au flux, plan refait identique à l'exécution. | `T/cnc-frame.test.js` : un refus par garde, rien d'écrit ; L2, L3, L9, L10. |
> | Surveillance | Liée à l'appareil (3 s de grâce à la rotation du flux, rien n'est écrit sans flux), à la main telle qu'au départ, à la session de la carte, aux rapports (2,5 s), à la référence et à la preuve D2 ; arrivée de chaque déplacement comparée à la position machine attendue (0,05 mm). | `T/cnc-frame.test.js` : flux, main, bannière, alarme, périmé, arrivée ; L8. |
> | Arrêts | Arrêter, Pause, relâchement, Arrêter la broche, arrêt d'un socket CNCjs : fin de la séquence dans le même pas, puis `0x85` seul. Référence et zéro gardés. Une commande non sûre d'un socket est refusée pendant le cadrage. | `T/cnc-frame.test.js` : arrêts à chaque phase ; L5, L6, L7. |
>
> **Limites.** Le simulateur annule un déplacement sans rampe : la distance d'arrêt réelle n'est pas prouvée. `$J=G90` en coordonnées pièce et `0x85` n'avaient pas de relevé sur la LUNYEE avant l'essai F1 du protocole. Si le serveur, la liaison ou CNCjs meurent pendant un côté, la carte finit ce côté (au plus 60 s, dans l'enveloppe contrôlée, fraise en haut) : seul l'arrêt physique agit. Un appareil distant qui disparaît sans fermer sa connexion n'est vu perdu qu'à l'échec d'écriture du flux. Le cadrage suit le centre de la fraise, ne vérifie ni brides ni profondeur, et ne voit pas des pas perdus. Une arrivée inattendue arrête le cadrage et invalide D2, mais ne verrouille pas le départ une fois D2 prouvé de nouveau.

## 12. Essai réel, pas à pas

À conduire par l'opérateur, sur place, après les suites vertes et l'installation décidée par lui. Règles générales de `PROTOCOLE-ESSAI.md` § 2 (relevé, arrêt physique à portée, suspendre au premier doute). **Pour toutes les phases A à C : broche débranchée de son alimentation.**

**Avant.** Relire les réglages et noter `$20`, `$110-$112`, `$120-$122`, `$130-$132`. Si `$20` ne vaut pas 1, le cadrage sera refusé : c'est voulu ; décider avec l'opérateur de le remettre (réglage de la carte, hors de ce lot). Garder CNCjs classique ouvert sur le PC, en observateur, pour lire les lignes écrites et les réponses.

**A. Sans mouvement.**
1. Carte connectée, sans prise d'origine, un fichier chargé : sur Contrôle, « Cadrer à vide… » est rayé, avec « Origine machine pas prise… » et son remède.
2. Prise d'origine. Pendant la vérification du zéro pièce : bouton rayé, « La machine vérifie le zéro pièce… ». Puis plein.
3. Poser un zéro pièce tel que le fichier dépasse en X : bouton rayé, « Le fichier dépasse de N mm en X+… ». Comparer N au dessin de Contrôle. Remettre un zéro correct.
4. Prendre la main depuis le PC : bouton rayé sur la tablette. La rendre.

**B. Premier mouvement : table vide, sans fraise.**
5. Table entièrement dégagée, pince sans fraise. Petit fichier connu (rectangle d'environ 100 × 50 mm). Zéro pièce posé vers le milieu de la table. Descendre Z à la main vers −60 (position machine).
6. « Cadrer à vide… », lire le dialogue (dimensions, durée), cocher, « Lancer le cadrage ». Main sur l'arrêt physique.
7. Constater dans l'ordre : `M5` ; Z monte **seul** et s'arrête à Z machine −5,000 ; puis X/Y vers le premier coin ; quatre côtés ; retour au-dessus du point de départ ; Z n'a jamais baissé. Relever au PC la position machine à chaque coin et la comparer à coin + zéro pièce (0,05 mm). Chronométrer un côté : 100 mm doivent prendre 10 s (600 mm/min).
8. Vérifier après : état Repos, pas d'alarme, pas de bannière, prise d'origine et zéro pièce toujours valides, « Cadrage terminé. La fraise est restée en haut. ».
9. Refaire avec Z déjà en haut (juste après une prise d'origine) : aucune montée, Z ne bouge pas.

**C. Les arrêts, toujours table vide.**
10. Relancer depuis Z −60 ; **Arrêter pendant la montée**. Constater : arrêt net, X/Y n'ont pas bougé, aucune bannière, référence gardée. Relancer : la montée repart de là.
11. Relancer ; **Arrêter au milieu d'un grand côté**. Mesurer le temps et la distance entre le toucher et l'arrêt (attendu : quelques millimètres). Constater : position machine gardée (comparer à une marque), pas d'alarme, plus aucun mouvement pendant une minute.
12. Même essai avec **Pause**.
13. Lancer le cadrage depuis la page Touch du PC, puis **fermer l'onglet** pendant un côté : arrêt immédiat. Recommencer en **prenant la main** depuis la tablette pendant un côté : arrêt.
14. Pendant un côté, toucher « feed hold » dans CNCjs classique : la fraise s'arrête et **ne repart pas**.
15. Facultatif, une seule fois : arrêt physique pendant un côté. Tout s'arrête ; au retour : reconnecter, relire, prise d'origine. Le cadrage ne reprend pas.

Ne **pas** essayer : une cible hors course « pour voir », `$20=0`, un reset en mouvement, un redémarrage de CNCjs pendant un côté.

**D. Avec la pièce, fraise montée, broche toujours débranchée.**
16. Brider la planche, monter la fraise, faire le zéro pièce habituel. Regarder qu'aucun objet sur la table n'est plus haut que la fraise relevée (tuyau d'aspiration, serre-joint).
17. Cadrer. Constater que le rectangle parcouru est celui de la pièce : aux quatre coins, l'axe de la fraise est au-dessus du coin attendu à l'œil ; aucune bride sous le trajet, ou les déplacer.
18. Rebrancher la broche hors mouvement. Lancer l'usinage par le chemin normal : le programme part de la hauteur où le cadrage a laissé la fraise.

**Relevé à rendre** : pour chaque étape fait / non fait, lignes écrites, positions aux coins, temps d'un côté, temps et distance d'arrêt, toute surprise. Une étape non faite reste non vérifiée. Après l'essai, mettre à jour C7 et C8 du § 2.1 et la limite correspondante de `SURETE.md`.

## 13. Points de réalisation

- **Partir de l'existant.** Le plan CNC est une variante de `framePlan` (mêmes gardes communes, mêmes codes) ; la séquence reste portée par `r.motion.frame` (`motion.js`), ce qui donne déjà : Arrêter, Pause, `jog-stop`, `moves.moving` et donc toutes les exclusions (`idle`, `noJob`, `atRest`, D2, commandes système, expiration de la main, `canStop`). Les opérations d'API restent `machine/frame-prepare` et `machine/frame` : le **type de la machine** choisit le plan, pas la page.
- **Ne pas casser le laser** : ses lignes, ses codes, son dialogue et ses tests ne changent pas. Les branches propres à la CNC (ligne Z, arrivées, gardes G5, G7, G12 à G15) sont séparées par le type du plan.
- **Points de branchement dans `job-service.js`** (une ligne chacun, à côté de ceux de la plaque) : `socketStop`, `socketRefusal`, `closeTransport` (transmettre « rotation »), `ticketPending`, le bloc `release`/`takeover`, la branche `spindleStop`, `canPause`, `snapshot` (`canFrame`, `refusals.frame`).
- **Fichiers partagés** : lignes ajoutées en fin de section dans `i18n-messages-machine.js` (codes), `i18n-messages-profiles.js` (chaînes), `i18n-messages-refus.js` (trois familles, quinze codes), `verify-project.cjs` (un test), `check-screen.js` et `job-controls.js` (quelques lignes). Aucune feuille de style commune touchée si la carte tient ; sinon une règle locale à la carte Verdict.
- **Interfaces avec les autres lots** : F4 (« Rendre la main ») arrête le cadrage par S5 ; F10 (rechargement automatique) doit tenir `motion.frame` non nul pour une action en cours ; F16 garde Pause et Arrêter visibles ; F2 touche la même branche `pause` de `perform` : conflit de fusion possible, sans conflit de comportement (le cadrage n'existe qu'au repos, la remontée qu'en usinage).

## 14. Décisions laissées à l'orchestrateur ou à l'opérateur

| # | Question | Recommandation | Si non |
|---|---|---|---|
| D-1 | Appliquer aussi au **laser** la surveillance renforcée (arrêt par socket, session de la carte, liaison à l'appareil, `error` = annulation) ? | **Oui** : le code est commun, P1 à P3 sont constatés sur le laser, et chaque changement ne fait qu'arrêter plus tôt, sauf la rotation du flux qui aujourd'hui annule à tort. Les tests laser existants restent verts. | CNC seule ; consigner P1 à P3 comme limites connues du laser dans `SURETE.md`. |
| D-2 | Garder la garde **`$20=1`** ? | **Oui** : c'est elle qui rend sûr dans les deux cas le doute C9. Mais la carte a été vue à `$20=0` le 16 novembre (C11) : relire `$$` ; tant que `$20=0`, le cadrage est refusé sur la vraie machine. | La retirer : en cas d'écart du décalage exécuté, seul le capteur de fin de course arrêterait un dépassement (alarme, redémarrage, à 10 mm/s). |
| D-3 | Verrouiller le **départ** après une arrivée inattendue, jusqu'à un cadrage réussi ou un nouveau zéro ? | Non dans ce lot (garde de départ nouvelle, hors de la mission) ; l'arrêt, l'invalidation de D2 et le message y sont. À proposer à l'opérateur après l'essai. | — |
| D-4 | Offrir un **choix de vitesse** sur la page ? | Non dans ce lot : 600 mm/min seulement. Le serveur accepte déjà une vitesse bornée à 1500. | — |

## 15. Ce que je n'ai pas vérifié

- **Rien sur la machine.** Tous les comportements de la carte viennent des documents du dépôt, du relevé du 13 novembre et de notes de séance hors dépôt ; plusieurs de ces notes ne figurent dans aucun compte rendu (C3, C5, C6, C12, C13).
- `$J=G90 G21 X… Y…` en coordonnées pièce et `0x85` sur la LUNYEE : pas de relevé (C7, C8). La distance d'arrêt réelle n'est pas mesurée ; le simulateur ne la modélise pas.
- La valeur actuelle de `$20` (C11) et des accélérations (C10).
- Que la correction de vitesse n'agit pas sur un `$J=` : de mémoire du code amont, non relu.
- Le code amont Grbl_Esp32 lui-même : je cite `FIRMWARE.md`, je n'ai pas rouvert les sources.
- La place du bouton dans la carte Verdict en 1366 × 768 : non mesurée (aucun navigateur lancé).
- Les formulations anglaises et espagnoles : non relues par un locuteur.
- Les suites complètes (`verify-project`, Jest) n'ont pas été relancées : je n'ai modifié aucun fichier de l'arbre. Seul un fichier de test temporaire a été exécuté pour P1 à P3 (3 cas, verts), puis supprimé ; `git status` de l'arbre F1 est vide.
- P1 à P3 sont prouvés sur faux contrôleur, pas sur simulateur ni sur la carte.
- Le délai de détection d'un appareil distant disparu sans fermeture (§ 6, limite 2).

## 16. Écarts et corrections après relecture

Relecture de sûreté d'Astra (17 novembre 2026, `feat/F1` à `f009b7ef`) : « à ne pas installer en l'état », quatre dangers (D1 à D4), trois corrections (C1 à C3), des tests non probants (C4). Tous tiennent à la vérification du code ; tous sont corrigés dans `feat/F1` (`504f9c3c` code et tests, `c1f32ec5` `SURETE.md` et `PROTOCOLE-ESSAI.md`). Détail constat par constat : `F1-CORRECTIONS.md`. Ce qui change dans ce document :

**§ 5.2 (pendant).** La phrase « Une ligne ne part que si … S1 à S10 sont faux **à cet instant** » n'était pas tenue : une arrivée validée pendant une rotation du flux autorisait la ligne suivante plus tard sans nouveau contrôle (D3). Désormais, à chaque pas d'attente et juste avant chaque ligne : rien en attente (ni ligne d'un autre, ni déplacement continu, ni annulation), état `Idle`, position machine égale à celle que la ligne précédente devait donner (0,05 mm), et avant toute ligne X/Y, Z ≥ hauteur sûre − 0,05 mm. Un écart arrête (`_STATE` ou `_POSITION`, D2 invalidé pour une position). S8 gagne deux causes : `program` (le programme cadré n'est plus celui du sender : révision ou `touchJob` différents) et `foreign` (une autre ligne a pris la place de celle qu'on attendait). La broche est surveillée par le garde complet de G7 : vitesse rapportée > 0, ou à défaut `$G` indiquant `M3`/`M4`, ou `$G` trop ancien (C2).

**§ 5.3 (arrivée comparée).** `M5` a une position attendue : celle du plan (X, Y **et** Z), puisque `M5` ne déplace rien (D2). Sans ligne de montée, Z n'était comparé à rien avant le premier X/Y et la hauteur constatée devenait la référence `zFloor`, même 60 mm plus bas. `zFloor` n'est plus pris qu'au moment d'envoyer le premier X/Y, après le contrôle de la hauteur sûre.

**§ 6 et test 26 (exclusions).** La conception affirmait que `moves.moving` donnait « toutes les exclusions ». Faux pour les flèches, les zéros et un second cadrage : leur garde commun (`atRest`) ne regardait que la ligne en attente, si bien qu'entre deux lignes (après `ok` et deux rapports au repos, avant le pas suivant du superviseur) un pas Z− passait et le cadrage continuait plus bas (D1). `atRest` refuse désormais tant qu'un cadrage existe (« Cadrage en cours. », phrase déjà au catalogue), la page grise les flèches dès que `motion.frame` existe, et le superviseur arrête la séquence si une autre ligne a remplacé la sienne.

**§ 6 (arrêt venu de CNCjs).** L'annulation de déplacement d'un socket (`jogCancel`, octet `0x85` seul ou mêlé à d'autres octets sûrs) termine aussi le cadrage, dans le même pas, avant de passer (D4). Elle ne touche pas les palpages : ce ne sont pas des déplacements manuels, et leur arrêt (retenue puis reset) ne doit pas venir d'une simple annulation de jog.

**§ 4.3 et S2 (bannière).** « Après une bannière, rien, pas même `0x85` » n'était pas tenu par les rappels de la séquence (main rendue, flux fermé, répétition d'annulation) entre la bannière et le pas suivant (C1). Le cadrage se termine maintenant dans le pas même de la bannière (`ETOUCH_FRAME_RESTART` conservé), la répétition d'une annulation s'arrête à la bannière, et `abortFrame` comme `transportClosed` contrôlent la session. **Écart assumé** : un arrêt **explicite** demandé après la bannière (Arrêter, arrêt d'un socket) suit le chemin commun des déplacements et peut encore envoyer un `0x85` si une ligne `$J=` de la séquence peut être encore en vol ; cet octet ne met rien en mouvement et peut arrêter un `$J=` reçu après le redémarrage (cas prévu par `settle`). Règle « dans le doute, arrêter ».

**§ 6 et G8 (chargement).** `POST /api/gcode` (le chargement de CNCjs classique) ne consultait pas la réservation : il est refusé (409) pendant un cadrage ou son départ en attente, et un programme remplacé malgré tout (événements `load`/`unload` du sender) arrête le cadrage (`ETOUCH_FRAME_STATE`, `program`) ; un cadrage laser est arrêté de même (C3).

**§ 10 (tests exigés).** Tests ajoutés pour chaque fenêtre (`cnc-frame.test.js`, bloc « the windows of the safety review » ; `api.gcode.test.js` ; une ligne de `test-real-motion.cjs`). Refaits parce que non probants (C4) : test 27 (la raison du bouton rayé pendant un cadrage est « Cadrage en cours. ») ; L2 (la preuve D2 est maintenue en vérification en retenant son `$#` : `ETOUCH_OFFSET_CHECKING` exigé sans condition) ; L3 (X 0, X 407,5 et Y 395,5 réellement parcourus) ; L7 (reset injecté pendant `Jog` sans arrêt préalable du serveur : `ALARM:3`, bannière, aucune écriture ensuite). Le test 26 d'origine reste ; il est complété par « D1 / 26b ».

Restent ouverts, sans changement : R1 de la relecture (aucune mesure de freinage ni relevé de `$J=G90` et `0x85` sur la carte, § 15) et les décisions D-1 à D-4 du § 14.
