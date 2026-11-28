import { describe, expect, it } from 'vitest'
import { shouldShowProfileChip, type ProfilePaneBinding } from './profile-pane-binding'

const binding: ProfilePaneBinding = {
  runId: 'r1',
  profileId: 'p1',
  profileName: 'Review',
  sessionId: 's-1'
}

describe('shouldShowProfileChip', () => {
  it('hides without a binding', () => {
    expect(shouldShowProfileChip(undefined, 's-1')).toBe(false)
  })

  it('shows before any session id is known on either side', () => {
    expect(shouldShowProfileChip({ ...binding, sessionId: null }, undefined)).toBe(true)
    expect(shouldShowProfileChip(binding, undefined)).toBe(true)
  })

  it('shows for the bound session and hides for another one in the same pane', () => {
    expect(shouldShowProfileChip(binding, 's-1')).toBe(true)
    expect(shouldShowProfileChip(binding, 's-2')).toBe(false)
  })
})
