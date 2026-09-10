import type { ReactNode } from 'react'

type PanelProps = {
  children: ReactNode
  className?: string
}

// Provides the shared panel surface.
function Panel({ children, className }: PanelProps) {
  const panelClassName = className ? `panel ${className}` : 'panel'

  return <section className={panelClassName}>{children}</section>
}

export default Panel
