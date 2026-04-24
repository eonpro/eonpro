-- CreateTable: EmailAutomation — per-clinic toggles for patient-facing automations.
-- A row with clinicId = NULL is the platform default that applies when no
-- clinic-scoped override exists.
CREATE TABLE "EmailAutomation" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER,
    "trigger" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "customSubject" TEXT,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EmailAutomation_pkey" PRIMARY KEY ("id")
);

-- The schema declares `@@unique([clinicId, trigger])` for Prisma client typing.
-- Postgres treats NULL as distinct in composite uniques, so that alone would
-- allow multiple "platform default" rows per trigger. We enforce uniqueness
-- via two partial indexes below, matching Prisma's generated constraint name
-- so the client can still use `where: { clinicId_trigger: ... }` helpers.
CREATE UNIQUE INDEX "EmailAutomation_clinicId_trigger_key"
  ON "EmailAutomation"("clinicId", "trigger")
  WHERE "clinicId" IS NOT NULL;

CREATE UNIQUE INDEX "EmailAutomation_trigger_default_key"
  ON "EmailAutomation"("trigger")
  WHERE "clinicId" IS NULL;

-- Secondary lookup index for trigger-scoped queries (admin listings).
CREATE INDEX "EmailAutomation_trigger_idx" ON "EmailAutomation"("trigger");

-- AddForeignKey: clinic relation (ON DELETE SET NULL so orphaned rows fall back
-- to platform defaults rather than disappearing).
ALTER TABLE "EmailAutomation" ADD CONSTRAINT "EmailAutomation_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed platform defaults.
--   PAYMENT_RECEIVED:     email on, SMS OFF (held until legal/compliance signs off on copy).
--   PRESCRIPTION_READY:   email on, SMS on (patient-critical event).
INSERT INTO "EmailAutomation" ("clinicId", "trigger", "enabled", "smsEnabled", "updatedAt")
SELECT NULL, 'payment_received', true, false, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "EmailAutomation" WHERE "clinicId" IS NULL AND "trigger" = 'payment_received'
);

INSERT INTO "EmailAutomation" ("clinicId", "trigger", "enabled", "smsEnabled", "updatedAt")
SELECT NULL, 'prescription_ready', true, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "EmailAutomation" WHERE "clinicId" IS NULL AND "trigger" = 'prescription_ready'
);
