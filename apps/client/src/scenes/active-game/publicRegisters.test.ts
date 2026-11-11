import { describe, expect, it } from 'vitest'
import type { RobotActionResolved } from '@robo-rally/game-events'
import {
  canProgram, createClientGameState, gameStateReducer, getOtherPlayers,
} from './gameState.ts'
import { ADA_ID, ADA_OCCUPANCY, MIKKEL_ID, MIKKEL_OCCUPANCY, REGISTER_ROBOT_IDS, createRegisterState } from '../../../tests/player-registers-fixtures.ts'
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

const action: RobotActionResolved = {
  gameId: GAME_ID, playerId: ADA_ID, robotId: REGISTER_ROBOT_IDS[0], registerIndex: 2, instruction: 'MOVE_2', resolvedInstruction: 'MOVE_2',
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
      type: 'registers-changed', payload: { gameId: GAME_ID, playerId: ADA_ID, registers: ADA_OCCUPANCY },
    })).toBe(after)
  })

  it('ignores foreign occupancy and deals without disturbing a selected private card', () => {
    let state = joined()
    state = gameStateReducer(state, {
      type: 'player-connection-changed', payload: { gameId: GAME_ID, playerId: ADA_ID, connected: true, paused: false },
    })
    state = gameStateReducer(state, { type: 'place', cardId: 'private-card', registerIndex: 0 })
    const payload = { gameId: 'another-game', playerId: ADA_ID, registers: ADA_OCCUPANCY }
    expect(gameStateReducer(state, { type: 'registers-changed', payload })).toBe(state)
    expect(gameStateReducer(state, {
      type: 'dealt', hand: { gameId: 'another-game', playerId: PLAYER_ID, cards: [{ id: 'foreign', instruction: 'MOVE_1' }] },
    })).toBe(state)
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
    const mismatched: RobotActionResolved = { ...action, playerId: MIKKEL_ID }
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

  it('keeps queued faces hidden and finishes playback before showing the next round', () => {
    let state = gameStateReducer(joined(), {
      type: 'registers-changed',
      payload: { gameId: GAME_ID, playerId: ADA_ID, registers: MIKKEL_OCCUPANCY },
    })
    state = gameStateReducer(state, { type: 'action', action })
    state = gameStateReducer(state, { type: 'action', action: { ...action, registerIndex: 3, instruction: 'BACK_UP', resolvedInstruction: 'BACK_UP' } })
    expect(getOtherPlayers(state)[0].registers[3]).toEqual({ status: 'HIDDEN' })
    state = gameStateReducer(state, { type: 'dealt', hand: { gameId: GAME_ID, playerId: PLAYER_ID, cards: [{ id: 'next-private', instruction: 'BACK_UP' }] } })
    expect(getOtherPlayers(state)[0].registers[2]).toEqual({ status: 'REVEALED', instruction: 'MOVE_2' })
    expect(state.hand[0].id).toBe('private-card')
    const nextRegisters = ADA_OCCUPANCY
    state = gameStateReducer(state, { type: 'registers-changed', payload: { gameId: GAME_ID, playerId: ADA_ID, registers: nextRegisters } })
    state = gameStateReducer(state, { type: 'complete' })
    expect(getOtherPlayers(state)[0].registers[3]).toEqual({ status: 'REVEALED', instruction: 'BACK_UP' })
    expect(canProgram(state)).toBe(false)
    state = gameStateReducer(state, { type: 'complete' })
    expect(state.hand[0].id).toBe('next-private')
    expect(getOtherPlayers(state)[0].registers).toEqual(nextRegisters)
    expect(getOtherPlayers(state).every((player) => !player.programSubmitted)).toBe(true)
  })

  it('keeps a new hand usable when the deal arrives after playback ends', () => {
    let state = gameStateReducer(joined(), { type: 'action', action })
    state = gameStateReducer(state, { type: 'complete' })
    state = gameStateReducer(state, {
      type: 'player-connection-changed',
      payload: { gameId: GAME_ID, playerId: ADA_ID, connected: true, paused: false },
    })
    state = gameStateReducer(state, {
      type: 'dealt',
      hand: { gameId: GAME_ID, playerId: PLAYER_ID, cards: [{ id: 'next-private', instruction: 'BACK_UP' }] },
    })
    state = gameStateReducer(state, { type: 'place', cardId: 'next-private', registerIndex: 0 })
    expect(state.registers[0]?.id).toBe('next-private')
    expect(canProgram(state)).toBe(true)
  })

  it('resets every player’s registers when the local hand arrives and lets new occupancy stick', () => {
    let state = joined(true)
    expect(getOtherPlayers(state)[0].registers[0].status).toBe('REVEALED')
    state = gameStateReducer(state, {
      type: 'dealt',
      hand: { gameId: GAME_ID, playerId: PLAYER_ID, cards: [{ id: 'next-private', instruction: 'BACK_UP' }] },
    })
    expect(state.players.every((player) => player.registers.every((slot) => slot.status === 'EMPTY'))).toBe(true)
    expect(state.players.every((player) => !player.programSubmitted)).toBe(true)
    const nextRegisters = ADA_OCCUPANCY
    state = gameStateReducer(state, { type: 'registers-changed', payload: { gameId: GAME_ID, playerId: ADA_ID, registers: nextRegisters } })
    expect(state.players.find((player) => player.playerId === ADA_ID)?.registers).toEqual(nextRegisters)
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
