import { toast } from 'sonner'
import { isWebRuntimeSessionActive } from '@/runtime/web-session-tabs-sync/identity/web-runtime-session-environment'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { worktreeUsesWslPath } from '@/store/terminals/tabs/creation/terminal-workspace-routing'
import type { AppState } from '@/store/types'
import type { AgentProfileLaunchRequest } from '../../../../../../shared/agent-profile/claude-profile-startup-args'
import { resolveAgentProfileLaunchRequest } from '@/lib/agent-session/launch/profile/agent-profile-launch-request'
import type { LaunchAgentInNewTabArgs } from './launch-agent-in-new-tab-args'
import type { AgentTabLaunchOutcome } from './launch-agent-in-new-tab-host-agents'
import { refuseAgentTabLaunch } from './launch-agent-tab-refusal'

const CHAT_MESSAGE = 'Agent profiles only start in a terminal.'
const PROMPT_WAIT_MESSAGE = 'Agent profiles cannot start with a prompt that waits for the agent.'

export type NewTabAgentProfilePlan =
  | { request: AgentProfileLaunchRequest | undefined }
  | { refused: AgentTabLaunchOutcome }

/** Starts that cannot carry a profile refuse it rather than start without it. */
export function refuseAgentProfileStart(
  args: LaunchAgentInNewTabArgs,
  message: string,
  notifyFailure: boolean
): AgentTabLaunchOutcome {
  return refuseAgentTabLaunch(args, message, () => toast.error(message), notifyFailure)
}

export function refuseAgentProfileInChat(
  args: LaunchAgentInNewTabArgs,
  notifyFailure: boolean
): AgentTabLaunchOutcome {
  return refuseAgentProfileStart(args, CHAT_MESSAGE, notifyFailure)
}

/** Resolve the request a terminal tab start applies, or the refusal that replaces a start without it. */
export function planNewTabAgentProfile(
  args: LaunchAgentInNewTabArgs,
  context: { store: AppState; isRemote: boolean; notifyFailure: boolean }
): NewTabAgentProfilePlan {
  const { store, isRemote, notifyFailure } = context
  if (!args.agentProfileId) {
    return { request: undefined }
  }
  // Why: a prompt that waits for the agent starts through the host route, which does not carry a profile.
  if (args.prompt?.trim() && args.promptDelivery === 'submit-after-ready') {
    return { refused: refuseAgentProfileStart(args, PROMPT_WAIT_MESSAGE, notifyFailure) }
  }
  const resolved = resolveAgentProfileLaunchRequest({
    agent: args.agent,
    profileId: args.agentProfileId,
    profiles: store.settings?.agentProfiles,
    hostIsLocal:
      !isRemote &&
      !worktreeUsesWslPath(store, args.worktreeId) &&
      !isWebRuntimeSessionActive(runtimeEnvironmentIdOrLocalUnlessTwin(store, args.worktreeId))
  })
  return resolved.ok
    ? { request: resolved.request }
    : { refused: refuseAgentProfileStart(args, resolved.message, notifyFailure) }
}
