import { closeTestStores, createStore, testState } from '../persistence/persistence-test-harness'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AutomationService } from './automation-service'

vi.mock('electron', () => ({
  app: {
    getPath: () => testState.dir
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`encrypted:${plaintext}`, 'utf-8'),
    decryptString: (ciphertext: Buffer) => ciphertext.toString('utf-8').slice('encrypted:'.length)
  }
}))

async function setup(opts: { usageLimitHoldUntil?: () => Promise<number | null> } = {}) {
  const store = await createStore()
  store.addRepo({ id: 'r1', path: '/repo', displayName: 'test', badgeColor: '#fff', addedAt: 1 })
  const create = (name: string) =>
    store.createAutomation({
      name,
      prompt: 'Check',
      agentId: 'claude',
      projectId: 'r1',
      workspaceMode: 'existing',
      workspaceId: 'r1::wt1',
      timezone: 'UTC',
      rrule: '0 0 1 1 *',
      dtstart: new Date('2026-11-09T00:00:00Z').getTime()
    })
  const launch = vi.fn(async () => ({ workspaceId: 'r1::wt1', terminalSessionId: 'tab-1' }))
  const service = new AutomationService(store, {
    terminalLauncher: { launch, available: () => true },
    ...opts
  })
  const statusOf = (automationId: string, runId: string) =>
    store.listAutomationRuns(automationId).find((run) => run.id === runId)?.status
  return { service, create, launch, statusOf }
}

describe('held automation runs', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-automations-holds-test-'))
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval'] })
    vi.setSystemTime(new Date('2026-11-09T08:00:00Z'))
  })

  afterEach(async () => {
    await closeTestStores()
    vi.useRealTimers()
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('lets a second run in the same folder wait until the first one ends', async () => {
    const { service, create, launch, statusOf } = await setup()
    const first = create('First')
    const second = create('Second')

    const firstRun = await service.runNow(first.id)
    await vi.advanceTimersByTimeAsync(10)
    const secondRun = await service.runNow(second.id)
    await vi.advanceTimersByTimeAsync(10)

    expect(statusOf(first.id, firstRun.id)).toBe('dispatched')
    expect(statusOf(second.id, secondRun.id)).toBe('pending')
    expect(launch).toHaveBeenCalledTimes(1)

    await service.markDispatchResult({ runId: firstRun.id, status: 'completed' })
    await vi.advanceTimersByTimeAsync(10)

    expect(statusOf(second.id, secondRun.id)).toBe('dispatched')
    expect(launch).toHaveBeenCalledTimes(2)
    service.stop()
  })

  it('keeps a run pending until the account limit resets, then starts it', async () => {
    const resetAt = Date.now() + 3_600_000
    const usageLimitHoldUntil = vi.fn(async () => (Date.now() < resetAt ? resetAt : null))
    const { service, create, launch, statusOf } = await setup({ usageLimitHoldUntil })
    const automation = create('Limited')

    const run = await service.runNow(automation.id)
    await vi.advanceTimersByTimeAsync(3_000_000)
    expect(statusOf(automation.id, run.id)).toBe('pending')
    expect(launch).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(700_000)
    expect(statusOf(automation.id, run.id)).toBe('dispatched')
    expect(launch).toHaveBeenCalledTimes(1)
    service.stop()
  })
})
