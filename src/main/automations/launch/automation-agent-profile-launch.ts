import { join } from 'node:path'
import { getAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import type { Automation } from '../../../shared/automations/automation-definition'
import type { GlobalSettings } from '../../../shared/settings/global-settings-types'
import type { ClaudeAgentProfile } from '../../../shared/agent-profile/agent-profile-types'
import type { Repo } from '../../../shared/repository/repo-types'
import { repoIsRemote } from '../../../shared/agent-launch/startup/agent-launch-remote'
import { isWslUncPath } from '../../../shared/file-access/wsl-paths'
import { agentProfileRefusalMessage } from '../../../shared/agent-profile/agent-profile-refusal-copy'
import {
  AgentProfileLaunchError,
  type AgentProfileLaunchRequest
} from '../../../shared/agent-profile/claude-profile-startup-args'
import { buildAgentProfileCatalog } from '../../claude/agent-profile/agent-profile-catalog-service'
import { prepareAgentProfileForPtySpawn } from '../../claude/agent-profile/agent-profile-spawn-preparation'
import { AutomationRunLaunchError } from './automation-launch'

/** Run failure for a start that cannot carry the profile; a run without it would do less than configured. */
export function automationAgentProfileRefusal(message: string): AutomationRunLaunchError {
  return new AutomationRunLaunchError(`Agent profile not applied: ${message}`)
}

/**
 * Writes the profile files for this run and names them for the startup plan; undefined when the
 * automation has no profile. Anything the profile cannot start on refuses the run.
 */
export async function prepareAutomationAgentProfile(args: {
  automation: Pick<Automation, 'agentProfileId' | 'agentId'>
  repo: Pick<Repo, 'connectionId' | 'executionHostId' | 'path'>
  cwd: string
  /** Local profiles plus the central folder; a central profile is not in `agentProfiles`. */
  settings:
    | Pick<
        GlobalSettings,
        'agentProfiles' | 'agentProfileCentralDir' | 'agentProfileDefaultBaselines'
      >
    | undefined
  userDataDir?: string
}): Promise<AgentProfileLaunchRequest | undefined> {
  const { automation, repo, cwd } = args
  const id = automation.agentProfileId
  if (!id) {
    return undefined
  }
  const rootDir = args.userDataDir ?? join(getAppEnvironment().getPath('userData'))
  let profile: ClaudeAgentProfile
  try {
    if (automation.agentId !== 'claude') {
      throw new AgentProfileLaunchError('agent_profile_agent_unsupported')
    }
    if (repoIsRemote(repo) || isWslUncPath(cwd) || isWslUncPath(repo.path)) {
      throw new AgentProfileLaunchError('agent_profile_host_unsupported')
    }
    // Why the catalog: a read-only team profile lives in the central folder, not in settings.
    const catalog = await buildAgentProfileCatalog(args.settings ?? {})
    profile = await prepareAgentProfileForPtySpawn({
      profileId: id,
      cwd,
      settings: { agentProfiles: catalog.entries.map((entry) => entry.profile) },
      userDataDir: rootDir
    })
  } catch (error) {
    if (error instanceof AgentProfileLaunchError) {
      throw automationAgentProfileRefusal(agentProfileRefusalMessage(error))
    }
    throw error
  }
  // The startup plan reads settings.agentProfiles only; the resolved profile covers a central one.
  return { id, rootDir, profile }
}
