import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/context'

import type { useHudManualRefresh } from './lera-hud-refresh'
import { LeraRestoreTab } from './lera-restore-tab'

export interface LeraHudDockProps {
  onCollapsedHeightChange?: (height: number) => void
  restoreOffset?: number
  restoreSide?: 'left' | 'right'
}

interface LeraCollapsibleHudProps extends LeraHudDockProps {
  bodyClassName?: string
  children: ReactNode
  hud: 'claude' | 'codex' | 'firecrawl' | 'context' | 'model'
  label: string
  plan?: string | null
  refreshing?: boolean
  showPlan?: boolean
  slot?: 'lera-hud' | 'context-hud' | 'model-hud'
  tabLabel: string
  title: string
  triggerProps?: ReturnType<typeof useHudManualRefresh>['triggerProps']
}

export function LeraCollapsibleHud({
  bodyClassName,
  children,
  hud,
  label,
  onCollapsedHeightChange,
  plan,
  refreshing = false,
  restoreOffset = 0,
  restoreSide = 'right',
  showPlan = true,
  slot = 'lera-hud',
  tabLabel,
  title,
  triggerProps
}: LeraCollapsibleHudProps) {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(false)
  const [panelHeight, setPanelHeight] = useState(0)
  const panelId = useId()
  const panel = useRef<HTMLElement>(null)
  const focusToggle = useRef(false)
  const collapseButton = useRef<HTMLButtonElement>(null)
  const restoreButton = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (focusToggle.current) {
      ;(collapsed ? restoreButton : collapseButton).current?.focus()
      focusToggle.current = false
    }
  }, [collapsed])

  useEffect(() => () => onCollapsedHeightChange?.(0), [onCollapsedHeightChange])

  return (
    <div className="hud-collapse-dock" data-hud-dock={hud}>
      {collapsed && (
        <LeraRestoreTab
          buttonRef={restoreButton}
          controls={panelId}
          offset={panelHeight / 2 + restoreOffset}
          onRestore={() => {
            focusToggle.current = true
            setCollapsed(false)
            onCollapsedHeightChange?.(0)
          }}
          side={restoreSide}
          tabLabel={tabLabel}
          title={title}
        />
      )}
      <section
        aria-busy={triggerProps?.['aria-busy']}
        aria-label={label}
        data-hud={hud}
        data-refreshing={triggerProps?.['data-refreshing']}
        data-slot={slot}
        hidden={collapsed}
        id={panelId}
        onClick={triggerProps?.onClick}
        ref={panel}
      >
        <header>
          <span>{title}</span>
          {refreshing ? (
            <small className="hud-refresh-tag">
              REFRESHING
              <span className="hud-refresh-dot">.</span>
              <span className="hud-refresh-dot">.</span>
              <span className="hud-refresh-dot">.</span>
            </small>
          ) : showPlan ? (
            <small>{plan ? plan.toUpperCase() : 'USED'}</small>
          ) : null}
          <Tip label={t.common.collapse}>
            <Button
              aria-controls={panelId}
              aria-expanded={true}
              aria-label={`${t.common.collapse} ${title}`}
              className="hud-collapse-button"
              onClick={event => {
                event.stopPropagation()
                const height = panel.current?.offsetHeight ?? 0
                const margin = panel.current ? Number.parseFloat(window.getComputedStyle(panel.current).marginTop) : 0
                setPanelHeight(height)
                focusToggle.current = true
                setCollapsed(true)
                onCollapsedHeightChange?.(height + margin)
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
        </header>
        <div
          aria-label={triggerProps ? `${label} — activate to refresh` : undefined}
          className={bodyClassName}
          onKeyDown={triggerProps?.onKeyDown}
          role={triggerProps?.role}
          tabIndex={triggerProps?.tabIndex}
        >
          {children}
        </div>
      </section>
    </div>
  )
}
