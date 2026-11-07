import { expect, openGame, test } from './game-fixture.ts'

test('stacks eleven Pushcap slices beside walls and a robot, with shared hover lift', async ({ page, game }) => {
  const state = {
    ...game.initial.state,
    checkpointCount: 1,
    board: {
      ...game.initial.state.board,
      tiles: game.initial.state.board.tiles.map((tile) =>
        tile.position.x === 5 && tile.position.y === 5
          ? { ...tile, checkpointNumber: 1, walls: ['NORTH', 'WEST'] as const }
          : tile),
    },
  }
  await game.control({ type: 'joined-state', state, hand: game.initial.cards, programSubmitted: false })
  await openGame(page)

  const slices = page.locator('[data-board-checkpoint-slice="1"]')
  const foot = slices.first()
  const cap = page.getByRole('img', { name: 'Checkpoint 1', exact: true })
  await expect(slices).toHaveCount(11)
  await expect(cap.locator('text')).toHaveText('1')
  expect(await slices.evaluateAll((elements) => elements.map((element) => ({
    plane: Number(element.parentElement?.dataset.boardLayer),
    height: Number((element as SVGElement).dataset.boardHeight),
    lift: Number((element as SVGElement).dataset.boardLiftHeight),
  })))).toEqual(Array.from({ length: 11 }, (_, index) => ({
    plane: index + 3, height: (index + 3) / 2, lift: 1.5,
  })))
  await expect(page.locator('[data-board-wall][data-board-tile="5,5"]')).toHaveCount(16)
  await expect(page.locator('[data-robot-id][data-board-tile="5,5"]')).toHaveCount(8)

  // Move away from the camera centre so different heights visibly separate.
  await page.mouse.move(900, 150)
  await page.mouse.down()
  await page.mouse.move(1000, 230, { steps: 6 })
  await page.mouse.up()
  const displacement = () => slices.evaluateAll((elements) => {
    const x = (element: Element) => Number.parseFloat(getComputedStyle(element).getPropertyValue('--board-piece-x'))
    return x(elements[elements.length - 1]) - x(elements[0])
  })
  await expect.poll(displacement).toBeGreaterThan(1)
  const separation = await displacement()
  const footOffset = () => foot.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).getPropertyValue('--board-piece-x')))
  const beforeHover = await footOffset()

  const surface = page.locator('[data-board-component="surface"][data-board-tile="5,5"]')
  const bounds = await surface.boundingBox()
  if (!bounds) throw new Error('Checkpoint tile is missing')
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await expect.poll(footOffset).toBeGreaterThan(beforeHover + 0.1)
  // The tile lifts the foot and cap equally, keeping the assembled shape intact.
  await expect.poll(displacement).toBeCloseTo(separation, 2)
})
