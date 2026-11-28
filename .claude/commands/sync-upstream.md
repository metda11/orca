---
description: Fork-main per Merge mit stablyai/orca (upstream) synchronisieren
---

Synchronisiere `main` mit `upstream/main` (Regeln: CLAUDE.md, Abschnitt Upstream-Sync).

1. Voraussetzungen prüfen: Remote `upstream` vorhanden (sonst `git remote add upstream https://github.com/stablyai/orca.git`), Arbeitsbaum sauber, keine offenen Agent-/Workflow-PRs, die gerade nach `main` gemergt werden (`gh pr list --repo metda11/orca --state open`). Sonst anhalten und melden.
2. Backup anlegen, bevor etwas passiert: `git switch main && git pull origin main && git branch backup/pre-sync-$(date +%Y%m%d) main && git push origin backup/pre-sync-$(date +%Y%m%d)`. Rückgängig machen: `git revert -m 1 <Merge-Commit>` (nie `reset --hard` + Force-Push).
3. `git fetch upstream && git merge upstream/main`. Kein Rebase, kein Force-Push.
4. Konflikte lösen (beide Seiten erhalten, Upstream-Dateien minimal ändern), Typecheck/Lint/relevante Tests laufen lassen, committen.
5. `git push origin main`. Danach offene Feature-Branches mit `git merge main` nachziehen.
