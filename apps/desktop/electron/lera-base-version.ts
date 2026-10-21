// lera-base-version.ts — Lera fork only.
//
// Checks whether the upstream base (hermes) has a newer MINOR version than the
// one this Lera checkout was forked from, so the desktop app can surface an
// "update available" hint. Since 0.22 upstream no longer writes __version__ into
// hermes_cli/__init__.py (it is 0.0.0 there and comes from release tags), so the
// base version is the highest stable `vX.Y.Z` tag on the upstream/origin remote.

// Mirrors upstream's STABLE_TAG_RE (hermes_cli/update_channel.py): the 1–3 digit
// major keeps the old CalVer `v2026.9.24` tags and `+canary`/`rc.*` tags out.
const STABLE_TAG_RE = /^v((?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/

type RunGit = (args: string[], opts: { cwd: string }) => Promise<{ code: number; stdout?: string; stderr?: string }>

function parseHermesVersion(source: string | null | undefined): string | null {
  const match = String(source || '').match(/__version__\s*=\s*["']([^"']+)["']/)

  return match?.[1] ?? null
}

function latestStableVersion(lsRemoteOutput: string | null | undefined): string | null {
  const versions = String(lsRemoteOutput || '')
    .split(/\r?\n/)
    .map(line => line.match(/refs\/tags\/(\S+)\s*$/)?.[1]?.match(STABLE_TAG_RE)?.[1])
    .filter((version): version is string => Boolean(version))

  const parts = (version: string) => version.split('.').map(Number)

  return (
    versions.sort((a, b) => {
      const [pa, pb] = [parts(a), parts(b)]

      return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2]
    })[versions.length - 1] ?? null
  )
}

function minorVersion(version: string | null | undefined): number | null {
  const match = String(version || '')
    .trim()
    .match(/^v?\d+\.(\d+)(?:\.|$)/)

  return match ? Number.parseInt(match[1], 10) : null
}

function isRemoteMinorAhead(
  currentVersion: string | null | undefined,
  baseVersion: string | null | undefined
): boolean {
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
  const listed = await runGit(['ls-remote', '--tags', '--refs', remote, 'v*'], { cwd })

  if (listed.code !== 0) {
    throw new Error(String(listed.stderr || '').trim() || `Could not list ${remote} tags.`)
  }

  const baseVersion = latestStableVersion(listed.stdout)

  if (!baseVersion) {
    throw new Error(`Could not find a stable release tag on ${remote}.`)
  }

  return {
    baseVersion,
    checkedAt: Date.now(),
    currentVersion,
    remote,
    updateAvailable: isRemoteMinorAhead(currentVersion, baseVersion)
  }
}

export { checkLeraBaseVersion, isRemoteMinorAhead, latestStableVersion, minorVersion, parseHermesVersion }
