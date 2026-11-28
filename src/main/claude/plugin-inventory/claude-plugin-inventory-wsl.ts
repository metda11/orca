// The plugin inventory of a WSL workspace. Claude there runs with the distro's own config folder, so
// every file is read inside the distro with bash (like skill discovery) and never through the
// `\\wsl.localhost` share, where this host's Windows account and path rules would give a wrong inventory.
import { posix } from 'node:path'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { parseWslUncPath } from '../../../shared/file-access/wsl-paths'
import type { ClaudePluginInventory } from '../../../shared/claude-plugins/claude-plugin-inventory'
import { getWslHomeAsync } from '../../wsl/discovery/distro-catalog'
import { runWslProcess } from '../../wsl/execution/wsl-runner'
import { buildWslClaudePluginMetadataCommand } from '../../skills/discovery/claude-plugin-skill-sources-wsl'
import { resolveClaudeGlobalConfigFile } from '../configuration/claude-folder-trust-file'
import { assembleClaudePluginInventory } from './claude-plugin-inventory-assemble'
import type { PluginFolderEntry, PluginFolderFs } from './claude-plugin-folder-fs'
import {
  resolveClaudePluginInventory,
  syncedAccountFolderName,
  type ClaudePluginInventorySources
} from './claude-plugin-inventory-resolution'

const WSL_READ_TIMEOUT_MS = 15_000
const WSL_READ_MAX_OUTPUT_BYTES = 32 * 1024 * 1024
// A plugin folder is a few levels deep; deeper content is not part of what the inventory names.
const SNAPSHOT_MAX_DEPTH = 6
const MAX_JSON_KB = 1024
// Agent files need only their frontmatter, which sits at the top.
const AGENT_HEAD_BYTES = 8192

export type WslMetadata = {
  /** File contents in the order of the requested paths; null: missing, too large or unreadable. */
  files: (string | null)[]
  /** Per account folder under `plugins/synced`: its manifest text and plugin folder names. */
  synced: Map<string, { manifest: string | null; folders: string[] }>
}

/** Reads the files and the synced account folders in one bash run; output is NUL-framed records. */
export function buildWslInventoryMetadataScript(
  files: readonly string[],
  syncedRoot: string
): string {
  return [
    buildWslClaudePluginMetadataCommand(files),
    `synced_root=${quotePosixShell(syncedRoot)}`,
    'if [ -d "$synced_root" ]; then',
    '  for account_dir in "$synced_root"/*/; do',
    '    [ -d "$account_dir" ] || continue',
    '    account=$(basename "$account_dir")',
    '    manifest="${account_dir}manifest.json"',
    `    manifest_size=$(stat -c '%s' -- "$manifest" 2>/dev/null || true)`,
    `    if [ -n "$manifest_size" ] && [ "$manifest_size" -le ${4 * 1024 * 1024} ]; then`,
    `      encoded=$(base64 < "$manifest" | tr -d '\\n') || encoded=''`,
    `      printf '%s\\0%s\\0%s\\0%s\\0' S "$account" 1 "$encoded"`,
    '    else',
    `      printf '%s\\0%s\\0%s\\0\\0' S "$account" 0`,
    '    fi',
    '    for entry in "$account_dir"*/; do',
    '      [ -d "$entry" ] || continue',
    `      printf '%s\\0%s\\0%s\\0\\0' D "$account" "$(basename "$entry")"`,
    '    done',
    '  done',
    'fi',
    'exit 0'
  ].join('\n')
}

function decode(encoded: string | undefined): string {
  return Buffer.from(encoded ?? '', 'base64').toString('utf8')
}

export function parseWslInventoryMetadata(output: string, fileCount: number): WslMetadata {
  const files = Array<string | null>(fileCount).fill(null)
  const synced = new Map<string, { manifest: string | null; folders: string[] }>()
  const fields = output.split('\0')
  let index = 0
  while (index < fields.length && fields[index]) {
    const kind = fields[index++]
    const a = fields[index++] ?? ''
    const b = fields[index++] ?? ''
    const c = fields[index++]
    if (kind === 'F') {
      const fileIndex = Number.parseInt(a, 10)
      if (!Number.isInteger(fileIndex) || fileIndex < 0 || fileIndex >= fileCount) {
        throw new Error('WSL Claude plugin metadata returned an invalid response.')
      }
      files[fileIndex] = b === '1' ? decode(c) : null
    } else if (kind === 'S') {
      const entry = synced.get(a) ?? { manifest: null, folders: [] }
      entry.manifest = b === '1' ? decode(c) : null
      synced.set(a, entry)
    } else if (kind === 'D') {
      const entry = synced.get(a) ?? { manifest: null, folders: [] }
      entry.folders.push(b)
      synced.set(a, entry)
    } else {
      throw new Error('WSL Claude plugin metadata returned an invalid response.')
    }
  }
  return { files, synced }
}

/**
 * Lists every plugin folder (entries `E`, type `d` or `f`) and reads the few files the inventory
 * parses (`C`): JSON up to 1 MB and the head of `agents/*.md`. Symlinks are followed like the CLI does.
 * An agent file declared by the manifest outside an `agents` folder is listed but not read, so it is
 * named by its file name instead of its frontmatter.
 */
export function buildWslPluginSnapshotScript(roots: readonly string[]): string {
  const lines = [
    'set -u',
    'snapshot_root() {',
    '  root=$1',
    '  [ -d "$root" ] || return 0',
    `  find -L "$root" -maxdepth ${SNAPSHOT_MAX_DEPTH} \\( -name node_modules -o -name .git \\) -prune -o -print0 2>/dev/null | while IFS= read -r -d '' path; do`,
    '    if [ -d "$path" ]; then kind=d; elif [ -f "$path" ]; then kind=f; else continue; fi',
    `    printf '%s\\0%s\\0%s\\0\\0' E "$kind" "$path"`,
    '  done',
    `  find -L "$root" -maxdepth ${SNAPSHOT_MAX_DEPTH} \\( -name node_modules -o -name .git \\) -prune -o -type f \\( \\( -name '*.json' -size -${MAX_JSON_KB + 1}k \\) -o -path '*/agents/*.md' \\) -print0 2>/dev/null | while IFS= read -r -d '' path; do`,
    `    case "$path" in *.md) encoded=$(head -c ${AGENT_HEAD_BYTES} -- "$path" | base64 | tr -d '\\n') ;; *) encoded=$(base64 < "$path" | tr -d '\\n') ;; esac`,
    `    printf '%s\\0%s\\0%s\\0\\0' C "$path" "$encoded"`,
    '  done',
    '}'
  ]
  for (const root of roots) {
    lines.push(`snapshot_root ${quotePosixShell(root)}`)
  }
  lines.push('exit 0')
  return lines.join('\n')
}

/** A read-only view of the snapshot; paths are the distro's POSIX paths. */
export function parseWslPluginSnapshot(output: string, extraFiles: ReadonlyMap<string, string>) {
  const nodes = new Map<string, { directory: boolean; text?: string }>()
  const fields = output.split('\0')
  let index = 0
  while (index < fields.length && fields[index]) {
    const kind = fields[index++]
    const a = fields[index++] ?? ''
    const b = fields[index++] ?? ''
    index++
    if (kind === 'E' && (a === 'd' || a === 'f')) {
      nodes.set(posix.resolve(b), { directory: a === 'd' })
    } else if (kind === 'C') {
      const node = nodes.get(posix.resolve(a))
      if (node) {
        node.text = decode(b)
      }
    } else {
      throw new Error('WSL Claude plugin snapshot returned an invalid response.')
    }
  }
  for (const [path, text] of extraFiles) {
    nodes.set(posix.resolve(path), { directory: false, text })
  }
  const children = new Map<string, PluginFolderEntry[]>()
  for (const [path, node] of nodes) {
    const parent = posix.dirname(path)
    if (parent === path) {
      continue
    }
    const list = children.get(parent) ?? []
    list.push({ name: posix.basename(path), isDirectory: node.directory, isFile: !node.directory })
    children.set(parent, list)
  }
  const fs: PluginFolderFs = {
    path: posix,
    readText: async (path) => nodes.get(posix.resolve(path))?.text ?? null,
    stat: async (path) => {
      const node = nodes.get(posix.resolve(path))
      return node ? { isDirectory: node.directory, isFile: !node.directory } : null
    },
    readdir: async (path) => children.get(posix.resolve(path)) ?? []
  }
  return fs
}

async function runInDistro(distro: string, script: string): Promise<string> {
  const result = await runWslProcess({
    distro,
    // Absolute paths only; probing the login PATH would eat into the time budget.
    loginPath: 'none',
    script,
    shell: 'bash',
    timeoutMs: WSL_READ_TIMEOUT_MS,
    maxOutputBytes: WSL_READ_MAX_OUTPUT_BYTES
  })
  // A clipped read would pass as a smaller inventory.
  if (result.code !== 0 || result.timedOut || result.outputTruncated) {
    throw new Error(`Could not read the Claude plugins in WSL distribution ${distro}.`)
  }
  return result.stdout
}

/**
 * The plugins Claude loads in a WSL distro. `cwd` and `accountHomePath` are Linux paths of that
 * distro; without `accountHomePath` the distro user's `~/.claude`. `$CLAUDE_CONFIG_DIR` set in the
 * distro's own shell is not consulted: an account names its folder through `accountHomePath`.
 */
export async function readClaudePluginInventoryInWsl(args: {
  distro: string
  accountHomePath: string | null
  cwd: string | null
}): Promise<ClaudePluginInventory> {
  const { distro, cwd } = args
  const home = parseWslUncPath((await getWslHomeAsync(distro)) ?? '')?.linuxPath
  if (!home) {
    throw new Error(`Could not resolve the WSL home directory for ${distro}.`)
  }
  const explicit = args.accountHomePath !== null
  const configDir = args.accountHomePath ?? posix.join(home, '.claude')
  const globalConfig = (exists: (path: string) => boolean) =>
    resolveClaudeGlobalConfigFile({
      env: explicit ? { CLAUDE_CONFIG_DIR: configDir } : {},
      homeDir: home,
      style: 'posix',
      exists
    })
  const legacyFile = globalConfig(() => true)
  const mainFile = globalConfig(() => false)
  const mcpFile = cwd ? posix.join(cwd, '.mcp.json') : null
  const files = [
    posix.join(configDir, 'plugins', 'installed_plugins.json'),
    legacyFile,
    mainFile,
    posix.join(configDir, 'settings.json'),
    ...(cwd
      ? [
          posix.join(cwd, '.claude', 'settings.json'),
          posix.join(cwd, '.claude', 'settings.local.json')
        ]
      : []),
    ...(mcpFile ? [mcpFile] : [])
  ]
  const metadata = parseWslInventoryMetadata(
    await runInDistro(
      distro,
      buildWslInventoryMetadataScript(files, posix.join(configDir, 'plugins', 'synced'))
    ),
    files.length
  )
  const [installedPlugins, legacy, main, userSettings, ...rest] = metadata.files
  const projectSettings = cwd ? rest.slice(0, 2) : []
  const globalConfigText = legacy !== null ? legacy : main
  const accountFolder = syncedAccountFolderName(globalConfigText)
  const sources: ClaudePluginInventorySources = {
    configDir,
    installedPlugins,
    settings: [userSettings, ...projectSettings],
    globalConfig: globalConfigText,
    synced: accountFolder ? (metadata.synced.get(accountFolder) ?? null) : null
  }
  const roots = [
    ...new Set(
      resolveClaudePluginInventory(sources, cwd, posix).map((plugin) => plugin.installPath)
    )
  ]
  const extra = new Map<string, string>()
  const mcpText = metadata.files.at(-1) ?? null
  if (mcpFile && mcpText !== null) {
    extra.set(mcpFile, mcpText)
  }
  const fs = parseWslPluginSnapshot(
    roots.length ? await runInDistro(distro, buildWslPluginSnapshotScript(roots)) : '',
    extra
  )
  return { ...(await assembleClaudePluginInventory({ sources, cwd, fs })), wslDistro: distro }
}
