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

Le cadrage reste réservé au laser. Sur un laser réel, conserver les protections propres au laser et une émission matériellement empêchée pour cet essai : vérifier `M5` puis le contour, Arrêter/Pause et aucun redémarrage du contour. Le départ retardé par relecture de fichier, son annulation et la libération/reprise de main sont prouvés sur banc FINAL ; ne pas ralentir artificiellement le stockage d'une installation de production. Une RT à `$22=0` garde le départ autorisé par le serveur avec avertissement de course inconnue ; **ne pas mettre `$22=0` sur la CNC pour cet essai**.

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

## F2 — Pause et dégager, essai réel pas à pas (2026-11-17)

Source : `design/fonctions/F2-CONCEPTION.md` § 14. À conduire par l'opérateur, devant la machine, arrêt physique à portée de main, **après** les phases 4 et 6 ci-dessus (prise d'origine, D2, petit fichier connu). Enregistrer les lignes série avec leurs heures. À chaque étape : noter MPos avant et après, la phrase affichée, le Journal (« Pause et dégager », étapes `requested`, `lifting`, `parked`, `resume`, `resumed`, `held`, `failed`). Au premier écart : arrêt, on ne passe pas à l'étape suivante.

### F2.1 Sans mouvement

1. Relire les réglages et noter `$20`, `$21`, `$22`, `$1`, `$112`, `$122`. Machine au repos, fichier chargé : « Pause et dégager… » n'apparaît pas hors usinage.
2. Depuis le PC ou le téléphone (sans la main), pendant l'essai F2.2 : le bouton est rayé, avec la phrase de la main.

### F2.2 Fraise en l'air, broche débranchée, sans fraise

Zéro Z posé **40 mm au-dessus** de la pièce ou de la table (le fichier tourne dans le vide). Petit fichier connu, à lignes courtes.

3. Lancer. Toucher « Pause et dégager… », lire le dialogue, cocher, « Dégager la fraise ». Attendu : la machine finit quelques lignes, s'arrête, monte seule jusqu'à Z machine −5,000, l'écran dit « Fraise en haut, broche arrêtée. ». Relever : lignes exécutées après le toucher, temps avant l'arrêt, temps de montée, X et Y inchangés au millième. Dans la série : aucun `!`, un seul `$J=G91 G21 Z… F600`, puis `M5`, et `[GC:…]` identique avant et après le `$J=` (hormis M5).
4. Attendre 5 minutes. Relever Z machine et la hauteur du nez de broche sur un repère fixe : elle ne doit pas avoir changé (glissement de Z moteurs relâchés ; noter `$1`).
5. « Reprendre… », case, « Redescendre et reprendre ». Attendu, dans l'ordre : `M3 S…`, 3 s, descente rapide, 5 derniers millimètres lents, puis le fichier continue. Relever : les deux `$J=`, MPos au millième avant `~` égal à celui de l'arrêt de l'étape 3 (avant la montée), `[GC:…]` identique à celui d'avant la pause. Laisser finir : position finale égale à celle d'une exécution sans pause.
6. Refaire 3, puis **Arrêter** fraise en haut. Attendu : aucun `0x18` ni `!` dans la série, MPos conservée, machine toujours référencée à l'écran, « Reprendre à la ligne N… » proposé avec la bonne ligne. Charger cette reprise et la laisser passer, toujours en l'air.
7. Refaire 3 et toucher **Pause** pendant que la machine finit ses lignes. Attendu : arrêt immédiat (retenue ordinaire), pas de montée ; « Reprendre… » reprend comme une pause ordinaire.
8. Refaire 3 et toucher **Pause** pendant la montée. Attendu : la montée s'arrête (`0x85`), la broche est commandée à l'arrêt, « Reprendre sur place n'est plus possible… », action principale « Arrêter l'usinage ».
9. Refaire 3 et toucher **Arrêter** pendant la montée. Attendu : `!`, arrêt du mouvement, puis réinitialisation ; **considérer la référence perdue**, refaire prise d'origine et D2 (B1/B2) avant la suite.
10. Refaire 3 ; fraise en haut, depuis le PC : tenter Reprendre dans l'interface CNCjs. Attendu : refusé (« Fraise dégagée par la tablette… ») ; rien ne bouge. Puis prendre la main depuis le PC avec un motif : la tablette affiche que reprendre sur place n'est plus possible.
11. Refaire 3 ; pendant que la machine finit ses lignes, fermer la page de l'appareil qui a demandé. Attendu : pas de montée ; à la réouverture, « La fraise est restée dans la pièce… » et « Reprendre… » reprend simplement (`~` seul).
12. Fichier à longues lignes (allers-retours de 300 mm à vitesse lente) : mesurer le temps entre le toucher et l'arrêt. C'est le pire cas à connaître avant d'usiner.

### F2.3 Les formes de commande sur ce binaire (si une étape de F2.2 a montré un écart)

13. À l'arrêt, hors usinage, par les flèches : un pas de 1 mm en Z+, lire `$G` avant et après (identiques ?). Ne pas chercher à dépasser la course : la frontière reste l'affaire de l'essai E-A.

### F2.4 Broche branchée, sans fraise

14. Refaire 3 puis 5 en écoutant : la broche s'arrête-t-elle en haut ? À la reprise, est-elle à pleine vitesse avant la fin des 3 s ? Sinon noter le temps réel : `RETRACT_SPINUP_S` sera relevée avant tout essai dans la matière.

### F2.5 Dans une chute, passe de 1 mm

15. Fraise montée, pièce bridée, passe de 1 mm dans une chute de MDF. « Pause et dégager » au milieu d'une ligne droite, attendre l'arrêt et la montée, enlever les copeaux, « Reprendre… ». Après : chercher la marque au point d'arrêt (profondeur et décalage latéral ≤ 0,05 mm ; une légère trace de chauffe est attendue).
16. Seulement ensuite : même essai dans un arc, puis à la profondeur de travail habituelle.

### F2.6 Corrections après relecture (fraise en l'air, broche débranchée, comme F2.2)

17. Refaire 3, toucher **Pause** pendant la montée, puis **Arrêter** aussitôt, pendant que l'axe décélère encore. Attendu dans la série : `0x85`, puis `!`, `0x85` répétés tant que la carte dit `Jog`, et `0x18` après un rapport `Idle`, jamais pendant `Jog` avant 5 s (au-delà de 5 s de `Jog`, la réinitialisation part quand même : arrêter prime ; le noter si cela arrive). Considérer la référence perdue, comme à l'étape 9.
18. Refaire 3 ; fraise en haut, « Reprendre… » ; pendant les 3 s de `G4 P3`, envoyer depuis l'interface CNCjs du PC une annulation de déplacement (bouton d'arrêt du jog, ou `0x85`). Attendu : aucune descente ensuite, « Reprendre sur place n'est plus possible… », la broche est commandée à l'arrêt (`M5`) une fois au repos.
19. Refaire 3 ; fraise en haut, depuis un client branché directement sur la carte (Wi-Fi), si l'atelier en a un : changer G54 en Z de 1 mm. Attendu : « Reprendre sur place n'est plus possible… » dès le rapport suivant portant `WCO:` ; « Reprendre… » refusé. Remettre G54 et refaire D2 ensuite. Sinon, noter « non fait ».
20. Qualification du binaire (à part, non couverte par le simulateur) : à l'étape 5, relever le premier mouvement du fichier après `~` (le premier arc si possible) et vérifier qu'il part exactement du point d'arrêt (MPos au millième au début et à la fin du bloc). Un écart, même inférieur à 0,01 mm, signale une position d'interpréteur qui ne suit pas les `$J=` comme le code amont : arrêter et ne pas usiner avec F2.

### F2.7 Second tour de corrections (fraise en l'air, broche débranchée, comme F2.2)

21. Refaire 3 ; pendant la montée, arrêter depuis l'interface CNCjs du PC (bouton Stop). Attendu : `0x85` aussitôt, répété tant que la carte dit `Jog`, puis `M5` une fois au repos ; pendant ce temps les commandes du PC qui agissent sont refusées (« Fraise dégagée par la tablette… »), puis acceptées. Si un client branché sur la carte (Wi-Fi) existe : fraise en haut, y changer G54 en Z de 1 mm et relever dans le journal de CNCjs combien de rapports passent avant le premier `WCO:` qui le montre ; noter ce nombre (limite du § SURETE, second tour).
22. Refaire 3, « Reprendre… » ; pendant `G4 P3`, depuis le PC, envoyer `M4` (si la broche le permet, sinon noter « non fait »). Attendu : aucune descente, « Reprise arrêtée : la broche n'a pas redémarré… », `M5` au repos.
23. Relever le délai de la reprise depuis `held` (page fermée pendant l'attente du repos, étape 11 de F2.2) : `~` part au plus quelques secondes après « Reprendre… », une fois un `WCO:` reçu ; au-delà de 5 s, refus « l'origine de la pièce… n'est plus confirmée (WCO) » : noter si la carte rafraîchit `WCO:` trop rarement au repos.

### F2.8 Troisième tour de corrections (fraise en l'air, broche débranchée, comme F2.2)

24. Refaire 3 ; pendant la montée, arrêter depuis le PC (bouton Stop), puis toucher **Arrêter** sur la tablette tant que la carte dit `Jog`. Attendu : « Arrêt demandé… », un `!` d'abord, `0x85` répété, la réinitialisation seulement une fois la carte au repos (ou au délai de 5 s). Pendant la même suite, avant le retour au repos : les flèches de la tablette sont rayées (« la fin du déplacement de la fraise n'est pas prouvée… »), un toucher n'envoie rien.
25. Relever dans le journal série si la carte envoie `Ov:` dans ses rapports (et à quelle fréquence au repos). Puis refaire 3, « Reprendre… » ; pendant `G4 P3`, depuis la tablette, toucher une correction de broche : refusée (« corrections refusées jusqu'à la reprise… »). Si un client branché sur la carte existe : y changer `S` ou la correction de broche pendant la descente rapide. Attendu : `0x85` aussitôt, aucune descente lente, « Reprise arrêtée : la broche n'a pas redémarré… ».
26. Refaire 11 de F2.2 (reprise depuis `held`) ; avant « Reprendre… », arrêter la broche depuis un client branché sur la carte puis la relancer (si possible, sinon noter « non fait »). Attendu : reprise sur place refusée (« l'état de la machine a changé pendant la pause (spindle) »), même broche relancée.

### F2.9 Quatrième tour de corrections (fraise en l'air, broche débranchée, comme F2.2)

27. Refaire 3 ; pendant la montée, toucher **Arrêter** sur la tablette, puis aussitôt une flèche X+ ; depuis le PC, envoyer une commande (par exemple `G0 X1` dans la console). Attendu : la flèche est rayée (« Arrêt en cours… »), un toucher n'envoie rien, le PC est refusé (« Arrêt en cours sur la tablette… ») ; un second toucher d'Arrêter répond « Arrêt en cours » sans nouvel octet. Après la réinitialisation et sa bannière (la carte demande `$H` ou `$X`) : plus de « Arrêt en cours ». Noter le délai entre la réinitialisation et la bannière dans le journal série.
28. Relever dans le journal série, broche commandée en `M3` puis en `M4` (broche débranchée, à l'arrêt), si les rapports portent `A:S` puis `A:C`, et à quelle fréquence (souvent seulement avec `Ov:`). Si la carte n'envoie jamais `A:`, noter « A: absent » : la protection du sens rapporté (quatrième tour) n'agit pas sur ce binaire ; celles du `$G` et de `FS:` restent.

Le stationnement du firmware (`0x84`) n'est pas employé par F2 ; il n'est pas à essayer dans cette séance.
