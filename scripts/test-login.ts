import { logger } from '../src/lib/logger';

#!/usr/bin/env npx tsx
async function testLogin() {
  logger.info('Testing influencer login...\n');
  
  const response = await fetch('http://localhost:3005/api/influencers/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'test.influencer@example.com',
      password: 'test123'
    })
  });

  const data = await response.json();
  
  logger.info('Response status:', response.status);
  logger.info('Response data:', JSON.stringify(data, null, 2));
  
  if (response.ok) {
    logger.info('\n✅ Login successful!');
    const cookies = response.headers.get('set-cookie');
    if (cookies) {
      logger.info('Cookies set:', cookies);
    }
  } else {
    logger.info('\n❌ Login failed');
  }
}

testLogin().catch(console.error);
