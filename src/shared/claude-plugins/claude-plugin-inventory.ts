/** Where Claude found a plugin: an install record's scope, or the org sync of the signed-in account. */
export type ClaudePluginInventoryScope = 'user' | 'project' | 'local' | 'synced'

/** What one plugin folder brings; names are the plugin's own, without the `<plugin>:` namespace. */
export type ClaudePluginContents = {
  skills: string[]
  agents: string[]
  commands: string[]
  mcpServers: string[]
}

export type ClaudePluginInventoryEntry = ClaudePluginContents & {
  /** `<name>@<marketplace>`, as in `enabledPlugins` and `claude plugin list`. */
  id: string
  /** The manifest name Claude namespaces skills and servers by. */
  name: string
  marketplace: string
  scope: ClaudePluginInventoryScope
  enabled: boolean
  version?: string
  description?: string
  installPath: string
  /** Declared plugin ids, qualified the way the CLI resolves them (bare = own marketplace). */
  dependencies: string[]
  /** Set when the folder or its manifest could not be read; contents are then empty. */
  problem?: 'missing-folder' | 'unreadable-manifest'
}

export type ClaudePluginInventory = {
  /** The Claude config folder the inventory was read from (the account's `CLAUDE_CONFIG_DIR`). */
  configDir: string
  cwd: string | null
  plugins: ClaudePluginInventoryEntry[]
  /** Servers of the workspace's `.mcp.json`, which every session there loads besides the plugins. */
  workspaceMcpServers: string[]
  readAt: number
}
