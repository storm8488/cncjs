# P4 — Remise en route après un Arrêter (référence perdue) : conception

Lot P4 de `design/PROMPT-PLAQUE-XYZ.md`, 2026-11-21, arbre `cncjs-wt/P4` (branche `feat/P4`, base `caf09b31`). Conception seule : aucun code écrit, rien lancé, aucun accès à la tablette ni à la CNC.

**Version 3**, après la deuxième relecture d'Astra ultra (commit `141ec466`, verdict « à revoir » : 3 dangers, 5 « à corriger », 2 remarques) et les décisions de l'orchestrateur. Chaque constat a été vérifié dans le code ; la réponse est à la fin (§ 13). Changements principaux :
- **Une règle simple remplace les états `same` / `redone` de la v2** : tout incident remet le zéro pièce à « à confirmer » ; le serveur **refuse le départ** (reprise à une ligne comprise) tant que les trois axes ne sont pas **refaits par la tablette** ou **validés** par un geste explicite, possible seulement quand la machine applique exactement le dernier zéro accepté.
- La même règle vaut pour une connexion neuve : l'absence d'historique n'autorise rien.
- Le mouvement « Aller au-dessus du zéro pièce » reste retiré (décision de l'orchestrateur), écrit comme écart assumé, à confirmer par l'opérateur.

À relire de nouveau par Astra avant tout code (règle commune 1).

## 0. Décisions

| # | Décision | Raison |
|---|---|---|
| D0 | **Pas de mouvement « Aller au-dessus du zéro pièce » dans P4.** Écart assumé avec le prompt § 2 (« puis (sur confirmation) montée en Z haut et retour… »), maintenu par l'orchestrateur, **à confirmer par l'opérateur**. Mis de côté dans `IDEES.md`, à reconcevoir entièrement (Z déjà haut, bornes du retour, position de départ inconnue, ticket lié à la position : rien de cela n'est validé) après l'essai F1 qui relève `$J=G90` en coordonnées pièce et `0x85` sur la LUNYEE. | Sûreté d'abord : lot sans mouvement nouveau. Le cadrage à vide F1 **ne remplace pas** ce retour (il dépend d'un fichier, parcourt son rectangle et revient au point de départ, `job-service.js:2098`, et ne montre rien de Z) ; il sert seulement d'aide visuelle avant la validation (D8). |
| D1 | **Garde serveur du zéro pièce au départ** (`ETOUCH_START_ZERO_UNCONFIRMED`, profil CNC) : un usinage, reprise à une ligne comprise, ne part que si le **zéro est confirmé** (§ 4.2). Contrôlé partout où `readyFor(c, 'start')` l'est déjà : préparation du ticket (`job-service.js:2422`), relecture asynchrone du fichier (`:2433`), exécution (`:2527`) et après la seconde relecture (`:2559`). Sans dérogation : la dérogation de course (`travelReady`) vient après et ne le contourne pas. | Constat 1 et décision de l'orchestrateur : `ETOUCH_START_NOT_HOMED` et D2 (`:1047`, `:1051`) ne voient que l'état **actuel** ; un zéro effacé mais cohérent avec WCO les passe. |
| D2 | **Tout incident remet les trois axes à « à confirmer ».** Incident : bannière (`r.reset`), `ALARM:n` (`r.alarmed`), état `Alarm` d'une machine référencée (`r.status`). Une **connexion neuve** (nouvel enregistrement) ou un **redémarrage de CNCjs** part de « non comparé » sur les trois axes. | Règle simple de l'orchestrateur ; constats 2, 3, 5 (reconnexion), et « l'absence d'historique ne devient pas une autorisation ». |
| D3 | Un axe redevient **confirmé** par un seul de ces deux chemins : (a) **refait par la tablette** : un `G10 L20` envoyé par le serveur (origine posée, `motion.js:173` ; palpage bloc, `block-probe.js:1020` ; plaque Z, `plate-probe.js:411` ; et les palpages de P1 / P3 à la réunion) acquitté `ok`, puis une preuve D2 postérieure, même repère ; (b) **validé** (D8). Rien d'autre : une modification quelconque (PC, programme, Wi-Fi) n'est jamais promue. | Constat 2 : D2 ne prouve ni l'intention ni la réparation. Refaire aux mêmes valeurs aboutit (chemin a, sans condition de différence). |
| D4 | Le **zéro de référence** est, axe par axe, la **dernière valeur acceptée** (refaite ou validée), jamais celle d'un premier incident. Chaque incident et chaque prise d'origine relèvent le **seuil de preuve** : une preuve antérieure ne compte jamais. | Constats 3 et 4. |
| D5 | Après une **alarme critique** (`ALARM:1` / `ALARM:2`) sans bannière depuis : prise d'origine et déverrouillage refusés (`ETOUCH_HOME_RESET_REQUIRED`), **y compris après fermeture et réouverture du port** (interdiction gardée par port, jamais une permission). Levée seulement par une bannière vue sur ce port. P4 n'envoie aucun reset. | v2 D3 + constat 5. |
| D6 | La boîte de la prise d'origine demande le retrait de la pince de sonde, de la plaque et de son fil (texte et case), pour toutes les prises d'origine. | v2 D4, jugé correct par la relecture 2. |
| D7 | Textes : « La machine a redémarré : position perdue. » (le glossaire réserve « carte » à Détails). Les codes de refus existants ne changent pas ; la page les présente par la famille `position-perdue` quand `referenceLost` n'est pas nul. Aucun `$X`, `$H` ni reset automatique. | v2 D5-D7. |
| D8 | **Geste de validation** « Valider le zéro pièce… » : offert **seulement** si la machine est référencée, D2 prouvé après la dernière prise d'origine et le dernier incident, et si **chaque axe à confirmer est identique** (même repère, mêmes unités, écart ≤ tolérance D2) à sa référence. Trois touchers (ouvrir, cocher, engager), ticket lié à la preuve. Aucune commande envoyée. « Différent » ou « non comparé » : pas de validation, l'axe se refait. | Décision de l'orchestrateur (« le valider explicitement après l'avoir vérifié ») ; Z ne peut pas être vérifié sans mouvement nouveau, donc l'opérateur ne valide que ce que le serveur a comparé. |

## 1. Ce qui existe (lu dans le code)

- `referenceLost` : `'restart'` à toute bannière (`r.reset`, `job-service.js:532`), `'alarm'` à `ALARM:n` (`:505`) ou à un état `Alarm` d'une machine référencée (`:447`) ; effacé par une prise d'origine finie (`:427`, `:459`).
- Fin de prise d'origine : `homed = true` et `r.offset.invalidate('homing')` (`:438`, `:460`) ; deux chemins : notre `$H`, et un cycle `Home → Idle` vu (PC compris).
- D2 (`work-offset.js`) : la preuve compare `$#[actif] + G92 (+ TLO)` au `WCO` (`:275-289`) ; `invalidate` efface `stored` et `reported` (`:153`) ; `proof()` vaut `null` hors preuve (`:431`), le compteur `s.proofs` (`:135`) n'est pas exposé ; la tolérance dépend des unités des rapports (`TOLERANCE`, `:29`, `:109`). D2 tourne en `Idle` **sans exiger `homed`** (`offsetMode`, `job-service.js:949-960`) : une preuve peut tomber après `$X`, avant `$H`.
- Départ : `readyFor` (`:995`) appelle `referenced` puis `offsetReady` pour tout départ (`:1047-1051`), à la préparation, après la relecture du fichier, à l'exécution et après la seconde relecture (`:2422`, `:2433`, `:2527`, `:2559`). Une reprise à une ligne est un départ (`j.resume`, `:1014`). La reprise d'une pause est déjà refusée après un redémarrage (`j.boardRestarted`, `:1068`).
- Façade des sockets CNCjs (`touch/index.js:157-193`, `socketRefusal` `job-service.js:2942`) : elle ne refuse un `gcode:start` du PC que pendant une séquence du serveur, ni référence ni D2 aujourd'hui.
- Fermeture du port : `remove` supprime l'enregistrement (`:770`).
- Pertes de flux / de main : `closeTransport` (`:2894`) révoque les confirmations ; la libération laisse finir une prise d'origine en cours (`SURETE.md:294`).
- Page : `seance.js:104-105` sait déjà qu'un zéro « d'une séance précédente » n'est pas posé (`zeroDone` exige une trace `lastOrigin`, `blockProbe` écrit ou `zeroZ`), mais sans axe ni garde serveur ; `seance.js:24` écrit « gardé, vérifié » dès incident + preuve.
- Simulateur : après redémarrage, profil LUNYEE en `Alarm` (`$22=1`, `grbl-simulator.js:2526`), tout G-code refusé `error:8` (`:1025`).

## 2. Parcours de l'opérateur

### A. Redémarrage de la carte, connexion gardée (cas du 18 novembre)

**A0 — L'incident.** Arrêter en usinage → bannière. Les trois axes passent « à confirmer » (D2). Bandeau « Origine à reprendre » ; `#t-recover` mène à ①.

**A1 — ① Machine, encart (`#machine-incident`)** :
1. « La machine a redémarré : position perdue. » ou « Alarme N : position perdue. »
2. « Perdu : la position, et l'usinage arrêté à la ligne 1 234. » (sans ligne : « Perdu : la position de la machine. »)
3. « Gardé : le fichier chargé. »
4. Ligne zéro (§ 4.3), une seule phrase :
   - en attente : « Zéro pièce : à comparer après la prise d'origine. »
   - identique : « Zéro pièce : identique au dernier zéro accepté. Validez-le ou refaites-le. » [Valider le zéro pièce…] [Refaire le zéro pièce]
   - différent : « Zéro pièce : différent en X, Y. Refaites ces axes. » [Refaire le zéro pièce]
   - non comparé : « Zéro pièce : aucun zéro accepté à comparer. Refaites-le. » [Refaire le zéro pièce]
   - confirmé : « Zéro pièce : confirmé. »
   - D2 en échec : phrases actuelles, inchangées.
   [Détails] : code, repère, valeurs de référence et valeurs relues par axe.

**A2 — Boîte de la prise d'origine** (existante, D6) : « La prise d'origine déplace chaque axe jusqu'à ses capteurs. Retirez la pince de la sonde de la fraise, la plaque et son fil du trajet, et dégagez la zone de travail. » ; case : « Je suis devant la machine, la pince de la sonde est retirée de la fraise, la plaque et son fil sont hors du trajet, la zone est dégagée. »

**A3 — Prise d'origine en cours** : rayée « Prise d'origine en cours. » ; Arrêter dans le bandeau (reset existant).

**A4 — Comparaison (automatique)** : D2 se fait comme aujourd'hui ; à la première preuve **postérieure à la prise d'origine** (§ 4.2), chaque axe prend son état.

**A5 — Valider (D8)**, si « identique » : boîte « Valider le zéro pièce » :
- texte : « La machine applique le même zéro pièce qu'avant l'arrêt : G54 X 50,000 Y 100,000 Z −105,000. Il n'est juste que si la pièce et la fraise n'ont pas bougé. Pour voir X et Y : Contrôle → Cadrage à vide. Z n'est pas montré : en cas de doute, refaites Z avec la plaque. » ;
- case : « La pièce n'a pas bougé depuis l'arrêt et la fraise n'a pas été changée. » ;
- trois touchers ; rien n'est envoyé à la machine.

**A6 — Suite** : zéro confirmé → [Reprendre à la ligne N…] (volet existant) si l'usinage a été arrêté, sinon la suite ordinaire. Tant qu'il ne l'est pas, Démarrer et la reprise à une ligne sont **refusés par le serveur** (`ETOUCH_START_ZERO_UNCONFIRMED`) ; la page montre le refus avec son remède ([Valider le zéro pièce…] ou [Refaire le zéro pièce]).

### B. Alarme critique sans bannière

**B1** — `ALARM:1` ou `ALARM:2`, aucune bannière depuis (`resetRequired`). Encart : « Alarme N : la machine attend une réinitialisation. » ; « Perdu : la position de la machine. » ; action rayée : « Réinitialisez la machine : bouton Reset de CNCjs sur le PC. » [Détails]. [Prise d'origine machine…] et [Déverrouiller] rayés (`ETOUCH_HOME_RESET_REQUIRED`).
**B2** — La bannière arrive sur ce port (reset du PC, ou redémarrage spontané H2) : interdiction levée, parcours A.
**B3 — Port fermé puis rouvert sans bannière** (constat 5) : l'interdiction est **gardée** (D5, § 4.4) : la carte peut rester dans sa boucle critique. Remède inchangé : Reset de CNCjs sur le PC, qui passe par ce même port et produit la bannière. Une carte éteinte et rallumée hors connexion n'envoie sa bannière à personne (L14) : l'interdiction reste, le même Reset du PC la lève (prudent, un geste de plus).

### C. Connexion neuve (port fermé puis rouvert, CNCjs redémarré)

Nouvel enregistrement : `homed` faux, rien d'autre hérité qu'une interdiction critique (B3). Les trois axes sont « non comparé » : après la prise d'origine, **le zéro est à refaire** avant tout départ de la tablette. Aucune promesse de reprise : la ligne d'arrêt n'est plus connue.

### Ailleurs (②–⑤, volets, carte Sonde)

Quand `referenceLost` n'est pas nul, les refus `origine-a-prendre`, `alarme`, un pas `error:15` et `ETOUCH_FRAME_RESTART` s'affichent « La machine a redémarré : position perdue. » + [Remise en route] (va à ①), code d'origine dans Détails. `ETOUCH_START_ZERO_UNCONFIRMED` a sa propre famille `zero-a-confirmer` (§ 5).

## 3. Commandes envoyées

**Aucune émission ajoutée.** P4 n'ajoute rien aux listes blanches et n'envoie rien de lui-même ; la validation n'envoie rien.

| Geste | Commande | Par quoi | Changement P4 |
|---|---|---|---|
| Prise d'origine | `$H` | ticket `home` existant | texte et case (D6) ; refus `ETOUCH_HOME_RESET_REQUIRED` (D5) |
| Vérification du zéro | `$#`, puis si besoin un autre repère puis **le repère initial** (sélection sans mot d'axe), `$G` | D2 existant, au repos | aucune ; P4 lit le résultat |
| Zéro refait | `G10 L20 P<n> …` | origine, palpage bloc, plaque Z existants | aucune ; P4 note les axes acquittés `ok` |
| Arrêter (usinage, `$H`) | feed hold puis reset, `0x18` | existant (`halt.js`) | aucun |

Jamais envoyé par P4 : `$J=`, `G0`, `G1`, `G53`, `G38`, `G10`, `M3`, `M5`, `S`, `$X`, `0x18`, `0x85`.

## 4. État serveur ajouté

### 4.1 `work-offset.js`

Accesseur `lastProven()` : copie de la dernière preuve, que l'invalidation n'efface pas : `{ proof: s.proofs, wcs, units, stored: {x, y, z} }` (`stored` = `$# + G92 + TLO`, valeurs **brutes**, non arrondies, en unités des rapports). Accesseur `proofs()` : le compteur, toujours numérique. Rien d'autre ne change dans D2.

### 4.2 `r.zero` (`job-service.js`, un par enregistrement)

`{ ref: {x, y, z}, refWcs, refUnits, ok: {x, y, z}, floor, written }`
- `ref[a]` : dernière valeur acceptée de l'axe, ou `null` (non comparé). `ok[a]` : axe confirmé.
- `floor` : seuil de preuve ; seule une preuve de numéro `> floor` compte.
- `written` : `null` ou `{ axes, wcs, after }`, un `G10 L20` de la tablette acquitté `ok`, en attente de sa preuve.

Règles (toutes au même endroit, appelées avant toute notification `changed()`) :
1. **Création** : `ref` nuls, `ok` faux, `floor = proofs()`.
2. **Incident** (`r.reset`, `r.alarmed`, branche `Alarm` de `r.status`) : `ok` tous faux, `written = null`, `floor = proofs()`. `ref` est gardé (D4).
3. **Fin de prise d'origine réussie** (`:438`, `:460`) : `floor = proofs()` (l'invalidation `'homing'` existe déjà).
4. **Zéro écrit par la tablette** (`ok` reçu pour le `G10 L20`) : `written = { axes, wcs: repère actif, after: proofs() }`. Un `G10` « peut-être écrit » (délai, erreur) ne marque rien.
5. **À chaque preuve D2** `p = lastProven()`, si `homed` et `p.proof > floor` :
   - si `written` et `p.proof > written.after` et `p.wcs === written.wcs` : pour chaque axe écrit, `ref[a] = p.stored[a]`, `ok[a] = true` ; `written = null` ;
   - si `p.wcs !== refWcs` ou `p.units !== refUnits` : tout axe non écrit à l'instant passe `ref[a] = null`, `ok[a] = false` ; `refWcs`, `refUnits` prennent ceux de `p` ;
   - tout axe `ok` dont `|p.stored[a] − ref[a]| >` tolérance D2 : `ok[a] = false` (changé par le PC, un programme, le Wi-Fi : jamais promu).
6. **Validation** (D8) : voir § 4.3.

**Zéro confirmé** (garde D1) : profil CNC ; `homed` ; D2 prouvé maintenant (`proof() !== null`) avec `proof() > floor` ; même repère et mêmes unités que la référence ; pour chaque axe, `ok[a]` et `|stored[a] − ref[a]| ≤` tolérance. Sinon refus `ETOUCH_START_ZERO_UNCONFIRMED` (409), paramètres : axes en cause et leur état. Profil laser : garde non appliqué (inchangé, hors lot).

### 4.3 États par axe et validation

État affiché d'un axe : `confirmé` (`ok`) ; sinon `en attente` (pas `homed`, ou pas de preuve `> floor`) ; `non comparé` (`ref[a]` nul, ou repère / unités différents) ; `identique` (écart ≤ tolérance) ; `différent`. État global = le pire (ordre : différent, non comparé, en attente, identique, confirmé).

Validation : opération `zero-confirm`, ticket comme les autres (`nonce`, `transportId`, expiration, révoqué par `closeTransport`), qui porte `{ proof, startups, wcs, values }`. Préparation et exécution exigent : main, repos, `homed`, `proof() === ticket.proof`, `startups` inchangé, aucun axe non confirmé `différent` ou `non comparé` ou `en attente`. Effet : `ok` tous vrais, `ref = stored` de cette preuve. Aucune ligne envoyée.

### 4.4 Alarme critique

`r.resetRequired` : vrai dans `r.alarmed` pour le code 1 ou 2 ; faux à la bannière (`r.reset`). Copié dans une table **par port** du service (`criticalAlarms`, hors des enregistrements) : à la création d'un enregistrement, `resetRequired` en hérite ; une bannière sur ce port l'efface. Seule une interdiction est héritée. Garde en premier dans `homeReady` et `unlockReady` : `ETOUCH_HOME_RESET_REQUIRED`. Perdu si CNCjs redémarre (limite § 11).

### 4.5 `r.recovery` (carte seulement)

`null` ou `{ cause, at }`, ouverte à un incident si la machine était référencée ou un usinage commencé ; `cause` passe à `'restart'` sur bannière, jamais l'inverse ; gardée par la prise d'origine ; fermée par le départ d'un usinage et la fermeture du port. Elle ne donne **aucune** permission : le zéro suit § 4.2.

### 4.6 Instantané

`zero: { state, axes: { x: {state, ref, now}, … }, wcs, canConfirm }` (valeurs `fmt3`), `recovery`, `resetRequired`. La signature de changement (`job-service.js:2840`) inclut `zero.state`, les états d'axe et `resetRequired`. `refusals.start` porte le nouveau code via le chemin existant (`:1625`).

## 5. Présentation des refus (page)

- `refus.js` `lire(error, machine)` (second argument facultatif) : `referenceLost` non nul → famille `position-perdue` pour `origine-a-prendre`, `alarme`, `error:15` d'un pas, `ETOUCH_FRAME_RESTART`.
- `ETOUCH_START_ZERO_UNCONFIRMED` → famille `zero-a-confirmer` : phrase serveur (« Zéro pièce à confirmer en X, Y : refaites-le ou validez-le. »), remèdes `valider-zero` (actif seulement si `zero.canConfirm`) et `refaire-zero`.
- `ETOUCH_HOME_RESET_REQUIRED` → famille `reinitialisation`, prioritaire.
- `seance.js` : la ligne zéro suit `zero.state`, plus jamais « gardé, vérifié » sur la seule preuve D2 ; `zeroDone` devient `zero.state === 'confirmé'` (la règle « ancien zéro » de la page passe au serveur, par axe).
- Phrases FR dans la table serveur, EN/ES dans `i18n-messages-machine.js`, en fin de table.

## 6. Cas d'échec

| Cas | Ce qui se passe | Après |
|---|---|---|
| `$#` effacé au redémarrage, cohérent avec WCO | D2 prouve ; les trois axes `différent` ; départ refusé. | Refaire X, Y, Z. |
| Effacé, puis Z seul refait (constat 2) | Z confirmé ; X, Y `différent` ; validation non offerte ; départ refusé. | Refaire X, Y. |
| Zéro refait aux mêmes valeurs | Confirmé par le chemin (a), sans condition de différence. | Départ possible. |
| Second incident après une réparation C (constat 3) | `ref = C` ; `A` relu → `différent`. | Refaire. |
| Preuve après `$X`, avant `$H` (constat 4) | `homed` faux : ne compte pas ; la fin de prise d'origine relève `floor`. | Preuve suivante. |
| Changement d'unités (`$13`) | `non comparé`. | Refaire. |
| Repère actif changé (G55 avant, G54 après) | `non comparé` sur les axes non écrits. | Refaire. |
| G92 perdu, `G10` d'un programme, zéro posé du PC, Wi-Fi | Valeur relue ≠ `ref` : `différent`, jamais promu. | Refaire sur la tablette (ou démarrer depuis le PC, § 11). |
| Incident pendant la relecture asynchrone du fichier | `readyFor` après la relecture refuse ; rien n'est envoyé. | — |
| Ancien ticket de départ | `readyFor` à l'exécution refuse. | — |
| Connexion neuve, CNCjs redémarré | `non comparé` ; départ refusé. | Refaire le zéro. |
| Alarme critique, port rouvert sans bannière (constat 5) | Interdiction gardée ; `$H`/`$X` refusés sans octet écrit. | Reset du PC. |
| Flux perdu, rotation, main rendue **avant** l'envoi de `$H` (constat 7) | Confirmation révoquée (`closeTransport`) ; aucun `$H`. | Refaire la boîte. |
| Même chose **après** l'envoi | Le cycle de la carte continue (existant) ; aucun mouvement de suite, aucune validation, aucune reprise ; le zéro reste à confirmer. | Comme A4. |
| Arrêter, `ALARM:6-9` ou nouvelle bannière pendant `$H` | `homed` reste faux ; incident (règle 2) ; rien n'est confirmé. | Refaire la prise d'origine. |
| Pince de sonde restée sur la fraise | Demandée par la boîte (D6), jamais constatée. | Essai P4-B2. |

## 7. Faits de la carte utilisés (`design/refonte/FIRMWARE.md`)

| Fait | Où il sert | Degré de preuve |
|---|---|---|
| E3 : après un Arrêter en usinage ou `ALARM:2`, MPos 0, non référencée | détection, carte « a redémarré » | observé ; mécanisme inconnu (H1-H3) |
| § 3.a pts 3-4, R4 : après `ALARM:1/2`, boucle vide jusqu'à un reset envoyé après l'alarme ; `?` répond | parcours B, D5 | amont seulement |
| E4 / R6 : `WCO:0,0,0` après `$H`, `$#` garde G54 ; D2 recharge | comparaison | observé + amont |
| `$#` conservé à travers un redémarrage | « identique » | amont seulement ; la comparaison le constate |
| L14 : pas de bannière à l'ouverture du port | parcours C, B3 | simulateur, d'après le terrain |
| R12 / E6 : Wi-Fi ouvert, un autre client peut écrire | `différent`, jamais promu | observé ; aucune exclusivité |

Aucune hypothèse nouvelle sur le zéro machine, `$27`, `$HX` ou `$39`.

## 8. Fichiers touchés

Serveur : `work-offset.js` (`lastProven`, `proofs`) ; `job-service.js` (fichier partagé, groupé en fin de section : `r.zero`, garde D1 dans `readyFor`, opération `zero-confirm`, `criticalAlarms`, `resetRequired`, `r.recovery`, instantané, signature) ; `motion.js`, `block-probe.js`, `plate-probe.js` (un appel « axes écrits » à l'`ok` du `G10`, une ligne chacun) ; table des phrases serveur ; catalogue des codes.

Page : `seance.js`, `refus.js`, `grbl-help.js`, `job-controls.js` (boîtes `home` et `zero-confirm`), `job-resume.js`, `i18n-messages*.js`, `verify-project.cjs`, `browser-run.cjs`.

Documents : `SURETE.md` § P4, `PROTOCOLE-ESSAI.md` § P4, `IDEES.md` (retour au zéro), `P4-COMPTE-RENDU.md`.

**Coût pour la réunion** : les tests de départ existants supposent qu'un zéro prouvé suffit ; ils devront confirmer le zéro par le chemin réel (origine X0 Y0 Z0 posée par la tablette après la prise d'origine), dans une aide de banc commune. P1 et P3 doivent appeler « axes écrits » à leur propre `G10 L20`.

## 9. Tests exigés

Chaque test nomme l'assertion nouvelle et la régression qu'il attrape ; les témoins (verts sans le code) sont marqués et ne prouvent pas le code.

Serveur, faux contrôleur — `__tests__/recovery.test.js` :
1. **Garde de départ (constat 1).** Zéro prouvé mais non confirmé : `prepare start` refusé `ETOUCH_START_ZERO_UNCONFIRMED`, et par l'API directe sans ticket, avec un ancien ticket, pour une reprise chargée depuis une ligne, après rechargement du fichier, après reconnexion ; incident pendant `sameFileAsLoaded` (préparation et exécution) → refus. Assertion : aucun `gcode:start`, aucune ligne. Dérogation de course demandée : même refus. Régression : départ sur un zéro effacé.
2. **Confirmation par la tablette (constat 2).** Effacement XYZ puis Z seul refait → X, Y `différent`, départ refusé ; réparation complète → confirmé ; réparation aux mêmes valeurs → confirmé ; `G10` « peut-être écrit » → rien marqué ; changement extérieur G54 → G55 (socket) → `non comparé`, jamais confirmé. Remplace l'assertion v2 « nouvelle preuve différente → `redone` ».
3. **Validation (D8).** Identique → `canConfirm`, validation → confirmé, aucune ligne ; différent, non comparé, en attente → refusée ; ticket dont la preuve a changé, ou après une bannière → refusé.
4. **Référence la plus récente (constat 3).** `A → incident → B → C refait → incident → A` : jamais `identique`, état `différent`.
5. **Seuil de preuve (constat 4).** Preuve après `$X` avant `$H` → `en attente` ; Arrêter → invalidation → bannière → la preuve d'avant ne compte pas ; incidents successifs ; changement d'unités ; écarts à 0,9 et 1,1 fois la tolérance, valeurs brutes.
6. **Alarme critique (constat 5).** `ALARM:2` sans bannière : `canHome`, `canUnlock` faux, `home` refusé sans octet ; port fermé puis rouvert **sans répéter `ALARM:n`** → toujours refusé ; témoin : bannière sur ce port → levé.
7. **Prise d'origine et flux (constat 7).** Fermeture réelle du flux, rotation, libération et prise de main **avant** l'envoi → aucun `$H` ; **après** l'envoi → le cycle finit, zéro toujours à confirmer, rien d'autre envoyé ; Arrêter, `ALARM:6-9` et bannière pendant `$H` → incident gardé, rien confirmé.
8. **Indépendance de l'invalidation.** `invalidate('stop')` puis `('restart')` ne changent pas `lastProven()`.
9. *Témoin* : ouverture, comparaison, validation, fermeture n'ajoutent aucune écriture hors D2 (les lignes de D2 sont filtrées).

Simulateur, **profil LUNYEE**, `G21` fixé — `__tests__/recovery-lunyee.test.js` :
- S1. Prise d'origine, `G10 L2 P1 X50 Y100 Z-105`, `$#` relu ; origine posée par la tablette (confirmée) ; usinage, Arrêter en mouvement → bannière ; départ refusé (`ETOUCH_START_ZERO_UNCONFIRMED`) ; prise d'origine ; D2 dans les deux hypothèses `executedAfterHoming` ; `identique` ; validation ; départ accepté ; `stoppedAtLine` conservé.
- S2. Même chose, mais la **fixture** efface les décalages du simulateur au redémarrage (paramètres remis à 0, injection explicite du banc, aucune ligne et aucun `$X` dans le produit) ; `$#` relu à 0 ; D2 prouvé ; `différent` ; validation refusée.
- S3. `ALARM:2` provoquée (profil L7) : `resetRequired` vrai puis faux à la bannière ; témoin H2.

Page (`examples/cncjs-touch/test-remise-en-route-p4.cjs`, enregistré dans `verify-project.cjs`) :
- P1. `position-perdue` pour les six codes (rouge aujourd'hui) ; témoin `referenceLost` nul.
- P2. Ligne zéro par état ; incident + D2 prouvé sans `zero.state === 'confirmé'` → jamais « gardé » (rouge aujourd'hui, `seance.js:24`).
- P3. `ETOUCH_START_ZERO_UNCONFIRMED` → famille `zero-a-confirmer`, `valider-zero` rayé sans `canConfirm`.
- P4. Boîte `home` : pince, plaque et fil nommés (texte et case) ; boîte `zero-confirm` : valeurs, Z non montré, un seul envoi après trois touchers.
- P5. Parcours B, y compris après reconnexion.
- P6. *Témoins* : `test-refus-table.cjs`, `test-i18n.cjs`, `test-textes-regles.cjs`.
- Navigateur si disponible : `browser-run.cjs --strict --only <étape remise en route>`.

Avant de rendre : `node examples/cncjs-touch/verify-project.cjs`, `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false`, ESLint sur les fichiers touchés.

## 10. Essai réel (à ajouter à `PROTOCOLE-ESSAI.md` § P4)

Seul `$H` (existant) bouge la machine, plus le cadrage F1 s'il a déjà été essayé. **Broche débranchée, pas de fraise, table vide** jusqu'à P4-D. CNCjs classique ouvert sur le PC en observateur. Main sur l'arrêt physique pendant chaque prise d'origine.

| Étape | Manipulation | Attendu / relevé |
|---|---|---|
| P4-A1 | Référencée, origine posée par la tablette (X 200, Y 200, Z en l'air), confirmée. **Au repos**, Reset de CNCjs sur le PC. | Bannière ou non ; messages de démarrage complets ou non (H1). Si bannière : encart, « à comparer après la prise d'origine ». |
| P4-A2 | Toucher Démarrer, un zéro, un pas +Z. | « position perdue » + [Remise en route] ; code d'origine dans Détails. |
| P4-B1 | [Prise d'origine machine…] : lire la boîte. | Pince, plaque et fil nommés. |
| P4-B2 | Pince posée à vide, câble libre : la retirer, cocher, engager. | Prise d'origine faite ; aucun câble tiré. |
| P4-B3 | Attendre D2 ; toucher Démarrer **avant** de valider. | Refus « Zéro pièce à confirmer » ; noter « identique » ou « différent » (fait « `$#` après redémarrage »). |
| P4-B4 | Si identique : Cadrage à vide (F1), puis [Valider le zéro pièce…]. | Fraise au-dessus du coin attendu ; validation ; Démarrer accepté (ne pas lancer). |
| P4-C1 | Débrancher puis rebrancher l'USB, reconnecter, prise d'origine. | « aucun zéro accepté à comparer » ; Démarrer refusé jusqu'à l'origine reposée par la tablette. |
| P4-D1 | Planche bridée, fraise montée, broche **débranchée**, zéro posé ; petit fichier (Z de travail ≥ 5 mm au-dessus) ; Arrêter en plein mouvement. | Si redémarrage : encart, prise d'origine, comparaison, validation ou zéro refait, puis [Reprendre à la ligne N…]. |

Ne pas essayer : `ALARM:1` / `ALARM:2` (tests seulement), `$20=0`, reset en mouvement hors P4-D1, perte de flux pendant `$H` (tests seulement). Relevé : fait / non fait, messages, valeurs, surprises.

## 11. Ce qui reste incertain

- Écart D0 (retour au zéro retiré) : **à confirmer par l'opérateur**.
- **Changement de pratique, à confirmer par l'opérateur** : à chaque nouvelle connexion et chaque matin (CNCjs redémarre avec la tablette), le zéro doit être reposé par la tablette avant de démarrer depuis elle, même si la pièce n'a pas bougé. Un zéro posé depuis le PC n'est pas reconnu par la tablette. Alternative plus tard (hors lot) : garder la référence acceptée sur disque pour permettre la validation après reconnexion.
- **Départ depuis CNCjs sur le PC** : non gardé, comme la référence aujourd'hui (`socketRefusal` ne refuse pas `gcode:start`). Le garder bloquerait le PC sur tout zéro posé hors tablette ; le PC reste la voie d'expert. Le Wi-Fi direct est hors de portée du serveur. Question ouverte pour l'orchestrateur.
- Un programme qui sélectionne un autre repère que l'actif : même limite que D2 (seul le repère actif au départ est prouvé et confirmé).
- `criticalAlarms` et `r.zero` en mémoire seule : CNCjs redémarré perd l'interdiction critique (un `$H` sans réponse finit par le délai existant `HOMING_MAX_MS`) ; le zéro, lui, repart « non comparé » (sens prudent).
- Le parcours B repose sur le code amont ; si la carte répond quand même, le garde refuse une prise d'origine qui aurait marché (sens prudent).
- La validation prouve « même `$# + G92 + TLO` que le dernier zéro accepté », pas « même pièce au même endroit » ; Z n'est vu par aucun cadrage.
- La pince de sonde : demandée, jamais constatée.
- Cause du redémarrage (H1-H3) : P4 traite le résultat, pas la cause.

## 12. Réponse à la première relecture (v1 → v2, résumé)

Dix constats acceptés ; v2 retirait le mouvement de retour et ajoutait la comparaison avant / après, la boîte pince, le parcours alarme critique, la reconnexion sans héritage, des tests corrigés (`G10 L2`). Les états `same` / `redone` / `before` du premier incident, jugés dangereux par la deuxième relecture, sont remplacés en v3 par § 4.2.

## 13. Réponse à la deuxième relecture

Relecture du commit `141ec466`. Constats vérifiés dans le code ; aucun réfuté. Constat 1 et constat 6 suivent les décisions de l'orchestrateur.

| # | Constat | Verdict | Preuve vérifiée | Ce qui change en v3 |
|---|---|---|---|---|
| 1 | danger — départ et reprise possibles avec un zéro différent | **Accepté** (décision de l'orchestrateur) | `readyFor` ne fait que `referenced` + `offsetReady` (`job-service.js:1047-1051`) ; une reprise à une ligne est un départ (`j.resume`) ; la page seule oriente (`seance.js:24`, `job-resume.js:88`). | D1 : `ETOUCH_START_ZERO_UNCONFIRMED` dans `readyFor`, donc aux quatre contrôles (`:2422`, `:2433`, `:2527`, `:2559`), sans dérogation, pour « différent », « non comparé » et « en attente » ; indépendant de `recovery` (connexion neuve et CNCjs redémarré partent de « non comparé »). Remède : refaire, ou valider (D8). Test 1. Départ du PC non couvert, justifié et laissé en question (§ 11). |
| 2 | danger — `redone` acquitte tout après Z seul | **Accepté** | D2 compare `$#` actuel et WCO (`work-offset.js:275-289`), sans notion d'auteur ni d'axe. | `redone` supprimé. Confirmation **par axe**, seulement par un `G10 L20` de la tablette acquitté puis prouvé, ou par la validation d'axes identiques (D3, D8). Mêmes valeurs : confirmé. Changement extérieur : jamais promu. Test 2. |
| 3 | danger — second incident valide un ancien zéro | **Accepté** | v2 § 4 gardait `before` du premier incident. | `ref` = dernière valeur acceptée par axe ; chaque incident relève `floor` et efface `written` (règle 2). Test 4 sur la succession exacte. |
| 4 | à corriger — preuve d'avant la prise d'origine, mauvais accesseur | **Accepté** | `offsetMode` n'exige pas `homed` (`job-service.js:949-960`) ; `proof()` vaut `null` après invalidation (`work-offset.js:431`). | Règle 5 : `homed` et `p.proof > floor`, `floor` relevé à la fin de prise d'origine ; accesseurs `proofs()` et `lastProven().proof` ; valeurs brutes, unités des rapports, tolérance D2 ; mise à jour avant `changed()`. Test 5. |
| 5 | à corriger — reconnexion oublie l'alarme critique | **Accepté** | `remove` supprime l'enregistrement (`:770`) ; boucle critique jusqu'à un reset après l'alarme (`FIRMWARE.md` § 3.a pt 3). | D5, § 4.4 : interdiction gardée **par port**, levée par une bannière sur ce port ; jamais de permission héritée, aucun reset automatique. Parcours B3, test 6 (sans répéter `ALARM:n`, témoin après bannière). |
| 6 | à corriger — retrait du retour hors périmètre | **Maintenu par l'orchestrateur** | Le prompt § 2 P4 le demande ; F1 dépend d'un fichier et revient à son départ (`job-service.js:2098`) : il ne le remplace pas, c'est exact. | D0 réécrit en **écart assumé, à confirmer par l'opérateur** ; plus de prétention d'équivalence avec F1 (aide visuelle X/Y seulement) ; « Z déjà haut, bornes, position initiale » notés comme **non validés** dans `IDEES.md`. |
| 7 | à corriger — flux et main pendant `$H` sans contrat | **Accepté** | `closeTransport` révoque les tickets (`:2894`) ; la libération laisse finir une prise d'origine (`SURETE.md:294`). | § 6 : avant envoi, aucun `$H` ; après envoi, le cycle continue, aucune suite, aucune validation, zéro à confirmer. Test 7 ; essai : non provoqué sur la machine. |
| 8 | à corriger — S2 faux | **Accepté** | Simulateur en `Alarm` après redémarrage, G-code refusé `error:8` (`grbl-simulator.js:1025`, `:2526`). | S2 : effacement injecté par la fixture au redémarrage, relu par `$#` ; `G21` fixé ; aucun `$X` dans le produit. |
| 9 | remarque — test 7 témoin, scénarios manquants | **Accepté** | — | Ancien test 7 classé témoin (test 9), écritures D2 filtrées ; scénarios des constats 1-5 et 7 ajoutés (tests 1-7). Les fichiers de tests n'existent pas encore : conception seule. |
| 10 | remarque — commandes | **Accepté** | D2 restaure le repère initial ; Arrêter garde son reset. | § 3 : « aucune émission ajoutée », D2 décrit comme « un autre repère puis le repère initial ». |
