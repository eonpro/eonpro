#!/usr/bin/env npx ts-node
/**
 * Webhook Configuration Diagnostic Script
 * 
 * Run with: npx ts-node scripts/check-webhook-config.ts
 * 
 * Checks all webhook endpoint configurations and environment variables
 */

interface WebhookEndpoint {
  path: string;
  name: string;
  requiredEnvVars: string[];
  optionalEnvVars?: string[];
  stripeEvents?: string[];
}

const WEBHOOK_ENDPOINTS: WebhookEndpoint[] = [
  // Stripe Webhooks
  {
    path: '/api/webhooks/stripe-connect',
    name: 'Stripe Connect (Multi-Clinic)',
    requiredEnvVars: ['STRIPE_CONNECT_PLATFORM_SECRET_KEY', 'STRIPE_CONNECT_WEBHOOK_SECRET'],
    stripeEvents: ['account.updated', 'account.application.deauthorized', 'capability.updated'],
  },
  {
    path: '/api/stripe/webhook',
    name: 'Main Stripe Payments (EonMeds)',
    requiredEnvVars: [],
    optionalEnvVars: ['EONMEDS_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY', 'EONMEDS_STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET'],
    stripeEvents: ['payment_intent.succeeded', 'charge.succeeded', 'checkout.session.completed', 'invoice.payment_succeeded'],
  },
  {
    path: '/api/v2/stripe/webhook',
    name: 'Stripe Subscriptions (V2)',
    requiredEnvVars: [],
    optionalEnvVars: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    stripeEvents: ['customer.subscription.created', 'customer.subscription.updated', 'invoice.payment_succeeded'],
  },
  {
    path: '/api/stripe/webhook/ot',
    name: 'OT Clinic Stripe',
    requiredEnvVars: ['OT_STRIPE_SECRET_KEY', 'OT_STRIPE_WEBHOOK_SECRET'],
    stripeEvents: ['payment_intent.succeeded', 'charge.succeeded', 'checkout.session.completed'],
  },
  
  // Non-Stripe Webhooks
  {
    path: '/api/webhooks/heyflow-intake',
    name: 'Heyflow Patient Intake',
    requiredEnvVars: [],
    optionalEnvVars: ['HEYFLOW_WEBHOOK_SECRET'],
  },
  {
    path: '/api/webhooks/heyflow-intake-v2',
    name: 'Heyflow Patient Intake V2',
    requiredEnvVars: [],
    optionalEnvVars: ['HEYFLOW_WEBHOOK_SECRET'],
  },
  {
    path: '/api/webhooks/twilio/incoming-sms',
    name: 'Twilio Incoming SMS',
    requiredEnvVars: [],
    optionalEnvVars: ['TWILIO_AUTH_TOKEN'],
  },
  {
    path: '/api/webhooks/ses-bounce',
    name: 'AWS SES Bounce Handling',
    requiredEnvVars: [],
  },
  {
    path: '/api/webhooks/lifefile/prescription-status',
    name: 'Lifefile Prescription Status',
    requiredEnvVars: [],
    optionalEnvVars: ['WEBHOOK_USERNAME', 'WEBHOOK_PASSWORD'],
  },
  {
    path: '/api/v2/zoom/webhook',
    name: 'Zoom Video Meetings',
    requiredEnvVars: [],
    optionalEnvVars: ['ZOOM_WEBHOOK_SECRET'],
  },
];

function checkEnvVar(name: string): { set: boolean; masked?: string } {
  const value = process.env[name];
  if (!value) {
    return { set: false };
  }
  // Mask the value for security
  const masked = value.length > 8 
    ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
    : '****';
  return { set: true, masked };
}

function printHeader(text: string) {
  console.log('\n' + '='.repeat(70));
  console.log(text);
  console.log('='.repeat(70));
}

function printSubHeader(text: string) {
  console.log('\n' + '-'.repeat(50));
  console.log(text);
  console.log('-'.repeat(50));
}

async function main() {
  printHeader('WEBHOOK CONFIGURATION DIAGNOSTIC');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'unknown'}`);

  let totalEndpoints = 0;
  let configuredEndpoints = 0;
  let issues: string[] = [];

  for (const endpoint of WEBHOOK_ENDPOINTS) {
    totalEndpoints++;
    printSubHeader(`${endpoint.name}`);
    console.log(`Path: ${endpoint.path}`);
    
    let allRequiredSet = true;
    let hasAnyConfig = false;

    // Check required env vars
    if (endpoint.requiredEnvVars.length > 0) {
      console.log('\nRequired Environment Variables:');
      for (const envVar of endpoint.requiredEnvVars) {
        const result = checkEnvVar(envVar);
        const status = result.set ? '✅' : '❌';
        const value = result.set ? `(${result.masked})` : 'NOT SET';
        console.log(`  ${status} ${envVar}: ${value}`);
        if (!result.set) {
          allRequiredSet = false;
          issues.push(`${endpoint.path}: Missing ${envVar}`);
        } else {
          hasAnyConfig = true;
        }
      }
    }

    // Check optional env vars
    if (endpoint.optionalEnvVars && endpoint.optionalEnvVars.length > 0) {
      console.log('\nOptional Environment Variables (at least one needed):');
      let hasAtLeastOne = false;
      for (const envVar of endpoint.optionalEnvVars) {
        const result = checkEnvVar(envVar);
        const status = result.set ? '✅' : '⚪';
        const value = result.set ? `(${result.masked})` : 'not set';
        console.log(`  ${status} ${envVar}: ${value}`);
        if (result.set) {
          hasAtLeastOne = true;
          hasAnyConfig = true;
        }
      }
      if (!hasAtLeastOne && endpoint.requiredEnvVars.length === 0) {
        allRequiredSet = false;
        issues.push(`${endpoint.path}: No configuration found`);
      }
    }

    // Show Stripe events
    if (endpoint.stripeEvents && endpoint.stripeEvents.length > 0) {
      console.log('\nStripe Events to Configure:');
      console.log(`  ${endpoint.stripeEvents.join(', ')}`);
    }

    // Status
    if (allRequiredSet && (endpoint.requiredEnvVars.length > 0 || hasAnyConfig)) {
      console.log('\nStatus: ✅ CONFIGURED');
      configuredEndpoints++;
    } else if (allRequiredSet && endpoint.requiredEnvVars.length === 0) {
      console.log('\nStatus: ⚠️  PARTIALLY CONFIGURED (no auth)');
    } else {
      console.log('\nStatus: ❌ NOT CONFIGURED');
    }
  }

  // Summary
  printHeader('SUMMARY');
  console.log(`Total Endpoints: ${totalEndpoints}`);
  console.log(`Fully Configured: ${configuredEndpoints}`);
  console.log(`Needs Attention: ${totalEndpoints - configuredEndpoints}`);

  if (issues.length > 0) {
    printHeader('ISSUES FOUND');
    for (const issue of issues) {
      console.log(`❌ ${issue}`);
    }
  }

  // Stripe webhook URLs for reference
  printHeader('STRIPE WEBHOOK URLS TO CONFIGURE');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://your-domain.com';
  
  console.log('\nIn Stripe Dashboard > Developers > Webhooks, create these endpoints:\n');
  
  console.log('1. Stripe Connect Webhook (for multi-clinic accounts):');
  console.log(`   URL: ${baseUrl}/api/webhooks/stripe-connect`);
  console.log('   Events: account.updated, account.application.deauthorized, capability.updated');
  console.log('   Secret → STRIPE_CONNECT_WEBHOOK_SECRET\n');
  
  console.log('2. Main Payment Webhook (EonMeds):');
  console.log(`   URL: ${baseUrl}/api/stripe/webhook`);
  console.log('   Events: payment_intent.succeeded, charge.succeeded, checkout.session.completed, invoice.*');
  console.log('   Secret → EONMEDS_STRIPE_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET\n');
  
  console.log('3. OT Clinic Webhook (if using):');
  console.log(`   URL: ${baseUrl}/api/stripe/webhook/ot`);
  console.log('   Events: payment_intent.succeeded, charge.succeeded, checkout.session.completed');
  console.log('   Secret → OT_STRIPE_WEBHOOK_SECRET\n');

  console.log('\n' + '='.repeat(70));
  console.log('Done!');
}

main().catch(console.error);
