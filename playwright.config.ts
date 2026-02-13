import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 * Enterprise-grade end-to-end testing setup
 */
export default defineConfig({
  // Test directory
  testDir: './tests/e2e',
  
  // Test file patterns
  testMatch: ['**/*.e2e.ts', '**/*.e2e.tsx'],
  
  // Output directory for test artifacts
  outputDir: './test-results/e2e',
  
  // Timeout configuration
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  
  // Fully parallel execution
  fullyParallel: true,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry configuration
  retries: process.env.CI ? 2 : 0,
  
  // Worker configuration
  workers: process.env.CI ? 2 : '50%',
  
  // Reporter configuration
  reporter: [
    ['list'],
    ['html', { outputFolder: './test-results/e2e-report', open: 'never' }],
    ['json', { outputFile: './test-results/e2e-results.json' }],
    ['junit', { outputFile: './test-results/e2e-junit.xml' }],
    ...(process.env.CI ? [['github'] as const] : []),
  ],
  
  // Global setup and teardown
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  
  // Shared settings for all projects
  use: {
    // Base URL for all tests
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    
    // Collect trace when retrying the failed test
    trace: 'on-first-retry',
    
    // Screenshot on failure
    screenshot: 'only-on-failure',
    
    // Video recording
    video: process.env.CI ? 'on-first-retry' : 'off',
    
    // Viewport size
    viewport: { width: 1280, height: 720 },
    
    // Ignore HTTPS errors for local development
    ignoreHTTPSErrors: true,
    
    // Action timeout
    actionTimeout: 15000,
    
    // Navigation timeout
    navigationTimeout: 30000,
    
    // Locale
    locale: 'en-US',
    
    // Timezone
    timezoneId: 'America/New_York',
    
    // Geolocation (for testing location-based features)
    geolocation: { latitude: 40.7128, longitude: -74.0060 }, // NYC
    
    // Permissions
    permissions: ['geolocation'],
  },
  
  // Configure projects for major browsers
  projects: [
    // Setup project for authentication state
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      teardown: 'cleanup',
    },
    {
      name: 'cleanup',
      testMatch: /.*\.cleanup\.ts/,
    },
    
    // Desktop browsers
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: './tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: './tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    
    // Mobile browsers
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: './tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 13'],
        storageState: './tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    
    // Tablet
    {
      name: 'tablet',
      use: {
        ...devices['iPad Pro 11'],
        storageState: './tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    
    // Unauthenticated tests (login, signup, public pages)
    {
      name: 'unauthenticated',
      testMatch: /.*\.unauth\.e2e\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    // Patient portal smoke (session-expired); no shared auth – logs in as patient
    {
      name: 'patient-portal-smoke',
      testMatch: /.*patient-portal-session-expired\.e2e\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: undefined,
      },
    },
    
    // API tests
    {
      name: 'api',
      testMatch: /.*\.api\.e2e\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    
    // Accessibility tests
    {
      name: 'accessibility',
      testMatch: /.*\.a11y\.e2e\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    
    // Performance tests
    {
      name: 'performance',
      testMatch: /.*\.perf\.e2e\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--enable-precise-memory-info'],
        },
      },
    },
  ],
  
  // Web server configuration
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      NODE_ENV: 'test',
    },
  },
});
