/** What a pane header shows: the profile that started the agent now running in it. */
export type ProfilePaneBinding = {
  runId: string
  profileId: string
  profileName: string
  /** Claude session id the pane's first hook event reported; null until then. */
  sessionId: string | null
}

/**
 * The chip names the profile unless the pane already reports a different Claude session than the
 * one the run is bound to (a plain `claude` started in the same shell afterwards).
 */
export function shouldShowProfileChip(
  binding: ProfilePaneBinding | undefined,
  liveSessionId: string | undefined
): binding is ProfilePaneBinding {
  if (!binding) {
    return false
  }
  return !(binding.sessionId && liveSessionId && binding.sessionId !== liveSessionId)
}
