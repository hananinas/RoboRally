import type {
  CardsDealt,
  ProgramSubmitted,
  RobotActionResolved,
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

export default function useGameConnection(socket: GameSocket) {
  const [state, setState] = useState(createClientGameState)
  const current = useRef(state)

  // Keep event-time state current so submission checks see updates before React renders.
  const dispatch = useCallback((event: GameStateEvent) => {
    const next = gameStateReducer(current.current, event)
    current.current = next
    setState(next)
  }, [])

  useEffect(() => {
    const gameId = import.meta.env.VITE_GAME_ID
    if (!gameId) {
      dispatch({ type: 'error', message: 'Set VITE_GAME_ID to the Game Service game ID, then restart the client.' })
      return
    }

    let active = true
    const handleConnect = () => {
      dispatch({ type: 'connected' })
      socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit(
        'game.getPublicGameState', { gameId }, (error, result) => {
          if (!active || !socket.connected) return
          if (error) {
            dispatch({ type: 'error', message: 'Could not load game state. Reload to try again.' })
          } else if (result.outcome === 'GAME_NOT_FOUND') {
            dispatch({ type: 'error', message: 'Game not found. Check VITE_GAME_ID and restart the client.' })
          } else {
            dispatch({ type: 'initial-state', state: result.state })
          }
        },
      )
    }
    const handleConnectError = () => {
      dispatch({ type: 'error', message: 'Could not connect to the Game Service.' })
    }
    const handleDisconnect = () => {
      dispatch({ type: 'disconnected' })
    }
    const handleCardsDealt = ({ cards }: CardsDealt) => {
      dispatch({ type: 'dealt', cards })
    }
    const handleProgramSubmitted = ({ playerId }: ProgramSubmitted) => {
      dispatch({ type: 'submitted', playerId })
    }
    const handleActionResolved = (action: RobotActionResolved) => {
      dispatch({ type: 'action', action })
    }

    socket.on('connect', handleConnect)
    socket.on('connect_error', handleConnectError)
    socket.on('disconnect', handleDisconnect)
    socket.on('cards.dealt', handleCardsDealt)
    socket.on('program.submitted', handleProgramSubmitted)
    socket.on('robot.actionResolved', handleActionResolved)
    if (socket.connected) handleConnect()

    return () => {
      active = false
      socket.off('connect', handleConnect)
      socket.off('connect_error', handleConnectError)
      socket.off('disconnect', handleDisconnect)
      socket.off('cards.dealt', handleCardsDealt)
      socket.off('program.submitted', handleProgramSubmitted)
      socket.off('robot.actionResolved', handleActionResolved)
    }
  }, [dispatch, socket])

  useRobotPlaybackTimer(state.playback.active, dispatch)

  const submit = useCallback(() => {
    const payload = createSubmission(current.current)
    if (!socket.connected || !payload) return
    const handVersion = current.current.handVersion
    dispatch({ type: 'submit' })
    socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit('program.submit', payload, (error, result) => {
      // Disconnect also fails pending acknowledgements; preserve its reload guidance.
      if (!socket.connected) return
      dispatch(error
        ? { type: 'submission-unknown', handVersion }
        : { type: 'result', result, handVersion })
    })
  }, [dispatch, socket])

  return { state, dispatch, submit }
}
