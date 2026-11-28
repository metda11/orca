import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { runtimeEnvironmentSupportsCapability } from '@/runtime/rpc/compatibility/runtime-capability-proof'
import type { EnvironmentDoctorFixOutcome } from '../../../../shared/workspace-setup/environment-doctor/environment-doctor-types'
import {
  ENVIRONMENT_DOCTOR_FIX_METHOD,
  ENVIRONMENT_DOCTOR_FIX_RUNTIME_CAPABILITY
} from '../../../../shared/workspace-setup/environment-doctor/environment-doctor-runtime'

// Matches the host's own 10 minute repair timeout, plus headroom for the PATH refresh and re-check.
const FIX_CALL_TIMEOUT_MS = 11 * 60_000

/**
 * Ask the VM's server to run one workstation repair. Only the check id travels: the host looks the
 * command up in its own requirements list, so the client can never supply a command to run.
 */
export async function runVmWorkstationFix(
  environmentId: string,
  path: string,
  checkId: string
): Promise<EnvironmentDoctorFixOutcome> {
  try {
    if (
      !(await runtimeEnvironmentSupportsCapability(
        environmentId,
        ENVIRONMENT_DOCTOR_FIX_RUNTIME_CAPABILITY
      ))
    ) {
      return {
        ok: false,
        message: translate(
          'auto.lib.ephemeralVmWorkstationFix.unsupported',
          'This VM’s server is too old to run fixes. Run the shown command yourself.'
        )
      }
    }
    return await callRuntimeRpc<EnvironmentDoctorFixOutcome>(
      { kind: 'environment', environmentId },
      ENVIRONMENT_DOCTOR_FIX_METHOD,
      { path, checkId },
      { timeoutMs: FIX_CALL_TIMEOUT_MS }
    )
  } catch (error) {
    return {
      ok: false,
      message: translate(
        'auto.lib.ephemeralVmWorkstationFix.failed',
        'The fix could not finish: {{error}}',
        { error: error instanceof Error ? error.message : String(error) }
      )
    }
  }
}
