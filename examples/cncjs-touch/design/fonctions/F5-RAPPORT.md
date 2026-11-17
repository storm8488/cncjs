# F5 — Reconnexion automatique

17 novembre 2026, arbre `cncjs-wt/F5`, branche `feat/F5`. Aucun commit : `.git` est en lecture seule, le pilote commite après sa vérification. Aucun paquet installé, lien `node_modules` conservé, fichiers modifiés en LF.

## Réalisé

- À la première disponibilité du suivi, une seule tentative vers le dernier port ouvert avec succès, uniquement après preuve locale `GET /api/touch-backlight` (`HTTP 200`, `local:true`). Aucun choix automatique d'un autre port USB. Sans historique réussi, la première connexion reste manuelle.
- Le port est mémorisé après acquittement réussi de l'ouverture, ou quand le suivi connecté rapporte une machine. Une erreur d'ouverture, une liste de ports et un simple choix ne remplacent pas ce souvenir.
- Réglage activé par défaut dans **Réglages → Machine et performances**, portée **Cette tablette**, textes FR/EN/ES et bouton `aria-pressed` conforme aux autres réglages. Stockage illisible : automatique désactivé. Réactiver ne déclenche rien avant le prochain chargement ; désactiver annule la préparation automatique encore en attente.
- Aucun rejeu après échec, coupure/retour du suivi, débranchement/rebranchement, nouveau paquet, ou retour du cache de navigation. Délais bornés, sockets éphémères sans reconnexion, lecture interrompue et réponses tardives ignorées. Le chemin manuel garde sa confirmation et ses options Grbl/115200.
- Garde serveur au moment de `open` : politique D3 sur le pair réel Socket.IO, service Touch démarré, aucun port ouvert, aucune ouverture en cours et aucun bail actif. Refuser même un bail du demandeur est un choix conservateur ; les baux des ports fermés sont normalement effacés. La réservation d'ouverture automatique exclut les autres ouvertures Socket.IO jusqu'à son résultat, y compris une ouverture manuelle concurrente.
- Un échec automatique présente la cause et le remède de connexion manuelle avec le composant de refus commun. Aucun ordre de déplacement, prise d'origine, déverrouillage, lancement de broche ou reprise ajouté.

## Tests

Développement test d'abord : `test-auto-connect.cjs` échoue sur l'absence de lecture de localité avant le code. Les deux suites Jest ciblées échouent également avant l'implémentation (6 échecs : politique manquante, ports ouverts et concurrence). Les assertions existantes sont conservées. Le banc moteur remplace ses contrôleurs avec `store.replace`, car `store.set` fusionne les objets et conservait des ports d'un test précédent.

La relecture a aussi ajouté une preuve JSON qui échouait : le `message` d'un objet `Error` disparaît lors de la sérialisation Socket.IO. Les nouveaux refus et erreurs d'ouverture automatique rendent donc un objet `{message}` sérialisable, avec leur raison conservée jusqu'à la page. Le format des erreurs du chemin manuel existant reste inchangé.

| Vérification | Résultat |
|---|---|
| `node examples/cncjs-touch/verify-project.cjs` | 225/225, code 0 ; relancée sur les dernières sources. |
| `npx.cmd --no-install jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false` | 52/52 suites, 1 553/1 553 tests, code 0, aucune exclusion. |
| `npx.cmd --no-install eslint` sur les 10 fichiers JS/CJS modifiés ou créés | Code 0, aucune erreur ni avertissement. |
| `git diff --check` et contrôle des octets de fin de ligne | Code 0 ; aucun CR dans les fichiers du lot. |
| `browser-run.cjs --strict --only settings --repeat 1` | Non validé : Chrome expire sur `Page.enable`, avant toute mesure. |
| Même étape avec Edge explicite | Non validé : `WebSocket error`, avant les scénarios. |
| Même étape avec le transport `ws` déjà installé (`node --no-experimental-websocket`) | Non validé : `read ECONNRESET`, avant les scénarios. Aucun changement du harnais ni installation. |

`npx.cmd` est employé car PowerShell interdit l'exécution de `npx.ps1`. `--no-install` interdit un téléchargement implicite. Les avertissements expérimentaux Node sur `localStorage` et les journaux des scénarios d'erreur Jest n'empêchent pas la réussite des suites.

## Fichiers partagés et points de réunion

| Fichier | Zone / modification |
|---|---|
| `touch/connect-cnc.js` | Propriétaire existant de la connexion : préférence, carte Réglages, tentative initiale, mémorisation réussie et annulation ; chaque session ne consomme qu'une réponse de liste. |
| `touch/i18n-messages.js` | Bloc ajouté près de la fin : sept lignes FR/EN/ES propres à F5. |
| `touch/touch-shell.css` | Deux sélecteurs des onglets Réglages : inclure `#ks-auto-connect` dans Machine, le masquer dans Affichage. Système le masque déjà. |
| `verify-project.cjs` | Fin de la liste : inscription de `auto-connect`. |
| `src/server/api/api.touch.js` | Import/réexport de `localRequest` ; même politique D3 et même champ `local`. |
| `src/server/lib/local-request.js` | Nouveau point commun de la politique D3, également utilisé pour Socket.IO. |
| `src/server/services/touch/index.js` | Hook `refuseAutoConnect` et export : localité et absence de bail. |
| `src/server/services/cncengine/CNCEngine.js` | État des ouvertures en cours et garde de l'événement `open` avant toute ouverture automatique. |
| `src/server/services/touch/__tests__/index.test.js` | Test ajouté de la politique locale et du bail réel. |
| `src/server/services/cncengine/__tests__/control-hook.test.js` | Tests ajoutés des ports, de la concurrence, du refus, de l'exception et du succès sans commande ; isolation du store. |
| `design/refonte/SURETE.md` | Complément F5 en fin de document. |
| `design/refonte/PROTOCOLE-ESSAI.md` | Complément F5 en fin de document, liste des quatre sources serveur à reconstruire. |

Nouveau banc dédié : `test-auto-connect.cjs`. Les chemins `touch/`, `design/` et le banc désignent `examples/cncjs-touch/`. Aucun changement d'`index.html` ou de `browser-run.cjs` à réunir.

## Non vérifié et essai réel attendu

Le harnais n'a produit aucune mesure : ni géométrie, ni défilement de la nouvelle carte, ni rendu FR/EN/ES standard/agrandi certifié sur les deux tablettes. L'inventaire CIM des processus navigateur a été refusé par le bac à sable ; les nettoyages du harnais ont été exécutés, mais l'absence de processus résiduel avec son profil temporaire n'est pas certifiée. Aucun navigateur non identifié n'a été arrêté.

Aucun accès Surface, RT, CNC ou réseau externe, aucun déploiement. La revue croisée reste à l'orchestrateur. Les tests prouvent les décisions logicielles, pas l'effet du port série ou le comportement du firmware réel. Un relais local sans en-tête et une application série extérieure restent hors de cette preuve, comme pour D3.

L'essai F5 ajouté au protocole doit prouver : une seule ouverture au démarrage vers le bon port ; aucun redémarrage si un port est déjà ouvert, depuis une page distante ou pendant une main attribuée ; aucune substitution de port ni seconde tentative après échec ; persistance de la désactivation ; aucun mouvement ni démarrage de broche et maintien de la prise d'origine/D2 après l'ouverture. Réaliser au repos, fraise en l'air et énergie de coupe empêchée, avec l'arrêt physique accessible.
