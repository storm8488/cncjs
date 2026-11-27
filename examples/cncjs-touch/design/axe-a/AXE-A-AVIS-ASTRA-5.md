# Axe A : avis d'Astra n° 5, relecture des dernières corrections de L0

Reçu le 27 novembre 2026. Porte sur le commit `00b54442`. Texte d'Astra recopié tel quel ; seuls les liens absolus vers l'arbre de travail sont devenus des chemins relatifs au dépôt. Réponses : `L0-RAPPORT.md`, « Après le cinquième avis ».

Relecture limitée à `514062ca..00b54442`. Aucun fichier modifié, aucun processus durable lancé, aucun contact machine.

**Danger (bloque l’installation) : aucun identifié dans ce commit.**

**À corriger avant l’installation : aucun dans le périmètre demandé.**

1. **Remarque — les deux points du quatrième avis sont fermés.**  
   [program-check.js:147](../../../../src/server/services/touch/program-check.js:147) reconnaît les expressions signées pour A/B/C, avec minuscules et espaces. Le masquage par profondeur, [ligne 115](../../../../src/server/services/touch/program-check.js:115), supprime bien le faux A de `G0 X[1+[2]+a1]`. **Correction proposée : aucune pour ces deux points.**

2. **Remarque — le test de concordance est réel, dans son corpus.**  
   [axis-a-l0-expressions.test.js:7](../../../../src/server/services/touch/__tests__/axis-a-l0-expressions.test.js:7) importe le vrai traducteur ; [ligne 84](../../../../src/server/services/touch/__tests__/axis-a-l0-expressions.test.js:84) exige une liste vide de lettres manquées. Vérification indépendante : **1 348 lignes, dont 982 avec mot rotatif sur une ligne non rejetée ; 758 faux négatifs avant correction, zéro après.** Les exclusions pour crochets résiduels, `#` et doubles signes sont cohérentes avec les lignes conservées par le vrai parseur CNCjs. Les **16 nouveaux tests et 48 tests L0 passent**, rejoués en mémoire. **Correction proposée : conserver explicitement la portée « sur ce corpus ».**

3. **Remarque — un nouveau faux positif conservateur dépasse la liste du rapport.**  
   Avec `a1=7`, `G0 X['['.length + a1]` devient réellement `G0 X8`, mais [program-check.js:132](../../../../src/server/services/touch/program-check.js:132) restitue le texte brut après déséquilibre apparent des crochets, et annonce A. L’ancien détecteur ne l’annonçait pas.  
   Cela reste acceptable pour installer L0 : aucun changement XYZ, et cette expression était déjà interdite à la reprise. **Correction proposée :** dans [L0-RAPPORT.md:115](../../../../examples/cncjs-touch/design/axe-a/L0-RAPPORT.md:115), restreindre « tous […] refusés par la carte » aux faux positifs du corpus et documenter cet exemple.

4. **Remarque — la limite déclarée est acceptable pour L0, mais sa formulation est incomplète.**  
   [L0-RAPPORT.md:120](../../../../examples/cncjs-touch/design/axe-a/L0-RAPPORT.md:120) mentionne les variables contenant du texte. Un résultat numérique ne garantit pas davantage une couverture exhaustive : `G0 X['('.length] A90` devient `G0 X1 A90`, sans signalement A **dans les deux versions**. Ce défaut préexistant n’est pas rouvert ici. La reprise reste refusée par [resume.js:515](../../../../src/server/services/touch/resume.js:515). **Correction proposée :** élargir la limite documentaire aux chaînes littérales et au traitement des commentaires avant traduction.

5. **Remarque — aucune autre modification de comportement identifiée.**  
   Seul le détecteur change en production. Classement, verdicts, calculs XYZ, interface et chemins de reprise restent inchangés. Les **33 empreintes** correspondent à la référence et sont identiques entre `514062ca` et HEAD : **99 contrôles et 313 positions de reprise**, via [axis-a-l0-digest.js:24](../../../../src/server/services/touch/__tests__/support/axis-a-l0-digest.js:24). **Correction proposée : aucune.**

VERDICT : à réaliser