1. La séance suit maintenant cinq étapes : Machine, Fichier, Zéro pièce, Contrôle, Usinage.
2. Le bouton de suite et la raison d’un refus sont regroupés au bas de chaque étape.
3. Machine rassemble la connexion, la prise d’origine et les réglages à relire.
4. Après un incident, cet écran distingue la position perdue et le zéro pièce à vérifier.
5. Le fichier choisi montre son emprise, sa profondeur et son contrôle avant chargement.
6. Un dépassement prouvé bloque le départ normal et indique ce qu’il faut corriger.
7. Après la prise d’origine, le serveur vérifie le zéro enregistré avant les opérations qui en dépendent.
8. Flèches, zéros manuels, bloc et plaque sont réunis dans Zéro pièce.
9. Le premier réglage du bloc demande quatre mesures, avec un dessin et un test de contact.
10. Le diagnostic aide à chercher un contact permanent, notamment du côté de la broche.
11. Usinage rassemble l’avancement, les corrections et les accès à la reprise ou à la plaque.
12. Les cases de confirmation restent ; Pause et Arrêter gardent leurs commandes directes.
13. Les tests logiciels passent, mais le dernier contrôle visuel compte encore 838 violations.
14. Les nombres de touchers annoncés sont calculés ; les parcours complets restent à rejouer.
15. Aucune vraie machine ni tablette n’a été essayée : suivre le protocole d’essai après les vérifications restantes.

# Rapport de la refonte CNCjs Touch

Établi le **16 novembre 2026**, par OpenAI Codex **gpt-6.1-sol**, sur `feat/refonte-ui`. Les sections 1–10 décrivent le lot RAPPORT à **`3c3d0ecc`** (documents seulement). La section **5.1 Harnais** est la reprise HARN depuis **`4b04b8e0`** : code de page et de harnais modifié, aucun ordre ni garde machine changé. Ses résultats restent distincts du relevé historique.

**État de livraison : corrections et nouvelle organisation présentes, suites locales vertes, réception visuelle et matérielle non acquise.** Le dernier harnais fourni reste rouge. [PROTOCOLE-ESSAI.md](PROTOCOLE-ESSAI.md) sépare les vérifications d’installation des essais progressifs restant à mener.

## 1. Sources et portée des preuves

Références : [mission](../PROMPT-REFONTE-UI.md), [plan des corrections](PLAN-CORRECTIONS.md), [constats](CONSTATS.md), [ergonomie avant](ERGONOMIE.md), [spec](SPEC-REFONTE.md), [maquettes](maquettes/LISEZMOI.md), [écarts](audit/ECARTS-PLAN.md), [mesures avant](audit/MESURES.md), [sûreté](SURETE.md) et [idées non réalisées](IDEES.md). Les maquettes décrivent une intention ; elles ne sont pas des captures du logiciel livré.

Les chemins ci-dessous désignent des **preuves locales temporaires, hors dépôt**, présentes lors de la rédaction. Ils ne seront pas disponibles dans un simple clone. Aucun PNG n’est copié ou ajouté par ce lot.

```text
R = C:/Users/damou/AppData/Local/Temp/claude/69ebf499963b5699/46f050f4-71a8-4363-a194-280000d1f5f5/scratchpad/refonte
B = R/avant
A1 = R/codex/apres
A = R/codex/apres2
M0 = R/mesures/avant
M1 = C:/Users/damou/AppData/Local/Temp/cncjs-touch-rapport-20261116/mesures-apres-partiel
```

- **Avant** : `B/summary.json`, daté `2026-11-15T02:43:33.469Z`, commit `c35c9587`, page équivalente à `3049a0e4`, cache `v2u`. Edge `157.0.4341.46`, Node `26.13.0`.
- **Après FINAL** : `A1/summary.json`, daté `2026-11-16T00:34:26.415Z`, commit `2534db1b` ; journal `R/codex/harnais.log`.
- **Après HFIX**, référence de ce rapport : `A/summary.json`, daté `2026-11-16T01:38:21.037Z`, commit `3c3d0ecc` ; journal `R/codex/harnais2.log`. Les deux après utilisent Edge `157.0.4341.60`, Node `26.13.0`.
- Comptes rendus lus : `R/corrections/S1.md`, `S2.md`, `S3.md`, puis les rapports de lots sous `R/codex/` : S4–S6, SURETE et ses revues, P1–P3, L1–L6, REVUE, FINAL et HFIX. Les titres de commits proposés dans ces rapports ne sont pas des commits supplémentaires : l’historique réel fait foi.
- **Rejoué dans ce lot** : les deux suites générales, la tentative complète de mesures, puis les mesures `stream,dead,cache`. Les résultats historiques des lots ne sont pas présentés comme des mesures navigateur refaites ici.

## 2. Avant et après, par écran

Les chemins du tableau sont relatifs à **B** et **A**. Les paires `v2-911-fr-sombre-cnc` ont le même format CSS 1366 × 911, la même langue, le même thème et la même catégorie de machine ; les fichiers JSON voisins renseignent le rendu et l’état. Par exemple, les deux `screens-jog-v2-911-fr-sombre-cnc-repos/jog.json` indiquent effectivement `perfV2:true`, `fresh:true`, `Idle`. Le nom d’un dossier ne suffit pas à certifier ces conditions.

Les instantanés ne sont pas figés au même instant : valeurs, progression, origine connue et permissions peuvent différer. Les paires servent à comparer l’organisation, pas à mesurer une précision de position ou un temps de réaction. Les vues de base `1366x768/` sont particulièrement impropres à une comparaison d’état : Machine y est hors ligne avant et en alarme après.

| Écran livré | Avant : organisation | Après : organisation et propriétaires | Captures repérables |
|---|---|---|---|
| **Machine** | Commandes `$X/$H`, coordonnées et liens dispersés ; connexion sur Menu ; absence d’une suite de remise en route. | Liste connexion → main → réglages → origine → zéro vérifié ; encart d’incident ; Détails à la demande. `seance.js`, `commissioning.js`, `connect-cnc.js`. | B et A : `screens-machine-v2-911-fr-sombre-cnc-repos/machine.png` ; comparer aussi les dossiers homologues `…-alarme`. |
| **Fichier** | Choisir puis charger et ouvrir Suivi ; verdict de course tardif. | Aperçu, dimensions, profondeur et verdict serveur dès la sélection ; Charger conserve l’écran. Réponse liée au fichier et au contrôleur, invalidée si la preuve du zéro change. `shared-library.js`, `check-screen.js`. | B et A : `screens-files-v2-911-fr-sombre-cnc-repos/files.png`. |
| **Zéro pièce** | Préparer montre une comparaison en v2 ; flèches derrière un bouton ; sonde sur plusieurs écrans ; plaque sur Suivi. | Croix permanente, zéros ici, Autres zéros, bloc et plaque sur le même écran ; placement détaillé déplacé vers Contrôle. `real-motion.js`, `zero-piece.js`. | B et A : `screens-jog-v2-911-fr-sombre-cnc-repos/jog.png`. |
| **Ma sonde** | Profil à trois onglets, mesures et décalages signés, neuf saisies dans le parcours initial. | Coin dessiné, quatre mesures physiques, paramètres de recherche déjà renseignés, test de contact guidé. Aucune cote de bloc supposée. `zero-piece.js`, `probe-model.js`, `probe-diagram.js`. | B : `screens-probe-profile-v2-911-fr-sombre-cnc-repos/probe-profile.png` ; A : `screens-jog-v2-911-fr-sombre-cnc-ks-probe-setup/jog.png`. Même préréglage visuel, formulaire différent. |
| **Tester la sonde / Plaque** | Diagnostic de lecture sans recherche guidée ; plaque séparée. | Diagnostic contact permanent/absent, étapes bloc/broche/pince ; plaque au même endroit, et raccourcis en fin d’usinage ou pause de changement d’outil. `zero-piece.js`. | Diagnostic : B `screens-probe-contact-v2-911-fr-sombre-cnc-repos/probe-contact.png`, A `screens-jog-v2-911-fr-sombre-cnc-ks-probe-test/jog.png`. Pas de capture dédiée du volet Plaque identifiée après ; accès et gardes vérifiés par le code et les tests, rendu à rejouer. |
| **Contrôle** | Pas d’écran autonome ; comparaison dans Préparer et avertissement dans la confirmation de départ. | Dessins dessus/côté, verdicts des trois axes, dépassement et remède, rapides, cadrage laser ; dérogation dans Détails. `check-screen.js`, `program-check-view.js`. | Aucun ancien écran équivalent. B : `screens-jog-v2-911-fr-sombre-cnc-repos/jog.png` ; A : `screens-check-v2-911-fr-sombre-cnc-depassement-prouve/check.png` et `…-repos/check.png`. États différents, pas une paire d’acceptation. |
| **Usinage** | Suivi concentre préparation, commandes, corrections partiellement en volet et messages dans une petite zone. | Trois rangées de corrections, encart `home-notice`, bilan, reprise en volet, plaque par son propriétaire commun ; départ sur Contrôle. `job-dashboard.js`, `job-resume.js`, `seance.js`. | B et A : `screens-home-v2-911-fr-sombre-cnc-travail/home.png`, plus variantes `…-pause` et `…-alarme`. Les compteurs évoluent entre les prises. |
| **Plus** | Menu, rail à huit accès avec Retour ; ordre différent de celui du travail. | Cinq étapes et Plus ; Journal, Réglages, Mise en service, Guide, Macros sous Plus. Ouverture sur l’étape à faire. `touch-shell.js`. | B : `1366x768/menu.png` ; A : `1366x768/more.png`. Même fenêtre, état initial différent. Plus n’avait pas d’équivalent direct. |
| **Journal** | Accès dans le rail ; événements et textes techniques. | Sous Plus ; libellés harmonisés, détails numériques du bloc reçus de l’historique ; export conservé. `real-history.js`, `session-journal.js`. | B et A : `screens-history-v2-911-fr-sombre-cnc-repos/history.png`. Les trois débordements espagnols restants sont détaillés au § 5. |
| **Réglages** | Trois onglets déjà refaits avant ce chantier ; version installée confondue avec la version chargée. | Organisation conservée ; distinction des versions, rechargement gardé, veille distante expliquée, travail caché réduit. | B et A : `settings-1366x768-sim-fr-standard-dark-laser/display-0.png` et `system-0.png`. Les variantes `v2-settings-*` d’avant ne prouvent pas une réussite v2 après. |
| **Mise en service** | Assistant ouvert automatiquement sur un navigateur neuf. | Accès explicite sous Plus ; refus sur place ; neuf étapes conservées et textes harmonisés. `commissioning.js`. | Pas de paire de captures dédiée identifiée dans B/A. Preuves : code et `test-commissioning.cjs` ; validation visuelle à faire. |
| **Guide** | Quatre pages. | Sept pages qui suivent l’ordre de séance ; détails techniques séparés. `interface-guide.js`. | B et A : `screens-guide-sim-768-fr-sombre/guide.png` et pages suffixées ; A va jusqu’à `…-7/guide.png`. Même simulation, langue, thème et fenêtre. |

**Anciens écrans retirés de la page réelle** : Limites rejoint Détails de la machine et Contrôle ; les six sections Sonde (palpage, profil, contact, préparation, résultats, transfert) rejoignent la carte et ses volets, avec résultats et sauvegarde. Les fonctions de simulation restent distinctes ; `probe-ui.js` et `probe-preparation.js` ne sont plus atteints par `index.html`. La table exhaustive des anciennes commandes et des gardes est dans [SURETE.md](SURETE.md), pas déduite des images.

L’inventaire comprend 1 164 PNG avant, 1 317 dans chacun des deux dossiers après. Leur nombre n’est pas un nombre de tests réussis. Inspection visuelle effectuée ici : paires Machine de base, Zéro pièce au repos et Usinage en travail, ainsi que Contrôle hors course. Elle montre le regroupement, mais aussi des zones défilantes et des coupures ; aucune réception de toute la matrice n’est revendiquée.

## 3. Touchers : calculs avant et après

**Aucun des dix parcours n’a un nouveau total mesuré de bout en bout au navigateur.** `ERGONOMIE.md` § 7 dit expressément que ses nombres avant proviennent de la lecture des gestionnaires et des captures. Les nombres après ci-dessous sont calculés à partir de `SPEC-REFONTE.md` § 7 et du code livré, recoupés avec les attentes de `browser-run.cjs::parcoursMeasure` et `probeParcoursMeasure`. Les deux `summary.json` après n’ont ni résultat `parcours` ni `parcoursProbe` : les autres scénarios E2E ne remplacent pas cette preuve.

Convention identique : un appui sur une cible = un toucher. Chiffres au pavé, appuis de déplacement dépendant de la distance et manipulations physiques sont comptés à part. Les confirmations de mouvement gardent bouton + case + validation. Les zéros manuels gardent leur confirmation propre. Délais, attentes serveur et temps physique ne sont pas des touchers.

| Parcours | Avant, calculé dans ERGONOMIE | Après, calculé sur spec et code | Hypothèses et preuve à rejouer |
|---|---|---|---|
| **P1 Mise en route** | 6 ; 10 après redémarrage de CNCjs. | **5** : connecter, ouvrir, prise d’origine, case, lancer. | Un port proposé, lecture automatique réussie ; +1 si choix du port, +1 si Relire nécessaire. Attente P1=5 du banc LUNYEE. |
| **P2 Fichier** | 3 ; 4 pour consulter le verdict après chargement. | **3** : Fichier, ligne, Charger. | Verdict reçu avant Charger, zéro courant vérifié ; fichier sur la page visible, recherche/pagination exclues des deux comptes nominaux. Attente P2=3. |
| **P3 Premier bloc** | **35 + détour ≥3**, neuf saisies. | **14**, quatre saisies : rail + bloc + coin + huit appuis champ/Valider + enregistrer/palper + case + lancer. | Test physique contact puis libre fait avant Enregistrer ; sinon +1 pour redemander le palpage. Positionnement et gestes physiques exclus. Attente P3=14 sur tickets et résultats synthétiques, pas sur le cycle physique. |
| **P4 Bloc suivant** | 6, ou 5 si XYZ est resté choisi ; détour de positionnement. | **4** depuis un autre écran ; **3** depuis Zéro pièce. | Profil enregistré, XYZ, test récent ou refait physiquement. Un axe seul : +1 de sélection. Attente P4=4. |
| **P5 Plaque** | 3 depuis Suivi ; 4 ailleurs ; premier réglage : +2 et une saisie. | **3** depuis Zéro pièce ou les raccourcis fin/changement d’outil d’Usinage ; **4** depuis Machine/Fichier/Contrôle. | Épaisseur déjà enregistrée et permissions serveur présentes. **Premier réglage : +3 et une saisie**, soit 6 depuis Zéro pièce : régression d’un toucher par rapport aux 5 avant, assumée par le volet explicite de la spec. Attentes P5=3 sur les accès préparés ; ce cas initial n’y est pas mesuré. |
| **P6 Zéros manuels** | Un axe : 4 + déplacements en v2, 3 en v1 ; XYZ : 3 ; zéro à l’origine machine absent. | Un axe **3**, XYZ **3**, un axe à l’origine machine **4**. | Rail inclus, déplacement exclu. Zéro machine : Autres zéros puis axe puis confirmation, sans mouvement. Attente P6=[3,3,4]. |
| **P7 Départ/correction/pause/reprise/arrêt** | **9** avec correction d’avance ; broche/rapides en v2 : deux de plus. | **9** : départ 3, correction 1, pause 1, reprise 3, arrêt 1. | Départ depuis Contrôle, comme l’ancien départ depuis Suivi ; rail d’arrivée exclu des deux. Les trois corrections sont sur place. La première partie seule vaut 3, pas le total complet. Attente finale P7=9. |
| **P8 Après alarme en travail** | **12** dans le scénario nominal. | **10** : arrêter, remise en route, homing 3, ouvrir reprise, charger, départ 3. | Zéro récupéré et prouvé après homing ; sinon +1 Vérifier ou parcours de zéro à refaire. La spec prend ALARM:2 ; le banc utilise une fin de course/ALARM:1 du profil LUNYEE, puis le redémarrage. Attente P8=10 ; aucune reprise matérielle prouvée. |
| **P9 Prendre la main** | **3** avec autre pilote. | **2** : La main, motif « je suis devant la machine ». | Un motif proposé ; choix Autre + saisie non compris. Attente P9=2. |
| **P10 Diagnostic de sonde** | **3** pour arriver à une lecture sans suite guidée. | **2** pour rail + Pourquoi, puis **0 à 3** pour écarter les hypothèses. | Pas un total unique. Le banc commence déjà sur Zéro pièce et compte ouverture + étape suivante =2 pour le cas broche ; depuis un autre écran, ce cas coûte 3. Manipulations broche/pince hors écran. |

Les cibles fréquentes P4≤4, P5≤3 aux accès prévus et P9=2 sont **tenues par le calcul nominal**. L’affirmation générale « aucun parcours ne coûte plus » serait trop forte : premier réglage de plaque +1, diagnostic dépendant du défaut, refus et réessais supplémentaires possibles. Les impasses sont traitées dans le code par des remèdes, mais « zéro impasse sans aide » reste un critère d’essai, pas un résultat observé.

## 4. Défauts traités et limites de sûreté

Lecture consolidée des 70 lignes de [CONSTATS.md](CONSTATS.md) : **63 ont une suite logicielle livrée ; 7 restent explicitement non corrigées ou hors périmètre**. « Traitée » signifie qu’un changement et des preuves sont présents ; cela ne clôt pas les réserves firmware ni la réception tactile. Les constats peuvent partager une correction.

| Thème et identifiants traités | Résultat logiciel | Preuves durables principales |
|---|---|---|
| Départ, référence, courses, reprise : **C-01, 04, 05, 06, 18, 57, 58, 59, 61** | Refus normal du dépassement prouvé ; référence exigée selon la machine ; marge provisoire de 0,5 mm côté opposé au homing ; analyse rendue inconnue si non fiable ; reprise concernée gardée par G94. | `start-travel.test.js`, `reference-guard.test.js`, `program-check.test.js`, `motion.test.js`, `job-service.test.js`, `test-start-override.cjs`, `test-derogation.cjs`. |
| Décalage de travail : **C-02, 03** | Comparaison du décalage rapporté avec les paramètres mémorisés ; recharge sans mouvement si nécessaire, preuve postérieure ; refus des actions dépendantes tant que non prouvé. | `work-offset.test.js`, `block-probe.test.js`, `test-work-offset.cjs` ; complément de revérification du ticket de plaque dans FINAL. |
| Arrêts, séquences et plaque : **C-07, 08, 09, 12, 13, 17, 19, 26, 39, 54, 55, 60** | Plaque contrôlée et surveillée ; arrêts atteignant les séquences ; départ asynchrone annulable ; exclusion maintenance ; tests S27/S38 renforcés. | `plate-probe.test.js`, `index.test.js`, `halt.test.js`, `job-service.test.js`, `system-command.test.js`. |
| Kiosque, lecture, bail et démarrage : **C-10, 11, 14, 15, 20, 21, 33, 35, 49, 62, 64, 68** | Extinction automatique réservée à la boucle locale ; réveil et rechargement ; versions distinguées ; relecture automatique ; commandes PC gardées par le bail ; porte v2 réévaluée après le premier repos. | `api.touch.test.js`, `backlight.test.js`, `settings-read.test.js`, `control*.test.js`, `test-backlight.cjs`, `test-screen-saver.cjs`, `test-v2-gate.cjs`, `test-startup.cjs`. |
| Sonde et origine : **C-22, 27, 28, 29, 40, 41, 42, 43, 44** | Enveloppe XYZ suivant le trajet ; bloc/plaque réunis, refus et bilans traduits, diagnostic guidé, anciens écrans réels retirés, champ facultatif vidable. | `block-probe.test.js`, `test-zero-piece.cjs`, `test-probe-assistant.cjs`, `test-probe-diagnostic.cjs`, `test-numeric-pad.cjs`. |
| Refus, reprise, textes, informations : **C-16, 23, 24, 30, 31, 32, 37, 38, 45, 46, 47, 48, 63, 65, 67** | Cause affichée sur place, bon fichier arrêté pour la reprise, dernière alarme conservée, pas refusé correctement annoncé, S au-dessus du maximum signalé, commandes indisponibles expliquées, mise en service explicite. | `job-service.test.js`, `motion.test.js`, `test-refus*.cjs`, `test-reprise-volet.cjs`, `test-usinage-ecran.cjs`, `test-commissioning.cjs`, `test-server-messages.cjs`. |
| Simulation et progression : **C-25, 34, 52, 53** | Profil LUNYEE commun ; plafond de progression tant que l’usinage n’est pas fini, estimation liée à la bonne version et à l’exécution courante. | `lunyee-profile.test.js`, `sim-bridge.test.js`, `test-dashboard.cjs`, `test-preview-identity.cjs`. |

**Compléments SURETE/FINAL** : gardes de restauration D2, dérogation refusée pour un programme pouvant modifier les protections, plaque revérifiant D2 à l’exécution du ticket, cadrage laser annulable pendant sa relecture, exemption page seulement si `$22=0` est explicitement reçu, priorité au vrai refus de départ, Recommencer lié à sa demande, libellés de confirmation localisés et chargement 3D avec réessai. Les sept points bloquants/à corriger de `R/codex/REVUE.md` ont leur correctif et leur régression dans `2534db1b`. Cela n’est pas une nouvelle revue matérielle indépendante.

**À ne pas promettre** : le contrôle ne simule pas les collisions avec les brides ; `unknown` reste un avertissement pour le départ ordinaire prévu par D1. La dérogation exige un geste distinct, les protections autorisées et tous les autres gardes ; elle ne contourne ni la référence ni D2. La marge de 0,5 mm n’est pas la règle exacte démontrée du firmware. D2 prouve le décalage de coordonnées, pas que la pièce ou le bloc n’ont pas bougé.

## 5. Harnais fourni : amélioration, mais résultat rouge

Aucun harnais complet n’a été lancé par ce lot. Résultats extraits des journaux fournis et recoupés avec leurs `summary.json` :

| Exécution fournie | Commit | Violations strictes | Exceptions appliquées | Résultat |
|---|---|---:|---:|---|
| Avant, `B/summary.json` | `c35c9587` | **0** | **0** | Base visuelle de l’ancienne organisation. |
| `R/codex/harnais.log`, sortie A1 | `2534db1b` | **10 279** | **0** | `FAILED steps`, pas de validation globale. |
| `R/codex/harnais2.log`, sortie A | `3c3d0ecc` | **838** | **0** | `FAILED steps`, pas de validation globale. |

Entre les deux après, diminution calculée de **91,8 %**, mais la cible reste **zéro**, comme avant. Le changement du nombre d’écrans/états empêche de lire ce pourcentage comme une mesure générale de qualité. `layout-exceptions.json` n’a pas été assoupli pour obtenir ce chiffre.

Décomposition du dernier résultat : **778 centres couverts ou coupés**, **52 chevauchements de texte**, **3 défilements internes du Journal**, **5 débordements verticaux**. Les catégories texte trop petit, cible trop petite et débordement horizontal ne comptent plus de violation stricte dans ce relevé ; cela ne certifie pas tous les clics, intervalles et formats.

- Les trois cas Journal concernent l’espagnol agrandi, v1/768, en travail/alarme/serveur : six lignes occupent **376 px pour 372 px disponibles**.
- Les cinq débordements concernent Ma sonde (v1 CNC clair), Tester la sonde (trois variantes v2), et Préparer/rapport ancien (v2 FR clair agrandi).
- Les centres couverts touchent Machine, Fichier, Zéro pièce, Contrôle et Usinage, notamment en compact et sous les volets. Les 48 chevauchements de Zéro pièce et les quatre de Contrôle restent à trier avec les captures et les couches réellement actives. Ils ne sont pas tous déclarés faux positifs.
- Les scénarios cherchent encore des éléments retirés : Cotes, `job-load`, `home-job-start`, `home-job-summary` et anciens volets. La vue de placement exige désormais Contrôle et une CNC prête avec v2. `home-job-stop` existe toujours : l’échec de comparaison de sa place est un vrai défaut de page ; **cette parité n’est pas validée**.
- Des confirmations de simulation sont tentées avant la protection de **600 ms**, ou un champ de motif est saisi sans ouvrir Autre. La protection ne doit pas être retirée pour faire passer le banc.
- La fixture visuelle refuse le POST `/api/touch-job` utilisé pour contrôler la sélection ; des attentes de texte périmé visent l’ancienne phrase. Il faut adapter les scénarios à la nouvelle organisation et au contrat réel, sans supprimer le contrôle ni affaiblir les seuils.

Les trois scénarios E2E FR/EN/ES portent `ok:true` dans les deux après. Les tests Éco fermés n’y demandent pas de ressources v2. En revanche, `v2.passes` est vide et `v2.hits` vaut zéro dans les après ; **ces succès partiels ne prouvent ni toute la v2 ni les dix parcours**. Les résultats de `parcours` sont absents des deux synthèses.

### 5.1 Harnais — reprise HARN (gpt-6.1-sol)

Base **`4b04b8e0`**, `feat/refonte-ui`. Aucun `git add` ni commit tenté : `.git` en lecture seule, commit réservé au pilote. Aucun harnais complet lancé. Le relevé de **838 violations / 0 exception** reste le dernier résultat navigateur fourni ; ce nombre n’est pas remplacé par une estimation après correction.

| Famille → preuve fournie | Verdict | Correction / vérification ciblée |
|---|---|---|
| « Préparer not found », placement 3D | Harnais périmé : §4.4, §5.11 de la spec, placement dans Contrôle, sous la porte v2 | Vraie fixture CNC au repos avec porte GPU v2, ouverture de `ks-check-placement`, contrôle du montage dans ce volet et du retour hors poste large conservés. `responsive`. |
| « origin help », « preview details », « dimensions », « job preparation » absents | Harnais périmé : §5.8–5.11, §10.2 | Aide aux repères réservée à la simulation ; page réelle : Autres zéros et Détails machine. Aperçu et dimensions vérifiés dans Détails du fichier ; contrôle dans Détails du contrôle. Pointages Pause/Arrêter et cycle Tab conservés sur les remplaçants. `strip`. |
| Simulation : « load enabled », y compris veille | Harnais périmé : chargement sur Fichier | `step-files-main`, action `charger`, après stabilisation du libellé. Le travail doit toujours devenir chargé puis actif. `strip`, `e2e`. |
| Simulation : « running » | Harnais trop rapide pour la protection existante | Confirmation seulement après 600 ms, case initialement non cochée, bouton refusé avant consentement, actif après consentement, fermeture du dialogue puis `running` exigés. Aucune protection de page retirée. `sim`, `responsive`, `settings`, `strip`. |
| Réglages : « Démarrer enabled » | Harnais périmé : bouton attendu sur un écran encore caché | Aller sur Contrôle avant d’attendre/démarrer ; refus Wi-Fi/mises à jour/Tablette pendant le travail toujours vérifiés. `settings`. |
| Clavier au-dessus du dialogue Pilote, puis `over.z.join` | Harnais périmé : §5.3, champ sous Autre motif | Injecter l’autre propriétaire dans les faits du banc, attendre `pilot.state === other`, ouvrir `pilot-other`. Vérifications de peinture, pointages, Escape et retour actif conservées ; journal robuste si le clavier manque. Aucun transfert de bail envoyé. `strip`. |
| « end-of-job summary » / ancienne carte à acquitter | Harnais périmé : §4.5, `home-notice` remplace la carte | Exiger l’encart et ouvrir Détails pour le bilan complet. Conserver le numérateur calculé depuis le compteur gelé du banc, l’échelle du fichier original, le ton d’arrêt et les comparaisons de rectangles. L’état avec bilan n’est plus écarté du strict avant acquittement. `sim`, `screens`. |
| Bilan réellement écrasé après arrêt sur alarme | Page fausse : §4.5 et P8 | L’alarme d’un travail déjà arrêté n’écrase plus sa ligne d’arrêt ni la perte de position ; action de remise en route conservée. Détails du bilan devient visible quand `job-follow` fournit le bilan. Les permissions machine restent celles du serveur. `screens`, `sim`. |
| ALARM:3 déduite affichée comme reçue dans les nouveaux textes | Page fausse : garder l’attribution de la preuve | Marque déduite FR/EN/ES dans les en-têtes de séance, l’encart et l’incident ; aide détaillée reçoit aussi `alarmCodeInferred`. Le scan de provenance reste strict. `sim`. |
| « Machine command moved … home-job-stop » | Page fausse : même bouton requis aux mêmes coordonnées, §3.2/§4.5 | Ordre CSS explicite : aperçu, courbe, séquence, Arrêter. Les instruments occupent l’espace de l’aperçu ; le contrôle de parité à 1 px et les 15 commandes comparées sont conservés. `v2`. |
| Centres couverts sous volets / textes de fond superposés (partie des 778/52) | Harnais périmé : fond volontairement inerte, §5.1 | Mesurer la surface modale active et Pause/Arrêter. Les tailles, textes et conflits entre éléments de cette surface restent contrôlés. Les débordements sont ceux de cette surface, pas de l’écran derrière. Sans volet, aucune cible couverte ne sort de la mesure. `screens`, `strip`. |
| Centres coupés dans les listes ou corps compacts (partie des 778) | Harnais périmé quand le défilement permet réellement l’accès ; sinon défaut maintenu | Défilement réel de la cible, pointage au centre, puis restauration des positions. `scrolls:true` seul ne dispense plus d’erreur : exigence renforcée. Les cibles toujours couvertes/coupées restent rouges. `measure`, `responsive`, `screens`. |
| Boutons désactivés pointés à travers leur boîte (partie des 778) | Harnais périmé : `pointer-events:none` prévu | Mesurer la peinture avec `pointer-events:auto` temporaire sans activer le bouton, puis restaurer exactement style et priorité. Une couverture réelle reste un échec. `measure`, `screens`. |
| Boîte d’un écran garé interceptant un pointage, notamment Plus | Page fausse | Écrans `kept` inactifs : aucune surface de pointage ; leur disposition en cache reste. `responsive`. |
| Étiquettes « haut de la course » / « zéro Z » (4 chevauchements Contrôle) | Page fausse | Zéro Z écrit à gauche de la ligne, course à droite ; aucune valeur ni projection recalculée. `screens`. |
| Titre Fichier / Actualiser sur Recherche (intervalles signalés) | Page fausse | Rangée de titre au moins 56 px, à la hauteur du bouton, intervalle 12 px. `measure`, `responsive`. |
| Journal espagnol agrandi : 376 > 372 px (3 violations) | Page fausse | Cinq événements en agrandi, quatre en compact ; pagination et tous les événements restent. La page standard garde six événements. `screens`. |
| Première passe : texte du rail 14 px, cible Recherche 42,1 px, débordements horizontaux Usinage | Défauts de page déjà corrigés par HFIX/RAIL, absents des violations strictes du second journal | Conserver les contrats de `test-session-geometry`, `test-rail-fixed`, `test-jog-choices` et les seuils du harnais. Aucun seuil abaissé. `measure`, `responsive`, `screens`. |

**Portée des cinq débordements verticaux.** Quatre sont relevés avec Ma sonde / Tester la sonde ouvert : l’ancienne mesure lisait la hauteur de l’écran de fond, désormais remplacée par celle de la surface active. Celui de Zéro pièce / rapport ancien reste soumis à la géométrie du vrai écran et à la preuve d’accès par défilement. Un débordement non défilable reste un défaut : aucune exception ne l’absorbe.

**Tests durables.** `test-harn-page.cjs` (état après arrêt sur alarme, détails, provenance, ordre des instruments, titre Fichier, écran garé, dessin Z et pagination), `test-harn-surface.cjs` (volet/fond, arrêts conservés, bouton désactivé, vrai défilement, couverture après défilement), `test-harn-flows.cjs` (confirmation réelle à 600 ms, pas de consentement réutilisé, accès migrés). Les trois sont dans `verify-project.cjs`. Dix-huit retraits isolés en mémoire produisent chacun code 1 / AssertionError ; fichiers de production non remis en arrière, preuves ignorées sous `output/codex-HARN`. Aucun `bughunt-*` d’un autre lot touché ; aucun test de preuve propre à HARN préexistant à convertir.

**Assertions adaptées.** `test-layout-exceptions.cjs` : la cible Réglages autorisée sous le pli porte désormais `scroller:true`, preuve d’accès par défilement ; l’assertion existante est conservée et un nouveau témoin exige l’échec sans cette preuve. Dans le navigateur : les anciennes cibles de volets et de bilan sont remplacées comme dans la table ; le bilan complet garde toutes les assertions de ligne, ton, compteur indépendant et position. Aucune assertion de sûreté, seuil de taille/texte, regex `V2_NODE`, classe réservée ni `layout-exceptions.json` modifiée. Les intervalles signalés restent disponibles dans les mesures ; aucune exemption ajoutée.

**État des relances.** Huit commandes séparées `--strict --only measure`, `responsive`, `sim`, `settings`, `strip`, `v2`, `screens`, `e2e`, avec Edge et `--out examples/cncjs-touch/output/codex-HARN` : **code 1, WebSocket error avant scénario** dans chaque cas. L’essai E2E avec le paquet `ws` existant (`node --no-experimental-websocket`) échoue aussi : **ECONNRESET**. Aucun résultat géométrique nouveau, aucune capture de réception. Le nettoyage des nouveaux lancements ferme leur socket et leur propre arbre de processus en cas d’échec et arrête le serveur local ; l’inventaire CIM est refusé, donc l’absence de navigateur résiduel n’est pas certifiée.

**Passation.** Commit réservé au pilote, puis relance des deux suites et des huit étapes ciblées avant le complet par l’orchestrateur. Examiner notamment la surface des volets de sonde, les corps compacts, la position d’Arrêter v1/v2 et le Journal ES agrandi. Les contrôles hors navigateur ne prouvent ni mise en page réelle, ni Chromium 106, ni machine/tablettes. Aucun réseau externe, SSH, déploiement ou mouvement matériel.

**Dernières validations HARN sur les fichiers livrés, avant le commit du pilote :**

| Commande | Résultat exact |
|---|---|
| `node examples/cncjs-touch/verify-project.cjs` | **Code 0 — 215/215 contrôles réussis. Aucun essai matériel.** |
| `npx.cmd jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false --testPathIgnorePatterns="bughunt-[AV][0-9]"` | **Code 0 — 51/51 suites, 1 515/1 515 tests, 0 snapshot** (26,23 s). |
| ESLint des 14 fichiers JS/CJS modifiés ou ajoutés | **Code 0, aucune erreur ni avertissement.** |
| `git diff --check` | **Code 0.** |

Les fichiers `verify-final.log`, `jest-final.log`, `browser-attempts.json` et `proofs.json` restent dans `output/codex-HARN`, ignoré. Aucun hash de commit HARN : ni ajout à l’index ni commit tenté. Ces résultats ne sont donc pas annoncés « après commit HARN ».

## 6. Mesures avant et après

### 6.1 Relance et conditions

PC i7-13700KF, Node `26.13.0`, uniquement des fixtures sur `127.0.0.1`. Les commandes demandées par `audit/MESURES.md` ont été utilisées avec les mêmes paramètres :

```powershell
node examples/cncjs-touch/measure-refonte.cjs --out "$env:TEMP/cncjs-touch-rapport-20261116/mesures-apres" --repeat 5 --window 20 --census 10 --browser "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
node examples/cncjs-touch/measure-refonte.cjs --steps stream,dead,cache --out "$env:TEMP/cncjs-touch-rapport-20261116/mesures-apres-partiel" --repeat 5 --window 20 --census 10 --browser "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
```

Première commande : **code 1, `WebSocket error`**, avant toute mesure de page. Seconde : **code 0**, fichiers `M1/refonte-stream.json`, `refonte-dead.json`, `refonte-cache.json` et `refonte-stream-dead-cache.md`, daté `2026-11-16T02:26:07.236Z`.

Le script conserve sa méthode ; ses adaptations déjà livrées remplacent Menu par Plus pour les vues cachées et injectent une preuve D2 fixe dans le faux contrôleur de mesure du flux. La transaction réelle de D2 n’est donc **pas** incluse dans son coût serveur. Les durées PC chargées varient ; les compteurs et octets sont les comparaisons les plus utiles. Le flux fait **trois passes de 15 s par scénario**, indépendamment du `--repeat 5` affiché dans l’en-tête générique du rapport brut.

### 6.2 Démarrage et coût de page : données disponibles et manquantes

| Mesure du banc avec gzip de MESURES | Avant v1 Éco | Avant v2 Performance | Après avec la même méthode |
|---|---:|---:|---|
| Requêtes froides hors flux | 91 | 99 | **Non mesuré**, connexion DevTools échouée. |
| Transfert froid total, unités kB du banc (1 024 o) | 558 | 625 | **Non mesuré**. |
| Coquille prête froide, médiane (min–max), ms | 122 (116–137) | 122 (116–126) | **Non mesuré**. |
| Travail, Suivi visible, tâches ms/s | 9,0 (8,7–10,4) | 10,2 (9,7–12,0) | **Non mesuré**. |
| Travail, Suivi visible, mises en page/s | 4,7 (4,6–5,6) | 5,6 | **Non mesuré**. |
| Tâches >50 ms par fenêtre de travail | 0 | 0 | **Non mesuré**. |
| Rappels/animations/sondages sur vues cachées, recensement de 10 s | Voir MESURES § 2.3 | Voir MESURES § 2.3 | **Non mesuré au navigateur** ; preuves ciblées au § 6.4. |

Un recoupement **historique sans gzip**, fourni par `B/startup.json` et `A/startup.json`, existe sur cinq passes :

| Indicateur du harnais startup | Avant froid / chaud | Après HFIX froid / chaud |
|---|---:|---:|
| Ressources | 89 / 88 | 91 / 90 |
| Scripts / CSS | 72 / 15 | 74 / 15 |
| Octets transférés | 1 766 489 / 37 096 | 1 899 591 / 37 989 |
| Coquille prête, médiane, ms | 142,3 / 148,1 | 179,8 / 161,4 |
| Tas après GC, octets | 3 528 028 / 4 672 776 | 4 166 052 / 5 654 576 |
| Nœuds DevTools | 5 759 / 8 641 | 4 720 / 7 101 |

Ce recoupement montre une **hausse**, pas un gain, du transfert froid (+7,5 %) et du délai médian froid (+26,4 %) ; la baisse des nœuds ne suffit pas à conclure à une amélioration globale. Les deux synthèses portent cinq erreurs de page au démarrage, notamment la fixture refusant `/api/custom/health`. Les versions d’Edge diffèrent ; les durées restent indicatives et ne remplacent pas la relance gzip. Les nœuds DevTools comprennent textes et documents non encore ramassés, pas seulement les éléments visibles.

### 6.3 Flux serveur, code statique et cache, remesurés ici

Même module serveur et mêmes scénarios de rapports simulés que M0 ; valeurs médianes :

| Scénario | Paquets/s/client avant → après | Octets/paquet avant → après | Octets/s/client avant → après | Construction d’un paquet, µs avant → après (plage après) |
|---|---|---|---|---|
| Repos, un client | 0,9 → 0,9 | 5 177 → **5 357** | 4 830 → **4 999** | 70,0 → **215,1** (79,7–331,4) |
| Repos, deux clients | 0,9 → 0,9 | 5 177 → **5 357** | 4 829 → **4 999** | 69,9 → **84,3** (77,5–218,2) |
| Travail, un client | 3,9 → 3,9 | 5 694 → **5 987** | 22 000 → **23 126** | 73,9 → **128,3** (93,3–199,5) |
| Travail, deux clients | 3,8 → 3,9 | 5 696 → **5 987** | 21 643 → **23 141** | 70,5 → **95,9** (85,5–206,0) |

Paquet : +3,5 % au repos, +5,1 % en travail à un client. Estimation CPU du banc : 0,2 → 0,5 ms/s au repos à un client, 0,4 → 0,7 ms/s en travail. Les durées très dispersées, et les suites lancées parallèlement au début de la mesure, interdisent une attribution fine ; ce n’est pas un gain serveur. `process.cpuUsage` Windows reste quantifié et impropre à une conclusion fine. Le paquet de relecture navigateur reste à **1 888 octets**, bien plus petit que celui du vrai service : son coût JSON sous-estime toujours le réel.

Inventaire statique refait par la **même extraction des balises locales de `index.html`**, contenu lu à `c35c9587` par `git show`, puis dans l’arbre courant ; gzip de chaque fichier séparément avec Node. Sont exclus `/socket.io/socket.io.js`, les scripts du banc et les ressources différées dynamiquement. Ce sont des poids source, pas des requêtes mesurées :

| Inventaire local initial | Avant | Après | Évolution calculée |
|---|---:|---:|---:|
| Scripts locaux | 69 | **71** | +2 |
| JavaScript, octets source | 1 484 569 | **1 590 086** | **+7,1 %** |
| JavaScript, octets gzip | 484 059 | **514 911** | **+6,4 %** |
| Feuilles CSS | 15 | **15** | identique |
| CSS, octets source | 236 708 | **263 363** | **+11,3 %** |
| CSS, octets gzip | 57 000 | **63 246** | **+11,0 %** |

La refonte ajoute des composants et des textes ; les suppressions locales de règles ne donnent donc pas une baisse globale du poids initial.

Résultats bruts `dead/cache`, même analyse statique avant/après :

- Candidats CSS sans référence : **97 règles / 9 646 o → 96 / 8 408 o**. MESURES retient 96 règles avant après tri manuel : **97 est le compteur brut**, pas une correction silencieuse de sa conclusion. Les classes dynamiques et la simulation empêchent d’assimiler ces candidats à du code supprimable sans examen.
- Exports sans référence hors de leur fichier : **16 → 11**, dont **11 → 10** employés seulement par des tests. Les textes i18n repérés sans référence augmentent aussi ; le détecteur manque notamment des phrases composées ou référencées par code. Aucun total brut n’est présenté comme une quantité certaine de textes morts.
- Fichiers non atteints par la page réelle : **56 551 → 102 145 o**, notamment les anciens modules de sonde conservés pour la simulation. « Non atteint » ne signifie pas « supprimé du dépôt ».
- Cache : **23 valeurs pour 95 références → une valeur `v2v` pour 97 références**, plus `ADVANCED_VERSION` alignée. Le détecteur historique trouve 45 fichiers modifiés après la fixation de leur suffixe, contre zéro avant : c’est attendu avec la valeur commune, pas la preuve d’un cache périmé.
- La pile réelle locale `compression` + `serve-static` donne encore **200 → 304 → 200 après changement de contenu au même suffixe**, `public, max-age=0`, pour HTML et `touch-shell.js`. Cela ne prouve pas le comportement d’un kiosque installé, d’un proxy ou d’une ancienne page déjà en mémoire ; la cause exacte de T14 reste à essayer.

### 6.4 Travail inutile supprimé : preuves ciblées des lots

Ces compteurs proviennent des bancs/mutations des lots, avec les tests durables repassés par `verify-project` ici. Ils ne sont **pas** le nouveau recensement navigateur de dix secondes :

| Correction | Avant → après dans le banc du lot | Trace et test durable |
|---|---|---|
| C3 : pas de nouvelle image v2 une fois la disposition posée | Dix paquets de repos → **zéro demande d’image**, y compris suspension cachée ; le retour sûr à v1 reste testé. | L1, `test-v2-idle-frames.cjs`, `test-v2-gate.cjs`. Avant navigateur : 20 rappels/10 s au repos, 56–57 en travail. |
| Détails Machine fermés | **10 rendus + une minuterie → 0 + 0** sur dix états. | L2, `test-v2-machine-frames.cjs`. |
| Zéros, état identique | **10 demandes de rendu → 0** sur dix états identiques. | L3a, `test-real-motion.cjs`. |
| C4 : coordonnées Usinage cachées | **60 écritures → 0** sur dix rapports. | L5, `test-usinage-ecran.cjs`, `test-hidden-views.cjs`. |
| C1 : Wi-Fi caché | **340 écritures `disabled` → 0** sur dix paquets. | L6, `test-textes-regles.cjs`. |
| C2 : bouton de recherche des mises à jour caché | **11 écritures → 0** sur dix paquets et une réponse tardive. | L6, `test-textes-regles.cjs`. |
| Nettoyage L6 | **133 règles CSS, 28 anciens textes et trois exports retirés** ; CSS initial 270 867 → 259 129 o à l’échelle de ce lot. | Rapport L6 et diff `9f981288..e5d43389`. Le CSS supplémentaire HFIX explique la différence avec le total courant de 263 363 o. |

Le critère « travail inutile supprimé » est prouvé sur ces cas. Le critère « gain global de vitesse d’au moins 10 % » n’est pas démontré. Aucun gain de durée, d’autonomie ou de fluidité sur Surface/RT n’est annoncé.

## 7. Ce qui reste et pourquoi

| Constat ou point | État et raison | Suite |
|---|---|---|
| **C-36** homing partiel externe | La LUNYEE observée exécute les trois axes même avec `$HX` ; pas de durcissement sans connaître ses rapports réels. | Essais E-C/E-D ; ne pas généraliser aux autres cartes. |
| **C-50** mot de passe Wi-Fi dans les arguments | Correction `nmcli passwd-file` non essayée ; hors du changement retenu. | Chantier hôte à tester sans exposer de secret. |
| **C-51** installation du kiosque hors dépôt | URL et fichiers réellement utilisés inconnus ici. | Lire l’installation avant D3 ; pas de validation par les seuls tests API. |
| **C-56** Arrêter sur un ancien rapport Idle | Pas de feed hold préventif ajouté : pourrait placer la carte en Hold puis imposer un reset perdant la référence. | Vérification réelle selon le protocole. |
| **C-66** Actualiser encore construit | `shared-library.js` crée toujours `library-refresh`, caché en réel ; nettoyage non livré. | Ne pas le compter parmi les bugs corrigés. |
| **C-69** test broche sans surveillance | Garde supplémentaire non décidée/réalisée ; la refonte n’ajoute pas cette garantie. | I-09 dans IDEES. |
| **C-70** identité de pilote rejouable | Bail de prévention des maladresses, pas authentification matérielle d’un appareil. | Autre chantier de protocole/authentification. |
| **C9** catalogues FR différés | Retiré de L6 faute de validation des variantes navigateur EN/ES. | Garder les catalogues complets ; aucun gain de 23 % livré. |
| **C8/C10** paquet groupé et flux allégé | Installation/compatibilité et protocole à changer ; hors lot. | IDEES I-01/I-02, pas d’activation implicite. |
| **838 violations, scénarios anciens, parcours sans résultats** | HFIX améliore la page mais ne clôt pas la réception ; ce lot RAPPORT n’est pas un lot de correction fonctionnelle. | Migrer les scénarios, corriger les défauts réels restants, rejouer sans abaisser les gardes/seuils. |
| **Mesures navigateur après manquantes** | Connexion DevTools impossible dans ce bac à sable. | Relancer `measure-refonte.cjs` dans l’environnement du pilote. |

Limites conservées de D3 : kiosque servi par une adresse LAN non reconnu local ; une seconde page locale peut encore éteindre le panneau ; un relais masquant l’origine de la connexion serait pris pour local. Dans ces cas résiduels, le premier toucher peut encore viser une commande. La preuve d’interception universelle d’un toucher sur panneau noir n’est pas livrée.

Limites de D2 et du firmware : coupure du processus entre les deux sélections de repère, cadence effective de WCO, rapports Home, décalage réellement exécuté après homing, frontière des limites, effet d’un reset au repos et `G38.3` sans contact restent à qualifier. Les deux hypothèses du décalage après homing existent dans les simulateurs ; le simulateur ne tranche pas laquelle est vraie sur cette carte.

Les autres fonctions proposées, notamment reset depuis la tablette, pause avec remontée, reconnexion automatique, cadrage CNC, origine à neuf points, export dédié des points de palpage et retrait de la case, sont **non réalisées** et recensées dans IDEES. La fonction zéro d’un axe à l’origine machine, elle, appartient à D4 et est livrée sans mouvement.

## 8. Commits réellement présents et traçabilité

Extrait lu : `git log --oneline 521dc9d4..HEAD`. Ordre ci-dessous chronologique ; titres exacts, sans confondre les messages proposés des comptes rendus avec l’historique :

| Hash | Titre |
|---|---|
| `6358e7ae` | touch: LUNYEE profile for the Grbl simulator (field facts of the real board) |
| `02e76c19` | touch: LUNYEE options for the Jest fake Grbl, shared simulator bridge |
| `263e1303` | touch: D2 the work offset is proven against $# before a start, a probe or a framing |
| `89f834f3` | touch: the block probe checks its active offset against $# before its first move |
| `0bea1528` | touch: D2 tests for the framing guard, the stops and the block probe's G10 |
| `115e9a8f` | touch: the travel check uses the homing convention learnt and keeps 0.5 mm before the far limit |
| `cb1c82a4` | touch: refonte spec (session thread), proposals, jury, critiques and static mock-ups |
| `c57e3e2e` | touch: D1 a program proven outside the travel does not start (override by a second, logged confirmation) |
| `0c36dfb0` | touch: no start and no work zero on a machine without its reference |
| `3bd16ac9` | touch: the travel check gives up on lines Grbl reads differently |
| `060bfb6c` | touch: every stop ends a server sequence (socket stop, lease release, line in flight) |
| `7ec0c194` | touch: lots S4-S6 (stops end every server sequence, plate probe travel and watch, D3 kiosk backlight, D4 settings read and machine-origin zero, PC needs the lease, block probe envelope and coded refusals) |
| `2bc52077` | touch: refonte lot SURETE |
| `3251a423` | touch: refonte lot P1 |
| `fb7a82bb` | touch: refonte lot P2 |
| `18d77658` | touch: refonte lot P3 |
| `189ec9f9` | touch: refonte lot L1 |
| `be9135c3` | touch: refonte lot L2 |
| `57a65795` | touch: refonte lot L3a |
| `12d0f19b` | touch: refonte lot L3b |
| `1aace235` | touch: refonte lot L4 |
| `9f981288` | touch: refonte lot L5 |
| `e5d43389` | touch: refonte lot L6 |
| `2534db1b` | touch: refonte lot FINAL |
| `3c3d0ecc` | touch: refonte lot HFIX |

Les mentions « FINAL à commiter » qui subsistent dans CONSTATS/anciens écarts désignent désormais **`2534db1b`**. S4–S6 ont été regroupés par le pilote ; SURETE a aussi repris une partie de P1. Les titres thématiques séparés demandés au départ n’existent donc pas tous séparément.

**Lot RAPPORT : aucun commit ni `git add` tenté**, conformément à la consigne spécifique `.git` en lecture seule. Le pilote doit créer le commit documentaire, puis relancer les deux suites. Message proposé :

```text
touch: document refonte results, measurements and remaining validation

Written-by: OpenAI Codex (gpt-6.1-sol)
```

## 9. Tests, conversions et assertions

Ce lot documentaire n’ajoute, ne convertit et n’adapte **aucun test**, ne modifie **aucune assertion**. Aucun nouveau test de page à enregistrer. ESLint sans objet : aucun JS/CJS touché.

Le registre détaillé des conversions historiques reste dans CONSTATS (« Tests de preuve et leur devenir ») et dans chaque section de ECARTS-PLAN. Principales conversions livrées :

| Preuves initiales | Tests durables |
|---|---|
| Serveur A1-2/A2-3/A1-7 | `work-offset.test.js`, `block-probe.test.js`. |
| Serveur A1-1/3/4/5 et V1-1 | `start-travel.test.js`, `program-check.test.js`, `reference-guard.test.js`, `motion.test.js`. |
| Serveur A1-6, V1-2/V1-3 | `plate-probe.test.js`, `index.test.js` ; compléments arrêts SURETE. |
| Serveur A1-8/10, A3-1/2, V3-5 | `settings-read.test.js`, `api.touch.test.js`, `backlight.test.js`, `control.test.js`, `control-hook.test.js`. |
| Serveur A1-11 | `block-probe.test.js`. |
| Page A2-1/6/7 | `test-start-override.cjs`, `test-commissioning.cjs`, `test-server-messages.cjs`. |
| Page A3-1, V3-1/V3-2 | `test-backlight.cjs`, `test-screen-saver.cjs`, `test-v2-gate.cjs`, `test-v2-idle-frames.cjs`. |
| Page A2-10/9/8, V2-1, A2-5 | `test-dashboard-pause-guard.cjs`, `test-job-resume.cjs`, `test-commissioning.cjs`, `test-dashboard.cjs`, `test-control-attribution.cjs`, puis socle/écrans de séance. |
| Page A2-2/A2-4 | `test-zero-piece.cjs`, `test-probe-assistant.cjs`, `test-probe-diagnostic.cjs`. |

Parmi les nouveaux tests de page : socle/fil/refus/migration des commandes en L1 ; `test-remise-en-route` en L2 ; `test-zero-machine` en L3a ; les trois tests de sonde en L3b ; `test-files-verdict`, `test-check-drawing`, `test-check-screen`, `test-derogation` en L4 ; `test-usinage-ecran`, `test-reprise-volet` en L5 ; `test-textes-regles` en L6 ; `test-confirmation-labels`, `test-placement-loading` en FINAL ; `test-session-geometry` en HFIX. Ils figurent dans `verify-project.cjs`. Les noms `bughunt-*` des chantiers antérieurs, notamment page c/f et serveur a/b/e, sont conservés ; le filtre demandé ne les confond pas avec A/V.

**Assertions historiques réellement retirées ou adaptées à signaler au lecteur :**

- D2/D1 : préconditions des faux contrôleurs et tailles de catalogues adaptées ; ancienne preuve de contrôle positif remplacée par « inconnu avant preuve, contrôlé après preuve ». S27 appelle réellement ses opérations ; S38 distingue un rapport de deux.
- P2 : interception universelle du premier toucher noir écartée conformément au plan ; quatre attentes de bascule après Home changées ; aucun garde de veille supprimé silencieusement.
- L2/L3 : anciennes structures de boutons permanents, écrans de sonde, comparaison et catalogues remplacées par les propriétaires et composants nouveaux. Les inventaires nominatifs sont dans leurs sections d’écarts.
- L4 : `test-job-preparation` et `test-preparation-keys` retirés avec le volet supprimé (**61 et 14 sites d’assertion**). Anciennes attentes de préparation/verdict/cadrage adaptées : `test-program-check-view` 41→20, `test-preview-identity` 20→17, `test-travel-check` 31→25, `test-origin-preview` 122→117, `test-tablet-profile` 181→166. Ces nombres ne sont pas un score de sûreté ; les nouvelles preuves remplacent les structures retirées.
- L5/L6 : attentes de boutons cachés, de zones du tableau de bord, de volets, de libellés et de quatre pages de Guide remplacées par appels directs, encart, reprise et sept pages. Les gardes d’arrêt et permissions restent couverts.
- FINAL : `test-v2-preparer` passe de zéro enfant à deux éléments de chargement cachés ; `test-performance-v2-safety` accepte uniquement Réessayer caché après succès et garde zéro relais machine. HFIX n’a retiré ni affaibli d’assertion existante ; ses 24 échecs sur l’ancien CSS sont une preuve de règles source, pas une mesure de rectangles.

Les rapports de lots détaillent les substitutions/mutants qui ont échoué avant correction. Ces mutations n’ont pas été toutes refaites pendant RAPPORT. Leur présence et le passage des suites ne remplacent pas le harnais strict rouge.

## 10. Vérifications finales de ce lot et passation

Commandes à la racine, dépendances locales ; PowerShell refuse `npx.ps1`, donc invocation du même outil par **`npx.cmd`** :

```powershell
node examples/cncjs-touch/verify-project.cjs
npx.cmd jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false --testPathIgnorePatterns="bughunt-[AV][0-9]"
```

| Vérification | Dernier résultat sur les fichiers livrés de RAPPORT |
|---|---|
| `verify-project.cjs` | **Code 0 — 208/208 contrôles réussis. Aucun essai matériel.** |
| Jest, quatre chemins et exclusion ci-dessus | **Code 0 — 51/51 suites, 1 515/1 515 tests, 0 snapshot.** |
| `git diff --check` | **Code 0.** |
| ESLint | Sans objet : documents seulement. |

Ces relances sont postérieures au dernier commit existant **`3c3d0ecc`**, mais antérieures au futur commit RAPPORT que seul le pilote peut créer. Elles ne sont pas annoncées « après commit RAPPORT ». Des avertissements Node expérimentaux et des journaux d’erreur volontairement injectés par les tests Jest restent présents, sans échec de suite.

Pour la suite :

1. Conserver ce rapport comme état rouge de réception, commiter seulement les deux documents du lot, puis relancer les deux suites.
2. Migrer les anciens scénarios du harnais vers les propriétaires et accès livrés ; traiter les vrais recouvrements/volets et les trois cas Journal, sans nouvelles exceptions de confort.
3. Rejouer les étapes ciblées concernées, puis laisser l’orchestrateur lancer le harnais complet. Exécuter explicitement `--only parcours` et conserver ses deux blocs de résultats ; distinguer le banc serveur LUNYEE des tickets synthétiques de sonde.
4. Relancer les mesures complètes avec gzip et le recensement des vues cachées ; conserver mêmes paramètres, préréglages et traces d’erreur. Les chiffres manquants de ce rapport ne valent pas zéro.
5. Après réception logicielle, appliquer PROTOCOLE-ESSAI : installation réelle et ses **15 fichiers serveur de production à recompiler**, tests sans mouvement, puis essais progressifs autorisés. Ne pas transformer les exemples de trajectoire du protocole en commandes universelles.

**Non vérifié :** aucune vraie CNC/Grbl ESP32, aucune Surface Pro, aucune Surface RT/Chromium 106, aucun tactile poussiéreux, aucune profondeur réelle, pince/bloc/broche, bride ou collision. Pas de compilation d’installation, déploiement, SSH, réseau extérieur ni essai matériel dans ce lot. Les arrêts logiciels ne prouvent pas l’arrêt physique ; la reprise ne prouve pas la conservation de la pièce. Les performances des deux tablettes, la fluidité GPU, le réveil du panneau et le rechargement du kiosque restent inconnus. Le harnais complet n’est pas vert ; absence de navigateur résiduel non certifiée. Aucun fichier temporaire n’est ajouté au dépôt par RAPPORT ; les fichiers non suivis préexistants sont conservés.
