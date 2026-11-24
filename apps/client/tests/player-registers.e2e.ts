import type { RobotActionResolved } from '@robo-rally/game-events'
import { GAME_ID } from './game-fixture-data.ts'
import { ADA_ID, ADA_OCCUPANCY, NOOR_ID, REGISTER_ROBOT_IDS, createRegisterState, executionPlayers } from './player-registers-fixtures.ts'
import { expect, openGame, test } from './game-fixture.ts'
import { reconnect } from './browserClient.ts'

test('opponents expose only public registers on hover and keyboard focus', async ({ page, game }) => {
  await game.control({ type: 'joined-state', state: createRegisterState(), hand: game.initial.cards, programSubmitted: false })
  await openGame(page)
  const panel = page.getByRole('complementary', { name: 'Other players’ registers' })
  await expect(panel.getByRole('group')).toHaveCount(3)
  await expect(panel.getByRole('group', { name: /^Noor,/ })).toHaveAccessibleName(/Reconnecting/)
  await expect(page.getByRole('heading', { name: 'Noor has disconnected' })).toBeVisible()
  await game.control({ type: 'connection-changed', payload: { gameId: GAME_ID, playerId: NOOR_ID, connected: true, paused: false } })
  await expect(page.locator('.disconnect-overlay')).toHaveCount(0)
  const ada = panel.getByRole('group', { name: /^Ada,/ })
  const readyPlayer = panel.getByRole('group', { name: /^Mikkel,/ })
  await expect(ada).not.toHaveAttribute('data-registers-locked')
  await expect(readyPlayer).toHaveAttribute('data-registers-locked', 'true')
  await expect(readyPlayer.locator('.other-player__dots > span').first()).toHaveCSS('background-color', 'rgb(243, 201, 77)')
  const ownSwatch = page.getByRole('img', { name: 'Robot colour' })
  const opponentSwatch = ada.locator('.robot-swatch')
  const swatchStyle = (element: Element) => {
    const { width, height, borderRadius, boxShadow } = getComputedStyle(element)
    return { width, height, borderRadius, boxShadow }
  }
  expect(await ownSwatch.evaluate(swatchStyle)).toEqual(await opponentSwatch.evaluate(swatchStyle))
  const { before, expansion, collapse } = await ada.evaluate(async (row) => {
    const identity = row.querySelector('.other-player__identity')!
    const name = row.querySelector('.other-player__name')!
    const registers = row.querySelector('.other-player__registers')!
    const status = row.querySelector('.other-player__status')!
    const dots = row.querySelector('.other-player__dots')!
    const readFrame = () => ({
      identity: identity.getBoundingClientRect().toJSON(),
      width: row.getBoundingClientRect().width,
      nameY: name.getBoundingClientRect().y,
      registersWidth: registers.getBoundingClientRect().width,
      registersOpacity: Number(getComputedStyle(registers).opacity),
      statusOpacity: Number(getComputedStyle(status).opacity),
      dotsOpacity: Number(getComputedStyle(dots).opacity),
      registersVisible: getComputedStyle(registers).visibility === 'visible',
    })
    const sampleTransition = async () => {
      await new Promise(requestAnimationFrame)
      const animations = row.getAnimations({ subtree: true }).filter((animation) => animation.playState !== 'finished')
      const widthTransition = animations.find((animation) =>
        animation instanceof CSSTransition && animation.transitionProperty === 'width')
      const duration = widthTransition?.effect?.getComputedTiming().endTime
      if (typeof duration !== 'number') throw new Error('The opponent panel did not animate its width')
      for (const animation of animations) {
        animation.pause()
        animation.currentTime = duration / 2
      }
      const during = readFrame()
      for (const animation of animations) animation.finish()
      return { during, after: readFrame() }
    }
    const before = readFrame()
    row.focus()
    const expansion = await sampleTransition()
    row.blur()
    const collapse = await sampleTransition()
    return { before, expansion, collapse }
  })
  expect(expansion.during.width).toBeGreaterThan(before.width)
  expect(expansion.during.width).toBeLessThan(expansion.after.width)
  expect(expansion.during.identity).toEqual(before.identity)
  expect(expansion.after.identity).toEqual(before.identity)
  expect(expansion.during.nameY).toBeLessThan(before.nameY)
  expect(expansion.after.nameY).toBe(before.nameY - 2)
  expect(expansion.during.registersWidth).toBe(expansion.after.registersWidth)
  expect(before.registersVisible).toBe(false)
  expect(expansion.during.registersVisible).toBe(true)
  expect(expansion.during.registersOpacity).toBeGreaterThan(0)
  expect(expansion.during.registersOpacity).toBeLessThan(1)
  expect(expansion.after.registersOpacity).toBe(1)
  expect(collapse.during.width).toBeGreaterThan(before.width)
  expect(collapse.during.width).toBeLessThan(expansion.after.width)
  expect(collapse.during.identity).toEqual(before.identity)
  expect(collapse.during.nameY).toBeGreaterThan(expansion.after.nameY)
  expect(collapse.during.nameY).toBeLessThan(before.nameY)
  expect(collapse.during.registersVisible).toBe(true)
  expect(collapse.during.registersOpacity).toBeGreaterThan(0)
  expect(collapse.during.registersOpacity).toBeLessThan(1)
  for (const frame of [expansion.during, collapse.during]) {
    expect(frame.statusOpacity).toBeGreaterThan(0)
    expect(frame.statusOpacity).toBeLessThan(1)
    expect(frame.dotsOpacity).toBeGreaterThan(0)
    expect(frame.dotsOpacity).toBeLessThan(1)
  }
  expect(collapse.after).toEqual(before)
  await expect(ada).toHaveAttribute('data-expanded', 'false')
  await ada.hover()
  await expect(ada).toHaveAttribute('data-expanded', 'true')
  await expect(ada.locator('.other-player__slot-label')).toHaveText(['Filled', 'Filled', 'Filled', 'Empty', 'Empty'])
  await expect(ada.locator('.other-player__status')).toHaveText('3/5 programmed')
  await ada.click()
  await page.mouse.move(800, 500)
  await expect(ada).not.toBeFocused()
  await expect(ada).toHaveAttribute('data-expanded', 'false')
  await ada.hover()
  await expect(panel).not.toContainText('Move 3')
  await page.keyboard.press('Escape')
  await expect(ada).toHaveAttribute('data-expanded', 'false')
  await ada.focus()
  await page.mouse.move(800, 500)
  await expect(ada).toHaveAttribute('data-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(ada).toHaveAttribute('data-expanded', 'false')
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('group', { name: /^Mikkel,/ })).toBeFocused()
  await expect(panel.getByRole('group', { name: /^Mikkel,/ })).toHaveAttribute('data-expanded', 'true')
})

test('reveals each register during playback and clears the panel when the new hand arrives', async ({ page, game }) => {
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
  const ada = page.getByRole('group', { name: /^Ada,/ })
  await ada.focus()
  await expect(ada.locator('.other-player__slot-label')).toHaveText(['Move 1', 'Turn Right', 'Filled', 'Filled', 'Filled'])
  const publicCards = ada.locator('.other-player__slot')
  const localSlot = page.locator('.register__card').first()
  await expect(publicCards.first()).toHaveCSS('height', await localSlot.evaluate((slot) => getComputedStyle(slot).height))
  await expect(publicCards.first()).toHaveCSS('border-radius', await localSlot.evaluate((slot) => getComputedStyle(slot).borderRadius))
  const moveOneIcon = await page.getByRole('button', { name: 'Move 1', exact: true }).first().locator('img').getAttribute('src')
  await expect(publicCards.first().locator('img')).toHaveAttribute('src', moveOneIcon!)
  await expect(publicCards.nth(2).locator('img')).toHaveCount(0)
  const action: RobotActionResolved = {
    gameId: GAME_ID, playerId: ADA_ID, robotId: REGISTER_ROBOT_IDS[0], registerIndex: 2, instruction: 'MOVE_2', resolvedInstruction: 'MOVE_2',
    position: { coordinate: { x: 3, y: 1 }, orientation: 'NORTH' },
    pushedRobots: [], reboots: [],
  }
  await game.control({ type: 'round', actions: [action, { ...action, registerIndex: 3, instruction: 'BACK_UP', resolvedInstruction: 'BACK_UP' }], deferHand: true })
  await expect(ada.locator('.other-player__slot--current .other-player__slot-label')).toHaveText('Move 2')
  await expect(ada.locator('.other-player__slot--future .other-player__slot-label')).toHaveText(['Filled', 'Filled'])
  await expect(ada).not.toHaveAccessibleName(/Back Up/)
  await expect(ada.locator('.other-player__slot--current .other-player__slot-label')).toHaveText('Move 2')
  await game.control({ type: 'deal' })
  await page.clock.runFor(600)
  await expect(ada.locator('.other-player__slot--current .other-player__slot-label')).toHaveText('Back Up')
  await page.clock.runFor(700)
  await expect(ada.locator('.other-player__slot-label')).toHaveText(['Empty', 'Empty', 'Empty', 'Empty', 'Empty'])
  await expect(ada.locator('.other-player__status')).toHaveText('0/5 programmed')
  await game.control({ type: 'registers-changed', payload: { gameId: GAME_ID, playerId: ADA_ID, registers: ADA_OCCUPANCY } })
  await expect(ada.locator('.other-player__slot-label')).toHaveText(['Filled', 'Filled', 'Filled', 'Empty', 'Empty'])
  await expect(ada.locator('.other-player__status')).toHaveText('3/5 programmed')
  await game.control({ type: 'submitted', submission: { gameId: GAME_ID, playerId: ADA_ID } })
  await expect(ada.locator('.other-player__status')).toHaveText('Ready')
})

test('expanded registers fit a narrow active scene and reconnect replaces the public snapshot', async ({ page, game }) => {
  await game.control({ type: 'joined-state', state: createRegisterState(), hand: game.initial.cards, programSubmitted: false })
  await openGame(page, 320, 740)
  const ada = page.getByRole('group', { name: /^Ada,/ })
  await ada.focus()
  await expect(ada.locator('.other-player__registers')).toBeVisible()
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
