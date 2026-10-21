import type { LobbyState } from '@robo-rally/game-events'

type Props = { lobby: LobbyState; userId: string; disabled: boolean; onStart: () => void; onLeave: () => void }
export default function WaitingLobby({ lobby, userId, disabled, onStart, onLeave }: Props) {
  const owner = lobby.ownerUserId === userId
  return <>
    <h2>{lobby.name}</h2>
    <p>{owner ? 'Waiting for players.' : 'Waiting for the owner to start.'}</p>
    {owner && <button className="login-primary-button" type="button" disabled={disabled} onClick={onStart}>Start</button>}
    <button type="button" disabled={disabled} onClick={onLeave}>Leave lobby</button>
  </>
}
