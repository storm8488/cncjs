# P4 — Remise en route après un Arrêter (référence perdue) : conception

Lot P4 de `design/PROMPT-PLAQUE-XYZ.md`, 2026-11-21, arbre `cncjs-wt/P4` (branche `feat/P4`, base `caf09b31`). Conception seule : aucun code écrit, rien lancé, aucun accès à la tablette ni à la CNC. À relire par Astra ultra avant tout code (règle commune 1).

## 0. Décisions

| # | Décision | Raison |
|---|---|---|
| D1 | Le mouvement « Aller au-dessus du zéro pièce » **réutilise le moteur du cadrage à vide F1** (`motion.frame`, session `kind: 'cnc'`) avec un but `purpose: 'zero'`. Ses lignes sont de la forme que `cncFrameLinesValid` admet déjà (`motion.js:310-313`) : **aucune liste blanche étendue**. | Le moteur F1 a déjà subi trois relectures Astra : surveillance par pas, liaison flux / main / session de carte, arrivées comparées, Z jamais redescendu, arrêts à `0x85` seul, rien après une bannière. Écrire un second moteur serait refaire ces fenêtres. |
| D2 | X/Y en **coordonnées pièce** : `$J=G90 G21 X0 Y0 F…`, pas `G53`. | Mêmes raisons que F1 (`F1-CONCEPTION.md` § 3, lignes « G53 ») : `G53` dans `$J=` n'est pas prouvé sur ce binaire (C6) ; et l'arrivée comparée à la position machine attendue (= décalage prouvé par D2) **vérifie** que la machine applique bien le zéro pièce (question E-B) : un écart arrête et invalide D2. |
| D3 | Hauteur : celle de F1, haut de la course utilisable en Z − 5 mm (LUNYEE : **Z machine −5**). Plus haut, Z reste où il est (juste après une prise d'origine, Z est à 0 : aucune ligne Z). | « Haut de course » du prompt, avec la marge de F1 (C13 : 0 est à 2 mm du capteur ; une alarme de fin de course redémarre la carte). |
| D4 | La prise d'origine reste la commande existante (ticket `home`, `$H`). La montée et le retour sont une **proposition séparée**, jamais enchaînée à la prise d'origine. | Exigence du prompt ; deux attestations différentes (table dégagée pour la prise d'origine, rien de haut sous le trajet pour le retour). |
| D5 | Le serveur garde une **remise en route ouverte** (`r.recovery`) qui survit à la prise d'origine (laquelle efface `referenceLost` et `lastAlarm`, `job-service.js:425-427`). Elle n'est ouverte que si la machine **avait** une référence (référencée ou usinage commencé) au moment de la perte. | Sans elle, la proposition disparaît dès la prise d'origine. La condition évite d'annoncer « a redémarré » à chaque première connexion ou après un redémarrage de CNCjs (`referenceLost` reste alors nul, `ECARTS-PLAN.md:306`). |
| D6 | Textes : « La machine a redémarré : position perdue. », pas « La carte… » : le glossaire (`SPEC-REFONTE.md` § 9.3) réserve « carte » à « Détails ». | Écart de mot avec le prompt, voulu. |
| D7 | Les codes de refus existants ne changent pas ; la **page** les présente par une famille unique `position-perdue` quand `referenceLost` n'est pas nul. | Le prompt : « gardent leur code mais renvoient au même remède » ; aucun garde serveur touché. |
| D8 | Aucun `$X` automatique, aucun `$H` automatique, aucun reset envoyé par P4. Déverrouiller reste secondaire. | `SPEC-REFONTE.md` § 6.9. |

## 1. Ce qui existe (lu dans le code)

- `referenceLost` : `'restart'` à la bannière (`r.reset`, `job-service.js:532`), `'alarm'` à `ALARM:n` (`:504`) ou à un état `Alarm` d'une machine référencée (`:446`), effacé par une prise d'origine finie (`:427`, `:459`) ; publié nul quand `homed` (`:1712`).
- Après un Arrêter en usinage, `r.lastStop` garde fichier et ligne (`:2657`) ; une bannière pendant un travail marque `boardRestarted`/`aborted` (`:553-558`).
- Refus actuels sans référence : `ETOUCH_START_NOT_HOMED` (`:1048`), `ETOUCH_ORIGIN_NOT_HOMED` (`:857`, `motion.js:1343`), `ETOUCH_CNC_FRAME_NOT_HOMED` (`:1978`), `ETOUCH_MOTION_ALARM` (`motion.js:436`), `ETOUCH_FRAME_RESTART` ; un pas refusé par la carte (`lastJog.reason = 'error:15'`, `motion.js:385`) est présenté « La machine a refusé le déplacement (erreur 15) » + Détails (`refus.js:29-30`).
- Encart « Ce qui s'est passé » et liste de ① : `seance.js:17-71`, `grbl-help.js:67-77`.
- Arrêter pendant un déplacement de la tablette : `0x85` seul (`job-service.js:2620-2624`), **jamais un reset** ; pendant un usinage : feed hold puis reset (`halt.js`), ce qui a fait redémarrer la carte le 18 novembre (E3). P4 ne change pas Arrêter.

## 2. Parcours de l'opérateur

**É0 — L'incident.** Usinage arrêté (Arrêter), la carte redémarre (bannière). Bandeau « Alarme » ou « Origine à reprendre » ; `#t-recover` mène à ①.

**É1 — ① Machine, encart (`#machine-incident`), quatre lignes au plus :**
1. « La machine a redémarré : position perdue. » (`recovery.cause === 'restart'`) ou « Alarme N : position perdue. » (`'alarm'`).
2. « Perdu : la position, et l'usinage arrêté à la ligne 1 234. » (sans ligne connue : « Perdu : la position de la machine. »).
3. « Gardé : le fichier chargé. »
4. « Zéro pièce : à vérifier après la prise d'origine. » → après D2 : « Zéro pièce : gardé, vérifié. » (jamais avant `workOffset.state === 'proven'`, § 6.9). [Détails] : code, `$#` lu, « Le zéro pièce est enregistré dans la machine ($#) ; il est relu et vérifié après la prise d'origine. »

Liste (ordre) : connexion · main · réglages · arrêt · **origine** [Prise d'origine machine…] · zéro · **`dessus-zero`** (nouvelle, présente seulement si `recovery`) · reprise. Barre : « Il manque : l'origine machine. » [Prise d'origine machine…] (dialogue existant, case, 3 touchers).

**É2 — Prise d'origine en cours** : rayée « Prise d'origine en cours. » ; Arrêter dans le bandeau.

**É3 — Vérification du zéro pièce (D2, automatique)** : ligne `zero` « la machine le vérifie… » ; `dessus-zero` en attente « Aller au-dessus du zéro pièce : après la vérification du zéro pièce ».

**É4 — Proposition.** D2 prouvé : la barre de ① propose **[Aller au-dessus du zéro pièce…]** (320 × 64) ; la ligne `dessus-zero` porte [Passer] (48). Rayé avec la raison du serveur si `canOverZero` est faux. Passer : `recovery-dismiss`, rien n'est envoyé à la machine, la barre passe à la ligne suivante (reprise ou « Suite »).

**É5 — Dialogue (classe « met en mouvement », 3 touchers, `SPEC-REFONTE.md` § 6.3)** :
- Titre « Aller au-dessus du zéro pièce ». Texte : « La fraise monte d'abord tout en haut, puis va au-dessus du zéro pièce. Elle ne redescend pas. »
- Case : « La broche est arrêtée et rien sur la table n'est plus haut que la fraise relevée. »
- Bouton d'engagement « Aller au-dessus du zéro pièce », armé 600 ms après l'affichage et la case cochée, jamais sous le bouton d'ouverture.
- Détails : lignes exactes, Z machine visée, X/Y machine visés, vitesses, durée.

**É6 — En mouvement** : bandeau « Déplacement » ; barre « Déplacement en cours. » ; Arrêter / Pause / relâchement immédiats. Flèches grisées.

**É7 — Fin** : ligne `dessus-zero` faite « Fraise au-dessus du zéro pièce, en haut. » ; action suivante : [Reprendre à la ligne N…] (volet § 5.12 existant) si l'usinage a été arrêté, sinon « Suite : … → ». Arrêt avant la fin : « Déplacement arrêté avant le zéro pièce. Regardez où est la fraise. » [Recommencer] (nouvelle préparation, jamais l'ancien ticket).

**Ailleurs (②–⑤, volets, carte Sonde)** : tout refus des familles `origine-a-prendre` ou `alarme`, et un pas refusé `error:15`, s'affichent quand `referenceLost` n'est pas nul : « La machine a redémarré : position perdue. » (ou « Après l'alarme, la machine a perdu sa position. ») + [Remise en route] (va à ①). Le code d'origine reste dans Détails.

## 3. Commandes envoyées, dans l'ordre

Notation : `mx, my, mz` position machine au repos ; `wx, wy` position pièce ; `ox = mx − wx`, `oy = my − wy` (décalage X/Y tel que CNCjs l'a, comme F1 `job-service.js:2094`) ; `zs` hauteur sûre ; `f`, `fz` vitesses. Valeurs écrites par `fmt3`.

| # | Ligne | Existe si | Délai | Attendu avant la suivante (déjà codé par F1) |
|---|---|---|---|---|
| — | `$H` (commande `homing`, ticket `home` existant) | geste séparé É1 | `HOMING_MAX_MS` 180 s | prise d'origine finie (Home puis Idle), `homed`, puis D2 prouvé (`G55`/`G54`, `$#`, `$G`, `WCO` : transaction existante, aucun axe) |
| 0 | `M5` | toujours | 10 s | `ok`, deux rapports, `Idle`, position = celle du plan |
| 1 | `$J=G91 G21 Z<zs − mz> F<fz>` | `zs − mz ≥ 0,01` | durée + 10 s | `ok`, `Idle`, Z machine = `zs` ± 0,05, X/Y inchangés ± 0,05 |
| 2 | `$J=G90 G21 X0 Y0 F<f>` | distance X/Y > 0,001 mm | durée + 10 s | `ok`, `Idle`, X machine = `ox` ± 0,05, Y = `oy` ± 0,05, Z ≥ Z constaté avant la ligne 2 − 0,05 ; puis fin `ended` |

Bornes (LUNYEE apprise : `$130-132` = 408/396/130, `$23=3`, `$20=1`) :
- `zs = usableOf(limitsAt(Z)).high − 5` = **−5** ; refus si `zs < usable.low` (−129,5).
- Cible X/Y machine `(ox, oy)` dans la course utilisable : X `[0 ; 407,5]`, Y `[0 ; 395,5]` (`usableOf`, marge 0,5 mm côté opposé à l'origine, `motion.js:285-288`) ; refus chiffré sinon.
- Départ `(mx, my)` dans la course utilisable (comme F1 G15).
- `f = min(600, $110, $111)` ; `fz = min(300, $112)` (LUNYEE : 600 et 300). Aucune vitesse reçue de la page.
- Chaque ligne ≤ `MAX_JOG_MS` 60 s : sur la LUNYEE la plus longue diagonale (567,9 mm) dure 56,8 s, la plus longue montée (124,5 mm) 24,9 s.

Où c'est vérifié contre la course : (1) `overZeroPlan` à la préparation ; (2) le même plan refait à l'exécution, identique ligne pour ligne (sinon refus) ; (3) avant chaque ligne, `jogReady` complet et `holdReason` (`motion.js:1053-1082`) ; (4) après chaque ligne, l'arrivée (`arrivalOff`, `zFloor`) ; (5) par la carte (`$20=1`) : un `$J=` hors course donne `error:15` sans alarme, qui arrête la séquence et invalide D2 (`motion.js:1196-1202`).

Jamais envoyé par P4 : `G0`, `G1`, `G53`, `G38`, `G10`, `M3`, `S`, `$X`, `0x18`. Arrêts : `0x85` seul (F1).

## 4. État serveur et API ajoutés

**`r.recovery`** (`job-service.js`, record du contrôleur) : `null` ou `{ cause: 'restart' | 'alarm', at, done: false }`.
- Ouverte dans `r.reset`, `r.alarmed` et la branche `Alarm` de `r.status`, **avant** la remise à faux de `homed`, si `r.homed === true` ou si un usinage est commencé et non fini. Déjà ouverte : `cause` passe à `'restart'` si c'est une bannière (jamais l'inverse), `done` repasse à faux.
- Gardée par la prise d'origine.
- `done = true` quand une session `purpose: 'zero'` finit `ended`.
- Fermée par : `recovery-dismiss`, le départ d'un usinage (`r.run`), la fermeture du port (record supprimé).

**Instantané** : `recovery: {cause, at, done} | null`, `canOverZero`, `overZeroReason`, `refusals.overZero` (code et paramètres, comme `frame`), et dans `motion.frame` / `motion.lastFrame` le champ `purpose` (`'zero'` ou absent). La signature de changement (`job-service.js:2840`) inclut `recovery`.

**Opérations** `POST {action: 'machine', operation}` (ajoutées à `MACHINE_OPERATIONS`, `:2135`) :
- `over-zero-prepare` : `generation`, `transportId` ; `moves.bound` ; plan ; ticket `{nonce (24 octets), operation: 'over-zero', lines, offset {x,y}, proof: r.offset.proof(), expires: +15 s, transportId}` ; réponse `{nonce, name, expiresIn, generation, overZero: {lines, safeZ, target: {x, y} (machine), feed, zFeed, seconds}}`.
- `over-zero` : `nonce` ; ticket consommé ; plan refait **synchrone** (pas de relecture de fichier, donc pas de `frameStarting`) ; lignes, décalage (`fmt3`) et preuve D2 identiques ; `control.authorize(port, actor, 'machine')` ; `moves.frame(c, r, plan, actor, transportId)`.
- `recovery-dismiss` : `generation` ; garde de `set-kind` (`machineReady`) ; refusé pendant une session `purpose: 'zero'` ; rien n'est écrit à la carte ; journal `{event: 'recovery', result: 'dismissed'}`.

**`motion.js`** : `frame()` accepte `plan.purpose === 'zero'` avec `revision: null` ; `cncStop` saute la cause `program` (`:988`) **pour ce seul but** ; `endFrame` dit « fraise au-dessus du zéro pièce, restée en haut » ; `purpose` dans la session, l'instantané et le journal. Rien d'autre ne change dans la surveillance.

## 5. Gardes et refus de `over-zero-prepare` / `over-zero`

Dans cet ordre, à la préparation et à l'exécution. Rien n'est écrit en cas de refus.

| # | Garde | Code | Phrase FR (famille) | Remède |
|---|---|---|---|---|
| G1 | remise en route ouverte | `ETOUCH_OVER_ZERO_NO_RECOVERY` | « Rien à remettre en route. » (`inconnu`) | Détails |
| G2 | pas un laser déclaré (`requireCapability(c,'cncFrame')`) | `ETOUCH_CNC_FRAME_LASER` (existant) | famille `type-machine` | Type de machine… |
| G3 | `jogReady` : déplacement activé, au repos `Idle`, pas d'alarme, pas de prise d'origine, palpage, chargement, travail, cadrage, file, automatisme ; `$13=0` | codes existants (`ETOUCH_MOTION_*`, raisons) | familles `occupee`, `alarme`, `usinage-en-cours`… | les leurs |
| G4 | `r.homed === true` | `ETOUCH_OVER_ZERO_NOT_HOMED` | « Origine machine pas prise : la machine ne sait pas où elle est. » (`origine-a-prendre`) | Prise d'origine machine… |
| G5 | D2 prouvé (`offsetReady`) | `ETOUCH_OFFSET_*` (existants) | famille `zero-a-verifier` | aucun / Vérifier à nouveau / Refaire le zéro pièce |
| G6 | broche arrêtée, et connue (`FS` ou `$G` récent) | existants (`spindleStill`, `CNC_FRAME_SPINDLE_UNKNOWN`) | `broche-tourne` | Arrêter la broche |
| G7 | `$20 = 1` | `ETOUCH_OVER_ZERO_SOFT_LIMITS` | « Les limites de course de la machine sont coupées : déplacement refusé. » (`dessus-zero-limites`, nouvelle) | Détails |
| G8 | MPos X/Y/Z et WPos X/Y connues | `ETOUCH_OVER_ZERO_POSITION` | `origine-a-prendre` | Prise d'origine machine… |
| G9 | enveloppe Z non ambiguë, `zs ≥ usable.low` | `ETOUCH_OVER_ZERO_Z` | « Hauteur sûre introuvable. » (`dessus-zero-limites`) | Détails |
| G10 | cible `(ox, oy)` dans la course utilisable, enveloppe non ambiguë | `ETOUCH_OVER_ZERO_OUTSIDE {axis, value, low, high}` | « Le zéro pièce est hors de la course en {axe}. Refaites le zéro pièce. » (`zero-hors-course`, nouvelle) | Refaire le zéro pièce |
| G11 | départ `(mx, my)` dans la course utilisable | `ETOUCH_OVER_ZERO_START {axis, value, low, high}` | « La fraise est hors de la course en {axe}. Refaites la prise d'origine. » (`origine-a-prendre`) | Prise d'origine machine… |
| G12 | chaque ligne ≤ 60 s | `ETOUCH_OVER_ZERO_SLOW {seconds}` | `vitesse` | Détails |
| G13 | quelque chose à faire (montée ≥ 0,01 ou X/Y > 0,001) | `ETOUCH_OVER_ZERO_THERE` | « La fraise est déjà au-dessus du zéro pièce. » (information) | aucun |
| T1 | ticket : même nonce, flux, ≤ 15 s, une fois | `ETOUCH_OVER_ZERO_EXPIRED` | `confirmation-perimee` | Recommencer |
| T2 | plan identique (lignes, décalage, preuve D2) | `ETOUCH_OVER_ZERO_CHANGED` | `confirmation-perimee` | Recommencer |

Les phrases serveur (FR, `machine-profile.js`, table des messages de `machineRefusal`) et leurs lignes EN/ES (`i18n-messages-machine.js`) sont ajoutées en fin de table.

**Redirection page (D7)**, dans `refus.js` `lire()` à partir du dernier état reçu : si `machine.referenceLost` n'est pas nul, alors les familles `origine-a-prendre` et `alarme`, la raison `error:15` d'un pas, et `ETOUCH_FRAME_RESTART` deviennent la famille **`position-perdue`** : phrase « La machine a redémarré : position perdue. » (`'restart'`) ou « Après l'alarme, la machine a perdu sa position. » (`'alarm'`), remède `remise-en-route`. Sur ①, ce remède est déjà filtré (`seance.js:141`) : l'action reste [Prise d'origine machine…]. Cause globale n° 10 de `seance.js:91` : même phrase et même remède hors de ①. Sans `referenceLost`, rien ne change (témoin).

## 6. Cas d'échec

| Cas | Ce qui se passe | Après |
|---|---|---|
| Contact de sonde non trouvé / déjà fermé | **Sans objet** : P4 n'envoie aucun `G38`, et ni la sonde ni `Pn:P` ne figurent dans ses gardes. Une pince restée sur la fraise ne change rien au mouvement. | — |
| Prise d'origine en échec (`ALARM:8/9`, interrompue) | Comportement existant : `homing.interrupted`/`refused`, `homed` reste faux. La remise en route reste ouverte. | Encart inchangé ; refaire la prise d'origine. |
| D2 non prouvé (`$#` perdu par le redémarrage, autre décalage) | `canOverZero` faux, raison `zero-a-verifier` ; la proposition reste rayée. | [Vérifier à nouveau] ou [Refaire le zéro pièce] (③). |
| Alarme pendant la montée ou le retour | `cncStop` : `ETOUCH_FRAME_ALARM`, fin de séquence, `0x85`. L'alarme rouvre la remise en route (`'alarm'`, `done` faux). | ① : encart, prise d'origine. |
| Redémarrage de la carte (bannière) pendant | `frameRestarted` : fin dans le pas de la bannière, **aucun octet** à la nouvelle session (`motion.js:1024-1036`). Remise en route `cause: 'restart'`. | ①, depuis le début. |
| `error:N` de la carte (dont `error:15`) | `ETOUCH_FRAME_REFUSED`, arrêt ; `error:15` invalide D2. | Nouvelle preuve D2, puis [Recommencer]. |
| Arrivée hors tolérance (décalage exécuté ≠ rapporté, E-B ; pas perdus) | `ETOUCH_FRAME_POSITION`, arrêt, D2 invalidé ; Z reste en haut. | « Déplacement arrêté… » ; Vérifier / Refaire le zéro pièce. |
| Perte du flux de l'appareil | Rotation : 3 s de grâce sans ligne ; au-delà ou fermeture réelle : `ETOUCH_FRAME_STREAM`, `0x85`. | [Recommencer] depuis la tablette. |
| Main prise ou rendue | `ETOUCH_FRAME_CONTROL`, un seul `0x85` (réunion F1 × F4). | idem. |
| Rapports anciens (> 2,5 s) | `ETOUCH_FRAME_STALE`, `0x85`. | idem. |
| Délai d'une ligne dépassé, `ok` manquant | `ETOUCH_FRAME_TIMEOUT`, `0x85`. | idem. |
| Arrêter, Pause, relâchement, Arrêter la broche, arrêt d'un client CNCjs (`!`, `jogCancel`, `autolevel:stop`…) | Fin dans le même pas, `0x85` seul, répété tant que `Jog` est rapporté ; **pas de reset**, donc pas de redémarrage. La remise en route reste ouverte, `done` faux. | La proposition revient, ticket neuf. |
| Commande non sûre d'un socket, upload CNCjs, pas manuel pendant | Refusés (« Cadrage en cours » : réservation F1). | — |
| CNCjs ou le serveur meurt pendant une ligne | La carte finit la ligne en cours (≤ 60 s, dans la course, Z en haut), rien de plus. `r.recovery` est perdu avec le serveur (mémoire seule). | Après redémarrage de CNCjs : `homed` faux, prise d'origine (pas de carte « a redémarré »). |

## 7. Faits de la carte utilisés (`design/refonte/FIRMWARE.md`)

| Fait | Où il sert | Degré de preuve |
|---|---|---|
| E3 : après un Arrêter en usinage ou `ALARM:2`, MPos 0, non référencée | la détection, la carte « a redémarré » | **observé** ; mécanisme inconnu (H1 reset → redémarrage, H2 garde, H3 DTR) |
| E1 : MPos 0,0,0 juste après `$H` (Z en haut) | aucune ligne Z juste après la prise d'origine | observé |
| E4 / R6 : `WCO:0,0,0` après `$H`, `$#` garde G54 ; `G55` puis `G54` recharge | D2 avant tout mouvement en coordonnées pièce | observé (terrain) + amont |
| `$#` conservé à travers un **redémarrage** de l'ESP32 | « zéro pièce gardé » | **amont seulement** (décalages relus de la mémoire au démarrage) ; D2 le constate ou le refuse |
| R1 : X, Y `[0 ; course]`, Z `[−course ; 0]` | bornes G9 à G11 | observé + amont |
| R2 : la carte refuse avant la borne (−129,945) : marge 0,5 mm | `usableOf` | observé |
| R3 / § a : `$J=` hors course → `error:15`, sans alarme | dernier rempart, arrêt + D2 invalidé | amont ; `error:15` observé le 18 novembre (Z refusé à MPos 0) |
| `$J=G90` en coordonnées pièce, `0x85` sur la LUNYEE | ligne 2, arrêts | **amont, non relevé** (essai F1 de `PROTOCOLE-ESSAI.md` § 8) |
| R9 : `WCO:` un rapport sur dix | D2 (déjà) | amont |
| R14 : `$H` dure des dizaines de secondes | délai 180 s existant | amont, non mesuré |
| R12 : Wi-Fi ouvert, un autre client peut écrire | limite : un mouvement extérieur est vu à l'arrivée (position), pas empêché | observé (point d'accès ouvert) |

## 8. Fichiers touchés

Serveur : `src/server/services/touch/job-service.js` (fichier partagé : `r.recovery` dans `r.reset`/`r.alarmed`/`r.status`/`r.run`, `overZeroPlan` à côté de `cncFramePlan`, trois opérations, instantané et signature, groupés en fin de section) ; `motion.js` (`purpose`, saut de la cause `program`, message de fin) ; `machine-profile.js` (phrases `ETOUCH_OVER_ZERO_*`) ; `__tests__/touch-codes-catalog.js` si le catalogue des codes l'exige.

Page : `touch/seance.js` (ligne `dessus-zero`, action, cause n° 10) ; `touch/refus.js` (famille `position-perdue`) ; `touch/grbl-help.js` (lignes de l'encart) ; `touch/job-controls.js` (préparation et confirmation `over-zero`, sur le modèle de `frame`) ; `touch/i18n-messages-refus.js`, `touch/i18n-messages-machine.js`, `touch/i18n-messages.js` (blocs ajoutés en fin, FR/EN/ES) ; `verify-project.cjs` (nouveau test enregistré) ; `browser-run.cjs` (phase de la fixture `stopped-unhomed` complétée de `recovery`).

Documents : `design/refonte/SURETE.md` § P4, `design/refonte/PROTOCOLE-ESSAI.md` § P4, `design/plaque/P4-COMPTE-RENDU.md`.

## 9. Tests exigés (chacun rouge sans le code)

Serveur, faux contrôleur — `__tests__/over-zero.test.js` :
1. Ouverture de `recovery` : bannière après prise d'origine → `restart` ; `ALARM:3` → `alarm` ; bannière puis alarme → reste `restart` ; bannière sans référence ni usinage → `null` (témoin) ; usinage commencé non référencé ($22=0) puis bannière → ouverte.
2. `recovery` survit à la prise d'origine (`referenceLost` nul, `recovery` présente) ; fermée par `recovery-dismiss` (aucune écriture au port), par le départ d'un usinage ; `dismiss` refusé pendant la séquence.
3. Plan : G54 X50 Y100, Z machine −60 → `['M5', '$J=G91 G21 Z55 F300', '$J=G90 G21 X0 Y0 F600']`, attendus `{z:−5}` puis `{x:50, y:100}` ; Z à 0 ou à −3 → aucune ligne Z ; toutes les lignes passent `cncFrameLinesValid`.
4. Propriété « jamais de descente » : 500 positions et décalages tirés dans la course → au plus une ligne Z, non signée, en seconde position ; la ligne X/Y sans mot Z.
5. Un test par garde G1 à G13 : code, paramètres chiffrés (G10 : X 407,6 → `high 407.5`), **rien d'écrit**.
6. Ticket : expiré (15 s), autre flux, nonce rejoué, machine bougée entre les deux temps, preuve D2 changée, décalage changé → `_EXPIRED`/`_CHANGED`, rien d'écrit.
7. **Sans programme chargé, la séquence va au bout** (rouge sans le saut de la cause `program`) ; un programme chargé puis remplacé pendant ne l'arrête pas non plus, l'upload CNCjs reste refusé.
8. Arrêts : Arrêter pendant la montée et pendant X/Y → un `0x85`, aucune ligne après, **aucun 0x18** ; Pause ; relâchement ; Arrêter la broche (pas de `M5` en `Jog`) ; `!` d'un socket ; main rendue ; flux fermé (> 3 s) ; rapports anciens ; `error:15` (D2 invalidé) ; arrivée décalée (`_POSITION`, D2 invalidé).
9. Bannière pendant X/Y : aucun octet après la bannière ; `recovery.cause` `restart`, `done` faux.
10. Fin : `lastFrame.purpose === 'zero'`, `result 'ended'`, `recovery.done` vrai ; journal `frame` avec `purpose`.

Simulateur, **profil LUNYEE** — `__tests__/over-zero-lunyee.test.js` (pont de `cnc-frame-lunyee.test.js`) :
- S1. Cas du 18 novembre : prise d'origine, `G10 L20 P1 X50 Y100 Z-105` (zéro posé), usinage lancé, Arrêter en mouvement → `ALARM:3` + bannière ; `recovery` `restart` ; `ETOUCH_START_NOT_HOMED` et `ETOUCH_ORIGIN_NOT_HOMED` gardent leur code ; `$X` puis pas +Z → `error:15` ; prise d'origine ; D2 prouvé, **dans les deux hypothèses** `executedAfterHoming: 'zero'` et `'stored'` ; « Aller au-dessus » → MPos finale 50, 100, 0, sans erreur ni alarme ; `stoppedAtLine` conservé.
- S2. Depuis Z −60 : montée à −5,000 puis X/Y ; Z relevé à chaque rapport jamais sous −5,05.
- S3. G54 X 407,5 accepté et parcouru sans `error:15` ; 407,6 refusé chiffré ; X 0 accepté.
- S4. Décalage exécuté changé après la preuve (comme L8a de F1) → arrêt `_POSITION` après la ligne X/Y, D2 invalidé, Z en haut.
- S5. Arrêter pendant X/Y → `0x85`, pas de bannière, référence et D2 gardés, proposition de nouveau possible et menée au bout.
- S6. Reset injecté pendant X/Y → `ALARM:3`, bannière, rien d'écrit après, `recovery` rouverte.

Page (hors navigateur, `examples/cncjs-touch/test-remise-en-route-p4.cjs`, enregistré dans `verify-project.cjs`) :
- P1. `referenceLost: 'restart'` : sur ② à ⑤, `ETOUCH_START_NOT_HOMED`, `ETOUCH_ORIGIN_NOT_HOMED`, `ETOUCH_CNC_FRAME_NOT_HOMED`, `ETOUCH_MOTION_ALARM`, `ETOUCH_FRAME_RESTART`, `lastJog` `error:15` → phrase `position-perdue`, remède `remise-en-route`, code d'origine dans Détails ; `'alarm'` → l'autre phrase ; `referenceLost` nul → présentation actuelle (témoin).
- P2. Encart : quatre lignes dans l'ordre ; « gardé, vérifié » jamais avant `proven`.
- P3. Ligne `dessus-zero` : absente sans `recovery` ; en attente avant la preuve ; action principale après ; rayée avec la raison de `refusals.overZero` ; [Passer] envoie `recovery-dismiss` seul ; faite après `done`.
- P4. Dialogue : trois touchers, case, libellé, armement à 600 ms, un seul envoi du nonce ; Arrêter sans délai pendant la séquence ; [Recommencer] demande un nouveau ticket.
- P5. `test-refus-table.cjs` (chaque nouveau code a sa famille), `test-i18n.cjs` (FR/EN/ES), `test-textes-regles.cjs` (aucun `$`, `G`-code ou « carte » hors Détails).
- Navigateur si disponible : `browser-run.cjs --strict --only <étape remise en route>`.

Avant de rendre : `node examples/cncjs-touch/verify-project.cjs`, `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false`, ESLint sur les fichiers touchés.

## 10. Essai réel (à ajouter à `PROTOCOLE-ESSAI.md` § P4)

Préalable : essai F1 phases A-B réussi (il relève `$J=G90` en coordonnées pièce et `0x85` sur la LUNYEE). Sinon, le faire d'abord. **Broche débranchée de son alimentation, pas de fraise dans la pince, table vide** jusqu'à P4-D. CNCjs classique ouvert sur le PC en observateur. Main sur l'arrêt physique à chaque mouvement.

| Étape | Manipulation | Attendu / relevé |
|---|---|---|
| P4-A1 | Sans mouvement : machine connectée et référencée, zéro pièce posé (X 200, Y 200). Débrancher puis rebrancher l'USB de la carte (ou la couper et la rallumer), reconnecter. | Encart « La machine a redémarré : position perdue. » ; noter les messages de démarrage (discriminant E-1). |
| P4-A2 | Toucher Démarrer (④), un zéro (③), un pas +Z (après Déverrouiller seulement si l'opérateur le veut). | Chaque refus dit « position perdue » + [Remise en route] ; Détails : le code d'origine. |
| P4-A3 | Détails de l'encart. | `$#` relu : G54 X 200 Y 200 présent ou non (fait « `$#` après redémarrage »). |
| P4-B1 | [Prise d'origine machine…] puis attendre. | Prise d'origine, puis « Zéro pièce : gardé, vérifié » ou « à refaire » (noter lequel). |
| P4-B2 | [Aller au-dessus du zéro pièce…] juste après : lire le dialogue et Détails. | Lignes `M5` et `$J=G90 G21 X0 Y0 F600` seulement (Z déjà en haut). |
| P4-B3 | Cocher, engager. | X/Y seuls, Z immobile ; arrivée MPos 200/200 ± 0,05 ; chronométrer (≈ 28 s). |
| P4-B4 | Refaire. | Refus « déjà au-dessus ». |
| P4-B5 | Descendre Z à la main vers −60, s'écarter de X/Y, relancer. | `M5`, Z monte **seul** à −5,000, puis X/Y ; Z n'a jamais baissé. |
| P4-C1 | Relancer depuis ailleurs, **Arrêter pendant la montée**, puis **pendant X/Y**. | Arrêt net, aucune bannière, référence gardée, proposition revenue. |
| P4-C2 | Même chose avec Pause, puis en fermant l'onglet de la page du PC qui l'a lancé, puis en prenant la main depuis la tablette. | Arrêt dans chaque cas, rien ne repart. |
| P4-D1 | Cas du terrain, encadré : planche bridée, fraise montée, broche **toujours débranchée**, zéro pièce posé au-dessus de la planche ; lancer un petit fichier d'essai (Z de travail ≥ 5 mm au-dessus de la planche) ; Arrêter en plein mouvement. | Noter : bannière ou non (H1). Si la carte redémarre : encart, prise d'origine, D2, Aller au-dessus : la fraise est au-dessus du coin attendu ; [Reprendre à la ligne N…] proposé. |
| P4-D2 | Passer au lieu d'aller au-dessus. | La proposition disparaît, rien ne bouge. |

Ne pas essayer : cible hors course « pour voir », `$20=0`, reset en mouvement hors P4-D1, redémarrage de CNCjs pendant un déplacement. Relevé : fait / non fait par étape, lignes écrites, positions, temps, surprises.

## 11. Ce qui reste incertain

- La cause du redémarrage (H1, H2, H3) : P4 traite le résultat, pas la cause ; l'Arrêter d'un usinage (feed hold puis reset) continuera de faire redémarrer la carte si H1 est vrai.
- Si `$#` survit au redémarrage sur ce binaire : D2 le dira ; sinon « Zéro pièce : à refaire », et la proposition reste rayée.
- E-B (décalage exécuté après `$H`) : couvert par D2 puis par l'arrivée comparée ; un écart arrête après un trajet X/Y entier, Z en haut, dans la course.
- `$J=G90` en coordonnées pièce et `0x85` : non relevés tant que l'essai F1 n'est pas fait.
- `G92` remis à zéro par le redémarrage : supposé par le simulateur, non relevé ; sans effet sur la sûreté (`ox = MPos − WPos` l'inclut, comme le programme).
- La hauteur −5 laisse 7 mm sous le capteur (pull-off 2 mm) : valeur F1, non mesurée.
- Un mouvement d'un client Wi-Fi pendant la séquence n'est vu qu'à l'arrivée (R12).
- `r.recovery` n'est pas persistant : perdu si CNCjs redémarre (cas alors traité par « Origine à prendre »).
- Les mots « Cadrage en cours » des refus de réservation F1 s'afficheront pendant ce déplacement si la page ne les filtre pas par `purpose` : à vérifier au test P4 de page.
