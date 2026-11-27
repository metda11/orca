import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  CLAUDE_PROFILE_PERMISSION_MODES,
  type ClaudeAgentProfile,
  type ClaudeProfilePermissionMode
} from '../../../shared/agent-profile/agent-profile-types'
import { isSafeAgentProfileId } from '../../../shared/agent-profile/claude-profile-files'
import type { AgentProfileCatalogWarning } from '../../../shared/agent-profile/agent-profile-catalog'

const MAX_PROFILE_FILE_BYTES = 256 * 1024
const MAX_PROFILE_FILES = 200
// Group or other write bit. Windows reports no meaningful mode, so the check is skipped there.
const BROAD_WRITE_BITS = 0o022

export type CentralAgentProfileRead = {
  profiles: ClaudeAgentProfile[]
  warnings: AgentProfileCatalogWarning[]
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isString = (v: unknown): v is string => typeof v === 'string'
const isMcp = (v: unknown): v is Record<string, Record<string, unknown>> =>
  isPlainObject(v) && Object.values(v).every(isPlainObject)
const isMode = (v: unknown): v is ClaudeProfilePermissionMode =>
  CLAUDE_PROFILE_PERMISSION_MODES.some((mode) => mode === v)
const isBudget = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** `undefined` is allowed (field omitted); any present value must pass `check`. */
function optional<T>(
  value: unknown,
  check: (v: unknown) => v is T
): { ok: true; value?: T } | null {
  if (value === undefined) {
    return { ok: true }
  }
  return check(value) ? { ok: true, value } : null
}

/**
 * Strict shape check; a file that fails it is skipped with a warning rather than half-applied.
 * Only known keys are copied, so unknown ones cannot ride along into launch files.
 */
export function parseCentralAgentProfile(value: unknown): ClaudeAgentProfile | null {
  if (!isPlainObject(value)) {
    return null
  }
  const { id, name } = value
  if (typeof id !== 'string' || !isSafeAgentProfileId(id) || typeof name !== 'string') {
    return null
  }
  if (!name.trim()) {
    return null
  }
  const enabledPlugins = optional(value.enabledPlugins, isStringArray)
  const pluginDirs = optional(value.pluginDirs, isStringArray)
  const mcpServers = optional(value.mcpServers, isMcp)
  const model = optional(value.model, isString)
  const permissionMode = optional(value.permissionMode, isMode)
  const allowedTools = optional(value.allowedTools, isStringArray)
  const disallowedTools = optional(value.disallowedTools, isStringArray)
  const appendSystemPrompt = optional(value.appendSystemPrompt, isString)
  const maxBudgetUsd = optional(value.maxBudgetUsd, isBudget)
  const defaultTask = optional(value.defaultTask, isString)
  const accountId = optional(value.accountId, isString)
  if (
    !enabledPlugins ||
    !pluginDirs ||
    !mcpServers ||
    !model ||
    !permissionMode ||
    !allowedTools ||
    !disallowedTools ||
    !appendSystemPrompt ||
    !maxBudgetUsd ||
    !defaultTask ||
    !accountId
  ) {
    return null
  }
  return {
    id,
    name,
    ...(enabledPlugins.value === undefined ? {} : { enabledPlugins: enabledPlugins.value }),
    ...(pluginDirs.value === undefined ? {} : { pluginDirs: pluginDirs.value }),
    ...(mcpServers.value === undefined ? {} : { mcpServers: mcpServers.value }),
    ...(model.value === undefined ? {} : { model: model.value }),
    ...(permissionMode.value === undefined ? {} : { permissionMode: permissionMode.value }),
    ...(allowedTools.value === undefined ? {} : { allowedTools: allowedTools.value }),
    ...(disallowedTools.value === undefined ? {} : { disallowedTools: disallowedTools.value }),
    ...(appendSystemPrompt.value === undefined
      ? {}
      : { appendSystemPrompt: appendSystemPrompt.value }),
    ...(maxBudgetUsd.value === undefined ? {} : { maxBudgetUsd: maxBudgetUsd.value }),
    ...(defaultTask.value === undefined ? {} : { defaultTask: defaultTask.value }),
    ...(accountId.value === undefined ? {} : { accountId: accountId.value })
  }
}

/**
 * Read `*.json` profiles from a shared folder. Strictly read-only: no write, rename or mkdir is ever
 * issued against it, so a read-only share works and the folder is never altered by Orca.
 */
export async function readCentralAgentProfileFolder(dir: string): Promise<CentralAgentProfileRead> {
  const warnings: AgentProfileCatalogWarning[] = []
  const profiles: ClaudeAgentProfile[] = []
  let names: string[]
  try {
    names = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith('.json')).sort()
  } catch {
    return { profiles, warnings: [{ code: 'central_folder_unreadable', path: dir }] }
  }
  if (process.platform !== 'win32') {
    const dirMode = await stat(dir).then(
      (info) => info.mode,
      () => 0
    )
    if (dirMode & BROAD_WRITE_BITS) {
      warnings.push({ code: 'central_folder_writable_by_others', path: dir })
    }
  }
  const seen = new Set<string>()
  for (const name of names.slice(0, MAX_PROFILE_FILES)) {
    const file = join(dir, name)
    try {
      const info = await stat(file)
      if (!info.isFile() || info.size > MAX_PROFILE_FILE_BYTES) {
        throw new Error('not a profile file')
      }
      if (process.platform !== 'win32' && info.mode & BROAD_WRITE_BITS) {
        warnings.push({ code: 'central_folder_writable_by_others', path: file })
      }
      const profile = parseCentralAgentProfile(JSON.parse(await readFile(file, 'utf8')))
      if (!profile) {
        throw new Error('invalid profile')
      }
      if (seen.has(profile.id)) {
        warnings.push({ code: 'central_profile_duplicate_id', file: name, id: profile.id })
        continue
      }
      seen.add(profile.id)
      profiles.push(profile)
    } catch {
      warnings.push({ code: 'central_profile_invalid', file: name })
    }
  }
  return { profiles, warnings }
}
