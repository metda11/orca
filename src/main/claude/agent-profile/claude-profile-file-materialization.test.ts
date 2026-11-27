import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { claudeProfileLaunchFiles } from '../../../shared/agent-profile/claude-profile-files'
import { buildClaudeProfileLaunch } from '../../../shared/agent-profile/claude-profile-launch-args'
import { materializeClaudeProfileFiles } from './claude-profile-file-materialization'

let root: string | null = null
afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true })
    root = null
  }
})

describe('claudeProfileLaunchFiles', () => {
  it('refuses ids that could leave the profile folder', () => {
    for (const id of ['', '..', '../x', 'a/b', 'a\\b', 'a b', 'x'.repeat(65)]) {
      expect(() => claudeProfileLaunchFiles('/data', id)).toThrow('agent_profile_id_invalid')
    }
  })

  it('keeps the host separator style of the root', () => {
    expect(claudeProfileLaunchFiles('C:\\Users\\a b\\Orca', 'p1').settingsPath).toBe(
      'C:\\Users\\a b\\Orca\\agent-profiles\\p1\\settings.json'
    )
    expect(claudeProfileLaunchFiles('/data/', 'p1').mcpConfigPath).toBe(
      '/data/agent-profiles/p1/mcp.json'
    )
  })
})

describe('materializeClaudeProfileFiles', () => {
  it('writes the files the launch argv points at, including paths with spaces', async () => {
    root = await mkdtemp(join(tmpdir(), 'orca profile '))
    const files = claudeProfileLaunchFiles(root, 'p1')
    const launch = buildClaudeProfileLaunch(
      { id: 'p1', name: 'Review', enabledPlugins: ['a@m'], mcpServers: { docs: { url: 'u' } } },
      { installedPluginIds: ['a@m', 'b@m'], files }
    )
    await materializeClaudeProfileFiles(launch, files)
    expect(launch.argv).toContain(files.settingsPath)
    expect(JSON.parse(await readFile(files.settingsPath, 'utf8'))).toEqual({
      enabledPlugins: { 'a@m': true, 'b@m': false }
    })
    expect(JSON.parse(await readFile(files.mcpConfigPath, 'utf8'))).toEqual({
      mcpServers: { docs: { url: 'u' } }
    })
  })
})
