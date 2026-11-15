# Évaluation ergonomique de l'interface actuelle (phase 1, mesure « avant »)

Date : 2026-11-15. Branche `feat/refonte-ui` à `c35c9587` (code de page = `3049a0e4`, cache `v2u`). Agent : évaluation ergonomique (Fable 5.2).

Sources : le code de `examples/cncjs-touch/touch/` (les chemins `x.js:n` ci-dessous sont relatifs à ce dossier), `PERFORMANCE-UI-SPEC.md`, `design/v2/PERFORMANCE-V2-USAGE.md`, `BUGHUNT-MAP.md` (recoupée, pas crue), et les captures du harnais du 14 novembre (dossier `…/scratchpad/palpage/harnais-final/`, cité « capture `screens-…` ») avec le fichier `.json` de chaque capture (identifiants, tailles et écarts des cibles).

Ce document décrit, compte et classe. Il ne propose aucune organisation. Ce qui n'a pas été vérifié est listé au § 7.

Convention de comptage : un **toucher** = un appui sur une cible de la page (bouton, case, champ, option). La **saisie de chiffres** au pavé numérique est comptée à part (une saisie = les chiffres d'une valeur) ; ouvrir le champ et toucher « Valider » sont des touchers. Les appuis sur les flèches de déplacement ne sont pas comptés (ils dépendent de la distance). Toute commande machine passe par un dialogue de confirmation qui coûte **3 touchers** (le bouton « …», la case à cocher `#job-check`, `#job-confirm`, dans les 15 s : `job-controls.js:24-26, 538, 584`) ; un zéro de travail coûte 2 touchers (bouton, puis `#real-motion-origin-confirm`).

---

## A. Tableau des parcours (tablette CNC, rendu v2, 1366 × 911)

| Parcours | Touchers (nominal) | Saisies de chiffres | Écrans traversés | Impasses | Cible du § 5.3 |
|---|---:|---:|---|---:|---|
| **P1** Mise en route | **6** (10 si CNCjs a redémarré : détour `$X` → « Relire » → `$H`) | 0 | 2 (Menu, Machine) + 1 dialogue | **3** | sans aide |
| **P2** Fichier | **3** (4 pour lire le verdict de course, après chargement) | 0 | 2 (Fichiers, arrivée sur Suivi) | **2** | savoir tout de suite s'il tient |
| **P3** Origine au bloc, première fois | **35** + le détour de positionnement (≥ 3 + flèches) + 1 geste physique (test du contact) | **9** | 3 (Préparer, Sonde, Profils de sonde à 3 onglets) + pavé × 9 + 1 dialogue | **5** | guidé par des dessins |
| **P4** Origine au bloc, fois suivantes | **6** (5 si « XYZ » est resté choisi) + 1 geste physique si le test a plus de 10 min ; positionnement en plus | 0 | 2 (Préparer, Sonde) + 1 dialogue | **3** | ≤ 4 |
| **P5** Zéro Z à la plaque | **3** depuis Suivi, **4** d'ailleurs (5 + 1 saisie la première fois) | 0 (1 la première fois) | 1 (Suivi) + 1 dialogue | **3** | ≤ 3, au même endroit que le bloc |
| **P6** Zéros à la main | **4** + flèches pour un axe ; 3 pour « Zéro XYZ » ; **impossible** pour « axe = origine machine » | 0 | 1 (Préparer, 2 états) + 1 dialogue | **2** | — |
| **P7** Contrôle et départ | **9** (départ 3, pause 1, reprise 3, arrêt 1, une correction d'avance 1) | 0 | 1 (Suivi) + 2 dialogues | **2** | dépassement dit en clair avant |
| **P8** Après une alarme en travail | **12** (Arrêter 1, prise d'origine 4, reprise à la ligne 4, départ 3) | 0 (ligne proposée) | 2 (Machine, Suivi) + 2 dialogues | **5** | suite donnée dans l'ordre |
| **P9** Pilotage | **3** pour prendre la main (0 quand « Libre ») | 0 | 0 + 1 dialogue | **2** | 2 |
| **P10** Sonde qui ne répond pas | **3** pour atteindre le diagnostic, qui ne guide rien | 0 | 3 (Préparer, Sonde, Diagnostic) | **1** (totale) | diagnostic guidé |

En v1 (même page, autre rendu) : P1 est toujours fait en v1 ; P4 et P6 coûtent 1 toucher de moins (les flèches sont visibles dès l'entrée dans Préparer) ; P7 coûte 2 touchers de moins pour une correction de broche ou de rapides (les trois rangées sont sur Suivi) ; les autres comptes sont identiques. Détail au § 2.

## B. Les 12 problèmes les plus graves pour cet opérateur

Classés par gravité (debout, doigts poussiéreux, ne lit pas, ne connaît pas Grbl). « Principe n » renvoie au § 5.2 du prompt, « Tn » au journal du 14 novembre.

1. **Le dépassement de course n'est dit qu'au dernier moment, en coordonnées machine, sous un compte à rebours de 15 s, et « Confirmer » reste possible.** Rien dans Fichiers ni dans Suivi (`programCheck` n'est lu ni par `shared-library.js` ni par `job-dashboard.js`) ; il n'apparaît que dans le dialogue de départ (`job-controls.js:559-562`) sous la forme « Contrôle des courses (pas une simulation de collisions) : HORS COURSE » + « Hors course Z : −150,8 → −125,0 mm machine (course −130 → 0). » (`program-check-view.js:33-34`, `i18n-messages.js:1087`), sans remède ; la case cochée suffit à activer `#job-confirm` (`job-controls.js:584`). Principes 7 et 3 ; T2, T15.
2. **Après une alarme ou un arrêt, l'écran ne guide pas la remise en route.** L'aide dit « Carte sans réponse : Reset dans CNCjs au PC … ($X) … ($H) » (`grbl-help.js:8-9`) ; « touchez Arrêter » n'est écrit que sur Machine (`commissioning.js:469`) ; rien ne dit si l'origine de la pièce est encore valable ; « Reprendre à une ligne… » est sur un autre écran et masqué sans sélection. 12 touchers sur 2 écrans, 5 impasses. Principes 10 et 3 ; T3.
3. **L'origine de la pièce est éclatée sur trois endroits, et l'écran de palpage n'a pas de flèches.** Zéro Z à la plaque dans Suivi (`job-resume.js:100-108`), palpage au bloc dans Préparer → « Sonde » (`probe-ui.js:30`), zéros à la main dans Préparer derrière « Déplacer la machine… » en v2 (`job-preparation.js:337-338`) ; placer l'outil au-dessus du bloc oblige à quitter Sonde ; « Zéro d'un axe à l'origine machine » n'existe pas. Principes 2 et 1 ; T4, T13.
4. **Le profil de sonde part vide : 35 touchers et 9 saisies avant le premier palpage XYZ.** Aucune valeur par défaut (`probe-model.js:7`), huit nombres dont deux décalages signés, un coin exigé même pour Z (`probe-model.js:27`), trois onglets, les manques annoncés un par un avec un autre nom que le libellé du champ (`probe-real.js:32`, `probe-model.js:6`). Principes 6 et 8 ; T5.
5. **Les refus renvoient ailleurs par une phrase, sans bouton sur place, et certains boutons restent actifs alors que le serveur refusera.** « Faites la prise d'origine dans Machine » (`real-motion.js:453`), « touchez Pilote (bandeau) » (`real-motion.js:107`, `probe-real.js:29`), « touchez Connecter la CNC dans le Menu » (`real-motion.js:105`), « choisissez le contrôleur dans Fichiers » (`connect-cnc.js:60, 82`) ; refus du palpage écrit en `#probe-message` sous un bouton resté actif (`probe-ui.js:199, 207-213`) ; « Démarrer… » vert alors qu'un autre appareil pilote (capture `screens-home-v2-911-fr-sombre-cnc-pilote-pris`). Principe 3 ; T6, T7, T12.
6. **Des éléments disparaissent sans raison affichée.** Carte de la plaque (`job-resume.js:154`), « Reprendre à une ligne… » (`job-resume.js:140, 166`), « Relire les réglages » (`commissioning.js:412, 503` ; `real-motion.js:365`), barre « Connecter la CNC » (`connect-cnc.js:95`), ligne d'état des déplacements en v2 (`origin-preview.css:47`), corrections de broche et de rapides rangées dans un volet en v2 (`job-dashboard.js:618`). Principe 4 ; T10, T11.
7. **L'écran ne suit pas l'ordre du travail et ne dit jamais l'étape suivante.** Rail : Menu, Préparer, Fichiers, Suivi, Machine, Journal, Réglages (`touch-shell.js:46`) ; tuiles : Suivi, Fichiers, Préparer, Machine, Journal, Réglages (`touch-shell.js:35`) ; ordre réel : Machine → Fichiers → Préparer → Suivi. La page s'ouvre sur le Menu (`touch-shell.js:315`). Aucun indicateur « machine référencée » n'existe (seul le message négatif de Préparer, `real-motion.js:453`). Principe 1.
8. **Deux organisations pour la même page, et celle qu'on obtient dépend de l'instant où la page s'ouvre.** Préparer et Suivi n'ont pas la même structure en v1 et en v2 (§ 1.5). Une session qui a vu une alarme ou une prise d'origine avant le premier repos reste en v1 jusqu'au rechargement (`tablet-profile.js:309-310` ; rejoué dans le VM de `test-v2-gate.cjs`, § 7) : après une mise en route normale (port ouvert → Alarme → `$H`), la tablette CNC reste donc en v1. Principes 1 et 2.
9. **Le langage est celui du développeur et de Grbl, sur le chemin même de l'opérateur.** `$X`, `$H`, `$$`, `$23`, `$130–$132`, `G54`, `G10 L20 P1 X0`, « acquitté », « rapport frais », « empreinte », « hypothèse X Y », « Sans champ Pn, un rapport récent vaut libre » : sur les boutons de Machine, dans chaque dialogue, dans les refus. Principe 5.
10. **Le test du contact est exigé mais pas guidé, et le diagnostic de la sonde est une page en lecture seule.** « Test du contact à faire : touchez l'outil avec le bloc puis relâchez… Ouvrez Diagnostic de l'entrée. » ; l'écran ouvert dit « Ce diagnostic ne valide ni le câblage ni un cycle de palpage » (`probe-ui.js:183`) ; un contact permanent donne « La sonde est déjà en contact : dégagez-la avant de palper. » (serveur, `src/server/services/touch/plate-probe.js:116`), jamais la pince ni la broche. Principes 3 et 10 ; T6, T9.
11. **Chaque commande coûte trois touchers et une lecture.** Bouton, case à cocher, « Confirmer » en 15 s, avec un paragraphe différent par commande (`job-controls.js:190-201`). Un palpage répété coûte 6 touchers pour une cible de 4 ; une séance complète enchaîne au moins cinq de ces dialogues (prise d'origine, palpage, départ, reprise, etc.). Principe 6 (tâches fréquentes).
12. **Suivi est surchargé et ses messages vivent dans une fenêtre défilante.** En v2, les messages, « Reprendre à une ligne… » et la carte de la plaque partagent une zone de 235 px qui défile (`infoSlot` de la capture `screens-home-v2-911-fr-sombre-cnc-repos` : 472 → 707 px ; dans la capture `…-pilote-pris`, « Reprendre à une ligne… » pousse « Palper le zéro Z… » jusqu'à 722 px, sous le bord de la zone). En v1 à 1366 × 768 avec la carte de la plaque, « Démarrer… » passe sous le pli (capture `screens-home-v1-768-fr-clair-cnc-repos`, `scrolls: true`). Cibles serrées : « Zéro X / Y / Z » à 1 px d'écart en v2, « Arrêter le palpage » à 10 px de « Palper… ». Principe 9, tailles.

---

## 1. Carte de l'existant

### 1.1 Cadre commun

- **Bandeau** `#real-banner` (72 px, `status-strip.js`) : mot d'état `#t-state` (Repos, En cours, Pause, Alarme N, Prise d'origine, Palpage, Déplacement, Porte ouverte, Rapport ancien, État perdu, Hors ligne : `status-strip.js:124-139`), âge du rapport `#t-fresh`, Broche `#t-spindle`, Avance `#t-feed`, Machine `#t-machine`, Fichier `#t-file`, messages `#t-messages`, **Pilote** `#t-pilot`, **Déverrouiller…** `#t-unlock`, **Reprendre…** `#t-resume`, **Pause** `#t-pause`, **Arrêter** `#t-stop`, cadenas `#t-lock` (`screen-lock.js:24`), horloge. Les quatre boutons d'action n'existent qu'à l'état qui les appelle (`status-strip.js:183-186`).
- **Rail** `#tabbar` (88 px, `touch-shell.js:46-50`) : Retour (seulement sur un sous-écran, `touch-shell.js:203`), Menu, Préparer, Fichiers, Suivi, Machine, Journal, Réglages. Boutons sans `id` : `button.ks-nav[data-ks-screen="…"]`. Quand « Retour » apparaît, les sept autres boutons descendent d'un cran (Menu passe de y = 80 à y = 168 ; captures `screens-probe-…`).
- **Toast « pourquoi »** `#ks-why` (`touch-shell.js:278-298`) : un appui sur un bouton désactivé affiche 4 s son `title`, son `data-reason`, sinon la première ligne `role="status"` de l'écran, sinon « Indisponible dans l'état actuel de la machine. ».
- **Dialogue de confirmation** `#job-dialog` (`job-controls.js:21-26`) : titre, cible, bloc de contrôle des courses `#job-program-check`, note `#job-note`, avertissement `#job-warning`, case `#job-check`, compte à rebours, « Annuler » `#job-dismiss`, « Confirmer » `#job-confirm`.
- **Page d'arrivée** : toujours le Menu (`touch-shell.js:315`), avec la barre « Reprendre où j'en étais : … » `#ks-resume` si un autre écran a été mémorisé.

### 1.2 Écrans (16 sections, dont 1 inaccessible)

| Écran (id) | Titre affiché | On y arrive par | On en sort par | Construit par |
|---|---|---|---|---|
| `screen-menu` | Menu (6 tuiles + barre de connexion + barre de reprise) | ouverture de la page ; rail « Menu » | une tuile `button.ks-tile[data-ks-tile]`, le rail | `touch-shell.js:29-41`, `connect-cnc.js` |
| `screen-jog` | Préparer — « Déplacer et définir l'origine » | rail « Préparer » ; tuile « Préparer » | rail ; « Sonde » | `index.html:46-76`, `real-motion.js`, `job-preparation.js` (v2), `origin-preview.js` (v2) |
| `screen-files` | Fichiers | rail ; tuile | rail ; « Charger et ouvrir le Suivi » `#job-load` (va à Suivi) ; « Ouvrir le suivi → » | `shared-library.js`, `projects.js`, `touch-shell.js:135-150` |
| `screen-home` | Suivi | rail ; tuile ; après un chargement ; ouverture automatique au départ d'un travail (`job-follow.js`) ; « Zéro Z avec plaque → Suivi » de Sonde | rail | `job-dashboard.js`, `job-resume.js`, `job-follow.js` |
| `screen-machine` | Machine — « Contrôleur CNCjs » | rail ; tuile | rail ; « Ouvrir le suivi → », « Réglages d'affichage → », « Limites de la machine → », « Journal des événements → », « Mise en service… » | `index.html:99-104`, `commissioning.js:398-420`, `touch-shell.js:170-187`, `machine-limits.js` (v2) |
| `screen-history` | Journal | rail ; tuile ; Machine → « Journal des événements → » | rail | `session-journal.js`, `real-history.js` |
| `screen-settings` | Réglages (3 onglets : Affichage, Machine et performances, Système ; défile) | rail ; tuile ; Machine → « Réglages d'affichage → » | rail ; « Guide d'utilisation » | `display-settings.js`, `system-monitor.js` et 8 autres |
| `screen-limits` | Limites | Machine → `#ks-machine-limits` | rail « Retour » | `machine-limits.js:6` |
| `screen-commissioning` | Mise en service (assistant, 9 étapes) | Machine → « Mise en service… » ; Réglages → « Lancer l'assistant » ; **s'ouvre seul** la première fois qu'un port réel est vu depuis Menu ou Suivi (`commissioning.js:508-509`) | rail ; « Passer l'assistant… » | `commissioning.js:131` |
| `screen-guide` | Guide d'utilisation | Réglages → `#display-guide` | rail « Retour » | `interface-guide.js:5` |
| `screen-probe` | Sonde : palpage, profils et diagnostic | Préparer → « Sonde » (`.probe-entry`, sans id, `touch-shell.js:158`) ; volet « Comprendre l'origine » → « Ouvrir la sonde » | rail « Retour » ; « Zéro Z avec plaque → Suivi » `#probe-zero-z` | `probe-ui.js:30-37` |
| `screen-probe-profile` | Profils de sonde (3 onglets) | Sonde → `#probe-profiles` | « Retour au palpage » `#probe-profile-back` ; rail « Retour » | `probe-ui.js:39-45` |
| `screen-probe-contact` | Diagnostic de l'entrée sonde (lecture seule) | Sonde → `#probe-test` | « Retour au palpage » `#probe-contact-back` | `probe-ui.js:46-47, 319-331` |
| `screen-probe-report` | Résultats du palpage | Sonde → `#probe-result` (inactif tant qu'aucun palpage n'a eu lieu) | « Retour au palpage » | `probe-ui.js:48-49` |
| `screen-probe-transfer` | Sauvegarde des profils · RÉEL | Sonde → `#probe-transfer-open` | « Retour au palpage » | `probe-ui.js:57-59` |
| `screen-probe-preparation` | Préparation du palpage | **inaccessible sur la page réelle** : son bouton est masqué (`probe-ui.js:311`) et aucun autre lien n'y mène | — | `probe-ui.js:51-53` |

### 1.3 Volets (11) et dialogues (10)

Un volet (`cncShell.sheet`, `touch-shell.js:115-121`) se ferme par « Fermer × », Échap ou un changement d'écran.

| Volet (id) | Titre | Ouvert par | Contenu |
|---|---|---|---|
| `ks-file-info` | Détails du fichier et de l'aperçu | Fichiers → « Détails de l'aperçu » | note de l'aperçu, « régénérer », état, **choix du contrôleur `#job-port`** (`touch-shell.js:135-137`) |
| `ks-dimensions` | Dimensions du parcours XY | Fichiers → « Dimensions XY » | étendue XY |
| `ks-upload` | Ajouter un fichier à la bibliothèque | Fichiers → « + Ajouter un fichier » | envoi d'un fichier |
| `ks-preparation` | Préparer le travail | Fichiers → `#ks-preparation-open` ; v2 : Préparer → « Contrôle final… » `#pv2-final-open` | liste de 5 étapes (Fichier, Outil et matière, Origine de travail, Vérifications, Prêt à démarrer), deux cases, « Charger la sélection » `#ks-prep-load` (`job-preparation.js:26-98, 159-197`) |
| `ks-origin-help-sheet` | Comprendre l'origine | Préparer → « Aide aux repères » `#ks-origin-info` | 5 paragraphes + « Ouvrir la sonde » |
| `ks-jog-settings-sheet` | Vitesse de déplacement | Préparer → « Vitesse · N mm/min… » `#ks-jog-settings` (v2 : « Vitesse… » `#pv2-tool-speed`) | choix de la vitesse |
| `ks-macros` | Macros CNCjs | Préparer → « Macros… » (inactif sans macro) | liste des macros |
| `ks-machine-help-sheet` | Fonctions de la machine | Machine → « Fonctions disponibles » `#ks-machine-info` | 4 paragraphes |
| `ks-history-export-sheet` | Exporter le journal | Journal → `#ks-history-export` | deux exports |
| `perf-v2-overrides-sheet` (v2) | Broche et rapides | Suivi → « Broche / rapides… » `#home-v2-more-overrides` | corrections de broche et de rapides |
| `perf-v2-time-sheet` (v2) | Ce que le temps indique | Suivi → « Détail du temps » `#home-v2-time-detail` | détail des estimations |

| Dialogue (id) | Ouvert par | Fermé par |
|---|---|---|
| `job-dialog` (confirmation de toute commande machine) | Démarrer…, Reprendre…, Déverrouiller…, Prise d'origine…, Palper…, macro, test de broche, cadrage laser | Annuler, Confirmer, 15 s, Pause / Arrêter du bandeau, changement d'écran |
| `pilot-dialog` | bandeau `#t-pilot` | Fermer, Prendre le pilotage |
| `real-motion-ticket` (« Définir l'origine de travail ») | Zéro X / Y / Z / XYZ | Annuler, Confirmer l'origine, 15 s |
| `t-numpad` (pavé numérique) | tout champ numérique lié (`numeric-pad.js:143`) | Annuler, Valider |
| `t-textpad` (clavier texte) | recherche de fichier, nom de profil, motif de pilotage, fiche projet, Wi-Fi | Annuler, Valider |
| `project-dialog` (fiche projet) | Fichiers → « Ouvrir la fiche » `#project-open` | `#project-dialog-close` |
| `preview-viewer` (vue fixe agrandie) | « Agrandir » (Fichiers, Suivi) | Fermer |
| `pgl-dialog` (vue 3D agrandie, Performance) | « Agrandir » | Fermer |
| `touch-screen-saver` (veille) | inactivité | un toucher |
| bouclier `t-lock-shield` (écran verrouillé) | cadenas `#t-lock` | deux appuis sur le cadenas |

S'y ajoutent des confirmations en place (pas des dialogues) : suppression d'un profil de sonde `#probe-delete-confirm`, changement de langue, « Passer l'assistant », double appui des commandes hôte dans Réglages → Système.

### 1.4 Où se trouve chaque fonction de l'opérateur

| Fonction | Endroit(s), id du bouton | Fichier | Remarque |
|---|---|---|---|
| Connecter la CNC (ouvrir le port) | **Menu seulement** : barre `#ks-connect`, bouton « Connecter la CNC » (sans id, classe `ks-connect-go`) | `connect-cnc.js:19, 35, 95` | visible seulement si le serveur répond et qu'aucune machine n'est rapportée |
| Choisir le contrôleur (si plusieurs ports) | Fichiers → « Détails de l'aperçu » → `#job-port` | `job-controls.js:13`, `touch-shell.js:137` | caché dans un volet nommé « Détails du fichier et de l'aperçu » |
| Prise d'origine | Machine → « Prise d'origine ($H)… » (sans id) ; assistant de mise en service, étape 6 | `commissioning.js:402, 283` | **2 endroits** ; aucun dans le bandeau ni dans Préparer |
| Déverrouiller | bandeau `#t-unlock` ; Machine → « Déverrouiller ($X)… » (sans id) ; assistant | `status-strip.js:117`, `commissioning.js:401, 187` | **3 endroits** |
| Relire les réglages | Machine `#ks-machine-reread` ; Préparer (bouton de `real-motion.js`) ; assistant, étape 2 | `commissioning.js:406-412, 225`, `real-motion.js:365` | **3 endroits**, les deux premiers masqués sauf refus précis, inactifs en alarme |
| Mise en service | Machine → « Mise en service… » ; Réglages → Machine et performances → « Lancer l'assistant » ; ouverture automatique | `commissioning.js:384, 413, 508` | **3 entrées** |
| Choisir un fichier | Fichiers : ligne `button.library-file[data-file]` | `shared-library.js:303` | |
| Charger | Fichiers `#job-load` (« Charger et ouvrir le Suivi ») ; Suivi `#home-job-load` (« Charger la sélection » / « Recharger le fichier ») ; volet Préparer le travail `#ks-prep-load` | `touch-shell.js:149`, `job-dashboard.js:33`, `job-preparation.js:192-193` | **3 endroits** ; les deux derniers relaient un clic vers `#job-load` |
| Préparation guidée (cases Outil, Origine ; vérifications) | volet `ks-preparation` ouvert depuis **Fichiers** (`#ks-preparation-open`) et, en v2, depuis **Préparer** (`#pv2-final-open`) | `job-preparation.js:162-166, 335-336` | **2 entrées**, aucune depuis Suivi ; les cases n'engagent rien |
| Contrôle des courses du programme | dialogue de départ `#job-program-check` ; volet Préparer le travail, étape « Vérifications » ; v2 : Préparer, carte « Course machine… » `#pv2-travel` (estimation XY de la tablette) et carte `#op-card` | `job-controls.js:559-562`, `job-preparation.js:65-70, 463-474`, `origin-preview.js` | **3 ou 4 endroits**, trois sources différentes, aucun dans Fichiers ni dans Suivi |
| Limites de la machine | écran Limites (`#ks-machine-limits`) ; v2 : carte « Paramètres de course » de Machine | `machine-limits.js:6, 32, 104-232` | **en double** en v2 |
| Coordonnées | Suivi (Travail ; Machine en v1 seulement) ; Préparer (tableau Machine / Travail) ; Machine | `index.html:36-43, 48-51, 102` | **3 endroits** |
| Se déplacer (flèches, pas, continu) | Préparer : `.jog[data-axis][data-dir]`, pas `button.step[data-step]` ; en v2 derrière « Déplacer la machine… » `#pv2-jog-open` | `index.html:52-71`, `real-motion.js`, `job-preparation.js:337-338` | absent de l'écran Sonde |
| Vitesse de déplacement | Préparer `#ks-jog-settings` ; v2 : `#pv2-tool-speed`, **hors** du volet de déplacement | `index.html:53`, `job-preparation.js:344` | |
| Zéro d'un axe ici | Préparer `#jog-zero-x`, `#jog-zero-y`, `#jog-zero-z` | `index.html:49-51`, `real-motion.js:280-304` | v2 : visibles seulement dans le volet de déplacement |
| Zéro XYZ ici | Préparer `#jog-zero-xyz` ; v2 : `#pv2-tool-zero`, **hors** du volet de déplacement | `index.html:53`, `job-preparation.js:344`, `real-motion.js:494` | |
| « Poser X Y ici… » (v2) | Préparer `#pv2-set-xy` | `job-preparation.js:327-329` | n'envoie rien : ouvre le volet de déplacement, où il faut toucher Zéro X puis Zéro Y |
| Zéro d'un axe à l'origine machine | **n'existe pas** | — | T13 |
| Zéro Z à la plaque | **Suivi** : carte `#home-plate`, champs `#home-plate-thickness`, `#home-plate-search`, bouton `#home-plate-probe` | `job-resume.js:100-108, 202-210` | raccourci depuis Sonde : `#probe-zero-z` |
| Palpage au bloc Z / X / Y / XYZ | **Préparer → Sonde** : tuiles `[data-probe-operation]`, `#probe-profile`, `#probe-wcs`, `#probe-diameter`, `#probe-start` | `probe-ui.js:30-37, 207-213` | |
| Profil de sonde | Sonde → `#probe-profiles` → écran à 3 onglets, `#probe-save` | `probe-ui.js:39-45, 262-272` | |
| Diagnostic de la sonde | Sonde → `#probe-test` ; assistant de mise en service, étape 5 « Sonde » | `probe-ui.js:46-47`, `commissioning.js:38-46` | **2 tests différents**, non reliés |
| Démarrer | **Suivi seulement** `#home-job-start` (relais vers `#job-start`, caché dans Fichiers) | `job-dashboard.js:27-38` | |
| Pause | bandeau `#t-pause` ; Suivi `#home-job-pause` | `status-strip.js:114`, `job-dashboard.js:33` | **2 endroits** (voulu) |
| Reprendre | bandeau `#t-resume` ; Suivi `#home-job-resume` | `status-strip.js:116` | **2 endroits** |
| Arrêter | bandeau `#t-stop` ; Suivi `#home-job-stop` ; Sonde `#probe-stop` | `status-strip.js:115`, `probe-ui.js:252` | **3 endroits** (voulu) |
| Corrections d'avance | Suivi : `button[data-kind="feed"][data-value]` | `job-dashboard.js:42-51` | actives en travail ou en pause seulement |
| Corrections de broche, de rapides | v1 : Suivi ; v2 : volet « Broche / rapides… » | `job-dashboard.js:613-622` | **différent en v1 et v2** |
| Arrêter la broche (M5) | Suivi `#home-pause-m5` (pause du programme, ou broche qui tourne au repos) | `job-resume.js:85, 163` | apparaît seulement dans ces cas |
| Reprise à une ligne | Suivi `#home-resume-line` → `#home-resume-input`, `#home-resume-check`, `#home-resume-load` | `job-resume.js:88-97, 166-203` | masqué sans fichier **sélectionné** |
| Pilotage | bandeau `#t-pilot` → `#pilot-dialog` (`#pilot-reason-a`, `#pilot-reason-b`, `#pilot-takeover`) | `status-strip.js:49`, `job-controls.js:28-32, 612` | |
| Verrouiller l'écran | bandeau `#t-lock` | `screen-lock.js:24` | |
| Macros | Préparer → « Macros… » | `macros.js:9-12` | |
| Journal, export | Journal ; `#ks-history-export` | | |
| Guide | Réglages → `#display-guide` | `interface-guide.js:31` | |

### 1.5 Différences d'organisation entre v1 et v2

| Écran | v1 Éco (captures `…-v1-768-…`) | v2 Performance (captures `…-v2-911-…`) |
|---|---|---|
| Préparer | deux cartes : coordonnées + pas + « Zéro X/Y/Z » + « Zéro XYZ » + « Vitesse » ; croix de déplacement toujours visible ; ligne d'état `#jog-msg` sous le titre | à gauche la carte « Où le programme se placera » et les cotes ; à droite un résumé **1 · Programme chargé, 2 · Origine X Y, 3 · Origine Z et contrôle final** ; la croix et les coordonnées sont **cachées** jusqu'à « Déplacer la machine… » (`origin-preview.css:45`) ; `#jog-msg` caché en comparaison (`origin-preview.css:47`) ; « Zéro XYZ » et « Vitesse… » hors du volet de déplacement |
| Suivi | aperçu à gauche avec, dessous, les trois rangées de corrections ; à droite : %, coordonnées Travail **et Machine**, avance et broche réelles, ligne d'état, carte de la plaque, Démarrer / Pause, Arrêter | aperçu + bande de légende + bande « Séquence prévue » ; à droite : %, « Ligne acquittée », estimation, coordonnées Travail seules, **une** rangée de corrections (avance) + deux volets, courbe d'avance en travail, zone de messages défilante (messages, reprise, plaque), rangée d'actions fixe, Arrêter |
| Fichiers | liste (4 par page, « Suivant → », « Favoris seulement » en bas) + détail | liste (5, recherche et favoris en haut) + tableau « Sélection / Chargé dans la machine » (version, **dimensions X × Y × Z**, outil, empreinte) + détail |
| Machine | deux cartes | les mêmes + « Condition actuelle » + « Paramètres de course » (double de l'écran Limites) ; les quatre liens sur une ligne |
| Journal | filtres Tout / Erreurs / Travaux / Alarmes, pages | source « Cette session / Serveur », filtres Tous / Commande / État / Connexion, liste défilante |
| Réglages | — | une entrée de plus : « Interface Performance v2 » |
| Sonde et ses sous-écrans, Limites, Mise en service, Guide, Menu, rail, bandeau, dialogues | identiques | identiques (la mise en page v1 dans la fenêtre de 911 px : le tiers bas de Sonde est vide, captures `screens-probe-v2-…`) |

Quel rendu s'affiche : v2 exige Performance + CNC + GPU matériel + fenêtre ≥ 1300 × 880 et un premier état connu **au repos** ; toute activité vue avant (alarme, prise d'origine, travail, broche, déplacement) ferme la v2 pour toute la session de page (`tablet-profile.js:130-134, 309-310` ; `PERFORMANCE-V2-USAGE.md` l. 32). Voir § 7 pour ce qui a été rejoué.

### 1.6 Éléments masqués ou inactifs sans raison affichée sur place

| Élément | Condition | Raison affichée ? | Référence |
|---|---|---|---|
| Carte « Zéro Z avec une plaque » (Suivi) | cachée si `canZeroZ` est faux et qu'aucun palpage n'est en cours (alarme, travail, sonde en contact, réglage inconnu…), et en laser | **non** sur Suivi ; la raison n'existe que comme `title` de `#probe-zero-z`, dans Sonde | `job-resume.js:154`, `probe-ui.js:320` |
| « Reprendre à une ligne… » | caché sauf machine au repos, rapport frais, `canLoad` **et un fichier sélectionné dans Fichiers** | non | `job-resume.js:140, 166` |
| « Relire les réglages ($$) » (Machine, Préparer) | caché sauf refus « réglage inconnu » ou version inconnue ; inactif hors repos | la phrase voisine le nomme, mais en alarme il est inactif | `commissioning.js:503-504`, `real-motion.js:365` |
| Barre « Connecter la CNC » | seulement sur le Menu, seulement si serveur joint et aucune machine | non (ailleurs : « touchez Connecter la CNC dans le Menu ») | `connect-cnc.js:95` |
| Boutons du bandeau (Déverrouiller, Reprendre, Pause, Arrêter) | présents seulement à l'état qui les appelle ; « Déverrouiller… » absent tant qu'un travail est « en cours » en alarme | non dans le bandeau | `status-strip.js:183-186` |
| Rangée Démarrer / Pause (Suivi) | cachée en alarme au repos | l'aide d'alarme prend sa place | `job-dashboard.js:246-247` |
| « Charger la sélection » (Suivi) | caché sans sélection ou pendant un travail | non | `job-dashboard.js:254` |
| Carte des corrections | cachée si le serveur ne publie pas `canOverride` | non | `job-dashboard.js:220` |
| Corrections de broche et de rapides (v2) | dans le volet « Broche / rapides… » ; le conseil « Rapides à 25 % conseillés pour le premier essai » y est aussi | — | `job-dashboard.js:613-622` |
| Ligne d'état des déplacements `#jog-msg` (v2, comparaison) | cachée | non : « Déplacer la machine… » est toujours actif, la raison n'apparaît qu'après l'avoir ouvert | `origin-preview.css:47` |
| « Zéro XYZ », « Vitesse… » (v2, volet de déplacement) | absents du volet ouvert | non | capture `screens-jog-v2-911-fr-sombre-cnc-reel-repos` |
| Vital « Machine » du bandeau | disparaît quand les boutons d'action sont là | — | captures `…-travail`, `…-alarme` |
| Écran « Préparation du palpage » | bouton masqué sur la page réelle | — | `probe-ui.js:311` |
| « Résultats / journal » (Sonde) | inactif tant qu'aucun palpage n'a eu lieu | par le toast seulement | `probe-ui.js:202` |
| « Macros… » | inactif sans macro CNCjs | par le toast seulement | `macros.js:21-22` |

---

## 2. Les dix parcours, toucher par toucher (tablette CNC, 1366 × 911)

Chaque ligne : écran · élément (id) → ce qui s'affiche.

### P1. Mise en route — 6 touchers, 2 écrans, 3 impasses

Rendu : v1 (la v2 ne s'ouvre qu'après un premier repos). Départ : Menu, port fermé.

1. Menu · « Connecter la CNC » (barre `#ks-connect`, `connect-cnc.js:35`) → « Recherche des ports USB… », puis « Ouvrir /dev/ttyUSB0 ? — La carte redémarre : la machine sera en Alarme jusqu'à la prise d'origine ou le déverrouillage. » (`connect-cnc.js:72-75`). Si le port n'est pas celui de la mise en service : une liste de ports (+ 1 toucher).
2. Menu · « Ouvrir » → « Port ouvert, la carte redémarre… », puis la barre disparaît ; bandeau « Alarme » et bouton vert « Déverrouiller… » ; tuile Machine « Alarme ».
3. Rail · « Machine » → mot « Alarme », encadré d'aide, « Déverrouiller ($X)… », « Prise d'origine ($H)… », « Mise en service… ».
4. Machine · « Prise d'origine ($H)… » (`commissioning.js:402`) → dialogue « Lancer la prise d'origine », texte « La prise d'origine ($H) déplace chaque axe jusqu'à ses capteurs. Dégagez la zone de travail. », case, 15 s.
5. Dialogue · `#job-check`.
6. Dialogue · `#job-confirm` → bandeau « Prise d'origine » + « Arrêter », puis « Repos ».

Textes à lire pour avancer : l'indication du port (étape 1), l'avertissement du dialogue. Le mot « prise d'origine » n'apparaît qu'à l'étape 1 et sur l'écran Machine.

Impasses :
- **I1.** Après l'ouverture du port, la seule action offerte hors de Machine est « Déverrouiller… » dans le bandeau (vert, action principale). Le Menu ne dit pas « faites la prise d'origine ». Un opérateur qui déverrouille obtient « Repos » sans référence ; il l'apprend plus tard dans Préparer (« Machine non référencée : pas de 1 mm au plus… », `real-motion.js:453`) ou par un refus de palpage.
- **I2.** Si CNCjs a redémarré, `$H` est refusé : « $H indisponible : Réglage $22 inconnu… Touchez Déverrouiller ($X), puis Relire les réglages ($$), puis $H. » (`commissioning.js:473-476`). Détour de 4 touchers (3 pour `$X`, 1 pour « Relire »), décrit par une phrase à lire. T10.
- **I3.** À l'arrivée au repos, rien ne dit « machine prête » ni « référencée », ni quelle est la suite ; l'opérateur est sur Machine, dont les liens sont « Ouvrir le suivi → », « Réglages d'affichage → », « Limites de la machine → », « Journal des événements → » (pas Fichiers, pas Préparer).

Dépend du serveur (le code de la page ne tranche pas) : si le port est déjà ouvert à l'ouverture de la page, les étapes 1-2 n'existent pas ; le mot d'alarme (avec ou sans code) ; l'ouverture automatique de l'assistant de mise en service si ce port n'a jamais été vu par ce navigateur (`commissioning.js:508`) ; si les déplacements sont permis (`touch.motion.enabled`).

En v1 : c'est le parcours décrit (identique sur la RT).

### P2. Fichier — 3 touchers, 2 écrans, 2 impasses

1. Rail · « Fichiers » → liste et détail du fichier sélectionné.
2. Fichiers · ligne du fichier (`button.library-file`) → tableau « Sélection / Chargé dans la machine » : « Dimensions (aperçu) 90 × 90 × 8 mm », aperçu (2D, Iso, Face, Côté, Dessus), boutons d'outils.
3. Fichiers · « Charger et ouvrir le Suivi » `#job-load` → chargement, puis Suivi : « Fichier chargé, prêt à démarrer. ».

Impasses :
- **I1.** « Savoir tout de suite s'il tient dans la machine » : impossible ici. Aucun verdict de course dans Fichiers ni au chargement, ni sur Suivi à l'arrivée. Pour l'obtenir après le chargement : rail « Préparer » (v2 : carte « Course machine non vérifiée / Dans la course / Hors course », estimation XY de la tablette, Z jamais vérifié) ou Fichiers → « Préparer le travail… » → étape « Vérifications » (le contrôle du serveur, en une ligne de texte) : + 1 toucher et une lecture. T15.
- **I2.** La profondeur n'est pas nommée : c'est le troisième nombre de « Dimensions (aperçu) » en v2 ; en v1 elle n'est que dans la légende de l'image (« Z min −3,00 · Z max 5,00 mm », petits caractères dans l'aperçu) ; le volet « Dimensions XY » ne donne que X et Y. Rien ne la compare à la course ni à l'épaisseur de la pièce.

Textes sur le chemin, sans utilité pour l'opérateur : « Correspondance inconnue : empreinte absente ou non vérifiée. », « fiche d'une autre version », « Aperçu non vérifié par le serveur : régénérez-le depuis le PC. », « Le chargement ne démarre pas le travail. ».

En v1 : mêmes 3 touchers ; pas de tableau de comparaison ni de dimensions.

### P3. Origine au bloc, première fois — 35 touchers, 9 saisies, 3 écrans, 5 impasses

Départ : machine au repos et référencée, profil « Nouvelle sonde » vide, depuis n'importe quel écran.

1. Rail · « Préparer ».
2. Préparer · « Sonde » → écran Sonde : tuiles Z (choisie), X, Y, XYZ ; « Profil de sonde » ; « Repère de travail » ; dessin ; à droite le voyant « Sonde : … », une phrase, « Palper Z… » inactif. Phrase : « Paramètre à renseigner : vitesse d'approche. Ouvrez Profils de sonde. » (la première erreur seulement, `probe-real.js:32`).
3. Sonde · tuile « XYZ ».
4. Sonde · « Profils de sonde » `#probe-profiles` → onglet Géométrie, champs « Non configuré ».
5-10. Géométrie · trois champs (« Épaisseur Z calibrée · mm », « Décalage signé face X − bord pièce · mm », « Décalage signé face Y − bord pièce · mm ») : pour chacun, toucher le champ, saisir au pavé, « Valider » → 6 touchers, 3 saisies.
11. Onglet « Directions ».
12-17. Directions · trois listes (« Coin de montage », « Recherche X », « Recherche Y ») : ouvrir, choisir → 6 touchers.
18. Onglet « Recherche ».
19-28. Recherche · cinq champs (« Première approche · mm/min », « Seconde touche · mm/min », « Recherche maximale par touche · mm », « Retrait entre touches · mm », « Dégagement prévu · mm ») → 10 touchers, 5 saisies.
29. « Enregistrer le profil » `#probe-save`.
30. « Retour au palpage » `#probe-profile-back`.
31-32. Sonde · « Outil / pige · diamètre mm » `#probe-diameter` → 2 touchers, 1 saisie. La phrase devient « Test du contact à faire : touchez l'outil avec le bloc puis relâchez (contact vu, puis libre) avant de palper. Ouvrez Diagnostic de l'entrée. » : geste physique, sans toucher l'écran. Puis « Outil au-dessus du coin extérieur du bloc, pince en place. » (`probe-real.js:45-49`).
33. « Palper XYZ… » `#probe-start` → dialogue « Lancer le palpage XYZ » avec une note de cinq phrases chiffrées (`probe-real.js:60-70`).
34. `#job-check`. 35. `#job-confirm` → « Étape n / 22 · X · approche », barre, puis « Palpage XYZ terminé — Origine G54 écrite. Position de travail : X 0.000 · Y 0.000 · Z 10.000. ».

Détour inévitable et non compté : placer l'outil au-dessus du coin. L'écran Sonde n'a pas de flèches : rail « Retour » → Préparer → « Déplacer la machine… » → flèches → « Sonde » (≥ 3 touchers + les flèches), et « XYZ » reste choisi tant que la page n'est pas rechargée.

Impasses :
- **I1.** « Je rentre quoi ? » : huit nombres sans valeur proposée, sans dessin de ce qu'ils mesurent, deux décalages **signés**, deux notes de développeur (« Bornes de saisie du logiciel, pas des limites machine certifiées. Aucune valeur réelle inventée. », `probe-ui.js:43`). T5.
- **I2.** Les manques sont annoncés un par un, sous un autre nom que le champ (« distance de recherche » pour « Recherche maximale par touche », `probe-model.js:6`) ; le coin est exigé même pour Z (`probe-model.js:27`) ; aucun onglet ne signale qu'il reste des champs vides.
- **I3.** Test du contact : exigé, expliqué par une phrase, sans retour visible autre que le voyant ; « Ouvrez Diagnostic de l'entrée » mène à une page qui dit ne rien valider. T6.
- **I4.** Aucun dessin de la zone de départ : la fenêtre admise n'est donnée qu'en chiffres dans la note du dialogue (« à N mm au plus en retrait des deux faces »). Le dessin de l'écran est « sans échelle ni trajet ». T8.
- **I5.** Un refus du serveur à la préparation (course, repère) s'écrit en `#probe-message`, en texte courant, bouton resté actif (`probe-ui.js:199, 207-213`) : « Palpage refusé : Y irait de −5,9 à 35,9 mm machine, hors de la course… » (`i18n-messages-machine.js:115`). T6, T7.

En v1 : mêmes écrans, mêmes comptes ; le détour de positionnement coûte 1 toucher de moins.

### P4. Origine au bloc, fois suivantes — 6 touchers (cible : 4), 3 impasses

1. Rail « Préparer ». 2. « Sonde ». 3. Tuile « XYZ » (l'écran revient sur Z à chaque rechargement, `probe-ui.js:9`). 4. « Palper XYZ… ». 5. `#job-check`. 6. `#job-confirm`.

Le profil, le diamètre et le profil choisi sont repris (`cnc-touch-probes-v1-real`). S'y ajoutent : le test du contact si le dernier a plus de 10 minutes ou après un palpage échoué (serveur, `src/server/services/touch/block-probe.js:49, 440`), et le positionnement (autre écran).

Impasses : le test du contact (P3-I3) ; le positionnement hors de l'écran (P3) ; le refus peu visible et en coordonnées machine (P3-I5).

Même en supprimant la tuile, le dialogue seul prend 3 des 4 touchers visés.

### P5. Zéro Z seul à la plaque — 3 touchers depuis Suivi (cible : 3), 3 impasses

1. Suivi · « Palper le zéro Z… » `#home-plate-probe` (l'épaisseur et la descente sont reprises du dernier palpage, `job-resume.js:112-114`) → dialogue « Régler le zéro Z avec la plaque ».
2. `#job-check`. 3. `#job-confirm` → « Palpage en cours… Arrêter interrompt. ».

Depuis un autre écran : + 1 (rail « Suivi »). Depuis Sonde : « Zéro Z avec plaque → Suivi » puis les 3. La première fois : + 2 touchers et 1 saisie (l'épaisseur est vide : « Indiquez l'épaisseur de la plaque (mm). »).

Impasses :
- **I1.** Pas « au même endroit que le bloc » : la plaque est dans Suivi, le bloc dans Préparer → Sonde ; le lien n'existe que dans un sens (Sonde → Suivi). T4.
- **I2.** La carte disparaît sans explication dès que le serveur refuse (`job-resume.js:154`). T11.
- **I3.** En v2 la carte est dans la zone de messages défilante (235 px) : son texte d'aide est coupé, et « Reprendre à une ligne… » la pousse sous le bord (capture `…-pilote-pris`) ; en v1 à 768 px elle repousse « Démarrer… » sous le pli.

En v1 : mêmes touchers.

### P6. Zéros à la main — 4 touchers + flèches pour un axe, 2 impasses

1. Rail « Préparer » → vue de comparaison.
2. « Déplacer la machine… » `#pv2-jog-open` → croix, coordonnées, pas.
3. (pas : `button.step`, facultatif) puis flèches.
4. « Zéro X » `#jog-zero-x` → dialogue « Définir l'origine de travail — Repère G54 · X 10.000 → 0 · mm. Aucun axe ne bouge. — Origine X du repère G54 à la position actuelle (G10 L20 P1 X0) ».
5. « Confirmer l'origine X · G54 » `#real-motion-origin-confirm`.

Trois axes un par un : 6 touchers de plus. « Zéro XYZ » : depuis la comparaison, `#pv2-tool-zero` puis confirmer (3 touchers avec le rail) ; depuis le volet de déplacement il faut d'abord « Revenir à la comparaison ». La vitesse (« Vitesse… ») est aussi hors du volet de déplacement.

Impasses :
- **I1.** « Zéro d'un axe à l'origine machine » : aucune commande. T13.
- **I2.** Machine non référencée : « … Prise d'origine dans Machine. » sans bouton ; en v2 cette ligne est cachée tant que le volet de déplacement n'est pas ouvert.

En v1 : rail « Préparer », flèches, « Zéro X », confirmer = 3 touchers + flèches ; « Zéro XYZ » et « Vitesse » sont sur le même écran.

### P7. Contrôle et départ — 9 touchers, 1 écran, 2 impasses

1. Suivi · « Démarrer… » `#home-job-start` → dialogue « Confirmer le démarrage » : fichier · port · machine · pilote ; bloc de contrôle des courses ; avertissement ; case ; 15 s.
2. `#job-check`. 3. `#job-confirm` → « En cours ».
4. Pause : bandeau `#t-pause` (ou `#home-job-pause`) → « Pause », avertissement broche.
5-7. Reprise : `#t-resume` (ou `#home-job-resume`) → dialogue « Confirmer la reprise » → case → Confirmer.
8. Arrêt : `#t-stop` (ou `#home-job-stop`), sans confirmation.
9. Correction d'avance : un bouton `[data-kind="feed"]` (−10 %, −1 %, 100 %, +1 %, +10 %). Broche ou rapides en v2 : « Broche / rapides… » → bouton → « Fermer × » = 3 touchers.

Impasses :
- **I1.** Le dépassement de course n'est dit que dans le dialogue de l'étape 1 (problème n° 1) : titre en majuscules, trois pastilles « X validé · Y validé · Z hors course », puis la raison en coordonnées machine, sans remède, pendant que le compte à rebours court. Un verdict « non vérifié » a la même forme avec une raison de développeur (« Référencement non constaté depuis le dernier redémarrage de la carte ($22=1 signifie activé, pas effectué) : course non vérifiable. », serveur, `src/server/services/touch/program-check.js:471`).
- **I2.** Avant « Démarrer… », Suivi dit « Fichier chargé, prêt à démarrer. » en vert, quel que soit le contrôle des courses (`job-dashboard.js:311`).

En v1 : mêmes comptes ; les trois rangées de corrections sont sur l'écran (1 toucher chacune).

### P8. Après une alarme en plein travail — 12 touchers, 2 écrans, 5 impasses

État : bandeau « Alarme N », « Pause » inactif, « Arrêter » ; Suivi : encadré rouge d'aide, Démarrer et Pause inactifs, carte de la plaque disparue (capture `screens-home-v2-911-fr-sombre-cnc-alarme`).

1. Bandeau · « Arrêter » `#t-stop` → le travail est clos ; « Déverrouiller… » apparaît dans le bandeau ; Suivi affiche « Travail arrêté avant la fin · … · 16 / 25 lignes » et « OK » (capture `…-alarme-arret`).
2. Rail « Machine ». 3. « Prise d'origine ($H)… ». 4. Case. 5. Confirmer → « Repos ».
6. Rail « Suivi ». 7. « Reprendre à une ligne… » `#home-resume-line` → ligne proposée (dernier arrêt moins 15 mouvements, `job-resume.js:179-183`).
8. « Vérifier » `#home-resume-check` → plan en une phrase. 9. « Charger la reprise » `#home-resume-load`.
10-12. « Démarrer… », case, Confirmer.

Impasses :
- **I1.** Aucune liste ordonnée. L'aide est un paragraphe par code d'alarme (`grbl-help.js:7-16`) ; l'ordre « Arrêter, puis… » n'est écrit que sur Machine.
- **I2.** « Carte sans réponse : Reset dans CNCjs au PC. » : l'opérateur n'a pas de PC devant lui ; sur cette carte l'alarme redémarre la carte d'elle-même (§ 2 du prompt), ce que l'écran ne dit pas.
- **I3.** Le bandeau offre « Déverrouiller… » (3 touchers), qui rend « Repos » sans référence ; la prise d'origine, nécessaire ici, est sur Machine.
- **I4.** Rien ne dit si l'origine de la pièce est encore valable après la prise d'origine. T3.
- **I5.** « Reprendre à une ligne… » est absent si aucun fichier n'est sélectionné (page rechargée, autre sélection) : il faut deviner d'aller le sélectionner dans Fichiers.

Dépend du serveur : l'état après « Arrêter » (repos, alarme, carte redémarrée), la présence du code d'alarme (« Alarme 3 déduite »), la ligne d'arrêt connue ou non.

En v1 : identique.

### P9. Pilotage — 3 touchers (cible : 2), 2 impasses

Savoir qui pilote : bandeau `#t-pilot`, « PILOTE — Libre / Cet appareil / nom de l'autre appareil » (ambre si c'est un autre).

1. Bandeau · `#t-pilot` → dialogue « Pilotage de la machine » : « Piloté par « Tablette atelier ». Pause et Arrêter restent possibles depuis cet appareil. », champ de motif, deux motifs prêts.
2. « Opérateur devant la machine » `#pilot-reason-a` (remplit le motif).
3. « Prendre le pilotage » `#pilot-takeover`.

Impasses :
- **I1.** Quand un autre appareil pilote, les boutons restent actifs (« Démarrer… » vert, « Prise d'origine ($H)… » actif : captures `screens-home-…-pilote-pris`, `screens-machine-…-pilote-pris`) ; le refus arrive après le toucher, en texte.
- **I2.** Les refus disent « touchez Pilote (bandeau) pour prendre la main », sans bouton ; `#t-pilot` est une étiquette grise de 96 × 48 px qui ne ressemble pas à un bouton. T12.

En v1 : identique.

### P10. Sonde qui ne répond pas comme prévu — 3 touchers, impasse totale

1. Rail « Préparer ». 2. « Sonde » → voyant « Sonde : contact · signal reçu » (ou « libre », « inconnu »).
3. « Diagnostic de l'entrée » `#probe-test` → « Entrée réelle : contact signalé — Lecture seule des rapports CNCjs existants. Ce diagnostic ne valide ni le câblage ni un cycle de palpage. — … Sans champ Pn, un rapport récent vaut libre. ».

Aucune étape, aucun bouton, aucune hypothèse (pince, fil, broche à débrancher). Contact permanent : « La sonde est déjà en contact : dégagez-la avant de palper. ». Jamais de contact : après l'échec, « Aucun contact en X sur 10 mm : rapprochez l'outil et vérifiez la pince. Origine de travail inchangée. » (capture `screens-probe-v2-911-fr-sombre-cnc-bloc-echec`). Un second test de sonde, différent (voir le contact puis la libération), existe dans l'assistant de mise en service (Machine → « Mise en service… », étape 5) et n'est relié à rien. T9.

En v1 : identique.

---

## 3. Évaluation par principe (§ 5.2)

Gravité : **A** arrête ou met en danger le travail ; **B** oblige à demander de l'aide ; **C** ralentit ou trouble.

### Principe 1 — L'écran suit l'ordre du travail

| Gr. | Manquement | Preuve |
|---|---|---|
| B | Le rail et les tuiles ont deux ordres différents, aucun n'est l'ordre du travail | `touch-shell.js:35, 46` ; capture `screens-menu-v2-911-fr-sombre-cnc-repos` |
| B | Aucune indication de l'étape en cours ni de la suivante ; « Repos » et « Prêt à démarrer » ne disent pas si la machine est référencée ni si l'origine est posée | `status-strip.js:124-139`, `touch-shell.js:239-243` |
| B | La page s'ouvre sur le Menu ; chaque parcours commence par un toucher de navigation | `touch-shell.js:315` |
| B | Le rendu (v1 ou v2) dépend de l'état à l'ouverture de la page | `tablet-profile.js:309-310` |
| C | La seule numérotation d'étapes (1 · 2 · 3 de Préparer v2) commence au programme chargé et ignore la machine ; le volet « Préparer le travail » a cinq autres étapes, ouvert depuis Fichiers | `job-preparation.js:314-335, 26-98` |
| C | Le rail change de géométrie sur un sous-écran (« Retour » en tête, tout descend) | captures `screens-probe-…` |

### Principe 2 — Une fonction, un seul endroit

| Gr. | Manquement | Preuve |
|---|---|---|
| B | Zéros et palpages sur trois écrans (Suivi, Préparer, Sonde) ; pas de flèches dans Sonde | § 1.4 |
| B | Remise en état éclatée : connexion (Menu), prise d'origine et déverrouillage (Machine, bandeau), relecture (Machine, Préparer, assistant), pilotage (bandeau) | § 1.4 |
| B | Contrôle des courses à 3 ou 4 endroits avec trois sources (serveur, estimation de la tablette, aperçu) qui peuvent diverger | § 1.4 |
| C | « Charger » à trois endroits ; préparation du travail dans Fichiers et dans Préparer ; limites en double ; coordonnées à trois endroits ; deux tests de sonde | § 1.4 |
| C | Le choix du contrôleur est dans le volet « Détails du fichier et de l'aperçu » | `touch-shell.js:137` |

### Principe 3 — Aucune impasse

| Gr. | Manquement | Preuve |
|---|---|---|
| A | Départ hors course : dit sans remède, confirmable | `job-controls.js:559-562, 584` |
| B | Refus qui nomment un autre écran sans bouton : Machine, bandeau, Menu, Fichiers, Réglages → Type de machine | `real-motion.js:77-128, 453` ; `probe-real.js:27-41` ; `connect-cnc.js:60, 82` ; `job-preparation.js:59, 81, 95` |
| B | Refus du serveur après le toucher, en texte courant, bouton inchangé (palpage, pilote) | `probe-ui.js:199` ; captures `…-pilote-pris` |
| B | « Reset dans CNCjs au PC », « consultez CNCjs », « Code non reconnu : consulter CNCjs. » | `grbl-help.js:8-9, 62` ; `touch-shell.js:261` ; `index.html:102` |
| B | Diagnostic de la sonde sans suite | `probe-ui.js:183, 331` |
| C | Le toast « pourquoi » retombe sur la première ligne d'état de l'écran, qui peut ne rien avoir à voir avec le bouton touché | `touch-shell.js:283-286` |

### Principe 4 — Rien n'est masqué sans raison visible

Voir le tableau du § 1.6. Gravité **B** pour la carte de la plaque, « Reprendre à une ligne… », « Relire les réglages » et la ligne d'état des déplacements en v2 ; **C** pour le reste.

### Principe 5 — Langage d'atelier

| Gr. | Exemple (là où l'opérateur doit agir) | Preuve |
|---|---|---|
| B | Boutons « Déverrouiller ($X)… », « Prise d'origine ($H)… », « Relire les réglages ($$) » ; sous-titre « Connexion, coordonnées et commandes $X/$H » | `commissioning.js:401-406`, `index.html:100` |
| B | « Hors course Z : −150,8 → −125,0 mm machine (course −130 → 0). » ; « Palpage refusé : Y irait de −5,9 à 35,9 mm machine… » | `i18n-messages.js:1087`, `i18n-messages-machine.js:115` |
| B | « Position machine incohérente avec la course ($23, $130–$132)… », « Données insuffisantes ($23, course, repère ou unités). Z et collisions non vérifiés. » | `real-motion.js:84`, `job-preparation.js:474` |
| B | « Décalage signé face X − bord pièce · mm », « Bornes de saisie du logiciel, pas des limites machine certifiées. Aucune valeur réelle inventée. », « Sans champ Pn, un rapport récent vaut libre. » | `probe-ui.js:41-43, 331` |
| C | « Origine X du repère G54 à la position actuelle (G10 L20 P1 X0) » ; « Ligne envoyée : G10 L20 P1 X0 Y0 Z10 » | capture `screens-jog-v2-911-fr-sombre-cnc-reel-origine` (texte du serveur, `src/server/services/touch/motion.js:1032`), `probe-real.js:104` |
| C | Suivi v2 : « Ligne acquittée », « Acquitté = accepté par Grbl, pas nécessairement usiné. », « Rapportée · rapport frais », « Géométrie inconnue », « Séquences non préparées », « Ordre du fichier, pas heure de début » | `job-dashboard.js:538, 591` ; capture `screens-home-v2-911-fr-sombre-cnc-repos` |
| C | Préparer v2 : « Placement · dessus XY · affichage seul », « Hypothèse : zéro X Y à la position de l'outil. », « Z séparé · validation manuelle. » | `job-preparation.js:300-334` |
| C | Machine : « Âge du rapport machine, distinct de la liaison serveur. Un rapport récent ne garantit pas que le démarrage est autorisé. », « Libre : aucun appareil ne pilote cette machine. La première action réussie d'un appareil le lui attribue. » | `job-controls.js:103` ; capture `screens-machine-v2-911-fr-sombre-cnc-repos` |
| C | Fichiers : « Empreinte », « Correspondance inconnue : empreinte absente ou non vérifiée. » | capture `screens-files-v2-911-fr-sombre-cnc-repos` |
| C | Paragraphes à lire dans chaque dialogue (un par commande) et dans la carte de la plaque (trois vitesses et trois distances) | `job-controls.js:190-201`, `job-resume.js:103` |

Le détail texte par texte relève de l'inventaire `TEXTES.md`.

### Principe 6 — Valeurs par défaut sûres, assistant, derniers choix repris

| Gr. | Manquement | Preuve |
|---|---|---|
| B | Profil de sonde : 11 réglages vides, aucun défaut | `probe-model.js:7` |
| B | Épaisseur de la plaque vide la première fois ; diamètre de l'outil vide | `job-resume.js:113`, `probe-ui.js:8, 19` |
| C | L'opération de palpage revient à « Z » à chaque rechargement | `probe-ui.js:9` |
| C | Motif de prise de pilotage à fournir à chaque fois (deux motifs prêts, mais un toucher) | `job-controls.js:31, 612` |
| C | Chaque confirmation exige la case, y compris pour une commande répétée dix fois par séance | `job-controls.js:584` |

Repris correctement : dernier écran, vitesse et pas de déplacement, épaisseur et descente de la plaque après le premier palpage, profil et diamètre de sonde, repère actif proposé (`probe-ui.js:347-348`).

### Principe 7 — Prévenir avant d'engager

| Gr. | Manquement | Preuve |
|---|---|---|
| A | Course et profondeur non vérifiées au choix ni au chargement du fichier ; verdict au départ seulement | § 2, P2 et P7 |
| A | « Fichier chargé, prêt à démarrer. » en vert indépendamment du contrôle des courses | `job-dashboard.js:311` |
| B | La zone de départ du palpage n'est vérifiée qu'au toucher de « Palper… » | `probe-ui.js:207-213` |
| B | L'état « non référencée » n'est dit que dans Préparer | `real-motion.js:453` |
| C | La vitesse S du programme face au maximum de la carte n'est signalée que dans la vue laser (« ⚠ S au-dessus de $30 : Grbl plafonne la consigne. ») ; rien pour la CNC | `laser-view.js:176` ; recherche de `$30` dans `touch/*.js` : aucune autre occurrence hors catalogues |

### Principe 8 — Un dessin plutôt qu'un chiffre

| Gr. | Manquement | Preuve |
|---|---|---|
| B | Aucun dessin de la zone de départ du palpage ; le dessin existant est « sans échelle ni trajet » | `probe-ui.js:34` |
| B | Aucun dessin de l'emprise du programme dans la machine hors de Préparer v2 ; celui-ci exige un aperçu 3D (« Aperçu sans parcours 3D : régénérez-le dans Fichiers. ») et n'existe ni en v1 ni en laser | capture `screens-jog-v2-911-fr-sombre-cnc-repos` |
| B | Le dépassement de course est un texte de chiffres | `program-check-view.js:33-40` |
| C | Les champs du profil de sonde n'ont aucun schéma (épaisseur, décalages de face, coin) à côté d'eux | `probe-ui.js:39-45` |

### Principe 9 — Couleur vive réservée à l'anormal, une action principale, dangers à part

| Gr. | Manquement | Preuve |
|---|---|---|
| C | Vert vif pour des états et actions normaux : « Repos », « Démarrer… », « Charger et ouvrir le Suivi », « Prêt à démarrer », « Chargé », voyant « Sonde : libre » ; le vert sert aussi à « Déverrouiller… » et « Reprendre… » | captures `…-repos`, `…-alarme-arret`, `…-pause` |
| C | Fichiers : deux boutons pleins (« + Ajouter un fichier » bleu, « Charger et ouvrir le Suivi » vert) | capture `screens-files-v2-911-fr-sombre-cnc-repos` |
| C | « Confirmer l'origine X · G54 » en ambre plein pour une action normale | capture `screens-jog-v2-911-fr-sombre-cnc-reel-origine` |
| C | Le voyant « Sonde : libre · signal reçu » a la forme d'un bouton ; `#t-pilot`, lui, est un bouton qui a la forme d'une étiquette | captures `screens-probe-…` |
| C | Sonde : « Arrêter le palpage » à 10 px de « Palper XYZ… » ; « Palper XYZ… » (137 × 72) n'est pas l'élément le plus visible de l'écran (les quatre tuiles et « Zéro Z avec plaque → Suivi » sont plus grands) | `probe.json` de `screens-probe-v2-911-fr-sombre-cnc-bloc-pret` |
| C | Écarts sous 12 px relevés par les captures : « Zéro X / Y / Z » 1 px (v2, volet de déplacement), boutons de Sonde 6 à 10 px, onglets de Réglages 10 px, « Favori / Ouvrir la fiche » 8 px | `jog.json`, `probe.json`, `summary.md` |

Conforme : « Arrêter le travail » seul en bas de Suivi, jamais à côté de « Pause » ; rouge réservé à l'alarme et à l'arrêt ; chaque mot d'état a une icône.

### Principe 10 — Après un incident, l'écran guide la remise en route

| Gr. | Manquement | Preuve |
|---|---|---|
| A | Pas de suite ordonnée ; ce qui est perdu (référence, origine) n'est pas dit en clair ; renvoi au PC | § 2, P8 |
| B | Après un arrêt, Suivi dit « Rechargez le fichier pour un nouveau départ. » sans proposer la reprise à la ligne, qui est un autre bouton, parfois absent | `job-dashboard.js:318`, `job-resume.js:166` |
| B | Après une prise d'origine, rien sur la validité de l'origine de la pièce | — |
| C | En alarme pendant un travail, le bandeau montre « Pause » (inactif) et « Arrêter » sans dire qu'« Arrêter » est le premier geste | capture `screens-home-v2-911-fr-sombre-cnc-alarme` |

---

## 4. Ce qui marche bien et doit être conservé

- **Le bandeau d'état** : mot + icône + couleur sur tous les écrans, âge du rapport, « Pause » et « Arrêter » toujours au même endroit, utilisables par-dessus tout volet ou dialogue (`strip-guard.js`), « Arrêter » jamais retardé, « État perdu » qui garde « Arrêter » (capture `…-hors-ligne`).
- **Le rail** : sept entrées fixes, icône + mot, cibles de 71 × 76 px, écran actif marqué.
- **Les tuiles du Menu avec leur voyant** (« Prêt à démarrer », « Chargé : … », « Bloqué : alarme ») et la barre « Reprendre où j'en étais ».
- **La croix de déplacement** : flèches de 96 px, pas en une rangée, « Continu » au doigt maintenu, le pas rappelé au centre ; la confirmation d'un zéro en **un** toucher, qui dit « Aucun axe ne bouge ».
- **Le pavé numérique et le clavier texte communs** : bornes et unité affichées, valeur en grand, « Valider ».
- **Le bouton désactivé qui répond** : motif rayé + toast de la raison au toucher (`touch-shell.js:278-298`).
- **Fichiers** : lignes de 92 px avec vignette, pastille « Sélectionné · Chargé », une seule action principale, le tableau « Sélection / Chargé dans la machine » de la v2.
- **Suivi** : pourcentage en grand, « Arrêter le travail » seul en bas, « Démarrer… » ou « Reprendre… » comme seule action principale, avertissement « la broche tourne toujours » en pause, bilan de fin de travail, corrections ±10 % / ±1 % / 100 %.
- **L'aide d'alarme par code** (`grbl-help.js`) : un titre en clair par alarme ; c'est la base d'un guidage, à réécrire sans `$X` ni renvoi au PC.
- **Sonde** : voyant de l'entrée tenu 1,5 s sur un contact bref, quatre grandes tuiles d'opération, progression « Étape 8 / 22 · X · approche », bilan qui dit si l'origine a changé, dessin du coin et des sens.
- **Le dialogue de confirmation** : dit ce que fait la commande, sur quelle machine, qui pilote ; durée visible ; fermé par « Pause » ou « Arrêter ».
- **La barre de connexion** : reconnaît le port de la mise en service, 2 touchers, prévient que la carte redémarre.
- **L'assistant de mise en service** : neuf étapes numérotées avec points d'avancement, reprise là où il a été laissé : seul exemple d'assistant de la page.
- **Préparer v2** : le dessin « Où le programme se placera » et un résumé numéroté ; l'idée, pas la place qu'elle prend devant les flèches.
- **Reprise à une ligne** : ligne proposée avec sa marge, vérification avant chargement.
- **Thèmes sombre et clair, texte agrandi, verrouillage de l'écran, attribution du pilotage.**

---

## 5. Contraintes pour toute nouvelle organisation

### 5.1 Ce que v1 Éco ne peut pas afficher

- Aucune vue 3D ni WebGL : ni `preview-gl.js`, ni `origin-preview.js`, ni les `performance-*.js`, ni `performance-v2.css`, ni `i18n-messages-v2.js` (`tablet-profile.js:74-109`). Donc pas de carte « Où le programme se placera », pas de bande « Séquence », pas de courbe d'avance, pas de « ligne acquittée » instrumentée, pas de Journal à contexte.
- Aperçus : vues fixes 2D / Iso / Face / Côté / Dessus (images) ; en laser, la vue laser 2D seule.
- Aucune requête, minuterie ni image de la v2 (§ 5.5 du prompt). Un dessin commun aux deux rendus doit donc être en HTML/CSS/SVG statique ou tiré des données déjà chargées.
- Chromium 106 : ES2017, pas de `:has()`, `color-mix()`, `dvh`.
- Laser : pas de carte de la plaque (`job-resume.js:154`), « Zéro Z avec plaque → Suivi » caché (`probe-ui.js:318`), cadrage `#home-frame-start` (`job-resume.js:129-135`), « Consigne S » au lieu de « Broche ».
- Le rendu v1 est aussi celui de la tablette CNC avant le premier repos et pour toute session ouverte hors repos : toute fonction doit exister en v1 à 1366 × 911 **et** à 1366 × 768.

### 5.2 Tailles

- Cibles : action principale 64 px, secondaire 48 px, flèche de déplacement 96 px, écart 12 px, texte utile 16 px (`design-tokens.css` : `--tap`, `--tap-primary`, `--tap-jog`, `--tap-gap`).
- Sur la tablette CNC (échelle 1,58) : 48 px ≈ 8,9 mm, 64 px ≈ 11,9 mm, 16 px ≈ 3,0 mm (`PERFORMANCE-UI-SPEC.md` § 5.1).
- Texte agrandi (`display-large`) : 16 → 18, 18 → 20, 24 → 27 px ; tout doit tenir aussi dans ce mode (variantes `…-agrandi-…`).

### 5.3 Place réellement disponible

Mesurée sur les captures (bandeau 72 px, rail 88 px, marges 16 px) :

| Fenêtre | Zone utile | En rangées |
|---|---|---|
| 1366 × 768 | **1246 × 648 px** (x 104 → 1350, y 88 → 736) | 8 rangées de 64 px ou 10 de 48 px, écarts de 12 compris |
| 1366 × 911 | **1246 × 791 px** (y 88 → 879) | 10 rangées de 64 px ou 13 de 48 px |

- Croix de déplacement : 3 × 96 + 2 × 12 = 312 px de côté ; avec la colonne Z, 432 px de large.
- Rail : 7 entrées de 76 px au pas de 88 px (y 80 → 684) ; avec « Retour », 8 entrées de 72 px au pas de 84 px (jusqu'à y = 744) : à 768 px le rail est plein à 8 entrées.
- Bandeau : mot d'état (≈ 200 px), âge, quatre valeurs, Pilote (96 à 152 px), deux boutons d'action de 64 px de haut (Pause 81 px, Arrêter 140 px, Reprendre… 166 px, Déverrouiller… 193 px, d'après les `.json`), cadenas 48 px, horloge. Avec les boutons d'action, la valeur « Machine » n'a plus de place.
- En v2, la colonne de droite de Suivi fait 432 px ; sa zone de messages 235 px de haut.

### 5.4 Clavier à l'écran

- Pas de clavier du système : pavé numérique `#t-numpad` (carte de 520 px de large, centrée, sous le bandeau) et clavier texte `#t-textpad`, tous deux en surcouche ; ils ne changent pas `innerHeight` et masquent l'écran derrière eux : la valeur précédente, le dessin ou la consigne ne sont plus visibles pendant la saisie.
- Les listes déroulantes (`<select>` : profil, repère, coin, sens, langue) ouvrent la liste native du navigateur : 2 touchers, taille des options non maîtrisée par la page.
- Une saisie = toucher le champ + chiffres + « Valider ».

### 5.5 États de la machine à couvrir

Chaque écran et chaque étape doivent avoir un affichage défini pour :

1. Serveur injoignable ou session refusée (« Hors ligne », « État perdu » avec « Arrêter » gardé).
2. Serveur joint, port fermé (« CNC non connectée »).
3. Connectée, réglages ou version de la carte inconnus (après un redémarrage de CNCjs).
4. Alarme au repos : avec code, code déduit, sans code.
5. Repos non référencée ; repos référencée ; repos avec origine de pièce posée ou non (aujourd'hui non distingués).
6. Prise d'origine en cours.
7. Déplacement manuel (pas, continu, annulation).
8. Palpage en cours (plaque, bloc), arrêt en cours, palpage échoué, palpage terminé.
9. Chargement en cours ; fichier chargé ; fichier chargé différent de la sélection ; aperçu d'une autre version.
10. Travail en cours ; travail « bloqué » (carte au repos, émetteur en attente).
11. Pause demandée ; pause du programme (M0, M1, M6) ; broche qui tourne en pause ; porte ouverte.
12. Alarme pendant un travail (avant « Arrêter »).
13. Travail terminé ; terminé avec erreurs ; arrêté avant la fin (ligne d'arrêt connue ou non).
14. Rapport ancien (> 2,5 s) ; rotation du flux.
15. Commande système en cours (mise à jour, extinction).
16. Pilote : libre, cet appareil, un autre (présent ou absent).
17. Écran verrouillé ; veille.
18. Machine CNC, laser, type non confirmé ; rendu v1 ou v2 ; sombre ou clair ; texte standard ou agrandi ; FR, EN, ES.

Les neuf états du harnais (`screens.json` : repos, pilote-pris, homing, palpage, travail, pause, alarme, périmé, hors-ligne) n'en couvrent qu'une partie : les états 2, 3, 5, 9, 12 (partiel), 13 et 15 n'ont pas de capture.

---

## 6. Écarts relevés avec les documents existants

- `BUGHUNT-MAP.md` (6 novembre) décrit Préparer avec `dry-motion.js`, `coordinate-plan.js` et un « essai à blanc » : ces scripts ne sont plus chargés par `index.html`. Elle ne connaît ni la v2 (`performance-*.js`), ni le palpage au bloc, ni la barre de connexion. Son ordre du rail (`menu, jog, files, home, machine, history, settings`) est toujours exact.
- Le prompt de mission (§ 2) dit que la tablette « affiche le rendu v1 tant que la CNC n'est pas connectée et au repos, puis le rendu v2 ». Le code ferme la v2 pour la session dès qu'une alarme ou une prise d'origine est vue avant le premier repos (§ 7, point 1).
- Le § 5.1 du prompt compte 15 écrans, 11 volets et 10 dialogues : retrouvés (16 sections dont une inaccessible ; 11 volets ; 10 surcouches, § 1.3).

---

## 7. Ce qui a été vérifié, et ce qui ne l'a pas été

Vérifié en le lançant :
1. **La v2 ne s'ouvre pas après une première alarme ou une prise d'origine.** Script jetable `…/scratchpad/refonte/ergonomie/v2-apres-alarme.cjs`, qui charge le vrai `tablet-profile.js` dans le VM exporté par `test-v2-gate.cjs` : premier état `Alarm` ou `Home` puis cinq rapports au repos → `perf-v2: false, open: false, pending: true` ; premier état au repos → `perf-v2: true`. C'est un VM avec des faux, pas la tablette.
2. Les identifiants, positions, tailles et écarts cités viennent des `.json` des captures (script jetable `targets.cjs`).

Vérifié par lecture du code seulement (non exécuté) : tous les parcours du § 2. Aucun parcours n'a été rejoué dans un navigateur ; les comptes de touchers sont déduits des gestionnaires de clic et des captures.

Non vérifié :
- Rien sur la vraie tablette, la RT ni la CNC. Les captures sont celles du banc (`/dev/replay`, Chrome 157 sans écran, DPR 1, police du PC) ; `summary.md` les date du 14 novembre et nomme le commit `0cb5d90a`, alors qu'elles montrent le palpage au bloc de `1cbf488d` : je n'ai pas comparé l'arbre d'alors à `3049a0e4`.
- Captures absentes, donc écrans décrits d'après le code seul : la barre « Connecter la CNC » et ses quatre états ; le dialogue de départ réel avec un verdict « HORS COURSE » ou « non vérifié » ; le volet « Préparer le travail » ; le dialogue de pilotage ; la reprise à une ligne ouverte ; le pavé numérique et le clavier texte (taille du clavier texte non mesurée) ; Suivi en v1 à 1366 × 911 avec la carte de la plaque (je ne sais pas si « Démarrer… » y reste visible) ; une alarme au repos sur Machine en v2 ; l'état « non référencée ».
- Les listes déroulantes : 2 touchers supposés (liste native de Chromium en kiosque), non observés.
- Les états qui dépendent du serveur sont signalés dans chaque parcours : ce qu'affiche la carte après l'ouverture du port, après « Arrêter », après une alarme ; les raisons exactes de `canHome`, `canZeroZ`, `canBlockProbe` sur la vraie machine.
- Les variantes EN et ES, le thème clair et le texte agrandi n'ont été regardés que par sondage (captures FR sombre v2 et FR clair v1 pour l'essentiel).
- Je n'ai regardé ni Réglages (refait le 8 novembre) ni le Journal au-delà de leur structure.
