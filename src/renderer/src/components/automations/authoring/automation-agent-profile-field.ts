import type { Automation } from '../../../../../shared/automations/automation-definition'
import type { AutomationDraft } from './AutomationEditorDialog'

type ProfileDraftView = Pick<
  AutomationDraft,
  'agentId' | 'bot' | 'workspaceMode' | 'reuseSession' | 'agentProfileId'
>

/**
 * Profiles start a fresh Claude terminal. The main process refuses them for any other agent, chat,
 * a bot, or a reused session (assertAutomationAgentProfile), so the editor offers them only there.
 */
export function automationProfileOffered(
  draft: Omit<ProfileDraftView, 'agentProfileId'>,
  surface: 'chat' | 'terminal'
): boolean {
  return (
    draft.agentId === 'claude' &&
    surface === 'terminal' &&
    !draft.bot &&
    !(draft.workspaceMode === 'existing' && draft.reuseSession)
  )
}

/** The profile part of a save: only a change is sent, and `null` clears the saved profile. */
export function automationAgentProfileUpdate(
  draft: ProfileDraftView,
  surface: 'chat' | 'terminal',
  current: Pick<Automation, 'agentProfileId'> | null
): { agentProfileId?: string | null } {
  const id = automationDraftAgentProfileId(draft, surface)
  return id === (current?.agentProfileId ?? '') ? {} : { agentProfileId: id || null }
}

/** The agent part of a save: the agent when it was edited, plus the profile change. */
export function automationAgentUpdate(
  draft: ProfileDraftView,
  surface: 'chat' | 'terminal',
  current: Pick<Automation, 'agentProfileId'> | null,
  agentEdited: boolean
): { agentId?: AutomationDraft['agentId']; agentProfileId?: string | null } {
  return {
    ...(agentEdited ? { agentId: draft.agentId } : {}),
    ...automationAgentProfileUpdate(draft, surface, current)
  }
}

/** The id a save writes: empty when no profile is chosen or the setup cannot use one. */
export function automationDraftAgentProfileId(
  draft: ProfileDraftView,
  surface: 'chat' | 'terminal'
): string {
  return automationProfileOffered(draft, surface) ? (draft.agentProfileId ?? '') : ''
}
