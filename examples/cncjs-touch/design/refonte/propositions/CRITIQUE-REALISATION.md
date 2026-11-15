# Critique de la spec, côté réalisation (phase 2, 2026-11-15)

Agent « critique de la spec, côté réalisation ». Branche `feat/refonte-ui`, HEAD `20aeac36`. Aucun fichier existant modifié ; aucun test ni harnais lancé.

Objet : `design/refonte/SPEC-REFONTE.md` (1 516 lignes), lue en entier, avec `propositions/JURY.md`, confrontée au code de `examples/cncjs-touch/`, aux tests, au harnais, à `ERGONOMIE.md` § 5 et à `PLAN-CORRECTIONS.md`, paru après la spec. Je ne réécris pas la spec : chaque point donne le paragraphe visé, la preuve et une correction proposée.

Méthode, et ce qui a été exécuté :
- **Comptes** : script jetable `…/scratchpad/refonte/critR/count.cjs`. Il cherche chaque identifiant à migrer, en mot entier (ni `-`, ni `.` collé ; `job-resume.js` ne compte pas pour `#job-resume`), dans les 196 `test-*.cjs`, dans `browser-run.cjs`, `browser-strip.cjs`, `measure-refonte.cjs` et `job-controls-fixture.cjs`, et dans `touch/`. Il compare ensuite avec les tests nommés dans la section du lot. Le détail est dans `critR/counts.txt`.
- **Largeurs de texte** : `critR/measure.html`, lancé dans Edge sans écran (`--dump-dom`), mesure le texte avec `canvas.measureText` en « Segoe UI » (police du harnais sur le PC) et en Arial (métriques de Liberation Sans, la police de la Surface sous Debian), à 16 et 18 px. Résultats dans `critR/widths.tsv`. Pour un bouton, j'ajoute la marge interne actuelle : `padding: var(--sp-2) var(--sp-4)`, soit 2 × 16 px (`ui-2027.css:50`, `design-tokens.css`), plus 2 px de bord.
- **Fils de fer** : la place est recalculée à la main avec les cotes de la spec et ces largeurs mesurées.

Gravités : **bloquant** = irréalisable tel quel, ou qui casse un test, un critère de fin de lot, une garde ou le harnais strict ; **amélioration** = réalisable, mais le réalisateur devrait inventer, ou le résultat serait moins bon.

---

## 0. Résumé

**17 bloquants** et **24 améliorations**. Les plus lourds :

1. **L1 casse les Macros, et l'accès à la Sonde.** L1 retire `cncShell.preparationActions`, dont `macros.js` (lot L6) et `job-preparation.js` (lot L4) dépendent. L'entrée « Sonde » vit aussi dans ce conteneur. Le critère de fin de L1 (« les 65 lignes ont un sélecteur qui existe ») échoue (B-01).
2. **L4 retire de quoi faire vivre la vue 3D qu'il garde.** Il supprime `job-preparation.js` et `travel-check.js`, alors que la « Vue 3D du placement » qu'il conserve est chargée par le premier et nourrie par le second. Dix tests de `verify-project.cjs` qui les chargent ne sont pas nommés (B-02).
3. **Le bandeau ne tient pas.** En espagnol, texte agrandi, pendant un usinage, la colonne « Fichier » tombe à environ 50 px, alors que le harnais strict exige 120 px (B-03).
4. **Trois fils de fer débordent** en v1 : ② la liste des fichiers, ③ la rangée des pas et la colonne Sonde, ⑤ la colonne de l'aperçu (B-04 à B-07).
5. **La spec ne suit pas le contrat de `PLAN-CORRECTIONS.md`.** D2 (`workOffset`, `verifyOffset`), D4 (`canReadSettings`) et la règle du rendu v2 (C-35) y sont fixés autrement : appliquée à la lettre, la spec affiche « Zéro pièce : gardé » quand il ne l'est pas, laisse [Relire] rayé en alarme (T10) et ne passe pas son propre test de la porte v2 (B-08 à B-10).
6. **Le banc ne peut pas compter les touchers.** L'étape `parcours` doit compter P1, P3, P7 et P8, mais `preview-server.cjs` n'a ni Socket.IO, ni contrôleur qui accepte une commande, et aucun lot ne construit ce banc (B-11).

---

## 1. Bloquants

### B-01 — L1 retire `preparationActions`, dont dépendent Macros, « Préparer le travail » et l'entrée Sonde
- **Spec** : § 11 L1, « Identifiants et API migrés » : « `cncShell` : `preparationActions` supprimé ».
- **Preuve** :
  - `touch/macros.js:8` : `if(!shell||!shell.sheet||!shell.preparationActions)return;` ; `macros.js:14` y ajoute le bouton.
  - `touch/job-preparation.js:158` : même garde.
  - `touch/touch-shell.js:157-160` : l’entrée `#screen-jog .probe-entry` (« Sonde ») et `#ks-origin-info` sont placées **dans** ce conteneur.
  - `macros.js` n'est modifié qu'en L6, `job-preparation.js` retiré qu'en L4.
  - Si l'export disparaît, le bouton et le volet Macros (EX-07) disparaissent de L1 à L6. Si c'est le conteneur, PA-03 et PA-05 deviennent aussi inaccessibles jusqu'à L3b.
  - 7 tests fabriquent un faux `preparationActions` : `test-job-preparation`, `test-macros`, `test-origin-preview`, `test-preparation-keys`, `test-preview-identity`, `test-v2-origin`, `test-v2-preparer-fixture`. Ils resteront verts pendant que la page réelle perd la fonction.
- **Correction** : garder `preparationActions` jusqu'en L4. Ou bien ajouter `macros.js` aux fichiers de L1, pour que la tuile « Macros » de Plus y soit posée tout de suite, et dire où va l'entrée Sonde entre L1 et L3b.

### B-02 — L4 supprime `job-preparation.js` et `travel-check.js`, mais garde ce qui en dépend
- **Spec** : § 11 L4, « Retirer de la page et du dépôt : `touch/travel-check.js`, `touch/job-preparation.js` » ; § 3.2 et § 4.4 : « [Vue 3D du placement] ouvre la vue existante de `origin-preview.js` ».
- **Preuve** :
  - `origin-preview.js` n'est chargé que par `job-preparation.js:260` (`cncProfile.loadAdvanced(['preview-gl.js', 'origin-preview.js'])`, voir aussi `origin-preview.js:2`).
  - Il calcule le placement avec `root.CNCTravelCheck.place()` (`origin-preview.js:31`).
  - `test-scenario-profiles.cjs` fige les appelants de `loadAdvanced` : `['job-preparation.js', 'preview-3d.js']`.
  - Dix tests de la liste de `verify-project.cjs` chargent l'un des deux fichiers et ne sont pas nommés en L4 : `test-gcode-corpus`, `test-bughunt-c-1`, `test-bughunt-f3`, `test-preview-identity`, `test-v2-i18n`, `test-v2-origin`, `test-scenario-profiles`, `test-tablet-profile`, `test-real-interface`, `test-performance-v2-safety`. Le premier fait par exemple `require('./touch/travel-check.js')`. Après L4, `verify-project.cjs` est rouge.
- **Correction** :
  - nommer `check-screen.js` comme nouvel appelant de `loadAdvanced` ;
  - nourrir `origin-preview.js` avec `programCheck` du serveur, ou garder `place()` dans un petit module ;
  - ajouter ces dix tests aux « tests migrés » de L4, avec ce que chacun perd.

### B-03 — Le bandeau ne tient pas en espagnol, texte agrandi, pendant un usinage
- **Spec** : § 2.2. « La main : … » est un bouton de 160 × 48 au moins ; `#t-recover` fait 200 × 64 dans l'emplacement 1 ; Pause et Arrêter sont « toujours présents » ; « Fichier » reste ; Désaccord 13 : on garde tout.
- **Preuve**, mesures `widths.tsv`, texte + 34 px de marge interne :
  - « El control: Este dispositivo › » : 224 px à 18 px, soit 258 px ; « La main : Cet appareil › » : 166 à 187 px, soit 200 à 221 px. Aujourd'hui `#t-pilot` fait 96 px (capture `screens-home-v1-768-es-clair-laser-agrandi-travail/home.json`).
  - Groupe de droite : 258 + 12 + 200 + 12 + 145 (Arrêter, mesuré) + 12 + 48 (cadenas) + 12 + 50 (heure) + 16 ≈ 765 px. Il commence donc vers x = 600.
  - À gauche, la capture place « ARCHIVO » vers x = 537.
  - Il reste environ 50 px au nom du fichier, contre les 120 px exigés pendant un usinage (`browser-run.cjs:47`, règle stricte).
  - Au repos, Pause et Arrêter n'existent pas aujourd'hui (`status-strip.js:182-186`, `hidden`). Ils ajoutent environ 480 px à droite. `ERGONOMIE.md` § 5.3 note déjà : « Avec les boutons d'action, la valeur « Machine » n'a plus de place. »
- **Correction**, à trancher dans la spec :
  - un bouton « La main » de largeur fixe et court (« La main : ici », « La main : libre », « La main : autre » + icône), le nom de l'appareil passant dans le dialogue ;
  - un emplacement 1 dimensionné sur son libellé le plus long dans la langue ;
  - et dire quelle cellule cède sa place : par exemple, pendant un usinage, Broche et Vitesse sont sur ⑤.
  - Ajouter le cas ES, texte agrandi, usinage aux critères de L1.

### B-04 — ③ La rangée des pas et « Continu » ne tiennent pas dans 456 px
- **Spec** : § 4.3. « Pas [0,1][1][10][25][50][100][Continu] » ; « six pas de 48 × 48 et « Continu » (72 × 48) » dans une colonne de 456 px.
- **Preuve** :
  - Largeur intérieure : 456 − 24 = 432 px. La rangée demande 27 (« Pas » à 18 px) + 12 + 6 × 48 + 6 × 12 + 72 = 471 px.
  - « Continu » mesure 57 px à 16 px et 65 px à 18 px, soit 91 à 99 px avec la marge interne, pour une case de 72 px. « Continuo » (ES) : 101 à 109 px.
  - Aujourd'hui les pas sont sur deux rangées : `#steps{display:grid;grid-template-columns:repeat(4,…)}`, `ui-2027.css:359`. Le mot « Continu » prend deux colonnes (`ui-2027.css:977`).
  - Deux rangées font passer la colonne à 312 + 48 + 12 + 48 + 12 + 48 + 24 + 32 (titre) = 536 px, plus que les 520 disponibles.
- **Correction** : par exemple, retirer le libellé « Pas » (le pas choisi est déjà au centre de la croix), donner à « Continu » une case de 110 px et retirer un pas (25 ?). Ou loger la rangée sous la croix sur toute la carte. À arbitrer avec la maquette, en ES et en texte agrandi.

### B-05 — ③ La colonne Sonde déborde en largeur et en hauteur
- **Spec** : § 4.3, colonne « Sonde » (386 px). La somme « = 520 » ne compte pas le titre de la carte, que le § 4.1 compte (32 px).
- **Preuve** :
  - Ligne 1 en contact permanent : voyant « ! Touche en permanence » 173 à 198 px + [Pourquoi ?] 112 à 121 px + [Ma sonde…] 118 à 129 px + 24 = 427 à 472 px, pour 362 px intérieurs. En ES : « ! Toca permanentemente » 176 à 199 px.
  - Hauteur : 520 + 32 (titre) = 552 > 520. Le repli prévu au § 14 (« le dessin descend à 120 px ») ne regagne que 28 px.
  - La ligne de cause « recouvre le tiers bas du dessin », soit environ 49 px. Or elle porte une phrase de 456 à 521 px (2 lignes dans 362 px), deux coches et un bouton de 48 px : environ 130 px.
- **Correction** : voyant sur sa propre ligne ; dessin réduit, ou titre de carte supprimé ; ligne de cause **à la place** du dessin, pas par-dessus. La spec doit refaire le compte, titre compris.

### B-06 — ② La colonne des fichiers ne tient pas dans 520 px, et le code ne sait pas afficher 4 lignes
- **Spec** : § 4.2. Fil de fer : [Rechercher…], 4 lignes de 92 px, [Précédents]/[Suivants], puis sous la carte [+ Ajouter un fichier] [Détails du fichier] [Fiche du projet]. Aucune somme des hauteurs n'est donnée, contrairement à ①, ③ et ⑤.
- **Preuve** :
  - 48 + 12 + 4 × 92 + 12 + 48 + 24 (marges) + 32 (titre) + 12 + 48 = 604 px, soit 572 sans le titre. C'est plus que les 520 px.
  - `touch-shell.js:55-58` (`fitLibrary`) ne connaît que 5 lignes par page, ou 3 en `t-compact` : il n'y a pas de cas « 4 en v1, 5 en v2 » (§ 4.2, dernière ligne).
  - La capture `screens-files-v1-768-fr-sombre-laser-repos` occupe aujourd'hui les 648 px sans barre d'étape.
- **Correction** : 3 lignes à 1366 × 768 et 5 à 1366 × 911 (selon la fenêtre, pas le rendu : voir B-14). Les trois boutons montent dans la carte de droite.

### B-07 — ⑤ La colonne de l'aperçu dépasse avec la phrase sous « Arrêter l'usinage »
- **Spec** : § 4.5. « à gauche, boutons de vue 48 + aperçu 360 + [Arrêter l'usinage] 64 + 2 écarts + marges = 520 » ; « Sous le bouton, en 16 px : « Arrêt logiciel. L'arrêt d'urgence… » ».
- **Preuve** : la phrase mesure 502 à 565 px en français (1 ligne d'environ 22 px) et 726 à 834 px en espagnol (2 lignes, environ 50 px, dans 616 px). Elle n'est pas comptée : débordement de 22 à 50 px dans tous les cas. Le titre de la carte « Aperçu » n'est pas compté non plus.
- **Correction** : enlever 50 px à l'aperçu en v1 à 768, ou mettre la phrase dans « Détails » et dans le Guide (règle 8 du § 9.4).

### B-08 — La relecture des réglages reste rayée en alarme (T10), contre K4 et le plan
- **Spec** : § 6.4, tableau « Le serveur l'accepte quand » : ① relire = « état au repos et à jour ». § 4.1 : relecture refusée en alarme, détour par Déverrouiller.
- **Preuve** :
  - `PLAN-CORRECTIONS.md` § 4.2 publie `canReadSettings` et `readSettingsReason`, « la relecture est possible (aussi en alarme) » (lot S5) ; § 4.3 : `readSettings` est « acceptée en alarme ».
  - La règle 9 de la spec elle-même dit que la page ne décide jamais qu'une commande est permise.
  - Appliqué à la lettre, [Relire] est rayé en alarme alors que le serveur l'accepte : c'est T10, et P1 coûte 6 touchers au lieu de 4.
- **Correction** : action de ① « relire » = `canReadSettings`. Le détour par Déverrouiller ne sert que si le champ est absent.

### B-09 — D2 : la page attend un champ et un remède qui n'existeront pas
- **Spec** : § 0.2 K3 (`offsetProven`, « Absent = prouvé ») ; § 4.4 (« si la vérification a échoué : [Relire les réglages] ») ; § 9.2 n° 12 ; § 6.1, liste fermée des remèdes.
- **Preuve** :
  - `PLAN-CORRECTIONS.md` § 4.2 publie `workOffset {state, code, params, detail, wcs, stored, reported, reloaded, attempts, canVerify}`.
  - § 4.3 ajoute l'action `verifyOffset`. Le lot P1, point 3, dit : « Le bouton « Vérifier à nouveau » (action `verifyOffset`) est un critère d'acceptation de la refonte. »
  - § 4.1 crée `ETOUCH_OFFSET_CHECKING`, `_UNCONFIRMED`, `_MISMATCH`, `_SETTINGS` et `ETOUCH_CHECK_OFFSET_UNPROVEN`.
  - Réalisé à la lettre, `offsetProven` est toujours absent, donc vaut « prouvé ». ① dit alors « Zéro pièce : gardé », ③ « Posé », le rail « ✓ », pendant que le serveur refuse le départ.
  - Le remède proposé (Relire les réglages) ne relance pas la preuve, sauf pour `ETOUCH_OFFSET_SETTINGS`. La liste fermée n'a pas de remède `verifier-zero`.
- **Correction** :
  - caler K1 à K11 dès maintenant (correspondance au § 8 ci-dessous) ;
  - ajouter le remède `verifier-zero`, qui appelle `verifyOffset`, et le bouton [Vérifier à nouveau] à la ligne `zero` de ① et sur ④ ;
  - lire « champ absent » comme « inconnu », pas comme « prouvé », pour **l'affichage** (le serveur garde ses refus).

### B-10 — Règle du rendu v2 : la spec et le plan se contredisent, et le test de L1 ne peut pas passer
- **Spec** : § 3.1. `v2Blocked` seulement si `workflow` vaut `running` ou `paused`. « L1 la trouve faite [par P2] et la vérifie ». Test de L1 : « Alarme → prise d'origine → Repos ouvre la v2 ».
- **Preuve** :
  - `PLAN-CORRECTIONS.md`, lot P2, point 4 : `v2Blocked` « pour un travail vu avant le premier repos (`workflow` différent de `idle`, `canStop`, `loading`, `probing`, `d.busy`, `d.halt`) ».
  - `canStop` vaut vrai pendant une prise d'origine (`COMMANDES-MACHINE.md`, EX-05 : « canStop (travail, Run/Hold/Home/Jog/Door… homing suivi…) »).
  - Avec le code de P2, la mise en route (Alarme → `$H` → Repos) ferme la v2 pour la session : le test exigé en L1 échoue, et la spec interdit à L1 de refaire.
- **Correction** : trancher **avant** P2. Garder la règle étroite de la spec, et l'écrire aussi dans `PLAN-CORRECTIONS.md`.

### B-11 — L'étape `parcours` n'a pas de banc pour P1, P3, P7, P8 et P10
- **Spec** : § 11. Étape `parcours` créée en L1 (« page réelle sur le banc ») ; critères de fin L2 (P1 = 4), L3b (P3 = 13, P4, P5, P10), L5 (P7 = 7, P8 = 8) mesurés par elle. Le prompt (§ 9) l'exige aussi.
- **Preuve** :
  - Dans `preview-server.cjs`, le faux contrôleur refuse toute commande : `command:()=>{throw Error('Physical command forbidden')}`.
  - Aucun serveur Socket.IO pour `list` et `open` (`connect-cnc.js`) : `browser-run.cjs` et `preview-server.cjs` ne font aucun appel `serialport:list`.
  - Ni prise d'origine qui passe Alarme → Home → Idle, ni `ALARM:2` avec redémarrage, ni signal de sonde, ni palpage.
  - Aucun lot ne crée ce banc. Le profil LUNYEE du simulateur (S1) existe côté Jest et `grbl-simulator`, pas branché sur la page.
- **Correction** : confier à L1 un banc « parcours » qui branche le vrai service sur `grbl-simulator` (profil LUNYEE) et ajoute un faux Socket.IO pour `list` et `open`. Sinon, redéfinir `parcours` comme une suite d'états injectés entre les touchers, et le dire, car c'est moins probant.

### B-12 — `measure-refonte.cjs` mesurera faux après L1
- **Spec** : § 11 L6 (« `measure-refonte.cjs --out <dossier>/apres` lancé et comparé à « avant » ») ; prompt § 6 (« mesurés de la même façon »). Le fichier n'est dans aucune liste de lot.
- **Preuve** :
  - `measure-refonte.cjs` lignes 279, 293, 378 et 393 : `goScreen(cdp, 'menu')` pour « Suivi caché » ; ligne 372 : la liste des 7 écrans ; ligne 634 : `'touch-shell.js?v=v2u'`.
  - Après L1, `cncShell.go('menu')` ne fait rien (`touch-shell.js:193` : `if(!document.getElementById('screen-'+name))return;`). Les fenêtres « Suivi caché » seraient donc mesurées Suivi affiché, sans erreur.
- **Correction** : adapter `measure-refonte.cjs` en L1 (écran caché = `more`, liste des écrans, suffixe du cache lu dans `tablet-profile.js`) et dire dans le rapport que « Menu avant » est comparé à « Plus après ».

### B-13 — Fin des relais : les gardes de la page ne sont pas reprises
- **Spec** : § 10.4, cas particulier 2 : « chaque bouton visible appelle la fonction (`cncJobControls.load`, `.start`, `.pause`, `.resume`, `.stop`). Même requête ».
- **Preuve** :
  - Aujourd'hui, la garde de la page est l'état `disabled` des boutons cachés : `job-controls.js:368-373` (`busy || !online || !selection || !canLoad` ; `busy || !online || !canStart` ; état perdu → `lost.canPause`, `lost.canStop`). Chaque relais la teste (`status-strip.js:108`, `job-dashboard.js:32-38` : `if(this.disabled||!source||source.disabled)return;`, avec le gel de 600 ms).
  - « Même requête » ne garantit ni le refus d'un double envoi (`busy`), ni l'envoi sans flux à `halt` en état perdu.
  - Deux relais vers `#job-stop` ne sont pas nommés : `probe-ui.js:252` (`#probe-stop`) et `preview-viewer.js:87` (`#preview-job-stop`). `real-motion.js:485` vise aussi `#job-stop` dans un `closest(...)`.
  - `PLAN-CORRECTIONS.md`, lot P3, point 4, expose déjà `pause()` et `stop()` : L5 doit partir de ce code.
- **Correction** : chaque fonction directe reprend la condition des lignes 368-373 ; un test prouve qu'un appel avec `busy`, hors ligne ou avec `can…` faux n'envoie rien, et qu'en état perdu Pause et Arrêter partent vers `halt`. `zero-piece.js` appelle `stop()` (L3b). Ajouter `real-motion.js` aux fichiers de L5.

### B-14 — « Mêmes places en v1 et en v2 » contredit les 143 px que la v2 ajoute
- **Spec** : § 11 L5, critère « à 1366 × 911, le centre de chaque commande machine est au même endroit (à 1 px près) en v1 et en v2 » ; § 4.3 « En v2, les 143 px de plus vont au dessin de départ (291 px) » ; § 4.1 « La place en plus (143 px) va à l'encart et à l'interligne ».
- **Preuve** : sous le dessin de départ, [Palper au bloc …] et [Zéro Z à la plaque…] (PA-01, PA-03) descendent de 143 px si seule la v2 agrandit le dessin. La spec ne dessine jamais la v1 à 1366 × 911, que la Surface affiche avant son premier repos (`ERGONOMIE.md` § 5.1, dernier point).
- **Correction** : la place en plus dépend de la **fenêtre**, pas du rendu : la v1 à 911 l'emploie de la même façon. Le dire au § 0.1 et sous chaque fil de fer.

### B-15 — Le pavé numérique cache les dessins que « Ma sonde » et « Plaque » allument
- **Spec** : § 5.5, page 2 : « Chaque champ a sa cote sur le dessin, qui s'allume quand le champ est ouvert » ; § 5.7 : « Deux champs et un dessin » ; § 5.14 : pavé « inchangé ».
- **Preuve** :
  - `ui-2027.css:855-857` : `.t-numpad{position:fixed;inset:0;…background:rgba(0,0,0,.72)}`, carte `width:min(520px,100%)` centrée, de x 423 à 943.
  - Le dessin de 400 px, à gauche d'un volet de 900 px centré, va d'environ x 257 à 657 : la carte du pavé en couvre plus de la moitié, et le reste est assombri à 72 %.
  - `ERGONOMIE.md` § 5.4 : « la valeur précédente, le dessin ou la consigne ne sont plus visibles pendant la saisie ».
- **Correction** : une option du pavé qui le place à droite de l'écran, sans voile, pour ces volets ; ou le dessin réduit dans la carte du pavé. Ce n'est plus « inchangé » : à inscrire en L3b.

### B-16 — Libellés trop larges pour leur place en espagnol, ou en texte agrandi
- **Spec** : § 2.4 (« remède… 260 px au plus ») ; § 9.2 n° 4 ; § 4.2 (remède [Prise d'origine machine…] sur la ligne de verdict).
- **Preuve** : « Buscar el origen de la máquina… » mesure 237 à 266 px, soit 271 à 300 px avec la marge interne, au-delà de 260. « Reanudar desde la línea 1 219… » : 225 à 253 px, soit 259 à 287 px (remède `reprise` de ①). Le harnais strict refuse le texte dessiné hors de son bouton (`browser-run.cjs:47`).
- **Correction** : remède jusqu'à 300 px, ou libellés ES courts imposés dans le glossaire (« Buscar origen… »). Faire de ces deux libellés un cas de la maquette ES, texte agrandi.

### B-17 — L1 retire la case de présence avant que la garde qui la remplace existe
- **Spec** : § 6.3, point 2 (« Le danger que la case couvrait… est désormais refusé par le serveur (D1) et montré avant (④) ») ; point 5 (« démarrer et reprendre ne s'ouvrent que sur un verdict « tient » ») ; § 11 L1 (dialogue par classe, `kiosk()`).
- **Preuve** : en L1, le départ part encore de Suivi (`#home-job-start`, jusqu'en L4), sans l'écran ④ qui filtre le verdict. La seule barrière du kiosque est alors le serveur (S3) et la défense de la page du lot P1 (« Confirmer jamais actif sans dérogation »). La spec ne fait pas de S3 et P1 une condition d'entrée de L1.
- **Correction** : écrire « L1 ne commence qu'après S2, S3 et P1 commités et verts », ou repousser la case par classe en L4. Le test `test-confirmation-classes.cjs` vérifie que la case est **toujours** exigée sur un verdict `outside` ou `unknown`, quel que soit `kiosk()`.

---

## 2. Améliorations (la spec laisse le réalisateur inventer)

| # | Spec | Constat et preuve | Correction proposée |
|---|---|---|---|
| A-01 | § 11 L1, critère « P9 = 2 » | L'écran ④ minimal de L1 porte « Démarrer l'usinage… », mais `cncJobControls.start()` n'arrive qu'en L4. Le réalisateur doit inventer un relais de plus (vers `#job-start`) ou un appel à `prepareCommand('start')`. | Dire lequel, avec la garde de B-13. |
| A-02 | § 9.2, § 11 L1 (`test-refus-table`, 100 % des codes) | 143 codes `ETOUCH_*` dans `src/server/services/touch/*.js`, plus une trentaine dans `PLAN-CORRECTIONS.md` § 4.1. La spec en cite 83 (dont 4 préfixes). « L'annexe » annoncée n'existe pas. Sans famille : `ETOUCH_PROBE_G92`, `ETOUCH_PROBE_TLO`, `ETOUCH_MACHINE_OPERATION`, `ETOUCH_MACHINE_RESUME_MODE_CHANGED`, et tous les codes du plan (`ETOUCH_START_OUTSIDE`, `_NOT_HOMED`, `_OVERRIDE_CHANGED`, `ETOUCH_TRAVEL_*`, `ETOUCH_OFFSET_*`, `ETOUCH_PLATE_*`, `ETOUCH_MOTION_HOMING`, `_AMBIGUOUS`, `_DISABLED`, `ETOUCH_SETTINGS_READING`, `ETOUCH_ORIGIN_*`, `ETOUCH_PROBE_CONTACT_STUCK`…). | Écrire l'annexe avant L1, ou autoriser dans le test un classement par préfixe avec une liste d'exceptions. |
| A-03 | § 0.2 K1, K2, K5, K7 à K9, K11 | Les noms « à caler » sont connus depuis `PLAN-CORRECTIONS.md` § 4 (voir § 8 ci-dessous). Le réalisateur ne doit pas coder `derogation`, `machine: true` ni `offsetProven`. | Remplacer dans la spec. |
| A-04 | § 6.7 | La page calcule le dépassement (`max(low − machineMin, machineMax − high)`) alors que le serveur décide sur `axes.<A>.usable` (marge de 0,5 mm) et publie `over` dans `ETOUCH_TRAVEL_*`. Le dessin peut alors dire « tient · marge 0,3 mm » quand le verdict de l'axe est `outside`. | Cotes tirées de `programCheck.blocking[].params.over` et de `usable`, comme le § 6.6 (« aucun nombre de géométrie n'est calculé par la page »). |
| A-05 | § 2.3 « Tuile 88 × 88 » | Le rail fait 88 px avec `padding: var(--sp-2)` (`ui-2027.css:191`) : une tuile fait 72 px de large au plus (`ERGONOMIE.md` § 5.3 : entrées de 71 × 76 aujourd'hui). Mesures : « Mecanizado » 86 à 99 px, « Machining » 73 à 86, « Engraving » 72 à 82 ; « Contrôle », « Machine », « Máquina » 69 à 72 px à 18 px, pour environ 68 px utiles. La spec ne cite que « Seguimiento ». | Tuile 72 × 88 ; tirets conditionnels imposés dans le catalogue pour `Meca­nizado`, `Machi­ning`, `Engra­ving` ; « Contrôle » et « Máquina » vérifiés par maquette en texte agrandi. |
| A-06 | § 2.3, § 2.4 (formats compacts) | Rail de 564 px + marges, contre 528 px de haut à 1024 × 600 et moins encore avec un zoom de 150 ou 200 % ou le clavier (variantes strictes, `browser-run.cjs:18-25`). La spec ne dit pas comment le rail se compacte. | Définir le rail compact (numéro et marque sans le nom, ou défilement vertical permis). |
| A-07 | § 2.4, barre d'étape | « La cause : 620 px » est incompatible avec deux remèdes (④) : 620 + 12 + 151 + 12 + 199 + 12 + 320 = 1 326 > 1 246 en FR. Avec « Détails », c'est pire. | La cause prend la place restante ; deux lignes au plus. |
| A-08 | § 4.1, liste de ① | Huit lignes possibles à la fois (après un incident sur une machine jamais mise en service) : 32 + 8 × 56 + 24 + 60 = 564 > 520. Le calcul en suppose 7. | Ligne `service` absente quand un incident est ouvert, ou lignes de 48 px. |
| A-09 | § 3.2, § 5.9 | La v2 de « Machine » (`#perf-v2-machine`, `v2m-`) passe dans un volet. `v2Mounts` crée ses emplacements dans `screen-<nom>` (`touch-shell.js:83-98`) ; son contenu est rendu même volet fermé, donc du travail sur un élément caché (chantier C). `browser-run.cjs:1381` et `:1763` cherchent `#v2m-condition` sur l'écran Machine. Le texte `v2m` « …puis $X ou $H plus haut. » (`machine-limits.js:195`) ne veut plus rien dire dans un volet. | Emplacement `machine` ouvert seulement avec le volet ; texte à réécrire ; dire si « Détails de la machine » fait partie des exceptions de `test-textes-regles.cjs` (le § 11 L6 dit « le volet « Détails » »). |
| A-10 | Prompt § 5.5, spec § 0.3 | Les classes `v2n-` n'existent nulle part (`grep` : 0 occurrence dans `touch/` et les tests). La regex `V2_NODE` est dans `test-performance-v2-safety.cjs:60`, test qui cite aussi `job-preparation.js`, `home-job-load`, `home-job-feedback` et `job-load`, sans être nommé en L3a, L4 ni L5. Quand les `pv2-` disparaissent (L4), sa partie « Préparer » perd son objet et passerait sans rien vérifier. | Nommer ce test en L4 et L5, « migré sans toucher `V2_NODE` », avec un nouvel objet (emplacement `prepare` dans ④). Signaler à l'orchestrateur que la contrainte `v2n-` est sans objet. |
| A-11 | § 11 L3b, fichiers | Ajouter `probe-ui.js` et `probe-preparation.js` à `tablet-exclude.txt` impose de modifier la constante `SIMULATION_ONLY` de `test-no-simulation-access.cjs:9`. Les points (a) à (c) du test exigent l'égalité exacte entre ce que charge la seule simulation et la liste. Aucun script gardé ne doit contenir la chaîne « probe-ui.js » (point b). Le déploiement **efface** ces fichiers de toutes les copies servies (`tablet-exclude.txt`, en-tête). | Dire en L3b : constante du test, et vérification qu'aucun script gardé ne nomme ces fichiers. |
| A-12 | § 11 L1 (`test-cache-version`) | Il reste d'autres suffixes dans les scripts : `preview-3d.js:19` et `preview-3d-worker.js:5` (`?v=view3`), `library-preview-worker.js:6` (`toolpath-3d.js?v=worker13`). `preview-3d-worker.js` n'est pas dans la liste de L1. Aujourd'hui `index.html` porte 21 valeurs distinctes (55 `v2u`), et non 23. Neuf tests figent `v2u` : `test-bughunt-V3-1`, `-V3-2`, `test-connect-cnc`, `test-menu-screen`, `test-preview-worker`, `test-transverse-screen`, `test-v2-gate`, `test-v2-i18n`, `test-v2-observation-lifecycle`. Les deux derniers sauf `test-v2-i18n`, et `test-preview-worker`, ne sont pas nommés en L1. | Ajouter `preview-3d-worker.js` et les tests manquants. Faire tester l'**égalité** de toutes les valeurs, pas la valeur `v2v`. Si un essai réel intermédiaire est prévu (`PROTOCOLE-ESSAI.md`), changer la valeur à chaque lot, sinon T14 revient. |
| A-13 | § 11 L1, `commissioning.js` | `commissioning.js:166` et `:170` (`finish`) appellent `shell.go('menu')` : après L1, l'assistant ne sait plus où revenir et reste affiché. L'ouverture automatique (`:508`) teste `current==='menu'`. | Retour sur ① (ou Plus) : à écrire. |
| A-14 | § 11 L3b « encart de pause de ⑤ » | L'encart `#home-notice` est créé en L5. En L3b, le bouton [Zéro Z à la plaque…] de pause n'a pas d'hôte. | En L3b, l'héberger à côté de `#home-pause-m5` (avis de pause du programme existant), puis le déplacer en L5. |
| A-15 | § 4.3, § 7 P3 | Le serveur refuse le palpage tant que le test du contact n'est pas fait (`block-probe.js:440`, intégré à `canBlockProbe` par `job-service.js:1209`). La règle 1 du § 6.1 raye alors [Palper au bloc …], alors que « Profil incomplet : reste actif et ouvre l'assistant ». Le récit de P3 place le geste du test **pendant** la saisie : à l'étape 2 le bouton est encore rayé. | Dire laquelle des deux règles l'emporte (proposition : bouton actif pour ouvrir l'assistant, ticket demandé seulement au bouton final) et réécrire P3 dans cet ordre. |
| A-16 | § 10.4 (65 lignes) | Il manque les commandes nouvelles du plan : `verifyOffset` et `prepare start {override:'travel'}`. CX-06 (« supprimé ») n'est attribué à aucun lot (`app.js:151-160`). PI-02 « prise directe » : la garde de la page « aucune demande en cours » (`job-controls.js:219`, `:612`) n'est pas reprise. | Ajouter ces lignes à `commandes-migration.json` ; dire le lot de CX-06 ; garder « une demande à la fois » sur les deux boutons-motifs. |
| A-17 | § 10.4, `test-commandes-migration.cjs` | « Le nouveau sélecteur existe » : dans quel état ? Beaucoup de cibles n'existent que dans un volet, un dialogue ou une étape de l'assistant, et `#step-machine-main` envoie une requête différente selon l'état (connecter, prise d'origine, relire, arrêter, reprise). | Pour chaque ligne : l'état du banc où l'on touche, et la requête attendue. |
| A-18 | § 11 L1, `commandes-migration.json` sous `design/refonte/` | Le prompt (§ 8) réserve à l'orchestrateur les commits des documents de conception, alors qu'un test de `verify-project.cjs` lirait ce fichier. | Le placer à côté des tests (`examples/cncjs-touch/commandes-migration.json`), ou le faire commiter par l'orchestrateur avant L1. |
| A-19 | § 2.3, `data-step` | Le rail reçoit `data-step="1"` à `"5"`, alors que les pas de déplacement sont `#steps .step[data-step="1"]`. Le code est cloisonné (`real-motion.js:374` lit `stepBox`), mais le harnais lit `#steps [data-step=\"1\"]` (`browser-run.cjs:1977`) et une feuille de style générale pourrait se tromper. | `data-seance-step`. |
| A-20 | § 6.4 et § 1.1 règle 10 (recalcul à chaque état) | Sur la RT (Éco), les cinq barres, le rail et les lignes de ① seraient réécrits à chaque paquet (4,8 par seconde pendant un usinage). C'est le travail inutile que C1 mesure dans Réglages (−80 % de mutations). | Écrire seulement le rail et l'écran affiché, et seulement ce qui change ; un test le compte, comme `test-viewport-mutation.cjs`. |
| A-21 | § 4.3, ③ | Machine de type non confirmé (`ERGONOMIE.md` § 5.5, état 18) : carte Sonde ou carte Laser ? Porte ouverte, et travail « bloqué » (états 10 et 11) : absents du tableau de ⑤. | Une ligne par état. |
| A-22 | § 4.4, `#check-rapids` | « Même composant » que ⑤ : la liaison se fait aujourd'hui par délégation sur `#home-overrides` (`job-dashboard.js:56-58`). L'état actif, rayé et pressé doit suivre sur les deux. | Extraire le composant ; le test prouve les deux rangées. |
| A-23 | CSS sans `:has()` | Plusieurs règles se coderaient naturellement avec `:has()` : la carte Sonde qui change quand un bouton est rayé, la barre qui passe sur deux rangées, l'encart. | Écrire au § 0.1 : tout état visuel passe par un attribut `data-*` posé par le script. |
| A-24 | § 4.7 Réglages | « Cohérence seulement », mais Réglages reçoit une ligne d'état du rendu (4 phrases) et le choix de veille rayé (D3). C'est acceptable, mais à dire comme exception au prompt § 5.5. | Mention explicite. |

---

## 3. Lots : fichiers, tests et étapes du harnais qui citent les identifiants à migrer

Les fichiers nommés dans la spec existent tous (vérifié par script), sauf ceux à créer : `seance.js`, `refus.js`, `i18n-messages-refus.js`, `check-screen.js`, `zero-piece.js` et 21 tests. Il en manque dans les listes (B-01, B-02, B-12, B-13, A-11, A-12).

Comptes : identifiants de la ligne « Identifiants et API migrés » de chaque lot, en mot entier.

| Lot | Identifiants comptés | Tests qui les citent | Lignes de harnais | Tests qui les citent mais ne sont pas nommés dans la section du lot |
|---|---|---:|---:|---|
| L1 | `screen-menu`, `ks-resume`, `t-unlock`, `preparationActions`, `cncjs-touch-last-screen`, `v2u` | **18** | 6 (`browser-run` 5, `measure-refonte` 1), plus l'écran `menu` : `SCREENS` de `browser-run.cjs:93` et 5 lignes de `measure-refonte.cjs` | 9 : `test-job-preparation`, `test-macros`, `test-origin-preview`, `test-preparation-keys`, `test-preview-identity`, `test-preview-worker`, `test-v2-observation-lifecycle`, `test-v2-origin`, `test-v2-preparer-fixture` (hors `verify`) |
| L2 | `ks-machine-*` (7), `screen-limits`, `pilot-reason-a`, `pilot-reason-b` | 6 | 1 | 3 : `test-compact-layout`, `test-display-settings`, `test-real-motion` (+ `test-bughunt-A2-6`, hors `verify`) |
| L3a | `pv2-*` (6), `jog-read-settings`, `ks-origin-info`, `jog-controller`, `jog-msg` | 4 | 8 (`browser-run` 7, `browser-strip` 1) | 0 |
| L3b | `home-plate*` (4), `probe-*` (9), `cnc-plate-show`, `screen-probe*` (6) | 11 | 3 | 5 : `test-download-file`, `test-numeric-rules`, `test-profile-storage`, `test-real-interface`, `test-tablet-profile` |
| L4 | `job-load`, `job-start`, `home-job-start`, `home-job-load`, `home-frame-start`, `ks-preparation-open`, `ks-prep-load`, `job-travel`, `job-program-check`, `cncJobPreparation`, `CNCTravelCheck`, `travel-check.js`, `job-preparation.js` | **42** | **29** (`browser-run` 22, `browser-strip` 6, `job-controls-fixture` 1) | **34**, dont 32 dans `verify` : `test-action-feedback`, `test-block-probe-dialog`, `test-bughunt-c-1`, `test-bughunt-f3`, `test-control-attribution`, `test-dashboard`, `test-dashboard-pause-guard`, `test-feedback-states`, `test-gcode-corpus`, `test-home-suivi`, `test-job-dialog-strip`, `test-job-display`, `test-job-stream-client`, `test-performance-v2-safety`, `test-preview-identity`, `test-real-interface`, `test-real-motion`, `test-scenario-profiles`, `test-server-messages`, `test-session-refused`, `test-simulation-ui`, `test-strip-continuity`, `test-tablet-profile`, `test-transverse-screen`, `test-v2-i18n`, `test-v2-origin`, `test-v2-preparer`, `-reopen`, `-layout`, `test-v2-suivi`, `test-v2-suivi-style` (+ `bughunt-A2-1`, `-A2-5` et `v2-preparer-fixture`, hors `verify`) |
| L5 | `home-job-pause`, `home-job-resume`, `home-resume-check`, `home-resume-panel`, `home-v2-more-overrides`, `perf-v2-overrides-sheet`, `home-job-feedback`, `job-feedback`, `job-reason`, `job-pause`, `job-resume`, `job-stop` | **38** | **21** (`browser-run` 15, `browser-strip` 6) | **22** : `test-block-probe-dialog`, `test-bughunt-f3`, `test-control-attribution`, `test-frame-refusal-reasons`, `test-job-dialog`, `test-job-stream-client`, `test-network-hint`, `test-numeric-pad`, `test-numeric-rules`, `test-performance-v2-safety`, `test-probe-real-ui`, `test-real-motion`, `test-server-messages`, `test-simulation-ui`, `test-strip-continuity`, `test-tablet-profile`, `test-transverse-screen`, `test-v2-mounts` (+ `bughunt-A2-5`, `-8`, `-9` et `-10`, hors `verify`) |

À lire avec prudence :
- Un test qui **cite** un identifiant ne casse pas forcément : certains ne le mettent que dans leur faux DOM. Je n'ai lancé aucun test.
- La chaîne `'menu'` apparaît dans 24 tests, dont 19 ne sont pas nommés en L1. La plupart l'emploient comme écran fictif de `dom-fixture.cjs` (`createDOM(['menu'])`) et devraient rester verts : non vérifié.
- Les relais seuls (`#job-load`, `-start`, `-pause`, `-resume`, `-stop`) sont cités par 32 tests ; 16 ne sont nommés ni en L4 ni en L5.

**La page reste-t-elle en marche à la fin de chaque lot ?**
- **L1** : non (B-01 : Macros, et peut-être l'accès à la Sonde ; A-13 : fin de la mise en service).
- **L2** : oui, sous réserve de A-09 (v2 de Machine dans un volet).
- **L3a** : oui. L'emplacement `prepare` déménage dans `screen-check`, mais la carte du placement reste chargée par `job-preparation.js` jusqu'en L4.
- **L3b** : oui, sous réserve de A-14 (hôte du bouton de pause) et de B-13 (`#probe-stop` relayait vers `#job-stop`).
- **L4** : non (B-02).
- **L5** : oui si B-13 est traité.
- **L6** : oui.

**L'ordre des lots tient-il ?** Oui dans les grandes lignes, avec trois réserves :
1. Conditions d'entrée de L1 : S2, S3, P1 et P2, avec la règle v2 tranchée (B-10, B-17).
2. Le départ depuis ④ (L1) sans fonction `start` avant L4 (A-01).
3. Le chargeur d'`origin-preview.js` retiré en L4 sans remplaçant (B-02).

---

## 4. Place : les fils de fer contre 1 246 × 648 (v1) et 1 246 × 791 (v2)

| Écran | Vérification | Verdict |
|---|---|---|
| Cadre (§ 2.1) | 88 + 16 + 1 246 + 16 = 1 366 ; 72 + 16 + 40 + 12 + 520 + 12 + 64 = 736 ; la zone se termine 16 px plus haut que les marges seules ne l'imposent, comme dans `ERGONOMIE.md` § 5.3 | tient |
| Bandeau (§ 2.2) | voir B-03 | **ne tient pas** en ES, texte agrandi, usinage |
| Rail (§ 2.3) | 564 px ≤ 696 à 768 ; tuile de 88 de large impossible dans le rail de 88 (A-05) ; 1024 × 600 non défini (A-06) | tient en hauteur ; largeur à corriger |
| ① (§ 4.1) | 790 + 12 + 444 = 1 246 ; 508 ≤ 520 avec 7 lignes, 564 avec 8 (A-08) ; « Déverrouiller sans prise d'origine… » 251 à 282 px + [Détails de la machine] 155 à 186 px tiennent dans 790 | tient, sauf 8 lignes |
| Carte de connexion | dans la liste de 790 px | tient |
| ② (§ 4.2) | 520 + 12 + 714 = 1 246 ; hauteur de la colonne gauche 572 à 604 (B-06) | **ne tient pas** |
| ③ (§ 4.3) | 380 + 12 + 456 + 12 + 386 = 1 246 ; colonne 1 : 436 + titre 32 = 468, tient ; colonne 2 : la croix 432 de large tient, la rangée des pas non (B-04) ; colonne 3 : non (B-05) | **ne tient pas** |
| ④ (§ 4.4) | 470 + 12 + 250 + 12 + 502 = 1 246 ; colonne verdict ≈ 384 ; barre à deux remèdes : non (A-07) | tient, sauf la barre |
| ⑤ (§ 4.5) | 640 + 12 + 594 = 1 246 ; droite 476 + titre 32 = 508 ; gauche 520 + phrase de 22 à 50 px (B-07) ; rangées de 5 boutons : (570 − 80 − 12 − 48) / 5 ≈ 86 px chacun, « Velocidad » et « Husillo » tiennent | **gauche ne tient pas** |
| Plus (§ 4.6) | 3 × 403 + 2 × 12 = 1 233 ; 2 × 200 + 12 + version | tient |
| Volet (§ 5.1) | 900 × 580, plus le bandeau de 72 = 652 ≤ 768 ; « Ma sonde », page 2 : 48 + 12 + 48 + 12 + 300 + 12 + 48 + 12 + 64 + 24 = 580 juste en texte standard, défile en texte agrandi (sa barre finale reste hors de la zone qui défile, conformément au § 5.1) | juste |
| Dialogue `blockProbe` (§ 5.2) | titre 48 + 2 lignes + plan 240 + 3 lignes + case 48 (hors kiosque) + [Détails] 48 + boutons 64 + écarts + marges ≈ 676 sur 696 sous le bandeau. Plus de place pour la règle « décaler du recouvrement + 12 px » (§ 5.1) ; en texte agrandi, dépasse | **à vérifier par maquette** ; proposer le plan à 180 px en v1 |
| Dialogue « La main » | 420 px : « El otro dispositivo está fuera de servicio » 289 à 325 + 34 = 359 | tient |
| Barre d'étape | action 320 : « Buscar el origen de la máquina… » 300 ; « Iniciar el mecanizado… » 200 ; remède 260 : non en ES (B-16) | **remède à 300 px** |
| Clavier à l'écran | pavé et clavier texte en surcouche, ils ne changent pas `innerHeight` (`ERGONOMIE.md` § 5.4) ; la variante « clavier virtuel » du harnais (320 px pris en bas) passe en `t-compact` (hauteur < 650), où la spec empile les cartes. Le rail compact n'est pas défini (A-06) ; pavé contre dessins : B-15 | partiel |

Tailles 64 / 48 / 96 px, écart 12 et texte 16 : respectées dans les fils de fer, hors les cas ci-dessus. Les 12 px entre les trois zéros de ③ sont exigés et testés (§ 11 L3a), ce qui est bien.

---

## 5. v1 Éco

- **Requêtes** : aucune requête de v2 n'est exigée en Éco. `check` (§ 4.2) et `resumePlan` sont communes aux deux rendus et non périodiques. Le harnais n'interdit en Éco que les fichiers de la v2 (`browser-run.cjs:1545`, `:1611-1649`), donc `check` y est permise. Non vérifié : le coût de `checkFile` (`job-load.js:182-188` : lecture et analyse complète du fichier) sur le serveur ARM de la RT pour un gros fichier laser (la spec le dit aussi).
- **Minuteries** : aucune nouvelle. Les 600 ms d'armement sont une comparaison d'heures ; le voyant tenu 1,5 s existe déjà ; « touche en permanence » se déduit de deux états reçus. « Entoure le dessin de la carte une fois » (§ 6.6) : si c'est une animation CSS, la borner (une seule itération).
- **Images** : les dessins de ④ et ③ sont en SVG, tracés depuis des nombres déjà reçus ; la vue 3D du placement est réservée à la v2. Conforme.
- **CSS et JavaScript** : la spec n'exige ni `:has()`, ni `color-mix`, ni `dvh`, ni rien au-delà d'ES2017. `inert` (Chromium 102), `gap` en flex et `aspect-ratio` passent sur Chromium 106. Risque : A-23.
- **Légèreté** : A-20 (réécriture des barres à chaque paquet).
- **Laser (RT)** : ③ carte Laser, ④ [Cadrer…] à la place des rapides, « Puissance » au lieu de « Consigne S » (`ERGONOMIE.md` § 5.1). Ce changement de mot est à mettre au glossaire § 9.3, qui ne le cite pas.

---

## 6. Les 65 commandes machine

Les 65 lignes de `audit/commandes-machine.json` ont toutes une ligne au § 10.4 (CX-01 à 06, PI-01 à 03, OR-01 à 08, DE-01 à 08, ZE-01 à 05, PA-01 à 06, FI-01 à 05, EX-01 à 07, CO-01 à 03, RL-01 à 03, RM-01 à 05, SY-01 à 06).

L'envoi est inchangé partout, sauf l'exception voulue (EX-01, la case). Restent à corriger :
- **gardes de la page portées par les boutons cachés** : B-13 ;
- **OR-06 et OR-07** (relire) : garde de la page fausse, B-08 ;
- **EX-07** (macros) : inaccessible de L1 à L6, B-01 ;
- **PA-04** (`#probe-stop`) : relayait vers `#job-stop` (`probe-ui.js:252`), non dit ; B-13 ;
- **PI-02** : « une demande à la fois » non reprise ; A-16 ;
- **DE-02 et DE-07** : aujourd'hui, les pas interdits sont **masqués** (`real-motion.js:422`, `hidden`) ; la spec les raye (§ 4.3). C'est un changement d'affichage, pas de garde : à dire dans `SURETE.md` ;
- **PA-01** : la descente « 10 mm par défaut » existe déjà (`job-resume.js:112-113`). Conforme ;
- **commandes nouvelles** à ajouter à la table : `verifyOffset`, `prepare start {override:'travel'}`, `set-origin {at:'machine'}` (A-16, § 8).

Les relais disparaissent proprement **si** B-13 est appliqué. Les 5 boutons cachés de `job-controls.js:16-18` ne sont pas les seuls relais : il y a aussi `#probe-stop` (`probe-ui.js:252`), `#preview-job-stop` (`preview-viewer.js:87`) et `job-preparation.js:193` (`#job-load`, retiré en L4).

---

## 7. Les contraintes du § 5.5 du prompt

| Contrainte | État dans la spec | Remarque |
|---|---|---|
| Classes `v2m-` | gardées, déplacées dans un volet | A-09 |
| Classes `v2n-` | « gardées » | aucune occurrence dans le dépôt (A-10) |
| Regex `V2_NODE` | non citée par lot | `test-performance-v2-safety.cjs:60` ; le test est touché en L4 et L5 sans être nommé (A-10) |
| `tablet-exclude.txt` | L3b ajoute `probe-ui.js` et `probe-preparation.js` | conforme à « ne reviennent pas » ; effets sur `test-no-simulation-access.cjs` (A-11) |
| Réglages | « cohérence seulement » | deux ajouts à dire (A-24) |
| Identifiants et API migrés avec leurs tests | listes par lot | incomplètes (§ 3) |
| `PERFORMANCE-UI-SPEC.md`, `TESTING.md`, `BUGHUNT-MAP.md` | L6 seulement | chaque lot change un comportement documenté (rail, Menu, Préparer, Suivi). Le prompt demande la mise à jour « là où le comportement change » : la faire lot par lot, ou le dire |

---

## 8. Correspondance K1 à K11 avec `PLAN-CORRECTIONS.md` § 4 (à reporter dans la spec)

| Spec | Plan | Écart |
|---|---|---|
| K1 refus de départ | `ETOUCH_START_OUTSIDE` (`count`, `reasons[]`), `programCheck.blocking`, `refusals.start` | — |
| K2 `derogation: true` | `prepare {operation:'start', override:'travel'}` ; refus `ETOUCH_START_OVERRIDE_CHANGED`, `ETOUCH_START_NO_OVERRIDE` ; `programCheck.overridable` | nom ; il faut aussi les deux refus et `overridable` (le bouton n'existe que si `overridable`). Le plan place la dérogation en « L5 », la spec en L4 |
| K3 `offsetProven` | `workOffset.state` et `canVerify`, action `verifyOffset`, `ETOUCH_OFFSET_*`, `ETOUCH_CHECK_OFFSET_UNPROVEN` | B-09 |
| K4 relecture | `canReadSettings`, `readSettingsReason`, `ETOUCH_SETTINGS_READING` | B-08 |
| K5 `machine: true` | `set-origin` avec `at: 'machine'` ; refus `ETOUCH_ORIGIN_OFFSETS`, `ETOUCH_ORIGIN_NOT_HOMED` | nom |
| K6 `local` | `local` dans les réponses de `GET` et `POST /api/touch-backlight` | conforme |
| K7 code de l'alarme | `lastAlarm {code, at, restarted}`, `referenceLost` | la spec déduit « La machine a redémarré » de `startups` (qui existe, `job-service.js:1325`). `lastAlarm.restarted` est plus sûr après un rechargement de la page |
| K8 course X et Y | `programCheck.axes.<A>.usable` | A-04 |
| K9 étapes du test du contact | `probeInput.test.stage`, `.contactMs`, `.stuck`, `.lastContactAgeMs` ; `ETOUCH_PROBE_CONTACT_STUCK` | « touche en permanence » à lire dans `.stuck` plutôt que recalculé par la page (§ 6.5) |
| K10 | `spindleStopReason` | conforme |
| K11 | `ETOUCH_CHECK_S_ABOVE_MAX` (`s`, `line`, `max`) | conforme (forme d'une raison, pas d'un champ) |

---

## 9. Ce que je n'ai pas vérifié

- **Rien n'a été lancé** : ni `verify-project.cjs`, ni Jest, ni le harnais. Les tests « cassés » le sont à la lecture (`require` d'un fichier retiré, sélecteur absent) ; un test qui ne fait que citer un identifiant peut rester vert.
- Les largeurs de texte viennent de `canvas.measureText` dans Edge, et non d'un rendu dans la page : interlettrage (`letter-spacing:.02em` sur `.ks-nav`), graisse réelle et marges internes exactes non relevés pour chaque composant. Arial remplace Liberation Sans (métriques réputées identiques, non vérifié sur la Surface).
- Les positions du bandeau viennent d'une seule capture (ES, texte agrandi, usinage, v1 à 768) ; la largeur exacte de chaque cellule de gauche est estimée sur l'image.
- La hauteur du dialogue `blockProbe` est estimée, pas mesurée.
- Je n'ai pas lu en entier `browser-run.cjs` (2 846 lignes) ni `job-dashboard.js` ; ni les maquettes (non parues quand j'ai écrit) ; ni `TEXTES.md`, `VEILLE.md`, `FIRMWARE.md`, ni les fiches A1 à A4 au-delà de ce qui est cité.
- Je n'ai pas vérifié si `test-hidden-views.cjs`, `test-kept-screens.cjs` et `test-transverse-screen.cjs` passent sur le vrai `touch-shell.js` après le retrait de `screen-menu`.
- Rien sur la vraie Surface, la vraie RT ni la vraie CNC.
