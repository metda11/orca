/** What a Claude session offered its model, as far as the transcript or init frame lists it. */
export type ClaudeLoadoutListing = {
  source: 'init-frame' | 'transcript-listing'
  /** Plugin names; inferred from `<plugin>:<name>` skill and agent ids when the log has no plugin list. */
  plugins: string[]
  skills: string[]
  agents: string[]
  /** Normalized MCP server keys, the form tool names carry (`mcp__<key>__<tool>`). */
  mcpServers: string[]
}

export type ClaudeLoadoutUseCount = { name: string; count: number }

/** What a run actually used; independent of whether a listing was found. */
export type ClaudeLoadoutUsage = {
  tools: ClaudeLoadoutUseCount[]
  skills: ClaudeLoadoutUseCount[]
  subagents: ClaudeLoadoutUseCount[]
  mcpServers: string[]
}

/** The profile's intent, frozen when the run started so later profile edits do not rewrite history. */
export type ClaudeProfileSoll = {
  /** Plugin names; null when the profile leaves plugins at Claude's default. */
  enabledPlugins: string[] | null
  /** Strict MCP scope keys; null when the profile leaves MCP servers at Claude's default. */
  mcpServers: string[] | null
  model: string | null
  /** Org-synced plugin names that were installed at start; these show up regardless of the profile. */
  orgPlugins: string[]
}

export type ClaudeLoadoutSetDiff = {
  missing: string[]
  unexpected: string[]
  /** Unexpected entries that come from the organization's synced plugins, reported apart from real drift. */
  orgUnexpected: string[]
}

export type ClaudeLoadoutDeviation =
  | { status: 'not_determinable' }
  | {
      status: 'matches' | 'deviates'
      plugins: ClaudeLoadoutSetDiff | null
      mcpServers: ClaudeLoadoutSetDiff | null
    }

export type ClaudeLoadoutOfferedUnused = {
  skills: string[]
  subagents: string[]
  mcpServers: string[]
}
