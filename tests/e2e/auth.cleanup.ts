/**
 * Authentication Cleanup for E2E Tests
 */

import { test as cleanup } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirnameSafe = path.dirname(fileURLToPath(import.meta.url));

cleanup('cleanup authentication state', async () => {
  const authFile = path.join(__dirnameSafe, '.auth/user.json');
  
  try {
    await fs.unlink(authFile);
  } catch {
    // File may not exist
  }
});
