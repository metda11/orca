import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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

/** Appends serially (spawns overlap) and replaces the file atomically (the usage service reads it from another process). */
export function recordProfileRun(userDataDir: string, record: ProfileRunRecord): Promise<void> {
  const write = writeQueue.then(async () => {
    const runs = [...(await readProfileRuns(userDataDir)), record].slice(-MAX_RUNS)
    const path = profileRunRegistryPath(userDataDir)
    await mkdir(join(userDataDir, 'agent-profiles'), { recursive: true })
    const temp = `${path}.${process.pid}.tmp`
    await writeFile(temp, JSON.stringify(runs), 'utf-8')
    await rename(temp, path)
  })
  writeQueue = write.catch(() => {})
  return write
}
