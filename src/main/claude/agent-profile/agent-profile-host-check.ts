import { isWslShellName } from '../../../shared/shell/launch/local-windows-terminal-runtime'
import { isWslUncPath } from '../../../shared/file-access/wsl-paths'
import type { AgentLaunchRuntime } from '../../../shared/agent-launch/startup/agent-launch-runtime'
import { AgentProfileLaunchError } from '../../../shared/agent-profile/claude-profile-startup-args'

/** Why: the profile files sit in this machine's userData, which a WSL agent cannot read. */
export function assertAgentProfileHostIsLocal(args: {
  cwd: string | null | undefined
  runtime: AgentLaunchRuntime | Error
}): void {
  const { cwd, runtime } = args
  // An unresolved runtime fails the launch on its own.
  if (runtime instanceof Error) {
    return
  }
  if (
    isWslShellName(runtime.pty.shellOverride) ||
    runtime.platform !== process.platform ||
    (cwd && isWslUncPath(cwd))
  ) {
    throw new AgentProfileLaunchError('agent_profile_host_unsupported')
  }
}
