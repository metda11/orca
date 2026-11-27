import { useEffect, useState } from 'react'
import { UserCog } from 'lucide-react'
import { useAppStore } from '@/store'
import { useTranslate } from '@/i18n/use-translate'
import {
  shouldShowProfileChip,
  type ProfilePaneBinding
} from '../../../../../shared/agent-profile/loadout/profile-pane-binding'

const PRE_HOOK_RETRY_MS = [1500, 6000]

/** Profile each pane's agent was started with; main binds it at spawn, the pane only reads it. */
function useProfilePaneBinding(paneKey: string, liveSessionId: string | undefined) {
  const [binding, setBinding] = useState<ProfilePaneBinding | undefined>()
  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      window.api.app
        .getAgentProfilePaneBindings()
        .then((bindings) => {
          if (!cancelled) {
            setBinding(bindings[paneKey])
          }
        })
        .catch(() => {
          if (!cancelled) {
            setBinding(undefined)
          }
        })
    }
    load()
    // Why the retries: the pane mounts before its spawn writes the run, and no hook event has fired yet.
    const timers = PRE_HOOK_RETRY_MS.map((delay) => setTimeout(load, delay))
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
    // Why liveSessionId in the deps: the first hook event is when main pins the run to its session.
  }, [paneKey, liveSessionId])
  return binding
}

export function TerminalPaneProfileChip({
  paneKey
}: {
  paneKey: string
}): React.JSX.Element | null {
  const t = useTranslate()
  const status = useAppStore((state) => state.agentStatusByPaneKey.get(paneKey))
  const liveSessionId = status?.providerSession?.id
  const binding = useProfilePaneBinding(paneKey, liveSessionId)
  if (!shouldShowProfileChip(binding, liveSessionId)) {
    return null
  }
  const label = t('terminalPane.profileChip.label', 'Agent profile: {{value0}}', {
    value0: binding.profileName
  })
  return (
    <span
      className="pane-title-profile-chip pointer-events-auto ml-1 flex min-w-0 shrink items-center gap-1 self-center truncate rounded-md border border-border/60 px-1.5 text-[11px] leading-4 text-muted-foreground"
      title={label}
      aria-label={label}
      data-pane-profile-id={binding.profileId}
    >
      <UserCog className="size-3 shrink-0" />
      <span className="truncate">{binding.profileName}</span>
    </span>
  )
}
