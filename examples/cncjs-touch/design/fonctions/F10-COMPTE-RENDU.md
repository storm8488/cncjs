F10 est réalisé, avec tests écrits avant le code. Aucun commit, déploiement ni accès matériel.

- Comparaison des versions toutes les 30 secondes et après reconnexion.
- Bandeau de 10 secondes ; « Plus tard » reporte de 10 minutes.
- Annulation pendant une action, un dialogue ou une saisie ; contrôle serveur avant et après le délai.
- Reprise FIGE conservée, sans rejeu de commande.

**Vérifications :** 226/226 contrôles ; Jest 52 suites et 1 545 tests ; ressources Touch 10 tests ; ESLint propre. Fins de ligne LF vérifiées.

**Fichiers partagés touchés :** catalogue i18n et CSS, blocs F10 en fin ; liste de tests dans `verify-project.cjs` ; exception de lecture statique dans `browser-run.cjs` ; compléments dans `SURETE.md` et `PROTOCOLE-ESSAI.md`. Détails et emplacements dans le [rapport F10](C:/Users/damou/Documents/claude/cncjs-wt/F10/examples/cncjs-touch/design/fonctions/F10-RAPPORT.md).

**Non vérifié :** le harnais navigateur échoue avant les scénarios avec `WebSocket error`. L’essai réel devra prouver le bandeau tactile, « Plus tard », l’absence de rechargement pendant les actions et le chargement effectif de la nouvelle version avec cache chaud, y compris après redémarrage de CNCjs.

