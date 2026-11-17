# Six fonctions nouvelles pour CNCjs Touch, en parallèle (multi-agent, 2026-11-17)

Tu écris en français ; le code, les commentaires et les messages de commit sont en anglais. Dépôt `C:\Users\damou\Documents\claude\cncjs`, branche de départ `feat/refonte-ui` (version installée sur la tablette CNC). Ton rôle, ton lot et ton arbre de travail sont dans le message de l'orchestrateur. Ce document s'impose à tous.

## 1. Pourquoi

La refonte « le fil de la séance » (1 Machine, 2 Fichier, 3 Zéro pièce, 4 Contrôle, 5 Usinage, Plus) est installée. L'opérateur a choisi six fonctions dans `design/refonte/IDEES.md`. Chacune est réalisée par une équipe, en parallèle, dans son propre arbre ; tout est réuni à la fin.

À lire avant tout : `design/PROMPT-REFONTE-UI.md` § 2 (l'opérateur, les tablettes, la machine et ses faits prouvés) et § 8 (garde-fous) ; `design/refonte/SPEC-REFONTE.md` (résumé en tête, composants communs § 6, glossaire) ; `design/refonte/SURETE.md` ; `design/refonte/FIRMWARE.md` pour ce qui touche la carte.

## 2. Les six lots

| Lot | Fonction | Ce que l'opérateur doit pouvoir faire |
|---|---|---|
| **F1** | Cadrer la pièce à vide (CNC) | Sur 4 · Contrôle, un bouton « Cadrer à vide… » : la fraise fait le tour du rectangle du programme, en l'air, pour montrer où il passera. |
| **F2** | Remonter la fraise à la pause | En touchant Pause pendant un usinage, la fraise sort de la matière et monte à une hauteur sûre ; Reprendre la ramène puis continue. |
| **F4** | Rendre la main | Dans le dialogue « La main », un bouton « Rendre la main » : un autre appareil (PC, téléphone) peut la prendre sans motif. |
| **F5** | Reconnexion automatique | À l'ouverture de la tablette, la carte se reconnecte seule au dernier port, sans toucher « Connecter la CNC ». |
| **F10** | Rechargement automatique | Après une installation, la tablette affiche la nouvelle version d'elle-même, sans clavier. |
| **F16** | Petits écrans et portrait | L'interface est utilisable sur un téléphone tenu en hauteur (≈ 412 × 915) et sur un écran 1024 × 600 : pour surveiller, mettre en pause, arrêter. |

### Exigences par lot

**F1 — Cadrage à vide (mouvement machine nouveau : conception d'abord).**
- Le cadrage laser existe (`framePlan` dans `job-service.js`) : pars de lui, ne le casse pas.
- Hauteur : Z remonte d'abord à une hauteur sûre en coordonnées machine (proche du haut de course), jamais une descente. Puis le tour du rectangle X/Y du programme, broche à l'arrêt, puis retour au point de départ X/Y. Z ne redescend pas.
- Gardes : ceux du départ (repos, la main, prise d'origine faite, zéro pièce prouvé par D2, course vérifiée : un rectangle qui dépasse est refusé avec sa raison chiffrée), confirmation avec la case, Arrêter l'interrompt à tout instant, surveillé comme le palpage (flux perdu, main perdue).
- Vitesse lente par défaut, choisie pour qu'un obstacle (bride) laisse le temps d'arrêter.

**F2 — Remontée à la pause (mouvement machine nouveau : conception d'abord ; c'est le lot le plus délicat).**
- Fait de la carte : en « Hold », Grbl n'accepte aucun mouvement. Le firmware annonce `[OPT:PHSW]` (P = stationnement) mais rien n'est prouvé sur cette carte. La conception doit donc choisir, preuves à l'appui, entre : (a) pause « propre » : on cesse d'envoyer des lignes, la carte finit son tampon, passe au repos, puis on remonte Z ; (b) le stationnement du firmware ; (c) ne rien faire si aucune voie n'est sûre. Dans le doute, (a) ou rien.
- La pause immédiate actuelle (feed hold) reste disponible telle quelle : la remontée est une seconde action (« Pause et dégager »), ou un réglage, jamais un remplacement silencieux. Arrêter ne change pas.
- Reprise : retour en X/Y à la position mémorisée, à hauteur sûre, puis descente lente à la profondeur mémorisée, broche relancée et à vitesse avant de redescendre, puis reprise du programme à la bonne ligne avec le bon état modal (unités, G90/G91, avance, repère). Toute incertitude (alarme, redémarrage de la carte, zéro changé, main perdue) annule la reprise automatique et renvoie à « Reprendre à une ligne ».
- Course vérifiée pour chaque mouvement ajouté ; test sur le profil LUNYEE des simulateurs.

**F4 — Rendre la main.** Le serveur a déjà `control/release`. Poser le bouton dans le dialogue « La main », avec ce que ça arrête (toute séquence en cours est annulée proprement, comme le fait déjà la libération) ; refusé pendant un usinage en cours, avec la raison.

**F5 — Reconnexion automatique.** Seulement sur la page locale du kiosque (boucle locale, comme D3), seulement vers le dernier port ouvert avec succès, une tentative au chargement puis rien (pas de boucle). Rappel : ouvrir le port redémarre la carte ; ne jamais le faire si un port est déjà ouvert, ni pendant qu'un autre appareil a la main. Un réglage pour l'éteindre (Réglages).

**F10 — Rechargement automatique.** La page compare `VERSION.json` chargé et installé (la base existe depuis le lot P2 : `tablet-actions.js`). Si différent et tout au repos (pas d'usinage, de palpage, de prise d'origine, de dialogue ouvert, de saisie en cours, machine au repos ou hors ligne) : un bandeau « Nouvelle version : rechargement dans 10 s » avec « Plus tard », puis rechargement sans cache. Jamais pendant une action. Marche aussi après un redémarrage de CNCjs.

**F16 — Petits écrans et portrait.** Même page, pas de seconde interface. Sur écran étroit : le fil passe en bas ou se replie, une carte par écran, Pause et Arrêter toujours visibles et d'au moins 64 px, pas de défilement horizontal, aucun mot coupé. Priorité aux écrans 5 · Usinage et 1 · Machine (surveiller à distance), puis les autres. Les deux tablettes (1366 × 911 et 1366 × 768) ne changent pas d'un pixel : prouvé par le harnais.

## 3. Règles communes

1. **Sûreté d'abord.** Aucun garde-fou retiré. Tout mouvement nouveau (F1, F2) a sa conception écrite et relue avant le code, et une entrée dans `SURETE.md`.
2. **Un arbre par lot** : `C:\Users\damou\Documents\claude\cncjs-wt\<lot>`, branche `feat/<lot>` partie de `feat/refonte-ui`. Tu n'écris que là. Ne supprime jamais le dossier `node_modules` de ton arbre (c'est un lien vers celui du dépôt principal).
3. **Fichiers partagés** (`index.html`, tables i18n, `verify-project.cjs`, `browser-run.cjs`, CSS communes) : modifications minimales, groupées, en fin de fichier ou de section quand c'est possible, pour limiter les conflits à la réunion.
4. Technique : JavaScript seul, page sans framework ni build, ES2017, CSS sans `:has()`, `color-mix`, `dvh` ; toute chaîne visible en FR / EN / ES ; refus avec leur phrase et leur bouton remède (composant de la refonte) ; vocabulaire du glossaire.
5. Chaque comportement a son test, qui échoue sans le code. À la fin de chaque commit :
   - `node examples/cncjs-touch/verify-project.cjs`
   - `npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false`
   - ESLint propre sur les fichiers touchés ; pour la page, `browser-run.cjs --strict --only <étapes concernées>`.
6. Aucun accès à la tablette, à la RT ni à la CNC ; pas de push ; pas de fusion dans `feat/refonte-ui` (l'orchestrateur réunit).
7. Dis ce que tu n'as pas vérifié.

## 4. Équipe et déroulement

| Phase | Qui | Quoi |
|---|---|---|
| A. Conception de F1 et F2 | **Fable 5.2** (un agent par lot) ; contre-avis **Astra ultra** en lecture seule | `design/fonctions/F1-CONCEPTION.md`, `F2-CONCEPTION.md` : commandes envoyées, gardes, cas d'échec, tests exigés. |
| B. Réalisation, six arbres en parallèle | F1 et F2 : **Opus 5.5** ; F16 : **Opus 5.5** ; F4 : **Sonnet 5.5** ; F5 et F10 : **Sol (GPT-6.1)** | Code, tests, commits dans chaque arbre. F4, F5, F10 et F16 démarrent tout de suite, sans attendre la phase A. |
| C. Relecture de chaque lot | F1, F2 : **Astra ultra** puis **Fable** ; F4, F5, F10, F16 : **Sol** ou **Sonnet**, croisé (jamais l'auteur) | Constats classés ; l'auteur corrige. |
| D. Réunion | **Opus 5.5** | Fusion des six branches dans `feat/fonctions-6`, résolution des conflits, suites complètes. |
| E. Vérification finale | **Sonnet 5.5** : harnais strict complet ; **Astra ultra** : revue du tout ; **Fable** : dernier mot sur la sûreté de F1 et F2 | Rapport `design/fonctions/RAPPORT.md`, ajout au protocole d'essai réel. |

Entre les phases, l'orchestrateur relit, relance les tests lui-même, et ne réunit qu'un lot vert. Un lot qui n'aboutit pas proprement est laissé de côté et signalé : les autres sont livrés quand même.

## 5. Livrables

- Branche `feat/fonctions-6` (locale), six lots réunis, suites et harnais verts.
- `design/fonctions/` : conceptions F1 et F2, comptes rendus par lot, `RAPPORT.md` (ce qui est fait, ce qui est laissé, ce qui n'est pas vérifié).
- `design/refonte/SURETE.md` et `PROTOCOLE-ESSAI.md` complétés : chaque mouvement nouveau a son essai réel pas à pas, d'abord fraise en l'air.
- Rien n'est installé ni poussé sans l'accord de l'opérateur.
