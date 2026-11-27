# Changelog

Fork-specific changes on top of stablyai/orca. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Automation precheck result: exit code `1` skips the run (`skipped_precheck`) and shows the first line the command printed as the reason; every other non-zero exit code, an error or a timeout now fails the run (`dispatch_failed`). Before, exit codes 2 and up were also recorded as skipped, so a broken precheck script now shows up as a failure instead of a quiet skip.
- Run now and `orca automations run` run the precheck too (before, only scheduled runs did). Event runs still skip it.
- A run of an automation on an existing workspace folder waits (stays queued) while another run on the same folder is starting or running, and starts when that run ends.

### Added

- Automation runs hold while the agent's account (Claude or Codex) has used up a usage window: the run stays queued until the reset and starts then. Desktop only; a run held this way is not carried across an Orca restart.
- `config/scripts/local-fork/start-local-fork.ps1`: builds the fork from the checkout and starts it on Windows (`-Mode Dev` or `-Mode Packaged`).
- RPC method `claudePlugins.inventory`: lists the Claude plugins of an account (`accountHomePath`, default the host's) for a workspace (`worktreeId` or `cwd`), each with scope, enabled state, version, declared dependencies, skills, agents, commands and MCP servers, plus the workspace's `.mcp.json` servers. Org-synced plugins (`<name>@synced`) are included. Read from config files and plugin folders, cached for 30 s. Not yet available for SSH or WSL workspaces.
- Agent profiles (`agentProfiles` setting, Claude): a terminal start can apply a saved profile (`agentProfileId` on `launchAgentInNewTab`). The start plan adds the profile's `--settings`, `--mcp-config`, `--model`, permission and tool flags before the other launch args, so an explicit model or permission pick still wins; main writes the profile files under `<userData>/agent-profiles/<id>/` right before the PTY spawns. Refused, not silently dropped: non-Claude agents, SSH/WSL/web hosts, chats, prompts that wait for the agent, profiles with `accountId`, unknown ids. No picker or editor yet.
- `start.ps1`: one-click entry point that activates Node 24 (fnm), pnpm and the VS C++ build environment, then calls `start-local-fork.ps1`.
