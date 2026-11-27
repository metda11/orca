import { describe, expect, it } from 'vitest'
import { ClaudeTranscriptLoadoutAccumulator } from './claude-transcript-loadout'

// Record shapes cut from a real Claude Code terminal transcript; names are shortened and generic.
const REAL_EXCERPT = [
  {
    type: 'attachment',
    attachment: {
      type: 'skill_listing',
      content:
        '- review-tools:review: Review a branch for quality and security.\n' +
        '- review-tools:pr-review: Review a remote PR and post findings.\n' +
        '- anthropic-skills:pdf: Use this skill whenever the user wants to do anything with PDF files.\n' +
        '- init: Initialize a new CLAUDE.md file'
    },
    sessionId: 's1',
    timestamp: '2026-11-27T10:00:00.000Z'
  },
  {
    type: 'attachment',
    attachment: {
      type: 'agent_listing_delta',
      addedTypes: ['Explore', 'general-purpose', 'review-tools:code-reviewer'],
      removedTypes: [],
      isInitial: true
    }
  },
  {
    type: 'attachment',
    attachment: {
      type: 'deferred_tools_delta',
      addedNames: [
        'WebFetch',
        'mcp__claude_ai_Microsoft_Learn__microsoft_docs_search',
        'mcp__plugin_review-tools_lint__run'
      ],
      removedNames: []
    }
  },
  {
    type: 'assistant',
    uuid: 'u1',
    timestamp: '2026-11-27T10:00:05.000Z',
    sessionId: 's1',
    message: {
      id: 'msg_1',
      model: 'claude-sonnet-5-5',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'Skill',
          input: { skill: 'review-tools:review' }
        }
      ]
    }
  },
  {
    type: 'assistant',
    uuid: 'u2',
    timestamp: '2026-11-27T10:00:09.000Z',
    sessionId: 's1',
    message: {
      id: 'msg_2',
      model: 'claude-sonnet-5-5',
      content: [
        { type: 'text', text: 'Starting subagent.' },
        {
          type: 'tool_use',
          id: 'toolu_2',
          name: 'Agent',
          input: { description: 'Review', subagent_type: 'review-tools:code-reviewer' }
        },
        {
          type: 'tool_use',
          id: 'toolu_3',
          name: 'mcp__plugin_review-tools_lint__run',
          input: {}
        }
      ]
    }
  },
  // The same block written again by a later streaming row or a fork copy.
  {
    type: 'assistant',
    uuid: 'u3',
    timestamp: '2026-11-27T10:00:10.000Z',
    sessionId: 's1',
    message: {
      id: 'msg_2',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_3',
          name: 'mcp__plugin_review-tools_lint__run',
          input: {}
        }
      ]
    }
  }
]

function parse(records: unknown[]) {
  const accumulator = new ClaudeTranscriptLoadoutAccumulator()
  for (const record of records) {
    accumulator.feed(JSON.stringify(record))
  }
  return accumulator.result()
}

describe('ClaudeTranscriptLoadoutAccumulator', () => {
  it('reads the listing and the use of a real terminal transcript', () => {
    const { listing, usage } = parse(REAL_EXCERPT)
    expect(listing).toEqual({
      source: 'transcript-listing',
      plugins: ['review-tools'],
      skills: ['anthropic-skills:pdf', 'init', 'review-tools:pr-review', 'review-tools:review'],
      agents: ['Explore', 'general-purpose', 'review-tools:code-reviewer'],
      mcpServers: ['claude_ai_Microsoft_Learn', 'plugin_review-tools_lint']
    })
    expect(usage).toEqual({
      tools: [
        { name: 'Agent', count: 1 },
        { name: 'mcp__plugin_review-tools_lint__run', count: 1 },
        { name: 'Skill', count: 1 }
      ],
      skills: [{ name: 'review-tools:review', count: 1 }],
      subagents: [{ name: 'review-tools:code-reviewer', count: 1 }],
      mcpServers: ['plugin_review-tools_lint']
    })
  })

  it('reports no listing, not an empty one, for a log without listing records', () => {
    const { listing, usage } = parse([REAL_EXCERPT[2], REAL_EXCERPT[3]])
    expect(listing).toBeNull()
    expect(usage.skills).toEqual([{ name: 'review-tools:review', count: 1 }])
  })

  it('prefers the plugin and MCP lists of a stream init frame', () => {
    const { listing } = parse([
      {
        type: 'system',
        subtype: 'init',
        skills: ['review-tools:review'],
        agents: ['Explore'],
        plugins: [{ name: 'review-tools', path: '/x' }],
        mcp_servers: [{ name: 'claude.ai Docs', status: 'connected' }]
      }
    ])
    expect(listing).toEqual({
      source: 'init-frame',
      plugins: ['review-tools'],
      skills: ['review-tools:review'],
      agents: ['Explore'],
      mcpServers: ['claude_ai_Docs']
    })
  })

  it('applies removed agent types and ignores malformed lines', () => {
    const accumulator = new ClaudeTranscriptLoadoutAccumulator()
    accumulator.feed('{"type":"attachment", broken')
    accumulator.feed(
      JSON.stringify({
        type: 'attachment',
        attachment: { type: 'agent_listing_delta', addedTypes: ['a', 'b'] }
      })
    )
    accumulator.feed(
      JSON.stringify({
        type: 'attachment',
        attachment: { type: 'agent_listing_delta', removedTypes: ['a'] }
      })
    )
    expect(accumulator.result().listing?.agents).toEqual(['b'])
  })
})
