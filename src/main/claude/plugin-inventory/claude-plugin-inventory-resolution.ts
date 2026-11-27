// Which plugins a Claude session in `cwd` loads, read from the account's config files alone: the
// install records, the merged `enabledPlugins`, and the org-synced plugins of the signed-in account.
import { basename, isAbsolute, join, relative, sep } from 'node:path'
import {
  readEnabledPlugins,
  selectActiveInstall,
  type SkillDiscoveryPathApi
} from '../../skills/discovery/claude-plugin-skill-sources'
import {
  asRecord,
  parseJsonObject
} from '../../../shared/workspace-setup/setup-script-import-parsers'
import type { ClaudePluginInventoryScope } from '../../../shared/claude-plugins/claude-plugin-inventory'

const SYNCED_MARKETPLACE = 'synced'
const defaultPathApi: SkillDiscoveryPathApi = { basename, isAbsolute, join, relative, sep }

export type ClaudePluginInventorySources = {
  configDir: string
  /** `<configDir>/plugins/installed_plugins.json`. */
  installedPlugins: string | null
  /** User, project, then project-local settings, the order Claude merges them in. */
  settings: (string | null)[]
  /** The account's global config (`.claude.json`), which names the signed-in account. */
  globalConfig: string | null
  /** `manifest.json` and folder names of the signed-in account's synced folder. */
  synced: { manifest: string | null; folders: readonly string[] } | null
}

export type ResolvedClaudePlugin = {
  id: string
  /** The id's `<name>`; the manifest name, read later, takes precedence. */
  name: string
  marketplace: string
  scope: ClaudePluginInventoryScope
  enabled: boolean
  installPath: string
  version?: string
}

/** `<organizationUuid>_<accountUuid>`: the folder under `plugins/synced` the org sync writes for this account. */
export function syncedAccountFolderName(globalConfig: string | null): string | null {
  const account = asRecord(parseJsonObject(globalConfig)?.oauthAccount)
  if (!account) {
    return null
  }
  const { organizationUuid, accountUuid } = account
  const safe = (value: unknown): value is string =>
    typeof value === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(value)
  return safe(organizationUuid) && safe(accountUuid) ? `${organizationUuid}_${accountUuid}` : null
}

// The live folder of a synced plugin: the manifest's `generation` names it (`<name>~g<N>`, or bare
// `<name>` without one); the sync moves plugins between generations while Claude runs, so a folder
// listed in `staleDirs` never counts and any other `<name>[~gN]` is the fallback.
function liveSyncedFolder(
  name: string,
  generation: unknown,
  stale: ReadonlySet<string>,
  folders: readonly string[]
): string | null {
  const wanted =
    typeof generation === 'number' && Number.isInteger(generation) && generation > 0
      ? `${name}~g${generation}`
      : name
  const present = new Set(folders)
  if (present.has(wanted) && !stale.has(wanted)) {
    return wanted
  }
  const pattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(~g\\d+)?$`)
  return folders.find((folder) => pattern.test(folder) && !stale.has(folder)) ?? null
}

function resolveSyncedPlugins(
  sources: ClaudePluginInventorySources,
  enabled: ReadonlyMap<string, boolean>,
  pathApi: SkillDiscoveryPathApi
): ResolvedClaudePlugin[] {
  const accountFolder = syncedAccountFolderName(sources.globalConfig)
  const manifest = parseJsonObject(sources.synced?.manifest ?? null)
  if (!accountFolder || !manifest || !Array.isArray(manifest.plugins)) {
    return []
  }
  const stale = new Set(
    Array.isArray(manifest.staleDirs)
      ? manifest.staleDirs.filter((dir): dir is string => typeof dir === 'string')
      : []
  )
  const plugins: ResolvedClaudePlugin[] = []
  for (const raw of manifest.plugins) {
    const entry = asRecord(raw)
    const name = typeof entry?.name === 'string' ? entry.name : ''
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(name)) {
      continue
    }
    const folder = liveSyncedFolder(name, entry?.generation, stale, sources.synced?.folders ?? [])
    if (!folder) {
      continue
    }
    const id = `${name}@${SYNCED_MARKETPLACE}`
    plugins.push({
      id,
      name,
      marketplace: SYNCED_MARKETPLACE,
      scope: 'synced',
      // Org-synced plugins load unless switched off; `claude plugin list` shows them enabled with no setting.
      enabled: enabled.get(id) !== false,
      // No version: the manifest's is the sync's counter; the CLI shows the folder's plugin.json version.
      installPath: pathApi.join(sources.configDir, 'plugins', 'synced', accountFolder, folder)
    })
  }
  return plugins
}

/** Every plugin installed for the account, with the install a session in `cwd` would load; null cwd: user scope only. */
export function resolveClaudePluginInventory(
  sources: ClaudePluginInventorySources,
  cwd: string | null,
  pathApi: SkillDiscoveryPathApi = defaultPathApi
): ResolvedClaudePlugin[] {
  const enabled = readEnabledPlugins(sources.settings)
  const installed = parseJsonObject(sources.installedPlugins)?.plugins
  const plugins: ResolvedClaudePlugin[] = []
  if (installed && typeof installed === 'object' && !Array.isArray(installed)) {
    for (const [id, rawInstalls] of Object.entries(installed)) {
      if (!Array.isArray(rawInstalls)) {
        continue
      }
      const candidates = cwd
        ? rawInstalls
        : rawInstalls.filter((install) => asRecord(install)?.scope === 'user')
      const install = selectActiveInstall(candidates, cwd ?? '', pathApi)
      if (!install) {
        continue
      }
      const at = id.lastIndexOf('@')
      plugins.push({
        id,
        name: at > 0 ? id.slice(0, at) : id,
        marketplace: at > 0 ? id.slice(at + 1) : '',
        scope: install.scope,
        enabled: enabled.get(id) === true,
        installPath: install.installPath,
        ...(install.version ? { version: install.version } : {})
      })
    }
  }
  const listed = new Set(plugins.map((plugin) => plugin.id))
  return [
    ...plugins,
    ...resolveSyncedPlugins(sources, enabled, pathApi).filter((plugin) => !listed.has(plugin.id))
  ].sort((a, b) => a.id.localeCompare(b.id))
}

/** Declared dependency names → ids as the CLI resolves them: a bare name means the plugin's own marketplace. */
export function qualifyClaudePluginDependencies(declared: unknown, marketplace: string): string[] {
  const values = Array.isArray(declared) ? declared : declared == null ? [] : [declared]
  return values.flatMap((value) => {
    const named = asRecord(value)?.name
    const name = typeof value === 'string' ? value : typeof named === 'string' ? named : ''
    if (!name) {
      return []
    }
    return [name.includes('@') || !marketplace ? name : `${name}@${marketplace}`]
  })
}
