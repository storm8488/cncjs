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
2. **Nom** : `reglages-AAAAMMJJTHHMMSSZ.json`, heure UTC ; l'heure locale est affichée par la page.
3. **Borne** : 20 fichiers. Au-delà, les plus anciens partent, **jamais le premier** (référence)
   ni le dernier. Aucun bouton de suppression.
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

- Serveur, 22 tests : emplacement, contenu du fichier, ordre `$n`, refus sans réglage, liste, borne
  et première gardée, deux sauvegardes dans la même seconde, fichiers étrangers jamais supprimés,
  fichier abîmé, nom hors dossier, comparaison (changé, ajouté, disparu, même nombre écrit
  autrement), écart depuis la dernière sauvegarde lisible ; façade sur le vrai service (rien envoyé,
  pendant un usinage aussi, refus sans machine / sans réglages / pendant une relecture, pas d'action
  de restauration) ; API (session, service, champs transmis, refus, panne générique).
- Page, `test-settings-backup.cjs` : requêtes, états des boutons, tableau de comparaison, export,
  refus traduits, « Relire » par l'action existante, ligne de 1 · Machine (pluriel, singulier,
  incident, déconnexion), repli de la liste, fichier abîmé, anglais et espagnol, chargement par la page.
- Résultats sur le code livré (26 novembre, PC) :
  - `node examples/cncjs-touch/verify-project.cjs` → « 232/232 contrôles réussis » ;
  - `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false`
    → 60 suites, 1800 tests réussis ;
  - ESLint sans remarque sur les fichiers touchés ;
  - `node examples/cncjs-touch/browser-run.cjs --strict --only settings` (Edge 158) → « 0 violation(s), 0 excepted »,
    « every step passed » ; l'étape `startup` passée aussi avant les deux dernières retouches.
  Les autres étapes du harnais (`screens`, `v2`, `rail`, `e2e`…) n'ont pas été lancées par ce lot.

## Limites

- **La « carte » comparée est la dernière lecture `$$` du serveur**, pas la carte à l'instant.
  CNCjs ne relit `$$` qu'à la connexion et sur « Relire ». Un `$n=` tapé dans la console de CNCjs,
  ou par le Wi-Fi de la carte, n'est vu qu'après « Relire ». Un redémarrage de la carte sans
  reconnexion ne provoque pas de relecture : la ligne d'écart ne bouge pas tant qu'on n'a pas relu.
- La ligne de 1 · Machine n'est demandée au serveur qu'une fois par lecture des réglages
  (connexion, relecture, redémarrage de carte compté) : une requête, y compris en v1 Éco.
- Une écriture de fichier coupée (panne de courant) laisse un fichier « illisible » dans la liste ;
  il est compté dans la borne et finira supprimé avec les plus anciens.
- Les sauvegardes sont communes à toutes les machines du serveur ; chaque ligne porte son port, son
  firmware et son profil. L'écart est calculé contre la dernière sauvegarde, quelle que soit la
  machine : après un changement de machine, il annonce beaucoup de différences. C'est vrai, mais
  à lire comme tel.
- Sur le kiosque, « Exporter » dépend du téléchargement de Chromium (dossier de téléchargement de
  la tablette). Le fichier reste de toute façon sur le serveur.

## Non vérifié

- Rien sur la vraie carte, la vraie Surface, la RT (Chromium 106) : ni l'écriture du dossier sur
  la tablette (droits de l'utilisateur du service), ni le téléchargement en kiosque.
- Le rendu de la ligne ajoutée sur 1 · Machine (hauteur à 1366 × 768 et 1366 × 911) n'a été ni vu
  ni mesuré : le banc visuel ne produit jamais d'écart, donc la ligne n'y apparaît pas. Son
  comportement (texte, apparition, retrait) est prouvé par test, pas sa mise en page. La carte de
  Réglages, elle, a été vue sur la capture du harnais à 1366 × 768 (deux sauvegardes).
- Le tableau de comparaison et la liste repliée à plus de six lignes n'ont pas été vus dans un navigateur.

## Essai réel proposé

Voir `../refonte/PROTOCOLE-ESSAI.md`, section « N8 ». Sans mouvement, broche hors tension possible.
