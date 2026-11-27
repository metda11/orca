// Turns resolved sources into inventory entries by reading each plugin's folder through a file view,
// so the host's disk and a WSL snapshot share one reading.
import { parseJsonObject } from '../../../shared/workspace-setup/setup-script-import-parsers'
import type {
  ClaudePluginInventory,
  ClaudePluginInventoryEntry
} from '../../../shared/claude-plugins/claude-plugin-inventory'
import {
  qualifyClaudePluginDependencies,
  resolveClaudePluginInventory,
  type ClaudePluginInventorySources
} from './claude-plugin-inventory-resolution'
import { mcpServerNames, readClaudePluginFolder } from './claude-plugin-contents'
import type { PluginFolderFs } from './claude-plugin-folder-fs'

export async function assembleClaudePluginInventory(args: {
  sources: ClaudePluginInventorySources
  cwd: string | null
  fs: PluginFolderFs
}): Promise<ClaudePluginInventory> {
  const { sources, cwd, fs } = args
  const plugins = await Promise.all(
    resolveClaudePluginInventory(sources, cwd, fs.path).map(
      async (plugin): Promise<ClaudePluginInventoryEntry> => {
        const folder = await readClaudePluginFolder(plugin.installPath, fs)
        const manifest = folder.manifest
        const manifestName =
          typeof manifest?.name === 'string' && manifest.name ? manifest.name : null
        const version =
          plugin.version ?? (typeof manifest?.version === 'string' ? manifest.version : undefined)
        return {
          id: plugin.id,
          name: manifestName ?? plugin.name,
          marketplace: plugin.marketplace,
          scope: plugin.scope,
          enabled: plugin.enabled,
          installPath: plugin.installPath,
          ...(version ? { version } : {}),
          ...(typeof manifest?.description === 'string'
            ? { description: manifest.description }
            : {}),
          dependencies: qualifyClaudePluginDependencies(manifest?.dependencies, plugin.marketplace),
          ...folder.contents,
          ...(folder.problem ? { problem: folder.problem } : {})
        }
      }
    )
  )
  const workspaceMcpServers = cwd
    ? mcpServerNames(parseJsonObject(await fs.readText(fs.path.join(cwd, '.mcp.json'))))
    : []
  return { configDir: sources.configDir, cwd, plugins, workspaceMcpServers, readAt: Date.now() }
}
