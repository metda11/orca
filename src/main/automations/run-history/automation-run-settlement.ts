import type { AutomationUsageClient } from '../../../shared/backend/backend-service-contract'
import {
  isFinalAutomationRunStatus,
  type AutomationDispatchResult,
  type AutomationRun
} from '../../../shared/automations/history/automation-run'
import type { Store } from '../../persistence/loading-store/store'
import { clearAutomationDispatchTokens } from '../ownership/dispatch-tokens'
import type { AutomationRunCompletionWatcher } from '../observation/run-completion-watcher'
import type { AutomationRunWriter } from './run-writer'
import { writeAutomationRunUsage } from './run-usage-collection'

/** Record a dispatch result, then start or stop watching the run and collect its usage once it is final. */
export async function settleAutomationDispatchResult(
  deps: {
    store: Store
    runs: AutomationRunWriter
    completionWatcher: AutomationRunCompletionWatcher | null
    claudeUsage: AutomationUsageClient | null
    codexUsage: AutomationUsageClient | null
  },
  result: AutomationDispatchResult
): Promise<AutomationRun> {
  const { completionWatcher, ...usageDeps } = deps
  const run = await deps.runs.updateRun(result)
  clearAutomationDispatchTokens(run.automationId, run.id)
  if (!isFinalAutomationRunStatus(run.status)) {
    if (run.status === 'dispatched') {
      completionWatcher?.watch(run)
    }
    return run
  }
  completionWatcher?.forget(run.id)
  // Duplicate completion effects must not recalculate usage with a later attribution window.
  if (run.usage) {
    return run
  }
  return await writeAutomationRunUsage({ ...usageDeps, run })
}
