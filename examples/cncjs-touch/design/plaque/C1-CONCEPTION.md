# C1 — Position portée par le rapport, broche datée : conception (révision 4)

Nuit du 26 novembre 2026. Arbre `cncjs-wt/C1`, branche `feat/C1`. **Conception seule : aucun code, aucun test écrit ni lancé, rien d'essayé sur la tablette ni sur la CNC.** Fait suite à `CONSTAT-RAPPORTS-SANS-POSITION.md` et aux contre-avis d'Astra sur N4. **Révision 2** : après le contre-avis d'Astra sur la révision 1 (`C1-AVIS-ASTRA-1.md`, verdict « à revoir ») ; les réponses point par point sont au § 8. **Révision 3** : après son second contre-avis (`C1-AVIS-ASTRA-2.md`, « à revoir, corrections ciblées ») ; réponses au § 9. Règle de cette dernière passe : une garde qui créerait un faux refus sur un parcours normal (départ d'un programme, reprise, sortie d'alarme par `$H` / `$X`) est **retirée**, et le risque restant est écrit comme limite. **Révision 4** : après son troisième contre-avis (`C1-AVIS-ASTRA-3.md`), limitée à la correction qu'il demande avant le code (le second repère, § 1.1) et à ses six points « à vérifier au code » (§ 4.1) ; réponses au § 10. Les numéros `fichier:ligne` ont été relus cette nuit dans cet arbre.

## 0. Lecture rapide

1. **Le défaut.** CNCjs fusionne chaque rapport d'état dans le précédent (`GrblRunner.js:110-116`). Un rapport sans `MPos:` garde l'ancienne position, un rapport sans `FS:` garde l'ancienne vitesse, et Touch compte ce rapport comme une nouvelle fraîche (`job-service.js:394`, `:406`).
2. **La correction.** Touch note lui-même, à chaque rapport, ce que **ce rapport-là** portait, lu dans sa ligne brute. Les gardes des mouvements lisent cette note, ou refusent.
3. **Pour la LUNYEE, les valeurs lues sont celles d'aujourd'hui** quand chaque rapport porte `MPos:` et `FS:`. Ce qui change : une attente d'un `$G` entre deux lignes d'une séquence (ordre de grandeur une demi-seconde par ligne, **non mesuré**, § 1.2).
4. Rien n'est modifié dans `src/server/controllers/Grbl/` : les autres clients de CNCjs ne voient aucune différence.
5. Deux refus nouveaux, voulus : broche **commandée** (`M3` / `M4`) même à vitesse nulle ; carte qui ne donne pas un `FS:` complet. Remède à l'écran : « Arrêter la broche », ou la phrase qui dit ce qui manque.
6. Les voies par lesquelles Touch écrit sur la machine sont toutes listées au § 2.8, avec leur statut.
7. **C1 n'est pas une protection universelle.** Les petits pas (≤ 0,1 mm, pour la broche), la prise d'origine, la reprise après une pause et la trajectoire des programmes et des macros restent limités comme le dit le § 5.

## 1. La règle

**R-1, position.** Pour tout mouvement lancé par Touch, une position lue par une garde vient d'un rapport qui **portait lui-même** X, Y et Z, daté à sa réception. Si le dernier rapport reçu ne la porte pas, la position est **inconnue** : ni l'ancienne, ni zéro.

**R-2, repos prouvé.** La machine est « arrivée » quand les **deux derniers** rapports reçus portent la position, disent `Idle`, donnent la même position à 0,01 mm, et sont tous deux postérieurs à l'`ok` de la ligne.

**R-3, broche.** La broche est tenue pour arrêtée seulement sur deux preuves **positives** : le dernier rapport porte un `FS:` complet dont la vitesse **vaut 0** ; et le dernier `$G`, de moins de 2,5 s, porte **un seul** mode de broche, **`M5`**. Tout le reste bloque : vitesse non nulle, négative ou illisible ; `M3`, `M4`, aucun mode, plusieurs modes ; information absente ou trop ancienne. Pendant une séquence, un champ `A:` avec `S` ou `C` l'arrête aussi (révision 3 : il ne verrouille plus un départ, § 2.6). **Une carte qui n'envoie pas `FS:` n'est jamais « supposée sans `FS:` »** : elle est refusée (révision 2).

**R-4, jamais en faveur du mouvement.** Information absente ou contradictoire : refus avant de partir ; en cours de séquence, plus aucune ligne, puis l'arrêt existant. Une information **absente** n'est pas un **écart constaté** : elle n'invalide pas la preuve du décalage (D2).

**R-5, au dernier moment.** Les preuves sont refaites **dans le pas même de l'écriture**, après toute attente. Une preuve acquise plus tôt n'autorise jamais l'envoi.

### 1.1 Où mesurer la fraîcheur

Un seul endroit : `r.status`, dans `job-service.js:393-411`, écouteur de Touch sur l'événement `status` du parseur. La charge reçue est celle **du rapport seul** : elle n'hérite pas des champs absents. Elle est émise **après** que CNCjs a fusionné son état (`GrblRunner.js:121-124`) : C1 lit **la charge et sa ligne brute** `payload.raw` (`GrblLineParser.js:77`), jamais `runner.state`.

**Lecture stricte de la ligne brute** (le parseur de CNCjs n'est pas modifié ; il accepte `MPos:1,2,3foo`, `FS:0,` et `FS:0,-1`, `GrblLineParserResultStatus.js:28`, `:121-124`). La ligne `<…>` est découpée sur `|`, comme le fait déjà `probe-input.js:77`. Un champ compte seulement s'il est **entier** :

- position : exactement un champ `MPos:` ou `WPos:`, de la forme `-?chiffres(.chiffres)?` répétée 3 à 6 fois, séparée par des virgules, rien d'autre. **Les valeurs X, Y, Z de ce repère sont prises dans ce champ brut**, pas dans la charge (révision 3 : `<Idle|MPos:1,2,3|junk:MPos:4,5,6|FS:0,0>` a un seul champ `MPos:` entier, mais le parseur livre 4, 5, 6 dans `payload.mpos`, `GrblLineParserResultStatus.js:28`, `:47-54`). **Le second repère n'est jamais repris de la charge** (révision 4). Le parseur lit aussi un champ parasite : `<Idle|MPos:1,2,-20|junk:WPos:1,2,-40|FS:0,0>` donne à la fois `MPos` et un `WPos` de −40, et le Runner ne calcule alors rien, puisqu'il ne convertit que si **un seul** des deux repères existe (`GrblRunner.js:79-93`) ; la concordance du repère principal, seule exigée en révision 3, passait. Deux règles : (a) **provenance** : si le texte `MPos:` ou `WPos:` apparaît **plus d'une fois** dans la ligne brute, en tout et où que ce soit, le rapport n'est pas positionnel ; (b) **dérivation** : Touch calcule lui-même l'autre repère, `WPos = MPos − WCO` (ou `MPos = WPos + WCO`), avec le **WCO retenu** : celui du champ `WCO:` de ce rapport s'il en porte un, sinon le dernier reçu depuis la bannière. Un champ `WCO:` ne compte que s'il est entier et unique, lu dans la ligne brute comme la position. Aucun `WCO:` reçu depuis la bannière : le second repère est **inconnu** (`null`), le premier reste lisible ;
- vitesse : exactement un champ `FS:` fait de deux nombres **sans signe** séparés par une virgule, rien d'autre ; la vitesse est le second nombre **de ce champ brut** ;
- `[GC:…]` : les mots de la ligne brute sont comptés ; `spindle` vaut `M5` seulement s'il y a **un** mot parmi `M3`, `M4`, `M5` et que c'est `M5`.

Un champ en double, tronqué ou suivi de caractères en trop rend le champ **absent**.

Ajouts purs à l'enregistrement `r` (`r.seen`, `r.xyzAt`, `r.reports` inchangés) :

| Donnée | Mise à jour | Contenu |
|---|---|---|
| `r.pos = { report, at, state, m:{x,y,z}, w:{x,y,z} }` | à chaque rapport **positionnel** | `report` = `r.reports` après incrément ; `at` = `clock()`. Le repère rapporté vient du champ brut validé ; l'autre est **calculé par Touch** (révision 4), avec le WCO retenu, ou vaut `null`. Aucune valeur de position ne vient de la charge. Le même calcul que celui de CNCjs : l'autre est calculé par CNCjs avec le dernier `WCO:` reçu (`GrblRunner.js:79-93`). Ce calcul n'est pas une preuve du décalage : D2 reste seul juge (`work-offset.js`). |
| `r.still` (entier) | à chaque rapport | +1 si le rapport est positionnel, `Idle`, et à 0,01 mm du précédent positionnel ; 1 s'il est positionnel et `Idle` mais ailleurs ; **0 sinon**. |
| `r.fs = { report, at, speed }` | à chaque rapport à `FS:` complet | `speed` : le second nombre. |
| `r.gc = { n, at, spindle }` | à chaque `[GC:…]` (`r.modal`, `:587-593`) | `n` : compteur ; `spindle` : `'M5'`, `'on'` (`M3` ou `M4`) ou `null` (aucun mot, ou plusieurs). |
| `r.spinHints` (entier) | jamais décrémenté | +1 pour un `FS:` complet de vitesse ≠ 0, un `[GC:]` dont `spindle` n'est pas `'M5'`, un champ `A:` contenant `S` ou `C`. |
| `r.seenCounts = { reports, noXyz, noFs }` | à chaque rapport | Compteurs depuis la bannière, écrits dans le journal de chaque séquence (§ 6). |

Tout est remis à `null` / 0 par la bannière (`r.reset`, `:515-521`). Le traitement existant d'un `WCO:` explicite (`work-offset.js:348-355`) n'est pas touché : il agit aussi sur un rapport sans XYZ.

Lectures, dans `job-service.js`, passées aux modules comme le sont déjà `spindleStill` et `modalFresh` (`:1414-1502`). **Aucune ne lève d'exception ; aucune ne renvoie un objet à déréférencer** :

- `posOf(r, 'm' | 'w', axe)` : le nombre, ou `null` si le dernier rapport n'est pas positionnel ou a plus de 2,5 s.
- `restedSince(r, mark)` : vrai si `Math.min(r.still, r.reports − mark) >= 2` et si la position est lisible. `mark` est le `reportsAtOk` de la ligne (`plate-probe.js:230`), 0 au départ.
- `positionRefusal(r)` : `null`, ou le refus `ETOUCH_MOTION_NO_POSITION` quand `restedSince(r, 0)` est faux.
- `spindleRefusal(r)`, `spindleWatch(r, ref)`, `spindleHeld(r, ref)` : § 2.6.

`spindleStill` (`:920-932`), `settle` (`motion.js:361-392`), `quiet` (`plate-probe.js:252-288`) et l'adaptateur `spindleOn` (`job-service.js:1474`) **ne sont pas modifiés** (révision 2 : l'adaptateur sert aussi à la surveillance, `motion.js:1005` ; le durcir aurait arrêté un cadrage sur un rapport isolé). Les gardes nouveaux s'**ajoutent**, par des fonctions séparées pour le départ et pour la surveillance.

### 1.2 Délais

Ce sont des **seuils du code**, contrôlés au passage suivant du superviseur (50 ms pour les mouvements, 100 ms pour les palpages), pas des temps de réponse garantis ni des mesures.

| Seuil | Valeur | D'où il vient |
|---|---|---|
| Âge maximal de la position, du `FS:`, du `$G` au départ | 2 500 ms | La constante déjà en place (`motion.js:65`, `job-service.js:44`, `plate-probe.js:46`, `block-probe.js:51`). |
| Repos prouvé | 2 rapports (un compte) | Le nombre déjà exigé par `settle` (`motion.js:368`) et `quiet` (`plate-probe.js:277`). |
| Concordance | 0,01 mm | `ORIGIN_MOVED_MM` (`motion.js:64`), `POS_TOL` (`block-probe.js:38`). |
| Attente d'une preuve entre deux lignes | 2 500 ms à partir du moment où `settle` / `quiet` rend la ligne ; l'échéance effective est **le plus tôt** de cette attente et de la borne propre à la ligne : durée + 10 s pour un cadrage (`job-service.js:2082`) ; pour la plaque, durée + 15 s, 15 s ou 30 s selon la ligne (`plate-probe.js:397-423`) ; pour le bloc, durée + 15 s (`block-probe.js:799`). | Choix prudent, à confronter à l'essai. |

**Ordres de grandeur, pas des garanties.** CNCjs interroge la carte (`?`) toutes les 250 ms **si** la réponse précédente est arrivée ; sinon il attend jusqu'à 5 s avant de redemander (`GrblController.js:885-895`). Il demande `$G` toutes les 500 ms dans les mêmes conditions, **pause comprise** ; mais la reprise à 10 s après une réponse perdue n'existe que **travail à l'arrêt et machine `Idle`** (`:917-930`). Pendant une pause `M6`, un `$G` perdu peut donc arrêter durablement les demandes suivantes. Conséquence acceptée et dite : un zéro Z à la plaque lancé dans cette pause s'arrête alors à l'échéance, l'échec marque `probeFailed` (`plate-probe.js:451-453`) et **la reprise du programme est refusée**. Aujourd'hui déjà, sans `$G` frais, ce palpage ne démarre pas (`plate-probe.js:133`) ; ce qui est nouveau, c'est l'arrêt en cours de palpage. À surveiller à l'essai (§ 6). Un rapport ou un `$G` perdu peut donc **arrêter à tort** une séquence au seuil de 2,5 s : sens prudent, accepté, à relever à l'essai. Le temps ajouté par l'attente du `$G` entre deux lignes n'est **pas connu** : le journal de la séquence note l'attente de chaque ligne (§ 6).

## 2. Gardes et points de passage touchés

### 2.1 Matrice de la broche (révision 2)

| Mouvement | Au départ | Pendant une ligne | Avant la ligne suivante |
|---|---|---|---|
| Pas ≤ 0,1 mm | Rien : **exception voulue et conservée** (`MAX_SPINDLE_STEP_MM`, `motion.js:72`, `:491`), pour tangenter broche en marche. | Rien. | — |
| Pas > 0,1 mm | `spindleRefusal`, `motion.js:491`. | `spindleWatch` dans `watchStep` (`:539-563`) : nouveau. | — |
| Continu | `spindleRefusal`, `continuousReason` `:743`. | `spindleWatch` dans `stopReason` (`:681-707`) : nouveau. | — |
| Cadrage CNC | `spindleRefusal`, plan `job-service.js:1983`. | `spindleWatch` dans `cncStop`, à côté de `spindleOn` inchangé (`motion.js:1005`). | `spindleHeld` dans `holdReason` (`:1053-1082`), dans le pas de l'écriture. |
| Cadrage laser | Rien au plan (§ 3.1) ; le `M5` est la première ligne. | `spindleWatch` dans `frameStopReason` (`:934-952`), **à partir** de la preuve du `M5`. | `spindleHeld` avant `sendNext` (`:1297`). |
| Zéro Z à la plaque | `spindleRefusal`, `zeroZReady` `plate-probe.js:132`. | `spindleWatch` dans `verdict` (`:330-350`). | `spindleHeld` dans `send`, juste avant `:374`. |
| Palpage au bloc | `spindleRefusal` par `zeroZReady` (`block-probe.js:426`). | `spindleWatch` dans `verdict` (`:638-661`). | `spindleHeld` dans `send`, juste avant `:768`. |
| Macro, départ d'un programme | `spindleRefusal` (§ 2.8). | Non surveillé par C1 : limite dite. | — |
| Prise d'origine | **Inchangé** (révision 3, § 2.8). | Non surveillé. | — |

### 2.2 Un pas, un déplacement continu

| Où | Exige désormais | Manque |
|---|---|---|
| Nouvelle garde `moveReady` = `jogReady` puis `positionRefusal` ; appelée par `step` (`motion.js:489`), `start` (`:755`), `frame` (`:1123`), les deux plans (`job-service.js:1897`, `:1978`) **et l'instantané** (`motion.js:1501`). | Deux rapports positionnels `Idle` concordants, le dernier de moins de 2,5 s. Vaut pour tout pas, 0,01 mm compris. | Refus `ETOUCH_MOTION_NO_POSITION`, rien d'écrit ; `canJog` faux et `jogReason` renseigné, donc flèches grisées avec la phrase. |
| `:496` ; `continuousReason` `:746` ; `:762` | `posOf(r, 'm', axe)` : `null` donne les refus existants (« position machine inconnue », `limitsAt`, `motion.js:259-261`). `continuousReason` est aussi appelé par l'instantané (`:1504`) : il ne lève jamais. | Refus. |
| `watchStep` `:556` ; `stopReason` `:700` | `r.pos` de moins de 2,5 s (pendant la ligne, le dernier rapport n'a pas à être positionnel). Plus `spindleWatch` (§ 2.1). | `cancel(…, 'stale')` ou `cancel(…, 'spindle')` : `0x85` (`:599-679`). |

`holdReason` garde `jogReady` seul (`:1065`) : entre deux lignes, une position qui manque fait **attendre**, pas arrêter.

**Pause et Arrêter ne passent par aucune de ces gardes** (`stop`, `motion.js:837-843` ; actions d'arrêt, `job-service.js:2326`) : elles restent utilisables sans la main et sans coordonnées. L'instantané reste complet quand la position manque.

### 2.3 Cadrer à vide (CNC)

| Où | Exige désormais | Manque |
|---|---|---|
| Plan, `job-service.js:1978` ; refait à l'exécution (`again()`, `:2217-2235`) | `moveReady`, puis `spindleRefusal` en plus de `spindleStill` (`:1983-1986`). | Refus avec phrase. |
| Plan, `:2024-2037` (`wx`, `wy`, `mx`, `my`, `mz`, d'où la montée `:2078`) | `posOf`, les cinq valeurs du même rapport. | Refus existant `ETOUCH_LASER_FRAME_POSITION`. |
| `cncStop`, `motion.js:974` | `r.pos` de moins de 2,5 s, à chaque pas, en `Jog` aussi. | `ETOUCH_FRAME_STALE` → `abortFrame` (`:1039-1047`), `0x85`. D2 **non** invalidé. |
| `cncStop`, `:1001` (`offsetOff`) | Jugé seulement quand la position est lisible ; `m` et `w` du même rapport. Un écart **constaté** arrête comme aujourd'hui. | Rien à ce pas. |
| `cncStep`, avant `:1222` (arrivée) | Attendre `restedSince(r, p.t.reportsAtOk)` ; `arrivalOff` lit `posOf`. Un écart **constaté** garde son arrêt `ETOUCH_FRAME_POSITION` et invalide D2 (`:1225`), comme aujourd'hui. | `later(check)` : rien ne part ; échéance du § 1.2, puis `ETOUCH_FRAME_STALE`. |
| `holdReason`, `:1069-1080`, exécuté dans le pas même de `sendNext` (`:1238-1254`) | Position lisible (sinon attendre) ; hauteur sûre lue par `posOf` ; `spindleHeld`. | Attente, puis arrêt `stale` ou `spindle`. Jamais une ligne. |
| `:1252` (plancher Z) | `posOf(r, 'm', 'Z')`, dans ce même pas. | Sans objet. |

### 2.4 Cadrage laser

| Où | Exige désormais | Manque |
|---|---|---|
| Plan, `job-service.js:1897`, `:1931-1939` | `moveReady` ; `wx`, `wy` par `posOf`. | Refus. |
| `frameStopReason`, `motion.js:945` | `r.pos` de moins de 2,5 s ; `spindleWatch` après la preuve du `M5`. | `cancel(…)`, `0x85`. |
| Boucle, avant `sendNext` (`:1297`), dans le même pas | `restedSince(r, session.pending.t.reportsAtOk)` ; `spindleHeld`. | Attente, puis `cancel`. |

### 2.5 Zéro Z à la plaque, palpage au bloc

| Où | Exige désormais | Manque |
|---|---|---|
| `zeroZReady`, `plate-probe.js:132`, `:157` ; `plateTravel`, `:197` | `spindleRefusal` ; `positionRefusal` ; Z par `posOf`. | Refus. |
| Plaque : `zOf`, `:300` (départ `:391`, contact `:399`, `:409-410`, vérification `:414`) | `posOf(r, 'w', 'Z')`. La plaque lit son contact **dans les rapports d'état**, pas dans `[PRB:]` : c'est pourquoi le repos prouvé compte ici. | `null` : échecs existants (`:400`, `:415`). |
| Plaque : `send`, `:363-387` | Les cibles sont calculées **avant** `send` (`:397`, `:404`, `:406`, `:411`, `:421`). Donc, **avant** `c.command` (`:374`), après toute attente et dans le même pas (révision 3, comme le bloc) : `restedSince(r, mark de la ligne précédente)` ; **position égale à 0,01 mm, et repère actif (`r.wcs`) identique, à ceux du repos prouvé qui a servi au calcul** ; `spindleHeld`. Vaut pour le `G10 L20` comme pour les `G0` et `G38`. **Après** `quiet` : attendre `restedSince(r, t.reportsAtOk)`. | Preuve absente : échéance du § 1.2, puis `stop(c, r, 'ETOUCH_PLATE_STALE')` (`:487-512`). Position ou repère **différents** : abandon par la même voie ; ni la cible ni le contact ne sont recalculés. Tout échec de la plaque continue d'invalider D2 (`:458`), comme aujourd'hui. |
| Plaque : `verdict`, `:345` | `r.pos` de moins de 2,5 s ; `spindleWatch`. | `stop(…)`. |
| Bloc : `positionOf`, `block-probe.js:403-406` (lu à `:444`, `:484`, `:524`, `:800`, `:811`, `:817-822`, `:1030`) | `posOf`, axes nuls sinon. | Refus et échecs existants. |
| Bloc : `send`, `:733-793` (révision 2) | La ligne est calculée **avant** l'appel (`:873`), et `send` peut attendre le retour du flux (`:740-744`). Donc, **juste avant** `c.command` (`:768`), après toute attente et dans le même pas : `restedSince(r, session.okReports)` ; **position égale à 0,01 mm, et repère actif identique, à ceux du repos prouvé de la ligne précédente** (ceux qui ont servi au calcul, gardés dans la session) ; `spindleHeld`. **Après** `quiet` : attendre `restedSince(r, tracker.reportsAtOk)`. | Preuve absente : `abort('ETOUCH_PROBE_STALE')` (`:589-610`). Position **différente** : `ETOUCH_PROBE_POSITION`, la ligne n'est pas envoyée (elle n'est pas recalculée). |
| Bloc : `verdict`, `:656` | `r.pos` de moins de 2,5 s ; `spindleWatch`. | `abort(…)`. |

Pour le bloc, le contact vient de `[PRB:…]` (`block-probe.js:750-757`, `:830`) : inchangé. **Aucun `0x85` n'est ajouté pour arrêter un `G38`** : les palpages s'arrêtent par leurs voies (`stop`, `abort`, puis `halt.js`).

### 2.6 Les trois lectures de broche

| Fonction | Rend « bloqué » si |
|---|---|
| `spindleRefusal(r)` : départ, au repos | Le dernier rapport n'a pas de `FS:` complet, ou sa vitesse n'est pas 0 ; `r.gc` absent, de plus de 2,5 s, ou `spindle !== 'M5'`. Le champ `A:` **n'entre pas** dans ce refus (révision 3) : un `A:S` ne s'efface qu'à un rapport portant `Ov:` sans `A:` (`GrblRunner.js:103-108`), un rapport sur dix environ ; l'employer ici aurait refusé un départ juste après un arrêt normal de la broche. Trois refus codés : broche qui tourne (phrase existante), `ETOUCH_MOTION_SPINDLE_COMMANDED`, `ETOUCH_MOTION_SPINDLE_UNKNOWN`. |
| `spindleWatch(r, ref)` : à chaque pas d'une séquence, tout état | `r.spinHints !== ref.hints` (un `M3` suivi d'un `M5` arrête quand même) ; ou dernier `FS:` complet de plus de 2,5 s (un rapport isolé sans `FS:` n'arrête rien ; une disparition durable arrête). **Aucun `$G` frais n'est exigé pendant une ligne** : on ne sait pas si la carte répond à `$G` en `Jog`. |
| `spindleHeld(r, ref)` : avant chaque ligne après la première, dans le pas de l'écriture | Le dernier rapport n'a pas de `FS:` complet à 0 ; ou pas encore de `[GC:]` `'M5'` avec `r.gc.n > ref.gcAtOk` ; **ou ce `[GC:]` a plus de 2,5 s au moment de l'écriture** (révision 3 : l'`ok` d'un `$J=` ou d'un `G0` arrive quand la ligne est planifiée, `plate-probe.js:248-251` ; un `M5` reçu juste après resterait « postérieur » trente secondes plus tard). Faux → attendre ; à l'échéance → arrêt `spindle`. |

`ref` appartient à la séquence : `hints` relevé au départ (à la preuve du `M5` pour le laser) ; `gcAtOk` relevé par `answers` à l'`ok` de **sa** ligne, à côté de `reportsAtOk` (`plate-probe.js:224-231`).

### 2.7 Ce qui n'est pas modifié

- `settle`, `quiet`, `spindleStill`, l'adaptateur `spindleOn`, `halt.js` (qui choisit entre arrêt doux et reset par `spindleOn`, `halt.js:31`).
- La preuve D2 (`work-offset.js`) et son traitement d'un `WCO:` explicite.
- L'aperçu (`motion-preflight.js`) : lecture seule, n'écrit rien, n'autorise rien.
- Pause et dégagement (F2) : dans une autre branche, absent de cet arbre ; à réunir sur `r.pos` / `r.fs` à la fusion. N4 (R8, R9) s'appuiera sur les mêmes données.

### 2.8 Toutes les voies par lesquelles Touch écrit sur la machine

Relevé de tous les `c.command(…)` et `c.writeln(…)` de `src/server/services/touch/` (recherche sur le dossier entier ; onze fichiers en contiennent).

| Voie | Où | Mouvement d'axe ? | Statut |
|---|---|---|---|
| Pas, continu | `motion.js:398` | Oui | **Couverte** (§ 2.2). |
| Cadrage CNC, cadrage laser | `motion.js:398` | Oui | **Couverte** (§ 2.3, 2.4). |
| Zéro Z à la plaque | `plate-probe.js:374` | Oui | **Couverte** (§ 2.5). |
| Palpage au bloc | `block-probe.js:768` | Oui | **Couverte** (§ 2.5). |
| **Macro** | `job-service.js:2461`, garde `macroReady` `:1176-1187` (préparation `:2407`, exécution `:2458`) | Oui, contenu libre | **Couverte au départ** (révision 2) : `positionRefusal` et `spindleRefusal` ajoutés à `macroReady`. **Non surveillée ensuite** : Touch ne suit pas les lignes d'une macro. Limite dite au § 5. |
| **Départ d'un programme**, y compris la reprise à une ligne (même garde, `:1014`) | `job-service.js:2574`, garde `readyFor` `:995-1003` | Oui | **Couverte au départ, broche seule** (révision 2) : `spindleRefusal` ajouté après `spindleStill` (`:1003`). Position : non concernée, le contrôle de course travaille sur le décalage (prouvé par D2), pas sur la position courante. Le programme lui-même n'est pas surveillé par C1 (hors du lot). |
| **Prise d'origine** `$H` | `job-service.js:1530`, garde `homeReady` `:1300-1317` | Oui | **Garde de départ inchangée** (révision 3 : la garde ajoutée en révision 2 est retirée). `$H` sert à sortir d'une alarme, et en alarme « Arrêter la broche » n'écrit pas `M5` (`:2492-2494`), Arrêter ne fait pas de reset sans travail ni file (`:2677`) : un refus sur un ancien `M3` n'aurait eu aucun remède depuis le kiosque. Reste `spindleStill` (`:1306`). Limite dite au § 5. **En revanche la position apprise à la fin du cycle est corrigée** (§ 2.9). |
| Reprise après une pause | `job-service.js:2539`, `:1877` | Oui (le programme continue) | **Non concernée** : la broche est normalement en marche ; le programme repart d'où la carte est. Hors du lot. |
| Relance de la broche après `M6` | `job-service.js:1862` (`M3 S…`, `G4`) | Non | Non concernée : aucune ligne d'axe ; c'est la broche elle-même. |
| Essai de broche | `job-service.js:1543` | Non | Non concernée. |
| Zéros (`G10 L20`, `G10 L2`) | `motion.js:1385` par `:398` | Non | Non concernée : la carte pose le zéro là où **elle** est. Lecteur actuel gardé, sinon un rapport abîmé isolé pendant la vérification afficherait « la machine a bougé » à tort. |
| Preuve D2 (`$#`, `G54` / `G55` sans mot d'axe) | `work-offset.js:221` | Non | Non concernée. |
| `G0` seul après un palpage (mode modal) | `plate-probe.js:446`, `block-probe.js:1107` | Non (aucun mot d'axe) | Non concernée. |
| Lecture des réglages (`$$`…) | `job-service.js:1230`, `:1256` | Non | Non concernée. |
| Déverrouillage `$X`, corrections de vitesse, chargement | `:1520`, `:2510`, `job-load.js:237` | Non | Non concernée ; `$X` n'est conditionné par aucune garde de C1. |
| « Arrêter la broche » (`M5`) | `:2480-2497` | Non | Pendant un bloc ou un cadrage, c'est déjà l'arrêt de la séquence (`:2483-2491`). **Pendant la plaque**, un `M5` est aujourd'hui injecté (`:2496`) et son `ok` serait pris pour celui de la ligne du palpage, ce qui fausserait `gcAtOk`. Révision 3 : pendant la plaque, « Arrêter la broche » devient l'arrêt du palpage (`plateStop`), comme pour le bloc. |
| Arrêts : `0x85`, pause, feed hold, reset, arrêt du programme | `motion.js:610`, `:645`, `:649`, `:1591` ; `job-service.js:564`, `:2605`, `:2629`, `:2643`, `:2651`, `:2688-2693` ; `halt.js:56-95` ; `plate-probe.js:502-503` ; `block-probe.js:602-603`, `:1159` | Arrêtent | **Jamais conditionnés** par une garde de C1. |

Ce que Touch n'écrit pas lui-même (console et boutons de CNCjs classique, Wi-Fi de la carte) n'est pas une voie de Touch : non couvert, par définition.

### 2.9 Position apprise après la prise d'origine (révision 3)

Une garde **indirecte**. À la fin de notre `$H`, `homeEnd()` (`job-service.js:387-392`) copie la position **fusionnée** (`homeMposOf`, `:134-143`) dans `r.homeMpos` dès que `Home` a été vu (`:436`), même si le rapport `Idle` final ne porte aucun XYZ. Cette position choisit ensuite la convention des courses (`motion.js:241-244`) pour les pas, le continu, les cadrages, les palpages et le contrôle d'un programme (`job-service.js:1819`), et les rapports suivants ne la corrigent pas. Le cycle d'un autre client exige déjà une position explicite (`:470-472`).

Correction : `r.homeMpos` n'est appris que si **ce rapport `Idle` final** est positionnel au sens strict du § 1.1, et depuis ses valeurs (`r.pos.m`, `r.pos.report === r.reports`) ; sinon `r.homeMpos = null`, aux deux endroits (`:436`, `:472`). Rien n'est exigé **avant** `$H`, et `r.homed` n'est pas touché : la prise d'origine réussit comme aujourd'hui. Effet d'un `null` : la course reste ambiguë pour un axe référencé vers le négatif, donc les refus existants (`ETOUCH_MOTION_AMBIGUOUS`, `ETOUCH_CNC_FRAME_Z`) jusqu'à une nouvelle prise d'origine. Sur la LUNYEE, dont chaque rapport porte `MPos:`, rien ne change.

## 3. Faux refus examinés

| # | Cas | Ce que fait la correction | Verdict |
|---|---|---|---|
| 3.1 | **Laser en `M4` dynamique** (au repos, `FS:…,0` et `$G` `M4`) | Cadrage laser : pas de garde de broche au plan ; `M5` d'abord (`job-service.js:1949`), puis `spindleHeld`. Zéros : non touchés. Pas > 0,1 mm, continu, macro, départ d'un programme : **refusés** tant que `M4` est actif ; « Arrêter la broche » envoie `M5` (`:2496`). | Pas de refus nouveau du cadrage ni des zéros. Le reste est **voulu** : d'après le Grbl 1.1 amont, un `$J=` garde l'état de broche, donc un laser armé peut émettre pendant un pas. Non relu dans le code de la carte, non essayé. Un programme laser qui finit par `M5` ou `M2` / `M30` ne laisse pas cet état ; un programme arrêté en route par Touch passe par un reset. |
| 3.2 | **Pause `M6`**, zéro Z à la plaque | `M5` avant `M6` dans le programme, ou « Arrêter la broche » (permis en pause, `:1319-1329`) : le `$G` dit `M5`, accepté. `$G` frais déjà exigé aujourd'hui (`plate-probe.js:133`). | Aucun refus nouveau au départ. **Risque nouveau, dit au § 1.2** : un `$G` perdu pendant le palpage arrête celui-ci et interdit la reprise. |
| 3.3 | **`WCO:` / `Ov:` un rapport sur dix** | Ni `WCO:` ni `Ov:` ne sont exigés. `A:` n'est lu que s'il est là. | Aucun effet. |
| 3.4 | **Rapports à 5 Hz ou à 1 Hz** | Les preuves comptent des rapports. À 1 Hz, un rapport perdu : 2 s, sous le seuil ; deux de suite arrêtent, comme aujourd'hui. À 1 Hz l'attente de deux `Idle` peut approcher le seuil de 2,5 s : **cas à tester** (§ 4). | Pas de refus attendu ; marge mince à 1 Hz, dite. |
| 3.5 | **Premier rapport après connexion ou bannière** | `r.pos`, `r.fs`, `r.gc` sont `null` : tout mouvement est refusé jusqu'à deux rapports complets et un `[GC:]` `M5`. Les zéros d'origine de CNCjs (`GrblRunner.js:23-32`) ne sont jamais lus. | Refus bref, voulu. |
| 3.6 | **Palpage (`PRB`)** | `[PRB:…]` ne touche aucun compteur. Pendant `G38` l'état est `Run` : `r.still` vaut 0, `r.pos` reste frais. | Aucun effet. |
| 3.7 | **Mode `$10`** (`WPos:`) | Un rapport `WPos:` est positionnel ; la position machine reste calculée avec le dernier `WCO:`, et les gardes existants de ce mode (`motion.js:192-200`) restent seuls juges. | Aucun refus nouveau ; mode non renforcé. La LUNYEE est à `$10=1`. |
| 3.8 | **LUNYEE, marche normale** | Valeurs lues identiques ; `restedSince` vrai au même instant que `settle`. Différence : `spindleHeld` avant chaque ligne d'une séquence. | Temps ajouté **inconnu** : à lire dans le journal de l'essai. Un arrêt `spindle` sans cause dirait que la carte tarde à répondre à `$G`. |
| 3.9 | **Rapport abîmé isolé** | Au repos : refus le temps d'un rapport. Pendant une ligne : rien. Entre deux lignes : attente. | Gêne brève ; plus de D2 invalidé à tort. |
| 3.10 | **`?` ou `$G` perdu** | Reprise de CNCjs à 5 s (`?`) ou, **seulement travail à l'arrêt et machine `Idle`**, à 10 s (`$G`) : voir la condition et sa conséquence en pause `M6` au § 1.2. Arrêt au seuil de 2,5 s entre deux lignes ; refus au repos jusqu'au suivant. | Faux arrêt possible, sens prudent, accepté. |
| 3.12 | **Sortie d'alarme par `$H` ou `$X`** | Aucune garde de C1 sur leur départ. | Aucun refus nouveau (révision 3). |
| 3.13 | **Départ juste après un arrêt normal de la broche** (`A:S` vu, puis `M5`) | `A:` n'entre pas dans le refus de départ ; `FS:` 0 et `[GC:]` `M5` suffisent. | Aucun refus nouveau (révision 3). |
| 3.14 | **Départ d'un programme, reprise** | Départ : `spindleRefusal`, satisfait par une machine au repos, broche arrêtée ; un programme commande ensuite sa broche lui-même. Reprise après pause : non touchée. Un `$G` perdu au repos est redemandé par CNCjs après 10 s. | Refus nouveau seulement sur `M3` / `M4` actif à vitesse nulle (remède : « Arrêter la broche », qui fonctionne au repos) ou `FS:` incomplet. |
| 3.11 | **Carte sans `FS:`** (Grbl compilé sans broche variable) | Refus de tout mouvement gardé par `spindleRefusal`. Aucun repli. | **Refus voulu**, nouveau : une telle carte n'est pas la cible. Le seul relevé de la LUNYEE porte `FS:0,0`. |

## 4. Tests exigés

**Banc.** `__tests__/support/line-bench.js` : le vrai `GrblRunner`, le vrai `createService`, la **vraie preuve D2** (`work-offset.js`) dans au moins un parcours par mouvement ; tout ce que « dit la carte » est une ligne de texte passée à `runner.parse`. Les échanges sont **complets** : `[GC:…]` **puis son `ok`**, l'`ok` de nos lignes à part (le pont existant retire l'`ok` des `$G`, `support/sim-bridge.js:96-100` : il ne suffit pas). Un faux côté série note chaque octet écrit. Les `[GC: M5]` des tableaux sont une **abréviation** : le banc injecte la ligne modale complète (`[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]`), que le vrai parseur reconnaît, et son `ok` à part. Chaque test est jugé sur les **octets écrits**. Une exception JavaScript ou un refus venu d'une autre garde ne valent pas preuve : le test vérifie aussi **le code du refus**.

| # | Suite de lignes | Attendu |
|---|---|---|
| T1 | Constat 1b : position explicite, puis 10 s de `<Idle\|FS:0,0>` ; pas X+ 10 mm. | Rouge sur l'ancien code (`$J=` écrit), vert après : rien d'écrit, `ETOUCH_MOTION_NO_POSITION`. |
| T1b | Position explicite et fraîche, mais `<Jog\|MPos…>` puis **un seul** `<Idle\|MPos…>` ; pas, puis continu. | Rien d'écrit ; un second `Idle` concordant libère. |
| T2 | Constat 1c : cadrage préparé puis confirmé sur des rapports sans coordonnées. | Refus à la préparation. |
| T3 | Constat 1d : rapports sans coordonnées après l'`ok` du `M5`. | `M5` seul ; `0x85` ; D2 **non** invalidé. |
| T4 | **Contre-séquence d'Astra** : après l'`ok` du `M5`, Z haut explicite, puis `<Idle\|FS:0,0>`, `[GC: M5]` et son `ok`. | Aucun `$J=`. Puis deux rapports à Z bas : `ETOUCH_FRAME_POSITION`, D2 invalidé. |
| T4c | Après l'`ok` d'une ligne : `[GC: M5]`, puis `Jog` positionnel, puis **un seul** `Idle` positionnel à la bonne place. | Aucune ligne suivante ; un second `Idle` la libère. |
| T4h | Hauteur sûre seule : arrivée du `M5` prouvée à Z = −5,005 ; puis deux `Idle` concordants à −5,054 (toléré par l'arrivée à 0,05 mm, refusé par la hauteur sûre), le cas de `F1-CORRECTIONS.md`. | Aucun X/Y ; `ETOUCH_FRAME_POSITION` axe Z. |
| T6 | **`M3 S0`** : rapports complets `FS:0,0` ; `[GC: M3 S0]` au repos. | Cadrage, pas de 100 mm, continu, zéro Z, bloc, macro, départ d'un programme refusés (`…SPINDLE_COMMANDED`) ; pas de 0,1 mm accepté ; `$H` et `$X` **comme aujourd'hui**. |
| T7 | **`FS:` seul disparaît** : XYZ frais, `[GC: M5]` frais, aucun indice positif ; au repos. | Mêmes refus (`…SPINDLE_UNKNOWN`) ; `$H` accepté. |
| T7s | Même disparition **pendant** une ligne de chaque séquence, 2,6 s : grand pas, continu, cadrage CNC, cadrage laser, plaque, bloc. | Arrêt par la voie de chacun. Un seul rapport sans `FS:` : rien. |
| T8 | `FS:0`, `FS:0,`, `FS:0,-1`, `FS:0,0foo`, `MPos:1,2,3foo`, deux champs `MPos:`, `<Idle\|MPos:1,2,3\|junk:MPos:4,5,6\|FS:0,0>` (position **inconnue**, jamais 4, 5, 6) ; `[GC:]` sans mode de broche, puis avec `M3 M5`. | Chacun compte comme absent : refus. |
| T8b | **Dès la connexion et après une bannière** : uniquement `FS:0`, uniquement `FS:0,`, aucun `FS:` ; `[GC: M5]` frais, XYZ parfaits. | Refus dans les trois cas (aucun repli « carte sans `FS:` »). |
| T9 | Témoin 2c (`FS:0,1000`). | Arrêt `spindle`, comme aujourd'hui. |
| T10 | `[GC: M3]` puis `[GC: M5]` entre deux pas de surveillance. | Arrêt `spindle`. |
| T11 | Aucun `[GC:]` après l'`ok` du `M5`, puis après l'`ok` d'une ligne `$J=` ; rapports parfaits. | Aucune ligne suivante ; arrêt à l'échéance. Variante : un `[GC:]` déjà en vol quand le suivi de la ligne s'installe ne compte pas. Variante (révision 3) : `[GC: M5]` reçu juste après l'`ok` d'un `$J=` de 30 s, aucun autre ensuite, XYZ et `FS:` parfaits : à l'arrivée, **aucune ligne suivante** tant qu'un nouveau `[GC: M5]` n'est pas reçu. |
| T12 | Pendant un `Jog` : pas, continu, cadrage CNC, cadrage laser ; rapports sans `MPos:` 2,6 s. | `0x85`. Un seul : rien. |
| T12b | Tolérance : `Jog` de 30 s, `FS:` complets, **aucun** `$G` nouveau ; puis un rapport isolé sans `FS:`. | Le cadrage continue. |
| T13 | Plaque et bloc : sans coordonnées avant le départ ; après l'`ok` du premier `G38` ; et, coordonnées explicites, un seul `Idle` après l'`ok`. | Aucune ligne de plus ; arrêt par `halt.js`, **sans `0x85`**. |
| T13b | Bloc : flux de l'appareil absent, rapport sans coordonnées, flux revenu avant la fin de la grâce. Variante : position explicite mais déplacée de 0,02 mm. | Aucune ligne (`…STALE`, puis `…POSITION`). |
| T13p | **Plaque** (révision 3) : contact à Z = 0, retrait calculé `G0 Z1` ; pendant l'attente du `[GC:]`, la machine est remontée à Z = 10 ; puis deux `Idle` complets et `[GC: M5]`. Même chose avant le `G10 L20`. Variante : repère changé (`G55`). | Ni `G0 Z1` ni `G10` écrits ; arrêt de la plaque ; D2 invalidé. |
| T13c | Attente après `quiet`, **postcondition de `send`** : après l'`ok` du premier `G38`, `Run` positionnel, un `Idle` à Z = −3,000, puis deux `Idle` concordants à Z = −3,200, `[GC: M5]`. | Code sain : le contact lu est −3,200 et la ligne suivante le porte (`G0 Z-2.2`). Sans l'attente : contact lu à −3,000, puis abandon par la garde d'avant écriture. Les octets diffèrent. |
| T13g | `G38` **longs**, plaque (au repos et pendant `M6`) et bloc : XYZ et `FS:` frais, **aucun** `[GC:]` pendant la descente, une demande `$G` de CNCjs déjà en vol au départ (ses drapeaux reproduits) ; échanges complets après le contact. | Aucun arrêt pendant le `G38` ; le cycle va au bout. |
| T14 | Faux refus du § 3, un par un, dont 1 Hz. | Mêmes octets qu'aujourd'hui. |
| T15 | LUNYEE : `cnc-frame-lunyee`, `motion-simulator`. | Mêmes octets, même ordre ; les attentes ajoutées par ligne sont relevées. |
| T18 | **Position apprise** (révision 3) : état de départ MPos 0, 0, 0 ; notre `$H` ; `<Home>` puis `<Idle\|FS:0,0>` sans XYZ. Témoin : même suite, `Idle` final avec `MPos:`. | `r.homeMpos` reste `null` (course ambiguë, grand pas vers le bord refusé) ; témoin : appris, comme aujourd'hui. `r.homed` vrai dans les deux cas. |
| T19 | `A:S` dans un rapport à `Ov:`, puis `M5`, `FS:0,0`, `[GC: M5]`, **avant** tout rapport `Ov:` sans `A:`. | Départ accepté (pas, cadrage). Le même `A:S` reçu **pendant** une séquence l'arrête. |
| T20 | En alarme, dernier `[GC:]` `M3` reçu avant l'alarme, `FS:0,0` : `$H`, puis `$X`. | Écrits comme aujourd'hui. |
| T16 | Coordonnées absentes : instantané demandé ; Pause, Arrêter, « Arrêter la broche » par un appareil sans la main ; pendant un `G38` ; pendant une attente de preuve ; bannière ; arrêt du service pendant une attente. | Instantané complet, `canJog` faux avec sa raison ; chaque arrêt écrit ses octets ; aucune ligne après une attente résolue trop tard. « Arrêter la broche » pendant la plaque : arrêt du palpage, **aucun `M5` injecté**, aucun `ok` étranger compté pour une ligne. |
| T17 | `WCO:` explicite différent dans un rapport **sans** XYZ. | D2 invalidé comme aujourd'hui. |
| T8w | **Second repère** (révision 4), avec la **vraie** preuve D2 acquise sur un `WCO:` nul : deux rapports `<Idle\|MPos:1,2,-20\|junk:WPos:1,2,-40\|FS:0,0>`, `[GC: M5]` ; zéro Z à la plaque, recherche 10 mm. Cas symétrique : carte en `WPos:` avec `junk:MPos:`. Témoin : mêmes rapports sans le champ parasite. | Refus `ETOUCH_MOTION_NO_POSITION`, **aucun `G38.2`** (sur l'ancien code : `G38.2 Z-50`). Symétrique : pas, cadrage, plaque refusés. Témoin : `G38.2 Z-30`. |
| T8x | Dérivation : rapports `MPos:` sains, `WCO:` 0, 0, −5 reçu trois rapports plus tôt ; puis même suite **sans aucun** `WCO:` depuis la bannière. | Position travail lue = MPos − WCO retenu (la cible du `G38.2` le montre). Sans `WCO:` : position machine lisible, position travail inconnue, plaque et cadrage refusés. |

**Table de mutations** (une à la fois ; le test cité devient rouge sur les octets, **avec le bon code de refus côté sain**) :

| Mutation | Garde retirée | Test | Pourquoi lui seul |
|---|---|---|---|
| M1 | `r.pos` mis à jour à tout rapport | T1 | — |
| M2, M3 | `positionRefusal` du pas, du continu | T1b | La position est lisible : `posOf` ne refuse pas ; seul le compte de repos retient. |
| M4 | `positionRefusal` du plan CNC | T1b, variante cadrage | **Redondance reconnue** avec la lecture du plan sur des rapports sans coordonnées (T2) : les deux gardes sont gardés, T2 ne discrimine pas. |
| M5 | Attente d'arrivée de `cncStep` | T4c | Position lisible et à la cible, `[GC: M5]` fourni : seul le nombre d'`Idle` retient. |
| M6 | Comparaison de hauteur sûre de `holdReason` | T4h | L'arrivée tolère l'écart ; seule la hauteur le refuse. |
| M7 à M10 | Âge de `r.pos` dans `cncStop`, `watchStep`, `stopReason`, `frameStopReason` | T12 | `r.seen` reste frais. |
| M11 | Attente d'arrivée du laser | T4c, variante laser | — |
| M12 | `spindleHeld`, partie `[GC:]` postérieur | T11 | Aucun indice positif. |
| M13 | `r.spinHints` | T10 | Le dernier `[GC:]` dit `M5`. |
| M14 | Lecture stricte de `FS:` | T8 | `[GC: M5]` frais. |
| M15 | « Le dernier rapport porte `FS:` » au départ | T7 | Aucun indice, `$G` frais. |
| M16 | Âge du `FS:` dans `spindleWatch`, par séquence | T7s | XYZ frais, aucun indice. |
| M17 | `spindle === 'M5'` remplacé par « ni `M3` ni `M4` » | T8 (`[GC:]` sans mode) | — |
| M18 | Repli « aucun `FS:` vu : `$G` seul » réintroduit | T8b | — |
| M19 | Attente après `quiet`, plaque | T13c | La garde d'avant écriture bloque aussi la ligne suivante : « aucun octet de plus » ne distinguerait pas. T13c regarde **la cible écrite**. |
| M22 | Attente après `quiet`, bloc | T13c transposé si le cycle lit une position entre `quiet` et l'écriture ; sinon **redondance reconnue** avec M23, à écrire dans le rapport. | Le contact du bloc vient de `[PRB:]`, pas d'un rapport. |
| M20, M23 | Garde avant écriture, plaque et bloc | T13p sans coordonnées, T13b | — |
| M21, M21p | Égalité de position et de repère avant écriture, bloc et plaque | T13b variante 0,02 mm ; T13p | Deux `Idle` complets et `[GC: M5]` frais : seule l'égalité retient. |
| M24, M25 | `spindleRefusal` de la macro, du départ d'un programme | T6 | — |
| M27 | Fraîcheur du `[GC:]` dans `spindleHeld` | T11, variante « `M5` devenu ancien » | L'ordre est satisfait ; seul l'âge retient. |
| M28 | Apprentissage strict de `r.homeMpos` | T18 | — |
| M29 | Valeurs prises dans le champ brut | T8, ligne `junk:MPos:` | Un seul champ entier : seule la comparaison des valeurs retient. |
| M30 | Règle de provenance (une seule occurrence de `MPos:` / `WPos:`) | T8w | La dérivation par Touch donnerait −20 : la plaque partirait, à la bonne cible. Sain : refus. Les octets diffèrent (`G38.2 Z-30` contre rien). |
| M31 | Second repère dérivé par Touch (repris de la charge à la place) | T8w, provenance mutée aussi **ou** T8x avec un `WCO:` parasite dans la charge | Seul avec M30 retirée il écrit `G38.2 Z-50` : **redondance reconnue** entre (a) et (b) sur ce cas, les deux sont gardées ; à écrire dans le rapport. |

Un mutant qui survit est un garde redondant ou un test trop faible : à écrire dans le rapport.

### 4.1 Exigences de la phase code et de sa relecture

Reprises des trois points « à vérifier au code » d'Astra ; le relecteur les contrôle un par un.

1. **Vrais acquittements.** Le banc injecte `[GC:…]` puis `ok`, un échange déjà en vol à l'installation du suivi d'une ligne, des `$G` perdus et retardés, des cadences réalistes dont 1 Hz. `gcAtOk` est relevé à l'`ok` de **notre** ligne, pas à celui d'un `$G` (`plate-probe.js:220-230`). Des parcours avec la vraie preuve D2. **L'attente modale ne doit jamais devenir un délai de 2,5 s pendant un `G38`** : T13g, plaque et bloc.
2. **Conversion des bancs existants.** Le périmètre est **à établir** : une recherche trouve 24 fichiers sous `src/server` qui émettent `status` sans argument (Astra en compte 22 ; la révision 1 en citait 17), et tous n'ont pas forcément besoin d'être convertis. Ils émettent un rapport sans contenu (`cnc-frame.test.js:168`, `motion.test.js:82`, 32 fois dans `job-service.test.js`…) ou avec `raw` ou `wco` seuls (`plate-probe.test.js:113`, `motion.test.js:183`), et posent la position dans `state.status`. Leur fonction « rapport » devra émettre une vraie ligne. Procédé imposé : (a) convertir les bancs dans un commit **à part** ; (b) le faire tourner **sur l'ancien code** : tout vert, sinon la conversion a changé un scénario ; (c) comparer, test par test, les octets écrits et leur ordre avant et après conversion ; (d) garder une entrée « ligne brute » pour les omissions volontaires ; (e) les tests négatifs de C1 échouent sur l'ancien code **avec ce même banc, pour la raison visée**. La fonction de conversion n'ajoute jamais d'elle-même `FS:0,0`, `M5`, un second `Idle` ou du temps : ce qu'elle ajoute est écrit dans le test. Sont listés un à un dans `C1-RAPPORT.md` : chaque `expect` modifié, **et** chaque changement de rapports, d'ordre ou de temporisation. Cas déjà repéré : `cnc-frame.test.js:405` retire la vitesse (`spindle = undefined`) et continue ; avec la règle sans repli, la suite de ce test change et devra être justifiée.
3. **Arrêts préservés, absence distinguée de l'écart.** Aucun `0x85` pour un `G38`. Les attentes nouvelles sont annulables, gardent les réservations (`r.probing`, `s.frame`) et n'envoient rien après une résolution tardive. Aucune garde de C1 sur le chemin d'un arrêt. « Position absente : D2 intact » vaut **pour le cadrage seulement**. La plaque et le bloc gardent leurs invalidations : tout échec de la plaque (`plate-probe.js:458`), tout `G10` écrit ou peut-être écrit, tout reset. Position discordante : D2 invalidé. `WCO:` explicite différent : traité même sans XYZ (T16, T17). Contrôler aussi les bannières et les réservations pendant les attentes.

Ajoutées par le troisième avis d'Astra (ses constats 4, 5, 6, 7, 9, 10) :

4. **Toutes les preuves refaites après chaque attente** (constat 4). Avant écriture, comparer les positions **machine et travail** utiles, et le repère, à celles du calcul de la cible ; couvrir un changement de décalage **dans le même `G54`**. `session.verified` (`motion.js:1195`, `:1229`) ne dispense jamais d'un nouveau repos prouvé après une attente de flux ou de `[GC:]` : tester arrivée validée, puis `Jog`, puis **un seul** `Idle` à la cible → aucune ligne. Pour `r.homeMpos`, la présence positionnelle stricte **s'ajoute** aux conditions existantes (cycle complet, `$23`, conversion `WPos` / `WCO`, `job-service.js:387-392`, `:470-472`) ; aucune n'est retirée.
5. **« Arrêter la broche » pendant la plaque** (constat 5). Le brancher sur `plateStop` ne suffit pas : entre deux lignes, rien en vol, machine `Idle`, files vides, `FS:` 0 et `$G` `M3` → l'ancien `spindleOn` dit faux et `haltPlan` peut ne demander aucun arrêt matériel (`halt.js:33-50`) ; un clic après une annulation automatique retombe sur le retour immédiat de `plateStop` (`plate-probe.js:492-494`). Le chemin appelant choisit explicitement l'arrêt matériel quand il le faut, sans `M5` dans un suivi actif, sans `0x85` pendant un `G38`, sans toucher à l'architecture de `halt.js`. Le message ne dit jamais « broche arrêtée » ni « M5 envoyé » sur la seule annulation de la séquence. Tester ces deux fenêtres.
6. **Pause `M6`** (constat 6). Aucun délai modal pendant la descente `G38` ; l'abandon pour `[GC:]` manquant n'arrive qu'entre deux lignes. Tester séparément : un `G38` long réussi ; une réponse `$G` réellement perdue, puis l'arrêt, puis **la sortie du programme sans reprise automatique** (ce que l'opérateur peut encore faire depuis le kiosque).
7. **D2, réservations, arrêts depuis le kiosque** (constat 7). Invalidations conservées : échec de la plaque, `G10` écrit ou peut-être écrit, reset, `WCO:` explicite différent. Tester **l'interface**, pas seulement l'API : aujourd'hui `canPause` n'inclut pas la plaque (`job-service.js:1747`) et `canSpindleStop` peut être faux pendant son `G38` en pause `M6` (`:1773`) ; un test d'API ne prouve pas que les boutons restent utilisables (harnais `browser-run.cjs`, étapes concernées).
8. **Banc et mutations** (constat 9). Laisser réellement tourner le superviseur et les microtâches entre deux injections, sinon T13c masque sa mutation. `[GC:]` complets avec leur `ok` distinct, dont un échange déjà en vol. Bon code de refus et octets attendus ; une exception ou une autre garde ne tue pas un mutant. Le contre-exemple du constat 1 (T8w) fait partie du banc.
9. **Conversion des anciens tests** (constat 10). Exigence 2 ci-dessus, inchangée : commit séparé, passage sur l'ancien code, comparaison des octets et des chronologies, entrée brute conservée, aucun ajout silencieux, chaque changement d'entrée ou d'assertion justifié ; les tests négatifs échouent sur l'ancien code **pour le défaut visé**.

## 5. Ce que la correction ne couvre pas

- **Les pas perdus.** La carte compte ses pas, pas les millimètres réels. Refaire la prise d'origine après tout incident.
- **Un incident manqué.** Carte redémarrée puis déverrouillée par son Wi-Fi pendant que CNCjs ne lisait pas.
- **La suspension de l'hôte.** Les rapports sont datés à leur réception (`job-service.js:394`). Surface en veille : le serveur dort aussi, n'arrête rien, et au réveil des rapports en tampon peuvent paraître frais. Condition d'emploi : pas de veille automatique pendant un mouvement.
- **Ce que la broche fait vraiment.** Le serveur lit une consigne, jamais une rotation.
- **Un `M3 S0` envoyé pendant une ligne** par un autre client : vu à la fin de la ligne au plus tôt (une ligne, 60 s nominales au plus, sans les rampes). D'après un commentaire du code (`job-service.js:2488`), Grbl le refuse en `Jog` ; non vérifié.
- **Une macro ou un programme en cours.** Gardés au départ seulement. Ce qu'ils font ensuite, et ce qu'un autre client fait pendant, n'est pas surveillé par C1.
- **La prise d'origine** : son départ garde le garde d'aujourd'hui. Un `M3 S0` actif (vitesse fusionnée nulle) ne la refuse pas. Choix assumé : `$H` est la sortie d'alarme, et aucun remède n'existe depuis le kiosque en alarme.
- **Le champ `A:` au départ** : non lu. Une broche dite en marche par `A:` seul, avec `FS:` 0 et `$G` `M5`, ne refuse pas un départ ; elle arrête une séquence en cours.
- **Un `$G` perdu pendant une pause `M6`** : arrête un zéro Z à la plaque en cours et interdit la reprise (§ 1.2).
- **La reprise après une pause** : non touchée.
- **Une carte sans `FS:`** : refusée, pas adaptée.
- **Une collision pendant le trajet** ; **deux rapports faux et concordants** ; le mode `$10=0` ; les zéros.
- **Ce que d'autres clients écrivent** (CNCjs classique, Wi-Fi de la carte) : Touch ne garde que ses propres lignes.

## 6. Essai réel proposé (15 minutes, fraise en l'air)

Depuis le kiosque de la Surface seulement, veille automatique coupée. Table vide, aucune pièce, fraise courte ou pince vide, main près de l'arrêt d'urgence. **Tout refus ou arrêt inexpliqué se note tel quel et arrête l'essai : on ne le contourne pas.**

1. **Version.** Vérifier, là où la tablette affiche sa version, que c'est celle de C1.
2. **Prise d'origine**, puis un pas X+ 10 mm, un pas Z+ 1 mm, un maintien continu Y+ de deux secondes. Attendu : comme avant.
3. **Cadrer à vide** sur un petit programme connu, Z à mi-hauteur. Attendu : montée, tour, retour. Noter si les coins marquent un temps d'arrêt plus long qu'avant.
4. **Lire le journal** de ce cadrage : rapports reçus, sans position, sans `FS:` complet (attendu : 0 et 0), et l'attente relevée avant chaque ligne. Ces chiffres sont le résultat principal de l'essai.
5. **Broche commandée à vitesse nulle.** Rien près de la broche. Depuis le PC, console de CNCjs classique : `M3 S0`. Regardez et écoutez la broche (elle peut tourner lentement : notez-le). Sur la tablette : « Cadrer à vide… » et un pas de 10 mm doivent être **refusés** avec « La broche est commandée (M3) » ; un pas de 0,1 mm reste permis. « Arrêter la broche » : tout redevient permis.
6. **Zéro Z à la plaque**, pince sur la plaque, fraise 20 mm au-dessus, alimentation de la broche coupée : comme avant, en notant la durée. Le refaire **pendant une pause `M6`** d'un programme d'essai sans matière, puis reprendre : la reprise doit rester permise.

Ce que l'essai ne peut pas montrer : un rapport sans position ou sans `FS:`, que la carte n'est pas connue pour émettre. Cette partie n'est prouvée qu'au banc.

## 7. Ce qui n'est pas vérifié

- Rien n'est codé ni exécuté : § 4 est une exigence, pas un résultat. Les reproductions du constat et les cas rejoués par Astra n'ont pas été rejoués par moi.
- Le nombre de tests existants dont l'entrée ou la suite doit changer (périmètre non établi : 17, 22 ou 24 fichiers selon la recherche).
- Les rejeux d'Astra (`junk:MPos:`, `junk:WPos:` avec la vraie D2, `[GC: M5]` classé comme message) : repris de son avis, cohérents avec le motif lu, non rejoués par moi.
- La cadence réelle des rapports et des `$G` ; la réponse de la carte à `$G` pendant un `Jog`, un `G38` et en alarme ; le temps ajouté par ligne.
- Que `payload.raw` accompagne bien l'événement `parserstate` reçu par `r.modal` (lu à `GrblLineParser.js:77`, non rejoué).
- Qu'un `$J=` émette sur un laser armé en `M4` ; que Grbl refuse `M3` pendant un `Jog`.
- Le comportement de la broche sur `M3 S0`.
- La version installée sur la Surface ; où l'opérateur lit le journal.
- Que le contrôle de course du départ d'un programme ne dépende en rien de la position courante (lu dans le constat et les commentaires, pas relu ligne à ligne) ; le cas d'un programme en relatif.
- Les libellés des refus nouveaux dans les trois langues.
- `block-probe.js` : lu par extraits autour des points cités, pas en entier.

## 8. Réponses au contre-avis d'Astra (`C1-AVIS-ASTRA-1.md`)

| # | Constat | Vérifié dans le code | Réponse de la révision 2 |
|---|---|---|---|
| 1 | danger — broche incomplète pendant les séquences | **Confirmé.** `plate-probe.js:330-350` et `block-probe.js:638-661` n'ont aucune lecture de broche ; `watchStep` (`motion.js:539-563`) et `stopReason` (`:681-707`) non plus. La révision 1 n'y mettait que le compteur d'indices. | Matrice § 2.1 : départ, pendant, avant la suivante, pour chaque mouvement. `spindleWatch` (indices **et** âge du `FS:`) dans les six surveillances, grand pas et continu compris. Exception des pas ≤ 0,1 mm écrite. Tests T7 et T7s : `FS:` seul disparaît. |
| 2 | danger — « aucun `FS:` vu » pris pour « carte sans `FS:` » | **Confirmé** : c'était le repli de la révision 1 (§ 2.6), et `FS:0,` donne bien 0 (`GrblLineParserResultStatus.js:121-124`). | Repli supprimé : `FS:` complet exigé partout (R-3, § 3.11). T8b dès la connexion et après bannière ; mutation M18. |
| 3 | danger — macros oubliées | **Confirmé** : `macroReady`, `job-service.js:1176-1187`, n'a que `spindleStill` ; `:1003` et `:1306` aussi. | Inventaire complet § 2.8. Macro : position et broche au départ. Départ d'un programme : broche. `$H` : contradiction seule (garde **retirée en révision 3**, § 9, constat 6). Ce qui reste exposé est nommé au § 5. |
| 4 | danger — le bloc peut écrire après avoir perdu la preuve | **Confirmé** : `block-probe.js:735-744` attend le flux, `ensure` (`:682-693`) ne refait que le verdict, écriture à `:768` ; la ligne est calculée avant (`:873`). | R-5 et § 2.5 : repos, égalité de position et broche dans le pas de l'écriture ; position différente : abandon, pas de recalcul. Même règle pour la plaque. T13b, M20, M21. |
| 5 | à corriger — adaptateur trop strict | **Confirmé** : `spindleOn` de `:1474` est appelé par `cncStop` (`motion.js:1005`) à chaque pas. | Adaptateur **inchangé**. Fonctions séparées : `spindleRefusal` (départ), `spindleWatch` (surveillance), `spindleHeld` (avant la ligne). T12b. |
| 6 | à corriger — l'instantané peut casser | **Confirmé** : `snapshot` appelle `continuousReason` après le seul `jogReady` (`motion.js:1501-1504`). `reason()` (`:1478-1485`) attraperait l'exception, mais publierait son texte comme motif. | Lecteurs sans exception (`posOf`). `moveReady` sert au départ **et** à l'instantané. T16. |
| 7 | à corriger — preuves strictement positives | **Confirmé** à la lecture du motif (`GrblLineParserResultStatus.js:28`) ; les quatre exemples non rejoués par moi. | Lecture stricte de la ligne brute (§ 1.1) ; vitesse **égale** à 0 ; mode unique **égal** à `M5`. T8, M14, M17. |
| 8 | à corriger — délais trop affirmatifs | **Confirmé** : reprises à 5 s et 10 s (`GrblController.js:885-895`, `:921-942`) ; et C1 demande bien un `[GC:]` après chaque ligne. | § 1.2 réécrit : seuils, ordres de grandeur, échéance = le plus tôt des deux bornes. « 0,5 s au plus par cadrage » retiré : temps **inconnu**, relevé au journal. |
| 9 | à corriger — mutations non discriminantes | **Confirmé** pour les cinq lignes citées. | T1b, T4c, T4h, T13 « un seul `Idle` » ; redondance de M4 reconnue ; le bon code de refus fait partie de l'attendu. |
| 10 | à vérifier au code — vrais acquittements | **Confirmé** : `sim-bridge.js:96-100` retire l'`ok` des `$G`. | Exigence 1 du § 4.1 ; variante de T11. |
| 11 | à vérifier au code — conversion des bancs | Admis ; le risque est réel (cas repéré : `cnc-frame.test.js:405`). | Exigence 2 du § 4.1 : commit à part, vert sur l'ancien code, comparaison des octets, rien d'ajouté en silence. |
| 12 | à vérifier au code — arrêts préservés ; absence ≠ écart | **Confirmé** : `stop` et `abort` passent par `halt.js` ; `WCO:` explicite traité à `work-offset.js:348-355`. | Exigence 3 du § 4.1 ; R-4 ; T16, T17. |
| 13 | remarque — charge émise après la fusion ; `MPos`/`WPos` calculé ; `[PRB:]` vaut pour le bloc seul | **Confirmé** (`GrblRunner.js:121-124` ; `plate-probe.js:399-410`). | § 1.1 et § 2.5 corrigés. |

## 9. Réponses au second contre-avis d'Astra (`C1-AVIS-ASTRA-2.md`)

| # | Constat | Vérifié dans le code | Réponse de la révision 3 |
|---|---|---|---|
| 1 | danger — un `$G` ancien autorise la ligne suivante | **Confirmé** : `r.gc.n > gcAtOk` ne dit que l'ordre ; l'`ok` d'un déplacement arrive à la planification (`plate-probe.js:248-251`). | `spindleHeld` exige aussi un `[GC:]` de moins de 2,5 s **au moment de l'écriture** (§ 2.6). Aucune fraîcheur modale pendant la ligne. T11 variante, M27. |
| 2 | danger — la plaque garde la fenêtre fermée pour le bloc | **Confirmé** : cibles calculées avant `send` (`plate-probe.js:399-411`, `:421`). | Même garde que le bloc avant chaque écriture : position et repère égaux à ceux du calcul, sinon abandon, sans recalcul ; `G10 L20` compris (§ 2.5). T13p, M21p. |
| 3 | danger — position apprise après `$H` | **Confirmé** : `job-service.js:436` appelle `homeEnd()` (`:387-392`), qui lit l'état fusionné (`:134-143`) ; employé à `motion.js:241-244` et `job-service.js:1819`. | § 2.9 : appris seulement du rapport `Idle` final strictement positionnel, sinon `null` ; rien d'exigé avant `$H`. T18, M28. |
| 4 | à corriger — valeur de la charge différente du champ validé | **Confirmé à la lecture** du motif (`GrblLineParserResultStatus.js:28`, `:47-54`) ; rejeu d'Astra non refait. | Valeurs du repère rapporté et vitesse prises **dans le champ brut** ; l'autre repère repris de la charge seulement si elle concorde (§ 1.1). T8, M29. **Insuffisant : remplacé en révision 4**, § 10. |
| 5 | à corriger — « dernier `A:` » verrouille un départ | **Confirmé** : la révision 2 ne disait pas quand `A:` s'efface ; la règle existe à `GrblRunner.js:103-108`. | Astra proposait de reprendre cette règle d'effacement. Choix retenu, plus simple et sans aucun faux refus : `A:` **retiré** du refus de départ (reprendre la règle aurait encore refusé un départ jusqu'au rapport `Ov:` suivant) ; gardé comme indice pendant une séquence (`r.spinHints`), jamais comme verrou. Limite au § 5. T19. |
| 6 | à corriger — refus de `$H` en alarme sans remède | **Confirmé** : en alarme, « Arrêter la broche » n'écrit rien (`job-service.js:2492-2494`) ; Arrêter ne fait pas de reset sans travail ni file (`:2677`). | Astra proposait de définir une récupération. Choix retenu : la garde ajoutée à `$H` est **retirée**, départ inchangé ; aucune récupération nouvelle n'est donc nécessaire, et `$X` n'est pas proposé comme contournement. Limite au § 5. T20. |
| 7 | à corriger — reprise `$G` à dix secondes trop générale | **Confirmé** : la reprise exige travail à l'arrêt et machine `Idle` (`GrblController.js:917-930`) ; `probeFailed` à `plate-probe.js:451-453` ; bornes de ligne différentes (`:397-423`, `block-probe.js:799`). | § 1.2 : condition et conséquence écrites (palpage en pause `M6`, reprise refusée) ; borne réelle par ligne. Essai en pause `M6` ajouté (§ 6). |
| 8 | à corriger — M19 / M22 non discriminantes | **Confirmé** : la garde d'avant écriture masque le retrait de l'attente. | T13c observe la cible écrite ; M22 : redondance reconnue si le bloc ne lit rien entre les deux ; variante plaque de T13b : T13p. |
| 9 | à vérifier au code — pas de délai de 2,5 s pendant `G38` | Admis. | Exigence 1 du § 4.1 et T13g ; lignes modales complètes et `ok` distinct dans le banc. |
| 10 | à vérifier au code — arrêts ; portée de « D2 intact » | **Confirmé** : pendant la plaque, « Arrêter la broche » injecte un `M5` (`job-service.js:2480-2496`) ; la plaque invalide D2 sur tout échec (`plate-probe.js:458`). | § 2.8 : pendant la plaque, ce bouton devient l'arrêt du palpage ; T16. « D2 intact » limité au cadrage (§ 4.1). |
| 11 | à vérifier au code — conversion des bancs ; « dix-sept fichiers » | **Confirmé** : ma recherche en trouve 24 sous `src/server`. | Périmètre dit « à établir » ; « pour la raison visée » ajouté (§ 4.1). |
| 12 | remarque | — | Pris note : la couverture reste celle annoncée (départs des programmes et macros, exceptions des petits pas et de la prise d'origine, pas de surveillance de leurs trajectoires). |

## 10. Réponses au troisième contre-avis d'Astra (`C1-AVIS-ASTRA-3.md`)

| # | Constat | Vérifié dans le code | Réponse de la révision 4 |
|---|---|---|---|
| 1 | danger — le repère « calculé » peut venir d'un champ parasite | **Confirmé à la lecture** : le motif (`GrblLineParserResultStatus.js:28`) reconnaît `WPos:1,2,-40` après `junk:` ; le Runner ne convertit que si un seul repère existe (`GrblRunner.js:79-93`), donc il laisse passer les deux ; la plaque contrôle sa course sur `mpos.z` (`plate-probe.js:197`) et calcule sa cible sur `wpos.z` (`:300`, `:391`, `:397`) ; `work-offset.js:348-355` ne voit qu'un `WCO:` explicite. Rejeu d'Astra (D2 vraie, `G38.2 Z-50`) non refait. | § 1.1 : (a) un rapport où `MPos:` / `WPos:` apparaît plus d'une fois n'est pas positionnel ; (b) le second repère est **calculé par Touch** à partir du champ brut validé et du WCO retenu, jamais repris de la charge ; sans `WCO:` reçu, il est inconnu. T8w (avec la vraie D2, et le cas symétrique), T8x, M30, M31. |
| 2 | remarque — lieu de collecte et protections principales | — | Conservé : lectures strictes séparées des lecteurs historiques, aucun repli vers l'état fusionné. |
| 3 | remarque — inventaire complet ; exceptions `A:` et `$H` acceptables | — | § 0, point 7 : C1 n'est pas annoncé comme une protection universelle ; les limites restent au § 5. |
| 4 | à vérifier au code — preuves refaites après les attentes | Admis (`motion.js:1195`, `:1229`, `:1238`). | Exigence 4 du § 4.1. |
| 5 | à vérifier au code — « Arrêter la broche » pendant la plaque | **Confirmé** : `haltPlan` ne demande un reset au repos que si `spindleOn` est vrai (`halt.js:50`) ; retour immédiat de `plateStop` si déjà annulé (`plate-probe.js:492-494`). | Exigence 5 du § 4.1. |
| 6 | à vérifier au code — pause `M6` | Admis. | Exigence 6 du § 4.1. |
| 7 | à vérifier au code — D2, réservations, boutons | **Confirmé** : `canPause` sans la plaque (`job-service.js:1747`), `canSpindleStop` (`:1773`). | Exigence 7 du § 4.1. |
| 8 | remarque — délais ; renvoi de la ligne 3.10 | **Confirmé** : la ligne 3.10 résumait trop largement. | Ligne 3.10 corrigée : elle renvoie à la condition du § 1.2. |
| 9 | à vérifier au code — banc et mutations | Admis. | Exigence 8 du § 4.1. |
| 10 | à vérifier au code — conversion des anciens tests | Admis. | Exigence 9 du § 4.1. |

**Où le second repère est lu** (carte en `MPos:` : la position travail) : plan du cadrage CNC (`job-service.js:2030-2031`, d'où le décalage `:2096-2097`) ; plan du cadrage laser (`:1931-1939`) ; `offsetOff` (`motion.js:1016-1020`) ; plaque (`plate-probe.js:157`, `:300`, donc `:391`, `:397`, `:399`, `:409`, `:414`) ; bloc (`block-probe.js:811`, `:1030`). Tous passent par `posOf(r, 'w', axe)`, donc par la dérivation de Touch. Sur une carte en `WPos:`, c'est la position machine qui est dérivée, et tous les lecteurs de `posOf(r, 'm', axe)` sont concernés ; les gardes existants de ce mode (`motion.js:192-200`) restent en plus. Les zéros gardent le lecteur historique (§ 2.8) et ne sont pas couverts.
