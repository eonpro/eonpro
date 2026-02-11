/**
 * Shared DB fingerprint utilities for diagnostics
 */

import { createHash } from 'crypto';
import { buildServerlessConnectionUrl } from '@/lib/database/serverless-pool';

export function hashDatasourceUrl(url: string): string {
  return createHash('sha256').update(url, 'utf8').digest('hex').slice(0, 16);
}

export function getDatasourceHash(): string {
  let url: string;
  try {
    url = buildServerlessConnectionUrl();
  } catch {
    url = process.env.DATABASE_URL || '';
  }
  return hashDatasourceUrl(url);
}
