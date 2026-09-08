import type { ReactNode } from 'react'

type PanelProps = {
  children: ReactNode
  className?: string
}

function Panel({ children, className }: PanelProps) {
  const panelClassName = className ? `panel ${className}` : 'panel'

  return <section className={panelClassName}>{children}</section>
}

export default Panel
