# P4 allégé — position perdue après un Arrêter

Lot P4 de `design/PROMPT-PLAQUE-XYZ.md`, 2026-11-21, arbre `cncjs-wt/P4` (branche `feat/P4`). Livré à la place de la conception complète (`P4-CONCEPTION.md` v3), mise de côté.

**Le problème** (18 novembre 2026) : « Arrêter » en plein usinage, la machine redémarre (`referenceLost = 'restart'`, `job-service.js`). L'opérateur voit des refus dispersés (`ETOUCH_START_NOT_HOMED`, `ETOUCH_ORIGIN_NOT_HOMED`, `ETOUCH_CNC_FRAME_NOT_HOMED`, jog « error:15 » sur Z) sans comprendre qu'il suffit de faire la prise d'origine.

## Ce qui est livré (page seule)

Aucun mouvement, aucune commande machine, aucun état serveur, aucun garde nouveau. Fichiers : `touch/refus.js`, `touch/seance.js`, `touch/i18n-messages-refus.js` (chaînes FR / EN / ES), `touch/i18n-messages.js` (ligne « gardé, vérifié » retirée), `test-position-perdue.cjs` (nouveau), `test-remise-en-route.cjs`, `verify-project.cjs`.

1. **Une cause unique, en tête.** Quand la machine rapporte `referenceLost` (et n'est pas référencée, réglages lus) :
   - `'restart'` : « La machine a redémarré : sa position est perdue. Faites la prise d'origine. »
   - `'alarm'` : « Après une alarme, la position de la machine est perdue. Faites la prise d'origine. »

   C'est la cause globale de la séance (rang 8 en alarme, rang 10 au repos, id `position-perdue`), avec le remède existant [Prise d'origine machine…]. Elle apparaît sur ① Machine, ③ Zéro pièce et ④ Contrôle. Sans `referenceLost` (machine jamais référencée), les phrases actuelles restent.
2. **Les refus « non référencée » renvoient à cette cause.** Tout code de la famille `origine-a-prendre` (dont `ETOUCH_START_NOT_HOMED`, `ETOUCH_ORIGIN_NOT_HOMED`, `ETOUCH_CNC_FRAME_NOT_HOMED`) garde son code dans Détails, mais sa phrase et son remède deviennent ceux de la cause ci-dessus. `cncRefus.lire(error, machine)` reçoit la machine ; à défaut, il prend le dernier état reçu.
3. **Jog refusé par error:15, machine non référencée** : « Position perdue : la machine croit être ailleurs. Faites la prise d'origine. » [Prise d'origine machine…], à la place de « La machine a refusé le déplacement (erreur 15). ». Sur ③, cette phrase passe devant « Origine machine pas prise… » juste après le refus. Machine référencée ou autre erreur : la phrase avec le numéro reste.
4. **Le zéro pièce, sans fausse promesse.** La page ne compare rien. Les phrases sont donc :
   - avant la prise d'origine, après un incident : « Zéro pièce : enregistré dans la machine, il revient après la prise d'origine. »
   - après, preuve D2 faite : « Zéro pièce : celui enregistré dans la machine. Vérifiez-le avant l'usinage : « Cadrer à vide… » sur 4 · Contrôle. » (laser : « Cadrer… », « avant la gravure »)

   La phrase « Zéro pièce : gardé, vérifié » disparaît.

## Ce qui est mis de côté

Tout `P4-CONCEPTION.md` v3 : la garde serveur du zéro au départ (`ETOUCH_START_ZERO_UNCONFIRMED`), les états par axe et la validation explicite, l'interdiction de prise d'origine après une alarme critique, la boîte « pince de sonde », le retour au-dessus du zéro pièce. Trois relectures de sûreté ont rendu le verdict « à revoir » (`P4-CONCEPTION.md` § 12 et § 13 ; avis complets dans les notes de l'orchestrateur, `astra-P4.md`, `astra2-P4.md`, `astra3-P4.md`). Conséquence, inchangée par ce lot : après un incident, le serveur laisse démarrer dès que la machine est référencée et que D2 prouve le zéro enregistré. Seul l'œil de l'opérateur vérifie que la pièce n'a pas bougé.

## Essai réel

Broche débranchée, pas de fraise, table vide. CNCjs ouvert sur le PC. Main sur l'arrêt physique pendant la prise d'origine.

| Étape | Manipulation | Attendu |
|---|---|---|
| A1 | Machine référencée, zéro pièce posé, un fichier chargé. **Au repos**, Reset depuis CNCjs sur le PC (ou couper puis rallumer la machine). | ① : « La machine a redémarré : sa position est perdue. Faites la prise d'origine. » en tête, bouton [Prise d'origine machine…] ; ligne zéro « enregistré dans la machine, il revient après la prise d'origine ». |
| A2 | Aller sur ③ et ④ ; toucher Démarrer, un zéro « à l'origine machine », Cadrer à vide. | Même phrase partout, même remède ; le code reste visible dans Détails. |
| A3 | Sur ③, déverrouiller si besoin, puis un pas de 1 mm en +Z. | Si la machine refuse (error:15) : « Position perdue : la machine croit être ailleurs. Faites la prise d'origine. » |
| A4 | [Prise d'origine machine…], attendre la vérification du zéro. | Ligne zéro « celui enregistré dans la machine. Vérifiez-le avant l'usinage… » ; Cadrer à vide montre où passe le fichier. |

Relevé : phrases lues (FR, et une langue étrangère si possible), valeurs, surprises. Ne pas faire de reset en mouvement.
