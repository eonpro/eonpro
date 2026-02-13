import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/seed-eonmeds-products
 *
 * Seeds EONMEDS clinic with their specific medication products and Stripe price IDs.
 * Protected by setup secret.
 */

// EONMEDS Product Catalog with Stripe Price IDs
const EONMEDS_PRODUCTS = [
  // ============== SEMAGLUTIDE ==============
  // 2.5mg/1mL or 2.5mg/2mL
  {
    name: 'Semaglutide 2.5mg/1mL - Monthly',
    shortDescription: 'Semaglutide 2.5mg/1mL or 2.5mg/2mL - 1 Month Recurring',
    category: 'MEDICATION',
    price: 22900, // $229
    billingType: 'RECURRING',
    billingInterval: 'MONTHLY',
    billingIntervalCount: 1,
    stripePriceId: 'price_1S9XKOGzKhM7cZeGkV0VrEVc',
    metadata: { dose: '2.5mg/1mL or 2.5mg/2mL', duration: '1 Month', type: 'default' },
  },
  {
    name: 'Semaglutide 2.5mg/1mL - Single Purchase',
    shortDescription: 'Semaglutide 2.5mg/1mL or 2.5mg/2mL - 1 Month Single',
    category: 'MEDICATION',
    price: 29900, // $299
    billingType: 'ONE_TIME',
    stripePriceId: 'price_1S9XKOGzKhM7cZeGtMz5kzYG',
    metadata: { dose: '2.5mg/1mL or 2.5mg/2mL', duration: '1 Month', type: 'single' },
  },
  {
    name: 'Semaglutide 2.5mg/1mL - 3 Month',
    shortDescription: 'Semaglutide 2.5mg/1mL or 2.5mg/2mL - 3 Month Recurring',
    category: 'MEDICATION',
    price: 54900, // $549
    billingType: 'RECURRING',
    billingInterval: 'QUARTERLY',
    billingIntervalCount: 3,
    stripePriceId: 'price_1S9XKOGzKhM7cZeGlraKvRpX',
    metadata: { dose: '2.5mg/1mL or 2.5mg/2mL', duration: '3 Month', type: 'recurring' },
  },
  {
    name: 'Semaglutide 2.5mg/1mL - 6 Month',
    shortDescription: 'Semaglutide 2.5mg/1mL or 2.5mg/2mL - 6 Month Recurring',
    category: 'MEDICATION',
    price: 99900, // $999
    billingType: 'RECURRING',
    billingInterval: 'SEMI_ANNUAL',
    billingIntervalCount: 6,
    stripePriceId: 'price_1S9XKOGzKhM7cZeGeDXQVFvg',
    metadata: { dose: '2.5mg/1mL or 2.5mg/2mL', duration: '6 Month', type: 'recurring' },
  },

  // 2.5mg/3mL (higher dose)
  {
    name: 'Semaglutide 2.5mg/3mL - Monthly',
    shortDescription: 'Semaglutide 2.5mg/3mL - 1 Month Recurring (dose >1mg/week)',
    category: 'MEDICATION',
    price: 32900, // $329
    billingType: 'RECURRING',
    billingInterval: 'MONTHLY',
    billingIntervalCount: 1,
    stripePriceId: 'price_1SpO1UGzKhM7cZeGeTm4hTXB',
    metadata: { dose: '2.5mg/3mL', duration: '1 Month', note: 'if dose is higher than 1mg/week' },
  },
  {
    name: 'Semaglutide 2.5mg/3mL - Single Purchase',
    shortDescription: 'Semaglutide 2.5mg/3mL - 1 Month Single',
    category: 'MEDICATION',
    price: 37900, // $379
    billingType: 'ONE_TIME',
    stripePriceId: 'price_1SpO3wGzKhM7cZeGlpg5rKpC',
    metadata: { dose: '2.5mg/3mL', duration: '1 Month', type: 'single' },
  },
  {
    name: 'Semaglutide 2.5mg/3mL - 3 Month',
    shortDescription: 'Semaglutide 2.5mg/3mL - 3 Month Recurring',
    category: 'MEDICATION',
    price: 77500, // $775
    billingType: 'RECURRING',
    billingInterval: 'QUARTERLY',
    billingIntervalCount: 3,
    stripePriceId: 'price_1SpOEOGzKhM7cZeGXKKRkMRd',
    metadata: { dose: '2.5mg/3mL', duration: '3 Month', type: 'recurring' },
  },
  {
    name: 'Semaglutide 2.5mg/3mL - 6 Month',
    shortDescription: 'Semaglutide 2.5mg/3mL - 6 Month Recurring',
    category: 'MEDICATION',
    price: 134900, // $1,349
    billingType: 'RECURRING',
    billingInterval: 'SEMI_ANNUAL',
    billingIntervalCount: 6,
    stripePriceId: 'price_1SpOElGzKhM7cZeGebLpFHVL',
    metadata: { dose: '2.5mg/3mL', duration: '6 Month', type: 'recurring' },
  },

  // 2.5mg/4mL (highest dose)
  {
    name: 'Semaglutide 2.5mg/4mL - Monthly',
    shortDescription: 'Semaglutide 2.5mg/4mL - 1 Month Recurring (dose >1.75mg/week)',
    category: 'MEDICATION',
    price: 39900, // $399
    billingType: 'RECURRING',
    billingInterval: 'MONTHLY',
    billingIntervalCount: 1,
    stripePriceId: 'price_1SpOH3GzKhM7cZeGlkhMbhkh',
    metadata: {
      dose: '2.5mg/4mL',
      duration: '1 Month',
      note: 'if dose is higher than 1.75mg/week',
    },
  },
  {
    name: 'Semaglutide 2.5mg/4mL - Single Purchase',
    shortDescription: 'Semaglutide 2.5mg/4mL - 1 Month Single',
    category: 'MEDICATION',
    price: 44900, // $449
    billingType: 'ONE_TIME',
    stripePriceId: 'price_1SpOHKGzKhM7cZeGALl3jQjM',
    metadata: { dose: '2.5mg/4mL', duration: '1 Month', type: 'single' },
  },
  {
    name: 'Semaglutide 2.5mg/4mL - 3 Month',
    shortDescription: 'Semaglutide 2.5mg/4mL - 3 Month Recurring',
    category: 'MEDICATION',
    price: 89900, // $899
    billingType: 'RECURRING',
    billingInterval: 'QUARTERLY',
    billingIntervalCount: 3,
    stripePriceId: 'price_1SpOHXGzKhM7cZeGyQMakaZg',
    metadata: { dose: '2.5mg/4mL', duration: '3 Month', type: 'recurring' },
  },
  {
    name: 'Semaglutide 2.5mg/4mL - 6 Month',
    shortDescription: 'Semaglutide 2.5mg/4mL - 6 Month Recurring',
    category: 'MEDICATION',
    price: 149900, // $1,499
    billingType: 'RECURRING',
    billingInterval: 'SEMI_ANNUAL',
    billingIntervalCount: 6,
    stripePriceId: 'price_1SpOHkGzKhM7cZeGyE7ogS8A',
    metadata: { dose: '2.5mg/4mL', duration: '6 Month', type: 'recurring' },
  },

  // ============== TIRZEPATIDE ==============
  // 10mg/1mL or 10mg/2mL (default)
  {
    name: 'Tirzepatide 10mg/1mL - Monthly',
    shortDescription: 'Tirzepatide 10mg/1mL or 10mg/2mL - 1 Month Recurring (default)',
    category: 'MEDICATION',
    price: 32900, // $329
    billingType: 'RECURRING',
    billingInterval: 'MONTHLY',
    billingIntervalCount: 1,
    stripePriceId: 'price_1S9XT6GzKhM7cZeGYAluSrLk',
    metadata: { dose: '10mg/1mL or 10mg/2mL', duration: '1 Month', type: 'default' },
  },
  {
    name: 'Tirzepatide 10mg/1mL - Single Purchase',
    shortDescription: 'Tirzepatide 10mg/1mL or 10mg/2mL - 1 Month Single',
    category: 'MEDICATION',
    price: 39900, // $399
    billingType: 'ONE_TIME',
    stripePriceId: 'price_1S9XT6GzKhM7cZeGHp6wzVHJ',
    metadata: { dose: '10mg/1mL or 10mg/2mL', duration: '1 Month', type: 'single' },
  },
  {
    name: 'Tirzepatide 10mg/1mL - 3 Month',
    shortDescription: 'Tirzepatide 10mg/1mL or 10mg/2mL - 3 Month Recurring',
    category: 'MEDICATION',
    price: 89900, // $899
    billingType: 'RECURRING',
    billingInterval: 'QUARTERLY',
    billingIntervalCount: 3,
    stripePriceId: 'price_1S9XT6GzKhM7cZeGCpXjW8UI',
    metadata: { dose: '10mg/1mL or 10mg/2mL', duration: '3 Month', type: 'recurring' },
  },
  {
    name: 'Tirzepatide 10mg/1mL - 6 Month',
    shortDescription: 'Tirzepatide 10mg/1mL or 10mg/2mL - 6 Month Recurring',
    category: 'MEDICATION',
    price: 159900, // $1,599
    billingType: 'RECURRING',
    billingInterval: 'SEMI_ANNUAL',
    billingIntervalCount: 6,
    stripePriceId: 'price_1S9XT6GzKhM7cZeGnbOelbb2',
    metadata: { dose: '10mg/1mL or 10mg/2mL', duration: '6 Month', type: 'recurring' },
  },

  // 10mg/3mL (higher dose)
  {
    name: 'Tirzepatide 10mg/3mL - Monthly',
    shortDescription: 'Tirzepatide 10mg/3mL - 1 Month Recurring (dose >5mg/week)',
    category: 'MEDICATION',
    price: 42900, // $429
    billingType: 'RECURRING',
    billingInterval: 'MONTHLY',
    billingIntervalCount: 1,
    stripePriceId: 'price_1SpOVhGzKhM7cZeGKXlbR5zS',
    metadata: { dose: '10mg/3mL', duration: '1 Month', note: 'if dose is higher than 5mg/week' },
  },
  {
    name: 'Tirzepatide 10mg/3mL - Single Purchase',
    shortDescription: 'Tirzepatide 10mg/3mL - 1 Month Single',
    category: 'MEDICATION',
    price: 49900, // $499
    billingType: 'ONE_TIME',
    stripePriceId: 'price_1SpOWfGzKhM7cZeGU6B2b4jL',
    metadata: { dose: '10mg/3mL', duration: '1 Month', type: 'single' },
  },
  {
    name: 'Tirzepatide 10mg/3mL - 3 Month',
    shortDescription: 'Tirzepatide 10mg/3mL - 3 Month Recurring',
    category: 'MEDICATION',
    price: 112500, // $1,125
    billingType: 'RECURRING',
    billingInterval: 'QUARTERLY',
    billingIntervalCount: 3,
    stripePriceId: 'price_1SpOXNGzKhM7cZeGlnMB4car',
    metadata: { dose: '10mg/3mL', duration: '3 Month', type: 'recurring' },
  },
  {
    name: 'Tirzepatide 10mg/3mL - 6 Month',
    shortDescription: 'Tirzepatide 10mg/3mL - 6 Month Recurring',
    category: 'MEDICATION',
    price: 209900, // $2,099
    billingType: 'RECURRING',
    billingInterval: 'SEMI_ANNUAL',
    billingIntervalCount: 6,
    stripePriceId: 'price_1SpOXaGzKhM7cZeGZFe54LJc',
    metadata: { dose: '10mg/3mL', duration: '6 Month', type: 'recurring' },
  },

  // 10mg/4mL
  {
    name: 'Tirzepatide 10mg/4mL - Monthly',
    shortDescription: 'Tirzepatide 10mg/4mL - 1 Month Recurring (dose >7.5mg/week)',
    category: 'MEDICATION',
    price: 49900, // $499
    billingType: 'RECURRING',
    billingInterval: 'MONTHLY',
    billingIntervalCount: 1,
    stripePriceId: 'price_1SpOYbGzKhM7cZeGBOmzf6fN',
    metadata: { dose: '10mg/4mL', duration: '1 Month', note: 'if dose is higher than 7.5mg/week' },
  },
  {
    name: 'Tirzepatide 10mg/4mL - Single Purchase',
    shortDescription: 'Tirzepatide 10mg/4mL - 1 Month Single',
    category: 'MEDICATION',
    price: 59900, // $599
    billingType: 'ONE_TIME',
    stripePriceId: 'price_1SpOYtGzKhM7cZeGpralXDeU',
    metadata: { dose: '10mg/4mL', duration: '1 Month', type: 'single' },
  },
  {
    name: 'Tirzepatide 10mg/4mL - 3 Month',
    shortDescription: 'Tirzepatide 10mg/4mL - 3 Month Recurring',
    category: 'MEDICATION',
    price: 120000, // $1,200
    billingType: 'RECURRING',
    billingInterval: 'QUARTERLY',
    billingIntervalCount: 3,
    stripePriceId: 'price_1SpOZFGzKhM7cZeG3Z5MxcfY',
    metadata: { dose: '10mg/4mL', duration: '3 Month', type: 'recurring' },
  },
  {
    name: 'Tirzepatide 10mg/4mL - 6 Month',
    shortDescription: 'Tirzepatide 10mg/4mL - 6 Month Recurring',
    category: 'MEDICATION',
    price: 219900, // $2,199
    billingType: 'RECURRING',
    billingInterval: 'SEMI_ANNUAL',
    billingIntervalCount: 6,
    stripePriceId: 'price_1SpOZSGzKhM7cZeGSgYaUzYk',
    metadata: { dose: '10mg/4mL', duration: '6 Month', type: 'recurring' },
  },

  // 30mg/2mL (highest dose)
  {
    name: 'Tirzepatide 30mg/2mL - Monthly',
    shortDescription: 'Tirzepatide 30mg/2mL - 1 Month Recurring (dose >10mg/week)',
    category: 'MEDICATION',
    price: 59900, // $599
    billingType: 'RECURRING',
    billingInterval: 'MONTHLY',
    billingIntervalCount: 1,
    stripePriceId: 'price_1SpOclGzKhM7cZeGGXcFNrJU',
    metadata: { dose: '30mg/2mL', duration: '1 Month', note: 'if dose is higher than 10mg/week' },
  },
  {
    name: 'Tirzepatide 30mg/2mL - Single Purchase',
    shortDescription: 'Tirzepatide 30mg/2mL - 1 Month Single',
    category: 'MEDICATION',
    price: 69900, // $699
    billingType: 'ONE_TIME',
    stripePriceId: 'price_1SpOcrGzKhM7cZeGxPYrlWmE',
    metadata: { dose: '30mg/2mL', duration: '1 Month', type: 'single' },
  },
  {
    name: 'Tirzepatide 30mg/2mL - 3 Month',
    shortDescription: 'Tirzepatide 30mg/2mL - 3 Month Recurring',
    category: 'MEDICATION',
    price: 149900, // $1,499
    billingType: 'RECURRING',
    billingInterval: 'QUARTERLY',
    billingIntervalCount: 3,
    stripePriceId: 'price_1SpOd8GzKhM7cZeGWQR4CRZz',
    metadata: { dose: '30mg/2mL', duration: '3 Month', type: 'recurring' },
  },
  {
    name: 'Tirzepatide 30mg/2mL - 6 Month',
    shortDescription: 'Tirzepatide 30mg/2mL - 6 Month Recurring',
    category: 'MEDICATION',
    price: 249900, // $2,499
    billingType: 'RECURRING',
    billingInterval: 'SEMI_ANNUAL',
    billingIntervalCount: 6,
    stripePriceId: 'price_1SpOdiGzKhM7cZeGyMEBemxu',
    metadata: { dose: '30mg/2mL', duration: '6 Month', type: 'recurring' },
  },

  // ============== UPSALES ==============
  {
    name: 'Ondansetron - Nausea Medication',
    shortDescription: 'Ondansetron for nausea management',
    category: 'MEDICATION',
    price: 3999, // $39.99
    billingType: 'ONE_TIME',
    stripePriceId: 'price_1S9dxiGzKhM7cZeGkRO7PxC4',
    metadata: { type: 'upsale', purpose: 'nausea' },
  },
  {
    name: 'L-Carnitine + B-Complex',
    shortDescription: 'Fat Burner supplement',
    category: 'SUPPLEMENT',
    price: 9999, // $99.99
    billingType: 'ONE_TIME',
    stripePriceId: 'price_1S9dyqGzKhM7cZeGYNqYGR55',
    metadata: { type: 'upsale', purpose: 'fat_burner', internalCode: 'STRIPE_PRODUCT_FAT_BURNER' },
  },

  // ============== SHIPPING ==============
  {
    name: 'Next Day Shipping (FedEx/UPS)',
    shortDescription: 'Expedited next-day delivery',
    category: 'SERVICE',
    price: 1500, // $15
    billingType: 'ONE_TIME',
    stripePriceId: 'price_1SpOiHGzKhM7cZeGgAOX6ikc',
    metadata: { type: 'shipping', internalCode: 'STRIPE_SHIPPING_EXPEDITED' },
  },
];

export async function POST(req: NextRequest) {
  try {
    // Verify setup secret
    const setupSecret = req.headers.get('x-setup-secret');
    const configuredSecret =
      process.env.ADMIN_SETUP_SECRET || process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;

    if (!configuredSecret || setupSecret !== configuredSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // First, ensure Product table exists (run migration if needed)
    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "Product" (
          "id" SERIAL PRIMARY KEY,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "clinicId" INTEGER NOT NULL REFERENCES "Clinic"("id") ON DELETE CASCADE,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "shortDescription" TEXT,
          "category" TEXT NOT NULL DEFAULT 'SERVICE',
          "price" INTEGER NOT NULL,
          "currency" TEXT NOT NULL DEFAULT 'usd',
          "billingType" TEXT NOT NULL DEFAULT 'ONE_TIME',
          "billingInterval" TEXT,
          "billingIntervalCount" INTEGER NOT NULL DEFAULT 1,
          "trialDays" INTEGER,
          "stripeProductId" TEXT UNIQUE,
          "stripePriceId" TEXT UNIQUE,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "isVisible" BOOLEAN NOT NULL DEFAULT true,
          "displayOrder" INTEGER NOT NULL DEFAULT 0,
          "trackInventory" BOOLEAN NOT NULL DEFAULT false,
          "inventoryCount" INTEGER,
          "lowStockThreshold" INTEGER,
          "taxable" BOOLEAN NOT NULL DEFAULT false,
          "taxRate" DOUBLE PRECISION,
          "metadata" JSONB,
          "tags" TEXT[]
        )
      `;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Product_clinicId_isActive_idx" ON "Product"("clinicId", "isActive")`;
      logger.info('[SEED PRODUCTS] Product table ensured');
    } catch (tableError: any) {
      // Table might already exist, continue
      logger.info('[SEED PRODUCTS] Product table check:', tableError.message);
    }

    // Find EONMEDS clinic (use select for backwards compatibility)
    const eonmeds = await prisma.clinic.findFirst({
      where: {
        OR: [{ subdomain: 'eonmeds' }, { name: { contains: 'EONMEDS', mode: 'insensitive' } }],
      },
      select: { id: true, name: true, subdomain: true },
    });

    if (!eonmeds) {
      return NextResponse.json({ error: 'EONMEDS clinic not found' }, { status: 404 });
    }

    logger.info(`[SEED PRODUCTS] Seeding products for EONMEDS clinic ID: ${eonmeds.id}`);

    // Delete existing products for EONMEDS (to avoid duplicates) using raw SQL
    await prisma.$executeRaw`DELETE FROM "Product" WHERE "clinicId" = ${eonmeds.id}`;
    logger.info(`[SEED PRODUCTS] Deleted existing products for clinic ${eonmeds.id}`);

    // Create all products using raw SQL
    const createdProducts = [];

    for (const product of EONMEDS_PRODUCTS) {
      const result = await prisma.$executeRaw`
        INSERT INTO "Product" (
          "clinicId", "name", "shortDescription", "category", "price", "currency",
          "billingType", "billingInterval", "billingIntervalCount", "stripePriceId",
          "isActive", "isVisible", "metadata", "createdAt", "updatedAt"
        ) VALUES (
          ${eonmeds.id}, ${product.name}, ${product.shortDescription}, ${product.category},
          ${product.price}, 'usd', ${product.billingType}, ${product.billingInterval || null},
          ${product.billingIntervalCount || 1}, ${product.stripePriceId},
          true, true, ${JSON.stringify(product.metadata)}::jsonb, NOW(), NOW()
        )
      `;
      createdProducts.push({
        name: product.name,
        price: product.price / 100,
        stripePriceId: product.stripePriceId,
        billingType: product.billingType,
      });
    }

    logger.info(`[SEED PRODUCTS] Created ${createdProducts.length} products for EONMEDS`);

    return NextResponse.json({
      success: true,
      clinic: {
        id: eonmeds.id,
        name: eonmeds.name,
      },
      products: {
        created: createdProducts.length,
        items: createdProducts,
      },
    });
  } catch (error: any) {
    logger.error('[SEED PRODUCTS] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to seed products' },
      { status: 500 }
    );
  }
}
