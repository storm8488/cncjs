# PLAN-CORRECTIONS — chantier A (phase 2, 2026-11-15)

Auteur : agent « plan des corrections ». Base : `feat/refonte-ui`, HEAD `20aeac36`. Ce document, le prompt de mission (`../PROMPT-REFONTE-UI.md`) et le code suffisent à un agent correcteur. Les identifiants `C-xx` renvoient à `CONSTATS.md`.

Les numéros de ligne cités sont ceux de `20aeac36` : revérifie-les avant d'éditer.

## 0. Règles pour tous les lots

1. Un seul agent écrit dans le dépôt à la fois. Ordre : S1, S2, S3, S4, S5, S6, puis P1, P2, P3. S5 et S6 peuvent être confiés au même agent ; P2 et P3 aussi.
2. Les lots S n'écrivent que dans `src/server/**` et `grbl-simulator/**`. Seule exception : les lignes FR / EN / ES des codes et des phrases nouvelles, dans les tables i18n de la page (`examples/cncjs-touch/touch/i18n-messages*.js`), dans le même commit que le code qui les émet. Toute phrase nouvelle du serveur, avec ou sans code, a sa ligne : `test-server-messages.cjs` et `S/touch-codes-catalog.js` le contrôlent.
3. Les lots P n'écrivent que dans `examples/cncjs-touch/**`.
4. À la fin de chaque commit : `node examples/cncjs-touch/verify-project.cjs` (181/181, ou plus) et la suite Jest (`npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false`) sont verts. Les tests de preuve `bughunt-A*`, `bughunt-V*` d'un lot ultérieur restent rouges : exclus-les par `--testPathIgnorePatterns="bughunt-[AV][0-9]"` et dis-le.
5. Chaque correction a un test qui échoue sans elle. Le test de preuve cité est converti en test durable au nom normal (ou supprimé s'il fait double emploi), dans le commit qui corrige. Aucune assertion d'un test existant n'est retirée sans être nommée dans le message de commit.
6. On ne retire aucun garde-fou. Tout changement de ce qu'une commande machine envoie, ou d'un de ses gardes, figure au § 5 : l'orchestrateur en fait `SURETE.md`. Si ta correction change autre chose que ce que le § 5 annonce, arrête-toi et dis-le.
7. Aucune dépendance nouvelle. Messages de commit en anglais, préfixe `touch:`, un commit par décision D1 à D4 et un par thème sinon. `git add <chemins>` seulement.
8. Un point de ce plan qui se révèle faux à la lecture du code : choisis le comportement qui refuse ou qui arrête, et écris l'écart dans ton compte rendu.

---

## 1. Conception des décisions

### 1.1 D2 — Le décalage de travail est prouvé avant tout ce qui en dépend

D2 est décrit avant D1 parce que D1 en dépend.

**Faits.** Après toute prise d'origine, la carte rapporte `WCO:0,0,0` alors que `$#` contient toujours le G54. `G54` seul ne change rien ; `G55` puis `G54` recharge ; un `G10` sur le repère actif recharge. On ne sait pas si le décalage exécuté est nul lui aussi (essai E-B). Le champ `WCO:` ne vient qu'un rapport sur dix, et au rapport qui suit un changement de décalage (code amont, non confirmé sur le binaire).

**Module.** Nouveau fichier `src/server/services/touch/work-offset.js` (`createWorkOffset(deps)`), un état `r.offset` par contrôleur. `createService` le reçoit par `options.workOffset` (une fabrique) ; par défaut, la vraie.

**États.** `unknown` (à vérifier, en attente des conditions), `checking` (transaction en cours), `proven`, `failed`.

**« Prouvé » veut dire, tout à la fois :**
1. une réponse complète à `$#` (l'entrée du repère actif, `G92`, `TLO`, puis `ok`), lue dans la transaction en cours ;
2. un état modal `$G` récent qui donne le repère actif (G54 à G59) ;
3. un rapport d'état au repos qui porte **explicitement** le champ `WCO:`, reçu **après** l'`ok` de la dernière ligne de la transaction (`r.wcoAt`, `job-service.js:298-301`) ;
4. pour X, Y et Z : `|WCO − ($#[repère actif] + G92 + TLO sur Z)| ≤ 0,0025` dans l'unité des rapports (`$13=0` : mm ; `$13=1` : pouces, tolérance 0,00025). `$13` inconnu : pas de preuve.

**Transaction** (lignes envoyées une à la fois par `c.command('gcode', ligne)`, suivies par `answers()` et `quiet()` de `plate-probe.js` : `ok` puis deux rapports au repos) :

| Étape | Écrit sur le port | Attente bornée | Suite |
|---|---|---|---|
| 1. Lire | `$#` | 3 s | paramètres incomplets, `error:N` ou délai → `failed` (détail `no-answer`) |
| 2. Comparer | rien | un rapport avec `WCO:` postérieur à l'`ok`, 5 s au plus | égal → `proven` ; pas de rapport → `failed` (`no-report`) ; différent → étape 3 |
| 3. Recharger | `<autre repère>` puis `<repère actif>` (actif G54 : `G55` puis `G54` ; sinon `G54` puis l'actif), sans aucun mot d'axe | 3 s par ligne | interruption → `unknown`, avec `restore = <repère actif>` |
| 4. Prouver | rien | un `$G` postérieur au second `ok` qui dit le repère actif (3 s), puis un rapport avec `WCO:` postérieur (5 s) | égal → `proven` avec `reloaded: true`, entrée au journal ; différent → `failed` avec `ETOUCH_OFFSET_MISMATCH` |

- Le rechargement n'a lieu qu'une fois par transaction. Aucun `G10` n'est jamais envoyé pour recharger : il réécrirait l'origine.
- Effets du rechargement : seul le groupe modal « repère » change, puis revient. Mode de mouvement, avance, unités, distance, plan, broche, arrosage, `G92` et décalage d'outil sont inchangés. Rien n'est écrit dans la mémoire de la carte (le choix du repère n'y est pas mémorisé). Aucun mouvement : aucune ligne ne porte de mot d'axe.
- Sûr dans les deux hypothèses de E-B : si le décalage exécuté était nul, il est rechargé ; s'il était déjà le G54, il le reste. Dans les deux cas, exécuté = rapporté = `$#` à la fin.
- Si la transaction est coupée entre les deux lignes, `restore` est gardé : la tentative suivante commence par renvoyer `restore` quand le `$G` récent dit un autre repère. Une bannière efface `restore` (un reset remet la carte en G54, comme sans nous).
- Chaque lancement est entouré d'un `try/catch` : il part d'un gestionnaire d'événement de CNCjs, et une exception y casserait la lecture du port.

**Quand la transaction part** (appel `tick` à chaque rapport d'état) : état `unknown`, et tout ceci est vrai : contrôleur connecté et prêt ; rapport de moins de 2,5 s ; `activeState` `Idle` ; file et envoi de CNCjs vides ; pas de chargement, de palpage, de prise d'origine, de déplacement du service ni de commande système ; aucune confirmation en attente ; broche à l'arrêt (`spindleStill`) ; `$G` récent et repère connu ; `$13` connu ; pas de lecture automatique des réglages en cours (D4). Flux de travail `idle`, ou en pause demandée par le programme (M0, M1, M6) : dans ce second cas, étapes 1 et 2 seulement, jamais de rechargement (un écart donne `failed`).

**Essais.** Trois transactions au plus par cause, espacées de 5 s. Ensuite l'état reste `failed` jusqu'à l'un de ces trois événements, qui remettent le compteur à zéro : une nouvelle cause d'invalidation ; l'action `verifyOffset` (gardée par le bail, sans confirmation, n'écrit que ce que la transaction écrit) ; une opération refusée pour cet état (toucher de nouveau le bouton quelques secondes plus tard relance donc la preuve, sans bouton nouveau sur la page actuelle).

**Pendant `checking`** (1 à 8 s) :
- `available(c)` refuse avec `ETOUCH_OFFSET_CHECKING` : aucune action gardée n'écrit entre deux lignes de la transaction ;
- toute commande ou écriture Socket.IO non sûre est refusée (`refuseSocket`, voir § 1.6) ;
- Pause, Arrêter, arrêt broche, arrêt d'un déplacement et tout arrêt Socket.IO annulent la transaction (rien ne bouge : aucun ordre matériel de plus) ; l'état redevient `unknown`.

**Ce qui invalide la preuve** (`proven` ou `failed` → `unknown`, compteur d'essais remis à zéro) :

| Événement | Vu par | Remarque |
|---|---|---|
| Prise d'origine vue finie (`Home` puis `Idle`, la nôtre ou une autre) | `r.status` | le cas de terrain |
| Bannière de redémarrage | `r.reset` | la carte recharge ses décalages : la preuve suivante passe sans rechargement |
| Alarme (`ALARM:n` ou état `Alarm`) | `r.alarmed`, `r.status` | la transaction attend le repos |
| Changement du repère actif vu dans `$G`, hors travail et hors transaction | `r.modal` | le nouveau repère est prouvé à son tour |
| Zéro écrit par le service (`G10 L20`, `G10 L2`) : zéro ici, zéro à l'origine machine, plaque, bloc | fin de l'opération | la preuve suivante passe sans rechargement (un `G10` recharge) |
| Fin ou arrêt d'un travail (flux de travail revenu à `idle`) | `r.end`, `r.stopped`, action `stop` | `M2`/`M30` recharge et remet G54 ; le programme a pu changer de repère |
| Commande ou écriture Socket.IO non sûre acceptée (client tiers : console, macro, `G10`, `G92`, `$H`…) | `socketCommand` | on ne lit pas son contenu |
| Rapport explicite `WCO:` différent de la valeur prouvée, hors travail | `r.status` | couvre un client relié à la carte par un autre canal (Wi-Fi ouvert, R12) |
| Redémarrage de CNCjs | état perdu | tout repart de `unknown` |

Pendant un travail en cours ou en pause, la preuve acquise au départ est gelée : les changements du programme lui-même ne l'invalident pas (ils le font à la fin).

**Ce qui est refusé tant que ce n'est pas `proven`** (le refus porte le code de l'état : `ETOUCH_OFFSET_CHECKING`, `_UNCONFIRMED`, `_MISMATCH` ou `_SETTINGS`, § 4.1) :

| Opération | Refusée ? | Pourquoi |
|---|---|---|
| Départ d'un programme, départ d'une reprise à une ligne | oui | le programme s'exécute en coordonnées de travail |
| Zéro Z à la plaque | oui | `G38.2 Z…` en coordonnées de travail |
| Palpage au bloc | oui, et l'étape CHECK du cycle recoupe encore (C-03) | `G38.3` en coordonnées de travail |
| Cadrage laser | oui | `$J=G90` en coordonnées de travail |
| Macro | oui | son contenu peut déplacer en coordonnées de travail |
| Zéro d'un axe à l'origine machine (D4) | oui | exige `G92` et `TLO` connus et nuls |
| Zéro d'un axe ici (`G10 L20`) | non, sauf pendant `checking` | le résultat ne dépend pas du décalage chargé, et l'écriture le recharge |
| Pas et déplacement continu (`$J=G91`, relatifs) | non | indépendants du décalage |
| Prise d'origine, déverrouillage, relecture, test broche, corrections | non | |
| Reprise après une pause (`~`) | non | elle continue l'état que la carte exécute déjà ; une plaque échouée en pause la refuse déjà (`probeFailed`) |
| Chargement, plan de reprise, contrôle d'un fichier | non : le contrôle rend `unknown` | voir ci-dessous |

**Contrôle des courses.** `machineForCheck` transmet `offsetProven`. Tant qu'il est faux, tout axe dont l'étendue dépend du décalage reçoit la raison `ETOUCH_CHECK_OFFSET_UNPROVEN` et le verdict `unknown` : jamais `outside` ni `validated`. Les cibles `G53` restent comparées. `offsetProven` absent (appel direct de `checkProgram`) : comportement d'aujourd'hui.

**Palpage au bloc (C-03).** À l'étape CHECK, `$#` est déjà lu : comparer `parameters[repère actif]` (+ `G92` + `TLO`, déjà exigés nuls) au champ `WCO:` d'un rapport postérieur. Écart → échec `ETOUCH_PROBE_OFFSET` avant tout mouvement, origine inchangée. Ce doublon avec la garde de `blockReady` est voulu.

**Cas limites.**
- Grbl sans champ `WCO:` (0.9) : jamais prouvé, donc départ refusé. Assumé : hors des machines visées ; à dire dans `SURETE.md`.
- CNCjs redémarré entre les deux lignes du rechargement : le repère actif reste l'autre repère, et l'état `restore` est perdu. Fenêtre inférieure à une seconde ; limite écrite, non couverte.
- Feed hold d'un client tiers au repos pendant la transaction : la carte passe en `Hold`, la ligne suivante n'aboutit pas, la transaction s'interrompt (`unknown`, `restore` gardé).

### 1.2 D1 — Un programme dont le dépassement est prouvé ne part pas

**« Prouvé » veut dire** : l'axe a le verdict `outside` du contrôle, ce qui exige tout ceci :
1. `$22=1` et machine référencée (`r.homed`) ;
2. rapports en mm (`$13=0`), unités et mode de distance du programme connus (aucune raison « globale ») ;
3. course `$130`-`$132` de l'axe connue ;
4. convention de l'axe connue : bit `$23` libre → `[−course ; 0]` ; bit posé → `[0 ; +course]` **seulement** si la prise d'origine l'a apprise (`homeMpos` à 0 sous le même `$23`, par `envelopeOf` de `motion.js`), sinon `unknown` comme aujourd'hui (C-04) ;
5. décalage prouvé par D2 pour les étendues en coordonnées de travail (inutile pour les cibles `G53`) ;
6. étendue comparée aux bornes **utilisables** : la borne du côté de la prise d'origine est exacte ; la borne opposée est réduite de `SOFT_LIMIT_MARGIN_MM = 0,5` (C-06). Sur la LUNYEE : X `[0 ; 407,5]`, Y `[0 ; 395,5]`, Z `[−129,5 ; 0]`.

La comparaison est stricte, avec un garde d'arrondi flottant de 1e-9 seulement : la tolérance de 0,001 vers l'extérieur disparaît. `G53 G0 Z0` reste `validated` (`program-check.test.js:354-363`). La marge est une précaution provisoire (frontière observée entre 0,055 et 0,265 mm à l'intérieur de Z bas), pas une règle du firmware : à revoir après E-A.

**Où le contrôle est fait.**
- **Au chargement** : jamais un refus de charger (l'origine se pose après le fichier). Le verdict est dans chaque instantané (`programCheck`), donc dans la réponse du chargement, avec le nouveau champ `blocking`. `check` (fichier de la bibliothèque) le rend aussi.
- **Au départ** : dans `readyFor('start')`, donc à `prepare`, après la relecture du fichier, à `start`, et encore après sa relecture. Le contrôle est recalculé à chaque appel.
- **À la reprise à une ligne** : `resumePlan` rend le `programCheck` du programme reconstruit, préambule compris ; le chargement et le départ de la reprise passent par les mêmes gardes.

**Forme du refus.** Code `ETOUCH_START_OUTSIDE`, paramètres `{ count }`, plus `reasons` : une raison par dépassement prouvé (deux pour un axe qui dépasse des deux côtés), dans le sens de l'opérateur :

| Code de la raison | Paramètres | Phrase française du serveur |
|---|---|---|
| `ETOUCH_TRAVEL_TOO_LOW` (Z, côté bas) | `over`, `min`, `limit` | « Le programme descend {over} mm trop bas (Z machine {min}, limite {limit}). » |
| `ETOUCH_TRAVEL_TOO_HIGH` (Z, côté haut) | `over`, `max`, `limit` | « Le programme monte {over} mm trop haut (Z machine {max}, limite {limit}). » |
| `ETOUCH_TRAVEL_BEYOND` (X ou Y) | `axis`, `sign` (`+` ou `−`), `over`, `value`, `limit` | « Le programme dépasse la course de {over} mm en {axis}{sign} ({axis} machine {value}, limite {limit}). » |

`over` est l'écart à la borne utilisable, arrondi au dixième **supérieur** (relever la pièce de `over` suffit). `limit` est la borne utilisable. Les mêmes raisons sont publiées avant tout toucher dans `programCheck.blocking`. Le remède (« relevez la pièce », « déplacez l'origine ») est du ressort de la table des refus de la spec. Les raisons détaillées existantes (`ETOUCH_CHECK_OUTSIDE`, `_G53`) restent dans `codedReasons`, pour « Détails ».

**Dérogation par un second geste.**
1. `prepare { operation: 'start' }` est refusé (`ETOUCH_START_OUTSIDE`).
2. Second geste : un bouton distinct de la page (posé par la refonte, lot L5 ; le contrat est prêt et testé dès S3) envoie `prepare { operation: 'start', override: 'travel' }`. Le serveur refait tous les autres gardes, exige `$20=1` (sinon `ETOUCH_START_NO_OVERRIDE`), puis délivre un ticket qui porte `override: true` et la signature de ce qui est dérogé : liste des dépassements (axe, côté, `over`), révision et empreinte du fichier, numéro de session de la carte (`startups`), instant de la preuve D2, `$23` et `$130`-`$132`. La réponse rend `override: { blocking: […] }` pour le dialogue.
3. `start { nonce }` recalcule : signature différente → `ETOUCH_START_OVERRIDE_CHANGED`, rien n'est envoyé. Plus aucun dépassement → départ ordinaire.
4. Un ticket sans dérogation dont le recalcul trouve un dépassement est refusé (`ETOUCH_START_OUTSIDE`).

**Journal.** Deux entrées `event: 'override'`, `kind: 'travel'` : `stage: 'confirmed'` à la délivrance du ticket et `stage: 'started'` juste avant `gcode:start`, chacune avec le fichier, le contrôleur, l'acteur et la liste chiffrée des dépassements. L'entrée `start` porte `override: true`.

**Ne se déroge jamais** : D2 (décalage non prouvé) ; la garde de référence (§ 1.5) ; `$20` différent de 1 ou inconnu (la carte n'arrêterait pas le dépassement elle-même) ; tous les gardes existants (repos, broche arrêtée, fichier inchangé, unités et mode, mode laser, automatismes, bail, flux).

**Verdict `unknown`.** Il reste un avertissement : le ticket est délivré et porte `programCheck`, la case du dialogue reste exigée. Le serveur donne les causes codées (`codedReasons`). Ce qui les fait disparaître :

| Cause | Disparaît quand |
|---|---|
| `ETOUCH_CHECK_OFFSET_UNPROVEN` | D2 a prouvé (quelques secondes) ; le départ est de toute façon refusé d'ici là |
| `ETOUCH_CHECK_HOMING_DIRECTION` (axe à bit `$23`) | prise d'origine complète lancée depuis la tablette et vue en `Home` |
| `ETOUCH_CHECK_NOT_HOMED` | n'atteint plus le dialogue de départ avec `$22=1` (§ 1.5) |
| `ETOUCH_CHECK_HOMING_SETTING`, `_REPORT_UNITS`, `_TRAVEL_UNKNOWN` | relecture des réglages (automatique, D4) |
| `ETOUCH_CHECK_UNITS_UNKNOWN`, `_DISTANCE_UNKNOWN`, `_ACTIVE_WCS_UNKNOWN` | `$G` récent ; durable si le fichier ne fixe pas `G21` / `G90` |
| `ETOUCH_CHECK_HOMING_DISABLED`, `_REPORT_INCHES` | réglage de la carte : durable sur cette machine |
| Causes du fichier (`_RELATIVE_START`, `_PROBE`, `_ORIGIN_CHANGE`, `_WCS_CHANGE`, `_ARC_PLANE`, `_SYNTAX`, `_TLO_CANCEL`…) | jamais pour ce fichier : l'écran dit « ce fichier ne peut pas être vérifié » |

### 1.3 D3 — Écran du kiosque

**Reconnaître la page locale.** Fonction `localRequest(req)` de `api.touch.js` : l'adresse de la **socket** (`req.socket.remoteAddress`, jamais `req.ip` ni un en-tête) est en boucle locale (`127.0.0.0/8`, `::1`, `::ffff:127.x.x.x`) **et** la requête ne porte ni `X-Forwarded-For`, ni `Forwarded`, ni `X-Real-IP`. Sans socket : distante. La variante « adresse distante = adresse locale » de V3 est écartée : D3 dit « boucle locale », et l'erreur possible est sans danger (voir limites).

**Serveur.**

| Requête `POST /api/touch-backlight` | Locale | Distante |
|---|---|---|
| `{ temporary: true, percent }` (veille, toute valeur) | acceptée | 409, code `ETOUCH_BACKLIGHT_REMOTE`, rien d'écrit |
| `{ wake: true }` | acceptée | acceptée : elle ne peut qu'allumer (V3-4) |
| `{ percent }` (curseur de Réglages, 5 % au moins) | acceptée | acceptée : geste explicite, ce n'est pas la veille |

- Toutes les réponses, `GET` compris, portent `local: true | false`.
- `wake()` est idempotent : il applique le niveau de l'opérateur si l'écran est en veille **ou** sous `MIN_PERCENT` ; sinon il n'écrit rien. La réponse donne le niveau relu.
- `restore()` au démarrage : sans niveau mémorisé et panneau trouvé sous `MIN_PERCENT`, il applique 50 % (C-15). Une veille n'est jamais mémorisée : un panneau noir au démarrage n'est jamais voulu.

**Page** (`touch/backlight.js`, `touch/screen-saver.js`).
- Au chargement : un `GET` donne `local`. Page locale : `{ wake: true }` aussitôt.
- Page distante : pendant sa propre veille, elle ne pose que son voile. Elle n'envoie ni extinction, ni réveil, ni au chargement, ni à la fin de sa veille. Si le `GET` a échoué et qu'une extinction part, le refus `ETOUCH_BACKLIGHT_REMOTE` la range comme distante pour toute sa vie, sans message à l'écran.
- Page locale éveillée : à chaque `pointerdown`, `{ wake: true }` si le dernier envoi date de plus de 5 s, une requête à la fois. C'est ce qui rend vrai « un toucher rallume toujours », y compris face à une autre page locale.
- Une touche avec Ctrl, Alt ou Meta, ou F5, pendant la veille : elle réveille, elle n'est pas annulée (`preventDefault` retiré), elle reste arrêtée (`stopImmediatePropagation` gardé) (C-33).

**État perdu au redémarrage de CNCjs.** `temporary` repart à faux : `restore()` rallume au démarrage, et `wake()` rallume un panneau trouvé sombre.

**Limites, à écrire dans `SURETE.md`.**
- Kiosque ouvert sur l'adresse du réseau local : il n'est pas reconnu, l'écran ne s'éteint plus pendant la veille (énergie, usure ; aucun danger). L'essai contrôle l'URL (`127.0.0.1` ou `localhost`).
- Un relais sans en-tête vers le port 8000 sur la tablette (tunnel SSH `-L`, `socat`) ferait passer une page distante pour locale : ne jamais en publier un. Le premier toucher sur la tablette rallumerait.
- Une seconde page locale (fenêtre de mesure) peut éteindre : sa veille doit être réglée sur « Inchangée ».
- Le premier toucher sur un écran noir atteint encore la commande visée. Non couvert : ce cas n'existe plus que derrière les deux limites précédentes.

### 1.4 D4 — Petites fonctions

**a. Zéro d'un axe à l'origine machine.** Opération confirmée `set-origin` avec `at: 'machine'` (défaut `'here'`, inchangé) et `axes`.
- Écrit : `G10 L2 P<n> <axe>0 …` pour les axes choisis, repère actif. Aucun mouvement. `L2` fixe la valeur, quelle que soit la position.
- Gardes : ceux de `set-origin` (fonction activée, repos, repère connu et récent, machine immobile depuis la confirmation), plus : machine référencée (`ETOUCH_ORIGIN_NOT_HOMED` sinon, même avec `$22=0`), décalage prouvé par D2, `G92` nul sur les axes choisis et `TLO` nul si Z est choisi (`ETOUCH_ORIGIN_OFFSETS` sinon).
- Vérification : sur un rapport portant `WCO:` postérieur à l'`ok` (5 s au plus), `|WPos − MPos| ≤ 0,005` sur chaque axe choisi, et la machine n'a pas bougé. Journal `origin` avec `at: 'machine'`. Puis D2 est invalidé et re-prouve.
- Avec Z à l'origine machine, tout programme qui monte au-dessus de Z0 sera refusé par D1 : conséquence voulue, dite par D1.

**b. Relecture automatique de la version et des réglages.**
- Quand : la version est inconnue (`r.firmware` vide et rien dans `c.settings.version`) ou aucun réglage n'est lu ; carte en `Idle` **ou en `Alarm`** ; flux de travail `idle` ; file vide ; aucune séquence du serveur ; aucune confirmation en attente ; rapport récent.
- Écrit : `$I` par `c.writeln` (voie directe de `$H` et `$X` : le feeder jette tout en alarme), puis `$$` si aucun réglage n'est lu. Trois essais au plus par session de la carte, espacés de 5 s, tant que la réponse manque. `try/catch` autour de l'écriture.
- Pendant la réponse (jusqu'à l'`ok`, 1,5 s au plus), `available(c)` refuse avec `ETOUCH_SETTINGS_READING` : l'`ok` de `$I` ne doit être compté par aucune séquence. Le drapeau n'est posé qu'après une écriture réussie.
- L'action `readSettings` est acceptée en alarme (mêmes conditions, sans travail), et écrit par `writeln`. Instantané : `canReadSettings`, `readSettingsReason`.
- Non vérifié sur la carte : `$I` et `$$` en alarme (code amont : acceptés, R10).

**c. Valeurs par défaut du profil de sonde** (page, `probe-model.js` ; un test compare chaque valeur aux bornes `LIMITS` de `block-probe.js`).

| Champ | Défaut | Pourquoi c'est sûr |
|---|---|---|
| Approche rapide | 100 mm/min | la vitesse du zéro Z à la plaque, éprouvée ; bornes 10 à 200 |
| Approche lente | 25 mm/min | comme la plaque ; bornes 5 à 50 |
| Recherche | 10 mm | borne la descente sans contact à 10 mm ; fenêtre XYZ de 8 mm |
| Retrait | 1 mm | comme la plaque |
| Dégagement | 5 mm | comme la plaque |
| Coin (XYZ) | avant gauche (`directionX = +1`, `directionY = +1`) | un mauvais coin éloigne l'outil du bloc : pas de contact, arrêt au bout de la recherche, origine inchangée |
| Épaisseur du bloc, décalages de face X et Y, diamètre de l'outil | **aucun** | dimensions physiques : une valeur inventée donnerait une origine fausse. Demandées par l'assistant (refonte L3), le dernier choix est repris |

Le palpage Z seul ne demande pas de coin (le serveur ne l'exige déjà pas).

**d. Diagnostic guidé de la sonde** : ce que le serveur fournit dans `probeInput`.

| Champ | Sens |
|---|---|
| `test.stage` | `'idle'`, `'free'` (libre vu : touchez), `'contact'` (contact vu : relâchez) ; `test.done` et `test.ageMs` inchangés |
| `contactMs` | depuis combien de temps le contact est rapporté sans interruption, ou `null` |
| `stuck` | vrai quand `contactMs ≥ 5000` : contact permanent (pince sur l'outil et broche branchée, ou pince contre la plaque) |
| `lastContactAgeMs` | âge du dernier contact vu depuis la connexion ou le redémarrage de la carte, `null` si jamais vu : avec un palpage échoué sans contact, c'est « jamais de contact » (pince non branchée) |

Refus de la plaque et du bloc quand `stuck` : code `ETOUCH_PROBE_CONTACT_STUCK`. Les écrans sont du ressort de la refonte (L3).

### 1.5 Gardes de référence (décision nouvelle, hors D1 à D4)

A1 et V1 ont laissé ce point à trancher. Tranché ici dans le sens sûr ; à faire valider par l'orchestrateur.

- **Départ (C-05).** Avec `$22=1` connu et une machine non référencée (`r.homed` faux : jamais vue référencée par ce serveur, ou référence perdue par une bannière, une alarme ou un état `Alarm`), le départ d'un programme ou d'une reprise à une ligne est refusé : `ETOUCH_START_NOT_HOMED`, remède « Prise d'origine ». Aucune dérogation. La règle est large exprès : un serveur redémarré ne sait pas si la référence avait été perdue avant lui.
- **Zéros (C-18).** Dans le même état, `set-origin` (les deux modes) et le zéro Z à la plaque sont refusés : `ETOUCH_ORIGIN_NOT_HOMED`. Un zéro posé avant la prise d'origine serait faux après elle. La pause M6 n'est pas gênée : la machine y est référencée.
- `$22=0` : rien ne change (le contrôle reste `unknown`, avertissement). `$22` inconnu : rien ne change non plus ; la relecture automatique (D4) le rend connu.
- Variante étroite, non retenue : ne refuser que si ce serveur a vu la référence se perdre. Elle laisse partir un programme après « alarme, `$X`, redémarrage de CNCjs ».
- Instantané : `referenceLost` (`'alarm'`, `'restart'` ou `null`) et `lastAlarm` (C-23) pour que l'écran dise ce qui s'est passé.

### 1.6 Une séquence du serveur s'arrête par toutes les voies

Séquences : zéro Z à la plaque, palpage au bloc, transaction D2.

- **Réservation.** Tant qu'une séquence tourne ou qu'une commande système est réservée, `refuseSocket` refuse toute commande ou écriture Socket.IO non sûre, quel que soit le bail (C-12, C-60). Les arrêts restent libres.
- **Arrêt Socket.IO (C-09).** Pour une commande ou une écriture d'arrêt (`gcode:stop`, `stop`, `feeder:stop`, `feedhold`, `gcode:pause`, `pause`, `reset`, `!`, `0x18`), `refuseSocket` appelle d'abord `service.socketStop(port)` : arrêt synchrone de la séquence (bloc : `blockProbe.stop` ; plaque : annulation et arrêt matériel ; D2 : annulation), puis la commande suit son cours.
- **Ligne en vol (C-08).** La plaque suit sa ligne en vol comme le bloc (`probing.outstanding`) : un arrêt demandé alors que le rapport dit encore `Idle` envoie un feed hold, puis le reset. Le verrou `r.probing` n'est rendu qu'une fois l'arrêt prouvé (bannière, rapport plus récent en alarme, ou rapport plus récent au repos après le délai de `halt.js`), comme `released()` du bloc.
- **Pilotage (C-12).** `release` et `takeover` arrêtent d'abord, de façon synchrone, la séquence de l'appareil qui perd la main, puis changent le bail.

---

## 2. Profil « LUNYEE » des simulateurs

Défaut inchangé partout (Grbl 1.1h standard) : les tests existants ne bougent pas. Le profil s'active par option.

### 2.1 `grbl-simulator/grbl-simulator.js` : `new GrblSimulator({ profile: 'lunyee' })`, et `grbl-server.js --profile lunyee`

| # | Comportement | Source |
|---|---|---|
| L1 | Réglages `$6=1`, `$10=1`, `$13=0`, `$20=1`, `$21=1`, `$22=1`, `$23=3`, `$27=2`, `$30=1000`, `$110-112` = 4000 / 4000 / 800, `$130-132` = 408 / 396 / 130 ; `[VER:1.1f.20231030:]`, `[OPT:PHSW]` | terrain (prompt § 2), FIRMWARE § 1.2 |
| L2 | Démarrage et tout redémarrage : état `Alarm` (verrou de `$22=1`), MPos 0,0,0, non référencée | terrain ; FIRMWARE § 3.a |
| L3 | `$H` : état `Home` pendant le cycle, rapports `Home` émis (option `homeReports: false` pour Q-05), MPos 0,0,0 à la fin | terrain (E1) ; rapports : amont, non vérifié |
| L4 | `$HX`, `$HY`, `$HZ` font le cycle complet | terrain (E2) |
| L5 | Après toute prise d'origine : `WCO:0,0,0` rapporté, `$#` inchangé. Décalage **exécuté** nul par défaut ; option `executedAfterHoming: 'stored'` pour l'autre hypothèse de E-B. Rechargé par : passage à un **autre** repère, `G10 L2/L20` sur le repère actif, reset, `M2`/`M30`. `G54` seul, repère déjà actif : rien | terrain ; FIRMWARE § 3.b |
| L6 | Limites logicielles contrôlées **à l'analyse** de la ligne, sur la cible machine de `G0`, `G1`, chaque arc et chaque `G38.x`. Enveloppe : bit `$23` posé → `[0 ; +course]`, sinon `[−course ; 0]`. Refus dès `inset = 0,2` mm avant la borne opposée à la prise d'origine (−129,735 passe, −129,945 refusé). `$J=` hors enveloppe : `error:15`, sans alarme | terrain (E5) ; FIRMWARE R1, R3, R5 ; `$J` : amont, non vérifié |
| L7 | Dépassement : ligne `ALARM:2`, aucun mouvement, puis redémarrage (bannière, L2). Le décalage est rechargé de `$#` | terrain ; FIRMWARE § 3.b |
| L8 | Fin de course matérielle (`setLimitPin`, `$21=1`) : `ALARM:1`, puis le même redémarrage | terrain |
| L9 | Reset (`0x18`) en mouvement (Run, Jog, Home, Hold en décélération) : redémarrage, MPos 0, non référencée. Reset à l'arrêt : position gardée (amont) ; option `resetAtRest: 'restart'` pour Q-04 | terrain ; arrêt : FIRMWARE § 3.c |
| L10 | Sonde : option `probeStuck` (contact permanent : `Pn:P` dans chaque rapport, tout `G38.x` lève `ALARM:4` avant de bouger) ; `G38.3` sans contact : `[PRB:…:0]`, sans alarme ; `G38.2` sans contact : `ALARM:5` | terrain (broche à la masse) ; FIRMWARE R8 (amont) |
| L11 | Rapports : MPos, pas de `Bf:` ; `WCO:` un rapport sur 10 dans tous les états, et au rapport qui suit un changement de décalage | FIRMWARE R9 |
| L12 | `FS:` donne la vitesse de broche écrêtée à `$30` | FIRMWARE R11 |
| L13 | `$#`, `$I` acceptés en `Idle` et en `Alarm`, `error:8` en Run, Hold, Jog ; `$$` refusé en Run et Hold | FIRMWARE R10 |
| L14 | Connexion sans bannière (option `silentConnect` du pont de test) : la version n'est connue qu'après `$I` | terrain |
| L15 | Un `$H` simulé finit en moins de 2 s (option `homingMs`) | commodité de test |

Test du profil lui-même : `grbl-simulator/__tests__/lunyee-profile.test.js`, une assertion par ligne L1 à L14.

### 2.2 Faux Grbl de Jest (`S/block-probe.test.js`, lignes 46 et suivantes) : option `lunyee: true`

| Comportement | Source |
|---|---|
| Trois décalages séparés : mémorisé (`$#`), exécuté (cibles), rapporté (`WCO`) ; nuls pour les deux derniers après la prise d'origine, rechargés comme en L5 | L5 |
| Cible `G38.3` ou `G53 G1` hors enveloppe (L6) : `ALARM:2` à l'analyse, bannière, MPos 0 | L6, L7 |
| `reset()` en mouvement : MPos 0, non référencée | L9 |
| `$HX` : cycle complet | L4 |
| `pinForced` permanent disponible comme option du profil | L10 |
| `wco` dans la charge utile des rapports un sur 10 et après un changement | L11 |

### 2.3 Pont partagé et bouchon

- `S/support/sim-bridge.js` : le pont « simulateur → contrôleur par le vrai `GrblRunner` » de `motion-simulator.test.js` (lignes 16-60), extrait tel quel, avec `writeln`, `silentConnect` et un feeder qui se vide en alarme. `motion-simulator.test.js` l'importe.
- `S/support/proven-offset.js` : fabrique `provenOffset` pour `options.workOffset`, toujours `proven`. Elle sert aux fichiers de test antérieurs à D2, dont les faux contrôleurs ne répondent pas à `$#`. Elle n'existe que sous `__tests__`.

### 2.4 Quels tests tournent sur le profil

| Test (nouveau sauf mention) | Sur | Lot |
|---|---|---|
| `grbl-simulator/__tests__/lunyee-profile.test.js` | simulateur | S1 |
| `S/work-offset.test.js` : D2 de bout en bout, les deux hypothèses de L5 | simulateur + pont, vrai module | S2 |
| `S/block-probe.test.js`, scénarios LUNYEE (CHECK, `ALARM:2`) | faux Grbl `lunyee` | S2, S6 |
| `S/start-travel.test.js` : D1, dérogation, marge | simulateur + pont | S3 |
| `S/reference-guard.test.js` : C-05, C-18 | simulateur + pont | S3 |
| `S/plate-probe.test.js` : course, surveillance, arrêts | simulateur + pont | S4 |
| `S/settings-read.test.js` : relecture en alarme, connexion sans bannière | simulateur + pont | S5 |
| Tous les autres fichiers Jest existants | leurs faux contrôleurs, avec `provenOffset` | inchangés |

---

## 3. Lots de correction

Chaque lot : corrections dans l'ordre, puis commits. « Preuve » = test de preuve à convertir ; « Adapter » = tests existants à ajuster, à nommer dans le commit.

### Lot S1 — Profil « LUNYEE » des simulateurs

Constat : C-25. Rien ne change dans `src/server/services/touch/*.js`.

1. **Profil du simulateur** (§ 2.1). Fichiers : `grbl-simulator/grbl-simulator.js`, `grbl-server.js` (option de ligne de commande), `README.md` du simulateur. Test : `grbl-simulator/__tests__/lunyee-profile.test.js`. Les deux suites existantes du simulateur restent vertes sans retouche.
2. **Faux Grbl de Jest** (§ 2.2). Fichier : `S/block-probe.test.js`. Test : trois scénarios qui prouvent le faux Grbl lui-même (WCO nul après `$H` puis rechargé par `G55`/`G54` ; `ALARM:2` à l'analyse puis MPos 0 ; reset en mouvement). Les 45 tests existants ne changent pas.
3. **Pont et bouchon** (§ 2.3). Fichiers : `S/support/sim-bridge.js`, `S/support/proven-offset.js` (la forme de l'interface est celle du § 1.1 ; S2 l'ajuste), `S/motion-simulator.test.js`.

Commits :
- `touch: LUNYEE profile for the Grbl simulator (field facts of the real board)`
- `touch: LUNYEE options for the Jest fake Grbl, shared simulator bridge`

### Lot S2 — D2 : décalage de travail prouvé

Constats : C-02, C-03.

1. **Module et intégration (C-02)**, § 1.1. Fichiers : `work-offset.js` (nouveau), `job-service.js` (`options.workOffset` ; appels d'invalidation dans `r.status`, `r.reset`, `r.alarmed`, `r.modal`, `r.end`, `r.stopped`, `stop`, `socketCommand` ; `tick` dans `r.status` ; garde dans `available`, `readyFor('start')`, `macroReady`, `plateReady`, `framePlan` ; action `verifyOffset` ; champ `workOffset` ; `machineForCheck` → `offsetProven`), `plate-probe.js` et `motion.js` (invalidation après leur `G10`), `block-probe.js` (garde dans `blockReady`, invalidation après le `G10` final), `program-check.js` (`ETOUCH_CHECK_OFFSET_UNPROVEN`), `index.js` (`refuseSocket` refuse le non sûr pendant `checking`).
   - Preuve : `S/bughunt-A1-2.test.js` et `S/bughunt-A2-3.test.js` → `S/work-offset.test.js`. Cas exigés : après `$H`, rechargement puis `proven` dans les deux hypothèses de L5 ; égalité d'emblée (profil standard) : aucune ligne après `$#` ; `checkProgram` rend `unknown` tant que ce n'est pas prouvé, puis le vrai verdict ; départ, plaque, macro refusés d'ici là ; chaque ligne de la table d'invalidation ; trois essais puis `failed` ; `verifyOffset` ; interruption entre les deux lignes puis restauration ; pause M6 : lecture seule ; client tiers qui change de repère ; `WCO:` différent vu au repos.
   - Adapter : chaque fichier de test qui appelle `createService` reçoit `workOffset: provenOffset` (environ 30 fichiers, une ligne chacun). Aucune assertion retirée.
2. **Champ `refusals`** (§ 4.2) : l'instantané publie le code, les paramètres et les raisons de chaque refus codé. Fichier : `job-service.js` (`reason()` garde l'erreur). Test : dans `work-offset.test.js` et `job-service.test.js`.
3. **Palpage au bloc (C-03)**, § 1.1. Fichier : `block-probe.js` (étape CHECK). Preuve : `S/bughunt-A1-7.test.js` → scénario de `block-probe.test.js` sur le faux Grbl `lunyee` avec `provenOffset` (la garde locale seule arrête le cycle : aucun `G38.3` écrit).
4. Catalogue : `ETOUCH_OFFSET_CHECKING`, `_UNCONFIRMED`, `_MISMATCH`, `_SETTINGS`, `ETOUCH_CHECK_OFFSET_UNPROVEN`, `ETOUCH_PROBE_OFFSET`, et les phrases de réussite de `verifyOffset`.

Commits :
- `touch: D2 the work offset is proven against $# before a start, a probe or a framing`
- `touch: the block probe checks its active offset against $# before its first move`

### Lot S3 — D1 : départ hors course, référence et marge

Constats : C-01, C-04, C-05, C-06, C-18, C-57, C-58, C-61.

1. **Convention apprise et marge (C-04, C-06)**, § 1.2 points 4 et 6. Fichiers : `motion.js` (exporte `SOFT_LIMIT_MARGIN_MM = 0.5` ; le pas compare aux bornes utilisables, `ETOUCH_MOTION_STEP_OUTSIDE` inchangé dans sa forme ; le continu et le bloc gardent 1 mm), `program-check.js` (importe `envelopeOf` de `./motion.js` avec l'extension ; bornes par convention unique, sinon `ETOUCH_CHECK_HOMING_DIRECTION` ; champ `usable` par axe ; comparaison stricte), `job-service.js` (`machineForCheck` transmet `homeAt`, `wcoSeen`, `wposReported`).
   - Preuve : `S/bughunt-A1-3.test.js`, `S/bughunt-A1-5.test.js` → `program-check.test.js` et `motion.test.js`.
   - Adapter : les pas « jusqu'à la fin de course » de `motion.test.js` du côté opposé à la prise d'origine, un par un. `program-check.test.js:354-363` et `:366` restent verts sans retouche.
2. **D1 (C-01)**, § 1.2. Fichiers : `program-check.js` (`blocking`, `overridable`), `job-service.js` (`readyFor('start')`, `prepare` avec `override`, signature, journal, `canStart` et `startReason`), `job-load.js` (`resumePlan` rend `programCheck`).
   - Preuve : `S/bughunt-A1-1.test.js` → `S/start-travel.test.js` (profil LUNYEE : la découpe de T2). Cas exigés : refus chiffré ; raisons dans le sens de l'opérateur ; `unknown` délivre le ticket ; dérogation acceptée puis journalisée deux fois ; signature changée par un zéro posé pendant le ticket ; `$20=0` ; préambule d'une reprise hors course ; bande de marge.
   - Adapter : `job-service.test.js:2283-2326` (« the start is not blocked ») : la partie `unknown` reste, l'étape `$132: 40` refuse maintenant le départ.
3. **Gardes de référence (C-05, C-18)**, § 1.5. Fichiers : `job-service.js` (`readyFor('start')`, `referenceLost`), `motion.js` (`originReady`), `plate-probe.js` (`zeroZReady`).
   - Preuve : `S/bughunt-A1-4.test.js`, `S/bughunt-V1-1.test.js` → `S/reference-guard.test.js`.
   - Adapter : `job-service.test.js:2290-2292` et les tests proches de `:3271-3340` qui démarrent ou posent un zéro avec `$22: 1` sans prise d'origine.
4. **Le contrôle ne suit pas ce que Grbl lit autrement (C-57, C-58, C-61)**. Fichier : `program-check.js`. Une ligne où un nombre est suivi d'espaces puis de chiffres, ou une ligne `$…` : listée non interprétée, raison `ETOUCH_CHECK_SYNTAX` `{ line }`, tous les axes `unknown`. `G49` dans le programme avec un `TLO` hérité non nul (connu par D2) : Z `unknown`, raison `ETOUCH_CHECK_TLO_CANCEL` `{ line }`. Test : `program-check.test.js`.
5. Catalogue : `ETOUCH_START_OUTSIDE`, `ETOUCH_TRAVEL_TOO_LOW`, `_TOO_HIGH`, `_BEYOND`, `ETOUCH_START_OVERRIDE_CHANGED`, `ETOUCH_START_NO_OVERRIDE`, `ETOUCH_START_NOT_HOMED`, `ETOUCH_ORIGIN_NOT_HOMED`, `ETOUCH_CHECK_SYNTAX`, `ETOUCH_CHECK_TLO_CANCEL`.

Commits :
- `touch: the travel check uses the homing convention learnt and keeps 0.5 mm before the far limit`
- `touch: D1 a program proven outside the travel does not start (override by a second, logged confirmation)`
- `touch: no start and no work zero on a machine without its reference`
- `touch: the travel check gives up on lines Grbl reads differently`

### Lot S4 — Arrêts et séquences du serveur

Constats : C-07, C-08, C-09, C-12, C-13, C-17, C-19, C-26, C-39, C-54, C-55, C-59, C-60.

1. **Arrêts par toutes les voies (C-08, C-09, C-12, C-60)**, § 1.6. Fichiers : `index.js` (`refuseSocket` : réservation, puis `socketStop` pour un arrêt), `job-service.js` (`socketStop`, `socketBusy`, branche `control` ; branche `stop` de la plaque), `plate-probe.js` (`outstanding`, verrou gardé jusqu'à l'arrêt prouvé), `block-probe.js` (rien à changer dans `stop`).
   - Preuve : `S/bughunt-V1-2.test.js`, `S/bughunt-V1-3.test.js` → `S/plate-probe.test.js` et `S/index.test.js`. Ajouter le cas du bloc (arrêt Socket.IO entre deux lignes : aucune ligne ne part ensuite) et celui de la libération du bail (un `M3 S1000` par Socket.IO est refusé, le cycle est arrêté).
2. **Plaque : course et surveillance (C-07, C-17, C-55)**. Fichiers : `plate-probe.js`, `job-service.js` (`closeTransport`, `ticketPending`).
   - Course : machine référencée, course et convention de Z connues → refus si `Z machine − recherche < bas + 1 mm` : `ETOUCH_PLATE_TRAVEL` `{ search, max }`, `max` étant la plus grande recherche permise.
   - Surveillance, comme le bloc : liée à l'appareil et au flux qui ont confirmé ; arrêt (annulation, puis `halt` selon § 1.6) sur flux perdu depuis 3 s (pas sur une rotation ; le flux n'est pas tourné pendant le palpage), bail perdu ou pris, rapport de plus de 2,5 s, délai d'une ligne dépassé. Codes `ETOUCH_PLATE_STREAM`, `_CONTROL`, `_STALE`, `_TIMEOUT`.
   - Après un échec au repos sans reset, flux ouvert : envoyer `G0` (aucun mot d'axe), pour que `G38.2` ne reste pas le mode modal.
   - Preuve : `S/bughunt-A1-6.test.js` → `S/plate-probe.test.js`.
3. **Petits gardes (C-13, C-19, C-39, C-59)**. Fichiers : `job-service.js`, `motion.js`, `plate-probe.js`, `halt.js`, `job-load.js`.
   - C-19 : `atRest`, `originReady` et `zeroZReady` refusent quand `homingActive(r)` : `ETOUCH_MOTION_HOMING`.
   - C-13 : après la relecture du fichier, `start` revérifie le flux, le bail de l'acteur et un drapeau d'annulation ; un Arrêter reçu pendant un départ en préparation l'annule et répond « Départ annulé. ».
   - C-39 : `halt` mémorise `r.startups` et abandonne si une bannière est venue depuis.
   - C-59 : au départ d'une reprise à une ligne dont le programme reconstruit ne fixe pas `G94`, exiger un `$G` récent en `G94` : `ETOUCH_START_FEED_MODE` sinon. Le plan de reprise ne change pas.
   - Tests : un par garde, dans `job-service.test.js`, `motion.test.js`, `S/halt.test.js` (nouveau).
4. **Tests affaiblis (C-26, C-54)**. Fichier : `S/block-probe.test.js`. S38 injecte séparément l'`ok`, le premier `Idle` et le second, et affirme qu'aucune ligne n'est partie après le premier (le mutant `+1` de `plate-probe.js:203` doit échouer ; même cas pour la plaque dans `plate-probe.test.js`). S27 appelle `load`, `macro`, un pas et `reserveSystemCommand`, et vérifie le rejet et l'absence d'écriture.
5. Catalogue : `ETOUCH_PLATE_TRAVEL`, `_STREAM`, `_CONTROL`, `_STALE`, `_TIMEOUT`, `ETOUCH_MOTION_HOMING`, `ETOUCH_START_FEED_MODE`, « Départ annulé. », et le message du refus Socket.IO (français, affiché par l'interface d'origine).

Commits :
- `touch: every stop ends a server sequence (socket stop, lease release, line in flight)`
- `touch: the plate probe checks its travel and is watched like the block probe`
- `touch: no move during a homing, a start re-checks its stream and lease, a late halt is dropped`
- `touch: S38 tells one idle report from two, S27 calls what it announces`

### Lot S5 — D3, D4 et pilotage depuis le PC

Constats : C-10, C-11, C-14, C-15, C-20, C-21, C-28 (champs), C-62.

1. **D3, côté serveur (C-10, C-15)**, § 1.3. Fichiers : `src/server/api/api.touch.js` (`localRequest`, `postBacklight`, `getBacklight`), `backlight.js` (`wake`, `restore`).
   - Preuve : `S/bughunt-A1-10.test.js`, `S/bughunt-A3-1.test.js` → `src/server/api/__tests__/api.touch.test.js` et `S/backlight.test.js`. Cas exigés de `localRequest` : IPv4, `::1`, `::ffff:127.0.0.1`, adresse du réseau (distante), chacun des trois en-têtes (distante), socket absente (distante).
   - Adapter : `api.touch.test.js:224-238` reçoit une socket locale dans son `makeReq`. `backlight.test.js:130-141` reste vert.
2. **D4, côté serveur (C-14, C-28)**, § 1.4 a, b, d. Fichiers : `job-service.js` (relecture automatique, `readSettings`, `canReadSettings`), `motion.js` (`set-origin` avec `at: 'machine'`), `probe-input.js` (champs), `plate-probe.js` et `block-probe.js` (`ETOUCH_PROBE_CONTACT_STUCK`).
   - Preuve : `S/bughunt-A1-8.test.js` → `S/settings-read.test.js` (profil LUNYEE, `silentConnect` : `$I` écrit au repos et en alarme, trois essais, rien pendant un travail ni une séquence).
   - Tests nouveaux : zéro à l'origine machine (`motion.test.js` : ligne écrite, chaque garde, vérification, journal) ; champs du diagnostic (`probe-input.test.js`).
   - Adapter : `job-service.test.js:812-813` attend `['gcode', ['$I', '$$']]` : la relecture passe par `writeln` (le faux contrôleur en reçoit un).
3. **Pilotage depuis le PC (C-11, C-20, C-21, C-62)**. Fichiers : `control.js` (retirer `'sleep'` et `'lasertest:off'` de `SAFE_COMMANDS`, `'\x9e'` de `SAFE_WRITES`), `src/server/services/cncengine/CNCEngine.js` (le traitement de `close` appelle `refused(port, 'command', 'close')`).
   - Preuve : `S/bughunt-V3-5.test.js`, `S/bughunt-A3-2.test.js` → `S/control.test.js` et `src/server/services/cncengine/__tests__/control-hook.test.js`.
   - Adapter : `control.test.js:202` range `sleep` parmi les commandes sûres : la déplacer dans la liste gardée (`:208`), avec `lasertest:off` et `0x9E`. À dire dans le commit.
4. Catalogue : `ETOUCH_BACKLIGHT_REMOTE`, `ETOUCH_SETTINGS_READING`, `ETOUCH_ORIGIN_OFFSETS`, `ETOUCH_PROBE_CONTACT_STUCK`, les phrases de réussite du zéro à l'origine machine et de la relecture.

Commits :
- `touch: D3 only the kiosk's own page dims its screen, any wake lights it`
- `touch: D4 version and settings read by themselves, axis zero at the machine origin, probe diagnosis facts`
- `touch: sleep, laser off, the spindle toggle and closing the port need the control lease`

### Lot S6 — Palpage au bloc et petites corrections du serveur

Constats : C-22, C-23, C-24, C-37, C-38, C-40, C-41, C-46, C-63, C-65.

1. **Enveloppe du palpage XYZ (C-22)**. Fichier : `block-probe.js:299-307`. Par axe, en u = d·(position − départ) : bas = min(−L, −fenêtre − d·face), haut = max(0, −L + s + 1, −d·face), remis en coordonnées machine selon d. `inside()` ne change pas. Preuve : `S/bughunt-A1-11.test.js` → `block-probe.test.js` (le témoin « départ à Y 12,5 refusé » est gardé). Adapter : `block-probe.test.js:557-560`.
2. **Dernière alarme (C-23)**. Fichier : `job-service.js`. `lastAlarm { code, at, restarted }` gardé jusqu'à la prochaine prise d'origine vue finie ; journal `alarm` dans tous les cas, travail ou non. `alarmCode` inchangé. Test : `job-service.test.js`.
3. **Pas refusé par Grbl (C-24)**. Fichier : `motion.js:335-339, 477-478`. Un pas dont la ligne reçoit `error:N` publie `motion.lastJog` avec `result: 'refused'` et le code, comme le continu (`:649-653`), avant de libérer `pending`. Test : `motion.test.js`.
4. **Refus du bloc codés (C-40, C-41)**. Fichiers : `block-probe.js:324, 428` (codes `ETOUCH_PROBE_AMBIGUOUS` `{ axis }` et `ETOUCH_PROBE_TRAVEL_UNKNOWN` `{ axis }`), `:459, 499, 606, 625-628, 674` (`null` au lieu de `'inconnue'` / `'inconnu'`), `src/server/api/api.touch.js:75-83` (l'erreur HTTP porte `blockProbe { failure, written, needsHoming }`). Test : `block-probe.test.js` et `api.touch.test.js`.
5. **Textes et petites choses (C-37, C-38, C-46, C-63, C-65)**. Fichiers : `motion.js` (`ETOUCH_MOTION_AMBIGUOUS` `{ axis }` : « Position de l'axe {axis} inconnue : refaites la prise d'origine depuis la tablette. » ; `ETOUCH_MOTION_DISABLED` sans nom de fichier ; commentaire d'en-tête), `job-service.js` (arrêt broche en alarme : rien n'est écrit, réponse « La broche est arrêtée par l'alarme. » ; `spindleStopReason` publié), `program-check.js` (profil CNC : information codée `ETOUCH_CHECK_S_ABOVE_MAX` `{ s, line, max }` dans `info`, sans effet sur le verdict). Tests : dans les fichiers de test de chaque module.
6. Catalogue : les codes ci-dessus et les deux phrases nouvelles.

Commits :
- `touch: XYZ probe envelope follows the real path`
- `touch: last alarm kept after the restart, a step refused by Grbl is reported`
- `touch: coded block probe refusals, no French fragment in EN and ES`
- `touch: small server texts (ambiguous travel, spindle stop in alarm, S above $30)`

### Lot P1 — Page : adaptation à D1, D2 et D4

Constats : C-01 (page), C-14 (page), C-40 (conversion), C-47. Rien de plus que ce qu'il faut pour que la page actuelle reste juste face au serveur corrigé ; la mise en forme définitive est celle de la refonte.

1. **Bancs de la page.** `preview-server.cjs`, `measure-refonte.cjs` et `test-essai-xy-reel.cjs` créent le vrai service avec un faux contrôleur : leur donner un `workOffset` toujours prouvé (objet local, quelques lignes) et un `writeln` sans effet. Vérifier ensuite les étapes du harnais qui passent par `preview-server.cjs` (`--only`).
2. **D1 (C-01).** Fichiers : `touch/job-controls.js`, `touch/program-check-view.js`, `touch/job-dashboard.js`.
   - Refus `ETOUCH_START_OUTSIDE` (instantané `refusals.start`, ou réponse 409) : la ligne d'état de Suivi et de Fichiers affiche les raisons de `programCheck.blocking` ; Démarrer… est grisé par `canStart`.
   - Défense en profondeur : un ticket sans `override` dont le `programCheck` a un axe `outside` n'active jamais Confirmer.
   - Le bouton « Démarrer quand même… » et son dialogue ne sont pas posés ici : critère d'acceptation de la refonte (lot L5), sur le contrat du § 1.2.
   - Preuve : `P/test-bughunt-A2-1.cjs` → `test-job-dialog.cjs` (ou `test-start-override.cjs`), ajouté à `verify-project.cjs`.
3. **D2.** Fichiers : `touch/job-controls.js`, `touch/job-dashboard.js`, `touch/probe-real.js`, `touch/real-motion.js`. Les refus `ETOUCH_OFFSET_*` et les raisons de l'instantané s'affichent par le chemin existant des refus codés, dans les trois langues ; rien d'autre. Le bouton « Vérifier à nouveau » (action `verifyOffset`) est un critère d'acceptation de la refonte. Test : `test-work-offset.cjs` (chaque code, FR / EN / ES, sur Suivi, Sonde et Préparer).
4. **D4 (C-14).** Fichiers : `touch/commissioning.js:503`, `touch/real-motion.js:440` : le grisé de « Relire les réglages » suit `canReadSettings` ; `touch/probe-model.js` : valeurs par défaut du § 1.4 c. Le bouton « Zéro à l'origine machine » et l'assistant du profil sont posés par la refonte (lot L3). Preuve : `P/test-bughunt-A2-6.cjs` → `test-commissioning.cjs`. Test : `test-probe-defaults.cjs` (défauts dans les bornes du serveur).
5. **Catalogue (C-40, C-47).** Retirer `ETOUCH_RESUME_FEED_MODE` (`i18n-messages-machine.js:78`) et `ETOUCH_RESUME_TOOL_OFFSET_ACTIVE` (`i18n-messages.js:1065`). Preuve : `P/test-bughunt-A2-7.cjs` → `test-server-messages.cjs`.

Commits :
- `touch: page follows D1 (refusal with its figures, no confirmation over a proven overrun)`
- `touch: page follows D2 and D4 (offset refusals, settings read in alarm, probe defaults)`
- `touch: dead refusal templates removed, block probe refusals proven in EN and ES`

### Lot P2 — Page : kiosque (D3, rechargement, version)

Constats : C-10 (page), C-33, C-35, C-49, C-64.

1. **D3, côté page (C-10)**, § 1.3. Fichiers : `touch/backlight.js`, `touch/screen-saver.js`. Preuve : `P/test-bughunt-A3-1.cjs` (scénarios 1 et 2) → `test-backlight.cjs` et `test-screen-saver.cjs`. L'attente « un toucher sur un écran noir ne doit pas actionner une commande » n'est pas reprise (limite du § 1.3) : le dire dans le commit. Ajouter : page locale éveillée, panneau éteint par une autre page locale, un toucher, panneau rallumé.
2. **Raccourci de rechargement (C-33)**. Fichier : `touch/screen-saver.js`. Preuve : scénario 3 du même test → `test-screen-saver.cjs`.
3. **Version chargée (C-49)**. Fichier : `touch/tablet-actions.js` : lire `VERSION.json?<horodatage>` une fois au chargement (version chargée) ; à l'ouverture de l'onglet Système, relire la version installée et, si elles diffèrent, l'écrire avec un bouton Recharger refusé hors repos. Test : `test-tablet-actions.cjs`.
4. **Porte de la v2 (C-35)**. Fichier : `touch/tablet-profile.js:309-310` : ne poser `v2Blocked` que pour un travail vu avant le premier repos (`workflow` différent de `idle`, `canStop`, `loading`, `probing`, `d.busy`, `d.halt`). Preuve : `P/test-bughunt-V3-1.cjs` → `test-v2-gate.cjs`.
5. **Textes de démarrage (C-64)**. Fichiers : `touch/startup.js`, `touch/index.html` : table FR / EN / ES des cinq phrases dans `startup.js`, langue lue dans `localStorage` sous `try`. Test : `test-startup.cjs` (table égale au catalogue).

Commits :
- `touch: D3 the page dims only its own kiosk screen and wakes it at every touch`
- `touch: a reload shortcut passes through the screen saver, the System tab shows the loaded version`
- `touch: v2 opens at the first rest after an alarm or a homing, start-up texts in three languages`

### Lot P3 — Page : corrections indépendantes des écrans

Constats : C-16, C-24 (page), C-30 (c), C-31 (assistant), C-32, C-34, C-41 (page), C-44, C-45, C-48, C-52, C-53, et la correction sûre de Q-09.

1. **Pause dont la reprise est refusée (C-16)**. Fichier : `touch/job-dashboard.js` : en pause, `canResume` faux et `resumeReason` présent → la ligne d'état de Suivi affiche la raison traduite, ton d'alerte. Preuve : `P/test-bughunt-A2-10.cjs` → cas de `test-dashboard-pause-guard.cjs` sur DOM synthétique.
2. **Reprise à une ligne (C-32)**. Fichier : `touch/job-resume.js` : `stoppedFile` différent de la sélection → le volet le dit, propose la reprise de `stoppedFile` par défaut, et le plan commence par le nom du fichier. Preuve : `P/test-bughunt-A2-9.cjs` → `test-job-resume.cjs`.
3. **Refus muets (C-31)**. Fichiers : `touch/commissioning.js:163, 187, 283, 298` (l'assistant lit `{ opened: false, error }` et l'écrit sur la ligne de l'étape), `touch/job-controls.js:528-529` (`prepare()` écrit « Opération en cours… »). Preuve : `P/test-bughunt-A2-8.cjs` → `test-commissioning.cjs`.
4. **Appels directs (Q-09)**. Fichiers : `touch/job-controls.js` (expose `pause()`, `stop()`), `touch/status-strip.js:108`, `touch/job-dashboard.js:32-38` : Pause et Arrêter appellent ces fonctions au lieu de `click()` sur un bouton caché. Test : `test-status-strip.cjs` (sous un dialogue, bouton source `inert`).
5. **Progression (C-34, C-52, C-53)**. Fichier : `touch/job-dashboard.js:271-282` : en Run non fini, plafond à 99 même quand toutes les lignes sont acquittées ; `runTrack` remis à zéro à toute entrée dans `running` ; estimation employée seulement si `samePreview` l'accepte. Preuve : `P/test-bughunt-V2-1.cjs` → `test-dashboard.cjs`.
6. **Refus de pilotage périmé (C-30 c)**. Fichier : `touch/job-controls.js` : un refus `ECONTROL` affiché est effacé dès que `pilot.state` change. Preuve : partie (c) de `P/test-bughunt-A2-5.cjs` → `test-control-attribution.cjs` ; les parties (a) et (b) restent pour la refonte.
7. **Suites des corrections du serveur (C-24, C-41)**. Fichiers : `touch/real-motion.js:247-272` (un pas dont `motion.lastJog` dit `refused` remplace « envoyé » par le refus), `touch/job-controls.js` (`serverRefusal` emploie `blockProbe` de l'erreur avec `CNCProbeReal.failureText`). Tests : `test-real-motion.cjs`, `test-probe-real.cjs`.
8. **Petites choses (C-44, C-45, C-48)**. Fichiers : `touch/numeric-pad.js` et `touch/probe-ui.js:299-300` (règle `optional` : un champ facultatif se vide) ; `touch/macros.js:21-22` (bouton masqué s'il n'y a aucune macro) ; `touch/job-controls.js:168` (pour l'opération `control`, le message du serveur). Adapter : `test-control-attribution.cjs:105-106`, à dire dans le commit.

Commits :
- `touch: Suivi says why a resume is refused, a resume from a line names its file`
- `touch: refusals shown where they were asked, direct pause and stop calls`
- `touch: progress capped while running, reset at each run, bound to the loaded version`
- `touch: small page fixes (empty an optional field, macros button, takeover refusal)`

---

## 4. Contrat serveur ↔ page après corrections

### 4.1 Codes de refus nouveaux

| Code | Paramètres | Sens | Lot |
|---|---|---|---|
| `ETOUCH_START_OUTSIDE` | `count` ; `reasons[]` | départ refusé : dépassement prouvé ; dérogeable si `$20=1` | S3 |
| `ETOUCH_TRAVEL_TOO_LOW` | `over`, `min`, `limit` | raison : Z descend trop bas | S3 |
| `ETOUCH_TRAVEL_TOO_HIGH` | `over`, `max`, `limit` | raison : Z monte trop haut | S3 |
| `ETOUCH_TRAVEL_BEYOND` | `axis`, `sign`, `over`, `value`, `limit` | raison : X ou Y dépasse | S3 |
| `ETOUCH_START_OVERRIDE_CHANGED` | — | la dérogation ne correspond plus : confirmer à nouveau | S3 |
| `ETOUCH_START_NO_OVERRIDE` | — | dérogation impossible (`$20` différent de 1) | S3 |
| `ETOUCH_START_NOT_HOMED` | — | départ refusé : prise d'origine à faire ; jamais dérogé | S3 |
| `ETOUCH_ORIGIN_NOT_HOMED` | — | zéro refusé : prise d'origine à faire | S3 |
| `ETOUCH_START_FEED_MODE` | — | reprise à une ligne : la carte n'est pas en `G94` | S4 |
| `ETOUCH_OFFSET_CHECKING` | — | vérification de l'origine de la pièce en attente ou en cours : patienter | S2 |
| `ETOUCH_OFFSET_UNCONFIRMED` | `detail` (`no-answer`, `no-report`, `interrupted`) | la carte n'a pas confirmé : « Vérifier à nouveau » | S2 |
| `ETOUCH_OFFSET_MISMATCH` | `wcs`, `axis`, `stored`, `reported` | la carte n'applique pas l'origine enregistrée, même rechargée | S2 |
| `ETOUCH_OFFSET_SETTINGS` | — | réglages non lus (`$13`) : relire | S2 |
| `ETOUCH_CHECK_OFFSET_UNPROVEN` | — | raison du contrôle : décalage non prouvé | S2 |
| `ETOUCH_CHECK_SYNTAX` | `line` | raison du contrôle : ligne que Grbl lit autrement | S3 |
| `ETOUCH_CHECK_TLO_CANCEL` | `line` | raison du contrôle : `G49` avec un décalage d'outil hérité | S3 |
| `ETOUCH_CHECK_S_ABOVE_MAX` | `s`, `line`, `max` | information : la broche tournera au maximum | S6 |
| `ETOUCH_PROBE_OFFSET` | `axis`, `stored`, `reported` | palpage au bloc arrêté avant tout mouvement | S2 |
| `ETOUCH_PROBE_CONTACT_STUCK` | `seconds` | contact permanent : pince, broche à débrancher | S5 |
| `ETOUCH_PROBE_AMBIGUOUS`, `ETOUCH_PROBE_TRAVEL_UNKNOWN` | `axis` | refus du bloc jusque-là sans code | S6 |
| `ETOUCH_PLATE_TRAVEL` | `search`, `max` | recherche trop longue pour la course | S4 |
| `ETOUCH_PLATE_STREAM`, `_CONTROL`, `_STALE`, `_TIMEOUT` | — | plaque arrêtée : flux perdu, pilotage perdu, rapports périmés, délai | S4 |
| `ETOUCH_MOTION_HOMING` | — | prise d'origine en cours | S4 |
| `ETOUCH_MOTION_AMBIGUOUS` | `axis` | position de l'axe inconnue : prise d'origine depuis la tablette | S6 |
| `ETOUCH_MOTION_DISABLED` | — | déplacements réels non activés | S6 |
| `ETOUCH_SETTINGS_READING` | — | lecture des réglages en cours (1,5 s au plus) | S5 |
| `ETOUCH_ORIGIN_OFFSETS` | — | zéro à l'origine machine refusé : `G92` ou décalage d'outil actif | S5 |
| `ETOUCH_BACKLIGHT_REMOTE` | — | extinction refusée à une page distante (jamais affiché) | S5 |

### 4.2 Champs nouveaux de l'instantané et du flux

| Champ | Forme | Sens | Lot |
|---|---|---|---|
| `workOffset` | `{ state, code, params, detail, wcs, stored, reported, reloaded, attempts, canVerify }` | état de D2 ; `code` nul quand `proven` | S2 |
| `refusals` | `{ <opération>: { code, params?, reasons? } }` pour `load`, `start`, `resume`, `zeroZ`, `blockProbe`, `home`, `unlock`, `spindle`, `macro`, `readSettings`, `setOrigin`, `jog` | le refus codé derrière chaque `…Reason`, seulement quand il a un code | S2 |
| `programCheck.blocking` | `[{ code, params, message }]` | dépassements prouvés, dans le sens de l'opérateur ; vide sinon | S3 |
| `programCheck.overridable` | booléen | la dérogation est possible (`$20=1`) | S3 |
| `programCheck.axes.<A>.usable` | `{ low, high }` ou `null` | bornes utilisables (marge comprise) | S3 |
| `referenceLost` | `'alarm'`, `'restart'` ou `null` | pourquoi la machine n'est plus référencée | S3 |
| `lastAlarm` | `{ code, at, restarted }` ou `null` | dernière alarme, gardée jusqu'à la prochaine prise d'origine | S6 |
| `canReadSettings`, `readSettingsReason` | booléen, texte | la relecture est possible (aussi en alarme) | S5 |
| `spindleStopReason` | texte | pourquoi l'arrêt broche n'est pas offert | S6 |
| `probeInput.test.stage`, `.contactMs`, `.stuck`, `.lastContactAgeMs` | § 1.4 d | faits du diagnostic de la sonde | S5 |
| `motion.lastJog` | forme existante | désormais aussi pour un pas refusé par Grbl (`result: 'refused'`) | S6 |

Le paquet grossit d'environ 300 à 600 octets : à remesurer (Q-16).

### 4.3 Actions et routes

| Action ou route | Changement | Lot |
|---|---|---|
| `verifyOffset` | nouvelle ; gardée par le bail, sans confirmation ; relance la preuve de D2 | S2 |
| `prepare { operation: 'start', override: 'travel' }` | nouveau champ ; la réponse porte `override: { blocking }` | S3 |
| `prepare` / `set-origin` avec `at: 'machine'` | nouveau mode : zéro d'un axe à l'origine machine | S5 |
| `readSettings` | acceptée en alarme ; écrit par la voie directe | S5 |
| `resumePlan` | la réponse porte `programCheck` | S3 |
| `GET` et `POST /api/touch-backlight` | les réponses portent `local` ; `temporary` refusé à une page distante | S5 |
| Erreur de `POST /api/touch-job` | porte `blockProbe` quand le palpage au bloc échoue | S6 |

### 4.4 Changements de sens d'un champ existant

| Champ | Avant | Après |
|---|---|---|
| `canStart`, `startReason` | ignorent le contrôle des courses, la référence et le décalage | faux quand un dépassement est prouvé, que la machine n'est pas référencée (`$22=1`) ou que le décalage n'est pas prouvé |
| `programCheck.verdict` et les verdicts d'axe | `outside` ou `validated` possibles sur un décalage non prouvé ; axes à bit `$23` toujours `unknown` | `unknown` tant que D2 n'a pas prouvé ; axes à bit `$23` vérifiés quand la convention est apprise ; `outside` dès la bande de 0,5 mm |
| `canZeroZ`, `canBlockProbe`, `canMacro`, cadrage laser | ignorent le décalage | faux tant que D2 n'a pas prouvé ; la plaque exige aussi la référence (`$22=1`) |
| Toutes les raisons qui passent par `available()` | — | peuvent valoir, pour quelques secondes, « vérification en cours » ou « lecture en cours » |
| `homed` | inchangé | inchangé ; `referenceLost` le complète |
| `alarmCode` | effacé par la bannière | inchangé ; `lastAlarm` le complète |
| Journal | pas d'entrée `override`, `offset` ; `alarm` seulement pendant un travail | entrées `override` (deux étapes), `offset` (rechargement fait), `alarm` dans tous les cas, `origin` avec `at` |

---

## 5. Commandes machine : ce qui change (entrée de `SURETE.md`)

| Commande | Avant | Après | Preuve attendue |
|---|---|---|---|
| Départ (programme, reprise à une ligne) | aucun garde de course, de référence ni de décalage | refusé si dépassement prouvé (dérogation journalisée, `$20=1`), si non référencée (`$22=1`), si décalage non prouvé ; reprise : `G94` exigé si le préambule ne le fixe pas ; flux et bail revérifiés après la relecture du fichier | `start-travel.test.js`, `reference-guard.test.js`, `work-offset.test.js`, `job-service.test.js` |
| Écritures automatiques au repos (nouvelles) | rien | `$#`, puis au besoin `<autre repère>` et `<repère actif>` ; `$I` (et `$$`) quand la version est inconnue, aussi en alarme | `work-offset.test.js`, `settings-read.test.js` |
| Pas | cible jusqu'à la borne exacte ; possible pendant une prise d'origine annoncée | 0,5 mm gardé avant la borne opposée à la prise d'origine ; refusé pendant une prise d'origine | `motion.test.js` |
| Déplacement continu | inchangé (1 mm) | inchangé | — |
| Zéro d'axe ici | sans exigence de référence | refusé non référencé (`$22=1`), pendant une prise d'origine, pendant la vérification du décalage | `reference-guard.test.js`, `motion.test.js` |
| Zéro d'axe à l'origine machine (nouvelle) | n'existe pas | `G10 L2 P<n> <axe>0` ; gardes du § 1.4 a | `motion.test.js` |
| Zéro Z à la plaque | ni référence, ni course, ni décalage, ni surveillance ; Arrêter sans feed hold dans les 250 ms qui suivent une ligne | référence (`$22=1`), décalage prouvé, cible à 1 mm au moins de la fin de course ; arrêt sur flux perdu, pilotage perdu, rapports périmés, délai ; feed hold si une ligne est en vol ; `G0` après un échec au repos | `plate-probe.test.js` |
| Palpage au bloc | repère actif non recoupé ; enveloppe XYZ symétrique | décalage prouvé avant le ticket et recoupé à l'étape CHECK ; enveloppe du trajet réel (garde assoupli, chaque cible reste bornée par `inside()`) | `block-probe.test.js` |
| Cadrage laser, macro | ignorent le décalage | refusés tant que le décalage n'est pas prouvé | `work-offset.test.js` |
| Relecture des réglages | refusée hors `Idle` ; par le feeder | acceptée en alarme ; par la voie directe | `settings-read.test.js` |
| Arrêt broche | `M5` par le feeder, jeté en alarme, annoncé « envoyé » | en alarme : rien n'est écrit, la réponse le dit | `job-service.test.js` |
| Arrêter, Pause, arrêts Socket.IO | n'atteignent pas une séquence du serveur entre deux lignes | arrêtent d'abord la séquence, de façon synchrone | `index.test.js`, `plate-probe.test.js` |
| Libérer ou prendre le pilotage | change le bail, la séquence continue jusqu'au superviseur | arrête d'abord la séquence | `plate-probe.test.js`, `block-probe.test.js` |
| Socket.IO : `sleep`, `lasertest:off`, `0x9E`, `close` | libres pour tous | exigent le bail quand un autre pilote | `control.test.js`, `control-hook.test.js` |
| Socket.IO : toute commande non sûre | refusée seulement par le bail | refusée aussi pendant une séquence du serveur ou une commande système | `index.test.js` |
| Rétroéclairage | toute session éteint | extinction réservée à la boucle locale ; réveil accepté de partout ; panneau noir rallumé au démarrage | `api.touch.test.js`, `backlight.test.js` |
| Boutons de la page (P1, P3) | Confirmer actif sur un dépassement prouvé ; Pause et Arrêter par `click()` sur un bouton caché | Confirmer jamais actif sans dérogation ; appels directs. Les boutons nouveaux (« Démarrer quand même… », « Zéro à l'origine machine », « Vérifier à nouveau ») sont posés par la refonte et entrent alors dans sa table « ancien → nouveau » | tests de page des lots P1 et P3 |

Aucun garde n'est retiré. Un seul est assoupli : l'enveloppe du palpage XYZ (C-22).

---

## 6. Ce que seule la vraie carte prouve (pour `PROTOCOLE-ESSAI.md`)

Du plus prudent au plus engageant. « E-x » : essais de `FIRMWARE.md` § 5.

| # | Essai | Risque | Ce qu'il tranche |
|---|---|---|---|
| 1 | URL du kiosque dans `~/.xinitrc` ; présence de `touch.backlight.percent` dans `.cncrc` | aucun (lecture) | conditions de D3 (Q-15) |
| 2 | D3 sur la Surface : onglet du PC en veille (l'écran reste allumé), veille du kiosque, toucher, `pm2 restart` panneau éteint, rechargement | aucun | C-10, C-15 |
| 3 | Rechargement après installation : `xdotool` avec et sans `--window`, kiosque éveillé puis en veille | aucun | Q-11, C-33 |
| 4 | E-0 : messages de démarrage, `$S` ou `$+` | aucun mouvement | nature du firmware, sens de `$39` |
| 5 | E-H : point d'accès Wi-Fi de la carte, constat seul | aucun | R12 |
| 6 | Redémarrer CNCjs, carte au repos puis en alarme : la version revient-elle seule ? | aucun mouvement | D4 b ; `$I` et `$$` en alarme |
| 7 | E-E : 60 rapports au repos, cadence de `WCO:` | aucun mouvement | délais de D2 |
| 8 | E-C : `$H`, puis MPos, `$#` et `WCO` ; trois fois ; rapports `Home` vus ? | prise d'origine | L3, L5, Q-05 |
| 9 | D2 en vrai : après `$H`, le journal montre `$#`, `G55`, `G54`, puis `proven` ; l'écran affiche les coordonnées de la pièce | prise d'origine | C-02 |
| 10 | E-B : le décalage exécuté après `$H` (rechargement automatique désactivé pour l'essai, petite commande lente dont les deux trajectoires possibles sont dégagées) | petit mouvement | Q-01 |
| 11 | E-1 : `0x18` à l'arrêt | aucun mouvement | Q-04 |
| 12 | E-A : frontière des six bornes par `$J=G53`, pas de 0,05 mm | mouvements lents | Q-02, Q-03, la marge de 0,5 mm, R1 |
| 13 | E-D : `$HX`, ordre, durée | prise d'origine | L4, R14 |
| 14 | Zéro à l'origine machine en X, puis lecture de `$#` | aucun mouvement | D4 a |
| 15 | D1 en vrai : le fichier de T2 chargé, le refus chiffré, puis une origine relevée | aucun mouvement | C-01 |
| 16 | Diagnostic de la sonde : pince sur l'outil, broche branchée puis débranchée | aucun mouvement | D4 d, T9 |
| 17 | Plaque : recherche trop longue refusée ; palpage normal ; Arrêter dans la demi-seconde après Confirmer | palpage | C-07, C-08 |
| 18 | E-F : `G38.3` sans contact, puis contact au départ | palpage dans le vide | Q-07 |
| 19 | E-2 : `ALARM:2` sans mouvement (`G53 G0 Z0.5`) | alarme, référence perdue | L7 ; puis C-05 : `$X`, Démarrer refusé |
| 20 | E-3 : `0x18` pendant un déplacement lent | référence perdue | L9 |
| 21 | E-G : broche, `S1000`, `S18000`, correction au minimum | broche en marche | R11, C-37 |
| 22 | Sur la RT, quand elle sera rallumée : `refonte/A2/inert.html` dans Chromium 106 | aucun | Q-09 |

Après E-A et E-B, revoir : la marge (§ 1.2), le profil LUNYEE (L5, L6), et la gravité de la partie « pas » de C-06.

---

## 7. Ce qui est écarté

| Élément | Raison |
|---|---|
| C-36 (prise d'origine partielle externe) | sans effet sur la LUNYEE ; durcir toucherait la reconnaissance du cycle, sans essai possible |
| C-50 (mot de passe Wi-Fi dans les arguments) | un seul utilisateur sur la tablette ; le mot de passe circule déjà en clair en HTTP ; la forme `passwd-file` de `nmcli` n'a pas été essayée |
| C-51 (kiosque hors dépôt) | fichiers hors de la propriété des lots S et P, et contenu réel inconnu sans accès à la Surface ; l'essai n° 1 le relève |
| C-56 (Arrêter sur un rapport périmé) | un feed hold au repos met la carte en `Hold:0`, dont on ne sort que par `~` ou un reset, qui peut faire perdre la référence sur cette carte : le remède est pire que le défaut |
| C-69 (test broche sans surveillance) | nouveau garde à décider avec l'opérateur : `IDEES.md` |
| C-70 (identité du pilote rejouable) | par conception ; le corriger demande une authentification par appareil |
| Q-06 (`homed` vrai sans cycle) | dépend de Q-05 |
| Refuser la fermeture du port pendant un travail, quel que soit l'appelant (option de A3-5) | le garde par le bail suffit au cas prouvé |
| Voile de la page tant que le réveil n'est pas confirmé (V4) | plus lourd que D3 ne l'exige ; le cas restant est derrière les limites du § 1.3 |
| Reconnaître aussi « adresse distante = adresse locale » (V3) | D3 dit « boucle locale » ; l'erreur de l'autre choix est sans danger |
| C10 (alléger le flux) | change le protocole du flux, risque élevé, hors chantier A |
| Rechargement automatique sur `VERSION.json`, bouton « Réinitialiser la carte » | fonctions nouvelles : `IDEES.md` |
| Gardes de course en `G94` pour tout départ (au-delà de C-59) | casserait les programmes qui ne fixent pas `G94`, sans cas prouvé |
| Marge de 0,5 mm du côté de la prise d'origine | la position d'après `$H` est la borne elle-même ; `G53 G0 Z0` doit rester permis |

---

## 8. Ce que l'auteur de ce plan n'a pas vérifié

- Aucun test n'a été lancé et aucune correction n'a été prototypée : les comportements décrits viennent de la lecture du code et des rapports.
- La liste des tests existants que chaque correction casse vient des contre-vérifications et d'une lecture ciblée. D2 en cassera d'autres si un fichier de test n'a pas reçu `provenOffset` ; la marge et la garde de référence aussi, dans `motion.test.js` et `job-service.test.js`.
- Non lus : `resume.js` avant la ligne 360, `history.js`, `projects.js`, `wifi.js`, `updates.js`, `machine-profile.js`, `motion-preflight.js`, la plus grande partie de `motion.js` (déplacement continu, cadrage) et de `grbl-simulator.js`, les fichiers de la page hors des passages cités de `job-controls.js`. Lus en entier ou presque : `job-service.js`, `program-check.js`, `plate-probe.js`, `halt.js`, `index.js`, `probe-input.js`, `api.touch.js` (lignes 1 à 200), les parties citées de `block-probe.js`, `control.js`, `backlight.js`, `job-load.js`, `touch-stream.js`.
- Non vérifié dans le code : que l'`ok` d'un `$I` écrit par `writeln` au repos n'a aucun autre effet dans `GrblController` que `feeder.next()` ; que `history.record` accepte les événements nouveaux sans table à compléter ; que les bancs de la page (`preview-server.cjs`) ne servent à aucun test de `verify-project.cjs` (lu : la liste ne les cite pas).
- Le comportement de `G10 L2` en `G91` ou en `G20` sur le binaire de la carte : la valeur écrite est 0, identique dans les deux unités ; le code amont ignore `G91` pour `G10`. Non essayé.
- Le coût en taille du paquet des champs nouveaux (§ 4.2) est estimé, non mesuré.
- Rien sur la vraie carte, la Surface ni la RT. Les points qui en dépendent sont au § 6 ; pour chacun, le plan retient le comportement qui refuse.
