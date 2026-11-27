# Changelog

Fork-specific changes on top of stablyai/orca. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `config/scripts/local-fork/start-local-fork.ps1`: builds the fork from the checkout and starts it on Windows (`-Mode Dev` or `-Mode Packaged`).
- RPC method `claudePlugins.inventory`: lists the Claude plugins of an account (`accountHomePath`, default the host's) for a workspace (`worktreeId` or `cwd`), each with scope, enabled state, version, declared dependencies, skills, agents, commands and MCP servers, plus the workspace's `.mcp.json` servers. Org-synced plugins (`<name>@synced`) are included. Read from config files and plugin folders, cached for 30 s. Not yet available for SSH or WSL workspaces.
- Agent profiles (`agentProfiles` setting, Claude): a terminal start can apply a saved profile (`agentProfileId` on `launchAgentInNewTab`). The start plan adds the profile's `--settings`, `--mcp-config`, `--model`, permission and tool flags before the other launch args, so an explicit model or permission pick still wins; main writes the profile files under `<userData>/agent-profiles/<id>/` right before the PTY spawns. Refused, not silently dropped: non-Claude agents, SSH/WSL/web hosts, chats, prompts that wait for the agent, profiles with `accountId`, unknown ids. No picker or editor yet.
- Agent profiles, central and default: setting `agentProfileCentralDir` points at a folder of `*.json` profiles that Orca only reads, never writes; they are read-only and win over a local profile of the same id (the local one stays untouched). Orca warns when group or others can write to the folder (not checked on Windows) and skips invalid or duplicate files. Bundled default profiles (`orca-plan`, `orca-review`) are copied once into `agentProfiles`; a copy that still equals what was copied while the template changed is classified `outdated`, a changed copy `edited`. IPC `app:getAgentProfileCatalog` lists origin, read-only flag and state per profile; `app:resetDefaultAgentProfile` restores the template and keeps an edited copy as `<id>-edited`. Launches resolve central profiles too. No picker or editor UI yet.
- `start.ps1`: one-click entry point that activates Node 24 (fnm), pnpm and the VS C++ build environment, then calls `start-local-fork.ps1`.
