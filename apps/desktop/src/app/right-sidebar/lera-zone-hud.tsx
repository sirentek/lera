// Lera-only: the CODEX ANALYTICS / CLAUDE PLAN USAGE cards hang off the BOTTOM
// of the sessions zone, not off the sessions PANE. SESSIONS and BOTS are two
// tabs of one PaneShell zone, so anything mounted inside the sessions pane goes
// invisible with it the moment the zone flips to BOTS (the pane stays mounted —
// see the bounded keep-alive in tree-group.tsx — it just loses visibility).
// Mounting the cards on the zone instead keeps one instance (one poll, one
// scramble state) on screen under either tab.
//
// The cards used to live inside [data-slot='sidebar'], which paid for their
// gutter and stacking order. The surrounding pane-body-stack now supplies one
// shared wall-mount transform to both the pane and these cards; applying a
// second local transform here would put the frames on different perspective
// planes.
import { useStore } from '@nanostores/react'

import { $panesFlipped } from '@/store/layout'
import { useTheme } from '@/themes/context'

import { ClaudeHud } from './claude-hud'
import { CodexHud } from './codex-hud'

/** `panes` is the zone's tab list — the cards belong to the zone that owns the
 *  sessions sidebar, whichever tab of it is currently on top. */
export function LeraZoneHud({ panes }: { panes: string[] }) {
  const { themeName } = useTheme()
  const panesFlipped = useStore($panesFlipped)

  // Both cards render null off the holo skin; skip the wrapper too so no other
  // theme gains a stray flex row under the zone.
  if (themeName !== 'holo' || !panes.includes('sessions')) {
    return null
  }

  return (
    <div className="flex shrink-0 flex-col" data-flipped={panesFlipped || undefined} data-slot="lera-zone-hud">
      <CodexHud />
      <ClaudeHud />
    </div>
  )
}
