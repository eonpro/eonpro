-- AlterTable: Add tracking fields to PackagePhoto
ALTER TABLE "PackagePhoto" ADD COLUMN "trackingNumber" TEXT;
ALTER TABLE "PackagePhoto" ADD COLUMN "trackingSource" TEXT;

-- CreateIndex
CREATE INDEX "PackagePhoto_trackingNumber_idx" ON "PackagePhoto"("trackingNumber");
