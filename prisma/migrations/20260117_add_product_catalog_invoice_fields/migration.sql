-- Add new columns to Invoice table for subscription management
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "createSubscription" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "subscriptionCreated" BOOLEAN NOT NULL DEFAULT false;

-- Add InvoiceItem table if not exists
CREATE TABLE IF NOT EXISTS "InvoiceItem" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" INTEGER NOT NULL,
    "productId" INTEGER,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- Create indexes for InvoiceItem
CREATE INDEX IF NOT EXISTS "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");
CREATE INDEX IF NOT EXISTS "InvoiceItem_productId_idx" ON "InvoiceItem"("productId");

-- Add Product table if not exists
CREATE TABLE IF NOT EXISTS "Product" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "sku" TEXT,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "billingType" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "billingInterval" TEXT,
    "billingIntervalCount" INTEGER DEFAULT 1,
    "trialDays" INTEGER,
    "stripePriceId" TEXT,
    "stripeProductId" TEXT,
    "taxCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- Create indexes for Product
CREATE UNIQUE INDEX IF NOT EXISTS "Product_sku_key" ON "Product"("sku");
CREATE INDEX IF NOT EXISTS "Product_clinicId_idx" ON "Product"("clinicId");
CREATE INDEX IF NOT EXISTS "Product_category_idx" ON "Product"("category");
CREATE INDEX IF NOT EXISTS "Product_isActive_idx" ON "Product"("isActive");

-- Add Discount table if not exists
CREATE TABLE IF NOT EXISTS "Discount" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "value" DECIMAL(10,2) NOT NULL,
    "minPurchase" INTEGER,
    "maxDiscount" INTEGER,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "userLimit" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "applicableProducts" JSONB,
    "applicableCategories" JSONB,
    "excludedProducts" JSONB,
    "metadata" JSONB,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- Create indexes for Discount
CREATE UNIQUE INDEX IF NOT EXISTS "Discount_code_key" ON "Discount"("code");
CREATE INDEX IF NOT EXISTS "Discount_clinicId_idx" ON "Discount"("clinicId");
CREATE INDEX IF NOT EXISTS "Discount_isActive_idx" ON "Discount"("isActive");
CREATE INDEX IF NOT EXISTS "Discount_startDate_endDate_idx" ON "Discount"("startDate", "endDate");

-- Add Promotion table if not exists
CREATE TABLE IF NOT EXISTS "Promotion" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "discountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" DECIMAL(10,2) NOT NULL,
    "minQuantity" INTEGER,
    "maxQuantity" INTEGER,
    "buyQuantity" INTEGER,
    "getQuantity" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "applicableProducts" JSONB,
    "applicableCategories" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- Create indexes for Promotion
CREATE INDEX IF NOT EXISTS "Promotion_clinicId_idx" ON "Promotion"("clinicId");
CREATE INDEX IF NOT EXISTS "Promotion_isActive_idx" ON "Promotion"("isActive");
CREATE INDEX IF NOT EXISTS "Promotion_startDate_endDate_idx" ON "Promotion"("startDate", "endDate");

-- Add Bundle table if not exists
CREATE TABLE IF NOT EXISTS "Bundle" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bundlePrice" INTEGER NOT NULL,
    "savingsAmount" INTEGER,
    "savingsPercent" DECIMAL(5,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);

-- Create indexes for Bundle
CREATE INDEX IF NOT EXISTS "Bundle_clinicId_idx" ON "Bundle"("clinicId");
CREATE INDEX IF NOT EXISTS "Bundle_isActive_idx" ON "Bundle"("isActive");

-- Add BundleItem table if not exists
CREATE TABLE IF NOT EXISTS "BundleItem" (
    "id" SERIAL NOT NULL,
    "bundleId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BundleItem_pkey" PRIMARY KEY ("id")
);

-- Create indexes for BundleItem
CREATE INDEX IF NOT EXISTS "BundleItem_bundleId_idx" ON "BundleItem"("bundleId");
CREATE INDEX IF NOT EXISTS "BundleItem_productId_idx" ON "BundleItem"("productId");

-- Add PricingRule table if not exists
CREATE TABLE IF NOT EXISTS "PricingRule" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ruleType" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "adjustmentType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "adjustmentValue" DECIMAL(10,2) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- Create indexes for PricingRule
CREATE INDEX IF NOT EXISTS "PricingRule_clinicId_idx" ON "PricingRule"("clinicId");
CREATE INDEX IF NOT EXISTS "PricingRule_ruleType_idx" ON "PricingRule"("ruleType");
CREATE INDEX IF NOT EXISTS "PricingRule_isActive_idx" ON "PricingRule"("isActive");

-- Add foreign key constraints
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" 
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productId_fkey" 
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Product" ADD CONSTRAINT "Product_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Discount" ADD CONSTRAINT "Discount_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Bundle" ADD CONSTRAINT "Bundle_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_bundleId_fkey" 
    FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_productId_fkey" 
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
