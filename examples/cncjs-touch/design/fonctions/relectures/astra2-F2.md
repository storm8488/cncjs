> **Note de la réunion `feat/fonctions-5` : lot F2 non installé.** Relecture gardée telle quelle pour l'histoire du lot ; la dernière (`astra4-F2.md`) refuse l'installation.

Relecture de `feat/F2` à **`d86d1a44`**, après lecture du premier audit, du compte rendu et des corrections. **Les dangers ne sont pas tous levés.** Aucun fichier modifié, aucun accès à la CNC.

1. **danger — constat 1 : l’arrêt peut encore abandonner un jog.**

   Le chemin tablette testé par D1 est corrigé : `jogLive` survit à l’échec et impose l’arrêt préalable. Mais un **`gcode:stop` venant du PC** ouvre une autre fenêtre : `socketStop()` envoie une première annulation et programme sa surveillance ; le contrôleur appelle ensuite `workflow.stop()`, dont le listener exécute immédiatement `forgetJob()`. Celui-ci supprime l’état dont dépend cette surveillance. Sources : [job-service.js:709](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/job-service.js:709), [pause-retract.js:271](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:271), [pause-retract.js:1186](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:1186).

   **Reproduit en mémoire :** après cet arrêt PC et 30 nouveaux rapports `Jog`, une seule annulation a été émise ; aucune répétition. Le `M5` prévu au repos est également abandonné. D1 teste Pause depuis la tablette ; D6 teste `jogCancel` et `0x85` : aucun ne traverse cet événement `workflow.stop()`.

   **Correction :** transférer la surveillance du mouvement et l’arrêt de broche à une procédure indépendante du job avant de l’effacer. Ajouter un test par la façade Socket.IO, le vrai contrôleur et son listener d’arrêt.

   Autre limite : [halt.js:89](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/halt.js:89) émet toujours un reset après cinq secondes, **même avec des rapports `Jog` continus**. Reproduit à 5 050 ms. D1 ne vérifie qu’une immobilisation avant cette échéance ; il ne prouve donc pas « reset seulement au repos ». Cette limite reconnue dans le compte rendu reste à résoudre ou à qualifier explicitement.

   **à corriger également — D1b :** si les deux rapports de repos arrivent après l’expiration de `secure()`, `jogLive` reste vrai. Arrêter provoque alors une retenue puis un reset inutiles, même broche arrêtée. [pause-retract.js:294](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:294). Suivre la fin du jog dans `report()`, indépendamment de ce délai ; prolonger [le test D1b](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:865) au-delà de cinq secondes.

2. **remarque — constat 2 : fenêtre initiale fermée, test probant.**

   [before()](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:489) vérifie désormais le départ attendu et la cible avant l’écriture, après l’éventuelle attente du flux. [D2](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:880) change réellement Z pendant cette attente et exige l’absence de `$J=`. Le dépassement de plusieurs millimètres du premier audit est bloqué.

3. **danger — constat 3 : contrôle de broche encore incomplet.**

   [D3 et D3b](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:902) reproduisent correctement l’arrêt rapporté après et pendant l’approche. Deux variantes restent pourtant autorisées par [spindleRunning()](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:476), reproduites en mémoire jusqu’à l’écriture effective de `$J=G91 G21 Z-5 F100` :

   - Un rapport `FS:0,0`, puis un rapport avec XYZ **sans FS**, arrivent avant la surveillance suivante. L’arrêt constaté disparaît du contrôle, qui se replie sur un ancien `$G` M3 encore considéré frais.
   - La broche attendue est M3 ; un client direct commande M4 et le serveur reçoit `$G → M4`, avec une vitesse positive. La garde accepte indifféremment M3 et M4. La différence avec le sens mémorisé n’est refusée qu’à la comparaison finale, **après la plongée**.

   **Correction :** mémoriser immédiatement toute perte de la condition broche, sans qu’un champ absent puisse l’effacer ; vérifier également le sens attendu avant chaque descente et pendant celle-ci. Ajouter ces deux successions aux tests. Les tests actuels laissent passer la surveillance après `FS:0` et ne jouent aucun changement de sens.

4. **danger — constat 4 : la fenêtre a été déplacée, pas entièrement fermée.**

   [drain():703](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:703) adopte le dernier `r.wco` au **deuxième** rapport `Idle`, sans établir sa continuité avec celui utilisé avant l’arrêt.

   **Reproduit en mémoire :** premier `Idle`, machine arrêtée avec WCO Z = −115 ; modification extérieure de G54 ; deuxième `Idle` portant WCO Z = −105. Le nouveau zéro devient `restWco`, puis `mem.wco`. Une reprise depuis `held` est acceptée et `gcode:resume` est envoyé malgré les **10 mm de changement**.

   [D4](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:945) ne joue pas cette fenêtre : il modifie le zéro après `ctx.rest()` complet.

   **Correction :** établir une référence antérieure et vérifier sa continuité pendant la vidange et la preuve du repos. Toute transition de repère non expliquée par les lignes du programme doit interdire la reprise automatique. Ajouter le changement entre les deux `Idle`.

5. **à corriger — constat 5 : Alarm→Idle corrigé, invalidation permanente incomplète.**

   [D5](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:964) injecte bien `Alarm` puis `Idle` dans le vrai parseur, sans ligne `ALARM:n`. En phase `parked`, la correction ferme cette fenêtre.

   Mais [fail():336](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:336) transforme encore l’alarme en `held` lorsqu’on est en `lifting` **avant la première écriture**, par exemple pendant l’attente du flux. L’alarme reste seulement dans `s.failure`. Si un client direct refait une prise d’origine puis ramène position, modalités et WCO aux mêmes valeurs, la reprise peut être acceptée : aucun verrou permanent ne subsiste.

   **Correction :** exclure explicitement Alarm et Restart du retour vers `held`, et tester l’alarme pendant cette attente. Le retour immédiat à `Idle` est couvert ; la permanence demandée dans le premier audit ne l’est pas complètement.

6. **remarque — constat 6 : fermé pour les deux entrées signalées, tests probants.**

   [index.js:133](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/index.js:133) fait annuler F2 avant de transmettre `jogCancel` ou `0x85`. [Les tests Socket D6](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-socket.test.js:179) traversent réellement la façade puis le contrôleur pendant le dwell et la montée. Ils vérifient l’absence de descente ultérieure. Cela ne couvre pas le chemin `gcode:stop` du point 1.

7. **remarque — constat 7 : fermé, tests probants.**

   [pause-retract.js:1021](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:1021) attend le flux du bon appareil, le revérifie synchroniquement puis refait les contrôles avant `gcode:resume`. [D7 et D7b](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:978) ferment effectivement le flux à la transition finale, depuis `parked` et `held`, et vérifient l’absence de `~` jusqu’à son retour.

8. **à corriger — constat 8 fermé, mais nouveau refus définitif injustifié.**

   [D8 et D8b](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1027) utilisent le vrai parseur : des rapports sans XYZ ne prouvent plus le repos ni la position. Cette correction est effective.

   En revanche, si un rapport sans XYZ arrive juste avant une nouvelle écriture — notamment au retour du flux après le dwell — [atPosition():463](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:463) produit `ETOUCH_RETRACT_MOVED`, axe XYZ, même sans déplacement. Le caractère temporaire `soft` est perdu dans [sequenceFailed():583](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:583) : la reprise devient définitivement impossible. Reproduit en mémoire.

   **Correction :** distinguer « coordonnées momentanément absentes » et « déplacement constaté » ; attendre une nouvelle preuve sous délai avant l’écriture. Ajouter le rapport sans XYZ intercalaire à la transition entre deux étapes.

9. **remarque — constat 9 : les trois preuves initialement défectueuses sont réparées.**

   [D9](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1072) conserve réellement seulement des flux B. Les tests Socket traversent la façade utilisée en production. [Le test de page](C:/Users/damou/Documents/claude/cncjs-wt/F2/examples/cncjs-touch/test-pause-retract.cjs:153) provoque réellement `stream.onerror()` sous confirmation ouverte et vérifie zéro POST, tout en conservant Pause et Arrêter.

   Réserve de couverture : [le test Socket intitulé « every phase »](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-socket.test.js:216) ne vérifie les refus qu’en `draining` et `lifting`. Ajouter les quatre autres phases ou corriger cet intitulé.

10. **remarque — constat 10 : preuve logicielle nettement complétée.**

    [Le parcours LUNYEE](C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-lunyee.test.js:191) compare maintenant les positions machine/interpréteur au départ de `~`, le premier bloc repris et tous les blocs du fichier au témoin, avec début, fin et centre. Les trois injections de désynchronisation rendent le témoin discriminant. La position d’interpréteur distincte du simulateur est effectivement utilisée.

    Cela ferme le défaut de preuve initial dans le périmètre simulé. La qualification du binaire réel reste correctement séparée dans [le protocole:159](C:/Users/damou/Documents/claude/cncjs-wt/F2/examples/cncjs-touch/design/refonte/PROTOCOLE-ESSAI.md:159).

Le test de page a été exécuté avec succès. Les nouveaux contre-exemples ont été exécutés en mémoire sur les fonctions réelles, avec dépendances simulées. Les suites Jest n’ont pas été relancées : leurs fixtures créent et écrivent des fichiers temporaires. Je ne reprends donc pas à mon compte les « 1 616 tests verts » du compte rendu.

VERDICT : à ne pas installer — dangers restants : surveillance de jog abandonnée par l’arrêt PC, reset encore possible pendant Jog, descente autorisée avec broche arrêtée ou de sens incompatible, zéro pièce modifié accepté comme référence.
