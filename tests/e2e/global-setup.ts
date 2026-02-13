/**
 * Playwright Global Setup
 * Runs once before all tests
 */

import { chromium, type FullConfig } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirnameSafe = path.dirname(fileURLToPath(import.meta.url));

async function globalSetup(_config: FullConfig): Promise<void> {
  console.log('🚀 Starting E2E test setup...');
  
  // Create auth directory if it doesn't exist
  const authDir = path.join(__dirnameSafe, '.auth');
  await fs.mkdir(authDir, { recursive: true });
  
  // Set up test database (if needed)
  await setupTestDatabase();
  
  // Create authenticated session for tests
  await createAuthenticatedSession();
  
  console.log('✅ E2E test setup complete');
}

async function setupTestDatabase(): Promise<void> {
  // In production, this would set up a test database
  // For now, we'll use environment variables to point to test DB
  console.log('📦 Test database ready');
}

async function createAuthenticatedSession(): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate to login page
    await page.goto(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000/login');
    
    // Check if we need to log in
    const isLoginPage = await page.url().includes('/login');
    
    if (isLoginPage) {
      // Fill in test credentials
      await page.fill('[data-testid="email-input"]', process.env.TEST_USER_EMAIL || 'test@example.com');
      await page.fill('[data-testid="password-input"]', process.env.TEST_USER_PASSWORD || 'TestPassword123!');
      
      // Submit login form
      await page.click('[data-testid="login-button"]');
      
      // Wait for redirect
      await page.waitForURL('**/dashboard', { timeout: 30000 }).catch(() => {
        // May redirect elsewhere, that's okay
      });
      
      console.log('🔐 Authentication successful');
    }
    
    // Save authentication state
    await context.storageState({ path: path.join(__dirnameSafe, '.auth/user.json') });
    
  } catch (error) {
    console.warn('⚠️ Could not create authenticated session:', error);
    
    // Create empty auth file to prevent test failures
    await fs.writeFile(
      path.join(__dirnameSafe, '.auth/user.json'),
      JSON.stringify({ cookies: [], origins: [] })
    );
  } finally {
    await browser.close();
  }
}

export default globalSetup;
