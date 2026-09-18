import type { ClientToServerEvents, ServerToClientEvents } from '@robo-rally/game-events'
import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { robotActionDuration } from './board/robotPlayback.ts'
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

  // Update the event-time state synchronously: React can batch several packets
  // or clicks into one render, but submission and playback cannot drop any.
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

    const socket: GameSocket = io(import.meta.env.VITE_GAME_SERVICE_URL || undefined, {
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
          } else {
            dispatch({ type: 'state', state: result.state })
          }
        },
      )
    })
    socket.on('connect_error', () => {
      dispatch({ type: 'error', message: 'Could not connect to the Game Service. Check the service URL and reload.' })
    })
    socket.on('disconnect', () => {
      dispatch({ type: 'disconnected' })
    })
    socket.on('cards.dealt', ({ cards }) => {
      dispatch({ type: 'dealt', cards })
    })
    socket.on('program.submitted', ({ playerId }) => dispatch({ type: 'submitted', playerId }))
    socket.on('robot.actionResolved', (action) => dispatch({ type: 'action', action }))
    socket.connect()

    return () => {
      socketRef.current = null
      socket.removeAllListeners()
      socket.disconnect()
    }
  }, [dispatch])

  useEffect(() => {
    if (!state.playback.active) return
    const duration = robotActionDuration(
      state.playback.active,
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    )
    const timer = window.setTimeout(() => dispatch({ type: 'complete' }), duration)
    return () => window.clearTimeout(timer)
  }, [dispatch, state.playback.active])

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
