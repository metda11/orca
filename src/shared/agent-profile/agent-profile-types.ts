export const CLAUDE_PROFILE_PERMISSION_MODES = [
  'default',
  'acceptEdits',
  'auto',
  'bypassPermissions',
  'manual',
  'dontAsk',
  'plan'
] as const

export type ClaudeProfilePermissionMode = (typeof CLAUDE_PROFILE_PERMISSION_MODES)[number]

/** One MCP server in Claude's `--mcp-config` shape (stdio, http or sse). */
export type ClaudeProfileMcpServer = Record<string, unknown>

/** A named Claude Code loadout applied per start; every field omitted means "leave Claude's default". */
export type ClaudeAgentProfile = {
  id: string
  name: string
  /** `<name>@<marketplace>` ids to enable; every other installed plugin is switched off for this start. */
  enabledPlugins?: string[]
  /** Extra plugin folders passed as `--plugin-dir`. */
  pluginDirs?: string[]
  /** Strict MCP scope: only these servers load, by name. */
  mcpServers?: Record<string, ClaudeProfileMcpServer>
  model?: string
  permissionMode?: ClaudeProfilePermissionMode
  allowedTools?: string[]
  disallowedTools?: string[]
  appendSystemPrompt?: string
  /** Only enforced by non-interactive runs: Claude's `--max-budget-usd` works with `--print` alone. */
  maxBudgetUsd?: number
  defaultTask?: string
  /** Managed Claude account the start routes through. */
  accountId?: string
}

export type AgentProfileSettings = {
  /** Named Claude Code loadouts a launch can pick by id. */
  agentProfiles?: ClaudeAgentProfile[]
}
