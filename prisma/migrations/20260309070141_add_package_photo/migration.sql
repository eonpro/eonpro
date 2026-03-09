-- CreateTable
CREATE TABLE "PackagePhoto" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "lifefileId" TEXT NOT NULL,
    "patientId" INTEGER,
    "orderId" INTEGER,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT,
    "contentType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "fileSize" INTEGER,
    "capturedById" INTEGER NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "matchedAt" TIMESTAMP(3),
    "matchStrategy" TEXT,
    "notes" TEXT,

    CONSTRAINT "PackagePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackagePhoto_clinicId_createdAt_idx" ON "PackagePhoto"("clinicId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PackagePhoto_lifefileId_idx" ON "PackagePhoto"("lifefileId");

-- CreateIndex
CREATE INDEX "PackagePhoto_patientId_idx" ON "PackagePhoto"("patientId");

-- CreateIndex
CREATE INDEX "PackagePhoto_capturedById_idx" ON "PackagePhoto"("capturedById");

-- CreateIndex
CREATE INDEX "PackagePhoto_matched_idx" ON "PackagePhoto"("matched");

-- AddForeignKey
ALTER TABLE "PackagePhoto" ADD CONSTRAINT "PackagePhoto_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePhoto" ADD CONSTRAINT "PackagePhoto_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePhoto" ADD CONSTRAINT "PackagePhoto_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePhoto" ADD CONSTRAINT "PackagePhoto_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
