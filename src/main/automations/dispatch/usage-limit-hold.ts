import type { AutomationUsageLimitHold } from './automation-dispatch-holds'
import type { TuiAgent } from '../../../shared/agent-launch/catalog/tui-agent'
import type {
  ProviderRateLimits,
  RateLimitState
} from '../../../shared/agent-usage/rate-limits/rate-limit-types'

type UsageLimitProvider = 'claude' | 'codex'

function limitProviderOf(agentId: TuiAgent): UsageLimitProvider | null {
  return agentId === 'claude' || agentId === 'codex' ? agentId : null
}

/** The time the account is usable again when one of its windows is used up, else null. */
export function usageLimitResetAt(limits: ProviderRateLimits | null, now: number): number | null {
  if (!limits || limits.status !== 'ok') {
    return null
  }
  const exhaustedResets = [limits.session, limits.weekly, limits.fableWeekly, limits.monthly]
    .filter((window) => window && window.usedPercent >= 100)
    .map((window) => window?.resetsAt ?? null)
    .filter((resetsAt): resetsAt is number => resetsAt !== null && resetsAt > now)
  return exhaustedResets.length > 0 ? Math.max(...exhaustedResets) : null
}

/** Reads the account limits when a run is about to start; unknown usage never holds a run. */
export function createAutomationUsageLimitHold(
  readRateLimits?: () => Promise<Pick<RateLimitState, 'claude' | 'codex'> | null>
): AutomationUsageLimitHold | undefined {
  return (
    readRateLimits &&
    (async (agentId) => {
      try {
        const state = await readRateLimits()
        return state ? automationUsageLimitHoldUntil(state, agentId, Date.now()) : null
      } catch (error) {
        console.warn('[automations] could not read usage limits:', error)
        return null
      }
    })
  )
}

/** Until when a run of this agent waits: the reset of the exhausted account, null when it may start. */
export function automationUsageLimitHoldUntil(
  state: Pick<RateLimitState, 'claude' | 'codex'>,
  agentId: TuiAgent,
  now: number
): number | null {
  const provider = limitProviderOf(agentId)
  return provider ? usageLimitResetAt(state[provider], now) : null
}
