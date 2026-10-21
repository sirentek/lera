// The Lera brand rewrite, side-effect free so prompt builders (onboarding
// SOUL/runbook) can import it without pulling in brand-override's catalog
// patch and DOM observer.
//
// Only the capitalised word is touched, so `hermes` CLI commands, ~/.hermes
// paths and HERMES_* env vars stay correct. "Hermes Desktop" / "Hermes Agent"
// collapse to the bare name ("Lera", not "Lera Desktop"); "Hermes Cloud" is
// Nous' hosted service you actually sign in to, so it keeps its real name.

export const BRAND_NAME = 'Lera'

const BRAND_PATTERN = /\bHermes(?: Desktop| Agent)?\b(?! Cloud)/g

export function rebrand(text: string): string {
  return text.includes('Hermes') ? text.replace(BRAND_PATTERN, BRAND_NAME) : text
}
