export default function LeaveGameButton({ onLeave, disabled }: {
  onLeave: () => void
  disabled: boolean
}) {
  return (
    <button className="game-popup__leave" type="button" onClick={onLeave} disabled={disabled}>
      Leave game
    </button>
  )
}
