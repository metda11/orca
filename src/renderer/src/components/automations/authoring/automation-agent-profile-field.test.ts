import { describe, expect, it } from 'vitest'
import {
  automationAgentProfileUpdate,
  automationDraftAgentProfileId,
  automationProfileOffered
} from './automation-agent-profile-field'

const base = {
  agentId: 'claude' as const,
  bot: null,
  workspaceMode: 'new_per_run' as const,
  reuseSession: false,
  agentProfileId: 'worker'
}

describe('automation agent profile field', () => {
  it('offers and keeps a profile for a fresh Claude terminal run', () => {
    expect(automationProfileOffered(base, 'terminal')).toBe(true)
    expect(automationDraftAgentProfileId(base, 'terminal')).toBe('worker')
  })

  it.each([
    ['another agent', { ...base, agentId: 'codex' as const }, 'terminal' as const],
    ['chat', base, 'chat' as const],
    [
      'a bot',
      { ...base, bot: { botId: 'b', runsIn: 'new' as const, resultsTo: 'chat' as const } },
      'terminal' as const
    ],
    [
      'session reuse',
      { ...base, workspaceMode: 'existing' as const, reuseSession: true },
      'terminal' as const
    ]
  ])('drops the profile for %s', (_name, draft, surface) => {
    expect(automationProfileOffered(draft, surface)).toBe(false)
    expect(automationDraftAgentProfileId(draft, surface)).toBe('')
  })

  it('sends only a changed profile and clears with null', () => {
    expect(automationAgentProfileUpdate(base, 'terminal', null)).toEqual({
      agentProfileId: 'worker'
    })
    expect(automationAgentProfileUpdate(base, 'terminal', { agentProfileId: 'worker' })).toEqual({})
    expect(
      automationAgentProfileUpdate({ ...base, agentProfileId: '' }, 'terminal', {
        agentProfileId: 'worker'
      })
    ).toEqual({ agentProfileId: null })
    expect(
      automationAgentProfileUpdate({ ...base, agentId: 'codex' }, 'terminal', {
        agentProfileId: 'worker'
      })
    ).toEqual({ agentProfileId: null })
    expect(automationAgentProfileUpdate({ ...base, agentProfileId: '' }, 'terminal', null)).toEqual(
      {}
    )
  })

  it('treats a missing choice as no profile', () => {
    expect(automationDraftAgentProfileId({ ...base, agentProfileId: undefined }, 'terminal')).toBe(
      ''
    )
  })

  it('keeps the profile for an existing workspace without session reuse', () => {
    expect(
      automationProfileOffered(
        { ...base, workspaceMode: 'existing', reuseSession: false },
        'terminal'
      )
    ).toBe(true)
  })
})
