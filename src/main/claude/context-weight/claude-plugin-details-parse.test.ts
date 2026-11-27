import { describe, expect, it } from 'vitest'
import { parsePluginDetailsAlwaysOn } from './claude-plugin-details-parse'

describe('parsePluginDetailsAlwaysOn', () => {
  it('reads plain and k-suffixed figures from the projected cost block', () => {
    const output = (figure: string) =>
      `Projected token cost\n  Always-on:   ${figure}   added to every session\n`
    expect(parsePluginDetailsAlwaysOn(output('~848 tok'))).toBe(848)
    expect(parsePluginDetailsAlwaysOn(output('~1.2k tok'))).toBe(1200)
  })

  it('ignores per-component rows and output without the block', () => {
    expect(parsePluginDetailsAlwaysOn('  brainstorming   ~70   ~5.4k\n')).toBeNull()
    expect(parsePluginDetailsAlwaysOn('')).toBeNull()
  })
})
