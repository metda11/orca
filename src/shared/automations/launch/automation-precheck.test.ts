import { describe, expect, it } from 'vitest'
import type { AutomationPrecheckResult } from '../history/automation-run'
import {
  automationTriggerRunsPrecheck,
  formatAutomationPrecheckSkip,
  getAutomationPrecheckOutcome
} from './automation-precheck'

function precheckResult(overrides: Partial<AutomationPrecheckResult>): AutomationPrecheckResult {
  return {
    command: 'board-has-work',
    exitCode: 0,
    timedOut: false,
    durationMs: 10,
    stdout: '',
    stderr: '',
    stdoutTruncated: false,
    stderrTruncated: false,
    error: null,
    startedAt: 1,
    completedAt: 11,
    ...overrides
  }
}

describe('getAutomationPrecheckOutcome', () => {
  it('starts on exit 0, skips on exit 1, fails on every other result', () => {
    expect(getAutomationPrecheckOutcome(precheckResult({ exitCode: 0 }))).toBe('pass')
    expect(getAutomationPrecheckOutcome(precheckResult({ exitCode: 1 }))).toBe('skip')
    expect(getAutomationPrecheckOutcome(precheckResult({ exitCode: 2 }))).toBe('fail')
    expect(getAutomationPrecheckOutcome(precheckResult({ exitCode: 127 }))).toBe('fail')
    expect(getAutomationPrecheckOutcome(precheckResult({ exitCode: null }))).toBe('fail')
    expect(getAutomationPrecheckOutcome(precheckResult({ exitCode: null, timedOut: true }))).toBe(
      'fail'
    )
    expect(getAutomationPrecheckOutcome(precheckResult({ exitCode: 1, error: 'spawn' }))).toBe(
      'fail'
    )
  })
})

describe('formatAutomationPrecheckSkip', () => {
  it('names the first line the precheck printed as the reason', () => {
    expect(
      formatAutomationPrecheckSkip(
        precheckResult({ exitCode: 1, stdout: '\nboard is empty\nmore' })
      )
    ).toBe('Precheck skipped the run: board is empty')
    expect(
      formatAutomationPrecheckSkip(precheckResult({ exitCode: 1, stderr: 'nothing ready' }))
    ).toBe('Precheck skipped the run: nothing ready')
    expect(formatAutomationPrecheckSkip(precheckResult({ exitCode: 1 }))).toBe(
      'Precheck skipped the run (exit code 1).'
    )
  })
})

describe('automationTriggerRunsPrecheck', () => {
  it('covers scheduled and manual runs but not event runs', () => {
    expect(automationTriggerRunsPrecheck('scheduled')).toBe(true)
    expect(automationTriggerRunsPrecheck('manual')).toBe(true)
    expect(automationTriggerRunsPrecheck('event')).toBe(false)
  })
})
