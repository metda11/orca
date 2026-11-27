import { posix } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  qualifyClaudePluginDependencies,
  resolveClaudePluginInventory,
  type ClaudePluginInventorySources
} from './claude-plugin-inventory-resolution'

const configDir = '/home/u/.claude'
const cache = '/home/u/.claude/plugins/cache'

// Shapes as Claude Code 2.1.318 writes them (installed_plugins.json version 2, synced manifest).
function sources(): ClaudePluginInventorySources {
  return {
    configDir,
    installedPlugins: JSON.stringify({
      version: 2,
      plugins: {
        'playwright@claude-plugins-official': [
          {
            scope: 'user',
            installPath: `${cache}/pw/aaa`,
            version: 'aaa',
            lastUpdated: '2026-11-18T09:50:26.532Z'
          },
          {
            scope: 'project',
            installPath: `${cache}/pw/bbb`,
            version: 'bbb',
            projectPath: '/work/repo'
          },
          {
            scope: 'project',
            installPath: `${cache}/pw/ccc`,
            version: 'ccc',
            projectPath: '/work/other'
          }
        ],
        'only-project@m': [
          { scope: 'project', installPath: `${cache}/op/1`, projectPath: '/work/other' }
        ],
        'off@m': [{ scope: 'user', installPath: `${cache}/off/1` }],
        'broken@m': [{ scope: 'user', installPath: 'relative/path' }]
      }
    }),
    settings: [
      JSON.stringify({
        enabledPlugins: { 'playwright@claude-plugins-official': true, 'off@m': true }
      }),
      JSON.stringify({ enabledPlugins: { 'off@m': false } }),
      null
    ],
    globalConfig: JSON.stringify({
      oauthAccount: { organizationUuid: 'org-1', accountUuid: 'acc-1' }
    }),
    synced: {
      manifest: JSON.stringify({
        staleDirs: ['inno-core~g6'],
        plugins: [
          { name: 'inno-core', version: '0062', generation: 8 },
          { name: 'inno-learn', generation: 9 },
          { name: 'gone', generation: 2 }
        ]
      }),
      folders: ['inno-core~g6', 'inno-core~g8', 'inno-learn', 'inno-learn~g6', 'other~g2']
    }
  }
}

describe('resolveClaudePluginInventory', () => {
  it('reads every installed plugin with the install and switch a session in the folder gets', () => {
    expect(resolveClaudePluginInventory(sources(), '/work/repo/sub', posix)).toEqual([
      {
        id: 'inno-core@synced',
        name: 'inno-core',
        marketplace: 'synced',
        scope: 'synced',
        enabled: true,
        installPath: '/home/u/.claude/plugins/synced/org-1_acc-1/inno-core~g8'
      },
      // The manifest names ~g9, which is missing; the bare folder is not stale, so it is the live one.
      {
        id: 'inno-learn@synced',
        name: 'inno-learn',
        marketplace: 'synced',
        scope: 'synced',
        enabled: true,
        installPath: '/home/u/.claude/plugins/synced/org-1_acc-1/inno-learn'
      },
      {
        id: 'off@m',
        name: 'off',
        marketplace: 'm',
        scope: 'user',
        enabled: false,
        installPath: `${cache}/off/1`
      },
      {
        id: 'playwright@claude-plugins-official',
        name: 'playwright',
        marketplace: 'claude-plugins-official',
        scope: 'project',
        enabled: true,
        installPath: `${cache}/pw/bbb`,
        version: 'bbb'
      }
    ])
  })

  it('without a folder keeps user installs only', () => {
    const ids = resolveClaudePluginInventory(sources(), null, posix).map((p) => [
      p.id,
      p.installPath
    ])
    expect(ids).toContainEqual(['playwright@claude-plugins-official', `${cache}/pw/aaa`])
    expect(ids.map(([id]) => id)).not.toContain('only-project@m')
  })

  it('lists no synced plugins when the signed-in account is unknown', () => {
    const ids = resolveClaudePluginInventory({ ...sources(), globalConfig: '{}' }, null, posix).map(
      (p) => p.id
    )
    expect(ids).toEqual(['off@m', 'playwright@claude-plugins-official'])
  })
})

describe('qualifyClaudePluginDependencies', () => {
  it('resolves bare names in the plugin own marketplace', () => {
    expect(
      qualifyClaudePluginDependencies(['inno-core', 'x@other', { name: 'y' }, 3], 'synced')
    ).toEqual(['inno-core@synced', 'x@other', 'y@synced'])
  })
})
