import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
