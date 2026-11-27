import { describe, expect, it } from 'vitest'
import type { ClaudePluginInventoryEntry } from '../claude-plugins/claude-plugin-inventory'
import { ESTIMATED_TOKENS_PER_MCP_SERVER, weighProfileContext } from './profile-context-weight'

const plugin = (
  id: string,
  extra: Partial<ClaudePluginInventoryEntry> = {}
): ClaudePluginInventoryEntry => ({
  id,
  name: id.split('@')[0],
  marketplace: id.split('@')[1],
  scope: 'user',
  enabled: true,
  installPath: `/p/${id}`,
  dependencies: [],
  skills: [],
  agents: [],
  commands: [],
  mcpServers: [],
  ...extra
})

const inventory = {
  plugins: [
    plugin('lean@m'),
    plugin('fat@m', { mcpServers: ['db'] }),
    plugin('org@synced', { scope: 'synced', mcpServers: ['wiki'] })
  ],
  workspaceMcpServers: ['repo']
}
const measured = { 'lean@m': 100, 'fat@m': 900, 'org@synced': 400 }

describe('weighProfileContext', () => {
  it('drops a plugin and its servers when the switch is off, but never an org-synced plugin', () => {
    const all = weighProfileContext({}, inventory, measured)
    expect(all.measured.tokens).toBe(1400)
    expect(all.estimated.mcpServers.map((server) => server.name)).toEqual([
      'fat:db',
      'org:wiki',
      'repo'
    ])

    const lean = weighProfileContext({ enabledPlugins: ['lean@m'] }, inventory, measured)
    expect(lean.measured.tokens).toBe(500)
    expect(lean.measured.plugins.find((entry) => entry.id === 'org@synced')?.locked).toBe(true)
    expect(lean.estimated.tokens).toBe(ESTIMATED_TOKENS_PER_MCP_SERVER * 2)
  })

  it('counts only the profile servers under a strict MCP scope and lists unmeasured plugins as pending', () => {
    const weight = weighProfileContext(
      { enabledPlugins: ['lean@m', 'gone@m'], mcpServers: { only: {} } },
      inventory,
      { 'lean@m': 100 }
    )
    expect(weight.estimated.mcpServers).toEqual([
      { name: 'only', source: 'profile', tokens: ESTIMATED_TOKENS_PER_MCP_SERVER }
    ])
    expect(weight.pending).toEqual(['org@synced'])
    expect(weight.unknownPlugins).toEqual(['gone@m'])
    expect(weight.measured.tokens).toBe(100)
  })
})
