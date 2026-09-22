import type { ClientToServerEvents, ServerToClientEvents } from '@robo-rally/game-events'
import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useRobotPlaybackTimer } from './board/robotPlayback.ts'
import {
  createClientGameState,
  createSubmission,
  gameStateReducer,
  type GameStateEvent,
} from './gameState.ts'

const ACKNOWLEDGEMENT_TIMEOUT_MS = 5000

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export default function useGameConnection() {
  const [state, setState] = useState(createClientGameState)
  const current = useRef(state)
  const socketRef = useRef<GameSocket | null>(null)

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

    const socket: GameSocket = io({
      autoConnect: false,
      // Rejoining/replay needs a protocol of its own (#13). Never silently
      // reconnect and resend a program whose acknowledgement may have been lost.
      reconnection: false,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      dispatch({ type: 'connected' })
      socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit(
        'game.getPublicGameState', { gameId }, (error, result) => {
          if (socketRef.current !== socket || !socket.connected) return
          if (error) {
            dispatch({ type: 'error', message: 'Could not load game state. Reload to try again.' })
          } else if (result.outcome === 'GAME_NOT_FOUND') {
            dispatch({ type: 'error', message: 'Game not found. Check VITE_GAME_ID and restart the client.' })
          } else if (result.state.gameId === gameId) {
            dispatch({ type: 'initial-state', state: result.state })
          }
        },
      )
    })
    socket.on('connect_error', () => {
      dispatch({ type: 'error', message: 'Could not connect to the Game Service.' })
    })
    socket.on('disconnect', () => {
      dispatch({ type: 'disconnected' })
    })
    socket.on('cards.dealt', (hand) => {
      if (hand.gameId === gameId) dispatch({ type: 'dealt', hand })
    })
    socket.on('program.submitted', (submission) => {
      if (submission.gameId === gameId) dispatch({ type: 'submitted', submission })
    })
    socket.on('game.phaseChanged', (phase) => {
      if (phase.gameId === gameId) dispatch({ type: 'phase', phase })
    })
    socket.on('robot.actionResolved', (action) => {
      if (action.gameId === gameId) dispatch({ type: 'action', action })
    })
    socket.connect()

    return () => {
      socketRef.current = null
      socket.removeAllListeners()
      socket.disconnect()
    }
  }, [dispatch])

  useRobotPlaybackTimer(state.playback.active, dispatch)

  const submit = useCallback(() => {
    const socket = socketRef.current
    const payload = createSubmission(current.current)
    if (!socket?.connected || !payload) return
    const handVersion = current.current.handVersion
    dispatch({ type: 'submit' })
    socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit('program.submit', payload, (error, result) => {
      // Disconnect also fails pending acknowledgements; preserve its reload guidance.
      if (socketRef.current !== socket || !socket.connected) return
      dispatch(error
        ? { type: 'submission-unknown', handVersion }
        : { type: 'result', result, handVersion })
    })
  }, [dispatch])

  return { state, dispatch, submit }
}
