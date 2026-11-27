# N3 — Notification de fin, de pause et d'alarme

Travail de la nuit du 26 novembre 2026 dans `cncjs-wt/N3`, branche `feat/N3`, base `0acd1c3b`. Page seule : aucun fichier du serveur n'est modifié, aucune commande n'est envoyée à la machine, rien n'est installé, aucun accès à la tablette, à la RT ni à la CNC.

## Ce que l'opérateur voit et entend

- **Un grand bandeau** sous le bandeau d'état, à droite du rail, sur toute la largeur de l'écran : pictogramme, titre de 72 px (environ 14 mm sur la Surface Pro), une phrase, « Touchez ce message pour le fermer. ».
  - Vert, coche : « Usinage terminé » (laser : « Gravure terminée ») et le nom du fichier. Orange si des lignes ont été refusées : « 3 lignes refusées par la machine : vérifiez la pièce. » (« 1 ligne refusée… » au singulier).
  - Orange, deux barres : « Pause » et sa cause : « Changement de fraise demandé par le fichier. », « Pause demandée par le fichier. », « Une ligne a été refusée par la machine. », « La machine s'est mise en pause. », « Porte ouverte. », « Usinage en pause. ».
  - Rouge, triangle : « Alarme 2 » et les phrases déjà écrites pour l'écran Machine (« Alarme 2 : la machine a dépassé sa course. La machine a redémarré. Perdu : la position de la machine. »).
- **Un son court**, fabriqué par la page (Web Audio, aucun fichier) : fin = trois notes montantes ; pause = deux notes égales ; alarme = deux tons alternés, trois fois (1,3 s).
- **Réglages → Affichage → « Son des notifications »** (portée « Cette tablette ») : Coupé / Faible / Moyen / Fort (Fort au départ), « Essayer le son » (les trois sons à la suite), et une ligne d'état : « Son prêt. », « Son en attente : touchez l'écran une fois après l'ouverture de la page. », « Son coupé : seul le message s'affiche. », « Son indisponible dans ce navigateur. ».
- Le bandeau reste jusqu'au toucher. Deux cas où il part seul, parce que ce qu'il annonce n'est plus vrai : le bandeau « Pause » à la reprise (ou à l'arrêt), le bandeau « terminé » au départ d'un nouvel usinage. **Le bandeau d'alarme ne part jamais seul**, même après un déverrouillage, et rien ne le remplace sauf une autre alarme.
- Rien d'ancien n'est rejoué : le premier état vu au chargement de la page (ou à l'ouverture d'un autre port) sert de point de départ, sans bandeau ni son.

## Comment c'est fait

- `touch/notify.js` écoute l'événement `cnc-job-status` que `job-controls.js` publie déjà pour toute la page. Pas de requête, pas de minuterie, pas de second canal. Champs lus : `activeState`, `workflow`, `programPause.kind`, `finished`, `finishedWithErrors`, `jobErrors`, `jobStopped`, `total`, `received`, `fresh`, `alarmCode`, `port`, `generation`, `machineProfile.kind`.
- Une fonction pure `CNCNotify.reduce(état, instantané, horloge)` décide des événements ; elle est testée seule. La fin d'un usinage : verdict du serveur attendu 2 s ; sans verdict (fichier chargé depuis le PC, simulation), la fin n'est annoncée que si la page a vu **la machine au repos avec toutes les lignes reçues** (dernier rapport du travail, ou rapport de repos qui porte encore le compte). Jamais après un Arrêter, jamais quand une alarme est là. Dans le doute, rien n'est annoncé.
- Le bandeau n'est pas un dialogue : il ne prend pas le focus, ne rend rien inerte, commence sous le bandeau d'état (`--statusbar-h`), et son `z-index` (400) est sous le verrou d'écran (500), les volets (600), le pavé (750) et les confirmations (800). Une confirmation en cours reste donc entièrement au-dessus de lui.
- Son : le contexte audio n'est créé qu'au premier geste (`pointerup`, `click`, touche), parce que Chromium le refuse avant. Un son refusé n'est jamais mis en attente : il ne sonnera pas plus tard. Si le son n'a pas pu jouer, le bandeau l'écrit : « Son bloqué par le navigateur : touchez l'écran une fois. » quand un toucher peut l'armer, « Son indisponible dans ce navigateur. » quand il n'y a pas de Web Audio ou que sa création a échoué (un toucher n'y changerait rien).
- RT (Chromium 106, v1 Éco) : aucune animation ni transition, aucune image, `AudioContext` standard avec repli `webkitAudioContext`, et sans Web Audio le bandeau marche seul. CSS par jetons (`--ok`, `--warn`, `--danger`, `--surface`, `--fg`), donc le thème « Métal d'atelier » et le thème clair s'appliquent.

## Choix faits sans l'opérateur (au plus prudent)

1. **Volume « Fort » au départ.** La fonction sert à être entendu de loin ; l'opérateur peut baisser ou couper.
2. **Un son, une fois.** Pas de répétition jusqu'au toucher (le lot demande un son court et aucune animation continue). Idée laissée à l'opérateur : répéter le son d'alarme toutes les 30 s tant que le bandeau n'est pas touché.
3. **Pause demandée sur cet écran : pas de bandeau.** Si l'écran a été touché dans les trois secondes qui précèdent une pause « d'opérateur », l'opérateur est devant : le bandeau d'état dit déjà « Pause ». Toute autre pause (fichier, changement de fraise, ligne refusée, porte, pause venue du PC sans toucher récent) est annoncée, même juste après un toucher. Si la cause « fichier » n'arrive qu'un rapport plus tard, elle est annoncée à ce moment.
4. **État perdu puis revenu** (réseau de la RT, serveur relancé) : ce qui s'est passé pendant la coupure est annoncé au retour, sur le même port et la même ouverture. Une alarme ratée vaut pire qu'une alarme annoncée en retard.
5. **Arrêter n'est pas une fin** : pas de bandeau « terminé » après un arrêt de l'opérateur, ni après une alarme en cours d'usinage (seule l'alarme est annoncée).
6. **Le bandeau ne bloque pas la veille de l'écran, et la veille n'est pas modifiée** (`screen-saver.js` intact, `notify.js` ne la connaît pas). Après une fin, ou une alarme au repos, l'écran s'éteint comme d'habitude et son voile noir couvre le bandeau ; le toucher qui réveille l'écran est absorbé par le voile et ne ferme pas le bandeau, qui est donc encore là au réveil. Le son, lui, n'a joué qu'une fois. Vérifié sur le faux DOM et dans Edge (harnais, étape `sim`). L'autre choix, suspendre la veille tant qu'un bandeau est affiché, reste à trancher par l'opérateur.
7. **La page de simulation l'a aussi** (même script), pour un essai sans machine.
8. **Suffixe de cache inchangé** (`?v=v2v`) : fichier partagé, laissé à la réunion.

## Fichiers

- Nouveaux : `touch/notify.js`, `touch/notify.css`, `test-notify.cjs`, ce rapport.
- Partagés, modifications minimales : `touch/index.html` et `touch/simulation.html` (une feuille de style après `settings-list.css`, un script après `job-follow.js`), `touch/i18n-messages.js` (24 lignes FR / EN / ES en fin de fichier), `verify-project.cjs` (`'notify'` en fin de liste), `design/refonte/PROTOCOLE-ESSAI.md` (section N3 en fin de fichier).
- Serveur : rien.

## Tests

`test-notify.cjs` (dans `verify-project.cjs`), sans navigateur :
- fonction pure : rien au chargement (alarme, fin, pause déjà là), autre port ou port rouvert ; alarme une seule fois ; chaque cause de pause ; cause connue un rapport plus tard ; palpage pendant une pause de changement de fraise ; fin par verdict du serveur, fin d'un usinage lancé du PC après 2 s, pas de fin après Arrêter, lignes manquantes, alarme ou rapport ancien ; état perdu puis revenu ;
- son, sur un faux `AudioContext` : rien avant un geste, rien en attente sur un contexte suspendu, trois sons distincts de moins de 2 s, volume appliqué, navigateur sans Web Audio, constructeur qui échoue ;
- page, sur le faux DOM : bandeau, ton, titre, phrase, ligne « son bloqué », pas de focus pris, rien d'inerte, alarme gardée jusqu'au toucher, pause levée à la reprise, fin gardée puis levée au nouvel usinage, pause de l'opérateur retenue après un toucher, mots du laser, page réelle et simulation séparées, réglage gardé et relu, valeurs illisibles, sortie de page ;
- textes et styles : chaque phrase a sa ligne EN et ES, aucun mot technique, `z-index` sous verrou, volets, pavé et dialogues, départ sous le bandeau d'état, pas d'animation, pas de `:has()` / `color-mix` / `dvh`, couleurs par jetons, cibles de 64 px, pas de minuterie ni de requête ni d'appel de commande dans le script, syntaxe ES2017, script et feuille chargés une fois dans les deux pages.

Les résultats exacts des suites (verify-project, Jest, harnais) sont dans le compte rendu de l'auteur à l'orchestrateur ; voir aussi « Vérifications » ci-dessous.

## Vérifications

Relevées le 26 novembre 2026 dans l'arbre `cncjs-wt/N3`, sur le PC de développement, avant le commit :

- `node examples/cncjs-touch/verify-project.cjs` : **232/232 contrôles réussis** (dont `test-notify.cjs`), sortie 0.
- `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false` : **57 suites, 1778 tests réussis**, sortie 0.
- ESLint sur `touch/notify.js`, `test-notify.cjs`, `browser-run.cjs`, `verify-project.cjs` : aucun message.
- `node examples/cncjs-touch/browser-run.cjs --strict --only measure,sim,settings,strip,e2e` (Edge 158 sans écran) : **2 défauts, tous deux déjà dans `HARNAIS-CONNU.md`** (mot coupé « Reprendre à une ligne… » / « Reanudar desde una línea… », simulation 1366 × 768, Suivi en alarme) ; aucun autre. Le harnais vérifie le bandeau dans l'étape `sim` : absent pour l'alarme trouvée au chargement (ALARM:1 au repos), présent pour l'alarme survenue pendant que la page regarde (« Alarme 3 déduite », 8 variantes : 1366 × 768 et 1024 × 600, FR et ES, texte normal et agrandi), sous le bandeau d'état, dans la fenêtre, sans couvrir `t-pause`, `t-stop`, `t-recover`, `t-resume`, `t-pilot` ni `home-job-stop`, sans prendre le focus, titre non coupé, fermé d'un toucher. L'étape `strip` (Pause et Arrêter sous 72 superpositions) passe sans changement.
- Étapes du harnais **non lancées** : `responsive`, `startup`, `v2`, `screens`, `rail`, `small`, `parcours` (laissées à la réunion). La fenêtre 1366 × 911 n'est donc pas mesurée par le harnais pour ce lot ; le bandeau y a la même géométrie qu'à 1366 × 768 (position fixe sous le bandeau d'état).

## Limites et ce qui n'est pas vérifié

- **Le son réel n'a pas été entendu** : ni sur la Surface Pro, ni sur la RT, ni sur le PC (seul un faux `AudioContext` est testé). Niveau sonore à trois mètres, broche et aspirateur en marche : à relever à l'essai (N3-A1).
- **Après un rechargement de la page sans toucher** (rechargement automatique après une installation, redémarrage du kiosque), le son reste bloqué par Chromium jusqu'au premier toucher : le bandeau vient seul et le dit. Remède possible, à décider par l'opérateur car il change le lancement du kiosque : l'option Chromium `--autoplay-policy=no-user-gesture-required`. Même avec elle, cette version ne crée le contexte audio qu'au premier geste.
- Le rechargement automatique (F10) peut emporter un bandeau « terminé » resté affiché : la page rechargée ne rejoue rien d'ancien.
- Écran verrouillé (verrou au départ d'un usinage) : le bandeau s'affiche sous le bouclier, il se ferme après le déverrouillage.
- Une pause dont la cause est un `M0` et que le serveur ne publierait que comme pause « d'opérateur » serait retenue si l'écran vient d'être touché ; non observé, le serveur publie `programPause` dans le même instantané d'après sa lecture.
- **Relecture du 26 novembre, deux corrections.** (1) La fin n'était jamais annoncée sur la page de simulation : le dernier rapport du travail y dit 98,8 / 100 et c'est le rapport de repos qui dit 100 / 100. Le rapport de repos est maintenant lu quand son total est celui du travail ; l'annonce vient 2 s après le repos (attente du verdict du serveur, que le simulateur ne publie pas). Le harnais laisse un usinage simulé aller au bout (`sim`, environ une minute) et contrôle le bandeau de fin. (2) À la reprise, CNCjs repart un rapport d'état avant que la machine quitte sa pause : ce passage n'est plus pris pour une nouvelle pause (ni bandeau, ni son, ni changement de phrase).
- Conséquence de (2), non couverte : une pause de la machine seule (bouton de pause de la carte, porte) qui **dure** juste après une reprise n'est pas annoncée par le bandeau ; le bandeau d'état du haut la montre. Une pause de la machine pendant le travail, hors reprise, est annoncée comme avant.
- La fin d'un usinage lancé depuis le PC n'est annoncée que si la page a vu la machine au repos avec toutes les lignes reçues : elle peut manquer (voir « Constats mineurs », 1). Non essayé sur un vrai CNCjs piloté depuis le PC : la demi-seconde d'attente est lue dans `GrblController.js`, pas mesurée.
- Lisibilité à trois mètres : calculée (72 px ≈ 14 mm), vue sur les captures du harnais à 1366 × 768 et 1024 × 600 (alarme seulement ; les bandeaux de fin et de pause ne sont vérifiés que sur le faux DOM), pas à 1366 × 911, pas mesurée devant la tablette.
- Chromium 106 réel (RT) : non essayé ; le code n'emploie que des API présentes depuis Chromium 66 (`AudioContext`, `-webkit-line-clamp`, `calc`, variables CSS).

## Constats mineurs de la relecture, traités le 26 novembre

1. **Faux « Usinage terminé » après un arrêt depuis le PC** (fichier chargé depuis le PC, toutes les lignes déjà reçues par la carte) : le serveur ne dit ni « terminé » ni « arrêté » pour un tel fichier. La règle « toutes les lignes reçues » ne suffit plus : il faut que la page ait vu la machine au repos, toutes lignes reçues, pendant que CNCjs comptait encore le travail (CNCjs attend une demi-seconde dans cet état avant de rendre la main ; un arrêt pendant que la machine bouge ne le montre jamais). **Contrepartie** : la page interroge le serveur une fois par seconde ; la vraie fin d'un fichier lancé depuis le PC peut donc ne pas être annoncée (fenêtre de 0,5 à 0,75 s). Un usinage lancé depuis la tablette n'est pas concerné (verdict du serveur). Le résumé de fin de `job-follow.js` garde l'ancienne règle : non modifié, hors du lot.
2. **Sans Web Audio** : le bandeau dit « Son indisponible dans ce navigateur. », plus « touchez l'écran une fois » ; de même après un échec de création du contexte audio (la carte des réglages le dit alors aussi). « 1 ligne refusée » au singulier (une ligne FR / EN / ES ajoutée).
3. **Tests manquants** : arrêt après la dernière ligne (`jobStopped`), cause d'une pause déjà affichée mise à jour sans second son, pas de pause annoncée pendant une alarme, nouvel usinage pendant l'attente du verdict. La ligne `next.pending = null` au départ d'un travail était sans effet (l'attente est toujours remplacée au retour au repos) : retirée plutôt que testée. 14 mutations du code ajouté ou cité par le relecteur, sur une copie hors de l'arbre : toutes font échouer `test-notify.cjs`.
4. **Veille** : choix n° 6 ci-dessus, vérifié par test.
5. **Mesureur du harnais** : `MEASURE` ferme toujours le bandeau, sauf pour une mesure, ajoutée dans `simFinish` (Suivi, 1366 × 768, bandeau de fin affiché) ; les autres mesures sont inchangées. Elle refuse un débordement horizontal, un bandeau fermé par la mesure, et toute commande du bandeau d'état ou « Arrêter l'usinage » couverte ; elle liste ce que le bandeau couvre jusqu'au toucher : « Agrandir le tracé », 2D, Iso, Face, Côté, Dessus (6 cibles sur 37).

Suites après ces corrections : `verify-project.cjs` **232/232** ; Jest **57 suites, 1778 tests** ; ESLint sans message sur `notify.js`, `test-notify.cjs`, `browser-run.cjs`, `i18n-messages.js` ; `browser-run.cjs --strict --only sim` : **2 défauts, les deux de `HARNAIS-CONNU.md`** (mot coupé « Reprendre… » / « Reanudar… »), aucun autre. Non relancé : les autres étapes du harnais.

## Essai réel proposé

`design/refonte/PROTOCOLE-ESSAI.md`, section « N3 » : réglage et sons sans machine (A1 à A3), simulation sur le PC (B1 à B3), puis machine réelle fraise en l'air avec un fichier contenant `M0` puis `M6` (C1 à C6), enfin la RT (D1). Aucune alarme n'est à provoquer.
