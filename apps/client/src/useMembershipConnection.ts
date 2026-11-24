import { useCallback, useEffect, useRef, useState } from 'react'
import type { BoardMapName, BoardMapSummary, LobbySummary, RobotSpriteId, ServerToClientEvents } from '@robo-rally/game-events'
import useGameConnection from './scenes/active-game/useGameConnection.ts'
import { createMembershipState, membershipReducer, type MembershipEvent } from './membershipState.ts'
import useGameSocket, { ACKNOWLEDGEMENT_TIMEOUT_MS } from './useGameSocket.ts'

export default function useMembershipConnection() {
  const connection = useGameSocket()
  const { socket } = connection
  const game = useGameConnection(socket)
  const { initialize, dispatch: dispatchGame, needsReconciliation } = game
  const [membership, setMembership] = useState(createMembershipState)
  const current = useRef(membership)
  const generation = useRef(0)
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [lobbies, setLobbies] = useState<readonly LobbySummary[]>([])
  const [maps, setMaps] = useState<readonly BoardMapSummary[]>([])
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const listAttempt = useRef(0)

  // Update event-time state before the next Socket.IO packet is handled.
  const dispatch = useCallback((event: MembershipEvent) => {
    const next = membershipReducer(current.current, event)
    if (event.type === 'game-started' && next !== current.current && next.status === 'joined') initialize(event.initialization)
    if (event.type === 'membership-result' && next.status === 'joined' && event.result.outcome === 'IN_GAME') initialize(event.result.initialization)
    if (event.type === 'left' || (event.type === 'membership-result' && event.result.outcome === 'NO_MEMBERSHIP')) dispatchGame({ type: 'reset' })
    current.current = next
    setMembership(next)
  }, [initialize, dispatchGame])

  const run = useCallback(async (operation: () => Promise<MembershipEvent | undefined>, kind: 'sync' | 'command' | 'start' = 'command') => {
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
    if (membership.status !== 'resyncing' || !socket.connected || busy) return
    void run(async () => {
      const result = await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('membership.get', {})
      return { type: 'membership-result', result }
    }, 'sync')
  }, [membership, socket, connection.status, busy, run])

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
    if (membership.status === 'browsing') refreshLobbies()
  }, [membership.status, refreshLobbies])

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
  async function selectRobot(robotSpriteId: RobotSpriteId): Promise<boolean> {
    if (pending.current || !socket.connected) return false
    if (current.current.status !== 'waiting') return false
    pending.current = true
    setBusy(true)
    const attempt = generation.current
    try {
      const result = await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS)
        .emitWithAck('lobby.selectRobot', { robotSpriteId })
      if (generation.current !== attempt || !socket.connected) return false
      if (result.outcome === 'ROBOT_SELECTED') {
        dispatch({ type: 'lobby-updated', lobby: result.lobby })
        return true
      }
      dispatch({ type: 'error', error: result.outcome })
      return false
    } catch {
      if (generation.current === attempt && socket.connected) {
        dispatch({ type: 'sync-requested' })
        dispatch({ type: 'error', error: 'TIMEOUT' })
      }
      return false
    } finally {
      if (generation.current === attempt) {
        pending.current = false
        setBusy(false)
      }
    }
  }
  function startLobby() {
    if (membership.status !== 'waiting') return
    void run(async () => {
      const result = await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('lobby.start', {})
      if (result.outcome === 'STARTED' && current.current.status === 'joined') return
      return result.outcome === 'STARTED' || result.outcome === 'NOT_A_MEMBER'
        ? { type: 'sync-requested' } : { type: 'error', error: result.outcome }
    }, 'start')
  }
  function leaveMembership() {
    void run(async () => {
      const result = membership.status === 'waiting'
        ? await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('lobby.leave', {})
        : game.state.assignment
          ? await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('game.leave', {}) : undefined
      return result?.outcome === 'LEFT' || result?.outcome === 'GAME_NOT_FOUND'
        ? { type: 'left' } : { type: 'sync-requested' }
    })
  }

  return {
    connection, game, membership, busy, lobbies, maps, mapsLoaded, listError,
    joinLobby, startLobby, leaveMembership, refreshLobbies,
    createLobby,
    selectRobot,
    retrySync: () => socket.connected ? dispatch({ type: 'sync-requested' }) : connection.connect(),
  }
}
