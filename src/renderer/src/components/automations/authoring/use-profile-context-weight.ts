import { useEffect, useMemo, useState } from 'react'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import type { ClaudePluginInventory } from '../../../../../shared/claude-plugins/claude-plugin-inventory'
import type { ClaudeAgentProfile } from '../../../../../shared/agent-profile/agent-profile-types'
import {
  weighProfileContext,
  type ProfileContextWeight
} from '../../../../../shared/agent-profile/profile-context-weight'
import { PROFILE_WEIGHT_POLL_MS, shouldPollWeights } from './automation-profile-weight'

/** Shape of the `claudePlugins.weights` result. */
type PluginWeightsReading = {
  inventory: ClaudePluginInventory
  measurements: Record<string, number>
  pending: string[]
  failed: string[]
}

/**
 * Weight of a profile's start. The read never gates the caller: it starts after mount, answers
 * from the host's cache, and polls only while this profile still has unmeasured plugins. A change
 * to `profile` (a switch in an editor) recomputes from the last reading without a new call.
 */
export function useProfileContextWeight(profile: ClaudeAgentProfile | null): {
  weight: ProfileContextWeight | null
  unavailable: boolean
} {
  const enabled = profile !== null
  const [reading, setReading] = useState<PluginWeightsReading | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [round, setRound] = useState(0)

  const weight = useMemo(
    () =>
      profile && reading
        ? weighProfileContext(profile, reading.inventory, reading.measurements)
        : null,
    [profile, reading]
  )
  const polling = shouldPollWeights(weight, reading?.pending ?? [])

  useEffect(() => {
    if (!enabled) {
      return
    }
    let cancelled = false
    void callRuntimeRpc<PluginWeightsReading>({ kind: 'local' }, 'claudePlugins.weights', {})
      .then((next) => {
        if (!cancelled) {
          setReading(next)
          setUnavailable(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUnavailable(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [enabled, round])

  useEffect(() => {
    if (!polling) {
      return
    }
    const timer = setTimeout(() => setRound((current) => current + 1), PROFILE_WEIGHT_POLL_MS)
    return () => clearTimeout(timer)
  }, [polling, reading])

  return { weight: enabled ? weight : null, unavailable: enabled && unavailable && !weight }
}
