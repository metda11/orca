import type { AutomationPrecheck } from '../automation-definition'
import type { AutomationPrecheckResult } from '../history/automation-run'

export const DEFAULT_AUTOMATION_PRECHECK_TIMEOUT_SECONDS = 60
export const MAX_AUTOMATION_PRECHECK_TIMEOUT_SECONDS = 600
export const MAX_AUTOMATION_PRECHECK_OUTPUT_CHARS = 4000

export function normalizeAutomationPrecheckTimeoutSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_AUTOMATION_PRECHECK_TIMEOUT_SECONDS
  }
  return Math.min(MAX_AUTOMATION_PRECHECK_TIMEOUT_SECONDS, Math.max(1, Math.floor(value)))
}

export function normalizeAutomationPrecheck(
  precheck: AutomationPrecheck | null | undefined
): AutomationPrecheck | null {
  const command = typeof precheck?.command === 'string' ? precheck.command.trim() : ''
  if (!command) {
    return null
  }
  return {
    command,
    timeoutSeconds: normalizeAutomationPrecheckTimeoutSeconds(precheck?.timeoutSeconds)
  }
}

export function formatAutomationPrecheckTimeout(seconds: number): string {
  return `${seconds}s`
}

export function didAutomationPrecheckPass(
  result: AutomationPrecheckResult | null | undefined
): boolean {
  return Boolean(result && !result.timedOut && !result.error && result.exitCode === 0)
}

export function formatAutomationPrecheckFailure(result: AutomationPrecheckResult): string {
  if (result.timedOut) {
    return `Precheck timed out after ${formatAutomationPrecheckTimeout(
      Math.max(1, Math.round(result.durationMs / 1000))
    )}.`
  }
  if (result.error) {
    return `Precheck failed: ${result.error}`
  }
  return `Precheck exited with code ${result.exitCode ?? 'unknown'}.`
}

export type AutomationPrecheckOutcome = 'pass' | 'skip' | 'fail'

/** Exit 0 starts the run, exit 1 skips it on purpose, anything else (other code, timeout, spawn error) is a failure. */
export function getAutomationPrecheckOutcome(
  result: AutomationPrecheckResult
): AutomationPrecheckOutcome {
  if (didAutomationPrecheckPass(result)) {
    return 'pass'
  }
  return !result.timedOut && !result.error && result.exitCode === 1 ? 'skip' : 'fail'
}

/** Scheduled and manual runs consult the precheck; an event run starts as the event says. */
export function automationTriggerRunsPrecheck(trigger: 'scheduled' | 'manual' | 'event'): boolean {
  return trigger !== 'event'
}

const MAX_PRECHECK_SKIP_REASON_CHARS = 200

/** The skip reason is the first line the precheck printed, so the script says why it declined. */
export function formatAutomationPrecheckSkip(result: AutomationPrecheckResult): string {
  const reason = [result.stdout, result.stderr]
    .map(
      (text) =>
        text
          .split(/\r?\n/)
          .find((line) => line.trim() !== '')
          ?.trim() ?? ''
    )
    .find((line) => line !== '')
  return reason
    ? `Precheck skipped the run: ${reason.slice(0, MAX_PRECHECK_SKIP_REASON_CHARS)}`
    : 'Precheck skipped the run (exit code 1).'
}
