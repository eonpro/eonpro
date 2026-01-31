-- CreateEnum (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProviderStatus') THEN
        CREATE TYPE "ProviderStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'SUSPENDED');
    END IF;
END $$;

-- AlterTable: Add status and archive tracking fields to Provider (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Provider' AND column_name = 'status') THEN
        ALTER TABLE "Provider" ADD COLUMN "status" "ProviderStatus" NOT NULL DEFAULT 'ACTIVE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Provider' AND column_name = 'archivedAt') THEN
        ALTER TABLE "Provider" ADD COLUMN "archivedAt" TIMESTAMP(3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Provider' AND column_name = 'archivedBy') THEN
        ALTER TABLE "Provider" ADD COLUMN "archivedBy" INTEGER;
    END IF;
END $$;

-- CreateIndex: Index on status for efficient filtering (idempotent)
CREATE INDEX IF NOT EXISTS "Provider_status_idx" ON "Provider"("status");
