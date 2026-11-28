import type { EnvironmentDoctorFixOutcome } from '../../shared/workspace-setup/environment-doctor/environment-doctor-types'
import { isAllowedWorkstationFix } from '../../shared/workspace-setup/environment-doctor/workstation-requirements'
import { runSafely, withOutputTail, type EnvironmentDoctorDeps } from './environment-doctor-check'
import { checkWorkstation } from './environment-doctor-workstation'

const FIX_TIMEOUT_MS = 10 * 60_000

export type WorkstationFixOutcome = EnvironmentDoctorFixOutcome

/** Runs the repair for one check id, re-validated against the allowlist right before spawning. */
export async function runWorkstationFix(
  checkId: string,
  deps: EnvironmentDoctorDeps,
  cwd: string
): Promise<WorkstationFixOutcome> {
  await deps.prepare()
  const checks = await checkWorkstation(deps, cwd)
  const target = checks.find((entry) => entry.id === checkId)
  if (!target) {
    return { ok: false, message: `No workstation check named ${checkId}.` }
  }
  const fix = target.fixCommand
  if (!fix || !isAllowedWorkstationFix(fix)) {
    return { ok: false, message: `${checkId} has no safe fix; run the shown command yourself.` }
  }
  const [program, ...args] = fix
  const result = await runSafely(deps, program, args, { cwd, timeoutMs: FIX_TIMEOUT_MS })
  const command = fix.join(' ')
  if (result.code === 0) {
    return { ok: true, message: `Ran ${command}.` }
  }
  return {
    ok: false,
    message: withOutputTail(
      result.timedOut ? `${command} timed out.` : `${command} exited ${result.code}.`,
      result
    )
  }
}
