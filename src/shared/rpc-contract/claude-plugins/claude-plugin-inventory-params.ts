import { z } from 'zod'
import { lazyZodSchema } from '../../schema/lazy-zod-schema'

// `accountHomePath`: the account's CLAUDE_CONFIG_DIR; without it the host's own default account.
export const ClaudePluginInventoryParams = lazyZodSchema(() =>
  z
    .object({
      worktreeId: z.string().min(1).max(512).optional(),
      cwd: z.string().min(1).max(4096).optional(),
      accountHomePath: z.string().min(1).max(4096).optional(),
      refresh: z.boolean().optional()
    })
    .strict()
)
