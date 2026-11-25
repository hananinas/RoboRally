import type { Dialog, Page } from '@playwright/test'
import { expect, openGame, pauseClock, test } from './game-fixture.ts'
import { GAME_ID, OTHER_PLAYER_ID, OTHER_ROBOT_ID, PLAYER_ID, ROBOT_ID, ROUND_ACTIONS } from './game-fixture-data.ts'
import { gameStatus } from './browserClient.ts'

// Program indices refer to deal order, including cards already moved to registers.
function dealtCards(page: Page) {
  return page.getByRole('region', { name: 'Programming hand' }).locator('button')
}

async function fillProgram(page: Page, indices = [0, 1, 2, 3, 4]) {
  const cards = dealtCards(page)
  for (const index of indices) await cards.nth(index).click()
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
  await expect(controls.getByRole('heading', { name: 'Checkpoints', exact: true }).locator('..')).toContainText('0/0')
})

for (const antenna of [
  { x: 5, y: 0, angle: Math.PI / 2 },
  { x: 3, y: 2, angle: 0 },
  { x: 8, y: 6, angle: Math.PI * 1.25 },
]) {
  test(`renders the configured antenna at ${antenna.x},${antenna.y} facing ${antenna.angle}`, async ({ page, game }) => {
    await game.control({ type: 'joined-state', state: { ...game.initial.state, antenna }, hand: game.initial.cards, programSubmitted: false })
    await openGame(page)
    await expect(page.getByRole('img', { name: 'Priority antenna' })).toBeVisible()
    const slices = page.locator('[data-board-component^="antenna"]')
    await expect(slices).toHaveCount(10)
    const bounds = await slices.first().locator('use').evaluate((element) => {
      const box = (element as SVGUseElement).getBBox()
      return { x: box.x, y: box.y, width: box.width }
    })
    expect(bounds.x).toBeCloseTo(6, 3)
    expect(bounds.y).toBeCloseTo(6, 3)
    expect(bounds.width).toBeCloseTo(72, 3)
    expect(await slices.evaluateAll((elements) => elements.map((element) => ({
      tile: element.getAttribute('data-board-tile'),
      angle: (element as SVGSVGElement).style.getPropertyValue('--board-piece-angle'),
      symbolExists: !!document.querySelector(element.querySelector('use')!.getAttribute('href')!),
    })))).toEqual(Array(10).fill({
      tile: `${antenna.x},${antenna.y}`, angle: `${antenna.angle * 180 / Math.PI - 90}deg`, symbolExists: true,
    }))
  })
}

test('renders the reboot sprite on every reboot tile', async ({ page, game }) => {
  await openGame(page)
  const rebootTiles = game.initial.state.board.tiles.filter((tile) => tile.type === 'REBOOT')
    .map(({ position }) => `${position.x},${position.y}`)
  const tiles = page.getByRole('img', { name: 'Reboot tile' })
  await expect(tiles).toHaveCount(rebootTiles.length)
  expect(await tiles.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-board-tile'))))
    .toEqual(expect.arrayContaining(rebootTiles))
  expect(await page.locator('[data-board-component^="reboot"] use').evaluateAll((elements) =>
    elements.every((element) => !!document.querySelector(element.getAttribute('href')!)))).toBe(true)
})

test('shows checkpoint counts from snapshots and broadcasts once queued playback lands', async ({ page, game }) => {
  await page.clock.install()
  const state = {
    ...game.initial.state, checkpointCount: 2,
    board: {
      ...game.initial.state.board,
      tiles: game.initial.state.board.tiles.map((tile, index) =>
        index < 2 ? { ...tile, checkpointNumber: index + 1 } : tile),
    },
    players: [...game.initial.state.players, {
      playerId: OTHER_PLAYER_ID, username: 'Other player', connected: true, programSubmitted: false, lastCheckpoint: 0,
      registers: game.initial.state.players[0].registers,
    }],
  }
  await game.control({ type: 'joined-state', state, hand: game.initial.cards, programSubmitted: false })
  await openGame(page)
  const checkpoints = page.getByRole('heading', { name: 'Checkpoints', exact: true }).locator('..')
  const progress = checkpoints.locator('.checkpoint-progress')
  const flags = progress.locator('.checkpoint-progress__flag')
  await expect(progress).toHaveAccessibleName('0 of 2 checkpoints collected')
  await expect(flags).toHaveCount(2)
  await expect(progress.locator(':scope > :last-child')).toHaveText('0/2')
  await fillProgram(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()
  await pauseClock(page)
  await game.control({ type: 'inject-environment', result: {
    gameId: GAME_ID, kind: 'CHECKPOINTS',
    checkpointProgress: [{ playerId: OTHER_PLAYER_ID, lastCheckpoint: 1 }],
  } })
  await game.control({ type: 'round', actions: ROUND_ACTIONS, deferHand: true })
  await expect(page.getByRole('status')).toHaveText('Executing')
  await expect(checkpoints).toContainText('0/2')
  await game.control({ type: 'inject-environment', result: {
    gameId: GAME_ID, kind: 'CHECKPOINTS',
    checkpointProgress: [{ playerId: PLAYER_ID, lastCheckpoint: 1 }],
  } })
  await expect(checkpoints).toContainText('0/2')
  await expect(page.getByRole('button', { name: /remove from register/ })).toHaveCount(5)
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()
  await expect(page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()).toHaveAttribute('data-board-tile', '5,4')
  for (const action of ROUND_ACTIONS) {
    await expect(checkpoints).toContainText('0/2')
    await page.clock.runFor(action.instruction === 'TURN_LEFT' ? 300 : 600)
  }
  await expect(progress).toHaveAccessibleName('1 of 2 checkpoints collected')
  await expect(progress.locator(':scope > :last-child')).toHaveText('1/2')
  await expect(flags.first()).toHaveAttribute('data-collected', 'true')
  await expect(flags.last()).not.toHaveAttribute('data-collected')

  await game.control({ type: 'joined-state', state: {
    ...state, players: state.players.map((player) => ({ ...player, lastCheckpoint: 1 })),
  }, hand: game.initial.cards, programSubmitted: false })
  await openGame(page)
  await expect(checkpoints).toContainText('1/2')
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

test('deals cards in sequence and slides the unused hand off screen after confirmation', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '.game { --hud-card-motion-duration: 600ms; }'
      document.head.append(style)
    })
  })
  await openGame(page)

  const hand = page.getByRole('region', { name: 'Programming hand' })
  const lastSlot = hand.getByRole('button').last().locator('..')
  await expect(lastSlot).toHaveCSS('transition-delay', '0s, 0s, 0.2s')
  expect(await lastSlot.evaluate((slot) => slot.getAnimations().some((animation) =>
    animation instanceof CSSTransition && animation.transitionProperty === 'translate',
  ))).toBe(true)
  await expect(lastSlot).toHaveCSS('translate', 'none')

  await fillProgram(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(hand).toHaveAttribute('data-retired', 'true')
  await expect.poll(() => hand.evaluate((element) =>
    element.getBoundingClientRect().top >= window.innerHeight,
  )).toBe(true)
})

test('lifts a hovered card and closes and reopens the fan around a register change', async ({ page }) => {
  await openGame(page)

  const hand = page.getByRole('region', { name: 'Programming hand' })
  const available = hand.getByRole('button')
  const middle = available.nth(4)
  const lastSlot = available.last().locator('..')
  const fanRight = () => lastSlot.evaluate((slot) => slot.getBoundingClientRect().right)
  const fullFanRight = await fanRight()

  await middle.hover()
  await expect(middle).toHaveCSS('translate', '0px -8px')
  await expect(middle.locator('..')).toHaveCSS('z-index', '4')
  await expect(available.nth(5).locator('..')).toHaveCSS('z-index', '5')
  await page.mouse.move(0, 0)
  await expect(middle).toHaveCSS('translate', 'none')

  await middle.click()
  await expect(available).toHaveCount(8)
  await expect.poll(fanRight).toBeLessThan(fullFanRight - 2)

  await page.getByRole('button', { name: 'Turn Left, remove from register 1' }).click()
  await expect(available).toHaveCount(9)
  await expect(available.nth(4)).toHaveAccessibleName('Turn Left')
  await expect.poll(fanRight).toBeCloseTo(fullFanRight, 1)
})

test('closes the fan during a drag, reopens it on return, and commits the new order', async ({ page }) => {
  await openGame(page)

  const hand = page.getByRole('region', { name: 'Programming hand' })
  const cards = hand.getByRole('button')
  const first = cards.first()
  const last = cards.last()
  await expect(last.locator('..')).toHaveCSS('translate', 'none')
  const firstBox = await first.boundingBox()
  const lastBox = await last.boundingBox()
  if (!firstBox || !lastBox) throw new Error('Card positions are unavailable')

  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(page.viewportSize()!.width / 2, 200, { steps: 5 })
  await expect(first.locator('..')).toHaveAttribute('data-outside-fan', 'true')
  await expect(last.locator('..')).toHaveCSS('z-index', '7')

  await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height / 2, { steps: 5 })
  await expect(first.locator('..')).not.toHaveAttribute('data-outside-fan')
  await expect(first.locator('..')).toHaveCSS('z-index', '8')
  await page.mouse.up()

  await expect(cards.first()).toHaveAccessibleName('Move 2')
  await expect(cards.last()).toHaveAccessibleName('Move 1')
  await expect(page.getByRole('button', { name: /remove from register/ })).toHaveCount(0)
})

test('animates clicked cards between the hand and a register', async ({ page }) => {
  await openGame(page)

  // Keep both transfers on screen long enough to inspect them and change hover.
  await page.addStyleTag({
    content: '.game { --hud-card-motion-duration: 1000ms; } .programming-hand__slot > .program-card { transition-duration: 120ms; }',
  })

  const hand = page.getByRole('region', { name: 'Programming hand' })
  const flight = page.locator('.card-transfer')
  const easing = () => flight.evaluate((card) =>
    card.getAnimations()[0]?.effect?.getTiming().easing,
  )

  await hand.getByRole('button', { name: 'Move 2', exact: true }).click()
  await expect(flight).toHaveClass(/program-card--register/)
  expect(await easing()).toBe('cubic-bezier(0.24, 0.65, 0.4, 1)')
  await expect(flight).toHaveCount(0)

  await page.getByRole('button', { name: 'Move 2, remove from register 1' }).click()
  await expect(flight).toHaveClass(/program-card--hand/)
  expect(await easing()).toBe('cubic-bezier(0.24, 0.65, 0.4, 1)')

  const returningCard = hand.getByRole('button', { name: 'Move 2', exact: true })
  const landingY = () => flight.evaluate((card) => {
    const effect = card.getAnimations()[0]?.effect as KeyframeEffect
    return Number.parseFloat(String(effect.getKeyframes().at(-1)?.top))
  })
  const restingY = await landingY()

  await returningCard.hover()
  await expect.poll(landingY).toBeLessThan(restingY - 6)
  await page.mouse.move(0, 0)
  await expect.poll(landingY).toBeGreaterThan(restingY - 2)
  await expect(flight).toHaveCount(0)
  await expect(returningCard).toBeVisible()
})

test('programs, removes, and confirms cards without resetting on a duplicate hand', async ({ page, game }) => {
  await openGame(page)

  const controls = page.getByRole('complementary', { name: 'Game controls' })
  const handCards = dealtCards(page)
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
  const lockedSlots = controls.locator('[data-registers-locked] .register__card:not([data-empty])')
  await expect(lockedSlots).toHaveCount(0)
  await done.click()

  await expect(controls.getByRole('button', { name: 'Confirmed' })).toBeDisabled()
  await expect(lockedSlots).toHaveCount(5)
  await expect(lockedSlots.first()).toHaveCSS('border-color', 'rgb(243, 201, 77)')
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
  await expect(handCards.last().locator('..')).toHaveCSS('translate', 'none')
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
  const shape = (element: Element) => {
    const { borderRadius, height, width } = getComputedStyle(element)
    return { borderRadius, height, width }
  }
  const registerShape = await target.evaluate(shape)
  const handShape = await source.evaluate(shape)

  await expect.poll(() => preview.evaluate(shape)).toEqual(registerShape)
  await page.mouse.move(300, 200)
  await expect.poll(() => preview.evaluate(shape)).toEqual(handShape)
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2)
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
test('swaps two register cards by dragging one onto the other', async ({ page, game }) => {
  await openGame(page)
  await fillProgram(page)

  const firstSlotCard = page.getByRole('button', { name: 'Move 1, remove from register 1' })
  await expect(firstSlotCard).toBeVisible()
  await expect(page.getByRole('button', { name: 'Turn Left, remove from register 5' })).toBeVisible()

  const source = await firstSlotCard.boundingBox()
  const target = await page.locator('[data-register-index="4"]').boundingBox()
  if (!source || !target) throw new Error('Register positions are unavailable')

  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 5 })
  await page.mouse.up()

  await expect(page.getByRole('button', { name: 'Turn Left, remove from register 1' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Move 1, remove from register 5' })).toBeVisible()
  await expect(page.getByRole('button', { name: /remove from register/ })).toHaveCount(5)
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeEnabled()
  await expect.poll(async () => (await game.snapshot()).registerUpdates.at(-1)).toEqual({
    cardIds: [4, 1, 2, 3, 0].map((index) => game.initial.cards[index].id),
  })
})

test('drags a card out of a register to remove it', async ({ page }) => {
  await openGame(page)
  await fillProgram(page, [0, 1])

  const handCards = dealtCards(page)
  const registeredCards = page.getByRole('button', {
    name: /remove from register/,
  })
  await expect(registeredCards).toHaveCount(2)
  await expect(handCards.first()).toBeDisabled()

  async function dragRegisterCard(registerNumber: number, x: number, y: number) {
    const card = page.getByRole('button', {
      name: new RegExp(`remove from register ${registerNumber}$`),
    })
    const box = await card.boundingBox()
    if (!box) throw new Error('Card position is unavailable')

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(x, y, { steps: 5 })
  }

  // Dropping back on its own register keeps the card.
  const ownSlot = await page.locator('[data-register-index="0"]').boundingBox()
  if (!ownSlot) throw new Error('Register position is unavailable')
  await dragRegisterCard(1, ownSlot.x + 4, ownSlot.y + 4)
  await expect(page.locator('.dragged-card')).toHaveCount(1)
  await page.mouse.move(ownSlot.x + ownSlot.width / 2, ownSlot.y + ownSlot.height / 2)
  await page.mouse.up()
  await expect(registeredCards).toHaveCount(2)

  // Dropping outside every register removes it and frees the hand card.
  await dragRegisterCard(1, 300, 200)
  await expect(page.locator('.dragged-card')).toHaveCount(1)
  await expect(page.locator('[data-register-index="0"]')).toHaveCSS('border-top-style', 'dashed')
  await page.mouse.up()

  await expect(registeredCards).toHaveCount(1)
  await expect(page.getByRole('button', { name: /remove from register 2$/ })).toBeVisible()
  await expect(page.locator('.dragged-card')).toHaveCount(0)
  await expect(handCards.first()).toBeEnabled()
})

test('opens a moving gap for a register card and returns it to that gap', async ({ page }) => {
  await openGame(page)
  await fillProgram(page, [2])

  const hand = page.getByRole('region', { name: 'Programming hand' })
  const cards = hand.getByRole('button')
  const source = page.getByRole('button', { name: 'Move 3, remove from register 1' })
  await expect(cards.last().locator('..')).toHaveCSS('translate', 'none')
  const first = await cards.first().boundingBox()
  const last = await cards.last().boundingBox()
  const register = await source.boundingBox()
  if (!first || !last || !register) throw new Error('Card positions are unavailable')

  const gap = dealtCards(page).nth(2).locator('..')
  await page.mouse.move(register.x + register.width / 2, register.y + register.height / 2)
  await page.mouse.down()
  await page.mouse.move(first.x + 20, first.y + first.height / 2)
  await expect(gap).toHaveCSS('z-index', '0')
  await page.mouse.move(last.x + last.width - 20, last.y + last.height / 2)
  await expect(gap).toHaveCSS('z-index', '8')
  await page.mouse.up()

  await expect(cards.last()).toHaveAccessibleName('Move 3')
  await expect(source).toHaveCount(0)
})

test('navigates the hand with h/l, wrapping around and skipping registered cards', async ({ page }) => {
  await openGame(page)
  const handCards = dealtCards(page)

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

test('d then a digit removes one register, and dd clears all of them', async ({ page, game }) => {
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
  await page.keyboard.press('Control+r')
  await expect(registerCards).toHaveCount(0)
  const ids = game.initial.cards.slice(0, 5).map((card) => card.id)
  await expect.poll(async () => (await game.snapshot()).registerUpdates.map((update) => update.cardIds)).toEqual([
    ...ids.map((_, index) => ids.map((id, slot) => slot <= index ? id : null)),
    [null, ...ids.slice(1)],
    [null, null, null, null, null],
    [null, ...ids.slice(1)],
    [null, null, null, null, null],
  ])
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
  
  // Wait for each register to start before advancing its playback timer. The
  // HTTP control response can arrive before the browser receives socket events.
  await game.control({ type: 'round', actions: ROUND_ACTIONS })
  for (const action of ROUND_ACTIONS) {
    await expect(page.locator('.register[data-active]')).toContainText(String(action.registerIndex + 1))
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

test('fits the fan below the edge-aligned HUD and keeps short HUDs scrollable', async ({ page }) => {
  const hand = page.getByRole('region', { name: 'Programming hand' })
  const hud = page.getByRole('complementary', { name: 'Game controls' })

  for (const [width, height] of [[1000, 600], [700, 400], [480, 800]]) {
    await openGame(page, width, height)
    const handBox = await hand.boundingBox()
    const panelBox = await hud.locator('.player-panel').boundingBox()
    const hudBox = await hud.boundingBox()
    if (!handBox || !panelBox || !hudBox) throw new Error('Layout positions are unavailable')

    expect(handBox.x + handBox.width / 2).toBeCloseTo(width / 2, 0)
    expect(panelBox.x + panelBox.width).toBeCloseTo(width, 0)
    expect(hudBox.y + hudBox.height).toBeLessThanOrEqual(handBox.y)
  }

  expect(await hand.evaluate((element) => element.scrollWidth)).toBe(480)
  await openGame(page, 700, 400)
  expect(await hud.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
})

test.describe('compact touch hand', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } })

  test('selects a card from its exposed edge', async ({ page }) => {
    await openGame(page)

    const cards = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
    await cards.nth(4).tap({ position: { x: 12, y: 20 } })
    await expect(cards).toHaveCount(8)
    await expect(page.getByRole('button', { name: 'Turn Left, remove from register 1' })).toBeVisible()
  })
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
  const hand = dealtCards(page)
  await expect(hand.nth(4)).toBeDisabled()
  await expect(hand.nth(0)).toBeEnabled()

  const submitted = { cardIds: indices.map((index) => game.initial.cards[index].id) }
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
  const submitted = { cardIds: game.initial.cards.slice(0, 5).map((card) => card.id) }
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
  // Establish the initial computed position before the burst changes the target.
  await robot.evaluate((element) => getComputedStyle(element).top)
  const nextRound = await game.control({ type: 'round', actions: ROUND_ACTIONS })
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  const registered = page.getByRole('button', { name: /remove from register/ })
  await expect(registered).toHaveCount(5)
  await expect(hand).toHaveCount(4)

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
      // CSS transitions use the document timeline, not the mocked JS timer clock.
      const top = await robot.evaluate((element) => {
        const movement = element.getAnimations().find((animation) =>
          animation instanceof CSSTransition && animation.transitionProperty === 'top')
        if (!movement) throw new Error('Robot movement transition is unavailable')
        movement.pause()
        movement.currentTime = 300
        const position = Number.parseFloat(getComputedStyle(element).top)
        movement.finish()
        return position
      })
      expect(top).toBeLessThan(0)
      expect(top).toBeGreaterThan(-78)
      await page.clock.runFor(600)
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
    { cardIds: game.initial.cards.slice(0, 5).map((card) => card.id) },
    { cardIds: nextRound.cards.slice(0, 5).map((card) => card.id) },
  ])
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
    cardIds: game.initial.cards.slice(0, 5).map((card) => card.id),
  }])

  // Socket.IO discards the late acknowledgement, but the private finalization
  // confirms the program. Editing stays locked until the next hand and playback.
  await game.control({ type: 'acknowledge', outcome: 'ACCEPTED' })
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
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
    { cardIds: game.initial.cards.slice(0, 5).map((card) => card.id) },
    { cardIds: nextRound.cards.slice(0, 5).map((card) => card.id) },
  ])
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
    await expect(gameStatus(page)).toHaveText('Not connected')
    const overlay = page.locator('.disconnect-overlay')
    await expect(overlay).toBeVisible()
    await expect(overlay.getByRole('heading', {name: 'Connection to server lost', exact: true,})).toBeVisible()
    await expect(overlay.getByRole('status')).toBeVisible()
    await expect(overlay.getByRole('button', {name: 'Leave game', exact: true,})).toBeDisabled()
    await expect(page.getByRole('alert')).toContainText('Connection lost. Reconnecting… Your program was not resent.')
    await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
    await expect(registered).toHaveCount(5)
    expect(await registered.allTextContents()).toEqual(selection)
    for (const card of await registered.all()) await expect(card).toBeDisabled()
    const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
    await expect(hand).toHaveCount(4)
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
      playerId: PLAYER_ID,
      instruction: step.instruction,
      resolvedInstruction: step.instruction,
      position: { coordinate: { x: step.x, y: step.y }, orientation: step.orientation },
      pushedRobots: [], reboots: [],
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
