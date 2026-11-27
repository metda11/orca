import type { ClaudeAgentProfile } from './agent-profile-types'

export type ClaudeProfileLaunchFiles = {
  /** Where the caller writes `settings.content`; Claude reads it through `--settings`. */
  settingsPath: string
  /** Where the caller writes `mcpConfig.content`; Claude reads it through `--mcp-config`. */
  mcpConfigPath: string
}

export type ClaudeProfileLaunch = {
  argv: string[]
  settings: { content: string } | null
  mcpConfig: { content: string } | null
}

/**
 * Translate a profile into Claude CLI argv plus the two files that argv points at. Paths are
 * inputs, never inlined JSON, so quoting stays shell-neutral and remote hosts can write the files themselves.
 */
export function buildClaudeProfileLaunch(
  profile: ClaudeAgentProfile,
  options: { installedPluginIds: readonly string[]; files: ClaudeProfileLaunchFiles }
): ClaudeProfileLaunch {
  const argv: string[] = []

  let settings: ClaudeProfileLaunch['settings'] = null
  if (profile.enabledPlugins) {
    const enabled = new Set(profile.enabledPlugins)
    const enabledPlugins: Record<string, boolean> = {}
    for (const id of options.installedPluginIds) {
      enabledPlugins[id] = enabled.has(id)
    }
    for (const id of enabled) {
      enabledPlugins[id] = true
    }
    settings = { content: JSON.stringify({ enabledPlugins }) }
    argv.push('--settings', options.files.settingsPath)
  }
  for (const dir of profile.pluginDirs ?? []) {
    argv.push('--plugin-dir', dir)
  }

  let mcpConfig: ClaudeProfileLaunch['mcpConfig'] = null
  if (profile.mcpServers) {
    mcpConfig = { content: JSON.stringify({ mcpServers: profile.mcpServers }) }
    argv.push('--mcp-config', options.files.mcpConfigPath, '--strict-mcp-config')
  }

  if (profile.model) {
    argv.push('--model', profile.model)
  }
  if (profile.permissionMode && profile.permissionMode !== 'default') {
    argv.push('--permission-mode', profile.permissionMode)
  }
  if (profile.allowedTools?.length) {
    argv.push('--allowedTools', profile.allowedTools.join(','))
  }
  if (profile.disallowedTools?.length) {
    argv.push('--disallowedTools', profile.disallowedTools.join(','))
  }
  if (profile.appendSystemPrompt) {
    argv.push('--append-system-prompt', profile.appendSystemPrompt)
  }
  return { argv, settings, mcpConfig }
}
