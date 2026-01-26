#!/usr/bin/env node
/**
 * Live Affiliate API Test Script
 * 
 * Tests the affiliate tracking and reporting APIs against a live environment.
 * No database connection required - tests actual HTTP endpoints.
 * 
 * Run: node scripts/test-affiliate-live.js [BASE_URL]
 */

const BASE_URL = process.argv[2] || 'https://ot.eonpro.io';

// Test results
const results = { passed: 0, failed: 0, tests: [] };

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  purple: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function assert(condition, testName, details = '') {
  if (condition) {
    results.passed++;
    results.tests.push({ name: testName, status: 'pass' });
    log(`  ✓ ${testName}`, 'green');
    return true;
  } else {
    results.failed++;
    results.tests.push({ name: testName, status: 'fail', error: details });
    log(`  ✗ ${testName}: ${details}`, 'red');
    return false;
  }
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  
  const contentType = response.headers.get('content-type') || '';
  let body = null;
  
  if (contentType.includes('application/json')) {
    body = await response.json();
  } else {
    body = await response.text();
  }
  
  return { status: response.status, body, headers: response.headers };
}

// ============ TEST SUITES ============

async function testClickTracking() {
  log('\n📍 Testing Click Tracking API', 'purple');
  log('━'.repeat(50), 'purple');
  
  const fingerprint = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const cookieId = `cookie_${Date.now()}`;
  
  // Test 1: Valid tracking request (will fail on ref code but shouldn't error)
  const track1 = await fetchJSON(`${BASE_URL}/api/affiliate/track`, {
    method: 'POST',
    body: JSON.stringify({
      visitorFingerprint: fingerprint,
      refCode: 'TESTCODE123',
      utmSource: 'test',
      utmMedium: 'api_test',
      utmCampaign: 'live_test',
      cookieId: cookieId,
    }),
  });
  
  assert(
    track1.status === 200,
    'POST /api/affiliate/track returns 200',
    `Got ${track1.status}`
  );
  
  assert(
    track1.body && typeof track1.body.success === 'boolean',
    'Response has success boolean',
    JSON.stringify(track1.body).substring(0, 100)
  );
  
  // Test 2: Missing required fields
  const track2 = await fetchJSON(`${BASE_URL}/api/affiliate/track`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  
  assert(
    track2.status === 400,
    'Missing fields returns 400',
    `Got ${track2.status}`
  );
  
  // Test 3: Postback tracking (GET)
  const track3 = await fetchJSON(
    `${BASE_URL}/api/affiliate/track?ref=TEST123&fingerprint=${fingerprint}`,
    { method: 'GET' }
  );
  
  assert(
    track3.status === 200,
    'GET postback returns 200',
    `Got ${track3.status}`
  );
  
  // Test 4: Various ref parameter names
  const paramNames = ['ref', 'affiliate', 'partner', 'via'];
  for (const param of paramNames) {
    const res = await fetchJSON(
      `${BASE_URL}/api/affiliate/track?${param}=TEST&fingerprint=test_fp`
    );
    assert(
      res.status === 200,
      `Parameter '${param}' accepted`,
      `Got ${res.status}`
    );
  }
}

async function testAuthentication() {
  log('\n🔐 Testing Authentication', 'purple');
  log('━'.repeat(50), 'purple');
  
  // Test 1: Auth check without session
  const auth1 = await fetchJSON(`${BASE_URL}/api/affiliate/auth/me`);
  assert(
    auth1.status === 401,
    'GET /auth/me without auth returns 401',
    `Got ${auth1.status}`
  );
  
  // Test 2: Invalid login
  const auth2 = await fetchJSON(`${BASE_URL}/api/affiliate/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      email: 'fake@test.com',
      password: 'wrongpassword',
    }),
  });
  assert(
    auth2.status === 401,
    'Invalid login returns 401',
    `Got ${auth2.status}`
  );
  
  // Test 3: Protected endpoints
  const protectedEndpoints = [
    '/api/affiliate/dashboard',
    '/api/affiliate/earnings',
    '/api/affiliate/ref-codes',
    '/api/affiliate/account',
  ];
  
  for (const endpoint of protectedEndpoints) {
    const res = await fetchJSON(`${BASE_URL}${endpoint}`);
    assert(
      res.status === 401,
      `${endpoint} requires auth`,
      `Got ${res.status}`
    );
  }
}

async function testResponseFormats() {
  log('\n📋 Testing Response Formats', 'purple');
  log('━'.repeat(50), 'purple');
  
  // Track response format
  const track = await fetchJSON(`${BASE_URL}/api/affiliate/track`, {
    method: 'POST',
    body: JSON.stringify({
      visitorFingerprint: 'format_test',
      refCode: 'INVALID',
    }),
  });
  
  assert(
    track.body && typeof track.body === 'object',
    'Track response is JSON object',
    typeof track.body
  );
  
  assert(
    'success' in track.body,
    'Track response has success field',
    Object.keys(track.body).join(', ')
  );
  
  // Error response format
  const error = await fetchJSON(`${BASE_URL}/api/affiliate/dashboard`);
  
  assert(
    error.body && typeof error.body === 'object',
    'Error response is JSON object',
    typeof error.body
  );
  
  assert(
    'error' in error.body,
    'Error response has error field',
    Object.keys(error.body).join(', ')
  );
}

async function testSecurity() {
  log('\n🛡️ Testing Security', 'purple');
  log('━'.repeat(50), 'purple');
  
  // SQL injection attempt
  const sql = await fetchJSON(`${BASE_URL}/api/affiliate/track`, {
    method: 'POST',
    body: JSON.stringify({
      visitorFingerprint: 'security_test',
      refCode: "'; DROP TABLE affiliates; --",
    }),
  });
  
  assert(
    sql.status !== 500,
    'SQL injection attempt handled safely',
    `Status: ${sql.status}`
  );
  
  // XSS attempt
  const xss = await fetchJSON(`${BASE_URL}/api/affiliate/track`, {
    method: 'POST',
    body: JSON.stringify({
      visitorFingerprint: 'security_test',
      refCode: '<script>alert(1)</script>',
    }),
  });
  
  assert(
    xss.status !== 500,
    'XSS attempt handled safely',
    `Status: ${xss.status}`
  );
  
  // Path traversal attempt
  const path = await fetchJSON(`${BASE_URL}/api/affiliate/track`, {
    method: 'POST',
    body: JSON.stringify({
      visitorFingerprint: 'security_test',
      refCode: '../../../etc/passwd',
    }),
  });
  
  assert(
    path.status !== 500,
    'Path traversal attempt handled safely',
    `Status: ${path.status}`
  );
}

async function testPerformance() {
  log('\n⚡ Testing Performance', 'purple');
  log('━'.repeat(50), 'purple');
  
  // Response time
  const start = Date.now();
  await fetchJSON(`${BASE_URL}/api/affiliate/track`, {
    method: 'POST',
    body: JSON.stringify({
      visitorFingerprint: 'perf_test',
      refCode: 'TEST',
    }),
  });
  const duration = Date.now() - start;
  
  assert(
    duration < 2000,
    `Response time < 2s (${duration}ms)`,
    `Took ${duration}ms`
  );
  
  // Concurrent requests
  const concurrentRequests = Array(5).fill(null).map((_, i) =>
    fetchJSON(`${BASE_URL}/api/affiliate/track`, {
      method: 'POST',
      body: JSON.stringify({
        visitorFingerprint: `concurrent_${i}`,
        refCode: 'TEST',
      }),
    })
  );
  
  const responses = await Promise.all(concurrentRequests);
  const allSucceeded = responses.every(r => r.status !== 429);
  
  assert(
    allSucceeded,
    '5 concurrent requests not rate limited',
    `Rate limited: ${responses.filter(r => r.status === 429).length}`
  );
}

async function testPublicPages() {
  log('\n🌐 Testing Public Pages', 'purple');
  log('━'.repeat(50), 'purple');
  
  const pages = [
    { path: '/affiliate/login', expect: ['login', 'sign in', 'email', 'password'] },
    { path: '/affiliate/apply', expect: ['apply', 'partner', 'affiliate'] },
    { path: '/affiliate/demo', expect: ['demo', 'dashboard', 'balance'] },
    { path: '/affiliate/terms', expect: ['terms', 'agreement', 'commission'] },
  ];
  
  for (const page of pages) {
    const res = await fetch(`${BASE_URL}${page.path}`);
    const html = await res.text();
    const htmlLower = html.toLowerCase();
    
    const hasContent = page.expect.some(word => htmlLower.includes(word));
    
    assert(
      res.status === 200 && hasContent,
      `${page.path} loads with expected content`,
      `Status: ${res.status}, Content check: ${hasContent}`
    );
  }
}

// ============ MAIN ============

async function main() {
  console.log('\n' + '═'.repeat(60));
  log('🧪 AFFILIATE SYSTEM LIVE TEST SUITE', 'cyan');
  log(`Base URL: ${BASE_URL}`, 'cyan');
  console.log('═'.repeat(60));
  
  try {
    await testClickTracking();
    await testAuthentication();
    await testResponseFormats();
    await testSecurity();
    await testPerformance();
    await testPublicPages();
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  log('📋 TEST SUMMARY', 'cyan');
  console.log('═'.repeat(60));
  log(`  Total: ${results.passed + results.failed}`, 'blue');
  log(`  ✓ Passed: ${results.passed}`, 'green');
  
  if (results.failed > 0) {
    log(`  ✗ Failed: ${results.failed}`, 'red');
    console.log('\nFailed tests:');
    results.tests.filter(t => t.status === 'fail').forEach(t => {
      log(`  - ${t.name}: ${t.error}`, 'red');
    });
  }
  
  console.log('═'.repeat(60) + '\n');
  
  process.exit(results.failed > 0 ? 1 : 0);
}

main();
