Audit de `feat/touch-profiles` à **`cbde7cee`**, sur les deux plages demandées et le renouvellement introduit par `e59d11f9`. **9 défauts confirmés** ci-dessous.

Les chemins `touch/…` sont relatifs à `examples/cncjs-touch/`. Les reproductions supplémentaires ont été exécutées en mémoire, sans réseau. Aucun fichier écrit par cet audit, aucun navigateur lancé, aucune commande machine ni aucun commit.

**D-1 — sécurité machine — La correction `$23` laisse le serveur valider une trajectoire hors course.**

- **Entrée :** Grbl standard référencé, rapports en mm, G54, `$23=1`, `$130=300`, `$131=200`, `$132=80`, `$20=0`. Position machine `(-100,-100,-40)`, position travail `(0,0,0)`. Programme :
  ```gcode
  G21 G90 G54
  G0 X110 Y0 Z0
  G1 X120 Y10 F500
  ```
- **Sortie fausse :** le serveur retourne `validated`, avec X machine `+10…+20` et course supposée `0…300`. Le dialogue affiche **« dans la course »**. La tablette retourne pourtant `unknown`. La convention Grbl standard documentée dans la spécification est `−300…0`.
- **Chemin exact :** `src/server/services/touch/job-service.js:1530` → `src/server/services/touch/program-check.js:564` → `program-check.js:580` → `program-check.js:590` → `touch/job-controls.js:512` → `touch/program-check-view.js:34`. Le contrôle tablette corrigé à `touch/travel-check.js:25` est masqué par `touch/job-controls.js:515`.
- **Conséquence supplémentaire :** le cadrage laser utilise ce même verdict : `job-service.js:1265` → `job-service.js:1266` → `job-service.js:1308` → `job-service.js:1391` → `src/server/services/touch/motion.js:843` → `motion.js:324`. Les coordonnées du cadrage ne sont pas recomparées à une autre enveloppe dans ce chemin.
- **Preuve :** reproduction en mémoire : `server="validated"`, `client="unknown"`, `machineMin=10`, `machineMax=20`. Le cas inverse, X machine `−100…−90`, est faussement déclaré hors course.
- **Correction proposée :** appliquer côté serveur la politique documentée d’incertitude sur les axes concernés par `$23`, puis conserver le refus du cadrage lorsque X/Y ne sont pas vérifiés.
- **Origine :** défaut ancien, introduit par **`a00b356a`** ; correction **`cbde7cee` incomplète**, limitée à la tablette.

**D-2 — à corriger — L’origine visuelle peut utiliser l’aperçu d’une ancienne version du programme chargé.**

- **Entrée :** Suivi a affiché `part.nc`, révision R1, empreinte F1, limites `[0,0,10,10]`. Dans Préparer, un autre client charge le même nom, révision R2, empreinte F2, limites `[0,0,200,200]`. Position machine X/Y `−100`, course `−400…0`.
- **Sortie fausse :** la carte conserve le petit parcours F1 et annonce « dans la course » pour le placement proposé, alors que F2 dépasserait jusqu’à `+100`.
- **Chemin exact :** `touch/job-dashboard.js:297` → `touch/origin-preview.js:220` → `origin-preview.js:184` → `origin-preview.js:136` → `job-dashboard.js:450` → `origin-preview.js:134` → `origin-preview.js:187` → `origin-preview.js:45` → `touch/travel-check.js:30` → `origin-preview.js:193`.
- **Preuve :** `{"loaded":"sha256:new","returned":"sha256:old","bounds":[0,0,10,10],"extraRequests":0}`. `loadedPreview()` ne compare ici que le nom. L’avertissement d’identité de `touch/job-controls.js:248` ne retire pas `img.cncPreview`.
- **Correction proposée :** vérifier l’empreinte et l’identité du programme dans la réutilisation de l’image comme dans la réponse asynchrone ; invalider l’aperçu lors du changement de révision.
- **Origine :** régression de **`7ae62329`**, rendue visible par le consommateur ajouté dans **`43a0fccf`**.

**D-3 — à corriger — Une coupure pendant la lecture peut conserver définitivement une promesse d’aperçu résolue à `null`.**

- **Entrée :** Préparer demande l’aperçu de `part.nc/R1`. Le suivi disparaît, donc `machine=null`. La réponse d’aperçu valide arrive avant le rétablissement du même programme.
- **Sortie fausse :** les demandes suivantes retournent `null` sans nouvelle lecture ; la carte demande de régénérer un aperçu pourtant valide. Un aller-retour Menu → Préparer ne répare pas le cache.
- **Chemin exact :** `touch/job-controls.js:287` → `job-controls.js:325` → `touch/job-dashboard.js:297` → réponse `job-dashboard.js:459` → `job-dashboard.js:458` → après rétablissement, `job-dashboard.js:452` → `touch/origin-preview.js:134` → `origin-preview.js:186`.
- **Preuve :** première résolution `null`, puis après reconnexion `null`, avec **0 requête supplémentaire**. À la ligne 458, `meta` existe donc le cache reste, mais la promesse renvoie `null` parce que `machine` manque.
- **Correction proposée :** supprimer le cache lorsque le résultat effectivement retourné est nul ; permettre à la carte de redemander après rétablissement.
- **Origine :** régression de **`7ae62329`**. Une lecture réussie dans Suivi ou une invalidation explicite peut contourner le problème.

**D-4 — à corriger — Consulter un autre fichier efface la géométrie complète du programme en cours.**

- **Entrée :** A est chargé et sa géométrie complète a été obtenue au repos. Démarrer A, consulter B dans Fichiers sans le charger, puis revenir sur Suivi.
- **Sortie fausse :** A revient en géométrie simplifiée et ne peut plus récupérer sa géométrie complète pendant le travail.
- **Chemin exact :** `touch/preview-3d.js:118` ouvre B → `touch/preview-gl.js:906` → `preview-gl.js:911` → `preview-gl.js:425` efface A → retour sur A, `preview-3d.js:118` passe `fullGeometry:false` → `preview-gl.js:913` empêche sa reconstruction.
- **Preuve :** séquence reproduite : `A repos = full` → `consultation B = simplified` → `retour A pendant travail = simplified`.
- **Correction proposée :** invalider sur le changement du **programme chargé**, en distinguant celui-ci du fichier simplement consulté. C’est la conservation prévue par Q7, `PERFORMANCE-UI-SPEC.md:661`.
- **Origine :** régression de **`cbde7cee`**, dans la nouvelle invalidation du cache.

**D-5 — à corriger — Un appui sur la vue 3D pendant un travail lit tout le G-code pour une inspection masquée.**

- **Entrée :** CNC en Performance GPU, Suivi pendant `running`, aucune source d’inspection déjà chargée ; appui bref sur un segment.
- **Sortie fausse :** émission d’un `POST /api/watch/file` contenant `{"file":"live.nc"}` pendant le travail. Le panneau qui recevrait le résultat est masqué en vue inline par `touch/preview-advanced.css:44`.
- **Chemin exact :** `touch/preview-3d.js:89` → `preview-3d.js:118` → `touch/preview-gl.js:727` → `preview-gl.js:744` → `preview-gl.js:760` → `preview-gl.js:762` → `touch/preview-inspect.js:309` → `preview-inspect.js:287` → `preview-inspect.js:263` → `preview-inspect.js:272`.
- **Preuve :** événements tactiles exécutés en mémoire, XHR remplacé par un enregistreur : `workflow="running"`, requête complète de `live.nc` observée. Aucun réseau réel.
- **Correction proposée :** désactiver l’inspection inline sans restitution visible, garder toute lecture de source derrière une condition de repos et rendre cette lecture annulable au démarrage. Actuellement, `preview-gl.js:854` annule uniquement la lecture de géométrie complète.
- **Origine :** nouveau chemin introduit par **`d4d1b21e`**, qui maintient la vue inline pendant le travail. Il contrevient à Q7 : aucune lecture du programme pendant un travail.

**D-6 — à corriger — Sans aperçu, les instruments affichent une ligne acquittée incorrecte lors d’une reprise.**

- **Entrée :** fichier original de 1 000 lignes, reprise à la ligne 801, préambule de 6 lignes ; `total=206`, `received=7`, `resume={from:801,total:1000,preambleLength:6}`, aperçu absent.
- **Sortie fausse :** **« Ligne acquittée 206 / 206 »**, avec progression voisine à **3 %**. La valeur attendue est **801 / 1 000**.
- **Chemin exact :** `src/server/services/touch/job-load.js:202` → `src/server/services/touch/job-service.js:1123` → `touch/job-dashboard.js:297` → `job-dashboard.js:291` → `job-dashboard.js:409` → `job-dashboard.js:387` → `touch/tool-position.js:38` → `job-dashboard.js:410`.
- **Preuve :** reproduction avec le module et le fixture large existants. Le calcul devient `min(206, 800 + (7−6)) = 206`.
- **Correction proposée :** utiliser `resume.total` comme total original lorsque l’aperçu manque, afin de conserver la même numérotation au numérateur et au dénominateur.
- **Origine :** régression de **`d08bf3f3`**.

**D-7 — à corriger — Une réponse de renouvellement retardée peut rétablir l’identité du précédent utilisateur.**

- **Entrée :** Touch lance `/signin` avec le jeton d’Alice. Avant la réponse, un autre onglet CNCjs connecte Bob et enregistre son jeton. La réponse initiale retourne le jeton inchangé d’Alice.
- **Sortie fausse :** `localStorage.cnc.state.session` redevient Alice ; les prochaines requêtes de Touch utilisent son identité.
- **Chemin exact :** `touch/app.js:70` → `app.js:61` ; connexion concurrente : `src/app/lib/user.js:12` → `src/app/lib/user.js:16` → `src/app/store/index.js:55` ; réponse initiale : `src/server/api/api.users.js:132` → `touch/app.js:51` → `app.js:56` → `touch/job-controls.js:81` → `job-controls.js:149`.
- **Preuve :** reproduction en mémoire : requête `A-token`, session remplacée par `Bob/B-token`, puis session finale `Alice/A-token`.
- **Correction proposée :** capturer la session au départ et ignorer la réponse si elle a changé entre-temps. Comparer également le jeton reçu à celui envoyé.
- **Origine :** régression de **`e59d11f9`**.

**D-8 — à corriger — Le garde de rechargement peut laisser l’affichage non initialisé malgré une session renouvelée.**

- **Entrée :** aucun jeton au chargement, mais `cnc-touch-renewed` date de moins de 60 secondes ; `/signin` réussit. Cela arrive notamment après suppression du jeton et rechargement dans la minute du renouvellement précédent.
- **Sortie fausse :** le jeton valide est enregistré, mais le badge reste « authentification requise » et les coordonnées gérées par `app.js` ne s’actualisent pas.
- **Chemin exact :** `touch/app.js:70` → `app.js:73` → sortie `app.js:76` ; réponse `app.js:56` → `app.js:58` → abandon `app.js:66`. L’abonnement de `app.js:142` n’est jamais installé ; l’intervalle de `app.js:71` ne le rétablit pas.
- **Preuve :** `token="fresh"`, `reloads=0`, `subscriptions=0`, `cncConnection` absent, badge d’authentification toujours présent.
- **Correction proposée :** terminer l’initialisation après obtention du jeton, ou différer le rechargement jusqu’à l’expiration du garde.
- **Origine :** défaut introduit avec le renouvellement de **`e59d11f9`**.

**D-9 — mineur — La nouvelle carte d’origine laisse certaines raisons de refus en français en EN/ES.**

- **Entrée :** interface anglaise ou espagnole, état frais, `$22=1`, `$23=0`, aperçu valide, `$130` absent.
- **Sortie fausse :** `Travel cannot be checked: course $130 inconnue.` ou `Recorrido no comprobable: course $130 inconnue.`.
- **Chemin exact :** `touch/origin-preview.js:101` → `origin-preview.js:45` → `touch/travel-check.js:72` → `travel-check.js:28` → `touch/i18n.js:10` → `i18n.js:11` conserve la phrase inconnue → `origin-preview.js:55` → `origin-preview.js:161`.
- **Preuve :** ces deux textes ont été reproduits avec les vrais catalogues.
- **Correction proposée :** utiliser une traduction paramétrée du réglage manquant, ou des clés explicites pour `$130/$131`.
- **Origine :** lacune ancienne de `check()`, désormais exposée dans la carte ajoutée par **`43a0fccf`** ; même construction ajoutée dans `travelBox()` par **`67f6a4cf`**.

**Soupçons non prouvés**

- **Suffixe `tablet-profile.js?v=prof14` inchangé :** incohérence réelle avec `ADVANCED_VERSION='perfui2'`, mais aucun mélange de versions démontré. Les routes statiques intégrées et les montages locaux examinés utilisent `maxAge:0`. Un cache tiers conservant une ancienne réponse reste à établir.
- **Repli du renderer GPU :** si le nouveau renderer échoue mais que l’ancien renderer WebGL fonctionne, `touch/preview-gl.js:542` peut désactiver le mode direct tandis que `state().gpu`, à `:1089`, reste vrai. `touch/tool-position.js:91` pourrait alors masquer le repère DOM sans remplacement. Déclencheur réel de cet échec non établi.
- **Ancien programme figé dans Préparer :** `touch/origin-preview.js:171` traite l’état périmé avant le changement d’identité à `:182`. La conservation de la dernière vue figée étant documentée, ce cas n’est pas compté comme défaut.
- **Rotation, DPR 1,58 et coût réel GPU/Chromium 106 :** aucune conclusion de non-régression physique sans navigateur ni tablette.

**Vérifié sans défaut démontré**

- **Contrôles hors ligne : 120/120 réussis.** Exécution de `verify-project.cjs` avec exclusion uniquement en mémoire de `test-bundle.cjs`, qui écrit des fichiers temporaires. Ce résultat ne constitue donc pas une passe complète 121/121.
- **77 scripts validés en ES2017** par `compileCheck()`, sans génération de bundle. Jest non lancé.
- **RT en rendu logiciel :** comparaison de `59129a0c` et HEAD dans le même harnais, parcours de 6 000 segments, WebGL absent : DPR effectif **1,5** identique ; mêmes compteurs au repos (**6 003 `lineTo`, 6 `stroke`**), aucun dessin supplémentaire à 16 ms, mêmes compteurs à 34 ms (**7 206 / 12**). Regroupement des couleurs, décimation et cadence conservés dans ce scénario simulé.
- **`arrange()` :** conservation des nœuds et gestionnaires, restitution de l’ordre large/compact et trois/deux zones ; l’événement `cnc-layout-change` rattrape l’ancienne valeur éventuellement lue au premier callback `resize`.
- **Géométrie complète :** sa lecture en vol est annulée à réception de `running` ou `paused`. Cette protection ne couvre pas l’inspection de D-5.
- **Origine visuelle :** portes Éco/laser/simulation/hors poste large respectées ; carte conservée et vue suspendue pendant travail/pause/alarme conformément à la décision documentée.
- **Flux sans jeton, `59129a0c` :** aucune requête ; reprise au contrôle suivant après apparition du jeton.
- **Autres changements :** remplacements du signe « + » cohérents avec les catalogues ; filtrage des températures compatible avec le tableau vide ; chargeur avancé toujours refusé en Éco.

