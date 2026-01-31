-- Add leaderboard settings to Affiliate table (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Affiliate' AND column_name = 'leaderboardOptIn') THEN
        ALTER TABLE "Affiliate" ADD COLUMN "leaderboardOptIn" BOOLEAN NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Affiliate' AND column_name = 'leaderboardAlias') THEN
        ALTER TABLE "Affiliate" ADD COLUMN "leaderboardAlias" TEXT;
    END IF;
END $$;

-- Create Competition Metric enum (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompetitionMetric') THEN
        CREATE TYPE "CompetitionMetric" AS ENUM ('CLICKS', 'CONVERSIONS', 'REVENUE', 'CONVERSION_RATE', 'NEW_CUSTOMERS');
    END IF;
END $$;

-- Create Competition Status enum (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompetitionStatus') THEN
        CREATE TYPE "CompetitionStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');
    END IF;
END $$;

-- Create AffiliateCompetition table (idempotent)
CREATE TABLE IF NOT EXISTS "AffiliateCompetition" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metric" "CompetitionMetric" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "CompetitionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "prizeDescription" TEXT,
    "prizeValueCents" INTEGER,
    "minParticipants" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AffiliateCompetition_pkey" PRIMARY KEY ("id")
);

-- Create AffiliateCompetitionEntry table (idempotent)
CREATE TABLE IF NOT EXISTS "AffiliateCompetitionEntry" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "competitionId" INTEGER NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "currentValue" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,

    CONSTRAINT "AffiliateCompetitionEntry_pkey" PRIMARY KEY ("id")
);

-- Create indexes for AffiliateCompetition (idempotent)
CREATE INDEX IF NOT EXISTS "AffiliateCompetition_clinicId_idx" ON "AffiliateCompetition"("clinicId");
CREATE INDEX IF NOT EXISTS "AffiliateCompetition_status_idx" ON "AffiliateCompetition"("status");
CREATE INDEX IF NOT EXISTS "AffiliateCompetition_startDate_endDate_idx" ON "AffiliateCompetition"("startDate", "endDate");

-- Create indexes for AffiliateCompetitionEntry (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateCompetitionEntry_competitionId_affiliateId_key" ON "AffiliateCompetitionEntry"("competitionId", "affiliateId");
CREATE INDEX IF NOT EXISTS "AffiliateCompetitionEntry_competitionId_rank_idx" ON "AffiliateCompetitionEntry"("competitionId", "rank");
CREATE INDEX IF NOT EXISTS "AffiliateCompetitionEntry_affiliateId_idx" ON "AffiliateCompetitionEntry"("affiliateId");

-- Add foreign key constraints (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'AffiliateCompetition_clinicId_fkey') THEN
        ALTER TABLE "AffiliateCompetition" ADD CONSTRAINT "AffiliateCompetition_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'AffiliateCompetitionEntry_competitionId_fkey') THEN
        ALTER TABLE "AffiliateCompetitionEntry" ADD CONSTRAINT "AffiliateCompetitionEntry_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "AffiliateCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'AffiliateCompetitionEntry_affiliateId_fkey') THEN
        ALTER TABLE "AffiliateCompetitionEntry" ADD CONSTRAINT "AffiliateCompetitionEntry_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
