import { useCallback, useEffect, useRef, useState } from 'react'
import type { BoardMapName, BoardMapSummary, LobbySummary, ServerToClientEvents } from '@robo-rally/game-events'
import useGameConnection from './scenes/active-game/useGameConnection.ts'
import { createSessionState, sessionReducer, type SessionEvent } from './sessionState.ts'
import useGameSocket, { ACKNOWLEDGEMENT_TIMEOUT_MS } from './useGameSocket.ts'

export default function useSessionConnection() {
  const connection = useGameSocket()
  const { socket } = connection
  const game = useGameConnection(socket)
  const { initialize, dispatch: dispatchGame, needsReconciliation } = game
  const [session, setSession] = useState(createSessionState)
  const current = useRef(session)
  const generation = useRef(0)
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [lobbies, setLobbies] = useState<readonly LobbySummary[]>([])
  const [maps, setMaps] = useState<readonly BoardMapSummary[]>([])
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const listAttempt = useRef(0)

  // Update event-time state before the next Socket.IO packet is handled.
  const dispatch = useCallback((event: SessionEvent) => {
    const next = sessionReducer(current.current, event)
    if (event.type === 'game-started' && next !== current.current && next.status === 'joined') initialize(event.initialization)
    if (event.type === 'session-result' && next.status === 'joined' && event.result.outcome === 'IN_GAME') initialize(event.result.initialization)
    if (event.type === 'left' || (event.type === 'session-result' && event.result.outcome === 'NO_SESSION')) dispatchGame({ type: 'reset' })
    current.current = next
    setSession(next)
  }, [initialize, dispatchGame])

  const run = useCallback(async (operation: () => Promise<SessionEvent | undefined>, kind: 'sync' | 'command' | 'start' = 'command') => {
    if (pending.current || !socket.connected) return
    pending.current = true
    setBusy(true)
    const attempt = generation.current
    try {
      const event = await operation()
      if (generation.current === attempt && socket.connected && event) dispatch(event)
    } catch {
      // A timed-out lobby command may have succeeded; query membership before choosing a screen.
      if (generation.current === attempt && socket.connected && !(kind === 'start' && current.current.status === 'joined')) {
        dispatch(kind === 'sync' ? { type: 'error', error: 'TIMEOUT' } : { type: 'sync-requested' })
      }
    } finally {
      if (generation.current === attempt) {
        pending.current = false
        setBusy(false)
      }
    }
  }, [socket, dispatch])

  useEffect(() => {
    const disconnected = () => {
      generation.current += 1
      listAttempt.current += 1
      pending.current = false
      setBusy(false)
      dispatch({ type: 'disconnected' })
    }
    const connected = () => {
      if (!(current.current.status === 'joined' && socket.recovered && !needsReconciliation())) dispatch({ type: 'sync-requested' })
    }
    const started: ServerToClientEvents['game.started'] = (payload) => {
      if (socket.connected) dispatch({ type: 'game-started', ...payload })
    }
    const updated: ServerToClientEvents['lobby.updated'] = ({ lobby }) => {
      if (socket.connected) dispatch({ type: 'lobby-updated', lobby })
    }
    socket.on('disconnect', disconnected)
    socket.on('connect', connected)
    socket.on('game.started', started)
    socket.on('lobby.updated', updated)
    return () => {
      socket.off('disconnect', disconnected)
      socket.off('connect', connected)
      socket.off('game.started', started)
      socket.off('lobby.updated', updated)
      generation.current += 1
    }
  }, [socket, dispatch, needsReconciliation])

  useEffect(() => {
    if (session.status !== 'resyncing' || !socket.connected || busy) return
    void run(async () => {
      const result = await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('session.get', {})
      return { type: 'session-result', result }
    }, 'sync')
  }, [session, socket, connection.status, busy, run])

  const refreshLobbies = useCallback(() => {
    if (!socket.connected) return
    const attempt = ++listAttempt.current
    socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit('lobby.list', {}, (error, result) => {
      if (attempt !== listAttempt.current || !socket.connected || current.current.status !== 'browsing') return
      if (error) setListError('TIMEOUT')
      else if (result.outcome === 'LOBBIES_FOUND') {
        setListError(null)
        setLobbies(result.lobbies)
        setMaps(result.maps)
        setMapsLoaded(true)
      }
      else setListError(result.outcome)
    })
  }, [socket])
  useEffect(() => {
    if (session.status === 'browsing') refreshLobbies()
  }, [session.status, refreshLobbies])

  function joinLobby(lobbyId: string) {
    if (pending.current || !socket.connected) return
    dispatch({ type: 'lobby-requested', lobbyId })
    void run(async () => ({ type: 'lobby-result', result: await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('lobby.join', { lobbyId }) }))
  }
  function createLobby(mapName: BoardMapName, name: string) {
    if (pending.current || !socket.connected) return
    dispatch({ type: 'lobby-requested', lobbyId: null })
    void run(async () => ({
      type: 'lobby-result',
      result: await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('lobby.create', { mapName, name }),
    }))
  }
  function startLobby() {
    if (session.status !== 'waiting') return
    void run(async () => {
      const result = await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('lobby.start', {})
      if (result.outcome === 'STARTED' && current.current.status === 'joined') return
      return result.outcome === 'STARTED' || result.outcome === 'NOT_A_MEMBER'
        ? { type: 'sync-requested' } : { type: 'error', error: result.outcome }
    }, 'start')
  }
  function leaveSession() {
    void run(async () => {
      const result = session.status === 'waiting'
        ? await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('lobby.leave', {})
        : game.state.assignment
          ? await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('game.leave', {}) : undefined
      return result?.outcome === 'LEFT' || result?.outcome === 'GAME_NOT_FOUND'
        ? { type: 'left' } : { type: 'sync-requested' }
    })
  }

  return {
    connection, game, session, busy, lobbies, maps, mapsLoaded, listError,
    joinLobby, startLobby, leaveSession, refreshLobbies,
    createLobby,
    retrySession: () => socket.connected ? dispatch({ type: 'sync-requested' }) : connection.connect(),
  }
}
