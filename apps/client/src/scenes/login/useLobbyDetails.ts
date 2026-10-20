import type { LobbyDetails, LobbyDetailsResult } from '@robo-rally/game-events'
import { useCallback, useEffect, useState } from 'react'
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

// Reads the lobby details. Fetching never joins a game.
export default function useLobbyDetails(socket: GameSocket, connected: boolean) {
  const [state, setState] = useState<LobbyDetailsState>({ status: 'loading' })

  // Sends the request; state changes only once the Game Service replies.
  const request = useCallback(() => {
    socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit('game.getLobbyDetails', {}, (error, result) => {
      if (error) {
        setState({ status: 'error', message: lobbyDetailsErrors.TIMEOUT })
      } else if (result.outcome !== 'LOBBY_FOUND') {
        setState({ status: 'error', message: lobbyDetailsErrors[result.outcome] })
      } else {
        setState({ status: 'loaded', lobbies: result.lobbies })
      }
    })
  }, [socket])

  // Fetch when the lobby page opens (state starts as loading).
  useEffect(() => {
    if (connected) request()
  }, [connected, request])

  // Used by the Refresh and Retry buttons.
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