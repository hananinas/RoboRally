import type { ReactNode } from 'react'

type PanelProps = {
  children: ReactNode
  className?: string
}

// Provides the shared panel surface.
function Panel({ children, className }: PanelProps) {
  const panelClassName = ['panel', 'hud-panel-surface', className].filter(Boolean).join(' ')

  return <section className={panelClassName}>{children}</section>
}

export default Panel
