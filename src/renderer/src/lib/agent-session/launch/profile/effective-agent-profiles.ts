import type { ClaudeAgentProfile } from '../../../../../../shared/agent-profile/agent-profile-types'

let effectiveProfiles: ClaudeAgentProfile[] | null = null

/** Planning is synchronous, so central and default profiles are fetched ahead of time. */
export async function refreshEffectiveAgentProfiles(): Promise<void> {
  try {
    const catalog = await window.api.app.getAgentProfileCatalog()
    effectiveProfiles = catalog.entries.map((entry) => entry.profile)
  } catch {
    // Keep the last good list; main re-resolves the profile at spawn time anyway.
  }
}

/** The list a start can name: central profiles included. Falls back to settings before the first fetch. */
export function readEffectiveAgentProfiles(
  settingsProfiles: ClaudeAgentProfile[] | undefined
): ClaudeAgentProfile[] | undefined {
  return effectiveProfiles ?? settingsProfiles
}

/** Settings as the startup planner should see them for a profile start. */
export function withEffectiveAgentProfiles<T extends { agentProfiles?: ClaudeAgentProfile[] }>(
  settings: T
): T {
  return { ...settings, agentProfiles: readEffectiveAgentProfiles(settings.agentProfiles) }
}
