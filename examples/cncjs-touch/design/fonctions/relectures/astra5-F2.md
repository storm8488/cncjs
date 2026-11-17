Relecture de **`feat/F2` à `4382260c`**, après lecture des quatre avis et du compte rendu. **Les deux fenêtres exactes du quatrième tour sont corrigées, mais la réservation d’arrêt reste contournable.** Aucun fichier modifié, aucune connexion à la CNC.

1. **danger — Arrêter contourne la réservation lorsque la carte rapporte `Door`.**

   Sources : [job-service.js:2547](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/job-service.js:2547), [job-service.js:2593](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/job-service.js:2593).

   F2 est encore présent, ou sa surveillance résiduelle subsiste, lorsque l’opérateur touche Arrêter avec un dernier statut `Door:0`. `retract.halt()` efface cette protection. Les deux branches `Door` envoient ensuite directement `reset`, **sans créer `r.halting`**.

   **Reproduit en mémoire sur le vrai service et le vrai contrôleur, avec l’état F2 initial injecté :** la garde Socket refuse avant Arrêter, puis retourne `null` immédiatement après. Sans aucun nouveau rapport ni bannière, le contrôleur écrit :
   ```text
   0x18
   G0 X1
   ```
   Cela démontre l’envoi pendant un arrêt non confirmé, pas l’exécution physique du mouvement. Un PC autorisé par F5 peut donc ajouter une commande alors que le reset reste non confirmé ; un reset retardé ou perdu laisse cette fenêtre ouverte.

   **Tests :** [4-D1:491](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-socket.test.js:491) reproduit correctement l’ancien scénario `Idle → Arrêter → jog 0,1 mm`. Ni ce test ni les tables n’exercent les sorties `Door`.

   **Correction :** faire passer également ces sorties par l’arrêt réservé lorsqu’elles reprennent F2 ou sa surveillance résiduelle. Tester le refus des commandes suivantes jusqu’à la terminaison observée, notamment sans bannière.

2. **à corriger — la libération sans bannière réutilise une preuve antérieure au dernier reset.**

   Sources : [halt.js:75](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/halt.js:75), [halt.js:92](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/halt.js:92), [halt.js:184](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/halt.js:184).

   **Reproduit avec la vraie factory `createHalt` :**
   - reset à **0 ms** ;
   - premier `Idle` à **600 ms** ;
   - second appui sur Arrêter à **800 ms**, qui réémet le reset ;
   - second `Idle` à **850 ms** ;
   - réservation libérée à **900 ms**.

   La garde disparaît seulement **100 ms après le dernier reset**, en réutilisant un `Idle` antérieur. `haltAgain()` actualise `resetAt`, mais ne réinitialise pas la borne `mark` enfermée dans `afterReset()`.

   Autre variante reproduite : après l’établissement de cette borne, `Jog` puis un seul `Idle` entre deux ticks suffisent à libérer la réservation. Le code compte les rapports et regarde leur dernier état ; il ne compte pas réellement deux `Idle` consécutifs.

   **Test :** [4-D1c:540](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-socket.test.js:540) couvre correctement le cas simple, mais ni le reset réémis ni les rapports groupés.

   **Correction :** réarmer ensemble délai et preuve à chaque reset ; suivre les `Idle` dans chaque événement reçu, avec remise à zéro au moindre autre état.

3. **à corriger — certaines observations de broche ne restent pas irréversibles.**

   Deux contre-exemples ont été exécutés sur la vraie factory F2, avec dépendances simulées.

   **Direction reçue pendant la constitution du repos.** Premier `Idle` avec `FS:0,1000|A:C`, deuxième avec `A:S`, puis `$G M3` : F2 peut devenir `held` et envoyer `gcode:resume`. [spindleWant():625](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:625) ne compare rien avant la création de `mem` ; [report():1466](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:1466) ne conserve aucun historique de direction. Contrairement à `lastZero`, l’observation du premier rapport du repos est perdue. [4-D2d:1702](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1702) injecte le sens contraire seulement après établissement de `held`.

   **Arrêt de broche pendant la montée.** Un `Jog FS:0`, puis une vitesse revenue à 1000 au sommet, peuvent être suivis du `M5` normal, de `parked`, puis d’une reprise avec descente. [lift():893](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:893) pose `parkReport` avant `setpointLost()` : la comparaison porte alors sur la broche arrêtée après stationnement et oublie le zéro observé pendant la montée. `3-D3c` couvre la sortie vers `held`, pas ce passage par `parked`.

   **Correction :** conserver séparément les pertes de la broche du programme, depuis le premier rapport du repos jusqu’au `M5` propre, et les vérifier avant de changer de référence. Ajouter les deux successions complètes jusqu’à la demande de reprise.

   Ces cas contredisent l’invalidation définitive annoncée. **Ils ne démontrent pas une descente avec une broche encore rapportée incorrecte**, puisque son état a été rétabli : classement « à corriger ».

4. **à corriger — P1 est désactivée après certaines paires qui arrêtent pourtant la reprise.**

   Sources : [pause-retract.test.js:2136](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:2136), [SURETE.md:231](/C:/Users/damou/Documents/claude/cncjs-wt/F2/examples/cncjs-touch/design/refonte/SURETE.md:231).

   Exemple : `RS × act`, puis `stop`. Le premier événement laisse `returning` ; le second arrête la reprise. Pourtant, `[p1, before, after].includes('returning')` suffit à sauter entièrement l’assertion interdisant descente, redémarrage et reprise du fichier.

   **Vérifié en mémoire sur le bloc d’assertion exact :** avec `after=null` et des sorties injectées `!`, `M3 S1000`, `$J=…Z-5`, `~`, P1 passe sans même consulter les sorties. Cela établit une lacune du test, pas ces envois dans l’implémentation actuelle.

   **Correction :** contrôler séparément les sorties après le deuxième événement ; l’exception doit concerner une reprise encore autorisée après celui-ci. Ajouter ce contrôle après `stop` et `pcStop`, puis ajuster la garantie documentaire.

Pour les constats antérieurs, les numéros ci-dessous reprennent ceux du premier rapport et incluent leurs variantes des tours suivants. **« Fermé » désigne la fenêtre signalée et sa preuve logicielle.**

| Constat | Classement et confrontation code/tests |
|---|---|
| **1 — arrêt et surveillance du jog** | **remarque — anciennes fenêtres fermées.** [drop():381](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:381) conserve la surveillance après l’arrêt PC ; `2-D1` traverse façade, contrôleur et arrêt du workflow. `3-D1/3-D2` vérifient transfert à Arrêter et refus pendant la surveillance résiduelle. `4-D1/4-D1b` reproduisent réellement le jog de 0,1 mm après Arrêter. Réserves restantes : points 1 et 2 ci-dessus. |
| **1, variante D1b — arrêt inutile après repos tardif** | **remarque — fermé.** [track():1428](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:1428) suit la fin indépendamment du délai ; [2-D1b:1131](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1131) attend réellement plus de cinq secondes, puis vérifie l’absence de reset inutile. |
| **2 — départ relatif modifié pendant l’attente** | **remarque — fermé.** [before():685](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:685) recontrôle départ et course avant l’écriture. [D2:889](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:889) change effectivement Z pendant l’absence du flux et interdit tout `$J=`. |
| **3 — arrêt broche, FS absent, sens `$G`, reprise depuis `held`** | **remarque — fenêtres précédemment signalées fermées.** [spindleRunning():611](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:611), `track`, `modal` et `setpointLost` conservent les pertes couvertes par D3, 2-D3a–e et [3-D3:1437](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1437). Réserves nouvelles : point 3. |
| **Troisième tour — consigne S et correction Ov** | **remarque — fermé pour les scénarios signalés.** [modal():1511](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:1511) mémorise la perte ; [3-D4:1513](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1513) et ses variantes changent réellement S/Ov pendant l’attente et la descente. |
| **Quatrième tour — `A:C` avant ou pendant la plongée** | **remarque — fenêtre exacte fermée.** [report():1462](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:1462) traite le champ courant transmis par le service. [4-D2:1650](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1650) joue bien vitesse positive, ancien `$G M3`, puis `A:C`, sans nouveau `$G`. Les variantes couvrent approche et temporisation ; 4-D2e constitue un témoin positif `A:S` allant jusqu’à `~`. |
| **4 — WCO modifié adopté comme référence** | **remarque — fermé.** Référence prise [avant la demande:1059](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:1059), comparaisons ensuite. D4 et 2-D4 jouent le changement tardif, entre les deux `Idle` et pendant `Run`. |
| **WCO reçu seulement au début du dernier Jog** | **remarque — correction et test pertinents.** [La borne:778](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:778) exclut ce rapport ; [3-D4d:1596](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1596) exige effectivement un WCO au repos avant `~`. |
| **5 — Alarm/Restart, permanence après nouvelle origine** | **remarque — fermé.** [fail():431](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:431) exclut le retour vers `held`. [2-D5:1167](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1167) injecte l’événement avant première écriture, puis Home et les mêmes valeurs : refus maintenu. |
| **6 — annulations Socket suivies d’une descente** | **remarque — fermé pour les entrées recensées.** [Les tests Socket:204](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-socket.test.js:204) traversent réellement façade et contrôleur ; les listes de commandes sûres sont également parcourues. |
| **7 — reprise finale sans flux** | **remarque — fermé.** [R6:1285](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:1285) attend le bon flux et refait les contrôles. [D7/D7b:990](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:990) ferment réellement ce flux depuis `parked` et `held`. |
| **8 — XYZ anciens et faux refus intercalaire** | **remarque — fermé.** [settled():567](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:567) attend les coordonnées explicites. D8/D8b utilisent le vrai parseur ; [2-D8:1379](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1379) vérifie la poursuite au rapport suivant. |
| **9 — preuves initialement défectueuses** | **remarque — réparées.** [D9:1087](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1087) conserve seulement les flux B ; 2-D9 couvre les phases Socket manquantes ; [le test de page:153](/C:/Users/damou/Documents/claude/cncjs-wt/F2/examples/cncjs-touch/test-pause-retract.cjs:153) perd réellement le flux et vérifie les POST. |
| **10 — trajectoire LUNYEE** | **remarque — preuve simulée complétée.** [Le parcours:191](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-lunyee.test.js:191) compare machine/interpréteur à `~`, premier bloc repris et tous les blocs ; les trois injections rendent le témoin discriminant. |
| **Quatrième tour — portée de la table** | **à corriger — amélioration réelle, mais incomplète.** Les 240 cases et 1 950 paires existent ; les états d’arrêt, `dir` et le pas de 0,1 mm répondent au précédent avis. P1 conserve toutefois la lacune du point 4. |

**Remarque — limites et vérifications.** Aucun autre faux refus nouveau certain n’a été établi. Le reset après cinq secondes malgré `Jog` reste une politique d’escalade documentée et testée, pas une fenêtre supprimée. Le test de page a été exécuté avec succès, écritures disque bloquées. Les suites Jest complètes n’ont pas été relancées, leurs fixtures écrivant des fichiers temporaires ; leurs résultats annoncés ne sont donc pas repris comme vérification personnelle. Arbre Git propre.

VERDICT : à ne pas installer — danger restant : commandes PC admises pendant un arrêt F2 non confirmé lorsque la carte rapporte Door.
