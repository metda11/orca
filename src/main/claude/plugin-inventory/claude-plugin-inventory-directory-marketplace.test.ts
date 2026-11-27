import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearClaudePluginInventoryCache,
  readClaudePluginInventory
} from './claude-plugin-inventory'

let root: string | null = null

afterEach(async () => {
  clearClaudePluginInventoryCache()
  if (root) {
    await rm(root, { recursive: true, force: true })
    root = null
  }
})

async function write(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, typeof value === 'string' ? value : JSON.stringify(value))
}

// Shape of `claude plugin list --json` for a directory marketplace: installPath is the cache copy,
// `readFromFolder` the marketplace's own folder the session runs from (measured 2026-11-27).
describe('readClaudePluginInventory with a directory marketplace', () => {
  it('reads the plugin contents from the marketplace folder, not the stale cache copy', async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-plugin-inventory-'))
    const config = join(root, 'config')
    const market = join(root, 'market')
    const cached = join(config, 'plugins', 'cache', 'local', 'tool', '1.0.0')
    await write(join(market, '.claude-plugin', 'marketplace.json'), {
      name: 'local',
      plugins: [{ name: 'tool', source: './tool' }]
    })
    await write(join(market, 'tool', '.claude-plugin', 'plugin.json'), {
      name: 'tool',
      description: 'live'
    })
    await write(join(market, 'tool', 'commands', 'live.md'), '# live')
    await write(join(cached, '.claude-plugin', 'plugin.json'), {
      name: 'tool',
      description: 'stale'
    })
    await write(join(config, 'plugins', 'known_marketplaces.json'), {
      local: { source: { source: 'directory', path: market }, installLocation: market }
    })
    await write(join(config, 'plugins', 'installed_plugins.json'), {
      version: 2,
      plugins: { 'tool@local': [{ scope: 'user', installPath: cached, version: '1.0.0' }] }
    })
    await write(join(config, 'settings.json'), { enabledPlugins: { 'tool@local': true } })

    const inventory = await readClaudePluginInventory({ accountHomePath: config, cwd: null })
    const tool = inventory.plugins.find((plugin) => plugin.id === 'tool@local')
    expect(tool?.description).toBe('live')
    expect(tool?.installPath).toBe(cached)
    expect(tool?.commands).toContain('live')
    expect(tool?.problem).toBeUndefined()
  })

  it('falls back to the cache copy when its source folder is gone', async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-plugin-inventory-'))
    const config = join(root, 'config')
    const market = join(root, 'market')
    const cached = join(config, 'plugins', 'cache', 'local', 'tool', '1.0.0')
    await write(join(market, '.claude-plugin', 'marketplace.json'), {
      name: 'local',
      plugins: [{ name: 'tool', source: './tool' }]
    })
    await write(join(cached, '.claude-plugin', 'plugin.json'), {
      name: 'tool',
      description: 'cache'
    })
    await write(join(config, 'plugins', 'known_marketplaces.json'), {
      local: { source: { source: 'directory', path: market }, installLocation: market }
    })
    await write(join(config, 'plugins', 'installed_plugins.json'), {
      version: 2,
      plugins: { 'tool@local': [{ scope: 'user', installPath: cached }] }
    })

    const inventory = await readClaudePluginInventory({ accountHomePath: config, cwd: null })
    expect(inventory.plugins.find((plugin) => plugin.id === 'tool@local')?.description).toBe(
      'cache'
    )
  })
})
