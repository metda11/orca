export type AgentProfilePreflightRequest = {
  profileId: string
  /** The workspace the agent starts in; its `.mcp.json`, settings and agents are part of the check. */
  cwd?: string
  /** The agent arguments of the start, read only for `--agent`. */
  agentArgs?: string
}
