import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readClaudePluginFolder } from './claude-plugin-contents'

let base: string | null = null

afterEach(async () => {
  if (base) {
    await rm(base, { recursive: true, force: true })
    base = null
  }
})

async function file(path: string, content: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, content)
}

describe('readClaudePluginFolder', () => {
  it('reads only paths inside the plugin, and servers beside a readme key', async () => {
    base = await mkdtemp(join(tmpdir(), 'orca-plugin-inventory-'))
    const root = join(base, 'plugin')
    await file(join(base, 'outside', 'leak.md'), '# leak')
    await file(join(root, '..foo', 'dotted.md'), '# a folder name starting with two dots')
    await file(join(root, 'commands', 'git', 'sync.md'), '# nested')
    await file(join(root, 'skills', 'board', 'SKILL.md'), '---\nname: board\n---')
    await file(
      join(root, 'agents', 'helper.md'),
      `${String.fromCharCode(0xfeff)}---
name: reviewer
---
`
    )
    await file(
      join(root, '.claude-plugin', 'plugin.json'),
      JSON.stringify({
        name: 'p',
        commands: ['../outside', join(base, 'outside'), './..foo']
      })
    )
    // Shape of inno-core's .mcp.json: a string `_readme` beside the `mcpServers` block.
    await file(
      join(root, '.mcp.json'),
      JSON.stringify({ _readme: 'x', mcpServers: { b: { type: 'http' }, a: { command: 'x' } } })
    )

    const read = await readClaudePluginFolder(root)

    expect(read.contents).toEqual({
      skills: ['board'],
      agents: ['reviewer'],
      commands: ['dotted', 'git:sync'],
      mcpServers: ['a', 'b']
    })
    expect(read.problem).toBeUndefined()
  })

  // Measured against Claude Code 2.1.332 (`--plugin-dir`, init message of stream-json).
  it('follows linked skill folders and names a skill by its folder, not its frontmatter', async () => {
    base = await mkdtemp(join(tmpdir(), 'orca-plugin-inventory-'))
    const root = join(base, 'plugin')
    await file(join(root, 'skills', 'folder-a', 'SKILL.md'), '---\nname: other-name\n---')
    await file(join(root, 'shared', 'SKILL.md'), '---\nname: shared\n---')
    await file(join(root, 'shared-agents', 'ag.md'), '---\nname: linked-agent\n---')
    await mkdir(join(root, 'agents'), { recursive: true })
    // A junction needs no privilege on Windows; on POSIX the type is ignored and it is a symlink.
    await symlink(join(root, 'shared'), join(root, 'skills', 'link-b'), 'junction')
    // File links need a privilege on Windows; the agent assertion runs where they can be made.
    const agentLinked = await symlink(
      join(root, 'shared-agents', 'ag.md'),
      join(root, 'agents', 'linked.md'),
      'file'
    ).then(
      () => true,
      () => false
    )
    await symlink(join(root, 'gone'), join(root, 'skills', 'dangling'), 'junction')

    const { contents } = await readClaudePluginFolder(root)

    expect(contents.skills).toEqual(['folder-a', 'link-b'])
    expect(contents.agents).toEqual(agentLinked ? ['linked-agent'] : [])
  })

  it('reads .mcp.json in addition to servers the manifest declares', async () => {
    base = await mkdtemp(join(tmpdir(), 'orca-plugin-inventory-'))
    const inline = join(base, 'inline')
    await file(
      join(inline, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'p', mcpServers: { fromManifest: { command: 'x' } } })
    )
    await file(join(inline, '.mcp.json'), JSON.stringify({ mcpServers: { fromFile: {} } }))
    const byPath = join(base, 'by-path')
    await file(
      join(byPath, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'p', mcpServers: './other.mcp.json' })
    )
    await file(join(byPath, 'other.mcp.json'), JSON.stringify({ mcpServers: { fromOther: {} } }))
    await file(join(byPath, '.mcp.json'), JSON.stringify({ mcpServers: { fromDefault: {} } }))

    expect((await readClaudePluginFolder(inline)).contents.mcpServers).toEqual([
      'fromFile',
      'fromManifest'
    ])
    expect((await readClaudePluginFolder(byPath)).contents.mcpServers).toEqual([
      'fromDefault',
      'fromOther'
    ])
  })

  it('reads a bare server map and reports a vanished folder', async () => {
    base = await mkdtemp(join(tmpdir(), 'orca-plugin-inventory-'))
    await file(
      join(base, 'plugin', '.mcp.json'),
      JSON.stringify({ playwright: { command: 'npx' } })
    )

    expect((await readClaudePluginFolder(join(base, 'plugin'))).contents.mcpServers).toEqual([
      'playwright'
    ])
    expect((await readClaudePluginFolder(join(base, 'gone'))).problem).toBe('missing-folder')
  })
})
