# C1 — contre-avis de sûreté n° 2 (Astra, lecture seule, 2026-11-26)

**La révision 2 progresse nettement, mais nécessite encore des corrections ciblées avant le code.** Relecture de `feat/C1`, HEAD `be0efe10`, sans modification de fichier ni contact avec la machine. Les rejeux mentionnés concernent le parseur existant, pas une implémentation de C1.

1. **danger — Un `$G` ancien peut encore autoriser la ligne suivante.**  
   `C1-CONCEPTION.md:141`, contre la règle R-3 à `:20` ; `plate-probe.js:248`.

   `r.gc.n > ref.gcAtOk` prouve l’ordre des observations, pas leur fraîcheur. Pour un `$J=` ou un `G0`, l’acquittement peut précéder la fin du mouvement. Un M5 reçu juste après cet acquittement satisfait encore le compteur après trente secondes de déplacement, même sans nouveau `$G`.

   **Correction avant le code :** dans `spindleHeld`, exiger également un `$G` de moins de 2,5 s **au moment de l’écriture**. Conserver l’absence d’exigence de fraîcheur modale pendant la ligne. Ajouter à T11 : M5 postérieur à l’`ok`, devenu ancien avant l’arrivée, XYZ/FS parfaits ; aucune ligne suivante avant un nouveau M5.

2. **danger — La plaque garde la fenêtre que la révision ferme pour le bloc.**  
   `C1-CONCEPTION.md:127`, à comparer à `:130` ; [plate-probe.js:399](src/server/services/touch/plate-probe.js:399), `:404`, `:411`.

   La cible est calculée avant `send`. Exemple : contact à Z=0, retrait calculé `G0 Z1`. Pendant la nouvelle attente du `$G`, un déplacement extérieur remonte à Z=10, puis deux rapports Idle complets et M5 arrivent. Les gardes proposés passent ; **l’ancien retrait devient une descente rapide de 9 mm**. Un `G10 L20` peut également poser le zéro après un déplacement survenu depuis le contact.

   **Correction avant le code :** appliquer à la plaque la comparaison prévue pour le bloc : position et repère au dernier instant conformes à ceux ayant servi au calcul ; sinon abandon. Ne pas recalculer silencieusement un contact. Étendre T13b à la plaque, notamment pendant l’attente modale.

3. **danger — Une garde indirecte reste oubliée : la position apprise après `$H`.**  
   [job-service.js:436](src/server/services/touch/job-service.js:436), `:387`, `:134` ; `motion.js:241` ; `job-service.js:1819`.

   Après une prise d’origine Touch, `homeEnd()` copie encore la position fusionnée dès que `r.sawHome` est vrai. Le rapport terminal Idle peut ne contenir aucun XYZ. Cette position devient `r.homeMpos`, ensuite utilisée pour choisir la convention des courses dans les gardes de pas, continu et programme. Les rapports complets ultérieurs ne corrigent pas cette preuve mémorisée. Le parcours de homing extérieur possède déjà une exigence positionnelle à `job-service.js:470`.

   **Correction avant le code :** inclure cet apprentissage dans C1. N’enregistrer la convention que depuis le rapport terminal validé strictement ; sinon conserver `homeMpos = null`. Cela n’impose aucune position avant `$H`. Tester une ancienne position zéro, puis Home et Idle sans XYZ, avec un témoin terminal explicitement positionnel.

4. **à corriger avant le code — Le champ brut validé peut différer de la valeur copiée depuis `payload`.**  
   `C1-CONCEPTION.md:32`, `:42` ; [GrblLineParserResultStatus.js:28](src/server/controllers/Grbl/GrblLineParserResultStatus.js:28), `:47`.

   Rejeu avec le vrai Runner :

   ```text
   <Idle|MPos:1,2,3|junk:MPos:4,5,6|FS:0,0>
   ```

   Il existe un seul champ délimité `MPos:` valide, mais le parseur trouve aussi le MPos imbriqué et livre **4,5,6** dans `payload.mpos`. `explicitXyz` est vrai.

   **Correction :** comparer les valeurs du repère explicitement rapporté à celles du champ brut validé, ou construire cette partie depuis le brut. Désaccord : position inconnue. Pour FS, utiliser effectivement le second nombre du champ validé. Le parseur global peut rester inchangé.

5. **à corriger avant le code — Le « dernier A reçu » peut bloquer un départ après un arrêt normal.**  
   `C1-CONCEPTION.md:139` ; [GrblRunner.js:103](src/server/controllers/Grbl/GrblRunner.js:103) ; `FIRMWARE.md:129`.

   La conception ne définit pas l’effacement de `A:S` ou `A:C`. Or un rapport **avec Ov mais sans A** signifie accessoires arrêtés ; sans Ov, il ne fournit pas de nouvel instantané accessoire. Le Runner applique déjà cette distinction.

   **Correction :** reprendre explicitement cette sémantique dans la donnée utilisée par `spindleRefusal`. Tester `A:S → M5 → FS:0,0 / GC M5 → Ov sans A` : le départ doit redevenir possible. Garder `spinHints` pour détecter les contradictions pendant une séquence, sans en faire un verrou permanent des départs suivants.

6. **à corriger avant le code — Le nouveau refus de `$H` en alarme n’a pas de remède opérateur fonctionnel.**  
   `C1-CONCEPTION.md:164` ; `job-service.js:1300`, [job-service.js:2492](src/server/services/touch/job-service.js:2492), `:2677`.

   Un ancien GC M3 depuis la bannière, avec FS désormais à zéro, bloque `$H`. Pourtant, en Alarm, « Arrêter la broche » **n’écrit pas M5**. Arrêter ne fournit pas non plus une réinitialisation générale lorsque la machine est en Alarm sans travail ni file.

   **Correction :** distinguer le modal antérieur à l’alarme d’une contradiction nouvellement observée, et définir une récupération sûre accessible depuis le kiosque. Si une réinitialisation explicite est retenue, annoncer la perte de référence et imposer ensuite une nouvelle prise d’origine. Tester le parcours complet ; ne pas proposer `$X` comme contournement du refus.

7. **à corriger avant le code — Les délais sont mieux présentés, mais la reprise `$G` à dix secondes reste trop générale.**  
   `C1-CONCEPTION.md:71`, `:182`, `:190` ; [GrblController.js:917](src/server/controllers/Grbl/GrblController.js:917) ; `plate-probe.js:451`.

   Les interrogations `$G` existent aussi pendant une pause. En revanche, la remise à zéro de leurs masques après dix secondes exige **workflow idle et Runner Idle**. Une réponse perdue pendant M6 peut donc empêcher durablement les interrogations suivantes. L’échec du palpage marque ensuite `probeFailed` et interdit la reprise.

   **Correction :** documenter cette condition et cette conséquence. Conserver les délais comme seuils logiciels, mesurer les attentes et utiliser la borne réelle de chaque ligne : « durée + 10 s » décrit le cadrage, pas toutes les lignes de palpage.

8. **à corriger avant le code — Certaines mutations ne discriminent toujours pas la protection annoncée.**  
   `C1-CONCEPTION.md:216`, `:217`, `:241`.

   Pour M19/M22, retirer l’attente après `quiet` peut faire lire le contact trop tôt, mais la nouvelle garde **avant écriture** bloque encore la ligne suivante. « Un seul Idle, aucun octet supplémentaire » peut donc rester vert. T13b décrit seulement le bloc et ne prouve pas la garde de la plaque.

   **Correction :** observer le contact ou la cible calculés prématurément, tester la postcondition de `send`, ou reconnaître précisément la redondance. Ajouter la variante plaque. Les nouveaux T1b, T4c et T4h répondent en revanche correctement aux objections correspondantes du premier avis.

9. **à vérifier au code — L’attente modale ne doit jamais devenir un délai de 2,5 s pendant G38.**  
   `C1-CONCEPTION.md:127`, `:140`, `:252` ; `plate-probe.js:220`, `:277` ; `block-probe.js:771`.

   La séparation proposée est correcte : surveillance position/FS/indices pendant la ligne, attente modale entre les lignes. **Je ne trouve pas de faux arrêt systématique en plein palpage dans cette règle.**

   Exiger des G38 longs pour plaque et bloc, dont une plaque pendant M6 : XYZ/FS frais, aucun nouveau GC durant la descente, puis échanges complets après contact. Reproduire aussi les drapeaux CNCjs d’une interrogation déjà en vol. Les raccourcis littéraux `[GC: M5]` ne conviennent pas : le vrai parseur les classe comme feedback. Employer des rapports modaux complets et leur `ok` distinct.

10. **à vérifier au code — Préserver les arrêts et préciser la portée de « D2 intact ».**  
    `C1-CONCEPTION.md:220`, `:254` ; `plate-probe.js:487`, `:458` ; `block-probe.js:1059` ; `halt.js:63`.

    Les routes `stop`/`abort` puis `halt` conviennent : **aucun `0x85` pour arrêter un G38**. Vérifier les réservations, l’annulation des attentes, les bannières et l’absence de ligne après résolution tardive. Pause et Arrêter doivent rester indépendants des nouvelles preuves.

    Deux précisions nécessaires :
    - « Arrêter la broche » ne route actuellement vers l’arrêt de séquence que pour le bloc et le cadrage ; pendant la plaque, `job-service.js:2496` peut encore injecter un M5. T16 doit fixer le comportement attendu et contrôler ses acquittements.
    - Après un G10 écrit ou éventuellement écrit, ou après reset, D2 doit être invalidé. La plaque invalide aujourd’hui D2 sur tout échec. Ne pas supprimer cette protection pour satisfaire une assertion trop générale « position absente : D2 intact ». Le WCO explicite différent sans XYZ reste bien traité par `work-offset.js:348`.

11. **à vérifier au code — La conversion des bancs est acceptable avec les contrôles désormais écrits.**  
    [C1-CONCEPTION.md:253](examples/cncjs-touch/design/plaque/C1-CONCEPTION.md:253).

    Conserver : commit séparé, passage sur l’ancien code, comparaison des octets et chronologies, entrée brute pour les omissions, aucun ajout silencieux de FS/M5/Idle/temps, justification de chaque modification d’entrée et d’assertion. Les tests négatifs C1 doivent échouer sur l’ancien code pour la raison visée.

    « Dix-sept fichiers » reste un périmètre à établir : la recherche trouve 22 fichiers émettant `status` sans argument, sans que tous nécessitent forcément une conversion.

12. **remarque — Plusieurs réponses du §8 sont maintenant satisfaisantes.**  
    `GrblRunner.js:124`, `GrblLineParser.js:77`, `job-service.js:1001`, `:2458`, `motion.js:1501`.

    La charge et `raw` sont bien disponibles après fusion, sans héritage des positions absentes dans la charge ; cela a été rejoué. `restedSince` ferme la contre-séquence **Idle Z haut explicite → descente invisible → Idle sans coordonnées**. Le refus sans FS complet ferme le repli dangereux, et M3 S0 est désormais refusé au départ des mouvements concernés.

    Les gardes programme et macro sont bien placés. Limiter le garde programme à la branche `start` préserve la reprise simple ; une reprise à une ligne est correctement traitée comme un nouveau départ. Un programme normal peut démarrer sous M5 puis commander sa broche. Le contrôle de course n’utilise pas la position courante pour inventer une trajectoire relative vérifiée.

    Les réponses **1, 2, 5, 6 et 13** du §8 sont donc cohérentes ; **10 et 11** sont de bonnes exigences de réalisation ; **3, 4, 7, 8, 9 et 12** restent à compléter comme ci-dessus. La couverture demeure celle annoncée : départs des programmes/macros, exceptions des petits pas et du homing, sans surveillance générale de leurs trajectoires.

VERDICT : à revoir