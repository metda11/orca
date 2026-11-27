import type { Automation } from '../../../shared/automations/automation-definition'
import type { AutomationRun } from '../../../shared/automations/history/automation-run'

/** The folder a run occupies; null when each run gets its own workspace (or a bot's folder). */
function occupiedFolder(automation: Automation): string | null {
  return automation.workspaceMode === 'existing' && !automation.bot ? automation.workspaceId : null
}

/** True while another run of an automation on the same existing folder is starting or running. */
export function automationFolderBusy(input: {
  automations: readonly Automation[]
  runs: readonly AutomationRun[]
  automation: Automation
  runId: string
}): boolean {
  const folder = occupiedFolder(input.automation)
  if (!folder) {
    return false
  }
  const sameFolder = new Set(
    input.automations.filter((entry) => occupiedFolder(entry) === folder).map((entry) => entry.id)
  )
  return input.runs.some(
    (run) =>
      run.id !== input.runId &&
      sameFolder.has(run.automationId) &&
      (run.status === 'dispatching' || run.status === 'dispatched')
  )
}
