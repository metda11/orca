# Changelog

Fork-specific changes on top of stablyai/orca. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `config/scripts/local-fork/start-local-fork.ps1`: builds the fork from the checkout and starts it on Windows (`-Mode Dev` or `-Mode Packaged`).
- RPC method `claudePlugins.inventory`: lists the Claude plugins of an account (`accountHomePath`, default the host's) for a workspace (`worktreeId` or `cwd`), each with scope, enabled state, version, declared dependencies, skills, agents, commands and MCP servers, plus the workspace's `.mcp.json` servers. Org-synced plugins (`<name>@synced`) are included. Read from config files and plugin folders, cached for 30 s. Not yet available for SSH or WSL workspaces.
- Agent profiles (`agentProfiles` setting, Claude): a terminal start can apply a saved profile (`agentProfileId` on `launchAgentInNewTab`). The start plan adds the profile's `--settings`, `--mcp-config`, `--model`, permission and tool flags before the other launch args, so an explicit model or permission pick still wins; main writes the profile files under `<userData>/agent-profiles/<id>/` right before the PTY spawns. Refused, not silently dropped: non-Claude agents, SSH/WSL/web hosts, chats, prompts that wait for the agent, profiles with `accountId`, unknown ids. No picker or editor yet.
- Agent profile runs in Stats & Usage (Claude): each profile terminal start is recorded in `<userData>/agent-profiles/runs.json` with the profile's intent (plugins, MCP servers, model, org-synced plugins). Usage tracking matches it to its Claude session by working folder and a 10-minute start window (one session per start, ambiguous starts stay unmatched) and shows, per run, Soll against Ist (plugins and MCP servers from the transcript's skill/agent/tool listings or a stream init frame; org-synced plugins listed apart; a log without listing is "not determinable", never empty), used tools, skills and subagents, and what was offered but never used. Per profile: runs and median tokens (USD is only a sum, not comparable). New usage call `claudeUsage:getProfileLoadout`. Not yet: the profile chip in the session header; a resumed session is not matched to the start that resumed it.
- `start.ps1`: one-click entry point that activates Node 24 (fnm), pnpm and the VS C++ build environment, then calls `start-local-fork.ps1`.
