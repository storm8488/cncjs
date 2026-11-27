# C1 — contre-avis de sûreté n° 6, relecture des corrections du code (Astra, lecture seule, 2026-11-27)

Relecture limitée de `56b66bbd..108fb680`, branche `feat/C1`. **Aucune régression de sûreté identifiée dans les corrections examinées.** Aucun fichier modifié, aucun contact machine.

Vérification : **368 tests réussis dans sept suites**, deux contre-scénarios supplémentaires exécutés uniquement en mémoire et deux bancs d’interface réussis. La suite du simulateur LUNYEE n’a pas pu être exécutée : ses créations de fichiers temporaires ont été bloquées par la garde de lecture seule.

1. **Danger (bloque l’installation) — aucun restant identifié. Ancien danger n° 1 fermé.**  
   [block-probe.js:623](../../../../src/server/services/touch/block-probe.js:623) impose le reset entre deux lignes ; [block-probe.js:647](../../../../src/server/services/touch/block-probe.js:647) couvre le cycle déjà annulé, encore présent, sans arrêt matériel engagé. Lorsque le mouvement reste possible, le feed hold puis reset sont conservés. Aucun `M5` injecté ni `0x85` dans ces chemins ; aucune attente supplémentaire imposée à Pause/Arrêter. Le message annonce désormais une **réinitialisation demandée**. Les trois tests A1 et S29 passent. **Correction supplémentaire : aucune.**

2. **À corriger avant l’essai sur pièce — terminer la vérification tactile et du chargement des nouveaux fichiers.**  
   Le point 3 est **fermé dans le code** : bouton direct dans [zero-piece.js:68](../../../../examples/cncjs-touch/touch/zero-piece.js:68), affichage et permission à la ligne 106, sans verrou `busy` ni exigence de possession du pilotage. Les tests d’interface passent.  
   **Action restante :** sur la Surface, vérifier visibilité, toucher et absence de masquage de Pause/Arrêter, pendant la plaque au repos puis en pause M6. Vérifier aussi que la page charge effectivement les nouveaux fichiers : le cache inchangé est déclaré dans [C1-RAPPORT.md:214](../../../../examples/cncjs-touch/design/plaque/C1-RAPPORT.md:214). Cela n’interdit pas l’installation pour effectuer ces contrôles à vide.

3. **Remarque — point 2 fermé : Z machine inconnu refusé.**  
   [plate-probe.js:200](../../../../src/server/services/touch/plate-probe.js:200) refuse explicitement l’inconnue avant le contrôle de course ; `plateTravel` répète cette protection. Le rejeu avec vraie D2, WCO abîmé et témoin sain passe dans [c1-plate.test.js:462](../../../../src/server/services/touch/__tests__/c1-plate.test.js:462). **Correction supplémentaire : aucune.**

4. **Remarque — fermeture du port et arrêt pendant M6 corrigés.**  
   [plate-probe.js:412](../../../../src/server/services/touch/plate-probe.js:412) vérifie la connexion avant la continuation du minuteur ; celle-ci est protégée par `try/catch`. [job-service.js:2524](../../../../src/server/services/touch/job-service.js:2524) appelle `markStopped` avant le reset : ligne conservée, programme marqué arrêté et journal renseigné. Tests R1/R2 réussis. **Aucune nouvelle ouverture de sûreté trouvée.**

5. **Remarque — le nouveau délai du cadrage n’autorise aucune écriture sans preuve.**  
   [motion.js:1148](../../../../src/server/services/touch/motion.js:1148) date l’absence ; [motion.js:1334](../../../../src/server/services/touch/motion.js:1334) conserve le retour sans écriture tant qu’une preuve manque. Le flux doit ensuite être présent. Le bloc revérifie également preuves, position et connexion après l’attente.  
   Les deux contre-scénarios supplémentaires passent : **preuve durablement absente → abandon sans ligne suivante ; position déplacée → refus sans ligne suivante**. Proposition facultative : conserver ces deux tests dans le dépôt.

6. **Remarque — pas ≤ 1 mm : acceptables pour l’essai encadré.**  
   La règle de [motion.js:524](../../../../src/server/services/touch/motion.js:524) reste celle d’avant C1. Des rapports positionnels cohérents au repos restent nécessaires ; la course machine demeure invérifiable. **Pour cet écart : fraise en l’air, broche coupée, dégagement visible loin des butées.** Les pas répétés peuvent cumuler une distance importante : retrouver une position machine fiable et une course vérifiable avant l’essai sur pièce. Aucun durcissement préalable exigé pour l’installation encadrée.

VERDICT : à réaliser
