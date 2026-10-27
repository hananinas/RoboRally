import { describe, expect, it } from 'vitest'
import {
  canProgram, createClientGameState, gameStateReducer, getOtherPlayers,
} from './gameState.ts'
import type { PublicRobotActionResolved } from './publicRegisters.ts'
import { ADA_ID, MIKKEL_ID, REGISTER_ROBOT_IDS, createRegisterState } from '../../../tests/player-registers-fixtures.ts'
import { GAME_ID, PLAYER_ID, ROBOT_ID } from '../../../tests/game-fixture-data.ts'

function joined(executing = false) {
  return gameStateReducer(createClientGameState(), {
    type: 'joined',
    result: {
      outcome: 'JOINED', assignment: { gameId: GAME_ID, playerId: PLAYER_ID, robotId: ROBOT_ID },
      state: createRegisterState(executing), hand: [{ id: 'private-card', instruction: 'MOVE_3' }], programSubmitted: false,
    },
  })
}

const action: PublicRobotActionResolved = {
  gameId: GAME_ID, playerId: ADA_ID, robotId: REGISTER_ROBOT_IDS[0], registerIndex: 2, instruction: 'MOVE_2',
  position: { coordinate: { x: 3, y: 1 }, orientation: 'NORTH' },
  pushedRobots: [],
}

describe('public registers', () => {
  it('keeps the local program out of opponents and preserves robot colours on departure', () => {
    const state = joined()
    const opponents = getOtherPlayers(state)
    expect(opponents.map((player) => player.playerId)).not.toContain(PLAYER_ID)
    expect(opponents.map((player) => player.playerId)).toEqual(createRegisterState().players.slice(1).map((player) => player.playerId))
    const after = gameStateReducer(state, {
      type: 'player-left', payload: { gameId: GAME_ID, playerId: ADA_ID, robotId: REGISTER_ROBOT_IDS[0] },
    })
    expect(getOtherPlayers(after).map((player) => player.colour)).toEqual(opponents.slice(1).map((player) => player.colour))
    expect(gameStateReducer(after, {
      type: 'registers-changed', payload: { gameId: GAME_ID, playerId: ADA_ID, registers: opponents[0].registers },
    })).toBe(after)
  })

  it('ignores foreign occupancy and reset events without disturbing a selected private card', () => {
    let state = joined()
    state = gameStateReducer(state, {
      type: 'player-connection-changed', payload: { gameId: GAME_ID, playerId: ADA_ID, connected: true, paused: false },
    })
    state = gameStateReducer(state, { type: 'place', cardId: 'private-card', registerIndex: 0 })
    const payload = { gameId: 'another-game', playerId: ADA_ID, registers: createRegisterState(true).players[1].registers }
    expect(gameStateReducer(state, { type: 'registers-changed', payload })).toBe(state)
    expect(gameStateReducer(state, { type: 'programming-started', payload: { gameId: 'another-game' } })).toBe(state)
    const updated = gameStateReducer(state, { type: 'registers-changed', payload: { ...payload, gameId: GAME_ID } })
    expect(updated.registers[0]?.id).toBe('private-card')
    expect(updated.handReady).toBe(true)
    expect(updated.playback.active).toBeNull()
  })

  it('reveals only the action owner’s slot and rejects an inconsistent player identity', () => {
    const state = joined()
    const updated = gameStateReducer(state, { type: 'action', action })
    expect(getOtherPlayers(updated)[0].registers.map((slot) => slot.status)).toEqual(['HIDDEN', 'HIDDEN', 'REVEALED', 'EMPTY', 'EMPTY'])
    expect(getOtherPlayers(updated)[0].registers[2]).toEqual({ status: 'REVEALED', instruction: 'MOVE_2' })
    expect(updated.players.find((player) => player.playerId === MIKKEL_ID)?.registers).toBe(state.players.find((player) => player.playerId === MIKKEL_ID)?.registers)
    const mismatched: PublicRobotActionResolved = { ...action, playerId: MIKKEL_ID }
    expect(gameStateReducer(state, { type: 'action', action: mismatched })).toBe(state)
  })

  it('plays pushed robots without revealing their registers', () => {
    const state = joined()
    const pushedPosition = { coordinate: { x: 4, y: 2 }, orientation: 'NORTH' } as const
    const updated = gameStateReducer(state, {
      type: 'action',
      action: { ...action, pushedRobots: [{ robotId: REGISTER_ROBOT_IDS[1], position: pushedPosition }] },
    })
    expect(getOtherPlayers(updated)[0].registers[2]).toEqual({ status: 'REVEALED', instruction: 'MOVE_2' })
    expect(getOtherPlayers(updated)[1].registers).toBe(getOtherPlayers(state)[1].registers)
    const completed = gameStateReducer(updated, { type: 'complete' })
    expect(completed.playback.robots.find((robot) => robot.robotId === REGISTER_ROBOT_IDS[1])?.position).toEqual(pushedPosition)
    expect(getOtherPlayers(completed)[1].registers).toBe(getOtherPlayers(state)[1].registers)
  })

  it('resets public slots immediately but gates the next private hand behind queued playback', () => {
    let state = gameStateReducer(joined(), { type: 'action', action })
    state = gameStateReducer(state, { type: 'action', action: { ...action, registerIndex: 3 } })
    state = gameStateReducer(state, { type: 'programming-started', payload: { gameId: GAME_ID } })
    expect(getOtherPlayers(state).every((player) => player.registers.every((slot) => slot.status === 'EMPTY') && !player.programSubmitted)).toBe(true)
    expect(state.playback.active?.registerIndex).toBe(2)
    state = gameStateReducer(state, { type: 'dealt', hand: { gameId: GAME_ID, playerId: PLAYER_ID, cards: [{ id: 'next-private', instruction: 'BACK_UP' }] } })
    expect(state.hand[0].id).toBe('private-card')
    state = gameStateReducer(state, { type: 'complete' })
    expect(canProgram(state)).toBe(false)
    state = gameStateReducer(state, { type: 'complete' })
    expect(state.hand[0].id).toBe('next-private')
    expect(getOtherPlayers(state).every((player) => player.registers.every((slot) => slot.status === 'EMPTY'))).toBe(true)
  })

  it('replaces revealed registers from JOINED rather than carrying them into a reconnect', () => {
    const executing = joined(true)
    const next = gameStateReducer(executing, {
      type: 'joined', result: {
        outcome: 'JOINED', assignment: executing.assignment!, state: createRegisterState(), hand: [], programSubmitted: false,
      },
    })
    expect(getOtherPlayers(executing)[0].registers[0].status).toBe('REVEALED')
    expect(getOtherPlayers(next)[0].registers[0].status).toBe('HIDDEN')
    expect(getOtherPlayers(next)[2].connected).toBe(false)
  })
})
