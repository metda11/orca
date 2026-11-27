import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ClaudeAgentProfile } from '../../../shared/agent-profile/agent-profile-types'
import { classifyDefaultProfileCopy } from '../../../shared/agent-profile/agent-profile-catalog'
import {
  agentProfileDigest,
  buildAgentProfileCatalog,
  loadAgentProfileCatalog,
  resetDefaultAgentProfile,
  seedDefaultAgentProfiles,
  type AgentProfileSettingsStore
} from './agent-profile-catalog-service'
import { parseCentralAgentProfile } from './central-agent-profile-folder'

const V1: ClaudeAgentProfile = { id: 'std', name: 'Std', permissionMode: 'plan' }
const V2: ClaudeAgentProfile = { id: 'std', name: 'Std', permissionMode: 'plan', model: 'opus' }

function makeStore(initial: ReturnType<AgentProfileSettingsStore['getSettings']> = {}) {
  let settings = initial
  const store: AgentProfileSettingsStore = {
    getSettings: () => settings,
    updateSettings: (patch) => {
      settings = { ...settings, ...patch }
    }
  }
  return store
}

let dirs: string[] = []
async function tmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-central-'))
  dirs.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
  dirs = []
})

describe('classifyDefaultProfileCopy', () => {
  it('separates current, outdated and edited', () => {
    expect(
      classifyDefaultProfileCopy({ copyDigest: 'b', templateDigest: 'b', baselineDigest: 'a' })
    ).toBe('current')
    expect(
      classifyDefaultProfileCopy({ copyDigest: 'a', templateDigest: 'b', baselineDigest: 'a' })
    ).toBe('outdated')
    expect(
      classifyDefaultProfileCopy({ copyDigest: 'x', templateDigest: 'b', baselineDigest: 'a' })
    ).toBe('edited')
    expect(
      classifyDefaultProfileCopy({
        copyDigest: 'a',
        templateDigest: 'b',
        baselineDigest: undefined
      })
    ).toBe('edited')
  })
})

describe('agentProfileDigest', () => {
  it('ignores key order and undefined fields', () => {
    expect(agentProfileDigest({ id: 'a', name: 'A', model: 'm' })).toBe(
      agentProfileDigest({ model: 'm', name: 'A', id: 'a', defaultTask: undefined })
    )
  })
})

describe('default profiles', () => {
  it('copies a template once and does not resurrect a deleted copy', () => {
    const store = makeStore()
    seedDefaultAgentProfiles(store, [V1])
    expect(store.getSettings().agentProfiles).toEqual([V1])
    store.updateSettings({ agentProfiles: [] })
    seedDefaultAgentProfiles(store, [V1])
    expect(store.getSettings().agentProfiles).toEqual([])
  })

  it('leaves a same-id profile the user made before untouched', () => {
    const mine = { id: 'std', name: 'Mine' }
    const store = makeStore({ agentProfiles: [mine] })
    seedDefaultAgentProfiles(store, [V1])
    expect(store.getSettings().agentProfiles).toEqual([mine])
    expect(store.getSettings().agentProfileDefaultBaselines).toBeUndefined()
  })

  it('marks an untouched copy outdated after the template changes, then resets without loss', async () => {
    const store = makeStore()
    seedDefaultAgentProfiles(store, [V1])
    let catalog = await buildAgentProfileCatalog(store.getSettings(), [V1])
    expect(catalog.entries[0]).toMatchObject({ origin: 'default', defaultState: 'current' })

    catalog = await buildAgentProfileCatalog(store.getSettings(), [V2])
    expect(catalog.entries[0].defaultState).toBe('outdated')
    // The copy itself is not rewritten by the template change.
    expect(store.getSettings().agentProfiles).toEqual([V1])

    expect(await resetDefaultAgentProfile(store, 'std', [V2])).toEqual({ ok: true })
    expect(store.getSettings().agentProfiles).toEqual([V2])
    catalog = await buildAgentProfileCatalog(store.getSettings(), [V2])
    expect(catalog.entries[0].defaultState).toBe('current')
  })

  it('marks an edited copy edited and keeps the edit as a separate profile on reset', async () => {
    const store = makeStore()
    seedDefaultAgentProfiles(store, [V1])
    store.updateSettings({ agentProfiles: [{ ...V1, model: 'haiku' }] })
    let catalog = await buildAgentProfileCatalog(store.getSettings(), [V2])
    expect(catalog.entries[0].defaultState).toBe('edited')

    const result = await resetDefaultAgentProfile(store, 'std', [V2])
    expect(result).toEqual({ ok: true, backupId: 'std-edited' })
    const profiles = store.getSettings().agentProfiles ?? []
    expect(profiles.find((p) => p.id === 'std')).toEqual(V2)
    expect(profiles.find((p) => p.id === 'std-edited')).toMatchObject({
      model: 'haiku',
      name: 'Std (edited)'
    })
    catalog = await buildAgentProfileCatalog(store.getSettings(), [V2])
    expect(catalog.entries.find((e) => e.profile.id === 'std')?.defaultState).toBe('current')
    expect(catalog.entries.find((e) => e.profile.id === 'std-edited')?.origin).toBe('local')
  })

  it('rejects an unknown default id', async () => {
    expect(await resetDefaultAgentProfile(makeStore(), 'nope', [V1])).toEqual({
      ok: false,
      reason: 'unknown_default'
    })
  })

  it('loadAgentProfileCatalog seeds the bundled defaults', async () => {
    const store = makeStore()
    const catalog = await loadAgentProfileCatalog(store)
    expect(catalog.entries.length).toBeGreaterThan(0)
    expect(
      catalog.entries.every((e) => e.origin === 'default' && e.defaultState === 'current')
    ).toBe(true)
  })
})

describe('central profile folder', () => {
  async function centralDir(files: Record<string, unknown>): Promise<string> {
    const dir = await tmp()
    for (const [name, content] of Object.entries(files)) {
      await writeFile(
        join(dir, name),
        typeof content === 'string' ? content : JSON.stringify(content)
      )
    }
    return dir
  }

  it('lists a central profile as read-only and hides a local one of the same id without touching it', async () => {
    const dir = await centralDir({ 'team.json': { id: 'team', name: 'Team', model: 'opus' } })
    const local: ClaudeAgentProfile[] = [
      { id: 'team', name: 'Mine' },
      { id: 'other', name: 'Other' }
    ]
    const store = makeStore({ agentProfiles: local, agentProfileCentralDir: dir })
    const catalog = await buildAgentProfileCatalog(store.getSettings(), [])
    const team = catalog.entries.filter((e) => e.profile.id === 'team')
    expect(team).toHaveLength(1)
    expect(team[0]).toMatchObject({
      origin: 'central',
      readOnly: true,
      shadowsLocal: true,
      profile: { name: 'Team' }
    })
    expect(catalog.entries.find((e) => e.profile.id === 'other')?.readOnly).toBe(false)
    expect(store.getSettings().agentProfiles).toEqual(local)
  })

  it('wins over a default of the same id and refuses to reset it', async () => {
    const dir = await centralDir({ 'std.json': { id: 'std', name: 'Central Std' } })
    const store = makeStore()
    seedDefaultAgentProfiles(store, [V1])
    store.updateSettings({ agentProfileCentralDir: dir })
    const catalog = await buildAgentProfileCatalog(store.getSettings(), [V1])
    expect(catalog.entries).toHaveLength(1)
    expect(catalog.entries[0].origin).toBe('central')
    expect(await resetDefaultAgentProfile(store, 'std', [V1])).toEqual({
      ok: false,
      reason: 'shadowed_by_central'
    })
  })

  it('never writes to the folder', async () => {
    const dir = await centralDir({ 'a.json': { id: 'a', name: 'A' } })
    const before = await stat(join(dir, 'a.json'))
    const names = await readdir(dir)
    const store = makeStore({ agentProfileCentralDir: dir })
    await loadAgentProfileCatalog(store)
    await resetDefaultAgentProfile(store, 'orca-plan')
    expect(await readdir(dir)).toEqual(names)
    expect((await stat(join(dir, 'a.json'))).mtimeMs).toBe(before.mtimeMs)
    expect(await readFile(join(dir, 'a.json'), 'utf8')).toBe(JSON.stringify({ id: 'a', name: 'A' }))
  })

  it('skips invalid and duplicate files with a warning', async () => {
    const dir = await centralDir({
      'a.json': { id: 'a', name: 'A' },
      'a2.json': { id: 'a', name: 'A again' },
      'bad.json': '{not json',
      'unsafe.json': { id: '../x', name: 'X' },
      'notes.txt': 'ignored'
    })
    const catalog = await buildAgentProfileCatalog({ agentProfileCentralDir: dir }, [])
    expect(catalog.entries.map((e) => e.profile.name)).toEqual(['A'])
    expect(catalog.warnings).toEqual(
      expect.arrayContaining([
        { code: 'central_profile_duplicate_id', file: 'a2.json', id: 'a' },
        { code: 'central_profile_invalid', file: 'bad.json' },
        { code: 'central_profile_invalid', file: 'unsafe.json' }
      ])
    )
  })

  it('warns when the folder cannot be read', async () => {
    const catalog = await buildAgentProfileCatalog(
      { agentProfileCentralDir: join(await tmp(), 'missing') },
      []
    )
    expect(catalog.warnings[0]).toMatchObject({ code: 'central_folder_unreadable' })
  })

  it.skipIf(process.platform === 'win32')('warns when group or others can write', async () => {
    const dir = await centralDir({ 'a.json': { id: 'a', name: 'A' } })
    await chmod(dir, 0o777)
    const catalog = await buildAgentProfileCatalog({ agentProfileCentralDir: dir }, [])
    expect(catalog.warnings).toContainEqual({
      code: 'central_folder_writable_by_others',
      path: dir
    })
    expect(catalog.entries).toHaveLength(1)
  })

  it('drops unknown keys and rejects bad field types', () => {
    expect(parseCentralAgentProfile({ id: 'a', name: 'A', extra: 1 })).toEqual({
      id: 'a',
      name: 'A'
    })
    expect(parseCentralAgentProfile({ id: 'a', name: 'A', permissionMode: 'nope' })).toBeNull()
    expect(parseCentralAgentProfile({ id: 'a', name: 'A', allowedTools: [1] })).toBeNull()
    expect(parseCentralAgentProfile({ id: 'a', name: ' ' })).toBeNull()
  })
})
