import type {
  CardsDealt,
  GameAborted,
  GameInitialization,
  GameWon,
  PlayerConnectionChanged,
  EnvironmentStepResolved,
  RegistersChanged,
  RobotActionResolved,
  PlayerLeft,
  RegisterCardIds,
  ProgramFinalized,
  ProgramTimerChanged,
  ProgramSubmitted,
  CardChoiceChanged,
  ResolvedInstruction,
} from '@robo-rally/game-events'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ACKNOWLEDGEMENT_TIMEOUT_MS,
  type GameSocket,
} from '../../useGameSocket.ts'
import { useRobotPlaybackTimer } from './board/robotPlayback.ts'
import {
  createClientGameState,
  createSubmission,
  canProgram,
  gameStateReducer,
  type GameStateEvent,
} from './gameState.ts'

const registerEditEvents = new Set<GameStateEvent['type']>([
  'place', 'remove', 'move', 'clear', 'undo', 'redo',
])

export default function useGameConnection(socket: GameSocket) {
  const [state, setState] = useState(createClientGameState)
  const [localDeadline, setLocalDeadline] = useState<number | null>(null)
  const current = useRef(state)
  const generation = useRef(0)
  const clockRequest = useRef(0)
  const uncertainRegisters = useRef(false)
  const registerRequest = useRef(0)
  const needsReconciliation = useCallback(() => uncertainRegisters.current, [])

  const sampleClock = useCallback(function sampleClock(deadline: number, attempt = 0) {
    const request = ++clockRequest.current
    const requestGeneration = generation.current
    const sentAt = performance.now()
    socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit('clock.get', {}, (error, result) => {
      const receivedAt = performance.now()
      const timer = current.current.programmingTimer
      if (!socket.connected ||
          generation.current !== requestGeneration || clockRequest.current !== request ||
          timer.status !== 'RUNNING' || timer.deadline !== deadline) return

      if (error || result.outcome !== 'CLOCK') {
        if (attempt < 2) sampleClock(deadline, attempt + 1)
        return
      }

      // Estimate the server timestamp at the midpoint of the round trip.
      const midpoint = sentAt + (receivedAt - sentAt) / 2
      setLocalDeadline(midpoint + (deadline - result.serverTime))
    })
  }, [socket])

  // Keep event-time state current so submission checks see updates before React renders.
  const dispatch = useCallback(function dispatch(event: GameStateEvent): void {
    const previous = current.current
    const next = gameStateReducer(previous, event)
    current.current = next
    setState(next)

    const timer = next.programmingTimer
    if (timer.status !== 'RUNNING' || previous.programmingTimer.status !== 'RUNNING' ||
        timer.deadline !== previous.programmingTimer.deadline ||
        next.assignment?.gameId !== previous.assignment?.gameId) {
      const serverTime = event.type === 'timer-changed' ? event.payload.serverTime
        : event.type === 'joined' ? event.result.state.serverTime : null
      setLocalDeadline(timer.status === 'RUNNING' && serverTime !== null
        ? performance.now() + (timer.deadline - serverTime) : null)
    }
    if (socket.connected && timer.status === 'RUNNING' && next !== previous &&
        (event.type === 'joined' || event.type === 'reconnected' || event.type === 'timer-changed')) {
      sampleClock(timer.deadline)
    }

    if (!socket.connected || !registerEditEvents.has(event.type) ||
        next.registers === previous.registers) return
    const requestGeneration = generation.current
    const handVersion = next.handVersion
    const request = ++registerRequest.current
    uncertainRegisters.current = true
    const [first, second, third, fourth, fifth] = next.registers
    const cardIds: RegisterCardIds = [
      first?.id ?? null, second?.id ?? null, third?.id ?? null, fourth?.id ?? null, fifth?.id ?? null,
    ]
    socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit('game.updateRegisters', { cardIds }, (error, result) => {
      if (generation.current === requestGeneration && registerRequest.current === request &&
          !error && result.outcome === 'ACCEPTED') uncertainRegisters.current = false
      if (!socket.connected || generation.current !== requestGeneration ||
          current.current.handVersion !== handVersion || current.current.registers !== next.registers ||
          !canProgram(current.current)) return
      if (error || result.outcome !== 'ACCEPTED') {
        dispatch({ type: 'error', message: 'Could not save your register selection. Change it again or reconnect to restore the saved selection.' })
      }
    })
  }, [socket, sampleClock])

  const initialize = useCallback((result: GameInitialization) => {
    generation.current += 1
    uncertainRegisters.current = false
    dispatch({ type: 'joined', result })
  }, [dispatch])

  useEffect(() => {
    // Installed before joining. The acknowledgement initializes state synchronously
    // before Socket.IO delivers the subsequent gameplay events.
    const receive = (event: GameStateEvent) => {
      if (socket.connected && current.current.assignment !== null) dispatch(event)
    }
    const handleDisconnect = () => {
      generation.current += 1
      dispatch({ type: 'disconnected' })
    }
    const handleConnect = () => {
      if (socket.recovered && !needsReconciliation()) dispatch({ type: 'reconnected' })
    }
    const handleConnectError = (error: Error) => {
      if (current.current.assignment === null) return
      dispatch({ type: 'connect-error', message: error.message })
      if (error.message === 'USER_ALREADY_IN_GAME') socket.disconnect()
    }
    const handleCardsDealt = (hand: CardsDealt) => receive({ type: 'dealt', hand })
    const handleProgramFinalized = (payload: ProgramFinalized) => receive({ type: 'program-finalized', payload })
    const handleTimerChanged = (payload: ProgramTimerChanged) => receive({ type: 'timer-changed', payload })
    const handleActionResolved = (action: RobotActionResolved) => receive({
      type: 'action',
      action,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    })
    const handlePlayerLeft = (payload: PlayerLeft) => receive({ type: 'player-left', payload })
    const handlePlayerConnectionChanged = (payload: PlayerConnectionChanged) =>
      receive({ type: 'player-connection-changed', payload })
    const handleAborted = (_payload: GameAborted) => receive({ type: 'aborted' })
    const handleWon = (payload: GameWon) => receive({ type: 'won', payload })
    const handleEnvironmentStep = (result: EnvironmentStepResolved) => receive({ type: 'environment', result })
    const handleRegistersChanged = (payload: RegistersChanged) => receive({ type: 'registers-changed', payload })
    const handleProgramSubmitted = (payload: ProgramSubmitted) => receive({ type: 'program-submitted', payload })
    const handleChoiceChanged = (payload: CardChoiceChanged) => receive({ type: 'choice-changed', payload })

    socket.on('disconnect', handleDisconnect)
    socket.on('connect', handleConnect)
    socket.on('connect_error', handleConnectError)
    socket.on('cards.dealt', handleCardsDealt)
    socket.on('program.finalized', handleProgramFinalized)
    socket.on('program.timerChanged', handleTimerChanged)
    socket.on('robot.actionResolved', handleActionResolved)
    socket.on('game.playerLeft', handlePlayerLeft)
    socket.on('game.playerConnectionChanged', handlePlayerConnectionChanged)
    socket.on('game.aborted', handleAborted)
    socket.on('game.won', handleWon)
    socket.on('environment.stepResolved', handleEnvironmentStep)
    socket.on('game.registersChanged', handleRegistersChanged)
    socket.on('program.submitted', handleProgramSubmitted)
    socket.on('card.choiceChanged', handleChoiceChanged)
    return () => {
      generation.current += 1
      socket.off('disconnect', handleDisconnect)
      socket.off('connect', handleConnect)
      socket.off('connect_error', handleConnectError)
      socket.off('cards.dealt', handleCardsDealt)
      socket.off('program.finalized', handleProgramFinalized)
      socket.off('program.timerChanged', handleTimerChanged)
      socket.off('robot.actionResolved', handleActionResolved)
      socket.off('game.playerLeft', handlePlayerLeft)
      socket.off('game.playerConnectionChanged', handlePlayerConnectionChanged)
      socket.off('game.aborted', handleAborted)
      socket.off('game.won', handleWon)
      socket.off('environment.stepResolved', handleEnvironmentStep)
      socket.off('game.registersChanged', handleRegistersChanged)
      socket.off('program.submitted', handleProgramSubmitted)
      socket.off('card.choiceChanged', handleChoiceChanged)
    }
  }, [dispatch, socket, needsReconciliation])

  useRobotPlaybackTimer(state.playback, dispatch)

  const submit = useCallback(() => {
    const payload = createSubmission(current.current)
    if (!socket.connected || !payload) return
    const requestGeneration = generation.current
    const handVersion = current.current.handVersion
    dispatch({ type: 'submit' })
    socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit('program.submit', payload, (error, result) => {
      // A failed acknowledgement from an old connection must not affect the new session.
      if (!socket.connected || generation.current !== requestGeneration) return
      dispatch(error
        ? { type: 'submission-unknown', handVersion }
        : { type: 'result', result, handVersion })
    })
  }, [dispatch, socket])

  const chooseAction = useCallback((instruction: ResolvedInstruction) => {
    const currentState = current.current
    const choice= currentState.pendingChoice
    if (!socket.connected || !choice) return
    const requestGeneration = generation.current
    dispatch({ type: 'choosing' })
    socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit('card.choose', { choiceId: choice.choiceId, instruction }, (error, result) => {
      if (!socket.connect || generation.current !== requestGeneration || current.current.pendingChoice?.choiceId !== choice.choiceId) return
      if (error || result.outcome !== 'ACCEPTED') {
        dispatch({ type: 'error', message: error ? 'No acknowledgement. Retry your choice or reconnect to restore the current decision.' : 'Choice rejected. Select an available action when the game resumes.',})
      }
    },
  )
  }, [dispatch, socket])

  return { state, localDeadline, dispatch, submit, chooseAction, initialize, needsReconciliation }
}
