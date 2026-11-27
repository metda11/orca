import type { TuiAgent } from '../../../../../../shared/agent-launch/catalog/tui-agent'
import {
  AgentProfileLaunchError,
  findClaudeAgentProfile,
  type AgentProfileLaunchRequest,
  type AgentProfileRefusal
} from '../../../../../../shared/agent-profile/claude-profile-startup-args'
import { isSafeAgentProfileId } from '../../../../../../shared/agent-profile/claude-profile-files'
import type { ClaudeAgentProfile } from '../../../../../../shared/agent-profile/agent-profile-types'
import { readAgentProfileRoot } from './agent-profile-root'

const REFUSAL_MESSAGES: Record<AgentProfileRefusal | 'agent_profile_id_invalid', string> = {
  agent_profile_agent_unsupported: 'Agent profiles only apply to Claude.',
  agent_profile_host_unsupported:
    'Agent profiles only start on this computer, not on a remote host, WSL or the web client.',
  agent_profile_unknown: 'The agent profile no longer exists.',
  agent_profile_account_unsupported: 'Agent profiles with a Claude account cannot start yet.',
  agent_profile_id_invalid: 'The agent profile id is invalid.'
}

export type AgentProfileLaunchResolution =
  | { ok: true; request: AgentProfileLaunchRequest }
  | { ok: false; message: string }

/** Decide before a tab opens whether a profile start can be honoured; a refusal beats a start without it. */
export function resolveAgentProfileLaunchRequest(args: {
  agent: TuiAgent
  profileId: string
  profiles: readonly ClaudeAgentProfile[] | undefined
  /** Remote, WSL or web-hosted: anywhere main's userData is not what the agent reads. */
  hostIsLocal: boolean
}): AgentProfileLaunchResolution {
  const refuse = (code: keyof typeof REFUSAL_MESSAGES): AgentProfileLaunchResolution => ({
    ok: false,
    message: REFUSAL_MESSAGES[code]
  })
  if (args.agent !== 'claude') {
    return refuse('agent_profile_agent_unsupported')
  }
  const rootDir = readAgentProfileRoot()
  if (!args.hostIsLocal || !rootDir) {
    return refuse('agent_profile_host_unsupported')
  }
  if (!isSafeAgentProfileId(args.profileId)) {
    return refuse('agent_profile_id_invalid')
  }
  try {
    if (findClaudeAgentProfile(args.profiles, args.profileId).accountId) {
      return refuse('agent_profile_account_unsupported')
    }
  } catch (error) {
    return refuse(error instanceof AgentProfileLaunchError ? error.code : 'agent_profile_unknown')
  }
  return { ok: true, request: { id: args.profileId, rootDir } }
}
