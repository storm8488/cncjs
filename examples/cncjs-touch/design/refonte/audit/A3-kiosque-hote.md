# A3 — Kiosque et hôte (phase 1, audit)

Agent A3, 2026-11-15, branche `feat/refonte-ui` (code de `3049a0e4`, cache `v2u`). Lecture seule du dépôt : aucun fichier existant modifié, aucun accès à la Surface, à la RT ni à la CNC.

Tests créés (non commités, lancés seuls) :

| Test | Lancement | Résultat aujourd'hui |
|---|---|---|
| `examples/cncjs-touch/test-bughunt-A3-1.cjs` | `node examples/cncjs-touch/test-bughunt-A3-1.cjs` | 6 attentes non satisfaites sur 14, sortie 1 |
| `src/server/services/touch/__tests__/bughunt-A3-1.test.js` | `npx jest src/server/services/touch/__tests__/bughunt-A3-1.test.js --coverage=false` | 2 échecs, 2 réussites |
| `src/server/services/touch/__tests__/bughunt-A3-2.test.js` | `npx jest src/server/services/touch/__tests__/bughunt-A3-2.test.js --coverage=false` | 2 échecs, 1 réussite |

`test-bughunt-A3-1.cjs` fait tourner deux vraies pages (`touch/screen-saver.js` et `touch/backlight.js`, chacune dans son propre contexte `vm`) contre le vrai module serveur `src/server/services/touch/backlight.js` (chargé par `@babel/register`), sur un faux `/sys/class/backlight/intel_backlight` (maximum 937). La page P est le Chrome du PC, la page T le kiosque. Une seule horloge manuelle pilote les deux pages et le réseau. L'aiguillage de `postBacklight` (`api.touch.js:147-164`) est recopié dans le test.

---

## 1. Constats

### A3-1 — Une page ouverte sur le PC éteint l'écran du kiosque ; la tablette ne peut pas le rallumer et ses touchers à l'aveugle atteignent les commandes

- **Gravité** : sécurité machine.
- **Journal** : T1.
- **Phrase** : l'écran de veille de *n'importe quelle* page CNCjs Touch (ici un onglet du Chrome du PC) écrit `0` dans le rétroéclairage du serveur, donc de la Surface. Seule cette page-là le rallume, et seulement quand quelqu'un la touche sur le PC. Pendant ce temps, la page du kiosque reste éveillée : rien ne voile ses commandes, et un toucher sur l'écran noir actionne ce qui se trouve sous le doigt (flèche de déplacement, Démarrer, etc.).
- **Scénario** : onglet `/touch/` ouvert sur le PC (192.168.1.23), personne ne s'en sert. L'opérateur travaille sur la tablette. 5 minutes après la dernière activité de l'onglet du PC (veille par défaut, `display-settings.js:31`), cet onglet s'endort. Entrée : rien côté tablette. Sortie fausse : `brightness = 0`, et cinq touchers sur la tablette n'envoient aucune requête. L'écran s'éteint de nouveau 5 minutes après chaque réveil de l'onglet du PC : c'est le « à répétition ». Le bouton « Tester » de la veille (`screen-saver.js:129`, `preview: sleep`) fait la même chose à la demande. Une page distante réveillée par l'activité de la machine (`screen-saver.js:110-113`) rallume l'écran, puis l'éteint de nouveau 5 minutes après la fin du mouvement.
- **Pourquoi pendant la saisie d'un nom de profil** : la page du kiosque ne peut pas s'endormir quand un dialogue est visible (`screen-saver.js:24-28` ; le clavier texte est `role="dialog"`, `text-keyboard.js:57`). Le scénario 4 du test le confirme : clavier ouvert 12 minutes, aucune requête de veille du kiosque. Un écran noir pendant la saisie vient donc forcément d'une autre page.
- **Chemin** :
  1. Côté PC : `screen-saver.js:27-37` `sleep()` → `announce(true)` (`:14-18`) → `backlight.js:109-113`. Le mode `off` est la valeur par défaut (`backlight.js:13-15`), donc la page envoie `saver({percent:0,temporary:true})`.
  2. Côté serveur : `api.touch.js:147-153`. La seule condition est une session (`authorized`, `:19-29`), et tout client du réseau local en obtient une (`/api/signin` sans utilisateur). La requête passe par `services/touch/index.js:183` → `services/touch/backlight.js:112-114`, qui écrit `fs.writeFileSync(device.file, '0')`. C'est la seule écriture de `0` du dépôt : `apply()` écrit au moins 1 (`:93`). La lecture de terrain « 0 sur 937 » désigne donc ce chemin, et non `apply()` ni une mise en veille du noyau.
  3. Côté tablette : `backlight.js:107-108`. `retryWake` n'envoie rien tant que `wakePending` est faux. `:114` n'envoie le réveil que si *cette* page a assombri l'écran (`dimmed`). `screen-saver.js:66-76` laisse passer les touchers quand la page est éveillée, donc il n'y a aucun voile.
- **Preuve** : `test-bughunt-A3-1.cjs`, scénario 1 :
  - ÉCHEC « une page distante ne doit jamais éteindre l'écran » (dim(0) envoyé par `pc@300s`) ;
  - ÉCHEC « un toucher sur la tablette rallume toujours l'écran » (0 requête, `brightness = 0`) ;
  - ÉCHEC « un toucher sur un écran noir ne doit pas actionner une commande » ;
  - OK « seule la page du PC rallume » et OK « éteint de nouveau 5 min après » (constats attendus).

  `bughunt-A3-1.test.js` : ÉCHEC « a page of another computer cannot turn the kiosk screen off » (`dimBacklight` appelé, 200).
- **Correction proposée (D3)** :
  1. **Serveur, `api.touch.js`** : `postBacklight` n'accepte `temporary` et `wake` que d'un client local, et refuse sinon par un code (`ETOUCH_BACKLIGHT_REMOTE`, en 409, pas en 403 : la page lit un 403 comme « session requise », `backlight.js:62`). `getBacklight` renvoie `local: true/false`. Un réglage explicite du curseur (`{percent}` seul) reste permis à distance : ce n'est pas la veille, et la carte dit déjà « Serveur CNCjs ».
  2. **Reconnaître la page locale**, d'après la socket et jamais d'après `req.ip`. CNCjs active `trust proxy` (`src/server/app.js:77`), donc `req.ip` vient de `X-Forwarded-For`. `bughunt-A3-1.test.js` le montre : avec un en-tête `X-Forwarded-For: 127.0.0.1`, `req.ip` vaut `127.0.0.1`.
     ```js
     const LOOPBACK = /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;
     export const localClient = (req) => {
       const s = req.socket || req.connection || {};
       const remote = String(s.remoteAddress || ''), local = String(s.localAddress || '');
       const h = req.headers || {};
       // Behind a proxy, the peer is the proxy, not the browser.
       if (h['x-forwarded-for'] || h.forwarded || h['x-real-ip']) return false;
       // Loopback, or the host talking to itself on its LAN address (kiosk opened on http://192.168.1.29:8000).
       return LOOPBACK.test(remote) || (remote !== '' && remote === local);
     };
     ```
     Cette règle couvre `localhost` résolu en `::1` ou en `127.0.0.1`, l'écoute `0.0.0.0` (défaut, `src/server-cli.js:53`) comme `::` (adresses `::ffff:`), et un kiosque ouvert sur l'adresse du réseau local de la tablette (même adresse des deux côtés).
  3. **Page, `backlight.js`** : la page lit `local` dans la réponse de son réveil au chargement, ou dans un `GET` au chargement. Une page non locale n'envoie plus ni `temporary` ni `wake`. Une page locale envoie `{wake:true}` à chaque `pointerdown` tant que le dernier état connu du serveur est `temporary`, ou en dessous de `minPercent` (étendre `retryWake`, `:107`), au plus une requête à la fois.
  4. Limite à écrire dans `SURETE.md` : la fenêtre de mesure Chromium lancée sur la Surface (`design/ops/sim-surface/chrome.sh`) est elle aussi locale. Si on veut l'exclure, le serveur retient le `clientId` qui a assombri l'écran, et tout réveil local efface cet assombrissement.
  5. Test de non-régression : ce test lui-même, plus un test `api.touch` pour `localClient` (IPv4, IPv6, `::ffff:`, adresse locale égale, en-têtes de mandataire).
- **Fichiers** : `src/server/api/api.touch.js`, `src/server/services/touch/backlight.js`, `examples/cncjs-touch/touch/backlight.js`, `examples/cncjs-touch/touch/i18n-messages*.js` (code de refus), `README.md` (« Screen brightness »), `TESTING.md`.

### A3-2 — Après un redémarrage de CNCjs pendant la veille, ni le rechargement ni un toucher ne rallument l'écran

- **Gravité** : bloquant (il faut SSH et `echo 937 > …/brightness`).
- **Journal** : T1 (« page rechargée pendant la veille »), T14 (installation = `pm2 restart` puis rechargement).
- **Phrase** : un service qui démarre avec le panneau à 0 oublie qu'il était éteint *temporairement*. `wake()` ne fait alors plus rien, et sans niveau enregistré, `restore()` ne rallume pas non plus.
- **Scénario** : la veille a mis le panneau à 0. Une installation lance `pm2 restart` (cas des déploiements avec des fichiers serveur, par exemple ceux du 2026-11-14 à 11:10 et 22:56), puis Ctrl+Maj+R. La nouvelle page envoie `{wake:true}`. Sortie fausse : réponse 200, `brightness` reste à 0, et les touchers suivants n'envoient plus rien, puisque `wakePending` est remis à faux sur 200 (`touch/backlight.js:100`).
- **Chemin** :
  1. Au démarrage du service : `services/touch/index.js:53-54` → `services/touch/backlight.js:66-73`. Le panneau trouvé à 0 donne `userPercent = 50` et `temporary = false`.
  2. `restore()` (`:152-156`) ne fait rien sans `touch.backlight.percent`. Cette clé est absente par défaut (`INSTALL.md`, tableau des réglages), et n'apparaît qu'après un mouvement du curseur.
  3. `wake()` (`:121-128`) n'applique le niveau que si `temporary` est vrai.
- **Preuve** :
  - `bughunt-A3-1.test.js` : ÉCHEC « a panel found dark at start (…) is lit again by a wake » (0 reçu).
  - `test-bughunt-A3-1.cjs`, scénario 2 : ÉCHEC « la page rechargée rallume l'écran même après un redémarrage de CNCjs » et ÉCHEC « un toucher sur la tablette rechargée rallume l'écran ».
  - Sans redémarrage, le rechargement rallume bien l'écran : OK « sans redémarrage de CNCjs, la page rechargée rallume », et le test Jest 3 réussit.
- **Correction proposée** : `wake()` applique `userPercent` si `temporary || current() < MIN_PERCENT`. `restore()`, quand il n'y a pas de niveau enregistré et que le panneau est trouvé sous `MIN_PERCENT`, applique `DEFAULT_PERCENT`. Le second point est discutable : un écran éteint au démarrage n'est jamais voulu, puisque la veille n'est jamais enregistrée.
- **Fichiers** : `src/server/services/touch/backlight.js`, `__tests__/backlight.test.js`.

### A3-3 — Le premier Ctrl+Maj+R sur un kiosque en veille est avalé par l'écran de veille (« il faut recharger deux fois »)

- **Gravité** : à corriger.
- **Journal** : T14.
- **Phrase** : pendant la veille et pendant les 450 ms qui suivent le réveil, `screen-saver.js` annule (`preventDefault`) et arrête toutes les touches, raccourcis du navigateur compris. Ctrl+Maj+R n'est pas un raccourci réservé de Chromium : annulé par la page, il ne recharge pas. Il réveille seulement l'écran. Le deuxième Ctrl+Maj+R, envoyé après le réveil, recharge.
- **Scénario** : pendant une installation, personne ne touche la tablette, qui est donc en veille. `xdotool key ctrl+shift+r` envoie Control↓ Shift↓ R↓ R↑ Shift↑ Control↑. Sortie fausse : `keydown R` a `defaultPrevented = true`, la page n'est pas rechargée et l'ancienne version reste affichée. Le mémo de terrain du 2026-11-14 17:48 décrit exactement ce cas : « the first ctrl+shift+r after deploy did not take; a second did ».
- **Chemin** : `screen-saver.js:77-79` (écoute en capture sur `window`) → `:66-73`. Avec `asleep || waking`, le code fait `e.preventDefault(); e.stopImmediatePropagation()`. `waking` dure jusqu'à 450 ms après le relâchement de toutes les touches (`:53-56`, `track` `:57-65`).
- **Preuve** : `test-bughunt-A3-1.cjs`, scénario 3 : ÉCHEC « le raccourci de rechargement n'est pas avalé par l'écran de veille », puis OK « le 2e Ctrl+Maj+R passe ».
- **Non vérifié** : le comportement de Chromium face à un `keydown` annulé. Mon essai avec Edge piloté par CDP n'a pas conclu : les touches injectées par CDP ne déclenchent pas les raccourcis du navigateur, même sans écouteur. Le constat repose sur le chemin de code et sur l'observation de terrain.
- **Correction proposée** : dans `activity()`, une touche avec `ctrlKey || metaKey || altKey`, ou `F5`, compte comme réveil (`announce(false)`, `track`) mais n'est ni annulée ni arrêtée. La tablette n'a pas de clavier : seuls `xdotool` et un clavier USB de maintenance envoient des touches. Les touchers restent voilés comme aujourd'hui.
- **Fichiers** : `examples/cncjs-touch/touch/screen-saver.js`, `test-screen-saver.cjs`.

### A3-4 — L'écran Système annonce la version installée, pas celle qui tourne

- **Gravité** : mineur.
- **Journal** : T14 (diagnostic trompeur).
- **Phrase** : « Interface <commit> » est lu dans `VERSION.json` au *premier affichage* de l'onglet Système, puis plus jamais. Si le rechargement d'après installation n'a pas pris (A3-3), l'onglet annonce la nouvelle version alors que l'ancien code tourne.
- **Scénario** : la page est chargée en version A. On installe B, et `VERSION.json` passe à B. Le Ctrl+Maj+R est avalé. L'opérateur ouvre ensuite Réglages → Système. Sortie fausse : « Interface B » s'affiche, avec le code A en mémoire. Dans l'ordre inverse (onglet ouvert avant l'installation), l'onglet garde A pour toujours.
- **Chemin** : `tablet-actions.js:149` `refresh()` → `if(info)checkRemote();else loadVersion();` → `:142-147`. La lecture n'a lieu qu'une fois, pas au chargement de la page.
- **Preuve** : chemin ci-dessus. Aucun test, le cas étant trivial à la lecture.
- **Correction proposée** : lire `VERSION.json` une seule fois, au chargement. C'est la référence « chargée », qui sert aussi au rechargement automatique proposé au § 2.2.
- **Fichiers** : `examples/cncjs-touch/touch/tablet-actions.js`.

### A3-5 — Le PC peut fermer le port série que la tablette pilote, même pendant un travail ; la tablette perd alors Pause et Arrêter

- **Gravité** : sécurité machine.
- **Journal** : aucun (angle « deux clients »).
- **Phrase** : le bail de pilotage (F5) ne contrôle que `command`, `write` et `writeln`. L'événement Socket.IO `close` de l'interface CNCjs d'origine (bouton « Fermer » du module Connexion) ferme le port sans rien demander. Une fois le port fermé, toutes les actions de la tablette, Arrêter compris, sont refusées (« Contrôleur Grbl non connecté. »). Le bail est oublié, et la carte continue d'exécuter ce qu'elle a en mémoire tampon, broche comprise.
- **Scénario** : la tablette pilote `/dev/ttyUSB0` et un programme tourne. Sur le PC, quelqu'un clique sur « Fermer » dans CNCjs. Sortie fausse : le port est fermé. Sur la tablette, Arrêter → `perform()` → `get()` lève `409 Contrôleur Grbl non connecté.` Il ne reste que l'arrêt d'urgence.
- **Chemin** :
  1. `src/server/services/cncengine/CNCEngine.js:317-347`. Le traitement de `close` n'appelle pas `refused()` (`:182-193`), contrairement à `command`, `write` et `writeln` (`:349-393`).
  2. `services/touch/index.js:121-140` ne connaît que ces trois cas.
  3. Côté tablette : `job-service.js:1588-1591` `perform()` → `get()` (`:634-640`).
  4. `job-service.js:1974-1981` : `observe()` retire l'enregistrement du contrôleur et appelle `control.forget(port)`.
- **Non vérifié dans le dépôt** : que la carte continue sa mémoire tampon, broche comprise, après la fermeture. C'est le comportement de Grbl, et le mémo de terrain du 2026-11-14 indique que fermer puis rouvrir le port ne redémarre pas cet ESP32. La confirmation revient à A5 et à un essai.
- **Preuve** : `bughunt-A3-2.test.js` : ÉCHEC « closing the port is refused too » (`controller.close` appelé sans consulter la politique de pilotage). Le témoin « a guarded command is refused » réussit.
- **Correction proposée** : dans `CNCEngine.js`, au traitement de `close`, appeler `if (refused(port, 'command', 'close')) { callback(new Error('refused')); return; }`. `'close'` n'est pas dans `SAFE_COMMANDS`, donc la fermeture est refusée quand un autre client pilote, et permise au pilote lui-même ou sur un port libre. Option : refuser aussi la fermeture tant qu'un travail, un mouvement ou un palpage est en cours, quel que soit l'appelant, sur le modèle de `system-command.js:42-83`. À inscrire dans `SURETE.md`.
- **Fichiers** : `src/server/services/cncengine/CNCEngine.js`, `src/server/services/touch/index.js` (si un cas `close` dédié est ajouté), `cncengine/__tests__/control-hook.test.js`.

### A3-6 — La commande `sleep` de l'interface d'origine (`$SLP`) passe toujours, même quand la tablette pilote

- **Gravité** : à corriger.
- **Journal** : aucun (lien avec P8, référence perdue).
- **Phrase** : `sleep` est rangée parmi les commandes « qui ne font qu'arrêter » (`control.js:43-44`). Or `$SLP` coupe les moteurs et la broche, et ne se quitte que par un reset. Grbl repart alors en ALARM et la référence est perdue. Depuis le menu du module Grbl du PC, n'importe qui fait perdre la prise d'origine à la tablette qui pilote.
- **Chemin** : `src/app/widgets/Grbl/index.jsx:300` `controller.command('sleep')` → `CNCEngine.js:349-362` → `services/touch/index.js:125` (`safeCommand('sleep')` vrai, donc permis) → `src/server/controllers/Grbl/GrblController.js:1500-1503` `writeln('$SLP')`.
- **Preuve** : `bughunt-A3-2.test.js` : ÉCHEC « the classic `sleep` command (…) is not free for everyone » (`safeCommand('sleep')` vaut `true`).
- **Non vérifié** : le comportement exact de `$SLP` sur Grbl_ESP32 1.1f (refus en Run ? ALARM au reset ?). C'est à confirmer par A5. Pour Grbl 1.1 : commande permise au repos et en alarme seulement, et ALARM au réveil.
- **Correction proposée** : retirer `'sleep'` de `SAFE_COMMANDS`. Pause, Stop, feed hold, reset et `jogCancel` restent libres. À inscrire dans `SURETE.md` (changement d'une garde).
- **Fichiers** : `src/server/services/touch/control.js`, `__tests__/control.test.js`.

### A3-7 — Le mot de passe Wi-Fi passe dans la ligne de commande de `nmcli`

- **Gravité** : mineur.
- **Journal** : aucun.
- **Phrase** : pendant un « Rejoindre » (jusqu'à 45 s), le mot de passe apparaît dans les arguments du processus `nmcli`, lisibles par tout processus local (`ps`, `/proc/<pid>/cmdline`).
- **Chemin** : `src/server/services/touch/wifi.js:155`, `['device','wifi','connect',name].concat(secret ? ['password', secret] : [])` → `execFile('nmcli', args)`.
- **Preuve** : chemin ci-dessus. Le commentaire en tête (« never logged ») est vrai pour le journal, pas pour la table des processus.
- **Correction proposée** : écrire le secret dans un fichier temporaire 0600 et utiliser `nmcli --passwd-file <fichier> …`, ou passer par une connexion créée avec `nmcli connection add` puis `connection up … passwd-file`. Le fichier est supprimé dans un `finally`.
- **Fichiers** : `src/server/services/touch/wifi.js`, `__tests__/wifi.test.js`.

### A3-8 — L'installation du kiosque de la Surface Pro n'est pas dans le dépôt

- **Gravité** : mineur.
- **Journal** : T1, T14 (on ne peut pas raisonner sur l'URL du kiosque ni sur sa façon de recharger).
- **Phrase** : `INSTALL.md` décrit la RT (PM2, point de montage, `deploy-touch.sh`), et le README la règle udev du rétroéclairage. Rien dans le dépôt ne décrit le kiosque de la Surface : autologin `getty`, `.xinitrc` (attente du 200, puis Chromium `--kiosk` et son URL), réglages logind, pare-feu, `cncjs-idle-check`, méthode de déploiement (copie brute de `touch/` + `VERSION.json` + `xdotool`). `grep -ri xinitrc` ne trouve rien en dehors de `design/`.
- **Conséquences** :
  - D3 dépend de l'URL du kiosque (`localhost`, `127.0.0.1` ou `192.168.1.29`) ;
  - le rechargement automatique (§ 2.2) dépend de l'ordre d'écriture de `VERSION.json`.
- **Correction proposée** : un dossier `examples/cncjs-touch/kiosk/` avec `.xinitrc`, l'unité `getty@tty1` et `deploy-surface.sh`. Le kiosque s'ouvre sur `http://127.0.0.1:8000/touch/`. `deploy-surface.sh` copie `touch/`, écrit `VERSION.json` *en dernier*, et ne relance `pm2` que si des fichiers serveur changent. Plus une section « Kiosque Surface Pro » dans `INSTALL.md`.
- **Fichiers** : `examples/cncjs-touch/INSTALL.md`, nouveaux fichiers sous `examples/cncjs-touch/kiosk/`.

---

## 2. T14 en détail : pourquoi deux rechargements, et le mécanisme le plus simple

### 2.1 Ce qui n'est pas en cause (preuves)

- **En-têtes HTTP** : `/touch/` est servi par `serve-static` avec `maxAge: 0` (`src/server/config/settings.base.js:53-59` → `src/server/app.js:153-158`). Un point de montage `.cncrc` passe aussi par `serve-static` sans `maxAge` (`node_modules/webappengine/src/app/app.multihost.js:54`). Mesure sur le même `serve-static` en boucle locale (script du dossier de travail `headers.cjs`) :
  - réponse `Cache-Control: public, max-age=0`, `ETag: W/"<taille>-<mtime>"`, `Last-Modified` ;
  - une revalidation renvoie 304 tant que le fichier n'a pas changé ;
  - le même URL `?v=old` renvoie 200 avec le nouveau contenu dès que le fichier change.

  Chromium revalide donc chaque fichier à chaque chargement, et Ctrl+Maj+R contourne le cache.
- **Suffixes `?v=`** : `index.html` en porte 21 valeurs (55 × `v2u` et 20 valeurs isolées : `a31f`, `a31g`, `a31h`, `audit1`, `depth3`, `downloads16`, `fix2`, `fix3`, `kept2`, `msg31a`, `network11`, `network12`, `pass2a`, `perfui2`, `prof2`, `prof7`, `review1`, `review2`, `theme1`, `ui1`). S'y ajoutent `ADVANCED_VERSION='v2u'` (`tablet-profile.js:15`), les adresses des workers (`v2u`, et `view3` dans `preview-3d.js:19`). Avec `max-age=0` et l'ETag, un suffixe non changé ne sert jamais une ancienne copie : ces suffixes ne sont pas la cause de T14. Ils ne servent que contre un cache intermédiaire, qui n'existe pas ici.
- **Ordre des scripts** : tous sont `defer` (`index.html:136-153`) sauf `startup.js`, et s'exécutent dans l'ordre du document. Les scripts injectés plus tard (v2, workers) sont revalidés comme les autres. Pas de service worker ni d'`applicationCache` (`grep`).
- **Un ETag inchangé** ne viendrait que d'une installation qui garde la même taille *et* la même date de modification pour un fichier modifié. C'est invraisemblable avec `git archive` ou une copie simple.

### 2.2 Ce qui est en cause, et la correction

1. **Le rechargement avalé par la veille** (A3-3) : c'est la cause prouvée, et la plus probable, puisque la tablette est en veille pendant une installation.
2. **Soupçon** : un Ctrl+Maj+R envoyé juste après `pm2 restart`, avant que CNCjs écoute, tombe sur la page d'erreur de Chromium (S1). Une simple relance de CNCjs sans rechargement garde aussi l'ancien code : le flux se reconnecte (`job-stream.js:40-45`, 30 s), mais rien ne recharge la page.

**Mécanisme proposé, le plus simple, sans rechargement manuel** :

- La page lit `VERSION.json?<horodatage>` une fois au chargement : c'est la version chargée (A3-4).
- Elle le relit à chaque reconnexion du flux `touch-events` après une coupure (cas d'un `pm2 restart`), et toutes les 5 minutes, au repos seulement. La reconnexion est un événement déjà émis par `job-stream.js` ; la relecture toutes les 5 minutes est une seule petite requête, qui n'est pas une requête v2, donc permise en Éco (§ 5.5).
- Si `commit` diffère, et seulement quand rien n'est en cours (machine `Idle` et à jour, aucun dialogue, clavier ni pavé ouvert, aucune saisie en cours), elle appelle `location.reload()`. Sinon, une bande « Nouvelle version installée — Recharger » attend le prochain repos.
- L'installation écrit `VERSION.json` **en dernier**. Ainsi, une page chargée pendant la copie a une version ancienne, et se recharge une fois de plus.
- Le `xdotool ctrl+shift+r` devient inutile.
- Les suffixes `?v=` peuvent rester tels quels. Mieux : on les ramène à une seule valeur, que `verify-project.cjs` contrôle (tous les suffixes de `index.html`, `ADVANCED_VERSION` et les adresses des workers sont égaux). Cela supprime l'entretien de 21 valeurs sans changer le comportement.
- Côté serveur, rien à changer : `max-age=0` suffit. `Cache-Control: no-cache` serait équivalent pour Chromium.

---

## 3. Deux clients en même temps (PC et tablette)

| Situation | Effet | Statut |
|---|---|---|
| Onglet `/touch/` sur le PC, laissé ouvert | éteint l'écran de la tablette toutes les 5 min d'inactivité de l'onglet ; la tablette ne peut pas le rallumer | **A3-1** |
| PC : « Fermer » le port pendant que la tablette pilote | port fermé, bail oublié, Arrêter de la tablette refusé | **A3-5** |
| PC : menu Grbl « Sleep » | `$SLP` passe malgré le bail : moteurs coupés, ALARM, référence perdue | **A3-6** |
| PC : `reset`, feed hold, stop, `jogCancel` pendant un travail de la tablette | permis à tous (`control.js:43-49`) : décision F5 documentée dans le code | conforme |
| PC : Démarrer, déplacement, prise d'origine, `$X`, macro, chargement | refusés tant que la tablette pilote (`control-hook.test.js`) | conforme |
| Tablette au repos 5 min | bail libéré (`control.js:26-30`, `IDLE_MS`) : le PC peut tout faire sans prendre la main | décision du 2026-10-30 |
| Page `/touch/` sur le PC | observateur ; son curseur Luminosité règle l'écran de la tablette (carte « Serveur CNCjs ») | conforme (hors veille) |
| Plus de 8 flux `touch-events` | le 9e reçoit 503 ; une tablette sans flux perd son bail 60 s plus tard, même pendant un travail | soupçon S3 |
| Commandes système, Wi-Fi, mises à jour | refusées si un autre appareil pilote ; la tablette pilote s'identifie par `clientId` (`tablet-actions.js:85`, `wifi-settings.js:25`, `system-updates.js:24`) | conforme |

---

## 4. Faits de terrain expliqués par le code (sans nouveau constat A3)

- **« Après un redémarrage de CNCjs, le serveur Touch ne connaît plus la version Grbl ni la référence. »** L'état Touch d'un contrôleur vit en mémoire, attaché à l'objet contrôleur (`job-service.js:262-285` : `homed`, `homeMpos`, `firmware`…), et disparaît avec le processus. La version n'est apprise que par la bannière de démarrage (`runner 'startup'`, `job-service.js:452`) ou par une ligne `[VER:]` de `$I` (`:424-437`). Personne n'envoie `$I` de lui-même : `readSettings` seulement, sur demande, `:1674`. Rouvrir le port sans redémarrer la carte ne donne pas de bannière, donc version inconnue. Voir A1 (piste 8), T10 et D4 (relecture automatique au repos).
- **« … et le port série doit être rouvert. »** CNCjs n'ouvre un port que sur un `open` Socket.IO (`CNCEngine.js:252-315`). Au démarrage, `src/server/index.js:235-241` lance `cncengine` et `touch` sans aucun port. La barre « Connecter la CNC » (`connect-cnc.js`) fait cette ouverture à la demande.
- **« Un arrêt d'urgence coupe la liaison USB : le port se ferme. »** Le port disparaît → `GrblController.js:82-95` (`connection 'close'` → `close()`, `store.unset`, `destroy()`) → `job-service.js:1974-1981` (`observe()` retire l'enregistrement et le bail) → la barre « Connecter la CNC » réapparaît.
- **Ordre de démarrage** : `touch.start()` est appelé dans le même `ready` que l'écoute HTTP (`src/server/index.js:236-241`). Il n'y a donc pas de fenêtre où `/touch/` répond 200 alors que l'API Touch répond 503. L'attente du 200 par `.xinitrc` (hors dépôt) suffit. `backlight.restore()` s'exécute à ce démarrage (`services/touch/index.js:53-54`) : voir A3-2.
- **Redémarrage de la tablette depuis l'écran, mises à jour du système, Wi-Fi** : réservation de la machine (`system-command.js:35-101`, `services/touch/index.js:193-242`), refusée pendant un travail, un mouvement, un palpage, une prise d'origine, un chargement, broche en marche ou rapport trop ancien. Je n'ai trouvé aucun contournement.

---

## 5. Soupçons (sans preuve suffisante)

- **S1.** Après `pm2 restart`, un Ctrl+Maj+R envoyé avant que Node écoute (quelques secondes sur la Surface) affiche la page d'erreur de Chromium, et il faut recharger de nouveau. Délai de démarrage non mesuré.
- **S2.** `xdotool key --window <id>` passe par `XSendEvent`, que Chromium peut ignorer (événement synthétique). Le deuxième essai du 2026-11-14 a réussi avec `--clearmodifiers` sans `--window`. C'est hors dépôt et non vérifié. Le rechargement automatique (§ 2.2) rend ce point sans objet.
- **S3.** `touch-stream.js:10` limite à 8 flux (`:146`) pour tous les clients. Des onglets du PC peuvent priver le kiosque de flux (503 → `job-stream.js` attend 30 s). Sans flux, la présence s'éteint, et le bail expire au bout de la grâce de 60 s même pendant un travail : l'expiration est testée avant `busy` (`control.js:129-137`). Pause et Arrêter restent possibles. Non observé sur le terrain.
- **S4.** « Installer les mises à jour » (`updates.js:93-103`) peut mettre à jour `chromium` pendant que le kiosque tourne. Les processus de rendu lancés ensuite (rechargement) peuvent échouer, et le paquet ne pose pas `/var/run/reboot-required`, donc l'écran ne demande pas de redémarrer. Non vérifié.
- **S5.** Si le kiosque est ouvert sur l'adresse du réseau local (ou un nom qui s'y résout), une coupure Wi-Fi ou un changement de bail DHCP coupe la tablette de son propre serveur (flux, Pause, Arrêter). L'URL réelle est hors dépôt, voir A3-8. Avec `127.0.0.1`, ce risque disparaît.
- **S6.** Une seconde fenêtre Chromium sur la Surface (`design/ops/sim-surface/chrome.sh`, port 9230) est locale au sens de D3. Son écran de veille éteindrait l'écran comme une page distante aujourd'hui. Voir la correction d'A3-1, point 4.
- **S7.** Mise en veille X ou DPMS de la Surface : hors dépôt. La lecture `brightness = 0` la rend peu probable comme cause de T1, puisque seul `backlight.js:113` écrit 0 et qu'un DPMS se réveille au toucher.
- **S8.** Contestation de décision, à part : `reset` reste libre pour tous pendant un travail de la tablette (`control.js:43`). C'est un arrêt, mais il fait perdre la position si la machine bouge. C'est conforme à F5 (« Pause et Stop ne demandent jamais le bail ») ; je le note seulement.

---

## 6. Ce que je n'ai pas vérifié

- Rien sur la vraie Surface, ni sur la RT ni sur la CNC : URL du kiosque, contenu de `.xinitrc`, présence de `touch.backlight.percent` dans le `.cncrc` de la Surface (qui décide si A3-2 s'est produit lors des installations avec `pm2 restart`), réglages DPMS d'X, méthode exacte de `xdotool`.
- Le comportement de Chromium face à un Ctrl+Maj+R annulé par `preventDefault` (A3-3) : l'essai avec Edge piloté par CDP n'a pas conclu, CDP ne déclenchant pas les raccourcis du navigateur.
- La poursuite du mouvement et de la broche après une fermeture du port (A3-5), et `$SLP` sur Grbl_ESP32 (A3-6) : à confirmer par A5 et par un essai.
- Le temps de démarrage de CNCjs après `pm2 restart` (S1), l'effet d'une mise à jour de `chromium` (S4), la saturation à 8 flux (S3).
- Aucune suite complète lancée (consigne) : seulement les trois tests ci-dessus, chacun seul. La correction proposée pour D3 n'est pas écrite.
- L'heure système (NTP) : les délais de la page utilisent l'horloge monotone (`screen-saver.js:9`, `job-stream.js:32`), ce que je n'ai pas approfondi.
