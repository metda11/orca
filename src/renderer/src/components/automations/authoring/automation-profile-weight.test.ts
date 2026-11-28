import { describe, expect, it } from 'vitest'
import { formatWeightTokens, shouldPollWeights } from './automation-profile-weight'

describe('shouldPollWeights', () => {
  it('does not poll without a weight or without pending plugins', () => {
    expect(shouldPollWeights(null, ['a'])).toBe(false)
    expect(shouldPollWeights({ pending: [] }, ['a'])).toBe(false)
  })

  it('polls while a pending plugin of the profile is queued on the host', () => {
    expect(shouldPollWeights({ pending: ['a@m'] }, ['a@m', 'b@m'])).toBe(true)
  })

  it('stops when the host no longer queues the profile plugins (failed or other plugins only)', () => {
    expect(shouldPollWeights({ pending: ['a@m'] }, [])).toBe(false)
    expect(shouldPollWeights({ pending: ['a@m'] }, ['b@m'])).toBe(false)
  })
})

describe('formatWeightTokens', () => {
  it('groups thousands', () => {
    expect(formatWeightTokens(12345)).toBe('12,345')
  })
})
