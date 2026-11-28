import type { AgentProfileLaunchError } from './claude-profile-startup-args'

export const AGENT_PROFILE_REFUSAL_MESSAGES: Record<AgentProfileLaunchError['code'], string> = {
  agent_profile_agent_unsupported: 'Agent profiles only apply to Claude.',
  agent_profile_host_unsupported:
    'Agent profiles only start on this computer, not on a remote host, WSL or the web client.',
  agent_profile_unknown: 'The agent profile no longer exists.',
  agent_profile_account_unsupported: 'Agent profiles with a Claude account cannot start yet.',
  agent_profile_id_invalid: 'The agent profile id is invalid.',
  agent_profile_preflight_failed: 'The agent profile failed its preflight check.'
}

/** The words a person reads for a refused profile start; a preflight carries its own findings. */
export function agentProfileRefusalMessage(error: AgentProfileLaunchError): string {
  return error.findings.length ? error.message : AGENT_PROFILE_REFUSAL_MESSAGES[error.code]
}
