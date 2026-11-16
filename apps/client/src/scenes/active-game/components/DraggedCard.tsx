import type { CSSProperties } from 'react'
import { ProgramCardFace } from './ProgramCard.tsx'
import type { CardDrag } from './useCardDrag.ts'


function DraggedCard({ drag }: { drag: CardDrag }) {
  const size = drag.overRegister === null ? 'hand' : 'register'

  return (
    <div
      aria-hidden="true"
      data-moving={drag.moved}
      data-card-id={drag.card.id}
      className={`program-card program-card--${size} dragged-card`}
      style={{
        left: drag.x,
        top: drag.y,
        '--pickup-x': `${drag.pickupOffset.x}px`,
        '--pickup-y': `${drag.pickupOffset.y}px`,
      } as CSSProperties}
    >
      <ProgramCardFace instruction={drag.card.instruction} />
    </div>
  )
}

export default DraggedCard
