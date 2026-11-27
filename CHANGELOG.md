# Changelog

Fork-specific changes on top of stablyai/orca. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `orca vm env doctor` gains a `workstation` check group driven by a JSON target list (`--requirements`, `$ORCA_WORKSTATION_REQUIREMENTS`, or `~/.orca/workstation-requirements.json`; no file, no group): commands with minimum version, Claude marketplaces and plugins, PATH entries, each reported `pass` / `fail` / `skip` (not verifiable). Foreign hooks in `~/.claude/settings.json` show up as `info`. `--fix <check-id>` runs only allowlisted repairs (`claude plugin install`, `claude plugin marketplace add`, `npm install -g`, `dotnet tool install`). Format: [docs/workstation-requirements.md](docs/workstation-requirements.md). No GUI button yet.
- `config/scripts/local-fork/start-local-fork.ps1`: builds the fork from the checkout and starts it on Windows (`-Mode Dev` or `-Mode Packaged`).
- RPC method `claudePlugins.inventory`: lists the Claude plugins of an account (`accountHomePath`, default the host's) for a workspace (`worktreeId` or `cwd`), each with scope, enabled state, version, declared dependencies, skills, agents, commands and MCP servers, plus the workspace's `.mcp.json` servers. Org-synced plugins (`<name>@synced`) are included. Read from config files and plugin folders, cached for 30 s. Not yet available for SSH or WSL workspaces.
- Agent profiles (`agentProfiles` setting, Claude): a terminal start can apply a saved profile (`agentProfileId` on `launchAgentInNewTab`). The start plan adds the profile's `--settings`, `--mcp-config`, `--model`, permission and tool flags before the other launch args, so an explicit model or permission pick still wins; main writes the profile files under `<userData>/agent-profiles/<id>/` right before the PTY spawns. Refused, not silently dropped: non-Claude agents, SSH/WSL/web hosts, chats, prompts that wait for the agent, profiles with `accountId`, unknown ids. No picker or editor yet.
- `start.ps1`: one-click entry point that activates Node 24 (fnm), pnpm and the VS C++ build environment, then calls `start-local-fork.ps1`.
