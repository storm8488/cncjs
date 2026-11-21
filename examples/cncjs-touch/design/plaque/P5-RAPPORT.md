# P5 — Durée des gros fichiers

Travail du 21 novembre 2026 dans `cncjs-wt/P5`, branche `feat/P5`, base
`caf09b312c2c946c78f836bb518fb8dd17d36ece`. Aucun commit, installation,
accès matériel ni accès réseau extérieur.

## Réalisation

- Suppression du plafond de 20 000 mouvements du modèle de durée.
- Lecture du texte ligne par ligne, avec la même numérotation des lignes non
  vides que le sender. Plus de tableau de 500 000 lignes dans cette analyse.
- Somme des durées pendant cette lecture : points cumulatifs par tranches de
  1 024 lignes, au plus 1 024 points. Au-delà, fusion des tranches par deux,
  sans modifier les sommes ni arrondir les durées.
- Conservation d'au plus trois mouvements dépendant de la position initiale,
  résolus avec les coordonnées du départ. Les autres mouvements sont jetés
  immédiatement après leur contribution au cumul.
- Profil de vitesses maximales et corrections copié au chargement. Au départ,
  profil identique : lecture du dernier cumul et des trois approches au plus.
  Profil changé ou inconnu au chargement : reconstruction depuis le texte exact,
  déjà conservé par le sender. Seule une référence au texte est conservée,
  sans copie des caractères ni stockage de tous les mouvements.
- Calculs existants conservés : longueur 3D, avances modales, pouces, rapides,
  plafonds par axe, arcs XY et hélices connus, temporisations, fin M2/M30.
- G93 en déplacement, arc inconnu, palpage, M6/M0, changement de repère ou syntaxe
  inconnue restent sans estimation. La barre en lignes existante reste le recours.
- Le suivi temporel reste celui de `createRunTime` : pause, coupure de rapports,
  corrections pendant le travail, estimation épuisée et fin constatée conservent
  leurs règles. Aucun compteur d'acquittement n'est assimilé à du temps usiné.

Les agrégats n'interviennent dans aucun verdict de course, ticket ou garde de
commande. Aucun octet Grbl ajouté ou modifié. Aucune page ou chaîne visible
modifiée : FR/EN/ES et priorité de la barre temporelle existante sont conservés.

## Mesures avant / après

Script reproductible : `examples/cncjs-touch/measure-program-time.cjs`.
Les valeurs complètes sont dans `P5-MESURES.json` ; les fichiers de travail et
le G-code généré sont dans `output/P5/`, ignoré par Git.

Entrée physique de **8 939 924 octets**, en LF : une ligne
`G21 G90 G94 F600`, puis **500 000 lignes G1 3D**. Pour la ligne d'indice i :
X = i modulo 401, Y = 7i modulo 71, Z = −(i modulo 200)/10.
SHA-256 : `9390001df60d094f41c4effa57b83c742a268e2d5be14a3b83a6ba5ac8e06649`.
Contexte : X/Y/Z au départ = 0, vitesses maximales 4000/4000/800 mm/min,
corrections 100 %, G54 et décalage prouvé.

PC : Intel Core i7-13700KF, 24 processeurs logiques, Windows, Node v26.13.0.
Trois processus neufs par version, GC explicite avant analyse et après mesure.
Le temps de génération, la lecture disque et le chargement des modules sont
hors temps d'analyse. Médianes des trois mesures :

| Indicateur | Avant | Après |
|---|---:|---:|
| Analyse | 953,29 ms | 1 102,68 ms |
| Évaluation de durée au départ, profil identique | 0,085 ms, refus | 0,115 ms |
| Pic RSS du processus entier | 162,20 Mio | 73,04 Mio |
| Tas en fin d'analyse, avant GC (pas un pic) | 64,34 Mio | 7,19 Mio |
| Supplément de tas retenu après GC | 0,1345 Mio | 0,1891 Mio |
| Modèle sérialisable | 40 octets, indisponible | 21 835 octets, 489 blocs |
| Durée calculée | indisponible | 685 819,948 s |

Le coût d'analyse augmente de **15,7 %** ; le pic RSS diminue de **55,0 %**.
L'ancienne version libérait son modèle après le plafond : la hausse d'environ
56 Kio du tas retenu correspond donc à une fonctionnalité désormais disponible.
Le RSS mesure tout le processus, pas seulement les agrégats. Le G-code chargé
et les métadonnées existantes de contrôle des courses restent hors de la borne
de 1 024 points du modèle temporel.

Les trois analyses passent de 946–1 001 ms à 1 099–1 121 ms ; le pic RSS passe
de 161,45–162,22 Mio à 72,92–73,11 Mio. La durée a été recoupée dans Jest avec
une somme numérique indépendante sur les 500 000 points.

Une reconstruction après changement de profil a également été mesurée :
1 097 / 1 662 / 2 615 ms, corrections alternées 50/100/50 %, **pendant les suites
de tests**. Ce sont des observations avec contention, pas des mesures isolées.
Elle reste une analyse complète ; les départs à profil inchangé n'en paient
pas le coût. Le résultat passe bien de 685 819,948 à 1 371 639,896 s à 50 %.

Pour reproduire sur la version voulue, sans installation :

```text
node examples/cncjs-touch/measure-program-time.cjs measurement
```

### Extrapolation Surface Pro 3

Aucune mesure de la tablette n'est disponible. À titre de sensibilité, si son
analyse est 3 à 5 fois plus lente que celle du PC, les 1,10 s deviennent
**3,3 à 5,5 s**, contre 2,9 à 4,8 s avant. Ce facteur est une hypothèse, pas
un rapport de performances mesuré. La reconstruction d'un profil changé peut
ajouter une attente comparable ou supérieure au départ.

Pendant le suivi normal, le modèle n'est plus parcouru : le chronomètre et les
champs d'état restent de taille constante. Les 489 agrégats ne sont pas envoyés
à la page. L'analyse serveur reste synchrone au chargement, et lors d'une
reconstruction exceptionnelle au départ : la réactivité du serveur pendant
cette attente et la fluidité tactile sur Surface restent **à mesurer**. Ces
mesures PC ne prouvent pas à elles seules la fluidité sur la tablette.

## Vérification

- `node examples/cncjs-touch/verify-project.cjs` : **230/230 contrôles réussis**.
- `npx.cmd --no-install jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false --runInBand` : **57/57 suites, 1 775/1 775 tests réussis**, 188,625 s.
- ESLint des quatre fichiers serveur, des deux fichiers de tests et du script
  de mesure : **zéro erreur, zéro avertissement**.
- `git diff --check` et contrôle des fins de ligne LF.
- Comparaison différentielle avec les modules d'origine lus par `git show` :
  **160 programmes**, zéro différence d'analyse hors timing, de verdict de
  course ou de durée disponible. Cas déterministes : vitesses et corrections
  variées, temporisations, relatifs, lignes vides/CRLF, G93, M6 et arcs impossibles.
- Tests nouveaux : 500 000 mouvements et somme indépendante, compaction jusqu'à
  4 096 001 lignes logiques, approche initiale bornée, refus après gros préfixe,
  profil changé et réglages absents au chargement, numérotation, intégration du
  suivi d'un gros fichier au service à 100 et 50 % sans nouvelles commandes.
- Le test existant qui exigeait le refus à 20 001 mouvements exige maintenant
  une durée disponible et un modèle borné. Ses assertions d'indépendance du
  contrôle de course sont conservées. La mesure d'origine prouve le refus
  des 500 000 mouvements avant le correctif.

PowerShell bloque `npx.ps1` sur ce PC : utilisation de `npx.cmd`, sans changer
la politique d'exécution et sans installation. Premier passage complet :
un test d'intégration nouveau avait oublié le plafond Z de 200 mm/min du faux
contrôleur ; attente corrigée pour prendre ce plafond en compte, sans modifier
le code de durée ni retirer d'assertion.

## Fichiers et réunion des lots

| Fichier | Zone modifiée |
|---|---|
| `src/server/services/touch/program-time.js` | Profil, accumulation bornée, calcul du total ; `createRunTime` inchangé. |
| `src/server/services/touch/program-check.js` | Itérateur de lignes, raccordement du timing dans l'analyse, référence de reconstruction ; comparateur `checkProgram` inchangé. |
| `src/server/services/touch/job-load.js` | Ligne 256 : profil temporel passé à l'analyse du programme exact chargé. |
| **Partagé : `src/server/services/touch/job-service.js`** | Lignes 1843–1844, dans l'objet de dépendances de `createLoader`, près de `machineForCheck` : commentaire et fournisseur du profil d'affichage. |
| `src/server/services/touch/__tests__/program-time.test.js` | Tests de durée et de mémoire bornée. |
| `src/server/services/touch/__tests__/job-service.test.js` | Deux cas P5 regroupés au début de la section de suivi sans aperçu. |
| `examples/cncjs-touch/measure-program-time.cjs` | Nouveau banc hors ligne, fichier synthétique et trois processus isolés. |
| `examples/cncjs-touch/design/plaque/P5-MESURES.json` | Mesures brutes et résultat de comparaison. |
| `examples/cncjs-touch/design/plaque/P5-RAPPORT.md` | Présent rapport. |

Aucun autre fichier partagé (`index.html`, i18n, CSS, `verify-project.cjs`,
`browser-run.cjs`) modifié. Le prompt non suivi déjà présent est laissé intact.
`node_modules` reste son lien d'origine. Rien n'est ajouté à l'index Git.

## Non vérifié

- Tablette, RT, CNC réelle, temps d'usinage et fidélité physique de l'estimation
  sans accélérations, échanges et pauses manuelles.
- Fluidité tactile, temps de réponse du serveur sur Surface et consommation
  mémoire du processus CNCjs complet avec son sender et son aperçu.
- Harnais navigateur strict : aucune page modifiée ; les bancs de page inclus
  dans les 230 contrôles ont été exécutés, pas un essai dans un navigateur réel.
- Relecture croisée Sonnet prévue par le chantier, réunion des lots et essai
  matériel : restent au pilote. Ce compte rendu ne vaut pas validation matérielle.
