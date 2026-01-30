-- Add leaderboard settings to Affiliate table
ALTER TABLE "Affiliate" ADD COLUMN "leaderboardOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Affiliate" ADD COLUMN "leaderboardAlias" TEXT;

-- Create Competition Metric enum
CREATE TYPE "CompetitionMetric" AS ENUM ('CLICKS', 'CONVERSIONS', 'REVENUE', 'CONVERSION_RATE', 'NEW_CUSTOMERS');

-- Create Competition Status enum
CREATE TYPE "CompetitionStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- Create AffiliateCompetition table
CREATE TABLE "AffiliateCompetition" (
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

-- Create AffiliateCompetitionEntry table
CREATE TABLE "AffiliateCompetitionEntry" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "competitionId" INTEGER NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "currentValue" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,

    CONSTRAINT "AffiliateCompetitionEntry_pkey" PRIMARY KEY ("id")
);

-- Create indexes for AffiliateCompetition
CREATE INDEX "AffiliateCompetition_clinicId_idx" ON "AffiliateCompetition"("clinicId");
CREATE INDEX "AffiliateCompetition_status_idx" ON "AffiliateCompetition"("status");
CREATE INDEX "AffiliateCompetition_startDate_endDate_idx" ON "AffiliateCompetition"("startDate", "endDate");

-- Create indexes for AffiliateCompetitionEntry
CREATE UNIQUE INDEX "AffiliateCompetitionEntry_competitionId_affiliateId_key" ON "AffiliateCompetitionEntry"("competitionId", "affiliateId");
CREATE INDEX "AffiliateCompetitionEntry_competitionId_rank_idx" ON "AffiliateCompetitionEntry"("competitionId", "rank");
CREATE INDEX "AffiliateCompetitionEntry_affiliateId_idx" ON "AffiliateCompetitionEntry"("affiliateId");

-- Add foreign key constraints
ALTER TABLE "AffiliateCompetition" ADD CONSTRAINT "AffiliateCompetition_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AffiliateCompetitionEntry" ADD CONSTRAINT "AffiliateCompetitionEntry_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "AffiliateCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffiliateCompetitionEntry" ADD CONSTRAINT "AffiliateCompetitionEntry_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
