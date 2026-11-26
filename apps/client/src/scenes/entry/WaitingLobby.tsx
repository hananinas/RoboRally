import type { LobbyState } from '@robo-rally/game-events'
import RobotPreview from './RobotPreview.tsx'
import { robotOptionFor } from './robotPreviews.ts'
import './WaitingLobby.css'

type Props = { lobby: LobbyState; userId: string; disabled: boolean; onStart: () => void; onLeave: () => void }

export default function WaitingLobby({ lobby, userId, disabled, onStart, onLeave }: Props) {
  const owner = lobby.ownerUserId === userId
  const emptySeats = Math.max(0, lobby.maxPlayers - lobby.players.length)

  return (
    <section className="waiting-lobby" aria-labelledby="waiting-lobby-title">
      <h2 id="waiting-lobby-title" className="waiting-lobby__title">{lobby.name}</h2>
      <p className="waiting-lobby__status">{owner ? 'Waiting for players.' : 'Waiting for the owner to start.'}</p>
      <div aria-live="polite" aria-atomic="true">
        <p className="waiting-lobby__heading"><span>Players</span><span>{lobby.playerCount}/{lobby.maxPlayers} seats filled</span></p>
        <ul className="waiting-lobby__players" aria-label="Lobby seats">
          {lobby.players.map((player) => {
            const self = player.userId === userId
            const playerIsOwner = player.userId === lobby.ownerUserId
            const robot = lobby.robots.find((option) => option.id === player.robotSpriteId)
            return (
              <li className={`waiting-lobby__seat${self ? ' waiting-lobby__seat--self' : ''}`} key={player.userId}>
                <span className="waiting-lobby__portrait" role="img" aria-label={`${robot?.name ?? 'Unknown'} robot`}>
                  <RobotPreview sprite={robotOptionFor(player.robotSpriteId).sprite} />
                </span>
                <span className="waiting-lobby__name">{player.username}</span>
                <span className="waiting-lobby__roles">
                  {playerIsOwner && <span className="waiting-lobby__badge waiting-lobby__badge--owner">Owner</span>}
                  {self && <span className="waiting-lobby__badge">You</span>}
                  {!self && !playerIsOwner && <span className="waiting-lobby__joined">Joined</span>}
                </span>
              </li>
            )
          })}
          {Array.from({ length: emptySeats }, (_, index) => (
            <li className="waiting-lobby__seat waiting-lobby__seat--empty" key={`empty-${index}`}>
              <span className="waiting-lobby__empty-icon" aria-hidden="true">+</span>
              <span className="waiting-lobby__name">Waiting for player</span>
              <span className="waiting-lobby__seat-number" aria-hidden="true">{String(lobby.players.length + index + 1).padStart(2, '0')}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="waiting-lobby__actions">
        <button className="entry-secondary-button" type="button" disabled={disabled} onClick={onLeave}>Leave lobby</button>
        <button className="entry-primary-button" type="button" disabled title="Ready status is coming soon.">Ready</button>
      </div>
      {owner && <button className="entry-primary-button waiting-lobby__start" type="button" disabled={disabled} onClick={onStart}>Start</button>}
    </section>
  )
}
