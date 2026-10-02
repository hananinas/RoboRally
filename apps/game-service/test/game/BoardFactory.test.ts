import { describe, expect, it } from 'vitest'
import { boardMaps } from '@/game/boardMaps'
import { Direction, EmptyTile, createBoard, getAntenna } from '@/game/index'

describe('board factory', () => {
  it('creates the empty map with the size specified by the map and no walls', () => {
    const board = createBoard('empty-map')

    expect(board.width).toBe(boardMaps['empty-map'].width)
    expect(board.height).toBe(boardMaps['empty-map'].height)
    expect(board.getTile({ x: 0, y: 0 })).toBeInstanceOf(EmptyTile)
    expect(board.getTile({ x: board.width - 1, y: board.height - 1 })).toBeInstanceOf(EmptyTile)
    expect(board.getTile({ x: 1, y: 1 })?.walls.size).toBe(0)
  })

  it('defaults to the empty map', () => {
    expect(createBoard().getTile({ x: 1, y: 1 })?.walls.size).toBe(0)
  })

  it('applies the walls specified by the map', () => {
    const board = createBoard('test-map')

    expect(board.width).toBe(boardMaps['test-map'].width)
    expect(board.height).toBe(boardMaps['test-map'].height)
    expect(board.getTile({ x: 1, y: 1 })?.walls).toEqual(new Set([Direction.NORTH, Direction.EAST]))
    expect(board.getTile({ x: 4, y: 2 })?.walls).toEqual(
      new Set([Direction.NORTH, Direction.WEST, Direction.SOUTH]),
    )
    expect(board.getTile({ x: 14, y: 1 })?.walls).toEqual(
      new Set([Direction.NORTH, Direction.WEST, Direction.SOUTH, Direction.EAST]),
    )
    expect(board.getTile({ x: 12, y: 0 })?.walls.size).toBe(0)
    expect(board.getTile({ x: 0, y: 0 })?.walls.size).toBe(0)
  })

  it('reads the priority antenna location from the map', () => {
    expect(getAntenna('test-map')).toEqual(boardMaps['test-map'].antenna)
    expect(getAntenna()).toEqual(boardMaps['empty-map'].antenna)
  })

  it('returns a fresh antenna object each call', () => {
    expect(getAntenna('test-map')).not.toBe(getAntenna('test-map'))
  })

  it('creates an independent board for each call', () => {
    expect(createBoard('test-map')).not.toBe(createBoard('test-map'))
  })
})
