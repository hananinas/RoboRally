import { expect, openGame, test } from './game-fixture.ts'

test.beforeEach(async ({ page }) => {
  await openGame(page)
})

test('toggles game options with a leave action', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Game options', exact: true })
  const options = page.getByRole('region', { name: 'Game options' })

  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(options).toBeHidden()
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(options).toBeVisible()
  await expect(options.getByRole('button', {
    name: 'Leave game',
  })).toBeEnabled()

  await trigger.click()
  await expect(options).toBeHidden()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

test('supports Enter, Space, and Escape without losing trigger focus', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Game options', exact: true })
  const options = page.getByRole('region', { name: 'Game options' })

  await page.keyboard.press('Tab')
  await expect(trigger).toBeFocused()
  for (const key of ['Enter', 'Space']) {
    await page.keyboard.press(key)
    await expect(options).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(options).toBeHidden()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger).toBeFocused()
  }
})

test('dismisses on an outside click without blocking game controls', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Game options', exact: true })
  const options = page.getByRole('region', { name: 'Game options' })

  await trigger.click()
  await page.getByRole('button', { name: 'Collapse player details' }).click()
  await expect(options).toBeHidden()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: 'Expand player details' })).toBeVisible()
  await trigger.click()
  await expect(options).toBeVisible()
})

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 320, height: 568 },
  { width: 568, height: 320 },
]) {
  test(`anchors game options to the player header at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const trigger = page.getByRole('button', { name: 'Game options', exact: true })
    const options = page.getByRole('region', { name: 'Game options' })
    const panel = page.locator('.player-panel')
    const heading = panel.getByRole('heading', { level: 1 })

    await expect(panel.getByRole('button', { name: 'Game options', exact: true })).toBeVisible()
    const triggerBox = await trigger.boundingBox()
    const panelBox = await panel.boundingBox()
    const headingBox = await heading.boundingBox()
    if (!triggerBox || !panelBox || !headingBox) throw new Error('Control positions are unavailable')
    expect(triggerBox.width).toBeGreaterThanOrEqual(44)
    expect(triggerBox.height).toBeGreaterThanOrEqual(44)
    expect(triggerBox.x).toBeGreaterThanOrEqual(headingBox.x + headingBox.width)
    expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width)
    expect(triggerBox.y).toBeGreaterThanOrEqual(panelBox.y)
    expect(Math.abs(triggerBox.y + triggerBox.height / 2 - headingBox.y - headingBox.height / 2)).toBeLessThan(1)

    await trigger.click()
    await expect(options).toBeInViewport({ ratio: 1 })
    const optionsBox = await options.boundingBox()
    if (!optionsBox) throw new Error('Popover position is unavailable')
    expect(Math.abs(optionsBox.x + optionsBox.width - triggerBox.x - triggerBox.width)).toBeLessThan(1)
    expect(optionsBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height)
  })
}

test('keeps an open popover on screen after resizing', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Game options', exact: true })
  const options = page.getByRole('region', { name: 'Game options' })

  await trigger.click()
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 568, height: 320 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport)
    await expect(trigger).toBeInViewport({ ratio: 1 })
    await expect(options).toBeInViewport({ ratio: 1 })
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  }
})

test('includes the leave action without trapping keyboard focus', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Game options', exact: true })
  const options = page.getByRole('region', { name: 'Game options' })
  const collapse = page.getByRole('button', { name: 'Collapse player details' })

  await page.keyboard.press('Tab')
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(options).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(options.getByRole('button', { name: 'Leave game' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(collapse).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(options.getByRole('button', { name: 'Leave game' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(options).toBeHidden()
})

test('preserves the program and allows card selection when dismissing the menu', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Game options', exact: true })
  const options = page.getByRole('region', { name: 'Game options' })
  const handCards = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  const controls = page.getByRole('complementary', { name: 'Game controls' })
  const registerCards = controls.getByRole('button', { name: /remove from register/ })

  await handCards.nth(0).click()
  await expect(registerCards).toHaveCount(1)
  await trigger.click()
  await expect(options).toBeVisible()
  await expect(registerCards).toHaveCount(1)
  await expect(handCards.nth(0)).toBeDisabled()

  await handCards.nth(1).click()
  await expect(options).toBeHidden()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(registerCards).toHaveCount(2)
  await expect(controls.getByRole('button', { name: 'Move 1, remove from register 1', exact: true })).toBeVisible()
  await expect(controls.getByRole('button', { name: 'Turn Left, remove from register 2', exact: true })).toBeVisible()
  await expect(controls.getByRole('button', { name: 'Done', exact: true })).toBeDisabled()

  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(options).toBeHidden()
  await expect(registerCards).toHaveCount(2)
})

test.describe('touch interaction', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } })

  test('opens by tapping and dismisses by tapping outside', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Game options', exact: true })
    const options = page.getByRole('region', { name: 'Game options' })

    await trigger.tap()
    await expect(options).toBeVisible()
    await expect(options.getByRole('button')).toBeEnabled()

    await page.getByRole('heading', { name: 'Health', exact: true }).tap()
    await expect(options).toBeHidden()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await trigger.tap()
    await expect(options).toBeVisible()
    await trigger.tap()
    await expect(options).toBeHidden()
  })
})
