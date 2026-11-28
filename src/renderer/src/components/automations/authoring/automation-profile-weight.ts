import type { ProfileContextWeight } from '../../../../../shared/agent-profile/profile-context-weight'

export const PROFILE_WEIGHT_POLL_MS = 3000

/** Whole tokens for the line under the picker; the numbers are projections, not exact counts. */
export function formatWeightTokens(tokens: number): string {
  return tokens.toLocaleString('en-US')
}

/**
 * Polling runs only while an active plugin of the profile is still unmeasured and the host reports
 * it as queued or running. A failed measurement leaves `pending` of the weight set but not of the
 * reading, so the lower bound stays on screen without a loop.
 */
export function shouldPollWeights(
  weight: Pick<ProfileContextWeight, 'pending'> | null,
  hostPending: readonly string[]
): boolean {
  if (!weight || weight.pending.length === 0) {
    return false
  }
  const queued = new Set(hostPending)
  return weight.pending.some((id) => queued.has(id))
}
