import type {
  ClaudeLoadoutDeviation,
  ClaudeLoadoutListing,
  ClaudeLoadoutOfferedUnused,
  ClaudeLoadoutSetDiff,
  ClaudeLoadoutUsage,
  ClaudeProfileSoll
} from './claude-loadout-types'

/** Claude's tool-name form of an MCP server name: every character outside `[A-Za-z0-9_-]` becomes `_`. */
export function normalizeMcpServerKey(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, '_')
}

/** Profile ids are `<name>@<marketplace>`; listings only carry the name. */
export function pluginNameOf(pluginId: string): string {
  const at = pluginId.lastIndexOf('@')
  return at > 0 ? pluginId.slice(0, at) : pluginId
}

function diffSets(
  wanted: ReadonlySet<string>,
  offered: readonly string[],
  org: ReadonlySet<string>
): ClaudeLoadoutSetDiff {
  const offeredSet = new Set(offered)
  const unexpected = offered.filter((name) => !wanted.has(name))
  return {
    missing: [...wanted].filter((name) => !offeredSet.has(name)).sort(),
    unexpected: unexpected.filter((name) => !org.has(name)).sort(),
    orgUnexpected: unexpected.filter((name) => org.has(name)).sort()
  }
}

function hasDrift(diff: ClaudeLoadoutSetDiff | null): boolean {
  return diff !== null && (diff.missing.length > 0 || diff.unexpected.length > 0)
}

/** Soll against Ist; a log without a listing is never "empty", it is not determinable. */
export function compareClaudeLoadout(
  soll: ClaudeProfileSoll,
  ist: ClaudeLoadoutListing | null
): ClaudeLoadoutDeviation {
  if (!ist) {
    return { status: 'not_determinable' }
  }
  const plugins = soll.enabledPlugins
    ? diffSets(
        new Set(soll.enabledPlugins.map(pluginNameOf)),
        ist.plugins,
        new Set(soll.orgPlugins)
      )
    : null
  const mcpServers = soll.mcpServers
    ? diffSets(new Set(soll.mcpServers.map(normalizeMcpServerKey)), ist.mcpServers, new Set())
    : null
  return {
    status: hasDrift(plugins) || hasDrift(mcpServers) ? 'deviates' : 'matches',
    plugins,
    mcpServers
  }
}

/** Offered to the model but never called; null when nothing was listed, since "unused" would be a guess. */
export function offeredButUnused(
  ist: ClaudeLoadoutListing | null,
  usage: ClaudeLoadoutUsage
): ClaudeLoadoutOfferedUnused | null {
  if (!ist) {
    return null
  }
  const used = {
    skills: new Set(usage.skills.map((entry) => entry.name)),
    subagents: new Set(usage.subagents.map((entry) => entry.name)),
    mcpServers: new Set(usage.mcpServers)
  }
  return {
    skills: ist.skills.filter((name) => !used.skills.has(name)),
    subagents: ist.agents.filter((name) => !used.subagents.has(name)),
    mcpServers: ist.mcpServers.filter((name) => !used.mcpServers.has(name))
  }
}
