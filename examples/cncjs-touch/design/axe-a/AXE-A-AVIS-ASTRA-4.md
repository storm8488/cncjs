# Axe A : avis d'Astra n° 4, relecture des corrections de L0

Reçu le 27 novembre 2026. Porte sur le commit `514062ca` : les numéros de ligne cités sont ceux de ce commit. Texte d'Astra recopié tel quel ; seuls les liens absolus vers l'arbre de travail sont devenus des chemins relatifs au dépôt. Réponses : `L0-RAPPORT.md`, section « Après le quatrième avis ».

---

Relecture de `0183347f..514062ca`, limitée aux corrections de L0. Aucun fichier modifié, aucun processus durable lancé, aucun contact machine.

1. **Danger (bloque l’installation) — aucun nouveau contournement de reprise identifié.**  
   [job-load.js:162](src/server/services/touch/job-load.js:162) et `:220` contrôlent toujours le fichier complet avant tout envoi. Vérification en mémoire : **36 variantes `$J=`**, couvrant A/B/C, avant/sur/après, minuscules et espaces ; **72 refus** d’aperçu/chargement, aucune commande au contrôleur factice. Le chargement depuis le début produit bien l’avertissement. **Correction proposée : aucune.**

2. **À corriger avant l’installation — les expressions signées restent invisibles.**  
   [program-check.js:125](src/server/services/touch/program-check.js:125) reconnaît `A[1+2]`, mais manque `A-[1+2]` et `A+[1+2]`. Le vrai traducteur CNCjs produit pourtant `A-3` et `A+3`. Même défaut pour B/C : **six faux négatifs reproduits**, sans avertissement rotatif.  
   La reprise reste refusée par [resume.js:580](src/server/services/touch/resume.js:580) : ce défaut concerne le signalement. **Correction proposée :** accepter le signe facultatif avant l’expression et ajouter les tests A/B/C avec signes, minuscules et espaces, en conservant classement et verdict.

3. **Remarque — le masquage des crochets laisse un faux positif.**  
   [program-check.js:124](src/server/services/touch/program-check.js:124) s’arrête au premier `]` : `G0 X[1+[2]+a1]` signale faussement A. Cette expression imbriquée est également mal prise en charge par le traducteur CNCjs et sa reprise demeure refusée. **Correction proposée :** masquer les crochets par profondeur et ajouter ce contre-exemple ; aucune évaluation nécessaire.

4. **Remarque — les cas explicitement demandés sont corrigés.**  
   [program-check.js:113](src/server/services/touch/program-check.js:113) exclut correctement les autres commandes `$`, `%A1=5`, les directives `%…` et les noms contenus dans les expressions simples ou `#<…>`. Les trois cas `G0 X[1+1] A90`, `G0 A[1+2]` et `G0 A#1` sont signalés ; comparaison avant/après : classement, XYZ, verdict et `blocking` inchangés. **Correction proposée : aucune pour ces cas.**

5. **Remarque — non-régression et correction de couleur confirmées.**  
   [axis-a-l0-digest.js:24](src/server/services/touch/__tests__/support/axis-a-l0-digest.js:24) : **33/33 empreintes identiques** entre le code avant L0, la référence et HEAD, couvrant 99 contrôles et 313 positions de reprise. Les **48 tests L0** rejoués en mémoire passent, ainsi que le test UI FR/EN/ES. [ui-2027.css:477](examples/cncjs-touch/touch/ui-2027.css:477) corrige bien la priorité de l’ambre. **Correction proposée :** compléter les tests par les contre-exemples ci-dessus.

VERDICT : à revoir