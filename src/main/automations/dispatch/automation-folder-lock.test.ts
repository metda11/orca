import { describe, expect, it } from 'vitest'
import type { Automation } from '../../../shared/automations/automation-definition'
import type {
  AutomationRun,
  AutomationRunStatus
} from '../../../shared/automations/history/automation-run'
import { automationFolderBusy } from './automation-folder-lock'

function automation(id: string, overrides: Partial<Automation> = {}): Automation {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial fixture; the code under test reads only these fields
  return { id, workspaceMode: 'existing', workspaceId: 'repo::/work/a', ...overrides } as Automation
}

function run(id: string, automationId: string, status: AutomationRunStatus): AutomationRun {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial fixture; the code under test reads only these fields
  return { id, automationId, status } as AutomationRun
}

describe('automationFolderBusy', () => {
  const automations = [
    automation('one'),
    automation('two'),
    automation('other-folder', { workspaceId: 'repo::/work/b' }),
    automation('fresh', { workspaceMode: 'new_per_run' })
  ]
  const busyFor = (runs: AutomationRun[], automationIndex: number, runId: string) =>
    automationFolderBusy({ automations, runs, automation: automations[automationIndex]!, runId })

  it('waits while another automation runs in the same existing folder', () => {
    expect(busyFor([run('r1', 'one', 'dispatched'), run('r2', 'two', 'pending')], 1, 'r2')).toBe(
      true
    )
  })

  it('counts a run still starting, of the same automation too, but never the run itself', () => {
    const runs = [run('r1', 'one', 'dispatching'), run('r2', 'one', 'pending')]
    expect(busyFor(runs, 0, 'r2')).toBe(true)
    expect(busyFor(runs, 0, 'r1')).toBe(false)
  })

  it('is free once the run finished, on another folder, or with a workspace per run', () => {
    expect(
      busyFor([run('r1', 'one', 'completed'), run('r3', 'other-folder', 'dispatched')], 1, 'r2')
    ).toBe(false)
    expect(busyFor([run('r1', 'one', 'dispatched')], 3, 'r9')).toBe(false)
  })
})
