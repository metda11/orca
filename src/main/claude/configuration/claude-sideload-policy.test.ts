import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  claudeSideloadDisabledByPolicy,
  parseRegistrySettingsValue,
  type SideloadPolicyDeps
} from './claude-sideload-policy'

let programFiles: string
let managedDir: string

beforeEach(async () => {
  programFiles = await mkdtemp(join(tmpdir(), 'orca-sideload-'))
  managedDir = join(programFiles, 'ClaudeCode')
  await mkdir(join(managedDir, 'managed-settings.d'), { recursive: true })
})
afterEach(() => rm(programFiles, { recursive: true, force: true }))

function deps(registry: Record<string, string> = {}): SideloadPolicyDeps {
  return {
    env: { PROGRAMFILES: programFiles },
    platform: 'win32',
    readText: (path) => readFile(path, 'utf8').catch(() => null),
    listJsonFiles: async (dir) =>
      (await readdir(dir).catch(() => [])).filter((n) => n.endsWith('.json')),
    readRegistrySettings: async (key) => registry[key] ?? null
  }
}

const HKLM = String.raw`HKLM\SOFTWARE\Policies\ClaudeCode`
const HKCU = String.raw`HKCU\SOFTWARE\Policies\ClaudeCode`

describe('claudeSideloadDisabledByPolicy', () => {
  it('is off without any policy', async () => {
    expect(await claudeSideloadDisabledByPolicy(deps())).toBe(false)
  })

  it('reads managed-settings.json, and a later drop-in overrides it', async () => {
    await writeFile(
      join(managedDir, 'managed-settings.json'),
      JSON.stringify({ disableSideloadFlags: true })
    )
    expect(await claudeSideloadDisabledByPolicy(deps())).toBe(true)
    await writeFile(
      join(managedDir, 'managed-settings.d', '50-open.json'),
      JSON.stringify({ disableSideloadFlags: false })
    )
    expect(await claudeSideloadDisabledByPolicy(deps())).toBe(false)
  })

  it('reads the HKLM policy and prefers it over the user-writable HKCU key', async () => {
    const on = JSON.stringify({ disableSideloadFlags: true })
    const off = JSON.stringify({ disableSideloadFlags: false })
    expect(await claudeSideloadDisabledByPolicy(deps({ [HKLM]: on }))).toBe(true)
    expect(await claudeSideloadDisabledByPolicy(deps({ [HKLM]: off, [HKCU]: on }))).toBe(false)
    expect(await claudeSideloadDisabledByPolicy(deps({ [HKCU]: on }))).toBe(true)
  })

  it('ignores HKCU beneath a managed settings file', async () => {
    await writeFile(join(managedDir, 'managed-settings.json'), '{}')
    const on = JSON.stringify({ disableSideloadFlags: true })
    expect(await claudeSideloadDisabledByPolicy(deps({ [HKCU]: on }))).toBe(false)
  })
})

describe('parseRegistrySettingsValue', () => {
  it('takes the JSON out of reg query output', () => {
    const stdout = `\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\ClaudeCode\r\n    Settings    REG_SZ    {"disableSideloadFlags": true}\r\n\r\n`
    expect(parseRegistrySettingsValue(stdout)).toBe('{"disableSideloadFlags": true}')
    expect(parseRegistrySettingsValue('ERROR: not found')).toBeNull()
  })
})
