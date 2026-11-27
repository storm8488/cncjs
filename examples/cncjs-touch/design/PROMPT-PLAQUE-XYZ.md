# Plaque XYZ Bulkman3D, changement de fraise, remise en route, durée des gros fichiers (multi-agent, 2026-11-21)

Tu écris en français ; code, commentaires et messages de commit en anglais. Dépôt `C:\Users\damou\Documents\claude\cncjs`. Base de tous les lots : `caf09b31` (version installée sur la tablette, branche `feat/fonctions-5`). Ton rôle, ton lot et ton arbre sont dans le message de l'orchestrateur. Ce document s'impose à tous.

## 1. Pourquoi

Le 18 novembre 2026, l'opérateur a usiné une ébauche puis une finition avec changement de fraise. Ce qu'il a vécu :
- un Arrêter en plein usinage a fait redémarrer la carte (fait E3 de `design/refonte/FIRMWARE.md`) : position perdue, Z refusé (`error:15`), zéro et départ refusés « machine non référencée », sans qu'il comprenne quoi faire ;
- pour changer de fraise il a dû tout refaire à la main ;
- la finition (496 555 lignes) n'avait ni durée ni barre (modèle de durée limité à 20 000 mouvements, `program-check.js:473`) ; une barre « en lignes » a été ajoutée dans `caf09b31` en attendant mieux.

Il utilise la plaque **Bulkman3D XYZ Touch Probe (TP-XYZ)** : bloc d'aluminium anodisé conducteur de **50 × 50 mm**, deux lèvres de **5 mm** qui s'accrochent sur le coin de la pièce, rebord de **10 mm**, **trou de Ø 15 mm** près du coin, pince à ressort pour fraises jusqu'à 10 mm (fiche et plan coté du fabricant ; l'épaisseur du dessus et la position exacte du trou par rapport au coin de la pièce ne sont **pas** données : à mesurer, jamais supposées).

À lire avant tout : `design/PROMPT-REFONTE-UI.md` § 2 (opérateur, tablettes, machine et faits prouvés) et § 8 (garde-fous) ; `design/refonte/SPEC-REFONTE.md` (résumé, composants communs § 6, glossaire) ; `design/refonte/SURETE.md` ; `design/refonte/FIRMWARE.md` ; le palpage existant : `src/server/services/touch/block-probe.js`, `plate-probe.js`, `touch/probe-*.js`, `touch/zero-piece.js`.

## 2. Les lots

| Lot | Fonction | Ce que l'opérateur doit pouvoir faire |
|---|---|---|
| **P1** (idées 1 et 2) | Palpage dans le trou + profil Bulkman3D | Choisir le profil « Bulkman3D XYZ », poser la plaque sur le coin, fraise au-dessus du trou : Z sur le dessus, puis X et Y par les parois du trou ; le zéro pièce X, Y, Z est posé, **sans connaître le diamètre de la fraise**. Une mesure guidée, une seule fois, fixe les deux cotes inconnues. |
| **P3** | Changement de fraise guidé | Au `M6` d'un programme, ou entre deux fichiers : la fraise monte, la broche s'arrête, l'interface dit quoi faire ; l'opérateur change la fraise, pose la plaque sur la pièce, palpe Z seul ; X et Y ne changent pas ; il reprend. |
| **P4** | Remise en route après un Arrêter | Quand la carte a perdu sa référence (`referenceLost`), une seule carte claire « La carte a redémarré : position perdue » avec un bouton « Remise en route » : prise d'origine, puis (sur confirmation) montée en Z haut et retour au-dessus du zéro pièce X/Y. Les refus actuels renvoient tous vers elle. |
| **P5** | Durée des gros fichiers | Temps restant estimé et barre en temps aussi pour un programme de plusieurs centaines de milliers de lignes ; la barre « en lignes » de `caf09b31` ne reste qu'en dernier recours. |

### Exigences par lot

**P1 — Palpage dans le trou (mouvement nouveau : conception d'abord).**
- Pars de `block-probe.js` (XYZ extérieur) : ne le casse pas, ajoute un mode « trou ». Le refus actuel `ETOUCH_PROBE_WINDOW` (« loin du trou ») reste pour le mode extérieur.
- Séquence : Z sur le dessus de la plaque (hors du trou), remontée, déplacement au-dessus du centre approché du trou, descente dans le trou à une profondeur sûre (bornée par l'épaisseur mesurée, jamais jusqu'à la pièce), puis palpage −X, +X, −Y, +Y (G38.3, vitesse lente, distance bornée par le rayon du trou + marge) ; centre = milieu des deux contacts sur chaque axe ; option seconde passe lente recentrée. Remontée hors du trou avant tout déplacement X/Y. Le diamètre de la fraise s'annule ; le diamètre mesuré du trou (écart des contacts + diamètre) n'est affiché que si le diamètre de fraise est connu, comme contrôle.
- Zéro pièce = centre du trou + décalage (dx, dy) du profil ; Z = contact − épaisseur du dessus. Écriture par `G10 L20` comme aujourd'hui, prouvée ensuite par D2 (`work-offset.js`).
- Profil « Bulkman3D XYZ (TP-XYZ) » proposé d'office, cotes connues remplies, **épaisseur et décalage du trou vides tant qu'ils ne sont pas mesurés** ; palpage refusé avec sa raison et son remède (« Mesurer la plaque… ») tant qu'ils manquent.
- Mesure guidée : épaisseur au pied à coulisse (saisie) ; décalage du trou par un palpage du trou plaque posée sur un coin dont l'origine est déjà connue (ou saisie si l'opérateur les a mesurés). Le profil garde la date de la mesure.
- Gardes : ceux du palpage actuel (repos, la main, prise d'origine faite, test de contact de la pince, course vérifiée pour chaque mouvement, Arrêter à tout instant, surveillance flux / main), plus : contact déjà fermé avant un mouvement → refus ; contact non trouvé dans la distance bornée → arrêt, remontée, raison chiffrée ; écart entre contacts incohérent avec Ø 15 mm (± tolérance) → refus, zéro non écrit.

**P3 — Changement de fraise guidé (mouvement nouveau : conception d'abord).**
- Le serveur sait déjà la pause `M6` (`observeToolChange`, broche relancée à la reprise). Ajoute : à la pause `M6` (et via un bouton « Changer de fraise… » à l'arrêt entre deux fichiers), montée à une hauteur sûre en coordonnées machine (jamais une descente), broche arrêtée et constatée arrêtée avant tout message « changez la fraise ».
- Palpage Z seul sur la plaque posée sur la pièce (profil P1 ou plaque Z existante), nouveau Z0 écrit ; X/Y inchangés et vérifiés inchangés (D2).
- Reprise : broche relancée et à vitesse avant de redescendre (temporisation existante), puis le programme continue. Toute incertitude (alarme, redémarrage de carte, zéro X/Y changé, main perdue) annule la reprise automatique et renvoie à « Reprendre à une ligne ».
- Si un programme n'a pas de `M6` (fichiers séparés ébauche / finition, cas de l'opérateur) : le parcours « entre deux fichiers » fait la même chose sans reprise.

**P4 — Remise en route (mouvement : conception courte d'abord).**
- Détection : `referenceLost` (`restart` ou `alarm`) déjà calculé par le serveur. Une carte de séance unique, avec la cause en clair, remplace les refus dispersés (`ETOUCH_START_NOT_HOMED`, `ETOUCH_ORIGIN_NOT_HOMED`, jog `error:15`, cadrage) qui gardent leur code mais renvoient au même remède.
- Le remède : prise d'origine (existante), puis proposition séparée « Aller au-dessus du zéro pièce » : Z au haut de course machine d'abord, puis X/Y du zéro pièce prouvé (D2), jamais de descente. Confirmation avec la case, Arrêter possible, course vérifiée.
- Dire ce qui est gardé (zéro pièce dans la carte, `$#`) et ce qui est perdu (position, ligne en cours → « Reprendre à une ligne »).

**P5 — Durée des gros fichiers (sans mouvement).**
- Lever la limite des 20 000 mouvements du modèle de durée sans garder 500 000 objets en mémoire : agrégats par blocs (durée cumulée par tranche de lignes) calculés en flux, mémoire bornée, temps d'analyse mesuré sur un fichier de 500 000 lignes (test).
- La durée reste « affichage seulement » (règle de `program-time.js`) ; la barre « en lignes » de `caf09b31` reste le dernier recours quand le modèle refuse (G93, arcs inconnus…).
- La Surface Pro doit rester fluide : mesurer le temps d'analyse et la mémoire avant / après, sur le PC, et dire l'extrapolation tablette.

## 3. Règles communes

1. **Sûreté d'abord.** Aucun garde-fou retiré. P1, P3, P4 ont une conception écrite et relue (Astra ultra) **avant** le code, et une entrée dans `SURETE.md` et `PROTOCOLE-ESSAI.md` (essai réel pas à pas, d'abord fraise en l'air, puis plaque sans pièce).
2. **Un arbre par lot** : `C:\Users\damou\Documents\claude\cncjs-wt\<lot>`, branche `feat/<lot>` partie de `caf09b31`. Tu n'écris que là. `node_modules` est un lien vers le dépôt principal : ne le supprime pas, n'installe rien. Fins de ligne LF.
3. **Fichiers partagés** (`index.html`, tables i18n, `verify-project.cjs`, `browser-run.cjs`, CSS communes, `job-service.js`) : modifications minimales, groupées en fin de fichier ou de section, pour limiter les conflits à la réunion.
4. Technique : JavaScript seul ; page sans framework ni build, ES2017, CSS sans `:has()`, `color-mix`, `dvh` ; toute chaîne visible en FR / EN / ES ; refus avec phrase et bouton remède (composant de la refonte) ; vocabulaire du glossaire ; aucune commande machine hors des listes blanches existantes (étends-les explicitement et teste-les).
5. Chaque comportement a son test, qui échoue sans le code ; simulateur avec le profil LUNYEE pour tout mouvement. Avant de rendre la main :
   - `node examples/cncjs-touch/verify-project.cjs`
   - `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false`
   - ESLint propre sur les fichiers touchés ; pour la page, `browser-run.cjs --strict --only <étapes concernées>` si le navigateur est disponible (sinon dis-le).
6. Aucun accès à la tablette, à la RT ni à la CNC ; pas de push ; pas de commit si ton bac à sable l'interdit (l'orchestrateur commite).
7. Dis ce que tu n'as pas vérifié.

## 4. Équipe et déroulement

| Phase | Qui | Quoi |
|---|---|---|
| A. Conception P1, P3, P4 | **Opus 5.5** (un agent par lot) | `design/plaque/P1-CONCEPTION.md`, `P3-…`, `P4-…` : commandes exactes envoyées, gardes, cas d'échec, tests exigés, essai réel. |
| A'. Contre-avis | **Astra ultra** (Codex, lecture seule) | Verdict par conception : « à réaliser » / « à revoir » avec constats ; une conception « à revoir » est corrigée avant le code. |
| B. Réalisation | P1, P3, P4 : **Opus 5.5** ; P5 : **Sol (GPT-6.1)**, démarre tout de suite | Code, tests, dans chaque arbre. |
| C. Relecture | Croisée **Sonnet 5.5** puis **Astra ultra** pour P1, P3, P4 ; **Sonnet** pour P5 | Constats classés ; l'auteur corrige. |
| D. Réunion | **Opus 5.5** | Fusion des lots verts dans `feat/plaque-xyz`, conflits, suites complètes, `IDEES.md` mis à jour. |
| E. Vérification | Harnais strict complet ; **Astra ultra** : dernier mot de sûreté sur P1, P3, P4 | `design/plaque/RAPPORT.md`. |

Un lot qui n'obtient pas « installable pour un essai encadré » d'Astra est laissé de côté et signalé ; les autres sont livrés quand même.

## 5. Livrables

- Branche locale `feat/plaque-xyz`, lots réunis, suites et harnais verts.
- `design/plaque/` : conceptions, relectures, comptes rendus, `RAPPORT.md`.
- `SURETE.md`, `PROTOCOLE-ESSAI.md`, `IDEES.md` complétés.
- Rien n'est installé ni poussé sans l'accord de l'opérateur.
