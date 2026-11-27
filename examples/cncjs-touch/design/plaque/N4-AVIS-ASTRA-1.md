# N4 — contre-avis de sûreté n° 1 (Astra, lecture seule, 2026-11-26)

La révision 2 doit être corrigée avant la phase B. Revue de `feat/N4`, commit `e2cf8009`, en lecture seule ; aucun fichier modifié, aucune machine contactée. Deux contre-épreuves ont été réalisées en mémoire avec le vrai parseur. Elles vérifient l’infrastructure existante, pas N4, encore absent.

**danger**

1. **Des coordonnées anciennes peuvent autoriser le déplacement latéral.**  
   [N4-CONCEPTION.md:156](examples/cncjs-touch/design/plaque/N4-CONCEPTION.md:156), également lignes 204 et 328 ; `GrblRunner.js:110`, `job-service.js:393`, `motion.js:347`, `:368`, `:1016`.

   Un rapport sans coordonnées conserve les anciennes MPos/WPos, mais actualise `seen` et incrémente `reports`. `settle` peut donc compter deux rapports sans position ; `arrivalOff` compare ensuite les coordonnées conservées. **La disparition de position promise comme bloquante ne l’est pas.**

   Reproduction avec le vrai service, contrôleur factice et D2 simulé prouvé : après dix secondes, `<Idle|FS:0,0>` conserve les anciennes coordonnées et laisse `motion.canJog=true`. Un ancien Z haut peut ainsi faire omettre la montée alors que la hauteur réelle n’est plus établie.

   **Correction :** exiger une position XYZ explicite et fraîche pour enregistrer, préparer et exécuter ; confirmer chaque arrivée par des rapports positionnels postérieurs à la ligne. Tester avec `runner.parse`, sans effacer artificiellement `status.wpos`. **Cette protection manque à R1–R7.**

2. **Une ancienne vitesse nulle masque un nouveau `M3`.**  
   [job-service.js:920](src/server/services/touch/job-service.js:920), `:1474` ; `motion.js:1005` ; `N4-CONCEPTION.md:204`.

   Reproduction réelle du parseur : un premier rapport contient `FS:0,0`, les suivants omettent FS, puis `$G` rapporte `M3 S1000`. Résultat : `status.spindle` reste à zéro, tandis que l’état modal indique bien `M3`. `spindleStill` ignore ce dernier puisque la vitesse conservée n’est pas `null`. L’adaptateur ligne 1474 ne corrige pas ce cas. D2 reste prouvé si le repère ne change pas.

   **Correction :** suivre la fraîcheur des informations de broche et traiter une information récente contradictoire comme bloquante. Ajouter ce scénario au vrai parseur, pendant X et avant Y. La coupure physique prévue avant de toucher la pince reste nécessaire ; elle ne remplace pas ce garde pendant le trajet.

**à corriger**

3. **L’essai de perte de tablette confond client et serveur.**  
   [N4-CONCEPTION.md:370](examples/cncjs-touch/design/plaque/N4-CONCEPTION.md:370), lignes 378 et 393 ; `PROMPT-REFONTE-UI.md:22` ; `refonte/PROTOCOLE-ESSAI.md:63`.

   Le dossier situe CNCjs **sur la Surface**, avec un kiosque local. Couper son Wi-Fi ne coupe pas nécessairement le flux local ; cela coupe en revanche l’observation depuis le PC. Une véritable suspension de la Surface suspend aussi le serveur : ni sa surveillance ni un futur signal de présence ne peuvent alors envoyer `0x85`. La borne annoncée de 83 secondes ne couvre pas cette situation.

   **Correction :** distinguer fermeture du navigateur, disparition d’un client distant, extinction de l’écran et suspension de l’hôte. Tester la perte réseau depuis un client distinct, serveur maintenu actif. Retirer la suspension système du protocole proposé tant qu’elle n’a pas son propre cadrage. Pour la perte silencieuse d’un client distant, fixer un critère précis : une mesure favorable ne garantit pas les suivantes. Un test probant doit maintenir `res.write()` à `true`, sans événement de fermeture.

4. **La perte physique de position reste insuffisamment explicitée.**  
   `N4-CONCEPTION.md:75`, `:133`, `:245` ; `SURETE.md:53`, `:256` ; `job-service.js:442`, `:496`, `:515`.

   « Toute perte de référence » est excessif : seules les pertes **observées** invalident `homed`. Des pas perdus restent invisibles. Une bannière et un passage en alarme manqués, suivis d’un déverrouillage par le Wi-Fi de la carte, peuvent également laisser une référence logicielle trompeuse. Comparer l’arrivée après un trajet ne prévient pas une collision survenue pendant celui-ci.

   **Correction :** reprendre explicitement cette limite dans N4 ; demander une prise d’origine dès qu’un incident rend la référence douteuse. Ne pas prétendre que D2 mesure la position physique, ni réintroduire l’obligation de refaire XYZ à chaque usage rejetée dans I-27.

5. **La contre-épreuve annoncée pour les tests 18 n’est pas valide telle quelle.**  
   [N4-CONCEPTION.md:319](examples/cncjs-touch/design/plaque/N4-CONCEPTION.md:319) ; `motion.js:1124`, `:1127`, `:1273`.

   Forcer seulement `session.kind='park'` ne désactive ni le validateur CNC ni `cncStep` : ils dépendent de la constante locale `cnc`, calculée depuis **`plan.kind`**. Un échec de 18f pourrait provenir uniquement du résultat publié.

   **Correction :** pratiquer des mutations distinctes du validateur, du dispatch et de chaque garde. Vérifier les écritures et l’absence de Y après incident, pas seulement le code final. Les tests 17 sont correctement qualifiés de témoins ; les nouveaux tests N4 ne constituent encore aucune preuve rouge/verte.

6. **Le harnais cité ne vérifiera pas spontanément le nouveau volet.**  
   `N4-CONCEPTION.md:347`, `:397` ; `browser-run.cjs:2234`, `:2449`.

   Le parcours `--only screens` existant n’ouvre pas le futur volet N4 ; sa modification n’est pas prévue au §11. Il peut rester vert sans vérifier la consigne d’alimentation ni l’accès aux arrêts.

   **Correction :** ajouter explicitement les parcours N4 au harnais : confirmations, mouvement, arrivée, interruption, perte du suivi ; vérifier visibilité sans défilement et possibilité réelle de toucher Pause/Arrêter, aux deux résolutions et tailles de texte.

7. **La confirmation oublie la sonde et son fil.**  
   `N4-CONCEPTION.md:291` ; `P4-CONCEPTION.md:22`.

   Ce mouvement peut suivre un palpage sur le même écran. « Rien de haut » ne couvre pas une pince encore attachée à l’outil ou un fil entraîné pendant Z puis XY.

   **Correction :** compléter la case existante par « pince de sonde retirée, plaque et fil hors du trajet », sans toucher supplémentaire.

8. **La signature ne garantit pas l’identité physique ni toute péremption.**  
   `N4-CONCEPTION.md:187`, `:214`, `:235` ; `machine-profile.js:22`, `:98`, `:114`.

   Elle contient une famille firmware et certains réglages mécaniques, pas une identité unique de carte. Deux machines identiques partagent la signature ; une autre version du même firmware peut aussi la conserver. « Réglages relus différents ⇒ G8 » est donc trop général.

   **Correction :** préciser les changements effectivement détectés, borner la réutilisation à cette installation et demander un réenregistrement après modification mécanique ou firmware. Si l’identification automatique est exigée, compléter l’empreinte propre à N4.

**remarque**

9. **Les commandes proposées sont cohérentes avec les faits documentés.**  
   [N4-CONCEPTION.md:88](examples/cncjs-touch/design/plaque/N4-CONCEPTION.md:88) ; `motion.js:201`, `:285`, `:303`.

   L’ordre `M5`, puis `$J=G91 G21 Z<positif> F<fz>`, X seul, Y seul est correct. L’exemple `Z55`, `X-184`, `Y200` est juste. Les cibles sont machine, les commandes **relatives** ; aucune ligne ne commande une descente. Les bornes utilisables `[0;407,5]`, `[0;395,5]` et la hauteur Z `−5` correspondent au modèle existant. Les limites de vitesse et de durée sont appropriées.

   L’écart assumé avec `G53 G0` est raisonnable : E1/E5 sont pris en compte, E3 motive l’évitement du reset, E4 explique D2 ; aucun `$HX` ni `$39` nouveau — E2/E7. E6 demeure un canal extérieur au contrôle CNCjs. Les estimations « 41 s maximum » doivent toutefois rester liées aux vitesses nominales : G13 autorise jusqu’à 60 s par ligne.

10. **Les raccordements principaux R1–R7 et les arrêts observables sont correctement identifiés.**  
    `N4-CONCEPTION.md:162` ; `motion.js:978`, `:1024`, `:1108`, `:1553` ; `job-service.js:496`, `:515`, `:594`.

    Garder la session interne `kind:'cnc'` reprend les exclusions, la perte de main, les fermetures de flux détectées et les annulations de F1. R2 est nécessaire aux deux endroits indiqués. Alarme observée : référence invalidée et aucune ligne suivante ; bannière observée : fin immédiate sans octet automatique supplémentaire de la séquence. Arrêter reste accessible sans la main. Les événements de chargement/retrait de fichier restent surveillés.

    **À conserver :** R3 limité à `park`, validateur F1 inchangé, aucune modification générale de `cancel`/`forget`. Les deux dangers ci-dessus nécessitent des corrections supplémentaires dont l’effet sur F1 devra être explicitement testé.

11. **Le coût opérateur évite l’erreur principale d’I-27.**  
    `N4-CONCEPTION.md:33`, `:185`, `:293`, `:387` ; `IDEES.md:30`.

    Enregistrement ponctuel, trois touchers pour partir, attente D2 et zéro Z après changement réel : aucune obligation nouvelle de refaire XYZ après chaque reconnexion. Le refus pendant usinage ou pause M6 est clair. La consigne de couper l’alimentation avant la pince est pertinente ; le rappel de refaire Z reste volontairement sans verrou de départ. Les citations de `check-screen.js:139/143/151` et `job-controls.js:229` sont justes.

VERDICT : à revoir
