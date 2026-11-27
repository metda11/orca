import type { ClaudePluginInventory } from '../claude-plugins/claude-plugin-inventory'
import type { ClaudeAgentProfile } from './agent-profile-types'

/** Rough share of one MCP server's tool schemas; the CLI does not count them before a session runs. */
export const ESTIMATED_TOKENS_PER_MCP_SERVER = 3000

/** `claude plugin details` always-on tokens per plugin id; absent while the measurement is pending. */
export type PluginAlwaysOnMeasurements = Record<string, number | undefined>

export type ProfileContextWeight = {
  /** Plugin skill/agent listings as `claude plugin details` projects them. */
  measured: {
    tokens: number
    plugins: { id: string; tokens: number; locked: boolean }[]
  }
  /** MCP tool schemas: a flat per-server guess, never a measurement. */
  estimated: {
    tokens: number
    mcpServers: { name: string; source: 'profile' | 'plugin' | 'workspace'; tokens: number }[]
  }
  /** Active plugins whose measurement has not arrived; `measured.tokens` is a lower bound while any remain. */
  pending: string[]
  /** `enabledPlugins` ids that are not installed for this account. */
  unknownPlugins: string[]
  /** `pluginDirs` carry no id for the CLI to measure. */
  unmeasuredPluginDirs: number
}

/**
 * What a profile start loads before the first prompt. Pure, so flipping a switch in the editor
 * recomputes it from the same inventory and measurements without a new start.
 */
export function weighProfileContext(
  profile: Pick<ClaudeAgentProfile, 'enabledPlugins' | 'pluginDirs' | 'mcpServers'>,
  inventory: Pick<ClaudePluginInventory, 'plugins' | 'workspaceMcpServers'>,
  measurements: PluginAlwaysOnMeasurements
): ProfileContextWeight {
  const chosen = profile.enabledPlugins ? new Set(profile.enabledPlugins) : null
  const installed = new Set(inventory.plugins.map((plugin) => plugin.id))
  const active = inventory.plugins.filter((plugin) =>
    chosen
      ? // Org-synced plugins load whatever enabledPlugins says.
        chosen.has(plugin.id) || plugin.scope === 'synced'
      : plugin.enabled
  )

  const measuredPlugins: ProfileContextWeight['measured']['plugins'] = []
  const pending: string[] = []
  for (const plugin of active) {
    const tokens = measurements[plugin.id]
    if (tokens === undefined) {
      pending.push(plugin.id)
    } else {
      measuredPlugins.push({
        id: plugin.id,
        tokens,
        locked: chosen !== null && !chosen.has(plugin.id)
      })
    }
  }

  const servers: ProfileContextWeight['estimated']['mcpServers'] = []
  const seen = new Set<string>()
  const addServer = (name: string, source: 'profile' | 'plugin' | 'workspace') => {
    if (!seen.has(name)) {
      seen.add(name)
      servers.push({ name, source, tokens: ESTIMATED_TOKENS_PER_MCP_SERVER })
    }
  }
  if (profile.mcpServers) {
    for (const name of Object.keys(profile.mcpServers)) {
      addServer(name, 'profile')
    }
  } else {
    for (const plugin of active) {
      for (const name of plugin.mcpServers) {
        addServer(`${plugin.name}:${name}`, 'plugin')
      }
    }
    for (const name of inventory.workspaceMcpServers) {
      addServer(name, 'workspace')
    }
  }

  return {
    measured: {
      tokens: measuredPlugins.reduce((sum, plugin) => sum + plugin.tokens, 0),
      plugins: measuredPlugins
    },
    estimated: {
      tokens: servers.reduce((sum, server) => sum + server.tokens, 0),
      mcpServers: servers
    },
    pending,
    unknownPlugins: [...(chosen ?? [])].filter((id) => !installed.has(id)),
    unmeasuredPluginDirs: profile.pluginDirs?.length ?? 0
  }
}
