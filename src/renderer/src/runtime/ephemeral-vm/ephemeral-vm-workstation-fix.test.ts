import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runVmWorkstationFix } from './ephemeral-vm-workstation-fix'

const { callRuntimeRpc, supports } = vi.hoisted(() => ({
  callRuntimeRpc: vi.fn(),
  supports: vi.fn()
}))

vi.mock('@/runtime/rpc/calls/runtime-rpc-call', () => ({ callRuntimeRpc }))
vi.mock('@/runtime/rpc/compatibility/runtime-capability-proof', () => ({
  runtimeEnvironmentSupportsCapability: supports
}))

describe('runVmWorkstationFix', () => {
  beforeEach(() => {
    callRuntimeRpc.mockReset()
    supports.mockReset()
  })

  it('sends only the path and check id to the VM server', async () => {
    supports.mockResolvedValue(true)
    callRuntimeRpc.mockResolvedValue({ ok: true, message: 'Ran npm install -g uv.' })
    const outcome = await runVmWorkstationFix('env-1', '/work', 'workstation.uv')
    expect(outcome).toEqual({ ok: true, message: 'Ran npm install -g uv.' })
    expect(callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'env-1' },
      'environment.doctor.fix',
      { path: '/work', checkId: 'workstation.uv' },
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    )
  })

  it('does not call an older server that lacks the fix method', async () => {
    supports.mockResolvedValue(false)
    const outcome = await runVmWorkstationFix('env-1', '/work', 'workstation.uv')
    expect(outcome.ok).toBe(false)
    expect(callRuntimeRpc).not.toHaveBeenCalled()
  })

  it('reports a failed call as a failed outcome instead of throwing', async () => {
    supports.mockResolvedValue(true)
    callRuntimeRpc.mockRejectedValue(new Error('socket closed'))
    const outcome = await runVmWorkstationFix('env-1', '/work', 'workstation.uv')
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('socket closed')
  })
})
