# V3 — Contre-vérification : kiosque et hôte (phase 2)

Agent V3, 2026-11-15, branche `feat/refonte-ui` (HEAD `20aeac36`, code de `3049a0e4`, cache `v2u`). Aucun fichier existant modifié ; aucun accès à la Surface, à la RT ni à la CNC.

Objet : les constats A3-1 à A3-8 et les soupçons S1 à S8 de `A3-kiosque-hote.md` ; le problème 8 de `ERGONOMIE.md` ; la ligne T14 de `MESURES.md` contre A3-3 ; les pistes C1 et C3 de `MESURES.md` ; deux remarques de `TEXTES.md` ; la règle de D3.

**Version 2 de ce livrable (relecture complète, 08:30).** La version de 05:41 a été revérifiée de bout en bout. Ce qui change :
- **A3-6** remonte à « à corriger » : un `$SLP` envoyé pendant un travail n'est pas sans effet (voir la fiche).
- **V3-5**, nouveau, sécurité machine : « Laser Off » du PC coupe la broche au milieu d'un programme CNC. Prouvé par `bughunt-V3-5.test.js`.
- **A3-2** : la réserve sur 14:25 est corrigée. A3-2 peut l'expliquer, mais seulement sous une condition peu probable ; le panneau noir de A3-2 se répare aussi de lui-même à la veille suivante.
- **S2** : une seconde forme est ajoutée, `--window` visant la mauvaise fenêtre de Chromium.
- **A3-3** : correction affinée. On ne fait plus `preventDefault`, mais on garde `stopImmediatePropagation`.
- **D3** : la règle gagne un réveil au toucher par la page locale, ce qui rend « toujours » vrai face à toute page locale qui éteint l'écran. La limite du relais sans en-tête est précisée.

## Tests relancés ou créés (chacun seul, 08:30)

| Test | Résultat |
|---|---|
| `node examples/cncjs-touch/test-bughunt-A3-1.cjs` | 6 attentes non satisfaites sur 14, comme annoncé |
| `npx jest …/bughunt-A3-1.test.js --coverage=false` | 2 échecs, 2 réussites, comme annoncé |
| `npx jest …/bughunt-A3-2.test.js --coverage=false` | 2 échecs, 1 réussite, comme annoncé |
| `npx jest …/bughunt-A1-10.test.js --coverage=false` | 1 échec, 2 réussites (doublon serveur d'A3-1) |
| `examples/cncjs-touch/test-bughunt-V3-1.cjs` (ERG-8) | 2 échecs, 2 réussites. Alarm → Home → Idle et Alarm → `$X` → Idle laissent la v1 ; les deux témoins passent. |
| `examples/cncjs-touch/test-bughunt-V3-2.cjs` (C3) | 1 échec (10 images demandées pour 10 paquets au repos en v2), 4 gardes de retour à v1 qui passent |
| **nouveau** `src/server/services/touch/__tests__/bughunt-V3-5.test.js` | 2 échecs, 1 réussite. Avec le vrai `GrblController` et une liaison série factice, `lasertest:off` et `sleep` écrivent `M5S0` et `$SLP` dans un programme en cours ; la politique de pilotage les juge libres. |
| Prototype jetable, hors dépôt (`…/scratchpad/refonte/V3/proto`, C1 et C3 corrigés) | Relancés à 08:30 et passés : `test-bughunt-V3-2`, `test-v2-gate`, `test-wifi-settings`, `test-v2-machine-release`, `test-tablet-profile`. À 05:30 étaient aussi passés : `test-scenario-profiles`, `test-v2-files-frames`, `test-v2-i18n`, `test-preview-gl`, `test-plain-403`, `test-settings-identity`, `test-text-keyboard`. |
| Script jetable `…/scratchpad/refonte/V3/addresses.cjs` | Relancé. Il relève les adresses de socket vues par Node : écoute sur `0.0.0.0` et sur `::` ; client sur `127.0.0.1`, `localhost`, `::1`, une adresse IPv4 et une adresse IPv6 de ce PC (voir D3). |

`test-bughunt-V3-1.cjs` et `test-bughunt-V3-2.cjs` reprennent le harnais VM de `test-v2-gate.cjs` (lignes 2 à 84) et chargent le vrai `tablet-profile.js`. Ce sont les preuves d'ERG-8 et de C3, pas des défauts nouveaux. Les défauts nouveaux sont V3-3, V3-4 et V3-5.

---

## Tableau

| Id | Verdict | Gravité | En une phrase |
|---|---|---|---|
| A3-1 | confirmé | sécurité machine | Toute page (ici le Chrome du PC) éteint le panneau de la Surface. Le kiosque éveillé ne le rallume pas, et ses touchers à l'aveugle atteignent les commandes. Doublon côté serveur : A1-10. |
| A3-2 | confirmé avec réserve | bloquant | Après un redémarrage de CNCjs pendant la veille, `wake()` ne fait rien. Réserve : le défaut se répare de lui-même à la veille suivante d'une page, s'il y en a une, et il n'explique 14:25 que si aucune page ne s'est endormie depuis le redémarrage de 11:10. |
| A3-3 | confirmé avec réserve | à corriger | Le chemin de code est exact : la touche est annulée pendant la veille. Réserve : rien ne prouve que c'est *la* cause de T14 ; S2 l'explique aussi bien. |
| A3-4 | confirmé | mineur | L'onglet Système lit `VERSION.json` à son premier affichage, pas au chargement de la page : il peut annoncer une version qui ne tourne pas. |
| A3-5 | confirmé avec réserve | à corriger | Le `close` de Socket.IO n'est pas gardé par le bail. Réserve : il faut un clic délibéré sur le PC, et la tablette retrouve Arrêter en rouvrant le port. La broche, elle, continue de tourner. |
| A3-6 | confirmé avec réserve | à corriger | `sleep` (`$SLP`) est libre pour tous. Au repos, il fait perdre la référence. Pendant un travail, la carte le refuse, ce qui met le travail en pause sur erreur et fausse le décompte du flux. Doublon partiel : V3-5. |
| A3-7 | confirmé avec réserve | mineur | Le mot de passe passe dans les arguments de `nmcli`. Réserve : la correction « `nmcli --passwd-file` » n'existe pas sous cette forme, et le mot de passe circule déjà en clair en HTTP. |
| A3-8 | confirmé | mineur | Rien du kiosque de la Surface n'est dans le dépôt : ni `.xinitrc`, ni l'URL, ni la méthode de déploiement. |
| S1 | non tranché | — | Rechargement avant que Node écoute, après `pm2 restart`. Sans objet pour 17:48 : ce jour-là, seules les pages ont été installées, sans redémarrage. |
| S2 | non tranché (poids relevé) | — | La touche n'atteint pas Chromium : `xdotool key --window` passe par `XSendEvent`, ou vise une fenêtre de Chromium qui n'est pas la bonne. Explique 14:25 et 17:48. |
| S3 | non tranché | — | Plafond de 8 flux : il faudrait 8 onglets ouverts. |
| S4 | non tranché | — | `chromium` peut être mis à jour la nuit par `unattended-upgrades` (origine Debian-Security, 03:30). |
| S5 | non tranché | — | Kiosque sur l'adresse Wi-Fi : dépend de `~/.xinitrc`. |
| S6 | confirmé (limite) | mineur | La fenêtre de mesure et le Chromium sans écran (ports 9230 et 9231) sont locaux sous toute règle. Leur veille éteint déjà l'écran aujourd'hui. |
| S7 | non tranché | — | DPMS : hors dépôt, peu probable. |
| S8 | sans objet | sans objet | `reset` libre pour tous : c'est la décision F5. La contestation est seulement notée. |
| ERG-8 | confirmé | à corriger | Toute activité vue avant le premier repos (alarme, prise d'origine, `$X`) ferme la v2 jusqu'au rechargement. Le verrou après un travail est documenté ; celui après une alarme ou une prise d'origine ne l'est pas. |
| T14 | MESURES tient ; A3-3 plausible, non prouvé | à corriger | Les suffixes `?v=` ne sont pas la cause. A3-3 est une cause possible ; S2 en est une autre, au moins aussi probable. |
| C1 | confirmé | mineur | La correction est plus simple que celle proposée : comparer avant d'écrire. |
| C3 | confirmé | mineur | Sûr avec une garde d'une ligne. Les retours à v1 sont prouvés par V3-2. |
| TXT-HANDOFF | confirmé avec réserve | mineur | `motion.js:244-247` renvoie à « l'étape 0 de HANDOFF.md ». Réserve : le remède proposé par TEXTES (« déplacez-le à la main ») n'est pas le bon. |
| TXT-STARTUP | confirmé | mineur | `startup.js` et le texte de `#cnc-boot` dans `index.html` ne sont qu'en français. |
| D3 | règle recommandée | sécurité machine | Seule une page reconnue locale peut éteindre l'écran (boucle locale, ou adresse distante égale à l'adresse locale, sans en-tête de mandataire). Tout réveil est accepté, et la page locale réveille l'écran au toucher. |
| V3-3 | nouveau | mineur | `PERFORMANCE-V2-USAGE.md` l. 33 dit qu'un état inconnu à l'ouverture ferme la v2 pour la session ; le code, lui, attend le premier repos. |
| V3-4 | nouveau | à corriger | Les corrections proposées pour D3 se contredisent. A3-1 refuse un réveil distant, A1-10 l'exige (son test 3). Refuser le réveil rendrait l'écran noir irrécupérable si la page locale était mal reconnue. |
| V3-5 | nouveau | sécurité machine | « Laser Off » du PC (`lasertest:off`, libre pour tous) écrit `M5S0` au milieu d'un programme CNC lancé par la tablette. La broche s'arrête et les passes suivantes coupent avec la broche arrêtée. |

---

## Fiches

### A3-1 — Une page distante éteint l'écran du kiosque

- **Verdict** : confirmé. Gravité maintenue : sécurité machine. Doublon côté serveur : A1-10 (qui le classe bloquant).
- **Relu** :
  - `screen-saver.js:27-37` → `announce(true)` → `touch/backlight.js:109-113`. `mode` vaut `off` par défaut (`:14`). `state` reste nul tant que Réglages → Affichage n'a pas été ouvert (`load()` exige `shown()`), donc la garde `:112` ne filtre rien.
  - `api.touch.js:147-156` : seule la session est vérifiée.
  - `services/touch/index.js:183` → `services/touch/backlight.js:112-113` écrit `'0'`.
  - Côté kiosque : `retryWake` (`:107`) exige `wakePending`, et `:114` exige `dimmed`. Le kiosque éveillé n'a donc aucun moyen de rallumer l'écran.
  - Seule la veille du kiosque, suivie de son réveil, rallume : son extinction remet `temporary` à vrai. L'écran reste donc noir tant que l'opérateur est actif, c'est-à-dire au pire moment.
- **Tests** :
  - Le Jest appelle le vrai `postBacklight` avec une requête réaliste (socket `::ffff:192.168.1.23`) : la preuve est valable.
  - Le test de page fait tourner les vrais `screen-saver.js` et `backlight.js` contre le vrai module serveur. Seul l'aiguillage d'`api.touch` y est recopié (6 lignes).
  - Sa troisième attente (« un toucher sur écran noir ne doit pas actionner une commande ») va au-delà de D3. Avec la règle recommandée (fiche D3), un écran noir sous une page éveillée ne survit plus au premier toucher. Ce premier toucher atteint encore la commande : voir la fiche D3, point 3.
- **Réfutation cherchée** : aucune garde ailleurs sur le chemin, aucune décision documentée, aucun fait de la carte en jeu. Le mémo de terrain du 14 à 23:43 relève 3 connexions depuis le PC.
- **Correction** : voir la fiche D3. A3 propose aussi de refuser un réveil distant : c'est rejeté en V3-4.
- **Fichiers** : `src/server/api/api.touch.js`, `examples/cncjs-touch/touch/backlight.js`, les catalogues i18n.
  - Test existant à ajuster : `api/__tests__/api.touch.test.js:224-238`. Son `makeReq` (`:25`) n'a pas de socket, et une requête sans socket deviendrait distante. Il faut lui donner une socket locale : on ajuste le montage, on ne retire aucune assertion.

### A3-2 — Après un redémarrage de CNCjs pendant la veille, rien ne rallume l'écran

- **Verdict** : confirmé avec réserve. Gravité : bloquant.
- **Relu** :
  - `services/touch/backlight.js:66-74` : un panneau trouvé à 0 donne `userPercent = 50` et `temporary = false`.
  - `wake()` (`:121-128`) n'agit que si `temporary` est vrai.
  - `restore()` (`:152-163`) ne fait rien sans `touch.backlight.percent`.
  - Le test existant `backlight.test.js:189-197` ne couvre « panneau sombre au démarrage » que par `dim` puis `wake`. Le trou est réel.
  - Le défaut existe aussi **sans** rechargement : la page qui avait éteint l'écran envoie son réveil au toucher, et ce réveil ne fait rien.
- **Réserves** :
  - Il faut un `pm2 restart` pendant que le panneau est à 0, et aucun niveau mémorisé dans le `.cncrc` de la Surface. Ce second point n'est pas vérifié.
  - **Le défaut se répare de lui-même** dès qu'une page s'endort de nouveau, puisque `dim` remet `temporary` à vrai ; le toucher suivant rallume alors à 50 %.
  - Mais un opérateur qui touche l'écran noir garde sa page éveillée. Elle ne s'endort donc jamais, et l'écran reste noir pendant qu'il touche des commandes à l'aveugle. La gravité « bloquant » tient, avec le même risque de touchers à l'aveugle qu'A3-1.
  - **14:25** (« reloading the kiosk… leaves the screen black ») : le réveil au chargement (`touch/backlight.js:165`) existe depuis `ae1db422` (2026-10-16), donc la remarque du mémo (« page fix still TODO ») est fausse.
    - A3-2 explique ce cas seulement si aucune page ne s'est endormie entre le `pm2 restart` de 11:10 et 14:25. C'est peu probable sur trois heures.
    - S2 l'explique si ce premier rechargement n'a pas eu lieu. Il faut alors un second rechargement, que le mémo ne mentionne pas.
    - A3-3 ne l'explique pas : la touche avalée réveille l'écran.
    - Non tranché.
- **Correction** :
  - `wake()` applique le niveau si `temporary || current() < MIN_PERCENT`.
  - `restore()` : sans niveau mémorisé et avec un panneau sous `MIN_PERCENT`, il applique `userPercent` (50). Une veille n'est jamais mémorisée, donc un panneau noir au démarrage n'est jamais voulu.
  - Ces deux règles gardent vert `backlight.test.js:130-141` (panneau à 128 sans niveau mémorisé : rien ne change).
- **Fichiers** : `src/server/services/touch/backlight.js`, `__tests__/backlight.test.js` (nouveaux cas).

### A3-3 — Le premier Ctrl+Maj+R est avalé par l'écran de veille

- **Verdict** : confirmé avec réserve. Gravité : à corriger.
- **Relu** :
  - `screen-saver.js:66-79` : l'écoute est en capture sur `window`. Pendant `asleep || waking`, chaque touche reçoit `preventDefault` et `stopImmediatePropagation`.
  - `waking` dure 450 ms après le relâchement (`:53-56`).
  - Le test le montre avec la vraie suite d'événements de `xdotool`.
  - Effet de bord relevé : `stopImmediatePropagation` en capture sur `window` empêche aussi `retryWake` (écouteur `document`, `backlight.js:108`) de voir cette touche. C'est sans conséquence, car `announce(false)` envoie déjà le réveil.
- **Réserves** :
  1. Je n'ai pas vérifié que Chromium renonce au rechargement quand la page annule la touche. D'après ce que je sais de Chromium, la touche part d'abord à la page, et le navigateur ne traite que les raccourcis qu'elle n'a pas annulés, sauf une courte liste de raccourcis réservés (Ctrl+N, Ctrl+T, Ctrl+W…) dont le rechargement ne fait pas partie. Ni mesuré, ni vérifié dans les sources.
  2. Le lien avec T14 n'est pas prouvé. À 17:48, le kiosque était-il en veille ? On ne le sait pas. S2 explique ce cas aussi bien, et il est le seul à expliquer 14:25.
- **Correction** : celle d'A3 est juste, mais je l'affine.
  - Une touche avec `ctrlKey || metaKey || altKey`, ou `F5`, compte comme un réveil : `announce(false)` et `track`.
  - On ne lui fait **pas** `preventDefault`, pour que le navigateur recharge.
  - On **garde** `stopImmediatePropagation`, pour qu'aucun écouteur de la page ne la voie.
  - J'ai cherché `ctrlKey`, `metaKey`, `altKey` et `F5` dans `touch/*.js` : aucun gestionnaire ne réagit à une touche modifiée. Les seuls résultats sont des noms de variables de `origin-preview.js`.
  - La touche reste ciblée sur le bouton de veille, et la page reste inerte. Les touchers restent voilés.
- **Tests** : `test-screen-saver.cjs` à étendre. Aucun test existant ne fige l'annulation des touches modifiées ; non prototypé.

### A3-4 — Version annoncée au lieu de version chargée

- **Verdict** : confirmé, mineur. `tablet-actions.js:149` : `if(info)checkRemote();else loadVersion();`, au premier affichage seulement (`loadVersion`, `:142-147`).
- **Correction** :
  - Lire `VERSION.json?<horodatage>` une fois, au chargement de la page : c'est la version chargée.
  - À chaque ouverture de l'onglet Système, relire la version installée. Si les deux diffèrent, afficher « Nouvelle version installée — Recharger », avec un bouton `location.reload()` refusé hors repos.
  - C'est une requête de plus au chargement, hors v2 : elle est permise en Éco (§ 5.5).
- **Fichiers** : `touch/tablet-actions.js`, `test-system-updates.cjs` ou `test-tablet-actions.cjs`.

### A3-5 — Le PC ferme le port que la tablette pilote

- **Verdict** : confirmé avec réserve. Gravité corrigée : à corriger, au lieu de sécurité machine.
- **Relu** :
  - `CNCEngine.js:317-347` : aucun appel à `refused()`, contrairement à `command` (`:349-362`). `GrblController.close()` n'envoie rien à la carte.
  - Le Jest A3-2 émet un vrai `close` sur le vrai `CNCEngine` : la preuve est valable.
  - La page tactile n'émet jamais `close` (recherche dans `touch/*.js`).
- **Réserves** :
  - Il faut un clic délibéré sur « Fermer », dans l'interface classique du PC.
  - Le flux s'arrête : la carte ne finit que ce qu'elle a déjà reçu, soit quelques secondes de mouvement. La broche reste allumée.
  - La tablette retrouve Arrêter en rouvrant le port (barre « Connecter la CNC ») ; rouvrir ne redémarre pas cet ESP32 (mémo du 14 à 16:30).
  - Le danger est réel (broche dans la matière sans arrêt logiciel), mais il ne vient pas d'un toucher de l'opérateur.
- **Correction** : celle d'A3 est juste et minimale.
  - Avant `controller.close`, appeler `refused(port, 'command', 'close')`. `safeCommand('close')` vaut faux, donc la fermeture est gardée : refusée quand un autre client pilote, permise au pilote ou sur un port libre.
  - Effet de bord : `service.socketCommand(port, false)` remet `foreignHome` à `null`, comme toute commande non sûre. Sans conséquence.
  - L'option « refuser aussi pendant un travail, quel que soit l'appelant » est un garde ajouté. Elle est à décider, et à inscrire dans `SURETE.md`.
- **Fichiers** : `CNCEngine.js`, `cncengine/__tests__/control-hook.test.js`.

### A3-6 — `sleep` libre pour tous

- **Verdict** : confirmé avec réserve. Gravité : **à corriger** (celle d'A3). La version 1 de ce livrable la descendait à « mineur » : c'était une erreur.
- **Relu** :
  - `control.js:43-44` ; `GrblController.js:1500-1503` (`writeln('$SLP')`), une ligne ordinaire écrite tout de suite sur le port.
  - Grbl_ESP32 enregistre `new GrblCommand("SLP", "System/Sleep", sleep_grbl, idleOrAlarm)` (`ProcessSettings.cpp`, commit `1f2c8a37` que cite `FIRMWARE.md`) : la commande n'est permise qu'en Idle ou en Alarm.
- **Ce qui arrive vraiment** :
  - **Au repos**, dans la fenêtre du bail (5 min au plus) : les moteurs sont coupés et le réveil exige un reset. Sur cette carte, c'est peut-être un redémarrage (FIRMWARE H1). La référence est perdue.
  - **Pendant un travail** : la carte répond `error`. Le gestionnaire `runner.on('error')` de `GrblController.js:635-668`, en état `running`, l'attribue à la ligne courante du programme.
    - Il met le travail en pause sur erreur (`workflow.pause` → `sender.hold` : l'envoi s'arrête, sans retenue, donc la machine s'arrête en fin de file, broche allumée).
    - Il fait un `sender.ack()` de trop. Le décompte des caractères de `Sender.js:319` se décale d'une ligne, car `ack` n'est refusé que si `received >= sent`.
  - Preuve de l'écriture : `bughunt-V3-5.test.js`, test 3. La réponse de la carte et la pause relèvent de la lecture du code (`GrblController.js:635-668`), pas d'un test.
  - La conséquence du décalage (une ligne de trop dans la mémoire de réception, fin du travail annoncée une ligne trop tôt) n'est pas prouvée.
- **Correction** : retirer `'sleep'` de `SAFE_COMMANDS`, comme le propose A3.
  - Cela **casse une assertion existante** : `control.test.js:202` range `sleep` parmi les commandes sûres. Il faut la déplacer dans la liste des commandes gardées (`:208`), le dire, et l'inscrire dans `SURETE.md`.
  - À traiter avec V3-5, dans le même commit.

### A3-7 — Mot de passe Wi-Fi dans la ligne de commande

- **Verdict** : confirmé avec réserve, mineur (`wifi.js:155`).
- **Réserves** :
  - La Surface n'a qu'un utilisateur, `pi`. Lire `/proc/<pid>/cmdline` suppose déjà d'exécuter du code sur la tablette.
  - Le mot de passe arrive déjà en clair, par HTTP, sur le réseau local.
  - `nmcli --passwd-file` n'est pas une option globale. `passwd-file` est un argument de `nmcli connection up`.
- **Correction** :
  - La forme correcte : `connection add type wifi … wifi-sec.key-mgmt wpa-psk` sans la clé, puis `connection up id … passwd-file <fichier 0600>`. Le fichier contient `802-11-wireless-security.psk:<secret>`.
  - Il faut aussi supprimer le profil si la connexion échoue, et supprimer le fichier dans un `finally`.
  - C'est plus long que le défaut ne le vaut : basse priorité.
  - À essayer sur le `nmcli` de Debian 13 ; non vérifié ici.

### A3-8 — Le kiosque de la Surface n'est pas dans le dépôt

- **Verdict** : confirmé, mineur.
  - `git grep -i xinitrc` ne trouve que `design/PROMPT-REGLAGES-PERF.md` et le rapport A3.
  - L'URL du kiosque n'apparaît nulle part. Le mémo de la Surface dit seulement : « `.xinitrc` attend `:8000/touch/` », plus un `~/.kiosk-url` facultatif pour une page temporaire.
  - `INSTALL.md` donne `http://localhost:8000/touch/` pour la RT ; `design/ops/sim-surface/chrome.sh` ouvre `127.0.0.1` pour la fenêtre de mesure.
- **Correction** : celle d'A3 est juste : `kiosk/.xinitrc`, unité getty, `deploy-surface.sh`.
  - L'URL du kiosque est `http://127.0.0.1:8000/touch/`.
  - `VERSION.json` est écrit en dernier.
  - Le rechargement passe par `xdotool` **sans** `--window`, avec `--clearmodifiers`, après avoir activé la fenêtre (S2).
  - Aucun secret dans le dépôt.

### Soupçons S1 à S8

- **S1** : reste un soupçon, sans objet pour 17:48. `0cb5d90a` ne touche que des pages : il n'y a pas eu de `pm2 restart` à ce moment. Pour trancher : horodater le démarrage de CNCjs après un `pm2 restart` sur la Surface, puis recharger dans cette fenêtre.
- **S2** : poids relevé. C'est l'explication la plus économique des deux faits de terrain. Deux formes possibles :
  - Chromium ignore l'événement de synthèse `XSendEvent`.
  - `--window <id>` vise une autre fenêtre de Chromium que celle du kiosque : `xdotool search --class chromium` en rend plusieurs, dont des fenêtres non affichées.

  Contre S2 : le mémo du 2026-11-06 donne `--window` comme méthode, et le passage en v2 avait été vu ce jour-là. Pour trancher, sur la Surface, kiosque **éveillé** : `xdotool key --window <id> ctrl+shift+r` pour chaque `id` rendu, puis la même touche sans `--window`. Puis les mêmes essais, kiosque **en veille**. On lit la date du `GET /touch/` dans le journal de CNCjs.
- **S3** : reste un soupçon. Relu : `touch-stream.js:10,146` (8 flux, chacun vit 60 s au plus, `:14`) et `control.js:129-137`. L'expiration de la grâce passe avant `busy`, c'est exact. Mais il faudrait 8 onglets ouverts. Pour trancher : un test Jest qui ouvre 8 flux, puis celui de la tablette.
- **S4** : reste un soupçon. Fait relu dans le mémo du 07 : `unattended-upgrades` est limité à l'origine Debian-Security, à 03:30, et `chromium` passe par cette origine. Pour trancher : `zgrep chromium /var/log/apt/history.log*` sur la Surface.
- **S5** : reste un soupçon ; c'est la question de l'URL (A3-8). Avec `127.0.0.1`, il disparaît.
- **S6** : confirmé comme limite. La fenêtre de mesure (`chrome.sh`, port 9230) et le Chromium sans écran du 14 à 15:00 (port 9231) ont leur propre `localStorage`. Ils ont donc une veille de 5 min en mode « Écran éteint », et ils éteignent déjà le panneau aujourd'hui. Sous D3, ils restent locaux. La règle recommandée (point 3 de D3) rend le défaut sans gravité, puisqu'un toucher sur le kiosque rallume. En plus, la procédure de mesure pose `cncjs-touch-backlight-v1 = {"sleep":"keep"}` dans son profil.
- **S7** : reste un soupçon, peu probable (`brightness = 0` lu sur le terrain).
- **S8** : sans objet. C'est la décision F5 (`control.js:34-44`) ; `autolevel:stop`, libre lui aussi, n'est qu'un `reset` (`GrblController.js:1865-1868`).

### ERG-8 — Une alarme ou une prise d'origine avant le premier repos laisse la v1 jusqu'au rechargement

- **Verdict** : confirmé. Gravité : à corriger.
- **Relu** :
  - `tablet-profile.js:309-310` : sans disposition v2, toute activité vue pose `v2Blocked = true`. Le code ne le remet jamais à faux.
  - Ce verrou empêche l'ouverture (`v2Apply:266`, `v2Refresh:255`). Réglages affiche alors « Changement préparé pour la prochaine session au repos ».
  - `test-bughunt-V3-1.cjs` le montre :
    - témoin : port fermé, puis Idle → v2 ;
    - Alarm → Home → Idle → v1, état `{gate:false, reason:'waiting'}` ;
    - Alarm → `$X` → Idle → v1 ;
    - travail → Idle → v1, ce qui est voulu.
  - Sur la LUNYEE (`$22=1`), la carte démarre en Alarm (`FIRMWARE.md` : Grbl.cpp:44). La mise en route normale (port ouvert → Alarm → `$H`) laisse donc la tablette en v1. La v2 ne s'ouvre qu'après un rechargement au repos, ce que le mémo du 06 décrit déjà : « v2 only opens at a fresh Idle report ».
- **Est-ce voulu ?**
  - Pour un travail, oui. C'est écrit dans `PERFORMANCE-V2-USAGE.md` l. 33 et testé dans `test-v2-gate.cjs:129` (`late`). La raison : ne pas déplacer les commandes sous le doigt à la fin d'un travail.
  - Pour une alarme, une prise d'origine ou un déverrouillage, non. Aucun document ne le dit, et le prompt de mission (§ 2) décrit le contraire : « v1 tant que la CNC n'est pas connectée et au repos, puis v2 ».
  - Le code ouvre déjà la v2 au milieu d'une session (port fermé, puis premier Idle). Étendre ce cas à « après une alarme » ne crée pas de nouveau risque sous le doigt.
- **Règle simple recommandée** : la v2 s'ouvre au premier rapport frais au repos de la session.
  - Ce qui précède ce repos ne la ferme pas : port fermé, état inconnu, alarme, prise d'origine, déverrouillage, déplacement.
  - Exception : un travail vu avant ce repos garde la v1 pour la session, comme aujourd'hui et comme c'est documenté. Un travail, c'est `workflow` différent de `idle`, `canStop`, `loading`, `probing` ou `probeBusy`, `d.busy` ou `d.halt`.
  - Concrètement, à `tablet-profile.js:309-310`, ne poser `v2Blocked` que pour ces cas. Ne plus le poser pour un `activeState` différent d'Idle, ni pour `homing`, `jog`, la broche seule ou `systemCommand`.
  - La porte ne change pas : `v2Idle()` exige toujours un vrai repos.
  - Cette règle ne casse aucune assertion de `test-v2-gate.cjs`. Ses cas `{activeState:'Alarm'}` et `{homing:true}` (`:112-113`) vérifient seulement qu'aucune requête ne part *pendant* l'état, et `late` concerne un travail. Non prototypée.
  - Pour la spec : avec « une seule organisation pour les deux rendus » (§ 5.5), le passage à la v2 ne change plus que le rendu. On pourrait alors choisir le rendu à l'ouverture de la page, d'après les seules capacités, et ne garder l'attente du repos que pour charger les ressources de la v2. C'est à décider par le jury, pas ici.
- **Fichiers** : `touch/tablet-profile.js`, `test-v2-gate.cjs` (nouveaux cas), `design/v2/PERFORMANCE-V2-USAGE.md` (voir V3-3), `PERFORMANCE-UI-SPEC.md`.

### T14 — MESURES (les suffixes `?v=` ne sont pas la cause) contre A3-3 (la veille avale la touche)

- **Verdict** : MESURES tient. A3-3 est plausible mais n'est pas prouvé comme cause. Les deux ne s'opposent pas : MESURES dit ce qui **n'est pas** la cause, A3-3 propose **une** cause.
- **Ce qui tient de MESURES** : relu `settings.base.js:53-59` → `app.js:153-158` (`serveStatic`, `maxAge: 0`). La Surface sert `touch/` depuis `dist` (mémo du 05 : « no mount point »).
  - Avec un ETag et `max-age=0`, chaque chargement revalide chaque fichier, même sous un suffixe inchangé.
  - Aucun service worker. 0 suffixe en retard sur 82 datés.
  - Je n'ai pas refait leur mesure d'en-têtes, mais le chemin de code la confirme.
- **Ce qui ne tient pas d'A3-3** : il n'est pas prouvé qu'A3-3 soit *la* cause (voir A3-3 et S2). À 14:25, l'écran est resté noir après le rechargement. C'est incompatible avec une touche avalée par la veille, car cette touche réveille l'écran. C'est compatible avec S2 (touche jamais reçue), et avec A3-2 sous une condition peu probable.
- **Ce qu'il faut pour qu'une installation soit visible au premier rechargement** :
  1. Une touche qui atteint vraiment Chromium. Le déploiement envoie `xdotool search --class chromium windowactivate`, puis `xdotool key --clearmodifiers ctrl+shift+r` **sans** `--window` (XTEST, fenêtre active).
  2. Une touche que la page ne retient pas : correction A3-3.
  3. `VERSION.json` écrit en dernier, et pas de rechargement avant que `/touch/` réponde 200 si `pm2` a été relancé (S1, A3-8).
  4. La version chargée visible dans l'onglet Système, pour voir l'échec sans SSH (A3-4).
  5. Un rechargement simple suffit, sans contourner le cache : `max-age=0` fait revalider.

  Le rechargement automatique au changement de `VERSION.json` (A3 § 2.2) est le plus robuste, car il ne dépend plus des touches. Il ajoute une relecture périodique et un rechargement au repos : c'est au jury de dire s'il le range dans la correction de T14 ou dans `IDEES.md`. La piste C7 (une seule valeur de cache) reste un gain d'entretien, sans effet sur T14.

### C1 — `wifi-settings.js:179` réécrit `disabled` sur tous les boutons à chaque paquet

- **Verdict** : confirmé, mineur.
- **Relu** : `disable()` (`:83-89`) écrit `b.disabled = blocked` sans comparer, à chaque `cnc-job-status`, Réglages caché compris.
  - Poser à `true` une propriété reflétée sur un bouton déjà désactivé refait `setAttribute`. Par la spécification DOM, cela produit un enregistrement de mutation à chaque fois. Remettre à `false` un attribut absent ne produit rien.
  - D'où l'écart de MESURES : 40 mutations / 10 s au repos, contre 2 016 / 10 s pendant un travail. 2 016 / 56 paquets ≈ 36 boutons par paquet.
  - Aucun `MutationObserver` ne surveille ces boutons : ceux de `viewport-fit.js`, `status-strip.js` et `coordinate-display.js` portent sur d'autres nœuds. Le coût est donc faible, réduit à l'écriture et à l'invalidation sur un sous-arbre caché.
- **Suppression sans risque ?** Oui, sous une forme plus simple que celle de MESURES : `if (b.disabled !== blocked) b.disabled = blocked;` pour chaque bouton.
  - Même sens, aucun état gardé, donc aucun risque d'état périmé à l'ouverture de l'onglet. C'est le modèle déjà suivi par `backlight.js:55`.
  - Le prototype ne compare que les listes (réseaux et clavier), pas les quatre boutons nommés : cela suffit à l'indicateur.
  - Prototype : `test-wifi-settings` passe (relancé) ; `test-text-keyboard`, `test-settings-identity` et `test-plain-403` passaient à 05:30.
  - La proposition de MESURES (« seulement si l'état change, et à l'ouverture de l'onglet ») ajoute un état gardé, et un risque, pour un gain identique.
- **Non vérifié** : le gain en temps sur la Surface et sur la RT. L'indicateur est un nombre de mutations, pas des millisecondes.

### C3 — `tablet-profile.js:256` demande une image à chaque paquet en v2

- **Verdict** : confirmé, mineur. `test-bughunt-V3-2.cjs` compte 10 images demandées pour 10 paquets au repos en v2.
  - La garde `:255` ne s'applique que sans disposition v2 (`!v2Layout&&…`).
  - L'image ne fait rien quand la v2 reste éligible : `v2Apply:263`, `if(!v2Eligible()&&v2Idle())`.
  - Le compteur de MESURES (20 / 10 s au repos, veille comprise) concorde : en veille, `document.hidden` reste faux.
- **Suppression sans risque ?** Oui, avec une garde d'une ligne dans `v2Refresh`, avant de demander l'image : `if(v2Layout&&v2Eligible())return;`.
  - Le retour à v1 sur perte d'une capacité dépend de l'éligibilité et du repos. Tant que la v2 n'est plus éligible, chaque paquet demande encore son image. Chaque changement d'éligibilité émet déjà un événement qui appelle `v2Refresh` : `cnc-gpu-change`, `cnc-layout-change`, `resize`, `cnc-profile-change` ; le passage au laser y arrive par `observe()`.
  - Prototype : `test-bughunt-V3-2` passe entièrement (perte du GPU en travail, v2 gardée, puis v1 au premier repos ; laser ; Éco). `test-v2-gate`, `test-v2-machine-release` et `test-tablet-profile` passent (relancés). `test-v2-files-frames`, `test-scenario-profiles`, `test-preview-gl` et `test-v2-i18n` passaient à 05:30.
- **Non vérifié** : le harnais navigateur strict (étapes v2), et le gain mesuré.

### TXT-HANDOFF — Un refus du serveur renvoie à « l'étape 0 de HANDOFF.md »

- **Verdict** : confirmé avec réserve, mineur.
  - Le texte est à `motion.js:244-247`. `DISABLED_MESSAGE` (`:73`, « voir HANDOFF.md ») est dans le même cas.
  - Le message n'a pas de code. Le code `ETOUCH_MOTION_AMBIGUOUS` que cite TEXTES n'existe pas encore : la page affiche ce texte en français dans toutes les langues.
- **Réserve sur le remède** : TEXTES propose « Déplacez-le à la main, loin des fins de course, puis refaites la prise d'origine machine ».
  - D'après le terrain (mémo du 14 à 11:10), l'ambiguïté disparaît après une prise d'origine faite **depuis la tablette**, qui apprend `homeMpos`. Il n'y a rien à déplacer.
  - « À la main », sur une machine dont les moteurs sont alimentés, n'a pas de sens pour l'opérateur.
  - Le bouton de remède de TEXTES (« Prise d'origine machine ») est le bon ; c'est la phrase qui doit changer.
- **Correction** :
  - Un code `ETOUCH_MOTION_AMBIGUOUS` avec `{axis}`, et la phrase « Position de l'axe {axis} inconnue : refaites la prise d'origine depuis la tablette », avec le bouton de remède.
  - L'ancienne phrase passe dans « Détails ».
  - Même traitement pour `DISABLED_MESSAGE` : un code, et une phrase sans nom de fichier.

### TXT-STARTUP — Messages de `startup.js` chargés avant `i18n.js`

- **Verdict** : confirmé, mineur.
  - `index.html:16` charge `startup.js` sans `defer`, alors que les scripts `i18n*.js` sont `defer`.
  - Sont en dur et absents des catalogues : les deux messages de `startup.js` (`:11`, `:23`) et le texte de `#cnc-boot` (`index.html:21` : « Chargement de l'interface… », « Réessayer », `noscript`).
- **Correction la plus sûre** :
  - Une table FR / EN / ES de ces 5 phrases dans `startup.js`. La langue est lue dans `localStorage['cncjs-touch-language-v1']`, sous `try`, comme dans `i18n.js:3-4`.
  - Les textes de `#cnc-boot` sont traduits dès que l'élément existe.
  - Même modèle que `v2Message`, avec un test qui vérifie que la table est égale au catalogue, comme `test-v2-i18n.cjs`.
  - Ne pas dépendre de `cncI18n` : c'est justement quand un module manque que ces textes servent.

---

## D3 — La règle la plus sûre

### Ce que vaut la reconnaissance proposée par A3

| Cas | `remoteAddress` / `localAddress` vus par Node | Règle A3 : boucle locale, ou adresse distante = adresse locale, sans en-tête de mandataire |
|---|---|---|
| Kiosque sur `http://127.0.0.1:8000`, écoute `0.0.0.0` (défaut, `server-cli.js:53`) | `127.0.0.1` / `127.0.0.1` (mesuré) | locale |
| Kiosque sur `localhost`, écoute `0.0.0.0` | `::1` refusé, repli sur `127.0.0.1` (mesuré) | locale |
| Écoute `::`, client sur `127.0.0.1`, `localhost` ou `::1` | `::ffff:127.0.0.1`, ou `::1` (mesuré) | locale |
| Nom d'hôte Debian (`/etc/hosts` : `127.0.1.1`) | `127.0.1.1` | locale (motif `127.x`) |
| Kiosque sur l'adresse du réseau local (`192.168.1.29`), ou sur une adresse IPv6 de l'hôte | même adresse des deux côtés (mesuré sur une adresse IPv4 et une IPv6 de ce PC, sous les deux écoutes) | locale |
| PC du réseau | `192.168.1.23` / `192.168.1.29` | distante |
| PC avec `X-Forwarded-For: 127.0.0.1` | socket du PC | distante. `req.ip` mentirait : `trust proxy` (`app.js:77`), montré par le Jest A3-1 |
| Chromium du kiosque derrière un mandataire système | adresse du mandataire, plus un en-tête | distante (échec sûr, voir plus bas) |
| **Relais sans en-tête** vers le port 8000, sur l'hôte : tunnel SSH `-L`, `socat` | boucle locale | **locale à tort** : une page du PC passerait pour le kiosque |
| Point de montage `http://` de CNCjs vers lui-même (`server/index.js:149`, `http-proxy` sans `xfwd`) | — | sans effet : l'API est appelée directement en `/api` (`backlight.js:41`), jamais par le montage |
| Fenêtre de mesure, Chromium sans écran (ports 9230 et 9231) | boucle locale | locale (S6) |

La reconnaissance tient dans tous les cas où le kiosque tourne sur l'hôte du serveur, **quelle que soit son URL**. Que l'URL de la Surface soit hors du dépôt ne la met donc pas en défaut.

Seule limite : un relais sans en-tête sur l'hôte. Aucun n'est en place : les tunnels de `surface.sh` visent le port 9230, pas le 8000. À écrire dans `SURETE.md` : « ne jamais publier le port 8000 de la Surface par un tunnel ou un relais ».

### Si la reconnaissance se trompe (V3-4)

A3 propose de refuser aussi `wake` à une page non locale ; A1-10 exige qu'un réveil soit accepté de partout. Les deux ne tombent pas de la même façon quand la reconnaissance se trompe :
- **Extinction refusée à tort** à un vrai kiosque : l'écran reste allumé pendant la veille. Le voile de la page protège toujours des touchers. Effet : de l'énergie et de l'usure, aucun danger.
- **Réveil refusé à tort** : la tablette ne peut plus rallumer un panneau noir. C'est le défaut T1 qu'on veut supprimer, et D3 exige qu'« un toucher le rallume toujours ».

### Règle recommandée (le kiosque en boucle locale ou non)

1. **Serveur, `api.touch.js`**
   - `postBacklight` n'accepte `{temporary:true}` que d'une requête locale, au sens du tableau. Est locale une requête dont l'adresse de **socket** est en boucle locale, ou dont l'adresse distante égale l'adresse locale, sans `X-Forwarded-For`, `Forwarded` ni `X-Real-IP`.
   - Sinon : réponse 409, code `ETOUCH_BACKLIGHT_REMOTE`, rien d'écrit. Pas de 403 : `touch/backlight.js:62` lit un 403 comme « session requise ».
   - `{wake:true}` est accepté de toute session : il ne peut qu'allumer.
   - `{percent}` (curseur, 5 % au moins) reste permis de partout : ce n'est pas la veille.
   - Les réponses portent `local: true/false`.
2. **Serveur, `services/touch/backlight.js`** : la correction d'A3-2. `wake` allume aussi un panneau sous `MIN_PERCENT`, et `restore` allume un panneau noir au démarrage. Un `wake` sur un panneau déjà allumé n'écrit rien.
3. **Page, `touch/backlight.js`**
   - Sur le refus `ETOUCH_BACKLIGHT_REMOTE`, la page remet `dimmed = false` et n'envoie plus d'extinction de toute sa vie. Elle n'enverra donc pas de réveil à la fin de sa veille, conformément à « une page distante ne touche jamais au rétroéclairage pendant sa propre veille ».
   - Le réveil au chargement reste, car il ne peut qu'allumer.
   - **Réveil au toucher, page locale seulement** (`local: true` lu dans la réponse du réveil au chargement) : sur `pointerdown`, page éveillée, envoyer `{wake:true}` si le dernier envoi date de plus de 5 s, une requête à la fois.
     - C'est ce qui rend vrai le « toujours » de D3 face à n'importe quelle page locale qui éteint l'écran (S6) et à tout chemin non prévu.
     - Coût : au plus une petite requête toutes les 5 s pendant qu'on touche l'écran. C'est hors v2, donc permis en Éco.
     - Le premier toucher sur l'écran noir atteint encore la commande visée. Si l'on veut l'éviter, il faudrait que le flux `touch-events` porte l'état du rétroéclairage et qu'un voile soit posé. C'est plus lourd, et ce n'est pas exigé par D3.
4. **`SURETE.md`** : la limite du relais sans en-tête, et la fenêtre de mesure réglée sur « Inchangée » (S6).
5. **Tests**
   - `bughunt-A1-10` doit passer entièrement, ainsi que `bughunt-A3-1.test.js` (qui ne teste que l'extinction).
   - Un test de la reconnaissance : IPv4, IPv6, `::ffff:`, adresses égales, chacun des trois en-têtes, et l'absence de socket (distante).
   - `api.touch.test.js:224-238` : le montage doit recevoir une socket locale.
   - Dans `test-bughunt-A3-1.cjs`, l'attente « seule la page du PC rallume » s'inverse, sans perte de garde.
   - Un test de page pour le réveil au toucher : une page locale éveillée, un panneau éteint par une autre page locale, un toucher, l'écran rallumé.

Avec cette règle, un kiosque ouvert sur l'adresse du réseau local plutôt qu'en boucle locale reste reconnu. S'il ne l'était pas, l'écran ne s'éteindrait plus pendant la veille, mais ne resterait jamais noir. Et si une page distante passait à tort pour locale (relais sans en-tête), elle pourrait éteindre l'écran, mais le premier toucher sur la tablette le rallumerait.

---

## Défauts nouveaux

- **V3-3 — mineur — la documentation contredit le code sur l'état inconnu.**
  - `design/v2/PERFORMANCE-V2-USAGE.md` l. 33 : « … ou si l'état de la machine est inconnu, la v2 ne s'ouvre pas pendant cette session ».
  - Le code attend le premier repos, sans verrou. Commentaire de `tablet-profile.js:307-308` : « Missing telemetry is still allowed to wait for a known Idle on this page opening ».
  - Le prompt de mission (§ 2) et le mémo du 06 décrivent le comportement du code.
  - Preuve : le témoin de `test-bughunt-V3-1.cjs` (port fermé, puis Idle → v2).
  - Correction : réécrire la ligne avec la règle d'ERG-8.
- **V3-4 — à corriger — les corrections proposées pour D3 se contredisent.**
  - A3-1 (point 1) refuse `wake` à une page distante ; A1-10 (son test 3, « un réveil est accepté d'où qu'il vienne ») l'exige.
  - Appliquer A3-1 tel quel ferait échouer `bughunt-A1-10`, et rendrait le panneau noir irrécupérable dès que la reconnaissance se tromperait.
  - Tranché ci-dessus : le réveil est accepté de partout.
- **V3-5 — sécurité machine — « Laser Off » du PC coupe la broche au milieu d'un programme CNC.**
  - **Chemin** :
    - `src/app/widgets/Laser/Laser.jsx:231-238` : bouton « Laser Off », actif dès qu'un port est ouvert (`index.jsx:220-235`, sans regarder le travail).
    - → `controller.command('lasertest:off')` → `CNCEngine.js:349-362` → `refused()` → `touch/index.js` `refuseSocket`.
    - → `safeCommand('lasertest:off')` vaut vrai (`control.js:43-44`) : la commande est permise malgré le bail de la tablette.
    - → `GrblController.js:1593-1598` → `command('gcode', ['M5S0'])` → `feeder.feed`, puis `feeder.next()` (`:1611-1615`, la file du feeder est vide pendant un travail) → `connection.write('M5S0\n')` (`:337-358`), au milieu du programme envoyé par la tablette.
  - **Effet** :
    - Grbl exécute `M5` à son rang dans la file : il attend la fin des mouvements déjà reçus, arrête la broche, puis exécute les passes suivantes, broche arrêtée.
    - Un programme Vectric ne renvoie pas `M3` avant sa fin. La fraise coupe donc à l'arrêt : outil cassé, pièce arrachée.
    - Le `ok` de cette ligne est aussi compté comme celui d'une ligne du programme (`GrblController.js:607-614`), ce qui décale le décompte du flux, comme en A3-6.
  - **Preuve** : `src/server/services/touch/__tests__/bughunt-V3-5.test.js`, avec le vrai `GrblController`, une liaison série factice et un travail en état `running`. Le test 2 échoue : `M5S0\n` est écrit. Le test 1 passe : `safeCommand('lasertest:off')` vaut vrai. L'exécution par la carte relève de la lecture, pas d'un essai.
  - **Correction recommandée** : retirer `'lasertest:off'` et `'sleep'` de `SAFE_COMMANDS`.
    - Les deux ne sont pas des arrêts : ce sont des lignes de G-code insérées dans le flux.
    - Restent libres : Pause, Stop, retenue, reset, `jogCancel`, `statusreport`. Ils arrêtent la machine sans rien insérer dans le programme.
    - `lasertest:on` est déjà gardé. Un essai laser lancé par le PC avant que la tablette prenne le bail s'arrête encore par Stop ou par l'arrêt de la broche de la tablette.
    - À inscrire dans `SURETE.md` (garde changée). `control.test.js:202` est à ajuster, en le disant.
    - En option, à décider : refuser `lasertest:*` et `sleep` pendant un travail, quel que soit l'appelant, sur le modèle de `system-command.js`.
  - **Fichiers** : `src/server/services/touch/control.js`, `__tests__/control.test.js`, `bughunt-V3-5.test.js` à faire passer.
  - **Scénario** : rare (un clic délibéré sur le PC, dans le module Laser d'une machine CNC), mais le bouton s'appelle « Laser Off » et ressemble à un arrêt.

---

## Ce que je n'ai pas vérifié

- Rien sur la Surface, la RT ni la CNC :
  - l'URL réelle du kiosque et `~/.xinitrc` ;
  - la présence de `touch.backlight.percent` dans le `.cncrc` (elle décide si A3-2 a pu jouer) ;
  - la forme exacte des commandes `xdotool` du 14, et la fenêtre visée (S2) ;
  - les mises à jour de `chromium` (S4) et DPMS (S7).
- Le comportement de Chromium face à un Ctrl+Maj+R annulé par la page (A3-3), et face à `xdotool key --window` (S2) : ce sont des connaissances, non mesurées.
- Sur la carte, non essayés :
  - la réponse exacte de Grbl_ESP32 à `$SLP` hors Idle/Alarm. Les sources donnent `idleOrAlarm` ; je n'ai pas lu le numéro d'erreur renvoyé ;
  - l'exécution de `M5S0` au milieu d'un programme (V3-5) ;
  - que la carte vide sa mémoire tampon, broche allumée, après une fermeture du port (A3-5).
- Les suites du décalage du décompte du flux (A3-6, V3-5), et le refus « Version Grbl inconnue » qu'aurait pu rencontrer V3-5 : je n'ai pas testé de bout en bout avec `job-service`.
- La forme `passwd-file` de `nmcli` (A3-7), non essayée.
- Les règles recommandées pour ERG-8, A3-2, A3-3, A3-4, A3-5, A3-6, V3-5 et D3 ne sont pas prototypées. Seules C1 et C3 l'ont été, hors dépôt.
- Non relancés (consigne) : le harnais navigateur strict, `verify-project.cjs` et les suites Jest complètes. Les mesures d'en-têtes et de mutations de MESURES ne sont pas refaites ; C1 et C3 sont confirmés par le code et par V3-2.
- `addresses.cjs` a tourné sous Windows. Sous Linux, les écoutes `0.0.0.0` et `::` donnent les mêmes formes d'adresses d'après la documentation de Node, mais ce n'est pas mesuré sur la Surface.
