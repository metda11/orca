import { automationTerminalLaunchInputs } from '../../../shared/automations/launch/automation-launch-setup'
import { getRepoExecutionHostId } from '../../../shared/execution-host/execution-host'
// Automations observe PTYs, so launch terminal agents regardless of the chat default.

import type { AgentLaunchSurfaceExecution } from '../../agent-launch/agent-launch-execution'
import { openAgentLaunch } from '../../agent-launch/agent-launch-executor'
import { tuiAgentDisplayName } from '../../../shared/agent-launch/catalog/tui-agent-display-names'
import type { RuntimeTerminalCreate } from '../../../shared/terminal/runtime/runtime-terminal-create-contract'
import type { Automation } from '../../../shared/automations/automation-definition'
import type { AutomationRun } from '../../../shared/automations/history/automation-run'
import { findReusableAutomationRun } from '../../../shared/automations/history/automation-session-reuse'
import type { GlobalSettings } from '../../../shared/settings/global-settings-types'
import { requireWorkspaceId, resolveLocalExistingWorkspace } from './automation-existing-workspace'
import { prepareAutomationAgentProfile } from './automation-agent-profile-launch'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import { deliverTerminalAgentLaunchPrompt } from '../../runtime/rpc/methods/agent-launch/agent-launch-terminal-prompt'
import { AutomationRunLaunchError, type AutomationLaunch } from './automation-launch'
import { buildAutomationWorktreeCreateArgs } from './automation-workspace-create'
import type { AutomationRepoRunTarget } from '../ownership/run-target-resolution'

const TERMINAL_ONLY_MESSAGE = 'An automation starts a terminal agent only.'

type LaunchedTerminal = {
  handle: string
  tabId?: string | null
  paneKey?: string | null
  ptyId?: string | null
}

export type AutomationTerminalAgentLaunch = Omit<AutomationLaunch, 'completion'> & {
  terminalHandle: string
}

export async function launchAutomationTerminalAgent(
  runtime: OrcaRuntimeService,
  request: {
    automation: Automation
    run: Pick<AutomationRun, 'id' | 'title' | 'scheduledFor' | 'trigger'>
    target: AutomationRepoRunTarget
    runs: readonly AutomationRun[]
    settings:
      | Pick<
          GlobalSettings,
          'agentProfiles' | 'agentProfileCentralDir' | 'agentProfileDefaultBaselines'
        >
      | undefined
  }
): Promise<AutomationTerminalAgentLaunch> {
  const { automation, run, target } = request
  const agent = automation.agentId
  const selectedTarget =
    automation.workspaceMode === 'existing'
      ? await resolveLocalExistingWorkspace(runtime, automation, target)
      : undefined
  const selectedWorkspace = selectedTarget?.managedWorktree
  // The startup plan trims the prompt for every agent; a blank one launches the agent bare.
  const text = automation.prompt?.trim()
  if (
    automation.reuseSession &&
    automation.workspaceMode === 'existing' &&
    text &&
    !automation.agentProfileId
  ) {
    const reused = await sendToReusableSession(
      runtime,
      { ...request, text },
      selectedWorkspace?.displayName ?? null,
      selectedWorkspace?.hostId ?? getRepoExecutionHostId(target.repo)
    )
    if (reused) {
      return reused
    }
  }
  // Why: written before any terminal opens, so a refused profile leaves no run terminal behind.
  const agentProfile = await prepareAutomationAgentProfile({
    automation,
    repo: target.repo,
    cwd: selectedWorkspace?.path ?? target.repo.path,
    settings: request.settings
  })
  const execution: AgentLaunchSurfaceExecution = {
    runtime,
    intent: {
      agent,
      // The workspace factory supplies create arguments from the automation.
      target:
        automation.workspaceMode === 'new_per_run'
          ? { kind: 'create-worktree', create: {} }
          : { kind: 'existing', worktree: requireWorkspaceId(automation) },
      ...(text ? { prompt: { text, delivery: 'submit' as const } } : {})
    },
    terminalOnly: true,
    workspaces: {
      createWorktree: async ({ startupAgent, startupPrompt }) => {
        if (startupAgent === undefined) {
          throw new Error(TERMINAL_ONLY_MESSAGE)
        }
        const { startupPrompt: _prompt, ...create } = buildAutomationWorktreeCreateArgs({
          automation,
          run,
          repo: target.repo,
          ...(agentProfile ? { agentProfile } : {})
        })
        let startupTerminalCreation: RuntimeTerminalCreate | undefined
        const created = await runtime.createManagedWorktree({
          onStartupTerminalCreated: (terminal) => {
            startupTerminalCreation = terminal
          },
          ...create,
          startupAgent,
          ...(startupPrompt ? { startupPrompt } : {})
        })
        const startup = created.startupTerminal
        if (!startup?.handle) {
          const message =
            created.warning || 'Automation workspace was created, but no agent terminal started.'
          // A terminal that started before a later startup step failed still belongs to the run.
          throw startupTerminalCreation
            ? new AutomationRunLaunchError(
                message,
                runTargetOf(
                  startupTerminalCreation,
                  created.worktree.id,
                  created.worktree.displayName ?? null
                )
              )
            : new Error(message)
        }
        return {
          worktreeId: created.worktree.id,
          startupTerminalHandle: startup.handle,
          startupTerminalCreation,
          ...(startup.paneKey ? { startupTerminalPaneKey: startup.paneKey } : {}),
          // Creation stages long prompts while keeping them on the launch command.
          ...(startupPrompt ? { promptRodeLaunchCommand: true } : {})
        }
      }
    },
    surfaces: {
      createStructuredSession: () => {
        throw new Error(TERMINAL_ONLY_MESSAGE)
      },
      createTerminalAgent: async ({ worktreeId, startupPrompt }) => {
        const resolved = selectedWorkspace
        if (!resolved) {
          throw new Error('The target workspace is no longer available.')
        }
        const launched = await runtime.launchAgentTerminal(
          `id:${worktreeId}`,
          {
            agent,
            prompt: startupPrompt ?? '',
            title: run.title,
            suppressStartupUpdatePrompt: true,
            ...automationTerminalLaunchInputs(automation),
            ...(agentProfile ? { agentProfile } : {}),
            // Run now is the user's act and may start a stopped WSL distro; a scheduled run never does.
            ...(run.trigger === 'scheduled' ? {} : { wslUserAct: true as const }),
            surfaceOwner: false
          },
          {
            worktree: resolved,
            repo: target.repo,
            folderWorkspace: selectedTarget?.scope.folderWorkspace ?? undefined
          }
        )
        return {
          handle: launched.handle,
          terminalCreation: launched,
          ...(launched.paneKey ? { paneKey: launched.paneKey } : {}),
          ...(startupPrompt ? { promptRodeLaunchCommand: true } : {})
        }
      },
      deliverTerminalPrompt: ({ handle, prompt, terminalCreation }) =>
        runtime.deliverStartupFollowup(handle, { agent, prompt: prompt.text }, { terminalCreation })
    }
  }
  const opened = await openAgentLaunch(execution)
  const { outcome, worktreeId } = opened.surface
  if (outcome.kind !== 'terminal') {
    throw new Error(TERMINAL_ONLY_MESSAGE)
  }
  return {
    ...runTargetOf(
      { paneKey: outcome.paneKey, ...opened.terminalCreation, handle: outcome.handle },
      worktreeId,
      selectedWorkspace?.displayName ?? null
    ),
    delivery: opened.settlement.then((settled) => ({
      error:
        settled.status === 'rejected'
          ? settled.reason instanceof Error
            ? settled.reason.message
            : String(settled.reason)
          : settled.value.prompt?.outcome === 'not-delivered'
            ? `${tuiAgentDisplayName(agent)} started, but Orca could not send this run's prompt.`
            : null
    }))
  }
}

/** A null display name lets the run store resolve it from the workspace's metadata. */
function runTargetOf(
  terminal: LaunchedTerminal,
  workspaceId: string,
  workspaceDisplayName: string | null
): AutomationTerminalAgentLaunch {
  return {
    workspaceId,
    workspaceDisplayName,
    terminalHandle: terminal.handle,
    terminalSessionId: terminal.tabId ?? null,
    terminalPaneKey: terminal.paneKey ?? null,
    terminalPtyId: terminal.ptyId ?? null
  }
}

async function sendToReusableSession(
  runtime: OrcaRuntimeService,
  request: {
    automation: Automation
    run: Pick<AutomationRun, 'id'>
    runs: readonly AutomationRun[]
    text: string
    target: AutomationRepoRunTarget
  },
  workspaceDisplayName: string | null,
  physicalHostId: string
): Promise<AutomationTerminalAgentLaunch | null> {
  const { automation, text } = request
  const worktreeId = requireWorkspaceId(automation)
  const session = findReusableAutomationRun({
    automationId: automation.id,
    agentId: automation.agentId,
    worktreeId,
    target: {
      hostId: getRepoExecutionHostId(request.target.repo),
      repoId: request.target.repo.id,
      path: request.target.repo.path
    },
    currentRunId: request.run.id,
    runs: request.runs,
    agentStatusForPane: (paneKey) =>
      runtime
        .getAgentStatusRowsForPane(paneKey)
        .filter((row) => !row.providerSessionOnly)
        .toSorted((left, right) => right.receivedAt - left.receivedAt)[0],
    liveSession: (previous) => {
      const handle = runOwnHandle(runtime, previous)
      const liveWorktreeId = handle ? runtime.getTerminalWorktreeIdForHandle(handle) : null
      const liveHostId = handle
        ? runtime.getPtyExecutionHostMetadata(runtime.getTerminalPtyIdForHandle(handle))
            .executionHostId
        : undefined
      return handle && liveWorktreeId === worktreeId && liveHostId === physicalHostId
        ? { handle, previous }
        : null
    }
  })
  if (
    !session ||
    !(await deliverTerminalAgentLaunchPrompt({
      runtime,
      handle: session.handle,
      agent: automation.agentId,
      freshLaunch: false,
      text,
      // Windows cannot prove which agent is foreground; refuse only a proven shell.
      unprovableHost: 'write-unless-shell'
    }))
  ) {
    return null
  }
  return {
    workspaceId: worktreeId,
    workspaceDisplayName,
    terminalHandle: session.handle,
    terminalSessionId: session.previous.terminalSessionId,
    terminalPaneKey: session.previous.terminalPaneKey,
    terminalPtyId: session.previous.terminalPtyId
  }
}

export type RunOwnHandleRuntime = Pick<
  OrcaRuntimeService,
  'getTerminalHandleForPaneKey' | 'getTerminalPtyIdForHandle' | 'getPtyLivenessVerdict'
>

/** Reject reused pane handles whose PTY no longer belongs to this run, or has exited. */
export function runOwnHandle(runtime: RunOwnHandleRuntime, run: AutomationRun): string | null {
  const handle = run.terminalPaneKey
    ? runtime.getTerminalHandleForPaneKey(run.terminalPaneKey)
    : null
  // A closed pane's handle still resolves to its PTY for exit waits; only the exit verdict tells.
  return handle &&
    run.terminalPtyId &&
    runtime.getTerminalPtyIdForHandle(handle) === run.terminalPtyId &&
    runtime.getPtyLivenessVerdict(run.terminalPtyId)?.status !== 'exited'
    ? handle
    : null
}
