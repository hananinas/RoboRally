import type { JoinResult, CardsDealt, PhaseChanged, RobotActionResolved, PlayerJoined, PlayerLeft } from '@robo-rally/game-events'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ACKNOWLEDGEMENT_TIMEOUT_MS, type GameSocket } from '../../useGameSocket.ts'
import { useRobotPlaybackTimer } from './board/robotPlayback.ts'
import { createClientGameState, createSubmission, gameStateReducer, type GameStateEvent } from './gameState.ts'

export default function useGameConnection(socket: GameSocket) {
  const [state, setState] = useState(createClientGameState)
  const current = useRef(state)
  const dispatch = useCallback((event: GameStateEvent) => {
    const next = gameStateReducer(current.current, event)
    current.current = next
    setState(next)
  }, [])

  const initialize = useCallback((result: Extract<JoinResult, { outcome: 'JOINED' }>) => {
    dispatch({ type: 'joined', result })
  }, [dispatch])

  useEffect(() => {
    const disconnect = () => dispatch({ type: 'disconnected' })
    const hand = (payload: CardsDealt) => dispatch({ type: 'dealt', hand: payload })
    const phase = (payload: PhaseChanged) => dispatch({ type: 'phase', phase: payload })
    const action = (payload: RobotActionResolved) => dispatch({ type: 'action', action: payload })
    const joined = (payload: PlayerJoined) => dispatch({ type: 'player-joined', payload })
    const left = (payload: PlayerLeft) => dispatch({ type: 'player-left', payload })
    socket.on('disconnect', disconnect)
    socket.on('cards.dealt', hand)
    socket.on('game.phaseChanged', phase)
    socket.on('robot.actionResolved', action)
    socket.on('game.playerJoined', joined)
    socket.on('game.playerLeft', left)
    return () => {
      socket.off('disconnect', disconnect)
      socket.off('cards.dealt', hand)
      socket.off('game.phaseChanged', phase)
      socket.off('robot.actionResolved', action)
      socket.off('game.playerJoined', joined)
      socket.off('game.playerLeft', left)
    }
  }, [socket, dispatch])

  useRobotPlaybackTimer(state.playback.active, dispatch)
  const submit = useCallback(() => {
    const payload = createSubmission(current.current)
    if (!socket.connected || !payload) return
    const handVersion = current.current.handVersion
    dispatch({ type: 'submit' })
    socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit('program.submit', payload, (error, result) => {
      if (!socket.connected) return
      dispatch(error ? { type: 'submission-unknown', handVersion } : { type: 'result', result, handVersion })
    })
  }, [socket, dispatch])
  return { state, dispatch, submit, initialize }
}
