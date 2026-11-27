# CLAUDE.md

Fork von `stablyai/orca` (INNONAV, `metda11/orca`). Die Projektregeln stehen in
[`AGENTS.md`](./AGENTS.md) und gelten unverändert. Diese Datei ergänzt nur, was der Fork
zusätzlich braucht.

## Arbeitsstand (GitHub Issues)

Board: GitHub Issues

Offene Arbeit dieses Repos steht in den Issues von metda11/orca; Unterordner als Label
`pfad:<ordner>`. Sessionstart: `/board-next`. Neue Punkte, Übergabe, Abschluss: `/board-write`.
PRs verweisen mit `Refs #<n>`, nie mit `Closes`/`Fixes`/`Resolves`. Keine lokalen Todos daneben.

## Arbeitsplatz-Check

Soll-Liste und Allowlist der Fixes für `orca vm env doctor`: [docs/workstation-requirements.md](docs/workstation-requirements.md). INNONAV-Inhalte der Liste gehören nicht ins Repo (Upstream-tauglich bleiben).

## Upstream-Sync (stablyai/orca)

Remotes: `origin` = metda11/orca, `upstream` = stablyai/orca (einmalig:
`git remote add upstream https://github.com/stablyai/orca.git`). Ablauf: `/sync-upstream`.

- Per **Merge** synchronisieren (`git merge upstream/main`), nie rebasen und nie Force-Push auf `main`:
  mehrere Sessions und Worktrees bauen auf `main` auf.
- Nicht synchronisieren, solange Agents oder Workflows PRs nach `main` mergen.
- Eigene Änderungen in neuen Dateien/Verzeichnissen halten (z. B. `src/shared/agent-profile/`), Änderungen
  an Upstream-Dateien klein halten. Konflikt im Merge lösen und committen, beide Seiten erhalten.
- Offene Feature-Branches danach mit `git merge main` nachziehen.
- Alternativ GitHub „Sync fork“ → „Update branch“, danach lokal `git pull`.
