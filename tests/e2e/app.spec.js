import { expect, test } from '@playwright/test'

test('loads the DDR Toolkit app', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/DDR Toolkit/)
  await expect(page.getByRole('link', { name: 'BPM Tool' })).toBeVisible()
})
