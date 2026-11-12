import type { CSSProperties } from 'react'
import { placeholderPreview, type RobotPreviewDefinition } from './robotPreviews.ts'
import './RobotPreview.css'

type Props = { sprite?: RobotPreviewDefinition }

export default function RobotPreview({ sprite = placeholderPreview, color }: Props & { color?: string }) {
  return (
    <span className="robot-preview" style={{ '--robot-preview-size': `${sprite.previewSize}px`, ...(color ? { '--robot-colour': color } : {}) } as CSSProperties} aria-hidden="true">
      {sprite.layers.map((layer, index) => (
        <svg
          className="robot-preview__layer"
          viewBox={sprite.viewBox}
          style={{ '--layer': index } as CSSProperties}
          key={index}
          dangerouslySetInnerHTML={{ __html: layer }}
        />
      ))}
    </span>
  )
}
