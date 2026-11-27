import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  CLAUDE_PROFILE_PERMISSION_MODES,
  type ClaudeAgentProfile
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

function optionalOk<T>(value: unknown, check: (v: unknown) => v is T): boolean {
  return value === undefined || check(value)
}

/** Strict shape check; a file that fails it is skipped with a warning rather than half-applied. */
export function parseCentralAgentProfile(value: unknown): ClaudeAgentProfile | null {
  if (!isPlainObject(value)) {
    return null
  }
  const isString = (v: unknown): v is string => typeof v === 'string'
  const isMcp = (v: unknown): v is Record<string, Record<string, unknown>> =>
    isPlainObject(v) && Object.values(v).every(isPlainObject)
  const isMode = (v: unknown): v is (typeof CLAUDE_PROFILE_PERMISSION_MODES)[number] =>
    typeof v === 'string' && (CLAUDE_PROFILE_PERMISSION_MODES as readonly string[]).includes(v)
  const isBudget = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0
  if (
    typeof value.id !== 'string' ||
    !isSafeAgentProfileId(value.id) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    !optionalOk(value.enabledPlugins, isStringArray) ||
    !optionalOk(value.pluginDirs, isStringArray) ||
    !optionalOk(value.mcpServers, isMcp) ||
    !optionalOk(value.model, isString) ||
    !optionalOk(value.permissionMode, isMode) ||
    !optionalOk(value.allowedTools, isStringArray) ||
    !optionalOk(value.disallowedTools, isStringArray) ||
    !optionalOk(value.appendSystemPrompt, isString) ||
    !optionalOk(value.maxBudgetUsd, isBudget) ||
    !optionalOk(value.defaultTask, isString) ||
    !optionalOk(value.accountId, isString)
  ) {
    return null
  }
  // Why a copy of known keys only: unknown keys must not ride along into launch files.
  const known = [
    'id',
    'name',
    'enabledPlugins',
    'pluginDirs',
    'mcpServers',
    'model',
    'permissionMode',
    'allowedTools',
    'disallowedTools',
    'appendSystemPrompt',
    'maxBudgetUsd',
    'defaultTask',
    'accountId'
  ]
  const profile: Record<string, unknown> = {}
  for (const key of known) {
    if (value[key] !== undefined) {
      profile[key] = value[key]
    }
  }
  return profile as ClaudeAgentProfile
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
