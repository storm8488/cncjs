# Six fonctions choisies par l'opérateur (multi-agent, nuit du 2026-11-26)

Tu écris en français ; code, commentaires et messages de commit en anglais. Dépôt `C:\Users\damou\Documents\claude\cncjs`. Base de tous les lots : branche `feat/nuit-2026-11-26` (= version installée sur la tablette le 21 novembre : refonte, durée des gros fichiers, « position perdue », visuel « Métal d'atelier »). Ton rôle, ton lot et ton arbre sont dans le message de l'orchestrateur. Ce document s'impose à tous.

## 1. Pourquoi

L'opérateur (amateur, bois et MDF, debout devant une Surface Pro 1366 × 911, CNC LUNYEE 4040, Grbl 1.1f sur ESP32) a choisi le 26 novembre six fonctions parmi huit proposées après une recherche documentaire. Il dort : personne ne répond aux questions cette nuit. Rien ne sera installé avant son essai. Tout doute de sûreté se résout par le choix le plus prudent, écrit dans ton compte rendu.

À lire avant tout : `design/PROMPT-REFONTE-UI.md` § 2 (opérateur, tablettes, machine, faits prouvés) et § 8 (garde-fous) ; `design/refonte/SPEC-REFONTE.md` (résumé, composants communs § 6, glossaire) ; `design/refonte/SURETE.md` ; `design/refonte/FIRMWARE.md`.

## 2. Les lots

| Lot | Idées | Ce que l'opérateur doit pouvoir faire |
|---|---|---|
| **N1** Analyse du programme | 1, 2, 6 | Voir, avant de démarrer : (1) si le programme descend plus bas que l'épaisseur du brut qu'il a saisie ; (2) la liste des fraises que le fichier demande ; (6) si la broche a le temps de monter en vitesse avant la première descente dans la matière. |
| **N3** Notification | 3 | Être prévenu, sans rester devant l'écran, quand l'usinage finit, se met en pause (y compris `M0` / `M6`) ou part en alarme. |
| **N8** Sauvegarde des réglages | 8 | Enregistrer les réglages `$$` de la carte dans un fichier daté sur le serveur, voir la liste des sauvegardes, comparer la carte à une sauvegarde. |
| **N4** Position de changement de fraise | 4 | Un bouton qui monte Z en haut puis amène la broche à une position enregistrée, pour changer la fraise à l'aise. |

### Exigences par lot

**N1 — Analyse du programme (sans mouvement).** Le contrôle du programme existe : `src/server/services/touch/program-check.js` (analyse en flux), affiché sur 2 · Fichier et 4 · Contrôle. Étends-le, ne le double pas.
- (1) Profondeur / brut : l'opérateur saisit l'épaisseur du brut en mm (clavier de la page, valeur gardée par fichier ou par séance, jamais inventée). L'analyse connaît déjà le Z le plus bas du programme par rapport au zéro pièce. Affiche : profondeur maximale, épaisseur saisie, écart. Si la profondeur dépasse l'épaisseur : **avertissement** clair (« La fraise descend 1,5 mm sous le brut : elle touchera le martyr »), pas un refus : traverser de peu est normal en détourage. Dis sur quelle hypothèse repose le calcul (zéro Z sur le dessus du brut) et propose le cas « zéro Z sur le martyr ». Sans épaisseur saisie : rien d'alarmant, une invitation discrète.
- (2) Fraises du programme : relève en flux les `T<n>`, `M6`, et les commentaires d'outil usuels des post-processeurs (Fusion 360, VCarve / Aspire, Estlcam, FreeCAD : `(T1 D=6 ...)`, `; Tool: ...`, `(TOOL/MILL,...)`, etc.). Affiche une liste courte : numéro, description telle qu'écrite dans le fichier, ligne du premier usage. Si rien n'est trouvé, dis « Le fichier n'indique pas sa fraise ». Texte du fichier affiché tel quel, échappé, borné en longueur et en nombre.
- (6) Attente de la broche : relève le premier `M3` / `M4`, la temporisation `G4` qui le suit éventuellement, et le premier mouvement d'usinage (G1 / G2 / G3 avec Z sous le zéro, ou descente). Calcule le temps, d'après le modèle de durée existant (`program-time.js`), entre le démarrage de la broche et la première entrée dans la matière. Si ce temps est inférieur au seuil (réglage, 3 s par défaut, donnée d'affichage) : **avertissement** (« La broche n'a que 0,4 s pour monter en vitesse »), avec le remède (ajouter une temporisation dans le post-processeur). Aucune modification du programme envoyé, aucune pause injectée. Si le modèle de durée refuse le fichier, dis « non calculé », pas « correct ».
- Les trois résultats sont des **avertissements d'affichage** : ils ne bloquent pas le départ, ne changent ni le programme ni les gardes existantes. Mémoire bornée sur un fichier de 500 000 lignes (test), temps d'analyse mesuré avant / après.

**N3 — Notification (sans mouvement, page seule de préférence).**
- Événements : fin d'usinage, pause (opérateur, `M0`, `M1`, `M6`, feed hold), alarme. Sources : états déjà publiés par le serveur ; ne crée pas un second canal.
- Forme : un grand bandeau en plein écran partiel, lisible à trois mètres (texte et pictogramme, couleur de sûreté existante), qui reste jusqu'au toucher ; et un son. Le son est généré par la page (Web Audio, pas de fichier téléchargé), court, distinct pour fin / pause / alarme, volume réglable, coupable (réglage « cette tablette »). Chromium bloque le son sans geste préalable : arme le son au premier toucher de la séance et dis-le quand il n'est pas armé. Bouton « Essayer le son » dans les réglages.
- Jamais de son ni de bandeau pour un événement ancien au chargement de la page (rejoue seulement ce qui arrive pendant que la page regarde). Le bandeau ne masque jamais Pause ni Arrêter, ne vole pas le focus d'une confirmation en cours, et ne se ferme pas tout seul sur une alarme.
- La RT (Chromium 106, v1 Éco) ne doit rien perdre : pas d'animation continue, pas d'API absente de Chromium 106 sans repli.

**N8 — Sauvegarde des réglages `$$` (sans mouvement, lecture seule de la carte).**
- Le serveur lit déjà les réglages (`$$`) à la connexion (voir le contrôleur Grbl et « Réglages lus » sur 1 · Machine). Enregistre-les à la demande dans un fichier JSON daté dans un dossier du serveur prévu pour cela (à côté des données Touch existantes ; regarde où `history.js` et `projects.js` écrivent), avec : date, version du firmware (`$I` si connue), les paires `$n=valeur`, le nom du profil machine. Nombre de sauvegardes borné (les plus anciennes sont supprimées, sauf la première).
- Page : dans Plus → Réglages → Machine et performances (ou Système), une carte « Sauvegarde des réglages de la carte » : « Sauvegarder maintenant », liste datée, « Comparer à la carte » (liste des `$n` différents, ancienne → actuelle, libellé humain quand il est connu), « Exporter » (le fichier, par la voie d'export existante du journal).
- **Aucune restauration** dans ce lot : écrire des `$n=` dans la carte est une action de sûreté qui demande l'opérateur présent. Dis-le dans la carte (« La restauration se fait à la main, réglage par réglage »). Aucune commande nouvelle envoyée à la machine : si la lecture `$$` doit être relancée, utilise la voie existante (« Relire »), refusée pendant un usinage comme aujourd'hui.
- Bonus utile, sans mouvement : au chargement des réglages, si la carte diffère de la dernière sauvegarde, une ligne discrète « 2 réglages ont changé depuis la sauvegarde du … » (cas réel : un redémarrage de carte ne doit pas changer `$`, un changement est un signal).

**N4 — Position de changement de fraise (mouvement nouveau : conception d'abord).**
- Phase A (cette nuit) : `design/plaque/N4-CONCEPTION.md`. Commandes exactes envoyées, ordre, gardes, cas d'échec, tests exigés, essai réel pas à pas. Pars de ce qui existe et a été relu : le « Cadrer à vide » (lot F1, `design/fonctions/`), `motion.js`, `motion-preflight.js`, la course vérifiée, la montée de Z seul en coordonnées machine. Lis `design/plaque/P4-CONCEPTION.md` et les trois refus d'Astra résumés dans `IDEES.md` (I-27) : ne refais pas ces erreurs.
- Principe attendu : position enregistrée **en coordonnées machine** (X, Y ; Z = haut de course moins la marge existante), enregistrée par l'opérateur depuis la position courante (« Enregistrer cette position »), jamais inventée. Mouvement : Z monte seul d'abord (`G53`), broche constatée arrêtée avant, puis X / Y (`G53 G0`), **jamais de descente**. Refusé : pendant un usinage, sans prise d'origine, position perdue, alarme, pas la main, position hors course, broche qui tourne. Confirmation avec la case, Arrêter possible à tout instant, surveillance comme le cadrage.
- Le zéro pièce n'est pas touché. L'interface dit ensuite : « Changez la fraise, puis refaites le zéro Z » et renvoie à 3 · Zéro pièce.
- Phase A' : contre-avis d'Astra ultra (lecture seule). Phase B (code) **seulement si** le verdict est « à réaliser ». Sinon la conception corrigée reste pour l'opérateur.

## 3. Règles communes

1. **Sûreté d'abord.** Aucun garde-fou retiré ni assoupli. Aucune commande machine hors des listes blanches existantes ; N4 seul peut en étendre une, explicitement, avec test. N1, N3, N8 n'envoient rien de nouveau à la machine.
2. **Un arbre par lot** : `C:\Users\damou\Documents\claude\cncjs-wt\<lot>`, branche `feat/<lot>`. Tu n'écris que là. `node_modules` est un lien vers le dépôt principal : ne le supprime pas, n'installe rien. Fins de ligne LF.
3. **Fichiers partagés** (`index.html`, tables i18n, `verify-project.cjs`, `browser-run.cjs`, CSS communes, `job-service.js`, `program-check.js` hors N1) : modifications minimales, groupées en fin de fichier ou de section, pour limiter les conflits à la réunion.
4. Technique : JavaScript seul ; page sans framework ni build, ES2017, CSS sans `:has()`, `color-mix`, `dvh` ; toute chaîne visible en FR / EN / ES ; composants et vocabulaire de la refonte (glossaire) ; couleurs par les jetons (`--ok`, `--warn`, `--danger`, `--surface`…) pour que le thème `theme-metal.css` s'applique ; cibles tactiles ≥ 48 px ; rien qui déborde à 1366 × 768 et 1366 × 911.
5. Chaque comportement a son test, qui échoue sans le code. Avant de rendre la main :
   - `node examples/cncjs-touch/verify-project.cjs`
   - `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false`
   - ESLint propre sur les fichiers touchés ; pour la page, `node examples/cncjs-touch/browser-run.cjs --strict --only <étapes concernées>` (long : choisis les étapes). Défauts déjà connus et tolérés du harnais : la liste est dans `design/plaque/HARNAIS-CONNU.md` ; tout **autre** défaut est à toi.
6. Aucun accès à la tablette, à la RT ni à la CNC ; pas de push ; l'auteur commite dans sa branche (`git -c core.autocrlf=false commit`), un commit par étape cohérente, message en anglais terminé par `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Jamais de `--no-verify`.
7. Dis ce que tu n'as pas vérifié. Un compte rendu court dans `design/plaque/<lot>-RAPPORT.md` : ce que l'opérateur voit, fichiers touchés, tests, limites, essai réel proposé.

## 4. Équipe et déroulement

| Phase | Qui | Quoi |
|---|---|---|
| A. Réalisation N1, N3, N8 ; conception N4 | un agent par lot, en parallèle | Code et tests ; conception pour N4. |
| B. Relecture | un agent relecteur par lot, indépendant | Constats classés (bloquant / important / mineur), sûreté d'abord, preuves (fichier:ligne, test rejoué). |
| C. Correction | l'auteur | Corrige les bloquants et importants, relance les suites. |
| A'. Contre-avis N4 | Astra ultra (Codex, lecture seule), lancé par l'orchestrateur | « à réaliser » / « à revoir ». |
| D. Réunion | l'orchestrateur | Fusion des lots verts dans `feat/nuit-2026-11-26`, suites complètes, harnais, `IDEES.md`, push de la branche. |

Un lot non vert au matin est laissé de côté et signalé ; les autres sont livrés quand même.

## 5. Livrables

- Branche `feat/nuit-2026-11-26` poussée, lots réunis, suites vertes ; rien d'installé.
- `design/plaque/` : rapports par lot, conception N4 et son verdict.
- `PROTOCOLE-ESSAI.md` : un essai réel par fonction ; `IDEES.md` à jour.
