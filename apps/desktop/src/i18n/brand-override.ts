// Brand override: rename the user-facing "Hermes Desktop" product label to
// "LERA" without touching the per-locale translation sources. This runs once
// as an import side effect (see main.tsx) and patches the already-built
// TRANSLATIONS catalog in place, so every locale and every consumer of these
// keys (About page heading, boot splash, search placeholder) picks up the new
// name. Keeping it here means the upstream i18n files stay untouched and easy
// to merge.

import { TRANSLATIONS } from './catalog'

// The product name shown to users. The About heading renders this verbatim
// (CSS uppercases it to "LERA" in the holo theme).
const PRODUCT_NAME = 'LERA'

for (const t of Object.values(TRANSLATIONS)) {
  // About page heading — the string in the screenshot ("HERMES DESKTOP").
  t.settings.about.heading = PRODUCT_NAME

  // Keep the rest of the surface consistent so we don't end up half-rebranded.
  t.settings.searchPlaceholder.about = `About ${PRODUCT_NAME}`
  t.boot.ready = `${PRODUCT_NAME} is ready`
  t.boot.steps.startingHermesDesktop = `Starting ${PRODUCT_NAME}…`
}
