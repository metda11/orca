import type { ClaudeAgentProfile } from './agent-profile-types'

/**
 * Templates shipped with Orca. Each is copied once into the user's profiles; changing a template here
 * marks untouched copies as outdated instead of rewriting them.
 */
export const DEFAULT_AGENT_PROFILES: readonly ClaudeAgentProfile[] = [
  { id: 'orca-plan', name: 'Plan only', permissionMode: 'plan' },
  {
    id: 'orca-review',
    name: 'Review (no edits)',
    disallowedTools: ['Edit', 'Write', 'NotebookEdit']
  }
]
