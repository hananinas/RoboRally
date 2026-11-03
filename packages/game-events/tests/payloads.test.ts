import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ClientToServerEvents,
  Coordinate,
  Instruction,
  PlayerId,
  PlayerState,
  Position,
  PublicGameState,
  PublicRegisterSlot,
  PublicRegisterStatus,
  PublicRegisters,
  RegisterOccupancy,
  RegistersChanged,
  RobotActionResolved,
  ServerToClientEvents,
  Tile,
  UpdateRegisters,
  UpdateRegistersResult,
} from '../src/index.js'

describe('game event payload types', () => {
  it('keeps tile coordinates separate from oriented robot positions', () => {
    const coordinate = { x: 2, y: 3 } satisfies Coordinate
    const position = { coordinate, orientation: 'NORTH' } satisfies Position
    const tile = { position: coordinate, type: 'EMPTY' } satisfies Tile
    const pit = { position: coordinate, type: 'PIT', walls: ['NORTH'] } satisfies Tile

    expectTypeOf<Tile['type']>().toEqualTypeOf<'EMPTY' | 'PIT'>()
    expectTypeOf<Tile['position']>().toEqualTypeOf<Coordinate>()
    expectTypeOf<Position['coordinate']>().toEqualTypeOf<Coordinate>()
    expectTypeOf<Position>().not.toMatchTypeOf<Coordinate>()
    expectTypeOf<Coordinate>().not.toMatchTypeOf<Position>()
    expect(position).toEqual({ coordinate: { x: 2, y: 3 }, orientation: 'NORTH' })
    expect(tile.position).toEqual({ x: 2, y: 3 })
    expect(pit.position).toEqual({ x: 2, y: 3 })
  })

  it('constructs a public game state', () => {
    const state = {
      gameId: 'game',
      antenna: { x: 0, y: 0, angle: 0 },
      board: { width: 1, height: 1, tiles: [] },
      robots: [],
      players: [],
      phase: 'PROGRAMMING',
      paused: false,
      aborted: false,
      checkpointCount: 0,
    } satisfies PublicGameState

    expect(state.gameId).toBe('game')
  })

  it('exposes instructions only on revealed snapshot slots', () => {
    type EmptySlot = Extract<PublicRegisterSlot, { status: 'EMPTY' }>
    type HiddenSlot = Extract<PublicRegisterSlot, { status: 'HIDDEN' }>
    type RevealedSlot = Extract<PublicRegisterSlot, { status: 'REVEALED' }>

    expectTypeOf<PublicRegisterStatus>().toEqualTypeOf<'EMPTY' | 'HIDDEN' | 'REVEALED'>()
    expectTypeOf<PublicRegisterSlot['status']>().toEqualTypeOf<PublicRegisterStatus>()
    expectTypeOf<EmptySlot>().toEqualTypeOf<Readonly<{ status: 'EMPTY' }>>()
    expectTypeOf<HiddenSlot>().toEqualTypeOf<Readonly<{ status: 'HIDDEN' }>>()
    expectTypeOf<RevealedSlot>().toEqualTypeOf<Readonly<{ status: 'REVEALED'; instruction: Instruction }>>()
    expectTypeOf<PlayerState['registers']>().toEqualTypeOf<PublicRegisters>()
    expectTypeOf<PublicRegisters['length']>().toEqualTypeOf<5>()
  })

  it('limits occupancy broadcasts to five status-only slots', () => {
    type OccupancySlot = RegistersChanged['registers'][number]

    expectTypeOf<OccupancySlot>().toEqualTypeOf<Readonly<{ status: 'EMPTY' | 'HIDDEN' }>>()
    expectTypeOf<RegistersChanged['registers']['length']>().toEqualTypeOf<5>()
    expectTypeOf<RegisterOccupancy>().toEqualTypeOf<readonly [boolean, boolean, boolean, boolean, boolean]>()
    expectTypeOf<UpdateRegisters['occupied']>().toEqualTypeOf<RegisterOccupancy>()
  })

  it('types register commands, acknowledgements, and public events', () => {
    expectTypeOf<ClientToServerEvents['game.updateRegisters']>().toEqualTypeOf<
      (payload: UpdateRegisters, acknowledge: (result: UpdateRegistersResult) => void) => void
    >()
    expectTypeOf<ServerToClientEvents['game.registersChanged']>().toEqualTypeOf<
      (payload: RegistersChanged) => void
    >()
    expectTypeOf<UpdateRegistersResult['outcome']>().toEqualTypeOf<
      | 'ACCEPTED'
      | 'INVALID_REQUEST'
      | 'NOT_A_MEMBER'
      | 'PLAYER_ID_MISMATCH'
      | 'WRONG_PHASE'
      | 'ALREADY_SUBMITTED'
      | 'INTERNAL_ERROR'
    >()
    expectTypeOf<RobotActionResolved['playerId']>().toEqualTypeOf<PlayerId>()
  })
})
