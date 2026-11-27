import { describe, expect, it } from 'vitest'
import { createPluginWeightMeter } from './claude-plugin-weight-meter'

const target = (id: string, installPath = `/p/${id}`) => ({ id, installPath })

describe('createPluginWeightMeter', () => {
  it('answers pending at once, measures each plugin once and then serves the cache', async () => {
    const calls: string[] = []
    let settledCount = 0
    let finish!: () => void
    const settled = new Promise<void>((resolve) => (finish = resolve))
    const meter = createPluginWeightMeter({
      measure: async (_scope, { id }) => {
        calls.push(id)
        return id === 'a@m' ? 100 : 200
      },
      onSettled: () => {
        settledCount += 1
        if (settledCount === 2) {
          finish()
        }
      }
    })
    const first = meter.read('acct', [target('a@m'), target('b@m')])
    expect(first).toEqual({ measurements: {}, pending: ['a@m', 'b@m'], failed: [] })
    meter.read('acct', [target('a@m')])
    await settled
    expect(meter.read('acct', [target('a@m'), target('b@m')]).measurements).toEqual({
      'a@m': 100,
      'b@m': 200
    })
    expect(calls).toEqual(['a@m', 'b@m'])
  })

  it('measures again when the install folder changes and pauses retries after a failure', async () => {
    let clock = 0
    let attempts = 0
    let settle!: () => void
    let settled = new Promise<void>((resolve) => (settle = resolve))
    const meter = createPluginWeightMeter({
      measure: async () => {
        attempts += 1
        throw new Error('cli timed out')
      },
      now: () => clock,
      onSettled: () => settle()
    })
    meter.read('acct', [target('a@m', '/p/a~g1')])
    await settled
    expect(meter.read('acct', [target('a@m', '/p/a~g1')]).failed).toEqual(['a@m'])
    expect(attempts).toBe(1)
    expect(meter.read('acct', [target('a@m', '/p/a~g2')]).pending).toEqual(['a@m'])
    settled = new Promise<void>((resolve) => (settle = resolve))
    await settled
    expect(attempts).toBe(2)
    clock = 61_000
    expect(meter.read('acct', [target('a@m', '/p/a~g1')]).pending).toEqual(['a@m'])
  })
})
