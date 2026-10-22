import type {
  CardsDealt,
  GameAborted,
  JoinResult,
  PlayerConnectionChanged,
  PlayerCheckpointProgress,
  RobotActionResolved,
  PlayerJoined,
  PlayerLeft,
  ProgramSubmitted,
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
  gameStateReducer,
  type GameStateEvent,
} from './gameState.ts'
import type { ProgrammingStarted, RegistersChanged } from './publicRegisters.ts'

export default function useGameConnection(socket: GameSocket) {
  const [state, setState] = useState(createClientGameState)
  const current = useRef(state)
  const generation = useRef(0)

  // Keep event-time state current so submission checks see updates before React renders.
  const dispatch = useCallback((event: GameStateEvent) => {
    const next = gameStateReducer(current.current, event)
    current.current = next
    setState(next)
  }, [])

  const initialize = useCallback((result: Extract<JoinResult, { outcome: 'JOINED' }>) => {
    generation.current += 1
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
      if (socket.recovered) dispatch({ type: 'reconnected' })
    }
    const handleConnectError = (error: Error) => {
      if (current.current.assignment === null) return
      dispatch({ type: 'connect-error', message: error.message })
      if (error.message === 'USER_ALREADY_IN_GAME') socket.disconnect()
    }
    const handleCardsDealt = (hand: CardsDealt) => receive({ type: 'dealt', hand })
    const handleActionResolved = (action: RobotActionResolved) => receive({ type: 'action', action })
    const handlePlayerJoined = (payload: PlayerJoined) => receive({ type: 'player-joined', payload })
    const handlePlayerLeft = (payload: PlayerLeft) => receive({ type: 'player-left', payload })
    const handlePlayerConnectionChanged = (payload: PlayerConnectionChanged) =>
      receive({ type: 'player-connection-changed', payload })
    const handleAborted = (_payload: GameAborted) => receive({ type: 'aborted' })
    const handleCheckpointProgress = (payload: PlayerCheckpointProgress) =>
      receive({ type: 'checkpoint-progress', payload })
    const handleRegistersChanged = (payload: RegistersChanged) => receive({ type: 'registers-changed', payload })
    const handleProgrammingStarted = (payload: ProgrammingStarted) => receive({ type: 'programming-started', payload })
    const handleProgramSubmitted = (payload: ProgramSubmitted) => receive({ type: 'program-submitted', payload })

    socket.on('disconnect', handleDisconnect)
    socket.on('connect', handleConnect)
    socket.on('connect_error', handleConnectError)
    socket.on('cards.dealt', handleCardsDealt)
    socket.on('robot.actionResolved', handleActionResolved)
    socket.on('game.playerJoined', handlePlayerJoined)
    socket.on('game.playerLeft', handlePlayerLeft)
    socket.on('game.playerConnectionChanged', handlePlayerConnectionChanged)
    socket.on('game.aborted', handleAborted)
    socket.on('player.checkpointProgress', handleCheckpointProgress)
    socket.on('game.registersChanged', handleRegistersChanged)
    socket.on('game.programmingStarted', handleProgrammingStarted)
    socket.on('program.submitted', handleProgramSubmitted)
    return () => {
      generation.current += 1
      socket.off('disconnect', handleDisconnect)
      socket.off('connect', handleConnect)
      socket.off('connect_error', handleConnectError)
      socket.off('cards.dealt', handleCardsDealt)
      socket.off('robot.actionResolved', handleActionResolved)
      socket.off('game.playerJoined', handlePlayerJoined)
      socket.off('game.playerLeft', handlePlayerLeft)
      socket.off('game.playerConnectionChanged', handlePlayerConnectionChanged)
      socket.off('game.aborted', handleAborted)
      socket.off('player.checkpointProgress', handleCheckpointProgress)
      socket.off('game.registersChanged', handleRegistersChanged)
      socket.off('game.programmingStarted', handleProgrammingStarted)
      socket.off('program.submitted', handleProgramSubmitted)
    }
  }, [dispatch, socket])

  useRobotPlaybackTimer(state.playback.active, dispatch)

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

  return { state, dispatch, submit, initialize }
}
