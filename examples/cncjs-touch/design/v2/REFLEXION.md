# Jusqu'où exploiter la Surface Pro 3 ? — Performance v2

Étude et maquettes locales, 6 novembre 2026. Sources examinées en lecture seule dans `C:\Users\damou\Documents\claude\cncjs\examples\cncjs-touch\`. Aucun changement de CNCjs, aucun accès à une machine et aucune mesure nouvelle sur la tablette dans ce travail.

La Surface Pro 3 a encore de la marge pour **mieux comprendre le travail en cours**, examiner un détail sans perdre le contexte et préparer une origine avec moins d'allers-retours. Le bénéfice principal n'est plus d'obtenir une rotation fluide : c'est déjà mesuré. Il est de rendre cette fluidité utile, en conservant des commandes stables et en distinguant ce que Grbl rapporte, ce que le programme prévoit et ce que l'interface estime.

## 1. Le point de départ réel

### Ce qui existe déjà

Le mode Performance actuel possède déjà le rendu matériel avec anticrénelage et DPR plafonné à 2, la géométrie complète chargée au repos, la 3D pendant le travail, la coloration des lignes acquittées, le repère d'outil interpolé, « Suivre l'outil », les instruments de temps/avance/corrections, l'origine visuelle XY et les écrans conservés en mémoire de mise en page. Une v2 qui se limiterait à ces éléments renommerait l'existant.

Sources principales : `PROFILES.md:51–68`, `PERFORMANCE-UI-SPEC.md:80–291`, `touch/preview-gl.js`, `touch/preview-3d.js`, `touch/job-dashboard.js:320–425`, `touch/origin-preview.js`, `touch/ui-2027.css:619–629`.

Les maquettes fournies `performance-suivi.html`, `performance-fichiers.html`, `performance-preparer.html` et leurs jetons sont la référence visuelle. Le code effectif tranche quand il diffère d'une intention de maquette. Exemple utile : la courbe de la dernière minute est construite dans `job-dashboard.js:347–354`, mais `responsive.css:221–224` ne l'affiche qu'en trois zones. Or ces trois zones commencent à **1600 px CSS** (`job-dashboard.js:326,358`). **À 1366 × 911, la courbe est donc cachée.** Les corrections restent sous la vue (`:381`), et prennent une partie de sa hauteur.

### Décisions du § 13 qui restent le socle

La spécification contient deux titres numérotés 13 ; la liste « Décisions de l'utilisateur », lignes 650–668, prévaut sur les questions antérieures.

| Décision acquise | Conséquence pour v2 |
| --- | --- |
| Échelle 1,58 ; 1366 × 911 CSS | On agrandit et hiérarchise les zones ; on ne réduit pas le texte pour obtenir davantage de cases. |
| Vue + colonne double à cette largeur | On conserve deux colonnes, avec instruments puis commandes à droite. |
| Probe au démarrage en Performance, y compris RT | La v2 réutilise le résultat existant ; elle n'ajoute pas une nouvelle détection sur RT. |
| Pas de déplacement des commandes après perte du GPU | Repli dans le même rectangle ; aucun changement de grille pendant le travail. |
| Suivre l'outil inactif et non mémorisé | Vue d'ensemble au départ ; activation explicite et purement visuelle. |
| Origine hypothétique XY seulement | Z conserve l'origine actuelle ; « Z non vérifié » reste visible. |
| Plafond de conception 500 000 segments, cache unique | Aucun relèvement automatique ; pas de lecture complète du programme pendant un travail. |
| CNC seulement ; laser 2D conservé | Aucune extension implicite de la 3D en direct au laser. |
| Pas d'origine visuelle dans la simulation existante | La maquette Préparer est une illustration autonome, pas une modification de `simulation.html`. |
| Courbe oui ; texte G-code de la ligne non | Une frise éventuelle utilise des métadonnées préparées au repos ; aucune ligne acquittée présentée comme ligne usinée. |
| WebGL1, `gl.lineWidth`, cache selon mesures | Aucun framework graphique ni nécessité de migrer vers WebGL2. |
| Pas de forçage GPU livré | Les éventuels crochets du harnais restent extérieurs au produit. |
| `$23` peut rendre la course non vérifiable | Jamais de verdict vert obtenu en devinant la convention d'origine machine. |
| Catalogue d'origine chargé aussi en Éco | Exception existante conservée ; aucun module lourd v2 demandé sur RT/Éco. |

## 2. Diagnostic chiffré : la marge, et ses limites

### Rendu et calcul

| Élément | Ce que l'on sait | Ce que cela autorise — et ne prouve pas |
| --- | --- | --- |
| Rotation | Environ 60 images/s, y compris un programme de 160 000 **lignes**, géométrie complète, DPR 1,58 | Une scène lisible et quelques incrustations sont crédibles. On ne connaît pas encore le coût d'une accumulation de fonctions pendant un usinage réel. |
| Redessin complet | 0,4–1 ms en régime établi ; créneau à 60 Hz ≈16,7 ms | Le dessin mesuré occupe environ **2,4–6 %** d'un créneau, laissant **15,7–16,3 ms de marge apparente**. Ce n'est ni « 94 % de CPU libre » ni une mesure d'occupation GPU : événements, style, composition, serveur et ordonnanceur partagent le temps. |
| Ouverture Suivi | 76–131 ms jusqu'à la première image | Déjà rapide ; priorité à préserver cette latence et l'état de la caméra. Une animation de transition de 300 ms ferait perdre davantage que quelques millisecondes gagnées au chargement. |
| Géométrie complète | 0,3–0,6 s selon les programmes mesurés | Préparer au repos, afficher aussitôt la géométrie simplifiée, puis remplacer à cadrage constant. Ne pas bloquer une interaction pendant ce calcul. |
| Mémoire JS | Environ 5–8 Mo dans les observations fournies ; retour à 4,8 Mo en Éco documenté | Ce n'est pas la mémoire du navigateur, des workers, des tampons natifs ou du GPU. Les 4 Go de RAM ne justifient pas des caches sans limite. |
| Tampons de lignes | Le code alloue environ **56 octets par segment** pour les tableaux de rendu (`preview-gl.js:301–318`) | 160 000 **segments** ≈8,96 Mo ; 500 000 ≈28 Mo, hors géométrie source, copies, contexte et framebuffer. Le calcul historique de 40 octets/segment de la spécification n'est pas un budget mémoire total. Lignes et segments ne sont pas interchangeables, particulièrement avec les arcs. |
| CPU | i5 2 cœurs/4 fils ; CNCjs sur la même tablette | Le rendu est rapide, mais toute longue tâche JavaScript peut retarder l'affichage des rapports et la réponse tactile. Le serveur doit garder sa marge. |

Les résultats matériels précis sont dans `PROFILES.md:61` : **mesures sans contrôleur**. La vue en direct pendant un travail réel et l'origine avec programme chargé y sont explicitement non mesurées. Les mesures fournies par la mission étendent le diagnostic, sans transformer cette limite en validation physique.

Le GPU est déjà correctement utilisé pour les lignes : buffers statiques, progression par uniforme, traits différenciés, anticrénelage, fondu de profondeur et cadence par `requestAnimationFrame` (`preview-gl.js:285,334–398,581–608,652–667`). Le moteur reste WebGL1 malgré une sonde capable de détecter WebGL2. Le travail utile est surtout dans la **sélection de l'information et les calculs autour de la scène**.

Un point à profiler est la recherche des limites de passe dans `passOf`/`passRange` : des parcours de grande taille peuvent encore être parcourus en O(n) par image (`preview-gl.js:1000–1012,1023–1027`). Ce n'est pas un défaut de cadence prouvé par les mesures disponibles. C'est une raison de pré-calculer les limites au repos et de vérifier les invalidations lors des changements de filtres/géométrie, avant de multiplier les incrustations.

### Résolution et surface réellement utile

- La dalle contient **3 110 400 pixels physiques** ; la page, **1 244 426 pixels CSS**. Le rapport est d'environ **2,50**. Ces pixels supplémentaires servent déjà à la netteté du canvas et du texte. Ils ne sont pas 2,5 fois plus de place pour des boutons.
- À largeur égale, 911 px de hauteur contre 768 donnent **143 px CSS de plus, soit +18,6 %**. C'est une bande utile pour une courbe, un contexte de programme et de meilleures séparations.
- À 216 ppp et échelle 1,58 : 16 px CSS ≈**3,0 mm**, 48 px ≈**8,9 mm**, 64 px ≈**11,9 mm**. Le minimum de 16 px reste un minimum ; un opérateur à 70 cm doit lire surtout des valeurs de 28–40 px et des intitulés de 18–20 px.
- La vue de l'agencement actuel à deux colonnes est de l'ordre de 710 px de large dans la spécification. Les corrections placées dessous lui prennent de la hauteur. La v2 proposée donne une **carte de scène de 798 × 723 px CSS**, pas un canvas intégral de cette taille : ses barres et légendes consomment une partie de ce rectangle. Le gain de largeur théorique par rapport à 710 px est **+12,4 %**. Il doit être comparé au rectangle effectivement relevé dans le navigateur, pas déclaré comme un gain mesuré.

Le budget de la maquette est explicite : bandeau 80 px pour loger des cibles de 64 px avec 8 px de marge ; rail 88 px ; marges principales 16 px ; titre 64 px puis intervalle 12 px. Largeur utile : `1366 − 88 − 32 = 1246` ; colonnes `798 + 16 + 432 = 1246`. Hauteur utile sous bandeau et marges : `911 − 80 − 32 = 799` ; scène `799 − 64 − 12 = 723`. Le bandeau gagne 8 px sur la référence de 72 px, en échange de marges tactiles explicites. Cette modification demande une validation des couches et des gestes, pas seulement une capture d'écran.

### Informations et interactions encore sous-exploitées

Les sources des chiffres sont présentes mais dispersées. Pour savoir si un chiffre est actuel, une estimation ou une ligne tamponnée, l'opérateur doit lire une longue note ou rapprocher plusieurs blocs. La scène possède beaucoup de pixels mais son sens reste facilement ambigu : orange ne veut pas dire matière retirée ; le marqueur est une position rapportée/interpolée ; le brut et les brides viennent de déclarations.

L'inspection détaillée impose aujourd'hui davantage de changement de contexte : le clic dans une vue inline ne fait pas la même inspection que la vue agrandie (`preview-gl.js:741–743`). Une loupe locale explicite peut conserver le direct et l'ensemble de la pièce. Le stylet est une entrée supplémentaire disponible, mais il ne doit pas devenir nécessaire : doigt, boutons et stylet aboutissent aux mêmes fonctions de lecture.

Les prochaines pauses ou changements d'outil connus, les différences entre fichier sélectionné et programme chargé, et les événements autour d'une chute d'avance sont surtout des informations à rapprocher. La résolution et le GPU rendent leur présentation simultanée confortable ; ils ne créent pas des capteurs absents.

## 3. Ce qu'il ne faut pas faire

1. **Une simulation de matière ou un anti-collision implicite.** Le parcours nominal ne connaît ni fixation réelle, ni faux-rond, ni flexion, ni diamètre effectif, ni position certaine de la pièce. Un solide « usiné » photoréaliste donnerait une preuve que l'on n'a pas.
2. **Des effets permanents.** Reflets, ombres dynamiques, particules de copeaux, profondeur de champ et rotations décoratives consomment le budget sans aider à une décision. Pas de boucle de rendu continue quand rien ne change.
3. **Des textures dimensionnées à la capacité maximale.** Une texture RGBA de 16 384² représente environ **1 Gio** avant copies et accessoires. « Textures 16k » signifie une limite du pilote, pas une taille à utiliser.
4. **Un tableau de bord de bureau miniaturisé.** Dix petits cadrans, texte 12 px, boutons à icône seule, glissières fines et survols indispensables sont inadaptés. Le stylet ne dispense jamais des cibles tactiles.
5. **Une baisse d'échelle du kiosque pour faire rentrer les panneaux.** La décision 1,58 est maintenue. Pas de `transform:scale()` dans le produit pour masquer un problème de mise en page.
6. **Deux scènes GPU permanentes.** Vue globale + gros plan doit partager le même moteur et être rendue à la demande ; la comparaison d'origine utilise une scène commune. Le code actuel a une vue active à la fois.
7. **Une lecture ou analyse massive pendant l'usinage.** Ni relecture du programme pour nommer la ligne, ni génération de dizaines de vignettes, ni reconstruction globale à chaque état. Les enrichissements se préparent au repos et restent annulables.
8. **Une extrapolation de l'outil ou du temps.** Le repère ne dépasse pas le dernier rapport ; pas de compte à rebours précis à la seconde, de pourcentage de pièce finie ou de marge de confiance statistique inventée. Le modèle de temps ne tient pas compte des accélérations.
9. **Un geste graphique qui commande la machine.** Aucun glisser de l'origine réelle, aucun appui sur le parcours pour y déplacer la fraise, aucun raccourci stylet de jog. Examiner et commander restent deux intentions distinctes.
10. **Une réorganisation sous le doigt.** Pas de déplacement de Pause/Arrêter après changement d'état, perte du GPU, ouverture d'une fiche ou réduction de détail. Les couches restent sous le bandeau, avec fermeture tactile évidente.

## 4. Dix évolutions, classées par valeur opérateur

Les coûts sont des ordres de grandeur relatifs : **S** = évolution locale avec peu de contrats ; **M** = plusieurs composants et tests ciblés ; **L** = géométrie, cycle de vie ou contrats intermodules à raisonner en profondeur. Ce ne sont pas des devis en jours. Les objectifs de mesure ci-dessous sont des **critères proposés**, jamais des résultats déjà obtenus.

### 1 — Un état de confiance lisible au même endroit · M

**L'opérateur voit/fait.** Une petite bande stable au bord de la scène présente « Programme chargé », repère G54/mm, âge du rapport et géométrie complète/simplifiée. La légende dit « Acquitté par Grbl » et « À acquitter », avec rappel « accepté, pas nécessairement usiné ». L'estimation de temps garde sa source immédiatement sous la valeur. Un appui ouvre les explications, sans masquer le bandeau de sécurité. À 2,5 s sans rapport utilisable, position et avancement se figent et changent de texte/forme, pas seulement de couleur.

**Pourquoi Pro 3.** Les 143 px de hauteur supplémentaire et la scène nette permettent un contexte permanent sans comprimer les instruments. La logique de provenance serait possible sur RT ; ce lot réserve son affichage enrichi à v2 pour ne pas changer la RT.

**Risques.** Sécurité : confondre « frais » avec « position physiquement garantie », ou une consigne broche rapportée avec un tachymètre. Performance : rafraîchir le DOM à chaque image. Maintenance : dupliquer les règles de fraîcheur/identité. Réutiliser `CNCToolPosition`, le snapshot machine et les descriptions existantes ; n'écrire que les textes qui changent. Afficher « S rapporté » si aucun retour tachymétrique n'est connu.

**Fichiers.** `touch/tool-position.js`, `touch/job-dashboard.js`, `touch/ui-2027.css` ; nouveau `touch/performance-observation.js` pour le modèle de présentation partagé.

**Mesure tablette.** Faire reconnaître, à 50 puis 80 cm, dix états frais/périmé/estimé/acquitté/inconnu dans un rejeu identique ; relever erreurs et délai de compréhension. Critère : aucune confusion « acquitté = usiné », aucun affichage courant après 2,5 s ; vérifier le retard du gestionnaire d'état avec et sans v2.

### 2 — Une grande scène et une seule colonne de surveillance · M

**L'opérateur voit/fait.** Le parcours occupe la hauteur principale. À droite : estimation, coordonnées utiles, avance/S rapportés, courbe minute compacte, correction d'avance, accès aux autres corrections, commandes. Les corrections quittent le bas de la scène. Pause et Arrêter restent ensemble dans le bandeau, au même emplacement sur tous les écrans ; aucune seconde zone d'arrêt n'est ajoutée dans la maquette. Les détails secondaires se consultent dans une fiche à cibles 48 px, sans cacher Pause/Arrêter.

**Pourquoi Pro 3.** Le GPU peut redessiner une plus grande surface à DPR 1,58 ; le format 3:2 permet une scène haute. Sur RT, une surface de rendu logiciel accrue coûte davantage et la hauteur est moindre. On n'y applique pas cette grille.

**Risques.** Sécurité : enfouir un réglage fréquent, déplacer les commandes ou faire passer une action sous le doigt. Performance : redessiner inutilement tout le DOM. Maintenance : cascade CSS et déplacement d'IDs. Conserver les IDs, le circuit de commande, les cibles et une disposition stable par session. Mesurer avant de décider si les corrections broche/rapides restent déployées ou passent dans une fiche.

**Fichiers.** `touch/job-dashboard.js`, `touch/responsive.css`, `touch/ui-2027.css`, nouveau `touch/performance-v2.css` ; intégration du bandeau dans `touch/touch-shell.js` et `touch/status-strip.js` par leur propriétaire unique.

**Mesure tablette.** Rectangles réels de la scène, des textes et des commandes à 1366×911, texte normal/agrandi, noms longs, alarme et feuille ouverte. Cible : zéro chevauchement, zéro texte utile <16 px, cibles 64/48 px, correction courante en un appui. Comparer le nombre de gestes pour lire position/temps puis corriger l'avance.

### 3 — Examiner un détail au doigt ou au stylet, sans quitter le direct · L

**L'opérateur voit/fait.** Un bouton « Examiner » active une sélection exclusivement visuelle. Un appui sur la scène ouvre une loupe et une fiche avec coordonnées nominales, profondeur et qualification du segment. Un réticule d'inspection se distingue du repère d'outil. S'il y a plusieurs segments superposés, une liste courte demande lequel examiner ; aucune sélection prétendument exacte. Une commande « Revenir au direct » referme la fiche et restitue la caméra.

**Pourquoi Pro 3.** La géométrie complète, l'anticrénelage et le GPU permettent un zoom détaillé fluide ; le stylet peut affiner la sélection. Sur RT, la sélection d'un parcours simplifié et le zoom logiciel sont plus limités. La fonction reste utilisable au doigt sur Pro 3, sans survol ni bouton physique du stylet obligatoires.

**Risques.** Sécurité : confondre point examiné et outil, ou geste de caméra et commande. Performance : recherche de proximité en O(n) sur chaque mouvement. Maintenance : coordonnées écran/monde, filtres et géométrie simplifiée. Construire l'index au repos ; borner les recherches ; marquer toute mesure issue d'une approximation. Pendant le travail, n'utiliser que la géométrie déjà disponible.

**Fichiers.** `touch/preview-gl.js`, `touch/preview-3d.js`, `touch/preview-advanced.css` ; nouveau `touch/performance-inspect.js`. L'analyse géométrique reste dans `touch/preview-inspect.js`.

**Mesure tablette.** Corpus avec segments superposés, arcs, petite profondeur et 160k/500k **segments** ; essais doigt et stylet. Cibles proposées : réponse visuelle <100 ms au p95, pas de longue tâche >50 ms liée à la recherche, aucune commande issue d'un geste graphique, interruption propre à `pointercancel`.

### 4 — Maintenant / ensuite, en disant ce qui est inféré · M à L

**L'opérateur voit/fait.** Sous la scène, une frise courte présente l'opération déclarée dans le fichier, la séquence actuelle **estimée** et le prochain événement connu : rapide, pause, changement d'outil. Exemple : « Ensuite : séquence 3 — regroupement entre rapides » ou « Pause M0 à venir — durée inconnue ». Un nom métier comme « contour » n’est affiché que s’il est déclaré dans les métadonnées. L'absence de nom donne « Séquence 3 », jamais un nom d'opération inventé. La frise n'est ni un curseur de reprise ni une ligne G-code en cours.

**Pourquoi Pro 3.** Le worker peut préparer les séquences à partir de la géométrie complète au repos, et la scène dispose de place pour les situer. Une liste textuelle simple serait possible sur RT ; on lui conserve son fonctionnement actuel et on n'y charge pas cette analyse supplémentaire.

**Risques.** Sécurité : transformer une estimation en certitude d'exécution. Performance : reparser le fichier pendant le travail. Maintenance : dialectes et commentaires CAM. `motion-estimate.js:62–63,273–287` connaît déjà des commentaires `operation:` et outils T ; les réutiliser avec provenance. Les frontières par G0 sont des regroupements visuels, pas la preuve d'une opération métier. Si l'accroche est ambiguë, afficher « Séquence indéterminée ».

**Fichiers.** `touch/motion-estimate.js`, `touch/preview-inspect.js`, nouveau `touch/performance-sequences.js`, présentation dans `touch/job-dashboard.js`.

**Mesure tablette.** Vérifier sur le corpus les noms déclarés, les inconnues, les reprises et un fichier sans commentaires. Pendant le rejeu : aucune lecture de programme, aucune avance visuelle au-delà de la dernière information utilisable. Relever l'analyse initiale et le coût par rapport d'état.

### 5 — Origine actuelle et hypothèse XY, comparées dans un seul cadrage · L

**L'opérateur voit/fait.** Préparer montre le programme gris à l'origine actuelle et bleu si XY était posé ici. Une commande visuelle permet « Les deux / Actuelle / Hypothèse », sans changer de cadrage. Un résumé numérique donne le décalage XY proposé et les marges de course seulement lorsqu'elles sont calculables. « Affichage seulement », « Z non vérifié » et l'origine de chaque verdict restent visibles. Le bouton de zéro réel garde son circuit existant dans la zone des commandes.

**Pourquoi Pro 3.** Une scène matérielle commune supporte ces incrustations et leur profondeur ; la hauteur permet comparaison et coordonnées sans défilement critique. L'origine visuelle est déjà réservée au poste large GPU ; il s'agit d'en rendre la comparaison plus explicite.

**Risques.** Sécurité : assimiler proposition et origine posée, ou course XY et absence de collision. Performance : réenvoyer le programme à chaque rapport. Maintenance : repères, mm/pouces, `$23`, fraîcheur et identité. Réutiliser les translations par uniforme et `CNCTravelCheck.place()` ; conserver son verdict inconnu ; ne jamais recopier son algorithme dans l'UI.

**Fichiers.** `touch/origin-preview.js`, `touch/origin-preview.css`, `touch/job-preparation.js`, `touch/travel-check.js` uniquement si une API de marges documentées est nécessaire.

**Mesure tablette.** Cas dans/hors course/inconnu, rapport périmé, changement de fichier, G55 et pouces refusés si non pris en charge ; comparer les nombres avec le modèle existant. Vérifier le maintien des rectangles jog et commandes en travail/pause/alarme, et l'écart caméra/jog ≥24 px.

### 6 — Brut, brides et marges : des repères déclarés, explicites · M à L

**L'opérateur voit/fait.** Un bouton « Repères » affiche brut, brides déclarées et dimensions utiles. Une fiche dit qui a fourni les dimensions : fiche projet, saisie locale, programme. Les hypothèses X0Y0/topZ0 et les inconnues restent lisibles. Des distances nominales peuvent être affichées entre entités sélectionnées, avec unité et source, sans pastille « sûr ».

**Pourquoi Pro 3.** Ces repères existent déjà (`PROFILES.md:68`) ; une scène plus grande et nette les rend exploitables sans étouffer le parcours. La RT garde sa représentation actuelle ; les calculs/index et les fiches riches ne lui sont pas ajoutés.

**Risques.** Sécurité : une bride dessinée n'est pas une bride détectée ; une distance centre-outil n'est pas une distance au porte-outil. Performance : trop d'étiquettes et de segments. Maintenance : origine et validité des déclarations. Ne montrer que quelques cotes sélectionnées ; distinguer dimensions déclarées et géométrie nominale ; aucune garantie anticollision ni validation de pièce finie.

**Fichiers.** `touch/preview-inspect.js`, `touch/preview-gl.js`, `touch/projects.js` si provenance à compléter ; nouveau `touch/performance-inspect.js` pour l'affichage.

**Mesure tablette.** Lire les dimensions à 80 cm, masquer/rétablir les repères en un appui, tester une fiche absente ou liée à une autre empreinte. Plafond proposé : quatre cotes simultanées ; comparer le p95 de dessin avec et sans elles et vérifier que les commandes restent atteignables.

### 7 — Fichiers : distinguer sélection, fiche projet et programme chargé · M

**L'opérateur voit/fait.** La liste garde de grandes lignes et une vignette statique. Le détail montre le fichier sélectionné ; une bande identifie séparément le programme chargé. Une comparaison courte expose nom/version, dimensions, outil et matière déclarés, empreinte valide/inconnue. Le bouton primaire reste « Charger et ouvrir le Suivi », avec ses gardes ; il ne devient pas un démarrage.

**Pourquoi Pro 3.** Le grand aperçu matériel et la hauteur permettent cette comparaison simultanée. Les vignettes restent statiques et mises en cache, même ici : ni un contexte GL par ligne, ni une animation de galerie. La RT conserve son écran actuel.

**Risques.** Sécurité : sélectionner ne charge pas ; une fiche déclarative ne vérifie pas le montage réel. Performance : rafales de lecture et régénération. Maintenance : identité des caches et fichier modifié. Réutiliser empreintes et `loadedPreview()` ; limiter le cache et ne jamais remplacer le programme chargé par la sélection dans Suivi.

**Fichiers.** `touch/shared-library.js`, `touch/shared-library.css`, `touch/files-touch.css`, `touch/projects.js`, `touch/job-dashboard.js` pour le contrat de lecture de l'aperçu chargé ; aucune mutation du contrôle dans ce lot.

**Mesure tablette.** Alterner vingt sélections, dont même nom/empreinte différente, pendant un rejeu. Vérifier le retour Suivi sans confusion et sans lecture complète en travail. Mesurer ouverture, requêtes et mémoire ; comparer avec la référence documentée Fichiers 78–101 ms, sans transformer cette plage en engagement universel.

### 8 — Courbe minute corrélée aux corrections et aux interruptions · M

**L'opérateur voit/fait.** La courbe d'avance est visible à 1366 px, avec unité mm/min et repères de temps. De petits marqueurs signalent une correction rapportée, une pause ou une période de données absentes. Un appui sur un événement révèle sa valeur ; la dernière valeur courante reste séparée de l'historique. Un trou de données est un trou, jamais une ligne interpolée qui prétend mesurer ce qui manque.

**Pourquoi Pro 3.** Le surplus de hauteur permet cette courbe et ses intitulés. Le calcul est léger et pourrait fonctionner sur RT, mais le besoin ici est spatial et la RT ne reçoit pas de changement. Le GPU n'est pas requis pour tracer une polyline SVG.

**Risques.** Sécurité : corrélation ne signifie pas cause ; une chute d'avance n'est pas une preuve de surcharge. Performance : reconstruire le graphe à 60 Hz. Maintenance : mélange des horloges et changements de programme. Réutiliser un tampon borné, dessiner au plus une fois par seconde, horodatage monotone pour les intervalles, remise à zéro explicite selon l'identité du travail.

**Fichiers.** `touch/job-dashboard.js`, nouveau `touch/performance-observation.js`, `touch/performance-v2.css`.

**Mesure tablette.** Rejeu d'une minute avec corrections, pauses et trou d'état ; vérifier positions des marqueurs et absence de courbe inventée. Comparer CPU page/CNCjs et tâches longues ; aucun dessin lorsque Suivi est caché.

### 9 — Journal contextualisé, sans transformer Suivi en console · M

**L'opérateur voit/fait.** Un événement de la courbe ouvre Journal au bon intervalle et au bon programme, en lecture seule. Les événements sont filtrables par commande, état et connexion ; le retour restaure la vue Suivi. La commande envoyée, confirmée, refusée ou incertaine garde sa distinction. On montre « Aucun événement conservé » si le contexte n'est pas disponible.

**Pourquoi Pro 3.** Liste et contexte côte à côte profitent du poste large ; le calcul reste modeste. Le journal local de 100 événements et le journal durable serveur existent déjà. La nouveauté est le lien contextuel, pas une collecte magique de tout l'atelier.

**Risques.** Sécurité : rejouer une commande depuis l'historique ou présenter une réception comme confirmation machine. Performance : lire tout l'historique à chaque événement. Maintenance : identités de travaux, horloges et rétention. Pas de bouton Rejouer ; lecture paginée sur demande ; pas de capture permanente d'images ni copie du G-code.

**Fichiers.** `touch/session-journal.js`, `touch/real-history.js`, nouveau `touch/performance-journal-context.js`, présentation dans `touch/touch-shell.js` par l'intégrateur.

**Mesure tablette.** Depuis cinq événements, atteindre leur explication puis revenir au même cadrage en deux gestes utiles. Vérifier tri des horodatages, contexte inconnu après perte d'état, limites de rétention et absence de rafale de lecture pendant le travail.

### 10 — Qualité de rendu pilotée par un budget mesuré · L

**L'opérateur voit/fait.** Dans Réglages, un mode « Qualité complète » conserve la référence actuelle ; une option « Rendu allégé » réduit les détails visuels lorsque nécessaire. La résolution choisie et la géométrie simplifiée sont expliquées dans le diagnostic, pas affichées comme un score décoratif. Un défaut de contexte gèle/replie la vue dans son cadre ; les commandes ne bougent pas.

**Pourquoi Pro 3.** Le matériel dispose d'une marge réelle pour détails, index et inspection. L'endurance thermique et énergétique de cet i5 ancien, partagé avec CNCjs, doit néanmoins être mesurée. Sur RT, aucune de ces nouvelles boucles, ressources ou politiques n'est chargée.

**Risques.** Sécurité : sacrifier la fraîcheur d'état pour un nombre d'images/s ; auto-ajuster la grille ou rendre le détail instable. Performance : le moniteur coûte lui-même du CPU. Maintenance : états de repli et libération. Pas de benchmark continu ; pas de hausse automatique du plafond de géométrie ; index des passes au repos ; un seul contexte actif ; métriques détaillées uniquement à la demande.

**Fichiers.** `touch/preview-gl.js`, `touch/preview-3d.js`, `touch/tablet-diagnostic.js`, `touch/display-settings.js`, `touch/tablet-profile.js` ; harnais de mesure dédiés.

**Mesure tablette.** Rejeu identique puis endurance 30 min sans machine, à température de départ notée ; CPU Chromium **et** CNCjs, RSS/PSS et heapJS, température si disponible, p95/p99 des images, tâches >50 ms et âge des rapports. Tester vingt cycles ouverture/fermeture, Éco, verrouillage et perte de contexte. Cible : pas de dérive mémoire monotone, aucune dégradation de fraîcheur, contrôle tactile stable. Aucune nouvelle promesse de durée de batterie sans mesure.

## 5. Performance v2 : six écrans, une même grammaire

### Règles communes

Le rail garde Menu, Préparer, Fichiers, Suivi, Machine, Journal, Réglages dans cet ordre. Le bandeau supérieur conserve état, programme, contrôle de l'appareil et les commandes de sécurité. Les valeurs critiques sont alignées, à chiffres tabulaires ; la couleur est doublée par un mot, un symbole ou un trait. Les textes secondaires restent ≥16 px. Les boutons principaux ont ≥64 px, les autres ≥48 px, avec séparation tactile explicite.

La v2 est un agencement nouveau, pas un deuxième contrôleur. Les commandes appellent les relais et API existants ; tickets, fraîcheur, pilote, identité, retour envoyé/confirmé/refusé/incertain, garde anti-double-appui Pause/Reprendre et logique d'arrêt restent au même endroit. **Pause n'attend pas une confirmation ajoutée par le design.** Les opérations qui exigent déjà une confirmation la conservent. Arrêter reste qualifié d'arrêt logiciel et ne remplace pas l'arrêt d'urgence matériel.

Toute fiche, loupe ou annotation produit commence sous le bandeau. Un changement d'état remplace son contenu sans déplacer les commandes. En écran verrouillé, seuls les contrôles prévus par le verrou existant restent utilisables. Les erreurs sont présentées avec la prochaine action utile, sans compte à rebours agressif ni clignotement.

### Suivi — voir la pièce, lire l'état, agir sans chercher

À gauche, la scène haute : programme nominal, acquitté/à acquitter, passe mise en évidence, repère rapporté/interpolé ; barre de vues et suivi outil ; provenance/fraîcheur ; séquence actuelle/suivante si disponible. À droite, une lecture verticale : temps estimé et origine du calcul, coordonnées de travail, avance et S rapportés, courbe minute, corrections, commandes.

La maquette met en scène un surfaçage/contournage. Elle utilise une projection 3D dessinée en Canvas2D : une illustration crédible et manipulable, pas le moteur CNCjs ni une simulation de matière. Les valeurs sont **fictives et signalées comme telles**. Un « fait » visuel est toujours expliqué comme acquitté ; aucune donnée de cette maquette n'est une télémétrie.

Par rapport à aujourd'hui : scène plus haute, courbe réellement visible, provenance condensée, correction courante regroupée et accès à l'inspection sans perdre l'ensemble. Restent inchangés : arrêt/confirmation, interprétation d'acquittement, seuil de fraîcheur, absence d'extrapolation, suivi outil non mémorisé, aucune relecture du programme en travail.

### Fichiers — choisir sans confondre avec ce qui tourne

Liste à gauche, aperçu et fiche à droite. Le haut du détail distingue « Sélection » et « Chargé dans la machine ». Dimensions, matière/outil déclarés et validation d'empreinte sont visibles ; les notes longues s'ouvrent dans une fiche. Une seule vue 3D active ; vignettes statiques dans la liste. Pendant un travail, Pause/Arrêter restent dans le bandeau et le chargement suit les gardes actuelles.

Par rapport à aujourd'hui : comparaison explicite de la sélection, du programme chargé et de leurs métadonnées ; cache de vignettes cohérent. Ce qui ne change pas : sélectionner ne charge pas, charger ne démarre pas, empreinte différente invalide les informations concernées, pas de commandes de travail ajoutées dans le corps de Fichiers.

### Préparer — comparer avant de décider

Dans l’étape de comparaison illustrée, la scène actuel/hypothèse XY occupe la gauche ; à droite, l’étape d’origine, les décalages, le verdict de course qualifié et le rappel Z inchangé. Le bouton « Déplacer l’outil… » ouvre une zone de jog dédiée, avec coordonnées travail/machine, choix du pas et cibles de 96 px dans l’intégration proposée. Les commandes restent disponibles uniquement selon la configuration réelle ; elles sont toutes désactivées dans la maquette. Fermer cette zone restitue la comparaison au même cadrage. La proposition XY peut être masquée ; aucun geste sur la scène ne la pose réellement. Ce choix de panneau ajoute un appui pour joguer : il doit être comparé au poste actuel à croix permanente sur la tablette avant adoption. Pendant un geste ou un travail, aucun basculement de disposition automatique.

Les commandes de zéro restent dans leur zone, avec leur confirmation existante. Les étapes de préparation restent des déclarations de l'opérateur ; une scène qui semble correcte ne coche rien. En travail/pause/alarme, la carte garde son rectangle et affiche « suspendu ». Si les données manquent, des inconnus remplacent les nombres. La maquette autonome emploie des valeurs fictives ; elle ne prétend pas activer cette vue sur la page de simulation existante.

Par rapport à aujourd'hui : comparaison plus lisible à cadrage fixe et marges expliquées. Ce qui ne change pas : XY seul, course estimée tablette distincte du contrôle serveur, `$23` inconnu conservé, ≥24 px entre caméra et jog, aucune commande au toucher du parcours.

### Machine — comprendre une condition, puis utiliser la commande existante

Deux zones : état courant et explication à gauche ; repères/coordonnées et paramètres utiles à droite. Une alarme possède un titre lisible, son origine rapportée ou déduite, une explication et la prochaine action possible. La fraîcheur et l'appareil pilote sont visibles. Les paramètres de course connus/inconnus sont présentés avec leurs unités, sans illustration faussement certaine de toute la machine.

La v2 rapproche les informations nécessaires au diagnostic ; elle n'ajoute ni terminal, ni macro arbitraire, ni balayage automatique de paramètres. Déverrouillage, prise d'origine et autres opérations gardent leurs conditions et confirmations. Pause/Arrêter restent accessibles en alarme et avec une fiche ouverte.

### Journal — reconstruire ce qui s'est passé

Liste chronologique large, filtres tactiles, détail de l'événement sélectionné à droite. Le contexte comprend le programme connu, le temps et l'origine de l'événement : appareil, serveur, rapport, déduction. Une entrée ouverte depuis la courbe arrive au bon intervalle. Le retour Suivi restaure la vue ; une information absente reste absente.

La v2 ajoute la navigation contextuelle et une meilleure lecture des refus/incertitudes. Elle conserve les sources et rétentions existantes : 100 événements locaux non persistants, historique serveur selon son stockage. Aucun bouton pour rejouer une commande, aucune reconstitution graphique d'une position qui n'a pas été enregistrée.

### Réglages — choisir le confort, vérifier la capacité

Affichage conserve thème, texte, veille, luminosité, langue et profil. Sous Performance, une entrée « Interface Performance v2 » explique sa disponibilité et la prise en compte à la prochaine session sûre. Le diagnostic présente GPU matériel, résolution, DPR et qualité effective ; les mesures détaillées se lancent explicitement. « Rendu allégé » ou « Arrêter le rendu 3D » agit uniquement sur le visuel dans son cadre.

Les réglages système existants gardent leurs interdictions pendant travail/mouvement. Aucun changement Wi-Fi, commande hôte ou type machine n'est associé à un changement de style. Pas de tableau de bord de performance animé en permanence.

## 6. Activation, désactivation et RT inchangée

Proposition de porte : **préférence v2 explicite ET profil Performance ET GPU matériel reconnu ET poste large admissible**. Le résultat de la probe existante est réutilisé. L'option n'est ni un paramètre d'URL de forçage ni une voie pour activer v2 sur logiciel. Le profil laser conserve sa représentation 2D ; les enrichissements CNC ne sont jamais chargés pour lui.

La préférence locale, par exemple une nouvelle clé versionnée `cncjs-touch-performance-ui-v2`, ne prend effet qu'à la prochaine ouverture sûre de l'interface au repos. Si la machine travaille ou l'état est inconnu, l'écran indique « Changement préparé pour la prochaine session au repos » ; il ne recharge pas la page et ne réorganise pas les commandes. Le choix est réversible, les clés et données du profil actuel sont conservées.

La **désactivation visuelle immédiate** ferme la scène animée et ses calculs, remet une vue fixe dans le même rectangle et conserve la disposition de sécurité. Le changement global vers l'ancienne disposition s'applique plus tard au repos ; une perte de GPU suit la même règle. Pour une rotation/réduction de fenêtre réellement imposée, le bandeau reste fixé et les contenus adaptent leur défilement ; aucune mise à l'échelle sous 1. Une telle transition exige ses propres tests tactiles.

Choisir Éco libère immédiatement les ressources avancées. Si un travail est actif, seule la grille d'affichage reste figée jusqu'au repos ; elle n'autorise aucun calcul ni chargement avancé en Éco. Cette distinction entre ressources et disposition doit être intégrée au contrat du shell, dont le comportement actuel change de grille avec le profil.

Le profil Éco ne demande aucun module lourd v2. La RT conserve DOM, styles, timers et comportement précédents ; l'exception historique de la probe Performance et du catalogue d'origine reste inchangée. Les fichiers de données légers de traduction v2, si le système existant impose leur chargement initial, doivent être intégrés par le propriétaire i18n sans code exécuté ni requête additionnelle sur RT : privilégier une extension du catalogue déjà demandé, ou une API de catalogue différé explicitement testée. Ne pas traiter l'exception Q13 comme une autorisation générale d'alourdir Éco.

## 7. Réalisation multi-agents : lots et propriétaires exclusifs

Cette répartition propose **Codex pour le raisonnement sur les contrats, la géométrie, le GPU et les états concurrents**, et **Opus pour les compositions, textes, tests d'interface et documentation**. Ce sont des affectations de la future réalisation, pas une affirmation sur les modèles employés pour cette étude.

Un agent ne modifie jamais un fichier dont un autre est propriétaire. Il formule un besoin de contrat ou fournit une proposition au propriétaire. Les fichiers partagés ne sont pas modifiés en parallèle « chacun dans sa section ». Chaque lot rend code, tests possédés, résultats, limites et inventaire exact des fichiers. Les noms `performance-*` ci-dessous sont **nouveaux fichiers proposés**.

### Ordre et dépendances

`L0 contrats → (L1 rendu + L2 géométrie + L3 observations en parallèle) → (L4 Suivi + L5 Fichiers/Préparer + L6 Machine/Journal/Réglages en parallèle) → L7 validation → L0 intégration et version finale`.

Les lots UI peuvent préparer leurs structures sur des fixtures contractuelles après L0, mais l'intégration attend les modèles réels. L1 et L2 se coordonnent sur un format immuable de géométrie, d'index de passes et de sélection. L3 consomme ces faits sans les recalculer. Les fichiers de commandes restent gelés sauf défaut concret nécessitant un lot distinct.

| Lot / charge / responsable | Mission et fichiers possédés exclusivement | Dépendances et preuve de fin |
| --- | --- | --- |
| **L0 — contrats et intégration / L / Codex** | `touch/tablet-profile.js`, `touch/touch-shell.js`, `touch/status-strip.js`, `touch/index.html`, `touch/simulation.html`, `touch/i18n.js`, catalogues `touch/i18n-messages-*.js` concernés, nouveau `touch/performance-v2-contract.js`, `PROFILES.md`, `README.md`, `PERFORMANCE-UI-SPEC.md`. Propriétaire unique des portes, bootstrap, versions/cache, événements, activation différée et coordonnées des commandes. | Fige d'abord les contrats : identité, fraîcheur, horloge, géométrie, sélection visuelle, cycle de vie, labels d'incertitude. Intègre ensuite les lots sans reprendre leur propriété pendant leur travail. Tests de portes/profil/i18n et revue des chemins de commande. |
| **L1 — moteur et inspection / L / Codex** | `touch/preview-gl.js`, `touch/preview-3d.js`, `touch/tool-position.js`, `touch/preview-advanced.css`, nouveau `touch/performance-inspect.js` ; tests `test-preview-gl.cjs`, `test-preview-3d-gpu.cjs`, `test-preview-3d-live.cjs`, `test-preview-3d-overlays.cjs`, `test-tool-position.cjs`, nouveau test d'inspection. | L0 ; contrat géométrie L2. Rend une scène, une sélection non ambiguë et un repli à rectangle constant. Vérifie gestes, contexte unique, arrêt des images et libération. Ne modifie ni le dashboard ni les algorithmes de course. |
| **L2 — géométrie, séquences et origine / L / Codex** | `touch/preview-inspect.js`, `touch/motion-estimate.js`, `touch/origin-preview.js`, `touch/travel-check.js`, nouveau `touch/performance-sequences.js` ; tests `test-preview-inspect.cjs`, `test-motion-estimate.cjs`, `test-origin-preview.cjs`, `test-travel-check.cjs`, nouveau test de séquences. | L0 ; échange format d'index avec L1. Calculs au repos/worker, provenance, ambiguïté et inconnus. Garde strictement les verdicts existants ; une extension ne transforme pas l'inconnu en succès. |
| **L3 — observations et contexte temporel / L / Codex** | Nouveaux `touch/performance-observation.js`, `touch/performance-journal-context.js` et leurs deux tests. Aucune écriture dans `job-dashboard.js`, `session-journal.js` ou `real-history.js`. | L0 ; métadonnées L2. Tampons bornés, discontinuités, identité du travail, dates/temps monotone, états frais/périmés. Pas de télémétrie inventée ni de commande. |
| **L4 — Suivi et grille v2 / M / Opus** | `touch/job-dashboard.js`, `touch/responsive.css`, `touch/ui-2027.css`, nouveau `touch/performance-v2.css` ; tests `test-dashboard.cjs`, `test-job-display.cjs`, `test-responsive-wide.cjs`. Le CSS global v2 appartient à ce lot : les autres lui soumettent leurs besoins. | L0/L1/L3. Compose les instruments et corrections en conservant IDs et relais. Fixture 1366 × 911, noms longs, textes agrandis, pause/alarme/périmé. La courbe visible et les rectangles mesurés font partie du résultat. |
| **L5 — Fichiers et composition Préparer / M / Opus** | `touch/job-preparation.js`, `touch/origin-preview.css`, `touch/shared-library.js`, `touch/shared-library.css`, `touch/files-touch.css`, `touch/projects.js` ; tests `test-job-preparation.cjs`, `test-library-context.cjs`, `test-library-identity.cjs`, `test-library-page-fit.cjs`, `test-projects.cjs`. | L0/L2 ; contrat de présentation L4. Ne modifie pas `origin-preview.js` : présente ses résultats. Comparaison sélection/chargé, métadonnées déclarées, états suspendus et séparation caméra/jog. |
| **L6 — Machine, Journal, Réglages et diagnostic / M / Opus** | `touch/machine-limits.js`, `touch/session-journal.js`, `touch/real-history.js`, `touch/display-settings.js`, `touch/settings-list.css`, `touch/tablet-diagnostic.js` ; tests `test-machine-limits.cjs`, `test-history-view.cjs`, `test-real-history.cjs`, `test-display-settings.cjs`, `test-tablet-diagnostic.cjs`. | L0/L3 ; API rendue par L1 pour qualité effective. Contextualise le journal, expose la préférence différée et le diagnostic sans boucle permanente. Toute évolution du rail/bandeau est demandée à L0. |
| **L7 — validation indépendante et documentation d'usage / M / Opus** | `browser-run.cjs`, `browser-strip.cjs`, `layout-exceptions.json`, `verify-project.cjs`, nouveau `test-performance-v2-safety.cjs`, nouveau `measure-performance-v2.cjs`, nouveaux `design/PERFORMANCE-V2-VALIDATION.md` et `design/PERFORMANCE-V2-USAGE.md`. | Tous lots intégrés. Ne corrige pas leurs fichiers : rapporte des reproductions minimales à leur propriétaire. Mesures PC séparées des mesures Surface ; aucun test forcé à passer par exception non justifiée. |

Les scripts de mesure existants ne sont modifiés que si L7 en prend explicitement la propriété avant modification ; sinon le nouveau harnais les appelle. Les changements de suffixes de scripts, `ADVANCED_VERSION`, catalogues et chargements restent tous à L0. Les tests existants non attribués sont exécutés sans modification. `job-controls.js`, `real-motion.js`, `coordinate-plan.js`, `dry-motion.js`, `job-stream.js`, `strip-guard.js` et le serveur sont **hors chantier de présentation** : les lots consomment leurs contrats. Un défaut confirmé dans ces couches devient un lot séparé, pas une correction opportuniste d'un agent UI.

### Contrats à fixer avant le parallélisme

- **Identité** : programme chargé ≠ sélection ; clé incluant l'empreinte quand elle est connue ; invalider plutôt que supposer une correspondance.
- **Temps** : horodatage d'arrivée monotone pour les âges locaux ; date civile seulement pour présentation/journal ; conserver la provenance des dates serveur.
- **État observé** : rapport, fraîcheur, repère/unités, acquittement, estimation et inconnus sont distincts ; absence codée, jamais remplacée par zéro.
- **Géométrie** : version/full/simplified, tolérance, index de passe et numéro de ligne ; Transferables et propriétaire de la mémoire explicites.
- **Présentation** : fonction sans effets machine ; aucune API graphique ne possède une référence vers un envoi de commande.
- **Cycle de vie** : écran caché, verrou, Éco, travail démarré pendant une lecture, nouveau programme, perte de contexte et `pagehide` ont chacun annulation/libération définies.
- **Commandes** : placement et relais existants testés par hit-test ; aucune décision visuelle ne change `canStart`, `canResume`, un verdict de course ou une coche de préparation.

## 8. Vérifier les bénéfices sur la tablette

La `BUGHUNT-MAP.md` fournit des familles de risques, pas une liste de bugs actuels démontrés. Elle l'annonce aux lignes 11 et 257. Les numéros de version et plusieurs implémentations ont évolué ; on ne répète donc pas ses hypothèses comme des défauts confirmés. Elle inspire les scénarios de contexte unique, identité, repli, couches, rotation et fraîcheur.

Le protocole futur commence sans CNC connectée, sur le simulateur ou un rejeu d'états. Il ne s'exécute pas dans cette mission. Pour chaque résultat : version candidate, navigateur, dimensionsCSS, DPR, renderer, segments et lignes séparés, géométrie full/simplified, état thermique et simulateur/rejeu/machine précisés.

1. **Référence et comparaison.** Rejouer la même minute, mêmes gestes et mêmes programmes sur l'UI actuelle et v2 ; passes alternées. Mesurer première image, p50/p95/p99 des intervalles, nombre de tâches > 50 ms, temps d'événement d'état et âge des rapports. Ne pas déduire le CPU du nombre d'images/s.
2. **CPU et mémoire.** Sans badge `?perf=1` pour la mesure CPU, relever processus Chromium et CNCjs ; compléter heapJS par RSS/PSS lorsque disponibles. Vingt cycles de vues, passage en Éco et retour au niveau de repos ; mesurer le coût de 500 000 segments au lieu de l'inférer de 160 000 lignes.
3. **Lisibilité et gestes.** À 50–80 cm, sur tablette réelle, doigt puis stylet et mains dans les conditions réalistes d'atelier. Tâches courtes : identifier la fraîcheur, différencier acquitté/usiné, lire une profondeur, retrouver une incertitude, corriger l'avance et trouver l'arrêt. Consigner les erreurs, pas seulement les préférences esthétiques.
4. **Matrice de sécurité UI.** Travail, pause, alarme, flux perdu, programme remplacé, GPU perdu, écran verrouillé, fiche ouverte, rotation et clavier numérique. Hit-tests aux centres et bords utiles des commandes ; annuler un geste caméra hors canvas ; tester le double appui Pause/Reprendre. Aucune couche ne capture Pause/Arrêter.
5. **Non-régression RT/Éco.** Comparer DOM visible, ressources demandées, timers et latences aux références, mêmes tailles 1366 × 768 et 1024 × 600. Aucun module lourd v2 ni nouvelle animation. Les modes laser et sans GPU gardent leur comportement.
6. **Endurance.** Trente minutes de rejeu et alternance des vues ; relever température/fréquence si disponibles, dérive mémoire et erreurs de contexte. Une séance courte à 60 images/s ne prouve pas la tenue thermique.

Les validations physiques éventuelles restent un travail ultérieur suivant le protocole du projet, supervisé et explicitement autorisé. Le présent dossier ne réalise aucun déplacement et ne certifie ni trajectoire réelle, ni mise en service, ni anticollision.

## 9. Statut des maquettes et validation locale

Les livrables attendus sont `performance-v2.html` (Suivi) et `performance-v2-preparer.html` (Préparer), autonomes, avec leurs styles et scripts inline et les jetons fournis recopiés. Ils illustrent les priorités 1, 2, 3, 5, 6 et 8 et l'intention des autres propositions ; ils ne livrent pas l'implémentation des dix évolutions.

Les données de démonstration sont déclarées fictives. La projection Canvas 2D n'est pas un benchmark du rendu WebGL intégré. Le bouton « Taille réelle » sert à examiner le cadre 1366 × 911 sans réduction ; une fenêtre plus petite le recadre. Les annotations expliquent les zones ; les commandes de démonstration ne possèdent aucun transport vers une CNC.

Validation locale effectuée sur PC Windows, **Chrome 156.0.8078.80 sans écran**, rendu logiciel pour ces maquettes Canvas 2D. Le navigateur a été contrôlé par tube CDP, sans serveur HTTP ni port de débogage réseau. La page interdit les connexions par CSP ; le harnais bloque les URL réseau. Zéro requête externe et zéro erreur JavaScript observées.

- Cadre **1366 × 911 CSS** vérifié à DPR **1 et 1,58**, sans transformation d'échelle ; captures normales et annotées inspectées visuellement. À 1024 × 768, le cadre reste fixe et est recadré, comme demandé. Ce mode de présentation ne prétend pas être le futur comportement adaptatif du produit.
- Contrôles de cibles 64/48 px, texte DOM ≥16 px, débordements et chevauchements ; seconde passe avec **Verdana** pour éprouver une police large. Pause, Reprendre et Arrêter gardent un rectangle de **144 × 64 px**. Les six cibles du jog pédagogique mesurent **96 × 96 px** et sont désactivées.
- **13 scénarios d'interaction vérifiés** : huit dans Suivi (vues, suivi, inspection, zoom, panneaux et sécurité, pause/reprise, arrêt, état périmé) et cinq dans Préparer (comparaison, cotes, origine, jog, annotations). Les feuilles laissent le bandeau accessible. Les modifications d'avance ne changent que le chiffre fictif : la courbe et le scénario ne sont pas recalculés.
- JavaScript analysé avec Acorn en **ES2017** ; les fonctionnalités CSS/API utilisées ont été contrôlées pour éviter les nouveautés postérieures à Chromium 106. **Chromium 106 n'a pas été exécuté** : sa compatibilité est visée par construction, pas certifiée par un essai de cette version. Aucun paquet n'a été installé.
- Les deux fichiers contiennent les jetons fournis, styles/scripts inline et aucune ressource externe. Les liens entre maquettes sont locaux ; chaque fichier possède son rendu autonome. Les autres entrées du rail exposent l'intention de l'écran, pas une fausse implémentation opérationnelle.

Preuves reproductibles : [rapport JSON](verification/report.json), [harnais local](verification/verify-mockups.cjs), [capture Suivi](verification/performance-v2-dpr1.png), [capture Préparer](verification/performance-v2-preparer-dpr1.png). Les empreintes des treize sources consultées sont consignées dans [sources-readonly.json](verification/sources-readonly.json). Aucun fichier du projet source n'a été écrit ; aucun Git, réseau applicatif ou ordre machine n'a été utilisé.

Limites assumées : maquette graphique statique, parcours synthétique de faible taille, pas de streaming Grbl, pas de tests de GPU Intel ni de température/consommation sur la Surface. Le stylet matériel, les mains d'atelier à 50–80 cm et l'endurance restent à valider sur la tablette suivant le § 8. Les changements de profil et de qualité sont spécifiés, pas implémentés dans CNCjs par cette livraison.
