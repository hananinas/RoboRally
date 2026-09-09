import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('toggles game options with a disabled placeholder', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Game options', exact: true })
  const options = page.getByRole('region', { name: 'Game options' })

  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(options).toBeHidden()
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(options).toBeVisible()
  await expect(options.getByRole('button')).toHaveCount(1)
  await expect(options.getByRole('button', {
    name: 'No options available yet',
  })).toBeDisabled()

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

test('keeps the trigger clear of the HUD and the popover inside a small viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  const trigger = page.getByRole('button', { name: 'Game options', exact: true })
  const options = page.getByRole('region', { name: 'Game options' })
  const hud = page.getByRole('complementary', { name: 'Game controls' })

  await expect(trigger).toBeInViewport()
  const triggerBox = await trigger.boundingBox()
  const hudBox = await hud.boundingBox()
  if (!triggerBox || !hudBox) throw new Error('Control positions are unavailable')
  expect(triggerBox.width).toBeGreaterThanOrEqual(44)
  expect(triggerBox.height).toBeGreaterThanOrEqual(44)
  expect(triggerBox.y + triggerBox.height).toBeLessThan(hudBox.y)

  await trigger.click()
  await expect(options).toBeInViewport({ ratio: 1 })
  await expect(options.getByRole('button')).toBeVisible()
})

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

test.describe('touch interaction', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } })

  test('opens by tapping and dismisses by tapping outside', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Game options', exact: true })
    const options = page.getByRole('region', { name: 'Game options' })

    await trigger.tap()
    await expect(options).toBeVisible()
    await expect(options.getByRole('button')).toBeDisabled()

    await page.getByRole('heading', { name: 'Health', exact: true }).tap()
    await expect(options).toBeHidden()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await trigger.tap()
    await expect(options).toBeVisible()
    await trigger.tap()
    await expect(options).toBeHidden()
  })
})
