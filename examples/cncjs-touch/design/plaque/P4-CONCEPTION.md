# P4 — Remise en route après un Arrêter (référence perdue) : conception

Lot P4 de `design/PROMPT-PLAQUE-XYZ.md`, 2026-11-21, arbre `cncjs-wt/P4` (branche `feat/P4`, base `caf09b31`). Conception seule : aucun code écrit, rien lancé, aucun accès à la tablette ni à la CNC.

**Version 2**, après la contre-relecture d'Astra ultra (verdict « à revoir » : 2 dangers, 6 « à corriger »). Chaque constat a été vérifié dans le code ; la réponse est à la fin (§ 12). Changement principal : **le mouvement « Aller au-dessus du zéro pièce » est retiré du lot**. P4 n'envoie plus aucune commande de mouvement nouvelle : il reste la carte claire « position perdue », la redirection des refus, la prise d'origine existante, et une comparaison honnête du zéro pièce avant / après l'incident. À relire de nouveau par Astra avant tout code (règle commune 1).

## 0. Décisions

| # | Décision | Raison |
|---|---|---|
| D0 | **Pas de mouvement « Aller au-dessus du zéro pièce » dans P4.** Il est mis de côté dans `IDEES.md` (idée à reprendre après l'essai F1 qui relève `$J=G90` en coordonnées pièce et `0x85` sur la LUNYEE). Écart voulu avec le prompt § 2 (« puis (sur confirmation) montée en Z haut et retour… ») : à confirmer par l'opérateur. | La relecture a montré que la moitié des constats (1 en partie, 2 en partie, 3, 6, 7b, 8 pour `purpose:'zero'`, 9) tenaient à ce mouvement, et que son but sûr, « voir où est le zéro », est déjà rempli par le **cadrage à vide F1** (déjà relu trois fois, ses propres gardes) une fois le zéro pièce retrouvé. Un lot plus petit, sans mouvement nouveau, est plus sûr. |
| D1 | Le serveur garde une **remise en route ouverte** (`r.recovery`) qui survit à la prise d'origine, et qui porte **le zéro pièce prouvé avant l'incident** (`before`). Elle n'est ouverte que si la machine avait une référence (référencée, ou usinage commencé) au moment de la perte. | Sans elle, la prise d'origine efface `referenceLost` et `lastAlarm` (`job-service.js:425-427`, `:457-459`) et l'écran ne peut plus rien dire du zéro. |
| D2 | « Zéro pièce : gardé, vérifié » n'est écrit que si le zéro prouvé **après** (D2, `work-offset.js`) est **identique** (repère et décalage effectif `$# + G92 + TLO`, à la tolérance de D2) au dernier zéro prouvé **avant** l'incident. Absent ou différent : « non comparé » ou « différent d'avant l'arrêt : refaites-le ». | D2 seul prouve que la machine applique son `$#` **actuel**, pas que c'est l'ancien (constat 1). La phrase actuelle de `seance.js:24` (« gardé, vérifié » dès qu'il y a incident et preuve) a ce défaut aujourd'hui même : P4 la corrige. |
| D3 | Après une **alarme critique** (`ALARM:1` ou `ALARM:2`) sans bannière depuis, la machine attend une réinitialisation (`FIRMWARE.md` § 3.a, pts 3-4, R4) : la prise d'origine et le déverrouillage sont **refusés** par un nouveau garde `ETOUCH_HOME_RESET_REQUIRED`, et la carte dit quoi faire. P4 n'envoie **aucun** reset. | Constat 4. Un `$H` envoyé à une carte dans cette boucle n'a pas de réponse ; le seul remède est un reset envoyé après l'alarme, qui reste un geste de l'opérateur. |
| D4 | La boîte de la prise d'origine demande **explicitement** le retrait de la pince de sonde de la fraise et de la plaque du trajet (texte et case). Pour toutes les prises d'origine, pas seulement après un incident. | Constat 2 : un Arrêter pendant un palpage (bloc ou plaque) fait feed hold puis reset (`job-service.js:2616-2618`, `:2668-2672`), donc probablement un redémarrage (E3, H1), avec la pince encore sur la fraise. Un `Pn:P` ouvert ne prouve pas que la pince est retirée. |
| D5 | Textes : « La machine a redémarré : position perdue. », pas « La carte… » : le glossaire (`SPEC-REFONTE.md` § 9.3) réserve « carte » à « Détails ». | Écart de mot avec le prompt, voulu. |
| D6 | Les codes de refus existants ne changent pas ; la **page** les présente par une famille unique `position-perdue` quand `referenceLost` n'est pas nul. | Le prompt : « gardent leur code mais renvoient au même remède ». |
| D7 | Aucun `$X`, `$H` ni reset automatique. Une reconnexion (port fermé puis rouvert) **n'hérite de rien** : ni `homed`, ni remise en route, ni permission. | `SPEC-REFONTE.md` § 6.9 ; constat 5. |

## 1. Ce qui existe (lu dans le code)

- `referenceLost` : `'restart'` à toute bannière (`r.reset`, `job-service.js:532`, y compris une bannière à la connexion, `ECARTS-PLAN.md:306`), `'alarm'` à `ALARM:n` (`:504`) ou à un état `Alarm` d'une machine référencée (`:446`) ; effacé par une prise d'origine finie (`:427`, `:459`) ; publié nul quand `homed` (`:1712`).
- La carte LUNYEE n'est **pas** redémarrée par l'ouverture de son port (simulateur L14, `sim-bridge.js:6`) : après une reconnexion sans coupure de courant, pas de bannière, `referenceLost` nul, `homed` faux.
- Fermeture du port : l'enregistrement est **supprimé** (`remove`, `job-service.js:770-772`), avec `lastStop`, `homed`, `referenceLost` et la preuve D2.
- Arrêter pendant un usinage : `halt.js` (feed hold, attente du repos, puis reset) ; le 18 novembre la carte a redémarré (E3) ; le simulateur LUNYEE donne `ALARM:3` puis redémarrage pour un reset en mouvement, retenue comprise (L9). Arrêter pendant un `$H` : reset (`job-service.js:2635-2642`). Pendant un déplacement de la tablette : `0x85` seul (`:2620-2624`). P4 ne change pas Arrêter.
- Alarme critique sans bannière : le témoin `repetition-findings.test.js:247-269` montre qu'ensuite rien sur la tablette ne peut réinitialiser ni déverrouiller ; `homeReady` (`job-service.js:1300-1317`) accepte pourtant l'état `Alarm`, sans regarder le code d'alarme.
- D2 (`work-offset.js`) : la transaction compare `$#[actif] + G92 (+ TLO)` au `WCO` rapporté (`:275-289`), recharge par `G55`/`G54` si besoin ; `invalidate` efface `stored` et `reported` (`:153`) ; un Arrêter invalide déjà la preuve (`job-service.js:710`, `:2663`) avant même la bannière. Rien ne garde le zéro d'avant.
- Page : l'encart ① (`seance.js:178-181`, `grbl-help.js:67-77`) dit déjà « La machine a redémarré. », « Perdu : la position de la machine. », « Gardé : le fichier chargé. » ; la ligne zéro dit « gardé, vérifié » dès qu'il y a incident et preuve (`seance.js:24`). La cause globale `alarme` renvoie déjà à `remise-en-route` (`seance.js:88`) ; ⑤ dit déjà « La machine a perdu sa position. » + [Remise en route →] (`job-resume.js:88`). `refus.js` `lire(error)` ne connaît pas l'état de la machine.
- Boîte de la prise d'origine : « Dégagez la zone de travail. » / « Je suis devant la machine et la zone est dégagée. » (`job-controls.js:197`) : rien sur la pince.

## 2. Parcours de l'opérateur

### A. Redémarrage de la carte, connexion gardée (cas du 18 novembre)

**A0 — L'incident.** Arrêter en usinage → bannière. Bandeau « Alarme » ou « Origine à reprendre » ; `#t-recover` mène à ①.

**A1 — ① Machine, encart (`#machine-incident`), quatre lignes au plus :**
1. « La machine a redémarré : position perdue. » (`recovery.cause === 'restart'`) ou « Alarme N : position perdue. » (`'alarm'`).
2. « Perdu : la position, et l'usinage arrêté à la ligne 1 234. » (sans ligne connue : « Perdu : la position de la machine. »).
3. « Gardé : le fichier chargé. »
4. Ligne zéro, selon `recovery.zero` (§ 4) :
   - `pending` : « Zéro pièce : comparé à celui d'avant après la prise d'origine. »
   - `same` : « Zéro pièce : gardé, identique à celui d'avant l'arrêt. »
   - `changed` : « Zéro pièce : différent de celui d'avant l'arrêt. Refaites-le. » (alerte, bouton [Refaire le zéro pièce])
   - `unknown` : « Zéro pièce : relu dans la machine, sans comparaison possible. Contrôlez-le ou refaites-le. » (alerte)
   - `redone` : « Zéro pièce : refait après l'arrêt, vérifié. »
   - D2 en échec : les phrases actuelles (« à refaire », « la machine ne l'a pas confirmé »…), inchangées.
   [Détails] : code, repère et valeurs avant / après (`before`, `after`), « Le zéro pièce est enregistré dans la machine ; il est relu et comparé à celui d'avant l'arrêt. »

Liste (ordre) : connexion · main · réglages · arrêt · **origine** [Prise d'origine machine…] · zéro · reprise. Barre : « Il manque : l'origine machine. » [Prise d'origine machine…].

**A2 — Boîte de la prise d'origine** (existante, 3 touchers, D4) : « La prise d'origine déplace chaque axe jusqu'à ses capteurs. Retirez la pince de la sonde de la fraise, la plaque et son fil du trajet, et dégagez la zone de travail. » ; case : « Je suis devant la machine, la pince de la sonde est retirée de la fraise et la zone est dégagée. »

**A3 — Prise d'origine en cours** : rayée « Prise d'origine en cours. » ; Arrêter dans le bandeau (reset existant).

**A4 — Vérification et comparaison du zéro (automatiques)** : D2 se fait comme aujourd'hui ; à sa première preuve après l'ouverture, le serveur compare (§ 4) et la ligne zéro prend son état.

**A5 — Suite** :
- `same` ou `redone` : action principale [Reprendre à la ligne N…] (volet § 5.12 existant) si l'usinage a été arrêté, sinon « Suite : … → ». Ligne d'aide : « Pour voir où est le zéro avant de reprendre : Contrôle → Cadrage à vide. » (F1 existant, aucun mouvement nouveau ; non vérifié : que le cadrage soit offert sur un fichier arrêté sans rechargement, `seance.js:121` demande « Rechargez le fichier » après un arrêt — à constater au test de page, sinon la ligne d'aide dit de recharger d'abord).
- `changed` ou `unknown` : action principale [Refaire le zéro pièce] (va à ③) ; la reprise n'est **pas** l'action principale de ① ni de ⑤ tant que l'état n'est pas `same` ou `redone`. Elle reste accessible par le volet de ⑤ avec ses gardes actuels (pilotage de page seulement : voir § 11, question de garde serveur).

### B. Alarme critique sans bannière

**B1** — `ALARM:1` ou `ALARM:2`, aucune bannière depuis (`r.resetRequired`, § 4). Encart : « Alarme N : la machine attend une réinitialisation. » ; « Perdu : la position de la machine. » ; action (rayée, pas de commande) : « Réinitialisez la machine : bouton Reset de CNCjs sur le PC, ou éteignez-la puis rallumez-la. » [Détails] (code, « Reset to continue », lien vers l'aide Alarme). [Prise d'origine machine…] et [Déverrouiller] rayés avec cette phrase (`ETOUCH_HOME_RESET_REQUIRED`).
**B2** — La bannière arrive (reset envoyé du PC, ou redémarrage spontané H2) : `resetRequired` faux, `referenceLost = 'restart'`, on passe au parcours A. Une mise hors tension avec perte du port : parcours C.

### C. Reconnexion (port fermé puis rouvert, ou machine éteinte)

Nouvel enregistrement, rien d'hérité (D7) : `homed` faux, `recovery` nulle, `lastStop` perdu. Sans bannière (cas LUNYEE, L14) : la séance ordinaire « Origine machine à prendre ». Avec bannière : `referenceLost = 'restart'`, l'encart dit « La machine a redémarré : position perdue. » mais la ligne zéro est « relu dans la machine, sans comparaison possible » (`unknown` sans `recovery`). Aucune promesse de reprise : la ligne d'arrêt n'est plus connue du serveur.

### Ailleurs (②–⑤, volets, carte Sonde)

Tout refus des familles `origine-a-prendre` ou `alarme`, un pas refusé `error:15`, et `ETOUCH_FRAME_RESTART`, s'affichent quand `referenceLost` n'est pas nul : « La machine a redémarré : position perdue. » (ou « Après l'alarme, la machine a perdu sa position. ») + [Remise en route] (va à ①). Le code d'origine reste dans Détails. Sans `referenceLost`, rien ne change.

## 3. Commandes envoyées

**Aucune commande nouvelle.** P4 n'ajoute rien aux listes blanches et n'envoie rien de lui-même.

| Geste | Commande | Par quoi | Changement P4 |
|---|---|---|---|
| Prise d'origine | `$H` (commande `homing`) | ticket `home` existant, 3 touchers | texte et case de la boîte (D4) ; nouveau refus `ETOUCH_HOME_RESET_REQUIRED` (D3) |
| Vérification du zéro | `$#`, puis si besoin `G55`/`G54` (`G54`/`G55`), `$G` | D2 existant, au repos | aucune ; la comparaison avant / après est faite côté serveur, sans ligne |
| Arrêter pendant `$H` | reset (`0x18`) | existant | aucun |

Jamais envoyé par P4 : `$J=`, `G0`, `G1`, `G53`, `G38`, `G10`, `M3`, `M5`, `S`, `$X`, `0x18`, `0x85`.

## 4. État serveur ajouté

**`work-offset.js`** : une copie de la **dernière preuve**, que l'invalidation n'efface pas : `last = { wcs, stored: {x,y,z} (= $# + G92 + TLO), units, proof }`, posée dans `proven()`. Accès `lastProven()` (copie). Rien d'autre ne change dans D2.

**`r.recovery`** (`job-service.js`) : `null` ou `{ cause: 'restart' | 'alarm', at, before, proofAtOpen, zero, after }`.
- Ouverte dans `r.reset`, `r.alarmed` et la branche `Alarm` de `r.status`, **avant** la remise à faux de `homed`, si `r.homed === true` ou si un usinage est commencé et non fini (y compris arrêté par la tablette, `r.job.stopped` avec `r.lastStop` de ce fichier). `before = r.offset.lastProven()` (ou `null`), `proofAtOpen` = nombre de preuves à cet instant, `zero = 'pending'`.
- Déjà ouverte : `cause` passe à `'restart'` si c'est une bannière (jamais l'inverse) ; `before` et `proofAtOpen` **ne changent pas** (le zéro de référence reste celui d'avant le premier incident) ; `zero` repasse à `'pending'`.
- Comparaison, à chaque `changed()` : si `zero === 'pending'` et qu'une preuve **postérieure** à `proofAtOpen` tient (`r.offset.proof() > proofAtOpen`) : `after = lastProven()` ; `zero = 'unknown'` si `before` est nul ou d'autres unités ; `'same'` si même repère et `|after − before| ≤` tolérance D2 sur X, Y, Z ; sinon `'changed'`.
- Ensuite, une nouvelle preuve dont le repère ou la valeur diffère de `after` : `zero = 'redone'`, `after` mis à jour (l'opérateur a refait le zéro ; le serveur ne sait pas par quel moyen, il ne le prétend pas).
- Gardée par la prise d'origine. Fermée par le départ d'un usinage (`r.run`, reprise comprise) et la fermeture du port (enregistrement supprimé). Pas d'opération « Passer » : il n'y a plus rien à passer.

**`r.resetRequired`** : vrai dans `r.alarmed` si le code est 1 ou 2 ; faux dans `r.reset` (bannière). Indépendant de `recovery` (une alarme critique d'une machine jamais référencée l'a aussi).

**Garde ajouté** dans `homeReady` et `unlockReady`, en premier : `r.resetRequired` → `ETOUCH_HOME_RESET_REQUIRED` (409), « La machine attend une réinitialisation après l'alarme N : bouton Reset de CNCjs sur le PC, ou éteignez puis rallumez la machine. » Aucun garde existant retiré ni affaibli.

**Instantané** : `recovery: { cause, at, zero, before, after } | null` (valeurs `fmt3`), `resetRequired`. La signature de changement (`job-service.js:2840`) inclut `recovery.zero` et `resetRequired`.

## 5. Présentation des refus (page)

- `refus.js` `lire(error, machine)` : second argument facultatif (l'état reçu, passé par `seance.js` et les autres appelants qui l'ont ; sinon `window.cncState.get().machine` s'il existe). Si `machine.referenceLost` n'est pas nul, les familles `origine-a-prendre` et `alarme`, la raison `error:15` d'un pas, et `ETOUCH_FRAME_RESTART` deviennent la famille **`position-perdue`** : phrase selon la cause, remède `remise-en-route`. Sur ①, ce remède est filtré (`seance.js:141`) : l'action reste [Prise d'origine machine…]. Cause globale n° 10 (`seance.js:91`) : même phrase et même remède hors de ①.
- `ETOUCH_HOME_RESET_REQUIRED` : famille nouvelle `reinitialisation` (phrase serveur, remède `details`), **prioritaire** sur `position-perdue`.
- Phrases serveur FR dans la table des messages (`machine-profile.js` ou `job-service.js`, là où vivent les phrases de `homeReady`), EN/ES dans `i18n-messages-machine.js`, en fin de table.

## 6. Cas d'échec

| Cas | Ce qui se passe | Après |
|---|---|---|
| Pince de sonde restée sur la fraise | La boîte de prise d'origine demande son retrait (D4) ; rien ne le **prouve** (`Pn:P` ouvert ne dit rien d'une pince posée à vide). | Limite écrite § 11 ; essai P4-B2. |
| Alarme critique, carte muette | `resetRequired`, prise d'origine et déverrouillage refusés, carte B1. Rien n'est écrit. | Reset du PC ou coupure ; bannière → A ; port perdu → C. |
| Prise d'origine en échec (`ALARM:6-9`, interrompue) | Comportement existant ; `homed` reste faux, `recovery` reste ouverte, `zero` reste `pending`. | Refaire la prise d'origine. |
| `$#` effacé ou modifié par le redémarrage | D2 peut prouver (WCO et `$#` d'accord entre eux) : la comparaison donne `changed`. | « différent… Refaites-le », [Refaire le zéro pièce]. |
| G92 perdu au redémarrage | `before.stored` contenait G92 : `changed`. | idem. |
| Repère actif changé (G55 avant, G54 après) | `changed` (repère différent). | idem. |
| Aucune preuve avant l'incident | `before` nul : `unknown`. | « sans comparaison possible ». |
| D2 non prouvé après | `zero` reste `pending` ; phrases D2 actuelles. | [Vérifier à nouveau] / [Refaire le zéro pièce]. |
| Programme qui a écrit un `G10` en cours d'usinage | `before` (preuve d'avant le départ) diffère du `$#` relu : `changed`. Prudent, peut-être à tort. | L'opérateur refait le zéro. |
| Nouvel incident avant le départ | `before` gardé, `zero` repasse `pending`. | Nouvelle comparaison. |
| Reconnexion | Rien d'hérité (C). | Prise d'origine ; zéro « sans comparaison ». |
| CNCjs redémarré | `r.recovery` (mémoire seule) perdue. | Comme C. |

## 7. Faits de la carte utilisés (`design/refonte/FIRMWARE.md`)

| Fait | Où il sert | Degré de preuve |
|---|---|---|
| E3 : après un Arrêter en usinage ou `ALARM:2`, MPos 0, non référencée | la détection, la carte « a redémarré » | **observé** ; mécanisme inconnu (H1, H2, H3) |
| § 3.a pts 3-4, R4 : après `ALARM:1/2`, boucle vide jusqu'à un reset envoyé **après** l'alarme ; `?` répond encore | parcours B, garde `ETOUCH_HOME_RESET_REQUIRED` | **amont seulement** ; sur la LUNYEE, E3 suggère un redémarrage (H2) que le simulateur imite (L7, L8) |
| E4 / R6 : `WCO:0,0,0` après `$H`, `$#` garde G54 ; `G55` puis `G54` recharge | D2 avant la comparaison | observé (terrain) + amont |
| `$#` conservé à travers un **redémarrage** de l'ESP32 | « gardé, identique » | **amont seulement** ; la comparaison le constate ou dit `changed` |
| L14 : pas de bannière à l'ouverture du port | parcours C | simulateur, d'après le terrain |
| R12 : Wi-Fi ouvert, un autre client peut écrire | un `$#` changé par le Wi-Fi pendant l'incident donne `changed` (prudent) | observé |

## 8. Fichiers touchés

Serveur : `src/server/services/touch/work-offset.js` (`last`, `lastProven`) ; `job-service.js` (fichier partagé : `r.recovery`, `r.resetRequired`, garde dans `homeReady`/`unlockReady`, instantané, signature, groupés en fin de section) ; table des phrases serveur ; `__tests__/touch-codes-catalog.js` si le catalogue l'exige.

Page : `touch/seance.js` (ligne zéro selon `recovery.zero`, action principale, cause n° 10, parcours B) ; `touch/refus.js` (`position-perdue`, `reinitialisation`, second argument) ; `touch/grbl-help.js` (lignes de l'encart) ; `touch/job-controls.js` (texte de la boîte `home`, D4) ; `touch/job-resume.js` (action principale de ⑤ selon `recovery.zero`) ; `touch/i18n-messages*.js` (blocs en fin, FR/EN/ES) ; `verify-project.cjs` (nouveau test) ; `browser-run.cjs` (fixture `stopped-unhomed` complétée).

Documents : `design/refonte/SURETE.md` § P4, `design/refonte/PROTOCOLE-ESSAI.md` § P4, `IDEES.md` (le mouvement retiré), `design/plaque/P4-COMPTE-RENDU.md`.

## 9. Tests exigés

Chaque test nomme l'assertion nouvelle et la régression qu'il attrape. Les témoins (qui restent verts sans le code) sont marqués « témoin » et ne comptent pas comme preuve du code.

Serveur, faux contrôleur — `__tests__/recovery.test.js` :
1. **Ouverture.** Nouvelle assertion : `state().recovery` non nul avec `cause` attendue. Cas : bannière après prise d'origine → `restart` ; `ALARM:3` → `alarm` ; bannière puis alarme → reste `restart` ; usinage commencé non référencé ($22=0) puis bannière → ouverte. Témoin : bannière sans référence ni usinage → `null`. Régression attrapée : remise en route absente, ou annoncée à chaque connexion.
2. **Survie.** Après prise d'origine : `referenceLost` nul **et** `recovery` présente ; fermée par `r.run`. Régression : la carte disparaît à la prise d'origine.
3. **Reconnexion (constat 5).** Port fermé (`remove`) puis nouveau contrôleur avec et sans bannière : `recovery` nulle, `homed` faux, `canStart` faux, aucun héritage de `before`. Régression : un historique qui rendrait une permission.
4. **Alarme critique sans bannière (constat 4).** `ALARM:1` puis `ALARM:2`, rapports `Alarm` frais, aucune bannière : `canHome` et `canUnlock` faux, code `ETOUCH_HOME_RESET_REQUIRED`, une demande `home` refusée **sans aucun octet écrit** ; témoin `ALARM:3` → pas de `resetRequired` ; bannière ensuite → `resetRequired` faux, `canHome` vrai. Régression : `$H` envoyé à une carte muette.
5. **Comparaison avec le vrai D2 (constat 1), faux contrôleur répondant `$#`/WCO** : avant = G54 (50, 100, −105) prouvé ; bannière ; prise d'origine ; après, quatre cas : identique → `same` ; `$#` remis à 0 et WCO 0 (D2 **prouve**) → `changed` ; G92 X5 avant, 0 après → `changed` ; repère G55 avant, G54 après → `changed`. Aucune preuve avant → `unknown`. Nouvelle preuve différente après `same` → `redone`. Régression : « gardé » annoncé pour un zéro effacé.
6. **Indépendance de l'invalidation.** `invalidate('stop')` puis `invalidate('restart')` ne changent pas `lastProven()`. Régression : `before` vidé par l'Arrêter qui précède la bannière (`job-service.js:2663`).
7. **Rien d'écrit.** Ouverture, comparaison, fermeture : `c.commands` inchangé. Régression : P4 qui enverrait une ligne.

Simulateur, **profil LUNYEE** — `__tests__/recovery-lunyee.test.js` :
- S1. Cas du 18 novembre : prise d'origine, `G10 L2 P1 X50 Y100 Z-105` (et non `L20` : après `$H` à MPos 0, `L20` donnerait −50, −100, +105), `$#` relu = 50/100/−105 ; preuve D2 ; usinage lancé, Arrêter en mouvement → bannière (le simulateur donne `ALARM:3` puis redémarrage, L9 ; l'`ALARM:3` n'est pas exigé) ; `recovery.cause === 'restart'` ; `ETOUCH_START_NOT_HOMED` et `ETOUCH_ORIGIN_NOT_HOMED` gardent leur code ; prise d'origine ; D2 prouvé dans les deux hypothèses `executedAfterHoming: 'zero'` et `'stored'` ; `recovery.zero === 'same'` ; `stoppedAtLine` conservé.
- S2. Même chose avec `G10 L2 P1 X0 Y0 Z0` envoyé entre la bannière et la prise d'origine (zéro perdu simulé) : D2 prouvé, `recovery.zero === 'changed'`.
- S3. `ALARM:2` provoquée par une ligne hors course (profil L7 : redémarrage) : `resetRequired` vrai puis faux à la bannière ; témoin du chemin H2.

Page (hors navigateur, `examples/cncjs-touch/test-remise-en-route-p4.cjs`, enregistré dans `verify-project.cjs`) :
- P1. `referenceLost: 'restart'` : sur ② à ⑤, `ETOUCH_START_NOT_HOMED`, `ETOUCH_ORIGIN_NOT_HOMED`, `ETOUCH_CNC_FRAME_NOT_HOMED`, `ETOUCH_MOTION_ALARM`, `ETOUCH_FRAME_RESTART`, `lastJog` `error:15` → famille `position-perdue`, remède `remise-en-route`, code d'origine dans Détails (nouvelle assertion : la famille ; aujourd'hui `origine-a-prendre`, `alarme` ou « erreur 15 »). `'alarm'` → l'autre phrase. Témoin : `referenceLost` nul → présentation actuelle.
- P2. **Ligne zéro.** Nouvelle assertion, rouge aujourd'hui : incident + D2 prouvé **sans** `recovery` → pas « gardé » (aujourd'hui `seance.js:24` l'écrit) ; `recovery.zero` `same` → « gardé, identique… » ; `changed` → alerte, bouton `refaire-zero` ; `unknown` → alerte ; `redone` → « refait… ».
- P3. **Action principale.** Arrêté ligne 1 234, référencé, prouvé : `zero: 'changed'` ou `'unknown'` → ① et ⑤ proposent `refaire-zero`, pas `changer-ligne` (rouge aujourd'hui) ; `same` → `changer-ligne` (témoin du chemin actuel).
- P4. **Boîte de prise d'origine (constat 2).** Texte et case contiennent la pince de sonde ; un seul envoi du ticket après les 3 touchers (rouge aujourd'hui : texte absent).
- P5. **Parcours B.** `resetRequired: true` → encart « attend une réinitialisation », [Prise d'origine machine…] rayé avec la phrase du serveur, aucun handler d'envoi appelé.
- P6. `test-refus-table.cjs` (chaque nouveau code a sa famille), `test-i18n.cjs` (FR/EN/ES), `test-textes-regles.cjs` (aucun `$`, G-code ou « carte » hors Détails) : contrôles généraux, témoins.
- Navigateur si disponible : `browser-run.cjs --strict --only <étape remise en route>`.

Avant de rendre : `node examples/cncjs-touch/verify-project.cjs`, `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false`, ESLint sur les fichiers touchés.

## 10. Essai réel (à ajouter à `PROTOCOLE-ESSAI.md` § P4)

Aucun mouvement nouveau : seul `$H` (existant) bouge la machine. **Broche débranchée de son alimentation, pas de fraise, table vide** jusqu'à P4-D. CNCjs classique ouvert sur le PC en observateur. Main sur l'arrêt physique pendant chaque prise d'origine.

| Étape | Manipulation | Attendu / relevé |
|---|---|---|
| P4-A1 | Machine connectée et référencée, zéro pièce posé (X 200, Y 200), D2 prouvé. **Au repos**, bouton Reset de CNCjs sur le PC. | Bannière ou non ; messages de démarrage complets ou seulement `Grbl … ['$' for help]` (discriminant H1, `FIRMWARE.md` § 3.a). Si bannière : encart « La machine a redémarré : position perdue. », ligne zéro « comparé… après la prise d'origine ». |
| P4-A2 | Toucher Démarrer (④), un zéro (③), un pas +Z (après Déverrouiller seulement si l'opérateur le veut). | Chaque refus dit « position perdue » + [Remise en route] ; Détails : le code d'origine. |
| P4-B1 | [Prise d'origine machine…] : lire la boîte. | La pince de sonde y est nommée, dans le texte et la case. |
| P4-B2 | Poser la pince de sonde sur une fraise **absente** (pince fermée à vide, câble libre) : la boîte la fait retirer ; la retirer ; cocher, engager. | Prise d'origine faite ; aucun câble tiré. |
| P4-B3 | Attendre D2. | « Zéro pièce : gardé, identique… » ou « différent… » : **noter lequel** (fait « `$#` après redémarrage »). Détails : avant / après. |
| P4-B4 | Contrôle → Cadrage à vide (F1, s'il a déjà été essayé). | La fraise passe au-dessus du coin attendu. |
| P4-C1 | Débrancher puis rebrancher l'USB, reconnecter. | Parcours C : rien d'hérité, « Origine machine à prendre » (ou « a redémarré » si bannière), zéro « sans comparaison possible ». |
| P4-D1 | Cas du terrain, encadré : planche bridée, fraise montée, broche **toujours débranchée**, zéro pièce posé ; petit fichier d'essai (Z de travail ≥ 5 mm au-dessus de la planche) ; Arrêter en plein mouvement. | Bannière ou non (H1). Si redémarrage : encart, prise d'origine, comparaison ; [Reprendre à la ligne N…] proposé seulement si « identique ». |

Ne pas essayer : provoquer `ALARM:1` ou `ALARM:2` (parcours B : tests seulement), `$20=0`, reset en mouvement hors P4-D1. Relevé : fait / non fait par étape, messages, valeurs avant / après, surprises.

## 11. Ce qui reste incertain

- La cause du redémarrage (H1, H2, H3) : P4 traite le résultat, pas la cause.
- Si `$#` survit au redémarrage sur ce binaire : la comparaison le dira ; sinon « différent… refaites-le ».
- Le parcours B repose sur le code amont ; sur la LUNYEE, `ALARM:2` semble suivi d'un redémarrage (E3). Si la carte ne redémarre pas **et** répond quand même aux lignes, le garde refuse une prise d'origine qui aurait marché : sens prudent, remède = reset du PC.
- La pince de sonde : demandée, jamais constatée. Aucun capteur ne dit qu'elle est retirée.
- La comparaison prouve « même `$#` + G92 + TLO qu'à la dernière preuve », pas « même pièce au même endroit » : une pièce déplacée sur la table n'est vue que par l'opérateur (cadrage à vide).
- Un `G10` écrit par le programme pendant l'usinage donne `changed` (prudent) ; un `G92` posé par le programme et perdu au redémarrage n'est pas dans `before` (preuve faite avant le départ) : la reprise à une ligne garde alors ses propres contrôles.
- **Question pour l'orchestrateur / l'opérateur** : faut-il un garde **serveur** refusant la reprise à une ligne tant que `recovery.zero` vaut `changed` ou `unknown` ? P4 ne fait qu'orienter la page (la reprise reste possible par le volet de ⑤, et depuis CNCjs sur le PC). Garde ajouté, aucun retiré, mais il touche la reprise existante : je ne l'ai pas mis sans accord.
- `r.recovery` n'est pas persistante : perdue si CNCjs redémarre (parcours C).
- Écart avec le prompt : le retour au-dessus du zéro pièce n'est pas fait (D0).

## 12. Réponse à la relecture Astra

Relecture : commit `768b7192`, 2 dangers, 6 « à corriger », 2 remarques. Tous les constats ont été vérifiés dans le code ; **aucun n'est réfuté**.

| # | Constat | Verdict | Preuve | Ce qui change |
|---|---|---|---|---|
| 1 | danger — D2 ne prouve pas la conservation de l'ancien zéro | **Accepté** | `work-offset.js:275-289` compare `$#` actuel au WCO actuel ; `invalidate` efface `stored` (`:153`) ; l'Arrêter invalide déjà avant la bannière (`job-service.js:2663`, `:710`). Pire : la page actuelle écrit déjà « gardé, vérifié » dès incident + preuve (`seance.js:24`). | D2 : `lastProven()` non effacé par l'invalidation ; `recovery.before` / `after` / `zero` (§ 4) ; « gardé » seulement si identique ; `changed`/`unknown` orientent vers « Refaire le zéro pièce ». Tests 5, 6, S1, S2, P2, P3 avec le vrai D2 (effacé, G92 perdu, repère changé, témoin). |
| 2 | danger — la pince de sonde attachée | **Accepté** | La v1 disait « sans objet » ; or un Arrêter pendant un palpage fait feed hold + reset (`job-service.js:2616-2618`, `:2668-2672`), donc probablement un redémarrage avec la pince sur la fraise ; la boîte `home` ne la nomme pas (`job-controls.js:197`). | D4 : texte et case de la boîte de prise d'origine (toutes les prises d'origine). Le mouvement de retour, second trajet à risque, est retiré (D0). Test P4, essai P4-B1/B2 ; limite « jamais constatée » écrite. |
| 3 | le ticket n'atteste pas la position de départ | **Accepté**, devenu sans objet | Vrai : `$J=G90 G21 X0 Y0` ne dépend pas de la position X/Y, et de Z 0 à Z −3 aucune ligne Z n'existe (seuil `zs − mz ≥ 0,01`, `zs = −5`) : le plan restait identique. | Le mouvement et son ticket sont retirés (D0). À reprendre avec lui (position XYZ de départ comparée, tolérance chiffrée) s'il revient. |
| 4 | alarme critique sans bannière | **Accepté** | `FIRMWARE.md:67-69` et R4 : boucle vide, reset nécessaire **après** l'alarme ; `homeReady` accepte `Alarm` sans regarder le code (`job-service.js:1300-1305`) ; le témoin `repetition-findings.test.js:247-269` montre la tablette sans recours. | D3, parcours B, `r.resetRequired`, garde `ETOUCH_HOME_RESET_REQUIRED` sur prise d'origine et déverrouillage, remède explicite sans reset automatique. Test 4 (aucun octet écrit), S3, P5. L'Arrêter pendant `$H` (reset existant) n'est pas touché ; plus aucun `0x85` propre à P4. |
| 5 | la reconnexion USB détruit l'état | **Accepté** | `remove` supprime l'enregistrement (`job-service.js:770-772`) ; la LUNYEE n'envoie pas de bannière à l'ouverture (L14) : l'essai P4-A1 de la v1 ne pouvait pas montrer la carte annoncée. | Parcours C défini (rien d'hérité, D7) et testé (test 3) ; P4-A1 remplacé par un Reset du PC **au repos**, connexion gardée ; la reconnexion devient l'essai P4-C1. |
| 6 | `done` peut afficher une position fausse | **Accepté**, devenu sans objet | Vrai : rien ne remettait `done` à faux après un pas manuel ou une nouvelle tentative. | `done` n'existe plus (pas de mouvement). L'état `zero` ne parle que du zéro pièce, jamais de la position de la fraise ; il change à chaque preuve (`redone`) et repasse `pending` à chaque incident. |
| 7 | deux tests faux | **Accepté** | (a) Après `$H` à MPos 0, `G10 L20 P1 X50 Y100 Z-105` pose le décalage MPos − valeur = −50, −100, +105 ; c'est `L2` qui écrit 50, 100, −105. (b) Depuis Z −60, la montée passe forcément sous −5,05. | (a) S1 et S2 utilisent `G10 L2` et vérifient `$#`. (b) Sans objet (S2 v1 retiré avec le mouvement). |
| 8 | les tests différentiels doivent viser les nouvelles branches | **Accepté** | `seance.js:24` contient déjà « gardé, vérifié » et « à vérifier après la prise d'origine » : le test P2 v1 serait resté vert sans code ; `test-refus-table`, `test-i18n` sont des contrôles généraux. | § 9 réécrit : chaque test nomme son assertion nouvelle et la régression qu'il attrape ; témoins marqués. La partie `purpose:'zero'` (surveillance, flux, grâce de 3 s) est sans objet sans le mouvement. |
| 9 | remarque — l'arrivée comparée ne voit pas les pas perdus | **Accepté** | `motion.js` compare des coordonnées rapportées ; `SURETE.md:256` le reconnaît. | La promesse est retirée avec le mouvement ; § 11 dit que seule la vue de l'opérateur (cadrage à vide) voit une pièce ou des pas décalés. |
| 10 | remarque — commandes cohérentes sous réserves | Pris acte | — | Plus de commande propre à P4 ; `$J=G90` et `0x85` restent à relever par l'essai F1, hors de P4. |
