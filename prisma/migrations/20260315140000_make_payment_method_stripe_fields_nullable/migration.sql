-- AlterTable: Make PaymentMethod columns nullable for Stripe-sourced cards.
-- Stripe cards never store raw card data (PCI DSS) so these fields must accept NULL.
-- The Prisma schema already declares them optional but the DB columns were never altered.

ALTER TABLE "PaymentMethod" ALTER COLUMN "encryptedCardNumber" DROP NOT NULL;
ALTER TABLE "PaymentMethod" ALTER COLUMN "expiryMonth" DROP NOT NULL;
ALTER TABLE "PaymentMethod" ALTER COLUMN "expiryYear" DROP NOT NULL;
ALTER TABLE "PaymentMethod" ALTER COLUMN "cardholderName" DROP NOT NULL;
ALTER TABLE "PaymentMethod" ALTER COLUMN "billingZip" DROP NOT NULL;
ALTER TABLE "PaymentMethod" ALTER COLUMN "encryptionKeyId" DROP NOT NULL;
