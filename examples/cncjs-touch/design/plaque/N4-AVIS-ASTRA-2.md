# N4 — contre-avis de sûreté n° 2 (Astra, lecture seule, 2026-11-26)

La révision 3 répond largement au premier avis, mais **elle n’est pas encore assez complète pour autoriser la phase B**. Relecture de `feat/N4`, commit `ea033db1`, en lecture seule : aucun fichier modifié, aucune machine contactée. J’ai reproduit le cas `FS:` tronqué avec le vrai parseur, exclusivement en mémoire.

1. **danger — Le constat sur le cadrage existant minimise un risque encore ouvert.**  
   [CONSTAT-RAPPORTS-SANS-POSITION.md:11](examples/cncjs-touch/design/plaque/CONSTAT-RAPPORTS-SANS-POSITION.md:11), également `:110-117` ; `motion.js:368`, `:1069-1104`.

   « Un rapport abîmé isolé […] pas un mouvement à tort » n’est pas établi. Contre-séquence possible à la lecture : après `M5`, premier rapport `Idle` explicite avec Z haut ; déplacement extérieur abaissant Z sans rapport intermédiaire reçu ; deuxième rapport `Idle` privé de coordonnées. `settle` compte deux rapports, puis les contrôles acceptent le Z conservé et peuvent autoriser X. **Cette contre-séquence n’a pas été reproduite sur la carte.** Elle suffit néanmoins à invalider l’assurance donnée. D2 ne la ferme pas : un déplacement sans changement de décalage ne retire pas sa preuve (`work-offset.js:348-355`).

   La gravité « moyenne » de la broche est également injustifiée lorsqu’une pince de sonde pourrait être entraînée. La conséquence potentielle est grave ; la fréquence et le comportement réel à `M3 S0` restent inconnus.

   **Correction proposée :** séparer conséquence potentielle, occurrence non observée et preuve terrain. Soixante rapports corrects caractérisent un échantillon, pas l’absence future du défaut. Vérifier aussi la version effectivement installée : le document reconnaît ne pas l’avoir lue (`:3`, `:136`).

   **Avant le prochain usinage : oui, une action est nécessaire.** Je recommande de corriger et tester ces gardes avant de réutiliser le cadrage concerné comme contrôle sur une pièce bridée. À défaut, suspendre cet usage automatique et traiter explicitement les palpages exposés. Cela ne démontre pas, à lui seul, que tout envoi d’un programme d’usinage est défectueux. Maintenir R8/R9 propres à N4 peut préserver le périmètre du lot ; cela ne règle pas l’existant.

2. **à corriger — R9 peut encore prendre une vitesse absente pour zéro.**  
   [N4-CONCEPTION.md:240](examples/cncjs-touch/design/plaque/N4-CONCEPTION.md:240), `:259-261` ; [GrblLineParserResultStatus.js:121](src/server/controllers/Grbl/GrblLineParserResultStatus.js:121).

   Le parseur donne effectivement :

   ```text
   <Idle|MPos:1,2,3|FS:0>   → spindle: 0
   <Idle|MPos:1,2,3|FS:0,>  → spindle: 0
   ```

   La deuxième composante manque ; `payload.spindle` reçoit pourtant zéro par défaut. « Présence de `FS:` + valeur parsée égale à zéro » ne prouve donc pas une vitesse explicitement rapportée.

   **Correction proposée :** valider le champ brut complet, avec ses deux composantes numériques finies, puis conserver son numéro de rapport. Aucun défaut de lecture ne doit devenir zéro. Tester `FS:` absent, tronqué et invalide à la préparation, pendant X et entre X/Y. Les contradictions `M3/M4`, même à `S0`, et leur mémorisation par S4 restent de bonnes protections.

3. **à corriger — Les données de R8 ne suffisent pas à prouver les deux rapports exigés.**  
   [N4-CONCEPTION.md:239](examples/cncjs-touch/design/plaque/N4-CONCEPTION.md:239), `:224`, `:250` ; `motion.js:368`.

   `{report, at, count}` compte les rapports positionnels, sans conserver leur état ni leurs positions successives. Cela ne prouve ni **deux rapports positionnels `Idle` après l’`ok`**, ni les deux positions concordantes nécessaires à l’enregistrement. Un rapport `Jog`, puis un seul `Idle`, reçus avant le même pas de surveillance peuvent tromper un comptage fondé uniquement sur ces données et l’état final.

   **Correction proposée :** définir une collecte événementielle minimale conservant numéro, état et XYZ des rapports utiles, ainsi que la borne après l’`ok`. Ajouter un test où `Jog` puis un unique `Idle` arrivent avant le même pas : aucune ligne suivante ; un deuxième véritable `Idle` la libère. Même exigence pour la concordance à l’enregistrement.

4. **à corriger — La réponse au constat 5 contient encore des contre-épreuves non discriminantes.**  
   [N4-CONCEPTION.md:429](examples/cncjs-touch/design/plaque/N4-CONCEPTION.md:429).

   | Mutation | Pourquoi le résultat annoncé ne prouve pas le garde | Correction |
   |---|---|---|
   | **M3**, `:435` | Mettre `cnc=false` change aussi le validateur ; les lignes relatives sont refusées avant de tester la boucle laser (`motion.js:1124-1128`). | Muter uniquement le dispatch `:1273-1275`, après validation. |
   | **M7**, `:439` | Une chute importante pendant `M5` est déjà refusée par `arrivalOff`, dont la cible contient Z. | Reprendre le cas isolant déjà documenté dans `F1-CORRECTIONS.md:155` : −5,005 → −5,054 ; arrivée tolérée, hauteur sûre refusée. |
   | **M10**, `:442` | Le test 19 injecte `load/unload` ; `r.file` arrête indépendamment la séquence (`job-service.js:594-602`). | Tester séparément le changement de révision sans événement `r.file`. |
   | **M16**, `:448` | Dans 22c, P3 interdit déjà la suite et P2 arrête ; retirer P4 ne change aucun octet. | Isoler son rôle ou reconnaître explicitement la redondance. |
   | **M18/S2**, `:450` | Le `M3` du test 23a déclenche également S4. | Tester une position fraîche sans `FS:`, avec `M5` et sans marque S4. |

   Pour M8, partir nettement au-dessus de la hauteur sûre afin que seul le plancher Z distingue le mutant. Pour S4, conserver le bon scénario 23d : `M3`, puis `M5`, entre deux pas.

   Les tests proposés sont utiles, mais **aucune preuve rouge/verte N4 n’existe encore**. La règle de phase B imposant de traiter chaque mutant survivant est bonne ; les assertions annoncées doivent déjà être corrigées dans la conception.

5. **à corriger — L’arrêt au réveil n’est pas garanti, et la restriction au kiosque n’est pas exprimée.**  
   [N4-CONCEPTION.md:310](examples/cncjs-touch/design/plaque/N4-CONCEPTION.md:310), `:375`, `:517`, `:549`.

   Les rapports sont datés **à réception** (`job-service.js:394`). Au réveil, des rapports tamponnés peuvent être traités avant le superviseur et paraître frais. Si le délai de ligne n’est pas dépassé, la séquence peut continuer : « au réveil […] arrête » est trop affirmatif.

   Par ailleurs, « Je suis devant la machine » ne signifie pas « depuis le kiosque local ». Aucun G1–G14 n’impose cette origine.

   **Correction proposée :** retirer la garantie au réveil ; faire de l’absence de suspension automatique une condition préalable à l’essai. Écrire explicitement **« essai depuis le kiosque de la Surface uniquement »** dans le protocole et la consigne visible. Une restriction garantie par logiciel demanderait un garde serveur supplémentaire.

6. **à corriger — Les bornes temporelles sont présentées trop strictement.**  
   [N4-CONCEPTION.md:468](examples/cncjs-touch/design/plaque/N4-CONCEPTION.md:468), `:534` ; `touch-stream.js:61-64`, `:134`.

   Les 80 secondes déclenchent une fermeture lors d’un envoi ultérieur ; s’ajoutent cadence de publication, grâce et surveillance. **83 secondes n’est pas une borne exacte**, et le volume transmis peut provoquer une rotation plus tôt. P12 ne peut donc exiger simultanément « au plus tard 83 s » et « pas avant ».

   De même, les 60 secondes d’un déplacement sont calculées par distance/vitesse, sans les rampes (`job-service.js:2080`, `:2106`).

   **Correction proposée :** tester les déphasages des temporisateurs et les seuils d’octets ; parler de durée nominale pour les déplacements. Sans serveur, la garantie restante est une seule ligne de distance bornée, pas une annulation à échéance.

7. **remarque — Les commandes, leur ordre et R1–R7 sont cohérents.**  
   [N4-CONCEPTION.md:103](examples/cncjs-touch/design/plaque/N4-CONCEPTION.md:103), `:169-175` ; `motion.js:201-313`.

   L’exemple est juste :

   ```text
   M5
   $J=G91 G21 Z55 F300
   $J=G91 G21 X-184 F600
   $J=G91 G21 Y200 F600
   ```

   Les **cibles sont machine**, les commandes **relatives**. Z positif seul, puis X seul, puis Y seul ; aucune descente commandée, aucun changement du zéro pièce. Les bornes X `[0 ; 407,5]`, Y `[0 ; 395,5]`, la hauteur Z `−5`, les vitesses plafonnées et l’omission des déplacements insignifiants correspondent au modèle repris.

   L’écart explicite avec `G53 G0` est raisonnable au regard des faits E1–E7 : convention de coordonnées observée, absence de `$HX`, prudence après alarme/reset, D2 conservé, marge de course, canal Wi-Fi extérieur reconnu, `$39` inchangé.

   `kind:'cnc'` reprend bien la supervision ; R2 est nécessaire aux deux sites et R3 doit rester propre à `park`. Arrêter demeure accessible sans la main ; perte de main et fermeture détectée du flux arrêtent la séquence. Alarme observée : référence invalidée, aucune ligne suivante. Bannière observée : fin sans octet automatique supplémentaire de cette séquence. La non-régression F1 reste à démontrer après réalisation.

8. **remarque — Les autres réponses au premier avis sont substantiellement satisfaisantes.**  
   [N4-CONCEPTION.md:270](examples/cncjs-touch/design/plaque/N4-CONCEPTION.md:270), `:282`, `:375-377`, `:476-488` ; `IDEES.md:30`.

   Les pertes physiques invisibles sont désormais dites correctement ; D2 n’est plus présenté comme une mesure physique. La portée limitée de la signature et le réenregistrement après modification sont explicites. La pince, la plaque et le fil figurent dans la confirmation. Les parcours du harnais sont réellement prévus ; les citations de `check-screen.js:139/143/151` et `job-controls.js:229` sont justes.

   Le coût opérateur évite l’erreur d’I-27 : enregistrement ponctuel, trois touchers pour partir, aucune obligation nouvelle de refaire XYZ à chaque connexion. La coupure d’alimentation avant de toucher la pince et le zéro Z après changement réel restent indispensables.

   L’essai progressif — table vide, pince sans fraise, alimentation de broche coupée, puis fraise en l’air — est approprié **après correction des points ci-dessus et validation du code**. Les essais destructifs d’alarme/reset restent correctement réservés au banc.

VERDICT : à revoir

