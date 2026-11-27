import {
  AUTOMATION_AGENT_PROFILE_RUNTIME_CAPABILITY,
  AUTOMATION_EXTRA_AGENT_ARGS_RUNTIME_CAPABILITY,
  AUTOMATION_SETUP_CHOICE_RUNTIME_CAPABILITY
} from '../../shared/automations/automation-runtime-capabilities'
import {
  EXTRA_AGENT_ARGS_HOST_UPDATE_REQUIRED,
  hasExtraAgentArgs
} from '../../shared/agent-launch/startup/automation-extra-agent-args'
import type { RuntimeStatus } from '../../shared/remote-runtime/session-graph/runtime-session-contracts'
import type { RuntimeClient } from '../runtime/client'
import { RuntimeClientError } from '../runtime/connection/types'

const AGENT_PROFILE_HOST_UPDATE_REQUIRED =
  "This host's Orca is too old for --agent-profile on automations. Update Orca on that host, or run the command without --agent-profile."
const SETUP_CHOICE_HOST_UPDATE_REQUIRED =
  "This host's Orca is too old for --setup on automations. Update Orca on that host, or run the command without --setup."

// Older runtimes silently strip these fields and would run without the requested arguments or setup choice.
export async function assertAutomationFieldsSupported(
  client: RuntimeClient,
  fields: {
    extraAgentArgs?: string
    setupDecision?: 'run' | 'skip'
    agentProfileId?: string | null
  }
): Promise<void> {
  const needsExtraAgentArgs = hasExtraAgentArgs(fields.extraAgentArgs)
  // A clear (null) needs the host too: an older one would keep the saved profile.
  const needsAgentProfile = fields.agentProfileId !== undefined
  if (!needsExtraAgentArgs && fields.setupDecision === undefined && !needsAgentProfile) {
    return
  }
  const capabilities = (await client.call<RuntimeStatus>('status.get')).result.capabilities ?? []
  if (
    needsExtraAgentArgs &&
    !capabilities.includes(AUTOMATION_EXTRA_AGENT_ARGS_RUNTIME_CAPABILITY)
  ) {
    throw new RuntimeClientError('incompatible_runtime', EXTRA_AGENT_ARGS_HOST_UPDATE_REQUIRED)
  }
  if (needsAgentProfile && !capabilities.includes(AUTOMATION_AGENT_PROFILE_RUNTIME_CAPABILITY)) {
    throw new RuntimeClientError('incompatible_runtime', AGENT_PROFILE_HOST_UPDATE_REQUIRED)
  }
  if (
    fields.setupDecision !== undefined &&
    !capabilities.includes(AUTOMATION_SETUP_CHOICE_RUNTIME_CAPABILITY)
  ) {
    throw new RuntimeClientError('incompatible_runtime', SETUP_CHOICE_HOST_UPDATE_REQUIRED)
  }
}
