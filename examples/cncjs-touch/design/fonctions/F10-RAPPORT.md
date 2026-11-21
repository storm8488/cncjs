# F10 — Rechargement automatique

Réalisation du 17 novembre 2026 dans `feat/F10`. Aucun accès tablette, RT ou CNC,
aucune installation, dépendance ajoutée, écriture Git ni commande machine.

## Comportement livré

- La lecture initiale de `VERSION.json` reste la version chargée, immuable.
  La version installée est relue toutes les 30 secondes, hors Réglages aussi,
  au retour de visibilité et au retour du suivi après une coupure de CNCjs.
  Les lectures utilisent une URL unique et demandent une revalidation HTTP.
- Si les deux versions connues diffèrent, un contrôle serveur de toutes les
  machines précède le bandeau « Nouvelle version : rechargement dans 10 s ».
  « Plus tard » reporte la proposition de dix minutes, même si la version est
  détectée à nouveau. FR, EN et ES sont fournis.
- Usinage ou pause, broche, palpage, prise d'origine, déplacement, chargement,
  état ancien/perdu, suivi absent, commande système, demande en cours, dialogue,
  champ en cours de saisie et page cachée empêchent le rechargement. Une interaction
  hors bandeau annule le délai et réserve dix secondes à l'opérateur. Les cartes
  inline de connexion USB, mises à jour et formulaires Wi-Fi sont aussi gardées.
- Au terme du délai, nouveau contrôle serveur de **toutes** les machines, puis
  nouvelle vérification locale. Erreur, réponse en 2,5 s ou plus, activité entre
  demande et réponse, ou fermeture de page : aucun rechargement tardif.
- La navigation remplace l'URL courante avec `touchReload=<date>` ; paramètres,
  préfixe et fragment sont conservés, sans ajouter une entrée d'historique.
  Cela contourne le document HTML en cache. Les ressources séparées sont
  revalidées par le serveur Touch (`maxAge: 0`) ; les bundles optionnels portent
  en plus un nom haché. Aucun recours à `reload(true)`, ignoré par Chromium.
- Une CNC déconnectée est admise lorsque le serveur revenu confirme qu'aucune
  machine n'est connectée. Un serveur injoignable n'est jamais assimilé au repos.
  La reprise FIGE reste propriétaire de la session et du flux : aucune ancienne
  action ni confirmation n'est restaurée. Sans version chargée connue, pas de
  rechargement automatique. Le bouton manuel P2 est conservé.

## Preuves et vérifications

`test-auto-reload.cjs` a été écrit avant le code : échec initial sur l'absence de
lecture périodique de version. Il couvre le délai, chaque blocage, Plus tard,
les réponses tardives, plusieurs machines, les traductions, les versions
identiques/inconnues et le contrat du harnais. Le test du parcours USB inline a
également été observé rouge avant son garde.

`test-auto-reload-recovery.cjs` charge les vrais propriétaires FIGE : `app.js`,
`job-stream.js`, `cnc-state.js` et `job-controls.js`. Il simule une coupure,
un refus de session, son renouvellement, une nouvelle epoch serveur, le retour
de la version installée et dix secondes de rapports au repos. Aucun POST machine.
Les deux tests sont inscrits à `verify-project.cjs`.

Relecture croisée en lecture seule : garde de connexion inline et couleur du
bandeau corrigées ; commentaire de cache rectifié pour les fichiers séparés.
Seconde passe : aucun blocage restant relevé. Les lectures de réglages et la
vérification du zéro pièce en cours bloquent aussi le rechargement.

Résultats : `verify-project.cjs`, **226/226** ; Jest touch/cncengine/api/simulateur,
**52 suites et 1 545 tests** ; test du montage/cache des ressources Touch,
**1 suite et 10 tests** ; ESLint des six fichiers JS/CJS touchés sans erreur.
`git diff --check` et contrôle des fins de ligne LF propres. Les journaux de
vérification sont sous `examples/cncjs-touch/output/F10-*-final.log` (ignorés).

Harnais tenté : `node examples/cncjs-touch/browser-run.cjs --strict --only settings,startup
--out examples/cncjs-touch/output/F10-browser` ; échec `WebSocket error` avant le
premier scénario. Aucun résultat géométrique ou tactile revendiqué. Le lanceur
dispose d'un nettoyage de son enfant à cet échec ; l'inventaire CIM des processus
Edge est refusé par Windows, donc l'absence de processus résiduel ne peut pas
être certifiée. Aucun navigateur étranger n'a été arrêté.

## Fichiers partagés

- `touch/i18n-messages.js` : deux lignes FR/EN/ES en fin de catalogue.
- `touch/touch-shell.css` : bloc F10 en fin de fichier, bandeau caché sans effet
  sur la géométrie existante ; couche sous les dialogues, hors bandeau d'arrêt.
- `verify-project.cjs` : deux tests ajoutés en fin de liste.
- `browser-run.cjs` : `settingsOffTabRequests` autorise uniquement le nouveau
  GET statique `VERSION.json?installed=<date>` hors Système ; les anciennes
  assertions de requêtes restent actives.
- `design/refonte/SURETE.md` et `PROTOCOLE-ESSAI.md` : compléments F10 en fin.

Production propre au lot : `touch/tablet-actions.js`. Aucun HTML, serveur,
garde de commande, nonce, fichier exclu ou seuil du harnais modifié.

## À prouver lors de l'essai réel

Suivre le complément F10 de `PROTOCOLE-ESSAI.md`, sans déplacement ajouté par F10.
Sur chaque tablette, cache préalablement chaud : une installation doit afficher
la nouvelle version sans clavier ni double rechargement, avec et sans redémarrage
de CNCjs. Vérifier le bouton Plus tard au doigt, le bandeau en FR/EN/ES et texte
agrandi, et l'annulation pendant les actions et les saisies. Vérifier les fichiers
séparés réellement servis, la version chargée après navigation, la conservation
de la session et l'absence de rejeu. Ces résultats matériels, le rendu Chromium
106, les délais réels et les capteurs ne sont pas vérifiés par les tests hors ligne.

## Reprise des vérifications rouges (17 novembre 2026)

Le journal fourni de `verify-project.cjs` était déjà vert (226/226). Le seul
échec Jest concernait le test existant `T/motion-simulator.test.js` (où `T`
désigne `src/server/services/touch/__tests__`), sans lien avec le rechargement.
Le garde refusait correctement le faux G10 L20, mais parfois dès X=-0,15,
avant l'arrivée à X=0 exigée dans le texte de l'erreur par le test.

Correction minimale : l'assertion de texte accepte explicitement une position X
numérique intermédiaire. Elle exige toujours le refus pour mouvement pendant
la définition d'origine ; la commande exacte reste vérifiée. Le test attend
désormais le repos du simulateur avant de vérifier X=0 au millième, avec le
délai borné existant. Aucun garde ou code de production n'est modifié. Cet
assouplissement de l'assertion de texte est volontaire et déclaré ; l'assertion
de position finale n'est pas supprimée.

Vérifications relancées dans cet arbre :

- `node examples/cncjs-touch/verify-project.cjs` : 226/226.
- Jest touch/cncengine/api/grbl-simulator, sans couverture : 52 suites,
  1 545 tests réussis.
- Test G10 L20 corrigé relancé isolément cinq fois : cinq réussites.
- ESLint des six fichiers JS/CJS F10 et du test corrigé : aucune erreur.
- Harnais strict `--only settings,startup` : `WebSocket error` avant le premier
  scénario. L'inventaire CIM Edge est refusé ; le nettoyage du lanceur est
  présent, mais l'absence de processus résiduel n'est pas certifiée.

Les nouvelles sorties sont `examples/cncjs-touch/output/F10-repair-*.log`
(ignorées). Sous PowerShell, `npx.cmd --no-install` utilise les dépendances
locales sans installation et évite le lanceur `npx.ps1` interdit par la politique
d'exécution. Cette reprise modifie seulement le test et ce rapport ; elle ne
retouche aucun fichier partagé de production du lot F10. Aucun accès matériel,
réseau externe, ajout Git ni commit. Les essais réels F10 ci-dessus restent requis.
