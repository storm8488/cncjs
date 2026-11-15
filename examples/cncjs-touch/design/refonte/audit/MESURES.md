# Mesures de départ du chantier C (phase 1, agent « mesures »)

Date : 2026-11-15, commit `c35c9587` (branche `feat/refonte-ui`, page au cache `v2u`, même code que `3049a0e4`).
Rôle : mesurer avant la refonte et classer les pistes d'optimisation (§ 6 du prompt de mission). Rien n'a été corrigé ; aucun fichier existant n'a été modifié.

**Où et comment.** PC de développement (i7-13700KF, 24 fils), Edge 157 sans tête, Node 26.13, banc local en boucle locale. Ce n'est ni la Surface Pro (Chromium récent avec GPU), ni la Surface RT (Chromium 106, Tegra 3, sans GPU). D'autres agents chargeaient le processeur pendant les mesures : **les compteurs (requêtes, octets, mises en page, rappels, mutations, paquets) sont fiables ; les durées sont données en médiane (min–max) et ne valent que comme ordre de grandeur et pour comparer avant / après sur le même PC.**

---

## 1. Méthode (commandes relançables telles quelles en phase 4)

Depuis la racine du dépôt ; `$M` est un dossier hors dépôt (ici `C:/Users/damou/AppData/Local/Temp/claude/69ebf499963b5699/46f050f4-71a8-4363-a194-280000d1f5f5/scratchpad/refonte/mesures`).

```
# 1. Outil créé pour ce lot (nouveau fichier, non commité) : les 6 mesures, v1 et v2
node examples/cncjs-touch/measure-refonte.cjs --out $M/avant --repeat 5 --window 20 --census 10 \
     --browser "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
#    (phase 4 : même commande avec --out $M/apres ; une étape seule : --steps startup|job|hidden|stream|dead|cache)

# 2. Outils existants, pour recouper (v1 1366 × 768 seulement)
CNC_BROWSER="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  node examples/cncjs-touch/measure-startup.cjs --repeat 5 --gzip --trace 3 --label avant-gzip --out $M/outils/startup-gzip-trace.json
CNC_BROWSER=... node examples/cncjs-touch/measure-job.cjs --screens home,menu,files,machine --window 20 --repeat 5 --label avant --out $M/outils/job-v1.json

# 3. Paquet groupé existant (build-bundle.cjs, non activé dans le paquet), mesuré comme la source
node examples/cncjs-touch/build-bundle.cjs --out $M/bundle
CNC_BROWSER=... node examples/cncjs-touch/measure-startup.cjs --root $M/bundle --repeat 5 --gzip --label bundle --out $M/outils/startup-bundle.json
#    → échoue aujourd'hui : « timeout: touch shell ready » (cause dans C8, diagnostic par $M/bundle-probe.cjs)
```

Résultats bruts : `$M/avant/refonte-*.json` et `$M/avant/refonte-startup-job-hidden-stream-dead-cache.md`, `$M/outils/*.json|*.log`. Le harnais complet de l'agent « base » (`…/refonte/avant/startup.json`, sans gzip) sert de troisième recoupement.

### Ce que fait `measure-refonte.cjs`

- **Variantes, même page `touch/index.html`.**
  - v1 Éco : 1366 × 768, profil absent (= éco), préférence v2 coupée, machine déclarée laser (la RT).
  - v2 Performance : 1366 × 911, profil performance, préférence v2 active, machine CNC. Comme `browser-run.cjs` : WebGL logiciel et sonde GPU répondue « matérielle » depuis l'extérieur de la page (aucun code livré n'est touché).
- **Contrôleur simulé.** Un mandataire devant `preview-server.cjs --replay --gzip` (gzip comme le middleware `compression` de CNCjs). Il répond à `/api/touch-job` et `/api/touch-events` :
  - au repos : programme chargé, position fixe, un paquet par seconde (le battement de `touch-stream.js` quand rien ne change) ;
  - en travail : la relecture déterministe, un paquet toutes les 208 ms.
  - Toute requête `/api/` autre que GET est refusée (403) et notée. Seules les tentatives `POST /api/signin` de la page ont été refusées : aucune commande machine.
- **Étapes.**
  - `startup` : 5 chargements à froid et 5 à chaud. Requêtes (200 / 304), octets transférés et décodés par type, coquille prête, v2 ouverte, temps de script, style, mise en page et tâches, nombre de mises en page, tas, éléments.
  - `job` : 5 fenêtres de 20 s sur Suivi, puis sur Menu (Suivi caché). Par seconde : tâches, script, mise en page, style, mises en page, recalculs, tâches longues, éléments, tas après GC, octets du flux. Plus une fenêtre profilée par écran.
  - `hidden` : pendant 10 s, sur chacun des 7 écrans au repos, en veille, puis en travail sur Suivi et sur Menu. Il compte, par site créateur (`fichier:ligne`) : minuteries, `requestAnimationFrame`, XHR et fetch. Il relève aussi les animations CSS en cours et les mutations du DOM par écran caché.
  - `stream` : les vrais `touch-stream.js` et `job-service.js` de `src/server`, chargés dans Node, sur un Grbl simulé qui rapporte toutes les 250 ms.
  - `dead` : analyse statique, avec la preuve « aucune référence ».
  - `cache` : les suffixes `?v=`, `git log -S` pour chacun, et les en-têtes du vrai couple `compression` + `serve-static` (`maxAge: 0`).
- Aucun msedge de mesure ne reste ouvert à la fin : contrôle `Get-CimInstance Win32_Process` (ligne de commande `cnc-browser-run`) = 0.
- **Piège relevé sur les outils existants.** `measure-startup.cjs` et `measure-job.cjs` ont laissé 5 Edge sans tête ouverts sous Windows (un par lancement, parent mort, 43 processus en tout). Edge passe la session à un autre processus, et `child.kill()` ne l'atteint pas. Je les ai fermés à la main, par leur profil `cnc-browser-run-*`. `measure-refonte.cjs` n'en a laissé aucun. En phase 4, il faut refaire ce contrôle après chaque outil existant.

---

## 2. Chiffres de départ

### 2.1 Démarrage (5 passes, médiane (min–max) ; gzip comme CNCjs)

| Indicateur | v1 Éco froid | v1 Éco chaud | v2 Perf. froid | v2 Perf. chaud |
| --- | ---: | ---: | ---: | ---: |
| Requêtes (hors flux) | 91 | 90 | 99 | 98 |
| 200 / 304 | 89 / 0 | 5 / 84 | 97 / 0 | 6 / 91 |
| Octets sur le fil | 558 kB | 34 kB | 625 kB | 36 kB |
| JS : fichiers (dont 2 du banc) | 72 | 72 | 79 | 79 |
| JS transférés / décodés | 493 kB / 1 463 kB | 27 kB / 13 kB | 553 kB / 1 644 kB | 29 kB / 15 kB |
| CSS : fichiers | 15 | 15 | 16 | 16 |
| CSS transférés / décodés | 61 kB / 231 kB | 4 kB / 0 | 67 kB / 258 kB | 5 kB / 0 |
| HTML décodé | 15,9 kB | 15,9 kB | 15,9 kB | 15,9 kB |
| Coquille prête (`cnc-loading` retiré), ms | 122 (116–137) | 90 (87–94) | 122 (116–126) | 102 (88–113) |
| v2 ouverte (`perf-v2` + `cncV2.state().open`), ms | — | — | 170 (164–178) | 134 (125–151) |
| Script / style / layout / tâches, ms | 26 (18–28) / 11 (11–12) / 5,6 (5,3–6,5) / 81 (73–83) | 23 / 8,7 / 5,1 / 93 (91–95) | 28 (17–29) / 13 / 5,7 (5,5–10) / 92 (80–95) | 25 / 11 / 5,6 / 108 (103–109) |
| Mises en page / recalculs de style | 39 / 35 | 37 / 34 | 36 / 40 | 35 / 39 |
| Éléments du DOM | 1 551 | 1 551 | 1 651 | 1 651 |
| Écouteurs (métrique) | 1 196 | 1 783 | 1 267 | 1 882 |
| Tas JS après GC | 3,79 MB (2,99–3,80) | 5,26 MB | 4,04 MB | 5,51 MB |

Les compteurs sont identiques d'une passe à l'autre ; seules les durées varient.

**Composition, mesurée sur les fichiers.**
- Les 69 scripts locaux d'`index.html` (plus `/socket.io/socket.io.js`) font 1 484 569 octets, soit 484 kB en gzip. Les 15 feuilles font 236 708 octets, soit 57 kB en gzip.
- Le banc ajoute deux scripts à lui : `visual-fixture.js` et `connection-fixture.js`.
- v2 ajoute 8 requêtes et 181 kB de JS décodé : `preview-gl.js` (101 kB, chargé pour la sonde GPU), 5 `performance-*.js` (82 kB), `i18n-messages-v2.js` (par XHR) et `performance-v2.css` (28 kB).
- Les 6 catalogues de phrases (`i18n-messages*.js` hors v2) font 382 387 octets, soit 118 kB en gzip : **26 % du JS décodé, 24 % du JS en gzip**.

**Recoupements.**
- `measure-startup.cjs --gzip --trace 3` (v1) : 89 requêtes, 561 kB transférés pour 1 699 kB décodés, coquille prête en 90 ms à froid et 78 ms à chaud.
- Trace d'un chargement à froid : fil principal 70,7 ms ; compilation 37 ms (tâche de fond comprise) ; évaluation 30,5 ms ; recalcul de style 10,9 ms ; mise en page 5,2 ms.
  - Dans l'évaluation, 16,5 ms reviennent à `library-preview-worker.js`. Ce travailleur est lancé **par le banc** (`visual-fixture.js` dessine un aperçu d'exemple au premier XHR), pas par la page : il faut l'exclure des chiffres de la page.
  - `i18n-messages.js` : 2 ms de compilation ; `i18n.js` : 1,8 ms d'évaluation (la table de toutes les phrases).
- Harnais de l'agent « base » (sans gzip) : 89 ressources, 1,68 MB transférés, coquille prête en 142 ms à froid.
- Son chiffre « 5 759 nœuds DOM » est la métrique `Nodes` de DevTools. Elle compte aussi les nœuds texte et ceux des documents précédents pas encore ramassés. Le nombre d'éléments est de 1 551.

### 2.2 Pendant un travail relu (`--replay`, 4,6 paquets/s ; 5 fenêtres de 20 s)

| Variante · écran | tâches ms/s | script ms/s | layout ms/s | style ms/s | mises en page/s | recalculs/s | tâches > 50 ms | éléments | tas après GC | flux reçu o/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| v1 Éco · Suivi | 9,0 (8,7–10,4) | 3,4 (3,4–4,1) | 1,5 (1,4–1,6) | 0,2 | 4,7 (4,6–5,6) | 5,5 (5,2–6,4) | 0 | 1 561 | 3,11 MB (3,06–3,63) | 10 782 |
| v1 Éco · Menu (Suivi caché) | 5,7 (5,1–5,9) | 2,7 (2,5–2,8) | 0,6 | 0 | 4,6 | 0,2 | 0 | 1 561 | 3,59 MB (3,57–3,61) | 10 779 |
| v2 Perf. · Suivi | 10,2 (9,7–12,0) | 4,3 (4,1–5,0) | 1,2 (1,2–1,9) | 0,3 | 5,6 | 5,6 | 0 | 1 661 | 3,71 MB (3,59–4,21) | 10 775 |
| v2 Perf. · Menu (Suivi caché) | 6,6 (5,9–6,7) | 3,1 (3,0–3,4) | 0,6 | 0 | 4,6 | 0,2 | 0 | 1 661 | 4,21 MB (4,19–4,22) | 10 779 |

- Sur ce PC, le fil principal est occupé moins de 1,1 % du temps, sans aucune tâche longue.
- Une mise en page par paquet reste sur Menu, avec 0,2 recalcul de style par seconde : ce sont les textes du bandeau, qui reste visible. C'est légitime.
- **Tas** : + 25 à 57 kB par fenêtre de 20 s sur Suivi, et un saut d'environ 500 kB à la 5e fenêtre, en v1 comme en v2. Sur Menu, + 9 kB par fenêtre. C'est trop court pour conclure à une fuite (à remesurer, § 3.3).
- **Profil de Suivi (fenêtre profilée de 20 s, temps propre).**
  - v1 : `job-controls.js` 7,4 ms (`elapsedClock` :91, `projected` :311, `render` :325), `getBoundingClientRect` 2,7 ms, `shared-library.js:623` 2,7 ms, `status-strip.js:120` 1,9 ms.
  - v2 : **`v2Apply` `tablet-profile.js:258` 10,6 ms**, la plus grosse entrée JS de la page. Viennent ensuite `job-controls.js` 4,8 ms et `job-dashboard.js` 2,9 ms.
- Le paquet relu par le banc fait 1 888 octets, alors que le vrai serveur en envoie 5 694 (§ 2.4). Le coût d'analyse JSON de la page est donc sous-estimé environ 3 fois.
- Recoupement `measure-job.cjs` (v1 1366 × 768, banc `--replay` d'origine, paquets 4,8/s aussi au repos) : voir § 2.2 bis.

### 2.2 bis Recoupement `measure-job.cjs` (v1)

| Écran | évén./s | mutations DOM/s | mises en page/s | recalculs/s | script ms/s | layout ms/s | tâches ms/s (5 fenêtres) | tâches > 50 ms | événement → image p50 / p95 / max, ms | tas après GC | croissance par fenêtre |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | ---: | ---: |
| Suivi | 5,8 | 259 | 4,8 | 5,7 | 3,4 (3,3–3,9) | 1,5 | 9,0 (8,6–9,4) | 0 | 0,4 / 6,2 / 15,7 | 2 977 kB | 38 kB |
| Menu | 5,8 | 236 | 4,8 | 0,2 | 2,8 (2,6–2,8) | 0,6 | 6,0 (5,5–6,6) | 0 | 0,3 / 2,2 / 14,8 | 3 397 kB | 9 kB |
| Fichiers | 5,8 | 242 | 4,8 | 0 | 3,4 (3,3–3,4) | 0,6 | 6,6 (6,2–7,0) | 0 | 0,3 / 0,9 / 14,9 | 3 457 kB | 10 kB |
| Machine | 5,8 | 252 | 4,8 | 0 | 3,3 (3,2–3,6) | 1,0 | 7,4 (7,1–8,3) | 0 | 0,3 / 2,7 / 13,3 | 3 535 kB | 10 kB |

- Mêmes ordres de grandeur que `measure-refonte.cjs` : 9 ms/s sur Suivi, 6 ms/s sur Menu.
- **236 à 259 mutations du DOM par seconde, quel que soit l'écran.** D'après § 2.3, environ 207 par seconde (80 à 88 %) visent Réglages, qui est caché.

### 2.3 Écran caché : minuteries, sondages, animations (10 s par état, nombre de rappels)

| Site (créateur) | Période | Menu | Suivi | Fichiers | Préparer | Machine | Journal | Réglages | Veille | Travail Suivi | Travail Menu | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| interval `job-controls.js:662` (render, compte à rebours, `poll`) | 1 s | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | global, voulu (surveillance) |
| interval `job-stream.js:128` (silence du flux) | 1 s | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | global, voulu |
| interval `real-motion.js:460` (`viewClock`) | 1 s | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | écran affiché seulement : correct |
| rAF `tool-position.js:172` | par paquet | 0 | 20 | 0 | 0 | 0 | 0 | 0 | 0 | 56 | 0 | écran affiché seulement : correct |
| rAF `viewport-fit.js:185` + timeout `:195` (ajustement, au plus 1/s) | ~1 s | 0 | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 10 | 0–2 | Machine au repos : 1 ajustement par seconde (§ 3.3) |
| timeout `header-clock.js:26` | 1 min | 0–1 | | | | | | | 0–1 | | | voulu |
| xhr `job-stream.js:89` GET `/api/touch-events` | 60 s | rotation du flux, aucun sondage | | | | | | | | | | voulu |
| **v2 seulement** : rAF `tablet-profile.js:256` → `v2Apply` | par paquet | 20 | 20 | 20 | 20 | 21 | 20 | 20 | **20** | 56 | **57** | **tourne sur tous les écrans, veille comprise** (§ 3.1) |
| v2 : rAF `job-dashboard.js:727`, `job-preparation.js:280`, `origin-preview.js:211`, `machine-limits.js:145`, `shared-library.js:729` | par paquet | — | — | — | — | — | — | — | 0 | — | 0 | chacun sur son écran affiché seulement : correct |

- **Animations CSS en cours : aucune**, dans tous les états, v1 et v2 (`document.getAnimations()`).
- **Sondages réseau : aucun.** Seul le flux NDJSON circule, avec sa rotation ; aucun XHR ni fetch périodique au repos, en veille ni en travail.
- **Mutations du DOM sur des écrans cachés** (10 s, identiques en v1 et v2) :

| Cible (écran caché) | Repos, tout écran sauf Réglages | Veille | Travail (Suivi ou Menu) | Cause |
| --- | ---: | ---: | ---: | --- |
| `#ks-system button@disabled` (Réglages → Système) | 40 | 38–40 | **2 016–2 052** | `wifi-settings.js:179` → `disable()` `:83-87` remet `disabled` sur chaque bouton du clavier Wi-Fi et de la liste à chaque `cnc-job-status`, Réglages fermé |
| `#ks-system button@data-state` | 20 | 19–20 | 56–57 | `system-updates.js:110` → `paint()` `:58-79` à chaque `cnc-job-status`, sans test `shown()` |
| `#wx #mx #wy #my` (texte, Suivi caché) | 0 | 0 | 94 | coordonnées de Suivi mises à jour sur Menu pendant un travail |
| `#job-progress@value`, `@aria-label` (Fichiers caché) | 0 | 0 | 2–4 | mineur |

Pendant un travail, environ **207 écritures d'attribut par seconde** visent un écran caché.

### 2.4 Flux `touch-events`

**Côté serveur.** `touch-stream.js` et `job-service.js` réels, dans Node, sur un Grbl simulé qui rapporte toutes les 250 ms (3 passes de 15 s par scénario).

| Scénario | rapports/s | paquets/s par client | octets/paquet | o/s par client | traitement d'un rapport | coût d'un paquet (snapshot + signature + ligne) | estimation CPU |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Repos, 1 client | 3,9 | 0,9 | 5 177 | 4 830 | 38 µs (37–42) | 70 µs (66–76) | 0,2 ms/s |
| Repos, 2 clients | 3,9 | 0,9 | 5 177 | 4 829 | 34 µs | 70 µs | 0,2 ms/s |
| Travail (rapport changeant), 1 client | 3,9 | 3,9 | 5 694 | 22 000 | 36 µs | 74 µs (70–76) | 0,4 ms/s |
| Travail, 2 clients | 3,9 | 3,8 | 5 696 | 21 643 | 36 µs | 71 µs | 0,4 ms/s |

- Le CPU mesuré par `process.cpuUsage` (0 à 4 ms/s) n'est pas exploitable : sous Windows, il avance par pas de 15,6 ms. L'estimation vient de chronomètres `hrtime` autour du traitement des rapports et de la construction d'un paquet.
- **Un paquet est un instantané complet**, sans différence avec le précédent. Plus grosses clés d'un contrôleur : `machineProfile` 825–990 o, `capabilities` 928, `motion` 804, `probeInput` 303, `settings` 121. Environ 3,2 kB de ces 5,7 kB ne changent pas pendant un travail.
- **Rotation par taille** : `MAX_CLIENT_BYTES` = 512 kB (`touch-stream.js:16`). À 22 000 o/s, une réponse est tournée toutes les **≈ 24 s** pendant un travail, au lieu de 60 s (au repos : 4 830 o/s, donc 60 s). Chaque rotation fait une nouvelle requête, `openTransport` / `closeTransport`, et l'attente d'un ticket éventuel.
- **Côté page** (banc relu) : 4,6 paquets/s, 4,6 morceaux reçus/s, 10,8 ko/s, pour des paquets de 1 888 o au lieu de 5 694.
- Coût serveur réel sur la Surface : non mesuré. L'estimation PC (0,4 ms/s) est négligeable devant le reste de CNCjs.

### 2.5 Code mort (candidats, à confirmer)

La règle de preuve : aucune occurrence du nom comme mot entier (`[A-Za-z0-9_-]` en bordure) dans `index.html` ni dans un script que la page réelle charge. Pour les phrases, on cherche aussi dans tout `src/server`. Les scripts que seul `simulation.html` charge sont comptés à part.

```
# un jeton CSS (ex. t-rail) : rien dans la page réelle
grep -rnE "(^|[^A-Za-z0-9_-])t-rail($|[^A-Za-z0-9_-])" examples/cncjs-touch/touch --include=*.js --include=*.html
# une phrase : rien hors des catalogues, ni dans src/server
grep -rnF "Corrections en cours de travail" examples/cncjs-touch/touch src/server | grep -v i18n-messages
# un membre exporté (ex. closePilot) : seulement son propre fichier
grep -rn "closePilot" examples/cncjs-touch/touch examples/cncjs-touch/*.cjs
```

**Scripts jamais chargés par la page réelle**, ni par un script qu'elle charge : `coordinate-editor.js`, `coordinate-plan.js`, `job-simulation.js`, `simulation-history.js`, `simulation-machine.js`, `simulation-motion.js`, `simulation-report.js` (55 kB). Tous viennent de `simulation.html`, le banc de test, non déployé (`tablet-exclude.txt`). Rien à faire pour la page réelle.

**Règles CSS sans référence** (feuilles chargées par `index.html`) :

| Feuille | règles | sans référence nulle part | utiles à la simulation seule | octets | exemples |
| --- | ---: | ---: | ---: | ---: | --- |
| `ui-2027.css` (118 kB) | 902 | 37 | 18 | 6 723 | `.t-rail*`, `.t-tile*`, `.t-statusbar*`, `.t-row*`, `.t-pad`, `.t-zpad`, `.t-why`, `.t-progress*`, `.t-label`, `.t-btn--info`, `.t-btn--block`, `.t-seg--lg`, `.t-ov-steps`, `.t-ov-fine`, `.t-dialog-actions` ; simulation : `.ks-command*`, `.coordinate-card*` |
| `operator-tools.css` | 59 | 0 | 34 | 2 167 | `.coordinate-*` (éditeur de coordonnées de la simulation) |
| `app.css` | 152 | 7 | 0 | 695 | `.origin-actions`, `#screen-machine .machine-help*`, `#display-size`, `.display-check`, `#display-machine` |
| `touch-shell.css` | 239 | 1 | 0 | 61 | `.ks-real #screen-settings .display-check` |

Au total, 96 règles et 9,6 kB des 231 kB de CSS (4 %). 41 règles de `settings-list.css` et 2 autres portent une classe qui peut être construite dans le code (`'préfixe-' + nom`) : elles ne sont pas comptées comme mortes.

**Membres exportés** (`window.X = { … }`) sans référence hors de leur fichier :
- 5 sans aucune référence : `cncJobControls.closePilot`, `cncLaserZ.mark`, `cncStatusStrip.toggleMessages`, `CNCCommissioning.LASER_CHECKS`, `cncJobFollow.prefs` ;
- 11 appelés seulement par un test : `cncLibraryView.v2Messages`, `cncJobControls.refresh`, `.stream`, `.forgetMachine`, `.targetText`, `cncStatusStrip.syncMessages`, `cncJobPreparation.ticks`, `CNCCommissioning.STEPS`, `.settingsText`, `.commandSent`, `cncRealMotion.holding`. Ce sont des API de test, à garder.

**Phrases i18n** (2 550 lignes FR / EN / ES) :
- **51 phrases sans aucune référence**, ni page, ni serveur. Exemples : « Affichage et veille », « Corrections en cours de travail », « Sonde : profils et diagnostic », « Chronologie et export », « Séquence estimée », « Nom de la machine », « Oublier cette fiche machine ».
- 137 phrases utilisées par la seule simulation.
- 48 faux positifs écartés à la main : « Origine G5x réglée par palpage … » et « Palpage … au bloc, repère G5x » sont construites par `block-probe.js:467` et `:1031`.

Liste complète : `$M/avant/refonte-dead.json`.

### 2.6 Cache (ligne T14)

**Les suffixes.** 95 suffixes `?v=` portent 23 valeurs : 84 dans `index.html`, 11 dans les scripts (travailleurs, `importScripts`), plus `ADVANCED_VERSION='v2u'` (`tablet-profile.js:15`), qui vaut pour les scripts v2 et `preview-gl.js`.

| Valeur | n | Fichiers |
| --- | ---: | --- |
| `v2u` | 63 | 55 balises d'`index.html`, plus les adresses internes des travailleurs (`library-preview.js:5`, `library-preview-worker.js:6`, `laser-view.js:11,119`, `preview-inspect.js:12,477`) |
| `network11` | 6 | `cnc-state.js`, `library-payload.js`, `probe-profiles.js`, `probe-preparation.js`, `profile-storage.js`, `startup-ready.js` |
| `review1`, `ui1`, `fix3`, `a31h` | 2 chacun | `files-touch.css` + `perf-harness.js` ; `operator-tools.css` + `commissioning.css` ; `i18n-messages-viz.js` + `job-stream.js` ; `strip-guard.js` + `screen-lock.js` |
| `view3` | 2 | `preview-3d.js:19` → `preview-3d-worker.js`, qui importe `toolpath-3d.js?v=view3` |
| 15 valeurs isolées | 1 chacune | `a31f` startup.js, `theme1` app.css, `kept2` viewport-fit.css, `perfui2` i18n-messages-origin.js, `a31g` numeric-pad.js, `downloads16` download-file.js, `depth3` toolpath-3d.js, `msg31a` program-check-view.js, `network12` coordinate-display.js, `prof7` laser-z.js, `pass2a` probe-diagram.js, `review2` macros.js, `fix2` tablet-actions.js, `audit1` preview-viewer.js, `prof2` viewport-fit.js |
| `worker13` | 1 | `library-preview-worker.js:6` → `toolpath-3d.js` |

`toolpath-3d.js` est ainsi demandé sous trois suffixes : `depth3` par la page, `worker13` et `view3` par les travailleurs.

**Ce qui les met à jour : la main, à chaque lot.**
- Commande : `git log -1 -S"<fichier>?v=<valeur>" -- examples/cncjs-touch/touch/index.html`, comparée au dernier commit du fichier.
- Résultat : **0 suffixe en retard sur 82 datés**. Chaque fichier modifié a reçu le suffixe du lot qui l'a modifié. Les 2 autres (`fix3`) ne sont pas datés par `-S`.
- Une dizaine de tests figent aussi `v2u` (`test-v2-gate.cjs`, `test-menu-screen.cjs:284`, `test-v2-i18n.cjs`…). Un changement de valeur touche donc aussi les tests.

**Ce que reçoit un navigateur.** Mesure sur le vrai `compression` + `serve-static` de `node_modules`, `maxAge: 0` comme `settings.base.js:53-59`, sur une copie temporaire :

| Requête | 1re | Revalidation (`If-None-Match`) | Après « déploiement » (contenu changé, même `?v=`) |
| --- | --- | --- | --- |
| `/index.html` | 200, `public, max-age=0`, gzip, ETag faible, `Last-Modified` | 304 | **200, nouveau contenu** |
| `/touch-shell.js?v=v2u` | 200, idem | 304 | **200, nouveau contenu** |

Au chargement chaud, la page revalide 84 fichiers (v1) ou 91 (v2) : 84 à 91 réponses 304, pour 34 à 36 kB sur le fil (§ 2.1).

**Conclusion, qui recoupe A3 (`A3-kiosque-hote.md` § 2).** Avec `max-age=0` et l'ETag, un suffixe inchangé ne sert jamais une copie périmée : les suffixes ne sont pas la cause de T14. Ils sont tous à jour, et leur seul effet est un coût d'entretien (95 occurrences, 23 valeurs, des tests figés).

---

## 3. Pistes classées par gain attendu

Gain estimé sur ce PC, avec le même outil. Le gain réel sur la RT ou la Surface reste à mesurer.

### 3.1 Travail inutile à supprimer

| # | Piste | Indicateur visé | Départ → visé | Risque | Fichiers |
| --- | --- | --- | --- | --- | --- |
| C1 | Réglages fermé : ne plus remettre `disabled` sur les boutons Wi-Fi et du clavier à chaque paquet. Ne le faire que si l'état « bloqué » change, et à l'ouverture de l'onglet | mutations sur écran caché ; mutations du DOM au total | 2 016–2 052 / 10 s → ~0 (repos : 40 / 10 s → 0) ; au total, 236–259 /s → ~40–50 /s pendant un travail (−80 %, `measure-job.cjs`) | faible : l'état est recalculé à l'ouverture ; garder le refus au clic | `wifi-settings.js:83-89, 179` |
| C2 | Mises à jour système : `paint()` seulement si l'onglet Système est affiché ou si l'état change | mutations sur écran caché | 56 / 10 s (travail), 20 / 10 s (repos) → 0 | faible | `system-updates.js:110` |
| C3 | v2 : ne plus demander une image (`requestAnimationFrame(v2Apply)`) à chaque paquet une fois la mise en page v2 posée, et jamais en veille. Garder le retour à v1 au repos sur perte de capacité, par un test synchrone ou un événement | rAF sur tous les écrans et en veille ; script ms/s de v2 Suivi | 20 / 10 s au repos (veille comprise), 56–57 / 10 s en travail → 0 ; `v2Apply` = 10,6 ms sur 20 s, soit ~12 % du script de v2 Suivi (4,3 ms/s) | moyen : c'est la porte v2 (`test-v2-gate.cjs`, `PERFORMANCE-UI-SPEC.md`), le retour à v1 doit rester prouvé | `tablet-profile.js:243-266, 300-311` |
| C4 | Coordonnées de Suivi (`#wx #mx #wy #my`) mises à jour quand Suivi est caché | mutations sur écran caché, travail | 94 / 10 s → 0 | faible, mais gain sans doute invisible (écran en `display:none`) | `app.js:179` |
| C5 | Supprimer les 96 règles CSS sans référence (9,6 kB décodés), dont 52 de la simulation à déplacer dans une feuille propre à `simulation.html` | octets CSS décodés ; nombre de règles analysées | 231 kB → 222 kB (−4 %) ; 1 352 → 1 256 règles dans ces 4 feuilles | faible, mais vérifier visuellement la simulation | `ui-2027.css`, `operator-tools.css`, `app.css`, `touch-shell.css` |
| C6 | Supprimer les 5 membres exportés sans référence et les 51 phrases sans référence | lignes de code, octets i18n | −51 lignes de catalogue (≈ 9 kB) | faible ; `verify-project.cjs` et `test-i18n.cjs` à relancer | `job-controls.js`, `laser-z.js`, `status-strip.js`, `commissioning.js`, `job-follow.js`, `i18n-messages*.js` |
| C7 | Une seule valeur de cache, contrôlée par `verify-project.cjs` (proposé aussi par A3) | nombre de valeurs `?v=` à tenir | 23 valeurs, 95 occurrences → 1 valeur | faible ; tests qui figent `v2u` à aligner | `index.html`, `tablet-profile.js:15`, travailleurs, tests |

### 3.2 Gain mesurable d'au moins 10 %

| # | Piste | Indicateur visé | Départ → estimé | Risque | Fichiers |
| --- | --- | --- | --- | --- | --- |
| C8 | Activer le paquet groupé existant (`build-bundle.cjs`) pour `/touch/` | requêtes au démarrage, revalidations à chaud, coquille prête | **Requêtes : 91 → ~10 (−89 %)**, compté sur le paquet construit : `index.html` passe de 68 scripts et 15 feuilles à `touch-index.<hash>.js` (1 459 kB) et `.css` (232 kB). **Revalidations à chaud : 84 → ~6.** Pour le temps, la mesure de `TESTING.md` (70 → 7 requêtes, coquille chaude 92,7 → 63,9 ms, −31 %) date d'un ancien commit. **Elle n'a pas pu être refaite** : sur le banc actuel, le paquet reste en « Chargement incomplet ». Ce n'est pas une preuve contre le paquet : `visual-fixture.js:6` appelle `CNCLibraryPreview` avant que le paquet ne l'ait défini (`ReferenceError`), puis refuse `/api/custom/health`. `test-bundle.cjs` passe (contrôle statique) | moyen : une erreur de syntaxe perd tout le paquet (Pause et Arrêter compris, en-tête de `build-bundle.cjs`) ; déploiement et `copy-touch-assets.sh` à adapter ; non validé sur la RT | `build-bundle.cjs`, déploiement, `src/server/config/settings.base.js` (route) |
| C9 | En français, ne plus charger ni indexer les phrases des catalogues : `i18n.js` rend la phrase telle quelle si `language==='fr'` (`i18n.js:22`). Garder `CNCTouchCodes` (42 kB), utilisé aussi en français par `format()`. Charger les phrases seulement en anglais ou en espagnol | JS décodé, octets sur le fil, requêtes, compilation | JS décodé 1 463 → ~1 123 kB (−23 %) ; gzip 484 → ~380 kB (−21 %) ; fil 558 → ~455 kB (−18 %) ; requêtes 91 → 86 (−5 %) ; compilation et évaluation d'environ 5 ms sur 71 ms de fil principal (−7 %, PC) | moyen : ordre des scripts `defer` (les catalogues précèdent `i18n.js`) ; test EN / ES obligatoire ; la langue de la RT n'est pas connue (des variantes du harnais l'affichent en espagnol) | `index.html:136`, `i18n.js`, `i18n-messages*.js`, `startup.js`, `test-i18n.cjs`, `verify-project.cjs` |
| C10 | Flux : ne plus renvoyer à chaque paquet les blocs qui ne changent pas (`machineProfile`, `capabilities`, `settings`, une partie de `motion`). Les envoyer quand leur signature change, ou dans le premier paquet de chaque réponse | octets par paquet ; rotations par minute pendant un travail | 5 694 → ~2 500 o (−55 %) ; 22 000 → ~9 700 o/s ; rotation toutes les ~24 s → ~54 s | **élevé** : protocole (`validSnapshot` de `job-stream.js`, tables de la page), côté serveur, donc soumis aux règles du chantier A ; le CPU serveur n'y gagne rien de notable (0,4 ms/s) | `src/server/services/touch/touch-stream.js`, `job-service.js`, `touch/job-stream.js`, `cnc-state.js` |

### 3.3 À remesurer après la refonte

| # | Quoi | Départ | Pourquoi |
| --- | --- | --- | --- |
| R1 | Fil principal pendant un travail | v1 Suivi 9,0 ms/s (8,7–10,4), v2 Suivi 10,2 ms/s (9,7–12,0) ; Menu 5,7 et 6,6 ms/s ; 0 tâche > 50 ms ; 4,7–5,6 mises en page/s | Aucune piste isolée n'y promet 10 % sur PC, hors C3 (v2). La refonte change Suivi, qu'il faut remesurer tel quel |
| R2 | Ajustement d'écran (`viewport-fit.js:185, 195`) au plus 1 fois par seconde : Machine au repos (10 / 10 s), Suivi en travail | layout 1,2–1,5 ms/s sur Suivi | Un écran dont le contenu change chaque seconde au repos force une mise en page chaque seconde. À recompter sur les nouveaux écrans |
| R3 | Tas pendant un travail | + 25 à 57 kB par 20 s sur Suivi, saut d'environ 500 kB vers 100 s ; Menu + 9 kB par 20 s | Une fuite lente reste possible. Il faut une mesure d'endurance d'au moins 30 min (`measure-performance-v2.cjs --endurance` sur la Surface, ou `--window 60 --repeat 30` ici) |
| R4 | Démarrage v2 | + 8 requêtes, + 181 kB de JS dont `preview-gl.js` (101 kB), v2 ouverte à 170 ms (164–178) à froid | À recompter si la refonte change ce que v2 charge |
| R5 | Éléments du DOM et écouteurs | 1 551 et 1 196 (v1), 1 651 et 1 267 (v2) | La refonte réunit et supprime des écrans ; c'est l'indicateur direct du « code mort retiré » |
| R6 | Poids du CSS | 231 kB décodés, dont `ui-2027.css` 118 kB ; 39 mises en page au démarrage | À recompter après L1 (composants unifiés) |
| R7 | Paquet réel côté page | le banc envoie 1 888 o, le serveur 5 694 o | Pour mesurer le coût de C10 côté page, il faudrait un banc aux paquets du vrai serveur (non fait) |

---

## 4. Ce qui n'est pas vérifié

- Rien n'a été mesuré sur la Surface Pro, la Surface RT ni la CNC : ni ssh, ni déploiement. Toutes les durées viennent d'un PC rapide et chargé par d'autres agents. Le rapport Tegra 3 / PC n'est pas mesuré.
- v2 tourne en WebGL logiciel avec une sonde GPU forcée de l'extérieur. La vue 3D en direct n'est pas ouverte sur Suivi : les aperçus du banc n'ont pas de tracé 3D. Le coût GPU et WebGL de v2 n'est donc pas mesuré.
- La page reçoit les paquets du banc (1,9 kB), pas ceux du serveur réel (5,7 kB). Le flux réel n'a été mesuré que dans Node, avec un Grbl simulé dont `sender` et `workflow` sont des maquettes : pas de vrai CNCjs, pas de socket série. Le coût de la compression gzip du flux par CNCjs n'est pas mesuré (`no-transform` dans les en-têtes).
- Le « code mort » repose sur une recherche de chaînes. Un nom construit à l'exécution passe pour mort. 48 cas ont été trouvés et écartés à la main pour l'i18n ; il peut en rester. Ces candidats sont à confirmer un par un avant suppression.
- Les gains de C8 à C10 sont des estimations calculées à partir des tailles des fichiers et des paquets, sauf C8, mesuré sur le paquet construit. Aucune correction n'a été écrite ni mesurée.
- Le trafic réel de `/socket.io/` est remplacé par `connection-fixture.js`. Le coût de socket.io (sondage, battement) n'est donc pas mesuré.
- Le temps de compilation par fichier vient de 3 traces seulement.
- Le démarrage du paquet groupé (C8) n'a pas été mesuré : il échoue sur le banc actuel (§ 3.2). Les temps cités viennent de `TESTING.md`, sur un ancien commit.
- Coût réel d'une écriture d'attribut sur un écran caché : non isolé. Les mutations sont comptées, mais leur part dans les 9 ms/s ne se voit pas dans le profil sur PC (moins de 1 ms sur 20 s).
