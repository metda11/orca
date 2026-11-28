import type { TuiAgent } from '../agent-launch/catalog/tui-agent'
import {
  quoteStartupArg,
  type AgentStartupShell
} from '../agent-launch/startup/tui-agent-startup-shell'
import type { ClaudeAgentProfile } from './agent-profile-types'
import { claudeProfileLaunchFiles } from './claude-profile-files'
import { buildClaudeProfileLaunch } from './claude-profile-launch-args'
import {
  formatAgentProfilePreflight,
  type AgentProfilePreflightFinding
} from './agent-profile-preflight'

// Flags and plain values stay readable (and visible to model detection); anything else is quoted.
const PLAIN_ARG = /^[A-Za-z0-9_./:=@+,-]+$/

export type AgentProfileLaunchRequest = {
  id: string
  /** Orca's userData folder on the machine that runs the agent. */
  rootDir: string
  /**
   * The profile main resolved for this start. Set when it may not live in `settings.agentProfiles`
   * (a central, read-only profile); the plan then does not look the id up again.
   */
  profile?: ClaudeAgentProfile
}

/** Refusal codes; hosts show them instead of starting a profile-less agent. */
export type AgentProfileRefusal =
  | 'agent_profile_agent_unsupported'
  | 'agent_profile_host_unsupported'
  | 'agent_profile_unknown'
  | 'agent_profile_account_unsupported'

export class AgentProfileLaunchError extends Error {
  constructor(
    readonly code:
      | AgentProfileRefusal
      | 'agent_profile_id_invalid'
      | 'agent_profile_preflight_failed',
    /** Set with `agent_profile_preflight_failed`: what the preflight found wrong with the profile. */
    readonly findings: readonly AgentProfilePreflightFinding[] = []
  ) {
    super(findings.length ? formatAgentProfilePreflight(findings) : code)
  }
}

export function findClaudeAgentProfile(
  profiles: readonly ClaudeAgentProfile[] | undefined,
  profileId: string
): ClaudeAgentProfile {
  const profile = profiles?.find((entry) => entry.id === profileId)
  if (!profile) {
    throw new AgentProfileLaunchError('agent_profile_unknown')
  }
  return profile
}

/** Quoted profile argv for a startup plan; the files it names are written by main before the PTY spawns. */
export function resolveClaudeProfileStartupArgs(args: {
  agent: TuiAgent
  profiles: readonly ClaudeAgentProfile[] | undefined
  request: AgentProfileLaunchRequest
  shell: AgentStartupShell
  isRemote: boolean
}): string {
  if (args.agent !== 'claude') {
    throw new AgentProfileLaunchError('agent_profile_agent_unsupported')
  }
  // Why: the profile files live in this machine's userData, which a remote or WSL agent cannot read.
  if (args.isRemote) {
    throw new AgentProfileLaunchError('agent_profile_host_unsupported')
  }
  const profile =
    args.request.profile?.id === args.request.id
      ? args.request.profile
      : findClaudeAgentProfile(args.profiles, args.request.id)
  const files = claudeProfileLaunchFiles(args.request.rootDir, profile.id)
  // The argv does not depend on installed plugins; only the settings file content does.
  const { argv } = buildClaudeProfileLaunch(profile, { installedPluginIds: [], files })
  return argv.map((arg) => (PLAIN_ARG.test(arg) ? arg : quoteStartupArg(arg, args.shell))).join(' ')
}
