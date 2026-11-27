import { basename } from 'node:path'
import {
  compareClaudeLoadout,
  offeredButUnused
} from '../../../shared/agent-profile/loadout/claude-loadout-compare'
import type {
  ClaudeProfileAggregate,
  ClaudeProfileLoadoutReport,
  ClaudeProfileRunReport
} from '../../../shared/agent-usage/analytics/claude-profile-usage-types'
import { addBillableTokens, NO_TOKENS, type ClaudeBillableTokens } from '../claude-billable-tokens'
import { estimateCostUsd } from '../claude-model-pricing'
import type { ClaudeUsageSession } from '../types'
import type { ClaudeTranscriptLoadout } from './claude-transcript-loadout'
import type { ProfileRunRecord } from './profile-run-registry'

// Why: a start whose first prompt comes later cannot be told apart from a plain start in the same folder.
const ATTRIBUTION_WINDOW_MS = 10 * 60_000
const CLOCK_SKEW_MS = 5_000
const MAX_DETAILED_RUNS = 20

export type ProfileLoadoutSources = {
  listTranscriptFiles: () => Promise<string[]>
  readLoadout: (filePath: string) => Promise<ClaudeTranscriptLoadout>
}

function normalizeCwd(cwd: string): string {
  const slashed = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? slashed.toLowerCase() : slashed
}

type MatchedRun = { run: ProfileRunRecord; session: ClaudeUsageSession }

/** One session per run and one run per session; anything else is left unmatched instead of guessed. */
export function matchProfileRuns(
  runs: readonly ProfileRunRecord[],
  sessions: readonly ClaudeUsageSession[]
): MatchedRun[] {
  const byRun = new Map<string, ClaudeUsageSession[]>()
  for (const session of sessions) {
    if (!session.lastCwd) {
      continue
    }
    const first = new Date(session.firstTimestamp).getTime()
    const cwd = normalizeCwd(session.lastCwd)
    let owner: ProfileRunRecord | null = null
    for (const run of runs) {
      const age = first - run.startedAt
      if (
        run.cwd &&
        normalizeCwd(run.cwd) === cwd &&
        age >= -CLOCK_SKEW_MS &&
        age <= ATTRIBUTION_WINDOW_MS &&
        (!owner || run.startedAt > owner.startedAt)
      ) {
        owner = run
      }
    }
    if (owner) {
      byRun.set(owner.runId, [...(byRun.get(owner.runId) ?? []), session])
    }
  }
  const matched: MatchedRun[] = []
  for (const run of runs) {
    const claimed = byRun.get(run.runId)
    // Why: /clear or a second Claude in the same terminal would make several sessions claim one start.
    if (claimed?.length === 1) {
      matched.push({ run, session: claimed[0] })
    }
  }
  return matched
}

function sessionTokens(session: ClaudeUsageSession): ClaudeBillableTokens {
  return session.locationBreakdown.reduce<ClaudeBillableTokens>(addBillableTokens, NO_TOKENS)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

export function aggregateProfileRuns(
  runs: readonly ClaudeProfileRunReport[]
): ClaudeProfileAggregate[] {
  const byProfile = new Map<string, ClaudeProfileRunReport[]>()
  for (const run of runs) {
    byProfile.set(run.profileId, [...(byProfile.get(run.profileId) ?? []), run])
  }
  return [...byProfile.values()]
    .map((group) => {
      const priced = group.filter((run) => run.estimatedCostUsd !== null)
      return {
        profileId: group[0].profileId,
        // Latest name wins: a renamed profile should not show as two rows.
        profileName: [...group].sort((a, b) => b.startedAt - a.startedAt)[0].profileName,
        runs: group.length,
        medianTokens: median(group.map((run) => run.tokens.totalTokens)),
        estimatedCostUsd:
          priced.length > 0
            ? priced.reduce((sum, run) => sum + (run.estimatedCostUsd ?? 0), 0)
            : null
      }
    })
    .sort((a, b) => b.runs - a.runs || a.profileName.localeCompare(b.profileName))
}

export async function buildProfileLoadoutReport(
  runs: readonly ProfileRunRecord[],
  sessions: readonly ClaudeUsageSession[],
  sources: ProfileLoadoutSources
): Promise<ClaudeProfileLoadoutReport> {
  const matched = matchProfileRuns(runs, sessions).sort((a, b) => b.run.startedAt - a.run.startedAt)
  const detailed = matched.slice(0, MAX_DETAILED_RUNS)
  const filesBySession = new Map<string, string>()
  if (detailed.length > 0) {
    const wanted = new Set(detailed.map((entry) => entry.session.sessionId))
    for (const file of await sources.listTranscriptFiles()) {
      const id = basename(file, '.jsonl')
      if (wanted.has(id) && !filesBySession.has(id)) {
        filesBySession.set(id, file)
      }
    }
  }
  const reports: ClaudeProfileRunReport[] = []
  for (const { run, session } of matched) {
    const file = filesBySession.get(session.sessionId)
    const isDetailed = detailed.some((entry) => entry.run.runId === run.runId)
    const loadout = isDetailed && file ? await sources.readLoadout(file).catch(() => null) : null
    const tokens = sessionTokens(session)
    const ist = loadout?.listing ?? null
    reports.push({
      runId: run.runId,
      profileId: run.profileId,
      profileName: run.profileName,
      startedAt: run.startedAt,
      sessionId: session.sessionId,
      cwd: run.cwd,
      model: session.model,
      tokens: {
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        cacheReadTokens: tokens.cacheReadTokens,
        cacheWriteTokens: tokens.cacheWriteTokens,
        totalTokens:
          tokens.inputTokens +
          tokens.outputTokens +
          tokens.cacheReadTokens +
          tokens.cacheWriteTokens
      },
      estimatedCostUsd: estimateCostUsd(session.model, tokens),
      soll: run.soll,
      ist,
      deviation: compareClaudeLoadout(run.soll, ist),
      usage: loadout?.usage ?? null,
      offeredUnused: loadout ? offeredButUnused(ist, loadout.usage) : null
    })
  }
  return {
    runs: reports.slice(0, MAX_DETAILED_RUNS),
    profiles: aggregateProfileRuns(reports),
    unmatchedRuns: runs.length - matched.length
  }
}
