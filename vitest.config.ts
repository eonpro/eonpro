import path from 'path';
import { fileURLToPath } from 'url';

import { defineConfig } from 'vitest/config';

const __dirnameSafe = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
    },
    
    // Timeouts
    testTimeout: 30000,
    hookTimeout: 30000,
    
    // Reporters
    reporters: ['default'],
    
    // Retry failed tests in CI
    retry: process.env.CI ? 2 : 0,
    
    // Mock configuration
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirnameSafe, './src'),
      '@/tests': path.resolve(__dirnameSafe, './tests'),
    },
  },
});
