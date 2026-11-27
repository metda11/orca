import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import type { GlobalSettings } from '../../../shared/settings/global-settings-types'
import {
  AgentProfileLaunchError,
  findClaudeAgentProfile
} from '../../../shared/agent-profile/claude-profile-startup-args'
import {
  claudeProfileLaunchFiles,
  isSafeAgentProfileId
} from '../../../shared/agent-profile/claude-profile-files'
import { buildClaudeProfileLaunch } from '../../../shared/agent-profile/claude-profile-launch-args'
import { buildClaudeProfileSoll } from '../../../shared/agent-profile/loadout/claude-profile-soll'
import { recordProfileRun } from '../../claude-usage/loadout/profile-run-registry'
import { readClaudePluginInventory } from '../plugin-inventory/claude-plugin-inventory'
import { materializeClaudeProfileFiles } from './claude-profile-file-materialization'
import { agentProfilePreflightErrors } from '../../../shared/agent-profile/agent-profile-preflight'
import { runClaudeProfilePreflight } from './agent-profile-preflight'

/** Write the files a profile start points at; refuses what the renderer's plan cannot have covered. */
export async function prepareAgentProfileForPtySpawn(args: {
  profileId: unknown
  connectionId?: string | null
  cwd?: string
  settings: Pick<GlobalSettings, 'agentProfiles'> | undefined
  userDataDir?: string
}): Promise<void> {
  if (typeof args.profileId !== 'string' || !isSafeAgentProfileId(args.profileId)) {
    throw new AgentProfileLaunchError('agent_profile_id_invalid')
  }
  // Why: a remote host cannot read this machine's userData, and the profile argv would point there.
  if (args.connectionId) {
    throw new AgentProfileLaunchError('agent_profile_host_unsupported')
  }
  const profile = findClaudeAgentProfile(args.settings?.agentProfiles, args.profileId)
  // Why: routing a start through a managed account is not wired yet; the default account would be a silent mismatch.
  if (profile.accountId) {
    throw new AgentProfileLaunchError('agent_profile_account_unsupported')
  }
  // Why: Claude accepts a wrong loadout silently, so the start would run green while doing less than configured.
  const blocking = agentProfilePreflightErrors(
    await runClaudeProfilePreflight({ profile, cwd: args.cwd ?? null })
  )
  if (blocking.length) {
    throw new AgentProfileLaunchError('agent_profile_preflight_failed', blocking)
  }
  const rootDir = args.userDataDir ?? join(getAppEnvironment().getPath('userData'))
  const files = claudeProfileLaunchFiles(rootDir, profile.id)
  const installedPlugins = profile.enabledPlugins
    ? (await readClaudePluginInventory({ accountHomePath: null, cwd: args.cwd ?? null })).plugins
    : []
  await materializeClaudeProfileFiles(
    buildClaudeProfileLaunch(profile, {
      installedPluginIds: installedPlugins.map((plugin) => plugin.id),
      files
    }),
    files
  )
  // Why: the run record only feeds usage reporting; a failed write must not stop the agent starting.
  await recordProfileRun(rootDir, {
    runId: randomUUID(),
    profileId: profile.id,
    profileName: profile.name,
    cwd: args.cwd ?? null,
    startedAt: Date.now(),
    soll: buildClaudeProfileSoll(profile, installedPlugins)
  }).catch((error: unknown) => console.warn('[agent-profile] run record not written', error))
}
