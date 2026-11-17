Relecture de **`feat/F1` à `084b046c`**, après lecture des deux revues et du compte rendu. **Les fenêtres précédemment signalées sont fermées, mais la correction C1 introduit une régression dangereuse de l’arrêt automatique des jogs manuels.** Aucun fichier modifié ; arbre Git propre.

**Danger — nouveau : après une bannière, un jog manuel retardé peut perdre son arrêt automatique.**

Références : [motion.js:592](/C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:592), `:610–616`, `:727` et `:1569`.

Le superviseur transmet désormais l’ancienne session à `cancel()`. Celui-ci retire la session logicielle, puis refuse d’envoyer `0x85` puisque la carte a redémarré. Il quitte également sans installer la surveillance d’arrêt non confirmé.

Scénario reproduit **en mémoire avec le vrai service** :

1. Un déplacement continu est envoyé.
2. Une bannière survient, puis des rapports **`Jog` frais** arrivent : cas d’un `$J` retardé exécuté après le redémarrage, explicitement envisagé par [motion.js:371](/C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:371).
3. Le maintien n’est plus renouvelé pendant six secondes.

Résultat : **aucun `0x85`**, `cancelling=false`, `cancelUnconfirmed=false`, `lastJog.result='cancelled'`, alors que la machine reste rapportée `Jog`. Même défaut pour un pas suivi d’une fermeture du flux. La comparaison avec `c1f32ec5` confirme la régression : l’ancien superviseur envoyait puis répétait l’annulation.

Le test [cnc-frame.test.js:1324](/C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/__tests__/cnc-frame.test.js:1324) **manque ce scénario** : il impose `Idle` après 100 ms. Il prouve l’absence d’écriture après bannière, pas le maintien de la fonction d’arrêt.

**Correction :** conserver l’extinction définitive de l’ancienne séquence, mais traiter un `Jog` fraîchement observé après bannière comme un mouvement à surveiller et à annuler lorsque maintien ou flux sont perdus. Conserver un état d’arrêt non confirmé jusqu’à observation de l’arrêt. Ajouter le scénario avec rapports `Jog` persistants au-delà de cinq secondes. La règle du cadrage « aucun octet après bannière » ne doit pas supprimer silencieusement cette protection des mouvements manuels.

**Vérification des constats antérieurs**

Les références `cnc-frame.test.js` ci-dessous désignent `src/server/services/touch/__tests__/cnc-frame.test.js`.

| Constat initial | Correction et valeur réelle du test |
|---|---|
| **D1 — danger : déplacement concurrent pendant le cadrage** | **Fermé.** [motion.js:421](/C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:421) réserve toute la séquence ; l’exception `own` sert uniquement à sa propre revérification. Les tests `:932` et `:950` tentent réellement pas, continu, zéro et second cadrage après `ok` + deux rapports, avant supervision, également pendant rotation. Le test UI `test-real-motion.cjs:582` conserve volontairement `canJog=true` et vérifie le blocage par `motion.frame`. |
| **D2 — danger : hauteur non vérifiée sans montée** | **Fermé.** [job-service.js:2066](/C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/job-service.js:2066) conserve XYZ après `M5` ; `motion.js:1082` vérifie la hauteur avant X/Y. Le test `:968` reproduit Z0 → Z−60 et le déplacement inattendu de X. Le nouveau test `:1432` isole bien `safeZ` : −5,005 → −5,054 respecte la tolérance d’arrivée mais échoue sur la hauteur. |
| **D3 — danger : arrivée ancienne réutilisée après rotation** | **Fermé.** [motion.js:1242](/C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:1242) refait les contrôles même si l’arrivée était déjà validée. Le test `:1005` valide d’abord pendant l’absence du flux, déplace ensuite XYZ, puis réouvre en variantes `Jog` et `Idle`. Aucun segment suivant. |
| **D4 — danger : annulations CNCjs, puis `autolevel:stop`** | **Fermé.** [index.js:128](/C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/index.js:128) neutralise synchroniquement le cadrage pour toute commande sûre non interrogative, dont `autolevel:stop` et `0x84`. La matrice `:1105` reproduit bien l’intervalle entre deux lignes, puis deux secondes sans rapport ni bannière. **Limite :** elle teste la vraie façade, sans exécuter le gestionnaire réel du reset. L’ordre façade → transmission est néanmoins confirmé dans CNCEngine. |
| **C1 — à corriger : écritures après bannière** | **Anciens trous fermés, régression décrite plus haut.** [motion.js:1592](/C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:1592) vérifie désormais la session dans `forget()`. Les tests `:1198`, `:1242` et `:1308` exercent changements de main, fermeture, répétition et `dispose()`. Le test `:1347` conserve enfin `Jog` après un arrêt explicite et vérifie les répétitions, puis leur fin au repos. |
| **C2 — à corriger : surveillance de broche sans vitesse** | **Fermé.** [motion.js:1013](/C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:1013) reprend le garde complet. Le test `:1257` retire réellement la vitesse, injecte M3/M4 ou vieillit `$G` tout en rafraîchissant les rapports de position : il isole correctement chaque cause. |
| **C3 — à corriger : remplacement du programme** | **Fermé.** [api.gcode.js:36](/C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/api/api.gcode.js:36) refuse avant chargement ; `job-service.js:586` termine immédiatement sur `load`/`unload`. Les tests API `:40`, puis `cnc-frame.test.js:1078` et `:1179`, couvrent réservation, départ en attente et remplacement malgré tout. Ce ne sont pas des requêtes HTTP complètes. |
| **C4 — à corriger : preuves insuffisantes** | **Lacunes initiales fermées à la lecture.** Dans [cnc-frame-lunyee.test.js:168](/C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/__tests__/cnc-frame-lunyee.test.js:168), L2 maintient D2 en vérification et exige le refus sans condition ; L3 `:198` parcourt les trois bornes ; L7 `:254` injecte directement le reset pendant `Jog`, exige `ALARM:3`, `_RESTART` et aucune écriture ultérieure. |

**Remarque — la limite annoncée de 200 ms reste trop générale.** [motion.js:649](/C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:649) permet une réémission immédiate sur nouvel acquittement ; les 200 ms concernent seulement la branche des rapports `Jog`. Le test `cnc-frame.test.js:1357` compte les octets sans mesurer leurs intervalles. Préciser cette exception dans `SURETE.md:218` et tester un acquittement tardif. Cette réémission favorise l’arrêt ; aucun danger supplémentaire démontré.

**Remarque — autres régressions recherchées.** Aucun nouveau faux refus confirmé dans les contrôles de réglages, repère et WCO. Les tests `cnc-frame.test.js:1391` modifient effectivement ces valeurs, et le témoin `:1418` termine normalement. Aucun autre nouveau chemin d’envoi confirmé.

**Vérifications exécutées :** 74 tests unitaires réussis dans les suites cadrage, API et raccordement CNCEngine ; les deux tests DOM passent. La suite LUNYEE a été bloquée à la création de ses fichiers temporaires par l’environnement en lecture seule (`EPERM`) : aucun résultat fonctionnel revendiqué pour cette exécution. Les reproductions complémentaires restent des essais en mémoire ; **R1, validation physique, reste ouvert**.

VERDICT : à ne pas installer — danger restant : arrêt automatique des jogs manuels neutralisé après bannière malgré des rapports Jog frais et la perte du maintien ou du flux.
