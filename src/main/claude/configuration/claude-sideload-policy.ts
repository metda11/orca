import { runProcess } from '@orca/process-host'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { claudeManagedSettingsFile } from './claude-managed-settings-file'

const REGISTRY_KEYS = [
  String.raw`HKLM\SOFTWARE\Policies\ClaudeCode`,
  String.raw`HKCU\SOFTWARE\Policies\ClaudeCode`
] as const
const REGISTRY_TIMEOUT_MS = 800
const CACHE_TTL_MS = 30_000

export type SideloadPolicyDeps = {
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  readText: (path: string) => Promise<string | null>
  listJsonFiles: (dir: string) => Promise<string[]>
  /** The JSON in the `Settings` value of a policy key; null when the key or value is absent. */
  readRegistrySettings: (key: string) => Promise<string | null>
}

function disablesSideload(json: string | null): boolean | null {
  if (json === null) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return 'disableSideloadFlags' in parsed ? parsed.disableSideloadFlags === true : false
  } catch {
    return null
  }
}

/** The `Settings` value of `reg query` output, which prints `    Settings    REG_SZ    {json}`. */
export function parseRegistrySettingsValue(stdout: string): string | null {
  const match = /^\s*Settings\s+REG_(?:EXPAND_)?SZ\s+(.*)$/im.exec(stdout)
  return match ? match[1].trim() : null
}

/**
 * Whether the machine's managed settings turn `disableSideloadFlags` on, which makes Claude discard
 * `--plugin-dir` and `--mcp-config`. Admin sources win over the user-writable HKCU key, as in Claude.
 */
export async function claudeSideloadDisabledByPolicy(deps: SideloadPolicyDeps): Promise<boolean> {
  const file = claudeManagedSettingsFile(deps.env, deps.platform)
  const folder = dirname(file)
  const dropIns = (await deps.listJsonFiles(join(folder, 'managed-settings.d'))).sort()
  // Why: drop-ins merge over the base file in file-name order, so the last one that sets the key wins.
  const fileValues = await Promise.all(
    [file, ...dropIns.map((name) => join(folder, 'managed-settings.d', name))].map(async (path) =>
      disablesSideload(await deps.readText(path))
    )
  )
  const fromFiles = fileValues.findLast((value) => value !== null) ?? undefined
  if (deps.platform !== 'win32') {
    return fromFiles ?? false
  }
  const [machine, user] = await Promise.all(
    REGISTRY_KEYS.map(async (key) => disablesSideload(await deps.readRegistrySettings(key)))
  )
  return machine ?? fromFiles ?? user ?? false
}

async function readRegistrySettings(key: string): Promise<string | null> {
  try {
    const result = await runProcess({
      program: 'reg',
      args: ['query', key, '/v', 'Settings'],
      timeoutMs: REGISTRY_TIMEOUT_MS,
      maxOutputBytes: 64 * 1024
    })
    return result.timedOut || result.code !== 0 ? null : parseRegistrySettingsValue(result.stdout)
  } catch {
    return null
  }
}

const defaultDeps: SideloadPolicyDeps = {
  env: process.env,
  platform: process.platform,
  readText: (path) => readFile(path, 'utf8').catch(() => null),
  listJsonFiles: async (dir) =>
    (await readdir(dir).catch(() => [])).filter((name) => name.endsWith('.json')),
  readRegistrySettings
}

let cached: { at: number; value: Promise<boolean> } | null = null

/** Cached briefly: the preflight asks on every start and managed policy changes rarely. */
export function readClaudeSideloadDisabled(): Promise<boolean> {
  if (!cached || Date.now() - cached.at > CACHE_TTL_MS) {
    cached = { at: Date.now(), value: claudeSideloadDisabledByPolicy(defaultDeps) }
  }
  return cached.value
}

export function clearClaudeSideloadPolicyCache(): void {
  cached = null
}
