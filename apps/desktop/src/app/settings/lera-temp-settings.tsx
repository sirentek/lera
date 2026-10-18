import { type KeyboardEvent, useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Clock } from '@/lib/icons'
import { notify, notifyError } from '@/store/notifications'

import { ListRow, SectionHeading } from './primitives'

/**
 * Lera-only: the temp folder new chat sessions start in, and how long its
 * files live. Stored in HERMES_HOME/lera-temp.json by the lera-temp backend
 * plugin (HERMES_HOME/plugins/lera-temp, outside the repo) and read from there
 * by Lera-Source/Run.bat (session cwd) and the "Lera Temp Cleanup" scheduled
 * task (deletes files older than `retentionDays` days, oldest first).
 *
 * Lives in its own file so an upstream sync only ever sees the two mount
 * lines in sessions-settings.tsx.
 */

const ENDPOINT = '/api/plugins/lera-temp/settings'
const MIN_DAYS = 1
const MAX_DAYS = 3650

interface LeraTempSettingsPayload {
  ok: boolean
  error?: string
  path?: string
  retentionDays?: number
  activePath?: null | string
}

const samePath = (a: null | string | undefined, b: null | string | undefined) =>
  (a ?? '').replace(/[\\/]+$/, '').toLowerCase() === (b ?? '').replace(/[\\/]+$/, '').toLowerCase()

export function LeraTempSetting() {
  const [saved, setSaved] = useState<LeraTempSettingsPayload | null>(null)
  const [loadError, setLoadError] = useState<null | string>(null)
  const [path, setPath] = useState('')
  const [days, setDays] = useState('')
  const [busy, setBusy] = useState(false)

  const apply = useCallback((payload: LeraTempSettingsPayload) => {
    setSaved(payload)
    setPath(payload.path ?? '')
    setDays(String(payload.retentionDays ?? ''))
  }, [])

  useEffect(() => {
    const api = window.hermesDesktop?.api

    if (!api) {
      return
    }

    let alive = true

    void api<LeraTempSettingsPayload>({ path: ENDPOINT })
      .then(payload => {
        if (!alive) {
          return
        }

        if (payload?.ok) {
          apply(payload)
        } else {
          setLoadError(payload?.error || 'Unknown error')
        }
      })
      .catch(err => {
        if (alive) {
          setLoadError(err instanceof Error ? err.message : String(err))
        }
      })

    return () => {
      alive = false
    }
  }, [apply])

  const parsedDays = Number(days)
  const daysValid = Number.isInteger(parsedDays) && parsedDays >= MIN_DAYS && parsedDays <= MAX_DAYS
  const dirty = !!saved && (path.trim() !== (saved.path ?? '') || parsedDays !== saved.retentionDays)

  const save = useCallback(async () => {
    const api = window.hermesDesktop?.api

    if (!api || !daysValid || !path.trim()) {
      return
    }

    setBusy(true)

    try {
      const payload = await api<LeraTempSettingsPayload>({
        body: { path: path.trim(), retentionDays: parsedDays },
        method: 'PUT',
        path: ENDPOINT
      })

      if (!payload?.ok) {
        throw new Error(payload?.error || 'Save failed')
      }

      apply(payload)
      notify({ durationMs: 4_000, kind: 'success', message: 'Lera temp folder saved' })
    } catch (err) {
      notifyError(err, 'Could not save the Lera temp folder')
    } finally {
      setBusy(false)
    }
  }, [apply, daysValid, parsedDays, path])

  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && dirty) {
      void save()
    }
  }

  const caption = 'text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)'
  const needsRestart = !!saved?.path && !!saved.activePath && !samePath(saved.path, saved.activePath)

  return (
    <div className="mb-6">
      <SectionHeading icon={Clock} title="Lera temp folder" />
      <p className={`mb-2 ${caption}`}>
        New chats start in this folder, so the files Lera downloads or creates on the side collect here instead of in
        your projects. A scheduled task deletes files older than the retention period every day at 03:30, oldest first.
      </p>

      {loadError ? (
        <ListRow description={loadError} title="Lera temp plugin not reachable" />
      ) : (
        <>
          <ListRow
            action={
              <Input
                aria-label="Lera temp folder path"
                disabled={!saved || busy}
                onChange={e => setPath(e.target.value)}
                onKeyDown={onEnter}
                placeholder="C:\Lera-Temp"
                spellCheck={false}
                value={path}
              />
            }
            description={
              needsRestart ? `Restart Lera to switch new chats over (this run uses ${saved?.activePath}).` : undefined
            }
            title="Folder"
          />
          <ListRow
            action={
              <div className="flex items-center gap-2">
                <Input
                  aria-invalid={!daysValid}
                  aria-label="Retention in days"
                  className="w-24"
                  disabled={!saved || busy}
                  max={MAX_DAYS}
                  min={MIN_DAYS}
                  onChange={e => setDays(e.target.value)}
                  onKeyDown={onEnter}
                  type="number"
                  value={days}
                />
                <span className={caption}>days</span>
                <Button
                  disabled={!dirty || !daysValid || !path.trim() || busy}
                  onClick={() => void save()}
                  size="sm"
                  type="button"
                  variant="textStrong"
                >
                  Save
                </Button>
              </div>
            }
            description={`Files older than this many days are deleted (${MIN_DAYS}–${MAX_DAYS} days).`}
            title="Retention"
          />
        </>
      )}
    </div>
  )
}
