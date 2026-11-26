# C1 — contre-avis de sûreté n° 3 (Astra, lecture seule, 2026-11-26)

**Il reste une correction ciblée avant le code : la règle de validation du second repère est insuffisante avec le vrai parseur.** Les autres réponses du §9 permettent de passer à la réalisation, avec les vérifications ci-dessous. Je ne demande pas de résultats du futur code pour approuver sa conception.

Relecture de `feat/C1`, HEAD `eff3413d`, sans modification de fichier ni contact machine. Les rejeux mentionnés concernent le parseur et le service existants, entièrement en mémoire.

1. **danger — Le repère présenté comme « calculé » peut provenir d’un champ parasite.**  
   [C1-CONCEPTION.md:32](examples/cncjs-touch/design/plaque/C1-CONCEPTION.md:32) ; `GrblLineParserResultStatus.js:28` ; `GrblRunner.js:79` ; `plate-probe.js:197`, `:397`.

   La réponse **4 du §9 reste incomplète**. Le vrai Runner accepte :

   ```text
   <Idle|MPos:1,2,-20|junk:WPos:1,2,-40|FS:0,0>
   ```

   Il émet MPos `(1,2,-20)` **et** WPos `(1,2,-40)`. Le MPos concorde avec le champ brut validé : la condition écrite passe. Pourtant, le Runner n’a calculé aucun repère secondaire : ses conversions ne s’exécutent que lorsqu’un seul des deux repères existe.

   Rejeu supplémentaire avec **la vraie D2**, initialement prouvée avec WCO nul : deux rapports identiques laissent D2 prouvée. `work-offset.js:348` ne reçoit aucun WCO différent. Pour la plaque, la course serait contrôlée depuis MPos correct, mais une recherche de 10 mm calculée depuis ce WPos donnerait `G38.2 Z-50`, soit **30 mm depuis Z machine −20**. L’égalité avant écriture ne rattrape pas cette incohérence.

   **À corriger avant le code :** imposer que le second repère soit effectivement dérivé du repère brut validé et du WCO retenu, ou refuser le rapport lorsque sa provenance ne peut être établie. La seule concordance du repère principal ne suffit pas. Étendre T8 à `junk:WPos:` et au cas symétrique, avec D2 réellement prouvée. C’est une correction locale, sans refonte.

2. **remarque — Le lieu de collecte et les protections principales sont correctement choisis.**  
   `C1-CONCEPTION.md:28`, `:43`, `:54`, `:139-143` ; `GrblRunner.js:124`, `:168` ; `GrblLineParser.js:77`.

   Rejoué : `raw` accompagne bien les événements `status` et `parserstate` complet. La charge d’un rapport sans coordonnées ne récupère pas les anciennes positions, contrairement à l’état fusionné.

   La remise à zéro de `still` et l’exigence du dernier rapport positionnel ferment bien **Idle Z haut explicite → descente extérieure invisible → Idle sans coordonnées**. FS complet exigé, vitesse explicitement nulle et mode unique M5 ferment les cas FS absent, vitesse absente prise pour zéro et M3 S0, **dans le périmètre gardé**. La réponse **1 du §9** ajoute correctement l’âge du GC au moment de l’écriture.

   **À conserver :** ces lectures strictes séparées des lecteurs historiques ; aucun repli vers l’état fusionné pour satisfaire une preuve manquante.

3. **remarque — Inventaire complet trouvé ; exceptions `A:` et `$H` acceptables pour ce lot.**  
   `C1-CONCEPTION.md:158-174`, `:284-287` ; `job-service.js:1176`, `:2458`, `:2561`, `:1300` ; `GrblRunner.js:103`.

   Je n’ai trouvé aucune autre voie d’axe Touch oubliée. Les macros repassent leur garde à l’exécution ; le programme repasse `readyFor('start')` après l’attente de lecture du fichier. L’aperçu ne commande rien.

   Les réponses **5 et 6 du §9** sont acceptables pour autoriser cette correction ciblée :
   - retirer `A:` du refus initial évite de transformer un ancien état accessoire en verrou ; une contradiction portée par `A:` seul reste néanmoins ignorée au départ ;
   - conserver la garde actuelle de `$H` évite l’impasse confirmée en alarme, où le kiosque n’envoie pas M5 et ne propose pas nécessairement de reset.

   **À conserver dans la présentation :** C1 ne ferme donc pas les deux dangers pour *tous* les mouvements sans exception : petits pas, homing, reprise simple et trajectoires des programmes/macros restent limités comme indiqué au §5. Ne pas annoncer une protection universelle.

4. **à vérifier au code — Refaire toutes les preuves après les attentes.**  
   `C1-CONCEPTION.md:24`, `:110`, `:127`, `:130`, `:182` ; `motion.js:1195`, `:1229`, `:1238` ; `plate-probe.js:399-421`.

   Les réponses **2 et 3 du §9** corrigent bien les fenêtres de calcul de la plaque et l’apprentissage de `homeMpos`.

   **Exigences :**
   - comparer avant écriture les positions machine **et travail** pertinentes, ainsi que le repère, avec celles utilisées pour calculer la cible ; couvrir aussi un changement de décalage dans le même G54 ;
   - ne pas laisser `session.verified` dispenser d’un nouveau repos prouvé après une attente de flux ou de GC : tester arrivée validée, puis Jog, puis un seul Idle à la cible ;
   - pour `homeMpos`, ajouter la présence positionnelle stricte sans supprimer les conditions existantes sur le cycle complet, `$23` et la conversion WPos/WCO.

5. **à vérifier au code — « Arrêter la broche » pendant la plaque ne doit pas devenir un simple arrêt logiciel silencieux.**  
   `C1-CONCEPTION.md:173`, `:236` ; `plate-probe.js:375-378`, `:487-504` ; `halt.js:50` ; `job-service.js:920-940`.

   La réponse **10 du §9** évite correctement l’injection d’un M5 dont l’`ok` polluerait le suivi du palpage. Mais **brancher seulement le bouton sur `plateStop` serait insuffisant**.

   Entre deux lignes, `outstanding` peut être faux, la machine Idle et les files vides. Avec FS=0 et GC=M3, l’ancien `spindleOn` retourne faux : `haltPlan` peut ne demander aucun arrêt matériel. Un clic après une annulation automatique peut également rencontrer le retour immédiat de `plateStop`.

   **Exigence :** tester ces fenêtres et choisir explicitement, dans le chemin appelant, l’arrêt matériel approprié lorsque nécessaire, sans M5 dans un suivi actif ni `0x85` pendant G38. Ne jamais annoncer « broche arrêtée » ou « M5 envoyé » sur la seule annulation de la séquence. Cela peut être réalisé sans changer l’architecture de `halt.js`.

6. **à vérifier au code — Le risque nouveau en pause M6 est acceptable, avec une sortie opérateur explicite.**  
   `C1-CONCEPTION.md:69-71`, `:140-141`, `:230` ; `GrblController.js:917-942` ; `plate-probe.js:451-458` ; `job-service.js:1071`.

   Les réponses **7 et 9 du §9** correspondent au code : la récupération d’un `$G` perdu exige workflow idle et Runner Idle. Pendant M6, cette perte peut empêcher les interrogations suivantes ; l’échec plaque marque `probeFailed` et interdit la reprise.

   **Exigence :** aucun délai modal de 2,5 s pendant la descente G38. L’abandon pour GC manquant intervient entre les lignes. Tester séparément un G38 long réussi et une réponse réellement perdue, puis l’arrêt et la sortie du programme sans reprise automatique. C’est une perte de disponibilité assumée, pas une raison supplémentaire de refuser la conception.

7. **à vérifier au code — Préserver D2, les réservations et les arrêts accessibles depuis le kiosque.**  
   `C1-CONCEPTION.md:274` ; `work-offset.js:348-355` ; `plate-probe.js:458` ; `job-service.js:1747`, `:1773`, `:2591`.

   La limitation de « D2 intact » au cadrage est correcte. Les invalidations après échec plaque, G10 écrit ou possiblement écrit, reset et WCO explicitement différent doivent rester.

   **Exigence :** attentes annulables, aucune ligne après résolution tardive, aucune garde C1 sur un arrêt. Tester aussi l’interface : actuellement, `canPause` n’inclut pas la plaque et `canSpindleStop` peut être faux pendant son G38 en pause M6. Un test API seul ne prouve pas que les boutons restent utilisables.

8. **remarque — Délais désormais honnêtes ; conserver les réserves du §1.2.**  
   `C1-CONCEPTION.md:62-71`, `:197`, `:280`.

   Les 2,5 s sont bien présentées comme des seuils logiciels, les cadences comme nominales, les bornes propres aux lignes et le surcoût comme non mesuré. La suspension de la Surface reste explicitement hors garantie.

   **Correction documentaire lors de la réalisation :** faire renvoyer la ligne 197 à la condition idle/Idle du §1.2 ; elle résume encore trop largement la récupération à dix secondes. Mesurer les attentes et arrêter l’essai sur un refus inexpliqué, comme prévu.

9. **à vérifier au code — Banc réel et mutations : exigences maintenant pertinentes.**  
   `C1-CONCEPTION.md:205`, `:229`, `:257-258`, `:272` ; `plate-probe.js:220`, `:277` ; `support/sim-bridge.js:96`.

   La réponse **8 du §9** améliore réellement la discrimination : T13c compare une cible effectivement écrite à un abandon prématuré ; M22 reconnaît sa possible redondance.

   **Exigence :** laisser réellement tourner superviseur et microtâches entre les injections, sinon T13c peut masquer la mutation. Utiliser des GC complets avec leurs `ok` distincts, y compris un échange déjà en vol. Exiger les bons refus et les octets attendus ; une exception ou une autre garde ne tue pas utilement le mutant. Ajouter le contre-exemple du constat 1.

10. **à vérifier au code — Conversion des anciens tests acceptable, avec le contrôle prévu.**  
    `C1-CONCEPTION.md:273` ; `cnc-frame.test.js:405`.

    La réponse **11 du §9** est correcte : « dix-sept fichiers » n’est pas un périmètre établi. La recherche actuelle trouve **24 fichiers** émettant `status` sans argument, sans imposer leur conversion intégrale.

    **Exigence :** commit séparé de conversion, passage sur l’ancien code, comparaison des octets et chronologies, entrée brute conservée pour les omissions, aucun ajout silencieux de FS/M5/Idle/temps. Justifier chaque modification d’entrée ou d’assertion. Les nouveaux tests négatifs doivent échouer sur l’ancien code pour le défaut visé.

VERDICT : à revoir