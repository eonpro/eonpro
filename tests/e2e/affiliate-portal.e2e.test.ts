/**
 * Affiliate Portal E2E Tests
 * 
 * Tests the complete affiliate tracking and reporting flow:
 * 1. Click tracking
 * 2. Affiliate portal authentication
 * 3. Dashboard display
 * 4. Earnings page
 * 5. Links management
 * 6. Account settings
 * 
 * Run: npx playwright test tests/e2e/affiliate-portal.e2e.test.ts
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://ot.eonpro.io';

test.describe('Affiliate Portal', () => {
  test.describe('Click Tracking API', () => {
    test('should accept valid tracking requests', async ({ request }) => {
      const fingerprint = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      const response = await request.post(`${BASE_URL}/api/affiliate/track`, {
        data: {
          visitorFingerprint: fingerprint,
          refCode: 'NONEXISTENT', // Will fail but should not error
          utmSource: 'test',
          utmMedium: 'e2e',
          utmCampaign: 'playwright',
        },
      });
      
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('success');
    });

    test('should reject missing required fields', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/affiliate/track`, {
        data: {
          // Missing visitorFingerprint and refCode
        },
      });
      
      expect(response.status()).toBe(400);
    });

    test('should handle postback tracking (GET)', async ({ request }) => {
      const response = await request.get(
        `${BASE_URL}/api/affiliate/track?ref=TEST123&fingerprint=test_fingerprint`
      );
      
      // Should return either 200 (gif) or 200 (json with invalid)
      expect(response.status()).toBe(200);
    });

    test('should support multiple ref code parameter names', async ({ request }) => {
      const params = ['ref', 'affiliate', 'partner', 'via'];
      
      for (const param of params) {
        const response = await request.get(
          `${BASE_URL}/api/affiliate/track?${param}=TEST123&fingerprint=test_fp`
        );
        expect(response.status()).toBe(200);
      }
    });
  });

  test.describe('Authentication', () => {
    test('protected endpoints should require authentication', async ({ request }) => {
      const protectedEndpoints = [
        '/api/affiliate/dashboard',
        '/api/affiliate/earnings',
        '/api/affiliate/ref-codes',
        '/api/affiliate/account',
      ];

      for (const endpoint of protectedEndpoints) {
        const response = await request.get(`${BASE_URL}${endpoint}`);
        expect(response.status()).toBe(401);
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    test('login should validate credentials', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/affiliate/auth/login`, {
        data: {
          email: 'invalid@test.com',
          password: 'wrongpassword',
        },
      });
      
      expect(response.status()).toBe(401);
    });

    test('should redirect unauthenticated users from portal pages', async ({ page }) => {
      await page.goto(`${BASE_URL}/affiliate`);
      
      // Should redirect to login
      await page.waitForURL(/.*\/affiliate\/login.*/, { timeout: 5000 });
      expect(page.url()).toContain('/affiliate/login');
    });
  });

  test.describe('Public Pages', () => {
    test('affiliate login page should load', async ({ page }) => {
      await page.goto(`${BASE_URL}/affiliate/login`);
      
      // Should see login form
      await expect(page.getByRole('heading', { name: /sign in|login|partner/i })).toBeVisible();
    });

    test('affiliate apply page should load', async ({ page }) => {
      await page.goto(`${BASE_URL}/affiliate/apply`);
      
      // Should see application form or content
      const content = await page.content();
      expect(content.length).toBeGreaterThan(100);
    });

    test('affiliate demo page should load', async ({ page }) => {
      await page.goto(`${BASE_URL}/affiliate/demo`);
      
      // Should show demo dashboard
      await expect(page.locator('body')).toContainText(/demo|partner|dashboard/i);
    });
  });

  test.describe('API Response Format', () => {
    test('track API should return consistent format', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/affiliate/track`, {
        data: {
          visitorFingerprint: 'test_fingerprint',
          refCode: 'INVALID_CODE',
        },
      });
      
      expect(response.status()).toBe(200);
      const body = await response.json();
      
      // Should have success boolean
      expect(typeof body.success).toBe('boolean');
      
      // If failed, should have reason
      if (!body.success) {
        expect(body).toHaveProperty('reason');
      }
    });

    test('error responses should be JSON', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/affiliate/dashboard`);
      
      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('application/json');
      
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });
  });

  test.describe('Security', () => {
    test('should reject potentially malicious ref codes', async ({ request }) => {
      const maliciousCodes = [
        "'; DROP TABLE affiliates; --",
        '<script>alert(1)</script>',
        '../../../etc/passwd',
      ];

      for (const code of maliciousCodes) {
        const response = await request.post(`${BASE_URL}/api/affiliate/track`, {
          data: {
            visitorFingerprint: 'test_fp',
            refCode: code,
          },
        });
        
        // Should not cause server error
        expect(response.status()).not.toBe(500);
      }
    });

    test('should sanitize UTM parameters', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/affiliate/track`, {
        data: {
          visitorFingerprint: 'test_fp',
          refCode: 'TEST',
          utmSource: '<script>alert(1)</script>',
          utmMedium: "' OR '1'='1",
        },
      });
      
      // Should not cause server error
      expect(response.status()).not.toBe(500);
    });
  });
});

test.describe('Affiliate Portal UI', () => {
  // These tests verify the UI loads correctly without authentication
  
  test('login page has proper form elements', async ({ page }) => {
    await page.goto(`${BASE_URL}/affiliate/login`);
    
    // Wait for page load
    await page.waitForLoadState('domcontentloaded');
    
    // Check for email/password inputs
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator('input[type="password"]');
    
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test('demo page shows dashboard preview', async ({ page }) => {
    await page.goto(`${BASE_URL}/affiliate/demo`);
    
    await page.waitForLoadState('domcontentloaded');
    
    // Should show balance information
    const content = await page.content();
    expect(content).toMatch(/balance|earnings|available/i);
  });

  test('terms page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/affiliate/terms`);
    
    await page.waitForLoadState('domcontentloaded');
    
    // Should have partner agreement content
    const content = await page.content();
    expect(content).toMatch(/agreement|terms|partner|commission/i);
  });
});

test.describe('Performance', () => {
  test('tracking API should respond quickly', async ({ request }) => {
    const start = Date.now();
    
    await request.post(`${BASE_URL}/api/affiliate/track`, {
      data: {
        visitorFingerprint: 'perf_test',
        refCode: 'TEST',
      },
    });
    
    const duration = Date.now() - start;
    
    // Should respond within 2 seconds
    expect(duration).toBeLessThan(2000);
  });

  test('multiple concurrent tracking requests', async ({ request }) => {
    const requests = Array(5).fill(null).map((_, i) =>
      request.post(`${BASE_URL}/api/affiliate/track`, {
        data: {
          visitorFingerprint: `concurrent_test_${i}`,
          refCode: 'TEST',
        },
      })
    );
    
    const responses = await Promise.all(requests);
    
    // All should succeed (not rate limited for 5 requests)
    for (const response of responses) {
      expect(response.status()).not.toBe(429);
    }
  });
});
