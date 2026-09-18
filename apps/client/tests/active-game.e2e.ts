import type { Page } from '@playwright/test'
import { expect, test } from './game-fixture.ts'
import { GAME_ID, ROBOT_ID, ROUND_ACTIONS } from './game-fixture-data.ts'

// Opens the game at a stable viewport.
async function openGame(page: Page, width = 1280, height = 720) {
  await page.setViewportSize({ width, height })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Player 1', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button')).toHaveCount(9)
}

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

test('waits for the initial snapshot when the hand arrives first', async ({ page, game }) => {
  await game.control({ type: 'state-requests', deferred: true })
  await openGame(page)
  await expect.poll(async () => (await game.snapshot()).pendingStateRequests).toBe(1)
  const cards = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  await expect(cards.first()).toBeDisabled()
  await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)

  await game.control({ type: 'respond-state' })
  await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
  await expect(page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()).toHaveAttribute('data-board-tile', '5,5')
  await expect(cards.first()).toBeEnabled()
})

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

test('programs, removes, and confirms cards', async ({ page }) => {
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

  const submitted = { gameId: GAME_ID, cardIds: indices.map((index) => game.initial.cards[index].id) }
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
  const submitted = { gameId: GAME_ID, cardIds: game.initial.cards.slice(0, 5).map((card) => card.id) }
  await expect.poll(async () => (await game.snapshot()).submissions).toEqual([submitted])

  await game.control({ type: 'acknowledge', outcome: 'ACCEPTED' })
  const confirmed = page.getByRole('button', { name: 'Confirmed', exact: true })
  await expect(confirmed).toBeDisabled()
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
  await expect(registered).toHaveCount(0)
  await expect(hand).toHaveCount(9)

  const angles = ['0deg', '0deg', '-90deg', '-90deg', '-180deg']
  for (const [index, action] of ROUND_ACTIONS.entries()) {
    const tile = `${action.position.coordinate.x},${action.position.coordinate.y}`
    await expect(robot).toHaveAttribute('data-board-tile', tile)
    expect(await robot.evaluate((element, first) => element === first, original)).toBe(true)
    expect(await robot.evaluate((element) => (element as SVGElement).style.getPropertyValue('--board-piece-angle'))).toBe(angles[index])
    await expect(hand.first()).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeDisabled()
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
    { gameId: GAME_ID, cardIds: game.initial.cards.slice(0, 5).map((card) => card.id) },
    { gameId: GAME_ID, cardIds: nextRound.cards.slice(0, 5).map((card) => card.id) },
  ])
  expect((await game.snapshot()).stateRequests).toBe(1)
})

test('keeps the initial hand locked when the initial state request times out', async ({ page, game }) => {
  await game.control({ type: 'state-requests', deferred: true })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await pauseClock(page)
  await openGame(page)
  await expect.poll(async () => (await game.snapshot()).pendingStateRequests).toBe(1)
  await page.clock.runFor(5000)

  await expect(page.getByRole('alert')).toContainText('Could not load game state')
  await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button').first()).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeDisabled()
  await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)
  expect((await game.snapshot()).submissions).toHaveLength(0)
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
    cardIds: game.initial.cards.slice(0, 5).map((card) => card.id),
  }])

  // Socket.IO discards acknowledgements that arrive after their timeout. The
  // real server does not echo program.submitted to the submitting socket.
  await game.control({ type: 'acknowledge', outcome: 'ACCEPTED' })
  const nextRound = await game.control({ type: 'round', actions: ROUND_ACTIONS })
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  const robot = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  await expect(registered).toHaveCount(0)
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
    { gameId: GAME_ID, cardIds: game.initial.cards.slice(0, 5).map((card) => card.id) },
    { gameId: GAME_ID, cardIds: nextRound.cards.slice(0, 5).map((card) => card.id) },
  ])
  expect((await game.snapshot()).stateRequests).toBe(1)
})

test('retains reload guidance and the selected program when disconnected during submission', async ({ page, game }) => {
  await game.control({ type: 'submission', outcome: 'ACCEPTED', deferred: true })
  await openGame(page)
  await fillProgram(page)
  const registered = page.getByRole('button', { name: /remove from register/ })
  const selection = await registered.allTextContents()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Submitting…', exact: true })).toBeDisabled()

  await game.control({ type: 'disconnect' })
  await expect(page.getByRole('status')).toHaveText('Not connected')
  await expect(registered).toHaveCount(5)
  expect(await registered.allTextContents()).toEqual(selection)
  await expect(registered.first()).toBeDisabled()
  expect((await game.snapshot()).submissions).toHaveLength(1)
  await expect(page.getByRole('alert')).toContainText('Reload')
})
