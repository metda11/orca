import {
  ENVIRONMENT_DOCTOR_FIX_METHOD,
  ENVIRONMENT_DOCTOR_METHOD
} from '../../../../../shared/workspace-setup/environment-doctor/environment-doctor-runtime'
import {
  EnvironmentDoctorFixParams,
  EnvironmentDoctorParams
} from '../../../../../shared/rpc-contract/host-management/environment-doctor-params'
import { runEnvironmentDoctor } from '../../../../environment-doctor/environment-doctor'
import { createHostEnvironmentDoctorDeps } from '../../../../environment-doctor/environment-doctor-host'
import { runWorkstationFix } from '../../../../environment-doctor/environment-doctor-workstation-fix'
import { defineMethod } from '../../core'

const hostDeps = (): ReturnType<typeof createHostEnvironmentDoctorDeps> =>
  createHostEnvironmentDoctorDeps({ refreshShellPath: true })

export const ENVIRONMENT_DOCTOR_METHODS = [
  // A desktop creating a workspace on a VM asks the VM's own server, so the checks see its tools.
  defineMethod({
    name: ENVIRONMENT_DOCTOR_METHOD,
    permission: 'workspace',
    params: EnvironmentDoctorParams,
    handler: async ({ path }) => runEnvironmentDoctor({ worktreePath: path }, hostDeps())
  }),
  // Never takes a command from the client: the check id is looked up in the host's own list and
  // runWorkstationFix re-validates the resulting argv against the allowlist before spawning.
  defineMethod({
    name: ENVIRONMENT_DOCTOR_FIX_METHOD,
    permission: 'workspace',
    params: EnvironmentDoctorFixParams,
    handler: async ({ path, checkId }) => runWorkstationFix(checkId, hostDeps(), path)
  })
]
