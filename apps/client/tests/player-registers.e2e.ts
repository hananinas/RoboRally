import type { PublicRobotActionResolved } from '../src/scenes/active-game/publicRegisters.ts'
import { GAME_ID } from './game-fixture-data.ts'
import { ADA_ID, NOOR_ID, REGISTER_ROBOT_IDS, createRegisterState, executionPlayers } from './player-registers-fixtures.ts'
import { expect, openGame, test } from './game-fixture.ts'
import { reconnect } from './browserClient.ts'

test('opponents expose only public registers on hover and keyboard focus', async ({ page, game }) => {
  await game.control({ type: 'joined-state', state: createRegisterState(), hand: game.initial.cards, programSubmitted: false })
  await openGame(page)
  const panel = page.getByRole('complementary', { name: 'Other players’ registers' })
  await expect(panel.getByRole('button')).toHaveCount(3)
  await expect(panel.getByRole('button', { name: /^Noor,/ })).toHaveAccessibleName(/Reconnecting/)
  await expect(page.getByRole('heading', { name: 'Noor has disconnected' })).toBeVisible()
  await game.control({ type: 'connection-changed', payload: { gameId: GAME_ID, playerId: NOOR_ID, connected: true, paused: false } })
  await expect(page.locator('.disconnect-overlay')).toHaveCount(0)
  const ada = panel.getByRole('button', { name: /^Ada,/ })
  await expect(ada).toHaveAttribute('aria-expanded', 'false')
  await ada.hover()
  await expect(ada).toHaveAttribute('aria-expanded', 'true')
  await expect(ada.locator('.other-player__slot-label')).toHaveText(['Filled', 'Filled', 'Filled', 'Empty', 'Empty'])
  await expect(ada.locator('.other-player__status')).toHaveText('3/5 programmed')
  await expect(panel).not.toContainText('Move 3')
  await page.keyboard.press('Escape')
  await expect(ada).toHaveAttribute('aria-expanded', 'false')
  await ada.focus()
  await page.mouse.move(800, 500)
  await expect(ada).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(ada).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('button', { name: /^Mikkel,/ })).toBeFocused()
  await expect(panel.getByRole('button', { name: /^Mikkel,/ })).toHaveAttribute('aria-expanded', 'true')
})

test('reveals each register during playback and defers the displayed reset until playback ends', async ({ page, game }) => {
  const snapshot = createRegisterState(true)
  await game.control({
    type: 'joined-state',
    state: {
      ...snapshot,
      players: snapshot.players.map((player) => player.playerId === ADA_ID
        ? { ...player, registers: executionPlayers[1].registers } : player),
    },
    hand: game.initial.cards,
    programSubmitted: false,
  })
  await openGame(page)
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'))
  const ada = page.getByRole('button', { name: /^Ada,/ })
  await ada.focus()
  await expect(ada.locator('.other-player__slot-label')).toHaveText(['Move 1', 'Turn Right', 'Filled', 'Filled', 'Filled'])
  const action: PublicRobotActionResolved = {
    gameId: GAME_ID, playerId: ADA_ID, robotId: REGISTER_ROBOT_IDS[0], registerIndex: 2, instruction: 'MOVE_2',
    position: { coordinate: { x: 3, y: 1 }, orientation: 'NORTH' },
    pushedRobots: [],
  }
  await game.control({ type: 'round', actions: [action, { ...action, registerIndex: 3, instruction: 'BACK_UP' }], deferHand: true })
  await expect(ada.locator('.other-player__slot--current .other-player__slot-label')).toHaveText('Move 2')
  await expect(ada.locator('.other-player__slot--future .other-player__slot-label')).toHaveText(['Filled', 'Filled'])
  await expect(ada).not.toHaveAccessibleName(/Back Up/)
  await game.control({ type: 'programming-started', payload: { gameId: GAME_ID } })
  await expect(ada.locator('.other-player__slot--current .other-player__slot-label')).toHaveText('Move 2')
  await game.control({ type: 'deal' })
  await page.clock.runFor(600)
  await expect(ada.locator('.other-player__slot--current .other-player__slot-label')).toHaveText('Back Up')
  await game.control({ type: 'registers-changed', payload: { gameId: GAME_ID, playerId: ADA_ID, registers: createRegisterState().players[1].registers } })
  await expect(ada.locator('.other-player__slot--current .other-player__slot-label')).toHaveText('Back Up')
  await page.clock.runFor(700)
  await expect(ada.locator('.other-player__slot-label')).toHaveText(['Filled', 'Filled', 'Filled', 'Empty', 'Empty'])
  await expect(ada.locator('.other-player__status')).toHaveText('3/5 programmed')
  await game.control({ type: 'submitted', submission: { gameId: GAME_ID, playerId: ADA_ID } })
  await expect(ada.locator('.other-player__status')).toHaveText('Ready')
})

test('expanded registers fit a narrow active scene and reconnect replaces the public snapshot', async ({ page, game }) => {
  await game.control({ type: 'joined-state', state: createRegisterState(), hand: game.initial.cards, programSubmitted: false })
  await openGame(page, 320, 740)
  const ada = page.getByRole('button', { name: /^Ada,/ })
  await ada.focus()
  const last = await ada.locator('.other-player__slot').last().boundingBox()
  expect(last!.x + last!.width).toBeLessThanOrEqual(320)
  const panel = await page.locator('.other-players').boundingBox()
  const hud = await page.locator('.game-hud').boundingBox()
  expect(panel!.y).toBeGreaterThanOrEqual(hud!.y + hud!.height)
  expect(await page.locator('.other-players').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await game.control({ type: 'joined-state', state: createRegisterState(true), hand: game.initial.cards, programSubmitted: false })
  await reconnect(page)
  await ada.focus()
  await expect(ada.locator('.other-player__slot-label')).toHaveText(['Move 1', 'Turn Right', 'Move 2', 'Filled', 'Filled'])
  await expect(ada.locator('.other-player__status')).toHaveText('Waiting')
})
