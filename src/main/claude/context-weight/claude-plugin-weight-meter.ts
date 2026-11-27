// Measures plugins in the background and answers from the cache at once: `claude plugin details`
// takes seconds per plugin, so no caller waits on it.
export type PluginWeightTarget = { id: string; version?: string; installPath: string }

export type PluginWeightReading = {
  /** Always-on tokens by plugin id, for plugins already measured. */
  measurements: Record<string, number>
  /** Queued or running; read again later. */
  pending: string[]
  /** Measuring failed recently; retried after a pause. */
  failed: string[]
}

export type PluginWeightMeter = {
  read: (scope: string, targets: PluginWeightTarget[]) => PluginWeightReading
}

const MAX_CACHED = 512
const FAILURE_RETRY_MS = 60_000

export function createPluginWeightMeter(deps: {
  measure: (scope: string, target: PluginWeightTarget) => Promise<number>
  concurrency?: number
  now?: () => number
  onSettled?: () => void
}): PluginWeightMeter {
  const concurrency = deps.concurrency ?? 2
  const now = deps.now ?? Date.now
  const done = new Map<string, number>()
  const failedAt = new Map<string, number>()
  const queued: { key: string; scope: string; target: PluginWeightTarget }[] = []
  const running = new Set<string>()

  // The org sync renames plugin folders per generation, so path and version are part of the key.
  const keyOf = (scope: string, target: PluginWeightTarget) =>
    JSON.stringify([scope, target.id, target.version ?? null, target.installPath])

  const pump = (): void => {
    while (running.size < concurrency && queued.length > 0) {
      const job = queued.shift()!
      running.add(job.key)
      void deps
        .measure(job.scope, job.target)
        .then(
          (tokens) => {
            done.delete(job.key)
            done.set(job.key, tokens)
            for (const oldest of done.keys()) {
              if (done.size <= MAX_CACHED) {
                break
              }
              done.delete(oldest)
            }
          },
          () => {
            failedAt.set(job.key, now())
          }
        )
        .finally(() => {
          running.delete(job.key)
          pump()
          deps.onSettled?.()
        })
    }
  }

  return {
    read(scope, targets) {
      const reading: PluginWeightReading = { measurements: {}, pending: [], failed: [] }
      for (const target of targets) {
        const key = keyOf(scope, target)
        const tokens = done.get(key)
        if (tokens !== undefined) {
          reading.measurements[target.id] = tokens
          continue
        }
        const failed = failedAt.get(key)
        if (failed !== undefined && now() - failed < FAILURE_RETRY_MS) {
          reading.failed.push(target.id)
          continue
        }
        failedAt.delete(key)
        reading.pending.push(target.id)
        if (!running.has(key) && !queued.some((job) => job.key === key)) {
          queued.push({ key, scope, target })
        }
      }
      pump()
      return reading
    }
  }
}
