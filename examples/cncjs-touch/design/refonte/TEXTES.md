# TEXTES — inventaire et réécriture des textes de CNCjs Touch

Phase 1 (Audit), rapport « inventaire des textes ». Branche `feat/refonte-ui`, page de la version `v2u`, relevé du 15 novembre 2026. Rien du dépôt n’a été modifié : ce rapport et `audit/textes-inventaire.csv` sont les deux seuls fichiers créés.

Lire d’abord le § 1 (les nombres), puis le § 3 (60 textes à réécrire) et le § 4 (refus). Le § 2 donne le glossaire à retenir avant de réécrire quoi que ce soit.

## 1. Synthèse chiffrée

### 1.1 Ce qui a été compté

**3134 textes** au total, dans six mécanismes de traduction différents (voir § 1.5). 2872 sont encore utilisables sur la page réelle ou le serveur ; **262** ne le sont pas (178 appartiennent à la simulation : fichiers retirés de la tablette par `tablet-exclude.txt`, ou branche inactive d’un fichier chargé ; leurs lignes restent pourtant dans les catalogues chargés sur la tablette).

| Origine | Textes | Ce que c’est |
|---|---:|---|
| catalogue | 2550 | lignes FR / EN / ES des six fichiers `i18n-messages*.js` (la clé est le texte français lui-même) |
| code serveur | 140 | modèles `ETOUCH_*` de `window.CNCTouchCodes` (français, anglais, espagnol, avec `{valeurs}`) |
| table intégrée | 221 | tables FR / EN / ES écrites dans un fichier de la page (`display-settings.js`, `job-dashboard.js`, `job-preparation.js`, `real-history.js`, `machine-limits.js`, `shared-library.js`, `performance-*.js`, motifs de `library-preview.js`…) |
| texte en dur | 65 | français écrit dans le code sans aucune ligne EN / ES (démarrage, progression d’envoi, motifs d’exception de l’aperçu…) |
| message serveur | 158 | phrases françaises du serveur sans code `ETOUCH_` et sans ligne au catalogue (distinctes ; 196 autres phrases du serveur sont des lignes du catalogue) |
| **total** | **3134** | |

Périmètre : les 73 fichiers de `touch/` servis à la tablette (hors `tablet-exclude.txt`), `index.html`, les 22 fichiers de `src/server/services/touch/` et `src/server/api/api.touch.js`. Les fichiers exclus (simulation) ont été lus seulement pour savoir si un texte du catalogue leur sert.

### 1.2 Par drapeau

| Drapeau | Textes | Part du total | Définition retenue |
|---|---:|---:|---|
| long | 304 | 9.7 % | plus de 90 caractères, ou plus de deux phrases |
| technique | 431 | 13.8 % | nom de réglage Grbl ($22, $130…), code G ou M, sigle ou mot de développeur (Grbl, WCO, Pn, PRB, WebGL, empreinte, flux, module, bail, v2…) |
| réserve | 71 | 2.3 % | texte qui se dédouane (« pas nécessairement », « ne signifie pas », « indicatif », « non vérifié », « supposé »…) |
| sans remède | 312 | 10 % | refus ou erreur écrit en phrase complète qui ne dit pas quoi faire (aucun verbe à l’impératif ni « bouton ») |
| doublon | 338 | 10.8 % | même texte, à la casse, aux accents et à la ponctuation près, qu’un autre ; ou texte présent à la fois au catalogue central et dans une table intégrée à un fichier |
| jamais utilisé | 262 | 8.4 % | aucune occurrence dans la page réelle ni dans le serveur (recherche statique) ; code que le serveur n’émet jamais ; texte utilisé seulement par la simulation retirée de la tablette |
| non traduit | 216 | 6.9 % | français resté en EN ou ES, ou texte sans aucune ligne EN / ES (clé absente) |
| vocabulaire | 809 | 25.8 % | emploie un mot que le glossaire proposé écarte (voir § 2) |

Un texte peut porter plusieurs drapeaux. **1769 textes (56.4 %) en portent au moins un**, 1365 aucun. Nombre de drapeaux par texte : 0 → 1365 ; 1 → 1057 ; 2 → 504 ; 3 → 161 ; 4 → 40 ; 5 → 7.

Le drapeau « technique » se répartit en 98 « sigle ou mot de développeur », 177 « code G/M », 69 « mot de développeur (Grbl, v2…) », 107 « réglage Grbl ($nn) » (un texte peut cumuler plusieurs sortes). Sur les textes encore utilisés, 413 sont techniques.

« jamais utilisé » se décompose ainsi :

- 116 utilisés seulement par les fichiers de simulation retirés de la tablette ;
- 62 utilisés seulement dans une branche « simulation » d’un fichier chargé (preuve par la structure du code : le test `simulation` est faux sur la page réelle, qui n’a pas `data-simulation`) ;
- 74 introuvables en entier dans la page et le serveur ;
- 8 dont seul un fragment apparaît dans un texte plus long (à confirmer : peuvent être assemblés à l’exécution) ;
- 2 codes que le serveur n’émet jamais (`ETOUCH_RESUME_TOOL_OFFSET_ACTIVE`, `ETOUCH_RESUME_FEED_MODE`).

Ces lignes mortes pèsent 32 Ko sur 319.1 Ko de catalogue chargés par chaque page (≈ 10 %). Elles ne comptent pas les 33 autres textes de simulation encore actifs en apparence (mot « simulation », « fictif », « virtuel » dans un fichier chargé) : leur branche semble inactive sur la tablette, mais je ne l’ai pas prouvé texte par texte.

### 1.3 Par écran

« Écran » = écran où le texte s’affiche, déduit du fichier qui l’emploie (voir § 5). Un texte employé par plusieurs écrans est compté pour son écran principal ; la colonne « autres écrans » du CSV donne les autres.

| Écran | Textes | long | technique | sans remède | non traduit | réserve | doublon | vocabulaire | jamais utilisé |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Menu | 77 | 1 | 0 | 1 | 0 | 0 | 13 | 18 | 0 |
| Bandeau | 20 | 3 | 1 | 2 | 2 | 0 | 3 | 6 | 0 |
| Machine | 153 | 15 | 42 | 4 | 0 | 4 | 11 | 70 | 0 |
| Fichiers | 564 | 28 | 101 | 77 | 87 | 20 | 53 | 97 | 0 |
| Préparer | 292 | 27 | 36 | 31 | 40 | 14 | 45 | 89 | 4 |
| Préparer > Sonde | 481 | 41 | 70 | 61 | 5 | 10 | 53 | 122 | 1 |
| Commandes (Fichiers / Suivi) | 215 | 29 | 25 | 26 | 23 | 0 | 25 | 84 | 1 |
| Suivi | 218 | 13 | 43 | 12 | 9 | 8 | 41 | 71 | 0 |
| Reprise à une ligne | 106 | 38 | 32 | 20 | 10 | 1 | 6 | 36 | 0 |
| Journal | 109 | 3 | 4 | 4 | 0 | 3 | 14 | 30 | 0 |
| Réglages | 341 | 30 | 26 | 51 | 34 | 2 | 29 | 33 | 2 |
| Mise en service | 133 | 20 | 24 | 0 | 0 | 1 | 14 | 32 | 0 |
| Guide | 40 | 20 | 4 | 0 | 0 | 2 | 1 | 9 | 0 |
| Veille / verrou | 14 | 1 | 0 | 0 | 0 | 0 | 0 | 2 | 0 |
| Clavier / pavé | 22 | 0 | 0 | 2 | 0 | 0 | 2 | 2 | 0 |
| Démarrage / page | 53 | 10 | 5 | 0 | 1 | 1 | 6 | 14 | 0 |
| Démarrage | 2 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| Transverse | 40 | 3 | 0 | 6 | 3 | 0 | 3 | 9 | 0 |
| Simulation (hors tablette) | 178 | 9 | 11 | 9 | 0 | 2 | 13 | 58 | 178 |
| (aucun) | 76 | 13 | 7 | 6 | 0 | 3 | 6 | 27 | 76 |

### 1.4 Par type et par longueur

| Type | Textes |
|---|---:|
| aide | 918 |
| titre | 815 |
| état | 638 |
| refus | 487 |
| bouton | 185 |
| erreur | 77 |
| confirmation | 14 |

Le type est une **heuristique** (mots du texte, balise qui le porte quand elle est connue : `<button>`, `<h2>`, `aria-label`) ; elle se trompe sur des fragments et sur des états décrits en phrase. À relire avant de s’en servir pour autre chose qu’un tri. Longueur : moyenne 41 caractères, médiane 29, maximum 254 ; 304 textes sont « longs ».

### 1.5 Les six mécanismes de traduction (et leurs trous)

1. **Catalogue central** `i18n-messages*.js` : la clé est le texte français, retrouvé par texte exact (`i18n.js`, `text()`). Tout texte composé à l’exécution doit exister en entier, ou n’est pas traduit.
2. **Codes de refus** `window.CNCTouchCodes` : `[code, FR, EN, ES]` avec `{valeurs}` et `[parties facultatives]`. La page appelle `cncI18n.format(code, params, messageServeur)` (`job-controls.js:serverRefusal`, `program-check-view.js`, `tablet-profile.js`). En français, le message du serveur est affiché tel quel ; en EN / ES, le modèle du catalogue.
3. **Texte du serveur sans code** : `cncI18n.message(texte)` ne le traduit que s’il est une clé exacte du catalogue (196 phrases du serveur le sont). Aucune phrase avec valeur insérée ne peut l’être : c’est la cause des morceaux restés en français (« Palpage refusé : … », « inconnu »). Le serveur compte 158 phrases distinctes dans ce cas.
4. **Tables intégrées** : `TEXT = { fr: [en, es] }` (`display-settings.js`, `machine-limits.js`, `real-history.js`), tableaux `[fr, en, es]` (`job-dashboard.js`, `job-preparation.js`, `shared-library.js`, `performance-*.js`…), objet `{ fr: {…}, en: {…}, es: {…} }` (`performance-journal-context.js`). Chaque fichier a sa propre fonction de choix de langue.
5. **Motifs d’expression régulière** (`library-preview.js`, `NOTE_TEXT`) : traduisent après coup les notes et les motifs de refus écrits en français dans le fichier d’aperçu. Tout motif non couvert reste français.
6. **Rien** : textes écrits avant le chargement de `i18n.js` (`startup.js`, `#cnc-boot`), valeur initiale `cnc-state.js`, progression d’envoi `library-payload.js`.

Conséquence mesurée : 216 textes ont un français qui reste affiché en anglais ou en espagnol, dont 158 phrases du serveur, 58 textes en dur (surtout les motifs d’exception de l’aperçu), 0 lignes de tables intégrées. Le catalogue central, lui, est complet : sur 2550 lignes et 140 modèles de code, 0 ont un anglais ou un espagnol resté français ou identique au français (noms de langues exclus). 16 textes sont écrits deux fois (table intégrée et catalogue), avec 2 traductions anglaises différentes.

### 1.6 Constats qui sortent du cadre du vocabulaire

- **Un message de refus renvoie à un fichier de développeur** : `motion.js:245` (« … faites vérifier la convention (étape 0 de HANDOFF.md) »), message produit par le serveur, sans code ni traduction.
- **Des textes de simulation sont écrits dans les mêmes tableaux que ceux de la machine réelle** : 62 lignes du catalogue ne servent que dans une branche `simulation ? … : …` des fichiers chargés (le Guide en est plein : `interface-guide.js` écrit deux variantes de chaque page). Elles sont comptées « jamais utilisé » et restent chargées par chaque page.
- **Le texte de démarrage n’est jamais traduit** : `startup.js` s’exécute avant `i18n.js` ; les deux messages d’échec du chargement restent en français (T2914, T2915 dans le CSV, origine « texte en dur »).
- **158 phrases du serveur** sont des refus ou des états en français pur, sans code : ce sont les refus à coder en priorité (§ 4.3).
- **Deux codes de refus ne sont jamais émis** : `ETOUCH_RESUME_TOOL_OFFSET_ACTIVE` et `ETOUCH_RESUME_FEED_MODE` (lignes au catalogue, aucune émission côté serveur).
- **Les catalogues et le serveur concordent** : pour les 138 codes émis, le modèle français du catalogue et le message du serveur ne diffèrent que par les valeurs (comparaison automatique ; les cinq suites Jest `machine-profile`, `resume`, `program-check`, `block-probe` et `motion`, lancées isolément, passent : 448 tests, dont ceux qui comparent le message du serveur au modèle du catalogue pour les codes qu’elles émettent).

## 2. Glossaire de l’existant et mots à retenir

Les comptes portent sur les 2872 textes encore utilisables (français seulement). « Textes » = nombre de textes distincts qui contiennent le mot ; « occurrences » = nombre total d’apparitions. Le mot retenu est celui qu’un amateur francophone dirait devant sa machine ; les mots écartés alimentent le drapeau « vocabulaire ».

### 2.1 Table de décision

| Notion | Mot retenu (FR) | EN | ES | Mots à écarter (textes) |
|---|---|---|---|---|
| Zéro de la pièce (point de départ du programme sur la pièce) | **zéro pièce** | work zero | cero de la pieza | origine de travail (12) ; zéro de travail (4) ; origine X Y / Z (5) ; origine (seule) (42) ; repère (G54…) (94) ; décalage de travail / WCO (2) |
| Origine de la machine (prise d’origine, $H) | **origine machine (« Prise d’origine machine »)** | machine home | origen de la máquina | référencer / référencement / référencé (14) |
| Sonde de palpage | **sonde · palpage · plaque · bloc** | probe · probing · plate · block | sonda · palpado · placa · bloque | – |
| Ce que la machine exécute (le fichier chargé, l’usinage) | **fichier (le choisir) · usinage (le lancer)** | file · machining | archivo · mecanizado | programme (89) ; travail (= job) (100) ; parcours (23) |
| Qui commande la machine (pilotage, bail) | **avoir la main (« Prendre la main »)** | in control (“Take control”) | tener el control («Tomar el control») | pilote / piloter / pilotage (37) ; bail (1) |
| Zone où la machine peut aller (course, limites) | **course · « dépasse de N mm » · fin de course** | travel · “exceeds by N mm” · limit switch | recorrido · «sobrepasa N mm» · final de carrera | limite(s) (23) ; hors course (15) ; limite logicielle (6) |
| La machine (carte, contrôleur, Grbl) | **la machine** | the machine | la máquina | carte (69) ; contrôleur (54) |
| Alarme et déverrouillage | **alarme · « Déverrouiller »** | alarm · “Unlock” | alarma · «Desbloquear» | $X (25) |
| Arrêt et pause | **« Pause » · « Arrêter »** | Pause · Stop | Pausa · Detener | interrompre / interrompu (36) ; reset / réinitialisation (16) |
| Reprendre un usinage | **« Reprendre » · « Reprendre à la ligne N »** | Resume · “Resume from line N” | Reanudar · «Reanudar desde la línea N» | relancer (16) ; redémarrer (12) |
| Confirmer une action | **« Confirmer » (« acquitté » → « reçu par la machine »)** | Confirm | Confirmar | valider (14) ; acquitter (17) ; accepter (13) |
| Fraise, outil, broche | **fraise (ce qui coupe) · broche (le moteur)** | bit · spindle | fresa · husillo | tête (11) |
| Vitesses | **vitesse** | speed | velocidad | avance (24) ; feed (3) |
| Voir le fichier | **aperçu · vue 3D** | preview · 3D view | vista previa · vista 3D | – |
| Historique des événements | **Journal** | Log | Registro | historique (7) |
| Réglages | **Réglages** | Settings | Ajustes | paramètres (20) ; configuration (11) ; préférences (5) |
| État de la machine | **état (« information à jour / ancienne » pour « rapport frais / périmé »)** | status | estado | rapport (70) ; périmé / frais (14) |
| Où est la fraise | **position (« position pièce » / « position machine »)** | position (work / machine) | posición (pieza / máquina) | coordonnées (22) ; cote (4) ; MPos / WPos (2) |
| Pièce et matière | **pièce · bloc (de palpage)** | workpiece · block | pieza · bloque | – |

Choix qui demandent l’avis de l’opérateur : « fraise » contre « outil » (« outil » apparaît dans 75 textes, « fraise » dans 4, mais « outil » est aussi le mot des changements d’outil T / M6) et « avoir la main » pour le pilotage. Les autres choix suivent les mots que l’opérateur a lui-même employés le 14 novembre (« l’origine machine », T13 ; « palper », T4).

### 2.2 Détail des mots employés aujourd’hui

**Zéro de la pièce (point de départ du programme sur la pièce)** — proposé : zéro pièce (« Zéro X », « Zéro Z », « Zéro XYZ ») — Un seul mot pour « là où le programme commence sur la pièce ». « Origine » est réservé à la machine ; « repère » (G54) n’est plus montré hors Détails.

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| origine de travail | 12 | 12 | T1258, T1309 |
| origine de la pièce | 0 | 0 | – |
| zéro de travail | 4 | 4 | T0538, T1968 |
| zéro X / Y / Z / XYZ | 34 | 36 | T0308, T0315 |
| zéro (seul) | 5 | 5 | T0532, T1170 |
| point zéro | 0 | 0 | – |
| origine X Y / Z | 5 | 5 | T2522, T2524 |
| origine (seule) | 42 | 43 | T0034, T0035 |
| repère (G54…) | 94 | 102 | T0281, T0296 |
| décalage de travail / WCO | 2 | 2 | T3028, T3030 |

**Origine de la machine (prise d’origine, $H)** — proposé : origine machine (action : « Prise d’origine machine » ; état : « origine prise » / « origine à prendre ») — C’est le mot que l’opérateur emploie déjà (« l’origine machine »). « Référencer », « référence » et « home » disparaissent.

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| prise d’origine | 54 | 54 | T1097, T1149 |
| origine machine | 2 | 2 | T0469, T3031 |
| référencer / référencement / référencé | 14 | 16 | T0620, T0635 |
| référence (nom) | 0 | 0 | – |
| home / homing | 0 | 0 | – |
| mise à l’origine | 0 | 0 | – |

**Sonde de palpage** — proposé : sonde (l’objet) · palpage (l’action) · plaque (zéro Z) · bloc (zéro XYZ) — Pas de « palpeur ». « Contact » reste pour l’état du voyant (« contact » / « libre »).

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| sonde | 37 | 39 | T0135, T0283 |
| palpeur | 0 | 0 | – |
| palpage | 165 | 170 | T0032, T0035 |
| palper | 9 | 9 | T0641, T1391 |
| plaque | 32 | 34 | T0308, T0713 |
| bloc | 50 | 53 | T0748, T2204 |
| touche / contact | 71 | 74 | T0284, T0302 |

**Ce que la machine exécute (le fichier chargé, l’usinage)** — proposé : fichier (le choisir, le charger) · usinage (le lancer, le suivre) — « Programme », « travail » et « parcours » désignent la même chose que « fichier » ; « travail » signifie aussi « coordonnées de travail » (→ « pièce »).

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| fichier | 159 | 165 | T0026, T0056 |
| programme | 89 | 95 | T0307, T0309 |
| travail (= job) | 100 | 102 | T0060, T0067 |
| usinage | 11 | 11 | T0461, T1473 |
| parcours | 23 | 23 | T0036, T0276 |
| G-code | 17 | 17 | T0117, T0140 |
| tâche / job | 0 | 0 | – |
| tracé | 15 | 15 | T1538, T2097 |

**Qui commande la machine (pilotage, bail)** — proposé : « Qui a la main » ; bouton « Prendre la main » — « Pilote », « bail », « pilotage attribué » sont des mots d’informaticien ; l’opérateur dit « avoir la main ».

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| pilote / piloter / pilotage | 37 | 43 | T1511, T1512 |
| bail | 1 | 1 | T2982 |
| prise de contrôle | 0 | 0 | – |
| prendre la main | 1 | 1 | T1914 |
| appareil / session | 46 | 51 | T0011, T0145 |

**Zone où la machine peut aller (course, limites)** — proposé : course (de la machine) · « dépasse de N mm » · fin de course (l’interrupteur) — « Course » est compris des utilisateurs de CNC ; « limite logicielle », « hors course machine » et « $130–$132 » quittent la ligne principale (→ Détails).

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| course | 55 | 59 | T0397, T0617 |
| hors course | 15 | 15 | T0731, T1258 |
| fin de course | 9 | 9 | T0619, T1102 |
| limite(s) | 23 | 23 | T0033, T0038 |
| limite logicielle | 6 | 6 | T0618, T1257 |
| butée | 0 | 0 | – |
| zone | 11 | 11 | T0171, T1109 |
| dépasse / dépassement | 14 | 14 | T0466, T0803 |
| emprise / enveloppe | 0 | 0 | – |

**La machine (carte, contrôleur, Grbl)** — proposé : la machine (jamais « carte » ni « contrôleur » hors Détails) — L’opérateur ne distingue pas la carte, Grbl et CNCjs.

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| machine | 241 | 257 | T0029, T0068 |
| carte | 69 | 71 | T0310, T0795 |
| contrôleur | 54 | 55 | T0043, T0060 |
| Grbl | 59 | 60 | T0143, T0259 |
| CNCjs | 99 | 105 | T0011, T0043 |
| serveur | 94 | 95 | T0143, T0145 |

**Alarme et déverrouillage** — proposé : alarme · « Déverrouiller » — « $X » et « effacer l’alarme » se disent « Déverrouiller ».

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| alarme | 40 | 40 | T0053, T0103 |
| déverrouiller | 27 | 27 | T1106, T1120 |
| verrouillé | 5 | 5 | T1404, T1406 |
| effacer / acquitter / lever l’alarme | 0 | 0 | – |
| $X | 25 | 25 | T0552, T1106 |
| erreur | 12 | 12 | T0930, T1087 |

**Arrêt et pause** — proposé : « Pause » (reprise possible) · « Arrêter » (fin de l’usinage) — Deux mots pour deux effets ; « stop », « interrompre », « reset » disparaissent de la ligne principale.

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| arrêter / arrêt | 126 | 138 | T0119, T0128 |
| stop | 0 | 0 | – |
| pause | 56 | 58 | T0052, T0090 |
| interrompre / interrompu | 36 | 36 | T0007, T0181 |
| annuler | 32 | 32 | T0160, T0312 |
| reset / réinitialisation | 16 | 16 | T0310, T0447 |

**Reprendre un usinage** — proposé : « Reprendre » · « Reprendre à la ligne N » — Un seul verbe pour redémarrer après une pause ou un arrêt.

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| reprendre / reprise | 73 | 77 | T0127, T0157 |
| relancer | 16 | 16 | T0312, T0897 |
| redémarrer | 12 | 13 | T0310, T1548 |
| continuer | 3 | 3 | T0017, T1767 |

**Confirmer une action** — proposé : « Confirmer » ; « acquitté » devient « reçu par la machine » — « Valider » et « acquitter » ne veulent rien dire pour l’opérateur.

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| confirmer | 70 | 78 | T0003, T0020 |
| valider | 14 | 14 | T0268, T0397 |
| acquitter | 17 | 18 | T0128, T0221 |
| accepter | 13 | 13 | T1235, T1280 |
| OK | 1 | 1 | T1414 |

**Fraise, outil, broche** — proposé : fraise (ce qui coupe) · broche (le moteur qui tourne) — L’opérateur dit « la fraise » ; « outil » reste accepté pour les changements d’outil (T, M6).

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| outil | 75 | 77 | T0171, T0291 |
| fraise | 4 | 4 | T1108, T1140 |
| broche | 57 | 60 | T0305, T0306 |
| mèche | 0 | 0 | – |
| tête | 11 | 12 | T1066, T1067 |

**Vitesses** — proposé : vitesse (« Vitesse de déplacement », « Vitesse de coupe ») — « Avance » (feed) se lit comme « avance rapide ».

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| avance | 24 | 24 | T0310, T0967 |
| vitesse | 27 | 28 | T0323, T0419 |
| feed | 3 | 3 | T2598, T2684 |
| mm/min | 13 | 15 | T0587, T0700 |
| tr/min | 7 | 8 | T1091, T1156 |

**Voir le fichier** — proposé : aperçu (2D) · vue 3D — Un mot par objet à l’écran.

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| aperçu | 89 | 95 | T0117, T0118 |
| vue | 35 | 38 | T0824, T0825 |
| visualisation | 0 | 0 | – |
| tracé | 15 | 15 | T1538, T2097 |
| parcours (outil) | 23 | 23 | T0036, T0276 |
| image | 16 | 16 | T0121, T0381 |
| 3D | 25 | 25 | T1436, T1437 |

**Historique des événements** — proposé : Journal — Même mot au Menu, dans le rail et dans les textes.

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| journal | 22 | 23 | T0017, T0030 |
| historique | 7 | 7 | T1030, T1035 |
| événement | 18 | 18 | T0039, T0122 |
| rapport texte / de simulation | 6 | 6 | T0570, T2009 |

**Réglages** — proposé : Réglages — Un seul mot pour tout ce qui se règle.

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| réglages | 57 | 64 | T0031, T0092 |
| paramètres | 20 | 21 | T0392, T0414 |
| configuration | 11 | 11 | T0679, T0680 |
| préférences | 5 | 5 | T0001, T0002 |
| options | 0 | 0 | – |
| profil | 78 | 84 | T0135, T0283 |

**État de la machine** — proposé : état (« État : prête / en alarme / hors ligne ») — « Rapport frais / périmé » est un mot de développeur : « information à jour » / « ancienne ».

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| état | 82 | 83 | T0009, T0010 |
| statut | 0 | 0 | – |
| rapport | 70 | 73 | T0143, T0182 |
| périmé / frais | 14 | 14 | T0337, T0926 |

**Où est la fraise** — proposé : position (« Position pièce » / « Position machine ») — « Coordonnées de travail » devient « position pièce ».

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| position | 68 | 69 | T0072, T0121 |
| coordonnées | 22 | 23 | T0060, T0068 |
| cote | 4 | 4 | T0397, T0669 |
| MPos / WPos | 2 | 3 | T3028, T3030 |

**Pièce et matière** — proposé : pièce (ce qu’on usine) · bloc (le bloc de palpage) — Un mot par objet physique.

| Mot employé | Textes | Occurrences | Exemples (id) |
|---|---:|---:|---|
| pièce | 15 | 16 | T0538, T0707 |
| bloc | 50 | 53 | T0748, T2204 |
| brut | 10 | 10 | T1638, T1650 |
| matière | 7 | 7 | T1478, T1481 |
| martyr | 0 | 0 | – |
| planche | 0 | 0 | – |

## 3. Les 60 pires textes pour l’opérateur

Regroupés par thème (§ 5.1 du prompt, alarmes, sonde, contrôle de course, déplacements, pilotage, reprise, réglages, Suivi). Choix : textes encore visibles, longs, techniques, qui bloquent ou qui se dédouanent, avec priorité aux écrans de l’opérateur (Préparer, Sonde, Fichiers, Suivi, Machine, Reprise). Les quatre textes du § 5.1 du prompt de mission ouvrent la liste. La réécriture est en français ; l’anglais et l’espagnol découlent du glossaire (§ 2.1) et se feront au lot L6.

Règles de réécriture appliquées : une cause ou une consigne par phrase ; verbe à l’impératif ; pas de nom de réglage Grbl, de code G ou M, de nom de module ni de fichier ; ce qui est technique passe dans « Détails » ; le bouton qui lève le refus est nommé quand il existe.

### 1. T0719 — Préparer > Sonde

- **Aujourd’hui** (96 caractères, aide) : Bornes de saisie du logiciel, pas des limites machine certifiées. Aucune valeur réelle inventée.
- **Pourquoi** : long, réserve, vocabulaire
- **Proposé** : (supprimer la phrase) ; sous le champ : la plage réelle, par exemple « de {min} à {max} mm ».
- **Détails / remarque** : Phrase de développeur : la plage suffit.

### 2. T2277 — Préparer > Sonde

- **Aujourd’hui** (140 caractères, aide) : Avant un palpage au bloc : touchez l’outil avec le bloc puis relâchez (contact vu, puis libre). Sans champ Pn, un rapport récent vaut libre.
- **Pourquoi** : long, technique, vocabulaire (sigle ou mot de développeur)
- **Proposé** : Test de la sonde : touchez la fraise avec le bloc. Le voyant passe à « contact ». Relâchez : il repasse à « libre ».
- **Détails / remarque** : Le champ Pn (signal de la carte) va dans Détails.

### 3. T2729 — Suivi

- **Aujourd’hui** (54 caractères, aide) : Acquitté = accepté par Grbl, pas nécessairement usiné.
- **Pourquoi** : technique, réserve, vocabulaire (mot de développeur (Grbl, v2…))
- **Proposé** : Reçu par la machine = envoyé. L’usinage peut avoir quelques lignes de retard.
- **Détails / remarque** : « Acquitté » devient « Reçu par la machine » partout.

### 4. T1905 — Préparer

- **Aujourd’hui** (123 caractères, aide) : Position machine incohérente avec la course ($23, $130–$132) : refaites la prise d’origine et faites vérifier les réglages.
- **Pourquoi** : long, technique (réglage Grbl ($nn))
- **Proposé** : La position de la machine ne colle plus. Refaites la prise d’origine machine.
- **Bouton sur place** : Prise d’origine machine
- **Détails / remarque** : Détails : $23, $130–$132.

### 5. T1258 — Machine

- **Aujourd’hui** (149 caractères, refus) : Hors course machine ($130–$132). Carte sans réponse : Reset dans CNCjs au PC. Vérifiez l’origine de travail et le programme, puis déverrouillez ($X).
- **Pourquoi** : long, technique, vocabulaire (réglage Grbl ($nn))
- **Proposé** : Arrêt de sécurité : la fraise sortait de la zone de la machine. La machine ne répond plus : faites Reset dans CNCjs sur le PC. Puis déverrouillez, refaites la prise d’origine machine et vérifiez le zéro pièce et le fichier.
- **Bouton sur place** : Déverrouiller
- **Détails / remarque** : Détails : alarme 2, $130–$132, la carte redémarre. Garde la consigne « Reset dans CNCjs au PC » du texte actuel ; un bouton Reset sur la tablette est une décision à prendre (chantier A).

### 6. T1256 — Machine

- **Aujourd’hui** (135 caractères, erreur) : Position perdue. Carte sans réponse : Reset dans CNCjs au PC. Dégagez l’axe (à la main, ou au jog après $X), puis prise d’origine ($H).
- **Pourquoi** : long, technique, vocabulaire (réglage Grbl ($nn))
- **Proposé** : Fin de course touchée : la position est perdue. La machine ne répond plus : faites Reset dans CNCjs sur le PC. Dégagez l’axe à la main, déverrouillez, puis refaites la prise d’origine machine.
- **Bouton sur place** : Déverrouiller
- **Détails / remarque** : Détails : alarme 1, $X, $H. Garde la consigne « Reset dans CNCjs au PC » du texte actuel.

### 7. T2837 — Machine

- **Aujourd’hui** (147 caractères, refus) : Valeurs transmises par Grbl via CNCjs ; « inconnu » : non reçue ou invalide. Le référencement activé ne signifie pas que la machine est référencée.
- **Pourquoi** : long, technique, réserve, sans remède, vocabulaire (mot de développeur (Grbl, v2…))
- **Proposé** : Réglages lus dans la machine. « — » = pas encore reçu.
- **Détails / remarque** : La phrase sur le « référencement activé » devient l’état « origine prise / à prendre » ; même texte en double (T0635).

### 8. T0310 — Commandes (Fichiers / Suivi)

- **Aujourd’hui** (173 caractères, erreur) : La carte a redémarré pendant le travail (arrêt d’urgence, alarme ou réinitialisation) : elle a perdu repère, unités et avance. Arrêtez le travail, puis reprenez à une ligne.
- **Pourquoi** : long, vocabulaire
- **Proposé** : La machine a redémarré en plein usinage : elle a perdu sa position. Arrêtez, refaites la prise d’origine machine, puis « Reprendre à la ligne N ».
- **Bouton sur place** : Prise d’origine machine
- **Détails / remarque** : Détails : repère, unités, avance perdus.

### 9. T1821 — Bandeau

- **Aujourd’hui** (134 caractères, erreur) : État machine perdu : Pause et Arrêter sont envoyés quand même (sans confirmation) ; les autres commandes attendent le retour du suivi.
- **Pourquoi** : long, sans remède
- **Proposé** : Plus d’information de la machine. Pause et Arrêter marchent toujours ; le reste attend le retour du signal.
- **Bouton sur place** : Reconnecter
- **Détails / remarque** : Sans confirmation = sans attendre.

### 10. T0192 — Commandes (Fichiers / Suivi)

- **Aujourd’hui** (202 caractères, aide) : Chargement et démarrage bloqués : le contrôleur est en ALARM. Consultez le message d’alarme dans CNCjs et résolvez sa cause. Quand la machine sera prête (Idle), chargez le fichier puis touchez Démarrer.
- **Pourquoi** : long, vocabulaire
- **Proposé** : La machine est en alarme. Déverrouillez, puis chargez le fichier et touchez Démarrer.
- **Bouton sur place** : Déverrouiller
- **Détails / remarque** : Plus de « ALARM », « Idle », « CNCjs ».

### 11. T0143 — Guide

- **Aujourd’hui** (200 caractères, refus) : Dans Machine, consultez Fraîcheur des données. Serveur connecté ne signifie pas rapport Grbl récent. Attendez le retour du suivi et d’un rapport récent ; une alarme doit être diagnostiquée dans CNCjs.
- **Pourquoi** : long, technique, réserve, vocabulaire (mot de développeur (Grbl, v2…))
- **Proposé** : Plus de réponse de la machine ? Ouvrez Machine : « information ancienne » = attendez ; « alarme » = déverrouillez.
- **Détails / remarque** : « Fraîcheur des données », « rapport Grbl » disparaissent.

### 12. T0678 — Préparer > Sonde

- **Aujourd’hui** (154 caractères, refus) : Ajout sans écraser les profils existants. Doublons identiques ignorés ; noms en conflit refusés. Les cotes importées restent à vérifier sur votre montage.
- **Pourquoi** : long, réserve, vocabulaire
- **Proposé** : Ajoute les profils du fichier sans toucher aux vôtres. Vérifiez les cotes importées sur votre montage.
- **Détails / remarque** : Doublons et noms en conflit : message après l’import.

### 13. T0709 — Préparer > Sonde

- **Aujourd’hui** (142 caractères, refus) : Ces dimensions appartiennent à la sonde. Le diamètre de l’outil est saisi séparément sur l’écran Palpage. Les valeurs inconnues restent vides.
- **Pourquoi** : long, sans remède
- **Proposé** : Dimensions de la sonde. Le diamètre de la fraise se règle sur l’écran de palpage. Laissez vide ce que vous ne savez pas.

### 14. T0778 — Préparer > Sonde

- **Aujourd’hui** (98 caractères, refus) : Le mode réel attend un adaptateur d’entrée sonde validé. Un état inconnu ne vaut jamais « libre ».
- **Pourquoi** : long, réserve, sans remède, vocabulaire
- **Proposé** : La machine ne donne pas l’état de la sonde. Voyant gris = on ne sait pas. Ne palpez pas avant d’avoir touché « Relire les réglages ».
- **Bouton sur place** : Relire les réglages
- **Détails / remarque** : « Adaptateur d’entrée sonde validé » : Détails.

### 15. T2353 — Préparer > Sonde

- **Aujourd’hui** (179 caractères, refus) : Z : recherche vers le bas sur le dessus du bloc. XYZ réel : ce coin et les sens fixent les faces extérieures touchées et les déplacements ; le serveur refuse un couple incohérent.
- **Pourquoi** : long, sans remède
- **Proposé** : Z : la fraise descend sur le dessus du bloc. XYZ : choisissez le coin du bloc ; la fraise touche ses deux faces extérieures.
- **Détails / remarque** : Dessin de la zone de départ à côté.

### 16. T2690 — Préparer > Sonde

- **Aujourd’hui** (231 caractères, refus) : Palpage XYZ : la face {axis} touchée n’est pas là où le départ la place (centre de l’outil au-dessus du bloc, à {window} mm au plus du bord). Paroi du trou ou mauvais coin : placez l’outil au-dessus du coin extérieur, loin du trou.
- **Pourquoi** : long
- **Proposé** : La fraise n’est pas au bon endroit. Placez-la au-dessus du coin extérieur du bloc, à moins de {window} mm du bord, loin des trous.
- **Bouton sur place** : Voir le dessin de départ

### 17. T2658 — Préparer > Sonde

- **Aujourd’hui** (132 caractères, refus) : Contact pendant un déplacement de liaison : un obstacle se trouve sur le trajet, ou l’outil n’était pas au-dessus du bloc au départ.
- **Pourquoi** : long, sans remède
- **Proposé** : La fraise a touché en passant d’une face à l’autre. Dégagez le passage, replacez la fraise au-dessus du coin, puis relancez.

### 18. T2293 — Préparer > Sonde

- **Aujourd’hui** (104 caractères, erreur) : Arrêt broche pendant un palpage : palpage interrompu, carte réinitialisée. Origine de travail inchangée.
- **Pourquoi** : long, sans remède, vocabulaire
- **Proposé** : La broche s’est arrêtée pendant le palpage : palpage coupé, machine redémarrée. Le zéro pièce n’a pas changé. Refaites la prise d’origine machine.
- **Bouton sur place** : Prise d’origine machine

### 19. T2292 — Préparer > Sonde

- **Aujourd’hui** (98 caractères, erreur) : Pause pendant un palpage : palpage interrompu, il ne se reprend pas. Origine de travail inchangée.
- **Pourquoi** : long, sans remède, vocabulaire
- **Proposé** : Pause pendant le palpage : il est annulé et ne reprend pas. Le zéro pièce n’a pas changé. Relancez le palpage.
- **Bouton sur place** : Relancer le palpage

### 20. T2660 — Préparer > Sonde

- **Aujourd’hui** (76 caractères, erreur) : Contact {axis} non confirmé par la carte (rapport PRB absent ou incohérent).
- **Pourquoi** : technique, sans remède, vocabulaire (sigle ou mot de développeur)
- **Proposé** : La machine n’a pas confirmé le contact {axis}. Recommencez ; si cela se répète, testez la sonde.
- **Bouton sur place** : Tester la sonde
- **Détails / remarque** : Détails : rapport PRB.

### 21. T2286 — Préparer > Sonde

- **Aujourd’hui** (66 caractères, refus) : Mode d’avance en temps inverse (G93) actif : le palpage exige G94.
- **Pourquoi** : technique, sans remède, vocabulaire (code G/M)
- **Proposé** : Un mode de vitesse inhabituel est actif (G93). Remettez-le normal (G94), puis palpez.
- **Détails / remarque** : Détails : G93 / G94.

### 22. T2653 — Fichiers

- **Aujourd’hui** (155 caractères, refus) : Sens de prise d’origine inversé ($23) en {axis} : selon la compilation du firmware, la course va de −${setting} à 0 ou de 0 à ${setting} ; axe non vérifié.
- **Pourquoi** : long, technique, réserve, sans remède (réglage Grbl ($nn), sigle ou mot de développeur)
- **Proposé** : Course de l’axe {axis} non vérifiée : cette machine prend son origine dans l’autre sens. Vérifiez à la main que le fichier tient.
- **Détails / remarque** : Détails : $23, compilation du firmware, −${setting}.

### 23. T2568 — Fichiers

- **Aujourd’hui** (131 caractères, refus) : Référencement non constaté depuis le dernier redémarrage de la carte ($22=1 signifie activé, pas effectué) : course non vérifiable.
- **Pourquoi** : long, technique, sans remède, vocabulaire (réglage Grbl ($nn))
- **Proposé** : Origine machine pas encore prise depuis le démarrage : course non vérifiable. Faites la prise d’origine machine.
- **Bouton sur place** : Prise d’origine machine
- **Détails / remarque** : Détails : $22=1 = activé, pas effectué.

### 24. T3067 — Fichiers

- **Aujourd’hui** (99 caractères, refus) : Limites logicielles Grbl actives ($20=1) : la carte refuserait elle-même un dépassement (alarme 2).
- **Pourquoi** : long, technique, sans remède, non traduit, vocabulaire (réglage Grbl ($nn), mot de développeur (Grbl, v2…))
- **Proposé** : La machine s’arrête d’elle-même (alarme) si le fichier sort de sa zone.
- **Détails / remarque** : Détails : $20=1, alarme 2. Texte aujourd’hui absent en EN et ES.

### 25. T2567 — Fichiers

- **Aujourd’hui** (82 caractères, refus) : Prise d’origine désactivée ($22=0) : les coordonnées machine ne sont pas repérées.
- **Pourquoi** : technique, sans remède, vocabulaire (réglage Grbl ($nn))
- **Proposé** : La prise d’origine est coupée dans la machine : la course ne peut pas être vérifiée. Activez-la depuis CNCjs sur le PC.
- **Détails / remarque** : Détails : $22=0.

### 26. T2580 — Fichiers

- **Aujourd’hui** (91 caractères, refus) : Hors course {axis} en coordonnées machine (G53) : {min} → {max} mm (course {low} → {high}).
- **Pourquoi** : long, technique, sans remède, vocabulaire (code G/M)
- **Proposé** : Le fichier sort de la machine en {axis} : il dépasse de {over} mm. Déplacez le zéro pièce ou raccourcissez le fichier.
- **Bouton sur place** : Voir le dessin
- **Détails / remarque** : Détails : G53, min, max, course. {over} est calculé par la page.

### 27. T2573 — Fichiers

- **Aujourd’hui** (109 caractères, refus) : Le programme commence en déplacements relatifs (G91) : parcours lié à la position de l’outil, non vérifiable.
- **Pourquoi** : long, technique, sans remède, vocabulaire (code G/M)
- **Proposé** : Le fichier part en déplacements relatifs : impossible de prévoir où il ira. Vérifiez avec le cadrage avant de lancer.
- **Détails / remarque** : Détails : G91.

### 28. T2575 — Fichiers

- **Aujourd’hui** (72 caractères, refus) : Repère actif inconnu (état $G trop ancien) : le programme utilise {wcs}.
- **Pourquoi** : technique, sans remède, vocabulaire (réglage Grbl ($nn))
- **Proposé** : On ne sait pas quel zéro pièce la machine utilise. Attendez son état, ou touchez « Relire l’état ».
- **Bouton sur place** : Relire l’état
- **Détails / remarque** : Détails : $G, {wcs}.

### 29. T2574 — Fichiers

- **Aujourd’hui** (106 caractères, refus) : Le programme utilise {wcs} alors que le repère actif est {active} et que ses décalages ($#) sont inconnus.
- **Pourquoi** : long, sans remède, vocabulaire
- **Proposé** : Le fichier utilise le zéro {wcs}, la machine est sur {active}, et ses valeurs ne sont pas lues. Touchez « Relire les réglages ».
- **Bouton sur place** : Relire les réglages
- **Détails / remarque** : Détails : $#.

### 30. T2906 — Fichiers

- **Aujourd’hui** (60 caractères, refus) : Correspondance inconnue : empreinte absente ou non vérifiée.
- **Pourquoi** : technique, réserve, sans remède (sigle ou mot de développeur)
- **Proposé** : Impossible de savoir si c’est le même fichier. Rechargez-le depuis Fichiers.
- **Bouton sur place** : Recharger
- **Détails / remarque** : Détails : empreinte.

### 31. T1443 — Fichiers

- **Aujourd’hui** (177 caractères, aide) : Trajets rapides G0 inclus. Départ supposé X0 Y0 Z0. Projection approximative : ce ne sont pas les dimensions de la pièce. Z minimum = passe la plus profonde, sous Z0 si négatif.
- **Pourquoi** : long, technique, réserve (code G/M)
- **Proposé** : Aperçu en projection, pas aux dimensions exactes de la pièce. Départ supposé au zéro pièce. Z min = la passe la plus profonde.
- **Détails / remarque** : Détails : G0, X0 Y0 Z0.

### 32. T2437 — Fichiers

- **Aujourd’hui** (96 caractères, refus) : Aperçu de reprise indisponible : le fichier a changé (empreinte différente de celle du serveur).
- **Pourquoi** : long, technique, sans remède (sigle ou mot de développeur)
- **Proposé** : Aperçu de reprise indisponible : le fichier a changé. Rechargez-le depuis Fichiers.
- **Bouton sur place** : Recharger
- **Détails / remarque** : Détails : empreinte.

### 33. T2943 — Fichiers

- **Aujourd’hui** (80 caractères, refus) : instructions après M2/M30 : Grbl les exécuterait, l’aperçu ne les montrerait pas
- **Pourquoi** : technique, non traduit (code G/M, mot de développeur (Grbl, v2…))
- **Proposé** : Des lignes suivent la fin du programme : la machine les exécuterait, l’aperçu ne les montre pas.
- **Détails / remarque** : Aujourd’hui en français dans les trois langues ; Détails : M2/M30.

### 34. T3023 — Préparer

- **Aujourd’hui** (76 caractères, refus) : Grbl {v.label} : le jog $J= et son annulation 0x85 exigent Grbl 1.1 ou plus.
- **Pourquoi** : technique, sans remède, non traduit (réglage Grbl ($nn), sigle ou mot de développeur, mot de développeur (Grbl, v2…))
- **Proposé** : Cette machine est trop ancienne pour les déplacements à la main (Grbl 1.1 minimum). Mettez-la à jour.
- **Détails / remarque** : Détails : $J=, 0x85. Texte absent en EN et ES.

### 35. T3032 — Préparer

- **Aujourd’hui** (251 caractères, état) : convention de course ambiguë à cette position ({axis} {fmt()}, bit $23 à 1 : {plausible.map().join()}) : aucun déplacement n’y est sûr dans les deux ; déplacez l’axe depuis l’interface classique et faites vérifier la convention (étape 0 de HANDOFF.md)
- **Pourquoi** : long, technique, non traduit (réglage Grbl ($nn))
- **Proposé** : Position ambiguë de l’axe {axis}. Déplacez-le à la main, loin des fins de course, puis refaites la prise d’origine machine.
- **Bouton sur place** : Prise d’origine machine
- **Détails / remarque** : Renvoie aujourd’hui à « l’étape 0 de HANDOFF.md » : un fichier de développeur.

### 36. T3038 — Préparer

- **Aujourd’hui** (135 caractères, refus) : Pas de {fmt()} mm refusé : au-delà de {MAX_UNREFERENCED_STEP_MM} mm, il faut une machine référencée et une course connue ({at.reason}).
- **Pourquoi** : long, sans remède, non traduit, vocabulaire
- **Proposé** : Pas de {step} mm refusé. Au-delà de {max} mm, faites d’abord la prise d’origine machine.
- **Bouton sur place** : Prise d’origine machine
- **Détails / remarque** : Détails : « course connue ». Texte absent en EN et ES.

### 37. T1739 — Préparer

- **Aujourd’hui** (84 caractères, refus) : Rapports en pouces ($13=1) ou réglage $13 inconnu : le déplacement réel exige $13=0.
- **Pourquoi** : technique, sans remède, vocabulaire (réglage Grbl ($nn))
- **Proposé** : La machine donne ses positions en pouces. Remettez-la en millimètres pour déplacer à la main.
- **Détails / remarque** : Détails : $13=0.

### 38. T1744 — Préparer

- **Aujourd’hui** (78 caractères, refus) : Repère de travail inconnu ou état $G trop ancien : attendez un rapport récent.
- **Pourquoi** : technique, vocabulaire (réglage Grbl ($nn))
- **Proposé** : Zéro pièce inconnu. Attendez quelques secondes : la machine donne son état.
- **Détails / remarque** : Détails : $G.

### 39. T1747 — Préparer

- **Aujourd’hui** (85 caractères, refus) : Version Grbl inconnue : attendez la bannière de démarrage ou lisez les réglages ($I).
- **Pourquoi** : technique (réglage Grbl ($nn), mot de développeur (Grbl, v2…))
- **Proposé** : Version de la machine inconnue. Touchez « Relire les réglages ».
- **Bouton sur place** : Relire les réglages
- **Détails / remarque** : Détails : $I, bannière de démarrage.

### 40. T2982 — Bandeau

- **Aujourd’hui** (149 caractères, état) : Pilotage de {port} attribué à {describeOwner()} : Pause et Arrêt restent possibles ; prenez le pilotage avec un motif ou attendez la fin de son bail.
- **Pourquoi** : long, technique, non traduit, vocabulaire (sigle ou mot de développeur)
- **Proposé** : {owner} a la main sur la machine. Pause et Arrêter marchent toujours. Touchez « Prendre la main », ou attendez qu’il la rende.
- **Bouton sur place** : Prendre la main
- **Détails / remarque** : Détails : bail, port. Texte absent en EN et ES.

### 41. T2984 — Commandes (Fichiers / Suivi)

- **Aujourd’hui** (93 caractères, refus) : Pilotage de {port} attribué à {describeOwner()} : commande système refusée tant qu’il pilote.
- **Pourquoi** : long, sans remède, non traduit, vocabulaire
- **Proposé** : {owner} a la main : commande refusée. Prenez d’abord la main.
- **Bouton sur place** : Prendre la main
- **Détails / remarque** : Texte absent en EN et ES.

### 42. T2609 — Commandes (Fichiers / Suivi)

- **Aujourd’hui** (164 caractères, refus) : Travail, pause, chargement, prise d’origine, palpage, déplacement, commande en attente ou commande système en cours : type de machine modifiable seulement au repos.
- **Pourquoi** : long, sans remède, vocabulaire
- **Proposé** : Changez le type de machine à l’arrêt complet : attendez la fin de l’action en cours.
- **Détails / remarque** : La liste des cas va dans Détails.

### 43. T2624 — Commandes (Fichiers / Suivi)

- **Aujourd’hui** (131 caractères, refus) : Cadrage refusé : la vérification de course du programme doit être validée en X et Y (machine référencée, programme dans la course).
- **Pourquoi** : long, sans remède, vocabulaire
- **Proposé** : Cadrage refusé : le fichier doit tenir dans la machine. Faites la prise d’origine machine, puis contrôlez le fichier.
- **Bouton sur place** : Contrôler le fichier

### 44. T2056 — Commandes (Fichiers / Suivi)

- **Aujourd’hui** (150 caractères, aide) : Le cadrage déplace la tête en XY autour du programme chargé, à la hauteur actuelle, laser éteint (M5 envoyé d’abord). Arrêter interrompt le mouvement.
- **Pourquoi** : long, technique, vocabulaire (code G/M)
- **Proposé** : Le cadrage fait le tour du fichier au-dessus de la pièce, laser éteint. Arrêter l’interrompt.
- **Détails / remarque** : Détails : M5 envoyé d’abord.

### 45. T2602 — Réglages

- **Aujourd’hui** (140 caractères, refus) : Mode laser actif sur la carte ($32=1) alors que cette machine n’est pas déclarée laser : opérations CNC qui font tourner la broche bloquées.
- **Pourquoi** : long, technique, sans remède, vocabulaire (réglage Grbl ($nn))
- **Proposé** : Le laser est allumé dans la machine, mais elle est déclarée CNC : les actions qui font tourner la broche sont bloquées. Changez le type de machine.
- **Bouton sur place** : Type de machine
- **Détails / remarque** : Détails : $32=1.

### 46. T2622 — Réglages

- **Aujourd’hui** (133 caractères, refus) : Cadrage indisponible : déplacements réels non activés ou non pris en charge par cette carte (touch.motion.enabled, Grbl 1.1 ou plus).
- **Pourquoi** : long, technique, sans remède, vocabulaire (mot de développeur (Grbl, v2…))
- **Proposé** : Cadrage indisponible sur cette machine. Mettez-la à jour (Grbl 1.1 minimum) et activez les déplacements dans CNCjs.
- **Détails / remarque** : Détails : touch.motion.enabled.

### 47. T2497 — Suivi

- **Aujourd’hui** (144 caractères, aide) : Pause : la consigne S reste active. En mode laser ($32=1), Grbl coupe l’émission tant que les axes sont arrêtés ; gardez la protection en place.
- **Pourquoi** : long, technique (réglage Grbl ($nn), mot de développeur (Grbl, v2…))
- **Proposé** : Pause : le laser reste réglé. À l’arrêt des axes il n’émet plus, mais gardez la protection en place.
- **Détails / remarque** : Détails : $32=1.

### 48. T3054 — Suivi

- **Aujourd’hui** (107 caractères, refus) : Mode de déplacement {expr} actif : pendant une pause, le zéro Z avec plaque exige G0 ou G1 avec une avance.
- **Pourquoi** : long, technique, sans remède, non traduit, vocabulaire (code G/M)
- **Proposé** : Zéro Z à la plaque impossible pendant cette pause. Arrêtez l’usinage, puis recommencez.
- **Détails / remarque** : Détails : G0 / G1. Texte absent en EN et ES.

### 49. T2651 — Reprise à une ligne

- **Aujourd’hui** (147 caractères, refus) : Mode de distance (G90/G91) non fixé avant le premier déplacement du programme (ligne {line}) : le mode de la carte est inconnu, reprise impossible.
- **Pourquoi** : long, technique, sans remède, vocabulaire (code G/M)
- **Proposé** : Le fichier ne dit pas s’il compte en absolu ou en relatif. Reprise impossible : reprenez au début.
- **Détails / remarque** : Détails : G90 / G91, ligne {line}.

### 50. T2648 — Reprise à une ligne

- **Aujourd’hui** (115 caractères, refus) : Fin de programme (M2/M30) à la ligne {line} avant la ligne {from} : la carte y remet ses modes, reprise impossible.
- **Pourquoi** : long, technique, sans remède, vocabulaire (code G/M)
- **Proposé** : Le fichier se termine à la ligne {line}, avant la ligne {from} : la machine y remet ses modes. Choisissez une ligne après.
- **Détails / remarque** : Détails : M2 / M30.

### 51. T2645 — Reprise à une ligne

- **Aujourd’hui** (141 caractères, refus) : Plan de travail (G17/G18/G19) non fixé avant la ligne {from} et arc (G2/G3) à la ligne {line} : plan de la carte inconnu, reprise impossible.
- **Pourquoi** : long, technique, sans remède, vocabulaire (code G/M)
- **Proposé** : Le fichier ne précise pas son plan avant le premier arc : reprise impossible. Reprenez au début.
- **Détails / remarque** : Détails : G17/G18/G19, G2/G3.

### 52. T2560 — Reprise à une ligne

- **Aujourd’hui** (169 caractères, refus) : Le programme change de repère ({wcs} à la ligne {line}) : X, Y et Z doivent être redonnés en absolu sous ce repère avant la ligne {from}. Choisissez une ligne plus loin.
- **Pourquoi** : long, vocabulaire
- **Proposé** : Le fichier change de zéro pièce ({wcs}) à la ligne {line}. Choisissez une ligne située après ce changement.

### 53. T2563 — Reprise à une ligne

- **Aujourd’hui** (151 caractères, refus) : Hauteur de dégagement inconnue avant la ligne {from} (aucun déplacement rapide G0 en Z[ sous {wcs}]) : choisissez une ligne après un retrait en rapide.
- **Pourquoi** : long, technique, doublon (code G/M)
- **Proposé** : Aucune remontée rapide avant la ligne {from}. Choisissez une ligne située après une remontée de la fraise.
- **Détails / remarque** : Doublon exact : T3097 (texte serveur, absent en EN et ES).

### 54. T2148 — Réglages

- **Aujourd’hui** (222 caractères, refus) : Réseau de l’ordinateur du serveur CNCjs (cette tablette en mode kiosque). Changer de réseau coupe la liaison quelques secondes : refusé pendant un travail. Le mot de passe est enregistré par le système, pas par cette page.
- **Pourquoi** : long, technique, sans remède, vocabulaire (sigle ou mot de développeur)
- **Proposé** : Réseau Wi-Fi de la tablette. Le changer coupe la liaison quelques secondes ; impossible pendant un usinage.
- **Détails / remarque** : Le mot de passe est géré par le système : Détails.

### 55. T2207 — Réglages

- **Aujourd’hui** (254 caractères, refus) : Mises à jour Debian de l’ordinateur du serveur CNCjs (cette tablette en mode kiosque), sans changement de version. Refusé pendant un travail ; la machine reste bloquée pendant l’installation, qui peut durer plusieurs minutes : n’éteignez pas la tablette.
- **Pourquoi** : long, technique, vocabulaire (sigle ou mot de développeur)
- **Proposé** : Mises à jour du système de la tablette. Impossible pendant un usinage. L’installation dure quelques minutes : n’éteignez pas la tablette.
- **Détails / remarque** : Détails : Debian, serveur CNCjs.

### 56. T3111 — Réglages

- **Aujourd’hui** (137 caractères, refus) : Droits administrateur manquants : l’utilisateur du serveur CNCjs ne peut pas lancer apt sans mot de passe. Faites la mise à jour par SSH.
- **Pourquoi** : long, technique, sans remède, non traduit (sigle ou mot de développeur)
- **Proposé** : Mise à jour impossible depuis la tablette. Demandez qu’on la lance par SSH.
- **Détails / remarque** : Détails : apt, sudo. Texte absent en EN et ES.

### 57. T3125 — Réglages

- **Aujourd’hui** (96 caractères, refus) : Gestion du Wi-Fi indisponible : NetworkManager (nmcli) absent sur l’ordinateur du serveur CNCjs.
- **Pourquoi** : long, technique, sans remède, non traduit (sigle ou mot de développeur)
- **Proposé** : Wi-Fi indisponible sur cette tablette.
- **Détails / remarque** : Détails : NetworkManager (nmcli) absent. Texte absent en EN et ES.

### 58. T2491 — Suivi

- **Aujourd’hui** (88 caractères, aide) : Tracé orange : lignes acquittées par Grbl (acceptées, pas forcément usinées), indicatif.
- **Pourquoi** : technique, réserve, vocabulaire (mot de développeur (Grbl, v2…))
- **Proposé** : Trait orange : lignes reçues par la machine (indicatif).
- **Détails / remarque** : « Acquitté » → « reçu ».

### 59. T2388 — Fichiers

- **Aujourd’hui** (66 caractères, erreur) : Contexte WebGL perdu : vue 3D libre fermée, vues fixes conservées.
- **Pourquoi** : technique, sans remède (sigle ou mot de développeur)
- **Proposé** : La vue 3D libre s’est fermée : la carte graphique de la tablette n’est plus disponible. Les vues fixes restent affichées.
- **Détails / remarque** : Détails : contexte WebGL.

### 60. T1987 — Démarrage / page

- **Aujourd’hui** (192 caractères, aide) : Commandes réelles : Déverrouiller ($X) et Prise d’origine ($H) sur cet écran, chacune avec sa confirmation ; déplacements et zéros de travail depuis Préparer ; zéro Z avec plaque depuis Suivi.
- **Pourquoi** : long, technique, vocabulaire (réglage Grbl ($nn))
- **Proposé** : Machine : Déverrouiller, Prise d’origine machine. Préparer : déplacements et zéros. Suivi : zéro Z à la plaque.
- **Détails / remarque** : À réécrire quand les fonctions sont regroupées (principe 2).

## 4. Les refus

### 4.1 Comment la page les montre aujourd’hui

- Le serveur répond HTTP 409 avec `{ message, code?, params?, reasons? }` (`api.touch.js`). `job-controls.js:serverRefusal` fabrique l’erreur : `cncI18n.format(code, params, message)`, plus jusqu’à 3 « raisons » codées.
- Selon le journal de terrain (T6), le refus est écrit en petit au-dessus d’un bouton qui reste actif ; dans le code, aucune phrase de refus n’est attachée à un bouton remède (je n’ai pas ouvert l’écran pour le constater).
- Pilotage : `ECONTROL` (409) a son propre texte (`controlRefusal`), construit côté page : « Refusé : pilotage attribué à « … » ». Les fiches projets (`/api/touch-projects`, `answerProjects`) renvoient `{ message, code }` avec des codes de type système (`EINVALID`, `EINVALIDNAME`, `ENOENT`, `ECHANGED`, `EOTHERVERSION`, `ENOORIGINAL`, `ETOOLARGE`, `ETOOMANY`, `ENOTCONFIGURED`, `ECORRUPT`) : ce sont aussi des refus à habiller ; leurs messages français sont dans le § 4.3 (lignes `projects.js`, `job-load.js`) et ne sont pas traduits.

### 4.2 Les 140 codes `ETOUCH_*`

Colonnes : code ; écran où le refus apparaît ; phrase française affichée aujourd’hui (modèle du catalogue) ; proposition « cause + remède » ; bouton à poser sur place (à valider dans la spec). `{over}` est un nombre à calculer par la page (dépassement en mm) ; les autres `{valeurs}` sont les paramètres du serveur. Les propositions reprennent le glossaire du § 2.

| Code | Écran | Phrase aujourd’hui | Proposition (cause + remède) | Bouton remède |
|---|---|---|---|---|
| `ETOUCH_RESUME_LINE` | Reprise à une ligne | Ligne de reprise invalide : choisissez entre {min} et {max}. | Cette ligne n’existe pas. Choisissez une ligne entre {min} et {max}. | Champ « ligne » (focus) |
| `ETOUCH_RESUME_ORIGIN_CHANGED` | Reprise à une ligne | Le programme change l’origine (G10/G92) avant la ligne {from} (ligne {line}) : reprise impossible. *(sans remède, technique)* | Le fichier change le zéro pièce à la ligne {line}, avant la ligne {from}. Reprenez avant cette ligne, ou au début. | Reprendre au début |
| `ETOUCH_RESUME_EXPRESSION` | Reprise à une ligne | Expression ou macro CNCjs à la ligne {line} avant la ligne {from} : reprise impossible. *(sans remède)* | La ligne {line} contient une formule CNCjs que la reprise ne sait pas refaire. Reprenez au début. | Reprendre au début |
| `ETOUCH_RESUME_INVERSE_TIME` | Reprise à une ligne | Avance inverse du temps (G93) avant la ligne {from} : reprise impossible. *(sans remède, technique)* | Le fichier utilise un mode de vitesse inhabituel (G93) avant la ligne {from}. Reprenez au début. | Reprendre au début |
| `ETOUCH_RESUME_CUTTER_COMPENSATION` | Reprise à une ligne | Compensation de rayon d’outil (G41/G42) à la ligne {line} : non rejouée, reprise impossible. *(sans remède, technique)* | Le fichier compense le rayon de la fraise (G41/G42) à la ligne {line} : la reprise ne sait pas le refaire. Reprenez au début. | Reprendre au début |
| `ETOUCH_RESUME_TOOL_LENGTH` | Reprise à une ligne | Décalage de longueur d’outil (G43) à la ligne {line} : non rejoué, reprise impossible. *(sans remède, technique)* | Le fichier corrige la longueur d’outil (G43) à la ligne {line} : la reprise ne sait pas le refaire. Reprenez au début. | Reprendre au début |
| `ETOUCH_RESUME_UNITS_LATE` | Reprise à une ligne | Le programme fixe ses unités ({units}) à la ligne {line} après des déplacements faits dans les unités de la machine : reprise impossible. *(sans remède)* | Le fichier choisit ses unités ({units}) à la ligne {line}, après avoir déjà bougé. Reprenez au début. | Reprendre au début |
| `ETOUCH_RESUME_RELATIVE` | Reprise à une ligne | Le programme est en coordonnées relatives (G91) à la ligne {from} : reprise impossible. *(sans remède, technique)* | Le fichier compte en relatif à la ligne {from} : la reprise ne peut pas savoir où il en est. Reprenez au début. | Reprendre au début |
| `ETOUCH_RESUME_TOOL_OFFSET_ACTIVE` *(jamais émis)* | (aucun) | Décalage de longueur d’outil (G43.1) actif depuis la ligne {line} : non rejoué, reprise impossible avant son annulation (G49). *(sans remède, technique)* | Une correction de longueur d’outil (G43.1) est active depuis la ligne {line} : annulez-la (G49), ou reprenez au début. | Reprendre au début |
| `ETOUCH_RESUME_WCS_POSITION` | Reprise à une ligne | Le programme change de repère ({wcs} à la ligne {line}) : X, Y et Z doivent être redonnés en absolu sous ce repère avant la ligne {from}. Choisissez une ligne plus loin. | Le fichier change de zéro pièce ({wcs}) à la ligne {line}. Choisissez une ligne située après ce changement. | Champ « ligne » (focus) |
| `ETOUCH_RESUME_POSITION` | Reprise à une ligne | Position avant la ligne {from} inconnue (X, Y et Z doivent avoir été donnés en absolu) : choisissez une ligne plus loin. | On ne sait pas où était la fraise avant la ligne {from}. Choisissez une ligne plus loin, après un déplacement complet en X, Y et Z. | Champ « ligne » (focus) |
| `ETOUCH_RESUME_CLEARANCE` | Reprise à une ligne | Hauteur de dégagement inconnue avant la ligne {from} : choisissez une ligne plus loin. | On ne sait pas à quelle hauteur remonter avant la ligne {from}. Choisissez une ligne plus loin. | Champ « ligne » (focus) |
| `ETOUCH_RESUME_NO_RAPID_Z` | Reprise à une ligne | Hauteur de dégagement inconnue avant la ligne {from} (aucun déplacement rapide G0 en Z[ sous {wcs}]) : choisissez une ligne après un retrait en rapide. *(technique)* | Aucune remontée rapide avant la ligne {from}. Choisissez une ligne située après une remontée de la fraise. | Champ « ligne » (focus) |
| `ETOUCH_RESUME_FEED` | Reprise à une ligne | Avance inconnue avant la ligne {from} : choisissez une ligne plus loin. | La vitesse d’usinage n’est pas encore donnée avant la ligne {from}. Choisissez une ligne plus loin. | Champ « ligne » (focus) |
| `ETOUCH_RESUME_SPINDLE_SPEED` | Reprise à une ligne | Vitesse de broche inconnue avant la ligne {from} : reprise impossible. *(sans remède)* | La vitesse de broche n’est pas encore donnée avant la ligne {from}. Choisissez une ligne plus loin, ou reprenez au début. | Champ « ligne » (focus) |
| `ETOUCH_CHECK_HOMING_SETTING` | Fichiers | Réglage $22 inconnu : relisez les réglages de la carte. *(technique)* | La machine n’a pas dit si elle sait prendre son origine. Touchez « Relire les réglages ». | Relire les réglages |
| `ETOUCH_CHECK_HOMING_DISABLED` | Fichiers | Prise d’origine désactivée ($22=0) : les coordonnées machine ne sont pas repérées. *(sans remède, technique)* | La prise d’origine est coupée dans la machine : la course ne peut pas être vérifiée. Activez-la depuis CNCjs sur le PC. | Détails |
| `ETOUCH_CHECK_NOT_HOMED` | Fichiers | Référencement non constaté depuis le dernier redémarrage de la carte ($22=1 signifie activé, pas effectué) : course non vérifiable. *(sans remède, technique)* | Origine machine pas encore prise depuis le démarrage : course non vérifiable. Faites la prise d’origine machine. | Prise d’origine machine |
| `ETOUCH_CHECK_REPORT_INCHES` | Fichiers | Positions rapportées en pouces ($13=1) : comparaison non faite. *(sans remède, technique)* | La machine donne ses positions en pouces : la course ne peut pas être vérifiée. Remettez-la en millimètres. | Détails |
| `ETOUCH_CHECK_REPORT_UNITS` | Fichiers | Unités des rapports ($13) inconnues. *(sans remède, technique)* | La machine n’a pas dit en quelle unité elle compte. Touchez « Relire les réglages ». | Relire les réglages |
| `ETOUCH_CHECK_UNITS_UNKNOWN` | Fichiers | Le programme ne fixe pas ses unités (G20/G21) et l’état modal de la machine est inconnu. *(sans remède, technique)* | Ni le fichier ni la machine ne disent si on compte en mm ou en pouces. Touchez « Relire l’état », ou ajoutez G21 au fichier. | Relire l’état |
| `ETOUCH_CHECK_DISTANCE_UNKNOWN` | Fichiers | Le programme ne fixe pas son mode (G90/G91) et la machine n’est pas en G90 connu. *(sans remède, technique)* | Ni le fichier ni la machine ne disent si on compte en absolu. Touchez « Relire l’état », ou ajoutez G90 au fichier. | Relire l’état |
| `ETOUCH_CHECK_RELATIVE_START` | Fichiers | Le programme commence en déplacements relatifs (G91) : parcours lié à la position de l’outil, non vérifiable. *(sans remède, technique)* | Le fichier part en déplacements relatifs : impossible de prévoir où il ira. Vérifiez avec le cadrage avant de lancer. | Cadrage |
| `ETOUCH_CHECK_WCS_OFFSET_UNKNOWN` | Fichiers | Le programme utilise {wcs} alors que le repère actif est {active} et que ses décalages ($#) sont inconnus. *(sans remède)* | Le fichier utilise le zéro {wcs}, la machine est sur {active}, et ses valeurs ne sont pas lues. Touchez « Relire les réglages ». | Relire les réglages |
| `ETOUCH_CHECK_ACTIVE_WCS_UNKNOWN` | Fichiers | Repère actif inconnu (état $G trop ancien) : le programme utilise {wcs}. *(sans remède, technique)* | On ne sait pas quel zéro pièce la machine utilise. Attendez son état, ou touchez « Relire l’état ». | Relire l’état |
| `ETOUCH_CHECK_AXIS_IDLE` | Fichiers | Axe {axis} non sollicité par le programme. *(sans remède)* | Le fichier ne bouge pas l’axe {axis} : rien à vérifier. |  |
| `ETOUCH_CHECK_TRAVEL_UNKNOWN` | Fichiers | Course ${setting} inconnue. | La course de la machine sur cet axe n’est pas connue. Touchez « Relire les réglages ». | Relire les réglages |
| `ETOUCH_CHECK_POSITION_UNKNOWN` | Fichiers | Position machine ou de travail {axis} inconnue. *(sans remède)* | La position de l’axe {axis} est inconnue. Attendez l’état de la machine, ou faites la prise d’origine machine. | Prise d’origine machine |
| `ETOUCH_CHECK_OUTSIDE` | Fichiers | Hors course {axis} : {min} → {max} mm machine (course {low} → {high}). *(sans remède)* | Le fichier sort de la machine en {axis} : il dépasse de {over} mm. Déplacez le zéro pièce ou raccourcissez le fichier. | Voir le dessin / Régler le zéro pièce |
| `ETOUCH_CHECK_OUTSIDE_G53` | Fichiers | Hors course {axis} en coordonnées machine (G53) : {min} → {max} mm (course {low} → {high}). *(sans remède, technique)* | Le fichier sort de la machine en {axis} : il dépasse de {over} mm. Déplacez le zéro pièce ou raccourcissez le fichier. | Voir le dessin / Régler le zéro pièce |
| `ETOUCH_CHECK_MACRO` | Fichiers | Macro ou expression CNCjs à la ligne {line} : contenu non prévisible. *(sans remède)* | La ligne {line} contient une formule CNCjs : impossible de prévoir où elle ira. Contrôlez le fichier sur le PC. |  |
| `ETOUCH_CHECK_UNINTERPRETED` | Fichiers | Code {code} (ligne {line}) non interprété. *(sans remède)* | La ligne {line} ({code}) n’est pas comprise par le contrôle de course : ne comptez pas dessus. |  |
| `ETOUCH_CHECK_UNITS_LATE` | Fichiers | Unités fixées ({code}) à la ligne {line} après des déplacements faits dans les unités de la machine. *(sans remède)* | Le fichier change d’unités à la ligne {line}, après avoir bougé : le contrôle de course est partiel. |  |
| `ETOUCH_CHECK_WCS_CHANGE` | Fichiers | Le programme change de repère (ligne {line}) : une seule origine de travail peut être vérifiée. *(sans remède)* | Le fichier change de zéro pièce à la ligne {line} : le contrôle ne vaut que pour un seul zéro. |  |
| `ETOUCH_CHECK_ORIGIN_CHANGE` | Fichiers | Le programme modifie l’origine ({code} ligne {line}) : position de travail non prévisible. *(sans remède)* | Le fichier déplace le zéro pièce à la ligne {line} ({code}) : impossible de prévoir la position après. |  |
| `ETOUCH_CHECK_DYNAMIC_TLO` | Fichiers | Décalage d’outil dynamique (G43.1 ligne {line}) : position Z non prévisible. *(sans remède, technique)* | Le fichier corrige la hauteur de l’outil en cours de route (ligne {line}) : le contrôle de Z est partiel. |  |
| `ETOUCH_CHECK_PROBE` | Fichiers | Palpage (G38 ligne {line}) : la position {axis} dépend du contact. *(sans remède, technique)* | Le fichier palpe à la ligne {line} : la position {axis} dépend du contact. Contrôle partiel. |  |
| `ETOUCH_CHECK_RETURN_INTERMEDIATE` | Fichiers | Retour {code} par un point intermédiaire {axis} (ligne {line}) : non suivi. *(sans remède)* | Le retour {code} passe par un point intermédiaire (ligne {line}) : non suivi par le contrôle de course. |  |
| `ETOUCH_CHECK_NO_MOTION_MODE` | Fichiers | Mot d’axe {axis} sans mode de déplacement (ligne {line}) : exécuté dans le mode modal de la carte, non suivi. *(sans remède)* | La ligne {line} déplace l’axe {axis} sans dire comment : le contrôle de course ne la suit pas. |  |
| `ETOUCH_CHECK_RELATIVE_FROM_UNKNOWN` | Fichiers | Déplacement relatif (G91 ligne {line}) depuis une position {axis} inconnue. *(sans remède, technique)* | La ligne {line} se déplace en relatif depuis une position {axis} inconnue : contrôle partiel. |  |
| `ETOUCH_CHECK_ARC_PLANE` | Fichiers | Arc hors plan XY ou en centre absolu (ligne {line}) : non interprété. *(sans remède)* | L’arc de la ligne {line} n’est pas dans le plan XY : le contrôle de course ne le suit pas. |  |
| `ETOUCH_CHECK_ARC_FROM_UNKNOWN` | Fichiers | Arc (ligne {line}) depuis une position XY inconnue. *(sans remède)* | L’arc de la ligne {line} part d’une position XY inconnue : contrôle partiel. |  |
| `ETOUCH_CHECK_ARC_RADIUS` | Fichiers | Arc impossible (rayon trop court, ligne {line}). *(sans remède)* | L’arc de la ligne {line} est impossible (rayon trop court). Corrigez le fichier dans Vectric. |  |
| `ETOUCH_MOTION_ALARM` | Préparer | Machine en alarme[ (ALARM:{alarm})] : déverrouillez ($X) ou référencez ($H) d’abord. *(technique)* | La machine est en alarme. Déverrouillez, puis refaites la prise d’origine machine. | Déverrouiller |
| `ETOUCH_MOTION_STATE` | Préparer | La machine doit être au repos (Idle) : état {state}. *(sans remède)* | La machine n’est pas au repos (état : {state}). Attendez la fin du mouvement. |  |
| `ETOUCH_MOTION_SPINDLE_STEP` | Préparer | Broche en rotation : pas de {max} mm au plus (maintien continu refusé). Arrêtez la broche (M5) pour de plus grands déplacements. *(technique)* | La broche tourne : déplacements limités à {max} mm. Arrêtez la broche pour aller plus loin. | Arrêter la broche |
| `ETOUCH_MOTION_STEP_OUTSIDE` | Préparer | Pas refusé : {axis} sortirait de la course ({target} mm machine, course {low} → {high}). *(sans remède)* | Ce pas sortirait de la machine en {axis}. Prenez un pas plus petit ou l’autre sens. |  |
| `ETOUCH_MOTION_STEP_SLOW` | Préparer | Pas trop lent : {step} mm à {feed} mm/min durerait {seconds} s ({max} s au plus). Augmentez l’avance ou réduisez le pas. | Ce pas serait trop lent ({seconds} s). Augmentez la vitesse ou prenez un pas plus petit. | Vitesse… |
| `ETOUCH_MOTION_EDGE` | Préparer | Fin de course proche : pas de maintien continu vers {axis}{direction} ({room} mm disponibles). *(sans remède)* | La fraise est près de la limite ({room} mm). Utilisez les pas, pas le maintien du doigt. |  |
| `ETOUCH_MOTION_WCS_CHANGED` | Préparer | Le repère actif a changé depuis la confirmation ({from} → {to}) : confirmez à nouveau. | Le zéro pièce a changé ({from} → {to}) depuis votre confirmation. Confirmez à nouveau. | Confirmer |
| `ETOUCH_MOTION_POSITION_UNKNOWN` | Préparer | Position machine {axis} inconnue. | La position de l’axe {axis} est inconnue. Faites la prise d’origine machine. | Prise d’origine machine |
| `ETOUCH_MACHINE_LASER_MODE_ON` | Réglages | Mode laser actif sur la carte ($32=1) alors que cette machine n’est pas déclarée laser : opérations CNC qui font tourner la broche bloquées. *(sans remède, technique)* | Le laser est allumé dans la machine, mais elle est déclarée CNC : les actions qui font tourner la broche sont bloquées. Changez le type de machine. | Type de machine |
| `ETOUCH_MACHINE_LASER_MODE_OFF` | Réglages | Machine déclarée laser mais mode laser de la carte inactif ou inconnu ($32 différent de 1) : opérations laser qui peuvent émettre bloquées. *(sans remède, technique)* | La machine est déclarée laser, mais son mode laser est coupé : les actions laser sont bloquées. Changez le type de machine, ou activez le mode laser. | Type de machine |
| `ETOUCH_MACHINE_AMBIGUOUS` | Réglages | Plusieurs fiches machine ({count}) ont la signature de cette carte : oubliez-les puis déclarez le type à nouveau. | Plusieurs fiches correspondent à cette machine. Oubliez-les, puis choisissez CNC ou laser. | Oublier les fiches |
| `ETOUCH_MACHINE_SETTINGS_UNKNOWN` | Réglages | Version ou réglages de la carte ($$) non lus : lisez les réglages avant de déclarer le type de machine. *(technique)* | Les réglages de la machine ne sont pas lus. Touchez « Relire les réglages », puis choisissez le type. | Relire les réglages |
| `ETOUCH_MACHINE_CONNECTION` | Commandes (Fichiers / Suivi) | Connexion machine indisponible : type de machine non modifié. *(sans remède)* | La machine n’est pas connectée. Connectez-la d’abord. | Connecter la CNC |
| `ETOUCH_MACHINE_STALE` | Commandes (Fichiers / Suivi) | État machine trop ancien : attendez un rapport récent avant de changer le type de machine. | L’état de la machine est ancien. Attendez quelques secondes, puis recommencez. |  |
| `ETOUCH_MACHINE_NOT_IDLE` | Commandes (Fichiers / Suivi) | La machine doit être au repos (Idle) pour changer son type : état {state}. *(sans remède)* | La machine n’est pas au repos (état : {state}). Attendez la fin de l’action en cours. |  |
| `ETOUCH_MACHINE_BUSY` | Commandes (Fichiers / Suivi) | Travail, pause, chargement, prise d’origine, palpage, déplacement, commande en attente ou commande système en cours : type de machine modifiable seulement au repos. *(sans remède)* | Une action est en cours (usinage, palpage, déplacement…). Changez le type de machine quand tout est arrêté. |  |
| `ETOUCH_MACHINE_CONTROLLER_CHANGED` | Commandes (Fichiers / Suivi) | Le contrôleur a changé ou son identité manque. Choisissez-le à nouveau. | La machine connectée a changé. Choisissez-la à nouveau. | Connecter la CNC |
| `ETOUCH_MACHINE_TRANSPORT` | Commandes (Fichiers / Suivi) | Connexion de suivi interrompue. Confirmez à nouveau. | La liaison avec la machine s’est coupée. Confirmez à nouveau. | Confirmer |
| `ETOUCH_MACHINE_KIND_INVALID` | Commandes (Fichiers / Suivi) | Type de machine invalide : choisissez CNC ou laser. | Choisissez CNC ou laser. | CNC / Laser |
| `ETOUCH_MACHINE_NOT_ASSOCIATED` | Réglages | Aucune fiche machine associée à cette carte : rien à oublier. *(sans remède)* | Cette machine n’a aucune fiche : rien à oublier. |  |
| `ETOUCH_MACHINE_STORE` | Réglages | Enregistrement impossible dans la configuration CNCjs (.cncrc) : type de machine non modifié. *(sans remède)* | Enregistrement impossible : le type de machine n’a pas changé. Demandez qu’on vérifie la configuration CNCjs. | Détails |
| `ETOUCH_MACHINE_RESUME_MODE_CHANGED` | Commandes (Fichiers / Suivi) | Reprise chargée en mode {loaded}, machine désormais en mode {now} : rechargez la reprise depuis Reprendre. | Le type de machine a changé depuis le chargement de la reprise. Rechargez la reprise. | Reprendre… |
| `ETOUCH_MACHINE_OPERATION` | Commandes (Fichiers / Suivi) | Opération machine inconnue. | Action inconnue : la page n’est pas à jour. Rechargez-la. | Recharger la page |
| `ETOUCH_LASER_NOT_LASER` | Réglages | Opération réservée à une machine déclarée laser. *(sans remède)* | Cette action est réservée aux machines laser. Changez le type de machine. | Type de machine |
| `ETOUCH_LASER_NO_SPINDLE_TEST` | Réglages | Machine déclarée laser : pas de test de broche (aucune commande M3 de test envoyée). *(sans remède, technique)* | Un laser n’a pas de test de broche. |  |
| `ETOUCH_LASER_NO_PLATE_PROBE` | Réglages | Machine déclarée laser : pas de palpage Z avec plaque. *(sans remède)* | Un laser n’a pas de zéro Z à la plaque. |  |
| `ETOUCH_LASER_NO_TOOL_CHANGE` | Commandes (Fichiers / Suivi) | Machine déclarée laser : pas de changement d’outil (M6) ni de relance de broche ; arrêtez le travail. *(technique)* | Un laser ne change pas d’outil : le fichier demande un changement. Arrêtez l’usinage. | Arrêter |
| `ETOUCH_LASER_NO_CNC_RESUME` | Réglages | Machine déclarée laser : la reprise CNC (dégagement, broche, plongée) est refusée. *(sans remède)* | La reprise CNC n’existe pas pour un laser. Utilisez la reprise laser. | Reprise laser |
| `ETOUCH_LASER_FRAME_DISABLED` | Réglages | Cadrage indisponible : déplacements réels non activés ou non pris en charge par cette carte (touch.motion.enabled, Grbl 1.1 ou plus). *(sans remède, technique)* | Cadrage indisponible sur cette machine. Mettez-la à jour (Grbl 1.1 minimum) et activez les déplacements dans CNCjs. | Détails |
| `ETOUCH_LASER_FRAME_NO_PROGRAM` | Commandes (Fichiers / Suivi) | Aucun programme chargé : cadrage impossible. *(sans remède)* | Aucun fichier chargé. Choisissez-en un. | Fichiers |
| `ETOUCH_LASER_FRAME_CHECK` | Commandes (Fichiers / Suivi) | Cadrage refusé : la vérification de course du programme doit être validée en X et Y (machine référencée, programme dans la course). *(sans remède)* | Cadrage refusé : le fichier doit tenir dans la machine. Faites la prise d’origine machine, puis contrôlez le fichier. | Contrôler le fichier |
| `ETOUCH_LASER_FRAME_BOUNDS` | Commandes (Fichiers / Suivi) | Cadrage refusé : contour X/Y du programme inconnu (unités non fixées, changement de repère ou déplacements non suivis). *(sans remède)* | Le contour du fichier est inconnu (il change d’unités ou de zéro en route). Cadrage impossible. |  |
| `ETOUCH_LASER_FRAME_WCS` | Commandes (Fichiers / Suivi) | Cadrage refusé : le programme utilise {wcs} alors que le repère actif est {active}. *(sans remède)* | Le fichier utilise le zéro {wcs}, la machine est sur {active}. Choisissez {active}. | Utiliser {active} |
| `ETOUCH_LASER_FRAME_POSITION` | Commandes (Fichiers / Suivi) | Position de travail X/Y inconnue : cadrage impossible. *(sans remède)* | La position X/Y est inconnue. Attendez l’état de la machine, ou faites la prise d’origine machine. | Prise d’origine machine |
| `ETOUCH_LASER_FRAME_FEED` | Commandes (Fichiers / Suivi) | Avance de cadrage hors limites : de {min} à {max} mm/min. *(sans remède)* | La vitesse de cadrage doit être entre {min} et {max} mm/min. | Vitesse… |
| `ETOUCH_LASER_FRAME_SLOW` | Commandes (Fichiers / Suivi) | Cadrage trop lent : un côté durerait {seconds} s ({max} s au plus). Augmentez l’avance. | Cadrage trop lent ({seconds} s par côté, {max} s au plus). Augmentez la vitesse. | Vitesse… |
| `ETOUCH_LASER_FRAME_CHANGED` | Commandes (Fichiers / Suivi) | Le programme ou la machine ont changé depuis la confirmation du cadrage : confirmez à nouveau. | Le fichier ou la machine ont changé depuis votre confirmation. Confirmez à nouveau. | Confirmer |
| `ETOUCH_LASER_FRAME_EXPIRED` | Commandes (Fichiers / Suivi) | Confirmation du cadrage expirée ou déjà utilisée. *(sans remède)* | Confirmation périmée. Confirmez à nouveau. | Confirmer |
| `ETOUCH_LASER_RESUME_NOT_RAPID` | Reprise à une ligne | Reprise laser seulement au début d’un déplacement rapide (G0 en X/Y) : la ligne {from} n’en est pas un. *(sans remède, technique)* | La ligne {from} n’est pas un déplacement rapide : on ne peut reprendre un laser que là. Choisissez le premier déplacement rapide après une découpe. | Champ « ligne » (focus) |
| `ETOUCH_LASER_RESUME_NOT_BOUNDARY` | Reprise à une ligne | La ligne {from} n’est pas une limite de passe : choisissez le premier G0 après une découpe, ou un G0 après M5 ou S0. *(technique)* | La ligne {from} n’est pas entre deux passes. Choisissez le premier déplacement rapide après une découpe. | Champ « ligne » (focus) |
| `ETOUCH_LASER_RESUME_POSITION` | Reprise à une ligne | Position X/Y avant la ligne {from} inconnue (X et Y doivent avoir été donnés en absolu) : choisissez une ligne plus loin. | On ne sait pas où était la tête avant la ligne {from}. Choisissez une ligne plus loin. | Champ « ligne » (focus) |
| `ETOUCH_LASER_RESUME_Z_VARIES` | Reprise à une ligne | Hauteur Z variable avant la ligne {from} : reprise laser impossible sans hauteur de tête connue. *(sans remède)* | La hauteur de la tête varie avant la ligne {from} : reprise laser impossible. Reprenez au début. | Reprendre au début |
| `ETOUCH_LASER_RESUME_S_UNKNOWN` | Reprise à une ligne | Consigne S inconnue avant la ligne {from} alors que le laser est commandé (M3/M4) : reprise impossible. *(sans remède, technique)* | La puissance du laser n’est pas connue avant la ligne {from}. Choisissez une ligne plus loin, ou reprenez au début. | Champ « ligne » (focus) |
| `ETOUCH_LASER_CHECK_M3` | Fichiers | Laser en M3 (consigne S constante) à partir de la ligne {line}. *(sans remède, technique)* | Le laser reste à puissance fixe à partir de la ligne {line}. |  |
| `ETOUCH_LASER_CHECK_M4` | Fichiers | Laser en M4 (consigne S dynamique, ajustée à la vitesse) à partir de la ligne {line}. *(sans remède, technique)* | La puissance du laser suit la vitesse à partir de la ligne {line}. |  |
| `ETOUCH_LASER_CHECK_NO_M3_M4` | Fichiers | Aucun M3 ni M4 dans le programme : le laser n’est pas commandé par ce programme. *(sans remède, technique)* | Ce fichier n’allume jamais le laser. |  |
| `ETOUCH_LASER_CHECK_MAX_UNKNOWN` | Fichiers | Réglage $30 inconnu : consignes S non comparées au maximum de la carte. *(sans remède, technique)* | La puissance maximale de la machine n’est pas lue : la puissance du fichier n’est pas comparée. Touchez « Relire les réglages ». | Relire les réglages |
| `ETOUCH_LASER_CHECK_S_ABOVE_MAX` | Fichiers | Consigne S{s} (ligne {line}) au-dessus de $30={max} : la carte la ramènera à $30. *(sans remède, technique)* | La puissance demandée à la ligne {line} dépasse le maximum de la machine : elle sera ramenée au maximum. |  |
| `ETOUCH_RESUME_FIRST_LINE` | Reprise à une ligne | Mode de déplacement {motion} avant la ligne {from} : il ne peut pas être rétabli devant cette ligne (qui ne fixe pas le sien), choisissez une autre ligne de reprise. | Avant la ligne {from}, la machine devait être en mode {motion}, mais cette ligne ne le dit pas. Choisissez une autre ligne. | Champ « ligne » (focus) |
| `ETOUCH_RESUME_FIRST_EXPRESSION` | Reprise à une ligne | Expression ou macro CNCjs à la ligne de reprise {from} : sa valeur n’est pas connue ici, choisissez une autre ligne. | La ligne {from} contient une formule CNCjs dont la valeur est inconnue. Choisissez une autre ligne. | Champ « ligne » (focus) |
| `ETOUCH_RESUME_G49_AXIS` | Reprise à une ligne | G49 avec mot d’axe à la ligne {line} : effet ambigu (annulation du décalage d’outil ou déplacement), reprise impossible. *(sans remède, technique)* | La ligne {line} (G49 avec un axe) est ambiguë : la reprise ne sait pas la refaire. Reprenez au début. | Reprendre au début |
| `ETOUCH_RESUME_PLANE` | Reprise à une ligne | Plan de travail (G17/G18/G19) non fixé avant la ligne {from} et arc (G2/G3) à la ligne {line} : plan de la carte inconnu, reprise impossible. *(sans remède, technique)* | Le fichier ne précise pas son plan avant le premier arc (ligne {line}). Reprenez au début. | Reprendre au début |
| `ETOUCH_RESUME_UNSUPPORTED_SYNTAX` | Reprise à une ligne | Expression CNCjs ou « / » à la ligne {line} : syntaxe non prise en charge par la reprise. *(sans remède)* | La ligne {line} contient une écriture que la reprise ne comprend pas. Reprenez au début. | Reprendre au début |
| `ETOUCH_RESUME_FEED_MODE` *(jamais émis)* | (aucun) | Mode d’avance (G93/G94) non fixé avant la ligne {from} : le mode de la carte est inconnu, reprise impossible. *(sans remède, technique)* | Le fichier ne précise pas son mode de vitesse avant la ligne {from}. Reprenez au début. | Reprendre au début |
| `ETOUCH_RESUME_PROGRAM_END` | Reprise à une ligne | Fin de programme (M2/M30) à la ligne {line} avant la ligne {from} : la carte y remet ses modes, reprise impossible. *(sans remède, technique)* | Le fichier se termine à la ligne {line}, avant la ligne {from} : la machine y remet ses modes. Choisissez une ligne après. | Champ « ligne » (focus) |
| `ETOUCH_RESUME_FEED_PRECISION` | Reprise à une ligne | Avance trop petite pour être écrite (moins de 0,0000000001) avant la ligne {from} : reprise impossible. *(sans remède)* | La vitesse avant la ligne {from} est trop petite pour être refaite. Reprenez au début. | Reprendre au début |
| `ETOUCH_RESUME_TOOL_OFFSET` | Reprise à une ligne | Décalage d’outil dynamique (G43.1) à la ligne {line} avant la ligne {from} : hauteurs Z non modélisées, reprise impossible. *(sans remède, technique)* | Une correction de longueur d’outil (G43.1) à la ligne {line} empêche la reprise à la ligne {from}. Reprenez au début. | Reprendre au début |
| `ETOUCH_RESUME_DISTANCE` | Reprise à une ligne | Mode de distance (G90/G91) non fixé avant le premier déplacement du programme (ligne {line}) : le mode de la carte est inconnu, reprise impossible. *(sans remède, technique)* | Le fichier ne dit pas s’il compte en absolu ou en relatif avant son premier déplacement. Reprenez au début. | Reprendre au début |
| `ETOUCH_RESUME_DISTANCE_BEFORE` | Reprise à une ligne | Mode de distance (G90/G91) non fixé avant la ligne {from} : le mode de la carte est inconnu, reprise impossible. *(sans remède, technique)* | Le fichier ne dit pas s’il compte en absolu ou en relatif avant la ligne {from}. Choisissez une ligne plus loin, ou reprenez au début. | Champ « ligne » (focus) |
| `ETOUCH_CHECK_HOMING_DIRECTION` | Fichiers | Sens de prise d’origine inversé ($23) en {axis} : selon la compilation du firmware, la course va de −${setting} à 0 ou de 0 à ${setting} ; axe non vérifié. *(sans remède, technique)* | Course de l’axe {axis} non vérifiée : cette machine prend son origine dans l’autre sens. Vérifiez à la main que le fichier tient. | Détails |
| `ETOUCH_PROBE_NO_CONTACT` | Préparer > Sonde | Aucun contact en {axis} sur {search} mm : rapprochez l’outil et vérifiez la pince. | La sonde n’a rien touché sur {search} mm en {axis}. Rapprochez la fraise du bloc et vérifiez la pince. | Tester la sonde |
| `ETOUCH_PROBE_CONTACT_AT_START` | Préparer > Sonde | La sonde est en contact avant la touche {axis} : dégagez l’outil et vérifiez la pince. | La sonde touche déjà avant de commencer ({axis}). Relevez la fraise et vérifiez la pince. | Tester la sonde |
| `ETOUCH_PROBE_STUCK` | Préparer > Sonde | La sonde reste en contact après le retrait de {retract} mm en {axis}. *(sans remède)* | La sonde reste en contact après un recul de {retract} mm ({axis}). Vérifiez que rien ne touche la fraise. | Tester la sonde |
| `ETOUCH_PROBE_DESCENT_CONTACT` | Préparer > Sonde | Contact pendant la descente à côté de la face {axis} : l’outil n’était pas dans la zone de départ au-dessus du coin du bloc. *(sans remède)* | La fraise a touché en descendant. Placez-la au-dessus du coin du bloc, plus loin du bord. | Voir le dessin de départ |
| `ETOUCH_PROBE_TRAVERSE_CONTACT` | Préparer > Sonde | Contact pendant un déplacement de liaison : un obstacle se trouve sur le trajet, ou l’outil n’était pas au-dessus du bloc au départ. *(sans remède)* | La fraise a touché en passant d’une face à l’autre. Dégagez le passage, replacez la fraise au-dessus du coin, puis relancez. | Voir le dessin de départ |
| `ETOUCH_PROBE_MISMATCH` | Préparer > Sonde | Les deux touches {axis} diffèrent de {delta} mm : mesure rejetée. *(sans remède)* | Les deux mesures {axis} diffèrent de {delta} mm. Vérifiez que le bloc ne bouge pas, puis recommencez. | Relancer le palpage |
| `ETOUCH_PROBE_PRB` | Préparer > Sonde | Contact {axis} non confirmé par la carte (rapport PRB absent ou incohérent). *(sans remède, technique)* | La machine n’a pas confirmé le contact {axis}. Recommencez ; si cela se répète, testez la sonde. | Tester la sonde |
| `ETOUCH_PROBE_START_CLOSE` | Préparer > Sonde | Départ à moins de 0,2 mm de la surface en {axis} : reculez l’outil. | La fraise est collée au bloc en {axis}. Reculez-la d’au moins 1 mm. |  |
| `ETOUCH_PROBE_POSITION` | Préparer > Sonde | Position {axis} inattendue après un déplacement : palpage arrêté. *(sans remède)* | La fraise n’est pas où prévu en {axis} : palpage arrêté. Vérifiez sa position, puis recommencez. | Relancer le palpage |
| `ETOUCH_PROBE_ALARM` | Préparer > Sonde | Alarme {alarm} pendant le palpage. *(sans remède)* | Alarme {alarm} pendant le palpage. Déverrouillez, refaites la prise d’origine machine, puis recommencez. | Déverrouiller |
| `ETOUCH_PROBE_ERROR` | Préparer > Sonde | Grbl a refusé une ligne du palpage (error:{error}). *(sans remède, technique)* | La machine a refusé une ligne du palpage (erreur {error}). Recommencez ; si cela se répète, notez le numéro. | Relancer le palpage |
| `ETOUCH_PROBE_STOPPED` | Préparer > Sonde | Palpage interrompu par Arrêter. *(sans remède)* | Palpage arrêté. Le zéro pièce n’a pas changé. | Relancer le palpage |
| `ETOUCH_PROBE_PAUSED` | Préparer > Sonde | Palpage interrompu par Pause : un palpage ne se reprend pas. *(sans remède)* | Pause pendant le palpage : il est annulé et ne reprend pas. Relancez-le. | Relancer le palpage |
| `ETOUCH_PROBE_STREAM` | Préparer > Sonde | Suivi de la tablette perdu pendant le palpage : mouvement arrêté. *(sans remède)* | Liaison avec la machine perdue : palpage arrêté. Vérifiez la connexion, puis relancez. | Connecter la CNC |
| `ETOUCH_PROBE_CONTROL` | Préparer > Sonde | Pilotage pris par un autre appareil : palpage arrêté. *(sans remède)* | Quelqu’un d’autre a pris la main : palpage arrêté. Reprenez la main, puis relancez. | Prendre la main |
| `ETOUCH_PROBE_STALE` | Préparer > Sonde | Rapports de la machine interrompus plus de 2,5 s : palpage arrêté. *(sans remède)* | La machine ne répond plus depuis 2,5 s : palpage arrêté. Vérifiez la connexion, puis relancez. | Connecter la CNC |
| `ETOUCH_PROBE_TIMEOUT` | Préparer > Sonde | Durée maximale du palpage dépassée : mouvement arrêté. *(sans remède)* | Le palpage dure trop longtemps : arrêté. Raccourcissez les distances ou augmentez la vitesse. | Ouvrir le profil |
| `ETOUCH_PROBE_RESTART` | Préparer > Sonde | La carte a redémarré pendant le palpage. *(sans remède)* | La machine a redémarré pendant le palpage. Refaites la prise d’origine machine, puis relancez le palpage. | Prise d’origine machine |
| `ETOUCH_PROBE_LOST` | Préparer > Sonde | Connexion machine perdue pendant le palpage. *(sans remède)* | Connexion perdue pendant le palpage. Vérifiez le câble, reconnectez, puis relancez. | Connecter la CNC |
| `ETOUCH_PROBE_WRITE` | Préparer > Sonde | L’origine écrite ne se relit pas comme attendu ({axis} {value} au lieu de {expected}). *(sans remède)* | Le zéro posé ne correspond pas à la mesure ({axis} {value} au lieu de {expected}). Recommencez le palpage. | Relancer le palpage |
| `ETOUCH_PROBE_WRITE_UNCERTAIN` | Préparer > Sonde | Écriture de l’origine sans confirmation. *(sans remède)* | On ne sait pas si le zéro a été posé. Vérifiez la position pièce, ou recommencez le palpage. | Relancer le palpage |
| `ETOUCH_PROBE_AXES` | Préparer > Sonde | Opération de palpage invalide (Z, X, Y ou XYZ). *(sans remède)* | Choisissez Z, X, Y ou XYZ. | Z / X / Y / XYZ |
| `ETOUCH_PROBE_MISSING` | Préparer > Sonde | Profil de sonde incomplet : {field} à renseigner. *(sans remède)* | Le profil de sonde est incomplet : renseignez « {field} » (une valeur par défaut est proposée). | Ouvrir le profil |
| `ETOUCH_PROBE_PARAM` | Préparer > Sonde | Profil de sonde : {field} hors des limites du palpage réel ({min} à {max}). Modifiez le profil. | « {field} » est hors plage ({min} à {max}). Corrigez-le dans le profil. | Ouvrir le profil |
| `ETOUCH_PROBE_SLOW_FAST` | Préparer > Sonde | La seconde touche doit être au plus aussi rapide que l’approche. *(sans remède)* | La seconde touche doit être plus lente que l’approche. Corrigez les vitesses du profil. | Ouvrir le profil |
| `ETOUCH_PROBE_RETRACT` | Préparer > Sonde | Le retrait doit être inférieur à la recherche maximale. *(sans remède)* | Le recul doit être plus petit que la recherche. Corrigez le profil. | Ouvrir le profil |
| `ETOUCH_PROBE_APPROACH` | Préparer > Sonde | Palpage XYZ : faces extérieures du bloc seulement. Pour ce coin, les deux recherches doivent aller vers la pièce. Sinon palpez Z, X et Y séparément. | Ce coin ne marche qu’avec les faces extérieures du bloc. Changez de coin, ou palpez Z, X et Y séparément. | Choisir le coin |
| `ETOUCH_PROBE_FACE_SIGN` | Préparer > Sonde | Palpage XYZ : le décalage de face {axis} a le mauvais signe pour une face extérieure. Vérifiez-le dans le profil. | Le décalage de la face {axis} a le mauvais signe pour une face extérieure. Corrigez-le dans le profil. | Ouvrir le profil |
| `ETOUCH_PROBE_WCS` | Préparer > Sonde | Le repère choisi ({wcs}) n’est pas le repère actif ({active}) : choisissez {active}. | Le zéro choisi ({wcs}) n’est pas celui de la machine ({active}). Choisissez {active}. | Utiliser {active} |
| `ETOUCH_PROBE_TRAVEL` | Préparer > Sonde | Palpage refusé : {axis} irait de {min} à {max} mm machine, hors de la course ({low} à {high}, marge 1 mm). Déplacez l’outil ou réduisez les distances. | Le palpage sortirait de la machine en {axis} (de {min} à {max} mm ; la course va de {low} à {high}). Éloignez la fraise du bord ou réduisez les distances. | Voir le dessin de départ |
| `ETOUCH_PROBE_FEED` | Préparer > Sonde | Vitesse {feed} mm/min supérieure au maximum de l’axe {axis} ({max} mm/min). *(sans remède)* | La vitesse {feed} mm/min est trop élevée pour l’axe {axis} ({max} au plus). Baissez-la dans le profil. | Ouvrir le profil |
| `ETOUCH_PROBE_TOO_SLOW` | Préparer > Sonde | Palpage trop long ({seconds} s, {max} s au plus) : augmentez les vitesses ou réduisez les distances. | Palpage trop long ({seconds} s, {max} s au plus). Augmentez les vitesses ou réduisez les distances. | Ouvrir le profil |
| `ETOUCH_PROBE_PILOT` | Préparer > Sonde | Pilotage requis : cet appareil doit piloter la machine pour palper. Touchez Pilote dans le bandeau. | Prenez la main pour palper. | Prendre la main |
| `ETOUCH_PROBE_G92` | Préparer > Sonde | Décalage temporaire G92 actif : annulez-le (G92.1) avant de palper. *(technique)* | Un décalage temporaire est actif (G92). Annulez-le, puis recommencez. | Annuler le décalage |
| `ETOUCH_PROBE_TLO` | Préparer > Sonde | Compensation de longueur d’outil active : annulez-la (G49) avant de palper. *(technique)* | Une correction de longueur d’outil est active. Annulez-la, puis recommencez. | Annuler la correction |
| `ETOUCH_PROBE_PARAMETERS` | Préparer > Sonde | Paramètres de la carte ($#) illisibles : palpage annulé avant tout mouvement. *(sans remède)* | Les zéros enregistrés dans la machine sont illisibles : rien n’a bougé. Touchez « Relire les réglages ». | Relire les réglages |
| `ETOUCH_PROBE_WINDOW` | Préparer > Sonde | Palpage XYZ : la face {axis} touchée n’est pas là où le départ la place (centre de l’outil au-dessus du bloc, à {window} mm au plus du bord). Paroi du trou ou mauvais coin : placez l’outil au-dessus du coin extérieur, loin du trou. | La fraise n’est pas au bon endroit. Placez-la au-dessus du coin extérieur du bloc, à moins de {window} mm du bord, loin des trous. | Voir le dessin de départ |

Sur ces 140 codes : 99 refus sans remède, 48 techniques, 54 longs ; 111 propositions portent un bouton remède, 29 se lisent seules (information ou attente).

### 4.3 Refus et états du serveur sans code (à coder)

Phrases françaises du serveur qui n’ont ni code `ETOUCH_` ni ligne au catalogue : elles restent en français en anglais et en espagnol. La colonne « code proposé » est une suggestion de nom ; la spec fixe les vrais noms.

| Id | Source | Phrase aujourd’hui | Code proposé | Proposition (cause + remède) | Bouton remède |
|---|---|---|---|---|---|
| T2977 | backlight.js:102 | Réglage refusé : le système ne permet pas à CNCjs de modifier la luminosité. | `ETOUCH_BACKLIGHT_FORBIDDEN` | Le système refuse de changer la luminosité. Réglez-la sur la tablette elle-même. |  |
| T2978 | backlight.js:109 | Luminosité invalide. | `ETOUCH_BACKLIGHT_INVALID` | Luminosité invalide : choisissez une valeur sur la barre. |  |
| T2979 | block-probe.js:324 | Palpage refusé : {at.ambiguous}. | `ETOUCH_PROBE_AMBIGUOUS` | Palpage refusé : {reason}. (cause en français dans le serveur : à coder, avec son remède) | Voir le dessin de départ |
| T2982 | control.js:168 | Pilotage de {port} attribué à {describeOwner()} : Pause et Arrêt restent possibles ; prenez le pilotage avec un motif ou attendez la fin de son bail. | `ETOUCH_CONTROL_OWNED` | {owner} a la main sur la machine. Pause et Arrêter marchent toujours. Touchez « Prendre la main », ou attendez qu’il la rende. | Prendre la main |
| T2983 | control.js:224 | Prise de pilotage refusée : indiquez un motif (3 caractères au moins). Pilotage actuel : {describeOwner()}. | `ETOUCH_CONTROL_REASON` | Dites pourquoi vous prenez la main (3 lettres au moins). Actuellement : {owner}. | Prendre la main |
| T2984 | index.js:171 | Pilotage de {port} attribué à {describeOwner()} : commande système refusée tant qu’il pilote. | `ETOUCH_CONTROL_SYSTEM` | {owner} a la main : commande refusée. Prenez d’abord la main. | Prendre la main |
| T2988 | index.js:227 | Action de mise à jour inconnue. | `ETOUCH_UPDATE_UNKNOWN` | Action inconnue : la page n’est pas à jour. Rechargez-la. | Recharger la page |
| T2991 | job-load.js:77 | Bibliothèque non configurée (répertoire surveillé absent). | `ETOUCH_LIBRARY_NOT_CONFIGURED` | Aucun dossier de fichiers n’est réglé sur la tablette. Demandez qu’on le configure. | Détails |
| T2992 | job-load.js:81 | Ce nom ne désigne pas un fichier ordinaire (lien ou dossier refusé). | `ETOUCH_FILE_NOT_REGULAR` | Ce nom n’est pas un fichier (dossier ou raccourci). Choisissez un fichier G-code. | Fichiers |
| T2993 | job-load.js:82 | Fichier supérieur à 20 Mo. | `ETOUCH_FILE_TOO_LARGE` | Fichier trop gros (plus de 20 Mo). Découpez-le dans Vectric. |  |
| T2994 | job-load.js:83 | Fichier vide. | `ETOUCH_FILE_EMPTY` | Fichier vide. Choisissez-en un autre. | Fichiers |
| T2995 | job-load.js:84 | Fichier binaire : format invalide. | `ETOUCH_FILE_BINARY` | Ce fichier n’est pas du G-code (contenu binaire). Choisissez un fichier .nc ou .gcode. | Fichiers |
| T2996 | job-load.js:85 | Fichier modifié pendant la lecture : réessayez. | `ETOUCH_FILE_CHANGED` | Le fichier a changé pendant la lecture. Recommencez. | Recharger |
| T2998 | job-service.js:654 | Commande système en cours ({systemCommands.current().title}) : attendez sa fin. | `ETOUCH_SYSTEM_BUSY` | Une commande système est en cours ({title}). Attendez la fin. |  |
| T2999 | job-service.js:712 | La broche tourne encore ({speed} tr/min) : arrêtez-la d’abord (M5). | `ETOUCH_SPINDLE_RUNNING` | La broche tourne encore ({speed} tr/min). Arrêtez-la d’abord. | Arrêter la broche |
| T3000 | job-service.js:718 | La broche est commandée ({spindle}) : arrêtez-la d’abord (M5). | `ETOUCH_SPINDLE_COMMANDED` | La broche est commandée ({spindle}). Arrêtez-la d’abord. | Arrêter la broche |
| T3001 | job-service.js:792 | Le programme ne fixe pas ses unités et la machine est en {expr} : ajoutez G21 au début du programme ou remettez la machine en G21. | `ETOUCH_UNITS_UNSET` | Le fichier ne dit pas s’il est en mm, et la machine est en {units}. Mettez la machine en mm, ou ajoutez G21 au début du fichier. | Détails |
| T3003 | job-service.js:795 | Le programme ne fixe pas son mode et la machine est en {expr} : ajoutez G90 au début du programme ou remettez la machine en G90. | `ETOUCH_DISTANCE_UNSET` | Le fichier ne dit pas s’il compte en absolu, et la machine est en {mode}. Mettez la machine en absolu, ou ajoutez G90 au début du fichier. | Détails |
| T3007 | job-service.js:1418 | Grbl a refusé la relance de la broche (error:{t.error}) : reprise annulée. | `ETOUCH_RESUME_SPINDLE_REFUSED` | La machine a refusé de relancer la broche (erreur {error}) : reprise annulée. Vérifiez la machine, puis recommencez. | Relancer la reprise |
| T3009 | job-service.js:1429 | Broche non relancée à temps : reprise annulée. Vérifiez la machine. | `ETOUCH_RESUME_SPINDLE_LATE` | La broche ne repart pas à temps : reprise annulée. Vérifiez la machine. | Relancer la reprise |
| T3010 | job-service.js:1432 | Broche non relancée (service arrêté ou contrôleur retiré) : reprise annulée, vérifiez la machine. | `ETOUCH_RESUME_SPINDLE_LOST` | La liaison avec la machine est coupée : reprise annulée. Vérifiez la machine. | Connecter la CNC |
| T3016 | motion-preflight.js:73 | Rapports du contrôleur indisponibles. | `ETOUCH_MOTION_NO_REPORT` | La machine ne donne plus son état. Vérifiez la connexion. | Connecter la CNC |
| T3017 | motion-preflight.js:102 | Un chargement ou une confirmation est en attente, ou leur état est inconnu. | `ETOUCH_MOTION_PENDING` | Un chargement ou une confirmation est en attente. Terminez-le avant de déplacer. |  |
| T3019 | motion-preflight.js:123 | État serveur indisponible. | `ETOUCH_MOTION_NO_SERVER_STATE` | L’état du serveur est indisponible. Attendez quelques secondes. |  |
| T3020 | motion-preflight.js:149 | Vitesse maximale de cet axe indisponible. | `ETOUCH_MOTION_NO_MAX_FEED` | La vitesse maximale de l’axe n’est pas lue. Touchez « Relire les réglages ». | Relire les réglages |
| T3021 | motion-preflight.js:152 | Vitesse demandée supérieure à la limite {body.axis} ({maxFeed} mm/min). | `ETOUCH_MOTION_FEED_TOO_HIGH` | Vitesse trop élevée pour l’axe {axis} ({max} mm/min au plus). Baissez-la. | Vitesse… |
| T3022 | motion.js:125 | Contrôleur {expr} : déplacements réels non pris en charge par l’interface tactile. | `ETOUCH_MOTION_UNSUPPORTED` | Cette machine n’est pas prise en charge pour les déplacements à la main. |  |
| T3023 | motion.js:131 | Grbl {v.label} : le jog $J= et son annulation 0x85 exigent Grbl 1.1 ou plus. | `ETOUCH_MOTION_OLD_GRBL` | Cette machine est trop ancienne pour les déplacements à la main (Grbl 1.1 minimum). Mettez-la à jour. | Détails |
| T3024 | motion.js:182 | réglage $22 inconnu | `ETOUCH_MOTION_HOMING_SETTING` | La machine n’a pas dit si elle sait prendre son origine. Touchez « Relire les réglages ». | Relire les réglages |
| T3025 | motion.js:184 | prise d’origine désactivée ($22=0) | `ETOUCH_MOTION_HOMING_OFF` | La prise d’origine est coupée dans la machine : course non vérifiable. | Détails |
| T3026 | motion.js:186 | référencement ($H) non constaté depuis le dernier redémarrage de la carte | `ETOUCH_MOTION_NOT_HOMED` | Origine machine pas encore prise depuis le démarrage. Faites la prise d’origine machine. | Prise d’origine machine |
| T3027 | motion.js:188 | réglage $23 (sens de prise d’origine) inconnu | `ETOUCH_MOTION_HOMING_DIR` | Le sens de prise d’origine n’est pas lu. Touchez « Relire les réglages ». | Relire les réglages |
| T3028 | motion.js:191 | position machine non rapportée ($10 sans MPos : rapports Grbl en WPos) et aucun décalage WCO reçu depuis le démarrage de la carte | `ETOUCH_MOTION_NO_MPOS` | La machine ne donne pas sa position machine. Faites la prise d’origine machine, puis attendez son état. | Prise d’origine machine |
| T3029 | motion.js:193 | réglage $10 inconnu : position machine non vérifiable | `ETOUCH_MOTION_REPORT_SETTING` | Le réglage des rapports de la machine n’est pas lu. Touchez « Relire les réglages ». | Relire les réglages |
| T3031 | motion.js:235 | position machine {axis} {fmt()} hors de la course supposée ({env.candidates.map().join()}) : vérifiez $23 et l’origine machine | `ETOUCH_MOTION_OUT_OF_RANGE` | La position de l’axe {axis} est hors de la machine. Refaites la prise d’origine machine. | Prise d’origine machine |
| T3032 | motion.js:245 | convention de course ambiguë à cette position ({axis} {fmt()}, bit $23 à 1 : {plausible.map().join()}) : aucun déplacement n’y est sûr dans les deux ; déplacez l’axe depuis l’interface classique et faites vérifier la convention (étape 0 de HANDOFF.md) | `ETOUCH_MOTION_AMBIGUOUS` | Position ambiguë de l’axe {axis}. Déplacez-le à la main, loin des fins de course, puis refaites la prise d’origine machine. | Prise d’origine machine |
| T3033 | motion.js:376 | Machine en alarme{cond} : déverrouillez ($X) ou référencez ($H) d’abord. | `ETOUCH_MOTION_ALARM` | La machine est en alarme. Déverrouillez, puis refaites la prise d’origine machine. | Déverrouiller |
| T3034 | motion.js:416 | Axe ou sens invalide. | `ETOUCH_MOTION_BAD_AXIS` | Axe ou sens invalide : la page n’est pas à jour. Rechargez-la. | Recharger la page |
| T3035 | motion.js:416 | Axe, sens ou pas invalide (pas : 0,01 / 0,1 / 1 / 10 / 25 / 50 / 100 mm). | `ETOUCH_MOTION_BAD_STEP` | Pas invalide : choisissez 0,01 – 0,1 – 1 – 10 – 25 – 50 ou 100 mm. | Pas |
| T3036 | motion.js:421 | Avance hors limites pour {body.axis} : de {MIN_FEED} à {limit.max} mm/min ({cond}). | `ETOUCH_MOTION_FEED_RANGE` | Vitesse hors limites pour l’axe {axis} : de {min} à {max} mm/min. | Vitesse… |
| T3037 | motion.js:439 | Pas refusé : {at.reason}. | `ETOUCH_MOTION_STEP_REFUSED` | Pas refusé : voir la raison, puis choisissez un pas plus petit. |  |
| T3038 | motion.js:442 | Pas de {fmt()} mm refusé : au-delà de {MAX_UNREFERENCED_STEP_MM} mm, il faut une machine référencée et une course connue ({at.reason}). | `ETOUCH_MOTION_STEP_UNREFERENCED` | Pas de {step} mm refusé. Au-delà de {max} mm, faites d’abord la prise d’origine machine. | Prise d’origine machine |
| T3040 | motion.js:652 | Grbl a refusé le jog (error:{error}) | `ETOUCH_MOTION_GRBL_ERROR` | La machine a refusé le déplacement (erreur {error}). Recommencez ; si cela se répète, notez le numéro. |  |
| T3041 | motion.js:667 | Broche en rotation : maintien continu refusé ; pas de {fmt()} mm au plus. | `ETOUCH_MOTION_SPINDLE_HOLD` | La broche tourne : déplacements limités à {max} mm. Arrêtez la broche pour aller plus loin. | Arrêter la broche |
| T3047 | motion.js:985 | Connexion machine perdue pendant la définition d’origine : vérifiez le repère. | `ETOUCH_ORIGIN_LOST` | Connexion perdue pendant la pose du zéro. Vérifiez le zéro pièce, puis recommencez. | Connecter la CNC |
| T3048 | motion.js:991 | Grbl a refusé la définition d’origine (error:{error}). | `ETOUCH_ORIGIN_REFUSED` | La machine a refusé de poser le zéro (erreur {error}). Recommencez. |  |
| T3049 | motion.js:1001 | La machine a bougé pendant la définition d’origine ({moved.map().join()}) : arrêtez et vérifiez le contrôleur. | `ETOUCH_ORIGIN_MOVED` | La machine a bougé pendant la pose du zéro. Arrêtez, vérifiez la position, puis recommencez. | Arrêter |
| T3050 | motion.js:1009 | Le repère n’a pas pris la valeur attendue ({off.map().join()} au lieu de 0). | `ETOUCH_ORIGIN_NOT_SET` | Le zéro pièce n’a pas pris la valeur attendue. Recommencez. | Poser le zéro |
| T3052 | motion.js:1019 | Définition d’origine sans réponse à temps : vérifiez la machine et le repère. | `ETOUCH_ORIGIN_TIMEOUT` | La machine n’a pas répondu à temps. Vérifiez la machine et le zéro pièce, puis recommencez. | Poser le zéro |
| T3054 | plate-probe.js:103 | Mode de déplacement {expr} actif : pendant une pause, le zéro Z avec plaque exige G0 ou G1 avec une avance. | `ETOUCH_PLATE_MOTION_MODE` | Zéro Z à la plaque impossible pendant cette pause. Arrêtez l’usinage, puis recommencez. | Arrêter |
| T3055 | plate-probe.js:130 | Épaisseur de plaque invalide (plus de 0 et au plus {PLATE.maxThickness} mm). | `ETOUCH_PLATE_THICKNESS` | Épaisseur de plaque invalide : entre 0 (exclu) et {max} mm. | Champ « épaisseur » |
| T3056 | plate-probe.js:133 | Distance de recherche invalide ({PLATE.minSearch} à {PLATE.maxSearch} mm). | `ETOUCH_PLATE_SEARCH` | Distance de recherche invalide : entre {min} et {max} mm. | Champ « recherche » |
| T3057 | plate-probe.js:188 | Alarme pendant le palpage ({cond}) : arrêtez le travail, déverrouillez ($X) et vérifiez la sonde. | `ETOUCH_PLATE_ALARM` | Alarme pendant le zéro Z à la plaque. Arrêtez l’usinage, déverrouillez et vérifiez la sonde. | Déverrouiller |
| T3059 | plate-probe.js:192 | Grbl a refusé une ligne du palpage (error:{r.probing.error}). | `ETOUCH_PLATE_ERROR` | La machine a refusé une ligne du zéro Z (erreur {error}). Recommencez. |  |
| T3060 | plate-probe.js:241 | Palpage sans contact net (Z {cz} depuis {z0}). | `ETOUCH_PLATE_NO_CONTACT` | Pas de contact net avec la plaque. Vérifiez la pince et la plaque, puis recommencez. | Tester la sonde |
| T3061 | plate-probe.js:256 | Le repère n’a pas pris la valeur attendue (Z {now} au lieu de {p.thickness}). | `ETOUCH_PLATE_NOT_SET` | Le zéro Z n’a pas pris la valeur attendue. Recommencez. |  |
| T3063 | probe-input.js:111 | Contrôleur Grbl déconnecté ou indisponible. | `ETOUCH_PROBE_INPUT_DOWN` | La machine n’est pas connectée. Connectez-la d’abord. | Connecter la CNC |
| T3067 | program-check.js:530 | Limites logicielles Grbl actives ($20=1) : la carte refuserait elle-même un dépassement (alarme 2). | `ETOUCH_CHECK_SOFT_LIMITS_ON` | La machine s’arrête d’elle-même (alarme) si le fichier sort de sa zone. |  |
| T3068 | program-check.js:532 | Limites logicielles Grbl inactives ($20=0) : aucune protection de la carte. | `ETOUCH_CHECK_SOFT_LIMITS_OFF` | Attention : la machine ne s’arrête pas d’elle-même si le fichier sort de sa zone. |  |
| T3071 | projects.js:76 | {label} : caractères de contrôle refusés. | `ETOUCH_PROJECT_CONTROL_CHARS` | Ce champ contient un caractère interdit. Retirez-le. |  |
| T3073 | projects.js:92 | Notes : caractères de contrôle refusés. | `ETOUCH_PROJECT_NOTES_CHARS` | Les notes contiennent un caractère interdit. Retirez-le. |  |
| T3076 | projects.js:133 | Fichiers associés : nom invalide. | `ETOUCH_PROJECT_RELATED_NAME` | Nom de fichier associé invalide. Choisissez-le dans la liste. |  |
| T3079 | projects.js:163 | Grille de palpage : ligne {expr} illisible (x y z attendus). | `ETOUCH_PROJECT_GRID_LINE` | Ligne {n} de la grille illisible : écrivez « x y z ». |  |
| T3082 | projects.js:237 | Repère du palpage : décalage {axis.toUpperCase()} invalide. | `ETOUCH_PROJECT_PROBE_OFFSET` | Décalage {axis} du palpage invalide. Corrigez-le. |  |
| T3083 | projects.js:249 | Profil de palpage invalide. | `ETOUCH_PROJECT_PROBE_PROFILE` | Profil de sonde invalide. Corrigez-le ou choisissez-en un autre. | Ouvrir le profil |
| T3089 | projects.js:389 | Fiches projets illisibles ({STORE_NAME}) : rien n’a été modifié. | `ETOUCH_PROJECT_STORE_UNREADABLE` | Les fiches projets sont illisibles : rien n’a été modifié. Demandez qu’on vérifie le fichier de la bibliothèque. | Détails |
| T3090 | projects.js:543 | Bibliothèque de projets pleine ({LIMITS.entries} fiches) : effacez des fiches inutiles. | `ETOUCH_PROJECT_STORE_FULL` | La bibliothèque de projets est pleine (500 fiches). Effacez des fiches inutiles. | Fichiers |
| T3097 | resume.js:619 | Hauteur de dégagement inconnue avant la ligne {from} (aucun déplacement rapide G0 en Z{cond}) : choisissez une ligne après un retrait en rapide. | `ETOUCH_RESUME_NO_RAPID_Z` | Aucune remontée rapide avant la ligne {from}. Choisissez une ligne située après une remontée de la fraise. (doublon exact du code ETOUCH_RESUME_NO_RAPID_Z) | Champ « ligne » (focus) |
| T3101 | system-command.js:40 | Commande système déjà en cours ({systemCommand.title}). | `ETOUCH_SYSTEM_BUSY` | Une commande système est déjà en cours ({title}). Attendez la fin. |  |
| T3102 | system-command.js:49 | Un travail est en cours ou en pause sur {port} : commande système refusée. | `ETOUCH_SYSTEM_JOB` | Un usinage est en cours ou en pause : commande refusée. Arrêtez l’usinage d’abord. | Arrêter |
| T3103 | system-command.js:53 | Machine en mouvement ou occupée ({state}) sur {port} : commande système refusée. | `ETOUCH_SYSTEM_MOVING` | La machine bouge ({state}) : commande refusée. Attendez qu’elle soit au repos. |  |
| T3104 | system-command.js:57 | Commandes en attente sur {port} : commande système refusée. | `ETOUCH_SYSTEM_QUEUE` | Des commandes sont en attente : attendez qu’elles finissent. |  |
| T3105 | system-command.js:65 | État machine trop ancien sur {port} : attendre un rapport récent, puis réessayer. | `ETOUCH_SYSTEM_STALE` | L’état de la machine est ancien. Attendez quelques secondes, puis réessayez. |  |
| T3106 | system-command.js:68 | Palpage en cours sur {port} : commande système refusée. | `ETOUCH_SYSTEM_PROBING` | Un palpage est en cours : attendez la fin. |  |
| T3107 | system-command.js:71 | Chargement en cours sur {port} : commande système refusée. | `ETOUCH_SYSTEM_LOADING` | Un chargement est en cours : attendez la fin. |  |
| T3108 | system-command.js:74 | Prise d’origine en cours sur {port} : commande système refusée. | `ETOUCH_SYSTEM_HOMING` | La prise d’origine est en cours : attendez la fin. |  |
| T3109 | system-command.js:78 | Déplacement en cours sur {port} : commande système refusée. | `ETOUCH_SYSTEM_MOVE` | Un déplacement est en cours : attendez la fin. |  |
| T3110 | system-command.js:81 | La broche tourne sur {port} : arrêtez-la d’abord (M5), commande système refusée. | `ETOUCH_SYSTEM_SPINDLE` | La broche tourne : arrêtez-la d’abord. | Arrêter la broche |
| T3111 | updates.js:44 | Droits administrateur manquants : l’utilisateur du serveur CNCjs ne peut pas lancer apt sans mot de passe. Faites la mise à jour par SSH. | `ETOUCH_UPDATE_NO_ROOT` | Mise à jour impossible depuis la tablette. Demandez qu’on la lance par SSH. | Détails |
| T3112 | updates.js:47 | Une autre mise à jour est déjà en cours sur l’ordinateur (automatique ?) : réessayez dans quelques minutes. | `ETOUCH_UPDATE_RUNNING_OTHER` | Une autre mise à jour tourne déjà sur la tablette. Réessayez dans quelques minutes. | Réessayer |
| T3113 | updates.js:50 | Une installation précédente a été interrompue : terminez-la par SSH (sudo dpkg --configure -a). | `ETOUCH_UPDATE_INTERRUPTED` | Une installation précédente a été interrompue. Demandez qu’on la termine par SSH. | Détails |
| T3114 | updates.js:53 | Mise à jour trop longue : arrêtée. Réessayez, ou faites-la par SSH. | `ETOUCH_UPDATE_TIMEOUT` | Mise à jour trop longue : arrêtée. Réessayez. | Réessayer |
| T3115 | updates.js:56 | Mise à jour impossible{cond} | `ETOUCH_UPDATE_FAILED` | Mise à jour impossible : {reason}. Réessayez, ou demandez de l’aide. | Réessayer |
| T3116 | updates.js:75 | Mises à jour indisponibles : pas de gestionnaire apt sur l’ordinateur du serveur CNCjs. | `ETOUCH_UPDATE_NO_APT` | Mises à jour indisponibles sur cette tablette. | Détails |
| T3122 | updates.js:115 | Mise à jour déjà en cours. | `ETOUCH_UPDATE_RUNNING` | Une mise à jour est déjà en cours. |  |
| T3123 | wifi.js:44 | Nom de réseau Wi-Fi invalide. | `ETOUCH_WIFI_NAME` | Nom de réseau Wi-Fi invalide. Choisissez-le dans la liste. |  |
| T3124 | wifi.js:54 | Mot de passe Wi-Fi invalide : 8 à 63 caractères. | `ETOUCH_WIFI_PASSWORD` | Mot de passe Wi-Fi invalide : de 8 à 63 caractères. |  |
| T3125 | wifi.js:81 | Gestion du Wi-Fi indisponible : NetworkManager (nmcli) absent sur l’ordinateur du serveur CNCjs. | `ETOUCH_WIFI_UNAVAILABLE` | Wi-Fi indisponible sur cette tablette. | Détails |
| T3127 | wifi.js:164 | Connexion à « {name} » impossible{cond}{cond} | `ETOUCH_WIFI_CONNECT` | Connexion à « {name} » impossible. Vérifiez le mot de passe et le signal, puis réessayez. | Réessayer |
| T3133 | api/api.touch.js:96 | Vérification serveur indisponible. | `ETOUCH_SERVER_CHECK` | Le serveur ne répond pas. Vérifiez la connexion, puis réessayez. | Réessayer |

90 phrases ont une proposition ci-dessus. Les 68 autres sont des confirmations d’action, des états ou des fragments de phrase (« Déplacement terminé », « Macro envoyée », « Système à jour », morceaux assemblés ensuite) ; elles ont tout de même besoin d’une ligne EN / ES, mais pas d’un remède. Liste complète dans le CSV (origine « message serveur »).

### 4.4 Motifs d’exception de l’aperçu de fichier

`library-preview.js` lève des exceptions en français, affichées telles quelles après « Aperçu indisponible : » (`shared-library.js:388`) ; `localize()` n’en traduit qu’une partie. Les autres restent en français en anglais et en espagnol et sont très techniques (« commentaire imbriqué : CNCjs et l’aperçu ne liraient pas la même ligne », « instructions après M2/M30 : Grbl les exécuterait… »). Proposition : un code `ETOUCH_PREVIEW_*` par motif, une phrase d’atelier (« Le fichier contient une ligne que l’aperçu ne sait pas lire (ligne N). Rouvrez-le dans Vectric. »), le détail dans « Détails ».

| Id | Fichier | Motif aujourd’hui | Traduit ? |
|---|---|---|---|
| T2913 | library-payload.js:22 | Préparation de l’envoi : {pct} % | non |
| T2917 | library-payload.js:7 | Fichier texte attendu. | non |
| T2918 | library-preview-worker.js:42 | Acquittement de parcours invalide | non |
| T2919 | library-preview-worker.js:55 | Aucun déplacement XY | non |
| T2920 | library-preview-worker.js:83 | Lecture du fichier impossible dans le Worker | non |
| T2921 | library-preview-worker.js:86 | Lecture de la réponse du serveur impossible | non |
| T2922 | library-preview-worker.js:102 | Réponse du serveur invalide ou trop volumineuse | non |
| T2923 | library-preview-worker.js:107 | Demande d’aperçu invalide | non |
| T2924 | library-preview-worker.js:114 | Bloc de texte invalide | non |
| T2925 | library-preview-worker.js:116 | Texte plus long qu’annoncé | non |
| T2926 | library-preview-worker.js:121 | Transfert du G-code incomplet | non |
| T2927 | library-preview-worker.js:126 | Message d’aperçu inconnu | non |
| T2928 | library-preview.js:55 | arc avec R et I/J simultanés | non |
| T2929 | library-preview.js:58 | rayon R incompatible avec les extrémités | non |
| T2930 | library-preview.js:64 | arc sans centre I/J ni rayon R | non |
| T2931 | library-preview.js:65 | centre absolu : I et J requis | non |
| T2932 | library-preview.js:70 | centre I/J incompatible avec les extrémités | non |
| T2933 | library-preview.js:82 | arc trop étendu pour cet aperçu | non |
| T2934 | library-preview.js:108 | valeur non finie | non |
| T2935 | library-preview.js:122 |  non pris en charge par cet aperçu | non |
| T2936 | library-preview.js:123 | axe répété | oui (motif) |
| T2937 | library-preview.js:126 | paramètre d’arc répété | non |
| T2938 | library-preview.js:132 | paramètre P répété | non |
| T2939 | library-preview.js:135 |  non pris en charge | non |
| T2940 | library-preview.js:167 | directive CNCjs % non acceptée par la bibliothèque | non |
| T2941 | library-preview.js:173 | commentaire imbriqué : CNCjs et l’aperçu ne liraient pas la même ligne | non |
| T2942 | library-preview.js:181 | commentaire non fermé | non |
| T2943 | library-preview.js:185 | instructions après M2/M30 : Grbl les exécuterait, l’aperçu ne les montrerait pas | non |
| T2944 | library-preview.js:193 | syntaxe non prise en charge | non |
| T2945 | library-preview.js:196 | mot P hors G4 non pris en charge | non |
| T2946 | library-preview.js:198 | paramètre d’arc hors mode G2/G3 | non |
| T2947 | library-preview.js:199 | arc sans X ni Y (refusé par Grbl, erreur 26) | oui (motif) |
| T2948 | library-preview.js:205 | changement de repère ( | non |
| T2949 | library-preview.js:205 | ) après des déplacements : l’aperçu trace un seul repère | non |
| T2950 | library-preview.js:208 | paramètre d’arc avec G | non |
| T2951 | library-preview.js:215 | mode G0/G1 non défini | oui (motif) |
| T2952 | library-preview.js:228 | coordonnées hors plage | oui (motif) |
| T2953 | library-preview.js:231 | déplacement relatif depuis une position inconnue après G28/G30 | oui (motif) |
| T2954 | library-preview.js:232 | arc depuis une position inconnue après G28/G30 | oui (motif) |
| T2955 | library-preview.js:259 | fin de ligne CR seule : CNCjs et Grbl ne compteraient pas les mêmes lignes | non |
| T2956 | library-preview.js:326 | Aperçu sans empreinte : export impossible. | non |
| T2957 | library-preview.js:334 | Fichier d’aperçu illisible. | non |
| T2958 | library-preview.js:335 | Ce fichier n’est pas un aperçu CNCjs Touch exporté. | non |
| T2959 | library-preview.js:336 | Version d’export non prise en charge. | non |
| T2960 | library-preview.js:337 | Aperçu d’un autre fichier (empreinte différente) : non importé. | non |
| T2961 | library-preview.js:339 | Image de l’aperçu invalide. | non |
| T2962 | library-preview.js:344 | Projection de l’aperçu absente : non importé. | non |
| T2963 | library-preview.js:354 | Aucun déplacement XY | oui (motif) |
| T2964 | library-preview.js:438 | Lecture de l’image PNG impossible | non |
| T2965 | library-preview.js:458 | Worker requis pour régénérer cet aperçu volumineux. Utilisez un navigateur compatible sur le PC. | non |
| T2966 | library-preview.js:459 | Lecture du fichier impossible sur ce navigateur | non |
| T2967 | library-preview.js:474 | Lecture de la réponse du serveur impossible | non |
| T2968 | library-preview.js:532 | Réponse du serveur invalide ou trop volumineuse | non |
| T2969 | library-preview.js:541 | Calcul de l’aperçu interrompu dans le Worker | non |
| T2970 | library-preview.js:543 | Réponse du Worker illisible | non |
| T2971 | library-preview.js:561 | Transfert du G-code désynchronisé | non |
| T2972 | library-preview.js:565 | Bloc de parcours invalide | non |
| T2973 | library-preview.js:573 | Aperçu indisponible | non |

## 5. Méthode, limites et ce qui n’est pas vérifié

### 5.1 Méthode

1. Les catalogues sont chargés dans une machine virtuelle Node (même mécanisme que le test `touch-codes-catalog.js`) : 2 550 lignes de texte (dont 14 du JSON `i18n-messages-v2.js`) et 140 modèles de code.
2. Tous les fichiers de `touch/` et du serveur sont lus par un analyseur syntaxique (Babel) : chaque chaîne littérale et chaque morceau de gabarit est relevé avec son contexte (appel, affectation, propriété). Les littéraux HTML sont découpés en texte, `title`, `aria-label`, `placeholder`, `alt`.
3. Une ligne du catalogue est « utilisée » quand une chaîne de la page, du serveur ou de `index.html` lui est égale (blancs normalisés) ; sinon on cherche si elle est assemblée à partir de morceaux (85 % des lettres couvertes par au moins deux littéraux) ; sinon « jamais utilisé ». Une chaîne qui ne se trouve que dans une branche `simulation ? … : …`, `if (simulation)` ou `simulation && …` est classée « simulation » (le test est faux sur la page réelle).
4. Les tables intégrées sont reconnues par leur forme : tableau de trois chaînes, objet `{ clé fr: [en, es] }`, objet `{ fr, en, es }`, motifs `[regex, en, es]`. Les motifs sont reconvertis en texte approximatif (`{x}` pour un groupe).
5. Les textes français sans traduction sont les chaînes à accent ou à mots français qui ne sont ni au catalogue ni dans une table intégrée, après retrait des contextes qui ne s’affichent pas (sélecteurs, noms d’événement, comparaisons, `console`, noms de propriété techniques). Une relecture manuelle de ces restes a écarté les faux positifs (fichiers G-code générés, noms de police, diagnostics).
6. Côté serveur, chaque `ETOUCH_*` est relié à son message par le code source (tableaux de messages, `refusal(msg, code, params)`, `{ code, message }`) ; les phrases sans code sont toutes les expressions de texte françaises hors journaux.

### 5.2 Ce que les chiffres ne disent pas

- **Écran** : déduit du fichier qui emploie le texte, pas du DOM à l’exécution. `probe-ui.js` regroupe cinq sous-écrans de la sonde, `job-controls.js` sert Fichiers et Suivi (rangé sous « Commandes »), `touch-shell.js` fabrique le Menu et le rail.
- **Type, technique, réserve, sans remède, vocabulaire** : heuristiques par mots et motifs. Relues sur échantillon (quelques dizaines de textes) pour « non traduit », « sans remède », « doublon », « jamais utilisé » et le type ; « long », « réserve » et « technique » n’ont été relus que sur les 140 textes les plus mal notés. Erreurs connues : des fragments (« hors course machine : ») reçoivent un type ; « sans remède » ne regarde que les phrases complètes ; « vocabulaire » compte « programme » et « paramètres » même quand le sens est correct (« paramètre d’arc »).
- **« jamais utilisé »** est une recherche statique : un texte construit par un chemin que je n’ai pas reconnu (concaténation inhabituelle, nom calculé) serait à tort compté mort. Les cas faibles sont signalés dans la colonne « notes » du CSV.
- **Textes de simulation encore actifs** (33), repérés par le mot « simulation », « fictif », « virtuel » : non prouvés morts sur la tablette.
- **Rien n’a été exécuté dans une page** : pas de navigateur, pas de capture, pas de rendu. Les textes sont relevés dans le code, pas lus à l’écran ; un texte coupé, masqué ou recouvert n’est pas détecté ici. Les captures existantes (`harnais-final`) n’ont pas été exploitées pour ce rapport.
- **Tests lancés** : `test-i18n.cjs` et `test-v2-i18n.cjs` (réussis) et cinq suites Jest du serveur (448 tests réussis, § 1.6). Non lancés : `job-service.test.js`, `api.touch.test.js`, `verify-project.cjs`, le harnais. L’affirmation « catalogue = serveur » repose donc sur ces suites et sur ma comparaison automatique, pas sur la suite entière.
- **Anglais et espagnol** : seule leur présence et l’absence de français évident ont été contrôlées, pas leur qualité.
- **Réécritures** : propositions de rédaction, non relues par l’opérateur ; les boutons remède cités (« Relire l’état », « Tester la sonde », « Annuler le décalage », « Reprendre au début »…) sont des idées de nom : je n’ai pas vérifié lesquels existent déjà.

### 5.3 Fichiers de travail

Les scripts d’extraction (`s1` à `s10`, analyseur Babel, tables de réécriture) sont dans le dossier jetable `…/scratchpad/refonte/textes/` et ne sont pas dans le dépôt. Pour refaire le relevé après une modification des textes, il faudra les recréer ou demander qu’ils soient versés au lot L6 (liste de contrôle des textes).

### 5.4 Fichiers livrés

- `examples/cncjs-touch/design/refonte/TEXTES.md` (ce rapport) ;
- `examples/cncjs-touch/design/refonte/audit/textes-inventaire.csv` : une ligne par texte (3134 lignes), séparateur « ; », UTF-8 avec BOM. Colonnes : id, clé, FR, EN, ES, écran, autres écrans, type, longueur, mots, drapeaux, origine, source, notes. Pour les catalogues, la clé est `fichier#rang` ; pour les tables intégrées et les textes en dur, `fichier:ligne`.
