/**
 * Clear Rate Limit Script
 *
 * Run this to immediately unblock a rate-limited user.
 *
 * Usage:
 *   npx tsx scripts/clear-rate-limit.ts              # Clear ALL rate limits
 *   npx tsx scripts/clear-rate-limit.ts --ip 1.2.3.4 # Clear specific IP
 *   npx tsx scripts/clear-rate-limit.ts --list       # List all rate limit keys
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list');
  const clearAll = args.includes('--all') || args.length === 0;
  const ipIndex = args.indexOf('--ip');
  const specificIp = ipIndex >= 0 ? args[ipIndex + 1] : null;

  const redisUrl = process.env.REDIS_URL;

  console.log('🔓 Rate Limit Management Tool');
  console.log('=============================');
  console.log(`Redis URL: ${redisUrl ? redisUrl.substring(0, 30) + '...' : 'NOT CONFIGURED'}`);
  console.log(`Mode: ${listOnly ? 'LIST' : clearAll ? 'CLEAR ALL' : `CLEAR IP: ${specificIp}`}`);
  console.log('');

  if (!redisUrl) {
    console.log('❌ No REDIS_URL configured in .env.local');
    console.log('');
    console.log('To clear rate limits manually in Upstash console:');
    console.log('   SCAN 0 MATCH "ratelimit:*"');
    console.log('   DEL "ratelimit:ratelimit:{IP_ADDRESS}"');
    return;
  }

  try {
    const { createClient } = await import('redis');
    const redis = createClient({ url: redisUrl });

    redis.on('error', (err) => console.log('Redis Error:', err));

    await redis.connect();
    console.log('✅ Connected to Upstash Redis');
    console.log('');

    // Find all rate limit keys
    // Current format: ratelimit:ratelimit:{IP} (stored by src/lib/cache/redis.ts with namespace)
    const keys = await redis.keys('ratelimit:*');

    console.log(`Found ${keys.length} rate limit key(s):`);
    console.log('');

    if (keys.length === 0) {
      console.log('   (no rate limit keys found)');
      console.log('');
      console.log('ℹ️  The rate limit may be in the in-memory LRU cache on Vercel.');
      console.log('   Redeploying will clear the in-memory cache.');
      await redis.quit();
      return;
    }

    for (const key of keys) {
      const value = await redis.get(key);
      let parsed: any = null;
      try {
        parsed = JSON.parse(value || '{}');
      } catch {
        parsed = value;
      }

      const isBlocked = parsed?.count >= 5 || parsed?.blocked;
      const status = isBlocked ? '🔴 BLOCKED' : '🟢 OK';

      console.log(`   ${status} ${key}`);
      if (parsed?.count !== undefined) {
        console.log(`      Count: ${parsed.count}/5`);
      }
      if (parsed?.resetTime) {
        const resetDate = new Date(parsed.resetTime);
        console.log(`      Resets: ${resetDate.toLocaleString()}`);
      }
      console.log('');
    }

    if (listOnly) {
      console.log('ℹ️  Use --all to clear all rate limits');
      console.log('   Use --ip {IP} to clear a specific IP');
      await redis.quit();
      return;
    }

    // Clear keys
    console.log('Clearing rate limits...');
    console.log('');

    let cleared = 0;
    for (const key of keys) {
      if (specificIp && !key.includes(specificIp)) {
        continue;
      }

      await redis.del(key);
      console.log(`   ✅ Deleted: ${key}`);
      cleared++;
    }

    console.log('');
    console.log(`✅ Cleared ${cleared} rate limit(s)`);
    console.log('');
    console.log('The user should now be able to log in.');

    await redis.quit();
  } catch (error) {
    console.error('❌ Error:', error);
    console.log('');
    console.log('Manual instructions for Upstash console:');
    console.log('1. Go to https://console.upstash.com');
    console.log('2. Select your Redis database: mighty-amoeba-11104');
    console.log('3. Go to "Data Browser" tab');
    console.log('4. Search for keys starting with "ratelimit:"');
    console.log('5. Delete them');
  }
}

main();
