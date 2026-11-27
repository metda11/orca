import type {
  ClaudeLoadoutSetDiff,
  ClaudeLoadoutUseCount
} from '../../../../shared/agent-profile/loadout/claude-loadout-types'
import type { ClaudeProfileRunReport } from '../../../../shared/agent-usage/analytics/claude-profile-usage-types'
import { useIntlLocale, useTranslate, type Translate } from '@/i18n/use-translate'
import { formatTokens } from './usage-formatters'

function NameList({ label, names }: { label: string; names: string[] }): React.JSX.Element | null {
  return names.length > 0 ? (
    <p>
      <span className="text-foreground">{label}</span> {names.join(', ')}
    </p>
  ) : null
}

function SetDiffLines({
  title,
  diff,
  t
}: {
  title: string
  diff: ClaudeLoadoutSetDiff | null
  t: Translate
}): React.JSX.Element | null {
  if (!diff) {
    return null
  }
  const clean = !diff.missing.length && !diff.unexpected.length && !diff.orgUnexpected.length
  return (
    <div>
      <p className="font-medium text-foreground">{title}</p>
      {clean ? <p>{t('stats.profileLoadout.noDrift', 'As requested')}</p> : null}
      <NameList label={t('stats.profileLoadout.missing', 'Missing:')} names={diff.missing} />
      <NameList label={t('stats.profileLoadout.unexpected', 'Extra:')} names={diff.unexpected} />
      <NameList
        label={t('stats.profileLoadout.orgUnexpected', 'Extra, from the organization:')}
        names={diff.orgUnexpected}
      />
    </div>
  )
}

function CountList({
  title,
  entries
}: {
  title: string
  entries: ClaudeLoadoutUseCount[]
}): React.JSX.Element | null {
  return entries.length > 0 ? (
    <NameList label={title} names={entries.map((e) => `${e.name} ×${e.count}`)} />
  ) : null
}

export function ClaudeProfileLoadoutRun({
  run
}: {
  run: ClaudeProfileRunReport
}): React.JSX.Element {
  const t = useTranslate()
  const intlLocale = useIntlLocale()
  const { deviation, usage, offeredUnused } = run
  const statusLabel =
    deviation.status === 'not_determinable'
      ? t('stats.profileLoadout.notDeterminable', 'Actual loadout not determinable')
      : deviation.status === 'deviates'
        ? t('stats.profileLoadout.deviates', 'Deviates from profile')
        : t('stats.profileLoadout.matches', 'Matches profile')
  return (
    <details className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-xs">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-foreground">
          {run.profileName} • {new Date(run.startedAt).toLocaleString(intlLocale)}
        </span>
        <span className="text-muted-foreground">
          {statusLabel} • {formatTokens(run.tokens.totalTokens, intlLocale)}{' '}
          {t('stats.profileLoadout.tokens', 'tokens')}
        </span>
      </summary>
      <div className="mt-2 space-y-2 text-muted-foreground">
        {deviation.status === 'not_determinable' ? (
          <p>
            {t(
              'stats.profileLoadout.noListing',
              'This transcript lists no skills or agents, so the offered set is unknown.'
            )}
          </p>
        ) : (
          <>
            <SetDiffLines
              title={t('stats.profileLoadout.plugins', 'Plugins')}
              diff={deviation.plugins}
              t={t}
            />
            <SetDiffLines
              title={t('stats.profileLoadout.mcpServers', 'MCP servers')}
              diff={deviation.mcpServers}
              t={t}
            />
          </>
        )}
        {usage ? (
          <div>
            <p className="font-medium text-foreground">{t('stats.profileLoadout.used', 'Used')}</p>
            <CountList title={t('stats.profileLoadout.tools', 'Tools:')} entries={usage.tools} />
            <CountList title={t('stats.profileLoadout.skills', 'Skills:')} entries={usage.skills} />
            <CountList
              title={t('stats.profileLoadout.subagents', 'Subagents:')}
              entries={usage.subagents}
            />
          </div>
        ) : (
          <p>{t('stats.profileLoadout.noTranscript', 'Transcript could not be read.')}</p>
        )}
        {offeredUnused ? (
          <div>
            <p className="font-medium text-foreground">
              {t('stats.profileLoadout.offeredUnused', 'Offered, never used')}
            </p>
            <NameList
              label={t('stats.profileLoadout.skills', 'Skills:')}
              names={offeredUnused.skills}
            />
            <NameList
              label={t('stats.profileLoadout.subagents', 'Subagents:')}
              names={offeredUnused.subagents}
            />
            <NameList
              label={t('stats.profileLoadout.mcpServersList', 'MCP servers:')}
              names={offeredUnused.mcpServers}
            />
          </div>
        ) : null}
      </div>
    </details>
  )
}
