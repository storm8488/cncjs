# F1 — Cadrage à vide : corrections après la relecture de sûreté d'Astra

17 novembre 2026. Relecture : `astra-F1.md` (diff `db584555..f009b7ef`, verdict « à ne pas installer en l'état »). Arbre `C:\Users\damou\Documents\claude\cncjs-wt\F1`, branche `feat/F1`. Aucun accès à la tablette, à la RT ni à la CNC ; aucun push ; rien fusionné.

## Verdict

**Les sept constats tiennent tous à la lecture du code ; aucun n'est rejeté.** Chacun a d'abord eu un test qui reproduit sa fenêtre exacte et qui échouait (exécuté avant la correction), puis la correction, puis le test vert. Les tests jugés non probants (C4) sont refaits. Les quatre dangers sont levés et prouvés par test, sur faux contrôleur et sur simulateur LUNYEE. **R1 (validation physique) reste ouvert** : il relève de l'essai réel, pas du code.

| Commit | Contenu |
|---|---|
| `504f9c3c` touch: F1 review fixes, framing holds the machine and rechecks before every line | `motion.js`, `job-service.js`, `index.js`, `api/api.gcode.js`, `touch/real-motion.js` ; tests `cnc-frame.test.js`, `cnc-frame-lunyee.test.js`, `api/__tests__/api.gcode.test.js` (nouveau), `test-real-motion.cjs`. |
| `c1f32ec5` touch: F1 review, safety entry and real trial updated | `design/refonte/SURETE.md` (section F1 et tableau des corrections), `design/refonte/PROTOCOLE-ESSAI.md` (§ 8 : étapes F1-C14b et F1-C14c). |

Hors arbre (dépôt principal, fichiers de conception non suivis) : `F1-CONCEPTION.md` § 16 « Écarts et corrections après relecture », et ce document.

Contrôles après chaque commit (les deux ont été exécutés sur l'arbre final ; le code de `504f9c3c` est identique à celui testé avant lui) : `verify-project` **225/225** ; Jest `src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator` **55 suites, 1609 tests verts** (avant : 54 suites, 1590) ; ESLint **propre** (0 erreur, 0 avertissement) sur tous les fichiers touchés.

## Constat par constat

`T/` = `src/server/services/touch/__tests__/`. « Fenêtre » = bloc `CNC framing: the windows of the safety review` de `T/cnc-frame.test.js`.

### D1 — danger : un déplacement manuel peut descendre Z pendant le cadrage

- **Vérifié** : `atRest` (`motion.js`) ne regardait que `s.pending`, `s.session`, `s.cancel` ; après `ok` et deux rapports `Idle`, `settle` vide `s.pending` et un pas, un continu, un zéro ou un `frame-prepare` passaient avant le pas suivant du superviseur. Le pas remplaçait l'attente du cadrage, puis `zFloor` prenait la hauteur abaissée.
- **Test (échouait avant)** : « D1 / 26b. between two lines… » (départ Z −5, `M5` répondu, deux rapports, aucun tic : pas Z−1, continu X+, zéro X, second cadrage → tous « Cadrage en cours. », rien d'écrit, puis l'approche part à Z −5) ; « D1 / 26b. the same during a rotation… » (mêmes refus depuis le nouveau flux de l'appareil pendant la rotation) ; `test-real-motion.cjs`, ligne « framing between two lines » (flèches et zéros grisés « Déplacement en cours : attendez l'arrêt. » même si le rapport dit encore `canJog`).
- **Correction** : `atRest` refuse tant que `s.frame` existe (`FRAME_BUSY = 'Cadrage en cours.'`, phrase déjà au catalogue FR/EN/ES) : pas, continu, zéros, second cadrage, et donc `canJog`/`canSetOrigin`/`canFrame` faux. Le superviseur arrête la séquence (`_STATE`, `foreign`) si une autre ligne a pris la place de la sienne. Page : `real-motion.js` grise les flèches dès que `motion.frame` existe. Test 27 mis à jour (raison « Cadrage en cours. »).
- **Commit** : `504f9c3c`.

### D2 — danger : sans montée, la hauteur sûre n'était plus vérifiée avant le premier X/Y

- **Vérifié** : `expect[0] = null` pour `M5` ; sans ligne Z, `zFloor` = Z constaté, sans comparaison à la hauteur sûre.
- **Test (échouait avant)** : « D2. no rise planned… » (plan à Z 0 ; pendant `M5`, Z −60 → l'approche partait ; et X déplacé de 10 mm) ; « D2 / D3. the safe height is required right before the first X/Y… » (montée validée pendant une rotation, puis Z −5,2 au repos → l'approche partait).
- **Correction** : position attendue après `M5` = celle du plan (X, Y, Z) ; avant toute ligne X/Y, Z ≥ hauteur sûre − 0,05 mm ; `zFloor` n'est pris qu'à l'envoi du premier X/Y, après ce contrôle. Un écart arrête (`ETOUCH_FRAME_POSITION`, D2 invalidé) et ne devient jamais référence.
- **Commit** : `504f9c3c`.

### D3 — danger : une arrivée ancienne autorisait une nouvelle ligne malgré un état changé

- **Vérifié** : `verified = index` posé pendant l'absence du flux ; au retour, `cncStep` sautait `settle`, `Idle` et l'arrivée ; `cncStop` accepte `Jog`.
- **Test (échouait avant)** : « D3. an arrival validated while the stream rotates… » (approche validée pendant la rotation ; rapport X/Y décalés de 2 mm, Z −50, en `Jog` puis au repos ; réouverture → le côté suivant partait).
- **Correction** : `holdReason` est évalué à chaque pas d'attente et juste avant chaque ligne : rien en attente (ligne, continu, annulation), `Idle`, arrivée de la ligne précédente (0,05 mm), hauteur sûre avant X/Y. Une validation antérieure n'autorise plus rien.
- **Commit** : `504f9c3c`.

### D4 — danger : `jogCancel` et `0x85` venant de CNCjs n'arrêtaient pas la séquence

- **Vérifié** : `socketStopping` (`index.js`) ne reconnaissait que les arrêts/retenues/reset ; `jogCancel` et `0x85` passaient sans `socketStop`.
- **Test (échouait avant)** : « D4. … through the real facade » : `touch.refuseSocket` réel (façade `index.js`, service du test), `command jogCancel`, `write \x85`, `write ?\x85`, `writeln \x85`, pendant `M5` et une fois un côté arrivé : cadrage fini avant passage, `0x85` puis plus rien après 61 s. Témoins `feedhold` et `!` : passaient déjà.
- **Correction** : `socketJogCancelling` dans la façade, `service.socketJogCancel(port)` : annule le départ en attente et termine le cadrage dans le même pas. **Choix** : ces annulations n'arrêtent pas les palpages (leur arrêt fait retenue puis reset ; une annulation de jog ne doit pas le déclencher).
- **Commit** : `504f9c3c`.

### C1 — à corriger : des octets d'annulation pouvaient partir après une bannière

- **Vérifié** : la bannière n'était vue qu'au pas suivant ; entre-temps `supervise` (main rendue/prise) et `transportClosed` appelaient `cancel()` ; la répétition de `0x85` ne contrôlait pas la session.
- **Test (échouait avant)** : « C1. after a banner… a change of the lease or the stream closing write nothing » (rendue, prise, flux fermé, flux en rotation : rien écrit, `_RESTART`) ; « C1. a jog cancel being repeated stops repeating at a banner » (15 `0x85` répétés avant ; aucun après) ; « C1. after a banner, Arrêter or a stop of a CNCjs client » (`_RESTART` gardé, aucune ligne).
- **Correction** : `r.reset` appelle `moves.restarted` : le cadrage se termine dans le pas de la bannière, `ETOUCH_FRAME_RESTART` conservé ; `abortFrame` et `transportClosed` contrôlent la session ; la répétition d'annulation s'arrête quand `startups` change.
- **Écart assumé (dans le sens « arrêter »)** : un arrêt **explicite** demandé après la bannière (Arrêter, arrêt d'un socket) suit le chemin commun des déplacements et peut encore envoyer **un** `0x85` si une ligne `$J=` peut être en vol ; cet octet ne met rien en mouvement et peut arrêter un `$J=` reçu après le redémarrage (cas prévu par `settle`). Le test l'admet (au plus un octet, uniquement `0x85`). `SURETE.md` et la conception le disent.
- **Commit** : `504f9c3c`.

### C2 — à corriger : la surveillance de broche abandonnait le contrôle par `$G`

- **Vérifié** : `cncStop` testait seulement `status.spindle > 0`.
- **Test (échouait avant)** : « C2. without a reported speed… » (sans `FS` : `$G` `M3`, `$G` `M4`, `$G` périmé de 2,6 s pendant un côté → le cadrage continuait).
- **Correction** : `cncStop` utilise `spindleOn` (garde complet du départ : vitesse > 0, ou `$G` `M3`/`M4`, ou `$G` trop ancien sans vitesse). CNCjs interroge `$G` toutes les 500 ms au repos de son workflow, `Jog` compris (`GrblController.js`), et Grbl répond à `$G` en `Jog` : pas d'arrêt intempestif attendu ; sinon l'arrêt est le comportement voulu.
- **Commit** : `504f9c3c`.

### C3 — à corriger : l'upload classique pouvait remplacer le fichier pendant le cadrage

- **Vérifié** : `api.gcode.js` `upload` charge sans consulter le service ; `r.file` vidait `r.job` sans toucher au cadrage.
- **Test (échouait avant)** : `api/__tests__/api.gcode.test.js` (409, rien chargé) ; « C3. the classic upload… » (façade `touch.refuseUpload` pendant le départ en attente et le cadrage, libre après l'arrêt) ; « C3. a program replaced anyway… » (`load` et `unload` du sender → arrêt immédiat `_STATE` `program`, `0x85`, rien après).
- **Correction** : `touch.refuseUpload(port)` → `service.uploadRefusal` ; `upload` répond 409 quand le service est démarré et refuse ; `r.file` appelle `moves.supervise` puis arrête tout cadrage restant (laser compris) ; `cncStop` compare la révision et le `touchJob` du sender.
- **Commit** : `504f9c3c`.

### C4 — à corriger : tests non probants, refaits

| Test | Lacune | Refait |
|---|---|---|
| `T/cnc-frame.test.js` 26 | Exclusions vérifiées avec une ligne encore en attente. | Gardé, complété par « D1 / 26b » (fenêtre `ok` + deux rapports, et pendant une rotation). |
| L2 | Assertion sautée si D2 était déjà prouvé. | Le `$#` de la preuve D2 est retenu (pont du simulateur) : `ETOUCH_OFFSET_CHECKING` exigé sans condition, `canFrame` faux, rien écrit. |
| L7 | Arrêt `socketStop` avant le reset, pas de code d'alarme exigé. | Reset injecté directement pendant `Jog` : seul octet écrit = `0x18`, `lastAlarm` `{ code: 3, restarted: true }`, `_RESTART`, aucune écriture `$J=`/`M5`/`0x85` ensuite. |
| L3 | Seule X 407,5 parcourue. | X 0 (`origine.nc`), X 407,5 et Y 395,5 **parcourus** jusqu'à la borne exacte, sans `error:15` ni alarme ; refus chiffrés inchangés. |

L2, L3 et L7 ne reproduisent pas un défaut : ils renforcent la preuve d'un comportement que la relecture ne met pas en cause (la preuve était faible, pas le comportement). Ils n'ont pas été rejoués sur le code d'avant la correction. **Commit** : `504f9c3c`.

### R1 — remarque : validation physique ouverte

Non traitable dans le code. Conservée telle quelle dans `SURETE.md` (limites) et le protocole § 8, qui gagne deux étapes (F1-C14b : flèches et pas refusés entre deux côtés ; F1-C14c : chargement classique refusé). **Commit** : `c1f32ec5`.

## Ce qui n'est pas vérifié

- **Rien sur la machine** : freinage, `$J=G90` en coordonnées pièce et `0x85` sur la LUNYEE restent sans relevé (R1).
- Le harnais navigateur (`browser-run.cjs --strict`) n'a pas été relancé : la page ne change que d'une condition (`m.frame`) dans `real-motion.js`, sans effet de géométrie ; prouvé en DOM simulé seulement.
- La façade est testée avec un service de test injecté (`jest.mock` de `createService`), pas avec la configuration et le magasin réels de CNCjs ; le chemin Socket.IO de CNCEngine jusqu'à `refuseSocket` n'est pas rejoué ici (il l'est par `cncengine/__tests__/control-hook.test.js`, inchangé et vert).
- `POST /api/gcode` est testé par appel direct de `upload` avec le service mocké, pas par une requête HTTP réelle.
- Le cas d'un `0x85` envoyé par un arrêt explicite après une bannière (écart assumé de C1) n'est pas observé sur la carte.
- Une nouvelle relecture (Astra, puis Fable) est nécessaire avant toute décision d'installation.

## Second tour

17 novembre 2026. Seconde relecture : `astra2-F1.md` (`feat/F1` à `c1f32ec5`, verdict « à ne pas installer » : `autolevel:stop` laisse partir un segment après son reset ; C1 encore partiel). Même arbre, même branche ; aucun push, rien fusionné, aucun accès machine.

### Verdict

**Le danger et les deux restes de C1 tiennent à la lecture du code ; rien n'est rejeté.** Plutôt que de fermer les lignes citées, chaque famille a été inventoriée **depuis le code** et fermée par un point de passage unique. Chaque fenêtre a d'abord eu son test, exécuté et rouge avant la correction (9 tests rouges), puis la correction, puis le vert. Deux tests demandés par la relecture décrivent un comportement gardé (arrêt explicite après bannière, hauteur sûre isolée) : verts avant comme après, ils sont marqués comme tels. Aucun faux refus n'était signalé ; les suites n'en montrent aucun nouveau (voir « Ce qui n'est pas vérifié »). **R1 reste ouvert.**

| Commit | Contenu |
|---|---|
| `66bec9ef` touch: F1 second review, one passage per family of stop, banner and stale check | `index.js`, `motion.js`, `job-service.js` ; `T/cnc-frame.test.js` (tests « second review, family 1 » dans la façade, bloc « the families of the second review »). |
| `084b046c` touch: F1 second review, safety entry and real trial updated | `design/refonte/SURETE.md` (politique d'arrêt et de bannière telle que le code la tient, table des familles), `design/refonte/PROTOCOLE-ESSAI.md` (F1-C14b depuis l'appareil propriétaire, fenêtres ajoutées). |

Contrôles après chacun des deux commits : `verify-project` **225/225** ; Jest `src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator` **55 suites, 1623 tests verts** (avant : 1609) ; ESLint **propre** sur les fichiers touchés. Fins de ligne LF vérifiées dans les objets commités.

### Famille 1 — toute voie d'arrêt ou d'annulation, venant de n'importe quel client

**Inventaire depuis le code.** Ce qui peut écrire sur le port pendant un cadrage :

- Sockets CNCjs (`CNCEngine.js` : `command`, `write`, `writeln`, `close` passent tous par `touch.refuseSocket`). Pendant un cadrage, `socketRefusal` refuse **tout ce qui n'est pas sûr** ; passent donc exactement `SAFE_COMMANDS` (`pause`, `gcode:pause`, `stop`, `gcode:stop`, `feedhold`, `reset`, `feeder:stop`, `jogCancel`, `statusreport`, `autolevel:stop`, `autolevel:getProbeState`) et les écritures faites seulement de `SAFE_WRITES` (`?`, `!`, `0x18`, `0x84`, `0x85`). Avant : `autolevel:stop` (→ `reset` dans `GrblController.js`) et `0x84` (porte) passaient **sans** terminer le cadrage.
- Tablette / HTTP (`service.action`) : actions sûres `pause`, `stop`, `spindleStop`, `motion jog-stop` → toutes terminent le cadrage (`moves.stop`) ; `control release/takeover` → `moves.supervise` dans le même pas ; `settings`, `resumePlan`, `check` n'écrivent rien ; tout le reste passe par `atRest`/`idle`/`noJob`/`available` et est refusé.
- HTTP hors tablette : `POST /api/gcode` refusé (C3) ; commandes système refusées tant que `moves.moving` ; les autres API ne touchent pas au contrôleur.

**Point de passage unique** : `index.js` `socketEffect`. Toute commande ou écriture sûre qui n'est **pas une interrogation** (`statusreport`, `autolevel:getProbeState`, `?` seul) termine le cadrage avant de passer (`socketStop`, ou `socketJogCancel` pour une annulation de jog pure, qui épargne les palpages comme au premier tour). **Une commande sûre ajoutée plus tard à `control.js` et non nommée ici est traitée comme un arrêt.** `autolevel:stop` et `0x84` arrêtent aussi les palpages et la transaction D2, comme un reset et une retenue.

**Tests (rouges avant)** : « second review, family 1: every safe command or write… » — matrice **lue dans `SAFE_COMMANDS` et `SAFE_WRITES`** (chaque commande ; chaque octet en `write`, `writeln` et précédé de `?`), entre deux lignes (`M5` répondu, deux rapports au repos, avant le superviseur : le cas d'Astra, départ Z −5) et pendant un côté ; après la commande, **2 s sans rapport ni bannière** (le reset n'est pas encore vu), puis bannière et une minute au repos : aucune ligne, aucun octet après la bannière. Témoins : les interrogations laissent le cadrage aller au bout ; 21 commandes non sûres (dont `gcode`, `homing`, `unlock`, `cyclestart`, `close`, `~`, `0x9E`, `\x85~`) sont refusées « Cadrage en cours » et le cadrage continue.

### Famille 2 — toute écriture après une bannière

**Inventaire** des écritures de `motion.js` : `send` (lignes : pas, continu, cadrage, origine), `cancel` (`0x85` immédiat et répétitions), `forget` (`0x85` à l'arrêt du service ou à la fermeture du port). Les lignes passent toutes par le superviseur qui compare la session (premier tour). Les `0x85` non : `forget` ne contrôlait pas la session, et les superviseurs d'un pas ou d'un continu (`watchStep`, `watch` : rapport périmé — `r.seen` est remis à zéro par la bannière —, flux fermé, main prise) écrivaient un `0x85` vers la carte redémarrée.

**Point de passage unique** : `writeJogCancel(c, r, startups)`. Tout `0x85` du module n'est écrit que vers **la session de carte de ce qu'il annule** ; chaque superviseur passe la session de son déplacement. Rien d'automatique n'atteint donc une carte redémarrée.

**Politique retenue pour l'arrêt explicite (reste de C1)** : un arrêt **demandé par une personne après la bannière** (Arrêter, Pause, relâchement, Arrêter la broche) agit sur la nouvelle session comme sur toute autre : `0x85`, **répété tant qu'un rapport plus récent dit `Jog`**, à 200 ms d'écart au moins, puis plus rien au repos ; jamais une ligne. Ce n'est pas « au plus un » comme écrit au premier tour : cette phrase était fausse, et la répétition est utile (elle arrête un `$J=` reçu après le redémarrage). `SURETE.md` est aligné. Un arrêt venu d'un socket après la bannière n'écrit rien de `motion.js` (plus de cadrage à arrêter).

**Tests** : « family 2: the service disposed after a banner… » (cadrage, pas, continu : rien après la bannière ; témoin sans bannière : un `0x85`) et « family 2: after a banner, the supervision of a step or a continuous jog… » (périmé, flux fermé, main prise) — rouges avant ; « family 2: Arrêter asked after the banner… » (`Jog` rapporté une seconde : plusieurs `0x85`, au plus un par 200 ms, rien au repos, aucune ligne) — **comportement gardé, vert avant et après**.

**Choix à confirmer** : ce point de passage retire aussi le `0x85` automatique qu'un **pas ou un continu manuel** (hors cadrage) envoyait à une carte redémarrée. C'est la règle D-06 de la plaque et de la conception (« après une bannière, rien, pas même `0x85` ») appliquée à tout le module. L'autre politique possible — un `0x85` automatique seulement si la carte redémarrée rapporte `Jog` — arrêterait un `$J=` arrivé après le redémarrage sans attendre l'opérateur, mais contredit D-06. Je n'ai pas tranché contre la conception : à décider.

### Famille 3 — tout contrôle fait une fois puis réutilisé

**Inventaire** des contrôles du départ (`jogReady` → `gate`, `available`, prise d'origine en cours, palpage, chargement, travail, alarme, déplacement en attente, `Idle`, file CNCjs, automatismes, `$13` ; `cncFramePlan` → capacité, référence, D2, broche, programme, vérification X/Y, repère, `$20`, positions, hauteur sûre, vitesses) comparé à ce que la séquence revérifiait. Manquaient : automatismes, réglages (`$13`, `$20`, courses, vitesses), et le reste de `jogReady` (contrôleur prêt, commande système, lecture des réglages…).

**Point de passage unique** : juste avant chaque ligne, **`holdReason` refait `jogReady` tel quel** (`atRest` n'exclut plus que le cadrage lui-même), et `cncStop` compare à chaque pas les automatismes et les réglages. Ce que `jogReady` vérifiera demain sera revérifié avant chaque ligne sans autre changement.

**Tests (rouges avant)** : « family 3 » — automatismes configurés, `$13=1`, `$130` changé, contrôleur CNCjs non prêt (le garde refait), pendant un côté : arrêt `_STATE`, pas de côté suivant, `0x85`, rien ensuite. Témoin : même cadrage sans changement → va au bout.

### Famille 4 — toute référence mémorisée qui peut avoir changé

**Inventaire** de ce que la session garde : ligne en attente (D1), session de carte, appareil et flux, main, preuve D2, révision du programme, dernière alarme, positions attendues et plancher Z, hauteur sûre — déjà comparés. Non comparés : les réglages du plan (famille 3), **le repère actif** et **le décalage X/Y** dans lesquels les cibles `$J=G90` sont écrites, couverts seulement à travers la preuve D2.

**Correction** : la session garde le repère (`r.wcs`) et le décalage X/Y (`MPos − WPos` du plan, nouveau champ `offset` du plan, exigé par `motion.frame`) ; `cncStop` les compare à chaque pas (0,05 mm), **indépendamment de la preuve D2**. **Tests (rouges avant)** : « family 3 » — `$G` G55 et WCO décalé de 1 mm, preuve D2 inchangée → arrêt `_STATE` `offset`.

### Famille 5 — l'état de la broche à chaque descente

Le cadrage ne descend jamais : la seule ligne Z est relative et sans signe, en deuxième position (`cncFrameLinesValid`), et Z ne passe jamais sous le plancher constaté avant le premier X/Y. La broche est vérifiée par `cncStop` (garde complet du départ, C2) dans le pas même de chaque envoi, `M5` en tête. Rien à changer ; preuves : C2, test 3.

### Remarques de la relecture

- **Hauteur sûre isolée** : le cas d'Astra est conservé (départ −5,005 sans montée ; −5,054 au repos, arrivée à 0,049 mm mais sous la hauteur sûre → aucun X/Y, `_POSITION` Z). Vert avant et après.
- **`PROTOCOLE-ESSAI.md` F1-C14b** : le pas se tente depuis la tablette qui a lancé le cadrage (depuis un autre appareil, le refus de pilotage masquerait l'essai).

### Ce qui n'est pas vérifié

- **Rien sur la machine** (R1). Les arrêts `autolevel:stop` et `0x84` sont prouvés sur faux contrôleur par la vraie façade, pas sur simulateur ni sur la carte ; aucun cas LUNYEE nouveau (les suites LUNYEE existantes sont vertes).
- Le chemin Socket.IO réel de CNCEngine jusqu'à `refuseSocket` n'est pas rejoué ici (inchangé, couvert par `cncengine/__tests__/control-hook.test.js`, vert).
- Faux refus : le garde refait avant chaque ligne et les comparaisons de réglages, repère et décalage ne se déclenchent que si ces valeurs changent ; ce n'est pas observé sur la carte (un `$G` ou un `WCO` inattendus arrêteraient le cadrage, dans le sens « arrêter »).
- Le cadrage **laser** profite des familles 1 et 2 (code commun), pas des comparaisons des familles 3 et 4 (son superviseur est resté tel quel, comme au premier tour).
- `F1-CONCEPTION.md` § 16 dit encore qu'un arrêt explicite après la bannière « peut encore envoyer un `0x85` » : à aligner sur la politique ci-dessus (fichier hors de mon périmètre d'écriture).
- Une nouvelle relecture (Astra, puis Fable) est nécessaire avant toute décision d'installation.

## Troisième tour

17 novembre 2026. Troisième relecture : `astra3-F1.md` (`feat/F1` à `084b046c`, verdict « à ne pas installer » : après une bannière, un `$J` manuel fraîchement rapporté `Jog` ne reçoit plus son arrêt automatique quand le maintien ou le flux sont perdus). Même arbre, même branche ; aucun push, rien fusionné, aucun accès machine.

### Verdict

**Le danger tient : c'est une régression du second tour, et elle est plus large que le cas décrit.** Le point de passage `writeJogCancel` du second tour liait **chaque** `0x85` automatique de `motion.js` à la session de carte du déplacement annulé. Pour le cadrage, c'était voulu (D-06) ; pour les pas et les continus manuels, cela retirait l'arrêt automatique qu'ils avaient avant le lot. Une comparaison exhaustive avec `db584555` (96 scénarios, voir plus bas) trouve **36 scénarios différents**, tous du même type : après une bannière, plus aucun `0x85`, `cancelling` et `cancelUnconfirmed` faux alors que `Jog` est rapporté. Cas d'Astra (continu, bannière, `Jog` frais, maintien perdu), pas + flux fermé, main prise, rapports périmés, fonction désactivée, alarme, arrêt du service, et une annulation commencée avant la bannière dont la répétition s'arrêtait.

**Correction : les déplacements manuels reprennent exactement le code de `db584555`** ; seule l'extinction définitive du cadrage à la bannière est gardée, portée par une marque `framed` sur ses lignes et ses annulations. Le comportement est **prouvé identique à `db584555`** sur les 96 scénarios, octet pour octet et état pour état. La table d'états du cadrage (ci-dessous) a été écrite d'abord, puis confrontée au code : 106 cases testées, une réponse chacune ; aucune case du cadrage n'était fausse à `084b046c`. **R1 (validation physique) reste ouvert.**

| Commit | Contenu |
|---|---|
| `6edae333` touch: F1 third review, manual jogs keep their automatic stop after a banner | `motion.js` ; `T/manual-jog-banner.test.js` (nouveau) ; `T/cnc-frame.test.js` (table d'états, trois tests de séquence, deux tests « family 2 » corrigés). |
| `9eb25a5c` touch: F1 third review, safety entry updated | `design/refonte/SURETE.md` (politique de bannière telle que le code la tient, ligne « family 2 », paragraphe « Troisième relecture »). |

Contrôles après chacun des deux commits : `verify-project` **225/225** ; Jest `src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator` **56 suites, 1735 tests verts** (avant : 55 suites, 1623) ; ESLint **propre** sur les trois fichiers de code touchés. Fins de ligne LF vérifiées dans l'index (`git ls-files --eol` : `i/lf`). Une exécution Jest, la première après la correction, a signalé **un** test en échec que je n'ai pas pu identifier (sortie tronquée) ; les cinq exécutions suivantes, dont celles qui suivent chaque commit, sont entièrement vertes.

### Méthode

1. **Table d'états d'abord** (ci-dessous), pour tout le lot : états de la séquence × événements, une réaction attendue par case.
2. **Confrontation par test** : un cas par case (`test.each` sur la table elle-même, plus un test qui vérifie que chaque case a exactement une réponse). Exécutée sur `084b046c` avant toute correction : verte, après deux ajustements du banc d'essai (non du code) — un départ en attente doit être tenu pendant l'événement (lecture du fichier retenue), et « rapports périmés » se mesure au pas suivant du superviseur (sinon la ligne part légitimement tant que le dernier rapport a moins de 2,5 s).
3. **Déplacements manuels** : la réponse attendue est « exactement comme `db584555` ». Un banc (`T/manual-jog-banner.test.js`) joue 96 scénarios et résume pour chacun lignes écrites, `0x85` (premier, nombre, dernier, en ms), transitions d'état publiées (déplacement continu, `cancelling`, `cancelUnconfirmed`, `canJog`, dernier résultat) et refus éventuel. **La table attendue a été enregistrée en exécutant ce même fichier sur les sources de `db584555`** (`touch/index.js`, `job-service.js`, `machine-profile.js`, `motion.js` remis temporairement à ce commit dans mon arbre, puis restaurés). Sur `084b046c` : **rouge, 36 scénarios sur 96** ; après correction : vert. Le test vérifié vert aussi sur les sources de `db584555`.
4. **Correction**, puis vérification par mutation : sans l'héritage de la marque `framed`, deux tests de séquence rougissent ; sans l'arrêt de la répétition à la bannière, cinq tests (dont la case « annulation en cours × bannière ») ; sans l'exclusion dans `forget`, deux.

### Table d'états du cadrage (lot entier)

États : **E0** départ confirmé, fichier relu (`frameStarting`), rien d'écrit ; **E1** `M5` envoyé, sans réponse ; **E2** un côté en vol (`Jog`) ; **E3** entre deux lignes (ligne répondue, vue deux fois au repos, avant le pas suivant du superviseur) ; **E4** flux de l'appareil en rotation (grâce de 3 s, aucune ligne ne part) ; **E5** annulation en cours (cadrage arrêté par Arrêter, `0x85` répété tant que `Jog`) ; **E6** terminé par une bannière (la carte redémarrée rapporte `Jog`).

Réponses : **refus** = le départ n'a pas lieu, rien d'écrit ; **fin + code** = le cadrage se termine (dans le pas même de l'événement quand il est synchrone), puis `0x85` d'abord et rien d'autre que `0x85`, jamais une ligne ; **redémarrage** = fin `ETOUCH_FRAME_RESTART` et plus aucun octet, quoi que rapporte la carte ; **0x85 seul** = aucune ligne, rien que des `0x85` (arrêt d'une personne, ou annulation en cours qui continue) ; **rien** = pas un octet ; **service** = un `0x85` puis rien ; **—** = ne peut pas arriver dans cet état.

| Événement | E0 | E1, E2, E3 | E4 | E5 | E6 |
|---|---|---|---|---|---|
| Arrêter (tablette) | refus | fin, raison `stop` | fin, `stop` | 0x85 seul | 0x85 seul |
| Pause | refus | fin, `pause` | fin, `pause` | 0x85 seul | 0x85 seul |
| Relâchement (`jog-stop`) | refus | fin, `operator` | fin, `operator` | 0x85 seul | 0x85 seul |
| Arrêter la broche | refus (+ son propre `M5`) | fin, `spindle`, sans `M5` | fin, `spindle` | 0x85 seul (+ son propre `M5`) | 0x85 seul (+ son propre `M5`) |
| Arrêt du PC (socket : `!`, feedhold, reset, `autolevel:stop`…) | refus | fin, `socket` | fin, `socket` | 0x85 seul | rien |
| Annulation de jog du PC (`jogCancel`, `0x85`) | refus | fin, `socket` | fin, `socket` | 0x85 seul | rien |
| Bannière | refus | redémarrage | redémarrage | rien | rien |
| Alarme | refus | fin, `_ALARM` | fin, `_ALARM` | 0x85 seul | rien |
| Flux fermé (dernier flux de l'appareil) | refus | fin, `_STREAM`, même pas | — (déjà parti) | 0x85 seul | rien |
| Flux en rotation non rouvert | refus | fin, `_STREAM` à 3 s, aucune ligne avant | fin, `_STREAM` à 3 s | 0x85 seul | rien |
| Main perdue (prise ou rendue) | refus | fin, `_CONTROL`, même pas | fin, `_CONTROL` | 0x85 seul | rien |
| Rapport de broche (vitesse > 0 ; sans vitesse : `$G` `M3`/`M4` ou trop ancien) | refus | fin, `_STATE` `spindle` | idem | 0x85 seul | rien |
| Rapport de zéro (WCO ou preuve D2 changés) | refus | fin, `_STATE` `offset` | idem | 0x85 seul | rien |
| Délai : rapports de plus de 2,5 s | refus | fin, `_STALE` | fin, `_STALE` | 0x85 seul | rien |
| Délai : ligne hors délai (`M5` 10 s, côté durée + 10 s) | — | E1, E2 : fin, `_TIMEOUT` ; E3 : — | — | — | — |
| Arrêt du service (`dispose`) | refus | service | service | service | rien |

« + son propre `M5` » : sans cadrage en cours (pas encore lancé, ou déjà fini), Arrêter la broche fait ce qu'il fait toujours : un `M5` (refusé par Grbl en `Jog`), jamais une ligne de cadrage. Ce n'est pas une écriture du cadrage ; c'est le comportement d'avant le lot, gardé.

Les cases sont dans `T/cnc-frame.test.js`, bloc « the state table of the third review » (106 cas, les 6 cases « — » exclues, plus un test « every cell of the table has one answer »). Hors table mais déjà couverts : interrogations d'un client CNCjs (le cadrage continue ; « second review, family 1 »), commandes non sûres (refusées), programme remplacé (C3), contrôleur fermé (test 25), automatismes, réglages et repère (« family 3 »).

**Deux événements de suite** (la table est à un événement) : une annulation qui **reprend** celle d'un cadrage ou sa ligne en attente reste celle du cadrage. Tests : « cancelling, Arrêter again (or the jog stop, or Pause), then the banner » (CNC et laser : rien après la bannière) et « ended by a banner, Arrêter…, then a second banner » (rien après la seconde).

**Déplacements manuels** (pas, continu) : une seule réponse par case, « comme `db584555` », pour 4 contextes (sans bannière ; bannière puis `Jog` ; bannière puis repos ; arrêt avant la bannière puis bannière avec `Jog`) × 12 événements (maintien perdu, flux fermé, flux en rotation, main prise, main rendue, rapports périmés, `jog-stop`, Arrêter, arrêt du PC, arrêt du service, alarme, fonction désactivée) × 2 déplacements. Ce que cela veut dire, tel qu'enregistré sur `db584555` : après une bannière, un `$J` rapporté `Jog` reçoit `0x85` dès que son maintien, son flux, sa main ou la fraîcheur des rapports manquent, répété toutes les 200 ms tant que `Jog`, `cancelUnconfirmed` vrai après 5 s, jusqu'au repos ; `dispose` envoie un `0x85` ; une annulation en cours continue après la bannière. Les arrêts d'un socket CNCjs ne touchent pas aux déplacements manuels (comme avant).

### Correction (`motion.js`)

- **Supprimé** : `writeJogCancel` et le paramètre `startups` passé par `watchStep`, `watch`, `keepalive`, `precheck`, `transportClosed` ; le champ `startups` du déplacement continu. Ces fonctions sont revenues au texte de `db584555`.
- **`cancel(c, r, why, framing)`** : retrouve le corps de `db584555` (`0x85` dès que le contrôleur est connecté, répétitions, état non confirmé). Une annulation est **du cadrage** (`framed`) si un cadrage est passé ou en cours, ou si elle reprend une annulation ou une ligne du cadrage ; seule celle-là s'éteint, sans octet, quand la session de carte change.
- **Lignes du cadrage** : `sendNext` marque `pending.framed`.
- **`forget`** : texte de `db584555`, sauf qu'une ligne, une annulation ou un cadrage **du cadrage** d'une session terminée par une bannière ne compte pas.
- `abortFrame` passe la séquence à `cancel` (elle est déjà terminée à ce moment) ; le reste du cadrage est inchangé (`restarted` à la bannière, `frameRestarted` en tête de chaque chemin).

C'est une **simplification** par rapport au second tour : un seul critère (« est-ce le cadrage ? ») au lieu d'une session passée à chaque appel.

### Remarques de la relecture

- **Limite de 200 ms** : précisée dans `SURETE.md` (200 ms entre deux répétitions sur rapport `Jog` ; un `0x85` de plus aussitôt si l'`ok` du `$J` annulé arrive après coup). Test : « cancelling: an ok of the $J arriving after the 0x85 sends one more at once; the repeats on Jog reports stay 200 ms apart » (vert avant et après : comportement gardé, maintenant mesuré).
- **Tests du second tour qui encodaient la régression** : « family 2: the service disposed after a banner… » et « family 2: after a banner, the supervision of a step or a continuous jog… writes nothing » attendaient l'absence de `0x85` pour les déplacements manuels. Corrigés : rien pour le cadrage, `0x85` pour le pas et le continu (comme avant le lot).
- **Choix à confirmer du second tour** (portée de D-06) : tranché par la consigne de ce tour — D-06 ne s'applique qu'au cadrage ; les déplacements manuels gardent leur comportement d'avant le lot.

### Ce qui n'est pas vérifié

- **Rien sur la machine** (R1) : ni le comportement d'un `$J` reçu par une carte qui redémarre, ni `0x85` sur la LUNYEE.
- L'équivalence avec `db584555` porte sur les 96 scénarios du banc (faux contrôleur, horloge simulée) : lignes, `0x85` résumés par premier/nombre/dernier, transitions d'état publiées. Les instants intermédiaires des répétitions ne sont pas comparés un à un (leur nombre et leurs bornes le sont), ni l'historique écrit.
- La table du cadrage est jouée sur faux contrôleur, pas sur le simulateur LUNYEE (les suites LUNYEE existantes restent vertes).
- `F1-CONCEPTION.md` § 16 et la règle D-06 de la conception disent encore « après une bannière, rien, pas même `0x85` » sans restreindre au cadrage : à aligner (hors de mon périmètre d'écriture). `PROTOCOLE-ESSAI.md` n'a pas changé.
- Le test en échec isolé de la première exécution Jest n'est pas identifié (non reproduit en cinq exécutions).
- Une nouvelle relecture (Astra, puis Fable) est nécessaire avant toute décision d'installation.
