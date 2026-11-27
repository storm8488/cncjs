# Axe A : avis d'Astra n° 3, relecture du code de L0

Reçu le 27 novembre 2026. Porte sur le code de L0, commits `95bfebf3` et `0183347f` : les numéros de ligne cités sont ceux de ces commits. Texte d'Astra recopié tel quel ; seuls les liens absolus vers l'arbre de travail sont devenus des chemins relatifs au dépôt. Réponses : `L0-RAPPORT.md`, section « Après les relectures du code ».

---

**L0 doit être corrigé avant installation : le refus de reprise présente un contournement par `$J=`.** La non-régression XYZ est en revanche bien étayée.

Relecture de `e574a298..0183347f`, incluant `95bfebf3`. Aucun fichier modifié, aucun processus durable lancé, aucun contact avec la machine.

1. **Danger (bloque l’installation) — `$J=` échappe au signalement et au refus de reprise.**

   [program-check.js:109](src/server/services/touch/program-check.js:109) exclut toutes les lignes commençant par `$`. [resume.js:583](src/server/services/touch/resume.js:583) réutilise ce détecteur ; `checkSyntax`, ligne 515, ne ferme pas ce passage.

   Reproduction avec les vraies fonctions, uniquement en mémoire :

   ```gcode
   G21 G90 G94 G17
   G0 X0 Y0 Z5
   $J=G90 A90 F100
   G1 Z-1 F100
   G1 X10 F300
   G1 X20
   M2
   ```

   **Reprise à la ligne 5 : aperçu accepté et chargement accepté**, jusqu’à `gcode:load` sur contrôleur factice. Le programme reconstruit supprime la commande A90 antérieure et reprend XYZ sans replacer A. Aucun avertissement rotatif n’est produit. Des variantes `$J=G91 A90 F100` sur ou après la ligne de reprise sont également acceptées.

   Le test [axis-a-l0.test.js:111](src/server/services/touch/__tests__/axis-a-l0.test.js:111) **impose actuellement ce faux négatif**.

   **Correction :** compacter les espaces, distinguer `$J=` des autres commandes `$`, puis rechercher A/B/C dans son corps. Corriger cette attente et tester avant/sur/après la reprise, pour l’aperçu et le chargement. Conserver les calculs XYZ inchangés.

2. **À corriger avant l’installation — un mot A explicite disparaît du signalement dès qu’une expression figure sur la même ligne.**

   [program-check.js:325](src/server/services/touch/program-check.js:325) quitte la ligne avant la détection située ligne 338.

   Reproductions : `G0 X[1+1] A90` et `G0 A90 F[100]` donnent `unknown`, sans `rotary` ni avertissement A. Pourtant le traitement réellement utilisé par le contrôleur, [GrblController.js:408](src/server/controllers/Grbl/GrblController.js:408), les transforme respectivement en `G0 X2 A90` et `G0 A90 F100`. Le verdict `unknown` n’interdit pas à lui seul le départ.

   **Correction :** relever les mots A/B/C littéraux des lignes G-code avant leur classement comme opaques, tout en conservant ce classement et les exclusions des directives/messages `%…`. Aucune évaluation des expressions n’est nécessaire pour reconnaître ici `A90`.

   Le rapport déclare les expressions non étudiées, mais cela laisse manquer un mot d’axe déjà explicite. **La reprise de ces exemples est toutefois correctement refusée** par le contrôle syntaxique existant.

3. **Remarque — absence de régression XYZ confirmée ; preuve par empreintes valable, dans son périmètre.**

   [program-check.js:1022](src/server/services/touch/program-check.js:1022) conserve la priorité de `outside` sur `unknown`. L’avertissement arrive après le calcul, ligne 1042. `G0 X500 A90` reste **`outside`**, avec les mêmes axes, `blocking` et `overridable`, pour `$20=0` et `$20=1`.

   Vérification indépendante contre les sources de `e574a298` : **28/28 empreintes identiques** entre ancien code, baseline et code courant ; cela couvre 84 contrôles et 266 positions de reprise.

   [axis-a-l0-digest.js:24](src/server/services/touch/__tests__/support/axis-a-l0-digest.js:24) couvre les résultats analyse/contrôle/reprise ; les refus sont comparés par code et paramètres. Cela ne prouve pas seul les décisions du service ni le rendu. Les gardes de départ de `job-service.js:1125–1160` sont cependant inchangées et ne dépendent pas des nouvelles données.

   **Correction proposée :** conserver cette portée explicite dans le rapport ; aucune correction du comportement XYZ identifiée.

4. **Remarque — les chemins de reprise convergent correctement ; le défaut est commun au détecteur.**

   `job-load.js:162` contrôle l’aperçu ; `:220` recalcule la reprise depuis le fichier complet avant l’envoi, ligne 237. Sauter l’aperçu ne contourne donc pas le refus pour un mot correctement détecté.

   Après arrêt (`touch/job-resume.js:89`) et depuis l’écran d’alarme (`touch/seance.js:256`), on rejoint le même panneau, puis `resumePlan` et `loadFrom` (`touch/job-resume.js:149,159`). Aucun autre contournement identifié. La continuation après pause simple reste volontairement inchangée.

   **Correction proposée :** réparer le détecteur partagé, sans ajouter une protection uniquement dans l’interface.

5. **Remarque — détection ordinaire satisfaisante ; écarts déclarés généralement acceptables.**

   Reproductions concluantes pour `G0A90`, minuscules, mots collés, espaces internes, numéros `N`, plusieurs commandes sur une ligne et mots après un commentaire fermé. Les mots présents dans un corps de sous-programme sont relevés, même après `M2`. Commentaires imbriqués, suffixes `;`, `(MSG,…)`, `%msg`, `G4 P…` et réglages `$103=…` ne déclenchent pas d’avertissement.

   Le nom `ETOUCH_ROTARY_UNCHECKED`, les paramètres `axis/line/count`, les phrases courtes et la détection avant le traitement des espaces ambigus sont acceptables. **L’exclusion générale de `$` ne l’est pas**, pour la raison du point 1. Aucun élargissement à L1–L4 n’est demandé.

6. **Remarque — affichage correctement raccordé, avec une réserve de rendu.**

   `touch/check-screen.js:8,117` place l’avertissement dans la carte principale, hors des détails. `touch/job-controls.js:656` l’ajoute séparément à la confirmation. Les textes FR/EN/ES fonctionnent.

   **Écart n° 5 accepté :** `check-screen.js:32–54` préserve les refus, dépassements et autres causes prioritaires dans la barre ; l’avertissement rotatif reste dans la carte.

   Deux limites non bloquantes :
   - `test-axis-a-l0.cjs:20` vérifie texte et attribut `hidden`, pas le débordement ni la visibilité physique. Compléter par un rendu navigateur/tablette sans départ.
   - `touch/ui-2027.css:475` écrase la couleur ambre de `files-touch.css:51` dans la confirmation. Le texte reste présent et gras. Correction : règle plus spécifique pour `p.check-rotary`.

Les **33 cas de `axis-a-l0.test.js` rejoués en mémoire passent**, ainsi que le test UI FR/EN/ES. Ils laissent néanmoins passer les deux lacunes ci-dessus ; leur réussite ne suffit donc pas à autoriser cette installation.

VERDICT : à revoir

