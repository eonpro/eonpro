/**
 * PCI DSS Remediation: Purge stored card data
 *
 * This script nulls out encryptedCardNumber and encryptedCvv columns from the
 * PaymentMethod table. These columns should never have contained raw card data
 * (PCI DSS violation). Going forward, all card handling goes through Stripe
 * Elements and only stripePaymentMethodId + display info (last4, brand) is stored.
 *
 * Run: npx tsx scripts/purge-stored-card-data.ts
 *
 * IMPORTANT: This is a one-way operation. Take a database backup first.
 * After running, verify that all payment methods with stripePaymentMethodId
 * still function correctly via Stripe.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== PCI DSS Card Data Purge ===\n');

  const countWithCardData = await prisma.paymentMethod.count({
    where: {
      OR: [
        { encryptedCardNumber: { not: null } },
        { encryptedCvv: { not: null } },
      ],
    },
  });

  console.log(`Found ${countWithCardData} payment methods with stored card data.`);

  if (countWithCardData === 0) {
    console.log('Nothing to purge. Exiting.');
    return;
  }

  const withoutStripeId = await prisma.paymentMethod.count({
    where: {
      encryptedCardNumber: { not: null },
      stripePaymentMethodId: null,
      isActive: true,
    },
  });

  if (withoutStripeId > 0) {
    console.warn(
      `\n⚠️  WARNING: ${withoutStripeId} active payment methods have stored card data ` +
      `but NO stripePaymentMethodId. These cards will become unusable after purge.` +
      `\nConsider migrating them to Stripe first, or soft-deleting them.\n`
    );
  }

  console.log('\nPurging encryptedCardNumber and encryptedCvv...');

  const result = await prisma.paymentMethod.updateMany({
    where: {
      OR: [
        { encryptedCardNumber: { not: null } },
        { encryptedCvv: { not: null } },
      ],
    },
    data: {
      encryptedCardNumber: null,
      encryptedCvv: null,
    },
  });

  console.log(`✅ Purged card data from ${result.count} payment method records.`);

  const remaining = await prisma.paymentMethod.count({
    where: {
      OR: [
        { encryptedCardNumber: { not: null } },
        { encryptedCvv: { not: null } },
      ],
    },
  });

  console.log(`\nVerification: ${remaining} records still have card data (should be 0).`);
  console.log('\n=== Purge complete ===');
}

main()
  .catch((err) => {
    console.error('Purge failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
