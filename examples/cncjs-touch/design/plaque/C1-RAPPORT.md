# C1 — Position portée par le rapport, broche datée : compte rendu de réalisation

Nuit du 26 au 27 novembre 2026. Arbre `cncjs-wt/C1`, branche `feat/C1`. Spécification : `C1-CONCEPTION.md` (révision 4) et les quatre avis d'Astra (`C1-AVIS-ASTRA-1.md` à `-4.md`). **Rien n'a été essayé sur la tablette, la RT ni la CNC ; rien n'est installé ; rien n'est poussé.**

## 0. Écarts avec la conception (à lire d'abord)

Aucun point de la conception ne s'est révélé faux. Les écarts ci-dessous sont des choix faits en codant, tous dans le sens prudent.

| # | Conception | Réalisé | Pourquoi |
|---|---|---|---|
| E1 | Un pas, un continu ou un cadrage laser arrêté par la surveillance de broche : `cancel(…, 'spindle')`. | Raison `spindleProof` (« broche commandée, ou vitesse de broche non rapportée, pendant le déplacement »). | `spindle` est déjà « bouton Arrêter la broche » : le journal aurait attribué l'arrêt à l'opérateur. Les octets sont les mêmes (`0x85`). |
| E2 | La règle « une seule occurrence dans toute la ligne » ne vaut que pour `MPos:` / `WPos:`. | Elle vaut aussi pour `FS:` et `WCO:`. | `FS:0,0\|junk:FS:0,1000` : impossible de dire lequel est vrai ; le champ compte comme absent. |
| E3 | WCO retenu : celui du rapport, sinon le dernier reçu depuis la bannière. | Un champ `WCO:` **abîmé ou en double** efface le WCO retenu (second repère inconnu jusqu'au prochain `WCO:` entier). | Avis 4, point 3 : `WCO:0,0,20\|junk:WCO:0,0,0`. Garder l'ancien aurait dérivé une position travail d'un décalage peut-être périmé. Sur la carte : un `WCO:` entier revient un rapport sur dix. |
| E4 | `spindleRefusal` juste après `spindleStill` (départ d'un programme) ; dans `zeroZReady` pour le bloc. | Preuves C1 placées **après** les gardes existantes : fin de `readyFor('start')`, fin de `zeroZReady`, fin de `blockReady`. | Le même départ est refusé, mais les refus d'avant gardent leur priorité (par exemple « mode G94 » avant « état de la broche non confirmé ») : deux attentes de tests n'ont pas eu à changer. |
| E5 | Attente de preuve : 2,5 s « à partir du moment où `settle` / `quiet` rend la ligne ». | Appliqué tel quel : l'arrêt tombe donc 2,6 à 2,7 s après l'`ok` (le temps des deux rapports qui suivent l'`ok`). | — |
| E6 | Compteurs de rapports et attentes par ligne « dans le journal de chaque séquence ». | Fait pour les cadrages (`reports`, `waits`) et le palpage au bloc (`reports`). **Pas pour la plaque** : `plate-probe.js` n'écrit aucune ligne de journal aujourd'hui. | Ajouter un événement de journal à la plaque sortait du lot. |
| E7 | — | Pendant l'attente du repos prouvé après une ligne de palpage, la ligne reste « en vol » pour les arrêts : un arrêt à ce moment envoie le feed hold puis le reset (comme pendant la ligne). | Sens prudent : la machine a été vue `Idle` une fois, pas deux. |
| E8 | § 4.1 point 7 : boutons utilisables pendant la plaque. | `canPause` vrai pendant un palpage à la plaque (le bouton s'intitule déjà « Arrêter le palpage ») ; `canSpindleStop` vrai pendant la plaque, quel que soit l'état. | Ce sont deux voies d'arrêt : elles s'ouvrent, elles ne se ferment pas. Vérifié sur l'état publié par le serveur, **pas** dans le navigateur (§ 8). |
| E9 | « Broche qui tourne » : refus codé. | Phrase existante (« La broche tourne encore (N tr/min)… »), sans code, comme aujourd'hui. | La garde d'avant (`spindleStill`) la donne déjà avant C1 ; rien n'a été changé à son texte. |

## 1. Ce que l'opérateur voit de différent

**En marche normale sur la LUNYEE (chaque rapport porte `MPos:` et `FS:`) : rien, sauf trois détails de temps.**

1. Juste après une prise d'origine, un déverrouillage ou une connexion, les flèches et « Cadrer à vide… » restent grisés le temps d'un rapport de plus (un quart de seconde), ou jusqu'au premier `$G` (une demi-seconde). Phrase : « La machine n'a pas encore confirmé sa position. Attendez un instant. »
2. Entre deux lignes d'un cadrage ou d'un palpage, le serveur attend le `$G` suivant. Au banc (simulateur, `$G` toutes les 500 ms) : 0 à 375 ms par ligne. **Sur la machine : non mesuré** ; le journal du cadrage le dira (`waits`).
3. Après un mouvement, les flèches reviennent un rapport plus tard qu'avant.

**Deux refus nouveaux, voulus :**

| Situation | Ce que l'opérateur lit | Remède à l'écran |
|---|---|---|
| Broche commandée (`M3` / `M4`), même à vitesse nulle | « La broche est commandée : arrêtez-la d'abord. » | Bouton « Arrêter la broche ». |
| La carte ne donne pas `FS:` complet, ou pas de `$G` récent | « La machine ne dit pas si la broche est arrêtée. Attendez, ou arrêtez la broche. » | Idem. |

Concernés : pas de plus de 0,1 mm, maintien continu, « Cadrer à vide… », zéro Z à la plaque, palpage au bloc, macro, départ d'un programme (y compris reprise à une ligne). **Non concernés** : pas de 0,1 mm et moins (pour tangenter broche en marche), prise d'origine, déverrouillage, reprise après une pause, zéros, cadrage laser au départ (son `M5` part d'abord).

**Arrêts nouveaux pendant une séquence** (cadrage, palpage, grand pas, continu) : position absente des rapports pendant 2,5 s ; `FS:` absent pendant 2,5 s ; un `$G` qui dit `M3` / `M4`, ou un `A:S`, même fugitif ; pas de `$G` `M5` après une ligne. Phrases : celles des arrêts existants (« rapports trop anciens », « changé d'état (spindle) ») et, pour les palpages, deux phrases nouvelles (« la broche est commandée, ou sa vitesse n'est plus rapportée » ; « la machine n'est plus là où le palpage l'avait laissée, ou le repère a changé »).

**« Arrêter la broche » pendant un zéro Z à la plaque** n'envoie plus `M5` : il arrête le palpage et réinitialise la carte (feed hold d'abord si quelque chose peut bouger). Message : « Arrêt broche pendant un palpage : palpage interrompu, réinitialisation de la carte demandée. Vérifiez l'immobilisation et l'arrêt de la broche ; le zéro Z n'est pas réglé. » Après un reset, la prise d'origine est à refaire, comme après Arrêter.

Toutes les phrases nouvelles existent en français, anglais et espagnol, passent par les composants existants (familles de refus, flèches grisées avec leur raison, journal).

## 2. Fichiers touchés

Rien sous `src/server/controllers/Grbl/`. `halt.js`, `work-offset.js`, `settle`, `quiet`, `spindleStill` et l'adaptateur `spindleOn` ne sont pas modifiés. Aucune commande machine nouvelle.

| Fichier | Quoi |
|---|---|
| `src/server/services/touch/report-proof.js` (nouveau) | Lecture stricte des lignes brutes (`readStatus`, `readModal`), collecte (`r.pos`, `r.still`, `r.fs`, `r.gc`, `r.spinHints`, `r.wcoKept`, `r.seenCounts`), lectures (`posOf`, `restedSince`, `positionRefusal`, `spindleRefusal`, `spindleWatch`, `spindleHeld`, `place`, `moved`). |
| `job-service.js` | Collecte dans `r.status` / `r.modal` / `r.reset` ; preuves au départ d'un programme et d'une macro ; plans des deux cadrages par `posOf` ; position apprise après `$H` (§ 2.9) ; « Arrêter la broche » pendant la plaque ; `canPause` / `canSpindleStop`. |
| `motion.js` | `moveReady` ; preuves au départ d'un pas et du continu ; surveillance (`watchStep`, `stopReason`, `cncStop`, `frameStopReason`) ; attente d'arrivée et garde avant chaque ligne des deux cadrages ; journal. |
| `plate-probe.js` | `gcAtOk` dans `answers` ; preuves au départ ; `verdict` ; `send` réécrit (attente après `quiet`, garde dans le pas de l'écriture, égalité de position et de repère) ; arrêt matériel de « Arrêter la broche ». |
| `block-probe.js` | Positions par `posOf` ; preuves en fin de `blockReady` ; `verdict` ; `send` (attente après `quiet`, garde et égalité avant l'écriture, flux relu en dernier) ; journal. |
| `examples/cncjs-touch/touch/i18n-messages-machine.js`, `i18n-messages-refus.js`, `real-history.js` | Six codes et deux messages en trois langues, trois familles de refus avec leur remède, une raison d'arrêt au journal. |
| `__tests__/support/line-bench.js`, `support/c1-bench.js` (nouveaux) | Conversion des anciens bancs ; banc des tests de C1. |
| `__tests__/c1-report-proof.test.js`, `c1-starts.test.js`, `c1-sequences.test.js`, `c1-plate.test.js` (nouveaux), `block-probe.test.js` (8 tests ajoutés) | Tests de C1. |
| 22 fichiers de tests existants | Conversion (§ 5). |
| `design/refonte/PROTOCOLE-ESSAI.md`, `design/plaque/C1-AVIS-ASTRA-4.md`, `C1-CONVERSION-BANCS.md`, ce rapport | Documents. |

## 3. Tests

Banc de C1 (`support/c1-bench.js`) : le vrai `GrblRunner`, le vrai `createService`, tout ce que dit la carte est une ligne passée à `runner.parse` ; chaque `[GC:…]` est suivi de son `ok`, l'`ok` de nos lignes vient à part ; un faux côté série note chaque octet ; le superviseur et les microtâches tournent réellement entre deux injections (`tick`). La vraie preuve D2 (`work-offset.js`) sert dans quatre tests.

| Fichier | Tests | Ce qu'il couvre (numéros de la conception) |
|---|---|---|
| `c1-report-proof.test.js` | 4 | Lecture stricte champ par champ. |
| `c1-starts.test.js` | 13 | T1, T1b (pas, continu, cadrage), T2, T6, T7, T8, T8b, T8x, T18, T19 (départ), T20. |
| `c1-sequences.test.js` | 28 | T3, T4, T4c (et sa variante d'arrivée), T4h, T9, T10, T11 et ses trois variantes, T12, T12b, T7s, T14 (5 Hz, 1 Hz), T19 (en séquence), § 4.1 point 4 ; pas et continu ; cadrage laser (§ 3.1, T4c, T11, T12, T7s). |
| `c1-plate.test.js` | 22 | Cycle complet, T13, T13c, T13p (position, repère `G55`, décalage changé dans le même `G54`), T11, T7s / T10 / T12, T13g (au repos et en pause `M6`), § 4.1 points 5 et 6, T16, T8w et son symétrique (vraie D2), T17. |
| `block-probe.test.js`, bloc « lot C1 » | 8 | T13, T11, T13b et sa variante 0,02 mm, T13c transposé, T7s / T10, T13g. |

**Rouge avant, vert après.** Lancés sur le code d'avant C1 (copie du commit `d6851c6e` hors de l'arbre) : `c1-starts` 11 rouges sur 13 ; `c1-sequences` 23 sur 28 ; `c1-plate` 18 sur 22 ; les tests « lot C1 » de `block-probe.test.js` 6 sur 8 (`c1-report-proof` ne peut pas y tourner : le module n'existe pas). Les verts sur l'ancien code sont les témoins, qui doivent l'être (T9, T12b, T19 au départ, T20, T4h, T13g, T17, cycle complet, 1 Hz, pas de 0,1 mm). Raisons relevées sur l'ancien code : T1 `$J=G91 G21 X10 F600` écrit ; T2 plan accepté ; T3 `$J=G91 G21 Z55 F300` écrit après des rapports sans coordonnées ; T4 `$J=G90 G21 X10 Y20 F600` écrit (la contre-séquence d'Astra) ; T6 départ accepté sous `M3 S0` ; T8w palpage accepté avec le `WPos:` parasite. T14 (cadrage complet à 5 Hz) : sur l'ancien code les lignes écrites sont **les mêmes, dans le même ordre** ; il n'y échoue que sur le journal, qui n'existait pas.

T15 (LUNYEE au simulateur) : `cnc-frame-lunyee.test.js` et `motion-simulator.test.js`, attentes inchangées, mêmes octets, même ordre ; attente ajoutée par ligne 0 à 375 ms, `noXyz` et `noFs` à 0 sur douze cadrages.

**Résultats des suites** : § 9.

## 4. Mutations

Rejouées dans une copie hors de l'arbre, une à la fois (ou la paire nommée), contre les quatre fichiers de tests de C1 (132 tests). « Tuée » : le test cité devient rouge.

| Mutation | Garde retirée | Résultat | Test qui la tue |
|---|---|---|---|
| M1 | `r.pos` rafraîchi par tout rapport | **tuée** (20 tests) | T1, T2, T3, T4… |
| M2 | repos prouvé du pas | **tuée** | T1b (pas) |
| M3 | repos prouvé du continu | **tuée** | T1b (continu) |
| M4 | repos prouvé du plan CNC | **tuée** | T1b, cadrage ; T2 |
| M5 | attente d'arrivée de `cncStep` | **tuée** | T4c, variante d'arrivée (premier `Idle` à 0,2 mm de la cible) ; T3, T4 |
| M5h | repos prouvé dans la garde d'avant ligne (`holdReason`) | **tuée** | § 4.1 point 4 |
| M6 | hauteur sûre de `holdReason` | **tuée** | T4h |
| M7 | âge de la position, `cncStop` | **tuée** | T12 cadrage |
| M8 | idem, `watchStep` | **tuée** | T12 pas |
| M9 | idem, `stopReason` | **tuée** | T12 continu |
| M10 | idem, `frameStopReason` | **tuée** | T12 laser |
| M11 | attente d'arrivée du laser | **tuée** | T4c laser |
| M12 | `[GC:]` postérieur à l'`ok` (`spindleHeld`) | **tuée** (14 tests) | T11 cadrage, laser, plaque, bloc |
| M13 | `r.spinHints` | **tuée** | T10 cadrage, pas, continu, plaque ; T19 |
| M14 | lecture stricte de `FS:` | **tuée** | T8, T8b |
| M15 | « le dernier rapport porte `FS:` » | **tuée** | T7 |
| M16 | âge du `FS:` dans `spindleWatch` | **tuée** | T7s cadrage, pas, continu, laser, plaque, bloc |
| M17 | `M5` remplacé par « ni `M3` ni `M4` » | **tuée** | T8 (`[GC:]` sans mode) |
| M18 | repli « aucun `FS:` vu » | **tuée** | T8b |
| M19 | attente après `quiet`, plaque | **tuée**, sur la cible écrite | T13c (`G0 Z-12.2`) |
| M20 | repos avant écriture, plaque | **tuée sur le code du refus seulement** | T13p sans coordonnées : `…STALE` attendu, `…POSITION` reçu ; aucune ligne dans les deux cas |
| M21p | égalité de position et de repère, plaque | **tuée** | T13p |
| M20 + M21p | les deux | **tuée** sur les octets | T13p, les deux variantes |
| M21 | égalité de position, bloc | **tuée** | T13b, variante 0,02 mm |
| M22 | attente après `quiet`, bloc | **tuée**, mais par T13 (coordonnées disparues après l'`ok`), **pas par T13c transposé**, qui reste vert | voir ci-dessous |
| M23 | repos avant écriture, bloc | **tuée sur le code du refus seulement** | T13b sans coordonnées |
| M23 + M21 | les deux | **tuée** | T13b, les deux variantes |
| M24 | `spindleRefusal` de la macro | **tuée** | T6, T7 |
| M25 | `spindleRefusal` du départ d'un programme | **tuée** | T6, T7 |
| M27 | fraîcheur du `[GC:]` dans `spindleHeld` | **tuée** | T11 variante « `M5` devenu ancien », cadrage et plaque |
| M28 | apprentissage strict de `r.homeMpos` | **tuée** | T18 |
| M29 | valeurs prises dans le champ brut | **survivante** | — |
| M30 | provenance (une seule occurrence de `MPos:` / `WPos:`) | **tuée** | T8w et son symétrique, T8 |
| M29 + M30 | les deux | tuée (par M30) | — |
| M31 | second repère dérivé par Touch | **tuée seule** | T8x, variante `WCO:` parasite : la valeur dérivée change, sans refus préalable de D2 (D2 de banc) |
| M30 + M31 | les deux (essai combiné) | tuée | T8w, T8x |

Redondances reconnues, gardes conservés :

- **M29** survit : depuis la règle de provenance (M30), une ligne qui a un seul `MPos:` entier ne peut plus donner au parseur une autre valeur que ce champ. Astra l'avait annoncé (avis 4, point 4). Le garde reste (les valeurs ne viennent jamais de la charge).
- **M20 et M23** (repos prouvé juste avant l'écriture) : seuls, ils ne laissent partir aucune ligne, parce que l'égalité de position (M21p, M21) refuse aussi une position absente. Ils ne changent que le code du refus. Trois couches pour le même cas : attente après `quiet`, repos avant l'écriture, égalité.
- **M22** : le test prévu (T13c transposé au bloc) ne la distingue pas ; un autre la tue. Le test transposé est gardé comme témoin de non-régression (un premier `Idle` hors cible n'arrête pas le cycle).

## 5. Bancs existants convertis, attentes modifiées

`support/line-bench.js` : chaque émission `status` / `parserstate` d'un ancien banc devient la ligne qui dit la même chose, lue par un vrai `GrblRunner` ; l'état écrit par le banc reste tel quel. La fonction n'ajoute ni rapport, ni `ok`, ni second `Idle`, ni temps ; elle écrit `FS:` seulement si l'état du banc a une vitesse, `WCO:` seulement si l'état a les deux positions (premier rapport après une bannière et à chaque changement), et `F0` quand un banc donne un seul mot modal (le parseur ne reconnaîtrait pas la ligne). Une ligne `raw` écrite à la main par un banc passe telle quelle : c'est l'entrée des omissions volontaires.

Ce que les nouvelles gardes demandent en plus est écrit dans chaque banc : un second rapport au repos, l'échange `$G` (`M5`, puis `ok`) au repos, après l'`ok` de chaque ligne et toutes les 500 ms de temps de banc, `FS:` et `WCO:` dans les lignes écrites à la main. **Le relevé, banc par banc et test par test, est dans `C1-CONVERSION-BANCS.md`.**

Contrôle : les 22 fichiers convertis, lancés **sur l'ancien code**, donnent 918 verts sur 922. Les quatre rouges sont les quatre tests dont une attente change :

| Fichier, test | Avant | Après | Justification |
|---|---|---|---|
| `cnc-frame.test.js`, C2 | Un cadrage lancé sans aucune vitesse rapportée, sur le `$G` seul ; un `$G` `M3` / `M4` ou trop ancien l'arrête. | Sans vitesse rapportée : refusé au départ (`ETOUCH_MOTION_SPINDLE_UNKNOWN`, rien d'écrit). Avec : un `$G` `M3` / `M4` l'arrête toujours ; un `$G` qui vieillit pendant une ligne ne l'arrête plus. | R-3 (aucun repli « carte sans `FS:` ») et § 2.6 (aucun `$G` frais exigé pendant une ligne). Cas annoncé au § 4.1 point 2 de la conception. |
| `motion.test.js`, « référencé, position machine inconnue » | Le pas de 1 mm était accepté et écrit. | Les trois demandes refusées `ETOUCH_MOTION_NO_POSITION`, rien d'écrit. Test renommé. | R-1, § 2.2 : le repos prouvé vaut pour tout pas. |
| `motion.test.js`, « every ETOUCH_MOTION_* row… » | 11 codes, tous émis par `motion.js`. | 14 codes, émis par `motion.js` et `report-proof.js`. | Trois codes nouveaux. |
| `manual-jog-banner.test.js`, table | — | Dans 42 entrées, `canJog` revient un rapport (50 ms) plus tard après un mouvement. | Second rapport au repos. Lignes, annulations et refus identiques dans les 42. |

Changements d'entrée notables hors du relevé général : `block-probe.test.js` S13 attend que la ligne de dégagement soit écrite avant de fermer le flux (l'étape est publiée avant l'attente du `$G`) ; `motion.test.js` construit ses rapports dans le banc sans `WCO:` dérivé, parce que huit de ses tests reposent sur « aucun WCO reçu ».

**Limite du contrôle** : la comparaison « mêmes octets, même ordre » avant et après conversion repose sur les assertions d'octets des tests eux-mêmes, inchangées et vertes sur les deux codes. Elle n'a pas été instrumentée à part, test par test.

## 6. Choix prudents faits sans pouvoir demander

1. **Refus bref après prise d'origine, déverrouillage, connexion** (un rapport, ou le premier `$G`) : gardé. C'est le cas 3.5 de la conception ; le lever aurait demandé de croire un seul rapport.
2. **Ordre des refus** : dans le plan du cadrage et celui de la plaque, « position non confirmée » peut passer avant « machine non référencée » pendant ce court instant. Les deux refusent.
3. **Carte en `WPos:` sans aucun `WCO:` reçu** : la position machine est inconnue pour Touch, donc tout mouvement référencé est refusé jusqu'au premier `WCO:` (les gardes existants de ce mode le faisaient déjà).
4. **`$G` `M3` vu pendant qu'un palpage attend, machine au repos, rien en vol** : le superviseur arrête le palpage sans reset (personne n'a demandé l'arrêt de la broche, et le message dit « la broche est commandée »). « Arrêter la broche » touché ensuite envoie son `M5` ordinaire. Si l'opérateur touche le bouton **avant** le superviseur : reset.
5. **Prise d'origine d'un autre client** (`$H` du PC) : la présence positionnelle stricte s'ajoute aussi à ce chemin ; aucune condition existante n'est retirée.

## 7. Limites

Celles du § 5 de la conception, inchangées : pas perdus, incident manqué, veille de l'hôte, rotation réelle de la broche, `M3 S0` envoyé pendant une ligne, macro et programme en cours, départ de la prise d'origine, champ `A:` au départ, reprise après pause, carte sans `FS:`, deux rapports faux et concordants, mode `$10=0`, zéros, autres clients. **C1 n'est pas une protection universelle.**

S'y ajoutent :

- **`$G` perdu en pause `M6` pendant un zéro Z à la plaque** : le palpage s'arrête entre deux lignes, la reprise est refusée, Arrêter reste possible (testé). Perte de disponibilité assumée par la conception.
- **Palpage au bloc, flux de la tablette perdu pendant l'attente d'un `$G`** : le cycle s'arrête sans envoyer le `G0` qui sort `G38.3` du mode de déplacement (règle existante : rien sans le flux de l'appareil). La fenêtre existait ; elle est plus large (jusqu'à une demi-seconde par ligne).
- **Journal de la plaque** : pas de compteurs (E6).
- **Un rapport abîmé isolé au repos** refuse un départ le temps d'un rapport.

## 8. Ce qui n'est pas vérifié

- **Rien sur la machine** : cadence réelle des rapports et des `$G`, réponse de la carte à `$G` pendant un `Jog` et un `G38`, temps ajouté par ligne, comportement de la broche sur `M3 S0`.
- **Les boutons dans le navigateur pendant un palpage à la plaque** (§ 4.1 point 7) : `canPause` / `canSpindleStop` sont vérifiés sur l'état publié par le serveur ; le harnais navigateur n'a pas d'étape qui lance un palpage à la plaque, et je n'en ai pas ajouté.
- **Les phrases nouvelles à l'écran** : présentes au catalogue dans les trois langues, contrôlées par `test-refus-table.cjs` et `test-i18n.cjs` ; non regardées à l'écran aux deux tailles.
- **T13g au bloc** : sans les drapeaux d'une demande `$G` en vol (son banc n'a pas `actionMask`) ; ils sont reproduits pour la plaque et le cadrage.
- **T14 à 1 Hz** : seulement du `M5` à la ligne Z, pas un cadrage entier.
- **T16** : Pause sans la main pendant un `G38` du bloc n'est pas rejoué ici (les tests existants du bloc le couvrent, verts).
- Comparaison d'octets avant / après conversion : voir la limite du § 5.
- La fenêtre « palpage annulé par le superviseur, pas encore libéré, sans reset en route » de « Arrêter la broche » (§ 4.1 point 5) : codée (reset), mais trop brève pour être tenue au banc ; non testée.

## 9. Vérifications faites avant de rendre la main

| Commande | Résultat |
|---|---|
| `node examples/cncjs-touch/verify-project.cjs` | 234 / 234 contrôles réussis. |
| `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false` | 65 suites, 1 913 tests, tous verts (avant C1 : 61 suites, 1 838 tests). |
| ESLint sur `src/server/services/touch`, le test d'API touché et les trois fichiers de la page | 0 erreur, 0 avertissement. |
| Les 22 bancs convertis sur l'ancien code | 918 / 922, les quatre rouges du § 5. |
| Mutations, copie hors de l'arbre | § 4 : 37 essais, une survivante (M29, redondance annoncée). |
| `node examples/cncjs-touch/browser-run.cjs --strict --only e2e,v2` | Étapes `e2e` : toutes vertes (fr, en, es). Étape `v2` : 18 défauts relevés, dont 16 sont ceux de `HARNAIS-CONNU.md` ; les deux autres (« fetched while alarm: /favicon.ico », aux deux tailles) correspondent au défaut que corrige le commit `7baf7b84` de `feat/nuit-2026-11-26` (icône en ligne), absent de cette branche ; C1 ne touche ni la page d'accueil ni le son. Attribution par lecture de l'historique, **non vérifiée** en relançant le harnais sur la base : à revoir après la réunion des branches. |

La page n'a changé que par ses catalogues de phrases (deux fichiers) et une raison d'arrêt du journal. Les étapes `e2e` du harnais tournent sur la page de simulation, pas sur le serveur : elles ne passent pas par les gardes nouvelles.

## 10. Essai réel proposé

Ajouté à `design/refonte/PROTOCOLE-ESSAI.md`, section « C1 » (étapes C1-1 à C1-9, quinze minutes, fraise en l'air, depuis le kiosque de la Surface). Résultat principal attendu : les chiffres `reports` et `waits` du journal d'un cadrage, et ce que fait la broche sur `M3 S0`.
