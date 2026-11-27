import {
  agentProfilePreflightErrors,
  formatAgentProfilePreflight,
  type AgentProfilePreflightFinding
} from '../../../../../../shared/agent-profile/agent-profile-preflight'

export type AgentProfileStartCheck = {
  /** False when an error finding would block the start. */
  canStart: boolean
  /** The blocking findings, worded for the picker; empty when the start can go ahead. */
  blockMessage: string
  /** Findings that let the start go ahead but are worth showing. */
  warnings: AgentProfilePreflightFinding[]
}

/** Ask main what is wrong with a profile before the picker offers to start it. */
export async function checkAgentProfileForStart(args: {
  profileId: string
  cwd?: string
  agentArgs?: string
}): Promise<AgentProfileStartCheck> {
  let findings: AgentProfilePreflightFinding[]
  try {
    findings = await window.api.app.preflightAgentProfile(args)
  } catch {
    // Why: main's spawn-time preflight still blocks a broken profile, so an unreachable check must not strand the picker.
    return { canStart: true, blockMessage: '', warnings: [] }
  }
  const errors = agentProfilePreflightErrors(findings)
  return {
    canStart: errors.length === 0,
    blockMessage: formatAgentProfilePreflight(errors),
    warnings: findings.filter((finding) => finding.severity === 'warning')
  }
}
