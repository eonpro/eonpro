/**
 * RUN MIGRATION API
 * =================
 * Runs pending database migrations (admin only)
 * 
 * POST /api/admin/run-migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

// GET endpoint for easy browser access
export async function GET(req: NextRequest) {
  try {
    const authResult = await verifyAuth(req);
    const allowedRoles = ['super_admin', 'admin'];
    if (!authResult.success || !authResult.user || !allowedRoles.includes(authResult.user.role)) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required', yourRole: authResult.user?.role }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const migration = searchParams.get('migration');

    if (!migration) {
      return NextResponse.json({
        message: 'Available migrations',
        migrations: ['phone_otp', 'sms_log', 'product_catalog', 'pricing_system'],
        usage: 'Add ?migration=pricing_system to URL'
      });
    }

    // Run the migration (reuse POST logic)
    const body = { migration };
    return runMigration(body, authResult.user);
  } catch (error: any) {
    logger.error('Migration error', { error: "Operation failed" });
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify admin or super_admin
    const authResult = await verifyAuth(req);
    const allowedRoles = ['super_admin', 'admin'];
    if (!authResult.success || !authResult.user || !allowedRoles.includes(authResult.user.role)) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required', yourRole: authResult.user?.role }, { status: 401 });
    }

    const body = await req.json();
    return runMigration(body, authResult.user);
  } catch (error: any) {
    logger.error('Migration error', { error: "Operation failed" });
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}

async function runMigration(body: any, auth: any) {
  try {
    const { migration } = body;

    // Only allow specific migrations
    if (migration === 'phone_otp') {
      // Create PhoneOtp table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "PhoneOtp" (
          "id" SERIAL PRIMARY KEY,
          "phone" TEXT NOT NULL,
          "code" TEXT NOT NULL,
          "expiresAt" TIMESTAMP(3) NOT NULL,
          "used" BOOLEAN NOT NULL DEFAULT false,
          "usedAt" TIMESTAMP(3),
          "userId" INTEGER,
          "patientId" INTEGER,
          "ipAddress" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "PhoneOtp_phone_code_expiresAt_idx" 
        ON "PhoneOtp"("phone", "code", "expiresAt")
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "PhoneOtp_phone_idx" 
        ON "PhoneOtp"("phone")
      `;

      logger.info('PhoneOtp migration completed');

      return NextResponse.json({
        success: true,
        message: 'PhoneOtp table created successfully',
      });
    }

    if (migration === 'sms_log') {
      // Create SmsLog table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "SmsLog" (
          "id" SERIAL PRIMARY KEY,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "clinicId" INTEGER,
          "patientId" INTEGER,
          "messageSid" TEXT UNIQUE,
          "fromPhone" TEXT NOT NULL,
          "toPhone" TEXT NOT NULL,
          "body" TEXT NOT NULL,
          "direction" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'sent',
          "error" TEXT,
          "metadata" JSONB
        )
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "SmsLog_patientId_createdAt_idx" 
        ON "SmsLog"("patientId", "createdAt")
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "SmsLog_fromPhone_idx" 
        ON "SmsLog"("fromPhone")
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "SmsLog_toPhone_idx" 
        ON "SmsLog"("toPhone")
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "SmsLog_clinicId_idx" 
        ON "SmsLog"("clinicId")
      `;

      logger.info('SmsLog migration completed');

      return NextResponse.json({
        success: true,
        message: 'SmsLog table created successfully',
      });
    }

    if (migration === 'product_catalog') {
      // Create enums
      await prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE "ProductCategory" AS ENUM ('SERVICE', 'MEDICATION', 'SUPPLEMENT', 'LAB_TEST', 'PROCEDURE', 'PACKAGE', 'MEMBERSHIP', 'OTHER');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `;

      await prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE "BillingType" AS ENUM ('ONE_TIME', 'RECURRING');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `;

      await prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE "BillingInterval" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'CUSTOM');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `;

      // Create Product table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "Product" (
          "id" SERIAL PRIMARY KEY,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "clinicId" INTEGER NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "shortDescription" TEXT,
          "category" "ProductCategory" NOT NULL DEFAULT 'SERVICE',
          "price" INTEGER NOT NULL,
          "currency" TEXT NOT NULL DEFAULT 'usd',
          "billingType" "BillingType" NOT NULL DEFAULT 'ONE_TIME',
          "billingInterval" "BillingInterval",
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
          "tags" JSONB,
          CONSTRAINT "Product_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "Product_clinicId_isActive_idx" ON "Product"("clinicId", "isActive")
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "Product_clinicId_category_idx" ON "Product"("clinicId", "category")
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "Product_stripeProductId_idx" ON "Product"("stripeProductId")
      `;

      // Create InvoiceItem table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "InvoiceItem" (
          "id" SERIAL PRIMARY KEY,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "invoiceId" INTEGER NOT NULL,
          "productId" INTEGER,
          "description" TEXT NOT NULL,
          "quantity" INTEGER NOT NULL DEFAULT 1,
          "unitPrice" INTEGER NOT NULL,
          "amount" INTEGER NOT NULL,
          "metadata" JSONB,
          CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE
        )
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId")
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "InvoiceItem_productId_idx" ON "InvoiceItem"("productId")
      `;

      // Add subscription columns to Invoice table
      await prisma.$executeRaw`
        ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "createSubscription" BOOLEAN NOT NULL DEFAULT false
      `;

      await prisma.$executeRaw`
        ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "subscriptionCreated" BOOLEAN NOT NULL DEFAULT false
      `;

      logger.info('Product catalog migration completed');

      return NextResponse.json({
        success: true,
        message: 'Product catalog tables and Invoice columns created successfully',
      });
    }

    if (migration === 'pricing_system') {
      // Create enums for pricing system
      await prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING', 'FREE_TRIAL', 'BUY_X_GET_Y');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `;

      await prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE "DiscountApplyTo" AS ENUM ('ALL_PRODUCTS', 'LIMITED_PRODUCTS', 'LIMITED_CATEGORIES', 'SUBSCRIPTIONS_ONLY', 'ONE_TIME_ONLY');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `;

      await prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE "PromotionType" AS ENUM ('SALE', 'FLASH_SALE', 'SEASONAL', 'CLEARANCE', 'NEW_PATIENT', 'LOYALTY', 'BUNDLE', 'UPGRADE');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `;

      await prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE "PricingRuleType" AS ENUM ('VOLUME_DISCOUNT', 'TIERED_PRICING', 'PATIENT_SEGMENT', 'LOYALTY_DISCOUNT', 'TIME_BASED', 'LOCATION_BASED', 'CUSTOM');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `;

      await prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE "CommissionType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `;

      await prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE "PayoutFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `;

      await prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'CONVERTED', 'ACTIVE', 'CHURNED');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `;

      await prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'CANCELLED');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `;

      // Create DiscountCode table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "DiscountCode" (
          "id" SERIAL PRIMARY KEY,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "clinicId" INTEGER NOT NULL,
          "code" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
          "discountValue" DOUBLE PRECISION NOT NULL,
          "applyTo" "DiscountApplyTo" NOT NULL DEFAULT 'ALL_PRODUCTS',
          "productIds" JSONB,
          "categoryIds" JSONB,
          "excludeProductIds" JSONB,
          "maxUses" INTEGER,
          "maxUsesPerPatient" INTEGER,
          "currentUses" INTEGER NOT NULL DEFAULT 0,
          "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "expiresAt" TIMESTAMP(3),
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "minOrderAmount" INTEGER,
          "minQuantity" INTEGER,
          "firstTimeOnly" BOOLEAN NOT NULL DEFAULT false,
          "applyToFirstPayment" BOOLEAN NOT NULL DEFAULT true,
          "applyToRecurring" BOOLEAN NOT NULL DEFAULT false,
          "recurringDuration" INTEGER,
          "stripeCouponId" TEXT UNIQUE,
          "affiliateId" INTEGER,
          CONSTRAINT "DiscountCode_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE,
          CONSTRAINT "DiscountCode_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Influencer"("id") ON DELETE SET NULL
        )
      `;

      await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "DiscountCode_clinicId_code_key" ON "DiscountCode"("clinicId", "code")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "DiscountCode_clinicId_isActive_idx" ON "DiscountCode"("clinicId", "isActive")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "DiscountCode_code_idx" ON "DiscountCode"("code")`;

      // Create DiscountUsage table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "DiscountUsage" (
          "id" SERIAL PRIMARY KEY,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "discountCodeId" INTEGER NOT NULL,
          "patientId" INTEGER NOT NULL,
          "invoiceId" INTEGER,
          "orderId" INTEGER,
          "amountSaved" INTEGER NOT NULL,
          "orderTotal" INTEGER NOT NULL,
          CONSTRAINT "DiscountUsage_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "DiscountCode"("id") ON DELETE CASCADE,
          CONSTRAINT "DiscountUsage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE
        )
      `;

      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "DiscountUsage_discountCodeId_idx" ON "DiscountUsage"("discountCodeId")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "DiscountUsage_patientId_idx" ON "DiscountUsage"("patientId")`;

      // Create Promotion table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "Promotion" (
          "id" SERIAL PRIMARY KEY,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "clinicId" INTEGER NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "internalNotes" TEXT,
          "promotionType" "PromotionType" NOT NULL DEFAULT 'SALE',
          "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
          "discountValue" DOUBLE PRECISION NOT NULL,
          "applyTo" "DiscountApplyTo" NOT NULL DEFAULT 'ALL_PRODUCTS',
          "productIds" JSONB,
          "categoryIds" JSONB,
          "startsAt" TIMESTAMP(3) NOT NULL,
          "endsAt" TIMESTAMP(3),
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "bannerText" TEXT,
          "bannerColor" TEXT,
          "showOnProducts" BOOLEAN NOT NULL DEFAULT true,
          "showBanner" BOOLEAN NOT NULL DEFAULT false,
          "maxRedemptions" INTEGER,
          "currentRedemptions" INTEGER NOT NULL DEFAULT 0,
          "autoApply" BOOLEAN NOT NULL DEFAULT true,
          "requiresCode" BOOLEAN NOT NULL DEFAULT false,
          "discountCodeId" INTEGER,
          "stripeCouponId" TEXT,
          CONSTRAINT "Promotion_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE
        )
      `;

      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Promotion_clinicId_isActive_idx" ON "Promotion"("clinicId", "isActive")`;

      // Create ProductBundle table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "ProductBundle" (
          "id" SERIAL PRIMARY KEY,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "clinicId" INTEGER NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "shortDescription" TEXT,
          "regularPrice" INTEGER NOT NULL,
          "bundlePrice" INTEGER NOT NULL,
          "savingsAmount" INTEGER NOT NULL,
          "savingsPercent" DOUBLE PRECISION NOT NULL,
          "billingType" "BillingType" NOT NULL DEFAULT 'ONE_TIME',
          "billingInterval" "BillingInterval",
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "isVisible" BOOLEAN NOT NULL DEFAULT true,
          "displayOrder" INTEGER NOT NULL DEFAULT 0,
          "stripeProductId" TEXT UNIQUE,
          "stripePriceId" TEXT UNIQUE,
          "maxPurchases" INTEGER,
          "currentPurchases" INTEGER NOT NULL DEFAULT 0,
          "availableFrom" TIMESTAMP(3),
          "availableUntil" TIMESTAMP(3),
          CONSTRAINT "ProductBundle_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE
        )
      `;

      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "ProductBundle_clinicId_isActive_idx" ON "ProductBundle"("clinicId", "isActive")`;

      // Create ProductBundleItem table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "ProductBundleItem" (
          "id" SERIAL PRIMARY KEY,
          "bundleId" INTEGER NOT NULL,
          "productId" INTEGER NOT NULL,
          "quantity" INTEGER NOT NULL DEFAULT 1,
          CONSTRAINT "ProductBundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "ProductBundle"("id") ON DELETE CASCADE,
          CONSTRAINT "ProductBundleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE
        )
      `;

      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "ProductBundleItem_bundleId_idx" ON "ProductBundleItem"("bundleId")`;

      // Create PricingRule table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "PricingRule" (
          "id" SERIAL PRIMARY KEY,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "clinicId" INTEGER NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "priority" INTEGER NOT NULL DEFAULT 0,
          "ruleType" "PricingRuleType" NOT NULL DEFAULT 'VOLUME_DISCOUNT',
          "conditions" JSONB NOT NULL,
          "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
          "discountValue" DOUBLE PRECISION NOT NULL,
          "applyTo" "DiscountApplyTo" NOT NULL DEFAULT 'ALL_PRODUCTS',
          "productIds" JSONB,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "startsAt" TIMESTAMP(3),
          "endsAt" TIMESTAMP(3),
          CONSTRAINT "PricingRule_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE
        )
      `;

      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "PricingRule_clinicId_isActive_idx" ON "PricingRule"("clinicId", "isActive", "priority")`;

      logger.info('Pricing system migration completed');

      return NextResponse.json({
        success: true,
        message: 'Pricing system tables created successfully (DiscountCode, Promotion, ProductBundle, PricingRule)',
      });
    }

    return NextResponse.json(
      { error: 'Unknown migration. Available: phone_otp, sms_log, product_catalog, pricing_system' },
      { status: 400 }
    );

  } catch (error: any) {
    logger.error('Migration error', { error: "Operation failed" });
    return NextResponse.json(
      { error: 'Migration failed' },
      { status: 500 }
    );
  }
}
