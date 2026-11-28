import { getAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import { bindProfileRunSession } from '../../claude-usage/loadout/profile-run-registry'

/** The folder the spawn side writes run records to; binding and chip must read the same one. */
export function agentProfileRootDir(): string {
  return getAppEnvironment().getPath('userData')
}

const MAX_SEEN = 500

type BindableStatus = {
  paneKey: string
  providerSession?: { id: string }
  receivedAt: number
  evidenceObservedAt?: number
}

type BindingSource = {
  subscribeEnrichedStatus(listener: (status: BindableStatus) => void): () => void
}

/**
 * Pins a profile start to the Claude session id its first hook event reports, so usage attribution
 * needs no folder or time window. The registry write is skipped for every pair already seen.
 */
export function installProfileRunSessionBinding(
  source: BindingSource,
  userDataDir: string | (() => string)
): () => void {
  const getUserDataDir = typeof userDataDir === 'string' ? () => userDataDir : userDataDir
  const seen = new Set<string>()
  return source.subscribeEnrichedStatus((status) => {
    const sessionId = status.providerSession?.id
    if (!sessionId) {
      return
    }
    const key = `${status.paneKey}\0${sessionId}`
    if (seen.has(key)) {
      return
    }
    if (seen.size >= MAX_SEEN) {
      seen.clear()
    }
    seen.add(key)
    bindProfileRunSession(
      getUserDataDir(),
      status.paneKey,
      sessionId,
      status.evidenceObservedAt ?? status.receivedAt
    ).catch((error: unknown) => console.warn('[agent-profile] session not bound to run', error))
  })
}
