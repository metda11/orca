import { runProcess } from '@orca/process-host'
import { claudeConfigDirEnvPatch } from '../structured/launch/claude-config-dir-pin'
import {
  claudeProbeEnv,
  resolveClaudeChildEnvSources
} from '../structured/launch/claude-structured-child-env'
import { readClaudePluginInventory } from '../plugin-inventory/claude-plugin-inventory'
import type { ClaudePluginInventory } from '../../../shared/claude-plugins/claude-plugin-inventory'
import { parsePluginDetailsAlwaysOn } from './claude-plugin-details-parse'
import {
  createPluginWeightMeter,
  type PluginWeightMeter,
  type PluginWeightReading
} from './claude-plugin-weight-meter'

// The CLI needs seconds per plugin and up to 20 s when cold.
const PLUGIN_DETAILS_TIMEOUT_MS = 60_000

async function measureWithClaudeCli(
  accountHomePath: string | null,
  target: { id: string }
): Promise<number> {
  const sources = await resolveClaudeChildEnvSources({})
  const env = {
    ...claudeProbeEnv(sources),
    ...(accountHomePath ? claudeConfigDirEnvPatch(accountHomePath) : {})
  }
  const result = await runProcess({
    program: sources.command,
    args: [...sources.prefixArgs, 'plugin', 'details', target.id],
    env,
    cwd: accountHomePath ?? process.cwd(),
    terminationBarrier: true,
    timeoutMs: PLUGIN_DETAILS_TIMEOUT_MS,
    maxOutputBytes: 256 * 1024
  })
  const tokens = result.code === 0 ? parsePluginDetailsAlwaysOn(result.stdout) : null
  if (tokens === null) {
    throw new Error('claude plugin details gave no always-on figure')
  }
  return tokens
}

let meter: PluginWeightMeter | null = null
function pluginWeightMeter(): PluginWeightMeter {
  meter ??= createPluginWeightMeter({
    // The scope is the account folder, which `readClaudePluginInventory` already resolved.
    measure: (scope, target) => measureWithClaudeCli(scope || null, target)
  })
  return meter
}

export type ClaudePluginWeightResult = PluginWeightReading & {
  /** Installed plugins and workspace servers the profile editor weighs against the measurements. */
  inventory: ClaudePluginInventory
}

/** The inventory plus whatever plugin measurements exist; missing ones are measured in the background. */
export async function readClaudePluginWeights(request: {
  accountHomePath: string | null
  cwd: string | null
  refresh?: boolean
}): Promise<ClaudePluginWeightResult> {
  const inventory = await readClaudePluginInventory(request)
  const reading = pluginWeightMeter().read(
    inventory.configDir,
    inventory.plugins
      .filter((plugin) => plugin.problem !== 'missing-folder')
      .map((plugin) => ({
        id: plugin.id,
        installPath: plugin.installPath,
        ...(plugin.version ? { version: plugin.version } : {})
      }))
  )
  return { ...reading, inventory }
}
