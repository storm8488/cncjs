Relecture de `feat/F2`, diff `db584555..5414f726`, avec les documents demandés. **Aucun fichier modifié, aucun accès à la machine.** Les constats reposent sur les chemins du code et des contre-exemples exécutés en mémoire, avec dépendances simulées. Les suites complètes Jest et navigateur n’ont pas été relancées.

1. **Danger — « Arrêter » après un échec peut réinitialiser un jog encore en mouvement, ou abandonner son arrêt.**  
   Sources : [pause-retract.js:235](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:235), même fichier ligne 942 ; [job-service.js:2530](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/job-service.js:2530) ; [halt.js:38](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/halt.js:38).  
   Pause ou une perte de suivi envoie `0x85`, puis `toFailed()` efface `s.out`. Si le jog décélère encore, ou si l’annulation est perdue, « Arrêter » ne reconnaît plus ce mouvement en phase `failed`. Broche active : il envoie immédiatement un reset malgré l’état `Jog`. Broche arrêtée : il n’envoie aucun nouvel arrêt et supprime aussi les répétitions d’annulation. Les deux chemins sont reproduits en mémoire.  
   **Correction :** conserver l’indication « mouvement potentiellement actif » jusqu’au repos prouvé ; traiter `Jog` indépendamment de la phase et transférer sa surveillance à la procédure d’arrêt.

2. **Danger — un déplacement relatif part depuis une position qui a changé depuis son calcul.**  
   Sources : [pause-retract.js:414](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:414), lignes 438–450 et 864–877.  
   Après une attente de retour du flux, `ensure()` revérifie l’état `Idle`, mais ni la position initiale attendue ni la cible dans la course. Exemple reproduit : descente calculée depuis Z −5 vers −113,4 ; un nouveau rapport indique désormais Z −30 ; le serveur écrit quand même `Z-108.4`, visant **−138,4 mm**. Avec `$20=0`, expressément admis par F2, la protection logicielle de la carte ne rattrape pas ce dépassement. La comparaison de position intervient après le mouvement.  
   **Correction :** immédiatement avant chaque `$J=`, vérifier la position de départ attendue, les bornes actuelles et la cible effective ; refuser toute divergence.

3. **Danger — les derniers millimètres de descente peuvent partir avec une broche déjà rapportée arrêtée.**  
   Sources : [pause-retract.js:844](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:844), lignes 864–887.  
   La broche est contrôlée après `G4`, puis seulement dans la comparaison finale. Après l’approche rapide, pendant l’attente des rapports `Idle`, un client direct à la carte peut envoyer `M5`. Même si `FS:0` et `$G … M5` sont reçus, la vérification de fin d’approche ne contrôle que la position : `Z-5 F100` peut suivre. Le refus modal arrive après la plongée. Le passage de la commande avec une broche rapportée à zéro est reproduit en mémoire.  
   **Correction :** contrôler une information de broche fraîche avant chaque descente et interrompre la séquence si cette condition disparaît.

4. **Danger — un zéro pièce modifié peut devenir la référence prétendument inchangée.**  
   Sources : [pause-retract.js:512](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:512), lignes 741–748 et 992–994.  
   `mem.wco` commence à `null`, puis adopte sans comparaison le premier `WCO:` reçu après le repos. Si un client Wi-Fi modifie G54 avant ce rapport, le nouveau zéro devient la référence ; les comparaisons suivantes l’acceptent. Reproduction : zéro Z initial −100, premier WCO tardif −90, reprise autorisée malgré les **10 mm de décalage**. Ce défaut est également présent dans la conception.  
   **Correction :** établir la continuité avec le décalage réellement utilisé au point d’arrêt, en tenant compte des lignes vidées du tampon. Si cette continuité ne peut être prouvée, interdire la reprise automatique ; ne pas adopter aveuglément un premier rapport tardif.

5. **Danger — une alarme vue dans un rapport d’état peut être oubliée avant la reprise.**  
   Sources : [job-service.js:436](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/job-service.js:436) ; [pause-retract.js:979](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:979), lignes 339–348 et 719–774.  
   Un rapport `<Alarm|…>` invalide bien `homed`, mais n’annule pas immédiatement F2. Si `Idle` revient avant la prochaine surveillance — jusqu’à une seconde en `parked` — la reprise ne vérifie ni cette perte de référence ni l’historique d’alarme. Reproduit avec le vrai parseur : Alarm puis Idle, sans ligne `ALARM:n`, reprise acceptée avec `homed=false` et `referenceLost='alarm'`.  
   **Correction :** annuler F2 synchroniquement dès tout statut Alarm ; mémoriser définitivement cette invalidation et la vérifier à la reprise.

6. **Danger — une annulation de jog Socket.IO peut être suivie d’une nouvelle descente.**  
   Sources : [index.js:122](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/index.js:122), ligne 139 ; [control.js:43](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/control.js:43) ; [pause-retract.js:864](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:864).  
   `jogCancel` et `0x85` passent comme commandes sûres, mais ne déclenchent pas `socketStop()`. Pendant le `G4 P3` de reprise, ils n’annulent donc pas la séquence : l’approche et la plongée partent ensuite. Le contrôleur écrit seulement l’octet d’annulation, sans modifier le workflow.  
   **Correction :** faire annuler synchroniquement F2 par ces voies avant leur transmission. Tester l’entrée Socket.IO réelle, notamment pendant le dwell et entre deux mouvements.

7. **Danger — la reprise finale peut relancer le programme sans flux actif.**  
   Sources : [pause-retract.js:899](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:899), lignes 349–355 et 414–423 ; [touch-stream.js:61](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/touch-stream.js:61).  
   Les lignes intermédiaires attendent `streamOpen()`, mais l’envoi final de `gcode:resume` contourne cette attente. `ensure()` tolère encore les trois secondes de grâce. Une rotation juste avant cette étape permet donc l’envoi de `~` et des lignes du programme avant la reconnexion. Une rotation forcée reste possible malgré la réservation du flux, à 80 secondes ou au-delà de 1 Mio.  
   **Correction :** exiger un flux actif immédiatement avant la reprise finale, puis refaire tous les contrôles après toute attente, également depuis `held`.

8. **Danger — des rapports sans coordonnées peuvent « rafraîchir » une ancienne position.**  
   Sources : [pause-retract.js:995](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:995) ; [job-service.js:387](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/job-service.js:387) ; [GrblRunner.js:110](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/controllers/Grbl/GrblRunner.js:110).  
   Le parseur conserve les anciennes coordonnées lorsqu’un rapport ne contient pas d’axes. F2 utilise cet état fusionné avec l’horodatage du nouveau rapport, sans contrôler `xyzAt`. Deux `<Idle|FS:0,1000>` peuvent ainsi prouver artificiellement deux positions identiques après la vidange. Si Z a bougé depuis la dernière position explicite, la remontée relative est calculée depuis une valeur fausse. La conservation des coordonnées est vérifiée avec le vrai parseur.  
   **Correction :** exiger deux rapports contenant réellement XYZ valides et postérieurs à la vidange ; dater séparément les champs utilisés et refuser leur péremption.

9. **À corriger — plusieurs tests ne prouvent pas la protection annoncée.**  
   Sources : [pause-retract.test.js:550](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:550), ligne 762 ; [test-pause-retract.cjs:148](/C:/Users/damou/Documents/claude/cncjs-wt/F2/examples/cncjs-touch/test-pause-retract.cjs:148).  
   Le témoin « flux d’un autre appareil » rouvre un flux avec **A**, l’appareil initial. Le test Socket.IO appelle directement `socketStop()` et manque ainsi le raccordement défectueux du constat 6. Le test de page « sans flux, aucune demande » recherche seulement une chaîne dans le source.  
   **Correction :** utiliser réellement l’appareil B seul, traverser les entrées Socket.IO et simuler la perte du flux dans la page, avec assertions sur les octets et les POST. Ajouter les transitions des constats précédents.

10. **À corriger — le parcours LUNYEE ne démontre pas la trajectoire de reprise exigée.**  
    Sources : [pause-retract-lunyee.test.js:137](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-lunyee.test.js:137) ; [grbl-simulator.js:1639](/C:/Users/damou/Documents/claude/cncjs-wt/F2/grbl-simulator/grbl-simulator.js:1639).  
    Le test compare les lignes envoyées et la position finale, pas toutes les positions de passage demandées par la conception. Son commentaire annonce aussi une vérification avant le premier arc qui n’est pas effectuée. Le simulateur reprend directement la position machine lorsque son tampon est vide : il ne démontre pas la synchronisation d’une position d’interpréteur distincte.  
    **Correction :** vérifier explicitement le point de reprise et les positions intermédiaires, avec un témoin capable de détecter une désynchronisation ; conserver la qualification du firmware réel comme essai séparé.

**Remarque — portée des preuves.** Les assertions préexistantes modifiées ne sont pas affaiblies ; nonce, génération et confirmation restent présents. Cela ne compense pas les chemins dangereux ci-dessus. Les limites matérielles reconnues dans [SURETE.md:227](/C:/Users/damou/Documents/claude/cncjs-wt/F2/examples/cncjs-touch/design/refonte/SURETE.md:227), notamment la vitesse physique de broche et le maintien mécanique de Z, restent non vérifiées.

**Verdict : à ne pas installer en l’état.** Corriger les huit dangers, compléter les tests 9 et 10 et rectifier les garanties correspondantes de la conception et de `SURETE.md` avant une nouvelle relecture et les essais matériels encadrés.

