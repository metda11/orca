import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeAgentProfile } from '../../../shared/agent-profile/agent-profile-types'
import { clearClaudePluginInventoryCache } from '../plugin-inventory/claude-plugin-inventory'
import { runClaudeProfilePreflight } from './agent-profile-preflight'

const sideload = vi.hoisted(() => ({ disabled: false }))
vi.mock('../configuration/claude-sideload-policy', () => ({
  readClaudeSideloadDisabled: () => Promise.resolve(sideload.disabled)
}))

let base: string
let configDir: string
let workspace: string

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, JSON.stringify(value), 'utf8')
}

beforeEach(async () => {
  sideload.disabled = false
  base = await mkdtemp(join(tmpdir(), 'orca-profile-preflight-'))
  configDir = join(base, 'claude')
  workspace = join(base, 'work')
  await mkdir(workspace, { recursive: true })
  const installPath = join(configDir, 'plugins', 'cache', 'real')
  await writeJson(join(installPath, '.claude-plugin', 'plugin.json'), { name: 'real' })
  await writeJson(join(installPath, '.mcp.json'), { mcpServers: { files: { command: 'x' } } })
  await mkdir(join(installPath, 'agents'), { recursive: true })
  await writeFile(join(installPath, 'agents', 'helper.md'), '---\nname: helper\n---\n', 'utf8')
  await writeJson(join(configDir, 'plugins', 'installed_plugins.json'), {
    version: 2,
    plugins: { 'real@m': [{ scope: 'user', installPath }] }
  })
  await writeJson(join(configDir, 'settings.json'), { enabledPlugins: { 'real@m': true } })
  await writeJson(join(workspace, '.mcp.json'), { mcpServers: { wsrv: { command: 'y' } } })
  vi.stubEnv('CLAUDE_CONFIG_DIR', configDir)
  clearClaudePluginInventoryCache()
})

afterEach(async () => {
  vi.unstubAllEnvs()
  clearClaudePluginInventoryCache()
  await rm(base, { recursive: true, force: true })
})

const run = (
  profile: Partial<ClaudeAgentProfile>,
  extra: { agentName?: string; env?: NodeJS.ProcessEnv } = {}
) =>
  runClaudeProfilePreflight({
    profile: { id: 'p1', name: 'P', ...profile },
    cwd: workspace,
    ...extra
  })

describe('runClaudeProfilePreflight against real files', () => {
  it('passes a profile whose plugin, folder and agent exist', async () => {
    expect(
      await run({ enabledPlugins: ['real@m'] }, { agentName: 'real:helper', env: {} })
    ).toEqual([])
  })

  it('flags a plugin that is not installed', async () => {
    const findings = await run({ enabledPlugins: ['real@m', 'gone@m'] })
    expect(findings).toMatchObject([
      { code: 'plugin_missing', severity: 'error', subject: 'gone@m' }
    ])
  })

  it('flags a plugin folder that is missing on disk and a missing --plugin-dir', async () => {
    await rm(join(configDir, 'plugins', 'cache', 'real'), { recursive: true })
    clearClaudePluginInventoryCache()
    const findings = await run({
      enabledPlugins: ['real@m'],
      pluginDirs: [join(base, 'no-such-dir'), workspace]
    })
    expect(findings.map((finding) => [finding.code, finding.subject])).toEqual([
      ['plugin_folder_missing', 'real@m'],
      ['plugin_dir_missing', join(base, 'no-such-dir')]
    ])
  })

  it('flags a missing MCP startup script, relative to the workspace', async () => {
    await writeFile(join(workspace, 'present.mjs'), '', 'utf8')
    const findings = await run({
      mcpServers: {
        ok: { command: 'node', args: ['present.mjs'] },
        bad: { command: 'node', args: ['absent.mjs'] },
        bare: { command: 'npx', args: ['-y', 'some-package'] }
      }
    })
    expect(findings).toMatchObject([{ code: 'mcp_script_missing', subject: 'absent.mjs' }])
  })

  it('reports only the name of an unset credential variable, never a value', async () => {
    const findings = await run(
      {
        mcpServers: {
          s: {
            url: 'https://x.test/mcp',
            headers: { Authorization: 'Bearer ${SET_TOKEN}', Other: '${MISSING_TOKEN}' },
            env: { DEFAULTED: '${WITH_DEFAULT:-fallback}' }
          }
        }
      },
      { env: { SET_TOKEN: 'super-secret-value' } }
    )
    expect(findings).toMatchObject([
      { code: 'mcp_env_unset', severity: 'warning', subject: 'MISSING_TOKEN' }
    ])
    expect(JSON.stringify(findings)).not.toContain('super-secret-value')
  })

  it('flags tool names on servers outside the strict MCP scope', async () => {
    const findings = await run({
      mcpServers: { mine: { command: 'x' } },
      allowedTools: ['mcp__mine__read', 'mcp__wsrv__run', 'mcp__nowhere__x', 'Read'],
      disallowedTools: ['mcp__plugin_real_files__write']
    })
    expect(findings.map((finding) => [finding.code, finding.severity, finding.subject])).toEqual([
      ['mcp_tool_out_of_scope', 'error', 'mcp__wsrv__run'],
      ['mcp_tool_server_unknown', 'error', 'mcp__nowhere__x'],
      ['mcp_tool_out_of_scope', 'warning', 'mcp__plugin_real_files__write']
    ])
  })

  it('flags an --agent that no plugin or .claude/agents folder provides', async () => {
    await mkdir(join(workspace, '.claude', 'agents'), { recursive: true })
    await writeFile(join(workspace, '.claude', 'agents', 'mine.md'), '# no frontmatter', 'utf8')
    expect(await run({}, { agentName: 'mine' })).toEqual([])
    expect(await run({}, { agentName: 'ghost' })).toMatchObject([
      { code: 'agent_unknown', subject: 'ghost' }
    ])
  })

  it('flags flags the managed policy would discard', async () => {
    sideload.disabled = true
    const findings = await run({ pluginDirs: [workspace], mcpServers: { s: { command: 'x' } } })
    expect(findings).toMatchObject([
      { code: 'sideload_disabled', subject: '--plugin-dir, --mcp-config' }
    ])
    expect(await run({ model: 'opus' })).toEqual([])
  })

  it('stays fast without network access', async () => {
    const started = performance.now()
    await run({
      enabledPlugins: ['real@m'],
      mcpServers: { s: { command: 'x' } },
      allowedTools: ['mcp__s__a']
    })
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
