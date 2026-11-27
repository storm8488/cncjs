# Axe A : contre-avis d'Astra n° 1 sur la conception

Reçu le 27 novembre 2026. Porte sur `AXE-A-CONCEPTION.md` au commit `d94225f3` (révision 1) : les numéros de ligne cités de ce document sont ceux de cette révision. Texte d'Astra recopié tel quel ; seuls les liens absolus vers l'arbre de travail sont devenus des chemins relatifs au dépôt. Réponses : tableau en tête de `AXE-A-CONCEPTION.md` révision 2.

---

**Le découpage par lots est viable, mais la conception doit être corrigée avant réalisation.** L0 peut avancer immédiatement après une correction ciblée ; L1 après lecture de la carte. L2–L4 demandent des contrats de preuve et un protocole d’essai plus précis.

Relecture sur `feat/axe-A`, HEAD `d94225f3`. Aucun fichier modifié, aucun processus durable lancé, aucune commande envoyée à la machine. Les reproductions citées ont été exécutées uniquement en mémoire.

Ci-dessous, les fichiers JS sont dans `src/server/services/touch/` ; `AXE-A-CONCEPTION.md` désigne la [conception relue](examples/cncjs-touch/design/axe-a/AXE-A-CONCEPTION.md).

1. **Danger — L0, tel qu’écrit, peut supprimer un refus hors course XYZ.**  
   `AXE-A-CONCEPTION.md:122` propose de poser la raison rotative sur les trois axes comme un code non interprété. Or `program-check.js:688-691` efface l’enveloppe des axes ainsi déclarés inconnus. Le dépassement disparaît alors de `blocking`, et `job-service.js:1149-1150` permet le départ.

   Reproduction avec `G21 G90 G54` puis `G0 X500 A90`, sur la machine du test existant :

   | Analyse | Verdict | Blocage XYZ |
   |---|---|---|
   | Code actuel | `outside` | Dépassement X prouvé |
   | Règle L0 proposée, insérée en mémoire | `unknown` | Aucun |

   Résultat identique avec `$20=0` et `$20=1`. **Correction : conserver l’analyse géométrique XYZ et ses blocages ; ajouter un avertissement rotatif distinct.** Un dépassement prouvé doit rester prioritaire. L0 est donc juste dans son objectif, mais pas sans régression dans le mécanisme proposé.

2. **Danger — Les « refus » L4 ne sont actuellement que des avertissements.**  
   `AXE-A-CONCEPTION.md:162` utilise `unknown` comme refus. Pourtant `job-service.js:2443-2445` et `design/refonte/SURETE.md:39` disent explicitement que ce verdict laisse possible un départ ordinaire, **sans dérogation particulière**.

   **Correction :** définir des interdictions serveur propres à L4, non contournables par la dérogation de course, vérifiées à la préparation et au dernier contrôle précédant `gcode:start`. Conserver séparément l’avertissement volontaire de L0. Ne pas transformer tous les anciens `unknown` XYZ en refus.

3. **Danger — La disparition de A pourrait désactiver ses propres protections.**  
   `AXE-A-CONCEPTION.md:117` confond « A configuré » et « dernier rapport contenant A ». À `:140`, A n’est comparé que lorsque les deux rapports le portent. Une séquence **4 → 3 → 4 valeurs** ne prouve pourtant pas deux rapports consécutifs au repos pour A.

   Pendant un jog, `report-proof.js:160` et `motion.js:580,728` peuvent continuer à trouver une position fraîche grâce à XYZ, alors que A a disparu.

   **Correction : séparer configuration et disponibilité de preuve.** Réglage absent : comportement historique. Réglage présent mais A absent, abîmé ou périmé : case **« A — »**, commandes A indisponibles, confirmations invalidées, compteur de repos A réinitialisé. Une session A déjà engagée conserve son exigence de preuve A et demande l’annulation à l’échéance prévue. Elle ne retourne jamais silencieusement aux gardes XYZ. Les commandes d’arrêt restent accessibles.

4. **Danger — Des coordonnées cohérentes ne prouvent pas l’orientation physique ni la tenue de la pièce.**  
   `AXE-A-CONCEPTION.md:143,169,199,207`. Après redémarrage, rotation manuelle du mandrin, desserrage ou perte de pas, C1 et D2 peuvent être parfaitement cohérents avec un angle physique faux. « Le programme place A » ne rétablit pas une référence angulaire perdue.

   **Correction :** imposer un repérage angulaire manuel valable pour la session après perte de référence ; il n’est pas nécessaire que A soit encore à zéro au départ. L’option « moteur libre, simple avertissement » suffit pour observer à vide, **pas pour autoriser une coupe**, même indexée suivie de mouvements XYZ. La tenue mécanique ou électrique doit être adaptée et vérifiée ; `$1=255` ne prouve pas à lui seul le couple disponible.

5. **Danger — Le protocole M1–M10 engage trop tôt les mouvements les plus risqués.**  
   `AXE-A-CONCEPTION.md:104-113` :

   - M1 demande déjà dix unités dont l’échelle physique est inconnue.
   - M3 suppose qu’un déplacement de 360 unités représente un tour.
   - M4 lance `$H` avant M5, qui doit précisément déterminer si `$H` entraîne A.
   - M10 lance `G0 A720` avec une pièce pour découvrir les collisions ou enroulements.
   - M7, `G92 A0` puis `G92.1`, ne restaure pas nécessairement l’état initial : `G92.1` annule aussi les décalages XYZ.

   **Correction :** commencer par les paramètres moteur/réduction, de très petits mouvements lents sans pièce, puis l’annulation. Examiner les cycles de homing avant tout `$H`, en gardant la réserve sur le binaire fabricant. Remplacer M10 par une inspection du volume balayé puis des rotations progressives lentes. Supprimer M7 s’il n’est pas nécessaire. Chaque essai doit préciser modes, position initiale, cible et contrôles finaux ; M6, M8 et M9 ne le font pas suffisamment.

6. **À corriger avant le code — L2 suppose des gardes que les zéros XYZ n’ont pas.**  
   `AXE-A-CONCEPTION.md:141` annonce « mêmes gardes que le zéro XYZ : deux rapports au repos ». En réalité, `motion.js:1439-1449` ne demande pas cette preuve. Les lectures à `:1488,1508,1552,1560` utilisent l’état fusionné via `positionOf`. C1 laisse explicitement les zéros historiques hors de cette extension (`design/plaque/C1-CONCEPTION.md:169`).

   **Correction pour A :** définir expressément la preuve brute à la préparation, juste avant G10 et après son acquittement. Exiger MPos A inchangé, WPos A nul et un WCO A reçu après l’écriture, recoupé par une nouvelle preuve `$#` du **repère actif G54…G59**. Aujourd’hui, `motion.js:1570-1581` annonce le succès après avoir seulement invalidé D2 : attendre sa confirmation est donc une nouvelle séquence à concevoir.

   Refuser également un G92 A inconnu ou non nul lors du zéro : une somme G54+G92 correcte maintenant ne garantit pas le zéro après suppression de G92. En cas d’échec après envoi, annoncer **« zéro non confirmé, décalage possiblement écrit »**, sans suggérer un retour automatique à l’état antérieur.

7. **À corriger avant le code — Échelle, unités et bornes A doivent être qualifiées séparément.**  
   `AXE-A-CONCEPTION.md:92,131,149,152,188,198`.

   - `$103=800` est **non vérifié**, pas intrinsèquement faux sans connaître moteur, micropas et réduction.
   - Retirer « échelle non vérifiée » par un commit après un essai ne lie pas cette qualification aux réglages réellement utilisés.
   - Une vitesse de repli de 500 °/min n’est pas justifiée lorsque `$113` manque.
   - « Sans course mécanique » ne signifie pas « sans borne logicielle ».

   **Correction :** permettre L1 avec une indication explicite d’échelle non qualifiée, mais qualifier échelle et sens avant L3/L4 ; refuser le jog A si son plafond est inconnu. Écrire la borne du continu sans ambiguïté : `min(360, F × MAX_JOG_MS / 60000)`.

   Pour `$20/$133`, lire aussi l’origine numérique applicable à A et éprouver les deux sens. Ne pas déduire une référence mécanique A du homing XYZ, ni présenter un redémarrage comme une simple remise à zéro de course.

   L’amont confirme deux mécanismes distincts : G20 convertit les commandes de tous les axes, `$13=1` convertit leurs rapports. Le refus proposé est prudent, mais doit aussi couvrir les modes hérités et réglages inconnus. Cela reste à confirmer pour le binaire fabricant. [GCode.cpp R13](https://github.com/bdring/Grbl_Esp32/blob/1f2c8a37574386ed3cc5a79627a0d1a1bb96f9c5/Grbl_Esp32/src/GCode.cpp#L858-L862), [Report.cpp R13](https://github.com/bdring/Grbl_Esp32/blob/1f2c8a37574386ed3cc5a79627a0d1a1bb96f9c5/Grbl_Esp32/src/Report.cpp#L178-L190).

8. **À corriger avant le code — Le risque mécanique est annoncé, mais trop étroitement.**  
   `AXE-A-CONCEPTION.md:153,161,172,208`. Une pièce longue, même ronde, les mors ou le bridage peuvent heurter le portique, la table ou la broche. Câbles, tuyaux et pince de palpage peuvent s’enrouler. Plusieurs appuis peuvent accumuler plusieurs tours.

   **Correction :** afficher clairement : **« Courses commandées XYZ vérifiées ; volume balayé par la pièce, le mandrin et le bridage non vérifié. »** Un cadrage à A fixe ne valide aucune autre orientation. « Fraise en l’air » ne suffit donc pas sans dégagement de l’ensemble tournant.

   Préciser aussi qu’en rupture USB ou arrêt du serveur, le `0x85` peut ne jamais parvenir à la carte : elle peut terminer le déplacement déjà reçu. La borne d’un tour limite cette conséquence ; elle ne garantit pas l’absence de collision.

9. **À corriger avant le code — La liste des refus L4 est incomplète.**  
   `AXE-A-CONCEPTION.md:163-169` laisse notamment ces trous :

   - **G28/G30 sans mot d’axe** peuvent rappeler A implicitement. L’amont rappelle alors toutes les coordonnées mémorisées. [GCode.cpp R13:1009](https://github.com/bdring/Grbl_Esp32/blob/1f2c8a37574386ed3cc5a79627a0d1a1bb96f9c5/Grbl_Esp32/src/GCode.cpp#L1009-L1026).
   - Un **G93 déjà actif** n’est pas couvert par la recherche de G93 dans le fichier ; `job-service.js:1022-1031` ne garde actuellement G94 que pour la reprise reconstruite.
   - Un simple `A90` peut hériter de G2/G3 ou d’un autre mode interdit.
   - Le détecteur des modes avant premier mouvement ignore A (`resume.js:306-320`).
   - Un premier A ne doit pas masquer un B ou C ultérieur lorsque L4 accepte A.
   - Les commandes système, expressions opaques et changements de décalage doivent avoir une politique explicite.

   **Correction :** définir un premier sous-ensemble réellement pris en charge, analyser ses effets modaux et refuser effectivement les autres cas. L4 doit dépendre de la **preuve D2 A prévue en L2**, pas seulement de L1 comme indiqué à `:181`. Un début relatif doit utiliser une position initiale prouvée pour annoncer sa plage.

10. **À corriger avant le code — Durée et avance affichée restent partiellement trompeuses.**  
    Garder la durée à `null` jusqu’à qualification est honnête (`AXE-A-CONCEPTION.md:168`). Mais `program-time.js:9-47` n’intègre actuellement pas les accélérations : annoncer `$123` demande un modèle supplémentaire. M8, avec deux mouvements seulement, ne valide pas ce modèle ni les plafonnements.

    Le suivi affiche encore **« Avance réelle … mm/min »** (`examples/cncjs-touch/touch/job-dashboard.js:239-242`). Pour A seul ou combiné, cette valeur ne constitue pas une vitesse de surface.

    **Correction :** qualifier la convention de l’avance rapportée, adapter le suivi et laisser durée/progression inconnues tant que nécessaire. Les mouvements combinés sont envisageables après qualification ; commencer par l’indexation réduit le premier lot sans imposer une interdiction définitive.

11. **À vérifier au code — §5 est une bonne base, pas une preuve suffisante d’identité.**  
    `AXE-A-CONCEPTION.md:222-227`. Ajouter aux rejeux :

    - réglage absent ou faux, avec quatrième valeur **variable**, pas seulement A=0 ;
    - réglage vrai avec trois valeurs, transitions 4→3→4, WCO 4→3, champs abîmés, péremption et bannière ;
    - perte de preuve pendant confirmation, jog, palpage et cadrage ;
    - fichiers XYZ valides, inconnus et hors course, puis les mêmes avec A/B/C ;
    - décisions de départ, refus et chronologie des arrêts, en plus des octets émis.

    Figer la référence git comparée. Comparer le rendu et le comportement visibles plutôt qu’exiger un DOM brut identique après ajout d’éléments cachés. L’identité recherchée est **logicielle, à configuration comparable** : ajouter matériellement A ou modifier `$1/$20/$133` peut changer le comportement réel de XYZ.

12. **À vérifier au code — Les preuves partagées doivent respecter les deux configurations.**  
    `report-proof.js:125,174`, `plate-probe.js:448`, `block-probe.js:822`. Avec A configuré, une valeur absente ne doit jamais passer pour égale ; pendant un palpage ou cadrage, A doit rester connu et inchangé. Sans configuration A, ces nouvelles comparaisons ne doivent pas affecter XYZ.

    Palper à un angle non nul est raisonnable ; exiger systématiquement A=0 ne l’est pas. En revanche, l’angle du palpage doit être établi et conservé. Les preuves broche proposées sont bonnes pour tous les pas A, mais `FS:0` et M5 sont des preuves logicielles, pas une mesure d’arrêt mécanique (`FIRMWARE.md:126,135`).

13. **Remarque — Le constat « A accepté sans un mot » est confirmé, avec une formulation à borner.**  
    Les vraies fonctions ont reproduit : XYZ+A → `validated`, aucun avertissement A, durée `null` ; A seul → `validated`, `moves=0` ; G93+A → `validated` ; reprise reconstruite sans A. Les gardes ordinaires, notamment les dépassements XYZ, restent néanmoins applicables.

    Dire **« aucun avertissement spécifique aux mots A »** est exact. Le refus de reprise à une ligne pour A/B/C est justifié. Conserver le parseur CNCjs, distinguer le champ accessoires `A:` et garder « Zéro XYZ » limité à XYZ sont également de bons choix.

| Lot | Décision | Avant le code du lot | Qualification avant usage |
|---|---|---|---|
| **L0 — signalement/reprise** | **Réalisable maintenant après correction du point 1** | Séparer avertissement rotatif et enveloppes XYZ ; préciser le refus de reprise | Tests hors course + A/B/C, commentaires et reprise ; contrôle écran. Aucun essai A nécessaire |
| **L1 — voir** | **Réalisable après lecture de la carte** | Rapports bruts, identité, unités ; états « configuré / inconnu / disponible » | Vérifier l’affichage tablette ; petits mouvements pour identifier A et qualifier ensuite l’échelle |
| **L2 — zéro** | **À revoir, puis réalisable après lecture et essai ciblé** | Contrat G10/rapports/`$#`, G92, repère actif et référence après redémarrage | G10 préparé depuis la console, puis tablette ; vérifier MPos inchangé et zéro confirmé. M3/M4/M7 ne sont pas tous des préalables nécessaires |
| **L3 — déplacement manuel** | **À revoir** | Échelle/sens, plafonds, politique de bornes, homing et perte de preuve établis par lecture et petits essais | Petits pas, annulation, perte de maintien/flux, angle d’arrêt ; continu seulement ensuite |
| **L4 — programmes** | **À revoir, en dernier** | Refus serveur effectifs, modes/rotations implicites, D2 A, référence et tenue ; règles firmware qualifiées | Programme court à vide, pause/reprise simple/arrêt ; indexation d’abord, combiné ensuite. Coupe seulement après tenue et dégagement vérifiés |

VERDICT : à revoir
