import type { GlobalSettings } from '../../../shared/settings/global-settings-types'
import { isSafeAgentProfileId } from '../../../shared/agent-profile/claude-profile-files'
import { claudeAgentFromArgs } from '../../../shared/agent-profile/agent-profile-preflight'
import { findClaudeAgentProfile } from '../../../shared/agent-profile/claude-profile-startup-args'
import type { AgentProfilePreflightFinding } from '../../../shared/agent-profile/agent-profile-preflight'
import { runClaudeProfilePreflight } from './agent-profile-preflight'

/** The picker's question: what would stop this profile from starting here? Input comes from the renderer, so it is checked. */
export async function answerAgentProfilePreflight(
  request: unknown,
  settings: Pick<GlobalSettings, 'agentProfiles'> | undefined
): Promise<AgentProfilePreflightFinding[]> {
  if (!request || typeof request !== 'object' || !('profileId' in request)) {
    return []
  }
  const { profileId } = request
  const cwd = 'cwd' in request ? request.cwd : undefined
  const agentArgs = 'agentArgs' in request ? request.agentArgs : undefined
  if (typeof profileId !== 'string' || !isSafeAgentProfileId(profileId)) {
    return []
  }
  const profile = findClaudeAgentProfile(settings?.agentProfiles, profileId)
  const agentName = claudeAgentFromArgs(typeof agentArgs === 'string' ? agentArgs : undefined)
  return runClaudeProfilePreflight({
    profile,
    cwd: typeof cwd === 'string' && cwd ? cwd : null,
    ...(agentName ? { agentName } : {})
  })
}
