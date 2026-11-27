import { describe, expect, it } from 'vitest'
import { buildClaudeProfileLaunch } from './claude-profile-launch-args'

const files = { settingsPath: '/tmp/p/settings.json', mcpConfigPath: '/tmp/p/mcp.json' }

describe('buildClaudeProfileLaunch', () => {
  it('switches every other installed plugin off and scopes MCP strictly', () => {
    const launch = buildClaudeProfileLaunch(
      {
        id: 'p1',
        name: 'Review',
        enabledPlugins: ['a@m'],
        mcpServers: { docs: { type: 'http', url: 'https://example.test/mcp' } },
        model: 'sonnet',
        permissionMode: 'plan',
        allowedTools: ['Read', 'Grep'],
        appendSystemPrompt: 'Be brief.'
      },
      { installedPluginIds: ['a@m', 'b@m'], files }
    )
    expect(launch.argv).toEqual([
      '--settings',
      '/tmp/p/settings.json',
      '--mcp-config',
      '/tmp/p/mcp.json',
      '--strict-mcp-config',
      '--model',
      'sonnet',
      '--permission-mode',
      'plan',
      '--allowedTools',
      'Read,Grep',
      '--append-system-prompt',
      'Be brief.'
    ])
    expect(JSON.parse(launch.settings!.content)).toEqual({
      enabledPlugins: { 'a@m': true, 'b@m': false }
    })
    expect(JSON.parse(launch.mcpConfig!.content)).toEqual({
      mcpServers: { docs: { type: 'http', url: 'https://example.test/mcp' } }
    })
  })

  it('emits nothing for an empty profile', () => {
    expect(
      buildClaudeProfileLaunch({ id: 'p2', name: 'Plain' }, { installedPluginIds: [], files })
    ).toEqual({ argv: [], settings: null, mcpConfig: null })
  })
})
