/**
 * Backfill Script: Fix "Unknown Customer" Patients from Stripe Data
 * =================================================================
 * 
 * This script finds patients with placeholder names ("Unknown Customer")
 * and attempts to fetch their real names from Stripe using:
 * 1. Stripe Customer object (name, description, metadata)
 * 2. Payment/Invoice descriptions (e.g., "Invoice 123 (John Smith)")
 * 3. Charge billing_details
 * 
 * Usage:
 *   npx ts-node scripts/backfill-unknown-customers.ts [--dry-run] [--clinic-id=N] [--limit=N]
 * 
 * Options:
 *   --dry-run     Show what would be updated without making changes
 *   --clinic-id   Only process patients from a specific clinic
 *   --limit       Maximum number of patients to process (default: 100)
 */

// Load environment variables (check multiple possible locations)
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

const prisma = new PrismaClient();

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const clinicIdArg = args.find(a => a.startsWith('--clinic-id='));
const clinicId = clinicIdArg ? parseInt(clinicIdArg.split('=')[1], 10) : undefined;
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 100;

// Initialize Stripe
const stripeSecretKey = process.env.OT_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.error('❌ No Stripe secret key found. Set OT_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY.');
  process.exit(1);
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2026-01-28.clover',
  typescript: true,
});

interface UpdateResult {
  patientId: number;
  stripeCustomerId: string | null;
  oldName: string;
  newName: string | null;
  source: 'customer_name' | 'customer_description' | 'invoice_description' | 'charge_billing' | 'metadata' | null;
  updated: boolean;
  error?: string;
}

/**
 * Extract name from description patterns like "Invoice 123 (John Smith)"
 */
function extractNameFromDescription(description: string | null): string | null {
  if (!description) return null;
  
  const parenMatch = description.match(/\(([^)]+)\)\s*$/);
  if (parenMatch && parenMatch[1]) {
    const name = parenMatch[1].trim();
    if (/[a-zA-Z]/.test(name) && name.length > 2 && name.length < 100) {
      return name;
    }
  }
  return null;
}

/**
 * Fetch customer data from Stripe
 */
async function fetchStripeCustomerName(customerId: string): Promise<{
  name: string | null;
  source: 'customer_name' | 'customer_description' | 'metadata' | null;
}> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    
    if (customer.deleted) {
      return { name: null, source: null };
    }
    
    const stripeCustomer = customer as Stripe.Customer;
    
    // Try customer.name first
    if (stripeCustomer.name && stripeCustomer.name.trim().length > 0) {
      return { name: stripeCustomer.name, source: 'customer_name' };
    }
    
    // Try description (often contains the name)
    if (stripeCustomer.description) {
      const desc = stripeCustomer.description.trim();
      // Only use if it looks like a name
      if (desc.length > 2 && desc.length < 100 && /^[A-Za-z\s\-']+$/.test(desc)) {
        return { name: desc, source: 'customer_description' };
      }
    }
    
    // Try metadata
    if (stripeCustomer.metadata) {
      const metaName = stripeCustomer.metadata.name ||
                       stripeCustomer.metadata.customer_name ||
                       stripeCustomer.metadata.full_name ||
                       stripeCustomer.metadata.fullName;
      if (metaName && metaName.trim().length > 0) {
        return { name: metaName, source: 'metadata' };
      }
    }
    
    return { name: null, source: null };
  } catch (error) {
    console.error(`  ⚠️ Failed to fetch customer ${customerId}:`, error instanceof Error ? error.message : 'Unknown error');
    return { name: null, source: null };
  }
}

/**
 * Try to find name from recent payments/invoices for a customer
 */
async function fetchNameFromPayments(customerId: string): Promise<{
  name: string | null;
  source: 'invoice_description' | 'charge_billing' | null;
}> {
  try {
    // Try invoices first (most likely to have name in description)
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 5,
    });
    
    for (const invoice of invoices.data) {
      // Check invoice description
      const descName = extractNameFromDescription(invoice.description);
      if (descName) {
        return { name: descName, source: 'invoice_description' };
      }
      
      // Check customer_name on invoice
      if (invoice.customer_name && invoice.customer_name.trim().length > 0) {
        return { name: invoice.customer_name, source: 'invoice_description' };
      }
    }
    
    // Try charges
    const charges = await stripe.charges.list({
      customer: customerId,
      limit: 5,
    });
    
    for (const charge of charges.data) {
      // Check billing_details.name
      if (charge.billing_details?.name && charge.billing_details.name.trim().length > 0) {
        return { name: charge.billing_details.name, source: 'charge_billing' };
      }
      
      // Check description
      const descName = extractNameFromDescription(charge.description);
      if (descName) {
        return { name: descName, source: 'invoice_description' };
      }
    }
    
    return { name: null, source: null };
  } catch (error) {
    console.error(`  ⚠️ Failed to fetch payments for ${customerId}:`, error instanceof Error ? error.message : 'Unknown error');
    return { name: null, source: null };
  }
}

/**
 * Split full name into first/last
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  const lastName = parts.pop() || '';
  const firstName = parts.join(' ');
  return { firstName, lastName };
}

/**
 * Main backfill function
 */
async function backfillUnknownCustomers(): Promise<void> {
  console.log('🔍 Backfill Unknown Customers from Stripe');
  console.log('=========================================');
  console.log(`Mode: ${dryRun ? '🧪 DRY RUN (no changes)' : '⚡ LIVE (will update database)'}`);
  if (clinicId) console.log(`Clinic ID: ${clinicId}`);
  console.log(`Limit: ${limit}`);
  console.log('');
  
  // Find patients with placeholder names
  const whereClause: {
    OR: Array<{
      AND: Array<{ firstName: string } | { lastName: string }>;
    }>;
    stripeCustomerId?: { not: null };
    clinicId?: number;
  } = {
    OR: [
      { AND: [{ firstName: 'Unknown' }, { lastName: 'Customer' }] },
      { AND: [{ firstName: 'Unknown' }, { lastName: 'Unknown' }] },
    ],
    stripeCustomerId: { not: null },
  };
  
  if (clinicId) {
    whereClause.clinicId = clinicId;
  }
  
  const unknownPatients = await prisma.patient.findMany({
    where: whereClause,
    select: {
      id: true,
      patientId: true,
      firstName: true,
      lastName: true,
      email: true,
      stripeCustomerId: true,
      clinicId: true,
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
  
  console.log(`Found ${unknownPatients.length} patients with placeholder names\n`);
  
  if (unknownPatients.length === 0) {
    console.log('✅ No patients need updating');
    return;
  }
  
  const results: UpdateResult[] = [];
  let updated = 0;
  let failed = 0;
  let noNameFound = 0;
  
  for (const patient of unknownPatients) {
    const oldName = `${patient.firstName} ${patient.lastName}`;
    console.log(`Processing: ${patient.patientId} (${patient.email || 'no email'})`);
    
    const result: UpdateResult = {
      patientId: patient.id,
      stripeCustomerId: patient.stripeCustomerId,
      oldName,
      newName: null,
      source: null,
      updated: false,
    };
    
    if (!patient.stripeCustomerId) {
      console.log('  ⚠️ No Stripe customer ID');
      result.error = 'No Stripe customer ID';
      results.push(result);
      noNameFound++;
      continue;
    }
    
    // Try to get name from Stripe Customer
    const customerResult = await fetchStripeCustomerName(patient.stripeCustomerId);
    
    if (customerResult.name) {
      result.newName = customerResult.name;
      result.source = customerResult.source;
    } else {
      // Try payments/invoices
      const paymentResult = await fetchNameFromPayments(patient.stripeCustomerId);
      if (paymentResult.name) {
        result.newName = paymentResult.name;
        result.source = paymentResult.source;
      }
    }
    
    if (result.newName) {
      const { firstName, lastName } = splitName(result.newName);
      console.log(`  ✓ Found name: "${result.newName}" (from ${result.source})`);
      console.log(`    → firstName: "${firstName}", lastName: "${lastName}"`);
      
      if (!dryRun) {
        try {
          await prisma.patient.update({
            where: { id: patient.id },
            data: {
              firstName: firstName || 'Unknown',
              lastName: lastName || 'Customer',
              profileStatus: 'ACTIVE',
              notes: {
                set: `✅ Name backfilled from Stripe (${result.source}) on ${new Date().toISOString()}`
              },
            },
          });
          result.updated = true;
          updated++;
          console.log('  ✅ Updated successfully');
        } catch (error) {
          result.error = error instanceof Error ? error.message : 'Unknown error';
          failed++;
          console.log(`  ❌ Update failed: ${result.error}`);
        }
      } else {
        result.updated = true;
        updated++;
        console.log('  📝 Would update (dry run)');
      }
    } else {
      console.log('  ⚠️ No name found in Stripe');
      result.error = 'No name found in Stripe';
      noNameFound++;
    }
    
    results.push(result);
    console.log('');
    
    // Rate limiting - avoid hitting Stripe API limits
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Summary
  console.log('=========================================');
  console.log('Summary:');
  console.log(`  Total processed: ${unknownPatients.length}`);
  console.log(`  ${dryRun ? 'Would update' : 'Updated'}: ${updated}`);
  console.log(`  No name found: ${noNameFound}`);
  console.log(`  Failed: ${failed}`);
  
  // Show results by source
  const bySource = results.reduce((acc, r) => {
    if (r.source) {
      acc[r.source] = (acc[r.source] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  
  if (Object.keys(bySource).length > 0) {
    console.log('\nNames found by source:');
    Object.entries(bySource).forEach(([source, count]) => {
      console.log(`  ${source}: ${count}`);
    });
  }
  
  if (dryRun) {
    console.log('\n🧪 This was a dry run. Run without --dry-run to apply changes.');
  }
}

// Run the script
backfillUnknownCustomers()
  .then(() => {
    console.log('\n✅ Backfill complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Backfill failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
