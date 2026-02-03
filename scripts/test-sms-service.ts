/**
 * Test script for SMS Service functionality
 * Run with: npx ts-node scripts/test-sms-service.ts
 */

import {
  validatePhoneNumber,
  formatPhoneNumber,
  isOptOutKeyword,
  isOptInKeyword,
} from '../src/lib/integrations/twilio/smsService';

console.log('='.repeat(60));
console.log('SMS Service Test Suite');
console.log('='.repeat(60));

// Test 1: Phone Number Validation
console.log('\n📱 Test 1: Phone Number Validation');
const testPhones = [
  '+15551234567',
  '5551234567',
  '(555) 123-4567',
  '+44 7911 123456',
  'invalid',
];

testPhones.forEach(phone => {
  const isValid = validatePhoneNumber(phone);
  const formatted = formatPhoneNumber(phone);
  console.log(`  ${phone.padEnd(20)} → Valid: ${isValid ? '✅' : '❌'}, Formatted: ${formatted}`);
});

// Test 2: Opt-Out Keywords
console.log('\n🛑 Test 2: Opt-Out Keyword Detection');
const optOutTests = ['STOP', 'stop', 'UNSUBSCRIBE', 'cancel', 'end', 'quit', 'Hello', 'Yes'];
optOutTests.forEach(keyword => {
  const isOptOut = isOptOutKeyword(keyword);
  console.log(`  "${keyword}".padEnd(15) → Opt-Out: ${isOptOut ? '✅ YES' : '❌ NO'}`);
});

// Test 3: Opt-In Keywords
console.log('\n✅ Test 3: Opt-In Keyword Detection');
const optInTests = ['START', 'start', 'YES', 'yes', 'UNSTOP', 'subscribe', 'Hello', 'STOP'];
optInTests.forEach(keyword => {
  const isOptIn = isOptInKeyword(keyword);
  console.log(`  "${keyword}".padEnd(15) → Opt-In: ${isOptIn ? '✅ YES' : '❌ NO'}`);
});

// Test 4: Environment Check
console.log('\n⚙️  Test 4: Twilio Configuration Check');
const twilioConfigured = !!(
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_PHONE_NUMBER
);
console.log(`  TWILIO_ACCOUNT_SID: ${process.env.TWILIO_ACCOUNT_SID ? '✅ Set' : '❌ Missing'}`);
console.log(`  TWILIO_AUTH_TOKEN: ${process.env.TWILIO_AUTH_TOKEN ? '✅ Set' : '❌ Missing'}`);
console.log(`  TWILIO_PHONE_NUMBER: ${process.env.TWILIO_PHONE_NUMBER ? '✅ Set' : '❌ Missing'}`);
console.log(`  TWILIO_USE_MOCK: ${process.env.TWILIO_USE_MOCK || 'not set (will use real Twilio if configured)'}`);
console.log(`  Overall: ${twilioConfigured ? '✅ Twilio is configured' : '⚠️  Will use mock service'}`);

console.log('\n' + '='.repeat(60));
console.log('Tests completed!');
console.log('='.repeat(60));

// Note: We can't test actual SMS sending without async context
// For that, use the API endpoint tests below
console.log(`
📝 To test actual SMS sending, use:

1. Mock mode (no real SMS):
   curl -X POST http://localhost:3001/api/v2/twilio/send-sms \\
     -H "Content-Type: application/json" \\
     -H "Authorization: Bearer YOUR_TOKEN" \\
     -d '{"to": "+15551234567", "body": "Test message"}'

2. Test incoming SMS webhook:
   curl -X POST http://localhost:3001/api/v2/twilio/webhook \\
     -d "From=+15551234567&Body=STOP&MessageSid=test123"

3. Test opt-out:
   curl -X POST http://localhost:3001/api/v2/twilio/webhook \\
     -d "From=+15551234567&Body=STOP&MessageSid=test123"
`);
