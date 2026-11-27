import type { ClaudeAgentProfile } from './agent-profile-types'

export type AgentProfilePreflightCode =
  | 'plugin_missing'
  | 'plugin_folder_missing'
  | 'plugin_dir_missing'
  | 'mcp_server_invalid'
  | 'mcp_env_unset'
  | 'mcp_script_missing'
  | 'mcp_tool_server_unknown'
  | 'mcp_tool_out_of_scope'
  | 'agent_unknown'
  | 'sideload_disabled'

export type AgentProfilePreflightFinding = {
  code: AgentProfilePreflightCode
  /** An error blocks the start; a warning is shown and the start goes ahead. */
  severity: 'error' | 'warning'
  message: string
  /** What the finding is about: a plugin id, server name, path or variable name. Never a variable's value. */
  subject: string
}

export type AgentProfilePreflightInputs = {
  /** Plugins of the account and workspace, as the cached inventory reports them. */
  plugins: readonly {
    id: string
    name: string
    problem?: string
    agents: readonly string[]
    mcpServers: readonly string[]
  }[]
  /** MCP servers a start loads without the profile naming them (workspace `.mcp.json`). */
  workspaceMcpServers: readonly string[]
  /** Agent names the start can resolve from `.claude/agents` folders. */
  folderAgents: readonly string[]
  /** The `--agent` the start asks for, when it asks for one. */
  agentName?: string
  /** Only whether a variable is set; the value never enters the preflight. */
  isEnvSet: (name: string) => boolean
  pathExists: (path: string) => boolean
  /** Managed settings `disableSideloadFlags` is on for this machine. */
  sideloadDisabled: boolean
}

// Claude's own built-in agents; `--agent` accepts them besides custom ones.
const BUILT_IN_AGENTS = ['general-purpose', 'Explore', 'Plan', 'statusline-setup']

const ENV_REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)(:-[^}]*)?\}/g
const SCRIPT_FILE = /\.(?:[cm]?[jt]s|py|ps1|sh|bat|cmd|rb)$/i

function normalizeServerName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, '_')
}

function stringsOf(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') {
    into.push(value)
  } else if (Array.isArray(value)) {
    value.forEach((item) => stringsOf(item, into))
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => stringsOf(item, into))
  }
  return into
}

function hasPathSeparator(value: string): boolean {
  return value.includes('/') || value.includes('\\')
}

/** The server a tool name like `mcp__github__create_issue` belongs to; null for any other tool. */
export function mcpServerOfToolName(tool: string): string | null {
  if (!tool.startsWith('mcp__')) {
    return null
  }
  const rest = tool.slice('mcp__'.length)
  const end = rest.indexOf('__')
  const server = (end === -1 ? rest : rest.slice(0, end)).replace(/\*$/, '')
  return server || null
}

/** The `--agent` value in a Claude argument string; the last one wins, as on the command line. */
export function claudeAgentFromArgs(args: string | undefined): string | undefined {
  if (!args) {
    return undefined
  }
  let found: string | undefined
  for (const match of args.matchAll(/(?:^|\s)--agent(?:\s+|=)(?:"([^"]+)"|'([^']+)'|(\S+))/g)) {
    found = match[1] ?? match[2] ?? match[3]
  }
  return found
}

function pluginFindings(
  profile: ClaudeAgentProfile,
  inputs: AgentProfilePreflightInputs
): AgentProfilePreflightFinding[] {
  const findings: AgentProfilePreflightFinding[] = []
  for (const id of profile.enabledPlugins ?? []) {
    const plugin = inputs.plugins.find((entry) => entry.id === id)
    if (!plugin) {
      findings.push({
        code: 'plugin_missing',
        severity: 'error',
        subject: id,
        message: `Plugin ${id} is not installed here.`
      })
    } else if (plugin.problem === 'missing-folder') {
      findings.push({
        code: 'plugin_folder_missing',
        severity: 'error',
        subject: id,
        message: `Plugin ${id} is installed, but its folder is gone from disk.`
      })
    }
  }
  for (const dir of profile.pluginDirs ?? []) {
    if (!inputs.pathExists(dir)) {
      findings.push({
        code: 'plugin_dir_missing',
        severity: 'error',
        subject: dir,
        message: `Plugin folder ${dir} does not exist.`
      })
    }
  }
  return findings
}

function mcpServerFindings(
  name: string,
  server: Record<string, unknown>,
  inputs: AgentProfilePreflightInputs
): AgentProfilePreflightFinding[] {
  const findings: AgentProfilePreflightFinding[] = []
  const command = typeof server.command === 'string' ? server.command : ''
  const url = typeof server.url === 'string' ? server.url : ''
  if (!command && !url) {
    findings.push({
      code: 'mcp_server_invalid',
      severity: 'error',
      subject: name,
      message: `MCP server ${name} has neither a command nor a url.`
    })
  }
  const flagged = new Set<string>()
  for (const text of stringsOf([
    server.command,
    server.args,
    server.url,
    server.env,
    server.headers
  ])) {
    for (const match of text.matchAll(ENV_REFERENCE)) {
      const variable = match[1]
      if (match[2] === undefined && !inputs.isEnvSet(variable) && !flagged.has(variable)) {
        flagged.add(variable)
        findings.push({
          code: 'mcp_env_unset',
          severity: 'warning',
          subject: variable,
          // Why: only the variable's name is reported; it may be missing from Orca's environment yet set in the shell that starts the agent.
          message: `MCP server ${name} reads ${variable}, which is not set in Orca's environment.`
        })
      }
    }
  }
  const args = Array.isArray(server.args)
    ? server.args.filter((arg): arg is string => typeof arg === 'string')
    : []
  const scripts = [
    ...(command && (hasPathSeparator(command) || command.startsWith('.')) ? [command] : []),
    ...args.filter((arg) => !arg.startsWith('-') && SCRIPT_FILE.test(arg))
  ]
  for (const script of scripts) {
    if (!script.includes('${') && !inputs.pathExists(script)) {
      findings.push({
        code: 'mcp_script_missing',
        severity: 'error',
        subject: script,
        message: `MCP server ${name} starts ${script}, which does not exist.`
      })
    }
  }
  return findings
}

function toolScopeFindings(
  profile: ClaudeAgentProfile,
  inputs: AgentProfilePreflightInputs
): AgentProfilePreflightFinding[] {
  const servers = profile.mcpServers
  // Without a strict MCP scope the start keeps loading Claude's other servers, which this cannot enumerate.
  if (!servers) {
    return []
  }
  const inScope = new Set(Object.keys(servers).map(normalizeServerName))
  const knownElsewhere = new Set([
    ...inputs.workspaceMcpServers.map(normalizeServerName),
    ...inputs.plugins.flatMap((plugin) =>
      plugin.mcpServers.map((server) => normalizeServerName(`plugin_${plugin.name}_${server}`))
    )
  ])
  const findings: AgentProfilePreflightFinding[] = []
  const lists = [
    { tools: profile.allowedTools, severity: 'error' as const },
    { tools: profile.disallowedTools, severity: 'warning' as const }
  ]
  for (const { tools, severity } of lists) {
    for (const tool of tools ?? []) {
      const server = mcpServerOfToolName(tool)
      if (!server || inScope.has(server)) {
        continue
      }
      const known = knownElsewhere.has(server)
      findings.push({
        code: known ? 'mcp_tool_out_of_scope' : 'mcp_tool_server_unknown',
        severity,
        subject: tool,
        message: known
          ? `Tool ${tool} names MCP server ${server}, which this profile's strict MCP scope does not load.`
          : `Tool ${tool} names MCP server ${server}, which is not defined anywhere this start can see.`
      })
    }
  }
  return findings
}

function agentFindings(
  profile: ClaudeAgentProfile,
  inputs: AgentProfilePreflightInputs
): AgentProfilePreflightFinding[] {
  const agent = inputs.agentName
  if (!agent) {
    return []
  }
  const enabled = profile.enabledPlugins ? new Set(profile.enabledPlugins) : null
  const known = new Set<string>([...BUILT_IN_AGENTS, ...inputs.folderAgents])
  for (const plugin of inputs.plugins) {
    if (enabled && !enabled.has(plugin.id)) {
      continue
    }
    for (const name of plugin.agents) {
      known.add(name)
      known.add(`${plugin.name}:${name}`)
    }
  }
  return known.has(agent)
    ? []
    : [
        {
          code: 'agent_unknown',
          severity: 'error',
          subject: agent,
          message: `--agent ${agent} names no agent this start can load.`
        }
      ]
}

function sideloadFindings(
  profile: ClaudeAgentProfile,
  inputs: AgentProfilePreflightInputs
): AgentProfilePreflightFinding[] {
  if (!inputs.sideloadDisabled) {
    return []
  }
  const dropped = [
    ...(profile.pluginDirs?.length ? ['--plugin-dir'] : []),
    ...(profile.mcpServers ? ['--mcp-config'] : [])
  ]
  return dropped.length
    ? [
        {
          code: 'sideload_disabled',
          severity: 'error',
          subject: dropped.join(', '),
          message: `Your organization's managed settings (disableSideloadFlags) make Claude discard ${dropped.join(' and ')}.`
        }
      ]
    : []
}

/** Everything wrong with a profile on this machine, checked from inventory and files only: no network, no CLI. */
export function evaluateClaudeProfilePreflight(
  profile: ClaudeAgentProfile,
  inputs: AgentProfilePreflightInputs
): AgentProfilePreflightFinding[] {
  return [
    ...pluginFindings(profile, inputs),
    ...Object.entries(profile.mcpServers ?? {}).flatMap(([name, server]) =>
      mcpServerFindings(name, server, inputs)
    ),
    ...toolScopeFindings(profile, inputs),
    ...agentFindings(profile, inputs),
    ...sideloadFindings(profile, inputs)
  ]
}

export function agentProfilePreflightErrors(
  findings: readonly AgentProfilePreflightFinding[]
): AgentProfilePreflightFinding[] {
  return findings.filter((finding) => finding.severity === 'error')
}

/** One line per finding, for a toast or a spawn error. */
export function formatAgentProfilePreflight(
  findings: readonly AgentProfilePreflightFinding[]
): string {
  return findings.map((finding) => finding.message).join(' ')
}
