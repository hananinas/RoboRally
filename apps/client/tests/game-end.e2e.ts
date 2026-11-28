import type { Page } from '@playwright/test'
import { expect, openGame, test, type GameFixture } from './game-fixture.ts'
import { OTHER_PLAYER_ID, OTHER_ROBOT_ID, PLAYER_ID, ROBOT_ID } from './game-fixture-data.ts'
import { gameStatus } from './browserClient.ts'

// Reduced motion makes the camera jump straight to the winner instead of gliding.
test.use({ reducedMotion: 'reduce' })

const FINAL_CHECKPOINT = { x: 8, y: 9 }

// Two players race for two checkpoints; the winner already stands on the final one.
async function finishRace(page: Page, game: GameFixture, winner: { playerId: string; username: string }) {
  const base = game.initial.state
  const winnerIsMe = winner.playerId === PLAYER_ID
  await game.control({
    type: 'joined-state',
    hand: game.initial.cards,
    programSubmitted: false,
    state: {
      ...base,
      checkpointCount: 2,
      players: [
        { ...base.players[0], lastCheckpoint: winnerIsMe ? 2 : 1 },
        { ...base.players[0], playerId: OTHER_PLAYER_ID, username: 'dane', lastCheckpoint: winnerIsMe ? 1 : 2 },
      ],
      board: {
        ...base.board,
        tiles: base.board.tiles.map((tile) =>
          tile.position.x === 2 && tile.position.y === 8 ? { ...tile, checkpointNumber: 1 }
            : tile.position.x === FINAL_CHECKPOINT.x && tile.position.y === FINAL_CHECKPOINT.y
              ? { ...tile, checkpointNumber: 2 } : tile),
      },
      robots: base.robots.map((robot) => robot.playerId === winner.playerId
        ? { ...robot, position: { coordinate: FINAL_CHECKPOINT, orientation: 'SOUTH' as const } }
        : robot),
    },
  })
  await openGame(page)
  await game.control({ type: 'won', ...winner })
}

async function distanceFromCentre(page: Page, robotId: string) {
  const viewport = page.viewportSize()
  const bounds = await page.locator(`[data-robot-id="${robotId}"]`).first().boundingBox()
  if (!viewport || !bounds) throw new Error('Robot or viewport is missing')
  return Math.hypot(
    bounds.x + bounds.width / 2 - viewport.width / 2,
    bounds.y + bounds.height / 2 - viewport.height / 2,
  )
}

test('ends the game on the board instead of covering it', async ({ page, game }) => {
  await finishRace(page, game, { playerId: OTHER_PLAYER_ID, username: 'dane' })

  const banner = page.getByRole('region', { name: 'Game over' })
  await expect(banner.getByRole('heading')).toHaveText('dane wins!')
  await expect(gameStatus(page)).toHaveText('Game over')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // The hand makes room for the banner; the board itself stays uncovered.
  await expect(page.getByRole('region', { name: 'Programming hand' })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Other players’ registers' })).toHaveCount(0)

  // The winning robot celebrates on the final checkpoint, which takes the winner's colour.
  await expect(page.locator(`[data-robot-id="${OTHER_ROBOT_ID}"][data-celebrating]`)).toHaveCount(8)
  await expect(page.locator(`[data-robot-id="${ROBOT_ID}"][data-celebrating]`)).toHaveCount(0)
  await expect(page.locator('.board-victory-glow')).toHaveCount(1)
  await expect(page.getByRole('img', { name: 'Checkpoint 2', exact: true })).toHaveAttribute('data-claimed', 'true')
  await expect(page.getByRole('img', { name: 'Checkpoint 1', exact: true })).not.toHaveAttribute('data-claimed')

  // Everyone sees how close they came.
  const standings = page.getByRole('complementary', { name: 'Final standings' }).getByRole('listitem')
  await expect(standings).toHaveText(['1dane2/2', '2Player 1 (you)1/2'])

  // The camera centres the winner, and players can still look around the board.
  await expect.poll(() => distanceFromCentre(page, OTHER_ROBOT_ID)).toBeLessThan(10)
  await page.mouse.move(400, 300)
  await page.mouse.down()
  await page.mouse.move(150, 150, { steps: 6 })
  await page.mouse.up()
  await expect.poll(() => distanceFromCentre(page, OTHER_ROBOT_ID)).toBeGreaterThan(200)
  await banner.getByRole('button', { name: 'Show winner', exact: true }).click()
  await expect.poll(() => distanceFromCentre(page, OTHER_ROBOT_ID)).toBeLessThan(10)

  // Nobody is sent away automatically: leaving is the player's choice.
  await banner.getByRole('button', { name: 'Leave game', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Create lobby', exact: true })).toBeVisible()
})

test('tells the winner they won', async ({ page, game }) => {
  await finishRace(page, game, { playerId: PLAYER_ID, username: 'Player 1' })

  const banner = page.getByRole('region', { name: 'Game over' })
  await expect(banner.getByRole('heading')).toHaveText('You win!')
  await expect(banner.getByRole('button', { name: 'Show my robot', exact: true })).toBeVisible()
  await expect(page.locator(`[data-robot-id="${ROBOT_ID}"][data-celebrating]`)).toHaveCount(8)
  await expect(page.getByRole('complementary', { name: 'Final standings' }).getByRole('listitem').first())
    .toHaveText(/^1\s*Player 1 \(you\)/)
})
