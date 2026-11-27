import { describe, expect, it } from 'vitest'
import type { ClaudeUsageSession } from '../types'
import type { ClaudeTranscriptLoadout } from './claude-transcript-loadout'
import { buildProfileLoadoutReport, matchProfileRuns } from './profile-loadout-report'
import type { ProfileRunRecord } from './profile-run-registry'

const T0 = Date.parse('2026-11-27T10:00:00.000Z')

function run(runId: string, profileId: string, offsetMs: number, cwd = '/repo'): ProfileRunRecord {
  return {
    runId,
    profileId,
    profileName: profileId.toUpperCase(),
    cwd,
    startedAt: T0 + offsetMs,
    soll: { enabledPlugins: ['review-tools@m'], mcpServers: null, model: null, orgPlugins: ['org'] }
  }
}

function session(
  sessionId: string,
  offsetMs: number,
  tokens: number,
  lastCwd = '/repo'
): ClaudeUsageSession {
  return {
    sessionId,
    firstTimestamp: new Date(T0 + offsetMs).toISOString(),
    lastTimestamp: new Date(T0 + offsetMs + 60_000).toISOString(),
    model: 'claude-sonnet-5-5',
    lastCwd,
    lastGitBranch: null,
    primaryWorktreeId: null,
    primaryRepoId: null,
    turnCount: 1,
    totalInputTokens: tokens,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
    totalCacheWrite1hTokens: 0,
    locationBreakdown: [
      {
        locationKey: 'k',
        projectLabel: 'p',
        repoId: null,
        worktreeId: null,
        turnCount: 1,
        inputTokens: tokens,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheWrite1hTokens: 0
      }
    ]
  }
}

describe('matchProfileRuns', () => {
  it('matches by folder and start window, and leaves ambiguous or late sessions unmatched', () => {
    const runs = [run('r1', 'a', 0), run('r2', 'b', 60_000), run('r3', 'c', 0, '/other')]
    const sessions = [
      session('s-ok', 61_000, 1),
      session('s-late', 20 * 60_000, 1),
      session('s-elsewhere', 1_000, 1, '/nowhere')
    ]
    expect(matchProfileRuns(runs, sessions).map((m) => [m.run.runId, m.session.sessionId])).toEqual(
      [['r2', 's-ok']]
    )
  })

  it('drops a run that several sessions claim', () => {
    const matched = matchProfileRuns(
      [run('r1', 'a', 0)],
      [session('s1', 1_000, 1), session('s2', 2_000, 1)]
    )
    expect(matched).toEqual([])
  })
})

describe('buildProfileLoadoutReport', () => {
  it('reports n and median tokens per profile and the deviation of a listed run', async () => {
    const runs = [run('r1', 'a', 0), run('r2', 'a', 3_600_000), run('r3', 'a', 7_200_000)]
    const sessions = [
      session('s1', 1_000, 100),
      session('s2', 3_601_000, 300),
      session('s3', 7_201_000, 200)
    ]
    const loadout: ClaudeTranscriptLoadout = {
      listing: {
        source: 'transcript-listing',
        plugins: ['org', 'review-tools', 'stray'],
        skills: ['review-tools:review'],
        agents: [],
        mcpServers: []
      },
      usage: { tools: [], skills: [], subagents: [], mcpServers: [] }
    }
    const report = await buildProfileLoadoutReport(runs, sessions, {
      listTranscriptFiles: async () => ['/t/s3.jsonl', '/t/s2.jsonl', '/t/s1.jsonl'],
      readLoadout: async () => loadout
    })
    expect(report.profiles).toEqual([
      {
        profileId: 'a',
        profileName: 'A',
        runs: 3,
        medianTokens: 200,
        estimatedCostUsd: expect.any(Number)
      }
    ])
    expect(report.unmatchedRuns).toBe(0)
    expect(report.runs[0].sessionId).toBe('s3')
    expect(report.runs[0].deviation).toEqual({
      status: 'deviates',
      plugins: { missing: [], unexpected: ['stray'], orgUnexpected: ['org'] },
      mcpServers: null
    })
    expect(report.runs[0].offeredUnused?.skills).toEqual(['review-tools:review'])
  })

  it('marks Ist as not determinable when the transcript has no listing', async () => {
    const report = await buildProfileLoadoutReport([run('r1', 'a', 0)], [session('s1', 1_000, 5)], {
      listTranscriptFiles: async () => ['/t/s1.jsonl'],
      readLoadout: async () => ({
        listing: null,
        usage: { tools: [], skills: [], subagents: [], mcpServers: [] }
      })
    })
    expect(report.runs[0].ist).toBeNull()
    expect(report.runs[0].deviation).toEqual({ status: 'not_determinable' })
    expect(report.runs[0].offeredUnused).toBeNull()
  })
})
