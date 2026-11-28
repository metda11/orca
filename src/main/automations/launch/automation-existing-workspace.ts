import { parseWorkspaceKey } from '../../../shared/workspace/identity/workspace-scope'
import {
  getRepoExecutionHostId,
  parseExecutionHostId
} from '../../../shared/execution-host/execution-host'
import { automationRunFailure } from '../../../shared/automations/history/automation-run-failure-copy'
import type { Automation } from '../../../shared/automations/automation-definition'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import { AutomationDispatchRefusedError } from '../dispatch/automation-launch-runner'
import type { AutomationRepoRunTarget } from '../ownership/run-target-resolution'

/** A missing workspace or one owned by a paired server is a typed skip, never a fresh local launch. */
export async function resolveLocalExistingWorkspace(
  runtime: OrcaRuntimeService,
  automation: Automation,
  target: AutomationRepoRunTarget
) {
  const unavailable = new AutomationDispatchRefusedError(automationRunFailure('targetUnavailable'))
  const selected = await runtime
    .resolveManagedTerminalWorkspaceTarget(
      `id:${requireWorkspaceId(automation)}`,
      parseWorkspaceKey(automation.workspaceId ?? '')?.type === 'folder'
        ? undefined
        : getRepoExecutionHostId(target.repo),
      false
    )
    .catch((error: unknown) => {
      throw error instanceof Error && error.message === 'selector_not_found' ? unavailable : error
    })
  const hostId = selected.scope.folderWorkspace?.executionHostId ?? selected.managedWorktree?.hostId
  if (!selected.managedWorktree || parseExecutionHostId(hostId)?.kind === 'runtime') {
    throw unavailable
  }
  return selected
}

export function requireWorkspaceId(automation: Automation): string {
  if (!automation.workspaceId) {
    throw new Error('The target workspace is no longer available.')
  }
  return automation.workspaceId
}
