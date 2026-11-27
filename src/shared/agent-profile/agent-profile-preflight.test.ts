import { describe, expect, it } from 'vitest'
import {
  claudeAgentFromArgs,
  evaluateClaudeProfilePreflight,
  mcpServerOfToolName
} from './agent-profile-preflight'

describe('mcpServerOfToolName', () => {
  it('reads the server out of the three tool name shapes', () => {
    expect(mcpServerOfToolName('mcp__github__create_issue')).toBe('github')
    expect(mcpServerOfToolName('mcp__github')).toBe('github')
    expect(mcpServerOfToolName('mcp__github__*')).toBe('github')
    expect(mcpServerOfToolName('Bash(git:*)')).toBeNull()
  })
})

describe('claudeAgentFromArgs', () => {
  it('finds --agent in either form and lets the last one win', () => {
    expect(claudeAgentFromArgs('--model x --agent reviewer')).toBe('reviewer')
    expect(claudeAgentFromArgs('--agent=a --agent "b c"')).toBe('b c')
    expect(claudeAgentFromArgs('--agentic x')).toBeUndefined()
    expect(claudeAgentFromArgs(undefined)).toBeUndefined()
  })
})

describe('evaluateClaudeProfilePreflight', () => {
  it('flags an MCP server with neither command nor url', () => {
    const findings = evaluateClaudeProfilePreflight(
      { id: 'p', name: 'P', mcpServers: { broken: { type: 'stdio' } } },
      {
        plugins: [],
        workspaceMcpServers: [],
        folderAgents: [],
        isEnvSet: () => true,
        pathExists: () => true,
        sideloadDisabled: false
      }
    )
    expect(findings).toMatchObject([{ code: 'mcp_server_invalid', subject: 'broken' }])
  })
})
