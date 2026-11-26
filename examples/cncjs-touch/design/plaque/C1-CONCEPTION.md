# C1 — Position portée par le rapport, broche datée : conception

Nuit du 26 novembre 2026. Arbre `cncjs-wt/C1`, branche `feat/C1`, base `85725689`. **Conception seule : aucun code, aucun test écrit ni lancé, rien d'essayé sur la tablette ni sur la CNC.** Fait suite à `CONSTAT-RAPPORTS-SANS-POSITION.md` et aux deux contre-avis d'Astra (`N4-AVIS-ASTRA-1.md` dangers 1 et 2 ; `N4-AVIS-ASTRA-2.md` constats 1, 2, 3, 6). Les numéros `fichier:ligne` ont été relus cette nuit dans cet arbre.

## 0. Lecture rapide

1. **Le défaut.** CNCjs fusionne chaque rapport d'état dans le précédent (`GrblRunner.js:110-116`). Un rapport sans `MPos:` garde l'ancienne position, un rapport sans `FS:` garde l'ancienne vitesse, et Touch compte ce rapport comme une nouvelle fraîche (`job-service.js:394`, `:406`).
2. **La correction.** Touch note lui-même, à chaque rapport, ce que **ce rapport-là** portait. Les gardes des mouvements ne lisent plus l'état fusionné : ils lisent cette note, ou refusent.
3. **Pour la LUNYEE, rien ne change en marche normale**, sauf une attente d'une demi-seconde au plus après le `M5` d'un cadrage (§ 3.8). Quand le dernier rapport porte la position, la valeur lue est exactement celle d'aujourd'hui.
4. Rien n'est modifié dans `src/server/controllers/Grbl/` : les autres clients de CNCjs ne voient aucune différence.
5. Un refus nouveau, voulu : broche **commandée** (`M3` / `M4`), même à vitesse nulle. Remède à l'écran : « Arrêter la broche ».

## 1. La règle

**R-1, position.** Pour tout mouvement lancé par Touch, une position lue par une garde vient d'un rapport qui **portait lui-même** X, Y et Z, daté à sa réception. Si le dernier rapport reçu ne la porte pas, la position est **inconnue** : ni l'ancienne, ni zéro.

**R-2, repos prouvé.** La machine est « arrivée » quand les **deux derniers** rapports reçus portent la position, disent `Idle`, donnent la même position à 0,01 mm, et sont tous deux postérieurs à l'`ok` de la ligne.

**R-3, broche.** La broche est tenue pour arrêtée seulement si : le dernier rapport porte un `FS:` complet de vitesse 0 ; **et** un `$G` de moins de 2,5 s dit `M5`. Bloquent : une vitesse non nulle ; un `$G` qui dit `M3` ou `M4`, **quelle que soit** la vitesse (`M3 S0` compris) ; un champ `A:` qui dit `S` ou `C` ; une information manquante ou trop ancienne.

**R-4, jamais en faveur du mouvement.** Information absente ou contradictoire : refus avant de partir ; en cours de séquence, plus aucune ligne, puis l'arrêt existant.

### 1.1 Où mesurer la fraîcheur

Un seul endroit : `r.status`, dans `job-service.js:393-411`, premier écouteur de Touch sur l'événement `status` du parseur. Il reçoit la charge **du rapport seul**, avant fusion, avec la ligne brute dans `payload.raw` (`GrblLineParser.js:77` ; `GrblRunner.js:119` ne retire `raw` que de l'état gardé, pas de la charge émise à `:124`).

Ajouts purs à l'enregistrement `r` (rien de retiré, `r.seen`, `r.xyzAt`, `r.reports` inchangés) :

| Donnée | Mise à jour | Condition exacte |
|---|---|---|
| `r.pos = { report, at, state, m:{x,y,z}, w:{x,y,z} }` | à chaque rapport **positionnel** | La ligne brute porte `\|MPos:` ou `\|WPos:` suivi d'au moins trois nombres finis, **et** `explicitXyz(payload)` est vrai (`:128-131`). `report` = `r.reports` après incrément ; `at` = `clock()`. `m` et `w` sont ceux de la charge (l'un rapporté, l'autre calculé par CNCjs avec le dernier `WCO` : `GrblRunner.js:79-93`, comme aujourd'hui). |
| `r.still` (entier) | à chaque rapport | +1 si le rapport est positionnel, `Idle`, et à 0,01 mm du précédent positionnel ; 1 s'il est positionnel et `Idle` mais ailleurs ; **0 sinon** (sans position, ou autre état). |
| `r.fs = { report, at, speed }` | à chaque rapport à `FS:` **complet** | La ligne brute porte `\|FS:<nombre>,<nombre>` suivi de `\|` ou `>`. `FS:0` et `FS:0,` ne comptent pas (constat 2 d'Astra : le parseur en fait 0, `GrblLineParserResultStatus.js:121-124`). |
| `r.gc = { n, at, spindle, s }` | à chaque `[GC:…]` | Dans `r.modal` (`:587-593`) : compteur, heure, `M3` / `M4` / `M5`, mot `S`. |
| `r.spinHints` (entier) | jamais décrémenté | +1 quand un `FS:` complet a une vitesse > 0, quand un `[GC:]` dit `M3` / `M4`, quand un champ `A:` contient `S` ou `C`. |

Tout est remis à `null` / 0 par la bannière (`r.reset`, `:515-521`, à côté de `r.seen`, `r.xyzAt`, `r.modalSeen`). Les compteurs « rapports reçus / sans position / sans `FS:` complet » depuis la bannière sont ajoutés à l'entrée de journal de chaque cadrage (`motion.js:917-930`) : c'est ce qui permet l'essai réel du § 6, sans écran nouveau.

Trois fonctions de lecture, dans `job-service.js`, passées aux modules comme le sont déjà `spindleStill` et `modalFresh` (`:1414-1502`) :

- `provenPos(r)` : `r.pos` si `r.pos.report === r.reports` et âge ≤ 2,5 s ; sinon `null`.
- `restedSince(r, mark)` : `Math.min(r.still, r.reports − mark) >= 2` et `provenPos(r)` non nul. `mark` est le `reportsAtOk` de la ligne (`plate-probe.js:230`).
- `spindleRefusal(c, r)`, `spindleStopCause(r, session)`, `spindleHeld(r, session)` : § 2.6.

`spindleStill` (`:920-932`) et `settle` (`motion.js:361-392`) **ne sont pas modifiés** : ils servent aussi au départ d'un programme, à l'arrêt (`halt.js`), aux commandes système et aux zéros ; le constat rappelle qu'une correction large de `settle` a déjà coûté un arrêt automatique. Les gardes nouveaux s'**ajoutent** aux anciens (jamais « à la place ») : aucun garde existant n'est assoupli.

### 1.2 Délais (bornes du code, pas des mesures)

| Borne | Valeur | Pourquoi |
|---|---|---|
| Âge maximal de la position prouvée, du `FS:`, du `$G` au départ | 2 500 ms | La constante déjà en place partout (`motion.js:65`, `job-service.js:44`, `plate-probe.js:46`, `block-probe.js:51`). CNCjs demande un rapport toutes les 250 ms au plus, un seul en attente (`GrblController.js:873-903`, `:944-1010`) : dix périodes ; deux périodes et demie pour une carte à 1 Hz. Sur une carte conforme, « rapport frais » et « position fraîche » tombent au même instant. |
| Repos prouvé | 2 rapports (un compte, pas une durée) | Le nombre déjà exigé par `settle` (`motion.js:368`) et `quiet` (`plate-probe.js:277`). Indépendant de la cadence. |
| Concordance des deux rapports | 0,01 mm | `ORIGIN_MOVED_MM` (`motion.js:64`), `POS_TOL` (`block-probe.js:38`). Trois décimales rapportées. |
| Attente d'une preuve (repos, ou `$G` postérieur à l'`ok`) avant d'arrêter | 2 500 ms après que `settle` / `quiet` a rendu la ligne | CNCjs demande `$G` toutes les 500 ms au plus (`GrblController.js:905-942`) : cinq périodes. S'ajoute au délai de ligne existant (durée + 10 s, `job-service.js:2082`), qui reste la borne finale. |

**Non mesuré** : la cadence réelle des rapports et des `$G` de la LUNYEE, et si elle répond à `$G` pendant un `Jog`. La conception n'en dépend pas : pendant une ligne, aucun `$G` frais n'est exigé (§ 2.6).

## 2. Gardes et points de passage touchés

« Aujourd'hui » = lit l'état fusionné par `positionOf` (`motion.js:348-351`) ou `controllerStatus(c)`. Colonne « manque » : ce qui se passe quand l'information exigée n'est pas là.

### 2.1 Un pas (flèches)

| Où | Exige désormais | Manque |
|---|---|---|
| `motion.js:489`, après `jogReady` | `restedSince(r, 0)` : deux rapports positionnels `Idle` concordants, le dernier de moins de 2,5 s. | Refus `ETOUCH_MOTION_NO_POSITION`, rien d'écrit. Vaut pour **tout** pas, 0,01 mm compris. |
| `:491` (pas > 0,1 mm, broche) | `spindleRefusal` en plus de `spindleOn`. | Refus existant `ETOUCH_MOTION_SPINDLE_STEP` (0,1 mm au plus), inchangé pour les petits pas. |
| `:496` (course restante) | `provenPos(r).m[axe]`. | Sans objet : refusé au-dessus. |
| `watchStep`, `:556` | En plus de `fresh(r)` : `r.pos` de moins de 2,5 s (le dernier rapport n'a pas à être positionnel **pendant** la ligne : un rapport abîmé isolé n'arrête rien). | `cancel(c, r, 'stale')` : `0x85` (`:599-679`), la voie d'aujourd'hui. |

### 2.2 Déplacement continu

| Où | Exige désormais | Manque |
|---|---|---|
| `:755`, après `jogReady` | `restedSince(r, 0)`. | Refus `ETOUCH_MOTION_NO_POSITION`. |
| `continuousReason`, `:743` | `spindleRefusal` en plus de `spindleOn`. | Refus existant (« maintien continu refusé »). |
| `:746`, `:762` (distance jusqu'au bord) | `provenPos(r).m[axe]`. | Sans objet. |
| `stopReason`, `:700` | `r.pos` de moins de 2,5 s. | `cancel(…, 'stale')`, `0x85`. |

### 2.3 Cadrer à vide (CNC)

| Où | Exige désormais | Manque |
|---|---|---|
| Plan, `job-service.js:1978` | `restedSince(r, 0)`. Le plan est refait à l'exécution (`again()`, `:2217-2235`) : la règle vaut deux fois. | Refus `ETOUCH_MOTION_NO_POSITION`. |
| Plan, `:1983-1986` | `spindleRefusal` en plus de `spindleStill`. | Refus : « La broche est commandée (M3)… » ou « …ne dit plus si la broche tourne ». |
| Plan, `:2024-2037` (`wx`, `wy`, `mx`, `my`, `mz`, d'où la montée `:2078`) | Lus dans `provenPos(r)`, un seul rapport pour les cinq. | Sans objet. |
| `cncStop`, `motion.js:974` | `r.pos` de moins de 2,5 s, à chaque pas de 50 ms, en `Jog` aussi. | `['stale', 'ETOUCH_FRAME_STALE']` → `abortFrame` (`:1039-1047`) : fin dans le pas, `0x85`. La preuve D2 **n'est pas** invalidée : une information qui manque n'est pas une machine déplacée. |
| `cncStop`, `:1001` (`offsetOff`, `:1016-1020`) | Jugé seulement quand `provenPos(r)` existe ; `m` et `w` du même rapport. | Rien à ce pas ; la borne est la ligne du dessus. |
| `cncStop`, `:1005` | `spindleStopCause` en plus de `spindleOn`. | `['state', 'ETOUCH_FRAME_STATE', { state: 'spindle' }]`, `0x85`. |
| `cncStep`, entre `:1221` et `:1222` (arrivée) | Après `settle`, attendre `restedSince(r, p.t.reportsAtOk)`. `arrivalOff` (`:1086-1104`) lit ensuite `provenPos(r)`. | `later(check)` : on attend, **rien ne part**. Bornes : 2,5 s, puis `ETOUCH_FRAME_STALE` ; le délai de ligne (`:1204`). |
| `holdReason`, `:1069`, `:1075` (hauteur sûre avant X/Y) | `provenPos(r)` ; s'il manque : attendre, pas arrêter. Puis `spindleHeld` : un `[GC:]` reçu **après l'`ok`** de la ligne précédente dit `M5`, et le dernier rapport porte `FS:` 0. Pour la première ligne de déplacement, c'est la preuve que notre `M5` est exécuté. | Attente ; à 2,5 s, arrêt `spindle` ou `stale`. Jamais une ligne. |
| `:1252` (plancher Z) | `provenPos(r).m.z`, dans le pas qui vient de le prouver. | Sans objet. |

### 2.4 Cadrage laser

| Où | Exige désormais | Manque |
|---|---|---|
| Plan, `job-service.js:1897`, `:1931-1939` | `restedSince(r, 0)` ; `wx`, `wy` dans `provenPos(r)`. **Pas** de garde de broche au plan (il n'y en a pas aujourd'hui, et un laser peut être armé en `M4` : § 3.1). | Refus `ETOUCH_MOTION_NO_POSITION`. |
| `frameStopReason`, `motion.js:945` | `r.pos` de moins de 2,5 s. Après la preuve du `M5` : `r.spinHints` inchangé. | `cancel(…, 'stale')` ou `cancel(…, 'spindle')` : `0x85`. |
| Boucle, `:1284-1297`, avant `sendNext` (`:1297`) | `restedSince(r, session.pending.t.reportsAtOk)` ; avant le premier `$J=` : un `[GC:]` postérieur à l'`ok` du `M5` dit `M5`. | Attente ; à 2,5 s, `cancel`. |

### 2.5 Zéro Z à la plaque, palpage au bloc

| Où | Exige désormais | Manque |
|---|---|---|
| `zeroZReady`, `plate-probe.js:132` | `spindleRefusal` en plus de `spindleStill` (sert aussi au bloc, `block-probe.js:426`). | Refus avec remède. |
| `zeroZReady`, `:157` ; `plateTravel`, `:197` | `restedSince(r, 0)` ; Z dans `provenPos(r)`. | Refus `ETOUCH_MOTION_NO_POSITION`. |
| `zOf`, `:300` (départ `:391`, contact `:399`, `:409-410`, vérification `:414`) | `provenPos(r).w.z`. | Voir la ligne suivante. |
| `send`, `:375`, après `quiet` | Attendre `restedSince(r, t.reportsAtOk)` avant de rendre la main à l'étape suivante. | 2,5 s, puis `stop(c, r, 'ETOUCH_PLATE_STALE')` (`:487-512`) : aucune ligne de plus, arrêt par `halt.js`. |
| `verdict`, `:345` | `r.pos` de moins de 2,5 s ; `r.spinHints` inchangé depuis le départ. | `stop(…, 'ETOUCH_PLATE_STALE')`. |
| Bloc : `positionOf`, `block-probe.js:403-406` (lu à `:444`, `:484`, `:524`, `:800`, `:811`, `:817-822`, `:1030`) | `provenPos(r)`, axes nuls sinon : les refus et échecs existants (`TEXT.position`, `ETOUCH_PROBE_POSITION`) font le reste. | Refus avant ; en cycle, ligne suivante. |
| Bloc : `send`, `:771-781`, après `quiet` | Attendre `restedSince(r, tracker.reportsAtOk)`. | 2,5 s, puis `abort('ETOUCH_PROBE_STALE')` (`:589-610`). |
| Bloc : `verdict`, `:656` | Comme la plaque. | `abort('ETOUCH_PROBE_STALE')`. |

Le contact lui-même vient de la ligne `[PRB:…]` de la carte (`block-probe.js:750-757`, `:830`), pas d'un rapport d'état : inchangé.

### 2.6 Les trois lectures de broche

| Fonction | Quand | Bloque si |
|---|---|---|
| `spindleRefusal(c, r)` | Avant de partir, au repos | `r.gc` absent, de plus de 2,5 s, ou `M3` / `M4` ; carte qui rapporte `FS:` (`r.fs` non nul) : le dernier rapport n'a pas de `FS:` complet, ou sa vitesse est > 0 ; dernier `A:` avec `S` ou `C`. Carte qui n'a **jamais** envoyé `FS:` depuis la bannière : jugée sur le `$G` seul, comme aujourd'hui (`:917-919`). |
| `spindleStopCause(r, session)` | À chaque pas d'une séquence, tout état | `r.spinHints` a changé depuis le repère de la séquence (départ pour CNC, plaque, bloc ; preuve du `M5` pour le laser) : un `M3` suivi d'un `M5` entre deux pas arrête quand même. Carte à `FS:` : dernier `FS:` complet de plus de 2,5 s. Carte sans `FS:` : `$G` de plus de 2,5 s (le garde d'aujourd'hui, `:1474`). Aucun `$G` frais n'est exigé pendant un `Jog` sur une carte à `FS:`. |
| `spindleHeld(r, session)` | Avant chaque ligne après la première | Pas encore de `[GC:]` `M5` avec `r.gc.n` plus grand qu'à l'`ok` de la ligne précédente (noté dans `answers`, à côté de `reportsAtOk`), ou dernier rapport sans `FS:` 0. Attente, puis arrêt à 2,5 s. |

L'adaptateur donné à `motion.js` (`job-service.js:1474`) devient « l'ancien `spindleOn` **ou** `spindleRefusal` » : une union, donc plus strict partout où il sert (`motion.js:491`, `:743`).

### 2.7 Ce qui n'est pas touché, et pourquoi

- **Zéros** (`motion.js:1354-1440`) : `G10 L20` pose le zéro là où la carte **est**, pas là où CNCjs le croit. Ils gardent le lecteur actuel, sinon un rapport abîmé isolé pendant la vérification afficherait « la machine a bougé » à tort.
- **Preuve D2** (`work-offset.js:348-355`) : elle date déjà chaque `WCO:` explicite par son numéro de rapport.
- **Départ d'un programme, arrêt, commandes système, prise d'origine** : `spindleStill` inchangé.
- **Aperçu** (`motion-preflight.js`) : lecture seule, n'écrit rien, n'autorise rien.
- **Pause et dégagement (F2)** : corrigé dans sa branche d'après `F2-CORRECTIONS.md` ; à réunir sur les mêmes données `r.pos` / `r.fs` quand F2 sera fusionné. N4 (R8, R9) s'appuiera sur ces mêmes données.

## 3. Faux refus examinés

| # | Cas | Ce que fait la correction | Verdict |
|---|---|---|---|
| 3.1 | **Laser en `M4` dynamique** (au repos, `FS:…,0` et `$G` `M4`) | Cadrage laser : pas de garde de broche au plan ; il envoie `M5` d'abord (`job-service.js:1949`) puis attend le `$G` `M5`. Zéros : non touchés. Pas > 0,1 mm et continu : **refusés** tant que `M4` est actif ; « Arrêter la broche » envoie `M5` (`:2496`). | Pas de refus nouveau du cadrage ni des zéros. Le refus des grands pas est **voulu** : d'après le Grbl 1.1 amont, un `$J=` garde l'état de broche du moment, donc un laser armé peut émettre pendant un pas. Non relu dans le code de la carte, non essayé. Un programme laser qui finit par `M5` ou `M2` / `M30` ne laisse pas cet état. |
| 3.2 | **Pause `M6`**, zéro Z à la plaque | Si le programme a fait `M5` avant `M6`, ou si l'opérateur touche « Arrêter la broche » (permis en pause, `:1319-1329`, envoie `M5`), le `$G` dit `M5` : accepté. `$G` frais déjà exigé aujourd'hui (`plate-probe.js:133`). | Aucun refus nouveau dans le parcours de Touch. Refus nouveau seulement si le `$G` dit encore `M3` à vitesse 0 : même remède. Une broche coupée à son interrupteur, `M3` resté actif, est déjà refusée (vitesse rapportée > 0). |
| 3.3 | **`WCO:` / `Ov:` un rapport sur dix** (`FIRMWARE.md` § f) | La règle ne demande ni `WCO:` ni `Ov:` : seulement `MPos:` (ou `WPos:`) et `FS:`. `A:`, absent neuf fois sur dix, n'est lu que s'il est là. | Aucun effet. |
| 3.4 | **Rapports à 5 Hz ou à 1 Hz** | Les preuves comptent des rapports, pas des millisecondes. À 1 Hz : âge d'au plus 1 s ; un rapport perdu : 2 s, sous la borne. CNCjs ne demande pas plus de 4 rapports par seconde. | Aucun refus. À 1 Hz, deux rapports perdus de suite arrêtent, comme aujourd'hui (`stale`). |
| 3.5 | **Premier rapport après connexion** | `r.pos` est `null` jusqu'au premier rapport positionnel ; les zéros d'origine de CNCjs (`GrblRunner.js:23-32`) ne sont jamais lus. Deux rapports et un `[GC:]` sont nécessaires. | Refus pendant une période de rapport (250 ms) après le premier : plus court que la lecture des réglages à la connexion. |
| 3.6 | **Palpage (`PRB`)** | `[PRB:…]` n'est pas un rapport d'état : aucun compteur ne bouge. Pendant `G38.2` l'état est `Run` : `r.still` vaut 0, `r.pos` reste frais. `Pn:P` voyage dans un rapport qui porte aussi `MPos:`. | Aucun effet. |
| 3.7 | **Mode `$10`** (`WPos:` au lieu de `MPos:`) | Un rapport `WPos:` est positionnel ; la position machine est calculée par CNCjs avec le dernier `WCO:`, comme aujourd'hui, et les gardes existants de ce mode (`motion.js:192-200`, `envelopeOf`) restent seuls juges. | Aucun refus nouveau. C1 ne renforce pas ce mode. La LUNYEE est à `$10=1`. |
| 3.8 | **LUNYEE, marche normale** | Chaque rapport porte `MPos:` et `FS:` (code amont et seul relevé connu) : `provenPos` = état fusionné, `restedSince` vrai au même instant que `settle`. Seule différence : après le `M5` d'un cadrage, attendre un `[GC:]` postérieur à son `ok`. | 0,5 s au plus par cadrage d'après la cadence de CNCjs. **Non mesuré.** Un arrêt `spindle` sans cause à l'essai dirait que la carte tarde à répondre à `$G`. |
| 3.9 | **Rapport abîmé isolé** (constat, suite B) | Au repos : refus pendant un rapport. Pendant une ligne : rien. Entre deux lignes : attente d'un rapport de plus. | Une gêne de 250 ms ; plus d'arrêt à tort ni de preuve D2 invalidée à tort. |
| 3.10 | **`$G` perdu** | CNCjs ne le redemande qu'après 10 s (`GrblController.js:921`). Entre deux lignes : arrêt à 2,5 s. Au repos : refus jusqu'au `$G` suivant, comme le zéro Z aujourd'hui. | Faux arrêt possible, rare, sens prudent. Accepté. |

## 4. Tests exigés

**Banc.** `__tests__/support/line-bench.js` : le vrai `GrblRunner`, le vrai `createService` ; tout ce que « dit la carte » est une **ligne de texte** passée à `runner.parse` ; un faux côté série note chaque octet écrit, dans l'ordre. Aucun test de C1 n'écrit dans `state.status`. Chaque test est jugé sur les **octets écrits**, pas sur un code de retour seul.

| # | Suite de lignes | Attendu (octets) |
|---|---|---|
| T1 | Constat 1b : position explicite, puis 10 s de `<Idle\|FS:0,0>` ; pas X+ 10 mm. | Rouge avant (`$J=G91 G21 X10 F600` écrit), vert après : rien d'écrit. |
| T2 | Constat 1c : même état, cadrage préparé puis confirmé. | Refus à la préparation ; rien d'écrit. |
| T3 | Constat 1d : rapports sans coordonnées après l'`ok` du `M5`. | `M5` seul ; aucun `$J=` ; `0x85` ; D2 **non** invalidé. |
| T4 | **Contre-séquence d'Astra** : après l'`ok` du `M5`, `<Idle\|MPos:…Z haut…\|FS:0,0>`, puis `<Idle\|FS:0,0>` (la machine a été descendue sans rapport), `[GC:… M5 …]`. | Aucun `$J=` X/Y. Puis deux rapports positionnels à Z bas : arrêt `ETOUCH_FRAME_POSITION`. |
| T5 | Astra 2, constat 3 : après l'`ok` d'une ligne, un `<Jog\|MPos…>` puis un seul `<Idle\|MPos…>` avant le même pas. | Aucune ligne suivante ; un second `Idle` concordant la libère. |
| T6 | Constat 2d, **`M3 S0`** : rapports complets `FS:0,0` ; après l'`ok` du `M5`, `[GC:… M3 … S0]`. | Aucun `$J=`. Variante au repos : cadrage, pas de 100 mm, continu, zéro Z refusés. |
| T7 | Constat 2b / 2e, **`FS:` absent** après un `FS:0,0`, `$G` `M5` frais. | Pas de 100 mm, continu, cadrage, zéro Z refusés ; pas de 0,1 mm accepté. |
| T8 | `FS:0` et `FS:0,` (tronqués). | Comme T7. |
| T9 | Témoin 2c (`FS:0,1000`). | Arrêt `spindle`, comme aujourd'hui. |
| T10 | `M3` puis `M5` entre deux pas de surveillance d'un cadrage. | Arrêt `spindle`, aucune ligne suivante. |
| T11 | Aucun `[GC:]` après l'`ok` du `M5`, rapports parfaits. | Aucun `$J=` ; arrêt à 2,5 s. |
| T12 | Pendant un `Jog` : pas, continu, cadrage CNC, cadrage laser ; les rapports perdent `MPos:` 2,6 s. | `0x85` dans chaque cas ; un seul rapport sans `MPos:` : rien. |
| T13 | Plaque et bloc : rapports sans coordonnées avant le départ ; puis après l'`ok` du premier `G38`. | Avant : aucun `G38` écrit. Après : aucune ligne de plus (ni `G0 Z`, ni `G10`), arrêt par `halt.js`. |
| T14 | Faux refus : laser `M4` au repos (cadrage accepté, `M5` d'abord) ; pause `M6` avec `M5` ; `WCO:` un rapport sur dix ; 1 Hz ; rapports `WPos:` ; rapport abîmé isolé pendant une ligne ; premier rapport. | Chaque mouvement part comme aujourd'hui, mêmes octets. |
| T15 | LUNYEE : `cnc-frame-lunyee.test.js` et `motion-simulator.test.js` (simulateur, vrai parseur). | Mêmes octets qu'avant C1, dans le même ordre. |

**Table de mutations** (une par garde, chacune rétablie avant la suivante ; le test cité doit devenir rouge **sur les octets**) :

| Mutation | Garde retirée | Test qui doit rougir | Pourquoi lui seul |
|---|---|---|---|
| M1 | `r.pos` mis à jour à tout rapport | T1 | Aucun autre garde ne distingue un rapport sans position. |
| M2 | `restedSince` du pas (`motion.js:489`) | T1 | — |
| M3 | `restedSince` du continu (`:755`) | T1, variante continu | — |
| M4 | Position du plan CNC lue dans l'état fusionné | T2 | Le refus de préparation tombe : plan sans ligne Z. |
| M5 | Attente d'arrivée de `cncStep` | T4 | Le `$G` `M5` est fourni : `spindleHeld` passe, seule l'arrivée retient. |
| M6 | `holdReason` lit Z dans l'état fusionné | T4b : arrivée prouvée à Z haut, flux de l'appareil absent (aucune ligne ne part), rapport sans coordonnées, flux revenu | L'arrivée est déjà validée : seule la hauteur sûre retient. |
| M7 à M10 | Âge de `r.pos` dans `cncStop`, `watchStep`, `stopReason`, `frameStopReason` | T12, un cas chacun | `r.seen` reste frais : l'ancien `stale` ne voit rien. |
| M11 | Attente d'arrivée du cadrage laser | T5, variante laser | — |
| M12 | `spindleHeld` (le `[GC:]` postérieur à l'`ok`) | T11 | Aucun `M3` n'est vu : le compteur d'indices ne bouge pas. |
| M13 | `r.spinHints` (mémoire d'un `M3`) | T10 | Le dernier `[GC:]` dit `M5` : `spindleHeld` passe. |
| M14 | `FS:` complet exigé (lecture de `payload.spindle` à la place) | T8 | `$G` `M5` frais : seul le champ tronqué distingue. |
| M15 | « Le dernier rapport porte `FS:` » | T7 | `$G` `M5` frais, aucune vitesse > 0. |
| M16 | `$G` `M3` / `M4` bloque à vitesse 0 | T6 au repos | `FS:0,0` complet dans chaque rapport. |
| M17 à M20 | Plaque : broche stricte ; position au départ ; attente après `quiet` ; âge dans `verdict` | T6, T13 | — |
| M21 à M23 | Bloc : position au départ ; attente après `quiet` ; âge dans `verdict` | T13 | — |

Un mutant qui survit est un garde redondant ou un test trop faible : à trancher et à écrire dans le rapport, pas à passer sous silence.

**Non-régression.** À relancer avant et après : `cnc-frame`, `cnc-frame-lunyee`, `motion`, `motion-simulator`, `motion-release`, `manual-jog-banner`, `release-hand`, `plate-probe`, `block-probe`, `work-offset`, `reference-guard`, `start-travel`, `job-service`, `scenario-profiles`, les `bughunt-*` et `repetition-*`, puis toute la commande du § 3.5 de `PROMPT-NUIT`.

Ce qui change forcément, dit sans détour : **les attentes ne changent pas, les entrées de banc oui.** Dix-sept fichiers de test émettent un rapport **sans contenu** (`runner.emit('status')` : `cnc-frame.test.js:168`, `manual-jog-banner.test.js:94`, `motion.test.js:82`, 32 fois dans `job-service.test.js`…) ou avec `raw` ou `wco` seuls (`plate-probe.test.js:113`, `motion.test.js:183`), et posent la position dans `state.status` (`cnc-frame.test.js:80-83`). Après C1 ces rapports ne portent, à juste titre, aucune position. Leur fonction « rapport » devra fabriquer la ligne `<État|MPos:x,y,z|FS:a,v>` à partir de l'état du banc et l'émettre par le vrai analyseur de ligne. Règle de la phase code : une suite existante ne redevient verte **que** par ce changement d'entrée ; toute attente (`expect`) modifiée est listée une à une dans `C1-RAPPORT.md`, avec sa raison. Cas à surveiller : un test qui retire `FS:` en cours de route et attend que le mouvement continue. S'ajoute, sans rien modifier : les codes nouveaux dans `touch-codes-catalog.js` et les trois langues.

## 5. Ce que la correction ne couvre pas

- **Les pas perdus.** La carte compte ses pas, pas les millimètres réels : après un choc ou un blocage, elle rapporte une position fausse, « portée » et fraîche. Refaire la prise d'origine après tout incident.
- **Un incident manqué.** Carte redémarrée puis déverrouillée par son Wi-Fi pendant que CNCjs ne lisait pas : la référence peut tromper.
- **La suspension de l'hôte.** Les rapports sont datés à leur réception (`job-service.js:394`). Surface en veille : le serveur dort aussi, n'arrête rien, et au réveil des rapports en tampon peuvent paraître frais. Condition d'emploi : pas de mise en veille automatique pendant un mouvement.
- **Ce que la broche fait vraiment.** Le serveur lit une consigne, jamais une rotation. `M3 S0` est refusé parce qu'on ne sait pas ce que fait le variateur.
- **Un `M3 S0` envoyé pendant une ligne** par un autre client n'est vu qu'à la fin de la ligne (une seule ligne, 60 s nominales au plus, sans les rampes). D'après un commentaire du code (`job-service.js:2488`), Grbl le refuse en `Jog` ; non vérifié sur la carte.
- **Une collision pendant le trajet.** Comparer l'arrivée ne prévient rien en route.
- **Deux rapports faux et concordants**, ou une carte qui rapporterait une position figée : hors de portée d'un contrôle de présence.
- **Le mode `$10=0`**, les zéros, le départ d'un programme : non renforcés ici (§ 2.7).

## 6. Essai réel proposé (15 minutes, fraise en l'air)

Depuis le kiosque de la Surface seulement. Table vide, aucune pièce, fraise courte montée ou pince vide, main près de l'arrêt d'urgence. Rien ne se fait sans vous.

1. **Version.** Vérifier, là où la tablette affiche sa version, que c'est bien celle de C1.
2. **Prise d'origine**, puis un pas X+ 10 mm, un pas Z+ 1 mm, un maintien continu Y+ de deux secondes. Attendu : tout part comme avant.
3. **Cadrer à vide** sur un petit programme connu, Z à mi-hauteur. Attendu : montée, tour, retour, comme avant ; le départ après `M5` ne tarde pas de plus d'une seconde. Un arrêt « (spindle) » ou « rapports trop anciens » ici est un résultat à me rapporter tel quel, pas à contourner.
4. **Lire le journal** du cadrage (l'entrée « frame » du journal de Touch) : « rapports sans position » et « sans FS » doivent valoir 0. Toute autre valeur est la réponse à la question laissée ouverte par le constat : notez-la.
5. **Broche commandée à vitesse nulle.** Rien près de la broche. Depuis le PC, console de CNCjs classique : `M3 S0`. Regardez et écoutez la broche (elle peut tourner lentement : notez-le). Sur la tablette : « Cadrer à vide… » et un pas de 10 mm doivent être **refusés**, avec la phrase « La broche est commandée (M3) » ; un pas de 0,1 mm reste permis. Touchez « Arrêter la broche » : tout redevient permis.
6. **Zéro Z à la plaque**, pince posée sur la plaque, fraise 20 mm au-dessus, broche débranchée : le palpage se déroule comme avant.

Ce que l'essai ne peut pas montrer : un rapport sans position, que la carte n'est pas connue pour émettre. Cette partie n'est prouvée qu'au banc (§ 4).

## 7. Ce qui n'est pas vérifié

- Rien n'est codé ni exécuté : les tests et les mutations du § 4 sont une exigence, pas un résultat. Les reproductions du constat n'ont pas été rejouées cette nuit.
- Le nombre exact de tests existants dont l'entrée de banc doit changer, et l'absence d'attente à modifier : à établir en phase code.
- La cadence des rapports et des `$G` de la LUNYEE ; sa réponse à `$G` pendant un `Jog` ; le délai réel après `M5`.
- Qu'un `$J=` émette sur un laser armé en `M4`, et que Grbl refuse `M3` pendant un `Jog` : d'après le Grbl amont et un commentaire du code, non relus dans le firmware de la carte.
- Le comportement de la broche sur `M3 S0`.
- La version installée sur la Surface.
- Les libellés exacts (français, anglais, espagnol) des trois refus nouveaux et leur tenue à l'écran.
- `block-probe.js` : les points de lecture ont été relevés par recherche et lus par extraits, pas le fichier entier.
