import { ProgramCardFace } from './ProgramCard.tsx'
import type { CardDrag } from './useCardDrag.ts'


function DraggedCard({ drag }: { drag: CardDrag }) {
  const size = drag.overRegister === null ? 'hand' : 'register'

  return (
    <div
      aria-hidden="true"
      data-moving={drag.moved}
      className={`program-card program-card--${size} dragged-card`}
      style={{ left: drag.x, top: drag.y }}
    >
      <ProgramCardFace instruction={drag.card.instruction} />
    </div>
  )
}

export default DraggedCard