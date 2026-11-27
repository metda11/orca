import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  ClaudeProfileLaunch,
  ClaudeProfileLaunchFiles
} from '../../../shared/agent-profile/claude-profile-launch-args'

async function writeFileAtomically(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  // A concurrent launch of the same profile must never read a half-written file.
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, content, 'utf8')
  await rename(temporary, path)
}

/** Write the files a profile launch points at; call right before the PTY spawns. */
export async function materializeClaudeProfileFiles(
  launch: Pick<ClaudeProfileLaunch, 'settings' | 'mcpConfig'>,
  files: ClaudeProfileLaunchFiles
): Promise<void> {
  await Promise.all([
    launch.settings ? writeFileAtomically(files.settingsPath, launch.settings.content) : undefined,
    launch.mcpConfig
      ? writeFileAtomically(files.mcpConfigPath, launch.mcpConfig.content)
      : undefined
  ])
}
