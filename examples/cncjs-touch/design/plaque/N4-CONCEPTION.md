# N4 — Position de changement de fraise : conception

Lot N4 de `design/PROMPT-NUIT-2026-11-26.md`, phase A, nuit du 26 novembre 2026. Arbre `cncjs-wt/N4`, branche `feat/N4`, base `0acd1c3b`. Les numéros de ligne valent pour ce commit. **Conception seule : aucun code écrit, aucun test lancé sur la fonction, rien essayé sur la tablette, la RT ni la CNC.** À relire par Astra (phase A') avant tout code.

## 0. Lecture rapide

**Faisable : oui, sans aucune forme de commande que la carte n'ait déjà reçue de la tablette.**

1. L'opérateur enregistre une fois la position où il change sa fraise : il y amène la broche avec les flèches, puis « Enregistrer cette position… ». Le serveur lit lui-même la position machine X / Y ; la page n'envoie aucun nombre. Z n'est pas enregistré.
2. « Aller à la position de changement… » : `M5`, puis **Z monte seul** à 5 mm sous le haut de la course (la ligne du cadrage à vide, sans signe, qui ne peut pas descendre), puis **X seul**, puis **Y seul**. Z ne redescend jamais.
3. Les trois déplacements sont des déplacements manuels bornés `$J=G91 G21 <axe><distance> F<vitesse>` : **le format exact des flèches**, un axe par ligne. La distance est calculée par le serveur en position machine (cible − position), et chaque arrivée est comparée à la position machine attendue.
4. La séquence est **le cadrage à vide** (lot F1) avec un autre plan : même session `r.motion.frame`, même superviseur, mêmes arrêts (`0x85` seul), mêmes exclusions. Rien n'est construit à côté.
5. Le zéro pièce n'est ni lu pour le mouvement, ni écrit. Aucun garde de départ n'est ajouté.

**Écarts assumés avec le prompt** (§ 2, N4 : « Z monte seul d'abord (`G53`) … puis X / Y (`G53 G0`) »), tous dans le sens prudent, à juger par Astra :

| # | Le prompt dit | La conception fait | Pourquoi |
|---|---|---|---|
| E1 | Z par `G53` | `$J=G91 G21 Z<montée> F…`, relatif, sans signe | `$J=G53` n'est pas prouvé sur ce binaire (`PROTOCOLE-ESSAI.md:95`, F1 C6, F2 P14) : si `G53` était ignoré, une cible absolue deviendrait une position pièce, donc peut-être une descente. La ligne relative sans signe est celle de F1, relue quatre fois. |
| E2 | X / Y par `G53 G0` | deux `$J=G91 G21`, X puis Y, distance = cible machine − position machine | Un `G0` hors course lève `ALARM:2` et **redémarre la carte** (fait prouvé) ; il ne s'arrête que par retenue puis reset, et un reset en mouvement perd la position (F1 C2, C4) ; il part à 4000 mm/min (44 mm de freinage) et laisse `G0` dans l'état modal. Un `$J=` hors course est refusé `error:15` sans mouvement, s'annule par `0x85` en gardant la position, porte sa vitesse, ne laisse rien. |
| E3 | broche « constatée arrêtée » | constatée arrêtée **et** `M5` écrit en premier | Comme F1 ; `M5` au repos ne déplace rien. |
| E4 | (non demandé) | zéro pièce prouvé (D2) et `$20=1` exigés | Voir G6 et G9 (§ 4.1). Coût : attendre la vérification du zéro après une prise d'origine. |

Le résultat demandé est tenu : position enregistrée en position machine, Z en haut d'abord, jamais de descente.

## 1. Ce que l'opérateur obtient

Sur **3 · Zéro pièce**, colonne « Position pièce », sous [Position machine] : un bouton **[Changer la fraise…]**. Il ouvre le volet « Changer la fraise » :

- la position enregistrée (« Position enregistrée le 26 nov. » ; les nombres sont dans Détails), ou « Aucune position enregistrée. Amenez la broche où vous changez la fraise, puis enregistrez. » ;
- **[Aller à la position de changement…]** (64 px) : confirmation à case, trois touchers ; la fraise monte, puis la broche va à la position. « Arrêter » l'interrompt à tout instant ;
- **[Enregistrer cette position…]** (48 px) : confirmation à deux touchers, aucun axe ne bouge ;
- à l'arrivée : **« Changez la fraise, puis refaites le zéro Z. »** et [Fermer] : le volet se ferme sur 3 · Zéro pièce, où sont « Zéro Z ici » et « Zéro Z à la plaque… ».

Ce que la fonction ne fait pas : elle ne marche pas pendant un usinage ni pendant une pause (`M6` compris) ; elle ne redescend pas ; elle ne refait pas le zéro Z et **n'empêche pas de démarrer sans l'avoir refait** ; elle ne coupe pas l'alimentation de la broche.

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

Code repris tel quel :

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
| L6 | F1, tours 1 et 2 : fenêtres entre deux lignes (un pas Z− passait), hauteur sûre non revérifiée, arrivée ancienne réutilisée, arrêts de socket oubliés, octets après bannière. | Pas de séquence parallèle : N4 est un **plan de plus dans la séquence de F1**, dont la table d'états (106 cases) est déjà tenue. Les points de passage uniques (`atRest`, `holdReason`, `socketEffect`, `restarted`) s'appliquent par construction ; la table est rejouée pour le nouveau type (§ 8.1, test 12). |
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
| G10 | Position machine X, Y, Z connue | `ETOUCH_LASER_FRAME_POSITION` | F1 |
| G11 | Hauteur sûre calculable : course Z connue, une seule convention | `ETOUCH_CNC_FRAME_Z` | F1 |
| G12 | Départ **et cible** X / Y dans la course utilisable du moment (convention non ambiguë, marge de 0,5 mm côté opposé à la prise d'origine) | `ETOUCH_PARK_OUTSIDE` (`axis`, `value`, `low`, `high`) | Nouveau, calcul de F1 G15 |
| G13 | Aucune ligne de plus de 60 s | `ETOUCH_LASER_FRAME_SLOW` | F1 |
| G14 | À l'exécution : ticket présent, bon numéro, ≤ 15 s, même flux ; plan refait **identique** (mêmes lignes : machine immobile, même cible) ; même enregistrement (date) | `ETOUCH_LASER_FRAME_EXPIRED`, `_CHANGED` | F1 |

Pas de fichier exigé, pas de contrôle des courses d'un programme, pas d'attente de relecture de fichier : entre le second contrôle complet et la première écriture il n'y a **aucune attente asynchrone** (pas de réservation `frameStarting`).

### 5.2 Pendant : avant chaque écriture et toutes les 50 ms

Celles du cadrage à vide, par le même code (`cncStop`, `holdReason`, `cncStep`), avec une seule différence : la cause `program` (programme remplacé) n'existe pas pour ce type ; un chargement de CNCjs classique reste refusé pendant la séquence (`uploadRefusal`).

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
| Flux perdu, page fermée, main prise ou rendue | Arrêt (grâce de 3 s pour une rotation). | Arrêtée. |
| Alarme | Arrêt ; aucun déverrouillage ni prise d'origine automatique. | Position perdue : remise en route existante. |
| Bannière | Fin, **aucun octet**. | Position perdue. |
| `error:15` sur une ligne | Arrêt, `ETOUCH_PARK_REFUSED`, D2 invalidé. La carte et le serveur ne voient pas la même course. | Rien n'a bougé pour cette ligne. |
| Arrivée inattendue | Arrêt, `ETOUCH_PARK_POSITION`, D2 invalidé. | Arrêtée, en haut. |
| Réglages relus différents entre l'enregistrement et l'usage | G8 : refus avant tout mouvement. | — |
| `.cncrc` modifié à la main (valeurs absurdes) | G8 (invalide = absente) puis G12 (hors course = refus). | — |
| Deux appareils : l'un enregistre pendant que l'autre confirme | G14 : plan différent, `_CHANGED`. | — |
| Enregistrer ou partir pendant un déplacement vers la position | `atRest` : refusé. | — |
| CNCjs redémarré, port rouvert | `homed` faux : refus jusqu'à la prise d'origine. La cible, elle, est relue du disque. | — |
| Serveur ou liaison morts pendant une ligne | Personne ne peut annuler : la carte finit **cette** ligne (un axe, ≤ 41 s, dans la course, en haut). Arrêt physique seulement. | Limite de F1, inchangée. |
| Client par le Wi-Fi de la carte | Non empêchable ; détecté par état, alarme, bannière, `error`, arrivée. | Arrêtée. |

## 7. Codes, instantané, écran

### 7.1 Codes nouveaux (FR serveur ; EN / ES au catalogue, en fin de table)

Refus avant : `ETOUCH_PARK_LASER`, `_NOT_HOMED`, `_NONE`, `_STALE`, `_SOFT_LIMITS`, `_OUTSIDE`, `_ALREADY`. Arrêts pendant, un pour un avec ceux du cadrage et les mêmes paramètres : `ETOUCH_PARK_STREAM`, `_CONTROL`, `_STALE_REPORT`, `_TIMEOUT`, `_STATE`, `_REFUSED`, `_ALARM`, `_RESTART`, `_POSITION`. Des codes propres plutôt que les `ETOUCH_FRAME_*` : leurs phrases disent « Cadrage arrêté », fausses ici. Phrase d'exclusion propre (« Déplacement vers la position de changement en cours. ») au lieu de « Cadrage en cours. ».

Familles de la page : `changement-arrete` (« Déplacement arrêté avant la position de changement. Regardez où est la fraise. » [Recommencer]) ; `changement-position` (« La broche n'est pas arrivée où elle était attendue. Refaites la prise d'origine. » [Prise d'origine machine…]) ; `changement-a-enregistrer` (`_NONE`, `_STALE` : « Enregistrez la position de changement de fraise. ») ; les familles existantes `origine-a-prendre`, `alarme`, `cadrage-limites`, `type-machine`. Avec `referenceLost`, la phrase « position perdue » du P4 allégé s'applique d'elle-même à `_NOT_HOMED`.

### 7.2 Instantané

`toolPosition: { saved: { x, y, savedAt } | null, canGo, goReason, canSave, saveReason }`, `refusals.park`, `refusals.parkSave` ; `motion.frame.kind === 'park'` avec `phase` (`spindle`, `raise`, `x`, `y`) ; `motion.lastFrame.kind === 'park'` avec `code`, `params`. `canPause` vrai pendant la séquence. Signature de changement et `holds` (rotation du flux retardée) tiennent compte du type. Réponse de la préparation : `park: { lines, target, safeZ, seconds }`.

### 7.3 Écran

- **3 · Zéro pièce**, colonne « Position pièce » : [Changer la fraise…] (`#tool-change-open`, 48 px) sous [Position machine]. La colonne a 80 px libres à 768 (`SPEC-REFONTE.md` § 4.3 : 436 contre 516) : **à mesurer au harnais**, non vérifié. Jamais masqué en CNC ; absent en laser.
- **Volet « Changer la fraise »** (`ks-tool-change`, modèle `ks-zero-more`) : ligne d'état de la position ; [Aller à la position de changement…] rayé avec la phrase de la famille et son remède ; [Enregistrer cette position…] de même ; ligne d'avancement (« La fraise monte. », « Vers la position de changement. ») ; résultat. Le volet est sous le bandeau : Pause et Arrêter restent visibles et actifs (règle § 5.1 de la spec, à prouver au harnais).
- **Dialogue « Aller à la position de changement »** (classe « met la machine en mouvement », trois touchers, armement 600 ms, ticket 15 s) : « La fraise monte tout en haut, puis la broche va à la position enregistrée. Elle ne redescend pas. » ; ligne « environ N s » ; case : « Je suis devant la machine, la broche est arrêtée et rien de haut ne gêne son trajet. » ; bouton « Aller à la position ». Détails : les lignes, la hauteur sûre, la cible en position machine.
- **Dialogue « Enregistrer cette position »** (deux touchers) : « La broche sera ramenée ici pour changer la fraise. Aucun axe ne bouge. » ; Détails : ancienne et nouvelle position machine ; bouton « Enregistrer cette position ».
- **Résultat à l'arrivée** : « Changez la fraise, puis refaites le zéro Z. » + [Fermer] (retour à 3 · Zéro pièce). Tant que la broche a tourné récemment, l'opérateur doit attendre son arrêt complet : la phrase de la case le fait attester, le serveur ne voit que la consigne.
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
7. Hauteur sûre : arrivée Z 0,06 mm trop bas → `_POSITION`, aucune ligne X ; sans montée prévue, Z descendu pendant `M5` → aucune ligne X ; Z descendu entre X et Y → aucune ligne Y.
8. Arrivée X ou Y décalée de 0,06 mm → arrêt `_POSITION`, D2 invalidé ; 0,04 mm → continue.
9. Fin normale : `lastFrame` `ended`, `kind: 'park'`, journal ; **aucune** ligne `G10`, `G92`, `G5x` écrite de toute la séquence ; preuve D2 inchangée.
10. Arrêts × moments (pendant `M5`, la montée, X, entre X et Y, Y) : Arrêter, Pause, `jog-stop`, Arrêter la broche, appareil sans la main → `0x85`, plus aucune ligne après 61 s au repos, ni `!`, ni `0x18`, ni `M5` de plus.
11. Fenêtre entre deux lignes (D1 de F1) : après `ok` et deux rapports, avant le pas du superviseur : pas Z−, continu, zéro, cadrage, second départ, enregistrement → refusés, rien d'écrit.
12. **Table d'états de F1 rejouée pour `kind: 'park'`** : mêmes événements × mêmes états, même réponse par case (matrice lue dans `SAFE_COMMANDS` / `SAFE_WRITES` par la vraie façade ; bannière : aucun octet ; rotation du flux ; main ; périmé ; alarme ; `dispose`).
13. `error:15` → `_REFUSED`, D2 invalidé ; `error:9` → `_REFUSED`, D2 gardé ; délai ; ligne relâchée sans `ok`.
14. Réglages, repère, décalage, automatismes changés pendant la séquence → arrêt `_STATE`.
15. Enregistrer : la position écrite est celle du serveur (une requête portant `x` / `y` est refusée) ; refus par garde ; ticket ; machine déplacée entre les deux temps ; **zéro écriture sur le port** ; remplacement, borne de 8, journal ; relu après un nouveau service (redémarrage de CNCjs simulé).
16. Catalogue : chaque code nouveau a sa ligne FR identique et ses lignes EN, ES.
17. *Témoins* : `T/cnc-frame.test.js`, `T/manual-jog-banner.test.js`, suite laser de `T/machine-profile.test.js` **verts sans modification** (sauf la liste des capacités, à dire).

### 8.2 Simulateur, profil LUNYEE (`T/tool-position-lunyee.test.js`)

- P1. Vrai `$H`, vraie preuve D2, zéro pièce non nul (`G10 L2 P1 X50 Y100 Z-105`), dans les deux hypothèses `executedAfterHoming` : aller à X 20, Y 380, enregistrer, aller à X 300, Y 50, Z −60, lancer ; à la fin la position machine du simulateur vaut (20 ; 380 ; −5) ; **Z relevé à chaque rapport ne baisse jamais** ; X ne bouge pas pendant la montée, Y pas pendant X. Le résultat est le même dans les deux hypothèses (le mouvement ne dépend pas du zéro).
- P2. `$#`, `$G` et le zéro pièce relus avant et après : identiques.
- P3. Cible à la borne utilisable exacte (X 407,5 ; Y 395,5 ; X 0 ; Y 0) : atteinte sans `error:15` ; enregistrement tenté à X 407,6 : refusé.
- P4. Z à 0 après la prise d'origine : aucune ligne Z, Z du simulateur immobile.
- P5. Arrêter pendant X : repos entre deux points, pas de bannière, `homed` et D2 gardés ; relance : nouveau plan depuis là, arrive.
- P6. Reset (`0x18`) injecté pendant X : `ALARM:3`, bannière, aucun octet ensuite, départ refusé `_NOT_HOMED`.
- P7. `$20=0` dans le simulateur : refus, rien d'écrit.
- P8. Position machine du simulateur déplacée par le banc entre le plan et l'exécution (client tiers) : `_CHANGED` ; déplacée entre deux lignes : `_POSITION` ou `error:15`, jamais de descente.

### 8.3 Page (`examples/cncjs-touch/test-tool-position.cjs`, dans `verify-project.cjs`)

Bouton présent en CNC, absent en laser ; volet : états « aucune position », « enregistrée », rayé avec phrase et remède pour chaque famille ; dialogues : textes, case, armement 600 ms, un seul envoi, ticket jamais rejoué ; la requête d'enregistrement ne contient aucun nombre ; avancement par phase et résultat depuis un état injecté ; phrase finale et retour à 3 · Zéro pièce ; Arrêter et Pause actifs volet ouvert ; `test-refus-table.cjs`, `test-i18n.cjs`, `test-textes-regles.cjs`, `test-confirmation-classes.cjs` (*témoins* complétés). Harnais : `browser-run.cjs --strict --only screens` à 1366 × 768 et 1366 × 911, texte normal et agrandi ; défauts tolérés : `HARNAIS-CONNU.md` seulement.

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
| N4-B2 | Après. | Repos, ni alarme ni bannière ; position pièce cohérente (zéro pièce inchangé au PC : `$#` identique) ; « Changez la fraise, puis refaites le zéro Z. ». |
| N4-B3 | Refaire depuis un autre endroit, Z déjà en haut. | Pas de montée. |
| N4-C1 | Relancer de loin ; **Arrêter pendant la montée**. | Arrêt net ; X / Y immobiles ; référence gardée. Relancer : repart de là. |
| N4-C2 | Relancer ; **Arrêter pendant X**. Mesurer temps et distance d'arrêt. | Quelques millimètres ; plus aucun mouvement pendant une minute ; Y n'est pas parti. |
| N4-C3 | Pendant X : une flèche sur la tablette ; puis « feed hold » dans CNCjs classique. | Flèche refusée ; au feed hold la broche s'arrête et **ne repart pas**. |
| N4-C4 | Prendre la main depuis le PC pendant Y. | Arrêt. |
| N4-D1 | Pièce bridée, fraise montée, zéro pièce fait, broche **toujours débranchée**. Regarder que rien sur la table (bride, tuyau) n'est plus haut que la fraise relevée. [Aller…]. | La broche arrive à la position ; changer la fraise ; refaire le zéro Z (plaque ou « Zéro Z ici ») ; X et Y du zéro pièce inchangés (cadrage à vide ou repère au crayon). |
| N4-D2 | Usinage en cours, puis en pause : ouvrir le volet. | [Aller…] et [Enregistrer…] rayés. |

Ne pas essayer : enregistrer « pour voir » au ras d'un capteur, `$20=0`, un reset en mouvement, débrancher l'USB pendant une ligne. Relevé : fait / non fait, lignes écrites vues au PC, positions, temps, toute surprise.

## 10. Décisions laissées à l'orchestrateur ou à l'opérateur

| # | Question | Choix de la conception (le plus prudent) | Autre voie |
|---|---|---|---|
| D-N4-1 | Formes `G53` et `G53 G0` du prompt, ou relatif `$J=G91` ? | Relatif (E1, E2). | Après l'essai E-A du protocole (preuve de `$J=G53 G90` sur la carte), une cible absolue en `$J=G53` serait plus directe ; `G0` reste écarté (alarme, reset). |
| D-N4-2 | Rappeler ou imposer « zéro Z à refaire » avant le prochain départ ? | **Phrase seule, aucun garde** : le serveur ne sait pas si la fraise a été changée, et un garde de départ est ce que I-27 s'est vu refuser. Risque dit : démarrer avec l'ancien zéro Z après un changement de fraise fait plonger trop bas ou usiner en l'air ; c'est le risque d'aujourd'hui, inchangé. | Un rappel d'affichage sur 4 · Contrôle jusqu'au prochain zéro Z posé par la tablette (sans blocage). À décider par l'opérateur. |
| D-N4-3 | Vitesse X / Y. | 600 mm/min, fixe. | 1500 (borne déjà admise par F1) après mesure de la distance d'arrêt. |
| D-N4-4 | Exiger D2 (G6) ? | Oui. | Le retirer : le mouvement ne dépend pas du zéro ; demande d'adapter le superviseur. |
| D-N4-5 | Un axe par ligne, ou diagonale ? | Un axe par ligne (format noté sur la carte). | Diagonale `X… Y…` : plus court, format non noté. |
| D-N4-6 | Pendant une pause `M6` ? | Refusé (hors lot : I-26, changement de fraise guidé). | — |

## 11. Fichiers que la phase B toucherait

Serveur : `motion.js` (validateur de lignes, type `park` dans `frame`, `holdReason` et le plancher Z étendus aux lignes X ou Y seules, messages) ; `job-service.js` (plan, opérations, instantané, en fin de section) ; `machine-profile.js` (capacité, messages, stockage `touch.toolPositions` ou un petit module voisin) ; catalogue des codes ; tests du § 8. Page : `index.html` (bouton, volet), un module `touch/tool-position.js`, `job-controls.js` (deux dialogues), `refus.js` et tables i18n (fin de table), `verify-project.cjs`. Documents : `SURETE.md` § N4, `PROTOCOLE-ESSAI.md` § N4, `IDEES.md`, `N4-RAPPORT.md`.

## 12. Ce qui n'est pas vérifié

- **Rien sur la machine.** Les faits C2 à C4 viennent de notes de séance hors dépôt citées par F1 ; je ne les ai pas relus à la source.
- Aucun relevé de l'essai réel F1 dans le dépôt : la distance d'arrêt sur `0x85` n'est pas mesurée ; le simulateur annule sans rampe.
- La valeur actuelle de `$20` sur la carte (C7).
- Qu'une distance quelconque à trois décimales (`X-184.237`) est acceptée comme un pas rond par ce binaire : syntaxe standard, non notée telle quelle.
- Que le simulateur accepte ces lignes au profil LUNYEE : lu dans le code (`grbl-simulator.js:1461-1525`), non exécuté.
- La place du bouton dans la colonne de 3 · Zéro pièce à 1366 × 768 et le volet sous le bandeau : aucun navigateur lancé.
- Que `cncStop`, `holdReason` et `arrivalOff` se prêtent au type `park` sans autre retouche que celles du § 11 : lu, non essayé.
- Les trois avis d'Astra sur I-27 (`astra-P4.md`, `astra2-P4.md`, `astra3-P4.md`) ne sont pas dans le dépôt : § 3 s'appuie sur leur résumé dans `P4-CONCEPTION.md` § 0, § 12, § 13 et `IDEES.md`.
- La broche en roue libre : le serveur voit la consigne, pas la rotation ; seule la case le fait attester.
- Textes EN / ES non écrits ici (phase B), non relus par un locuteur.
- Les suites Jest et le harnais n'ont pas été relancés pour ce commit : il n'ajoute qu'un document.
