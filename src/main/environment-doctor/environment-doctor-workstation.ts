import { join, resolve } from 'node:path'
import type { EnvironmentDoctorCheck } from '../../shared/workspace-setup/environment-doctor/environment-doctor-types'
import {
  isAllowedWorkstationFix,
  formatWorkstationFix,
  parseWorkstationRequirements,
  type WorkstationRequirement
} from '../../shared/workspace-setup/environment-doctor/workstation-requirements'
import { createManagedCommandMatcher } from '../agent-hooks/installation/commands/managed-hook-command-matching'
import {
  check,
  PROBE_TIMEOUT_MS,
  runSafely,
  type EnvironmentDoctorCommandResult,
  type EnvironmentDoctorDeps
} from './environment-doctor-check'

const CLAUDE_MANAGED_SCRIPT = 'claude-hook.sh'

/** Load failures are one check, so a broken target list never hides the other groups. */
export async function checkWorkstation(
  deps: EnvironmentDoctorDeps,
  cwd: string
): Promise<EnvironmentDoctorCheck[]> {
  const text = await deps.readWorkstationRequirements().catch(() => null)
  if (text === null) {
    return []
  }
  const parsed = parseWorkstationRequirements(text)
  if (!parsed.ok) {
    return [
      check(
        'workstation',
        'workstation.requirements',
        'fail',
        `Target list is invalid: ${parsed.error}`,
        {
          remediation: 'Fix the workstation target list file.'
        }
      )
    ]
  }
  const found = await deps.findCommands([
    'claude',
    ...parsed.requirements.flatMap((entry) => (entry.kind === 'command' ? [entry.command] : []))
  ])
  const claudeOutput = new Map<string, Promise<EnvironmentDoctorCommandResult | null>>()
  const claudeList = (args: string[]): Promise<EnvironmentDoctorCommandResult | null> => {
    const key = args.join(' ')
    let pending = claudeOutput.get(key)
    if (!pending) {
      pending = found.has('claude')
        ? runSafely(deps, 'claude', args, { cwd, timeoutMs: PROBE_TIMEOUT_MS })
        : Promise.resolve(null)
      claudeOutput.set(key, pending)
    }
    return pending
  }
  const checks = await Promise.all(
    parsed.requirements.map((entry) => checkRequirement(entry, deps, found, claudeList, cwd))
  )
  return [...checks, await checkForeignClaudeHooks(deps)]
}

async function checkRequirement(
  entry: WorkstationRequirement,
  deps: EnvironmentDoctorDeps,
  found: Set<string>,
  claudeList: (args: string[]) => Promise<EnvironmentDoctorCommandResult | null>,
  cwd: string
): Promise<EnvironmentDoctorCheck> {
  const id = `workstation.${entry.id}`
  const label = entry.label ?? entry.id
  const missing = (message: string): EnvironmentDoctorCheck => {
    const fix = entry.fix
    const allowed = fix !== undefined && isAllowedWorkstationFix(fix)
    return check('workstation', id, 'fail', message, {
      ...(fix && allowed ? { fixCommand: [...fix] } : {}),
      remediation: fix
        ? allowed
          ? `Run \`${formatWorkstationFix(fix)}\`.`
          : `Run \`${formatWorkstationFix(fix)}\` yourself; it is not on the safe-fix list.`
        : undefined
    })
  }
  const unverifiable = (reason: string): EnvironmentDoctorCheck =>
    check('workstation', id, 'skip', `${label}: not verifiable here (${reason}).`)

  switch (entry.kind) {
    case 'command': {
      if (!found.has(entry.command)) {
        return missing(`${label}: ${entry.command} is not on PATH.`)
      }
      if (!entry.minVersion) {
        return check('workstation', id, 'pass', `${label}: ${entry.command} is installed.`)
      }
      const result = await runSafely(deps, entry.command, ['--version'], {
        cwd,
        timeoutMs: PROBE_TIMEOUT_MS
      })
      const version = result.code === 0 ? extractVersion(result.stdout || result.stderr) : null
      if (!version) {
        return unverifiable(`could not read the ${entry.command} version`)
      }
      return compareVersions(version, entry.minVersion) >= 0
        ? check(
            'workstation',
            id,
            'pass',
            `${label}: ${entry.command} ${version} (needs ${entry.minVersion}+).`
          )
        : missing(`${label}: ${entry.command} ${version} is older than ${entry.minVersion}.`)
    }
    case 'claude-marketplace':
    case 'claude-plugin': {
      const args =
        entry.kind === 'claude-plugin' ? ['plugin', 'list'] : ['plugin', 'marketplace', 'list']
      const result = await claudeList(args)
      if (!result) {
        return unverifiable('claude CLI is not on PATH')
      }
      if (result.code !== 0) {
        return unverifiable(`\`claude ${args.join(' ')}\` failed`)
      }
      return listsName(result.stdout, entry.name)
        ? check('workstation', id, 'pass', `${label}: ${entry.name} is present.`)
        : missing(`${label}: ${entry.name} is not installed.`)
    }
    case 'path-entry': {
      const wanted = normalizePathEntry(entry.entry, deps)
      return deps.pathEntries().some((part) => normalizePathEntry(part, deps) === wanted)
        ? check('workstation', id, 'pass', `${label}: ${entry.entry} is on PATH.`)
        : missing(`${label}: ${entry.entry} is not on PATH.`)
    }
  }
}

/** Hooks in the user's global Claude settings that Orca did not install; informational only. */
async function checkForeignClaudeHooks(
  deps: EnvironmentDoctorDeps
): Promise<EnvironmentDoctorCheck> {
  const id = 'workstation.claude-foreign-hooks'
  const text = await deps.readFile(join(deps.homeDir, '.claude', 'settings.json'))
  if (text === null) {
    return check('workstation', id, 'pass', 'No global Claude settings, so no foreign hooks.')
  }
  const commands = countForeignHookCommands(text)
  if (commands === null) {
    return check('workstation', id, 'skip', 'Global Claude settings could not be parsed.')
  }
  return commands.length === 0
    ? check('workstation', id, 'pass', 'No foreign hooks in the global Claude settings.')
    : check(
        'workstation',
        id,
        'info',
        `${commands.length} hook command(s) in ~/.claude/settings.json are not managed by Orca.`
      )
}

export function countForeignHookCommands(settingsText: string): string[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(settingsText)
  } catch {
    return null
  }
  const hooks = isRecord(parsed) ? parsed.hooks : undefined
  if (!isRecord(hooks)) {
    return []
  }
  const isManaged = createManagedCommandMatcher(CLAUDE_MANAGED_SCRIPT)
  const foreign: string[] = []
  for (const groups of Object.values(hooks)) {
    for (const group of Array.isArray(groups) ? groups : []) {
      const entries = isRecord(group) && Array.isArray(group.hooks) ? group.hooks : []
      for (const hook of entries) {
        const command = isRecord(hook) ? hook.command : undefined
        if (typeof command === 'string' && command.trim() && !isManaged(command)) {
          foreign.push(command)
        }
      }
    }
  }
  return foreign
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function listsName(output: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[\\s❯])${escaped}(@\\S+)?(\\s|$)`, 'im').test(output)
}

function extractVersion(output: string): string | null {
  return /(\d+)\.(\d+)(?:\.(\d+))?/.exec(output)?.[0] ?? null
}

function compareVersions(actual: string, wanted: string): number {
  const a = actual.split('.').map(Number)
  const b = wanted.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    if (diff !== 0) {
      return diff
    }
  }
  return 0
}

function normalizePathEntry(entry: string, deps: EnvironmentDoctorDeps): string {
  const expanded = entry.startsWith('~') ? join(deps.homeDir, entry.slice(1)) : entry
  const normalized = resolve(expanded).replace(/[\\/]+$/, '')
  return deps.platform === 'win32' ? normalized.toLowerCase() : normalized
}
