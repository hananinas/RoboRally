import { test, expect, openGame } from './game-fixture.ts'
import { GAME_ID, PLAYER_ID, OTHER_PLAYER_ID, ROBOT_ID, OTHER_ROBOT_ID } from './game-fixture-data.ts'

test('plays a push as one action and updates a robot that already acted', async ({ page, game }) => {
  await page.clock.install()
  await game.control({
    type: 'joined-state',
    state: {
      ...game.initial.state,
      robots: game.initial.state.robots.map((robot) => ({
        ...robot,
        position: robot.robotId === ROBOT_ID
          ? { coordinate: { x: 5, y: 5 }, orientation: 'EAST' }
          : { coordinate: { x: 6, y: 5 }, orientation: 'WEST' },
      })),
    },
    hand: game.initial.cards,
    programSubmitted: false,
  })
  await openGame(page)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  const actor = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  const pushed = page.locator(`[data-robot-id="${OTHER_ROBOT_ID}"]`).first()
  const actorSprite = await actor.elementHandle()
  const pushedSprite = await pushed.elementHandle()

  await game.control({ type: 'round', actions: [
    {
      gameId: GAME_ID, playerId: OTHER_PLAYER_ID, registerIndex: 0, robotId: OTHER_ROBOT_ID, instruction: 'TURN_LEFT',
      position: { coordinate: { x: 6, y: 5 }, orientation: 'SOUTH' }, pushedRobots: [],
    },
    {
      gameId: GAME_ID, playerId: PLAYER_ID, registerIndex: 0, robotId: ROBOT_ID, instruction: 'MOVE_2',
      position: { coordinate: { x: 7, y: 5 }, orientation: 'EAST' },
      pushedRobots: [{ robotId: OTHER_ROBOT_ID, position: { coordinate: { x: 8, y: 5 }, orientation: 'SOUTH' } }],
    },
  ] })

  await expect(pushed).toHaveAttribute('data-board-tile', '6,5')
  await expect.poll(() => pushed.evaluate((element) => element.style.getPropertyValue('--board-piece-angle'))).toBe('-180deg')
  await expect(actor).toHaveAttribute('data-board-tile', '5,5')
  await page.clock.runFor(300)
  await expect(actor).toHaveAttribute('data-board-tile', '7,5')
  await expect(pushed).toHaveAttribute('data-board-tile', '8,5')
  expect(await actor.evaluate((element, original) => element === original, actorSprite)).toBe(true)
  expect(await pushed.evaluate((element, original) => element === original, pushedSprite)).toBe(true)
  await expect.poll(() => pushed.evaluate((element) => element.style.getPropertyValue('--board-piece-angle'))).toBe('-180deg')
  await page.clock.runFor(600)
  await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button').first()).toBeEnabled()

  const snapshot = await game.snapshot()
  expect(snapshot.state.robots.map((robot) => robot.position.coordinate)).toEqual([{ x: 7, y: 5 }, { x: 8, y: 5 }])
})
