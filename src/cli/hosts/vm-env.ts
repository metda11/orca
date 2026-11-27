import { resolve } from 'node:path'
import type { CommandHandler } from '../dispatch/dispatch'
import {
  formatEnvironmentDoctorChecks,
  type EnvironmentDoctorResult
} from '../../shared/workspace-setup/environment-doctor/environment-doctor-types'
import { runEnvironmentDoctor } from '../../main/environment-doctor/environment-doctor'
import { createHostEnvironmentDoctorDeps } from '../../main/environment-doctor/environment-doctor-host'
import { runWorkstationFix } from '../../main/environment-doctor/environment-doctor-workstation-fix'

export const VM_ENV_HANDLERS: Record<string, CommandHandler> = {
  'vm env doctor': async ({ flags, cwd, json }) => {
    const pathFlag = flags.get('path')
    const worktreePath = resolve(cwd, typeof pathFlag === 'string' && pathFlag ? pathFlag : '.')
    const requirementsFlag = flags.get('requirements')
    const deps = createHostEnvironmentDoctorDeps(
      typeof requirementsFlag === 'string' && requirementsFlag
        ? { workstationRequirementsPath: resolve(cwd, requirementsFlag) }
        : {}
    )
    const fixFlag = flags.get('fix')
    if (typeof fixFlag === 'string' && fixFlag) {
      const outcome = await runWorkstationFix(fixFlag, deps, worktreePath)
      console.log(json ? JSON.stringify(outcome, null, 2) : outcome.message)
      if (!outcome.ok) {
        process.exitCode = 1
      }
      return
    }
    const result = await runEnvironmentDoctor(
      { worktreePath, runSetup: flags.get('run-setup') === true },
      deps
    )
    console.log(json ? JSON.stringify(result, null, 2) : formatEnvironmentDoctorResult(result))
    if (!result.ok) {
      process.exitCode = 1
    }
  }
}

function formatEnvironmentDoctorResult(result: EnvironmentDoctorResult): string {
  const counts = { pass: 0, warn: 0, fail: 0, info: 0, skip: 0 }
  for (const check of result.checks) {
    counts[check.status] += 1
  }
  const lines = [`path: ${result.worktreePath}`, ...formatEnvironmentDoctorChecks(result.checks)]
  lines.push(
    `${counts.pass} passed, ${counts.warn} warnings, ${counts.fail} failed, ${counts.skip} not verifiable`
  )
  return lines.join('\n')
}
