import type { ClientToServerEvents, ServerToClientEvents } from '@robo-rally/game-events'
import { useCallback, useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

export const ACKNOWLEDGEMENT_TIMEOUT_MS = 5000

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>
export type SocketStatus = 'connecting' | 'connected' | 'connection-error' | 'unauthenticated' | 'disconnected'

export default function useGameSocket() {
  const [socket, setSocket] = useState<GameSocket>(() => io({
    autoConnect: false,
    transports: ['polling'],
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
    const handleConnectError = (error: Error) => {
      if (error.message === 'SESSION_EXPIRED') {
        setSocket(io({ autoConnect: false, forceNew: true, transports: ['polling'] }))
        return
      }
      if (error.message === 'UNAUTHENTICATED') {
        setStatus('unauthenticated')
        setError(null)
        return
      }
      setStatus('connection-error')
      setError('Could not connect to the Game Service.')
    }
    const handleDisconnect = (reason: Socket.DisconnectReason) => {
      setStatus('disconnected')
      setError('Connection lost. Reconnecting…')
      if (reason === 'io server disconnect') socket.connect()
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
