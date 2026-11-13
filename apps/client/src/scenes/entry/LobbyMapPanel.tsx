import type { LobbyState } from '@robo-rally/game-events'
import './LobbyMapPanel.css'

export default function LobbyMapPanel({ lobby }: { lobby: Pick<LobbyState, 'mapDisplayName' | 'mapIcon'> }) {
  return (
    <section className="entry-panel lobby-map-panel" aria-labelledby="lobby-map-heading">
      <img className="lobby-map-panel__preview" src={lobby.mapIcon} alt={`${lobby.mapDisplayName} map preview`} />
      <div className="lobby-map-panel__details">
        <h2 id="lobby-map-heading" className="entry-panel__eyebrow">Selected map</h2>
        <p className="lobby-map-panel__name">{lobby.mapDisplayName}</p>
      </div>
    </section>
  )
}
