import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ENVIRONMENT_DOCTOR_FIX_METHOD } from '../../../../../shared/workspace-setup/environment-doctor/environment-doctor-runtime'
import { EnvironmentDoctorFixParams } from '../../../../../shared/rpc-contract/host-management/environment-doctor-params'
import type { RpcContext } from '../../core'
import { ENVIRONMENT_DOCTOR_METHODS } from './environment-doctor'

const { runWorkstationFix } = vi.hoisted(() => ({ runWorkstationFix: vi.fn() }))

vi.mock('../../../../environment-doctor/environment-doctor-workstation-fix', () => ({
  runWorkstationFix
}))
vi.mock('../../../../environment-doctor/environment-doctor-host', () => ({
  createHostEnvironmentDoctorDeps: () => ({ marker: 'host-deps' })
}))

const fixMethod = ENVIRONMENT_DOCTOR_METHODS.find(
  (method) => method.name === ENVIRONMENT_DOCTOR_FIX_METHOD
)

describe('environment.doctor.fix', () => {
  beforeEach(() => {
    runWorkstationFix.mockReset()
  })

  it('hands only the check id and path to the host-side fix', async () => {
    runWorkstationFix.mockResolvedValue({ ok: true, message: 'Ran npm install -g uv.' })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the method reads no context members.
    const context = {} as unknown as RpcContext
    const result = await fixMethod?.handler({ path: '/work', checkId: 'workstation.uv' }, context)
    expect(result).toEqual({ ok: true, message: 'Ran npm install -g uv.' })
    expect(runWorkstationFix).toHaveBeenCalledWith(
      'workstation.uv',
      { marker: 'host-deps' },
      '/work'
    )
  })

  it('drops any command a client sends along and requires a check id', () => {
    const parsed = EnvironmentDoctorFixParams.parse({
      path: '/work',
      checkId: 'workstation.uv',
      command: ['sh', '-c', 'echo pwned'],
      fixCommand: ['sh']
    })
    expect(parsed).toEqual({ path: '/work', checkId: 'workstation.uv' })
    expect(EnvironmentDoctorFixParams.safeParse({ path: '/work' }).success).toBe(false)
  })
})
