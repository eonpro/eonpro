-- AlterTable: Add attribution fields to IntakeFormLink
ALTER TABLE "IntakeFormLink" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "IntakeFormLink" ADD COLUMN "salesRepId" INTEGER;
ALTER TABLE "IntakeFormLink" ADD COLUMN "clinicId" INTEGER;

-- CreateIndex
CREATE INDEX "IntakeFormLink_salesRepId_idx" ON "IntakeFormLink"("salesRepId");
CREATE INDEX "IntakeFormLink_createdById_idx" ON "IntakeFormLink"("createdById");

-- AddForeignKey
ALTER TABLE "IntakeFormLink" ADD CONSTRAINT "IntakeFormLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IntakeFormLink" ADD CONSTRAINT "IntakeFormLink_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IntakeFormLink" ADD CONSTRAINT "IntakeFormLink_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
