import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/AI Companion/);
  });

  test('should display main heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'AI Companion' })).toBeVisible();
  });

  test('should display feature cards', async ({ page }) => {
    await expect(page.getByText('Persistent Memory')).toBeVisible();
    await expect(page.getByText('Customizable Avatar')).toBeVisible();
    await expect(page.getByText('Privacy First')).toBeVisible();
    await expect(page.getByText('Cross-Platform')).toBeVisible();
    await expect(page.getByText('Provider Agnostic')).toBeVisible();
    await expect(page.getByText('Type-Safe API')).toBeVisible();
  });

  test('should have correct meta tags', async ({ page }) => {
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute('content', /AI Companion/);
  });
});