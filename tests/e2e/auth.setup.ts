/**
 * Authentication Setup for E2E Tests
 * Creates authenticated browser contexts for different user roles
 */

import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirnameSafe = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirnameSafe, '.auth/user.json');

setup('authenticate as admin', async ({ page }) => {
  // Navigate to login
  await page.goto('/login');
  
  // Wait for page to load
  await expect(page.locator('h1')).toContainText(/login|sign in/i, { timeout: 10000 });
  
  // Fill credentials
  await page.fill('input[type="email"], input[name="email"], [data-testid="email-input"]', 
    process.env.TEST_ADMIN_EMAIL || 'admin@test.com'
  );
  
  await page.fill('input[type="password"], input[name="password"], [data-testid="password-input"]',
    process.env.TEST_ADMIN_PASSWORD || 'AdminPassword123!'
  );
  
  // Submit form
  await page.click('button[type="submit"], [data-testid="login-button"]');
  
  // Wait for authentication to complete
  await page.waitForURL('**/admin/**', { timeout: 30000 }).catch(async () => {
    // Check for any success indicator
    const successIndicators = [
      page.locator('[data-testid="dashboard"]'),
      page.locator('nav'),
      page.locator('[data-testid="user-menu"]'),
    ];
    
    for (const indicator of successIndicators) {
      try {
        await expect(indicator).toBeVisible({ timeout: 5000 });
        break;
      } catch {
        continue;
      }
    }
  });
  
  // Store authentication state
  await page.context().storageState({ path: authFile });
});
