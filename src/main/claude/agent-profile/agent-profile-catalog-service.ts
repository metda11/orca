import { createHash } from 'node:crypto'
import type { GlobalSettings } from '../../../shared/settings/global-settings-types'
import type { ClaudeAgentProfile } from '../../../shared/agent-profile/agent-profile-types'
import {
  classifyDefaultProfileCopy,
  mergeAgentProfileCatalog,
  type AgentProfileCatalog,
  type ResetDefaultAgentProfileResult,
  type DefaultProfileState
} from '../../../shared/agent-profile/agent-profile-catalog'
import { DEFAULT_AGENT_PROFILES } from '../../../shared/agent-profile/default-agent-profiles'
import { readCentralAgentProfileFolder } from './central-agent-profile-folder'

type SettingsKeys = 'agentProfiles' | 'agentProfileCentralDir' | 'agentProfileDefaultBaselines'

/** The slice of the store this service needs; settings writes are synchronous. */
export type AgentProfileSettingsStore = {
  getSettings: () => Pick<GlobalSettings, SettingsKeys>
  updateSettings: (patch: Partial<Pick<GlobalSettings, SettingsKeys>>) => void
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, v]) => [key, canonicalize(v)])
    )
  }
  return value
}

/** Key-order independent, so a rewritten-but-identical profile still equals its template. */
export function agentProfileDigest(profile: ClaudeAgentProfile): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(profile)))
    .digest('hex')
}

/** Copy each bundled template once. A recorded baseline means "seeded before": a deleted copy stays deleted. */
export function seedDefaultAgentProfiles(
  store: AgentProfileSettingsStore,
  templates: readonly ClaudeAgentProfile[] = DEFAULT_AGENT_PROFILES
): void {
  const settings = store.getSettings()
  const profiles = [...(settings.agentProfiles ?? [])]
  const baselines = { ...settings.agentProfileDefaultBaselines }
  let changed = false
  for (const template of templates) {
    if (baselines[template.id] !== undefined) {
      continue
    }
    // Why: a same-id profile the user made before the template shipped is theirs; never overwrite it.
    if (!profiles.some((profile) => profile.id === template.id)) {
      profiles.push(structuredClone(template))
      baselines[template.id] = agentProfileDigest(template)
      changed = true
    }
  }
  if (changed) {
    store.updateSettings({ agentProfiles: profiles, agentProfileDefaultBaselines: baselines })
  }
}

export async function buildAgentProfileCatalog(
  settings: Pick<GlobalSettings, SettingsKeys>,
  templates: readonly ClaudeAgentProfile[] = DEFAULT_AGENT_PROFILES
): Promise<AgentProfileCatalog> {
  const central = settings.agentProfileCentralDir?.trim()
    ? await readCentralAgentProfileFolder(settings.agentProfileCentralDir.trim())
    : { profiles: [], warnings: [] }
  const local = settings.agentProfiles ?? []
  const defaultStates = new Map<string, DefaultProfileState>()
  for (const template of templates) {
    const copy = local.find((profile) => profile.id === template.id)
    const baseline = settings.agentProfileDefaultBaselines?.[template.id]
    // Without a baseline the profile predates seeding: a plain local profile, not a default copy.
    if (copy && baseline !== undefined) {
      defaultStates.set(
        template.id,
        classifyDefaultProfileCopy({
          copyDigest: agentProfileDigest(copy),
          templateDigest: agentProfileDigest(template),
          baselineDigest: baseline
        })
      )
    }
  }
  return {
    entries: mergeAgentProfileCatalog({ central: central.profiles, local, defaultStates }),
    warnings: central.warnings
  }
}

/** Seed, then build; the single entry point for the picker and for launches. */
export async function loadAgentProfileCatalog(
  store: AgentProfileSettingsStore
): Promise<AgentProfileCatalog> {
  seedDefaultAgentProfiles(store)
  return buildAgentProfileCatalog(store.getSettings())
}

function backupId(id: string, taken: ReadonlySet<string>): string {
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? '-edited' : `-edited-${n}`
    const candidate = `${id.slice(0, 64 - suffix.length)}${suffix}`
    if (!taken.has(candidate)) {
      return candidate
    }
  }
}

/**
 * Put a default profile back to its template. An edited copy is kept as a separate local profile
 * first, so the reset loses nothing; an untouched copy needs no backup.
 */
export async function resetDefaultAgentProfile(
  store: AgentProfileSettingsStore,
  id: string,
  templates: readonly ClaudeAgentProfile[] = DEFAULT_AGENT_PROFILES
): Promise<ResetDefaultAgentProfileResult> {
  const template = templates.find((entry) => entry.id === id)
  if (!template) {
    return { ok: false, reason: 'unknown_default' }
  }
  const settings = store.getSettings()
  const central = settings.agentProfileCentralDir?.trim()
    ? await readCentralAgentProfileFolder(settings.agentProfileCentralDir.trim())
    : { profiles: [] }
  if (central.profiles.some((profile) => profile.id === id)) {
    return { ok: false, reason: 'shadowed_by_central' }
  }
  const profiles = [...(settings.agentProfiles ?? [])]
  const index = profiles.findIndex((profile) => profile.id === id)
  const templateDigest = agentProfileDigest(template)
  let backup: string | undefined
  if (index !== -1 && agentProfileDigest(profiles[index]) !== templateDigest) {
    const baseline = settings.agentProfileDefaultBaselines?.[id]
    const untouched = baseline !== undefined && agentProfileDigest(profiles[index]) === baseline
    if (!untouched) {
      backup = backupId(id, new Set(profiles.map((profile) => profile.id)))
      profiles.push({
        ...profiles[index],
        id: backup,
        name: `${profiles[index].name} (edited)`
      })
    }
  }
  const copy = structuredClone(template)
  if (index !== -1) {
    profiles[index] = copy
  } else {
    profiles.push(copy)
  }
  store.updateSettings({
    agentProfiles: profiles,
    agentProfileDefaultBaselines: {
      ...settings.agentProfileDefaultBaselines,
      [id]: templateDigest
    }
  })
  return backup ? { ok: true, backupId: backup } : { ok: true }
}
