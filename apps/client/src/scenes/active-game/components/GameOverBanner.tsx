import LeaveGameButton from './LeaveGameButton.tsx'

// Sits where the programming hand was, so the board stays visible and can still be explored.
function GameOverBanner({ winnerName, isWinner, winnerColour, onShowWinner, leaving, onLeave }: {
  winnerName: string
  isWinner: boolean
  winnerColour: string | undefined
  onShowWinner: (() => void) | undefined
  leaving: boolean
  onLeave: () => void
}) {
  return (
    <section className="game-over-banner hud-panel-surface" aria-label="Game over">
      <span
        className="robot-swatch game-over-banner__colour"
        style={{ backgroundColor: winnerColour }}
        aria-hidden="true"
      />
      <div className="game-over-banner__text">
        <h2>{isWinner ? 'You win!' : `${winnerName} wins!`}</h2>
        <p>
          {isWinner ? 'You reached' : `${winnerName} reached`} the final checkpoint first.
          {' '}Look around the board, then leave when you are ready.
        </p>
      </div>
      <div className="game-over-banner__actions">
        {onShowWinner && (
          <button className="game-over-banner__show" type="button" onClick={onShowWinner}>
            {isWinner ? 'Show my robot' : 'Show winner'}
          </button>
        )}
        <LeaveGameButton onLeave={onLeave} disabled={leaving} />
      </div>
    </section>
  )
}

export default GameOverBanner
