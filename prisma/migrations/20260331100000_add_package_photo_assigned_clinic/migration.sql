-- AlterTable
ALTER TABLE "PackagePhoto" ADD COLUMN "assignedClinicId" INTEGER;

-- AddForeignKey
ALTER TABLE "PackagePhoto" ADD CONSTRAINT "PackagePhoto_assignedClinicId_fkey" FOREIGN KEY ("assignedClinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "PackagePhoto_assignedClinicId_idx" ON "PackagePhoto"("assignedClinicId");
