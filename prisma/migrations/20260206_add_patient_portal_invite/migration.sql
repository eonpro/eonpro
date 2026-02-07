-- CreateTable: Patient-specific portal invite (one-time token for "Send portal invite" and auto-invite)
CREATE TABLE "PatientPortalInvite" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "trigger" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientPortalInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientPortalInvite_tokenHash_key" ON "PatientPortalInvite"("tokenHash");
CREATE INDEX "PatientPortalInvite_patientId_idx" ON "PatientPortalInvite"("patientId");
CREATE INDEX "PatientPortalInvite_tokenHash_idx" ON "PatientPortalInvite"("tokenHash");
CREATE INDEX "PatientPortalInvite_expiresAt_idx" ON "PatientPortalInvite"("expiresAt");

-- AddForeignKey
ALTER TABLE "PatientPortalInvite" ADD CONSTRAINT "PatientPortalInvite_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientPortalInvite" ADD CONSTRAINT "PatientPortalInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
