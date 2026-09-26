import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { type CSSProperties, type Ref, useLayoutEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/context'

import { playHoloTabIn } from './lera-collapse-motion'

interface LeraRestoreTabProps {
  buttonRef: Ref<HTMLButtonElement>
  controls: string
  offset: number
  onRestore: () => void
  side?: 'left' | 'right'
  tabLabel: string
  title: string
}

export function LeraRestoreTab({
  buttonRef,
  controls,
  offset,
  onRestore,
  side = 'right',
  tabLabel,
  title
}: LeraRestoreTabProps) {
  const { t } = useI18n()
  const rail = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    // Keep the window's neon outline behind the control without blocking the app.
    const element = rail.current

    if (element && typeof element.showPopover === 'function') {
      element.showPopover()
    } else {
      element?.removeAttribute('popover')
    }

    playHoloTabIn(element, side)
    // Power-on plays once per appearance; a later side flip only repositions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="hud-collapse-rail"
      data-restore-side={side}
      data-slot="lera-hud"
      popover="manual"
      ref={rail}
      style={{ '--hud-restore-offset': `${offset}px` } as CSSProperties}
    >
      <header>
        <Button
          aria-controls={controls}
          aria-expanded={false}
          aria-label={`${t.common.expand} ${title}`}
          className="hud-collapse-restore"
          onClick={onRestore}
          ref={buttonRef}
          size="inline"
          type="button"
          variant="ghost"
        >
          {side === 'left' ? <IconChevronRight /> : <IconChevronLeft />}
          <span>{tabLabel}</span>
        </Button>
      </header>
    </div>
  )
}
