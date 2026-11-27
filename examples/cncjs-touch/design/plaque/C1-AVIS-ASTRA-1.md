# C1 — contre-avis de sûreté n° 1 (Astra, lecture seule, 2026-11-26)

**La conception doit être revue avant de coder.** Le principe positionnel ferme bien la contre-séquence « Idle Z haut explicite, descente extérieure invisible, puis Idle sans coordonnées ». Mais les raccordements proposés ne ferment pas encore les deux défauts sur tous les parcours et introduiraient certains faux arrêts.

Relecture de `feat/C1`, HEAD `23df2a58`, sans modification de fichier ni contact avec la machine. Quelques cas ont été rejoués en mémoire avec le vrai parseur ; aucune validation du futur code C1 n’est revendiquée.

1. **danger — La couverture de broche reste incomplète pendant les séquences.**  
   [C1-CONCEPTION.md:99](examples/cncjs-touch/design/plaque/C1-CONCEPTION.md:99), lignes 100, 109–113 et 122–123 ; `plate-probe.js:345`, `block-probe.js:656`.

   Les tableaux laser, plaque et bloc ne raccordent pas explicitement toutes les protections définies au §2.6. Pour les palpages, position fraîche et `spinHints` inchangé peuvent rester vrais alors que `FS:` a disparu durablement. L’attente positionnelle après `quiet` ne prouve pas l’arrêt de broche.

   **Avant le code :** compléter une matrice « départ / pendant une ligne / avant la suivante », avec les appels exacts à `spindleRefusal`, `spindleStopCause` et `spindleHeld`. Préciser aussi la surveillance pendant un grand pas et un maintien continu, actuellement absente. Conserver explicitement l’exception voulue des petits pas. Tester la disparition de `FS:` **seule**, avec XYZ frais, modal M5 et aucun indice positif susceptible de masquer le garde testé.

2. **danger — Aucun `FS:` observé ne signifie pas firmware sans `FS:`.**  
   [C1-CONCEPTION.md:121](examples/cncjs-touch/design/plaque/C1-CONCEPTION.md:121), également lignes 19 et 162–163.

   Après connexion ou bannière, une LUNYEE envoyant uniquement `FS:0`, `FS:0,` ou aucun `FS:` conserve `r.fs === null`. Le repli proposé autorise alors le départ sur le seul `$G M5`. La vitesse inconnue échappe donc à R-3. T7/T8 commencent après un premier FS valide et ne couvrent pas cette ouverture.

   **Avant le code :** exiger un FS complet sur la cible LUNYEE. Une éventuelle compatibilité avec une carte sans FS doit être identifiée explicitement, jamais déduite de son silence. Ajouter les trois variantes dès le démarrage et après bannière.

3. **danger — Une garde de mouvement est oubliée : les macros.**  
   [job-service.js:1176](src/server/services/touch/job-service.js:1176) ; `C1-CONCEPTION.md:127–133`.

   `macroReady` conserve `spindleStill`, donc son acceptation de `M3 S0` lorsque la vitesse fusionnée vaut zéro. Une macro peut déplacer les axes ; elle n’apparaît pas dans l’inventaire ni dans les exclusions. La prise d’origine (`job-service.js:1306`) et le départ de programme (`:1003`) conservent également ce lecteur, mais sont explicitement exclus.

   **Avant le code :** ajouter les macros et leur garde strict de départ. Pour annoncer une fermeture sur **tous** les mouvements Touch, traiter aussi les autres gardes de départ concernés ; sinon nommer précisément les parcours encore exposés. Cela ne demande pas de refondre la surveillance des programmes ni d’exiger une position déjà référencée avant `$H`.

4. **danger — Le bloc peut envoyer une ligne après avoir perdu la preuve positionnelle.**  
   [block-probe.js:735](src/server/services/touch/block-probe.js:735), lignes 740–744, 768 et 873 ; `C1-CONCEPTION.md:111–113`.

   `send` reçoit une ligne déjà calculée, puis peut attendre le retour du flux. Après cette attente, `ensure()` refait seulement le verdict de surveillance. Selon C1, un ancien `r.pos` de moins de 2,5 s suffit encore à ce verdict, même si le dernier rapport ne contient plus de coordonnées. La ligne peut donc partir malgré la perte de preuve survenue pendant l’attente.

   **Avant le code :** revérifier position, repos et broche immédiatement avant l’écriture, après toute attente. Si la position a changé, revalider les hypothèses du trajet déjà calculé ou abandonner. Ajouter le scénario « flux absent, rapport sans coordonnées, flux revenu avant la fin de grâce ».

5. **à corriger avant le code — L’adaptateur de broche strict provoquerait des arrêts intempestifs.**  
   [C1-CONCEPTION.md:125](examples/cncjs-touch/design/plaque/C1-CONCEPTION.md:125) ; `job-service.js:1474`, `motion.js:1005`.

   L’adaptateur `spindleOn` n’est pas utilisé uniquement au départ : `cncStop` l’appelle pendant le cadrage. Le remplacer par « ancien garde OU `spindleRefusal` » ferait annuler dès un rapport isolé sans FS, ou dès qu’un `$G` dépasse 2,5 s pendant un Jog. Ajouter `spindleStopCause` **en plus** ne neutralise pas ce refus.

   **Correction :** séparer les fonctions injectées pour le départ et la surveillance. Tester un Jog prolongé avec FS complets mais sans nouveau `$G`, puis un rapport isolé sans FS. Ces cas doivent respecter la tolérance annoncée.

6. **à corriger avant le code — Une lecture proposée peut casser l’instantané de l’interface.**  
   [motion.js:1501](src/server/services/touch/motion.js:1501), ligne 1504 ; `C1-CONCEPTION.md:75–77`.

   `continuousReason` est aussi appelé par `snapshot`, après le seul `jogReady`. Le nouveau `restedSince` prévu dans `start` n’a donc pas nécessairement été exécuté. Lire directement `provenPos(r).m` peut lever une exception sur `null`, au lieu de publier un refus et un instantané exploitable.

   **Correction :** rendre ce lecteur sûr en absence de position, et aligner `canJog`/`jogReason` sur les nouvelles conditions de départ. Exiger un instantané complet et des voies Pause/Arrêter utilisables lorsque les coordonnées manquent.

7. **à corriger avant le code — Les preuves doivent être strictement positives.**  
   [C1-CONCEPTION.md:31](examples/cncjs-touch/design/plaque/C1-CONCEPTION.md:31), lignes 33 et 121 ; `GrblLineParserResultStatus.js:28`, `:121`.

   Le vrai parseur accepte notamment :
   
   - `MPos:1,2,3foo` comme XYZ `1,2,3` ;
   - `FS:0,` comme vitesse zéro ;
   - `FS:0,-1` comme vitesse négative ;
   - un `[GC:]` sans mode de broche, ou avec plusieurs modes de broche.

   **Correction :** valider les champs bruts entiers et leurs délimiteurs ; exiger une vitesse explicitement égale à zéro et un mode unique explicitement égal à `M5`. « Pas supérieur à zéro » et « ni M3 ni M4 » ne suffisent pas. Ajouter ces cas au banc, sans modifier le parseur global.

8. **à corriger avant le code — Les délais restent trop affirmatifs.**  
   [C1-CONCEPTION.md:146](examples/cncjs-touch/design/plaque/C1-CONCEPTION.md:146), également lignes 9, 51–54 et 142–147 ; `GrblController.js:885–895`, `:921–942`.

   Les 250/500 ms sont des cadences nominales d’interrogation, pas des délais garantis de réponse. Un `?` sans réponse bloque les interrogations suivantes jusqu’au mécanisme de reprise à 5 s ; un échange `$G` perdu peut attendre 10 s. De plus, C1 demande un nouveau GC après **chaque ligne**, pas seulement après M5 : « 0,5 s au plus par cadrage » n’en découle pas.

   **Correction :** présenter 250/500 ms comme ordres de grandeur, 2,5 s comme seuil logiciel contrôlé au prochain passage du superviseur, et mesurer les attentes réelles. Fixer l’échéance effective comme le minimum entre la nouvelle attente et la borne absolue de ligne. Conserver la limite correctement reconnue sur la suspension de la Surface.

9. **à corriger avant le code — Plusieurs mutations ne prouvent pas le garde annoncé.**  
   [C1-CONCEPTION.md:176](examples/cncjs-touch/design/plaque/C1-CONCEPTION.md:176), jusqu’à la ligne 190.

   | Mutation | Problème | Correction |
   |---|---|---|
   | M2/M3 avec T1 | Sans `restedSince`, `provenPos` reste nul : une exception peut encore empêcher toute écriture. | Position explicite fraîche, mais repos insuffisant : Jog puis un seul Idle. |
   | M4 avec T2 | Le plan reste refusé par son `restedSince`. | Reconnaître la redondance ou isoler le calcul du plan. |
   | M5 avec T4 | `holdReason` exige encore une position prouvée ; l’absence de X/Y ne distingue pas cette attente. | Dernière position valide, mais nombre insuffisant d’Idle postérieurs à l’`ok`. |
   | M6 avec T4b | La disponibilité de position et `arrivalOff` peuvent bloquer avant la seule lecture de hauteur. | Définir exactement le garde muté ; isoler la hauteur avec le cas `−5,005 → −5,054`. |
   | M19/M22 avec T13 | Les lecteurs de position nulle peuvent arrêter indépendamment de l’attente supprimée. | Ajouter les cas de mauvais comptage avec coordonnées explicites. |

   Une exception JavaScript ou un refus indépendant ne démontre pas la protection visée. La règle sur les mutants survivants est bonne ; les promesses de discrimination doivent être corrigées maintenant.

10. **à vérifier au code — Le vrai parseur est nécessaire, les vrais échanges d’acquittement aussi.**  
    [C1-CONCEPTION.md:152](examples/cncjs-touch/design/plaque/C1-CONCEPTION.md:152) ; `plate-probe.js:220–230`, `__tests__/support/sim-bridge.js:96–100`.

    Le pont existant retire les `ok` des `$G`. Or C1 doit mesurer le compteur modal à l’`ok` de **sa propre ligne**.

    **Exigence :** injecter des échanges complets `[GC:…]` puis `ok`, y compris un échange déjà en vol à l’installation du tracker, ainsi que pertes et retards. Vérifier la distinction des acquittements, des cadences réalistes et les scénarios à 1 Hz. Inclure des parcours avec la vraie preuve D2, pas seulement une preuve simulée acquise.

11. **à vérifier au code — Modifier les dix-sept bancs est acceptable, mais conserver les `expect` ne suffit pas.**  
    [C1-CONCEPTION.md:196](examples/cncjs-touch/design/plaque/C1-CONCEPTION.md:196).

    Un helper qui ajoute silencieusement `FS:0,0`, M5, deux Idle ou du temps supplémentaire peut rendre les tests verts en supprimant leur scénario.

    **Contrôle demandé :** isoler la conversion des bancs, la vérifier sur l’ancien code, puis comparer les traces et chronologies. Préserver une entrée par lignes brutes pour les omissions volontaires. Examiner chaque changement d’assertion **et** de rapports, d’ordre ou de temporisation. Les tests négatifs C1 doivent échouer sur l’ancien code avec ce même banc.

12. **à vérifier au code — Préserver les arrêts et distinguer absence de preuve et écart constaté.**  
    [plate-probe.js:487](src/server/services/touch/plate-probe.js:487) ; `block-probe.js:589`, `halt.js:33–99`, `work-offset.js:348–355`.

    Le routage prévu des palpages vers `stop`/`abort`, puis `halt`, est approprié. **Aucun `0x85` ne doit être ajouté pour arrêter un G38.** Les nouvelles attentes doivent rester annulables, conserver les réservations nécessaires et ne jamais envoyer une ligne après une résolution tardive.

    Tester Pause/Arrêter sans la main, données absentes, pendant G38 et pendant la nouvelle attente, puis bannière et fermeture du service. Aucun garde position/broche ne doit conditionner l’accès aux arrêts.

    Pour le cadrage, une position absente ne doit pas invalider D2 comme si un déplacement était constaté ; une position réellement discordante doit continuer à l’invalider. Un WCO explicite différent doit toujours être traité, même dans un rapport sans XYZ.

13. **remarque — Le lieu de collecte et le compteur sont bien choisis, avec deux précisions documentaires.**  
    [GrblRunner.js:110](src/server/controllers/Grbl/GrblRunner.js:110), lignes 119–124 ; `C1-CONCEPTION.md:25`, `:32`, `:42`, `:115`.

    `payload.raw` est conservé et la charge émise n’hérite pas des anciennes positions absentes. Toutefois, l’événement est émis **après** la fusion de `runner.state` : il faut lire la charge, pas cet état. MPos/WPos calculé avec le dernier WCO reste une donnée dérivée, pas une preuve indépendante du décalage.

    Le compteur remis à zéro sur un rapport non positionnel ou non Idle ferme bien les deux contre-séquences discutées. Enfin, l’affirmation sur `[PRB:]` vaut pour le bloc ; la plaque lit ses positions après palpage dans les rapports d’état (`plate-probe.js:399–410`).

Ces corrections permettent de conserver un lot ciblé, puis une relecture du code et un essai depuis le kiosque, table dégagée et fraise en l’air. Les refus inexpliqués doivent être relevés avant d’élargir l’essai.

VERDICT : à revoir
