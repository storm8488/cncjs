# Maquettes de la refonte — LISEZMOI

Phase 2 du lot « refonte » (2026-11-15), § 5.4 point 3 du prompt. Maquettes HTML statiques de `../SPEC-REFONTE.md` (version finale). Elles servent à juger la nouvelle organisation ; elles ne contiennent aucune logique de l'application.

## Ce qu'il y a dans ce dossier

- `index.html` : la planche. Une vignette par état, avec son titre, l'état montré, le paragraphe de la spec et les liens vers les trois rendus. Les vignettes sont les captures de `../files/` (non commitées) : sans elles, la planche s'affiche sans images.
- `maquette.css` : feuille autonome. Les jetons (sombre et clair) sont copiés de `touch/design-tokens.css` et les composants utiles (`.t-btn` et ses variantes, motif rayé, pastilles, barre d'avancement, case du dialogue) de `touch/ui-2027.css`. Aucun fichier de `touch/` n'est lié ni modifié. Les règles propres aux maquettes portent le préfixe `mq-`.
- Un fichier HTML par écran, volet et dialogue : tous les états d'un fichier sont dans la page ; quelques lignes de JavaScript choisissent l'état et le rendu.

Ouvrir une maquette : `machine.html?rendu=v2-sombre#prete`.
- `rendu` : `v2-sombre` (défaut), `v2-clair`, `v1` (v1 Éco, sombre). La fenêtre doit faire 1366 × 911 en v2, 1366 × 768 en v1.
- `#état` : l'identifiant de la colonne « État » ci-dessous ; sans lui, le premier état.

Polices : v2 = Arial (même métrique que Liberation Sans, la police réelle de la v2 sur la Surface) ; v1 = Verdana (métrique voisine de Bitstream Vera, celle de la RT). C'est voulu : Segoe UI, présente sur le PC, est plus étroite et aurait caché les débordements.

Captures : `../files/maquette-<écran>-<état>-<v2-sombre|v2-clair|v1>.png`, 155 fichiers, faites avec Edge sans tête (`--headless=new --screenshot --window-size=1366,911` ou `1366,768`, `--force-device-scale-factor=1 --hide-scrollbars`, profil jetable).

Données d'exemple (pas des valeurs de la machine) : noms de fichiers, heures, positions, `CNC LUNYEE`, épaisseurs saisies (bloc 12,7 mm, plaque 19,9 mm), parois 10 mm, port `/dev/ttyUSB0 · 115 200`. Les nombres de dépassement (15 mm), de profondeur (20,8 mm), de lignes (1 234 / 1 219 / 25 000) et les cotes du dessin de départ (28, 12, 4, 22 mm) sont ceux de la spec.

## Les 8 captures qui résument la nouvelle organisation (une séance, v2 sombre)

1. `../files/maquette-machine-alarme-demarrage-v2-sombre.png` — Mise en route : la machine est branchée, l'écran dit ce qui manque et le gros bouton bleu lance la prise d'origine.
2. `../files/maquette-fichier-choisi-depasse-v2-sombre.png` — Fichier : on touche le programme, on voit sa taille, sa profondeur et tout de suite qu'il descend 15 mm trop bas.
3. `../files/maquette-zero-piece-a-poser-v2-sombre.png` — Origine de la pièce : flèches, zéros, palpage au bloc et zéro Z à la plaque sur le même écran, avec le dessin qui montre où placer la fraise.
4. `../files/maquette-volet-ma-sonde-mesures-v2-sombre.png` — La première fois, l'écran demande les mesures du bloc sur un dessin, pavé à droite, sans rien à deviner.
5. `../files/maquette-controle-depasse-v2-sombre.png` — Contrôle : le dessin de côté montre les 15 mm de trop, le départ est refusé et les deux boutons pour s'en sortir sont à côté.
6. `../files/maquette-usinage-travail-v2-sombre.png` — Usinage : avancement, Pause, Arrêter et les réglages de vitesse, de broche et de rapides sur un seul écran.
7. `../files/maquette-usinage-pause-fichier-v2-sombre.png` — Changement de fraise demandé par le fichier : arrêter la broche et refaire le zéro Z à la plaque sans quitter l'écran.
8. `../files/maquette-machine-remise-en-route-v2-sombre.png` — Après une alarme : ce qui s'est passé, ce qui est perdu, ce qui est gardé, puis le bouton de l'étape suivante.

## Liste des maquettes

| Fichier | État | Ce que montre l'état | Spec | Rendus |
|---|---|---|---|---|
| `machine.html` | `non-connectee` | Machine non prête : port fermé | § 4.1, § 6.9 | 3 rendus |
| `machine.html` | `connexion-question` | Connecter la machine ? (question dans la carte) | § 4.1, § 6.9 | 3 rendus |
| `machine.html` | `alarme-demarrage` | Machine non prête : connectée, en alarme, origine à prendre | § 4.1, § 6.9 | 3 rendus |
| `machine.html` | `reglages-a-lire` | CNCjs a redémarré : lecture des réglages | § 4.1, § 6.9 | 3 rendus |
| `machine.html` | `prete` | Machine prête | § 4.1, § 6.9 | 3 rendus |
| `machine.html` | `travail` | Usinage en cours | § 4.1, § 6.9 | 3 rendus |
| `machine.html` | `pause` | Usinage en pause | § 4.1, § 6.9 | 3 rendus |
| `machine.html` | `remise-en-route` | Après une alarme : remise en route (origine à reprendre) | § 4.1, § 6.9 | 3 rendus |
| `machine.html` | `remise-en-route-reprise` | Après une alarme : origine reprise, zéro vérifié, reprise à la ligne | § 4.1, § 6.9 | 3 rendus |
| `machine.html` | `main-ailleurs` | Un autre appareil a la main | § 4.1, § 6.9 | 3 rendus |
| `fichier.html` | `choisi-depasse` | Fichier choisi : emprise, profondeur, dépasse de 15 mm | § 4.2 | 3 rendus |
| `fichier.html` | `choisi-tient` | Fichier choisi : tient dans la machine | § 4.2 | 3 rendus |
| `fichier.html` | `charge` | Fichier chargé, dépassement signalé | § 4.2 | 3 rendus |
| `zero-piece.html` | `a-poser` | Zéro à poser : flèches, zéros, bloc et plaque, dessin de départ | § 4.3, § 6.5, § 6.6 | 3 rendus |
| `zero-piece.html` | `test-contact` | Refus sur place : test du contact à faire, coches en direct | § 4.3, § 6.5, § 6.6 | 3 rendus |
| `zero-piece.html` | `refus-fraise` | Refus « fraise mal placée » : le dessin entouré | § 4.3, § 6.5, § 6.6 | 3 rendus |
| `zero-piece.html` | `sonde-touche` | Sonde qui touche en permanence : voyant ambre, [Pourquoi ?] | § 4.3, § 6.5, § 6.6 | 3 rendus |
| `zero-piece.html` | `origine-pas-prise` | Refus avec remède : origine machine pas prise | § 4.3, § 6.5, § 6.6 | 3 rendus |
| `zero-piece.html` | `palpage-en-cours` | Palpage au bloc en cours | § 4.3, § 6.5, § 6.6 | 3 rendus |
| `zero-piece.html` | `pose` | Zéro pièce posé : bilan du palpage | § 4.3, § 6.5, § 6.6 | 3 rendus |
| `zero-piece.html` | `laser` | Laser (RT) : carte « Laser » à la place de la sonde | § 4.3, § 6.5, § 6.6 | v1 seul |
| `controle.html` | `depasse` | Dépassement prouvé en Z : départ refusé, deux remèdes | § 4.4, § 6.7 | 3 rendus |
| `controle.html` | `tient` | Le fichier tient : départ possible | § 4.4, § 6.7 | 3 rendus |
| `controle.html` | `laser` | Laser (RT) : [Cadrer…] à la place des rapides | § 4.4, § 6.7 | v1 seul |
| `usinage.html` | `travail` | Usinage en cours | § 4.5 | 3 rendus |
| `usinage.html` | `pause` | Pause demandée par l'opérateur | § 4.5 | 3 rendus |
| `usinage.html` | `pause-fichier` | Pause du fichier : changement de fraise, zéro Z à la plaque | § 4.5 | 3 rendus |
| `usinage.html` | `alarme` | Alarme pendant l'usinage | § 4.5 | 3 rendus |
| `usinage.html` | `arrete` | Arrêté, machine pas prête : remise en route | § 4.5 | 3 rendus |
| `usinage.html` | `termine` | Terminé : zéro Z à la plaque sur place | § 4.5 | 3 rendus |
| `plus.html` | `tuiles` | Les tuiles et la version | § 4.6 | 3 rendus |
| `volet-ma-sonde.html` | `coin` | Page 1 : où est le bloc ? « Avant gauche » proposé | § 5.5 | 3 rendus |
| `volet-ma-sonde.html` | `mesures` | Page 2 vide, pavé rangé à droite sur « Épaisseur du bloc » | § 5.5 | 3 rendus |
| `volet-ma-sonde.html` | `pret` | Page 2 remplie, test du contact fait : prêt à palper | § 5.5 | 3 rendus |
| `volet-tester-sonde.html` | `broche` | Branche A, consigne A2 : débrancher la broche, pince en place | § 5.6, § 6.5 | 3 rendus |
| `volet-tester-sonde.html` | `trouve` | La cause est trouvée : la broche met la fraise à la masse | § 5.6, § 6.5 | 3 rendus |
| `volet-tester-sonde.html` | `arreter` | Machine ou broche en marche : aucune consigne | § 5.6, § 6.5 | 3 rendus |
| `volet-plaque.html` | `premiere` | Première fois : épaisseur à saisir, pavé rangé à droite | § 5.7 | 3 rendus |
| `volet-autres-zeros.html` | `actif` | Origine machine prise : les trois boutons actifs | § 5.8 | 3 rendus |
| `volet-autres-zeros.html` | `refuse` | Refus avec son bouton remède : origine machine pas prise | § 5.8 | 3 rendus |
| `volet-details-machine.html` | `prete` | Machine prête (remplace l'écran Limites) | § 5.9 | 3 rendus |
| `volet-details-controle.html` | `depasse` | Dépassement prouvé : la dérogation, à part | § 5.11 | 3 rendus |
| `volet-reprise.html` | `proposee` | Ligne proposée, plan vérifié par le serveur | § 5.12 | 3 rendus |
| `volet-details.html` | `alarme` | Ouvert depuis l'encart « Ce qui s'est passé » | § 6.2, § 6.9 | 3 rendus |
| `dialogue-confirmation.html` | `prise-origine` | Lancer la prise d'origine machine | § 5.2, § 6.3 | 3 rendus |
| `dialogue-confirmation.html` | `palper-bloc` | Palper le bloc XYZ, dessin coté par le serveur (case pas encore cochée) | § 5.2, § 6.3 | 3 rendus |
| `dialogue-confirmation.html` | `zero-z-plaque` | Zéro Z à la plaque, depuis la fin d'usinage | § 5.2, § 6.3 | 3 rendus |
| `dialogue-confirmation.html` | `demarrer` | Démarrer l'usinage, verdict « tient » | § 5.2, § 6.3 | 3 rendus |
| `dialogue-confirmation.html` | `derogation` | Démarrer malgré le dépassement (quatrième toucher, ambre) | § 5.2, § 6.3 | 3 rendus |
| `dialogue-confirmation.html` | `reprendre` | Reprendre l'usinage après une pause | § 5.2, § 6.3 | 3 rendus |
| `dialogue-la-main.html` | `autre` | Un autre appareil a la main et palpe | § 5.3 | 3 rendus |
| `dialogue-poser-zero.html` | `ici` | Zéro X ici (deux touchers, sans case) | § 5.4 | 3 rendus |
| `dialogue-poser-zero.html` | `origine-machine` | Zéro X à l'origine machine (nouveau, D4) | § 5.4 | 3 rendus |

« v1 seul » : les états laser (carte « Laser » de ③, [Cadrer…] de ④) n'existent que sur la RT, donc en v1 Éco. Les autres états v1 montrent le contenu CNC dans la fenêtre de 768 : c'est le cas le plus étroit des fils de fer de la spec (§ 0.1), celui qu'elle demande de vérifier (§ 14).

Dans les dialogues, la case est montrée cochée (le bouton d'engagement est alors armé), sauf pour « Palper le bloc XYZ », montré à l'ouverture, case vide et bouton rayé.

## Contrôles faits

- Chaque état a été chargé dans Edge sans tête avec un script de contrôle (copie de vérification hors du dépôt) qui relève : élément hors de la fenêtre, texte coupé ou en ellipse, texte de moins de 16 px (y compris le texte des dessins SVG mis à l'échelle), bouton de moins de 48 px (64 pour l'action principale et l'engagement, 96 pour les flèches), boutons qui se chevauchent ou à moins de 12 px, cartes qui se recouvrent, enfant qui sort de sa carte, de son volet ou de son dialogue. Résultat final : 0 remarque sur les 102 rendus v2 (sombre et clair) ; sur les 53 rendus v1, il ne reste que les ellipses du bandeau, dans 42 d'entre eux (écart n° 1).
- Chaque PNG a été regardé : en pleine taille pour les écrans principaux et chaque dessin corrigé, sur des planches 2 × 2 à demi-échelle pour le reste (v2 sombre, v2 clair, v1). Ce qui débordait ou se chevauchait a été corrigé puis recapturé (dessin de la zone de départ, vue de côté, dessin coté du bloc, dessin « plan » du dialogue, encart de ⑤, voyant de la sonde, pied du volet « Ma sonde », pourcentages des corrections).
- À la fin, aucun `msedge` lancé pour les captures n'est resté ouvert.

## Écarts

Ce que la spec ne permet pas de dessiner tel quel, ou ne dit pas. Chaque fois, le choix fait dans la maquette est indiqué ; rien n'est réglé en silence.

1. **Bandeau à 768 (v1, Verdana) : « Machine » et « Fichier » sont coupés dans tous les états** (« CNC LU… », « planche_400… »). Les 668 px de gauche (§ 2.2) ne suffisent pas au repos, où aucune cellule ne cède. En v2 (Arial, 911) tout tient, mais seulement après avoir resserré : écarts de 12 px, valeurs en 16 px gras au lieu de 18 ou 20, pastille d'état de 24 px. À trancher en L1 : céder « Machine » aussi au repos en 768, ou accepter l'ellipse du nom.
2. **Fil en v1 : « Ma-chine », « Con-trôle », « Usi-nage », « Gra-vure » se coupent dès 16 px** avec Verdana. La spec (§ 2.3) pensait que la coupure n'arrivait qu'en texte agrandi. C'est lisible, mais à confirmer avec la vraie police de la RT.
3. **① non connectée : contradiction.** « La carte de connexion prend la place de la liste » (§ 4.1), mais « jamais masqué : les lignes `connexion`, `main`, `reglages`, `origine` ». La maquette suit la première phrase : la carte remplace la liste. La spec ne dit pas ce que contient la carte avant la recherche : la maquette ne montre que son titre « Machine non connectée ».
4. **L'alarme de la mise sous tension compte comme un incident** (§ 6.9 : « la machine est en alarme »). L'encart « Ce qui s'est passé » apparaît donc à chaque connexion, avec « Alarme. » et « Perdu : la position de la machine. » (état `alarme-demarrage`). À préciser : la mise en route normale doit-elle afficher l'encart ?
5. **① après une alarme : en-tête.** Le fil de fer dit « Origine à reprendre » ; le tableau des états dit « Alarme N » (rouge) pour une alarme au repos. La maquette suit le fil de fer.
6. **① après la prise d'origine, reprise à faire** (`remise-en-route-reprise`) : ni l'en-tête ni la phrase de la barre ne sont définis. La maquette reprend ceux de ⑤ : « Arrêté ligne 1 234 » et « Usinage arrêté à la ligne 1 234. ».
7. **③ origine machine pas prise** : § 4.3 met la raison des pas rayés dans la barre avec [Prise d'origine machine…] ; l'algorithme du § 6.4 donnerait « Il manque : le zéro pièce » (la cause n° 10 n'est pas parmi les six premières). La maquette suit § 4.3.
8. **③ zéro posé** : la phrase de la barre quand l'étape est faite n'est pas écrite ; la maquette met « Zéro pièce posé. ».
9. **④ marge X** : l'exemple « X tient · marge 7 mm » est impossible (un fichier de 400 mm dans 407 mm utilisables laisse au plus 3,5 mm de chaque côté). La maquette affiche « marge 3 mm ».
10. **⑤ encart de 100 px** : deux lignes de texte plus une rangée de boutons de 48 px, ou une ligne plus des boutons de 64 px, ne tiennent pas avec des marges ordinaires. La maquette réduit les marges internes à 4 px ; la raison de ▓Arrêter la broche▓ est écrite à côté du bouton ; « Arrêté à la ligne 1 234 sur 25 000. La machine a perdu sa position. » est à côté de [Reprendre à une ligne…].
11. **③ colonne Sonde à 768 avec Verdana** : la légende du dessin passe sur deux lignes et le dessin n'a plus qu'environ 80 px de haut. Avec le remède « Voir le dessin de départ » (phrase du refus à la place de la légende, trois lignes), il reste environ 55 px : la maquette retire alors les mots du dessin (formes et flèches seules). Le budget de 148 px (§ 4.3) est trop juste en 768 ; en 911 le dessin a toute sa place.
12. **Dialogue « Palper le bloc XYZ »** : la spec donne les quatre cotes en morceaux de phrase (§ 6.6) ; la maquette les assemble en trois phrases. Le texte définitif est à écrire en L3b.
13. **« La main : autre » (icône + chevron) ne tient pas en 160 px sur une ligne** ; en Verdana « La main : libre » non plus. Le bouton passe sur deux lignes dans ses 48 px. De même, en v1, « Remise en route » et « Arrêter le palpage » passent sur deux lignes dans les 200 × 64 de l'emplacement 1, et « Reprendre à la ligne 1 219… » dans l'action de 320 × 64.
14. **Laser** : la spec ne dit pas le verdict de ④ pour un laser. La ligne « Z ✓ tient · ne descend pas » est inventée pour l'exemple.
15. **Volet « Ma sonde », page 2** : avec le pavé rangé à droite, le volet ne fait que 890 px ; le titre est réduit à « Mesures du bloc » (au lieu de « Ma sonde · Mesures du bloc ») pour que la ligne « Sonde : Nouvelle sonde [Autres sondes…] » tienne. La page 1 n'a pas de bouton final (le fil de fer n'en montre pas).
16. **Position perdue** : la spec ne dit pas ce qu'affiche « Position pièce » après une alarme qui redémarre la machine. La maquette met « ? ».
17. **② pagination** : « Page 1 / 3 » entre [← Précédents] et [Suivants →] n'est pas dans le fil de fer ; ajouté pour que les deux boutons aient un sens.
18. **v2, tableau « Choisi / Chargé dans la machine »** : la colonne à côté de l'aperçu ne fait que 278 px ; le tableau est rendu en liste (titre, puis nom).
19. **Couleur de l'action principale** : « couleur d'accent » (§ 2.6) donne en sombre un bleu clair à texte foncé, en clair un bleu foncé à texte blanc. C'est fidèle aux jetons, mais à faire regarder par l'opérateur : l'ancien vert disparaît de tous les boutons.

## Ce qui n'est pas vérifié

- Rien n'a tourné sur la Surface, la RT ni la CNC. Les polices sont des remplaçantes de même métrique (Arial pour Liberation Sans, Verdana pour Bitstream Vera) ; le rendu de Chromium 106 (RT) n'a pas été essayé.
- Non dessinés : le texte agrandi (18 px), l'espagnol et l'anglais (le bandeau en espagnol, texte agrandi, pendant un usinage reste à vérifier, § 14 de la spec), la v1 dans la fenêtre de 911 (la Surface avant le premier repos), le format compact, le portrait.
- Non dessinés non plus : les sous-écrans de Plus (Journal, Réglages, Mise en service, Guide), les volets gardés tels quels (Vitesse de déplacement, Macros, Sauvegarde des sondes, Exporter le journal, Détail du temps), « Détails du fichier », « Ajouter un fichier », la fiche du projet, l'aperçu agrandi, la vue 3D du placement, le clavier texte, la veille, le verrou, et les états de la spec qui n'ont pas de ligne dans le tableau ci-dessus (par exemple ② sans fichier choisi, ④ en attente de la vérification du zéro, ③ « Ancien zéro »).
- Le contrôle automatique mesure la page de maquette, pas la page réelle : il ne remplace pas le harnais strict (`browser-run.cjs --strict`), qui n'a pas été lancé. Les comptes de touchers des parcours ne sont pas vérifiés par ces maquettes.
- L'aperçu 3D de la v2 et la courbe de vitesse sont des dessins figés, pas le rendu WebGL réel.
