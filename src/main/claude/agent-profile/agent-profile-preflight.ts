import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { ClaudeAgentProfile } from '../../../shared/agent-profile/agent-profile-types'
import {
  evaluateClaudeProfilePreflight,
  type AgentProfilePreflightFinding,
  type AgentProfilePreflightInputs
} from '../../../shared/agent-profile/agent-profile-preflight'
import { readClaudePluginInventory } from '../plugin-inventory/claude-plugin-inventory'
import { readClaudeSideloadDisabled } from '../configuration/claude-sideload-policy'

const AGENT_HEAD_BYTES = 2048

async function agentNamesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir).catch(() => [])
  return Promise.all(
    entries
      .filter((name) => name.endsWith('.md'))
      .map(async (name) => {
        // A custom agent is addressed by its frontmatter name, falling back to the file name.
        const head = await readFile(join(dir, name), 'utf8')
          .then((text) => text.slice(0, AGENT_HEAD_BYTES))
          .catch(() => '')
        const declared = /^name:\s*["']?([^\r\n"']+?)["']?\s*$/m.exec(head)?.[1]
        return declared ?? name.slice(0, -'.md'.length)
      })
  )
}

function ancestorsOf(cwd: string): string[] {
  const folders: string[] = []
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    folders.push(dir)
    if (dirname(dir) === dir) {
      return folders
    }
  }
}

async function folderAgents(cwd: string | null, configDir: string): Promise<string[]> {
  const dirs = [
    join(configDir, 'agents'),
    ...(cwd ? ancestorsOf(cwd) : []).map((d) => join(d, '.claude', 'agents'))
  ]
  return (await Promise.all(dirs.map(agentNamesIn))).flat()
}

function pathExistsFrom(cwd: string | null): (path: string) => boolean {
  return (path) => {
    const expanded = path.startsWith('~') ? join(homedir(), path.slice(1)) : path
    return existsSync(isAbsolute(expanded) ? expanded : resolve(cwd ?? process.cwd(), expanded))
  }
}

/**
 * Check a profile against this machine before a start. Reads the cached plugin inventory and a few
 * files only, so it stays fast and never touches the network; the slow MCP connection test is separate.
 */
export async function runClaudeProfilePreflight(args: {
  profile: ClaudeAgentProfile
  cwd: string | null
  /** The `--agent` this start asks for, when it asks for one. */
  agentName?: string
  env?: NodeJS.ProcessEnv
}): Promise<AgentProfilePreflightFinding[]> {
  const needsInventory = Boolean(
    args.profile.enabledPlugins?.length || args.profile.mcpServers || args.agentName
  )
  const needsSideload = Boolean(args.profile.pluginDirs?.length || args.profile.mcpServers)
  const [inventory, sideloadDisabled] = await Promise.all([
    needsInventory
      ? readClaudePluginInventory({ accountHomePath: null, cwd: args.cwd })
      : Promise.resolve(null),
    needsSideload ? readClaudeSideloadDisabled() : Promise.resolve(false)
  ])
  const env = args.env ?? process.env
  const inputs: AgentProfilePreflightInputs = {
    plugins: (inventory?.plugins ?? []).map((plugin) => ({
      id: plugin.id,
      name: plugin.name,
      ...(plugin.problem ? { problem: plugin.problem } : {}),
      agents: plugin.agents,
      mcpServers: plugin.mcpServers
    })),
    workspaceMcpServers: inventory?.workspaceMcpServers ?? [],
    folderAgents:
      args.agentName && inventory ? await folderAgents(args.cwd, inventory.configDir) : [],
    ...(args.agentName ? { agentName: args.agentName } : {}),
    isEnvSet: (name) => Boolean(env[name]),
    pathExists: pathExistsFrom(args.cwd),
    sideloadDisabled
  }
  return evaluateClaudeProfilePreflight(args.profile, inputs)
}
