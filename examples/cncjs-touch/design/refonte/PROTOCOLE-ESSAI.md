# Protocole d'essai réel de la refonte

Préparé le 16 novembre 2026, base `e5d43389` et corrections FINAL non commitées au moment de la rédaction. **Aucun essai de ce document n'a été effectué sur la CNC, la Surface ou la RT.** À conduire par l'opérateur, sur place, après les vérifications du pilote. Sources locales : `PLAN-CORRECTIONS.md` § 6, `FIRMWARE.md` § 5, faits de terrain du prompt et `SURETE.md`.

## 1. Préparer la livraison, machine déconnectée

1. Le pilote commite séparément les corrections et les documents, sur `feat/refonte-ui`, puis relance les deux suites imposées. Relever les hashes réellement installés. Ne pas réappliquer les anciens patches de S/P/L : leur historique est déjà dans la branche.
2. Avant toute copie sur la Surface, sauvegarder l'installation fonctionnelle, les fichiers compilés remplacés, les ressources Touch, `.cncrc`, les profils locaux du navigateur et la configuration du kiosque. Garder les originaux et la procédure de retour à cette version.
3. Construire un dossier d'installation cohérent : serveur **compilé par Babel**, page entière correspondante et `VERSION.json` régénéré après les commits. Ne pas copier du JavaScript serveur ES modules directement dans l'installation compilée.
4. Vérifier le chemin que lance réellement le service/PM2 sur la Surface. `package.json` du dépôt désigne `dist/cncjs/server-cli.js`, et `scripts/build-prod.sh` compile `src/server` vers `dist/cncjs/server`. Cela ne prouve pas le chemin de l'installation locale. Adapter uniquement la destination après l'avoir relevée ; aucun chemin `/home/...` n'est supposé ici.
5. Installer seulement lorsque le port est fermé, la machine immobile et l'énergie de coupe coupée. Le présent lot ne réalise ni connexion, ni installation, ni redémarrage distant.

### Liste exacte du serveur à recompiler

Inventaire obtenu avec `git diff --name-only 3049a0e4..HEAD -- src/server`, HEAD `e5d43389` : **52 chemins, dont 15 fichiers de production et 37 fichiers de tests/support de tests**. Les corrections FINAL modifient `job-service.js` et `system-command.js`, déjà dans ces 15 chemins. Les tests ne sont pas des modules à installer. Après les commits FINAL, refaire cette commande et comparer la liste ; tout nouveau module de production doit être ajouté avant installation.

| Source à compiler | Sortie dans le paquet du dépôt |
|---|---|
| `src/server/api/api.touch.js` | `dist/cncjs/server/api/api.touch.js` |
| `src/server/services/cncengine/CNCEngine.js` | `dist/cncjs/server/services/cncengine/CNCEngine.js` |
| `src/server/services/touch/backlight.js` | `dist/cncjs/server/services/touch/backlight.js` |
| `src/server/services/touch/block-probe.js` | `dist/cncjs/server/services/touch/block-probe.js` |
| `src/server/services/touch/control.js` | `dist/cncjs/server/services/touch/control.js` |
| `src/server/services/touch/halt.js` | `dist/cncjs/server/services/touch/halt.js` |
| `src/server/services/touch/index.js` | `dist/cncjs/server/services/touch/index.js` |
| `src/server/services/touch/job-load.js` | `dist/cncjs/server/services/touch/job-load.js` |
| `src/server/services/touch/job-service.js` | `dist/cncjs/server/services/touch/job-service.js` |
| `src/server/services/touch/motion.js` | `dist/cncjs/server/services/touch/motion.js` |
| `src/server/services/touch/plate-probe.js` | `dist/cncjs/server/services/touch/plate-probe.js` |
| `src/server/services/touch/probe-input.js` | `dist/cncjs/server/services/touch/probe-input.js` |
| `src/server/services/touch/program-check.js` | `dist/cncjs/server/services/touch/program-check.js` |
| `src/server/services/touch/system-command.js` | `dist/cncjs/server/services/touch/system-command.js` |
| `src/server/services/touch/work-offset.js` | `dist/cncjs/server/services/touch/work-offset.js` |

Depuis la racine, avec les dépendances **déjà installées**, la compilation ciblée du paquet peut se préparer ainsi en Bash, hors machine connectée. Les chemins sont issus du diff ; la commande s'arrête avant compilation si leur nombre diffère de l'inventaire attendu :

```bash
set -euo pipefail
mapfile -t touch_server_sources < <(git diff --name-only 3049a0e4..HEAD -- src/server |
  awk '/\.js$/ && !/\/__tests__\//')
test "${#touch_server_sources[@]}" -eq 15
for touch_source in "${touch_server_sources[@]}"; do
  touch_output="dist/cncjs/server/${touch_source#src/server/}"
  mkdir -p "$(dirname "$touch_output")"
  NODE_ENV=production ./node_modules/.bin/babel "$touch_source" \
    --config-file ./babel.config.js --out-file "$touch_output"
done
bash scripts/copy-touch-assets.sh dist/cncjs
```

Ce sont les options Babel et le répertoire de sortie du build du dépôt ; cette préparation ciblée suppose une base compilée complète compatible, pas un dossier vide. Pour une installation d'une autre base, construire le paquet complet par la procédure du projet. `copy-touch-assets.sh` copie tout le répertoire Touch et écrit les métadonnées ; `tablet-exclude.txt` reste l'autorité pour les fichiers exclus du paquet tablette. Ne jamais réintroduire leurs scripts dans `index.html`. Vérifier l'exclusion lors de la préparation du paquet propre à la tablette. Aucun de ces builds/installations n'a été exécuté par FINAL.

## 2. Feuille de relevé et arrêt de l'essai

Avant chaque phase, noter date, hashes serveur/page, URL, navigateur/version, profil CNC/laser, rendu Éco/Performance, énergie de broche/laser, fichier/empreinte, `$I`, `$$`, `$G`, `$#`, MPos/WPos/WCO et état de référence. Enregistrer les lignes série et leurs heures, `ok`/erreurs, rapports, journal et phrase affichée. Ne pas inclure jeton, mot de passe ni profil privé dans un rapport partagé.

L'opérateur reste devant la machine, avec accès immédiat à l'arrêt physique et table dégagée. Au premier mouvement inattendu, contact de fin de course, perte d'état ou doute : arrêter physiquement si nécessaire, couper l'énergie de coupe, consigner le cas et suspendre la phase. Un bouton Arrêter n'atteste jamais l'immobilité réelle. Après bannière, alarme ou reset, considérer la référence perdue et refaire la prise d'origine avant tout travail ; ne pas enchaîner les essais avec un simple déverrouillage.

## 3. Sans mouvement : interface, installation et lectures

| Étape | Manipulation | Résultat attendu / relevé |
|---|---|---|
| A1 — plan 1 | Lire l'URL réellement ouverte par le kiosque (`~/.xinitrc` ou configuration constatée), puis la valeur `touch.backlight.percent` de `.cncrc`. | URL en `localhost`/boucle locale pour D3. Ne pas diffuser le reste du fichier privé. Une URL Wi-Fi n'est pas locale pour D3. |
| A2 — plan 2 | Broche coupée, CNC déconnectée : ouvrir aussi la page sur le PC ; laisser sa veille se déclencher. Puis veille du kiosque et toucher. Répéter après rechargement du kiosque et redémarrage local de CNCjs avec panneau sombre. | Le PC n'éteint pas la Surface ; le kiosque se rallume au toucher et au chargement. Ne pas créer une seconde page locale qui éteint le panneau. Relever les limites D3 si le premier toucher atteint une cible. |
| A3 — plan 3 | Au repos, vérifier hash de page chargée et version installée dans Système ; Recharger. Essayer le raccourci de rechargement éveillé puis en veille. Le technicien compare `xdotool` avec/sans `--window` si utilisé par l'installation. | Un seul rechargement affiche la bonne version ; la veille ne consomme pas Ctrl/Alt/Meta/F5. Recharger est refusé dès que le repos du serveur n'est pas prouvé. |
| A4 — E-0, plan 4 | Enregistrer un démarrage USB/alimentation, sans commande de mouvement ; lire `$I`, puis la liste étendue `$S` ou `$+` seulement si reconnue. | Identifier les messages et réglages réellement présents. Une commande inconnue est consignée ; ne pas tenter d'écrire `$39` ni extrapoler son sens. |
| A5 — E-H, plan 5 | Depuis le téléphone de l'opérateur, constater seulement si le point d'accès de la carte est ouvert et son interface accessible, sans envoyer de commande. | Relever le canal qui contournerait le bail CNCjs. Pas de changement Wi-Fi implicite. |
| A6 — plan 6 | Carte immobile : redémarrer CNCjs au repos, puis dans une alarme déjà présente. Observer la relecture ; tester Relire. | Version/réglages reviennent par `$I` et `$$` ; aucune ligne de mouvement, pas besoin de déverrouiller pour lire. Respecter les trois tentatives bornées. |
| A7 — E-E repos, plan 7 | Enregistrer 60 rapports au repos. | Compter les intervalles WCO/Ov et mesurer leur délai ; un `ok` sans WCO explicite récent ne suffit jamais à prouver D2. |
| A8 — parcours/langues | Rejouer les écrans, dialogues et refus accessibles sans mouvement en FR/EN/ES, sombre/clair, texte normal/agrandi. Ouvrir puis fermer la 3D ; simuler son indisponibilité sur le banc PC. | Sous-titres d'opérations traduits, noms de fichiers/macros conservés, détails accessibles. Refus de départ visible avant « Tout est prêt ». 3D : message et Réessayer, aucune ouverture tardive après fermeture. |

## 4. Premiers mouvements, énergie de coupe débranchée

1. **B1 — E-C, plans 8/9 :** table dégagée, lancer la prise d'origine depuis Machine, case puis bouton d'effet. Observer l'ordre des axes et les rapports Home ; attendre l'arrêt réel. Lire MPos, `$#` et WCO. Répéter trois fois. Relever la convention, sans supposer que l'absence de Home peut apprendre X/Y.
2. **B2 — D2 :** lorsque le G54 stocké est non nul, observer la preuve automatique après homing. Si le WCO est incohérent : `$#`, autre repère, retour, `$G`, WCO explicite postérieur puis `proven`. Aucune ligne avec axe ni G10 de rechargement. Vérifier le refus de démarrer/palper/reprendre pendant l'attente ; si la preuve échoue, arrêter ici, ne pas contourner D2.
3. **B3 — pas/zéros :** depuis une position intérieure, commencer par un petit pas vers l'intérieur, vitesse lente, vérifier sens et distance. Tester zéro X ici et Autres zéros → origine machine X, sans déplacement. Après G10 L2, MPos est inchangée, WCO X vaut 0 et WPos X rejoint MPos X ; relire `$#`. Remettre ensuite un zéro de travail adapté au fichier d'essai et laisser D2 le prouver.
4. **B4 — D1, plan 15 :** charger le fichier de T2 sans le démarrer. Avec une origine connue, vérifier l'axe, le côté et le dépassement chiffré, et le refus du départ normal. Relever physiquement la pièce uniquement avec un montage convenable, refaire Z et vérifier le nouveau contrôle. **Ne pas tester la dérogation par un vrai dépassement** : la preuve logicielle du double geste et du journal existe, elle ne justifie pas une collision.
5. **B5 — diagnostic, plan 16 :** à l'arrêt, énergie coupée, tester le contact puis la libération. Si contact permanent, suivre l'assistant : écarter le bloc, débrancher la broche, retirer la pince. Modifier les branchements uniquement hors tension selon le matériel. Le témoin doit suivre les contacts réels ; les hypothèses de l'assistant ne sont pas une mesure électrique.
6. **B6 — plaque, plan 17 :** mesurer l'épaisseur ; vérifier qu'une recherche volontairement trop longue est refusée **avant toute écriture de palpage**. Choisir ensuite une petite recherche libre et bornée ; lancer les deux touches, observer retrait et zéro. Vérifier X/Y inchangés et D2 à nouveau prouvé. Retirer la plaque après immobilisation.
7. **B7 — arrêt plaque :** refaire un essai borné avec Arrêter dans la demi-seconde après confirmation, puis Pause lors d'un essai distinct. Vérifier arrêt réel, absence de ligne suivante, zéro annoncé incertain si nécessaire, verrou conservé jusqu'à confirmation de l'arrêt. Après reset/reboot, reprendre B1/B2. Sur le banc uniquement, préparer un ticket puis invalider D2 : l'exécution doit refuser sans G38.2 (régression FINAL), sans fabriquer cet entrelacement sur la vraie CNC.
8. **B8 — E-F, plan 18, avant XYZ :** valider séparément G38.3 sans contact dans une petite zone dégagée, à faible avance, cible bornée ; relever `[PRB:…:0]`, `ok`, état final et position. Tester ensuite le refus sur contact déjà établi. Une alarme suspend l'essai et impose B1/B2. Ne pas lancer XYZ avant d'avoir confirmé le comportement sans contact des liaisons.
9. **B9 — bloc :** cotes réellement mesurées, dessin correspondant au coin, fraise au-dessus du bloc dans la zone indiquée, test contact/libération. Commencer par Z seul ; vérifier les deux touches et le zéro. Passer à X puis Y seulement avec dégagement ; XYZ en dernier. Comparer les contacts, l'origine et `written` aux mesures, pas seulement au message de succès. Ne pas oublier de rebrancher la broche hors tension avant la phase de coupe.

Cadrage laser (le cadrage à vide de la CNC a son propre essai au § 8). Sur un laser réel, conserver les protections propres au laser et une émission matériellement empêchée pour cet essai : vérifier `M5` puis le contour, Arrêter/Pause et aucun redémarrage du contour. Le départ retardé par relecture de fichier, son annulation et la libération/reprise de main sont prouvés sur banc FINAL ; ne pas ralentir artificiellement le stockage d'une installation de production. Une RT à `$22=0` garde le départ autorisé par le serveur avec avertissement de course inconnue ; **ne pas mettre `$22=0` sur la CNC pour cet essai**.

## 5. Qualification du firmware, séparée de la séance normale

Ces essais peuvent perdre la référence ou provoquer une alarme. Le technicien doit pouvoir observer toutes les lignes, disposer d'un accès série exclusif et couper physiquement le mouvement. Arrêter CNCjs **machine immobile** avant un essai série exclusif, pour qu'aucune preuve D2 automatique ne modifie l'expérience. Ne pas affaiblir ou modifier les gardes de production. Si ces conditions ne sont pas réunies, laisser la question ouverte et conserver les refus/marges actuels.

| Essai | Exécution prudente | Critère et suite |
|---|---|---|
| E-1, plan 11 | À l'arrêt réel, position connue non nulle et énergie coupée : envoyer 0x18 seul. | Bannière, MPos et marque physique : reset ou redémarrage ? Dans tous les cas refaire B1/B2 avant les mouvements suivants. |
| E-D, plan 13 | Table entièrement dégagée : observer `$HX`, durée, ordre, Home/Pn. Ne pas en attendre un axe seul. | Confirmer le cycle complet observé le 14 novembre, et les rapports nécessaires à l'apprentissage. `$HY`/`$HZ` uniquement si une question précise le nécessite. |
| E-B, plan 10 | Après homing, avant tout rechargement D2, lire le repère et son décalage non nul. Définir **deux cibles possibles** (décalage exécuté nul ou stocké), leurs trajets depuis MPos et leurs dégagements. Employer un mouvement linéaire lent en mm, cible choisie sur place et avance bornée, jamais le `G0 X1` générique de la fiche. Relever MPos ; seulement ensuite autre repère/retour puis même comparaison. | Déterminer si seul le rapport WCO ment ou si le décalage exécuté est nul. Si les deux trajets ne sont pas petits et libres, ne rien envoyer : D2 couvre déjà les deux hypothèses. Refaire B1/B2 après l'expérience. |
| E-A, plan 12 | Après référence prouvée, approcher séparément chaque borne depuis l'intérieur, sans outil coupant. Relever les courses réelles avant de choisir les cibles : **408/396/130 mm observés, pas les exemples 400 mm de FIRMWARE**. Pas au plus 0,05 mm près de la limite, avance lente, une seule demande puis retour intérieur. Le support de `$J=G53 G90` et la nature de son refus sont à vérifier sur ce binaire, pas à supposer. | Relever les six bornes, `error:15` ou `ALARM:2`, perte de référence et distance physique aux contacts. Ne pas envoyer un tableau de cibles franchissant le capteur ; à la première alarme, suspendre et reprendre B1/B2. Ne pas réduire la marge de 0,5 mm sur la seule base du simulateur. |
| E-2, plan 19 | Seulement après qualification des bornes et du refus sans mouvement : une cible très légèrement hors course dans une direction mécaniquement dégagée. L'exemple `G53 G0 Z0.5` reste une expérience du firmware, **pas une commande sûre universelle**. Relever pendant 10 s ; si nécessaire, reset seulement après immobilisation/coupure. | Moment de l'alarme, redémarrage spontané ou après reset, MPos perdue. Puis `$X` ne doit pas suffire à Démarrer sur `$22=1`. Refaire B1/B2. |
| E-3, plan 20 | Déplacement lent court, entièrement dans une zone dégagée, énergie coupée ; 0x18 au milieu. Choisir distance et avance sur place, sans reprendre aveuglément le X20 de la fiche. | Arrêt réel, ALARM/bannière et position mesurée avant/après. Aucune confiance dans MPos 0 après l'incident. Refaire B1/B2. |
| E-E en mouvement | Lors d'un déplacement lent déjà validé, recueillir 60 rapports. | Cadence WCO/Ov réelle, délai maximal, comportement de Home et de D2. |
| E-G, plan 21 | Dernière phase moteur, table libre, montage et zone protégés : comparer les consignes S1000, S18000, S10000 puis correction au minimum, en conservant un moyen d'arrêt physique. | Relever FS, consigne et vitesse observée. Avec `$30=1000`, S18000 est saturé ; FS n'est pas un tachymètre. Toujours arrêter et constater l'arrêt avant de manipuler. Ne pas modifier `$30` dans cet essai. |

## 6. Séance complète puis petit usinage

Après réussite des phases précédentes, rebrancher les éléments hors tension, enlever bloc/plaque/pince, vérifier bridage, martyr, longueur de fraise et courses réelles. La fraise au plus bas du montage ne permet pas de conclure qu'une découpe de 20 mm est possible : contrôler le montage et le verdict du fichier avant toute coupe.

1. Rejouer P1 → P2 → P3/P5/P6 → P7 avec un **petit fichier connu et compatible**, d'abord en l'air, énergie de coupe empêchée. Vérifier les deux dessins, la profondeur et le sens des mouvements.
2. Vérifier Pause, arrêt stabilisé, Reprendre et Arrêter dans des essais distincts. Une plaque en pause de changement de fraise garde le même propriétaire et les mêmes confirmations. Après Arrêter/alarme : Machine, référence, D2, zéro pièce à vérifier/refaire, puis volet Reprendre à une ligne ; vérifier fichier, ligne et préambule, charger, contrôler et confirmer.
3. Seulement après cela, petit usinage sur chute, sous présence continue de l'opérateur. Observer broche/rapides, progression limitée à 99 % pendant le travail et fin réelle. Ne pas employer une dérogation de course pour cette validation.
4. Compter effectivement les touchers P1 à P10, erreurs et retours arrière. Conserver dimensions CSS, langue et taille du texte ; les comptes de conception ne sont pas les comptes mesurés.
5. RT/Chromium 106, lorsqu'elle sera disponible : tester séparément l'isolation `inert`, Pause/Arrêter sous dialogue, Éco sans ressource v2, et les parcours laser. L'ancien `refonte/A2/inert.html` n'est plus livré dans l'arbre courant : employer les scénarios durables du harnais et une copie de banc revue si nécessaire, **sans réintroduire de script exclu dans la page réelle**. Cela couvre le but du plan 22/Q-09, pas un déploiement RT implicite.

## 7. Décision après essais

Pour chaque étape, remplir : effectué/non effectué, résultat exact, attendu, preuve, anomalie, responsable et date. Un refus conservateur est consigné comme tel, sans dérogation automatique. Une phase non faite reste non vérifiée.

Après E-A/E-B, mettre à jour les hypothèses du profil LUNYEE, la marge et les conclusions de FIRMWARE/SURETE avec les mesures obtenues. La revue de sûreté finale, le harnais complet et la décision d'adopter l'installation appartiennent au pilote/opérateur ; les tests logiciels verts de FINAL ne valent ni essai physique ni approbation de coupe.

## F5 — Reconnexion automatique (à réaliser par l'opérateur)

Préparation : machine sans usinage, table dégagée, fraise en l'air, énergie de coupe empêchée et arrêt physique accessible. Vérifier l'URL locale du kiosque (`127.0.0.1` ou `localhost`) et le champ `local:true` de la réponse authentifiée `GET /api/touch-backlight`. Une URL réseau de la tablette n'est pas locale au sens D3.

1. Sans port mémorisé, ouvrir la page : aucune ouverture automatique. Connecter une fois manuellement et attendre le suivi de la machine. Dans Réglages → Machine et performances, vérifier « Reconnexion automatique », sa portée « Cette tablette » et l'état activé.
2. Fermer proprement le port au repos, puis recharger la page locale : une seule ouverture du port précédent, sans toucher Connecter. Relever l'éventuel redémarrage de la carte, l'alarme et la perte de référence ; aucun axe ni broche ne doit démarrer. Vérifier que prise d'origine et preuve du zéro restent exigées. Ne pas les confondre avec la réussite de la connexion.
3. Recharger alors que le port est déjà ouvert, puis depuis un PC distant : aucune réouverture ni redémarrage. Avec le PC ayant la main, constater l'absence d'ouverture automatique, y compris si un autre port est présenté. Un scénario de bail conservé après fermeture nécessite un banc : ne pas maintenir artificiellement une situation inconnue sur la machine.
4. Débrancher le port au repos, recharger puis le rebrancher après l'échec : aucune seconde tentative. Connecter reste possible manuellement. Présenter un autre adaptateur USB : il ne doit jamais remplacer automatiquement le port mémorisé.
5. Désactiver le réglage, fermer le port au repos, recharger : aucun `open`. Réactiver : aucun `open` immédiat ; l'option ne prend effet qu'au prochain chargement. Vérifier sa persistance après fermeture du navigateur et redémarrage de la tablette.
6. Vérifier le message d'échec et son bouton de connexion manuelle en FR/EN/ES, avec texte standard et agrandi. Contrôler le défilement et la cible du réglage à 1366 × 911 et 1366 × 768. Rejouer le harnais strict Réglages avant installation.

Parties serveur à reconstruire pour F5 : `src/server/lib/local-request.js`, `src/server/api/api.touch.js`, `src/server/services/touch/index.js`, `src/server/services/cncengine/CNCEngine.js`. Livrer ensemble serveur et page ; cette liste ne constitue pas une autorisation de déploiement. Aucun de ces essais physiques n'a été réalisé dans le lot F5.

## F10 — installation et rechargement automatique, sans clavier

Essai par l'opérateur après installation autorisée, sur Surface CNC puis RT laser.
F10 n'ajoute aucun mouvement : ne lancer aucun mouvement dans le seul but de
tester une mise à jour. Noter versions chargée/installée, URL, heure et résultat.

1. Garder la page ouverte avec son cache déjà utilisé. Machine réellement au repos,
   broche arrêtée ou CNC déconnectée. Installer une version différente par le
   parcours habituel, sans recharger à la main. En moins de 30 secondes plus les
   échanges serveur, attendre le bandeau puis dix secondes annoncées. Vérifier
   dans Plus/Réglages que la nouvelle version est chargée après une seule navigation.
   Refaire avec les fichiers séparés réellement livrés, sans supposer un bundle.
2. Refaire en touchant « Plus tard » avant la fin. Aucun rechargement pendant dix
   minutes ; le bandeau doit ensuite revenir lorsque tout est au repos. Vérifier
   les trois langues, texte agrandi, l'accès au bouton et Pause/Arrêter dégagés.
3. Pendant un compte à rebours, ouvrir un dialogue, commencer une saisie, choisir
   un port USB ou ouvrir le formulaire Wi-Fi : le délai doit disparaître. Fermer
   ou terminer l'action ; un nouveau délai entier doit précéder tout rechargement.
4. Installer pendant une séance d'essai déjà prévue par le protocole, avec une
   action en cours puis en pause : aucun rechargement. Ne jamais forcer le repos
   pour ce test. Après fin et broche arrêtée, le délai doit pouvoir commencer.
5. Au repos, redémarrer CNCjs par le parcours autorisé pendant que l'ancienne page
   reste ouverte. Vérifier retour du suivi/de la session, nouvelle version détectée,
   dix secondes entières et nouvelle version chargée sans clavier. Aucune ancienne
   confirmation, connexion USB ou action machine ne doit être rejouée.
6. Si le serveur reste injoignable ou la machine ne donne plus d'état récent,
   constater qu'aucun rechargement automatique n'enlève les commandes d'arrêt.
   Vérifier également qu'une autre machine occupée sur le même serveur bloque
   la navigation. Toute incertitude interrompt l'essai et reste consignée.

## 8. F1 — Cadrage à vide sur la CNC (ajouté le 17 novembre 2026)

Mouvement nouveau (`SURETE.md` § F1, conception `../fonctions/F1-CONCEPTION.md` § 12). À conduire seulement après les phases B1/B2 réussies (prise d'origine, D2 prouvé). Règles du § 2. **Phases A à C : broche débranchée de son alimentation.** Garder CNCjs classique ouvert sur le PC en observateur pour lire les lignes écrites et les réponses.

**Avant.** Relire `$$` et noter `$20`, `$110-$112`, `$120-$122`, `$130-$132`. Si `$20` ne vaut pas 1, le cadrage est refusé (« Les limites de course de la machine sont coupées ») : c'est voulu. Remettre `$20=1` est une décision de l'opérateur, hors de ce lot.

| Étape | Manipulation | Résultat attendu / relevé |
|---|---|---|
| F1-A1 | Carte connectée, sans prise d'origine, un fichier chargé. 4 · Contrôle. | « Cadrer à vide… » rayé, phrase « origine à prendre » et son remède. |
| F1-A2 | Prise d'origine ; regarder le bouton pendant la vérification du zéro pièce. | Rayé « La machine vérifie le zéro pièce… », puis plein. |
| F1-A3 | Poser un zéro pièce tel que le fichier dépasse en X. | Rayé, « Le fichier dépasse de N mm en X+… » ; N égal au dessin de Contrôle. Remettre un zéro correct. |
| F1-A4 | Prendre la main depuis le PC, puis la rendre. | Rayé sur la tablette tant que le PC a la main. |
| F1-B5 | **Table vide, pince sans fraise.** Petit fichier connu (≈ 100 × 50 mm), zéro pièce vers le milieu de la table, Z machine descendu à la main vers −60. | — |
| F1-B6 | « Cadrer à vide… » : lire le dialogue (dimensions, durée, Détails : lignes et hauteur sûre), cocher, « Lancer le cadrage ». Main sur l'arrêt physique. | Dialogue « Cadrer à vide », bouton d'engagement armé après la case. |
| F1-B7 | Observer. | Dans l'ordre : `M5` ; Z monte **seul** et s'arrête à Z machine −5,000 ; puis X/Y vers le premier coin ; quatre côtés ; retour au-dessus du départ ; Z n'a jamais baissé. Relever la position machine à chaque coin = coin + zéro pièce (0,05 mm). Chronométrer un côté : 100 mm ≈ 10 s. |
| F1-B8 | Après. | Repos, pas d'alarme ni de bannière, prise d'origine et zéro pièce toujours valides, « Cadrage terminé. La fraise est restée en haut. » |
| F1-B9 | Refaire juste après une prise d'origine (Z déjà en haut). | Aucune montée ; Z ne bouge pas. |
| F1-C10 | Depuis Z −60, **Arrêter pendant la montée**. | Arrêt net, X/Y immobiles, aucune bannière, référence gardée. Relancer : la montée repart de là. |
| F1-C11 | **Arrêter au milieu d'un grand côté.** | Temps et distance entre toucher et arrêt (attendu : quelques mm). Position gardée, pas d'alarme, aucun mouvement pendant une minute. |
| F1-C12 | Même essai avec **Pause**. | Comme C11 ; le cadrage ne reprend pas. |
| F1-C13 | Lancer depuis la page Touch du PC, puis **fermer l'onglet** pendant un côté ; recommencer en **prenant la main** depuis la tablette pendant un côté. | Arrêt dans les deux cas (« Cadrage arrêté avant la fin… »). |
| F1-C14 | Pendant un côté, « feed hold » dans CNCjs classique. | La fraise s'arrête et **ne repart pas**. |
| F1-C14b | Pendant un côté, puis **à l'arrêt entre deux côtés** (pendant la demi-seconde de repos), regarder 3 · Zéro pièce / les flèches sur la tablette, et tenter un pas **depuis la tablette qui a lancé le cadrage** (celle qui a la main : depuis un autre appareil, le refus de pilotage masquerait l'essai). | Flèches grisées « Déplacement en cours : attendez l'arrêt. » ; le pas est refusé « Cadrage en cours. » ; le cadrage continue à la même hauteur. |
| F1-C14c | Pendant un côté, charger un fichier depuis CNCjs classique (glisser un `.nc`). | Refusé (« Cadrage en cours sur la tablette… ») ; le cadrage continue. |
| F1-C15 | Facultatif, une seule fois : arrêt physique pendant un côté. | Tout s'arrête ; au retour reconnecter, relire, prise d'origine ; le cadrage ne reprend pas. |
| F1-D16 | Brider la planche, monter la fraise, zéro pièce habituel, broche **toujours débranchée**. Vérifier que rien sur la table n'est plus haut que la fraise relevée. | — |
| F1-D17 | Cadrer. | Aux quatre coins, l'axe de la fraise est au-dessus du coin attendu ; aucune bride sous le trajet (sinon la déplacer). |
| F1-D18 | Rebrancher la broche hors mouvement ; lancer l'usinage par le chemin normal. | Le programme part de la hauteur où le cadrage a laissé la fraise. |

Ne **pas** essayer : une cible hors course « pour voir », `$20=0`, un reset en mouvement, un redémarrage de CNCjs pendant un côté.

Les fenêtres trouvées par la relecture (rotation du flux, bannière, `jogCancel`, `autolevel:stop` ou porte `0x84` d'un client tiers, `$G` sans `FS`, réglages, repère ou décalage changés pendant le cadrage) sont prouvées sur banc et simulateur seulement (`../fonctions/F1-CORRECTIONS.md`) ; elles ne se provoquent pas à l'essai.

**Relevé à rendre** : fait / non fait par étape, lignes écrites, positions aux coins, temps d'un côté, temps et distance d'arrêt, toute surprise. Une étape non faite reste non vérifiée. Après l'essai, mettre à jour C7 et C8 de la conception et la limite F1 de `SURETE.md`.

## F4 — Rendre la main (essai réel, fraise en l'air, broche arrêtée)

1. Repos, la tablette a la main : « La main : ici » puis « Rendre la main ». Le bandeau passe à « La main : libre » ; le PC ou un téléphone prend la main **sans motif** ; la tablette devient observatrice (Pause et Arrêter restent actifs).
2. Même geste pendant un usinage en cours, puis en pause : le bouton est rayé avec sa phrase, la main reste à la tablette, rien ne bouge ; « Voir l'usinage » ouvre l'écran 5.
3. Un pas long et lent (X 50 mm à 100 mm/min) : pendant qu'il court, rendre la main ; le pas s'arrête net (Jog → Idle, `0x85` au journal) et rien ne repart seul.
4. Pendant un cadrage à vide (§ 8, table vide) : rendre la main l'arrête (« Cadrage arrêté : le pilotage a changé de main »), un seul arrêt, la fraise reste en haut.

## N1 — Analyse du fichier (essai réel, sans mouvement puis sur un usinage habituel)

Rien de cette fonction ne commande la machine : l'essai vérifie que les trois avertissements disent vrai sur vos fichiers. Détail : `../plaque/N1-RAPPORT.md`.

| # | Geste | Attendu |
|---|---|---|
| N1-1 | 2 · Fichier : toucher un fichier Vectric habituel. | À droite de la ligne du verdict, « Analyse du fichier… » (ou « ! 1 avertissement », ambre). Rien d'autre n'a bougé sur l'écran. |
| N1-2 | Ouvrir le volet. Lire « Le fichier descend à N mm sous le zéro Z. » | N est la profondeur de coupe que vous avez réglée dans Vectric (la même que « Profondeur sous le zéro » de l'écran). |
| N1-3 | Toucher « Épaisseur du brut », saisir l'épaisseur mesurée de la planche au pied à coulisse, Valider. | Détourage prévu traversant de 0,5 mm : « ! La fraise descend 0,5 mm sous le brut : elle touchera le martyr. » Poche non traversante : « ✓ Il reste N mm de matière sous la fraise. » Comparer N à votre dessin. |
| N1-4 | Toucher « Zéro Z sur le martyr », puis revenir à « Zéro Z sur le dessus du brut ». | La phrase change (« … dans le martyr ») puis revient. La ligne grise dit sur quelle hypothèse repose le calcul. |
| N1-5 | Fermer, toucher un autre fichier, rouvrir le volet ; puis revenir au premier. | L'autre fichier n'a pas d'épaisseur ; le premier a gardé la sienne. |
| N1-6 | « Fraises du fichier ». | Le numéro de fraise écrit par Vectric et sa ligne, ou « Le fichier n'indique pas sa fraise. » Noter ce que vos fichiers donnent vraiment (une photo du volet suffit) : c'est le point le moins vérifié. |
| N1-7 | « Montée en vitesse de la broche ». | Un temps en secondes, les deux lignes du fichier (démarrage de la broche, première descente), ou « non calculé ». Ouvrir le fichier sur le PC et vérifier que ces deux lignes sont les bonnes. |
| N1-8 | Charger le fichier, 4 · Contrôle. | Le même bouton à côté de « Détails du contrôle », avec le même nombre d'avertissements. « Démarrer l'usinage… » n'est ni rayé ni changé par un avertissement. |
| N1-9 | **Usinage habituel, fraise en l'air ou pièce d'essai** : au départ, chronométrer de la mise en route de la broche à l'instant où la fraise touche la matière. Écouter si la broche a atteint son régime avant. | Le temps mesuré est égal ou un peu supérieur au temps affiché (le calcul ignore les accélérations). Si la broche n'est pas à son régime à la descente, c'est l'avertissement qui avait raison : ajouter une temporisation dans le post-processeur de Vectric et refaire N1-7. |
| N1-10 | Régler « Temps voulu » à la durée de montée réelle de votre broche (mesurée en N1-9), fermer, rouvrir. | La valeur est gardée ; l'avertissement suit ce seuil. |
| N1-11 | Recharger la page (ou redémarrer la tablette), rouvrir le volet du même fichier. | Épaisseur, choix du zéro Z et temps voulu sont revenus. |
| N1-12 | Sur la RT (laser), 2 · Fichier et 4 · Contrôle. | Aucun bouton « Analyse du fichier… » ; écrans inchangés. |

Ne pas essayer de « vérifier » un avertissement de profondeur en usinant : il se vérifie au pied à coulisse et sur le dessin.

**Relevé à rendre** : pour deux ou trois fichiers habituels, la profondeur affichée, ce que dit « Fraises du fichier », le temps de broche affiché et le temps chronométré, le temps de montée réel de la broche, et toute phrase fausse ou incomprise.
