# Performance v2 — validation indépendante (lot L7)

Base validée : `bd91cbc7` (intégration des lots L0 à L6), branche `v2/l7`. Validation faite le 6 novembre 2026, sur un PC Windows 11 : Edge 156.0.4314.58 sans écran, Node 22.

Aucune tablette n’a été utilisée, aucune machine connectée, aucune commande envoyée. Les chiffres de ce document sont ceux du PC : ils ne valent pas pour la Surface Pro 3.

## 1. Ce qui est vérifié et comment

| Vérification | Outil | Résultat |
| --- | --- | --- |
| Suite hors ligne | `node examples/cncjs-touch/verify-project.cjs` | 160/160 contrôles réussis, `test-performance-v2-safety.cjs` compris |
| Serveur | `npx jest src/server/services/touch src/server/api --testMatch "**/src/server/**/__tests__/**/*.test.js"` | Test Suites : 34 passed / 34 ; Tests : 1020 passed |
| Matrice de sécurité, hors ligne | `test-performance-v2-safety.cjs` | 12/12 vertes (§ 3) |
| Harnais navigateur strict | `node examples/cncjs-touch/browser-run.cjs --strict --browser "…msedge.exe" --out <hors dépôt>` | toutes les variantes v1 vertes ; les variantes v2 sont **rouges**, à cause des défauts du § 4 |
| Script de mesure tablette | `measure-performance-v2.cjs` | essayé une fois sur PC, contre une page locale : il s’attache, mesure, ne clique rien et sort. Aucun chiffre de tablette |

### Comment la v2 est ouverte dans le harnais

La v2 est ouverte **de l’extérieur** ; rien n’est accroché au code livré.

- **Préférence, profil, type de machine.** La préférence `cncjs-touch-performance-ui-v2`, le profil Performance et le type de machine simulé (`cncjs-touch-sim-kind-v1`) sont écrits dans le stockage par CDP.
- **GPU.** Le navigateur v2 est lancé avec SwiftShader (`--enable-unsafe-swiftshader --use-angle=swiftshader`). Un script injecté au démarrage enveloppe `CNCPreviewGL.probeGpu` quand `preview-gl.js` le définit. La vraie sonde s’exécute ; seule sa réponse `hardware` est forcée à `true`.
- **Contrôleur.** Sur la page réelle, c’est un banc du harnais : un proxy local placé devant `preview-server.cjs --replay`. Il sert `/api/custom/health`, `/api/touch-job` et `/api/touch-events` pour une CNC déclarée, programme chargé, dans la phase choisie par le harnais :

  | Phase | Ce que le banc envoie |
  | --- | --- |
  | repos | `Idle`, programme chargé |
  | travail | `Run` |
  | pause | `Hold:0` |
  | alarme pendant le travail | `Alarm` |
  | périmé | serveur vivant, `fresh:false`, âge croissant |
  | perdu | plus de flux, `503` |

  Toute requête autre qu’un GET sous `/api/` est enregistrée puis refusée (`403`).
- **Simulation.** Sur `simulation.html`, le travail virtuel de 60 s est démarré avec sa confirmation, mis en pause par le bandeau, puis mis en alarme par le bouton de simulation.

## 2. Harnais navigateur : résultats par fenêtre

Les fenêtres v1 du harnais (1366 × 768, 1024 × 600, texte agrandi, zoom, adaptatif, simulation FR/ES, alarmes au repos, bandeau) restent **toutes vertes**. La v2 ne change rien à la v1.

### 1366 × 911, page réelle

| Écran / état | Mesure stricte (cibles 64/48, texte ≥ 16, recouvrement, débordement, chevauchement) | Remarques |
| --- | --- | --- |
| Menu, Machine, Réglages (repos, diagnostic, v2 désactivée) | vert | entrée « Interface Performance v2 », qualité et diagnostic présents |
| Suivi repos / travail / pause / alarme / périmé / perdu | vert | bande « Rapport frais · < 1 s » → « Rapport périmé (> 2,5 s) » et « Figée · rapport périmé » → « Rapport inconnu » quand le flux est perdu ; courbe visible ; marqueur de correction dessiné |
| Suivi entre deux états | **rouge** | commandes du Suivi déplacées, scène redimensionnée (défaut D1) |
| Fichiers | vert | |
| Préparer, comparaison | **rouge** | « Déplacer l’outil… » hors de vue (D2) |
| Préparer, panneau de jog | **rouge** | Y+ et Y− coupés (D2) ; écart scène–jog 24,7 px (≥ 24) ; flèches de 96 px |
| Journal (repos, ouvert depuis la courbe) | **rouge** | « Lecture seule » en 14 px (D4) ; l’ouverture depuis la courbe fonctionne, de même que « ← Retour à Suivi » |
| Éco pendant un travail | **rouge** | porte fermée tout de suite, disposition tenue, Pause et Arrêter en place, retour à la v1 au repos ; mais la scène perd 24 px (D1) |

### 1728 × 1152, page réelle

Mêmes résultats, avec trois différences :

- **Préparer** est vert. Le panneau de jog est entier, à 60 px de la scène.
- **Fichiers** est rouge : « Charger et ouvrir le Suivi » est hors de vue (D3).
- **Suivi** : ses commandes bougent toujours entre deux états (D1), mais la scène garde sa taille.

### Simulation, 1366 × 911 et 1728 × 1152

- Activation de la v2, chargement, démarrage avec confirmation, pause, alarme et arrêt.
- Fichiers est rouge : « Agrandir » (1366) et « Charger et ouvrir le Suivi » (1728) sont hors de vue (D3).
- À 1366 × 911, le Suivi de la simulation défile : « Arrêter le travail » et la frise sont sous le bord (D5, rapporté).

### Pause / Arrêter

- **418 hit-tests** au centre et à 3 px à l’intérieur des quatre bords, dans chaque état et sur chaque écran : aucun échec.
- Mêmes vérifications sous les fiches « Broche / rapides… » et « Détail du temps », sous la fiche d’aide de Préparer, sous le pavé numérique empilé, sur le Journal ouvert depuis la courbe et sur une vue 3D avec loupe.
- Les rectangles de `#t-pause` et `#t-stop` sont **identiques** dans tous les états et sous toutes les fiches, et identiques à ceux de la page v1 de même taille.
- Deux comportements v1 relevés, sans défaut v2 :
  - avec le flux perdu, Pause est désactivé, et un toucher tombe dans le bandeau, pas dans une couche ;
  - sous une fiche, Reprendre est rendu inerte par `strip-guard.js` ; Arrêter reste joignable.

### Requêtes et sortie de la v2

- **Requêtes non GET.** Pendant toute la vie des pages v2, il n’y en a qu’une : `POST /api/signin`, le renouvellement de session d’`app.js`, envoyé aussi par la page v1. Aucune requête n’est envoyée par la v2 sans l’être par la v1.
- **Exceptions.** Aucune exception de page.
- **Sortie de la v2.** Après « Désactivée », la page n’est pas rechargée, la disposition est gardée et les ressources sont fermées. Le message « Changement préparé pour la prochaine session au repos » apparaît dans Réglages et dans le bandeau. La session suivante est en v1, sans aucune requête v2.
- **Là où la v2 ne doit pas s’ouvrir**, la préférence étant activée : Éco 1366 × 768 (page réelle et simulation), Éco 1366 × 911, Performance 1366 × 768, laser, GPU logiciel. Aucune requête v2, pas de `perf-v2`, aucun point de montage. En Éco, la page est identique à la page sans préférence : mêmes classes, mêmes identifiants, mêmes fichiers.
- **Lecture pendant un travail.** Les ressources demandées en travail, pause, alarme et périmé ont été relevées. Seule `origin-preview.css` est demandée pendant l’alarme, quand on ouvre Préparer (D6).

### Comparaison avec les maquettes

Captures v2 relues : `v2-*/*.png` du dossier de sortie.

- **Suivi : conforme.**
  - Grande scène et une seule colonne de surveillance.
  - Temps et sa source, coordonnées, avance et S rapportés avec la courbe, correction d’avance, « Broche / rapides… » et « Détail du temps ».
  - Bande de confiance sous la scène, frise « Séquence prévue · estimée / Ensuite ».
- **Suivi : écarts.**
  - La colonne garde les commandes v1 (Démarrer…, Pause, Arrêter le travail) ; la maquette n’en a pas.
  - Le bandeau n’a pas « Lignes acquittées · 42 % » : aucune case n’est ajoutée au bandeau, par contrat.
  - Pause mesure 81 × 64 px, contre 144 × 64 px dans la maquette.
  - Sur le banc, la scène est l’aperçu 2D : les aperçus du banc n’ont pas de parcours 3D. Il n’y a donc ni « Examiner » ni « Suivre l’outil » dans la barre de la scène.
  - « Géométrie inconnue » et « Séquences non préparées » s’affichent partout, faute de géométrie préparée sur le banc.
- **Préparer : conforme.** Comparaison Les deux / Actuelle / Hypothèse XY, « Cotes », 1 · Programme, 2 · Origine X Y avec ses décalages, « Z conserve son origine actuelle », verdict de course qualifié, « Déplacer l’outil… ».
- **Préparer : écarts.**
  - La carte des coordonnées v1 occupe le bas de la colonne droite. Le résumé n’a plus que 250 px environ à 1366 × 911 (D2).
  - Les étapes « Poser X Y ici… » et « 3 · Origine Z et contrôle final » de la maquette sont absentes. Les zéros restent dans la carte des coordonnées, comme le prévoit la spécification.
  - Le brut et le parcours ne sont pas en cartes sous la scène : une ligne « Aucune cote disponible » les remplace sur le banc.

## 3. Matrice de sécurité hors ligne (`test-performance-v2-safety.cjs`)

Le test exécute les **vrais** modules dans des machines virtuelles, sur les montages des tests des lots :

- la porte et le contrat L0 ;
- l’inspection et la vue 3D L1 ;
- les modèles L2 et L3 ;
- les présentations L4, L5 et L6.

| Contrôle | Vie couverte | Résultat |
| --- | --- | --- |
| M1 rien n’est envoyé hors des relais existants (fetch, WebSocket, socket.io, sendBeacon, requête non GET, `cncJobControls`, `cncRealMotion`, `cncSocket`, `CNCJobStream`…) | Suivi : repos, travail par rafales, corrections, pause, alarme, périmé, perdu, Éco, journal ouvert depuis la courbe, pagehide ; fiches et toucher de la courbe ; Préparer, tous ses boutons ; Journal, Réglages et Machine, tous leurs boutons, sur toute la chronologie ; vue 3D : glisser, pincer, molette, stylet, Examiner, candidats, retour, qualité | vert |
| M2 aucun rendu dans un gestionnaire d’état (nœuds v2 inchangés par la diffusion ; aucun tracé WebGL pendant `cnc-job-status`) | idem ; étalonné : une image change bien les nœuds, et une écriture dans un gestionnaire est détectée | vert |
| M3 aucune lecture du programme pendant un travail | Suivi (aucune requête après l’ouverture), Préparer (`loadedPreview` non relu), Journal (pas de GET pendant un travail) | vert |
| M4 pas de rejeu | aucun `cnc-job-status` émis par la v2, aucun bouton « rejouer / renvoyer », aucune fonction en forme de commande dans les API v2, `cncV2.commands === null` | vert |
| M5 holdLayout respecté | grille du Suivi inchangée en travail, pause, alarme, périmé, inconnu, et quand Éco est choisi pendant un travail ; carte de Préparer gardée tant que la disposition est tenue | vert |
| M6 RT, Éco, laser, logiciel et fenêtre étroite identiques à la v1, préférence activée | Éco 1366 × 768 et 1366 × 911, Performance 1366 × 768 et 1024 × 600, laser, GPU logiciel : requêtes, classes, évènements, images demandées, montages identiques à la page sans préférence | vert |

Limites de ce test :

- M3 côté Suivi ne voit que les lectures par XMLHttpRequest du montage. La lecture de géométrie de `preview-inspect.js` n’y est pas chargée. Le harnais complète en relevant les ressources demandées en travail.
- M5 est vérifié sur la grille, c’est-à-dire la structure parent → enfants. Les déplacements en pixels relèvent du harnais (D1).

## 4. Défauts trouvés

Gravités : sécurité machine, bloquant, à corriger, mineur. Aucun défaut de **sécurité machine** n’a été trouvé : rien n’est envoyé, Pause et Arrêter restent joignables et immobiles, et il n’y a pas d’extrapolation.

| # | Gravité | Lot | Défaut | Reproduction minimale | Fichier |
| --- | --- | --- | --- | --- | --- |
| D2 | **bloquant** | L5 | À 1366 × 911, la colonne droite de Préparer laisse environ 250 px au résumé et au panneau de jog. « Déplacer l’outil… » n’est atteignable qu’en faisant défiler un petit cadre. Dans le panneau de jog, la croix de 96 px est coupée, avec des barres de défilement : Y+ et Y− sont recouverts, Z+ et Z− coupés. | v2 ouverte, 1366 × 911, Préparer avec un programme chargé, puis « Déplacer l’outil… » ; harnais `v2 real 1366x911 · Préparer · idle-jog-panel` | `touch/origin-preview.css:29-30` : `grid-template-areas` met `coords` sur deux rangées et ne laisse à `side` et `jog` que le reste |
| D1 | à corriger | L4 | Entre deux états (repos → travail, pause, alarme, périmé), les commandes du Suivi changent de place : ligne de correction d’avance de +126 px en pause, Pause du Suivi de −113 px en travail, Arrêter le travail de −93 px. La scène change de hauteur (681 → 589, 699, 615 ou 565 px à 1366 × 911), même quand Éco est choisi pendant un travail. Pause et Arrêter du bandeau ne bougent pas. La v1 a le même mouvement : ce n’est pas une régression, mais REFLEXION § 3.10 et § 5 le demandent pour la v2. | v2, 1366 × 911, page réelle, programme chargé ; relever `#home-job-image` et `#home-overrides .t-override` au repos puis en `Hold:0` | `touch/performance-v2.css:18-20` (`.job-art{flex:1 1 0}` sous une bande et une frise de hauteur variable) et la colonne `job-metrics` de `touch/job-dashboard.js` (`applyV2`, retours d’état de hauteur variable au-dessus des commandes) |
| D3 | à corriger | L5 | Fichiers en v2 : la bande Sélection / Chargé repousse sous le bord du cadre « Charger et ouvrir le Suivi » (1728 × 1152, page réelle et simulation) et « Agrandir » (simulation 1366 × 911). Il faut défiler pour atteindre l’action principale. | v2, 1728 × 1152, Fichiers, sélectionner un fichier | `touch/shared-library.js:720` (bande insérée dans le détail) et `touch/shared-library.css:29-38` (aucune hauteur réservée) |
| D4 | mineur | L6 | La pastille « Lecture seule » du Journal v2 est en 14 px : classe `ks-readonly`, sans surcharge v2. | v2, Journal | `touch/real-history.js:296` ; règle à ajouter dans `touch/settings-list.css` (la règle actuelle `touch/touch-shell.css:3` fait 14 px) |
| D5 | mineur | L4 | À 1366 × 911, le Suivi v2 de `simulation.html` dépasse la fenêtre et défile : « Arrêter le travail » et la frise sont sous le bord. La raison : la grande carte des coordonnées, les trois axes empilés, et la bande sur trois lignes. Pause et Arrêter du bandeau restent joignables. | simulation.html, v2, 1366 × 911, charger puis démarrer | `touch/performance-v2.css` (la colonne de surveillance n’a pas de règle pour la carte de coordonnées de la simulation) |
| D6 | mineur | L5 / L2 | En alarme pendant un travail, ouvrir Préparer demande `origin-preview.css`. La carte d’origine est montée pendant le travail : `originWanted()` ne regarde pas l’état. Ce n’est pas une lecture du programme, mais c’est un chargement avancé hors repos. | v2, travail, alarme, puis aller sur Préparer | `touch/job-preparation.js:222-225` (`originWanted`) |
| D7 | mineur (banc) | intégration (`preview-server.cjs`, hors lots) | Le faux XMLHttpRequest de la fixture visuelle lève une erreur sur toute URL inconnue. Le catalogue différé `i18n-messages-v2.js` n’aboutit jamais, et la v2 reste en « loading » sur `preview-server.cjs`. Le harnais contourne le problème dans son proxy. En production, le vrai XHR a un délai de 15 s. | `preview-server.cjs` puis `simulation.html` en v2 : `cncV2.state().reason === 'loading'` indéfiniment | `preview-server.cjs:42` |

Observations, sans défaut avéré :

- **Journal ouvert depuis une correction.** Le Journal ouvert depuis un marqueur de correction montre l’intervalle, mais aucune entrée pour la correction elle-même : le journal de session n’enregistre pas les corrections rapportées par Grbl. C’est conforme à « une information absente reste absente ».
- **Trous de données sur le banc.** La courbe compte des « trous de données » même en travail frais (3, puis 11 après le passage par le périmé). C’est à revoir sur la tablette, au vrai rythme des rapports.
- **Géométrie et séquences jamais préparées sur le banc** : il n’y a pas de lecture de programme possible. Elles sont à vérifier sur la tablette avec un vrai programme.

## 5. Ce qui reste à la tablette et à la machine

Tout ce qui suit est **non mesuré** ici :

- la tenue sur le GPU Intel de la Surface Pro 3 ;
- les cadences et la latence réelles, le CPU de Chromium et de CNCjs ensemble ;
- la mémoire des processus, la température ;
- la lisibilité à 50–80 cm, le doigt et le stylet ;
- la géométrie de 500 000 segments ;
- un travail réel.

1. **Mesures sur la Surface**, sous `/touch-next/`, avec un second Chromium et son port de débogage. Ne jamais utiliser le Chromium du kiosque.

   ```
   chromium --user-data-dir=/tmp/cnc-measure-v2 --remote-debugging-port=9230 --window-size=1366,911 --force-device-scale-factor=1.58 http://127.0.0.1:8000/touch-next/
   node examples/cncjs-touch/measure-performance-v2.cjs --port 9230 --match /touch-next/ --reload --seconds 30 --cpu-seconds 30 --out v2-suivi.json
   node examples/cncjs-touch/measure-performance-v2.cjs --write-program 500k.nc --segments 500000
   node examples/cncjs-touch/measure-performance-v2.cjs --port 9230 --match /touch-next/ --geometry 600 --out v2-500k.json   # puis charger 500k.nc au repos
   node examples/cncjs-touch/measure-performance-v2.cjs --port 9230 --match /touch-next/ --seconds 60 --endurance 30 --out v2-endurance.json
   ```

   Refaire les mêmes passes sur la v1 (préférence désactivée, session suivante), avec le même programme et les mêmes gestes : c’est la référence. Relever en même temps la RSS/PSS de Chromium et de CNCjs (`ps`, `smem`) et la température (`/sys/class/thermal`).
2. **Gestes et lisibilité** (REFLEXION § 8.3) : doigt puis stylet, à 50–80 cm. Les tâches de § 8.3 : fraîcheur, acquitté/usiné, profondeur, incertitude, correction d’avance, trouver l’arrêt.
3. **Après correction de D1 à D3**, relancer `browser-run.cjs --strict` : les variantes v2 doivent devenir vertes sans exception ajoutée.
4. **Machine** (supervisée et autorisée, protocole du projet) :
   - travail réel avec Suivi v2 : bande frais/périmé au rythme réel, courbe, marqueurs, journal ;
   - Préparer avec une vraie origine et `$23` connu ou inconnu ;
   - perte du GPU pendant un travail : repli dans le même rectangle.

   Aucune de ces vérifications n’a été faite.

## 6. Fichiers de ce lot

- `browser-run.cjs` : passe v2. Navigateur propre, banc contrôleur, `v2Measure`, contrôles stricts `overflow-x`, `overflow-y` et `overlap` réservés aux vues v2.
- `test-performance-v2-safety.cjs` : matrice M1 à M6, enregistrée dans `verify-project.cjs`. `browser-run.cjs` et `measure-performance-v2.cjs` ont été ajoutés à son contrôle de syntaxe.
- `measure-performance-v2.cjs` : mesures sur la tablette.
- `layout-exceptions.json` : inchangé, aucune exception ajoutée.
- `browser-strip.cjs` : inchangé.
