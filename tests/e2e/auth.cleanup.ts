/**
 * Authentication Cleanup for E2E Tests
 */

import { test as cleanup } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

cleanup('cleanup authentication state', async () => {
  const authFile = path.join(__dirname, '.auth/user.json');
  
  try {
    await fs.unlink(authFile);
  } catch {
    // File may not exist
  }
});
