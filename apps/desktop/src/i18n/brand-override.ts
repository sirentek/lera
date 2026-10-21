// Brand override: every user-facing "Hermes" becomes "Lera" without touching
// the upstream translation sources or components. This runs once as an import
// side effect (see main.tsx) and works in two layers:
//
//  1. The i18n catalog — every locale's strings, string arrays and template
//     functions are rewritten in place before any UI reads them.
//  2. The live DOM — a MutationObserver rewrites text nodes and a few
//     user-visible attributes, which catches the strings upstream hard-codes
//     outside i18n (quick entry, status rows, settings constants, plugins…).
//
// The word rules live in ./brand. Keeping all of this here means the upstream
// files stay untouched and easy to merge.

import { rebrand } from './brand'
import { TRANSLATIONS } from './catalog'

// The product name shown to users. The About heading renders this verbatim
// (CSS uppercases it to "LERA" in the holo theme).
const PRODUCT_NAME = 'LERA'

// ── Layer 1: the i18n catalog ────────────────────────────────────────────────

function rebrandValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return rebrand(value)
  }

  if (typeof value === 'function') {
    const template = value as (...args: unknown[]) => unknown

    return (...args: unknown[]) => {
      const result = template(...args)

      return typeof result === 'string' ? rebrand(result) : result
    }
  }

  if (Array.isArray(value)) {
    return value.map(rebrandValue)
  }

  if (typeof value === 'object' && value !== null) {
    const tree = value as Record<string, unknown>

    for (const key of Object.keys(tree)) {
      tree[key] = rebrandValue(tree[key])
    }
  }

  return value
}

for (const t of Object.values(TRANSLATIONS)) {
  rebrandValue(t)

  // About page search + boot splash use the uppercase product mark. (0.22.3
  // dropped the about.heading key; the DOM layer below rebrands that page.)
  t.settings.searchPlaceholder.about = `About ${PRODUCT_NAME}`
  t.boot.ready = `${PRODUCT_NAME} is ready`
  t.boot.steps.startingHermesDesktop = `Starting ${PRODUCT_NAME}…`
}

// ── Layer 2: hard-coded strings in the live DOM ──────────────────────────────

// Chat transcripts and anything the user types are content, not UI chrome —
// never rewrite those.
const SKIP_SELECTOR = [
  '[data-slot="aui_assistant-message-root"]',
  '[data-slot="aui_user-message-root"]',
  '[contenteditable]:not([contenteditable="false"])',
  'textarea',
  'input',
  'pre',
  'code',
  'script',
  'style'
].join(',')

const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt']

const ATTRIBUTE_SELECTOR = ATTRIBUTES.map(name => `[${name}*="Hermes"]`).join(',')

function rebrandText(node: Text) {
  const value = node.nodeValue

  if (!value || !value.includes('Hermes') || node.parentElement?.closest(SKIP_SELECTOR)) {
    return
  }

  const next = rebrand(value)

  if (next !== value) {
    node.nodeValue = next
  }
}

function rebrandAttributes(element: Element) {
  // Attributes are UI chrome even on inputs (a textarea's placeholder), so
  // only transcript content is excluded here.
  if (element.closest('[data-slot="aui_assistant-message-root"],[data-slot="aui_user-message-root"]')) {
    return
  }

  for (const name of ATTRIBUTES) {
    const value = element.getAttribute(name)

    if (value && value.includes('Hermes')) {
      element.setAttribute(name, rebrand(value))
    }
  }
}

function rebrandTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    rebrandText(root as Text)

    return
  }

  if (root.nodeType !== Node.ELEMENT_NODE) {
    return
  }

  const element = root as Element

  rebrandAttributes(element)
  element.querySelectorAll(ATTRIBUTE_SELECTOR).forEach(rebrandAttributes)

  if (!element.textContent?.includes('Hermes')) {
    return
  }

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    rebrandText(node as Text)
  }
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') {
        rebrandText(record.target as Text)
      } else if (record.type === 'attributes') {
        rebrandAttributes(record.target as Element)
      } else {
        record.addedNodes.forEach(rebrandTree)
      }
    }
  })

  // documentElement (not body) so <title> — the Electron window title — is
  // covered too.
  observer.observe(document.documentElement, {
    attributeFilter: ATTRIBUTES,
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true
  })

  rebrandTree(document.documentElement)
}
