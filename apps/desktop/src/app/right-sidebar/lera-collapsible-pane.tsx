import '@/app/right-sidebar/lera-hud.css'

import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'

import { playHoloCollapse, playHoloExpand } from '@/app/right-sidebar/lera-collapse-motion'
import { LeraRestoreTab } from '@/app/right-sidebar/lera-restore-tab'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { useTheme } from '@/themes/context'

interface LeraCollapsiblePaneProps {
  children: ReactNode
  pane: 'sessions' | 'files'
  restoreSide?: 'left' | 'right'
  slot: 'sidebar-panel' | 'right-sidebar-panel'
  tabLabel?: string
  title: string
}

export function LeraCollapsiblePane({
  children,
  pane,
  restoreSide = 'right',
  slot,
  tabLabel,
  title
}: LeraCollapsiblePaneProps) {
  const { t } = useI18n()
  const { themeName } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const panelId = useId()
  const dock = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const expanding = useRef(false)
  const collapseButton = useRef<HTMLButtonElement>(null)
  const restoreButton = useRef<HTMLButtonElement>(null)
  const focusToggle = useRef(false)
  const isHolo = themeName === 'holo'
  const isCollapsed = isHolo && collapsed

  useLayoutEffect(() => {
    if (focusToggle.current) {
      ;(isCollapsed ? restoreButton : collapseButton).current?.focus()
      focusToggle.current = false
    }

    if (!isCollapsed && expanding.current) {
      expanding.current = false
      playHoloExpand(panel.current, restoreSide)
    }
  }, [isCollapsed, restoreSide])

  useLayoutEffect(() => {
    const element = dock.current

    if (!isCollapsed || !element) {
      return
    }

    const placeTab = () => {
      const tab = element.querySelector<HTMLElement>('.hud-collapse-rail')

      if (!tab) {
        return
      }

      const bounds = element.getBoundingClientRect()
      const halfHeight = tab.getBoundingClientRect().height / 2

      const stack = element.closest('[data-slot="right-sidebar"]') ?? element.closest('[data-slot="pane-body-stack"]')
      const peers = stack?.querySelectorAll<HTMLElement>('.hud-collapse-rail')

      let upperCenter = bounds.top + bounds.height / 2

      for (const peer of peers ?? []) {
        if (peer === tab) {
          continue
        }

        upperCenter = Math.min(upperCenter, peer.getBoundingClientRect().top - halfHeight - 8)
      }

      tab.style.setProperty('--hud-pane-center-shift', `${Math.max(0, bounds.top + bounds.height / 2 - upperCenter)}px`)
    }

    placeTab()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(placeTab)
    observer.observe(element)

    return () => observer.disconnect()
  }, [isCollapsed])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-hud-dock={pane} ref={dock}>
      {isCollapsed && (
        <LeraRestoreTab
          buttonRef={restoreButton}
          controls={panelId}
          offset={0}
          onRestore={() => {
            focusToggle.current = true
            expanding.current = true
            setCollapsed(false)
          }}
          side={restoreSide}
          tabLabel={tabLabel ?? title.toUpperCase()}
          title={title}
        />
      )}
      <div
        aria-hidden={isCollapsed || undefined}
        className="flex min-h-0 flex-1 flex-col"
        data-collapsed={isCollapsed || undefined}
        data-slot={slot}
        hidden={pane === 'sessions' && isCollapsed}
        id={panelId}
        inert={isCollapsed}
        ref={panel}
      >
        {children}
      </div>
      {isHolo && !isCollapsed && (
        <Tip label={t.common.collapse}>
          <Button
            aria-controls={panelId}
            aria-expanded={true}
            aria-label={`${t.common.collapse} ${title}`}
            className={`hud-collapse-button lera-pane-collapse lera-${pane}-collapse`}
            onClick={() => {
              if (closing.current) {
                return
              }

              closing.current = true
              playHoloCollapse(panel.current, restoreSide, () => {
                closing.current = false
                focusToggle.current = true
                setCollapsed(true)
              })
            }}
            ref={collapseButton}
            size="inline"
            type="button"
            variant="ghost"
          >
            {restoreSide === 'left' ? (
              <IconChevronLeft className="size-2.5" />
            ) : (
              <IconChevronRight className="size-2.5" />
            )}
          </Button>
        </Tip>
      )}
    </div>
  )
}
