import { describe, expect, it } from 'vitest'
import type {
  ProviderRateLimits,
  RateLimitWindow
} from '../../../shared/agent-usage/rate-limits/rate-limit-types'
import { automationUsageLimitHoldUntil } from './usage-limit-hold'

const NOW = 1_000_000

function window(usedPercent: number, resetsAt: number | null): RateLimitWindow {
  return { usedPercent, windowMinutes: 300, resetsAt, resetDescription: null }
}

function limits(overrides: Partial<ProviderRateLimits>): ProviderRateLimits {
  return {
    provider: 'claude',
    session: null,
    weekly: null,
    updatedAt: NOW,
    error: null,
    status: 'ok',
    ...overrides
  }
}

describe('automationUsageLimitHoldUntil', () => {
  it('holds until the latest reset among used-up windows', () => {
    const state = {
      claude: limits({ session: window(100, NOW + 3_000), weekly: window(100, NOW + 9_000) }),
      codex: null
    }
    expect(automationUsageLimitHoldUntil(state, 'claude', NOW)).toBe(NOW + 9_000)
  })

  it('does not hold while a window has room, has reset, or usage is unknown', () => {
    const open = { claude: limits({ session: window(99, NOW + 3_000) }), codex: null }
    expect(automationUsageLimitHoldUntil(open, 'claude', NOW)).toBeNull()
    const reset = { claude: limits({ session: window(100, NOW - 1) }), codex: null }
    expect(automationUsageLimitHoldUntil(reset, 'claude', NOW)).toBeNull()
    const errored = {
      claude: limits({ session: window(100, NOW + 3_000), status: 'error' as const }),
      codex: null
    }
    expect(automationUsageLimitHoldUntil(errored, 'claude', NOW)).toBeNull()
  })

  it('reads the account of the automation agent only', () => {
    const state = {
      claude: limits({ session: window(100, NOW + 3_000) }),
      codex: null
    }
    expect(automationUsageLimitHoldUntil(state, 'codex', NOW)).toBeNull()
    expect(automationUsageLimitHoldUntil(state, 'opencode', NOW)).toBeNull()
  })
})
