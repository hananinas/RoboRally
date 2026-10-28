import type { GamePhase, RobotActionResolved } from '@robo-rally/game-events'
import { useEffect, useState, type CSSProperties } from 'react'
import type { OpponentPlayer, PublicRegisterSlot } from '../publicRegisters.ts'
import { cardPresentation } from './cardInstructions.ts'
import './OtherPlayersPanel.css'

function slotLabel(slot: PublicRegisterSlot): string {
  return slot.status === 'REVEALED' ? cardPresentation[slot.instruction].label
    : slot.status === 'HIDDEN' ? 'Filled' : 'Empty'
}

function robotTextColour(colour: string): string {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(colour.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  return luminance > 0.179 ? '#030609' : '#f8fafc'
}

type PlaybackProps = {
  phase: GamePhase
  activeAction: RobotActionResolved | null
  queuedActions: readonly RobotActionResolved[]
  paused: boolean
}

function OtherPlayerRow({ player, checkpointCount, phase, activeAction, queuedActions, paused }: PlaybackProps & {
  player: OpponentPlayer
  checkpointCount: number
}) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const expanded = (hovered || focused) && !dismissed
  useEffect(() => {
    if (!expanded) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed(true)
    }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [expanded])
  const filled = player.registers.filter((slot) => slot.status !== 'EMPTY').length
  const executing = phase === 'EXECUTING' && !paused && player.connected &&
    activeAction?.robotId === player.robotId && player.registers[activeAction.registerIndex]?.status === 'REVEALED'
  const status = !player.connected ? 'Reconnecting'
    : executing ? `${cardPresentation[activeAction.instruction].label} · executing`
      : phase === 'EXECUTING' ? 'Waiting'
        : player.programSubmitted ? 'Ready' : `${filled}/5 programmed`
  const timing = (slot: PublicRegisterSlot, index: number) => {
    if (executing && activeAction.registerIndex === index) return 'current'
    if (phase !== 'EXECUTING') return ''
    if (slot.status !== 'REVEALED' ||
        (activeAction && index > activeAction.registerIndex) ||
        queuedActions.some((action) => action.robotId === player.robotId && action.registerIndex === index)) return 'future'
    return 'past'
  }
  const registersLabel = player.registers.map((slot, index) => {
    const state = timing(slot, index)
    return `Register ${index + 1}: ${slotLabel(slot)}${state ? ` (${state === 'current' ? 'executing' : state})` : ''}`
  }).join('. ')

  return (
    <button
      className="other-player"
      type="button"
      style={{ '--robot-colour': player.colour, '--robot-ink': robotTextColour(player.colour) } as CSSProperties}
      aria-label={`${player.username}, checkpoints ${player.lastCheckpoint}/${checkpointCount}. ${status}. ${registersLabel}. Inspect registers.`}
      aria-expanded={expanded}
      onPointerEnter={() => { setHovered(true); setDismissed(false) }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => { setFocused(true); setDismissed(false) }}
      onBlur={() => { setFocused(false); setDismissed(false) }}
      onClick={() => setDismissed(false)}
    >
      <strong className="other-player__name">{player.username}</strong>
      <small className="other-player__checkpoints">CP {player.lastCheckpoint}/{checkpointCount}</small>
      <span className="other-player__status" title={status}>{status}</span>
      <span className="other-player__registers" aria-hidden="true">
        {player.registers.map((slot, index) => (
          <span key={index} className={`other-player__slot other-player__slot--${slot.status.toLowerCase()} other-player__slot--${timing(slot, index)}`}>
            <span className="other-player__slot-number">{index + 1}</span>
            <span className="other-player__slot-label">{slotLabel(slot)}</span>
          </span>
        ))}
      </span>
    </button>
  )
}

export default function OtherPlayersPanel({ players, checkpointCount, ...playback }: PlaybackProps & {
  players: readonly OpponentPlayer[]
  checkpointCount: number
}) {
  if (players.length === 0) return null

  return (
    <aside className="other-players" aria-label="Other players’ registers">
      {players.map((player) => (
        <OtherPlayerRow key={player.playerId} player={player} checkpointCount={checkpointCount} {...playback} />
      ))}
    </aside>
  )
}
