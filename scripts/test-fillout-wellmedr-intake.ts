#!/usr/bin/env npx tsx
/**
 * Test Fillout → wellmedr-intake webhook
 *
 * Sends a mock Fillout payload (questions array) to the wellmedr-intake endpoint.
 * Use after deploying to verify Fillout adapter and key mapping.
 *
 * Usage:
 *   BASE_URL=https://app.eonpro.io WELLMEDR_INTAKE_WEBHOOK_SECRET=your-secret npx tsx scripts/test-fillout-wellmedr-intake.ts
 *   # Or against local:
 *   BASE_URL=http://localhost:3001 WELLMEDR_INTAKE_WEBHOOK_SECRET=your-secret npx tsx scripts/test-fillout-wellmedr-intake.ts
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const SECRET = process.env.WELLMEDR_INTAKE_WEBHOOK_SECRET;

if (!SECRET) {
  console.error('Set WELLMEDR_INTAKE_WEBHOOK_SECRET');
  process.exit(1);
}

const filloutPayload = {
  submissionId: `test-fillout-${Date.now()}`,
  submissionTime: new Date().toISOString(),
  lastUpdatedAt: new Date().toISOString(),
  questions: [
    { id: 'First Name', value: 'FilloutTest' },
    { id: 'Last Name', value: 'User' },
    { id: 'Email', value: `fillout-test-${Date.now()}@example.com` },
    { id: 'Phone Number', value: '5551234567' },
    { id: 'State', value: 'TX' },
    { id: 'Feet', value: '5' },
    { id: 'Inches', value: '10' },
    { id: 'Weight', value: '180' },
    { id: 'Goal Weight', value: '150' },
    { id: 'Gender', value: 'Female' },
    { id: 'DOB (Day)', value: '15' },
    { id: 'DOB (Month)', value: '3' },
    { id: 'DOB (Year)', value: '1990' },
    { id: 'Primary Fitness Goal', value: 'Lose weight' },
    { id: 'Current Medications', value: 'None' },
  ],
};

async function main() {
  const url = `${BASE_URL.replace(/\/$/, '')}/api/webhooks/wellmedr-intake`;
  console.log('POST', url);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': SECRET,
    },
    body: JSON.stringify(filloutPayload),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  console.log('Status:', res.status, res.statusText);
  console.log('Response:', JSON.stringify(body, null, 2));
  if (!res.ok) {
    process.exit(1);
  }
  console.log('\nFillout → wellmedr-intake test OK.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
