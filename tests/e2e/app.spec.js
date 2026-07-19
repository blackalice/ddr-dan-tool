import { expect, test } from '@playwright/test'

test('loads the DDR Toolkit app', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/DDR Toolkit/)
  await expect(page.locator('#root').getByRole('link', { name: 'BPM Tool' })).toBeVisible()
})

test('DDR World theme keeps application surfaces gradient-free', async ({ page }) => {
  await page.goto('/settings')

  const themeSelect = page.locator('select.settings-select:has(option[value="ddr-world"])')
  await themeSelect.selectOption('ddr-world')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ddr-world')

  const decorativeGradients = async () => page.locator('[data-theme="ddr-world"] *').evaluateAll((elements) => (
    elements
      .filter((element) => {
        const style = window.getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return box.width > 0
          && box.height > 0
          && style.visibility !== 'hidden'
          && style.display !== 'none'
          && style.backgroundImage.includes('gradient')
          && !element.closest('[class*="stepchart"]')
          && !element.closest('[class*="freezeBody"]')
      })
      .map((element) => element.className || element.tagName)
  ))

  expect(await decorativeGradients()).toEqual([])

  await page.goto('/bpm')
  await expect(page.locator('html[data-theme="ddr-world"]')).toBeVisible()
  expect(await decorativeGradients()).toEqual([])
})

test('New theme is selectable and uses a neutral dark palette', async ({ page }) => {
  await page.goto('/settings')

  const themeSelect = page.locator('select.settings-select:has(option[value="new"])')
  await themeSelect.selectOption('new')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'new')

  const palette = await page.locator('#root > [data-theme="new"]').evaluate((element) => {
    const style = window.getComputedStyle(element)
    return {
      accent: style.getPropertyValue('--accent-color').trim(),
      background: style.backgroundImage,
      backgroundColor: style.backgroundColor,
    }
  })

  expect(palette.accent).toBe('#60a5fa')
  expect(palette.background).toBe('none')
  expect(palette.backgroundColor).toBe('rgb(15, 23, 42)')
})

test('DDR A theme is selectable and applies its arcade palette', async ({ page }) => {
  await page.goto('/settings')

  const themeSelect = page.locator('select.settings-select:has(option[value="ddr-a"])')
  await themeSelect.selectOption('ddr-a')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ddr-a')

  const palette = await page.locator('#root > [data-theme="ddr-a"]').evaluate((element) => {
    const style = window.getComputedStyle(element)
    return {
      accent: style.getPropertyValue('--accent-color').trim(),
      background: style.backgroundImage,
      backgroundColor: style.backgroundColor,
    }
  })

  expect(palette.accent).toBe('#20d9ff')
  expect(palette.background).toBe('none')
  expect(palette.backgroundColor).toBe('rgb(169, 223, 247)')

  const decorativeGradients = await page.locator('[data-theme="ddr-a"] *').evaluateAll((elements) => (
    elements
      .filter((element) => {
        const style = window.getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return box.width > 0
          && box.height > 0
          && style.visibility !== 'hidden'
          && style.display !== 'none'
          && style.backgroundImage.includes('gradient')
          && !element.closest('[class*="stepchart"]')
          && !element.closest('[class*="freezeBody"]')
      })
      .map((element) => element.className || element.tagName)
  ))

  expect(decorativeGradients).toEqual([])

  await page.goto('/bpm')
  await expect(page.locator('html[data-theme="ddr-a"]')).toBeVisible()
})
