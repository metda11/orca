import React from 'react'
import { Bot, Loader2, Pencil, RotateCcw, SquareArrowOutUpRight, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import type {
  EnvironmentDoctorCheck,
  EnvironmentDoctorFixOutcome
} from '../../../../shared/workspace-setup/environment-doctor/environment-doctor-types'
import { VmBuildReveal } from './VmBuildReveal'

export type VmBuildFailure =
  | { kind: 'checks'; problems: readonly EnvironmentDoctorCheck[] }
  | { kind: 'provision'; error: string }

/** Failure card for a VM build; keeps the last failure on screen while it collapses away. */
export function VmBuildFailureCard({
  failure,
  canFixWithAgent,
  onRunFix,
  onFixWithAgent,
  onRetry,
  onEditRecipe,
  onOpenAnyway,
  onDismiss
}: {
  failure: VmBuildFailure | null
  canFixWithAgent: boolean
  /** Runs the host's allowlisted repair for one check id; absent when the check target is unknown. */
  onRunFix?: (checkId: string) => Promise<EnvironmentDoctorFixOutcome>
  onFixWithAgent: () => void
  onRetry: () => void
  onEditRecipe: () => void
  onOpenAnyway: () => void
  onDismiss: () => void
}): React.JSX.Element {
  const t = useTranslate()
  // Why: a closing card still needs its content, or it would empty out before it finishes collapsing.
  const [shown, setShown] = React.useState(failure)
  // Each opening is a new run, so the rows remount and their stagger replays on a repeated failure.
  const [run, setRun] = React.useState(0)
  const [open, setOpen] = React.useState(failure !== null)
  if ((failure !== null) !== open) {
    setOpen(failure !== null)
    if (failure) {
      setRun(run + 1)
    }
  }
  if (failure && failure.kind !== shown?.kind) {
    setShown(failure)
  }
  const visible = failure ?? shown
  const checks = visible?.kind === 'checks'

  return (
    <VmBuildReveal open={failure !== null} className="pt-4">
      {visible ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <div className="text-sm font-medium text-destructive">
            {checks
              ? t(
                  'auto.components.worktree.creation.VmBuildSheet.checksFailed',
                  'The VM is up, but its environment checks failed'
                )
              : t(
                  'auto.components.worktree.creation.WorktreeCreationPanel.ed2a664f8b',
                  'Couldn’t create worktree'
                )}
          </div>
          {visible.kind === 'checks' ? (
            <ul key={run} className="flex flex-col gap-2">
              {visible.problems.map((check, index) => (
                <CheckRow key={check.id} check={check} index={index} onRunFix={onRunFix} />
              ))}
            </ul>
          ) : (
            <p className="break-words text-xs text-muted-foreground">{visible.error}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" size="xs" onClick={onFixWithAgent} disabled={!canFixWithAgent}>
              <Bot />
              {t('auto.components.worktree.creation.VmBuildSheet.fixWithAgent', 'Fix with agent')}
            </Button>
            <Button type="button" variant="outline" size="xs" onClick={onRetry}>
              <RotateCcw />
              {checks
                ? t('auto.components.worktree.creation.VmBuildSheet.retryChecks', 'Retry checks')
                : t('auto.components.worktree.creation.WorktreeCreationPanel.34dd5ee38b', 'Retry')}
            </Button>
            <Button type="button" variant="outline" size="xs" onClick={onEditRecipe}>
              <Pencil />
              {t('auto.components.worktree.creation.VmBuildSheet.editRecipe', 'Edit recipe')}
            </Button>
            {checks ? (
              <Button type="button" variant="outline" size="xs" onClick={onOpenAnyway}>
                <SquareArrowOutUpRight />
                {t('auto.components.worktree.creation.VmBuildSheet.openAnyway', 'Open anyway')}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="xs" onClick={onDismiss}>
              {t('auto.components.worktree.creation.WorktreeCreationPanel.dabd226118', 'Dismiss')}
            </Button>
          </div>
          {checks ? (
            <p className="text-xs text-muted-foreground">
              {t(
                'auto.components.worktree.creation.VmBuildSheet.openAnywayHint',
                'Open anyway keeps this VM and creates the workspace on it as is. Dismiss destroys the VM.'
              )}
            </p>
          ) : null}
        </div>
      ) : null}
    </VmBuildReveal>
  )
}

function CheckRow({
  check,
  index,
  onRunFix
}: {
  check: EnvironmentDoctorCheck
  index: number
  onRunFix?: (checkId: string) => Promise<EnvironmentDoctorFixOutcome>
}): React.JSX.Element {
  const t = useTranslate()
  const [running, setRunning] = React.useState(false)
  const [outcome, setOutcome] = React.useState<EnvironmentDoctorFixOutcome | null>(null)
  // Only the id is sent; the button shows up whenever the host offered a repair for this check.
  const canFix = Boolean(onRunFix && check.fixCommand?.length)
  const runFix = async (): Promise<void> => {
    if (!onRunFix || running) {
      return
    }
    setRunning(true)
    setOutcome(null)
    try {
      setOutcome(await onRunFix(check.id))
    } finally {
      setRunning(false)
    }
  }
  return (
    <li
      // Rows arrive together; a short stagger lets the eye read them top to bottom.
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'backwards' }}
      className="flex flex-col gap-0.5 text-xs motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"
    >
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            'w-9 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide',
            check.status === 'fail' ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {check.status}
        </span>
        <span className="min-w-0 break-words text-foreground">{check.message}</span>
      </div>
      {check.remediation ? (
        <p className="ml-11 whitespace-pre-wrap break-words text-muted-foreground">
          {check.remediation}
        </p>
      ) : null}
      {canFix ? (
        <div className="ml-11 flex flex-wrap items-center gap-2 pt-0.5">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={running}
            onClick={() => void runFix()}
          >
            {running ? <Loader2 className="motion-safe:animate-spin" /> : <Wrench />}
            {t('auto.components.worktree.creation.VmBuildSheet.runFix', 'Fix')}
          </Button>
          <code className="min-w-0 break-all font-mono text-[10px] text-muted-foreground">
            {check.fixCommand?.join(' ')}
          </code>
        </div>
      ) : null}
      {outcome && !outcome.ok ? (
        <p className="ml-11 whitespace-pre-wrap break-words text-destructive">{outcome.message}</p>
      ) : null}
    </li>
  )
}
