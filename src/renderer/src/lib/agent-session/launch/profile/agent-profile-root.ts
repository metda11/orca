let agentProfileRoot: string | null = null

/** Planning is synchronous, so the folder is fetched once at startup. */
export async function primeAgentProfileRoot(): Promise<void> {
  try {
    agentProfileRoot = (await window.api.app.getAgentProfileRoot()) || null
  } catch {
    agentProfileRoot = null
  }
}

export function readAgentProfileRoot(): string | null {
  return agentProfileRoot
}
