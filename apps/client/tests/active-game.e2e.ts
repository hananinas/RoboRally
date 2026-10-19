import type { Dialog, Page } from '@playwright/test'
import { expect, openGame, test } from './game-fixture.ts'
import { GAME_ID, OTHER_PLAYER_ID, OTHER_ROBOT_ID, PLAYER_ID, ROBOT_ID, ROUND_ACTIONS } from './game-fixture-data.ts'
async function fillProgram(page: Page, indices = [0, 1, 2, 3, 4]) {
  const cards = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  for (const index of indices) await cards.nth(index).click()
}

// The installed clock keeps ticking with real time until it is paused, so a
// fixed pause time can already lie in the past after a slow cold-cache load
// ("Cannot fast-forward to the past"). Pause one second past the current fake
// time instead — still a small jump, because fast-forwarding past the
// Socket.IO ping interval expires the heartbeat and disconnects the client.
async function pauseClock(page: Page) {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
}

test('renders the programming interface', async ({ page }) => {
  await openGame(page)

  const controls = page.getByRole('complementary', { name: 'Game controls' })
  const hand = page.getByRole('region', { name: 'Programming hand' })

  await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
  await expect(controls.getByRole('heading', { name: 'Player 1' })).toBeVisible()
  await expect(hand.getByRole('button')).toHaveCount(9)
  await expect(controls.getByRole('button', { name: 'Done' })).toBeDisabled()
  await expect(page.getByText('Programming', { exact: true })).toBeVisible()
})

test('collapses player details from the keyboard', async ({ page }) => {
  await openGame(page)

  const collapse = page.getByRole('button', {
    name: 'Collapse player details',
  })

  await collapse.focus()
  await page.keyboard.press('Enter')

  const expand = page.getByRole('button', { name: 'Expand player details' })
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('heading', { name: 'Health' })).toHaveCount(0)

  await expand.click()
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('heading', { name: 'Health' })).toBeVisible()
})

test('programs, removes, and confirms cards without resetting on a duplicate hand', async ({ page, game }) => {
  await openGame(page)

  const controls = page.getByRole('complementary', { name: 'Game controls' })
  const handCards = page
    .getByRole('region', { name: 'Programming hand' })
    .getByRole('button')
  const done = controls.getByRole('button', { name: 'Done' })

  for (let index = 0; index < 5; index += 1) {
    await handCards.nth(index).click()
  }

  const registerCards = controls.getByRole('button', {
    name: /remove from register/,
  })
  await expect(registerCards).toHaveCount(5)
  await expect(done).toBeEnabled()
  await game.control({ type: 'deal' })
  await expect(registerCards).toHaveCount(5)
  await expect(done).toBeEnabled()

  await registerCards.nth(2).click()
  await expect(registerCards).toHaveCount(4)
  await expect(done).toBeDisabled()

  await handCards.nth(2).click()
  await expect(done).toBeEnabled()
  await done.click()

  await expect(controls.getByRole('button', { name: 'Confirmed' })).toBeDisabled()
  await expect(handCards.last()).toBeDisabled()
  await expect(registerCards.first()).toBeDisabled()
})

test('drags a card into a register and ignores outside drops', async ({
  page,
}) => {
  await openGame(page)

  const handCards = page
    .getByRole('region', { name: 'Programming hand' })
    .getByRole('button')
  const source = handCards.first()
  const target = page.locator('[data-register-index="2"]')
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()

  if (!sourceBox || !targetBox) throw new Error('Card positions are unavailable')

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 5 },
  )

  const preview = page.locator('.dragged-card')
  const targetShape = await target.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      borderRadius: style.borderRadius,
      height: style.height,
      width: style.width,
    }
  })

  await expect(preview).toHaveCount(1)
  await expect
    .poll(() =>
      preview.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          borderRadius: style.borderRadius,
          height: style.height,
          width: style.width,
        }
      }),
    )
    .toEqual(targetShape)

  await page.mouse.up()
  const registeredCards = page.getByRole('button', {
    name: /remove from register/,
  })
  await expect(registeredCards).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: /remove from register 3$/ }),
  ).toBeVisible()

  const secondSourceBox = await handCards.nth(1).boundingBox()
  if (!secondSourceBox) throw new Error('Card position is unavailable')

  await page.mouse.move(
    secondSourceBox.x + secondSourceBox.width / 2,
    secondSourceBox.y + secondSourceBox.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(300, 200, { steps: 5 })
  await page.mouse.up()

  await expect(registeredCards).toHaveCount(1)
})

test('navigates the hand with h/l, wrapping around and skipping registered cards', async ({ page }) => {
  await openGame(page)
  const handCards = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')

  await handCards.nth(1).click()
  await expect(handCards.nth(1)).toBeDisabled()
  await page.mouse.move(0, 0)

  await handCards.nth(0).focus()
  await page.keyboard.press('l')
  await expect(handCards.nth(2)).toBeFocused()

  await page.keyboard.press('h')
  await expect(handCards.nth(0)).toBeFocused()

  await page.keyboard.press('h')
  await expect(handCards.nth(8)).toBeFocused()
})

test('d then a digit removes one register, and dd clears all of them', async ({ page }) => {
  await openGame(page)
  await fillProgram(page)
  const registerCards = page.getByRole('complementary', { name: 'Game controls' })
    .getByRole('button', { name: /remove from register/ })
  await expect(registerCards).toHaveCount(5)

  await page.keyboard.press('d')
  await page.keyboard.press('1')
  await expect(registerCards).toHaveCount(4)

  await page.keyboard.press('d')
  await page.keyboard.press('d')
  await expect(registerCards).toHaveCount(0)

  await page.keyboard.press('u')
  await expect(registerCards).toHaveCount(4)
})

test('clears a dangling "d" instead of letting it bleed into the next round', async ({ page, game }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await openGame(page)
  await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button').first()).toBeEnabled()
  await pauseClock(page)
  await fillProgram(page)

  const registerCards = page.getByRole('complementary', { name: 'Game controls' })
    .getByRole('button', { name: /remove from register/ })
  await expect(registerCards).toHaveCount(5)

  // Start a delete sequence, then submit by mouse before pressing the second key.
  await page.keyboard.press('d')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()
  
  //wait for round to finish
  await game.control({ type: 'round', actions: ROUND_ACTIONS })
  for (const action of ROUND_ACTIONS) {
    await page.clock.runFor(action.instruction === 'TURN_LEFT' ? 300 : 600)
  }

  await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button').first()).toBeEnabled()
  await expect(page.getByText('Programming', { exact: true })).toBeVisible()
  await fillProgram(page)
  await expect(registerCards).toHaveCount(5)

  // A leftover "d" from last round must not be mistaken for the second key of "dd".
  await page.keyboard.press('d')
  await expect(registerCards).toHaveCount(5)
  await page.keyboard.press('1')
  await expect(registerCards).toHaveCount(4)
})

test(':w then Enter submits after confirming, only once the program is complete', async ({ page }) => {
  await openGame(page)
  const controls = page.getByRole('complementary', { name: 'Game controls' })
  const done = controls.getByRole('button', { name: 'Done' })

  await fillProgram(page, [0, 1, 2])
  await expect(done).toBeDisabled()

  let dialogShown = false
  const onUnexpectedDialog = (dialog: Dialog) => {
    dialogShown = true
    void dialog.dismiss()
  }
  page.on('dialog', onUnexpectedDialog)
  await page.keyboard.press(':')
  await page.keyboard.press('w')
  await page.keyboard.press('Enter')
  await expect(done).toBeDisabled()
  expect(dialogShown).toBe(false)
  page.off('dialog', onUnexpectedDialog)

  await fillProgram(page, [3, 4])
  await expect(done).toBeEnabled()
  page.once('dialog', (dialog) => dialog.accept())
  await page.keyboard.press(':')
  await page.keyboard.press('w')
  await page.keyboard.press('Enter')
  await expect(controls.getByRole('button', { name: 'Confirmed' })).toBeDisabled()
})

test('adapts the hand and panel overflow to available space', async ({
  page,
}) => {
  await openGame(page, 1000, 600)

  const hand = page.getByRole('region', { name: 'Programming hand' })
  const hud = page.getByRole('complementary', { name: 'Game controls' })
  const initialHandBox = await hand.boundingBox()
  const initialHudBox = await hud.boundingBox()

  if (!initialHandBox || !initialHudBox) {
    throw new Error('Layout positions are unavailable')
  }

  expect(initialHandBox.x + initialHandBox.width).toBeLessThanOrEqual(
    initialHudBox.x,
  )

  await page
    .getByRole('button', { name: 'Collapse player details' })
    .click()

  await expect
    .poll(async () => (await hand.boundingBox())?.width)
    .toBeGreaterThan(999)

  const fullHand = await hand.evaluate((element) => ({
    clientWidth: element.clientWidth,
    paddingInline: Number.parseFloat(getComputedStyle(element).paddingInline),
    scrollWidth: element.scrollWidth,
  }))
  expect(fullHand.scrollWidth).toBeGreaterThan(fullHand.clientWidth)
  expect(fullHand.paddingInline).toBeGreaterThan(0)

  await openGame(page, 700, 400)
  const shortHud = await hud.evaluate((element) => ({
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    paddingTop: Number.parseFloat(getComputedStyle(element).paddingTop),
    scrollHeight: element.scrollHeight,
  }))
  expect(shortHud.scrollHeight).toBeGreaterThan(shortHud.clientHeight)
  expect(shortHud.overflowY).toBe('auto')
  expect(shortHud.paddingTop).toBeGreaterThan(0)

  await openGame(page, 480, 800)
  const compactHand = await hand.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  const compactHandBox = await hand.boundingBox()
  const compactHudBox = await hud.boundingBox()

  if (!compactHandBox || !compactHudBox) {
    throw new Error('Compact layout positions are unavailable')
  }

  expect(compactHudBox.y).toBeLessThan(compactHandBox.y)
  expect(compactHandBox.width).toBe(480)
  expect(compactHand.scrollWidth).toBeGreaterThan(compactHand.clientWidth)
})

test('centres registers and cards when space allows', async ({ page }) => {
  await openGame(page, 1600, 800)

  const gaps = await page.evaluate(() => {
    const measureGaps = (container: Element, items: Element[]) => {
      const containerBox = container.getBoundingClientRect()
      const containerStyle = getComputedStyle(container)
      const firstBox = items[0].getBoundingClientRect()
      const lastBox = items.at(-1)!.getBoundingClientRect()

      return {
        left:
          firstBox.left -
          containerBox.left -
          Number.parseFloat(containerStyle.paddingLeft),
        right:
          containerBox.right -
          Number.parseFloat(containerStyle.paddingRight) -
          lastBox.right,
      }
    }

    const hand = document.querySelector('.programming-hand')!
    const registers = document.querySelector('.registers')!

    return {
      hand: measureGaps(hand, [...hand.querySelectorAll('.program-card')]),
      registers: measureGaps(registers, [
        ...registers.querySelectorAll('.register'),
      ]),
    }
  })

  expect(Math.abs(gaps.hand.left - gaps.hand.right)).toBeLessThan(1)
  expect(Math.abs(gaps.registers.left - gaps.registers.right)).toBeLessThan(1)
})

test('preserves the selected program after rejection and submits the same ordered cards on retry', async ({ page, game }) => {
  await game.control({ type: 'submission', outcome: 'INVALID_PROGRAM', deferred: false })
  await openGame(page)
  const indices = [4, 1, 6, 3, 8]
  await fillProgram(page, indices)

  const registered = page.getByRole('button', { name: /remove from register/ })
  const selectedLabels = await registered.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
  const done = page.getByRole('button', { name: 'Done', exact: true })
  await done.click()

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(done).toBeEnabled()
  expect(await registered.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))).toEqual(selectedLabels)
  await expect(registered.first()).toBeEnabled()
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  await expect(hand.nth(4)).toBeDisabled()
  await expect(hand.nth(0)).toBeEnabled()

  const submitted = { gameId: GAME_ID, playerId: PLAYER_ID, cardIds: indices.map((index) => game.initial.cards[index].id) }
  await expect.poll(async () => (await game.snapshot()).submissions).toEqual([submitted])
  await game.control({ type: 'submission', outcome: 'ACCEPTED', deferred: false })
  await done.click()
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()
  await expect.poll(async () => (await game.snapshot()).submissions).toEqual([submitted, submitted])
})

test('prevents duplicate submissions while awaiting an acknowledgement and after acceptance', async ({ page, game }) => {
  await game.control({ type: 'submission', outcome: 'ACCEPTED', deferred: true })
  await openGame(page)
  await fillProgram(page)
  const done = page.getByRole('button', { name: 'Done', exact: true })
  await done.dblclick()

  await expect(page.getByRole('button', { name: 'Submitting…', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: /remove from register/ }).first()).toBeDisabled()
  await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button').last()).toBeDisabled()
  const submitted = { gameId: GAME_ID, playerId: PLAYER_ID, cardIds: game.initial.cards.slice(0, 5).map((card) => card.id) }
  await expect.poll(async () => (await game.snapshot()).submissions).toEqual([submitted])

  await game.control({ type: 'acknowledge', outcome: 'ACCEPTED' })
  const confirmed = page.getByRole('button', { name: 'Confirmed', exact: true })
  await expect(confirmed).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('Waiting for other players')
  await confirmed.evaluate((button: HTMLButtonElement) => button.click())
  expect((await game.snapshot()).submissions).toEqual([submitted])
})

test('plays every burst result and starts the next program without refreshing state', async ({ page, game }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await openGame(page)
  await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button').first()).toBeEnabled()
  await pauseClock(page)
  await fillProgram(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()

  const robot = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  const original = await robot.elementHandle()
  if (!original) throw new Error('Robot sprite is unavailable')
  const nextRound = await game.control({ type: 'round', actions: ROUND_ACTIONS })
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  const registered = page.getByRole('button', { name: /remove from register/ })
  await expect(registered).toHaveCount(5)
  await expect(hand).toHaveCount(9)

  const angles = ['0deg', '0deg', '-90deg', '-90deg', '-180deg']
  for (const [index, action] of ROUND_ACTIONS.entries()) {
    const tile = `${action.position.coordinate.x},${action.position.coordinate.y}`
    await expect(robot).toHaveAttribute('data-board-tile', tile)
    expect(await robot.evaluate((element, first) => element === first, original)).toBe(true)
    expect(await robot.evaluate((element) => (element as SVGElement).style.getPropertyValue('--board-piece-angle'))).toBe(angles[index])
    await expect(hand.first()).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()
    await expect(page.getByText('Executing', { exact: true })).toBeVisible()
    if (index === 0) {
      await page.clock.runFor(300)
      const top = await robot.evaluate((element) => Number.parseFloat(getComputedStyle(element).top))
      expect(top).toBeLessThan(0)
      expect(top).toBeGreaterThan(-78)
      await page.clock.runFor(300)
    } else {
      await page.clock.runFor(action.instruction === 'TURN_LEFT' ? 300 : 600)
    }
  }

  await expect(hand.first()).toBeEnabled()
  await expect(page.getByText('Programming', { exact: true })).toBeVisible()
  await expect(registered).toHaveCount(0)
  await expect(robot).toHaveAttribute('data-board-tile', '4,3')
  await expect.poll(() => robot.evaluate((element) => Number.parseFloat(getComputedStyle(element).getPropertyValue('--board-piece-angle')))).toBeCloseTo(-180, 1)
  await fillProgram(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()
  await expect.poll(async () => (await game.snapshot()).submissions).toEqual([
    { gameId: GAME_ID, playerId: PLAYER_ID, cardIds: game.initial.cards.slice(0, 5).map((card) => card.id) },
    { gameId: GAME_ID, playerId: PLAYER_ID, cardIds: nextRound.cards.slice(0, 5).map((card) => card.id) },
  ])
  expect((await game.snapshot()).stateRequests).toBe(0)
})

test('keeps programming editable when another player submits', async ({ page, game }) => {
  await openGame(page)
  await game.control({
    type: 'submitted',
    submission: { gameId: GAME_ID, playerId: OTHER_PLAYER_ID },
  })
  await expect(page.getByRole('status')).toHaveText('Programming')
  await fillProgram(page)
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: /remove from register/ }).first()).toBeEnabled()
})

test('plays both robots in every register before accepting the next hand', async ({ page, game }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await openGame(page)
  await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button').first()).toBeEnabled()
  await pauseClock(page)
  await fillProgram(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()
  const actions = ROUND_ACTIONS.flatMap((action) => [
    action,
    {
      ...action,
      robotId: OTHER_ROBOT_ID,
      position: { ...action.position, coordinate: { x: action.position.coordinate.x + 2, y: action.position.coordinate.y } },
    },
  ])
  await game.control({ type: 'round', actions })
  const registered = page.getByRole('button', { name: /remove from register/ })
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  const otherRobot = page.locator(`[data-robot-id="${OTHER_ROBOT_ID}"]`).first()
  await expect(otherRobot).toHaveAttribute('data-board-tile', '7,5')
  await game.control({ type: 'deal' })
  for (const action of actions) {
    await expect(page.locator(`[data-robot-id="${action.robotId}"]`).first()).toHaveAttribute(
      'data-board-tile', `${action.position.coordinate.x},${action.position.coordinate.y}`,
    )
    await expect(registered).toHaveCount(5)
    await expect(hand.last()).toBeDisabled()
    await expect(page.getByRole('status')).toHaveText('Executing')
    await page.clock.runFor(action.instruction === 'TURN_LEFT' ? 300 : 600)
  }
  await expect(registered).toHaveCount(0)
  await expect(hand.first()).toBeEnabled()
  await expect(page.getByRole('status')).toHaveText('Programming')
})

test('waits for its next hand after playback and ignores foreign hands', async ({ page, game }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await openGame(page)
  await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button').first()).toBeEnabled()
  await pauseClock(page)
  await fillProgram(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()
  const nextRound = await game.control({ type: 'round', actions: ROUND_ACTIONS, deferHand: true })
  for (const action of ROUND_ACTIONS) {
    await expect(page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()).toHaveAttribute(
      'data-board-tile', `${action.position.coordinate.x},${action.position.coordinate.y}`,
    )
    await expect(page.locator('.register[data-active]')).toContainText(String(action.registerIndex + 1))
    await expect(page.getByRole('button', { name: /remove from register/ })).toHaveCount(5)
    await page.clock.runFor(action.instruction === 'TURN_LEFT' ? 300 : 600)
  }
  await expect(page.getByRole('status')).toHaveText('Executing')
  const hand = { gameId: GAME_ID, playerId: PLAYER_ID, cards: nextRound.cards }
  await game.control({ type: 'hand', hand: { ...hand, playerId: OTHER_PLAYER_ID } })
  await game.control({ type: 'hand', hand: { ...hand, gameId: 'another-game' } })
  await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button').last()).toBeDisabled()
  await expect(page.locator('.register[data-active]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /remove from register/ })).toHaveCount(5)
  await game.control({ type: 'deal' })
  await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button').first()).toBeEnabled()
  await expect(page.getByRole('button', { name: /remove from register/ })).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveText('Programming')
})

test('does not resend a program after its acknowledgement times out', async ({ page, game }) => {
  await game.control({ type: 'submission', outcome: 'ACCEPTED', deferred: true })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await openGame(page)
  await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button').first()).toBeEnabled()
  await pauseClock(page)
  await fillProgram(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect.poll(async () => (await game.snapshot()).submissions.length).toBe(1)
  await page.clock.runFor(5000)

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Awaiting server' })).toBeDisabled()
  const registered = page.getByRole('button', { name: /remove from register/ })
  await expect(registered).toHaveCount(5)
  await expect(registered.first()).toBeDisabled()
  expect((await game.snapshot()).submissions).toEqual([{
    gameId: GAME_ID,
    playerId: PLAYER_ID,
    cardIds: game.initial.cards.slice(0, 5).map((card) => card.id),
  }])

  // Socket.IO discards acknowledgements after timeout. A late acceptance cannot
  // make an uncertain program resendable; the next hand still waits for playback.
  await game.control({ type: 'acknowledge', outcome: 'ACCEPTED' })
  await expect(page.getByRole('button', { name: 'Awaiting server' })).toBeDisabled()
  await expect(registered).toHaveCount(5)
  const nextRound = await game.control({ type: 'round', actions: ROUND_ACTIONS })
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  const robot = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  await expect(registered).toHaveCount(5)
  for (const action of ROUND_ACTIONS) {
    await expect(robot).toHaveAttribute('data-board-tile',
      `${action.position.coordinate.x},${action.position.coordinate.y}`)
    await expect(hand.first()).toBeDisabled()
    await page.clock.runFor(action.instruction === 'TURN_LEFT' ? 300 : 600)
  }
  await expect(hand.first()).toBeEnabled()
  await expect(page.getByText('Programming', { exact: true })).toBeVisible()
  expect((await game.snapshot()).submissions).toHaveLength(1)

  await game.control({ type: 'submission', outcome: 'ACCEPTED', deferred: false })
  await fillProgram(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect.poll(async () => (await game.snapshot()).submissions).toEqual([
    { gameId: GAME_ID, playerId: PLAYER_ID, cardIds: game.initial.cards.slice(0, 5).map((card) => card.id) },
    { gameId: GAME_ID, playerId: PLAYER_ID, cardIds: nextRound.cards.slice(0, 5).map((card) => card.id) },
  ])
  expect((await game.snapshot()).stateRequests).toBe(0)
})

for (const submitting of [false, true]) {
  test(`preserves the game and reconnection guidance when disconnected ${submitting ? 'during submission' : 'while programming'}`, async ({ page, game }) => {
    await game.control({ type: 'submission', outcome: 'ACCEPTED', deferred: true })
    await openGame(page)
    await fillProgram(page)
    const registered = page.getByRole('button', { name: /remove from register/ })
    const selection = await registered.allTextContents()
    const entryRequests = (await game.snapshot()).entryRequests
    if (submitting) {
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Submitting…', exact: true })).toBeDisabled()
    }

    await game.control({ type: 'disconnect' })
    await expect(page.getByRole('status')).toHaveText('Not connected')
    await expect(page.getByRole('alert')).toContainText('Connection lost. Reconnecting… Your program was not resent.')
    await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Username' })).toHaveCount(0)
    await expect(registered).toHaveCount(5)
    expect(await registered.allTextContents()).toEqual(selection)
    for (const card of await registered.all()) await expect(card).toBeDisabled()
    const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
    await expect(hand).toHaveCount(9)
    for (const card of await hand.all()) await expect(card).toBeDisabled()
    await expect(page.getByRole('button', { name: submitting ? 'Submitting…' : 'Done', exact: true })).toBeDisabled()
    const snapshot = await game.snapshot()
    expect(snapshot.submissions).toHaveLength(submitting ? 1 : 0)
    expect(snapshot.entryRequests).toEqual(entryRequests)
  })
}

test('displays all basic cards and plays their results across two programs', async ({ page, game }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await openGame(page)
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  await expect(hand.first()).toBeEnabled()
  await pauseClock(page)

  const labels = ['Move 1', 'Move 2', 'Move 3', 'Back Up', 'Turn Left', 'Turn Right', 'U-Turn', 'Move 1', 'Turn Left']
  const icons = new Set<string>()
  for (const [index, label] of labels.entries()) {
    await expect(hand.nth(index)).toHaveAccessibleName(label)
    await expect(hand.nth(index)).toHaveText(label)
    if (index < 7) {
      const image = hand.nth(index).locator('img')
      icons.add(await image.getAttribute('src') ?? '')
      expect(await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
    }
  }

  expect(icons.size).toBe(7)

  const rounds = [
    {
      indices: [0, 1, 2, 3, 4],
      steps: [
        { instruction: 'MOVE_1', x: 5, y: 4, orientation: 'NORTH', angle: '0deg', duration: 600 },
        { instruction: 'MOVE_2', x: 5, y: 2, orientation: 'NORTH', angle: '0deg', duration: 600 },
        { instruction: 'MOVE_3', x: 5, y: 0, orientation: 'NORTH', angle: '0deg', duration: 600 },
        { instruction: 'BACK_UP', x: 5, y: 1, orientation: 'NORTH', angle: '0deg', duration: 600 },
        { instruction: 'TURN_LEFT', x: 5, y: 1, orientation: 'WEST', angle: '-90deg', duration: 300 },
      ],
    },
    {
      indices: [5, 6, 0, 4, 1],
      steps: [
        { instruction: 'TURN_RIGHT', x: 5, y: 1, orientation: 'NORTH', angle: '0deg', duration: 300 },
        { instruction: 'U_TURN', x: 5, y: 1, orientation: 'SOUTH', angle: '-180deg', duration: 300 },
        { instruction: 'MOVE_1', x: 5, y: 2, orientation: 'SOUTH', angle: '-180deg', duration: 600 },
        { instruction: 'TURN_LEFT', x: 5, y: 2, orientation: 'EAST', angle: '-270deg', duration: 300 },
        { instruction: 'MOVE_2', x: 7, y: 2, orientation: 'EAST', angle: '-270deg', duration: 600 },
      ],
    },
  ] as const
  const robot = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  for (const round of rounds) {
    const cards = (await game.snapshot()).cards
    await fillProgram(page, [...round.indices])
    for (const [register, index] of round.indices.entries()) {
      await expect(page.getByRole('button', { name: `${labels[index]}, remove from register ${register + 1}`, exact: true })).toBeVisible()
    }
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()
    const submitted = (await game.snapshot()).submissions.at(-1)
    expect(submitted?.cardIds).toEqual(round.indices.map(index => cards[index].id))
    await game.control({ type: 'round', actions: round.steps.map((step, registerIndex) => ({
      gameId: GAME_ID,
      registerIndex,
      robotId: ROBOT_ID,
      instruction: step.instruction,
      position: { coordinate: { x: step.x, y: step.y }, orientation: step.orientation },
    })) })
    for (const step of round.steps) {
      await expect(robot).toHaveAttribute('data-board-tile', `${step.x},${step.y}`)
      await expect.poll(() => robot.evaluate(element => (element as SVGElement).style.getPropertyValue('--board-piece-angle'))).toBe(step.angle)
      await expect(hand.first()).toBeDisabled()
      await page.clock.runFor(step.duration)
    }
    await expect(hand.first()).toBeEnabled()
  }
})
