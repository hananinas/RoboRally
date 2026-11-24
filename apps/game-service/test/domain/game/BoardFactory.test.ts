import { describe, expect, it } from 'vitest'
import { boardMaps } from '@/domain/game/boardMaps'
import { Direction, EmptyTile, PitTile, createBoard } from '@/domain/game/index'
import { Integer } from '@/numbers'

describe('board factory', () => {
  it('keeps test pits within the resized map and preserves their walls', () => {
    const board = createBoard(boardMaps['test-map'])
    for (const [x, y] of boardMaps['test-map'].pits) {
      expect(board.getTile({ x: Integer(x), y: Integer(y) })).toBeInstanceOf(PitTile)
    }
    expect(board.getTile({ x: Integer(12), y: Integer(7) })?.walls).toEqual(new Set([Direction.NORTH, Direction.WEST]))
  })

  it('creates the empty map with the size specified by the map and no walls', () => {
    const board = createBoard(boardMaps['empty-map'])

    expect(board.width).toBe(boardMaps['empty-map'].width)
    expect(board.height).toBe(boardMaps['empty-map'].height)
    expect(board.getTile({ x: Integer(0), y: Integer(0) })).toBeInstanceOf(EmptyTile)
    expect(board.getTile({ x: Integer(board.width - 1), y: Integer(board.height - 1) })).toBeInstanceOf(EmptyTile)
    expect(board.getTile({ x: Integer(1), y: Integer(1) })?.walls.size).toBe(0)
  })

  it('applies the walls specified by the map', () => {
    const board = createBoard(boardMaps['test-map'])

    expect(board.width).toBe(boardMaps['test-map'].width)
    expect(board.height).toBe(boardMaps['test-map'].height)
    expect(board.getTile({ x: Integer(1), y: Integer(1) })?.walls).toEqual(new Set([Direction.NORTH, Direction.EAST]))
    expect(board.getTile({ x: Integer(4), y: Integer(2) })?.walls).toEqual(
      new Set([Direction.NORTH, Direction.WEST, Direction.SOUTH]),
    )
    expect(board.getTile({ x: Integer(14), y: Integer(1) })?.walls).toEqual(
      new Set([Direction.NORTH, Direction.WEST, Direction.SOUTH, Direction.EAST]),
    )
    expect(board.getTile({ x: Integer(12), y: Integer(0) })?.walls.size).toBe(0)
    expect(board.getTile({ x: Integer(0), y: Integer(0) })?.walls.size).toBe(0)
  })

  it('places the checkpoints specified by each map', () => {
    for (const mapName of ['empty-map', 'test-map'] as const) {
      const board = createBoard(boardMaps[mapName])

      expect(board.checkpointCount).toBe(2)
      expect(board.getTile({ x: Integer(10), y: Integer(6) })?.checkpointNumber).toBe(1)
      expect(board.getTile({ x: Integer(8), y: Integer(9) })?.checkpointNumber).toBe(2)
    }
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
    expect(createBoard(boardMaps['test-map']).antenna).toEqual(boardMaps['test-map'].antenna)
    expect(createBoard(boardMaps['empty-map']).antenna).toEqual(boardMaps['empty-map'].antenna)
  })

  it.each(['empty-map', 'test-map'] as const)('places a reboot tile on each of the four %s reboot positions', (mapName) => {
    const board = createBoard(boardMaps[mapName])
    const { rebootTiles, startTiles } = boardMaps[mapName]
    const keys = rebootTiles.map(([x, y]) => `${x},${y}`)

    expect(rebootTiles).toHaveLength(4)
    expect(board.rebootTiles.map(({ x, y }) => `${x},${y}`).toSorted()).toEqual(keys.toSorted())
    for (const { x, y } of board.rebootTiles) expect(board.getTile({ x, y })?.kind).toBe('REBOOT')
    expect(startTiles.filter(([x, y]) => keys.includes(`${x},${y}`))).toEqual([])
  })

  it('gives each board its own antenna object', () => {
    expect(createBoard(boardMaps['test-map']).antenna).not.toBe(createBoard(boardMaps['test-map']).antenna)
  })
  
  it('places a starting tile for every player of each map', () => {
    for (const mapName of ['empty-map', 'test-map'] as const) {
      const board = createBoard(boardMaps[mapName])

      expect(board.startTiles).toEqual(boardMaps[mapName].startTiles.map(([x, y]) => ({ x, y })))
      expect(board.startTiles).toHaveLength(boardMaps[mapName].maxPlayers)
    }
  })

  it('creates an independent board for each call', () => {
    expect(createBoard(boardMaps['test-map'])).not.toBe(createBoard(boardMaps['test-map']))
  })
})
