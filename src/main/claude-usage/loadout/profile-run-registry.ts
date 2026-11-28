import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProfilePaneBinding } from '../../../shared/agent-profile/loadout/profile-pane-binding'
import type { ClaudeProfileSoll } from '../../../shared/agent-profile/loadout/claude-loadout-types'

const MAX_RUNS = 500

/** One profile-started terminal agent, written at spawn so a later transcript can be matched to it. */
export type ProfileRunRecord = {
  runId: string
  profileId: string
  profileName: string
  cwd: string | null
  startedAt: number
  soll: ClaudeProfileSoll
  /** Pane the agent was started in; absent on records written before the session binding. */
  paneKey?: string
  /** Claude session id the pane's first hook event reported; the exact link to the usage session. */
  sessionId?: string
  /** Set when the pane later started something without this profile, so its header stops claiming it. */
  detachedAt?: number
}

export function profileRunRegistryPath(userDataDir: string): string {
  return join(userDataDir, 'agent-profiles', 'runs.json')
}

function isProfileRunRecord(value: unknown): value is ProfileRunRecord {
  return (
    value !== null &&
    typeof value === 'object' &&
    'runId' in value &&
    typeof value.runId === 'string' &&
    'profileId' in value &&
    typeof value.profileId === 'string' &&
    'startedAt' in value &&
    typeof value.startedAt === 'number' &&
    'soll' in value &&
    typeof value.soll === 'object' &&
    value.soll !== null
  )
}

export async function readProfileRuns(userDataDir: string): Promise<ProfileRunRecord[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(profileRunRegistryPath(userDataDir), 'utf-8'))
    return Array.isArray(parsed) ? parsed.filter(isProfileRunRecord) : []
  } catch {
    return []
  }
}

let writeQueue: Promise<void> = Promise.resolve()

/** Serialises read-modify-write (spawns and hook events overlap); `update` returns null to skip the write. */
function updateProfileRuns(
  userDataDir: string,
  update: (runs: ProfileRunRecord[]) => ProfileRunRecord[] | null
): Promise<void> {
  const write = writeQueue.then(async () => {
    const next = update(await readProfileRuns(userDataDir))
    if (!next) {
      return
    }
    const path = profileRunRegistryPath(userDataDir)
    await mkdir(join(userDataDir, 'agent-profiles'), { recursive: true })
    const temp = `${path}.${process.pid}.tmp`
    await writeFile(temp, JSON.stringify(next.slice(-MAX_RUNS)), 'utf-8')
    await rename(temp, path)
  })
  writeQueue = write.catch(() => {})
  return write
}

/** Appends serially and replaces the file atomically (the usage service reads it from another process). */
export function recordProfileRun(userDataDir: string, record: ProfileRunRecord): Promise<void> {
  return updateProfileRuns(userDataDir, (runs) => [...runs, record])
}

function latestRunIndexForPane(runs: readonly ProfileRunRecord[], paneKey: string): number {
  for (let index = runs.length - 1; index >= 0; index--) {
    if (runs[index].paneKey === paneKey) {
      return index
    }
  }
  return -1
}

/** Pins the pane's newest run to the Claude session its first hook event named; the first session wins. */
export function bindProfileRunSession(
  userDataDir: string,
  paneKey: string,
  sessionId: string,
  eventAt: number
): Promise<void> {
  return updateProfileRuns(userDataDir, (runs) => {
    const index = latestRunIndexForPane(runs, paneKey)
    const run = index === -1 ? null : runs[index]
    // Why eventAt: an event older than the start belongs to what ran in the pane before it.
    if (!run || run.sessionId || run.detachedAt || eventAt < run.startedAt) {
      return null
    }
    return runs.map((entry, at) => (at === index ? { ...entry, sessionId } : entry))
  })
}

/** A start without a profile took the pane over; its header must not keep naming the old one. */
export function detachProfilePane(
  userDataDir: string,
  paneKey: string,
  now: number
): Promise<void> {
  return updateProfileRuns(userDataDir, (runs) => {
    const index = latestRunIndexForPane(runs, paneKey)
    if (index === -1 || runs[index].detachedAt) {
      return null
    }
    return runs.map((entry, at) => (at === index ? { ...entry, detachedAt: now } : entry))
  })
}

/** Newest attached run per pane. */
export function profilePaneBindings(
  runs: readonly ProfileRunRecord[]
): Record<string, ProfilePaneBinding> {
  const bindings: Record<string, ProfilePaneBinding> = {}
  for (const run of runs) {
    if (!run.paneKey) {
      continue
    }
    if (run.detachedAt) {
      delete bindings[run.paneKey]
      continue
    }
    bindings[run.paneKey] = {
      runId: run.runId,
      profileId: run.profileId,
      profileName: run.profileName,
      sessionId: run.sessionId ?? null
    }
  }
  return bindings
}

export async function readProfilePaneBindings(
  userDataDir: string
): Promise<Record<string, ProfilePaneBinding>> {
  return profilePaneBindings(await readProfileRuns(userDataDir))
}
