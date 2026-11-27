import { defineMethod } from '../../core'
import { ClaudePluginInventoryParams } from '../../../../../shared/rpc-contract/claude-plugins/claude-plugin-inventory-params'
import { parseExecutionHostId } from '../../../../../shared/execution-host/execution-host'
import { readClaudePluginInventory } from '../../../../claude/plugin-inventory/claude-plugin-inventory'
import { wslDistroForPath } from '../../../../wsl/filesystem/wsl-unc-access-gate'

export const CLAUDE_PLUGIN_METHODS = [
  defineMethod({
    name: 'claudePlugins.inventory',
    permission: 'workspace',
    params: ClaudePluginInventoryParams,
    handler: async (params, { runtime }) => {
      let cwd = params.cwd?.trim() || null
      // A workspace named by id is read on the host that runs it, like skill discovery.
      if (!cwd && params.worktreeId) {
        const target = await runtime.resolveRuntimeFileTarget(`id:${params.worktreeId}`)
        if (parseExecutionHostId(target.executionHostId)?.kind === 'ssh') {
          throw new Error('The Claude plugin inventory is unavailable for SSH hosts.')
        }
        cwd = target.worktree.path
      }
      // A WSL workspace runs Claude with the distro's own config folder, which this read does not reach yet.
      if (cwd && wslDistroForPath(cwd)) {
        throw new Error('The Claude plugin inventory is unavailable for WSL workspaces.')
      }
      return readClaudePluginInventory({
        accountHomePath: params.accountHomePath ?? null,
        cwd,
        refresh: params.refresh === true
      })
    }
  })
]
