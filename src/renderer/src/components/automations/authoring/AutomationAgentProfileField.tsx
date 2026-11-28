import { useEffect, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTranslate } from '@/i18n/use-translate'
import { AUTOMATION_EDITOR_SECTION_LABEL_CLASS, Field } from '../automation-page-parts'
import type { AutomationDraft } from './AutomationEditorDialog'
import { automationProfileOffered } from './automation-agent-profile-field'
import { AutomationAgentProfileWeight } from './AutomationAgentProfileWeight'
import type { ClaudeAgentProfile } from '../../../../../shared/agent-profile/agent-profile-types'

const NONE_VALUE = '__none__'

type AutomationAgentProfileFieldProps = {
  draft: AutomationDraft
  surface: 'chat' | 'terminal'
  pickerTriggerClassName: string
  onDraftChange: (updater: (current: AutomationDraft) => AutomationDraft) => void
}

type ProfileOption = { id: string; name: string; profile: ClaudeAgentProfile }

export function AutomationAgentProfileField({
  draft,
  surface,
  pickerTriggerClassName,
  onDraftChange
}: AutomationAgentProfileFieldProps): React.JSX.Element | null {
  const t = useTranslate()
  const [options, setOptions] = useState<ProfileOption[]>([])
  const offered = automationProfileOffered(draft, surface)
  const selected = draft.agentProfileId ?? ''

  useEffect(() => {
    if (!offered) {
      return
    }
    let cancelled = false
    void window.api.app
      .getAgentProfileCatalog()
      .then((catalog) => {
        if (!cancelled) {
          // Runs resolve only profiles stored in settings, so central ones are not offered yet.
          setOptions(
            catalog.entries
              .filter((entry) => entry.origin !== 'central')
              .map((entry) => ({
                id: entry.profile.id,
                name: entry.profile.name,
                profile: entry.profile
              }))
          )
        }
      })
      .catch(() => {
        // The picker keeps the saved choice; the save still validates the id.
      })
    return () => {
      cancelled = true
    }
  }, [offered])

  if (!offered) {
    // A chosen profile this setup cannot use is dropped at save; say so instead of hiding it.
    return selected ? (
      <p className="mb-4 text-xs text-muted-foreground">
        {t(
          'automations.agentProfile.notUsed',
          'The agent profile “{{id}}” only applies to a Claude terminal run without session reuse. Saving removes it.',
          { id: selected }
        )}
      </p>
    ) : null
  }

  const listed = options.some((option) => option.id === selected)
  const selectedProfile = options.find((option) => option.id === selected)?.profile ?? null
  return (
    <Field
      className="mb-4"
      labelClassName={AUTOMATION_EDITOR_SECTION_LABEL_CLASS}
      label={t('automations.agentProfile.label', 'Agent profile')}
    >
      <Select
        value={selected || NONE_VALUE}
        onValueChange={(value) =>
          onDraftChange((current) => ({
            ...current,
            agentProfileId: value === NONE_VALUE ? '' : value
          }))
        }
      >
        <SelectTrigger className={`w-full ${pickerTriggerClassName}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" side="bottom" align="start" sideOffset={4}>
          <SelectItem value={NONE_VALUE}>
            {t('automations.agentProfile.none', 'No profile')}
          </SelectItem>
          {selected && !listed ? <SelectItem value={selected}>{selected}</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedProfile ? <AutomationAgentProfileWeight profile={selectedProfile} /> : null}
    </Field>
  )
}
