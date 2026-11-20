import type { EnvironmentStepResolved, PublicGameState } from '@robo-rally/game-events'
import { expect, openGame, pauseClock, test, type GameFixture } from './game-fixture.ts'
import { GAME_ID, GAME_SERVICE_URL, OTHER_PLAYER_ID, OTHER_ROBOT_ID, PLAYER_ID, ROBOT_ID, ROUND_ACTIONS } from './game-fixture-data.ts'

const environment: EnvironmentStepResolved = {
  gameId: GAME_ID,
  kind: 'GEARS',
  robots: [
    { robotId: ROBOT_ID, position: { coordinate: { x: 6, y: 4 }, orientation: 'WEST' } },
    { robotId: OTHER_ROBOT_ID, position: { coordinate: { x: 8, y: 5 }, orientation: 'EAST' } },
  ],
}

const checkpoint = (lastCheckpoint = 1) => ({
  gameId: GAME_ID, kind: 'CHECKPOINTS' as const,
  checkpointProgress: [{ playerId: PLAYER_ID, lastCheckpoint }],
})

function setCheckpointState(game: GameFixture, state: Partial<PublicGameState> = {}) {
  return game.control({
    type: 'joined-state', state: { ...game.initial.state, checkpointCount: 2, ...state },
    hand: game.initial.cards, programSubmitted: false,
  })
}

test('plays environment changes between cards and keeps the next hand locked', async ({ page, game }) => {
  await page.clock.install()
  await setCheckpointState(game)
  await openGame(page)
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  await expect(hand.first()).toBeEnabled()
  await pauseClock(page)
  for (let index = 0; index < 5; index++) await hand.nth(index).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()

  const empty = { ...environment, robots: [] }
  await game.control({ type: 'round', actions: [ROUND_ACTIONS[0], environment, checkpoint(), ROUND_ACTIONS[1], empty] })
  const robot = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  const other = page.locator(`[data-robot-id="${OTHER_ROBOT_ID}"]`).first()
  const checkpoints = page.getByRole('heading', { name: 'Checkpoints', exact: true }).locator('..')
  await expect(robot).toHaveAttribute('data-board-tile', '5,4')
  await expect(other).toHaveAttribute('data-board-tile', '7,5')
  await expect(checkpoints).toContainText('0/2')
  await expect(page.locator('.register[data-active]')).toContainText('1')

  await page.clock.runFor(600)
  await expect(robot).toHaveAttribute('data-board-tile', '6,4')
  await expect(other).toHaveAttribute('data-board-tile', '8,5')
  await expect(checkpoints).toContainText('0/2')
  await expect(page.locator('.register[data-active]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /remove from register/ })).toHaveCount(5)
  await expect(hand.last()).toBeDisabled()
  await expect(page.getByRole('status')).toHaveText('Executing')

  await page.clock.runFor(300)
  await expect(checkpoints).toContainText('1/2')
  await expect(robot).toHaveAttribute('data-board-tile', '5,3')
  await expect(page.locator('.register[data-active]')).toContainText('2')
  await expect(hand.last()).toBeDisabled()
  await page.clock.runFor(599)
  await expect(page.locator('.register[data-active]')).toContainText('2')
  await expect(hand.last()).toBeDisabled()
  await page.clock.runFor(1)
  await expect(page.getByRole('status')).toHaveText('Programming')
  await expect(page.getByRole('button', { name: /remove from register/ })).toHaveCount(0)
  await expect(hand.first()).toBeEnabled()
})

test('replaces queued effects with a reconnect snapshot', async ({ page, game }) => {
  await page.clock.install()
  await openGame(page)
  await pauseClock(page)
  await game.control({ type: 'round', actions: [ROUND_ACTIONS[0], environment], deferHand: true })
  const robot = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  await expect(robot).toHaveAttribute('data-board-tile', '5,4')

  const snapshot = {
    ...game.initial.state, phase: 'EXECUTING' as const, checkpointCount: 2,
    robots: game.initial.state.robots.map((robot) => robot.robotId === ROBOT_ID
      ? { ...robot, position: { coordinate: { x: 9, y: 9 }, orientation: 'SOUTH' as const } } : robot),
    players: game.initial.state.players.map((player) => ({ ...player, lastCheckpoint: 1 })),
  }
  await game.control({ type: 'joined-state', state: snapshot, hand: game.initial.cards, programSubmitted: true })
  await page.reload()
  await expect(robot).toHaveAttribute('data-board-tile', '9,9')
  const checkpoints = page.getByRole('heading', { name: 'Checkpoints', exact: true }).locator('..')
  await expect(checkpoints).toContainText('1/2')
  await expect(page.getByRole('status')).toHaveText('Executing')

  await game.control({ type: 'round', actions: [environment, checkpoint(2)] })
  await expect(robot).toHaveAttribute('data-board-tile', '6,4')
  await expect(checkpoints).toContainText('1/2')
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  await expect(hand.last()).toBeDisabled()
  await page.clock.runFor(600)
  await expect(checkpoints).toContainText('2/2')
  await expect(hand.first()).toBeEnabled()
  await expect(page.getByRole('status')).toHaveText('Programming')
})

test('plays all five checkpoint steps across two rounds before opening programming', async ({ page, game }) => {
  await page.clock.install()
  await setCheckpointState(game)
  await openGame(page)
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  const robot = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  const checkpoints = page.getByRole('heading', { name: 'Checkpoints', exact: true }).locator('..')
  await expect(hand.first()).toBeEnabled()
  await pauseClock(page)
  for (let round = 0; round < 2; round++) {
    for (let index = 0; index < 5; index++) await hand.nth(index).click()
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()
    const steps = ROUND_ACTIONS.map((_, registerIndex): EnvironmentStepResolved => ({
      gameId: GAME_ID, kind: 'CHECKPOINTS',
      checkpointProgress: registerIndex === 3 ? [{ playerId: PLAYER_ID, lastCheckpoint: round + 1 }] : [],
    }))
    await game.control({ type: 'round', actions: ROUND_ACTIONS.flatMap((action, index) => [action, steps[index]]) })
    for (const action of ROUND_ACTIONS) {
      await expect(robot).toHaveAttribute('data-board-tile', `${action.position.coordinate.x},${action.position.coordinate.y}`)
      await expect(page.locator('.register[data-active]')).toContainText(String(action.registerIndex + 1))
      await expect(hand.last()).toBeDisabled()
      await expect(checkpoints).toContainText(`${action.registerIndex <= 3 ? round : round + 1}/2`)
      await page.clock.runFor(action.instruction === 'TURN_LEFT' ? 300 : 600)
    }
    await expect(hand.first()).toBeEnabled()
    await expect(page.getByRole('status')).toHaveText('Programming')
    await expect(page.getByRole('button', { name: /remove from register/ })).toHaveCount(0)
    await expect(checkpoints).toContainText(`${round + 1}/2`)
  }
  expect((await game.snapshot()).submissions).toHaveLength(2)
})

test('ignores environment results from another game', async ({ page, game }) => {
  await page.clock.install()
  await setCheckpointState(game)
  await openGame(page)
  await pauseClock(page)
  const foreign = {
    gameId: 'other',
    kind: 'GEARS' as const,
    robots: [{ robotId: ROBOT_ID, position: { coordinate: { x: 0, y: 0 }, orientation: 'SOUTH' as const } }],
  }
  await game.control({ type: 'round', actions: [ROUND_ACTIONS[0], environment, checkpoint(), ROUND_ACTIONS[1]] })
  await game.control({ type: 'inject-environment', result: foreign })
  const robot = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  const checkpoints = page.getByRole('heading', { name: 'Checkpoints', exact: true }).locator('..')
  await expect(robot).toHaveAttribute('data-board-tile', '5,4')
  await page.clock.runFor(600)
  await expect(robot).toHaveAttribute('data-board-tile', '6,4')
  await expect(checkpoints).toContainText('0/2')
  await expect(hand.last()).toBeDisabled()
  await page.clock.runFor(600)
  await expect(robot).toHaveAttribute('data-board-tile', '5,3')
  await expect(checkpoints).toContainText('1/2')
  await page.clock.runFor(600)
  await expect(hand.first()).toBeEnabled()
  await expect(page.getByRole('status')).toHaveText('Programming')

})

test('rejects invalid round results without changing the fixture snapshot', async ({ game, request }) => {
  await setCheckpointState(game)
  const before = await game.control({ type: 'round', actions: [environment] })
  const actions = [ROUND_ACTIONS[0], { ...environment, gameId: 'other' }]
  const response = await request.post(`${GAME_SERVICE_URL}/fixtures/${game.initial.id}`, { data: { type: 'round', actions } })
  expect(response.status()).toBe(400)
  expect(await game.snapshot()).toEqual({ ...before, state: { ...before.state, serverTime: expect.any(Number) } })
})

test('keeps a queued environment result when the active robot leaves', async ({ page, game }) => {
  await page.clock.install()
  await setCheckpointState(game, {
    players: [...game.initial.state.players, {
      playerId: OTHER_PLAYER_ID, username: 'Other', connected: true, programSubmitted: false, registers: game.initial.state.players[0].registers, lastCheckpoint: 0,
    }],
  })
  await openGame(page)
  await pauseClock(page)
  const action = { ...ROUND_ACTIONS[0], robotId: OTHER_ROBOT_ID, playerId: OTHER_PLAYER_ID,
    instruction: 'TURN_LEFT' as const, resolvedInstruction: 'TURN_LEFT' as const }
  await game.control({ type: 'round', actions: [action, environment, checkpoint()] })
  await expect(page.getByRole('group', { name: /^Other,/ }).locator('.register-card[data-active]')).toHaveCount(1)
  await game.control({ type: 'player-left', player: { gameId: GAME_ID, playerId: OTHER_PLAYER_ID, robotId: OTHER_ROBOT_ID } })
  const robot = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  await expect(robot).toHaveAttribute('data-board-tile', '6,4')
  await expect(page.locator(`[data-robot-id="${OTHER_ROBOT_ID}"]`)).toHaveCount(0)
  await expect(page.locator('.register-card[data-active]')).toHaveCount(0)
  await page.clock.runFor(299)
  await expect(hand.last()).toBeDisabled()
  await expect(page.getByRole('status')).toHaveText('Executing')
  await page.clock.runFor(1)
  await expect(hand.first()).toBeEnabled()
  await expect(page.getByRole('status')).toHaveText('Programming')
  await expect(page.getByRole('heading', { name: 'Checkpoints', exact: true }).locator('..')).toContainText('1/2')
})
