# A1 — Sûreté et état de la machine, côté serveur

Audit du 2026-11-15, branche `feat/refonte-ui` (`3049a0e4` + prompt de mission). Lecture seule : aucun fichier existant modifié.

Périmètre lu en entier : `job-service.js`, `program-check.js`, `motion.js`, `plate-probe.js`, `block-probe.js`, `halt.js`, `probe-input.js`, `job-load.js`, `control.js`, `backlight.js`, `index.js`, `touch-stream.js`, `api.touch.js`, `GrblRunner.js`. Lu en partie : `resume.js` (construction du préambule), `machine-profile.js` (capacités), `system-command.js`, `updates.js`, `GrblController.js` (feeder, événements, table des commandes), `grbl-simulator.js`, les faux Grbl de `block-probe.test.js`, `job-service.test.js`, `motion.test.js`, `motion-simulator.test.js`.

## Résumé

| Id | Gravité | Défaut | Preuve | Journal |
|---|---|---|---|---|
| A1-1 | sécurité machine | Un programme prouvé hors course part quand même | test | T2 |
| A1-2 | sécurité machine | Décalage de travail rapporté jamais recoupé avec `$#` : faux « hors course », faux feu vert, départ et reprise non retenus | test | T3 |
| A1-3 | sécurité machine | X et Y (bit `$23`) jamais vérifiés, même convention apprise : dépassement X/Y jamais prouvé | test | T3, T2 |
| A1-4 | sécurité machine | Après un redémarrage de la carte, Déverrouiller suffit pour démarrer ou reprendre avec un G54 faux | test | T2 |
| A1-5 | sécurité machine | Aucune marge avant la limite logicielle (contrôle des courses, pas) | test | T2 |
| A1-6 | sécurité machine | Zéro Z à la plaque : ni contrôle de course, ni arrêt sur perte du flux ou prise de pilotage | test | — |
| A1-7 | sécurité machine | Palpage au bloc : repère actif de `$#` non recoupé, touches en coordonnées de travail | test | T8 |
| A1-8 | bloquant | Version Grbl jamais relue seule ; relecture refusée en alarme | test | T10 |
| A1-9 | mineur | Une prise d'origine partielle vue de l'extérieur marque tous les axes référencés (sans effet sur la LUNYEE) | chemin | T3 |
| A1-10 | bloquant | Toute session peut éteindre l'écran du kiosque | test | T1 |
| A1-11 | à corriger | Enveloppe du palpage XYZ plus large que le trajet réel : refus à tort près des bords | test | T7 |
| A1-12 | à corriger | Le code de l'alarme est effacé par la bannière qui la suit | chemin | T2 |
| A1-13 | mineur | Programme CNC : S au-dessus de `$30` jamais signalé ; correction de broche sans effet | chemin | — |
| A1-14 | mineur | « Arrêt broche (M5) envoyé » alors que la ligne est jetée en alarme | chemin | — |

Pistes du § 4.2 : 1, 2, 3, 4, 5, 6, 8, 10 prouvées ; 7 prouvée en partie (le contrôle de course du préambule existe, il n'est qu'un avertissement) ; 9 prouvée pour un Grbl standard, sans effet sur la LUNYEE.

Tests créés, non commités, lancés un par un puis ensemble (`npx jest src/server/services/touch/__tests__/bughunt-A1- --coverage=false`) : 10 fichiers, 22 tests, 19 échouent comme annoncé, 3 passent (témoins de ce qui doit rester vrai). ESLint propre sur ces 10 fichiers.

---

## Constats

### A1-1 — sécurité machine — Un programme dont le dépassement est prouvé part quand même (piste 1, D1, T2)

**Scénario.** Machine référencée, G54 Z = −115, `$132=130`. Programme chargé : dernière passe à Z −20,76. Le contrôle calcule Z machine de −135,76 à −110 et rend `outside` sur Z (axe vérifiable, bit `$23` à 0). `prepare start` délivre quand même le ticket, `start` envoie `gcode:start`.

**Chemin.** `job-service.js:753-846` (`readyFor`) ne lit jamais `programCheck`. `job-service.js:1725-1737` : le contrôle est joint au ticket « as a warning ». `job-service.js:1801-1833` : départ. `canStart` reste vrai (`job-service.js:1199`).

**Preuve.** test : `src/server/services/touch/__tests__/bughunt-A1-1.test.js` (reçu : `["gcode:load", "gcode:start"]`).

**Correction proposée.** Dans `readyFor('start')` : refus codé quand un axe est `outside` avec une machine référencée, avec la cause chiffrée (`min`, `max`, `low`, `high` existent déjà dans `codedReasons`). Dérogation : champ explicite dans `prepare` puis dans `start` (second geste), inscrit au journal. `canStart` et `startReason` suivent. Le test existant `job-service.test.js:2292` (« the start is not blocked ») est à réécrire, pas à supprimer.

**Fichiers.** `job-service.js`, `program-check.js`. Côté page : `job-controls.js:282-292` (angle A2).

### A1-2 — sécurité machine — Décalage de travail rapporté jamais recoupé avec `$#` (pistes 2 et 7, D2, T3)

**Scénario.** Fait de terrain : après `$H`, la carte rapporte `WCO:0,0,0` alors que `$#` garde G54 = (100, 100, −115). CNCjs en déduit WPos = MPos.
- Faux « hors course » (T3) : programme Z de −3 à +5. Le contrôle calcule Z machine −3 → +5 et rend `outside` (+5 > 0). Avec le vrai G54 : −118 → −110, dans la course.
- Faux feu vert : programme Z de −20 à −2. Le contrôle rend `validated` (−20 → −2). Avec le vrai G54 : −135 → −117, hors course.
- Le départ part dans les deux cas. Le départ d'une reprise à une ligne aussi.

**Chemin.** `program-check.js:519-525` : `offset = mpos − wpos`, rien d'autre. `machine.parameters` (`$#`) n'est lu que si le programme choisit un autre repère que l'actif (`program-check.js:503-514`). `job-service.js:1353-1375` (`machineForCheck`) transmet `parameters` sans les comparer. Aucun garde de décalage dans `readyFor` (`job-service.js:753-846`), `zeroZReady` (`plate-probe.js:58-124`), `blockReady` (`block-probe.js:398-443`).

Piste 7, précision : le préambule d'une reprise est bien analysé (`job-load.js:253`, `analyzeProgram(program)` sur le programme reconstruit). Il a donc un contrôle de course, mais sur le même décalage non prouvé et sans effet bloquant.

**Preuve.** test : `src/server/services/touch/__tests__/bughunt-A1-2.test.js` (4 tests).

**Correction proposée (D2).** Un état `offsetProven` par contrôleur, remis à faux par la bannière, une alarme, toute fin de cycle Home → Idle, tout changement de repère. À la première occasion au repos : envoyer `$#`, comparer `$#[repère actif] + G92 + TLO` au `WCO` du dernier rapport (à 0,001 près). Différent : recharger sans mouvement (`G55` puis `G54` est le moyen prouvé sur la carte ; l'inverse si l'actif n'est pas G54), attendre un rapport `WCO` égal à `$#`. Tant que ce n'est pas prouvé : refus codé du départ, de la reprise, des deux palpages, du cadrage laser ; `programCheck` rend `unknown` avec une raison propre au lieu de `outside` ou `validated`. `$#` doit partir par une voie qui marche en alarme si l'on veut le lire avant le déverrouillage (voir A1-8 : le feeder jette tout en alarme).

**Fichiers.** `job-service.js`, `program-check.js`, `plate-probe.js`, `block-probe.js`, `motion.js` (cadrage).

**Attention.** D2 rend A1-4 certain : une fois G54 rechargé, une reprise après redémarrage sans prise d'origine exécute le vrai G54 depuis une fausse origine machine.

### A1-3 — sécurité machine — Axes à bit `$23` jamais vérifiés, même quand la convention est apprise (piste 3, T3, T2)

**Scénario.** LUNYEE, `$23=3`. La tablette fait la prise d'origine : cycle vu en Home, fini à MPos 0,0,0. `homeMpos` est appris, le déplacement continu est autorisé en X et Y de 0 à +course. Programme X 0 → 40, Y 0 → 30 sur une origine pièce à (100, 100) : `programCheck` rend X et Y `unknown` (« Sens de prise d'origine inversé… axe non vérifié »). Programme X 0 → 400 (X machine jusqu'à 500 pour 408) : `unknown` aussi, jamais `outside`.

Conséquences : sur cette machine le verdict global n'est jamais `validated` (avertissement permanent, donc ignoré) ; un dépassement X ou Y n'est jamais « prouvé », donc D1 ne peut pas le refuser.

**Chemin.** `program-check.js:568-576` : bit `$23` à 1 → raison `ETOUCH_CHECK_HOMING_DIRECTION`, `entry.low` reste nul, aucune comparaison. `job-service.js:1353-1375` ne transmet pas `r.homeMpos`. La convention existe pourtant : `job-service.js:326` (apprise), `motion.js:207-213` (`envelopeOf` la consomme).

**Preuve.** test : `src/server/services/touch/__tests__/bughunt-A1-3.test.js` (2 tests ; les préconditions « déplacement continu autorisé en X et Y » passent).

**Correction proposée.** `machineForCheck` transmet `homeAt: r.homeMpos` (et `wcoSeen`, `wposReported`) ; `checkProgram` prend ses bornes par `envelopeOf` + la règle « une seule convention » : bornes [0, course] quand l'axe a été trouvé à 0 sous le même `$23`, sinon `unknown` comme aujourd'hui.

**Fichiers.** `job-service.js`, `program-check.js` (réutiliser `envelopeOf` de `motion.js`).

### A1-4 — sécurité machine — Après un redémarrage de la carte, Déverrouiller suffit pour démarrer ou reprendre avec un G54 faux (au-delà des pistes ; T2, P8)

**Scénario.** Faits de terrain : `ALARM:2`, une alarme de fin de course ou un Arrêter en plein usinage redémarrent la carte, qui revient à MPos 0,0,0 là où l'outil s'est arrêté, non référencée. G54 (EEPROM) vaut toujours (100, 100, −115) : il est faux de toute la distance entre l'ancienne origine machine et le point d'arrêt.
1. Outil dans la pièce (Z machine −116). La carte redémarre : bannière, Alarm, MPos 0,0,0.
2. L'opérateur touche Déverrouiller (`$X`) : Idle. `homed` est faux, le serveur le sait.
3. Il touche Démarrer, ou « Reprendre à la ligne N » puis Démarrer : accepté.
4. Première ligne de mouvement (`G0 Z5`, le dégagement) : cible machine 5 − 115 = −110, soit 110 mm plus bas que la position réelle, en rapide. La cible est dans la course logicielle (−130 → 0) : la carte ne refuse rien.

**Chemin.** `job-service.js:386-423` (`r.reset`) : `homed = false`, le programme reste chargé. `job-service.js:898-903` puis `1105-1112` : `$X`. `job-service.js:753-846` : aucun garde de référence au départ. `program-check.js:470-472` : seulement `ETOUCH_CHECK_NOT_HOMED`, verdict `unknown`, avertissement. `resume.js:629-644` : préambule `G0 Z<dégagement>`, `G0 X… Y…`.

**Preuve.** test : `src/server/services/touch/__tests__/bughunt-A1-4.test.js` (2 tests ; reçu : `["gcode:load", "unlock", "gcode:start"]`).

**Correction proposée.** Refus codé du départ (programme ou reprise) quand `$22=1` et que la machine n'est plus référencée depuis le dernier redémarrage de la carte, avec le remède « Prise d'origine ». C'est un cas plus étroit que le `unknown` de D1 : ici le serveur sait que la référence a été perdue après que l'origine pièce a été posée. À trancher par l'orchestrateur : refus sec, ou dérogation par le second geste de D1 quand l'opérateur a reposé les trois zéros depuis le redémarrage.

**Fichiers.** `job-service.js`.

### A1-5 — sécurité machine — Aucune marge avant la limite logicielle de la carte (piste 5, T2)

**Fait de terrain.** `$132=130` : cible Z −129,735 acceptée, cible −129,945 refusée par `ALARM:2` puis redémarrage. La carte refuse donc avant la fin de course nominale, entre 0,055 et 0,265 mm. La règle exacte n'est pas connue (angle A5).

**Scénarios.**
1. Programme dont la cible la plus basse est Z machine −129,945 : `programCheck` rend `validated`.
2. Depuis Z machine −120, pas de 10 mm vers le bas : `$J=G91 G21 Z-10 F500` part, cible −130,000.

**Chemin.** `program-check.js:16` (`TOLERANCE_MM = 0.001`) et `:585`. `motion.js:445-455` (`target < low − 1e-6`). `$27` n'est lu nulle part dans `src/server/services/touch/` (recherche vide). À l'inverse, le déplacement continu (`motion.js:689`) et le palpage au bloc (`block-probe.js:322`) gardent `EDGE_MARGIN_MM = 1`.

**Preuve.** test : `src/server/services/touch/__tests__/bughunt-A1-5.test.js` (2 tests).

**Marge à garder.** Prouvé nécessaire : plus de 0,055 mm. Prouvé suffisant en ce point : 0,265 mm. Je recommande une seule constante de 0,5 mm pour le contrôle des courses et les pas, et de garder 1 mm pour tout mouvement que le serveur fabrique lui-même (continu, palpages). À revoir quand A5 donnera la règle du firmware. Dans la bande de marge, le verdict doit être `outside` avec une raison propre (« à moins de 0,5 mm de la fin de course : la carte refuse »).

**Fichiers.** `program-check.js`, `motion.js`.

### A1-6 — sécurité machine — Zéro Z à la plaque sans contrôle de course ni surveillance (piste 6)

**Scénarios.**
1. Machine référencée, Z machine −60, recherche 100 mm : `prepare zeroZ` accepte, `G38.2 Z-45 F100` part (Z machine −160 pour une course de −130). Sur la LUNYEE : `ALARM:2`, redémarrage, référence perdue.
2. Palpage lancé (`G38.2 Z-5 F100`), le flux de la tablette se ferme : rien n'est envoyé, la descente continue (jusqu'à 100 mm à 100 mm/min).
3. Même palpage, une autre tablette prend le pilotage : rien n'est envoyé.
4. Chemin seul : sur un délai dépassé (`quiet`, `plate-probe.js:207-209`) ou une ligne refusée, la séquence déclare l'échec (`plate-probe.js:271-280`) sans ordre d'arrêt ; si l'axe descend encore, il continue.

**Chemin.** `plate-probe.js:58-124` : ni `r.homed`, ni course. `plate-probe.js:126-136` : recherche bornée à 100 mm, sans la position. `plate-probe.js:216-281` : la séquence n'écoute ni `transports`, ni `control`. `job-service.js:2107-2124` (`closeTransport`) prévient `moves` et `blockProbe`, pas la plaque. Comparer avec `block-probe.js:611-650`.

**Preuve.** test : `src/server/services/touch/__tests__/bughunt-A1-6.test.js` (3 tests).

**Correction proposée.** Course : quand la machine est référencée et la course Z connue, refuser si `Z machine − recherche` passe sous `bas + marge` (dire de combien réduire) ; machine non référencée : garder l'accès, le dire. Surveillance : lier le palpage au flux et au bail de l'appareil qui l'a confirmé, comme le bloc (`pilot`, `transportClosed` avec le cas `rotated`, `ticketPending`), et arrêter par `haltPlan` / `halt` sur perte du flux, prise de pilotage, rapports périmés, délai. Ce changement de garde va dans `SURETE.md`.

**Fichiers.** `plate-probe.js`, `job-service.js`.

### A1-7 — sécurité machine — Palpage au bloc : repère actif de `$#` non recoupé (piste 4, D2)

**Scénario.** Même état que A1-2 (`WCO` rapporté nul, `$#` G54 = (100, 100, −115)). Palpage Z depuis Z machine −110. Étape CHECK : `$#` est lu, G92 et TLO sont vérifiés, G54 est ignoré. Première touche : `G38.3 Z-120 F100`, calculée comme « Z de travail = WPos + (cible machine − MPos) » avec WPos = MPos. Si la carte exécute le G54 de `$#`, la cible réelle est Z machine −235 : hors course en Z (`ALARM:2`), et en X ou Y un déplacement de liaison partirait à 100 mm de sa cible. Si elle exécute un décalage nul, le cycle tombe juste par chance. Le serveur ne sait pas lequel.

**Chemin.** `block-probe.js:913-925` (lecture de `$#`). `block-probe.js:778-785` (`workTarget`). `block-probe.js:842, 868, 886` (les `G38.3`).

**Preuve.** test : `src/server/services/touch/__tests__/bughunt-A1-7.test.js` (reçu : `["G38.3 Z-120 F100"]`).

**Correction proposée.** À l'étape CHECK, comparer `parameters[repère actif]` à `MPos − WPos` du même rapport (0,001 près) ; différent : échec codé avant tout mouvement, origine inchangée. Le rechargement de D2 (A1-2) se fait avant, dans `blockReady`.

**Fichiers.** `block-probe.js`.

### A1-8 — bloquant — Version Grbl jamais relue seule, relecture refusée en alarme (piste 8, D4, T10)

**Scénario.** CNCjs redémarre, la carte non : pas de bannière, `firmware` vide. `capabilities.jog.supported` est faux (« Version Grbl inconnue »), aucun déplacement réel. Au repos, rien n'envoie `$I` : 10 s de rapports, rien d'écrit. En alarme, `readSettings` est refusé (« La machine doit être au repos (Idle) »).

**Chemin.** `motion.js:127-130` (version exigée). `job-service.js:1671-1675` : `idle(c)` puis `c.command('gcode', …)`. `GrblController.js:343-347` : le feeder jette toute ligne quand la carte est en alarme, donc lever le garde ne suffit pas.

**Preuve.** test : `src/server/services/touch/__tests__/bughunt-A1-8.test.js` (2 tests).

**Correction proposée.** Relecture automatique : une fois par contrôleur et par redémarrage, quand la version est inconnue et que la carte est en Idle ou en Alarm sans travail, écrire `$I` (reprise bornée si aucune réponse). `readSettings` accepté en alarme, écrit par `writeln` (voie directe de `$H` et `$X`), pas par le feeder. Grbl 1.1 répond à `$I` et `$$` en alarme ; sur la LUNYEE ce n'est pas vérifié.

**Fichiers.** `job-service.js`.

### A1-9 — mineur — Une prise d'origine partielle vue de l'extérieur marque tous les axes référencés (piste 9)

**Scénario.** Un autre client envoie `$HX`. Le serveur voit Home puis Idle : `homed = true` pour toute la machine. Sur un Grbl standard compilé avec les prises d'origine par axe, Y et Z ne sont pas référencés et sont pourtant bornés et vérifiés comme tels.

**Chemin.** `index.js:113-119` (`fullHoming` : faux pour `$HX`) → `job-service.js:2129-2143` (`foreignHome = null`) → `job-service.js:337-341` (`homed = true` sur Home → Idle, quelle que soit la commande).

**Sur la LUNYEE.** `$HX` fait les trois axes : la piste est sans danger. L'effet y est inverse : `homeMpos` reste nul (`job-service.js:349-353`), X et Y restent ambigus à 0 et aucun déplacement n'y est permis tant que la tablette n'a pas refait `$H`. C'est une gêne, pas un risque.

**Correction proposée.** Aucune pour ce lot sur la machine cible. Si l'on veut couvrir un Grbl standard : ne pas rendre `homed` vrai sur un cycle étranger dont la commande vue n'est pas un `$H` complet.

**Fichiers.** `job-service.js`.

### A1-10 — bloquant — Toute session peut éteindre l'écran du kiosque (piste 10, D3, T1)

**Scénario.** Le Chrome du PC (192.168.1.50) passe en veille et envoie `POST /api/touch/backlight { temporary: true, percent: 0 }`. Réponse 200 ; le serveur écrit `0` dans `/sys/class/backlight/…/brightness`. L'écran du kiosque s'éteint devant l'opérateur, bouton Arrêter compris.

**Chemin.** `api.touch.js:147-164` : seule la session est vérifiée (`authorized`). `index.js:183` → `backlight.js:107-119` (`percent <= 0` → `writeFileSync(device.file, '0')`).

**Preuve.** test : `src/server/services/touch/__tests__/bughunt-A1-10.test.js` (1 test échoue ; 2 témoins passent : la boucle locale éteint toujours, un réveil est accepté de partout).

**Correction proposée.** Dans `postBacklight` : `temporary` accepté seulement quand l'adresse de la connexion (`req.socket.remoteAddress`, sans se fier à `X-Forwarded-For`) est `127.0.0.1`, `::1` ou `::ffff:127.0.0.1` ; `wake` accepté de partout. Le rallumage par le toucher après un rechargement est de l'angle A3. Non vérifié : que le kiosque ouvre bien la page par la boucle locale.

**Fichiers.** `api.touch.js`.

### A1-11 — à corriger — Enveloppe du palpage XYZ plus large que le trajet réel (au-delà des pistes ; T7)

**Scénario.** Profil du 14 novembre : outil de 6, recherche 10, décalage de face −9,9, coin `--`. Départ à Y machine 15. Refus : « Y irait de -5.9 à 35.9 mm machine » (les chiffres de T7). Le cycle, lui, irait de Y 3 (départ − latéral 12) à Y 24,9 (retour au-dessus du coin), à plus de 1 mm de la fin de course.

**Chemin.** `block-probe.js:300-306` : `rY = max(latéral, recherche + 1 + |face|)`, appliqué des deux côtés. Trajet réel, lu dans `block-probe.js:943-958` : côté d'approche `S − d·latéral` ; côté opposé au plus `max(S + d·|face|, S − d·latéral + d·(recherche + 1))`.

**Preuve.** test : `src/server/services/touch/__tests__/bughunt-A1-11.test.js` (1 échoue ; 1 témoin passe : départ à Y 12,5 toujours refusé, le cycle irait à 0,5 mm du bord).

**Correction proposée.** Enveloppe dissymétrique par axe, calculée des cibles réelles du cycle ; `inside()` (`block-probe.js:771-776`) continue de vérifier chaque cible contre elle. Changement d'un garde : à inscrire dans `SURETE.md`.

**Fichiers.** `block-probe.js`.

### A1-12 — à corriger — Le code de l'alarme est effacé par la bannière qui la suit (au-delà des pistes ; T2, P8)

**Scénario.** LUNYEE : `ALARM:2`, puis la bannière quelques millisecondes après. L'instantané donne `alarmCode: null` : l'écran ne peut pas dire « limite logicielle ». Hors travail en cours (pas, palpage à la plaque), rien n'est inscrit au journal non plus.

**Chemin.** `job-service.js:371-372` (`r.alarm` posé) → `job-service.js:391` (`r.reset` : `r.alarm = null`) → `job-service.js:1301` (`alarmCode`). Journal : `job-service.js:381-383`, seulement si un travail est démarré.

**Correction proposée.** Garder « dernière alarme avant redémarrage » (code, heure) dans l'instantané jusqu'à la prochaine prise d'origine réussie, et l'inscrire au journal dans tous les cas.

**Fichiers.** `job-service.js`.

### A1-13 — mineur — Programme CNC : S au-dessus de `$30` jamais signalé

**Scénario.** Programme à S18000, `$30=1000`. Aucun avertissement : `laserCheck` ne tourne que pour un profil laser (`program-check.js:647-649`, `job-service.js:1373`). La correction de broche (−10 %) ne change rien : Grbl applique le pourcentage à 18000 puis borne à `$30`.

**Correction proposée.** Une ligne d'information dans `programCheck` pour un profil CNC (« le programme demande S18000, la carte plafonne à 1000 : broche au maximum »).

**Fichiers.** `program-check.js`, `job-service.js`.

### A1-14 — mineur — « Arrêt broche (M5) envoyé » alors que la ligne est jetée en alarme

**Chemin.** `job-service.js:924-934` (`spindleStopReady` n'examine pas l'état de la carte) → `job-service.js:1776` (`c.command('gcode', 'M5')`) → `GrblController.js:343-347` (feeder vidé en alarme). Le message dit « envoyé ». Effet réel faible : une alarme de limite arrête déjà la broche.

**Correction proposée.** En alarme, dire « broche déjà arrêtée par l'alarme » ou écrire `M5` par la voie directe après le déverrouillage.

---

## Soupçons (sans preuve)

1. **Ce que la carte exécute quand elle rapporte `WCO:0,0,0`.** Dans Grbl 1.1, le `WCO` rapporté et le décalage exécuté viennent de la même variable ; `G54` seul ne recharge rien quand G54 est déjà actif ; `G10` et un changement de repère rechargent. Les trois observations de terrain collent avec « le décalage exécuté est nul lui aussi ». Si c'est vrai : un programme lancé juste après `$H` s'exécute en coordonnées machine (X0 Y0 au coin d'origine, Z0 en haut), et un `G0 Z5` lève `ALARM:2`. Non prouvé : à trancher par A5 ou par l'essai réel.
2. **`$27=2` et la course utile du côté opposé à l'interrupteur.** Si `$130` a été mesuré d'interrupteur à interrupteur, la course utile en coordonnées machine est plus courte de 2 mm. Un déplacement continu s'arrête à course − 1 mm : il pourrait toucher l'interrupteur opposé (alarme de fin de course, redémarrage). `$27` n'est lu nulle part.
3. **`$J=` hors de la limite du firmware.** Grbl 1.1 répond `error:15` sans bouger. Sur la LUNYEE, on ne sait pas si un pas hors limite donne `error:15` ou `ALARM:2` avec redémarrage. A1-5 est à corriger dans les deux cas.
4. **`G38.2` laissé comme mode modal après un palpage à la plaque échoué.** Le bloc renvoie `G0` après un échec (`block-probe.js:1051-1057`) ; la plaque non. Une ligne suivante faite de mots d'axe seuls palperait. Le départ ne vérifie pas le mode modal de mouvement.
5. **`homed` vrai sans cycle.** `job-service.js:313-328` : notre `$H` écrit, puis un rapport Idle plus d'une seconde après, sans état Home vu ni `ok` attendu → `homed = true`. Il faut un `$H` perdu sur la ligne ; je n'ai pas su le provoquer autrement.
6. **Arrêter refusé sur un rapport périmé.** `job-service.js:1918-1921` : au repos de CNCjs, si le dernier rapport (même vieux) dit Idle et que la file est vide, Arrêter répond « Aucun travail à arrêter ». Un arrêt ne devrait pas dépendre d'un rapport périmé.
7. **Paquet du flux plus gros que le tampon d'écriture.** `touch-stream.js` ferme le flux quand `res.write` rend `false`, ce qui arrive dès qu'un seul paquet atteint le seuil du tampon de Node (16 Ko, 64 Ko selon la version). Mesuré ici : 4,2 Ko sans programme, 7,4 Ko avec, 8,8 Ko avec un programme plein de codes non interprétés. Pas atteint ; à surveiller par A3 si l'instantané grossit.
8. **Reset au repos sur la LUNYEE.** Le fait de terrain parle d'un Arrêter en plein usinage. Si tout `0x18` redémarre la carte, l'arrêt d'un palpage ou d'une prise d'origine perd aussi la référence ; seul le bloc le dit (`needsHoming`).
9. **Rapports pendant la prise d'origine.** `homeMpos` n'est appris que si un rapport Home a été vu (`job-service.js:326`). Si la LUNYEE n'en envoie pas, X et Y restent ambigus à 0. Les essais du 14 novembre laissent penser qu'elle en envoie ; non vérifié.
10. **Test broche laissé tourner.** `M3 S…` du test de mise en service n'a aucune surveillance : flux perdu, la broche tourne jusqu'à un M5.
11. **Identité du pilote.** L'instantané publie `control.owner.id` (le `clientId` de la tablette) ; une autre page de la même session peut l'envoyer comme le sien et passer le bail (`api.touch.js:49-59`). Le bail protège des maladresses, pas d'un client qui triche.

---

## Commande machine → gardes → ce qui est écrit → trous

Gardes communs aux actions « gardées » (`job-service.js:169-173, 1624-1649`) : bail de pilotage, `generation` du contrôleur, flux ouvert (`transportId`). `available()` (`job-service.js:643-656`) : port ouvert, rapport de moins de 2,5 s, pas de commande système. Pause, Arrêter, M5 et l'arrêt d'un déplacement n'exigent ni bail, ni flux, ni rapport récent.

| Commande | Gardes d'état | Référence | Course | Décalage | Écrit sur le port | Trous |
|---|---|---|---|---|---|---|
| Départ | ticket 15 s lié au flux ; Idle, file vide, broche arrêtée, fichier inchangé (empreinte), unités et mode si le programme ne les fixe pas, profil laser | non | avertissement seul | non | lignes du programme (sender), puis `G4 P0.5` | A1-1, A1-2, A1-3, A1-4, A1-5 |
| Pause | travail en cours | — | — | — | `!` | — |
| Reprise (après pause) | ticket ; Hold, ou Idle/Hold pour M0/M1/M6 ; refus si carte redémarrée, erreur, palpage échoué, travail lancé du PC | non | non | non | `~` ; après M6 : `M3 S…`, `G4 P3`, puis `~` | — |
| Arrêter | aucun (toujours permis) | — | — | — | selon l'état : `!` puis `0x18` au repos ou après 5 s ; `0x18` seul ; `0x85` pour un déplacement | soupçons 6 et 8 ; sur la LUNYEE, référence perdue à chaque arrêt, non dit hors bloc |
| Reset | pas d'action propre ; par Arrêter (prise d'origine, porte, fin d'arrêt) | — | — | — | `0x18` | soupçon 8 |
| Déverrouiller | ticket ; alarme, pas de travail, file vide | — | — | — | `$X` | ouvre A1-4 |
| Prise d'origine | ticket ; Idle ou alarme, broche arrêtée, `$22=1` connu | — | — | — | `$H` | `WCO` nul ensuite (A1-2) ; soupçon 5 |
| Pas | Idle, pas de travail, file vide, `$13=0`, version connue, fonction activée, flux de l'appareil ; broche en marche : 0,1 mm au plus | exigée au-delà de 1 mm | cible dans la course, sans marge | — | `$J=G91 G21 <axe><d> F<avance>` ; annulation `0x85` sur flux fermé, pilotage pris, rapport périmé | A1-5 ; soupçon 3 |
| Déplacement continu | comme le pas ; broche arrêtée ; maintien toutes les 100 ms, coupure à 250 ms | exigée | bornée à course − 1 mm et à 60 s | — | un `$J=` borné ; `0x85` répété tant que Jog est rapporté | soupçon 2 |
| Aller à | n'existe pas côté serveur (seul le cadrage laser fait des `$J=G90`) | | | | | — |
| Zéro d'axe ici | ticket ; au repos, repère actif connu et récent, machine immobile depuis la confirmation | non | — | relu après (WPos ≈ 0) | `G10 L20 P<n> X0 …` | recharge tout G54 sur la LUNYEE (les autres axes sautent à l'écran) |
| Zéro Z à la plaque | ticket ; Idle (ou pause M0/M1/M6), `G90 G21`, `$13=0`, sonde libre, broche arrêtée, repère connu | non | non | non | `G38.2 Z… F100`, `G0 Z…`, `G38.2 Z… F25`, `G10 L20 P0 Z<épaisseur>`, `G0 Z…`, puis le mode du programme en pause | A1-6, A1-2 ; soupçon 4 |
| Palpage au bloc | ticket lié au plan ; gardes de la plaque + repos strict, `M5`, `G94`, vitesses max connues, test du contact de moins de 10 min, bail strict ; avant chaque ligne : flux, bail, rapport récent, délai | exigée | enveloppe à 1 mm des fins de course | G92 et TLO nuls ; repère actif non recoupé | `$#`, `G38.3 …`, `G53 G1 …`, `G0`, `G10 L20 P<n> …` ; arrêt : `!` puis `0x18` | A1-7, A1-11 |
| Reprise à une ligne | chargement au repos ; plan refusé si l'état du programme n'est pas sûr ; puis gardes du départ | non | avertissement seul | non | préambule (`G0 Z<dégagement>`, `G0 X Y`, `M3 S`, `G4 P3`, `G1 Z F`), puis le programme | A1-2, A1-4 |
| Correction d'avance, de broche | travail en cours ou en pause | — | — | — | `0x90`-`0x94`, `0x99`-`0x9D` | A1-13 |
| Correction des rapides | travail, ou repos | — | — | — | `0x95`, `0x96`, `0x97` | — |
| Relecture des réglages | Idle, pas de travail | — | — | — | `$$`, précédé de `$I` si version inconnue (par le feeder) | A1-8 |
| Test broche | ticket ; repos, `$30` connu, profil CNC | — | — | — | `M3 S<$31 ou $30/4>` | soupçon 10 |
| Arrêt broche | repos, ou pause M0/M1/M6 à l'arrêt | — | — | — | `M5` (par le feeder) | A1-14 |
| Macro | ticket ; repos, broche arrêtée | non | non | non | le contenu de la macro CNCjs | par conception : aucun contrôle du contenu |
| Cadrage laser | ticket ; gardes du pas ; X et Y `validated` | par le contrôle | par le contrôle | repère du programme = actif | `M5`, puis `$J=G90 G21 X… Y… F…` | A1-3 le rend impossible sur un axe à bit `$23` |
| Console | n'existe pas dans le service tactile | | | | | les écritures Socket.IO de l'interface classique passent par `refuseSocket` (`index.js:121-140`) |

### Et si…

| Événement | Ce que fait le serveur | Trou |
|---|---|---|
| L'état change entre le contrôle et l'envoi | Contrôle et envoi sont synchrones ; après une étape asynchrone (relecture du fichier), le contrôle est refait (`job-service.js:1823-1824`). L'état contrôlé est le dernier rapport, vieux de 2,5 s au plus. | — |
| Le port se ferme | Enregistrement oublié au battement suivant, minuteries annulées, bail rendu (`job-service.js:1969-1983`). | — |
| La carte redémarre (bannière) | Ticket révoqué, `homed` faux, travail en cours mis en pause et reprise refusée, bloc interrompu sans autre ligne, pas en attente lâché. | A1-4, A1-12 |
| Une alarme tombe | `homed` faux, déplacement annulé, palpages en échec, journal si un travail tourne. | A1-12 |
| Deux clients agissent | Bail par port ; un seul ticket par contrôleur (le second remplace le premier) ; déplacement lié au flux de son auteur. | soupçon 11 |
| Le rapport est périmé | Toute action gardée refusée ; déplacement annulé ; bloc arrêté. Le travail en cours continue (voulu). | plaque non surveillée (A1-6) ; soupçon 6 |
| Le flux de la page est perdu | Tickets révoqués, déplacement annulé, bloc arrêté (3 s de grâce pour une rotation). Travail et prise d'origine continuent. | plaque (A1-6) ; test broche (soupçon 10) |
| CNCjs redémarre en plein travail | La carte finit son tampon puis s'arrête, broche en marche. Au retour : aucun travail connu, `homed` faux, version inconnue. | A1-8 ; rien ne dit à l'opérateur qu'un travail a été coupé |

---

## Écarts entre les simulateurs et la vraie carte

Entrée du profil « LUNYEE » (§ 4.5). « Cache » : le défaut que l'écart empêche de voir.

### `grbl-simulator/grbl-simulator.js`

| Vraie carte | Simulateur | Cache |
|---|---|---|
| `WCO:0,0,0` après `$H` jusqu'à un changement de repère ou un `G10` | décalage inchangé par `runHomingCycle` (`:2093-2135`) | A1-2, A1-7 |
| `$HX` fait les trois axes | `$HX` → `error:3` (`:837, :902`) | A1-9 |
| `ALARM:2` refusé avant le mouvement, puis redémarrage, MPos 0 | contrôle pendant le mouvement, `|pos| > course` (symétrique : +130 accepté en Z), aucune ligne `ALARM:2` émise, pas de bannière, position gardée (`:395-413, :2213-2232`) | A1-1, A1-4, A1-5, A1-12 |
| limite refusée avant la fin de course (entre 0,055 et 0,265 mm) | limite exacte à la course | A1-5 |
| reset en mouvement : MPos 0, non référencée | `ALARM:3`, bannière, position gardée (`:2141-2192`) | A1-4 |
| `$23=3`, origine forcée à 0, X et Y de 0 à + | `$23=0` par défaut ; la fin de cycle met 0,0,0 sans tenir compte de `$23` ni de `$27` | A1-3 |
| `$J=` hors course : inconnu (`error:15` sur Grbl 1.1) | aucun contrôle de course sur `$J=` | A1-5 |
| `$20=1`, `$21=1`, `$22=1`, `$10=1`, `$27=2`, version 1.1f | `$20=0`, `$21=0`, `$22=0`, `$27=1`, version 1.1h | tous les gardes de référence |
| S18000 plafonné à `$30=1000` | S rapporté tel quel, `$30` non appliqué | A1-13 |
| contact permanent de la sonde (broche à la masse) | réglable par l'injection de pannes (`probeTriggered`), absent du profil | T9 |
| CNCjs reconnecté sans bannière | bannière à chaque connexion | A1-8 |

### Faux Grbl de `block-probe.test.js` (ligne 46 et suivantes)

| Vraie carte | Faux Grbl | Cache |
|---|---|---|
| `WCO` nul après `$H` | `wco` = (20, 30, −100) gardé après la prise d'origine ; `$#` et le rapport toujours d'accord | A1-7 |
| limite logicielle | aucune : un `G38.3` ou un `G53 G1` hors course s'exécute | A1-5, A1-6 |
| reset : MPos 0 | `reset()` garde `g.m`, passe en Alarm, émet la bannière (`:133-143`) | soupçon 8 |
| `$HX` | non géré | A1-9 |
| rapports Home pendant le cycle : non vérifié | émis, donc `homeMpos` toujours appris | soupçon 9 |
| `G38.3` sans contact : à valider sur la machine | `PRB:…:0` puis `ok` | reste ouvert du lot palpage |
| contact permanent | seulement par `pinForced` dans des tests dédiés | T9 |

### Faux contrôleurs de `job-service.test.js`, `motion.test.js`

Ils notent les commandes sans rien simuler : `$23=0` (`motion.test.js`), aucune réponse à `$#`, aucun `WCO`, aucune alarme suivie d'une bannière. Tous les tests de course y tournent avec la convention standard [−course, 0] : A1-3 ne peut pas y apparaître. Le test `job-service.test.js:2283-2326` fixe le comportement que D1 change (« the start is not blocked »).

### Faux contrôleurs écrits pour cet audit

Les tests `bughunt-A1-*.test.js` portent chacun un faux contrôleur minimal aux réglages de la LUNYEE. Ils ne simulent pas la carte : ils rejouent les rapports qu'elle a produits (`WCO` nul, bannière après alarme, MPos 0). Ils ne remplacent pas le profil « LUNYEE » à écrire.

---

## Ce qui n'a pas été vérifié

- Rien sur la vraie machine, la Surface ni la RT.
- La suite Jest entière et le harnais n'ont pas été lancés : seuls mes 10 fichiers, un par un puis ensemble. Je n'ai pas vérifié que les tests existants passent toujours (je n'ai rien modifié).
- Lequel des deux décalages la carte exécute après `$H` (soupçon 1) ; la règle exacte de la limite logicielle ; la réponse à un `$J=` hors limite ; l'effet d'un reset au repos ; les rapports pendant la prise d'origine ; `$I` et `$$` en alarme sur cette carte.
- Que le kiosque ouvre la page par la boucle locale (A1-10).
- `resume.js` avant la ligne 380 (suivi de l'état du programme), `history.js`, `projects.js`, `wifi.js`, `system-stats.js`, `program-identity.js` : non lus. `GrblController.js` : seulement le feeder, les événements et la table des commandes.
- Le profil laser et la Surface RT : chemins lus, non éprouvés.
