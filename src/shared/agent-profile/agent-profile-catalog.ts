import type { ClaudeAgentProfile } from './agent-profile-types'

/**
 * Where a profile in the picker comes from. `central` is read-only (a shared folder), `default` is a
 * bundled template copied once into local storage, `local` is the user's own.
 */
export type AgentProfileOrigin = 'central' | 'default' | 'local'

/** Only meaningful for `default` copies. */
export type DefaultProfileState = 'current' | 'outdated' | 'edited'

export type AgentProfileCatalogEntry = {
  profile: ClaudeAgentProfile
  origin: AgentProfileOrigin
  /** Central profiles cannot be edited or deleted from Orca. */
  readOnly: boolean
  defaultState?: DefaultProfileState
  /** A local profile with the same id exists and is hidden by this central one (left untouched). */
  shadowsLocal?: boolean
}

export type AgentProfileCatalogWarning =
  | { code: 'central_folder_unreadable'; path: string }
  | { code: 'central_folder_writable_by_others'; path: string }
  | { code: 'central_profile_invalid'; file: string }
  | { code: 'central_profile_duplicate_id'; file: string; id: string }

export type AgentProfileCatalog = {
  entries: AgentProfileCatalogEntry[]
  warnings: AgentProfileCatalogWarning[]
}

/**
 * `current`: the copy equals the shipped template. `outdated`: the template changed since the copy was
 * made and the copy is still exactly what was copied. Anything else was edited by the user.
 */
export function classifyDefaultProfileCopy(args: {
  copyDigest: string
  templateDigest: string
  /** Digest of the template at the moment it was copied (or last reset). */
  baselineDigest: string | undefined
}): DefaultProfileState {
  if (args.copyDigest === args.templateDigest) {
    return 'current'
  }
  return args.baselineDigest !== undefined && args.copyDigest === args.baselineDigest
    ? 'outdated'
    : 'edited'
}

/** Central wins over local and default of the same id; a hidden local profile stays as it is. */
export function mergeAgentProfileCatalog(args: {
  central: readonly ClaudeAgentProfile[]
  local: readonly ClaudeAgentProfile[]
  /** Template ids with their classification; a local profile of such an id is a default copy. */
  defaultStates: ReadonlyMap<string, DefaultProfileState>
}): AgentProfileCatalogEntry[] {
  const centralIds = new Set(args.central.map((profile) => profile.id))
  const localIds = new Set(args.local.map((profile) => profile.id))
  const central = args.central.map((profile): AgentProfileCatalogEntry => ({
    profile,
    origin: 'central',
    readOnly: true,
    ...(localIds.has(profile.id) ? { shadowsLocal: true } : {})
  }))
  const local = args.local
    .filter((profile) => !centralIds.has(profile.id))
    .map((profile): AgentProfileCatalogEntry => {
      const defaultState = args.defaultStates.get(profile.id)
      return defaultState
        ? { profile, origin: 'default', readOnly: false, defaultState }
        : { profile, origin: 'local', readOnly: false }
    })
  return [...central, ...local]
}

export type ResetDefaultAgentProfileResult =
  | { ok: true; backupId?: string }
  | { ok: false; reason: 'unknown_default' | 'shadowed_by_central' }
