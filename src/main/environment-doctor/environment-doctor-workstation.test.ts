import { describe, expect, it, vi } from 'vitest'
import type { EnvironmentDoctorDeps } from './environment-doctor-check'
import { checkWorkstation, countForeignHookCommands } from './environment-doctor-workstation'
import { runWorkstationFix } from './environment-doctor-workstation-fix'

function makeDeps(
  requirements: unknown,
  overrides: Partial<EnvironmentDoctorDeps> = {}
): EnvironmentDoctorDeps {
  return {
    platform: 'linux',
    prepare: async () => {},
    run: vi.fn(async () => ({ code: 0, stdout: '', stderr: '', timedOut: false })),
    findCommands: async (commands) => new Set(commands.filter((command) => command !== 'uv')),
    detectAgents: async () => [],
    readFile: async () => null,
    exists: async () => false,
    isDirectory: async () => true,
    freeBytes: async () => null,
    readWorkstationRequirements: async () => JSON.stringify(requirements),
    pathEntries: () => ['/usr/bin'],
    homeDir: '/home/dev',
    runSetupScript: async () => ({ code: 0, stdout: '', stderr: '', timedOut: false }),
    ...overrides
  }
}

describe('checkWorkstation', () => {
  it('reports ok, missing and not verifiable per entry', async () => {
    const run = vi.fn(async (_program: string, args: readonly string[]) =>
      args[0] === 'plugin' && args[1] === 'list'
        ? { code: 1, stdout: '', stderr: 'boom', timedOut: false }
        : { code: 0, stdout: 'v22.1.0', stderr: '', timedOut: false }
    )
    const checks = await checkWorkstation(
      makeDeps(
        {
          requirements: [
            { id: 'node', kind: 'command', command: 'node', minVersion: '20' },
            { id: 'uv', kind: 'command', command: 'uv', fix: ['npm', 'install', '-g', 'uv'] },
            { id: 'plugin', kind: 'claude-plugin', name: 'inno-core' }
          ]
        },
        { run }
      ),
      '/work'
    )
    const byId = Object.fromEntries(checks.map((entry) => [entry.id, entry]))
    expect(byId['workstation.node'].status).toBe('pass')
    expect(byId['workstation.uv'].status).toBe('fail')
    expect(byId['workstation.uv'].fixCommand).toEqual(['npm', 'install', '-g', 'uv'])
    expect(byId['workstation.plugin'].status).toBe('skip')
  })

  it('shows a fix outside the allowlist but never offers it as runnable', async () => {
    const checks = await checkWorkstation(
      makeDeps({
        requirements: [
          { id: 'uv', kind: 'command', command: 'uv', fix: ['powershell', '-c', 'irm x | iex'] }
        ]
      }),
      '/work'
    )
    expect(checks[0].fixCommand).toBeUndefined()
    expect(checks[0].remediation).toContain('irm x | iex')
  })

  it('does not add a group without a target list', async () => {
    const deps = makeDeps({}, { readWorkstationRequirements: async () => null })
    expect(await checkWorkstation(deps, '/work')).toEqual([])
  })
})

describe('runWorkstationFix', () => {
  it('runs only the allowlisted command of the named check', async () => {
    const run = vi.fn(async () => ({ code: 0, stdout: '', stderr: '', timedOut: false }))
    const deps = makeDeps(
      {
        requirements: [
          { id: 'uv', kind: 'command', command: 'uv', fix: ['npm', 'install', '-g', 'uv'] },
          { id: 'bad', kind: 'command', command: 'gone', fix: ['sh', '-c', 'echo hi'] }
        ]
      },
      { run, findCommands: async () => new Set() }
    )
    expect((await runWorkstationFix('workstation.bad', deps, '/work')).ok).toBe(false)
    expect((await runWorkstationFix('workstation.nope', deps, '/work')).ok).toBe(false)
    expect(run).not.toHaveBeenCalled()
    expect((await runWorkstationFix('workstation.uv', deps, '/work')).ok).toBe(true)
    expect(run).toHaveBeenCalledWith('npm', ['install', '-g', 'uv'], expect.anything())
  })
})

describe('countForeignHookCommands', () => {
  it('counts hook commands that are not Orca-managed and tolerates odd shapes', () => {
    const settings = JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: '*', hooks: [{ type: 'command', command: 'node ~/guard.js' }] },
          { hooks: [{ type: 'command', command: '/home/dev/.orca/agent-hooks/claude-hook.sh' }] },
          'junk'
        ],
        Stop: { not: 'an array' }
      }
    })
    expect(countForeignHookCommands(settings)).toEqual(['node ~/guard.js'])
    expect(countForeignHookCommands('{}')).toEqual([])
    expect(countForeignHookCommands('not json')).toBeNull()
  })
})
