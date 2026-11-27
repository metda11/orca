import { describe, expect, it } from 'vitest'
import { resolveAgentStartupPlanInputs } from '../agent-launch/startup/agent-startup-plan-inputs'
import { resolveClaudeProfileStartupArgs } from './claude-profile-startup-args'
import type { ClaudeAgentProfile } from './agent-profile-types'

const profile: ClaudeAgentProfile = {
  id: 'p1',
  name: 'Review',
  enabledPlugins: ['a@m'],
  mcpServers: { s: { command: 'x' } },
  model: 'opus'
}

describe('resolveClaudeProfileStartupArgs', () => {
  it('quotes the profile file paths for the shell that runs the agent', () => {
    const request = { id: 'p1', rootDir: 'C:\\Users\\a b\\Orca' }
    const args = (shell: 'posix' | 'powershell') =>
      resolveClaudeProfileStartupArgs({
        agent: 'claude',
        profiles: [profile],
        request,
        shell,
        isRemote: false
      })
    expect(args('powershell')).toContain(
      "'C:\\Users\\a b\\Orca\\agent-profiles\\p1\\settings.json'"
    )
    expect(args('posix')).toContain('--model opus')
  })

  it('refuses hosts and agents that cannot read the profile files', () => {
    const base = {
      profiles: [profile],
      request: { id: 'p1', rootDir: '/d' },
      shell: 'posix' as const
    }
    expect(() =>
      resolveClaudeProfileStartupArgs({ ...base, agent: 'claude', isRemote: true })
    ).toThrow('agent_profile_host_unsupported')
    expect(() =>
      resolveClaudeProfileStartupArgs({ ...base, agent: 'codex', isRemote: false })
    ).toThrow('agent_profile_agent_unsupported')
    expect(() =>
      resolveClaudeProfileStartupArgs({
        ...base,
        request: { id: 'gone', rootDir: '/d' },
        agent: 'claude',
        isRemote: false
      })
    ).toThrow('agent_profile_unknown')
  })
})

describe('resolveAgentStartupPlanInputs with a profile', () => {
  it('puts profile flags before the launch args so explicit picks still win', () => {
    const inputs = resolveAgentStartupPlanInputs({
      agent: 'claude',
      settings: { agentProfiles: [profile] },
      platform: 'linux',
      isRemote: false,
      shell: 'posix',
      agentArgs: '--model sonnet',
      agentProfile: { id: 'p1', rootDir: '/data' }
    })
    expect(inputs.agentArgs).toBe(
      '--settings /data/agent-profiles/p1/settings.json --mcp-config /data/agent-profiles/p1/mcp.json --strict-mcp-config --model opus --model sonnet'
    )
  })
})
