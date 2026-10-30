import { useId } from 'react'
import tankSprites from '../active-game/board/assets/tanks.hbls?raw'
import './RobotPreview.css'

type Props = { model?: 'placeholder' | 'tank' }

/** Decorative preview only; model selection is separate feature work. */
export default function RobotPreview({ model = 'placeholder' }: Props) {
  const spriteId = useId()

  return (
    <span className={`robot-preview robot-preview--${model}`} aria-hidden="true">
      {model === 'tank' && (
        <span hidden dangerouslySetInnerHTML={{ __html: tankSprites.replaceAll('id="testTank', `id="${spriteId}-testTank`) }} />
      )}
      {Array.from({ length: 5 }, (_, index) => model === 'tank'
        ? <svg className="robot-preview__layer" viewBox="0 0 57 87" key={index}><use href={`#${spriteId}-testTank${index + 1}`} /></svg>
        : <span className="robot-preview__layer" key={index} />)}
    </span>
  )
}
