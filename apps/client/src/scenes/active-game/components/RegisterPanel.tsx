import {
  registersAreFilled,
  type ClientGameState,
  type ProgramCard as Card,
  type Registers,
} from '../gameState.ts'
import DraggedCard from './DraggedCard.tsx'
import Panel from './Panel.tsx'
import { cardPresentation } from './cardInstructions.ts'
import ProgramCard from './ProgramCard.tsx'
import ProgrammingCountdown from './ProgrammingCountdown.tsx'
import useCardDrag from './useCardDrag.ts'

type RegisterPanelProps = {
  registers: Registers
  activeRegister: number | null
  disabled: boolean
  pendingDelete: boolean
  awaitingSubmitConfirm: boolean
  submission: ClientGameState['submission']
  status: string
  localDeadline: number | null
  error: string | null
  onRemove: (registerIndex: number) => void
  onMove: (fromIndex: number, toIndex: number) => void
  onConfirm: () => void
}

type RegisterSlotProps = {
  card: Card | null
  index: number
  active: boolean
  disabled: boolean
  pendingDelete: boolean
  dragging: boolean
  dragHandlers: ReturnType<typeof useCardDrag>['dragHandlers']
  onRemove: (registerIndex: number) => void
}

// Renders one register slot.
function RegisterSlot({
  card,
  index,
  active,
  disabled,
  pendingDelete,
  dragging,
  dragHandlers,
  onRemove,
}: RegisterSlotProps) {
  const cardClassName = card && !dragging
    ? 'register__card register__card--filled'
    : 'register__card'
  const registerIndex = disabled ? undefined : index

  return (
    <li
      className={active ? 'register register--active' : 'register'}
      aria-current={active ? 'step' : undefined}
      data-active={active || undefined}
    >
      <div
        className={cardClassName}
        data-register-index={registerIndex}
        style={{
          outline: pendingDelete ? '3px solid crimson' : undefined,
          outlineOffset: '3px',
        }}
      >
        {card && (
          <ProgramCard
            card={card}
            size="register"
            label={`${cardPresentation[card.instruction].label}, remove from register ${index + 1}`}
            disabled={disabled}
            dragging={dragging}
            onClick={(event) => {
              // Pointer taps are handled by the drag hook; this covers the keyboard.
              if (event.detail === 0) onRemove(index)
            }}
            {...dragHandlers(card)}
          />
        )}
      </div>
      <span>{index + 1}</span>
    </li>
  )
}

// Renders the program registers.
function RegisterPanel({
  registers,
  activeRegister,
  disabled,
  pendingDelete,
  awaitingSubmitConfirm,
  submission,
  status,
  localDeadline,
  error,
  onRemove,
  onMove,
  onConfirm,
}: RegisterPanelProps) {
  const registerOf = (card: Card) =>
    registers.findIndex((registeredCard) => registeredCard?.id === card.id)
  const { drag, dragHandlers, isDragging } = useCardDrag({
    onTap: (card) => onRemove(registerOf(card)),
    onDrop: (card, registerIndex) => {
      const fromIndex = registerOf(card)
      // Dropped outside every register: take the card out.
      if (registerIndex === null) onRemove(fromIndex)
      // Dropped on another register: swap the two cards.
      else if (registerIndex !== fromIndex) onMove(fromIndex, registerIndex)
    },
  })

  return (
    <Panel className="register-panel">
      <h2 className="register-panel__heading">Registers</h2>
      <div className="game-status">
        <p role="status">{status}</p>
        {localDeadline !== null && (
          <ProgrammingCountdown localDeadline={localDeadline} />
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      <ol className="registers">
        {registers.map((card, index) => (
          <RegisterSlot
            key={index}
            card={card}
            index={index}
            active={index === activeRegister}
            disabled={disabled}
            pendingDelete={pendingDelete}
            dragging={card !== null && isDragging(card)}
            dragHandlers={dragHandlers}
            onRemove={onRemove}
          />
        ))}
      </ol>
      {drag?.moved && <DraggedCard drag={drag} />}
      <button
        className={
          'register-panel__done' +
          (awaitingSubmitConfirm ? ' register-panel__done--awaiting-confirm' : '')
        }
        type="button"
        disabled={!registersAreFilled(registers) || disabled}
        onClick={onConfirm}
      >
        {submission === 'pending' ? 'Submitting…'
          : submission === 'accepted' ? 'Confirmed'
            : submission === 'uncertain' ? 'Awaiting server' : 'Done'}
      </button>
    </Panel>
  )
}

export default RegisterPanel
