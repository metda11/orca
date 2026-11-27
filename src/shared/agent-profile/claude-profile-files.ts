import type { ClaudeProfileLaunchFiles } from './claude-profile-launch-args'

const PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export function isSafeAgentProfileId(id: string): boolean {
  return PROFILE_ID_PATTERN.test(id)
}

/** Deterministic per-profile file locations, so a synchronous planner can name them before the host writes them. */
export function claudeProfileLaunchFiles(
  rootDir: string,
  profileId: string
): ClaudeProfileLaunchFiles {
  if (!isSafeAgentProfileId(profileId)) {
    throw new Error('agent_profile_id_invalid')
  }
  const separator = rootDir.includes('\\') && !rootDir.includes('/') ? '\\' : '/'
  const base = `${rootDir.replace(/[\\/]+$/, '')}${separator}agent-profiles${separator}${profileId}${separator}`
  return { settingsPath: `${base}settings.json`, mcpConfigPath: `${base}mcp.json` }
}
