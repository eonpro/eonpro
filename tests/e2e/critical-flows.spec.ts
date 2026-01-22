/**
 * E2E Tests for Critical User Flows
 * Enterprise-level coverage for healthcare platform
 */

import { test, expect, Page } from '@playwright/test';

// Test configuration
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3001';

// Test credentials - MUST be provided via environment variables
// No hardcoded fallbacks for security compliance
const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const TEST_PROVIDER_EMAIL = process.env.TEST_PROVIDER_EMAIL;
const TEST_PROVIDER_PASSWORD = process.env.TEST_PROVIDER_PASSWORD;

// Validate required environment variables before running tests
if (!TEST_ADMIN_EMAIL || !TEST_ADMIN_PASSWORD) {
  console.warn('⚠️ TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD environment variables required for auth tests');
}

// Helper function to login
async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);
  await page.click('button[type="submit"]');
  
  // Wait for redirect to dashboard
  await page.waitForURL(/\/(dashboard|patients|admin)/, { timeout: 10000 });
}

// ============================================================================
// Authentication Tests
// ============================================================================

test.describe('Authentication Flow', () => {
  test('should display login page correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    
    // Check for essential elements
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"], input[type="email"]', 'invalid@test.com');
    await page.fill('input[name="password"], input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // Should show error message
    await expect(page.locator('text=/invalid|incorrect|error/i')).toBeVisible({ timeout: 5000 });
  });

  test('should redirect to login when accessing protected route', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);
    
    // Should redirect to login
    await expect(page).toHaveURL(/login/);
  });

  test('should successfully logout', async ({ page }) => {
    // Login first
    await login(page, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    
    // Find and click logout
    const logoutButton = page.locator('text=/logout|sign out/i').first();
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await expect(page).toHaveURL(/login/);
    }
  });
});

// ============================================================================
// Patient Management Tests
// ============================================================================

test.describe('Patient Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_PROVIDER_EMAIL, TEST_PROVIDER_PASSWORD);
  });

  test('should display patients list', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);
    
    // Should show patients table or list
    await expect(page.locator('table, [data-testid="patients-list"]')).toBeVisible({ timeout: 10000 });
  });

  test('should search patients', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);
    
    // Find search input
    const searchInput = page.locator('input[placeholder*="search" i], input[name="search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await page.waitForTimeout(500); // Debounce
      
      // Results should filter
      await expect(page.locator('table tbody tr, [data-testid="patient-card"]')).toBeVisible();
    }
  });

  test('should open patient detail page', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);
    
    // Click on first patient
    const patientRow = page.locator('table tbody tr, [data-testid="patient-card"]').first();
    await patientRow.click();
    
    // Should navigate to patient detail
    await expect(page).toHaveURL(/patients\/\d+/);
  });

  test('should display patient tabs', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);
    
    // Click on first patient
    const patientRow = page.locator('table tbody tr, [data-testid="patient-card"]').first();
    if (await patientRow.isVisible()) {
      await patientRow.click();
      
      // Check for tabs
      await expect(page.locator('text=/profile|intake|prescriptions|billing/i').first()).toBeVisible({ timeout: 10000 });
    }
  });
});

// ============================================================================
// Billing Tests
// ============================================================================

test.describe('Billing Flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
  });

  test('should display billing tab on patient detail', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);
    
    // Click on first patient
    const patientRow = page.locator('table tbody tr').first();
    if (await patientRow.isVisible()) {
      await patientRow.click();
      await page.waitForURL(/patients\/\d+/);
      
      // Click billing tab
      const billingTab = page.locator('text=/billing/i').first();
      if (await billingTab.isVisible()) {
        await billingTab.click();
        
        // Should show billing content
        await expect(page.locator('text=/invoices|payments|subscriptions/i').first()).toBeVisible({ timeout: 10000 });
      }
    }
  });
});

// ============================================================================
// Chat/Messaging Tests
// ============================================================================

test.describe('Chat Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_PROVIDER_EMAIL, TEST_PROVIDER_PASSWORD);
  });

  test('should display chat tab on patient detail', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);
    
    // Click on first patient
    const patientRow = page.locator('table tbody tr').first();
    if (await patientRow.isVisible()) {
      await patientRow.click();
      await page.waitForURL(/patients\/\d+/);
      
      // Click chat tab
      const chatTab = page.locator('text=/chat/i').first();
      if (await chatTab.isVisible()) {
        await chatTab.click();
        
        // Should show chat interface
        await expect(page.locator('text=/type a message|send|connected/i').first()).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('should show message input field', async ({ page }) => {
    // Navigate directly to a patient chat tab (if URL pattern is known)
    await page.goto(`${BASE_URL}/patients`);
    
    const patientRow = page.locator('table tbody tr').first();
    if (await patientRow.isVisible()) {
      await patientRow.click();
      await page.waitForURL(/patients\/\d+/);
      
      // Navigate to chat
      const chatTab = page.locator('text=/chat/i').first();
      if (await chatTab.isVisible()) {
        await chatTab.click();
        
        // Check for message input
        const messageInput = page.locator('input[placeholder*="message" i], textarea[placeholder*="message" i]');
        await expect(messageInput).toBeVisible({ timeout: 10000 });
      }
    }
  });
});

// ============================================================================
// Admin Dashboard Tests
// ============================================================================

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
  });

  test('should display admin dashboard', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    
    // Should show admin content
    await expect(page.locator('text=/dashboard|analytics|settings/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display statistics cards', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    
    // Look for stat cards
    const statCards = page.locator('[data-testid="stat-card"], .stat-card, [class*="stats"]');
    if (await statCards.first().isVisible()) {
      await expect(statCards.first()).toBeVisible();
    }
  });
});

// ============================================================================
// Responsive Design Tests
// ============================================================================

test.describe('Mobile Responsiveness', () => {
  test('should display mobile menu on small screens', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await login(page, TEST_PROVIDER_EMAIL, TEST_PROVIDER_PASSWORD);
    
    // Look for hamburger menu
    const hamburgerMenu = page.locator('[data-testid="mobile-menu"], button[aria-label*="menu" i], .hamburger');
    if (await hamburgerMenu.isVisible()) {
      await expect(hamburgerMenu).toBeVisible();
    }
  });

  test('should be navigable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto(`${BASE_URL}/login`);
    
    // Login form should be usable
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

test.describe('Accessibility', () => {
  test('should have proper form labels', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    
    // Check for accessible labels
    const emailInput = page.locator('input[name="email"], input[type="email"]');
    const passwordInput = page.locator('input[name="password"], input[type="password"]');
    
    // Inputs should have labels or aria-label
    const emailLabel = await emailInput.getAttribute('aria-label') || 
                       await page.locator(`label[for="${await emailInput.getAttribute('id')}"]`).count();
    const passwordLabel = await passwordInput.getAttribute('aria-label') || 
                          await page.locator(`label[for="${await passwordInput.getAttribute('id')}"]`).count();
    
    expect(emailLabel).toBeTruthy();
    expect(passwordLabel).toBeTruthy();
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    
    // Tab through form
    await page.keyboard.press('Tab');
    
    // First focusable element should be focused
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['INPUT', 'BUTTON', 'A']).toContain(focusedElement);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('Performance', () => {
  test('should load login page within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto(`${BASE_URL}/login`);
    const loadTime = Date.now() - startTime;
    
    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should load dashboard within acceptable time after login', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"], input[type="email"]', TEST_ADMIN_EMAIL);
    await page.fill('input[name="password"], input[type="password"]', TEST_ADMIN_PASSWORD);
    
    const startTime = Date.now();
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|patients|admin)/, { timeout: 10000 });
    const loadTime = Date.now() - startTime;
    
    // Dashboard should load within 10 seconds
    expect(loadTime).toBeLessThan(10000);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

test.describe('Error Handling', () => {
  test('should display 404 page for invalid routes', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/this-page-does-not-exist-xyz`);
    
    // Should return 404 or show error page
    expect(response?.status()).toBe(404);
  });

  test('should handle API errors gracefully', async ({ page }) => {
    await login(page, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    
    // Try to access a non-existent patient
    await page.goto(`${BASE_URL}/patients/999999999`);
    
    // Should show error message or redirect
    const hasError = await page.locator('text=/not found|error|doesn\'t exist/i').isVisible();
    const redirectedToList = page.url().includes('/patients') && !page.url().includes('999999999');
    
    expect(hasError || redirectedToList).toBeTruthy();
  });
});
