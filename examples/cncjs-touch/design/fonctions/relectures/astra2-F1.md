Relecture de **`feat/F1` à `c1f32ec5`**, après lecture de la première revue et confrontation du compte rendu au code et aux tests. **Un danger subsiste dans les arrêts CNCjs ; C1 reste partiellement corrigé.** Aucun fichier modifié.

**Danger — D4 : `autolevel:stop` laisse encore partir un segment après un reset.**

Dans [index.js:122](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/index.js:122), cette commande manque aux arrêts qui neutralisent immédiatement le cadrage. Elle est pourtant autorisée comme commande sûre par `control.js:44`, et son gestionnaire appelle réellement `reset` dans [GrblController.js:1865](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/controllers/Grbl/GrblController.js:1865).

Reproduction en mémoire avec les vrais modules et gestionnaires : cadrage à Z−5, `M5` acquitté, deux rapports `Idle`, puis `autolevel:stop` avant le prochain passage du superviseur. La façade l’accepte sans terminer le cadrage. **Sans nouveau rapport ni bannière**, les écritures deviennent :

```text
M5
0x18
$J=G90 G21 X10 Y20 F600
```

La bannière termine ensuite la séquence, trop tard. `workflow.stop()` n’émet aucun événement puisque le workflow est déjà au repos. Un reset au repos ne garantit pas une alarme bloquante, conformément à l’hypothèse documentée dans `FIRMWARE.md:98`.

Les tests [cnc-frame.test.js:1050](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/__tests__/cnc-frame.test.js:1050) reproduisent correctement les anciens cas `jogCancel`, `0x85`, mélange `?0x85` et `writeln`. **Ces fenêtres précises sont fermées**, mais `autolevel:stop` manque à la matrice.

**Correction :** reconnaître aussi cet arrêt avant sa transmission ; ajouter un test entre deux lignes au repos, avec reset réel et bannière différée, exigeant qu’aucune ligne de cadrage ne parte ensuite.

**À corriger — C1 : neutralisation après bannière encore incomplète, test trop favorable pour l’exception annoncée.**

La correction ferme bien les fenêtres initiales de changement de main, fermeture du flux et répétition d’une annulation commencée **avant** la bannière. Les tests `cnc-frame.test.js:1114` et `:1158` les exercent réellement.

Deux cas restent :

- **Fermeture du service après la bannière :** [motion.js:1543](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:1543) envoie encore `0x85` parce que l’ancien jog reste dans `s.pending`, sans comparer sa session. Reproduit : bannière, puis `dispose()` → un octet supplémentaire.
- **Arrêt explicite après la bannière :** l’annulation reçoit la nouvelle valeur de `startups`, puis peut se répéter sur des rapports `Jog`. Reproduit : **six `0x85` en une seconde**. Le test [cnc-frame.test.js:1150](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/__tests__/cnc-frame.test.js:1150) force immédiatement `Idle` ; il ne prouve donc pas la limite annoncée « au plus un ».

Ces octets annulent ; **aucun mouvement dangereux n’est démontré par C1 seul**.

**Correction :** vérifier la session dans `forget()` ; tester l’arrêt explicite avec des rapports `Jog` persistants et aligner la documentation sur la politique retenue, sans supprimer aveuglément une répétition utile à l’arrêt.

Les autres constats initiaux sont traités ainsi :

| Constat | Conclusion après lecture du code et des tests |
|---|---|
| **D1 — fermé** | [motion.js:420](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:420) bloque tant que `s.frame` existe. `cnc-frame.test.js:932` et `:953` testent réellement après `ok` + deux rapports, avant supervision, puis pendant une rotation. Les quatre opérations concurrentes sont refusées. Le test UI `test-real-motion.cjs:582` conserve volontairement `canJog=true` : les flèches et zéros restent bloqués par `motion.frame`. |
| **D2 — fermé** | [job-service.js:2066](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/job-service.js:2066) conserve XYZ après `M5` ; `motion.js:1045` impose la hauteur avant X/Y. `cnc-frame.test.js:975` reproduit vraiment Z−60 sans montée prévue et le déplacement inattendu de X. Aucun X/Y ne part. |
| **D3 — fermé** | [motion.js:1196](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:1196) revérifie état, position et hauteur malgré une arrivée déjà validée. `cnc-frame.test.js:1019` reproduit le changement pendant rotation, en `Jog` et en `Idle`. Un témoin supplémentaire en mémoire confirme qu’une rotation sans changement reprend normalement. |
| **C2 — fermé** | [motion.js:987](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/motion.js:987) utilise bien le garde comprenant la fraîcheur de `$G`, fourni par `job-service.js:1466`. Le test `cnc-frame.test.js:1173` exerce effectivement `M3`, `M4` et `$G` périmé sans vitesse. Ces trois arrêts ont également été reproduits en mémoire. |
| **C3 — fermé** | [api.gcode.js:36](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/api/api.gcode.js:36) refuse avant chargement. `job-service.js:586` coupe immédiatement sur remplacement du sender ; `motion.js:980` surveille son identité. Les tests API `:40`, puis `cnc-frame.test.js:1078` et `:1095`, couvrent le refus, le départ en attente et le remplacement malgré tout. Ce sont des tests de fonctions/façade, pas une requête HTTP complète. |
| **C4 — fermé pour les lacunes initiales** | Dans [cnc-frame-lunyee.test.js:168](C:/Users/damou/Documents/claude/cncjs-wt/F1/src/server/services/touch/__tests__/cnc-frame-lunyee.test.js:168), L2 maintient réellement D2 en vérification et exige le refus sans condition. L3 (`:198`) parcourt les trois bornes X0, X407,5 et Y395,5. L7 (`:254`) injecte le reset pendant `Jog`, sans arrêt préalable, et exige `ALARM:3`, `_RESTART` et aucune écriture ultérieure du cadrage. |

**Remarque — deux preuves à préciser.** Le test de hauteur `cnc-frame.test.js:997` échoue déjà sur l’écart d’arrivée ; il n’isole pas le garde `safeZ`. Un cas indépendant exécuté en mémoire l’isole correctement : départ −5,005, puis −5,054, soit un écart admis de 0,049 mm mais une hauteur insuffisante → refus avant X/Y. Ce cas mérite d’être conservé. Par ailleurs, [PROTOCOLE-ESSAI.md:139](C:/Users/damou/Documents/claude/cncjs-wt/F1/examples/cncjs-touch/design/refonte/PROTOCOLE-ESSAI.md:139) propose un essai depuis un autre appareil : le refus de pilotage peut masquer D1 ; préciser un essai depuis l’appareil propriétaire.

**Remarque — R1 reste ouvert.** Aucun essai matériel. Les deux tests DOM ont été exécutés avec succès, ainsi que les reproductions ciblées en mémoire. Les suites Jest/LUNYEE complètes et le navigateur n’ont pas été relancés. Aucun nouveau faux refus confirmé sur les parcours vérifiés ; arbre Git propre.

VERDICT : à ne pas installer — danger restant : `autolevel:stop` peut laisser envoyer un segment de cadrage après son reset.
