import { beforeEach, describe, expect, it, vi } from 'vitest'

const bindProfileRunSession = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('../../claude-usage/loadout/profile-run-registry', () => ({ bindProfileRunSession }))

import { installProfileRunSessionBinding } from './agent-profile-session-binding'

type Status = {
  paneKey: string
  providerSession?: { id: string }
  receivedAt: number
  evidenceObservedAt?: number
}

function setup(): { emit: (status: Status) => void } {
  let listener: ((status: Status) => void) | null = null
  installProfileRunSessionBinding(
    {
      subscribeEnrichedStatus: (next) => {
        listener = next
        return () => undefined
      }
    },
    '/user-data'
  )
  return { emit: (status) => listener?.(status) }
}

describe('installProfileRunSessionBinding', () => {
  beforeEach(() => bindProfileRunSession.mockClear())

  it('binds the first event that names a session, with the evidence clock', () => {
    const { emit } = setup()
    emit({ paneKey: 'tab:a', receivedAt: 10 })
    emit({
      paneKey: 'tab:a',
      providerSession: { id: 's-1' },
      receivedAt: 20,
      evidenceObservedAt: 15
    })
    expect(bindProfileRunSession).toHaveBeenCalledExactlyOnceWith('/user-data', 'tab:a', 's-1', 15)
  })

  it('writes once per pane and session, but again for a new session in the same pane', () => {
    const { emit } = setup()
    emit({ paneKey: 'tab:a', providerSession: { id: 's-1' }, receivedAt: 1 })
    emit({ paneKey: 'tab:a', providerSession: { id: 's-1' }, receivedAt: 2 })
    emit({ paneKey: 'tab:a', providerSession: { id: 's-2' }, receivedAt: 3 })
    expect(bindProfileRunSession).toHaveBeenCalledTimes(2)
  })
})
