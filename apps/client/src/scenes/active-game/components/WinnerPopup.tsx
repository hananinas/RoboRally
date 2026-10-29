function WinnerPopup({ winnerName, isWinner, leaving, onLeave }: {
  winnerName: string
  isWinner: boolean
  leaving: boolean
  onLeave: () => void
}) {
  return (
    <div className="winner-overlay">
      <div className="winner-popup" role="dialog" aria-label="Game over">
        <h2>{isWinner ? 'You win!' : `${winnerName} wins!`}</h2>
        <p>{isWinner
          ? 'You reached the final checkpoint first.'
          : `${winnerName} reached the final checkpoint first.`}
        </p>
        <button
          className="game-menu__button game-menu__button--leave"
          type="button"
          onClick={onLeave}
          disabled={leaving}
        >
          Leave game
        </button>
      </div>
    </div>
  )
}

export default WinnerPopup