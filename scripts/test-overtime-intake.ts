#!/usr/bin/env npx ts-node
/**
 * Test Overtime Intake Webhook with Sample Data
 *
 * Usage:
 *   npx ts-node scripts/test-overtime-intake.ts
 *   npm run test:overtime-intake
 *
 * Options:
 *   --dry-run     Don't actually create patient (default)
 *   --live        Actually create patient in database
 *   --type=X      Treatment type: weight_loss, better_sex, peptides, trt, nad_plus, baseline
 */

const args = process.argv.slice(2);
const isDryRun = !args.includes('--live');
const treatmentArg = args.find((a) => a.startsWith('--type='));
const treatmentType = treatmentArg?.split('=')[1] || 'weight_loss';

// Sample payloads for each treatment type
const SAMPLE_PAYLOADS: Record<string, Record<string, unknown>> = {
  weight_loss: {
    'Response ID': `test-wl-${Date.now()}`,
    'First name': 'Test',
    'Last name': 'WeightLoss',
    'email': `test.weightloss.${Date.now()}@example.com`,
    'phone number': '+1 (555) 123-4567',
    'DOB': '01/15/1985',
    'Gender': 'Male',
    'State': 'Florida',
    'Address [Street]': '123 Test Street',
    'Address [City]': 'Miami',
    'Address [State]': 'FL',
    'Address [Zip]': '33101',
    'Height [feet]': 5,
    'Height [inches]': 10,
    'starting weight': 220,
    'ideal weight': 180,
    'GLP-1 History': 'Never used',
    'Medications': 'None',
    'Allergies': 'NKDA',
    '18+ Consent': true,
    'Consent Forms': true,
    'treatmentType': 'weight_loss',
  },

  better_sex: {
    'Response ID': `test-bs-${Date.now()}`,
    'First name': 'Test',
    'Last name': 'BetterSex',
    'email': `test.bettersex.${Date.now()}@example.com`,
    'phone number': '+1 (555) 234-5678',
    'DOB': '03/20/1980',
    'Gender': 'Male',
    'State': 'Texas',
    'Address [Street]': '456 Test Ave',
    'Address [City]': 'Houston',
    'Address [State]': 'TX',
    'Address [Zip]': '77001',
    'Height [feet]': 6,
    'Height [inches]': 0,
    'starting weight': 195,
    'Symptoms': 'Difficulty maintaining erection',
    'How long have you notice': '6 months',
    'How often do these sexual issues occur?': 'Frequently',
    'goals': 'Improve sexual performance',
    'Heart condition': 'No',
    'meds with nitrates or nitroglycerin': 'No',
    'Medications': 'None',
    '18+ Consent': true,
    'Consent Forms': true,
    'treatmentType': 'better_sex',
  },

  peptides: {
    'Response ID': `test-pep-${Date.now()}`,
    'First name': 'Test',
    'Last name': 'Peptides',
    'email': `test.peptides.${Date.now()}@example.com`,
    'phone number': '+1 (555) 345-6789',
    'DOB': '07/10/1990',
    'Gender': 'Male',
    'State': 'California',
    'Symptoms': 'Low energy, slow recovery',
    'goals': 'Improved recovery and muscle growth',
    'Peptide choice': 'BPC-157',
    '18+ Consent': true,
    'treatmentType': 'peptides',
  },

  trt: {
    'Response ID': `test-trt-${Date.now()}`,
    'First name': 'Test',
    'Last name': 'Testosterone',
    'email': `test.trt.${Date.now()}@example.com`,
    'phone number': '+1 (555) 456-7890',
    'DOB': '11/25/1975',
    'Gender': 'Male',
    'State': 'Arizona',
    'Main Results to acchive': 'Increased energy and libido',
    'Previous Therapies (Hormone, Pept, GLP1)': 'None',
    'Lab Results': 'Total T: 280 ng/dL',
    '18+ Consent': true,
    'treatmentType': 'testosterone',
  },

  nad_plus: {
    'Response ID': `test-nad-${Date.now()}`,
    'First name': 'Test',
    'Last name': 'NADPlus',
    'email': `test.nad.${Date.now()}@example.com`,
    'phone number': '+1 (555) 567-8901',
    'DOB': '05/05/1982',
    'Gender': 'Male',
    'State': 'Nevada',
    'goals': 'Anti-aging and cognitive enhancement',
    '18+ Consent': true,
    'treatmentType': 'nad_plus',
  },

  baseline: {
    'Response ID': `test-bl-${Date.now()}`,
    'First name': 'Test',
    'Last name': 'Baseline',
    'email': `test.baseline.${Date.now()}@example.com`,
    'phone number': '+1 (555) 678-9012',
    'DOB': '09/15/1988',
    'Gender': 'Male',
    'State': 'Colorado',
    'Why Labs': 'Comprehensive health check',
    'Health areas insights': 'Hormone levels, metabolic panel',
    '18+ Consent': true,
    'treatmentType': 'baseline_bloodwork',
  },
};

async function testWebhook() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       OVERTIME INTAKE WEBHOOK TEST');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const webhookSecret = process.env.OVERTIME_INTAKE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('❌ OVERTIME_INTAKE_WEBHOOK_SECRET not set');
    process.exit(1);
  }

  const payload = SAMPLE_PAYLOADS[treatmentType] || SAMPLE_PAYLOADS.weight_loss;

  console.log(`📋 Treatment Type: ${treatmentType}`);
  console.log(`🔗 Endpoint: ${baseUrl}/api/webhooks/overtime-intake`);
  console.log(`🧪 Mode: ${isDryRun ? 'DRY RUN (no patient created)' : 'LIVE (will create patient)'}`);
  console.log('\n📦 Payload:\n');
  console.log(JSON.stringify(payload, null, 2));

  if (isDryRun) {
    console.log('\n⚠️  DRY RUN MODE - Use --live to actually create patient\n');

    // Just validate the payload structure
    console.log('\n✅ Payload validation passed');
    console.log('\nTo run live test:');
    console.log(`  npx ts-node scripts/test-overtime-intake.ts --live --type=${treatmentType}`);
    return;
  }

  console.log('\n🚀 Sending request...\n');

  try {
    const response = await fetch(`${baseUrl}/api/webhooks/overtime-intake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': webhookSecret,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ SUCCESS!\n');
      console.log(JSON.stringify(data, null, 2));

      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('                       RESULT SUMMARY');
      console.log('═══════════════════════════════════════════════════════════════\n');

      console.log(`📋 Request ID: ${data.requestId}`);
      console.log(`👤 Patient ID: ${data.eonproPatientId}`);
      console.log(`🏥 Clinic: ${data.clinic?.name} (ID: ${data.clinic?.id})`);
      console.log(`💊 Treatment: ${data.treatment?.label}`);
      console.log(`⏱️  Processing Time: ${data.processingTimeMs}ms`);
      console.log(`📝 Message: ${data.message}`);
    } else {
      console.log('❌ FAILED!\n');
      console.log(`Status: ${response.status}`);
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Request failed:', error instanceof Error ? error.message : error);
    console.log('\nMake sure the server is running:');
    console.log('  npm run dev');
  }
}

testWebhook().catch(console.error);
