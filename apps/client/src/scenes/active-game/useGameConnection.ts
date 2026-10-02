import type {
  CardsDealt,
  JoinResult,
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
  const generation = useRef(0)

  // Keep event-time state current so submission checks see updates before React renders.
  const dispatch = useCallback((event: GameStateEvent) => {
    const next = gameStateReducer(current.current, event)
    current.current = next
    setState(next)
  }, [])

  const initialize = useCallback((result: Extract<JoinResult, { outcome: 'JOINED' }>) => {
    generation.current += 1
    dispatch({ type: 'joined', result })
  }, [dispatch])

  useEffect(() => {
    // Installed before joining. The acknowledgement initializes state synchronously
    // before Socket.IO delivers the subsequent gameplay events.
    const receive = (event: GameStateEvent) => {
      if (current.current.connected && current.current.assignment !== null) dispatch(event)
    }
    const handleDisconnect = () => {
      generation.current += 1
      dispatch({ type: 'disconnected' })
    }
    const handleCardsDealt = ({ cards }: CardsDealt) => receive({ type: 'dealt', cards })
    const handleProgramSubmitted = ({ playerId }: ProgramSubmitted) => {
      receive({ type: 'submitted', playerId })
    }
    const handleActionResolved = (action: RobotActionResolved) => receive({ type: 'action', action })

    socket.on('disconnect', handleDisconnect)
    socket.on('cards.dealt', handleCardsDealt)
    socket.on('program.submitted', handleProgramSubmitted)
    socket.on('robot.actionResolved', handleActionResolved)
    return () => {
      generation.current += 1
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
    const requestGeneration = generation.current
    const handVersion = current.current.handVersion
    dispatch({ type: 'submit' })
    socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit('program.submit', payload, (error, result) => {
      // A failed acknowledgement from an old connection must not affect the new session.
      if (!socket.connected || generation.current !== requestGeneration) return
      dispatch(error
        ? { type: 'submission-unknown', handVersion }
        : { type: 'result', result, handVersion })
    })
  }, [dispatch, socket])

  return { state, dispatch, submit, initialize }
}
