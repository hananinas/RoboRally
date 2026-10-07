import type { ClientToServerEvents, ServerToClientEvents } from '@robo-rally/game-events'
import { useCallback, useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

export const ACKNOWLEDGEMENT_TIMEOUT_MS = 5000

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>
export type SocketStatus = 'connecting' | 'connected' | 'connection-error' | 'disconnected'

export default function useGameSocket() {
  const [socket] = useState<GameSocket>(() => io({
    autoConnect: false,
  }))
  const [status, setStatus] = useState<SocketStatus>('connecting')
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(() => {
    setStatus('connecting')
    setError(null)
    socket.connect()
  }, [socket])

  useEffect(() => {
    const handleConnect = () => {
      setStatus('connected')
      setError(null)
    }
    const handleConnectError = () => {
      setStatus('connection-error')
      setError('Could not connect to the Game Service.')
    }
    const handleDisconnect = () => {
      setStatus('disconnected')
      setError('Connection lost. Reconnecting…')
    }

    socket.on('connect', handleConnect)
    socket.on('connect_error', handleConnectError)
    socket.on('disconnect', handleDisconnect)
    socket.connect()

    return () => {
      socket.off('connect', handleConnect)
      socket.off('connect_error', handleConnectError)
      socket.off('disconnect', handleDisconnect)
      socket.disconnect()
    }
  }, [connect, socket])

  return { connect, error, socket, status }
}
