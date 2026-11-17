Relecture de `feat/F2` à **`f393aa5b`**, après lecture des trois avis et du compte rendu. **Les quatre fenêtres exactes du troisième tour sont corrigées, mais deux dangers restent reproductibles.** Aucun fichier modifié, aucun accès à la CNC.

1. **danger — Arrêter libère la garde F2 avant la fin de l’arrêt.**

   Sources : [pause-retract.js:1349](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:1349), [job-service.js:2500](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/job-service.js:2500), [halt.js:52](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/halt.js:52).

   **Reproduit avec le vrai service et le vrai contrôleur :** montée F2 écrite et acquittée, dernier rapport encore `Idle` — état `T0` —, arrêt PC, puis Arrêter tablette. Le transfert supprime immédiatement `retract`, `retractTail` et le suivi du jog. La procédure différée d’arrêt continue, mais ne réserve pas la machine.

   Sans aucun nouveau rapport ni preuve de repos, `canJog` devient **vrai**, `canStop` devient **faux**, et une flèche X+ écrit effectivement :
   ```text
   !
   $J=G91 G21 X0.1 F100
   ```
   Le nouvel envoi entre pendant un arrêt inachevé ; la procédure encore active peut ensuite l’annuler ou le réinitialiser.

   **Tests :** `3-D1` reproduit correctement le transfert ; `3-D2` protège correctement la surveillance résiduelle **tant qu’elle existe**. Aucun ne demande un mouvement après Arrêter. La table vérifie `canJog` [avant l’événement:1878](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1878), puis le premier `!`, sans nouvelle demande de mouvement.

   **Correction :** conserver une réservation explicite d’arrêt jusqu’à sa terminaison observée, commune aux gardes tablette, Socket.IO et commandes système ; garder Arrêter accessible. Ajouter `T0 → stop → act`, puis la variante après un premier `Idle`.

2. **danger — un sens de broche contraire explicitement reçu dans `A:C` n’empêche pas la plongée.**

   Sources : [job-service.js:487](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/job-service.js:487), [pause-retract.js:611](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:611), [GrblLineParserResultStatus.js:158](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/controllers/Grbl/GrblLineParserResultStatus.js:158).

   **Reproduit avec le vrai service et le vrai contrôleur :** reprise mémorisée en `M3 S1000`, redémarrage prouvé, temporisation puis approche rapide terminées. Deux rapports à Z −113,4 contiennent :
   ```text
   FS:0,1000|Ov:100,100,100|A:C
   ```
   Aucun nouveau `$G` n’est arrivé. Le parseur expose bien `accessoryState: "C"` — sens antihoraire — mais F2 conserve la preuve M3 du précédent `$G` et écrit :
   ```text
   $J=G91 G21 Z-5 F100
   ```

   **Tests :** `2-D3b/e` changent le sens par `$G` ; la colonne `spindle` de la table change seulement la vitesse. Ils manquent cette information contradictoire déjà reçue. La réserve du compte rendu sur l’existence de `A:` dans le firmware ne justifie pas d’ignorer sa présence explicite.

   **Correction :** transmettre les indications `S/C` du rapport courant, mémoriser immédiatement tout sens incompatible et interrompre la descente. Cela n’exige pas d’interpréter une absence de `A:` comme un arrêt. Tester `A:C` avec vitesse positive et ancien `$G M3`, pendant l’approche et avant la plongée.

Pour les constats précédents, voici le résultat de la confrontation **code et tests**, indépendamment des conclusions du compte rendu :

| Constat | Classement et vérification |
|---|---|
| **1 — arrêt et surveillance du jog** | **remarque — fenêtres précédentes fermées, famille encore ouverte par le danger 1 ci-dessus.** [drop():381](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:381) conserve la surveillance après l’arrêt PC. [2-D1:302](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-socket.test.js:302) joue réellement 30 rapports `Jog`, les annulations répétées puis `M5`. [3-D1:401](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-socket.test.js:401) reproduit bien arrêt PC → Arrêter tablette. |
| **Troisième tour, 2 — nouveau mouvement pendant la surveillance résiduelle** | **remarque — fenêtre exacte fermée.** [available():836](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/job-service.js:836) bloque effectivement la tablette. [3-D2:421](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-socket.test.js:421) teste avant le premier `Jog`, pendant celui-ci et après un seul `Idle`, puis vérifie la libération. Le transfert à Arrêter reste défectueux. |
| **2 — départ du déplacement relatif** | **remarque — fermé.** [before():685](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:685) recontrôle position et course après l’attente. [D2:889](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:889) déplace réellement Z pendant l’absence du flux et exige zéro `$J=`. |
| **3 — broche arrêtée, perte oubliée, reprise depuis `held`** | **remarque — fenêtres signalées fermées.** [spindleWant/setpointLost:624](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:624) couvre maintenant le chemin sans redémarrage F2. Les tests `2-D3a-e` et [3-D3:1437](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1437) jouent effectivement zéro, absence de FS, rétablissement ultérieur, changement modal et passage par `held`. Le danger 2 ci-dessus reste une autre voie de connaissance du sens. |
| **Troisième tour, 4 — consigne S incompatible** | **remarque — fermé pour les changements rapportés par `$G` et `Ov:`.** [modal():1499](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:1499) mémorise la perte ; [3-D4:1513](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1513) joue S1 pendant l’attente du flux, `3-D4b` pendant l’approche, `3-D4c` les corrections de broche. |
| **4 — zéro modifié adopté comme référence** | **remarque — fermé dans les fenêtres signalées.** Référence prise [avant la demande:1059](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:1059), comparaisons permanentes ensuite. [2-D4:1319](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1319) change réellement le WCO entre les deux `Idle` et pendant `Run`. |
| **Troisième tour — WCO reçu au début du dernier Jog** | **remarque — correction et nouvelle preuve pertinentes.** [La borne:778](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:778) exclut désormais ce rapport. [3-D4d:1596](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1596) joue exactement cette variante : pas de `~` avant un WCO au repos. L’ancien intitulé `2-D4b` reste imprécis, mais la lacune demandée est comblée. |
| **5 — permanence Alarm/Restart** | **remarque — fermé.** [fail():435](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:435) interdit le retour vers `held`. [2-D5:1167](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1167) joue l’événement avant toute écriture, puis une nouvelle origine aux mêmes valeurs : refus permanent. |
| **6 — annulations Socket.IO suivies d’une descente** | **remarque — fermé pour les entrées recensées.** La façade prévient F2 avant transmission. [Les tests Socket:204](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-socket.test.js:204) traversent réellement façade et contrôleur ; `2-D1` parcourt également les listes de commandes sûres. |
| **7 — reprise finale sans flux** | **remarque — fermé.** [R6:1285](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:1285) attend le bon flux puis refait les contrôles. [D7/D7b:990](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:990) ferment effectivement le flux depuis `parked` et `held`. |
| **8 — coordonnées anciennes et faux refus définitif** | **remarque — corrigé.** [settled():567](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/pause-retract.js:567) attend des coordonnées explicites. D8/D8b utilisent le vrai parseur ; [2-D8:1379](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1379) vérifie la poursuite après le rapport sans XYZ intercalaire. |
| **9 — preuves défectueuses** | **remarque — réparées.** [D9:1087](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract.test.js:1087) conserve uniquement B/B2 ; les quatre phases Socket manquantes sont couvertes par `2-D9`. [Le test de page:153](/C:/Users/damou/Documents/claude/cncjs-wt/F2/examples/cncjs-touch/test-pause-retract.cjs:153) provoque réellement la perte du flux et vérifie les POST. |
| **10 — trajectoire LUNYEE** | **remarque — preuve simulée complétée.** [Le parcours:191](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/__tests__/pause-retract-lunyee.test.js:191) compare machine/interpréteur à `~`, premier bloc repris et tous les blocs. Les trois injections de désynchronisation rendent le témoin discriminant. |

**À corriger — la portée annoncée de la table dépasse ses assertions.** [SURETE.md:229](/C:/Users/damou/Documents/claude/cncjs-wt/F2/examples/cncjs-touch/design/refonte/SURETE.md:229) annonce notamment l’absence de mouvement tablette tant que F2 peut bouger. Les 182 cas appliquent chacun un événement isolé ; ils ne couvrent pas l’enchaînement `stop → act` démontré dangereux. Ajouter l’état « arrêt en cours », les transitions correspondantes et les rapports de sens explicites ; restreindre les garanties documentaires aux preuves effectivement obtenues.

**Remarque — les autres réserves sont correctement distinguées.** `2-D1b` couvre maintenant le repos après plus de six secondes et l’absence de reset inutile. Le titre D1 mentionne bien l’échéance de cinq secondes. En revanche, [halt.js:89](/C:/Users/damou/Documents/claude/cncjs-wt/F2/src/server/services/touch/halt.js:89) conserve le reset malgré `Jog` à cette échéance : c’est une politique d’escalade documentée, pas une fenêtre supprimée. Les refus conservateurs concernant les corrections et l’hypothèse `Ov=100` sont explicites ; aucun autre faux refus certain n’a été établi.

Les deux contre-exemples ont été exécutés en mémoire, écritures disque bloquées. Le test de page passe. Les suites Jest complètes n’ont pas été relancées ; leurs résultats annoncés ne sont donc pas repris comme vérification personnelle. Arbre Git propre, aucune validation physique revendiquée.

VERDICT : à ne pas installer — dangers restants : nouveau jog autorisé pendant l’arrêt F2 ; plongée autorisée malgré un sens de broche contraire explicitement rapporté.
