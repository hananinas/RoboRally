import type { LobbyDetails, LobbyDetailsResult } from '@robo-rally/game-events'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ACKNOWLEDGEMENT_TIMEOUT_MS, type GameSocket } from '../../useGameSocket.ts'

type LobbyDetailsError =
  | Exclude<LobbyDetailsResult, { outcome: 'LOBBY_FOUND' }>['outcome']
  | 'CONNECTION_ERROR'
  | 'TIMEOUT'

const lobbyDetailsErrors: Record<LobbyDetailsError, string> = {
  LOGIN_REQUIRED: 'Your login is no longer valid. Please log in again.',
  INVALID_REQUEST: 'The lobby request was rejected.',
  INTERNAL_ERROR: 'The Game Service could not load the lobby.',
  CONNECTION_ERROR: 'Not connected to the Game Service.',
  TIMEOUT: 'The Game Service did not respond.',
}

export type LobbyDetailsState =
  | { status: 'loading' }
  | { status: 'loaded'; lobbies: readonly LobbyDetails[] }
  | { status: 'error'; message: string }


export default function useLobbyDetails(socket: GameSocket, connected: boolean) {
  const [state, setState] = useState<LobbyDetailsState>({ status: 'loading' })
  const attempt = useRef(0)

  
  const request = useCallback(() => {
    const current = ++attempt.current
    socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit('game.getLobbyDetails', {}, (error, result) => {
      
      if (current !== attempt.current) return
      if (error) {
        setState({ status: 'error', message: lobbyDetailsErrors.TIMEOUT })
      } else if (result.outcome !== 'LOBBY_FOUND') {
        setState({ status: 'error', message: lobbyDetailsErrors[result.outcome] })
      } else {
        setState({ status: 'loaded', lobbies: result.lobbies })
      }
    })
  }, [socket])

  
  useEffect(() => {
    if (connected) request()
    return () => {
      attempt.current += 1
    }
  }, [connected, request])

  
  const refresh = useCallback(() => {
    if (!socket.connected) {
      setState({ status: 'error', message: lobbyDetailsErrors.CONNECTION_ERROR })
      return
    }
    setState({ status: 'loading' })
    request()
  }, [socket, request])

  return { state, refresh }
}