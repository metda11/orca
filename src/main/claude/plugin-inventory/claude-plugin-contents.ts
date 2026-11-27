// What one plugin folder brings, read the way Claude loads it: default `skills/`, `agents/` and
// `commands/` plus the manifest's extra paths, and MCP servers from the manifest or `.mcp.json`.
import { readdir, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { readPluginMetadataFile } from '../../skills/discovery/plugin-skill-metadata'
import {
  asRecord,
  parseJsonObject
} from '../../../shared/workspace-setup/setup-script-import-parsers'
import type { ClaudePluginContents } from '../../../shared/claude-plugins/claude-plugin-inventory'

// Bounds a hostile or runaway folder; real plugins carry a few dozen entries each.
const MAX_ENTRIES_PER_KIND = 2000
const MAX_COMMAND_DEPTH = 4

export type ClaudePluginFolderRead = {
  contents: ClaudePluginContents
  manifest: Record<string, unknown> | null
  problem?: 'missing-folder' | 'unreadable-manifest'
}

const EMPTY: ClaudePluginContents = { skills: [], agents: [], commands: [], mcpServers: [] }

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (entry) => entry.isDirectory(),
    () => false
  )
}

async function entriesOf(dir: string) {
  return readdir(dir, { withFileTypes: true }).catch(() => [])
}

// Manifest paths are relative to the plugin root; one that leaves it is ignored.
function manifestPaths(root: string, value: unknown): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return values.flatMap((entry) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      return []
    }
    const target = resolve(root, entry)
    const inside = relative(root, target)
    return inside === '' ||
      (!inside.startsWith(`..${sep}`) && inside !== '..' && !isAbsolute(inside))
      ? [target]
      : []
  })
}

function frontmatterName(text: string | null): string | null {
  // Claude writes no BOM, but an editor may; compare by code so the bundle stays ASCII.
  const body = text?.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const block = body?.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1]
  const name = block?.match(/^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m)?.[1]?.trim()
  return name || null
}

async function readSkills(dirs: readonly string[]): Promise<string[]> {
  const names = new Set<string>()
  for (const dir of dirs) {
    for (const entry of await entriesOf(dir)) {
      if (names.size >= MAX_ENTRIES_PER_KIND) {
        break
      }
      if (
        entry.isDirectory() &&
        (await stat(join(dir, entry.name, 'SKILL.md')).catch(() => null))
      ) {
        names.add(entry.name)
      }
    }
  }
  return [...names].sort()
}

async function readAgents(paths: readonly string[]): Promise<string[]> {
  const names = new Set<string>()
  const add = async (file: string) => {
    if (names.size < MAX_ENTRIES_PER_KIND && extname(file) === '.md') {
      names.add(frontmatterName(await readPluginMetadataFile(file)) ?? basename(file, '.md'))
    }
  }
  for (const path of paths) {
    if (await isDirectory(path)) {
      for (const entry of await entriesOf(path)) {
        if (entry.isFile()) {
          await add(join(path, entry.name))
        }
      }
    } else {
      await add(path)
    }
  }
  return [...names].sort()
}

// A command in a subfolder is `<folder>:<name>`, as Claude names nested commands.
async function readCommands(paths: readonly string[]): Promise<string[]> {
  const names = new Set<string>()
  const walk = async (dir: string, prefix: string[], depth: number): Promise<void> => {
    for (const entry of await entriesOf(dir)) {
      if (names.size >= MAX_ENTRIES_PER_KIND) {
        return
      }
      if (entry.isDirectory() && depth < MAX_COMMAND_DEPTH) {
        await walk(join(dir, entry.name), [...prefix, entry.name], depth + 1)
      } else if (entry.isFile() && extname(entry.name) === '.md') {
        names.add([...prefix, basename(entry.name, '.md')].join(':'))
      }
    }
  }
  for (const path of paths) {
    if (await isDirectory(path)) {
      await walk(path, [], 0)
    } else if (extname(path) === '.md' && (await stat(path).catch(() => null))) {
      names.add(basename(path, '.md'))
    }
  }
  return [...names].sort()
}

/** Server names of an MCP config: an `mcpServers` block, or a bare map of servers as plugins ship it. */
export function mcpServerNames(config: Record<string, unknown> | null): string[] {
  if (!config) {
    return []
  }
  const servers = asRecord(config.mcpServers) ?? config
  return Object.entries(servers)
    .filter(([, value]) => value !== null && typeof value === 'object' && !Array.isArray(value))
    .map(([name]) => name)
    .sort()
}

async function readMcpServers(root: string, manifest: Record<string, unknown> | null) {
  const declared = manifest?.mcpServers
  if (declared && typeof declared === 'object' && !Array.isArray(declared)) {
    return mcpServerNames({ mcpServers: declared })
  }
  const files =
    typeof declared === 'string' ? manifestPaths(root, declared) : [join(root, '.mcp.json')]
  const names = await Promise.all(
    files.map(async (file) => mcpServerNames(parseJsonObject(await readPluginMetadataFile(file))))
  )
  return [...new Set(names.flat())].sort()
}

export async function readClaudePluginFolder(root: string): Promise<ClaudePluginFolderRead> {
  if (!(await isDirectory(root))) {
    return { contents: EMPTY, manifest: null, problem: 'missing-folder' }
  }
  const manifestPath = join(root, '.claude-plugin', 'plugin.json')
  const manifestText = await readPluginMetadataFile(manifestPath)
  const manifest = parseJsonObject(manifestText)
  const [skills, agents, commands, mcpServers] = await Promise.all([
    readSkills([join(root, 'skills'), ...manifestPaths(root, manifest?.skills)]),
    readAgents([join(root, 'agents'), ...manifestPaths(root, manifest?.agents)]),
    readCommands([join(root, 'commands'), ...manifestPaths(root, manifest?.commands)]),
    readMcpServers(root, manifest)
  ])
  return {
    contents: { skills, agents, commands, mcpServers },
    manifest,
    // A folder without a manifest still loads with default paths; a manifest that will not parse does not.
    ...(manifestText !== null && !manifest ? { problem: 'unreadable-manifest' as const } : {})
  }
}
