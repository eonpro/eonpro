/**
 * Clear Rate Limit Script
 *
 * Run this to immediately unblock a rate-limited user.
 * Uses Upstash REST API (matching production) with REDIS_URL fallback for local dev.
 *
 * Usage:
 *   npx tsx scripts/clear-rate-limit.ts              # Clear ALL rate limits
 *   npx tsx scripts/clear-rate-limit.ts --ip 1.2.3.4 # Clear specific IP
 *   npx tsx scripts/clear-rate-limit.ts --list        # List all rate limit keys
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

// Key prefixes used by the rate limiters at runtime:
//   rate-limiter-redis.ts  → ratelimit:<identifier>:<ip>  and  ratelimit:block:<identifier>:<ip>
//   enterprise-rate-limiter.ts → auth:ip:<ip>, auth:email:<email>, auth:combo:<ip>:<email>
const SCAN_PATTERNS = ['ratelimit:*', 'auth:*'];

// ---------------------------------------------------------------------------
// Upstash REST helpers
// ---------------------------------------------------------------------------

async function upstashCommand(
  url: string,
  token: string,
  command: string[],
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upstash ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.result;
}

async function scanKeys(
  url: string,
  token: string,
  pattern: string,
): Promise<string[]> {
  const keys: string[] = [];
  let cursor = 0;
  do {
    const result = (await upstashCommand(url, token, [
      'SCAN',
      String(cursor),
      'MATCH',
      pattern,
      'COUNT',
      '200',
    ])) as [string | number, string[]];
    cursor = typeof result[0] === 'string' ? parseInt(result[0], 10) : result[0];
    keys.push(...result[1]);
  } while (cursor !== 0);
  return keys;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list');
  const clearAll = args.includes('--all') || args.length === 0;
  const ipIndex = args.indexOf('--ip');
  const specificIp = ipIndex >= 0 ? args[ipIndex + 1] : null;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const redisUrl = process.env.REDIS_URL;

  console.log('Rate Limit Management Tool');
  console.log('=============================');
  console.log(
    `Mode: ${listOnly ? 'LIST' : clearAll ? 'CLEAR ALL' : `CLEAR IP: ${specificIp}`}`,
  );
  console.log('');

  if (!upstashUrl || !upstashToken) {
    if (redisUrl) {
      console.log(
        'Upstash credentials not found but REDIS_URL is set.',
      );
      console.log(
        'Production rate limits are stored in Upstash. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env.local.',
      );
    } else {
      console.log('No Redis credentials configured in .env.local');
      console.log('');
      console.log('Required env vars:');
      console.log('  UPSTASH_REDIS_REST_URL=https://...upstash.io');
      console.log('  UPSTASH_REDIS_REST_TOKEN=AX...');
    }
    process.exit(1);
  }

  console.log(`Redis: Upstash REST (${upstashUrl.substring(0, 30)}...)`);
  console.log('');

  try {
    // Collect all matching keys
    const allKeys: string[] = [];
    for (const pattern of SCAN_PATTERNS) {
      const keys = await scanKeys(upstashUrl, upstashToken, pattern);
      allKeys.push(...keys);
    }

    // Deduplicate (patterns could overlap)
    const uniqueKeys = [...new Set(allKeys)];

    console.log(`Found ${uniqueKeys.length} rate limit key(s):`);
    console.log('');

    if (uniqueKeys.length === 0) {
      console.log('   (no rate limit keys found)');
      console.log('');
      console.log('Note: In-memory LRU rate limits on Vercel clear on redeploy.');
      return;
    }

    for (const key of uniqueKeys) {
      const raw = (await upstashCommand(upstashUrl, upstashToken, [
        'GET',
        key,
      ])) as string | null;

      let parsed: any = null;
      try {
        parsed = raw ? JSON.parse(raw) : raw;
      } catch {
        parsed = raw;
      }

      const isBlocked =
        (typeof parsed === 'object' && parsed?.blocked) ||
        (typeof parsed === 'number' && parsed >= 10) ||
        (typeof parsed === 'string' && parseInt(parsed, 10) >= 10);
      const status = isBlocked ? 'BLOCKED' : 'OK';

      console.log(`   [${status}] ${key}`);
      if (typeof parsed === 'object' && parsed !== null) {
        if (parsed.attempts !== undefined) console.log(`      Attempts: ${parsed.attempts}`);
        if (parsed.count !== undefined) console.log(`      Count: ${parsed.count}`);
        if (parsed.blockedUntil) {
          console.log(`      Blocked until: ${new Date(parsed.blockedUntil * 1000).toLocaleString()}`);
        }
      } else if (parsed !== null) {
        console.log(`      Value: ${parsed}`);
      }

      const ttl = (await upstashCommand(upstashUrl, upstashToken, [
        'TTL',
        key,
      ])) as number;
      if (ttl > 0) {
        console.log(`      TTL: ${ttl}s (expires ${new Date(Date.now() + ttl * 1000).toLocaleString()})`);
      }
      console.log('');
    }

    if (listOnly) {
      console.log('Use --all to clear all rate limits');
      console.log('Use --ip <IP> to clear a specific IP');
      return;
    }

    // Clear keys
    console.log('Clearing rate limits...');
    console.log('');

    let cleared = 0;
    for (const key of uniqueKeys) {
      if (specificIp && !key.includes(specificIp)) {
        continue;
      }

      await upstashCommand(upstashUrl, upstashToken, ['DEL', key]);
      console.log(`   Deleted: ${key}`);
      cleared++;
    }

    console.log('');
    console.log(`Cleared ${cleared} rate limit(s)`);
    console.log('');
    console.log('The user should now be able to log in.');
    console.log('Note: In-memory LRU rate limits on Vercel clear on redeploy.');
  } catch (error) {
    console.error('Error:', error);
    console.log('');
    console.log('Manual instructions for Upstash console:');
    console.log('1. Go to https://console.upstash.com');
    console.log('2. Select your Redis database');
    console.log('3. Go to "Data Browser" tab');
    console.log('4. Search for keys starting with "ratelimit:" or "auth:"');
    console.log('5. Delete them');
  }
}

main();
