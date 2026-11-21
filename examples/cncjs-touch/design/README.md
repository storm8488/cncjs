# Index de `design/`

Ce dossier rassemble les documents de conception de CNCjs Touch : spécifications, règles de sûreté, rapports, prompts des chantiers multi-agents, maquettes et captures. Il est écrit en français. Le point d'entrée du projet est [../README.md](../README.md) (en anglais).

Rien n'a été déplacé lors du rangement du 2026-11-21 : plusieurs de ces fichiers sont cités par des scripts, des tests ou des commentaires du code, et beaucoup se citent entre eux. Ce document classe donc les fichiers là où ils sont.

**Ne pas déplacer** (lus à l'exécution par un test ou un script) : [ops/essai-xy-reel.cjs](ops/essai-xy-reel.cjs) (lancé par `test-essai-xy-reel.cjs`), [refonte/audit/commandes-machine.json](refonte/audit/commandes-machine.json) (lu par `test-commandes-migration.cjs`), le dossier [ops/sim-surface/](ops/sim-surface/) (scripts qui s'appellent entre eux).

## 1. En vigueur

Les documents qui décrivent la version installée (`caf09b31`) et ce qui reste à faire.

| Document | Objet |
|---|---|
| [refonte/SPEC-REFONTE.md](refonte/SPEC-REFONTE.md) | L'organisation des écrans : le fil de la séance (1 Machine, 2 Fichier, 3 Zéro pièce, 4 Contrôle, 5 Usinage, Plus), référence de la réalisation. Commence par « Ce qui change pour vous ». |
| [refonte/SURETE.md](refonte/SURETE.md) | Règles et états de sûreté tenus par le serveur, puis une section par fonction ajoutée (FIGE, F5, F10, F1, F4). |
| [refonte/FIRMWARE.md](refonte/FIRMWARE.md) | Le firmware de la carte LUNYEE 4040 (famille Grbl_ESP32, bannière 1.1f) d'après les sources amont, et les sept observations de la carte que le code amont n'explique pas. |
| [refonte/PROTOCOLE-ESSAI.md](refonte/PROTOCOLE-ESSAI.md) | Le protocole d'essai réel de la refonte et des fonctions du 17 novembre (§ 8 : F5, F10, F1). Aucun essai n'y est noté comme fait. |
| [refonte/IDEES.md](refonte/IDEES.md) | Registre des fonctions proposées : décisions à prendre, réalisé le 17 novembre, écarté, mis de côté (I-23, I-24). |
| [fonctions/RAPPORT.md](fonctions/RAPPORT.md) | Rapport de la réunion des fonctions du 17 novembre 2026 : F1, F4, F5, F10, F16 réunies, F2 laissée dehors ; résultats des suites ; ce qui n'est pas vérifié ; comment essayer chaque nouveauté. |
| [refonte/RAPPORT.md](refonte/RAPPORT.md) | Rapport de la refonte (16 novembre) : avant et après par écran, défauts traités, harnais, mesures, ce qui reste, commits. Le fichier commence sans titre, par une liste de huit points. |
| [fonctions/F1-CONCEPTION.md](fonctions/F1-CONCEPTION.md), [fonctions/F1-CORRECTIONS.md](fonctions/F1-CORRECTIONS.md) | Conception et corrections du cadrage à vide (F1), cités par le code serveur et ses tests. |

## 2. Références de la refonte (15-16 novembre 2026)

Documents d'appui de la spécification ; historiques, mais encore cités par elle et par le code.

| Document | Objet |
|---|---|
| [refonte/PLAN-CORRECTIONS.md](refonte/PLAN-CORRECTIONS.md) | Plan des corrections et contrat du serveur (cité par `grbl-simulator/`). |
| [refonte/CONSTATS.md](refonte/CONSTATS.md) | Constats de la chasse aux bugs de la refonte. |
| [refonte/ERGONOMIE.md](refonte/ERGONOMIE.md) | Analyse ergonomique, base de la spécification. |
| [refonte/TEXTES.md](refonte/TEXTES.md) | Inventaire des textes de l'interface. |
| [refonte/VEILLE.md](refonte/VEILLE.md) | Veille sur les interfaces voisines. |
| [refonte/audit/](refonte/audit/BASE.md) | Audits de la phase 1 (A1 sûreté serveur, A2 page, A3 kiosque et hôte, A4 régressions, BASE, MESURES, COMMANDES-MACHINE, ECARTS-PLAN) et contre-vérifications de la phase 2 (V1 à V4), avec `textes-inventaire.csv` et `commandes-machine.json`. |
| [refonte/propositions/](refonte/propositions/JURY.md) | Les trois propositions concurrentes (A « fil de la séance », retenue ; B « poste de pilotage » ; C « le minimum »), les deux critiques et le jugement du jury. |
| [refonte/maquettes/](refonte/maquettes/LISEZMOI.md) | Maquettes statiques des écrans de la spécification. Les vignettes de la planche dépendent des captures de `refonte/files/`, non suivies. |

## 3. Fonctions du 17 novembre 2026 : comptes rendus et relectures

| Document | Objet |
|---|---|
| [fonctions/F1-COMPTE-RENDU.md](fonctions/F1-COMPTE-RENDU.md) | Compte rendu du lot F1 (cadrage à vide). |
| [fonctions/F4-COMPTE-RENDU.md](fonctions/F4-COMPTE-RENDU.md) | Compte rendu du lot F4 (rendre la main). |
| [fonctions/F5-COMPTE-RENDU.md](fonctions/F5-COMPTE-RENDU.md), [fonctions/F5-RAPPORT.md](fonctions/F5-RAPPORT.md) | Lot F5 (reconnexion automatique). |
| [fonctions/F10-COMPTE-RENDU.md](fonctions/F10-COMPTE-RENDU.md), [fonctions/F10-RAPPORT.md](fonctions/F10-RAPPORT.md) | Lot F10 (rechargement automatique). |
| [fonctions/F16-COMPTE-RENDU.md](fonctions/F16-COMPTE-RENDU.md) | Lot F16 (petits écrans et portrait). |
| [fonctions/F2-CONCEPTION.md](fonctions/F2-CONCEPTION.md), [fonctions/F2-CORRECTIONS.md](fonctions/F2-CORRECTIONS.md), [fonctions/F2-COMPTE-RENDU.md](fonctions/F2-COMPTE-RENDU.md) | F2 « Pause et dégager » : **non installée, non fusionnée**, refusée par la quatrième relecture de sûreté ; code publié sur la branche `idees/F2-pause-degager`. |
| [fonctions/relectures/](fonctions/relectures/astra4-F1.md) | Relectures de sûreté successives d'Astra (Codex) : `astra`, `astra2`, `astra3`, `astra4`, pour F1 et pour F2. |

## 4. Exploitation

| Fichier | Objet |
|---|---|
| [ops/essai-xy-reel.cjs](ops/essai-xy-reel.cjs) | Script d'essai XY réel (14 novembre), lancé par un test. |
| [ops/sim-surface/](ops/sim-surface/) | Banc de simulation sur la Surface : pont pty, simulateur, garde, fenêtre de test, endurance. |
| [ops/maj-securite-rt.sh](ops/maj-securite-rt.sh) | Script de mise à jour de sécurité de la Surface RT (7 novembre). |

## 5. Historique daté : prompts des chantiers et lots passés

Prompts donnés aux équipes d'agents, du plus récent au plus ancien. Ils décrivent ce qui était demandé à leur date, pas l'état actuel.

| Date | Document | Chantier |
|---|---|---|
| 2026-11-21 | [PROMPT-RANGEMENT-DEPOT.md](PROMPT-RANGEMENT-DEPOT.md) | Rangement du dépôt (ce document-ci, les README, `.gitignore`). |
| 2026-11-17 | [PROMPT-FONCTIONS-6.md](PROMPT-FONCTIONS-6.md) | Les six fonctions F1, F2, F4, F5, F10, F16. |
| 2026-11-15 | [PROMPT-REFONTE-UI.md](PROMPT-REFONTE-UI.md) | La refonte ; contient le journal de terrain du 14 novembre (premiers vrais usinages). |
| 2026-11-14 | [PROMPT-PALPAGE-XYZ.md](PROMPT-PALPAGE-XYZ.md) | Palpage réel X, Y et XYZ. |
| 2026-11-14 | [PROMPT-INTERFACE-REELLE.md](PROMPT-INTERFACE-REELLE.md) | Fin des modes « vérification seule ». |
| 2026-11-14 | [PROMPT-FINITIONS.md](PROMPT-FINITIONS.md) | Finitions de l'interface réelle. |
| 2026-11-13 | [PROMPT-REGLAGES-PERF.md](PROMPT-REGLAGES-PERF.md) | Réglages : défauts visuels et lenteur. |
| 2026-11-10 | [PROMPT-REPETITION-PANNES.md](PROMPT-REPETITION-PANNES.md) | Répétition générale avant la machine, chasse aux pannes, endurance. |
| 2026-11-10/11 | [PROTOCOLE-ESSAI-CNC-V2.md](PROTOCOLE-ESSAI-CNC-V2.md) | Protocole d'essai de la v2 (branche `feat/ecrans-ergonomie`), remplacé par `refonte/PROTOCOLE-ESSAI.md`. |
| 2026-11-09 | [PROMPT-AVANT-ESSAI-CNC.md](PROMPT-AVANT-ESSAI-CNC.md) | Préparation avant le premier essai sur la CNC. |
| 2026-11-08 | [PROMPT-ECRANS-MULTIAGENT.md](PROMPT-ECRANS-MULTIAGENT.md) | Audit des écrans (captures dans `ecrans/`). |
| 2026-11-07 | [PROMPT-REGLAGES-MULTIAGENT.md](PROMPT-REGLAGES-MULTIAGENT.md) | Réglages (branche `v2/integration`, captures dans `reglages/`). |
| 2026-11-07 | [ops/PROMPT-SECURITE-MAJ.md](ops/PROMPT-SECURITE-MAJ.md) | Sécurité et mises à jour des tablettes. |
| 2026-11-06 | [v2/PERFORMANCE-V2-PROMPT.md](v2/PERFORMANCE-V2-PROMPT.md) | Performance v2. |
| 2026-11-05 | [lot-D.md](lot-D.md), [lot-O.md](lot-O.md), [lot-V.md](lot-V.md) | Lots de la phase 2 « Performance UI » (poste large, origine visuelle, 3D en direct). |

### Performance v2 (novembre 2026)

| Document | Objet |
|---|---|
| [v2/REFLEXION.md](v2/REFLEXION.md) | Réflexion de Performance v2 (6 novembre), citée par le code de la page. |
| [v2/PERFORMANCE-V2-USAGE.md](v2/PERFORMANCE-V2-USAGE.md) | Usage de la v2 (16 novembre). |
| [v2/PERFORMANCE-V2-VALIDATION.md](v2/PERFORMANCE-V2-VALIDATION.md) | Validation de la v2. |
| [v2/performance-v2.html](v2/performance-v2.html), [v2/performance-v2-preparer.html](v2/performance-v2-preparer.html) | Maquettes de la v2, avec leurs deux captures PNG. |

### Études

| Date | Document | Objet |
|---|---|---|
| 2026-11-10 | [ETUDE-RUST-SANS-CHROMIUM.md](ETUDE-RUST-SANS-CHROMIUM.md) | Passer en Rust pour se passer de Chromium ? Verdict : non pour l'instant ; essayer WPE/Cog sur la RT le jour où on la reprend. |

### Maquettes anciennes

| Date | Document | Objet |
|---|---|---|
| 2026-11-05 | [performance-suivi.html](performance-suivi.html), [performance-fichiers.html](performance-fichiers.html), [performance-preparer.html](performance-preparer.html) | Maquettes de « Performance UI ». |
| 2026-10-18 | [components.html](components.html), [mockups-2027.html](mockups-2027.html) | Composants et maquettes de l'UI 2027 (écrans d'avant la refonte). |

### Captures de travail

- [ecrans/](ecrans/) (lot « écrans », 8 novembre) : pages HTML et feuilles CSS d'avant et d'après, par écran (`files`, `history`, `home`, `jog`, `machine`, `menu`, `transverse`). Les PNG de ce dossier ne sont pas suivis (`.gitignore`).
- [reglages/](reglages/) (lot « Réglages », 7 novembre) : captures HTML et PNG de Réglages, en 1366 × 768 (v1) et 1366 × 911 (v2), français et espagnol. Ces PNG sont suivis depuis leur lot.
- `refonte/files/` : rendus PNG des maquettes de la refonte, non suivis (`.gitignore`).
