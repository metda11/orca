import { describe, expect, it, vi } from 'vitest'
import type { Automation } from '../../../shared/automations/automation-definition'
import type {
  AutomationDispatchResult,
  AutomationPrecheckResult,
  AutomationRun,
  AutomationRunTrigger
} from '../../../shared/automations/history/automation-run'
import { runAutomationLaunch, type AutomationLaunchContext } from './automation-launch-runner'

function precheck(exitCode: number | null, stdout = ''): AutomationPrecheckResult {
  return {
    command: 'board-has-work',
    exitCode,
    timedOut: false,
    durationMs: 5,
    stdout,
    stderr: '',
    stdoutTruncated: false,
    stderrTruncated: false,
    error: null,
    startedAt: 1,
    completedAt: 6
  }
}

function launchWith(trigger: AutomationRunTrigger, result: AutomationPrecheckResult) {
  const transitions: Omit<AutomationDispatchResult, 'runId'>[] = []
  const dispatcher = vi.fn(async () => ({ workspaceId: 'w1', terminalSessionId: 't1' }))
  const runPrecheck = vi.fn(async () => result)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial fixture; the code under test reads only these fields
  const ctx = {
    automation: { id: 'a1', workspaceId: 'w1', precheck: { command: 'x', timeoutSeconds: 5 } },
    run: { id: 'r1', trigger },
    target: { ok: true },
    dispatcher,
    transition: (next: Omit<AutomationDispatchResult, 'runId'>) => {
      transitions.push(next)
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial fixture; the code under test only returns this run
      return { applied: true, run: Promise.resolve({ id: 'r1' } as AutomationRun) }
    },
    runPrecheck,
    markDispatchResult: vi.fn(),
    watchRun: vi.fn()
  } as unknown as AutomationLaunchContext & { automation: Automation }
  return { ctx, transitions, dispatcher, runPrecheck }
}

describe('runAutomationLaunch precheck outcome', () => {
  it('skips with the printed reason on exit 1 and starts no agent', async () => {
    const { ctx, transitions, dispatcher } = launchWith('scheduled', precheck(1, 'board is empty'))
    await runAutomationLaunch(ctx)
    expect(transitions).toHaveLength(1)
    expect(transitions[0]).toMatchObject({
      status: 'skipped_precheck',
      error: 'Precheck skipped the run: board is empty'
    })
    expect(dispatcher).not.toHaveBeenCalled()
  })

  it('records a failed run on any other exit code and starts no agent', async () => {
    const { ctx, transitions, dispatcher } = launchWith('scheduled', precheck(2))
    await runAutomationLaunch(ctx)
    expect(transitions[0]).toMatchObject({
      status: 'dispatch_failed',
      error: 'Precheck exited with code 2.'
    })
    expect(dispatcher).not.toHaveBeenCalled()
  })

  it('starts the agent on exit 0, also for a manual run', async () => {
    const { ctx, dispatcher, runPrecheck } = launchWith('manual', precheck(0))
    await runAutomationLaunch(ctx)
    expect(runPrecheck).toHaveBeenCalledTimes(1)
    expect(dispatcher).toHaveBeenCalledTimes(1)
  })

  it('skips the precheck for an event run', async () => {
    const { ctx, dispatcher, runPrecheck } = launchWith('event', precheck(2))
    await runAutomationLaunch(ctx)
    expect(runPrecheck).not.toHaveBeenCalled()
    expect(dispatcher).toHaveBeenCalledTimes(1)
  })
})
