import { test, expect } from '@playwright/test';

/**
 * End-to-end smoke test: register a fresh user, create a project, and confirm
 * the project detail page renders. Requires the full Nanas stack to be up
 * (`docker compose up -d`) and an empty platform DB so the registered user can
 * be promoted to super_admin without colliding with seeded data.
 *
 * Run via `pnpm e2e`. The base URL defaults to http://localhost:8080 (set
 * `NANAS_BASE_URL` to override).
 */
test.describe('Nanas SPA smoke', () => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'correct-horse-battery';

  test('register and create a project', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /create an account|buat akun/i })).toBeVisible();

    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password|kata sandi/i).fill(password);
    await page.getByRole('button', { name: /register|daftar/i }).click();

    await page.waitForURL(/\/app(\/|$)/, { timeout: 30_000 });

    await page.getByRole('button', { name: /new project|proyek baru/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/name|nama/i).first().fill('e2e smoke project');
    await dialog.getByRole('button', { name: /create project|buat proyek/i }).click();

    await page.waitForURL(/\/app\/projects\/[0-9a-f-]+/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /e2e smoke project/i })).toBeVisible();

    await page.getByRole('link', { name: /^functions$|^fungsi$/i }).click();
    await expect(page.getByRole('heading', { name: /functions|fungsi/i })).toBeVisible();
  });
});
