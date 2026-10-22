import { describe, expect, it } from 'vitest'
import { boardMaps } from '@/game/boardMaps'
import { Direction, EmptyTile, PitTile, createBoard } from '@/game/index'

describe('board factory', () => {
  it('keeps test pits within the resized map and preserves their walls', () => {
    const board = createBoard('test-map')
    for (const [x, y] of boardMaps['test-map'].pits) {
      expect(board.getTile({ x, y })).toBeInstanceOf(PitTile)
    }
    expect(board.getTile({ x: 12, y: 7 })?.walls).toEqual(new Set([Direction.NORTH, Direction.WEST]))
    expect(createBoard('empty-map').hasPits).toBe(false)
  })

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

  it('places the checkpoints specified by each map', () => {
    for (const mapName of ['empty-map', 'test-map'] as const) {
      const board = createBoard(mapName)

      expect(board.checkpointCount).toBe(2)
      expect(board.getTile({ x: 10, y: 6 })?.checkpointNumber).toBe(1)
      expect(board.getTile({ x: 8, y: 9 })?.checkpointNumber).toBe(2)
    }
  })

  it('retains map lobby details on the created board', () => {
    const board = createBoard('test-map')

    expect(board.map).toEqual({
      name: boardMaps['test-map'].name,
      icon: boardMaps['test-map'].icon,
      maxPlayers: boardMaps['test-map'].maxPlayers,
    })
  })

  it('uses distinct map artwork for the empty and test maps', () => {
    const emptyMapSvg = Buffer.from(
      boardMaps['empty-map'].icon.split(',')[1],
      'base64',
    ).toString()
    const testMapSvg = Buffer.from(
      boardMaps['test-map'].icon.split(',')[1],
      'base64',
    ).toString()

    expect(emptyMapSvg).toContain('viewBox="0 0 3 3"')
    expect(testMapSvg).toContain('>TEST</text>')
  })

  it('reads the priority antenna location from the map', () => {
    expect(createBoard('test-map').antenna).toEqual(boardMaps['test-map'].antenna)
    expect(createBoard().antenna).toEqual(boardMaps['empty-map'].antenna)
  })

  it('gives each board its own antenna object', () => {
    expect(createBoard('test-map').antenna).not.toBe(createBoard('test-map').antenna)
  })

  it('creates an independent board for each call', () => {
    expect(createBoard('test-map')).not.toBe(createBoard('test-map'))
  })
})
