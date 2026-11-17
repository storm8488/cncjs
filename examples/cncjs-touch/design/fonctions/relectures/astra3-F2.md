> **Note de la réunion `feat/fonctions-5` : lot F2 non installé.** Relecture gardée telle quelle pour l'histoire du lot ; la dernière (`astra4-F2.md`) refuse l'installation.

Relecture de `feat/F2` à **`cce717ce`**, avec les deux audits précédents et le compte rendu. **Quatre chemins dangereux subsistent.** Aucun fichier modifié, aucun accès à la CNC.

1. **danger — constat 1 partiellement fermé : l’arrêt tablette contourne encore la procédure F2 après un arrêt PC.**

   La surveillance survit désormais à `workflow.stop()` : le test Socket `2-D1` traverse réellement façade, contrôleur et listener, puis vérifie les annulations répétées et `M5` au repos.

   Mais [job-service.js:2484](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/job-service.js:2484) traite `workflow idle + Jog` **avant** le transfert à `retract.halt()`, situé [ligne 2535](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/job-service.js:2535).

   **Reproduit avec le vrai service et le vrai contrôleur :** montée F2, `ok`, `Jog`, arrêt PC, puis « Arrêter » tablette. Réponse : « Déplacement annulé. » Après **30 rapports `Jog`, soit 7,5 secondes**, les annulations continuent, mais **aucun `!` ni reset** : la procédure d’escalade n’a jamais commencé.

   [2-D1c:1400](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1400) garde le workflow en pause ; [2-D1d:1150](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1150) teste l’arrêt PC pendant le dwell avec `Idle`. Aucun ne reproduit cette combinaison.

   **Correction :** transférer F2 et sa surveillance résiduelle avant le raccourci `idle + Jog`. Ajouter exactement la succession arrêt PC → arrêt tablette → `Jog` persistant.

2. **danger — régression : la surveillance résiduelle bloque le PC, mais autorise un nouveau jog depuis la tablette.**

   La garde Socket reconnaît `retractTail`, contrairement à [available():828](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/job-service.js:828), [notJogging():875](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/job-service.js:875) et [motion.atRest():380](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/motion.js:380).

   **Reproduit avec le vrai service et le vrai contrôleur :** montée écrite et acquittée, dernier statut encore `Idle`, arrêt PC créant `retractTail`. Le PC est refusé, mais `motion.canJog` reste vrai. Une demande tablette X+ est acceptée et écrit :
   ```text
   $J=G91 G21 X0.1 F100
   ```
   La fin du mouvement F2 n’a pourtant pas été prouvée. Une nouvelle commande de mouvement entre donc pendant sa surveillance d’annulation.

   [Le test Socket:302](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-socket.test.js:302) vérifie seulement le refus côté PC.

   **Correction :** inclure `retractTail` dans une garde commune aux actions qui agissent sur la machine, y compris tablette, en conservant les arrêts accessibles. Tester avant le premier `Jog` et avant le deuxième `Idle` confirmant le repos.

3. **danger — constat 3 partiellement fermé : depuis `held`, un arrêt de broche observé peut encore être oublié.**

   Les fenêtres du second audit sont fermées pour la broche **redémarrée par F2** : `2-D3a` à `2-D3e` jouent effectivement zéro puis absence de FS, changement de sens et retour à l’état attendu.

   Depuis `held`, cependant, `s.spindleT` reste nul. [report():1349](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:1349) ne mémorise alors aucune perte ; [le contrôle final:1049](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:1049) ne refuse que le zéro porté par le dernier rapport.

   **Reproduit sur la vraie factory, avec dépendances simulées :** passage à `held`, demande de reprise, `FS:0`, puis rapport XYZ/WCO sans FS avant la surveillance. **`gcode:resume` est effectivement envoyé**, alors que la dernière vitesse explicitement reçue reste zéro.

   [2-D3a:1231](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1231) et [2-D3d:1292](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1292) passent par `parked` et le `M3` de F2 ; ils manquent ce chemin.

   **Correction :** conserver également les observations explicites et la perte de broche depuis `held`, puis exiger une preuve adaptée avant `~`. L’absence de FS ne doit pas effacer un arrêt reçu.

4. **danger — une consigne de broche devenue incompatible autorise encore la plongée.**

   [spindleRunning():593](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:593) vérifie le sens et une preuve de vitesse positive. La consigne **S** n’est comparée qu’au [contrôle final:1040](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:1040), après la descente.

   **Reproduit sur les fonctions réelles en mémoire :** reprise mémorisée en `M3 S1000`, attente du flux avant les derniers 5 mm ; un client direct règle `S1`, puis CNCjs reçoit `$G … M3 … S1` et `FS:0,1`. Au retour du flux, **`$J=G91 G21 Z-5 F100` est écrit**.

   Les tests `2-D3a` à `2-D3e` ne changent jamais S vers une autre valeur positive. Il s’agit d’une consigne incompatible déjà connue du serveur, indépendamment de l’absence de compte-tours.

   **Correction :** comparer aussi la consigne S mémorisée avant chaque descente et pendant celle-ci ; invalider dès le `$G` incompatible. Tester le changement pendant l’attente et pendant l’approche.

Les autres constats précédents donnent les résultats suivants :

| Constat | Classement et vérification |
|---|---|
| **2 — départ du déplacement relatif** | **remarque — fermé.** [before():614](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:614) recontrôle départ et cible après l’attente. [D2:889](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:889) déplace réellement Z pendant l’absence du flux et exige zéro `$J=`. |
| **4 — zéro modifié adopté comme référence** | **remarque — fenêtre signalée fermée.** La référence est prise [avant la demande:965](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:965), puis chaque WCO reçu est comparé. [2-D4:1319](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1319) joue bien le changement entre les deux `Idle` et pendant la vidange en `Run`. |
| **5 — permanence Alarm/Restart** | **remarque — fermé.** [fail():415](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:415) exclut ces causes du retour à `held`. [2-D5:1167](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1167) injecte réellement l’événement avant première écriture, puis une nouvelle origine aux mêmes valeurs : reprise toujours refusée. |
| **6 — annulations Socket.IO** | **remarque — fermé pour les voies identifiées.** [index.js:137](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/index.js:137) prévient F2 avant transmission. [Les tests:279](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-socket.test.js:279) parcourent les listes réelles de commandes sûres et le vrai contrôleur ; les tests de dwell et de montée restent présents. |
| **7 — reprise finale sans flux** | **remarque — fermé.** [La reprise:1188](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:1188) attend le bon flux, le revérifie puis refait les contrôles. [D7/D7b:990](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:990) ferment réellement le flux depuis `parked` et `held`. |
| **8 — coordonnées anciennes et faux refus** | **remarque — corrigé dans les scénarios signalés.** [settled():551](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:551) attend un rapport portant XYZ. D8/D8b conservent la preuve contre les coordonnées fusionnées ; [2-D8:1379](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1379) joue le rapport sans XYZ intercalaire puis constate la poursuite au rapport suivant. |
| **9 — preuves défectueuses** | **remarque — corrections maintenues.** [D9:1087](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1087) ne conserve que B. [2-D9:348](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-socket.test.js:348) couvre les quatre phases manquantes. [Le test de page:153](/C:/Users/damou/Documents/claude/cncjs-wt/F2/examples/cncjs-touch/test-pause-retract.cjs:153) provoque réellement la perte du flux et vérifie les POST. |
| **10 — trajectoire LUNYEE** | **remarque — preuve logicielle maintenue.** [Le test:191](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-lunyee.test.js:191) compare machine/interpréteur à `~`, premier bloc repris et tous les blocs ; les trois injections de désynchronisation rendent le témoin discriminant. Cela reste une preuve simulée. |

**À corriger — le test `2-D4b` ne joue pas exactement le changement « pendant la descente » annoncé.** Il termine `ctx.jog(-8)` [ligne 1366](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1366), puis change le zéro. La borne utilisée par le code reste [le rapport au dernier `ok`:703](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:703). J’ai confirmé en mémoire qu’un WCO reçu **au début du dernier `Jog`** suffit ensuite à autoriser `~`, sans WCO reçu après le retour au repos. Ajouter cette variante ; pour garantir une relecture en fin de descente, placer la borne après la preuve du repos. La fenêtre d’un changement extérieur encore non rapporté reste une limite d’observation.

**Remarque — les deux autres points d’arrêt du second audit sont correctement distingués.** [2-D1b:1131](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1131) couvre maintenant le repos après plus de cinq secondes et l’absence de reset inutile. En revanche, [halt.js:89](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/halt.js:89) conserve le reset pendant `Jog` à l’échéance : `2-D1c` prouve ce choix désormais documenté, **pas** « reset seulement au repos ». Le titre de D1 reste donc inexact.

Le test de page a été exécuté avec succès, écritures de fichiers bloquées. Les contre-exemples ci-dessus ont été exécutés en mémoire ; les suites Jest complètes n’ont pas été relancées. L’arbre Git est resté propre. Aucune validation physique n’est revendiquée.

VERDICT : à ne pas installer — dangers restants : arrêt F2 contourné après arrêt PC ; nouveau jog tablette autorisé pendant la surveillance résiduelle ; reprise depuis held malgré un arrêt de broche observé ; plongée autorisée avec une consigne de broche incompatible.
