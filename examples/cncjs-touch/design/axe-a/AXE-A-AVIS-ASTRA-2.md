# Axe A : contre-avis d'Astra n° 2 sur la conception

Reçu le 27 novembre 2026. Porte sur `AXE-A-CONCEPTION.md` au commit `4e21d9f1` (révision 2) : les numéros de ligne cités de ce document sont ceux de cette révision. Texte d'Astra recopié tel quel ; seuls les liens absolus vers l'arbre de travail sont devenus des chemins relatifs au dépôt. Réponses : second tableau en tête de `AXE-A-CONCEPTION.md` révision 3.

---

**Le cadre général est acceptable pour poursuivre lot par lot. L0 côté serveur est prêt, mais sa prescription d’affichage demande une correction avant codage : l’avertissement prévu resterait caché dans les détails.** C’est le seul point qui motive ici « à revoir » pour L0.

Relecture statique sur `feat/axe-A`, HEAD `4e21d9f1`. Aucun fichier modifié, aucun processus durable lancé, aucune commande machine. Les tests d’implémentation restent à exécuter.

Les réponses aux points **2, 3, 4, 6, 7, 8, 10 et 13** sont acceptées au niveau demandé. Les points **11 et 12** deviennent des exigences de vérification au code. Le point **1** est corrigé côté serveur, avec le défaut d’affichage ci-dessous ; les points **5 et 9** gardent des corrections pour leurs lots respectifs.

1. **À corriger avant le code de L0 — rendre l’avertissement visible sans ouvrir les détails.**

   [AXE-A-CONCEPTION.md:169](examples/cncjs-touch/design/axe-a/AXE-A-CONCEPTION.md:169) s’appuie sur `check-screen.js:103`. Or cette ligne appartient à `paintDetails`, dans le volet « Détails du contrôle » créé à `check-screen.js:9`. La vue principale ne reprend de `info` que l’avertissement de vitesse de broche (`:113`). Elle conserverait « Tout est prêt : le fichier tient dans la machine » (`:50`). La confirmation de départ affiche également « Tient dans la machine » sans consulter `info` ([job-controls.js:654](examples/cncjs-touch/touch/job-controls.js:654)).

   **Correction :** prescrire un avertissement A/B/C visible dans la vue principale Contrôle, détails fermés, et le reprendre dans la confirmation de départ. Garder les décisions serveur et les verdicts XYZ inchangés. Le banc doit vérifier cette visibilité en FR/EN/ES, sans ouvrir les détails.

   Ce défaut découle du nouveau placement dans `info`. **La séparation serveur est correcte** : elle préserve les enveloppes, `blocking` et la priorité de `outside`.

2. **À corriger avant le lot concerné — T3 ne décrit pas un tour complet.**

   [AXE-A-CONCEPTION.md:133](examples/cncjs-touch/design/axe-a/AXE-A-CONCEPTION.md:133) commande en relatif **1 + 10 + 90 + 3 × 90 = 371°**, puis exige le retour sur le trait après 360°. Une échelle correcte échouerait à ce contrôle.

   **Correction avant qualification L3 :** séparer les petits essais de la mesure du tour ; relever un nouveau départ physique et numérique avant les quatre déplacements de 90°, avec positions attendues explicites. Ne pas ajuster `$103` pour satisfaire le contrôle contradictoire actuel.

3. **À corriger avant le lot concerné — T8 ne garantit pas la restauration du décalage.**

   [AXE-A-CONCEPTION.md:138](examples/cncjs-touch/design/axe-a/AXE-A-CONCEPTION.md:138) suppose « MPos A = 30 (par T3) », que T3 n’établit pas. Ensuite, `G10 L2 P1 A0` restaure l’ancien décalage uniquement si celui-ci était nul.

   **Correction avant l’essai L2 :** expliciter le placement préalable, relever G54.A avant l’écriture, restaurer cette valeur précise, puis vérifier `$#` et WCO. Cela ne remet pas en cause le nouveau contrat du zéro A, qui répond bien au point 6.

4. **À corriger avant le lot concerné — le filtre L4 manque encore les rappels implicites sans aucun mot A.**

   [AXE-A-CONCEPTION.md:234](examples/cncjs-touch/design/axe-a/AXE-A-CONCEPTION.md:234) conditionne les interdictions à la présence d’un mot A ; `:248` exclut expressément les autres fichiers. Ainsi, un programme XYZ suivi de `G28` ou `G30` sans mot d’axe échappe au refus de `:243`, alors que ce rappel implicite de A était précisément visé par le point 9.

   **Correction avant L4 :** avec A configuré, détecter ces rappels indépendamment des mots A explicites et les refuser aux deux contrôles serveur. Tester XYZ + G28/G30 avec et sans configuration A ; conserver le comportement historique sans configuration A. **Aucun élargissement de L0 n’est nécessaire.**

5. **À vérifier au code — appliquer les contrats acceptés jusqu’au bout.**

   Pour **L0**, les tests de [AXE-A-CONCEPTION.md:180](examples/cncjs-touch/design/axe-a/AXE-A-CONCEPTION.md:180) couvrent correctement la conservation des refus XYZ et le scan de reprise sur tout le fichier. `buildResume` est utilisé pour l’aperçu et le chargement effectif (`job-load.js:162`, `:220`) : le point de refus proposé couvre les deux chemins.

   Pour **L2**, « A inchangé jusqu’à la fin » exige une référence A conservée dans la session. Étendre seulement `near`/`moved` ne suffira pas : `plate-probe.js:513–519` et `block-probe.js:788` recapturent la position entre mouvements. **Vérification attendue :** une rotation A pendant une ligne, ensuite stabilisée, doit provoquer l’arrêt plutôt que devenir la nouvelle référence. Ce contrôle applique le point 12 accepté.

6. **Remarque — les nouvelles données du kit sont correctement exploitées.**

   [AXE-A-CONCEPTION.md:29](examples/cncjs-touch/design/axe-a/AXE-A-CONCEPTION.md:29) donne des calculs cohérents : 3,3333 pas entiers/°, puis 26,667 à 1/8 ou 53,333 à 1/16 ; avec `$103=800`, facteurs respectifs 30 et 15. Ils restent conditionnels aux micropas réels. Les dimensions alimentent correctement le risque de volume balayé, sans prétendre prouver le dégagement.

| Lot | Décision de ce deuxième avis | Condition restante |
|---|---|---|
| **L0 — signalement/reprise** | Serveur prêt ; prescription UI à corriger | Avertissement visible avant départ, puis tests prévus. Aucun essai machine nécessaire |
| **L1 — affichage** | Base acceptable après lecture de la carte | Trois états, valeurs brutes, unités et échelle explicitement qualifiée ou inconnue |
| **L2 — zéro** | Contrat acceptable pour la prochaine revue | Corriger T8 ; vérifier preuve post-écriture et invariants des séquences |
| **L3 — jog** | Base acceptable, détails soumis après essais | Corriger T3 ; qualifier échelle, sens, plafond, annulation et bornes |
| **L4 — indexage** | Périmètre réduit acceptable pour une revue ultérieure | Fermer le cas G28/G30 implicite ; qualifier référence, maintien et comportement réel |

VERDICT : à revoir