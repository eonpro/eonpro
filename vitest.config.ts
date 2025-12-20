import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    // Environment
    environment: 'node',
    globals: true,
    
    // Test file patterns
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'tests/**/*.spec.ts',
      'tests/**/*.spec.tsx',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
    exclude: [
      'node_modules',
      'dist',
      '.next',
      'coverage',
      'tests/e2e/**',
    ],
    
    // Setup files
    setupFiles: ['./vitest.setup.ts'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'text-summary', 'json', 'json-summary', 'lcov', 'html'],
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/*.d.ts',
        '**/types/**',
        'coverage/**',
        'dist/**',
        '.next/**',
        'scripts/**',
        '*.config.*',
        'src/app/**/page.tsx',
        'src/app/**/layout.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/error.tsx',
      ],
      // Enterprise coverage thresholds
      thresholds: {
        global: {
          statements: 70,
          branches: 65,
          functions: 70,
          lines: 70,
        },
        // Critical modules require higher coverage
        'src/lib/auth/**': {
          statements: 85,
          branches: 80,
          functions: 85,
          lines: 85,
        },
        'src/lib/security/**': {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        'src/lib/encryption.ts': {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95,
        },
      },
    },
    
    // Timeouts
    testTimeout: 30000,
    hookTimeout: 30000,
    
    // Reporters
    reporters: ['default', 'html', 'json'],
    outputFile: {
      json: './coverage/test-results.json',
      html: './coverage/test-report.html',
    },
    
    // Pool configuration for parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4,
      },
    },
    
    // Retry failed tests
    retry: process.env.CI ? 2 : 0,
    
    // Mock configuration
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
    
    // Snapshot configuration
    snapshotFormat: {
      printBasicPrototype: false,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/tests': path.resolve(__dirname, './tests'),
    },
  },
});
