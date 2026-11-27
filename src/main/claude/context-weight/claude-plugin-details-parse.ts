const ALWAYS_ON_LINE = /^\s*Always-on:\s*~?([\d.]+)\s*(k)?\s*tok/im

/** The "Always-on" token figure of `claude plugin details` output, or null when it is not there. */
export function parsePluginDetailsAlwaysOn(output: string): number | null {
  const match = ALWAYS_ON_LINE.exec(output)
  if (!match) {
    return null
  }
  const value = Number(match[1])
  if (!Number.isFinite(value)) {
    return null
  }
  return Math.round(match[2] ? value * 1000 : value)
}
