// Zod-free: the target list is a plain JSON file and the allowlist is a security boundary.
export type WorkstationFixCommand = readonly string[]

type WorkstationRequirementBase = {
  id: string
  label?: string
  /** argv of a repair command; only honored when it passes isAllowedWorkstationFix. */
  fix?: WorkstationFixCommand
}

export type WorkstationRequirement =
  | (WorkstationRequirementBase & { kind: 'command'; command: string; minVersion?: string })
  | (WorkstationRequirementBase & { kind: 'claude-marketplace'; name: string })
  | (WorkstationRequirementBase & { kind: 'claude-plugin'; name: string })
  | (WorkstationRequirementBase & { kind: 'path-entry'; entry: string })

export type WorkstationRequirementsParse =
  | { ok: true; requirements: WorkstationRequirement[] }
  | { ok: false; error: string }

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const COMMAND_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const VERSION_PATTERN = /^\d+(\.\d+){0,2}$/
const CLAUDE_PLUGIN_SPEC = /^[A-Za-z0-9][A-Za-z0-9._-]*(@[A-Za-z0-9][A-Za-z0-9._-]*)?$/
const MARKETPLACE_SOURCE =
  /^(https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9._/-]+|[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*)$/
const NPM_PACKAGE =
  /^(@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*(@[A-Za-z0-9][A-Za-z0-9._-]*)?$/
const DOTNET_PACKAGE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const DOTNET_VERSION = /^\d[0-9A-Za-z.+-]*$/

/**
 * Only idempotent installs from a registry or marketplace name may run unattended; anything
 * else (URLs to tarballs, local paths, interactive installers, shell pipes) is shown, never run.
 */
export function isAllowedWorkstationFix(argv: readonly unknown[]): argv is WorkstationFixCommand {
  if (!argv.every((part): part is string => typeof part === 'string')) {
    return false
  }
  const [program, ...args] = argv
  if (program === 'claude') {
    if (args.length === 3 && args[0] === 'plugin' && args[1] === 'install') {
      return CLAUDE_PLUGIN_SPEC.test(args[2])
    }
    if (
      args.length === 4 &&
      args[0] === 'plugin' &&
      args[1] === 'marketplace' &&
      args[2] === 'add'
    ) {
      return MARKETPLACE_SOURCE.test(args[3])
    }
    return false
  }
  if (program === 'npm') {
    return (
      args.length === 3 &&
      (args[0] === 'install' || args[0] === 'i') &&
      (args[1] === '-g' || args[1] === '--global') &&
      NPM_PACKAGE.test(args[2])
    )
  }
  if (program === 'dotnet') {
    if (args[0] !== 'tool' || args[1] !== 'install') {
      return false
    }
    const rest = args.slice(2)
    if (rest[0] === '-g' || rest[0] === '--global') {
      rest.shift()
    }
    if (rest.length === 0 || !DOTNET_PACKAGE.test(rest[0])) {
      return false
    }
    if (rest.length === 1) {
      return true
    }
    return rest.length === 3 && rest[1] === '--version' && DOTNET_VERSION.test(rest[2])
  }
  return false
}

export function formatWorkstationFix(fix: WorkstationFixCommand): string {
  return fix.join(' ')
}

export function parseWorkstationRequirements(text: string): WorkstationRequirementsParse {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Not valid JSON.' }
  }
  const list = isRecord(raw) ? raw.requirements : null
  if (!Array.isArray(list)) {
    return { ok: false, error: 'Expected an object with a "requirements" array.' }
  }
  const requirements: WorkstationRequirement[] = []
  const seen = new Set<string>()
  for (const [index, entry] of list.entries()) {
    const parsed = parseEntry(entry)
    if (typeof parsed === 'string') {
      return { ok: false, error: `requirements[${index}]: ${parsed}` }
    }
    if (seen.has(parsed.id)) {
      return { ok: false, error: `requirements[${index}]: duplicate id "${parsed.id}".` }
    }
    seen.add(parsed.id)
    requirements.push(parsed)
  }
  return { ok: true, requirements }
}

function parseEntry(entry: unknown): WorkstationRequirement | string {
  if (!isRecord(entry)) {
    return 'Expected an object.'
  }
  const { id, kind, label, fix } = entry
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    return 'Missing or invalid "id".'
  }
  if (label !== undefined && typeof label !== 'string') {
    return '"label" must be a string.'
  }
  if (fix !== undefined && !isStringArray(fix)) {
    return '"fix" must be an array of strings.'
  }
  const base: WorkstationRequirementBase = {
    id,
    ...(label ? { label } : {}),
    ...(fix ? { fix } : {})
  }
  switch (kind) {
    case 'command': {
      const { command, minVersion } = entry
      if (typeof command !== 'string' || !COMMAND_PATTERN.test(command)) {
        return 'Missing or invalid "command".'
      }
      if (minVersion === undefined) {
        return { ...base, kind, command }
      }
      if (typeof minVersion !== 'string' || !VERSION_PATTERN.test(minVersion)) {
        return '"minVersion" must look like 20 or 20.11.1.'
      }
      return { ...base, kind, command, minVersion }
    }
    case 'claude-marketplace':
    case 'claude-plugin': {
      const { name } = entry
      if (typeof name !== 'string' || !CLAUDE_PLUGIN_SPEC.test(name)) {
        return 'Missing or invalid "name".'
      }
      return { ...base, kind, name }
    }
    case 'path-entry': {
      const { entry: pathEntry } = entry
      if (typeof pathEntry !== 'string' || pathEntry.trim() === '') {
        return 'Missing "entry".'
      }
      return { ...base, kind, entry: pathEntry }
    }
    default:
      return 'Unknown "kind".'
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((part) => typeof part === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
