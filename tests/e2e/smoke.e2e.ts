/**
 * Smoke Tests - Critical Path Verification
 * These tests verify the most critical user journeys work correctly
 */

import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test.describe('Health Checks', () => {
    test('API health endpoint responds', async ({ request }) => {
      const response = await request.get('/api/health');
      expect(response.ok()).toBeTruthy();
      
      const body = await response.json();
      expect(body.status).toBe('healthy');
    });

    test('API ready endpoint responds', async ({ request }) => {
      const response = await request.get('/api/ready');
      expect(response.ok()).toBeTruthy();
    });
  });

  test.describe('Public Pages', () => {
    test('login page loads', async ({ page }) => {
      await page.goto('/login');
      
      await expect(page).toHaveURL(/\/login/);
      await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible();
    });

    test('home page loads', async ({ page }) => {
      await page.goto('/');
      
      // Should redirect to login or show dashboard
      const url = page.url();
      expect(url.includes('/login') || url.includes('/dashboard') || url === '/').toBeTruthy();
    });
  });

  test.describe('Authentication Flow', () => {
    test('can access protected route when authenticated', async ({ page }) => {
      // This test uses the authenticated context from setup
      await page.goto('/admin');
      
      // Should not redirect to login
      await page.waitForLoadState('networkidle');
      
      // Either we're on admin page or redirected somewhere valid (not login)
      const url = page.url();
      expect(url.includes('/login')).toBeFalsy();
    });
  });

  test.describe('Core Features', () => {
    test('patients list loads', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForLoadState('networkidle');
      
      // Should see patients table or list
      const content = await page.content();
      expect(
        content.includes('patient') || 
        content.includes('Patient') ||
        page.url().includes('/patient')
      ).toBeTruthy();
    });

    test('orders page loads', async ({ page }) => {
      await page.goto('/orders');
      await page.waitForLoadState('networkidle');
      
      // Page should load without errors
      const errorElements = page.locator('[data-testid="error"], .error');
      const errorCount = await errorElements.count();
      expect(errorCount).toBe(0);
    });
  });
});

test.describe('Security Tests', () => {
  test('security headers are present', async ({ request }) => {
    const response = await request.get('/api/health');
    
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['x-frame-options']).toBe('DENY');
  });

  test('protected routes redirect unauthenticated users', async ({ browser }) => {
    // Create a new context without authentication
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('/admin/patients');
    
    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    
    await context.close();
  });

  test('API returns 401 for unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/patients', {
      headers: {
        // No authorization header
      },
    });
    
    expect(response.status()).toBe(401);
  });
});
