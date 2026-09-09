import { useId, useState } from 'react'

// Uses a native popover for Escape, outside-click dismissal, and top-layer display.
function GameMenu() {
  const menuId = useId()
  const [open, setOpen] = useState(false)

  return (
    <div className="game-menu">
      <button
        className="game-menu__trigger"
        type="button"
        aria-label="Game options"
        aria-expanded={open}
        aria-controls={menuId}
        popoverTarget={menuId}
        title="Game options"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="5" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="19" r="2" fill="currentColor" />
        </svg>
      </button>
      <section
        id={menuId}
        className="game-menu__popover"
        popover="auto"
        aria-label="Game options"
        onToggle={(event) => setOpen(event.newState === 'open')}
      >
        <h2 className="game-menu__heading">Game options</h2>
        <ul className="game-menu__options">
          <li>
            <button className="game-menu__option" type="button" disabled>
              No options available yet
            </button>
          </li>
        </ul>
      </section>
    </div>
  )
}

export default GameMenu
