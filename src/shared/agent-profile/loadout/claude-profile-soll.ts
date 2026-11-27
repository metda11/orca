import type { ClaudeAgentProfile } from '../agent-profile-types'
import { normalizeMcpServerKey, pluginNameOf } from './claude-loadout-compare'
import type { ClaudeProfileSoll } from './claude-loadout-types'

export type InstalledPluginRef = { id: string; scope: string }

export function buildClaudeProfileSoll(
  profile: ClaudeAgentProfile,
  installedPlugins: readonly InstalledPluginRef[]
): ClaudeProfileSoll {
  return {
    enabledPlugins: profile.enabledPlugins ? profile.enabledPlugins.map(pluginNameOf) : null,
    mcpServers: profile.mcpServers
      ? Object.keys(profile.mcpServers).map(normalizeMcpServerKey)
      : null,
    model: profile.model ?? null,
    orgPlugins: installedPlugins
      .filter((plugin) => plugin.scope === 'synced')
      .map((plugin) => pluginNameOf(plugin.id))
  }
}
