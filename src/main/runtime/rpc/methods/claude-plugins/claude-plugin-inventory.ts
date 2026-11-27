import { isAbsolute } from 'node:path'
import { defineMethod, type RpcContext } from '../../core'
import { ClaudePluginInventoryParams } from '../../../../../shared/rpc-contract/claude-plugins/claude-plugin-inventory-params'
import { parseExecutionHostId } from '../../../../../shared/execution-host/execution-host'
import { parseWslUncPath } from '../../../../../shared/file-access/wsl-paths'
import { readClaudePluginInventory } from '../../../../claude/plugin-inventory/claude-plugin-inventory'
import { readClaudePluginWeights } from '../../../../claude/context-weight/claude-plugin-weight-service'
import {
  assertWslUncPathRunning,
  wslDistroForPath
} from '../../../../wsl/filesystem/wsl-unc-access-gate'

type ClaudePluginReadRequest = {
  accountHomePath: string | null
  cwd: string | null
  refresh: boolean
  wslDistro: string | null
}

export async function claudePluginReadRequest(
  params: {
    worktreeId?: string
    cwd?: string
    accountHomePath?: string
    refresh?: boolean
  },
  runtime: RpcContext['runtime']
): Promise<ClaudePluginReadRequest> {
  let cwd = params.cwd?.trim() || null
  // A workspace named by id is read on the host that runs it, like skill discovery.
  if (!cwd && params.worktreeId) {
    const target = await runtime.resolveRuntimeFileTarget(`id:${params.worktreeId}`)
    // SSH is refused on purpose, as `skills.discover` does: the remote home and plugin folders are
    // not on this host, and reading them needs a relay call that does not exist yet.
    if (parseExecutionHostId(target.executionHostId)?.kind === 'ssh') {
      throw new Error('The Claude plugin inventory is unavailable for SSH hosts.')
    }
    cwd = target.worktree.path
  }
  const accountHomePath = params.accountHomePath?.trim() || null
  const cwdDistro = cwd ? wslDistroForPath(cwd) : null
  const accountDistro = accountHomePath ? wslDistroForPath(accountHomePath) : null
  const wslDistro = cwdDistro ?? accountDistro
  // A distro's UNC path is absolute on Windows; the check is for host paths.
  if (
    (cwd && !cwdDistro && !isAbsolute(cwd)) ||
    (accountHomePath && !accountDistro && !isAbsolute(accountHomePath))
  ) {
    throw new Error('The Claude plugin inventory needs absolute folders.')
  }
  // The Windows account's folder says nothing about a distro's Claude (and the reverse), so a mix is refused.
  if (
    (cwd && Boolean(cwdDistro) !== Boolean(wslDistro)) ||
    (accountHomePath && Boolean(accountDistro) !== Boolean(wslDistro)) ||
    (cwdDistro && accountDistro && cwdDistro.toLowerCase() !== accountDistro.toLowerCase())
  ) {
    throw new Error(
      'The workspace and the Claude account folder must both be on this host or in the same WSL distribution.'
    )
  }
  if (wslDistro) {
    // Passive callers must not boot a stopped distro; this throws instead.
    await assertWslUncPathRunning('', wslDistro)
  }
  return {
    // Inside a distro the folders are its own Linux paths.
    accountHomePath: wslDistro && accountHomePath ? wslLinuxPath(accountHomePath) : accountHomePath,
    cwd: wslDistro && cwd ? wslLinuxPath(cwd) : cwd,
    refresh: params.refresh === true,
    wslDistro
  }
}

function wslLinuxPath(uncPath: string): string {
  return parseWslUncPath(uncPath)?.linuxPath ?? uncPath
}

// The weights are measured by this host's `claude` CLI against the account folder, which does not
// reach into a distro; refuse instead of weighing the Windows account's plugins for a WSL workspace.
async function claudePluginWeightRequest(
  params: Parameters<typeof claudePluginReadRequest>[0],
  runtime: RpcContext['runtime']
) {
  const request = await claudePluginReadRequest(params, runtime)
  if (request.wslDistro) {
    throw new Error('The Claude plugin weights are unavailable for WSL workspaces.')
  }
  return request
}

export const CLAUDE_PLUGIN_METHODS = [
  defineMethod({
    name: 'claudePlugins.inventory',
    permission: 'workspace',
    params: ClaudePluginInventoryParams,
    handler: async (params, { runtime }) =>
      readClaudePluginInventory(await claudePluginReadRequest(params, runtime))
  }),
  // Answers from the cache at once; plugins not yet measured come back as pending, so callers poll.
  defineMethod({
    name: 'claudePlugins.weights',
    permission: 'workspace',
    params: ClaudePluginInventoryParams,
    handler: async (params, { runtime }) =>
      readClaudePluginWeights(await claudePluginWeightRequest(params, runtime))
  })
]
