import { useTranslate } from '@/i18n/use-translate'
import type { ClaudeAgentProfile } from '../../../../../shared/agent-profile/agent-profile-types'
import { formatWeightTokens } from './automation-profile-weight'
import { useProfileContextWeight } from './use-profile-context-weight'

/** Context a start of the chosen profile loads, measured and estimated shares kept apart. */
export function AutomationAgentProfileWeight({
  profile
}: {
  profile: ClaudeAgentProfile
}): React.JSX.Element | null {
  const t = useTranslate()
  const { weight, unavailable } = useProfileContextWeight(profile)
  if (unavailable) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        {t('automations.agentProfile.weightUnavailable', 'Context weight is not available here.')}
      </p>
    )
  }
  if (!weight) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        {t('automations.agentProfile.weightMeasuring', 'Measuring context weight…')}
      </p>
    )
  }
  const measuring = weight.pending.length > 0
  return (
    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
      <p>
        {measuring
          ? t(
              'automations.agentProfile.weightMeasuredPending',
              'Measured: at least {{tokens}} tokens (plugins), {{plugins}} still measuring',
              { tokens: formatWeightTokens(weight.measured.tokens), plugins: weight.pending.length }
            )
          : t('automations.agentProfile.weightMeasured', 'Measured: {{tokens}} tokens (plugins)', {
              tokens: formatWeightTokens(weight.measured.tokens)
            })}
      </p>
      <p>
        {t(
          'automations.agentProfile.weightEstimated',
          'Estimated: about {{tokens}} tokens ({{servers}} MCP servers, flat guess per server)',
          {
            tokens: formatWeightTokens(weight.estimated.tokens),
            servers: weight.estimated.mcpServers.length
          }
        )}
      </p>
    </div>
  )
}
