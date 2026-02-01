-- Migration: Add Sales Rep Role and Patient Assignment
-- Date: 2026-02-01
-- Description: Adds SALES_REP role to UserRole enum and creates PatientSalesRepAssignment table
--              for tracking sales rep patient assignments with full audit history

-- Add SALES_REP to UserRole enum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SALES_REP';

-- Create PatientSalesRepAssignment table
CREATE TABLE IF NOT EXISTS "PatientSalesRepAssignment" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "salesRepId" INTEGER NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" INTEGER,
    "removedAt" TIMESTAMP(3),
    "removedById" INTEGER,
    "removalNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PatientSalesRepAssignment_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraints
ALTER TABLE "PatientSalesRepAssignment" ADD CONSTRAINT "PatientSalesRepAssignment_patientId_fkey" 
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PatientSalesRepAssignment" ADD CONSTRAINT "PatientSalesRepAssignment_salesRepId_fkey" 
    FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientSalesRepAssignment" ADD CONSTRAINT "PatientSalesRepAssignment_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientSalesRepAssignment" ADD CONSTRAINT "PatientSalesRepAssignment_assignedById_fkey" 
    FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PatientSalesRepAssignment" ADD CONSTRAINT "PatientSalesRepAssignment_removedById_fkey" 
    FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "PatientSalesRepAssignment_salesRepId_clinicId_isActive_idx" 
    ON "PatientSalesRepAssignment"("salesRepId", "clinicId", "isActive");

CREATE INDEX IF NOT EXISTS "PatientSalesRepAssignment_patientId_isActive_idx" 
    ON "PatientSalesRepAssignment"("patientId", "isActive");

CREATE INDEX IF NOT EXISTS "PatientSalesRepAssignment_clinicId_idx" 
    ON "PatientSalesRepAssignment"("clinicId");

-- Add comment for documentation
COMMENT ON TABLE "PatientSalesRepAssignment" IS 'Tracks sales representative patient assignments with full audit history for reassignment';
