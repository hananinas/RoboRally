import type { LobbyState } from '@robo-rally/game-events'

type Props = { lobby: LobbyState; userId: string; disabled: boolean; onStart: () => void; onLeave: () => void }
export default function WaitingLobby({ lobby, userId, disabled, onStart, onLeave }: Props) {
  const owner = lobby.ownerUserId === userId
  return <>
    <h2>{lobby.name}</h2>
    <p>{owner ? 'Waiting for players.' : 'Waiting for the owner to start.'}</p>
    <div aria-live="polite" aria-atomic="true">
      <p className="waiting-lobby__heading"><span>Players</span><span>{lobby.playerCount}/{lobby.maxPlayers} connected</span></p>
      <ul className="waiting-lobby__players" aria-label="Connected players">
        {lobby.players.map((player) => (
          <li key={player.userId}>
            <span>{player.username}</span>
            <span>{[player.userId === userId ? 'You' : '', player.userId === lobby.ownerUserId ? 'Owner' : ''].filter(Boolean).join(' · ')}</span>
          </li>
        ))}
      </ul>
    </div>
    {owner && <button className="entry-primary-button" type="button" disabled={disabled} onClick={onStart}>Start</button>}
    <button className="entry-secondary-button" type="button" disabled={disabled} onClick={onLeave}>Leave lobby</button>
  </>
}
