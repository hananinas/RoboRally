import { useId, useState } from 'react'
import { KEYBINDS } from './useGameKeybinds.ts'
import './GameMenu.css'

// Uses a native popover for Escape, outside-click dismissal, and top-layer display.
function GameMenu({ onLeave, leaveDisabled, onLogout, onSettings }: {
  onLeave?: () => void
  leaveDisabled?: boolean
  onLogout: () => void
  onSettings: () => void
}) {
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
        <svg className="game-menu__trigger-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="19" cy="12" r="2" fill="currentColor" />
        </svg>
      </button>
      <section
        id={menuId}
        className="game-menu__popover"
        popover="auto"
        aria-label="Game options"
        onToggle={(event) => {
          if (event.target !== event.currentTarget) return
          setOpen(event.newState === 'open')
        }}
      >
        <h2 className="game-menu__heading">
          <span aria-hidden="true">⚙</span>
          Settings
          </h2>
        <div className="game-menu__group">
          <h3 className="game-menu__section-title">Account</h3>
          <button className="game-menu__option" type="button" onClick={onSettings}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="5" />
              <path d="M20 21a8 8 0 0 0-16 0" />
            </svg>
            Account Settings
          </button>
          <button className="game-menu__option" type="button" onClick={onLogout}>
            <span className="game-menu__icon" aria-hidden="true">↪</span>
            Logout
          </button>
        </div>

        {onLeave && (
          <div className="game-menu__group">
            <h3 className="game-menu__section-title">Game</h3>
            <button
              className="game-menu__option"
              type="button"
              disabled={leaveDisabled}
              onClick={onLeave}
            >
              <span className="game-menu__icon" aria-hidden="true">↩</span>
              Leave game
            </button>
          </div>
        )}

        {onLeave && (
          <div className="game-menu__group">
            <h3 className="game-menu__section-title">Controls</h3>

            <details className="game-menu__details">
              <summary className="game-menu__option-summary">
                <span className="game-menu__icon" aria-hidden="true">⌨</span>
                Keybindings
              </summary>

              <dl className="game-menu__keybinds">
                {KEYBINDS.map(({ keys, description }) => (
                  <div className="game-menu__keybind" key={keys}>
                    <dt>{keys}</dt>
                    <dd>{description}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>
        )}
      </section>
    </div>
  )
}

export default GameMenu
