# V2 — Contre-vérification des constats de la page (phase 2, 2026-11-15)

Agent « contre-vérification : page ». Base : `feat/refonte-ui` à `20aeac36` (code de page identique à `3049a0e4`). Aucun fichier existant modifié. Un seul fichier de test ajouté, non commité : `examples/cncjs-touch/test-bughunt-V2-1.cjs` (preuve de A4-8, A4-9 et A4-10 ; ce n'est pas un nouveau constat).

Méthode : chaque chemin relu dans le code, de bout en bout ; chaque test de preuve relancé seul et relu ; recherche active d'une garde ailleurs, d'une décision documentée, d'un fait de la carte. Tests relancés, un par un : `test-bughunt-A2-1, -2, -4, -5, -6, -7, -8, -9` (tous échouent comme annoncé), `bughunt-A2-3.test.js` (2 échecs sur 2), `test-bughunt-A2-10.cjs` dans Edge sans tête (échoue ; capture vue ; aucun `msedge` « cnc-browser-run » resté ouvert), `test-bughunt-V2-1.cjs` (échoue, 3 cas).

« Suite » : **page** = correction de page indépendante de l'organisation des écrans (peut se faire tout de suite) ; **refonte** = mieux traitée par la refonte (composant « refus avec son bouton », écran réorganisé…) ; **serveur** = la cause est côté serveur.

## Tableau

| Id | Verdict | Gravité | Suite | En une phrase |
|---|---|---|---|---|
| A2-1 | confirmé | sécurité machine | page (défense) + serveur D1 | Confirmer s'active sur la case seule face à un « HORS COURSE » prouvé ; le serveur ne refuse pas non plus (A1-1). |
| A2-2 | doublon de A1-2 et A1-3 | sécurité machine | serveur | Faux « hors course » (T3) et faux « dans la course » : cause entièrement serveur ; rien à changer dans la page. |
| A2-3 | confirmé avec réserve | à corriger | refonte | Un même refus de palpage rejoué laisse l'écran Sonde identique, Palper… actif. |
| A2-4 | confirmé | à corriger | refonte (D4) | « Diagnostic de l'entrée » ne montre ni les étapes ni l'état du test de contact exigé par le serveur. |
| A2-5 | confirmé | à corriger | refonte (L3) | La carte de la plaque disparaît de Suivi dès que le serveur refuse, sans raison écrite. |
| A2-6 | confirmé avec réserve | à corriger | refonte ; (c) page | Boutons actifs sur l'appareil qui ne pilote pas ; refus renvoyé au bandeau ; refus périmé jamais effacé. |
| A2-7 | confirmé avec réserve | bloquant | serveur (A1-8) puis page | En alarme après un redémarrage de CNCjs, Relire est offert grisé ; la sortie est une chaîne de trois commandes en texte. |
| A2-8 | confirmé | à corriger | page (assistant) ; refonte (bandeau, macros) | Un refus de `prepareCommand` est muet dans l'assistant, et invisible hors Fichiers / Suivi ailleurs. |
| A2-9 | confirmé avec réserve | à corriger | page | « Reprendre à une ligne » vise la sélection de la bibliothèque, pas le programme arrêté. |
| A2-10 | confirmé | bloquant | page | Pause dont la reprise est refusée : Suivi dit seulement « Travail en pause. » (vérifié dans Edge). |
| A2-11 | confirmé | mineur | page + serveur | Refus du palpage au bloc restés en français en EN / ES ; « choisissez inconnu ». |
| A2-12 | confirmé | mineur | refonte (L3) | `screen-probe-preparation` construit et chargé sur la page réelle, inaccessible. |
| A2-13 | confirmé avec réserve | mineur | refonte | Le refus de Sonde reste affiché après un déplacement qui en a changé la cause. |
| A2-14 | confirmé | mineur | page | Le pavé numérique ne peut pas vider un champ facultatif. |
| A2-15 | confirmé | mineur | page | « Macros… » grisé sans raison visible quand il n'y a aucune macro. |
| A2-16 | confirmé avec réserve | mineur | refonte | Rapides grisés sans raison ; la raison de l'arrêt broche n'est même pas publiée par le serveur. |
| A2-17 | confirmé | mineur | page | Deux gabarits de codes que le serveur n'émet jamais. |
| A2-18 | confirmé avec réserve | mineur | page | La cause d'un refus de prise de main serait remplacée par « touchez Pilote… » ; inatteignable aujourd'hui. |
| S1 | non tranché | (sécurité machine si vrai) | page | Relais par `click()` vers des boutons cachés et `inert` : non vérifié sur Chromium 106 (RT). |
| S2 | non tranché | — | — | Bascule v1 → v2 pendant une saisie. |
| S3 | réfuté | sans objet | refonte (P8) / IDEES | Arrêter ne fait pas de reset en alarme au repos ; l'aide « Reset au PC » est exacte (impasse sur une carte standard, sans objet sur la LUNYEE qui redémarre seule). |
| S4 | confirmé | mineur | refonte (L2) | L'assistant de mise en service s'ouvre seul sur tout navigateur neuf (mémoire locale). |
| S5 | réfuté | sans objet | — | La reprise passe par un dialogue à case : un double toucher n'envoie rien. |
| S6 | réfuté | sans objet | — | Le ticket `set-origin` est un `r.ticket` lié au flux : `ticketPending` le compte. |
| A4-6 | confirmé avec réserve | mineur | page + serveur | En EN / ES, l'erreur HTTP d'un palpage échoué perd « origine inchangée / refaire $H » ; Sonde le redit dès le premier instantané. |
| A4-7 | confirmé | à corriger | serveur puis page | Un pas refusé par Grbl (`error:15`) après un HTTP accepté reste « envoyé à la machine ». |
| A4-8 | confirmé | à corriger | page | Suivi affiche 100 % pendant Run dès que toutes les lignes sont acquittées (cas exact que `0cb5d90a` voulait corriger). |
| A4-9 | confirmé avec réserve | mineur | page | Le temps d'une exécution est réutilisé par la suivante — seulement si le PC relance le même programme chargé. |
| A4-10 | confirmé | mineur | page | L'estimation d'un aperçu d'une autre version du fichier pilote la barre. |
| A4-11 | doublon de A2-11 | mineur | page + serveur | Même défaut que A2-11. |
| RQ-1 | réfuté (décision documentée) | sans objet | refonte | Pause pendant un palpage au bloc = arrêt définitif : décidé (`PROMPT-PALPAGE-XYZ.md:64`) et dit après coup ; le libellé est à revoir dans la refonte. |
| RQ-2 | réfuté | sans objet | — | `zeroZ` absent de la liste de la page : sans effet (dialogue fermé à la perte du flux ; le serveur refuse). |
| RQ-3 | réfuté | sans objet | — | `load` sans flux : ne déplace rien ; le départ reste lié au flux. Hors page. |
| RQ-4 | réfuté | sans objet | — | `open` d'un port déjà ouvert ne fait que rejoindre (`CNCEngine.js:286-291`) ; voir A3-5. |
| RQ-5 | réfuté (ergonomie) | sans objet | refonte | Gestes incohérents : sujet de la refonte, pas un défaut. |
| RQ-6 | confirmé | mineur | serveur | Commentaire d'en-tête de `motion.js` périmé (pas jusqu'à 100 mm). |
| RQ-7 | doublon de A2-5 (+ extension) | mineur | refonte (P8) | La carte plaque = A2-5 ; « Reprendre à une ligne » masqué sans raison en plus. |
| RQ-8 | confirmé | mineur | page | « ↻ Actualiser » créé puis caché sur la page réelle (code mort). |

Nouveaux défauts : aucun au-delà des constats existants. Les éléments neufs de cette vérification sont des précisions de portée (A4-8 casse précisément le cas visé par `0cb5d90a` ; A4-9 n'est atteignable que par le PC ; A2-18 n'est pas atteignable depuis la page ; S1 porte sur Pause / Arrêter du bandeau sous un dialogue).

---

## Fiches

### A2-1 — Confirmer actif sur un « HORS COURSE » prouvé
- **Verdict** : confirmé. **Gravité** : sécurité machine tant que D1 n'est pas côté serveur ; ensuite, la part de page tombe à « à corriger ».
- **Relu** : `job-controls.js:559` (le contrôle n'est qu'affiché par `CNCProgramCheckView.show`) → `:584` (`disabled=!checked||!confirmable()`) → `:282-293` (`ticketAllowed` lit `canStart`, jamais le verdict) → `:589` (envoi). Serveur : `job-service.js:1725-1737` joint le contrôle « as a warning » (décision F2, que D1 remplace) ; `canStart` ignore le verdict.
- **Test** : réaliste (cas T2 sur machine référencée, Z vérifiable). Sortie : « Confirmer enabled … true · start requests sent: 1 ».
- **Réfutation cherchée** : aucune autre garde sur le chemin (ni page, ni serveur). La décision F2 « avertissement » est explicitement remplacée par D1.
- **Avec D1 côté serveur** : `prepare start` est refusé ; `prepare()` rend `{opened:false}` et `command()` écrit le refus dans `#job-feedback` / `#home-job-feedback` (visible : Démarrer est dans Suivi). Le dialogue ne s'ouvre plus : le danger disparaît. Restent pour la page : le refus lisible avec sa cause chiffrée et son remède, et le second geste de dérogation.
- **Correction recommandée** : (1) défense en profondeur, page seule : si le ticket (ou à défaut `current.programCheck`) porte un axe `outside` et que le ticket ne porte pas le drapeau de dérogation, Confirmer reste grisé, avec « Hors course : <cause chiffrée> ». (2) Dérogation : un bouton distinct (« Démarrer quand même… »), qui redemande un ticket avec le champ de dérogation que le serveur journalise ; le dialogue l'affiche en rouge. `unknown` reste un avertissement. Fichiers : `job-controls.js`, `program-check-view.js`. Tests à adapter : `job-service.test.js:2292` côté serveur (A1-1) ; aucun test de page n'exige Confirmer actif sur `outside` (vérifié par recherche de `outside` dans les `test-*.cjs` du dialogue).
- **Suite** : page (défense en profondeur), puis composant « refus avec son bouton » pour la dérogation (refonte L5).

### A2-2 — Contrôle des courses sur le WCO rapporté
- **Verdict** : doublon de A1-2 (décalage non recoupé avec `$#`) et A1-3 (axes à bit `$23` jamais vérifiés). **Gravité** : sécurité machine.
- **Relu** : `job-service.js:1353-1376` → `program-check.js:519-525`, `:568-576`. Test Jest relancé : « X unknown · Y unknown · Z outside » puis « Z validated » pour un programme réellement à −135. Réaliste (faits de terrain § 2).
- **Part de la page** : aucune. La page affiche ce que le serveur calcule. Corrigé par D2 + A1-3, plus rien à faire dans la page, sauf A2-1.

### A2-3 — Même refus deux fois : l'écran Sonde ne change pas
- **Verdict** : confirmé avec réserve. **Gravité** : à corriger.
- **Relu** : `probe-ui.js:207-213` (`realRefusal=''`, rendu, puis le même texte) ; `probe-real.js:25-43` (`launchState` ne dépend que de l'instantané : `ready` reste vrai) ; `probe-ui.js:199`.
- **Réserve** : pendant la requête, Palper… est grisé (`realPending`) : un changement bref existe, mais l'état final est identique. Le refus va aussi dans `#job-feedback`, invisible sur Sonde. Test (a) réaliste (refus `ETOUCH_PROBE_TRAVEL`, cas T7).
- **Correction recommandée** : le refus s'affiche à côté du bouton avec l'heure ou « encore refusé (2) », et le remède sur place (`ETOUCH_PROBE_TRAVEL` : dessin de la zone de départ + lien vers les déplacements). Palper… cesse d'être l'action principale tant que la position et le repère n'ont pas changé. Fichiers : `probe-ui.js`, `probe-real.js`. Test existant à garder : `test-probe-real-ui.cjs:66-68` (le refus reste au rapport suivant).
- **Suite** : refonte (composant « refus avec son bouton », L1 / L3).

### A2-4 — Le diagnostic ne suit pas le test de contact
- **Verdict** : confirmé. **Gravité** : à corriger (T6, T9).
- **Relu** : `probe-ui.js:326` (étapes masquées sur la page réelle), `:350` (`probeInput.test` lu seulement dans la signature), `:183` (« ne valide ni le câblage ni un cycle »), `:331`. Le serveur publie `probeInput.test.done` (`block-probe.js:122`).
- **Test** : (b) ne prouve que par une expression régulière, mais la lecture le confirme : aucun texte de l'écran ne dépend de `test.done`. Artefact à ne pas prendre pour un défaut : le titre « contact signalé » après « test fait » vient de la tenue de 1,5 s d'un contact bref (`0cb5d90a`), le test n'avance pas l'horloge.
- **Ce qui le réfute en partie** : l'écran Sonde, lui, change (raison « Test du contact à faire… » remplacée par l'aide de départ).
- **Correction recommandée** (D4, diagnostic guidé) : les trois étapes, alimentées par `probeInput.state` et `probeInput.test`, chacune cochée quand elle est vue ; « Test réussi : revenez à Palper… » avec un bouton retour ; contact permanent depuis plus de quelques secondes → « Contact permanent : broche branchée ou pince sur l'outil ? Débranchez la broche » (T9). Retirer la phrase « ne valide ni le câblage… ». Fichiers : `probe-ui.js`, `probe-model.js`.
- **Suite** : refonte (D4, L3).

### A2-5 — La carte de la plaque disparaît de Suivi
- **Verdict** : confirmé. **Gravité** : à corriger (T11).
- **Relu** : `job-resume.js:154` (`hidden = laser || !(canZeroZ || probing)`), `:159` (le grisé existe déjà mais ne sert jamais, la carte étant masquée) ; `zeroZReason` lu seulement à `job-controls.js:383` et `probe-ui.js:320` (`title`). Test réaliste.
- **Rien côté serveur ne le corrige** : D1-D4 ne touchent pas cet affichage.
- **Correction recommandée** : la carte reste visible au repos et en pause programme (masquée seulement pour un laser et pendant un travail en cours) ; Palper… grisé avec `zeroZReason` en une phrase sous le bouton, et le remède (« Diagnostic de la sonde », « Relire les réglages »…) ; « Dernier palpage échoué » reste visible. Attention à l'attribut `data-v2-form` (`job-resume.js:173`) : une carte toujours visible change la mise en page v2 de Suivi. Tests à adapter, en le disant : `test-job-resume.cjs:85` et `:98` (exigent la carte masquée quand `canZeroZ` est faux).
- **Suite** : refonte (plaque et bloc réunis, L3).

### A2-6 — Pilotage : boutons actifs, refus renvoyé au bandeau, refus périmé
- **Verdict** : confirmé avec réserve. **Gravité** : à corriger (T12).
- **Relu** : `job-controls.js:368-369`, `job-dashboard.js:212-213` (aucune lecture de `pilot`) ; `commissioning.js:501-502`, `job-resume.js:159`, `macros.js:21-34`, `status-strip.js:185` (idem) ; `probe-real.js:29` et `real-motion.js:107` grisent, eux. `job-controls.js:136` (phrase fixe) ; `:431-441` (`followFeedback` ne suit que les réussites) : le texte d'échec reste jusqu'à la commande suivante. Le serveur refuse bien (`control.js:166-169`, `job-service.js:1624-1625`) : aucun danger, seulement une impasse.
- **Réserves** : (1) griser un bouton change son état actif : c'est un changement de garde, à inscrire dans `SURETE.md` (§ 4.5) ; (2) jamais pour Pause, Arrêter, M5 et `jog-stop`, libres pour tous (`job-service.js:169-173`) ; (3) seulement pour `pilot.state==='other'` : « libre » attribue le bail à la première action réussie, et « inconnu » (ancien serveur) ne doit rien griser.
- **Correction recommandée** : une seule fonction de page « bloqué par le pilote » utilisée par tous les boutons gardés : grisé, « Pilotée par X », et sur place « Prendre la main… » qui appelle `openPilot()` (2 touchers, P9). Effacer un refus `ECONTROL` de `#job-feedback` dès que `pilot.state` change. Fichiers : `job-controls.js`, `job-dashboard.js`, `commissioning.js`, `job-resume.js`, `macros.js`, `status-strip.js`. Test existant à adapter : `test-control-attribution.cjs:65-72` touche Charger alors qu'un autre pilote ; captures du harnais `pilote-pris`.
- **Suite** : refonte (composant commun, L1 / L2) ; la partie (c), effacer le refus périmé, est une correction de page indépendante.

### A2-7 — Relire grisé en alarme après un redémarrage de CNCjs
- **Verdict** : confirmé avec réserve : la cause première est serveur (A1-8 : `readSettings` refusé hors Idle, version jamais relue seule). La page applique fidèlement la règle actuelle du serveur. **Gravité** : bloquant (T10).
- **Relu** : `commissioning.js:503` (visible sur ces deux raisons, grisé hors `Idle`), `:473` (la chaîne) ; `real-motion.js:440-441` (même règle codée en dur), `:76` ; serveur `job-service.js:1671-1675`.
- **Avec D4 et A1-8** : relecture automatique de `$I` au repos → la raison « Version Grbl inconnue » disparaît ; relecture acceptée en alarme → mais la page **garde son grisé `activeState!=='Idle'` codé en dur à deux endroits** : sans correction de page, Relire resterait grisé.
- **Correction recommandée** : le grisé de Relire suit le serveur (un champ publié `canReadSettings` / `readSettingsReason`, ou la même règle que le serveur), dans `commissioning.js:503` et `real-motion.js:440` ; la chaîne de trois commandes devient le bloc « Remettre la machine en état » qui enchaîne Déverrouiller → Relire → Prise d'origine sur place (L2). Test de preuve `test-bughunt-A2-6.cjs` à faire passer après A1-8.
- **Suite** : serveur (A1-8) d'abord, puis correction de page indépendante pour le grisé ; la chaîne est mieux traitée par la refonte (L2).

### A2-8 — Refus de préparation muets (assistant, bandeau, macros, « Opération en cours… »)
- **Verdict** : confirmé. **Gravité** : à corriger.
- **Relu** : `commissioning.js:163` (`command(fn)` ne lit que `r.message`), `:187`, `:283`, `:298` (la fonction ne rend même pas la promesse) ; `job-controls.js:683` (`prepareCommand` résout `{opened:false,error}`, ne rejette jamais) ; `:529` (« Opération en cours… » rendu sans être écrit) ; `status-strip.js:117`, `macros.js:29-31`, `job-controls.js:679` (`prepareMacro` jette le résultat). L'écran Machine, lui, suit la réponse (`commissioning.js:442-451`, `answer()`), ce qui réfute le défaut pour Machine seulement.
- **Test** : réaliste (refus `ECONTROL` à l'étape Prise d'origine).
- **Correction recommandée** : dans l'assistant, `command()` rend et lit le résultat : `{opened:false,error}` → la ligne d'état de l'étape affiche `error.message` ; `prepare()` écrit aussi « Opération en cours… » dans `#job-feedback`. Bandeau (Déverrouiller…) et macros : le refus à côté du bouton touché. Fichiers : `commissioning.js`, `job-controls.js`, `status-strip.js`, `macros.js`.
- **Suite** : correction de page indépendante pour l'assistant et `prepare()` ; refonte (composant « refus avec son bouton ») pour le bandeau et les macros.

### A2-9 — La reprise à une ligne vise la sélection, pas le programme arrêté
- **Verdict** : confirmé avec réserve. **Gravité** : à corriger (risque machine : mauvais programme).
- **Relu** : `shared-library.js:434` (sélection non mémorisée ; au rechargement, le fichier le plus récent) → `job-resume.js:140` → `:55-58` (`suggestedLine` nul si `stoppedFile` diffère) → `:192` (`resumePlan(selection.file, n)`) → `:59-74` (le plan ne nomme pas le fichier). `stoppedFile` est bien le nom de bibliothèque (`job-service.js:539, 1899` ; `job-load.js:244`), donc la comparaison est juste et le défaut est le choix de la cible.
- **Réserves** (filets existants) : Suivi écrit « Sélection différente : … » tant que l'ancien programme est chargé (`job-dashboard.js:326`) ; le dialogue de démarrage final nomme le fichier rechargé (`job-controls.js:555`). Ils ne suffisent pas : la ligne vient de la mémoire de l'opérateur et le plan ne dit pas de quel fichier il parle.
- **Correction recommandée** : quand `stoppedFile` existe et diffère de la sélection, le volet le dit (« Programme arrêté : A ; sélection : B ») et propose « Reprendre A à la ligne N » par défaut ; le plan commence par le nom du fichier. Fichier : `job-resume.js` (`job-load.js` peut rester tel quel : la reprise est un chargement explicite et nommé).
- **Suite** : correction de page indépendante.

### A2-10 — Pause dont la reprise est refusée : « Travail en pause. »
- **Verdict** : confirmé (relancé dans Edge sans tête, capture : bandeau « Repos », « Travail en pause. », Reprendre… grisé, aucune raison). **Gravité** : bloquant (P8).
- **Relu** : `job-dashboard.js:315` (même phrase pour toute pause) ; la raison ne va que dans `#file` (masqué) et `#job-reason` (Fichiers) ; `job-resume.js:19-27` ne couvre que M0, M1, M6 et l'erreur Grbl ; Reprendre du bandeau masqué quand `canResume` est faux (`status-strip.js:184`).
- **Réserve de mesure** : rendu v1 seulement (la fixture n'est pas éligible v2) ; `#home-job-ready` est le même élément en v2, mais non contrôlé.
- **Correction recommandée** : dans la phrase d'état de Suivi, `workflow==='paused' && !canResume && resumeReason` → la raison du serveur traduite (`uiLocale.message`), ton « warn », plus « Arrêter » mis en avant ; garder « Travail en pause. » quand la reprise est possible. Un `canResume` faux passager (Hold:1 en décélération) affichera sa raison quelques instants : acceptable. Aucun test existant n'exige la phrase exacte (recherche faite). Fichier : `job-dashboard.js`.
- **Suite** : correction de page indépendante.

### A2-11 — Morceaux en français dans les refus du palpage (EN / ES)
- **Verdict** : confirmé. **Gravité** : mineur (opérateur francophone ; « choisissez inconnu » en français n'arrive que sur une course entre deux rapports, la page refusant déjà un repère actif inconnu, `probe-real.js:34`).
- **Relu** : `block-probe.js:324` et `:428` (refus sans code), `:459, 499, 606, 625, 628, 674` (`'inconnue'` / `'inconnu'`) ; `i18n.js:51-66` (`format` insère la valeur telle quelle ; en FR, le message du serveur passe avant le gabarit). Test réaliste.
- **Correction recommandée** : deux codes nouveaux pour les refus de course (ambiguë, hors course supposée) avec leurs valeurs ; `null` pour une valeur inconnue (les crochets `[...]` des gabarits l'effacent déjà) ; lignes FR / EN / ES au catalogue. Fichiers : `block-probe.js`, `i18n-messages-machine.js`.
- **Suite** : correction indépendante (serveur + catalogue de la page).

### A2-12 — Écran de préparation du palpage inaccessible
- **Verdict** : confirmé. **Gravité** : mineur (code et poids morts ; aucun effet machine). Décision documentée de masquer l'entrée (A4) : le masquage est voulu, la construction ne l'est pas.
- **Relu** : `probe-ui.js:51-53` (construit), `:258` (seul accès), `:311` (masqué) ; `index.html:152` charge aussi `probe-preparation.js`.
- **Correction recommandée** : ne pas construire l'écran ni charger `probe-preparation.js` sur la page réelle ; **ne pas** le retirer de `probe-ui.js` : `simulation.html` (page du PC, exclue de la tablette) s'en sert. Fichiers : `probe-ui.js`, `index.html`, `touch-shell.js:19`.
- **Suite** : refonte (L3).

### A2-13 — Refus de Sonde périmé
- **Verdict** : confirmé avec réserve : garder le refus aux rapports suivants est un choix testé (`test-probe-real-ui.cjs:65-68`) pour un état inchangé ; le défaut n'existe que quand la position ou le repère a changé. **Gravité** : mineur.
- **Correction recommandée** : retenir la position machine et le repère au moment du refus ; dès qu'ils changent (au-delà de 0,01 mm), marquer le refus « ancien » ou l'effacer. Le test existant (même position) reste vert.
- **Suite** : refonte (composant « refus avec son bouton »).

### A2-14 — Le pavé ne vide pas un champ
- **Verdict** : confirmé (`numeric-pad.js:27, 116-117` ; `inputmode none`). **Gravité** : mineur : on peut toujours saisir une autre valeur valide, et D4 (valeurs par défaut du profil) réduit le besoin.
- **Correction recommandée** : une option `optional:true` dans les règles du pavé : un brouillon vide est alors accepté et écrit `''` ; refus inchangé pour les champs obligatoires. Fichiers : `numeric-pad.js`, `probe-ui.js:299-300`. Contrôler `test-numeric-pad*.cjs`.
- **Suite** : correction de page indépendante.

### A2-15 — Macros… grisé sans raison
- **Verdict** : confirmé (`macros.js:21-22`, raison seulement dans la feuille). **Gravité** : mineur.
- **Correction recommandée** : masquer le bouton quand le serveur ne publie aucune macro (le plus simple, cohérent avec « Rien n'est masqué sans raison » puisqu'il n'y a rien à offrir), ou le laisser actif pour ouvrir la feuille qui dit pourquoi. **Suite** : page.

### A2-16 — Rapides grisés sans raison ; M5 masqué
- **Verdict** : confirmé avec réserve. Rapides : `rapidOverrideReason` publié (`job-service.js:1319`) mais lu par aucun fichier de la page réelle ; la note est vidée (`job-dashboard.js:231`). M5 : `spindleStopReason` n'est **pas publié** par le serveur (seulement `canSpindleStop`, `:1334`) ; et masquer M5 quand la broche ne tourne pas est voulu. Pendant une pause par feed hold, M5 est refusé (`job-service.js:931-933`) et masqué, mais l'avertissement « la broche tourne toujours » est affiché. **Gravité** : mineur.
- **Correction recommandée** : écrire `rapidOverrideReason` (traduit) dans `#home-rapid-note` quand les rapides sont grisés ; pour M5, publier la raison côté serveur avant d'afficher quoi que ce soit.
- **Suite** : refonte (principe 4), avec un petit ajout serveur pour M5.

### A2-17 — Gabarits morts
- **Verdict** : confirmé (recherche dans `src/` et `touch/`). Précision : `ETOUCH_RESUME_FEED_MODE` est dans `i18n-messages-machine.js:78`, `ETOUCH_RESUME_TOOL_OFFSET_ACTIVE` dans `i18n-messages.js:1065` (pas les deux dans le premier). **Gravité** : mineur.
- **Correction** : retirer les deux lignes ; le test « chaque code a sa phrase et son bouton » (§ 9) le contrôlera. **Suite** : page.

### A2-18 — Refus de prise de main remplacé par « touchez Pilote… »
- **Verdict** : confirmé avec réserve : le chemin existe (`job-controls.js:168 → 136 → 258`), mais il n'est **pas atteignable depuis la page** : le seul refus `ECONTROL` de `takeover` est le motif de moins de 3 caractères (`control.js:222-224`), et la page grise déjà le bouton sous la même règle (`job-controls.js:225`, même `trim()` des deux côtés, `control.js:61`). Seul un test simulé le déclenche (`test-control-attribution.cjs:105-106`). **Gravité** : mineur (était « à corriger »).
- **Correction recommandée** : pour l'opération `control`, afficher `data.message` (ou son code) ; adapter `test-control-attribution.cjs:106` en le disant. **Suite** : page.

### Soupçons d'A2

- **S1 — Relais `click()` vers des boutons cachés et `inert`** : non tranché. La spécification HTML ne fait arrêter `click()` que par un contrôle désactivé, pas par `inert` ; Edge 157 déclenche bien (vérifié par A2, et par les mesures U5 de `TESTING.md:96`). **Enjeu** : sous un dialogue, Pause et Arrêter du bandeau passent par `#job-pause` / `#job-stop`, rendus `inert` (`strip-guard.js:36-44` les laisse dans une branche inerte) ; si Chromium 106 (RT) ne déclenchait pas, Pause et Arrêter seraient muets sous un dialogue : sécurité machine sur la RT. Pour trancher : ouvrir `refonte/A2/inert.html` dans un Chromium 106 (portable ou la RT, pas par moi). Correction sûre et indépendante, quoi qu'il en soit : appels directs (`cncJobControls.pause()` / `stop()` exposés) au lieu de `click()` sur des boutons cachés.
- **S2 — Bascule v1 → v2 en pleine saisie** : non tranché. `tablet-profile.js:258-268` ne regarde ni dialogue, ni pavé, ni feuille ; la bascule n'a lieu qu'au repos, une fois, juste après la connexion. Pour trancher : étape du harnais qui ouvre le pavé (ou un dialogue Démarrer…) en v1, puis rend la machine éligible v2.
- **S3 — Aide d'alarme qui renvoie au PC** : réfuté. En alarme au repos, Arrêter n'est ni offert (`canStop` faux, `job-service.js:1310-1313`) ni accepté (« Aucun travail à arrêter », `:1919-1921`) : la tablette ne peut pas faire ce reset, l'aide est exacte. Reste une impasse sur une carte standard (alarme critique : `[MSG:Reset to continue]`, `FIRMWARE.md:66`) ; sur la LUNYEE, la carte redémarre seule et `recall()` (`job-controls.js:415-417`) retire alors le code et son conseil. Un bouton « Réinitialiser la carte » serait une nouvelle fonction : `IDEES.md`.
- **S4 — Assistant ouvert seul sur un navigateur neuf** : confirmé par lecture (`commissioning.js:118-121`, `:507-510` : mémoire `localStorage` par navigateur et par port). Mineur : rien n'est envoyé à l'ouverture. Refonte L2 (l'état de mise en service mérite d'être tenu par le serveur, comme le type de machine).
- **S5 — Deux refroidissements de 600 ms** : réfuté : Reprendre… ouvre un dialogue à case, rien ne part sans Confirmer.
- **S6 — Ticket `set-origin` et rotation du flux** : réfuté : `set-origin` fait partie de `COMMISSIONING` (`job-service.js:1156`), son ticket est un `r.ticket` portant `transportId` (`:1694-1701`), que `ticketPending` compte (`:2086-2091`).

### A4-6 — Avertissements perdus dans l'erreur HTTP (EN / ES)
- **Verdict** : confirmé avec réserve. **Gravité** : mineur (était « à corriger »).
- **Relu** : `block-probe.js:1058-1069` (message complet et `out.blockProbe`) → `api.touch.js:75-82` (ni `blockProbe` ni le message complet en dehors du français) → `job-controls.js:147` → `i18n.js:51-66` (en EN / ES, le gabarit du code seul).
- **Réserve** : la ligne fautive est `#job-feedback` (Fichiers / Suivi). Sur Sonde, où l'opérateur se trouve, `#probe-message` vient de l'instantané (`probe-real.js:79-96`, `failureText` traduit avec « origine inchangée » et « refaites $H ») ; si le flux est coupé, `command()` relit l'état par HTTP aussitôt (`job-controls.js:515`). Le français n'est pas touché.
- **Correction recommandée** : `api.touch.js` transmet `blockProbe: {failure, written, needsHoming}` quand l'erreur le porte ; `serverRefusal` utilise alors `CNCProbeReal.failureText`. **Suite** : correction indépendante (serveur + page).

### A4-7 — Pas refusé par Grbl, toujours « envoyé »
- **Verdict** : confirmé par lecture. **Gravité** : à corriger (réaliste : `error:15` d'un `$J=` au bord de la course, `FIRMWARE.md` R3, et A4-5).
- **Relu** : `motion.js:463-468` (réponse immédiate), `:335-339` (le pas refusé est soldé sans résultat publié), à comparer avec `:649-653` (le continu publie « refusé ») ; page `real-motion.js:247-254` (« envoyé à la machine », état `confirmed`) puis `followStep` (`:262-268`) qui libère sans rien dire.
- **Correction recommandée** : le serveur publie le résultat du dernier pas (`motion.lastStep: {id, result, error}`) avant de libérer ; la page, si ce pas est le sien, remplace « envoyé » par « refusé par la carte (error:15 : hors course) ». **Suite** : serveur, puis correction de page indépendante.

### A4-8 — 100 % pendant Run
- **Verdict** : confirmé, avec un test : `test-bughunt-V2-1.cjs` (a) donne « 10 % » à 10 s d'un programme de 100 s, puis « 100 % » en Run dès que toutes les lignes sont acquittées. **Gravité** : à corriger : c'est précisément le cas visé par `0cb5d90a` (« 100 % only at the server's end ») : un programme court avalé par le tampon de l'ESP32.
- **Relu** : `job-dashboard.js:271` (p = 100), `:278` (`p<100` exclut le calcul au temps) ; `motion-estimate.js:440` plafonnerait à 99. Le texte « Toutes les lignes acquittées — attendre la fin des mouvements » (`:302`) est juste ; seul le chiffre ment.
- **Correction recommandée** : en Run (non `finished`), appliquer le calcul au temps même quand p = 100 (plafond 99) ; 100 % seulement avec `finished` ou la fin avec erreurs. Tests à garder : `test-dashboard.cjs:15, 18, 41` (fins à 100 %). **Suite** : page.

### A4-9 — Temps réutilisé d'une exécution à l'autre
- **Verdict** : confirmé avec réserve. **Gravité** : mineur.
- **Réfuté pour la tablette** : un second départ sans rechargement est refusé (`job-service.js:765-766`, « Rechargez le fichier… »), et un rechargement tire une nouvelle révision (`job-load.js:230`), qui est dans la clé `runKey` : le suivi repart de zéro. La réserve d'A4 (remise à zéro en `idle`) ne joue pas : la fin affiche 100 % et saute la branche.
- **Reste** : le PC relance le même programme chargé (même révision). Prouvé par `test-bughunt-V2-1.cjs` (b) : 1 s après la relance, 20 % au lieu de 1 %.
- **Correction recommandée** : remettre `runTrack` à zéro à toute transition vers `running` depuis un état non `running` (ou sortir la remise à zéro de la branche `p<100`). **Suite** : page.

### A4-10 — Estimation d'une autre version du fichier
- **Verdict** : confirmé, avec un test : `test-bughunt-V2-1.cjs` (c) : version chargée `bb`, aperçu `aa` gardé sous le même nom, la barre affiche 50 % au lieu de 80 %. **Gravité** : mineur : le calcul reste plafonné par les lignes acquittées.
- **Relu** : `job-dashboard.js:137-143` (l'aperçu n'est relu que si le nom change), `:279-282` (seul `pvRun.file===c.name`), alors que `samePreview` (`job-controls.js:263`) et `ofLoaded` (`job-dashboard.js:812-816`) comparent aussi l'empreinte.
- **Correction recommandée** : n'utiliser l'estimation que si `samePreview` / `ofLoaded` l'accepte (nom, et empreinte quand les deux sont connues). **Suite** : page.

### A4-11
Doublon de A2-11 (mêmes lignes, même cause, même correction). Gravité retenue : mineur.

### Remarques en passant de COMMANDES-MACHINE.md
- **RQ-1** : réfuté comme défaut. Décision documentée (`PROMPT-PALPAGE-XYZ.md:64`, `job-service.js:1836-1840` : « A block probe cannot be resumed »), et la réponse le dit (`block-probe.js:1076-1077`). M5 n'est pas offert pendant un palpage : la broche ne tourne pas et doit être débranchée (§ 2). À contester dans la refonte : pendant un palpage, ne montrer qu'« Arrêter le palpage » (un reset peut faire perdre la référence sur la LUNYEE, `FIRMWARE.md` E-1 / E-3).
- **RQ-2** : réfuté, sans effet : à la perte du flux, `unavailable()` incrémente la génération et ferme le dialogue (`job-controls.js:300-306`) avant toute confirmation ; le serveur refuse de toute façon (`job-service.js:1634-1641`). Harmoniser la liste (`job-controls.js:502`) est cosmétique.
- **RQ-3** : réfuté (hors page) : `load` ne déplace rien ; le départ exige un ticket lié au flux.
- **RQ-4** : réfuté : `open` d'un port déjà ouvert ne fait que rejoindre la salle (`CNCEngine.js:286-291`) ; un port fermé n'a plus de travail à protéger. Le vrai risque est A3-5 (fermeture par le PC).
- **RQ-5** : réfuté comme défaut ; c'est de l'ergonomie (refonte, principe 9 : « actions dangereuses à part »).
- **RQ-6** : confirmé, mineur : `motion.js:11-13` dit « 0.01/0.1/1/10 mm », `STEPS` va jusqu'à 100 (`:37`). Fichier serveur.
- **RQ-7** : doublon de A2-5 pour la plaque. Extension confirmée : « Reprendre à une ligne » est masqué sans raison quand `canLoad` est faux (alarme, chargement…) (`job-resume.js:140, 166`), ce que P8 rencontre. Mineur ; refonte (P8).
- **RQ-8** : confirmé, mineur : `app.js:151-160` crée le bouton, `ui-2027.css:189` cache `#status-bar` sur la page réelle.

## Ce qui disparaît quand le serveur est corrigé (D1 à D4)
- **D1** : A2-1 n'est plus atteignable (le dialogue ne s'ouvre pas pour un dépassement prouvé) ; restent la dérogation et le refus lisible.
- **D2 + A1-3** : A2-2 disparaît entièrement.
- **D4 (relecture de `$I`) + A1-8** : la moitié « version inconnue » de A2-7 disparaît ; le grisé codé en dur de Relire, lui, reste à corriger dans la page.
- **D3** : rien dans ce périmètre.
- Aucun autre constat de page n'est corrigé par le serveur seul.

## Ce que je n'ai pas vérifié
- Rien sur la vraie machine, la Surface Pro ou la RT. Chromium 106 non testé : S1 reste ouvert, avec un enjeu de sécurité sur la RT.
- A2-10 vu seulement en rendu v1 (fixture non éligible v2). Les autres constats ont été relancés sur DOM synthétique, sans navigateur.
- A4-7 est prouvé par lecture, pas par un test. A4-6 aussi.
- S2 non reproduit. S4 jugé par lecture seule.
- Je n'ai lancé ni la suite Jest entière, ni le harnais complet, ni les tests existants voisins : la liste des tests « à adapter » vient de la lecture (recherche dans `test-*.cjs`), pas d'une exécution avec les corrections.
- Les causes serveur (A1-1, A1-2, A1-3, A1-8) ne sont pas re-vérifiées ici au-delà des chemins cités : c'est le rôle de la contre-vérification du serveur.
