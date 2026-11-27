import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkAgentProfileForStart } from './agent-profile-preflight-check'

function stubPreflight(result: () => Promise<unknown>): void {
  vi.stubGlobal('window', { api: { app: { preflightAgentProfile: result } } })
}

afterEach(() => vi.unstubAllGlobals())

describe('checkAgentProfileForStart', () => {
  it('blocks the start on an error finding and keeps warnings apart', async () => {
    stubPreflight(async () => [
      {
        code: 'plugin_missing',
        severity: 'error',
        subject: 'a@m',
        message: 'Plugin a@m is not installed here.'
      },
      { code: 'mcp_env_unset', severity: 'warning', subject: 'TOKEN', message: 'w' }
    ])
    const check = await checkAgentProfileForStart({ profileId: 'p1' })
    expect(check.canStart).toBe(false)
    expect(check.blockMessage).toBe('Plugin a@m is not installed here.')
    expect(check.warnings.map((finding) => finding.subject)).toEqual(['TOKEN'])
  })

  it('does not strand the picker when the check cannot be reached', async () => {
    stubPreflight(() => Promise.reject(new Error('ipc closed')))
    expect(await checkAgentProfileForStart({ profileId: 'p1' })).toMatchObject({ canStart: true })
  })
})
