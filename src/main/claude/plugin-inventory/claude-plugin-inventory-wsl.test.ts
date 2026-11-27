import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runWslProcess: vi.fn(),
  getWslHomeAsync: vi.fn()
}))

vi.mock('../../wsl/execution/wsl-runner', () => ({ runWslProcess: mocks.runWslProcess }))
vi.mock('../../wsl/discovery/distro-catalog', () => ({ getWslHomeAsync: mocks.getWslHomeAsync }))

import {
  buildWslInventoryMetadataScript,
  buildWslPluginSnapshotScript,
  parseWslInventoryMetadata,
  parseWslPluginSnapshot,
  readClaudePluginInventoryInWsl
} from './claude-plugin-inventory-wsl'

const b64 = (text: string) => Buffer.from(text).toString('base64')
const record = (...fields: string[]) => `${fields.join('\0')}\0`

describe('parseWslInventoryMetadata', () => {
  it('reads files, a missing file, and synced account folders', () => {
    const output =
      record('F', '0', '1', b64('{"a":1}')) +
      record('F', '1', '0', '') +
      record('S', 'org_acc', '1', b64('{"plugins":[]}')) +
      record('D', 'org_acc', 'inno-core~g4', '') +
      record('D', 'org_acc', 'inno-core~g3', '')

    const parsed = parseWslInventoryMetadata(output, 2)

    expect(parsed.files).toEqual(['{"a":1}', null])
    expect(parsed.synced.get('org_acc')).toEqual({
      manifest: '{"plugins":[]}',
      folders: ['inno-core~g4', 'inno-core~g3']
    })
  })

  it('refuses an unknown record instead of returning a smaller inventory', () => {
    expect(() => parseWslInventoryMetadata(record('X', '0', '1', ''), 1)).toThrow(/invalid/)
    expect(() => parseWslInventoryMetadata(record('F', '5', '1', ''), 1)).toThrow(/invalid/)
  })
})

describe('parseWslPluginSnapshot', () => {
  it('serves stat, readdir and text from the listed entries, by POSIX path', async () => {
    const output =
      record('E', 'd', '/home/u/.claude/plugins/cache/p', '') +
      record('E', 'd', '/home/u/.claude/plugins/cache/p/skills', '') +
      record('E', 'd', '/home/u/.claude/plugins/cache/p/skills/board', '') +
      record('E', 'f', '/home/u/.claude/plugins/cache/p/skills/board/SKILL.md', '') +
      record('E', 'f', '/home/u/.claude/plugins/cache/p/.mcp.json', '') +
      record('C', '/home/u/.claude/plugins/cache/p/.mcp.json', b64('{"x":{}}'), '')

    const fs = parseWslPluginSnapshot(output, new Map())

    expect(await fs.stat('/home/u/.claude/plugins/cache/p/skills')).toEqual({
      isDirectory: true,
      isFile: false
    })
    expect(await fs.stat('/home/u/.claude/plugins/cache/missing')).toBeNull()
    expect(await fs.readdir('/home/u/.claude/plugins/cache/p/skills')).toEqual([
      { name: 'board', isDirectory: true, isFile: false }
    ])
    expect(await fs.readText('/home/u/.claude/plugins/cache/p/.mcp.json')).toBe('{"x":{}}')
    expect(await fs.readText('/home/u/.claude/plugins/cache/p/skills')).toBeNull()
  })
})

describe('scripts', () => {
  it('quote every path they embed', () => {
    const script = buildWslPluginSnapshotScript(["/home/o'brien/p"])
    expect(script).toContain(`snapshot_root '/home/o'\\''brien/p'`)
    expect(buildWslInventoryMetadataScript(['/a b'], '/s t')).toContain(`synced_root='/s t'`)
  })
})

// Runs the real scripts with bash over a real folder; the share path of a distro is not testable here.
function bashFlavour(): string | null {
  const probe = spawnSync('bash', ['-c', 'uname -o'], { encoding: 'utf8' })
  return probe.status === 0 ? probe.stdout.trim() : null
}
// On Windows only Git Bash (Msys) behaves like the distro's bash; a System32 `bash.exe` is WSL itself.
const flavour = bashFlavour()
const hasBash = process.platform === 'win32' ? flavour === 'Msys' : flavour !== null

// Git Bash on Windows sees `C:\x` as `/c/x`; the scripts and the expectations use that POSIX form.
function toPosix(path: string): string {
  return path
    .replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`)
    .replaceAll('\\', '/')
}
function toNative(path: string): string {
  return process.platform === 'win32'
    ? path.replace(/^\/([a-z])\//, (_, drive: string) => `${drive.toUpperCase()}:/`)
    : path
}

describe.skipIf(!hasBash)('scripts run in bash', () => {
  let base: string
  beforeEach(() => {
    base = toPosix(mkdtempSync(join(tmpdir(), 'orca-wsl-inventory-')))
  })
  afterEach(() => rmSync(toNative(base), { recursive: true, force: true }))

  function put(path: string, content: string) {
    mkdirSync(toNative(posix.join(path, '..')), { recursive: true })
    writeFileSync(toNative(path), content)
  }

  it('reads a full inventory from a folder laid out like a distro home', async () => {
    const home = posix.join(base, 'home')
    const account = '11111111-1111-1111-1111-111111111111_22222222-2222-2222-2222-222222222222'
    const cache = posix.join(home, '.claude', 'plugins', 'cache', 'm', 'local', '1.0.0')
    const synced = posix.join(home, '.claude', 'plugins', 'synced', account, 'inno-core~g4')
    const project = posix.join(base, 'project')
    put(
      posix.join(home, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({
        version: 2,
        plugins: { 'local@m': [{ scope: 'user', installPath: cache, version: '1.0.0' }] }
      })
    )
    put(
      posix.join(home, '.claude.json'),
      JSON.stringify({
        oauthAccount: {
          organizationUuid: '11111111-1111-1111-1111-111111111111',
          accountUuid: '22222222-2222-2222-2222-222222222222'
        }
      })
    )
    put(
      posix.join(home, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'local@m': true } })
    )
    put(
      posix.join(home, '.claude', 'plugins', 'synced', account, 'manifest.json'),
      JSON.stringify({ plugins: [{ name: 'inno-core', generation: 4 }] })
    )
    put(posix.join(cache, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'local' }))
    put(posix.join(cache, 'skills', 'board', 'SKILL.md'), '---\nname: board\n---')
    put(posix.join(cache, 'agents', 'a.md'), '---\nname: reviewer\n---\nbody')
    put(posix.join(cache, 'commands', 'git', 'sync.md'), '# sync')
    put(posix.join(cache, '.mcp.json'), JSON.stringify({ mcpServers: { srv: { command: 'x' } } }))
    put(posix.join(cache, 'node_modules', 'dep', 'agents', 'ignored.md'), '# ignored')
    put(posix.join(synced, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'inno-core' }))
    put(posix.join(project, '.mcp.json'), JSON.stringify({ workspaceServer: { command: 'y' } }))

    mocks.getWslHomeAsync.mockResolvedValue(`\\\\wsl.localhost\\Ubuntu${home}`)
    mocks.runWslProcess.mockImplementation(async ({ script }: { script: string }) => {
      const result = spawnSync('bash', ['-c', script], { encoding: 'utf8' })
      return { code: result.status, stdout: result.stdout, stderr: '', timedOut: false }
    })

    const inventory = await readClaudePluginInventoryInWsl({
      distro: 'Ubuntu',
      accountHomePath: null,
      cwd: project
    })

    expect(inventory.wslDistro).toBe('Ubuntu')
    expect(inventory.configDir).toBe(posix.join(home, '.claude'))
    expect(inventory.workspaceMcpServers).toEqual(['workspaceServer'])
    const byId = Object.fromEntries(inventory.plugins.map((plugin) => [plugin.id, plugin]))
    expect(byId['local@m']).toMatchObject({
      scope: 'user',
      enabled: true,
      skills: ['board'],
      agents: ['reviewer'],
      commands: ['git:sync'],
      mcpServers: ['srv']
    })
    expect(byId['inno-core@synced']).toMatchObject({ scope: 'synced', installPath: synced })
    // The distro's folders were read through bash, never through the Windows file system.
    expect(mocks.runWslProcess).toHaveBeenCalledTimes(2)
  })
})
