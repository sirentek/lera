import { useStore } from '@nanostores/react'

import { useI18n } from '@/i18n'
import { modelBaseId, modelDisplayParts, reasoningEffortLabel } from '@/lib/model-status-label'
import { $currentFastMode, $currentModel, $currentReasoningEffort } from '@/store/session'
import { useTheme } from '@/themes/context'

/**
 * Holo-skin model readout docked at the foot of the left chat sidebar (above
 * the profile rail): the live model name plus the session's reasoning effort
 * and fast/thinking state — the same trio the status-bar chip carries as plain
 * text (formatModelStatusLabel), surfaced here as its own HUD card. Holo-only;
 * the statusbar already shows these numbers for every other skin (styles live
 * in styles/holo.css, reusing the chamfered HUD-card frame grammar).
 */
export function ModelHud() {
  const { themeName } = useTheme()
  const { t } = useI18n()
  const model = useStore($currentModel)
  const reasoningEffort = useStore($currentReasoningEffort)
  const fastMode = useStore($currentFastMode)

  if (themeName !== 'holo') {
    return null
  }

  const { name, tag } = modelDisplayParts(model)
  // Fast is on when the speed=fast param is set OR the active model is a
  // `…-fast` variant — same rule the status-bar label uses.
  const isFast = fastMode || /-fast$/i.test(modelBaseId(model))
  // Thinking is off only when effort is an explicit "none"; empty = Hermes
  // default (medium) = on.
  const effortKey = (reasoningEffort || 'medium').trim().toLowerCase()
  const thinkingOn = effortKey !== 'none'
  const effortLabel = reasoningEffortLabel(reasoningEffort) || t.shell.modelMenu.medium

  return (
    <section aria-label={t.shell.modelMenu.search} data-slot="model-hud">
      <header>
        <span>MODEL</span>
      </header>
      <div className="mhud-name" title={model || undefined}>
        {name || '—'}
        {tag ? <em>{tag}</em> : null}
      </div>
      <div className="mhud-kvs">
        <div>
          <span>{t.shell.modelOptions.effort}</span>
          <b data-on={thinkingOn}>{thinkingOn ? effortLabel : '—'}</b>
        </div>
        <div>
          <span>{t.shell.modelOptions.thinking}</span>
          <b data-on={thinkingOn}>{thinkingOn ? 'ON' : 'OFF'}</b>
        </div>
        <div>
          <span>{t.shell.modelOptions.fast}</span>
          <b data-on={isFast}>{isFast ? 'ON' : 'OFF'}</b>
        </div>
      </div>
    </section>
  )
}
