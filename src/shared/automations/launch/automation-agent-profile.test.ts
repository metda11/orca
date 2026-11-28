import { describe, expect, it } from 'vitest'
import { assertAutomationAgentProfile } from './automation-agent-profile'

const base = { agentId: 'claude' as const, agentProfileId: 'worker' }

describe('assertAutomationAgentProfile', () => {
  it('accepts no profile and a Claude terminal automation with a fresh session', () => {
    expect(() => assertAutomationAgentProfile({ agentId: 'codex' })).not.toThrow()
    expect(() => assertAutomationAgentProfile(base)).not.toThrow()
    expect(() => assertAutomationAgentProfile({ ...base, surface: 'terminal' })).not.toThrow()
  })

  it.each([
    ['an id that could leave the profile folder', { ...base, agentProfileId: '../x' }],
    ['another agent', { ...base, agentId: 'codex' as const }],
    ['the chat surface', { ...base, surface: 'chat' as const }],
    ['session reuse', { ...base, reuseSession: true }]
  ])('refuses %s at save time', (_name, automation) => {
    expect(() => assertAutomationAgentProfile(automation)).toThrow()
  })
})
