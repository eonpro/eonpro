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
    const auth = await verifyAuth(req);
    const allowedRoles = ['SUPER_ADMIN', 'super_admin', 'ADMIN', 'admin'];
    if (!auth || !allowedRoles.includes(auth.role || '')) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required', yourRole: auth?.role }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const migration = searchParams.get('migration');

    if (!migration) {
      return NextResponse.json({
        message: 'Available migrations',
        migrations: ['phone_otp', 'sms_log', 'product_catalog'],
        usage: 'Add ?migration=product_catalog to URL'
      });
    }

    // Run the migration (reuse POST logic)
    const body = { migration };
    return runMigration(body, auth);
  } catch (error: any) {
    logger.error('Migration error', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify admin or super_admin
    const auth = await verifyAuth(req);
    const allowedRoles = ['SUPER_ADMIN', 'super_admin', 'ADMIN', 'admin'];
    if (!auth || !allowedRoles.includes(auth.role || '')) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required', yourRole: auth?.role }, { status: 401 });
    }

    const body = await req.json();
    return runMigration(body, auth);
  } catch (error: any) {
    logger.error('Migration error', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
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

    return NextResponse.json(
      { error: 'Unknown migration. Available: phone_otp, sms_log, product_catalog' },
      { status: 400 }
    );

  } catch (error: any) {
    logger.error('Migration error', { error: error.message });
    return NextResponse.json(
      { error: error.message || 'Migration failed' },
      { status: 500 }
    );
  }
}
