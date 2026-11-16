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
  playedCardIds?: ReadonlySet<string>
  disabled: boolean
  pendingDelete: boolean
  awaitingSubmitConfirm: boolean
  submission: ClientGameState['submission']
  locked: boolean
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
  played: boolean
  disabled: boolean
  pendingDelete: boolean
  dragging: boolean
  dragHandlers: ReturnType<typeof useCardDrag>['dragHandlers']
}

// Renders one register slot.
function RegisterSlot({
  card,
  index,
  active,
  played,
  disabled,
  pendingDelete,
  dragging,
  dragHandlers,
}: RegisterSlotProps) {
  const registerIndex = disabled ? undefined : index

  return (
    <li
      className={active ? 'register register--active' : 'register'}
      aria-current={active ? 'step' : undefined}
      data-active={active || undefined}
    >
      <div
        className="register__card register-card"
        data-register-index={registerIndex}
        data-empty={!card || dragging || undefined}
        data-active={active || undefined}
        data-played={played || undefined}
        data-pending-delete={pendingDelete || undefined}
      >
        <span className="register-card__number">{index + 1}</span>
        {card && (
          <ProgramCard
            card={card}
            size="register"
            label={`${cardPresentation[card.instruction].label}, remove from register ${index + 1}`}
            disabled={disabled}
            dragging={dragging}
            {...dragHandlers(card)}
          />
        )}
      </div>
    </li>
  )
}

// Renders the program registers.
function RegisterPanel({
  registers,
  activeRegister,
  playedCardIds,
  disabled,
  pendingDelete,
  awaitingSubmitConfirm,
  submission,
  locked,
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
      <ol className="registers" data-registers-locked={locked || undefined}>
        {registers.map((card, index) => (
          <RegisterSlot
            key={index}
            card={card}
            index={index}
            active={index === activeRegister}
            played={card !== null && playedCardIds?.has(card.id) === true}
            disabled={disabled}
            pendingDelete={pendingDelete}
            dragging={card !== null && isDragging(card)}
            dragHandlers={dragHandlers}
          />
        ))}
      </ol>
      {drag && <DraggedCard drag={drag} />}
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
