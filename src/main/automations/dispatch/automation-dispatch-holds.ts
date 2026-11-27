import type { Automation } from '../../../shared/automations/automation-definition'
import {
  isFinalAutomationRunStatus,
  type AutomationRun
} from '../../../shared/automations/history/automation-run'
import type { TuiAgent } from '../../../shared/agent-launch/catalog/tui-agent'
import type { AutomationRunWriter } from '../run-history/run-writer'
import type { AutomationRunTargetResult } from '../ownership/run-target-resolution'
import type { AutomationDispatchHold } from './automation-dispatch-request'

/** The time the agent's account resets when its usage limit is used up; null when it may start. */
export type AutomationUsageLimitHold = (agentId: TuiAgent) => Promise<number | null>

export type HeldAutomationRun = {
  automation: Automation
  run: AutomationRun
  target: AutomationRunTargetResult
  generation: number
  hold: AutomationDispatchHold
}

// Node clamps longer timers to 1ms.
const MAX_TIMER_MS = 2_147_483_647
// A reset moment read from a provider can be a second early.
const RESET_SLACK_MS = 2_000

/** Pending runs that wait for an account reset (a timer) or for a folder (a finished run). */
export class AutomationDispatchHolds {
  private readonly held = new Map<string, HeldAutomationRun>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly relaunch: (entry: HeldAutomationRun) => void,
    private readonly usageLimitHoldUntil: AutomationUsageLimitHold = async () => null
  ) {}

  /** What a dispatch of this generation needs to hold a run. */
  dispatchContext(generation: number) {
    return {
      usageLimitHoldUntil: (automation: Automation) => this.usageLimitHoldUntil(automation.agentId),
      holdRun: (
        automation: Automation,
        run: AutomationRun,
        target: AutomationRunTargetResult,
        hold: AutomationDispatchHold
      ) => this.hold({ automation, run, target, generation, hold })
    }
  }

  hold(entry: HeldAutomationRun): void {
    this.release(entry.run.id)
    this.held.set(entry.run.id, entry)
    if (entry.hold.kind !== 'usage-limit') {
      return
    }
    const delay = Math.min(
      MAX_TIMER_MS,
      Math.max(0, entry.hold.retryAt - Date.now()) + RESET_SLACK_MS
    )
    const timer = setTimeout(() => {
      this.timers.delete(entry.run.id)
      if (this.held.delete(entry.run.id)) {
        this.relaunch(entry)
      }
    }, delay)
    timer.unref?.()
    this.timers.set(entry.run.id, timer)
  }

  /** A run ended, so folders it occupied are free again; the oldest held run claims first. */
  retryFolderHolds(): void {
    for (const [runId, entry] of Array.from(this.held)) {
      if (entry.hold.kind === 'folder') {
        this.held.delete(runId)
        this.relaunch(entry)
      }
    }
  }

  /** A run that ends frees its folder, so the writer retries the runs that wait on one. */
  releasingFolderHolds(writer: AutomationRunWriter): AutomationRunWriter {
    return {
      ...writer,
      updateRun: async (result) => {
        const run = await writer.updateRun(result)
        if (isFinalAutomationRunStatus(run.status)) {
          this.retryFolderHolds()
        }
        return run
      }
    }
  }

  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
    this.held.clear()
  }

  private release(runId: string): void {
    const timer = this.timers.get(runId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(runId)
    }
    this.held.delete(runId)
  }
}
