# C1 — contre-avis de sûreté n° 5, relecture du code (Astra, lecture seule, 2026-11-27)

**Un défaut bloque l’installation : « Arrêter la broche » pendant un palpage au bloc peut laisser `M3` actif sans envoyer d’arrêt matériel.**

Relecture de `d6851c6e..56b66bbd`, en lecture seule. **8 suites exécutées, 540/540 tests verts**, caches neutralisés en mémoire. Les deux contre-exemples ci-dessous ont été rejoués séparément. Aucun fichier modifié, aucun contact machine.

1. **Danger (bloque l’installation) — Arrêt broche incomplet au bloc.**  
   [block-probe.js:615](../../../../src/server/services/touch/block-probe.js:615), [block-probe.js:1194](../../../../src/server/services/touch/block-probe.js:1194), [job-service.js:2495](../../../../src/server/services/touch/job-service.js:2495).

   **Rejeu :** premier `G38.3` terminé, repos confirmé, attente du prochain `$G`, `FS:0,0`. Réception de `$G M3 S0`, puis « Arrêter la broche » depuis l’autre tablette. Réponse : « carte réinitialisée ». Pourtant, immédiatement et 200 ms après : **aucun reset, aucun feed hold, aucun `M5` ; le mode reste `M3`**. Seul le `G0` sans axes de nettoyage est envoyé.

   `haltPlan` ne reconnaît pas ici la broche commandée puisque la vitesse vaut zéro ; aucune ligne n’est encore en vol. Après une annulation déjà enregistrée, `abort` retourne également sans agir. Le défaut est préexistant, mais les nouvelles attentes C1 l’exposent directement.

   **Correction :** appliquer au bloc le traitement réalisé pour la plaque : arrêt broche ⇒ reset demandé même entre deux lignes, y compris après annulation sans arrêt matériel engagé ; conserver feed hold puis reset lorsqu’un mouvement reste possible. Aucun `M5` injecté dans le suivi du palpage, aucun `0x85`. Remplacer « carte réinitialisée » par « réinitialisation demandée ». Tester les deux fenêtres.

2. **À corriger avant l’essai sur pièce — Position machine inconnue acceptée par la plaque en `WPos`.**  
   [plate-probe.js:191](../../../../src/server/services/touch/plate-probe.js:191), [plate-probe.js:223](../../../../src/server/services/touch/plate-probe.js:223), [motion.js:263](../../../../src/server/services/touch/motion.js:263).

   **Rejeu avec la vraie D2 :** Z machine −20, course `[-80,0]`, WCO Z −12. Une recherche de 70 mm est normalement refusée `ETOUCH_PLATE_TRAVEL`. Après :
   ```
   <Idle|WPos:5.000,5.000,-8.000|FS:0,0|WCO:0,0>
   ```
   puis deux `Idle` positionnels sans WCO et un `$G M5`, D2 reste prouvée mais le cache strict WCO est effacé. La position machine devient inconnue. **Le départ est accepté : `G38.2 Z-78 F100`**, soit une cible machine −90 que Touch devait refuser.

   `zeroZProofs` exige seulement Z travail ; `plateTravel` confond ensuite « position inconnue » et « course non contrôlable ».

   **Correction :** refuser explicitement Z machine `null` avant le contrôle de course, avec ce test et son témoin sain. Ce défaut ne se manifeste pas avec les rapports `MPos` nominaux de la LUNYEE ; il peut attendre après un essai strictement limité à `$10=1`, le mode `$10=0` étant une limite déclarée de la conception.

3. **À corriger avant l’essai sur pièce — Accès direct à l’arrêt broche pendant la plaque.**  
   [zero-piece.js:108](../../../../examples/cncjs-touch/touch/zero-piece.js:108), [job-resume.js:164](../../../../examples/cncjs-touch/touch/job-resume.js:164).

   `canSpindleStop=true` est approprié, mais ne crée pas un bouton directement disponible dans l’écran du palpage lancé au repos : « Tester » est désactivé et le bouton principal d’arrêt broche apparaît seulement en pause programme. Un accès subsiste par l’assistant de mise en service.

   **Correction :** offrir ce bouton directement pendant le palpage, puis vérifier tactilement les parcours au repos et pendant `M6`. **Pause et Arrêter restent accessibles dans le code du kiosque**, sans condition de main ni verrou `busy` ; leur manipulation réelle reste à vérifier.

4. **Remarque — Le cœur C1 et les autres écarts sont acceptables.**  
   [report-proof.js:104](../../../../src/server/services/touch/report-proof.js:104), [motion.js:1125](../../../../src/server/services/touch/motion.js:1125), [plate-probe.js:428](../../../../src/server/services/touch/plate-probe.js:428), [block-probe.js:767](../../../../src/server/services/touch/block-probe.js:767).

   Provenance brute, occurrence unique, dérivation du second repère par Touch, remise à zéro du WCO à la bannière, repos post-acquittement et comparaisons machine/travail après attente sont présents. La contre-séquence « Z haut, déplacement extérieur, Idle sans coordonnées » ne libère pas la ligne suivante.

   `M3 S0`, FS absent ou vitesse manquante refusent les départs gardés. Le laser conserve son exception : `M5` initial peut partir, mais aucun déplacement avant preuve. Le programme est gardé **sur la broche seulement**, conformément à la conception ; les petits pas conservent leur exception broche.

   `spindleProof`, l’unicité étendue à FS/WCO, l’ordre des gardes et les refus brefs après connexion/$H/$X sont acceptables. La plaque demande correctement son reset lors d’un arrêt broche. Aucun délai modal n’est imposé pendant la descente `G38`, aucun `0x85` n’est ajouté à ces palpages. Les départs `$H` et `$X` restent inchangés.

5. **Remarque — Aucun affaiblissement caché identifié dans les quatre attentes modifiées.**  
   [line-bench.js:43](../../../../src/server/services/touch/__tests__/support/line-bench.js:43), [C1-RAPPORT.md:145](../../../../examples/cncjs-touch/design/plaque/C1-RAPPORT.md:145).

   Les changements correspondent aux règles annoncées. Les ajouts de M5, second Idle et temps sont explicites dans les bancs ; le convertisseur ne les ajoute pas silencieusement. M29 est bien redondante ; les cas de M30 et M31 sont discriminants.

   **Limite :** la comparaison exhaustive des octets et chronologies avant/après conversion n’a pas été instrumentée. Les résultats sur l’ancien code et les mutations restent ceux de l’auteur, non réexécutés ici.

6. **Remarque — Disponibilité à mesurer pendant l’essai encadré.**  
   [c1-sequences.test.js:234](../../../../src/server/services/touch/__tests__/c1-sequences.test.js:234).

   Aucun faux refus répétitif structurel trouvé avec des rapports complets vers 4 Hz. Le cycle complet testé est à 5 Hz ; le cas 1 Hz est partiel. Relever les attentes entre lignes et les refus après homing sur la Surface. L’absence de compteurs pour la plaque reste une lacune de diagnostic, pas un blocage d’installation supplémentaire.

VERDICT : à revoir

