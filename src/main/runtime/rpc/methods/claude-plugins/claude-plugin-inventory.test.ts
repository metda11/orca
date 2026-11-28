import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseWslUncPath } from '../../../../../shared/file-access/wsl-paths'

const mocks = vi.hoisted(() => ({ assertRunning: vi.fn() }))

// The real gate answers null off Windows; the request logic is the same everywhere.
vi.mock('../../../../wsl/filesystem/wsl-unc-access-gate', () => ({
  wslDistroForPath: (path: string) => parseWslUncPath(path)?.distro ?? null,
  assertWslUncPathRunning: mocks.assertRunning
}))
vi.mock('../../../../claude/plugin-inventory/claude-plugin-inventory', () => ({
  readClaudePluginInventory: vi.fn()
}))
vi.mock('../../../../claude/context-weight/claude-plugin-weight-service', () => ({
  readClaudePluginWeights: vi.fn()
}))

import { claudePluginReadRequest, CLAUDE_PLUGIN_METHODS } from './claude-plugin-inventory'

type Runtime = Parameters<typeof claudePluginReadRequest>[1]

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only resolveRuntimeFileTarget is read, and only for a workspace id.
const runtime = { resolveRuntimeFileTarget: vi.fn() } as unknown as Runtime

describe('claudePluginReadRequest', () => {
  beforeEach(() => {
    mocks.assertRunning.mockReset()
    mocks.assertRunning.mockResolvedValue(undefined)
  })

  it('hands a WSL workspace over as the distro and its Linux paths', async () => {
    const request = await claudePluginReadRequest(
      {
        cwd: '\\\\wsl.localhost\\Ubuntu\\home\\u\\repo',
        accountHomePath: '\\\\wsl.localhost\\Ubuntu\\home\\u\\.claude-work'
      },
      runtime
    )

    expect(request).toEqual({
      wslDistro: 'Ubuntu',
      cwd: '/home/u/repo',
      accountHomePath: '/home/u/.claude-work',
      refresh: false
    })
    expect(mocks.assertRunning).toHaveBeenCalledWith('', 'Ubuntu')
  })

  it('takes the distro from the account folder alone and leaves a missing account default', async () => {
    const fromAccount = await claudePluginReadRequest(
      { accountHomePath: '\\\\wsl.localhost\\Ubuntu\\home\\u\\.claude' },
      runtime
    )
    const fromCwd = await claudePluginReadRequest(
      { cwd: '\\\\wsl.localhost\\Ubuntu\\home\\u\\repo' },
      runtime
    )

    expect(fromAccount).toMatchObject({ wslDistro: 'Ubuntu', cwd: null })
    expect(fromCwd).toMatchObject({ wslDistro: 'Ubuntu', accountHomePath: null })
  })

  it('refuses a WSL workspace read with the Windows account, and the reverse', async () => {
    await expect(
      claudePluginReadRequest(
        {
          cwd: '\\\\wsl.localhost\\Ubuntu\\home\\u\\repo',
          accountHomePath: 'C:\\Users\\u\\.claude'
        },
        runtime
      )
    ).rejects.toThrow(/same WSL distribution/)
    await expect(
      claudePluginReadRequest(
        { cwd: 'C:\\repo', accountHomePath: '\\\\wsl.localhost\\Ubuntu\\home\\u\\.claude' },
        runtime
      )
    ).rejects.toThrow(/same WSL distribution/)
    await expect(
      claudePluginReadRequest(
        {
          cwd: '\\\\wsl.localhost\\Ubuntu\\home\\u\\repo',
          accountHomePath: '\\\\wsl.localhost\\Debian\\home\\u\\.claude'
        },
        runtime
      )
    ).rejects.toThrow(/same WSL distribution/)
  })

  it('does not read a stopped distro', async () => {
    mocks.assertRunning.mockRejectedValue(new Error('distro stopped'))

    await expect(
      claudePluginReadRequest({ cwd: '\\\\wsl.localhost\\Ubuntu\\home\\u\\repo' }, runtime)
    ).rejects.toThrow('distro stopped')
  })

  it('keeps a native workspace native', async () => {
    const request = await claudePluginReadRequest({ cwd: process.cwd() }, runtime)

    expect(request).toMatchObject({ wslDistro: null, cwd: process.cwd() })
    expect(mocks.assertRunning).not.toHaveBeenCalled()
  })

  it('refuses an SSH workspace named by id', async () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the request reads only this one method.
    const ssh = {
      resolveRuntimeFileTarget: vi.fn().mockResolvedValue({
        executionHostId: 'ssh:box',
        worktree: { path: '/srv/repo' }
      })
    } as unknown as Runtime

    await expect(claudePluginReadRequest({ worktreeId: 'w1' }, ssh)).rejects.toThrow(
      'unavailable for SSH hosts'
    )
  })

  it('does not weigh a WSL workspace with the host CLI', async () => {
    const weights = CLAUDE_PLUGIN_METHODS.find((method) => method.name === 'claudePlugins.weights')
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler is called with the two arguments it reads.
    const handler = (weights as unknown as { handler: (...args: unknown[]) => Promise<unknown> })
      .handler

    await expect(
      handler({ cwd: '\\\\wsl.localhost\\Ubuntu\\home\\u\\repo' }, { runtime })
    ).rejects.toThrow('weights are unavailable for WSL')
  })
})
