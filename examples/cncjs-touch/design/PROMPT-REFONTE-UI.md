# Chasse aux bugs, refonte de l'organisation et optimisation de CNCjs Touch (multi-agent, 2026-11-15)

Tu écris en français. Dépôt `C:\Users\damou\Documents\claude\cncjs`. Branche de travail : `feat/refonte-ui`, créée depuis `feat/ecrans-ergonomie` à `3049a0e4` (poussé ; c'est la version qui tourne sur la Surface Pro CNC, cache `v2u`).

- Livrables durables : `examples/cncjs-touch/design/refonte/` (documents commités ; captures PNG dans `files/`, jamais commitées).
- Dossier de travail jetable : celui que l'orchestrateur te donne.
- Ton rôle, ta phase et tes fichiers sont dans le message de l'orchestrateur. Ce document s'impose à tous.

## 1. Pourquoi ce lot

Le 14 novembre, l'opérateur a fait ses premiers vrais usinages avec la tablette. Trois programmes sont allés au bout, mais il a fallu l'aider à presque chaque étape, et plusieurs défauts ont arrêté le travail. Son verdict : l'interface est « mal organisée et en bordel ». Les essais réels sont arrêtés ; tout ce lot se fait sur le PC.

Trois chantiers, dans cet ordre de priorité :
1. **Chasse aux bugs** (§ 4) : la sûreté de la machine d'abord.
2. **Refonte de l'organisation** (§ 5) : l'opérateur doit faire une séance complète sans aide.
3. **Optimisation** (§ 6) : mesurée, sans rien compliquer.

## 2. L'opérateur, les tablettes, la machine

**L'opérateur.** Amateur, francophone, pas développeur. Il usine du bois et du MDF avec des programmes Vectric : planches d'environ 400 × 70 mm, découpes jusqu'à 20 mm. Il est debout devant la machine, la tablette posée à côté, les doigts poussiéreux. Il ne lit pas les paragraphes : il cherche le bouton de l'étape suivante. Il ne connaît pas les noms des réglages Grbl.

**La tablette CNC.** Surface Pro 3 en kiosque, Chromium récent avec GPU, 12 pouces, 1366 × 911 px CSS (1 px ≈ 0,19 mm). Tactile seul : pavé numérique et clavier à l'écran. Le serveur CNCjs tourne sur la tablette. Elle affiche le rendu v1 tant que la CNC n'est pas connectée et au repos, puis le rendu « v2 Performance » (`body.perf-v2`).

**L'autre tablette.** Surface RT : laser, 1366 × 768, Chromium 106 sans GPU, rendu « v1 Éco ». Ce lot ne la met pas à jour, mais elle utilise la même page `touch/index.html` : elle ne doit rien perdre.

**La machine.** LUNYEE 4040, Grbl 1.1f.20231030 sur ESP32, `/dev/ttyUSB0`. Faits prouvés sur la vraie carte :
- Réglages : `$6=1`, `$10=1`, `$13=0`, `$20=1`, `$21=1`, `$22=1`, `$23=3`, `$27=2`, `$30=1000`, `$130-132` = 408 / 396 / 130, vitesses maximales 4000 / 4000 / 800.
- Après `$H`, MPos vaut 0,0,0. X et Y vont de 0 vers +, Z va de −130 vers 0. Six fins de course, prouvés.
- **Après toute prise d'origine, la carte rapporte `WCO:0,0,0` alors que `$#` contient toujours G54.** `G54` seul ne change rien. `G55` puis `G54` recharge le décalage, sans mouvement ; un `G10` le recharge aussi. On ne sait pas si le décalage exécuté est nul lui aussi, ou seulement le rapport.
- `$HX` fait la prise d'origine des trois axes.
- `ALARM:2` (limite logicielle) et une alarme de fin de course **redémarrent la carte** : MPos 0, référence perdue. Après un Arrêter en plein usinage, la carte était aussi à MPos 0, non référencée.
- Limite logicielle en Z, avec `$132=130` : une cible à −129,735 est passée, une cible à −129,945 a levé `ALARM:2`. La règle exacte du firmware n'est pas connue.
- Sonde : la broche met l'outil à la masse. Pince sur l'outil et broche branchée : contact permanent. Broche débranchée : le palpage marche.
- CNCjs redémarré ne connaît plus la version Grbl ni la référence de la machine.
- Les programmes demandent S18000 alors que `$30=1000` : la broche tourne au maximum.
- La broche est au plus bas dans son support : sans martyr, l'outil descend à 5 mm sous le dessus d'une pièce posée sur la table.

## 3. Journal de terrain du 14 novembre

C'est la preuve de départ des deux premiers chantiers. « Tn » sert de référence dans tes constats.

| # | Ce que l'opérateur a vécu | Cause connue | Suite |
|---|---|---|---|
| T1 | Écran noir à répétition ; toucher la tablette ne le rallume pas. | Toute page ouverte ailleurs (ici le Chrome du PC) peut éteindre le rétroéclairage du serveur, et elle seule le rallume. Aussi : page rechargée pendant la veille. | bug |
| T2 | Découpe à Z −20,76 lancée alors qu'elle sortait de la course : `ALARM:2` à la 4e passe, carte redémarrée, position perdue. | Le contrôle des courses ne bloque jamais le départ ; son avertissement est un pavé rouge illisible. | bug + refonte |
| T3 | Après une prise d'origine, dialogue rouge « X inconnu, Y inconnu, Z hors course ». | `WCO` à 0 après `$H` ; axes à bit `$23` jamais vérifiés ; prise d'origine envoyée hors tablette non reconnue. | bug |
| T4 | « J'ai que palper Z » : il ne trouve pas le palpage XYZ. | Zéro Z à la plaque dans Suivi ; palpage au bloc dans Préparer → Sonde et ses 5 sous-écrans. | refonte |
| T5 | « Je rentre quoi ? » devant les trois onglets du profil de sonde. | Profil vide (« Non configuré »), aucune valeur par défaut, décalages signés, coin exigé même pour Z. | refonte |
| T6 | « Toujours grisé », puis « j'ai cliqué, rien ne se passe ». | Test du contact exigé sans guidage ; refus du serveur écrit en petit au-dessus d'un bouton resté vert. | bug + refonte |
| T7 | Refus « Y irait de −5,9 à 35,9 mm machine » : il croit que la prise d'origine est fausse. | Message en coordonnées machine, sans dessin ni remède. | refonte |
| T8 | En XYZ, la fraise redescend sur le bloc. | Départ trop loin des bords ; aucune image de la zone de départ. Fenêtre élargie côté serveur par `3049a0e4`. | refonte |
| T9 | Voyant de sonde rouge en permanence, des heures perdues. | Broche qui met l'outil à la masse ; l'écran ne le suggère jamais. | refonte |
| T10 | « Relire les réglages » introuvable ; « je peux pas bouger, normal ? » après un redémarrage de CNCjs. | Version Grbl jamais relue seule ; bouton masqué ; relecture refusée en alarme. | bug |
| T11 | « J'ai plus rien dans Suivi. » | Carte de la plaque masquée sans explication quand le serveur la refuse. | bug + refonte |
| T12 | Il ne sait pas qui pilote, ni pourquoi un bouton est refusé. | Bail « Pilote » dans le bandeau ; les refus renvoient ailleurs par du texte. | refonte |
| T13 | Il veut « X0 = l'origine machine » : impossible depuis l'écran. | Aucune action ne pose le zéro d'un axe à l'origine machine. | petite fonction (§ 4.4) |
| T14 | Après une installation, l'ancienne version reste affichée ; il faut recharger deux fois. | Suffixes `?v=` gérés à la main (19 valeurs isolées). À comprendre. | bug |
| T15 | Découpe de 20 mm impossible sur ce montage : il l'apprend par une alarme. | L'écran ne compare pas la profondeur du programme à la course au chargement. | refonte |

Déjà corrigé, avec test : pourcentage bloqué à 98 % (`0cb5d90a`).

Restes ouverts du lot palpage (`1cbf488d`) : `G38.3` sans contact à valider sur la machine (pas par toi) ; arrêt par Socket.IO sans effet entre deux lignes au repos ; morceaux restés en français en anglais et en espagnol (« Palpage refusé : … », « inconnue », « inconnu ») ; le test S38 ne distingue pas un rapport de deux après l'`ok`.

## 4. Chantier A — Chasse aux bugs

### 4.1 Angles (un chasseur par angle)
- **A1. Sûreté et état de la machine, côté serveur** : `src/server/services/touch/**`, `src/server/api/api.touch.js`. Contrôle des courses, décalage de travail, référence, arrêt et reset, palpages, reprise à une ligne, marges, pilotage.
- **A2. Page : commandes, dialogues, états** : `job-controls.js`, `job-dashboard.js`, `job-resume.js`, `probe-ui.js`, `probe-real.js`, `real-motion.js`, `status-strip.js`, `commissioning.js`. État des boutons face aux refus du serveur, affichages périmés, éléments masqués, relais vers des boutons cachés, double envoi, reconnexion.
- **A3. Kiosque et hôte** : veille et rétroéclairage (T1), rechargement et cache (T14), session, flux `touch-events`, deux clients en même temps (PC et tablette), Wi-Fi, mises à jour.
- **A4. Régressions des lots récents** : `git diff a0f6ad18..3049a0e4` (déplacements réels, pavé numérique, finitions, palpage au bloc).
- **A5. Fiche du firmware** : Grbl_ESP32, par ses sources. Règle exacte des limites logicielles et rôle de `$27` ; décalage de travail après la prise d'origine ; reset et alarmes ; `G38.3` sans contact ; `$H` partiel ; rapports pendant la prise d'origine. Chaque affirmation porte un lien vers le code source, ou la mention « non trouvé ».

### 4.2 Pistes déjà relevées à la lecture du code (à prouver, numéros de ligne à revérifier)
1. `job-service.js:753-846` : un départ n'est jamais refusé pour un verdict `outside` ou `unknown` ; la page active Confirmer sur la seule case cochée (`job-controls.js:282-292`).
2. `program-check.js:519-525` : le décalage utilisé est le `WCO` rapporté, jamais recoupé avec `$#`. Le cas T3 passe inaperçu.
3. `program-check.js:569-572` : un axe à bit `$23` reste `unknown`, même quand la convention a été apprise à la prise d'origine (`homeMpos`).
4. `block-probe.js:913-925` lit `$#` sans recouper le repère actif ; `block-probe.js:778-785` : cibles `G38.3` en coordonnées de travail tirées du `WCO` rapporté.
5. `motion.js:447` : un pas peut viser exactement la fin de course ; tolérance de 0,001 dans `program-check.js` ; `$27` n'est utilisé nulle part.
6. `plate-probe.js:58-124, 216` : le zéro Z à la plaque n'exige ni référence ni contrôle de course, et n'est pas surveillé comme le palpage au bloc (perte du flux, changement de pilote).
7. `resume.js:629-644` : le préambule d'une reprise est en coordonnées de travail non vérifiées, sans contrôle de course.
8. `job-service.js:1671-1675` : `readSettings` est refusé en alarme ; personne n'envoie `$I` de lui-même.
9. `job-service.js:337-341` : un `$HX` partiel marque tous les axes référencés.
10. `api.touch.js:147-164`, `backlight.js:112` : toute session peut éteindre l'écran ; `dim(0)` l'éteint complètement.
11. `job-dashboard.js:32-38` : Démarrer, Pause et Arrêter de Suivi relaient vers des boutons cachés de Fichiers. `screen-probe-preparation` est inaccessible sur la page réelle (`probe-ui.js:311`).

Ce ne sont que des points de départ : cherche aussi ailleurs.

### 4.3 Règles de preuve et format
- Un défaut n'est rapporté qu'avec une **preuve** : un test qui échoue, ou un chemin d'exécution précis (fichier:ligne → fichier:ligne), avec l'entrée qui le déclenche et la sortie fausse. Sans preuve, c'est un « soupçon », rangé à part.
- En phase d'audit, tu ne modifies aucun fichier existant. Tu peux créer un test qui échoue : `examples/cncjs-touch/test-bughunt-<angle>-<n>.cjs` ou `src/server/services/touch/__tests__/bughunt-<angle>-<n>.test.js`, non commité.
- Une décision documentée (`PERFORMANCE-UI-SPEC.md`, `PROFILES.md`, `TESTING.md`) n'est pas un défaut ; tu peux la contester à part.
- Chaque constat : identifiant `<angle>-<n>`, gravité (**sécurité machine** / **bloquant** / **à corriger** / **mineur**), une phrase, le scénario (entrée → sortie fausse), la preuve, la correction proposée, les fichiers, et le « Tn » du journal s'il y en a un.

### 4.4 Décisions déjà prises (ne pas les rediscuter ; un commit séparé par décision)
- **D1. Départ hors course.** Un programme dont le dépassement est **prouvé** (machine référencée, axe vérifiable) ne part pas : refus avec la cause chiffrée et le remède. Une dérogation reste possible par un second geste délibéré, journalisé. Un verdict `unknown` reste un avertissement, mais lisible.
- **D2. Décalage après la prise d'origine.** Le serveur vérifie que le décalage actif rapporté égale la valeur `$#` du repère actif. Sinon, il le recharge sans mouvement et le prouve par un rapport. Tant que ce n'est pas prouvé : ni départ, ni palpage, ni reprise.
- **D3. Écran du kiosque.** Seule la page locale du kiosque (client en boucle locale) peut l'éteindre pendant sa veille. Un toucher sur la tablette le rallume toujours, même après un rechargement. Une page distante ne touche jamais au rétroéclairage pendant sa propre veille.
- **D4. Petites fonctions autorisées**, parce que le terrain les a demandées : zéro d'un axe à l'origine machine (sans mouvement) ; valeurs par défaut et assistant du profil de sonde ; relecture automatique de la version Grbl au repos ; diagnostic guidé de la sonde. Toute autre idée de fonction va dans `IDEES.md`, sans être réalisée.

### 4.5 Corrections
- Chaque bug corrigé a un test qui échoue sans le correctif.
- On ne retire aucun garde-fou. Tout changement de ce qu'envoie une commande machine, ou d'un de ses gardes, est inscrit dans `SURETE.md` avec sa preuve, puis relu par Astra et par Fable.
- **Les faits de terrain entrent dans les simulateurs.** `grbl-simulator` et le faux Grbl de Jest reçoivent un profil « LUNYEE » : `WCO` nul après la prise d'origine jusqu'au changement de repère ; `ALARM:2` suivi du redémarrage ; frontière de la limite logicielle ; contact permanent de la sonde ; `$HX` complet ; position remise à 0 après un reset en mouvement. Les tests de D1 et D2 tournent sur ce profil.

## 5. Chantier B — Refonte de l'organisation

### 5.1 Ce que montre la carte de l'existant
- 15 écrans, 11 volets et 10 dialogues. Le rail (Retour, Menu, Préparer, Fichiers, Suivi, Machine, Journal, Réglages) ne suit ni l'ordre du travail, ni l'ordre des tuiles du Menu (Suivi, Fichiers, Préparer…).
- Des fonctions éclatées :
  - zéro Z à la plaque dans Suivi, palpage au bloc dans Préparer → Sonde → profils, diagnostic, résultats, transfert ;
  - prise d'origine et déverrouillage dans Machine, alors que les refus de Préparer y renvoient par une phrase ;
  - connexion dans le Menu ; pilotage dans le bandeau ; « Relire les réglages » à trois endroits, masqué la plupart du temps ;
  - préparation du travail à la fois dans Fichiers et dans Préparer ; limites de la machine en double.
- Des éléments masqués sans raison affichée : carte de la plaque, « Reprendre à une ligne », corrections d'avance.
- Des champs vides qui bloquent : profil de sonde, diamètre, épaisseur de la plaque.
- Des textes de développeur : « Bornes de saisie du logiciel, pas des limites machine certifiées. Aucune valeur réelle inventée. », « Sans champ Pn, un rapport récent vaut libre. », « Acquitté = accepté par Grbl, pas nécessairement usiné. », « Position machine incohérente avec la course ($23, $130–$132)… ».
- Une organisation qui change d'aspect entre v1 (avant la connexion) et v2 (au repos).

La plainte porte sur l'organisation et le langage, pas sur les couleurs. Garde l'identité visuelle (thème « 2027 », sombre et clair) et unifie les composants.

### 5.2 Principes
1. **L'écran suit l'ordre du travail** : machine prête → fichier → origine de la pièce → contrôle → usinage. L'opérateur voit toujours où il en est et quelle est l'étape suivante.
2. **Une fonction, un seul endroit.** Tous les zéros et tous les palpages ensemble ; tout ce qui remet la machine en état ensemble.
3. **Aucune impasse.** Tout refus dit sa cause en une phrase et porte, sur place, le bouton qui la lève.
4. **Rien n'est masqué sans raison visible.**
5. **Langage d'atelier.** Phrases courtes, à l'impératif, sans nom de réglage Grbl ni de module. Le détail technique vit dans un volet « Détails ».
6. **Des valeurs par défaut sûres**, un assistant pour ce qui est rare, et les derniers choix repris.
7. **Prévenir avant d'engager.** La course et la profondeur sont vérifiées dès que le fichier et l'origine sont connus, pas au moment de démarrer.
8. **Un dessin plutôt qu'un chiffre** : zone de départ du palpage, emprise du programme dans la machine.
9. **La couleur vive est réservée à l'anormal**, et jamais seule (icône ou mot). Une seule action principale par écran ; les actions dangereuses à part.
10. **Après un incident, l'écran guide la remise en route**, dans l'ordre.

Repères de lecture : ISA-101 (hiérarchie des écrans, couleur réservée à l'anormal) ; gSender 1.5 (outils réunis, sonde avec test de continuité, contrôle des limites au chargement, aide sur les alarmes, reprise à une ligne) ; règles de Nielsen Norman pour les messages d'erreur (près de la source, langage clair, un remède) et pour les assistants (tâche rare, étapes listées, valeurs par défaut, retour possible).

### 5.3 Parcours de référence (critères d'acceptation)
Chaque parcours doit se faire sans aide et sans impasse. Compte les touchers avant et après ; un parcours fréquent n'en prend jamais plus qu'aujourd'hui.
- **P1. Mise en route** : tablette allumée, CNC branchée → machine prête à bouger (connexion, prise d'origine).
- **P2. Fichier** : choisir un programme, voir son emprise et sa profondeur, savoir tout de suite s'il tient dans la machine, le charger.
- **P3. Origine au bloc, première fois** : profil de sonde vide → palpage XYZ réussi, guidé par des dessins.
- **P4. Origine au bloc, fois suivantes** : palpage lancé en 4 touchers au plus depuis n'importe quel écran.
- **P5. Zéro Z seul à la plaque**, entre l'ébauche et la finition : au même endroit que le bloc, 3 touchers au plus.
- **P6. Zéros à la main** : se déplacer, zéro d'un axe ici, zéro d'un axe à l'origine machine.
- **P7. Contrôle et départ** : dépassement de course dit en clair avant le départ (« Le programme descend 15 mm trop bas : relevez la pièce »), départ, pause, reprise, arrêt, corrections.
- **P8. Après une alarme ou un arrêt** : ce qui s'est passé, ce qui est perdu, puis la suite dans l'ordre (déverrouiller, prise d'origine, origine de la pièce encore valable ou non, reprise à la ligne N).
- **P9. Pilotage** : savoir qui pilote ; prendre la main en 2 touchers.
- **P10. Sonde qui ne répond pas comme prévu** : contact permanent ou jamais de contact → diagnostic guidé (pince, broche à débrancher).

### 5.4 Méthode
1. **Trois propositions concurrentes**, angles imposés : (a) « le fil de la séance », des étapes ; (b) « un poste de pilotage », un écran principal et des volets ; (c) « le minimum », les mêmes écrans regroupés et nettoyés. Chacune donne : l'arborescence, les 10 parcours déroulés toucher par toucher, un fil de fer de chaque écran, le vocabulaire, ce qui disparaît, un découpage en lots, l'effet sur v1 Éco, les risques.
2. **Jury.** Il note chaque proposition sur les parcours, retient la meilleure, greffe les bonnes idées des autres et écrit `SPEC-REFONTE.md` : arborescence, écrans, composants, glossaire, table des refus (chaque code de refus du serveur → phrase de l'opérateur → bouton remède), table « ancien → nouveau » de chaque bouton machine, lots avec leurs fichiers.
3. **Maquettes** HTML statiques des écrans de la spec : v2 à 1366 × 911 en sombre et en clair, v1 à 1366 × 768. Captures PNG dans `design/refonte/files/`.
4. **Réalisation par lots, en série** ; un seul agent écrit dans le dépôt à la fois. Découpage de départ, que la spec peut ajuster :
   - L1 Socle : rail ou étapes, bandeau d'état, composants communs (refus avec son bouton, volet « Détails »), glossaire, cache `v2u` → `v2v` ;
   - L2 Machine prête : connexion, prise d'origine, déverrouillage, relecture, pilotage, remise en route ;
   - L3 Origine de la pièce : déplacements, zéros, plaque et bloc réunis, assistant du profil, diagnostic de la sonde, dessin de la zone de départ ;
   - L4 Fichier et contrôle : choix, emprise et profondeur contre la course, chargement ;
   - L5 Usinage : départ lisible, suivi, pause, reprise, arrêt, reprise à une ligne, fin du travail ;
   - L6 Journal, Réglages, mise en service, guide : cohérence, textes restants, anglais et espagnol complets.

### 5.5 Limites
- **Une seule organisation pour les deux rendus.** v2 reste un rendu plus riche de la même organisation. v1 Éco (laser, 1366 × 768, Chromium 106, sans GPU) garde toutes ses fonctions et sa légèreté : en Éco, aucune requête, minuterie ni image de v2.
- **Boutons machine.** Les déplacer, les renommer et les regrouper est permis. Ce qu'ils envoient et leurs gardes ne changent que par le chantier A. La table « ancien → nouveau » est prouvée par test pour chaque bouton.
- **Réglages** a été refait le 8 novembre : cohérence et bugs seulement.
- **Technique.** JavaScript sans framework ni outil de build, en IIFE, ES2017 au plus. CSS sans `:has()`, `color-mix` ni `dvh`. Toute chaîne visible passe par l'i18n, avec sa ligne FR / EN / ES ; les messages du serveur passent par les tables de codes de la page. Les identifiants et API publics (`window.cnc*`, `id`, `data-*`) sont migrés avec leurs tests dans le même lot. Ne jamais renommer les classes `v2m-` / `v2n-` ni la regex `V2_NODE`. Les fichiers de `tablet-exclude.txt` ne reviennent pas dans la page réelle. `PERFORMANCE-UI-SPEC.md`, `TESTING.md` et `BUGHUNT-MAP.md` sont mis à jour là où le comportement change.
- **Textes.** L'inventaire des textes de la phase 1 sert de liste de contrôle : chaque texte long ou technique est réécrit, déplacé dans « Détails » ou supprimé.

## 6. Chantier C — Optimisation

Mesure d'abord, sur le PC, avec `preview-server.cjs` et sa relecture d'un travail (`--replay`) :
- démarrage de la page : nombre de requêtes, octets, temps jusqu'à l'écran utilisable (70 scripts, 1,48 Mo de JavaScript, 237 ko de CSS aujourd'hui) ;
- pendant un travail sur Suivi : temps du fil principal, mises en page par seconde, tâches longues ;
- minuteries, sondages et animations sur un écran caché : aucun ;
- flux `touch-events` : taille et fréquence des paquets, coût côté serveur ;
- code mort retiré par la refonte.

Règle : on ne corrige que ce qui se mesure (gain d'au moins 10 % sur un indicateur, ou travail inutile supprimé), sans nouvelle dépendance. Le rapport donne les chiffres avant et après, mesurés de la même façon.

## 7. Équipe, modèles et phases

Les agents de lecture tournent en parallèle. Un seul agent écrit dans le dépôt à la fois.

| Phase | Rôle | Modèle |
|---|---|---|
| 1 Audit | Base : tests, harnais strict, captures « avant », touchers des 10 parcours | Sonnet 5.5 |
| 1 | A1 sûreté serveur | Fable 5.2 |
| 1 | A2 page, A3 kiosque et hôte | Opus 5.5 |
| 1 | A4 régressions récentes | Astra ultra, lecture seule |
| 1 | A5 fiche du firmware ; inventaire des textes ; veille des logiciels comparables | Sonnet 5.5 |
| 1 | Évaluation des 10 parcours sur l'interface actuelle | Fable 5.2 |
| 2 Preuves et conception | Contre-vérification de chaque constat | Opus 5.5 ; Astra pour la sûreté |
| 2 | Trois propositions d'organisation | Opus 5.5 (a, b), Astra (c) |
| 2 | Jury et `SPEC-REFONTE.md` | Fable 5.2 |
| 2 | Maquettes | Opus 5.5 |
| 2 | Corrections des bugs : serveur et simulateurs, puis page | Opus 5.5 |
| 3 Réalisation | Lots L1 à L6, en série | Opus 5.5 ; Sonnet 5.5 pour l'anglais et l'espagnol |
| 4 Revue | Régressions, sûreté, v1 Éco | Fable 5.2 |
| 4 | Lisibilité, parcours, captures | Astra ultra, lecture seule |
| 4 | Harnais strict complet, captures « après », touchers | Sonnet 5.5 |
| 4 | Corrections finales, mesures, rapport | Opus 5.5 |

Astra : `codex exec -s read-only -c model_reasoning_effort='"ultra"' -C C:\Users\damou\Documents\claude\cncjs -o <sortie> - < <brief>`. C'est long : lance-le en arrière-plan et attends sa fin.

Entre deux phases, l'orchestrateur relit les résultats, relance lui-même les tests et envoie à l'opérateur ce qui le concerne : après la phase 2, la spec et les maquettes.

## 8. Garde-fous de travail

- Aucun agent ne touche la Surface, la RT ni la CNC : pas de ssh, pas de déploiement, pas de push, pas de fusion. Seul le serveur local du harnais, en boucle locale, est permis.
- Propriété des fichiers : les corrections du serveur n'écrivent que dans `src/server/**` et `grbl-simulator/**` ; la page n'écrit que dans `examples/cncjs-touch/**`. Les documents de conception ne sont commités que par l'orchestrateur.
- Un commit local par lot ou par décision, sur `feat/refonte-ui`. N'ajoute que tes propres fichiers (`git add <chemins>`), jamais `git add -A`.
- Interdits : `git reset`, `stash` ou `checkout` des fichiers d'autrui ; contourner les hooks ; toucher `COMPTE-RENDU-*.md` ; commiter un PNG ; retirer une assertion d'un test existant sans le dire.
- Un seul harnais complet à la fois : seul l'agent désigné le lance. Les autres utilisent `--only <étape>`. À la fin, aucun `msedge` dont la ligne de commande contient `cnc-browser-run` ne reste ouvert.
- Dis ce que tu n'as pas vérifié. Un résultat annoncé sans l'avoir lancé est une faute.

## 9. Vérifications exactes

Depuis la racine du dépôt :

```
node examples/cncjs-touch/verify-project.cjs      → « N/N contrôles réussis » (181/181 au départ)
npx jest src/server/services/touch src/server/services/cncengine grbl-simulator   → toutes les suites passent (1034 tests au départ)
node examples/cncjs-touch/browser-run.cjs --strict --browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --out <dossier hors dépôt>
                                                  → « 0 violation(s), 0 excepted » et « every step passed »
```

Cibles du harnais : action principale 64 px, secondaire 48 px, flèche de déplacement 96 px, écart 12 px, texte 16 px ; aucune nouvelle exception dans `layout-exceptions.json`. Variantes : v1 à 1366 × 768 et v2 à 1366 × 911, sombre et clair, texte standard et agrandi, FR et ES (EN par test), CNC et laser, tous les états de la machine.

À ajouter par ce lot :
- une étape `parcours` du harnais qui rejoue au moins P1, P3, P7 et P8 et compte les touchers ;
- un test qui prouve que chaque code de refus du serveur a sa phrase et son bouton remède.

## 10. Livrables

Dans `examples/cncjs-touch/design/refonte/` :
- `CONSTATS.md` : chaque bug avec sa preuve, son verdict et son commit ; les soupçons à part.
- `FIRMWARE.md`, `TEXTES.md`, `VEILLE.md`, `ERGONOMIE.md` : les rapports de la phase 1.
- `propositions/` et `SPEC-REFONTE.md`.
- `SURETE.md` : boutons machine « ancien → nouveau », gardes changés, preuves.
- `IDEES.md` : fonctions proposées et non réalisées, à décider par l'opérateur.
- `RAPPORT.md` : par écran, avant et après (captures dans les mêmes conditions) ; touchers avant et après par parcours ; bugs corrigés ; mesures ; ce qui est laissé et pourquoi ; ce qui n'est pas vérifié (vraie machine, vraie Surface, vraie RT).
- `PROTOCOLE-ESSAI.md` : essai réel pas à pas, du plus prudent au complet, avec la liste exacte des fichiers du serveur à recompiler.
