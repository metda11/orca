import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareAgentProfileForPtySpawn } from './agent-profile-spawn-preparation'

vi.mock('../configuration/claude-sideload-policy', () => ({
  readClaudeSideloadDisabled: () => Promise.resolve(false)
}))

let root: string | null = null
afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true })
    root = null
  }
})

const settings = {
  agentProfiles: [
    { id: 'p1', name: 'P', mcpServers: { s: { command: 'x' } } },
    { id: 'acc', name: 'A', accountId: 'acct' },
    { id: 'gone', name: 'G', pluginDirs: ['/orca-test-no-such-plugin-dir'] }
  ]
}

describe('prepareAgentProfileForPtySpawn', () => {
  it('refuses ids that could escape the profile folder before touching disk', async () => {
    await expect(
      prepareAgentProfileForPtySpawn({ profileId: '../x', settings, userDataDir: '/nowhere' })
    ).rejects.toThrow('agent_profile_id_invalid')
    await expect(
      prepareAgentProfileForPtySpawn({ profileId: 7, settings, userDataDir: '/nowhere' })
    ).rejects.toThrow('agent_profile_id_invalid')
  })

  it('refuses remote hosts and managed accounts instead of starting a mismatched agent', async () => {
    await expect(
      prepareAgentProfileForPtySpawn({
        profileId: 'p1',
        connectionId: 'ssh1',
        settings,
        userDataDir: '/n'
      })
    ).rejects.toThrow('agent_profile_host_unsupported')
    await expect(
      prepareAgentProfileForPtySpawn({ profileId: 'acc', settings, userDataDir: '/n' })
    ).rejects.toThrow('agent_profile_account_unsupported')
  })

  it('writes the files the plan points at', async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-profile-'))
    await prepareAgentProfileForPtySpawn({ profileId: 'p1', settings, userDataDir: root })
    const mcp = await readFile(join(root, 'agent-profiles', 'p1', 'mcp.json'), 'utf8')
    expect(JSON.parse(mcp)).toEqual({ mcpServers: { s: { command: 'x' } } })
  })

  it('blocks the start, naming what is wrong, and writes nothing', async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-profile-'))
    await expect(
      prepareAgentProfileForPtySpawn({ profileId: 'gone', settings, userDataDir: root })
    ).rejects.toThrow('/orca-test-no-such-plugin-dir does not exist')
    await expect(readFile(join(root, 'agent-profiles', 'gone', 'settings.json'))).rejects.toThrow()
  })
})
