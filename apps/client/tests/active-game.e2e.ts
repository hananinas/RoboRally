import { expect, test, type Page } from '@playwright/test'

// Opens the game at a stable viewport.
async function openGame(page: Page, width = 1280, height = 720) {
  await page.setViewportSize({ width, height })
  await page.goto('/') // Change this once app no longer opens up to an active game.
}

test('renders the programming interface', async ({ page }) => {
  await openGame(page)

  const controls = page.getByRole('complementary', { name: 'Game controls' })
  const hand = page.getByRole('region', { name: 'Programming hand' })

  await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
  await expect(controls.getByRole('heading', { name: 'Player Name' })).toBeVisible()
  await expect(
    controls.getByRole('heading', {
      name: /^(Checkpoints|Health|Energy|Upgrades)$/,
    }),
  ).toHaveCount(4)
  await expect(controls.getByRole('listitem')).toHaveCount(5)
  await expect(hand.getByRole('button')).toHaveCount(9)
  await expect(controls.getByRole('button', { name: 'Done' })).toBeDisabled()
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
