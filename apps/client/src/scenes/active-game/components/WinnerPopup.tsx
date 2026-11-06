import type { CSSProperties } from 'react'

type ConfettiStyle = CSSProperties & { '--confetti-spin': string }

const CONFETTI_COLOURS = ['#f94144', '#f8961e', '#f9c74f', '#90be6d', '#43aa8b', '#577590']

// Fixed pseudo-random spread, so every render and every test shows the same pattern.
const confetti: readonly ConfettiStyle[] = Array.from({ length: 60 }, (_, index) => ({
  left: `${(index * 37) % 100}%`,
  background: CONFETTI_COLOURS[index % CONFETTI_COLOURS.length],
  animationDelay: `${(index % 12) * 0.15}s`,
  animationDuration: `${2.5 + (index % 5) * 0.4}s`,
  '--confetti-spin': `${(index * 47) % 360}deg`,
}))

function WinnerPopup({ winnerName, isWinner, leaving, onLeave }: {
  winnerName: string
  isWinner: boolean
  leaving: boolean
  onLeave: () => void
}) {
  return (
    <div className="winner-overlay">
        <div className="winner-confetti" aria-hidden="true">
        {confetti.map((style, index) => <span key={index} className="winner-confetti__piece" style={style} />)}
      </div>
      <div className="winner-popup" role="dialog" aria-label="Game over">
        <div className="winner-popup__trophy" aria-hidden="true">🏆</div>
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