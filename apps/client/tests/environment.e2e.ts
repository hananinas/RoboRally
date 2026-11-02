import type { EnvironmentStepResolved, PublicGameState } from '@robo-rally/game-events'
import { expect, openGame, pauseClock, test, type GameFixture } from './game-fixture.ts'
import { GAME_ID, GAME_SERVICE_URL, OTHER_PLAYER_ID, OTHER_ROBOT_ID, PLAYER_ID, ROBOT_ID, ROUND_ACTIONS } from './game-fixture-data.ts'

const environment: EnvironmentStepResolved = {
  gameId: GAME_ID, roundNumber: 1, registerIndex: 0, stepIndex: 0,
  kind: 'CHECKPOINTS', sequence: 1,
  robots: [
    { robotId: ROBOT_ID, position: { coordinate: { x: 6, y: 4 }, orientation: 'WEST' } },
    { robotId: OTHER_ROBOT_ID, position: { coordinate: { x: 8, y: 5 }, orientation: 'EAST' } },
  ],
  checkpointProgress: [{ playerId: PLAYER_ID, lastCheckpoint: 1 }],
}

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

  const empty = { ...environment, registerIndex: 1, sequence: 2, robots: [], checkpointProgress: [] }
  await game.control({ type: 'round', actions: [ROUND_ACTIONS[0], environment, ROUND_ACTIONS[1], empty] })
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
  await expect(checkpoints).toContainText('1/2')
  await expect(page.locator('.register[data-active]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /remove from register/ })).toHaveCount(5)
  await expect(hand.last()).toBeDisabled()
  await expect(page.getByRole('status')).toHaveText('Executing')

  await page.clock.runFor(600)
  await expect(robot).toHaveAttribute('data-board-tile', '5,3')
  await expect(page.locator('.register[data-active]')).toContainText('2')
  await expect(hand.last()).toBeDisabled()
  await page.clock.runFor(600)
  await expect(page.locator('.register[data-active]')).toHaveCount(0)
  await expect(hand.last()).toBeDisabled()
  await page.clock.runFor(1)
  await expect(page.getByRole('status')).toHaveText('Programming')
  await expect(page.getByRole('button', { name: /remove from register/ })).toHaveCount(0)
  await expect(hand.first()).toBeEnabled()
})

test('replaces queued effects with a reconnect snapshot and ignores resolved sequences', async ({ page, game }) => {
  await page.clock.install()
  await openGame(page)
  await pauseClock(page)
  await game.control({ type: 'round', actions: [ROUND_ACTIONS[0], environment], deferHand: true })
  const robot = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  await expect(robot).toHaveAttribute('data-board-tile', '5,4')

  const snapshot = {
    ...game.initial.state, phase: 'EXECUTING' as const, checkpointCount: 2,
    execution: {
      roundNumber: 2, lastEnvironmentSequence: 5,
      activation: { stage: 'ENVIRONMENT' as const, registerIndex: 0, stepIndex: 0, kind: 'CHECKPOINTS' as const },
    },
    robots: game.initial.state.robots.map((robot) => robot.robotId === ROBOT_ID
      ? { ...robot, position: { coordinate: { x: 9, y: 9 }, orientation: 'SOUTH' as const } } : robot),
    players: game.initial.state.players.map((player) => ({ ...player, lastCheckpoint: 1 })),
  }
  await game.control({ type: 'joined-state', state: snapshot, hand: game.initial.cards, programSubmitted: true })
  await page.reload()
  await expect(robot).toHaveAttribute('data-board-tile', '9,9')
  const checkpoints = page.getByRole('heading', { name: 'Checkpoints', exact: true }).locator('..')
  await expect(checkpoints).toContainText('1/2')
  const stale = { ...environment, sequence: 5 }
  const beforeReplay = await game.snapshot()
  expect(await game.control({ type: 'inject-environment', result: stale })).toEqual(beforeReplay)
  await expect(robot).toHaveAttribute('data-board-tile', '9,9')
  await expect(page.getByRole('status')).toHaveText('Executing')
  await page.reload()
  await expect(robot).toHaveAttribute('data-board-tile', '9,9')
  await expect(checkpoints).toContainText('1/2')
  await expect(page.getByRole('status')).toHaveText('Executing')

  const next = { ...environment, roundNumber: 2, sequence: 6, checkpointProgress: [{ playerId: PLAYER_ID, lastCheckpoint: 2 }] }
  await game.control({ type: 'round', actions: [next] })
  await expect(robot).toHaveAttribute('data-board-tile', '6,4')
  await expect(checkpoints).toContainText('2/2')
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  await expect(hand.last()).toBeDisabled()
  await page.clock.runFor(600)
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
    const steps = ROUND_ACTIONS.map((action, registerIndex): EnvironmentStepResolved => ({
      ...environment, roundNumber: round + 1, registerIndex: action.registerIndex,
      sequence: round * 5 + registerIndex + 1, robots: [],
      checkpointProgress: registerIndex === 3 ? [{ playerId: PLAYER_ID, lastCheckpoint: round + 1 }] : [],
    }))
    await game.control({ type: 'round', actions: ROUND_ACTIONS.flatMap((action, index) => [action, steps[index]]) })
    for (const action of ROUND_ACTIONS) {
      await expect(robot).toHaveAttribute('data-board-tile', `${action.position.coordinate.x},${action.position.coordinate.y}`)
      await expect(page.locator('.register[data-active]')).toContainText(String(action.registerIndex + 1))
      await expect(hand.last()).toBeDisabled()
      await expect(checkpoints).toContainText(`${action.registerIndex <= 3 ? round : round + 1}/2`)
      await page.clock.runFor(action.instruction === 'TURN_LEFT' ? 300 : 600)
      await expect(page.locator('.register[data-active]')).toHaveCount(0)
      await expect(hand.last()).toBeDisabled()
      await page.clock.runFor(1)
    }
    await expect(hand.first()).toBeEnabled()
    await expect(page.getByRole('status')).toHaveText('Programming')
    await expect(page.getByRole('button', { name: /remove from register/ })).toHaveCount(0)
    await expect(checkpoints).toContainText(`${round + 1}/2`)
  }
  expect((await game.snapshot()).submissions).toHaveLength(2)
})

test('ignores foreign and duplicate environment results while the next hand is queued', async ({ page, game }) => {
  await page.clock.install()
  await setCheckpointState(game)
  await openGame(page)
  await pauseClock(page)
  const duplicate = {
    ...environment,
    robots: [{ robotId: ROBOT_ID, position: { coordinate: { x: 0, y: 0 }, orientation: 'SOUTH' as const } }],
    checkpointProgress: [{ playerId: PLAYER_ID, lastCheckpoint: 2 }],
  }
  const beforeInjection = await game.control({ type: 'round', actions: [ROUND_ACTIONS[0], environment, ROUND_ACTIONS[1]] })
  expect(await game.control({ type: 'inject-environment', result: duplicate })).toEqual(beforeInjection)
  expect(await game.control({ type: 'inject-environment', result: { ...duplicate, gameId: 'other', sequence: 99 } })).toEqual(beforeInjection)
  const robot = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  const checkpoints = page.getByRole('heading', { name: 'Checkpoints', exact: true }).locator('..')
  await expect(robot).toHaveAttribute('data-board-tile', '5,4')
  await page.clock.runFor(600)
  await expect(robot).toHaveAttribute('data-board-tile', '6,4')
  await expect(checkpoints).toContainText('1/2')
  await expect(hand.last()).toBeDisabled()
  await page.clock.runFor(600)
  await expect(robot).toHaveAttribute('data-board-tile', '5,3')
  await expect(checkpoints).toContainText('1/2')
  await page.clock.runFor(600)
  await expect(hand.first()).toBeEnabled()
  await expect(page.getByRole('status')).toHaveText('Programming')
  await page.reload()
  await expect(robot).toHaveAttribute('data-board-tile', '5,3')
  await expect(checkpoints).toContainText('1/2')
  await expect(hand.first()).toBeEnabled()
  expect(await game.control({ type: 'inject-environment', result: duplicate })).toMatchObject({
    state: beforeInjection.state, cards: beforeInjection.cards,
  })
  await expect(robot).toHaveAttribute('data-board-tile', '5,3')
  await expect(checkpoints).toContainText('1/2')
  await expect(page.getByRole('status')).toHaveText('Programming')
})

test('rejects invalid round results without changing the fixture snapshot', async ({ game, request }) => {
  await setCheckpointState(game)
  const before = await game.control({ type: 'round', actions: [environment] })
  expect(before.state.execution).toEqual({ roundNumber: 2, lastEnvironmentSequence: 1, activation: null })
  for (const actions of [
    [environment],
    [{ ...environment, gameId: 'other', sequence: 2 }],
    [{ ...environment, sequence: 2 }, environment],
  ]) {
    const response = await request.post(`${GAME_SERVICE_URL}/fixtures/${game.initial.id}`, { data: { type: 'round', actions } })
    expect(response.status()).toBe(400)
    expect(await game.snapshot()).toEqual(before)
  }
})

test('keeps a queued environment result when the active robot leaves', async ({ page, game }) => {
  await page.clock.install()
  await setCheckpointState(game, {
    players: [...game.initial.state.players, {
      playerId: OTHER_PLAYER_ID, username: 'Other', connected: true, programSubmitted: false, lastCheckpoint: 0,
    }],
  })
  await openGame(page)
  await pauseClock(page)
  const action = { ...ROUND_ACTIONS[0], robotId: OTHER_ROBOT_ID, instruction: 'TURN_LEFT' as const }
  await game.control({ type: 'round', actions: [action, environment] })
  await expect(page.locator('.register[data-active]')).toHaveCount(1)
  await game.control({ type: 'player-left', player: { gameId: GAME_ID, playerId: OTHER_PLAYER_ID, robotId: OTHER_ROBOT_ID } })
  const robot = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  await expect(robot).toHaveAttribute('data-board-tile', '6,4')
  await expect(page.locator(`[data-robot-id="${OTHER_ROBOT_ID}"]`)).toHaveCount(0)
  await expect(page.locator('.register[data-active]')).toHaveCount(0)
  await page.clock.runFor(300)
  await expect(hand.last()).toBeDisabled()
  await expect(page.getByRole('status')).toHaveText('Executing')
  await page.clock.runFor(300)
  await expect(hand.first()).toBeEnabled()
  await expect(page.getByRole('status')).toHaveText('Programming')
  await expect(page.getByRole('heading', { name: 'Checkpoints', exact: true }).locator('..')).toContainText('1/2')
})
