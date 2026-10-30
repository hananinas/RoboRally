import type { CSSProperties } from 'react'
import { placeholderPreview, type RobotPreviewDefinition } from './robotPreviews.ts'
import './RobotPreview.css'

type Props = { sprite?: RobotPreviewDefinition }

/** Decorative preview only; model selection is separate feature work. */
export default function RobotPreview({ sprite = placeholderPreview }: Props) {
  return (
    <span className="robot-preview" style={{ '--robot-preview-size': `${sprite.previewSize}px` } as CSSProperties} aria-hidden="true">
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
