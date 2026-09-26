import type { ReactNode } from 'react'

import { LeraCollapsiblePane } from '@/app/right-sidebar/lera-collapsible-pane'
import { useI18n } from '@/i18n'

export function LeraSessionPanel({ children }: { children: ReactNode }) {
  const { t } = useI18n()

  return (
    <LeraCollapsiblePane pane="sessions" slot="sidebar-panel" title={t.sidebar.sessions}>
      {children}
    </LeraCollapsiblePane>
  )
}
