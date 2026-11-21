# SPEC-REFONTE — l'organisation de CNCjs Touch (référence unique de la réalisation)

Phase 2 du lot « refonte », 2026-11-15. Branche `feat/refonte-ui` (page `3049a0e4`, cache `v2u`). **Version finale**, révisée par le jury après les deux critiques (`propositions/CRITIQUE-OPERATEUR.md`, `propositions/CRITIQUE-REALISATION.md`) et calée sur `CONSTATS.md` et `PLAN-CORRECTIONS.md`. Les points acceptés et rejetés, avec leurs raisons, sont dans `propositions/JURY.md`, section « Révision ».

Ce document se lit avec `design/PROMPT-REFONTE-UI.md` (qui s'impose), `PLAN-CORRECTIONS.md` (le contrat du serveur) et le code de `examples/cncjs-touch/touch/`. Un agent qui réalise un lot n'a pas besoin des propositions ni des critiques.

## Ce qui change pour vous (résumé pour l'opérateur)

1. À gauche, cinq étapes dans l'ordre du travail : Machine, Fichier, Zéro pièce, Contrôle, Usinage. Une coche dit ce qui est fait, un rond dit l'étape à faire. Il n'y a plus de menu : la tablette s'ouvre sur l'étape à faire.
2. En bas de chaque écran, une barre dit ce qui manque, en une phrase, avec le bouton qui le règle. Le gros bouton de droite est toujours le geste suivant.
3. En haut, toujours à la même place : l'état de la machine, « La main » (qui commande), Pause et Arrêter.
4. **Machine** : connecter, prise d'origine, relire les réglages, sur une seule liste, dans l'ordre. Après une alarme, l'écran dit ce qui s'est passé, ce qui est perdu, ce qui est gardé, puis vous guide jusqu'à la reprise.
5. **Fichier** : dès que vous touchez un fichier, vous voyez sa taille, sa profondeur, et s'il tient dans la machine. Puis « Charger ».
6. **Zéro pièce** : les flèches, les zéros, le palpage au bloc et le zéro Z à la plaque sont sur le même écran. Un dessin montre où placer la fraise.
7. La première fois, « Palper au bloc » vous demande le coin et quatre mesures du bloc, sur un dessin. Les vitesses sont déjà réglées.
8. Si la sonde touche tout le temps, l'écran le dit et vous fait chercher : la broche à débrancher, puis la pince.
9. Nouveau : « Autres zéros » met le zéro d'un axe à l'origine de la machine, sans rien bouger.
10. **Contrôle** : deux dessins montrent où le fichier tombe dans la machine. S'il dépasse, c'est écrit en clair (« descend 15 mm trop bas : relevez la pièce ») et le départ est refusé avant, pas par une alarme.
11. **Usinage** : avancement, Pause, Arrêter, et les réglages de vitesse, de broche et de rapides sur l'écran. À la fin, ou en pause de changement de fraise, « Zéro Z à la plaque » est sur place.
12. Un bouton qui ne peut pas servir reste à sa place, rayé, avec sa raison écrite à côté. Plus rien ne disparaît.
13. Journal, Réglages, Mise en service, Guide et Macros sont rangés sous « Plus ».
14. Les confirmations ne changent pas : la case à cocher reste avant tout mouvement. Les boutons disent ce qu'ils font (« Lancer la prise d'origine ») au lieu de « Confirmer ».
15. Sur la tablette du laser : mêmes écrans, même ordre, sans la sonde ni la 3D.

## 0. Cadre du document

### 0.1 Conventions

- Chemins : `touch/x.js` = `examples/cncjs-touch/touch/x.js` ; `test-x.cjs` = `examples/cncjs-touch/test-x.cjs` ; `s/x.js` = `src/server/services/touch/x.js`.
- `[Libellé]` = bouton ; `(l × h)` = taille de la cible en px ; `▓Libellé▓` = bouton rayé (inactif, raison affichée) ; « … » à la fin d'un libellé = le bouton ouvre un dialogue.
- Tailles imposées : action principale 64 px de haut, secondaire 48 px, flèche de déplacement 96 px, écart 12 px, texte 16 px (18 px en texte agrandi).
- **La place dépend de la fenêtre, jamais du rendu.** Zone utile : **1246 × 648 px dans une fenêtre de 1366 × 768** (la RT, laser) et **1246 × 791 px dans une fenêtre de 1366 × 911** (la Surface, CNC, en v1 comme en v2). Bandeau 72 px, rail 88 px, marges 16 px. Tous les fils de fer sont dessinés à 768, le cas le plus étroit ; ce que la fenêtre de 911 ajoute (143 px de haut) est dit sous chaque dessin et vaut pour les deux rendus. Une commande est donc au même endroit en v1 et en v2 dans une même fenêtre.
- Dans les sommes de hauteurs, le titre d'une carte compte pour 32 px et ses marges pour 24 px. Les cartes de ③ n'ont pas de titre visible (§ 4.3).
- Un toucher = un appui sur une cible. Les saisies de chiffres, les flèches de déplacement et les gestes sur la machine sont comptés à part.
- Tout état visuel passe par un attribut `data-*` ou une classe que le script pose : jamais par `:has()`.

### 0.2 Ce qui vient du chantier A (contrat de `PLAN-CORRECTIONS.md`)

`CONSTATS.md` et `PLAN-CORRECTIONS.md` existent : la spec est calée dessus. Les noms ci-dessous sont ceux du plan (§ 4) ; la page n'en invente aucun.

**Condition d'entrée de la refonte.** L1 ne commence qu'une fois les lots S1 à S6 et P1 à P3 du plan commités et verts. La refonte ne refait pas leurs corrections : elle garde leurs tests verts et déplace leurs éléments. Si un champ du tableau manque quand même dans un état reçu (serveur ancien, banc), la page prend la colonne « Champ absent » : toujours le sens qui refuse ou qui ne promet rien. Chaque lot du plan consigne ses écarts au contrat dans `audit/ECARTS-PLAN.md` : le réalisateur d'un lot de la refonte le lit avant de commencer, et un nom qui a changé s'y lit plutôt qu'ici.

| # | Sujet | Ce que le serveur fournit (plan § 4) | Ce que la page en fait | Champ absent |
|---|---|---|---|---|
| K1 | D1, refus de départ | `canStart` faux, `refusals.start` = `ETOUCH_START_OUTSIDE` avec `reasons[]` ; `programCheck.blocking[]` : `ETOUCH_TRAVEL_TOO_LOW`, `_TOO_HIGH`, `_BEYOND`, avec `over` (mm, déjà arrondi au dixième supérieur), `axis`, `sign` | ② et ④ écrivent le dépassement avec `over`, jamais recalculé ; [Démarrer l'usinage…] rayé | la page lit `programCheck.verdict === 'outside'` et écrit « dépasse », sans chiffre |
| K2 | D1, dérogation | `programCheck.overridable` ; demande `prepare {operation: 'start', override: 'travel'}` ; réponse `override: {blocking}` ; refus `ETOUCH_START_OVERRIDE_CHANGED`, `ETOUCH_START_NO_OVERRIDE` | bouton de dérogation dans « Détails du contrôle », seulement si `overridable` (§ 5.11) | pas de bouton |
| K3 | D2, zéro pièce prouvé | `workOffset {state, code, params, detail, canVerify}` avec `state` = `proven`, `checking`, `unknown` ou `failed` ; action `verifyOffset` ; refus `ETOUCH_OFFSET_CHECKING`, `_UNCONFIRMED`, `_MISMATCH`, `_SETTINGS` ; raison `ETOUCH_CHECK_OFFSET_UNPROVEN` ; `ETOUCH_PROBE_OFFSET` | **seul `state === 'proven'` vaut preuve.** Ligne `zero` de ①, en-tête de ③, état de ④ ; remède `verifier-zero` (§ 6.4) | « Zéro pièce non vérifié » : la page n'écrit jamais « gardé », « posé » ni « ✓ » sans `proven` |
| K4 | D4, relecture | `canReadSettings`, `readSettingsReason` ; la relecture part seule, au repos et en alarme ; refus `ETOUCH_SETTINGS_READING` | [Relire] suit `canReadSettings`, sur tous ses accès | [Relire] rayé, « Impossible pour l'instant. » [Détails] |
| K5 | D4, zéro à l'origine machine | `prepare` de `set-origin` avec `at: 'machine'` et `axes` ; refus `ETOUCH_ORIGIN_NOT_HOMED`, `ETOUCH_ORIGIN_OFFSETS` | volet « Autres zéros » (§ 5.8) | le serveur refuse ; le refus s'écrit dans le volet |
| K6 | D3, page locale | `local` dans les réponses de `GET` et `POST /api/touch-backlight` ; `ETOUCH_BACKLIGHT_REMOTE` | Réglages : le choix « Pendant la veille » est rayé quand `local` est faux (§ 4.7) | choix actif ; le serveur refuse |
| K7 | Alarme et référence | `lastAlarm {code, at, restarted}`, `referenceLost` (`'alarm'`, `'restart'`, `null`) ; refus `ETOUCH_START_NOT_HOMED`, `ETOUCH_ORIGIN_NOT_HOMED` | encart de ① (§ 6.9), mot « Alarme N » | « Alarme », sans numéro |
| K8 | Course par axe | `programCheck.axes.<A>.usable {low, high}` (marge de 0,5 mm comprise) | dessins de ④ (§ 6.7) | axe en pointillé, « non vérifié » |
| K9 | Sonde | `probeInput.test.stage` (`idle`, `free`, `contact`), `test.done`, `test.ageMs`, `contactMs`, `stuck`, `lastContactAgeMs` ; refus `ETOUCH_PROBE_CONTACT_STUCK` | coches du test du contact, voyant « touche en permanence » (= `stuck`), volet « Tester la sonde » | pas de coches ; voyant sans l'état « en permanence » |
| K10 | Arrêt de la broche | `canSpindleStop`, `spindleStopReason` | [Arrêter la broche] suit `canSpindleStop` ; sa raison est celle du serveur | « Arrêt de la broche indisponible. » — jamais « La broche est arrêtée. » |
| K11 | Broche au maximum | information `ETOUCH_CHECK_S_ABOVE_MAX {s, line, max}` du contrôle | ligne « Broche » de ④ | pas de ligne |
| K12 | Refus codés | `refusals {<opération>: {code, params, reasons}}` | la table des refus lit le code, pas la phrase (§ 6.1) | la phrase `…Reason` reconnue par son début ; sinon « Action refusée. » |
| K13 | Reprise à une ligne | la réponse de `resumePlan` porte `programCheck` | volet de reprise (§ 5.12) | pas de verdict dans le volet ; ④ le donne |
| K14 | Palpage échoué | erreur de `POST /api/touch-job` avec `blockProbe {failure, written, needsHoming}` | bilan de la carte Sonde (§ 4.3) | bilan au premier état reçu |

**Ce que le plan fait avant la refonte.**

| Lot du plan | Constats | Ce que la refonte en reçoit |
|---|---|---|
| S1 | C-25 (profil « LUNYEE » des simulateurs) | le banc de l'étape `parcours` (§ 11, L1) |
| S2 | C-02, C-03 (D2) | K3, K12 |
| S3 | C-01, C-04, C-05, C-06, C-18, C-57, C-58, C-61 (D1, référence, marge) | K1, K2, K7, K8, K13 |
| S4 | C-07, C-08, C-09, C-12, C-13, C-17, C-19, C-26, C-39, C-54, C-55, C-59, C-60 (arrêts, plaque surveillée) | prendre la main arrête la séquence de l'autre appareil (§ 5.3) ; refus `ETOUCH_PLATE_*`, `ETOUCH_MOTION_HOMING` |
| S5 | C-10, C-11, C-14, C-15, C-20, C-21, C-28 (champs), C-62 (D3, D4) | K4, K5, K6, K9 |
| S6 | C-22, C-23, C-24, C-37, C-38, C-40, C-41, C-46, C-63, C-65 | K7, K10, K11, K14 |
| P1 | C-01 (jamais de confirmation sur un dépassement), C-14 (Relire suit `canReadSettings`), C-40, C-47 ; réglages initiaux de la sonde dans `probe-model.js` | le dialogue de L1 garde cette défense ; l'assistant de L3b part de ces réglages |
| P2 | C-10 (veille), C-33, C-35 (règle du rendu v2, § 3.1), C-49 (version chargée et installée), C-64 | L1 vérifie la règle du rendu ; la ligne de version de Plus |
| P3 | C-16, C-24, C-30 c, C-31 (assistant), C-32, C-34, C-41, C-44, C-45, C-48, C-52, C-53 ; appels directs `pause()` et `stop()` (Q-09) | ⑤ et le volet de reprise les reprennent (L5) ; L1 complète les appels directs |

**Ce que `CONSTATS.md` et le plan confient à la refonte : le lot, et le critère de fin.**

| Constat | Ce que la refonte doit | Lot | Critère de fin |
|---|---|---|---|
| C-01 | bouton « Démarrer malgré le dépassement… » sur le contrat K2 (le plan dit « L5 » ; ④ se fait en L4) | L4 | `test-derogation.cjs` |
| D2 (plan, lot P1, point 3) | bouton [Vérifier à nouveau] (action `verifyOffset`) | L1 (action et remède), L2 (①), L4 (④) | `test-seance.cjs`, `test-remise-en-route.cjs`, `test-check-screen.cjs` |
| C-14 | la chaîne guidée après un redémarrage de CNCjs | L2 | P1 = 5 ; cas « CNCjs redémarré, alarme, version inconnue » de `test-remise-en-route.cjs` |
| C-27, C-43 | refus de la sonde sur place, effacé quand sa cause change | L1 (composant), L3b (carte) | `test-bughunt-A2-4.cjs` (a) converti |
| C-28 | diagnostic guidé de la sonde | L3b | `test-bughunt-A2-4.cjs` (b) converti dans `test-probe-diagnostic.cjs` |
| C-29 | plaque et reprise jamais masquées | L3b (plaque), L5 (reprise) | `test-bughunt-A2-2.cjs` converti |
| C-30 a, b | commandes rayées sur l'appareil qui n'a pas la main, avec [Prendre la main] | L1, L2 | `test-bughunt-A2-5.cjs` (a, b) converti |
| C-31 (bandeau, macros) | refus écrit là où l'on a touché | L1 | `test-refus.cjs` |
| C-42 | plus d'écran de préparation du palpage sur la page réelle | L3b | aucune section `screen-probe*` |
| C-46 (affichage) | raison des rapides et de l'arrêt de la broche | L4 (④), L5 (⑤) | `test-usinage-ecran.cjs` |
| C-66 | « ↻ Actualiser » retiré (CX-06) | L1 | absent de la page |
| C-67 | l'assistant ne s'ouvre plus seul | L1 | cas de `test-commissioning.cjs` |
| Q-10 | pas de bascule de place entre v1 et v2 | L5 | contrôle « mêmes places » du harnais |
| RQ-1 | pendant un palpage, « Pause » dit qu'il arrête | L1 | cas de `test-status-strip.cjs` |
| D4 a, c, d | zéro à l'origine machine ; assistant de la sonde ; diagnostic | L3a ; L3b ; L3b | `test-zero-machine.cjs`, `test-probe-assistant.cjs`, `test-probe-diagnostic.cjs` |

### 0.3 Ce que la refonte ne change pas

- Ce qu'envoie une commande machine, et ses gardes, côté serveur comme côté page (§ 5.5 du prompt). **La case du dialogue de confirmation reste** pour toutes les commandes qui l'ont aujourd'hui (§ 6.3).
- L'identité visuelle : thème « 2027 », sombre et clair, `design-tokens.css`.
- Réglages (refait le 8 novembre) : cohérence et bugs seulement, avec deux ajouts dits au § 4.7.
- Les classes `v2m-`, la regex `V2_NODE` (`test-performance-v2-safety.cjs:60`), les fichiers de `tablet-exclude.txt`. Les classes `v2n-` citées par le prompt n'ont aucune occurrence dans le dépôt : contrainte sans objet.

---

## 1. Principes et arborescence

### 1.1 Les douze règles de l'organisation

1. **Le rail est le fil de la séance.** Cinq étapes numérotées, dans l'ordre du travail : ① Machine, ② Fichier, ③ Zéro pièce, ④ Contrôle, ⑤ Usinage. Tout ce qui est rare est sous « Plus ».
2. **La page s'ouvre sur l'étape à faire.** Il n'y a plus de Menu.
3. **Chaque écran d'étape a la même forme** : un en-tête qui dit l'état de l'étape, le contenu, une barre d'étape en bas.
4. **La barre d'étape porte la cause et l'action.** À gauche : ce qui manque, en une phrase, et le bouton qui le lève. À droite : l'action principale de l'écran, toujours au même endroit (320 × 64 px).
5. **Une seule action principale par écran.** Tant que l'étape n'est pas faite, c'est l'action de l'étape. Quand elle l'est, c'est « Suite : <étape> → ».
6. **Le fil n'enferme pas.** On touche n'importe quelle étape à tout moment. Seules les gardes du serveur interdisent.
7. **Un remède agit sur place.** Le bouton d'un refus ouvre le dialogue de la commande qui lève l'obstacle, sur l'écran où l'on est. Il ne dit jamais « allez dans… ».
8. **Rien ne disparaît.** Une commande impossible reste à sa place, rayée, et sa raison est écrite à côté sans avoir à la toucher.
9. **La page ne se croit pas plus savante que le serveur.** Un bouton est actif quand le serveur le dit (`canHome`, `canLoad`, `canStart`…). La page choisit la phrase ; elle ne décide jamais qu'une commande est permise.
10. **Aucune marque n'est mémorisée.** Les « ✓ » du fil sont recalculés à chaque état reçu. Un fichier changé ou un zéro refait remet le contrôle en question sans qu'aucune règle d'oubli soit à écrire.
11. **Même organisation en v1 et en v2.** Mêmes écrans, mêmes boîtes, mêmes boutons aux mêmes places. v2 remplit certaines boîtes plus richement (§ 3).
12. **Le détail technique vit dans « Détails ».** Codes, noms de réglages, coordonnées machine, phrases du serveur : un seul volet, ouvrable de partout (§ 6.2).

### 1.2 Arborescence

```
Toujours visible
├── Bandeau (72 px) : état · âge · Broche · Vitesse · Machine · Fichier · [La main : …] · [Pause | Reprendre… | Remise en route] · [Arrêter] · cadenas · heure
└── Fil (rail, 88 px) : ① Machine  ② Fichier  ③ Zéro pièce  ④ Contrôle  ⑤ Usinage  ──  Plus

① Machine      screen-machine   liste « Pour que la machine soit prête », encart « Ce qui s'est passé », carte de connexion
   ├── volet    Détails de la machine      (port, version, course, positions machine, réglages lus)
   └── dialogues Lancer la prise d'origine machine · Déverrouiller sans prise d'origine · La main
② Fichier      screen-files     liste · aperçu · emprise, profondeur, verdict
   ├── volets   Ajouter un fichier · Détails du fichier
   └── dialogues Fiche du projet · aperçu agrandi (fixe, 3D en v2)
③ Zéro pièce   screen-jog       position et zéros · déplacer · sonde (bloc et plaque) ; laser : carte « Laser »
   ├── volets   Ma sonde (assistant) · Tester la sonde · Plaque · Autres zéros · Vitesse de déplacement · Sauvegarde des sondes
   └── dialogues Poser le zéro · Palper le bloc · Zéro Z à la plaque
④ Contrôle     screen-check     vue de dessus · vue de côté · verdict par axe · rapides ; laser : cadrage
   ├── volet    Détails du contrôle        (valeurs par axe, lignes non suivies, dérogation D1)
   └── dialogues Démarrer l'usinage · Démarrer malgré le dépassement · Cadrer le fichier · vue 3D du placement (v2)
⑤ Usinage      screen-home      aperçu · avancement · position · corrections · bilan
   ├── volets   Reprendre à une ligne · Détail du temps (v2)
   └── dialogues Reprendre l'usinage · Zéro Z à la plaque (pause de changement d'outil, fin d'usinage)
Plus           screen-more      tuiles : Journal · Réglages · Mise en service · Guide · Macros ; ligne de version
   ├── écrans   Journal (screen-history) · Réglages (screen-settings) · Mise en service (screen-commissioning) · Guide (screen-guide)
   └── volets   Macros · Exporter le journal
Transverses    volet Détails · pavé numérique · clavier texte · veille · bouclier du verrou
```

Compte : 6 entrées au rail (8 aujourd'hui avec « Retour ») ; 6 écrans (les cinq étapes et Plus) et 4 sous-écrans de Plus (16 sections aujourd'hui) ; 15 volets (11 aujourd'hui : 6 gardés, 5 supprimés, 9 nouveaux) ; 3 gabarits de dialogue (confirmation, zéro, la main).

### 1.3 Ce qui reste toujours visible

| Élément | Où | Règle |
|---|---|---|
| État de la machine (mot, icône, couleur) | bandeau | inchangé (`cncStatusStrip.describe`) ; vocabulaire du § 9.3 |
| Âge de l'information | bandeau | « à jour » ou « ancienne · 5 s » |
| Qui a la main | bandeau, bouton « La main : … » | toujours, jamais masqué pour faire de la place |
| Pause, ou Reprendre…, ou Remise en route | bandeau, emplacement 1 | toujours un des trois ; Pause rayé quand rien ne tourne ; « Arrêter le palpage » pendant un palpage au bloc |
| Arrêter | bandeau, emplacement 2 | toujours présent, jamais retardé, jamais confirmé ; rayé quand il n'y a rien à arrêter |
| Les cinq étapes et leur marque | rail | toujours, y compris sous Plus et ses sous-écrans |
| La cause et l'action de l'écran | barre d'étape | toujours sur un écran d'étape, hors de la zone qui défile |

Pause et Arrêter restent utilisables par-dessus tout volet et tout dialogue (`strip-guard.js`, inchangé).

---

## 2. Cadre commun

### 2.1 Fenêtre (1366 × 768)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ✓ Repos │ ● à jour │ BROCHE 0 tr/min │ VITESSE 0 │ MACHINE … │ FICHIER … │[La main : ici ›]│▓Pause▓│▓■ Arrêter▓│cadenas│14:02│ 72
├────────┬─────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ①✓   │ 3 · Zéro pièce                                                         À poser          (40)   │
│Machine │─────────────────────────────────────────────────────────────────────────────────────────────── │
│  ②✓   │                                                                                                 │
│Fichier │                                                                                                 │
│  ③    │        contenu de l'étape : 1246 × 520 (fenêtre de 768) · 1246 × 663 (fenêtre de 911)           │
│ Zéro   │                                                                                                 │
│ pièce  │                                                                                                 │
│  ④    │                                                                                                 │
│Contrôle│─────────────────────────────────────────────────────────────────────────────────────────────── │
│  ⑤    │ Il manque : le zéro pièce.  [remède](48)                       ┌──────────────────────────┐    │
│Usinage │                                                                │   Suite : Contrôle  →    │ 64 │
│ ────── │                                                                └──────────────────────────┘    │
│  Plus  │                                                                        (320 × 64)              │
└────────┴─────────────────────────────────────────────────────────────────────────────────────────────────┘
  (88)      x 104 → 1350 ; en-tête 40, écart 12, contenu 520, écart 12, barre 64
```

### 2.2 Bandeau (`touch/status-strip.js`)

Le bandeau garde ses cellules et ses identifiants. Quatre changements seulement :

| Élément | Identifiant | Aujourd'hui | Spec |
|---|---|---|---|
| Qui a la main | `#t-pilot` (gardé) | étiquette grise « PILOTE — … », 96 à 152 px | **bouton** de largeur fixe, 160 × 48 : bord, chevron « › », texte court « La main : ici », « La main : libre », « La main : autre » (fond ambre et icône quand c'est un autre). Le nom de l'autre appareil est dans le dialogue « La main » (§ 5.3), que le bouton ouvre, et dans la phrase de cause. |
| Déverrouiller… | `#t-unlock` | bouton vert en alarme | **supprimé du bandeau** (il menait au repos sans référence) ; la commande est dans ① |
| Remise en route | `#t-recover` (nouveau) | — | bouton de l'emplacement 1, quand la machine est en alarme hors usinage, ou arrêtée sans origine machine ; il ouvre ① (navigation, aucune commande) |
| Pause, Arrêter | `#t-pause`, `#t-stop` (gardés) | présents seulement à l'état qui les appelle | **toujours présents** ; rayés avec la raison « Aucun usinage en cours. » / « Rien à arrêter. » |

Emplacement 1 : 200 × 64, largeur fixe (elle ne change pas avec le libellé). Un seul bouton à la fois, dans cet ordre de priorité :
1. `#t-resume` « Reprendre… » : usinage en pause et `canResume`.
2. `#t-recover` « Remise en route » : alarme sans usinage ouvert, ou `jobStopped` et `homed === false`.
3. `#t-pause` « Pause » : dans tous les autres cas (actif si `canPause`). **Pendant un palpage au bloc, son libellé est « Arrêter le palpage »** : le serveur traite cette pause comme un arrêt définitif du palpage (décision documentée, RQ-1). La commande envoyée ne change pas.

**Largeurs** (calculées sur les textes mesurés par la critique de réalisation ; à confirmer par la maquette en espagnol, texte agrandi) : « La main » 160, emplacement 1 : 200, Arrêter 148, cadenas 48, heure 50, quatre écarts de 12, marge 16. Le groupe de droite fait 670 px et commence à x = 696 ; il reste 668 px aux cellules de gauche. Elles cèdent leur place dans cet ordre, selon l'état et non selon une mesure :
1. pendant un usinage ou une pause, la cellule « Machine » n'est pas affichée (son contenu est dans « Détails de la machine ») ;
2. en texte agrandi, pendant un usinage ou une pause, la cellule « Vitesse » ne l'est pas non plus (elle est sur ⑤) ;
3. si la maquette montre que cela ne suffit pas, « Broche » cède ensuite (elle est sur ⑤).

« Fichier » garde 120 px au moins pendant un usinage (règle du harnais strict) ; l'état et l'âge ne cèdent jamais.

Les libellés des valeurs suivent le glossaire : « Vitesse » remplace « Avance ». Le gel de 600 ms après un toucher sur Pause ou Reprendre (`status-strip.js`, `guarded`) est gardé et s'applique aussi à `#t-recover`.

### 2.3 Le fil (`#tabbar`, `touch/touch-shell.js`)

Six boutons `button.ks-nav[data-ks-screen]`, dans cet ordre, sans « Retour » :

| # | `data-ks-screen` | Libellé FR / EN / ES | Écran |
|---|---|---|---|
| 1 | `machine` | Machine / Machine / Máquina | `screen-machine` |
| 2 | `files` | Fichier / File / Archivo | `screen-files` |
| 3 | `jog` | Zéro pièce / Work zero / Cero pieza | `screen-jog` |
| 4 | `check` | Contrôle / Check / Control | `screen-check` (nouveau) |
| 5 | `home` | Usinage / Machining / Mecanizado (laser : Gravure / Engraving / Grabado) | `screen-home` |
| — | `more` | Plus / More / Más | `screen-more` (nouveau, remplace `screen-menu`) |

Les valeurs `machine`, `files`, `jog`, `home` sont celles d'aujourd'hui : le harnais et `cncShell.go` continuent de les connaître.

Tuile d'étape : 72 × 88 px (le rail fait 88 px, avec 8 px de marge interne de chaque côté), écart 12 px (cinq étapes : 488 px ; avec le trait et « Plus » : 564 px sur les 696 px du rail à 768 px) :
- ligne 1 : le numéro dans un rond de 28 px, avec une marque en haut à droite du rond ;
- ligne 2 : le nom, 16 px, sur deux lignes si besoin. « Zéro / pièce » se coupe à l'espace. Un nom de plus de 60 px porte un tiret conditionnel dans le catalogue (comme `Segui\u00admiento` aujourd'hui) : `Ma\u00adchine`, `Con\u00adtrôle`, `Usi\u00adnage`, `Gra\u00advure`, `Má\u00adquina`, `Meca\u00adni\u00adzado`, `Gra\u00adbado`, `Machi\u00adning`, `Engra\u00adving`. En texte agrandi (18 px), « Contrôle » et « Machine » se coupent donc au lieu de déborder.
- Un trait sépare ⑤ de « Plus », qui est en bas du rail (72 × 64, icône « ··· »).
- En format compact (fenêtre de moins de 650 px de haut) : tuiles de 72 × 56, le numéro et sa marque seulement ; le nom reste dans l'étiquette lue par un lecteur d'écran. Cinq étapes, le trait et « Plus » : 380 px.

Attributs de chaque étape : `data-seance-step="1"` à `"5"` et `data-seance-state` (pas `data-step`, déjà pris par les pas de déplacement `#steps .step[data-step]`) :

| `data-seance-state` | Marque | Couleur | Sens |
|---|---|---|---|
| `fait` | « ✓ » | neutre (jamais vert vif) | l'étape est faite, maintenant |
| `suite` | rond cerclé | couleur d'accent | c'est l'étape à faire |
| `attente` | aucune | atténuée | une étape d'avant n'est pas faite |
| `alerte` | « ! » | ambre ; rouge pour une alarme | quelque chose d'anormal ici ; le mot est dans l'en-tête de l'écran |
| `inconnu` | « ? » | atténuée | serveur injoignable |

L'écran affiché est marqué comme aujourd'hui (`.active`, fond et trait d'accent, `aria-current`). L'étiquette lue par un lecteur d'écran dit tout : « Étape 3, Zéro pièce : à poser ». Les états viennent du module `seance.js` (§ 6.4). Sous Plus et ses sous-écrans, « Plus » est marqué actif et les cinq étapes gardent leur marque.

### 2.4 L'écran d'étape

Chaque écran d'étape (`machine`, `files`, `jog`, `check`, `home`) a trois zones créées par `touch-shell.js` :

| Zone | Classe et identifiants (`<s>` = nom de l'écran) | Hauteur | Contenu |
|---|---|---|---|
| En-tête | `.ks-step-head` ; titre `#step-<s>-title`, état `#step-<s>-state`, contexte `#step-<s>-context` | 40 px | « 3 · Zéro pièce » à gauche ; le mot d'état à droite (16 px gras, avec l'icône de la marque) ; au milieu le contexte (nom du fichier, heure du zéro) |
| Contenu | `.ks-step-body` | 520 px (fenêtre de 768), 663 px (fenêtre de 911) | les cartes de l'écran |
| Barre d'étape | `.ks-stepbar` ; cause `#step-<s>-cause`, remède `#step-<s>-remedy`, « Détails » `#step-<s>-details`, action `#step-<s>-main` | 64 px | voir ci-dessous |

Barre d'étape, de gauche à droite :
1. **La cause** : icône + « Il manque : » + une phrase (16 px, deux lignes au plus). Elle prend la place que laissent les boutons : 360 px au moins, 620 px quand il n'y a qu'un remède. Quand rien ne manque : la phrase d'état de l'écran (« Tout est prêt. », « Usinage en cours. »), sans « Il manque ».
2. **Le remède** (48 px de haut, 300 px au plus : « Buscar origen… » et « Reanudar desde la línea 1 219… » y tiennent en texte agrandi) : le bouton qui lève la cause, quand il existe. Sur l'écran dont c'est l'action principale, il n'est pas répété : c'est le bouton de droite.
3. **Détails** (120 × 48) : seulement quand la cause a un détail technique (§ 6.2).
   La barre porte au plus deux boutons entre la cause et l'action : un remède et « Détails », ou deux remèdes. Deux remèdes n'existent que sur ④ pour un dépassement (refaire le zéro, ou choisir un autre fichier) : « Détails du contrôle » est alors dans la carte du verdict, pas dans la barre. Somme la plus large, en français : cause 540 + remèdes 151 et 199 + action 320 + trois écarts de 12 = 1246.
4. **L'action principale** (320 × 64, collée à droite, x 1030 → 1350) : pleine (couleur d'accent) quand c'est le geste attendu ; en contour quand un autre bouton de l'écran est le geste attendu (cas de ③, § 4.3) ; rayée avec la cause quand le serveur la refuse.

Règles de la barre :
- Après tout changement de libellé de l'action principale, et après tout changement d'écran, le bouton ignore les touchers pendant 600 ms (un double toucher n'atteint jamais le bouton qui remplace le premier).
- La barre ne défile jamais avec le contenu.
- Hors des deux formats de référence (fenêtre de moins de 1100 × 650, `body.t-compact`, portrait) : les cartes du contenu s'empilent dans l'ordre donné pour chaque écran et le contenu défile ; la barre passe sur deux rangées (la cause, puis les boutons). Rien d'autre n'est conçu pour ces formats ; le harnais strict y reste exigé.

### 2.5 Page d'arrivée

- La page s'ouvre sur ① (qui sait dire « hors ligne » et « non connectée »).
- Au premier état reçu du serveur, si l'opérateur n'a encore rien touché, la page va une seule fois à l'étape donnée par `CNCSeance.evaluate(...).suite` (§ 6.4) : ⑤ si un usinage est en cours, en pause ou en alarme ; sinon la première étape non faite ; sinon ④.
- Le souvenir du dernier écran (`cncjs-touch-last-screen`) et la barre « Reprendre où j'en étais » disparaissent.
- Au départ d'un usinage, la page va sur ⑤ (`job-follow.js`, inchangé, réglable dans Réglages).

### 2.6 Styles communs des boutons

| Rôle | Aspect | Usage |
|---|---|---|
| Principal | plein, couleur d'accent, 64 px | un seul par écran et par dialogue |
| Secondaire | contour, 48 px (64 px pour une commande qui fait bouger la machine, pose un zéro, la déverrouille ou corrige une vitesse) | tout le reste |
| Arrêt | plein rouge, icône carrée + mot | Arrêter, Arrêter l'usinage, Arrêter le palpage |
| Attention | plein ambre, icône + mot | Pause ; le bouton de la dérogation D1 |
| Rayé | motif rayé actuel (`:disabled`), texte atténué | commande refusée ; sa raison est écrite dans la barre d'étape ou dans la zone de cause de sa carte ; un toucher la redit (toast `#ks-why`, inchangé) |

Le vert vif n'est plus un fond de bouton ni une couleur d'état normal : « Repos », « Chargé », « Libre », « Tient » sont en couleur neutre avec leur icône. Vif = anormal (ambre : à regarder ; rouge : alarme, arrêt, dépassement), toujours avec une icône ou un mot.

---

## 3. Rendu v2 : la règle unique, et ce que v1 Éco montre à la place

### 3.1 La règle

> **Sur un appareil éligible, le rendu v2 s'affiche au premier repos sûr de la session de page, et il y reste. Avant ce repos, la page est en v1.**

- **Appareil éligible** (inchangé, `v2Eligible`) : préférence v2 active, profil Performance, machine déclarée CNC, GPU matériel, fenêtre d'au moins 1300 × 880.
- **Repos sûr** (inchangé, `v2Idle`) : état récent, `Idle`, aucun usinage, broche arrêtée, aucune commande en cours, flux ouvert ; page visible et non verrouillée.
- **Ce qui change** : une alarme, une prise d'origine, un déverrouillage, un déplacement ou un palpage vus avant ce repos ne ferment plus la v2. Après une mise en route normale (port ouvert → Alarme → prise d'origine → Repos), la Surface passe en v2.
- **Deux gardes existantes, gardées telles quelles** :
  1. page ouverte pendant un usinage ou une pause : la session reste en v1 jusqu'au rechargement (documenté, testé : cas `late` de `test-v2-gate.cjs`) ;
  2. amorçage de la v2 interrompu par une activité : v1 jusqu'au rechargement (`unsafe-bootstrap`).
- **Qui la réalise** : c'est le constat C-35, confié au lot de page P2 du plan des corrections ; son test de preuve (`test-bughunt-V3-1.cjs`) exige déjà que « Alarme → prise d'origine → Repos » et « Alarme → déverrouillage → Repos » ouvrent la v2. L1 rejoue ces cas dans `test-v2-gate.cjs` (§ 11). Attention : le texte du plan (lot P2, point 4) garde `canStop` parmi les conditions du verrou, et `canStop` est vrai pendant une prise d'origine (`s/job-service.js:1310`) : écrit ainsi, le verrou se poserait pendant la mise en route. La règle qui fait foi est celle de ce paragraphe ; si L1 trouve un cas rouge, il corrige `tablet-profile.js` (fichier de la page) et le dit dans son rapport.
- **Dans le code** (`touch/tablet-profile.js`, fonction `v2Observe`) : `v2Blocked` n'est posé que si `m.workflow` vaut `running` ou `paused`. Les autres conditions de la ligne actuelle (état différent de `Idle`, `canStop`, `loading`, `homing`, `probing`, `probeBusy`, broche, déplacement, `d.busy`, `d.halt`, `d.systemCommand`) sortent du verrou : elles retardent seulement, par `v2Idle()`.
- **Pourquoi ne pas aller plus loin** : choisir le rendu à l'ouverture sans attendre le repos chargerait WebGL pendant un usinage, ce qui n'a jamais été mesuré.
- **Ce que l'opérateur lit** dans Réglages › Machine et performances, sur une seule ligne d'état : « Rendu Performance actif. » / « Rendu Performance en attente du repos de la machine. » / « Rendu Éco : page ouverte pendant un usinage. Rechargez-la au repos. » / « Rendu Éco : <raison de l'appareil>. »

Comme l'organisation est la même, le passage de v1 à v2 ne déplace aucune commande : c'est vérifié par le harnais (critère de fin de L5, § 11).

### 3.2 Ce que v2 ajoute, et ce que v1 Éco montre à la même place

| Élément propre à v2 | Écran | v1 Éco, même boîte |
|---|---|---|
| Aperçu 3D (`preview-gl.js`) | ②, ⑤ | vues fixes 2D / Iso / Face / Côté / Dessus (images) ; en laser, la vue laser 2D |
| Tableau « Choisi / Chargé dans la machine » | ② | le titre de la carte dit le fichier choisi ; une ligne de texte « Chargé : … » |
| Vue 3D du placement (`origin-preview.js`) | ④, bouton [Vue 3D du placement] (48) | le bouton n'existe pas ; les deux dessins SVG de ④ sont communs aux deux rendus et suffisent |
| Courbe de vitesse, bande « Séquence prévue », légende | ⑤, sous l'aperçu, dans une fenêtre de 911 | rien : en v1 l'aperçu garde toute la hauteur ; [Arrêter l'usinage] est à la même place dans les deux rendus |
| Volet « Détail du temps » | ⑤, bouton [Détail du temps] (48) | le bouton n'existe pas ; « Reste 12 min » seul |
| Journal à contexte, sources « Cette session / Serveur » | Journal | Journal v1 (filtres Tout / Erreurs / Usinages / Alarmes, pages) |
| Blocs « Condition actuelle » et « Paramètres de course » (`#perf-v2-machine`, classes `v2m-`) | volet « Détails de la machine » | le tableau de course en texte (contenu de l'ancien écran Limites) |
| Entrée « Interface Performance v2 » | Réglages | absente |

En Éco : aucune requête, minuterie ni image de v2 (inchangé, vérifié par l'étape `v2` du harnais). Les dessins nouveaux (§ 6.6, § 6.7) sont du SVG tracé depuis des nombres déjà reçus : ni WebGL, ni minuterie. Les seules requêtes nouvelles, communes aux deux rendus, sont le contrôle du fichier choisi (§ 4.2 : une requête par fichier touché) et le plan de reprise à l'ouverture de son volet (§ 5.12) : jamais périodiques.

Emplacements v2 (`cncShell.v2Mounts`) : les noms `home`, `files`, `prepare`, `machine`, `history`, `settings` sont gardés. `prepare` est hébergé par `screen-check` (lot L3a), `machine` par le volet « Détails de la machine » (lot L2), où il n'est rendu que volet ouvert.

---

## 4. Les écrans

Pour chaque écran : le fil de fer dans une fenêtre de 768 (1246 × 648), dans un état nommé au-dessus du dessin ; ce que la fenêtre de 911 et le rendu v2 ajoutent ; le contenu selon l'état ; l'action principale ; ce qui est rayé avec sa raison ; ce qui n'est jamais masqué. Un dessin ne montre qu'un état : chaque ligne du tableau d'états d'un écran est une variante à dessiner par les maquettes, avec la barre d'étape que le tableau lui donne. Les phrases de cause et leurs remèdes sont celles du § 6.4 ; elles ne sont pas répétées ici.

### 4.1 ① Machine (`screen-machine`)

But : tout ce qui met ou remet la machine en état, dans l'ordre, au même endroit.

État dessiné : après une alarme pendant un usinage, usinage déjà arrêté.

```
1 · Machine                                                                              Origine à reprendre
┌ Pour que la machine soit prête (790) ─────────────────────────────┐ ┌ Ce qui s'est passé (444) ───────────┐
│ ✓  Machine connectée                                              │ │ ! Alarme 2 : la machine a dépassé   │
│ ✓  La main : cet appareil                                         │ │   sa course.                        │
│ ✓  Réglages lus                                    [Relire](48)   │ │ La machine a redémarré.             │
│ ✓  Usinage arrêté à la ligne 1 234                                │ │ Perdu : la position de la machine.  │
│ !  Origine machine à reprendre                                    │ │ Gardé : le fichier chargé.          │
│ ○  Zéro pièce : à vérifier après la prise d'origine               │ │ Zéro pièce : à vérifier après la    │
│ ○  Reprendre l'usinage à la ligne 1 219                           │ │   prise d'origine.                  │
└───────────────────────────────────────────────────────────────────┘ │                      [Détails](48)  │
 [Déverrouiller sans prise d'origine…](64)   [Détails de la machine](48)└─────────────────────────────────────┘
────────────────────────────────────────────────────────────────────────────────────────────────────────────
 Il manque : l'origine machine.                                         [ Prise d'origine machine… ](320×64)
```

Hauteurs à 768 : titre de carte 32 + 7 lignes de 52 + marges 24 = 420 ; rangée des deux boutons 64 + 12 ; total 496 ≤ 520. Sept lignes au plus : la ligne `service` n'est pas affichée tant qu'un incident est ouvert. Dans une fenêtre de 911 (v1 et v2) : les lignes passent à 64 px, le reste va à l'encart ; rien n'est ajouté.

Les autres barres de cet écran :

```
 La machine n'est pas connectée.                                         [ Connecter la CNC ](320×64)       port fermé
 La machine est prête.                                                   [ Suite : Fichier → ](320×64)      prête
```

**La liste** (`#machine-list`, une ligne = `li[data-line]` avec `data-line-state` = `fait`, `suite`, `attente` ou `alerte`). Ordre fixe ; la première ligne qui n'est pas faite donne l'action principale.

| `data-line` | Présente | Fait | Pas fait | Action principale |
|---|---|---|---|---|
| `connexion` | toujours | « Machine connectée » | « Machine non connectée » | [Connecter la CNC] |
| `main` | toujours | « La main : cet appareil » ou « La main : libre » | « C'est « PC atelier » qui a la main » | [Prendre la main] |
| `reglages` | toujours ; porte [Relire] (48), jamais masqué, actif quand `canReadSettings` (aussi en alarme) | « Réglages lus » | « Réglages pas encore lus » ; pendant la lecture (elle part seule) : « Lecture des réglages… » | [Relire les réglages] |
| `arret` | seulement si un usinage est ouvert pendant une alarme, ou vient d'être arrêté | « Usinage arrêté à la ligne N » | « Un usinage est encore ouvert » | [Arrêter l'usinage] |
| `origine` | toujours | « Origine machine prise » | « Origine machine à prendre » ; après un incident : « Origine machine à reprendre » ; en cours : « Prise d'origine en cours… » | [Prise d'origine machine…] |
| `zero` | seulement après un incident, ou tant que `workOffset.state` n'est pas `proven` | « Zéro pièce : vérifié » (`proven`) | selon `workOffset` (tableau ci-dessous) | aucune (information ; ses boutons sont sur la ligne) |
| `reprise` | seulement si le fichier chargé a été arrêté avant la fin (`jobStopped`) et que sa ligne d'arrêt est connue (`stoppedAtLine`, `stoppedFile` = le fichier chargé) | — | « Reprendre l'usinage à la ligne N » | [Reprendre à la ligne N…] (ouvre le volet du § 5.12) |
| `service` | seulement si la mise en service n'a jamais été faite pour ce port, et qu'aucun incident n'est ouvert | — | « Mise en service jamais faite pour cette machine » avec [Mise en service…] (48) | aucune (ne bloque rien) |

**La ligne `zero`** (décision D2 : le serveur vérifie seul le zéro pièce après une prise d'origine, en quelques secondes) :

| `workOffset` | Texte de la ligne | Boutons sur la ligne (48) |
|---|---|---|
| origine machine pas encore prise | « Zéro pièce : à vérifier après la prise d'origine » | — |
| `unknown` ou `checking` | « Zéro pièce : la machine le vérifie… » | — |
| `proven` | « Zéro pièce : vérifié » ; après un incident : « Zéro pièce : gardé, vérifié » | — |
| `failed`, `ETOUCH_OFFSET_UNCONFIRMED` | « Zéro pièce : la machine ne l'a pas confirmé » | [Vérifier à nouveau] (`verifyOffset`, actif si `canVerify`) |
| `failed`, `ETOUCH_OFFSET_MISMATCH` | « Zéro pièce : à refaire » | [Refaire le zéro pièce] (ouvre ③) · [Vérifier à nouveau] |
| `failed`, `ETOUCH_OFFSET_SETTINGS` | « Zéro pièce : réglages à relire d'abord » | [Relire] |
| champ absent | « Zéro pièce : non vérifié » | [Détails] |

Quand toutes les lignes sont faites : en-tête « Prête », cause « La machine est prête. », action principale « Suite : Fichier → » (ou l'étape suivante non faite).

**Carte de connexion** (`#ks-connect`, le composant actuel de `connect-cnc.js`, déplacé du Menu). Elle prend la place de la liste tant que la machine n'est pas connectée :

```
┌ Machine non connectée ────────────────────────────────────────────┐
│ Connecter la machine ?                                            │
│ La machine redémarre. Elle sera en alarme jusqu'à la prise        │
│ d'origine.                    [Détails](48) [Annuler](48) [Ouvrir](64)│
└───────────────────────────────────────────────────────────────────┘
```

- L'action principale de la barre est [Connecter la CNC] : elle lance la recherche (`cncConnectCnc.search()`). La question et le bouton [Ouvrir] sont **dans la carte**, en haut de l'écran, loin de la barre : deux touchers au même endroit n'ouvrent jamais le port.
- Un seul port : son nom (`/dev/ttyUSB0`) est dans [Détails]. Plusieurs ports : un bouton de 64 px par port dans la carte, nommé par son port (c'est la seule chose qui les distingue), puis [Ouvrir].
- Pendant la question, l'action de la barre est rayée (« Répondez dans la carte ci-dessus. »).
- [Connecter la CNC] n'est jamais rayé par la cause qu'il lève (§ 6.4).

**Encart « Ce qui s'est passé »** (`#machine-incident`) : présent seulement tant qu'un incident est ouvert (§ 6.9). Sans incident, la liste prend toute la largeur.

**Boutons secondaires**
- [Déverrouiller sans prise d'origine…] (`#machine-unlock`, 64 px) : toujours visible ; rayé hors alarme avec « Sert seulement quand la machine est en alarme. ». C'est la seule place de la commande (avec la mise en service).
- [Détails de la machine] (`#machine-details-open`, 48 px) : volet du § 5.9.

**États de l'écran**

| État | En-tête | Liste | Action principale |
|---|---|---|---|
| Serveur injoignable | « Hors ligne » | lignes atténuées, « information ancienne » | rayée ; remède [Recharger la page] |
| Port fermé | « Non connectée » | carte de connexion | [Connecter la CNC] |
| Connectée, réglages inconnus (CNCjs a redémarré), au repos ou en alarme | « Réglages à lire » | `reglages` en tête des lignes à faire ; « Lecture des réglages… » pendant la lecture automatique | [Relire les réglages], active quand `canReadSettings` ; rayée pendant la lecture (« Lecture des réglages en cours. ») |
| Alarme au repos | « Alarme N » (rouge) | `origine` en alerte ; encart | [Prise d'origine machine…] (le serveur l'accepte en alarme) |
| Alarme pendant un usinage | « Alarme N » | `arret` en alerte | [Arrêter l'usinage] |
| Repos, origine pas prise | « Origine à prendre » | `origine` à faire | [Prise d'origine machine…] |
| Prise d'origine en cours | « Prise d'origine… » | `origine` « en cours… » | rayée (« Prise d'origine en cours. ») ; Arrêter est dans le bandeau |
| Un autre appareil a la main | « Main ailleurs » (ambre) | `main` en alerte | [Prendre la main] |
| Zéro pièce non confirmé | « Zéro pièce à vérifier » (ambre) | `zero` en alerte, avec ses boutons | « Suite : … → » (le départ reste refusé sur ④) |
| Prête | « Prête » | tout fait | « Suite : … → » |
| Usinage en cours ou en pause | « Usinage en cours » | lignes faites, sans bouton actif | « Suite : Usinage → » |

Jamais masqué : les lignes `connexion`, `main`, `reglages`, `origine` ; [Relire] ; [Déverrouiller sans prise d'origine…] ; [Détails de la machine].

### 4.2 ② Fichier (`screen-files`)

But : choisir, voir l'emprise et la profondeur, savoir tout de suite si le fichier tient, charger. On reste sur l'écran après le chargement.

État dessiné : un fichier choisi, pas encore chargé.

```
2 · Fichier                                   planche_400x70.nc                               Choisi
┌ Fichiers (520) ──────────────────────────┐ ┌ planche_400x70.nc (714) ──────────────────────────────────┐
│ [Rechercher…](48)        [★ Favoris](48) │ │ ┌ aperçu 400 × 280 ──────────────┐  Emprise                │
│ ▌vignette  planche_400x70.nc    Choisi   │ │ │ (v1 : vues fixes ; v2 : 3D)    │  400 × 70 mm            │
│ ▌vignette  ebauche_coffret.nc   Chargé   │ │ │                                │  Profondeur sous le zéro│
│ ▌vignette  finition_coffret.nc           │ │ │                                │  20,8 mm                │
│ ▌vignette  plaque_test.nc      (4 × 80)  │ │ └────────────────────────────────┘  Chargé : ebauche_…    │
│ [← Précédents](48)       [Suivants →](48)│ │ [2D][Iso][Face][Côté][Dessus](48)       [Agrandir](48)    │
└──────────────────────────────────────────┘ │ ! Descend 15 mm trop bas avec le zéro pièce actuel.       │
                                             │ [+ Ajouter un fichier] [Détails du fichier] [Fiche du projet] (48)
                                             └───────────────────────────────────────────────────────────┘
────────────────────────────────────────────────────────────────────────────────────────────────────────────
 Fichier choisi. Chargez-le pour continuer.                                  [ Charger ce fichier ](320×64)
```

La barre, une fois le fichier chargé :

```
 Fichier chargé. Le zéro Z sera à refaire.  [Voir le contrôle](48)           [ Suite : Zéro pièce → ](320×64)
```

Hauteurs à 768 : à gauche, titre 32 + recherche 48 + 4 lignes de 80 + pages 48 + 2 écarts de 12 + marges 24 = 496 ; à droite, titre 32 + aperçu 280 + vues 48 + verdict 48 + boutons 48 + 3 écarts de 12 + marges 24 = 516. Dans une fenêtre de 911 : 6 lignes (656 px) et un aperçu de 423 px de haut. `touch-shell.js` (`fitLibrary`) annonce 4 lignes sous 880 px de haut de fenêtre, 6 au-delà, 3 en format compact (5 et 3 aujourd'hui). La RT passe donc de 5 à 4 lignes par page : une page de plus à tourner au pire, aucune fonction perdue.

- Toucher une ligne **choisit** le fichier (`button.library-file[data-file]`, inchangé). L'aperçu, l'emprise et la profondeur s'affichent ; la page demande au serveur le contrôle de course de ce fichier avec le zéro actuel (`{action: 'check', file}`, nouvelle fonction `cncJobControls.checkFile(file)`). La réponse en retard d'un autre fichier est ignorée.
- **Profondeur sous le zéro** (`#files-depth`) : `−zMin` du contrôle (à défaut, du fichier d'aperçu), en grand, avant tout chargement. Si le fichier ne descend pas sous le zéro : « Ne descend pas sous le zéro ».
- **Emprise** (`#files-extent`) : largeur × longueur en mm.
- **Verdict** (`#files-verdict`, une ligne, icône + phrase) — source unique : le contrôle du serveur. {N} est le `over` du serveur (K1), jamais un calcul de la page.

| Contrôle | Phrase | Bouton sur la ligne |
|---|---|---|
| `validated` | « Tient dans la machine avec le zéro pièce actuel. » | — |
| `outside` en Z vers le bas (`ETOUCH_TRAVEL_TOO_LOW`) | « Descend {N} mm trop bas avec le zéro pièce actuel. » | — avant le chargement ; [Voir le contrôle] après |
| `outside` en Z vers le haut (`ETOUCH_TRAVEL_TOO_HIGH`) | « Monte {N} mm trop haut avec le zéro pièce actuel. » | idem |
| `outside` en X ou Y (`ETOUCH_TRAVEL_BEYOND`) | « Dépasse de {N} mm {côté} avec le zéro pièce actuel. » | idem |
| `unknown`, zéro pièce pas encore vérifié (`ETOUCH_CHECK_OFFSET_UNPROVEN`) | « Course pas encore vérifiée : la machine vérifie le zéro pièce. » | — (le verdict arrive seul) |
| `unknown`, origine machine pas prise | « Course non vérifiée : origine machine pas prise. » | [Prise d'origine machine…] |
| `unknown`, autre raison | « Course non vérifiable pour ce fichier. » | [Détails] |
| pas de réponse, ou erreur | « Contrôle indisponible. » | [Réessayer] (renvoie la même demande `check`) |

Quand `workOffset.state` passe à `proven`, la page redemande une fois le contrôle du fichier choisi.

- **Action principale** : « Charger ce fichier » quand le fichier choisi n'est pas le fichier chargé ; « Suite : Zéro pièce → » ou « Suite : Contrôle → » quand il l'est. Le chargement ne bouge rien et ne quitte pas l'écran. Un dépassement n'empêche pas de charger : il sera refusé au départ (D1).
- **Une seule action pleine** : [+ Ajouter un fichier] est en contour.
- Rayé avec sa raison : « Charger ce fichier » pendant un usinage (« Un usinage est en cours. » [Voir l'usinage]) ; machine non connectée ; main ailleurs.
- Jamais masqué : la liste, l'emprise, la profondeur, la ligne de verdict (elle dit « Choisissez un fichier. » quand rien n'est choisi).
- Supprimés : l'arrivée forcée sur Suivi après le chargement, « Ouvrir le suivi → », le volet « Dimensions XY » (les dimensions sont sur l'écran), le volet « Préparer le travail », le choix du port (il part dans « Détails de la machine »), les phrases « Correspondance inconnue : empreinte… » (dans « Détails du fichier »).

v2 : aperçu 3D ; le tableau « Choisi / Chargé dans la machine » prend la place de la ligne « Chargé : … ».

### 4.3 ③ Zéro pièce (`screen-jog`)

But : tous les zéros et tous les palpages, avec les flèches, sur un seul écran.

État dessiné : machine prête, zéro pas encore posé, sonde décrite.

```
3 · Zéro pièce                                                                                  À poser
┌ (380) ─────────────────────────┐ ┌ (456) ──────────────────────────────┐ ┌ (386) ─────────────────────────┐
│ X   66,952 mm  [Zéro X ici](64)│ │          [ Y+ ]            [ Z+ ]   │ │ ● Libre            [Tester](48)│
│ Y   10,000 mm  [Zéro Y ici](64)│ │  [ X− ]  1 mm   [ X+ ]              │ │ [XYZ] [ Z ] [ X ] [ Y ]   (64) │
│ Z   −1,000 mm  [Zéro Z ici](64)│ │          [ Y− ]            [ Z− ]   │ │ ┌ dessin de départ 362 × 148 ┐ │
│ [     Zéro XYZ ici     ](64)   │ │   (flèches 96 × 96, écart 12)       │ │ │ bloc, coin, zone, fraise   │ │
│ [Autres zéros…](48)            │ │ [0,1]  [1]  [10]  [25]         (48) │ │ └────────────────────────────┘ │
│ [Position machine](48)         │ │ [50]  [100]  [    Continu    ] (48) │ │ Fraise Ø [ 6 mm ] [Ma sonde…]  │
└────────────────────────────────┘ │ [Vitesse · 1 000 mm/min…](48)       │ │ [  Palper au bloc XYZ…  ](64)  │
                                   └─────────────────────────────────────┘ │ [  Zéro Z à la plaque…  ](64)  │
                                                                           └────────────────────────────────┘
────────────────────────────────────────────────────────────────────────────────────────────────────────────
 Il manque : le zéro pièce. Placez la fraise au-dessus du coin du bloc.         [ Suite : Contrôle → ](320×64)
```

Les trois cartes de ③ n'ont pas de titre visible (leur nom est dans `aria-label` : « Position pièce », « Déplacer », « Sonde ») : leur contenu les nomme, et la place sert aux commandes.

Largeurs : 380 + 12 + 456 + 12 + 386 = 1246. Hauteurs à 768 (marges de carte 24) : colonne 1 = 3 × 64 + 64 + 48 + 48 + 5 × 12 + 24 = 436 ; colonne 2 = 312 + 3 × 48 + 3 × 12 + 24 = 516 ; colonne 3 = 48 + 64 + 148 + 48 + 64 + 64 + 5 × 12 + 24 = 520. Dans une fenêtre de 911 (la Surface, v1 et v2), les 143 px de plus vont au dessin de départ (291 px) : les boutons sous le dessin sont à la même place dans les deux rendus.

**Colonne « Position pièce »** (identifiants gardés : `#jog-zero-x`, `#jog-zero-y`, `#jog-zero-z`, `#jog-zero-xyz`)
- Trois lignes : la lettre de l'axe, la position pièce, le bouton « Zéro X ici » (136 × 64). Écart de 12 px entre les trois boutons (1 px aujourd'hui en v2).
- [Zéro XYZ ici] (64) ; en laser sans Z : [Zéro XY ici] (`laser-z.js`, inchangé).
- [Autres zéros…] (`#zero-more-open`) : volet du § 5.8 (zéro d'un axe à l'origine machine, D4).
- [Position machine] (`#zero-machine-open`) : ouvre « Détails » avec les trois positions machine. Le tableau « Machine / Travail » disparaît de l'écran.

**Colonne « Déplacer »** (identifiants gardés : `.jog[data-axis][data-dir]`, `#steps .step[data-step]`, `#ks-jog-settings`)
- La croix et la colonne Z sont toujours visibles, en v1 comme en v2. « Déplacer la machine… », « Revenir à la comparaison » et « Poser X Y ici… » disparaissent.
- Les pas restent ceux d'aujourd'hui, sur deux rangées (grille actuelle de quatre colonnes de 99 px) : 0,1 · 1 · 10 · 25, puis 50 · 100 · « Continu » sur deux colonnes (210 px). Le pas choisi est rappelé au centre de la croix ; le libellé « Pas · mm » disparaît.
- Un pas que le serveur ne permet pas (origine machine pas prise) est rayé avec sa raison ; aujourd'hui il est masqué (`real-motion.js:422`). C'est un changement d'affichage, pas de garde.
- [Vitesse · N mm/min…] : volet existant.
- Relâcher une flèche tenue envoie toujours l'arrêt du déplacement, quelle que soit la cause affichée (§ 6.4).

**Colonne « Sonde »** (`#probe-card`, CNC seulement ; module `touch/zero-piece.js`)
- Ligne 1 : le voyant (`#probe-signal`, § 6.5) et [Tester] (`#probe-test`, volet du § 5.6).
- Ligne 2 : le choix du palpage, quatre boutons `[data-probe-operation]` (81 × 64) : XYZ, Z, X, Y. **XYZ est choisi à chaque arrivée sur l'écran** ; le choix n'est pas retenu d'une fois sur l'autre. Le bouton de la ligne 5 dit donc toujours « Palper au bloc XYZ… » quand on arrive.
- Ligne 3 : le dessin de départ (`#probe-diagram-host`, § 6.6), 148 px avec sa légende d'une ligne. Il change avec le choix.
- Ligne 4 : « Fraise Ø » et son champ (`#probe-diameter`, pavé numérique), puis [Ma sonde…] (`#probe-setup-open`, volet du § 5.5). Le champ est rayé pour Z seul (« Le diamètre ne sert pas pour Z. »).
- Ligne 5 : [Palper au bloc XYZ…] (`#probe-start` ; le libellé suit le choix : « Palper au bloc Z… », « … X… », « … Y… »).
- Ligne 6 : [Zéro Z à la plaque…] (`#probe-plate-start`).

**Ce que fait [Palper au bloc …]**, dans cet ordre :
1. Il manque une mesure pour le palpage choisi : le bouton est actif et ouvre l'assistant « Ma sonde » (§ 5.5). C'est une navigation : rien n'est demandé au serveur.
2. Les mesures sont là et le serveur accepte (`canBlockProbe`) : la page demande le ticket et ouvre le dialogue « Palper le bloc » (§ 5.2).
3. Les mesures sont là et le serveur refuse (`canBlockProbe` faux) : le bouton est rayé, et la cause est écrite dans la zone du dessin.

**La zone de cause de la carte** (`#probe-cause`) prend la place du dessin (148 px) quand un des deux palpages est refusé : la phrase (deux lignes), ses coches quand elle en a, son remède (48 px). Seule exception : le remède « Voir le dessin de départ » garde le dessin, l'entoure, et écrit la phrase à la place de sa légende. Exemples :
- « Avant de palper : touchez le bloc avec la fraise, puis écartez-le. » avec deux coches, « contact vu » et « libéré », qui suivent `probeInput.test.stage` (K9) ; le bouton se libère seul quand les deux sont cochées ;
- « La sonde touche déjà. Écartez le bloc de la fraise. » [Pourquoi ?] ;
- « La machine vérifie le zéro pièce. Attendez quelques secondes. » (D2).

Un refus reçu à la demande du ticket alors que `canBlockProbe` reste vrai (course du palpage, fraise hors de la zone de départ) s'écrit au même endroit. Le bouton reste actif, parce que le serveur le dit possible : la cause reste écrite jusqu'à ce qu'une de ses données change (position de la machine, palpage choisi, mesures, diamètre), et un nouveau toucher redemande au serveur (§ 6.1, règle 1).

**Pendant un palpage** (bloc ou plaque) : [Palper au bloc …] devient [Arrêter le palpage] (`#probe-stop`, rouge, même place, appelle `cncJobControls.stop()`) ; la zone du dessin porte l'avancement (« Étape 8 / 22 · X · approche » et une barre ; pour la plaque : « Zéro Z à la plaque en cours… ») ; les flèches, les zéros et l'autre palpage sont rayés (« Palpage en cours. »).

**Après un palpage**, la zone du dessin porte le bilan (`#probe-outcome`) jusqu'au prochain toucher sur l'écran :

| Fin | Source | Bilan | Remède |
|---|---|---|---|
| Bloc réussi | `blockProbe` : `state: 'done'`, `written: 'yes'` | « Zéro pièce posé : X 0 · Y 0 · Z 10,000. » (les axes palpés) | — ; « Suite : Contrôle → » devient pleine |
| Plaque réussie | `zeroZ` sans `failed` | « Zéro Z posé à la plaque. X et Y n'ont pas changé. » | — |
| Arrêté par l'opérateur | `written: 'no'`, `ETOUCH_PROBE_STOPPED` ou `_PAUSED` | « Palpage arrêté. Le zéro pièce n'a pas changé. » | Relancer le palpage |
| Échec avant d'écrire | `written: 'no'`, autre code | la phrase de la famille du refus (§ 9.2), puis « Le zéro pièce n'a pas changé. » | celui de la famille |
| Écriture incertaine | `written: 'uncertain'` | « Le zéro pièce est peut-être changé : refaites-le. » | Relancer le palpage |
| Position perdue | `needsHoming` vrai, ou `homed` faux après l'arrêt | la ligne ci-dessus, puis « La machine a perdu sa position. » | Remise en route |

Il n'y a plus d'écran de résultats ; le détail des contacts est dans « Détails » et dans le Journal. Le repère (G54…) n'est plus un choix : le palpage vise le zéro pièce actif de la machine (`machine.operator.wcs`). Son nom est dans « Détails ».

**Une seule action pleine.** Tant que le zéro n'est pas posé : [Palper au bloc …] est plein, « Suite : Contrôle → » est en contour. Dès qu'il est posé : l'inverse. L'action de la barre est toujours « Suite : Contrôle → » : c'est une navigation, elle n'est jamais rayée.

**En-tête (état du zéro pièce)** — lu dans l'état reçu, sans rien mémoriser. La première ligne vraie l'emporte :

| État | Condition | En-tête |
|---|---|---|
| en cours | palpage en cours | « Palpage… » |
| à vérifier | `workOffset.state` différent de `proven` (K3) | « À vérifier » (ambre) ; la cause et le remède sont ceux du § 6.4 |
| posé | la plus récente des traces `motion.lastOrigin` (sans `failed`), `blockProbe` (`state: 'done'`, `written: 'yes'`) et `zeroZ` (sans `failed`) existe | « Posé à 14:12 » ; le contexte dit le moyen et les axes : « bloc XYZ », « plaque : Z seul », « à la main : X » |
| ancien | aucune de ces traces (le serveur a redémarré, ou rien n'a été posé dans cette séance) | « Ancien zéro » (neutre) ; cause : « Zéro pièce d'une séance précédente. Refaites-le pour cette pièce. » ; ne bloque rien |

**Laser (la RT)** : la colonne « Sonde » est remplacée par la carte « Laser » : « Amenez le point du laser sur le coin de la pièce, puis touchez Zéro XY ici. » et le rappel « Un laser n'a pas de palpage. ». Les deux autres colonnes sont identiques (Z masqué selon le profil).

**Type de machine pas encore déclaré** : la troisième colonne porte « CNC ou laser ? Déclarez la machine. » et [Type de machine…] (64), qui ouvre Réglages › Machine et performances.

Rayé avec sa raison (la raison est dans la barre d'étape ; pour les palpages, dans la zone de cause de la carte) : flèches, zéros et palpages quand la machine n'est pas connectée, est en alarme, n'a pas la main, travaille ; « Continu » et les pas de plus de 1 mm quand l'origine machine n'est pas prise (remède [Prise d'origine machine…], même dialogue que ①).

Jamais masqué : la croix, les trois zéros, [Zéro XYZ ici], le voyant, [Palper au bloc …], [Zéro Z à la plaque…], [Tester], [Ma sonde…].

Ordre d'empilement en format compact : Déplacer, Position pièce, Sonde.

### 4.4 ④ Contrôle (`screen-check`, nouveau ; module `touch/check-screen.js`)

But : voir où le fichier se place dans la machine, lire le verdict en mots, démarrer.

État dessiné : dépassement prouvé en Z.

```
4 · Contrôle                           planche_400x70.nc · zéro posé à 14:12                    Dépasse en Z
┌ Vue de dessus (470 × 496) ───────────────────┐ ┌ Vue de côté (250 × 496) ──┐ ┌ Verdict (502) ────────────────┐
│ table 408 × 396                              │ │ 0 ── haut de la course    │ │ X  ✓ tient · marge 7 mm       │
│ ┌──────────────────────────────────────────┐ │ │                           │ │ Y  ✓ tient · marge 162 mm     │
│ │                                          │ │ │ ── zéro Z                 │ │ Z  ! descend 15 mm trop bas   │
│ │      ┌───────────────┐ 400 × 70          │ │ │ ▒▒ le fichier : 20,8 mm   │ │                               │
│ │      ●───────────────┘                   │ │ │ ── plus bas possible ──   │ │ Rapides au départ             │
│ │      zéro pièce          + fraise        │ │ │ ▓▓ 15 mm de trop          │ │ [25 %] [50 %] [100 %]  (64)   │
│ └──────────────────────────────────────────┘ │ │                           │ │                               │
│                                              │ │                           │ │ [Détails du contrôle](48)     │
└──────────────────────────────────────────────┘ └───────────────────────────┘ └───────────────────────────────┘
────────────────────────────────────────────────────────────────────────────────────────────────────────────
 ! Le fichier descend 15 mm trop bas. Relevez la pièce,
   puis refaites le zéro Z.  [Refaire le zéro Z](48) [Choisir un autre fichier](48)   ▓ Démarrer l'usinage… ▓ (320×64)
```

La barre quand le fichier tient :

```
 Tout est prêt : le fichier tient dans la machine.                          [ Démarrer l'usinage… ](320×64)
```

- **Les deux dessins** (`#check-top`, `#check-side`) : § 6.7. Communs à v1 et v2.
- **Le verdict par axe** (`#check-verdict`, trois lignes de 56 px) : icône + « tient » et la marge la plus petite, ou « dépasse de N mm {côté} », ou « non vérifié » avec sa raison courte. Source : `programCheck` de l'état reçu, rien d'autre ; N est le `over` du serveur. L'estimation de la tablette (`travel-check.js`, fonctions `check` et `show`) et la carte v2 « Course machine… » disparaissent : une seule source de verdict.
- **Rapides au départ** (`#check-rapids`) : la même rangée que « Rapides » de ⑤, produite par la même fonction (extraite de `job-dashboard.js`), avec les mêmes `button[data-kind="rapid"][data-value]` et la même commande ; l'état actif, rayé ou pressé suit sur les deux. C'est la seule commande présente sur deux écrans, parce qu'on règle les rapides avant de démarrer (comme en v1 aujourd'hui). Rayé avec la raison du serveur (`rapidOverrideReason`).
- **Broche** (K11) : une ligne d'information sous le verdict, quand le serveur la publie : « Le fichier demande {N} tr/min : la broche tournera à son maximum. ». Elle ne bloque rien.
- **Action principale** : [Démarrer l'usinage…] (`#step-check-main` ; en laser : [Démarrer la gravure…]). Au départ accepté, la page passe sur ⑤.
- **Laser** : [Cadrer…] (`#check-frame-start`, 64 px) sous le verdict, à la place de « Rapides au départ » ; les lignes du contrôle laser (« Le laser reste à puissance fixe… ») sont dans « Détails du contrôle ».

**États de l'écran.** La première ligne vraie l'emporte. Le zéro pièce non prouvé (D2) passe avant tout verdict de course : le serveur refuse alors le départ, sans avertissement à cocher ni dérogation.

| État | En-tête | Cause et remède | [Démarrer l'usinage…] |
|---|---|---|---|
| Machine pas prête, main ailleurs, hors ligne | selon § 6.4 | cause globale et son remède | rayé |
| Usinage en cours ou en pause | « Usinage en cours » | « Un usinage est en cours. » | devient « Suite : Usinage → » |
| Aucun fichier chargé | « En attente » | « Aucun fichier chargé. » [Choisir un fichier] | rayé |
| Fichier à recharger (usinage terminé ou arrêté) | « À recharger » | « Rechargez « {fichier chargé} » avant de démarrer. » [Recharger ce fichier] — le bouton recharge le fichier nommé (celui de la machine, `machine.name`), jamais la sélection de ② | rayé |
| Zéro pièce en cours de vérification (`workOffset` : `unknown`, `checking`) | « En attente » | « La machine vérifie le zéro pièce. Attendez quelques secondes. » | rayé |
| Zéro pièce non confirmé (`failed`) | « Zéro pièce à vérifier » (ambre) | selon le code (§ 9.2 n° 12) : [Vérifier à nouveau], [Refaire le zéro pièce] ou [Relire les réglages] | rayé |
| Dépasse (`outside`, D1), en coordonnées pièce | « Dépasse en Z » (rouge) | phrase du refus n° 11 (§ 9.2) ; deux remèdes : [Refaire le zéro Z] (ou [Refaire le zéro pièce]) et [Choisir un autre fichier] | rayé ; la dérogation est dans « Détails du contrôle » (§ 5.11) |
| Dépasse sur une position machine écrite dans le fichier (`ETOUCH_CHECK_OUTSIDE_G53` parmi les raisons) | « Dépasse » (rouge) | « Le fichier demande une position hors de la machine, ligne {N}. Refaire le zéro n'y change rien. » [Choisir un autre fichier] | rayé ; dérogation au même endroit |
| Non vérifiable (`unknown`), cause qui peut se lever | « Non vérifié » (ambre) | la raison en une phrase et son remède ([Prise d'origine machine…], [Relire les réglages]) | selon `canStart` ; s'il est actif, son dialogue demande la case du départ non vérifié (§ 5.2) |
| Non vérifiable, cause du fichier (ligne non suivie : palpage, changement de zéro, écriture inhabituelle) | « Non vérifié » (ambre) | « Ce fichier ne peut pas être vérifié en {axe}. Vérifiez à la main qu'il tient. » [Détails] | plein ; même case |
| Tient (`validated`) | « Tient dans la machine » | « Tout est prêt : le fichier tient dans la machine. » | plein |

Jamais masqué : les deux dessins (un axe sans données est dessiné en pointillé avec « non vérifié »), les trois lignes du verdict, [Démarrer l'usinage…], [Détails du contrôle].

v2 : sous la vue de dessus, [Vue 3D du placement] (48) ouvre la vue existante de `origin-preview.js` dans un dialogue plein écran (bandeau visible). `check-screen.js` la charge (`cncProfile.loadAdvanced(['preview-gl.js', 'origin-preview.js'])`, à la place de `job-preparation.js`). La vue garde `CNCTravelCheck.place()` pour sa géométrie seulement ; elle n'écrit aucun verdict (celui de ④ est derrière elle). Rien d'autre. Dans une fenêtre de 911, les 143 px de plus vont aux deux dessins ; en v1 le bouton n'existe pas et rien d'autre ne bouge.

Ordre d'empilement en format compact : Verdict, Vue de côté, Vue de dessus.

### 4.5 ⑤ Usinage (`screen-home`)

But : suivre, mettre en pause, reprendre, arrêter, corriger ; puis lire le bilan.

État dessiné : usinage en cours.

```
5 · Usinage                                planche_400x70.nc                                 En cours · 42 %
┌ (640) ─────────────────────────────────────────┐ ┌ Avancement (594) ─────────────────────────────────────┐
│ [2D][Iso][Face][Côté][Dessus](48)  [Agrandir]  │ │ 42 %  ▓▓▓▓▓▓▓░░░░░░░░   Reste 12 min · ligne 1 234    │
│                                                │ │ Position pièce   X 120,4    Y 35,0    Z −6,0          │
│        tracé, fraise, partie déjà usinée       │ │ Vitesse  [−10][−1][100 %][+1][+10]              (64)  │
│        (v1 : vues fixes ; v2 : 3D)             │ │ Broche   [−10][−1][100 %][+1][+10]              (64)  │
│                                                │ │ Rapides  [25 %][50 %][100 %]                    (64)  │
│ [ ■ Arrêter l'usinage ](616 × 64, rouge)       │ │ ─────────────────────────────────────────────────────│
│ Arrêt logiciel · pas un arrêt d'urgence        │ │ (encart : pause, alarme, bilan — 100 px)             │
└────────────────────────────────────────────────┘ └───────────────────────────────────────────────────────┘
────────────────────────────────────────────────────────────────────────────────────────────────────────────
 Usinage en cours.                                                                   [ Pause ](320×64, ambre)
```

La barre en pause :

```
 Pause. La broche tourne toujours.                                              [ Reprendre… ](320×64)
```

Hauteurs à 768 : à droite, titre 32 + avancement 72 + position 40 + 3 rangées de 64 + encart 100 + 5 écarts de 12 + marges 24 = 520 ; à gauche (carte sans titre : les boutons de vue en tiennent lieu), boutons de vue 48 + aperçu 326 + [Arrêter l'usinage] 64 + phrase 22 + 3 écarts de 12 + marges 24 = 520. Dans une fenêtre de 911 : l'aperçu prend les 143 px en v1 ; en v2 il les partage avec la courbe de vitesse (§ 3.2). [Arrêter l'usinage] est à la même place dans les deux rendus.

- **Les trois rangées de corrections** sont sur l'écran en v1 et en v2 (identifiants gardés : `#home-overrides button[data-kind][data-value]`). Le volet v2 « Broche / rapides… » disparaît. En laser : « Puissance » au lieu de « Broche ».
- **[Arrêter l'usinage]** (`#home-job-stop`) : seul, sous l'aperçu, à plus de 380 px de l'action principale. Dessous, sur une ligne de 16 px, la phrase actuelle : « Arrêt logiciel · pas un arrêt d'urgence ».
- **L'encart** (`#home-notice`, 100 px) remplace la zone de messages défilante : une ou deux lignes de texte et une rangée de boutons, jamais de défilement ; le reste est au Journal.
- **Action principale** (`#step-home-main`) selon l'état :

| État | En-tête | Encart | Action principale |
|---|---|---|---|
| Rien en cours, fichier chargé | « Rien en cours » | « Rien en cours. » | « Suite : Contrôle → » |
| Rien en cours, aucun fichier | « Rien en cours » | « Rien en cours. » | « Suite : Fichier → » |
| En cours | « En cours · 42 % » | « Usinage en cours. » | [Pause] |
| En cours, la machine attend (machine au repos, envoi en attente : cas reconnu aujourd'hui par `job-dashboard.js`) | « En cours · 42 % » (ambre) | « La machine attend. Si rien ne bouge, arrêtez l'usinage. » | [Pause] |
| Pause demandée par l'opérateur | « Pause » (ambre) | « Pause. La broche tourne toujours. » ▓Arrêter la broche▓ avec la raison du serveur (dans cette pause il refuse l'arrêt de la broche seul : « Pendant un usinage, la broche s'arrête avec Arrêter l'usinage. ») | [Reprendre…] |
| Pause demandée par le fichier (changement d'outil) | « Pause du fichier » | « Le fichier demande un changement de fraise. » [Arrêter la broche] (`#home-pause-m5`, 64, actif quand `canSpindleStop`) [Zéro Z à la plaque…] (64 ; même commande que sur ③, dialogue du § 5.2 sur place) | [Reprendre…] |
| Zéro Z à la plaque lancé d'ici, en cours | inchangé | « Zéro Z à la plaque en cours… Arrêter l'interrompt. » | inchangée ; les boutons de l'encart sont rayés |
| Zéro Z à la plaque fini | inchangé | « Zéro Z posé à la plaque. » — ou la phrase du refus et son remède (§ 9.2) | inchangée |
| Pause dont la reprise est refusée (dont : zéro Z à la plaque échoué) | « Pause » | la raison du serveur en une phrase (`resumeReason`) | ▓Reprendre…▓ ; remède [Arrêter l'usinage] |
| Porte ouverte | « Porte ouverte » (ambre) | « La porte de la machine est ouverte. Fermez-la. » | [Reprendre…] quand `canResume` ; sinon rayé |
| Alarme pendant l'usinage | « Alarme N » (rouge) | « Alarme N : {titre de l'aide}. Arrêtez l'usinage. » | [Arrêter l'usinage] (rouge) |
| Arrêté avant la fin, machine prête | « Arrêté ligne 1 234 » | « Arrêté à la ligne 1 234 sur 25 000. » | [Reprendre à la ligne 1 219…] (volet du § 5.12) |
| Arrêté avant la fin, machine pas prête | « Arrêté ligne 1 234 » | idem + « La machine a perdu sa position. » | « Remise en route → » (ouvre ①) |
| Arrêté, ligne inconnue | « Arrêté » | « Usinage arrêté avant la fin. » | « Suite : Contrôle → » (qui propose [Recharger ce fichier]) |
| Terminé | « Terminé » | « Terminé en 38 min. » [Zéro Z à la plaque…] (64) ; avec des erreurs : « Terminé avec N lignes refusées par la machine. » [Détails] | « Suite : Fichier → » |
| Broche qui tourne sans usinage | « Rien en cours » | « La broche tourne encore : arrêtez-la. » [Arrêter la broche] | inchangée |

- [Arrêter la broche] est toujours présent dans l'encart de pause. Il suit `canSpindleStop` ; rayé, il porte la raison du serveur (`spindleStopReason`, K10) ; sans raison : « Arrêt de la broche indisponible. ». La page n'écrit jamais d'elle-même « La broche est arrêtée. ».
- [Zéro Z à la plaque…] est offert ici aux deux moments où l'on change de fraise sans quitter l'écran : la pause de changement d'outil et la fin de l'usinage. Sa place reste ③ ; ici c'est le même bouton, la même garde (`canZeroZ`), le même dialogue.
- [Reprendre à une ligne…] (`#home-resume-line`, 48) est toujours visible dans l'encart quand rien ne tourne ; rayé avec sa raison (« Aucun fichier chargé. », « Un usinage est en cours. »).
- Rayé avec sa raison : les rangées de corrections hors usinage (« Les corrections servent pendant un usinage. »), sauf « Rapides » quand le serveur l'accepte au repos ; toutes les corrections quand un autre appareil a la main (Pause et Arrêter restent actifs).
- Jamais masqué : les trois rangées, [Arrêter l'usinage] (rayé « Rien à arrêter. » au repos), l'action principale, l'avancement (« — » sans usinage).
- Supprimés de l'écran : « Démarrer… » (il est sur ④), « Charger la sélection » (② et ④), la carte de la plaque (③), le cadrage laser (④), les positions machine (Détails), « Ligne acquittée », « Acquitté = accepté par Grbl… » (Détails).

v2 : sous l'aperçu, la courbe de vitesse et la bande « Séquence prévue » ; [Détail du temps] (48) à côté de « Reste 12 min ». Les boîtes de droite sont identiques.

Ordre d'empilement en format compact : Avancement, Aperçu.

### 4.6 Plus (`screen-more`)

```
Plus
┌ Journal (403 × 200) ─────┐ ┌ Réglages (403 × 200) ────┐ ┌ Mise en service (403 × 200) ┐
│ Événements et exports    │ │ Affichage, système       │ │ Faite le 12/11              │
└──────────────────────────┘ └──────────────────────────┘ └─────────────────────────────┘
┌ Guide (403 × 200) ───────┐ ┌ Macros (403 × 200) ──────┐
│ Le fil de la séance      │ │ ▓ Aucune macro dans CNCjs│
└──────────────────────────┘ └──────────────────────────┘
 CNCjs Touch · page v2v                                                              (16 px)
```

- Cinq tuiles `button.ks-tile[data-ks-tile]` (`history`, `settings`, `commissioning`, `guide`, `macros`) : le composant des tuiles du Menu actuel, avec son voyant. « Macros » ouvre le volet existant ; sans macro, la tuile est rayée et sa raison est écrite dessus.
- La ligne de version (`#more-version`) donne la version chargée de la page (celle que lit le lot P2 du plan, C-49) et la valeur unique du cache (§ 11, L1).
- Pas de barre d'étape, pas d'action principale.

### 4.7 Sous-écrans de Plus

Journal, Réglages, Mise en service, Guide gardent leur contenu. Trois changements communs :
1. En-tête de 48 px : [← Plus] (`.ks-back`, 160 × 48) à gauche, le titre à côté. Le rail ne change plus de géométrie.
2. Le rail marque « Plus ».
3. Leurs textes suivent le glossaire et les règles du § 9 (lot L6).

Particularités :
- **Réglages** : cohérence seulement, avec deux ajouts qui sont des exceptions dites au § 5.5 du prompt : la ligne d'état du rendu (§ 3.1) ; et, sur une page distante (`local` faux dans la réponse de `GET /api/touch-backlight`, K6), le choix « Pendant la veille » de la luminosité rayé avec « Réglable seulement sur la tablette de la machine. ». La carte « Mise en service de la machine » reste un second accès au même écran. L'onglet Système garde ce que le lot P2 du plan y a mis (version chargée, version installée, [Recharger]).
- **Mise en service** : l'assistant ne s'ouvre plus tout seul (aujourd'hui : au premier port vu depuis le Menu ou Suivi, `commissioning.js:508`). La ligne `service` de ① et la tuile de Plus l'annoncent. À la fin ou à l'abandon, il revient sur ① (aujourd'hui sur le Menu). Son étape « Sonde » ouvre le volet « Tester la sonde » (§ 5.6) : un seul test. Ses confirmations ne changent pas, y compris la case « main sur l'arrêt » du test de broche.
- **Guide** : une page par étape du fil, dans l'ordre, plus « Après un incident » et « La sonde ». Les volets « Comprendre l'origine » et « Fonctions de la machine » y sont repris en phrases courtes.
- **Journal** : le détail d'un palpage (contacts, valeurs) et les messages longs de l'usinage y vont.

---

## 5. Volets et dialogues

### 5.1 Règles

- **Volet** (`cncShell.sheet`, inchangé) : une carte sous le bandeau, 900 × 580 px au plus, titre, « Fermer × » (48 px), Échap. Un seul volet à la fois : en ouvrir un ferme le précédent. Un changement d'écran le ferme. Son action finale, quand il en a une, est en bas à droite (64 px), hors de la zone qui défile.
- **Dialogue** : au-dessus de tout volet, sous le bandeau. Pause et Arrêter le ferment (inchangé).
- **Carte d'un dialogue** : 600 px de large, centrée dans la fenêtre (x 383 → 983). [Annuler] à gauche (160 × 48), le bouton d'engagement à droite (300 × 64 au moins).
- **Le bouton d'engagement est nommé par son effet** (« Lancer la prise d'origine », « Poser le zéro X ici »), jamais « Confirmer » ni « OK ».
- **Il ne s'arme qu'après 600 ms** d'affichage, et **il n'est jamais sous le bouton qui a ouvert le dialogue** : si les deux rectangles se recouvrent, la carte est décalée vers le haut (à défaut vers le bas) du recouvrement plus 12 px. Le bouton d'origine est déjà connu du code (`job-controls.js`, `dialogReturn`).
- Un refus reçu pendant qu'un volet ou un dialogue est ouvert s'écrit **dedans**, dans une bande de refus (§ 6.1).

### 5.2 Dialogue de confirmation (`#job-dialog`, identifiants gardés)

```
┌ Lancer la prise d'origine machine ─────────────────────── encore 12 s ┐
│ Les trois axes vont jusqu'à leurs capteurs, Z d'abord.                 │
│ Dégagez la table.                                                      │
│ (dessin, ou ligne de verdict, selon la commande)                       │
│ [ ] Je suis devant la machine et la table est dégagée.                 │  ← la case, toujours exigée (§ 6.3)
│ [Détails](48)                                                          │
│ [Annuler](160×48)                    [ Lancer la prise d'origine ](64) │
└────────────────────────────────────────────────────────────────────────┘
```

Le compte à rebours du ticket (15 s) reste affiché en mots et en barre. « Détails » donne la machine, le port et qui a la main (aujourd'hui sur la deuxième ligne du dialogue). La case (`#job-check`) est exigée pour chaque opération, comme aujourd'hui : `#job-confirm` ne s'active qu'une fois la case cochée et les 600 ms passées (§ 5.1).

| Opération (`ticket.operation`) | Titre | Texte (deux phrases au plus) | Bouton `#job-confirm` | Case |
|---|---|---|---|---|
| `home` | Lancer la prise d'origine machine | Les trois axes vont jusqu'à leurs capteurs, Z d'abord. Dégagez la table. | Lancer la prise d'origine | Je suis devant la machine et la table est dégagée. |
| `unlock` | Déverrouiller sans prise d'origine | Rien ne bouge. La position de la machine peut être fausse : faites ensuite la prise d'origine. | Déverrouiller | Je suis devant la machine et la cause de l'alarme est réglée. |
| `blockProbe` | Palper le bloc {XYZ} | le dessin « plan » (§ 6.6) et ses trois lignes de cotes ; « Fraise Ø 6 mm. » | Lancer le palpage {XYZ} | Je suis devant la machine, le bloc et la pince sont en place. |
| `zeroZ` | Zéro Z à la plaque | La fraise descend jusqu'à la plaque de {épaisseur} mm, de {descente} mm au plus. [Modifier…](48) | Lancer le zéro Z | Je suis devant la machine, la plaque et la pince sont en place. |
| `start`, verdict « tient » | Démarrer l'usinage | {fichier}. « Tient dans la machine. » La broche démarre et la machine se déplace. | Lancer l'usinage | Je suis devant la machine et prêt à lancer ce fichier. |
| `start`, verdict « non vérifié » | Démarrer l'usinage | {fichier}. « Course non vérifiée en {axe} : {raison courte}. » | Lancer l'usinage | Je suis devant la machine et j'ai vérifié que le fichier tient dans la machine. |
| `start` avec dérogation (`override: 'travel'`, K2) | Démarrer malgré le dépassement | la vue de côté ; « Le fichier descend {N} mm trop bas. La machine s'arrêtera en alarme et perdra sa position. » ({N} et le côté viennent de `override.blocking`) | Démarrer malgré le dépassement (ambre) | Je suis devant la machine et je sais que le fichier dépasse de {N} mm. |
| `resume` | Reprendre l'usinage | La machine repart là où elle s'est arrêtée. + la note existante de changement d'outil ou de reprise à une ligne (`CNCJobResume.dialogNote`) | Reprendre l'usinage | Je suis devant la machine et prêt à reprendre ce fichier. |
| `frame` (laser) | Cadrer le fichier | La tête fait le tour du fichier, laser éteint. | Lancer le cadrage | Je suis devant la machine et la table est dégagée. |
| `macro` | Lancer la macro {nom} | Une macro peut déplacer la machine et faire tourner la broche. | Lancer la macro | Je suis devant la machine et je connais cette macro. |
| `spindle` (mise en service) | inchangé | inchangé | Démarrer la broche | inchangée ; la seconde case de l'assistant (« main sur l'arrêt ») est gardée aussi |

En laser : « Démarrer la gravure », « Lancer la gravure », « Le laser s'allume et la tête se déplace. ».

Défense gardée du lot P1 du plan : un ticket sans dérogation dont le contrôle porte un axe `outside` n'active jamais `#job-confirm`.

[Modifier…] du dialogue `zeroZ` annule le ticket, ferme le dialogue et ouvre le volet « Plaque » (§ 5.7) : l'épaisseur et la descente partent dans la demande du ticket, elles ne peuvent pas changer après.

Dans une fenêtre de 768, le dessin « plan » du dialogue `blockProbe` fait 552 × 180 (240 dans une fenêtre de 911), pour que la carte, sa case et ses boutons tiennent sous le bandeau en texte agrandi.

### 5.3 Dialogue « La main » (`#pilot-dialog`)

```
┌ La main ──────────────────────────────────────────────────────┐
│ C'est « PC atelier » qui a la main depuis 14:02.               │
│ Pause et Arrêter restent possibles ici.                        │
│ Un palpage est en cours : prendre la main l'arrête.            │  ← seulement si l'autre appareil a une activité
│ [ Prendre la main — je suis devant la machine ](552 × 64, plein)│
│ [ Prendre la main — l'autre appareil est hors service ](552 × 64)│
│ [Autre motif…](48)                                [Fermer](48) │
└────────────────────────────────────────────────────────────────┘
```

- `#pilot-reason-a` et `#pilot-reason-b` **prennent la main directement** : ils envoient la demande `takeover` actuelle avec leur motif. Leur libellé commence par l'effet, « Prendre la main ». Deux touchers en tout (bandeau, bouton).
- Une demande à la fois : tant qu'une prise de main est partie, les deux boutons sont rayés (garde actuelle de la page, `job-controls.js`).
- Prendre la main arrête d'abord le palpage, le déplacement ou le cadrage que l'autre appareil a lancé (plan § 1.6). Quand l'état reçu montre une telle activité, le dialogue le dit sur sa troisième ligne : « Un palpage est en cours : prendre la main l'arrête. » (ou « Un déplacement… », « Un cadrage… »). Un usinage n'est pas arrêté : la ligne dit alors « L'usinage continue. ».
- [Autre motif…] ouvre le clavier texte, puis [Prendre la main] (`#pilot-takeover`).
- Quand cet appareil a la main : « Cet appareil a la main. » et [Fermer]. Quand elle est libre : « Personne n'a la main : la première commande la prend. » et [Fermer].
- Un refus de la prise de main s'écrit dans le dialogue (`#pilot-feedback`), avec sa cause.
- Le même dialogue s'ouvre depuis le remède [Prendre la main] de n'importe quel écran.

### 5.4 Dialogue « Poser le zéro » (`#real-motion-ticket`, identifiants gardés)

| Cas | Titre | Texte | Bouton `#real-motion-origin-confirm` |
|---|---|---|---|
| un axe, ici | Zéro X ici | X pièce : 66,952 → 0 mm. Aucun axe ne bouge. | Poser le zéro X ici |
| trois axes, ici | Zéro XYZ ici | X 66,952 → 0 · Y 10,000 → 0 · Z −1,000 → 0 mm. Aucun axe ne bouge. | Poser le zéro XYZ ici |
| un axe, à l'origine machine (`at: 'machine'`, K5) | Zéro X à l'origine machine | Le zéro X de la pièce sera l'origine de la machine. X pièce : 66,952 → 120,400 mm. Aucun axe ne bouge. | Mettre le zéro X à l'origine machine |

Deux touchers, comme aujourd'hui, sans case. Les deux gestes n'ont jamais le même bouton : « ici » ou « à l'origine machine » est écrit dessus. La ligne « (G10 L20 P1 X0) » et le nom du repère passent dans « Détails ». Le bouton n'est plus ambre : c'est une action normale.

### 5.5 Volet « Ma sonde » (`ks-probe-setup`)

Un assistant qui ne demande que ce qui manque pour le palpage choisi. Dessiné vide, comme la première fois :

```
Page 1 — Où est le bloc sur la pièce ?            Page 2 — Mesures du bloc
┌──────────────┐ ┌──────────────┐                 ┌ dessin coté du bloc (400 × 300) ┐  Épaisseur du bloc    [      mm ]
│ Arrière      │ │ Arrière      │                 │  épaisseur ↕   paroi X ↔        │  Paroi côté X         [      mm ]
│ gauche       │ │ droit        │                 │  paroi Y ↕                      │  Paroi côté Y         [      mm ]
└──────────────┘ └──────────────┘                 └─────────────────────────────────┘  Diamètre de la fraise[      mm ]
┌══════════════┐ ┌──────────────┐                 Vitesses et distances : valeurs de départ.        [Modifier…](48)
║ Avant        ║ │ Avant        │                 Avant de palper : touchez le bloc avec la fraise, puis écartez-le.
║ gauche       ║ │ droit        │                                                    ☐ contact vu   ☐ libéré
└══════════════┘ └──────────────┘                 [← Retour](160×48)   [Changer de coin](48)  [ Enregistrer et palper ](64)
   (4 × 200 × 120, chacun avec son dessin ; « Avant gauche » est proposé)
```

- **Page 1** : « Avant gauche » est encadré (c'est le coin proposé par le plan, § 1.4 c : un mauvais coin éloigne la fraise du bloc, sans contact ni zéro posé). Toucher un coin le choisit et passe à la page 2. Sautée pour un palpage Z seul, et quand le coin est déjà enregistré.
- **Page 2** : quatre champs au pavé numérique, **sans signe**, vides tant qu'ils n'ont pas été saisis. Pour Z seul : « Épaisseur du bloc » uniquement. Chaque champ a sa cote sur le dessin, qui s'allume quand le champ est ouvert.
- **Le pavé numérique ne cache pas le dessin** : pour ce volet et pour le volet « Plaque », il s'ouvre collé au bord droit de l'écran, sans voile sombre (option nouvelle de `numeric-pad.js`, `dock: 'right'`), et il affiche le nom du champ. Le dessin, à gauche du volet, reste visible avec sa cote allumée.
- **Ce que la page en déduit** (les champs du profil ne changent pas) : coin « avant gauche » = `--`, « avant droit » = `+-`, « arrière gauche » = `-+`, « arrière droit » = `++` ; `directionX` = l'opposé du signe X du coin, `directionY` de même ; `faceX = −directionX × paroi X`, `faceY = −directionY × paroi Y`. C'est la règle que le serveur vérifie (`s/block-probe.js:229-238`).
- **Valeurs de départ** (D4), celles que le lot P1 du plan pose dans `probe-model.js` à la création d'une sonde : approche 100 mm/min, seconde touche 25 mm/min, recherche 10 mm, retrait 1 mm, dégagement 5 mm. Elles sont dans les bornes du serveur (`test-probe-defaults.cjs`). Une sonde déjà enregistrée garde ses valeurs. [Modifier…] ouvre la page 3, « Vitesses et distances », avec ces cinq champs.
- **Aucune valeur n'est proposée pour les mesures du bloc ni pour la plaque** : une cote fausse donne un zéro faux (piège n° 4 de `VEILLE.md`).
- **Le test du contact est guidé dans le volet** quand il a été ouvert par [Palper au bloc …] et que le test reste à faire : la consigne et ses deux coches (`probeInput.test.stage`) sont sous les champs. Le geste se fait pendant ou après la saisie ; le pavé rangé à droite ne les cache pas.
- Bouton final : [Enregistrer et palper] quand le volet a été ouvert par [Palper au bloc …] ; [Enregistrer] quand il l'a été par [Ma sonde…] (la consigne du test n'est alors pas affichée). Rayé tant qu'un champ demandé est vide, avec « Il manque : {nom du champ}. ».
- [Enregistrer et palper] enregistre, ferme le volet, puis fait ce que fait [Palper au bloc …] (§ 4.3) : si le serveur accepte, le dialogue s'ouvre ; sinon la cause s'écrit dans la carte Sonde (le test du contact, par exemple, avec ses coches).
- En tête du volet, une ligne : « Sonde : {nom} » et [Autres sondes…] (48) : la liste des sondes enregistrées avec Nouveau, Dupliquer, Supprimer…, Restaurer (fonctions actuelles de « Profils de sonde ») et [Sauvegarde…], qui ouvre le volet « Sauvegarde des sondes » (contenu actuel de `screen-probe-transfer`).
- `probe-model.js` : `validate` n'exige plus le coin pour un palpage Z. Le serveur garde ses propres contrôles.

### 5.6 Volet « Tester la sonde » (`ks-probe-test`)

Un voyant agrandi (300 × 96), une consigne à la fois (20 px), la liste des consignes déjà passées. **Le volet avance avec le signal réel** (`probeInput.state`, `probeInput.stuck`). Aucun bouton ne déclare la sonde bonne.

**Avant toute consigne : machine immobile et broche arrêtée.** Les consignes demandent de toucher la fraise ou de débrancher la broche. Elles ne s'affichent que si l'état reçu est à jour, la machine au repos ou en alarme, sans usinage ni pause en cours, et la broche à l'arrêt. Sinon le volet n'affiche que : « Arrêtez d'abord la machine et la broche. », avec [Arrêter la broche] quand `canSpindleStop` (Arrêter et Pause sont dans le bandeau). Si cette condition tombe en cours de test, le volet revient à cette phrase.

| Départ | Consigne | Quand le voyant… | Bouton pour passer à l'hypothèse suivante |
|---|---|---|---|
| voyant libre | 1. « Touchez le bloc avec la fraise. » | passe à « touche » → consigne 2 | [Rien ne se passe] (64) → branche B |
| | 2. « Contact vu. Écartez le bloc. » | repasse à « libre » → « La sonde marche. » [Fermer] | [Ça touche toujours] (64) → branche A |
| **A. touche en permanence** | A1. « Écartez le bloc de la fraise. » | passe à « libre » → reprise en 1 | [Ça touche toujours] |
| | A2. « Laissez la pince sur la fraise. Débranchez la prise de la broche. » | passe à « libre » → « C'est la broche : elle relie la fraise à la masse. », puis « Palpez broche débranchée. Rebranchez-la avant d'usiner. » ; reprise en 1 | [Ça touche toujours] |
| | A3. « Retirez la pince de la fraise. » | passe à « libre » → « La fraise touche la masse de la machine, broche débranchée. Faites vérifier le montage. » [Détails] | [Ça touche toujours] |
| | A4. « Le fil de la sonde est en court-circuit. Faites vérifier le câblage. » | — | [Détails] |
| **B. ne touche jamais** | B1. « Mettez la pince sur la fraise, puis touchez le bloc avec la fraise. » | passe à « touche » → consigne 2 | [Rien ne se passe] |
| | B2. « Vérifiez le fil du bloc côté machine, puis touchez le bloc. » | passe à « touche » → consigne 2 | [Rien ne se passe] |
| | B3. « La machine ne voit pas la sonde. Faites vérifier le câblage. » | — | [Détails] |
| voyant inconnu | « La machine ne donne pas l'état de la sonde. » | — | [Détails] |

- L'ordre de la branche A est celui qui sépare les causes : la broche est débranchée **pince en place**. Si l'on retirait la pince d'abord, le contact cesserait aussi quand c'est la broche qui met la fraise à la masse (le cas du 14 novembre), et le volet accuserait la pince à tort.
- Le volet s'ouvre en A1 quand le voyant est « touche en permanence » (bouton [Pourquoi ?]) et en B1 depuis le refus « la sonde n'a rien touché ».
- La suite « touche, puis libre » vue ici est celle que le serveur attend comme test du contact : réussir le test du volet libère [Palper au bloc …].
- Aucune minuterie : chaque passage vient d'un état reçu ou d'un toucher.
- L'étape « Sonde » de la mise en service ouvre ce même volet.

### 5.7 Volet « Plaque » (`ks-plate`)

Deux champs et un dessin : « Épaisseur de la plaque » (mm, obligatoire, jamais proposée) et « Descente au plus » (10 mm par défaut, comme aujourd'hui). Bouton final [Enregistrer et palper] (64), qui demande le ticket et ouvre le dialogue `zeroZ`. Il s'ouvre : la première fois que l'on touche [Zéro Z à la plaque…] (épaisseur inconnue), depuis ③ comme depuis ⑤ ; ensuite par [Modifier…] du dialogue, ou par le remède d'une descente refusée (`ETOUCH_PLATE_TRAVEL`). Les valeurs sont gardées sur la tablette (clé actuelle `cncjs-touch-plate-v1`). Le pavé numérique s'y ouvre à droite, comme dans « Ma sonde » (§ 5.5).

### 5.8 Volet « Autres zéros » (`ks-zero-more`, K5)

Trois boutons de 64 px : [X à l'origine machine], [Y à l'origine machine], [Z à l'origine machine], et une phrase : « Le zéro de cet axe est placé à l'origine de la machine. Aucun axe ne bouge. ». Chacun demande le ticket (`prepare` de `set-origin` avec `at: 'machine'` et l'axe) et ouvre « Poser le zéro » (§ 5.4, troisième cas).

Rayés avec leur cause, écrite dans le volet avec son remède :
- origine machine pas prise (`ETOUCH_ORIGIN_NOT_HOMED`) : « Origine machine pas prise. » [Prise d'origine machine…] ;
- zéro pièce pas encore vérifié (D2) : la phrase et le remède du § 9.2 n° 12 ;
- décalage actif dans la machine (`ETOUCH_ORIGIN_OFFSETS`) : « Un décalage est actif dans la machine : ce zéro n'est pas possible. » [Détails].

### 5.9 Volet « Détails de la machine » (`ks-machine-details`)

Remplace l'écran Limites, la carte « Paramètres de course » de Machine, le tableau des coordonnées de Machine et le choix du port caché dans « Détails de l'aperçu ».
- Connexion : port, vitesse ; s'il y a plusieurs machines, le choix (`#job-port`, déplacé).
- Version de la machine, nombre de réglages lus, [Relire] (le même bouton que la ligne `reglages`, même garde `canReadSettings`).
- Course : « X 408 · Y 396 · Z 130 mm » et le schéma (contenu de `machine-limits.js`).
- Position machine X, Y, Z ; zéros pièce enregistrés.
- v2 : les blocs `#perf-v2-machine` (classes `v2m-`, inchangées). L'emplacement v2 `machine` est créé dans le volet, et son contenu n'est rendu que volet ouvert (aucun travail sur un élément caché). Son texte « …puis $X ou $H plus haut. » (`machine-limits.js:195`) devient « …puis faites la prise d'origine dans Machine. ».
- Ce volet est un volet de détails : les noms de réglages et les positions machine y sont permis (§ 6.2).

### 5.10 Volets « Détails du fichier » (`ks-file-info`) et « Ajouter un fichier » (`ks-upload`)

Existants. « Détails du fichier » reçoit les dimensions (ancien volet « Dimensions XY »), l'état de l'aperçu, [Régénérer l'aperçu], l'empreinte et la version ; il perd le choix du port.

### 5.11 Volet « Détails du contrôle » (`ks-check-details`)

- Par axe : étendue du fichier, course utilisable, marge, en mm machine ; les raisons du serveur (phrase réécrite, puis phrase d'origine et code).
- Les lignes que le contrôle ne suit pas (macros, palpages, changements de zéro).
- En laser : les lignes du contrôle laser.
- En bas, une ligne fixe : « Ni les brides ni la pièce ne sont vues. »
- **La dérogation D1.** Quand le verdict est « dépasse » et que le serveur la permet (`programCheck.overridable`) : la phrase « Démarrer quand même arrêtera la machine en alarme et lui fera perdre sa position. » et [Démarrer malgré le dépassement…] (`#check-override-open`, 64 px, ambre). Le bouton envoie `prepare {operation: 'start', override: 'travel'}` et ouvre le dialogue du § 5.2 avec les dépassements rendus par le serveur (`override.blocking`). C'est le seul chemin de la dérogation : quatre touchers ([Détails du contrôle], ce bouton, la case, le bouton nommé).
- Quand le verdict est « dépasse » et que `overridable` est faux : pas de bouton, et la phrase « Sur cette machine, on ne peut pas démarrer malgré un dépassement. ».
- Jamais de dérogation pour un zéro pièce non vérifié (D2) ni pour une origine machine pas prise : le bouton n'existe que sur un dépassement prouvé.
- Refus `ETOUCH_START_OVERRIDE_CHANGED` au départ (le contrôle a changé pendant la confirmation) : le dialogue se ferme et le volet écrit « Le contrôle a changé. Recommencez. ».

### 5.12 Volet « Reprendre à une ligne » (`ks-resume-sheet`)

Porte sur **le fichier arrêté** (`stoppedFile`, à défaut le fichier chargé), jamais sur la sélection de la bibliothèque. Le nom du fichier est dans le titre.

```
Reprendre à une ligne — planche_400x70.nc
 Arrêté à la ligne 1 234.
 Reprendre à la ligne  [ 1 219 ](160 × 64)     proposée : quinze mouvements avant l'arrêt
 La fraise remonte, va au-dessus du point, redescend, puis l'usinage reprend.        [Détails](48)
 (aperçu du point de reprise en v2)
 [Reprendre au début](48)                                          [ Charger la reprise ](300 × 64)
```

- Le plan est demandé au serveur à l'ouverture et à chaque changement de ligne (`resumePlan`, une requête libre). Le bouton « Vérifier » disparaît.
- **Une seule réponse compte** : celle de la dernière demande, pour le fichier et la ligne affichés. Une réponse plus ancienne, ou pour une autre ligne, est ignorée. [Charger la reprise] est rayé (« Vérification de la ligne… ») tant que le plan de la ligne affichée n'est pas revenu accepté, et il charge ce plan-là.
- La phrase du trajet ne donne pas de hauteur : la hauteur de remontée est celle du fichier. Elle est dans [Détails], avec les lignes que le serveur ajoute avant la reprise.
- Le plan rend aussi le contrôle de course de la reprise (K13) : s'il dépasse, le volet le dit avec la phrase du § 9.2 n° 11, avant de charger.
- Un refus s'écrit dans la bande du volet, avec sa phrase (§ 9.2 n° 24 ou n° 25) et [Changer la ligne] (qui ouvre le pavé) ou [Reprendre au début] (qui recharge le fichier arrêté et va sur ④).
- [Charger la reprise] charge, ferme le volet et va sur ④, où le contrôle de la reprise s'affiche.
- Laser : titre « Reprendre à un début de passe », mêmes règles (le serveur choisit la passe).

### 5.13 Volets gardés tels quels

« Vitesse de déplacement » (`ks-jog-settings-sheet`), « Macros » (`ks-macros`, ouvert depuis Plus), « Sauvegarde des sondes » (`ks-probe-backup`, contenu de l'ancien écran), « Exporter le journal » (`ks-history-export-sheet`), « Détail du temps » (`perf-v2-time-sheet`, v2).

### 5.14 Surcouches inchangées

Pavé numérique, clavier texte, fiche du projet, aperçu agrandi (qui garde [Arrêter], `#preview-job-stop`), vue 3D agrandie, veille, bouclier du verrou. Leurs textes suivent le § 9. Une seule option de plus : le pavé numérique peut s'ouvrir rangé à droite, sans voile (§ 5.5), pour les volets « Ma sonde » et « Plaque ».

---

## 6. Composants communs

### 6.1 Le refus et son bouton remède (`touch/refus.js`, données `touch/i18n-messages-refus.js`)

Forme : **icône + une phrase (cause, 16 px, deux lignes au plus) + un bouton remède (48 px) + « Détails » (48 px)**. La phrase est celle de l'opérateur (§ 9.2). La phrase du serveur et son code sont dans « Détails ».

Où il s'affiche — toujours là où l'on a touché :

| Où l'on a touché | Où s'écrit le refus |
|---|---|
| un bouton d'un écran d'étape | la cause de la barre d'étape (elle remplace la cause calculée) |
| un bouton de la carte Sonde | la zone de cause de la carte (`#probe-cause`) |
| un bouton d'un volet ou d'un dialogue | une bande de refus `.ks-refus` en bas du volet ou du dialogue |
| un bouton du bandeau | la cellule des messages du bandeau (existante) et la barre d'étape de l'écran affiché |
| un écran sans barre (Plus et ses sous-écrans) | une bande `.ks-refus` sous l'en-tête |

Règles :
1. **Un bouton que le serveur dit impossible est rayé** (`can…` faux), avec sa raison écrite. **Un refus reçu à la demande alors que `can…` reste vrai** (le serveur ne le sait qu'en calculant le ticket : course d'un palpage, fraise hors de la zone de départ, descente de la plaque trop longue) ne raye pas le bouton : la page ne décide pas à la place du serveur. La cause et son remède restent écrits jusqu'à ce qu'une donnée de la demande change (position de la machine, palpage choisi, mesures, diamètre, épaisseur), et un nouveau toucher redemande au serveur. Dans les deux cas, un toucher ne laisse jamais l'écran identique sans phrase.
2. Le refus s'efface quand sa cause change (l'état reçu ne la porte plus, ou une donnée de la demande a changé), quand on change d'écran, ou quand on touche une autre commande. Aucune minuterie.
3. Le remède est un identifiant d'une liste fermée ; il lance sur place la commande qui lève l'obstacle : `connecter`, `prendre-la-main`, `remise-en-route`, `prise-origine`, `relire`, `verifier-zero`, `arreter-broche`, `arreter-usinage`, `voir-usinage`, `refaire-zero-z`, `refaire-zero`, `choisir-fichier`, `recharger-fichier`, `reessayer-controle`, `ma-sonde`, `plaque`, `tester-sonde`, `pourquoi-sonde`, `dessin-depart`, `relancer-palpage`, `changer-ligne`, `reprendre-debut`, `recommencer`, `voir-controle`, `vitesse`, `type-machine`, `recharger-page`, `details`, `aucun`.
4. Six remèdes changent d'écran, parce que le geste est ailleurs : `remise-en-route` (①), `choisir-fichier` (②), `refaire-zero-z` et `refaire-zero` (③), `voir-controle` (④), `voir-usinage` (⑤). Tous les autres ouvrent un dialogue ou un volet sur place, ou lancent la commande.
5. `aucun` est permis pour une attente (« Attendez… ») ou une information. Un refus inconnu a le remède `details` (§ 9.1).
6. Un remède n'est jamais rayé par la cause qu'il lève (§ 6.4).
7. Les zones `#job-feedback` et `#home-job-feedback` disparaissent (lot L5).

API : `cncRefus.lire(erreur)` rend `{famille, phrase, remedes, details}` à partir d'une réponse de refus ou d'une entrée de `refusals` (`code`, `params`, `reasons`, `message`) ; `cncRefus.montrer(hote, refus)` et `cncRefus.effacer(hote)` gèrent une bande. Données : `window.CNCTouchRefus = {familles: [[id, fr, en, es, remède, remède2]], codes: {ETOUCH_…: id}}` : chaque code du serveur y a sa famille, écrite en toutes lettres (§ 9.2).

### 6.2 Le volet « Détails » (`#ks-details`, `cncShell.details(...)`)

Un seul volet pour tout le technique, ouvert par tout bouton [Détails]. Titre « Détails », puis des lignes « libellé : valeur » en 16 px.

Ce qui n'apparaît que là : les codes (`ETOUCH_…`, `ALARM:n`, `error:n`), les phrases d'origine du serveur, les noms de réglages (`$22`, `$130`…), les mots G-code (`G54`, `G10 L20`…), les coordonnées machine, le port, la version de la machine, l'empreinte d'un fichier, les valeurs brutes d'un palpage, « ligne reçue par la machine ».

API : `cncShell.details({titre, lignes: [{libelle, valeur}], brut})`. Aucun bouton de commande dans ce volet (seul « Détails du contrôle », § 5.11, porte la dérogation).

### 6.3 La confirmation, par classe de commande

**Aucun garde ne change.** Toute commande à ticket garde ses trois touchers (le bouton, la case `#job-check`, le bouton d'engagement en 15 s) ; un zéro en garde deux. Le ticket du serveur en deux temps (demande, puis numéro à usage unique, 15 s, lié au flux, un seul par machine) et les gardes refaites par le serveur au second temps ne changent pas non plus.

| Classe | Commandes | Avant | Spec | Remarque |
|---|---|---:|---:|---|
| **Arrêts** | Pause, Arrêter, Arrêter l'usinage, Arrêter le palpage, Arrêter la broche, relâcher une flèche | 1 | **1** | Ne jamais ralentir un arrêt. |
| **Change un zéro, sans mouvement** | Zéro X / Y / Z ici, Zéro XYZ ici, zéro d'un axe à l'origine machine (nouveau) | 2 | **2** | Le dialogue dit « Aucun axe ne bouge », la valeur avant et après, et son bouton nomme le geste (§ 5.4). |
| **Met la machine en mouvement, ou la libère** | prise d'origine, déverrouiller, palpage au bloc, zéro Z à la plaque, démarrer (verdict « tient »), reprendre, cadrage laser | 3 | **3** | La case reste : elle fait attester la table dégagée, le bloc, la plaque et la pince en place, pas seulement la présence. |
| **Départ non vérifié** | démarrer avec un verdict « non vérifié » | 3 | **3** | La case dit aussi « j'ai vérifié que le fichier tient dans la machine ». |
| **Contenu inconnu** | macro, test de broche de la mise en service | 3 | **3** | Inchangé (la seconde case « main sur l'arrêt » de la mise en service aussi). |
| **Dérogation D1** | démarrer malgré un dépassement prouvé | la case suffisait (défaut C-01) | **4** : [Détails du contrôle], [Démarrer malgré le dépassement…], la case qui dit le dépassement, le bouton nommé | « Second geste délibéré, journalisé » (D1) : hors du chemin normal. |
| **Le reste** | charger, relire les réglages, vérifier le zéro pièce (nouveau, `verifyOffset`), corrections, plan d'une reprise, connecter (2 : Connecter, Ouvrir), type de machine, commandes de l'hôte | 1 ou 2 | **inchangé** | Rien ne bouge ; le serveur garde ses refus. |
| **Prise de main** | prendre la main | 3 | **2** (bandeau, bouton « Prendre la main — … ») | Cible du parcours P9. Le motif reste envoyé et journalisé ; le bouton dit ce qu'il arrête (§ 5.3). |

**Ce que la refonte ajoute au dialogue, sans rien retirer** (§ 5.1, § 5.2) :
1. le bouton d'engagement est nommé par son effet, plus « Confirmer » ;
2. il ne s'arme qu'après 600 ms d'affichage (aujourd'hui : dès la case cochée) ;
3. il n'est jamais sous le bouton qui a ouvert le dialogue ;
4. le texte tient en deux phrases, et le dessin ou le verdict est dans le dialogue.

**Pourquoi la case reste partout.** La première version de cette spec la retirait sur la tablette posée à côté de la machine, pour gagner un toucher par mouvement. Le jury y renonce :
- le prompt (§ 4.5, § 5.5) interdit de retirer un garde-fou, et réserve tout changement de garde au chantier A ; `PLAN-CORRECTIONS.md` n'en prévoit pas ;
- la case ne dit pas que « Je suis devant la machine » : elle fait attester ce que rien ne mesure (table dégagée, bloc, plaque et pince en place) ; une adresse en boucle locale ne prouve rien de cela ;
- les cibles du prompt sont tenues avec la case (P4 = 4, P5 = 3, P9 = 2), et aucun parcours ne prend plus de touchers qu'aujourd'hui (§ 7).

L'allègement reste une idée pour l'opérateur (§ 13.1, n° 11), à décider par lui puis à porter par le chantier A.

Dans le code (`job-controls.js`) : `#job-check` et sa règle d'activation ne changent pas ; seuls changent les textes (§ 5.2), l'armement après 600 ms et la place de la carte. Test : `test-confirmation-classes.cjs`.

### 6.4 L'indicateur de la séance (`touch/seance.js`)

Un module pur, sans accès à la page (`CNCSeance.evaluate(entree)`), testé cas par cas, et sa liaison à la page (`cncSeance`). Il est la **seule** source des marques du rail, des mots d'en-tête, des causes et des actions des barres d'étape, et des lignes de ①.

**Entrée** : l'état reçu (`machine`, ou rien), `transportConnected`, `halt`, `systemCommand`, `pilot`, le fichier choisi, le type de machine. Aucune mémoire entre deux appels.

**Étape faite ?**

| Étape | Faite quand | Mot d'en-tête quand elle ne l'est pas |
|---|---|---|
| ① Machine | connectée, information à jour, main libre ou à cet appareil, pas d'alarme, réglages lus, `homed`, aucun incident ouvert (§ 6.9) | celui de la première cause (§ 4.1) |
| ② Fichier | un fichier est chargé (`machine.name`) | « Aucun fichier » ; « Choisi » quand un fichier est choisi sans être chargé |
| ③ Zéro pièce | état « posé » (§ 4.3) **et** `workOffset.state === 'proven'` | « À poser », « Ancien zéro », « À vérifier », « Palpage… » |
| ④ Contrôle | `programCheck.verdict === 'validated'` et `canStart` | « En attente », « Zéro pièce à vérifier », « Dépasse en {axe} », « Non vérifié », « À recharger » |
| ⑤ Usinage | l'usinage est terminé | « En cours · 42 % », « Pause », « Alarme N », « Arrêté ligne N », « Rien en cours » |

**Marque du rail** : `inconnu` si le serveur est injoignable ; `alerte` si l'étape porte une anomalie (alarme, main ailleurs, dépassement, non vérifié, arrêt avant la fin, zéro pièce non confirmé) ; `fait` si elle est faite ; `suite` pour la première étape non faite dans l'ordre (ou ⑤ pendant un usinage) ; `attente` pour les suivantes.

**Étape suivante** (`suite`) : ⑤ si un usinage est en cours, en pause ou en alarme ; sinon la première étape non faite ; sinon ④. « Suite : X → » sur un écran mène à la première étape non faite après lui (à défaut ④). La page d'arrivée (§ 2.5) lit ce même champ `suite`.

**Causes globales**, dans cet ordre de priorité.

| # | Identifiant | Condition | Phrase | Remède |
|---|---|---|---|---|
| 1 | `hors-ligne` | aucune machine et flux fermé | La tablette ne joint plus le serveur. Elle réessaie seule. | `recharger-page` |
| 2 | `etat-perdu` | état perdu pendant une activité (`halt`) | L'état de la machine est perdu. Arrêter reste possible. | `aucun` |
| 3 | `non-connectee` | flux ouvert, aucune machine | La machine n'est pas connectée. | `connecter` |
| 4 | `main-ailleurs` | `pilot.state === 'other'` | C'est « {appareil} » qui a la main. Pause et Arrêter restent possibles ici. | `prendre-la-main` |
| 5 | `information-ancienne` | `machine.fresh` faux | La machine ne répond plus depuis {n} s. Vérifiez qu'elle est allumée et branchée. | `details` |
| 6 | `commande-tablette` | `systemCommand` | Une commande de la tablette est en cours. Attendez sa fin. | `aucun` |
| 7 | `alarme-usinage` | alarme et usinage ouvert | Alarme {N} pendant l'usinage. Arrêtez l'usinage. | `arreter-usinage` |
| 8 | `alarme` | alarme, aucun usinage ouvert | La machine est en alarme : sa position est perdue. | `remise-en-route` |
| 9 | `reglages-non-lus` | le refus du serveur dit un réglage ou la version inconnus (codes de la famille n° 5 du § 9.2 dans `refusals`, ou `workOffset.code === 'ETOUCH_OFFSET_SETTINGS'`) | La machine n'a pas encore donné ses réglages. | `relire` |
| 10 | `origine-a-prendre` | au repos, `homed` faux (ou `referenceLost` non nul) | Origine machine pas prise : la machine ne sait pas où elle est. | `prise-origine` |
| 11 | `occupee` | prise d'origine, palpage, déplacement ou lecture des réglages en cours | Prise d'origine en cours. / Palpage en cours. / Déplacement en cours. / Lecture des réglages en cours. | `aucun` |
| 12 | `usinage-en-cours` | usinage en cours ou en pause | Un usinage est en cours. | `voir-usinage` |
| 13 | `broche-tourne` | au repos, broche qui tourne | La broche tourne : arrêtez-la d'abord. | `arreter-broche` |

**Les six premières rayent les commandes machine de l'écran. Trois choses leur échappent toujours :**
- **le remède de la cause elle-même** : [Connecter la CNC] sous `non-connectee`, [Prendre la main] sous `main-ailleurs`, [Recharger la page] sous `hors-ligne` restent actifs ;
- **Pause et Arrêter**, du bandeau comme de l'écran : ils suivent `canPause` et `canStop` ; en état perdu, `halt.canPause` et `halt.canStop` ;
- **le relâchement d'une flèche tenue** : l'arrêt du déplacement part toujours, même si le flux ou la main viennent d'être perdus pendant l'appui.

Sous `hors-ligne`, la barre ajoute : « En cas de besoin : l'arrêt d'urgence de la machine. » (Arrêter n'atteint plus la machine).

**Le zéro pièce (D2)** — causes propres à ③ et ④, lues dans `workOffset` (K3) :

| Identifiant | Condition | Phrase | Remède |
|---|---|---|---|
| `zero-verification` | `state` = `unknown` ou `checking` | La machine vérifie le zéro pièce. Attendez quelques secondes. | `aucun` |
| `zero-non-confirme` | `failed`, code `ETOUCH_OFFSET_UNCONFIRMED` | La machine n'a pas confirmé le zéro pièce. | `verifier-zero` |
| `zero-a-refaire` | `failed`, code `ETOUCH_OFFSET_MISMATCH` | La machine n'applique pas le zéro pièce enregistré. Refaites-le. | `refaire-zero`, puis `verifier-zero` |
| (cause n° 9) | `failed`, code `ETOUCH_OFFSET_SETTINGS` | La machine n'a pas encore donné ses réglages. | `relire` |
| `zero-non-verifie` | champ `workOffset` absent | Le zéro pièce n'est pas vérifié. | `details` |

`verifier-zero` envoie l'action `verifyOffset` (bail exigé, sans confirmation, rien ne bouge) ; le bouton est actif quand `workOffset.canVerify`. `refaire-zero` mène à ③ : poser un zéro « ici » reste permis quand le zéro n'est pas prouvé, et le serveur le revérifie aussitôt ; les palpages, eux, sont refusés d'ici là.

**Autres causes propres à une étape** : ② `aucun-choix` (« Choisissez un fichier dans la liste. ») ; ③ `zero-a-poser`, `zero-ancien` ; ④ `aucun-fichier`, `a-recharger`, `depasse`, `non-verifie` ; ⑤ les états du § 4.5. Leurs phrases sont aux § 4 et § 9.2.

**Algorithme de la barre d'un écran** (règle 9 du § 1.1) :
1. Si une des six premières causes est vraie : c'est la cause ; l'action de l'écran est rayée, sauf si elle est le remède de cette cause.
2. Sinon, si le serveur refuse l'action de l'écran (tableau ci-dessous) : la cause est la première cause globale vraie ; à défaut la première cause propre à l'écran ; à défaut « Impossible pour l'instant. » avec [Détails], qui donne la raison du serveur. L'action est rayée.
3. Sinon : l'action est active. La cause est la cause propre à l'écran si l'étape n'est pas faite (« Il manque : … »), sinon la phrase d'état.

Sur l'écran dont le remède est l'action (① pour `connecter`, `prendre-la-main`, `relire`, `prise-origine`, `arreter-usinage`), l'action principale **est** le remède, pleine.

| Écran | Action de la barre | Le serveur l'accepte quand |
|---|---|---|
| ① | selon la première ligne non faite | flux ouvert sans machine (connecter) ; `pilot.state === 'other'` (prendre la main) ; `canReadSettings` (relire) ; `canStop` (arrêter l'usinage) ; `canHome` (prise d'origine) ; `canLoad` (reprise) |
| ② | Charger ce fichier | `canLoad` et un fichier choisi |
| ③ | Suite : Contrôle → | toujours (navigation). Les commandes de l'écran ont leur garde et leur cause dans leur carte : flèches `motion.canJog`, zéros `motion.canSetOrigin`, [Palper au bloc …] `canBlockProbe`, [Zéro Z à la plaque…] `canZeroZ` ; en laser, [Zéro XY ici] `motion.canSetOrigin`. |
| ④ | Démarrer l'usinage… | `canStart`, et aucun axe `outside` (défense de la page, lot P1 du plan) |
| ⑤ | Pause ; Reprendre… | `canPause` ; `canResume` |

**Sortie** : `{etapes: {machine, files, jog, check, home → {etat, mot, contexte}}, suite, barres: {écran → {cause: {id, texte, ton}, remedes, details, action: {id, libelle, style}}}, lignes}` (`lignes` = la liste de ①). `style` vaut `plein`, `contour` ou `raye`.

`cncSeance.lancer(id)` exécute un remède ou une action : les modules propriétaires enregistrent leur fonction (`cncSeance.enregistrer('prise-origine', fn)`).

**Écriture dans la page.** `cncSeance` calcule à chaque état reçu, mais n'écrit que le rail et l'écran affiché, et seulement les nœuds dont la valeur change (comparaison avec la sortie précédente). Deux états identiques de suite ne produisent aucune mutation (test dans `test-fil.cjs`) : la RT ne paie rien pendant un usinage.

### 6.5 Le voyant de la sonde (`#probe-signal`)

Ce n'est pas un bouton : pas de bord, une pastille et un mot.

| État | Affichage | Condition |
|---|---|---|
| libre | « ● Libre » (neutre) | `probeInput.state` libre |
| touche | « ● Touche » (accent), tenu 1,5 s comme aujourd'hui | contact |
| touche en permanence | « ! Touche en permanence » (ambre) ; [Tester] devient [Pourquoi ?] | `probeInput.stuck` vrai (le serveur : contact sans interruption depuis 5 s, K9), hors palpage |
| inconnu | « ? Inconnu » ; [Tester] devient [Pourquoi ?] | état inconnu ou ancien |

« Un état inconnu ne vaut jamais libre » (règle actuelle, gardée). La page ne compte pas elle-même la durée du contact.

### 6.6 Le dessin de la zone de départ du palpage (`touch/probe-diagram.js`)

Vue de dessus, X+ vers la droite, Y+ vers le fond. SVG statique, redessiné quand le choix, le coin ou les mesures changent. Aucun nombre de géométrie n'est calculé par la page.

**Mode « écran »** (carte Sonde, 362 × 148 dans une fenêtre de 768, 291 de haut dans une fenêtre de 911) : la pièce (aplat clair), le bloc au coin choisi, son trou barré d'une croix, la **zone de départ** hachurée sur le bloc près du coin, la fraise « ● », une flèche par touche (Z vers le bas, puis X, puis Y). Une légende d'une ligne dessous, selon le choix :
- XYZ : « Fraise au-dessus du coin du bloc, loin du trou. »
- Z : « Fraise au-dessus du bloc. »
- X ou Y : « Fraise à côté de la face, à mi-hauteur du bloc. »

Ce que la légende ne dit plus est dessiné : la zone hachurée montre « près des deux bords », la flèche de X ou de Y montre le sens.

**Mode « plan »** (dialogue « Palper le bloc », 552 × 240 ; 552 × 180 dans une fenêtre de 768) : le même dessin, coté avec les nombres du ticket du serveur (`ticket.blockProbe`) : `window` (« à moins de 28 mm des deux bords »), `lateral` (« la fraise sort de 12 mm de chaque côté »), `depth` (« puis descend de 4 mm sous le dessus du bloc »), `reach` (« rien ne doit dépasser à moins de 22 mm de la fraise »). Trois lignes de texte au plus sous le dessin ; les décalages calculés (rayon, paroi) sont dans « Détails ». Sous les cotes, une ligne fixe : « Le dessin montre où placer la fraise. Il ne voit pas le bloc. »

Le remède `dessin-depart` d'un refus ne change pas d'écran : il entoure le dessin de la carte (un contour fixe, sans animation) et écrit la phrase du refus à la place de la légende.

**Ce que le dessin ne fait pas.** Il conseille un placement, il ne le constate pas : c'est le serveur qui refuse un départ hors de la zone (`ETOUCH_PROBE_WINDOW` et les refus voisins, famille n° 20 du § 9.2). Le cas du 14 novembre (départ trop loin des bords, la fraise redescend sur le bloc) est donc atténué, pas supprimé, jusqu'à l'essai réel.

### 6.7 L'emprise et la profondeur du fichier contre la course (`touch/program-check-view.js`)

Deux dessins SVG statiques, tracés depuis `programCheck` de l'état reçu : les mêmes nombres servent au verdict du serveur. Par axe : `machineMin`, `machineMax` (le fichier, en position machine), `usable.low`, `usable.high` (la course utilisable, marge de 0,5 mm comprise, K8), `min`, `max` (le fichier, en position pièce), `verdict`.

- **Vue de dessus** (`#check-top`) : le rectangle de la course X × Y ; dedans, le rectangle du fichier ; la partie qui sort est hachurée en rouge et cotée (« 12 mm ») ; le zéro pièce « ● » (position machine = `machineMin − min`) ; la fraise « + » (`coordinates.mpos`). Cotes : la course en petit (« 408 × 396 »), l'emprise en 16 px (« 400 × 70 »).
- **Vue de côté** (`#check-side`) : une barre verticale = la course en Z, « haut de la course » et « plus bas possible » ; le trait « zéro Z » ; le bloc du fichier, de son point le plus haut à son point le plus bas, coté (« 20,8 mm ») ; ce qui passe sous « plus bas possible » est hachuré en rouge et coté (« 15 mm de trop »). Le trait s'appelle « zéro Z », pas « dessus de la pièce » : la page ne sait pas où est le dessus réel de la pièce.
- **Dépassement** : la cote est le `over` que le serveur publie dans `programCheck.blocking` (K1), jamais un calcul de la page : le dessin et le verdict ne peuvent pas se contredire. Côté, selon `axis` et `sign` : X− « à gauche », X+ « à droite », Y− « vers l'avant », Y+ « vers le fond », Z− « trop bas », Z+ « trop haut ».
- **Marge** (verdict « tient ») : la plus petite distance entre le fichier et la course utilisable sur l'axe, `min(machineMin − usable.low, usable.high − machineMax)`, arrondie au millimètre inférieur. C'est un affichage ; elle ne décide rien.
- **Axe non vérifié** (`usable` nul ou `machineMin` absent) : l'axe est tracé en pointillé, sans hachure, avec « non vérifié » ; le fichier est dessiné à sa taille seule.
- **Sans fichier** : la course seule, et « Aucun fichier chargé. ».
- Couleurs : neutre pour ce qui tient, rouge hachuré pour ce qui dépasse, toujours avec la cote en chiffres.
- Ce contrôle est un contrôle de course. Une ligne fixe le dit en bas de « Détails du contrôle » : « Ni les brides ni la pièce ne sont vues. »

Dans ② le dessin n'est pas répété : la ligne de verdict suffit (§ 4.2).

### 6.8 Bouton rayé et raison visible

Règle unique, sur tous les écrans :
1. un bouton que le serveur refuse est rayé (motif actuel) ;
2. sa raison est écrite sans qu'on le touche : dans la barre d'étape pour l'action de l'écran, dans la zone de cause de la carte pour les boutons de la carte Sonde, sur le bouton lui-même pour une tuile de Plus ;
3. le toucher redit cette même raison (toast `#ks-why`, inchangé) ; la phrase de repli « Indisponible dans l'état actuel de la machine. » ne doit plus jamais sortir sur un écran d'étape (test).

### 6.9 La remise en route après un incident

Ce n'est pas un écran de plus : c'est ① quand un incident est ouvert.

**Incident ouvert** quand l'une de ces conditions est vraie, toutes lues dans l'état du serveur (elles survivent donc à un rechargement de la page) :
- la machine est en alarme ;
- `lastAlarm` n'est pas nul (le serveur le garde jusqu'à la prochaine prise d'origine finie, K7) ;
- `referenceLost` n'est pas nul (`'alarm'` ou `'restart'`) ;
- un usinage a été arrêté avant la fin (`jobStopped`) et sa ligne d'arrêt est connue ;
- un usinage est encore ouvert pendant une alarme.

**Comment on y arrive** : `#t-recover` du bandeau ; l'action « Remise en route → » de ⑤ ; le remède `remise-en-route` de tout refus ; ou directement, la page s'ouvrant sur ① quand la machine n'est pas prête.

**L'encart « Ce qui s'est passé »** (`#machine-incident`) : quatre lignes au plus, chacune une phrase.
1. Ce qui est arrivé : « Alarme 2 : la machine a dépassé sa course. » (`lastAlarm.code` ; titres de `grbl-help.js`, réécrits sans nom de réglage ; sans code : « Alarme. ») ou « Usinage arrêté à la ligne 1 234. ».
2. « La machine a redémarré. » — quand `lastAlarm.restarted` est vrai ou que `referenceLost` vaut `'restart'`.
3. « Perdu : la position de la machine. » quand `homed` est faux.
4. « Gardé : le fichier chargé. » ; puis l'état du zéro pièce, le même texte que la ligne `zero` de ① (§ 4.1) : « Zéro pièce : à vérifier après la prise d'origine », puis « gardé, vérifié », ou « à refaire ».
[Détails] donne le code, la phrase du serveur et l'aide technique.

La page ne dit jamais que le zéro pièce est gardé avant que le serveur l'ait prouvé (`workOffset.state === 'proven'`).

**La suite, dans l'ordre** : les lignes de la liste de ① (§ 4.1) : arrêter l'usinage ouvert → prise d'origine machine → zéro pièce vérifié (le serveur le fait seul ; [Vérifier à nouveau] s'il n'y arrive pas) → reprendre à la ligne proposée → (④) démarrer. L'action principale est toujours la première ligne non faite. Les mentions « ($X) », « ($H) » et « consulter CNCjs » disparaissent. « Reset dans CNCjs au PC » quitte le chemin de l'opérateur ; l'aide reste exacte pour une machine qui ne répond plus du tout (`audit/V2`, S3), donc elle est gardée dans [Détails] de l'encart et dans le Guide, en une phrase : « Si la machine ne répond plus du tout : éteignez-la, rallumez-la, puis reconnectez. »

**Déverrouiller** n'est jamais l'action proposée d'abord : la prise d'origine est acceptée en alarme. Il reste en secondaire, avec sa phrase (§ 5.2). Après un déverrouillage sans prise d'origine, le serveur refuse le départ et les zéros (`ETOUCH_START_NOT_HOMED`, `ETOUCH_ORIGIN_NOT_HOMED`) : la cause `origine-a-prendre` et son remède s'affichent.

---

## 7. Les dix parcours sur la spec

Convention et comptes « avant » : `ERGONOMIE.md` § A (tablette CNC). La case du dialogue est comptée partout (§ 6.3) : il n'y a qu'une colonne « après ». Les comptes sont les mêmes sur la tablette et sur un autre appareil.

| Parcours | Avant | Après | Impasses avant → après | Cible |
|---|---|---|---|---|
| P1 Mise en route | 6 (10 si CNCjs a redémarré) | **5** dans les deux cas | 3 → 0 | sans aide |
| P2 Fichier | 3 (4 pour le verdict) | **3**, verdict lu avant de charger | 2 → 0 | savoir tout de suite |
| P3 Bloc, première fois | 35 + détour ≥ 3, 9 saisies | **14**, 4 saisies, sans détour | 5 → 0 | guidé par des dessins |
| P4 Bloc, fois suivantes | 6 + détour | **4** de n'importe quel écran (3 depuis ③) | 3 → 0 | ≤ 4 |
| P5 Zéro Z à la plaque | 3 depuis Suivi, 4 ailleurs | **3** depuis ③ et depuis ⑤ (fin d'usinage, pause de changement d'outil) ; 4 depuis ①, ② ou ④ | 3 → 0 | ≤ 3, avec le bloc |
| P6 Zéros à la main | 4 ; XYZ 3 ; origine machine impossible | **3** ; 3 ; **4** | 2 → 0 | — |
| P7 Contrôle et départ | 9 | **9**, dépassement dit avant | 2 → 0 | dépassement dit avant |
| P8 Après une alarme | 12 | **10** | 5 → 0 | suite dans l'ordre |
| P9 La main | 3 | **2** | 2 → 0 | 2 |
| P10 Sonde qui ne répond pas | 3, puis impasse | **2**, puis 0 à 3 | totale → 0 | diagnostic guidé |

Aucun parcours ne prend plus de touchers qu'aujourd'hui, et les trois cibles chiffrées sont tenues (P4 = 4, P5 = 3, P9 = 2). P5 vaut 3 aux deux endroits où l'on se trouve entre l'ébauche et la finition : sur ⑤ quand l'usinage vient de finir, et sur ③ quand le fil y mène après le chargement du fichier de finition. Depuis un autre écran il vaut 4, comme aujourd'hui.

**P1 — Mise en route** (tablette allumée, port fermé). La page s'ouvre sur ①.
1. [Connecter la CNC] (barre d'étape) → la carte demande « Connecter la machine ? ». Plusieurs ports : + 1 toucher sur le port.
2. [Ouvrir] (dans la carte) → la machine redémarre, bandeau « Alarme » ; les réglages sont lus seuls, même en alarme (K4) ; la ligne `origine` passe en tête.
3. [Prise d'origine machine…] (barre d'étape) → dialogue.
4. La case. 5. [Lancer la prise d'origine] → bandeau « Prise d'origine », puis « Repos » ; le serveur vérifie le zéro pièce ; en-tête « Prête » ; action « Suite : Fichier → ».

CNCjs a redémarré : les mêmes 5 touchers (10 aujourd'hui). La machine ne redonne pas sa version à la connexion : la lecture des réglages part seule, même en alarme (K4), et ① dit « Lecture des réglages… » entre 2 et 3. Si elle n'aboutit pas, [Relire les réglages] est l'action de la barre : + 1. Refus possibles, chacun avec son bouton : aucun port (« La machine n'est pas branchée ou pas allumée. » [Chercher à nouveau]), main ailleurs, broche qui tourne.

**P2 — Fichier** (machine prête).
1. « Suite : Fichier → » (ou ② sur le rail).
2. La ligne du fichier → aperçu, « Emprise 400 × 70 mm », « Profondeur sous le zéro 20,8 mm », et la ligne de verdict du serveur avec le zéro actuel.
3. [Charger ce fichier] → on reste sur ② ; l'action devient « Suite : Zéro pièce → » (ou « Suite : Contrôle → » si le zéro est posé) ; ④ change de marque dans le rail.

**P3 — Zéro pièce au bloc, première fois** (sonde jamais décrite, machine prête).
1. ③ sur le rail. Les flèches sont sur l'écran : la fraise est amenée au-dessus du coin (non compté).
2. [Palper au bloc XYZ…] → il manque les mesures : l'assistant « Ma sonde » s'ouvre, page 1 (le bouton est actif : c'est une navigation, § 4.3).
3. Le coin dessiné (« Avant gauche », proposé) → page 2.
4 à 11. Quatre champs (épaisseur, paroi X, paroi Y, diamètre) : champ, saisie, [Valider] → 8 touchers, 4 saisies. Le pavé est rangé à droite : le dessin coté et la consigne du test restent visibles.
— Geste, non compté : toucher le bloc avec la fraise, puis l'écarter ; les deux coches du volet se cochent.
12. [Enregistrer et palper] → dialogue « Palper le bloc XYZ », dessin coté par le serveur. Si le geste du test n'a pas été fait, le volet se ferme et la carte Sonde écrit la consigne avec ses coches ; après le geste, [Palper au bloc XYZ…] : + 1.
13. La case. 14. [Lancer le palpage XYZ] → avancement dans la carte, puis « Zéro pièce posé : X 0 · Y 0 · Z 10,000. » ; en-tête « Posé à 14:12 » ; action « Suite : Contrôle → » pleine.

**P4 — Zéro pièce au bloc, fois suivantes** (depuis n'importe quel écran).
1. ③. 2. [Palper au bloc XYZ…] (XYZ est toujours le choix à l'arrivée ; si le test du contact a plus de 10 min, le bouton est rayé avec la consigne et se libère au geste). 3. La case. 4. [Lancer le palpage XYZ].
Un palpage d'un seul axe au bloc (Z, X ou Y) : + 1 toucher sur son bouton de choix.

**P5 — Zéro Z à la plaque** (entre ébauche et finition).
Depuis ⑤, l'ébauche vient de finir (« Terminé ») : 1. [Zéro Z à la plaque…] de l'encart (épaisseur reprise). 2. La case. 3. [Lancer le zéro Z].
Depuis ③ (le fil y mène après le chargement du fichier de finition) : les mêmes trois touchers, avec le bouton de la carte Sonde.
Pendant une pause de changement d'outil : les mêmes trois, depuis l'encart de ⑤.
Depuis ①, ② ou ④ : ③ d'abord, soit 4.
La première fois : le volet « Plaque » s'ouvre (champ, saisie, [Valider], [Enregistrer et palper]) : + 3 touchers et 1 saisie. Le bouton ne disparaît jamais : refusé, il est rayé avec sa cause et son remède.

**P6 — Zéros à la main.**
Un axe : 1. ③ (flèches) ; 2. [Zéro X ici] ; 3. [Poser le zéro X ici]. Trois axes : 1. ③ ; 2. [Zéro XYZ ici] ; 3. [Poser le zéro XYZ ici]. Un axe à l'origine machine : 1. ③ ; 2. [Autres zéros…] ; 3. [X à l'origine machine] ; 4. [Mettre le zéro X à l'origine machine].

**P7 — Contrôle et départ** (fichier chargé, zéro posé ; depuis ④, comme « avant » depuis Suivi).
Le verdict et les deux dessins sont affichés avant tout toucher. S'il dépasse : [Démarrer l'usinage…] est rayé, la cause dit « Le fichier descend 15 mm trop bas. Relevez la pièce, puis refaites le zéro Z. » avec [Refaire le zéro Z].
1. [Démarrer l'usinage…]. 2. La case. 3. [Lancer l'usinage] → ⑤. 4. Une correction (vitesse, broche ou rapides : un toucher chacune, en v1 et en v2). 5. [Pause]. 6. [Reprendre…]. 7. La case. 8. [Reprendre l'usinage]. 9. [Arrêter].
La correction est comptée pendant l'usinage : après l'arrêt, les corrections sont rayées.

**P8 — Après une alarme en plein usinage** (alarme 2, machine redémarrée).
1. [Arrêter l'usinage] (action de ⑤, ou Arrêter du bandeau).
2. « Remise en route → » (action de ⑤, ou `#t-recover`) → ① : « Ce qui s'est passé » et la liste.
3. [Prise d'origine machine…]. 4. La case. 5. [Lancer la prise d'origine] → la ligne « Zéro pièce » passe de « la machine le vérifie… » à « gardé, vérifié » quand le serveur l'a prouvé (D2).
6. [Reprendre à la ligne 1 219…] (action de ①, qui a remplacé [Prise d'origine machine…] dans la barre) → volet, plan vérifié seul.
7. [Charger la reprise] → ④, contrôle de la reprise.
8. [Démarrer l'usinage…]. 9. La case. 10. [Lancer l'usinage].
Si le serveur n'arrive pas à vérifier le zéro pièce : la ligne porte [Vérifier à nouveau] (+ 1), ou [Refaire le zéro pièce] quand il faut le refaire ; le départ reste refusé d'ici là (D2).

**P9 — La main.** Qui l'a : le bouton du bandeau, toujours. 1. [La main : autre] (ou le remède [Prendre la main] de n'importe quel refus). 2. [Prendre la main — je suis devant la machine].

**P10 — Sonde qui ne répond pas.**
Contact permanent : 1. ③ → le voyant dit « ! Touche en permanence ». 2. [Pourquoi ?] → volet en A1 ; ensuite un toucher [Ça touche toujours] par hypothèse écartée (bloc, broche, pince) : 0 à 3. Le cas du 14 novembre se termine en A2 : la consigne fait débrancher la broche, pince en place, le voyant passe à « libre » et le volet nomme la broche.
Jamais de contact : le refus « La sonde n'a rien touché… » porte [Tester la sonde] → volet en B1.

---

## 8. Le journal de terrain : ce qui empêche chaque ligne de se reproduire

« Empêchée » ou « atténuée » : selon la conception. Rien n'a été essayé sur la machine.

| # | Dans la spec | Dans le chantier A | Verdict |
|---|---|---|---|
| T1 | Rien dans l'organisation ne règle la luminosité hors de Réglages ; sur une page distante, le choix « Pendant la veille » est rayé avec sa raison (§ 4.7). Le mécanisme est celui du serveur. | D3 : C-10, C-15 (S5, P2) | empêchée pour les causes connues, si l'adresse du kiosque est en boucle locale (essai n° 1 du plan) |
| T2 | Le verdict est dit dès le choix du fichier (②), dessiné dans ④, marqué « ! » sur le rail ; le départ est rayé avec sa cause et son remède. | D1 : C-01, C-04, C-05, C-06 (S3) ; D2 (S2) | empêchée |
| T3 | Plus de dialogue rouge au départ : le contrôle se lit en mots dans ④ ; après une prise d'origine, la ligne « Zéro pièce » dit « la machine le vérifie… » puis « vérifié », et porte [Vérifier à nouveau] en cas d'échec (§ 4.1, § 6.4). | D2 : C-02, C-03 (S2) ; C-04 (S3) | empêchée |
| T4 | Bloc et plaque sont deux boutons voisins de la même carte, sur l'écran des flèches (§ 4.3). | — | empêchée |
| T5 | Assistant « Ma sonde » : un coin dessiné, quatre mesures sans signe sur un dessin coté et vide, vitesses déjà réglées, coin non demandé pour Z (§ 5.5). | D4 c (P1) | empêchée |
| T6 | Le test du contact est guidé dans l'assistant et sur la carte, coches en direct ; un bouton refusé est rayé, ou sa cause est écrite sur place avec son remède ; un toucher ne laisse jamais l'écran identique sans phrase (§ 4.3, § 6.1). | C-27, C-28, C-43 (refonte) | empêchée |
| T7 | Le refus de course d'un palpage dit le côté et la distance, en mots d'atelier ; les positions machine sont dans « Détails » (§ 9.2 n° 21). | C-22 (S6) : moins de refus à tort | atténuée (le serveur refusera encore tout près d'un bord) |
| T8 | Dessin de la zone de départ sur la carte ; dessin coté par le serveur dans le dialogue ; le refus d'un mauvais départ montre le dessin (§ 6.6). | fait (`3049a0e4`) | atténuée : le dessin conseille, le serveur refuse ; à confirmer à l'essai |
| T9 | Voyant « Touche en permanence » et [Pourquoi ?] ; le volet fait débrancher la broche pince en place, puis retirer la pince (§ 5.6, § 6.5). | D4 d : C-28 (S5) | empêchée |
| T10 | La ligne « Réglages » et [Relire] sont toujours visibles dans ①, actifs en alarme ; `relire` est le remède des refus concernés, sur place (§ 4.1). | D4 b : C-14 (S5, P1) | empêchée |
| T11 | [Zéro Z à la plaque…] n'est jamais masqué : rayé, avec sa cause et son remède (§ 4.3, § 6.8). | C-29 (refonte) | empêchée |
| T12 | « La main : … » est un bouton du bandeau ; tout refus de main porte [Prendre la main] ; sur l'appareil qui n'a pas la main, les commandes sont rayées avec cette cause ; le bouton dit ce qu'il arrête (§ 2.2, § 5.3, § 6.4). | C-30, C-48 | empêchée |
| T13 | Volet « Autres zéros » : [X à l'origine machine] (§ 5.8). | D4 a (S5) | empêchée |
| T14 | La cause n'est pas connue : les suffixes de cache ne l'expliquent pas (`CONSTATS.md` § 3). Ce que fait le lot : le rechargement passe à travers la veille (C-33) ; Réglages › Système dit la version chargée et la version installée, avec [Recharger] (C-49) ; Plus affiche la version chargée (§ 4.6). La valeur de cache unique (L1) n'est qu'un gain d'entretien. | C-33, C-49 (P2) ; Q-11, Q-12 (essai n° 3 du plan) | atténuée, à trancher à l'essai |
| T15 | « Profondeur sous le zéro » nommée en grand dans ② avant le chargement ; comparée à la course dès le choix ; vue de côté dans ④ (§ 4.2, § 6.7). | D1 (S3) | empêchée |

---

## 9. Les textes

### 9.1 La forme d'un refus

1. **Une phrase de cause**, deux lignes de 16 px au plus (90 caractères), au présent, avec les mots du glossaire. Elle dit ce qui empêche, pas ce que le logiciel a fait.
2. **Si un geste suffit, une seconde phrase à l'impératif** (« Relevez la pièce, puis refaites le zéro Z. »).
3. **Un bouton remède** (un seul ; deux quand il y a deux sorties réelles), nommé par ce qu'il fait.
4. **« Détails »** pour le code, la phrase du serveur et les nombres en position machine.
5. **L'endroit** : là où l'on a touché (§ 6.1).
6. Un refus que la table ne connaît pas s'affiche « Action refusée. » avec [Détails] : jamais un bouton qui ne répare rien.
7. Un nombre porte son unité ; la virgule est décimale en français ; un dépassement est dit en mm et en côté (« 15 mm trop bas »), jamais en position machine.

### 9.2 La table des refus

Codes : ceux du serveur (`src/server/services/touch/*.js` : 138 codes au commit `02e76c19`, avant les lots S2 à S6) et ceux que `PLAN-CORRECTIONS.md` § 4.1 ajoute. « raison » = une phrase du serveur sans code ; depuis le lot S2 le serveur publie le code derrière chaque raison (`refusals`, K12) : la page lit le code, et ne reconnaît une phrase par son début qu'à défaut. Chaque code a **une** famille dans `CNCTouchRefus.codes` ; `test-refus-table.cjs` échoue si un code du serveur n'y est pas.

**Les 25 familles les plus fréquentes**

| # | Famille | Codes et raisons du serveur | Phrase affichée | Remède |
|---|---|---|---|---|
| 1 | `non-connectee` | `ETOUCH_MACHINE_CONNECTION`, `ETOUCH_PROBE_LOST` ; raisons « Contrôleur Grbl non connecté. », « Connexion machine indisponible. » | La machine n'est pas connectée. | Connecter la CNC |
| 2 | `main-ailleurs` | `ECONTROL`, `ETOUCH_PROBE_PILOT`, `ETOUCH_PROBE_CONTROL` | C'est « {appareil} » qui a la main. Pause et Arrêter restent possibles ici. | Prendre la main |
| 3 | `alarme` | `ETOUCH_MOTION_ALARM`, `ETOUCH_PROBE_ALARM`, `ETOUCH_PROBE_RESTART` | La machine est en alarme : sa position est perdue. | Remise en route |
| 4 | `origine-a-prendre` | `ETOUCH_CHECK_NOT_HOMED`, `ETOUCH_CHECK_POSITION_UNKNOWN`, `ETOUCH_CHECK_HOMING_DIRECTION`, `ETOUCH_MOTION_POSITION_UNKNOWN`, `ETOUCH_MOTION_AMBIGUOUS`, `ETOUCH_PROBE_AMBIGUOUS`, `ETOUCH_LASER_FRAME_POSITION`, `ETOUCH_START_NOT_HOMED`, `ETOUCH_ORIGIN_NOT_HOMED` ; raison « Machine non référencée… » | Origine machine pas prise : la machine ne sait pas où elle est. — Pour `_HOMING_DIRECTION`, `_AMBIGUOUS` : Refaites la prise d'origine depuis la tablette : la machine ne sait pas où est {axe}. | Prise d'origine machine… |
| 5 | `reglages-non-lus` | `ETOUCH_CHECK_HOMING_SETTING`, `ETOUCH_CHECK_TRAVEL_UNKNOWN`, `ETOUCH_CHECK_REPORT_UNITS`, `ETOUCH_MACHINE_SETTINGS_UNKNOWN`, `ETOUCH_PROBE_PARAMETERS`, `ETOUCH_PROBE_TRAVEL_UNKNOWN`, `ETOUCH_LASER_CHECK_MAX_UNKNOWN`, `ETOUCH_OFFSET_SETTINGS` ; raisons « Réglage $22 inconnu… », « Version Grbl inconnue… », « Vitesse maximale des axes… inconnue… » | La machine n'a pas encore donné ses réglages. | Relire les réglages |
| 6 | `information-ancienne` | `ETOUCH_MACHINE_STALE`, `ETOUCH_PROBE_STALE` ; raison « État machine trop ancien… » | La machine ne répond plus depuis {n} s. Vérifiez qu'elle est allumée et branchée. | Détails (le bouton se libère seul quand elle répond) |
| 7 | `confirmation-perimee` | `ETOUCH_MACHINE_TRANSPORT`, `ETOUCH_MACHINE_CONTROLLER_CHANGED`, `ETOUCH_MACHINE_RESUME_MODE_CHANGED`, `ETOUCH_PROBE_STREAM`, `ETOUCH_PROBE_WCS`, `ETOUCH_MOTION_WCS_CHANGED`, `ETOUCH_LASER_FRAME_EXPIRED`, `ETOUCH_LASER_FRAME_CHANGED`, `ETOUCH_START_OVERRIDE_CHANGED` ; raisons « Confirmation expirée ou déjà utilisée. », « La machine a bougé depuis la confirmation… » | La confirmation n'est plus valable. Recommencez. | Recommencer (rouvre le même dialogue) |
| 8 | `occupee` | `ETOUCH_MOTION_STATE`, `ETOUCH_MOTION_HOMING`, `ETOUCH_MACHINE_NOT_IDLE`, `ETOUCH_MACHINE_BUSY`, `ETOUCH_SETTINGS_READING` ; raisons « Palpage en cours. », « Prise d'origine en cours. », « Déplacement en cours… », « La machine doit être au repos… » | La machine est occupée : {ce qu'elle fait}. Attendez la fin. | aucun (Arrêter est dans le bandeau) |
| 9 | `usinage-en-cours` | raisons « Impossible pendant un travail… », « Palpage au bloc : machine au repos uniquement… », « Pendant un travail, utilisez Pause ou Arrêter. » | Un usinage est en cours. | Voir l'usinage |
| 10 | `broche-tourne` | `ETOUCH_MOTION_SPINDLE_STEP` ; raisons « La broche tourne encore… », « La broche est commandée… » | La broche tourne : arrêtez-la d'abord. | Arrêter la broche |
| 11 | `depasse` | `ETOUCH_START_OUTSIDE` et ses raisons `ETOUCH_TRAVEL_TOO_LOW`, `_TOO_HIGH`, `_BEYOND` ({N} = `over`) ; `ETOUCH_CHECK_OUTSIDE`, `ETOUCH_CHECK_OUTSIDE_G53` (détail) | Trop bas : Le fichier descend {N} mm trop bas. Relevez la pièce, puis refaites le zéro Z. — Trop haut : Le fichier monte {N} mm trop haut. Abaissez la pièce, puis refaites le zéro Z. — En X ou Y : Le fichier dépasse de {N} mm {côté}. Déplacez la pièce, puis refaites le zéro pièce. — Position machine écrite dans le fichier (`_G53`) : Le fichier demande une position hors de la machine, ligne {N}. Refaire le zéro n'y change rien. | Refaire le zéro Z (ou Refaire le zéro pièce) · Choisir un autre fichier — pour `_G53` : Choisir un autre fichier seul |
| 12 | `zero-a-verifier` | `ETOUCH_OFFSET_CHECKING`, `ETOUCH_OFFSET_UNCONFIRMED`, `ETOUCH_OFFSET_MISMATCH`, `ETOUCH_CHECK_OFFSET_UNPROVEN`, `ETOUCH_CHECK_WCS_OFFSET_UNKNOWN`, `ETOUCH_CHECK_ACTIVE_WCS_UNKNOWN`, `ETOUCH_PROBE_OFFSET` | En cours : La machine vérifie le zéro pièce. Attendez quelques secondes. — Non confirmé : La machine n'a pas confirmé le zéro pièce. — Différent (`_MISMATCH`, `ETOUCH_PROBE_OFFSET`) : La machine n'applique pas le zéro pièce enregistré. Refaites-le. | aucun pendant la vérification — Vérifier à nouveau — Refaire le zéro pièce · Vérifier à nouveau |
| 13 | `non-verifie` | `ETOUCH_CHECK_HOMING_DISABLED`, `ETOUCH_CHECK_REPORT_INCHES`, `ETOUCH_CHECK_UNITS_UNKNOWN`, `ETOUCH_CHECK_DISTANCE_UNKNOWN` | La course n'a pas pu être vérifiée en {axe}. Vérifiez à la main que le fichier tient. | Détails (avertissement, pas un refus : le départ garde sa case) |
| 14 | `a-recharger` | raisons « Rechargez le fichier avant un nouveau départ. », « Le fichier chargé a changé… », « Aucun fichier chargé. », `ETOUCH_LASER_FRAME_NO_PROGRAM` | Rechargez « {fichier} » avant de démarrer. — Sans fichier : Aucun fichier chargé. | Recharger ce fichier — Choisir un fichier |
| 15 | `pas-hors-course` | `ETOUCH_MOTION_STEP_OUTSIDE`, `ETOUCH_MOTION_EDGE` | Ce déplacement sortirait de la machine en {axe}. Prenez un pas plus petit. | aucun (les pas sont sur l'écran) |
| 16 | `sonde-incomplete` | `ETOUCH_PROBE_MISSING`, `ETOUCH_PROBE_PARAM`, `ETOUCH_PROBE_SLOW_FAST`, `ETOUCH_PROBE_RETRACT`, `ETOUCH_PROBE_APPROACH`, `ETOUCH_PROBE_FACE_SIGN`, `ETOUCH_PROBE_FEED`, `ETOUCH_PROBE_TOO_SLOW`, `ETOUCH_PROBE_TIMEOUT`, `ETOUCH_PROBE_AXES` | Il manque une mesure du bloc : {champ}. — Valeur refusée : Les réglages de la sonde ne conviennent pas : {champ}. | Ma sonde… |
| 17 | `test-contact` | raison « Test du contact à faire… » | Avant de palper : touchez le bloc avec la fraise, puis écartez-le. | Tester la sonde (le bouton se libère seul au geste) |
| 18 | `sonde-touche` | `ETOUCH_PROBE_CONTACT_AT_START`, `ETOUCH_PROBE_STUCK`, `ETOUCH_PROBE_CONTACT_STUCK` ; raison « La sonde est déjà en contact… » | La sonde touche déjà. Écartez le bloc de la fraise. | Pourquoi ? |
| 19 | `sonde-rien` | `ETOUCH_PROBE_NO_CONTACT` | La sonde n'a rien touché sur {recherche} mm en {axe}. Rapprochez la fraise du bloc. | Tester la sonde |
| 20 | `fraise-mal-placee` | `ETOUCH_PROBE_WINDOW`, `ETOUCH_PROBE_DESCENT_CONTACT`, `ETOUCH_PROBE_TRAVERSE_CONTACT`, `ETOUCH_PROBE_START_CLOSE` | La fraise n'est pas dans la zone de départ. Replacez-la comme sur le dessin. | Voir le dessin de départ |
| 21 | `palpage-hors-course` | `ETOUCH_PROBE_TRAVEL` (`axis`, `min`, `max`, `low`, `high`) ; raison « Palpage refusé : … » | Le palpage sortirait de la machine de {N} mm {côté}. Éloignez le bloc de ce bord. ({N} = le plus grand de `low − min` et `max − high`, arrondi au dixième supérieur ; {côté} comme au § 6.7) | Détails (les flèches sont sur l'écran) |
| 22 | `mesure-douteuse` | `ETOUCH_PROBE_MISMATCH`, `ETOUCH_PROBE_PRB`, `ETOUCH_PROBE_POSITION`, `ETOUCH_PROBE_WRITE`, `ETOUCH_PROBE_WRITE_UNCERTAIN`, `ETOUCH_PROBE_ERROR` | La mesure n'est pas sûre : refaites le zéro pièce. Vérifiez que le bloc ne bouge pas. | Relancer le palpage |
| 23 | `palpage-arrete` | `ETOUCH_PROBE_STOPPED`, `ETOUCH_PROBE_PAUSED` ; `ETOUCH_PLATE_STREAM`, `_CONTROL`, `_STALE`, `_TIMEOUT` | Bloc : Palpage arrêté. Le zéro pièce n'a pas changé. — Plaque (`ETOUCH_PLATE_*`) : Zéro Z arrêté : la tablette a perdu la machine un instant. Recommencez. | Relancer le palpage |
| 24 | `reprise-ligne` | `ETOUCH_RESUME_LINE`, `_POSITION`, `_CLEARANCE`, `_NO_RAPID_Z`, `_FEED`, `_SPINDLE_SPEED`, `_WCS_POSITION`, `_FIRST_LINE`, `_FIRST_EXPRESSION`, `_PROGRAM_END`, `_DISTANCE_BEFORE` ; `ETOUCH_LASER_RESUME_NOT_RAPID`, `_NOT_BOUNDARY`, `_POSITION`, `_S_UNKNOWN` | La reprise à la ligne {N} n'est pas possible. Choisissez une autre ligne. | Changer la ligne · Reprendre au début |
| 25 | `reprise-impossible` | `ETOUCH_RESUME_ORIGIN_CHANGED`, `_EXPRESSION`, `_INVERSE_TIME`, `_CUTTER_COMPENSATION`, `_TOOL_LENGTH`, `_UNITS_LATE`, `_RELATIVE`, `_G49_AXIS`, `_PLANE`, `_UNSUPPORTED_SYNTAX`, `_FEED_PRECISION`, `_TOOL_OFFSET`, `_DISTANCE` ; `ETOUCH_LASER_RESUME_Z_VARIES`, `ETOUCH_LASER_NO_CNC_RESUME`, `ETOUCH_START_FEED_MODE` | Ce fichier ne peut pas être repris en cours de route. Reprenez au début. | Reprendre au début |
| — | `inconnu` (repli) | `ETOUCH_MACHINE_OPERATION` ; toute raison sans code que la page ne reconnaît pas | Action refusée. | Détails |

Pour le n° 22, la phrase ne dit jamais « le zéro n'a pas changé » : `ETOUCH_PROBE_WRITE_UNCERTAIN` signifie qu'on ne le sait pas. Pour le n° 12, la phrase ne propose jamais de palper : le palpage est refusé tant que le zéro n'est pas vérifié ; « Refaire le zéro pièce » mène à ③, où le zéro « ici » reste permis.

**Les autres familles** (tous les codes restants ; aucune n'a de commande pour remède, sauf la dernière)

| Famille | Codes | Phrase affichée | Remède |
|---|---|---|---|
| `controle-partiel` | `ETOUCH_CHECK_ARC_FROM_UNKNOWN`, `_ARC_PLANE`, `_ARC_RADIUS`, `_AXIS_IDLE`, `_DYNAMIC_TLO`, `_MACRO`, `_NO_MOTION_MODE`, `_ORIGIN_CHANGE`, `_PROBE`, `_RELATIVE_FROM_UNKNOWN`, `_RELATIVE_START`, `_RETURN_INTERMEDIATE`, `_UNINTERPRETED`, `_UNITS_LATE`, `_WCS_CHANGE`, `_SYNTAX`, `_TLO_CANCEL` | Ce fichier ne peut pas être vérifié en {axe}. Vérifiez à la main qu'il tient. (la ligne en cause est dans « Détails du contrôle ») | Détails |
| `derogation-impossible` | `ETOUCH_START_NO_OVERRIDE` | Sur cette machine, on ne peut pas démarrer malgré un dépassement. | Détails |
| `decalage-actif` | `ETOUCH_PROBE_G92`, `ETOUCH_PROBE_TLO`, `ETOUCH_ORIGIN_OFFSETS` | Un décalage est actif dans la machine : ce geste n'est pas possible. | Détails |
| `plaque-trop-bas` | `ETOUCH_PLATE_TRAVEL` (`search`, `max`) | La descente de {search} mm irait trop bas. Mettez {max} mm au plus. | Modifier… (volet « Plaque ») |
| `type-machine` | `ETOUCH_MACHINE_LASER_MODE_ON`, `_LASER_MODE_OFF`, `_AMBIGUOUS`, `_KIND_INVALID`, `_NOT_ASSOCIATED`, `_STORE`, `ETOUCH_LASER_NOT_LASER`, `ETOUCH_LASER_NO_PLATE_PROBE`, `_NO_SPINDLE_TEST`, `_NO_TOOL_CHANGE` | Ce geste ne convient pas au type de machine déclaré. (`_LASER_MODE_ON` : Le mode laser est actif dans la machine.) | Type de machine… |
| `cadrage` | `ETOUCH_LASER_FRAME_BOUNDS`, `_CHECK`, `_WCS` | Le cadrage n'est pas possible : {raison courte}. | Détails |
| `fonction-inactive` | `ETOUCH_MOTION_DISABLED`, `ETOUCH_LASER_FRAME_DISABLED` | Cette fonction n'est pas activée sur cette tablette. | Détails |
| `vitesse` | `ETOUCH_MOTION_STEP_SLOW`, `ETOUCH_LASER_FRAME_SLOW`, `ETOUCH_LASER_FRAME_FEED` | La vitesse de déplacement ne convient pas. | Vitesse… (volet « Vitesse de déplacement ») |
| `laser-info` | `ETOUCH_LASER_CHECK_M3`, `_M4`, `_NO_M3_M4`, `_S_ABOVE_MAX` | (information du contrôle laser, dans « Détails du contrôle ») | — |
| `broche-max` | `ETOUCH_CHECK_S_ABOVE_MAX` | Le fichier demande {s} tr/min : la broche tournera à son maximum. (information de ④) | — |
| `silencieux` | `ETOUCH_BACKLIGHT_REMOTE` | (jamais affiché) | — |

Les phrases de ces familles reprennent les propositions de `TEXTES.md` § 4.2, avec une correction : `ETOUCH_MACHINE_LASER_MODE_ON` dit « Le mode laser est actif dans la machine », pas « Le laser est allumé ». Une phrase propre à chaque code (au lieu de celle de sa famille) est écrite au lot L6.

### 9.3 Glossaire (un mot par notion)

| Notion | FR | EN | ES | Jamais hors de « Détails » |
|---|---|---|---|---|
| Étapes | Machine · Fichier · Zéro pièce · Contrôle · Usinage (laser : Gravure) · Plus | Machine · File · Work zero · Check · Machining (Engraving) · More | Máquina · Archivo · Cero pieza · Control · Mecanizado (Grabado) · Más | Menu, Préparer, Suivi, Sonde (comme écran) |
| Point de départ du fichier sur la pièce | zéro pièce ; « Zéro X ici », « Zéro XYZ ici », « X à l'origine machine » | work zero ; “Zero X here” | cero de la pieza ; «Cero X aquí» | origine de travail, repère, G54, décalage |
| Origine de la machine | origine machine ; « Prise d'origine machine… » ; « Origine machine pas prise » | machine home ; “Home the machine…” | origen de la máquina ; «Buscar origen…» (court : il doit tenir dans un remède de 300 px) | référencer, référencée, $H |
| Ce que la machine exécute | fichier (le choisir, le charger) ; usinage (le lancer) | file ; machining | archivo ; mecanizado | programme, travail, parcours |
| Qui commande | la main ; bandeau « La main : ici / libre / autre » ; « Prendre la main » | control ; “Control: here / free / other” ; “Take control” | el control ; «Control: aquí / libre / otro» ; «Tomar el control» | pilote, pilotage, bail |
| Où la machine peut aller | course ; « tient dans la machine » ; « dépasse de N mm » ; « descend N mm trop bas » | travel ; “fits the machine” ; “exceeds by N mm” ; “goes N mm too low” | recorrido ; «cabe en la máquina» ; «sobrepasa N mm» ; «baja N mm de más» | hors course, limite logicielle, mm machine |
| La carte, Grbl, le contrôleur | la machine | the machine | la máquina | carte, contrôleur, Grbl |
| Alarme et sortie d'alarme | alarme ; « Remise en route » ; « Déverrouiller » | alarm ; “Recover” ; “Unlock” | alarma ; «Recuperar» ; «Desbloquear» | $X, reset |
| Arrêt et pause | « Pause » ; « Arrêter » ; « Arrêter l'usinage » | Pause ; Stop ; “Stop machining” | Pausa ; Detener ; «Detener el mecanizado» | interrompre |
| Reprendre | « Reprendre… » ; « Reprendre à la ligne N… » | Resume… ; “Resume from line N…” | Reanudar… ; «Reanudar desde la línea N…» | relancer, redémarrer |
| Engager une commande | « Lancer … », « Démarrer … », « Poser … » (le verbe de l'effet) | Start … ; Set … | Iniciar … ; Fijar … | Confirmer, OK, acquitter (« Valider » reste le bouton du pavé) |
| Ce qui coupe, ce qui le fait tourner | fraise ; broche (laser : puissance, à la place de « broche » et de « consigne S ») | bit ; spindle (laser: power) | fresa ; husillo (láser: potencia) | outil (sauf « changement d'outil »), tête |
| Vitesses | vitesse ; rapides | speed ; rapids | velocidad ; rápidos | avance, feed |
| Palpage | sonde ; palper ; bloc ; plaque ; « Palper au bloc XYZ… » ; « Zéro Z à la plaque… » ; « Ma sonde… » ; « Tester la sonde » ; voyant « Libre / Touche » | probe ; block ; plate ; “Probe block XYZ…” ; “Z zero on plate…” ; “My probe…” ; “Test the probe” ; Free / Touching | sonda ; bloque ; placa ; «Palpar bloque XYZ…» ; «Cero Z con placa…» ; «Mi sonda…» ; «Probar la sonda» ; Libre / Toca | profil de sonde, décalage de face, entrée sonde, Pn |
| Position | position pièce ; position machine | work position ; machine position | posición pieza ; posición máquina | coordonnées, MPos, WPos |
| Fraîcheur de l'état | information à jour ; information ancienne | up to date ; old | al día ; antigua | rapport frais, périmé |
| Reçu par la machine | « ligne N » (avancement) | line N | línea N | acquitté |
| Suite et manque | « Suite : X → » ; « Il manque : … » | “Next: X →” ; “Missing: …” | «Siguiente: X →» ; «Falta: …» | — |
| Rare | Journal ; Réglages ; Mise en service ; Guide ; Macros ; Détails | Log ; Settings ; Commissioning ; Guide ; Macros ; Details | Registro ; Ajustes ; Puesta en servicio ; Guía ; Macros ; Detalles | historique, paramètres, configuration |
| États du bandeau | Hors ligne ; Non connectée ; Alarme N ; Repos ; Prise d'origine ; Déplacement ; Palpage ; Usinage ; Pause ; Porte ouverte ; Information ancienne ; État perdu | Offline ; Not connected ; Alarm N ; Idle ; Homing ; Moving ; Probing ; Machining ; Paused ; Door open ; Old information ; State lost | Sin conexión ; No conectada ; Alarma N ; Reposo ; Buscando origen ; Movimiento ; Palpado ; Mecanizando ; Pausa ; Puerta abierta ; Información antigua ; Estado perdido | Idle, Run, Hold, Jog, Home, Door |

« En cours » devient « Usinage » dans le bandeau ; « Rapport ancien » devient « Information ancienne ». « Prête » ne s'emploie que pour la machine (« Machine prête ») : une machine prête n'est pas un fichier contrôlé.

### 9.4 Règles de rédaction

1. Une phrase, une idée, 90 caractères au plus sur le chemin de l'opérateur. Pas de paragraphe hors du Guide.
2. Impératif et vouvoiement : « Relevez la pièce. », « Touchez le bloc avec la fraise. ».
3. Aucun nom de réglage (`$22`), de mot G-code (`G54`, `M5`), d'état Grbl (`Idle`), de fichier ou de module hors de « Détails ». Un test le vérifie (`test-textes-regles.cjs`).
4. Un bouton dit ce qu'il fait ; « … » s'il ouvre un dialogue ; jamais « Confirmer », « OK », « Continuer ».
5. Un mot par notion (§ 9.3), le même sur le bouton, dans la phrase et dans le refus.
6. Ce qui est normal ne s'excuse pas et ne s'explique pas : pas de « Le chargement ne démarre pas le travail. ». Ce qui est anormal dit la cause, puis le geste.
7. Un état est un mot avec son icône ; la couleur ne porte jamais seule le sens.
8. Les réserves de développeur (« pas une simulation de collisions », « Acquitté = accepté… », « Aucune valeur réelle inventée ») vont dans « Détails » ou dans le Guide, en une phrase d'atelier.
9. Toute chaîne passe par l'i18n avec sa ligne FR / EN / ES dans le même lot ; les phrases du serveur passent par les tables de la page.
10. L'inventaire `audit/textes-inventaire.csv` sert de liste de contrôle : chaque texte marqué long, technique ou réserve est réécrit, déplacé dans « Détails » ou supprimé, et le lot le dit.

---

## 10. Le devenir de l'existant

### 10.1 Écrans

| Aujourd'hui | Devient |
|---|---|
| Menu (`screen-menu`) | **supprimé**. Les tuiles deviennent celles de Plus ; la barre de connexion va dans ① ; « Reprendre où j'en étais » est remplacé par l'ouverture sur l'étape suivante. |
| Machine (`screen-machine`) | ① Machine, refait : liste, encart, connexion. |
| Fichiers (`screen-files`) | ② Fichier. |
| Préparer (`screen-jog`) | ③ Zéro pièce ; la vue de comparaison v2 et son résumé « 1 · 2 · 3 » disparaissent (le placement est dans ④). |
| Sonde (`screen-probe`) | **fusionné** dans la carte Sonde de ③. |
| Profils de sonde (`screen-probe-profile`) | volet « Ma sonde ». |
| Diagnostic de l'entrée sonde (`screen-probe-contact`) | volet « Tester la sonde ». |
| Résultats du palpage (`screen-probe-report`) | bilan dans la carte, détail dans « Détails » et dans le Journal. |
| Sauvegarde des profils (`screen-probe-transfer`) | volet « Sauvegarde des sondes ». |
| Préparation du palpage (`screen-probe-preparation`) | **supprimé** de la page réelle (inaccessible aujourd'hui). |
| Suivi (`screen-home`) | ⑤ Usinage ; le départ et le contrôle vont dans ④, la plaque dans ③. |
| — | ④ Contrôle (`screen-check`), nouveau. |
| Limites (`screen-limits`) | volet « Détails de la machine ». |
| Journal, Réglages, Mise en service, Guide | sous Plus, contenu gardé. |

La page de simulation (`simulation.html`, banc non déployé) charge les mêmes modules : elle reçoit le même cadre (fil, barre d'étape, ②, ④, ⑤, Plus). Ses contenus propres (machine fictive, déplacement fictif, banc de palpage `probe-ui.js` et ses écrans) restent tels quels dans ① et ③, avec le bouton [← Zéro pièce] dans l'en-tête des écrans du banc. Son dialogue garde la case, comme celui de la page réelle.

### 10.2 Volets et dialogues

| Aujourd'hui | Devient |
|---|---|
| `ks-file-info` Détails du fichier et de l'aperçu | gardé (« Détails du fichier ») ; perd le port, reçoit les dimensions |
| `ks-dimensions` Dimensions XY | **supprimé** (sur l'écran et dans « Détails du fichier ») |
| `ks-upload` Ajouter un fichier | gardé |
| `ks-preparation` Préparer le travail | **supprimé** : le fil est la préparation ; ses deux cases n'engageaient rien |
| `ks-origin-help-sheet` Comprendre l'origine | **supprimé** ; repris dans le Guide |
| `ks-jog-settings-sheet` Vitesse de déplacement | gardé |
| `ks-macros` Macros | gardé, ouvert depuis Plus |
| `ks-machine-help-sheet` Fonctions de la machine | **supprimé** ; repris dans le Guide |
| `ks-history-export-sheet` Exporter le journal | gardé |
| `perf-v2-overrides-sheet` Broche et rapides | **supprimé** : les rangées sont sur ⑤ |
| `perf-v2-time-sheet` Détail du temps | gardé (v2) |
| `job-dialog` | gardé, case comprise ; textes par opération (§ 5.2, § 6.3) |
| `pilot-dialog` | « La main » (§ 5.3) |
| `real-motion-ticket` | « Poser le zéro » (§ 5.4) |
| pavé, clavier, fiche du projet, aperçus agrandis, veille, verrou | inchangés |
| — | nouveaux volets : Détails, Détails de la machine, Détails du contrôle, Ma sonde, Tester la sonde, Plaque, Autres zéros, Sauvegarde des sondes, Reprendre à une ligne |

### 10.3 Fonctions de l'opérateur (liste d'`ERGONOMIE.md` § 1.4)

| Fonction | Aujourd'hui | Spec : un seul endroit |
|---|---|---|
| Connecter | Menu | ① |
| Choisir la machine (plusieurs ports) | volet de Fichiers | volet « Détails de la machine » |
| Prise d'origine | Machine, assistant | ① (et le remède `prise-origine`, même dialogue) ; assistant |
| Déverrouiller | bandeau, Machine, assistant | ① ; assistant |
| Relire les réglages | Machine, Préparer, assistant (masqué) | ① ligne `reglages`, toujours visible (et le remède `relire`) ; assistant |
| Mise en service | Machine, Réglages, ouverture automatique | Plus ; (Réglages garde son lien) |
| Choisir et charger un fichier | Fichiers, Suivi, volet | ② ; recharger = remède de ④ |
| Préparation guidée | volet depuis Fichiers et Préparer | le fil |
| Contrôle des courses | dialogue de départ, volet, carte v2, `#op-card` | ④ (une source) ; une phrase dans ② |
| Limites de la machine | écran Limites, carte v2 | volet « Détails de la machine » |
| Positions | Suivi, Préparer, Machine | position pièce : ③ et ⑤ ; position machine : « Détails » |
| Se déplacer, pas, vitesse | Préparer (cachés en v2) | ③ |
| Zéros à la main | Préparer (éclatés en v2) | ③ |
| Zéro d'un axe à l'origine machine | n'existe pas | ③ › volet « Autres zéros » |
| Zéro Z à la plaque | Suivi | ③ (et le même bouton dans l'encart de ⑤ en pause de changement d'outil et en fin d'usinage, même dialogue) |
| Vérifier le zéro pièce après une prise d'origine | n'existe pas (le serveur ne le faisait pas) | automatique (serveur, D2) ; [Vérifier à nouveau] sur la ligne `zero` de ① et comme remède sur ③ et ④ |
| Palpage au bloc | Préparer › Sonde | ③ |
| Sonde : mesures | Sonde › Profils (3 onglets) | ③ › volet « Ma sonde » |
| Sonde : test et diagnostic | Sonde › Diagnostic ; assistant, étape 5 | ③ › volet « Tester la sonde » (le même depuis l'assistant) |
| Démarrer | Suivi | ④ |
| Pause, Reprendre, Arrêter | bandeau, Suivi | bandeau, ⑤ |
| Corrections | Suivi (v2 : un volet) | ⑤ (rapides aussi sur ④) |
| Arrêter la broche | Suivi, selon le cas | ⑤, encart |
| Reprise à une ligne | Suivi, masqué sans sélection | ⑤ › volet (ouvert aussi par l'action de ① après un incident) |
| Cadrage laser | Suivi | ④ |
| La main | bandeau | bandeau |
| Verrouiller l'écran | bandeau | bandeau |
| Macros | Préparer | Plus |
| Journal, Guide, Réglages | rail, Réglages | Plus |

### 10.4 Les 65 commandes machine

**Règle.** Une commande garde ce qu'elle envoie (action, opération, paramètres) et ses gardes, y compris la case du dialogue. Seuls changent sa place et son libellé. Chaque ligne de `audit/commandes-machine.json` a une ligne dans `examples/cncjs-touch/commandes-migration.json` (à côté des tests, pour que le lot qui écrit la page puisse le commiter) :

`{id, sort, ecran, selecteur, etat, requete, refus, lot}`
- `sort` : `inchangé`, `déplacé`, `fusionné`, `supprimé`, `automatique` ou `nouveau` ;
- `etat` : l'état du banc dans lequel la cible existe (écran, volet ou dialogue ouvert, étape de l'assistant) ;
- `requete` : ce que le toucher doit envoyer dans cet état, identique à l'ancienne ;
- `refus` : un état où le serveur dit non (`can…` faux, ou cause globale), dans lequel le toucher ne doit rien envoyer ;
- une ligne `supprimé` nomme ce qui la remplace (`remplace`) ; une ligne `automatique` nomme son déclencheur ; elles n'ont pas de sélecteur.

Le test `test-commandes-migration.cjs` prouve, pour chaque ligne dont le lot est fait : la cible existe dans son `etat` ; un toucher y envoie `requete` ; dans l'état `refus`, rien ne part ; pour les arrêts (EX-03, EX-05, DE-04), l'envoi part aussi sous une cause globale (§ 6.4).

| ID | Nouvelle place | Sort |
|---|---|---|
| CX-01 | ① barre d'étape, [Connecter la CNC] (`#step-machine-main`) | déplacé |
| CX-02, CX-03 | ① carte de connexion `#ks-connect` (ports, [Ouvrir]) | déplacé |
| CX-04, CX-05 | flux et lecture de secours | automatique |
| CX-06 | — (« ↻ Actualiser », code mort de `app.js:151-160`, retiré en L1 ; C-66) | supprimé |
| PI-01 | bandeau `#t-pilot`, « La main : … » | inchangé (renommé) |
| PI-02 | dialogue « La main » : `#pilot-reason-a`, `#pilot-reason-b` (prise directe), `#pilot-takeover` (autre motif) ; une demande à la fois | fusionné |
| PI-03 | attribution à la première commande | automatique |
| OR-01, OR-02 | ① `#machine-unlock`, « Déverrouiller sans prise d'origine… » | fusionné (le bandeau le perd) |
| OR-03, OR-05, OR-08 | Mise en service (cases gardées, dont « main sur l'arrêt ») | inchangé |
| OR-04 | ① action principale ; remède `prise-origine` de tout écran (même dialogue) | déplacé |
| OR-06, OR-07 | ① ligne `reglages`, `#ks-machine-reread` ; remède `relire` ; garde `canReadSettings` (lot P1 du plan) | fusionné |
| DE-01 à DE-05 | ③ colonne « Déplacer », mêmes sélecteurs | inchangé (toujours visibles ; un pas interdit est rayé au lieu d'être masqué) |
| DE-06 | chiens de garde du serveur | automatique |
| DE-07 | ③ rangées des pas ; `#ks-jog-settings` (le bouton v2 `#pv2-tool-speed` disparaît) | fusionné |
| DE-08 | ④ `#check-frame-start` (laser) | déplacé |
| ZE-01, ZE-02 | ③ `#jog-zero-x`, `-y`, `-z`, `#jog-zero-xyz` | inchangé (libellé « … ici ») |
| ZE-03 | — (`#pv2-tool-zero`) | fusionné avec ZE-02 |
| ZE-04 | dialogue « Poser le zéro », mêmes identifiants | inchangé (libellés) |
| ZE-05 | — (`#pv2-set-xy`, `#pv2-jog-open`, `#pv2-jog-close` : navigation) | supprimé |
| PA-01 | ③ `#probe-plate-start` ; champs dans le volet « Plaque » ; même commande depuis l'encart de ⑤ (pause de changement d'outil, fin d'usinage) | déplacé |
| PA-02 | — (`#probe-zero-z` : navigation) | supprimé |
| PA-03 | ③ `#probe-start`, `[data-probe-operation]`, `#probe-diameter` | déplacé |
| PA-04 | ③ `#probe-stop`, à la place de `#probe-start` pendant le palpage ; appelle `cncJobControls.stop()` (plus de relais vers `#job-stop`) | déplacé |
| PA-05 | volets « Ma sonde », « Tester la sonde », « Sauvegarde des sondes » ; bilan dans la carte | déplacé |
| PA-06 | arrêt automatique du palpage | automatique |
| FI-01 | ② action principale « Charger ce fichier » (`#step-files-main`) | déplacé |
| FI-02 | ④ remède [Recharger ce fichier] : recharge le fichier de la machine (`machine.name`), nommé dans la phrase ; aujourd'hui « Recharger le fichier » de Suivi vise la sélection quand elle est la même | déplacé |
| FI-03 | — (`#ks-prep-load`) | supprimé avec son volet (remplacé par FI-01) |
| FI-04 | volet « Détails de la machine », `#job-port` | déplacé |
| FI-05 | ② volets « Ajouter un fichier » et « Détails du fichier » ; fichier d'essai de la mise en service | inchangé |
| EX-01 | `#job-dialog`, `#job-check`, `#job-confirm`, `#job-dismiss` | inchangé (case gardée ; libellés, armement) |
| EX-02 | ④ `#step-check-main`, « Démarrer l'usinage… » | déplacé |
| EX-03, EX-04 | bandeau `#t-pause`, `#t-resume` ; ⑤ `#step-home-main` | déplacé |
| EX-05 | bandeau `#t-stop` ; ⑤ `#home-job-stop` ; aperçu agrandi `#preview-job-stop` (appel direct) | inchangé |
| EX-06 | ⑤ encart, `#home-pause-m5` | inchangé (toujours présent en pause ; suit `canSpindleStop`) |
| EX-07 | Plus › Macros | déplacé |
| CO-01, CO-02 | ⑤ rangées, v1 = v2 | inchangé |
| CO-03 | ⑤ rangée ; ④ `#check-rapids` | inchangé + second accès |
| RL-01 | ⑤ `#home-resume-line` et action principale après un arrêt ; ① action de la ligne `reprise` | déplacé |
| RL-02 | à l'ouverture du volet et à chaque changement de ligne | automatique (le bouton disparaît) |
| RL-03 | volet « Reprendre à une ligne », `#home-resume-load` ; charge le dernier plan accepté de la ligne affichée | déplacé |
| RM-01 à RM-05 | Réglages, Mise en service | inchangé |
| SY-01 à SY-06 | Réglages, veille, cadenas | inchangé |

**Commandes nouvelles** (contrat et gardes du chantier A ; elles entrent dans le même fichier avec `sort: nouveau`)

| ID | Commande | Place | Lot |
|---|---|---|---|
| N-01 | `verifyOffset` (D2) | remède `verifier-zero` : ligne `zero` de ①, barre de ③ et de ④ | L1 (remède), L2, L4 |
| N-02 | `prepare {operation: 'start', override: 'travel'}` (D1) | « Détails du contrôle », `#check-override-open` | L4 |
| N-03 | `prepare` de `set-origin` avec `at: 'machine'` (D4) | volet « Autres zéros » | L3a |
| N-04 | `check` sur le fichier choisi (existante côté serveur, libre, rien vers la machine) | ② au choix d'un fichier ; [Réessayer] | L4 |

**Cas particuliers, à inscrire dans `SURETE.md`**
1. **Aucun garde de la page n'est retiré** : la case du dialogue (EX-01) reste pour toutes ses opérations.
2. **Les relais** vers les boutons cachés `#job-load`, `#job-start`, `#job-pause`, `#job-resume`, `#job-stop` disparaissent : chaque bouton visible appelle la fonction (`cncJobControls.load`, `.start`, `.pause`, `.resume`, `.stop`). **Chaque fonction reprend la garde que portait l'état `disabled` de son bouton caché** (`job-controls.js:368-373`) : `load` n'envoie rien si une demande est en cours, hors ligne, sans fichier choisi ou si `canLoad` est faux ; `start` et `resume` de même avec `canStart` et `canResume` ; `pause` et `stop` partent même pendant une autre demande, et en état perdu ils suivent `halt.canPause` et `halt.canStop`. Le gel de 600 ms des relais est gardé. Relais concernés, tous remplacés : `status-strip.js`, `job-dashboard.js`, `probe-ui.js:252` (`#probe-stop`), `preview-viewer.js:87` (`#preview-job-stop`), `job-preparation.js:193` ; `real-motion.js:485` cesse de citer `#job-stop`. Le soupçon Q-09 (clic relayé vers un bouton inerte sur Chromium 106) tombe. `pause()` et `stop()` existent déjà après le lot P3 du plan.
3. **PA-03, le repère** : le choix `#probe-wcs` disparaît ; la page envoie le zéro pièce actif, ce qu'elle proposait déjà par défaut. Le serveur garde son refus `ETOUCH_PROBE_WCS`.
4. **RL-02** : même requête, envoyée sans toucher (elle est libre et ne charge rien).
5. **FI-01** : même requête ; la page ne change plus d'écran après. **FI-02** : même requête de chargement, mais sa cible est dite : le fichier de la machine.
6. **PI-02** : même requête `takeover` ; le motif est celui du bouton touché ; la garde « une demande à la fois » est gardée.
7. **DE-02, DE-07** : un pas interdit est rayé avec sa raison au lieu d'être masqué. Affichage seul.
8. **EX-03 pendant un palpage au bloc** : même requête `pause` ; le libellé dit « Arrêter le palpage », ce que fait le serveur.

**Accès qui s'allongent d'un toucher** (rares ; aucun parcours de référence) : Déverrouiller depuis un autre écran que ① (le bandeau ne le porte plus) ; Macros (par Plus au lieu de Préparer) ; Journal et Réglages (par Plus au lieu du rail). Les confirmations de Réglages, de la mise en service et des macros (RM-01 à RM-05, SY-01 à SY-06, EX-07) ne changent pas : mêmes dialogues, mêmes cases, rejoués par `test-commandes-migration.cjs`.

### 10.5 Les petites fonctions de la décision D4

| Fonction | Place | Ce que fait la page | Ce qui vient du chantier A |
|---|---|---|---|
| Zéro d'un axe à l'origine machine | ③ › [Autres zéros…] › volet › « Poser le zéro » | trois boutons, le dialogue à deux touchers | la commande `set-origin` avec `at: 'machine'`, ses gardes, sa preuve (S5) |
| Valeurs de départ et assistant de la sonde | ③ › [Ma sonde…], ou [Palper au bloc …] quand il manque une mesure | assistant en deux pages, signes déduits du coin | les valeurs de départ dans `probe-model.js` (P1) ; les bornes du serveur ne changent pas |
| Relecture automatique de la version et des réglages | ① ligne `reglages` : « Lecture des réglages… », puis « Réglages lus » ; [Relire] reste | affichage ; aucun envoi de la page | l'envoi au repos et en alarme, `canReadSettings` (S5, P1) |
| Diagnostic guidé de la sonde | ③ › [Tester] ou [Pourquoi ?] › volet ; aussi depuis la mise en service | le volet du § 5.6, piloté par le signal reçu | les champs `probeInput.test.stage`, `stuck`, `contactMs` (S5) |

---

## 11. Les lots de réalisation

En série, un seul agent écrit à la fois. Découpage du § 5.4 du prompt, avec L3 coupé en deux. Chemins relatifs à `examples/cncjs-touch/`.

**Condition d'entrée.** Les lots S1 à S6 et P1 à P3 de `PLAN-CORRECTIONS.md` sont commités et verts (§ 0.2). La page que L1 trouve a donc déjà : les refus codés de D1 et D2, [Relire] qui suit `canReadSettings`, `pause()` et `stop()` en appels directs, la reprise qui vise le fichier arrêté, la règle du rendu v2 du lot P2.

**Règles communes à chaque lot**
- Fin de lot : `node examples/cncjs-touch/verify-project.cjs` à N/N ; `npx jest src/server/services/touch src/server/services/cncengine grbl-simulator` vert ; harnais `--strict` à « 0 violation(s), 0 excepted » et « every step passed » ; aucune entrée nouvelle dans `layout-exceptions.json`.
- v1 Éco intact : les variantes `v1-768-*-laser` de l'étape `screens` passent, et l'étape `v2` prouve toujours « aucune requête v2 en Éco ».
- **Les listes de tests ci-dessous sont un minimum.** Avant d'éditer, le réalisateur cherche chaque identifiant de la ligne « Identifiants et API migrés » de son lot, en mot entier, dans tous les `test-*.cjs`, dans `browser-run.cjs`, `browser-strip.cjs`, `measure-refonte.cjs` et `job-controls-fixture.cjs`. Tout fichier qui en cite un est migré dans le lot, nommé ici ou non. Un test qui ne fabrique l'identifiant que dans son faux DOM est mis à jour aussi : il ne doit pas rester vert sur un élément que la page n'a plus.
- Un test créé entre dans la liste de `verify-project.cjs` ; un test supprimé en sort, et le rapport du lot le nomme avec les assertions qu'il portait.
- `test-bundle.cjs` et `build-bundle.cjs` suivent la liste des scripts d'`index.html`.
- Toute chaîne nouvelle a sa ligne FR / EN / ES dans le lot.
- Un identifiant ou une API publique qui change est migré avec ses tests dans le lot ; la ligne correspondante de `commandes-migration.json` passe à « fait ».
- `PERFORMANCE-UI-SPEC.md`, `TESTING.md` et `BUGHUNT-MAP.md` sont mis à jour dans le lot qui change le comportement qu'ils décrivent (rail et Menu : L1 ; Préparer : L3a ; Suivi : L5) ; L6 fait la relecture d'ensemble.
- L'étape `parcours` du harnais (créée en L1) rejoue les parcours du lot et échoue si un compte dépasse celui du § 7.
- Aucun état visuel par `:has()` (§ 0.1).

### L1 — Socle

**But.** Poser le fil, la barre d'étape, les composants communs, le banc des parcours et le cache `v2v`, sur les écrans actuels. Rien n'est encore refait à l'intérieur des écrans.

**Écrans.** Le rail à six entrées ; l'en-tête et la barre d'étape sur `screen-machine`, `screen-files`, `screen-jog`, `screen-home` ; `screen-check` dans sa forme minimale (le bloc de verdict actuel `CNCProgramCheckView.show` et l'action « Démarrer l'usinage… », qui appelle `cncJobControls.start()` avec la garde de l'ancien bouton caché) ; `screen-more` à la place de `screen-menu`, avec la tuile « Macros » ; [← Plus] sur Journal, Réglages, Mise en service, Guide ; [← Zéro pièce] sur les écrans de Sonde et [← Machine] sur Limites, en attendant L2 et L3b ; la carte de connexion déplacée dans ① ; le bandeau du § 2.2.

**Ce qui reste en place jusqu'à son lot.** `cncShell.preparationActions` et son conteneur restent (ils portent l'entrée « Sonde » jusqu'en L3b, « Aide aux repères » jusqu'en L3a et le bouton de `job-preparation.js` jusqu'en L4) ; seul le bouton « Macros… » le quitte pour la tuile de Plus. Les boutons cachés `#job-load`, `#job-start`, `#job-pause`, `#job-resume`, `#job-stop` restent jusqu'en L4 et L5 pour les écrans pas encore refaits.

**Fichiers à créer.** `touch/seance.js`, `touch/refus.js`, `touch/i18n-messages-refus.js` ; `parcours-server.cjs` (banc des parcours, ci-dessous) ; `test-seance.cjs`, `test-fil.cjs`, `test-refus.cjs`, `test-refus-table.cjs`, `test-confirmation-classes.cjs`, `test-direct-calls.cjs`, `test-cache-version.cjs`, `test-commandes-migration.cjs`, `test-more-screen.cjs` ; `commandes-migration.json` (à partir du § 10.4).

**Fichiers à modifier.** `touch/index.html`, `touch/simulation.html` (scripts, suffixes) ; `touch/touch-shell.js`, `touch/touch-shell.css` ; `touch/ui-2027.css`, `touch/design-tokens.css`, `touch/responsive.css` ; `touch/status-strip.js` ; `touch/job-controls.js` (textes du dialogue par opération, bouton nommé, armement après 600 ms, place de la carte, refus par `cncRefus`, `verifyOffset()`, les appels directs `load()`, `start()`, `resume()` avec leurs gardes, § 10.4 cas 2) ; `touch/connect-cnc.js` (hôte `screen-machine`, `search()`) ; `touch/macros.js` (bouton sur la tuile de Plus ; tuile rayée « Aucune macro dans CNCjs » sans macro) ; `touch/commissioning.js` (plus d'ouverture automatique ; la fin et l'abandon de l'assistant reviennent sur ① au lieu de `shell.go('menu')`, lignes 166 et 170) ; `touch/app.js` (retrait de « ↻ Actualiser », lignes 151-160) ; `touch/tablet-profile.js` (`ADVANCED_VERSION` ; règle du § 3.1, vérifiée) ; `touch/display-settings.js` (ligne d'état du rendu) ; `touch/i18n-messages.js` ; les adresses internes des travailleurs (`touch/library-preview.js`, `touch/library-preview-worker.js`, `touch/laser-view.js`, `touch/preview-inspect.js`, `touch/preview-3d.js`, `touch/preview-3d-worker.js` : les suffixes `view3` et `worker13` passent aussi à la valeur unique) ; `browser-run.cjs`, `browser-strip.cjs`, `preview-server.cjs` ; `measure-refonte.cjs` (l'écran caché de ses mesures devient `more` au lieu de `menu`, lignes 279, 293, 372, 378, 393 ; le suffixe du cache est lu dans `tablet-profile.js` au lieu de `v2u` en dur, ligne 634 ; le rapport dira que « Menu avant » est comparé à « Plus après ») ; `verify-project.cjs`.

**Le banc des parcours** (`parcours-server.cjs`). `preview-server.cjs` ne peut pas jouer un parcours : son faux contrôleur refuse toute commande. Le nouveau banc sert la page comme lui, mais branche le vrai service (`createService`) sur le simulateur au profil « LUNYEE » (`grbl-simulator`, lot S1) par le pont `src/server/services/touch/__tests__/support/sim-bridge.js`, avec une prise d'origine courte (`homingMs`). Le faux Socket.IO de la page (`connection-fixture.js`) garde `list` et `open` ; `open` appelle `POST /parcours/open`, qui publie le contrôleur au service. `POST /parcours/sim` pilote les entrées physiques du simulateur : contact de la sonde (libre, touche, permanent), fin de course (alarme et redémarrage). Tout tourne en boucle locale, rien n'est écrit hors du dossier de sortie.

**Identifiants et API migrés.** `screen-menu` → `screen-more` ; `button.ks-nav[data-ks-screen]` : `menu`, `history`, `settings`, `back` sortent du rail, `check` et `more` y entrent ; attributs `data-seance-step` et `data-seance-state` sur les étapes ; `#ks-resume` supprimé ; `#t-unlock` supprimé, `#t-recover` créé ; `cncShell.details` ajouté ; `cncJobControls.load`, `.start`, `.resume`, `.verifyOffset` ajoutés ; `cncConnectCnc.search` ajouté ; clé `cncjs-touch-last-screen` abandonnée ; valeur de cache `v2u` → `v2v`. Tests migrés : `test-menu-screen.cjs` (supprimé, remplacé par `test-more-screen.cjs` et `test-fil.cjs`), `test-transverse-screen.cjs`, `test-kept-screens.cjs`, `test-hidden-views.cjs`, `test-status-strip.cjs`, `test-strip-continuity.cjs`, `test-strip-messages.cjs`, `test-strip-guard.cjs`, `test-job-dialog.cjs`, `test-job-dialog-strip.cjs`, `test-connect-cnc.cjs`, `test-commissioning.cjs`, `test-macros.cjs`, `test-control-attribution.cjs`, `test-compact-layout.cjs`, `test-real-interface.cjs`, `test-simulation-ui.cjs`, `test-v2-gate.cjs`, `test-v2-mounts.cjs`, `test-v2-i18n.cjs`, `test-v2-observation-lifecycle.cjs`, `test-preview-worker.cjs`, `test-display-settings.cjs`.

**Tests à écrire.**
- `test-seance.cjs` : un cas par ligne des tableaux du § 6.4 (13 causes globales, causes du zéro pièce, causes propres, cinq étapes × leurs états, étape suivante) ; aucun cas où l'action est active alors que le `can…` du serveur est faux ; sous chacune des six premières causes, le remède de la cause, Pause et Arrêter restent actifs ; `workOffset` absent ne donne jamais « fait » à ③.
- `test-fil.cjs` : le rail, ses marques, la page d'arrivée ; deux états identiques de suite ne produisent aucune mutation ; un écran caché n'est pas réécrit.
- `test-refus-table.cjs` : tout code `ETOUCH_*` trouvé dans `src/server/services/touch/*.js`, `src/server/api/api.touch.js` et `window.CNCTouchCodes`, plus `ECONTROL`, a une famille écrite en toutes lettres, une phrase FR / EN / ES et un remède de la liste fermée. C'est le test demandé au § 9 du prompt.
- `test-refus.cjs` : un refus s'écrit là où l'on a touché (barre, bande d'un volet, bandeau, macro) ; il s'efface quand sa cause change ; un refus reçu avec `can…` vrai laisse le bouton actif et la phrase écrite.
- `test-confirmation-classes.cjs` : pour chaque opération du § 5.2, la case est exigée, le bouton porte le nom de l'effet, un toucher sur `#job-confirm` avant 600 ms ou sans la case n'envoie rien, le bouton ne recouvre pas son bouton d'origine ; un ticket sans dérogation avec un axe `outside` n'active jamais le bouton.
- `test-direct-calls.cjs` : chaque appel direct (`load`, `start`, `resume`, `pause`, `stop`) n'envoie rien quand la garde de son ancien bouton caché le refusait (demande en cours, hors ligne, `can…` faux) ; en état perdu, `pause()` et `stop()` partent vers `halt`.
- `test-cache-version.cjs` : toutes les valeurs `?v=` de `touch/index.html`, de `touch/simulation.html` et des scripts sont **égales entre elles** et à `ADVANCED_VERSION` (le test ne fige pas la valeur). Elle vaut `v2v` à la fin de L1 ; elle change à chaque version installée sur une tablette.
- `test-v2-gate.cjs`, cas ajoutés : Alarme → prise d'origine → Repos ouvre la v2 ; Alarme → déverrouillage → Repos aussi ; le cas `late` (usinage vu d'abord) reste fermé.
- `test-status-strip.cjs`, cas ajoutés : pendant un palpage au bloc, l'emplacement 1 dit « Arrêter le palpage » et envoie la même requête que Pause ; en espagnol, texte agrandi, pendant un usinage, le nom du fichier garde 120 px.

**Harnais.** Toutes les étapes changent de noms d'écran ; l'étape `e2e` passe par ② (charger), ④ (démarrer), ⑤ ; étape nouvelle `parcours` (`--only parcours`) : page réelle sur `parcours-server.cjs`, 1366 × 911, compte des touchers ; elle rejoue P9 en L1.

**Tests de preuve à convertir** (`CONSTATS.md`). `test-bughunt-A2-5.cjs`, parties a et b : sur l'appareil qui n'a pas la main, les commandes sont rayées avec la cause `main-ailleurs` et le remède [Prendre la main] (fin en L2 pour ①). `test-bughunt-A2-4.cjs`, partie a : un refus répété ne laisse jamais l'écran identique sans phrase (composant du § 6.1 ; fin en L3b pour la carte Sonde). `test-bughunt-V3-2.cjs` (piste C3).

**Optimisation.** C7 (une valeur de cache), C3 (plus de demande d'image à chaque paquet une fois la v2 posée).

**Critère de fin.** Les règles communes ; `--only parcours` : P9 = 2 ; `test-refus-table.cjs` couvre 100 % des codes ; plus aucune occurrence de `screen-menu` dans `touch/` ; la page s'ouvre sur ① puis saute une fois à l'étape suivante (test) ; toutes les fonctions d'aujourd'hui restent atteignables : chaque ligne de `commandes-migration.json` qui n'est ni supprimée ni automatique a une cible atteignable dans son état de banc, Macros et l'entrée Sonde comprises ; la mise en service finit sur ① ; le bandeau tient en espagnol, texte agrandi, pendant un usinage.

### L2 — Machine prête

**But.** ① définitif : liste, encart, connexion, prise d'origine depuis l'alarme, relecture visible, zéro pièce vérifié, la main, remise en route.

**Écrans.** ① (§ 4.1) ; dialogue « La main » (§ 5.3) ; volet « Détails de la machine » (§ 5.9) ; `screen-limits` supprimé.

**Fichiers.** Modifier : `touch/index.html` (section `screen-machine`), `touch/commissioning.js` (la partie Machine : la liste remplace `.ks-machine-commands` ; les tests de réglages inconnus passent dans `seance.js`), `touch/connect-cnc.js`, `touch/grbl-help.js` (titres sans nom de réglage ; plus de « Reset au PC » ; fonction `incident(machine)` pour l'encart, à partir de `lastAlarm` et `referenceLost`), `touch/machine-limits.js` (hôte : le volet ; texte « …puis faites la prise d'origine dans Machine. »), `touch/touch-shell.js` (retrait du volet « Fonctions de la machine » et des liens de Machine ; l'emplacement v2 `machine` créé dans le volet, rendu seulement volet ouvert), `touch/job-controls.js` (dialogue « La main », `#job-port`), `touch/status-strip.js`, `touch/seance.js`, `touch/commissioning.css`, `touch/ui-2027.css`, `touch/i18n-messages.js`, `touch/i18n-messages-machine.js` ; `browser-run.cjs` (les deux recherches de `#v2m-condition` sur l'écran Machine, lignes 1381 et 1763, ouvrent d'abord le volet). Créer : `test-remise-en-route.cjs`.

**Identifiants et API migrés.** `.ks-machine-commands button` → `#step-machine-main` et `#machine-unlock` ; `#ks-machine-reread` gardé ; `#ks-machine-command-reason` → barre d'étape ; `#ks-machine-limits`, `#ks-machine-follow`, `#ks-machine-display`, `#ks-machine-history`, `#ks-machine-info` supprimés ; `#pilot-reason-a`, `#pilot-reason-b` prennent la main. Tests migrés : `test-machine-screen.cjs`, `test-machine-limits.cjs`, `test-connect-cnc.cjs`, `test-grbl-help.cjs`, `test-control-attribution.cjs`, `test-commissioning.cjs`, `test-compact-layout.cjs`, `test-display-settings.cjs`, `test-real-motion.cjs`, `test-v2-machine.cjs`, `test-v2-machine-release.cjs`, `test-v2-machine-frames.cjs`.

**Tests à écrire.** `test-remise-en-route.cjs` : chaque état du tableau du § 4.1 donne la bonne ligne en tête et la bonne action ; chaque ligne du tableau de la ligne `zero` (dont [Vérifier à nouveau], qui envoie `verifyOffset`, et « gardé » jamais écrit sans `proven`) ; le cas « CNCjs redémarré, machine en alarme, version inconnue » : [Relire] actif quand `canReadSettings` ; l'encart suit le § 6.9 et survit à un rechargement de la page ; « Déverrouiller » n'est jamais l'action principale quand `canHome` est vrai ; sept lignes au plus ; aucun libellé de ① ne contient `$`. Dans `test-control-attribution.cjs` : les deux boutons-motifs prennent la main, une demande à la fois, et le dialogue dit ce qui sera arrêté.

**Test de preuve à convertir.** `test-bughunt-A2-5.cjs`, parties a et b, pour ① (C-30).

**Harnais.** `screens` : états de `machine` ; trois états de banc ajoutés (port fermé, repos sans origine machine, arrêté sans origine machine). `parcours` : P1, P8 jusqu'à la prise d'origine, P9.

**Critère de fin.** Les règles communes ; P1 = 5 ; `screen-limits` absent ; l'assistant de mise en service ne s'ouvre plus seul (test, C-67) ; la chaîne guidée après un redémarrage de CNCjs passe (C-14).

### L3a — Zéro pièce : déplacer et zéros

**But.** ③ sans la sonde : trois colonnes, la croix toujours visible, mêmes places en v1 et en v2, le zéro à l'origine machine.

**Écrans.** ③ colonnes « Position pièce » et « Déplacer » (§ 4.3) ; volet « Autres zéros » (§ 5.8) ; dialogue « Poser le zéro » (§ 5.4). La carte v2 « Où le programme se placera » quitte Préparer : son emplacement `prepare` est hébergé par `screen-check` (L4 l'y range derrière [Vue 3D du placement]) ; `job-preparation.js` continue de la charger jusqu'en L4.

**Fichiers.** Modifier : `touch/index.html` (section `screen-jog`), `touch/real-motion.js` (les raisons passent par `seance.js` et la barre d'étape ; le bouton `#jog-read-settings` disparaît ; un pas interdit est rayé au lieu d'être masqué ; le zéro à l'origine machine), `touch/job-controls.js` (`origin` avec `at: 'machine'`), `touch/job-preparation.js` (retrait de la comparaison v2 et de `#pv2-*`), `touch/origin-preview.js`, `touch/origin-preview.css`, `touch/touch-shell.js` (emplacement `prepare`, retrait du volet « Comprendre l'origine » et de `#ks-origin-info`), `touch/laser-z.js`, `touch/operator-tools.css`, `touch/app.css`, `touch/performance-v2.css`, `touch/i18n-messages.js`, `touch/i18n-messages-origin.js`. Créer : `test-zero-machine.cjs`.

**Identifiants et API migrés.** `#pv2-tool-zero`, `#pv2-set-xy`, `#pv2-jog-open`, `#pv2-jog-close`, `#pv2-tool-speed`, `#pv2-final-open`, `#jog-read-settings`, `#ks-origin-info`, `#jog-controller` supprimés ; `#jog-msg` → barre d'étape ; `#zero-more-open`, `#zero-machine-open` créés. Tests migrés : `test-real-motion.cjs`, `test-preparer-style.cjs`, `test-operator-tools.cjs`, `test-laser-z.cjs`, `test-v2-mounts.cjs`, `test-v2-origin.cjs`, `test-origin-preview.cjs`, `test-v2-preparer.cjs`, `test-v2-preparer-fixture.cjs`, `test-v2-preparer-layout.cjs`, `test-v2-preparer-reopen.cjs`, `test-v2-preparer-rest.cjs` (ces cinq derniers : réécrits sur ③, ou supprimés en le disant).

**Tests à écrire.** `test-zero-machine.cjs` : la demande (`at: 'machine'`, l'axe) et le dialogue du zéro à l'origine machine ; son bouton ne porte jamais le même libellé que « ici » ; rayé avec sa cause sans origine machine, zéro pièce non vérifié, décalage actif. Dans `test-real-motion.cjs` : la croix est active au repos en v2 sans autre toucher ; 12 px entre les trois zéros ; un pas interdit est rayé avec sa raison ; relâcher une flèche tenue envoie l'arrêt même si la main vient d'être perdue.

**Harnais.** `screens` : états de `jog` (`reel-repos`, `reel-origine`, `reel-perime`, `reel-travail`, `reel-continu`) en v1 et en v2 ; `v2` : la passe « Préparer comparison and jog panel » devient « Zéro pièce » ; `responsive` : variantes `-op-card`. `parcours` : P6.

**Critère de fin.** Les règles communes ; P6 = 3 / 3 / 4 ; en v2 au repos, les six flèches sont mesurées à 96 px sans toucher préalable ; plus aucun bouton `#pv2-jog-open`, `#pv2-jog-close`, `#pv2-set-xy`, `#pv2-tool-zero`, `#pv2-tool-speed`, `#pv2-final-open` dans la page.

### L3b — Zéro pièce : la sonde

**But.** La carte Sonde, ses volets, ses dessins ; la plaque et le bloc réunis ; plus aucun écran de Sonde sur la page réelle.

**Écrans.** Carte Sonde de ③ (§ 4.3) ; volets « Ma sonde », « Tester la sonde », « Plaque », « Sauvegarde des sondes » (§ 5.5 à § 5.7, § 5.13) ; dialogues `blockProbe` et `zeroZ` ; dessin de départ (§ 6.6) ; voyant (§ 6.5) ; le bouton [Zéro Z à la plaque…] de ⑤ en pause de changement d'outil et en fin d'usinage. L'encart de ⑤ n'existe qu'en L5 : d'ici là le bouton est posé à côté de `#home-pause-m5` (avis de pause existant) et dans la ligne d'état de fin d'usinage ; L5 le range dans l'encart.

**Fichiers.** Créer : `touch/zero-piece.js` (carte, volets, plaque ; page réelle seulement) ; `test-zero-piece.cjs`, `test-probe-assistant.cjs`, `test-probe-diagnostic.cjs`. Modifier : `touch/probe-real.js` (raisons → causes), `touch/probe-model.js` (déduction depuis le coin, coin non exigé pour Z ; les valeurs de départ viennent du lot P1), `touch/probe-diagram.js` (modes « écran » et « plan »), `touch/probe-profiles.js`, `touch/probe-transfer.js` (hôte : le volet), `touch/probe-ui.js` (banc de la simulation seule : ses branches « réel » sont retirées, dont le relais de `#probe-stop` vers `#job-stop`), `touch/numeric-pad.js` (option `dock: 'right'` : pavé au bord droit, sans voile, avec le nom du champ), `touch/job-resume.js` (la carte de la plaque et ses champs partent ; les boutons de ⑤ appellent `zero-piece.js`), `touch/commissioning.js` (étape « Sonde » : ouvre le volet), `touch/touch-shell.js` (noms et entrée de Sonde gardés pour la simulation seule), `touch/probe.css`, `touch/index.html` (retire `probe-ui.js` et `probe-preparation.js`, ajoute `zero-piece.js`), `tablet-exclude.txt` (ajoute `probe-ui.js`, `probe-preparation.js`), `test-no-simulation-access.cjs` (sa constante `SIMULATION_ONLY`, ligne 9, reçoit ces deux fichiers ; aucun script gardé ne doit plus contenir leur nom), `touch/i18n-messages-profiles.js`, `touch/i18n-messages.js`.

**Identifiants et API migrés.** `#home-plate`, `#home-plate-thickness`, `#home-plate-search`, `#home-plate-probe` → `#probe-plate-start` et le volet « Plaque » ; `#probe-zero-z`, `#probe-wcs`, `#probe-profiles`, `#probe-result` (l'ancien accès à l'écran des résultats), `#probe-transfer-open`, `#probe-preparation-open`, `#probe-message`, `#probe-availability` supprimés de la page réelle ; `#probe-profile` → volet « Ma sonde » ; `#probe-test` ouvre le volet ; `#probe-setup-open`, `#probe-cause`, `#probe-outcome` (le bilan), `#probe-card` créés ; événement `cnc-plate-show` supprimé ; `window.cncZeroPiece` créé. Tests migrés : `test-probe-real-ui.cjs` et `test-block-probe-dialog.cjs` (vers `zero-piece.js`), `test-probe-real.cjs`, `test-probe-model.cjs`, `test-probe-profiles.cjs`, `test-probe-diagram.cjs`, `test-probe-transfer.cjs`, `test-probe-preparation.cjs`, `test-probe-lock.cjs`, `test-job-resume.cjs`, `test-home-suivi.cjs`, `test-no-simulation-access.cjs`, `test-simulation-ui.cjs`, `test-commissioning.cjs`, `test-numeric-pad.cjs`, `test-numeric-rules.cjs`, `test-download-file.cjs`, `test-profile-storage.cjs`, `test-real-interface.cjs`, `test-tablet-profile.cjs`.

**Tests à écrire.**
- `test-probe-assistant.cjs` : les quatre coins donnent les sens et les signes que `s/block-probe.js` accepte ; aucune mesure proposée, champs vides à la création ; Z seul ne demande que l'épaisseur ; la consigne du test et ses coches sont dans le volet quand il vient de [Palper au bloc …] ; le pavé ouvert ne recouvre pas le dessin.
- `test-probe-diagnostic.cjs` : chaque ligne du tableau du § 5.6, pilotée par des états reçus ; **le cas du 14 novembre** (contact permanent, pince sur la fraise, broche branchée : le contact cesse quand la broche est débranchée) finit sur « C'est la broche » ; le même signal obtenu en retirant la pince n'accuse la pince qu'après l'étape de la broche ; aucune consigne n'est affichée tant que la machine bouge ou que la broche tourne ; aucun bouton ne mène à « La sonde marche. ».
- `test-zero-piece.cjs` : XYZ est le choix à chaque arrivée ; les trois cas de [Palper au bloc …] (§ 4.3) ; chaque refus du palpage s'écrit dans la carte avec son remède et s'efface quand la cause change ; un refus de course reçu avec `canBlockProbe` vrai laisse le bouton actif et la phrase écrite, avec le côté et la distance ; un départ hors de la zone (`ETOUCH_PROBE_WINDOW`) montre le dessin entouré ; chaque ligne du tableau des bilans, plaque comprise ; la plaque n'est jamais masquée ; le repère envoyé est le repère actif ; `#probe-stop` appelle `stop()`.

**Tests de preuve à convertir.** `test-bughunt-A2-4.cjs`, parties a et b (C-27, C-28) ; `test-bughunt-A2-2.cjs`, partie « plaque » (C-29).

**Harnais.** `screens` : les états `bloc-pret`, `bloc-en-cours`, `bloc-termine`, `bloc-echec`, `bloc-arret`, `bloc-refus-contact` sont mesurés sur `jog` ; les écrans `probe*` sortent des variantes de la page réelle. `parcours` : P3, P4, P5 (depuis ③ et depuis ⑤ en fin d'usinage), P10.

**Critère de fin.** Les règles communes ; P3 = 14 et 4 saisies, P4 = 4 depuis un autre écran, P5 = 3, P10 = 2 ; aucune section `screen-probe*` sur la page réelle (C-42) ; `#home-plate` absent ; à 1366 × 768, la colonne Sonde tient sans défiler, texte agrandi et espagnol compris.

### L4 — Fichier et Contrôle

**But.** ② qui dit tout de suite si le fichier tient ; ④ définitif avec ses dessins, D1 et sa dérogation.

**Écrans.** ② (§ 4.2) ; ④ (§ 4.4) ; volet « Détails du contrôle » (§ 5.11) ; dialogues `start`, dérogation, `frame` ; dialogue [Vue 3D du placement] (v2).

**Fichiers.** Créer : `touch/check-screen.js` (il devient l'appelant de `cncProfile.loadAdvanced(['preview-gl.js', 'origin-preview.js'])`) ; `test-check-screen.cjs`, `test-check-drawing.cjs`, `test-files-verdict.cjs`, `test-derogation.cjs`. Modifier : `touch/index.html` (sections `screen-files`, `screen-check`), `touch/shared-library.js`, `touch/shared-library.css`, `touch/files-touch.css`, `touch/library-preview.js` (profondeur), `touch/projects.js`, `touch/program-check-view.js` (verdict en mots, les deux dessins ; l'ancien rendu sert à « Détails du contrôle »), `touch/job-controls.js` (`checkFile`, départ depuis ④, dérogation `override: 'travel'` ; `#job-travel` et les boutons cachés `#job-load`, `#job-start` retirés), `touch/job-dashboard.js` (rangée des rapides extraite en fonction commune), `touch/job-resume.js` (le cadrage laser part dans ④), `touch/laser-view.js`, `touch/origin-preview.js` (hôte : le dialogue ; plus de ligne de verdict), `touch/travel-check.js` (seul `place()` reste ; `check` et `show` n'ont plus d'appelant et sont retirés), `touch/touch-shell.js` (outils de Fichiers ; `fitLibrary` : 4, 6 ou 3 lignes ; retrait de `preparationActions` de la page réelle), `touch/performance-v2.css`, `touch/i18n-messages.js`. Retirer de la page et du dépôt : `touch/job-preparation.js` (`simulation.html` le perd aussi).

**Identifiants et API migrés.** `#job-load` → `#step-files-main` et `cncJobControls.load(file)` ; `#home-job-start` et `#job-start` → `#step-check-main` et `cncJobControls.start()` ; `#home-job-load` → remède `recharger-fichier` ; `#home-frame-start` → `#check-frame-start` ; `#ks-preparation-open`, `#ks-prep-load`, `#job-travel`, `#job-program-check` (dans le dialogue) supprimés ; `#files-verdict`, `#files-depth`, `#files-extent`, `#check-top`, `#check-side`, `#check-verdict`, `#check-rapids`, `#check-details-open`, `#check-override-open` créés ; `window.cncJobPreparation`, `cncShell.preparationActions`, `CNCTravelCheck.check` et `.show` supprimés. Tests migrés : `test-files-screen.cjs`, `test-library-transitions.cjs`, `test-library-file-state.cjs`, `test-library-context.cjs`, `test-library-page-fit.cjs`, `test-program-check-view.cjs`, `test-v2-files.cjs`, `test-v2-files-frames.cjs`, `test-job-dialog.cjs`, `test-frame-refusal-reasons.cjs`, `test-laser-view.cjs`, `test-origin-preview.cjs`, `test-home-actions.cjs`, `test-travel-check.cjs` et `test-gcode-corpus.cjs` (gardés sur `place()`), `test-scenario-profiles.cjs` (les appelants de `loadAdvanced` deviennent `check-screen.js` et `preview-3d.js`), `test-performance-v2-safety.cjs` (sa partie « Préparer » vise l'emplacement `prepare` de ④ ; la regex `V2_NODE` n'est pas touchée), `test-bughunt-c-1.cjs`, `test-bughunt-f3.cjs`, `test-preview-identity.cjs`, `test-v2-i18n.cjs`, `test-v2-origin.cjs`, `test-tablet-profile.cjs`, `test-real-interface.cjs`, `test-macros.cjs`, et tous ceux que la recherche des règles communes trouve (la critique de réalisation en compte 34 pour ce lot, § 3 de `propositions/CRITIQUE-REALISATION.md`). Tests supprimés, à dire dans le rapport : `test-job-preparation.cjs`, `test-preparation-keys.cjs`.

**Tests à écrire.**
- `test-files-verdict.cjs` : une requête `check` par fichier touché, la réponse d'un autre fichier est ignorée, les huit phrases du § 4.2, [Réessayer], la demande refaite quand le zéro pièce devient vérifié ; 4 lignes à 768, 6 à 911.
- `test-check-drawing.cjs` : depuis un `programCheck` donné, le SVG porte la cote `over` du serveur, le bon côté, le pointillé d'un axe non vérifié, le mot « zéro Z » (cas : Z trop bas de 15 mm ; X à droite ; axe inconnu ; tout tient ; fichier à 0,3 mm de la borne : le dessin dit « dépasse », comme le serveur).
- `test-check-screen.cjs` : chaque état du tableau du § 4.4, dans son ordre de priorité ; un verdict « dépasse » n'ouvre jamais le dialogue de départ ; zéro pièce non vérifié : jamais de case « non vérifié », jamais de dérogation ; [Recharger ce fichier] recharge le fichier de la machine quand un autre est choisi dans ② ; les deux rangées de rapides (④ et ⑤) suivent le même état.
- `test-derogation.cjs` : le bouton n'existe que dans « Détails du contrôle » et seulement si `overridable` ; il envoie `override: 'travel'` ; sa case dit le dépassement rendu par le serveur ; `ETOUCH_START_OVERRIDE_CHANGED` referme le dialogue avec sa phrase.

**Harnais.** `screens` : `files` et le nouvel écran `check` dans tous les états, avec trois états de banc ajoutés (dépassement prouvé, non vérifié, zéro pièce non confirmé) ; `e2e` : charger reste sur ②, démarrer depuis ④ ; `v2` : Fichiers, et la vue 3D du placement ouverte depuis ④. `parcours` : P2, P7 jusqu'au départ.

**Critère de fin.** Les règles communes ; P2 = 3 avec le verdict affiché avant « Charger » ; sur l'état de banc « dépassement prouvé », [Démarrer l'usinage…] est rayé et sa cause porte un remède ; `job-preparation.js` absent, plus aucune classe `pv2-` dans `touch/`, plus aucun appelant de `CNCTravelCheck.check` ni `.show` ; la vue 3D du placement s'ouvre en v2 ; la rangée « Rapides au départ » de ④ envoie la même commande que celle de ⑤.

### L5 — Usinage

**But.** ⑤ définitif, aux mêmes places en v1 et en v2 ; la reprise à une ligne ; la fin des relais.

**Écrans.** ⑤ (§ 4.5) ; volet « Reprendre à une ligne » (§ 5.12) ; dialogue `resume`.

**Fichiers.** Modifier : `touch/index.html` (section `screen-home`), `touch/job-dashboard.js` (trois rangées dans les deux rendus, encart, retrait du volet « Broche et rapides » et de la zone de messages), `touch/job-resume.js` (volet, une seule réponse de plan comptée, encart de pause et de fin avec [Zéro Z à la plaque…]), `touch/job-follow.js` (bilan dans l'encart), `touch/job-controls.js` (retrait des boutons cachés `#job-pause`, `#job-resume`, `#job-stop` et des zones `#job-feedback`), `touch/status-strip.js`, `touch/preview-viewer.js` (`#preview-job-stop` appelle `stop()`), `touch/real-motion.js` (ligne 485 : ne cite plus `#job-stop`), `touch/performance-observation.js`, `touch/performance-sequences.js`, `touch/performance-v2.css`, `touch/app.js` (C4), `touch/i18n-messages.js`, `touch/i18n-messages-v2.js`. Créer : `test-reprise-volet.cjs`, `test-usinage-ecran.cjs`.

**Identifiants et API migrés.** `#home-job-pause`, `#home-job-resume` → `#step-home-main` ; `#home-resume-check` supprimé ; `#home-resume-panel` → volet `ks-resume-sheet` ; `#home-v2-more-overrides`, `perf-v2-overrides-sheet`, `#home-job-feedback`, `#job-feedback`, `#job-reason`, `#job-pause`, `#job-resume`, `#job-stop` supprimés ; `#home-notice` créé. Tests migrés : `test-dashboard.cjs`, `test-dashboard-pause-guard.cjs`, `test-home-actions.cjs`, `test-home-suivi.cjs`, `test-job-follow.cjs`, `test-job-resume.cjs`, `test-job-display.cjs`, `test-job-dialog.cjs`, `test-job-dialog-strip.cjs`, `test-job-stream-client.cjs`, `test-status-strip.cjs`, `test-strip-guard.cjs`, `test-strip-continuity.cjs`, `test-action-feedback.cjs`, `test-feedback-states.cjs`, `test-v2-suivi.cjs`, `test-v2-suivi-style.cjs`, `test-v2-suivi-preview.cjs`, `test-v2-observation.cjs`, `test-v2-sequences.cjs`, `test-v2-mounts.cjs`, `test-preview-viewer.cjs`, `test-performance-v2-safety.cjs` (sans toucher `V2_NODE`), `test-real-motion.cjs`, `test-probe-real-ui.cjs`, `test-block-probe-dialog.cjs`, `test-control-attribution.cjs`, `test-frame-refusal-reasons.cjs`, `test-server-messages.cjs`, `test-simulation-ui.cjs`, `test-transverse-screen.cjs`, `test-network-hint.cjs`, `test-numeric-pad.cjs`, `test-numeric-rules.cjs`, `test-tablet-profile.cjs`, `test-bughunt-f3.cjs`, et tous ceux que la recherche des règles communes trouve.

**Tests à écrire.** `test-usinage-ecran.cjs` : chaque état du tableau du § 4.5 ; [Arrêter la broche] suit `canSpindleStop` et n'écrit jamais « La broche est arrêtée. » de lui-même ; en pause demandée par l'opérateur il est rayé avec la raison du serveur ; [Reprendre à une ligne…] jamais masqué ; [Zéro Z à la plaque…] présent en pause de changement d'outil et en fin d'usinage, avec la garde `canZeroZ` ; une pause dont la reprise est refusée affiche la raison. `test-reprise-volet.cjs` : le volet vise `stoppedFile` même si un autre fichier est choisi ; une requête `resumePlan` à l'ouverture et par changement de ligne ; une réponse en retard pour une autre ligne est ignorée, et [Charger la reprise] reste rayé tant que le plan de la ligne affichée n'est pas accepté ; les refus et leurs deux remèdes.

**Test de preuve à convertir.** `test-bughunt-A2-2.cjs`, partie « Reprendre à une ligne » (C-29).

**Harnais.** `screens` : `home` dans tous les états, plus `alarme-arret` ; `strip` ; `v2` ; `e2e`. Contrôle nouveau dans `v2` : à 1366 × 911, le centre de chaque commande machine est au même endroit (à 1 px près) en v1 et en v2 (Q-10). `parcours` : P7 et P8 complets.

**Optimisation.** C4 ; le code retiré par les lots L2 à L5 est compté (R5).

**Critère de fin.** Les règles communes ; P7 = 9, P8 = 10 ; plus aucun bouton caché `#job-start`, `#job-pause`, `#job-resume`, `#job-stop`, `#job-load` ; les trois rangées de corrections sont mesurées en v2 ; le contrôle « mêmes places en v1 et en v2 » passe.

### L6 — Plus, Journal, Réglages, mise en service, guide, langues

**But.** Cohérence de ce qui est rare, textes restants, anglais et espagnol complets, documents, optimisations de fin.

**Écrans.** Plus (§ 4.6) et ses sous-écrans (§ 4.7) ; le Guide réécrit sur le fil.

**Fichiers.** Modifier : `touch/session-journal.js`, `touch/real-history.js`, `touch/display-settings.js` (cohérence seulement), `touch/interface-guide.js`, `touch/macros.js`, `touch/commissioning.js` (textes de l'assistant), `touch/backlight.js` (choix de veille rayé quand `local` est faux, K6), `touch/i18n-messages.js`, `touch/i18n-messages-machine.js`, `touch/i18n-messages-profiles.js`, `touch/i18n-messages-viz.js`, `touch/i18n-messages-origin.js`, `touch/i18n-messages-v2.js`, `touch/i18n-messages-refus.js` (une phrase propre par code), `touch/i18n.js`, `touch/startup.js`, `touch/wifi-settings.js` (C1), `touch/system-updates.js` (C2), `touch/ui-2027.css`, `touch/operator-tools.css`, `touch/app.css`, `touch/touch-shell.css` (C5) ; `PERFORMANCE-UI-SPEC.md`, `TESTING.md`, `BUGHUNT-MAP.md`, `design/v2/PERFORMANCE-V2-USAGE.md` (relecture d'ensemble). Créer : `test-textes-regles.cjs`.

**Tests migrés.** `test-i18n.cjs`, `test-v2-i18n.cjs`, `test-viz-i18n.cjs`, `test-journal-languages.cjs`, `test-history-view.cjs`, `test-real-history.cjs`, `test-v2-journal.cjs`, `test-v2-journal-context.cjs`, `test-interface-guide.cjs`, `test-macros.cjs`, `test-display-settings.cjs`, `test-v2-settings.cjs`, `test-wifi-settings.cjs`, `test-system-updates.cjs`, `test-server-messages.cjs`, `test-startup.cjs`, `test-backlight.cjs`.

**Tests à écrire.** `test-textes-regles.cjs` : aucune chaîne des écrans d'étape, des dialogues et des refus ne contient `$` suivi d'un chiffre, un mot `G` ou `M` suivi de chiffres, ni un état Grbl en anglais (exceptions : les volets de détails — « Détails », « Détails de la machine », « Détails du contrôle », « Détails du fichier » —, le Guide, la mise en service, le nom d'un port quand il y en a plusieurs) ; aucune phrase d'un refus ne dépasse 90 caractères en français ; aucune des phrases interdites du § 5.1 du prompt ne reste. `test-refus-table.cjs` devient strict : une phrase propre par code. `test-i18n.cjs` : aucune chaîne de la page réelle sans ligne EN et ES.

**Harnais.** Passe complète, toutes étapes, par l'agent désigné ; `settings` ; `screens` : `more`, `history`, `guide`, variantes EN.

**Optimisation.** C1, C2, C5, C6, C9 (§ 12).

**Critère de fin.** Les règles communes sur la passe complète ; les trois tests ci-dessus verts ; les documents mis à jour là où le comportement a changé ; `measure-refonte.cjs --out <dossier>/apres` lancé et comparé à « avant ».

---

## 12. Optimisation (chantier C) : quelle piste dans quel lot

Pistes de `audit/MESURES.md` § 3. Règle du prompt : on ne corrige que ce qui se mesure.

| Piste | Quoi | Lot | Remarque |
|---|---|---|---|
| C7 | Une seule valeur de cache, vérifiée par test | **L1** | 21 valeurs distinctes dans `index.html`, plus `view3` et `worker13` dans les scripts → 1 ; c'est aussi la demande « `v2u` → `v2v` ». Gain d'entretien : ce n'est pas la cause de T14 (§ 8). |
| C3 | v2 : ne plus demander une image à chaque paquet une fois la mise en page posée, jamais en veille | **L1** | Même fichier et mêmes tests que la règle du rendu (`tablet-profile.js`, `test-v2-gate.cjs`). Le retour à v1 au repos sur perte de capacité doit rester prouvé. |
| C4 | Positions de ⑤ mises à jour seulement quand ⑤ est affiché | **L5** | `app.js:179`. |
| C1 | Réglages fermé : ne plus réécrire `disabled` à chaque paquet | **L6** | Le plus gros travail inutile mesuré (−80 % de mutations pendant un usinage). |
| C2 | Mises à jour : dessiner seulement si l'onglet est affiché | **L6** | |
| C5 | 96 règles CSS sans référence | **L6** | À refaire après la refonte : la liste aura changé. |
| C6 | Membres exportés et phrases sans référence | **L6** | Plus les textes rendus morts par les lots (écrans de Sonde, volets supprimés). |
| C9 | En français, ne plus charger ni indexer les catalogues de phrases | **L6**, en dernier, dans son propre commit | −23 % de JavaScript décodé. Seulement après l'anglais et l'espagnol complets ; retiré si une variante EN ou ES du harnais échoue. |
| — | Code mort retiré par la refonte | L1 à L5 | Menu, relais, `job-preparation.js`, les fonctions `check` et `show` de `travel-check.js`, écrans de Sonde sur la page réelle, volets supprimés. Compté par R5 (éléments et écouteurs) et R6 (poids du CSS). |
| C8 | Paquet groupé | **hors lot** | Déploiement à adapter, non validé sur la RT, une erreur de syntaxe y coûte Pause et Arrêter. |
| C10 | Flux allégé | **hors lot** | Protocole et serveur ; risque élevé ; relève du chantier A. |
| R1 à R7 | Remesures | phase 4 | `measure-refonte.cjs`, mêmes options qu'« avant ». |

Requêtes ajoutées par la refonte, à compter en phase 4 : une requête `check` par fichier touché dans ② (et une de plus quand le zéro pièce devient vérifié) ; une requête `resumePlan` à l'ouverture du volet de reprise et par changement de ligne ; une requête `verifyOffset` par toucher sur [Vérifier à nouveau]. Aucune n'est périodique. `seance.js` n'écrit dans la page que ce qui change (§ 6.4) : à mesurer avec R5. Aucune minuterie n'est ajoutée ; les 600 ms d'armement d'un bouton sont une comparaison d'heures au toucher.

---

## 13. Hors lot, et points à faire valider par l'opérateur

### 13.1 Ce qui reste hors lot (pour `IDEES.md`)

1. Paquet groupé de la page (C8) et flux allégé (C10).
2. Cadrage à vide pour la CNC (contour du fichier sans couper), idée n° 6 de `VEILLE.md`.
3. Pastille « tient / ne tient pas » sur chaque ligne de la liste des fichiers, sans la toucher.
4. Reconnexion automatique au dernier port à l'ouverture de la page (idée n° 15).
5. Mémoire, côté serveur, de « ce zéro pièce a été posé pour cette pièce » (aujourd'hui : « Ancien zéro » après un redémarrage de CNCjs).
6. Un bouton de reset de la machine sur la tablette (pour une machine qui ne répond plus) ; le rechargement automatique de la page quand une nouvelle version est installée ; une surveillance du test de broche de la mise en service (C-69).
7. Un code pour chaque phrase du serveur encore sans code (`TEXTES.md` § 4.3) : `refusals` en couvre une partie (K12) ; pour le reste la page reconnaît la phrase par son début, ce qui reste fragile.
8. Hauteur de sécurité à la pause ; journal des points palpés ; sélecteur à neuf points de l'origine du fichier.
9. Un vrai format pour 1024 × 600 et le portrait (aujourd'hui : cartes empilées et défilement).
10. Rendre la main volontairement (le serveur le sait, aucun bouton).
11. **Lancer un mouvement en deux touchers sur la tablette de la machine**, sans la case (un toucher de moins par prise d'origine, palpage, départ et reprise). C'est retirer un garde : la décision revient à l'opérateur, puis au chantier A avec sa preuve dans `SURETE.md`. La reconnaissance de la tablette existe déjà côté serveur (`local`, D3).
12. Se souvenir du dernier palpage choisi (Z, X ou Y seul) d'une séance à l'autre.
13. Dire le côté et la distance d'un refus de course d'un palpage directement par le serveur (aujourd'hui la page les tire des bornes du refus).

### 13.2 Points à faire valider par l'opérateur

L'opérateur n'est pas disponible : la réalisation part sur la recommandation.

| # | Question | Recommandation |
|---|---|---|
| 1 | « fraise » ou « outil » ? | **« fraise »** pour ce qui coupe ; « outil » seulement dans « changement d'outil ». |
| 2 | Comment dire qui commande ? | **« La main : ici / libre / autre »** et **« Prendre la main »**. |
| 3 | Les noms des cinq étapes | **Machine, Fichier, Zéro pièce, Contrôle, Usinage** (« Gravure » sur le laser). |
| 4 | La case « Je suis devant la machine… » avant chaque mouvement | **Elle reste**, comme aujourd'hui. La retirer sur la tablette est l'idée n° 11 du § 13.1. |
| 5 | Les mots de côté d'un dépassement : « à gauche / à droite » pour X, « vers l'avant / vers le fond » pour Y | **Oui**, en supposant X+ à droite et Y+ vers le fond devant la machine. Sinon : « en X+ », « en Y− ». |
| 6 | La dérogation « Démarrer malgré le dépassement » | **La garder, cachée** dans « Détails du contrôle », en quatre touchers. |
| 7 | Journal et Réglages sous « Plus » au lieu du rail | **Oui** : le rail ne montre que la séance. |
| 8 | Vitesses de départ de la sonde : approche 100 mm/min, seconde touche 25 mm/min, recherche 10 mm, retrait 1 mm, dégagement 5 mm | **Oui** (celles du plan des corrections ; une sonde déjà enregistrée garde les siennes). Les mesures du bloc et l'épaisseur de la plaque ne sont jamais proposées. |
| 9 | L'adresse du kiosque de la Surface | **`http://localhost:…`** : c'est la condition pour que la tablette éteigne et rallume son écran (D3). À vérifier à l'installation (essai n° 1 du plan), à écrire dans `PROTOCOLE-ESSAI.md`. |
| 10 | La page s'ouvre sur l'étape à faire, plus sur un menu | **Oui.** |
| 11 | Un zéro d'une séance précédente : « Ancien zéro », qui ne bloque pas | **Oui** : le contrôle montre où le fichier tombe ; refaire le zéro reste le geste proposé. |
| 12 | La mise en service ne s'ouvre plus toute seule | **Oui** : une ligne dans ① et une tuile dans Plus l'annoncent. |
| 13 | Les rapides réglables sur ④ avant de démarrer, en plus de ⑤ | **Oui.** |
| 14 | « Zéro Z à la plaque » aussi sur l'écran Usinage, à la fin et en pause de changement de fraise | **Oui** : c'est là qu'on est quand on change de fraise. |
| 15 | Le palpage au bloc repart toujours sur XYZ | **Oui** : le bouton dit toujours la même chose à l'arrivée. |
| 16 | Les mots des rangées de ⑤ : « Vitesse », « Broche », « Rapides » | **Les garder** : courts, ils tiennent dans les trois langues. À revoir si l'opérateur préfère « Vitesse d'usinage » et « Déplacements rapides ». |
| 17 | Le bouton « Ma sonde… » | **Le garder** : le volet règle le coin, les mesures du bloc, les vitesses et la liste des sondes. |

---

## 14. Ce qui n'est pas vérifié

- **Rien n'a été lancé** : aucun test, aucun harnais, aucune maquette. Les tailles des fils de fer sont calculées. La révision a refait les sommes de hauteurs de chaque écran, titres compris, et s'est appuyée sur les largeurs de texte mesurées par la critique de réalisation (`canvas.measureText`, pas un rendu de la page).
- **À vérifier par les maquettes**, parce que ce sont des budgets sans marge : le bandeau en espagnol, texte agrandi, pendant un usinage (§ 2.2 : l'ordre dans lequel les cellules cèdent est fixé, la suffisance ne l'est pas) ; la colonne Sonde à 768 (520 px juste) ; la colonne « Déplacer » à 768 (516 px) ; le rail en texte agrandi (tirets conditionnels du § 2.3) ; le dialogue « Palper le bloc » à 768 en texte agrandi ; le pavé numérique rangé à droite du volet « Ma sonde ».
- **Le contrat du serveur** est celui de `PLAN-CORRECTIONS.md` § 4, lu en entier. Les lots S2 à S6 et P1 à P3 n'étaient pas encore faits quand la spec a été révisée (S1 était commité ; S2 était en cours d'écriture, et son code suit les noms du plan : `verifyOffset`, `refusals`, `workOffset.state`) : si un nom de champ change à la réalisation, le § 0.2 est le seul endroit à corriger. Non vérifié : le nom exact du champ qui porte l'information `ETOUCH_CHECK_S_ABOVE_MAX` dans `programCheck`.
- **La règle du rendu v2** (§ 3.1) : le plan (lot P2, point 4) garde `canStop` dans la condition du verrou, et `canStop` est vrai pendant une prise d'origine (`s/job-service.js:1310`). Le test de preuve `test-bughunt-V3-1.cjs` exige pourtant que « Alarme → prise d'origine → Repos » ouvre la v2. La spec retient la règle étroite (verrou pour un usinage en cours ou en pause seulement) ; à signaler à l'agent du lot P2. Elle n'a pas été rejouée dans `test-v2-gate.cjs`.
- **Vérifié dans le code pendant la révision** (lecture, pas d'exécution) : les dépendances de `cncShell.preparationActions` (`macros.js:8`, `job-preparation.js:158`, `touch-shell.js:157-160`) ; le chargeur d'`origin-preview.js` (`job-preparation.js:260`) et son appel à `CNCTravelCheck.place()` ; la grille des pas (`ui-2027.css:359`) et les pas masqués (`real-motion.js:422`) ; `fitLibrary` (`touch-shell.js:55-58`) ; le faux contrôleur de `preview-server.cjs` et son faux Socket.IO ; les écrans de `measure-refonte.cjs` ; les gardes des boutons cachés (`job-controls.js:368-373`) et les relais (`status-strip.js`, `job-dashboard.js`, `probe-ui.js:252`, `preview-viewer.js:87`, `real-motion.js:485`, `job-preparation.js:193`) ; le voile du pavé (`ui-2027.css:855`) ; la marge interne du rail ; l'absence de `v2n-` ; `SIMULATION_ONLY` ; les suffixes `view3` et `worker13` ; `commissioning.js:166, 170, 508` ; les textes actuels de la case (`job-controls.js:190-201`) ; l'arrêt de la broche refusé pendant une pause demandée par l'opérateur (`s/job-service.js:924-934`) ; `canPause` vrai pendant un palpage au bloc (`:1308`) ; le test du contact dans la garde du palpage (`s/block-probe.js:436-441`) ; les paramètres de `ETOUCH_PROBE_TRAVEL` ; les valeurs de `written` ; la liste des codes du serveur (138 au commit `02e76c19`, tous rangés dans une famille au § 9.2, comme les 32 codes nouveaux du plan) ; le pont du simulateur et ses entrées (`probeTriggered`, `setLimitPin`, `homingMs`).
- **Non vérifié dans le code** : que prendre la main laisse bien un usinage continuer (§ 5.3) ; ce que rend exactement `resumePlan` pour décrire le trajet (§ 5.12 n'en cite donc aucune valeur) ; que `{action: 'check'}` rende le contrôle dans le format de `programCheck` pour un fichier non chargé (lu dans `s/job-load.js:182-188`, pas essayé) et son coût sur la RT pour un gros fichier ; que `sim-bridge.js`, écrit pour Jest, se charge tel quel depuis un banc `.cjs` (le service, lui, se charge déjà ainsi dans `preview-server.cjs`) ; l'état « la machine attend » de ⑤, repris de `ERGONOMIE.md` § 5.5 sans lire sa détection dans `job-dashboard.js` ; l'intérieur de `job-dashboard.js`, `shared-library.js`, `real-motion.js`, `probe-ui.js` au-delà des passages cités ; ce que `test-bundle.cjs` exige quand un script entre ou sort d'`index.html`.
- **Les listes de tests par lot** viennent de la première version et des comptes de la critique de réalisation (son script `count.cjs`) ; elles n'ont pas été recomptées. La règle commune du § 11 (chercher chaque identifiant avant d'éditer) est là pour cela.
- **La page de simulation** : ses modules propres n'ont pas été lus ; l'effort pour lui donner le même cadre en L1 est estimé, pas mesuré.
- **Les comptes de touchers** du § 7 sont des comptes de conception ; l'étape `parcours` du harnais les prouvera. Les fils de fer ne dessinent qu'un état par écran ; les autres états sont décrits par les tableaux, à dessiner par les maquettes.
- Rien sur la vraie Surface, la vraie RT ni la vraie CNC. En particulier : le diagnostic de la sonde (§ 5.6) suit le récit du 14 novembre, pas un essai.
