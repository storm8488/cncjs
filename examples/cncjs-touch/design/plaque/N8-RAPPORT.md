# N8 — Sauvegarde des réglages de la carte (idée 8), sans restauration

Travail de la nuit du 26 novembre 2026 dans `cncjs-wt/N8`, branche `feat/N8`, base `0acd1c3b`.
Aucune installation, aucun accès à la tablette, à la RT ni à la CNC, aucun push.

## Ce que l'opérateur voit

**Plus → Réglages → Machine et performances**, une carte « Sauvegarde des réglages de la carte »
(portée « Serveur CNCjs ») :

- « **Sauvegarder maintenant** » : le serveur écrit un fichier daté avec la date, la version du
  firmware, le type de machine et toutes les paires `$n=valeur` qu'il a lues.
- La **liste datée** des sauvegardes (les cinq dernières et la toute première, « Afficher les N
  autres » pour le reste), avec le nombre de réglages, le firmware et le nom du profil.
- « **Comparer à la carte** » sur chaque ligne : la liste des réglages différents, valeur de la
  sauvegarde puis valeur actuelle, avec un libellé en clair quand il est connu (« $130 · Course de
  l'axe · X »). Sans différence : une seule phrase.
- « **Exporter** » sur chaque ligne : le fichier JSON, par la voie de téléchargement de la page
  (`CNCDownload`, celle du journal et des autres exports).
- « **Relire** » : la relecture existante des réglages, avec ses gardes (refusée pendant un usinage).
  Le bouton est grisé exactement quand celui de la ligne « Réglages lus » de 1 · Machine l'est
  (main tenue ailleurs, information ancienne, flux coupé, action ou commande de tablette en cours,
  usinage) : la carte lit la réponse de `seance.js` pour ce bouton, elle ne recopie pas la condition.
- Deux phrases fixes : « La restauration se fait à la main, réglage par réglage. Rien n'est écrit
  dans la carte d'ici. » et « La comparaison porte sur la dernière lecture des réglages. »
- Si la carte diffère de la dernière sauvegarde : une ligne dans la carte, et une ligne de plus sur
  **1 · Machine** (« 2 réglages de la machine ont changé depuis la sauvegarde du … À voir dans
  Plus → Réglages. »). Cette ligne n'a pas de bouton, disparaît pendant un incident et quand la
  machine n'est pas connectée.

## Sûreté

- **Aucune restauration, aucune commande nouvelle.** Le serveur n'écrit rien dans le contrôleur :
  il copie ce que CNCjs a en mémoire depuis la dernière lecture `$$` (connexion ou « Relire »).
  Les tests du serveur enregistrent tout ce que le contrôleur reçoit (`command`, `write`,
  `writeln`) : rien pendant une sauvegarde, une liste, une comparaison, un export, y compris
  pendant un usinage. L'API ne connaît que `save`, `compare`, `read` ; `restore`, `write`,
  `delete` sont refusés (400).
- Aucune liste blanche, aucun garde, aucun code de refus existant n'est modifié. `job-service.js`
  n'est pas touché : la façade lit par l'action existante `settings` (lecture seule).
- Pendant qu'une relecture `$$` est en cours, la sauvegarde et la comparaison sont refusées
  (mélange possible d'anciennes et de nouvelles valeurs).
- Le nom d'un fichier demandé par la page est vérifié par motif : rien ne sort du dossier.

## Choix faits sans l'opérateur (au plus prudent)

1. **Dossier** : `cncjs-touch-settings/` à côté de `.cncrc` (là où `history.js` écrit
   `cncjs-touch-history.jsonl`). `projects.js` écrit dans le dossier des programmes : un fichier de
   réglages n'y a pas sa place.
2. **Nom** : `reglages-NNNN-AAAAMMJJTHHMMSSZ.json` : un compteur d'écriture (le plus grand du
   dossier plus un), puis l'heure UTC ; l'heure locale est affichée par la page. **L'ordre est
   celui du compteur, jamais celui de l'horloge** : si l'horloge de la tablette recule (pile,
   démarrage sans réseau), la nouvelle sauvegarde reste la dernière, la première reste la première.
3. **Borne** : 20 fichiers. Au-delà, les premiers écrits partent, **jamais la référence** (la
   première sauvegarde lisible) ni les dernières. Un fichier illisible n'est jamais la référence.
   Aucun bouton de suppression.
4. **Contenu** : les réglages numériques `$n` seulement (ce que le serveur Touch expose déjà et
   compte dans « réglages lus »). Les lignes de démarrage `$N0` / `$N1`, les zéros pièce (`$#`) et
   les réglages nommés du firmware ne sont **pas** sauvegardés.
5. **Sauvegarde permise pendant un usinage** : elle ne lit que la mémoire du serveur et n'envoie
   rien. La relecture, elle, reste refusée pendant un usinage comme aujourd'hui.
6. **Comparaison** : deux nombres sont comparés comme des nombres (`10` = `10.000`).
7. **Vocabulaire** : la carte dit « carte », comme le demande le prompt de la nuit et comme la mise
   en service le fait déjà dans Réglages ; la ligne de 1 · Machine dit « machine », selon le glossaire.
8. **Journal** : une sauvegarde n'ajoute pas de ligne au journal (pas de nouveau type d'événement
   dans la page du journal cette nuit).
9. **Libellés** : table en clair pour `$0`–`$32` et `$100`–`$135` (Grbl 1.1). `$39`, propre à cette
   carte et de sens inconnu, reste affiché sans libellé.

## Fichiers touchés

Nouveaux :
- `src/server/services/touch/settings-backup.js` — fichiers, borne, comparaison.
- `examples/cncjs-touch/touch/settings-backup.js` — la carte et la ligne de 1 · Machine.
- `examples/cncjs-touch/touch/i18n-messages-backup.js` — 63 lignes FR / EN / ES.
- Tests : `src/server/services/touch/__tests__/settings-backup.test.js`,
  `settings-backup-facade.test.js`, `src/server/api/__tests__/api.touch-settings-backups.test.js`,
  `examples/cncjs-touch/test-settings-backup.cjs`.

Partagés, modifications minimales :
- `src/server/services/touch/index.js` (un import, un bloc avant l'export, deux noms exportés) ;
  `src/server/api/api.touch.js` (un bloc avant les fiches projets) ; `src/server/app.js` (deux routes
  après `touch-updates`).
- `touch/index.html` (deux balises `script`), `touch/simulation.html` (le catalogue, exigé par
  `test-i18n.cjs`), `touch/touch-shell.css` (la carte ajoutée en fin des deux sélecteurs d'onglet),
  `touch/settings-list.css` (bloc en fin de fichier), `preview-server.cjs` (une réponse du banc
  visuel), `verify-project.cjs` (un nom de test).

## Tests

- Serveur, 27 tests : emplacement, contenu du fichier, ordre `$n`, refus sans réglage, liste, borne
  et première gardée, deux sauvegardes dans la même seconde, fichiers étrangers jamais supprimés,
  fichier abîmé, nom hors dossier, comparaison (changé, ajouté, disparu, même nombre écrit
  autrement), écart depuis la dernière sauvegarde lisible, ordre d'écriture quand l'horloge recule,
  compteur repris après le plus grand du dossier, fichier illisible écrit en premier, fichier de
  plus de 256 Ko, borne de 400 réglages ; façade sur le vrai service (rien envoyé,
  pendant un usinage aussi, refus sans machine / sans réglages / pendant une relecture, pas d'action
  de restauration) ; API (session, service, champs transmis, refus, panne générique).
- Page, `test-settings-backup.cjs` : requêtes, états des boutons, tableau de comparaison, export,
  refus traduits, « Relire » par l'action existante et grisé comme sur 1 · Machine (six cas, avec
  les vraies règles de `seance.js`), message gardé quand une liste répond après coup, écart jamais
  montré pour un autre port, ligne de 1 · Machine (pluriel, singulier,
  incident, déconnexion), repli de la liste, fichier abîmé, anglais et espagnol, chargement par la page.
- Résultats sur le code livré (26 novembre, PC) :
  - `node examples/cncjs-touch/verify-project.cjs` → « 232/232 contrôles réussis » ;
  - `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false`
    → 60 suites, 1806 tests réussis ;
  - ESLint sans remarque sur les fichiers touchés ;
  - `node examples/cncjs-touch/browser-run.cjs --strict --only settings` (Chrome 158, relancé sur le code final après les
    constats mineurs) → « 0 violation(s), 0 excepted », « every step passed » ; l'étape `startup`,
    passée avant la correction de relecture, n'a pas été relancée depuis.
  Les autres étapes du harnais (`screens`, `v2`, `rail`, `e2e`…) n'ont pas été lancées par ce lot.

## Limites

- **La « carte » comparée est la dernière lecture `$$` du serveur**, pas la carte à l'instant.
  CNCjs ne relit `$$` qu'à la connexion et sur « Relire ». Un `$n=` tapé dans la console de CNCjs,
  ou par le Wi-Fi de la carte, n'est vu qu'après « Relire ». Un redémarrage de la carte sans
  reconnexion ne provoque pas de relecture : la ligne d'écart ne bouge pas tant qu'on n'a pas relu.
- La ligne de 1 · Machine est demandée au serveur deux fois par lecture des réglages (connexion,
  relecture, redémarrage de carte compté) : à la fin de la lecture, puis une fois 400 ms plus tard,
  y compris en v1 Éco. Raison (constat de relecture) : CNCjs ne recopie ce que son analyseur a lu
  vers le contrôleur que par une minuterie de 250 ms, après le `ok`. Tant que la copie n'est pas
  faite, le serveur refuse sauvegarde et comparaison (« lecture en cours ») et la liste ne donne
  aucun écart ; la seconde demande apporte le vrai. Sans cela, après « Relire », la carte pouvait
  garder « mêmes réglages » sur les anciennes valeurs.
- Reste une fenêtre étroite à la connexion : si la minuterie de CNCjs tombe au milieu de la réponse
  `$$` et qu'aucune ligne n'est encore arrivée ensuite, la copie partielle paraît à jour un instant.
  L'écart affiché est corrigé par la seconde demande ; une sauvegarde touchée dans ces quelques
  dixièmes de seconde serait incomplète (visible à son nombre de réglages).
- Une écriture de fichier coupée (panne de courant) laisse un fichier « illisible » dans la liste ;
  il est compté dans la borne et finira supprimé avec les plus anciens, même s'il est le premier.
- La **date affichée** d'une sauvegarde reste celle de l'horloge de la tablette : après un recul
  d'horloge, la liste est dans le bon ordre mais une date peut y paraître plus ancienne que la
  ligne du dessous. Un fichier nommé à l'ancienne façon (sans compteur) n'est pas reconnu : il
  n'est ni listé ni supprimé (aucun n'existe, rien n'a été installé).
- Le message de la carte (« Sauvegarde enregistrée », refus de « Relire ») reste jusqu'à l'action
  suivante dans la carte ; seul le message d'une liste en échec part à la liste suivante.
- « Relire » grisé ne dit pas sa raison dans la carte (elle est dans la barre de 1 · Machine).
- Les sauvegardes sont communes à toutes les machines du serveur ; chaque ligne porte son port, son
  firmware et son profil. L'écart est calculé contre la dernière sauvegarde, quelle que soit la
  machine : après un changement de machine, il annonce beaucoup de différences. C'est vrai, mais
  à lire comme tel.
- Sur le kiosque, « Exporter » dépend du téléchargement de Chromium (dossier de téléchargement de
  la tablette). Le fichier reste de toute façon sur le serveur.

## Constats mineurs de la relecture (26 novembre, second passage)

1. **Ordre dépendant de l'horloge** : corrigé (compteur dans le nom, référence = première lisible).
2. **Trois mutations survivantes** : trois tests ajoutés (port changé sans nouvelle réponse,
   fichier de plus de 256 Ko, 500 réglages → 400). Neuf mutations rejouées sur le code final
   (les trois du relecteur et celles des corrections 1, 3, 4) : toutes tuées.
3. **« Relire » de la carte** : même condition que 1 · Machine, lue dans `cncSeance.state()`.
4. **Message effacé par une liste tardive** : corrigé.
5. **Écarts au prompt déclarés, laissés tels quels** pour la réunion : le bloc CSS de
   `settings-list.css` placé avant la section v2 et non en toute fin de fichier ; le tableau de
   comparaison, la liste repliée et la ligne de 1 · Machine jamais vus dans un navigateur ; la
   liste demandée à chaque lecture des réglages sur toutes les pages, v1 Éco comprise.

## Non vérifié

- Le délai de 250 ms de CNCjs après « Relire » est établi par lecture de GrblController.js et
  rejoué par test avec un faux contrôleur, pas sur la carte.
- Rien sur la vraie carte, la vraie Surface, la RT (Chromium 106) : ni l'écriture du dossier sur
  la tablette (droits de l'utilisateur du service), ni le téléchargement en kiosque.
- Le rendu de la ligne ajoutée sur 1 · Machine (hauteur à 1366 × 768 et 1366 × 911) n'a été ni vu
  ni mesuré : le banc visuel ne produit jamais d'écart, donc la ligne n'y apparaît pas. Son
  comportement (texte, apparition, retrait) est prouvé par test, pas sa mise en page. La carte de
  Réglages, elle, a été vue sur la capture du harnais à 1366 × 768 (deux sauvegardes).
- Le tableau de comparaison et la liste repliée à plus de six lignes n'ont pas été vus dans un navigateur.

## Essai réel proposé

Voir `../refonte/PROTOCOLE-ESSAI.md`, section « N8 ». Sans mouvement, broche hors tension possible.
