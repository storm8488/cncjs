# Défauts du harnais strict déjà connus (2026-11-21, avant les lots de la nuit du 26)

Relevés sur `feat/visuel-metal` avec `node browser-run.cjs --strict` ; identiques avec et sans le thème. Tout autre défaut est nouveau.

```
- v2 real 1366x911: v2 presenter « band » not shown at rest
- v2 real 1366x911: Suivi commands moved between rest and running: more 776,324,574,274 → 776,324,574,240
- v2 real 1366x911: Suivi commands moved between rest and paused: more 776,324,574,274 → 776,324,574,240
- v2 sim 1366x911 running: zero-more-open not available to open its sheet
- v2 sim 1366x911 alarm: zero-more-open not available to open its sheet
- v2 real 1728x1152: v2 presenter « band » not shown at rest
- v2 real 1728x1152: Suivi commands moved between rest and running: more 964,324,748,274 → 964,324,748,240
- v2 real 1728x1152: Suivi commands moved between rest and paused: more 964,324,748,274 → 964,324,748,240
- v2 sim 1728x1152 running: zero-more-open not available to open its sheet
- v2 sim 1728x1152 alarm: zero-more-open not available to open its sheet
- library 1920-1080-v2-fr-standard names: comparison squeezed into a side column
- library 1920-1080-v2-fr-standard unknown: comparison squeezed into a side column
- screens: Error: timeout: library not followed
- layout word-break: sim 1366x768 fr (job running, paused, alarm, alarm at rest) · Suivi · alarm · Reprendre à une ligne… — word cut across lines: Reprendre
- layout word-break: sim 1366x768 es (job running, paused, alarm, alarm at rest) · Suivi · alarm · Reanudar desde una línea… — word cut across lines: Reanudar
- layout overlap: v2 sim 1366x911 · Préparer · loaded · Déplacer et définir l’origine / Coordonnées fictives · mm — text over text, 45 x 11 px
- layout overlap: v2 sim 1366x911 · Préparer · loaded · Déplacer et définir l’origine / X — text over text, 11 x 2 px
- layout covered: v2 sim 1728x1152 · Préparer · loaded · Aide aux repères — centre covered by Coordonnées · Aller à / Définir
- layout covered: v2 sim 1728x1152 · Préparer · loaded · Y+ — centre clipped by PlusJournalÉvénements et exportsRéglagesAffichage, systèmeMi
- layout covered: v2 sim 1728x1152 · Préparer · loaded · X− — centre clipped by 1✓Machine2✓Fichier3○Zéro pièce4!Contrôle5Usinage···Plus
- layout covered: v2 sim 1728x1152 · Préparer · loaded · Y− — centre clipped by PlusJournalÉvénements et exportsRéglagesAffichage, systèmeMi
```

`test-home-suivi.cjs` échoue dans le dépôt principal (fins de ligne CRLF) et passe dans les arbres en LF.
