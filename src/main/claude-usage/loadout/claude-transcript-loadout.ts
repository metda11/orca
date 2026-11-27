import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { normalizeMcpServerKey } from '../../../shared/agent-profile/loadout/claude-loadout-compare'
import type {
  ClaudeLoadoutListing,
  ClaudeLoadoutUsage,
  ClaudeLoadoutUseCount
} from '../../../shared/agent-profile/loadout/claude-loadout-types'

const ACCOUNT_SKILL_NAMESPACE = 'anthropic-skills'
const MCP_TOOL_PATTERN = /^mcp__(.+?)__/
const SKILL_LISTING_LINE = /^- (\S+?)(?:: |\s*$)/
const LISTING_ATTACHMENTS = ['skill_listing', 'agent_listing_delta', 'deferred_tools_delta']

export type ClaudeTranscriptLoadout = {
  listing: ClaudeLoadoutListing | null
  usage: ClaudeLoadoutUsage
}

type Json = Record<string, unknown>

function isJsonRecord(value: unknown): value is Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): Json | null {
  return isJsonRecord(value) ? value : null
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function pluginOfNamespacedId(id: string): string | null {
  const colon = id.indexOf(':')
  if (colon <= 0) {
    return null
  }
  const prefix = id.slice(0, colon)
  return prefix === ACCOUNT_SKILL_NAMESPACE ? null : prefix
}

function bump(map: Map<string, number>, name: string): void {
  map.set(name, (map.get(name) ?? 0) + 1)
}

function counts(map: Map<string, number>): ClaudeLoadoutUseCount[] {
  return [...map]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** Folds transcript lines into what the session offered and what it used; feed lines in file order. */
export class ClaudeTranscriptLoadoutAccumulator {
  private readonly skills = new Set<string>()
  private readonly agents = new Set<string>()
  private readonly deferredTools = new Set<string>()
  private readonly plugins = new Set<string>()
  private readonly mcpServers = new Set<string>()
  private initFrame = false
  private sawListing = false
  private readonly seenToolUseIds = new Set<string>()
  private readonly tools = new Map<string, number>()
  private readonly usedSkills = new Map<string, number>()
  private readonly subagents = new Map<string, number>()
  private readonly usedMcpServers = new Set<string>()

  feed(line: string): void {
    const mayList = line.includes('"attachment"') || line.includes('"init"')
    const mayUse = line.includes('"tool_use"')
    if (!mayList && !mayUse) {
      return
    }
    let record: Json | null
    try {
      record = asRecord(JSON.parse(line))
    } catch {
      return
    }
    if (!record) {
      return
    }
    if (record.type === 'attachment') {
      this.readAttachment(asRecord(record.attachment))
    } else if (record.type === 'system' && record.subtype === 'init') {
      this.readInitFrame(record)
    } else if (record.type === 'assistant') {
      this.readToolUses(asRecord(record.message))
    }
  }

  result(): ClaudeTranscriptLoadout {
    const usage: ClaudeLoadoutUsage = {
      tools: counts(this.tools),
      skills: counts(this.usedSkills),
      subagents: counts(this.subagents),
      mcpServers: [...this.usedMcpServers].sort()
    }
    if (!this.sawListing && !this.initFrame) {
      return { listing: null, usage }
    }
    const mcpServers = new Set(this.mcpServers)
    for (const tool of this.deferredTools) {
      const server = MCP_TOOL_PATTERN.exec(tool)?.[1]
      if (server) {
        mcpServers.add(server)
      }
    }
    const plugins = new Set(this.plugins)
    if (!this.initFrame) {
      for (const id of [...this.skills, ...this.agents]) {
        const plugin = pluginOfNamespacedId(id)
        if (plugin) {
          plugins.add(plugin)
        }
      }
    }
    return {
      listing: {
        source: this.initFrame ? 'init-frame' : 'transcript-listing',
        plugins: [...plugins].sort(),
        skills: [...this.skills].sort(),
        agents: [...this.agents].sort(),
        mcpServers: [...mcpServers].sort()
      },
      usage
    }
  }

  private readAttachment(attachment: Json | null): void {
    const type = attachment?.type
    if (!attachment || typeof type !== 'string' || !LISTING_ATTACHMENTS.includes(type)) {
      return
    }
    // Why: tool deltas alone say nothing about skills or agents, so they never make a log "listed".
    this.sawListing ||= type !== 'deferred_tools_delta'
    if (type === 'skill_listing' && typeof attachment.content === 'string') {
      for (const line of attachment.content.split('\n')) {
        const name = SKILL_LISTING_LINE.exec(line)?.[1]
        if (name) {
          this.skills.add(name)
        }
      }
    } else if (type === 'agent_listing_delta') {
      for (const name of strings(attachment.addedTypes)) {
        this.agents.add(name)
      }
      for (const name of strings(attachment.removedTypes)) {
        this.agents.delete(name)
      }
    } else if (type === 'deferred_tools_delta') {
      for (const name of strings(attachment.addedNames)) {
        this.deferredTools.add(name)
      }
      for (const name of strings(attachment.removedNames)) {
        this.deferredTools.delete(name)
      }
    }
  }

  private readInitFrame(record: Json): void {
    this.initFrame = true
    for (const name of strings(record.skills)) {
      this.skills.add(name)
    }
    for (const name of strings(record.agents)) {
      this.agents.add(name)
    }
    for (const plugin of Array.isArray(record.plugins) ? record.plugins : []) {
      const name = typeof plugin === 'string' ? plugin : asRecord(plugin)?.name
      if (typeof name === 'string') {
        this.plugins.add(name)
      }
    }
    for (const server of Array.isArray(record.mcp_servers) ? record.mcp_servers : []) {
      const name = typeof server === 'string' ? server : asRecord(server)?.name
      if (typeof name === 'string') {
        this.mcpServers.add(normalizeMcpServerKey(name))
      }
    }
  }

  private readToolUses(message: Json | null): void {
    for (const block of Array.isArray(message?.content) ? message.content : []) {
      const use = asRecord(block)
      if (use?.type !== 'tool_use' || typeof use.name !== 'string') {
        continue
      }
      // Why: streamed rows repeat a block, and fork-copied history repeats whole turns.
      if (typeof use.id === 'string') {
        if (this.seenToolUseIds.has(use.id)) {
          continue
        }
        this.seenToolUseIds.add(use.id)
      }
      bump(this.tools, use.name)
      const input = asRecord(use.input)
      if (use.name === 'Skill' && typeof input?.skill === 'string') {
        bump(this.usedSkills, input.skill.replace(/^\//, ''))
      } else if (use.name === 'Agent' || use.name === 'Task') {
        bump(
          this.subagents,
          typeof input?.subagent_type === 'string' ? input.subagent_type : 'general-purpose'
        )
      }
      const server = MCP_TOOL_PATTERN.exec(use.name)?.[1]
      if (server) {
        this.usedMcpServers.add(server)
      }
    }
  }
}

export async function readClaudeTranscriptLoadout(
  filePath: string
): Promise<ClaudeTranscriptLoadout> {
  const accumulator = new ClaudeTranscriptLoadoutAccumulator()
  const lines = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity
  })
  for await (const line of lines) {
    accumulator.feed(line)
  }
  return accumulator.result()
}
