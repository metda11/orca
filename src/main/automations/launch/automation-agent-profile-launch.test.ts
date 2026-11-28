import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AutomationRunLaunchError } from './automation-launch'
import { prepareAutomationAgentProfile } from './automation-agent-profile-launch'

vi.mock('../../claude/configuration/claude-sideload-policy', () => ({
  readClaudeSideloadDisabled: () => Promise.resolve(false)
}))

let root: string | null = null
afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true })
    root = null
  }
})

const settings = {
  agentProfiles: [
    { id: 'worker', name: 'Worker', mcpServers: { s: { command: 'x' } } },
    { id: 'acc', name: 'Account', accountId: 'acct' }
  ]
}
const localRepo = { path: '/work/repo', connectionId: null, executionHostId: undefined }

describe('prepareAutomationAgentProfile', () => {
  it('writes the profile files and names them for the startup plan', async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-automation-profile-'))
    const request = await prepareAutomationAgentProfile({
      automation: { agentId: 'claude', agentProfileId: 'worker' },
      repo: localRepo,
      cwd: '/work/repo',
      settings,
      userDataDir: root
    })
    expect(request).toEqual({ id: 'worker', rootDir: root })
    const mcp = await readFile(join(root, 'agent-profiles', 'worker', 'mcp.json'), 'utf8')
    expect(JSON.parse(mcp)).toEqual({ mcpServers: { s: { command: 'x' } } })
  })

  it('starts nothing special without a saved profile', async () => {
    await expect(
      prepareAutomationAgentProfile({
        automation: { agentId: 'claude' },
        repo: localRepo,
        cwd: '/work/repo',
        settings,
        userDataDir: '/nowhere'
      })
    ).resolves.toBeUndefined()
  })

  it.each([
    [
      'another agent',
      { agentId: 'codex' as const, agentProfileId: 'worker' },
      localRepo,
      '/work/repo',
      'only apply to Claude'
    ],
    [
      'a remote repo',
      { agentId: 'claude' as const, agentProfileId: 'worker' },
      { ...localRepo, connectionId: 'ssh-1' },
      '/work/repo',
      'not on a remote host'
    ],
    [
      'a WSL folder',
      { agentId: 'claude' as const, agentProfileId: 'worker' },
      localRepo,
      '\\\\wsl$\\Ubuntu\\home\\me\\repo',
      'not on a remote host'
    ],
    [
      'a profile with a Claude account',
      { agentId: 'claude' as const, agentProfileId: 'acc' },
      localRepo,
      '/work/repo',
      'Claude account'
    ],
    [
      'a profile that is gone',
      { agentId: 'claude' as const, agentProfileId: 'missing' },
      localRepo,
      '/work/repo',
      'no longer exists'
    ]
  ])('refuses the run, with the reason, for %s', async (_name, automation, repo, cwd, reason) => {
    const refusal = await prepareAutomationAgentProfile({
      automation,
      repo,
      cwd,
      settings,
      userDataDir: '/nowhere'
    }).then(
      () => null,
      (error: unknown) => error
    )
    expect(refusal).toBeInstanceOf(AutomationRunLaunchError)
    expect(refusal).toHaveProperty('message', expect.stringContaining('Agent profile not applied'))
    expect(refusal).toHaveProperty('message', expect.stringContaining(reason))
  })
})
