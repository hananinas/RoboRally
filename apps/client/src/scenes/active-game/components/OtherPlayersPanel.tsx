import type { GamePhase, PublicRegisterSlot, RobotActionResolved } from '@robo-rally/game-events'
import { useEffect, useState } from 'react'
import type { OpponentPlayer } from '../gameState.ts'
import { cardPresentation } from './cardInstructions.ts'
import { ProgramCardFace } from './ProgramCard.tsx'
import CheckpointProgress from './CheckpointProgress.tsx'
import './OtherPlayersPanel.css'

function slotLabel(slot: PublicRegisterSlot): string {
  return slot.status === 'REVEALED' ? cardPresentation[slot.instruction].label
    : slot.status === 'HIDDEN' ? 'Filled' : 'Empty'
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
  const executing = phase === 'EXECUTING' && !paused && player.connected &&
    activeAction?.robotId === player.robotId && player.registers[activeAction.registerIndex]?.status === 'REVEALED'
  const timing = (slot: PublicRegisterSlot, index: number) => {
    if (executing && activeAction.registerIndex === index) return 'current'
    if (phase !== 'EXECUTING') return ''
    if (slot.status !== 'REVEALED' ||
        (activeAction && index > activeAction.registerIndex) ||
        queuedActions.some((action) => action.robotId === player.robotId && action.registerIndex === index)) return 'future'
    return 'past'
  }
  const slots = player.registers.map((slot, index) => ({
    slot,
    filled: slot.status !== 'EMPTY',
    label: slotLabel(slot),
    state: timing(slot, index),
  }))
  const filled = slots.filter((slot) => slot.filled).length
  const status = !player.connected ? 'Reconnecting'
    : executing ? `${cardPresentation[activeAction.instruction].label} · executing`
      : phase === 'EXECUTING' ? 'Waiting'
        : player.programSubmitted ? 'Ready' : `${filled}/5 programmed`
  const registersLabel = slots.map(({ label, state }, index) =>
    `Register ${index + 1}: ${label}${state ? ` (${state === 'current' ? 'executing' : state})` : ''}`,
  ).join('. ')

  return (
    <div
      className="other-player hud-panel-surface"
      role="group"
      tabIndex={0}
      aria-label={`${player.username}, ${player.lastCheckpoint} of ${checkpointCount} checkpoints collected. ${status}. ${registersLabel}.`}
      data-expanded={expanded}
      data-registers-locked={(phase === 'PROGRAMMING' && player.programSubmitted) || undefined}
      onPointerEnter={(event) => {
        if (event.pointerType === 'touch') return
        setHovered(true)
        setDismissed(false)
      }}
      onMouseDown={(event) => {
        if (event.button === 0) event.preventDefault()
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => { setFocused(true); setDismissed(false) }}
      onBlur={() => { setFocused(false); setDismissed(false) }}
    >
      <div className="other-player__identity">
        <span className="robot-swatch other-player__colour" style={{ backgroundColor: player.colour }} aria-hidden="true" />
        <strong className="other-player__name">{player.username}</strong>
        <span className="other-player__checkpoints">
          <CheckpointProgress collected={player.lastCheckpoint} total={checkpointCount} />
        </span>
        <span className="other-player__dots" aria-hidden="true">
          {slots.map(({ filled, state }, index) => (
            <span key={index} data-filled={filled || undefined} data-active={state === 'current' || undefined} />
          ))}
        </span>
        <span className="other-player__status" title={status}>{status}</span>
      </div>
      <span className="other-player__registers" aria-hidden="true">
        {slots.map(({ slot, filled, label, state }, index) => (
          <span
            key={index}
            className={`other-player__slot register-card program-card--register other-player__slot--${slot.status.toLowerCase()}${state ? ` other-player__slot--${state}` : ''}`}
            data-empty={!filled || undefined}
            data-active={state === 'current' || undefined}
          >
            <span className="register-card__number">{index + 1}</span>
            {slot.status === 'REVEALED'
              ? <ProgramCardFace instruction={slot.instruction} labelClass="other-player__slot-label" />
              : <span className="other-player__slot-label">{label}</span>}
          </span>
        ))}
      </span>
    </div>
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
