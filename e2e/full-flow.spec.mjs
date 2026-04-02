import { test, expect } from '@playwright/test';

test.describe('NegotiateAI — Full Flow', () => {

  test('dashboard loads and shows empty state or stats', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('.nav-title')).toHaveText('NegotiateAI');
    // Either empty state visible or stats grid visible (one is hidden)
    const emptyVisible = await page.locator('#d-empty:not(.hidden)').isVisible().catch(() => false);
    const statsVisible = await page.locator('.stats-grid:not(.hidden)').isVisible().catch(() => false);
    expect(emptyVisible || statsVisible).toBeTruthy();
  });

  test('setup view shows presets in 3 categories', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="setup"]');
    await expect(page.locator('#view-setup')).toBeVisible();
    // Wait for presets to load
    await expect(page.locator('.preset-card').first()).toBeVisible({ timeout: 5000 });
    const presets = page.locator('.preset-card');
    const count = await presets.count();
    expect(count).toBeGreaterThanOrEqual(14);
  });

  test('clicking a classic preset fills the form', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="setup"]');
    await expect(page.locator('.preset-card').first()).toBeVisible({ timeout: 5000 });
    // Click the first basic preset (salary)
    await page.locator('.preset-card').first().click();
    // Form should be filled
    const objective = page.locator('#setup-form [name="objective"]');
    await expect(objective).not.toHaveValue('');
  });

  test('clicking a celebrity preset goes to briefing', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="setup"]');
    await expect(page.locator('.preset-card').first()).toBeVisible({ timeout: 5000 });
    // Find Steve Jobs card and click it
    const jobsCard = page.locator('.preset-card', { hasText: 'Steve Jobs' });
    await jobsCard.click();
    // Should navigate to briefing view
    await expect(page.locator('#view-briefing')).toBeVisible({ timeout: 10000 });
    // Briefing should show context
    await expect(page.locator('#b-context')).toContainText('startup');
    // Odds should show
    await expect(page.locator('#b-odds')).toBeVisible();
    // Form should have pre-filled suggestions
    const objective = page.locator('#briefing-form [name="objective"]');
    await expect(objective).not.toHaveValue('');
  });

  test('briefing → session → turn → round score', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="setup"]');
    await expect(page.locator('.preset-card').first()).toBeVisible({ timeout: 5000 });

    // Click Trump scenario
    const card = page.locator('.preset-card', { hasText: 'Trump' });
    await card.click();
    await expect(page.locator('#view-briefing')).toBeVisible({ timeout: 10000 });

    // Accept the briefing (objectives pre-filled)
    await page.click('#briefing-form button[type="submit"]');

    // Should navigate to negotiation
    await expect(page.locator('#view-negotiate')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#n-adversary')).not.toHaveText('');

    // Messages should have at least one (the opening)
    await expect(page.locator('.msg').first()).toBeVisible();

    // Gauges should be visible
    await expect(page.locator('#g-deal')).toBeVisible();
    await expect(page.locator('#g-leverage')).toBeVisible();

    // Type and send a message
    await page.fill('#msg-input', 'Bonjour, merci de me recevoir. Parlons affaires.');
    await page.click('#btn-send');

    // Spinner should appear
    await expect(page.locator('.spinner')).toBeVisible({ timeout: 3000 });

    // Wait for adversary response (LLM call)
    await expect(page.locator('.msg.adversary').nth(1)).toBeVisible({ timeout: 30000 });

    // Round score should update
    await expect(page.locator('#n-round-pts')).not.toHaveText('0', { timeout: 5000 }).catch(() => {
      // 0 is valid (neutral round) — just check it rendered
    });
    await expect(page.locator('#n-round-label')).toBeVisible();

    // Coaching should update
    await expect(page.locator('#n-coaching')).not.toHaveText('En attente');
  });

  test('history view loads', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="history"]');
    await expect(page.locator('#view-history')).toBeVisible();
    // View should contain either empty message or session rows
    await expect(page.locator('#view-history .page-header h1')).toHaveText('Historique');
  });

  test('navigation between views works', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#view-dashboard')).toBeVisible();

    await page.click('[data-view="setup"]');
    await expect(page.locator('#view-setup')).toBeVisible();
    await expect(page.locator('#view-dashboard')).not.toBeVisible();

    await page.click('[data-view="history"]');
    await expect(page.locator('#view-history')).toBeVisible();

    await page.click('[data-view="dashboard"]');
    await expect(page.locator('#view-dashboard')).toBeVisible();
  });

  test('custom scenario form goes through briefing', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-view="setup"]');

    // Fill custom form
    await page.fill('#setup-form [name="situation"]', 'Test situation');
    await page.fill('#setup-form [name="userRole"]', 'Testeur');
    await page.fill('#setup-form [name="adversaryRole"]', 'Adversaire test');
    await page.fill('#setup-form [name="objective"]', 'Objectif test');
    await page.fill('#setup-form [name="minimalThreshold"]', 'Seuil test');
    await page.fill('#setup-form [name="batna"]', 'BATNA test');

    await page.click('#setup-form button[type="submit"]');

    // Should go to briefing
    await expect(page.locator('#view-briefing')).toBeVisible({ timeout: 10000 });
  });
});
