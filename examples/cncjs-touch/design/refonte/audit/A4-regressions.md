# A4 — Régressions des lots récents (audit phase 1)

Chasseur : Astra (GPT Codex, raisonnement « ultra », lecture seule). Périmètre : `git diff a0f6ad18..3049a0e4` (83 fichiers, +6754 −1057, 6 commits). Base lue par Astra : HEAD `c35c9587`.
Brief : `scratchpad/refonte/A4/brief.md`. Exécution Astra : une seule, code de sortie 0. Rapport brut en annexe A.

## 1. Synthèse des constats d'Astra (format § 4.3)

| Id | Gravité | Phrase | Lot | Journal |
|---|---|---|---|---|
| A4-1 | sécurité machine | Le palpage au bloc calcule ses cibles `G38.3` depuis MPos/WPos sans recouper le `WCO` rapporté avec `$#` du repère actif. | 1cbf488d | T3 |
| A4-2 | sécurité machine | Libérer le pilotage pendant un palpage ouvre une commande broche (`M3 S1000` par Socket.IO) avant l'arrêt du cycle. | 1cbf488d | aucun |
| A4-3 | sécurité machine | Un arrêt Socket.IO pendant un intervalle Idle n'annule pas le séquenceur du palpage : la ligne suivante part. | 1cbf488d | reste ouvert § 3 |
| A4-4 | sécurité machine | Un arrêt différé (`halt.js`) peut envoyer un reset à l'opération suivante après une bannière de reset externe. | 1cbf488d | aucun |
| A4-5 | sécurité machine | Un pas réel peut viser exactement la fin de course nominale (tolérance 1e-6, sans marge), contrairement au continu (marge 1 mm). | 86154aad, 71499952 | T2, T15 |
| A4-6 | à corriger | En EN/ES, l'erreur HTTP d'un échec de palpage perd les avertissements « origine incertaine / prise d'origine à refaire ». | 1cbf488d | aucun |
| A4-7 | à corriger | Un refus Grbl (`error:N`) après un pas accepté par HTTP disparaît du suivi : l'avis reste « envoyé à la machine ». | 86154aad, 71499952 | aucun |
| A4-8 | à corriger | Suivi affiche 100 % pendant Run quand toutes les lignes sont acquittées : le plafond à 99 est exclu par `p<100`. | 0cb5d90a | suite de T15 |
| A4-9 | à corriger | Relancer le même programme réutilise le temps cumulé de l'exécution précédente (`runTrack`). | 0cb5d90a | aucun |
| A4-10 | à corriger | La progression emploie l'estimation d'un aperçu d'une autre version du même nom de fichier. | 0cb5d90a | aucun |
| A4-11 | à corriger | Refus du bloc restés partiellement en français en EN/ES (refus sans code, paramètres « inconnue » / « inconnu »). | 1cbf488d | T6, T7, reste § 3 |
| A4-12 | à corriger | S38 ne distingue pas un rapport de deux après l'`ok` (mutant `+2` vers `+1` non détecté). | 1cbf488d | reste § 3 |
| A4-13 | à corriger | Le faux Grbl de `block-probe.test.js` ne modélise pas les anomalies de la carte (WCO nul, reset sans MPos 0, limites logicielles). | 1cbf488d | T2, T3 |
| A4-14 | mineur | S27 annonce plusieurs refus mais n'en appelle que deux. | 1cbf488d | aucun |

Détail de chaque constat (scénario, preuve, correction, fichiers) : annexe A.

Autres éléments d'Astra :
- Reste ouvert `G38.3` sans contact : les cinq trajets XYZ (`block-probe.js:945-958`, `watch()` exigeant un PRB `result=0`, `:843-850`) dépendent aussi du comportement sans contact. Non validé sur la carte.
- Pistes § 4.2 : 4 confirmée (A4-1) ; 5 confirmée au code (A4-5) ; 6 confirmée mais héritée (plaque sans référence ni contrôle de course, `plate-probe.js:58-124 → :237`, non surveillée à la perte du flux, timeout sans hold/reset `:207-209 → :271-279`) ; 11 : relais existant, aucun défaut prouvé, écran de préparation masqué volontairement.
- Commit `3049a0e4` : `W_MAX 10 → 28`, aucun défaut arithmétique démontré ; le test ne rejoue pas un cycle partant à 20-28 mm du bord.
- Aucun défaut prouvé dans le clavier partagé, le pavé numérique, le CSS ni le cache.

### Soupçons (sans preuve complète)
- Pas envoyé pendant une prise d'origine annoncée, avant le premier rapport Home (`job-service.js:1117-1121`, `motion.js` ne consulte pas `r.homing`).
- Nettoyage `G0` non confirmé après un palpage arrêté (`block-probe.js:1051-1058`).
- Contrat « deux rapports Idle » : `plate-probe.js:175-177` et `:203` (Run puis Idle suffit).

## 2. Vérification des citations

Méthode : chaque `fichier:ligne` cité par Astra relu avec `sed -n` sur le dépôt courant (HEAD `c35c9587`). Je n'ai pas jugé le fond, exécuté aucun test ni rejoué aucun scénario.

| Id | Citations contrôlées | Résultat |
|---|---|---|
| A4-1 | `block-probe.js:288, 322, 778-785, 813-816, 868, 913-925` | Exactes. `:913-925` lit `$#` et ne contrôle que G92 et TLO ; `:868` envoie `workTarget`. |
| A4-2 | `job-service.js:1613-1614`, `control.js:209, 239-244`, `index.js:34, 125-133`, `CNCEngine.js:381-394`, `GrblController.js:1989, 1993-2003`, `block-probe.js:631-632, 641-650, 52` | Exactes. `index.js:34` n'est que l'ouverture de `createControl(` : le journal du changement de bail est plus bas. Superviseur à 100 ms confirmé. |
| A4-3 | `control.js:43`, `index.js:125-133`, `GrblController.js:1424-1445`, `block-probe.js:615-637, 706-739`, `job-service.js:535-544` | Exactes. `stop` et `gcode:stop` sont dans `SAFE_COMMANDS` ; hold seulement en Run, reset seulement en Hold. |
| A4-4 | `block-probe.js:573-585, 999-1002, 1016-1019`, `halt.js:63, 79-80, 88-89`, `job-service.js:386` | Exactes. Le scénario exige un entrelacement précis (Astra le dit). |
| A4-5 | `motion.js:206, 436-447, 463-464, 48, 689-690`, `program-check.js:16, 585` | Exactes. `EDGE_MARGIN_MM=1` n'est utilisée qu'au continu ; tolérance `1e-6` au pas. |
| A4-6 | `block-probe.js:1060-1069`, `api.touch.js:79-83`, `job-controls.js:141-148, 522`, `i18n.js:53-61`, `probe-ui.js:187, 196-199` | Exactes. `api.touch.js:83` n'envoie pas `blockProbe`. |
| A4-7 | `motion.js:463-468, 335-339, 477-478, 649-653`, `plate-probe.js:159-162`, `real-motion.js:247-254, 267-272, 235` | Exactes. |
| A4-8 | `Sender.js:328, 365-370`, `GrblController.js:502-504, 991-1007`, `job-service.js:1279-1281`, `job-dashboard.js:271, 275, 278`, `test-motion-estimate.cjs:132-140` | Exactes. |
| A4-9 | `job-dashboard.js:275, 278-280`, `job-service.js:1823-1831` | Lignes exactes. Réserve : `runTrack` est aussi réinitialisé quand `c.workflow==='idle'` dans la branche `p<100` (`:280`). Si un sondage au repos avec compteurs rembobinés passe par cette branche entre deux exécutions, la remise à zéro a lieu. Le scénario d'Astra suppose que non. Non tranché : à contrôler en phase 2. |
| A4-10 | `job-dashboard.js:137-143, 279-282, 812-822`, `job-controls.js:263-273` | Exactes. |
| A4-11 | `motion.js:203-204`, `block-probe.js:425-428, 323-326, 459, 499, 606, 625-628, 674`, `i18n.js:44-61` | Exactes (`'inconnue'` et `'inconnu'` aux lignes citées). |
| A4-12 | `plate-probe.js:203`, `block-probe.test.js:35, 241, 367-376, 1267-1279` | Exactes. `SCALE=0.1`, `silentUntil` +200 ms ; S38 n'asserte que l'état final, les lignes et l'absence de chevauchement. |
| A4-13 | `block-probe.test.js:111-124, 133-143, 168-180, 206-214, 264-302, 311-315` | Exactes. `g.offset()` sert au rapport, aux cibles et à `$#` ; `reset()` ne remet pas `g.m` à zéro. |
| A4-14 | `block-probe.test.js:1090-1105` | Exactes. Seuls deux `prepare` sont appelés. |
| G38.3 sans contact | `block-probe.js:804-805, 1051-1057, 439-441, 945-958, 843-850`, `block-probe.test.js:301` | Exactes. |
| Plaque | `plate-probe.js:58, 237, 179-214, 207-209, 271-279`, `job-service.js:2107-2122` | Exactes. |
| Piste 11 | `job-dashboard.js:32-38`, `job-controls.js:579-582`, `probe-ui.js:311` | Exactes. |
| Soupçons | `job-service.js:1117-1121`, `real-motion.js:123`, `block-probe.js:1051-1058`, `block-probe.test.js:1301-1317`, `plate-probe.js:175-177, 203` | Exactes. |
| 3049a0e4 | `block-probe.js:300-301, 904-907`, `block-probe.test.js:557-560` | Exactes. |

Citations fausses : aucune. Numéros de ligne décalés : aucun (une réserve de lecture, A4-9).

## 3. Non vérifié

- Aucun scénario d'Astra n'a été rejoué ni écrit en test : les « tests à écrire » sont des idées.
- Je n'ai contrôlé que le contenu des lignes citées, pas les chaînes d'exécution complètes, ni la complétude (défauts qu'Astra n'aurait pas vus).
- Rien sur la vraie carte, la Surface ou la RT. Inconnus signalés par Astra : décalage exécuté après `$H`, frontière exacte des limites sous `$J`, comportement réel de `G38.3` sans contact, chronologie des resets.
- Les 3 soupçons restent sans preuve.

## Annexe A — Texte brut d'Astra

# Rapport A4 — Régressions des six lots récents

**Base vérifiée :** branche `feat/refonte-ui`, HEAD `c35c9587`. Seul le document de mission le distingue de `3049a0e4`. Les lignes citées correspondent au HEAD.

Lecture du document de mission complet, puis des changements des six commits dans leur ordre. **Aucun fichier modifié ou créé. Aucun test, serveur, accès réseau ou SSH lancé.** Les preuves ci-dessous viennent de chemins d’exécution lus, pas de reproductions exécutées.

Les chemins sont relatifs à la racine du dépôt. Les décisions D1 à D4 ne sont pas rediscutées.

## Constats prouvés

### A4-1 — Le palpage accepte un décalage rapporté contradictoire avec `$#`

- **Gravité : sécurité machine.**
- **Phrase :** Le bloc valide une enveloppe machine, puis calcule ses cibles `G38.3` avec MPos/WPos sans vérifier leur cohérence avec le repère actif mémorisé.
- **Scénario :** G54 Z mémorisé à −100, MPos Z = −110, WCO rapporté nul, donc WPos Z = −110 ; recherche de 10 mm → enveloppe validée `[−121, −110]`, puis émission de `G38.3 Z-120 F100`. Si le décalage exécuté reste −100, cette commande vise −220 machine, au lieu de −120.
- **Preuve :** `src/server/services/touch/block-probe.js:288` et `:322` vérifient l’enveloppe ; `:913–925` lit `$#` mais examine seulement G92 et TLO ; `:778–785 → :868` calcule puis envoie la cible depuis les positions rapportées. Le contrôle de position à `:813–816` intervient après le mouvement.
- **Correction proposée :** Appliquer D2 avant tout palpage. Comparer le décalage rapporté au repère actif lu dans `$#`, puis recharger et prouver sa cohérence avant d’envoyer une cible.
- **Fichiers :** `src/server/services/touch/block-probe.js`, contrôle partagé des décalages, tests du bloc.
- **Journal :** T3.
- **Lot :** `1cbf488d`.

**Limite de preuve :** l’absence de détection et la commande produite sont établies. Le terrain ne prouve pas encore si cette carte conserve aussi le décalage *exécuté* lorsque son WCO rapporté devient nul. Le déplacement à −220 est donc une conséquence conditionnelle, pas une observation matérielle.

### A4-2 — Libérer le pilotage ouvre une commande broche avant l’arrêt du palpage

- **Gravité : sécurité machine.**
- **Phrase :** Le bail peut disparaître pendant un palpage sans conserver une réservation exclusive jusqu’à son arrêt.
- **Scénario :** Bloc actif, juste après un retrait ; A libère son pilotage ; avant le prochain superviseur, le PC envoie `writeln(port, 'M3 S1000')` → la commande broche est écrite sur le port alors que le cycle serveur reste actif.
- **Preuve :** `src/server/services/touch/job-service.js:1613–1614 → control.js:209` supprime le bail. `index.js:34–47` journalise ce changement sans arrêter le cycle. `control.js:239–244 → index.js:125–133` autorise alors le socket. `src/server/services/cncengine/CNCEngine.js:381–394 → src/server/controllers/Grbl/GrblController.js:1993–2003 → :1989` transmet la ligne. Le bloc détecte l’absence de propriétaire seulement à son prochain contrôle : `block-probe.js:631–632`, `:641–650`, intervalle de 100 ms défini à `:52`.
- **Correction proposée :** Séparer le bail utilisateur de la réservation de l’opération machine. Annuler immédiatement le cycle à la libération et refuser toute nouvelle commande dangereuse jusqu’à l’arrêt prouvé.
- **Fichiers :** `control.js`, `job-service.js`, `index.js`, `block-probe.js`, intégration Socket.IO.
- **Journal :** aucun.
- **Lot :** exposition nouvelle par `1cbf488d`.

Test à écrire : figer les minuteries après le retrait, libérer A, injecter `M3 S1000` par Socket.IO et exiger qu’aucune nouvelle commande machine ne parte avant l’arrêt. Le code transmet M3 avant le premier hold/reset. Cela prouve la transmission concurrente, pas un démarrage physique observé de la broche.

### A4-3 — Arrêter par Socket.IO ne termine pas le cycle serveur entre deux lignes

- **Gravité : sécurité machine.**
- **Phrase :** Un arrêt Socket.IO accepté pendant un intervalle Idle laisse le palpage envoyer sa ligne suivante.
- **Scénario :** Retrait terminé, machine Idle, cycle toujours actif ; réception de `gcode:stop` avec `{force:true}` → aucune annulation du cycle, puis nouvelle touche envoyée.
- **Preuve :** `src/server/services/touch/control.js:43 → index.js:125–133` autorise l’arrêt sans prévenir le séquenceur. `src/server/controllers/Grbl/GrblController.js:1424–1445` ne fait un hold qu’en Run et un reset qu’en Hold. `src/server/services/touch/block-probe.js:615–637` ne surveille pas cet ordre ; `:706–739` peut poursuivre l’envoi. L’observateur `job-service.js:535–544` marque seulement un travail chargé comme arrêté.
- **Correction proposée :** Faire annuler synchroniquement l’opération serveur par les arrêts Socket.IO, avant leur traitement matériel. Conserver leur accès sans bail.
- **Fichiers :** `index.js`, `job-service.js`, `block-probe.js`, intégration CNCEngine.
- **Journal :** aucun ; reste ouvert explicite du § 3.
- **Lot :** `1cbf488d`.

La portée dépasse l’intervalle Idle : sans `force`, `gcode:stop` n’émet aucun arrêt physique. `feeder:stop` vide la file CNCjs, mais n’annule pas le séquenceur serveur qui peut la remplir à nouveau.

### A4-4 — Un arrêt différé peut réinitialiser l’opération suivante

- **Gravité : sécurité machine.**
- **Phrase :** Un reset externe peut libérer le verrou du bloc tout en laissant actif un ancien timer d’arrêt.
- **Scénario :** Palpage → Arrêter → attente de hold programmée → bannière de reset externe → palpage libéré → nouveau `$H` avant que l’ancien timer observe Alarm → cet ancien timer envoie encore un reset, au plus tard à cinq secondes.
- **Preuve :** `src/server/services/touch/block-probe.js:573–585` lance `halt()` ; `:999–1002` accepte le changement de `startups` comme preuve d’arrêt ; `:1016–1019` libère le verrou. `src/server/services/touch/halt.js:63–98` ne vérifie jamais ce compteur ; Home ne termine pas son attente et `:88–89` envoie le reset à l’échéance. `job-service.js:386–423` ne retire pas ces timers au startup.
- **Correction proposée :** Lier chaque arrêt différé au démarrage courant et annuler sa tâche dès qu’une nouvelle bannière prouve le reset.
- **Fichiers :** `block-probe.js`, `halt.js`, tests de palpage.
- **Journal :** aucun.
- **Lot :** `1cbf488d` ajoute ce chemin de libération vers l’ancien `halt.js`.

L’entrelacement est nécessaire : si l’ancien timer observe Alarm, `halt.js:79–80` le termine. Le test doit donc injecter le nouveau Home avant son prochain passage, puis vérifier l’absence d’un second reset.

### A4-5 — Les pas réels autorisent la frontière nominale sans marge

- **Gravité : sécurité machine.**
- **Phrase :** Un pas peut viser exactement une fin de course nominale, contrairement au mouvement continu.
- **Scénario :** Machine référencée, `$132=130`, Z machine = −129,9 ; pas Z− de 0,1 mm → commande acceptée vers −130, sans réserve.
- **Preuve :** `src/server/services/touch/motion.js:206` construit l’intervalle nominal ; `:436–447` accepte la frontière et une tolérance de `1e-6` ; `:463–464` envoie le pas. Le continu retire au contraire la marge définie à `:48`, dans `:689–690`. Le contrôle programme conserve sa tolérance de 0,001 mm : `program-check.js:16 → :585`.
- **Correction proposée :** Employer une enveloppe utilisable commune avec une marge conservatrice documentée, puis validée sur cette carte. Ne pas assimiler arbitrairement cette marge à `$27`.
- **Fichiers :** `motion.js`, contrôle partagé des courses, tests associés.
- **Journal :** T2, T15 et faits machine du § 2.
- **Lots :** défaut ancien exposé par `86154aad`, élargi aux grands pas par `71499952`.

Le terrain a déjà montré qu’une cible à −129,945 peut être refusée malgré sa présence dans l’intervalle nominal. **Le traitement exact d’une telle cible sous `$J` reste non vérifié** : ce constat ne prétend pas que ce pas produit nécessairement `ALARM:2`.

### A4-6 — Les erreurs HTTP traduites perdent les avertissements de remise en état

- **Gravité : à corriger.**
- **Phrase :** En EN/ES, le retour d’échec peut perdre les mentions d’origine incertaine et de prise d’origine à refaire.
- **Scénario :** Perte de `touch-events` pendant le palpage ; réponse HTTP d’échec reçue, sans nouvel état disponible → seule la cause traduite apparaît ; les avertissements complémentaires manquent.
- **Preuve :** `src/server/services/touch/block-probe.js:1060–1069` construit le message complet et `out.blockProbe`. `src/server/api/api.touch.js:79–83` omet ce bilan structuré. `examples/cncjs-touch/touch/job-controls.js:141–148 → i18n.js:53–61` remplace le message complet par le seul modèle traduit du code ; `job-controls.js:522` l’affiche. Sans machine disponible, `probe-ui.js:187 → :196–199` ne fournit aucun résumé de remplacement.
- **Correction proposée :** Transmettre le bilan structuré dans l’erreur HTTP, le conserver côté page et utiliser le même rendu que `CNCProbeReal.failureText()`.
- **Fichiers :** `api.touch.js`, `job-controls.js`, `probe-real.js`, `probe-ui.js`, tests EN/ES.
- **Journal :** aucun ; extension des restes i18n du § 3.
- **Lot :** `1cbf488d`.

Les avertissements peuvent réapparaître avec un futur snapshot. Le défaut concerne précisément la période où ce snapshot manque.

### A4-7 — Un refus Grbl après un pas accepté par HTTP disparaît du suivi

- **Gravité : à corriger.**
- **Phrase :** Le serveur solde un pas refusé sans publier son résultat d’échec à Préparer.
- **Scénario :** Pas envoyé, réponse HTTP réussie, puis `error:15` ou `error:8` et deux rapports Idle → les commandes redeviennent disponibles, mais l’avis reste « envoyé à la machine » avec l’état `confirmed`.
- **Preuve :** `src/server/services/touch/motion.js:463–468` répond immédiatement ; `plate-probe.js:159–162` mémorise l’erreur ; `motion.js:335–339 → :477–478` supprime le suivi sans résultat d’échec. Le continu traite pourtant ce cas à `:649–653`. Côté page, `examples/cncjs-touch/touch/real-motion.js:247–254 → :267–272 → :235` conserve le message d’envoi.
- **Correction proposée :** Publier le résultat du pas et son code Grbl avant de libérer `pending`, puis afficher ce résultat.
- **Fichiers :** `motion.js`, `real-motion.js`, tests associés.
- **Journal :** aucun.
- **Lots :** exposition par `86154aad` et `71499952`.

« Envoyé » reste littéralement vrai. Le défaut est l’absence de refus visible, pas une affirmation textuelle que le déplacement a été exécuté.

### A4-8 — Le correctif de progression laisse afficher 100 % pendant Run

- **Gravité : à corriger.**
- **Phrase :** La nouvelle branche exclut précisément le cas où toutes les lignes sont acquittées.
- **Scénario :** Programme entièrement acquitté, machine encore Run, `received=total`, `finished=false` → Suivi affiche 100 % sans appliquer le plafond à 99.
- **Preuve :** `src/server/lib/Sender.js:328`, `:365–370` termine l’acquittement ; `src/server/controllers/Grbl/GrblController.js:502–504`, `:991–1007` attend encore le repos physique. `job-service.js:1279–1281` transmet les compteurs bruts. `examples/cncjs-touch/touch/job-dashboard.js:271` produit 100 ; `:278` exige `p<100` pour appliquer le nouveau calcul.
- **Correction proposée :** Faire dépendre le plafond de la fin confirmée par le serveur, indépendamment du pourcentage acquitté.
- **Fichiers :** `job-dashboard.js`, test d’intégration du tableau de suivi.
- **Journal :** aucun ; correction du pourcentage citée après T15.
- **Lot :** `0cb5d90a`.

`test-motion-estimate.cjs:132–140` teste seulement la fonction pure. Son assertion de plafond ne prouve pas que le tableau l’appelle dans ce cas.

### A4-9 — Relancer le même programme réutilise son temps précédent

- **Gravité : à corriger.**
- **Phrase :** `runTrack.active` survit à une fin normale suivie du redémarrage du même programme.
- **Scénario :** Première exécution de 60 s, fin normale, nouveau départ sans rechargement → la deuxième exécution utilise immédiatement les secondes accumulées pendant la première.
- **Preuve :** `examples/cncjs-touch/touch/job-dashboard.js:275` force 100 à la fin ; `:278–280` place la remise à zéro dans la branche `p<100`, donc non exécutée. La clé de `:279` ne distingue pas les exécutions. `src/server/services/touch/job-service.js:1823–1831` redémarre le programme sans changer sa révision.
- **Correction proposée :** Réinitialiser sur une nouvelle exécution ou une transition de départ, et traiter la fin hors de la branche conditionnée par le pourcentage.
- **Fichiers :** `job-dashboard.js`, tests de rejeu du même programme.
- **Journal :** aucun.
- **Lot :** `0cb5d90a`.

### A4-10 — La progression peut employer l’estimation d’une autre version du fichier

- **Gravité : à corriger.**
- **Phrase :** Le nouveau calcul valide l’aperçu sur le seul nom du fichier.
- **Scénario :** Aperçu A de `piece.nc`, durée 10 s ; chargement d’une version B du même nom, durée 100 s → l’interface signale une autre empreinte, mais calcule encore la progression avec A.
- **Preuve :** `examples/cncjs-touch/touch/job-dashboard.js:137–143` conserve l’aperçu lorsque le nom reste identique. `job-controls.js:263–273` marque l’identité comme différente sans supprimer `cncPreview`. Le calcul ajouté à `job-dashboard.js:279–282` vérifie seulement `pvRun.file===c.name`. Un contrôle de révision et d’empreinte existe déjà à `:812–822`.
- **Correction proposée :** Réutiliser la validation d’identité du programme chargé avant d’employer son estimation.
- **Fichiers :** `job-dashboard.js`, tests d’identité de l’aperçu.
- **Journal :** aucun.
- **Lot :** `0cb5d90a`, pour la nouvelle barre de progression.

### A4-11 — Les refus du bloc restent partiellement français en EN/ES

- **Gravité : à corriger.**
- **Phrase :** Certains refus ne portent aucun code traduisible ; d’autres injectent des paramètres français dans les modèles traduits.
- **Scénario :** Course inconnue → « Palpage refusé : course $130 inconnue. » en EN/ES ; alarme sans numéro → phrase traduite contenant `inconnue`.
- **Preuve :** `src/server/services/touch/motion.js:203–204 → block-probe.js:425–428` construit un refus libre. Même problème à `block-probe.js:323–326`. Les paramètres français viennent de `:459`, `:499`, `:606`, `:625–628`, `:674`. `examples/cncjs-touch/touch/i18n.js:44–61` insère ces paramètres sans les traduire.
- **Correction proposée :** Coder tous les refus et représenter les valeurs inconnues par un état structuré traduit côté page. Tester les réponses réellement produites, pas seulement la présence des modèles.
- **Fichiers :** `block-probe.js`, `probe-real.js`, catalogues i18n, tests des erreurs.
- **Journal :** T6, T7 et restes ouverts du § 3.
- **Lot :** `1cbf488d`.

### A4-12 — S38 ne distingue pas un rapport de deux après `ok`

- **Gravité : à corriger.**
- **Phrase :** S38 peut réussir si le garde est affaibli de deux rapports à un seul.
- **Scénario :** Remplacer mentalement `+2` par `+1` dans l’attente ; le retrait de 2 mm à 500 mm/min dure 24 ms dans le faux Grbl, mais S38 masque les rapports pendant 200 ms → le premier rapport visible arrive déjà après le retrait.
- **Preuve :** `src/server/services/touch/plate-probe.js:203` porte le seuil ; `src/server/services/touch/__tests__/block-probe.test.js:35 → :241` accélère les mouvements dix fois ; `:367–376` émet les rapports par pas de 50 ms. S38, à `:1267–1279`, vérifie seulement le résultat final, les lignes et l’absence de chevauchement.
- **Correction proposée :** Injecter séparément `ok`, premier Idle et second Idle. Après le premier, affirmer explicitement qu’aucune ligne suivante n’est partie. Le mutant `+1` doit échouer.
- **Fichiers :** `src/server/services/touch/__tests__/block-probe.test.js`.
- **Journal :** aucun ; reste ouvert explicite du § 3.
- **Lot :** `1cbf488d`.

### A4-13 — Le faux Grbl ne représente pas les anomalies déterminantes de la carte

- **Gravité : à corriger.**
- **Phrase :** Le modèle de validation impose la cohérence des décalages que le terrain contredit.
- **Scénario :** Vouloir conserver G54 dans `$#` tout en rapportant un WCO nul après `$H` → impossible avec le modèle actuel, qui utilise le même décalage pour le rapport et l’exécution.
- **Preuve :** `src/server/services/touch/__tests__/block-probe.test.js:111–124` calcule WPos depuis `g.offset()` ; `:168–180` utilise ce même objet pour les cibles ; `:206–214` le renvoie dans `$#`. Le homing à `:311–315` ne perturbe pas le décalage. Le reset à `:133–143` ne remet pas MPos à zéro. Le moteur à `:264–302` n’applique aucune limite `$130–132`.
- **Correction proposée :** Séparer décalages mémorisé, exécuté et rapporté. Introduire les pannes de terrain demandées au § 4.5 et faire tourner les cas de sûreté dessus.
- **Fichiers :** faux Grbl de `block-probe.test.js`, éventuel modèle partagé.
- **Journal :** T2, T3.
- **Lot :** `1cbf488d`.

C’est un défaut de preuve. Il n’invalide pas les vérifications géométriques nominales du modèle.

### A4-14 — S27 annonce plusieurs refus qu’il ne demande pas réellement

- **Gravité : mineur.**
- **Phrase :** S27 vérifie surtout des raisons affichées, alors que son titre annonce le refus effectif de plusieurs actions.
- **Scénario :** Un chemin d’action accepte un chargement ou un jog malgré une raison de refus correcte dans le snapshot → S27 peut rester vert.
- **Preuve :** `src/server/services/touch/__tests__/block-probe.test.js:1090–1105` vérifie les textes `loadReason`, `macroReason`, `jogReason`. Seuls les deux `prepare` de palpage sont réellement appelés à `:1101–1102`. La commande système annoncée n’est pas assertée.
- **Correction proposée :** Appeler chaque opération annoncée, vérifier son rejet et l’absence d’écriture machine supplémentaire.
- **Fichiers :** `src/server/services/touch/__tests__/block-probe.test.js`.
- **Journal :** aucun.
- **Lot :** `1cbf488d`.

## Restes ouverts et pistes demandées

### `G38.3` sans contact : dépendance plus large que le seul échec d’une touche

Sur une **touche**, `block-probe.js:804–805` rejette `PRB result=0`. Aucun zéro n’est alors écrit. Le serveur tente un `G0` de nettoyage à `:1051–1057` et exige un nouveau test de contact à `:439–441`.

Mais les **cinq trajets XYZ de liaison, descente et retour** à `:945–958` utilisent `watch()`. Celui-ci exige exactement un PRB avec `result=0` à `:843–850`. Un XYZ réussi dépend donc lui aussi du comportement sans contact, même lorsque ses trois mesures trouvent correctement le bloc.

Le faux Grbl impose ce résultat à `block-probe.test.js:301`. **La compatibilité avec la vraie carte reste non vérifiée ; ce n’est pas un défaut firmware démontré.**

### Bilan des pistes 4, 5, 6 et 11

| Piste | Verdict |
|---|---|
| **4 — `$#`, repère actif et cibles `G38.3`** | Confirmée : A4-1. |
| **5 — Frontière exacte et tolérances** | Confirmée au code : A4-5. Effet précis sous `$J` non vérifié. |
| **6 — Plaque sans les gardes du bloc** | Confirmée, mais héritée. Le bouton existait avant ces lots ; `1cbf488d` ajoute surtout le défilement et le focus vers sa carte. |
| **11 — Relais de Suivi et écran de préparation** | Le relais existe, mais aucun défaut n’est prouvé par le seul masquage du bouton source. L’écran de préparation est volontairement masqué sur la page réelle. |

Pour la **plaque**, le risque dépasse la formulation initiale :

- `plate-probe.js:58–124 → :237` n’exige ni référence ni contrôle de course. Avec MPos Z = −120, WPos Z = 0 et recherche 30, il peut envoyer une cible machine −150.
- `job-service.js:2107–2122` notifie seulement les déplacements et le bloc lors de la fermeture du flux. La plaque poursuit sa séquence si les réponses série arrivent.
- `plate-probe.js:207–209 → :271–279` libère le verrou sur timeout sans hold/reset. Un `G38.2` retenu par un Hold externe peut subsister après l’abandon logiciel.
- L’attente `plate-probe.js:179–214` ne surveille ni le changement de démarrage ni le pilote. Son garde ne vérifie pas non plus G94, contrairement au bloc.

Ces défauts restent à traiter, mais ne constituent pas de nouvelles régressions attribuables aux six commits.

Pour la **piste 11**, `job-dashboard.js:32–38` relaie vers des gestionnaires qui n’exigent pas que Fichiers soit visible (`job-controls.js:579–582`). Le masquage de `probe-preparation-open` à `probe-ui.js:311` accompagne la suppression documentée du banc fictif sur la page réelle.

### Commit `3049a0e4`

Le changement est `W_MAX=10 → 28`, utilisé par `block-probe.js:300–301`, puis par le contrôle de fenêtre à `:904–907`. Aucun défaut arithmétique supplémentaire n’est démontré.

Le test ajouté à `block-probe.test.js:557–560` vérifie seulement la fenêtre, le déplacement latéral et l’enveloppe calculée. Il ne rejoue pas un cycle géométrique démarrant à 20–28 mm du bord.

## Soupçons

- **Jog pendant une prise d’origine annoncée, avant son premier rapport Home.** `job-service.js:1117–1121` pose `r.homing`, puis envoie `$H`. `motion.js:361–393` ne consulte pas ce verrou. Avec un dernier rapport encore Idle, un pas peut donc être envoyé sur la position précédente. Le garde page à `real-motion.js:123` agit après réception du snapshot. L’émission concurrente est établie ; l’acceptation ou le refus réel par la carte reste inconnu.
- **Nettoyage G0 non confirmé.** `block-probe.js:1051–1058` envoie directement `G0`, puis libère le verrou sans attendre son acquittement. S40 attend même ce G0 après transfert du pilotage (`block-probe.test.js:1301–1317`). Un scénario concret de refus laissant le mode précédent n’a pas été suffisamment établi.
- **Contrat « deux rapports Idle ».** `plate-probe.js:175–177` annonce deux rapports au repos. La condition à `:203` compte deux rapports supplémentaires, mais vérifie seulement le dernier état Idle. Un Run puis un Idle suffit. Aucun mouvement incorrect causé par cette différence n’a été démontré.

## Non vérifié

- Aucun test exécuté, aucune simulation lancée, aucun rendu navigateur ou geste tactile vérifié.
- Aucun comportement validé sur la Surface, la RT, la liaison série ou Grbl ESP32.
- Restent notamment inconnus : décalage réellement exécuté après `$H`, frontière exacte des limites sous `$J`, comportement réel de `G38.3` sans contact, décélération et chronologie matérielle des resets.
- Les changements ont été examinés commit par commit, avec lecture approfondie des chemins cités. Les longs tests et documents inchangés ont été consultés selon les dépendances utiles, sans nouvelle revue générale du dépôt.
- Aucun défaut supplémentaire prouvé dans le clavier partagé, le branchement du pavé numérique ou les changements CSS/cache à cette révision.
- `resume.js`, `backlight.js`, `program-check.js` et `api.touch.js` sont inchangés sur l’intervalle. Leurs chemins pertinents ont été consultés ; les problèmes anciens sans aggravation démontrée n’ont pas reçu de nouvel identifiant A4.
- Les scénarios de tests proposés ci-dessus sont des tests **à écrire**, non des résultats obtenus.

