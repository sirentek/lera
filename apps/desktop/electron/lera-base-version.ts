// lera-base-version.ts — Lera fork only.
//
// Checks whether the upstream base (hermes) has a newer MINOR version than the
// one this Lera checkout was forked from, so the desktop app can surface an
// "update available" hint. Reads hermes_cli/__init__.py's __version__ from the
// fork's upstream/origin main and compares minors.

const BASE_VERSION_PATH = 'hermes_cli/__init__.py'

type RunGit = (
  args: string[],
  opts: { cwd: string }
) => Promise<{ code: number; stdout?: string; stderr?: string }>

function parseHermesVersion(source: string | null | undefined): string | null {
  const match = String(source || '').match(/__version__\s*=\s*["']([^"']+)["']/)
  return match?.[1] ?? null
}

function minorVersion(version: string | null | undefined): number | null {
  const match = String(version || '')
    .trim()
    .match(/^v?\d+\.(\d+)(?:\.|$)/)
  return match ? Number.parseInt(match[1], 10) : null
}

function isRemoteMinorAhead(currentVersion: string | null | undefined, baseVersion: string | null | undefined): boolean {
  const currentMinor = minorVersion(currentVersion)
  const baseMinor = minorVersion(baseVersion)

  return currentMinor !== null && baseMinor !== null && baseMinor > currentMinor
}

async function checkLeraBaseVersion({
  cwd,
  currentVersion,
  runGit
}: {
  cwd: string
  currentVersion: string
  runGit: RunGit
}) {
  const remotesResult = await runGit(['remote'], { cwd })
  const remotes = String(remotesResult.stdout || '')
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean)
  const remote = remotes.includes('upstream') ? 'upstream' : 'origin'
  const fetched = await runGit(['fetch', '--quiet', remote, 'main'], { cwd })

  if (fetched.code !== 0) {
    throw new Error(String(fetched.stderr || '').trim() || `Could not fetch ${remote}/main.`)
  }

  const shown = await runGit(['show', `${remote}/main:${BASE_VERSION_PATH}`], { cwd })
  const baseVersion = shown.code === 0 ? parseHermesVersion(shown.stdout) : null

  if (!baseVersion) {
    throw new Error(`Could not read the base version from ${remote}/main.`)
  }

  return {
    baseVersion,
    checkedAt: Date.now(),
    currentVersion,
    remote,
    updateAvailable: isRemoteMinorAhead(currentVersion, baseVersion)
  }
}

export { checkLeraBaseVersion, isRemoteMinorAhead, minorVersion, parseHermesVersion }
