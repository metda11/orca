# Changelog

Fork-specific changes on top of stablyai/orca. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `config/scripts/local-fork/start-local-fork.ps1`: builds the fork from the checkout and starts it on Windows (`-Mode Dev` or `-Mode Packaged`).
- RPC method `claudePlugins.inventory`: lists the Claude plugins of an account (`accountHomePath`, default the host's) for a workspace (`worktreeId` or `cwd`), each with scope, enabled state, version, declared dependencies, skills, agents, commands and MCP servers, plus the workspace's `.mcp.json` servers. Org-synced plugins (`<name>@synced`) are included. Read from config files and plugin folders, cached for 30 s. Not yet available for SSH or WSL workspaces.
- Agent profiles (`agentProfiles` setting, Claude): a terminal start can apply a saved profile (`agentProfileId` on `launchAgentInNewTab`). The start plan adds the profile's `--settings`, `--mcp-config`, `--model`, permission and tool flags before the other launch args, so an explicit model or permission pick still wins; main writes the profile files under `<userData>/agent-profiles/<id>/` right before the PTY spawns. Refused, not silently dropped: non-Claude agents, SSH/WSL/web hosts, chats, prompts that wait for the agent, profiles with `accountId`, unknown ids. No picker or editor yet.
- Agent profile preflight: before a profile start, main checks the profile against this machine (plugin installed and its folder present, `--plugin-dir` exists, MCP server definition, startup script on disk, credential variables set (name only, a warning), tool names only on servers inside the strict MCP scope, `--agent` resolvable, managed `disableSideloadFlags` from `managed-settings.json`, `managed-settings.d` and the Windows HKLM/HKCU `Settings` policy). Errors block the start with the findings as the spawn error; the check reads inventory and files only (no network). IPC `app:preflightAgentProfile` / `window.api.app.preflightAgentProfile` returns the findings for a picker. The real MCP connection test stays separate. Not yet checked: macOS plist policy, `--agent` at spawn (the profile has no agent field yet).
- `start.ps1`: one-click entry point that activates Node 24 (fnm), pnpm and the VS C++ build environment, then calls `start-local-fork.ps1`.
