-- CreateTable
CREATE TABLE "ProviderLicense" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderLicense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderLicense_providerId_state_key" ON "ProviderLicense"("providerId", "state");

-- CreateIndex
CREATE INDEX "ProviderLicense_providerId_idx" ON "ProviderLicense"("providerId");

-- CreateIndex
CREATE INDEX "ProviderLicense_expiresAt_idx" ON "ProviderLicense"("expiresAt");

-- AddForeignKey
ALTER TABLE "ProviderLicense" ADD CONSTRAINT "ProviderLicense_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
