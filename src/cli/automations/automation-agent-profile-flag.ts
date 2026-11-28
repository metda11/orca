import { isSafeAgentProfileId } from '../../shared/agent-profile/claude-profile-files'
import { RuntimeClientError } from '../runtime/connection/types'

/** A profile id; an explicit empty value (`--agent-profile=`) is null, which clears the saved one. */
export function getAgentProfileFlag(
  flags: Map<string, string | boolean>
): string | null | undefined {
  if (!flags.has('agent-profile')) {
    return undefined
  }
  const value = flags.get('agent-profile')
  if (typeof value !== 'string') {
    throw new RuntimeClientError(
      'invalid_argument',
      '--agent-profile requires a profile id; use --agent-profile= to clear'
    )
  }
  if (value === '') {
    return null
  }
  if (!isSafeAgentProfileId(value)) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--agent-profile takes a profile id of letters, digits, - and _ (at most 64)'
    )
  }
  return value
}
