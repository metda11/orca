import { useEffect, useState } from 'react'
import type { ClaudeProfileLoadoutReport } from '../../../../shared/agent-usage/analytics/claude-profile-usage-types'
import { useAppStore } from '../../store'
import { usageApiForHost } from '../../store/slices/usage/usage-host'
import { useIntlLocale, useTranslate } from '@/i18n/use-translate'
import { ClaudeProfileLoadoutRun } from './ClaudeProfileLoadoutRun'
import { formatCost, formatTokens } from './usage-formatters'

export function ClaudeProfileLoadoutSection({
  scanCompletedAt
}: {
  scanCompletedAt: number | null
}): React.JSX.Element | null {
  const t = useTranslate()
  const intlLocale = useIntlLocale()
  const host = useAppStore((state) => state.statsHost)
  const [report, setReport] = useState<ClaudeProfileLoadoutReport | null>(null)

  useEffect(() => {
    let cancelled = false
    usageApiForHost(host, 'claudeUsage')
      .getProfileLoadout()
      .then((next) => {
        if (!cancelled) {
          setReport(next)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReport(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [host, scanCompletedAt])

  if (!report || (report.profiles.length === 0 && report.unmatchedRuns === 0)) {
    return null
  }
  return (
    <section className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4">
      <div>
        <h4 className="text-sm font-semibold text-foreground">
          {t('stats.profileLoadout.title', 'Agent profiles')}
        </h4>
        <p className="text-xs text-muted-foreground">
          {t(
            'stats.profileLoadout.description',
            'Terminal runs started from a profile. Compare profiles by tokens: dollar estimates move with prompt-cache luck.'
          )}
        </p>
      </div>
      {report.profiles.length > 0 ? (
        <table className="w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">{t('stats.profileLoadout.profile', 'Profile')}</th>
              <th className="py-1 font-medium">{t('stats.profileLoadout.runs', 'Runs')}</th>
              <th className="py-1 font-medium">
                {t('stats.profileLoadout.medianTokens', 'Median tokens')}
              </th>
              <th className="py-1 font-medium">{t('stats.profileLoadout.cost', 'Est. cost')}</th>
            </tr>
          </thead>
          <tbody>
            {report.profiles.map((profile) => (
              <tr key={profile.profileId} className="border-t border-border/40">
                <td className="py-1 text-foreground">{profile.profileName}</td>
                <td className="py-1">{profile.runs.toLocaleString(intlLocale)}</td>
                <td className="py-1">{formatTokens(profile.medianTokens, intlLocale)}</td>
                <td className="py-1">{formatCost(profile.estimatedCostUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div className="space-y-2">
        {report.runs.map((run) => (
          <ClaudeProfileLoadoutRun key={run.runId} run={run} />
        ))}
      </div>
      {report.unmatchedRuns > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t(
            'stats.profileLoadout.unmatched',
            '{{count}} profile starts have no matching Claude session yet.',
            {
              count: report.unmatchedRuns,
              defaultValue_one: '{{count}} profile start has no matching Claude session yet.'
            }
          )}
        </p>
      ) : null}
    </section>
  )
}
