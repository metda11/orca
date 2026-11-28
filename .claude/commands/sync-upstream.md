---
description: Fork-main per Merge mit stablyai/orca (upstream) synchronisieren
---

Synchronisiere `main` mit `upstream/main` (Regeln: CLAUDE.md, Abschnitt Upstream-Sync).

1. Voraussetzungen prüfen: Remote `upstream` vorhanden (sonst `git remote add upstream https://github.com/stablyai/orca.git`), Arbeitsbaum sauber, keine offenen Agent-/Workflow-PRs, die gerade nach `main` gemergt werden (`gh pr list --repo metda11/orca --state open`). Sonst anhalten und melden.
2. Backup anlegen, bevor etwas passiert: `git switch main && git pull origin main && git branch backup/pre-sync-$(date +%Y%m%d) main && git push origin backup/pre-sync-$(date +%Y%m%d)`. Rückgängig machen: `git revert -m 1 <Merge-Commit>` (nie `reset --hard` + Force-Push).
3. `git fetch upstream && git merge upstream/main`. Kein Rebase, kein Force-Push.
4. Konflikte lösen (beide Seiten erhalten, Upstream-Dateien minimal ändern). Bei einem Großmerge geht das nur von Hand: pro Konflikt klären, was Upstream geändert hat (`git diff main...upstream/main -- <datei>`), und unsere Aufrufe/Registrierungen an die neue Struktur anpassen. Generierte Dateien neu erzeugen (`pnpm run sync:localization-runtime-catalog`, `pnpm run sync:localization-protected-copy`). Dann `pnpm run typecheck` (muss grün sein), Lint und die Tests unserer Bereiche (agent-profile, claude, automations, runtime/rpc, settings) laufen lassen, committen. Vitest immer mit `--config config/vitest.config.ts --exclude '.claude/**'`, sonst zieht es die Worktrees mit und läuft in Out-of-Memory. `check:code-quality:changed` bricht bei einem Großmerge unter Windows mit ENAMETOOLONG ab (zu viele Dateien); ersatzweise `oxlint` und `oxfmt --check` auf den betroffenen Ordnern.
5. `git push origin main`. Danach offene Feature-Branches mit `git merge main` nachziehen.
