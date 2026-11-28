import { automationCanonicalLaunchSetup } from './automation-canonical-launch-setup'
import type { Automation } from '../automation-definition'
import { isSafeAgentProfileId } from '../../agent-profile/claude-profile-files'
import { AGENT_PROFILE_REFUSAL_MESSAGES } from '../../agent-profile/agent-profile-refusal-copy'

export const AUTOMATION_PROFILE_NEEDS_FRESH_SESSION =
  'An agent profile starts every run fresh, so it cannot combine with session reuse.'
export const AUTOMATION_PROFILE_TERMINAL_ONLY = 'Agent profiles only start in a terminal.'
export const AUTOMATION_PROFILE_NOT_FOR_BOTS =
  'A bot automation cannot start with an agent profile.'

/** A saved profile that no start could honour is refused at save time, not at the first run. */
export function assertAutomationAgentProfile(
  automation: Pick<Automation, 'agentProfileId' | 'agentId' | 'bot' | 'surface' | 'launchSetup'> & {
    reuseSession?: boolean
  }
): void {
  const id = automation.agentProfileId
  if (id === undefined) {
    return
  }
  if (!isSafeAgentProfileId(id)) {
    throw new Error(AGENT_PROFILE_REFUSAL_MESSAGES.agent_profile_id_invalid)
  }
  if (automation.agentId !== 'claude') {
    throw new Error(AGENT_PROFILE_REFUSAL_MESSAGES.agent_profile_agent_unsupported)
  }
  if (automation.bot) {
    throw new Error(AUTOMATION_PROFILE_NOT_FOR_BOTS)
  }
  if (automationCanonicalLaunchSetup(automation).surface === 'chat') {
    throw new Error(AUTOMATION_PROFILE_TERMINAL_ONLY)
  }
  if (automation.reuseSession) {
    throw new Error(AUTOMATION_PROFILE_NEEDS_FRESH_SESSION)
  }
}
