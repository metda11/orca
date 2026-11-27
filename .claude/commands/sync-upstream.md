---
description: Fork-main per Merge mit stablyai/orca (upstream) synchronisieren
---

Synchronisiere `main` mit `upstream/main` (Regeln: CLAUDE.md, Abschnitt Upstream-Sync).

1. Voraussetzungen prüfen: Remote `upstream` vorhanden (sonst `git remote add upstream https://github.com/stablyai/orca.git`), Arbeitsbaum sauber, keine offenen Agent-/Workflow-PRs, die gerade nach `main` gemergt werden (`gh pr list --repo metda11/orca --state open`). Sonst anhalten und melden.
2. `git fetch upstream && git switch main && git pull origin main && git merge upstream/main`. Kein Rebase, kein Force-Push.
3. Konflikte lösen (beide Seiten erhalten, Upstream-Dateien minimal ändern), Typecheck/Lint/relevante Tests laufen lassen, committen.
4. `git push origin main`. Danach offene Feature-Branches mit `git merge main` nachziehen.
