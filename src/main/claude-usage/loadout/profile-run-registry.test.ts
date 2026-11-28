import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bindProfileRunSession,
  detachProfilePane,
  profilePaneBindings,
  readProfilePaneBindings,
  readProfileRuns,
  recordProfileRun,
  type ProfileRunRecord
} from './profile-run-registry'

const SOLL = { enabledPlugins: null, mcpServers: null, model: null, orgPlugins: [] }

function record(runId: string, paneKey: string, startedAt: number): ProfileRunRecord {
  return {
    runId,
    profileId: `p-${runId}`,
    profileName: `Profile ${runId}`,
    cwd: '/repo',
    paneKey,
    startedAt,
    soll: SOLL
  }
}

describe('profile run registry pane binding', () => {
  let dir: string | null = null
  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true })
      dir = null
    }
  })

  async function setup(...records: ProfileRunRecord[]): Promise<string> {
    dir = await mkdtemp(join(tmpdir(), 'orca-runs-'))
    for (const entry of records) {
      await recordProfileRun(dir, entry)
    }
    return dir
  }

  it('pins the newest run of the pane to the first session its hook reports', async () => {
    const root = await setup(record('r1', 'tab:a', 1_000), record('r2', 'tab:a', 2_000))
    await bindProfileRunSession(root, 'tab:a', 's-1', 2_500)
    await bindProfileRunSession(root, 'tab:a', 's-2', 3_000)
    const runs = await readProfileRuns(root)
    expect(runs.map((r) => r.sessionId)).toEqual([undefined, 's-1'])
  })

  it('ignores an event older than the start and a pane without a run', async () => {
    const root = await setup(record('r1', 'tab:a', 5_000))
    await bindProfileRunSession(root, 'tab:a', 's-old', 4_000)
    await bindProfileRunSession(root, 'tab:other', 's-x', 9_000)
    expect((await readProfileRuns(root))[0].sessionId).toBeUndefined()
  })

  it('names the attached run per pane and drops it once a plain start took the pane over', async () => {
    const root = await setup(record('r1', 'tab:a', 1_000), record('r2', 'tab:b', 2_000))
    await bindProfileRunSession(root, 'tab:a', 's-1', 1_500)
    expect(await readProfilePaneBindings(root)).toEqual({
      'tab:a': { runId: 'r1', profileId: 'p-r1', profileName: 'Profile r1', sessionId: 's-1' },
      'tab:b': { runId: 'r2', profileId: 'p-r2', profileName: 'Profile r2', sessionId: null }
    })
    await detachProfilePane(root, 'tab:a', 3_000)
    const bindings = await readProfilePaneBindings(root)
    expect(Object.keys(bindings)).toEqual(['tab:b'])
    // The session link survives, so usage attribution is unaffected by the header.
    expect((await readProfileRuns(root))[0].sessionId).toBe('s-1')
  })

  it('shows a profile started again in a detached pane', () => {
    const detached = { ...record('r1', 'tab:a', 1_000), detachedAt: 2_000 }
    expect(Object.keys(profilePaneBindings([detached, record('r2', 'tab:a', 3_000)]))).toEqual([
      'tab:a'
    ])
  })
})
