# N1 — Analyse du fichier avant de démarrer

Nuit du 26 novembre 2026, arbre `cncjs-wt/N1`, branche `feat/N1`, base `0acd1c3b`
(`feat/nuit-2026-11-26`). Rien d'installé, aucun accès à la tablette, à la RT ni à la CNC.

Trois avertissements d'affichage. Aucun ne bloque le départ, ne change le fichier envoyé,
n'ajoute une pause ni n'envoie quoi que ce soit à la machine. Les gardes existantes
(course, zéro pièce, origine machine) sont inchangées.

## Ce que l'opérateur voit

Sur **2 · Fichier** (ligne du verdict, à droite) et sur **4 · Contrôle** (à côté de
« Détails du contrôle ») : un bouton **« Analyse du fichier… »**. Quand il y a de quoi
s'inquiéter, le bouton devient ambre et dit **« ! 1 avertissement »** ou
« ! 2 avertissements ». Il ouvre un volet en trois parties.

1. **Profondeur et brut.** « Le fichier descend à 20 mm sous le zéro Z. » Un champ
   « Épaisseur du brut » (pavé numérique de la page, 0,1 à 300 mm) et deux choix :
   « Zéro Z sur le dessus du brut » (par défaut) ou « Zéro Z sur le martyr ».
   - Dessus du brut, épaisseur saisie : « ! La fraise descend 2 mm sous le brut : elle
     touchera le martyr. », « La fraise arrive juste au fond du brut. » ou « ✓ Il reste
     5,5 mm de matière sous la fraise. »
   - Martyr : « ! La fraise descend 1,5 mm dans le martyr. », « La fraise arrive juste sur
     le martyr. » ou « ✓ Il reste 0,5 mm de matière sous la fraise. »
   - Sans épaisseur : « Saisissez l'épaisseur du brut pour la comparer. », sans couleur
     d'alerte et sans compter comme avertissement.
   - Sous le résultat, l'hypothèse : « Calcul valable si le zéro Z est posé sur le dessus
     du brut. » (ou « sur le martyr »).
   L'épaisseur et le choix sont gardés **par fichier**, sur cette tablette (40 fichiers au
   plus, les plus anciens sortent). Un autre fichier ne reprend jamais l'épaisseur d'un
   autre. Une saisie illisible ou hors limites ne remplace pas la valeur précédente.
2. **Fraises du fichier.** Une ligne par fraise : numéro, description écrite dans le
   fichier, ligne du premier usage (« T1 · D=3.175 CR=0. - flat end mill · ligne 11 »),
   ou « annoncée ligne 2 » quand le fichier la décrit sans l'appeler. Puis
   « Changements de fraise demandés : 2. » s'il y en a. Rien trouvé : « Le fichier
   n'indique pas sa fraise. » Huit lignes au plus, 60 caractères par description ; au-delà :
   « Liste abrégée : le fichier en nomme davantage. »
3. **Montée en vitesse de la broche.** Le temps entre le démarrage de la broche et le
   début de la première descente dans la matière, comparé au « Temps voulu » (3 s par
   défaut, réglable de 0,5 à 30 s, gardé sur cette tablette).
   - Trop court : « ! La broche n'a que 1,1 s pour monter en vitesse. » et le remède :
     « Ajoutez une temporisation après le démarrage de la broche, dans le
     post-processeur. », avec les deux lignes du fichier.
   - Assez : « ✓ 4,1 s entre le démarrage de la broche et la première descente. », et
     « Dont 3 s de temporisation. » quand le fichier en contient une.
   - Le fichier descend sans avoir démarré la broche : « ! Le fichier ne démarre pas la
     broche avant de descendre (ligne 4). » (compte comme avertissement).
   - Non calculable : « Temps de montée en vitesse non calculé pour ce fichier. »,
     jamais « correct ».
   - Broche démarrée avant les premiers déplacements (cas des fichiers Fusion 360) :
     le trajet d'approche dépend de l'endroit où est la fraise au départ. Si ce qui est
     calculable suffit : « Au moins 5 s… ». Sinon : « Au moins 0,7 s, plus le trajet
     d'approche : non calculé. », sans avertissement.

En bas du volet : « Ces avertissements n'empêchent pas de démarrer. »

Laser (RT) : les deux boutons n'apparaissent pas (ni brut, ni fraise, ni broche). La page
de simulation n'est pas modifiée.

## Choix faits sans l'opérateur (au plus prudent)

| Sujet | Choix | Pourquoi |
|---|---|---|
| Où calculer | Le serveur étend `program-check.js` (fraises, temps de broche, profondeur déjà connue) ; la page compare à l'épaisseur et au temps voulu. | L'épaisseur et le seuil sont des données d'affichage de la tablette : aucune nouvelle requête, aucun réglage serveur. |
| Place à l'écran | Un bouton par écran et un volet, pas de nouvelle ligne. | À 1366 × 768 la carte « Verdict » de 4 · Contrôle n'avait que 34 px de libre : une phrase de plus poussait « Détails du contrôle » hors de la carte (vu au navigateur). Les phrases sont dans le volet et dans le nom accessible du bouton. |
| « Première entrée dans la matière » | Le premier mouvement qui finit sous le zéro Z, **ou** le premier mouvement d'usinage (G1/G2/G3) qui descend, ou dont la hauteur n'est pas connue. Le temps est compté jusqu'au **début** de ce mouvement. | Couvre les deux lectures du zéro Z (dessus du brut, martyr). On prend le plus tôt : le temps affiché n'est jamais trop long. |
| Démarrage de la broche | Le dernier `M3` / `M4` **ou le dernier changement de consigne `S`** en vigueur à l'entrée, le plus tardif des deux (un `M5` avant l'entrée annule tout). Consigne `S0` à l'entrée : « ne démarre pas la broche ». `M3` sans aucun `S` dans le fichier : « non calculé » (la consigne est celle de la machine). | La broche ne tourne à son régime qu'à partir de sa dernière consigne : compter depuis un `M3` sans vitesse, ou depuis un démarrage lent, donnait un « ✓ » faux (constat de relecture). |
| Modèle de durée | Celui de P5 (`program-time.js`), dans un cumul à part : **rapides à 100 %, avance à 100 %** (ou à la valeur lue au chargement si elle dépasse 100 %), quelles que soient les corrections lues au chargement. Il ignore les accélérations : le temps réel est un peu plus long. | L'opérateur peut remettre les rapides à 100 % sur 4 · Contrôle après le chargement : le temps affiché ne doit pas dépendre d'un ralentissement qui peut disparaître. La durée du programme (P5), elle, suit toujours les corrections réelles. |
| Fichier non suivi jusqu'à l'entrée (`M6`, `M0`, `G53`, palpage, macro, mode inverse du temps, unités ou mode laissés à une machine inconnue, vitesses maximales non lues) | « non calculé ». | Exigence du lot : jamais « correct » sans calcul. |
| Seuil | Dans le volet lui-même (« Temps voulu »), pas dans Réglages. | Un seul endroit à apprendre, aucun fichier partagé de plus. |
| Descente sans broche | Avertissement. | Sur cette machine la broche est commandée par le fichier ; une descente sans `M3` casse une fraise. Avec une broche à interrupteur, le texte dit quoi faire. |
| Laser | Rien d'affiché. | Sans objet, et la RT ne doit rien perdre ni gagner d'inattendu. |

## Fichiers touchés

| Fichier | Zone |
|---|---|
| `src/server/services/touch/program-check.js` | `analyzeProgram` : relevé des fraises (mots `T`, `M6`, commentaires d'outil), repère de temps au démarrage de la broche et à la première entrée. `checkProgram` : deux champs de plus en sortie, `tools` et `spinUp`. Verdicts, raisons, `blocking`, `overridable` : inchangés. |
| `src/server/services/touch/program-time.js` | `mark()` : lecture du cumul en cours (3 lignes). |
| `src/server/services/touch/job-load.js` | `checkFile` : le profil de durée d'affichage est passé à l'analyse (avant, seul le fichier chargé l'avait). |
| **Partagé** `src/server/services/touch/job-service.js` | Une ligne, `machineForCheck` : `feedMode` ajouté à l'état modal donné au contrôle. |
| `examples/cncjs-touch/touch/program-analysis.js` | Nouveau : calculs d'affichage, boutons, volet. |
| `examples/cncjs-touch/touch/check-screen.js` | 5 lignes : événement `cnc-file-check` et `cncCheckScreen.selection()`. |
| **Partagé** `touch/index.html` | Une balise `<script>` après `check-screen.js`. |
| **Partagé** `touch/files-touch.css` | Bloc N1 en fin de fichier. |
| **Partagé** `touch/i18n-messages.js` | Bloc N1 en fin de fichier : 40 lignes FR / EN / ES. |
| **Partagé** `verify-project.cjs` | `'program-analysis'` en fin de liste. |
| Tests | `__tests__/program-analysis.test.js` (nouveau), deux cas N1 dans `__tests__/job-service.test.js`, `test-program-analysis.cjs` (nouveau). |

Commentaires d'outil reconnus : `(T1 D=6. … )` (Fusion 360), `(T1=6mm_Endmill)` et
`(Begin operation: TC: …)` (FreeCAD), `(Tool 1 = …)`, `; Tool: …`, `(Tool Number: 3)`,
`;Werkzeug 1: …`, `;Outil 1: …`, `(TOOL/MILL,…)`. Seule la forme Fusion 360 est vérifiée
sur un vrai fichier (corpus `20-fusion360-grbl.nc`) ; les autres viennent de la lecture
des post-processeurs, sans fichier réel sous la main.

## Tests

- `program-analysis.test.js`, 28 cas : formes de commentaires, mots `T` et `M6` lus dans
  le code seulement, commentaires voisins qui ne sont pas des fraises, texte gardé tel
  quel sans caractère de contrôle et borné, ligne de 6 Mo non parcourue, **500 000 lignes
  nommant chacune une fraise** (liste de 8, moins de 2 Ko) ; temps de broche (départ type
  Vectric, **corrections au chargement sans effet sur le temps** (rapides 25 %, avance
  50 % et 150 %), **consigne `S` après le `M3`, `M3 S0`, démarrage lent puis régime,
  `S0`, `M3` sans `S`**, temporisation, `M4`, arrêt puis redémarrage, toutes les formes d'entrée,
  borne basse Fusion 360, pas de démarrage, pas d'entrée, onze cas « non calculé »,
  mode d'avance hérité, laser) ; aucun effet sur le verdict, les raisons, `blocking` ni
  la durée.
- `job-service.test.js`, 2 cas N1 : l'action `check` et l'état du fichier chargé portent
  `tools` et `spinUp`, aucune commande envoyée ; le mode d'avance de la machine décide.
  Les deux échouent sans les deux modifications du service (vérifié en les retirant).
- `test-program-analysis.cjs` : les trois calculs de la page (arrondis, seuil, données
  absentes ou malformées), la mémoire par fichier (bornée, stockage illisible ou refusé),
  FR / EN / ES, puis la page réelle dans le banc : boutons, volet, saisie, texte du
  fichier jamais interprété comme balise, réponse en retard d'un autre fichier ignorée,
  laser, « Démarrer l'usinage… » jamais désactivé, aucun appel de commande.

## Vérifications du § 3.5

Lancées depuis l'arbre `cncjs-wt/N1` le 26 novembre, après le dernier changement de code.

| Vérification | Résultat |
|---|---|
| `node examples/cncjs-touch/verify-project.cjs` | « 232/232 contrôles réussis. Aucun essai matériel. », sortie 0 (dont `test-program-analysis.cjs`). |
| `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false` | 58 suites réussies sur 58, 1 808 tests réussis sur 1 808, sortie 0 (relancé après la correction de relecture). |
| ESLint sur les fichiers serveur touchés et leurs tests | Aucune erreur, aucun avertissement. Les fichiers de la page (`touch/*.js`, `test-*.cjs`) passés à ESLint ne donnent rien non plus. |
| `node examples/cncjs-touch/browser-run.cjs --strict --only responsive,sim,screens,small` (deux passes) | Sortie 1 avec **cinq défauts, tous dans `HARNAIS-CONNU.md`** : les deux « comparison squeezed into a side column » (bibliothèque 1920 × 1080 v2), « screens: timeout: library not followed », et les deux mots coupés de Suivi en alarme à 1366 × 768 (« Reprendre », « Reanudar »). Aucun autre défaut. |

Après la correction de relecture (temps de broche : corrections de vitesse et consigne
`S`, serveur seul) : `verify-project`, Jest et ESLint relancés (résultats ci-dessus) ; le
harnais navigateur et la mesure de temps d'analyse ci-dessous **n'ont pas été relancés**
(la page n'est pas modifiée ; le second cumul ne tourne que jusqu'à la première descente).

Étapes du harnais non lancées : `measure`, `settings`, `startup`, `e2e`, `strip`, `v2`, `rail`
(le lot ne touche ni Suivi, ni les réglages, ni le démarrage ; la v2 Performance n'a pas été
mesurée avec le bouton). L'étape `screens` s'arrête sur son défaut connu (« library not
followed ») : ce qu'elle mesure après ce point ne l'a donc pas été, comme sur la base.

## Temps d'analyse et mémoire, avant / après

Mesure hors ligne sur le PC (Node, cinq processus neufs par version, alternés ; GC
explicite avant et après ; le harnais navigateur tournait en même temps, donc les valeurs
absolues sont pessimistes, l'écart reste comparable). « Avant » = base `0acd1c3b`,
« après » = cette branche. Fichiers de 500 000 lignes `G1`.

| Fichier | Analyse avant (médiane) | Analyse après | Mémoire gardée après GC | Pic RSS | Résultat `tools` |
|---|---|---|---|---|---|
| Sans commentaire (9 Mo, cas P5) | 1 118 ms | 1 151 ms (+3 %) | 0,19 → 0,20 Mio | 71 → 71 Mio | 59 octets |
| Un commentaire de fraise **différent** sur chaque ligne (34 Mo, pire cas) | 1 240 ms | 1 893 ms (+53 %) | 0,19 → 0,23 Mio | 119 → 119 Mio | 722 octets (8 lignes, « abrégée ») |

Le pire cas (500 000 commentaires d'outil) n'existe pas dans un vrai fichier ; il coûte
0,65 s de plus sur le PC, sans mémoire de plus. Sur la tablette (non mesurée) l'ordre de
grandeur du rapport P5 s'applique : plusieurs fois plus lent que le PC, dans les deux cas.
Le test Jest « 500 000 lignes » vérifie la borne de la liste (8 lignes, moins de 2 Ko), pas
le temps.

## Limites

- Le temps de broche n'est calculé que si le modèle de durée suit le fichier jusqu'à la
  première descente. Un fichier avec `M6`, `M0` ou un `G53` avant la descente donne
  « non calculé » : c'est le cas de beaucoup de post-processeurs autres que Grbl.
- Broche démarrée avant le premier déplacement : borne basse seulement (le trajet
  d'approche n'est pas compté).
- Le temps affiché est calculé à rapides 100 % et avance 100 % (ou plus si l'avance lue
  au chargement dépasse 100 %). Avec des rapides ralentis, le temps réel est plus long que
  l'affiché. Seul cas où il serait plus court : l'opérateur monte l'avance au-dessus de
  100 % **après** le chargement et le fichier fait un mouvement d'usinage à plat entre le
  démarrage de la broche et la descente (rare ; les rapides ne sont pas concernés).
- Une consigne `S` qui change après le démarrage (même à la baisse) fait repartir le
  compte ; un `M3` répété aussi. Le temps affiché peut donc être plus court que le vrai,
  jamais plus long pour cette raison.
- `M3` sans aucun `S` dans le fichier (broche à relais, vitesse au variateur) : « non
  calculé », alors que la broche démarre bien au `M3` sur une telle machine.
- La comparaison au brut repose sur l'hypothèse choisie par l'opérateur. La page ne sait
  pas où est le vrai dessus de la pièce.
- Un fichier où `Z` n'est pas suivi (palpage, changement de zéro) : « Profondeur non
  calculée pour ce fichier. »
- Estlcam liste ses fraises sous une ligne « Required tools: » sans mot-clé par ligne :
  non reconnu. Le post Grbl de Vectric, de mémoire, n'écrit que `T1` sans commentaire :
  la liste donnerait alors seulement « T1 · ligne 1 » (à constater à l'essai, N1-6).
- L'épaisseur est gardée dans le navigateur de la tablette : une autre tablette ne la
  connaît pas.
- À 1366 × 768, le volet défile (805 px de contenu pour 646 px) ; à 1366 × 911 il tient
  entier (mesuré au navigateur, page réelle, données injectées).

## Non vérifié

- Tablette, RT, CNC : rien. Le temps de montée réel de la broche LUNYEE n'est pas connu ;
  3 s est une valeur de départ.
- Les fichiers Vectric réels de l'opérateur : le cas type est reconstruit à la main dans
  les tests, pas lu depuis un de ses fichiers.
- Rendu : vu au navigateur du PC (Chromium récent) à 1366 × 768 et 1366 × 911, thème
  « Métal d'atelier », en français, avec un état machine injecté dans la page. Pas vu en
  anglais ni en espagnol à l'écran, pas vu en v2 Performance ni en grand texte hors
  harnais.
- Chromium 106 (RT) : le code reste en ES2017 sans API récente, mais n'a pas tourné sur
  ce navigateur.

## Essai réel proposé

Voir `../refonte/PROTOCOLE-ESSAI.md`, section « N1 — Analyse du fichier ».
