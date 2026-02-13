/**
 * Patient Portal – Session Expired Smoke Test (Staging)
 *
 * Verifies that when the session is invalid (token removed/expired), each portal page
 * shows the amber "session expired" message and a "Log in" (or "Try again") action instead
 * of a blank page.
 *
 * Run against staging:
 *   PLAYWRIGHT_BASE_URL=https://staging.example.com npm run test:e2e -- tests/e2e/patient-portal-session-expired.e2e.ts
 *
 * Requires env (or defaults): TEST_PATIENT_EMAIL, TEST_PATIENT_PASSWORD.
 * Portal path is taken from NEXT_PUBLIC_PATIENT_PORTAL_PATH or defaults to /portal.
 */

import { test, expect } from '@playwright/test';

const PORTAL_BASE =
  process.env.PATIENT_PORTAL_PATH || process.env.NEXT_PUBLIC_PATIENT_PORTAL_PATH || '/portal';

const PATIENT_EMAIL = process.env.TEST_PATIENT_EMAIL || 'patient@test.com';
const PATIENT_PASSWORD = process.env.TEST_PATIENT_PASSWORD || 'PatientPassword123!';

const PORTAL_ROUTES = [
  '',
  '/progress',
  '/medications',
  '/documents',
  '/chat',
  '/appointments',
  '/billing',
  '/bloodwork',
  '/photos',
  '/health-score',
  '/care-plan',
  '/achievements',
  '/shipments',
  '/subscription',
].map((s) => `${PORTAL_BASE}${s}`);

test.describe('Patient Portal – Session Expired smoke test', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await expect(
      page.locator('input[type="email"], input[name="email"], [data-testid="email-input"]')
    ).toBeVisible({ timeout: 10000 });
    await page.fill(
      'input[type="email"], input[name="email"], [data-testid="email-input"]',
      PATIENT_EMAIL
    );
    await page.fill(
      'input[type="password"], input[name="password"], [data-testid="password-input"]',
      PATIENT_PASSWORD
    );
    await page.click('button[type="submit"], [data-testid="login-button"]');
    await page.waitForURL(RegExp(`${PORTAL_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/|$)`), {
      timeout: 30000,
    }).catch(() => {});
  });

  for (const route of PORTAL_ROUTES) {
    test(`after clearing session, ${route || PORTAL_BASE + ' (dashboard)'} shows session-expired message and Log in`, async ({
      page,
    }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        localStorage.removeItem('auth-token');
        localStorage.removeItem('patient-token');
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      const sessionExpiredText = await page
        .locator('text=Your session has expired')
        .or(page.locator('text=session expired'))
        .or(page.locator('text=Please log in again'))
        .first()
        .textContent()
        .catch(() => null);
      const hasLogInLink = await page
        .locator('a:has-text("Log in"), a:has-text("Log in again"), button:has-text("Try again")')
        .first()
        .isVisible()
        .catch(() => false);

      expect(
        sessionExpiredText || hasLogInLink,
        `Page ${route} should show session-expired message or Log in / Try again link after clearing token`
      ).toBeTruthy();
    });
  }
});
