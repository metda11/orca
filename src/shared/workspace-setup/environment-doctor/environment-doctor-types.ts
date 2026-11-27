import type {
  EphemeralVmRecipeDoctorCheck,
  EphemeralVmRecipeDoctorCheckStatus
} from '../../remote-runtime/ephemeral-vm-recipes/ephemeral-vm-recipes'

/** `skip` = could not be verified here (not the same as missing); `info` never affects `ok`. */
export type EnvironmentDoctorCheckStatus = EphemeralVmRecipeDoctorCheckStatus | 'info' | 'skip'

export type EnvironmentDoctorCategory =
  | 'workspace'
  | 'tools'
  | 'agents'
  | 'git'
  | 'setup'
  | 'disk'
  | 'workstation'

export type EnvironmentDoctorCheck = Omit<EphemeralVmRecipeDoctorCheck, 'status'> & {
  category: EnvironmentDoctorCategory
  status: EnvironmentDoctorCheckStatus
  /** argv of a safe, idempotent repair that an explicit fix action may run; display only otherwise. */
  fixCommand?: string[]
}

export type EnvironmentDoctorResult = {
  worktreePath: string
  /** False when any check failed; warnings keep it true, so read `checks` for a clean bill. */
  ok: boolean
  checks: EnvironmentDoctorCheck[]
}

/** One line per check plus indented remediation; shared by the CLI and the agent prompt. */
export function formatEnvironmentDoctorChecks(checks: readonly EnvironmentDoctorCheck[]): string[] {
  return checks.flatMap((check) => [
    `${check.status.toUpperCase().padEnd(4)} ${check.id}: ${check.message}`,
    ...(check.remediation ? check.remediation.split('\n').map((line) => `     ${line}`) : [])
  ])
}
