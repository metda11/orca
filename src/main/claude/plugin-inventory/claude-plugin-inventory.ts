// The Claude plugin inventory of one account and workspace: each installed plugin with what it
// brings. Read from config files and plugin folders, never the CLI, so it is cheap and works on any host.
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { readPluginMetadataFile } from '../../skills/discovery/plugin-skill-metadata'
import { resolveClaudeGlobalConfigFile } from '../configuration/claude-folder-trust-file'
import type { ClaudePluginInventory } from '../../../shared/claude-plugins/claude-plugin-inventory'
import {
  syncedAccountFolderName,
  type ClaudePluginInventorySources
} from './claude-plugin-inventory-resolution'
import { nativePluginFolderFs } from './claude-plugin-folder-fs'
import { assembleClaudePluginInventory } from './claude-plugin-inventory-assemble'
import { readClaudePluginInventoryInWsl } from './claude-plugin-inventory-wsl'

// Profile editor, preflight and context weight ask in bursts; plugin installs change rarely.
const INVENTORY_TTL_MS = 30_000
const MAX_CACHED_INVENTORIES = 16

type CacheEntry = { promise: Promise<ClaudePluginInventory>; at: number }
const cache = new Map<string, CacheEntry>()

export type ClaudePluginInventoryRequest = {
  /** The account's CLAUDE_CONFIG_DIR; null: the host's default account. */
  accountHomePath: string | null
  cwd: string | null
  refresh?: boolean
  /**
   * The WSL distro the workspace runs in. Then `cwd` and `accountHomePath` are the distro's own
   * (Linux) paths and everything is read inside the distro, never from this host's disk.
   */
  wslDistro?: string | null
}

// Claude keeps the global config beside the folder (`~/.claude.json`) only for the default folder.
function accountConfigDir(accountHomePath: string | null): {
  configDir: string
  explicit: boolean
} {
  const defaultDir = join(homedir(), '.claude')
  const configDir = accountHomePath?.trim() || process.env.CLAUDE_CONFIG_DIR?.trim() || defaultDir
  return { configDir, explicit: resolve(configDir) !== resolve(defaultDir) }
}

async function readSources(
  configDir: string,
  explicit: boolean,
  cwd: string | null
): Promise<ClaudePluginInventorySources> {
  const resolveGlobalConfigFile = (exists: (path: string) => boolean) =>
    resolveClaudeGlobalConfigFile({
      env: explicit ? { CLAUDE_CONFIG_DIR: configDir } : {},
      homeDir: homedir(),
      style: process.platform === 'win32' ? 'win32' : 'posix',
      exists
    })
  // The only file the resolver probes is the legacy `.config.json`; check it without blocking main.
  const legacyFile = resolveGlobalConfigFile(() => true)
  const legacyExists = await stat(legacyFile).then(
    (entry) => entry.isFile(),
    () => false
  )
  const globalConfigFile = resolveGlobalConfigFile((path) => path === legacyFile && legacyExists)
  const [installedPlugins, globalConfig, ...settings] = await Promise.all([
    readPluginMetadataFile(join(configDir, 'plugins', 'installed_plugins.json')),
    readPluginMetadataFile(globalConfigFile),
    readPluginMetadataFile(join(configDir, 'settings.json')),
    ...(cwd
      ? [
          readPluginMetadataFile(join(cwd, '.claude', 'settings.json')),
          readPluginMetadataFile(join(cwd, '.claude', 'settings.local.json'))
        ]
      : [])
  ])
  const accountFolder = syncedAccountFolderName(globalConfig)
  const syncedDir = accountFolder ? join(configDir, 'plugins', 'synced', accountFolder) : null
  const synced = syncedDir
    ? {
        manifest: await readPluginMetadataFile(join(syncedDir, 'manifest.json')),
        folders: (await nativePluginFolderFs.readdir(syncedDir))
          .filter((entry) => entry.isDirectory)
          .map((entry) => entry.name)
      }
    : null
  return { configDir, installedPlugins, settings, globalConfig, synced }
}

async function readInventory(
  configDir: string,
  explicit: boolean,
  cwd: string | null
): Promise<ClaudePluginInventory> {
  const sources = await readSources(configDir, explicit, cwd)
  return assembleClaudePluginInventory({ sources, cwd, fs: nativePluginFolderFs })
}

// The org sync swaps `~gN` folders while Claude runs; an inventory naming a vanished folder is stale.
async function foldersStillPresent(inventory: ClaudePluginInventory): Promise<boolean> {
  const present = await Promise.all(
    inventory.plugins
      .filter((plugin) => plugin.problem !== 'missing-folder')
      .map((plugin) =>
        stat(plugin.installPath).then(
          () => true,
          () => false
        )
      )
  )
  return present.every(Boolean)
}

/** The account's plugins as a session in `cwd` loads them, cached briefly per account and folder. */
export async function readClaudePluginInventory(
  request: ClaudePluginInventoryRequest
): Promise<ClaudePluginInventory> {
  const wslDistro = request.wslDistro?.trim() || null
  // A distro's folders are Linux paths, so this host cannot stat them; its entry lives for the TTL.
  const { configDir, explicit } = wslDistro
    ? { configDir: request.accountHomePath ?? '', explicit: Boolean(request.accountHomePath) }
    : accountConfigDir(request.accountHomePath)
  const key = JSON.stringify([wslDistro?.toLowerCase() ?? null, configDir, explicit, request.cwd])
  const cached = cache.get(key)
  if (cached && !request.refresh && Date.now() - cached.at < INVENTORY_TTL_MS) {
    const inventory = await cached.promise.catch(() => null)
    if (inventory && (wslDistro || (await foldersStillPresent(inventory)))) {
      return inventory
    }
  }
  const promise = wslDistro
    ? readClaudePluginInventoryInWsl({
        distro: wslDistro,
        accountHomePath: request.accountHomePath,
        cwd: request.cwd
      })
    : readInventory(configDir, explicit, request.cwd)
  cache.delete(key)
  cache.set(key, { promise, at: Date.now() })
  for (const oldest of cache.keys()) {
    if (cache.size <= MAX_CACHED_INVENTORIES) {
      break
    }
    cache.delete(oldest)
  }
  promise.catch(() => cache.get(key)?.promise === promise && cache.delete(key))
  return promise
}

export function clearClaudePluginInventoryCache(): void {
  cache.clear()
}
