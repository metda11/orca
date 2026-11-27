import type {
  ClaudeLoadoutDeviation,
  ClaudeLoadoutListing,
  ClaudeLoadoutOfferedUnused,
  ClaudeLoadoutUsage,
  ClaudeProfileSoll
} from '../../agent-profile/loadout/claude-loadout-types'

export type ClaudeProfileRunTokens = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  /** Sum of all four; the unit profiles are compared in, because USD moves with prompt-cache luck. */
  totalTokens: number
}

/** A terminal Claude start from a profile, matched to the usage session it became. */
export type ClaudeProfileRunReport = {
  runId: string
  profileId: string
  profileName: string
  startedAt: number
  sessionId: string
  cwd: string | null
  model: string | null
  tokens: ClaudeProfileRunTokens
  estimatedCostUsd: number | null
  soll: ClaudeProfileSoll
  /** Null when the transcript carries no listing: Ist is not determinable, not empty. */
  ist: ClaudeLoadoutListing | null
  deviation: ClaudeLoadoutDeviation
  /** Null when the transcript could not be read. */
  usage: ClaudeLoadoutUsage | null
  offeredUnused: ClaudeLoadoutOfferedUnused | null
}

export type ClaudeProfileAggregate = {
  profileId: string
  profileName: string
  runs: number
  medianTokens: number
  /** Sum over runs with a known price; not comparable between profiles. */
  estimatedCostUsd: number | null
}

export type ClaudeProfileLoadoutReport = {
  /** Newest first, capped; `profiles` still counts every matched run. */
  runs: ClaudeProfileRunReport[]
  profiles: ClaudeProfileAggregate[]
  /** Runs that never produced a unique usage session (no prompt yet, usage off, ambiguous start). */
  unmatchedRuns: number
}
